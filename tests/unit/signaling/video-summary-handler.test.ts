/**
 * Video Summary Handler Tests
 *
 * Tests for the VideoSummaryEventsHandler that processes voice-activated
 * video summary requests via OpenAI function calls.
 *
 * Part of the Long-Horizon Engineering Protocol - FEAT-903
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Server as SocketIOServer } from "socket.io";
import type { RoomId } from "@/types/room";
import type { FunctionCallEvent } from "@/types/search";
import type { VideoPlaybackState, VideoPlaylist } from "@/types/video";
import type { YouTubeVideoMetadata, SummaryMode } from "@/types/video-summary";
import type { SerperVideoResult } from "@/types/search";

// Mock fetch globally for YouTube API
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock OpenAI for LLM service
const mockOpenAICreate = vi.fn();
vi.mock("openai", () => {
  class MockOpenAI {
    chat = {
      completions: {
        create: mockOpenAICreate,
      },
    };
  }
  return { default: MockOpenAI };
});

// Import after mocking
import {
  VideoSummaryEventsHandler,
  createVideoSummaryEventsHandler,
  type VideoSummaryEventsConfig,
  type VideoSummaryPayload,
  type VideoSummaryErrorPayload,
} from "@/server/signaling/video-summary-events";

// Mock console methods
vi.spyOn(console, "log").mockImplementation(() => {});
vi.spyOn(console, "error").mockImplementation(() => {});

// Mock YouTube API response
const mockYouTubeApiResponse = {
  items: [
    {
      id: "dQw4w9WgXcQ",
      snippet: {
        title: "Rick Astley - Never Gonna Give You Up",
        description: "The official music video for Rick Astley...",
        channelTitle: "Rick Astley",
        channelId: "UCuAXFkgsw1L7xaCfnd5JJOw",
        publishedAt: "2009-10-25T06:57:33Z",
        thumbnails: {
          default: {
            url: "https://i.ytimg.com/vi/dQw4w9WgXcQ/default.jpg",
            width: 120,
            height: 90,
          },
        },
        tags: ["Rick Astley", "Never Gonna Give You Up", "80s Music"],
        categoryId: "10",
      },
      contentDetails: {
        duration: "PT3M33S",
        caption: "true",
      },
      statistics: {
        viewCount: "1400000000",
        likeCount: "15000000",
      },
    },
  ],
  pageInfo: { totalResults: 1 },
};

// Sample video state for testing
const createMockVideoState = (videoUrl: string): VideoPlaybackState => ({
  isOpen: true,
  isPlaying: true,
  isPaused: false,
  currentIndex: 0,
  currentTime: 60,
  playlist: {
    id: "playlist_123",
    roomId: "room_123",
    videos: [
      {
        title: "Test Video",
        link: videoUrl,
        snippet: "Test description",
        imageUrl: "https://example.com/thumb.jpg",
        source: "YouTube",
        position: 1,
      } as SerperVideoResult,
    ],
    currentIndex: 0,
    createdAt: new Date(),
    query: "test query",
  },
  syncedStartTime: Date.now(),
  triggeredBy: "peer_123",
  lastSyncAt: Date.now(),
});

describe("VideoSummaryEventsHandler", () => {
  let handler: VideoSummaryEventsHandler;
  let mockIo: SocketIOServer;
  let mockSendFunctionOutput: ReturnType<typeof vi.fn>;
  let mockGetVideoState: ReturnType<typeof vi.fn>;
  let mockEmit: ReturnType<typeof vi.fn>;

  const testConfig: Omit<
    VideoSummaryEventsConfig,
    "io" | "sendFunctionOutput" | "getVideoState"
  > = {
    youtubeApiKey: "test-youtube-key",
    openaiApiKey: "test-openai-key",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
    mockOpenAICreate.mockReset();

    // Setup mock Socket.io
    mockEmit = vi.fn();
    mockIo = {
      to: vi.fn().mockReturnThis(),
      emit: mockEmit,
    } as unknown as SocketIOServer;

    mockSendFunctionOutput = vi.fn();
    mockGetVideoState = vi.fn();

    handler = createVideoSummaryEventsHandler({
      ...testConfig,
      io: mockIo,
      sendFunctionOutput: mockSendFunctionOutput,
      getVideoState: mockGetVideoState,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("constructor", () => {
    it("should create handler with valid config", () => {
      expect(handler).toBeInstanceOf(VideoSummaryEventsHandler);
    });
  });

  describe("handleFunctionCall", () => {
    const createFunctionCall = (mode?: SummaryMode): FunctionCallEvent => ({
      name: "getVideoSummary",
      callId: "call_abc123",
      arguments: mode ? { mode } : {},
    });

    it("should ignore non-getVideoSummary function calls", async () => {
      const functionCall: FunctionCallEvent = {
        name: "otherFunction",
        callId: "call_123",
        arguments: {},
      };

      await handler.handleFunctionCall("room_123", functionCall);

      expect(mockSendFunctionOutput).not.toHaveBeenCalled();
    });

    it("should return error when no video is playing", async () => {
      mockGetVideoState.mockReturnValue(null);

      await handler.handleFunctionCall("room_123", createFunctionCall());

      expect(mockSendFunctionOutput).toHaveBeenCalledWith(
        "room_123",
        "call_abc123",
        expect.stringContaining("No video is currently playing"),
      );
    });

    it("should return error when video player is closed", async () => {
      mockGetVideoState.mockReturnValue({
        ...createMockVideoState("https://youtube.com/watch?v=dQw4w9WgXcQ"),
        isOpen: false,
      });

      await handler.handleFunctionCall("room_123", createFunctionCall());

      expect(mockSendFunctionOutput).toHaveBeenCalledWith(
        "room_123",
        "call_abc123",
        expect.stringContaining("No video is currently playing"),
      );
    });

    it("should return error when playlist is empty", async () => {
      const state = createMockVideoState(
        "https://youtube.com/watch?v=dQw4w9WgXcQ",
      );
      state.playlist = null;
      mockGetVideoState.mockReturnValue(state);

      await handler.handleFunctionCall("room_123", createFunctionCall());

      expect(mockSendFunctionOutput).toHaveBeenCalledWith(
        "room_123",
        "call_abc123",
        expect.stringContaining("No video is currently playing"),
      );
    });

    it("should return error for invalid video URL", async () => {
      mockGetVideoState.mockReturnValue(
        createMockVideoState("https://example.com/not-youtube"),
      );

      await handler.handleFunctionCall("room_123", createFunctionCall());

      expect(mockSendFunctionOutput).toHaveBeenCalledWith(
        "room_123",
        "call_abc123",
        expect.stringContaining("Could not extract video ID"),
      );
    });

    it("should generate summary for valid video in default mode", async () => {
      mockGetVideoState.mockReturnValue(
        createMockVideoState("https://youtube.com/watch?v=dQw4w9WgXcQ"),
      );

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockYouTubeApiResponse,
      });

      mockOpenAICreate.mockResolvedValueOnce({
        choices: [
          {
            message: {
              content:
                "Rick Astley's legendary 80s hit that became the ultimate internet meme.",
            },
          },
        ],
      });

      await handler.handleFunctionCall("room_123", createFunctionCall());

      // Verify YouTube API was called
      expect(mockFetch).toHaveBeenCalled();

      // Verify LLM was called
      expect(mockOpenAICreate).toHaveBeenCalled();

      // Verify broadcast to room
      expect(mockIo.to).toHaveBeenCalledWith("room_123");
      expect(mockEmit).toHaveBeenCalledWith(
        "video:summary",
        expect.objectContaining({
          roomId: "room_123",
          summary: expect.objectContaining({
            mode: "default",
            summary: expect.any(String),
          }),
        }),
      );

      // Verify function output sent
      expect(mockSendFunctionOutput).toHaveBeenCalledWith(
        "room_123",
        "call_abc123",
        expect.stringContaining("Rick Astley"),
      );
    });

    it("should use default mode when mode not specified", async () => {
      mockGetVideoState.mockReturnValue(
        createMockVideoState("https://youtube.com/watch?v=dQw4w9WgXcQ"),
      );

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockYouTubeApiResponse,
      });

      mockOpenAICreate.mockResolvedValueOnce({
        choices: [{ message: { content: "A great video." } }],
      });

      await handler.handleFunctionCall("room_123", createFunctionCall());

      expect(mockEmit).toHaveBeenCalledWith(
        "video:summary",
        expect.objectContaining({
          summary: expect.objectContaining({
            mode: "default",
          }),
        }),
      );
    });

    it("should handle deep mode (falls back to enhanced for now)", async () => {
      mockGetVideoState.mockReturnValue(
        createMockVideoState("https://youtube.com/watch?v=dQw4w9WgXcQ"),
      );

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockYouTubeApiResponse,
      });

      mockOpenAICreate.mockResolvedValueOnce({
        choices: [{ message: { content: "Deep analysis." } }],
      });

      await handler.handleFunctionCall("room_123", createFunctionCall("deep"));

      expect(mockEmit).toHaveBeenCalledWith(
        "video:summary",
        expect.objectContaining({
          summary: expect.objectContaining({
            mode: "deep",
          }),
        }),
      );
    });

    it("should handle YouTube API errors gracefully", async () => {
      mockGetVideoState.mockReturnValue(
        createMockVideoState("https://youtube.com/watch?v=dQw4w9WgXcQ"),
      );

      // Mock a server error response
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      await handler.handleFunctionCall("room_123", createFunctionCall());

      // Verify error broadcast
      expect(mockEmit).toHaveBeenCalledWith(
        "video:summary-error",
        expect.objectContaining({
          roomId: "room_123",
        }),
      );

      // Verify error sent to OpenAI
      expect(mockSendFunctionOutput).toHaveBeenCalledWith(
        "room_123",
        "call_abc123",
        expect.stringContaining("Failed to generate summary"),
      );
    }, 15000);

    it("should handle video not found", async () => {
      mockGetVideoState.mockReturnValue(
        createMockVideoState("https://youtube.com/watch?v=nonexistent"),
      );

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ items: [], pageInfo: { totalResults: 0 } }),
      });

      await handler.handleFunctionCall("room_123", createFunctionCall());

      expect(mockSendFunctionOutput).toHaveBeenCalledWith(
        "room_123",
        "call_abc123",
        expect.stringContaining("Video not found"),
      );
    });

    it("should support various YouTube URL formats", async () => {
      // Test different URL formats with different video IDs to avoid caching
      const urlFormats = [
        {
          url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
          id: "dQw4w9WgXcQ",
        },
        { url: "https://youtu.be/abc123def45", id: "abc123def45" },
        { url: "https://youtube.com/watch?v=xyz789uvw12", id: "xyz789uvw12" },
      ];

      for (const { url, id } of urlFormats) {
        // Reset mocks for each iteration
        mockFetch.mockReset();
        mockOpenAICreate.mockReset();
        mockSendFunctionOutput.mockClear();
        mockEmit.mockClear();

        mockGetVideoState.mockReturnValue(createMockVideoState(url));

        // Create response with correct video ID
        const apiResponse = {
          items: [{ ...mockYouTubeApiResponse.items[0], id }],
          pageInfo: { totalResults: 1 },
        };

        mockFetch.mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => apiResponse,
        });

        mockOpenAICreate.mockResolvedValueOnce({
          choices: [{ message: { content: `Summary for ${id}` } }],
        });

        await handler.handleFunctionCall("room_123", createFunctionCall());

        expect(mockFetch).toHaveBeenCalled();
        expect(mockSendFunctionOutput).toHaveBeenCalledWith(
          "room_123",
          "call_abc123",
          expect.stringContaining("Summary"),
        );
      }
    });

    it("should include processing time in response", async () => {
      mockGetVideoState.mockReturnValue(
        createMockVideoState("https://youtube.com/watch?v=dQw4w9WgXcQ"),
      );

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockYouTubeApiResponse,
      });

      mockOpenAICreate.mockResolvedValueOnce({
        choices: [{ message: { content: "Summary." } }],
      });

      await handler.handleFunctionCall("room_123", createFunctionCall());

      // Verify processingTimeMs is included
      const callArgs = mockSendFunctionOutput.mock.calls[0];
      const output = JSON.parse(callArgs[2]);
      expect(output.processingTimeMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe("state management", () => {
    it("should track last summary for room", async () => {
      mockGetVideoState.mockReturnValue(
        createMockVideoState("https://youtube.com/watch?v=dQw4w9WgXcQ"),
      );

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockYouTubeApiResponse,
      });

      mockOpenAICreate.mockResolvedValueOnce({
        choices: [{ message: { content: "Summary text." } }],
      });

      await handler.handleFunctionCall("room_123", {
        name: "getVideoSummary",
        callId: "call_123",
        arguments: {},
      });

      const summary = handler.getCurrentSummary("room_123");
      expect(summary).not.toBeNull();
      expect(summary?.summary).toBe("Summary text.");
    });

    it("should return null for room without summary", () => {
      const summary = handler.getCurrentSummary("nonexistent_room");
      expect(summary).toBeNull();
    });

    it("should clear summary state for room", async () => {
      mockGetVideoState.mockReturnValue(
        createMockVideoState("https://youtube.com/watch?v=dQw4w9WgXcQ"),
      );

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockYouTubeApiResponse,
      });

      mockOpenAICreate.mockResolvedValueOnce({
        choices: [{ message: { content: "Summary." } }],
      });

      await handler.handleFunctionCall("room_123", {
        name: "getVideoSummary",
        callId: "call_123",
        arguments: {},
      });

      handler.clearSummary("room_123");

      const summary = handler.getCurrentSummary("room_123");
      expect(summary).toBeNull();
    });

    it("should clean up room state", () => {
      handler.cleanupRoom("room_123");
      const summary = handler.getCurrentSummary("room_123");
      expect(summary).toBeNull();
    });

    it("should report generating state", async () => {
      // Initially not generating
      expect(handler.isGenerating("room_123")).toBe(false);
    });
  });

  describe("cache management", () => {
    it("should report cache stats", () => {
      const stats = handler.getCacheStats();
      expect(stats).toHaveProperty("size");
      expect(stats).toHaveProperty("validEntries");
    });

    it("should prune cache", () => {
      const removed = handler.pruneCache();
      expect(typeof removed).toBe("number");
    });
  });
});

describe("createVideoSummaryEventsHandler", () => {
  it("should create handler instance", () => {
    const mockIo = {
      to: vi.fn().mockReturnThis(),
      emit: vi.fn(),
    } as unknown as SocketIOServer;

    const handler = createVideoSummaryEventsHandler({
      youtubeApiKey: "test-key",
      openaiApiKey: "test-key",
      io: mockIo,
      sendFunctionOutput: vi.fn(),
      getVideoState: vi.fn(),
    });

    expect(handler).toBeInstanceOf(VideoSummaryEventsHandler);
  });
});
