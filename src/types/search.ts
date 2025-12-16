/**
 * Search Type Definitions
 *
 * Types for voice-activated web search using Serper API.
 * Supports web, image, and video search results.
 *
 * Part of the Long-Horizon Engineering Protocol - FEAT-600
 */

import type { RoomId } from "./room";

/**
 * Unique identifier for a search query
 */
export type SearchId = string;

/**
 * Search result type (which tab to display)
 */
export type SearchResultType = "web" | "images" | "videos";

/**
 * Search type requested by user
 */
export type SearchType = "all" | "web" | "images" | "videos";

// ============================================================================
// Serper API Response Types
// ============================================================================

/**
 * Sitelink within a web result
 */
export interface SerperSitelink {
  /** Sitelink title */
  title: string;
  /** Sitelink URL */
  link: string;
}

/**
 * Web search result from Serper API
 */
export interface SerperWebResult {
  /** Result title */
  title: string;
  /** Result URL */
  link: string;
  /** Result snippet/description */
  snippet: string;
  /** Result date (e.g., "8 hours ago") */
  date?: string;
  /** Position in search results (1-indexed) */
  position: number;
  /** Optional sitelinks */
  sitelinks?: SerperSitelink[];
}

/**
 * Top story from web search
 */
export interface SerperTopStory {
  /** Story title */
  title: string;
  /** Story URL */
  link: string;
  /** Source name */
  source: string;
  /** Date published */
  date?: string;
  /** Thumbnail image URL */
  imageUrl?: string;
}

/**
 * Related search suggestion
 */
export interface SerperRelatedSearch {
  /** Related query */
  query: string;
}

/**
 * Image search result from Serper API
 */
export interface SerperImageResult {
  /** Image title */
  title: string;
  /** Full-size image URL */
  imageUrl: string;
  /** Image width in pixels */
  imageWidth: number;
  /** Image height in pixels */
  imageHeight: number;
  /** Thumbnail URL */
  thumbnailUrl: string;
  /** Source page URL */
  link: string;
  /** Source domain */
  source: string;
  /** Position in search results (1-indexed) */
  position: number;
}

/**
 * Video search result from Serper API
 */
export interface SerperVideoResult {
  /** Video title */
  title: string;
  /** Video page URL */
  link: string;
  /** Video description/snippet */
  snippet: string;
  /** Thumbnail image URL */
  imageUrl: string;
  /** Video duration (e.g., "8:33") */
  duration?: string;
  /** Source platform (e.g., "YouTube") */
  source: string;
  /** Channel/uploader name */
  channel?: string;
  /** Date published */
  date?: string;
  /** Position in search results (1-indexed) */
  position: number;
}

/**
 * Search parameters from Serper response
 */
export interface SerperSearchParameters {
  /** Original query */
  q: string;
  /** Search type */
  type: string;
  /** Time filter (e.g., "qdr:d" for past day) */
  tbs?: string;
  /** Location */
  location?: string;
  /** Search engine */
  engine: string;
  /** Country code */
  gl?: string;
  /** Language code */
  hl?: string;
}

// ============================================================================
// Aggregated Search Results
// ============================================================================

/**
 * Combined search results from all search types
 */
export interface SearchResults {
  /** Unique search ID */
  id: SearchId;

  /** Original search query */
  query: string;

  /** Type of search requested */
  searchType: SearchType;

  /** Search timestamp */
  timestamp: Date;

  /** Room this search belongs to */
  roomId: RoomId;

  /** Web search results */
  web: SerperWebResult[];

  /** Image search results */
  images: SerperImageResult[];

  /** Video search results */
  videos: SerperVideoResult[];

  /** Top stories (news) */
  topStories?: SerperTopStory[];

  /** Related search suggestions */
  relatedSearches?: string[];

  /** API credits used */
  creditsUsed: number;
}

// ============================================================================
// Client-Side State Types
// ============================================================================

/**
 * Search loading state
 */
export type SearchLoadingState = "idle" | "loading" | "success" | "error";

/**
 * Client-side search state for useSearch hook
 */
export interface SearchState {
  /** Current search results (null if no search) */
  results: SearchResults | null;

  /** Current loading state */
  loadingState: SearchLoadingState;

  /** Error message if search failed */
  error: string | null;

  /** Current active tab */
  activeTab: SearchResultType;

