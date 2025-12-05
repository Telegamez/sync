/**
 * Signaling Server Tests
 *
 * Tests for Socket.io signaling server functionality.
 *
 * Part of the Long-Horizon Engineering Protocol - FEAT-104
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createServer } from 'http';
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';
import { AddressInfo } from 'net';
import {
  SignalingServer,
  createSignalingServer,
  getRoomPeers,
  getRoomPeerSummaries,
} from '@/server/signaling';
import {
  createRoom,
  getRoom,
  clearAllRooms,
} from '@/server/store/rooms';
import type { JoinRoomPayload, RoomJoinedPayload, RoomErrorPayload } from '@/types/signaling';

describe('SignalingServer', () => {
  let httpServer: ReturnType<typeof createServer>;
  let signalingServer: SignalingServer;
  let serverUrl: string;
  let clientSocket: ClientSocket;

  beforeEach(async () => {
    // Clear rooms
    clearAllRooms();

    // Create HTTP server
    httpServer = createServer();

    // Create signaling server
    signalingServer = createSignalingServer(httpServer, {
      cors: { origin: '*' },
    });

    // Start server
    await new Promise<void>((resolve) => {
      httpServer.listen(0, () => {
        const address = httpServer.address() as AddressInfo;
        serverUrl = `http://localhost:${address.port}`;
        resolve();
      });
    });
  });

  afterEach(async () => {
    // Disconnect client
    if (clientSocket?.connected) {
      clientSocket.disconnect();
    }

    // Close servers
    signalingServer.close();
    await new Promise<void>((resolve) => {
      httpServer.close(() => resolve());
    });
  });

  /**
   * Helper to create connected client
   */
  async function createConnectedClient(): Promise<ClientSocket> {
    const socket = ioClient(serverUrl, {
      autoConnect: true,
      transports: ['websocket'],
    });

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Connection timeout')), 5000);
      socket.on('connect', () => {
        clearTimeout(timeout);
        resolve();
      });
      socket.on('connect_error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });

    return socket;
  }

  describe('Connection', () => {
    it('accepts client connections', async () => {
      clientSocket = await createConnectedClient();
      expect(clientSocket.connected).toBe(true);
    });

    it('handles client disconnect gracefully', async () => {
      clientSocket = await createConnectedClient();

      await new Promise<void>((resolve) => {
        clientSocket.on('disconnect', () => {
          resolve();
        });
        clientSocket.disconnect();
      });

      expect(clientSocket.connected).toBe(false);
    });
  });

  describe('Room Join', () => {
    it('allows joining an existing room', async () => {
      // Create room first
      const room = createRoom({ name: 'Test Room', maxParticipants: 4 }, 'owner');

      clientSocket = await createConnectedClient();

      const joinPayload: JoinRoomPayload = {
        roomId: room.id,
        displayName: 'Test User',
      };

      const response = await new Promise<RoomJoinedPayload>((resolve, reject) => {
        clientSocket.emit('room:join', joinPayload, (res: RoomJoinedPayload | RoomErrorPayload) => {
          if ('code' in res) {
            reject(new Error(res.message));
          } else {
            resolve(res);
          }
        });
      });

      expect(response.room.id).toBe(room.id);
      expect(response.localPeer.displayName).toBe('Test User');
      expect(response.localPeer.role).toBe('owner'); // First peer is owner
      expect(response.peers).toEqual([]);
    });

    it('rejects joining non-existent room', async () => {
      clientSocket = await createConnectedClient();

      const joinPayload: JoinRoomPayload = {
        roomId: 'non-existent',
        displayName: 'Test User',
      };

      await expect(
        new Promise<RoomJoinedPayload>((resolve, reject) => {
          clientSocket.emit('room:join', joinPayload, (res: RoomJoinedPayload | RoomErrorPayload) => {
            if ('code' in res) {
              reject(new Error(res.message));
            } else {
              resolve(res);
            }
          });
        })
      ).rejects.toThrow('Room not found');
    });

    it('rejects joining full room', async () => {
      // Create room with max 2 participants
      const room = createRoom({ name: 'Small Room', maxParticipants: 2 }, 'owner');

      // Join with first two clients
      const client1 = await createConnectedClient();
      const client2 = await createConnectedClient();

      await new Promise((resolve) => {
        client1.emit('room:join', { roomId: room.id, displayName: 'User 1' }, resolve);
      });
      await new Promise((resolve) => {
        client2.emit('room:join', { roomId: room.id, displayName: 'User 2' }, resolve);
      });

      // Third client should be rejected
      clientSocket = await createConnectedClient();

      await expect(
        new Promise<RoomJoinedPayload>((resolve, reject) => {
          clientSocket.emit(
            'room:join',
            { roomId: room.id, displayName: 'User 3' },
            (res: RoomJoinedPayload | RoomErrorPayload) => {
              if ('code' in res) {
                reject(new Error(res.message));
              } else {
                resolve(res);
              }
            }
          );
        })
      ).rejects.toThrow('Room is full');

      // Cleanup
      client1.disconnect();
      client2.disconnect();
    });

    it('broadcasts peer:joined to other room members', async () => {
      const room = createRoom({ name: 'Broadcast Test', maxParticipants: 4 }, 'owner');

      // First client joins
      const client1 = await createConnectedClient();
      await new Promise((resolve) => {
        client1.emit('room:join', { roomId: room.id, displayName: 'User 1' }, resolve);
      });

      // Setup listener for peer:joined
      const peerJoinedPromise = new Promise<{ displayName: string }>((resolve) => {
        client1.on('peer:joined', (peer) => {
          resolve(peer);
        });
      });

      // Second client joins
      clientSocket = await createConnectedClient();
      await new Promise((resolve) => {
        clientSocket.emit('room:join', { roomId: room.id, displayName: 'User 2' }, resolve);
      });

      // Check that first client received the event
      const joinedPeer = await peerJoinedPromise;
      expect(joinedPeer.displayName).toBe('User 2');

      client1.disconnect();
    });
  });

  describe('Room Leave', () => {
    it('removes peer from room on leave', async () => {
      const room = createRoom({ name: 'Leave Test', maxParticipants: 4 }, 'owner');

      clientSocket = await createConnectedClient();

      // Join room
      await new Promise((resolve) => {
        clientSocket.emit('room:join', { roomId: room.id, displayName: 'Leaving User' }, resolve);
      });

      // Verify peer is in room
      expect(getRoomPeers(room.id)).toHaveLength(1);

      // Leave room
      clientSocket.emit('room:leave', { roomId: room.id });

      // Wait a bit for server to process
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Verify peer is removed
      expect(getRoomPeers(room.id)).toHaveLength(0);
    });

    it('broadcasts peer:left to other room members', async () => {
      const room = createRoom({ name: 'Leave Broadcast Test', maxParticipants: 4 }, 'owner');

      // Two clients join
      const client1 = await createConnectedClient();
      const client2 = await createConnectedClient();

      await new Promise((resolve) => {
        client1.emit('room:join', { roomId: room.id, displayName: 'User 1' }, resolve);
      });

      const response2 = await new Promise<RoomJoinedPayload>((resolve) => {
        client2.emit(
          'room:join',
          { roomId: room.id, displayName: 'User 2' },
          (res: RoomJoinedPayload | RoomErrorPayload) => {
            resolve(res as RoomJoinedPayload);
          }
        );
      });

      const leavingPeerId = response2.localPeer.id;

      // Setup listener for peer:left
      const peerLeftPromise = new Promise<string>((resolve) => {
        client1.on('peer:left', (peerId) => {
          resolve(peerId);
        });
      });

      // Client 2 leaves
      client2.emit('room:leave', { roomId: room.id });

      // Check that client 1 received the event
      const leftPeerId = await peerLeftPromise;
      expect(leftPeerId).toBe(leavingPeerId);

      client1.disconnect();
      client2.disconnect();
    });

    it('cleans up peer on disconnect', async () => {
      const room = createRoom({ name: 'Disconnect Test', maxParticipants: 4 }, 'owner');

      clientSocket = await createConnectedClient();

      // Join room
      await new Promise((resolve) => {
        clientSocket.emit('room:join', { roomId: room.id, displayName: 'Disconnecting User' }, resolve);
      });

      expect(getRoomPeers(room.id)).toHaveLength(1);

      // Disconnect
      clientSocket.disconnect();

      // Wait for cleanup
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(getRoomPeers(room.id)).toHaveLength(0);
    });
  });

  describe('Presence', () => {
    it('broadcasts presence updates to room members', async () => {
      const room = createRoom({ name: 'Presence Test', maxParticipants: 4 }, 'owner');

      // Two clients join
      const client1 = await createConnectedClient();
      const client2 = await createConnectedClient();

      await new Promise((resolve) => {
        client1.emit('room:join', { roomId: room.id, displayName: 'User 1' }, resolve);
      });
      await new Promise((resolve) => {
        client2.emit('room:join', { roomId: room.id, displayName: 'User 2' }, resolve);
      });

      // Setup listener for presence update
      const presencePromise = new Promise<{ isMuted: boolean }>((resolve) => {
        client1.on('presence:update', (peer) => {
          resolve(peer);
        });
      });

      // Client 2 updates presence
      client2.emit('presence:update', { isMuted: true });

      // Check that client 1 received the update
      const presenceUpdate = await presencePromise;
      expect(presenceUpdate.isMuted).toBe(true);

      client1.disconnect();
      client2.disconnect();
    });
  });
});

describe('Signaling Helper Functions', () => {
  beforeEach(() => {
    clearAllRooms();
  });

  describe('getRoomPeers', () => {
    it('returns empty array for non-existent room', () => {
      const peers = getRoomPeers('non-existent');
      expect(peers).toEqual([]);
    });
  });

  describe('getRoomPeerSummaries', () => {
    it('returns empty array for non-existent room', () => {
      const summaries = getRoomPeerSummaries('non-existent');
      expect(summaries).toEqual([]);
    });
  });

  describe('createSignalingServer', () => {
    it('creates signaling server instance', () => {
      const server = createServer();
      const signaling = createSignalingServer(server);

      expect(signaling).toBeInstanceOf(SignalingServer);
      expect(signaling.getIO()).toBeDefined();

      signaling.close();
      server.close();
    });
  });
});
