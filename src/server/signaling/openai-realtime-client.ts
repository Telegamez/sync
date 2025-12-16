/**
 * OpenAI Realtime API Server-Side Client
 *
 * Manages WebSocket connection to OpenAI Realtime API for shared room AI sessions.
 * Handles audio streaming, session lifecycle, and response broadcasting.
 *
 * Part of the Long-Horizon Engineering Protocol - FEAT-413
 */

import WebSocket from "ws";
import type { RoomId } from "@/types/room";
import type { PeerId } from "@/types/peer";
import type { FunctionCallEvent } from "@/types/search";

/**
 * OpenAI Realtime WebSocket endpoint
 */
const OPENAI_REALTIME_WS_URL = "wss://api.openai.com/v1/realtime";
const OPENAI_MODEL = "gpt-4o-realtime-preview-2024-12-17";

/**
 * AI response state for room
 */
export type AISessionState = "idle" | "listening" | "processing" | "speaking";

/**
 * Session configuration
 */
export interface OpenAIRealtimeConfig {
  /** OpenAI API key */
  apiKey: string;
  /** Voice for AI responses */
  voice?:
    | "alloy"
    | "echo"
    | "shimmer"
    | "ash"
    | "ballad"
    | "coral"
    | "sage"
    | "verse"
    | "marin";
  /** System instructions */
  instructions?: string;
  /** Temperature (0-2) */
  temperature?: number;
}

/**
 * Session events callbacks
 */
export interface OpenAIRealtimeCallbacks {
  /** Called when AI state changes */
  onStateChange?: (
    roomId: RoomId,
    state: AISessionState,
    activeSpeakerId?: PeerId,
    activeSpeakerName?: string,
  ) => void;
  /** Called when audio response data is received (base64 PCM16) */
  onAudioData?: (roomId: RoomId, audioBase64: string) => void;
  /** Called when audio response is complete */
  onAudioDone?: (roomId: RoomId) => void;
  /** Called when transcription is received */
  onTranscript?: (roomId: RoomId, text: string, isFinal: boolean) => void;
  /** Called on error */
  onError?: (roomId: RoomId, error: string) => void;
  /** Called when session is ready */
  onReady?: (roomId: RoomId) => void;
  /** Called when session ends */
  onClose?: (roomId: RoomId) => void;
  /** Called when AI invokes a function (e.g., webSearch) */
  onFunctionCall?: (roomId: RoomId, functionCall: FunctionCallEvent) => void;
}

/**
 * Per-room session state
 */
interface RoomSession {
  roomId: RoomId;
  ws: WebSocket | null;
  state: AISessionState;
  activeSpeakerId: PeerId | null;
  activeSpeakerName: string | null;
  isConnecting: boolean;
  isConnected: boolean;
  reconnectAttempts: number;
  reconnectTimer?: NodeJS.Timeout;
}

/**
 * Default system instructions for Swensync
 */
const DEFAULT_INSTRUCTIONS = `You are Swensync — the voice of synchronized intelligence for collaborative teams.

## RESPONSE LENGTH — THIS IS CRITICAL
You MUST keep every response to 4 sentences maximum. No exceptions. Be pithy, punchy, and to the point.

## CORE MISSION
You're an AI in a shared voice room. Multiple people hear you at once. When someone uses Push-to-Talk, respond briefly and conversationally.

## IDENTITY
You are Swensync's AI. Never mention OpenAI, GPT, or any third-party provider.

## STYLE
- Short. Pithy. Conversational. Like texting a clever friend.
- Max 4 sentences per turn — usually 2-3 is better
- No fluff, no preamble, no "Great question!" — just answer
- Address people by name when you know it
- If they need more detail, they'll ask

## SEARCH CAPABILITY
You have access to a webSearch function. Use it when users say "search", "look up", "find", "google", or ask about current events, news, or things requiring up-to-date information. After searching, briefly summarize the top results.`;

/**
 * webSearch function tool definition for OpenAI
 */
const WEB_SEARCH_TOOL = {
  type: "function" as const,
  name: "webSearch",
  description:
    "Search the web for current information, news, images, or videos. Use when user says 'search', 'look up', 'find', 'google', or asks about current events, news, or things that require up-to-date information.",
  parameters: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "The search query to look up",
      },
      searchType: {
        type: "string",
        enum: ["all", "web", "images", "videos"],
        description:
          "Type of search. Use 'all' for general queries, 'images' when user wants pictures, 'videos' when user wants video content. Defaults to 'all'.",
      },
    },
    required: ["query"],
  },
};

