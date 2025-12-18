/**
 * Voice AI Provider Factory Tests
 *
 * Tests for the factory that creates voice AI providers based on environment configuration.
 * Part of the Long-Horizon Engineering Protocol - FEAT-1003
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  createVoiceAIProvider,
  getConfiguredProviderType,
  validateApiKey,
  isValidProviderType,
  getProviderDisplayName,
  getAvailableProviders,
  VoiceAIFactoryError,
  type VoiceAIFactoryConfig,
} from "@/server/ai-providers/voice-ai-factory";
import {
  VOICE_AI_PROVIDER_ENV,
  DEFAULT_VOICE_AI_PROVIDER,
} from "@/types/voice-ai-provider";

// Mock the WebSocket module for provider instantiation
vi.mock("ws", () => {
  return {
    WebSocket: vi.fn().mockImplementation(() => ({
      readyState: 1,
      send: vi.fn(),
      close: vi.fn(),
      on: vi.fn(),
    })),
    OPEN: 1,
  };
});

describe("Voice AI Factory", () => {
  // Store original env values
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset environment variables
    delete process.env[VOICE_AI_PROVIDER_ENV];
    delete process.env.OPENAI_API_KEY;
    delete process.env.XAI_API_KEY;
  });

  afterEach(() => {
    // Restore original env
    process.env = { ...originalEnv };
  });

  describe("getConfiguredProviderType", () => {
    it("should return default provider when env not set", () => {
      expect(getConfiguredProviderType()).toBe(DEFAULT_VOICE_AI_PROVIDER);
    });

    it("should return openai when VOICE_AI_PROVIDER=openai", () => {
      process.env[VOICE_AI_PROVIDER_ENV] = "openai";
      expect(getConfiguredProviderType()).toBe("openai");
    });

    it("should return xai when VOICE_AI_PROVIDER=xai", () => {
      process.env[VOICE_AI_PROVIDER_ENV] = "xai";
      expect(getConfiguredProviderType()).toBe("xai");
    });

    it("should handle case-insensitive values", () => {
      process.env[VOICE_AI_PROVIDER_ENV] = "OPENAI";
      expect(getConfiguredProviderType()).toBe("openai");

      process.env[VOICE_AI_PROVIDER_ENV] = "XAI";
      expect(getConfiguredProviderType()).toBe("xai");
    });

    it("should handle whitespace in values", () => {
      process.env[VOICE_AI_PROVIDER_ENV] = "  xai  ";
      expect(getConfiguredProviderType()).toBe("xai");
    });

    it("should fall back to default for invalid values", () => {
      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      process.env[VOICE_AI_PROVIDER_ENV] = "invalid";
      expect(getConfiguredProviderType()).toBe(DEFAULT_VOICE_AI_PROVIDER);
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it("should handle empty string", () => {
      process.env[VOICE_AI_PROVIDER_ENV] = "";
      expect(getConfiguredProviderType()).toBe(DEFAULT_VOICE_AI_PROVIDER);
    });
  });

  describe("validateApiKey", () => {
    it("should return OpenAI API key from env", () => {
      process.env.OPENAI_API_KEY = "sk-test-key";
      expect(validateApiKey("openai")).toBe("sk-test-key");
    });

    it("should return OpenAI API key from config", () => {
      const config: VoiceAIFactoryConfig = { openaiApiKey: "sk-config-key" };
      expect(validateApiKey("openai", config)).toBe("sk-config-key");
    });

    it("should prefer config over env for OpenAI", () => {
      process.env.OPENAI_API_KEY = "sk-env-key";
      const config: VoiceAIFactoryConfig = { openaiApiKey: "sk-config-key" };
      expect(validateApiKey("openai", config)).toBe("sk-config-key");
    });

    it("should throw for missing OpenAI API key", () => {
      expect(() => validateApiKey("openai")).toThrow(VoiceAIFactoryError);
      expect(() => validateApiKey("openai")).toThrow(
        "OpenAI API key is required",
      );
    });

    it("should return XAI API key from env", () => {
      process.env.XAI_API_KEY = "xai-test-key";
      expect(validateApiKey("xai")).toBe("xai-test-key");
    });

    it("should return XAI API key from config", () => {
      const config: VoiceAIFactoryConfig = { xaiApiKey: "xai-config-key" };
      expect(validateApiKey("xai", config)).toBe("xai-config-key");
    });

    it("should prefer config over env for XAI", () => {
      process.env.XAI_API_KEY = "xai-env-key";
      const config: VoiceAIFactoryConfig = { xaiApiKey: "xai-config-key" };
      expect(validateApiKey("xai", config)).toBe("xai-config-key");
    });

    it("should throw for missing XAI API key", () => {
      expect(() => validateApiKey("xai")).toThrow(VoiceAIFactoryError);
      expect(() => validateApiKey("xai")).toThrow("XAI API key is required");
    });

    it("should throw for invalid provider type", () => {
      expect(() => validateApiKey("invalid" as never)).toThrow(
        VoiceAIFactoryError,
      );
      expect(() => validateApiKey("invalid" as never)).toThrow(
        "Unknown provider type",
      );
    });
  });

  describe("VoiceAIFactoryError", () => {
    it("should have correct name", () => {
      const error = new VoiceAIFactoryError(
        "test",
        "openai",
        "missing_api_key",
      );
      expect(error.name).toBe("VoiceAIFactoryError");
    });

    it("should have correct properties", () => {
      const error = new VoiceAIFactoryError(
        "test message",
        "xai",
        "creation_failed",
      );
      expect(error.message).toBe("test message");
      expect(error.providerType).toBe("xai");
      expect(error.reason).toBe("creation_failed");
    });
  });

  describe("createVoiceAIProvider", () => {
    it("should create OpenAI provider with env key", () => {
      process.env.OPENAI_API_KEY = "sk-test-key";
      const result = createVoiceAIProvider();

      expect(result.providerType).toBe("openai");
      expect(result.fromEnvironment).toBe(true);
      expect(result.provider.providerType).toBe("openai");
    });

    it("should create XAI provider when configured", () => {
      process.env[VOICE_AI_PROVIDER_ENV] = "xai";
      process.env.XAI_API_KEY = "xai-test-key";
      const result = createVoiceAIProvider();

      expect(result.providerType).toBe("xai");
      expect(result.fromEnvironment).toBe(true);
      expect(result.provider.providerType).toBe("xai");
    });

    it("should override provider type with config", () => {
      process.env.XAI_API_KEY = "xai-test-key";
      const result = createVoiceAIProvider({ providerOverride: "xai" });

      expect(result.providerType).toBe("xai");
      expect(result.fromEnvironment).toBe(false);
    });

    it("should use config API keys", () => {
      const result = createVoiceAIProvider({
        providerOverride: "openai",
        openaiApiKey: "sk-direct-key",
      });

      expect(result.providerType).toBe("openai");
      expect(result.provider).toBeDefined();
    });

    it("should throw for missing API key", () => {
      expect(() => createVoiceAIProvider()).toThrow(VoiceAIFactoryError);
    });

    it("should log when debug is enabled", () => {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      process.env.OPENAI_API_KEY = "sk-test-key";

      createVoiceAIProvider({ debug: true });

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("[VoiceAI Factory]"),
      );
      consoleSpy.mockRestore();
    });

    it("should not log when debug is disabled", () => {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      process.env.OPENAI_API_KEY = "sk-test-key";

      createVoiceAIProvider({ debug: false });

      expect(consoleSpy).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it("should create provider with correct capabilities for OpenAI", () => {
      process.env.OPENAI_API_KEY = "sk-test-key";
      const result = createVoiceAIProvider();

      expect(result.provider.capabilities.provider).toBe("openai");
      expect(result.provider.capabilities.hasCustomFunctions).toBe(true);
    });

    it("should create provider with correct capabilities for XAI", () => {
      process.env.XAI_API_KEY = "xai-test-key";
      const result = createVoiceAIProvider({ providerOverride: "xai" });

      expect(result.provider.capabilities.provider).toBe("xai");
      expect(result.provider.capabilities.hasCustomFunctions).toBe(true);
    });
  });

  describe("isValidProviderType", () => {
    it("should return true for openai", () => {
      expect(isValidProviderType("openai")).toBe(true);
    });

    it("should return true for xai", () => {
      expect(isValidProviderType("xai")).toBe(true);
    });

    it("should return false for invalid values", () => {
      expect(isValidProviderType("invalid")).toBe(false);
      expect(isValidProviderType("")).toBe(false);
      expect(isValidProviderType(null)).toBe(false);
      expect(isValidProviderType(undefined)).toBe(false);
      expect(isValidProviderType(123)).toBe(false);
    });
  });

  describe("getProviderDisplayName", () => {
    it("should return correct name for openai", () => {
      expect(getProviderDisplayName("openai")).toBe("OpenAI Realtime API");
    });

    it("should return correct name for xai", () => {
      expect(getProviderDisplayName("xai")).toBe("XAI Grok Voice API");
    });

    it("should return string representation for unknown", () => {
      expect(getProviderDisplayName("unknown" as never)).toBe("unknown");
    });
  });

  describe("getAvailableProviders", () => {
    it("should return both providers", () => {
      const providers = getAvailableProviders();
      expect(providers).toContain("openai");
      expect(providers).toContain("xai");
      expect(providers).toHaveLength(2);
    });
  });
});

describe("Voice AI Factory - Integration", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env[VOICE_AI_PROVIDER_ENV];
    delete process.env.OPENAI_API_KEY;
    delete process.env.XAI_API_KEY;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("should switch providers based on env variable", () => {
    // Test OpenAI
    process.env[VOICE_AI_PROVIDER_ENV] = "openai";
    process.env.OPENAI_API_KEY = "sk-test";
    let result = createVoiceAIProvider();
    expect(result.providerType).toBe("openai");

    // Test XAI
    process.env[VOICE_AI_PROVIDER_ENV] = "xai";
    process.env.XAI_API_KEY = "xai-test";
    result = createVoiceAIProvider();
    expect(result.providerType).toBe("xai");
  });

  it("should work with all factory functions together", () => {
    process.env[VOICE_AI_PROVIDER_ENV] = "xai";
    process.env.XAI_API_KEY = "xai-test";

    const configuredType = getConfiguredProviderType();
    expect(configuredType).toBe("xai");
    expect(isValidProviderType(configuredType)).toBe(true);
    expect(getProviderDisplayName(configuredType)).toBe("XAI Grok Voice API");

    const result = createVoiceAIProvider();
    expect(result.providerType).toBe(configuredType);
  });

  it("should handle provider creation errors gracefully", () => {
    // Provider instantiation should fail without valid API key format
    // The error is wrapped in VoiceAIFactoryError
    expect(() => createVoiceAIProvider({ providerOverride: "openai" })).toThrow(
      VoiceAIFactoryError,
    );
  });
});
