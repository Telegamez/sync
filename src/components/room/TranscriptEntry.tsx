/**
 * TranscriptEntry Component
 *
 * Individual transcript entry display with type-specific styling.
 * Supports ambient, PTT, AI response, and system message types.
 *
 * Part of the Long-Horizon Engineering Protocol - FEAT-509
 */

"use client";

import React, { useMemo } from "react";
import { Mic, Bot, Info } from "lucide-react";
import type { TranscriptEntry as TranscriptEntryType } from "@/types/transcript";
import { formatEntryTimestamp, formatRelativeTime } from "@/types/transcript";

/**
 * TranscriptEntry props
 */
export interface TranscriptEntryProps {
  /** The transcript entry to display */
  entry: TranscriptEntryType;
  /** Whether to show relative timestamps (e.g., "2 min ago") */
  relativeTime?: boolean;
  /** Whether this is the current user's entry */
  isOwnEntry?: boolean;
  /** Callback when entry is clicked */
  onClick?: (entry: TranscriptEntryType) => void;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Get badge configuration for entry type
 */
function getEntryBadge(type: TranscriptEntryType["type"]): {
  icon: React.ReactNode;
  label: string;
  colorClass: string;
} | null {
  switch (type) {
    case "ptt":
      return {
        icon: <Mic className="w-3 h-3" />,
        label: "PTT",
        colorClass: "bg-blue-500/20 text-blue-400",
      };
    case "ai_response":
      return {
        icon: <Bot className="w-3 h-3" />,
        label: "AI",
        colorClass: "bg-purple-500/20 text-purple-400",
      };
    case "system":
      return {
        icon: <Info className="w-3 h-3" />,
        label: "System",
        colorClass: "bg-gray-500/20 text-gray-400",
      };
    case "ambient":
    default:
      return null;
  }
}

/**
 * Get speaker name color class based on entry type
 */
function getSpeakerColorClass(type: TranscriptEntryType["type"]): string {
  switch (type) {
    case "ai_response":
      return "text-purple-300";
    case "system":
      return "text-gray-400";
    default:
      return "text-white";
  }
}

/**
 * TranscriptEntry component
 *
 * Displays a single transcript entry with appropriate styling based on type.
 *
 * @example
 * ```tsx
 * <TranscriptEntry
 *   entry={transcriptEntry}
 *   relativeTime={true}
 *   onClick={handleClick}
 * />
 * ```
 */
export function TranscriptEntry({
  entry,
  relativeTime = true,
  isOwnEntry = false,
  onClick,
  className = "",
}: TranscriptEntryProps) {
  const badge = useMemo(() => getEntryBadge(entry.type), [entry.type]);
  const speakerColorClass = useMemo(
    () => getSpeakerColorClass(entry.type),
    [entry.type],
  );

  const timestamp = useMemo(() => {
    const date = new Date(entry.timestamp);
    return relativeTime ? formatRelativeTime(date) : formatEntryTimestamp(date);
  }, [entry.timestamp, relativeTime]);

  const handleClick = () => {
    onClick?.(entry);
  };

  // System messages are rendered centered
  if (entry.type === "system") {
    return (
      <div
        className={`py-2 px-3 ${onClick ? "cursor-pointer hover:bg-white/5" : ""} ${className}`}
        onClick={onClick ? handleClick : undefined}
        role={onClick ? "button" : undefined}
        tabIndex={onClick ? 0 : undefined}
        onKeyDown={
          onClick
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  handleClick();
                }
              }
            : undefined
        }
      >
        <div className="flex items-center justify-center gap-2 text-center">
          <Info className="w-3 h-3 text-gray-500" />
          <span className="text-xs text-gray-500 italic">{entry.content}</span>
          <span className="text-xs text-gray-600">{timestamp}</span>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`py-2 px-3 transition-colors ${onClick ? "cursor-pointer hover:bg-white/5" : "hover:bg-white/5"} ${className}`}
      onClick={onClick ? handleClick : undefined}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                handleClick();
              }
            }
          : undefined
      }
    >
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          {/* Header: Speaker name, badge, timestamp */}
          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
            <span className={`font-medium text-sm ${speakerColorClass}`}>
              {entry.speaker}
              {isOwnEntry && (
                <span className="text-xs text-gray-500 ml-1">(you)</span>
              )}
            </span>

            {badge && (
              <span
                className={`inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded ${badge.colorClass}`}
              >
                {badge.icon}
                <span>{badge.label}</span>
              </span>
            )}

            <span className="text-xs text-gray-500">{timestamp}</span>
          </div>

          {/* Content */}
          <p className="text-sm text-gray-300 break-words">{entry.content}</p>

          {/* Partial indicator */}
          {entry.isPartial && (
            <span className="text-xs text-gray-500 italic ml-1">
              (typing...)
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Compact variant for dense lists
 */
export function TranscriptEntryCompact({
  entry,
  relativeTime = true,
  className = "",
}: Omit<TranscriptEntryProps, "onClick" | "isOwnEntry">) {
  const badge = useMemo(() => getEntryBadge(entry.type), [entry.type]);
  const speakerColorClass = useMemo(
    () => getSpeakerColorClass(entry.type),
    [entry.type],
  );

  const timestamp = useMemo(() => {
    const date = new Date(entry.timestamp);
    return relativeTime ? formatRelativeTime(date) : formatEntryTimestamp(date);
  }, [entry.timestamp, relativeTime]);

  // System messages inline
  if (entry.type === "system") {
    return (
      <div className={`py-1 px-2 text-xs text-gray-500 italic ${className}`}>
        {entry.content}
      </div>
    );
  }

  return (
    <div className={`py-1 px-2 ${className}`}>
      <span className={`text-xs font-medium ${speakerColorClass}`}>
        {entry.speaker}
      </span>
      {badge && (
        <span className={`text-xs ml-1 ${badge.colorClass}`}>
          [{badge.label}]
        </span>
      )}
      <span className="text-xs text-gray-500 ml-1">{timestamp}</span>
      <span className="text-xs text-gray-400 ml-1">— {entry.content}</span>
    </div>
  );
}

export default TranscriptEntry;
