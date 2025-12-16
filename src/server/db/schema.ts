/**
 * Database Schema
 *
 * TypeScript schema definitions for room persistence.
 * Compatible with Drizzle ORM and PostgreSQL (Supabase).
 *
 * Part of the Long-Horizon Engineering Protocol - FEAT-401
 */

import type { UserId } from "@/types/auth";
import type { RoomId, RoomStatus, AIPersonality } from "@/types/room";
import type { PeerId, PeerRole } from "@/types/peer";
import type { VoiceMode } from "@/types/voice-mode";

// ========== Table Schemas ==========

/**
 * Rooms table schema
 * Stores room configuration and metadata
 */
export interface RoomsTable {
  /** Primary key - unique room ID (nanoid) */
  id: RoomId;
  /** Display name */
  name: string;
  /** Optional description */
  description: string | null;
  /** Maximum participants (2-10) */
  max_participants: number;
  /** Current status */
  status: RoomStatus;
  /** AI personality preset */
  ai_personality: AIPersonality;
  /** Custom AI instructions (JSON) */
  custom_instructions: string | null;
  /** Voice settings (JSON) */
  voice_settings: string;
  /** Owner user ID (references auth.users) */
  owner_id: UserId;
  /** When created */
  created_at: Date;
  /** When last active */
  last_activity_at: Date;
  /** When closed (null if active) */
  closed_at: Date | null;
  /** Soft delete timestamp */
  deleted_at: Date | null;
}

/**
 * Room participants table schema
 * Tracks current and historical participants
 */
export interface ParticipantsTable {
  /** Primary key - unique participant record ID */
  id: string;
  /** Room ID (references rooms) */
  room_id: RoomId;
  /** User ID (references auth.users) */
  user_id: UserId;
  /** Peer ID for this session */
  peer_id: PeerId;
  /** Display name in room */
  display_name: string;
  /** Avatar URL */
  avatar_url: string | null;
  /** Role in room */
  role: PeerRole;
  /** When joined */
  joined_at: Date;
  /** When left (null if still in room) */
  left_at: Date | null;
  /** Total time in room (seconds) */
  total_time_seconds: number;
  /** Whether currently active */
  is_active: boolean;
}

/**
 * Room history table schema
 * Records room events for analytics
 */
export interface RoomHistoryTable {
  /** Primary key - unique event ID */
  id: string;
  /** Room ID (references rooms) */
  room_id: RoomId;
  /** Event type */
  event_type: RoomEventType;
  /** User who triggered event (if applicable) */
  user_id: UserId | null;
  /** Peer ID (if applicable) */
  peer_id: PeerId | null;
  /** Event data (JSON) */
  event_data: string | null;
  /** When event occurred */
  created_at: Date;
}

/**
 * Room event types for history
 */
export type RoomEventType =
  | "room_created"
  | "room_closed"
  | "room_deleted"
  | "settings_updated"
  | "participant_joined"
  | "participant_left"
  | "participant_kicked"
  | "role_changed"
  | "ai_session_started"
  | "ai_session_ended"
  | "ai_interrupted";

// ========== Insert/Update Types ==========

/**
 * Insert type for rooms table
 */
export interface InsertRoom {
  id: RoomId;
  name: string;
  description?: string | null;
  max_participants?: number;
  status?: RoomStatus;
  ai_personality?: AIPersonality;
  custom_instructions?: string | null;
  voice_settings: string;
  owner_id: UserId;
  created_at?: Date;
  last_activity_at?: Date;
}

/**
 * Update type for rooms table
 */
export interface UpdateRoom {
  name?: string;
  description?: string | null;
  max_participants?: number;
  status?: RoomStatus;
  ai_personality?: AIPersonality;
  custom_instructions?: string | null;
  voice_settings?: string;
  last_activity_at?: Date;
  closed_at?: Date | null;
  deleted_at?: Date | null;
}

/**
 * Insert type for participants table
 */
export interface InsertParticipant {
  id: string;
  room_id: RoomId;
  user_id: UserId;
  peer_id: PeerId;
  display_name: string;
  avatar_url?: string | null;
  role?: PeerRole;
  joined_at?: Date;
  is_active?: boolean;
}

/**
 * Update type for participants table
 */
export interface UpdateParticipant {
  display_name?: string;
  avatar_url?: string | null;
  role?: PeerRole;
  left_at?: Date | null;
  total_time_seconds?: number;
  is_active?: boolean;
}

/**
 * Insert type for room history table
 */
export interface InsertRoomHistory {
  id: string;
  room_id: RoomId;
  event_type: RoomEventType;
  user_id?: UserId | null;
  peer_id?: PeerId | null;
  event_data?: string | null;
  created_at?: Date;
}

// ========== Query Result Types ==========

/**
 * Room with participant count
 */
export interface RoomWithCount extends RoomsTable {
  participant_count: number;
}

/**
 * Room with full details including participants
 */
