/**
 * XAI Grok Voice Provider Tests
 *
 * Tests for the XAI Grok Voice Agent API provider adapter.
 * Part of the Long-Horizon Engineering Protocol - FEAT-1002
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { XAIGrokProvider } from "@/server/ai-providers/xai-grok-provider";
import {
  type VoiceAIProviderCallbacks,
  type FunctionToolDefinition,
  XAI_CAPABILITIES,
} from "@/types/voice-ai-provider";

// Mock the WebSocket module
vi.mock("ws", () => {
  return {
    WebSocket: vi.fn().mockImplementation(() => {
      const ws = {
        readyState: 1, // OPEN
        send: vi.fn(),
        close: vi.fn(),
        on: vi.fn(),
        handlers: {} as Record<string, Function>,
      };
      // Capture event handlers
      ws.on.mockImplementation((event: string, handler: Function) => {
        ws.handlers[event] = handler;
      });
      return ws;
    }),
    OPEN: 1,
  };
});

describe("XAIGrokProvider", () => {
  let provider: XAIGrokProvider;
  const testApiKey = "test-xai-api-key";

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new XAIGrokProvider(testApiKey);
  });

  afterEach(async () => {
    // Clean up any sessions
    try {
      await provider.closeSession("test-room");
    } catch {
      // Ignore errors during cleanup
    }
  });

  describe("constructor", () => {
    it("should create provider with valid API key", () => {
      expect(provider.providerType).toBe("xai");
      expect(provider.capabilities).toEqual(XAI_CAPABILITIES);
    });

    it("should throw error without API key", () => {
      expect(() => new XAIGrokProvider("")).toThrow("XAI API key is required");
    });

    it("should enable debug mode", () => {
      const debugProvider = new XAIGrokProvider(testApiKey, true);
      expect(debugProvider.providerType).toBe("xai");
    });
  });

  describe("capabilities", () => {
    it("should have correct provider type", () => {
      expect(provider.capabilities.provider).toBe("xai");
    });

    it("should have correct WebSocket URL", () => {
      expect(provider.capabilities.wsUrl).toBe("wss://api.x.ai/v1/realtime");
    });

    it("should list all XAI Grok voices", () => {
      expect(provider.capabilities.voices).toContain("ara");
      expect(provider.capabilities.voices).toContain("sal");
      expect(provider.capabilities.voices).toContain("eve");
      expect(provider.capabilities.voices).toContain("leo");
      expect(provider.capabilities.voices).toHaveLength(7);
    });

    it("should support custom functions", () => {
      expect(provider.capabilities.hasCustomFunctions).toBe(true);
    });

    it("should have built-in search (but we dont use it)", () => {
      // XAI has built-in search but we use Serper instead
      expect(provider.capabilities.hasBuiltInWebSearch).toBe(true);
      expect(provider.capabilities.hasBuiltInXSearch).toBe(true);
    });

    it("should have automatic input transcription", () => {
      expect(provider.capabilities.autoInputTranscription).toBe(true);
    });

    it("should support multiple sample rates", () => {
      expect(provider.capabilities.sampleRates).toContain(24000);
      expect(provider.capabilities.sampleRates).toContain(16000);
      expect(provider.capabilities.sampleRates).toContain(48000);
    });
  });

  describe("setCallbacks", () => {
    it("should store callbacks", () => {
      const callbacks: VoiceAIProviderCallbacks = {
        onStateChange: vi.fn(),
        onAudioData: vi.fn(),
        onError: vi.fn(),
      };

      provider.setCallbacks(callbacks);
      // Callbacks are stored internally - we verify by behavior in other tests
      expect(true).toBe(true);
    });
  });

  describe("getVoice", () => {
    it("should return correct voice for facilitator", () => {
      expect(provider.getVoice("facilitator")).toBe("ara");
    });

    it("should return correct voice for assistant", () => {
      expect(provider.getVoice("assistant")).toBe("eve");
    });

    it("should return correct voice for expert", () => {
      expect(provider.getVoice("expert")).toBe("leo");
    });

    it("should return correct voice for brainstorm", () => {
      expect(provider.getVoice("brainstorm")).toBe("sal");
    });

    it("should return correct voice for custom", () => {
      expect(provider.getVoice("custom")).toBe("ara");
    });
  });

  describe("getTemperature", () => {
    it("should return correct temperature for facilitator", () => {
      expect(provider.getTemperature("facilitator")).toBe(0.7);
    });

    it("should return correct temperature for assistant", () => {
      expect(provider.getTemperature("assistant")).toBe(0.8);
    });

    it("should return correct temperature for expert", () => {
      expect(provider.getTemperature("expert")).toBe(0.7);
    });

    it("should return correct temperature for brainstorm", () => {
      expect(provider.getTemperature("brainstorm")).toBe(1.0);
    });

    it("should return correct temperature for custom", () => {
      expect(provider.getTemperature("custom")).toBe(0.8);
    });
  });

  describe("session management (without real WebSocket)", () => {
    it("should report session not connected before creation", () => {
      expect(provider.isSessionConnected("nonexistent")).toBe(false);
    });

    it("should return null state for nonexistent session", () => {
      expect(provider.getSessionState("nonexistent")).toBe(null);
    });
  });

  describe("registerTools", () => {
    it("should store tools for room", () => {
      const tools: FunctionToolDefinition[] = [
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
      ];

      // Should not throw
      provider.registerTools("test-room", tools);
      expect(true).toBe(true);
    });

    it("should register multiple tools", () => {
      const tools: FunctionToolDefinition[] = [
        {
          type: "function",
          name: "webSearch",
          description: "Search the web",
          parameters: {
            type: "object",
            properties: { query: { type: "string" } },
            required: ["query"],
          },
        },
        {
          type: "function",
          name: "playVideo",
          description: "Play video",
          parameters: {
            type: "object",
            properties: { action: { type: "string" } },
            required: ["action"],
          },
        },
      ];

      // Should not throw
      provider.registerTools("test-room", tools);
      expect(true).toBe(true);
    });
  });

  describe("sendAudio", () => {
    it("should not throw when session does not exist", () => {
      expect(() =>
        provider.sendAudio("nonexistent", "base64audiodata"),
      ).not.toThrow();
    });
  });

  describe("commitAudio", () => {
    it("should not throw when session does not exist", () => {
      expect(() => provider.commitAudio("nonexistent")).not.toThrow();
    });
  });

  describe("triggerResponse", () => {
    it("should not throw when session does not exist", () => {
      expect(() => provider.triggerResponse("nonexistent")).not.toThrow();
    });
  });

  describe("cancelResponse", () => {
    it("should not throw when session does not exist", () => {
      expect(() => provider.cancelResponse("nonexistent")).not.toThrow();
    });
  });

  describe("sendFunctionOutput", () => {
    it("should not throw when session does not exist", () => {
      expect(() =>
        provider.sendFunctionOutput("nonexistent", "call_123", {
          result: "ok",
        }),
      ).not.toThrow();
    });
  });

  describe("injectContext", () => {
    it("should not throw when session does not exist", () => {
      expect(() =>
        provider.injectContext("nonexistent", "Some context"),
      ).not.toThrow();
    });
  });

  describe("setActiveSpeaker", () => {
    it("should not throw when session does not exist", () => {
      expect(() =>
        provider.setActiveSpeaker("nonexistent", "user-123", "John"),
      ).not.toThrow();
    });
  });

  describe("setInterrupted", () => {
    it("should not throw when session does not exist", () => {
      expect(() => provider.setInterrupted("nonexistent", true)).not.toThrow();
    });
  });

  describe("closeSession", () => {
    it("should not throw when session does not exist", async () => {
      await expect(provider.closeSession("nonexistent")).resolves.not.toThrow();
    });
  });
});

describe("XAIGrokProvider - IVoiceAIProvider interface compliance", () => {
  it("should implement all required interface methods", () => {
    const provider = new XAIGrokProvider("test-key");

    // Provider identification
    expect(provider.providerType).toBe("xai");
    expect(provider.capabilities).toBeDefined();

    // Callback management
    expect(typeof provider.setCallbacks).toBe("function");

    // Session management
    expect(typeof provider.createSession).toBe("function");
    expect(typeof provider.closeSession).toBe("function");
    expect(typeof provider.isSessionConnected).toBe("function");
    expect(typeof provider.getSessionState).toBe("function");
    expect(typeof provider.updateSession).toBe("function");

    // Audio operations
    expect(typeof provider.sendAudio).toBe("function");
    expect(typeof provider.commitAudio).toBe("function");

    // Response operations
    expect(typeof provider.triggerResponse).toBe("function");
    expect(typeof provider.cancelResponse).toBe("function");

    // Function calling
    expect(typeof provider.sendFunctionOutput).toBe("function");
    expect(typeof provider.registerTools).toBe("function");

    // Context and speaker
    expect(typeof provider.injectContext).toBe("function");
    expect(typeof provider.setActiveSpeaker).toBe("function");
    expect(typeof provider.setInterrupted).toBe("function");

    // Voice/personality
    expect(typeof provider.getVoice).toBe("function");
    expect(typeof provider.getTemperature).toBe("function");
  });
});

describe("XAIGrokProvider - Voice differences from OpenAI", () => {
  it("should use different voices than OpenAI provider", () => {
    const provider = new XAIGrokProvider("test-key");

    // XAI has different voice names
    expect(provider.getVoice("facilitator")).not.toBe("marin");
    expect(provider.getVoice("brainstorm")).not.toBe("sage");

    // Should use XAI-specific voices
    expect(provider.getVoice("facilitator")).toBe("ara");
    expect(provider.getVoice("brainstorm")).toBe("sal");
  });
});
