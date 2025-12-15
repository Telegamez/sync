/**
 * TranscriptPanel Component
 *
 * Main transcript UI with header, scrollable entry list, auto-scroll,
 * and footer with download/copy controls.
 *
 * Part of the Long-Horizon Engineering Protocol - FEAT-508
 */

"use client";

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
  useMemo,
} from "react";
import {
  ChevronDown,
  ChevronUp,
  Download,
  Copy,
  Check,
  Loader2,
  ArrowDown,
  X,
  FileText,
  Mic,
} from "lucide-react";
import type {
  TranscriptEntry,
  TranscriptSummary,
  TranscriptEntryType,
} from "@/types/transcript";
import { formatRelativeTime, formatEntryTimestamp } from "@/types/transcript";
import type { TranscriptionState } from "@/hooks/useAmbientTranscription";

/**
 * TranscriptPanel props
 */
export interface TranscriptPanelProps {
  /** Transcript entries */
  entries: TranscriptEntry[];
  /** Transcript summaries */
  summaries: TranscriptSummary[];
  /** Whether initial loading */
  isLoading: boolean;
  /** Whether loading more history */
  isLoadingMore: boolean;
  /** Error message */
  error: string | null;
  /** Has more history to load */
  hasMore: boolean;
  /** Auto-scroll enabled */
  autoScroll: boolean;
  /** Total entry count */
  totalEntries: number;
  /** Callback to load more history */
  onLoadMore: () => void;
  /** Callback to toggle auto-scroll */
  onToggleAutoScroll: () => void;
  /** Callback to download as txt */
  onDownloadTxt: () => Promise<void>;
  /** Callback to download as markdown */
  onDownloadMd: () => Promise<void>;
  /** Callback to copy to clipboard */
  onCopy: () => Promise<boolean>;
  /** Callback to clear error */
  onClearError: () => void;
  /** Callback to close the panel */
  onClose?: () => void;
  /** Whether transcription is currently active (user toggle) */
  isTranscribing?: boolean;
  /** Callback to toggle transcription on/off */
  onToggleTranscription?: () => void;
  /** Current ambient transcription state (VAD-gated) */
  ambientTranscriptionState?: TranscriptionState;
  /** Panel title */
  title?: string;
  /** Show as mobile bottom sheet */
  mobileSheet?: boolean;
  /** Custom class name */
  className?: string;
}

/**
 * Get ambient transcription state indicator
 */
function getAmbientStateIndicator(state: TranscriptionState): {
  label: string;
  color: string;
  pulse: boolean;
} {
  switch (state) {
    case "transcribing":
      return {
        label: "Transcribing",
        color: "text-green-400",
        pulse: true,
      };
    case "listening":
      return {
        label: "Listening",
        color: "text-blue-400",
        pulse: false,
      };
    case "paused":
      return {
        label: "Paused",
        color: "text-yellow-400",
        pulse: false,
      };
    case "idle":
    default:
      return {
        label: "Off",
        color: "text-gray-500",
        pulse: false,
      };
  }
}

/**
 * Entry type badge colors
 */
function getEntryBadge(type: TranscriptEntryType): {
  label: string;
  bgClass: string;
  textClass: string;
} | null {
  switch (type) {
    case "ptt":
      return {
        label: "PTT",
        bgClass: "bg-blue-500/20",
        textClass: "text-blue-400",
      };
    case "ai_response":
      return {
        label: "AI",
        bgClass: "bg-purple-500/20",
        textClass: "text-purple-400",
      };
    case "system":
      return {
        label: "System",
        bgClass: "bg-gray-500/20",
        textClass: "text-gray-400",
      };
    case "ambient":
    default:
      return null;
  }
}

/**
 * Render a single transcript entry
 */
