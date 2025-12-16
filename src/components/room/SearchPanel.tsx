/**
 * SearchPanel Component
 *
 * Displays voice-activated search results in a tabbed panel.
 * Supports Web, Images, and Videos result types.
 *
 * Part of the Long-Horizon Engineering Protocol - FEAT-605
 */

"use client";

import React from "react";
import {
  Search,
  X,
  Loader2,
  Globe,
  Image as ImageIcon,
  Video,
  ExternalLink,
  AlertCircle,
} from "lucide-react";
import type {
  SearchResults,
  SearchResultType,
  SerperWebResult,
  SerperImageResult,
  SerperVideoResult,
} from "@/types/search";

/**
 * SearchPanel props
 */
export interface SearchPanelProps {
  /** Search results */
  results: SearchResults | null;
  /** Currently active tab */
  activeTab: SearchResultType;
  /** Whether search is loading */
  isLoading: boolean;
  /** Error message */
  error: string | null;
  /** Current search query */
  query: string | null;
  /** Callback when tab changes */
  onTabChange: (tab: SearchResultType) => void;
  /** Callback to close panel */
  onClose?: () => void;
  /** Callback to clear error */
  onClearError?: () => void;
  /** Panel title */
  title?: string;
  /** Show as mobile bottom sheet */
  mobileSheet?: boolean;
  /** Custom class name */
  className?: string;
}

/**
 * Tab configuration
 */
const TABS: { id: SearchResultType; label: string; icon: React.ReactNode }[] = [
  { id: "web", label: "Web", icon: <Globe className="w-4 h-4" /> },
  { id: "images", label: "Images", icon: <ImageIcon className="w-4 h-4" /> },
  { id: "videos", label: "Videos", icon: <Video className="w-4 h-4" /> },
];

/**
 * Get result count for a tab
 */
function getTabCount(
  results: SearchResults | null,
  tab: SearchResultType,
): number {
  if (!results) return 0;
  switch (tab) {
    case "web":
      return results.web.length;
    case "images":
      return results.images.length;
    case "videos":
      return results.videos.length;
    default:
      return 0;
  }
}

/**
 * Extract domain from URL
 */
function extractDomain(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.replace("www.", "");
  } catch {
    return url;
  }
}

/**
 * Web result card
 */
function WebResultCard({ result }: { result: SerperWebResult }) {
  return (
    <a
      href={result.link}
      target="_blank"
      rel="noopener noreferrer"
      className="block p-3 hover:bg-white/5 transition-colors border-b border-gray-700/30 last:border-b-0"
    >
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-medium text-blue-400 hover:text-blue-300 line-clamp-1">
              {result.title}
            </span>
            <ExternalLink className="w-3 h-3 text-gray-500 flex-shrink-0" />
          </div>
          <div className="text-xs text-green-600 mb-1 truncate">
            {extractDomain(result.link)}
          </div>
          <p className="text-sm text-gray-400 line-clamp-2">{result.snippet}</p>
          {result.date && (
            <span className="text-xs text-gray-500 mt-1 block">
              {result.date}
            </span>
          )}
        </div>
      </div>
    </a>
  );
}

/**
 * Image result card
 */
function ImageResultCard({ result }: { result: SerperImageResult }) {
  return (
    <a
      href={result.link}
      target="_blank"
      rel="noopener noreferrer"
      className="group relative aspect-square bg-gray-800 rounded-lg overflow-hidden hover:ring-2 hover:ring-blue-500 transition-all"
    >
      <img
        src={result.thumbnailUrl || result.imageUrl}
        alt={result.title}
        className="w-full h-full object-cover"
        loading="lazy"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
        <div className="absolute bottom-0 left-0 right-0 p-2">
          <p className="text-xs text-white line-clamp-2">{result.title}</p>
          <span className="text-xs text-gray-400">{result.source}</span>
        </div>
      </div>
    </a>
  );
}

/**
 * Video result card
 */
