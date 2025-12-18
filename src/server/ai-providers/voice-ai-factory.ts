/**
 * Voice AI Provider Factory
 *
 * Factory for creating voice AI providers based on environment configuration.
 * Supports runtime switching between OpenAI Realtime API and XAI Grok Voice API.
 *
 * Part of the Long-Horizon Engineering Protocol - FEAT-1003
 */

import {
  type IVoiceAIProvider,
  type VoiceAIProviderType,
  VOICE_AI_PROVIDER_ENV,
  DEFAULT_VOICE_AI_PROVIDER,
} from "@/types/voice-ai-provider";
import { OpenAIRealtimeProvider } from "./openai-realtime-provider";
import { XAIGrokProvider } from "./xai-grok-provider";

/**
 * Configuration for the Voice AI Factory
 */
export interface VoiceAIFactoryConfig {
  /** Override provider type (defaults to env variable) */
  providerOverride?: VoiceAIProviderType;
  /** OpenAI API key (defaults to OPENAI_API_KEY env) */
  openaiApiKey?: string;
  /** XAI API key (defaults to XAI_API_KEY env) */
  xaiApiKey?: string;
  /** Enable debug logging */
  debug?: boolean;
}

/**
 * Factory result with provider and metadata
 */
export interface VoiceAIFactoryResult {
  /** The created provider instance */
  provider: IVoiceAIProvider;
  /** The provider type that was created */
  providerType: VoiceAIProviderType;
  /** Whether the provider was configured from environment */
  fromEnvironment: boolean;
}

/**
 * Error thrown when provider creation fails
 */
export class VoiceAIFactoryError extends Error {
  constructor(
    message: string,
    public readonly providerType: VoiceAIProviderType,
    public readonly reason:
      | "missing_api_key"
      | "invalid_provider"
      | "creation_failed",
  ) {
    super(message);
    this.name = "VoiceAIFactoryError";
  }
}

/**
 * Get the configured provider type from environment
 */
export function getConfiguredProviderType(): VoiceAIProviderType {
  const envValue = process.env[VOICE_AI_PROVIDER_ENV];

  if (!envValue) {
    return DEFAULT_VOICE_AI_PROVIDER;
  }

  const normalizedValue = envValue.toLowerCase().trim();

  if (normalizedValue === "openai" || normalizedValue === "xai") {
    return normalizedValue;
  }

  // Log warning but fall back to default
  console.warn(
    `[VoiceAI Factory] Invalid ${VOICE_AI_PROVIDER_ENV} value: "${envValue}". ` +
      `Valid values are "openai" or "xai". Falling back to "${DEFAULT_VOICE_AI_PROVIDER}".`,
  );

  return DEFAULT_VOICE_AI_PROVIDER;
}

/**
 * Validate that the required API key is present for a provider
 */
export function validateApiKey(
  providerType: VoiceAIProviderType,
  config?: VoiceAIFactoryConfig,
): string {
  if (providerType === "openai") {
    const apiKey = config?.openaiApiKey || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new VoiceAIFactoryError(
        "OpenAI API key is required. Set OPENAI_API_KEY environment variable or provide openaiApiKey in config.",
        "openai",
        "missing_api_key",
      );
    }
    return apiKey;
  }

  if (providerType === "xai") {
    const apiKey = config?.xaiApiKey || process.env.XAI_API_KEY;
    if (!apiKey) {
      throw new VoiceAIFactoryError(
        "XAI API key is required. Set XAI_API_KEY environment variable or provide xaiApiKey in config.",
        "xai",
        "missing_api_key",
      );
    }
    return apiKey;
  }

  throw new VoiceAIFactoryError(
    `Unknown provider type: "${providerType}"`,
    providerType,
    "invalid_provider",
  );
}

/**
 * Create a Voice AI provider based on configuration
 *
 * @param config - Optional factory configuration
 * @returns The created provider with metadata
 * @throws VoiceAIFactoryError if provider cannot be created
 *
 * @example
 * ```typescript
 * // Use environment configuration
 * const { provider, providerType } = createVoiceAIProvider();
 * console.log(`Using ${providerType} provider`);
 *
 * // Override provider type
 * const { provider } = createVoiceAIProvider({ providerOverride: "xai" });
 *
 * // Provide API keys directly
 * const { provider } = createVoiceAIProvider({
 *   providerOverride: "openai",
 *   openaiApiKey: "sk-..."
 * });
 * ```
 */
export function createVoiceAIProvider(
  config?: VoiceAIFactoryConfig,
): VoiceAIFactoryResult {
  const fromEnvironment = !config?.providerOverride;
  const providerType = config?.providerOverride || getConfiguredProviderType();
  const debug = config?.debug ?? false;

  // Validate and get API key
  const apiKey = validateApiKey(providerType, config);

  // Log provider selection
  if (debug) {
    console.log(
      `[VoiceAI Factory] Creating ${providerType} provider ` +
        `(${fromEnvironment ? "from environment" : "override"})`,
    );
  }

  // Create provider based on type
  let provider: IVoiceAIProvider;

  try {
    if (providerType === "openai") {
      provider = new OpenAIRealtimeProvider(apiKey, debug);
    } else if (providerType === "xai") {
      provider = new XAIGrokProvider(apiKey, debug);
    } else {
      throw new VoiceAIFactoryError(
        `Unknown provider type: "${providerType}"`,
        providerType,
        "invalid_provider",
      );
    }
  } catch (error) {
    if (error instanceof VoiceAIFactoryError) {
      throw error;
    }
    throw new VoiceAIFactoryError(
      `Failed to create ${providerType} provider: ${error instanceof Error ? error.message : String(error)}`,
      providerType,
      "creation_failed",
    );
  }

  return {
    provider,
    providerType,
    fromEnvironment,
  };
}

/**
 * Check if a provider type is valid
 */
export function isValidProviderType(
  value: unknown,
): value is VoiceAIProviderType {
  return value === "openai" || value === "xai";
}

/**
 * Get human-readable provider name
 */
export function getProviderDisplayName(
  providerType: VoiceAIProviderType,
): string {
  switch (providerType) {
    case "openai":
      return "OpenAI Realtime API";
    case "xai":
      return "XAI Grok Voice API";
    default:
      return String(providerType);
  }
}

/**
 * Get available provider types
 */
export function getAvailableProviders(): VoiceAIProviderType[] {
  return ["openai", "xai"];
}
