/**
 * Audio Synchronization Tests
 *
 * Tests for audio playback timing synchronization across peers.
 *
 * Part of the Long-Horizon Engineering Protocol - FEAT-206
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  AudioSync,
  createAudioSync,
  type SyncAccuracy,
  type PeerSyncInfo,
} from '@/lib/audio/sync';

describe('AudioSync', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-01T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Initialization', () => {
    it('creates sync instance with default options', () => {
      const sync = new AudioSync();

      expect(sync.getPeerCount()).toBe(0);
      expect(sync.getSyncThreshold()).toBe(50);
      expect(sync.getTargetBuffer()).toBe(100);
      expect(sync.isAdaptiveBufferEnabled()).toBe(true);
    });

    it('creates sync instance with custom options', () => {
      const sync = new AudioSync({
        syncThresholdMs: 100,
        targetBufferMs: 200,
        adaptiveBuffer: false,
      });

      expect(sync.getSyncThreshold()).toBe(100);
      expect(sync.getTargetBuffer()).toBe(200);
      expect(sync.isAdaptiveBufferEnabled()).toBe(false);
    });

    it('creates sync instance with factory function', () => {
      const sync = createAudioSync({ syncThresholdMs: 75 });

      expect(sync.getSyncThreshold()).toBe(75);
    });
  });

  describe('Peer Management', () => {
    it('adds peer to tracking', () => {
      const sync = new AudioSync();

      sync.addPeer('peer-1');

      expect(sync.hasPeer('peer-1')).toBe(true);
      expect(sync.getPeerCount()).toBe(1);
    });

    it('does not duplicate peers', () => {
      const sync = new AudioSync();

      sync.addPeer('peer-1');
      sync.addPeer('peer-1');

      expect(sync.getPeerCount()).toBe(1);
    });

    it('adds multiple peers', () => {
      const sync = new AudioSync();

      sync.addPeer('peer-1');
      sync.addPeer('peer-2');
      sync.addPeer('peer-3');

      expect(sync.getPeerCount()).toBe(3);
      expect(sync.getPeerIds()).toEqual(['peer-1', 'peer-2', 'peer-3']);
    });

    it('removes peer from tracking', () => {
      const sync = new AudioSync();
      sync.addPeer('peer-1');

      const removed = sync.removePeer('peer-1');

      expect(removed).toBe(true);
      expect(sync.hasPeer('peer-1')).toBe(false);
      expect(sync.getPeerCount()).toBe(0);
    });

    it('returns false when removing non-existent peer', () => {
      const sync = new AudioSync();

      const removed = sync.removePeer('non-existent');

      expect(removed).toBe(false);
    });

    it('clears all peers', () => {
      const sync = new AudioSync();
      sync.addPeer('peer-1');
      sync.addPeer('peer-2');

      sync.clearPeers();

      expect(sync.getPeerCount()).toBe(0);
    });
  });

  describe('Peer Timing', () => {
    it('reports peer timing and updates offset', () => {
      const sync = new AudioSync();
      sync.addPeer('peer-1');

      const now = Date.now();
      sync.reportPeerTiming('peer-1', { timestamp: now });

      const info = sync.getPeerSyncInfo('peer-1');
      expect(info).not.toBeNull();
      expect(info?.status).toBe('synced');
    });

    it('detects peer ahead of sync', () => {
      const sync = new AudioSync({ syncThresholdMs: 50 });
      sync.addPeer('peer-1');

      const referenceTime = sync.getReferenceTime();
      sync.reportPeerTiming('peer-1', { timestamp: referenceTime + 100 });

      const info = sync.getPeerSyncInfo('peer-1');
      expect(info?.status).toBe('ahead');
      expect(info?.offsetMs).toBe(100);
    });

    it('detects peer behind sync', () => {
      const sync = new AudioSync({ syncThresholdMs: 50 });
      sync.addPeer('peer-1');

      const referenceTime = sync.getReferenceTime();
      sync.reportPeerTiming('peer-1', { timestamp: referenceTime - 100 });

      const info = sync.getPeerSyncInfo('peer-1');
      expect(info?.status).toBe('behind');
      expect(info?.offsetMs).toBe(-100);
    });

    it('ignores timing for non-existent peer', () => {
      const sync = new AudioSync();

      // Should not throw
      sync.reportPeerTiming('non-existent', { timestamp: Date.now() });

      expect(sync.getPeerSyncInfo('non-existent')).toBeNull();
    });

    it('updates buffer level when provided', () => {
      const sync = new AudioSync({ targetBufferMs: 100 });
      sync.addPeer('peer-1');

      sync.reportPeerTiming('peer-1', { timestamp: Date.now(), bufferLevel: 0.5 });

      const info = sync.getPeerSyncInfo('peer-1');
      expect(info?.bufferLevel).toBe(0.5);
    });
  });

  describe('Sync Status Callbacks', () => {
    it('calls onSyncStatusChange when status changes', () => {
      const onSyncStatusChange = vi.fn();
      const sync = new AudioSync({ syncThresholdMs: 50 }, { onSyncStatusChange });
      sync.addPeer('peer-1');

      const referenceTime = sync.getReferenceTime();
      sync.reportPeerTiming('peer-1', { timestamp: referenceTime + 100 });

      expect(onSyncStatusChange).toHaveBeenCalledWith('peer-1', 'ahead', 100);
    });

    it('calls onResyncNeeded when offset exceeds threshold', () => {
      const onResyncNeeded = vi.fn();
      const sync = new AudioSync(
        { syncThresholdMs: 50, autoResync: true },
        { onResyncNeeded }
      );
      sync.addPeer('peer-1');

      const referenceTime = sync.getReferenceTime();
      // Offset > threshold * 2 triggers resync
      sync.reportPeerTiming('peer-1', { timestamp: referenceTime + 200 });

      expect(onResyncNeeded).toHaveBeenCalledWith(
        'peer-1',
        expect.stringContaining('exceeds threshold')
      );
    });

    it('does not call onResyncNeeded when autoResync is disabled', () => {
      const onResyncNeeded = vi.fn();
      const sync = new AudioSync(
        { syncThresholdMs: 50, autoResync: false },
        { onResyncNeeded }
      );
      sync.addPeer('peer-1');

      const referenceTime = sync.getReferenceTime();
      sync.reportPeerTiming('peer-1', { timestamp: referenceTime + 200 });

      expect(onResyncNeeded).not.toHaveBeenCalled();
    });
  });

  describe('Jitter Buffer', () => {
    it('calculates jitter from packet delays', () => {
      const sync = new AudioSync();
      sync.addPeer('peer-1');

      // Report multiple timing samples with varying delays
      const baseTime = Date.now();
      for (let i = 0; i < 10; i++) {
        vi.setSystemTime(baseTime + i * 100);
        sync.reportPeerTiming('peer-1', {
          timestamp: baseTime + i * 100 - (i % 2 === 0 ? 10 : 30),
        });
      }

      const info = sync.getPeerSyncInfo('peer-1');
      expect(info?.jitterMs).toBeGreaterThan(0);
    });

    it('adapts buffer size for high jitter', () => {
      const sync = new AudioSync({
        targetBufferMs: 100,
        jitterThresholdMs: 30,
        adaptiveBuffer: true,
      });
      sync.addPeer('peer-1');

      // Simulate high jitter packets
      const baseTime = Date.now();
      for (let i = 0; i < 20; i++) {
        vi.setSystemTime(baseTime + i * 50);
        const jitter = i % 2 === 0 ? 0 : 50; // High variance
        sync.reportPeerTiming('peer-1', {
          timestamp: baseTime + i * 50 - jitter,
        });
      }

      // Buffer should have increased
      const info = sync.getPeerSyncInfo('peer-1');
      expect(info?.jitterMs).toBeGreaterThan(0);
    });

    it('respects buffer limits', () => {
      const sync = new AudioSync({
        targetBufferMs: 100,
        minBufferMs: 20,
        maxBufferMs: 200,
      });
      sync.addPeer('peer-1');

      // Target buffer should be within limits
      expect(sync.getTargetBuffer()).toBe(100);
    });
  });

  describe('Synchronized Playback', () => {
    it('calculates synchronized start time', () => {
      const sync = new AudioSync({ targetBufferMs: 100 });
      sync.addPeer('peer-1');
      sync.addPeer('peer-2');

      const startTime = sync.calculateSyncedStartTime();
      const now = Date.now();

      expect(startTime).toBeGreaterThan(now);
      expect(startTime).toBeLessThanOrEqual(now + 200); // target + some jitter
    });

    it('includes delay in start time calculation', () => {
      const sync = new AudioSync({ targetBufferMs: 100 });
      sync.addPeer('peer-1');

      const startTimeNoDelay = sync.calculateSyncedStartTime(0);
      const startTimeWithDelay = sync.calculateSyncedStartTime(500);

      expect(startTimeWithDelay - startTimeNoDelay).toBe(500);
    });

    it('starts peer playback', () => {
      const sync = new AudioSync();
      sync.addPeer('peer-1');

      const startTime = Date.now() + 100;
      sync.startPeerPlayback('peer-1', startTime);

      expect(sync.isPeerPlaying('peer-1')).toBe(true);
    });

    it('stops peer playback', () => {
      const sync = new AudioSync();
      sync.addPeer('peer-1');
      sync.startPeerPlayback('peer-1', Date.now());

      sync.stopPeerPlayback('peer-1');

      expect(sync.isPeerPlaying('peer-1')).toBe(false);
    });

    it('returns false for non-existent peer playing status', () => {
      const sync = new AudioSync();

      expect(sync.isPeerPlaying('non-existent')).toBe(false);
    });
  });

  describe('Buffer Events', () => {
    it('reports buffer underrun', () => {
      const onBufferUnderrun = vi.fn();
      const onResyncNeeded = vi.fn();
      const sync = new AudioSync(
        { targetBufferMs: 100 },
        { onBufferUnderrun, onResyncNeeded }
      );
      sync.addPeer('peer-1');

      sync.reportBufferUnderrun('peer-1');

      expect(onBufferUnderrun).toHaveBeenCalledWith('peer-1');
      expect(onResyncNeeded).toHaveBeenCalledWith('peer-1', 'Buffer underrun');
    });

    it('increases buffer target on underrun', () => {
      const sync = new AudioSync({ targetBufferMs: 100, maxBufferMs: 500 });
      sync.addPeer('peer-1');

      // Initial buffer level
      sync.reportPeerTiming('peer-1', { timestamp: Date.now(), bufferLevel: 0.5 });

      sync.reportBufferUnderrun('peer-1');

      const info = sync.getPeerSyncInfo('peer-1');
      expect(info?.bufferLevel).toBe(0); // Buffer emptied
    });

    it('reports buffer overrun', () => {
      const onBufferOverrun = vi.fn();
      const sync = new AudioSync({}, { onBufferOverrun });
      sync.addPeer('peer-1');

      sync.reportBufferOverrun('peer-1');

      expect(onBufferOverrun).toHaveBeenCalledWith('peer-1');
    });
  });

  describe('Sync Accuracy Measurement', () => {
    it('measures sync accuracy', () => {
      const sync = new AudioSync({ syncThresholdMs: 50 });
      sync.addPeer('peer-1');
      sync.addPeer('peer-2');

      const referenceTime = sync.getReferenceTime();
      sync.reportPeerTiming('peer-1', { timestamp: referenceTime + 20 });
      sync.reportPeerTiming('peer-2', { timestamp: referenceTime - 10 });

      const accuracy = sync.measureSyncAccuracy();

      expect(accuracy.peerCount).toBe(2);
      expect(accuracy.averageOffsetMs).toBe(5); // (20 + -10) / 2
      expect(accuracy.maxOffsetMs).toBe(20);
      expect(accuracy.syncedPercentage).toBe(1); // Both within threshold
    });

    it('calculates synced percentage correctly', () => {
      const sync = new AudioSync({ syncThresholdMs: 50 });
      sync.addPeer('peer-1');
      sync.addPeer('peer-2');

      const referenceTime = sync.getReferenceTime();
      sync.reportPeerTiming('peer-1', { timestamp: referenceTime + 20 }); // synced
      sync.reportPeerTiming('peer-2', { timestamp: referenceTime + 100 }); // not synced

      const accuracy = sync.measureSyncAccuracy();

      expect(accuracy.syncedPercentage).toBe(0.5);
    });

    it('returns default accuracy for no peers', () => {
      const sync = new AudioSync();

      const accuracy = sync.measureSyncAccuracy();

      expect(accuracy.peerCount).toBe(0);
      expect(accuracy.syncedPercentage).toBe(1);
      expect(accuracy.averageOffsetMs).toBe(0);
    });

    it('calls onSyncAccuracy callback', () => {
      const onSyncAccuracy = vi.fn();
      const sync = new AudioSync({}, { onSyncAccuracy });
      sync.addPeer('peer-1');

      sync.measureSyncAccuracy();

      expect(onSyncAccuracy).toHaveBeenCalled();
    });
  });

  describe('Periodic Measurement', () => {
    it('starts periodic measurement', () => {
      const onSyncAccuracy = vi.fn();
      const sync = new AudioSync({ measureIntervalMs: 1000 }, { onSyncAccuracy });
      sync.addPeer('peer-1');

      sync.startMeasuring();
      expect(sync.isMeasuring()).toBe(true);

      vi.advanceTimersByTime(1000);
      expect(onSyncAccuracy).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(1000);
      expect(onSyncAccuracy).toHaveBeenCalledTimes(2);

      sync.stopMeasuring();
    });

    it('stops periodic measurement', () => {
      const onSyncAccuracy = vi.fn();
      const sync = new AudioSync({ measureIntervalMs: 1000 }, { onSyncAccuracy });
      sync.addPeer('peer-1');

      sync.startMeasuring();
      sync.stopMeasuring();

      expect(sync.isMeasuring()).toBe(false);

      vi.advanceTimersByTime(2000);
      expect(onSyncAccuracy).not.toHaveBeenCalled();
    });

    it('does not start measuring twice', () => {
      const onSyncAccuracy = vi.fn();
      const sync = new AudioSync({ measureIntervalMs: 1000 }, { onSyncAccuracy });
      sync.addPeer('peer-1');

      sync.startMeasuring();
      sync.startMeasuring(); // Should be a no-op

      vi.advanceTimersByTime(1000);
      expect(onSyncAccuracy).toHaveBeenCalledTimes(1);

      sync.stopMeasuring();
    });
  });

  describe('Resync', () => {
    it('requests resync for a peer', () => {
      const onResyncNeeded = vi.fn();
      const sync = new AudioSync({}, { onResyncNeeded });
      sync.addPeer('peer-1');

      sync.reportPeerTiming('peer-1', { timestamp: Date.now() + 100 });
      onResyncNeeded.mockClear();

      sync.requestResync('peer-1');

      expect(onResyncNeeded).toHaveBeenCalledWith('peer-1', 'Manual resync requested');

      const info = sync.getPeerSyncInfo('peer-1');
      expect(info?.status).toBe('unknown');
      expect(info?.offsetMs).toBe(0);
    });

    it('requests resync for all peers', () => {
      const onResyncNeeded = vi.fn();
      const sync = new AudioSync({}, { onResyncNeeded });
      sync.addPeer('peer-1');
      sync.addPeer('peer-2');

      sync.requestResyncAll();

      expect(onResyncNeeded).toHaveBeenCalledTimes(2);
    });

    it('ignores resync for non-existent peer', () => {
      const onResyncNeeded = vi.fn();
      const sync = new AudioSync({}, { onResyncNeeded });

      sync.requestResync('non-existent');

      expect(onResyncNeeded).not.toHaveBeenCalled();
    });
  });

  describe('Configuration', () => {
    it('sets sync threshold', () => {
      const sync = new AudioSync({ syncThresholdMs: 50 });

      sync.setSyncThreshold(100);

      expect(sync.getSyncThreshold()).toBe(100);
    });

    it('clamps sync threshold to minimum 0', () => {
      const sync = new AudioSync();

      sync.setSyncThreshold(-50);

      expect(sync.getSyncThreshold()).toBe(0);
    });

    it('sets target buffer', () => {
      const sync = new AudioSync({
        targetBufferMs: 100,
        minBufferMs: 20,
        maxBufferMs: 500,
      });

      sync.setTargetBuffer(200);

      expect(sync.getTargetBuffer()).toBe(200);
    });

    it('clamps target buffer to limits', () => {
      const sync = new AudioSync({
        minBufferMs: 20,
        maxBufferMs: 200,
      });

      sync.setTargetBuffer(10);
      expect(sync.getTargetBuffer()).toBe(20);

      sync.setTargetBuffer(500);
      expect(sync.getTargetBuffer()).toBe(200);
    });

    it('enables/disables adaptive buffer', () => {
      const sync = new AudioSync({ adaptiveBuffer: true });

      sync.setAdaptiveBuffer(false);
      expect(sync.isAdaptiveBufferEnabled()).toBe(false);

      sync.setAdaptiveBuffer(true);
      expect(sync.isAdaptiveBufferEnabled()).toBe(true);
    });
  });

  describe('Server Time Sync', () => {
    it('sets server time offset', () => {
      const sync = new AudioSync({ referenceSource: 'server' });

      sync.setServerTimeOffset(100);

      expect(sync.getServerTimeOffset()).toBe(100);
    });

    it('uses server time offset in calculations', () => {
      const sync = new AudioSync({ referenceSource: 'server' });
      sync.setServerTimeOffset(1000);
      sync.addPeer('peer-1');

      // Reference time should include server offset
      const startTime = sync.calculateSyncedStartTime();
      expect(startTime).toBeGreaterThan(Date.now() + 900);
    });
  });

  describe('Reference Time', () => {
    it('gets reference time', () => {
      const now = Date.now();
      const sync = new AudioSync();

      expect(sync.getReferenceTime()).toBe(now);
    });

    it('sets reference time', () => {
      const sync = new AudioSync();

      sync.setReferenceTime(12345);

      expect(sync.getReferenceTime()).toBe(12345);
    });

    it('resets reference time to now', () => {
      const sync = new AudioSync();
      sync.setReferenceTime(12345);

      vi.advanceTimersByTime(1000);
      sync.resetReferenceTime();

      expect(sync.getReferenceTime()).toBe(Date.now());
    });
  });

  describe('Peer Sync Info', () => {
    it('returns null for non-existent peer', () => {
      const sync = new AudioSync();

      expect(sync.getPeerSyncInfo('non-existent')).toBeNull();
    });

    it('returns sync info with all fields', () => {
      const sync = new AudioSync();
      sync.addPeer('peer-1');
      sync.reportPeerTiming('peer-1', { timestamp: Date.now(), bufferLevel: 0.75 });

      const info = sync.getPeerSyncInfo('peer-1');

      expect(info).toMatchObject({
        peerId: 'peer-1',
        status: 'synced',
        bufferLevel: 0.75,
        isPlaying: false,
      });
      expect(info?.lastSyncTime).toBeDefined();
      expect(info?.jitterMs).toBeDefined();
    });

    it('gets all peer sync info', () => {
      const sync = new AudioSync();
      sync.addPeer('peer-1');
      sync.addPeer('peer-2');

      const allInfo = sync.getAllPeerSyncInfo();

      expect(allInfo).toHaveLength(2);
      expect(allInfo.map((i) => i.peerId)).toEqual(['peer-1', 'peer-2']);
    });
  });

  describe('Dispose', () => {
    it('disposes and cleans up', () => {
      const onSyncAccuracy = vi.fn();
      const sync = new AudioSync({ measureIntervalMs: 1000 }, { onSyncAccuracy });
      sync.addPeer('peer-1');
      sync.startMeasuring();

      sync.dispose();

      expect(sync.getPeerCount()).toBe(0);
      expect(sync.isMeasuring()).toBe(false);

      vi.advanceTimersByTime(2000);
      expect(onSyncAccuracy).not.toHaveBeenCalled();
    });
  });
});
