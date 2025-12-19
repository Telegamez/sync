/**
 * Voice AI Provider Types
 *
 * Type definitions for the multi-provider voice AI architecture.
 * Supports switching between OpenAI Realtime API and XAI Grok Voice API
 * based on environment configuration.
 *
 * NOTE: This abstraction only applies to the real-time voice-to-voice AI model.
 * Other OpenAI services (transcription, summaries, text inference) remain unchanged.
 *
 * Part of the Long-Horizon Engineering Protocol - FEAT-1000
 */

import type { AIPersonality } from "./room";

// Re-export AIPersonality for convenience
export type { AIPersonality };

// ============================================================
// PROVIDER IDENTIFICATION
// ============================================================

/**
 * Supported voice AI providers for real-time speech-to-speech
 * - openai: OpenAI Realtime API (gpt-4o-realtime-preview)
 * - xai: XAI Grok Voice Agent API
 */
export type VoiceAIProviderType = "openai" | "xai";

/**
 * Environment variable name for provider selection
 */
export const VOICE_AI_PROVIDER_ENV = "VOICE_AI_PROVIDER";

/**
 * Default provider if not specified
 */
export const DEFAULT_VOICE_AI_PROVIDER: VoiceAIProviderType = "openai";

// ============================================================
// VOICE OPTIONS
// ============================================================

/**
 * OpenAI voice options for Realtime API
 */
export type OpenAIVoice =
  | "alloy"
  | "echo"
  | "shimmer"
  | "ash"
  | "ballad"
  | "coral"
  | "sage"
  | "verse"
  | "marin";

/**
 * XAI Grok voice options
 */
export type XAIVoice =
  | "sal"
  | "rex"
  | "eve"
  | "leo"
  | "mika"
  | "valentin"
  | "ara";

/**
 * Union of all voice options
 */
export type VoiceOption = OpenAIVoice | XAIVoice;

/**
 * Voice metadata for display and preview
 */
export interface VoiceInfo {
  /** Voice ID used in API calls */
  id: VoiceOption;
  /** Human-friendly display name */
  name: string;
  /** Description of voice characteristics */
  description: string;
  /** Gender/style indicator */
  style: "feminine" | "masculine" | "neutral";
  /** Preview audio URL (if available) */
  previewUrl?: string;
}

/**
 * OpenAI voice metadata
 */
export const OPENAI_VOICES: VoiceInfo[] = [
  {
    id: "marin",
    name: "Marin",
    description: "Warm and friendly, great for conversations",
    style: "feminine",
  },
  {
    id: "alloy",
    name: "Alloy",
    description: "Neutral and balanced, versatile for any context",
    style: "neutral",
  },
  {
    id: "echo",
    name: "Echo",
    description: "Clear and professional, ideal for explanations",
    style: "masculine",
  },
  {
    id: "shimmer",
    name: "Shimmer",
    description: "Bright and expressive, engaging delivery",
    style: "feminine",
  },
  {
    id: "ash",
    name: "Ash",
    description: "Calm and measured, thoughtful tone",
    style: "neutral",
  },
  {
    id: "ballad",
    name: "Ballad",
    description: "Soft and melodic, soothing presence",
    style: "feminine",
  },
  {
    id: "coral",
    name: "Coral",
    description: "Energetic and dynamic, enthusiastic delivery",
    style: "feminine",
  },
  {
    id: "sage",
    name: "Sage",
    description: "Wise and contemplative, perfect for brainstorming",
    style: "neutral",
  },
  {
    id: "verse",
    name: "Verse",
    description: "Articulate and refined, elegant speech",
    style: "masculine",
  },
];

/**
 * XAI Grok voice metadata
 */
