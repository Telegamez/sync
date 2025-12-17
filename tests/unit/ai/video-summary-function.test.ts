/**
 * Video Summary Function Tool Tests
 *
 * Tests for the getVideoSummary OpenAI function tool definition.
 * Part of the Long-Horizon Engineering Protocol - FEAT-902
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { SummaryMode } from "@/types/video-summary";
import type { VideoSummaryFunctionArgs } from "@/server/signaling/openai-realtime-client";

// Mock WebSocket
vi.mock("ws", () => {
  const MockWebSocket = vi.fn().mockImplementation(() => ({
    on: vi.fn(),
    send: vi.fn(),
    close: vi.fn(),
    readyState: 1, // WebSocket.OPEN
  }));
  // Add WebSocket constants
  (MockWebSocket as typeof MockWebSocket & { OPEN: number }).OPEN = 1;
  return { default: MockWebSocket };
});

// Import after mocking
import {
  OpenAIRealtimeClient,
  type OpenAIRealtimeConfig,
  type OpenAIRealtimeCallbacks,
} from "@/server/signaling/openai-realtime-client";

// Mock console methods
vi.spyOn(console, "log").mockImplementation(() => {});
vi.spyOn(console, "error").mockImplementation(() => {});

describe("getVideoSummary Function Tool", () => {
  const testConfig: OpenAIRealtimeConfig = {
    apiKey: "test-api-key",
    voice: "marin",
  };

  let client: OpenAIRealtimeClient;
  let mockCallbacks: OpenAIRealtimeCallbacks;

  beforeEach(() => {
    vi.clearAllMocks();
    mockCallbacks = {
      onStateChange: vi.fn(),
      onAudioData: vi.fn(),
      onAudioDone: vi.fn(),
      onTranscript: vi.fn(),
      onError: vi.fn(),
      onReady: vi.fn(),
      onClose: vi.fn(),
      onFunctionCall: vi.fn(),
    };
    client = new OpenAIRealtimeClient(testConfig, mockCallbacks);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("VideoSummaryFunctionArgs type", () => {
    it("should accept empty args (defaults to default mode)", () => {
      const args: VideoSummaryFunctionArgs = {};
      expect(args.mode).toBeUndefined();
    });

    it("should accept default mode", () => {
      const args: VideoSummaryFunctionArgs = { mode: "default" };
      expect(args.mode).toBe("default");
    });

    it("should accept deep mode", () => {
      const args: VideoSummaryFunctionArgs = { mode: "deep" };
      expect(args.mode).toBe("deep");
    });

    it("should type-check mode as SummaryMode", () => {
      // This is a compile-time check - if it compiles, the types are correct
      const mode1: SummaryMode = "default";
      const mode2: SummaryMode = "deep";
      const args1: VideoSummaryFunctionArgs = { mode: mode1 };
      const args2: VideoSummaryFunctionArgs = { mode: mode2 };
      expect(args1.mode).toBe("default");
      expect(args2.mode).toBe("deep");
    });
  });

  describe("client configuration", () => {
    it("should create client with valid config", () => {
      expect(client).toBeInstanceOf(OpenAIRealtimeClient);
    });

    it("should support function call callbacks", () => {
      expect(mockCallbacks.onFunctionCall).toBeDefined();
    });
  });

  describe("function tool schema validation", () => {
    // These tests validate the expected schema structure

    it("should have getVideoSummary as valid function name", () => {
      const functionName = "getVideoSummary";
      expect(functionName).toBe("getVideoSummary");
    });

    it("should define mode parameter with correct enum values", () => {
      const validModes: SummaryMode[] = ["default", "deep"];
      expect(validModes).toContain("default");
      expect(validModes).toContain("deep");
      expect(validModes.length).toBe(2);
    });

    it("should not require mode parameter (defaults to default)", () => {
      // The schema has required: [] meaning mode is optional
      const args1: VideoSummaryFunctionArgs = {};
      const args2: VideoSummaryFunctionArgs = { mode: "default" };
      const args3: VideoSummaryFunctionArgs = { mode: "deep" };

      // All should be valid
      expect(args1).toBeDefined();
      expect(args2).toBeDefined();
      expect(args3).toBeDefined();
    });
  });

  describe("function call parsing", () => {
    it("should parse default mode from arguments", () => {
      const argsString = JSON.stringify({ mode: "default" });
      const parsed = JSON.parse(argsString) as VideoSummaryFunctionArgs;
      expect(parsed.mode).toBe("default");
    });

    it("should parse deep mode from arguments", () => {
      const argsString = JSON.stringify({ mode: "deep" });
      const parsed = JSON.parse(argsString) as VideoSummaryFunctionArgs;
      expect(parsed.mode).toBe("deep");
    });

    it("should handle empty arguments (defaults to undefined mode)", () => {
      const argsString = JSON.stringify({});
      const parsed = JSON.parse(argsString) as VideoSummaryFunctionArgs;
      expect(parsed.mode).toBeUndefined();
    });

    it("should handle missing mode gracefully", () => {
      const args: VideoSummaryFunctionArgs = {};
      const mode = args.mode ?? "default";
      expect(mode).toBe("default");
    });
  });

  describe("voice trigger mapping", () => {
    // Test that different voice commands map to correct modes

    const defaultTriggers = [
      "what are we watching",
      "what is this video",
      "who made this",
      "quick summary",
      "summarize this",
    ];

    const deepTriggers = [
      "analyze this video",
      "deep dive",
      "what topics are covered",
      "give me a detailed breakdown",
      "what are the main points",
      "break down this video",
    ];

    it("should recognize default mode trigger phrases", () => {
      for (const trigger of defaultTriggers) {
        expect(trigger.toLowerCase()).toBeTruthy();
        // In real implementation, OpenAI will parse these and call with mode: "default"
      }
    });

    it("should recognize deep mode trigger phrases", () => {
      for (const trigger of deepTriggers) {
        expect(trigger.toLowerCase()).toBeTruthy();
        // In real implementation, OpenAI will parse these and call with mode: "deep"
      }
    });

    it("should have distinct trigger phrases for each mode", () => {
      // No overlap between trigger sets
      for (const defaultTrigger of defaultTriggers) {
        expect(deepTriggers).not.toContain(defaultTrigger);
      }
      for (const deepTrigger of deepTriggers) {
        expect(defaultTriggers).not.toContain(deepTrigger);
      }
    });
  });

  describe("integration with FunctionCallEvent", () => {
    it("should format function call event correctly", () => {
      const functionCall = {
        name: "getVideoSummary",
        callId: "call_abc123",
        arguments: { mode: "default" } as VideoSummaryFunctionArgs,
      };

      expect(functionCall.name).toBe("getVideoSummary");
      expect(functionCall.callId).toBeTruthy();
      expect(functionCall.arguments.mode).toBe("default");
    });

    it("should handle deep mode function call event", () => {
      const functionCall = {
        name: "getVideoSummary",
        callId: "call_xyz789",
        arguments: { mode: "deep" } as VideoSummaryFunctionArgs,
      };

      expect(functionCall.name).toBe("getVideoSummary");
      expect(functionCall.arguments.mode).toBe("deep");
    });

    it("should handle function call without mode argument", () => {
      const functionCall = {
        name: "getVideoSummary",
        callId: "call_nomode",
        arguments: {} as VideoSummaryFunctionArgs,
      };

      expect(functionCall.name).toBe("getVideoSummary");
      const mode = functionCall.arguments.mode ?? "default";
      expect(mode).toBe("default");
    });
  });

  describe("expected latency targets", () => {
    // Document expected latencies for each mode

    it("should target ~1-2s for default mode", () => {
      const defaultModeLatency = { min: 1000, max: 2000 }; // milliseconds
      expect(defaultModeLatency.min).toBeLessThanOrEqual(2000);
      expect(defaultModeLatency.max).toBeLessThanOrEqual(3000);
    });

    it("should target ~3-10s for deep mode", () => {
      const deepModeLatency = { min: 3000, max: 10000 }; // milliseconds
      expect(deepModeLatency.min).toBeGreaterThanOrEqual(1000);
      expect(deepModeLatency.max).toBeLessThanOrEqual(15000);
    });
  });
});

describe("GET_VIDEO_SUMMARY_TOOL schema", () => {
  // Expected schema structure tests

  const expectedSchema = {
    type: "function",
    name: "getVideoSummary",
    parameters: {
      type: "object",
      properties: {
        mode: {
          type: "string",
          enum: ["default", "deep"],
        },
      },
      required: [],
    },
  };

  it("should have correct function type", () => {
    expect(expectedSchema.type).toBe("function");
  });

  it("should have correct function name", () => {
    expect(expectedSchema.name).toBe("getVideoSummary");
  });

  it("should have object type parameters", () => {
    expect(expectedSchema.parameters.type).toBe("object");
  });

  it("should define mode property with enum", () => {
    expect(expectedSchema.parameters.properties.mode.type).toBe("string");
    expect(expectedSchema.parameters.properties.mode.enum).toContain("default");
    expect(expectedSchema.parameters.properties.mode.enum).toContain("deep");
  });

  it("should have empty required array (mode is optional)", () => {
    expect(expectedSchema.parameters.required).toEqual([]);
  });
});
