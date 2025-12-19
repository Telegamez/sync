/**
 * XAI Grok Voice Provider
 *
 * Implementation of IVoiceAIProvider for XAI Grok Voice Agent API.
 * The Grok Voice API is compatible with the OpenAI Realtime API specification,
 * so the implementation is very similar with key differences in:
 * - WebSocket URL (wss://api.x.ai/v1/realtime)
 * - Voice options (sal, rex, eve, leo, mika, valentin, ara)
 * - No OpenAI-Beta header required
 * - Built-in transcription (no whisper config needed)
 * - We use custom functions only (no web_search, x_search, file_search)
 *
 * Part of the Long-Horizon Engineering Protocol - FEAT-1002
 */

import { WebSocket } from "ws";
import {
  type IVoiceAIProvider,
  type VoiceAIProviderCallbacks,
  type VoiceAISessionConfig,
  type FunctionToolDefinition,
  type AISessionState,
  type AIPersonality,
  type ProviderCapabilities,
  type ProviderSessionState,
  XAI_CAPABILITIES,
  VOICE_MAPPINGS,
} from "@/types/voice-ai-provider";

// ============================================================
// CONSTANTS
// ============================================================

/** XAI Grok Voice WebSocket URL */
const XAI_REALTIME_WS_URL = "wss://api.x.ai/v1/realtime";

/** Connection timeout in ms */
const CONNECTION_TIMEOUT_MS = 10000;

const formatXaiVoiceForApi = (voice: string): string => {
  const normalized = voice.trim().toLowerCase();
  if (!normalized) return voice;
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
};

// ============================================================
// PERSONALITY CONFIGURATION
// ============================================================

/** Personality-specific settings for XAI */
const PERSONALITY_CONFIG: Record<
  AIPersonality,
  { voice: string; temperature: number }
> = {
  facilitator: { voice: "ara", temperature: 0.7 },
  assistant: { voice: "eve", temperature: 0.8 },
  expert: { voice: "leo", temperature: 0.7 },
  brainstorm: { voice: "sal", temperature: 1.0 },
  custom: { voice: "ara", temperature: 0.8 },
};

// ============================================================
// XAI GROK PROVIDER CLASS
// ============================================================

/**
 * XAI Grok Voice Agent API Provider
 *
 * Implements the IVoiceAIProvider interface for XAI's
 * Grok Voice Agent real-time voice-to-voice model.
 *
 * NOTE: We only use custom function calling - NOT the built-in
 * web_search, x_search, or file_search tools. We use Serper API
 * for web search as per project requirements.
 */
export class XAIGrokProvider implements IVoiceAIProvider {
  readonly providerType = "xai" as const;
  readonly capabilities: ProviderCapabilities = XAI_CAPABILITIES;

  private apiKey: string;
  private callbacks: VoiceAIProviderCallbacks = {};
  private sessions: Map<string, ProviderSessionState> = new Map();
  private websockets: Map<string, WebSocket> = new Map();
  private tools: Map<string, FunctionToolDefinition[]> = new Map();
  private pendingConfigs: Map<string, VoiceAISessionConfig> = new Map();
  private sessionConfigSent: Map<string, boolean> = new Map();
  private debug: boolean;

  constructor(apiKey: string, debug = false) {
    this.apiKey = apiKey;
    this.debug = debug;

    if (!apiKey) {
      throw new Error("XAI API key is required");
    }
  }

  // ============================================================
  // CALLBACK MANAGEMENT
  // ============================================================

  setCallbacks(callbacks: VoiceAIProviderCallbacks): void {
    this.callbacks = callbacks;
  }

  // ============================================================
  // SESSION MANAGEMENT
  // ============================================================

