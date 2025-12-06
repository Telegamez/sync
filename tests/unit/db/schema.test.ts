/**
 * Database Schema Tests
 *
 * Tests for database schema definitions, validation, and type guards.
 *
 * Part of the Long-Horizon Engineering Protocol - FEAT-401
 */

import { describe, it, expect } from 'vitest';

// Import schema types and functions
import {
  // SQL definitions
  CREATE_ROOMS_TABLE,
  CREATE_PARTICIPANTS_TABLE,
  CREATE_ROOM_HISTORY_TABLE,
  CREATE_INDEXES,
  FULL_MIGRATION,
  // Defaults
  DEFAULT_VOICE_SETTINGS_JSON,
  ROOM_DEFAULTS,
  // Validation functions
  validateRoomName,
  validateMaxParticipants,
  validateAIPersonality,
  validateRoomStatus,
  validatePeerRole,
  validateEventType,
  validateInsertRoom,
  validateInsertParticipant,
  // Type guards
  isRoomStatus,
  isAIPersonality,
  isPeerRole,
  isRoomEventType,
} from '@/server/db/schema';

import type {
  RoomsTable,
  ParticipantsTable,
  RoomHistoryTable,
  RoomEventType,
  InsertRoom,
  UpdateRoom,
  InsertParticipant,
  UpdateParticipant,
  InsertRoomHistory,
  RoomWithCount,
  RoomWithParticipants,
} from '@/server/db/schema';

// ========== SQL Definitions Tests ==========

