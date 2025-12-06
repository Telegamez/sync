/**
 * Audio Mixer Tests
 *
 * Tests for multi-stream audio mixing functionality.
 *
 * Part of the Long-Horizon Engineering Protocol - FEAT-200
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

describe('AudioMixer', () => {
  describe('Initialization', () => {
    it('creates mixer with default options', () => {
      const mixer = new AudioMixer();
      expect(mixer).toBeInstanceOf(AudioMixer);
    });

    it('creates mixer with custom master volume', () => {
      const mixer = new AudioMixer({ masterVolume: 0.5 });
      expect(mixer.getMasterVolume()).toBe(0.5);
    });

    it('initializes audio context on initialize()', async () => {
      const mixer = new AudioMixer();
      await mixer.initialize();

      expect(mixer.getState().isInitialized).toBe(true);
      expect(mockAudioContext.createGain).toHaveBeenCalled();
      expect(mockAudioContext.createMediaStreamDestination).toHaveBeenCalled();
    });

    it('uses provided audio context', async () => {
      const customContext = new MockAudioContext() as unknown as AudioContext;
      const mixer = new AudioMixer({ audioContext: customContext });
      await mixer.initialize();

      expect(mixer.getAudioContext()).toBe(customContext);
    });

    it('resumes suspended audio context', async () => {
      mockAudioContext.state = 'suspended';
      const mixer = new AudioMixer();
      await mixer.initialize();

      expect(mockAudioContext.resume).toHaveBeenCalled();
    });

    it('does not reinitialize if already initialized', async () => {
      const mixer = new AudioMixer();
      await mixer.initialize();
      await mixer.initialize();

      // createGain should only be called once
      expect(mockAudioContext.createGain).toHaveBeenCalledTimes(1);
    });

    it('uses custom sample rate', async () => {
      const mixer = new AudioMixer({ sampleRate: 44100 });
      await mixer.initialize();

      expect(mockAudioContext.sampleRate).toBe(44100);
    });
  });

  describe('Adding Streams', () => {
    it('adds stream to mixer', async () => {
      const mixer = new AudioMixer();
      await mixer.initialize();

      const stream = createMockStream('peer-1');
      mixer.addStream('peer-1', stream);

      expect(mixer.hasStream('peer-1')).toBe(true);
      expect(mixer.getSourceCount()).toBe(1);
    });

    it('creates source and gain nodes for stream', async () => {
      const mixer = new AudioMixer();
      await mixer.initialize();

      const stream = createMockStream();
      mixer.addStream('peer-1', stream);

      expect(mockAudioContext.createMediaStreamSource).toHaveBeenCalledWith(stream);
      expect(mockAudioContext.createGain).toHaveBeenCalledTimes(2); // master + source
    });

    it('connects nodes in correct order', async () => {
      const mixer = new AudioMixer();
      await mixer.initialize();

      const stream = createMockStream();
      mixer.addStream('peer-1', stream);

      // Source should connect to gain, gain should connect to master
      const sourceNode = mockAudioContext.createMediaStreamSource.mock.results[0].value;
      const gainNode = mockAudioContext.createGain.mock.results[1].value;

      expect(sourceNode.connect).toHaveBeenCalledWith(gainNode);
      expect(gainNode.connect).toHaveBeenCalled();
    });

    it('throws error if not initialized', () => {
      const mixer = new AudioMixer();
      const stream = createMockStream();

      expect(() => mixer.addStream('peer-1', stream)).toThrow('AudioMixer not initialized');
    });

    it('replaces existing stream with same ID', async () => {
      const mixer = new AudioMixer();
      await mixer.initialize();

      const stream1 = createMockStream('stream-1');
      const stream2 = createMockStream('stream-2');

      mixer.addStream('peer-1', stream1);
      mixer.addStream('peer-1', stream2);

      expect(mixer.getSourceCount()).toBe(1);
    });

    it('adds multiple streams', async () => {
      const mixer = new AudioMixer();
      await mixer.initialize();

      mixer.addStream('peer-1', createMockStream());
      mixer.addStream('peer-2', createMockStream());
      mixer.addStream('peer-3', createMockStream());

      expect(mixer.getSourceCount()).toBe(3);
      expect(mixer.getSourceIds()).toEqual(['peer-1', 'peer-2', 'peer-3']);
    });
  });

  describe('Removing Streams', () => {
    it('removes stream from mixer', async () => {
      const mixer = new AudioMixer();
      await mixer.initialize();

      mixer.addStream('peer-1', createMockStream());
      const removed = mixer.removeStream('peer-1');

      expect(removed).toBe(true);
      expect(mixer.hasStream('peer-1')).toBe(false);
      expect(mixer.getSourceCount()).toBe(0);
    });

    it('disconnects nodes when removing', async () => {
      const mixer = new AudioMixer();
      await mixer.initialize();

      mixer.addStream('peer-1', createMockStream());

      const sourceNode = mockAudioContext.createMediaStreamSource.mock.results[0].value;
      const gainNode = mockAudioContext.createGain.mock.results[1].value;

      mixer.removeStream('peer-1');

      expect(sourceNode.disconnect).toHaveBeenCalled();
      expect(gainNode.disconnect).toHaveBeenCalled();
    });

    it('returns false for non-existent stream', async () => {
      const mixer = new AudioMixer();
      await mixer.initialize();

      const removed = mixer.removeStream('non-existent');
      expect(removed).toBe(false);
    });
  });

  describe('Mixed Output', () => {
    it('returns mixed stream', async () => {
      const mixer = new AudioMixer();
      await mixer.initialize();

      const mixedStream = mixer.getMixedStream();
      expect(mixedStream).not.toBeNull();
      expect(mixedStream?.id).toBe('mock-destination-stream');
    });

    it('returns null if not initialized', () => {
      const mixer = new AudioMixer();
      expect(mixer.getMixedStream()).toBeNull();
    });
  });

  describe('Source Volume Control', () => {
    it('sets volume for source', async () => {
      const mixer = new AudioMixer();
      await mixer.initialize();

      mixer.addStream('peer-1', createMockStream());
      mixer.setVolume('peer-1', 0.5);

      expect(mixer.getVolume('peer-1')).toBe(0.5);
    });

    it('clamps volume to valid range', async () => {
      const mixer = new AudioMixer();
      await mixer.initialize();

      mixer.addStream('peer-1', createMockStream());

      mixer.setVolume('peer-1', 1.5);
      expect(mixer.getVolume('peer-1')).toBe(1);

      mixer.setVolume('peer-1', -0.5);
      expect(mixer.getVolume('peer-1')).toBe(0);
    });

    it('applies volume to gain node', async () => {
      const mixer = new AudioMixer();
      await mixer.initialize();

      mixer.addStream('peer-1', createMockStream());

      const gainNode = mockAudioContext.createGain.mock.results[1].value;
      mixer.setVolume('peer-1', 0.7);

      expect(gainNode.gain.value).toBe(0.7);
    });

    it('returns 0 for non-existent source', async () => {
      const mixer = new AudioMixer();
      await mixer.initialize();

      expect(mixer.getVolume('non-existent')).toBe(0);
    });

    it('does nothing for non-existent source', async () => {
      const mixer = new AudioMixer();
      await mixer.initialize();

      // Should not throw
      mixer.setVolume('non-existent', 0.5);
    });
  });

  describe('Source Muting', () => {
    it('mutes a source', async () => {
      const mixer = new AudioMixer();
      await mixer.initialize();

      mixer.addStream('peer-1', createMockStream());
      mixer.mute('peer-1');

      expect(mixer.isMuted('peer-1')).toBe(true);
    });

    it('sets gain to 0 when muted', async () => {
      const mixer = new AudioMixer();
      await mixer.initialize();

      mixer.addStream('peer-1', createMockStream());
      const gainNode = mockAudioContext.createGain.mock.results[1].value;

      mixer.mute('peer-1');

      expect(gainNode.gain.value).toBe(0);
    });

    it('unmutes a source', async () => {
      const mixer = new AudioMixer();
      await mixer.initialize();

      mixer.addStream('peer-1', createMockStream());
      mixer.setVolume('peer-1', 0.8);
      mixer.mute('peer-1');
      mixer.unmute('peer-1');

      expect(mixer.isMuted('peer-1')).toBe(false);
    });

    it('restores volume when unmuted', async () => {
      const mixer = new AudioMixer();
      await mixer.initialize();

      mixer.addStream('peer-1', createMockStream());
      const gainNode = mockAudioContext.createGain.mock.results[1].value;

      mixer.setVolume('peer-1', 0.6);
      mixer.mute('peer-1');
      mixer.unmute('peer-1');

      expect(gainNode.gain.value).toBe(0.6);
    });

    it('does not apply volume when muted', async () => {
      const mixer = new AudioMixer();
      await mixer.initialize();

      mixer.addStream('peer-1', createMockStream());
      const gainNode = mockAudioContext.createGain.mock.results[1].value;

      mixer.mute('peer-1');
      mixer.setVolume('peer-1', 0.8);

      // Gain should stay 0 because muted
      expect(gainNode.gain.value).toBe(0);
      // But volume should be stored
      expect(mixer.getVolume('peer-1')).toBe(0.8);
    });

    it('returns false for non-existent source', async () => {
      const mixer = new AudioMixer();
      await mixer.initialize();

      expect(mixer.isMuted('non-existent')).toBe(false);
    });
  });

  describe('Master Volume', () => {
    it('sets master volume', async () => {
      const mixer = new AudioMixer();
      await mixer.initialize();

      mixer.setMasterVolume(0.7);

      expect(mixer.getMasterVolume()).toBe(0.7);
    });

    it('clamps master volume to valid range', async () => {
      const mixer = new AudioMixer();
      await mixer.initialize();

      mixer.setMasterVolume(1.5);
      expect(mixer.getMasterVolume()).toBe(1);

      mixer.setMasterVolume(-0.5);
      expect(mixer.getMasterVolume()).toBe(0);
    });

    it('applies master volume to gain node', async () => {
      const mixer = new AudioMixer();
      await mixer.initialize();

      const masterGainNode = mockAudioContext.createGain.mock.results[0].value;
      mixer.setMasterVolume(0.5);

      expect(masterGainNode.gain.value).toBe(0.5);
    });

    it('mutes master output', async () => {
      const mixer = new AudioMixer();
      await mixer.initialize();

      const masterGainNode = mockAudioContext.createGain.mock.results[0].value;
      mixer.muteMaster();

      expect(mixer.isMasterMutedState()).toBe(true);
      expect(masterGainNode.gain.value).toBe(0);
    });

    it('unmutes master output', async () => {
      const mixer = new AudioMixer();
      await mixer.initialize();

      const masterGainNode = mockAudioContext.createGain.mock.results[0].value;
      mixer.setMasterVolume(0.8);
      mixer.muteMaster();
      mixer.unmuteMaster();

      expect(mixer.isMasterMutedState()).toBe(false);
      expect(masterGainNode.gain.value).toBe(0.8);
    });
  });

  describe('Mixer State', () => {
    it('returns correct state', async () => {
      const mixer = new AudioMixer({ masterVolume: 0.9 });
      await mixer.initialize();

      mixer.addStream('peer-1', createMockStream());
      mixer.addStream('peer-2', createMockStream());

      const state = mixer.getState();

      expect(state.isInitialized).toBe(true);
      expect(state.isRunning).toBe(true);
      expect(state.sourceCount).toBe(2);
      expect(state.masterVolume).toBe(0.9);
      expect(state.isMasterMuted).toBe(false);
    });

    it('returns correct state when not initialized', () => {
      const mixer = new AudioMixer();
      const state = mixer.getState();

      expect(state.isInitialized).toBe(false);
      expect(state.isRunning).toBe(false);
    });
  });

  describe('Suspend/Resume', () => {
    it('suspends audio context', async () => {
      const mixer = new AudioMixer();
      await mixer.initialize();

      mockAudioContext.state = 'running';
      await mixer.suspend();

      expect(mockAudioContext.suspend).toHaveBeenCalled();
    });

    it('resumes audio context', async () => {
      const mixer = new AudioMixer();
      await mixer.initialize();

      mockAudioContext.state = 'suspended';
      await mixer.resume();

      expect(mockAudioContext.resume).toHaveBeenCalled();
    });

    it('does not suspend if not running', async () => {
      const mixer = new AudioMixer();
      await mixer.initialize();

      mockAudioContext.state = 'suspended';
      mockAudioContext.suspend.mockClear();

      await mixer.suspend();

      expect(mockAudioContext.suspend).not.toHaveBeenCalled();
    });
  });

  describe('Dispose', () => {
    it('disconnects all sources', async () => {
      const mixer = new AudioMixer();
      await mixer.initialize();

      mixer.addStream('peer-1', createMockStream());
      mixer.addStream('peer-2', createMockStream());

      const sourceNode1 = mockAudioContext.createMediaStreamSource.mock.results[0].value;
      const sourceNode2 = mockAudioContext.createMediaStreamSource.mock.results[1].value;

      mixer.dispose();

      expect(sourceNode1.disconnect).toHaveBeenCalled();
      expect(sourceNode2.disconnect).toHaveBeenCalled();
    });

    it('clears all sources', async () => {
      const mixer = new AudioMixer();
      await mixer.initialize();

      mixer.addStream('peer-1', createMockStream());
      mixer.dispose();

      expect(mixer.getSourceCount()).toBe(0);
    });

    it('closes owned audio context', async () => {
      const mixer = new AudioMixer();
      await mixer.initialize();

      mixer.dispose();

      expect(mockAudioContext.close).toHaveBeenCalled();
    });

    it('does not close provided audio context', async () => {
      const customContext = new MockAudioContext() as unknown as AudioContext;
      const mixer = new AudioMixer({ audioContext: customContext });
      await mixer.initialize();

      mixer.dispose();

      expect((customContext as unknown as MockAudioContext).close).not.toHaveBeenCalled();
    });

    it('sets initialized to false', async () => {
      const mixer = new AudioMixer();
      await mixer.initialize();

      mixer.dispose();

      expect(mixer.getState().isInitialized).toBe(false);
    });

    it('returns null for audio context after dispose', async () => {
      const mixer = new AudioMixer();
      await mixer.initialize();

      mixer.dispose();

      expect(mixer.getAudioContext()).toBeNull();
    });
  });

  describe('createAudioMixer factory', () => {
    it('creates mixer instance', () => {
      const mixer = createAudioMixer();
      expect(mixer).toBeInstanceOf(AudioMixer);
    });

    it('passes options to mixer', () => {
      const mixer = createAudioMixer({ masterVolume: 0.6 });
      expect(mixer.getMasterVolume()).toBe(0.6);
    });
  });
});
