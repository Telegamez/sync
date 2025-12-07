/**
 * Reconnection Handler
 *
 * Manages automatic reconnection with state preservation.
 * Handles Socket.io, WebRTC, and AI session reconnection.
 *
 * Part of the Long-Horizon Engineering Protocol - FEAT-404
 */

import type { RoomId } from '@/types/room';
import type { PeerId } from '@/types/peer';

// ========== Types ==========

/**
 * Reconnection state
 */
export type ReconnectionState =
  | 'idle'           // No reconnection needed
  | 'waiting'        // Waiting before next attempt
  | 'reconnecting'   // Currently attempting reconnection
  | 'success'        // Reconnection succeeded
  | 'failed';        // All attempts exhausted

/**
 * Connection type being reconnected
 */
export type ConnectionType =
  | 'signaling'      // Socket.io signaling server
  | 'webrtc'         // WebRTC peer connection
  | 'ai_session';    // AI session

/**
 * Reconnection attempt result
 */
export interface ReconnectionAttempt {
  type: ConnectionType;
  attempt: number;
  maxAttempts: number;
  timestamp: Date;
  success: boolean;
  error?: string;
  duration: number;
}

/**
 * Reconnection status for a connection
 */
export interface ConnectionReconnectionStatus {
  type: ConnectionType;
  state: ReconnectionState;
  attempt: number;
  maxAttempts: number;
  nextAttemptAt?: Date;
  lastError?: string;
  history: ReconnectionAttempt[];
}

/**
 * Room state snapshot for preservation
 */
export interface RoomStateSnapshot {
  roomId: RoomId;
  localPeerId: PeerId;
  displayName: string;
  avatarUrl?: string;
  peers: PeerId[];
  aiSessionActive: boolean;
  timestamp: Date;
}

/**
 * Reconnection options
 */
export interface ReconnectionOptions {
  /** Maximum reconnection attempts */
  maxAttempts?: number;
  /** Base delay between attempts (ms) */
  baseDelay?: number;
  /** Maximum delay between attempts (ms) */
  maxDelay?: number;
  /** Use exponential backoff */
  exponentialBackoff?: boolean;
  /** Jitter factor (0-1) */
  jitterFactor?: number;
  /** Connection timeout (ms) */
  connectionTimeout?: number;
}

/**
 * Reconnection callbacks
 */
export interface ReconnectionCallbacks {
  onStateChange?: (type: ConnectionType, state: ReconnectionState) => void;
  onAttempt?: (attempt: ReconnectionAttempt) => void;
  onSuccess?: (type: ConnectionType) => void;
  onFailure?: (type: ConnectionType, error: string) => void;
  onRoomStateRestored?: (snapshot: RoomStateSnapshot) => void;
}

/**
 * Default reconnection options
 */
export const DEFAULT_RECONNECTION_OPTIONS: Required<ReconnectionOptions> = {
  maxAttempts: 5,
  baseDelay: 1000,
  maxDelay: 30000,
  exponentialBackoff: true,
  jitterFactor: 0.3,
  connectionTimeout: 10000,
};

// ========== Utility Functions ==========

/**
 * Calculate delay for next reconnection attempt
 */
export function calculateReconnectionDelay(
  attempt: number,
  options: ReconnectionOptions = {}
): number {
  const opts = { ...DEFAULT_RECONNECTION_OPTIONS, ...options };

  let delay: number;
  if (opts.exponentialBackoff) {
    // Exponential backoff: baseDelay * 2^(attempt-1)
    delay = opts.baseDelay * Math.pow(2, attempt - 1);
  } else {
    // Linear delay
    delay = opts.baseDelay * attempt;
  }

  // Cap at max delay
  delay = Math.min(delay, opts.maxDelay);

  // Add jitter to prevent thundering herd
  if (opts.jitterFactor > 0) {
    const jitter = delay * opts.jitterFactor * (Math.random() * 2 - 1);
    delay = Math.max(0, delay + jitter);
  }

  return Math.round(delay);
}

