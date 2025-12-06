/**
 * Interrupt Handler Tests
 *
 * Tests for interrupt handling and urgent override functionality.
 *
 * Part of the Long-Horizon Engineering Protocol - FEAT-158
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  InterruptHandler,
  createInterruptHandler,
  type InterruptRequest,
  type InterruptEvent,
  type InterruptHandlerCallbacks,
  type InterruptHandlerOptions,
} from '@/server/signaling/interrupt-handler';
import type { PeerId } from '@/types/peer';
import type { RoomId } from '@/types/room';
import type { AIResponseState } from '@/types/voice-mode';

describe('InterruptHandler', () => {
  let handler: InterruptHandler;
  const roomId = 'room-123' as RoomId;

  beforeEach(() => {
    vi.useFakeTimers();
    handler = new InterruptHandler({
      enabled: true,
      ownerOnly: false,
      moderatorsCanInterrupt: true,
      interruptCooldownMs: 2000,
      maxInterruptsPerMinute: 5,
      logAllEvents: true,
    });
  });

  afterEach(() => {
    handler.dispose();
    vi.useRealTimers();
  });

  describe('initialization', () => {
    it('should create with default options', () => {
      const defaultHandler = new InterruptHandler();
      expect(defaultHandler).toBeInstanceOf(InterruptHandler);
      defaultHandler.dispose();
    });

    it('should create via factory function', () => {
      const factoryHandler = createInterruptHandler();
      expect(factoryHandler).toBeInstanceOf(InterruptHandler);
      factoryHandler.dispose();
    });

    it('should initialize room', () => {
      handler.initRoom(roomId);
      expect(handler.hasRoom(roomId)).toBe(true);
    });

    it('should not re-initialize existing room', () => {
      handler.initRoom(roomId);
      handler.setEnabled(roomId, false);
      handler.initRoom(roomId);
      // Should still be disabled (not reset)
      const stats = handler.getStatistics(roomId);
      expect(stats?.enabled).toBe(false);
    });

    it('should remove room', () => {
      handler.initRoom(roomId);
      handler.removeRoom(roomId);
      expect(handler.hasRoom(roomId)).toBe(false);
    });

    it('should initialize with disabled state', () => {
      handler.initRoom(roomId, false);
      const stats = handler.getStatistics(roomId);
      expect(stats?.enabled).toBe(false);
    });
  });

  describe('canInterrupt', () => {
    beforeEach(() => {
      handler.initRoom(roomId);
    });

    it('should allow owner to interrupt', () => {
      const result = handler.canInterrupt(roomId, 'peer-1' as PeerId, 'owner');
      expect(result.allowed).toBe(true);
    });

    it('should allow moderator to interrupt', () => {
      const result = handler.canInterrupt(roomId, 'peer-1' as PeerId, 'moderator');
      expect(result.allowed).toBe(true);
    });

    it('should allow member to interrupt by default', () => {
      const result = handler.canInterrupt(roomId, 'peer-1' as PeerId, 'member');
      expect(result.allowed).toBe(true);
    });

    it('should reject when disabled', () => {
      handler.setEnabled(roomId, false);
      const result = handler.canInterrupt(roomId, 'peer-1' as PeerId, 'owner');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('disabled');
    });

    it('should reject for non-existent room', () => {
      const result = handler.canInterrupt('unknown' as RoomId, 'peer-1' as PeerId, 'owner');
      expect(result.allowed).toBe(false);
    });

    it('should enforce owner-only mode', () => {
      const restrictedHandler = new InterruptHandler({ ownerOnly: true });
      restrictedHandler.initRoom(roomId);

      expect(restrictedHandler.canInterrupt(roomId, 'peer-1' as PeerId, 'owner').allowed).toBe(true);
      expect(restrictedHandler.canInterrupt(roomId, 'peer-1' as PeerId, 'moderator').allowed).toBe(false);
      expect(restrictedHandler.canInterrupt(roomId, 'peer-1' as PeerId, 'member').allowed).toBe(false);

      restrictedHandler.dispose();
    });

    it('should enforce cooldown', async () => {
      // Process an interrupt first
      await handler.requestInterrupt(
        roomId,
        'peer-1' as PeerId,
        'Alice',
        'owner',
        'speaking'
      );
      const request = handler.getPendingInterrupt(roomId);
      await handler.processInterrupt(roomId, request!.id, 'speaking');

      // Should be on cooldown
      const result = handler.canInterrupt(roomId, 'peer-2' as PeerId, 'owner');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Cooldown');

      // Advance past cooldown
      vi.advanceTimersByTime(2500);

      const afterCooldown = handler.canInterrupt(roomId, 'peer-2' as PeerId, 'owner');
      expect(afterCooldown.allowed).toBe(true);
    });

    it('should enforce rate limit', async () => {
      // Process 5 interrupts
      for (let i = 0; i < 5; i++) {
        await handler.requestInterrupt(
          roomId,
          `peer-${i}` as PeerId,
          `User ${i}`,
          'owner',
          'speaking'
        );
        const request = handler.getPendingInterrupt(roomId);
        await handler.processInterrupt(roomId, request!.id, 'speaking');
        vi.advanceTimersByTime(2500); // Past cooldown
      }

      // Should be rate limited
      const result = handler.canInterrupt(roomId, 'peer-99' as PeerId, 'owner');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Rate limit');

      // Advance to next minute
      vi.advanceTimersByTime(60000);

      const afterMinute = handler.canInterrupt(roomId, 'peer-99' as PeerId, 'owner');
      expect(afterMinute.allowed).toBe(true);
    });
  });

  describe('requestInterrupt', () => {
    beforeEach(() => {
      handler.initRoom(roomId);
    });

    it('should create interrupt request', async () => {
      const request = await handler.requestInterrupt(
        roomId,
        'peer-1' as PeerId,
        'Alice',
        'owner',
        'speaking',
        'peer-2' as PeerId,
        'Urgent matter'
      );

      expect(request).not.toBeNull();
      expect(request?.requestedBy).toBe('peer-1');
      expect(request?.requesterName).toBe('Alice');
      expect(request?.reason).toBe('Urgent matter');
    });

    it('should set pending interrupt', async () => {
      await handler.requestInterrupt(
        roomId,
        'peer-1' as PeerId,
        'Alice',
        'owner',
        'speaking'
      );

      expect(handler.hasPendingInterrupt(roomId)).toBe(true);
      expect(handler.getPendingInterrupt(roomId)).not.toBeNull();
    });

    it('should return null when not allowed', async () => {
      handler.setEnabled(roomId, false);

      const request = await handler.requestInterrupt(
        roomId,
        'peer-1' as PeerId,
        'Alice',
        'owner',
        'speaking'
      );

      expect(request).toBeNull();
    });

    it('should call onInterruptRequested callback', async () => {
      const onInterruptRequested = vi.fn();
      handler = new InterruptHandler({}, { onInterruptRequested });
      handler.initRoom(roomId);

      await handler.requestInterrupt(
        roomId,
        'peer-1' as PeerId,
        'Alice',
        'owner',
        'speaking'
      );

      expect(onInterruptRequested).toHaveBeenCalledOnce();
      const event = onInterruptRequested.mock.calls[0][0] as InterruptEvent;
      expect(event.type).toBe('requested');
    });

    it('should call onInterruptRejected when not allowed', async () => {
      const onInterruptRejected = vi.fn();
      handler = new InterruptHandler({ enabled: false }, { onInterruptRejected });
      handler.initRoom(roomId);

      await handler.requestInterrupt(
        roomId,
        'peer-1' as PeerId,
        'Alice',
        'owner',
        'speaking'
      );

      expect(onInterruptRejected).toHaveBeenCalledOnce();
    });
  });

  describe('processInterrupt', () => {
    beforeEach(() => {
      handler.initRoom(roomId);
    });

    it('should process pending interrupt', async () => {
      await handler.requestInterrupt(
        roomId,
        'peer-1' as PeerId,
        'Alice',
        'owner',
        'speaking'
      );
      const request = handler.getPendingInterrupt(roomId);

      const result = await handler.processInterrupt(
        roomId,
        request!.id,
        'speaking',
        'peer-2' as PeerId,
        5000
      );

      expect(result).toBe(true);
      expect(handler.hasPendingInterrupt(roomId)).toBe(false);
    });

    it('should call onSendCancel callback', async () => {
      const onSendCancel = vi.fn().mockResolvedValue(true);
      handler = new InterruptHandler({}, { onSendCancel });
      handler.initRoom(roomId);

      await handler.requestInterrupt(
        roomId,
        'peer-1' as PeerId,
        'Alice',
        'owner',
        'speaking'
      );
      const request = handler.getPendingInterrupt(roomId);
      await handler.processInterrupt(roomId, request!.id, 'speaking');

      expect(onSendCancel).toHaveBeenCalledWith(roomId);
    });

    it('should call onClearResponse and onUnlock callbacks', async () => {
      const onClearResponse = vi.fn();
      const onUnlock = vi.fn();
      handler = new InterruptHandler({}, { onClearResponse, onUnlock });
      handler.initRoom(roomId);

      await handler.requestInterrupt(
        roomId,
        'peer-1' as PeerId,
        'Alice',
        'owner',
        'speaking'
      );
      const request = handler.getPendingInterrupt(roomId);
      await handler.processInterrupt(roomId, request!.id, 'speaking');

      expect(onClearResponse).toHaveBeenCalledWith(roomId);
      expect(onUnlock).toHaveBeenCalledWith(roomId);
    });

    it('should fail if onSendCancel returns false', async () => {
      const onSendCancel = vi.fn().mockResolvedValue(false);
      handler = new InterruptHandler({}, { onSendCancel });
      handler.initRoom(roomId);

      await handler.requestInterrupt(
        roomId,
        'peer-1' as PeerId,
        'Alice',
        'owner',
        'speaking'
      );
      const request = handler.getPendingInterrupt(roomId);
      const result = await handler.processInterrupt(roomId, request!.id, 'speaking');

      expect(result).toBe(false);
    });

    it('should return false for non-matching request ID', async () => {
      await handler.requestInterrupt(
        roomId,
        'peer-1' as PeerId,
        'Alice',
        'owner',
        'speaking'
      );

      const result = await handler.processInterrupt(roomId, 'wrong-id', 'speaking');
      expect(result).toBe(false);
    });

    it('should return false for non-existent room', async () => {
      const result = await handler.processInterrupt('unknown' as RoomId, 'any-id', 'speaking');
      expect(result).toBe(false);
    });

    it('should call onInterruptProcessed callback', async () => {
      const onInterruptProcessed = vi.fn();
      handler = new InterruptHandler({}, { onInterruptProcessed });
      handler.initRoom(roomId);

      await handler.requestInterrupt(
        roomId,
        'peer-1' as PeerId,
        'Alice',
        'owner',
        'speaking'
      );
      const request = handler.getPendingInterrupt(roomId);
      await handler.processInterrupt(roomId, request!.id, 'speaking', 'peer-2' as PeerId, 3000);

      expect(onInterruptProcessed).toHaveBeenCalledOnce();
      const event = onInterruptProcessed.mock.calls[0][0] as InterruptEvent;
      expect(event.type).toBe('processed');
      expect(event.responseDuration).toBe(3000);
    });

    it('should update statistics after processing', async () => {
      await handler.requestInterrupt(
        roomId,
        'peer-1' as PeerId,
        'Alice',
        'owner',
        'speaking'
      );
      const request = handler.getPendingInterrupt(roomId);
      await handler.processInterrupt(roomId, request!.id, 'speaking');

      const stats = handler.getStatistics(roomId);
      expect(stats?.successfulInterrupts).toBe(1);
      expect(stats?.interruptsThisMinute).toBe(1);
      expect(stats?.lastInterruptAt).toBeDefined();
    });
  });

  describe('cancelInterrupt', () => {
    beforeEach(() => {
      handler.initRoom(roomId);
    });

    it('should cancel pending interrupt', async () => {
      await handler.requestInterrupt(
        roomId,
        'peer-1' as PeerId,
        'Alice',
        'owner',
        'speaking'
      );
      const request = handler.getPendingInterrupt(roomId);

      const result = handler.cancelInterrupt(roomId, request!.id);

      expect(result).toBe(true);
      expect(handler.hasPendingInterrupt(roomId)).toBe(false);
    });

    it('should return false for wrong request ID', async () => {
      await handler.requestInterrupt(
        roomId,
        'peer-1' as PeerId,
        'Alice',
        'owner',
        'speaking'
      );

      const result = handler.cancelInterrupt(roomId, 'wrong-id');
      expect(result).toBe(false);
    });

    it('should return false when no pending interrupt', () => {
      const result = handler.cancelInterrupt(roomId, 'any-id');
      expect(result).toBe(false);
    });

    it('should log cancelled event', async () => {
      await handler.requestInterrupt(
        roomId,
        'peer-1' as PeerId,
        'Alice',
        'owner',
        'speaking'
      );
      const request = handler.getPendingInterrupt(roomId);
      handler.cancelInterrupt(roomId, request!.id);

      const history = handler.getHistory(roomId);
      const cancelledEvent = history.find((e) => e.type === 'cancelled');
      expect(cancelledEvent).toBeDefined();
    });
  });

  describe('history and statistics', () => {
    beforeEach(() => {
      handler.initRoom(roomId);
    });

    it('should track interrupt history', async () => {
      await handler.requestInterrupt(
        roomId,
        'peer-1' as PeerId,
        'Alice',
        'owner',
        'speaking'
      );
      const request = handler.getPendingInterrupt(roomId);
      await handler.processInterrupt(roomId, request!.id, 'speaking');

      const history = handler.getHistory(roomId);
      expect(history.length).toBeGreaterThan(0);
    });

    it('should limit history retrieval', async () => {
      // Create multiple interrupts
      for (let i = 0; i < 3; i++) {
        await handler.requestInterrupt(
          roomId,
          `peer-${i}` as PeerId,
          `User ${i}`,
          'owner',
          'speaking'
        );
        const request = handler.getPendingInterrupt(roomId);
        await handler.processInterrupt(roomId, request!.id, 'speaking');
        vi.advanceTimersByTime(3000);
      }

      const limited = handler.getHistory(roomId, 2);
      expect(limited.length).toBeLessThanOrEqual(2);
    });

    it('should clear history', async () => {
      await handler.requestInterrupt(
        roomId,
        'peer-1' as PeerId,
        'Alice',
        'owner',
        'speaking'
      );
      const request = handler.getPendingInterrupt(roomId);
      await handler.processInterrupt(roomId, request!.id, 'speaking');

      handler.clearHistory(roomId);

      expect(handler.getHistory(roomId).length).toBe(0);
    });

    it('should return complete statistics', async () => {
      await handler.requestInterrupt(
        roomId,
        'peer-1' as PeerId,
        'Alice',
        'owner',
        'speaking'
      );
      const request = handler.getPendingInterrupt(roomId);
      await handler.processInterrupt(roomId, request!.id, 'speaking');

      const stats = handler.getStatistics(roomId);

      expect(stats).toMatchObject({
        enabled: true,
        totalInterrupts: expect.any(Number),
        successfulInterrupts: 1,
        rejectedInterrupts: 0,
        interruptsThisMinute: 1,
      });
    });

    it('should calculate cooldown remaining', async () => {
      await handler.requestInterrupt(
        roomId,
        'peer-1' as PeerId,
        'Alice',
        'owner',
        'speaking'
      );
      const request = handler.getPendingInterrupt(roomId);
      await handler.processInterrupt(roomId, request!.id, 'speaking');

      vi.advanceTimersByTime(1000);

      const stats = handler.getStatistics(roomId);
      expect(stats?.cooldownRemaining).toBeGreaterThan(0);
      expect(stats?.cooldownRemaining).toBeLessThanOrEqual(1000);
    });

    it('should return null for non-existent room', () => {
      expect(handler.getStatistics('unknown' as RoomId)).toBeNull();
      expect(handler.getHistory('unknown' as RoomId)).toEqual([]);
    });
  });

  describe('setEnabled', () => {
    beforeEach(() => {
      handler.initRoom(roomId);
    });

    it('should enable interrupts', () => {
      handler.setEnabled(roomId, false);
      expect(handler.getStatistics(roomId)?.enabled).toBe(false);

      handler.setEnabled(roomId, true);
      expect(handler.getStatistics(roomId)?.enabled).toBe(true);
    });

    it('should disable interrupts', () => {
      handler.setEnabled(roomId, false);
      const result = handler.canInterrupt(roomId, 'peer-1' as PeerId, 'owner');
      expect(result.allowed).toBe(false);
    });
  });

  describe('updateOptions', () => {
    it('should update global options', () => {
      handler.initRoom(roomId);

      handler.updateOptions({ maxInterruptsPerMinute: 1 });

      // Process one interrupt
      handler.requestInterrupt(roomId, 'peer-1' as PeerId, 'Alice', 'owner', 'speaking');
      const request = handler.getPendingInterrupt(roomId);
      handler.processInterrupt(roomId, request!.id, 'speaking');

      vi.advanceTimersByTime(3000);

      // Should be rate limited now
      const result = handler.canInterrupt(roomId, 'peer-2' as PeerId, 'owner');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Rate limit');
    });
  });

  describe('getRoomCount', () => {
    it('should return correct room count', () => {
      expect(handler.getRoomCount()).toBe(0);

      handler.initRoom('room-1' as RoomId);
      handler.initRoom('room-2' as RoomId);

      expect(handler.getRoomCount()).toBe(2);

      handler.removeRoom('room-1' as RoomId);

      expect(handler.getRoomCount()).toBe(1);
    });
  });

  describe('edge cases', () => {
    it('should handle multiple rooms independently', async () => {
      const room1 = 'room-1' as RoomId;
      const room2 = 'room-2' as RoomId;

      handler.initRoom(room1);
      handler.initRoom(room2);

      await handler.requestInterrupt(room1, 'peer-1' as PeerId, 'Alice', 'owner', 'speaking');

      expect(handler.hasPendingInterrupt(room1)).toBe(true);
      expect(handler.hasPendingInterrupt(room2)).toBe(false);
    });

    it('should handle error in onSendCancel', async () => {
      const onSendCancel = vi.fn().mockRejectedValue(new Error('Network error'));
      handler = new InterruptHandler({}, { onSendCancel });
      handler.initRoom(roomId);

      await handler.requestInterrupt(
        roomId,
        'peer-1' as PeerId,
        'Alice',
        'owner',
        'speaking'
      );
      const request = handler.getPendingInterrupt(roomId);
      const result = await handler.processInterrupt(roomId, request!.id, 'speaking');

      expect(result).toBe(false);
      expect(handler.hasPendingInterrupt(roomId)).toBe(false);
    });

    it('should handle moderators disabled', async () => {
      handler = new InterruptHandler({ moderatorsCanInterrupt: false });
      handler.initRoom(roomId);

      const ownerResult = handler.canInterrupt(roomId, 'peer-1' as PeerId, 'owner');
      const modResult = handler.canInterrupt(roomId, 'peer-2' as PeerId, 'moderator');

      expect(ownerResult.allowed).toBe(true);
      expect(modResult.allowed).toBe(false);
    });

    it('should prune old history', async () => {
      // Create many interrupts
      for (let i = 0; i < 110; i++) {
        await handler.requestInterrupt(
          roomId,
          `peer-${i}` as PeerId,
          `User ${i}`,
          'owner',
          'idle' // Use idle to avoid rate limits
        );
        // Just cancel to avoid processing limits
        const request = handler.getPendingInterrupt(roomId);
        if (request) {
          handler.cancelInterrupt(roomId, request.id);
        }
      }

      const history = handler.getHistory(roomId);
      // History should be pruned to manageable size
      expect(history.length).toBeLessThanOrEqual(100);
    });
  });

  describe('onLogEvent callback', () => {
    it('should call onLogEvent for all events', async () => {
      const onLogEvent = vi.fn();
      handler = new InterruptHandler({ logAllEvents: true }, { onLogEvent });
      handler.initRoom(roomId);

      await handler.requestInterrupt(
        roomId,
        'peer-1' as PeerId,
        'Alice',
        'owner',
        'speaking'
      );
      const request = handler.getPendingInterrupt(roomId);
      await handler.processInterrupt(roomId, request!.id, 'speaking');

      // Should have logged requested and processed events
      expect(onLogEvent).toHaveBeenCalledTimes(2);
    });
  });
});
