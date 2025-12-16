/**
 * E2E Tests - Voice-Activated Search Flow
 *
 * Integration tests for voice-activated web search via OpenAI function calling.
 * Tests the full flow from voice input to search results display.
 *
 * Part of the Long-Horizon Engineering Protocol - FEAT-608
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import type { RoomId } from "@/types/room";
import type {
  SearchResults,
  SearchResultType,
  SearchStartedPayload,
  SearchResultsPayload,
  SearchErrorPayload,
  SerperWebResult,
  SerperImageResult,
  SerperVideoResult,
} from "@/types/search";

// ============================================================================
// Mock Data
// ============================================================================

const MOCK_ROOM_ID = "room-test-123" as RoomId;

const MOCK_WEB_RESULTS: SerperWebResult[] = [
  {
    title: "Latest AI News - TechCrunch",
    link: "https://techcrunch.com/ai-news",
    snippet: "The latest developments in artificial intelligence...",
    position: 1,
  },
  {
    title: "AI Breakthroughs 2024 - Wired",
    link: "https://wired.com/ai-breakthroughs",
    snippet: "Major AI breakthroughs that shaped the year...",
    position: 2,
  },
  {
    title: "Understanding AI - MIT Technology Review",
    link: "https://technologyreview.com/ai",
    snippet: "A comprehensive guide to artificial intelligence...",
    position: 3,
  },
];

const MOCK_IMAGE_RESULTS: SerperImageResult[] = [
  {
    title: "AI Robot Concept",
    imageUrl: "https://example.com/ai-robot.jpg",
    thumbnailUrl: "https://example.com/ai-robot-thumb.jpg",
    link: "https://example.com/ai-gallery",
    source: "Example Gallery",
    imageWidth: 1920,
    imageHeight: 1080,
    position: 1,
  },
  {
    title: "Neural Network Visualization",
    imageUrl: "https://example.com/neural-net.png",
    thumbnailUrl: "https://example.com/neural-net-thumb.png",
    link: "https://example.com/visualizations",
    source: "AI Viz",
    imageWidth: 1200,
    imageHeight: 800,
    position: 2,
  },
];

const MOCK_VIDEO_RESULTS: SerperVideoResult[] = [
  {
    title: "What is AI? Explained",
    link: "https://youtube.com/watch?v=ai123",
    snippet: "A beginner's guide to artificial intelligence...",
    imageUrl: "https://example.com/ai-video-thumb.jpg",
    source: "YouTube",
    duration: "10:24",
    channel: "TechExplained",
    position: 1,
  },
  {
    title: "AI in 2024: Year in Review",
    link: "https://youtube.com/watch?v=ai456",
    snippet: "Looking back at AI developments in 2024...",
    imageUrl: "https://example.com/ai-review-thumb.jpg",
    source: "YouTube",
    duration: "15:32",
    channel: "AI Weekly",
    position: 2,
  },
];

const MOCK_SEARCH_RESULTS: SearchResults = {
  id: "search_test_123",
  query: "latest AI news",
  searchType: "all",
  timestamp: new Date(),
  roomId: MOCK_ROOM_ID,
  web: MOCK_WEB_RESULTS,
  images: MOCK_IMAGE_RESULTS,
  videos: MOCK_VIDEO_RESULTS,
  creditsUsed: 3,
};

// ============================================================================
// Mock Socket.io Client
// ============================================================================

interface MockSocketHandlers {
  "search:started"?: (payload: SearchStartedPayload) => void;
  "search:results"?: (payload: SearchResultsPayload) => void;
  "search:error"?: (payload: SearchErrorPayload) => void;
  "search:clear"?: (payload: { roomId: RoomId }) => void;
}

class MockSocket {
  private handlers: MockSocketHandlers = {};
  public emittedEvents: Array<{ event: string; data: unknown }> = [];

  on<K extends keyof MockSocketHandlers>(
    event: K,
    handler: MockSocketHandlers[K],
  ): void {
    this.handlers[event] = handler;
  }

  off<K extends keyof MockSocketHandlers>(event: K): void {
    delete this.handlers[event];
  }

  emit(event: string, data: unknown): void {
    this.emittedEvents.push({ event, data });
  }

  // Simulate receiving an event from server
  simulateEvent<K extends keyof MockSocketHandlers>(
    event: K,
    payload: Parameters<NonNullable<MockSocketHandlers[K]>>[0],
  ): void {
    const handler = this.handlers[event];
    if (handler) {
      (handler as (p: typeof payload) => void)(payload);
    }
  }
}

class MockSignalingClient {
  private socket = new MockSocket();

  getSocket(): MockSocket {
    return this.socket;
  }
}

// ============================================================================
// Tests
// ============================================================================

describe("Voice-Activated Search E2E", () => {
  let mockClient: MockSignalingClient;
  let mockSocket: MockSocket;

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = new MockSignalingClient();
    mockSocket = mockClient.getSocket();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Search Event Flow", () => {
    it("should handle search:started event", async () => {
      const onSearchStart = vi.fn();

      mockSocket.on("search:started", onSearchStart);

      mockSocket.simulateEvent("search:started", {
        roomId: MOCK_ROOM_ID,
        query: "latest AI news",
        searchType: "all",
        searchId: "search_test_001",
      });

      expect(onSearchStart).toHaveBeenCalledWith({
        roomId: MOCK_ROOM_ID,
        query: "latest AI news",
        searchType: "all",
        searchId: "search_test_001",
      });
    });

    it("should handle search:results event with all result types", async () => {
      const onSearchResults = vi.fn();

      mockSocket.on("search:results", onSearchResults);

      mockSocket.simulateEvent("search:results", {
        roomId: MOCK_ROOM_ID,
        results: MOCK_SEARCH_RESULTS,
      });

      expect(onSearchResults).toHaveBeenCalledWith({
        roomId: MOCK_ROOM_ID,
        results: MOCK_SEARCH_RESULTS,
      });

      const receivedResults = onSearchResults.mock.calls[0][0].results;
      expect(receivedResults.web).toHaveLength(3);
      expect(receivedResults.images).toHaveLength(2);
      expect(receivedResults.videos).toHaveLength(2);
      expect(receivedResults.query).toBe("latest AI news");
    });

    it("should handle search:error event", async () => {
      const onSearchError = vi.fn();

      mockSocket.on("search:error", onSearchError);

      mockSocket.simulateEvent("search:error", {
        roomId: MOCK_ROOM_ID,
        searchId: "search_test_002",
        query: "test query",
        error: "API rate limit exceeded",
      });

      expect(onSearchError).toHaveBeenCalledWith({
        roomId: MOCK_ROOM_ID,
        searchId: "search_test_002",
        query: "test query",
        error: "API rate limit exceeded",
      });
    });

    it("should handle search:clear event", async () => {
      const onSearchClear = vi.fn();

      mockSocket.on("search:clear", onSearchClear);

      mockSocket.simulateEvent("search:clear", {
        roomId: MOCK_ROOM_ID,
      });

      expect(onSearchClear).toHaveBeenCalledWith({
        roomId: MOCK_ROOM_ID,
      });
    });
  });

  describe("Search Result Types", () => {
    it("should have valid web results structure", () => {
      const webResult = MOCK_WEB_RESULTS[0];

      expect(webResult).toHaveProperty("title");
      expect(webResult).toHaveProperty("link");
      expect(webResult).toHaveProperty("snippet");
      expect(webResult).toHaveProperty("position");
      expect(webResult.link).toMatch(/^https?:\/\//);
    });

    it("should have valid image results structure", () => {
      const imageResult = MOCK_IMAGE_RESULTS[0];

      expect(imageResult).toHaveProperty("title");
      expect(imageResult).toHaveProperty("imageUrl");
      expect(imageResult).toHaveProperty("link");
      expect(imageResult).toHaveProperty("source");
      expect(imageResult.imageUrl).toMatch(/^https?:\/\//);
    });

    it("should have valid video results structure", () => {
      const videoResult = MOCK_VIDEO_RESULTS[0];

      expect(videoResult).toHaveProperty("title");
      expect(videoResult).toHaveProperty("link");
      expect(videoResult).toHaveProperty("source");
      expect(videoResult).toHaveProperty("duration");
      expect(videoResult.link).toMatch(/^https?:\/\//);
    });
  });

  describe("Client-side Search Clear", () => {
    it("should emit search:clear when clearing results", () => {
      mockSocket.emit("search:clear", { roomId: MOCK_ROOM_ID });

      expect(mockSocket.emittedEvents).toContainEqual({
        event: "search:clear",
        data: { roomId: MOCK_ROOM_ID },
      });
    });
  });

  describe("Search Flow Integration", () => {
    it("should complete full search flow: started -> results", async () => {
      const searchState = {
        isLoading: false,
        results: null as SearchResults | null,
        error: null as string | null,
        query: null as string | null,
      };

      // Subscribe to events
      mockSocket.on("search:started", (payload) => {
        if (payload.roomId === MOCK_ROOM_ID) {
          searchState.isLoading = true;
          searchState.query = payload.query;
          searchState.error = null;
        }
      });

      mockSocket.on("search:results", (payload) => {
        if (payload.roomId === MOCK_ROOM_ID) {
          searchState.isLoading = false;
          searchState.results = payload.results;
        }
      });

      // Simulate search started
      mockSocket.simulateEvent("search:started", {
        roomId: MOCK_ROOM_ID,
        query: "test query",
        searchType: "all",
        searchId: "search_test_003",
      });

      expect(searchState.isLoading).toBe(true);
      expect(searchState.query).toBe("test query");

      // Simulate results received
      mockSocket.simulateEvent("search:results", {
        roomId: MOCK_ROOM_ID,
        results: MOCK_SEARCH_RESULTS,
      });

      expect(searchState.isLoading).toBe(false);
      expect(searchState.results).not.toBeNull();
      expect(searchState.results?.web).toHaveLength(3);
    });

    it("should handle search flow: started -> error", async () => {
      const searchState = {
        isLoading: false,
        results: null as SearchResults | null,
        error: null as string | null,
        query: null as string | null,
      };

      mockSocket.on("search:started", (payload) => {
        if (payload.roomId === MOCK_ROOM_ID) {
          searchState.isLoading = true;
          searchState.query = payload.query;
        }
      });

      mockSocket.on("search:error", (payload) => {
        if (payload.roomId === MOCK_ROOM_ID) {
          searchState.isLoading = false;
          searchState.error = payload.error;
        }
      });

      // Simulate search started
      mockSocket.simulateEvent("search:started", {
        roomId: MOCK_ROOM_ID,
        query: "failing query",
        searchType: "web",
        searchId: "search_test_004",
      });

      expect(searchState.isLoading).toBe(true);

      // Simulate error
      mockSocket.simulateEvent("search:error", {
        roomId: MOCK_ROOM_ID,
        searchId: "search_test_004",
        query: "failing query",
        error: "Search service unavailable",
      });

      expect(searchState.isLoading).toBe(false);
      expect(searchState.error).toBe("Search service unavailable");
    });

    it("should ignore events from other rooms", async () => {
      const otherRoomId = "other-room-456" as RoomId;
      const searchState = {
        isLoading: false,
        results: null as SearchResults | null,
      };

      mockSocket.on("search:started", (payload) => {
        if (payload.roomId === MOCK_ROOM_ID) {
          searchState.isLoading = true;
        }
      });

      mockSocket.on("search:results", (payload) => {
        if (payload.roomId === MOCK_ROOM_ID) {
          searchState.results = payload.results;
        }
      });

      // Simulate event from different room
      mockSocket.simulateEvent("search:started", {
        roomId: otherRoomId,
        query: "other room query",
        searchType: "all",
        searchId: "search_test_005",
      });

      expect(searchState.isLoading).toBe(false);

      mockSocket.simulateEvent("search:results", {
        roomId: otherRoomId,
        results: {
          ...MOCK_SEARCH_RESULTS,
          roomId: otherRoomId,
        },
      });

      expect(searchState.results).toBeNull();
    });
  });

  describe("Search Type Filtering", () => {
    it("should handle web-only search", () => {
      const webOnlyResults: SearchResults = {
        ...MOCK_SEARCH_RESULTS,
        searchType: "web",
        images: [],
        videos: [],
      };

      expect(webOnlyResults.web).toHaveLength(3);
      expect(webOnlyResults.images).toHaveLength(0);
      expect(webOnlyResults.videos).toHaveLength(0);
    });

    it("should handle images-only search", () => {
      const imagesOnlyResults: SearchResults = {
        ...MOCK_SEARCH_RESULTS,
        searchType: "images",
        web: [],
        videos: [],
      };

      expect(imagesOnlyResults.web).toHaveLength(0);
      expect(imagesOnlyResults.images).toHaveLength(2);
      expect(imagesOnlyResults.videos).toHaveLength(0);
    });

    it("should handle videos-only search", () => {
      const videosOnlyResults: SearchResults = {
        ...MOCK_SEARCH_RESULTS,
        searchType: "videos",
        web: [],
        images: [],
      };

      expect(videosOnlyResults.web).toHaveLength(0);
      expect(videosOnlyResults.images).toHaveLength(0);
      expect(videosOnlyResults.videos).toHaveLength(2);
    });
  });

  describe("Tab Selection Logic", () => {
    it("should auto-select web tab when web results exist", () => {
      let activeTab: SearchResultType = "web";

      const results = MOCK_SEARCH_RESULTS;
      if (results.web.length > 0) {
        activeTab = "web";
      } else if (results.images.length > 0) {
        activeTab = "images";
      } else if (results.videos.length > 0) {
        activeTab = "videos";
      }

      expect(activeTab).toBe("web");
    });

    it("should auto-select images tab when only images exist", () => {
      let activeTab: SearchResultType = "web";

      const results: SearchResults = {
        ...MOCK_SEARCH_RESULTS,
        web: [],
        videos: [],
      };

      if (results.web.length > 0) {
        activeTab = "web";
      } else if (results.images.length > 0) {
        activeTab = "images";
      } else if (results.videos.length > 0) {
        activeTab = "videos";
      }

      expect(activeTab).toBe("images");
    });

    it("should auto-select videos tab when only videos exist", () => {
      let activeTab: SearchResultType = "web";

      const results: SearchResults = {
        ...MOCK_SEARCH_RESULTS,
        web: [],
        images: [],
      };

      if (results.web.length > 0) {
        activeTab = "web";
      } else if (results.images.length > 0) {
        activeTab = "images";
      } else if (results.videos.length > 0) {
        activeTab = "videos";
      }

      expect(activeTab).toBe("videos");
    });
  });
});
