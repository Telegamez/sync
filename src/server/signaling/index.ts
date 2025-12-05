/**
 * Socket.io Signaling Server
 *
 * Real-time signaling for WebRTC peer connections and room coordination.
 * Handles room join/leave, WebRTC offer/answer/ICE relay, and presence updates.
 *
 * Part of the Long-Horizon Engineering Protocol - FEAT-104
 */

import { Server as HttpServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { nanoid } from 'nanoid';
import type {
  JoinRoomPayload,
  LeaveRoomPayload,
  SignalOfferPayload,
  SignalAnswerPayload,
  SignalIcePayload,
  PresenceUpdatePayload,
  RoomJoinedPayload,
  RoomLeftPayload,
  RoomErrorPayload,
  SocketConnectionState,
} from '@/types/signaling';
import type { Peer, PeerId, PeerSummary, PeerPresence } from '@/types/peer';
import type { Room, RoomId } from '@/types/room';
import {
  getRoom,
  addParticipant,
  removeParticipant,
  roomExists,
} from '@/server/store/rooms';
import { DEFAULT_VOICE_SETTINGS } from '@/types/voice-mode';

/**
 * Socket data stored per connection
 */
interface SocketData {
  peerId: PeerId;
  displayName: string;
  avatarUrl?: string;
  roomId?: RoomId;
}

/**
 * Extended Socket type with our data
 */
type AppSocket = Socket<
  // Client to server events
  {
    'room:join': (payload: JoinRoomPayload, callback: (response: RoomJoinedPayload | RoomErrorPayload) => void) => void;
    'room:leave': (payload: LeaveRoomPayload) => void;
    'signal:offer': (payload: SignalOfferPayload) => void;
    'signal:answer': (payload: SignalAnswerPayload) => void;
    'signal:ice': (payload: SignalIcePayload) => void;
    'presence:update': (payload: PresenceUpdatePayload) => void;
    'presence:heartbeat': () => void;
  },
  // Server to client events
  {
    'room:joined': (payload: RoomJoinedPayload) => void;
    'room:left': (payload: RoomLeftPayload) => void;
    'room:error': (payload: RoomErrorPayload) => void;
    'room:closed': (roomId: RoomId) => void;
    'peer:joined': (peer: PeerSummary) => void;
    'peer:left': (peerId: PeerId) => void;
    'peer:updated': (peer: PeerSummary) => void;
    'signal:offer': (fromPeerId: PeerId, sdp: RTCSessionDescriptionInit) => void;
    'signal:answer': (fromPeerId: PeerId, sdp: RTCSessionDescriptionInit) => void;
    'signal:ice': (fromPeerId: PeerId, candidate: RTCIceCandidateInit) => void;
    'presence:update': (peer: PeerSummary) => void;
  },
  // Inter-server events (unused)
  Record<string, never>,
  // Socket data
  SocketData
>;

/**
 * In-memory peer tracking per room
 */
const roomPeers = new Map<RoomId, Map<PeerId, Peer>>();

/**
 * Socket ID to peer ID mapping
 */
const socketToPeer = new Map<string, { peerId: PeerId; roomId: RoomId }>();

/**
 * Create default peer presence
 */
function createDefaultPresence(): PeerPresence {
  return {
    connectionState: 'connected',
    audio: {
      isMuted: false,
      isSpeaking: false,
      isAddressingAI: false,
      audioLevel: 0,
    },
    lastActiveAt: new Date(),
    isIdle: false,
  };
}

/**
 * Convert Peer to PeerSummary for broadcasting
 */
function toPeerSummary(peer: Peer): PeerSummary {
  return {
    id: peer.id,
    displayName: peer.displayName,
    avatarUrl: peer.avatarUrl,
    role: peer.role,
    isMuted: peer.presence.audio.isMuted,
    isSpeaking: peer.presence.audio.isSpeaking,
    connectionState: peer.presence.connectionState,
  };
}

/**
 * Get peers in a room
 */
export function getRoomPeers(roomId: RoomId): Peer[] {
  const peers = roomPeers.get(roomId);
  return peers ? Array.from(peers.values()) : [];
}

/**
 * Get peer summaries for a room
 */
export function getRoomPeerSummaries(roomId: RoomId): PeerSummary[] {
  return getRoomPeers(roomId).map(toPeerSummary);
}

/**
 * SignalingServer class
 */
export class SignalingServer {
  private io: SocketIOServer;

  constructor(httpServer: HttpServer, options?: { cors?: { origin: string | string[] } }) {
    this.io = new SocketIOServer(httpServer, {
      cors: options?.cors ?? {
        origin: process.env.NODE_ENV === 'development'
          ? ['http://localhost:3000', 'http://localhost:24680']
          : [],
        methods: ['GET', 'POST'],
      },
      pingTimeout: 20000,
      pingInterval: 25000,
    });

    this.setupHandlers();
  }

  /**
   * Setup socket event handlers
   */
  private setupHandlers(): void {
    this.io.on('connection', (socket: AppSocket) => {
      console.log(`[Signaling] Client connected: ${socket.id}`);

      // Generate peer ID for this connection
      const peerId = nanoid(12);
      socket.data.peerId = peerId;

      // Handle room join
      socket.on('room:join', (payload, callback) => {
        this.handleRoomJoin(socket, payload, callback);
      });

      // Handle room leave
      socket.on('room:leave', (payload) => {
        this.handleRoomLeave(socket, payload);
      });

      // Handle WebRTC signaling
      socket.on('signal:offer', (payload) => {
        this.handleSignalOffer(socket, payload);
      });

      socket.on('signal:answer', (payload) => {
        this.handleSignalAnswer(socket, payload);
      });

      socket.on('signal:ice', (payload) => {
        this.handleSignalIce(socket, payload);
      });

      // Handle presence updates
      socket.on('presence:update', (payload) => {
        this.handlePresenceUpdate(socket, payload);
      });

      socket.on('presence:heartbeat', () => {
        this.handleHeartbeat(socket);
      });

      // Handle disconnect
      socket.on('disconnect', (reason) => {
        this.handleDisconnect(socket, reason);
      });
    });
  }

  /**
   * Handle room join request
   */
  private handleRoomJoin(
    socket: AppSocket,
    payload: JoinRoomPayload,
    callback: (response: RoomJoinedPayload | RoomErrorPayload) => void
  ): void {
    const { roomId, displayName, avatarUrl } = payload;
    const peerId = socket.data.peerId;

    console.log(`[Signaling] Peer ${peerId} joining room ${roomId}`);

    // Validate room exists
    const room = getRoom(roomId);
    if (!room) {
      const error: RoomErrorPayload = {
        roomId,
        code: 'ROOM_NOT_FOUND',
        message: 'Room not found',
      };
      callback(error);
      return;
    }

    // Check room capacity
    if (room.participantCount >= room.maxParticipants) {
      const error: RoomErrorPayload = {
        roomId,
        code: 'ROOM_FULL',
        message: 'Room is full',
      };
      callback(error);
      return;
    }

    // Check room status
    if (room.status === 'closed') {
      const error: RoomErrorPayload = {
        roomId,
        code: 'ROOM_CLOSED',
        message: 'Room is closed',
      };
      callback(error);
      return;
    }

    // Create peer
    const peer: Peer = {
      id: peerId,
      displayName,
      avatarUrl,
      role: room.participantCount === 0 ? 'owner' : 'participant',
      roomId,
      presence: createDefaultPresence(),
      joinedAt: new Date(),
    };

    // Add to room peers tracking
    if (!roomPeers.has(roomId)) {
      roomPeers.set(roomId, new Map());
    }
    roomPeers.get(roomId)!.set(peerId, peer);

    // Track socket -> peer mapping
    socketToPeer.set(socket.id, { peerId, roomId });

    // Add to room store
    addParticipant(roomId, peer);

    // Update socket data
    socket.data.displayName = displayName;
    socket.data.avatarUrl = avatarUrl;
    socket.data.roomId = roomId;

    // Join Socket.io room
    socket.join(roomId);

    // Get current peers for response
    const existingPeers = getRoomPeerSummaries(roomId).filter((p) => p.id !== peerId);

    // Get updated room
    const updatedRoom = getRoom(roomId)!;

    // Prepare response
    const response: RoomJoinedPayload = {
      room: updatedRoom,
      localPeer: peer,
      peers: existingPeers,
      aiState: {
        state: 'idle',
        stateStartedAt: new Date(),
        queue: {
          queue: [],
          totalProcessed: 0,
          totalExpired: 0,
        },
        isSessionHealthy: true,
      },
    };

    // Send response to joining peer
    callback(response);

    // Broadcast peer:joined to others in room
    socket.to(roomId).emit('peer:joined', toPeerSummary(peer));

    console.log(`[Signaling] Peer ${peerId} joined room ${roomId}. Total: ${updatedRoom.participantCount}`);
  }

  /**
   * Handle room leave
   */
  private handleRoomLeave(socket: AppSocket, payload: LeaveRoomPayload): void {
    const { roomId } = payload;
    const peerId = socket.data.peerId;

    this.removePeerFromRoom(socket, roomId, peerId, 'left');
  }

  /**
   * Remove peer from room (used for leave and disconnect)
   */
  private removePeerFromRoom(
    socket: AppSocket,
    roomId: RoomId,
    peerId: PeerId,
    reason: 'left' | 'kicked' | 'room_closed'
  ): void {
    console.log(`[Signaling] Peer ${peerId} leaving room ${roomId} (${reason})`);

    // Remove from room peers tracking
    const peers = roomPeers.get(roomId);
    if (peers) {
      peers.delete(peerId);
      if (peers.size === 0) {
        roomPeers.delete(roomId);
      }
    }

    // Remove socket -> peer mapping
    socketToPeer.delete(socket.id);

    // Remove from room store
    removeParticipant(roomId, peerId);

    // Leave Socket.io room
    socket.leave(roomId);

    // Clear socket data
    socket.data.roomId = undefined;

    // Emit left event to the peer
    socket.emit('room:left', { roomId, reason });

    // Broadcast peer:left to others
    socket.to(roomId).emit('peer:left', peerId);
  }

  /**
   * Handle WebRTC offer relay
   */
  private handleSignalOffer(socket: AppSocket, payload: SignalOfferPayload): void {
    const fromPeerId = socket.data.peerId;
    const { targetPeerId, sdp } = payload;
    const roomId = socket.data.roomId;

    if (!roomId) return;

    // Find target socket
    const targetSocket = this.findSocketByPeerId(roomId, targetPeerId);
    if (targetSocket) {
      targetSocket.emit('signal:offer', fromPeerId, sdp);
    }
  }

  /**
   * Handle WebRTC answer relay
   */
  private handleSignalAnswer(socket: AppSocket, payload: SignalAnswerPayload): void {
    const fromPeerId = socket.data.peerId;
    const { targetPeerId, sdp } = payload;
    const roomId = socket.data.roomId;

    if (!roomId) return;

    const targetSocket = this.findSocketByPeerId(roomId, targetPeerId);
    if (targetSocket) {
      targetSocket.emit('signal:answer', fromPeerId, sdp);
    }
  }

  /**
   * Handle ICE candidate relay
   */
  private handleSignalIce(socket: AppSocket, payload: SignalIcePayload): void {
    const fromPeerId = socket.data.peerId;
    const { targetPeerId, candidate } = payload;
    const roomId = socket.data.roomId;

    if (!roomId) return;

    const targetSocket = this.findSocketByPeerId(roomId, targetPeerId);
    if (targetSocket) {
      targetSocket.emit('signal:ice', fromPeerId, candidate);
    }
  }

  /**
   * Handle presence update
   */
  private handlePresenceUpdate(socket: AppSocket, payload: PresenceUpdatePayload): void {
    const peerId = socket.data.peerId;
    const roomId = socket.data.roomId;

    if (!roomId) return;

    // Update peer presence
    const peers = roomPeers.get(roomId);
    const peer = peers?.get(peerId);
    if (!peer) return;

    if (payload.isMuted !== undefined) {
      peer.presence.audio.isMuted = payload.isMuted;
    }
    if (payload.isSpeaking !== undefined) {
      peer.presence.audio.isSpeaking = payload.isSpeaking;
    }
    if (payload.isAddressingAI !== undefined) {
      peer.presence.audio.isAddressingAI = payload.isAddressingAI;
    }
    if (payload.audioLevel !== undefined) {
      peer.presence.audio.audioLevel = payload.audioLevel;
    }
    peer.presence.lastActiveAt = new Date();

    // Broadcast update to room
    socket.to(roomId).emit('presence:update', toPeerSummary(peer));
  }

  /**
   * Handle heartbeat
   */
  private handleHeartbeat(socket: AppSocket): void {
    const peerId = socket.data.peerId;
    const roomId = socket.data.roomId;

    if (!roomId) return;

    const peers = roomPeers.get(roomId);
    const peer = peers?.get(peerId);
    if (peer) {
      peer.presence.lastActiveAt = new Date();
      peer.presence.isIdle = false;
    }
  }

  /**
   * Handle socket disconnect
   */
  private handleDisconnect(socket: AppSocket, reason: string): void {
    console.log(`[Signaling] Client disconnected: ${socket.id} (${reason})`);

    const mapping = socketToPeer.get(socket.id);
    if (mapping) {
      this.removePeerFromRoom(socket, mapping.roomId, mapping.peerId, 'left');
    }
  }

  /**
   * Find socket by peer ID in a room
   */
  private findSocketByPeerId(roomId: RoomId, peerId: PeerId): AppSocket | undefined {
    const roomSockets = this.io.sockets.adapter.rooms.get(roomId);
    if (!roomSockets) return undefined;

    const socketIds = Array.from(roomSockets);
    for (const socketId of socketIds) {
      const socket = this.io.sockets.sockets.get(socketId) as AppSocket | undefined;
      if (socket?.data.peerId === peerId) {
        return socket;
      }
    }
    return undefined;
  }

  /**
   * Broadcast room closed event
   */
  public broadcastRoomClosed(roomId: RoomId): void {
    this.io.to(roomId).emit('room:closed', roomId);

    // Remove all peers from tracking
    const peers = roomPeers.get(roomId);
    if (peers) {
      const peerIds = Array.from(peers.keys());
      for (const peerId of peerIds) {
        // Find and update socket mapping
        const socketEntries = Array.from(socketToPeer.entries());
        for (const [socketId, mapping] of socketEntries) {
          if (mapping.roomId === roomId && mapping.peerId === peerId) {
            socketToPeer.delete(socketId);
          }
        }
      }
      roomPeers.delete(roomId);
    }
  }

  /**
   * Get IO instance for testing
   */
  public getIO(): SocketIOServer {
    return this.io;
  }

  /**
   * Close the server
   */
  public close(): void {
    this.io.close();
  }
}

/**
 * Create signaling server instance
 */
export function createSignalingServer(
  httpServer: HttpServer,
  options?: { cors?: { origin: string | string[] } }
): SignalingServer {
  return new SignalingServer(httpServer, options);
}
