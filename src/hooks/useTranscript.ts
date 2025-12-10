/**
 * useTranscript Hook
 *
 * React hook for managing transcript state in a room.
 * Handles real-time transcript entries, summaries, pagination, and downloads.
 *
 * Part of the Long-Horizon Engineering Protocol - FEAT-507
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SignalingClient } from "@/lib/signaling/client";
import type {
  TranscriptEntry,
  TranscriptSummary,
  TranscriptState,
  TranscriptHistoryResponse,
  TranscriptEntryEvent,
  TranscriptSummaryEvent,
  TranscriptDownloadFormat,
} from "@/types/transcript";
import type { RoomId } from "@/types/room";

/**
 * Hook options
 */
export interface UseTranscriptOptions {
  /** Room ID */
  roomId: RoomId;
  /** Signaling client instance */
  client: SignalingClient | null;
  /** Initial history limit */
  initialLimit?: number;
  /** Pagination batch size */
  paginationLimit?: number;
  /** Auto-scroll enabled by default */
  autoScrollDefault?: boolean;
  /** Scroll pause detection threshold (ms) */
  scrollPauseThreshold?: number;
}

/**
 * Hook return type
 */
export interface UseTranscriptReturn extends TranscriptState {
  /** Add a new entry (for local optimistic updates) */
  addEntry: (entry: TranscriptEntry) => void;
  /** Load more history (pagination) */
  loadMore: () => void;
  /** Toggle auto-scroll */
  toggleAutoScroll: () => void;
  /** Set auto-scroll enabled/disabled */
  setAutoScroll: (enabled: boolean) => void;
  /** Download transcript as txt */
  downloadAsTxt: () => Promise<void>;
  /** Download transcript as markdown */
  downloadAsMd: () => Promise<void>;
  /** Copy transcript to clipboard */
  copyToClipboard: () => Promise<boolean>;
  /** Clear error state */
  clearError: () => void;
  /** Refresh transcript (re-fetch history) */
  refresh: () => void;
  /** Generate summary manually */
  generateSummary: () => Promise<boolean>;
  /** Whether summary generation is in progress */
  isGeneratingSummary: boolean;
}

/**
 * Default options
 */
const DEFAULT_OPTIONS = {
  initialLimit: 50,
  paginationLimit: 30,
  autoScrollDefault: true,
  scrollPauseThreshold: 3000,
};

/**
 * Format entry for text download
 */
function formatEntryForText(entry: TranscriptEntry): string {
  const time = new Date(entry.timestamp).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  const badge =
    entry.type === "ptt"
      ? " [PTT]"
      : entry.type === "ai_response"
        ? " [AI]"
        : entry.type === "system"
          ? " [System]"
          : "";

  return `[${time}] ${entry.speaker}${badge}: ${entry.content}`;
}

/**
 * Format summary for text download
 */
function formatSummaryForText(summary: TranscriptSummary): string {
  const time = new Date(summary.timestamp).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  const bullets = summary.bulletPoints
    .map((point) => `  - ${point}`)
    .join("\n");

  return `\n--- Summary (${time}) ---\n${summary.content}\n\nKey Points:\n${bullets}\n---\n`;
}

/**
 * Format entry for markdown download
 */
function formatEntryForMarkdown(entry: TranscriptEntry): string {
  const time = new Date(entry.timestamp).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  if (entry.type === "system") {
    return `*${entry.content}* — ${time}`;
  }

  const badge =
    entry.type === "ptt" ? " 🎤" : entry.type === "ai_response" ? " 🤖" : "";

  return `**${entry.speaker}**${badge} (${time}): ${entry.content}`;
}

/**
 * Format summary for markdown download
 */
function formatSummaryForMarkdown(summary: TranscriptSummary): string {
  const time = new Date(summary.timestamp).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  const bullets = summary.bulletPoints.map((point) => `- ${point}`).join("\n");

  return `\n---\n\n### 📋 Summary (${time})\n\n${summary.content}\n\n**Key Points:**\n${bullets}\n\n---\n`;
}

/**
 * Generate transcript content for download
 */
