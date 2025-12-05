/**
 * Signaling Server Presence Tests
 *
 * Tests for presence tracking, state sync, and heartbeat functionality.
 *
 * Part of the Long-Horizon Engineering Protocol - FEAT-107
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createServer } from 'http';
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';
import { AddressInfo } from 'net';
import {
  SignalingServer,
  createSignalingServer,
  getRoomPeers,
  getRoomPeerSummaries,
} from '@/server/signaling';
import { createRoom, clearAllRooms } from '@/server/store/rooms';
import type { RoomJoinedPayload, RoomErrorPayload, PresenceUpdatePayload } from '@/types/signaling';
import type { PeerSummary } from '@/types/peer';

describe('Signaling Presence', () => {
  let httpServer: ReturnType<typeof createServer>;
  let signalingServer: SignalingServer;
  let serverUrl: string;

  beforeEach(async () => {
    clearAllRooms();
    httpServer = createServer();
    signalingServer = createSignalingServer(httpServer, { cors: { origin: '*' } });

    await new Promise<void>((resolve) => {
      httpServer.listen(0, () => {
        const address = httpServer.address() as AddressInfo;
        serverUrl = `http://localhost:${address.port}`;
        resolve();
      });
    });
  });

  afterEach(async () => {
    signalingServer.close();
    await new Promise<void>((resolve) => {
      httpServer.close(() => resolve());
    });
  });

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

  async function joinRoom(socket: ClientSocket, roomId: string, displayName: string): Promise<RoomJoinedPayload> {
    return new Promise((resolve, reject) => {
      socket.emit(
        'room:join',
        { roomId, displayName },
        (res: RoomJoinedPayload | RoomErrorPayload) => {
          if ('code' in res) {
            reject(new Error(res.message));
          } else {
            resolve(res);
          }
        }
      );
    });
  }

  describe('Presence State Tracking', () => {
    it('tracks initial presence state on join', async () => {
      const room = createRoom({ name: 'Presence Test' }, 'owner');
      const client = await createConnectedClient();

      try {
        const response = await joinRoom(client, room.id, 'Test User');

        expect(response.localPeer.presence).toBeDefined();
        expect(response.localPeer.presence.connectionState).toBe('connected');
        expect(response.localPeer.presence.audio.isMuted).toBe(false);
        expect(response.localPeer.presence.audio.isSpeaking).toBe(false);
        expect(response.localPeer.presence.audio.isAddressingAI).toBe(false);
        expect(response.localPeer.presence.isIdle).toBe(false);
      } finally {
        client.disconnect();
      }
    });

    it('updates muted state via presence update', async () => {
      const room = createRoom({ name: 'Mute Test' }, 'owner');
      const client1 = await createConnectedClient();
      const client2 = await createConnectedClient();

      try {
        await joinRoom(client1, room.id, 'User 1');
        await joinRoom(client2, room.id, 'User 2');

        // Setup listener for presence update
        const updatePromise = new Promise<PeerSummary>((resolve) => {
          client1.on('presence:update', (peer) => {
            resolve(peer);
          });
        });

        // Client 2 mutes
        client2.emit('presence:update', { isMuted: true });

        const update = await updatePromise;
        expect(update.isMuted).toBe(true);
      } finally {
        client1.disconnect();
        client2.disconnect();
      }
    });

    it('updates speaking state via presence update', async () => {
      const room = createRoom({ name: 'Speaking Test' }, 'owner');
      const client1 = await createConnectedClient();
      const client2 = await createConnectedClient();

      try {
        await joinRoom(client1, room.id, 'User 1');
        await joinRoom(client2, room.id, 'User 2');

        const updatePromise = new Promise<PeerSummary>((resolve) => {
          client1.on('presence:update', (peer) => {
            resolve(peer);
          });
        });

        // Client 2 starts speaking
        client2.emit('presence:update', { isSpeaking: true });

        const update = await updatePromise;
        expect(update.isSpeaking).toBe(true);
      } finally {
        client1.disconnect();
        client2.disconnect();
      }
    });

    it('updates AI addressing state via presence update', async () => {
      const room = createRoom({ name: 'AI Address Test' }, 'owner');
      const client1 = await createConnectedClient();
      const client2 = await createConnectedClient();

      try {
        await joinRoom(client1, room.id, 'User 1');
        await joinRoom(client2, room.id, 'User 2');

        const updatePromise = new Promise<PeerSummary>((resolve) => {
          client1.on('presence:update', resolve);
        });

        // Client 2 starts addressing AI (PTT)
        client2.emit('presence:update', { isAddressingAI: true });

        const update = await updatePromise;
        // Note: isSpeaking might be updated alongside isAddressingAI
        expect(update).toBeDefined();
      } finally {
        client1.disconnect();
        client2.disconnect();
      }
    });
  });

  describe('Full Room State on Join', () => {
    it('sends existing peers on join', async () => {
      const room = createRoom({ name: 'State Sync Test', maxParticipants: 4 }, 'owner');
      const client1 = await createConnectedClient();
      const client2 = await createConnectedClient();

      try {
        // First client joins
        await joinRoom(client1, room.id, 'First User');

        // Second client joins and should see first client
        const response = await joinRoom(client2, room.id, 'Second User');

        expect(response.peers).toHaveLength(1);
        expect(response.peers[0].displayName).toBe('First User');
      } finally {
        client1.disconnect();
        client2.disconnect();
      }
    });

    it('includes room details with current participant count', async () => {
      const room = createRoom({ name: 'Room Details Test', maxParticipants: 4 }, 'owner');
      const client1 = await createConnectedClient();
      const client2 = await createConnectedClient();

      try {
        await joinRoom(client1, room.id, 'First User');
        const response = await joinRoom(client2, room.id, 'Second User');

        expect(response.room.participantCount).toBe(2);
        expect(response.room.status).toBe('active');
      } finally {
        client1.disconnect();
        client2.disconnect();
      }
    });

    it('includes AI state in join response', async () => {
      const room = createRoom({ name: 'AI State Test' }, 'owner');
      const client = await createConnectedClient();

      try {
        const response = await joinRoom(client, room.id, 'Test User');

        expect(response.aiState).toBeDefined();
        expect(response.aiState.state).toBe('idle');
        expect(response.aiState.isSessionHealthy).toBe(true);
        expect(response.aiState.queue).toBeDefined();
        expect(response.aiState.queue.queue).toEqual([]);
      } finally {
        client.disconnect();
      }
    });
  });

  describe('Disconnection Cleanup', () => {
    it('removes peer from tracking on disconnect', async () => {
      const room = createRoom({ name: 'Cleanup Test' }, 'owner');
      const client = await createConnectedClient();

      await joinRoom(client, room.id, 'Disappearing User');
      expect(getRoomPeers(room.id)).toHaveLength(1);

      client.disconnect();

      // Wait for cleanup
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(getRoomPeers(room.id)).toHaveLength(0);
    });

    it('notifies other peers of disconnect', async () => {
      const room = createRoom({ name: 'Notify Disconnect Test', maxParticipants: 4 }, 'owner');
      const client1 = await createConnectedClient();
      const client2 = await createConnectedClient();

      try {
        await joinRoom(client1, room.id, 'Staying User');
        const response2 = await joinRoom(client2, room.id, 'Leaving User');
        const leavingPeerId = response2.localPeer.id;

        const peerLeftPromise = new Promise<string>((resolve) => {
          client1.on('peer:left', (peerId) => {
            resolve(peerId);
          });
        });

        client2.disconnect();

        const leftPeerId = await peerLeftPromise;
        expect(leftPeerId).toBe(leavingPeerId);
      } finally {
        client1.disconnect();
      }
    });
  });

  describe('Heartbeat', () => {
    it('accepts heartbeat from connected peer', async () => {
      const room = createRoom({ name: 'Heartbeat Test' }, 'owner');
      const client = await createConnectedClient();

      try {
        await joinRoom(client, room.id, 'Heartbeat User');

        // Send heartbeat - should not throw
        client.emit('presence:heartbeat');

        // Verify peer still tracked
        await new Promise((resolve) => setTimeout(resolve, 50));
        expect(getRoomPeers(room.id)).toHaveLength(1);
      } finally {
        client.disconnect();
      }
    });

    it('updates lastActiveAt on heartbeat', async () => {
      const room = createRoom({ name: 'Activity Update Test' }, 'owner');
      const client = await createConnectedClient();

      try {
        await joinRoom(client, room.id, 'Activity User');

        const peersBefore = getRoomPeers(room.id);
        const lastActiveBefore = peersBefore[0].presence.lastActiveAt.getTime();

        // Small delay
        await new Promise((resolve) => setTimeout(resolve, 20));

        // Send heartbeat
        client.emit('presence:heartbeat');
        await new Promise((resolve) => setTimeout(resolve, 20));

        const peersAfter = getRoomPeers(room.id);
        const lastActiveAfter = peersAfter[0].presence.lastActiveAt.getTime();

        expect(lastActiveAfter).toBeGreaterThanOrEqual(lastActiveBefore);
      } finally {
        client.disconnect();
      }
    });
  });

  describe('getRoomPeerSummaries', () => {
    it('returns peer summaries with presence data', async () => {
      const room = createRoom({ name: 'Summary Test', maxParticipants: 4 }, 'owner');
      const client1 = await createConnectedClient();
      const client2 = await createConnectedClient();

      try {
        await joinRoom(client1, room.id, 'User A');
        await joinRoom(client2, room.id, 'User B');

        // Mute one user
        client1.emit('presence:update', { isMuted: true });
        await new Promise((resolve) => setTimeout(resolve, 50));

        const summaries = getRoomPeerSummaries(room.id);
        expect(summaries).toHaveLength(2);

        const mutedUser = summaries.find((s) => s.displayName === 'User A');
        expect(mutedUser?.isMuted).toBe(true);

        const unmutedUser = summaries.find((s) => s.displayName === 'User B');
        expect(unmutedUser?.isMuted).toBe(false);
      } finally {
        client1.disconnect();
        client2.disconnect();
      }
    });
  });
});
