/**
 * Room Types Tests - FEAT-100
 *
 * Verifies that room-related types are correctly defined and exported.
 */

import { describe, it, expect, expectTypeOf } from 'vitest';
import type {
  RoomId,
  RoomStatus,
  AIPersonality,
  Room,
  RoomSummary,
  CreateRoomRequest,
  JoinRoomRequest,
  JoinRoomResponse,
  UpdateRoomRequest,
  ListRoomsQuery,
  ListRoomsResponse,
  RoomEventType,
  RoomEvent,
} from '@/types/room';
import type { RoomVoiceSettings } from '@/types/voice-mode';
import type { Peer, PeerId } from '@/types/peer';
import { DEFAULT_VOICE_SETTINGS } from '@/types/voice-mode';

describe('Room Types', () => {
  describe('RoomId', () => {
    it('should be a string type', () => {
      const roomId: RoomId = 'room-123';
      expectTypeOf(roomId).toBeString();
      expect(typeof roomId).toBe('string');
    });
  });

  describe('RoomStatus', () => {
    it('should accept valid status values', () => {
      const statuses: RoomStatus[] = ['waiting', 'active', 'full', 'closed'];
      expect(statuses).toHaveLength(4);
      statuses.forEach((status) => {
        expect(['waiting', 'active', 'full', 'closed']).toContain(status);
      });
    });
  });

  describe('AIPersonality', () => {
    it('should accept valid personality values', () => {
      const personalities: AIPersonality[] = [
        'facilitator',
        'assistant',
        'expert',
        'brainstorm',
        'custom',
      ];
      expect(personalities).toHaveLength(5);
    });
  });

  describe('Room interface', () => {
    it('should have all required properties', () => {
      const mockPeer: Peer = {
        id: 'peer-1',
        displayName: 'Test User',
        role: 'owner',
        roomId: 'room-123',
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

      const room: Room = {
        id: 'room-123',
        name: 'Test Room',
        description: 'A test room',
        maxParticipants: 6,
        status: 'active',
        aiPersonality: 'facilitator',
        voiceSettings: DEFAULT_VOICE_SETTINGS,
        ownerId: 'peer-1',
        participants: [mockPeer],
        participantCount: 1,
        createdAt: new Date(),
        lastActivityAt: new Date(),
      };

      expect(room.id).toBe('room-123');
      expect(room.name).toBe('Test Room');
      expect(room.maxParticipants).toBe(6);
      expect(room.status).toBe('active');
      expect(room.participants).toHaveLength(1);
      expect(room.voiceSettings.mode).toBe('pushToTalk');
    });
  });

  describe('RoomSummary interface', () => {
    it('should be a subset of Room', () => {
      const summary: RoomSummary = {
        id: 'room-123',
        name: 'Test Room',
        maxParticipants: 6,
        participantCount: 3,
        status: 'active',
        aiPersonality: 'assistant',
        createdAt: new Date(),
      };

      expect(summary.id).toBeDefined();
      expect(summary.name).toBeDefined();
      expect(summary.participantCount).toBe(3);
      // Should not have participants array
      expect((summary as any).participants).toBeUndefined();
    });
  });

  describe('CreateRoomRequest', () => {
    it('should require name and allow optional fields', () => {
      const minimalRequest: CreateRoomRequest = {
        name: 'My Room',
      };

      const fullRequest: CreateRoomRequest = {
        name: 'My Room',
        description: 'Description',
        maxParticipants: 8,
        aiPersonality: 'expert',
        customInstructions: 'Be helpful',
        voiceSettings: {
          mode: 'open',
        },
      };

      expect(minimalRequest.name).toBe('My Room');
      expect(fullRequest.maxParticipants).toBe(8);
    });
  });

  describe('JoinRoomRequest', () => {
    it('should require roomId and displayName', () => {
      const request: JoinRoomRequest = {
        roomId: 'room-123',
        displayName: 'John Doe',
        avatarUrl: 'https://example.com/avatar.png',
      };

      expect(request.roomId).toBe('room-123');
      expect(request.displayName).toBe('John Doe');
    });
  });

  describe('JoinRoomResponse', () => {
    it('should handle success response', () => {
      const successResponse: JoinRoomResponse = {
        success: true,
        room: {
          id: 'room-123',
          name: 'Test Room',
          maxParticipants: 6,
          status: 'active',
          aiPersonality: 'facilitator',
          voiceSettings: DEFAULT_VOICE_SETTINGS,
          ownerId: 'peer-1',
          participants: [],
          participantCount: 1,
          createdAt: new Date(),
          lastActivityAt: new Date(),
        },
      };

      expect(successResponse.success).toBe(true);
      expect(successResponse.room).toBeDefined();
    });

    it('should handle error response', () => {
      const errorResponse: JoinRoomResponse = {
        success: false,
        error: 'Room is full',
        errorCode: 'ROOM_FULL',
      };

      expect(errorResponse.success).toBe(false);
      expect(errorResponse.errorCode).toBe('ROOM_FULL');
    });
  });

  describe('ListRoomsQuery', () => {
    it('should support filtering and pagination', () => {
      const query: ListRoomsQuery = {
        status: ['active', 'waiting'],
        search: 'test',
        offset: 0,
        limit: 10,
        sortBy: 'createdAt',
        sortOrder: 'desc',
      };

      expect(query.limit).toBe(10);
      expect(query.sortBy).toBe('createdAt');
    });
  });

  describe('ListRoomsResponse', () => {
    it('should include pagination info', () => {
      const response: ListRoomsResponse = {
        rooms: [],
        total: 100,
        offset: 0,
        limit: 10,
      };

      expect(response.total).toBe(100);
      expect(response.rooms).toEqual([]);
    });
  });

  describe('RoomEvent', () => {
    it('should have valid event types', () => {
      const eventTypes: RoomEventType[] = [
        'room:created',
        'room:updated',
        'room:closed',
        'room:deleted',
      ];

      expect(eventTypes).toHaveLength(4);
    });

    it('should have correct structure', () => {
      const event: RoomEvent = {
        type: 'room:created',
        roomId: 'room-123',
        timestamp: new Date(),
      };

      expect(event.type).toBe('room:created');
      expect(event.roomId).toBe('room-123');
    });
  });
});

describe('Peer Types', () => {
  describe('PeerId', () => {
    it('should be a string type', () => {
      const peerId: PeerId = 'peer-abc-123';
      expectTypeOf(peerId).toBeString();
    });
  });
});
