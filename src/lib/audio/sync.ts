/**
 * Audio Synchronization
 *
 * Manages audio playback timing synchronization across peers.
 * Implements jitter buffering and synchronized playback start.
 *
 * Part of the Long-Horizon Engineering Protocol - FEAT-206
 */

import type { PeerId } from '@/types/peer';

/**
 * Sync status for a peer
 */
export type SyncStatus = 'synced' | 'ahead' | 'behind' | 'unknown';

/**
 * Peer sync info
 */
export interface PeerSyncInfo {
  /** Peer ID */
  peerId: PeerId;
  /** Current sync status */
  status: SyncStatus;
  /** Offset from reference time in ms (positive = ahead, negative = behind) */
  offsetMs: number;
  /** Last sync timestamp */
  lastSyncTime: number;
  /** Buffer fill level (0-1) */
  bufferLevel: number;
  /** Jitter variance in ms */
  jitterMs: number;
  /** Whether peer is actively playing */
  isPlaying: boolean;
}

/**
 * Sync event types
 */
export interface SyncEvents {
  /** Called when sync status changes */
  onSyncStatusChange?: (peerId: PeerId, status: SyncStatus, offsetMs: number) => void;
  /** Called when resync is needed */
  onResyncNeeded?: (peerId: PeerId, reason: string) => void;
  /** Called when sync accuracy is measured */
  onSyncAccuracy?: (accuracy: SyncAccuracy) => void;
  /** Called when buffer underrun occurs */
  onBufferUnderrun?: (peerId: PeerId) => void;
  /** Called when buffer overrun occurs */
  onBufferOverrun?: (peerId: PeerId) => void;
}

/**
 * Sync accuracy metrics
 */
export interface SyncAccuracy {
  /** Average offset across all peers in ms */
  averageOffsetMs: number;
  /** Maximum offset observed in ms */
  maxOffsetMs: number;
  /** Standard deviation of offsets in ms */
  stdDevMs: number;
  /** Percentage of peers within acceptable sync (0-1) */
  syncedPercentage: number;
  /** Number of peers being tracked */
  peerCount: number;
  /** Timestamp of measurement */
  timestamp: number;
}

/**
 * Jitter buffer configuration
 */
export interface JitterBufferOptions {
  /** Target buffer size in ms (default: 100) */
  targetBufferMs?: number;
  /** Minimum buffer size in ms (default: 20) */
  minBufferMs?: number;
  /** Maximum buffer size in ms (default: 500) */
  maxBufferMs?: number;
  /** Adaptive buffer adjustment enabled (default: true) */
  adaptiveBuffer?: boolean;
  /** Jitter threshold for buffer adjustment in ms (default: 30) */
  jitterThresholdMs?: number;
}

/**
 * Audio sync options
 */
export interface AudioSyncOptions extends JitterBufferOptions {
  /** Acceptable sync offset threshold in ms (default: 50) */
  syncThresholdMs?: number;
  /** How often to measure sync accuracy in ms (default: 1000) */
  measureIntervalMs?: number;
  /** Enable automatic resync when threshold exceeded (default: true) */
  autoResync?: boolean;
  /** Maximum time to wait for peers to sync in ms (default: 5000) */
  syncTimeoutMs?: number;
  /** Reference time source: 'local' or 'server' (default: 'local') */
  referenceSource?: 'local' | 'server';
}

/**
 * Jitter buffer for a single peer
 */
interface JitterBuffer {
  peerId: PeerId;
  targetMs: number;
  currentMs: number;
  minMs: number;
  maxMs: number;
  samples: number[];
  jitterMs: number;
  lastUpdateTime: number;
}

/**
 * Peer timing state
 */
interface PeerTimingState {
  peerId: PeerId;
  buffer: JitterBuffer;
  offsetMs: number;
  status: SyncStatus;
  isPlaying: boolean;
  playbackStartTime: number | null;
  lastPacketTime: number;
  packetCount: number;
}

/**
 * Default options
 */
