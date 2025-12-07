/**
 * Signaling Performance Optimization
 *
 * Provides optimizations for the signaling pipeline:
 * - Message batching for presence updates
 * - Delta updates for presence state
 * - Message compression utilities
 * - Room state sync optimization
 * - Performance metrics collection
 *
 * Part of the Long-Horizon Engineering Protocol - FEAT-407
 */

import type { PeerId } from '@/types/peer';

/**
 * Presence update fields that can be batched
 */
export interface PresenceFields {
  isMuted?: boolean;
  isSpeaking?: boolean;
  audioLevel?: number;
  isHandRaised?: boolean;
  customStatus?: string;
}

/**
 * Batched presence update
 */
export interface BatchedPresenceUpdate {
  peerId: PeerId;
  fields: PresenceFields;
  timestamp: number;
}

/**
 * Message batch for sending
 */
export interface MessageBatch<T = unknown> {
  type: string;
  messages: T[];
  timestamp: number;
  compressed: boolean;
}

/**
 * Batch configuration options
 */
export interface BatcherOptions {
  /** Maximum messages per batch */
  maxBatchSize?: number;
  /** Maximum time to wait before flushing (ms) */
  maxWaitTime?: number;
  /** Minimum time between flushes (ms) */
  minFlushInterval?: number;
  /** Enable compression for large batches */
  enableCompression?: boolean;
  /** Compression threshold in bytes */
  compressionThreshold?: number;
}

/**
 * Default batcher options
 */
export const DEFAULT_BATCHER_OPTIONS: Required<BatcherOptions> = {
  maxBatchSize: 10,
  maxWaitTime: 50,        // 50ms max latency
  minFlushInterval: 16,   // ~60fps
  enableCompression: true,
  compressionThreshold: 1024,  // 1KB
};

/**
 * Batcher statistics
 */
export interface BatcherStats {
  totalMessages: number;
  totalBatches: number;
  avgBatchSize: number;
  maxBatchSize: number;
  compressionRatio: number;
  messagesSaved: number;
}

/**
 * Message Batcher
 *
 * Batches multiple messages together to reduce network overhead.
 */
export class MessageBatcher<T> {
  private queue: T[] = [];
  private flushTimeout: NodeJS.Timeout | null = null;
  private lastFlushTime: number = 0;
  private options: Required<BatcherOptions>;

  // Stats
  private totalMessages: number = 0;
  private totalBatches: number = 0;
  private totalBatchedSize: number = 0;
  private maxObservedBatchSize: number = 0;
  private totalUncompressedSize: number = 0;
  private totalCompressedSize: number = 0;

  private onFlush: (batch: MessageBatch<T>) => void;

  constructor(
    messageType: string,
    onFlush: (batch: MessageBatch<T>) => void,
    options: BatcherOptions = {}
  ) {
    this.options = { ...DEFAULT_BATCHER_OPTIONS, ...options };
    this.onFlush = onFlush;
    this.messageType = messageType;
  }

  private messageType: string;

  /**
   * Add a message to the batch
   */
  add(message: T): void {
    this.queue.push(message);
    this.totalMessages++;

    // Flush immediately if batch is full
    if (this.queue.length >= this.options.maxBatchSize) {
      this.flush();
      return;
    }

    // Schedule flush if not already scheduled
    if (!this.flushTimeout) {
      this.scheduleFlush();
    }
  }

  /**
   * Force flush current batch
   */
  flush(): void {
    if (this.queue.length === 0) {
      return;
    }

    // Clear scheduled flush
    if (this.flushTimeout) {
      clearTimeout(this.flushTimeout);
      this.flushTimeout = null;
    }

    // Check minimum flush interval
    const now = Date.now();
    const timeSinceLastFlush = now - this.lastFlushTime;
    if (timeSinceLastFlush < this.options.minFlushInterval) {
      this.scheduleFlush();
      return;
    }

    // Create batch
    const messages = this.queue.splice(0);
    const batch: MessageBatch<T> = {
      type: this.messageType,
      messages,
      timestamp: now,
      compressed: false,
    };

    // Update stats
    this.totalBatches++;
    this.totalBatchedSize += messages.length;
    this.maxObservedBatchSize = Math.max(this.maxObservedBatchSize, messages.length);
    this.lastFlushTime = now;

    // Track compression stats
    const serialized = JSON.stringify(messages);
    this.totalUncompressedSize += serialized.length;
    this.totalCompressedSize += serialized.length; // Would be smaller if compressed

    // Emit batch
    this.onFlush(batch);
  }

