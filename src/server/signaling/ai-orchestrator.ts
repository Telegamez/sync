/**
 * AI Orchestrator
 *
 * Manages a single OpenAI Realtime API connection per room.
 * Handles session lifecycle, token refresh, and reconnection.
 *
 * Part of the Long-Horizon Engineering Protocol - FEAT-300
 */

import { nanoid } from 'nanoid';
import type { RoomId } from '@/types/room';
import type { PeerId } from '@/types/peer';
import type { AIResponseState, RoomAIState } from '@/types/voice-mode';
import { AILockingManager, type AILockingManagerCallbacks } from './ai-locking';

/**
 * OpenAI session configuration
 */
export interface OpenAISessionConfig {
  /** OpenAI API key */
  apiKey: string;
  /** Model to use (default: gpt-4o-realtime-preview-2024-12-17) */
  model?: string;
  /** Voice for AI responses */
  voice?: 'alloy' | 'echo' | 'shimmer' | 'ash' | 'ballad' | 'coral' | 'sage' | 'verse';
  /** System instructions for the AI */
  instructions?: string;
  /** Temperature for responses (0-2) */
  temperature?: number;
  /** Maximum response output tokens */
  maxResponseOutputTokens?: number | 'inf';
  /** Input audio format */
  inputAudioFormat?: 'pcm16' | 'g711_ulaw' | 'g711_alaw';
  /** Output audio format */
  outputAudioFormat?: 'pcm16' | 'g711_ulaw' | 'g711_alaw';
  /** Turn detection configuration */
  turnDetection?: {
    type: 'server_vad';
    threshold?: number;
    prefixPaddingMs?: number;
    silenceDurationMs?: number;
  } | null;
}

/**
 * AI session state
 */
export type AISessionState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'error'
  | 'reconnecting';

/**
 * AI session info
 */
export interface AISessionInfo {
  /** Unique session ID */
  sessionId: string;
  /** Room this session belongs to */
  roomId: RoomId;
  /** Current session state */
  state: AISessionState;
  /** When the session was created */
  createdAt: Date;
  /** When the session was last active */
  lastActiveAt: Date;
  /** Number of reconnection attempts */
  reconnectAttempts: number;
  /** Last error message if any */
  lastError?: string;
  /** Whether the session is healthy */
  isHealthy: boolean;
}

/**
 * AI Orchestrator options
 */
export interface AIOrchestatorOptions {
  /** OpenAI session configuration */
  openaiConfig: OpenAISessionConfig;
  /** Maximum reconnection attempts */
  maxReconnectAttempts?: number;
  /** Reconnection delay in ms (doubles on each attempt) */
  reconnectDelayMs?: number;
  /** Session timeout in ms (for long-running sessions) */
  sessionTimeoutMs?: number;
  /** Health check interval in ms */
  healthCheckIntervalMs?: number;
  /** Enable automatic token refresh */
  enableTokenRefresh?: boolean;
  /** Token refresh interval in ms */
  tokenRefreshIntervalMs?: number;
}

/**
 * AI Orchestrator callbacks
 */
export interface AIOrchestatorCallbacks {
  /** Called when session state changes */
  onSessionStateChange?: (roomId: RoomId, session: AISessionInfo) => void;
  /** Called when audio response starts */
  onAudioResponseStart?: (roomId: RoomId) => void;
  /** Called when audio data is received */
  onAudioData?: (roomId: RoomId, audioData: ArrayBuffer) => void;
  /** Called when audio response ends */
  onAudioResponseEnd?: (roomId: RoomId) => void;
  /** Called when transcription is received */
  onTranscription?: (roomId: RoomId, text: string, isFinal: boolean) => void;
  /** Called when AI state changes */
  onAIStateChange?: (roomId: RoomId, state: RoomAIState) => void;
  /** Called on error */
  onError?: (roomId: RoomId, error: string) => void;
  /** Called when token needs refresh */
  onTokenRefreshNeeded?: (roomId: RoomId) => Promise<string>;
}

/**
 * Per-room session state
 */
