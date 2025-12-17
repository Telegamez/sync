/**
 * Video Summary LLM Service
 *
 * Generates conversational video summaries using gpt-4o-mini.
 * Takes YouTube metadata and produces voice-friendly summaries
 * for the AI to speak to room participants.
 *
 * Part of the Long-Horizon Engineering Protocol - FEAT-904
 */

import OpenAI from "openai";
import type { YouTubeVideoMetadata } from "@/types/video-summary";

/**
 * Model for summary generation (fast and cost-effective)
 */
const SUMMARY_MODEL = "gpt-4o-mini";

/**
 * Retry configuration
 */
const RETRY_CONFIG = {
  maxRetries: 2,
  baseDelayMs: 500,
  maxDelayMs: 3000,
};

/**
 * Summary LLM service configuration
 */
export interface SummaryLLMServiceConfig {
  /** OpenAI API key */
  apiKey: string;
  /** Temperature for generation (default: 0.7 for natural variety) */
  temperature?: number;
  /** Maximum tokens for summary output (default: 150) */
  maxTokens?: number;
}

/**
 * Summary LLM service callbacks
 */
export interface SummaryLLMServiceCallbacks {
  /** Called when summary generation starts */
  onGenerateStart?: (videoId: string) => void;
  /** Called when summary generation completes */
  onGenerateComplete?: (videoId: string, summary: string) => void;
  /** Called on generation error */
  onGenerateError?: (videoId: string, error: string) => void;
}

/**
 * Summary prompt template for voice-friendly output
 */
const SUMMARY_PROMPT = `You are summarizing a YouTube video for someone watching with friends. Create a brief, natural-sounding summary that could be spoken aloud.

VIDEO METADATA:
Title: {title}
Channel: {channelTitle}
Duration: {duration}
Views: {viewCount}
Description: {description}
Tags: {tags}

INSTRUCTIONS:
- Write 2-3 conversational sentences
- Include: who made it, what it's about, and 1-2 key topics
- Keep it under 75 words
- Sound natural, as if telling a friend
- Don't use bullet points or lists
- Don't say "This video is about..." - be more natural

Respond with ONLY the summary text, nothing else.`;

/**
 * Format view count for human readability
 */
function formatViewCount(views: number): string {
  if (views >= 1_000_000_000) {
    return `${(views / 1_000_000_000).toFixed(1)} billion`;
  } else if (views >= 1_000_000) {
    return `${(views / 1_000_000).toFixed(1)} million`;
  } else if (views >= 1_000) {
    return `${Math.round(views / 1_000)} thousand`;
  }
  return views.toString();
}

/**
 * Format duration for readability
 */
