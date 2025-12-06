/**
 * AI Response Locking Manager
 *
 * Manages AI response state and turn queue for multi-peer rooms.
 * Prevents AI interruption chaos by locking during responses and
 * queueing turn requests.
 *
 * Part of the Long-Horizon Engineering Protocol - FEAT-152
 */

import { nanoid } from 'nanoid';
import type { PeerId } from '@/types/peer';
import type { RoomId } from '@/types/room';
import type {
  AIResponseState,
  RoomAIState,
  TurnRequest,
  TurnQueueState,
  AIStateEvent,
  AIStateEventType,
  RoomVoiceSettings,
} from '@/types/voice-mode';

/**
 * AI Locking Manager options
 */
export interface AILockingManagerOptions {
  /** Default lock timeout in ms (safety mechanism) */
  defaultLockTimeoutMs?: number;
  /** Maximum queue size per room */
  maxQueueSize?: number;
  /** Default queue request timeout in ms */
  defaultQueueTimeoutMs?: number;
  /** Whether to auto-process queue on response complete */
  autoProcessQueue?: boolean;
}

/**
 * AI Locking Manager callbacks
 */
export interface AILockingManagerCallbacks {
  /** Called when AI state changes */
  onStateChange?: (roomId: RoomId, event: AIStateEvent) => void;
  /** Called when queue is updated */
  onQueueUpdate?: (roomId: RoomId, queue: TurnQueueState) => void;
  /** Called when a turn starts */
  onTurnStart?: (roomId: RoomId, request: TurnRequest) => void;
  /** Called when a turn ends */
  onTurnEnd?: (roomId: RoomId, request: TurnRequest) => void;
  /** Called on AI error */
  onError?: (roomId: RoomId, error: string) => void;
}

/**
 * Per-room state
 */
interface RoomState {
  aiState: RoomAIState;
  voiceSettings: RoomVoiceSettings;
  lockTimeoutTimer?: ReturnType<typeof setTimeout>;
  queueTimeoutTimers: Map<string, ReturnType<typeof setTimeout>>;
}

/**
 * Default options
 */
const DEFAULT_OPTIONS: Required<AILockingManagerOptions> = {
  defaultLockTimeoutMs: 120000, // 2 minutes
  maxQueueSize: 10,
  defaultQueueTimeoutMs: 30000, // 30 seconds
  autoProcessQueue: true,
};

/**
 * AI Locking Manager
 *
 * Manages AI response locking and turn queue for a room.
 *
 * @example
 * ```typescript
 * const manager = new AILockingManager({
 *   defaultLockTimeoutMs: 60000,
 * }, {
 *   onStateChange: (roomId, event) => {
 *     io.to(roomId).emit('ai:state', event);
 *   },
 * });
 *
 * // Start a turn
 * const request = manager.requestTurn(roomId, peerId, 'Alice');
 * if (request) {
 *   manager.startListening(roomId, peerId);
 * }
 *
 * // AI starts speaking
 * manager.startSpeaking(roomId);
 *
 * // AI finishes
 * manager.finishSpeaking(roomId);
 * ```
 */
export class AILockingManager {
  private rooms = new Map<RoomId, RoomState>();
  private options: Required<AILockingManagerOptions>;
  private callbacks: AILockingManagerCallbacks;

