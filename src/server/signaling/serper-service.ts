/**
 * Serper API Service
 *
 * Integration with Serper.dev for web, image, and video search.
 * Used by OpenAI function calling to provide real-time search results.
 *
 * Part of the Long-Horizon Engineering Protocol - FEAT-601
 */

import type {
  SearchId,
  SearchType,
  SearchResults,
  SerperWebResult,
  SerperImageResult,
  SerperVideoResult,
  SerperTopStory,
  SerperWebResponse,
  SerperImageResponse,
  SerperVideoResponse,
  SerperRequestConfig,
} from "@/types/search";
import type { RoomId } from "@/types/room";

/**
 * Serper API base URL
 */
const SERPER_BASE_URL = "https://google.serper.dev";

/**
 * Default request configuration
 */
const DEFAULT_CONFIG: Partial<SerperRequestConfig> = {
  location: "United States",
  gl: "us",
  hl: "en",
  num: 10,
};

/**
 * Retry configuration
 */
const RETRY_CONFIG = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 10000,
};

/**
 * Serper service configuration
 */
export interface SerperServiceConfig {
  /** Serper API key */
  apiKey: string;
  /** Default location for searches */
  location?: string;
  /** Country code */
  gl?: string;
  /** Language code */
  hl?: string;
  /** Default number of results */
  defaultNumResults?: number;
}

/**
 * Serper service callbacks
 */
export interface SerperServiceCallbacks {
  /** Called when search starts */
  onSearchStart?: (
    roomId: RoomId,
    query: string,
    searchType: SearchType,
  ) => void;
  /** Called when search completes */
  onSearchComplete?: (roomId: RoomId, results: SearchResults) => void;
  /** Called on search error */
  onSearchError?: (roomId: RoomId, query: string, error: string) => void;
}

/**
 * Generate unique search ID
 */
