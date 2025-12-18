/**
 * Room Type Definitions
 *
 * Core types for Sync shared room functionality.
 * Part of the Long-Horizon Engineering Protocol - FEAT-100
 * Updated in FEAT-1007 to add voice selection
 */

import type { Peer, PeerId } from "./peer";
import type { RoomVoiceSettings } from "./voice-mode";
import type { RoomTranscriptSettings } from "./transcript";
import type { VoiceOption } from "./voice-ai-provider";

/**
 * Unique identifier for a room
 */
export type RoomId = string;

/**
 * Room status states
 */
export type RoomStatus = "waiting" | "active" | "full" | "closed";

/**
 * AI personality presets for room configuration
 */
export type AIPersonality =
  | "facilitator" // Guides discussions, summarizes, keeps on track
  | "assistant" // General helpful assistant
  | "expert" // Domain expert, technical depth
  | "brainstorm" // Creative ideation partner
  | "custom"; // Custom instructions provided

/**
 * Room creation request payload
 */
export interface CreateRoomRequest {
  /** Display name for the room */
  name: string;
  /** Optional description */
  description?: string;
  /** Maximum number of participants (2-10) */
  maxParticipants?: number;
  /** AI personality preset */
  aiPersonality?: AIPersonality;
  /** Selected AI voice (provider-specific, e.g., "marin" for OpenAI, "ara" for XAI) */
  aiVoice?: VoiceOption;
  /** Custom AI instructions (when aiPersonality is 'custom') */
  customInstructions?: string;
  /** Topic/domain for AI expertise (e.g., "real estate broker", "software engineering") */
  aiTopic?: string;
  /** Voice mode settings */
  voiceSettings?: Partial<RoomVoiceSettings>;
  /** Transcript settings */
  transcriptSettings?: Partial<RoomTranscriptSettings>;
}

/**
 * Room configuration and state
 */
export interface Room {
  /** Unique room identifier */
  id: RoomId;
  /** Display name */
  name: string;
  /** Optional description */
  description?: string;
  /** Maximum participants allowed */
  maxParticipants: number;
  /** Current room status */
  status: RoomStatus;
  /** AI personality configuration */
  aiPersonality: AIPersonality;
  /** Selected AI voice (provider-specific) */
  aiVoice?: VoiceOption;
  /** Custom AI instructions */
  customInstructions?: string;
  /** Topic/domain for AI expertise */
  aiTopic?: string;
  /** Voice mode and turn management settings */
  voiceSettings: RoomVoiceSettings;
  /** Transcript settings */
  transcriptSettings: RoomTranscriptSettings;
  /** Room creator/owner peer ID */
  ownerId: PeerId;
  /** Current participants in the room */
  participants: Peer[];
  /** Number of current participants */
  participantCount: number;
  /** When the room was created */
  createdAt: Date;
  /** When the room was last active */
  lastActivityAt: Date;
}

/**
 * Room summary for list views (excludes full participant details)
 */
export interface RoomSummary {
  id: RoomId;
  name: string;
  description?: string;
  maxParticipants: number;
  participantCount: number;
  status: RoomStatus;
  aiPersonality: AIPersonality;
  /** Selected AI voice */
  aiVoice?: VoiceOption;
  /** Topic/domain for AI expertise (e.g., "real estate broker", "software engineering") */
  aiTopic?: string;
  createdAt: Date;
}

/**
 * Room join request payload
 */
export interface JoinRoomRequest {
  /** Room to join */
  roomId: RoomId;
  /** Display name for this peer */
  displayName: string;
  /** Optional avatar URL */
  avatarUrl?: string;
}

/**
 * Room join response
 */
export interface JoinRoomResponse {
  /** Success status */
  success: boolean;
  /** The room that was joined */
  room?: Room;
  /** Assigned peer information */
  peer?: Peer;
  /** Error message if join failed */
  error?: string;
  /** Error code for programmatic handling */
  errorCode?:
    | "ROOM_NOT_FOUND"
    | "ROOM_FULL"
    | "ROOM_CLOSED"
    | "ALREADY_IN_ROOM";
}

/**
 * Room update request (for owners/moderators)
 */
export interface UpdateRoomRequest {
  name?: string;
  description?: string;
  maxParticipants?: number;
  aiPersonality?: AIPersonality;
  aiVoice?: VoiceOption;
  customInstructions?: string;
  voiceSettings?: Partial<RoomVoiceSettings>;
}

/**
 * Room list query parameters
 */
export interface ListRoomsQuery {
  /** Filter by status */
  status?: RoomStatus | RoomStatus[];
  /** Search by name */
  search?: string;
  /** Pagination offset */
  offset?: number;
  /** Pagination limit */
  limit?: number;
  /** Sort field */
  sortBy?: "createdAt" | "name" | "participantCount";
  /** Sort direction */
  sortOrder?: "asc" | "desc";
}

/**
 * Room list response
 */
export interface ListRoomsResponse {
  rooms: RoomSummary[];
  total: number;
  offset: number;
  limit: number;
}

/**
 * Room event types for real-time updates
 */
export type RoomEventType =
  | "room:created"
  | "room:updated"
  | "room:closed"
  | "room:deleted";

/**
 * Room event payload
 */
export interface RoomEvent {
  type: RoomEventType;
  roomId: RoomId;
  room?: Room | RoomSummary;
  timestamp: Date;
}