/**
 * Check if reconnection should be attempted
 */
export function shouldReconnect(
  attempt: number,
  maxAttempts: number,
  lastError?: string
): boolean {
  // Don't reconnect if max attempts reached
  if (attempt >= maxAttempts) {
    return false;
  }

  // Don't reconnect on certain errors
  const nonRecoverableErrors = [
    'unauthorized',
    'banned',
    'room_not_found',
    'room_closed',
    'kicked',
    'invalid_token',
  ];

  if (lastError) {
    const lowerError = lastError.toLowerCase();
    if (nonRecoverableErrors.some(e => lowerError.includes(e.toLowerCase()))) {
      return false;
    }
  }

  return true;
}

/**
 * Format reconnection status for display
 */
export function formatReconnectionStatus(status: ConnectionReconnectionStatus): string {
  switch (status.state) {
    case 'idle':
      return 'Connected';
    case 'waiting': {
      const seconds = status.nextAttemptAt
        ? Math.ceil((status.nextAttemptAt.getTime() - Date.now()) / 1000)
        : 0;
      return `Reconnecting in ${seconds}s (attempt ${status.attempt + 1}/${status.maxAttempts})`;
    }
    case 'reconnecting':
      return `Reconnecting... (attempt ${status.attempt}/${status.maxAttempts})`;
    case 'success':
      return 'Reconnected';
    case 'failed':
      return `Connection failed after ${status.maxAttempts} attempts`;
  }
}

// ========== ReconnectionManager Class ==========

/**
 * Manages reconnection for multiple connection types
 */
export class ReconnectionManager {
  private options: Required<ReconnectionOptions>;
  private callbacks: ReconnectionCallbacks;
  private statuses = new Map<ConnectionType, ConnectionReconnectionStatus>();
  private timers = new Map<ConnectionType, NodeJS.Timeout>();
  private roomSnapshot: RoomStateSnapshot | null = null;
  private abortControllers = new Map<ConnectionType, AbortController>();

  constructor(
    options: ReconnectionOptions = {},
    callbacks: ReconnectionCallbacks = {}
  ) {
    this.options = { ...DEFAULT_RECONNECTION_OPTIONS, ...options };
    this.callbacks = callbacks;

    // Initialize statuses
    for (const type of ['signaling', 'webrtc', 'ai_session'] as ConnectionType[]) {
      this.statuses.set(type, this.createInitialStatus(type));
    }
  }

  /**
   * Create initial status for a connection type
   */
  private createInitialStatus(type: ConnectionType): ConnectionReconnectionStatus {
    return {
      type,
      state: 'idle',
      attempt: 0,
      maxAttempts: this.options.maxAttempts,
      history: [],
    };
  }

  /**
   * Get status for a connection type
   */
  getStatus(type: ConnectionType): ConnectionReconnectionStatus {
    return this.statuses.get(type) || this.createInitialStatus(type);
  }

  /**
   * Get all statuses
   */
  getAllStatuses(): Map<ConnectionType, ConnectionReconnectionStatus> {
    return new Map(this.statuses);
  }

  /**
   * Check if any reconnection is in progress
   */
  isReconnecting(): boolean {
    return Array.from(this.statuses.values()).some(
      status => status.state === 'reconnecting' || status.state === 'waiting'
    );
  }

  /**
   * Save room state for later restoration
   */
  saveRoomState(snapshot: RoomStateSnapshot): void {
    this.roomSnapshot = { ...snapshot, timestamp: new Date() };
  }

  /**
   * Get saved room state
   */
  getSavedRoomState(): RoomStateSnapshot | null {
    return this.roomSnapshot;
  }

  /**
   * Clear saved room state
   */
  clearRoomState(): void {
    this.roomSnapshot = null;
  }

