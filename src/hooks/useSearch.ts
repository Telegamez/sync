/**
 * useSearch Hook
 *
 * React hook for managing voice-activated search state in a room.
 * Handles real-time search results from OpenAI function calls via Socket.io.
 *
 * Part of the Long-Horizon Engineering Protocol - FEAT-604
 */

"use client";

import { useCallback, useEffect, useState } from "react";
import type { SignalingClient } from "@/lib/signaling/client";
import type {
  SearchResults,
  SearchResultType,
  SearchState,
  SearchStartedPayload,
  SearchResultsPayload,
  SearchErrorPayload,
  SearchClearPayload,
  INITIAL_SEARCH_STATE,
} from "@/types/search";
import type { RoomId } from "@/types/room";

/**
 * Hook options
 */
export interface UseSearchOptions {
  /** Room ID */
  roomId: RoomId;
  /** Signaling client instance */
  client: SignalingClient | null;
}

/**
 * Hook return type
 */
export interface UseSearchReturn {
  /** Current search results (null if no search) */
  results: SearchResults | null;
  /** Whether a search is in progress */
  isLoading: boolean;
  /** Error message if search failed */
  error: string | null;
  /** Current active tab */
  activeTab: SearchResultType;
  /** Current query being searched */
  query: string | null;
  /** Set active tab */
  setActiveTab: (tab: SearchResultType) => void;
  /** Clear search results */
  clearResults: () => void;
  /** Clear error */
  clearError: () => void;
  /** Whether there are any results */
  hasResults: boolean;
  /** Total result count across all tabs */
  totalResults: number;
}

/**
 * useSearch - Hook for voice-activated search state management
 *
 * Subscribes to search:started, search:results, and search:error events
 * from the signaling server to display search results triggered by
 * OpenAI function calling.
 *
 * @param options - Hook configuration options
 * @returns Search state and actions
 *
 * @example
 * ```tsx
 * const {
 *   results,
 *   isLoading,
 *   error,
 *   activeTab,
 *   setActiveTab,
 *   clearResults,
 *   hasResults,
 * } = useSearch({ roomId, client });
 *
 * if (hasResults) {
 *   return <SearchPanel results={results} activeTab={activeTab} />;
 * }
 * ```
 */
export function useSearch(options: UseSearchOptions): UseSearchReturn {
  const { roomId, client } = options;

  // State
  const [results, setResults] = useState<SearchResults | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<SearchResultType>("web");
  const [query, setQuery] = useState<string | null>(null);

  // Subscribe to search events
  useEffect(() => {
    if (!client) return;

    const socket = client.getSocket();
    if (!socket) return;

    // Handle search started
    const handleSearchStarted = (payload: SearchStartedPayload) => {
      if (payload.roomId !== roomId) return;
      console.log(`[useSearch] Search started: "${payload.query}"`);
      setIsLoading(true);
      setError(null);
      setQuery(payload.query);
    };

    // Handle search results
    const handleSearchResults = (payload: SearchResultsPayload) => {
      if (payload.roomId !== roomId) return;
      console.log(
        `[useSearch] Search results received: ${payload.results.web.length} web, ${payload.results.images.length} images, ${payload.results.videos.length} videos`,
      );
      setResults(payload.results);
      setIsLoading(false);
      setQuery(payload.results.query);

      // Auto-select first tab with results
      if (payload.results.web.length > 0) {
        setActiveTab("web");
      } else if (payload.results.images.length > 0) {
        setActiveTab("images");
      } else if (payload.results.videos.length > 0) {
        setActiveTab("videos");
      }
    };

    // Handle search error
    const handleSearchError = (payload: SearchErrorPayload) => {
      if (payload.roomId !== roomId) return;
      console.error(`[useSearch] Search error: ${payload.error}`);
      setError(payload.error);
      setIsLoading(false);
    };

    // Handle search clear
    const handleSearchClear = (payload: SearchClearPayload) => {
      if (payload.roomId !== roomId) return;
      console.log(`[useSearch] Search cleared`);
      setResults(null);
      setIsLoading(false);
      setError(null);
      setQuery(null);
    };

    // Subscribe to events
    socket.on("search:started", handleSearchStarted);
    socket.on("search:results", handleSearchResults);
    socket.on("search:error", handleSearchError);
    socket.on("search:clear", handleSearchClear);

    // Cleanup
    return () => {
      socket.off("search:started", handleSearchStarted);
      socket.off("search:results", handleSearchResults);
      socket.off("search:error", handleSearchError);
      socket.off("search:clear", handleSearchClear);
    };
  }, [client, roomId]);

  // Clear results action
  const clearResults = useCallback(() => {
    setResults(null);
    setIsLoading(false);
    setError(null);
    setQuery(null);

    // Optionally emit clear event to server
    if (client) {
      const socket = client.getSocket();
      if (socket) {
        socket.emit("search:clear", { roomId });
      }
    }
  }, [client, roomId]);

  // Clear error action
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // Computed values
  const hasResults =
    results !== null &&
    (results.web.length > 0 ||
      results.images.length > 0 ||
      results.videos.length > 0);

  const totalResults = results
    ? results.web.length + results.images.length + results.videos.length
    : 0;

  return {
    results,
    isLoading,
    error,
    activeTab,
    query,
    setActiveTab,
    clearResults,
    clearError,
    hasResults,
    totalResults,
  };
}

export default useSearch;
