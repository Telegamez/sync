/**
 * useSharedAI Hook Tests
 *
 * Tests for FEAT-303: useSharedAI hook - Client-side AI integration
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import {
  useSharedAI,
  createSharedAI,
  type UseSharedAIOptions,
  type UseSharedAICallbacks,
  type AIAudioChunk,
  type AIResponseInfo,
} from '@/hooks/useSharedAI';
import type { SignalingClient } from '@/lib/signaling/client';
import type { RoomId } from '@/types/room';
import type { PeerId } from '@/types/peer';
import type { AIStateEvent, RoomAIState } from '@/types/voice-mode';

// Mock AudioContext
class MockAudioContext {
  sampleRate: number;
  state: string = 'running';
  destination = {};

  constructor(options?: { sampleRate?: number }) {
    this.sampleRate = options?.sampleRate ?? 44100;
  }

  createGain() {
    return {
      gain: { value: 1 },
      connect: vi.fn(),
    };
  }

  close() {
    this.state = 'closed';
  }
}

// @ts-expect-error - Mock
global.AudioContext = MockAudioContext;

// Create mock signaling client
function createMockSignalingClient(): SignalingClient & {
  _trigger: (event: string, data: unknown) => void;
  _listeners: Map<string, Set<(data: unknown) => void>>;
} {
  const listeners = new Map<string, Set<(data: unknown) => void>>();

  const client = {
    _listeners: listeners,
    _trigger: (event: string, data: unknown) => {
      const eventListeners = listeners.get(event);
      if (eventListeners) {
        eventListeners.forEach((cb) => cb(data));
      }
    },
    on: vi.fn((event: string, callback: (data: unknown) => void) => {
      if (!listeners.has(event)) {
        listeners.set(event, new Set());
      }
      listeners.get(event)!.add(callback);
    }),
    off: vi.fn((event: string, callback: (data: unknown) => void) => {
      listeners.get(event)?.delete(callback);
    }),
    emit: vi.fn(),
    isConnected: vi.fn(() => true),
  };

  return client as unknown as SignalingClient & {
    _trigger: (event: string, data: unknown) => void;
    _listeners: Map<string, Set<(data: unknown) => void>>;
  };
}

// Helper to create AI state event
function createAIStateEvent(
  roomId: RoomId,
  state: RoomAIState['state'],
  overrides?: Partial<RoomAIState>
): AIStateEvent {
  return {
    type: 'ai:state_changed',
    roomId,
    state: {
      state,
      isSessionHealthy: true,
      activeSpeakerId: null,
      activeSpeakerName: null,
      queue: { queue: [], activeTurn: null },
      lastError: null,
      ...overrides,
    },
  };
}

// Helper to create audio chunk
function createAudioChunk(
  sequenceNumber: number,
  options?: Partial<AIAudioChunk>
): AIAudioChunk {
  return {
    chunkId: `chunk-${sequenceNumber}`,
    sequenceNumber,
    data: new Int16Array(480).buffer,
    receivedAt: Date.now(),
    durationMs: 20,
    isFirst: sequenceNumber === 0,
    isLast: false,
    ...options,
  };
}

// Helper to create response info
function createResponseInfo(
  triggerPeerId: PeerId,
  overrides?: Partial<AIResponseInfo>
): AIResponseInfo {
  return {
    responseId: 'resp-1',
    triggerPeerId,
    syncedStartTime: Date.now() + 200,
    totalChunks: 0,
    totalDurationMs: 0,
    ...overrides,
  };
}

describe('useSharedAI', () => {
  const roomId: RoomId = 'room-test-123' as RoomId;
  const localPeerId: PeerId = 'peer-local' as PeerId;
  const remotePeerId: PeerId = 'peer-remote' as PeerId;
  let mockClient: ReturnType<typeof createMockSignalingClient>;
  let callbacks: UseSharedAICallbacks;

  beforeEach(() => {
    mockClient = createMockSignalingClient();
    callbacks = {
      onAIStateChange: vi.fn(),
      onResponseStart: vi.fn(),
      onResponseEnd: vi.fn(),
      onAudioChunk: vi.fn(),
      onPlaybackStart: vi.fn(),
      onPlaybackEnd: vi.fn(),
      onSessionConnect: vi.fn(),
      onSessionDisconnect: vi.fn(),
      onReconnecting: vi.fn(),
      onError: vi.fn(),
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Initial state', () => {
    it('starts with default state', () => {
      const { result } = renderHook(() => useSharedAI());

      expect(result.current.state.isConnected).toBe(false);
      expect(result.current.state.aiState).toBe('idle');
      expect(result.current.state.isSessionHealthy).toBe(true);
      expect(result.current.state.currentSpeakerId).toBeNull();
      expect(result.current.state.currentSpeakerName).toBeNull();
      expect(result.current.state.isResponding).toBe(false);
      expect(result.current.state.currentResponse).toBeNull();
      expect(result.current.state.lastError).toBeNull();
      expect(result.current.state.reconnectAttempts).toBe(0);
    });

    it('starts with default playback state', () => {
      const { result } = renderHook(() => useSharedAI());

      expect(result.current.playback.isPlaying).toBe(false);
      expect(result.current.playback.playbackPosition).toBe(0);
      expect(result.current.playback.bufferedDuration).toBe(0);
      expect(result.current.playback.chunksBuffered).toBe(0);
      expect(result.current.playback.isReady).toBe(false);
    });
  });

  describe('Session connection', () => {
    it('connects to session when signaling client is connected', () => {
      const { result } = renderHook(() =>
        useSharedAI({ signalingClient: mockClient, roomId, localPeerId }, callbacks)
      );

      expect(result.current.state.isConnected).toBe(true);
      expect(callbacks.onSessionConnect).toHaveBeenCalled();
    });

    it('subscribes to signaling events', () => {
      renderHook(() =>
        useSharedAI({ signalingClient: mockClient, roomId, localPeerId }, callbacks)
      );

      expect(mockClient.on).toHaveBeenCalledWith('ai:state', expect.any(Function));
      expect(mockClient.on).toHaveBeenCalledWith('ai:audio', expect.any(Function));
      expect(mockClient.on).toHaveBeenCalledWith('connect', expect.any(Function));
      expect(mockClient.on).toHaveBeenCalledWith('disconnect', expect.any(Function));
    });

    it('unsubscribes on unmount', () => {
      const { unmount } = renderHook(() =>
        useSharedAI({ signalingClient: mockClient, roomId, localPeerId }, callbacks)
      );

      unmount();

      expect(mockClient.off).toHaveBeenCalledWith('ai:state', expect.any(Function));
      expect(mockClient.off).toHaveBeenCalledWith('ai:audio', expect.any(Function));
    });

    it('handles disconnect event', () => {
      const { result } = renderHook(() =>
        useSharedAI({ signalingClient: mockClient, roomId, localPeerId }, callbacks)
      );

      expect(result.current.state.isConnected).toBe(true);

      act(() => {
        mockClient._trigger('disconnect', {});
      });

      expect(result.current.state.isConnected).toBe(false);
      expect(callbacks.onSessionDisconnect).toHaveBeenCalled();
    });

    it('handles connect event', () => {
      (mockClient.isConnected as ReturnType<typeof vi.fn>).mockReturnValue(false);

      const { result } = renderHook(() =>
        useSharedAI({ signalingClient: mockClient, roomId, localPeerId }, callbacks)
      );

      expect(result.current.state.isConnected).toBe(false);

      act(() => {
        mockClient._trigger('connect', {});
      });

      expect(result.current.state.isConnected).toBe(true);
    });
  });

  describe('AI state events', () => {
    it('updates AI state from event', () => {
      const { result } = renderHook(() =>
        useSharedAI({ signalingClient: mockClient, roomId, localPeerId }, callbacks)
      );

      act(() => {
        mockClient._trigger('ai:state', createAIStateEvent(roomId, 'listening'));
      });

      expect(result.current.state.aiState).toBe('listening');
    });

    it('ignores events from other rooms', () => {
      const { result } = renderHook(() =>
        useSharedAI({ signalingClient: mockClient, roomId, localPeerId }, callbacks)
      );

      act(() => {
        mockClient._trigger('ai:state', createAIStateEvent('other-room' as RoomId, 'speaking'));
      });

      expect(result.current.state.aiState).toBe('idle');
    });

    it('fires onAIStateChange callback', () => {
      renderHook(() =>
        useSharedAI({ signalingClient: mockClient, roomId, localPeerId }, callbacks)
      );

      act(() => {
        mockClient._trigger('ai:state', createAIStateEvent(roomId, 'listening'));
      });

      expect(callbacks.onAIStateChange).toHaveBeenCalledWith('listening', 'idle');
    });

    it('updates current speaker info', () => {
      const { result } = renderHook(() =>
        useSharedAI({ signalingClient: mockClient, roomId, localPeerId }, callbacks)
      );

      act(() => {
        mockClient._trigger(
          'ai:state',
          createAIStateEvent(roomId, 'listening', {
            activeSpeakerId: remotePeerId,
            activeSpeakerName: 'Alice',
          })
        );
      });

      expect(result.current.state.currentSpeakerId).toBe(remotePeerId);
      expect(result.current.state.currentSpeakerName).toBe('Alice');
    });

    it('updates session health', () => {
      const { result } = renderHook(() =>
        useSharedAI({ signalingClient: mockClient, roomId, localPeerId }, callbacks)
      );

      act(() => {
        mockClient._trigger(
          'ai:state',
          createAIStateEvent(roomId, 'idle', { isSessionHealthy: false })
        );
      });

      expect(result.current.state.isSessionHealthy).toBe(false);
    });

    it('handles error events', () => {
      const { result } = renderHook(() =>
        useSharedAI({ signalingClient: mockClient, roomId, localPeerId }, callbacks)
      );

      act(() => {
        mockClient._trigger('ai:state', {
          type: 'ai:error',
          roomId,
          state: {
            state: 'idle',
            isSessionHealthy: false,
            activeSpeakerId: null,
            activeSpeakerName: null,
            queue: { queue: [], activeTurn: null },
            lastError: 'Connection failed',
          },
        });
      });

      expect(result.current.state.lastError).toBe('Connection failed');
      expect(callbacks.onError).toHaveBeenCalledWith('Connection failed');
    });
  });

  describe('Audio chunk handling', () => {
    it('receives audio chunks', () => {
      const { result } = renderHook(() =>
        useSharedAI({ signalingClient: mockClient, roomId, localPeerId }, callbacks)
      );

      const chunk = createAudioChunk(0, { isFirst: true });
      const response = createResponseInfo(remotePeerId);

      act(() => {
        mockClient._trigger('ai:audio', { roomId, chunk, response });
      });

      expect(callbacks.onAudioChunk).toHaveBeenCalledWith(chunk);
      expect(result.current.playback.chunksBuffered).toBe(1);
    });

    it('handles first chunk with response start', () => {
      renderHook(() =>
        useSharedAI({ signalingClient: mockClient, roomId, localPeerId }, callbacks)
      );

      const chunk = createAudioChunk(0, { isFirst: true });
      const response = createResponseInfo(remotePeerId);

      act(() => {
        mockClient._trigger('ai:audio', { roomId, chunk, response });
      });

      expect(callbacks.onResponseStart).toHaveBeenCalledWith(response);
    });

    it('handles last chunk with response end', () => {
      renderHook(() =>
        useSharedAI({ signalingClient: mockClient, roomId, localPeerId }, callbacks)
      );

      const chunk = createAudioChunk(5, { isLast: true });
      const response = createResponseInfo(remotePeerId);

      act(() => {
        mockClient._trigger('ai:audio', { roomId, chunk, response });
      });

      expect(callbacks.onResponseEnd).toHaveBeenCalledWith(response);
    });

    it('tracks buffered duration', () => {
      const { result } = renderHook(() =>
        useSharedAI({ signalingClient: mockClient, roomId, localPeerId }, callbacks)
      );

      const response = createResponseInfo(remotePeerId);

      act(() => {
        mockClient._trigger('ai:audio', {
          roomId,
          chunk: createAudioChunk(0, { durationMs: 20, isFirst: true }),
          response,
        });
        mockClient._trigger('ai:audio', {
          roomId,
          chunk: createAudioChunk(1, { durationMs: 20 }),
          response,
        });
        mockClient._trigger('ai:audio', {
          roomId,
          chunk: createAudioChunk(2, { durationMs: 20 }),
          response,
        });
      });

      expect(result.current.playback.bufferedDuration).toBe(60);
      expect(result.current.playback.chunksBuffered).toBe(3);
    });

    it('becomes ready when buffer is full', () => {
      const { result } = renderHook(() =>
        useSharedAI(
          { signalingClient: mockClient, roomId, localPeerId, playbackBufferMs: 50 },
          callbacks
        )
      );

      const response = createResponseInfo(remotePeerId);

      act(() => {
        mockClient._trigger('ai:audio', {
          roomId,
          chunk: createAudioChunk(0, { durationMs: 30, isFirst: true }),
          response,
        });
      });

      expect(result.current.playback.isReady).toBe(false);

      act(() => {
        mockClient._trigger('ai:audio', {
          roomId,
          chunk: createAudioChunk(1, { durationMs: 30 }),
          response,
        });
      });

      expect(result.current.playback.isReady).toBe(true);
    });

    it('ignores audio from other rooms', () => {
      const { result } = renderHook(() =>
        useSharedAI({ signalingClient: mockClient, roomId, localPeerId }, callbacks)
      );

      act(() => {
        mockClient._trigger('ai:audio', {
          roomId: 'other-room',
          chunk: createAudioChunk(0),
          response: createResponseInfo(remotePeerId),
        });
      });

      expect(result.current.playback.chunksBuffered).toBe(0);
      expect(callbacks.onAudioChunk).not.toHaveBeenCalled();
    });
  });

  describe('Playback controls', () => {
    it('starts playback', () => {
      const { result } = renderHook(() =>
        useSharedAI({ signalingClient: mockClient, roomId, localPeerId }, callbacks)
      );

      act(() => {
        result.current.startPlayback();
      });

      expect(result.current.playback.isPlaying).toBe(true);
      expect(callbacks.onPlaybackStart).toHaveBeenCalled();
    });

    it('stops playback', () => {
      const { result } = renderHook(() =>
        useSharedAI({ signalingClient: mockClient, roomId, localPeerId }, callbacks)
      );

      act(() => {
        result.current.startPlayback();
      });

      act(() => {
        result.current.stopPlayback();
      });

      expect(result.current.playback.isPlaying).toBe(false);
      expect(callbacks.onPlaybackEnd).toHaveBeenCalled();
    });

    it('pauses and resumes playback', () => {
      const { result } = renderHook(() =>
        useSharedAI({ signalingClient: mockClient, roomId, localPeerId }, callbacks)
      );

      act(() => {
        result.current.startPlayback();
      });

      expect(result.current.playback.isPlaying).toBe(true);

      act(() => {
        result.current.pausePlayback();
      });

      expect(result.current.playback.isPlaying).toBe(false);

      act(() => {
        result.current.resumePlayback();
      });

      expect(result.current.playback.isPlaying).toBe(true);
    });

    it('clears buffer', () => {
      const { result } = renderHook(() =>
        useSharedAI({ signalingClient: mockClient, roomId, localPeerId }, callbacks)
      );

      const response = createResponseInfo(remotePeerId);

      act(() => {
        mockClient._trigger('ai:audio', {
          roomId,
          chunk: createAudioChunk(0, { isFirst: true }),
          response,
        });
        mockClient._trigger('ai:audio', {
          roomId,
          chunk: createAudioChunk(1),
          response,
        });
      });

      expect(result.current.playback.chunksBuffered).toBe(2);

      act(() => {
        result.current.clearBuffer();
      });

      expect(result.current.playback.chunksBuffered).toBe(0);
      expect(result.current.playback.bufferedDuration).toBe(0);
    });
  });

  describe('Volume controls', () => {
    it('sets volume', () => {
      const { result } = renderHook(() =>
        useSharedAI({ signalingClient: mockClient, roomId, localPeerId }, callbacks)
      );

      act(() => {
        result.current.setVolume(0.5);
      });

      expect(result.current.getVolume()).toBe(0.5);
    });

    it('clamps volume to 0-1', () => {
      const { result } = renderHook(() =>
        useSharedAI({ signalingClient: mockClient, roomId, localPeerId }, callbacks)
      );

      act(() => {
        result.current.setVolume(-0.5);
      });

      expect(result.current.getVolume()).toBe(0);

      act(() => {
        result.current.setVolume(1.5);
      });

      expect(result.current.getVolume()).toBe(1);
    });

    it('mutes and unmutes', () => {
      const { result } = renderHook(() =>
        useSharedAI({ signalingClient: mockClient, roomId, localPeerId }, callbacks)
      );

      act(() => {
        result.current.setVolume(0.7);
      });

      act(() => {
        result.current.mute();
      });

      // Volume getter still returns the set volume
      expect(result.current.getVolume()).toBe(0.7);

      act(() => {
        result.current.unmute();
      });

      expect(result.current.getVolume()).toBe(0.7);
    });
  });

  describe('Mark ready', () => {
    it('emits ready event to signaling', () => {
      const { result } = renderHook(() =>
        useSharedAI({ signalingClient: mockClient, roomId, localPeerId }, callbacks)
      );

      act(() => {
        result.current.markReady();
      });

      expect(mockClient.emit).toHaveBeenCalledWith('ai:ready', {
        roomId,
        peerId: localPeerId,
      });
    });

    it('does nothing without signaling client', () => {
      const { result } = renderHook(() => useSharedAI({}, callbacks));

      act(() => {
        result.current.markReady();
      });

      expect(mockClient.emit).not.toHaveBeenCalled();
    });
  });

  describe('Reconnection', () => {
    it('emits reconnect event', async () => {
      const { result } = renderHook(() =>
        useSharedAI({ signalingClient: mockClient, roomId, localPeerId }, callbacks)
      );

      await act(async () => {
        await result.current.reconnect();
      });

      expect(mockClient.emit).toHaveBeenCalledWith('ai:reconnect', { roomId });
      expect(callbacks.onReconnecting).toHaveBeenCalledWith(1);
    });

    it('tracks reconnect attempts', async () => {
      const { result } = renderHook(() =>
        useSharedAI({ signalingClient: mockClient, roomId, localPeerId }, callbacks)
      );

      await act(async () => {
        await result.current.reconnect();
      });

      expect(result.current.state.reconnectAttempts).toBe(1);

      await act(async () => {
        await result.current.reconnect();
      });

      expect(result.current.state.reconnectAttempts).toBe(2);
    });

    it('resets reconnect attempts on connect', async () => {
      const { result } = renderHook(() =>
        useSharedAI({ signalingClient: mockClient, roomId, localPeerId }, callbacks)
      );

      await act(async () => {
        await result.current.reconnect();
        await result.current.reconnect();
      });

      expect(result.current.state.reconnectAttempts).toBe(2);

      act(() => {
        mockClient._trigger('connect', {});
      });

      expect(result.current.state.reconnectAttempts).toBe(0);
    });
  });

  describe('Response state', () => {
    it('updates isResponding on speaking state', () => {
      const { result } = renderHook(() =>
        useSharedAI({ signalingClient: mockClient, roomId, localPeerId }, callbacks)
      );

      act(() => {
        mockClient._trigger('ai:state', createAIStateEvent(roomId, 'speaking'));
      });

      expect(result.current.state.isResponding).toBe(true);
    });

    it('clears isResponding on other states', () => {
      const { result } = renderHook(() =>
        useSharedAI({ signalingClient: mockClient, roomId, localPeerId }, callbacks)
      );

      act(() => {
        mockClient._trigger('ai:state', createAIStateEvent(roomId, 'speaking'));
      });

      expect(result.current.state.isResponding).toBe(true);

      act(() => {
        mockClient._trigger('ai:state', createAIStateEvent(roomId, 'idle'));
      });

      expect(result.current.state.isResponding).toBe(false);
    });

    it('tracks current response info', () => {
      const { result } = renderHook(() =>
        useSharedAI({ signalingClient: mockClient, roomId, localPeerId }, callbacks)
      );

      const response = createResponseInfo(remotePeerId);

      act(() => {
        mockClient._trigger('ai:audio', {
          roomId,
          chunk: createAudioChunk(0, { isFirst: true }),
          response,
        });
      });

      expect(result.current.state.currentResponse).toEqual(response);
    });

    it('clears response on end', () => {
      const { result } = renderHook(() =>
        useSharedAI({ signalingClient: mockClient, roomId, localPeerId }, callbacks)
      );

      const response = createResponseInfo(remotePeerId);

      act(() => {
        mockClient._trigger('ai:audio', {
          roomId,
          chunk: createAudioChunk(0, { isFirst: true }),
          response,
        });
      });

      expect(result.current.state.currentResponse).not.toBeNull();

      act(() => {
        mockClient._trigger('ai:audio', {
          roomId,
          chunk: createAudioChunk(1, { isLast: true }),
          response,
        });
      });

      expect(result.current.state.currentResponse).toBeNull();
    });
  });

  describe('Factory function', () => {
    it('creates hook with options', () => {
      const useCustomSharedAI = createSharedAI(
        { signalingClient: mockClient, roomId, localPeerId },
        callbacks
      );

      const { result } = renderHook(() => useCustomSharedAI());

      expect(result.current.state.isConnected).toBe(true);
    });
  });

  describe('Cleanup', () => {
    it('closes audio context on unmount', () => {
      const { result, unmount } = renderHook(() =>
        useSharedAI({ signalingClient: mockClient, roomId, localPeerId }, callbacks)
      );

      // Initialize audio context by starting playback
      act(() => {
        result.current.startPlayback();
      });

      unmount();

      // Should not throw and audio context should be cleaned up
    });
  });
});
