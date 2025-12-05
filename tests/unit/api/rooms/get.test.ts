/**
 * Room CRUD API Tests - Get Room by ID Endpoint
 *
 * Tests for GET /api/rooms/[roomId]
 *
 * Part of the Long-Horizon Engineering Protocol - FEAT-103
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createRoom,
  getRoom,
  deleteRoom,
  closeRoom,
  roomExists,
  clearAllRooms,
} from '@/server/store/rooms';

describe('Room Store - Get Room by ID', () => {
  beforeEach(() => {
    clearAllRooms();
  });

  describe('getRoom', () => {
    it('returns room with all properties', () => {
      const created = createRoom({
        name: 'Test Room',
        description: 'A test room',
        maxParticipants: 5,
        aiPersonality: 'expert',
      }, 'owner-123');

      const room = getRoom(created.id);

      expect(room).toBeDefined();
      expect(room?.id).toBe(created.id);
      expect(room?.name).toBe('Test Room');
      expect(room?.description).toBe('A test room');
      expect(room?.maxParticipants).toBe(5);
      expect(room?.aiPersonality).toBe('expert');
      expect(room?.ownerId).toBe('owner-123');
      expect(room?.status).toBe('waiting');
      expect(room?.participants).toEqual([]);
      expect(room?.participantCount).toBe(0);
      expect(room?.createdAt).toBeInstanceOf(Date);
      expect(room?.lastActivityAt).toBeInstanceOf(Date);
      expect(room?.voiceSettings).toBeDefined();
    });

    it('returns undefined for non-existent room ID', () => {
      const room = getRoom('non-existent-id');
      expect(room).toBeUndefined();
    });

    it('returns undefined for empty room ID', () => {
      const room = getRoom('');
      expect(room).toBeUndefined();
    });

    it('retrieves correct room among multiple rooms', () => {
      const room1 = createRoom({ name: 'First Room' }, 'owner-1');
      const room2 = createRoom({ name: 'Second Room' }, 'owner-2');
      const room3 = createRoom({ name: 'Third Room' }, 'owner-3');

      const retrieved = getRoom(room2.id);

      expect(retrieved?.name).toBe('Second Room');
      expect(retrieved?.ownerId).toBe('owner-2');
    });
  });

  describe('roomExists', () => {
    it('returns true for existing room', () => {
      const room = createRoom({ name: 'Exists Room' }, 'owner');
      expect(roomExists(room.id)).toBe(true);
    });

    it('returns false for non-existent room', () => {
      expect(roomExists('non-existent-id')).toBe(false);
    });

    it('returns false for empty string', () => {
      expect(roomExists('')).toBe(false);
    });

    it('returns false after room is deleted', () => {
      const room = createRoom({ name: 'To Delete' }, 'owner');
      expect(roomExists(room.id)).toBe(true);

      deleteRoom(room.id);
      expect(roomExists(room.id)).toBe(false);
    });
  });
});

describe('Room Store - Delete Room', () => {
  beforeEach(() => {
    clearAllRooms();
  });

  describe('deleteRoom', () => {
    it('removes room from store', () => {
      const room = createRoom({ name: 'Delete Me' }, 'owner');
      expect(getRoom(room.id)).toBeDefined();

      const result = deleteRoom(room.id);

      expect(result).toBe(true);
      expect(getRoom(room.id)).toBeUndefined();
    });

    it('returns false for non-existent room', () => {
      const result = deleteRoom('non-existent-id');
      expect(result).toBe(false);
    });

    it('only removes specified room', () => {
      const room1 = createRoom({ name: 'Keep Me' }, 'owner-1');
      const room2 = createRoom({ name: 'Delete Me' }, 'owner-2');

      deleteRoom(room2.id);

      expect(getRoom(room1.id)).toBeDefined();
      expect(getRoom(room2.id)).toBeUndefined();
    });
  });

  describe('closeRoom', () => {
    it('sets room status to closed', () => {
      const room = createRoom({ name: 'Close Me' }, 'owner');
      expect(room.status).toBe('waiting');

      const closed = closeRoom(room.id);

      expect(closed?.status).toBe('closed');
    });

    it('updates lastActivityAt timestamp', () => {
      const room = createRoom({ name: 'Activity Test' }, 'owner');
      const originalTime = room.lastActivityAt.getTime();

      // Small delay
      setTimeout(() => {
        const closed = closeRoom(room.id);
        expect(closed?.lastActivityAt.getTime()).toBeGreaterThanOrEqual(originalTime);
      }, 10);
    });

    it('returns undefined for non-existent room', () => {
      const result = closeRoom('non-existent-id');
      expect(result).toBeUndefined();
    });

    it('room still exists after closing', () => {
      const room = createRoom({ name: 'Soft Close' }, 'owner');
      closeRoom(room.id);

      expect(roomExists(room.id)).toBe(true);
      expect(getRoom(room.id)?.status).toBe('closed');
    });
  });
});

describe('Room Store - Edge Cases', () => {
  beforeEach(() => {
    clearAllRooms();
  });

  it('handles special characters in room ID lookup', () => {
    // Room IDs are generated, but we should handle lookups gracefully
    expect(getRoom('id-with-special-!@#$%')).toBeUndefined();
    expect(getRoom('id with spaces')).toBeUndefined();
    expect(getRoom('id\nwith\nnewlines')).toBeUndefined();
  });

  it('handles concurrent room operations', () => {
    const rooms = [];
    for (let i = 0; i < 10; i++) {
      rooms.push(createRoom({ name: `Room ${i}` }, `owner-${i}`));
    }

    // All rooms should exist
    rooms.forEach((room) => {
      expect(getRoom(room.id)).toBeDefined();
    });

    // Delete half
    rooms.slice(0, 5).forEach((room) => {
      deleteRoom(room.id);
    });

    // Check correct rooms remain
    rooms.slice(0, 5).forEach((room) => {
      expect(getRoom(room.id)).toBeUndefined();
    });
    rooms.slice(5).forEach((room) => {
      expect(getRoom(room.id)).toBeDefined();
    });
  });

  it('handles room with long ID gracefully', () => {
    const longId = 'a'.repeat(1000);
    expect(getRoom(longId)).toBeUndefined();
    expect(roomExists(longId)).toBe(false);
    expect(deleteRoom(longId)).toBe(false);
    expect(closeRoom(longId)).toBeUndefined();
  });
});