function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours} hour${hours !== 1 ? "s" : ""} ${minutes} minute${minutes !== 1 ? "s" : ""}`;
  } else if (minutes > 0) {
    return `${minutes} minute${minutes !== 1 ? "s" : ""}${secs > 0 ? ` ${secs} seconds` : ""}`;
  }
  return `${secs} seconds`;
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
  const jitter = Math.random() * 200;
  return Math.min(delay + jitter, RETRY_CONFIG.maxDelayMs);
}

/**
 * Video Summary LLM Service
 *
 * Generates natural, conversational video summaries for voice output.
 */
export class SummaryLLMService {
  private openai: OpenAI;
  private temperature: number;
  private maxTokens: number;
  private callbacks: SummaryLLMServiceCallbacks;

  constructor(
    config: SummaryLLMServiceConfig,
    callbacks: SummaryLLMServiceCallbacks = {},
  ) {
    if (!config.apiKey) {
      throw new Error("OpenAI API key is required");
    }
    this.openai = new OpenAI({ apiKey: config.apiKey });
    this.temperature = config.temperature ?? 0.7;
    this.maxTokens = config.maxTokens ?? 150;
    this.callbacks = callbacks;
  }

  /**
   * Generate a conversational video summary from metadata
   *
   * @param metadata - YouTube video metadata
   * @returns Natural language summary for voice output
   */
  async generateVideoSummary(metadata: YouTubeVideoMetadata): Promise<string> {
    console.log(`[SummaryLLM] Generating summary for: "${metadata.title}"`);
    this.callbacks.onGenerateStart?.(metadata.videoId);

    try {
      const prompt = this.buildPrompt(metadata);
      const summary = await this.callOpenAI(prompt);

      console.log(`[SummaryLLM] Summary generated (${summary.length} chars)`);
      this.callbacks.onGenerateComplete?.(metadata.videoId, summary);

      return summary;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Summary generation failed";
      console.error(`[SummaryLLM] Error: ${errorMessage}`);
      this.callbacks.onGenerateError?.(metadata.videoId, errorMessage);

      // Return fallback summary using just metadata
      return this.generateFallbackSummary(metadata);
    }
  }

  /**
   * Generate a simple summary without LLM (fallback)
   *
   * @param metadata - YouTube video metadata
   * @returns Basic summary from metadata
   */
  generateFallbackSummary(metadata: YouTubeVideoMetadata): string {
    const duration = formatDuration(metadata.durationSeconds);
    const views = formatViewCount(metadata.viewCount);

    let summary = `"${metadata.title}" by ${metadata.channelTitle}. `;
    summary += `It's ${duration} long with ${views} views. `;

    if (metadata.tags.length > 0) {
      const topTags = metadata.tags.slice(0, 2).join(" and ");
      summary += `It's about ${topTags}.`;
    }

    return summary;
  }

  /**
   * Build the prompt with metadata substituted
   */
  private buildPrompt(metadata: YouTubeVideoMetadata): string {
    // Truncate description if too long
    const description =
      metadata.description.length > 500
        ? metadata.description.slice(0, 500) + "..."
        : metadata.description || "No description available";

    // Format tags
    const tags =
      metadata.tags.length > 0
        ? metadata.tags.slice(0, 10).join(", ")
        : "None provided";

    return SUMMARY_PROMPT.replace("{title}", metadata.title)
      .replace("{channelTitle}", metadata.channelTitle)
      .replace("{duration}", formatDuration(metadata.durationSeconds))
      .replace("{viewCount}", formatViewCount(metadata.viewCount))
      .replace("{description}", description)
      .replace("{tags}", tags);
  }

  /**
   * Call OpenAI with retry logic
   */
  private async callOpenAI(prompt: string): Promise<string> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= RETRY_CONFIG.maxRetries; attempt++) {
      try {
        const response = await this.openai.chat.completions.create({
          model: SUMMARY_MODEL,
          messages: [
            {
              role: "system",
              content:
                "You are a friendly assistant helping summarize videos for group watching sessions. Keep responses natural and conversational.",
            },
            {
              role: "user",
              content: prompt,
            },
          ],
          temperature: this.temperature,
          max_tokens: this.maxTokens,
        });

        const content = response.choices[0]?.message?.content;
        if (!content) {
          throw new Error("Empty response from OpenAI");
        }

        return content.trim();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Check for rate limiting
        if (
          lastError.message.includes("rate_limit") ||
          lastError.message.includes("429")
        ) {
          const delay = getBackoffDelay(attempt);
          console.log(
            `[SummaryLLM] Rate limited, retrying in ${delay}ms (attempt ${attempt + 1})`,
          );
          await sleep(delay);
          continue;
        }

        // Other errors - retry with backoff
        if (attempt < RETRY_CONFIG.maxRetries) {
          const delay = getBackoffDelay(attempt);
          console.log(
            `[SummaryLLM] Request failed, retrying in ${delay}ms (attempt ${attempt + 1}): ${lastError.message}`,
          );
          await sleep(delay);
        }
      }
    }

    throw lastError || new Error("Max retries exceeded");
  }
}

/**
 * Create summary LLM service from environment
 */
export function createSummaryLLMService(
  callbacks?: SummaryLLMServiceCallbacks,
): SummaryLLMService {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY environment variable is required for video summaries",
    );
  }

  return new SummaryLLMService({ apiKey }, callbacks);
}

/**
 * Create summary LLM service with explicit config
 */
export function createSummaryLLMServiceWithConfig(
  config: SummaryLLMServiceConfig,
  callbacks?: SummaryLLMServiceCallbacks,
): SummaryLLMService {
  return new SummaryLLMService(config, callbacks);
}

export default SummaryLLMService;
