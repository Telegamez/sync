/**
 * Transcription Service
 *
 * WebSocket client for OpenAI's gpt-4o-mini-transcribe model.
 * Handles real-time ambient audio transcription for room conversations.
 *
 * Part of the Long-Horizon Engineering Protocol - FEAT-502
 */

import WebSocket from "ws";
import type { RoomId } from "@/types/room";
import type { PeerId } from "@/types/peer";
import type { TranscriptEntryType } from "@/types/transcript";

/**
 * OpenAI Realtime Transcription WebSocket endpoint
 */
const OPENAI_TRANSCRIPTION_WS_URL =
  "wss://api.openai.com/v1/realtime?intent=transcription";

/**
 * Model for transcription (cost-efficient option)
 */
const TRANSCRIPTION_MODEL = "gpt-4o-mini-transcribe";

/**
 * Transcription service configuration
 */
export interface TranscriptionServiceConfig {
  /** OpenAI API key */
  apiKey: string;
  /** Language for transcription (default: en) */
  language?: string;
  /** Sample rate for audio (default: 24000) */
  sampleRate?: number;
  /** Audio encoding format */
  audioFormat?: "pcm16" | "g711_ulaw" | "g711_alaw";
}

/**
 * Transcription result
 */
export interface TranscriptionResult {
  /** Room the transcription belongs to */
  roomId: RoomId;
  /** Speaker peer ID */
  speakerId: PeerId;
  /** Speaker display name */
  speakerName: string;
  /** Transcribed text */
  text: string;
  /** Whether this is a final or partial result */
  isFinal: boolean;
  /** Entry type (ambient for room transcription) */
  type: TranscriptEntryType;
  /** Timestamp of the transcription */
  timestamp: Date;
  /** Estimated duration in milliseconds */
  durationMs?: number;
}

/**
 * Transcription service callbacks
 */
export interface TranscriptionServiceCallbacks {
  /** Called when transcription text is received */
  onTranscript?: (result: TranscriptionResult) => void;
  /** Called on transcription error */
  onError?: (roomId: RoomId, error: string) => void;
  /** Called when session is ready */
  onReady?: (roomId: RoomId) => void;
  /** Called when session closes */
  onClose?: (roomId: RoomId) => void;
}

/**
 * Per-room transcription session state
 */
interface TranscriptionSession {
  roomId: RoomId;
  ws: WebSocket | null;
  isConnecting: boolean;
  isConnected: boolean;
  reconnectAttempts: number;
  reconnectTimer?: NodeJS.Timeout;
  /** Current speaker for audio being streamed */
  activeSpeakerId: PeerId | null;
  activeSpeakerName: string | null;
  /** Buffer for partial transcription */
  partialText: string;
  /** Track audio start time for duration calculation */
  audioStartTime: Date | null;
}

/**
 * Transcription Service
 *
 * Manages WebSocket connections to OpenAI's transcription API for
 * real-time ambient audio transcription in room conversations.
 *
 * @example
 * ```ts
 * const service = new TranscriptionService({
 *   apiKey: process.env.OPENAI_API_KEY!,
 * }, {
 *   onTranscript: (result) => {
 *     console.log(`${result.speakerName}: ${result.text}`);
 *   },
 * });
 *
 * // Create session for a room
 * await service.createSession('room-123');
 *
 * // Stream audio with speaker attribution
 * service.setActiveSpeaker('room-123', 'peer-1', 'Alice');
 * service.streamAudio('room-123', audioBase64);
 *
 * // Cleanup
 * service.destroySession('room-123');
 * ```
 */
export class TranscriptionService {
  private config: TranscriptionServiceConfig;
  private callbacks: TranscriptionServiceCallbacks;
  private sessions = new Map<RoomId, TranscriptionSession>();
  private maxReconnectAttempts = 3;
  private reconnectDelayMs = 2000;

  constructor(
    config: TranscriptionServiceConfig,
    callbacks: TranscriptionServiceCallbacks = {},
  ) {
    this.config = config;
    this.callbacks = callbacks;
  }