describe('SQL Schema Definitions', () => {
  describe('CREATE_ROOMS_TABLE', () => {
    it('should contain CREATE TABLE statement', () => {
      expect(CREATE_ROOMS_TABLE).toContain('CREATE TABLE');
      expect(CREATE_ROOMS_TABLE).toContain('rooms');
    });

    it('should define primary key', () => {
      expect(CREATE_ROOMS_TABLE).toContain('id VARCHAR(21) PRIMARY KEY');
    });

    it('should define name column', () => {
      expect(CREATE_ROOMS_TABLE).toContain('name VARCHAR(100) NOT NULL');
    });

    it('should define max_participants with constraints', () => {
      expect(CREATE_ROOMS_TABLE).toContain('max_participants INTEGER');
      expect(CREATE_ROOMS_TABLE).toContain('CHECK (max_participants >= 2 AND max_participants <= 10)');
    });

    it('should define status with check constraint', () => {
      expect(CREATE_ROOMS_TABLE).toContain('status VARCHAR(20)');
      expect(CREATE_ROOMS_TABLE).toContain("CHECK (status IN ('waiting', 'active', 'full', 'closed'))");
    });

    it('should define ai_personality with check constraint', () => {
      expect(CREATE_ROOMS_TABLE).toContain('ai_personality VARCHAR(20)');
      expect(CREATE_ROOMS_TABLE).toContain("CHECK (ai_personality IN ('facilitator', 'assistant', 'expert', 'brainstorm', 'custom'))");
    });

    it('should define owner_id with foreign key', () => {
      expect(CREATE_ROOMS_TABLE).toContain('owner_id UUID NOT NULL');
      expect(CREATE_ROOMS_TABLE).toContain('REFERENCES auth.users(id)');
    });

    it('should define timestamp columns', () => {
      expect(CREATE_ROOMS_TABLE).toContain('created_at TIMESTAMPTZ');
      expect(CREATE_ROOMS_TABLE).toContain('last_activity_at TIMESTAMPTZ');
      expect(CREATE_ROOMS_TABLE).toContain('closed_at TIMESTAMPTZ');
      expect(CREATE_ROOMS_TABLE).toContain('deleted_at TIMESTAMPTZ');
    });

    it('should define voice_settings as JSONB', () => {
      expect(CREATE_ROOMS_TABLE).toContain('voice_settings JSONB');
    });
  });

  describe('CREATE_PARTICIPANTS_TABLE', () => {
    it('should contain CREATE TABLE statement', () => {
      expect(CREATE_PARTICIPANTS_TABLE).toContain('CREATE TABLE');
      expect(CREATE_PARTICIPANTS_TABLE).toContain('participants');
    });

    it('should define primary key', () => {
      expect(CREATE_PARTICIPANTS_TABLE).toContain('id VARCHAR(21) PRIMARY KEY');
    });

    it('should define room_id foreign key', () => {
      expect(CREATE_PARTICIPANTS_TABLE).toContain('room_id VARCHAR(21) NOT NULL');
      expect(CREATE_PARTICIPANTS_TABLE).toContain('REFERENCES rooms(id)');
    });

    it('should define user_id foreign key', () => {
      expect(CREATE_PARTICIPANTS_TABLE).toContain('user_id UUID NOT NULL');
      expect(CREATE_PARTICIPANTS_TABLE).toContain('REFERENCES auth.users(id)');
    });

    it('should define role with check constraint', () => {
      expect(CREATE_PARTICIPANTS_TABLE).toContain('role VARCHAR(20)');
      expect(CREATE_PARTICIPANTS_TABLE).toContain("CHECK (role IN ('owner', 'moderator', 'participant'))");
    });

    it('should define time tracking columns', () => {
      expect(CREATE_PARTICIPANTS_TABLE).toContain('joined_at TIMESTAMPTZ');
      expect(CREATE_PARTICIPANTS_TABLE).toContain('left_at TIMESTAMPTZ');
      expect(CREATE_PARTICIPANTS_TABLE).toContain('total_time_seconds INTEGER');
    });

    it('should define is_active column', () => {
      expect(CREATE_PARTICIPANTS_TABLE).toContain('is_active BOOLEAN');
    });
  });

  describe('CREATE_ROOM_HISTORY_TABLE', () => {
    it('should contain CREATE TABLE statement', () => {
      expect(CREATE_ROOM_HISTORY_TABLE).toContain('CREATE TABLE');
      expect(CREATE_ROOM_HISTORY_TABLE).toContain('room_history');
    });

    it('should define event_type with check constraint', () => {
      expect(CREATE_ROOM_HISTORY_TABLE).toContain('event_type VARCHAR(30)');
      expect(CREATE_ROOM_HISTORY_TABLE).toContain("'room_created'");
      expect(CREATE_ROOM_HISTORY_TABLE).toContain("'participant_joined'");
      expect(CREATE_ROOM_HISTORY_TABLE).toContain("'ai_interrupted'");
    });

    it('should define event_data as JSONB', () => {
      expect(CREATE_ROOM_HISTORY_TABLE).toContain('event_data JSONB');
    });
  });

  describe('CREATE_INDEXES', () => {
    it('should create rooms indexes', () => {
      expect(CREATE_INDEXES).toContain('idx_rooms_owner_id');
      expect(CREATE_INDEXES).toContain('idx_rooms_status');
      expect(CREATE_INDEXES).toContain('idx_rooms_created_at');
      expect(CREATE_INDEXES).toContain('idx_rooms_last_activity');
    });

    it('should create participants indexes', () => {
      expect(CREATE_INDEXES).toContain('idx_participants_room_id');
      expect(CREATE_INDEXES).toContain('idx_participants_user_id');
      expect(CREATE_INDEXES).toContain('idx_participants_active');
      expect(CREATE_INDEXES).toContain('idx_participants_peer_id');
    });

    it('should create room_history indexes', () => {
      expect(CREATE_INDEXES).toContain('idx_room_history_room_id');
      expect(CREATE_INDEXES).toContain('idx_room_history_user_id');
      expect(CREATE_INDEXES).toContain('idx_room_history_event_type');
      expect(CREATE_INDEXES).toContain('idx_room_history_created_at');
    });

    it('should use partial indexes for optimization', () => {
      expect(CREATE_INDEXES).toContain('WHERE deleted_at IS NULL');
      expect(CREATE_INDEXES).toContain('WHERE is_active = true');
    });
  });

  describe('FULL_MIGRATION', () => {
    it('should include all table definitions', () => {
      expect(FULL_MIGRATION).toContain('CREATE TABLE IF NOT EXISTS rooms');
      expect(FULL_MIGRATION).toContain('CREATE TABLE IF NOT EXISTS participants');
      expect(FULL_MIGRATION).toContain('CREATE TABLE IF NOT EXISTS room_history');
    });

    it('should include all indexes', () => {
      expect(FULL_MIGRATION).toContain('CREATE INDEX IF NOT EXISTS');
    });
  });
});