const DEFAULT_OPTIONS: Required<AudioSyncOptions> = {
  targetBufferMs: 100,
  minBufferMs: 20,
  maxBufferMs: 500,
  adaptiveBuffer: true,
  jitterThresholdMs: 30,
  syncThresholdMs: 50,
  measureIntervalMs: 1000,
  autoResync: true,
  syncTimeoutMs: 5000,
  referenceSource: 'local',
};

/**
 * AudioSync class
 *
 * Manages audio playback synchronization across multiple peers.
 *
 * @example
 * ```ts
 * const sync = new AudioSync({
 *   syncThresholdMs: 50,
 *   autoResync: true,
 * }, {
 *   onSyncStatusChange: (peerId, status) => console.log(`${peerId}: ${status}`),
 *   onResyncNeeded: (peerId, reason) => console.log(`Resync ${peerId}: ${reason}`),
 * });
 *
 * // Add peers
 * sync.addPeer('peer-1');
 * sync.addPeer('peer-2');
 *
 * // Report timing info from peers
 * sync.reportPeerTiming('peer-1', { timestamp: Date.now(), playbackPosition: 0 });
 *
 * // Start synchronized playback
 * const startTime = sync.calculateSyncedStartTime();
 * ```
 */
export class AudioSync {
  private peers: Map<PeerId, PeerTimingState> = new Map();
  private referenceTime: number = 0;
  private isRunning: boolean = false;
  private measureInterval: ReturnType<typeof setInterval> | null = null;
  private serverTimeOffset: number = 0;

  // Options
  private syncThresholdMs: number;
  private measureIntervalMs: number;
  private autoResync: boolean;
  private syncTimeoutMs: number;
  private referenceSource: 'local' | 'server';
  private targetBufferMs: number;
  private minBufferMs: number;
  private maxBufferMs: number;
  private adaptiveBuffer: boolean;
  private jitterThresholdMs: number;

  // Callbacks
  private events: SyncEvents;

  constructor(options: AudioSyncOptions = {}, events: SyncEvents = {}) {
    this.syncThresholdMs = options.syncThresholdMs ?? DEFAULT_OPTIONS.syncThresholdMs;
    this.measureIntervalMs = options.measureIntervalMs ?? DEFAULT_OPTIONS.measureIntervalMs;
    this.autoResync = options.autoResync ?? DEFAULT_OPTIONS.autoResync;
    this.syncTimeoutMs = options.syncTimeoutMs ?? DEFAULT_OPTIONS.syncTimeoutMs;
    this.referenceSource = options.referenceSource ?? DEFAULT_OPTIONS.referenceSource;
    this.targetBufferMs = options.targetBufferMs ?? DEFAULT_OPTIONS.targetBufferMs;
    this.minBufferMs = options.minBufferMs ?? DEFAULT_OPTIONS.minBufferMs;
    this.maxBufferMs = options.maxBufferMs ?? DEFAULT_OPTIONS.maxBufferMs;
    this.adaptiveBuffer = options.adaptiveBuffer ?? DEFAULT_OPTIONS.adaptiveBuffer;
    this.jitterThresholdMs = options.jitterThresholdMs ?? DEFAULT_OPTIONS.jitterThresholdMs;

    this.events = events;
    this.referenceTime = this.getCurrentTime();
  }

  /**
   * Get current reference time
   */
  private getCurrentTime(): number {
    if (this.referenceSource === 'server') {
      return Date.now() + this.serverTimeOffset;
    }
    return Date.now();
  }

  /**
   * Set server time offset for server-based synchronization
   */
  setServerTimeOffset(offsetMs: number): void {
    this.serverTimeOffset = offsetMs;
  }

  /**
   * Get server time offset
   */
  getServerTimeOffset(): number {
    return this.serverTimeOffset;
  }

  /**
   * Create a new jitter buffer
   */
  private createJitterBuffer(peerId: PeerId): JitterBuffer {
    return {
      peerId,
      targetMs: this.targetBufferMs,
      currentMs: 0,
      minMs: this.minBufferMs,
      maxMs: this.maxBufferMs,
      samples: [],
      jitterMs: 0,
      lastUpdateTime: this.getCurrentTime(),
    };
  }