export const XAI_VOICES: VoiceInfo[] = [
  {
    id: "ara",
    name: "Ara",
    description: "Default voice, balanced and conversational",
    style: "feminine",
  },
  {
    id: "eve",
    name: "Eve",
    description: "Engaging and enthusiastic, great for interactive experiences",
    style: "feminine",
  },
  {
    id: "leo",
    name: "Leo",
    description: "Decisive and commanding, suitable for instructional content",
    style: "masculine",
  },
  {
    id: "sal",
    name: "Sal",
    description: "Versatile voice suitable for various contexts",
    style: "neutral",
  },
  {
    id: "rex",
    name: "Rex",
    description: "Professional and articulate, ideal for business applications",
    style: "masculine",
  },
  {
    id: "mika",
    name: "Mika",
    description: "Gentle and supportive, empathetic tone",
    style: "feminine",
  },
  {
    id: "valentin",
    name: "Valentin",
    description: "Sophisticated and charming, refined delivery",
    style: "masculine",
  },
];

/**
 * Get voices for a specific provider
 */
export function getVoicesForProvider(
  provider: VoiceAIProviderType,
): VoiceInfo[] {
  return provider === "openai" ? OPENAI_VOICES : XAI_VOICES;
}

/**
 * Mapping from abstract voice names to provider-specific voices
 */
export interface VoiceMapping {
  openai: OpenAIVoice;
  xai: XAIVoice;
}

/**
 * Default voice mappings for personality types
 * Maps our personality voices to equivalent voices on each provider
 */
export const VOICE_MAPPINGS: Record<AIPersonality, VoiceMapping> = {
  // Warm, friendly facilitator
  facilitator: { openai: "marin", xai: "ara" },
  // Helpful assistant
  assistant: { openai: "marin", xai: "eve" },
  // Technical expert
  expert: { openai: "marin", xai: "leo" },
  // Creative brainstorm
  brainstorm: { openai: "sage", xai: "sal" },
  // Custom (uses default)
  custom: { openai: "marin", xai: "ara" },
};

// ============================================================
// AUDIO FORMAT
// ============================================================

/**
 * Supported audio formats for both providers
 */
export type AudioFormat = "pcm16" | "pcm" | "g711_ulaw" | "g711_alaw";

/**
 * Audio configuration
 */
export interface AudioConfig {
  /** Input audio format */
  inputFormat: AudioFormat;
  /** Output audio format */
  outputFormat: AudioFormat;
  /** Sample rate in Hz (default: 24000) */
  sampleRate: number;
}

/**
 * Default audio configuration (works for both providers)
 */
export const DEFAULT_AUDIO_CONFIG: AudioConfig = {
  inputFormat: "pcm16",
  outputFormat: "pcm16",
  sampleRate: 24000,
};

// ============================================================
// FUNCTION/TOOL CALLING
// ============================================================

/**
 * Function parameter definition
 */
export interface FunctionParameter {
  type: string;
  description?: string;
  enum?: string[];
}

/**
 * Function tool definition (compatible with both providers)
 */
export interface FunctionToolDefinition {
  /** Tool type (always "function") */
  type: "function";
  /** Function name */
  name: string;
  /** Function description */
  description: string;
  /** Parameter schema */
  parameters: {
    type: "object";
    properties: Record<string, FunctionParameter>;
    required?: string[];
  };
}

/**
 * Function call from AI
 */
export interface FunctionCall {
  /** Function name */
  name: string;
  /** Call ID for response */
  callId: string;
  /** Parsed arguments */
  arguments: Record<string, unknown>;
  /** Raw arguments string */
  rawArguments: string;
}

// ============================================================
// SESSION STATE
// ============================================================

/**
 * AI session state
 */
export type AISessionState = "idle" | "listening" | "processing" | "speaking";

// ============================================================
// PROVIDER EVENTS / CALLBACKS
// ============================================================

/**
 * State change event
 */
export interface StateChangeEvent {
  roomId: string;
  state: AISessionState;
  activeSpeakerId?: string | null;
  activeSpeakerName?: string | null;
}

/**
 * Audio data event
 */
export interface AudioDataEvent {
  roomId: string;
  /** Base64 encoded audio data */
  audioBase64: string;
}

/**
 * Transcript event
 */
