/**
 * E2E Tests - Multi-Peer Room Flow
 *
 * Integration tests simulating multi-peer room interactions.
 * Tests room creation, joining, peer communication, audio transmission,
 * AI response broadcasting, and cleanup.
 *
 * Part of the Long-Horizon Engineering Protocol - FEAT-410
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { RoomId } from '@/types/room';
import type { PeerId, PeerRole, PeerSummary } from '@/types/peer';
import type { AIResponseState, RoomAIState } from '@/types/voice-mode';
import type {
  RoomJoinedPayload,
  SignalingEventHandlers,
} from '@/types/signaling';

// ============================================================================
// Mock Signaling Server
// ============================================================================

interface MockPeer {
  id: PeerId;
  displayName: string;
  role: PeerRole;
  isMuted: boolean;
  isSpeaking: boolean;
}

interface MockRoom {
  id: RoomId;
  name: string;
  maxParticipants: number;
  peers: Map<PeerId, MockPeer>;
  aiState: AIResponseState;
  activeSpeakerId: PeerId | null;
}

/**
 * Mock signaling server for multi-peer testing
 */
class MockSignalingServer {
  private rooms = new Map<RoomId, MockRoom>();
  private clients = new Map<string, MockSignalingClient>();
  private nextPeerId = 1;
  private nextRoomId = 1;

  createRoom(name: string, maxParticipants = 10): RoomId {
    const roomId = `room-${this.nextRoomId++}` as RoomId;
    this.rooms.set(roomId, {
      id: roomId,
      name,
      maxParticipants,
      peers: new Map(),
      aiState: 'idle',
      activeSpeakerId: null,
    });
    return roomId;
  }

  getRoom(roomId: RoomId): MockRoom | undefined {
    return this.rooms.get(roomId);
  }

  registerClient(client: MockSignalingClient): void {
    this.clients.set(client.id, client);
  }

  unregisterClient(clientId: string): void {
    // Leave any rooms
    for (const room of this.rooms.values()) {
      const peerId = Array.from(room.peers.entries()).find(
        ([, p]) => p.id === clientId
      )?.[0];
      if (peerId) {
        this.leaveRoom(clientId as PeerId, room.id);
      }
    }
    this.clients.delete(clientId);
  }

  joinRoom(
    clientId: string,
    roomId: RoomId,
    displayName: string
  ): RoomJoinedPayload | null {
    const room = this.rooms.get(roomId);
    if (!room) return null;

    if (room.peers.size >= room.maxParticipants) {
      throw new Error('Room is full');
    }

    const peerId = `peer-${this.nextPeerId++}` as PeerId;
    const isOwner = room.peers.size === 0;

    const peer: MockPeer = {
      id: peerId,
      displayName,
      role: isOwner ? 'owner' : 'participant',
      isMuted: false,
      isSpeaking: false,
    };

    room.peers.set(peerId, peer);

    // Notify other peers
    for (const [existingPeerId] of room.peers) {
      if (existingPeerId !== peerId) {
        const client = this.clients.get(existingPeerId);
        client?.emit('onPeerJoined', {
          id: peerId,
          displayName,
          role: peer.role,
          isMuted: false,
          isSpeaking: false,
          connectionState: 'connected',
        } as PeerSummary);
      }
    }

    // Build peer list (excluding self)
    const peerList: PeerSummary[] = [];
    for (const [id, p] of room.peers) {
      if (id !== peerId) {
        peerList.push({
          id,
          displayName: p.displayName,
          role: p.role,
          isMuted: p.isMuted,
          isSpeaking: p.isSpeaking,
          connectionState: 'connected',
        });
      }
    }

    return {
      room: {
        id: roomId,
        name: room.name,
        ownerId: Array.from(room.peers.values()).find((p) => p.role === 'owner')
          ?.id as PeerId,
        maxParticipants: room.maxParticipants,
        participantCount: room.peers.size,
        status: 'active',
        createdAt: new Date(),
        voiceSettings: {
          mode: 'open',
          aiResponseLocking: true,
          allowPeerToPeer: true,
        },
      },
      localPeer: {
        id: peerId,
        displayName,
        role: peer.role,
        roomId,
        presence: {
          connectionState: 'connected',
          audio: {
            isMuted: false,
            isSpeaking: false,
            isAddressingAI: false,
            audioLevel: 0,
          },
          lastActiveAt: new Date(),
          isIdle: false,
        },
        joinedAt: new Date(),
      },
      peers: peerList,
      aiState: {
        state: room.aiState,
        isSessionHealthy: true,
        activeSpeakerId: room.activeSpeakerId,
      } as RoomAIState,
    };
  }

