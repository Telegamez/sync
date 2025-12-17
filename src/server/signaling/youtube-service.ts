/**
 * YouTube Data API v3 Service
 *
 * Integration with YouTube Data API for video metadata retrieval.
 * Used for video summaries to get title, description, channel, tags, etc.
 *
 * Part of the Long-Horizon Engineering Protocol - FEAT-900
 */

import type {
  YouTubeVideoMetadata,
  YouTubeThumbnail,
  CachedMetadata,
  parseIsoDuration,
  isCacheValid,
  CACHE_TTL,
} from "@/types/video-summary";
import {
  parseIsoDuration as parseIso,
  isCacheValid as checkCache,
  CACHE_TTL as TTL,
} from "@/types/video-summary";

/**
 * YouTube Data API base URL
 */
const YOUTUBE_API_BASE_URL = "https://www.googleapis.com/youtube/v3";

/**
 * Retry configuration
 */
const RETRY_CONFIG = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 10000,
};

/**
 * YouTube API response types (raw API response)
 */
interface YouTubeApiVideoItem {
  id: string;
  snippet: {
    title: string;
    description: string;
    channelTitle: string;
    channelId: string;
    publishedAt: string;
    thumbnails: {
      default?: { url: string; width: number; height: number };
      medium?: { url: string; width: number; height: number };
      high?: { url: string; width: number; height: number };
      maxres?: { url: string; width: number; height: number };
    };
    tags?: string[];
    categoryId: string;
  };
  contentDetails: {
    duration: string;
    caption: string;
    contentRating?: {
      ytRating?: string;
    };
  };
  statistics: {
    viewCount: string;
    likeCount: string;
    commentCount?: string;
  };
}

interface YouTubeApiResponse {
  items: YouTubeApiVideoItem[];
  pageInfo: {
    totalResults: number;
    resultsPerPage: number;
  };
}

/**
 * YouTube service configuration
 */
export interface YouTubeServiceConfig {
  /** YouTube Data API key */
  apiKey: string;
  /** Cache TTL in milliseconds (default: 15 minutes) */
  cacheTtl?: number;
  /** Enable caching (default: true) */
  enableCache?: boolean;
}

/**
 * YouTube service callbacks
 */
export interface YouTubeServiceCallbacks {
  /** Called when metadata fetch starts */
  onFetchStart?: (videoId: string) => void;
  /** Called when metadata fetch completes */
  onFetchComplete?: (videoId: string, metadata: YouTubeVideoMetadata) => void;
  /** Called on fetch error */
  onFetchError?: (videoId: string, error: string) => void;
  /** Called on cache hit */
  onCacheHit?: (videoId: string) => void;
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Calculate exponential backoff delay
 */
function getBackoffDelay(attempt: number): number {
  const delay = RETRY_CONFIG.baseDelayMs * Math.pow(2, attempt);
  const jitter = Math.random() * 1000;
  return Math.min(delay + jitter, RETRY_CONFIG.maxDelayMs);
}

/**
 * YouTube Data API Service
 *
 * Provides video metadata retrieval via YouTube Data API v3.
 */
export class YouTubeService {
  private apiKey: string;
  private cacheTtl: number;
  private enableCache: boolean;
  private callbacks: YouTubeServiceCallbacks;
  private cache: Map<string, CachedMetadata>;

  constructor(
    config: YouTubeServiceConfig,
    callbacks: YouTubeServiceCallbacks = {},
  ) {
    if (!config.apiKey) {
      throw new Error("YouTube API key is required");
    }
    this.apiKey = config.apiKey;
    this.cacheTtl = config.cacheTtl ?? TTL.METADATA;
    this.enableCache = config.enableCache ?? true;
    this.callbacks = callbacks;
    this.cache = new Map();
  }

  /**
   * Get video metadata by ID
   *
   * @param videoId - YouTube video ID (11 characters)
   * @returns Video metadata or null if not found
   */
  async getVideoMetadata(
    videoId: string,
  ): Promise<YouTubeVideoMetadata | null> {
    // Validate video ID format
    if (!this.isValidVideoId(videoId)) {
      console.error(`[YouTube] Invalid video ID format: ${videoId}`);
      return null;
    }

    // Check cache first
    if (this.enableCache) {
      const cached = this.cache.get(videoId);
      if (cached && checkCache(cached.cachedAt, cached.ttl)) {
        console.log(`[YouTube] Cache hit for video: ${videoId}`);
        this.callbacks.onCacheHit?.(videoId);
        return cached.data;
      }
    }

    console.log(`[YouTube] Fetching metadata for video: ${videoId}`);
    this.callbacks.onFetchStart?.(videoId);

    try {
      const response = await this.makeRequest(videoId);

      if (!response.items || response.items.length === 0) {
        console.log(`[YouTube] Video not found: ${videoId}`);
        return null;
      }

      const item = response.items[0];
      const metadata = this.parseVideoItem(item);

      // Cache the result
      if (this.enableCache) {
        this.cache.set(videoId, {
          data: metadata,
          cachedAt: Date.now(),
          ttl: this.cacheTtl,
        });
      }

      console.log(`[YouTube] Metadata fetched: "${metadata.title}"`);
      this.callbacks.onFetchComplete?.(videoId, metadata);

      return metadata;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error(`[YouTube] Failed to fetch metadata: ${errorMessage}`);
      this.callbacks.onFetchError?.(videoId, errorMessage);
      throw error;
    }
  }