export interface TranscriptEvent {
  roomId: string;
  /** Transcribed text */
  text: string;
  /** Whether this is the final transcript */
  isFinal: boolean;
  /** Speaker ID if known */
  speakerId?: string;
  /** Speaker name if known */
  speakerName?: string;
  /** Whether this is user input or AI response */
  isUserInput: boolean;
}

/**
 * Error event
 */
export interface ErrorEvent {
  roomId: string;
  error: string;
  code?: string;
}

/**
 * Provider event callbacks
 */
export interface VoiceAIProviderCallbacks {
  /** Called when AI state changes */
  onStateChange?: (event: StateChangeEvent) => void;
  /** Called when audio data is received from AI */
  onAudioData?: (event: AudioDataEvent) => void;
  /** Called when audio stream is complete */
  onAudioDone?: (roomId: string) => void;
  /** Called when transcript is available */
  onTranscript?: (event: TranscriptEvent) => void;
  /** Called when error occurs */
  onError?: (event: ErrorEvent) => void;
  /** Called when session is ready */
  onReady?: (roomId: string) => void;
  /** Called when session is closed */
  onClose?: (roomId: string) => void;
  /** Called when function call is received */
  onFunctionCall?: (roomId: string, functionCall: FunctionCall) => void;
}

// ============================================================
// SESSION CONFIGURATION
// ============================================================

/**
 * Session configuration for voice AI
 */
export interface VoiceAISessionConfig {
  /** Room ID */
  roomId: string;
  /** AI personality */
  personality: AIPersonality;
  /** Voice override - use this voice instead of personality default (FEAT-1007) */
  voiceOverride?: string;
  /** Topic/domain expertise */
  topic?: string;
  /** Custom instructions (for custom personality) */
  customInstructions?: string;
  /** Initial speaker name */
  speakerName?: string;
  /** Audio configuration */
  audio?: Partial<AudioConfig>;
  /** Temperature (0-2) */
  temperature?: number;
  /** Function tools to register */
  tools?: FunctionToolDefinition[];
}

// ============================================================
// PROVIDER CAPABILITIES
// ============================================================

/**
 * Provider capabilities
 */
export interface ProviderCapabilities {
  /** Provider type */
  provider: VoiceAIProviderType;
  /** Available voices */
  voices: readonly string[];
  /** Supported audio formats */
  audioFormats: readonly AudioFormat[];
  /** Supported sample rates */
  sampleRates: readonly number[];
  /** Whether built-in web search is available (we don't use it - Serper instead) */
  hasBuiltInWebSearch: boolean;
  /** Whether built-in X/Twitter search is available (we don't use it) */
  hasBuiltInXSearch: boolean;
  /** Whether file/collections search is available (we don't use it) */
  hasBuiltInFileSearch: boolean;
  /** Whether custom function calling is supported */
  hasCustomFunctions: boolean;
  /** Whether input transcription is automatic or needs configuration */
  autoInputTranscription: boolean;
  /** WebSocket URL */
  wsUrl: string;
  /** Model identifier (if applicable) */
  model?: string;
}

/**
 * OpenAI Realtime API capabilities
 */
export const OPENAI_CAPABILITIES: ProviderCapabilities = {
  provider: "openai",
  voices: [
    "alloy",
    "echo",
    "shimmer",
    "ash",
    "ballad",
    "coral",
    "sage",
    "verse",
    "marin",
  ] as const,
  audioFormats: ["pcm16", "g711_ulaw", "g711_alaw"] as const,
  sampleRates: [24000] as const,
  hasBuiltInWebSearch: false,
  hasBuiltInXSearch: false,
  hasBuiltInFileSearch: false,
  hasCustomFunctions: true,
  autoInputTranscription: false, // Needs whisper-1 config in session
  wsUrl: "wss://api.openai.com/v1/realtime",
  model: "gpt-4o-realtime-preview-2024-12-17",
};

/**
 * XAI Grok Voice Agent API capabilities
 */