interface RoomSession {
  info: AISessionInfo;
  config: OpenAISessionConfig;
  lockingManager: AILockingManager;
  reconnectTimer?: ReturnType<typeof setTimeout>;
  healthCheckTimer?: ReturnType<typeof setInterval>;
  tokenRefreshTimer?: ReturnType<typeof setInterval>;
  // In a real implementation, this would be a WebSocket or RTCPeerConnection
  // For now, we mock the connection state
  isConnected: boolean;
}

/**
 * Default options
 */
const DEFAULT_OPTIONS: Required<Omit<AIOrchestatorOptions, 'openaiConfig'>> = {
  maxReconnectAttempts: 5,
  reconnectDelayMs: 1000,
  sessionTimeoutMs: 3600000, // 1 hour
  healthCheckIntervalMs: 30000, // 30 seconds
  enableTokenRefresh: true,
  tokenRefreshIntervalMs: 300000, // 5 minutes
};

/**
 * Default OpenAI config
 */
const DEFAULT_OPENAI_CONFIG: Partial<OpenAISessionConfig> = {
  model: 'gpt-4o-realtime-preview-2024-12-17',
  voice: 'alloy',
  temperature: 0.8,
  maxResponseOutputTokens: 4096,
  inputAudioFormat: 'pcm16',
  outputAudioFormat: 'pcm16',
  turnDetection: {
    type: 'server_vad',
    threshold: 0.5,
    prefixPaddingMs: 300,
    silenceDurationMs: 500,
  },
};

/**
 * AI Orchestrator
 *
 * Manages single OpenAI Realtime API connection per room.
 *
 * @example
 * ```typescript
 * const orchestrator = new AIOrchestrator({
 *   openaiConfig: { apiKey: process.env.OPENAI_API_KEY! },
 * }, {
 *   onAudioData: (roomId, data) => {
 *     io.to(roomId).emit('ai:audio', data);
 *   },
 * });
 *
 * // Create session for a room
 * await orchestrator.createSession('room-123', {
 *   instructions: 'You are a helpful AI assistant.',
 * });
 *
 * // Send audio input
 * orchestrator.sendAudioInput('room-123', audioChunk);
 *
 * // Cleanup
 * orchestrator.destroySession('room-123');
 * ```
 */
export class AIOrchestrator {
  private sessions = new Map<RoomId, RoomSession>();
  private options: Required<Omit<AIOrchestatorOptions, 'openaiConfig'>> & {
    openaiConfig: OpenAISessionConfig;
  };
  private callbacks: AIOrchestatorCallbacks;

  constructor(
    options: AIOrchestatorOptions,
    callbacks: AIOrchestatorCallbacks = {}
  ) {
    this.options = {
      ...DEFAULT_OPTIONS,
      ...options,
      openaiConfig: { ...DEFAULT_OPENAI_CONFIG, ...options.openaiConfig },
    };
    this.callbacks = callbacks;
  }

  /**
   * Create an AI session for a room
   */
  async createSession(
    roomId: RoomId,
    config?: Partial<OpenAISessionConfig>
  ): Promise<AISessionInfo> {
    // Check if session already exists
    if (this.sessions.has(roomId)) {
      const existing = this.sessions.get(roomId)!;
      return existing.info;
    }

    const sessionId = nanoid(16);
    const now = new Date();

    // Merge configs
    const sessionConfig: OpenAISessionConfig = {
      ...this.options.openaiConfig,
      ...config,
    };

    // Create AI locking manager for this room
    const lockingCallbacks: AILockingManagerCallbacks = {
      onStateChange: (rId, event) => {
        this.callbacks.onAIStateChange?.(rId, event.state);
      },
      onError: (rId, error) => {
        this.callbacks.onError?.(rId, error);
      },
    };

    const lockingManager = new AILockingManager({}, lockingCallbacks);
    lockingManager.initRoom(roomId);

    // Create session info
    const info: AISessionInfo = {
      sessionId,
      roomId,
      state: 'connecting',
      createdAt: now,
      lastActiveAt: now,
      reconnectAttempts: 0,
      isHealthy: false,
    };

    // Create room session
    const session: RoomSession = {
      info,
      config: sessionConfig,
      lockingManager,
      isConnected: false,
    };

    this.sessions.set(roomId, session);

    // Notify state change
    this.callbacks.onSessionStateChange?.(roomId, info);

    // Attempt to connect
    await this.connect(roomId);

    return info;
  }