  /**
   * Add a peer to synchronization tracking
   */
  addPeer(peerId: PeerId): void {
    if (this.peers.has(peerId)) {
      return;
    }

    const state: PeerTimingState = {
      peerId,
      buffer: this.createJitterBuffer(peerId),
      offsetMs: 0,
      status: 'unknown',
      isPlaying: false,
      playbackStartTime: null,
      lastPacketTime: this.getCurrentTime(),
      packetCount: 0,
    };

    this.peers.set(peerId, state);
  }

  /**
   * Remove a peer from synchronization tracking
   */
  removePeer(peerId: PeerId): boolean {
    return this.peers.delete(peerId);
  }

  /**
   * Check if a peer is being tracked
   */
  hasPeer(peerId: PeerId): boolean {
    return this.peers.has(peerId);
  }

  /**
   * Get peer count
   */
  getPeerCount(): number {
    return this.peers.size;
  }

  /**
   * Report timing information from a peer
   */
  reportPeerTiming(
    peerId: PeerId,
    timing: { timestamp: number; playbackPosition?: number; bufferLevel?: number }
  ): void {
    const state = this.peers.get(peerId);
    if (!state) {
      return;
    }

    const now = this.getCurrentTime();
    const packetDelay = now - timing.timestamp;

    // Update jitter buffer
    this.updateJitterBuffer(state.buffer, packetDelay);

    // Calculate offset from reference
    const offset = timing.timestamp - this.referenceTime;
    state.offsetMs = offset;
    state.lastPacketTime = now;
    state.packetCount++;

    // Update buffer level if provided
    if (timing.bufferLevel !== undefined) {
      state.buffer.currentMs = timing.bufferLevel * state.buffer.targetMs;
    }

    // Determine sync status
    const previousStatus = state.status;
    state.status = this.calculateSyncStatus(offset);

    // Emit status change if changed
    if (state.status !== previousStatus) {
      this.events.onSyncStatusChange?.(peerId, state.status, offset);

      // Check if resync is needed
      if (this.autoResync && state.status !== 'synced') {
        if (Math.abs(offset) > this.syncThresholdMs * 2) {
          this.events.onResyncNeeded?.(peerId, `Offset ${offset}ms exceeds threshold`);
        }
      }
    }
  }

  /**
   * Update jitter buffer with new sample
   */
  private updateJitterBuffer(buffer: JitterBuffer, delayMs: number): void {
    const now = this.getCurrentTime();

    // Add sample to sliding window (keep last 20 samples)
    buffer.samples.push(delayMs);
    if (buffer.samples.length > 20) {
      buffer.samples.shift();
    }

    // Calculate jitter (standard deviation of delays)
    if (buffer.samples.length >= 2) {
      const mean = buffer.samples.reduce((a, b) => a + b, 0) / buffer.samples.length;
      const squaredDiffs = buffer.samples.map((s) => Math.pow(s - mean, 2));
      const avgSquaredDiff = squaredDiffs.reduce((a, b) => a + b, 0) / squaredDiffs.length;
      buffer.jitterMs = Math.sqrt(avgSquaredDiff);
    }

    // Adaptive buffer adjustment
    if (this.adaptiveBuffer) {
      if (buffer.jitterMs > this.jitterThresholdMs) {
        // Increase buffer for high jitter
        buffer.targetMs = Math.min(buffer.maxMs, buffer.targetMs + 10);
      } else if (buffer.jitterMs < this.jitterThresholdMs / 2 && buffer.targetMs > this.targetBufferMs) {
        // Decrease buffer when jitter is stable
        buffer.targetMs = Math.max(this.targetBufferMs, buffer.targetMs - 5);
      }
    }

    buffer.lastUpdateTime = now;
  }

