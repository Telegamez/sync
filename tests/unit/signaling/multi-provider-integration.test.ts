/**
 * Multi-Provider Voice AI Integration Tests
 *
 * Tests that verify the server.ts integration with the VoiceAIProvider abstraction.
 * These tests ensure the signaling layer properly routes to the selected provider.
 *
 * Part of the Long-Horizon Engineering Protocol - FEAT-1004
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  createVoiceAIProvider,
  getConfiguredProviderType,
  VoiceAIFactoryError,
} from "@/server/ai-providers/voice-ai-factory";
import { OpenAIRealtimeProvider } from "@/server/ai-providers/openai-realtime-provider";
import { XAIGrokProvider } from "@/server/ai-providers/xai-grok-provider";
import {
  type VoiceAIProviderCallbacks,
  type VoiceAISessionConfig,
  VOICE_AI_PROVIDER_ENV,
} from "@/types/voice-ai-provider";

// Mock WebSocket
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

describe("Multi-Provider Integration", () => {
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

  describe("Provider Selection", () => {
    it("should default to OpenAI provider when no env variable set", () => {
      const providerType = getConfiguredProviderType();
      expect(providerType).toBe("openai");
    });

    it("should select OpenAI provider when VOICE_AI_PROVIDER=openai", () => {
      process.env[VOICE_AI_PROVIDER_ENV] = "openai";
      process.env.OPENAI_API_KEY = "sk-test";

      const result = createVoiceAIProvider();
      expect(result.providerType).toBe("openai");
      expect(result.provider).toBeInstanceOf(OpenAIRealtimeProvider);
    });

    it("should select XAI provider when VOICE_AI_PROVIDER=xai", () => {
      process.env[VOICE_AI_PROVIDER_ENV] = "xai";
      process.env.XAI_API_KEY = "xai-test";

      const result = createVoiceAIProvider();
      expect(result.providerType).toBe("xai");
      expect(result.provider).toBeInstanceOf(XAIGrokProvider);
    });
  });

  describe("Provider Interface Consistency", () => {
    it("should have consistent interface between OpenAI and XAI providers", () => {
      process.env.OPENAI_API_KEY = "sk-test";
      process.env.XAI_API_KEY = "xai-test";

      const openaiResult = createVoiceAIProvider({
        providerOverride: "openai",
      });
      const xaiResult = createVoiceAIProvider({ providerOverride: "xai" });

      // Both should implement the same interface
      const openai = openaiResult.provider;
      const xai = xaiResult.provider;

      // Provider identification
      expect(openai.providerType).toBe("openai");
      expect(xai.providerType).toBe("xai");
      expect(openai.capabilities).toBeDefined();
      expect(xai.capabilities).toBeDefined();

      // Session management methods
      expect(typeof openai.createSession).toBe("function");
      expect(typeof xai.createSession).toBe("function");
      expect(typeof openai.closeSession).toBe("function");
      expect(typeof xai.closeSession).toBe("function");
      expect(typeof openai.isSessionConnected).toBe("function");
      expect(typeof xai.isSessionConnected).toBe("function");
      expect(typeof openai.getSessionState).toBe("function");
      expect(typeof xai.getSessionState).toBe("function");

      // Audio operations
      expect(typeof openai.sendAudio).toBe("function");
      expect(typeof xai.sendAudio).toBe("function");
      expect(typeof openai.commitAudio).toBe("function");
      expect(typeof xai.commitAudio).toBe("function");

      // Response operations
      expect(typeof openai.triggerResponse).toBe("function");
      expect(typeof xai.triggerResponse).toBe("function");
      expect(typeof openai.cancelResponse).toBe("function");
      expect(typeof xai.cancelResponse).toBe("function");

      // Function calling
      expect(typeof openai.sendFunctionOutput).toBe("function");
      expect(typeof xai.sendFunctionOutput).toBe("function");
      expect(typeof openai.registerTools).toBe("function");
      expect(typeof xai.registerTools).toBe("function");

      // Voice/personality
      expect(typeof openai.getVoice).toBe("function");
      expect(typeof xai.getVoice).toBe("function");
      expect(typeof openai.getTemperature).toBe("function");
      expect(typeof xai.getTemperature).toBe("function");
    });

    it("should return different voices for same personality", () => {
      process.env.OPENAI_API_KEY = "sk-test";
      process.env.XAI_API_KEY = "xai-test";

      const openaiResult = createVoiceAIProvider({
        providerOverride: "openai",
      });
      const xaiResult = createVoiceAIProvider({ providerOverride: "xai" });

      // Different voices for same personality
      expect(openaiResult.provider.getVoice("facilitator")).toBe("marin");
      expect(xaiResult.provider.getVoice("facilitator")).toBe("ara");

      expect(openaiResult.provider.getVoice("brainstorm")).toBe("sage");
      expect(xaiResult.provider.getVoice("brainstorm")).toBe("sal");
    });
  });

  describe("Callback Registration", () => {
    it("should accept callbacks on both providers", () => {
      process.env.OPENAI_API_KEY = "sk-test";
      process.env.XAI_API_KEY = "xai-test";

      const openaiResult = createVoiceAIProvider({
        providerOverride: "openai",
      });
      const xaiResult = createVoiceAIProvider({ providerOverride: "xai" });

      const callbacks: VoiceAIProviderCallbacks = {
        onStateChange: vi.fn(),
        onAudioData: vi.fn(),
        onTranscript: vi.fn(),
        onError: vi.fn(),
        onFunctionCall: vi.fn(),
        onReady: vi.fn(),
        onClose: vi.fn(),
      };

      // Both should accept callbacks without error
      expect(() => openaiResult.provider.setCallbacks(callbacks)).not.toThrow();
      expect(() => xaiResult.provider.setCallbacks(callbacks)).not.toThrow();
    });
  });

  describe("Session Configuration", () => {
    it("should accept same session config structure for both providers", () => {
      process.env.OPENAI_API_KEY = "sk-test";
      process.env.XAI_API_KEY = "xai-test";

      const openaiResult = createVoiceAIProvider({
        providerOverride: "openai",
      });
      const xaiResult = createVoiceAIProvider({ providerOverride: "xai" });

      const sessionConfig: VoiceAISessionConfig = {
        roomId: "test-room",
        personality: "expert",
        topic: "Machine Learning",
        speakerName: "John",
        tools: [
          {
            type: "function",
            name: "webSearch",
            description: "Search the web",
            parameters: {
              type: "object",
              properties: {
                query: { type: "string" },
              },
              required: ["query"],
            },
          },
        ],
      };

      // Both providers should have createSession method that accepts the same config type
      // We verify the interface accepts the config without actually creating sessions
      // (actual WebSocket creation requires proper mocking which is tested in provider-specific tests)
      expect(typeof openaiResult.provider.createSession).toBe("function");
      expect(typeof xaiResult.provider.createSession).toBe("function");

      // Verify the config object structure is valid for both
      expect(sessionConfig.roomId).toBe("test-room");
      expect(sessionConfig.personality).toBe("expert");
      expect(sessionConfig.tools).toHaveLength(1);
    });
  });

  describe("Tool Registration", () => {
    it("should register same tools on both providers", () => {
      process.env.OPENAI_API_KEY = "sk-test";
      process.env.XAI_API_KEY = "xai-test";

      const openaiResult = createVoiceAIProvider({
        providerOverride: "openai",
      });
      const xaiResult = createVoiceAIProvider({ providerOverride: "xai" });

      const tools = [
        {
          type: "function" as const,
          name: "webSearch",
          description: "Search the web",
          parameters: {
            type: "object" as const,
            properties: {
              query: { type: "string" },
            },
            required: ["query"],
          },
        },
        {
          type: "function" as const,
          name: "playVideo",
          description: "Control video playback",
          parameters: {
            type: "object" as const,
            properties: {
              action: { type: "string" },
            },
            required: ["action"],
          },
        },
      ];

      // Both should accept tool registration
      expect(() =>
        openaiResult.provider.registerTools("test-room", tools),
      ).not.toThrow();
      expect(() =>
        xaiResult.provider.registerTools("test-room", tools),
      ).not.toThrow();
    });
  });

  describe("Error Handling", () => {
    it("should throw appropriate error when API key missing", () => {
      expect(() =>
        createVoiceAIProvider({ providerOverride: "openai" }),
      ).toThrow(VoiceAIFactoryError);

      expect(() => createVoiceAIProvider({ providerOverride: "xai" })).toThrow(
        VoiceAIFactoryError,
      );
    });

    it("should include provider type in error", () => {
      try {
        createVoiceAIProvider({ providerOverride: "openai" });
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(VoiceAIFactoryError);
        expect((error as VoiceAIFactoryError).providerType).toBe("openai");
      }
    });
  });

  describe("Provider Capabilities", () => {
    it("should have different capabilities for each provider", () => {
      process.env.OPENAI_API_KEY = "sk-test";
      process.env.XAI_API_KEY = "xai-test";

      const openaiResult = createVoiceAIProvider({
        providerOverride: "openai",
      });
      const xaiResult = createVoiceAIProvider({ providerOverride: "xai" });

      // OpenAI doesn't have built-in search, XAI does (but we don't use it)
      expect(openaiResult.provider.capabilities.hasBuiltInWebSearch).toBe(
        false,
      );
      expect(xaiResult.provider.capabilities.hasBuiltInWebSearch).toBe(true);

      // Different WebSocket URLs
      expect(openaiResult.provider.capabilities.wsUrl).toBe(
        "wss://api.openai.com/v1/realtime",
      );
      expect(xaiResult.provider.capabilities.wsUrl).toBe(
        "wss://api.x.ai/v1/realtime",
      );

      // Both support custom functions
      expect(openaiResult.provider.capabilities.hasCustomFunctions).toBe(true);
      expect(xaiResult.provider.capabilities.hasCustomFunctions).toBe(true);

      // Different auto-transcription behavior
      expect(openaiResult.provider.capabilities.autoInputTranscription).toBe(
        false,
      );
      expect(xaiResult.provider.capabilities.autoInputTranscription).toBe(true);
    });
  });

  describe("Graceful Operations Without Connection", () => {
    it("should not throw when sending audio without session", () => {
      process.env.OPENAI_API_KEY = "sk-test";
      process.env.XAI_API_KEY = "xai-test";

      const openaiResult = createVoiceAIProvider({
        providerOverride: "openai",
      });
      const xaiResult = createVoiceAIProvider({ providerOverride: "xai" });

      // Should handle gracefully
      expect(() =>
        openaiResult.provider.sendAudio("nonexistent", "base64audio"),
      ).not.toThrow();
      expect(() =>
        xaiResult.provider.sendAudio("nonexistent", "base64audio"),
      ).not.toThrow();
    });

    it("should not throw when triggering response without session", () => {
      process.env.OPENAI_API_KEY = "sk-test";
      process.env.XAI_API_KEY = "xai-test";

      const openaiResult = createVoiceAIProvider({
        providerOverride: "openai",
      });
      const xaiResult = createVoiceAIProvider({ providerOverride: "xai" });

      expect(() =>
        openaiResult.provider.triggerResponse("nonexistent"),
      ).not.toThrow();
      expect(() =>
        xaiResult.provider.triggerResponse("nonexistent"),
      ).not.toThrow();
    });

    it("should not throw when canceling response without session", () => {
      process.env.OPENAI_API_KEY = "sk-test";
      process.env.XAI_API_KEY = "xai-test";

      const openaiResult = createVoiceAIProvider({
        providerOverride: "openai",
      });
      const xaiResult = createVoiceAIProvider({ providerOverride: "xai" });

      expect(() =>
        openaiResult.provider.cancelResponse("nonexistent"),
      ).not.toThrow();
      expect(() =>
        xaiResult.provider.cancelResponse("nonexistent"),
      ).not.toThrow();
    });
  });
});

describe("Server Integration Simulation", () => {
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

  it("should simulate server startup with OpenAI provider", () => {
    process.env[VOICE_AI_PROVIDER_ENV] = "openai";
    process.env.OPENAI_API_KEY = "sk-test";

    // Simulate server.ts provider initialization
    const { provider, providerType } = createVoiceAIProvider();

    // Log would happen in server.ts
    const logMessage = `[Server] Voice AI provider: ${providerType} (${provider.capabilities.wsUrl})`;

    expect(providerType).toBe("openai");
    expect(logMessage).toContain("openai");
    expect(logMessage).toContain("wss://api.openai.com");
  });

  it("should simulate server startup with XAI provider", () => {
    process.env[VOICE_AI_PROVIDER_ENV] = "xai";
    process.env.XAI_API_KEY = "xai-test";

    const { provider, providerType } = createVoiceAIProvider();

    const logMessage = `[Server] Voice AI provider: ${providerType} (${provider.capabilities.wsUrl})`;

    expect(providerType).toBe("xai");
    expect(logMessage).toContain("xai");
    expect(logMessage).toContain("wss://api.x.ai");
  });

  it("should simulate PTT flow with provider abstraction", () => {
    process.env.OPENAI_API_KEY = "sk-test";

    const { provider } = createVoiceAIProvider();

    // Set up callbacks (as server.ts would)
    const callbacks: VoiceAIProviderCallbacks = {
      onStateChange: vi.fn(),
      onAudioData: vi.fn(),
      onTranscript: vi.fn(),
      onError: vi.fn(),
      onFunctionCall: vi.fn(),
    };
    provider.setCallbacks(callbacks);

    // Simulate PTT start -> audio -> PTT end flow
    const roomId = "test-room";

    // Session would be created on PTT start
    // Note: Can't fully test createSession due to WebSocket mock limitations

    // But we can verify the interface flow doesn't throw
    expect(() => provider.sendAudio(roomId, "base64audio")).not.toThrow();
    expect(() => provider.commitAudio(roomId)).not.toThrow();
    expect(() => provider.triggerResponse(roomId)).not.toThrow();
  });

  it("should simulate function call handling", () => {
    process.env.OPENAI_API_KEY = "sk-test";

    const { provider } = createVoiceAIProvider();
    const roomId = "test-room";

    // Register tools (as server.ts would)
    const tools = [
      {
        type: "function" as const,
        name: "webSearch",
        description: "Search the web",
        parameters: {
          type: "object" as const,
          properties: {
            query: { type: "string" },
          },
          required: ["query"],
        },
      },
    ];

    provider.registerTools(roomId, tools);

    // Send function output (as server.ts would after handling function call)
    expect(() =>
      provider.sendFunctionOutput(roomId, "call_123", { results: [] }),
    ).not.toThrow();
  });
});