  /**
   * Get current queue size
   */
  getQueueSize(): number {
    return this.queue.length;
  }

  /**
   * Get statistics
   */
  getStats(): BatcherStats {
    const avgBatchSize = this.totalBatches > 0
      ? this.totalBatchedSize / this.totalBatches
      : 0;

    const compressionRatio = this.totalUncompressedSize > 0
      ? this.totalCompressedSize / this.totalUncompressedSize
      : 1;

    // Messages saved = total messages - total batches (each batch is 1 network call)
    const messagesSaved = Math.max(0, this.totalMessages - this.totalBatches);

    return {
      totalMessages: this.totalMessages,
      totalBatches: this.totalBatches,
      avgBatchSize,
      maxBatchSize: this.maxObservedBatchSize,
      compressionRatio,
      messagesSaved,
    };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.totalMessages = 0;
    this.totalBatches = 0;
    this.totalBatchedSize = 0;
    this.maxObservedBatchSize = 0;
    this.totalUncompressedSize = 0;
    this.totalCompressedSize = 0;
  }

  /**
   * Clear queue and cancel pending flush
   */
  clear(): void {
    this.queue = [];
    if (this.flushTimeout) {
      clearTimeout(this.flushTimeout);
      this.flushTimeout = null;
    }
  }

  /**
   * Dispose of the batcher
   */
  dispose(): void {
    this.clear();
  }

  /**
   * Schedule a flush
   */
  private scheduleFlush(): void {
    if (this.flushTimeout) {
      return;
    }

    this.flushTimeout = setTimeout(() => {
      this.flushTimeout = null;
      this.flush();
    }, this.options.maxWaitTime);
  }
}

/**
 * Delta update for presence state
 */
export interface PresenceDelta {
  peerId: PeerId;
  changes: Partial<PresenceFields>;
  version: number;
  timestamp: number;
}

/**
 * Full presence state
 */
export interface PresenceState extends PresenceFields {
  peerId: PeerId;
  version: number;
  lastUpdated: number;
}

/**
 * Delta tracker options
 */
export interface DeltaTrackerOptions {
  /** Maximum deltas to keep in history */
  maxHistorySize?: number;
  /** Enable delta coalescing for same peer */
  enableCoalescing?: boolean;
  /** Coalescing window in ms */
  coalescingWindow?: number;
}

/**
 * Default delta tracker options
 */
export const DEFAULT_DELTA_TRACKER_OPTIONS: Required<DeltaTrackerOptions> = {
  maxHistorySize: 100,
  enableCoalescing: true,
  coalescingWindow: 50,
};

/**
 * Presence Delta Tracker
 *
 * Tracks changes to presence state and generates delta updates
 * instead of sending full state on every change.
 */
export class PresenceDeltaTracker {
  private states: Map<PeerId, PresenceState> = new Map();
  private pendingDeltas: Map<PeerId, PresenceDelta> = new Map();
  private deltaHistory: PresenceDelta[] = [];
  private nextVersion: number = 1;
  private options: Required<DeltaTrackerOptions>;

  // Stats
  private totalUpdates: number = 0;
  private deltaUpdates: number = 0;
  private fullUpdates: number = 0;
  private coalescedUpdates: number = 0;

  constructor(options: DeltaTrackerOptions = {}) {
    this.options = { ...DEFAULT_DELTA_TRACKER_OPTIONS, ...options };
  }