  constructor(
    options: AILockingManagerOptions = {},
    callbacks: AILockingManagerCallbacks = {}
  ) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.callbacks = callbacks;
  }

  /**
   * Initialize a room for AI management
   */
  initRoom(roomId: RoomId, voiceSettings?: Partial<RoomVoiceSettings>): void {
    if (this.rooms.has(roomId)) {
      return;
    }

    const state: RoomState = {
      aiState: this.createInitialAIState(),
      voiceSettings: {
        mode: voiceSettings?.mode ?? 'pushToTalk',
        lockDuringResponse: voiceSettings?.lockDuringResponse ?? true,
        enableQueue: voiceSettings?.enableQueue ?? true,
        maxQueueSize: voiceSettings?.maxQueueSize ?? this.options.maxQueueSize,
        queueTimeoutMs: voiceSettings?.queueTimeoutMs ?? this.options.defaultQueueTimeoutMs,
        enablePeerAudio: voiceSettings?.enablePeerAudio ?? true,
        allowInterrupt: voiceSettings?.allowInterrupt ?? true,
        designatedSpeakers: voiceSettings?.designatedSpeakers,
        wakeWord: voiceSettings?.wakeWord,
      },
      queueTimeoutTimers: new Map(),
    };

    this.rooms.set(roomId, state);
  }

  /**
   * Remove a room from management
   */
  removeRoom(roomId: RoomId): void {
    const state = this.rooms.get(roomId);
    if (!state) return;

    // Clear all timers
    if (state.lockTimeoutTimer) {
      clearTimeout(state.lockTimeoutTimer);
    }
    state.queueTimeoutTimers.forEach((timer) => clearTimeout(timer));

    this.rooms.delete(roomId);
  }

  /**
   * Get current AI state for a room
   */
  getAIState(roomId: RoomId): RoomAIState | undefined {
    return this.rooms.get(roomId)?.aiState;
  }

  /**
   * Get voice settings for a room
   */
  getVoiceSettings(roomId: RoomId): RoomVoiceSettings | undefined {
    return this.rooms.get(roomId)?.voiceSettings;
  }

  /**
   * Update voice settings for a room
   */
  updateVoiceSettings(roomId: RoomId, settings: Partial<RoomVoiceSettings>): void {
    const state = this.rooms.get(roomId);
    if (!state) return;

    state.voiceSettings = { ...state.voiceSettings, ...settings };
  }

  /**
   * Request a turn to address the AI
   */
  requestTurn(
    roomId: RoomId,
    peerId: PeerId,
    peerDisplayName: string,
    priority: number = 0
  ): TurnRequest | null {
    const state = this.rooms.get(roomId);
    if (!state) return null;

    const { aiState, voiceSettings } = state;

    // If queue is disabled and AI is busy, reject
    if (!voiceSettings.enableQueue && aiState.state !== 'idle') {
      return null;
    }

    // Check queue size limit
    if (aiState.queue.queue.length >= voiceSettings.maxQueueSize) {
      return null;
    }

    // Check if peer already has a request in queue
    const existingRequest = aiState.queue.queue.find((r) => r.peerId === peerId);
    if (existingRequest) {
      return existingRequest;
    }

    // Create turn request
    const now = new Date();
    const request: TurnRequest = {
      id: nanoid(10),
      peerId,
      peerDisplayName,
      roomId,
      createdAt: now,
      expiresAt: new Date(now.getTime() + voiceSettings.queueTimeoutMs),
      position: aiState.queue.queue.length + 1,
      priority,
    };

    // If AI is idle and queue is empty, start turn immediately
    if (aiState.state === 'idle' && aiState.queue.queue.length === 0) {
      this.startTurn(roomId, request);
      return request;
    }

    // Add to queue
    aiState.queue.queue.push(request);
    this.sortQueue(aiState.queue.queue);
    this.updateQueuePositions(aiState.queue.queue);

    // Set timeout for this request
    const timeoutTimer = setTimeout(() => {
      this.expireRequest(roomId, request.id);
    }, voiceSettings.queueTimeoutMs);
    state.queueTimeoutTimers.set(request.id, timeoutTimer);

    // Notify queue update
    this.callbacks.onQueueUpdate?.(roomId, aiState.queue);
    this.emitEvent(roomId, 'ai:queue_updated', aiState);

    return request;
  }

  /**
   * Cancel a turn request
   */
  cancelRequest(roomId: RoomId, requestId: string): boolean {
    const state = this.rooms.get(roomId);
    if (!state) return false;

    const { aiState } = state;

    // Check if it's the active turn
    if (aiState.queue.activeTurn?.id === requestId) {
      this.endCurrentTurn(roomId);
      return true;
    }

    // Find and remove from queue
    const index = aiState.queue.queue.findIndex((r) => r.id === requestId);
    if (index === -1) return false;

    aiState.queue.queue.splice(index, 1);
    this.updateQueuePositions(aiState.queue.queue);

    // Clear timeout
    const timer = state.queueTimeoutTimers.get(requestId);
    if (timer) {
      clearTimeout(timer);
      state.queueTimeoutTimers.delete(requestId);
    }

    this.callbacks.onQueueUpdate?.(roomId, aiState.queue);
    this.emitEvent(roomId, 'ai:queue_updated', aiState);

    return true;
  }

  /**
   * Get queue position for a peer
   */
  getQueuePosition(roomId: RoomId, peerId: PeerId): number {
    const state = this.rooms.get(roomId);
    if (!state) return 0;

    // Check if peer has active turn
    if (state.aiState.queue.activeTurn?.peerId === peerId) {
      return 0; // Active turn
    }

    // Find in queue
    const request = state.aiState.queue.queue.find((r) => r.peerId === peerId);
    return request?.position ?? 0;
  }

  /**
   * Start listening state (peer is addressing AI)
   */
  startListening(roomId: RoomId, peerId: PeerId): boolean {
    const state = this.rooms.get(roomId);
    if (!state) return false;

    const { aiState } = state;

    // Can only start listening if idle or if this peer has active turn
    if (aiState.state !== 'idle' && aiState.activeSpeakerId !== peerId) {
      return false;
    }

    const previousState = aiState.state;
    aiState.state = 'listening';
    aiState.activeSpeakerId = peerId;
    aiState.stateStartedAt = new Date();

    this.emitEvent(roomId, 'ai:state_changed', aiState, previousState);
    return true;
  }

  /**
   * Start processing state (VAD ended, waiting for AI response)
   */
  startProcessing(roomId: RoomId): boolean {
    const state = this.rooms.get(roomId);
    if (!state) return false;

    const { aiState } = state;

    if (aiState.state !== 'listening') {
      return false;
    }

    const previousState = aiState.state;
    aiState.state = 'processing';
    aiState.stateStartedAt = new Date();

    this.emitEvent(roomId, 'ai:state_changed', aiState, previousState);
    return true;
  }

  /**
   * Start speaking state (AI is responding)
   */
  startSpeaking(roomId: RoomId): boolean {
    const state = this.rooms.get(roomId);
    if (!state) return false;

    const { aiState, voiceSettings } = state;

    if (aiState.state !== 'listening' && aiState.state !== 'processing') {
      return false;
    }

    const previousState = aiState.state;
    aiState.state = 'speaking';
    aiState.stateStartedAt = new Date();

    // Set lock timeout if locking is enabled
    if (voiceSettings.lockDuringResponse) {
      this.setLockTimeout(roomId);
    }

    this.emitEvent(roomId, 'ai:state_changed', aiState, previousState);
    return true;
  }

  /**
   * Finish speaking (AI response complete)
   */
  finishSpeaking(roomId: RoomId): boolean {
    const state = this.rooms.get(roomId);
    if (!state) return false;

    const { aiState } = state;

    if (aiState.state !== 'speaking' && aiState.state !== 'locked') {
      return false;
    }

    // Clear lock timeout
    if (state.lockTimeoutTimer) {
      clearTimeout(state.lockTimeoutTimer);
      state.lockTimeoutTimer = undefined;
    }

    // End current turn
    this.endCurrentTurn(roomId);

    // Process next in queue if auto-process is enabled
    if (this.options.autoProcessQueue) {
      this.processNextInQueue(roomId);
    }

    return true;
  }

  /**
   * Lock AI (prevent new turns)
   */
  lock(roomId: RoomId, reason?: string): boolean {
    const state = this.rooms.get(roomId);
    if (!state) return false;

    const { aiState } = state;

    if (aiState.state === 'locked') {
      return false;
    }

    const previousState = aiState.state;
    aiState.state = 'locked';
    aiState.stateStartedAt = new Date();
    if (reason) {
      aiState.lastError = reason;
    }

    this.setLockTimeout(roomId);
    this.emitEvent(roomId, 'ai:state_changed', aiState, previousState);

    return true;
  }

  /**
   * Unlock AI (allow new turns)
   */
  unlock(roomId: RoomId): boolean {
    const state = this.rooms.get(roomId);
    if (!state) return false;

    const { aiState } = state;

    if (aiState.state !== 'locked') {
      return false;
    }

    // Clear lock timeout
    if (state.lockTimeoutTimer) {
      clearTimeout(state.lockTimeoutTimer);
      state.lockTimeoutTimer = undefined;
    }

    const previousState = aiState.state;
    aiState.state = 'idle';
    aiState.activeSpeakerId = undefined;
    aiState.stateStartedAt = new Date();
    aiState.lastError = undefined;

    this.emitEvent(roomId, 'ai:state_changed', aiState, previousState);

    // Process next in queue
    if (this.options.autoProcessQueue) {
      this.processNextInQueue(roomId);
    }

    return true;
  }

  /**
   * Interrupt AI response (owner/moderator only)
   */
  interrupt(roomId: RoomId, interruptedBy: PeerId, reason?: string): boolean {
    const state = this.rooms.get(roomId);
    if (!state) return false;

    const { aiState, voiceSettings } = state;

    if (!voiceSettings.allowInterrupt) {
      return false;
    }

    if (aiState.state !== 'speaking' && aiState.state !== 'locked') {
      return false;
    }

    // Clear lock timeout
    if (state.lockTimeoutTimer) {
      clearTimeout(state.lockTimeoutTimer);
      state.lockTimeoutTimer = undefined;
    }

    // End current turn
    const currentTurn = aiState.queue.activeTurn;
    if (currentTurn) {
      this.callbacks.onTurnEnd?.(roomId, currentTurn);
    }

    const previousState = aiState.state;
    aiState.state = 'idle';
    aiState.activeSpeakerId = undefined;
    aiState.stateStartedAt = new Date();
    aiState.queue.activeTurn = undefined;

    this.emitEvent(roomId, 'ai:interrupt', aiState, previousState, {
      interruptedBy,
      reason,
    });

    return true;
  }

  /**
   * Report AI error
   */
  reportError(roomId: RoomId, error: string): void {
    const state = this.rooms.get(roomId);
    if (!state) return;

    const { aiState } = state;

    aiState.lastError = error;
    aiState.isSessionHealthy = false;

    this.callbacks.onError?.(roomId, error);
    this.emitEvent(roomId, 'ai:error', aiState);
  }

  /**
   * Report session reconnected
   */
  reportSessionReconnected(roomId: RoomId): void {
    const state = this.rooms.get(roomId);
    if (!state) return;

    const { aiState } = state;

    aiState.isSessionHealthy = true;
    aiState.lastError = undefined;

    this.emitEvent(roomId, 'ai:session_reconnected', aiState);
  }

  /**
   * Check if a peer can request a turn
   */
  canRequestTurn(roomId: RoomId, peerId: PeerId): { allowed: boolean; reason?: string } {
    const state = this.rooms.get(roomId);
    if (!state) {
      return { allowed: false, reason: 'Room not initialized' };
    }

    const { aiState, voiceSettings } = state;

    // Check designated speakers mode
    if (voiceSettings.mode === 'designatedSpeaker') {
      if (!voiceSettings.designatedSpeakers?.includes(peerId)) {
        return { allowed: false, reason: 'Not a designated speaker' };
      }
    }

    // Check if already in queue
    const inQueue = aiState.queue.queue.some((r) => r.peerId === peerId);
    if (inQueue) {
      return { allowed: false, reason: 'Already in queue' };
    }

    // Check if has active turn
    if (aiState.queue.activeTurn?.peerId === peerId) {
      return { allowed: false, reason: 'Already has active turn' };
    }

    // Check queue capacity
    if (!voiceSettings.enableQueue && aiState.state !== 'idle') {
      return { allowed: false, reason: 'AI is busy and queue is disabled' };
    }

    if (aiState.queue.queue.length >= voiceSettings.maxQueueSize) {
      return { allowed: false, reason: 'Queue is full' };
    }

    return { allowed: true };
  }

  /**
   * Process next request in queue
   */
  processNextInQueue(roomId: RoomId): boolean {
    const state = this.rooms.get(roomId);
    if (!state) return false;

    const { aiState } = state;

    // Can only process if idle
    if (aiState.state !== 'idle') {
      return false;
    }

    // Get next request
    if (aiState.queue.queue.length === 0) {
      return false;
    }

    const nextRequest = aiState.queue.queue.shift()!;
    this.updateQueuePositions(aiState.queue.queue);

    // Clear timeout for this request
    const timer = state.queueTimeoutTimers.get(nextRequest.id);
    if (timer) {
      clearTimeout(timer);
      state.queueTimeoutTimers.delete(nextRequest.id);
    }

    // Start the turn
    this.startTurn(roomId, nextRequest);

    return true;
  }

  /**
   * Get room count
   */
  getRoomCount(): number {
    return this.rooms.size;
  }

  /**
   * Dispose manager
   */
  dispose(): void {
    // Clear all timers
    this.rooms.forEach((state, roomId) => {
      if (state.lockTimeoutTimer) {
        clearTimeout(state.lockTimeoutTimer);
      }
      state.queueTimeoutTimers.forEach((timer) => clearTimeout(timer));
    });

    this.rooms.clear();
  }

  // ========== Private Methods ==========

  /**
   * Create initial AI state
   */
  private createInitialAIState(): RoomAIState {
    return {
      state: 'idle',
      stateStartedAt: new Date(),
      queue: {
        queue: [],
        totalProcessed: 0,
        totalExpired: 0,
      },
      isSessionHealthy: true,
    };
  }

  /**
   * Start a turn
   */
  private startTurn(roomId: RoomId, request: TurnRequest): void {
    const state = this.rooms.get(roomId);
    if (!state) return;

    const { aiState } = state;

    aiState.queue.activeTurn = request;
    aiState.activeSpeakerId = request.peerId;
    aiState.state = 'idle'; // Ready for listening
    aiState.stateStartedAt = new Date();

    this.callbacks.onTurnStart?.(roomId, request);
    this.callbacks.onQueueUpdate?.(roomId, aiState.queue);
    this.emitEvent(roomId, 'ai:turn_started', aiState, undefined, { turnRequest: request });
  }

  /**
   * End current turn
   */
  private endCurrentTurn(roomId: RoomId): void {
    const state = this.rooms.get(roomId);
    if (!state) return;

    const { aiState } = state;
    const currentTurn = aiState.queue.activeTurn;

    if (currentTurn) {
      aiState.queue.totalProcessed++;
      this.callbacks.onTurnEnd?.(roomId, currentTurn);
      this.emitEvent(roomId, 'ai:turn_ended', aiState, undefined, { turnRequest: currentTurn });
    }

    aiState.queue.activeTurn = undefined;
    aiState.activeSpeakerId = undefined;
    aiState.state = 'idle';
    aiState.stateStartedAt = new Date();

    this.emitEvent(roomId, 'ai:state_changed', aiState, 'speaking');
  }

  /**
   * Expire a queued request
   */
  private expireRequest(roomId: RoomId, requestId: string): void {
    const state = this.rooms.get(roomId);
    if (!state) return;

    const { aiState } = state;

    const index = aiState.queue.queue.findIndex((r) => r.id === requestId);
    if (index === -1) return;

    aiState.queue.queue.splice(index, 1);
    aiState.queue.totalExpired++;
    this.updateQueuePositions(aiState.queue.queue);

    state.queueTimeoutTimers.delete(requestId);

    this.callbacks.onQueueUpdate?.(roomId, aiState.queue);
    this.emitEvent(roomId, 'ai:queue_updated', aiState);
  }

  /**
   * Set lock timeout
   */
  private setLockTimeout(roomId: RoomId): void {
    const state = this.rooms.get(roomId);
    if (!state) return;

    // Clear existing timeout
    if (state.lockTimeoutTimer) {
      clearTimeout(state.lockTimeoutTimer);
    }

    state.lockTimeoutTimer = setTimeout(() => {
      this.handleLockTimeout(roomId);
    }, this.options.defaultLockTimeoutMs);
  }

  /**
   * Handle lock timeout (safety mechanism)
   */
  private handleLockTimeout(roomId: RoomId): void {
    const state = this.rooms.get(roomId);
    if (!state) return;

    const { aiState } = state;

    // Force unlock
    if (aiState.state === 'speaking' || aiState.state === 'locked') {
      aiState.lastError = 'Lock timeout - safety release';
      this.callbacks.onError?.(roomId, 'Lock timeout - safety release');

      // End current turn and unlock
      this.endCurrentTurn(roomId);

      // Process next in queue
      if (this.options.autoProcessQueue) {
        this.processNextInQueue(roomId);
      }
    }
  }

  /**
   * Sort queue by priority (higher first), then by creation time
   */
  private sortQueue(queue: TurnRequest[]): void {
    queue.sort((a, b) => {
      if (a.priority !== b.priority) {
        return b.priority - a.priority; // Higher priority first
      }
      return a.createdAt.getTime() - b.createdAt.getTime(); // Earlier first
    });
  }

  /**
   * Update queue positions
   */
  private updateQueuePositions(queue: TurnRequest[]): void {
    queue.forEach((request, index) => {
      request.position = index + 1;
    });
  }

  /**
   * Emit AI state event
   */
  private emitEvent(
    roomId: RoomId,
    type: AIStateEventType,
    state: RoomAIState,
    previousState?: AIResponseState,
    data?: AIStateEvent['data']
  ): void {
    const event: AIStateEvent = {
      type,
      roomId,
      state,
      previousState,
      data,
      timestamp: new Date(),
    };

    this.callbacks.onStateChange?.(roomId, event);
  }
}

/**
 * Create AI locking manager instance
 */
export function createAILockingManager(
  options?: AILockingManagerOptions,
  callbacks?: AILockingManagerCallbacks
): AILockingManager {
  return new AILockingManager(options, callbacks);
}

export default AILockingManager;
