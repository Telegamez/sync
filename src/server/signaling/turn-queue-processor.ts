/**
 * Turn Queue Processor
 *
 * Server-side FIFO queue processing for turn management.
 * Processes turn requests after AI responses complete, handles timeouts,
 * and supports priority override for room owners/moderators.
 *
 * Part of the Long-Horizon Engineering Protocol - FEAT-157
 */

import { nanoid } from 'nanoid';
import type { PeerId } from '@/types/peer';
import type { RoomId } from '@/types/room';
import type {
  AIResponseState,
  TurnRequest,
  TurnQueueState,
} from '@/types/voice-mode';

/**
 * Queue entry with additional processing metadata
 */
export interface QueueEntry extends TurnRequest {
  /** Whether this is a priority override request */
  isPriority: boolean;
  /** Role of the requester (for priority) */
  role: 'owner' | 'moderator' | 'member';
  /** Number of times processing was attempted */
  processingAttempts: number;
  /** Last processing attempt time */
  lastProcessingAttempt?: Date;
  /** Reason if rejected */
  rejectionReason?: string;
}

/**
 * Queue processing result
 */
export interface ProcessingResult {
  success: boolean;
  entry?: QueueEntry;
  error?: string;
  nextInQueue?: QueueEntry;
}

/**
 * Queue position change notification
 */
export interface QueuePositionChange {
  peerId: PeerId;
  previousPosition: number;
  newPosition: number;
  roomId: RoomId;
  timestamp: Date;
}

/**
 * Turn completed event
 */
export interface TurnCompletedEvent {
  roomId: RoomId;
  peerId: PeerId;
  turnId: string;
  duration: number;
  completedAt: Date;
  wasInterrupted: boolean;
}

/**
 * Turn queue processor options
 */
export interface TurnQueueProcessorOptions {
  /** Maximum queue size per room */
  maxQueueSize?: number;
  /** Default request timeout in ms */
  defaultTimeoutMs?: number;
  /** Priority request timeout in ms (longer for owners/mods) */
  priorityTimeoutMs?: number;
  /** Maximum processing attempts before rejection */
  maxProcessingAttempts?: number;
  /** Delay between processing attempts in ms */
  processingRetryDelayMs?: number;
  /** Whether to auto-advance queue after AI response */
  autoAdvanceQueue?: boolean;
  /** Minimum time between turns in ms */
  minTurnIntervalMs?: number;
}

/**
 * Turn queue processor callbacks
 */
export interface TurnQueueProcessorCallbacks {
  /** Called when queue position changes for any peer */
  onPositionChange?: (change: QueuePositionChange) => void;
  /** Called when a turn is granted */
  onTurnGranted?: (roomId: RoomId, entry: QueueEntry) => void;
  /** Called when a turn is completed */
  onTurnCompleted?: (event: TurnCompletedEvent) => void;
  /** Called when a request is rejected */
  onRequestRejected?: (roomId: RoomId, entry: QueueEntry, reason: string) => void;
  /** Called when a request expires */
  onRequestExpired?: (roomId: RoomId, entry: QueueEntry) => void;
  /** Called when queue is updated */
  onQueueUpdate?: (roomId: RoomId, state: TurnQueueState) => void;
  /** Called when processing starts */
  onProcessingStart?: (roomId: RoomId) => void;
  /** Called when processing completes */
  onProcessingComplete?: (roomId: RoomId, result: ProcessingResult) => void;
}

/**
 * Per-room queue state
 */
interface RoomQueueState {
  /** FIFO queue of entries */
  queue: QueueEntry[];
  /** Currently active turn */
  activeTurn?: QueueEntry;
  /** Turn start time */
  turnStartedAt?: Date;
  /** Whether currently processing */
  isProcessing: boolean;
  /** Last processing time */
  lastProcessedAt?: Date;
  /** Total turns processed */
  totalProcessed: number;
  /** Total requests expired */
  totalExpired: number;
  /** Total requests rejected */
  totalRejected: number;
  /** Timeout timers */
  timeoutTimers: Map<string, ReturnType<typeof setTimeout>>;
  /** Processing timer */
  processingTimer?: ReturnType<typeof setTimeout>;
}