  /**
   * Update presence state for a peer
   * @returns Delta if changes detected, null otherwise
   */
  update(peerId: PeerId, newFields: Partial<PresenceFields>): PresenceDelta | null {
    this.totalUpdates++;

    const existing = this.states.get(peerId);
    const now = Date.now();

    if (!existing) {
      // New peer - create full state
      const state: PresenceState = {
        peerId,
        version: this.nextVersion++,
        lastUpdated: now,
        ...newFields,
      };
      this.states.set(peerId, state);
      this.fullUpdates++;

      // Return as delta with all fields
      const delta: PresenceDelta = {
        peerId,
        changes: newFields,
        version: state.version,
        timestamp: now,
      };
      this.addToHistory(delta);
      return delta;
    }

    // Calculate changes
    const changes: Partial<PresenceFields> = {};
    let hasChanges = false;

    for (const [key, value] of Object.entries(newFields)) {
      const existingValue = existing[key as keyof PresenceFields];
      if (existingValue !== value) {
        (changes as Record<string, unknown>)[key] = value;
        hasChanges = true;
      }
    }

    if (!hasChanges) {
      return null;
    }

    // Check for coalescing opportunity
    if (this.options.enableCoalescing) {
      const pendingDelta = this.pendingDeltas.get(peerId);
      if (pendingDelta && (now - pendingDelta.timestamp) < this.options.coalescingWindow) {
        // Coalesce with pending delta
        Object.assign(pendingDelta.changes, changes);
        pendingDelta.timestamp = now;
        this.coalescedUpdates++;
        return null; // Will be flushed later
      }
    }

    // Update state
    const newVersion = this.nextVersion++;
    Object.assign(existing, changes);
    existing.version = newVersion;
    existing.lastUpdated = now;

    this.deltaUpdates++;

    // Create delta
    const delta: PresenceDelta = {
      peerId,
      changes,
      version: newVersion,
      timestamp: now,
    };

    if (this.options.enableCoalescing) {
      this.pendingDeltas.set(peerId, delta);
    }

    this.addToHistory(delta);
    return delta;
  }

  /**
   * Get full state for a peer
   */
  getState(peerId: PeerId): PresenceState | undefined {
    return this.states.get(peerId);
  }

  /**
   * Get all peer states
   */
  getAllStates(): PresenceState[] {
    return Array.from(this.states.values());
  }

  /**
   * Get pending deltas (for coalescing flush)
   */
  getPendingDeltas(): PresenceDelta[] {
    const deltas = Array.from(this.pendingDeltas.values());
    this.pendingDeltas.clear();
    return deltas;
  }

  /**
   * Get deltas since a specific version
   */
  getDeltasSince(version: number): PresenceDelta[] {
    return this.deltaHistory.filter(d => d.version > version);
  }

  /**
   * Get current version
   */
  getCurrentVersion(): number {
    return this.nextVersion - 1;
  }

  /**
   * Remove peer state
   */
  remove(peerId: PeerId): boolean {
    this.pendingDeltas.delete(peerId);
    return this.states.delete(peerId);
  }

  /**
   * Clear all state
   */
  clear(): void {
    this.states.clear();
    this.pendingDeltas.clear();
    this.deltaHistory = [];
    this.nextVersion = 1;
  }

  /**
   * Get statistics
   */
  getStats(): {
    totalUpdates: number;
    deltaUpdates: number;
    fullUpdates: number;
    coalescedUpdates: number;
    deltaRatio: number;
    bandwidthSaved: number;
  } {
    const deltaRatio = this.totalUpdates > 0
      ? this.deltaUpdates / this.totalUpdates
      : 0;

    // Estimate bandwidth saved (deltas are typically 80% smaller)
    const bandwidthSaved = this.deltaUpdates * 0.8;

    return {
      totalUpdates: this.totalUpdates,
      deltaUpdates: this.deltaUpdates,
      fullUpdates: this.fullUpdates,
      coalescedUpdates: this.coalescedUpdates,
      deltaRatio,
      bandwidthSaved,
    };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.totalUpdates = 0;
    this.deltaUpdates = 0;
    this.fullUpdates = 0;
    this.coalescedUpdates = 0;
  }

  /**
   * Add delta to history
   */
  private addToHistory(delta: PresenceDelta): void {
    this.deltaHistory.push(delta);

    // Trim history
    while (this.deltaHistory.length > this.options.maxHistorySize) {
      this.deltaHistory.shift();
    }
  }
}

/**
 * Room state sync options
 */
export interface RoomStateSyncOptions {
  /** Sync interval in ms */
  syncInterval?: number;
  /** Enable incremental sync */
  incrementalSync?: boolean;
  /** Maximum sync payload size */
  maxPayloadSize?: number;
}

