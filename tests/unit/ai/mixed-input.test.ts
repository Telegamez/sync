/**
 * Mixed Audio Input Manager Tests
 *
 * Tests for FEAT-301: Mixed audio input to AI
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  MixedAudioInputManager,
  createMixedAudioInputManager,
  type MixedAudioInputOptions,
  type MixedAudioInputCallbacks,
  type AudioChunk,
  type VADState,
} from '@/server/signaling/mixed-audio-input';
import type { RoomId } from '@/types/room';

// Helper to create PCM16 audio buffer with specific energy level
function createPCM16Buffer(
  durationMs: number,
  sampleRate: number,
  amplitude: number = 0.5
): ArrayBuffer {
  const numSamples = Math.floor((durationMs / 1000) * sampleRate);
  const buffer = new Int16Array(numSamples);
  const maxInt16 = 32767;

  // Generate simple sine wave
  const frequency = 440; // A4 note
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const sample = Math.sin(2 * Math.PI * frequency * t) * amplitude * maxInt16;
    buffer[i] = Math.round(sample);
  }

  return buffer.buffer;
}

// Helper to create silent buffer
function createSilentBuffer(durationMs: number, sampleRate: number): ArrayBuffer {
  const numSamples = Math.floor((durationMs / 1000) * sampleRate);
  return new Int16Array(numSamples).buffer;
}

// Helper to create stereo buffer
function createStereoBuffer(
  durationMs: number,
  sampleRate: number,
  amplitude: number = 0.5
): ArrayBuffer {
  const numSamples = Math.floor((durationMs / 1000) * sampleRate) * 2;
  const buffer = new Int16Array(numSamples);
  const maxInt16 = 32767;
  const frequency = 440;

  for (let i = 0; i < numSamples / 2; i++) {
    const t = i / sampleRate;
    const sample = Math.sin(2 * Math.PI * frequency * t) * amplitude * maxInt16;
    buffer[i * 2] = Math.round(sample); // Left
    buffer[i * 2 + 1] = Math.round(sample * 0.8); // Right (slightly quieter)
  }

  return buffer.buffer;
}

describe('MixedAudioInputManager', () => {
  const roomId: RoomId = 'room-test-123' as RoomId;
  let manager: MixedAudioInputManager;
  let callbacks: MixedAudioInputCallbacks;

  beforeEach(() => {
    callbacks = {
      onAudioReady: vi.fn(),
      onSpeechStart: vi.fn(),
      onSpeechEnd: vi.fn(),
      onRoomEmpty: vi.fn(),
      onRoomOccupied: vi.fn(),
      onError: vi.fn(),
    };
    manager = new MixedAudioInputManager({}, callbacks);
  });

  afterEach(() => {
    manager.dispose();
    vi.clearAllMocks();
  });

  describe('Room initialization', () => {
    it('initializes a room', () => {
      manager.initRoom(roomId);
      expect(manager.hasRoom(roomId)).toBe(true);
    });

    it('does not reinitialize existing room', () => {
      manager.initRoom(roomId);
      manager.setPeerCount(roomId, 5);
      manager.initRoom(roomId); // Should not reset
      expect(manager.getPeerCount(roomId)).toBe(5);
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

  describe('Peer count tracking', () => {
    beforeEach(() => {
      manager.initRoom(roomId);
    });

    it('sets and gets peer count', () => {
      manager.setPeerCount(roomId, 3);
      expect(manager.getPeerCount(roomId)).toBe(3);
    });

    it('returns 0 for non-existent room', () => {
      expect(manager.getPeerCount('non-existent' as RoomId)).toBe(0);
    });

    it('detects empty room state', () => {
      manager.setPeerCount(roomId, 0);
      expect(manager.isRoomEmpty(roomId)).toBe(true);
    });

    it('detects occupied room state', () => {
      manager.setPeerCount(roomId, 1);
      expect(manager.isRoomEmpty(roomId)).toBe(false);
    });

    it('fires onRoomEmpty when room becomes empty', () => {
      manager.setPeerCount(roomId, 2);
      manager.setPeerCount(roomId, 0);
      expect(callbacks.onRoomEmpty).toHaveBeenCalledWith(roomId);
    });

    it('fires onRoomOccupied when room gets first peer', () => {
      manager.setPeerCount(roomId, 0);
      manager.setPeerCount(roomId, 1);
      expect(callbacks.onRoomOccupied).toHaveBeenCalledWith(roomId);
    });

    it('does not fire events when peer count changes but state does not', () => {
      manager.setPeerCount(roomId, 2);
      vi.clearAllMocks();
      manager.setPeerCount(roomId, 3);
      expect(callbacks.onRoomEmpty).not.toHaveBeenCalled();
      expect(callbacks.onRoomOccupied).not.toHaveBeenCalled();
    });
  });

  describe('Audio processing', () => {
    beforeEach(() => {
      manager.initRoom(roomId);
      manager.setPeerCount(roomId, 2);
    });

    it('skips processing for empty room', () => {
      manager.setPeerCount(roomId, 0);
      const audio = createPCM16Buffer(20, 48000, 0.5);
      manager.processAudio(roomId, audio, 48000);
      expect(callbacks.onAudioReady).not.toHaveBeenCalled();
    });

    it('errors for non-initialized room', () => {
      const audio = createPCM16Buffer(20, 48000, 0.5);
      manager.processAudio('unknown' as RoomId, audio, 48000);
      expect(callbacks.onError).toHaveBeenCalledWith(
        'unknown',
        'Room not initialized'
      );
    });

    it('processes mono audio', () => {
      const manager2 = new MixedAudioInputManager({ enableVAD: false }, callbacks);
      manager2.initRoom(roomId);
      manager2.setPeerCount(roomId, 1);

      const audio = createPCM16Buffer(20, 24000, 0.5);
      manager2.processAudio(roomId, audio, 24000, 1);

      expect(callbacks.onAudioReady).toHaveBeenCalled();
      const chunk = (callbacks.onAudioReady as ReturnType<typeof vi.fn>).mock.calls[0][1] as AudioChunk;
      expect(chunk.channels).toBe(1);
      expect(chunk.sampleRate).toBe(24000);
      manager2.dispose();
    });

    it('downmixes stereo to mono', () => {
      const manager2 = new MixedAudioInputManager({ enableVAD: false }, callbacks);
      manager2.initRoom(roomId);
      manager2.setPeerCount(roomId, 1);

      const audio = createStereoBuffer(20, 24000, 0.5);
      manager2.processAudio(roomId, audio, 24000, 2);

      expect(callbacks.onAudioReady).toHaveBeenCalled();
      const chunk = (callbacks.onAudioReady as ReturnType<typeof vi.fn>).mock.calls[0][1] as AudioChunk;
      expect(chunk.channels).toBe(1);
      manager2.dispose();
    });

    it('resamples audio to target sample rate', () => {
      const manager2 = new MixedAudioInputManager(
        { targetSampleRate: 24000, enableVAD: false },
        callbacks
      );
      manager2.initRoom(roomId);
      manager2.setPeerCount(roomId, 1);

      const audio = createPCM16Buffer(20, 48000, 0.5);
      manager2.processAudio(roomId, audio, 48000, 1);

      expect(callbacks.onAudioReady).toHaveBeenCalled();
      const chunk = (callbacks.onAudioReady as ReturnType<typeof vi.fn>).mock.calls[0][1] as AudioChunk;
      expect(chunk.sampleRate).toBe(24000);
      manager2.dispose();
    });

    it('includes timestamp in audio chunks', () => {
      const manager2 = new MixedAudioInputManager({ enableVAD: false }, callbacks);
      manager2.initRoom(roomId);
      manager2.setPeerCount(roomId, 1);

      const before = Date.now();
      const audio = createPCM16Buffer(20, 24000, 0.5);
      manager2.processAudio(roomId, audio, 24000, 1);
      const after = Date.now();

      const chunk = (callbacks.onAudioReady as ReturnType<typeof vi.fn>).mock.calls[0][1] as AudioChunk;
      expect(chunk.timestamp).toBeGreaterThanOrEqual(before);
      expect(chunk.timestamp).toBeLessThanOrEqual(after);
      manager2.dispose();
    });
  });

  describe('VAD (Voice Activity Detection)', () => {
    beforeEach(() => {
      manager.initRoom(roomId);
      manager.setPeerCount(roomId, 2);
    });

    it('starts with silence state', () => {
      expect(manager.getVADState(roomId)).toBe('silence');
    });

    it('returns unknown for non-existent room', () => {
      expect(manager.getVADState('unknown' as RoomId)).toBe('unknown');
    });

    it('detects speech with high energy audio', () => {
      const audio = createPCM16Buffer(20, 24000, 0.8);
      manager.processAudio(roomId, audio, 24000);
      expect(manager.getVADState(roomId)).toBe('speech');
    });

    it('detects silence with low energy audio', () => {
      const audio = createSilentBuffer(20, 24000);
      manager.processAudio(roomId, audio, 24000);
      expect(manager.getVADState(roomId)).toBe('silence');
    });

    it('fires onSpeechStart when speech begins', () => {
      const audio = createPCM16Buffer(20, 24000, 0.8);
      manager.processAudio(roomId, audio, 24000);
      expect(callbacks.onSpeechStart).toHaveBeenCalledWith(roomId);
    });

    it('fires onSpeechEnd after silence duration', () => {
      // Create manager with short silence duration
      const fastManager = new MixedAudioInputManager(
        { silenceDurationMs: 50 },
        callbacks
      );
      fastManager.initRoom(roomId);
      fastManager.setPeerCount(roomId, 1);

      // Start speech
      const loudAudio = createPCM16Buffer(20, 24000, 0.8);
      fastManager.processAudio(roomId, loudAudio, 24000);
      expect(callbacks.onSpeechStart).toHaveBeenCalled();

      // Simulate silence for longer than silenceDurationMs
      vi.useFakeTimers();
      vi.advanceTimersByTime(100);

      const silentAudio = createSilentBuffer(20, 24000);
      fastManager.processAudio(roomId, silentAudio, 24000);
      expect(callbacks.onSpeechEnd).toHaveBeenCalledWith(roomId);

      vi.useRealTimers();
      fastManager.dispose();
    });

    it('reports speech active during speech', () => {
      const audio = createPCM16Buffer(20, 24000, 0.8);
      manager.processAudio(roomId, audio, 24000);
      expect(manager.isSpeechActive(roomId)).toBe(true);
    });

    it('reports speech inactive during silence', () => {
      expect(manager.isSpeechActive(roomId)).toBe(false);
    });
  });

  describe('Manual speech control', () => {
    beforeEach(() => {
      manager.initRoom(roomId);
      manager.setPeerCount(roomId, 2);
    });

    it('force starts speech', () => {
      manager.forceStartSpeech(roomId);
      expect(manager.getVADState(roomId)).toBe('speech');
      expect(callbacks.onSpeechStart).toHaveBeenCalledWith(roomId);
    });

    it('force ends speech', () => {
      manager.forceStartSpeech(roomId);
      vi.clearAllMocks();
      manager.forceEndSpeech(roomId);
      expect(manager.getVADState(roomId)).toBe('silence');
      expect(callbacks.onSpeechEnd).toHaveBeenCalledWith(roomId);
    });

    it('does not fire events if already in target state', () => {
      manager.forceEndSpeech(roomId); // Already in silence
      expect(callbacks.onSpeechEnd).not.toHaveBeenCalled();

      manager.forceStartSpeech(roomId);
      vi.clearAllMocks();
      manager.forceStartSpeech(roomId); // Already in speech
      expect(callbacks.onSpeechStart).not.toHaveBeenCalled();
    });

    it('does nothing for non-existent room', () => {
      manager.forceStartSpeech('unknown' as RoomId);
      manager.forceEndSpeech('unknown' as RoomId);
      expect(callbacks.onSpeechStart).not.toHaveBeenCalled();
      expect(callbacks.onSpeechEnd).not.toHaveBeenCalled();
    });
  });

  describe('Prefix buffer', () => {
    it('maintains prefix buffer during silence', () => {
      const fastManager = new MixedAudioInputManager(
        { prefixPaddingMs: 100, silenceDurationMs: 10 },
        callbacks
      );
      fastManager.initRoom(roomId);
      fastManager.setPeerCount(roomId, 1);

      // Send silent audio (fills prefix buffer)
      const silent1 = createSilentBuffer(30, 24000);
      const silent2 = createSilentBuffer(30, 24000);
      fastManager.processAudio(roomId, silent1, 24000);
      fastManager.processAudio(roomId, silent2, 24000);

      // Start speech - should also send prefix buffer
      const loud = createPCM16Buffer(20, 24000, 0.8);
      fastManager.processAudio(roomId, loud, 24000);

      // Should have sent prefix chunks + current chunk
      expect(callbacks.onAudioReady).toHaveBeenCalledTimes(3);
      fastManager.dispose();
    });

    it('clears prefix buffer on demand', () => {
      manager.initRoom(roomId);
      manager.clearPrefixBuffer(roomId);
      // Should not throw
    });
  });

  describe('Audio statistics', () => {
    beforeEach(() => {
      manager.initRoom(roomId);
      manager.setPeerCount(roomId, 2);
    });

    it('returns null for non-existent room', () => {
      expect(manager.getStats('unknown' as RoomId)).toBeNull();
    });

    it('returns stats for initialized room', () => {
      const stats = manager.getStats(roomId);
      expect(stats).not.toBeNull();
      expect(stats!.vadState).toBe('silence');
      expect(stats!.peerCount).toBe(2);
      expect(stats!.speechDurationMs).toBe(0);
      expect(stats!.averageEnergy).toBe(0);
    });

    it('tracks speech duration', () => {
      vi.useFakeTimers();

      manager.forceStartSpeech(roomId);
      vi.advanceTimersByTime(500);

      const stats = manager.getStats(roomId);
      expect(stats!.speechDurationMs).toBeGreaterThanOrEqual(500);

      vi.useRealTimers();
    });

    it('accumulates energy statistics', () => {
      const audio = createPCM16Buffer(20, 24000, 0.5);
      manager.processAudio(roomId, audio, 24000);

      const stats = manager.getStats(roomId);
      expect(stats!.averageEnergy).toBeGreaterThan(0);
    });
  });

  describe('Configuration options', () => {
    it('uses custom target sample rate', () => {
      const customManager = new MixedAudioInputManager(
        { targetSampleRate: 16000, enableVAD: false },
        callbacks
      );
      customManager.initRoom(roomId);
      customManager.setPeerCount(roomId, 1);

      const audio = createPCM16Buffer(20, 48000, 0.5);
      customManager.processAudio(roomId, audio, 48000);

      const chunk = (callbacks.onAudioReady as ReturnType<typeof vi.fn>).mock.calls[0][1] as AudioChunk;
      expect(chunk.sampleRate).toBe(16000);
      customManager.dispose();
    });

    it('can disable VAD', () => {
      const noVadManager = new MixedAudioInputManager(
        { enableVAD: false },
        callbacks
      );
      noVadManager.initRoom(roomId);
      noVadManager.setPeerCount(roomId, 1);

      // Silent audio should still be sent without VAD
      const silent = createSilentBuffer(20, 24000);
      noVadManager.processAudio(roomId, silent, 24000);

      expect(callbacks.onAudioReady).toHaveBeenCalled();
      expect(callbacks.onSpeechStart).not.toHaveBeenCalled();
      noVadManager.dispose();
    });

    it('can disable audio optimization', () => {
      const noOptManager = new MixedAudioInputManager(
        { enableOptimization: false, enableVAD: false },
        callbacks
      );
      noOptManager.initRoom(roomId);
      noOptManager.setPeerCount(roomId, 1);

      const audio = createPCM16Buffer(20, 24000, 0.3);
      noOptManager.processAudio(roomId, audio, 24000);

      expect(callbacks.onAudioReady).toHaveBeenCalled();
      noOptManager.dispose();
    });

    it('respects custom VAD thresholds', () => {
      // Very high threshold - even loud audio should not trigger
      const highThreshold = new MixedAudioInputManager(
        { vadEnergyThreshold: 0.99, vadSpeechThreshold: 0.99 },
        callbacks
      );
      highThreshold.initRoom(roomId);
      highThreshold.setPeerCount(roomId, 1);

      const audio = createPCM16Buffer(20, 24000, 0.5);
      highThreshold.processAudio(roomId, audio, 24000);

      expect(highThreshold.getVADState(roomId)).toBe('silence');
      highThreshold.dispose();
    });
  });

  describe('Factory function', () => {
    it('creates manager instance', () => {
      const created = createMixedAudioInputManager();
      expect(created).toBeInstanceOf(MixedAudioInputManager);
      created.dispose();
    });

    it('accepts options and callbacks', () => {
      const created = createMixedAudioInputManager(
        { targetSampleRate: 16000 },
        { onAudioReady: vi.fn() }
      );
      expect(created).toBeInstanceOf(MixedAudioInputManager);
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
  });

  describe('Integration scenarios', () => {
    it('handles full speech cycle', () => {
      const integrationManager = new MixedAudioInputManager(
        { silenceDurationMs: 50, prefixPaddingMs: 40 },
        callbacks
      );
      integrationManager.initRoom(roomId);
      integrationManager.setPeerCount(roomId, 2);

      vi.useFakeTimers();

      // Initial silence (builds prefix buffer)
      const silent1 = createSilentBuffer(20, 24000);
      integrationManager.processAudio(roomId, silent1, 24000);
      expect(callbacks.onSpeechStart).not.toHaveBeenCalled();

      // Speech begins
      const loud1 = createPCM16Buffer(20, 24000, 0.8);
      integrationManager.processAudio(roomId, loud1, 24000);
      expect(callbacks.onSpeechStart).toHaveBeenCalledTimes(1);

      // More speech
      const loud2 = createPCM16Buffer(20, 24000, 0.7);
      integrationManager.processAudio(roomId, loud2, 24000);

      // Silence begins
      vi.advanceTimersByTime(100);
      const silent2 = createSilentBuffer(20, 24000);
      integrationManager.processAudio(roomId, silent2, 24000);
      expect(callbacks.onSpeechEnd).toHaveBeenCalledTimes(1);

      vi.useRealTimers();
      integrationManager.dispose();
    });

    it('handles peer join/leave during speech', () => {
      manager.initRoom(roomId);
      manager.setPeerCount(roomId, 2);

      // Start speech
      const loud = createPCM16Buffer(20, 24000, 0.8);
      manager.processAudio(roomId, loud, 24000);
      expect(manager.isSpeechActive(roomId)).toBe(true);

      // Peer leaves (but still has peers)
      manager.setPeerCount(roomId, 1);
      expect(manager.isSpeechActive(roomId)).toBe(true);

      // All peers leave
      manager.setPeerCount(roomId, 0);
      expect(callbacks.onRoomEmpty).toHaveBeenCalled();
    });

    it('handles multiple rooms independently', () => {
      const room1 = 'room-1' as RoomId;
      const room2 = 'room-2' as RoomId;

      manager.initRoom(room1);
      manager.initRoom(room2);
      manager.setPeerCount(room1, 1);
      manager.setPeerCount(room2, 1);

      // Room 1 has speech
      const loud = createPCM16Buffer(20, 24000, 0.8);
      manager.processAudio(room1, loud, 24000);

      // Room 2 is silent
      const silent = createSilentBuffer(20, 24000);
      manager.processAudio(room2, silent, 24000);

      expect(manager.getVADState(room1)).toBe('speech');
      expect(manager.getVADState(room2)).toBe('silence');
    });
  });
});
