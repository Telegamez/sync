/**
 * AI Response Locking Manager Tests
 *
 * Tests for AI state management, turn queue, and locking mechanism.
 *
 * Part of the Long-Horizon Engineering Protocol - FEAT-152
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  AILockingManager,
  createAILockingManager,
} from '@/server/signaling/ai-locking';
import type { AIStateEvent, RoomAIState } from '@/types/voice-mode';

describe('AILockingManager', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Initialization', () => {
    it('creates manager with default options', () => {
      const manager = new AILockingManager();

      expect(manager.getRoomCount()).toBe(0);
    });

    it('creates manager with custom options', () => {
      const manager = new AILockingManager({
        defaultLockTimeoutMs: 60000,
        maxQueueSize: 5,
      });

      expect(manager.getRoomCount()).toBe(0);
    });

    it('creates manager with factory function', () => {
      const manager = createAILockingManager();

      expect(manager).toBeInstanceOf(AILockingManager);
    });
  });

  describe('Room Management', () => {
    it('initializes a room', () => {
      const manager = new AILockingManager();

      manager.initRoom('room-1');

      expect(manager.getRoomCount()).toBe(1);
      expect(manager.getAIState('room-1')).toBeDefined();
    });

    it('initializes room with custom voice settings', () => {
      const manager = new AILockingManager();

      manager.initRoom('room-1', {
        mode: 'pushToTalk',
        lockDuringResponse: false,
      });

      const settings = manager.getVoiceSettings('room-1');
      expect(settings?.mode).toBe('pushToTalk');
      expect(settings?.lockDuringResponse).toBe(false);
    });

    it('does not reinitialize existing room', () => {
      const manager = new AILockingManager();

      manager.initRoom('room-1', { mode: 'open' });
      manager.initRoom('room-1', { mode: 'pushToTalk' });

      const settings = manager.getVoiceSettings('room-1');
      expect(settings?.mode).toBe('open');
    });

    it('removes a room', () => {
      const manager = new AILockingManager();

      manager.initRoom('room-1');
      manager.removeRoom('room-1');

      expect(manager.getRoomCount()).toBe(0);
      expect(manager.getAIState('room-1')).toBeUndefined();
    });

    it('updates voice settings', () => {
      const manager = new AILockingManager();

      manager.initRoom('room-1', { mode: 'open' });
      manager.updateVoiceSettings('room-1', { mode: 'pushToTalk' });

      const settings = manager.getVoiceSettings('room-1');
      expect(settings?.mode).toBe('pushToTalk');
    });
  });

  describe('Initial AI State', () => {
    it('starts in idle state', () => {
      const manager = new AILockingManager();
      manager.initRoom('room-1');

      const state = manager.getAIState('room-1');
      expect(state?.state).toBe('idle');
      expect(state?.activeSpeakerId).toBeUndefined();
      expect(state?.isSessionHealthy).toBe(true);
    });

    it('has empty queue initially', () => {
      const manager = new AILockingManager();
      manager.initRoom('room-1');

      const state = manager.getAIState('room-1');
      expect(state?.queue.queue).toHaveLength(0);
      expect(state?.queue.activeTurn).toBeUndefined();
      expect(state?.queue.totalProcessed).toBe(0);
      expect(state?.queue.totalExpired).toBe(0);
    });
  });

  describe('Turn Requests', () => {
    it('creates turn request when AI is idle', () => {
      const manager = new AILockingManager();
      manager.initRoom('room-1');

      const request = manager.requestTurn('room-1', 'peer-1', 'Alice');

      expect(request).not.toBeNull();
      expect(request?.peerId).toBe('peer-1');
      expect(request?.peerDisplayName).toBe('Alice');
    });

    it('starts turn immediately when AI is idle', () => {
      const onTurnStart = vi.fn();
      const manager = new AILockingManager({}, { onTurnStart });
      manager.initRoom('room-1');

      manager.requestTurn('room-1', 'peer-1', 'Alice');

      expect(onTurnStart).toHaveBeenCalledWith(
        'room-1',
        expect.objectContaining({ peerId: 'peer-1' })
      );
    });

    it('queues turn request when AI is busy', () => {
      const manager = new AILockingManager();
      manager.initRoom('room-1');

      // First peer gets turn
      manager.requestTurn('room-1', 'peer-1', 'Alice');
      manager.startListening('room-1', 'peer-1');

      // Second peer gets queued
      const request = manager.requestTurn('room-1', 'peer-2', 'Bob');

      const state = manager.getAIState('room-1');
      expect(state?.queue.queue).toHaveLength(1);
      expect(request?.position).toBe(1);
    });

    it('rejects duplicate requests from same peer', () => {
      const manager = new AILockingManager();
      manager.initRoom('room-1');

      manager.requestTurn('room-1', 'peer-1', 'Alice');
      manager.startListening('room-1', 'peer-1');
      manager.requestTurn('room-1', 'peer-2', 'Bob');

      const duplicateRequest = manager.requestTurn('room-1', 'peer-2', 'Bob');

      expect(duplicateRequest?.peerId).toBe('peer-2'); // Returns existing
      const state = manager.getAIState('room-1');
      expect(state?.queue.queue).toHaveLength(1);
    });

    it('respects max queue size', () => {
      const manager = new AILockingManager({ maxQueueSize: 2 });
      manager.initRoom('room-1');

      manager.requestTurn('room-1', 'peer-1', 'Alice');
      manager.startListening('room-1', 'peer-1');
      manager.requestTurn('room-1', 'peer-2', 'Bob');
      manager.requestTurn('room-1', 'peer-3', 'Charlie');
      const overflow = manager.requestTurn('room-1', 'peer-4', 'David');

      expect(overflow).toBeNull();
    });

    it('cancels turn request', () => {
      const manager = new AILockingManager();
      manager.initRoom('room-1');

      manager.requestTurn('room-1', 'peer-1', 'Alice');
      manager.startListening('room-1', 'peer-1');
      const request = manager.requestTurn('room-1', 'peer-2', 'Bob');

      const result = manager.cancelRequest('room-1', request!.id);

      expect(result).toBe(true);
      const state = manager.getAIState('room-1');
      expect(state?.queue.queue).toHaveLength(0);
    });

    it('expires queued requests after timeout', () => {
      const onQueueUpdate = vi.fn();
      const manager = new AILockingManager(
        { defaultQueueTimeoutMs: 1000 },
        { onQueueUpdate }
      );
      manager.initRoom('room-1');

      manager.requestTurn('room-1', 'peer-1', 'Alice');
      manager.startListening('room-1', 'peer-1');
      manager.requestTurn('room-1', 'peer-2', 'Bob');

      vi.advanceTimersByTime(1000);

      const state = manager.getAIState('room-1');
      expect(state?.queue.queue).toHaveLength(0);
      expect(state?.queue.totalExpired).toBe(1);
    });

    it('sorts queue by priority', () => {
      const manager = new AILockingManager();
      manager.initRoom('room-1');

      manager.requestTurn('room-1', 'peer-1', 'Alice');
      manager.startListening('room-1', 'peer-1');
      manager.requestTurn('room-1', 'peer-2', 'Bob', 0);
      manager.requestTurn('room-1', 'peer-3', 'Charlie', 10);

      const state = manager.getAIState('room-1');
      expect(state?.queue.queue[0].peerId).toBe('peer-3'); // Higher priority
      expect(state?.queue.queue[1].peerId).toBe('peer-2');
    });
  });

  describe('AI State Transitions', () => {
    it('transitions from idle to listening', () => {
      const onStateChange = vi.fn();
      const manager = new AILockingManager({}, { onStateChange });
      manager.initRoom('room-1');

      manager.requestTurn('room-1', 'peer-1', 'Alice');
      const result = manager.startListening('room-1', 'peer-1');

      expect(result).toBe(true);
      const state = manager.getAIState('room-1');
      expect(state?.state).toBe('listening');
      expect(state?.activeSpeakerId).toBe('peer-1');
    });

    it('transitions from listening to processing', () => {
      const manager = new AILockingManager();
      manager.initRoom('room-1');

      manager.requestTurn('room-1', 'peer-1', 'Alice');
      manager.startListening('room-1', 'peer-1');
      const result = manager.startProcessing('room-1');

      expect(result).toBe(true);
      const state = manager.getAIState('room-1');
      expect(state?.state).toBe('processing');
    });

    it('transitions from listening to speaking', () => {
      const manager = new AILockingManager();
      manager.initRoom('room-1');

      manager.requestTurn('room-1', 'peer-1', 'Alice');
      manager.startListening('room-1', 'peer-1');
      const result = manager.startSpeaking('room-1');

      expect(result).toBe(true);
      const state = manager.getAIState('room-1');
      expect(state?.state).toBe('speaking');
    });

    it('transitions from processing to speaking', () => {
      const manager = new AILockingManager();
      manager.initRoom('room-1');

      manager.requestTurn('room-1', 'peer-1', 'Alice');
      manager.startListening('room-1', 'peer-1');
      manager.startProcessing('room-1');
      const result = manager.startSpeaking('room-1');

      expect(result).toBe(true);
      const state = manager.getAIState('room-1');
      expect(state?.state).toBe('speaking');
    });

    it('transitions from speaking to idle on finish', () => {
      const manager = new AILockingManager();
      manager.initRoom('room-1');

      manager.requestTurn('room-1', 'peer-1', 'Alice');
      manager.startListening('room-1', 'peer-1');
      manager.startSpeaking('room-1');
      const result = manager.finishSpeaking('room-1');

      expect(result).toBe(true);
      const state = manager.getAIState('room-1');
      expect(state?.state).toBe('idle');
      expect(state?.activeSpeakerId).toBeUndefined();
    });

    it('rejects invalid state transitions', () => {
      const manager = new AILockingManager();
      manager.initRoom('room-1');

      // Can't start processing from idle
      expect(manager.startProcessing('room-1')).toBe(false);

      // Can't start speaking from idle
      expect(manager.startSpeaking('room-1')).toBe(false);

      // Can't finish speaking from idle
      expect(manager.finishSpeaking('room-1')).toBe(false);
    });

    it('prevents listening from wrong peer', () => {
      const manager = new AILockingManager();
      manager.initRoom('room-1');

      manager.requestTurn('room-1', 'peer-1', 'Alice');
      manager.startListening('room-1', 'peer-1');

      // Another peer can't start listening
      expect(manager.startListening('room-1', 'peer-2')).toBe(false);
    });
  });

  describe('Locking', () => {
    it('locks AI manually', () => {
      const manager = new AILockingManager();
      manager.initRoom('room-1');

      const result = manager.lock('room-1', 'Manual lock');

      expect(result).toBe(true);
      const state = manager.getAIState('room-1');
      expect(state?.state).toBe('locked');
      expect(state?.lastError).toBe('Manual lock');
    });

    it('unlocks AI manually', () => {
      const manager = new AILockingManager();
      manager.initRoom('room-1');

      manager.lock('room-1');
      const result = manager.unlock('room-1');

      expect(result).toBe(true);
      const state = manager.getAIState('room-1');
      expect(state?.state).toBe('idle');
    });

    it('auto-unlocks after lock timeout', () => {
      const onError = vi.fn();
      const manager = new AILockingManager(
        { defaultLockTimeoutMs: 1000 },
        { onError }
      );
      manager.initRoom('room-1');

      manager.requestTurn('room-1', 'peer-1', 'Alice');
      manager.startListening('room-1', 'peer-1');
      manager.startSpeaking('room-1');

      vi.advanceTimersByTime(1000);

      const state = manager.getAIState('room-1');
      expect(state?.state).toBe('idle');
      expect(onError).toHaveBeenCalledWith('room-1', 'Lock timeout - safety release');
    });

    it('clears lock timeout on finish', () => {
      const onError = vi.fn();
      const manager = new AILockingManager(
        { defaultLockTimeoutMs: 1000 },
        { onError }
      );
      manager.initRoom('room-1');

      manager.requestTurn('room-1', 'peer-1', 'Alice');
      manager.startListening('room-1', 'peer-1');
      manager.startSpeaking('room-1');
      manager.finishSpeaking('room-1');

      vi.advanceTimersByTime(1000);

      expect(onError).not.toHaveBeenCalled();
    });
  });

  describe('Interrupt', () => {
    it('interrupts AI response', () => {
      const onStateChange = vi.fn();
      const manager = new AILockingManager({}, { onStateChange });
      manager.initRoom('room-1');

      manager.requestTurn('room-1', 'peer-1', 'Alice');
      manager.startListening('room-1', 'peer-1');
      manager.startSpeaking('room-1');

      const result = manager.interrupt('room-1', 'peer-2', 'Urgent');

      expect(result).toBe(true);
      const state = manager.getAIState('room-1');
      expect(state?.state).toBe('idle');
    });

    it('rejects interrupt when disabled', () => {
      const manager = new AILockingManager();
      manager.initRoom('room-1', { allowInterrupt: false });

      manager.requestTurn('room-1', 'peer-1', 'Alice');
      manager.startListening('room-1', 'peer-1');
      manager.startSpeaking('room-1');

      const result = manager.interrupt('room-1', 'peer-2', 'Urgent');

      expect(result).toBe(false);
    });

    it('rejects interrupt when not speaking', () => {
      const manager = new AILockingManager();
      manager.initRoom('room-1');

      const result = manager.interrupt('room-1', 'peer-1', 'Urgent');

      expect(result).toBe(false);
    });
  });

  describe('Queue Processing', () => {
    it('auto-processes next in queue after finish', () => {
      const onTurnStart = vi.fn();
      const manager = new AILockingManager(
        { autoProcessQueue: true },
        { onTurnStart }
      );
      manager.initRoom('room-1');

      manager.requestTurn('room-1', 'peer-1', 'Alice');
      manager.startListening('room-1', 'peer-1');
      manager.requestTurn('room-1', 'peer-2', 'Bob');
      manager.startSpeaking('room-1');

      onTurnStart.mockClear();
      manager.finishSpeaking('room-1');

      expect(onTurnStart).toHaveBeenCalledWith(
        'room-1',
        expect.objectContaining({ peerId: 'peer-2' })
      );
    });

    it('processes queue after unlock', () => {
      const onTurnStart = vi.fn();
      const manager = new AILockingManager(
        { autoProcessQueue: true },
        { onTurnStart }
      );
      manager.initRoom('room-1');

      manager.requestTurn('room-1', 'peer-1', 'Alice');
      manager.startListening('room-1', 'peer-1');
      manager.requestTurn('room-1', 'peer-2', 'Bob');
      manager.lock('room-1');

      onTurnStart.mockClear();
      manager.unlock('room-1');

      expect(onTurnStart).toHaveBeenCalledWith(
        'room-1',
        expect.objectContaining({ peerId: 'peer-2' })
      );
    });

    it('does not auto-process when disabled', () => {
      const onTurnStart = vi.fn();
      const manager = new AILockingManager(
        { autoProcessQueue: false },
        { onTurnStart }
      );
      manager.initRoom('room-1');

      manager.requestTurn('room-1', 'peer-1', 'Alice');
      manager.startListening('room-1', 'peer-1');
      manager.requestTurn('room-1', 'peer-2', 'Bob');
      manager.startSpeaking('room-1');

      onTurnStart.mockClear();
      manager.finishSpeaking('room-1');

      expect(onTurnStart).not.toHaveBeenCalled();
    });

    it('manually processes next in queue', () => {
      const onTurnStart = vi.fn();
      const manager = new AILockingManager(
        { autoProcessQueue: false },
        { onTurnStart }
      );
      manager.initRoom('room-1');

      manager.requestTurn('room-1', 'peer-1', 'Alice');
      manager.startListening('room-1', 'peer-1');
      manager.requestTurn('room-1', 'peer-2', 'Bob');
      manager.startSpeaking('room-1');
      manager.finishSpeaking('room-1');

      onTurnStart.mockClear();
      const result = manager.processNextInQueue('room-1');

      expect(result).toBe(true);
      expect(onTurnStart).toHaveBeenCalledWith(
        'room-1',
        expect.objectContaining({ peerId: 'peer-2' })
      );
    });
  });

  describe('Turn Eligibility', () => {
    it('allows turn request when idle', () => {
      const manager = new AILockingManager();
      manager.initRoom('room-1');

      const result = manager.canRequestTurn('room-1', 'peer-1');

      expect(result.allowed).toBe(true);
    });

    it('rejects non-designated speakers', () => {
      const manager = new AILockingManager();
      manager.initRoom('room-1', {
        mode: 'designatedSpeaker',
        designatedSpeakers: ['peer-1'],
      });

      const result = manager.canRequestTurn('room-1', 'peer-2');

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('Not a designated speaker');
    });

    it('allows designated speakers', () => {
      const manager = new AILockingManager();
      manager.initRoom('room-1', {
        mode: 'designatedSpeaker',
        designatedSpeakers: ['peer-1'],
      });

      const result = manager.canRequestTurn('room-1', 'peer-1');

      expect(result.allowed).toBe(true);
    });

    it('rejects peer already in queue', () => {
      const manager = new AILockingManager();
      manager.initRoom('room-1');

      manager.requestTurn('room-1', 'peer-1', 'Alice');
      manager.startListening('room-1', 'peer-1');
      manager.requestTurn('room-1', 'peer-2', 'Bob');

      const result = manager.canRequestTurn('room-1', 'peer-2');

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('Already in queue');
    });

    it('rejects peer with active turn', () => {
      const manager = new AILockingManager();
      manager.initRoom('room-1');

      manager.requestTurn('room-1', 'peer-1', 'Alice');

      const result = manager.canRequestTurn('room-1', 'peer-1');

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('Already has active turn');
    });

    it('rejects when queue is full', () => {
      const manager = new AILockingManager({ maxQueueSize: 1 });
      manager.initRoom('room-1');

      manager.requestTurn('room-1', 'peer-1', 'Alice');
      manager.startListening('room-1', 'peer-1');
      manager.requestTurn('room-1', 'peer-2', 'Bob');

      const result = manager.canRequestTurn('room-1', 'peer-3');

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('Queue is full');
    });
  });

  describe('Queue Position', () => {
    it('returns 0 for active turn', () => {
      const manager = new AILockingManager();
      manager.initRoom('room-1');

      manager.requestTurn('room-1', 'peer-1', 'Alice');

      const position = manager.getQueuePosition('room-1', 'peer-1');

      expect(position).toBe(0);
    });

    it('returns position in queue', () => {
      const manager = new AILockingManager();
      manager.initRoom('room-1');

      manager.requestTurn('room-1', 'peer-1', 'Alice');
      manager.startListening('room-1', 'peer-1');
      manager.requestTurn('room-1', 'peer-2', 'Bob');
      manager.requestTurn('room-1', 'peer-3', 'Charlie');

      expect(manager.getQueuePosition('room-1', 'peer-2')).toBe(1);
      expect(manager.getQueuePosition('room-1', 'peer-3')).toBe(2);
    });

    it('returns 0 for peer not in queue', () => {
      const manager = new AILockingManager();
      manager.initRoom('room-1');

      const position = manager.getQueuePosition('room-1', 'peer-1');

      expect(position).toBe(0);
    });
  });

  describe('Error Handling', () => {
    it('reports AI error', () => {
      const onError = vi.fn();
      const manager = new AILockingManager({}, { onError });
      manager.initRoom('room-1');

      manager.reportError('room-1', 'Connection failed');

      const state = manager.getAIState('room-1');
      expect(state?.isSessionHealthy).toBe(false);
      expect(state?.lastError).toBe('Connection failed');
      expect(onError).toHaveBeenCalledWith('room-1', 'Connection failed');
    });

    it('reports session reconnected', () => {
      const onStateChange = vi.fn();
      const manager = new AILockingManager({}, { onStateChange });
      manager.initRoom('room-1');

      manager.reportError('room-1', 'Connection failed');
      manager.reportSessionReconnected('room-1');

      const state = manager.getAIState('room-1');
      expect(state?.isSessionHealthy).toBe(true);
      expect(state?.lastError).toBeUndefined();
    });
  });

  describe('Callbacks', () => {
    it('calls onStateChange for state transitions', () => {
      const onStateChange = vi.fn();
      const manager = new AILockingManager({}, { onStateChange });
      manager.initRoom('room-1');

      manager.requestTurn('room-1', 'peer-1', 'Alice');
      manager.startListening('room-1', 'peer-1');

      expect(onStateChange).toHaveBeenCalledWith(
        'room-1',
        expect.objectContaining({
          type: 'ai:state_changed',
          roomId: 'room-1',
        })
      );
    });

    it('calls onQueueUpdate for queue changes', () => {
      const onQueueUpdate = vi.fn();
      const manager = new AILockingManager({}, { onQueueUpdate });
      manager.initRoom('room-1');

      manager.requestTurn('room-1', 'peer-1', 'Alice');
      manager.startListening('room-1', 'peer-1');
      manager.requestTurn('room-1', 'peer-2', 'Bob');

      expect(onQueueUpdate).toHaveBeenCalledWith(
        'room-1',
        expect.objectContaining({
          queue: expect.any(Array),
        })
      );
    });

    it('calls onTurnStart when turn begins', () => {
      const onTurnStart = vi.fn();
      const manager = new AILockingManager({}, { onTurnStart });
      manager.initRoom('room-1');

      manager.requestTurn('room-1', 'peer-1', 'Alice');

      expect(onTurnStart).toHaveBeenCalledWith(
        'room-1',
        expect.objectContaining({
          peerId: 'peer-1',
          peerDisplayName: 'Alice',
        })
      );
    });

    it('calls onTurnEnd when turn ends', () => {
      const onTurnEnd = vi.fn();
      const manager = new AILockingManager({}, { onTurnEnd });
      manager.initRoom('room-1');

      manager.requestTurn('room-1', 'peer-1', 'Alice');
      manager.startListening('room-1', 'peer-1');
      manager.startSpeaking('room-1');
      manager.finishSpeaking('room-1');

      expect(onTurnEnd).toHaveBeenCalledWith(
        'room-1',
        expect.objectContaining({
          peerId: 'peer-1',
        })
      );
    });
  });

  describe('Dispose', () => {
    it('cleans up all rooms', () => {
      const manager = new AILockingManager();
      manager.initRoom('room-1');
      manager.initRoom('room-2');

      manager.dispose();

      expect(manager.getRoomCount()).toBe(0);
    });

    it('clears all timers', () => {
      const manager = new AILockingManager({ defaultLockTimeoutMs: 1000 });
      manager.initRoom('room-1');
      manager.requestTurn('room-1', 'peer-1', 'Alice');
      manager.startListening('room-1', 'peer-1');
      manager.startSpeaking('room-1');

      manager.dispose();

      // Should not throw when timers fire
      vi.advanceTimersByTime(2000);
    });
  });
});