  /**
   * Create a transcription session for a room
   */
  async createSession(roomId: RoomId): Promise<boolean> {
    // Check if session already exists
    if (this.sessions.has(roomId)) {
      const existing = this.sessions.get(roomId)!;
      if (existing.isConnected || existing.isConnecting) {
        console.log(
          `[Transcription] Session already exists for room ${roomId}`,
        );
        return true;
      }
    }

    const session: TranscriptionSession = {
      roomId,
      ws: null,
      isConnecting: true,
      isConnected: false,
      reconnectAttempts: 0,
      activeSpeakerId: null,
      activeSpeakerName: null,
      partialText: "",
      audioStartTime: null,
    };

    this.sessions.set(roomId, session);

    try {
      await this.connect(session);
      return true;
    } catch (error) {
      console.error(
        `[Transcription] Failed to create session for room ${roomId}:`,
        error,
      );
      this.sessions.delete(roomId);
      return false;
    }
  }

  /**
   * Destroy a transcription session for a room
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
    console.log(`[Transcription] Destroyed session for room ${roomId}`);
    this.callbacks.onClose?.(roomId);
  }

  /**
   * Check if a room has an active transcription session
   */
  hasSession(roomId: RoomId): boolean {
    const session = this.sessions.get(roomId);
    return session?.isConnected ?? false;
  }

  /**
   * Set the active speaker for audio being streamed
   * Call this before streaming audio to attribute transcripts correctly
   */
  setActiveSpeaker(
    roomId: RoomId,
    peerId: PeerId,
    displayName: string,
  ): boolean {
    const session = this.sessions.get(roomId);
    if (!session) return false;

    session.activeSpeakerId = peerId;
    session.activeSpeakerName = displayName;
    session.partialText = "";
    session.audioStartTime = new Date();

    return true;
  }

  /**
   * Clear the active speaker (when speech ends)
   */
  clearActiveSpeaker(roomId: RoomId): void {
    const session = this.sessions.get(roomId);
    if (!session) return;

    session.activeSpeakerId = null;
    session.activeSpeakerName = null;
    session.partialText = "";
    session.audioStartTime = null;
  }

  /**
   * Stream audio data to the transcription service
   * @param roomId - Room to stream audio for
   * @param audioBase64 - Base64 encoded PCM16 audio data
   */
  streamAudio(roomId: RoomId, audioBase64: string): boolean {
    const session = this.sessions.get(roomId);
    if (!session || !session.ws || session.ws.readyState !== WebSocket.OPEN) {
      return false;
    }

    // Track audio start time if not set
    if (!session.audioStartTime) {
      session.audioStartTime = new Date();
    }

    // Send audio to OpenAI
    const event = {
      type: "input_audio_buffer.append",
      audio: audioBase64,
    };

    session.ws.send(JSON.stringify(event));
    return true;
  }

  /**
   * Commit the audio buffer to trigger transcription
   * Call this when speech detection indicates end of utterance
   */
  commitAudio(roomId: RoomId): boolean {
    const session = this.sessions.get(roomId);
    if (!session || !session.ws || session.ws.readyState !== WebSocket.OPEN) {
      return false;
    }

    const commitEvent = {
      type: "input_audio_buffer.commit",
    };
    session.ws.send(JSON.stringify(commitEvent));

    return true;
  }