  /**
   * Destroy an AI session for a room
   */
  destroySession(roomId: RoomId): boolean {
    const session = this.sessions.get(roomId);
    if (!session) return false;

    // Clear all timers
    if (session.reconnectTimer) {
      clearTimeout(session.reconnectTimer);
    }
    if (session.healthCheckTimer) {
      clearInterval(session.healthCheckTimer);
    }
    if (session.tokenRefreshTimer) {
      clearInterval(session.tokenRefreshTimer);
    }

    // Disconnect
    this.disconnect(roomId);

    // Clean up locking manager
    session.lockingManager.removeRoom(roomId);

    // Remove session
    this.sessions.delete(roomId);

    return true;
  }

  /**
   * Get session info for a room
   */
  getSession(roomId: RoomId): AISessionInfo | undefined {
    return this.sessions.get(roomId)?.info;
  }

  /**
   * Get AI state for a room
   */
  getAIState(roomId: RoomId): RoomAIState | undefined {
    return this.sessions.get(roomId)?.lockingManager.getAIState(roomId);
  }

  /**
   * Check if a room has an active session
   */
  hasSession(roomId: RoomId): boolean {
    return this.sessions.has(roomId);
  }

  /**
   * Get all active session room IDs
   */
  getActiveRoomIds(): RoomId[] {
    return Array.from(this.sessions.keys());
  }

  /**
   * Get session count
   */
  getSessionCount(): number {
    return this.sessions.size;
  }

  /**
   * Request a turn to address the AI
   */
  requestTurn(
    roomId: RoomId,
    peerId: PeerId,
    peerDisplayName: string,
    priority: number = 0
  ): { requestId: string; position: number } | null {
    const session = this.sessions.get(roomId);
    if (!session) return null;

    const request = session.lockingManager.requestTurn(
      roomId,
      peerId,
      peerDisplayName,
      priority
    );

    if (!request) return null;

    return {
      requestId: request.id,
      position: request.position,
    };
  }

  /**
   * Cancel a turn request
   */
  cancelTurn(roomId: RoomId, requestId: string): boolean {
    const session = this.sessions.get(roomId);
    if (!session) return false;

    return session.lockingManager.cancelRequest(roomId, requestId);
  }

  /**
   * Get queue position for a peer
   */
  getQueuePosition(roomId: RoomId, peerId: PeerId): number {
    const session = this.sessions.get(roomId);
    if (!session) return 0;

    return session.lockingManager.getQueuePosition(roomId, peerId);
  }

  /**
   * Check if a peer can request a turn
   */
  canRequestTurn(
    roomId: RoomId,
    peerId: PeerId
  ): { allowed: boolean; reason?: string } {
    const session = this.sessions.get(roomId);
    if (!session) {
      return { allowed: false, reason: 'No active AI session' };
    }

    return session.lockingManager.canRequestTurn(roomId, peerId);
  }

  /**
   * Start listening (peer is addressing AI)
   */
  startListening(roomId: RoomId, peerId: PeerId): boolean {
    const session = this.sessions.get(roomId);
    if (!session) return false;

    const started = session.lockingManager.startListening(roomId, peerId);
    if (started) {
      session.info.lastActiveAt = new Date();
    }
    return started;
  }

  /**
   * Start processing (VAD ended, waiting for AI)
   */
  startProcessing(roomId: RoomId): boolean {
    const session = this.sessions.get(roomId);
    if (!session) return false;

    return session.lockingManager.startProcessing(roomId);
  }

  /**
   * Start speaking (AI is responding)
   */
  startSpeaking(roomId: RoomId): boolean {
    const session = this.sessions.get(roomId);
    if (!session) return false;

    const started = session.lockingManager.startSpeaking(roomId);
    if (started) {
      this.callbacks.onAudioResponseStart?.(roomId);
    }
    return started;
  }

