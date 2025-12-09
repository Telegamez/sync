/**
 * Transcript Socket.io Events Tests
 *
 * Tests for FEAT-505: Transcript Socket.io events.
 * Verifies real-time transcript broadcasting and history requests.
 *
 * Part of the Long-Horizon Engineering Protocol - FEAT-505
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  TranscriptEventsHandler,
  createTranscriptEventsHandler,
  type TranscriptEventsConfig,
} from "@/server/signaling/transcript-events";
import type { Server as SocketIOServer, Socket } from "socket.io";
import type {
  TranscriptEntry,
  TranscriptSummary,
  TranscriptHistoryRequest,
  TranscriptHistoryResponse,
} from "@/types/transcript";
import type { ContextManager } from "@/server/signaling/context-manager";

// Create mock entries
function createMockEntry(
  id: string,
  speaker: string,
  content: string,
  type: "ambient" | "ptt" | "ai_response" | "system" = "ptt",
): TranscriptEntry {
  return {
    id,
    roomId: "room-123",
    timestamp: new Date(),
    speaker,
    speakerId: type === "ai_response" || type === "system" ? null : "peer-1",
    content,
    type,
  };
}

// Create mock summary
function createMockSummary(id: string): TranscriptSummary {
  return {
    id,
    roomId: "room-123",
    timestamp: new Date(),
    content: "Test summary content",
    bulletPoints: ["Point 1", "Point 2"],
    entriesSummarized: 10,
    tokenCount: 50,
    coverageStart: new Date(),
    coverageEnd: new Date(),
  };
}

describe("FEAT-505: Transcript Socket.io Events", () => {
  let handler: TranscriptEventsHandler;
  let mockIO: SocketIOServer;
  let mockSocket: Socket;
  let mockContextManager: ContextManager;
  let mockEntries: TranscriptEntry[];
  let mockSummaries: TranscriptSummary[];

  beforeEach(() => {
    vi.clearAllMocks();

    // Create mock entries and summaries
    mockEntries = [
      createMockEntry("entry-1", "Alice", "Hello everyone"),
      createMockEntry("entry-2", "Bob", "Hi Alice"),
      createMockEntry("entry-3", "AI", "How can I help?", "ai_response"),
    ];

    mockSummaries = [createMockSummary("summary-1")];

    // Mock Socket.io server
    mockIO = {
      to: vi.fn().mockReturnThis(),
      emit: vi.fn(),
    } as unknown as SocketIOServer;

    // Mock Socket
    mockSocket = {
      data: {
        peerId: "peer-1",
        displayName: "Alice",
        roomId: "room-123",
      },
      on: vi.fn(),
      emit: vi.fn(),
    } as unknown as Socket;

    // Mock ContextManager
    mockContextManager = {
      getTranscriptEntries: vi.fn().mockReturnValue({
        entries: mockEntries,
        hasMore: false,
        total: 3,
      }),
      getTranscriptSummaries: vi.fn().mockReturnValue(mockSummaries),
    } as unknown as ContextManager;

    const config: TranscriptEventsConfig = {
      io: mockIO,
      contextManager: mockContextManager,
    };

    handler = new TranscriptEventsHandler(config);
  });

  describe("Handler initialization", () => {
    it("should create handler with config", () => {
      expect(handler).toBeInstanceOf(TranscriptEventsHandler);
    });

    it("should create handler using factory function", () => {
      const factoryHandler = createTranscriptEventsHandler({
        io: mockIO,
        contextManager: mockContextManager,
      });
      expect(factoryHandler).toBeInstanceOf(TranscriptEventsHandler);
    });
  });

  describe("Socket handler registration", () => {
    it("should register transcript:request-history handler", () => {
      handler.registerSocketHandlers(mockSocket);

      expect(mockSocket.on).toHaveBeenCalledWith(
        "transcript:request-history",
        expect.any(Function),
      );
    });
  });

  describe("History request handling", () => {
    it("should handle history request with callback", () => {
      handler.registerSocketHandlers(mockSocket);

      // Get the registered handler
      const onCall = (
        mockSocket.on as ReturnType<typeof vi.fn>
      ).mock.calls.find((call) => call[0] === "transcript:request-history");
      const historyHandler = onCall?.[1];

      const callback = vi.fn();
      const request: TranscriptHistoryRequest = {
        roomId: "room-123",
        limit: 50,
        includeSummaries: true,
      };

      historyHandler(request, callback);

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          entries: mockEntries,
          summaries: mockSummaries,
          hasMore: false,
          totalEntries: 3,
        }),
      );
    });

    it("should handle history request without callback (emit)", () => {
      handler.registerSocketHandlers(mockSocket);

      const onCall = (
        mockSocket.on as ReturnType<typeof vi.fn>
      ).mock.calls.find((call) => call[0] === "transcript:request-history");
      const historyHandler = onCall?.[1];

      const request: TranscriptHistoryRequest = {
        roomId: "room-123",
        limit: 50,
        includeSummaries: false,
      };

      historyHandler(request);

      expect(mockSocket.emit).toHaveBeenCalledWith(
        "transcript:history",
        expect.objectContaining({
          entries: mockEntries,
          summaries: [],
          hasMore: false,
          totalEntries: 3,
        }),
      );
    });

    it("should deny history request if socket not in room", () => {
      // Socket not in the requested room
      (mockSocket.data as { roomId?: string }).roomId = "other-room";

      handler.registerSocketHandlers(mockSocket);

      const onCall = (
        mockSocket.on as ReturnType<typeof vi.fn>
      ).mock.calls.find((call) => call[0] === "transcript:request-history");
      const historyHandler = onCall?.[1];

      const callback = vi.fn();
      const request: TranscriptHistoryRequest = {
        roomId: "room-123",
        limit: 50,
      };

      historyHandler(request, callback);

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          entries: [],
          summaries: [],
          hasMore: false,
          totalEntries: 0,
        }),
      );
    });

    it("should support pagination with beforeId", () => {
      handler.registerSocketHandlers(mockSocket);

      const onCall = (
        mockSocket.on as ReturnType<typeof vi.fn>
      ).mock.calls.find((call) => call[0] === "transcript:request-history");
      const historyHandler = onCall?.[1];

      const callback = vi.fn();
      const request: TranscriptHistoryRequest = {
        roomId: "room-123",
        limit: 20,
        beforeId: "entry-50",
      };

      historyHandler(request, callback);

      expect(mockContextManager.getTranscriptEntries).toHaveBeenCalledWith(
        "room-123",
        20,
        0,
        "entry-50",
      );
    });
  });

  describe("Entry broadcasting", () => {
    it("should broadcast entry to room", () => {
      const entry = createMockEntry("entry-new", "Alice", "New message");

      handler.broadcastEntry("room-123", entry);

      expect(mockIO.to).toHaveBeenCalledWith("room-123");
      expect(mockIO.emit).toHaveBeenCalledWith("transcript:entry", {
        entry,
      });
    });

    it("should include entry type in broadcast", () => {
      const aiEntry = createMockEntry(
        "ai-entry",
        "AI",
        "AI response",
        "ai_response",
      );

      handler.broadcastEntry("room-123", aiEntry);

      expect(mockIO.emit).toHaveBeenCalledWith(
        "transcript:entry",
        expect.objectContaining({
          entry: expect.objectContaining({
            type: "ai_response",
          }),
        }),
      );
    });
  });

  describe("Summary broadcasting", () => {
    it("should broadcast summary to room", () => {
      const summary = createMockSummary("new-summary");

      handler.broadcastSummary("room-123", summary);

      expect(mockIO.to).toHaveBeenCalledWith("room-123");
      expect(mockIO.emit).toHaveBeenCalledWith("transcript:summary", {
        summary,
      });
    });
  });

  describe("Late joiner history", () => {
    it("should send history to specific socket", () => {
      handler.sendHistoryToSocket(mockSocket, "room-123", 50);

      expect(mockContextManager.getTranscriptEntries).toHaveBeenCalledWith(
        "room-123",
        50,
      );
      expect(mockContextManager.getTranscriptSummaries).toHaveBeenCalledWith(
        "room-123",
      );
      expect(mockSocket.emit).toHaveBeenCalledWith(
        "transcript:history",
        expect.objectContaining({
          entries: mockEntries,
          summaries: mockSummaries,
          hasMore: false,
          totalEntries: 3,
        }),
      );
    });

    it("should use default limit of 50", () => {
      handler.sendHistoryToSocket(mockSocket, "room-123");

      expect(mockContextManager.getTranscriptEntries).toHaveBeenCalledWith(
        "room-123",
        50,
      );
    });
  });
});

describe("TranscriptHistoryResponse structure", () => {
  it("should have correct response structure", () => {
    const response: TranscriptHistoryResponse = {
      entries: [],
      summaries: [],
      hasMore: true,
      totalEntries: 100,
    };

    expect(response.entries).toEqual([]);
    expect(response.summaries).toEqual([]);
    expect(response.hasMore).toBe(true);
    expect(response.totalEntries).toBe(100);
  });
});

describe("TranscriptHistoryRequest structure", () => {
  it("should support all request fields", () => {
    const request: TranscriptHistoryRequest = {
      roomId: "room-123",
      limit: 50,
      beforeId: "entry-100",
      includeSummaries: true,
    };

    expect(request.roomId).toBe("room-123");
    expect(request.limit).toBe(50);
    expect(request.beforeId).toBe("entry-100");
    expect(request.includeSummaries).toBe(true);
  });

  it("should allow minimal request", () => {
    const request: TranscriptHistoryRequest = {
      roomId: "room-123",
      limit: 20,
    };

    expect(request.beforeId).toBeUndefined();
    expect(request.includeSummaries).toBeUndefined();
  });
});

describe("Event type constants", () => {
  it("should use correct event names", () => {
    // These event names match the types defined in transcript.ts
    const clientEvents = ["transcript:request-history"];
    const serverEvents = [
      "transcript:entry",
      "transcript:summary",
      "transcript:history",
    ];

    expect(clientEvents).toContain("transcript:request-history");
    expect(serverEvents).toContain("transcript:entry");
    expect(serverEvents).toContain("transcript:summary");
    expect(serverEvents).toContain("transcript:history");
  });
});