/**
 * Default room state sync options
 */
export const DEFAULT_ROOM_SYNC_OPTIONS: Required<RoomStateSyncOptions> = {
  syncInterval: 5000,      // 5 seconds
  incrementalSync: true,
  maxPayloadSize: 16384,   // 16KB
};

/**
 * Room state snapshot for sync
 */
export interface RoomStateSnapshot {
  roomId: string;
  version: number;
  participants: {
    peerId: PeerId;
    displayName: string;
    presence: PresenceFields;
  }[];
  aiState?: {
    isActive: boolean;
    currentSpeaker?: PeerId;
  };
  timestamp: number;
}

/**
 * Room state diff for incremental sync
 */
export interface RoomStateDiff {
  roomId: string;
  fromVersion: number;
  toVersion: number;
  added: { peerId: PeerId; displayName: string; presence: PresenceFields }[];
  removed: PeerId[];
  updated: { peerId: PeerId; changes: Partial<PresenceFields> }[];
  aiStateChange?: { isActive: boolean; currentSpeaker?: PeerId };
  timestamp: number;
}

/**
 * Room State Sync Manager
 *
 * Manages efficient room state synchronization using
 * incremental diffs instead of full state snapshots.
 */
export class RoomStateSyncManager {
  private currentState: RoomStateSnapshot | null = null;
  private stateHistory: RoomStateSnapshot[] = [];
  private options: Required<RoomStateSyncOptions>;
  private lastSyncTime: number = 0;

  // Stats
  private totalSyncs: number = 0;
  private incrementalSyncs: number = 0;
  private fullSyncs: number = 0;

  constructor(options: RoomStateSyncOptions = {}) {
    this.options = { ...DEFAULT_ROOM_SYNC_OPTIONS, ...options };
  }

  /**
   * Set current room state
   */
  setState(state: RoomStateSnapshot): void {
    // Save to history
    if (this.currentState) {
      this.stateHistory.push(this.currentState);
      // Keep limited history
      while (this.stateHistory.length > 10) {
        this.stateHistory.shift();
      }
    }

    this.currentState = state;
  }

  /**
   * Get current state
   */
  getState(): RoomStateSnapshot | null {
    return this.currentState;
  }

  /**
   * Generate sync payload
   * @returns Either full snapshot or incremental diff
   */
  generateSyncPayload(clientVersion?: number): RoomStateSnapshot | RoomStateDiff | null {
    if (!this.currentState) {
      return null;
    }

    this.totalSyncs++;

    // If client has no version or incremental sync disabled, send full state
    if (clientVersion === undefined || !this.options.incrementalSync) {
      this.fullSyncs++;
      return this.currentState;
    }

    // If client is up to date, no sync needed
    if (clientVersion >= this.currentState.version) {
      return null;
    }

    // Try to generate incremental diff
    const previousState = this.findStateByVersion(clientVersion);
    if (!previousState) {
      // Can't generate diff, send full state
      this.fullSyncs++;
      return this.currentState;
    }

    this.incrementalSyncs++;
    return this.generateDiff(previousState, this.currentState);
  }

  /**
   * Apply diff to local state
   */
  applyDiff(diff: RoomStateDiff): RoomStateSnapshot | null {
    if (!this.currentState || this.currentState.roomId !== diff.roomId) {
      return null;
    }

    // Verify version chain
    if (this.currentState.version !== diff.fromVersion) {
      return null;
    }

    // Apply changes
    const newParticipants = [...this.currentState.participants];

    // Remove participants
    for (const peerId of diff.removed) {
      const index = newParticipants.findIndex(p => p.peerId === peerId);
      if (index !== -1) {
        newParticipants.splice(index, 1);
      }
    }

    // Add participants
    for (const added of diff.added) {
      newParticipants.push(added);
    }

    // Update participants
    for (const update of diff.updated) {
      const participant = newParticipants.find(p => p.peerId === update.peerId);
      if (participant) {
        Object.assign(participant.presence, update.changes);
      }
    }

    // Create new state
    const newState: RoomStateSnapshot = {
      ...this.currentState,
      version: diff.toVersion,
      participants: newParticipants,
      timestamp: diff.timestamp,
    };

    // Apply AI state change
    if (diff.aiStateChange) {
      newState.aiState = diff.aiStateChange;
    }

    this.setState(newState);
    return newState;
  }