  /**
   * Calculate sync status from offset
   */
  private calculateSyncStatus(offsetMs: number): SyncStatus {
    const absOffset = Math.abs(offsetMs);

    if (absOffset <= this.syncThresholdMs) {
      return 'synced';
    } else if (offsetMs > 0) {
      return 'ahead';
    } else {
      return 'behind';
    }
  }

  /**
   * Calculate synchronized start time for all peers
   */
  calculateSyncedStartTime(delayMs: number = 0): number {
    // Find the maximum buffer requirement across all peers
    let maxBufferNeeded = 0;
    this.peers.forEach((state) => {
      const bufferNeeded = state.buffer.targetMs + state.buffer.jitterMs;
      maxBufferNeeded = Math.max(maxBufferNeeded, bufferNeeded);
    });

    // Start time is now + max buffer + requested delay
    return this.getCurrentTime() + maxBufferNeeded + delayMs;
  }

  /**
   * Start playback for a peer at the given time
   */
  startPeerPlayback(peerId: PeerId, startTime: number): void {
    const state = this.peers.get(peerId);
    if (!state) {
      return;
    }

    state.playbackStartTime = startTime;
    state.isPlaying = true;
  }

  /**
   * Stop playback for a peer
   */
  stopPeerPlayback(peerId: PeerId): void {
    const state = this.peers.get(peerId);
    if (!state) {
      return;
    }

    state.playbackStartTime = null;
    state.isPlaying = false;
  }

  /**
   * Check if a peer is playing
   */
  isPeerPlaying(peerId: PeerId): boolean {
    return this.peers.get(peerId)?.isPlaying ?? false;
  }

  /**
   * Report buffer underrun for a peer
   */
  reportBufferUnderrun(peerId: PeerId): void {
    const state = this.peers.get(peerId);
    if (!state) {
      return;
    }

    // Increase buffer target
    state.buffer.targetMs = Math.min(state.buffer.maxMs, state.buffer.targetMs + 20);
    state.buffer.currentMs = 0;

    this.events.onBufferUnderrun?.(peerId);
    this.events.onResyncNeeded?.(peerId, 'Buffer underrun');
  }

  /**
   * Report buffer overrun for a peer
   */
  reportBufferOverrun(peerId: PeerId): void {
    const state = this.peers.get(peerId);
    if (!state) {
      return;
    }

    this.events.onBufferOverrun?.(peerId);
  }

  /**
   * Get sync info for a peer
   */
  getPeerSyncInfo(peerId: PeerId): PeerSyncInfo | null {
    const state = this.peers.get(peerId);
    if (!state) {
      return null;
    }

    return {
      peerId: state.peerId,
      status: state.status,
      offsetMs: state.offsetMs,
      lastSyncTime: state.lastPacketTime,
      bufferLevel: state.buffer.currentMs / state.buffer.targetMs,
      jitterMs: state.buffer.jitterMs,
      isPlaying: state.isPlaying,
    };
  }

  /**
   * Get sync info for all peers
   */
  getAllPeerSyncInfo(): PeerSyncInfo[] {
    const result: PeerSyncInfo[] = [];
    this.peers.forEach((state) => {
      result.push({
        peerId: state.peerId,
        status: state.status,
        offsetMs: state.offsetMs,
        lastSyncTime: state.lastPacketTime,
        bufferLevel: state.buffer.currentMs / state.buffer.targetMs,
        jitterMs: state.buffer.jitterMs,
        isPlaying: state.isPlaying,
      });
    });
    return result;
  }