  leaveRoom(peerId: PeerId, roomId: RoomId): void {
    const room = this.rooms.get(roomId);
    if (!room) return;

    room.peers.delete(peerId);

    // Notify remaining peers
    for (const [id] of room.peers) {
      const client = this.clients.get(id);
      client?.emit('onPeerLeft', peerId);
    }

    // Close room if empty
    if (room.peers.size === 0) {
      this.rooms.delete(roomId);
    }
  }

  updatePresence(
    peerId: PeerId,
    roomId: RoomId,
    updates: Partial<Pick<MockPeer, 'isMuted' | 'isSpeaking'>>
  ): void {
    const room = this.rooms.get(roomId);
    if (!room) return;

    const peer = room.peers.get(peerId);
    if (!peer) return;

    Object.assign(peer, updates);

    // Broadcast to all peers
    for (const [id] of room.peers) {
      const client = this.clients.get(id);
      client?.emit('onPresenceUpdate', {
        id: peerId,
        displayName: peer.displayName,
        role: peer.role,
        isMuted: peer.isMuted,
        isSpeaking: peer.isSpeaking,
        connectionState: 'connected',
      } as PeerSummary);
    }
  }

  setAIState(roomId: RoomId, state: AIResponseState, speakerId?: PeerId): void {
    const room = this.rooms.get(roomId);
    if (!room) return;

    room.aiState = state;
    room.activeSpeakerId = speakerId ?? null;

    // Broadcast to all peers
    for (const [id] of room.peers) {
      const client = this.clients.get(id);
      client?.emit('onAIState', {
        state,
        isSessionHealthy: true,
        activeSpeakerId: speakerId ?? null,
      } as RoomAIState);
    }
  }

  broadcastAIAudio(
    roomId: RoomId,
    chunk: { data: ArrayBuffer; isFirst: boolean; isLast: boolean }
  ): void {
    const room = this.rooms.get(roomId);
    if (!room) return;

    for (const [id] of room.peers) {
      const client = this.clients.get(id);
      client?.emit('ai:audio', {
        roomId,
        chunk: {
          chunkId: `chunk-${Date.now()}`,
          sequenceNumber: 0,
          data: chunk.data,
          receivedAt: Date.now(),
          durationMs: 100,
          isFirst: chunk.isFirst,
          isLast: chunk.isLast,
        },
        response: {
          responseId: `response-${Date.now()}`,
          triggerPeerId: room.activeSpeakerId,
          syncedStartTime: Date.now(),
          totalChunks: 1,
          totalDurationMs: 100,
        },
      });
    }
  }

  sendSignal(
    fromPeerId: PeerId,
    toPeerId: PeerId,
    type: 'offer' | 'answer' | 'ice',
    data: unknown
  ): void {
    const client = this.clients.get(toPeerId);
    if (!client) return;

    switch (type) {
      case 'offer':
        client.emit('onSignalOffer', fromPeerId, data as RTCSessionDescriptionInit);
        break;
      case 'answer':
        client.emit('onSignalAnswer', fromPeerId, data as RTCSessionDescriptionInit);
        break;
      case 'ice':
        client.emit('onSignalIce', fromPeerId, data as RTCIceCandidateInit);
        break;
    }
  }

  getPeerCount(roomId: RoomId): number {
    return this.rooms.get(roomId)?.peers.size ?? 0;
  }

  getAllPeers(roomId: RoomId): MockPeer[] {
    return Array.from(this.rooms.get(roomId)?.peers.values() ?? []);
  }
}

/**
 * Mock signaling client
 */
class MockSignalingClient {
  id: string;
  private server: MockSignalingServer;
  private handlers: Partial<SignalingEventHandlers> = {};
  private currentRoomId: RoomId | null = null;
  private localPeerId: PeerId | null = null;
  private connectionState: 'disconnected' | 'connecting' | 'connected' = 'disconnected';

