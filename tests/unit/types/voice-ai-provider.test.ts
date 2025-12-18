/**
 * Voice AI Provider Types Tests
 *
 * Tests for voice AI provider type definitions, interfaces, and constants.
 * Part of the Long-Horizon Engineering Protocol - FEAT-1000
 */

import { describe, it, expect } from "vitest";
import {
  type VoiceAIProviderType,
  type OpenAIVoice,
  type XAIVoice,
  type VoiceOption,
  type VoiceMapping,
  type AIPersonality,
  type AudioFormat,
  type AudioConfig,
  type FunctionParameter,
  type FunctionToolDefinition,
  type FunctionCall,
  type AISessionState,
  type StateChangeEvent,
  type AudioDataEvent,
  type TranscriptEvent,
  type ErrorEvent,
  type VoiceAIProviderCallbacks,
  type VoiceAISessionConfig,
  type ProviderCapabilities,
  type IVoiceAIProvider,
  type ProviderSessionState,
  VOICE_AI_PROVIDER_ENV,
  DEFAULT_VOICE_AI_PROVIDER,
  VOICE_MAPPINGS,
  DEFAULT_AUDIO_CONFIG,
  OPENAI_CAPABILITIES,
  XAI_CAPABILITIES,
} from "@/types/voice-ai-provider";

describe("Voice AI Provider Types", () => {
  describe("VoiceAIProviderType", () => {
    it("should support openai and xai providers", () => {
      const providers: VoiceAIProviderType[] = ["openai", "xai"];
      expect(providers).toContain("openai");
      expect(providers).toContain("xai");
    });
  });

  describe("Environment Constants", () => {
    it("should have correct environment variable name", () => {
      expect(VOICE_AI_PROVIDER_ENV).toBe("VOICE_AI_PROVIDER");
    });

    it("should default to openai provider", () => {
      expect(DEFAULT_VOICE_AI_PROVIDER).toBe("openai");
    });
  });

  describe("OpenAI Voices", () => {
    it("should support all OpenAI voice options", () => {
      const voices: OpenAIVoice[] = [
        "alloy",
        "echo",
        "shimmer",
        "ash",
        "ballad",
        "coral",
        "sage",
        "verse",
        "marin",
      ];
      expect(voices).toHaveLength(9);
      expect(voices).toContain("marin");
      expect(voices).toContain("alloy");
    });
  });

  describe("XAI Voices", () => {
    it("should support all XAI Grok voice options", () => {
      const voices: XAIVoice[] = [
        "sal",
        "rex",
        "eve",
        "leo",
        "mika",
        "valentin",
        "ara",
      ];
      expect(voices).toHaveLength(7);
      expect(voices).toContain("ara");
      expect(voices).toContain("sal");
    });
  });

  describe("VOICE_MAPPINGS", () => {
    it("should have mappings for all personalities", () => {
      const personalities: AIPersonality[] = [
        "facilitator",
        "assistant",
        "expert",
        "brainstorm",
        "custom",
      ];

      personalities.forEach((personality) => {
        expect(VOICE_MAPPINGS[personality]).toBeDefined();
        expect(VOICE_MAPPINGS[personality].openai).toBeDefined();
        expect(VOICE_MAPPINGS[personality].xai).toBeDefined();
      });
    });

    it("should map facilitator to marin/ara", () => {
      expect(VOICE_MAPPINGS.facilitator.openai).toBe("marin");
      expect(VOICE_MAPPINGS.facilitator.xai).toBe("ara");
    });

    it("should map expert to marin/leo", () => {
      expect(VOICE_MAPPINGS.expert.openai).toBe("marin");
      expect(VOICE_MAPPINGS.expert.xai).toBe("leo");
    });

    it("should map brainstorm to sage/sal", () => {
      expect(VOICE_MAPPINGS.brainstorm.openai).toBe("sage");
      expect(VOICE_MAPPINGS.brainstorm.xai).toBe("sal");
    });
  });
});

describe("Audio Configuration", () => {
  describe("AudioFormat", () => {
    it("should support all audio formats", () => {
      const formats: AudioFormat[] = ["pcm16", "pcm", "g711_ulaw", "g711_alaw"];
      expect(formats).toHaveLength(4);
    });
  });

  describe("DEFAULT_AUDIO_CONFIG", () => {
    it("should have correct defaults", () => {
      expect(DEFAULT_AUDIO_CONFIG.inputFormat).toBe("pcm16");
      expect(DEFAULT_AUDIO_CONFIG.outputFormat).toBe("pcm16");
      expect(DEFAULT_AUDIO_CONFIG.sampleRate).toBe(24000);
    });
  });
});