  /**
   * Start reconnection for a connection type
   */
  async startReconnection(
    type: ConnectionType,
    connectFn: () => Promise<void>
  ): Promise<boolean> {
    const status = this.getStatus(type);

    // Reset if previously successful or failed
    if (status.state === 'success' || status.state === 'failed' || status.state === 'idle') {
      status.attempt = 0;
      status.history = [];
    }

    return this.attemptReconnection(type, connectFn);
  }

  /**
   * Attempt a single reconnection
   */
  private async attemptReconnection(
    type: ConnectionType,
    connectFn: () => Promise<void>
  ): Promise<boolean> {
    const status = this.getStatus(type);
    status.attempt++;

    // Check if should reconnect
    if (!shouldReconnect(status.attempt, status.maxAttempts, status.lastError)) {
      this.updateState(type, 'failed');
      return false;
    }

    // Calculate delay for this attempt
    const delay = status.attempt === 1 ? 0 : calculateReconnectionDelay(status.attempt - 1, this.options);

    if (delay > 0) {
      // Wait before attempting
      this.updateState(type, 'waiting');
      status.nextAttemptAt = new Date(Date.now() + delay);

      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, delay);
        this.timers.set(type, timer);
      });
    }

    // Check if cancelled during wait
    const abortController = new AbortController();
    this.abortControllers.set(type, abortController);

    if (abortController.signal.aborted) {
      return false;
    }

    // Attempt connection
    this.updateState(type, 'reconnecting');
    const startTime = Date.now();

    try {
      // Create timeout promise
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Connection timeout')), this.options.connectionTimeout);
      });

      // Race connection against timeout
      await Promise.race([connectFn(), timeoutPromise]);

      // Success
      const attempt: ReconnectionAttempt = {
        type,
        attempt: status.attempt,
        maxAttempts: status.maxAttempts,
        timestamp: new Date(),
        success: true,
        duration: Date.now() - startTime,
      };

      status.history.push(attempt);
      status.lastError = undefined;
      this.updateState(type, 'success');
      this.callbacks.onAttempt?.(attempt);
      this.callbacks.onSuccess?.(type);

      // Restore room state if signaling reconnected
      if (type === 'signaling' && this.roomSnapshot) {
        this.callbacks.onRoomStateRestored?.(this.roomSnapshot);
      }

      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      const attempt: ReconnectionAttempt = {
        type,
        attempt: status.attempt,
        maxAttempts: status.maxAttempts,
        timestamp: new Date(),
        success: false,
        error: errorMessage,
        duration: Date.now() - startTime,
      };

      status.history.push(attempt);
      status.lastError = errorMessage;
      this.callbacks.onAttempt?.(attempt);

      // Try again if more attempts available
      if (shouldReconnect(status.attempt, status.maxAttempts, errorMessage)) {
        return this.attemptReconnection(type, connectFn);
      }

      // All attempts exhausted
      this.updateState(type, 'failed');
      this.callbacks.onFailure?.(type, errorMessage);
      return false;
    }
  }

  /**
   * Cancel reconnection for a connection type
   */
  cancelReconnection(type: ConnectionType): void {
    // Clear timer
    const timer = this.timers.get(type);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(type);
    }

    // Abort any in-progress connection
    const abortController = this.abortControllers.get(type);
    if (abortController) {
      abortController.abort();
      this.abortControllers.delete(type);
    }

    // Reset status
    const status = this.getStatus(type);
    status.state = 'idle';
    status.attempt = 0;
    status.nextAttemptAt = undefined;
    this.callbacks.onStateChange?.(type, 'idle');
  }

  /**
   * Cancel all reconnections
   */
  cancelAll(): void {
    for (const type of ['signaling', 'webrtc', 'ai_session'] as ConnectionType[]) {
      this.cancelReconnection(type);
    }
  }

  /**
   * Reset a connection type
   */
  reset(type: ConnectionType): void {
    this.cancelReconnection(type);
    this.statuses.set(type, this.createInitialStatus(type));
  }

  /**
   * Reset all connection types
   */
  resetAll(): void {
    this.cancelAll();
    for (const type of ['signaling', 'webrtc', 'ai_session'] as ConnectionType[]) {
      this.statuses.set(type, this.createInitialStatus(type));
    }
    this.roomSnapshot = null;
  }

  /**
   * Update state and notify
   */
  private updateState(type: ConnectionType, state: ReconnectionState): void {
    const status = this.getStatus(type);
    status.state = state;
    this.statuses.set(type, status);
    this.callbacks.onStateChange?.(type, state);
  }

  /**
   * Dispose manager
   */
  dispose(): void {
    this.cancelAll();
    this.statuses.clear();
    this.roomSnapshot = null;
  }
}

