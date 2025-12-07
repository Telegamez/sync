/**
 * Signaling Performance Tests
 *
 * Tests for signaling optimizations including:
 * - Message batching
 * - Delta updates
 * - Room state sync
 * - Performance monitoring
 *
 * Part of the Long-Horizon Engineering Protocol - FEAT-407
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  MessageBatcher,
  PresenceDeltaTracker,
  RoomStateSyncManager,
  SignalingPerformanceMonitor,
  compressMessage,
  decompressMessage,
  getMessageSize,
  createOptimizedSignalingSetup,
  DEFAULT_BATCHER_OPTIONS,
  DEFAULT_DELTA_TRACKER_OPTIONS,
  DEFAULT_ROOM_SYNC_OPTIONS,
  type MessageBatch,
  type BatchedPresenceUpdate,
  type PresenceFields,
  type PresenceDelta,
  type RoomStateSnapshot,
  type RoomStateDiff,
} from '@/lib/signaling/performance';
import type { PeerId } from '@/types/peer';

// Helper to create unique peer IDs for testing
let peerIdCounter = 0;
function createPeerId(): PeerId {
  return `peer-${++peerIdCounter}` as PeerId;
}

describe('MessageBatcher', () => {
  let batcher: MessageBatcher<BatchedPresenceUpdate>;
  let flushedBatches: MessageBatch<BatchedPresenceUpdate>[];

  beforeEach(() => {
    vi.useFakeTimers();
    flushedBatches = [];
    batcher = new MessageBatcher<BatchedPresenceUpdate>(
      'presence:update',
      (batch) => flushedBatches.push(batch),
      {
        maxBatchSize: 5,
        maxWaitTime: 50,
        minFlushInterval: 10,
      }
    );
  });

  afterEach(() => {
    batcher.dispose();
    vi.useRealTimers();
  });

  describe('initialization', () => {
    it('should create batcher with default options', () => {
      const defaultBatcher = new MessageBatcher('test', () => {});
      expect(defaultBatcher.getQueueSize()).toBe(0);
      defaultBatcher.dispose();
    });

    it('should start with empty queue', () => {
      expect(batcher.getQueueSize()).toBe(0);
    });
  });

  describe('message batching', () => {
    it('should add messages to queue', () => {
      batcher.add({ peerId: createPeerId(), fields: { isMuted: true }, timestamp: Date.now() });
      expect(batcher.getQueueSize()).toBe(1);
    });

    it('should flush when max batch size reached', () => {
      for (let i = 0; i < 5; i++) {
        batcher.add({ peerId: createPeerId(), fields: { isMuted: true }, timestamp: Date.now() });
      }

      expect(flushedBatches).toHaveLength(1);
      expect(flushedBatches[0].messages).toHaveLength(5);
      expect(batcher.getQueueSize()).toBe(0);
    });

    it('should flush after max wait time', () => {
      batcher.add({ peerId: createPeerId(), fields: { isMuted: true }, timestamp: Date.now() });
      expect(flushedBatches).toHaveLength(0);

      vi.advanceTimersByTime(60);
      expect(flushedBatches).toHaveLength(1);
    });

    it('should include message type in batch', () => {
      batcher.add({ peerId: createPeerId(), fields: { isMuted: true }, timestamp: Date.now() });
      vi.advanceTimersByTime(60);

      expect(flushedBatches[0].type).toBe('presence:update');
    });

    it('should include timestamp in batch', () => {
      batcher.add({ peerId: createPeerId(), fields: { isMuted: true }, timestamp: Date.now() });
      vi.advanceTimersByTime(60);

      expect(flushedBatches[0].timestamp).toBeGreaterThan(0);
    });
  });

  describe('flush control', () => {
    it('should allow manual flush', () => {
      batcher.add({ peerId: createPeerId(), fields: { isMuted: true }, timestamp: Date.now() });
      batcher.add({ peerId: createPeerId(), fields: { isMuted: false }, timestamp: Date.now() });

      batcher.flush();
      expect(flushedBatches).toHaveLength(1);
      expect(flushedBatches[0].messages).toHaveLength(2);
    });

    it('should not flush empty queue', () => {
      batcher.flush();
      expect(flushedBatches).toHaveLength(0);
    });

    it('should respect minimum flush interval', () => {
      // First flush
      batcher.add({ peerId: createPeerId(), fields: { isMuted: true }, timestamp: Date.now() });
      batcher.flush();
      expect(flushedBatches).toHaveLength(1);

      // Try to flush immediately - should be delayed
      batcher.add({ peerId: createPeerId(), fields: { isMuted: false }, timestamp: Date.now() });
      batcher.flush();
      expect(flushedBatches).toHaveLength(1); // Still 1

      // Advance past min interval
      vi.advanceTimersByTime(60);
      expect(flushedBatches).toHaveLength(2);
    });
  });

  describe('statistics', () => {
    it('should track total messages', () => {
      batcher.add({ peerId: createPeerId(), fields: {}, timestamp: Date.now() });
      batcher.add({ peerId: createPeerId(), fields: {}, timestamp: Date.now() });

      const stats = batcher.getStats();
      expect(stats.totalMessages).toBe(2);
    });

    it('should track batch count', () => {
      // Trigger first batch (5 messages)
      for (let i = 0; i < 5; i++) {
        batcher.add({ peerId: createPeerId(), fields: {}, timestamp: Date.now() });
      }
      // Advance time past minFlushInterval
      vi.advanceTimersByTime(20);
      // Trigger second batch (5 messages)
      for (let i = 0; i < 5; i++) {
        batcher.add({ peerId: createPeerId(), fields: {}, timestamp: Date.now() });
      }

      const stats = batcher.getStats();
      expect(stats.totalBatches).toBe(2);
    });

    it('should calculate average batch size', () => {
      // First batch of 5
      for (let i = 0; i < 5; i++) {
        batcher.add({ peerId: createPeerId(), fields: {}, timestamp: Date.now() });
      }
      // Advance time past minFlushInterval
      vi.advanceTimersByTime(20);
      // Second batch of 3
      batcher.add({ peerId: createPeerId(), fields: {}, timestamp: Date.now() });
      batcher.add({ peerId: createPeerId(), fields: {}, timestamp: Date.now() });
      batcher.add({ peerId: createPeerId(), fields: {}, timestamp: Date.now() });
      // Advance time to trigger flush
      vi.advanceTimersByTime(60);

      const stats = batcher.getStats();
      expect(stats.avgBatchSize).toBe(4); // (5 + 3) / 2
    });

    it('should track max batch size', () => {
      for (let i = 0; i < 5; i++) {
        batcher.add({ peerId: createPeerId(), fields: {}, timestamp: Date.now() });
      }

      const stats = batcher.getStats();
      expect(stats.maxBatchSize).toBe(5);
    });

    it('should calculate messages saved', () => {
      // 10 messages in 2 batches = 8 messages saved
      for (let i = 0; i < 5; i++) {
        batcher.add({ peerId: createPeerId(), fields: {}, timestamp: Date.now() });
      }
      // Advance time past minFlushInterval
      vi.advanceTimersByTime(20);
      for (let i = 0; i < 5; i++) {
        batcher.add({ peerId: createPeerId(), fields: {}, timestamp: Date.now() });
      }

      const stats = batcher.getStats();
      expect(stats.messagesSaved).toBe(8);
    });

    it('should reset statistics', () => {
      batcher.add({ peerId: createPeerId(), fields: {}, timestamp: Date.now() });
      batcher.flush();
      batcher.resetStats();

      const stats = batcher.getStats();
      expect(stats.totalMessages).toBe(0);
      expect(stats.totalBatches).toBe(0);
    });
  });

  describe('cleanup', () => {
    it('should clear queue', () => {
      batcher.add({ peerId: createPeerId(), fields: {}, timestamp: Date.now() });
      batcher.add({ peerId: createPeerId(), fields: {}, timestamp: Date.now() });

      batcher.clear();
      expect(batcher.getQueueSize()).toBe(0);
    });

    it('should cancel pending flush on clear', () => {
      batcher.add({ peerId: createPeerId(), fields: {}, timestamp: Date.now() });
      batcher.clear();

      vi.advanceTimersByTime(100);
      expect(flushedBatches).toHaveLength(0);
    });
  });
});

describe('PresenceDeltaTracker', () => {
  let tracker: PresenceDeltaTracker;

  beforeEach(() => {
    tracker = new PresenceDeltaTracker({
      maxHistorySize: 10,
      enableCoalescing: false, // Disable for simpler testing
    });
  });

  describe('initialization', () => {
    it('should create tracker with default options', () => {
      const defaultTracker = new PresenceDeltaTracker();
      expect(defaultTracker.getCurrentVersion()).toBe(0);
    });

    it('should start with version 0', () => {
      expect(tracker.getCurrentVersion()).toBe(0);
    });
  });

  describe('state updates', () => {
    it('should create new state for unknown peer', () => {
      const peerId = createPeerId();
      const delta = tracker.update(peerId, { isMuted: true });

      expect(delta).not.toBeNull();
      expect(delta?.peerId).toBe(peerId);
      expect(delta?.changes.isMuted).toBe(true);
    });

    it('should increment version on update', () => {
      const peerId = createPeerId();
      tracker.update(peerId, { isMuted: true });

      expect(tracker.getCurrentVersion()).toBe(1);
    });

    it('should return null if no changes', () => {
      const peerId = createPeerId();
      tracker.update(peerId, { isMuted: true });
      const delta = tracker.update(peerId, { isMuted: true });

      expect(delta).toBeNull();
    });

    it('should detect changes in existing state', () => {
      const peerId = createPeerId();
      tracker.update(peerId, { isMuted: true });
      const delta = tracker.update(peerId, { isMuted: false });

      expect(delta).not.toBeNull();
      expect(delta?.changes.isMuted).toBe(false);
    });

    it('should only include changed fields in delta', () => {
      const peerId = createPeerId();
      tracker.update(peerId, { isMuted: true, isSpeaking: false });
      const delta = tracker.update(peerId, { isMuted: true, isSpeaking: true });

      expect(delta).not.toBeNull();
      expect(delta?.changes.isSpeaking).toBe(true);
      expect(delta?.changes.isMuted).toBeUndefined();
    });
  });

  describe('state retrieval', () => {
    it('should get state for peer', () => {
      const peerId = createPeerId();
      tracker.update(peerId, { isMuted: true, audioLevel: 0.5 });

      const state = tracker.getState(peerId);
      expect(state).not.toBeUndefined();
      expect(state?.isMuted).toBe(true);
      expect(state?.audioLevel).toBe(0.5);
    });

    it('should return undefined for unknown peer', () => {
      const state = tracker.getState(createPeerId());
      expect(state).toBeUndefined();
    });

    it('should get all states', () => {
      tracker.update(createPeerId(), { isMuted: true });
      tracker.update(createPeerId(), { isMuted: false });
      tracker.update(createPeerId(), { isSpeaking: true });

      const states = tracker.getAllStates();
      expect(states).toHaveLength(3);
    });
  });

  describe('delta history', () => {
    it('should get deltas since version', () => {
      const peerId = createPeerId();
      tracker.update(peerId, { isMuted: true }); // v1
      tracker.update(peerId, { isMuted: false }); // v2
      tracker.update(peerId, { isSpeaking: true }); // v3

      const deltas = tracker.getDeltasSince(1);
      expect(deltas).toHaveLength(2);
    });

    it('should limit history size', () => {
      const peerId = createPeerId();
      for (let i = 0; i < 20; i++) {
        tracker.update(peerId, { audioLevel: i / 20 });
      }

      const deltas = tracker.getDeltasSince(0);
      expect(deltas.length).toBeLessThanOrEqual(10);
    });
  });

  describe('peer removal', () => {
    it('should remove peer state', () => {
      const peerId = createPeerId();
      tracker.update(peerId, { isMuted: true });

      const removed = tracker.remove(peerId);
      expect(removed).toBe(true);
      expect(tracker.getState(peerId)).toBeUndefined();
    });

    it('should return false for unknown peer', () => {
      const removed = tracker.remove(createPeerId());
      expect(removed).toBe(false);
    });
  });

  describe('coalescing', () => {
    it('should coalesce rapid updates when enabled', () => {
      const coalescingTracker = new PresenceDeltaTracker({
        enableCoalescing: true,
        coalescingWindow: 100,
      });

      const peerId = createPeerId();
      coalescingTracker.update(peerId, { isMuted: true }); // Creates state
      coalescingTracker.update(peerId, { isSpeaking: true }); // First delta, sets pending
      const delta = coalescingTracker.update(peerId, { audioLevel: 0.5 }); // Should coalesce

      expect(delta).toBeNull(); // Coalesced

      const stats = coalescingTracker.getStats();
      expect(stats.coalescedUpdates).toBe(1);
    });
  });

  describe('statistics', () => {
    it('should track total updates', () => {
      tracker.update(createPeerId(), { isMuted: true });
      tracker.update(createPeerId(), { isMuted: true });

      const stats = tracker.getStats();
      expect(stats.totalUpdates).toBe(2);
    });

    it('should track full vs delta updates', () => {
      const peerId = createPeerId();
      tracker.update(peerId, { isMuted: true }); // Full (new peer)
      tracker.update(peerId, { isMuted: false }); // Delta
      tracker.update(peerId, { isSpeaking: true }); // Delta

      const stats = tracker.getStats();
      expect(stats.fullUpdates).toBe(1);
      expect(stats.deltaUpdates).toBe(2);
    });

    it('should calculate delta ratio', () => {
      const peerId = createPeerId();
      tracker.update(peerId, { isMuted: true }); // Full
      tracker.update(peerId, { isMuted: false }); // Delta

      const stats = tracker.getStats();
      expect(stats.deltaRatio).toBe(0.5);
    });

    it('should reset statistics', () => {
      tracker.update(createPeerId(), { isMuted: true });
      tracker.resetStats();

      const stats = tracker.getStats();
      expect(stats.totalUpdates).toBe(0);
    });
  });

  describe('cleanup', () => {
    it('should clear all state', () => {
      tracker.update(createPeerId(), { isMuted: true });
      tracker.update(createPeerId(), { isMuted: false });

      tracker.clear();

      expect(tracker.getAllStates()).toHaveLength(0);
      expect(tracker.getCurrentVersion()).toBe(0);
    });
  });
});

describe('RoomStateSyncManager', () => {
  let syncManager: RoomStateSyncManager;

  const createSnapshot = (version: number, participants: number = 2): RoomStateSnapshot => ({
    roomId: 'room-1',
    version,
    participants: Array.from({ length: participants }, (_, i) => ({
      peerId: createPeerId(),
      displayName: `User ${i}`,
      presence: { isMuted: false, isSpeaking: false },
    })),
    aiState: { isActive: false },
    timestamp: Date.now(),
  });

  beforeEach(() => {
    syncManager = new RoomStateSyncManager({
      syncInterval: 1000,
      incrementalSync: true,
    });
  });

  describe('initialization', () => {
    it('should create manager with default options', () => {
      const defaultManager = new RoomStateSyncManager();
      expect(defaultManager.getState()).toBeNull();
    });

    it('should start with null state', () => {
      expect(syncManager.getState()).toBeNull();
    });
  });

  describe('state management', () => {
    it('should set and get state', () => {
      const snapshot = createSnapshot(1);
      syncManager.setState(snapshot);

      expect(syncManager.getState()).toEqual(snapshot);
    });

    it('should keep history of previous states', () => {
      syncManager.setState(createSnapshot(1));
      syncManager.setState(createSnapshot(2));
      syncManager.setState(createSnapshot(3));

      // Should be able to generate diff from version 1
      const payload = syncManager.generateSyncPayload(1);
      expect(payload).not.toBeNull();
      expect('fromVersion' in (payload as object)).toBe(true);
    });
  });

  describe('sync payload generation', () => {
    it('should return null when no state', () => {
      const payload = syncManager.generateSyncPayload();
      expect(payload).toBeNull();
    });

    it('should return full state when no client version', () => {
      const snapshot = createSnapshot(1);
      syncManager.setState(snapshot);

      const payload = syncManager.generateSyncPayload();
      expect(payload).toEqual(snapshot);
    });

    it('should return null when client is up to date', () => {
      syncManager.setState(createSnapshot(5));

      const payload = syncManager.generateSyncPayload(5);
      expect(payload).toBeNull();
    });

    it('should generate incremental diff when possible', () => {
      syncManager.setState(createSnapshot(1, 2));
      syncManager.setState(createSnapshot(2, 3)); // Added one participant

      const payload = syncManager.generateSyncPayload(1);
      expect(payload).not.toBeNull();
      expect('fromVersion' in (payload as object)).toBe(true);

      const diff = payload as RoomStateDiff;
      expect(diff.fromVersion).toBe(1);
      expect(diff.toVersion).toBe(2);
    });

    it('should fall back to full state when diff not possible', () => {
      syncManager.setState(createSnapshot(10)); // Jump to version 10

      // Client is at version 1, but we don't have that in history
      const payload = syncManager.generateSyncPayload(1);
      expect(payload).not.toBeNull();
      expect('version' in (payload as object)).toBe(true); // Full snapshot
    });
  });

  describe('diff application', () => {
    it('should apply diff to current state', () => {
      const peerId1 = createPeerId();
      const peerId2 = createPeerId();

      const initialState: RoomStateSnapshot = {
        roomId: 'room-1',
        version: 1,
        participants: [
          { peerId: peerId1, displayName: 'User 1', presence: { isMuted: false } },
          { peerId: peerId2, displayName: 'User 2', presence: { isMuted: false } },
        ],
        timestamp: Date.now(),
      };

      syncManager.setState(initialState);

      const diff: RoomStateDiff = {
        roomId: 'room-1',
        fromVersion: 1,
        toVersion: 2,
        added: [],
        removed: [peerId2],
        updated: [{ peerId: peerId1, changes: { isMuted: true } }],
        timestamp: Date.now(),
      };

      const result = syncManager.applyDiff(diff);

      expect(result).not.toBeNull();
      expect(result?.version).toBe(2);
      expect(result?.participants).toHaveLength(1);
      expect(result?.participants[0].presence.isMuted).toBe(true);
    });

    it('should return null for version mismatch', () => {
      syncManager.setState(createSnapshot(5));

      const diff: RoomStateDiff = {
        roomId: 'room-1',
        fromVersion: 3, // Wrong version
        toVersion: 4,
        added: [],
        removed: [],
        updated: [],
        timestamp: Date.now(),
      };

      const result = syncManager.applyDiff(diff);
      expect(result).toBeNull();
    });

    it('should return null for wrong room', () => {
      syncManager.setState(createSnapshot(1));

      const diff: RoomStateDiff = {
        roomId: 'room-2', // Wrong room
        fromVersion: 1,
        toVersion: 2,
        added: [],
        removed: [],
        updated: [],
        timestamp: Date.now(),
      };

      const result = syncManager.applyDiff(diff);
      expect(result).toBeNull();
    });
  });

  describe('sync timing', () => {
    it('should indicate when sync is needed', () => {
      vi.useFakeTimers();

      expect(syncManager.shouldSync()).toBe(true);

      syncManager.markSynced();
      expect(syncManager.shouldSync()).toBe(false);

      vi.advanceTimersByTime(1100);
      expect(syncManager.shouldSync()).toBe(true);

      vi.useRealTimers();
    });
  });

  describe('statistics', () => {
    it('should track sync counts', () => {
      syncManager.setState(createSnapshot(1));

      syncManager.generateSyncPayload(); // Full
      syncManager.generateSyncPayload(); // Full (no client version)

      const stats = syncManager.getStats();
      expect(stats.totalSyncs).toBe(2);
      expect(stats.fullSyncs).toBe(2);
    });

    it('should track incremental syncs', () => {
      syncManager.setState(createSnapshot(1));
      syncManager.setState(createSnapshot(2));

      syncManager.generateSyncPayload(1); // Incremental

      const stats = syncManager.getStats();
      expect(stats.incrementalSyncs).toBe(1);
    });

    it('should calculate incremental ratio', () => {
      syncManager.setState(createSnapshot(1));
      syncManager.setState(createSnapshot(2));

      syncManager.generateSyncPayload(); // Full
      syncManager.generateSyncPayload(1); // Incremental

      const stats = syncManager.getStats();
      expect(stats.incrementalRatio).toBe(0.5);
    });

    it('should reset statistics', () => {
      syncManager.setState(createSnapshot(1));
      syncManager.generateSyncPayload();
      syncManager.resetStats();

      const stats = syncManager.getStats();
      expect(stats.totalSyncs).toBe(0);
    });
  });

  describe('cleanup', () => {
    it('should clear all state', () => {
      syncManager.setState(createSnapshot(1));
      syncManager.clear();

      expect(syncManager.getState()).toBeNull();
    });
  });
});

describe('SignalingPerformanceMonitor', () => {
  let monitor: SignalingPerformanceMonitor;

  beforeEach(() => {
    monitor = new SignalingPerformanceMonitor();
  });

  describe('message tracking', () => {
    it('should record messages', () => {
      monitor.recordMessage(100);
      monitor.recordMessage(200);

      const metrics = monitor.getMetrics();
      expect(metrics.avgMessageSize).toBe(150);
    });

    it('should calculate messages per second', async () => {
      vi.useFakeTimers();

      monitor.recordMessage(100);
      monitor.recordMessage(100);

      vi.advanceTimersByTime(1000);

      const metrics = monitor.getMetrics();
      expect(metrics.messagesPerSecond).toBeCloseTo(2, 0);

      vi.useRealTimers();
    });
  });

  describe('component integration', () => {
    it('should aggregate batcher stats', () => {
      const batcher = new MessageBatcher('test', () => {}, { maxBatchSize: 5 });

      // Add messages to trigger batch
      for (let i = 0; i < 5; i++) {
        batcher.add({ id: i });
      }

      monitor.setComponents(batcher as MessageBatcher<unknown>);

      const metrics = monitor.getMetrics();
      expect(metrics.batchEfficiency).toBeGreaterThan(0);

      batcher.dispose();
    });

    it('should aggregate delta tracker stats', () => {
      const deltaTracker = new PresenceDeltaTracker();
      const peerId = createPeerId();

      deltaTracker.update(peerId, { isMuted: true }); // Full
      deltaTracker.update(peerId, { isMuted: false }); // Delta

      monitor.setComponents(undefined, deltaTracker);

      const metrics = monitor.getMetrics();
      expect(metrics.deltaEfficiency).toBe(0.5);
    });

    it('should aggregate sync manager stats', () => {
      const syncManager = new RoomStateSyncManager();
      syncManager.setState({
        roomId: 'room-1',
        version: 1,
        participants: [],
        timestamp: Date.now(),
      });
      syncManager.generateSyncPayload();

      monitor.setComponents(undefined, undefined, syncManager);

      const metrics = monitor.getMetrics();
      expect(metrics.syncEfficiency).toBe(0); // All full syncs
    });
  });

  describe('reset', () => {
    it('should reset all stats', () => {
      monitor.recordMessage(100);
      monitor.reset();

      const metrics = monitor.getMetrics();
      expect(metrics.avgMessageSize).toBe(0);
    });
  });
});

describe('Utility functions', () => {
  describe('compressMessage', () => {
    it('should compress message to JSON string', () => {
      const message = { type: 'test', data: { value: 123 } };
      const compressed = compressMessage(message);

      expect(typeof compressed).toBe('string');
      expect(compressed).toContain('test');
    });
  });

  describe('decompressMessage', () => {
    it('should decompress JSON string to object', () => {
      const original = { type: 'test', data: { value: 123 } };
      const compressed = compressMessage(original);
      const decompressed = decompressMessage<typeof original>(compressed);

      expect(decompressed).toEqual(original);
    });
  });

  describe('getMessageSize', () => {
    it('should calculate message size in bytes', () => {
      const message = { type: 'test' };
      const size = getMessageSize(message);

      expect(size).toBeGreaterThan(0);
      // JSON.stringify gives '{"type":"test"}' which is 15 bytes
      expect(size).toBe(15);
    });

    it('should handle unicode characters', () => {
      const message = { name: '日本語' };
      const size = getMessageSize(message);

      // Unicode characters take more bytes
      expect(size).toBeGreaterThan(JSON.stringify(message).length);
    });
  });
});

describe('createOptimizedSignalingSetup', () => {
  it('should create complete setup', () => {
    const setup = createOptimizedSignalingSetup();

    expect(setup.batcher).toBeInstanceOf(MessageBatcher);
    expect(setup.deltaTracker).toBeInstanceOf(PresenceDeltaTracker);
    expect(setup.syncManager).toBeInstanceOf(RoomStateSyncManager);
    expect(setup.monitor).toBeInstanceOf(SignalingPerformanceMonitor);
  });

  it('should connect monitor to components', () => {
    const setup = createOptimizedSignalingSetup();

    // Add some activity
    setup.batcher.add({ peerId: createPeerId(), fields: {}, timestamp: Date.now() });
    setup.deltaTracker.update(createPeerId(), { isMuted: true });

    const metrics = setup.monitor.getMetrics();
    expect(metrics).toBeDefined();

    setup.batcher.dispose();
  });
});

describe('Integration scenarios', () => {
  it('should handle presence update flow', () => {
    vi.useFakeTimers();

    const setup = createOptimizedSignalingSetup();
    const peerId = createPeerId();

    // Simulate multiple rapid presence updates
    setup.deltaTracker.update(peerId, { isMuted: false });
    setup.deltaTracker.update(peerId, { isSpeaking: true });
    setup.deltaTracker.update(peerId, { audioLevel: 0.3 });
    setup.deltaTracker.update(peerId, { audioLevel: 0.5 });
    setup.deltaTracker.update(peerId, { audioLevel: 0.7 });

    // Batch the updates
    const states = setup.deltaTracker.getAllStates();
    for (const state of states) {
      setup.batcher.add({
        peerId: state.peerId,
        fields: {
          isMuted: state.isMuted,
          isSpeaking: state.isSpeaking,
          audioLevel: state.audioLevel,
        },
        timestamp: Date.now(),
      });
    }

    // Check efficiency
    const deltaStats = setup.deltaTracker.getStats();
    expect(deltaStats.deltaUpdates).toBeGreaterThan(0);

    setup.batcher.dispose();
    vi.useRealTimers();
  });

  it('should handle room state sync flow', () => {
    const syncManager = new RoomStateSyncManager({ incrementalSync: true });

    // Initial state
    const peerId1 = createPeerId();
    const peerId2 = createPeerId();

    syncManager.setState({
      roomId: 'room-1',
      version: 1,
      participants: [
        { peerId: peerId1, displayName: 'User 1', presence: { isMuted: false } },
      ],
      timestamp: Date.now(),
    });

    // Client syncs
    const initialPayload = syncManager.generateSyncPayload();
    expect(initialPayload).not.toBeNull();

    // State changes
    syncManager.setState({
      roomId: 'room-1',
      version: 2,
      participants: [
        { peerId: peerId1, displayName: 'User 1', presence: { isMuted: true } },
        { peerId: peerId2, displayName: 'User 2', presence: { isMuted: false } },
      ],
      timestamp: Date.now(),
    });

    // Client syncs with version
    const incrementalPayload = syncManager.generateSyncPayload(1);
    expect(incrementalPayload).not.toBeNull();
    expect('added' in (incrementalPayload as object)).toBe(true);

    const diff = incrementalPayload as RoomStateDiff;
    expect(diff.added).toHaveLength(1);
    expect(diff.updated).toHaveLength(1);

    // Check stats
    const stats = syncManager.getStats();
    expect(stats.incrementalSyncs).toBe(1);
    expect(stats.fullSyncs).toBe(1);
  });

  it('should optimize high-frequency audio level updates', () => {
    vi.useFakeTimers();

    let batchCount = 0;
    const batcher = new MessageBatcher<{ level: number }>(
      'audio:level',
      () => { batchCount++; },
      { maxBatchSize: 20, maxWaitTime: 16, minFlushInterval: 0 } // No min interval
    );

    // Simulate 60 audio level updates
    for (let i = 0; i < 60; i++) {
      batcher.add({ level: Math.sin(i / 10) });
    }

    const stats = batcher.getStats();
    expect(stats.totalMessages).toBe(60);
    // 3 batches of 20 each
    expect(stats.totalBatches).toBe(3);
    // Messages saved = total - batches = 60 - 3 = 57
    expect(stats.messagesSaved).toBe(57);

    batcher.dispose();
    vi.useRealTimers();
  });
});