describe("Function Tool Definitions", () => {
  describe("FunctionToolDefinition", () => {
    it("should support function tool structure", () => {
      const tool: FunctionToolDefinition = {
        type: "function",
        name: "webSearch",
        description: "Search the web for information",
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
            },
          },
          required: ["query"],
        },
      };

      expect(tool.type).toBe("function");
      expect(tool.name).toBe("webSearch");
      expect(tool.parameters.properties.query).toBeDefined();
      expect(tool.parameters.required).toContain("query");
    });
  });

  describe("FunctionCall", () => {
    it("should have all required properties", () => {
      const call: FunctionCall = {
        name: "webSearch",
        callId: "call_123",
        arguments: { query: "test", searchType: "web" },
        rawArguments: '{"query":"test","searchType":"web"}',
      };

      expect(call.name).toBe("webSearch");
      expect(call.callId).toBe("call_123");
      expect(call.arguments.query).toBe("test");
    });
  });
});

describe("Session State", () => {
  describe("AISessionState", () => {
    it("should support all session states", () => {
      const states: AISessionState[] = [
        "idle",
        "listening",
        "processing",
        "speaking",
      ];
      expect(states).toHaveLength(4);
    });
  });
});

describe("Provider Events", () => {
  describe("StateChangeEvent", () => {
    it("should have all required properties", () => {
      const event: StateChangeEvent = {
        roomId: "room-123",
        state: "speaking",
        activeSpeakerId: "user-456",
        activeSpeakerName: "John",
      };

      expect(event.roomId).toBe("room-123");
      expect(event.state).toBe("speaking");
      expect(event.activeSpeakerId).toBe("user-456");
    });
  });

  describe("AudioDataEvent", () => {
    it("should have roomId and audio data", () => {
      const event: AudioDataEvent = {
        roomId: "room-123",
        audioBase64: "SGVsbG8gV29ybGQ=",
      };

      expect(event.roomId).toBe("room-123");
      expect(event.audioBase64).toBe("SGVsbG8gV29ybGQ=");
    });
  });

  describe("TranscriptEvent", () => {
    it("should support user input transcripts", () => {
      const event: TranscriptEvent = {
        roomId: "room-123",
        text: "Hello, what is the weather?",
        isFinal: true,
        speakerId: "user-456",
        speakerName: "John",
        isUserInput: true,
      };

      expect(event.isUserInput).toBe(true);
      expect(event.isFinal).toBe(true);
    });

    it("should support AI response transcripts", () => {
      const event: TranscriptEvent = {
        roomId: "room-123",
        text: "The weather is sunny today.",
        isFinal: true,
        isUserInput: false,
      };

      expect(event.isUserInput).toBe(false);
    });
  });

  describe("ErrorEvent", () => {
    it("should have error message and optional code", () => {
      const event: ErrorEvent = {
        roomId: "room-123",
        error: "Connection failed",
        code: "CONNECTION_ERROR",
      };

      expect(event.error).toBe("Connection failed");
      expect(event.code).toBe("CONNECTION_ERROR");
    });
  });

  describe("VoiceAIProviderCallbacks", () => {
    it("should support all callback types", () => {
      const callbacks: VoiceAIProviderCallbacks = {
        onStateChange: () => {},
        onAudioData: () => {},
        onAudioDone: () => {},
        onTranscript: () => {},
        onError: () => {},
        onReady: () => {},
        onClose: () => {},
        onFunctionCall: () => {},
      };

      expect(callbacks.onStateChange).toBeDefined();
      expect(callbacks.onFunctionCall).toBeDefined();
    });
  });
});

describe("Session Configuration", () => {
  describe("VoiceAISessionConfig", () => {
    it("should have all required and optional properties", () => {
      const config: VoiceAISessionConfig = {
        roomId: "room-123",
        personality: "expert",
        topic: "Machine Learning",
        customInstructions: undefined,
        speakerName: "John",
        audio: {
          inputFormat: "pcm16",
          sampleRate: 24000,
        },
        temperature: 0.7,
        tools: [
          {
            type: "function",
            name: "webSearch",
            description: "Search the web",
            parameters: {
              type: "object",
              properties: {},
            },
          },
        ],
      };

      expect(config.roomId).toBe("room-123");
      expect(config.personality).toBe("expert");
      expect(config.topic).toBe("Machine Learning");
      expect(config.tools).toHaveLength(1);
    });

    it("should work with minimal config", () => {
      const minimalConfig: VoiceAISessionConfig = {
        roomId: "room-456",
        personality: "assistant",
      };

      expect(minimalConfig.roomId).toBe("room-456");
      expect(minimalConfig.topic).toBeUndefined();
    });
  });
});

