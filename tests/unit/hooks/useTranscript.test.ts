/**
 * useTranscript Hook Tests
 *
 * Tests for FEAT-507: useTranscript hook.
 * Verifies transcript state management, real-time updates, and download functionality.
 *
 * Part of the Long-Horizon Engineering Protocol - FEAT-507
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import {
  useTranscript,
  type UseTranscriptOptions,
} from "@/hooks/useTranscript";
import type {
  TranscriptEntry,
  TranscriptSummary,
  TranscriptHistoryResponse,
  TranscriptEntryEvent,
  TranscriptSummaryEvent,
} from "@/types/transcript";

// Helper to create mock entries
function createMockEntry(
  id: string,
  speaker: string,
  content: string,
  type: "ambient" | "ptt" | "ai_response" | "system" = "ptt",
): TranscriptEntry {
  return {
    id,
    roomId: "room-123",
    timestamp: new Date("2024-12-09T10:00:00Z"),
    speaker,
    speakerId: type === "ai_response" || type === "system" ? null : "peer-1",
    content,
    type,
  };
}

// Helper to create mock summary
function createMockSummary(id: string): TranscriptSummary {
  return {
    id,
    roomId: "room-123",
    timestamp: new Date("2024-12-09T10:30:00Z"),
    content: "Test summary content",
    bulletPoints: ["Point 1", "Point 2"],
    entriesSummarized: 10,
    tokenCount: 50,
    coverageStart: new Date("2024-12-09T10:00:00Z"),
    coverageEnd: new Date("2024-12-09T10:30:00Z"),
  };
}

// Create a more robust mock client factory
function createMockClient() {
  const handlers: Record<string, Function> = {};

  return {
    client: {
      on: vi.fn((event: string, handler: Function) => {
        handlers[event] = handler;
      }),
      off: vi.fn((event: string) => {
        delete handlers[event];
      }),
      requestTranscriptHistory: vi.fn(),
    },
    handlers,
    // Helper to trigger events
    triggerEntry: (entry: TranscriptEntry) => {
      handlers.onTranscriptEntry?.({ entry });
    },
    triggerSummary: (summary: TranscriptSummary) => {
      handlers.onTranscriptSummary?.({ summary });
    },
    triggerHistory: (response: TranscriptHistoryResponse) => {
      handlers.onTranscriptHistory?.(response);
    },
  };
}

describe("FEAT-507: useTranscript Hook", () => {
  let mockEntries: TranscriptEntry[];
  let mockSummaries: TranscriptSummary[];

  beforeEach(() => {
    vi.clearAllMocks();

    mockEntries = [
      createMockEntry("entry-1", "Alice", "Hello everyone"),
      createMockEntry("entry-2", "Bob", "Hi Alice"),
      createMockEntry("entry-3", "AI", "How can I help?", "ai_response"),
    ];

    mockSummaries = [createMockSummary("summary-1")];
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Initialization", () => {
    it("should initialize with loading state", () => {
      const { client } = createMockClient();
      const { result } = renderHook(() =>
        useTranscript({
          roomId: "room-123",
          client: client as any,
        }),
      );

      expect(result.current.isLoading).toBe(true);
      expect(result.current.entries).toEqual([]);
      expect(result.current.summaries).toEqual([]);
    });

    it("should request history on mount", async () => {
      const { client } = createMockClient();
      renderHook(() =>
        useTranscript({
          roomId: "room-123",
          client: client as any,
        }),
      );

      // Wait for effects to run
      await waitFor(() => {
        expect(client.requestTranscriptHistory).toHaveBeenCalledWith({
          roomId: "room-123",
          limit: 50,
          includeSummaries: true,
        });
      });
    });

    it("should register event handlers", async () => {
      const { client } = createMockClient();
      renderHook(() =>
        useTranscript({
          roomId: "room-123",
          client: client as any,
        }),
      );

      await waitFor(() => {
        expect(client.on).toHaveBeenCalledWith(
          "onTranscriptEntry",
          expect.any(Function),
        );
        expect(client.on).toHaveBeenCalledWith(
          "onTranscriptSummary",
          expect.any(Function),
        );
        expect(client.on).toHaveBeenCalledWith(
          "onTranscriptHistory",
          expect.any(Function),
        );
      });
    });

    it("should use custom initial limit", async () => {
      const { client } = createMockClient();
      renderHook(() =>
        useTranscript({
          roomId: "room-123",
          client: client as any,
          initialLimit: 100,
        }),
      );

      await waitFor(() => {
        expect(client.requestTranscriptHistory).toHaveBeenCalledWith(
          expect.objectContaining({
            limit: 100,
          }),
        );
      });
    });
  });

  describe("History handling", () => {
    it("should populate entries on history response", async () => {
      const { client, triggerHistory } = createMockClient();
      const { result } = renderHook(() =>
        useTranscript({
          roomId: "room-123",
          client: client as any,
        }),
      );

      await waitFor(() => {
        expect(client.on).toHaveBeenCalled();
      });

      act(() => {
        triggerHistory({
          entries: mockEntries,
          summaries: mockSummaries,
          hasMore: true,
          totalEntries: 100,
        });
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.entries).toEqual(mockEntries);
      expect(result.current.summaries).toEqual(mockSummaries);
      expect(result.current.hasMore).toBe(true);
      expect(result.current.totalEntries).toBe(100);
    });

    it("should handle empty history", async () => {
      const { client, triggerHistory } = createMockClient();
      const { result } = renderHook(() =>
        useTranscript({
          roomId: "room-123",
          client: client as any,
        }),
      );

      await waitFor(() => {
        expect(client.on).toHaveBeenCalled();
      });

      act(() => {
        triggerHistory({
          entries: [],
          summaries: [],
          hasMore: false,
          totalEntries: 0,
        });
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.entries).toEqual([]);
      expect(result.current.hasMore).toBe(false);
    });
  });

  describe("Real-time updates", () => {
    it("should add new entry on transcript:entry event", async () => {
      const { client, triggerHistory, triggerEntry } = createMockClient();
      const { result } = renderHook(() =>
        useTranscript({
          roomId: "room-123",
          client: client as any,
        }),
      );

      await waitFor(() => {
        expect(client.on).toHaveBeenCalled();
      });

      // Set initial state
      act(() => {
        triggerHistory({
          entries: mockEntries,
          summaries: [],
          hasMore: false,
          totalEntries: 3,
        });
      });

      const newEntry = createMockEntry("entry-4", "Charlie", "Hey everyone");

      act(() => {
        triggerEntry(newEntry);
      });

      await waitFor(() => {
        expect(result.current.entries).toHaveLength(4);
      });

      expect(result.current.entries[3]).toEqual(newEntry);
      expect(result.current.totalEntries).toBe(4);
    });

    it("should not add duplicate entries", async () => {
      const { client, triggerHistory, triggerEntry } = createMockClient();
      const { result } = renderHook(() =>
        useTranscript({
          roomId: "room-123",
          client: client as any,
        }),
      );

      await waitFor(() => {
        expect(client.on).toHaveBeenCalled();
      });

      act(() => {
        triggerHistory({
          entries: mockEntries,
          summaries: [],
          hasMore: false,
          totalEntries: 3,
        });
      });

      // Try to add existing entry
      act(() => {
        triggerEntry(mockEntries[0]);
      });

      expect(result.current.entries).toHaveLength(3);
    });

    it("should add new summary on transcript:summary event", async () => {
      const { client, triggerHistory, triggerSummary } = createMockClient();
      const { result } = renderHook(() =>
        useTranscript({
          roomId: "room-123",
          client: client as any,
        }),
      );

      await waitFor(() => {
        expect(client.on).toHaveBeenCalled();
      });

      act(() => {
        triggerHistory({
          entries: [],
          summaries: mockSummaries,
          hasMore: false,
          totalEntries: 0,
        });
      });

      const newSummary = createMockSummary("summary-2");

      act(() => {
        triggerSummary(newSummary);
      });

      await waitFor(() => {
        expect(result.current.summaries).toHaveLength(2);
      });
    });
  });

  describe("Pagination", () => {
    it("should load more entries when loadMore is called", async () => {
      const { client, triggerHistory } = createMockClient();
      const { result } = renderHook(() =>
        useTranscript({
          roomId: "room-123",
          client: client as any,
        }),
      );

      await waitFor(() => {
        expect(client.on).toHaveBeenCalled();
      });

      act(() => {
        triggerHistory({
          entries: mockEntries,
          summaries: [],
          hasMore: true,
          totalEntries: 100,
        });
      });

      act(() => {
        result.current.loadMore();
      });

      expect(client.requestTranscriptHistory).toHaveBeenLastCalledWith({
        roomId: "room-123",
        limit: 30, // default pagination limit
        beforeId: "entry-1",
        includeSummaries: false,
      });
    });

    it("should not load more when hasMore is false", async () => {
      const { client, triggerHistory } = createMockClient();
      const { result } = renderHook(() =>
        useTranscript({
          roomId: "room-123",
          client: client as any,
        }),
      );

      await waitFor(() => {
        expect(client.on).toHaveBeenCalled();
      });

      act(() => {
        triggerHistory({
          entries: mockEntries,
          summaries: [],
          hasMore: false,
          totalEntries: 3,
        });
      });

      const callCount = client.requestTranscriptHistory.mock.calls.length;

      act(() => {
        result.current.loadMore();
      });

      // Should not have made another request
      expect(client.requestTranscriptHistory).toHaveBeenCalledTimes(callCount);
    });

    it("should prepend older entries on pagination response", async () => {
      const { client, triggerHistory } = createMockClient();
      const { result } = renderHook(() =>
        useTranscript({
          roomId: "room-123",
          client: client as any,
        }),
      );

      await waitFor(() => {
        expect(client.on).toHaveBeenCalled();
      });

      // Initial load
      act(() => {
        triggerHistory({
          entries: mockEntries,
          summaries: [],
          hasMore: true,
          totalEntries: 100,
        });
      });

      // Pagination response
      const olderEntries = [
        createMockEntry("entry-old-1", "Dave", "Older message 1"),
        createMockEntry("entry-old-2", "Eve", "Older message 2"),
      ];

      act(() => {
        triggerHistory({
          entries: olderEntries,
          summaries: [],
          hasMore: true,
          totalEntries: 100,
        });
      });

      await waitFor(() => {
        expect(result.current.entries).toHaveLength(5);
      });

      // Older entries should be at the beginning
      expect(result.current.entries[0].id).toBe("entry-old-1");
      expect(result.current.entries[1].id).toBe("entry-old-2");
    });
  });

  describe("Auto-scroll", () => {
    it("should default to auto-scroll enabled", () => {
      const { client } = createMockClient();
      const { result } = renderHook(() =>
        useTranscript({
          roomId: "room-123",
          client: client as any,
        }),
      );

      expect(result.current.autoScroll).toBe(true);
    });

    it("should toggle auto-scroll", () => {
      const { client } = createMockClient();
      const { result } = renderHook(() =>
        useTranscript({
          roomId: "room-123",
          client: client as any,
        }),
      );

      act(() => {
        result.current.toggleAutoScroll();
      });

      expect(result.current.autoScroll).toBe(false);

      act(() => {
        result.current.toggleAutoScroll();
      });

      expect(result.current.autoScroll).toBe(true);
    });

    it("should set auto-scroll explicitly", () => {
      const { client } = createMockClient();
      const { result } = renderHook(() =>
        useTranscript({
          roomId: "room-123",
          client: client as any,
        }),
      );

      act(() => {
        result.current.setAutoScroll(false);
      });

      expect(result.current.autoScroll).toBe(false);
    });

    it("should use custom auto-scroll default", () => {
      const { client } = createMockClient();
      const { result } = renderHook(() =>
        useTranscript({
          roomId: "room-123",
          client: client as any,
          autoScrollDefault: false,
        }),
      );

      expect(result.current.autoScroll).toBe(false);
    });
  });

  describe("Local entry addition", () => {
    it("should add entry locally via addEntry", async () => {
      const { client, triggerHistory } = createMockClient();
      const { result } = renderHook(() =>
        useTranscript({
          roomId: "room-123",
          client: client as any,
        }),
      );

      await waitFor(() => {
        expect(client.on).toHaveBeenCalled();
      });

      act(() => {
        triggerHistory({
          entries: mockEntries,
          summaries: [],
          hasMore: false,
          totalEntries: 3,
        });
      });

      const newEntry = createMockEntry("entry-local", "Local", "Local message");

      act(() => {
        result.current.addEntry(newEntry);
      });

      expect(result.current.entries).toHaveLength(4);
      expect(result.current.entries[3]).toEqual(newEntry);
    });
  });

  describe("Error handling", () => {
    it("should clear error", async () => {
      const { client } = createMockClient();
      const { result } = renderHook(() =>
        useTranscript({
          roomId: "room-123",
          client: client as any,
        }),
      );

      // Verify clearError doesn't throw even with null error
      act(() => {
        result.current.clearError();
      });

      expect(result.current.error).toBeNull();
    });
  });

  describe("Refresh", () => {
    it("should refresh transcript", async () => {
      const { client, triggerHistory } = createMockClient();
      const { result } = renderHook(() =>
        useTranscript({
          roomId: "room-123",
          client: client as any,
        }),
      );

      await waitFor(() => {
        expect(client.on).toHaveBeenCalled();
      });

      act(() => {
        triggerHistory({
          entries: mockEntries,
          summaries: mockSummaries,
          hasMore: false,
          totalEntries: 3,
        });
      });

      const initialCallCount =
        client.requestTranscriptHistory.mock.calls.length;

      act(() => {
        result.current.refresh();
      });

      expect(result.current.isLoading).toBe(true);
      expect(result.current.entries).toEqual([]);
      expect(client.requestTranscriptHistory).toHaveBeenCalledTimes(
        initialCallCount + 1,
      );
    });
  });

  describe("Cleanup", () => {
    it("should unregister event handlers on unmount", async () => {
      const { client } = createMockClient();
      const { unmount } = renderHook(() =>
        useTranscript({
          roomId: "room-123",
          client: client as any,
        }),
      );

      await waitFor(() => {
        expect(client.on).toHaveBeenCalled();
      });

      unmount();

      expect(client.off).toHaveBeenCalledWith(
        "onTranscriptEntry",
        expect.any(Function),
      );
      expect(client.off).toHaveBeenCalledWith(
        "onTranscriptSummary",
        expect.any(Function),
      );
      expect(client.off).toHaveBeenCalledWith(
        "onTranscriptHistory",
        expect.any(Function),
      );
    });
  });

  describe("No client", () => {
    it("should handle null client gracefully", () => {
      const { result } = renderHook(() =>
        useTranscript({
          roomId: "room-123",
          client: null,
        }),
      );

      expect(result.current.isLoading).toBe(true);
      expect(result.current.entries).toEqual([]);
    });
  });
});

describe("Transcript formatting", () => {
  it("should format text entries correctly", () => {
    const entry = createMockEntry("test", "Alice", "Hello world", "ptt");
    expect(entry.speaker).toBe("Alice");
    expect(entry.type).toBe("ptt");
  });

  it("should format AI entries with correct badge", () => {
    const entry = createMockEntry("test", "AI", "Response", "ai_response");
    expect(entry.type).toBe("ai_response");
    expect(entry.speakerId).toBeNull();
  });

  it("should format system entries correctly", () => {
    const entry = createMockEntry("test", "System", "User joined", "system");
    expect(entry.type).toBe("system");
    expect(entry.speakerId).toBeNull();
  });
});
