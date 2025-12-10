/**
 * Transcript Type Definitions
 *
 * Types for the dual-track unified transcript system.
 * Supports ambient audio transcription, PTT transcription, and AI responses.
 *
 * Part of the Long-Horizon Engineering Protocol - FEAT-500
 */

import type { RoomId } from "./room";
import type { PeerId } from "./peer";

/**
 * Unique identifier for a transcript entry
 */
export type TranscriptEntryId = string;

/**
 * Unique identifier for a transcript summary
 */
export type TranscriptSummaryId = string;

/**
 * Types of transcript entries
 */
export type TranscriptEntryType =
  | "ambient" // Regular peer-to-peer speech
  | "ptt" // Push-to-talk speech directed at AI
  | "ai_response" // AI response to PTT
  | "system"; // System events (join, leave, etc.)

/**
 * Transcript retention period options
 */
export type TranscriptRetention = "session" | "7days" | "30days";

/**
 * Individual transcript entry
 */
export interface TranscriptEntry {
  /** Unique entry ID */
  id: TranscriptEntryId;

  /** Room this entry belongs to */
  roomId: RoomId;

  /** Entry timestamp */
  timestamp: Date;

  /** Speaker display name */
  speaker: string;

  /** Speaker peer ID (null for AI and system messages) */
  speakerId: PeerId | null;

  /** Transcript content */
  content: string;

  /** Entry type */
  type: TranscriptEntryType;

  /** Token count estimate (for context management) */
  tokenEstimate?: number;

  /** Duration of the audio in milliseconds */
  audioDurationMs?: number;

  /** Whether this is a partial/streaming entry */
  isPartial?: boolean;
}

/**
 * Transcript summary generated periodically
 */
export interface TranscriptSummary {
  /** Unique summary ID */
  id: TranscriptSummaryId;

  /** Room this summary belongs to */
  roomId: RoomId;

  /** Summary timestamp */
  timestamp: Date;

  /** Full summary text */
  content: string;

  /** Bullet point list of key topics */
  bulletPoints: string[];

  /** Number of entries summarized */
  entriesSummarized: number;

  /** Token count of the summary */
  tokenCount: number;

  /** Time range covered (start) */
  coverageStart: Date;

  /** Time range covered (end) */
  coverageEnd: Date;
}

/**
 * Transcript settings for a room
 */
export interface RoomTranscriptSettings {
  /** Enable live transcription */
  enabled: boolean;

  /** Enable AI-generated periodic summaries */
  summariesEnabled: boolean;

  /** Transcript retention period */
  retention: TranscriptRetention;

  /** Allow participants to download transcript */
  allowDownload: boolean;
}

/**
 * Default transcript settings
 */
export const DEFAULT_TRANSCRIPT_SETTINGS: RoomTranscriptSettings = {
  enabled: true,
  summariesEnabled: true,
  retention: "session",
  allowDownload: true,
};

/**
 * Client-side transcript state
 */
export interface TranscriptState {
  /** All transcript entries (newest last) */
  entries: TranscriptEntry[];

  /** All summaries (newest last) */
  summaries: TranscriptSummary[];

  /** Loading state for initial load */
  isLoading: boolean;

  /** Loading state for pagination */
  isLoadingMore: boolean;

  /** Loading state for summary generation */
  isGeneratingSummary?: boolean;

  /** Error state */
  error: string | null;

  /** Has more history to load (pagination) */
  hasMore: boolean;

  /** Auto-scroll enabled */
  autoScroll: boolean;

  /** Total entry count (for pagination) */
  totalEntries: number;
}

/**
 * Transcript history request payload (client to server)
 */
export interface TranscriptHistoryRequest {
  /** Room to get history for */
  roomId: RoomId;

  /** Maximum entries to return */
  limit: number;

  /** Get entries before this ID (for pagination) */
  beforeId?: TranscriptEntryId;

  /** Include summaries in response */
  includeSummaries?: boolean;
}

/**
 * Transcript history response payload (server to client)
 */
export interface TranscriptHistoryResponse {
  /** Transcript entries (oldest first within this batch) */
  entries: TranscriptEntry[];

  /** Summaries within the time range */
  summaries: TranscriptSummary[];

  /** Has more older entries */
  hasMore: boolean;

  /** Total entry count in room */
  totalEntries: number;
}

/**
 * New transcript entry event payload (server to client)
 */
export interface TranscriptEntryEvent {
  /** The new entry */
  entry: TranscriptEntry;
}

/**
 * New summary event payload (server to client)
 */
export interface TranscriptSummaryEvent {
  /** The new summary */
  summary: TranscriptSummary;
}

/**
 * Transcript download format options
 */
export type TranscriptDownloadFormat = "txt" | "md";

/**
 * Transcript download options
 */
export interface TranscriptDownloadOptions {
  /** File format */
  format: TranscriptDownloadFormat;

  /** Include full transcript entries */
  includeTranscript: boolean;

  /** Include summaries */
  includeSummaries: boolean;

  /** Include timestamps */
  includeTimestamps: boolean;
}

/**
 * Transcript API response for GET /api/rooms/:roomId/transcript
 */
export interface TranscriptApiResponse {
  /** Room ID */
  roomId: RoomId;

  /** Room name */
  roomName: string;

  /** Session start time */
  startTime: Date;

  /** Session end time (null if ongoing) */
  endTime: Date | null;

  /** Participant names */
  participants: string[];

  /** Transcript entries */
  entries: TranscriptEntry[];

  /** Summaries */
  summaries: TranscriptSummary[];

  /** Total entry count */
  totalEntries: number;

  /** Pagination offset */
  offset: number;

  /** Pagination limit */
  limit: number;
}

/**
 * Transcript Socket.io event types
 */
export type TranscriptEventType =
  | "transcript:entry" // New entry added
  | "transcript:summary" // New summary generated
  | "transcript:request-history" // Client requests history
  | "transcript:history"; // Server sends history

/**
 * Type guard to check if an entry is a speech entry (not system)
 */
export function isSpeechEntry(entry: TranscriptEntry): boolean {
  return (
    entry.type === "ambient" ||
    entry.type === "ptt" ||
    entry.type === "ai_response"
  );
}

/**
 * Type guard to check if an entry is from a human (not AI or system)
 */
export function isHumanEntry(entry: TranscriptEntry): boolean {
  return entry.type === "ambient" || entry.type === "ptt";
}

/**
 * Type guard to check if an entry is AI-related
 */
export function isAIEntry(entry: TranscriptEntry): boolean {
  return entry.type === "ai_response";
}

/**
 * Format a transcript entry for display
 */
export function formatEntryTimestamp(timestamp: Date): string {
  return timestamp.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

/**
 * Format relative time (e.g., "2 min ago")
 */
export function formatRelativeTime(timestamp: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - timestamp.getTime();
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 1) return "Just now";
  if (diffMin === 1) return "1 min ago";
  if (diffMin < 60) return `${diffMin} min ago`;

  const diffHours = Math.floor(diffMin / 60);
  if (diffHours === 1) return "1 hour ago";
  if (diffHours < 24) return `${diffHours} hours ago`;

  return formatEntryTimestamp(timestamp);
}