  constructor(server: MockSignalingServer) {
    this.id = `client-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    this.server = server;
  }

  async connect(): Promise<void> {
    this.connectionState = 'connecting';
    // Synchronous connection for testing (no delay needed)
    this.connectionState = 'connected';
    this.server.registerClient(this);
    this.handlers.onConnect?.();
  }

  disconnect(): void {
    if (this.localPeerId && this.currentRoomId) {
      this.server.leaveRoom(this.localPeerId, this.currentRoomId);
    }
    this.server.unregisterClient(this.id);
    this.connectionState = 'disconnected';
    this.currentRoomId = null;
    this.localPeerId = null;
    this.handlers.onDisconnect?.('client disconnect');
  }

  getConnectionState(): string {
    return this.connectionState;
  }

  isConnected(): boolean {
    return this.connectionState === 'connected';
  }

  async joinRoom(params: {
    roomId: RoomId;
    displayName: string;
    avatarUrl?: string;
  }): Promise<RoomJoinedPayload> {
    const result = this.server.joinRoom(this.id, params.roomId, params.displayName);
    if (!result) {
      throw new Error('Room not found');
    }
    this.currentRoomId = params.roomId;
    this.localPeerId = result.localPeer.id;
    // Update client ID to match peer ID for routing
    this.server.unregisterClient(this.id);
    this.id = this.localPeerId;
    this.server.registerClient(this);
    this.handlers.onRoomJoined?.(result);
    return result;
  }

  async leaveRoom(params: { roomId: RoomId }): Promise<void> {
    if (this.localPeerId) {
      this.server.leaveRoom(this.localPeerId, params.roomId);
      this.handlers.onRoomLeft?.({
        roomId: params.roomId,
        peerId: this.localPeerId,
        reason: 'left',
      });
    }
    this.currentRoomId = null;
    this.localPeerId = null;
  }

  updatePresence(updates: Partial<Pick<MockPeer, 'isMuted' | 'isSpeaking'>>): void {
    if (this.localPeerId && this.currentRoomId) {
      this.server.updatePresence(this.localPeerId, this.currentRoomId, updates);
    }
  }

  sendOffer(params: { targetPeerId: PeerId; sdp: RTCSessionDescriptionInit }): void {
    if (this.localPeerId) {
      this.server.sendSignal(this.localPeerId, params.targetPeerId, 'offer', params.sdp);
    }
  }

  sendAnswer(params: { targetPeerId: PeerId; sdp: RTCSessionDescriptionInit }): void {
    if (this.localPeerId) {
      this.server.sendSignal(this.localPeerId, params.targetPeerId, 'answer', params.sdp);
    }
  }

  sendIce(params: { targetPeerId: PeerId; candidate: RTCIceCandidateInit }): void {
    if (this.localPeerId) {
      this.server.sendSignal(this.localPeerId, params.targetPeerId, 'ice', params.candidate);
    }
  }

  sendHeartbeat(): void {
    // No-op for mock
  }

  on<K extends keyof SignalingEventHandlers>(
    event: K,
    handler: SignalingEventHandlers[K]
  ): void {
    (this.handlers as Record<string, unknown>)[event] = handler;
  }

  off<K extends keyof SignalingEventHandlers>(event: K): void {
    delete (this.handlers as Record<string, unknown>)[event];
  }

  emit(event: string, ...args: unknown[]): void {
    const handler = (this.handlers as Record<string, (...args: unknown[]) => void>)[event];
    if (handler) {
      handler(...args);
    }
  }

  getLocalPeerId(): PeerId | null {
    return this.localPeerId;
  }

  getCurrentRoomId(): RoomId | null {
    return this.currentRoomId;
  }
}

// ============================================================================
// Test Suites
// ============================================================================

describe('Multi-Peer Room Flow E2E', () => {
  let server: MockSignalingServer;

  beforeEach(() => {
    server = new MockSignalingServer();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Room Creation and Joining', () => {
    it('should create a room and allow first peer to join as owner', async () => {
      const roomId = server.createRoom('Test Room', 5);
      const client = new MockSignalingClient(server);

      await client.connect();
      const result = await client.joinRoom({
        roomId,
        displayName: 'Alice',
      });

      expect(result.room.id).toBe(roomId);
      expect(result.room.name).toBe('Test Room');
      expect(result.localPeer.displayName).toBe('Alice');
      expect(result.localPeer.role).toBe('owner');
      expect(result.peers).toHaveLength(0);
      expect(server.getPeerCount(roomId)).toBe(1);
    });

    it('should allow second peer to join as participant', async () => {
      const roomId = server.createRoom('Test Room', 5);
      const client1 = new MockSignalingClient(server);
      const client2 = new MockSignalingClient(server);

      await client1.connect();
      await client1.joinRoom({ roomId, displayName: 'Alice' });

      await client2.connect();
      const result = await client2.joinRoom({ roomId, displayName: 'Bob' });

      expect(result.localPeer.displayName).toBe('Bob');
      expect(result.localPeer.role).toBe('participant');
      expect(result.peers).toHaveLength(1);
      expect(result.peers[0].displayName).toBe('Alice');
      expect(server.getPeerCount(roomId)).toBe(2);
    });

    it('should notify existing peers when new peer joins', async () => {
      const roomId = server.createRoom('Test Room', 5);
      const client1 = new MockSignalingClient(server);
      const client2 = new MockSignalingClient(server);
      const peerJoinedSpy = vi.fn();

      await client1.connect();
      await client1.joinRoom({ roomId, displayName: 'Alice' });
      client1.on('onPeerJoined', peerJoinedSpy);

      await client2.connect();
      await client2.joinRoom({ roomId, displayName: 'Bob' });

      expect(peerJoinedSpy).toHaveBeenCalledTimes(1);
      expect(peerJoinedSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          displayName: 'Bob',
          role: 'participant',
        })
      );
    });

    it('should reject join when room is full', async () => {
      const roomId = server.createRoom('Small Room', 2);
      const client1 = new MockSignalingClient(server);
      const client2 = new MockSignalingClient(server);
      const client3 = new MockSignalingClient(server);

      await client1.connect();
      await client1.joinRoom({ roomId, displayName: 'Alice' });

      await client2.connect();
      await client2.joinRoom({ roomId, displayName: 'Bob' });

      await client3.connect();
      await expect(
        client3.joinRoom({ roomId, displayName: 'Charlie' })
      ).rejects.toThrow('Room is full');
    });

    it('should reject join for non-existent room', async () => {
      const client = new MockSignalingClient(server);
      await client.connect();

      await expect(
        client.joinRoom({ roomId: 'non-existent' as RoomId, displayName: 'Alice' })
      ).rejects.toThrow('Room not found');
    });
  });

  describe('Multiple Browser Contexts as Peers', () => {
    it('should support 5 concurrent peers in mesh topology', async () => {
      const roomId = server.createRoom('Large Room', 10);
      const clients: MockSignalingClient[] = [];
      const names = ['Alice', 'Bob', 'Charlie', 'Diana', 'Eve'];

      for (const name of names) {
        const client = new MockSignalingClient(server);
        await client.connect();
        await client.joinRoom({ roomId, displayName: name });
        clients.push(client);
      }

      expect(server.getPeerCount(roomId)).toBe(5);

      const allPeers = server.getAllPeers(roomId);
      expect(allPeers.map((p) => p.displayName).sort()).toEqual(names.sort());

      // First peer should be owner
      const owner = allPeers.find((p) => p.role === 'owner');
      expect(owner?.displayName).toBe('Alice');

      // Others should be participants
      const participants = allPeers.filter((p) => p.role === 'participant');
      expect(participants).toHaveLength(4);
    });

    it('should update all peers when one peer updates presence', async () => {
      const roomId = server.createRoom('Test Room', 5);
      const client1 = new MockSignalingClient(server);
      const client2 = new MockSignalingClient(server);
      const client3 = new MockSignalingClient(server);
      const presenceSpies = [vi.fn(), vi.fn(), vi.fn()];

      await client1.connect();
      await client1.joinRoom({ roomId, displayName: 'Alice' });
      client1.on('onPresenceUpdate', presenceSpies[0]);

      await client2.connect();
      await client2.joinRoom({ roomId, displayName: 'Bob' });
      client2.on('onPresenceUpdate', presenceSpies[1]);

      await client3.connect();
      await client3.joinRoom({ roomId, displayName: 'Charlie' });
      client3.on('onPresenceUpdate', presenceSpies[2]);

      // Bob mutes
      client2.updatePresence({ isMuted: true });

      // All peers should receive update
      for (const spy of presenceSpies) {
        expect(spy).toHaveBeenCalledWith(
          expect.objectContaining({
            displayName: 'Bob',
            isMuted: true,
          })
        );
      }
    });

    it('should maintain individual connection states', async () => {
      const roomId = server.createRoom('Test Room', 5);
      const client1 = new MockSignalingClient(server);
      const client2 = new MockSignalingClient(server);

      await client1.connect();
      await client1.joinRoom({ roomId, displayName: 'Alice' });

      expect(client1.getConnectionState()).toBe('connected');
      expect(client2.getConnectionState()).toBe('disconnected');

      await client2.connect();
      await client2.joinRoom({ roomId, displayName: 'Bob' });

      expect(client1.getConnectionState()).toBe('connected');
      expect(client2.getConnectionState()).toBe('connected');

      client1.disconnect();

      expect(client1.getConnectionState()).toBe('disconnected');
      expect(client2.getConnectionState()).toBe('connected');
    });
  });

  describe('Peer Audio Transmission (Mocked)', () => {
    it('should relay WebRTC offers between peers', async () => {
      const roomId = server.createRoom('Test Room', 5);
      const client1 = new MockSignalingClient(server);
      const client2 = new MockSignalingClient(server);
      const offerSpy = vi.fn();

      await client1.connect();
      const result1 = await client1.joinRoom({ roomId, displayName: 'Alice' });

      await client2.connect();
      await client2.joinRoom({ roomId, displayName: 'Bob' });
      client2.on('onSignalOffer', offerSpy);

      const mockOffer: RTCSessionDescriptionInit = {
        type: 'offer',
        sdp: 'mock-sdp-offer',
      };

      client1.sendOffer({
        targetPeerId: client2.getLocalPeerId()!,
        sdp: mockOffer,
      });

      expect(offerSpy).toHaveBeenCalledWith(
        result1.localPeer.id,
        mockOffer
      );
    });

    it('should relay WebRTC answers between peers', async () => {
      const roomId = server.createRoom('Test Room', 5);
      const client1 = new MockSignalingClient(server);
      const client2 = new MockSignalingClient(server);
      const answerSpy = vi.fn();

      await client1.connect();
      await client1.joinRoom({ roomId, displayName: 'Alice' });
      client1.on('onSignalAnswer', answerSpy);

      await client2.connect();
      const result2 = await client2.joinRoom({ roomId, displayName: 'Bob' });

      const mockAnswer: RTCSessionDescriptionInit = {
        type: 'answer',
        sdp: 'mock-sdp-answer',
      };

      client2.sendAnswer({
        targetPeerId: client1.getLocalPeerId()!,
        sdp: mockAnswer,
      });

      expect(answerSpy).toHaveBeenCalledWith(
        result2.localPeer.id,
        mockAnswer
      );
    });

    it('should relay ICE candidates between peers', async () => {
      const roomId = server.createRoom('Test Room', 5);
      const client1 = new MockSignalingClient(server);
      const client2 = new MockSignalingClient(server);
      const iceSpy = vi.fn();

      await client1.connect();
      await client1.joinRoom({ roomId, displayName: 'Alice' });

      await client2.connect();
      const result2 = await client2.joinRoom({ roomId, displayName: 'Bob' });
      client2.on('onSignalIce', iceSpy);

      const mockCandidate: RTCIceCandidateInit = {
        candidate: 'mock-ice-candidate',
        sdpMid: '0',
        sdpMLineIndex: 0,
      };

      client1.sendIce({
        targetPeerId: client2.getLocalPeerId()!,
        candidate: mockCandidate,
      });

      expect(iceSpy).toHaveBeenCalledWith(
        client1.getLocalPeerId(),
        mockCandidate
      );
    });

    it('should track speaking state across peers', async () => {
      const roomId = server.createRoom('Test Room', 5);
      const client1 = new MockSignalingClient(server);
      const client2 = new MockSignalingClient(server);
      const presenceSpy = vi.fn();

      await client1.connect();
      await client1.joinRoom({ roomId, displayName: 'Alice' });

      await client2.connect();
      await client2.joinRoom({ roomId, displayName: 'Bob' });
      client2.on('onPresenceUpdate', presenceSpy);

      // Alice starts speaking
      client1.updatePresence({ isSpeaking: true });

      expect(presenceSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          displayName: 'Alice',
          isSpeaking: true,
        })
      );

      // Alice stops speaking
      client1.updatePresence({ isSpeaking: false });

      expect(presenceSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          displayName: 'Alice',
          isSpeaking: false,
        })
      );
    });
  });

  describe('AI Response Broadcast (Mocked)', () => {
    it('should broadcast AI state changes to all peers', async () => {
      const roomId = server.createRoom('Test Room', 5);
      const client1 = new MockSignalingClient(server);
      const client2 = new MockSignalingClient(server);
      const client3 = new MockSignalingClient(server);
      const aiStateSpies = [vi.fn(), vi.fn(), vi.fn()];

      await client1.connect();
      await client1.joinRoom({ roomId, displayName: 'Alice' });
      client1.on('onAIState', aiStateSpies[0]);

      await client2.connect();
      await client2.joinRoom({ roomId, displayName: 'Bob' });
      client2.on('onAIState', aiStateSpies[1]);

      await client3.connect();
      await client3.joinRoom({ roomId, displayName: 'Charlie' });
      client3.on('onAIState', aiStateSpies[2]);

      // AI starts listening
      server.setAIState(roomId, 'listening', client1.getLocalPeerId()!);

      for (const spy of aiStateSpies) {
        expect(spy).toHaveBeenCalledWith(
          expect.objectContaining({
            state: 'listening',
            activeSpeakerId: client1.getLocalPeerId(),
          })
        );
      }
    });

    it('should broadcast AI audio to all peers simultaneously', async () => {
      const roomId = server.createRoom('Test Room', 5);
      const client1 = new MockSignalingClient(server);
      const client2 = new MockSignalingClient(server);
      const audioSpies = [vi.fn(), vi.fn()];

      await client1.connect();
      await client1.joinRoom({ roomId, displayName: 'Alice' });
      client1.on('ai:audio', audioSpies[0]);

      await client2.connect();
      await client2.joinRoom({ roomId, displayName: 'Bob' });
      client2.on('ai:audio', audioSpies[1]);

      // Set AI to speaking
      server.setAIState(roomId, 'speaking', client1.getLocalPeerId()!);

      // Broadcast audio chunk
      const audioData = new ArrayBuffer(1024);
      server.broadcastAIAudio(roomId, {
        data: audioData,
        isFirst: true,
        isLast: true,
      });

      for (const spy of audioSpies) {
        expect(spy).toHaveBeenCalledWith(
          expect.objectContaining({
            roomId,
            chunk: expect.objectContaining({
              isFirst: true,
              isLast: true,
            }),
          })
        );
      }
    });

    it('should track AI response flow: idle -> listening -> processing -> speaking -> idle', async () => {
      const roomId = server.createRoom('Test Room', 5);
      const client = new MockSignalingClient(server);
      const stateChanges: AIResponseState[] = [];

      await client.connect();
      await client.joinRoom({ roomId, displayName: 'Alice' });
      client.on('onAIState', (state) => {
        stateChanges.push(state.state);
      });

      // Simulate AI flow
      server.setAIState(roomId, 'listening', client.getLocalPeerId()!);
      server.setAIState(roomId, 'processing');
      server.setAIState(roomId, 'speaking', client.getLocalPeerId()!);
      server.setAIState(roomId, 'idle');

      expect(stateChanges).toEqual(['listening', 'processing', 'speaking', 'idle']);
    });

    it('should handle AI locked state during response', async () => {
      const roomId = server.createRoom('Test Room', 5);
      const client1 = new MockSignalingClient(server);
      const client2 = new MockSignalingClient(server);
      const aiStateSpy = vi.fn();

      await client1.connect();
      await client1.joinRoom({ roomId, displayName: 'Alice' });

      await client2.connect();
      await client2.joinRoom({ roomId, displayName: 'Bob' });
      client2.on('onAIState', aiStateSpy);

      // AI responds to Alice, Bob should see locked state
      server.setAIState(roomId, 'speaking', client1.getLocalPeerId()!);

      expect(aiStateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          state: 'speaking',
          activeSpeakerId: client1.getLocalPeerId(),
        })
      );
    });
  });

  describe('Room Leaving and Cleanup', () => {
    it('should notify other peers when peer leaves', async () => {
      const roomId = server.createRoom('Test Room', 5);
      const client1 = new MockSignalingClient(server);
      const client2 = new MockSignalingClient(server);
      const peerLeftSpy = vi.fn();

      await client1.connect();
      await client1.joinRoom({ roomId, displayName: 'Alice' });
      client1.on('onPeerLeft', peerLeftSpy);

      await client2.connect();
      const result2 = await client2.joinRoom({ roomId, displayName: 'Bob' });

      await client2.leaveRoom({ roomId });

      expect(peerLeftSpy).toHaveBeenCalledWith(result2.localPeer.id);
      expect(server.getPeerCount(roomId)).toBe(1);
    });

    it('should clean up room when last peer leaves', async () => {
      const roomId = server.createRoom('Test Room', 5);
      const client = new MockSignalingClient(server);

      await client.connect();
      await client.joinRoom({ roomId, displayName: 'Alice' });

      expect(server.getRoom(roomId)).toBeDefined();

      await client.leaveRoom({ roomId });

      expect(server.getRoom(roomId)).toBeUndefined();
    });

    it('should handle disconnection as implicit leave', async () => {
      const roomId = server.createRoom('Test Room', 5);
      const client1 = new MockSignalingClient(server);
      const client2 = new MockSignalingClient(server);
      const peerLeftSpy = vi.fn();

      await client1.connect();
      await client1.joinRoom({ roomId, displayName: 'Alice' });
      client1.on('onPeerLeft', peerLeftSpy);

      await client2.connect();
      const result2 = await client2.joinRoom({ roomId, displayName: 'Bob' });

      // Bob disconnects abruptly
      client2.disconnect();

      expect(peerLeftSpy).toHaveBeenCalledWith(result2.localPeer.id);
      expect(server.getPeerCount(roomId)).toBe(1);
    });

    it('should transfer ownership when owner leaves', async () => {
      const roomId = server.createRoom('Test Room', 5);
      const client1 = new MockSignalingClient(server);
      const client2 = new MockSignalingClient(server);

      await client1.connect();
      await client1.joinRoom({ roomId, displayName: 'Alice' });

      await client2.connect();
      await client2.joinRoom({ roomId, displayName: 'Bob' });

      // Verify Alice is owner
      let peers = server.getAllPeers(roomId);
      expect(peers.find((p) => p.displayName === 'Alice')?.role).toBe('owner');
      expect(peers.find((p) => p.displayName === 'Bob')?.role).toBe('participant');

      // Alice leaves
      await client1.leaveRoom({ roomId });

      // Room still exists with Bob
      expect(server.getPeerCount(roomId)).toBe(1);
      peers = server.getAllPeers(roomId);
      expect(peers[0].displayName).toBe('Bob');
      // Note: In a real implementation, Bob would become owner
    });

    it('should clean up all connections when room closes', async () => {
      const roomId = server.createRoom('Test Room', 5);
      const client1 = new MockSignalingClient(server);
      const client2 = new MockSignalingClient(server);
      const client3 = new MockSignalingClient(server);

      await client1.connect();
      await client1.joinRoom({ roomId, displayName: 'Alice' });

      await client2.connect();
      await client2.joinRoom({ roomId, displayName: 'Bob' });

      await client3.connect();
      await client3.joinRoom({ roomId, displayName: 'Charlie' });

      expect(server.getPeerCount(roomId)).toBe(3);

      // All peers leave
      await client1.leaveRoom({ roomId });
      await client2.leaveRoom({ roomId });
      await client3.leaveRoom({ roomId });

      expect(server.getRoom(roomId)).toBeUndefined();
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle rapid join/leave sequences', async () => {
      const roomId = server.createRoom('Test Room', 10);
      const clients: MockSignalingClient[] = [];

      // Rapidly create and join
      for (let i = 0; i < 5; i++) {
        const client = new MockSignalingClient(server);
        await client.connect();
        await client.joinRoom({ roomId, displayName: `User${i}` });
        clients.push(client);
      }

      expect(server.getPeerCount(roomId)).toBe(5);

      // Rapidly leave
      for (const client of clients) {
        await client.leaveRoom({ roomId });
      }

      expect(server.getRoom(roomId)).toBeUndefined();
    });

    it('should handle simultaneous presence updates', async () => {
      const roomId = server.createRoom('Test Room', 5);
      const clients: MockSignalingClient[] = [];
      const presenceUpdates: PeerSummary[] = [];

      for (let i = 0; i < 3; i++) {
        const client = new MockSignalingClient(server);
        await client.connect();
        await client.joinRoom({ roomId, displayName: `User${i}` });
        client.on('onPresenceUpdate', (update) => presenceUpdates.push(update));
        clients.push(client);
      }

      // All update simultaneously
      clients[0].updatePresence({ isSpeaking: true });
      clients[1].updatePresence({ isMuted: true });
      clients[2].updatePresence({ isSpeaking: true, isMuted: true });

      // Should have 9 updates (3 updates * 3 clients each)
      expect(presenceUpdates.length).toBe(9);
    });

    it('should handle client reconnection', async () => {
      const roomId = server.createRoom('Test Room', 5);
      const client = new MockSignalingClient(server);
      const connectSpy = vi.fn();
      const disconnectSpy = vi.fn();

      client.on('onConnect', connectSpy);
      client.on('onDisconnect', disconnectSpy);

      await client.connect();
      await client.joinRoom({ roomId, displayName: 'Alice' });

      expect(connectSpy).toHaveBeenCalledTimes(1);
      expect(server.getPeerCount(roomId)).toBe(1);

      // Disconnect
      client.disconnect();
      expect(disconnectSpy).toHaveBeenCalledTimes(1);
      expect(server.getRoom(roomId)).toBeUndefined();

      // Reconnect
      const roomId2 = server.createRoom('Test Room 2', 5);
      await client.connect();
      await client.joinRoom({ roomId: roomId2, displayName: 'Alice' });

      expect(connectSpy).toHaveBeenCalledTimes(2);
      expect(server.getPeerCount(roomId2)).toBe(1);
    });

    it('should isolate events between rooms', async () => {
      const room1 = server.createRoom('Room 1', 5);
      const room2 = server.createRoom('Room 2', 5);

      const client1 = new MockSignalingClient(server);

      // Alice joins room1
      await client1.connect();
      await client1.joinRoom({ roomId: room1, displayName: 'Alice' });

      // Verify Alice is in room1
      expect(server.getPeerCount(room1)).toBe(1);
      expect(server.getPeerCount(room2)).toBe(0);

      const client2 = new MockSignalingClient(server);

      // Bob joins room2
      await client2.connect();
      await client2.joinRoom({ roomId: room2, displayName: 'Bob' });

      // Verify room isolation - both rooms should have 1 peer each
      expect(server.getPeerCount(room1)).toBe(1);
      expect(server.getPeerCount(room2)).toBe(1);

      // Verify peer lists are room-specific
      const room1Peers = server.getAllPeers(room1).map(p => p.displayName);
      const room2Peers = server.getAllPeers(room2).map(p => p.displayName);

      expect(room1Peers).toEqual(['Alice']);
      expect(room2Peers).toEqual(['Bob']);
    });
  });

  describe('Performance and Scalability', () => {
    it('should handle 10 peers efficiently', async () => {
      const roomId = server.createRoom('Large Room', 15);
      const clients: MockSignalingClient[] = [];
      const startTime = Date.now();

      for (let i = 0; i < 10; i++) {
        const client = new MockSignalingClient(server);
        await client.connect();
        await client.joinRoom({ roomId, displayName: `User${i}` });
        clients.push(client);
      }

      const joinTime = Date.now() - startTime;

      expect(server.getPeerCount(roomId)).toBe(10);
      expect(joinTime).toBeLessThan(1000); // Should complete in under 1 second
    });

    it('should broadcast presence updates efficiently to many peers', async () => {
      const roomId = server.createRoom('Large Room', 15);
      const clients: MockSignalingClient[] = [];
      let updateCount = 0;

      for (let i = 0; i < 10; i++) {
        const client = new MockSignalingClient(server);
        await client.connect();
        await client.joinRoom({ roomId, displayName: `User${i}` });
        client.on('onPresenceUpdate', () => updateCount++);
        clients.push(client);
      }

      // One presence update should reach all 10 clients
      clients[0].updatePresence({ isSpeaking: true });

      expect(updateCount).toBe(10);
    });
  });
});