function generateSearchId(): SearchId {
  return `search_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
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
 * Serper API Service
 *
 * Provides web, image, and video search via Serper.dev API.
 */
export class SerperService {
  private apiKey: string;
  private defaultConfig: SerperRequestConfig;
  private callbacks: SerperServiceCallbacks;

  constructor(
    config: SerperServiceConfig,
    callbacks: SerperServiceCallbacks = {},
  ) {
    this.apiKey = config.apiKey;
    this.defaultConfig = {
      q: "",
      location: config.location || DEFAULT_CONFIG.location,
      gl: config.gl || DEFAULT_CONFIG.gl,
      hl: config.hl || DEFAULT_CONFIG.hl,
      num: config.defaultNumResults || DEFAULT_CONFIG.num,
    };
    this.callbacks = callbacks;
  }

  /**
   * Search web results
   */
  async searchWeb(
    query: string,
    options: Partial<SerperRequestConfig> = {},
  ): Promise<SerperWebResponse> {
    const config: SerperRequestConfig = {
      ...this.defaultConfig,
      ...options,
      q: query,
    };

    return this.makeRequest<SerperWebResponse>("/search", config);
  }

  /**
   * Search image results
   */
  async searchImages(
    query: string,
    options: Partial<SerperRequestConfig> = {},
  ): Promise<SerperImageResponse> {
    const config: SerperRequestConfig = {
      ...this.defaultConfig,
      ...options,
      q: query,
    };

    return this.makeRequest<SerperImageResponse>("/images", config);
  }

  /**
   * Search video results
   */
  async searchVideos(
    query: string,
    options: Partial<SerperRequestConfig> = {},
  ): Promise<SerperVideoResponse> {
    const config: SerperRequestConfig = {
      ...this.defaultConfig,
      ...options,
      q: query,
    };

    return this.makeRequest<SerperVideoResponse>("/videos", config);
  }

  /**
   * Search all types in parallel
   */
  async searchAll(
    roomId: RoomId,
    query: string,
    searchType: SearchType = "all",
    options: Partial<SerperRequestConfig> = {},
  ): Promise<SearchResults> {
    const searchId = generateSearchId();
    const timestamp = new Date();

    console.log(
      `[Serper] Starting search: "${query}" (type: ${searchType}, room: ${roomId})`,
    );
    this.callbacks.onSearchStart?.(roomId, query, searchType);

    try {
      let webResults: SerperWebResult[] = [];
      let imageResults: SerperImageResult[] = [];
      let videoResults: SerperVideoResult[] = [];
      let topStories: SerperTopStory[] = [];
      let relatedSearches: string[] = [];
      let totalCredits = 0;

      // Determine which searches to run
      const shouldSearchWeb = searchType === "all" || searchType === "web";
      const shouldSearchImages =
        searchType === "all" || searchType === "images";
      const shouldSearchVideos =
        searchType === "all" || searchType === "videos";

      // Run searches in parallel
      const promises: Promise<void>[] = [];

      if (shouldSearchWeb) {
        promises.push(
          this.searchWeb(query, options).then((response) => {
            webResults = response.organic || [];
            topStories = response.topStories || [];
            relatedSearches =
              response.relatedSearches?.map((r) => r.query) || [];
            totalCredits += response.credits || 1;
          }),
        );
      }

      if (shouldSearchImages) {
        promises.push(
          this.searchImages(query, options).then((response) => {
            imageResults = response.images || [];
            totalCredits += response.credits || 1;
          }),
        );
      }

      if (shouldSearchVideos) {
        promises.push(
          this.searchVideos(query, options).then((response) => {
            videoResults = response.videos || [];
            totalCredits += response.credits || 1;
          }),
        );
      }

      // Wait for all searches
      await Promise.all(promises);

      const results: SearchResults = {
        id: searchId,
        query,
        searchType,
        timestamp,
        roomId,
        web: webResults,
        images: imageResults,
        videos: videoResults,
        topStories: topStories.length > 0 ? topStories : undefined,
        relatedSearches:
          relatedSearches.length > 0 ? relatedSearches : undefined,
        creditsUsed: totalCredits,
      };

      console.log(
        `[Serper] Search complete: ${webResults.length} web, ${imageResults.length} images, ${videoResults.length} videos`,
      );
      this.callbacks.onSearchComplete?.(roomId, results);

      return results;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown search error";
      console.error(`[Serper] Search failed: ${errorMessage}`);
      this.callbacks.onSearchError?.(roomId, query, errorMessage);
      throw error;
    }
  }

  /**
   * Make HTTP request to Serper API with retry logic
   */
  private async makeRequest<T>(
    endpoint: string,
    config: SerperRequestConfig,
  ): Promise<T> {
    const url = `${SERPER_BASE_URL}${endpoint}`;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= RETRY_CONFIG.maxRetries; attempt++) {
      try {
        const response = await fetch(url, {
          method: "POST",
          headers: {
            "X-API-KEY": this.apiKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(config),
        });

        // Handle rate limiting
        if (response.status === 429) {
          const retryAfter = response.headers.get("Retry-After");
          const delay = retryAfter
            ? parseInt(retryAfter) * 1000
            : getBackoffDelay(attempt);
          console.log(
            `[Serper] Rate limited, retrying in ${delay}ms (attempt ${attempt + 1})`,
          );
          await sleep(delay);
          continue;
        }

        // Handle server errors with retry
        if (response.status >= 500) {
          const delay = getBackoffDelay(attempt);
          console.log(
            `[Serper] Server error ${response.status}, retrying in ${delay}ms (attempt ${attempt + 1})`,
          );
          await sleep(delay);
          continue;
        }

        // Handle client errors (no retry)
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Serper API error ${response.status}: ${errorText}`);
        }

        // Parse and validate response
        const data = await response.json();
        return data as T;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Network errors - retry with backoff
        if (attempt < RETRY_CONFIG.maxRetries) {
          const delay = getBackoffDelay(attempt);
          console.log(
            `[Serper] Request failed, retrying in ${delay}ms (attempt ${attempt + 1}): ${lastError.message}`,
          );
          await sleep(delay);
        }
      }
    }

    throw lastError || new Error("Max retries exceeded");
  }

  /**
   * Format results for OpenAI function output
   * Returns a condensed summary for the AI to verbalize
   */
  formatForAI(results: SearchResults, maxResults: number = 3): string {
    const parts: string[] = [];

    if (results.web.length > 0) {
      const webSummary = results.web
        .slice(0, maxResults)
        .map((r, i) => `${i + 1}. "${r.title}" - ${r.snippet}`)
        .join("\n");
      parts.push(`Web Results:\n${webSummary}`);
    }

    if (results.topStories && results.topStories.length > 0) {
      const newsSummary = results.topStories
        .slice(0, maxResults)
        .map((r, i) => `${i + 1}. "${r.title}" (${r.source})`)
        .join("\n");
      parts.push(`Top Stories:\n${newsSummary}`);
    }

    if (results.videos.length > 0) {
      const videoSummary = results.videos
        .slice(0, maxResults)
        .map(
          (r, i) =>
            `${i + 1}. "${r.title}" (${r.source}${r.duration ? `, ${r.duration}` : ""})`,
        )
        .join("\n");
      parts.push(`Videos:\n${videoSummary}`);
    }

    if (results.images.length > 0) {
      parts.push(
        `Found ${results.images.length} images related to "${results.query}".`,
      );
    }

    if (parts.length === 0) {
      return `No results found for "${results.query}".`;
    }

    return parts.join("\n\n");
  }
}

/**
 * Create Serper service instance
 */
export function createSerperService(
  config: SerperServiceConfig,
  callbacks?: SerperServiceCallbacks,
): SerperService {
  return new SerperService(config, callbacks);
}

export default SerperService;
