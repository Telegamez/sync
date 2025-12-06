/**
 * Response Broadcast Manager Tests
 *
 * Tests for FEAT-302: Response broadcasting
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ResponseBroadcastManager,
  createResponseBroadcastManager,
  type ResponseBroadcastOptions,
  type ResponseBroadcastCallbacks,
  type BroadcastAudioChunk,
  type ResponseInfo,
  type ResponseBroadcastState,
} from '@/server/signaling/response-broadcast';
import type { RoomId } from '@/types/room';
import type { PeerId } from '@/types/peer';

// Helper to create audio buffer
function createAudioBuffer(size: number = 480): ArrayBuffer {
  return new Int16Array(size).buffer;
}

describe('ResponseBroadcastManager', () => {
  const roomId: RoomId = 'room-test-123' as RoomId;
  const peer1: PeerId = 'peer-1' as PeerId;
  const peer2: PeerId = 'peer-2' as PeerId;
  const peer3: PeerId = 'peer-3' as PeerId;
  let manager: ResponseBroadcastManager;
  let callbacks: ResponseBroadcastCallbacks;

  beforeEach(() => {
    vi.useFakeTimers();
    callbacks = {
      onSendToPeer: vi.fn(),
      onBroadcastStart: vi.fn(),
      onBroadcastComplete: vi.fn(),
      onBroadcastCancelled: vi.fn(),
      onStateChange: vi.fn(),
      onPeerCatchUp: vi.fn(),
      onError: vi.fn(),
    };
    manager = new ResponseBroadcastManager({}, callbacks);
  });

  afterEach(() => {
    manager.dispose();
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  describe('Room initialization', () => {
    it('initializes a room', () => {
      manager.initRoom(roomId);
      expect(manager.hasRoom(roomId)).toBe(true);
    });

    it('does not reinitialize existing room', () => {
      manager.initRoom(roomId);
      manager.addPeer(roomId, peer1);
      manager.initRoom(roomId); // Should not reset
      expect(manager.getPeerCount(roomId)).toBe(1);
    });

    it('removes a room', () => {
      manager.initRoom(roomId);
      expect(manager.removeRoom(roomId)).toBe(true);
      expect(manager.hasRoom(roomId)).toBe(false);
    });

    it('returns false when removing non-existent room', () => {
      expect(manager.removeRoom('non-existent' as RoomId)).toBe(false);
    });
  });

  describe('Peer management', () => {
    beforeEach(() => {
      manager.initRoom(roomId);
    });

    it('adds a peer', () => {
      manager.addPeer(roomId, peer1);
      expect(manager.getPeers(roomId)).toContain(peer1);
    });

    it('adds multiple peers', () => {
      manager.addPeer(roomId, peer1);
      manager.addPeer(roomId, peer2);
      manager.addPeer(roomId, peer3);
      expect(manager.getPeerCount(roomId)).toBe(3);
    });

    it('does not add duplicate peer', () => {
      manager.addPeer(roomId, peer1);
      manager.addPeer(roomId, peer1);
      expect(manager.getPeerCount(roomId)).toBe(1);
    });

    it('removes a peer', () => {
      manager.addPeer(roomId, peer1);
      expect(manager.removePeer(roomId, peer1)).toBe(true);
      expect(manager.getPeerCount(roomId)).toBe(0);
    });

    it('returns false when removing non-existent peer', () => {
      expect(manager.removePeer(roomId, peer1)).toBe(false);
    });

    it('returns empty array for non-existent room', () => {
      expect(manager.getPeers('unknown' as RoomId)).toEqual([]);
    });

    it('returns 0 for non-existent room peer count', () => {
      expect(manager.getPeerCount('unknown' as RoomId)).toBe(0);
    });
  });

  describe('Response lifecycle', () => {
    beforeEach(() => {
      manager.initRoom(roomId);
      manager.addPeer(roomId, peer1);
    });

    it('starts a response', () => {
      const responseId = manager.startResponse(roomId, peer1);
      expect(responseId).toBeTruthy();
      expect(manager.getBroadcastState(roomId)).toBe('buffering');
    });

    it('returns null for non-existent room', () => {
      expect(manager.startResponse('unknown' as RoomId, peer1)).toBeNull();
      expect(callbacks.onError).toHaveBeenCalled();
    });

    it('fires onStateChange when starting', () => {
      manager.startResponse(roomId, peer1);
      expect(callbacks.onStateChange).toHaveBeenCalledWith(
        roomId,
        'buffering',
        expect.any(Object)
      );
    });

    it('ends a response', () => {
      manager.startResponse(roomId, peer1);
      manager.addChunk(roomId, createAudioBuffer(), 20);
      expect(manager.endResponse(roomId)).toBe(true);
      expect(manager.getBroadcastState(roomId)).toBe('completed');
    });

    it('fires onBroadcastComplete when ending', () => {
      manager.startResponse(roomId, peer1);
      manager.addChunk(roomId, createAudioBuffer(), 20);
      manager.endResponse(roomId);
      expect(callbacks.onBroadcastComplete).toHaveBeenCalledWith(
        roomId,
        expect.any(Object)
      );
    });

    it('returns false when ending non-existent response', () => {
      expect(manager.endResponse(roomId)).toBe(false);
    });

    it('cancels a response', () => {
      manager.startResponse(roomId, peer1);
      expect(manager.cancelResponse(roomId)).toBe(true);
      expect(manager.getBroadcastState(roomId)).toBe('cancelled');
    });

    it('fires onBroadcastCancelled when cancelling', () => {
      manager.startResponse(roomId, peer1);
      manager.cancelResponse(roomId);
      expect(callbacks.onBroadcastCancelled).toHaveBeenCalledWith(
        roomId,
        expect.any(Object)
      );
    });

    it('returns false when cancelling non-existent response', () => {
      expect(manager.cancelResponse(roomId)).toBe(false);
    });
  });

  describe('Audio chunk handling', () => {
    beforeEach(() => {
      manager.initRoom(roomId);
      manager.addPeer(roomId, peer1);
    });

    it('adds chunks during buffering', () => {
      manager.startResponse(roomId, peer1);
      expect(manager.addChunk(roomId, createAudioBuffer(), 20)).toBe(true);
      const status = manager.getBufferStatus(roomId);
      expect(status.chunksBuffered).toBe(1);
      expect(status.durationMs).toBe(20);
    });

    it('returns false for non-existent room', () => {
      expect(manager.addChunk('unknown' as RoomId, createAudioBuffer(), 20)).toBe(false);
    });

    it('returns false when no response started', () => {
      expect(manager.addChunk(roomId, createAudioBuffer(), 20)).toBe(false);
    });

    it('tracks total chunks', () => {
      manager.startResponse(roomId, peer1);
      manager.addChunk(roomId, createAudioBuffer(), 20);
      manager.addChunk(roomId, createAudioBuffer(), 20);
      manager.addChunk(roomId, createAudioBuffer(), 20);

      const response = manager.getCurrentResponse(roomId);
      expect(response?.totalChunks).toBe(3);
    });

    it('tracks total duration', () => {
      manager.startResponse(roomId, peer1);
      manager.addChunk(roomId, createAudioBuffer(), 20);
      manager.addChunk(roomId, createAudioBuffer(), 30);
      manager.addChunk(roomId, createAudioBuffer(), 25);

      const response = manager.getCurrentResponse(roomId);
      expect(response?.totalDurationMs).toBe(75);
    });

    it('ends response when isLast is true', () => {
      manager.startResponse(roomId, peer1);
      manager.addChunk(roomId, createAudioBuffer(), 20, true);
      expect(manager.getBroadcastState(roomId)).toBe('completed');
    });
  });

  describe('Broadcasting', () => {
    beforeEach(() => {
      manager = new ResponseBroadcastManager(
        { bufferSizeMs: 50, minPeersReady: 0 },
        callbacks
      );
      manager.initRoom(roomId);
      manager.addPeer(roomId, peer1);
      manager.addPeer(roomId, peer2);
    });

    it('starts broadcasting after buffer fills', () => {
      manager.startResponse(roomId, peer1);

      // Add chunks until buffer is full
      manager.addChunk(roomId, createAudioBuffer(), 30);
      manager.addChunk(roomId, createAudioBuffer(), 30);

      expect(manager.getBroadcastState(roomId)).toBe('broadcasting');
      expect(callbacks.onBroadcastStart).toHaveBeenCalled();
    });

    it('sends buffered chunks to all peers', () => {
      manager.startResponse(roomId, peer1);
      manager.addChunk(roomId, createAudioBuffer(), 30);
      manager.addChunk(roomId, createAudioBuffer(), 30);

      // Should have sent 2 chunks to 2 peers = 4 calls
      expect(callbacks.onSendToPeer).toHaveBeenCalledTimes(4);
    });

    it('sends new chunks immediately during broadcasting', () => {
      manager.startResponse(roomId, peer1);
      manager.addChunk(roomId, createAudioBuffer(), 60); // Fills buffer

      vi.clearAllMocks();

      manager.addChunk(roomId, createAudioBuffer(), 20);
      expect(callbacks.onSendToPeer).toHaveBeenCalledTimes(2); // 1 chunk to 2 peers
    });

    it('tracks broadcasted chunks', () => {
      manager.startResponse(roomId, peer1);
      manager.addChunk(roomId, createAudioBuffer(), 30);
      manager.addChunk(roomId, createAudioBuffer(), 30);

      const response = manager.getCurrentResponse(roomId);
      expect(response?.broadcastedChunks).toBe(2);
    });

    it('checks isBroadcasting correctly', () => {
      expect(manager.isBroadcasting(roomId)).toBe(false);

      manager.startResponse(roomId, peer1);
      expect(manager.isBroadcasting(roomId)).toBe(false); // Still buffering

      manager.addChunk(roomId, createAudioBuffer(), 60);
      expect(manager.isBroadcasting(roomId)).toBe(true);
    });
  });

  describe('Peer readiness', () => {
    beforeEach(() => {
      manager = new ResponseBroadcastManager(
        { bufferSizeMs: 50, minPeersReady: 2 },
        callbacks
      );
      manager.initRoom(roomId);
      manager.addPeer(roomId, peer1);
      manager.addPeer(roomId, peer2);
    });

    it('waits for peers to be ready', () => {
      manager.startResponse(roomId, peer1);
      manager.addChunk(roomId, createAudioBuffer(), 60);

      // Buffer is full but not enough peers ready
      expect(manager.getBroadcastState(roomId)).toBe('buffering');
    });

    it('starts when enough peers are ready', () => {
      manager.startResponse(roomId, peer1);
      manager.addChunk(roomId, createAudioBuffer(), 60);

      manager.setPeerReady(roomId, peer1);
      expect(manager.getBroadcastState(roomId)).toBe('buffering');

      manager.setPeerReady(roomId, peer2);
      expect(manager.getBroadcastState(roomId)).toBe('broadcasting');
    });

    it('ignores setPeerReady for non-existent room', () => {
      manager.setPeerReady('unknown' as RoomId, peer1);
      // Should not throw
    });
  });

  describe('Max wait timeout', () => {
    beforeEach(() => {
      manager = new ResponseBroadcastManager(
        { bufferSizeMs: 50, minPeersReady: 10, maxWaitForPeersMs: 500 },
        callbacks
      );
      manager.initRoom(roomId);
      manager.addPeer(roomId, peer1);
    });

    it('starts broadcasting after max wait even without ready peers', () => {
      manager.startResponse(roomId, peer1);
      manager.addChunk(roomId, createAudioBuffer(), 60);

      expect(manager.getBroadcastState(roomId)).toBe('buffering');

      vi.advanceTimersByTime(500);

      expect(manager.getBroadcastState(roomId)).toBe('broadcasting');
    });

    it('clears wait timer when broadcasting starts', () => {
      manager = new ResponseBroadcastManager(
        { bufferSizeMs: 50, minPeersReady: 0, maxWaitForPeersMs: 500 },
        callbacks
      );
      manager.initRoom(roomId);
      manager.addPeer(roomId, peer1);

      manager.startResponse(roomId, peer1);
      manager.addChunk(roomId, createAudioBuffer(), 60);

      // Broadcasting started
      expect(manager.getBroadcastState(roomId)).toBe('broadcasting');

      vi.clearAllMocks();
      vi.advanceTimersByTime(600);

      // Should not have any additional state changes from timer
      expect(callbacks.onStateChange).not.toHaveBeenCalled();
    });
  });

  describe('Late joiner catch-up', () => {
    beforeEach(() => {
      manager = new ResponseBroadcastManager(
        { bufferSizeMs: 50, minPeersReady: 0, enableLateJoinerCatchUp: true },
        callbacks
      );
      manager.initRoom(roomId);
      manager.addPeer(roomId, peer1);
    });

    it('sends buffered chunks to late joiner', () => {
      manager.startResponse(roomId, peer1);
      manager.addChunk(roomId, createAudioBuffer(), 30);
      manager.addChunk(roomId, createAudioBuffer(), 30);

      // Response is now broadcasting
      expect(manager.isBroadcasting(roomId)).toBe(true);

      vi.clearAllMocks();

      // Late joiner arrives
      manager.addPeer(roomId, peer2);

      expect(callbacks.onPeerCatchUp).toHaveBeenCalledWith(peer2, 2);
      expect(callbacks.onSendToPeer).toHaveBeenCalledTimes(2); // 2 chunks to late joiner
    });

    it('can disable late joiner catch-up', () => {
      manager = new ResponseBroadcastManager(
        { bufferSizeMs: 50, minPeersReady: 0, enableLateJoinerCatchUp: false },
        callbacks
      );
      manager.initRoom(roomId);
      manager.addPeer(roomId, peer1);

      manager.startResponse(roomId, peer1);
      manager.addChunk(roomId, createAudioBuffer(), 60);

      vi.clearAllMocks();

      manager.addPeer(roomId, peer2);

      expect(callbacks.onPeerCatchUp).not.toHaveBeenCalled();
    });

    it('does not catch up during buffering', () => {
      manager.startResponse(roomId, peer1);
      manager.addChunk(roomId, createAudioBuffer(), 10); // Not enough to trigger broadcast

      manager.addPeer(roomId, peer2);

      expect(callbacks.onPeerCatchUp).not.toHaveBeenCalled();
    });
  });

  describe('Response info', () => {
    beforeEach(() => {
      manager.initRoom(roomId);
      manager.addPeer(roomId, peer1);
    });

    it('returns null for non-existent room', () => {
      expect(manager.getCurrentResponse('unknown' as RoomId)).toBeNull();
    });

    it('returns null when no response started', () => {
      expect(manager.getCurrentResponse(roomId)).toBeNull();
    });

    it('returns response info', () => {
      manager.startResponse(roomId, peer1);
      const response = manager.getCurrentResponse(roomId);

      expect(response).not.toBeNull();
      expect(response?.roomId).toBe(roomId);
      expect(response?.triggerPeerId).toBe(peer1);
      expect(response?.state).toBe('buffering');
      expect(response?.responseId).toBeTruthy();
    });

    it('returns idle state when no response', () => {
      expect(manager.getBroadcastState(roomId)).toBe('idle');
    });
  });

  describe('Buffer status', () => {
    beforeEach(() => {
      manager = new ResponseBroadcastManager({ bufferSizeMs: 100 }, callbacks);
      manager.initRoom(roomId);
      manager.addPeer(roomId, peer1);
    });

    it('returns empty status for non-existent room', () => {
      const status = manager.getBufferStatus('unknown' as RoomId);
      expect(status.chunksBuffered).toBe(0);
      expect(status.durationMs).toBe(0);
      expect(status.isFull).toBe(false);
    });

    it('tracks buffer fill status', () => {
      manager.startResponse(roomId, peer1);
      manager.addChunk(roomId, createAudioBuffer(), 40);

      let status = manager.getBufferStatus(roomId);
      expect(status.chunksBuffered).toBe(1);
      expect(status.durationMs).toBe(40);
      expect(status.isFull).toBe(false);

      manager.addChunk(roomId, createAudioBuffer(), 60);

      status = manager.getBufferStatus(roomId);
      expect(status.chunksBuffered).toBe(2);
      expect(status.durationMs).toBe(100);
      expect(status.isFull).toBe(true);
    });
  });

  describe('Synchronized start time', () => {
    beforeEach(() => {
      manager = new ResponseBroadcastManager({ syncOffsetMs: 100 }, callbacks);
      manager.initRoom(roomId);
      manager.addPeer(roomId, peer1);
    });

    it('returns 0 for non-existent room', () => {
      expect(manager.getSyncedStartTime('unknown' as RoomId)).toBe(0);
    });

    it('calculates synced start time', () => {
      const beforeStart = Date.now();
      manager.startResponse(roomId, peer1);

      const syncedTime = manager.getSyncedStartTime(roomId);
      expect(syncedTime).toBeGreaterThan(beforeStart);
    });
  });

  describe('Max buffered chunks', () => {
    it('respects max buffered chunks limit', () => {
      manager = new ResponseBroadcastManager(
        { bufferSizeMs: 10000, maxBufferedChunks: 3, minPeersReady: 100 },
        callbacks
      );
      manager.initRoom(roomId);
      manager.addPeer(roomId, peer1);

      manager.startResponse(roomId, peer1);
      manager.addChunk(roomId, createAudioBuffer(), 20);
      manager.addChunk(roomId, createAudioBuffer(), 20);
      manager.addChunk(roomId, createAudioBuffer(), 20);
      manager.addChunk(roomId, createAudioBuffer(), 20);
      manager.addChunk(roomId, createAudioBuffer(), 20);

      const status = manager.getBufferStatus(roomId);
      expect(status.chunksBuffered).toBe(3); // Max is 3
    });
  });

  describe('Response cancellation clears buffer', () => {
    beforeEach(() => {
      manager = new ResponseBroadcastManager({ bufferSizeMs: 1000 }, callbacks);
      manager.initRoom(roomId);
      manager.addPeer(roomId, peer1);
    });

    it('clears buffer on cancel', () => {
      manager.startResponse(roomId, peer1);
      manager.addChunk(roomId, createAudioBuffer(), 50);
      manager.addChunk(roomId, createAudioBuffer(), 50);

      let status = manager.getBufferStatus(roomId);
      expect(status.chunksBuffered).toBe(2);

      manager.cancelResponse(roomId);

      status = manager.getBufferStatus(roomId);
      expect(status.chunksBuffered).toBe(0);
      expect(status.durationMs).toBe(0);
    });
  });

  describe('Starting new response cancels previous', () => {
    beforeEach(() => {
      manager.initRoom(roomId);
      manager.addPeer(roomId, peer1);
    });

    it('cancels previous response when starting new one', () => {
      manager.startResponse(roomId, peer1);
      const firstResponse = manager.getCurrentResponse(roomId);

      manager.startResponse(roomId, peer2);

      expect(callbacks.onBroadcastCancelled).toHaveBeenCalledWith(
        roomId,
        firstResponse
      );
    });
  });

  describe('Factory function', () => {
    it('creates manager instance', () => {
      const created = createResponseBroadcastManager();
      expect(created).toBeInstanceOf(ResponseBroadcastManager);
      created.dispose();
    });

    it('accepts options and callbacks', () => {
      const created = createResponseBroadcastManager(
        { bufferSizeMs: 500 },
        { onBroadcastStart: vi.fn() }
      );
      expect(created).toBeInstanceOf(ResponseBroadcastManager);
      created.dispose();
    });
  });

  describe('Dispose', () => {
    it('clears all rooms', () => {
      manager.initRoom(roomId);
      manager.initRoom('room-2' as RoomId);
      manager.dispose();

      expect(manager.hasRoom(roomId)).toBe(false);
      expect(manager.hasRoom('room-2' as RoomId)).toBe(false);
    });

    it('clears pending timers', () => {
      manager = new ResponseBroadcastManager(
        { maxWaitForPeersMs: 10000 },
        callbacks
      );
      manager.initRoom(roomId);
      manager.addPeer(roomId, peer1);
      manager.startResponse(roomId, peer1);

      manager.dispose();

      // Should not throw when advancing time
      vi.advanceTimersByTime(15000);
    });
  });

  describe('Integration scenarios', () => {
    it('handles full broadcast cycle', () => {
      manager = new ResponseBroadcastManager(
        { bufferSizeMs: 50, minPeersReady: 0 },
        callbacks
      );
      manager.initRoom(roomId);
      manager.addPeer(roomId, peer1);
      manager.addPeer(roomId, peer2);

      // Start response
      const responseId = manager.startResponse(roomId, peer1);
      expect(responseId).toBeTruthy();
      expect(manager.getBroadcastState(roomId)).toBe('buffering');

      // Add chunks until buffer fills
      manager.addChunk(roomId, createAudioBuffer(), 30);
      manager.addChunk(roomId, createAudioBuffer(), 30);

      // Should be broadcasting now
      expect(manager.getBroadcastState(roomId)).toBe('broadcasting');
      expect(callbacks.onBroadcastStart).toHaveBeenCalled();

      // Add more chunks during broadcast
      manager.addChunk(roomId, createAudioBuffer(), 20);
      manager.addChunk(roomId, createAudioBuffer(), 20, true); // Last chunk

      // Should be complete
      expect(manager.getBroadcastState(roomId)).toBe('completed');
      expect(callbacks.onBroadcastComplete).toHaveBeenCalled();

      const response = manager.getCurrentResponse(roomId);
      expect(response?.totalChunks).toBe(4);
      expect(response?.broadcastedChunks).toBe(4);
    });

    it('handles multiple rooms independently', () => {
      const room1 = 'room-1' as RoomId;
      const room2 = 'room-2' as RoomId;

      manager = new ResponseBroadcastManager(
        { bufferSizeMs: 50, minPeersReady: 0 },
        callbacks
      );

      manager.initRoom(room1);
      manager.initRoom(room2);
      manager.addPeer(room1, peer1);
      manager.addPeer(room2, peer2);

      manager.startResponse(room1, peer1);
      manager.startResponse(room2, peer2);

      manager.addChunk(room1, createAudioBuffer(), 60);

      expect(manager.getBroadcastState(room1)).toBe('broadcasting');
      expect(manager.getBroadcastState(room2)).toBe('buffering');
    });

    it('handles peer join/leave during broadcast', () => {
      manager = new ResponseBroadcastManager(
        { bufferSizeMs: 50, minPeersReady: 0 },
        callbacks
      );
      manager.initRoom(roomId);
      manager.addPeer(roomId, peer1);

      manager.startResponse(roomId, peer1);
      manager.addChunk(roomId, createAudioBuffer(), 60);

      expect(manager.isBroadcasting(roomId)).toBe(true);

      // Add peer during broadcast
      manager.addPeer(roomId, peer2);

      // Add more chunks
      vi.clearAllMocks();
      manager.addChunk(roomId, createAudioBuffer(), 20);

      // New chunk should go to both peers
      expect(callbacks.onSendToPeer).toHaveBeenCalledTimes(2);

      // Remove a peer
      manager.removePeer(roomId, peer1);

      vi.clearAllMocks();
      manager.addChunk(roomId, createAudioBuffer(), 20);

      // Only remaining peer gets chunk
      expect(callbacks.onSendToPeer).toHaveBeenCalledTimes(1);
      expect(callbacks.onSendToPeer).toHaveBeenCalledWith(
        peer2,
        expect.any(Object),
        expect.any(Object)
      );
    });
  });
});