/**
 * OpenAI Realtime Client for Server-Side Connections
 *
 * Manages WebSocket connections to OpenAI Realtime API for shared room sessions.
 */
export class OpenAIRealtimeClient {
  private config: OpenAIRealtimeConfig;
  private callbacks: OpenAIRealtimeCallbacks;
  private sessions = new Map<RoomId, RoomSession>();
  private maxReconnectAttempts = 3;
  private reconnectDelayMs = 2000;

  constructor(
    config: OpenAIRealtimeConfig,
    callbacks: OpenAIRealtimeCallbacks = {},
  ) {
    this.config = config;
    this.callbacks = callbacks;
  }

  /**
   * Create a session for a room
   */
  async createSession(roomId: RoomId): Promise<boolean> {
    // Check if session already exists
    if (this.sessions.has(roomId)) {
      const existing = this.sessions.get(roomId)!;
      if (existing.isConnected || existing.isConnecting) {
        console.log(`[OpenAI] Session already exists for room ${roomId}`);
        return true;
      }
    }

    const session: RoomSession = {
      roomId,
      ws: null,
      state: "idle",
      activeSpeakerId: null,
      activeSpeakerName: null,
      isConnecting: true,
      isConnected: false,
      reconnectAttempts: 0,
    };

    this.sessions.set(roomId, session);

    try {
      await this.connect(session);
      return true;
    } catch (error) {
      console.error(
        `[OpenAI] Failed to create session for room ${roomId}:`,
        error,
      );
      this.sessions.delete(roomId);
      return false;
    }
  }

  /**
   * Destroy a session for a room
   */
  destroySession(roomId: RoomId): void {
    const session = this.sessions.get(roomId);
    if (!session) return;

    // Clear reconnect timer
    if (session.reconnectTimer) {
      clearTimeout(session.reconnectTimer);
    }

    // Close WebSocket
    if (session.ws) {
      session.ws.close();
      session.ws = null;
    }

    this.sessions.delete(roomId);
    console.log(`[OpenAI] Destroyed session for room ${roomId}`);
    this.callbacks.onClose?.(roomId);
  }

  /**
   * Check if a room has an active session
   */
  hasSession(roomId: RoomId): boolean {
    const session = this.sessions.get(roomId);
    return session?.isConnected ?? false;
  }

  /**
   * Get current AI state for a room
   */
  getState(roomId: RoomId): AISessionState {
    return this.sessions.get(roomId)?.state ?? "idle";
  }

  /**
   * Start listening (peer pressed PTT)
   */
  startListening(
    roomId: RoomId,
    peerId: PeerId,
    peerDisplayName: string,
  ): boolean {
    const session = this.sessions.get(roomId);
    if (!session || !session.isConnected) {
      console.log(
        `[OpenAI] Cannot start listening - no active session for room ${roomId}`,
      );
      return false;
    }

    // Update state
    session.state = "listening";
    session.activeSpeakerId = peerId;
    session.activeSpeakerName = peerDisplayName;

    console.log(
      `[OpenAI] Room ${roomId}: Listening to ${peerDisplayName} (${peerId})`,
    );
    this.callbacks.onStateChange?.(
      roomId,
      "listening",
      peerId,
      peerDisplayName,
    );

    return true;
  }

  /**
   * Send audio data to OpenAI (base64 encoded PCM16)
   */
  sendAudio(roomId: RoomId, audioBase64: string): boolean {
    const session = this.sessions.get(roomId);
    if (!session || !session.ws || session.ws.readyState !== WebSocket.OPEN) {
      return false;
    }

    // Append audio to input buffer
    const event = {
      type: "input_audio_buffer.append",
      audio: audioBase64,
    };

    session.ws.send(JSON.stringify(event));
    return true;
  }