  /**
   * Check if sync is needed based on interval
   */
  shouldSync(): boolean {
    const now = Date.now();
    return (now - this.lastSyncTime) >= this.options.syncInterval;
  }

  /**
   * Mark sync as completed
   */
  markSynced(): void {
    this.lastSyncTime = Date.now();
  }

  /**
   * Get statistics
   */
  getStats(): {
    totalSyncs: number;
    incrementalSyncs: number;
    fullSyncs: number;
    incrementalRatio: number;
  } {
    const incrementalRatio = this.totalSyncs > 0
      ? this.incrementalSyncs / this.totalSyncs
      : 0;

    return {
      totalSyncs: this.totalSyncs,
      incrementalSyncs: this.incrementalSyncs,
      fullSyncs: this.fullSyncs,
      incrementalRatio,
    };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.totalSyncs = 0;
    this.incrementalSyncs = 0;
    this.fullSyncs = 0;
  }

  /**
   * Clear all state
   */
  clear(): void {
    this.currentState = null;
    this.stateHistory = [];
    this.lastSyncTime = 0;
  }

  /**
   * Find state by version in history
   */
  private findStateByVersion(version: number): RoomStateSnapshot | null {
    if (this.currentState?.version === version) {
      return this.currentState;
    }

    for (const state of this.stateHistory) {
      if (state.version === version) {
        return state;
      }
    }

    return null;
  }

  /**
   * Generate diff between two states
   */
  private generateDiff(from: RoomStateSnapshot, to: RoomStateSnapshot): RoomStateDiff {
    const fromPeerIds = new Set(from.participants.map(p => p.peerId));
    const toPeerIds = new Set(to.participants.map(p => p.peerId));

    const added: RoomStateDiff['added'] = [];
    const removed: PeerId[] = [];
    const updated: RoomStateDiff['updated'] = [];

    // Find added participants
    for (const participant of to.participants) {
      if (!fromPeerIds.has(participant.peerId)) {
        added.push(participant);
      }
    }

    // Find removed participants
    for (const participant of from.participants) {
      if (!toPeerIds.has(participant.peerId)) {
        removed.push(participant.peerId);
      }
    }

    // Find updated participants
    for (const toParticipant of to.participants) {
      const fromParticipant = from.participants.find(p => p.peerId === toParticipant.peerId);
      if (fromParticipant) {
        const changes: Partial<PresenceFields> = {};
        let hasChanges = false;

        for (const [key, value] of Object.entries(toParticipant.presence)) {
          if (fromParticipant.presence[key as keyof PresenceFields] !== value) {
            (changes as Record<string, unknown>)[key] = value;
            hasChanges = true;
          }
        }

        if (hasChanges) {
          updated.push({ peerId: toParticipant.peerId, changes });
        }
      }
    }

    // Check AI state change
    let aiStateChange: RoomStateDiff['aiStateChange'];
    if (JSON.stringify(from.aiState) !== JSON.stringify(to.aiState)) {
      aiStateChange = to.aiState;
    }

    return {
      roomId: to.roomId,
      fromVersion: from.version,
      toVersion: to.version,
      added,
      removed,
      updated,
      aiStateChange,
      timestamp: to.timestamp,
    };
  }
}

/**
 * Signaling performance metrics
 */
export interface SignalingPerformanceMetrics {
  /** Messages per second */
  messagesPerSecond: number;
  /** Average message size in bytes */
  avgMessageSize: number;
  /** Batch efficiency (messages saved / total messages) */
  batchEfficiency: number;
  /** Delta efficiency (delta updates / total updates) */
  deltaEfficiency: number;
  /** Sync efficiency (incremental syncs / total syncs) */
  syncEfficiency: number;
  /** Estimated bandwidth saved in bytes */
  bandwidthSaved: number;
  /** Timestamp */
  lastUpdated: Date;
}

/**
 * Signaling Performance Monitor
 *
 * Aggregates performance metrics from batching, delta tracking,
 * and room state sync components.
 */