/**
 * Default options
 */
const DEFAULT_OPTIONS: Required<TurnQueueProcessorOptions> = {
  maxQueueSize: 20,
  defaultTimeoutMs: 30000, // 30 seconds
  priorityTimeoutMs: 60000, // 1 minute for owners/mods
  maxProcessingAttempts: 3,
  processingRetryDelayMs: 1000,
  autoAdvanceQueue: true,
  minTurnIntervalMs: 500,
};

/**
 * Turn Queue Processor
 *
 * Manages FIFO queue processing for turn requests.
 */
export class TurnQueueProcessor {
  private rooms = new Map<RoomId, RoomQueueState>();
  private options: Required<TurnQueueProcessorOptions>;
  private callbacks: TurnQueueProcessorCallbacks;

  constructor(
    options: TurnQueueProcessorOptions = {},
    callbacks: TurnQueueProcessorCallbacks = {}
  ) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.callbacks = callbacks;
  }

  /**
   * Initialize a room for queue processing
   */
  initRoom(roomId: RoomId): void {
    if (this.rooms.has(roomId)) {
      return;
    }

    this.rooms.set(roomId, {
      queue: [],
      isProcessing: false,
      totalProcessed: 0,
      totalExpired: 0,
      totalRejected: 0,
      timeoutTimers: new Map(),
    });
  }

  /**
   * Remove a room from processing
   */
  removeRoom(roomId: RoomId): void {
    const state = this.rooms.get(roomId);
    if (!state) return;

    // Clear all timers
    state.timeoutTimers.forEach((timer) => clearTimeout(timer));
    if (state.processingTimer) {
      clearTimeout(state.processingTimer);
    }

    this.rooms.delete(roomId);
  }

  /**
   * Enqueue a turn request
   */
  enqueue(
    roomId: RoomId,
    peerId: PeerId,
    displayName: string,
    role: 'owner' | 'moderator' | 'member' = 'member',
    priority: number = 0
  ): QueueEntry | null {
    const state = this.rooms.get(roomId);
    if (!state) return null;

    // Check queue capacity
    if (state.queue.length >= this.options.maxQueueSize) {
      return null;
    }

    // Check if already in queue
    const existing = state.queue.find((e) => e.peerId === peerId);
    if (existing) {
      return existing;
    }

    // Check if has active turn
    if (state.activeTurn?.peerId === peerId) {
      return state.activeTurn;
    }

    // Determine timeout based on role
    const isPriority = role === 'owner' || role === 'moderator';
    const timeoutMs = isPriority
      ? this.options.priorityTimeoutMs
      : this.options.defaultTimeoutMs;

    // Create entry
    const now = new Date();
    const entry: QueueEntry = {
      id: nanoid(10),
      peerId,
      peerDisplayName: displayName,
      roomId,
      createdAt: now,
      expiresAt: new Date(now.getTime() + timeoutMs),
      position: 0, // Will be set by updatePositions
      priority: isPriority ? 100 + priority : priority,
      isPriority,
      role,
      processingAttempts: 0,
    };

    // Insert into queue (priority-based ordering)
    this.insertIntoQueue(state, entry);

    // Set timeout timer
    const timer = setTimeout(() => {
      this.handleTimeout(roomId, entry.id);
    }, timeoutMs);
    state.timeoutTimers.set(entry.id, timer);

    // Notify queue update
    this.notifyQueueUpdate(roomId, state);

    // If no active turn and not processing, start processing
    if (!state.activeTurn && !state.isProcessing && this.options.autoAdvanceQueue) {
      this.processNext(roomId);
    }

    return entry;
  }

  /**
   * Dequeue and return next entry
   */
  dequeue(roomId: RoomId): QueueEntry | null {
    const state = this.rooms.get(roomId);
    if (!state || state.queue.length === 0) return null;

    const entry = state.queue.shift()!;
    this.updatePositions(state);

    // Clear timeout
    const timer = state.timeoutTimers.get(entry.id);
    if (timer) {
      clearTimeout(timer);
      state.timeoutTimers.delete(entry.id);
    }

    this.notifyQueueUpdate(roomId, state);
    return entry;
  }

  /**
   * Cancel a queued request
   */
  cancel(roomId: RoomId, requestId: string): boolean {
    const state = this.rooms.get(roomId);
    if (!state) return false;

    // Check if it's the active turn
    if (state.activeTurn?.id === requestId) {
      this.endTurn(roomId, true);
      return true;
    }

    // Find in queue
    const index = state.queue.findIndex((e) => e.id === requestId);
    if (index === -1) return false;

    const entry = state.queue[index];
    state.queue.splice(index, 1);
    this.updatePositions(state);

    // Clear timeout
    const timer = state.timeoutTimers.get(requestId);
    if (timer) {
      clearTimeout(timer);
      state.timeoutTimers.delete(requestId);
    }

    this.notifyQueueUpdate(roomId, state);
    return true;
  }

  /**
   * Cancel all requests from a peer (e.g., on disconnect)
   */
  cancelAllForPeer(roomId: RoomId, peerId: PeerId): number {
    const state = this.rooms.get(roomId);
    if (!state) return 0;

    let cancelled = 0;

    // End active turn if it belongs to this peer
    if (state.activeTurn?.peerId === peerId) {
      this.endTurn(roomId, true);
      cancelled++;
    }

    // Remove from queue
    const toRemove = state.queue.filter((e) => e.peerId === peerId);
    toRemove.forEach((entry) => {
      this.cancel(roomId, entry.id);
      cancelled++;
    });

    return cancelled;
  }

  /**
   * Process next entry in queue
   */
  processNext(roomId: RoomId): ProcessingResult {
    const state = this.rooms.get(roomId);
    if (!state) {
      return { success: false, error: 'Room not found' };
    }

    // Check if already processing or has active turn
    if (state.isProcessing) {
      return { success: false, error: 'Already processing' };
    }

    if (state.activeTurn) {
      return { success: false, error: 'Active turn in progress' };
    }

    // Check minimum interval
    if (state.lastProcessedAt) {
      const elapsed = Date.now() - state.lastProcessedAt.getTime();
      if (elapsed < this.options.minTurnIntervalMs) {
        // Schedule delayed processing
        state.processingTimer = setTimeout(() => {
          this.processNext(roomId);
        }, this.options.minTurnIntervalMs - elapsed);
        return { success: false, error: 'Waiting for minimum interval' };
      }
    }

    // Get next entry
    if (state.queue.length === 0) {
      return { success: false, error: 'Queue is empty' };
    }

    state.isProcessing = true;
    this.callbacks.onProcessingStart?.(roomId);

    const entry = state.queue[0];

    // Check if expired
    if (new Date() > entry.expiresAt) {
      state.queue.shift();
      state.totalExpired++;
      this.updatePositions(state);
      state.isProcessing = false;
      this.callbacks.onRequestExpired?.(roomId, entry);
      this.notifyQueueUpdate(roomId, state);

      // Try next
      return this.processNext(roomId);
    }

    // Increment processing attempts
    entry.processingAttempts++;
    entry.lastProcessingAttempt = new Date();

    // Check max attempts
    if (entry.processingAttempts > this.options.maxProcessingAttempts) {
      state.queue.shift();
      state.totalRejected++;
      entry.rejectionReason = 'Max processing attempts exceeded';
      this.updatePositions(state);
      state.isProcessing = false;

      const timer = state.timeoutTimers.get(entry.id);
      if (timer) {
        clearTimeout(timer);
        state.timeoutTimers.delete(entry.id);
      }

      this.callbacks.onRequestRejected?.(roomId, entry, entry.rejectionReason);
      this.notifyQueueUpdate(roomId, state);

      // Try next
      return this.processNext(roomId);
    }

    // Grant the turn
    state.queue.shift();
    state.activeTurn = entry;
    state.turnStartedAt = new Date();
    state.isProcessing = false;

    // Clear timeout timer
    const timer = state.timeoutTimers.get(entry.id);
    if (timer) {
      clearTimeout(timer);
      state.timeoutTimers.delete(entry.id);
    }

    this.updatePositions(state);
    this.notifyQueueUpdate(roomId, state);

    this.callbacks.onTurnGranted?.(roomId, entry);
    this.callbacks.onProcessingComplete?.(roomId, {
      success: true,
      entry,
      nextInQueue: state.queue[0],
    });

    return {
      success: true,
      entry,
      nextInQueue: state.queue[0],
    };
  }

  /**
   * Called when AI response is done - process next in queue
   */
  onResponseDone(roomId: RoomId): ProcessingResult {
    const state = this.rooms.get(roomId);
    if (!state) {
      return { success: false, error: 'Room not found' };
    }

    // End current turn
    if (state.activeTurn) {
      this.endTurn(roomId, false);
    }

    // Process next if auto-advance is enabled
    if (this.options.autoAdvanceQueue) {
      return this.processNext(roomId);
    }

    return { success: true };
  }

  /**
   * End current turn
   */
  endTurn(roomId: RoomId, wasInterrupted: boolean = false): TurnCompletedEvent | null {
    const state = this.rooms.get(roomId);
    if (!state || !state.activeTurn) return null;

    const entry = state.activeTurn;
    const turnStartedAt = state.turnStartedAt ?? new Date();
    const duration = Date.now() - turnStartedAt.getTime();

    state.activeTurn = undefined;
    state.turnStartedAt = undefined;
    state.totalProcessed++;
    state.lastProcessedAt = new Date();

    const event: TurnCompletedEvent = {
      roomId,
      peerId: entry.peerId,
      turnId: entry.id,
      duration,
      completedAt: new Date(),
      wasInterrupted,
    };

    this.callbacks.onTurnCompleted?.(event);
    this.notifyQueueUpdate(roomId, state);

    return event;
  }

  /**
   * Bump a request to front of queue (priority override)
   */
  bumpToFront(roomId: RoomId, requestId: string): boolean {
    const state = this.rooms.get(roomId);
    if (!state) return false;

    const index = state.queue.findIndex((e) => e.id === requestId);
    if (index === -1 || index === 0) return false;

    const entry = state.queue.splice(index, 1)[0];
    entry.isPriority = true;
    entry.priority = Math.max(entry.priority, 100);
    state.queue.unshift(entry);

    this.updatePositions(state);
    this.notifyQueueUpdate(roomId, state);

    return true;
  }

  /**
   * Get queue state for a room
   */
  getQueueState(roomId: RoomId): TurnQueueState | null {
    const state = this.rooms.get(roomId);
    if (!state) return null;

    return {
      queue: state.queue.map((e) => ({
        id: e.id,
        peerId: e.peerId,
        peerDisplayName: e.peerDisplayName,
        roomId: e.roomId,
        createdAt: e.createdAt,
        expiresAt: e.expiresAt,
        position: e.position,
        priority: e.priority,
      })),
      activeTurn: state.activeTurn ? {
        id: state.activeTurn.id,
        peerId: state.activeTurn.peerId,
        peerDisplayName: state.activeTurn.peerDisplayName,
        roomId: state.activeTurn.roomId,
        createdAt: state.activeTurn.createdAt,
        expiresAt: state.activeTurn.expiresAt,
        position: 0,
        priority: state.activeTurn.priority,
      } : undefined,
      totalProcessed: state.totalProcessed,
      totalExpired: state.totalExpired,
    };
  }

  /**
   * Get position of a peer in queue
   */
  getPosition(roomId: RoomId, peerId: PeerId): number {
    const state = this.rooms.get(roomId);
    if (!state) return -1;

    // Check active turn
    if (state.activeTurn?.peerId === peerId) {
      return 0;
    }

    // Find in queue
    const entry = state.queue.find((e) => e.peerId === peerId);
    return entry?.position ?? -1;
  }

  /**
   * Get active turn for a room
   */
  getActiveTurn(roomId: RoomId): QueueEntry | null {
    return this.rooms.get(roomId)?.activeTurn ?? null;
  }

  /**
   * Check if a peer has active turn
   */
  hasActiveTurn(roomId: RoomId, peerId: PeerId): boolean {
    return this.rooms.get(roomId)?.activeTurn?.peerId === peerId;
  }

  /**
   * Get queue length for a room
   */
  getQueueLength(roomId: RoomId): number {
    return this.rooms.get(roomId)?.queue.length ?? 0;
  }

  /**
   * Get statistics for a room
   */
  getStatistics(roomId: RoomId): {
    queueLength: number;
    totalProcessed: number;
    totalExpired: number;
    totalRejected: number;
    hasActiveTurn: boolean;
    isProcessing: boolean;
  } | null {
    const state = this.rooms.get(roomId);
    if (!state) return null;

    return {
      queueLength: state.queue.length,
      totalProcessed: state.totalProcessed,
      totalExpired: state.totalExpired,
      totalRejected: state.totalRejected,
      hasActiveTurn: !!state.activeTurn,
      isProcessing: state.isProcessing,
    };
  }

  /**
   * Check if room is initialized
   */
  hasRoom(roomId: RoomId): boolean {
    return this.rooms.has(roomId);
  }

  /**
   * Get room count
   */
  getRoomCount(): number {
    return this.rooms.size;
  }

  /**
   * Clear queue for a room
   */
  clearQueue(roomId: RoomId): number {
    const state = this.rooms.get(roomId);
    if (!state) return 0;

    const count = state.queue.length;

    // Clear timeouts
    state.queue.forEach((entry) => {
      const timer = state.timeoutTimers.get(entry.id);
      if (timer) {
        clearTimeout(timer);
        state.timeoutTimers.delete(entry.id);
      }
    });

    state.queue = [];
    this.notifyQueueUpdate(roomId, state);

    return count;
  }

  /**
   * Dispose the processor
   */
  dispose(): void {
    this.rooms.forEach((state, roomId) => {
      state.timeoutTimers.forEach((timer) => clearTimeout(timer));
      if (state.processingTimer) {
        clearTimeout(state.processingTimer);
      }
    });
    this.rooms.clear();
  }

  // ========== Private Methods ==========

  /**
   * Insert entry into queue maintaining priority order
   */
  private insertIntoQueue(state: RoomQueueState, entry: QueueEntry): void {
    // Find insertion point (higher priority first, then FIFO)
    let insertIndex = state.queue.length;
    for (let i = 0; i < state.queue.length; i++) {
      if (entry.priority > state.queue[i].priority) {
        insertIndex = i;
        break;
      }
    }

    state.queue.splice(insertIndex, 0, entry);
    this.updatePositions(state);
  }

  /**
   * Update queue positions and notify changes
   */
  private updatePositions(state: RoomQueueState): void {
    const previousPositions = new Map<PeerId, number>();

    // Store previous positions
    state.queue.forEach((entry, index) => {
      previousPositions.set(entry.peerId, entry.position);
      entry.position = index + 1;
    });

    // Notify position changes
    state.queue.forEach((entry) => {
      const previous = previousPositions.get(entry.peerId) ?? 0;
      if (previous !== entry.position) {
        this.callbacks.onPositionChange?.({
          peerId: entry.peerId,
          previousPosition: previous,
          newPosition: entry.position,
          roomId: entry.roomId,
          timestamp: new Date(),
        });
      }
    });
  }

  /**
   * Handle request timeout
   */
  private handleTimeout(roomId: RoomId, requestId: string): void {
    const state = this.rooms.get(roomId);
    if (!state) return;

    const index = state.queue.findIndex((e) => e.id === requestId);
    if (index === -1) return;

    const entry = state.queue.splice(index, 1)[0];
    state.totalExpired++;
    state.timeoutTimers.delete(requestId);

    this.updatePositions(state);
    this.notifyQueueUpdate(roomId, state);

    this.callbacks.onRequestExpired?.(roomId, entry);
  }

  /**
   * Notify queue update
   */
  private notifyQueueUpdate(roomId: RoomId, state: RoomQueueState): void {
    const queueState = this.getQueueState(roomId);
    if (queueState) {
      this.callbacks.onQueueUpdate?.(roomId, queueState);
    }
  }
}

/**
 * Factory function
 */
export function createTurnQueueProcessor(
  options?: TurnQueueProcessorOptions,
  callbacks?: TurnQueueProcessorCallbacks
): TurnQueueProcessor {
  return new TurnQueueProcessor(options, callbacks);
}

export default TurnQueueProcessor;
