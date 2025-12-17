/**
 * Video Player Type Definitions
 *
 * Types for synchronized video playback using YouTube videos from search results.
 * Supports playlist management, playback state synchronization, and Socket.io events.
 *
 * Part of the Long-Horizon Engineering Protocol - FEAT-800
 */

import type { RoomId } from "./room";
import type { PeerId } from "./peer";
import type { SerperVideoResult } from "./search";

// ============================================================================
// Video Playlist Types
// ============================================================================

/**
 * Unique identifier for a video playlist
 */
export type PlaylistId = string;

/**
 * Video playlist containing YouTube videos from search results
 */
export interface VideoPlaylist {
  /** Unique playlist ID */
  id: PlaylistId;
  /** Room this playlist belongs to */
  roomId: RoomId;
  /** Videos in the playlist (from search results) */
  videos: SerperVideoResult[];
  /** Currently playing video index (0-indexed) */
  currentIndex: number;
  /** When the playlist was created */
  createdAt: Date;
  /** Original search query that produced these videos */
  query: string;
}

/**
 * Create a new playlist ID
 */
export function createPlaylistId(): PlaylistId {
  return `playlist_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

// ============================================================================
// Video Playback State Types
// ============================================================================

/**
 * Video playback state for synchronization
 */
export interface VideoPlaybackState {
  /** Whether the video player is open/visible */
  isOpen: boolean;
  /** Whether video is currently playing */
  isPlaying: boolean;
  /** Whether video is paused */
  isPaused: boolean;
  /** Current video index in playlist */
  currentIndex: number;
  /** Current playback time in seconds */
  currentTime: number;
  /** Current playlist (null if no video active) */
  playlist: VideoPlaylist | null;
  /** Server timestamp when playback started (for sync) */
  syncedStartTime: number;
  /** Peer who triggered the current playback */
  triggeredBy: PeerId | null;
  /** Last sync timestamp */
  lastSyncAt: number;
}

/**
 * Initial/default video playback state
 */
export const INITIAL_VIDEO_STATE: VideoPlaybackState = {
  isOpen: false,
  isPlaying: false,
  isPaused: false,
  currentIndex: 0,
  currentTime: 0,
  playlist: null,
  syncedStartTime: 0,
  triggeredBy: null,
  lastSyncAt: 0,
};

// ============================================================================
// Video Action Types
// ============================================================================

/**
 * Video playback actions that can be triggered via voice or UI
 */
export type VideoAction =
  | "play"
  | "stop"
  | "pause"
  | "resume"
  | "next"
  | "previous"
  | "seek";

/**
 * Function call arguments for playVideo from OpenAI
 */
export interface PlayVideoFunctionArgs {
  /** Action to perform */
  action: VideoAction;
  /** Seek time in seconds (only for seek action) */
  seekTime?: number;
}

// ============================================================================
// Socket.io Event Payload Types
// ============================================================================

/**
 * Payload for video:play event - starts playlist playback
 */
export interface VideoPlayPayload {
  /** Room ID */
  roomId: RoomId;
  /** Playlist to play */
  playlist: VideoPlaylist;
  /** Starting video index */
  currentIndex: number;
  /** Server timestamp for synchronized start */
  syncedStartTime: number;
  /** Peer who triggered playback */
  triggeredBy: PeerId;
}

/**
 * Payload for video:stop event - stops and closes player
 */
export interface VideoStopPayload {
  /** Room ID */
  roomId: RoomId;
  /** Peer who triggered stop */
  triggeredBy: PeerId;
}

/**
 * Payload for video:pause event
 */
export interface VideoPausePayload {
  /** Room ID */
  roomId: RoomId;
  /** Current playback time when paused */
  currentTime: number;
  /** Peer who triggered pause */
  triggeredBy: PeerId;
}

/**
 * Payload for video:resume event
 */
export interface VideoResumePayload {
  /** Room ID */
  roomId: RoomId;
  /** Server timestamp for synchronized resume */
  syncedStartTime: number;
  /** Current time to resume from */
  currentTime: number;
  /** Peer who triggered resume */
  triggeredBy: PeerId;
}

/**
 * Payload for video:seek event
 */
export interface VideoSeekPayload {
  /** Room ID */
  roomId: RoomId;
  /** Time to seek to in seconds */
  time: number;
  /** Peer who triggered seek */
  triggeredBy: PeerId;
}

/**
 * Payload for video:next event - advance to next video
 */
export interface VideoNextPayload {
  /** Room ID */
  roomId: RoomId;
  /** New video index */
  currentIndex: number;
  /** Server timestamp for synchronized start */
  syncedStartTime: number;
  /** Peer who triggered next (or 'auto' for auto-advance) */
  triggeredBy: PeerId | "auto";
}

/**
 * Payload for video:previous event - go to previous video
 */
export interface VideoPreviousPayload {
  /** Room ID */
  roomId: RoomId;
  /** New video index */
  currentIndex: number;
  /** Server timestamp for synchronized start */
  syncedStartTime: number;
  /** Peer who triggered previous */
  triggeredBy: PeerId;
}

/**
 * Payload for video:state event - full state for late joiners
 */
export interface VideoStatePayload {
  /** Room ID */
  roomId: RoomId;
  /** Full playback state */
  state: VideoPlaybackState;
}

/**
 * Payload for video:sync request from client
 */
export interface VideoSyncRequestPayload {
  /** Room ID */
  roomId: RoomId;
  /** Client's current playback time */
  currentTime: number;
  /** Client's peer ID */
  peerId: PeerId;
}

/**
 * Payload for video:sync response from server
 */
export interface VideoSyncResponsePayload {
  /** Room ID */
  roomId: RoomId;
  /** Expected current time based on server */
  expectedTime: number;
  /** Server timestamp */
  serverTime: number;
}

/**
 * Payload for video:ended event - current video finished
 */
export interface VideoEndedPayload {
  /** Room ID */
  roomId: RoomId;
  /** Index of video that ended */
  videoIndex: number;
  /** Peer ID reporting the end */
  peerId: PeerId;
}

// ============================================================================
// YouTube Utility Types and Functions
// ============================================================================

/**
 * YouTube video ID (11 characters)
 */
export type YouTubeVideoId = string;

/**
 * Extract YouTube video ID from various URL formats
 *
 * Supports:
 * - https://www.youtube.com/watch?v=VIDEO_ID
 * - https://youtu.be/VIDEO_ID
 * - https://www.youtube.com/embed/VIDEO_ID
 * - https://www.youtube.com/v/VIDEO_ID
 * - https://www.youtube-nocookie.com/embed/VIDEO_ID
 *
 * @param url - YouTube URL
 * @returns Video ID or null if not a valid YouTube URL
 */
export function extractYouTubeVideoId(url: string): YouTubeVideoId | null {
  if (!url) return null;

  // Patterns for different YouTube URL formats
  const patterns = [
    // Standard watch URL: youtube.com/watch?v=VIDEO_ID
    /(?:youtube\.com\/watch\?v=)([a-zA-Z0-9_-]{11})/,
    // Short URL: youtu.be/VIDEO_ID
    /(?:youtu\.be\/)([a-zA-Z0-9_-]{11})/,
    // Embed URL: youtube.com/embed/VIDEO_ID
    /(?:youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    // Old embed format: youtube.com/v/VIDEO_ID
    /(?:youtube\.com\/v\/)([a-zA-Z0-9_-]{11})/,
    // Privacy-enhanced embed: youtube-nocookie.com/embed/VIDEO_ID
    /(?:youtube-nocookie\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }

  return null;
}

/**
 * Check if a URL is a valid YouTube video URL
 *
 * @param url - URL to check
 * @returns True if URL is a valid YouTube video URL
 */
export function isYouTubeUrl(url: string): boolean {
  return extractYouTubeVideoId(url) !== null;
}

/**
 * Generate YouTube embed URL from video ID
 *
 * @param videoId - YouTube video ID
 * @param options - Embed options
 * @returns Embed URL for iframe
 */
export function getYouTubeEmbedUrl(
  videoId: YouTubeVideoId,
  options: {
    autoplay?: boolean;
    start?: number;
    enableJsApi?: boolean;
    origin?: string;
  } = {},
): string {
  const {
    autoplay = false,
    start = 0,
    enableJsApi = true,
    origin = typeof window !== "undefined" ? window.location.origin : "",
  } = options;

  const params = new URLSearchParams({
    autoplay: autoplay ? "1" : "0",
    enablejsapi: enableJsApi ? "1" : "0",
    origin,
    ...(start > 0 ? { start: String(Math.floor(start)) } : {}),
  });

  // Use privacy-enhanced domain
  return `https://www.youtube-nocookie.com/embed/${videoId}?${params.toString()}`;
}