  /**
   * Clear the audio buffer without transcribing
   */
  clearAudio(roomId: RoomId): boolean {
    const session = this.sessions.get(roomId);
    if (!session || !session.ws || session.ws.readyState !== WebSocket.OPEN) {
      return false;
    }

    const clearEvent = {
      type: "input_audio_buffer.clear",
    };
    session.ws.send(JSON.stringify(clearEvent));

    session.partialText = "";
    session.audioStartTime = null;

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
   * Connect to OpenAI Transcription WebSocket
   */
  private async connect(session: TranscriptionSession): Promise<void> {
    return new Promise((resolve, reject) => {
      const url = OPENAI_TRANSCRIPTION_WS_URL;

      console.log(
        `[Transcription] Connecting to ${url} for room ${session.roomId}`,
      );

      const ws = new WebSocket(url, {
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          "OpenAI-Beta": "realtime=v1",
        },
      });

      session.ws = ws;

      ws.on("open", () => {
        console.log(
          `[Transcription] WebSocket connected for room ${session.roomId}`,
        );
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
          `[Transcription] WebSocket error for room ${session.roomId}:`,
          error.message,
        );
        this.callbacks.onError?.(session.roomId, error.message);

        if (session.isConnecting) {
          reject(error);
        }
      });

      ws.on("close", (code: number, reason: Buffer) => {
        console.log(
          `[Transcription] WebSocket closed for room ${session.roomId}: ${code} ${reason.toString()}`,
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
   * Send session configuration for transcription
   */
  private sendSessionConfig(session: TranscriptionSession): void {
    if (!session.ws || session.ws.readyState !== WebSocket.OPEN) return;

    const config = {
      type: "transcription_session.update",
      session: {
        input_audio_format: this.config.audioFormat || "pcm16",
        input_audio_transcription: {
          model: TRANSCRIPTION_MODEL,
          language: this.config.language || "en",
        },
        turn_detection: {
          type: "server_vad",
          threshold: 0.5,
          prefix_padding_ms: 300,
          silence_duration_ms: 500,
        },
      },
    };

    session.ws.send(JSON.stringify(config));
    console.log(
      `[Transcription] Session configured for room ${session.roomId}`,
    );
  }

  /**
   * Handle incoming WebSocket message
   */
  private handleMessage(session: TranscriptionSession, data: string): void {
    try {
      const event = JSON.parse(data);

      // Log important events
      const importantEvents = [
        "transcription_session.created",
        "transcription_session.updated",
        "error",
        "input_audio_buffer.speech_started",
        "input_audio_buffer.speech_stopped",
        "conversation.item.input_audio_transcription.completed",
      ];

      if (importantEvents.includes(event.type)) {
        console.log(`[Transcription] Room ${session.roomId}: ${event.type}`);
      }

      switch (event.type) {
        case "transcription_session.created":
        case "transcription_session.updated":
          // Session ready
          break;

        case "input_audio_buffer.speech_started":
          // VAD detected speech start
          if (!session.audioStartTime) {
            session.audioStartTime = new Date();
          }
          break;

        case "input_audio_buffer.speech_stopped":
          // VAD detected speech end - commit will be automatic
          break;

        case "conversation.item.input_audio_transcription.delta":
          // Partial transcription
          if (event.delta) {
            session.partialText += event.delta;
            this.emitTranscription(session, session.partialText, false);
          }
          break;

        case "conversation.item.input_audio_transcription.completed":
          // Final transcription
          if (event.transcript) {
            const durationMs = session.audioStartTime
              ? Date.now() - session.audioStartTime.getTime()
              : undefined;

            this.emitTranscription(session, event.transcript, true, durationMs);

            // Reset for next utterance
            session.partialText = "";
            session.audioStartTime = null;
          }
          break;

        case "error":
          console.error(
            `[Transcription] Room ${session.roomId} error:`,
            event.error,
          );
          this.callbacks.onError?.(
            session.roomId,
            event.error?.message || "Unknown error",
          );
          break;
      }
    } catch (error) {
      console.error(
        `[Transcription] Failed to parse message for room ${session.roomId}:`,
        error,
      );
    }
  }

  /**
   * Emit transcription result through callback
   */
  private emitTranscription(
    session: TranscriptionSession,
    text: string,
    isFinal: boolean,
    durationMs?: number,
  ): void {
    if (!text.trim()) return;

    // Skip if no active speaker (audio not attributed)
    if (!session.activeSpeakerId || !session.activeSpeakerName) {
      console.log(
        `[Transcription] Room ${session.roomId}: Skipping unattributed transcription`,
      );
      return;
    }

    const result: TranscriptionResult = {
      roomId: session.roomId,
      speakerId: session.activeSpeakerId,
      speakerName: session.activeSpeakerName,
      text: text.trim(),
      isFinal,
      type: "ambient",
      timestamp: new Date(),
      durationMs,
    };

    this.callbacks.onTranscript?.(result);
  }

  /**
   * Schedule reconnection attempt
   */
  private scheduleReconnect(session: TranscriptionSession): void {
    session.reconnectAttempts++;
    const delay =
      this.reconnectDelayMs * Math.pow(2, session.reconnectAttempts - 1);

    console.log(
      `[Transcription] Scheduling reconnect for room ${session.roomId} in ${delay}ms (attempt ${session.reconnectAttempts})`,
    );

    session.reconnectTimer = setTimeout(async () => {
      try {
        await this.connect(session);
      } catch (error) {
        console.error(
          `[Transcription] Reconnection failed for room ${session.roomId}:`,
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
 * Create transcription service instance
 */
export function createTranscriptionService(
  config: TranscriptionServiceConfig,
  callbacks?: TranscriptionServiceCallbacks,
): TranscriptionService {
  return new TranscriptionService(config, callbacks);
}

export default TranscriptionService;