// ========== Defaults Tests ==========

describe('Schema Defaults', () => {
  describe('DEFAULT_VOICE_SETTINGS_JSON', () => {
    it('should be valid JSON', () => {
      expect(() => JSON.parse(DEFAULT_VOICE_SETTINGS_JSON)).not.toThrow();
    });

    it('should have pushToTalk mode', () => {
      const settings = JSON.parse(DEFAULT_VOICE_SETTINGS_JSON);
      expect(settings.mode).toBe('pushToTalk');
    });

    it('should have lockDuringAIResponse enabled', () => {
      const settings = JSON.parse(DEFAULT_VOICE_SETTINGS_JSON);
      expect(settings.lockDuringAIResponse).toBe(true);
    });

    it('should have allowInterrupt enabled', () => {
      const settings = JSON.parse(DEFAULT_VOICE_SETTINGS_JSON);
      expect(settings.allowInterrupt).toBe(true);
    });

    it('should have queue settings', () => {
      const settings = JSON.parse(DEFAULT_VOICE_SETTINGS_JSON);
      expect(settings.queueEnabled).toBe(true);
      expect(settings.maxQueueSize).toBe(5);
      expect(settings.queueTimeout).toBe(30000);
    });
  });

  describe('ROOM_DEFAULTS', () => {
    it('should have default max_participants', () => {
      expect(ROOM_DEFAULTS.max_participants).toBe(6);
    });

    it('should have default status', () => {
      expect(ROOM_DEFAULTS.status).toBe('waiting');
    });

    it('should have default ai_personality', () => {
      expect(ROOM_DEFAULTS.ai_personality).toBe('facilitator');
    });

    it('should have voice_settings', () => {
      expect(ROOM_DEFAULTS.voice_settings).toBeDefined();
    });
  });
});

// ========== Validation Tests ==========

