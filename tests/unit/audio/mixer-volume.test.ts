/**
 * Audio Mixer Volume Control Tests
 *
 * Tests for per-peer volume control and normalization.
 *
 * Part of the Long-Horizon Engineering Protocol - FEAT-201
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AudioMixer, createAudioMixer } from '@/lib/audio/mixer';

// Mock GainNode
class MockGainNode {
  gain = { value: 1 };
  connect = vi.fn();
  disconnect = vi.fn();
}

// Mock MediaStreamAudioSourceNode
class MockMediaStreamAudioSourceNode {
  connect = vi.fn();
  disconnect = vi.fn();
}

// Mock MediaStreamAudioDestinationNode
class MockMediaStreamAudioDestinationNode {
  stream = { id: 'mock-destination-stream' } as unknown as MediaStream;
}

// Mock AudioContext
class MockAudioContext {
  state: AudioContextState = 'running';
  sampleRate = 48000;

  createGain = vi.fn(() => new MockGainNode());
  createMediaStreamSource = vi.fn(() => new MockMediaStreamAudioSourceNode());
  createMediaStreamDestination = vi.fn(() => new MockMediaStreamAudioDestinationNode());
  resume = vi.fn().mockResolvedValue(undefined);
  suspend = vi.fn().mockResolvedValue(undefined);
  close = vi.fn().mockResolvedValue(undefined);
}

// Mock MediaStream
function createMockStream(id: string = 'test-stream'): MediaStream {
  return {
    id,
    active: true,
    getTracks: () => [],
    getAudioTracks: () => [{ kind: 'audio' }],
  } as unknown as MediaStream;
}

// Store mock instances
let mockAudioContext: MockAudioContext;

beforeEach(() => {
  mockAudioContext = new MockAudioContext();
  vi.stubGlobal('AudioContext', function (options?: AudioContextOptions) {
    if (options?.sampleRate) {
      mockAudioContext.sampleRate = options.sampleRate;
    }
    return mockAudioContext;
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('AudioMixer Volume Control (FEAT-201)', () => {
  describe('Per-Source Volume Control', () => {
    it('sets volume for individual source', async () => {
      const mixer = new AudioMixer();
      await mixer.initialize();

      mixer.addStream('peer-1', createMockStream());
      mixer.setVolume('peer-1', 0.5);

      expect(mixer.getVolume('peer-1')).toBe(0.5);
    });

    it('applies volume to source gain node', async () => {
      const mixer = new AudioMixer();
      await mixer.initialize();

      mixer.addStream('peer-1', createMockStream());
      const gainNode = mockAudioContext.createGain.mock.results[1].value;

      mixer.setVolume('peer-1', 0.7);

      expect(gainNode.gain.value).toBe(0.7);
    });

    it('manages multiple sources independently', async () => {
      const mixer = new AudioMixer();
      await mixer.initialize();

      mixer.addStream('peer-1', createMockStream());
      mixer.addStream('peer-2', createMockStream());
      mixer.addStream('peer-3', createMockStream());

      mixer.setVolume('peer-1', 0.3);
      mixer.setVolume('peer-2', 0.6);
      mixer.setVolume('peer-3', 0.9);

      expect(mixer.getVolume('peer-1')).toBe(0.3);
      expect(mixer.getVolume('peer-2')).toBe(0.6);
      expect(mixer.getVolume('peer-3')).toBe(0.9);
    });

    it('preserves volume when source is muted', async () => {
      const mixer = new AudioMixer();
      await mixer.initialize();

      mixer.addStream('peer-1', createMockStream());
      mixer.setVolume('peer-1', 0.8);
      mixer.mute('peer-1');

      // Volume should be preserved
      expect(mixer.getVolume('peer-1')).toBe(0.8);
    });

    it('restores volume when source is unmuted', async () => {
      const mixer = new AudioMixer();
      await mixer.initialize();

      mixer.addStream('peer-1', createMockStream());
      const gainNode = mockAudioContext.createGain.mock.results[1].value;

      mixer.setVolume('peer-1', 0.6);
      mixer.mute('peer-1');
      mixer.unmute('peer-1');

      expect(gainNode.gain.value).toBe(0.6);
    });
  });

  describe('Volume Info for UI', () => {
    it('returns all volume info', async () => {
      const mixer = new AudioMixer();
      await mixer.initialize();

      mixer.addStream('peer-1', createMockStream());
      mixer.addStream('peer-2', createMockStream());
      mixer.setVolume('peer-1', 0.5);
      mixer.mute('peer-2');

      const volumes = mixer.getAllVolumes();

      expect(volumes).toHaveLength(2);
      expect(volumes.find((v) => v.id === 'peer-1')).toEqual({
        id: 'peer-1',
        volume: 0.5,
        isMuted: false,
        effectiveVolume: 0.5,
      });
      expect(volumes.find((v) => v.id === 'peer-2')).toEqual({
        id: 'peer-2',
        volume: 1,
        isMuted: true,
        effectiveVolume: 0,
      });
    });

    it('returns single source volume info', async () => {
      const mixer = new AudioMixer();
      await mixer.initialize();

      mixer.addStream('peer-1', createMockStream());
      mixer.setVolume('peer-1', 0.7);

      const info = mixer.getSourceVolumeInfo('peer-1');

      expect(info).toEqual({
        id: 'peer-1',
        volume: 0.7,
        isMuted: false,
        effectiveVolume: 0.7,
      });
    });

    it('returns null for non-existent source', async () => {
      const mixer = new AudioMixer();
      await mixer.initialize();

      const info = mixer.getSourceVolumeInfo('non-existent');

      expect(info).toBeNull();
    });
  });

  describe('Volume Normalization - None Mode', () => {
    it('defaults to no normalization', async () => {
      const mixer = new AudioMixer();
      await mixer.initialize();

      expect(mixer.getNormalizationMode()).toBe('none');
    });

    it('does not apply normalization in none mode', async () => {
      const mixer = new AudioMixer({ normalizationMode: 'none' });
      await mixer.initialize();

      mixer.addStream('peer-1', createMockStream());
      mixer.addStream('peer-2', createMockStream());
      mixer.addStream('peer-3', createMockStream());

      // Each source should have full volume
      expect(mixer.getNormalizationFactor()).toBe(1.0);
    });
  });

  describe('Volume Normalization - Constant Mode', () => {
    it('applies constant power normalization', async () => {
      const mixer = new AudioMixer({ normalizationMode: 'constant' });
      await mixer.initialize();

      mixer.addStream('peer-1', createMockStream());
      mixer.addStream('peer-2', createMockStream());
      mixer.addStream('peer-3', createMockStream());
      mixer.addStream('peer-4', createMockStream());

      // Factor should be 1/sqrt(4) = 0.5
      expect(mixer.getNormalizationFactor()).toBe(0.5);
    });

    it('adjusts factor when sources are added', async () => {
      const mixer = new AudioMixer({ normalizationMode: 'constant' });
      await mixer.initialize();

      mixer.addStream('peer-1', createMockStream());
      expect(mixer.getNormalizationFactor()).toBe(1.0); // 1/sqrt(1) = 1

      mixer.addStream('peer-2', createMockStream());
      expect(mixer.getNormalizationFactor()).toBeCloseTo(0.707, 2); // 1/sqrt(2)

      mixer.addStream('peer-3', createMockStream());
      expect(mixer.getNormalizationFactor()).toBeCloseTo(0.577, 2); // 1/sqrt(3)
    });

    it('adjusts factor when sources are removed', async () => {
      const mixer = new AudioMixer({ normalizationMode: 'constant' });
      await mixer.initialize();

      mixer.addStream('peer-1', createMockStream());
      mixer.addStream('peer-2', createMockStream());
      mixer.addStream('peer-3', createMockStream());
      mixer.addStream('peer-4', createMockStream());

      expect(mixer.getNormalizationFactor()).toBe(0.5); // 1/sqrt(4)

      mixer.removeStream('peer-4');
      expect(mixer.getNormalizationFactor()).toBeCloseTo(0.577, 2); // 1/sqrt(3)
    });

    it('respects minimum source gain', async () => {
      const mixer = new AudioMixer({
        normalizationMode: 'constant',
        minSourceGain: 0.3,
      });
      await mixer.initialize();

      // Add many sources to push factor below min
      for (let i = 0; i < 20; i++) {
        mixer.addStream(`peer-${i}`, createMockStream());
      }

      // Factor should not go below minSourceGain
      expect(mixer.getNormalizationFactor()).toBeGreaterThanOrEqual(0.3);
    });

    it('applies normalization to gain nodes', async () => {
      const mixer = new AudioMixer({ normalizationMode: 'constant' });
      await mixer.initialize();

      mixer.addStream('peer-1', createMockStream());
      mixer.addStream('peer-2', createMockStream());
      mixer.addStream('peer-3', createMockStream());
      mixer.addStream('peer-4', createMockStream());

      // Get last gain node (peer-4) - index 4 because index 0 is master
      const gainNode = mockAudioContext.createGain.mock.results[4].value;

      // Gain should be 0.5 (1/sqrt(4))
      expect(gainNode.gain.value).toBe(0.5);
    });

    it('shows effective volume in getAllVolumes', async () => {
      const mixer = new AudioMixer({ normalizationMode: 'constant' });
      await mixer.initialize();

      mixer.addStream('peer-1', createMockStream());
      mixer.addStream('peer-2', createMockStream());
      mixer.addStream('peer-3', createMockStream());
      mixer.addStream('peer-4', createMockStream());
      mixer.setVolume('peer-1', 0.8);

      const volumes = mixer.getAllVolumes();
      const peer1Volume = volumes.find((v) => v.id === 'peer-1');

      // effectiveVolume = volume * normalizationFactor = 0.8 * 0.5 = 0.4
      expect(peer1Volume?.volume).toBe(0.8);
      expect(peer1Volume?.effectiveVolume).toBe(0.4);
    });
  });

  describe('Volume Normalization - Auto Mode', () => {
    it('scales to target output level', async () => {
      const mixer = new AudioMixer({
        normalizationMode: 'auto',
        targetOutputLevel: 0.9,
      });
      await mixer.initialize();

      mixer.addStream('peer-1', createMockStream());
      mixer.addStream('peer-2', createMockStream());
      mixer.addStream('peer-3', createMockStream());

      // Total volume = 3 (3 sources at 1.0 each)
      // Factor = 0.9 / 3 = 0.3
      expect(mixer.getNormalizationFactor()).toBe(0.3);
    });

    it('accounts for individual volumes', async () => {
      const mixer = new AudioMixer({
        normalizationMode: 'auto',
        targetOutputLevel: 0.8,
      });
      await mixer.initialize();

      mixer.addStream('peer-1', createMockStream());
      mixer.addStream('peer-2', createMockStream());
      mixer.setVolume('peer-1', 0.5);
      mixer.setVolume('peer-2', 0.3);

      // Total volume = 0.5 + 0.3 = 0.8
      // Factor = 0.8 / 0.8 = 1.0
      expect(mixer.getNormalizationFactor()).toBe(1.0);
    });

    it('ignores muted sources in calculation', async () => {
      const mixer = new AudioMixer({
        normalizationMode: 'auto',
        targetOutputLevel: 0.8,
      });
      await mixer.initialize();

      mixer.addStream('peer-1', createMockStream());
      mixer.addStream('peer-2', createMockStream());
      mixer.mute('peer-2');

      // Total volume = 1.0 (only peer-1)
      // Factor = 0.8 / 1.0 = 0.8
      expect(mixer.getNormalizationFactor()).toBe(0.8);
    });

    it('returns 1.0 when all sources muted', async () => {
      const mixer = new AudioMixer({ normalizationMode: 'auto' });
      await mixer.initialize();

      mixer.addStream('peer-1', createMockStream());
      mixer.addStream('peer-2', createMockStream());
      mixer.mute('peer-1');
      mixer.mute('peer-2');

      expect(mixer.getNormalizationFactor()).toBe(1.0);
    });

    it('respects minimum source gain', async () => {
      const mixer = new AudioMixer({
        normalizationMode: 'auto',
        targetOutputLevel: 0.5,
        minSourceGain: 0.1,
      });
      await mixer.initialize();

      // Add many high-volume sources
      for (let i = 0; i < 20; i++) {
        mixer.addStream(`peer-${i}`, createMockStream());
      }

      // Factor should not go below minSourceGain
      expect(mixer.getNormalizationFactor()).toBeGreaterThanOrEqual(0.1);
    });

    it('caps factor at 1.0', async () => {
      const mixer = new AudioMixer({
        normalizationMode: 'auto',
        targetOutputLevel: 0.9,
      });
      await mixer.initialize();

      mixer.addStream('peer-1', createMockStream());
      mixer.setVolume('peer-1', 0.1);

      // Target / volume = 0.9 / 0.1 = 9.0, but capped at 1.0
      expect(mixer.getNormalizationFactor()).toBe(1.0);
    });
  });

  describe('Normalization Mode Switching', () => {
    it('can switch normalization modes', async () => {
      const mixer = new AudioMixer();
      await mixer.initialize();

      mixer.addStream('peer-1', createMockStream());
      mixer.addStream('peer-2', createMockStream());

      mixer.setNormalizationMode('constant');
      expect(mixer.getNormalizationMode()).toBe('constant');

      mixer.setNormalizationMode('auto');
      expect(mixer.getNormalizationMode()).toBe('auto');

      mixer.setNormalizationMode('none');
      expect(mixer.getNormalizationMode()).toBe('none');
    });

    it('applies normalization immediately on mode change', async () => {
      const mixer = new AudioMixer();
      await mixer.initialize();

      mixer.addStream('peer-1', createMockStream());
      mixer.addStream('peer-2', createMockStream());
      mixer.addStream('peer-3', createMockStream());
      mixer.addStream('peer-4', createMockStream());

      const gainNode = mockAudioContext.createGain.mock.results[1].value;

      // Initially no normalization
      expect(gainNode.gain.value).toBe(1.0);

      // Switch to constant
      mixer.setNormalizationMode('constant');
      expect(gainNode.gain.value).toBe(0.5); // 1/sqrt(4)
    });

    it('can configure target output level', async () => {
      const mixer = new AudioMixer({ normalizationMode: 'auto' });
      await mixer.initialize();

      mixer.addStream('peer-1', createMockStream());
      mixer.addStream('peer-2', createMockStream());

      mixer.setTargetOutputLevel(0.6);
      expect(mixer.getTargetOutputLevel()).toBe(0.6);

      // Factor = 0.6 / 2 = 0.3
      expect(mixer.getNormalizationFactor()).toBe(0.3);
    });

    it('clamps target output level to valid range', async () => {
      const mixer = new AudioMixer({ normalizationMode: 'auto' });
      await mixer.initialize();

      mixer.setTargetOutputLevel(1.5);
      expect(mixer.getTargetOutputLevel()).toBe(1.0);

      mixer.setTargetOutputLevel(-0.5);
      expect(mixer.getTargetOutputLevel()).toBe(0);
    });
  });

  describe('Volume with Normalization', () => {
    it('applies both user volume and normalization', async () => {
      const mixer = new AudioMixer({ normalizationMode: 'constant' });
      await mixer.initialize();

      mixer.addStream('peer-1', createMockStream());
      mixer.addStream('peer-2', createMockStream());
      mixer.addStream('peer-3', createMockStream());
      mixer.addStream('peer-4', createMockStream());

      mixer.setVolume('peer-1', 0.8);

      const gainNode = mockAudioContext.createGain.mock.results[1].value;

      // Gain = volume * normalizationFactor = 0.8 * 0.5 = 0.4
      expect(gainNode.gain.value).toBe(0.4);
    });

    it('muted sources have zero gain regardless of normalization', async () => {
      const mixer = new AudioMixer({ normalizationMode: 'constant' });
      await mixer.initialize();

      mixer.addStream('peer-1', createMockStream());
      mixer.addStream('peer-2', createMockStream());

      const gainNode = mockAudioContext.createGain.mock.results[1].value;

      mixer.mute('peer-1');
      expect(gainNode.gain.value).toBe(0);
    });

    it('maintains volume info correctly under normalization', async () => {
      const mixer = new AudioMixer({ normalizationMode: 'constant' });
      await mixer.initialize();

      mixer.addStream('peer-1', createMockStream());
      mixer.addStream('peer-2', createMockStream());
      mixer.addStream('peer-3', createMockStream());
      mixer.addStream('peer-4', createMockStream());

      mixer.setVolume('peer-1', 0.6);
      mixer.mute('peer-2');

      const info1 = mixer.getSourceVolumeInfo('peer-1');
      const info2 = mixer.getSourceVolumeInfo('peer-2');

      // peer-1: volume=0.6, effective=0.6*0.5=0.3
      expect(info1?.volume).toBe(0.6);
      expect(info1?.effectiveVolume).toBe(0.3);
      expect(info1?.isMuted).toBe(false);

      // peer-2: muted so effectiveVolume=0
      expect(info2?.volume).toBe(1);
      expect(info2?.effectiveVolume).toBe(0);
      expect(info2?.isMuted).toBe(true);
    });
  });
});
