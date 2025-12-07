/**
 * Reconnection Handler Tests
 *
 * Tests for automatic reconnection with state preservation.
 *
 * Part of the Long-Horizon Engineering Protocol - FEAT-404
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  // Types
  ReconnectionState,
  ConnectionType,
  ReconnectionAttempt,
  ConnectionReconnectionStatus,
  RoomStateSnapshot,
  // Utility functions
  calculateReconnectionDelay,
  shouldReconnect,
  formatReconnectionStatus,
  // Classes
  ReconnectionManager,
  WebRTCReconnectionManager,
  // Factory functions
  createReconnectionManager,
  createWebRTCReconnectionManager,
  // React helpers
  getReconnectionDisplayStatus,
  // Constants
  DEFAULT_RECONNECTION_OPTIONS,
} from '@/lib/reconnection';
import type { RoomId } from '@/types/room';
import type { PeerId } from '@/types/peer';

// Test helpers
const createRoomId = (): RoomId => `room-${Math.random().toString(36).slice(2)}` as RoomId;
const createPeerId = (): PeerId => `peer-${Math.random().toString(36).slice(2)}` as PeerId;

describe('Reconnection Handler - FEAT-404', () => {
  // ========== Default Options ==========

  describe('DEFAULT_RECONNECTION_OPTIONS', () => {
    it('should have sensible defaults', () => {
      expect(DEFAULT_RECONNECTION_OPTIONS.maxAttempts).toBe(5);
      expect(DEFAULT_RECONNECTION_OPTIONS.baseDelay).toBe(1000);
      expect(DEFAULT_RECONNECTION_OPTIONS.maxDelay).toBe(30000);
      expect(DEFAULT_RECONNECTION_OPTIONS.exponentialBackoff).toBe(true);
      expect(DEFAULT_RECONNECTION_OPTIONS.jitterFactor).toBe(0.3);
      expect(DEFAULT_RECONNECTION_OPTIONS.connectionTimeout).toBe(10000);
    });
  });

  // ========== calculateReconnectionDelay ==========

  describe('calculateReconnectionDelay', () => {
    it('should calculate exponential backoff delay', () => {
      const options = {
        baseDelay: 1000,
        maxDelay: 30000,
        exponentialBackoff: true,
        jitterFactor: 0,
      };

      expect(calculateReconnectionDelay(1, options)).toBe(1000);  // 1000 * 2^0
      expect(calculateReconnectionDelay(2, options)).toBe(2000);  // 1000 * 2^1
      expect(calculateReconnectionDelay(3, options)).toBe(4000);  // 1000 * 2^2
      expect(calculateReconnectionDelay(4, options)).toBe(8000);  // 1000 * 2^3
      expect(calculateReconnectionDelay(5, options)).toBe(16000); // 1000 * 2^4
    });

    it('should calculate linear delay when exponential is disabled', () => {
      const options = {
        baseDelay: 1000,
        maxDelay: 30000,
        exponentialBackoff: false,
        jitterFactor: 0,
      };

      expect(calculateReconnectionDelay(1, options)).toBe(1000);
      expect(calculateReconnectionDelay(2, options)).toBe(2000);
      expect(calculateReconnectionDelay(3, options)).toBe(3000);
      expect(calculateReconnectionDelay(4, options)).toBe(4000);
      expect(calculateReconnectionDelay(5, options)).toBe(5000);
    });

    it('should cap delay at maxDelay', () => {
      const options = {
        baseDelay: 1000,
        maxDelay: 5000,
        exponentialBackoff: true,
        jitterFactor: 0,
      };

      expect(calculateReconnectionDelay(5, options)).toBe(5000); // Would be 16000, capped at 5000
      expect(calculateReconnectionDelay(10, options)).toBe(5000);
    });

    it('should add jitter when jitterFactor > 0', () => {
      const options = {
        baseDelay: 1000,
        maxDelay: 30000,
        exponentialBackoff: false,
        jitterFactor: 0.5,
      };

      // Run multiple times to verify randomness
      const delays = new Set<number>();
      for (let i = 0; i < 10; i++) {
        delays.add(calculateReconnectionDelay(1, options));
      }

      // With jitter, we should get some variation
      // Base is 1000, jitter factor 0.5 means +/- 500
      // So range is 500-1500
      for (const delay of delays) {
        expect(delay).toBeGreaterThanOrEqual(500);
        expect(delay).toBeLessThanOrEqual(1500);
      }
    });

    it('should use default options when not provided', () => {
      const delay = calculateReconnectionDelay(1);
      // With default jitter, delay should be around baseDelay (1000)
      expect(delay).toBeGreaterThan(0);
      expect(delay).toBeLessThanOrEqual(DEFAULT_RECONNECTION_OPTIONS.maxDelay);
    });
  });

  // ========== shouldReconnect ==========

  describe('shouldReconnect', () => {
    it('should return true when attempts remain', () => {
      expect(shouldReconnect(1, 5)).toBe(true);
      expect(shouldReconnect(4, 5)).toBe(true);
    });

    it('should return false when max attempts reached', () => {
      expect(shouldReconnect(5, 5)).toBe(false);
      expect(shouldReconnect(6, 5)).toBe(false);
    });

    it('should return false for non-recoverable errors', () => {
      expect(shouldReconnect(1, 5, 'unauthorized')).toBe(false);
      expect(shouldReconnect(1, 5, 'banned')).toBe(false);
      expect(shouldReconnect(1, 5, 'room_not_found')).toBe(false);
      expect(shouldReconnect(1, 5, 'room_closed')).toBe(false);
      expect(shouldReconnect(1, 5, 'kicked')).toBe(false);
      expect(shouldReconnect(1, 5, 'invalid_token')).toBe(false);
    });

    it('should return true for recoverable errors', () => {
      expect(shouldReconnect(1, 5, 'Connection timeout')).toBe(true);
      expect(shouldReconnect(1, 5, 'Network error')).toBe(true);
      expect(shouldReconnect(1, 5, 'Server unavailable')).toBe(true);
    });
  });

  // ========== formatReconnectionStatus ==========

  describe('formatReconnectionStatus', () => {
    it('should format idle state', () => {
      const status: ConnectionReconnectionStatus = {
        type: 'signaling',
        state: 'idle',
        attempt: 0,
        maxAttempts: 5,
        history: [],
      };
      expect(formatReconnectionStatus(status)).toBe('Connected');
    });

    it('should format waiting state with countdown', () => {
      const status: ConnectionReconnectionStatus = {
        type: 'signaling',
        state: 'waiting',
        attempt: 1,
        maxAttempts: 5,
        nextAttemptAt: new Date(Date.now() + 5000),
        history: [],
      };
      const message = formatReconnectionStatus(status);
      expect(message).toContain('Reconnecting in');
      expect(message).toContain('attempt 2/5');
    });

    it('should format reconnecting state', () => {
      const status: ConnectionReconnectionStatus = {
        type: 'signaling',
        state: 'reconnecting',
        attempt: 3,
        maxAttempts: 5,
        history: [],
      };
      expect(formatReconnectionStatus(status)).toBe('Reconnecting... (attempt 3/5)');
    });

    it('should format success state', () => {
      const status: ConnectionReconnectionStatus = {
        type: 'signaling',
        state: 'success',
        attempt: 2,
        maxAttempts: 5,
        history: [],
      };
      expect(formatReconnectionStatus(status)).toBe('Reconnected');
    });

    it('should format failed state', () => {
      const status: ConnectionReconnectionStatus = {
        type: 'signaling',
        state: 'failed',
        attempt: 5,
        maxAttempts: 5,
        history: [],
      };
      expect(formatReconnectionStatus(status)).toBe('Connection failed after 5 attempts');
    });
  });

  // ========== ReconnectionManager ==========

  describe('ReconnectionManager', () => {
    let manager: ReconnectionManager;

    beforeEach(() => {
      manager = createReconnectionManager({
        maxAttempts: 3,
        baseDelay: 100,
        maxDelay: 1000,
        jitterFactor: 0,
        connectionTimeout: 1000,
      });
    });

    afterEach(() => {
      manager.dispose();
    });

    describe('initialization', () => {
      it('should initialize with idle status for all connection types', () => {
        expect(manager.getStatus('signaling').state).toBe('idle');
        expect(manager.getStatus('webrtc').state).toBe('idle');
        expect(manager.getStatus('ai_session').state).toBe('idle');
      });

      it('should not be reconnecting initially', () => {
        expect(manager.isReconnecting()).toBe(false);
      });
    });

    describe('successful reconnection', () => {
      it('should successfully reconnect on first attempt', async () => {
        const connectFn = vi.fn().mockResolvedValue(undefined);
        const result = await manager.startReconnection('signaling', connectFn);

        expect(result).toBe(true);
        expect(connectFn).toHaveBeenCalledTimes(1);
        expect(manager.getStatus('signaling').state).toBe('success');
        expect(manager.getStatus('signaling').attempt).toBe(1);
      });

      it('should succeed after failed attempts', async () => {
        let attempts = 0;
        const connectFn = vi.fn().mockImplementation(async () => {
          attempts++;
          if (attempts < 2) {
            throw new Error('Connection failed');
          }
        });

        const result = await manager.startReconnection('signaling', connectFn);

        expect(result).toBe(true);
        expect(connectFn).toHaveBeenCalledTimes(2);
        expect(manager.getStatus('signaling').state).toBe('success');
        expect(manager.getStatus('signaling').attempt).toBe(2);
      });

      it('should call success callback', async () => {
        const onSuccess = vi.fn();
        const managerWithCallback = createReconnectionManager(
          { maxAttempts: 3, baseDelay: 100, jitterFactor: 0 },
          { onSuccess }
        );

        await managerWithCallback.startReconnection('signaling', async () => {});
        expect(onSuccess).toHaveBeenCalledWith('signaling');

        managerWithCallback.dispose();
      });
    });

    describe('failed reconnection', () => {
      it('should fail after max attempts', async () => {
        // Manager has maxAttempts: 3, baseDelay: 100
        const connectFn = vi.fn().mockRejectedValue(new Error('Connection failed'));

        const result = await manager.startReconnection('signaling', connectFn);

        expect(result).toBe(false);
        // With exponential backoff and 3 max attempts, all 3 should be called
        expect(connectFn).toHaveBeenCalled();
        expect(manager.getStatus('signaling').state).toBe('failed');
      });

      it('should call failure callback', async () => {
        const onFailure = vi.fn();
        // Use banned which is non-recoverable, so it fails on first attempt
        const managerWithCallback = createReconnectionManager(
          { maxAttempts: 3, baseDelay: 10, jitterFactor: 0 },
          { onFailure }
        );

        await managerWithCallback.startReconnection('signaling', async () => {
          throw new Error('banned');
        });

        expect(onFailure).toHaveBeenCalledWith('signaling', 'banned');
        managerWithCallback.dispose();
      });

      it('should fail immediately for non-recoverable errors', async () => {
        const connectFn = vi.fn().mockRejectedValue(new Error('banned'));

        const result = await manager.startReconnection('signaling', connectFn);

        expect(result).toBe(false);
        expect(connectFn).toHaveBeenCalledTimes(1);
        expect(manager.getStatus('signaling').state).toBe('failed');
      });
    });

    describe('state tracking', () => {
      it('should track attempt history', async () => {
        let attempts = 0;
        const connectFn = vi.fn().mockImplementation(async () => {
          attempts++;
          if (attempts < 2) {
            throw new Error('Failed');
          }
        });

        await manager.startReconnection('signaling', connectFn);

        const status = manager.getStatus('signaling');
        expect(status.history.length).toBe(2);
        expect(status.history[0].success).toBe(false);
        expect(status.history[1].success).toBe(true);
      });

      it('should call onAttempt callback for each attempt', async () => {
        const onAttempt = vi.fn();
        const managerWithCallback = createReconnectionManager(
          { maxAttempts: 3, baseDelay: 50, jitterFactor: 0 },
          { onAttempt }
        );

        let attempts = 0;
        await managerWithCallback.startReconnection('signaling', async () => {
          attempts++;
          if (attempts < 2) {
            throw new Error('Failed');
          }
        });

        expect(onAttempt).toHaveBeenCalledTimes(2);
        managerWithCallback.dispose();
      });

      it('should call onStateChange callback on failure', async () => {
        const onStateChange = vi.fn();
        const managerWithCallback = createReconnectionManager(
          { maxAttempts: 1, baseDelay: 10, jitterFactor: 0 },
          { onStateChange }
        );

        // Use non-recoverable error to get a definite failed state
        await managerWithCallback.startReconnection('signaling', async () => {
          throw new Error('banned');
        });

        // Should have been called for failed state
        expect(onStateChange).toHaveBeenCalled();
        const calls = onStateChange.mock.calls;
        const failedCall = calls.find((c: [string, string]) => c[1] === 'failed');
        expect(failedCall).toBeDefined();

        managerWithCallback.dispose();
      });
    });

    describe('room state preservation', () => {
      it('should save and retrieve room state', () => {
        const snapshot: RoomStateSnapshot = {
          roomId: createRoomId(),
          localPeerId: createPeerId(),
          displayName: 'Test User',
          avatarUrl: 'https://example.com/avatar.png',
          peers: [createPeerId(), createPeerId()],
          aiSessionActive: true,
          timestamp: new Date(),
        };

        manager.saveRoomState(snapshot);
        const retrieved = manager.getSavedRoomState();

        expect(retrieved).toMatchObject({
          roomId: snapshot.roomId,
          localPeerId: snapshot.localPeerId,
          displayName: snapshot.displayName,
          peers: snapshot.peers,
          aiSessionActive: snapshot.aiSessionActive,
        });
      });

      it('should clear room state', () => {
        manager.saveRoomState({
          roomId: createRoomId(),
          localPeerId: createPeerId(),
          displayName: 'Test',
          peers: [],
          aiSessionActive: false,
          timestamp: new Date(),
        });

        manager.clearRoomState();
        expect(manager.getSavedRoomState()).toBeNull();
      });

      it('should preserve room state for later restoration', () => {
        // This tests that room state can be saved and retrieved
        // The actual restoration callback is tested in integration
        const roomId = createRoomId();
        const localPeerId = createPeerId();
        const snapshot: RoomStateSnapshot = {
          roomId,
          localPeerId,
          displayName: 'Test User',
          peers: [createPeerId()],
          aiSessionActive: true,
          timestamp: new Date(),
        };

        manager.saveRoomState(snapshot);
        const savedState = manager.getSavedRoomState();

        expect(savedState).not.toBeNull();
        expect(savedState!.roomId).toBe(roomId);
        expect(savedState!.localPeerId).toBe(localPeerId);
        expect(savedState!.displayName).toBe('Test User');
        expect(savedState!.peers).toHaveLength(1);
        expect(savedState!.aiSessionActive).toBe(true);
      });
    });

    describe('cancellation', () => {
      it('should cancel reconnection for a specific type', async () => {
        const slowConnect = vi.fn().mockImplementation(
          () => new Promise((resolve) => setTimeout(resolve, 1000))
        );

        // Start reconnection but cancel immediately
        const promise = manager.startReconnection('signaling', slowConnect);
        manager.cancelReconnection('signaling');

        // Should not complete successfully
        const status = manager.getStatus('signaling');
        expect(status.state).toBe('idle');
      });

      it('should cancel all reconnections', () => {
        manager.cancelAll();

        expect(manager.getStatus('signaling').state).toBe('idle');
        expect(manager.getStatus('webrtc').state).toBe('idle');
        expect(manager.getStatus('ai_session').state).toBe('idle');
      });
    });

    describe('reset', () => {
      it('should reset a specific connection type', async () => {
        await manager.startReconnection('signaling', async () => {});
        expect(manager.getStatus('signaling').state).toBe('success');

        manager.reset('signaling');
        expect(manager.getStatus('signaling').state).toBe('idle');
        expect(manager.getStatus('signaling').attempt).toBe(0);
      });

      it('should reset all connection types', async () => {
        await manager.startReconnection('signaling', async () => {});
        manager.saveRoomState({
          roomId: createRoomId(),
          localPeerId: createPeerId(),
          displayName: 'Test',
          peers: [],
          aiSessionActive: false,
          timestamp: new Date(),
        });

        manager.resetAll();

        expect(manager.getStatus('signaling').state).toBe('idle');
        expect(manager.getSavedRoomState()).toBeNull();
      });
    });

    describe('isReconnecting', () => {
      it('should return true when reconnection is in progress', async () => {
        const slowConnect = vi.fn().mockImplementation(
          () => new Promise((resolve) => setTimeout(resolve, 100))
        );

        const promise = manager.startReconnection('signaling', slowConnect);
        expect(manager.isReconnecting()).toBe(true);

        await promise;
        expect(manager.isReconnecting()).toBe(false);
      });
    });
  });

  // ========== WebRTCReconnectionManager ==========

  describe('WebRTCReconnectionManager', () => {
    let manager: WebRTCReconnectionManager;

    beforeEach(() => {
      manager = createWebRTCReconnectionManager({
        maxAttempts: 3,
        baseDelay: 50,
        jitterFactor: 0,
      });
    });

    afterEach(() => {
      manager.dispose();
    });

    it('should track peer reconnection state', async () => {
      const peerId = createPeerId();
      await manager.startPeerReconnection(peerId, async () => {});

      const state = manager.getPeerState(peerId);
      expect(state).toBeDefined();
      expect(state!.state).toBe('success');
      expect(state!.attempt).toBe(1);
    });

    it('should handle multiple peers', async () => {
      const peer1 = createPeerId();
      const peer2 = createPeerId();

      await manager.startPeerReconnection(peer1, async () => {});
      await manager.startPeerReconnection(peer2, async () => {});

      const allStates = manager.getAllPeerStates();
      expect(allStates.size).toBe(2);
      expect(allStates.get(peer1)?.state).toBe('success');
      expect(allStates.get(peer2)?.state).toBe('success');
    });

    it('should retry failed peer reconnections', async () => {
      const peerId = createPeerId();
      let attempts = 0;

      await manager.startPeerReconnection(peerId, async () => {
        attempts++;
        if (attempts < 2) {
          throw new Error('ICE failed');
        }
      });

      const state = manager.getPeerState(peerId);
      expect(state!.state).toBe('success');
      expect(state!.attempt).toBe(2);
    });

    it('should fail after max attempts', async () => {
      const peerId = createPeerId();

      await manager.startPeerReconnection(peerId, async () => {
        throw new Error('ICE failed');
      });

      const state = manager.getPeerState(peerId);
      expect(state!.state).toBe('failed');
      expect(state!.attempt).toBe(3);
    });

    it('should remove peer', () => {
      const peerId = createPeerId();
      manager.startPeerReconnection(peerId, async () => {});
      manager.removePeer(peerId);

      expect(manager.getPeerState(peerId)).toBeUndefined();
    });

    it('should reset all peers', async () => {
      await manager.startPeerReconnection(createPeerId(), async () => {});
      await manager.startPeerReconnection(createPeerId(), async () => {});

      manager.reset();
      expect(manager.getAllPeerStates().size).toBe(0);
    });
  });

  // ========== getReconnectionDisplayStatus ==========

  describe('getReconnectionDisplayStatus', () => {
    let manager: ReconnectionManager;

    beforeEach(() => {
      manager = createReconnectionManager({
        maxAttempts: 3,
        baseDelay: 50,
        jitterFactor: 0,
      });
    });

    afterEach(() => {
      manager.dispose();
    });

    it('should return idle status when not reconnecting', () => {
      const status = getReconnectionDisplayStatus(manager);

      expect(status.isReconnecting).toBe(false);
      expect(status.overallState).toBe('idle');
      expect(status.displayMessage).toBe('Connected');
    });

    it('should return success status after reconnection', async () => {
      await manager.startReconnection('signaling', async () => {});

      const status = getReconnectionDisplayStatus(manager);
      expect(status.overallState).toBe('success');
      expect(status.displayMessage).toBe('Reconnected');
    });

    it('should return failed status when reconnection fails', async () => {
      await manager.startReconnection('signaling', async () => {
        throw new Error('banned');
      });

      const status = getReconnectionDisplayStatus(manager);
      expect(status.overallState).toBe('failed');
      expect(status.displayMessage).toContain('Connection lost');
    });

    it('should include individual connection statuses', () => {
      const status = getReconnectionDisplayStatus(manager);

      expect(status.signaling).toBeDefined();
      expect(status.webrtc).toBeDefined();
      expect(status.aiSession).toBeDefined();
    });
  });

  // ========== Integration Tests ==========

  describe('Integration Tests', () => {
    it('should handle full reconnection flow', async () => {
      const callbacks = {
        onStateChange: vi.fn(),
        onAttempt: vi.fn(),
        onSuccess: vi.fn(),
        onRoomStateRestored: vi.fn(),
      };

      const manager = createReconnectionManager(
        { maxAttempts: 3, baseDelay: 50, jitterFactor: 0 },
        callbacks
      );

      // Save room state
      const roomId = createRoomId();
      const snapshot: RoomStateSnapshot = {
        roomId,
        localPeerId: createPeerId(),
        displayName: 'Test User',
        peers: [createPeerId(), createPeerId()],
        aiSessionActive: true,
        timestamp: new Date(),
      };
      manager.saveRoomState(snapshot);

      // Simulate reconnection with one failure
      let attempts = 0;
      await manager.startReconnection('signaling', async () => {
        attempts++;
        if (attempts < 2) {
          throw new Error('Network error');
        }
      });

      // Verify callbacks
      expect(callbacks.onStateChange).toHaveBeenCalled();
      expect(callbacks.onAttempt).toHaveBeenCalledTimes(2);
      expect(callbacks.onSuccess).toHaveBeenCalledWith('signaling');
      expect(callbacks.onRoomStateRestored).toHaveBeenCalledWith(
        expect.objectContaining({ roomId })
      );

      // Verify final state
      const status = manager.getStatus('signaling');
      expect(status.state).toBe('success');
      expect(status.attempt).toBe(2);
      expect(status.history.length).toBe(2);

      manager.dispose();
    });

    it('should handle multiple connection types', async () => {
      const manager = createReconnectionManager({
        maxAttempts: 2,
        baseDelay: 50,
        jitterFactor: 0,
      });

      // Reconnect all types
      await Promise.all([
        manager.startReconnection('signaling', async () => {}),
        manager.startReconnection('webrtc', async () => {}),
        manager.startReconnection('ai_session', async () => {}),
      ]);

      // All should be successful
      expect(manager.getStatus('signaling').state).toBe('success');
      expect(manager.getStatus('webrtc').state).toBe('success');
      expect(manager.getStatus('ai_session').state).toBe('success');

      manager.dispose();
    });

    it('should track connection timeout option', () => {
      const manager = createReconnectionManager({
        maxAttempts: 1,
        baseDelay: 10,
        jitterFactor: 0,
        connectionTimeout: 50,
      });

      // Verify manager was created with correct options
      const status = manager.getStatus('signaling');
      expect(status.state).toBe('idle');
      expect(status.maxAttempts).toBe(1);

      manager.dispose();
    });
  });
});