/**
 * Filter videos from search results to only include valid YouTube videos
 *
 * @param videos - Video search results
 * @returns Only videos with valid YouTube URLs
 */
export function filterYouTubeVideos(
  videos: SerperVideoResult[],
): SerperVideoResult[] {
  return videos.filter((video) => isYouTubeUrl(video.link));
}

/**
 * Parse duration string (e.g., "5:30", "1:23:45") to seconds
 *
 * @param duration - Duration string from search results
 * @returns Duration in seconds
 */
export function parseDurationToSeconds(duration: string | undefined): number {
  if (!duration) return 0;

  const parts = duration.split(":").map(Number);

  if (parts.length === 3) {
    // HH:MM:SS
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  } else if (parts.length === 2) {
    // MM:SS
    return parts[0] * 60 + parts[1];
  } else if (parts.length === 1) {
    // SS
    return parts[0];
  }

  return 0;
}

/**
 * Format seconds as duration string (e.g., "5:30", "1:23:45")
 *
 * @param seconds - Duration in seconds
 * @returns Formatted duration string
 */
export function formatSecondsToDuration(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

// ============================================================================
// Client-Side Hook State Types
// ============================================================================

/**
 * Video loading state for UI
 */
export type VideoLoadingState = "idle" | "loading" | "ready" | "error";

/**
 * Client-side video state for useVideo hook
 */
export interface VideoState {
  /** Current playback state */
  playback: VideoPlaybackState;
  /** Loading state */
  loadingState: VideoLoadingState;
  /** Error message if any */
  error: string | null;
  /** Whether YouTube API is ready */
  isApiReady: boolean;
}

/**
 * Initial client-side video state
 */
export const INITIAL_CLIENT_VIDEO_STATE: VideoState = {
  playback: INITIAL_VIDEO_STATE,
  loadingState: "idle",
  error: null,
  isApiReady: false,
};