export interface RoomWithParticipants extends RoomsTable {
  participants: ParticipantsTable[];
}

/**
 * Participant with user info
 */
export interface ParticipantWithUser extends ParticipantsTable {
  user_email?: string;
}

// ========== SQL Schema Definitions ==========

/**
 * SQL for creating rooms table
 */
export const CREATE_ROOMS_TABLE = `
CREATE TABLE IF NOT EXISTS rooms (
  id VARCHAR(21) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  max_participants INTEGER NOT NULL DEFAULT 6 CHECK (max_participants >= 2 AND max_participants <= 10),
  status VARCHAR(20) NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'active', 'full', 'closed')),
  ai_personality VARCHAR(20) NOT NULL DEFAULT 'facilitator' CHECK (ai_personality IN ('facilitator', 'assistant', 'expert', 'brainstorm', 'custom')),
  custom_instructions TEXT,
  voice_settings JSONB NOT NULL DEFAULT '{}',
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ
);
`;

/**
 * SQL for creating participants table
 */
export const CREATE_PARTICIPANTS_TABLE = `
CREATE TABLE IF NOT EXISTS participants (
  id VARCHAR(21) PRIMARY KEY,
  room_id VARCHAR(21) NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  peer_id VARCHAR(21) NOT NULL,
  display_name VARCHAR(100) NOT NULL,
  avatar_url TEXT,
  role VARCHAR(20) NOT NULL DEFAULT 'participant' CHECK (role IN ('owner', 'moderator', 'participant')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  left_at TIMESTAMPTZ,
  total_time_seconds INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true
);
`;

/**
 * SQL for creating room_history table
 */
export const CREATE_ROOM_HISTORY_TABLE = `
CREATE TABLE IF NOT EXISTS room_history (
  id VARCHAR(21) PRIMARY KEY,
  room_id VARCHAR(21) NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  event_type VARCHAR(30) NOT NULL CHECK (event_type IN (
    'room_created', 'room_closed', 'room_deleted', 'settings_updated',
    'participant_joined', 'participant_left', 'participant_kicked',
    'role_changed', 'ai_session_started', 'ai_session_ended', 'ai_interrupted'
  )),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  peer_id VARCHAR(21),
  event_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`;

/**
 * SQL for creating indexes
 */
export const CREATE_INDEXES = `
-- Rooms indexes
CREATE INDEX IF NOT EXISTS idx_rooms_owner_id ON rooms(owner_id);
CREATE INDEX IF NOT EXISTS idx_rooms_status ON rooms(status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_rooms_created_at ON rooms(created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_rooms_last_activity ON rooms(last_activity_at DESC) WHERE deleted_at IS NULL;

-- Participants indexes
CREATE INDEX IF NOT EXISTS idx_participants_room_id ON participants(room_id);
CREATE INDEX IF NOT EXISTS idx_participants_user_id ON participants(user_id);
CREATE INDEX IF NOT EXISTS idx_participants_active ON participants(room_id, is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_participants_peer_id ON participants(peer_id);

-- Room history indexes
CREATE INDEX IF NOT EXISTS idx_room_history_room_id ON room_history(room_id);
CREATE INDEX IF NOT EXISTS idx_room_history_user_id ON room_history(user_id);
CREATE INDEX IF NOT EXISTS idx_room_history_event_type ON room_history(event_type);
CREATE INDEX IF NOT EXISTS idx_room_history_created_at ON room_history(created_at DESC);
`;

/**
 * SQL for all migrations combined
 */
export const FULL_MIGRATION = `
-- Sync Database Schema
-- Part of FEAT-401: Room Persistence

${CREATE_ROOMS_TABLE}

${CREATE_PARTICIPANTS_TABLE}

${CREATE_ROOM_HISTORY_TABLE}

${CREATE_INDEXES}
`;

// ========== Default Values ==========

/**
 * Default voice settings JSON
 */
export const DEFAULT_VOICE_SETTINGS_JSON = JSON.stringify({
  mode: "pushToTalk" as VoiceMode,
  lockDuringAIResponse: true,
  allowInterrupt: true,
  enablePeerAudio: true,
  queueEnabled: true,
  maxQueueSize: 5,
  queueTimeout: 30000,
  designatedSpeakerId: null,
});

/**
 * Default values for room creation
 */
export const ROOM_DEFAULTS = {
  max_participants: 6,
  status: "waiting" as RoomStatus,
  ai_personality: "facilitator" as AIPersonality,
  voice_settings: DEFAULT_VOICE_SETTINGS_JSON,
};

// ========== Validation ==========

/**
 * Validate room name
 */
export function validateRoomName(name: string): {
  valid: boolean;
  error?: string;
} {
  if (!name || name.trim().length === 0) {
    return { valid: false, error: "Room name is required" };
  }
  if (name.length < 3) {
    return { valid: false, error: "Room name must be at least 3 characters" };
  }
  if (name.length > 100) {
    return { valid: false, error: "Room name must be at most 100 characters" };
  }
  return { valid: true };
}