describe('Validation Functions', () => {
  describe('validateRoomName', () => {
    it('should accept valid room name', () => {
      const result = validateRoomName('My Room');
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should reject empty name', () => {
      const result = validateRoomName('');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('required');
    });

    it('should reject whitespace-only name', () => {
      const result = validateRoomName('   ');
      expect(result.valid).toBe(false);
    });

    it('should reject name shorter than 3 characters', () => {
      const result = validateRoomName('ab');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('at least 3');
    });

    it('should reject name longer than 100 characters', () => {
      const result = validateRoomName('a'.repeat(101));
      expect(result.valid).toBe(false);
      expect(result.error).toContain('at most 100');
    });

    it('should accept name with exactly 3 characters', () => {
      const result = validateRoomName('abc');
      expect(result.valid).toBe(true);
    });

    it('should accept name with exactly 100 characters', () => {
      const result = validateRoomName('a'.repeat(100));
      expect(result.valid).toBe(true);
    });
  });

  describe('validateMaxParticipants', () => {
    it('should accept valid max participants', () => {
      expect(validateMaxParticipants(2).valid).toBe(true);
      expect(validateMaxParticipants(6).valid).toBe(true);
      expect(validateMaxParticipants(10).valid).toBe(true);
    });

    it('should reject non-integer', () => {
      const result = validateMaxParticipants(5.5);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('integer');
    });

    it('should reject less than 2', () => {
      const result = validateMaxParticipants(1);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('at least 2');
    });

    it('should reject more than 10', () => {
      const result = validateMaxParticipants(11);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('at most 10');
    });
  });

  describe('validateAIPersonality', () => {
    it('should accept valid personalities', () => {
      expect(validateAIPersonality('facilitator').valid).toBe(true);
      expect(validateAIPersonality('assistant').valid).toBe(true);
      expect(validateAIPersonality('expert').valid).toBe(true);
      expect(validateAIPersonality('brainstorm').valid).toBe(true);
      expect(validateAIPersonality('custom').valid).toBe(true);
    });

    it('should reject invalid personality', () => {
      const result = validateAIPersonality('invalid');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid AI personality');
    });
  });

  describe('validateRoomStatus', () => {
    it('should accept valid statuses', () => {
      expect(validateRoomStatus('waiting').valid).toBe(true);
      expect(validateRoomStatus('active').valid).toBe(true);
      expect(validateRoomStatus('full').valid).toBe(true);
      expect(validateRoomStatus('closed').valid).toBe(true);
    });

    it('should reject invalid status', () => {
      const result = validateRoomStatus('invalid');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid room status');
    });
  });

  describe('validatePeerRole', () => {
    it('should accept valid roles', () => {
      expect(validatePeerRole('owner').valid).toBe(true);
      expect(validatePeerRole('moderator').valid).toBe(true);
      expect(validatePeerRole('participant').valid).toBe(true);
    });

    it('should reject invalid role', () => {
      const result = validatePeerRole('invalid');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid peer role');
    });
  });

  describe('validateEventType', () => {
    it('should accept valid event types', () => {
      expect(validateEventType('room_created').valid).toBe(true);
      expect(validateEventType('participant_joined').valid).toBe(true);
      expect(validateEventType('ai_interrupted').valid).toBe(true);
    });

    it('should reject invalid event type', () => {
      const result = validateEventType('invalid');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid event type');
    });
  });

  describe('validateInsertRoom', () => {
    it('should accept valid room data', () => {
      const data: InsertRoom = {
        id: 'room123',
        name: 'Test Room',
        owner_id: 'user-uuid-123',
        voice_settings: DEFAULT_VOICE_SETTINGS_JSON,
      };
      const result = validateInsertRoom(data);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should collect multiple errors', () => {
      const data: InsertRoom = {
        id: 'room123',
        name: 'ab', // Too short
        max_participants: 15, // Too high
        ai_personality: 'invalid' as any,
        owner_id: '', // Empty
        voice_settings: DEFAULT_VOICE_SETTINGS_JSON,
      };
      const result = validateInsertRoom(data);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(1);
    });

    it('should require owner_id', () => {
      const data: InsertRoom = {
        id: 'room123',
        name: 'Test Room',
        owner_id: '',
        voice_settings: DEFAULT_VOICE_SETTINGS_JSON,
      };
      const result = validateInsertRoom(data);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Owner ID is required');
    });
  });

  describe('validateInsertParticipant', () => {
    it('should accept valid participant data', () => {
      const data: InsertParticipant = {
        id: 'participant123',
        room_id: 'room123',
        user_id: 'user-uuid-123',
        peer_id: 'peer123',
        display_name: 'Test User',
      };
      const result = validateInsertParticipant(data);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should require room_id', () => {
      const data: InsertParticipant = {
        id: 'participant123',
        room_id: '',
        user_id: 'user-uuid-123',
        peer_id: 'peer123',
        display_name: 'Test User',
      };
      const result = validateInsertParticipant(data);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Room ID is required');
    });

    it('should require user_id', () => {
      const data: InsertParticipant = {
        id: 'participant123',
        room_id: 'room123',
        user_id: '',
        peer_id: 'peer123',
        display_name: 'Test User',
      };
      const result = validateInsertParticipant(data);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('User ID is required');
    });

    it('should require peer_id', () => {
      const data: InsertParticipant = {
        id: 'participant123',
        room_id: 'room123',
        user_id: 'user-uuid-123',
        peer_id: '',
        display_name: 'Test User',
      };
      const result = validateInsertParticipant(data);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Peer ID is required');
    });

    it('should require display_name', () => {
      const data: InsertParticipant = {
        id: 'participant123',
        room_id: 'room123',
        user_id: 'user-uuid-123',
        peer_id: 'peer123',
        display_name: '',
      };
      const result = validateInsertParticipant(data);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Display name is required');
    });

    it('should reject display_name over 100 characters', () => {
      const data: InsertParticipant = {
        id: 'participant123',
        room_id: 'room123',
        user_id: 'user-uuid-123',
        peer_id: 'peer123',
        display_name: 'a'.repeat(101),
      };
      const result = validateInsertParticipant(data);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('at most 100'))).toBe(true);
    });

    it('should validate role if provided', () => {
      const data: InsertParticipant = {
        id: 'participant123',
        room_id: 'room123',
        user_id: 'user-uuid-123',
        peer_id: 'peer123',
        display_name: 'Test User',
        role: 'invalid' as any,
      };
      const result = validateInsertParticipant(data);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Invalid peer role'))).toBe(true);
    });
  });
});