export class SignalingPerformanceMonitor {
  private messageBatcher: MessageBatcher<unknown> | null = null;
  private deltaTracker: PresenceDeltaTracker | null = null;
  private syncManager: RoomStateSyncManager | null = null;

  private messageCount: number = 0;
  private totalMessageSize: number = 0;
  private startTime: number = Date.now();

  /**
   * Set components to monitor
   */
  setComponents(
    batcher?: MessageBatcher<unknown>,
    deltaTracker?: PresenceDeltaTracker,
    syncManager?: RoomStateSyncManager
  ): void {
    this.messageBatcher = batcher ?? null;
    this.deltaTracker = deltaTracker ?? null;
    this.syncManager = syncManager ?? null;
  }

  /**
   * Record a message
   */
  recordMessage(sizeBytes: number): void {
    this.messageCount++;
    this.totalMessageSize += sizeBytes;
  }

  /**
   * Get aggregated metrics
   */
  getMetrics(): SignalingPerformanceMetrics {
    const elapsed = (Date.now() - this.startTime) / 1000;
    const messagesPerSecond = elapsed > 0 ? this.messageCount / elapsed : 0;
    const avgMessageSize = this.messageCount > 0
      ? this.totalMessageSize / this.messageCount
      : 0;

    const batcherStats = this.messageBatcher?.getStats();
    const batchEfficiency = batcherStats
      ? batcherStats.messagesSaved / Math.max(1, batcherStats.totalMessages)
      : 0;

    const deltaStats = this.deltaTracker?.getStats();
    const deltaEfficiency = deltaStats?.deltaRatio ?? 0;

    const syncStats = this.syncManager?.getStats();
    const syncEfficiency = syncStats?.incrementalRatio ?? 0;

    // Estimate bandwidth saved
    const batchSaved = batcherStats?.messagesSaved ?? 0;
    const deltaSaved = deltaStats?.bandwidthSaved ?? 0;
    const bandwidthSaved = (batchSaved * 50) + deltaSaved; // ~50 bytes per message overhead

    return {
      messagesPerSecond,
      avgMessageSize,
      batchEfficiency,
      deltaEfficiency,
      syncEfficiency,
      bandwidthSaved,
      lastUpdated: new Date(),
    };
  }

  /**
   * Reset all stats
   */
  reset(): void {
    this.messageCount = 0;
    this.totalMessageSize = 0;
    this.startTime = Date.now();
    this.messageBatcher?.resetStats();
    this.deltaTracker?.resetStats();
    this.syncManager?.resetStats();
  }
}

/**
 * Simple message compression using JSON minification
 * For actual production, consider using pako or lz-string
 */
export function compressMessage<T>(message: T): string {
  return JSON.stringify(message);
}

/**
 * Decompress message
 */
export function decompressMessage<T>(compressed: string): T {
  return JSON.parse(compressed);
}

/**
 * Calculate message size in bytes
 */
export function getMessageSize(message: unknown): number {
  return new TextEncoder().encode(JSON.stringify(message)).length;
}

/**
 * Create optimized signaling setup
 */
export function createOptimizedSignalingSetup(): {
  batcher: MessageBatcher<BatchedPresenceUpdate>;
  deltaTracker: PresenceDeltaTracker;
  syncManager: RoomStateSyncManager;
  monitor: SignalingPerformanceMonitor;
} {
  const pendingBatches: MessageBatch<BatchedPresenceUpdate>[] = [];

  const batcher = new MessageBatcher<BatchedPresenceUpdate>(
    'presence:batch',
    (batch) => {
      pendingBatches.push(batch);
    },
    {
      maxBatchSize: 10,
      maxWaitTime: 50,
      minFlushInterval: 16,
    }
  );

  const deltaTracker = new PresenceDeltaTracker({
    maxHistorySize: 100,
    enableCoalescing: true,
    coalescingWindow: 50,
  });

  const syncManager = new RoomStateSyncManager({
    syncInterval: 5000,
    incrementalSync: true,
  });

  const monitor = new SignalingPerformanceMonitor();
  monitor.setComponents(batcher as MessageBatcher<unknown>, deltaTracker, syncManager);

  return {
    batcher,
    deltaTracker,
    syncManager,
    monitor,
  };
}
