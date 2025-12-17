/**
 * Video Summary Events Handler
 *
 * Handles voice-activated video summary requests from OpenAI function calls.
 * Integrates YouTubeService for metadata and SummaryLLMService for conversational summaries.
 *
 * Part of the Long-Horizon Engineering Protocol - FEAT-903
 */

import type { Server as SocketIOServer } from "socket.io";
import type { RoomId } from "@/types/room";
import type { FunctionCallEvent } from "@/types/search";
import type {
  SummaryMode,
  VideoSummaryRequest,
  VideoSummaryResponse,
  YouTubeVideoMetadata,
} from "@/types/video-summary";
import type { VideoPlaybackState } from "@/types/video";
import { extractYouTubeVideoId } from "@/types/video";
import {
  YouTubeService,
  createYouTubeService,
  createYouTubeServiceWithConfig,
} from "./youtube-service";
import {
  SummaryLLMService,
  createSummaryLLMService,
  createSummaryLLMServiceWithConfig,
} from "./summary-llm-service";
import type { VideoSummaryFunctionArgs } from "./openai-realtime-client";

/**
 * Video summary event handler configuration
 */
export interface VideoSummaryEventsConfig {
  /** YouTube Data API key */
  youtubeApiKey: string;
  /** OpenAI API key for LLM summaries */
  openaiApiKey: string;
  /** Socket.io server instance */
  io: SocketIOServer;
  /** Callback to send function output back to OpenAI */
  sendFunctionOutput: (roomId: RoomId, callId: string, output: string) => void;
  /** Callback to get current video state for a room */
  getVideoState: (roomId: RoomId) => VideoPlaybackState | null;
}

/**
 * Per-room summary state
 */
interface RoomSummaryState {
  /** Last generated summary */
  lastSummary: VideoSummaryResponse | null;
  /** Is a summary being generated */
  isGenerating: boolean;
  /** Last video ID summarized */
  lastVideoId: string | null;
}

/**
 * Socket.io payload for video summary broadcast
 */
export interface VideoSummaryPayload {
  roomId: RoomId;
  summary: VideoSummaryResponse;
}

/**
 * Socket.io payload for video summary error
 */
export interface VideoSummaryErrorPayload {
  roomId: RoomId;
  error: string;
  videoId?: string;
}

/**
 * Video Summary Events Handler
 *
 * Manages video summary requests from OpenAI function calls and broadcasts results.
 */
export class VideoSummaryEventsHandler {
  private io: SocketIOServer;
  private youtubeService: YouTubeService;
  private summaryLLMService: SummaryLLMService;
  private sendFunctionOutput: (
    roomId: RoomId,
    callId: string,
    output: string,
  ) => void;
  private getVideoState: (roomId: RoomId) => VideoPlaybackState | null;
  private roomSummaryStates = new Map<RoomId, RoomSummaryState>();

  constructor(config: VideoSummaryEventsConfig) {
    this.io = config.io;
    this.sendFunctionOutput = config.sendFunctionOutput;
    this.getVideoState = config.getVideoState;

    // Initialize YouTube service
    this.youtubeService = createYouTubeServiceWithConfig(
      { apiKey: config.youtubeApiKey },
      {
        onFetchStart: (videoId) => {
          console.log(`[VideoSummary] Fetching metadata for ${videoId}`);
        },
        onFetchComplete: (videoId, metadata) => {
          console.log(
            `[VideoSummary] Metadata fetched: "${metadata.title}" (${metadata.durationSeconds}s)`,
          );
        },
        onFetchError: (videoId, error) => {
          console.error(
            `[VideoSummary] Metadata fetch error for ${videoId}: ${error}`,
          );
        },
        onCacheHit: (videoId) => {
          console.log(`[VideoSummary] Cache hit for ${videoId}`);
        },
      },
    );

    // Initialize Summary LLM service
    this.summaryLLMService = createSummaryLLMServiceWithConfig(
      { apiKey: config.openaiApiKey },
      {
        onGenerateStart: (videoId) => {
          console.log(`[VideoSummary] Generating LLM summary for ${videoId}`);
        },
        onGenerateComplete: (videoId, summary) => {
          console.log(
            `[VideoSummary] Summary generated (${summary.length} chars)`,
          );
        },
        onGenerateError: (videoId, error) => {
          console.error(`[VideoSummary] LLM error for ${videoId}: ${error}`);
        },
      },
    );
  }