function TranscriptEntryItem({
  entry,
  showTimestamp,
}: {
  entry: TranscriptEntry;
  showTimestamp?: boolean;
}) {
  const badge = getEntryBadge(entry.type);
  const isSystem = entry.type === "system";

  if (isSystem) {
    return (
      <div className="py-2 px-3 text-center">
        <span className="text-xs text-gray-500 italic">{entry.content}</span>
        {showTimestamp && (
          <span className="text-xs text-gray-600 ml-2">
            {formatEntryTimestamp(new Date(entry.timestamp))}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="py-2 px-3 hover:bg-white/5 transition-colors">
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span
              className={`font-medium text-sm ${
                entry.type === "ai_response" ? "text-purple-300" : "text-white"
              }`}
            >
              {entry.speaker}
            </span>
            {badge && (
              <span
                className={`text-xs px-1.5 py-0.5 rounded ${badge.bgClass} ${badge.textClass}`}
              >
                {badge.label}
              </span>
            )}
            <span className="text-xs text-gray-500">
              {formatRelativeTime(new Date(entry.timestamp))}
            </span>
          </div>
          <p className="text-sm text-gray-300 break-words">{entry.content}</p>
        </div>
      </div>
    </div>
  );
}

/**
 * Render a summary card
 */
function SummaryCardItem({
  summary,
  isExpanded,
  onToggle,
}: {
  summary: TranscriptSummary;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="mx-3 my-2 bg-gradient-to-r from-purple-500/10 to-blue-500/10 border border-purple-500/20 rounded-lg overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full px-3 py-2 flex items-center justify-between hover:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-purple-400" />
          <span className="text-sm font-medium text-purple-300">Summary</span>
          <span className="text-xs text-gray-500">
            {formatRelativeTime(new Date(summary.timestamp))}
          </span>
        </div>
        {isExpanded ? (
          <ChevronUp className="w-4 h-4 text-gray-400" />
        ) : (
          <ChevronDown className="w-4 h-4 text-gray-400" />
        )}
      </button>
      {isExpanded && (
        <div className="px-3 pb-3 space-y-2">
          <p className="text-sm text-gray-300">{summary.content}</p>
          {summary.bulletPoints.length > 0 && (
            <ul className="space-y-1">
              {summary.bulletPoints.map((point, idx) => (
                <li
                  key={idx}
                  className="text-sm text-gray-400 flex items-start gap-2"
                >
                  <span className="text-purple-400 mt-1">•</span>
                  <span>{point}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * TranscriptPanel component
 *
 * Main transcript UI with collapsible header, scrollable content,
 * auto-scroll with "new messages" indicator, and action footer.
 */
export function TranscriptPanel({
  entries,
  summaries,
  isLoading,
  isLoadingMore,
  error,
  hasMore,
  autoScroll,
  totalEntries,
  onLoadMore,
  onToggleAutoScroll,
  onDownloadTxt,
  onDownloadMd,
  onCopy,
  onClearError,
  onClose,
  isTranscribing = true,
  onToggleTranscription,
  ambientTranscriptionState = "idle",
  title = "Transcript",
  mobileSheet = false,
  className = "",
}: TranscriptPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showNewMessages, setShowNewMessages] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const [expandedSummaries, setExpandedSummaries] = useState<Set<string>>(
    new Set(),
  );
  const [isDownloading, setIsDownloading] = useState(false);
  const prevEntriesLength = useRef(entries.length);

  // Merge entries and summaries reverse-chronologically (newest first)
  const chronologicalItems = useMemo(() => {
    const items: Array<
      | { type: "entry"; data: TranscriptEntry; timestamp: Date }
      | { type: "summary"; data: TranscriptSummary; timestamp: Date }
    > = [
      ...entries.map((e) => ({
        type: "entry" as const,
        data: e,
        timestamp: new Date(e.timestamp),
      })),
      ...summaries.map((s) => ({
        type: "summary" as const,
        data: s,
        timestamp: new Date(s.timestamp),
      })),
    ];
    // Sort newest first (descending order)
    return items.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }, [entries, summaries]);

  // Handle scroll to detect pause (newest at top, so check if at top)
  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return;

    const { scrollTop } = scrollRef.current;
    const isAtTop = scrollTop < 50;

    if (isAtTop && showNewMessages) {
      setShowNewMessages(false);
    }
  }, [showNewMessages]);

  // Auto-scroll to top on new entries (newest at top)
  useEffect(() => {
    if (!scrollRef.current) return;

    const hasNewEntries = entries.length > prevEntriesLength.current;
    prevEntriesLength.current = entries.length;

    if (hasNewEntries) {
      if (autoScroll) {
        // Scroll to top where newest entries are
        scrollRef.current.scrollTop = 0;
      } else {
        // Show new messages indicator if not at top
        const { scrollTop } = scrollRef.current;
        const isAtTop = scrollTop < 50;
        if (!isAtTop) {
          setShowNewMessages(true);
        }
      }
    }
  }, [entries, autoScroll]);

  // Scroll to top on initial load (newest at top)
  useEffect(() => {
    if (!isLoading && scrollRef.current && autoScroll) {
      scrollRef.current.scrollTop = 0;
    }
  }, [isLoading, autoScroll]);

  // Handle scroll to top button click (for new messages)
  const handleScrollToTop = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
      setShowNewMessages(false);
    }
  }, []);

  // Handle copy with success feedback
  const handleCopy = useCallback(async () => {
    const success = await onCopy();
    if (success) {
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    }
  }, [onCopy]);

  // Handle download
  const handleDownload = useCallback(
    async (format: "txt" | "md") => {
      setIsDownloading(true);
      try {
        if (format === "txt") {
          await onDownloadTxt();
        } else {
          await onDownloadMd();
        }
      } finally {
        setIsDownloading(false);
      }
    },
    [onDownloadTxt, onDownloadMd],
  );

  // Toggle summary expansion
  const toggleSummary = useCallback((summaryId: string) => {
    setExpandedSummaries((prev) => {
      const next = new Set(prev);
      if (next.has(summaryId)) {
        next.delete(summaryId);
      } else {
        next.add(summaryId);
      }
      return next;
    });
  }, []);

  // Mobile sheet styles - bottom-24 keeps panel above the footer controls
  const containerClasses = mobileSheet
    ? "fixed inset-x-0 bottom-24 z-50 bg-gray-900 rounded-2xl shadow-2xl border border-gray-700 mx-2 max-h-[60vh] flex flex-col"
    : `bg-gray-900/80 backdrop-blur-sm rounded-lg border border-gray-700/50 flex flex-col ${className}`;

  return (
    <div className={containerClasses}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700/50">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-gray-400" />
          <span className="text-sm font-medium text-gray-200">{title}</span>
          <span className="text-xs text-gray-500">
            ({totalEntries} entries)
          </span>
          {/* Ambient transcription state indicator */}
          {isTranscribing && (
            <div
              className="flex items-center gap-1 text-xs"
              title={`Ambient: ${getAmbientStateIndicator(ambientTranscriptionState).label}`}
            >
              <Mic
                className={`w-3 h-3 ${getAmbientStateIndicator(ambientTranscriptionState).color} ${
                  getAmbientStateIndicator(ambientTranscriptionState).pulse
                    ? "animate-pulse"
                    : ""
                }`}
              />
              <span
                className={`hidden sm:inline ${getAmbientStateIndicator(ambientTranscriptionState).color}`}
              >
                {getAmbientStateIndicator(ambientTranscriptionState).label}
              </span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Auto-scroll toggle */}
          <button
            onClick={onToggleAutoScroll}
            className={`text-xs px-2 py-1 rounded transition-colors ${
              autoScroll
                ? "bg-blue-500/20 text-blue-400"
                : "bg-gray-700/50 text-gray-400 hover:bg-gray-700"
            }`}
            title={autoScroll ? "Auto-scroll on" : "Auto-scroll off"}
          >
            {autoScroll ? "Auto" : "Manual"}
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="p-1 hover:bg-gray-700/50 rounded transition-colors"
              title="Close panel"
            >
              <X className="w-4 h-4 text-gray-400" />
            </button>
          )}
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="px-4 py-2 bg-red-500/10 border-b border-red-500/20 flex items-center justify-between">
          <span className="text-xs text-red-400">{error}</span>
          <button
            onClick={onClearError}
            className="p-1 hover:bg-red-500/20 rounded"
          >
            <X className="w-3 h-3 text-red-400" />
          </button>
        </div>
      )}

      {/* Content */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto min-h-0"
      >
        {/* Loading state */}
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        ) : chronologicalItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-gray-500">
            <FileText className="w-8 h-8 mb-2 opacity-50" />
            <span className="text-sm">No transcript yet</span>
          </div>
        ) : (
          <div className="divide-y divide-gray-700/30">
            {chronologicalItems.map((item) =>
              item.type === "entry" ? (
                <TranscriptEntryItem key={item.data.id} entry={item.data} />
              ) : (
                <SummaryCardItem
                  key={item.data.id}
                  summary={item.data}
                  isExpanded={expandedSummaries.has(item.data.id)}
                  onToggle={() => toggleSummary(item.data.id)}
                />
              ),
            )}
          </div>
        )}

        {/* Load older messages button (at bottom since oldest is at bottom) */}
        {hasMore && !isLoading && (
          <div className="p-2 text-center border-t border-gray-700/30">
            <button
              onClick={onLoadMore}
              disabled={isLoadingMore}
              className="text-xs text-blue-400 hover:text-blue-300 disabled:text-gray-500 flex items-center justify-center gap-1 mx-auto"
            >
              {isLoadingMore ? (
                <>
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Loading...
                </>
              ) : (
                "Load older messages"
              )}
            </button>
          </div>
        )}
      </div>

      {/* New messages indicator (scroll to top) */}
      {showNewMessages && (
        <button
          onClick={handleScrollToTop}
          className="absolute top-16 left-1/2 -translate-x-1/2 px-3 py-1.5 bg-blue-500 text-white text-xs rounded-full shadow-lg flex items-center gap-1 hover:bg-blue-600 transition-colors z-10"
        >
          <ArrowDown className="w-3 h-3 rotate-180" />
          New messages
        </button>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between px-4 py-2 border-t border-gray-700/50 bg-gray-800/50">
        <div className="flex items-center gap-2">
          <button
            onClick={handleCopy}
            disabled={entries.length === 0}
            className="flex items-center gap-1 text-xs text-gray-400 hover:text-white disabled:opacity-50 disabled:hover:text-gray-400 transition-colors"
            title="Copy to clipboard"
          >
            {copySuccess ? (
              <Check className="w-3.5 h-3.5 text-green-400" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
            {copySuccess ? "Copied!" : "Copy"}
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleDownload("txt")}
            disabled={entries.length === 0 || isDownloading}
            className="flex items-center gap-1 text-xs text-gray-400 hover:text-white disabled:opacity-50 disabled:hover:text-gray-400 transition-colors"
            title="Download as text"
          >
            {isDownloading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Download className="w-3.5 h-3.5" />
            )}
            .txt
          </button>
          <button
            onClick={() => handleDownload("md")}
            disabled={entries.length === 0 || isDownloading}
            className="flex items-center gap-1 text-xs text-gray-400 hover:text-white disabled:opacity-50 disabled:hover:text-gray-400 transition-colors"
            title="Download as markdown"
          >
            {isDownloading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Download className="w-3.5 h-3.5" />
            )}
            .md
          </button>
        </div>
      </div>
    </div>
  );
}

export default TranscriptPanel;