function generateTranscriptContent(
  entries: TranscriptEntry[],
  summaries: TranscriptSummary[],
  format: TranscriptDownloadFormat,
): string {
  // Merge entries and summaries by timestamp
  const allItems: Array<
    | { type: "entry"; item: TranscriptEntry; timestamp: Date }
    | { type: "summary"; item: TranscriptSummary; timestamp: Date }
  > = [
    ...entries.map((e) => ({
      type: "entry" as const,
      item: e,
      timestamp: new Date(e.timestamp),
    })),
    ...summaries.map((s) => ({
      type: "summary" as const,
      item: s,
      timestamp: new Date(s.timestamp),
    })),
  ].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  if (format === "txt") {
    return allItems
      .map((item) =>
        item.type === "entry"
          ? formatEntryForText(item.item)
          : formatSummaryForText(item.item),
      )
      .join("\n");
  }

  // Markdown format
  return allItems
    .map((item) =>
      item.type === "entry"
        ? formatEntryForMarkdown(item.item)
        : formatSummaryForMarkdown(item.item),
    )
    .join("\n\n");
}

/**
 * Trigger file download
 */
function downloadFile(
  content: string,
  filename: string,
  mimeType: string,
): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * useTranscript hook
 *
 * Manages transcript state for a room including real-time updates,
 * pagination, auto-scroll, and download functionality.
 *
 * @example
 * ```tsx
 * const {
 *   entries,
 *   summaries,
 *   isLoading,
 *   hasMore,
 *   loadMore,
 *   downloadAsTxt,
 * } = useTranscript({
 *   roomId: "room-123",
 *   client: signalingClient,
 * });
 * ```
 */
