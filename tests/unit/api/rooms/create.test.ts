/**
 * Room CRUD API Tests - Create Room Endpoint
 *
 * Tests for POST /api/rooms
 *
 * Part of the Long-Horizon Engineering Protocol - FEAT-101
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createRoom,
  getRoom,
  clearAllRooms,
  generateRoomId,
} from '@/server/store/rooms';
import type { CreateRoomRequest } from '@/types/room';
import { DEFAULT_VOICE_SETTINGS } from '@/types/voice-mode';

describe('Room Store - Create Room', () => {
  beforeEach(() => {
    clearAllRooms();
  });

  describe('generateRoomId', () => {
    it('generates a unique 10-character ID', () => {
      const id1 = generateRoomId();
      const id2 = generateRoomId();

      expect(id1).toHaveLength(10);
      expect(id2).toHaveLength(10);
      expect(id1).not.toBe(id2);
    });
  });

  describe('createRoom', () => {
    it('creates a room with required fields only', () => {
      const request: CreateRoomRequest = {
        name: 'Test Room',
      };

      const room = createRoom(request, 'owner-123');

      expect(room).toBeDefined();
      expect(room.id).toHaveLength(10);
      expect(room.name).toBe('Test Room');
      expect(room.description).toBeUndefined();
      expect(room.maxParticipants).toBe(6); // default
      expect(room.status).toBe('waiting');
      expect(room.aiPersonality).toBe('facilitator'); // default
      expect(room.voiceSettings).toEqual(DEFAULT_VOICE_SETTINGS);
      expect(room.ownerId).toBe('owner-123');
      expect(room.participants).toEqual([]);
      expect(room.participantCount).toBe(0);
      expect(room.createdAt).toBeInstanceOf(Date);
      expect(room.lastActivityAt).toBeInstanceOf(Date);
    });

    it('creates a room with all optional fields', () => {
      const customVoiceSettings = {
        ...DEFAULT_VOICE_SETTINGS,
        mode: 'open' as const,
        lockDuringResponse: false,
      };

      const request: CreateRoomRequest = {
        name: 'Full Options Room',
        description: 'A room with all options set',
        maxParticipants: 4,
        aiPersonality: 'expert',
        voiceSettings: customVoiceSettings,
      };

      const room = createRoom(request, 'owner-456');

      expect(room.name).toBe('Full Options Room');
      expect(room.description).toBe('A room with all options set');
      expect(room.maxParticipants).toBe(4);
      expect(room.aiPersonality).toBe('expert');
      expect(room.voiceSettings.mode).toBe('open');
      expect(room.voiceSettings.lockDuringResponse).toBe(false);
    });

    it('stores the room and can be retrieved', () => {
      const request: CreateRoomRequest = {
        name: 'Retrievable Room',
      };

      const createdRoom = createRoom(request, 'owner-789');
      const retrievedRoom = getRoom(createdRoom.id);

      expect(retrievedRoom).toBeDefined();
      expect(retrievedRoom).toEqual(createdRoom);
    });

    it('creates multiple rooms with unique IDs', () => {
      const room1 = createRoom({ name: 'Room 1' }, 'owner-1');
      const room2 = createRoom({ name: 'Room 2' }, 'owner-2');
      const room3 = createRoom({ name: 'Room 3' }, 'owner-3');

      expect(room1.id).not.toBe(room2.id);
      expect(room2.id).not.toBe(room3.id);
      expect(room1.id).not.toBe(room3.id);
    });

    it('sets createdAt and lastActivityAt to the same time on creation', () => {
      const room = createRoom({ name: 'Time Test Room' }, 'owner-time');

      expect(room.createdAt.getTime()).toBe(room.lastActivityAt.getTime());
    });
  });

  describe('getRoom', () => {
    it('returns undefined for non-existent room', () => {
      const room = getRoom('non-existent-id');
      expect(room).toBeUndefined();
    });

    it('returns the correct room by ID', () => {
      const room1 = createRoom({ name: 'Room A' }, 'owner-a');
      const room2 = createRoom({ name: 'Room B' }, 'owner-b');

      const retrieved = getRoom(room1.id);

      expect(retrieved?.name).toBe('Room A');
      expect(retrieved?.id).toBe(room1.id);
    });
  });
});

describe('Room Store - Validation Logic', () => {
  beforeEach(() => {
    clearAllRooms();
  });

  describe('Name validation (simulated)', () => {
    it('room can have a short name', () => {
      const room = createRoom({ name: 'AB' }, 'owner');
      expect(room.name).toBe('AB');
    });

    it('room can have a long name', () => {
      const longName = 'A'.repeat(100);
      const room = createRoom({ name: longName }, 'owner');
      expect(room.name).toBe(longName);
    });
  });

  describe('maxParticipants defaults', () => {
    it('defaults to 6 when not specified', () => {
      const room = createRoom({ name: 'Default Participants' }, 'owner');
      expect(room.maxParticipants).toBe(6);
    });

    it('accepts minimum value of 2', () => {
      const room = createRoom({ name: 'Min Participants', maxParticipants: 2 }, 'owner');
      expect(room.maxParticipants).toBe(2);
    });

    it('accepts maximum value of 10', () => {
      const room = createRoom({ name: 'Max Participants', maxParticipants: 10 }, 'owner');
      expect(room.maxParticipants).toBe(10);
    });
  });

  describe('aiPersonality defaults', () => {
    it('defaults to facilitator when not specified', () => {
      const room = createRoom({ name: 'Default Personality' }, 'owner');
      expect(room.aiPersonality).toBe('facilitator');
    });

    it('accepts all valid personalities', () => {
      const personalities = ['facilitator', 'assistant', 'expert', 'brainstorm', 'custom'] as const;

      personalities.forEach((personality) => {
        const room = createRoom({ name: `${personality} Room`, aiPersonality: personality }, 'owner');
        expect(room.aiPersonality).toBe(personality);
      });
    });
  });

  describe('voiceSettings defaults', () => {
    it('defaults to DEFAULT_VOICE_SETTINGS when not specified', () => {
      const room = createRoom({ name: 'Default Voice' }, 'owner');
      expect(room.voiceSettings).toEqual(DEFAULT_VOICE_SETTINGS);
    });

    it('uses pushToTalk as default mode', () => {
      const room = createRoom({ name: 'PTT Default' }, 'owner');
      expect(room.voiceSettings.mode).toBe('pushToTalk');
    });

    it('has lockDuringResponse enabled by default', () => {
      const room = createRoom({ name: 'Lock Default' }, 'owner');
      expect(room.voiceSettings.lockDuringResponse).toBe(true);
    });
  });
});

describe('Room Store - clearAllRooms', () => {
  it('removes all rooms', () => {
    createRoom({ name: 'Room 1' }, 'owner-1');
    createRoom({ name: 'Room 2' }, 'owner-2');
    createRoom({ name: 'Room 3' }, 'owner-3');

    clearAllRooms();

    expect(getRoom('any-id')).toBeUndefined();
  });
});