// ========== WebRTC Reconnection Helpers ==========

/**
 * WebRTC peer reconnection state
 */
export interface WebRTCPeerReconnectionState {
  peerId: PeerId;
  state: ReconnectionState;
  attempt: number;
  lastError?: string;
}

/**
 * Manages WebRTC peer reconnections
 */
export class WebRTCReconnectionManager {
  private options: Required<ReconnectionOptions>;
  private callbacks: ReconnectionCallbacks;
  private peerStates = new Map<PeerId, WebRTCPeerReconnectionState>();
  private peerTimers = new Map<PeerId, NodeJS.Timeout>();

  constructor(
    options: ReconnectionOptions = {},
    callbacks: ReconnectionCallbacks = {}
  ) {
    this.options = { ...DEFAULT_RECONNECTION_OPTIONS, ...options };
    this.callbacks = callbacks;
  }

  /**
   * Get state for a peer
   */
  getPeerState(peerId: PeerId): WebRTCPeerReconnectionState | undefined {
    return this.peerStates.get(peerId);
  }

  /**
   * Get all peer states
   */
  getAllPeerStates(): Map<PeerId, WebRTCPeerReconnectionState> {
    return new Map(this.peerStates);
  }

  /**
   * Start reconnection for a peer
   */
  async startPeerReconnection(
    peerId: PeerId,
    reconnectFn: () => Promise<void>
  ): Promise<boolean> {
    let state = this.peerStates.get(peerId);

    if (!state) {
      state = {
        peerId,
        state: 'idle',
        attempt: 0,
      };
      this.peerStates.set(peerId, state);
    }

    // Reset if previously completed
    if (state.state === 'success' || state.state === 'failed') {
      state.attempt = 0;
      state.lastError = undefined;
    }

    return this.attemptPeerReconnection(peerId, reconnectFn);
  }

  /**
   * Attempt peer reconnection
   */
  private async attemptPeerReconnection(
    peerId: PeerId,
    reconnectFn: () => Promise<void>
  ): Promise<boolean> {
    const state = this.peerStates.get(peerId)!;
    state.attempt++;

    if (!shouldReconnect(state.attempt, this.options.maxAttempts, state.lastError)) {
      state.state = 'failed';
      this.callbacks.onStateChange?.('webrtc', 'failed');
      return false;
    }

    const delay = state.attempt === 1 ? 0 : calculateReconnectionDelay(state.attempt - 1, this.options);

    if (delay > 0) {
      state.state = 'waiting';
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, delay);
        this.peerTimers.set(peerId, timer);
      });
    }

    state.state = 'reconnecting';
    this.callbacks.onStateChange?.('webrtc', 'reconnecting');

    try {
      await reconnectFn();
      state.state = 'success';
      state.lastError = undefined;
      this.callbacks.onStateChange?.('webrtc', 'success');
      this.callbacks.onSuccess?.('webrtc');
      return true;
    } catch (error) {
      state.lastError = error instanceof Error ? error.message : 'Unknown error';

      if (shouldReconnect(state.attempt, this.options.maxAttempts, state.lastError)) {
        return this.attemptPeerReconnection(peerId, reconnectFn);
      }

      state.state = 'failed';
      this.callbacks.onStateChange?.('webrtc', 'failed');
      this.callbacks.onFailure?.('webrtc', state.lastError);
      return false;
    }
  }

  /**
   * Cancel peer reconnection
   */
  cancelPeerReconnection(peerId: PeerId): void {
    const timer = this.peerTimers.get(peerId);
    if (timer) {
      clearTimeout(timer);
      this.peerTimers.delete(peerId);
    }
    this.peerStates.delete(peerId);
  }

  /**
   * Remove peer
   */
  removePeer(peerId: PeerId): void {
    this.cancelPeerReconnection(peerId);
  }

  /**
   * Reset all peers
   */
  reset(): void {
    Array.from(this.peerTimers.values()).forEach(timer => {
      clearTimeout(timer);
    });
    this.peerTimers.clear();
    this.peerStates.clear();
  }

  /**
   * Dispose manager
   */
  dispose(): void {
    this.reset();
  }
}

