/**
 * Search Events Handler
 *
 * Socket.io event handlers for voice-activated search functionality.
 * Integrates OpenAI function calling with Serper API.
 *
 * Part of the Long-Horizon Engineering Protocol - FEAT-603
 */

import type { Server as SocketIOServer } from "socket.io";
import type { RoomId } from "@/types/room";
import type {
  SearchResults,
  SearchStartedPayload,
  SearchResultsPayload,
  SearchErrorPayload,
  SearchClearPayload,
  FunctionCallEvent,
  WebSearchFunctionArgs,
  SearchType,
} from "@/types/search";
import { SerperService, createSerperService } from "./serper-service";

/**
 * Search event handler configuration
 */
export interface SearchEventsConfig {
  /** Serper API key */
  serperApiKey: string;
  /** Socket.io server instance */
  io: SocketIOServer;
  /** Callback to send function output back to OpenAI */
  sendFunctionOutput: (roomId: RoomId, callId: string, output: string) => void;
}

/**
 * Per-room search state
 */
interface RoomSearchState {
  /** Current search results */
  currentResults: SearchResults | null;
  /** Current search ID being processed */
  pendingSearchId: string | null;
  /** Is a search in progress */
  isSearching: boolean;
}

/**
 * Search Events Handler
 *
 * Manages search requests from OpenAI function calls and broadcasts results.
 */
export class SearchEventsHandler {
  private io: SocketIOServer;
  private serperService: SerperService;
  private sendFunctionOutput: (
    roomId: RoomId,
    callId: string,
    output: string,
  ) => void;
  private roomSearchStates = new Map<RoomId, RoomSearchState>();

  constructor(config: SearchEventsConfig) {
    this.io = config.io;
    this.sendFunctionOutput = config.sendFunctionOutput;

    // Initialize Serper service
    this.serperService = createSerperService(
      { apiKey: config.serperApiKey },
      {
        onSearchStart: (roomId, query, searchType) => {
          console.log(
            `[Search] Starting search for room ${roomId}: "${query}" (${searchType})`,
          );
        },
        onSearchComplete: (roomId, results) => {
          console.log(
            `[Search] Complete for room ${roomId}: ${results.web.length} web, ${results.images.length} images, ${results.videos.length} videos`,
          );
        },
        onSearchError: (roomId, query, error) => {
          console.error(`[Search] Error for room ${roomId}: ${error}`);
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
    if (functionCall.name !== "webSearch") {
      console.log(`[Search] Ignoring unknown function: ${functionCall.name}`);
      return;
    }

    const args = functionCall.arguments as unknown as WebSearchFunctionArgs;
    const { query, searchType = "all" } = args;

    if (!query || query.trim().length === 0) {
      console.log(`[Search] Empty query received, ignoring`);
      this.sendFunctionOutput(
        roomId,
        functionCall.callId,
        JSON.stringify({ error: "Empty search query" }),
      );
      return;
    }

    const searchId = `search_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    // Update room search state
    const state = this.getOrCreateState(roomId);
    state.isSearching = true;
    state.pendingSearchId = searchId;

    // Broadcast search:started
    const startedPayload: SearchStartedPayload = {
      roomId,
      query,
      searchType: searchType as SearchType,
      searchId,
    };
    this.io.to(roomId).emit("search:started", startedPayload);
    console.log(`[Search] Broadcast search:started to room ${roomId}`);

    try {
      // Execute search
      const results = await this.serperService.searchAll(
        roomId,
        query,
        searchType as SearchType,
      );

      // Update state
      state.currentResults = results;
      state.isSearching = false;
      state.pendingSearchId = null;

      // Broadcast search:results
      const resultsPayload: SearchResultsPayload = {
        roomId,
        results,
      };
      this.io.to(roomId).emit("search:results", resultsPayload);
      console.log(`[Search] Broadcast search:results to room ${roomId}`);

      // Format results for AI and send function output
      const aiSummary = this.serperService.formatForAI(results, 3);
      this.sendFunctionOutput(roomId, functionCall.callId, aiSummary);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Search failed";

      // Update state
      state.isSearching = false;
      state.pendingSearchId = null;

      // Broadcast search:error
      const errorPayload: SearchErrorPayload = {
        roomId,
        searchId,
        query,
        error: errorMessage,
      };
      this.io.to(roomId).emit("search:error", errorPayload);
      console.error(
        `[Search] Broadcast search:error to room ${roomId}: ${errorMessage}`,
      );

      // Send error to OpenAI
      this.sendFunctionOutput(
        roomId,
        functionCall.callId,
        JSON.stringify({ error: `Search failed: ${errorMessage}` }),
      );
    }
  }

  /**
   * Handle search:clear event from client
   */
  handleClearSearch(roomId: RoomId): void {
    const state = this.roomSearchStates.get(roomId);
    if (state) {
      state.currentResults = null;
      state.isSearching = false;
      state.pendingSearchId = null;
    }

    // Broadcast clear to all room members
    const clearPayload: SearchClearPayload = { roomId };
    this.io.to(roomId).emit("search:clear", clearPayload);
    console.log(`[Search] Cleared search state for room ${roomId}`);
  }

  /**
   * Get current search results for a room (for late joiners)
   */
  getCurrentResults(roomId: RoomId): SearchResults | null {
    return this.roomSearchStates.get(roomId)?.currentResults ?? null;
  }

  /**
   * Check if a search is in progress for a room
   */
  isSearchInProgress(roomId: RoomId): boolean {
    return this.roomSearchStates.get(roomId)?.isSearching ?? false;
  }

  /**
   * Clean up room state when room is destroyed
   */
  cleanupRoom(roomId: RoomId): void {
    this.roomSearchStates.delete(roomId);
    console.log(`[Search] Cleaned up state for room ${roomId}`);
  }

  /**
   * Get or create room search state
   */
  private getOrCreateState(roomId: RoomId): RoomSearchState {
    let state = this.roomSearchStates.get(roomId);
    if (!state) {
      state = {
        currentResults: null,
        pendingSearchId: null,
        isSearching: false,
      };
      this.roomSearchStates.set(roomId, state);
    }
    return state;
  }
}

/**
 * Create search events handler instance
 */
export function createSearchEventsHandler(
  config: SearchEventsConfig,
): SearchEventsHandler {
  return new SearchEventsHandler(config);
}

export default SearchEventsHandler;
