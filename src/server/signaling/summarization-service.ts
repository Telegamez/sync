/**
 * Summarization Service
 *
 * Periodic conversation summarization using gpt-4o-mini via OpenAI Responses API.
 * Monitors transcript entry count and time to trigger summaries.
 *
 * Uses the newer Responses API (released March 2025) instead of Chat Completions
 * for a more streamlined interface and future-proofing.
 *
 * Part of the Long-Horizon Engineering Protocol - FEAT-504
 */

import OpenAI from "openai";
import type { RoomId } from "@/types/room";
import type { TranscriptSummary, TranscriptEntry } from "@/types/transcript";
import type { ContextManager } from "./context-manager";

/**
 * Summarization model for cost efficiency
 */
const SUMMARIZATION_MODEL = "gpt-4o-mini";

/**
 * Default summarization trigger thresholds
 */
const DEFAULT_TIME_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes
const DEFAULT_ENTRY_THRESHOLD = 20; // 20 transcript segments

/**
 * Summarization service configuration
 */
export interface SummarizationServiceConfig {
  /** OpenAI API key */
  apiKey: string;
  /** Time threshold in ms before auto-summary (default: 5 minutes) */
  timeThresholdMs?: number;
  /** Entry count threshold before auto-summary (default: 20) */
  entryThreshold?: number;
  /** Maximum tokens for summary output */
  maxSummaryTokens?: number;
  /** Temperature for summarization (default: 0.3 for consistency) */
  temperature?: number;
}

/**
 * Summarization service callbacks
 */
export interface SummarizationServiceCallbacks {
  /** Called when a summary is generated */
  onSummary?: (roomId: RoomId, summary: TranscriptSummary) => void;
  /** Called on summarization error */
  onError?: (roomId: RoomId, error: string) => void;
}

/**
 * Per-room monitoring state
 */
interface RoomMonitorState {
  roomId: RoomId;
  isMonitoring: boolean;
  lastSummaryTime: Date;
  entryCountSinceLastSummary: number;
  checkIntervalId?: NodeJS.Timeout;
  contextManager: ContextManager;
}

/**
 * Summarization prompt template
 */
const SUMMARIZATION_PROMPT = `You are a meeting note summarizer. Analyze the following conversation transcript and provide a concise summary.

Your summary should:
1. Identify the main topics discussed
2. Note any decisions made
3. Highlight any action items or next steps
4. Include key points from each speaker

Format your response as JSON with the following structure:
{
  "summary": "A 2-3 sentence overview of the conversation",
  "bulletPoints": ["Key point 1", "Key point 2", "Key point 3", "Key point 4", "Key point 5"],
  "topics": ["Topic 1", "Topic 2"],
  "decisions": ["Decision 1"],
  "actionItems": ["Action item 1"]
}

Keep bullet points concise (under 15 words each). Include 3-5 bullet points.

TRANSCRIPT:
`;

/**
 * Summarization Service
 *
 * Monitors room transcripts and generates periodic summaries.
 *
 * @example
 * ```ts
 * const service = new SummarizationService(
 *   { apiKey: process.env.OPENAI_API_KEY! },
 *   { onSummary: (roomId, summary) => broadcast(roomId, summary) }
 * );
 *
 * // Start monitoring a room
 * service.startMonitoring('room-123', contextManager);
 *
 * // Generate immediate summary
 * const summary = await service.summarizeNow('room-123');
 *
 * // Stop monitoring when room closes
 * service.stopMonitoring('room-123');
 * ```
 */
export class SummarizationService {
  private config: SummarizationServiceConfig;
  private callbacks: SummarizationServiceCallbacks;
  private openai: OpenAI;
  private rooms = new Map<RoomId, RoomMonitorState>();
  private timeThresholdMs: number;
  private entryThreshold: number;
  private checkIntervalMs = 30000; // Check every 30 seconds

  constructor(
    config: SummarizationServiceConfig,
    callbacks: SummarizationServiceCallbacks = {},
  ) {
    this.config = config;
    this.callbacks = callbacks;
    this.openai = new OpenAI({ apiKey: config.apiKey });
    this.timeThresholdMs = config.timeThresholdMs ?? DEFAULT_TIME_THRESHOLD_MS;
    this.entryThreshold = config.entryThreshold ?? DEFAULT_ENTRY_THRESHOLD;
  }

  /**
   * Start monitoring a room for automatic summarization
   */
  startMonitoring(roomId: RoomId, contextManager: ContextManager): void {
    // Check if already monitoring
    if (this.rooms.has(roomId)) {
      const existing = this.rooms.get(roomId)!;
      if (existing.isMonitoring) {
        console.log(`[Summarization] Already monitoring room ${roomId}`);
        return;
      }
    }

    const state: RoomMonitorState = {
      roomId,
      isMonitoring: true,
      lastSummaryTime: new Date(),
      entryCountSinceLastSummary: 0,
      contextManager,
    };

    // Start periodic check
    state.checkIntervalId = setInterval(() => {
      this.checkAndSummarize(roomId);
    }, this.checkIntervalMs);

    this.rooms.set(roomId, state);
    console.log(`[Summarization] Started monitoring room ${roomId}`);
  }

  /**
   * Stop monitoring a room
   */
  stopMonitoring(roomId: RoomId): void {
    const state = this.rooms.get(roomId);
    if (!state) return;

    // Clear interval
    if (state.checkIntervalId) {
      clearInterval(state.checkIntervalId);
    }

    state.isMonitoring = false;
    this.rooms.delete(roomId);
    console.log(`[Summarization] Stopped monitoring room ${roomId}`);
  }