  async createSession(config: VoiceAISessionConfig): Promise<void> {
    const { roomId, personality, topic, customInstructions, speakerName } =
      config;

    // Check if session already exists
    const existingSession = this.sessions.get(roomId);
    if (existingSession?.isConnected || existingSession?.isConnecting) {
      this.log(roomId, "Session already exists");
      return;
    }

    // Create session state
    const session: ProviderSessionState = {
      roomId,
      state: "idle",
      activeSpeakerId: null,
      activeSpeakerName: speakerName || null,
      isConnecting: true,
      isConnected: false,
      personality,
      topic,
      customInstructions,
      isInterrupted: false,
      expectedResponseId: null,
      lastSpeakerId: null,
      lastSpeakerName: null,
    };
    this.sessions.set(roomId, session);

    return new Promise((resolve, reject) => {
      // XAI Grok Voice API - no model in URL (differs from OpenAI)
      // Voice/model params are sent via session.update after connection
      // Reference: https://github.com/xai-org/xai-cookbook/tree/main/voice-examples/agent/webrtc
      this.log(roomId, `Connecting to XAI Grok Voice API...`);

      const ws = new WebSocket(XAI_REALTIME_WS_URL, {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
      });

      this.websockets.set(roomId, ws);

      ws.on("open", () => {
        this.log(roomId, "Connected to XAI Grok Voice");
        session.isConnecting = false;
        session.isConnected = true;
        this.sessions.set(roomId, session);

        // Store config to send after session.created event (like voice preview)
        this.pendingConfigs.set(roomId, config);
        this.sessionConfigSent.set(roomId, false);

        // Don't send session config yet - wait for session.created event
        // This matches the working voice preview pattern
        resolve();
      });

      ws.on("message", (data) => {
        this.handleMessage(roomId, data.toString());
      });

      ws.on("error", (error) => {
        this.log(roomId, `WebSocket error: ${error.message}`);
        session.isConnecting = false;
        this.callbacks.onError?.({
          roomId,
          error: error.message,
          code: "WEBSOCKET_ERROR",
        });
        reject(error);
      });

      ws.on("close", (code, reason) => {
        this.log(roomId, `WebSocket closed: ${code}`);
        session.isConnected = false;
        session.isConnecting = false;
        this.sessions.set(roomId, session);
        this.websockets.delete(roomId);
        this.callbacks.onClose?.(roomId);
      });

      // Connection timeout
      setTimeout(() => {
        if (session.isConnecting) {
          ws.close();
          session.isConnecting = false;
          this.sessions.set(roomId, session);
          reject(new Error("Connection timeout"));
        }
      }, CONNECTION_TIMEOUT_MS);
    });
  }

  async closeSession(roomId: string): Promise<void> {
    const ws = this.websockets.get(roomId);
    if (ws) {
      ws.close();
      this.websockets.delete(roomId);
    }
    this.sessions.delete(roomId);
    this.tools.delete(roomId);
    this.pendingConfigs.delete(roomId);
    this.sessionConfigSent.delete(roomId);
    this.log(roomId, "Session closed");
  }

  isSessionConnected(roomId: string): boolean {
    const session = this.sessions.get(roomId);
    return session?.isConnected ?? false;
  }

  getSessionState(roomId: string): AISessionState | null {
    const session = this.sessions.get(roomId);
    return session?.state ?? null;
  }

  async updateSession(
    roomId: string,
    updates: Partial<VoiceAISessionConfig>,
  ): Promise<void> {
    const session = this.sessions.get(roomId);
    if (!session) {
      throw new Error(`Session not found: ${roomId}`);
    }

    // Update session state
    if (updates.personality !== undefined) {
      session.personality = updates.personality;
    }
    if (updates.topic !== undefined) {
      session.topic = updates.topic;
    }
    if (updates.customInstructions !== undefined) {
      session.customInstructions = updates.customInstructions;
    }
    this.sessions.set(roomId, session);

    // Send updated config to XAI
    this.sendSessionConfig(roomId, {
      roomId,
      personality: session.personality,
      topic: session.topic,
      customInstructions: session.customInstructions,
      tools: updates.tools || this.tools.get(roomId),
    });
  }