  /**
   * Measure current sync accuracy
   */
  measureSyncAccuracy(): SyncAccuracy {
    const offsets: number[] = [];
    this.peers.forEach((state) => {
      offsets.push(state.offsetMs);
    });

    if (offsets.length === 0) {
      return {
        averageOffsetMs: 0,
        maxOffsetMs: 0,
        stdDevMs: 0,
        syncedPercentage: 1,
        peerCount: 0,
        timestamp: this.getCurrentTime(),
      };
    }

    // Calculate statistics
    const sum = offsets.reduce((a, b) => a + b, 0);
    const avg = sum / offsets.length;
    const maxOffset = Math.max(...offsets.map(Math.abs));

    // Standard deviation
    const squaredDiffs = offsets.map((o) => Math.pow(o - avg, 2));
    const avgSquaredDiff = squaredDiffs.reduce((a, b) => a + b, 0) / squaredDiffs.length;
    const stdDev = Math.sqrt(avgSquaredDiff);

    // Synced percentage
    const syncedCount = offsets.filter((o) => Math.abs(o) <= this.syncThresholdMs).length;
    const syncedPercentage = syncedCount / offsets.length;

    const accuracy: SyncAccuracy = {
      averageOffsetMs: avg,
      maxOffsetMs: maxOffset,
      stdDevMs: stdDev,
      syncedPercentage,
      peerCount: offsets.length,
      timestamp: this.getCurrentTime(),
    };

    this.events.onSyncAccuracy?.(accuracy);
    return accuracy;
  }

  /**
   * Request resync for a peer
   */
  requestResync(peerId: PeerId): void {
    const state = this.peers.get(peerId);
    if (!state) {
      return;
    }

    // Reset peer timing state
    state.offsetMs = 0;
    state.status = 'unknown';
    state.buffer.samples = [];
    state.buffer.jitterMs = 0;

    this.events.onResyncNeeded?.(peerId, 'Manual resync requested');
  }

  /**
   * Request resync for all peers
   */
  requestResyncAll(): void {
    this.peers.forEach((_, peerId) => {
      this.requestResync(peerId);
    });
  }

  /**
   * Set sync threshold
   */
  setSyncThreshold(thresholdMs: number): void {
    this.syncThresholdMs = Math.max(0, thresholdMs);
  }

  /**
   * Get sync threshold
   */
  getSyncThreshold(): number {
    return this.syncThresholdMs;
  }

  /**
   * Set target buffer size
   */
  setTargetBuffer(targetMs: number): void {
    this.targetBufferMs = Math.max(this.minBufferMs, Math.min(this.maxBufferMs, targetMs));
    this.peers.forEach((state) => {
      state.buffer.targetMs = this.targetBufferMs;
    });
  }

  /**
   * Get target buffer size
   */
  getTargetBuffer(): number {
    return this.targetBufferMs;
  }

  /**
   * Enable/disable adaptive buffer
   */
  setAdaptiveBuffer(enabled: boolean): void {
    this.adaptiveBuffer = enabled;
  }

  /**
   * Check if adaptive buffer is enabled
   */
  isAdaptiveBufferEnabled(): boolean {
    return this.adaptiveBuffer;
  }

  /**
   * Start periodic sync accuracy measurement
   */
  startMeasuring(): void {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    this.measureInterval = setInterval(() => {
      this.measureSyncAccuracy();
    }, this.measureIntervalMs);
  }

  /**
   * Stop periodic sync accuracy measurement
   */
  stopMeasuring(): void {
    if (this.measureInterval) {
      clearInterval(this.measureInterval);
      this.measureInterval = null;
    }
    this.isRunning = false;
  }

  /**
   * Check if measuring is active
   */
  isMeasuring(): boolean {
    return this.isRunning;
  }

  /**
   * Get reference time
   */
  getReferenceTime(): number {
    return this.referenceTime;
  }

  /**
   * Set reference time
   */
  setReferenceTime(time: number): void {
    this.referenceTime = time;
  }

  /**
   * Reset reference time to now
   */
  resetReferenceTime(): void {
    this.referenceTime = this.getCurrentTime();
  }

  /**
   * Get all peer IDs
   */
  getPeerIds(): PeerId[] {
    return Array.from(this.peers.keys());
  }

  /**
   * Clear all peers
   */
  clearPeers(): void {
    this.peers.clear();
  }

  /**
   * Dispose and clean up
   */
  dispose(): void {
    this.stopMeasuring();
    this.clearPeers();
  }
}

/**
 * Create a new audio sync instance
 */
export function createAudioSync(
  options?: AudioSyncOptions,
  events?: SyncEvents
): AudioSync {
  return new AudioSync(options, events);
}