  /**
   * Commit audio buffer and trigger response (peer released PTT)
   */
  commitAudio(roomId: RoomId): boolean {
    const session = this.sessions.get(roomId);
    if (!session || !session.ws || session.ws.readyState !== WebSocket.OPEN) {
      return false;
    }

    // Update state to processing
    session.state = "processing";
    this.callbacks.onStateChange?.(
      roomId,
      "processing",
      session.activeSpeakerId ?? undefined,
      session.activeSpeakerName ?? undefined,
    );

    console.log(`[OpenAI] Room ${roomId}: Committing audio buffer`);

    // Commit the audio buffer
    const commitEvent = {
      type: "input_audio_buffer.commit",
    };
    session.ws.send(JSON.stringify(commitEvent));

    // Trigger response
    const responseEvent = {
      type: "response.create",
      response: {
        modalities: ["audio", "text"],
      },
    };
    session.ws.send(JSON.stringify(responseEvent));

    return true;
  }

  /**
   * Clear audio buffer (cancel PTT without response)
   */
  clearAudio(roomId: RoomId): boolean {
    const session = this.sessions.get(roomId);
    if (!session || !session.ws || session.ws.readyState !== WebSocket.OPEN) {
      return false;
    }

    const event = {
      type: "input_audio_buffer.clear",
    };
    session.ws.send(JSON.stringify(event));

    // Reset state
    session.state = "idle";
    session.activeSpeakerId = null;
    session.activeSpeakerName = null;
    this.callbacks.onStateChange?.(roomId, "idle");

    return true;
  }

  /**
   * Interrupt current AI response
   */
  interrupt(roomId: RoomId): boolean {
    const session = this.sessions.get(roomId);
    if (!session || !session.ws || session.ws.readyState !== WebSocket.OPEN) {
      return false;
    }

    const event = {
      type: "response.cancel",
    };
    session.ws.send(JSON.stringify(event));

    // Reset state
    session.state = "idle";
    session.activeSpeakerId = null;
    session.activeSpeakerName = null;
    this.callbacks.onStateChange?.(roomId, "idle");

    console.log(`[OpenAI] Room ${roomId}: Interrupted AI response`);
    return true;
  }

  /**
   * Inject context into the conversation via conversation.item.create
   *
   * This adds a system message to the conversation history before audio processing.
   * Used to provide the AI with prior conversation context (summaries + recent transcript).
   *
   * @param roomId - Room to inject context into
   * @param context - Context text to inject (formatted summary + recent messages)
   * @returns boolean - Whether context was successfully injected
   */
  injectContext(roomId: RoomId, context: string): boolean {
    const session = this.sessions.get(roomId);
    if (!session || !session.ws || session.ws.readyState !== WebSocket.OPEN) {
      console.log(
        `[OpenAI] Cannot inject context - no active session for room ${roomId}`,
      );
      return false;
    }

    // Create a system message in the conversation history
    const contextEvent = {
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "system",
        content: [
          {
            type: "input_text",
            text: context,
          },
        ],
      },
    };