export const XAI_CAPABILITIES: ProviderCapabilities = {
  provider: "xai",
  voices: ["sal", "rex", "eve", "leo", "mika", "valentin", "ara"] as const,
  audioFormats: ["pcm16", "pcm", "g711_ulaw", "g711_alaw"] as const,
  sampleRates: [8000, 16000, 24000, 48000] as const,
  hasBuiltInWebSearch: true, // Available but we use Serper instead
  hasBuiltInXSearch: true, // Available but we don't use it
  hasBuiltInFileSearch: true, // Available but we don't use it
  hasCustomFunctions: true,
  autoInputTranscription: true, // Built-in, no config needed
  wsUrl: "wss://api.x.ai/v1/realtime",
};

// ============================================================
// PROVIDER INTERFACE
// ============================================================

/**
 * Voice AI Provider interface
 *
 * Abstract interface that both OpenAI and XAI providers implement.
 * Provides a unified API for voice AI operations regardless of the
 * underlying provider.
 *
 * NOTE: This only abstracts the real-time voice-to-voice model.
 * Transcription (Whisper) and text inference (gpt-4o-mini) remain OpenAI.
 */
export interface IVoiceAIProvider {
  /** Provider type identifier */
  readonly providerType: VoiceAIProviderType;

  /** Provider capabilities */
  readonly capabilities: ProviderCapabilities;

  /**
   * Set callbacks for provider events
   */
  setCallbacks(callbacks: VoiceAIProviderCallbacks): void;

  /**
   * Create a new voice AI session for a room
   */
  createSession(config: VoiceAISessionConfig): Promise<void>;

  /**
   * Close a voice AI session
   */
  closeSession(roomId: string): Promise<void>;

  /**
   * Check if a session exists and is connected
   */
  isSessionConnected(roomId: string): boolean;

  /**
   * Get the current state of a session
   */
  getSessionState(roomId: string): AISessionState | null;

  /**
   * Update session configuration (instructions, voice, etc.)
   */
  updateSession(
    roomId: string,
    updates: Partial<VoiceAISessionConfig>,
  ): Promise<void>;

  /**
   * Send audio data to the AI
   * @param roomId Room ID
   * @param audioBase64 Base64 encoded PCM16 audio
   */
  sendAudio(roomId: string, audioBase64: string): void;

  /**
   * Commit audio buffer (end of PTT)
   */
  commitAudio(roomId: string): void;

  /**
   * Trigger a response from the AI
   * @param roomId Room ID
   * @param responseInstructions Optional per-response instructions
   */
  triggerResponse(roomId: string, responseInstructions?: string): void;

  /**
   * Cancel/interrupt current response
   */
  cancelResponse(roomId: string): void;

  /**
   * Send function call output back to AI
   */
  sendFunctionOutput(roomId: string, callId: string, output: unknown): void;

  /**
   * Inject context/system message into conversation
   */
  injectContext(roomId: string, context: string): void;

  /**
   * Set the current speaker for a session
   */
  setActiveSpeaker(
    roomId: string,
    speakerId: string | null,
    speakerName: string | null,
  ): void;

  /**
   * Mark session as interrupted (ignore remaining audio)
   */
  setInterrupted(roomId: string, interrupted: boolean): void;

  /**
   * Get the mapped voice for this provider based on personality
   */
  getVoice(personality: AIPersonality): string;

  /**
   * Get temperature setting for personality
   */
  getTemperature(personality: AIPersonality): number;
}

// ============================================================
// UTILITY TYPES
// ============================================================

/**
 * Provider session state (internal tracking)
 */
export interface ProviderSessionState {
  roomId: string;
  state: AISessionState;
  activeSpeakerId: string | null;
  activeSpeakerName: string | null;
  isConnecting: boolean;
  isConnected: boolean;
  personality: AIPersonality;
  topic?: string;
  customInstructions?: string;
  isInterrupted: boolean;
  expectedResponseId: string | null;
  lastSpeakerId: string | null;
  lastSpeakerName: string | null;
}