describe("Provider Capabilities", () => {
  describe("OPENAI_CAPABILITIES", () => {
    it("should have correct provider type", () => {
      expect(OPENAI_CAPABILITIES.provider).toBe("openai");
    });

    it("should list all OpenAI voices", () => {
      expect(OPENAI_CAPABILITIES.voices).toContain("marin");
      expect(OPENAI_CAPABILITIES.voices).toContain("alloy");
      expect(OPENAI_CAPABILITIES.voices).toHaveLength(9);
    });

    it("should list supported audio formats", () => {
      expect(OPENAI_CAPABILITIES.audioFormats).toContain("pcm16");
      expect(OPENAI_CAPABILITIES.audioFormats).toContain("g711_ulaw");
    });

    it("should have correct WebSocket URL", () => {
      expect(OPENAI_CAPABILITIES.wsUrl).toBe(
        "wss://api.openai.com/v1/realtime",
      );
    });

    it("should have correct model", () => {
      expect(OPENAI_CAPABILITIES.model).toBe(
        "gpt-4o-realtime-preview-2024-12-17",
      );
    });

    it("should not have built-in search features", () => {
      expect(OPENAI_CAPABILITIES.hasBuiltInWebSearch).toBe(false);
      expect(OPENAI_CAPABILITIES.hasBuiltInXSearch).toBe(false);
      expect(OPENAI_CAPABILITIES.hasBuiltInFileSearch).toBe(false);
    });

    it("should support custom functions", () => {
      expect(OPENAI_CAPABILITIES.hasCustomFunctions).toBe(true);
    });

    it("should require transcription configuration", () => {
      expect(OPENAI_CAPABILITIES.autoInputTranscription).toBe(false);
    });
  });

  describe("XAI_CAPABILITIES", () => {
    it("should have correct provider type", () => {
      expect(XAI_CAPABILITIES.provider).toBe("xai");
    });

    it("should list all XAI voices", () => {
      expect(XAI_CAPABILITIES.voices).toContain("ara");
      expect(XAI_CAPABILITIES.voices).toContain("sal");
      expect(XAI_CAPABILITIES.voices).toHaveLength(7);
    });

    it("should list supported audio formats including pcm", () => {
      expect(XAI_CAPABILITIES.audioFormats).toContain("pcm16");
      expect(XAI_CAPABILITIES.audioFormats).toContain("pcm");
    });

    it("should support multiple sample rates", () => {
      expect(XAI_CAPABILITIES.sampleRates).toContain(24000);
      expect(XAI_CAPABILITIES.sampleRates).toContain(16000);
      expect(XAI_CAPABILITIES.sampleRates).toContain(48000);
    });

    it("should have correct WebSocket URL", () => {
      expect(XAI_CAPABILITIES.wsUrl).toBe("wss://api.x.ai/v1/realtime");
    });

    it("should have built-in search features (but we dont use them)", () => {
      // XAI has these but we use Serper instead
      expect(XAI_CAPABILITIES.hasBuiltInWebSearch).toBe(true);
      expect(XAI_CAPABILITIES.hasBuiltInXSearch).toBe(true);
      expect(XAI_CAPABILITIES.hasBuiltInFileSearch).toBe(true);
    });

    it("should support custom functions", () => {
      expect(XAI_CAPABILITIES.hasCustomFunctions).toBe(true);
    });

    it("should have automatic input transcription", () => {
      expect(XAI_CAPABILITIES.autoInputTranscription).toBe(true);
    });
  });
});

describe("IVoiceAIProvider Interface", () => {
  it("should define all required methods", () => {
    // This test validates the interface structure by creating a mock
    const mockProvider: IVoiceAIProvider = {
      providerType: "openai",
      capabilities: OPENAI_CAPABILITIES,
      setCallbacks: () => {},
      createSession: async () => {},
      closeSession: async () => {},
      isSessionConnected: () => false,
      getSessionState: () => null,
      updateSession: async () => {},
      sendAudio: () => {},
      commitAudio: () => {},
      triggerResponse: () => {},
      cancelResponse: () => {},
      sendFunctionOutput: () => {},
      injectContext: () => {},
      setActiveSpeaker: () => {},
      setInterrupted: () => {},
      getVoice: () => "marin",
      getTemperature: () => 0.7,
    };

    expect(mockProvider.providerType).toBe("openai");
    expect(typeof mockProvider.createSession).toBe("function");
    expect(typeof mockProvider.sendAudio).toBe("function");
    expect(typeof mockProvider.triggerResponse).toBe("function");
    expect(typeof mockProvider.sendFunctionOutput).toBe("function");
  });
});

describe("ProviderSessionState", () => {
  it("should have all session tracking properties", () => {
    const sessionState: ProviderSessionState = {
      roomId: "room-123",
      state: "idle",
      activeSpeakerId: null,
      activeSpeakerName: null,
      isConnecting: false,
      isConnected: true,
      personality: "assistant",
      topic: "Technology",
      customInstructions: undefined,
      isInterrupted: false,
      expectedResponseId: null,
      lastSpeakerId: "user-456",
      lastSpeakerName: "John",
    };

    expect(sessionState.roomId).toBe("room-123");
    expect(sessionState.state).toBe("idle");
    expect(sessionState.isConnected).toBe(true);
    expect(sessionState.personality).toBe("assistant");
  });
});