  /**
   * Check if a room is being monitored
   */
  isMonitoring(roomId: RoomId): boolean {
    return this.rooms.get(roomId)?.isMonitoring ?? false;
  }

  /**
   * Increment entry count for a room (call when new transcript entry is added)
   */
  incrementEntryCount(roomId: RoomId): void {
    const state = this.rooms.get(roomId);
    if (state) {
      state.entryCountSinceLastSummary++;
    }
  }

  /**
   * Get current monitoring state for a room
   */
  getMonitorState(roomId: RoomId): {
    entryCount: number;
    timeSinceLastSummary: number;
    needsSummary: boolean;
  } | null {
    const state = this.rooms.get(roomId);
    if (!state) return null;

    const timeSinceLastSummary = Date.now() - state.lastSummaryTime.getTime();

    return {
      entryCount: state.entryCountSinceLastSummary,
      timeSinceLastSummary,
      needsSummary:
        state.entryCountSinceLastSummary >= this.entryThreshold ||
        timeSinceLastSummary >= this.timeThresholdMs,
    };
  }

  /**
   * Generate summary immediately for a room
   */
  async summarizeNow(roomId: RoomId): Promise<TranscriptSummary | null> {
    const state = this.rooms.get(roomId);
    if (!state) {
      console.log(`[Summarization] Room ${roomId} not being monitored`);
      return null;
    }

    return this.generateSummary(state);
  }

  /**
   * Get monitored room count
   */
  getMonitoredRoomCount(): number {
    return this.rooms.size;
  }

  /**
   * Dispose all monitoring
   */
  dispose(): void {
    const roomIds = Array.from(this.rooms.keys());
    for (const roomId of roomIds) {
      this.stopMonitoring(roomId);
    }
  }

  // ========== Private Methods ==========

  /**
   * Check if summarization is needed and trigger if so
   */
  private async checkAndSummarize(roomId: RoomId): Promise<void> {
    const state = this.rooms.get(roomId);
    if (!state || !state.isMonitoring) return;

    const timeSinceLastSummary = Date.now() - state.lastSummaryTime.getTime();

    // Check if thresholds are met
    const needsSummary =
      state.entryCountSinceLastSummary >= this.entryThreshold ||
      (timeSinceLastSummary >= this.timeThresholdMs &&
        state.entryCountSinceLastSummary > 0);

    if (needsSummary) {
      console.log(
        `[Summarization] Room ${roomId}: Triggering summary (${state.entryCountSinceLastSummary} entries, ${Math.round(timeSinceLastSummary / 1000)}s elapsed)`,
      );
      await this.generateSummary(state);
    }
  }

  /**
   * Generate summary for a room
   */
  private async generateSummary(
    state: RoomMonitorState,
  ): Promise<TranscriptSummary | null> {
    const { roomId, contextManager } = state;

    // Get entries since last summary
    const { entries } = contextManager.getTranscriptEntries(
      roomId,
      state.entryCountSinceLastSummary || 50,
    );

    if (entries.length === 0) {
      console.log(`[Summarization] Room ${roomId}: No entries to summarize`);
      return null;
    }

    try {
      // Format transcript for summarization
      const transcriptText = this.formatTranscript(entries);

      // Call OpenAI Responses API (newer, streamlined API)
      const response = await this.openai.responses.create({
        model: SUMMARIZATION_MODEL,
        instructions:
          "You are a meeting note summarizer. Always respond with valid JSON matching the requested format exactly.",
        input: SUMMARIZATION_PROMPT + transcriptText,
        temperature: this.config.temperature ?? 0.3,
        max_output_tokens: this.config.maxSummaryTokens ?? 500,
        text: {
          format: { type: "json_object" },
        },
      });

      const content = response.output_text;
      if (!content) {
        throw new Error("Empty response from OpenAI");
      }

      // Parse JSON response
      const parsed = JSON.parse(content) as {
        summary: string;
        bulletPoints: string[];
        topics?: string[];
        decisions?: string[];
        actionItems?: string[];
      };

      // Get time range
      const firstEntry = entries[0];
      const lastEntry = entries[entries.length - 1];

      // Create transcript summary
      const summary: TranscriptSummary = {
        id: `summary-${roomId}-${Date.now()}`,
        roomId,
        timestamp: new Date(),
        content: parsed.summary,
        bulletPoints: parsed.bulletPoints || [],
        entriesSummarized: entries.length,
        tokenCount: Math.ceil(content.length / 4), // Estimate
        coverageStart: firstEntry.timestamp,
        coverageEnd: lastEntry.timestamp,
      };

      // Reset state
      state.lastSummaryTime = new Date();
      state.entryCountSinceLastSummary = 0;

      // Emit callback
      this.callbacks.onSummary?.(roomId, summary);

      console.log(
        `[Summarization] Room ${roomId}: Generated summary (${entries.length} entries)`,
      );

      return summary;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Summarization failed";
      console.error(`[Summarization] Room ${roomId} error:`, message);
      this.callbacks.onError?.(roomId, message);
      return null;
    }
  }

  /**
   * Format transcript entries for the summarization prompt
   */
  private formatTranscript(entries: TranscriptEntry[]): string {
    return entries
      .map((entry) => {
        const time = entry.timestamp.toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit",
        });
        const badge =
          entry.type === "ptt"
            ? " [PTT]"
            : entry.type === "ai_response"
              ? " [AI]"
              : "";
        return `[${time}] ${entry.speaker}${badge}: ${entry.content}`;
      })
      .join("\n");
  }
}

/**
 * Create summarization service instance
 */
export function createSummarizationService(
  config: SummarizationServiceConfig,
  callbacks?: SummarizationServiceCallbacks,
): SummarizationService {
  return new SummarizationService(config, callbacks);
}

export default SummarizationService;
