/**
 * Room CRUD API Tests - List Rooms Endpoint
 *
 * Tests for GET /api/rooms
 *
 * Part of the Long-Horizon Engineering Protocol - FEAT-102
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createRoom,
  getAllRooms,
  getRoomsByStatus,
  getRoomSummaries,
  clearAllRooms,
  updateRoomStatus,
  addParticipant,
} from '@/server/store/rooms';
import type { RoomStatus } from '@/types/room';
import type { Peer } from '@/types/peer';

describe('Room Store - List Rooms', () => {
  beforeEach(() => {
    clearAllRooms();
  });

  describe('getAllRooms', () => {
    it('returns empty array when no rooms exist', () => {
      const rooms = getAllRooms();
      expect(rooms).toEqual([]);
    });

    it('returns all created rooms', () => {
      createRoom({ name: 'Room 1' }, 'owner-1');
      createRoom({ name: 'Room 2' }, 'owner-2');
      createRoom({ name: 'Room 3' }, 'owner-3');

      const rooms = getAllRooms();
      expect(rooms).toHaveLength(3);
      expect(rooms.map((r) => r.name)).toEqual(['Room 1', 'Room 2', 'Room 3']);
    });
  });

  describe('getRoomsByStatus', () => {
    beforeEach(() => {
      // Create rooms with different statuses
      const room1 = createRoom({ name: 'Waiting Room' }, 'owner-1');
      const room2 = createRoom({ name: 'Active Room' }, 'owner-2');
      const room3 = createRoom({ name: 'Full Room', maxParticipants: 2 }, 'owner-3');
      const room4 = createRoom({ name: 'Closed Room' }, 'owner-4');

      // Simulate different room states
      updateRoomStatus(room2.id, 'active');
      updateRoomStatus(room3.id, 'full');
      updateRoomStatus(room4.id, 'closed');
    });

    it('returns all rooms when no status filter', () => {
      const rooms = getRoomsByStatus();
      expect(rooms).toHaveLength(4);
    });

    it('filters by waiting status', () => {
      const rooms = getRoomsByStatus('waiting');
      expect(rooms).toHaveLength(1);
      expect(rooms[0].name).toBe('Waiting Room');
    });

    it('filters by active status', () => {
      const rooms = getRoomsByStatus('active');
      expect(rooms).toHaveLength(1);
      expect(rooms[0].name).toBe('Active Room');
    });

    it('filters by full status', () => {
      const rooms = getRoomsByStatus('full');
      expect(rooms).toHaveLength(1);
      expect(rooms[0].name).toBe('Full Room');
    });

    it('filters by closed status', () => {
      const rooms = getRoomsByStatus('closed');
      expect(rooms).toHaveLength(1);
      expect(rooms[0].name).toBe('Closed Room');
    });

    it('returns empty array for status with no matches', () => {
      clearAllRooms();
      createRoom({ name: 'Only Waiting' }, 'owner');

      const rooms = getRoomsByStatus('active');
      expect(rooms).toEqual([]);
    });
  });

  describe('getRoomSummaries', () => {
    it('returns empty array when no rooms exist', () => {
      const summaries = getRoomSummaries();
      expect(summaries).toEqual([]);
    });

    it('returns summaries with correct fields', () => {
      const room = createRoom({
        name: 'Summary Test Room',
        description: 'A room to test summaries',
        maxParticipants: 4,
        aiPersonality: 'expert',
      }, 'owner-1');

      const summaries = getRoomSummaries();
      expect(summaries).toHaveLength(1);

      const summary = summaries[0];
      expect(summary.id).toBe(room.id);
      expect(summary.name).toBe('Summary Test Room');
      expect(summary.description).toBe('A room to test summaries');
      expect(summary.maxParticipants).toBe(4);
      expect(summary.participantCount).toBe(0);
      expect(summary.status).toBe('waiting');
      expect(summary.aiPersonality).toBe('expert');
      expect(summary.createdAt).toBeInstanceOf(Date);
    });

    it('excludes full participant details (privacy)', () => {
      const room = createRoom({ name: 'Privacy Test' }, 'owner-1');

      // Add a participant
      const peer: Peer = {
        id: 'peer-1',
        displayName: 'Test User',
        role: 'participant',
        roomId: room.id,
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
      };
      addParticipant(room.id, peer);

      const summaries = getRoomSummaries();
      expect(summaries[0].participantCount).toBe(1);
      // Summary should NOT include participants array
      expect('participants' in summaries[0]).toBe(false);
    });

    it('filters summaries by status', () => {
      const room1 = createRoom({ name: 'Room 1' }, 'owner-1');
      const room2 = createRoom({ name: 'Room 2' }, 'owner-2');
      updateRoomStatus(room2.id, 'active');

      const waitingSummaries = getRoomSummaries('waiting');
      expect(waitingSummaries).toHaveLength(1);
      expect(waitingSummaries[0].name).toBe('Room 1');

      const activeSummaries = getRoomSummaries('active');
      expect(activeSummaries).toHaveLength(1);
      expect(activeSummaries[0].name).toBe('Room 2');
    });
  });
});

describe('Room Store - Status Updates', () => {
  beforeEach(() => {
    clearAllRooms();
  });

  describe('updateRoomStatus', () => {
    it('updates room status', () => {
      const room = createRoom({ name: 'Status Test' }, 'owner');
      expect(room.status).toBe('waiting');

      updateRoomStatus(room.id, 'active');
      const updated = getAllRooms().find((r) => r.id === room.id);
      expect(updated?.status).toBe('active');
    });

    it('updates lastActivityAt on status change', () => {
      const room = createRoom({ name: 'Activity Test' }, 'owner');
      const originalActivity = room.lastActivityAt.getTime();

      // Small delay to ensure time difference
      const later = new Promise<void>((resolve) => setTimeout(resolve, 10));
      later.then(() => {
        updateRoomStatus(room.id, 'active');
        const updated = getAllRooms().find((r) => r.id === room.id);
        expect(updated?.lastActivityAt.getTime()).toBeGreaterThanOrEqual(originalActivity);
      });
    });

    it('returns undefined for non-existent room', () => {
      const result = updateRoomStatus('non-existent', 'active');
      expect(result).toBeUndefined();
    });
  });
});

describe('Room Store - Participant Management', () => {
  beforeEach(() => {
    clearAllRooms();
  });

  const createTestPeer = (id: string, roomId: string): Peer => ({
    id,
    displayName: `User ${id}`,
    role: 'participant',
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
  });

  describe('addParticipant', () => {
    it('adds participant to room', () => {
      const room = createRoom({ name: 'Add Test' }, 'owner');
      const peer = createTestPeer('peer-1', room.id);

      addParticipant(room.id, peer);

      const updated = getAllRooms().find((r) => r.id === room.id);
      expect(updated?.participants).toHaveLength(1);
      expect(updated?.participantCount).toBe(1);
    });

    it('updates status to active when first participant joins', () => {
      const room = createRoom({ name: 'Status Update Test' }, 'owner');
      expect(room.status).toBe('waiting');

      const peer = createTestPeer('peer-1', room.id);
      addParticipant(room.id, peer);

      const updated = getAllRooms().find((r) => r.id === room.id);
      expect(updated?.status).toBe('active');
    });

    it('updates status to full when capacity reached', () => {
      const room = createRoom({ name: 'Capacity Test', maxParticipants: 2 }, 'owner');

      addParticipant(room.id, createTestPeer('peer-1', room.id));
      let updated = getAllRooms().find((r) => r.id === room.id);
      expect(updated?.status).toBe('active');

      addParticipant(room.id, createTestPeer('peer-2', room.id));
      updated = getAllRooms().find((r) => r.id === room.id);
      expect(updated?.status).toBe('full');
    });

    it('returns undefined for non-existent room', () => {
      const peer = createTestPeer('peer-1', 'non-existent');
      const result = addParticipant('non-existent', peer);
      expect(result).toBeUndefined();
    });
  });
});