function VideoResultCard({ result }: { result: SerperVideoResult }) {
  return (
    <a
      href={result.link}
      target="_blank"
      rel="noopener noreferrer"
      className="block p-3 hover:bg-white/5 transition-colors border-b border-gray-700/30 last:border-b-0"
    >
      <div className="flex gap-3">
        <div className="relative flex-shrink-0 w-32 h-20 bg-gray-800 rounded overflow-hidden">
          {result.imageUrl && (
            <img
              src={result.imageUrl}
              alt={result.title}
              className="w-full h-full object-cover"
              loading="lazy"
            />
          )}
          {result.duration && (
            <span className="absolute bottom-1 right-1 px-1 py-0.5 text-xs bg-black/80 text-white rounded">
              {result.duration}
            </span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-medium text-blue-400 hover:text-blue-300 line-clamp-2 mb-1">
            {result.title}
          </h4>
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <span>{result.source}</span>
            {result.channel && (
              <>
                <span>-</span>
                <span className="truncate">{result.channel}</span>
              </>
            )}
          </div>
          {result.date && (
            <span className="text-xs text-gray-500 block mt-1">
              {result.date}
            </span>
          )}
        </div>
      </div>
    </a>
  );
}

/**
 * SearchPanel component
 */
export function SearchPanel({
  results,
  activeTab,
  isLoading,
  error,
  query,
  onTabChange,
  onClose,
  onClearError,
  title = "Search Results",
  mobileSheet = false,
  className = "",
}: SearchPanelProps) {
  // Get results for current tab
  const currentResults = results
    ? activeTab === "web"
      ? results.web
      : activeTab === "images"
        ? results.images
        : results.videos
    : [];

  // Mobile sheet styles
  const containerClasses = mobileSheet
    ? "fixed inset-x-0 top-32 bottom-48 z-50 bg-gray-900 rounded-2xl shadow-2xl border border-gray-700 mx-2 flex flex-col touch-scroll"
    : `bg-gray-900/80 backdrop-blur-sm rounded-lg border border-gray-700/50 flex flex-col ${className}`;

  return (
    <div className={containerClasses}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700/50">
        <div className="flex items-center gap-2 min-w-0">
          <Search className="w-4 h-4 text-gray-400 flex-shrink-0" />
          <div className="min-w-0">
            <span className="text-sm font-medium text-gray-200 block truncate">
              {query || title}
            </span>
          </div>
          {isLoading && (
            <Loader2 className="w-4 h-4 animate-spin text-blue-400 flex-shrink-0" />
          )}
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-700/50 rounded transition-colors flex-shrink-0"
            title="Close search"
          >
            <X className="w-4 h-4 text-gray-400" />
          </button>
        )}
      </div>

      {/* Error banner */}
      {error && (
        <div className="px-4 py-2 bg-red-500/10 border-b border-red-500/20 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-400" />
            <span className="text-xs text-red-400">{error}</span>
          </div>
          {onClearError && (
            <button
              onClick={onClearError}
              className="p-1 hover:bg-red-500/20 rounded"
            >
              <X className="w-3 h-3 text-red-400" />
            </button>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-gray-700/50">
        {TABS.map((tab) => {
          const count = getTabCount(results, tab.id);
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm transition-colors ${
                isActive
                  ? "text-blue-400 border-b-2 border-blue-400 bg-blue-500/10"
                  : "text-gray-400 hover:text-gray-300 hover:bg-white/5"
              }`}
            >
              {tab.icon}
              <span>{tab.label}</span>
              {count > 0 && (
                <span
                  className={`text-xs px-1.5 py-0.5 rounded-full ${
                    isActive ? "bg-blue-500/20" : "bg-gray-700"
                  }`}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto min-h-0 touch-scroll overscroll-contain">
        {/* Loading state */}
        {isLoading && !results && (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-blue-400 mb-3" />
            <span className="text-sm text-gray-400">Searching...</span>
          </div>
        )}

        {/* Empty state */}
        {!isLoading && results && currentResults.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-gray-500">
            {activeTab === "web" && (
              <Globe className="w-8 h-8 mb-2 opacity-50" />
            )}
            {activeTab === "images" && (
              <ImageIcon className="w-8 h-8 mb-2 opacity-50" />
            )}
            {activeTab === "videos" && (
              <Video className="w-8 h-8 mb-2 opacity-50" />
            )}
            <span className="text-sm">No {activeTab} results found</span>
          </div>
        )}

        {/* No results yet state */}
        {!isLoading && !results && !error && (
          <div className="flex flex-col items-center justify-center py-12 text-gray-500">
            <Search className="w-8 h-8 mb-2 opacity-50" />
            <span className="text-sm">
              Say &quot;search&quot; to find something
            </span>
          </div>
        )}

        {/* Web results */}
        {activeTab === "web" && results && results.web.length > 0 && (
          <div>
            {results.web.map((result, index) => (
              <WebResultCard key={`web-${index}`} result={result} />
            ))}
          </div>
        )}

        {/* Image results */}
        {activeTab === "images" && results && results.images.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 p-3">
            {results.images.map((result, index) => (
              <ImageResultCard key={`image-${index}`} result={result} />
            ))}
          </div>
        )}

        {/* Video results */}
        {activeTab === "videos" && results && results.videos.length > 0 && (
          <div>
            {results.videos.map((result, index) => (
              <VideoResultCard key={`video-${index}`} result={result} />
            ))}
          </div>
        )}
      </div>

      {/* Footer with related searches */}
      {results?.relatedSearches && results.relatedSearches.length > 0 && (
        <div className="px-4 py-2 border-t border-gray-700/50 bg-gray-800/50">
          <div className="text-xs text-gray-500 mb-1">Related:</div>
          <div className="flex flex-wrap gap-1">
            {results.relatedSearches.slice(0, 5).map((search, index) => (
              <span
                key={index}
                className="text-xs px-2 py-1 bg-gray-700/50 text-gray-400 rounded-full"
              >
                {search}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default SearchPanel;