  /**
   * Get multiple videos' metadata in a single API call
   *
   * @param videoIds - Array of YouTube video IDs
   * @returns Map of video ID to metadata
   */
  async getMultipleVideosMetadata(
    videoIds: string[],
  ): Promise<Map<string, YouTubeVideoMetadata>> {
    const results = new Map<string, YouTubeVideoMetadata>();
    const uncachedIds: string[] = [];

    // Check cache for each video
    for (const videoId of videoIds) {
      if (!this.isValidVideoId(videoId)) continue;

      if (this.enableCache) {
        const cached = this.cache.get(videoId);
        if (cached && checkCache(cached.cachedAt, cached.ttl)) {
          results.set(videoId, cached.data);
          this.callbacks.onCacheHit?.(videoId);
          continue;
        }
      }
      uncachedIds.push(videoId);
    }

    // Fetch uncached videos (YouTube API supports up to 50 IDs per request)
    if (uncachedIds.length > 0) {
      const batchSize = 50;
      for (let i = 0; i < uncachedIds.length; i += batchSize) {
        const batch = uncachedIds.slice(i, i + batchSize);
        const response = await this.makeRequest(batch.join(","));

        for (const item of response.items || []) {
          const metadata = this.parseVideoItem(item);
          results.set(item.id, metadata);

          if (this.enableCache) {
            this.cache.set(item.id, {
              data: metadata,
              cachedAt: Date.now(),
              ttl: this.cacheTtl,
            });
          }

          this.callbacks.onFetchComplete?.(item.id, metadata);
        }
      }
    }

    return results;
  }

  /**
   * Clear cached metadata for a video
   */
  clearCache(videoId?: string): void {
    if (videoId) {
      this.cache.delete(videoId);
    } else {
      this.cache.clear();
    }
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; validEntries: number } {
    let validEntries = 0;
    for (const entry of this.cache.values()) {
      if (checkCache(entry.cachedAt, entry.ttl)) {
        validEntries++;
      }
    }
    return { size: this.cache.size, validEntries };
  }

  /**
   * Clean up expired cache entries
   */
  pruneCache(): number {
    let removed = 0;
    for (const [key, entry] of this.cache.entries()) {
      if (!checkCache(entry.cachedAt, entry.ttl)) {
        this.cache.delete(key);
        removed++;
      }
    }
    return removed;
  }

  /**
   * Validate YouTube video ID format
   */
  private isValidVideoId(videoId: string): boolean {
    // YouTube video IDs are 11 characters, alphanumeric with - and _
    return /^[a-zA-Z0-9_-]{11}$/.test(videoId);
  }

  /**
   * Parse raw API response item to our metadata type
   */
  private parseVideoItem(item: YouTubeApiVideoItem): YouTubeVideoMetadata {
    const { snippet, contentDetails, statistics } = item;

    return {
      videoId: item.id,
      title: snippet.title,
      description: snippet.description,
      channelTitle: snippet.channelTitle,
      channelId: snippet.channelId,
      publishedAt: snippet.publishedAt,
      thumbnails: {
        default: snippet.thumbnails.default as YouTubeThumbnail | undefined,
        medium: snippet.thumbnails.medium as YouTubeThumbnail | undefined,
        high: snippet.thumbnails.high as YouTubeThumbnail | undefined,
        maxres: snippet.thumbnails.maxres as YouTubeThumbnail | undefined,
      },
      tags: snippet.tags || [],
      categoryId: snippet.categoryId,
      duration: contentDetails.duration,
      durationSeconds: parseIso(contentDetails.duration),
      viewCount: parseInt(statistics.viewCount || "0", 10),
      likeCount: parseInt(statistics.likeCount || "0", 10),
      hasCaption: contentDetails.caption === "true",
      contentRating: contentDetails.contentRating?.ytRating,
    };
  }