    session.ws.send(JSON.stringify(contextEvent));
    console.log(
      `[OpenAI] Room ${roomId}: Injected context (${context.length} chars)`,
    );
    return true;
  }

  /**
   * Update session instructions dynamically
   *
   * @param roomId - Room to update
   * @param instructions - New instructions text
   * @returns boolean - Whether update was sent
   */
  updateInstructions(roomId: RoomId, instructions: string): boolean {
    const session = this.sessions.get(roomId);
    if (!session || !session.ws || session.ws.readyState !== WebSocket.OPEN) {
      return false;
    }

    const updateEvent = {
      type: "session.update",
      session: {
        instructions,
      },
    };

    session.ws.send(JSON.stringify(updateEvent));
    console.log(`[OpenAI] Room ${roomId}: Updated session instructions`);
    return true;
  }

  /**
   * Send function call output back to OpenAI
   *
   * After executing a function (e.g., webSearch), send the results back
   * to OpenAI so it can generate a response based on the function output.
   *
   * @param roomId - Room ID
   * @param callId - The call_id from the function call event
   * @param output - The function output (will be JSON stringified)
   * @param triggerResponse - Whether to trigger AI response after (default: true)
   * @returns boolean - Whether output was sent successfully
   */
  sendFunctionOutput(
    roomId: RoomId,
    callId: string,
    output: unknown,
    triggerResponse: boolean = true,
  ): boolean {
    const session = this.sessions.get(roomId);
    if (!session || !session.ws || session.ws.readyState !== WebSocket.OPEN) {
      console.log(
        `[OpenAI] Cannot send function output - no active session for room ${roomId}`,
      );
      return false;
    }

    // Send function output
    const outputEvent = {
      type: "conversation.item.create",
      item: {
        type: "function_call_output",
        call_id: callId,
        output: typeof output === "string" ? output : JSON.stringify(output),
      },
    };

    session.ws.send(JSON.stringify(outputEvent));
    console.log(
      `[OpenAI] Room ${roomId}: Sent function output for call ${callId}`,
    );

    // Trigger AI response to summarize results
    if (triggerResponse) {
      const responseEvent = {
        type: "response.create",
        response: {
          modalities: ["audio", "text"],
        },
      };
      session.ws.send(JSON.stringify(responseEvent));
      console.log(
        `[OpenAI] Room ${roomId}: Triggered response after function output`,
      );
    }

    return true;
  }

  /**
   * Get active session count
   */
  getSessionCount(): number {
    return this.sessions.size;
  }

  /**
   * Dispose all sessions
   */
  dispose(): void {
    const roomIds = Array.from(this.sessions.keys());
    for (const roomId of roomIds) {
      this.destroySession(roomId);
    }
  }

  // ========== Private Methods ==========

  /**
   * Connect to OpenAI WebSocket
   */
  private async connect(session: RoomSession): Promise<void> {
    return new Promise((resolve, reject) => {
      const url = `${OPENAI_REALTIME_WS_URL}?model=${OPENAI_MODEL}`;

      console.log(`[OpenAI] Connecting to ${url} for room ${session.roomId}`);

      const ws = new WebSocket(url, {
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          "OpenAI-Beta": "realtime=v1",
        },
      });

      session.ws = ws;

      ws.on("open", () => {
        console.log(`[OpenAI] WebSocket connected for room ${session.roomId}`);
        session.isConnecting = false;
        session.isConnected = true;
        session.reconnectAttempts = 0;

        // Send session configuration
        this.sendSessionConfig(session);

        this.callbacks.onReady?.(session.roomId);
        resolve();
      });

      ws.on("message", (data: WebSocket.RawData) => {
        this.handleMessage(session, data.toString());
      });

      ws.on("error", (error: Error) => {
        console.error(
          `[OpenAI] WebSocket error for room ${session.roomId}:`,
          error.message,
        );
        this.callbacks.onError?.(session.roomId, error.message);

        if (session.isConnecting) {
          reject(error);
        }
      });

      ws.on("close", (code: number, reason: Buffer) => {
        console.log(
          `[OpenAI] WebSocket closed for room ${session.roomId}: ${code} ${reason.toString()}`,
        );
        session.isConnected = false;
        session.ws = null;

        // Attempt reconnection if not intentionally closed
        if (
          code !== 1000 &&
          session.reconnectAttempts < this.maxReconnectAttempts
        ) {
          this.scheduleReconnect(session);
        } else {
          this.callbacks.onClose?.(session.roomId);
        }
      });

      // Connection timeout
      setTimeout(() => {
        if (session.isConnecting) {
          ws.close();
          reject(new Error("Connection timeout"));
        }
      }, 10000);
    });
  }

  /**
   * Send session configuration
   */
  private sendSessionConfig(session: RoomSession): void {
    if (!session.ws || session.ws.readyState !== WebSocket.OPEN) return;

    const config = {
      type: "session.update",
      session: {
        modalities: ["text", "audio"],
        instructions: this.config.instructions || DEFAULT_INSTRUCTIONS,
        voice: this.config.voice || "marin",
        input_audio_format: "pcm16",
        output_audio_format: "pcm16",
        temperature: this.config.temperature ?? 0.8,
        turn_detection: null, // Disable server VAD - we use PTT
        // Function calling tools
        tools: [WEB_SEARCH_TOOL],
        tool_choice: "auto",
      },
    };

    session.ws.send(JSON.stringify(config));
    console.log(
      `[OpenAI] Session configured for room ${session.roomId} (with webSearch tool)`,
    );
  }

  /**
   * Handle incoming WebSocket message
   */
  private handleMessage(session: RoomSession, data: string): void {
    try {
      const event = JSON.parse(data);

      // Log important events
      const importantEvents = [
        "session.created",
        "session.updated",
        "error",
        "response.created",
        "response.done",
        "response.audio.done",
        "response.output_item.done",
        "input_audio_buffer.speech_started",
        "input_audio_buffer.speech_stopped",
      ];

      if (importantEvents.includes(event.type)) {
        console.log(`[OpenAI] Room ${session.roomId}: ${event.type}`);
      }

      switch (event.type) {
        case "session.created":
        case "session.updated":
          // Session ready
          break;

        case "response.audio.delta":
          // Audio chunk received - stream to room
          if (event.delta) {
            // First audio chunk - transition to speaking
            if (session.state !== "speaking") {
              session.state = "speaking";
              this.callbacks.onStateChange?.(
                session.roomId,
                "speaking",
                session.activeSpeakerId ?? undefined,
                session.activeSpeakerName ?? undefined,
              );
            }
            this.callbacks.onAudioData?.(session.roomId, event.delta);
          }
          break;

        case "response.audio.done":
          // Audio stream complete
          console.log(`[OpenAI] Room ${session.roomId}: Audio stream complete`);
          this.callbacks.onAudioDone?.(session.roomId);
          break;

        case "response.audio_transcript.delta":
          // Transcript chunk
          if (event.delta) {
            this.callbacks.onTranscript?.(session.roomId, event.delta, false);
          }
          break;

        case "response.audio_transcript.done":
          // Transcript complete
          if (event.transcript) {
            this.callbacks.onTranscript?.(
              session.roomId,
              event.transcript,
              true,
            );
          }
          break;

        case "response.done":
          // Response complete - return to idle
          console.log(`[OpenAI] Room ${session.roomId}: Response complete`);
          session.state = "idle";
          session.activeSpeakerId = null;
          session.activeSpeakerName = null;
          this.callbacks.onStateChange?.(session.roomId, "idle");
          break;

        case "error":
          console.error(`[OpenAI] Room ${session.roomId} error:`, event.error);
          this.callbacks.onError?.(
            session.roomId,
            event.error?.message || "Unknown error",
          );
          break;

        case "input_audio_buffer.speech_started":
          // Server VAD detected speech (though we disabled it)
          break;

        case "input_audio_buffer.speech_stopped":
          // Server VAD detected silence
          break;

        case "response.output_item.done":
          // Check if this is a function call
          if (event.item?.type === "function_call") {
            const { name, call_id, arguments: argsString } = event.item;
            console.log(
              `[OpenAI] Room ${session.roomId}: Function call - ${name}`,
            );

            try {
              const args = JSON.parse(argsString || "{}");
              this.callbacks.onFunctionCall?.(session.roomId, {
                name,
                callId: call_id,
                arguments: args,
              });
            } catch (parseError) {
              console.error(
                `[OpenAI] Failed to parse function arguments for ${name}:`,
                parseError,
              );
            }
          }
          break;
      }
    } catch (error) {
      console.error(
        `[OpenAI] Failed to parse message for room ${session.roomId}:`,
        error,
      );
    }
  }

  /**
   * Schedule reconnection attempt
   */
  private scheduleReconnect(session: RoomSession): void {
    session.reconnectAttempts++;
    const delay =
      this.reconnectDelayMs * Math.pow(2, session.reconnectAttempts - 1);

    console.log(
      `[OpenAI] Scheduling reconnect for room ${session.roomId} in ${delay}ms (attempt ${session.reconnectAttempts})`,
    );

    session.reconnectTimer = setTimeout(async () => {
      try {
        await this.connect(session);
      } catch (error) {
        console.error(
          `[OpenAI] Reconnection failed for room ${session.roomId}:`,
          error,
        );
        if (session.reconnectAttempts >= this.maxReconnectAttempts) {
          this.callbacks.onError?.(
            session.roomId,
            "Max reconnection attempts reached",
          );
          this.sessions.delete(session.roomId);
        }
      }
    }, delay);
  }
}

/**
 * Create OpenAI Realtime client instance
 */
export function createOpenAIRealtimeClient(
  config: OpenAIRealtimeConfig,
  callbacks?: OpenAIRealtimeCallbacks,
): OpenAIRealtimeClient {
  return new OpenAIRealtimeClient(config, callbacks);
}

export default OpenAIRealtimeClient;
