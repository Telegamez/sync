/**
 * E2E Tests - Multi-Provider Voice AI
 *
 * Integration tests for switching between OpenAI Realtime and XAI Grok Voice providers.
 * Tests the provider factory, initialization, and environment-based configuration.
 *
 * Part of the Long-Horizon Engineering Protocol - FEAT-1006
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  createVoiceAIProvider,
  getConfiguredProviderType,
  getProviderDisplayName,
  getAvailableProviders,
  VoiceAIFactoryError,
} from "@/server/ai-providers/voice-ai-factory";
import { OpenAIRealtimeProvider } from "@/server/ai-providers/openai-realtime-provider";
import { XAIGrokProvider } from "@/server/ai-providers/xai-grok-provider";
import {
  type VoiceAIProviderCallbacks,
  type FunctionToolDefinition,
  VOICE_AI_PROVIDER_ENV,
  DEFAULT_VOICE_AI_PROVIDER,
  OPENAI_CAPABILITIES,
  XAI_CAPABILITIES,
} from "@/types/voice-ai-provider";

// Mock WebSocket for provider instantiation
vi.mock("ws", () => {
  return {
    WebSocket: vi.fn().mockImplementation(() => {
      const ws = {
        readyState: 1,
        send: vi.fn(),
        close: vi.fn(),
        on: vi.fn(),
        handlers: {} as Record<string, Function>,
      };
      ws.on.mockImplementation((event: string, handler: Function) => {
        ws.handlers[event] = handler;
        return ws;
      });
      return ws;
    }),
    OPEN: 1,
  };
});

// ============================================================================
// Test Suite: Provider Initialization
// ============================================================================

describe("E2E: Provider Initialization", () => {
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

  describe("OpenAI Provider Initialization", () => {
    it("should initialize OpenAI provider when VOICE_AI_PROVIDER=openai", () => {
      process.env[VOICE_AI_PROVIDER_ENV] = "openai";
      process.env.OPENAI_API_KEY = "sk-test-key";

      const { provider, providerType, fromEnvironment } =
        createVoiceAIProvider();

      expect(providerType).toBe("openai");
      expect(fromEnvironment).toBe(true);
      expect(provider).toBeInstanceOf(OpenAIRealtimeProvider);
      expect(provider.providerType).toBe("openai");
      expect(provider.capabilities).toEqual(OPENAI_CAPABILITIES);
    });

    it("should initialize OpenAI provider by default when no env var set", () => {
      process.env.OPENAI_API_KEY = "sk-test-key";

      const { provider, providerType } = createVoiceAIProvider();

      expect(providerType).toBe("openai");
      expect(provider).toBeInstanceOf(OpenAIRealtimeProvider);
    });

    it("should use OpenAI voices for personalities", () => {
      process.env.OPENAI_API_KEY = "sk-test-key";

      const { provider } = createVoiceAIProvider({
        providerOverride: "openai",
      });

      expect(provider.getVoice("facilitator")).toBe("marin");
      expect(provider.getVoice("assistant")).toBe("marin");
      expect(provider.getVoice("expert")).toBe("marin");
      expect(provider.getVoice("brainstorm")).toBe("sage");
      expect(provider.getVoice("custom")).toBe("marin");
    });
  });

  describe("XAI Provider Initialization", () => {
    it("should initialize XAI provider when VOICE_AI_PROVIDER=xai", () => {
      process.env[VOICE_AI_PROVIDER_ENV] = "xai";
      process.env.XAI_API_KEY = "xai-test-key";

      const { provider, providerType, fromEnvironment } =
        createVoiceAIProvider();

      expect(providerType).toBe("xai");
      expect(fromEnvironment).toBe(true);
      expect(provider).toBeInstanceOf(XAIGrokProvider);
      expect(provider.providerType).toBe("xai");
      expect(provider.capabilities).toEqual(XAI_CAPABILITIES);
    });

    it("should use XAI voices for personalities", () => {
      process.env.XAI_API_KEY = "xai-test-key";

      const { provider } = createVoiceAIProvider({ providerOverride: "xai" });

      expect(provider.getVoice("facilitator")).toBe("ara");
      expect(provider.getVoice("assistant")).toBe("eve");
      expect(provider.getVoice("expert")).toBe("leo");
      expect(provider.getVoice("brainstorm")).toBe("sal");
      expect(provider.getVoice("custom")).toBe("ara");
    });
  });

  describe("Error Handling", () => {
    it("should throw error when API key is missing for OpenAI", () => {
      process.env[VOICE_AI_PROVIDER_ENV] = "openai";
      // No API key set

      expect(() => createVoiceAIProvider()).toThrow(VoiceAIFactoryError);

      try {
        createVoiceAIProvider();
      } catch (error) {
        expect(error).toBeInstanceOf(VoiceAIFactoryError);
        expect((error as VoiceAIFactoryError).providerType).toBe("openai");
        expect((error as VoiceAIFactoryError).reason).toBe("missing_api_key");
      }
    });

    it("should throw error when API key is missing for XAI", () => {
      process.env[VOICE_AI_PROVIDER_ENV] = "xai";
      // No API key set

      expect(() => createVoiceAIProvider()).toThrow(VoiceAIFactoryError);

      try {
        createVoiceAIProvider();
      } catch (error) {
        expect(error).toBeInstanceOf(VoiceAIFactoryError);
        expect((error as VoiceAIFactoryError).providerType).toBe("xai");
        expect((error as VoiceAIFactoryError).reason).toBe("missing_api_key");
      }
    });
  });
});

// ============================================================================
// Test Suite: Provider Switching
// ============================================================================

describe("E2E: Provider Switching", () => {
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

  it("should switch from OpenAI to XAI based on environment", () => {
    // Start with OpenAI
    process.env[VOICE_AI_PROVIDER_ENV] = "openai";
    process.env.OPENAI_API_KEY = "sk-test";
    process.env.XAI_API_KEY = "xai-test";

    let result = createVoiceAIProvider();
    expect(result.providerType).toBe("openai");
    expect(result.provider).toBeInstanceOf(OpenAIRealtimeProvider);

    // Switch to XAI
    process.env[VOICE_AI_PROVIDER_ENV] = "xai";

    result = createVoiceAIProvider();
    expect(result.providerType).toBe("xai");
    expect(result.provider).toBeInstanceOf(XAIGrokProvider);
  });

  it("should maintain provider-specific capabilities after switch", () => {
    process.env.OPENAI_API_KEY = "sk-test";
    process.env.XAI_API_KEY = "xai-test";

    // OpenAI capabilities
    process.env[VOICE_AI_PROVIDER_ENV] = "openai";
    let { provider } = createVoiceAIProvider();

    expect(provider.capabilities.wsUrl).toBe(
      "wss://api.openai.com/v1/realtime",
    );
    expect(provider.capabilities.hasBuiltInWebSearch).toBe(false);
    expect(provider.capabilities.autoInputTranscription).toBe(false);

    // XAI capabilities
    process.env[VOICE_AI_PROVIDER_ENV] = "xai";
    ({ provider } = createVoiceAIProvider());

    expect(provider.capabilities.wsUrl).toBe("wss://api.x.ai/v1/realtime");
    expect(provider.capabilities.hasBuiltInWebSearch).toBe(true);
    expect(provider.capabilities.autoInputTranscription).toBe(true);
  });
});

// ============================================================================
// Test Suite: Function Calling with Both Providers
// ============================================================================

describe("E2E: Function Calling", () => {
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

  const webSearchTool: FunctionToolDefinition = {
    type: "function",
    name: "webSearch",
    description:
      "Search the web for current information, news, images, or videos.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The search query",
        },
        searchType: {
          type: "string",
          enum: ["all", "web", "images", "videos"],
          description: "Type of search",
        },
      },
      required: ["query"],
    },
  };

  const playVideoTool: FunctionToolDefinition = {
    type: "function",
    name: "playVideo",
    description: "Control video playback in the room.",
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["play", "pause", "stop", "next", "previous"],
          description: "The playback action",
        },
        searchQuery: {
          type: "string",
          description: "Video search query for play action",
        },
      },
      required: ["action"],
    },
  };

  it("should register webSearch tool with OpenAI provider", () => {
    process.env.OPENAI_API_KEY = "sk-test";

    const { provider } = createVoiceAIProvider({ providerOverride: "openai" });

    // Should not throw
    expect(() =>
      provider.registerTools("test-room", [webSearchTool]),
    ).not.toThrow();
  });

  it("should register webSearch tool with XAI provider", () => {
    process.env.XAI_API_KEY = "xai-test";

    const { provider } = createVoiceAIProvider({ providerOverride: "xai" });

    // Should not throw - XAI uses custom functions, NOT built-in web_search
    expect(() =>
      provider.registerTools("test-room", [webSearchTool]),
    ).not.toThrow();
  });

  it("should register playVideo tool with both providers", () => {
    process.env.OPENAI_API_KEY = "sk-test";
    process.env.XAI_API_KEY = "xai-test";

    const openai = createVoiceAIProvider({
      providerOverride: "openai",
    }).provider;
    const xai = createVoiceAIProvider({ providerOverride: "xai" }).provider;

    expect(() =>
      openai.registerTools("test-room", [playVideoTool]),
    ).not.toThrow();
    expect(() => xai.registerTools("test-room", [playVideoTool])).not.toThrow();
  });

  it("should register multiple tools with both providers", () => {
    process.env.OPENAI_API_KEY = "sk-test";
    process.env.XAI_API_KEY = "xai-test";

    const tools = [webSearchTool, playVideoTool];

    const openai = createVoiceAIProvider({
      providerOverride: "openai",
    }).provider;
    const xai = createVoiceAIProvider({ providerOverride: "xai" }).provider;

    expect(() => openai.registerTools("test-room", tools)).not.toThrow();
    expect(() => xai.registerTools("test-room", tools)).not.toThrow();
  });
});

// ============================================================================
// Test Suite: Serper API Integration
// ============================================================================

describe("E2E: Serper API Independence", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env[VOICE_AI_PROVIDER_ENV];
    delete process.env.OPENAI_API_KEY;
    delete process.env.XAI_API_KEY;
    delete process.env.SERPER_API_KEY;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("should use custom webSearch function with OpenAI (not built-in)", () => {
    process.env.OPENAI_API_KEY = "sk-test";

    const { provider } = createVoiceAIProvider({ providerOverride: "openai" });

    // OpenAI doesn't have built-in search, so we use Serper via function calling
    expect(provider.capabilities.hasBuiltInWebSearch).toBe(false);
    expect(provider.capabilities.hasCustomFunctions).toBe(true);
  });

  it("should use custom webSearch function with XAI (ignoring built-in)", () => {
    process.env.XAI_API_KEY = "xai-test";

    const { provider } = createVoiceAIProvider({ providerOverride: "xai" });

    // XAI has built-in search, but we don't use it - we use Serper via custom functions
    expect(provider.capabilities.hasBuiltInWebSearch).toBe(true);
    expect(provider.capabilities.hasBuiltInXSearch).toBe(true);
    // We use custom functions for search instead
    expect(provider.capabilities.hasCustomFunctions).toBe(true);
  });
});

// ============================================================================
// Test Suite: Provider Callbacks
// ============================================================================

describe("E2E: Provider Callbacks", () => {
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

  it("should accept identical callbacks for both providers", () => {
    process.env.OPENAI_API_KEY = "sk-test";
    process.env.XAI_API_KEY = "xai-test";

    const callbacks: VoiceAIProviderCallbacks = {
      onStateChange: vi.fn(),
      onAudioData: vi.fn(),
      onAudioDone: vi.fn(),
      onTranscript: vi.fn(),
      onError: vi.fn(),
      onReady: vi.fn(),
      onClose: vi.fn(),
      onFunctionCall: vi.fn(),
    };

    const openai = createVoiceAIProvider({
      providerOverride: "openai",
    }).provider;
    const xai = createVoiceAIProvider({ providerOverride: "xai" }).provider;

    expect(() => openai.setCallbacks(callbacks)).not.toThrow();
    expect(() => xai.setCallbacks(callbacks)).not.toThrow();
  });
});

// ============================================================================
// Test Suite: Helper Functions
// ============================================================================

describe("E2E: Helper Functions", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env[VOICE_AI_PROVIDER_ENV];
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("should return correct provider type from environment", () => {
    expect(getConfiguredProviderType()).toBe(DEFAULT_VOICE_AI_PROVIDER);

    process.env[VOICE_AI_PROVIDER_ENV] = "openai";
    expect(getConfiguredProviderType()).toBe("openai");

    process.env[VOICE_AI_PROVIDER_ENV] = "xai";
    expect(getConfiguredProviderType()).toBe("xai");
  });

  it("should return human-readable provider names", () => {
    expect(getProviderDisplayName("openai")).toBe("OpenAI Realtime API");
    expect(getProviderDisplayName("xai")).toBe("XAI Grok Voice API");
  });

  it("should list available providers", () => {
    const providers = getAvailableProviders();

    expect(providers).toContain("openai");
    expect(providers).toContain("xai");
    expect(providers).toHaveLength(2);
  });
});

// ============================================================================
// Test Suite: Temperature Settings
// ============================================================================

describe("E2E: Temperature Settings", () => {
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

  it("should return consistent temperatures for OpenAI provider", () => {
    process.env.OPENAI_API_KEY = "sk-test";

    const { provider } = createVoiceAIProvider({ providerOverride: "openai" });

    expect(provider.getTemperature("facilitator")).toBe(0.7);
    expect(provider.getTemperature("assistant")).toBe(0.8);
    expect(provider.getTemperature("expert")).toBe(0.7);
    expect(provider.getTemperature("brainstorm")).toBe(1.0);
    expect(provider.getTemperature("custom")).toBe(0.8);
  });

  it("should return consistent temperatures for XAI provider", () => {
    process.env.XAI_API_KEY = "xai-test";

    const { provider } = createVoiceAIProvider({ providerOverride: "xai" });

    expect(provider.getTemperature("facilitator")).toBe(0.7);
    expect(provider.getTemperature("assistant")).toBe(0.8);
    expect(provider.getTemperature("expert")).toBe(0.7);
    expect(provider.getTemperature("brainstorm")).toBe(1.0);
    expect(provider.getTemperature("custom")).toBe(0.8);
  });
});