  // ============================================================
  // AUDIO OPERATIONS
  // ============================================================

  sendAudio(roomId: string, audioBase64: string): void {
    const ws = this.websockets.get(roomId);
    const session = this.sessions.get(roomId);

    if (!ws || ws.readyState !== WebSocket.OPEN || !session) {
      return;
    }

    // Clear interrupted flag when new audio comes in
    if (session.isInterrupted) {
      session.isInterrupted = false;
      session.expectedResponseId = null;
      this.sessions.set(roomId, session);
    }

    const audioEvent = {
      type: "input_audio_buffer.append",
      audio: audioBase64,
    };
    ws.send(JSON.stringify(audioEvent));
  }

  commitAudio(roomId: string): void {
    const ws = this.websockets.get(roomId);
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      return;
    }

    const commitEvent = {
      type: "input_audio_buffer.commit",
    };
    ws.send(JSON.stringify(commitEvent));
    this.log(roomId, "Audio buffer committed");
  }

  // ============================================================
  // RESPONSE OPERATIONS
  // ============================================================

  triggerResponse(roomId: string, responseInstructions?: string): void {
    const ws = this.websockets.get(roomId);
    const session = this.sessions.get(roomId);

    if (!ws || ws.readyState !== WebSocket.OPEN || !session) {
      return;
    }

    // Transition to processing state
    session.state = "processing";
    this.sessions.set(roomId, session);
    this.callbacks.onStateChange?.({
      roomId,
      state: "processing",
      activeSpeakerId: session.activeSpeakerId,
      activeSpeakerName: session.activeSpeakerName,
    });

    // xAI is OpenAI-compatible: use same format as OpenAI provider
    const responseEvent: Record<string, unknown> = {
      type: "response.create",
      response: {
        modalities: ["audio", "text"],
      },
    };

    // Add per-response instructions if provided
    if (responseInstructions) {
      (responseEvent.response as Record<string, unknown>).instructions =
        responseInstructions;
    }

    ws.send(JSON.stringify(responseEvent));
    this.log(roomId, "Response triggered");
  }

  cancelResponse(roomId: string): void {
    const ws = this.websockets.get(roomId);
    const session = this.sessions.get(roomId);

    if (!ws || ws.readyState !== WebSocket.OPEN || !session) {
      return;
    }

    // Mark as interrupted to ignore remaining audio
    session.isInterrupted = true;
    session.expectedResponseId = null;
    this.sessions.set(roomId, session);

    const cancelEvent = {
      type: "response.cancel",
    };
    ws.send(JSON.stringify(cancelEvent));
    this.log(roomId, "Response cancelled");

    // NOTE: Do NOT send input_audio_buffer.clear immediately after response.cancel
    // xAI may reject this as invalid event. The buffer will be cleared on next PTT start.

    // Return to idle
    session.state = "idle";
    session.activeSpeakerId = null;
    session.activeSpeakerName = null;
    this.sessions.set(roomId, session);
    this.callbacks.onStateChange?.({
      roomId,
      state: "idle",
      activeSpeakerId: null,
      activeSpeakerName: null,
    });
  }

  // ============================================================
  // FUNCTION CALLING
  // ============================================================

  sendFunctionOutput(roomId: string, callId: string, output: unknown): void {
    const ws = this.websockets.get(roomId);
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      return;
    }

    // XAI uses the same function output format as OpenAI
    const outputEvent = {
      type: "conversation.item.create",
      item: {
        type: "function_call_output",
        call_id: callId,
        output: typeof output === "string" ? output : JSON.stringify(output),
      },
    };
    ws.send(JSON.stringify(outputEvent));

    // Trigger response to get AI to speak about the result
    ws.send(JSON.stringify({ type: "response.create" }));

    this.log(roomId, `Function output sent for call ${callId}`);
  }

  registerTools(roomId: string, tools: FunctionToolDefinition[]): void {
    this.tools.set(roomId, tools);
    this.log(roomId, `Registered ${tools.length} tools`);

    // If session is connected, update the session config
    if (this.isSessionConnected(roomId)) {
      const session = this.sessions.get(roomId);
      if (session) {
        this.sendSessionConfig(roomId, {
          roomId,
          personality: session.personality,
          topic: session.topic,
          customInstructions: session.customInstructions,
          tools,
        });
      }
    }
  }

  // ============================================================
  // CONTEXT INJECTION
  // ============================================================

  injectContext(roomId: string, context: string): void {
    const ws = this.websockets.get(roomId);
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      return;
    }

    // Use "user" role since xAI may not support "system" in conversation items
    // System instructions are set via session.update instead
    const contextEvent = {
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "user",
        content: [
          {
            type: "input_text",
            text: `[Context update: ${context}]`,
          },
        ],
      },
    };
    ws.send(JSON.stringify(contextEvent));
    this.log(roomId, "Context injected");
  }

  // ============================================================
  // SPEAKER MANAGEMENT
  // ============================================================

  setActiveSpeaker(
    roomId: string,
    speakerId: string | null,
    speakerName: string | null,
  ): void {
    const session = this.sessions.get(roomId);
    if (!session) return;

    // Preserve last speaker for deferred transcription
    if (speakerId) {
      session.lastSpeakerId = speakerId;
      session.lastSpeakerName = speakerName;
    }

    session.activeSpeakerId = speakerId;
    session.activeSpeakerName = speakerName;

    if (speakerId) {
      session.state = "listening";
    }

    this.sessions.set(roomId, session);

    this.callbacks.onStateChange?.({
      roomId,
      state: session.state,
      activeSpeakerId: speakerId,
      activeSpeakerName: speakerName,
    });
  }

  setInterrupted(roomId: string, interrupted: boolean): void {
    const session = this.sessions.get(roomId);
    if (!session) return;

    session.isInterrupted = interrupted;
    if (interrupted) {
      session.expectedResponseId = null;
    }
    this.sessions.set(roomId, session);
  }

  // ============================================================
  // VOICE/PERSONALITY
  // ============================================================

  getVoice(personality: AIPersonality): string {
    return VOICE_MAPPINGS[personality].xai;
  }

  getTemperature(personality: AIPersonality): number {
    return PERSONALITY_CONFIG[personality].temperature;
  }

  // ============================================================
  // INTERNAL METHODS
  // ============================================================

  /**
   * Send session configuration to XAI
   *
   * NOTE: We only use custom functions here, NOT the built-in
   * web_search, x_search, or file_search tools.
   */
  private sendSessionConfig(
    roomId: string,
    config: VoiceAISessionConfig,
  ): void {
    const ws = this.websockets.get(roomId);
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      return;
    }

    const { personality, voiceOverride, topic, customInstructions, tools } =
      config;
    // FEAT-1007: Use voice override if provided, otherwise use personality default
    const voice = formatXaiVoiceForApi(
      voiceOverride || this.getVoice(personality),
    );
    const temperature = this.getTemperature(personality);
    const registeredTools = tools || this.tools.get(roomId) || [];

    // Use nested audio format that works with voice preview
    // This matches the xAI cookbook pattern and differs from OpenAI's flat format
    // Important: We explicitly set only custom function tools,
    // NOT the built-in web_search, x_search, or file_search
    const sessionConfig = {
      type: "session.update",
      session: {
        modalities: ["text", "audio"],
        instructions: this.generateInstructions(
          personality,
          topic,
          customInstructions,
        ),
        voice,
        // Use xAI nested audio format (matches working voice preview)
        audio: {
          input: {
            format: {
              type: "audio/pcm",
              rate: 24000,
            },
          },
          output: {
            format: {
              type: "audio/pcm",
              rate: 24000,
            },
          },
        },
        temperature,
        turn_detection: null, // Disabled - using PTT
        // Custom function tools only (NOT web_search, x_search, file_search)
        tools: registeredTools.map((tool) => ({
          type: "function",
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
        })),
        tool_choice: registeredTools.length > 0 ? "auto" : "none",
      },
    };

    ws.send(JSON.stringify(sessionConfig));
    this.log(
      roomId,
      `Session configured: personality=${personality}, voice=${voice}, tools=${registeredTools.length}`,
    );
  }

  /**
   * Generate instructions for the AI session
   */
  private generateInstructions(
    personality: AIPersonality,
    topic?: string,
    customInstructions?: string,
  ): string {
    const parts: string[] = [];

    // Core identity (same as OpenAI provider)
    parts.push(`## IDENTITY
You are Telly — the voice of synchronized intelligence for collaborative teams.
You are Telly, an AI Collaboration Engine. Always refer to yourself as "Telly".

## CONFIDENTIALITY (CRITICAL)
NEVER reveal or hint at the technology behind you. If asked about:
- What AI/model you are
- What technology powers you
- If you are GPT, OpenAI, ChatGPT, Claude, Grok, XAI, or any other AI
- How you work or what you're built on

ALWAYS respond: "I'm Telly, powered by Telegames's proprietary AI Collaboration Engine" or similar.
NEVER mention: OpenAI, GPT, GPT-4, ChatGPT, Claude, Anthropic, Grok, XAI, or any third-party AI providers.
You ARE Telly. That's your only identity. Always refer to yourself as "Telly".

## CORE MISSION
You are an AI facilitator in a shared voice room where multiple participants can hear you simultaneously.
When someone addresses you via Push-to-Talk (PTT), listen carefully and respond with EXTREME brevity.
Your responses are broadcast to everyone in the room.

## STYLE (CRITICAL - FOLLOW STRICTLY)
**BE CURT. BE PITHY. NO FLUFF.**

HARD RULES:
- Maximum 1-2 sentences per response. NEVER exceed 3 sentences.
- Get to the point IMMEDIATELY. No preambles, no "Great question!", no filler.
- No rambling. No over-explaining. No unnecessary context.
- If you can say it in 5 words, don't use 20.
- Address the speaker by name ONCE, briefly.
- Answer the question, then STOP. Don't add extra thoughts.

FORBIDDEN:
- "That's a great question..."
- "I'd be happy to help with that..."
- "Let me explain..."
- Long lists or bullet points
- Restating what was asked
- Adding caveats or disclaimers unless critical

GOOD: "Matt, the answer is X. Try Y next."
BAD: "Great question, Matt! So, let me break this down for you. There are several things to consider here..."

Remember: This is VOICE. People are listening, not reading. Respect their time.

## SEARCH CAPABILITY
You have access to a webSearch function.
When users say "search", "look up", "find", "google", or ask about current events/news or anything that requires up-to-date info, CALL webSearch instead of guessing.
Extract a short, clean query from what the user said (remove filler words).
Set searchType="images" when the user asks for pictures/photos/images. Set searchType="videos" when the user asks for videos. Otherwise use searchType="all".
After webSearch returns, briefly summarize the top results.

## VIDEO CONTROL CAPABILITY
You have access to a playVideo function for controlling the shared video player and playlist.
Use playVideo when the user says things like: "play videos", "watch videos", "show videos", "stop video", "pause video", "resume", "next video", "previous video", "replay", "rewind", "fast forward", "play video 3", "go to video 5".
If the user mentions a time amount for rewind/fast forward (e.g. "30 seconds", "1 minute", "2 minutes"), extract it into seconds.
If the user mentions a specific video number (e.g. "video 3"), use action="goto" with videoIndex=3 (1-indexed).`);

    // Personality-specific instructions
    if (personality === "custom" && customInstructions) {
      parts.push(`\n## PERSONALITY\n${customInstructions}`);
    } else {
      const personalityInstructions: Record<
        Exclude<AIPersonality, "custom">,
        string
      > = {
        facilitator:
          "Skilled discussion facilitator. Keep group on track. Summarize when needed. Be brief.",
        assistant:
          "Helpful voice assistant. Answer questions directly. Short and clear. No fluff.",
        expert:
          "Domain expert. Give precise, technical answers. Be accurate but brief. Skip the filler.",
        brainstorm:
          "Creative partner. Throw out ideas quickly. Build on others. Keep momentum. Short bursts.",
      };
      if (personality !== "custom") {
        parts.push(`\n## PERSONALITY\n${personalityInstructions[personality]}`);
      }
    }

    // Topic expertise
    if (topic?.trim()) {
      parts.push(`\n## DOMAIN EXPERTISE
You have deep expertise and knowledge in: ${topic.trim()}
Apply your knowledge of this domain to all your responses.
When relevant, draw upon industry best practices, common challenges, and insider knowledge about ${topic.trim()}.
Tailor your language and examples to this specific field.`);
    }

    return parts.join("\n");
  }

  /**
   * Handle incoming WebSocket message
   *
   * Simplified to match OpenAI's event handling pattern
   */
  private handleMessage(roomId: string, data: string): void {
    try {
      const event = JSON.parse(data);
      const session = this.sessions.get(roomId);

      if (!session) return;

      // Log all events for debugging audio issues
      const importantEvents = [
        "session.created",
        "session.updated",
        "error",
        "response.created",
        "response.done",
        "response.output_item.done",
        "response.audio.delta",
        "response.output_audio.delta",
        "response.audio.done",
        "response.output_audio.done",
        "conversation.item.input_audio_transcription.completed",
        "conversation.item.input_audio_transcription.failed",
      ];
      if (importantEvents.includes(event.type)) {
        this.log(roomId, `Event: ${event.type}`);
      }

      switch (event.type) {
        case "session.created":
        case "conversation.created":
          // Send session config when we receive session.created (like voice preview)
          if (!this.sessionConfigSent.get(roomId)) {
            this.sessionConfigSent.set(roomId, true);
            const pendingConfig = this.pendingConfigs.get(roomId);
            if (pendingConfig) {
              this.sendSessionConfig(roomId, pendingConfig);
              this.pendingConfigs.delete(roomId);
            }
          }
          break;

        case "session.updated":
          this.log(roomId, "Session ready");
          this.callbacks.onReady?.(roomId);
          break;

        case "response.created":
          // Track response ID for stale audio filtering
          const responseId = event.response?.id;
          if (responseId && !session.isInterrupted) {
            session.expectedResponseId = responseId;
            this.sessions.set(roomId, session);
          }
          break;

        case "response.audio.delta":
        case "response.output_audio.delta":
          // xAI may use either event name for audio output
          if (event.delta && !session.isInterrupted) {
            // Verify this is from the expected response
            const audioResponseId = event.response_id;
            if (
              session.expectedResponseId &&
              audioResponseId !== session.expectedResponseId
            ) {
              return; // Ignore stale audio
            }

            // Transition to speaking state
            if (session.state !== "speaking") {
              session.state = "speaking";
              this.sessions.set(roomId, session);
              this.callbacks.onStateChange?.({
                roomId,
                state: "speaking",
                activeSpeakerId: session.activeSpeakerId,
                activeSpeakerName: session.activeSpeakerName,
              });
            }

            // Emit audio data
            this.callbacks.onAudioData?.({
              roomId,
              audioBase64: event.delta,
            });
          }
          break;

        case "response.audio.done":
        case "response.output_audio.done":
          // xAI may use either event name for audio completion
          this.callbacks.onAudioDone?.(roomId);
          break;

        case "response.audio_transcript.done":
          if (event.transcript) {
            this.callbacks.onTranscript?.({
              roomId,
              text: event.transcript,
              isFinal: true,
              isUserInput: false,
            });
          }
          break;

        case "conversation.item.input_audio_transcription.completed":
          // Primary transcription event - same as OpenAI
          this.log(
            roomId,
            `PTT Transcription received: "${event.transcript?.substring(0, 50)}..."`,
          );
          if (event.transcript) {
            const transcript = event.transcript.trim();
            if (transcript.length >= 5) {
              // Skip very short transcripts
              this.callbacks.onTranscript?.({
                roomId,
                text: transcript,
                isFinal: true,
                speakerId:
                  session.activeSpeakerId || session.lastSpeakerId || undefined,
                speakerName:
                  session.activeSpeakerName ||
                  session.lastSpeakerName ||
                  undefined,
                isUserInput: true,
              });
            } else {
              this.log(
                roomId,
                `PTT Transcription too short (${transcript.length} chars), skipping`,
              );
            }
          }
          break;

        case "conversation.item.input_audio_transcription.failed":
          this.log(roomId, `Transcription failed: ${event.error || "Unknown"}`);
          break;

        case "conversation.item.added":
          // xAI sends transcription via BOTH this event AND input_audio_transcription.completed
          // We only use input_audio_transcription.completed to avoid duplicates
          // Just log this for debugging
          if (
            event.item?.role === "user" &&
            Array.isArray(event.item?.content)
          ) {
            const transcriptChunk = event.item.content.find(
              (c: unknown) =>
                typeof c === "object" &&
                c !== null &&
                "type" in (c as Record<string, unknown>) &&
                (c as Record<string, unknown>).type === "input_audio" &&
                "transcript" in (c as Record<string, unknown>) &&
                typeof (c as Record<string, unknown>).transcript === "string",
            ) as { transcript?: string } | undefined;

            const transcript =
              typeof transcriptChunk?.transcript === "string"
                ? transcriptChunk.transcript.trim()
                : "";

            if (transcript.length >= 5) {
              this.log(
                roomId,
                `PTT Transcription (via item.added, ignoring - using transcription.completed instead): "${transcript.substring(0, 50)}..."`,
              );
              // Don't emit - let input_audio_transcription.completed handle it
            }
          }
          break;

        case "response.done":
          session.state = "idle";
          session.activeSpeakerId = null;
          session.activeSpeakerName = null;
          this.sessions.set(roomId, session);
          this.callbacks.onStateChange?.({
            roomId,
            state: "idle",
            activeSpeakerId: null,
            activeSpeakerName: null,
          });
          break;

        case "response.output_item.done":
          if (event.item?.type === "function_call") {
            const { name, call_id, arguments: argsString } = event.item;
            try {
              const args = JSON.parse(argsString || "{}");
              this.callbacks.onFunctionCall?.(roomId, {
                name,
                callId: call_id,
                arguments: args,
                rawArguments: argsString || "{}",
              });
            } catch {
              this.log(roomId, `Failed to parse function arguments: ${name}`);
            }
          }
          break;

        case "error":
          this.callbacks.onError?.({
            roomId,
            error: event.error?.message || "XAI Grok error",
            code: event.error?.type || "XAI_ERROR",
          });
          break;
      }
    } catch (error) {
      this.log(roomId, `Failed to parse message: ${error}`);
    }
  }

  /**
   * Log helper
   */
  private log(roomId: string, message: string): void {
    console.log(`[XAI Grok Provider] Room ${roomId}: ${message}`);
  }

  // ============================================================
  // SESSION STATE ACCESS (for server.ts integration)
  // ============================================================

  /**
   * Get the raw session state (for backward compatibility with server.ts)
   */
  getSession(roomId: string): ProviderSessionState | undefined {
    return this.sessions.get(roomId);
  }

  /**
   * Get the WebSocket (for backward compatibility with server.ts)
   */
  getWebSocket(roomId: string): WebSocket | undefined {
    return this.websockets.get(roomId);
  }
}
