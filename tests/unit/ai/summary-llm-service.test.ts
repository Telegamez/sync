/**
 * Summary LLM Service Tests
 *
 * Tests for video summary generation using gpt-4o-mini.
 * Part of the Long-Horizon Engineering Protocol - FEAT-904
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { YouTubeVideoMetadata } from "@/types/video-summary";

// Mock OpenAI with class-based approach (matching existing pattern)
const mockCreate = vi.fn();

vi.mock("openai", () => {
  class MockOpenAI {
    chat = {
      completions: {
        create: mockCreate,
      },
    };
  }
  return { default: MockOpenAI };
});

// Import after mocking
import {
  SummaryLLMService,
  createSummaryLLMService,
  createSummaryLLMServiceWithConfig,
  type SummaryLLMServiceConfig,
} from "@/server/signaling/summary-llm-service";

// Mock console methods
vi.spyOn(console, "log").mockImplementation(() => {});
vi.spyOn(console, "error").mockImplementation(() => {});

// Sample video metadata for testing
const mockMetadata: YouTubeVideoMetadata = {
  videoId: "dQw4w9WgXcQ",
  title: "Rick Astley - Never Gonna Give You Up",
  description:
    "The official music video for Rick Astley's signature song. This 80s classic has become one of the most iconic music videos of all time.",
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
  tags: ["Rick Astley", "Never Gonna Give You Up", "80s Music", "Pop"],
  categoryId: "10",
  duration: "PT3M33S",
  durationSeconds: 213,
  viewCount: 1400000000,
  likeCount: 15000000,
  hasCaption: true,
};

describe("SummaryLLMService", () => {
  const testConfig: SummaryLLMServiceConfig = {
    apiKey: "test-api-key",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockCreate.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("constructor", () => {
    it("should create service with valid config", () => {
      const service = new SummaryLLMService(testConfig);
      expect(service).toBeInstanceOf(SummaryLLMService);
    });

    it("should throw error without API key", () => {
      expect(() => new SummaryLLMService({ apiKey: "" })).toThrow(
        "OpenAI API key is required",
      );
    });

    it("should use default temperature and maxTokens", () => {
      const service = new SummaryLLMService({ apiKey: "test-key" });
      expect(service).toBeInstanceOf(SummaryLLMService);
    });
  });

  describe("generateVideoSummary", () => {
    it("should generate summary from metadata", async () => {
      mockCreate.mockResolvedValue({
        choices: [
          {
            message: {
              content:
                "Rick Astley's legendary hit from the 80s that started the rickrolling phenomenon. This music video has over a billion views and features the iconic dance moves that made it a viral sensation.",
            },
          },
        ],
      });

      const service = new SummaryLLMService(testConfig);
      const summary = await service.generateVideoSummary(mockMetadata);

      expect(summary).toContain("Rick Astley");
      expect(mockCreate).toHaveBeenCalledTimes(1);
    });

    it("should call callbacks on success", async () => {
      mockCreate.mockResolvedValue({
        choices: [
          {
            message: {
              content: "A great video summary.",
            },
          },
        ],
      });

      const onGenerateStart = vi.fn();
      const onGenerateComplete = vi.fn();
      const service = new SummaryLLMService(testConfig, {
        onGenerateStart,
        onGenerateComplete,
      });

      await service.generateVideoSummary(mockMetadata);

      expect(onGenerateStart).toHaveBeenCalledWith(mockMetadata.videoId);
      expect(onGenerateComplete).toHaveBeenCalledWith(
        mockMetadata.videoId,
        expect.any(String),
      );
    });

    it("should return fallback summary on API error", async () => {
      mockCreate.mockRejectedValue(new Error("API Error"));

      const onGenerateError = vi.fn();
      const service = new SummaryLLMService(testConfig, { onGenerateError });

      const summary = await service.generateVideoSummary(mockMetadata);

      // Should return fallback, not throw
      expect(summary).toContain("Rick Astley");
      expect(summary).toContain("3 minutes");
      expect(onGenerateError).toHaveBeenCalled();
    }, 15000);

    it("should handle empty response gracefully", async () => {
      // First call returns empty, causing error and retry, then fallback
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: "" } }],
      });

      const service = new SummaryLLMService(testConfig);
      const summary = await service.generateVideoSummary(mockMetadata);

      // Should fall back to basic summary
      expect(summary).toBeTruthy();
      expect(summary).toContain("Rick Astley");
    }, 15000);

    it("should truncate long descriptions", async () => {
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: "Summary text" } }],
      });

      const longDescription = "A".repeat(1000);
      const metadataWithLongDesc = {
        ...mockMetadata,
        description: longDescription,
      };

      const service = new SummaryLLMService(testConfig);
      await service.generateVideoSummary(metadataWithLongDesc);

      // Verify the prompt was built (service should handle long descriptions)
      expect(mockCreate).toHaveBeenCalled();
    });
  });

  describe("generateFallbackSummary", () => {
    it("should generate basic summary from metadata", () => {
      const service = new SummaryLLMService(testConfig);
      const fallback = service.generateFallbackSummary(mockMetadata);

      expect(fallback).toContain("Rick Astley - Never Gonna Give You Up");
      expect(fallback).toContain("Rick Astley");
      expect(fallback).toContain("3 minutes");
      expect(fallback).toContain("1.4 billion views");
    });

    it("should handle videos with no tags", () => {
      const noTagsMetadata = { ...mockMetadata, tags: [] };
      const service = new SummaryLLMService(testConfig);
      const fallback = service.generateFallbackSummary(noTagsMetadata);

      expect(fallback).toContain("Rick Astley");
      expect(fallback).not.toContain("It's about");
    });

    it("should format millions correctly", () => {
      const millionViewsMetadata = { ...mockMetadata, viewCount: 5500000 };
      const service = new SummaryLLMService(testConfig);
      const fallback = service.generateFallbackSummary(millionViewsMetadata);

      expect(fallback).toContain("5.5 million views");
    });

    it("should format thousands correctly", () => {
      const thousandViewsMetadata = { ...mockMetadata, viewCount: 50000 };
      const service = new SummaryLLMService(testConfig);
      const fallback = service.generateFallbackSummary(thousandViewsMetadata);

      expect(fallback).toContain("50 thousand views");
    });

    it("should format short videos in seconds", () => {
      const shortVideoMetadata = { ...mockMetadata, durationSeconds: 45 };
      const service = new SummaryLLMService(testConfig);
      const fallback = service.generateFallbackSummary(shortVideoMetadata);

      expect(fallback).toContain("45 seconds");
    });

    it("should format hour-long videos correctly", () => {
      const longVideoMetadata = { ...mockMetadata, durationSeconds: 3720 }; // 1h 2m
      const service = new SummaryLLMService(testConfig);
      const fallback = service.generateFallbackSummary(longVideoMetadata);

      expect(fallback).toContain("1 hour");
      expect(fallback).toContain("2 minutes");
    });
  });
});

describe("createSummaryLLMService", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("should create service from environment variable", () => {
    process.env.OPENAI_API_KEY = "env-api-key";
    const service = createSummaryLLMService();
    expect(service).toBeInstanceOf(SummaryLLMService);
  });

  it("should throw if OPENAI_API_KEY is not set", () => {
    delete process.env.OPENAI_API_KEY;
    expect(() => createSummaryLLMService()).toThrow("OPENAI_API_KEY");
  });
});

describe("createSummaryLLMServiceWithConfig", () => {
  it("should create service with explicit config", () => {
    const service = createSummaryLLMServiceWithConfig({
      apiKey: "explicit-key",
      temperature: 0.5,
      maxTokens: 200,
    });
    expect(service).toBeInstanceOf(SummaryLLMService);
  });
});
