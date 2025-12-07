/**
 * Custom Next.js Server with Socket.io Integration
 *
 * This server starts Next.js and attaches Socket.io for real-time signaling.
 * Required for WebRTC peer connections and room coordination.
 *
 * Part of the Long-Horizon Engineering Protocol - FEAT-411
 */

import { createServer } from "http";
import { parse } from "url";
import next from "next";
import { Server as SocketIOServer } from "socket.io";
import { nanoid } from "nanoid";

// Types for signaling (inline to avoid module resolution in standalone)
interface Peer {
  id: string;
  displayName: string;
  avatarUrl?: string;
  role: "owner" | "moderator" | "participant";
  roomId: string;
  presence: {
    connectionState: string;
    audio: {
      isMuted: boolean;
      isSpeaking: boolean;
      isAddressingAI: boolean;
      audioLevel: number;
    };
    lastActiveAt: Date;
    isIdle: boolean;
  };
  joinedAt: Date;
}

interface PeerSummary {
  id: string;
  displayName: string;
  avatarUrl?: string;
  role: string;
  isMuted: boolean;
  isSpeaking: boolean;
  connectionState: string;
}

interface Room {
  id: string;
  name: string;
  status: "waiting" | "active" | "closed";
  participantCount: number;
  maxParticipants: number;
  createdAt: Date;
}

// In-memory stores
const rooms = new Map<string, Room>();
const roomPeers = new Map<string, Map<string, Peer>>();
const socketToPeer = new Map<string, { peerId: string; roomId: string }>();

// Server configuration
const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOSTNAME || "0.0.0.0";
const port = parseInt(process.env.PORT || "24680", 10);

// CORS origins for Socket.io
const corsOrigins = dev
  ? [
      "http://localhost:3000",
      "http://localhost:24680",
      "http://127.0.0.1:24680",
    ]
  : [
      "https://sync.ference.ai",
      "https://in.ference.ai",
      "http://localhost:24680",
    ];

console.log(`[Server] Starting in ${dev ? "development" : "production"} mode`);
console.log(`[Server] CORS origins: ${corsOrigins.join(", ")}`);

// Initialize Next.js
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