  /**
   * Finish speaking (AI response complete)
   */
  finishSpeaking(roomId: RoomId): boolean {
    const session = this.sessions.get(roomId);
    if (!session) return false;

    const finished = session.lockingManager.finishSpeaking(roomId);
    if (finished) {
      session.info.lastActiveAt = new Date();
      this.callbacks.onAudioResponseEnd?.(roomId);
    }
    return finished;
  }

  /**
   * Interrupt AI response
   */
  interrupt(roomId: RoomId, interruptedBy: PeerId, reason?: string): boolean {
    const session = this.sessions.get(roomId);
    if (!session) return false;

    return session.lockingManager.interrupt(roomId, interruptedBy, reason);
  }

  /**
   * Send audio input to AI
   *
   * Note: In a real implementation, this would send audio to the OpenAI
   * WebSocket connection. For now, this is a placeholder.
   */
  sendAudioInput(roomId: RoomId, audioData: ArrayBuffer): boolean {
    const session = this.sessions.get(roomId);
    if (!session || !session.isConnected) return false;

    session.info.lastActiveAt = new Date();

    // In real implementation:
    // - Encode audio to base64
    // - Send input_audio_buffer.append event to OpenAI
    // - Handle response streaming

    return true;
  }

  /**
   * Commit audio buffer (for manual VAD mode)
   */
  commitAudioBuffer(roomId: RoomId): boolean {
    const session = this.sessions.get(roomId);
    if (!session || !session.isConnected) return false;

    // In real implementation:
    // - Send input_audio_buffer.commit event to OpenAI
    // - Transition to processing state

    this.startProcessing(roomId);
    return true;
  }

  /**
   * Update session configuration
   */
  updateSessionConfig(
    roomId: RoomId,
    config: Partial<OpenAISessionConfig>
  ): boolean {
    const session = this.sessions.get(roomId);
    if (!session) return false;

    session.config = { ...session.config, ...config };

    // In real implementation:
    // - Send session.update event to OpenAI

    return true;
  }