  /** Current query being searched */
  currentQuery: string | null;

  /** History of recent searches (optional) */
  recentSearches?: string[];
}

/**
 * Initial search state
 */
export const INITIAL_SEARCH_STATE: SearchState = {
  results: null,
  loadingState: "idle",
  error: null,
  activeTab: "web",
  currentQuery: null,
  recentSearches: [],
};

// ============================================================================
// Socket.io Event Payloads
// ============================================================================

/**
 * Payload for search:started event
 */
export interface SearchStartedPayload {
  /** Room ID */
  roomId: RoomId;
  /** Search query */
  query: string;
  /** Type of search */
  searchType: SearchType;
  /** Search ID for tracking */
  searchId: SearchId;
}

/**
 * Payload for search:results event
 */
export interface SearchResultsPayload {
  /** Room ID */
  roomId: RoomId;
  /** Search results */
  results: SearchResults;
}

/**
 * Payload for search:error event
 */
export interface SearchErrorPayload {
  /** Room ID */
  roomId: RoomId;
  /** Search ID */
  searchId: SearchId;
  /** Original query */
  query: string;
  /** Error message */
  error: string;
  /** Error code (optional) */
  code?: string;
}

/**
 * Payload for search:clear event
 */
export interface SearchClearPayload {
  /** Room ID */
  roomId: RoomId;
}

// ============================================================================
// OpenAI Function Call Types
// ============================================================================

/**
 * Arguments for webSearch function call from OpenAI
 */
export interface WebSearchFunctionArgs {
  /** Search query */
  query: string;
  /** Type of search (optional, defaults to "all") */
  searchType?: SearchType;
}

/**
 * OpenAI function call event data
 */
export interface FunctionCallEvent {
  /** Function name */
  name: string;
  /** Unique call ID for response correlation */
  callId: string;
  /** Function arguments as parsed object */
  arguments: Record<string, unknown>;
}

// ============================================================================
// Serper API Request/Response Types
// ============================================================================

/**
 * Serper API request configuration
 */
export interface SerperRequestConfig {
  /** Search query */
  q: string;
  /** Location for localized results */
  location?: string;
  /** Country code */
  gl?: string;
  /** Language code */
  hl?: string;
  /** Number of results */
  num?: number;
  /** Time filter (e.g., "qdr:d" for past day) */
  tbs?: string;
}

/**
 * Serper web search API response
 */
export interface SerperWebResponse {
  searchParameters: SerperSearchParameters;
  organic: SerperWebResult[];
  topStories?: SerperTopStory[];
  relatedSearches?: SerperRelatedSearch[];
  credits: number;
}

/**
 * Serper image search API response
 */
export interface SerperImageResponse {
  searchParameters: SerperSearchParameters;
  images: SerperImageResult[];
  credits: number;
}

/**
 * Serper video search API response
 */
export interface SerperVideoResponse {
  searchParameters: SerperSearchParameters;
  videos: SerperVideoResult[];
  credits: number;
}

// ============================================================================
// Utility Types
// ============================================================================

/**
 * Result counts by type
 */
export interface SearchResultCounts {
  web: number;
  images: number;
  videos: number;
  total: number;
}

/**
 * Get result counts from SearchResults
 */
export function getResultCounts(results: SearchResults): SearchResultCounts {
  return {
    web: results.web.length,
    images: results.images.length,
    videos: results.videos.length,
    total: results.web.length + results.images.length + results.videos.length,
  };
}

/**
 * Check if search results are empty
 */
export function isSearchEmpty(results: SearchResults): boolean {
  return (
    results.web.length === 0 &&
    results.images.length === 0 &&
    results.videos.length === 0
  );
}

/**
 * Format search timestamp for display
 */
export function formatSearchTimestamp(timestamp: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - timestamp.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);

  if (diffSec < 60) {
    return "just now";
  } else if (diffMin < 60) {
    return `${diffMin}m ago`;
  } else {
    return timestamp.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  }
}

/**
 * Truncate snippet to max length
 */
export function truncateSnippet(
  snippet: string,
  maxLength: number = 150,
): string {
  if (snippet.length <= maxLength) return snippet;
  return snippet.substring(0, maxLength).trim() + "...";
}

/**
 * Extract domain from URL
 */
export function extractDomain(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.replace("www.", "");
  } catch {
    return url;
  }
}
