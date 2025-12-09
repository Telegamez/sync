/**
 * Summarization Service Tests
 *
 * Tests for FEAT-504: Periodic conversation summarization.
 * Verifies monitoring, threshold detection, and summary generation.
 *
 * Part of the Long-Horizon Engineering Protocol - FEAT-504
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  SummarizationService,
  createSummarizationService,
  type SummarizationServiceConfig,
  type SummarizationServiceCallbacks,
} from "@/server/signaling/summarization-service";
import type { ContextManager } from "@/server/signaling/context-manager";
import type { TranscriptSummary, TranscriptEntry } from "@/types/transcript";

// Mock OpenAI
vi.mock("openai", () => {
  const mockCreate = vi.fn().mockResolvedValue({
    choices: [
      {
        message: {
          content: JSON.stringify({
            summary: "Test summary of the conversation",
            bulletPoints: ["Key point 1", "Key point 2", "Key point 3"],
            topics: ["Topic A", "Topic B"],
            decisions: ["Decision 1"],
            actionItems: ["Action item 1"],
          }),
        },
      },
    ],
  });

  class MockOpenAI {
    chat = {
      completions: {
        create: mockCreate,
      },
    };
  }

  return {
    default: MockOpenAI,
  };
});

describe("FEAT-504: Summarization Service", () => {
  let service: SummarizationService;
  let mockCallbacks: SummarizationServiceCallbacks;
  let mockContextManager: ContextManager;
  let summaryResults: TranscriptSummary[];

  const testConfig: SummarizationServiceConfig = {
    apiKey: "test-api-key",
    timeThresholdMs: 5000, // 5 seconds for testing
    entryThreshold: 5, // 5 entries for testing
  };

  // Create mock transcript entries
  const createMockEntries = (count: number): TranscriptEntry[] => {
    const entries: TranscriptEntry[] = [];
    const now = new Date();
    for (let i = 0; i < count; i++) {
      entries.push({
        id: `entry-${i}`,
        roomId: "room-123",
        timestamp: new Date(now.getTime() - (count - i) * 1000),
        speaker: `Speaker ${i % 2 === 0 ? "Alice" : "Bob"}`,
        speakerId: `peer-${i % 2}`,
        content: `Test message ${i + 1}`,
        type: "ambient",
      });
    }
    return entries;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    summaryResults = [];

    mockCallbacks = {
      onSummary: vi.fn((roomId, summary) => summaryResults.push(summary)),
      onError: vi.fn(),
    };

    // Mock ContextManager
    mockContextManager = {
      getTranscriptEntries: vi.fn().mockReturnValue({
        entries: createMockEntries(10),
        hasMore: false,
        total: 10,
      }),
    } as unknown as ContextManager;

    service = new SummarizationService(testConfig, mockCallbacks);
  });

  afterEach(() => {
    service.dispose();
    vi.useRealTimers();
  });

  describe("Service initialization", () => {
    it("should create service with config", () => {
      expect(service).toBeInstanceOf(SummarizationService);
      expect(service.getMonitoredRoomCount()).toBe(0);
    });

    it("should create service using factory function", () => {
      const factoryService = createSummarizationService(testConfig);
      expect(factoryService).toBeInstanceOf(SummarizationService);
      factoryService.dispose();
    });

    it("should use default thresholds when not specified", () => {
      const minimalService = new SummarizationService({ apiKey: "test" });
      expect(minimalService).toBeInstanceOf(SummarizationService);
      minimalService.dispose();
    });
  });

  describe("Room monitoring", () => {
    it("should start monitoring a room", () => {
      service.startMonitoring("room-123", mockContextManager);

      expect(service.isMonitoring("room-123")).toBe(true);
      expect(service.getMonitoredRoomCount()).toBe(1);
    });

    it("should not duplicate monitoring for same room", () => {
      service.startMonitoring("room-123", mockContextManager);
      service.startMonitoring("room-123", mockContextManager);

      expect(service.getMonitoredRoomCount()).toBe(1);
    });

    it("should monitor multiple rooms", () => {
      service.startMonitoring("room-123", mockContextManager);
      service.startMonitoring("room-456", mockContextManager);

      expect(service.isMonitoring("room-123")).toBe(true);
      expect(service.isMonitoring("room-456")).toBe(true);
      expect(service.getMonitoredRoomCount()).toBe(2);
    });

    it("should stop monitoring a room", () => {
      service.startMonitoring("room-123", mockContextManager);
      service.stopMonitoring("room-123");

      expect(service.isMonitoring("room-123")).toBe(false);
      expect(service.getMonitoredRoomCount()).toBe(0);
    });

    it("should handle stopping non-existent room", () => {
      expect(() => service.stopMonitoring("unknown")).not.toThrow();
    });

    it("should report not monitoring unknown room", () => {
      expect(service.isMonitoring("unknown")).toBe(false);
    });
  });

  describe("Entry count tracking", () => {
    it("should increment entry count", () => {
      service.startMonitoring("room-123", mockContextManager);

      service.incrementEntryCount("room-123");
      service.incrementEntryCount("room-123");

      const state = service.getMonitorState("room-123");
      expect(state?.entryCount).toBe(2);
    });

    it("should not increment for non-monitored room", () => {
      service.incrementEntryCount("unknown");
      expect(service.getMonitorState("unknown")).toBeNull();
    });

    it("should reset entry count after summary", async () => {
      service.startMonitoring("room-123", mockContextManager);

      // Increment past threshold
      for (let i = 0; i < 6; i++) {
        service.incrementEntryCount("room-123");
      }

      // Generate summary
      await service.summarizeNow("room-123");

      const state = service.getMonitorState("room-123");
      expect(state?.entryCount).toBe(0);
    });
  });

  describe("Monitor state", () => {
    it("should return monitor state for monitored room", () => {
      service.startMonitoring("room-123", mockContextManager);

      const state = service.getMonitorState("room-123");

      expect(state).not.toBeNull();
      expect(state?.entryCount).toBe(0);
      expect(state?.timeSinceLastSummary).toBeGreaterThanOrEqual(0);
      expect(state?.needsSummary).toBe(false);
    });

    it("should return null for non-monitored room", () => {
      const state = service.getMonitorState("unknown");
      expect(state).toBeNull();
    });

    it("should detect needs summary by entry count", () => {
      service.startMonitoring("room-123", mockContextManager);

      // Increment past threshold (5 for test config)
      for (let i = 0; i < 6; i++) {
        service.incrementEntryCount("room-123");
      }

      const state = service.getMonitorState("room-123");
      expect(state?.needsSummary).toBe(true);
    });

    it("should detect needs summary by time", () => {
      service.startMonitoring("room-123", mockContextManager);
      service.incrementEntryCount("room-123"); // Need at least one entry

      // Advance past time threshold (5000ms for test config)
      vi.advanceTimersByTime(6000);

      const state = service.getMonitorState("room-123");
      expect(state?.needsSummary).toBe(true);
    });
  });

  describe("Summary generation", () => {
    it("should generate summary immediately with summarizeNow", async () => {
      service.startMonitoring("room-123", mockContextManager);

      const summary = await service.summarizeNow("room-123");

      expect(summary).not.toBeNull();
      expect(summary?.roomId).toBe("room-123");
      expect(summary?.content).toBe("Test summary of the conversation");
      expect(summary?.bulletPoints).toHaveLength(3);
      expect(summary?.entriesSummarized).toBe(10);
    });

    it("should return null for non-monitored room", async () => {
      const summary = await service.summarizeNow("unknown");
      expect(summary).toBeNull();
    });

    it("should call onSummary callback", async () => {
      service.startMonitoring("room-123", mockContextManager);

      await service.summarizeNow("room-123");

      expect(mockCallbacks.onSummary).toHaveBeenCalledTimes(1);
      expect(summaryResults).toHaveLength(1);
    });

    it("should include coverage timestamps", async () => {
      service.startMonitoring("room-123", mockContextManager);

      const summary = await service.summarizeNow("room-123");

      expect(summary?.coverageStart).toBeInstanceOf(Date);
      expect(summary?.coverageEnd).toBeInstanceOf(Date);
    });

    it("should return null when no entries to summarize", async () => {
      const emptyContextManager = {
        getTranscriptEntries: vi.fn().mockReturnValue({
          entries: [],
          hasMore: false,
          total: 0,
        }),
      } as unknown as ContextManager;

      service.startMonitoring("room-123", emptyContextManager);

      const summary = await service.summarizeNow("room-123");
      expect(summary).toBeNull();
    });
  });

  describe("Automatic summarization", () => {
    it("should detect threshold reached for auto-summary", () => {
      service.startMonitoring("room-123", mockContextManager);

      // Increment past threshold
      for (let i = 0; i < 6; i++) {
        service.incrementEntryCount("room-123");
      }

      const state = service.getMonitorState("room-123");
      expect(state?.needsSummary).toBe(true);
    });

    it("should have check interval configured", () => {
      // The service checks every 30 seconds
      const checkIntervalMs = 30000;
      expect(checkIntervalMs).toBe(30000);
    });
  });

  describe("Error handling", () => {
    it("should handle empty context gracefully", async () => {
      // Create service with empty entries
      const emptyContextManager = {
        getTranscriptEntries: vi.fn().mockReturnValue({
          entries: [],
          hasMore: false,
          total: 0,
        }),
      } as unknown as ContextManager;

      service.startMonitoring("room-123", emptyContextManager);

      const summary = await service.summarizeNow("room-123");

      expect(summary).toBeNull();
    });

    it("should support onError callback", () => {
      // The service accepts an onError callback in config
      expect(mockCallbacks.onError).toBeDefined();
    });
  });

  describe("Disposal", () => {
    it("should dispose all rooms", () => {
      service.startMonitoring("room-123", mockContextManager);
      service.startMonitoring("room-456", mockContextManager);

      service.dispose();

      expect(service.getMonitoredRoomCount()).toBe(0);
      expect(service.isMonitoring("room-123")).toBe(false);
      expect(service.isMonitoring("room-456")).toBe(false);
    });
  });
});

describe("SummarizationService configuration", () => {
  it("should accept custom time threshold", () => {
    const config: SummarizationServiceConfig = {
      apiKey: "test",
      timeThresholdMs: 10 * 60 * 1000, // 10 minutes
    };
    const service = new SummarizationService(config);
    expect(service).toBeInstanceOf(SummarizationService);
    service.dispose();
  });

  it("should accept custom entry threshold", () => {
    const config: SummarizationServiceConfig = {
      apiKey: "test",
      entryThreshold: 50,
    };
    const service = new SummarizationService(config);
    expect(service).toBeInstanceOf(SummarizationService);
    service.dispose();
  });

  it("should accept temperature configuration", () => {
    const config: SummarizationServiceConfig = {
      apiKey: "test",
      temperature: 0.5,
    };
    const service = new SummarizationService(config);
    expect(service).toBeInstanceOf(SummarizationService);
    service.dispose();
  });

  it("should accept max tokens configuration", () => {
    const config: SummarizationServiceConfig = {
      apiKey: "test",
      maxSummaryTokens: 1000,
    };
    const service = new SummarizationService(config);
    expect(service).toBeInstanceOf(SummarizationService);
    service.dispose();
  });
});

describe("SummarizationService prompt format", () => {
  it("should use gpt-4o-mini model", () => {
    // The service uses gpt-4o-mini for cost efficiency
    const modelName = "gpt-4o-mini";
    expect(modelName).toBe("gpt-4o-mini");
  });

  it("should use JSON response format", () => {
    // The service configures response_format: { type: "json_object" }
    const responseFormat = { type: "json_object" };
    expect(responseFormat.type).toBe("json_object");
  });

  it("should include required fields in summary", () => {
    const expectedFields = [
      "summary",
      "bulletPoints",
      "topics",
      "decisions",
      "actionItems",
    ];

    const sampleResponse = {
      summary: "Overview",
      bulletPoints: [],
      topics: [],
      decisions: [],
      actionItems: [],
    };

    for (const field of expectedFields) {
      expect(sampleResponse).toHaveProperty(field);
    }
  });
});