/**
 * Validate max participants
 */
export function validateMaxParticipants(max: number): {
  valid: boolean;
  error?: string;
} {
  if (!Number.isInteger(max)) {
    return { valid: false, error: "Max participants must be an integer" };
  }
  if (max < 2) {
    return { valid: false, error: "Max participants must be at least 2" };
  }
  if (max > 10) {
    return { valid: false, error: "Max participants must be at most 10" };
  }
  return { valid: true };
}

/**
 * Validate AI personality
 */
export function validateAIPersonality(personality: string): {
  valid: boolean;
  error?: string;
} {
  const valid: AIPersonality[] = [
    "facilitator",
    "assistant",
    "expert",
    "brainstorm",
    "custom",
  ];
  if (!valid.includes(personality as AIPersonality)) {
    return { valid: false, error: `Invalid AI personality: ${personality}` };
  }
  return { valid: true };
}

/**
 * Validate room status
 */
export function validateRoomStatus(status: string): {
  valid: boolean;
  error?: string;
} {
  const valid: RoomStatus[] = ["waiting", "active", "full", "closed"];
  if (!valid.includes(status as RoomStatus)) {
    return { valid: false, error: `Invalid room status: ${status}` };
  }
  return { valid: true };
}

/**
 * Validate peer role
 */
export function validatePeerRole(role: string): {
  valid: boolean;
  error?: string;
} {
  const valid: PeerRole[] = ["owner", "moderator", "participant"];
  if (!valid.includes(role as PeerRole)) {
    return { valid: false, error: `Invalid peer role: ${role}` };
  }
  return { valid: true };
}

/**
 * Validate event type
 */
export function validateEventType(eventType: string): {
  valid: boolean;
  error?: string;
} {
  const valid: RoomEventType[] = [
    "room_created",
    "room_closed",
    "room_deleted",
    "settings_updated",
    "participant_joined",
    "participant_left",
    "participant_kicked",
    "role_changed",
    "ai_session_started",
    "ai_session_ended",
    "ai_interrupted",
  ];
  if (!valid.includes(eventType as RoomEventType)) {
    return { valid: false, error: `Invalid event type: ${eventType}` };
  }
  return { valid: true };
}

/**
 * Validate full room insert data
 */
export function validateInsertRoom(data: InsertRoom): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  const nameResult = validateRoomName(data.name);
  if (!nameResult.valid) errors.push(nameResult.error!);

  if (data.max_participants !== undefined) {
    const maxResult = validateMaxParticipants(data.max_participants);
    if (!maxResult.valid) errors.push(maxResult.error!);
  }

  if (data.ai_personality !== undefined) {
    const personalityResult = validateAIPersonality(data.ai_personality);
    if (!personalityResult.valid) errors.push(personalityResult.error!);
  }

  if (data.status !== undefined) {
    const statusResult = validateRoomStatus(data.status);
    if (!statusResult.valid) errors.push(statusResult.error!);
  }

  if (!data.owner_id) {
    errors.push("Owner ID is required");
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate participant insert data
 */
export function validateInsertParticipant(data: InsertParticipant): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!data.room_id) errors.push("Room ID is required");
  if (!data.user_id) errors.push("User ID is required");
  if (!data.peer_id) errors.push("Peer ID is required");

  if (!data.display_name || data.display_name.trim().length === 0) {
    errors.push("Display name is required");
  } else if (data.display_name.length > 100) {
    errors.push("Display name must be at most 100 characters");
  }

  if (data.role !== undefined) {
    const roleResult = validatePeerRole(data.role);
    if (!roleResult.valid) errors.push(roleResult.error!);
  }

  return { valid: errors.length === 0, errors };
}

// ========== Type Guards ==========

/**
 * Check if value is a valid RoomStatus
 */
export function isRoomStatus(value: unknown): value is RoomStatus {
  return (
    typeof value === "string" &&
    ["waiting", "active", "full", "closed"].includes(value)
  );
}

/**
 * Check if value is a valid AIPersonality
 */
export function isAIPersonality(value: unknown): value is AIPersonality {
  return (
    typeof value === "string" &&
    ["facilitator", "assistant", "expert", "brainstorm", "custom"].includes(
      value,
    )
  );
}

/**
 * Check if value is a valid PeerRole
 */
export function isPeerRole(value: unknown): value is PeerRole {
  return (
    typeof value === "string" &&
    ["owner", "moderator", "participant"].includes(value)
  );
}

/**
 * Check if value is a valid RoomEventType
 */
export function isRoomEventType(value: unknown): value is RoomEventType {
  const valid = [
    "room_created",
    "room_closed",
    "room_deleted",
    "settings_updated",
    "participant_joined",
    "participant_left",
    "participant_kicked",
    "role_changed",
    "ai_session_started",
    "ai_session_ended",
    "ai_interrupted",
  ];
  return typeof value === "string" && valid.includes(value);
}
