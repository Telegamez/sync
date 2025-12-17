/**
 * YouTube Service Tests
 *
 * Tests for YouTube Data API v3 service.
 * Part of the Long-Horizon Engineering Protocol - FEAT-900
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  YouTubeService,
  createYouTubeService,
  createYouTubeServiceWithConfig,
  type YouTubeServiceConfig,
  type YouTubeServiceCallbacks,
} from "@/server/signaling/youtube-service";
import type { YouTubeVideoMetadata } from "@/types/video-summary";

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock console methods
const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

// Sample YouTube API response
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
          medium: {
            url: "https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg",
            width: 320,
            height: 180,
          },
          high: {
            url: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
            width: 480,
            height: 360,
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
        commentCount: "3000000",
      },
    },
  ],
  pageInfo: {
    totalResults: 1,
    resultsPerPage: 1,
  },
};

describe("YouTubeService", () => {
  const testConfig: YouTubeServiceConfig = {
    apiKey: "test-api-key",
    enableCache: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("constructor", () => {
    it("should create service with valid config", () => {
      const service = new YouTubeService(testConfig);
      expect(service).toBeInstanceOf(YouTubeService);
    });

    it("should throw error without API key", () => {
      expect(() => new YouTubeService({ apiKey: "" })).toThrow(
        "YouTube API key is required",
      );
    });

    it("should use default cache settings", () => {
      const service = new YouTubeService({ apiKey: "test-key" });
      const stats = service.getCacheStats();
      expect(stats.size).toBe(0);
    });
  });

  describe("getVideoMetadata", () => {
    it("should fetch and return video metadata", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockYouTubeApiResponse,
      });

      const service = new YouTubeService(testConfig);
      const metadata = await service.getVideoMetadata("dQw4w9WgXcQ");

      expect(metadata).not.toBeNull();
      expect(metadata?.videoId).toBe("dQw4w9WgXcQ");
      expect(metadata?.title).toBe("Rick Astley - Never Gonna Give You Up");
      expect(metadata?.channelTitle).toBe("Rick Astley");
      expect(metadata?.durationSeconds).toBe(213); // 3*60 + 33
      expect(metadata?.hasCaption).toBe(true);
      expect(metadata?.viewCount).toBe(1400000000);
      expect(metadata?.tags).toContain("Rick Astley");
    });

    it("should return null for invalid video ID format", async () => {
      const service = new YouTubeService(testConfig);

      // Too short
      const result1 = await service.getVideoMetadata("abc");
      expect(result1).toBeNull();

      // Too long
      const result2 = await service.getVideoMetadata("abcdefghijklmnop");
      expect(result2).toBeNull();

      // Invalid characters
      const result3 = await service.getVideoMetadata("abc!@#$%^&*()");
      expect(result3).toBeNull();
    });

    it("should return null for non-existent video", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ items: [], pageInfo: { totalResults: 0 } }),
      });

      const service = new YouTubeService(testConfig);
      const metadata = await service.getVideoMetadata("xxxxxxxxxxx");

      expect(metadata).toBeNull();
    });

    it("should use cache on subsequent requests", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockYouTubeApiResponse,
      });

      const onCacheHit = vi.fn();
      const service = new YouTubeService(testConfig, { onCacheHit });

      // First request - should fetch
      await service.getVideoMetadata("dQw4w9WgXcQ");
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Second request - should use cache
      await service.getVideoMetadata("dQw4w9WgXcQ");
      expect(mockFetch).toHaveBeenCalledTimes(1); // Still 1
      expect(onCacheHit).toHaveBeenCalledWith("dQw4w9WgXcQ");
    });

    it("should bypass cache when disabled", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockYouTubeApiResponse,
      });

      const service = new YouTubeService({ ...testConfig, enableCache: false });

      await service.getVideoMetadata("dQw4w9WgXcQ");
      await service.getVideoMetadata("dQw4w9WgXcQ");

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("should call callbacks on fetch", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockYouTubeApiResponse,
      });

      const onFetchStart = vi.fn();
      const onFetchComplete = vi.fn();
      const service = new YouTubeService(testConfig, {
        onFetchStart,
        onFetchComplete,
      });

      await service.getVideoMetadata("dQw4w9WgXcQ");

      expect(onFetchStart).toHaveBeenCalledWith("dQw4w9WgXcQ");
      expect(onFetchComplete).toHaveBeenCalledWith(
        "dQw4w9WgXcQ",
        expect.objectContaining({ videoId: "dQw4w9WgXcQ" }),
      );
    });

    it("should call onFetchError on failure", async () => {
      // Mock all retries to fail immediately
      mockFetch.mockRejectedValue(new Error("Network error"));

      const onFetchError = vi.fn();
      const service = new YouTubeService(testConfig, { onFetchError });

      await expect(service.getVideoMetadata("dQw4w9WgXcQ")).rejects.toThrow();
      expect(onFetchError).toHaveBeenCalledWith(
        "dQw4w9WgXcQ",
        expect.stringContaining("Network error"),
      );
    }, 15000); // Increase timeout for retry logic
  });

  describe("getMultipleVideosMetadata", () => {
    it("should fetch multiple videos in batch", async () => {
      const multiResponse = {
        items: [
          mockYouTubeApiResponse.items[0],
          { ...mockYouTubeApiResponse.items[0], id: "abc123def45" },
        ],
        pageInfo: { totalResults: 2 },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => multiResponse,
      });

      const service = new YouTubeService(testConfig);
      const results = await service.getMultipleVideosMetadata([
        "dQw4w9WgXcQ",
        "abc123def45",
      ]);

      expect(results.size).toBe(2);
      expect(results.has("dQw4w9WgXcQ")).toBe(true);
      expect(results.has("abc123def45")).toBe(true);
    });

    it("should use cached entries when available", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockYouTubeApiResponse,
      });

      const service = new YouTubeService(testConfig);

      // Prime the cache
      await service.getVideoMetadata("dQw4w9WgXcQ");

      // Fetch multiple including cached
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          items: [{ ...mockYouTubeApiResponse.items[0], id: "abc123def45" }],
        }),
      });

      const results = await service.getMultipleVideosMetadata([
        "dQw4w9WgXcQ",
        "abc123def45",
      ]);

      expect(results.size).toBe(2);
      // Second fetch should only request the uncached video
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe("cache management", () => {
    it("should clear specific video from cache", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockYouTubeApiResponse,
      });

      const service = new YouTubeService(testConfig);
      await service.getVideoMetadata("dQw4w9WgXcQ");

      expect(service.getCacheStats().size).toBe(1);

      service.clearCache("dQw4w9WgXcQ");
      expect(service.getCacheStats().size).toBe(0);
    });

    it("should clear entire cache", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockYouTubeApiResponse,
      });

      const service = new YouTubeService(testConfig);
      await service.getVideoMetadata("dQw4w9WgXcQ");

      service.clearCache();
      expect(service.getCacheStats().size).toBe(0);
    });

    it("should report cache stats correctly", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockYouTubeApiResponse,
      });

      const service = new YouTubeService(testConfig);
      await service.getVideoMetadata("dQw4w9WgXcQ");

      const stats = service.getCacheStats();
      expect(stats.size).toBe(1);
      expect(stats.validEntries).toBe(1);
    });

    it("should prune expired entries", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockYouTubeApiResponse,
      });

      // Use very short TTL for testing
      const service = new YouTubeService({ ...testConfig, cacheTtl: 1 });
      await service.getVideoMetadata("dQw4w9WgXcQ");

      // Wait for cache to expire
      await new Promise((resolve) => setTimeout(resolve, 10));

      const removed = service.pruneCache();
      expect(removed).toBe(1);
      expect(service.getCacheStats().size).toBe(0);
    });
  });

  describe("error handling", () => {
    it("should handle rate limiting with retry", async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          headers: new Map([["Retry-After", "1"]]),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => mockYouTubeApiResponse,
        });

      const service = new YouTubeService(testConfig);
      const metadata = await service.getVideoMetadata("dQw4w9WgXcQ");

      expect(metadata).not.toBeNull();
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("should throw on quota exceeded", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: async () => ({
          error: {
            errors: [{ reason: "quotaExceeded" }],
          },
        }),
      });

      const service = new YouTubeService(testConfig);
      await expect(service.getVideoMetadata("dQw4w9WgXcQ")).rejects.toThrow(
        "quota exceeded",
      );
    });

    it("should retry on server errors", async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => mockYouTubeApiResponse,
        });

      const service = new YouTubeService(testConfig);
      const metadata = await service.getVideoMetadata("dQw4w9WgXcQ");

      expect(metadata).not.toBeNull();
    });
  });

  describe("formatForAI", () => {
    it("should format metadata for voice response", () => {
      const metadata: YouTubeVideoMetadata = {
        videoId: "dQw4w9WgXcQ",
        title: "Never Gonna Give You Up",
        description: "Music video",
        channelTitle: "Rick Astley",
        channelId: "channel123",
        publishedAt: "2009-10-25",
        thumbnails: {},
        tags: ["Music", "80s", "Pop"],
        categoryId: "10",
        duration: "PT3M33S",
        durationSeconds: 213,
        viewCount: 1400000000,
        likeCount: 15000000,
        hasCaption: true,
      };

      const service = new YouTubeService(testConfig);
      const formatted = service.formatForAI(metadata);

      expect(formatted).toContain("Never Gonna Give You Up");
      expect(formatted).toContain("Rick Astley");
      expect(formatted).toContain("3 minutes");
      expect(formatted).toContain("1.4 billion views");
      expect(formatted).toContain("Music");
    });

    it("should handle videos with millions of views", () => {
      const metadata: YouTubeVideoMetadata = {
        videoId: "test123test",
        title: "Test Video",
        description: "",
        channelTitle: "Test Channel",
        channelId: "ch123",
        publishedAt: "2024-01-01",
        thumbnails: {},
        tags: [],
        categoryId: "22",
        duration: "PT1M",
        durationSeconds: 60,
        viewCount: 5500000,
        likeCount: 100000,
        hasCaption: false,
      };

      const service = new YouTubeService(testConfig);
      const formatted = service.formatForAI(metadata);

      expect(formatted).toContain("5.5 million views");
    });

    it("should handle short videos in seconds", () => {
      const metadata: YouTubeVideoMetadata = {
        videoId: "test123test",
        title: "Short Video",
        description: "",
        channelTitle: "Channel",
        channelId: "ch123",
        publishedAt: "2024-01-01",
        thumbnails: {},
        tags: [],
        categoryId: "22",
        duration: "PT30S",
        durationSeconds: 30,
        viewCount: 1000,
        likeCount: 100,
        hasCaption: false,
      };

      const service = new YouTubeService(testConfig);
      const formatted = service.formatForAI(metadata);

      expect(formatted).toContain("30 seconds");
    });
  });
});

describe("createYouTubeService", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("should create service from environment variable", () => {
    process.env.YOUTUBE_API_KEY = "env-api-key";
    const service = createYouTubeService();
    expect(service).toBeInstanceOf(YouTubeService);
  });

  it("should throw if YOUTUBE_API_KEY is not set", () => {
    delete process.env.YOUTUBE_API_KEY;
    expect(() => createYouTubeService()).toThrow("YOUTUBE_API_KEY");
  });
});

describe("createYouTubeServiceWithConfig", () => {
  it("should create service with explicit config", () => {
    const service = createYouTubeServiceWithConfig({
      apiKey: "explicit-key",
      cacheTtl: 60000,
    });
    expect(service).toBeInstanceOf(YouTubeService);
  });
});
