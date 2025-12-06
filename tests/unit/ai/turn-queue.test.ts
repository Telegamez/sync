/**
 * Turn Queue Processor Tests
 *
 * Tests for server-side FIFO queue processing.
 *
 * Part of the Long-Horizon Engineering Protocol - FEAT-157
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  TurnQueueProcessor,
  createTurnQueueProcessor,
  type QueueEntry,
  type QueuePositionChange,
  type TurnCompletedEvent,
  type TurnQueueProcessorCallbacks,
} from '@/server/signaling/turn-queue-processor';
import type { PeerId } from '@/types/peer';
import type { RoomId } from '@/types/room';

describe('TurnQueueProcessor', () => {
  let processor: TurnQueueProcessor;
  const roomId = 'room-123' as RoomId;

  beforeEach(() => {
    vi.useFakeTimers();
    processor = new TurnQueueProcessor({
      defaultTimeoutMs: 5000,
      priorityTimeoutMs: 10000,
      maxQueueSize: 5,
      autoAdvanceQueue: false,
      minTurnIntervalMs: 100,
    });
  });

  afterEach(() => {
    processor.dispose();
    vi.useRealTimers();
  });

  describe('initialization', () => {
    it('should create processor with default options', () => {
      const defaultProcessor = new TurnQueueProcessor();
      expect(defaultProcessor).toBeInstanceOf(TurnQueueProcessor);
      defaultProcessor.dispose();
    });

    it('should create via factory function', () => {
      const factoryProcessor = createTurnQueueProcessor();
      expect(factoryProcessor).toBeInstanceOf(TurnQueueProcessor);
      factoryProcessor.dispose();
    });

    it('should initialize room', () => {
      processor.initRoom(roomId);
      expect(processor.hasRoom(roomId)).toBe(true);
    });

    it('should not re-initialize existing room', () => {
      processor.initRoom(roomId);
      processor.enqueue(roomId, 'peer-1' as PeerId, 'Alice');
      processor.initRoom(roomId); // Should not clear queue
      expect(processor.getQueueLength(roomId)).toBe(1);
    });

    it('should remove room', () => {
      processor.initRoom(roomId);
      processor.removeRoom(roomId);
      expect(processor.hasRoom(roomId)).toBe(false);
    });
  });

  describe('enqueue', () => {
    beforeEach(() => {
      processor.initRoom(roomId);
    });

    it('should enqueue a request', () => {
      const entry = processor.enqueue(roomId, 'peer-1' as PeerId, 'Alice');
      expect(entry).not.toBeNull();
      expect(entry?.peerId).toBe('peer-1');
      expect(entry?.peerDisplayName).toBe('Alice');
    });

    it('should set position correctly', () => {
      processor.enqueue(roomId, 'peer-1' as PeerId, 'Alice');
      processor.enqueue(roomId, 'peer-2' as PeerId, 'Bob');

      const state = processor.getQueueState(roomId);
      expect(state?.queue[0].position).toBe(1);
      expect(state?.queue[1].position).toBe(2);
    });

    it('should return existing entry if already in queue', () => {
      const entry1 = processor.enqueue(roomId, 'peer-1' as PeerId, 'Alice');
      const entry2 = processor.enqueue(roomId, 'peer-1' as PeerId, 'Alice');
      expect(entry1?.id).toBe(entry2?.id);
    });

    it('should reject when queue is full', () => {
      for (let i = 0; i < 5; i++) {
        processor.enqueue(roomId, `peer-${i}` as PeerId, `User ${i}`);
      }
      const entry = processor.enqueue(roomId, 'peer-99' as PeerId, 'Overflow');
      expect(entry).toBeNull();
    });

    it('should return null for non-existent room', () => {
      const entry = processor.enqueue('unknown' as RoomId, 'peer-1' as PeerId, 'Alice');
      expect(entry).toBeNull();
    });

    it('should set longer timeout for priority users', () => {
      const regular = processor.enqueue(roomId, 'peer-1' as PeerId, 'Alice', 'member');
      const owner = processor.enqueue(roomId, 'peer-2' as PeerId, 'Bob', 'owner');

      expect(owner?.isPriority).toBe(true);
      expect(regular?.isPriority).toBe(false);

      // Owner should have longer expiry
      const regularExpiry = regular!.expiresAt.getTime() - regular!.createdAt.getTime();
      const ownerExpiry = owner!.expiresAt.getTime() - owner!.createdAt.getTime();
      expect(ownerExpiry).toBeGreaterThan(regularExpiry);
    });
  });

  describe('priority ordering', () => {
    beforeEach(() => {
      processor.initRoom(roomId);
    });

    it('should order by priority (higher first)', () => {
      processor.enqueue(roomId, 'peer-1' as PeerId, 'Alice', 'member', 0);
      processor.enqueue(roomId, 'peer-2' as PeerId, 'Bob', 'owner', 0); // Priority boost
      processor.enqueue(roomId, 'peer-3' as PeerId, 'Carol', 'member', 0);

      const state = processor.getQueueState(roomId);
      expect(state?.queue[0].peerId).toBe('peer-2'); // Owner first
    });

    it('should maintain FIFO within same priority', () => {
      processor.enqueue(roomId, 'peer-1' as PeerId, 'Alice', 'member');
      processor.enqueue(roomId, 'peer-2' as PeerId, 'Bob', 'member');
      processor.enqueue(roomId, 'peer-3' as PeerId, 'Carol', 'member');

      const state = processor.getQueueState(roomId);
      expect(state?.queue[0].peerId).toBe('peer-1');
      expect(state?.queue[1].peerId).toBe('peer-2');
      expect(state?.queue[2].peerId).toBe('peer-3');
    });

    it('should allow bumping to front', () => {
      const first = processor.enqueue(roomId, 'peer-1' as PeerId, 'Alice');
      processor.enqueue(roomId, 'peer-2' as PeerId, 'Bob');
      const third = processor.enqueue(roomId, 'peer-3' as PeerId, 'Carol');

      processor.bumpToFront(roomId, third!.id);

      const state = processor.getQueueState(roomId);
      expect(state?.queue[0].peerId).toBe('peer-3');
    });
  });

  describe('dequeue', () => {
    beforeEach(() => {
      processor.initRoom(roomId);
    });

    it('should dequeue first entry', () => {
      processor.enqueue(roomId, 'peer-1' as PeerId, 'Alice');
      processor.enqueue(roomId, 'peer-2' as PeerId, 'Bob');

      const entry = processor.dequeue(roomId);
      expect(entry?.peerId).toBe('peer-1');
      expect(processor.getQueueLength(roomId)).toBe(1);
    });

    it('should return null for empty queue', () => {
      expect(processor.dequeue(roomId)).toBeNull();
    });

    it('should update positions after dequeue', () => {
      processor.enqueue(roomId, 'peer-1' as PeerId, 'Alice');
      processor.enqueue(roomId, 'peer-2' as PeerId, 'Bob');
      processor.enqueue(roomId, 'peer-3' as PeerId, 'Carol');

      processor.dequeue(roomId);

      const state = processor.getQueueState(roomId);
      expect(state?.queue[0].position).toBe(1);
      expect(state?.queue[1].position).toBe(2);
    });
  });

  describe('cancel', () => {
    beforeEach(() => {
      processor.initRoom(roomId);
    });

    it('should cancel queued request', () => {
      const entry = processor.enqueue(roomId, 'peer-1' as PeerId, 'Alice');
      expect(processor.cancel(roomId, entry!.id)).toBe(true);
      expect(processor.getQueueLength(roomId)).toBe(0);
    });

    it('should return false for non-existent request', () => {
      expect(processor.cancel(roomId, 'unknown')).toBe(false);
    });

    it('should cancel active turn', () => {
      processor.enqueue(roomId, 'peer-1' as PeerId, 'Alice');
      processor.processNext(roomId);

      const activeTurn = processor.getActiveTurn(roomId);
      expect(processor.cancel(roomId, activeTurn!.id)).toBe(true);
      expect(processor.getActiveTurn(roomId)).toBeNull();
    });

    it('should cancel all for peer', () => {
      processor.enqueue(roomId, 'peer-1' as PeerId, 'Alice');
      processor.enqueue(roomId, 'peer-1' as PeerId, 'Alice'); // Duplicate ignored
      processor.enqueue(roomId, 'peer-2' as PeerId, 'Bob');

      const cancelled = processor.cancelAllForPeer(roomId, 'peer-1' as PeerId);
      expect(cancelled).toBe(1);
      expect(processor.getQueueLength(roomId)).toBe(1);
    });
  });

  describe('processNext', () => {
    beforeEach(() => {
      processor.initRoom(roomId);
    });

    it('should process next entry and grant turn', () => {
      processor.enqueue(roomId, 'peer-1' as PeerId, 'Alice');

      const result = processor.processNext(roomId);

      expect(result.success).toBe(true);
      expect(result.entry?.peerId).toBe('peer-1');
      expect(processor.hasActiveTurn(roomId, 'peer-1' as PeerId)).toBe(true);
    });

    it('should return error for empty queue', () => {
      const result = processor.processNext(roomId);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Queue is empty');
    });

    it('should return error if active turn exists', () => {
      processor.enqueue(roomId, 'peer-1' as PeerId, 'Alice');
      processor.enqueue(roomId, 'peer-2' as PeerId, 'Bob');
      processor.processNext(roomId);

      const result = processor.processNext(roomId);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Active turn in progress');
    });

    it('should skip expired entries', () => {
      processor.enqueue(roomId, 'peer-1' as PeerId, 'Alice');

      // Advance past expiry
      vi.advanceTimersByTime(6000);

      processor.enqueue(roomId, 'peer-2' as PeerId, 'Bob');

      const result = processor.processNext(roomId);
      expect(result.entry?.peerId).toBe('peer-2');
    });

    it('should respect minimum turn interval', () => {
      processor.enqueue(roomId, 'peer-1' as PeerId, 'Alice');
      processor.processNext(roomId);
      processor.endTurn(roomId);

      processor.enqueue(roomId, 'peer-2' as PeerId, 'Bob');

      // Immediate process should fail due to interval
      const result = processor.processNext(roomId);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Waiting for minimum interval');
    });
  });

  describe('onResponseDone', () => {
    beforeEach(() => {
      processor = new TurnQueueProcessor({
        defaultTimeoutMs: 5000,
        autoAdvanceQueue: true,
        minTurnIntervalMs: 0,
      });
      processor.initRoom(roomId);
    });

    it('should end turn and process next', () => {
      processor.enqueue(roomId, 'peer-1' as PeerId, 'Alice');
      processor.enqueue(roomId, 'peer-2' as PeerId, 'Bob');
      processor.processNext(roomId);

      const result = processor.onResponseDone(roomId);

      expect(result.success).toBe(true);
      expect(processor.hasActiveTurn(roomId, 'peer-2' as PeerId)).toBe(true);
    });

    it('should handle empty queue after response', () => {
      processor.enqueue(roomId, 'peer-1' as PeerId, 'Alice');
      processor.processNext(roomId);

      const result = processor.onResponseDone(roomId);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Queue is empty');
    });
  });

  describe('endTurn', () => {
    beforeEach(() => {
      processor.initRoom(roomId);
    });

    it('should end active turn', () => {
      processor.enqueue(roomId, 'peer-1' as PeerId, 'Alice');
      processor.processNext(roomId);

      const event = processor.endTurn(roomId);

      expect(event).not.toBeNull();
      expect(event?.peerId).toBe('peer-1');
      expect(processor.getActiveTurn(roomId)).toBeNull();
    });

    it('should track duration', () => {
      processor.enqueue(roomId, 'peer-1' as PeerId, 'Alice');
      processor.processNext(roomId);

      vi.advanceTimersByTime(5000);

      const event = processor.endTurn(roomId);
      expect(event?.duration).toBeGreaterThanOrEqual(5000);
    });

    it('should track interrupted status', () => {
      processor.enqueue(roomId, 'peer-1' as PeerId, 'Alice');
      processor.processNext(roomId);

      const event = processor.endTurn(roomId, true);
      expect(event?.wasInterrupted).toBe(true);
    });

    it('should return null if no active turn', () => {
      expect(processor.endTurn(roomId)).toBeNull();
    });
  });

  describe('timeout handling', () => {
    beforeEach(() => {
      processor.initRoom(roomId);
    });

    it('should expire requests after timeout', () => {
      const onExpired = vi.fn();
      processor = new TurnQueueProcessor(
        { defaultTimeoutMs: 5000, autoAdvanceQueue: false },
        { onRequestExpired: onExpired }
      );
      processor.initRoom(roomId);

      processor.enqueue(roomId, 'peer-1' as PeerId, 'Alice');
      expect(processor.getQueueLength(roomId)).toBe(1);

      vi.advanceTimersByTime(6000);

      expect(processor.getQueueLength(roomId)).toBe(0);
      expect(onExpired).toHaveBeenCalledOnce();
    });

    it('should clear timeout on cancel', () => {
      const entry = processor.enqueue(roomId, 'peer-1' as PeerId, 'Alice');
      processor.cancel(roomId, entry!.id);

      vi.advanceTimersByTime(6000);

      expect(processor.getQueueLength(roomId)).toBe(0);
    });
  });

  describe('callbacks', () => {
    it('should call onPositionChange', () => {
      const onPositionChange = vi.fn();
      processor = new TurnQueueProcessor(
        { autoAdvanceQueue: false },
        { onPositionChange }
      );
      processor.initRoom(roomId);

      processor.enqueue(roomId, 'peer-1' as PeerId, 'Alice');
      processor.enqueue(roomId, 'peer-2' as PeerId, 'Bob');

      // Positions assigned on enqueue
      expect(onPositionChange).toHaveBeenCalled();
    });

    it('should call onTurnGranted', () => {
      const onTurnGranted = vi.fn();
      processor = new TurnQueueProcessor(
        { autoAdvanceQueue: false },
        { onTurnGranted }
      );
      processor.initRoom(roomId);

      processor.enqueue(roomId, 'peer-1' as PeerId, 'Alice');
      processor.processNext(roomId);

      expect(onTurnGranted).toHaveBeenCalledOnce();
      expect(onTurnGranted.mock.calls[0][1].peerId).toBe('peer-1');
    });

    it('should call onTurnCompleted', () => {
      const onTurnCompleted = vi.fn();
      processor = new TurnQueueProcessor(
        { autoAdvanceQueue: false },
        { onTurnCompleted }
      );
      processor.initRoom(roomId);

      processor.enqueue(roomId, 'peer-1' as PeerId, 'Alice');
      processor.processNext(roomId);
      processor.endTurn(roomId);

      expect(onTurnCompleted).toHaveBeenCalledOnce();
      expect(onTurnCompleted.mock.calls[0][0].peerId).toBe('peer-1');
    });

    it('should call onQueueUpdate', () => {
      const onQueueUpdate = vi.fn();
      processor = new TurnQueueProcessor(
        { autoAdvanceQueue: false },
        { onQueueUpdate }
      );
      processor.initRoom(roomId);

      processor.enqueue(roomId, 'peer-1' as PeerId, 'Alice');

      expect(onQueueUpdate).toHaveBeenCalled();
    });

    it('should call onProcessingStart and onProcessingComplete', () => {
      const onProcessingStart = vi.fn();
      const onProcessingComplete = vi.fn();
      processor = new TurnQueueProcessor(
        { autoAdvanceQueue: false },
        { onProcessingStart, onProcessingComplete }
      );
      processor.initRoom(roomId);

      processor.enqueue(roomId, 'peer-1' as PeerId, 'Alice');
      processor.processNext(roomId);

      expect(onProcessingStart).toHaveBeenCalledOnce();
      expect(onProcessingComplete).toHaveBeenCalledOnce();
    });
  });

  describe('getPosition', () => {
    beforeEach(() => {
      processor.initRoom(roomId);
    });

    it('should return 0 for active turn', () => {
      processor.enqueue(roomId, 'peer-1' as PeerId, 'Alice');
      processor.processNext(roomId);

      expect(processor.getPosition(roomId, 'peer-1' as PeerId)).toBe(0);
    });

    it('should return position in queue', () => {
      processor.enqueue(roomId, 'peer-1' as PeerId, 'Alice');
      processor.enqueue(roomId, 'peer-2' as PeerId, 'Bob');
      processor.enqueue(roomId, 'peer-3' as PeerId, 'Carol');

      expect(processor.getPosition(roomId, 'peer-1' as PeerId)).toBe(1);
      expect(processor.getPosition(roomId, 'peer-2' as PeerId)).toBe(2);
      expect(processor.getPosition(roomId, 'peer-3' as PeerId)).toBe(3);
    });

    it('should return -1 for peer not in queue', () => {
      expect(processor.getPosition(roomId, 'unknown' as PeerId)).toBe(-1);
    });
  });

  describe('statistics', () => {
    beforeEach(() => {
      processor.initRoom(roomId);
    });

    it('should track total processed', () => {
      processor.enqueue(roomId, 'peer-1' as PeerId, 'Alice');
      processor.processNext(roomId);
      processor.endTurn(roomId);

      const stats = processor.getStatistics(roomId);
      expect(stats?.totalProcessed).toBe(1);
    });

    it('should track total expired', () => {
      processor.enqueue(roomId, 'peer-1' as PeerId, 'Alice');
      vi.advanceTimersByTime(6000);

      const stats = processor.getStatistics(roomId);
      expect(stats?.totalExpired).toBe(1);
    });

    it('should return null for non-existent room', () => {
      expect(processor.getStatistics('unknown' as RoomId)).toBeNull();
    });
  });

  describe('clearQueue', () => {
    beforeEach(() => {
      processor.initRoom(roomId);
    });

    it('should clear all entries', () => {
      processor.enqueue(roomId, 'peer-1' as PeerId, 'Alice');
      processor.enqueue(roomId, 'peer-2' as PeerId, 'Bob');
      processor.enqueue(roomId, 'peer-3' as PeerId, 'Carol');

      const cleared = processor.clearQueue(roomId);

      expect(cleared).toBe(3);
      expect(processor.getQueueLength(roomId)).toBe(0);
    });

    it('should not affect active turn', () => {
      processor.enqueue(roomId, 'peer-1' as PeerId, 'Alice');
      processor.enqueue(roomId, 'peer-2' as PeerId, 'Bob');
      processor.processNext(roomId);

      processor.clearQueue(roomId);

      expect(processor.hasActiveTurn(roomId, 'peer-1' as PeerId)).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('should handle multiple rooms independently', () => {
      const room1 = 'room-1' as RoomId;
      const room2 = 'room-2' as RoomId;

      processor.initRoom(room1);
      processor.initRoom(room2);

      processor.enqueue(room1, 'peer-1' as PeerId, 'Alice');
      processor.enqueue(room2, 'peer-2' as PeerId, 'Bob');

      expect(processor.getQueueLength(room1)).toBe(1);
      expect(processor.getQueueLength(room2)).toBe(1);

      processor.processNext(room1);

      expect(processor.hasActiveTurn(room1, 'peer-1' as PeerId)).toBe(true);
      expect(processor.hasActiveTurn(room2, 'peer-2' as PeerId)).toBe(false);
    });

    it('should handle rapid enqueue/dequeue', () => {
      processor.initRoom(roomId);

      for (let i = 0; i < 100; i++) {
        processor.enqueue(roomId, `peer-${i}` as PeerId, `User ${i}`);
        if (i > 0 && i % 10 === 0) {
          processor.dequeue(roomId);
        }
      }

      // Should not crash and maintain valid state
      const state = processor.getQueueState(roomId);
      expect(state).not.toBeNull();
    });

    it('should handle dispose during active processing', () => {
      processor.initRoom(roomId);
      processor.enqueue(roomId, 'peer-1' as PeerId, 'Alice');
      processor.processNext(roomId);

      expect(() => processor.dispose()).not.toThrow();
    });
  });

  describe('getRoomCount', () => {
    it('should return correct room count', () => {
      expect(processor.getRoomCount()).toBe(0);

      processor.initRoom('room-1' as RoomId);
      processor.initRoom('room-2' as RoomId);

      expect(processor.getRoomCount()).toBe(2);

      processor.removeRoom('room-1' as RoomId);

      expect(processor.getRoomCount()).toBe(1);
    });
  });

  describe('getQueueState', () => {
    beforeEach(() => {
      processor.initRoom(roomId);
    });

    it('should return complete queue state', () => {
      processor.enqueue(roomId, 'peer-1' as PeerId, 'Alice');
      processor.enqueue(roomId, 'peer-2' as PeerId, 'Bob');
      processor.processNext(roomId);

      const state = processor.getQueueState(roomId);

      expect(state).not.toBeNull();
      expect(state?.queue.length).toBe(1);
      expect(state?.activeTurn?.peerId).toBe('peer-1');
      expect(state?.queue[0].peerId).toBe('peer-2');
    });

    it('should return null for non-existent room', () => {
      expect(processor.getQueueState('unknown' as RoomId)).toBeNull();
    });
  });
});