// ========== Type Guard Tests ==========

describe('Type Guards', () => {
  describe('isRoomStatus', () => {
    it('should return true for valid statuses', () => {
      expect(isRoomStatus('waiting')).toBe(true);
      expect(isRoomStatus('active')).toBe(true);
      expect(isRoomStatus('full')).toBe(true);
      expect(isRoomStatus('closed')).toBe(true);
    });

    it('should return false for invalid values', () => {
      expect(isRoomStatus('invalid')).toBe(false);
      expect(isRoomStatus('')).toBe(false);
      expect(isRoomStatus(null)).toBe(false);
      expect(isRoomStatus(undefined)).toBe(false);
      expect(isRoomStatus(123)).toBe(false);
      expect(isRoomStatus({})).toBe(false);
    });
  });

  describe('isAIPersonality', () => {
    it('should return true for valid personalities', () => {
      expect(isAIPersonality('facilitator')).toBe(true);
      expect(isAIPersonality('assistant')).toBe(true);
      expect(isAIPersonality('expert')).toBe(true);
      expect(isAIPersonality('brainstorm')).toBe(true);
      expect(isAIPersonality('custom')).toBe(true);
    });

    it('should return false for invalid values', () => {
      expect(isAIPersonality('invalid')).toBe(false);
      expect(isAIPersonality('')).toBe(false);
      expect(isAIPersonality(null)).toBe(false);
      expect(isAIPersonality(undefined)).toBe(false);
    });
  });

  describe('isPeerRole', () => {
    it('should return true for valid roles', () => {
      expect(isPeerRole('owner')).toBe(true);
      expect(isPeerRole('moderator')).toBe(true);
      expect(isPeerRole('participant')).toBe(true);
    });

    it('should return false for invalid values', () => {
      expect(isPeerRole('admin')).toBe(false);
      expect(isPeerRole('')).toBe(false);
      expect(isPeerRole(null)).toBe(false);
      expect(isPeerRole(undefined)).toBe(false);
    });
  });

  describe('isRoomEventType', () => {
    it('should return true for valid event types', () => {
      expect(isRoomEventType('room_created')).toBe(true);
      expect(isRoomEventType('room_closed')).toBe(true);
      expect(isRoomEventType('room_deleted')).toBe(true);
      expect(isRoomEventType('settings_updated')).toBe(true);
      expect(isRoomEventType('participant_joined')).toBe(true);
      expect(isRoomEventType('participant_left')).toBe(true);
      expect(isRoomEventType('participant_kicked')).toBe(true);
      expect(isRoomEventType('role_changed')).toBe(true);
      expect(isRoomEventType('ai_session_started')).toBe(true);
      expect(isRoomEventType('ai_session_ended')).toBe(true);
      expect(isRoomEventType('ai_interrupted')).toBe(true);
    });

    it('should return false for invalid values', () => {
      expect(isRoomEventType('invalid_event')).toBe(false);
      expect(isRoomEventType('')).toBe(false);
      expect(isRoomEventType(null)).toBe(false);
      expect(isRoomEventType(undefined)).toBe(false);
    });
  });
});

// ========== Type Interface Tests ==========

