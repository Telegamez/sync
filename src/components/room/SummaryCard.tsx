/**
 * SummaryCard Component
 *
 * Collapsible card displaying AI-generated conversation summaries.
 * Features animated expand/collapse, bullet points, and timestamp display.
 *
 * Part of the Long-Horizon Engineering Protocol - FEAT-510
 */

"use client";

import React, { useState, useCallback, useMemo } from "react";
import { ChevronDown, ChevronRight, FileText, Clock } from "lucide-react";
import type { TranscriptSummary } from "@/types/transcript";
import { formatRelativeTime, formatEntryTimestamp } from "@/types/transcript";

/**
 * SummaryCard props
 */
export interface SummaryCardProps {
  /** The summary to display */
  summary: TranscriptSummary;
  /** Whether the card is initially expanded */
  defaultExpanded?: boolean;
  /** Controlled expanded state */
  expanded?: boolean;
  /** Callback when expand state changes */
  onExpandChange?: (expanded: boolean) => void;
  /** Whether to show relative timestamps */
  relativeTime?: boolean;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Format coverage period for display
 */
function formatCoveragePeriod(start: Date, end: Date): string {
  const startTime = new Date(start).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  const endTime = new Date(end).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  return `${startTime} - ${endTime}`;
}

/**
 * SummaryCard component
 *
 * Displays a collapsible summary card with bullet points and metadata.
 *
 * @example
 * ```tsx
 * <SummaryCard
 *   summary={transcriptSummary}
 *   defaultExpanded={false}
 *   onExpandChange={(expanded) => console.log(expanded)}
 * />
 * ```
 */
export function SummaryCard({
  summary,
  defaultExpanded = false,
  expanded: controlledExpanded,
  onExpandChange,
  relativeTime = true,
  className = "",
}: SummaryCardProps) {
  // Internal state for uncontrolled mode
  const [internalExpanded, setInternalExpanded] = useState(defaultExpanded);

  // Use controlled or uncontrolled state
  const isExpanded = controlledExpanded ?? internalExpanded;

  const handleToggle = useCallback(() => {
    const newExpanded = !isExpanded;
    if (controlledExpanded === undefined) {
      setInternalExpanded(newExpanded);
    }
    onExpandChange?.(newExpanded);
  }, [isExpanded, controlledExpanded, onExpandChange]);

  const timestamp = useMemo(() => {
    const date = new Date(summary.timestamp);
    return relativeTime ? formatRelativeTime(date) : formatEntryTimestamp(date);
  }, [summary.timestamp, relativeTime]);

  const coveragePeriod = useMemo(() => {
    return formatCoveragePeriod(summary.coverageStart, summary.coverageEnd);
  }, [summary.coverageStart, summary.coverageEnd]);

  return (
    <div
      className={`bg-amber-500/10 border border-amber-500/30 rounded-lg overflow-hidden ${className}`}
    >
      {/* Header - always visible */}
      <button
        onClick={handleToggle}
        className="w-full px-3 py-2 flex items-center gap-2 hover:bg-amber-500/5 transition-colors text-left"
        aria-expanded={isExpanded}
        aria-controls={`summary-content-${summary.id}`}
      >
        {/* Expand/collapse icon */}
        <span className="text-amber-400 transition-transform duration-200">
          {isExpanded ? (
            <ChevronDown className="w-4 h-4" />
          ) : (
            <ChevronRight className="w-4 h-4" />
          )}
        </span>

        {/* Summary icon */}
        <FileText className="w-4 h-4 text-amber-400" />

        {/* Title */}
        <span className="text-sm font-medium text-amber-300">Summary</span>

        {/* Entries count badge */}
        <span className="text-xs px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400">
          {summary.entriesSummarized} entries
        </span>

        {/* Timestamp */}
        <span className="text-xs text-gray-500 ml-auto">{timestamp}</span>
      </button>

      {/* Expandable content */}
      <div
        id={`summary-content-${summary.id}`}
        className={`transition-all duration-200 ease-in-out overflow-hidden ${
          isExpanded ? "max-h-96 opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        <div className="px-3 pb-3 pt-1 border-t border-amber-500/20">
          {/* Main summary content */}
          <p className="text-sm text-gray-300 mb-3">{summary.content}</p>

          {/* Bullet points */}
          {summary.bulletPoints.length > 0 && (
            <div className="mb-3">
              <h4 className="text-xs font-medium text-amber-400 mb-1.5">
                Key Points
              </h4>
              <ul className="space-y-1">
                {summary.bulletPoints.map((point, index) => (
                  <li
                    key={index}
                    className="text-sm text-gray-400 flex items-start gap-2"
                  >
                    <span className="text-amber-500 mt-1.5 text-xs">•</span>
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Metadata footer */}
          <div className="flex items-center gap-4 text-xs text-gray-500 pt-2 border-t border-amber-500/10">
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {coveragePeriod}
            </span>
            {summary.tokenCount && <span>{summary.tokenCount} tokens</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Compact summary card for inline display
 */
export function SummaryCardCompact({
  summary,
  relativeTime = true,
  className = "",
}: Omit<SummaryCardProps, "defaultExpanded" | "expanded" | "onExpandChange">) {
  const timestamp = useMemo(() => {
    const date = new Date(summary.timestamp);
    return relativeTime ? formatRelativeTime(date) : formatEntryTimestamp(date);
  }, [summary.timestamp, relativeTime]);

  return (
    <div
      className={`bg-amber-500/10 border border-amber-500/30 rounded px-3 py-2 ${className}`}
    >
      <div className="flex items-center gap-2 mb-1">
        <FileText className="w-3 h-3 text-amber-400" />
        <span className="text-xs font-medium text-amber-300">Summary</span>
        <span className="text-xs text-gray-500">{timestamp}</span>
      </div>
      <p className="text-xs text-gray-400 line-clamp-2">{summary.content}</p>
    </div>
  );
}

/**
 * Summary card skeleton for loading state
 */
export function SummaryCardSkeleton({
  className = "",
}: {
  className?: string;
}) {
  return (
    <div
      className={`bg-amber-500/10 border border-amber-500/30 rounded-lg overflow-hidden animate-pulse ${className}`}
    >
      <div className="px-3 py-2 flex items-center gap-2">
        <div className="w-4 h-4 bg-amber-500/20 rounded" />
        <div className="w-4 h-4 bg-amber-500/20 rounded" />
        <div className="w-16 h-4 bg-amber-500/20 rounded" />
        <div className="w-20 h-4 bg-amber-500/20 rounded ml-auto" />
      </div>
    </div>
  );
}

export default SummaryCard;