// Helper: Create default peer presence
function createDefaultPresence(): Peer["presence"] {
  return {
    connectionState: "connected",
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

// Helper: Convert Peer to PeerSummary
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

// Helper: Get room by ID
function getRoom(roomId: string): Room | undefined {
  return rooms.get(roomId);
}

// Helper: Create room
function createRoom(roomId: string, name: string): Room {
  const room: Room = {
    id: roomId,
    name: name || `Room ${roomId}`,
    status: "waiting",
    participantCount: 0,
    maxParticipants: 10,
    createdAt: new Date(),
  };
  rooms.set(roomId, room);
  return room;
}

// Helper: Get peer summaries for a room
function getRoomPeerSummaries(roomId: string): PeerSummary[] {
  const peers = roomPeers.get(roomId);
  return peers ? Array.from(peers.values()).map(toPeerSummary) : [];
}

// Helper: Remove peer from room
function removePeerFromRoom(
  io: SocketIOServer,
  socket: any,
  roomId: string,
  peerId: string,
  reason: string,
): void {
  console.log(`[Socket.io] Peer ${peerId} leaving room ${roomId} (${reason})`);

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

  // Update room participant count
  const room = rooms.get(roomId);
  if (room) {
    room.participantCount = Math.max(0, room.participantCount - 1);
  }

  // Leave Socket.io room
  socket.leave(roomId);

  // Emit left event to the peer
  socket.emit("room:left", { roomId, reason });

  // Broadcast peer:left to others
  socket.to(roomId).emit("peer:left", peerId);
}

// Start the server
app
  .prepare()
  .then(() => {
    console.log("[Server] Next.js app prepared successfully");
    // Create HTTP server
    const httpServer = createServer((req, res) => {
      const parsedUrl = parse(req.url || "", true);
      handle(req, res, parsedUrl);
    });

    // Create Socket.io server
    const io = new SocketIOServer(httpServer, {
      cors: {
        origin: corsOrigins,
        methods: ["GET", "POST"],
        credentials: true,
      },
      pingTimeout: 20000,
      pingInterval: 25000,
      transports: ["websocket", "polling"],
    });

    console.log("[Socket.io] Server initialized");

    // Socket.io connection handler
    io.on("connection", (socket) => {
      const peerId = nanoid(12);
      console.log(
        `[Socket.io] Client connected: ${socket.id} (peer: ${peerId})`,
      );

      // Store peer ID on socket data
      (socket as any).peerId = peerId;

      // ============================================================
      // ROOM EVENTS
      // ============================================================

      // Handle room:join
      socket.on("room:join", (payload, callback) => {
        const { roomId, displayName, avatarUrl } = payload;
        console.log(
          `[Socket.io] Peer ${peerId} joining room ${roomId} as "${displayName}"`,
        );

        // Get or create room (auto-create for testing convenience)
        let room = getRoom(roomId);
        if (!room) {
          room = createRoom(roomId, `Room ${roomId}`);
          console.log(`[Socket.io] Auto-created room ${roomId}`);
        }

        // Check room capacity
        if (room.participantCount >= room.maxParticipants) {
          callback({ roomId, code: "ROOM_FULL", message: "Room is full" });
          return;
        }

        // Check room status
        if (room.status === "closed") {
          callback({ roomId, code: "ROOM_CLOSED", message: "Room is closed" });
          return;
        }

        // Create peer
        const peer: Peer = {
          id: peerId,
          displayName,
          avatarUrl,
          role: room.participantCount === 0 ? "owner" : "participant",
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

        // Update room participant count and status
        room.participantCount++;
        if (room.status === "waiting" && room.participantCount > 0) {
          room.status = "active";
        }

        // Store room data on socket
        (socket as any).roomId = roomId;
        (socket as any).displayName = displayName;

        // Join Socket.io room
        socket.join(roomId);

        // Get current peers for response (excluding self)
        const existingPeers = getRoomPeerSummaries(roomId).filter(
          (p) => p.id !== peerId,
        );

        // Prepare response
        const response = {
          room,
          localPeer: peer,
          peers: existingPeers,
          aiState: {
            state: "idle",
            stateStartedAt: new Date(),
            queue: { queue: [], totalProcessed: 0, totalExpired: 0 },
            isSessionHealthy: true,
          },
        };

        // Send response to joining peer
        callback(response);

        // Broadcast peer:joined to others in room
        socket.to(roomId).emit("peer:joined", toPeerSummary(peer));

        console.log(
          `[Socket.io] Peer ${peerId} joined room ${roomId}. Total: ${room.participantCount}, Existing peers: ${existingPeers.length}`,
        );
      });

      // Handle room:leave
      socket.on("room:leave", (payload) => {
        const { roomId } = payload;
        removePeerFromRoom(io, socket, roomId, peerId, "left");
      });

      // ============================================================
      // WEBRTC SIGNALING EVENTS
      // ============================================================

      // Handle signal:offer relay
      socket.on("signal:offer", (payload) => {
        const { targetPeerId, sdp } = payload;
        const roomId = (socket as any).roomId;
        if (!roomId) return;

        console.log(
          `[Socket.io] Relaying offer from ${peerId} to ${targetPeerId}`,
        );

        // Find target socket in the room
        const roomSockets = io.sockets.adapter.rooms.get(roomId);
        if (roomSockets) {
          for (const socketId of roomSockets) {
            const targetSocket = io.sockets.sockets.get(socketId);
            if (targetSocket && (targetSocket as any).peerId === targetPeerId) {
              targetSocket.emit("signal:offer", peerId, sdp);
              break;
            }
          }
        }
      });

      // Handle signal:answer relay
      socket.on("signal:answer", (payload) => {
        const { targetPeerId, sdp } = payload;
        const roomId = (socket as any).roomId;
        if (!roomId) return;

        console.log(
          `[Socket.io] Relaying answer from ${peerId} to ${targetPeerId}`,
        );

        const roomSockets = io.sockets.adapter.rooms.get(roomId);
        if (roomSockets) {
          for (const socketId of roomSockets) {
            const targetSocket = io.sockets.sockets.get(socketId);
            if (targetSocket && (targetSocket as any).peerId === targetPeerId) {
              targetSocket.emit("signal:answer", peerId, sdp);
              break;
            }
          }
        }
      });

      // Handle signal:ice relay
      socket.on("signal:ice", (payload) => {
        const { targetPeerId, candidate } = payload;
        const roomId = (socket as any).roomId;
        if (!roomId) return;

        // Find target socket
        const roomSockets = io.sockets.adapter.rooms.get(roomId);
        if (roomSockets) {
          for (const socketId of roomSockets) {
            const targetSocket = io.sockets.sockets.get(socketId);
            if (targetSocket && (targetSocket as any).peerId === targetPeerId) {
              targetSocket.emit("signal:ice", peerId, candidate);
              break;
            }
          }
        }
      });

      // ============================================================
      // PRESENCE EVENTS
      // ============================================================

      // Handle presence:update
      socket.on("presence:update", (payload) => {
        const roomId = (socket as any).roomId;
        if (!roomId) return;

        const peers = roomPeers.get(roomId);
        const peer = peers?.get(peerId);
        if (!peer) return;

        // Update peer presence
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
        socket.to(roomId).emit("presence:update", toPeerSummary(peer));
      });

      // Handle presence:heartbeat
      socket.on("presence:heartbeat", () => {
        const roomId = (socket as any).roomId;
        if (!roomId) return;

        const peers = roomPeers.get(roomId);
        const peer = peers?.get(peerId);
        if (peer) {
          peer.presence.lastActiveAt = new Date();
          peer.presence.isIdle = false;
        }
      });

      // ============================================================
      // AI EVENTS (Placeholders for future implementation)
      // ============================================================

      socket.on("ai:request_turn", (payload, callback) => {
        // TODO: Implement turn queue in FEAT-157
        console.log(`[Socket.io] AI turn request from ${peerId}:`, payload);
        callback(null);
      });

      socket.on("ai:cancel_turn", (payload) => {
        console.log(`[Socket.io] AI turn cancel from ${peerId}:`, payload);
      });

      socket.on("ai:interrupt", (payload) => {
        console.log(`[Socket.io] AI interrupt from ${peerId}:`, payload);
      });

      socket.on("ai:ptt_start", (payload) => {
        console.log(`[Socket.io] PTT start from ${peerId}:`, payload);
      });

      socket.on("ai:ptt_end", (payload) => {
        console.log(`[Socket.io] PTT end from ${peerId}:`, payload);
      });

      // ============================================================
      // DISCONNECT
      // ============================================================

      socket.on("disconnect", (reason) => {
        console.log(
          `[Socket.io] Client disconnected: ${socket.id} (${reason})`,
        );

        const mapping = socketToPeer.get(socket.id);
        if (mapping) {
          removePeerFromRoom(
            io,
            socket,
            mapping.roomId,
            mapping.peerId,
            "disconnected",
          );
        }
      });
    });

    // Start HTTP server
    httpServer.listen(port, hostname, () => {
      console.log(`[Server] Ready on http://${hostname}:${port}`);
      console.log(`[Socket.io] WebSocket server ready`);
      console.log(`[Server] Rooms in memory: ${rooms.size}`);
    });

    httpServer.on("error", (error: NodeJS.ErrnoException) => {
      console.error(`[Server] HTTP server error:`, error.message);
      if (error.code === "EADDRINUSE") {
        console.error(`[Server] Port ${port} is already in use`);
      }
      process.exit(1);
    });
  })
  .catch((error) => {
    console.error("[Server] Failed to prepare Next.js app:", error);
    process.exit(1);
  });