describe('Type Interfaces', () => {
  describe('RoomsTable', () => {
    it('should have correct shape', () => {
      const room: RoomsTable = {
        id: 'room123',
        name: 'Test Room',
        description: 'A test room',
        max_participants: 6,
        status: 'waiting',
        ai_personality: 'facilitator',
        custom_instructions: null,
        voice_settings: '{}',
        owner_id: 'user-uuid',
        created_at: new Date(),
        last_activity_at: new Date(),
        closed_at: null,
        deleted_at: null,
      };

      expect(room.id).toBe('room123');
      expect(room.status).toBe('waiting');
    });
  });

  describe('ParticipantsTable', () => {
    it('should have correct shape', () => {
      const participant: ParticipantsTable = {
        id: 'participant123',
        room_id: 'room123',
        user_id: 'user-uuid',
        peer_id: 'peer123',
        display_name: 'Test User',
        avatar_url: null,
        role: 'participant',
        joined_at: new Date(),
        left_at: null,
        total_time_seconds: 0,
        is_active: true,
      };

      expect(participant.id).toBe('participant123');
      expect(participant.is_active).toBe(true);
    });
  });

  describe('RoomHistoryTable', () => {
    it('should have correct shape', () => {
      const event: RoomHistoryTable = {
        id: 'event123',
        room_id: 'room123',
        event_type: 'participant_joined',
        user_id: 'user-uuid',
        peer_id: 'peer123',
        event_data: '{"foo": "bar"}',
        created_at: new Date(),
      };

      expect(event.id).toBe('event123');
      expect(event.event_type).toBe('participant_joined');
    });
  });

  describe('InsertRoom', () => {
    it('should allow partial properties', () => {
      const minimal: InsertRoom = {
        id: 'room123',
        name: 'Test Room',
        owner_id: 'user-uuid',
        voice_settings: '{}',
      };

      expect(minimal.id).toBe('room123');
      expect(minimal.description).toBeUndefined();
    });

    it('should allow full properties', () => {
      const full: InsertRoom = {
        id: 'room123',
        name: 'Test Room',
        description: 'A test room',
        max_participants: 8,
        status: 'active',
        ai_personality: 'expert',
        custom_instructions: 'Be helpful',
        voice_settings: '{}',
        owner_id: 'user-uuid',
        created_at: new Date(),
        last_activity_at: new Date(),
      };

      expect(full.max_participants).toBe(8);
    });
  });

  describe('UpdateRoom', () => {
    it('should allow any subset of properties', () => {
      const update1: UpdateRoom = { name: 'New Name' };
      const update2: UpdateRoom = { status: 'closed' };
      const update3: UpdateRoom = { name: 'New Name', max_participants: 4 };

      expect(update1.name).toBe('New Name');
      expect(update2.status).toBe('closed');
      expect(update3.max_participants).toBe(4);
    });
  });

  describe('RoomWithCount', () => {
    it('should extend RoomsTable with participant_count', () => {
      const room: RoomWithCount = {
        id: 'room123',
        name: 'Test Room',
        description: null,
        max_participants: 6,
        status: 'active',
        ai_personality: 'facilitator',
        custom_instructions: null,
        voice_settings: '{}',
        owner_id: 'user-uuid',
        created_at: new Date(),
        last_activity_at: new Date(),
        closed_at: null,
        deleted_at: null,
        participant_count: 3,
      };

      expect(room.participant_count).toBe(3);
    });
  });

  describe('RoomWithParticipants', () => {
    it('should extend RoomsTable with participants array', () => {
      const room: RoomWithParticipants = {
        id: 'room123',
        name: 'Test Room',
        description: null,
        max_participants: 6,
        status: 'active',
        ai_personality: 'facilitator',
        custom_instructions: null,
        voice_settings: '{}',
        owner_id: 'user-uuid',
        created_at: new Date(),
        last_activity_at: new Date(),
        closed_at: null,
        deleted_at: null,
        participants: [
          {
            id: 'p1',
            room_id: 'room123',
            user_id: 'user1',
            peer_id: 'peer1',
            display_name: 'User 1',
            avatar_url: null,
            role: 'owner',
            joined_at: new Date(),
            left_at: null,
            total_time_seconds: 0,
            is_active: true,
          },
        ],
      };

      expect(room.participants).toHaveLength(1);
      expect(room.participants[0].display_name).toBe('User 1');
    });
  });
});

// ========== Event Types Tests ==========

describe('RoomEventType', () => {
  it('should cover all room lifecycle events', () => {
    const roomEvents: RoomEventType[] = ['room_created', 'room_closed', 'room_deleted', 'settings_updated'];
    roomEvents.forEach(event => {
      expect(isRoomEventType(event)).toBe(true);
    });
  });

  it('should cover all participant events', () => {
    const participantEvents: RoomEventType[] = ['participant_joined', 'participant_left', 'participant_kicked', 'role_changed'];
    participantEvents.forEach(event => {
      expect(isRoomEventType(event)).toBe(true);
    });
  });

  it('should cover all AI events', () => {
    const aiEvents: RoomEventType[] = ['ai_session_started', 'ai_session_ended', 'ai_interrupted'];
    aiEvents.forEach(event => {
      expect(isRoomEventType(event)).toBe(true);
    });
  });
});
