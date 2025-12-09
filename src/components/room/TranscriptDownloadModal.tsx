/**
 * TranscriptDownloadModal Component
 *
 * Modal dialog for configuring and initiating transcript downloads.
 * Supports format selection, include options, and download progress.
 *
 * Part of the Long-Horizon Engineering Protocol - FEAT-511
 */

"use client";

import React, { useState, useCallback } from "react";
import {
  X,
  Download,
  FileText,
  FileCode,
  Loader2,
  CheckCircle,
  AlertCircle,
} from "lucide-react";
import type { TranscriptDownloadFormat } from "@/types/transcript";

/**
 * Download options configuration
 */
export interface DownloadOptions {
  /** Include summaries in download */
  includeSummaries: boolean;
  /** Include timestamps */
  includeTimestamps: boolean;
  /** Include speaker names */
  includeSpeakerNames: boolean;
  /** Include entry type badges */
  includeTypeBadges: boolean;
}

/**
 * TranscriptDownloadModal props
 */
export interface TranscriptDownloadModalProps {
  /** Whether the modal is open */
  isOpen: boolean;
  /** Callback to close the modal */
  onClose: () => void;
  /** Callback to trigger download */
  onDownload: (
    format: TranscriptDownloadFormat,
    options: DownloadOptions,
  ) => Promise<void>;
  /** Room name for filename */
  roomName?: string;
  /** Number of entries to download */
  entryCount: number;
  /** Number of summaries to download */
  summaryCount: number;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Default download options
 */
const DEFAULT_OPTIONS: DownloadOptions = {
  includeSummaries: true,
  includeTimestamps: true,
  includeSpeakerNames: true,
  includeTypeBadges: true,
};

/**
 * TranscriptDownloadModal component
 *
 * Provides a modal interface for downloading transcripts with format
 * and content options.
 *
 * @example
 * ```tsx
 * <TranscriptDownloadModal
 *   isOpen={showDownloadModal}
 *   onClose={() => setShowDownloadModal(false)}
 *   onDownload={handleDownload}
 *   roomName="Team Meeting"
 *   entryCount={42}
 *   summaryCount={3}
 * />
 * ```
 */
export function TranscriptDownloadModal({
  isOpen,
  onClose,
  onDownload,
  roomName = "Transcript",
  entryCount,
  summaryCount,
  className = "",
}: TranscriptDownloadModalProps) {
  const [format, setFormat] = useState<TranscriptDownloadFormat>("txt");
  const [options, setOptions] = useState<DownloadOptions>(DEFAULT_OPTIONS);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadSuccess, setDownloadSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleOptionChange = useCallback(
    (key: keyof DownloadOptions, value: boolean) => {
      setOptions((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const handleDownload = useCallback(async () => {
    setIsDownloading(true);
    setError(null);
    setDownloadSuccess(false);

    try {
      await onDownload(format, options);
      setDownloadSuccess(true);
      // Auto-close after success
      setTimeout(() => {
        onClose();
        setDownloadSuccess(false);
      }, 1500);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Download failed. Please try again.",
      );
    } finally {
      setIsDownloading(false);
    }
  }, [format, options, onDownload, onClose]);

  const handleClose = useCallback(() => {
    if (!isDownloading) {
      setError(null);
      setDownloadSuccess(false);
      onClose();
    }
  }, [isDownloading, onClose]);

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center ${className}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="download-modal-title"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={handleClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div className="relative bg-gray-900 border border-gray-700 rounded-lg shadow-xl w-full max-w-md mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
          <h2
            id="download-modal-title"
            className="text-lg font-medium text-white"
          >
            Download Transcript
          </h2>
          <button
            onClick={handleClose}
            disabled={isDownloading}
            className="p-1 rounded hover:bg-gray-800 transition-colors disabled:opacity-50"
            aria-label="Close modal"
          >
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {/* Room info */}
          <div className="text-sm text-gray-400">
            <span className="font-medium text-gray-300">{roomName}</span>
            <span className="mx-2">•</span>
            <span>{entryCount} entries</span>
            {summaryCount > 0 && (
              <>
                <span className="mx-2">•</span>
                <span>{summaryCount} summaries</span>
              </>
            )}
          </div>

          {/* Format selection */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Format
            </label>
            <div className="flex gap-2">
              <button
                onClick={() => setFormat("txt")}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg border transition-colors ${
                  format === "txt"
                    ? "bg-blue-500/20 border-blue-500 text-blue-400"
                    : "border-gray-700 text-gray-400 hover:border-gray-600"
                }`}
                disabled={isDownloading}
              >
                <FileText className="w-4 h-4" />
                <span>Plain Text (.txt)</span>
              </button>
              <button
                onClick={() => setFormat("md")}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg border transition-colors ${
                  format === "md"
                    ? "bg-blue-500/20 border-blue-500 text-blue-400"
                    : "border-gray-700 text-gray-400 hover:border-gray-600"
                }`}
                disabled={isDownloading}
              >
                <FileCode className="w-4 h-4" />
                <span>Markdown (.md)</span>
              </button>
            </div>
          </div>

          {/* Include options */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Include
            </label>
            <div className="space-y-2">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={options.includeSummaries}
                  onChange={(e) =>
                    handleOptionChange("includeSummaries", e.target.checked)
                  }
                  disabled={isDownloading || summaryCount === 0}
                  className="w-4 h-4 rounded border-gray-600 bg-gray-800 text-blue-500 focus:ring-blue-500 focus:ring-offset-gray-900"
                />
                <span
                  className={`text-sm ${summaryCount === 0 ? "text-gray-600" : "text-gray-400"}`}
                >
                  AI Summaries ({summaryCount})
                </span>
              </label>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={options.includeTimestamps}
                  onChange={(e) =>
                    handleOptionChange("includeTimestamps", e.target.checked)
                  }
                  disabled={isDownloading}
                  className="w-4 h-4 rounded border-gray-600 bg-gray-800 text-blue-500 focus:ring-blue-500 focus:ring-offset-gray-900"
                />
                <span className="text-sm text-gray-400">Timestamps</span>
              </label>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={options.includeSpeakerNames}
                  onChange={(e) =>
                    handleOptionChange("includeSpeakerNames", e.target.checked)
                  }
                  disabled={isDownloading}
                  className="w-4 h-4 rounded border-gray-600 bg-gray-800 text-blue-500 focus:ring-blue-500 focus:ring-offset-gray-900"
                />
                <span className="text-sm text-gray-400">Speaker names</span>
              </label>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={options.includeTypeBadges}
                  onChange={(e) =>
                    handleOptionChange("includeTypeBadges", e.target.checked)
                  }
                  disabled={isDownloading}
                  className="w-4 h-4 rounded border-gray-600 bg-gray-800 text-blue-500 focus:ring-blue-500 focus:ring-offset-gray-900"
                />
                <span className="text-sm text-gray-400">
                  Entry type badges (PTT, AI, etc.)
                </span>
              </label>
            </div>
          </div>

          {/* Error message */}
          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Success message */}
          {downloadSuccess && (
            <div className="flex items-center gap-2 p-3 bg-green-500/10 border border-green-500/30 rounded-lg text-green-400 text-sm">
              <CheckCircle className="w-4 h-4 flex-shrink-0" />
              <span>Download started!</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-4 py-3 border-t border-gray-700">
          <button
            onClick={handleClose}
            disabled={isDownloading}
            className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleDownload}
            disabled={isDownloading || entryCount === 0}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {isDownloading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Downloading...</span>
              </>
            ) : downloadSuccess ? (
              <>
                <CheckCircle className="w-4 h-4" />
                <span>Downloaded!</span>
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                <span>Download</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export default TranscriptDownloadModal;