  /**
   * Make HTTP request to YouTube Data API with retry logic
   */
  private async makeRequest(videoIds: string): Promise<YouTubeApiResponse> {
    const url = new URL(`${YOUTUBE_API_BASE_URL}/videos`);
    url.searchParams.set("part", "snippet,contentDetails,statistics");
    url.searchParams.set("id", videoIds);
    url.searchParams.set("key", this.apiKey);

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= RETRY_CONFIG.maxRetries; attempt++) {
      try {
        const response = await fetch(url.toString(), {
          method: "GET",
          headers: {
            Accept: "application/json",
          },
        });

        // Handle rate limiting
        if (response.status === 429) {
          const retryAfter = response.headers.get("Retry-After");
          const delay = retryAfter
            ? parseInt(retryAfter) * 1000
            : getBackoffDelay(attempt);
          console.log(
            `[YouTube] Rate limited, retrying in ${delay}ms (attempt ${attempt + 1})`,
          );
          await sleep(delay);
          continue;
        }

        // Handle quota exceeded
        if (response.status === 403) {
          const errorData = await response.json();
          if (errorData.error?.errors?.[0]?.reason === "quotaExceeded") {
            throw new Error("YouTube API quota exceeded for today");
          }
          throw new Error(
            `YouTube API forbidden: ${JSON.stringify(errorData)}`,
          );
        }

        // Handle server errors with retry
        if (response.status >= 500) {
          const delay = getBackoffDelay(attempt);
          console.log(
            `[YouTube] Server error ${response.status}, retrying in ${delay}ms (attempt ${attempt + 1})`,
          );
          await sleep(delay);
          continue;
        }

        // Handle client errors (no retry)
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`YouTube API error ${response.status}: ${errorText}`);
        }

        // Parse and return response
        const data = await response.json();
        return data as YouTubeApiResponse;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Don't retry quota/auth errors
        if (
          lastError.message.includes("quota") ||
          lastError.message.includes("forbidden")
        ) {
          throw lastError;
        }

        // Network errors - retry with backoff
        if (attempt < RETRY_CONFIG.maxRetries) {
          const delay = getBackoffDelay(attempt);
          console.log(
            `[YouTube] Request failed, retrying in ${delay}ms (attempt ${attempt + 1}): ${lastError.message}`,
          );
          await sleep(delay);
        }
      }
    }

    throw lastError || new Error("Max retries exceeded");
  }

  /**
   * Format metadata for AI voice response
   * Returns a concise summary suitable for the AI to speak
   */
  formatForAI(metadata: YouTubeVideoMetadata): string {
    const parts: string[] = [];

    // Title and creator
    parts.push(`"${metadata.title}" by ${metadata.channelTitle}.`);

    // Duration
    const minutes = Math.floor(metadata.durationSeconds / 60);
    const seconds = metadata.durationSeconds % 60;
    if (minutes > 0) {
      parts.push(
        `It's ${minutes} minute${minutes !== 1 ? "s" : ""}${seconds > 0 ? ` and ${seconds} seconds` : ""} long.`,
      );
    } else {
      parts.push(`It's ${seconds} seconds long.`);
    }

    // View count (human readable)
    const views = metadata.viewCount;
    let viewStr: string;
    if (views >= 1_000_000_000) {
      viewStr = `${(views / 1_000_000_000).toFixed(1)} billion`;
    } else if (views >= 1_000_000) {
      viewStr = `${(views / 1_000_000).toFixed(1)} million`;
    } else if (views >= 1_000) {
      viewStr = `${(views / 1_000).toFixed(0)} thousand`;
    } else {
      viewStr = views.toString();
    }
    parts.push(`${viewStr} views.`);

    // Tags (first 3)
    if (metadata.tags.length > 0) {
      const topTags = metadata.tags.slice(0, 3).join(", ");
      parts.push(`Topics: ${topTags}.`);
    }

    return parts.join(" ");
  }
}

/**
 * Create YouTube service instance from environment
 */
export function createYouTubeService(
  callbacks?: YouTubeServiceCallbacks,
): YouTubeService {
  const apiKey = process.env.YOUTUBE_API_KEY;

  if (!apiKey) {
    throw new Error(
      "YOUTUBE_API_KEY environment variable is required for video summaries",
    );
  }

  return new YouTubeService({ apiKey }, callbacks);
}

/**
 * Create YouTube service instance with explicit config
 */
export function createYouTubeServiceWithConfig(
  config: YouTubeServiceConfig,
  callbacks?: YouTubeServiceCallbacks,
): YouTubeService {
  return new YouTubeService(config, callbacks);
}

export default YouTubeService;