export function useTranscript(
  options: UseTranscriptOptions,
): UseTranscriptReturn {
  const {
    roomId,
    client,
    initialLimit = DEFAULT_OPTIONS.initialLimit,
    paginationLimit = DEFAULT_OPTIONS.paginationLimit,
    autoScrollDefault = DEFAULT_OPTIONS.autoScrollDefault,
  } = options;

  // State
  const [entries, setEntries] = useState<TranscriptEntry[]>([]);
  const [summaries, setSummaries] = useState<TranscriptSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [autoScroll, setAutoScrollState] = useState(autoScrollDefault);
  const [totalEntries, setTotalEntries] = useState(0);

  // Refs
  const initialLoadDone = useRef(false);

  /**
   * Handle incoming transcript entry
   */
  const handleTranscriptEntry = useCallback((payload: TranscriptEntryEvent) => {
    setEntries((prev) => {
      // Avoid duplicates
      if (prev.some((e) => e.id === payload.entry.id)) {
        return prev;
      }
      return [...prev, payload.entry];
    });
    setTotalEntries((prev) => prev + 1);
  }, []);

  /**
   * Handle incoming transcript summary
   */
  const handleTranscriptSummary = useCallback(
    (payload: TranscriptSummaryEvent) => {
      setSummaries((prev) => {
        // Avoid duplicates
        if (prev.some((s) => s.id === payload.summary.id)) {
          return prev;
        }
        return [...prev, payload.summary];
      });
    },
    [],
  );

  /**
   * Handle transcript history response
   */
  const handleTranscriptHistory = useCallback(
    (payload: TranscriptHistoryResponse) => {
      console.log("[useTranscript] Received transcript history", {
        entriesCount: payload.entries.length,
        summariesCount: payload.summaries.length,
        totalEntries: payload.totalEntries,
        initialLoadDone: initialLoadDone.current,
      });

      if (!initialLoadDone.current) {
        // Initial load - replace entries
        setEntries(payload.entries);
        setSummaries(payload.summaries);
        initialLoadDone.current = true;
        setIsLoading(false);
      } else {
        // Pagination - prepend older entries
        setEntries((prev) => {
          const existingIds = new Set(prev.map((e) => e.id));
          const newEntries = payload.entries.filter(
            (e) => !existingIds.has(e.id),
          );
          return [...newEntries, ...prev];
        });
        setIsLoadingMore(false);
      }

      setHasMore(payload.hasMore);
      setTotalEntries(payload.totalEntries);
    },
    [],
  );

  /**
   * Register event handlers
   */
  useEffect(() => {
    if (!client) return;

    client.on("onTranscriptEntry", handleTranscriptEntry);
    client.on("onTranscriptSummary", handleTranscriptSummary);
    client.on("onTranscriptHistory", handleTranscriptHistory);

    return () => {
      client.off("onTranscriptEntry", handleTranscriptEntry);
      client.off("onTranscriptSummary", handleTranscriptSummary);
      client.off("onTranscriptHistory", handleTranscriptHistory);
    };
  }, [
    client,
    handleTranscriptEntry,
    handleTranscriptSummary,
    handleTranscriptHistory,
  ]);

  /**
   * Request initial history on mount
   */
  useEffect(() => {
    console.log("[useTranscript] History effect triggered", {
      hasClient: !!client,
      roomId,
      initialLoadDone: initialLoadDone.current,
    });

    if (!client || !roomId || initialLoadDone.current) return;

    console.log(
      "[useTranscript] Requesting transcript history for room",
      roomId,
    );
    setIsLoading(true);
    client.requestTranscriptHistory({
      roomId,
      limit: initialLimit,
      includeSummaries: true,
    });
  }, [client, roomId, initialLimit]);

  /**
   * Add entry (for local optimistic updates)
   */
  const addEntry = useCallback((entry: TranscriptEntry) => {
    setEntries((prev) => {
      if (prev.some((e) => e.id === entry.id)) {
        return prev;
      }
      return [...prev, entry];
    });
    setTotalEntries((prev) => prev + 1);
  }, []);

  /**
   * Load more history (pagination)
   */
  const loadMore = useCallback(() => {
    if (
      !client ||
      !roomId ||
      isLoadingMore ||
      !hasMore ||
      entries.length === 0
    ) {
      return;
    }

    setIsLoadingMore(true);
    const oldestEntry = entries[0];

    client.requestTranscriptHistory({
      roomId,
      limit: paginationLimit,
      beforeId: oldestEntry.id,
      includeSummaries: false, // Already have summaries from initial load
    });
  }, [client, roomId, isLoadingMore, hasMore, entries, paginationLimit]);

  /**
   * Toggle auto-scroll
   */
  const toggleAutoScroll = useCallback(() => {
    setAutoScrollState((prev) => !prev);
  }, []);

  /**
   * Set auto-scroll
   */
  const setAutoScroll = useCallback((enabled: boolean) => {
    setAutoScrollState(enabled);
  }, []);

  /**
   * Download as text file
   */
  const downloadAsTxt = useCallback(async () => {
    try {
      const content = generateTranscriptContent(entries, summaries, "txt");
      const date = new Date().toISOString().split("T")[0];
      const filename = `transcript_${roomId}_${date}.txt`;
      downloadFile(content, filename, "text/plain;charset=utf-8");
    } catch (err) {
      setError(
        `Download failed: ${err instanceof Error ? err.message : "Unknown error"}`,
      );
    }
  }, [entries, summaries, roomId]);

  /**
   * Download as markdown file
   */
  const downloadAsMd = useCallback(async () => {
    try {
      const content = generateTranscriptContent(entries, summaries, "md");
      const date = new Date().toISOString().split("T")[0];
      const filename = `transcript_${roomId}_${date}.md`;
      downloadFile(content, filename, "text/markdown;charset=utf-8");
    } catch (err) {
      setError(
        `Download failed: ${err instanceof Error ? err.message : "Unknown error"}`,
      );
    }
  }, [entries, summaries, roomId]);

  /**
   * Copy transcript to clipboard
   */
  const copyToClipboard = useCallback(async (): Promise<boolean> => {
    try {
      const content = generateTranscriptContent(entries, summaries, "txt");
      await navigator.clipboard.writeText(content);
      return true;
    } catch (err) {
      setError(
        `Copy failed: ${err instanceof Error ? err.message : "Unknown error"}`,
      );
      return false;
    }
  }, [entries, summaries]);

  /**
   * Clear error
   */
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  /**
   * Refresh transcript (re-fetch history)
   */
  const refresh = useCallback(() => {
    if (!client || !roomId) return;

    initialLoadDone.current = false;
    setEntries([]);
    setSummaries([]);
    setIsLoading(true);
    setError(null);

    client.requestTranscriptHistory({
      roomId,
      limit: initialLimit,
      includeSummaries: true,
    });
  }, [client, roomId, initialLimit]);

  /**
   * Generate summary manually
   */
  const generateSummary = useCallback(async (): Promise<boolean> => {
    if (!client || !roomId || isGeneratingSummary) {
      return false;
    }

    setIsGeneratingSummary(true);

    return new Promise((resolve) => {
      client.requestSummaryGeneration(roomId, (response) => {
        setIsGeneratingSummary(false);
        if (response.success) {
          resolve(true);
        } else {
          setError(response.error || "Summary generation failed");
          resolve(false);
        }
      });

      // Timeout after 30 seconds
      setTimeout(() => {
        setIsGeneratingSummary(false);
        resolve(false);
      }, 30000);
    });
  }, [client, roomId, isGeneratingSummary]);

  return {
    // State
    entries,
    summaries,
    isLoading,
    isLoadingMore,
    isGeneratingSummary,
    error,
    hasMore,
    autoScroll,
    totalEntries,

    // Actions
    addEntry,
    loadMore,
    toggleAutoScroll,
    setAutoScroll,
    downloadAsTxt,
    downloadAsMd,
    copyToClipboard,
    clearError,
    refresh,
    generateSummary,
  };
}

export default useTranscript;