// ========== Factory Functions ==========

/**
 * Create a ReconnectionManager instance
 */
export function createReconnectionManager(
  options?: ReconnectionOptions,
  callbacks?: ReconnectionCallbacks
): ReconnectionManager {
  return new ReconnectionManager(options, callbacks);
}

/**
 * Create a WebRTCReconnectionManager instance
 */
export function createWebRTCReconnectionManager(
  options?: ReconnectionOptions,
  callbacks?: ReconnectionCallbacks
): WebRTCReconnectionManager {
  return new WebRTCReconnectionManager(options, callbacks);
}

// ========== React Hook Helpers ==========

/**
 * Reconnection status for React components
 */
export interface UseReconnectionStatus {
  isReconnecting: boolean;
  signaling: ConnectionReconnectionStatus;
  webrtc: ConnectionReconnectionStatus;
  aiSession: ConnectionReconnectionStatus;
  overallState: ReconnectionState;
  displayMessage: string;
}

/**
 * Get combined reconnection status for UI display
 */
export function getReconnectionDisplayStatus(
  manager: ReconnectionManager
): UseReconnectionStatus {
  const signaling = manager.getStatus('signaling');
  const webrtc = manager.getStatus('webrtc');
  const aiSession = manager.getStatus('ai_session');

  const isReconnecting = manager.isReconnecting();

  // Determine overall state
  let overallState: ReconnectionState = 'idle';
  if ([signaling, webrtc, aiSession].some(s => s.state === 'failed')) {
    overallState = 'failed';
  } else if ([signaling, webrtc, aiSession].some(s => s.state === 'reconnecting')) {
    overallState = 'reconnecting';
  } else if ([signaling, webrtc, aiSession].some(s => s.state === 'waiting')) {
    overallState = 'waiting';
  } else if ([signaling, webrtc, aiSession].every(s => s.state === 'success' || s.state === 'idle')) {
    overallState = signaling.state === 'success' || webrtc.state === 'success' ? 'success' : 'idle';
  }

  // Generate display message
  let displayMessage = 'Connected';
  if (signaling.state === 'reconnecting' || signaling.state === 'waiting') {
    displayMessage = formatReconnectionStatus(signaling);
  } else if (webrtc.state === 'reconnecting' || webrtc.state === 'waiting') {
    displayMessage = `Reconnecting to peers... (${formatReconnectionStatus(webrtc)})`;
  } else if (aiSession.state === 'reconnecting' || aiSession.state === 'waiting') {
    displayMessage = `Reconnecting AI session... (${formatReconnectionStatus(aiSession)})`;
  } else if (overallState === 'failed') {
    displayMessage = 'Connection lost. Please refresh the page.';
  } else if (overallState === 'success') {
    displayMessage = 'Reconnected';
  }

  return {
    isReconnecting,
    signaling,
    webrtc,
    aiSession,
    overallState,
    displayMessage,
  };
}