  /**
   * Reconnect a disconnected session
   */
  async reconnect(roomId: RoomId): Promise<boolean> {
    const session = this.sessions.get(roomId);
    if (!session) return false;

    if (session.info.state === 'connected') {
      return true;
    }

    session.info.state = 'reconnecting';
    session.info.reconnectAttempts++;
    this.callbacks.onSessionStateChange?.(roomId, session.info);

    return this.connect(roomId);
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
   * Connect to OpenAI for a room
   */
  private async connect(roomId: RoomId): Promise<boolean> {
    const session = this.sessions.get(roomId);
    if (!session) return false;

    try {
      // In real implementation:
      // 1. Create WebSocket connection to OpenAI Realtime API
      // 2. Send session.create or session.update with config
      // 3. Set up event handlers for:
      //    - session.created
      //    - session.updated
      //    - input_audio_buffer.speech_started
      //    - input_audio_buffer.speech_stopped
      //    - response.created
      //    - response.output_item.added
      //    - response.audio.delta
      //    - response.audio.done
      //    - response.done
      //    - error

      // Simulate successful connection
      session.isConnected = true;
      session.info.state = 'connected';
      session.info.isHealthy = true;
      session.info.lastActiveAt = new Date();
      session.info.reconnectAttempts = 0;
      session.info.lastError = undefined;

      // Start health check
      this.startHealthCheck(roomId);

      // Start token refresh if enabled
      if (this.options.enableTokenRefresh) {
        this.startTokenRefresh(roomId);
      }

      this.callbacks.onSessionStateChange?.(roomId, session.info);

      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      session.info.state = 'error';
      session.info.isHealthy = false;
      session.info.lastError = errorMessage;
      session.isConnected = false;

      this.callbacks.onSessionStateChange?.(roomId, session.info);
      this.callbacks.onError?.(roomId, errorMessage);

      // Schedule reconnection if under max attempts
      if (session.info.reconnectAttempts < this.options.maxReconnectAttempts) {
        this.scheduleReconnect(roomId);
      }

      return false;
    }
  }

  /**
   * Disconnect from OpenAI for a room
   */
  private disconnect(roomId: RoomId): void {
    const session = this.sessions.get(roomId);
    if (!session) return;

    // In real implementation:
    // - Close WebSocket connection
    // - Clean up event handlers

    session.isConnected = false;
    session.info.state = 'disconnected';
    session.info.isHealthy = false;

    this.callbacks.onSessionStateChange?.(roomId, session.info);
  }

  /**
   * Schedule a reconnection attempt
   */
  private scheduleReconnect(roomId: RoomId): void {
    const session = this.sessions.get(roomId);
    if (!session) return;

    // Clear existing timer
    if (session.reconnectTimer) {
      clearTimeout(session.reconnectTimer);
    }

    // Calculate delay with exponential backoff
    const delay =
      this.options.reconnectDelayMs *
      Math.pow(2, session.info.reconnectAttempts - 1);

    session.reconnectTimer = setTimeout(() => {
      this.reconnect(roomId);
    }, delay);
  }

  /**
   * Start health check interval
   */
  private startHealthCheck(roomId: RoomId): void {
    const session = this.sessions.get(roomId);
    if (!session) return;

    // Clear existing timer
    if (session.healthCheckTimer) {
      clearInterval(session.healthCheckTimer);
    }

    session.healthCheckTimer = setInterval(() => {
      this.performHealthCheck(roomId);
    }, this.options.healthCheckIntervalMs);
  }

  /**
   * Perform health check
   */
  private performHealthCheck(roomId: RoomId): void {
    const session = this.sessions.get(roomId);
    if (!session) return;

    // Check if session has been idle too long
    const now = Date.now();
    const lastActive = session.info.lastActiveAt.getTime();
    const idleTime = now - lastActive;

    if (idleTime > this.options.sessionTimeoutMs) {
      // Session timed out
      session.info.isHealthy = false;
      session.info.lastError = 'Session timeout due to inactivity';
      this.callbacks.onError?.(roomId, session.info.lastError);
    }

    // In real implementation:
    // - Send ping to OpenAI WebSocket
    // - Check for response timeout
    // - Update health status
  }

  /**
   * Start token refresh interval
   */
  private startTokenRefresh(roomId: RoomId): void {
    const session = this.sessions.get(roomId);
    if (!session) return;

    // Clear existing timer
    if (session.tokenRefreshTimer) {
      clearInterval(session.tokenRefreshTimer);
    }

    session.tokenRefreshTimer = setInterval(async () => {
      await this.refreshToken(roomId);
    }, this.options.tokenRefreshIntervalMs);
  }

  /**
   * Refresh API token
   */
  private async refreshToken(roomId: RoomId): Promise<void> {
    const session = this.sessions.get(roomId);
    if (!session) return;

    if (!this.callbacks.onTokenRefreshNeeded) return;

    try {
      const newToken = await this.callbacks.onTokenRefreshNeeded(roomId);
      session.config.apiKey = newToken;

      // In real implementation:
      // - Use new token for subsequent API calls
      // - May need to reconnect with new token
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      session.info.lastError = `Token refresh failed: ${errorMessage}`;
      this.callbacks.onError?.(roomId, session.info.lastError);
    }
  }

  /**
   * Handle incoming audio from OpenAI
   *
   * This would be called by the WebSocket event handler in a real implementation.
   */
  handleAudioResponse(roomId: RoomId, audioData: ArrayBuffer): void {
    const session = this.sessions.get(roomId);
    if (!session) return;

    session.info.lastActiveAt = new Date();

    // Notify of audio data
    this.callbacks.onAudioData?.(roomId, audioData);
  }

  /**
   * Handle transcription from OpenAI
   *
   * This would be called by the WebSocket event handler in a real implementation.
   */
  handleTranscription(roomId: RoomId, text: string, isFinal: boolean): void {
    const session = this.sessions.get(roomId);
    if (!session) return;

    session.info.lastActiveAt = new Date();

    // Notify of transcription
    this.callbacks.onTranscription?.(roomId, text, isFinal);
  }
}

/**
 * Create AI orchestrator instance
 */
export function createAIOrchestrator(
  options: AIOrchestatorOptions,
  callbacks?: AIOrchestatorCallbacks
): AIOrchestrator {
  return new AIOrchestrator(options, callbacks);
}

export default AIOrchestrator;