  /**
   * Handle function call from OpenAI
   */
  async handleFunctionCall(
    roomId: RoomId,
    functionCall: FunctionCallEvent,
  ): Promise<void> {
    if (functionCall.name !== "getVideoSummary") {
      console.log(
        `[VideoSummary] Ignoring unknown function: ${functionCall.name}`,
      );
      return;
    }

    const args = functionCall.arguments as unknown as VideoSummaryFunctionArgs;
    const mode: SummaryMode = args.mode ?? "default";

    console.log(
      `[VideoSummary] Processing summary request for room ${roomId} (mode: ${mode})`,
    );

    const startTime = Date.now();

    // Get current video state
    const videoState = this.getVideoState(roomId);

    if (!videoState || !videoState.isOpen || !videoState.playlist) {
      console.log(`[VideoSummary] No video playing in room ${roomId}`);
      this.sendFunctionOutput(
        roomId,
        functionCall.callId,
        JSON.stringify({
          error: "No video is currently playing",
          suggestion: "Start playing a video first, then ask for a summary.",
        }),
      );
      return;
    }

    // Get current video from playlist
    const currentVideo = videoState.playlist.videos[videoState.currentIndex];
    if (!currentVideo) {
      console.log(`[VideoSummary] Invalid video index in room ${roomId}`);
      this.sendFunctionOutput(
        roomId,
        functionCall.callId,
        JSON.stringify({
          error: "Could not find the current video",
        }),
      );
      return;
    }

    // Extract video ID from URL
    const videoId = extractYouTubeVideoId(currentVideo.link);
    if (!videoId) {
      console.log(`[VideoSummary] Invalid video URL: ${currentVideo.link}`);
      this.sendFunctionOutput(
        roomId,
        functionCall.callId,
        JSON.stringify({
          error: "Could not extract video ID from URL",
          url: currentVideo.link,
        }),
      );
      return;
    }

    // Update room state
    const state = this.getOrCreateState(roomId);
    state.isGenerating = true;

    try {
      // Fetch YouTube metadata
      const metadata = await this.youtubeService.getVideoMetadata(videoId);

      if (!metadata) {
        console.log(`[VideoSummary] Video not found: ${videoId}`);
        state.isGenerating = false;
        this.sendFunctionOutput(
          roomId,
          functionCall.callId,
          JSON.stringify({
            error: "Video not found or unavailable",
            videoId,
          }),
        );
        return;
      }

      // Generate summary based on mode
      let summary: string;

      if (mode === "default") {
        // Default mode: LLM-enhanced summary
        summary = await this.summaryLLMService.generateVideoSummary(metadata);
      } else {
        // Deep mode: For now, use enhanced summary (transcript coming in FEAT-907)
        // TODO: Implement transcript-based deep analysis in FEAT-909
        console.log(
          `[VideoSummary] Deep mode requested - using enhanced summary (transcript not yet implemented)`,
        );
        summary = await this.summaryLLMService.generateVideoSummary(metadata);
      }

      const processingTimeMs = Date.now() - startTime;

      // Create response
      const response: VideoSummaryResponse = {
        mode,
        usedFallback: false,
        metadata,
        summary,
        generatedAt: Date.now(),
        processingTimeMs,
      };

      // Update room state
      state.lastSummary = response;
      state.lastVideoId = videoId;
      state.isGenerating = false;

      // Broadcast to room (optional UI display)
      const summaryPayload: VideoSummaryPayload = {
        roomId,
        summary: response,
      };
      this.io.to(roomId).emit("video:summary", summaryPayload);
      console.log(`[VideoSummary] Broadcast video:summary to room ${roomId}`);

      // Send summary to OpenAI for voice response
      this.sendFunctionOutput(
        roomId,
        functionCall.callId,
        JSON.stringify({
          summary,
          title: metadata.title,
          channel: metadata.channelTitle,
          duration: this.formatDuration(metadata.durationSeconds),
          viewCount: this.formatViewCount(metadata.viewCount),
          processingTimeMs,
        }),
      );

      console.log(
        `[VideoSummary] Summary complete for room ${roomId} in ${processingTimeMs}ms`,
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Summary generation failed";

      // Update state
      state.isGenerating = false;

      // Broadcast error
      const errorPayload: VideoSummaryErrorPayload = {
        roomId,
        error: errorMessage,
        videoId,
      };
      this.io.to(roomId).emit("video:summary-error", errorPayload);
      console.error(`[VideoSummary] Error for room ${roomId}: ${errorMessage}`);

      // Send error to OpenAI
      this.sendFunctionOutput(
        roomId,
        functionCall.callId,
        JSON.stringify({
          error: `Failed to generate summary: ${errorMessage}`,
          videoId,
        }),
      );
    }
  }

  /**
   * Get current summary for a room (for late joiners)
   */
  getCurrentSummary(roomId: RoomId): VideoSummaryResponse | null {
    return this.roomSummaryStates.get(roomId)?.lastSummary ?? null;
  }

  /**
   * Check if summary generation is in progress for a room
   */
  isGenerating(roomId: RoomId): boolean {
    return this.roomSummaryStates.get(roomId)?.isGenerating ?? false;
  }

  /**
   * Clean up room state when room is destroyed
   */
  cleanupRoom(roomId: RoomId): void {
    this.roomSummaryStates.delete(roomId);
    console.log(`[VideoSummary] Cleaned up state for room ${roomId}`);
  }

  /**
   * Clear summary state for a room (e.g., when video changes)
   */
  clearSummary(roomId: RoomId): void {
    const state = this.roomSummaryStates.get(roomId);
    if (state) {
      state.lastSummary = null;
      state.lastVideoId = null;
    }
  }

  /**
   * Get cache stats from YouTube service
   */
  getCacheStats(): { size: number; validEntries: number } {
    return this.youtubeService.getCacheStats();
  }

  /**
   * Prune expired cache entries
   */
  pruneCache(): number {
    return this.youtubeService.pruneCache();
  }

  /**
   * Get or create room summary state
   */
  private getOrCreateState(roomId: RoomId): RoomSummaryState {
    let state = this.roomSummaryStates.get(roomId);
    if (!state) {
      state = {
        lastSummary: null,
        isGenerating: false,
        lastVideoId: null,
      };
      this.roomSummaryStates.set(roomId, state);
    }
    return state;
  }

  /**
   * Format duration for AI response
   */
  private formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${hours} hour${hours !== 1 ? "s" : ""} ${minutes} minute${minutes !== 1 ? "s" : ""}`;
    } else if (minutes > 0) {
      return `${minutes} minute${minutes !== 1 ? "s" : ""}`;
    }
    return `${secs} seconds`;
  }

  /**
   * Format view count for AI response
   */
  private formatViewCount(views: number): string {
    if (views >= 1_000_000_000) {
      return `${(views / 1_000_000_000).toFixed(1)} billion views`;
    } else if (views >= 1_000_000) {
      return `${(views / 1_000_000).toFixed(1)} million views`;
    } else if (views >= 1_000) {
      return `${Math.round(views / 1_000)} thousand views`;
    }
    return `${views} views`;
  }
}

/**
 * Create video summary events handler instance
 */
export function createVideoSummaryEventsHandler(
  config: VideoSummaryEventsConfig,
): VideoSummaryEventsHandler {
  return new VideoSummaryEventsHandler(config);
}

export default VideoSummaryEventsHandler;
