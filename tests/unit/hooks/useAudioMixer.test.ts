/**
 * useAudioMixer Hook Tests
 *
 * Tests for React hook integration with AudioMixer.
 *
 * Part of the Long-Horizon Engineering Protocol - FEAT-202
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { useAudioMixer } from '@/hooks/useAudioMixer';

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
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('useAudioMixer', () => {
  describe('Initialization', () => {
    it('auto-initializes by default', async () => {
      const { result } = renderHook(() => useAudioMixer());

      // Wait for auto-initialization
      await act(async () => {
        await new Promise((r) => setTimeout(r, 10));
      });

      expect(result.current.isInitialized).toBe(true);
    });

    it('can disable auto-initialization', async () => {
      const { result } = renderHook(() => useAudioMixer({ autoInitialize: false }));

      expect(result.current.isInitialized).toBe(false);
    });

    it('calls onInitialized callback', async () => {
      const onInitialized = vi.fn();
      renderHook(() => useAudioMixer({ onInitialized }));

      await act(async () => {
        await new Promise((r) => setTimeout(r, 10));
      });

      expect(onInitialized).toHaveBeenCalled();
    });

    it('can manually initialize', async () => {
      const { result } = renderHook(() => useAudioMixer({ autoInitialize: false }));

      expect(result.current.isInitialized).toBe(false);

      await act(async () => {
        await result.current.initialize();
      });

      expect(result.current.isInitialized).toBe(true);
    });

    it('uses initial master volume', async () => {
      const { result } = renderHook(() => useAudioMixer({ masterVolume: 0.7 }));

      await act(async () => {
        await new Promise((r) => setTimeout(r, 10));
      });

      expect(result.current.masterVolume).toBe(0.7);
    });

    it('uses initial normalization mode', async () => {
      const { result } = renderHook(() => useAudioMixer({ normalizationMode: 'constant' }));

      await act(async () => {
        await new Promise((r) => setTimeout(r, 10));
      });

      expect(result.current.normalizationMode).toBe('constant');
    });
  });

  describe('Adding Streams', () => {
    it('adds stream and updates state', async () => {
      const { result } = renderHook(() => useAudioMixer());

      await act(async () => {
        await new Promise((r) => setTimeout(r, 10));
      });

      act(() => {
        result.current.addStream('peer-1', createMockStream());
      });

      expect(result.current.sourceCount).toBe(1);
      expect(result.current.hasStream('peer-1')).toBe(true);
    });

    it('calls onSourceAdded callback', async () => {
      const onSourceAdded = vi.fn();
      const { result } = renderHook(() => useAudioMixer({ onSourceAdded }));

      await act(async () => {
        await new Promise((r) => setTimeout(r, 10));
      });

      act(() => {
        result.current.addStream('peer-1', createMockStream());
      });

      expect(onSourceAdded).toHaveBeenCalledWith('peer-1');
    });

    it('adds multiple streams', async () => {
      const { result } = renderHook(() => useAudioMixer());

      await act(async () => {
        await new Promise((r) => setTimeout(r, 10));
      });

      act(() => {
        result.current.addStream('peer-1', createMockStream());
        result.current.addStream('peer-2', createMockStream());
        result.current.addStream('peer-3', createMockStream());
      });

      expect(result.current.sourceCount).toBe(3);
      expect(result.current.getSourceIds()).toEqual(['peer-1', 'peer-2', 'peer-3']);
    });

    it('throws if not initialized', async () => {
      const { result } = renderHook(() => useAudioMixer({ autoInitialize: false }));

      expect(() => {
        result.current.addStream('peer-1', createMockStream());
      }).toThrow('Mixer not created');
    });

    it('updates volumes array', async () => {
      const { result } = renderHook(() => useAudioMixer());

      await act(async () => {
        await new Promise((r) => setTimeout(r, 10));
      });

      act(() => {
        result.current.addStream('peer-1', createMockStream());
      });

      expect(result.current.volumes).toHaveLength(1);
      expect(result.current.volumes[0]).toMatchObject({
        id: 'peer-1',
        volume: 1,
        isMuted: false,
      });
    });
  });

  describe('Removing Streams', () => {
    it('removes stream and updates state', async () => {
      const { result } = renderHook(() => useAudioMixer());

      await act(async () => {
        await new Promise((r) => setTimeout(r, 10));
      });

      act(() => {
        result.current.addStream('peer-1', createMockStream());
      });

      expect(result.current.sourceCount).toBe(1);

      act(() => {
        result.current.removeStream('peer-1');
      });

      expect(result.current.sourceCount).toBe(0);
      expect(result.current.hasStream('peer-1')).toBe(false);
    });

    it('calls onSourceRemoved callback', async () => {
      const onSourceRemoved = vi.fn();
      const { result } = renderHook(() => useAudioMixer({ onSourceRemoved }));

      await act(async () => {
        await new Promise((r) => setTimeout(r, 10));
      });

      act(() => {
        result.current.addStream('peer-1', createMockStream());
      });

      act(() => {
        result.current.removeStream('peer-1');
      });

      expect(onSourceRemoved).toHaveBeenCalledWith('peer-1');
    });

    it('returns false for non-existent stream', async () => {
      const { result } = renderHook(() => useAudioMixer());

      await act(async () => {
        await new Promise((r) => setTimeout(r, 10));
      });

      let removed: boolean = false;
      act(() => {
        removed = result.current.removeStream('non-existent');
      });

      expect(removed).toBe(false);
    });
  });

  describe('Volume Control', () => {
    it('sets and gets volume', async () => {
      const { result } = renderHook(() => useAudioMixer());

      await act(async () => {
        await new Promise((r) => setTimeout(r, 10));
      });

      act(() => {
        result.current.addStream('peer-1', createMockStream());
      });

      act(() => {
        result.current.setVolume('peer-1', 0.6);
      });

      expect(result.current.getVolume('peer-1')).toBe(0.6);
    });

    it('updates volumes array on volume change', async () => {
      const { result } = renderHook(() => useAudioMixer());

      await act(async () => {
        await new Promise((r) => setTimeout(r, 10));
      });

      act(() => {
        result.current.addStream('peer-1', createMockStream());
      });

      act(() => {
        result.current.setVolume('peer-1', 0.5);
      });

      expect(result.current.volumes[0].volume).toBe(0.5);
    });

    it('mutes and unmutes peer', async () => {
      const { result } = renderHook(() => useAudioMixer());

      await act(async () => {
        await new Promise((r) => setTimeout(r, 10));
      });

      act(() => {
        result.current.addStream('peer-1', createMockStream());
      });

      act(() => {
        result.current.mute('peer-1');
      });

      expect(result.current.isMuted('peer-1')).toBe(true);
      expect(result.current.volumes[0].isMuted).toBe(true);

      act(() => {
        result.current.unmute('peer-1');
      });

      expect(result.current.isMuted('peer-1')).toBe(false);
    });

    it('gets source volume info', async () => {
      const { result } = renderHook(() => useAudioMixer());

      await act(async () => {
        await new Promise((r) => setTimeout(r, 10));
      });

      act(() => {
        result.current.addStream('peer-1', createMockStream());
        result.current.setVolume('peer-1', 0.8);
      });

      const info = result.current.getSourceVolumeInfo('peer-1');
      expect(info).toMatchObject({
        id: 'peer-1',
        volume: 0.8,
        isMuted: false,
      });
    });

    it('returns null for non-existent source volume info', async () => {
      const { result } = renderHook(() => useAudioMixer());

      await act(async () => {
        await new Promise((r) => setTimeout(r, 10));
      });

      const info = result.current.getSourceVolumeInfo('non-existent');
      expect(info).toBeNull();
    });
  });

  describe('Master Volume', () => {
    it('sets master volume', async () => {
      const { result } = renderHook(() => useAudioMixer());

      await act(async () => {
        await new Promise((r) => setTimeout(r, 10));
      });

      act(() => {
        result.current.setMasterVolume(0.5);
      });

      expect(result.current.masterVolume).toBe(0.5);
    });

    it('mutes and unmutes master', async () => {
      const { result } = renderHook(() => useAudioMixer());

      await act(async () => {
        await new Promise((r) => setTimeout(r, 10));
      });

      act(() => {
        result.current.muteMaster();
      });

      expect(result.current.isMasterMuted).toBe(true);

      act(() => {
        result.current.unmuteMaster();
      });

      expect(result.current.isMasterMuted).toBe(false);
    });
  });

  describe('Normalization', () => {
    it('sets normalization mode', async () => {
      const { result } = renderHook(() => useAudioMixer());

      await act(async () => {
        await new Promise((r) => setTimeout(r, 10));
      });

      act(() => {
        result.current.setNormalizationMode('constant');
      });

      expect(result.current.normalizationMode).toBe('constant');
    });

    it('updates normalization factor', async () => {
      const { result } = renderHook(() => useAudioMixer({ normalizationMode: 'constant' }));

      await act(async () => {
        await new Promise((r) => setTimeout(r, 10));
      });

      act(() => {
        result.current.addStream('peer-1', createMockStream());
        result.current.addStream('peer-2', createMockStream());
        result.current.addStream('peer-3', createMockStream());
        result.current.addStream('peer-4', createMockStream());
      });

      // Factor = 1/sqrt(4) = 0.5
      expect(result.current.normalizationFactor).toBe(0.5);
    });

    it('shows effective volume in volumes array', async () => {
      const { result } = renderHook(() => useAudioMixer({ normalizationMode: 'constant' }));

      await act(async () => {
        await new Promise((r) => setTimeout(r, 10));
      });

      act(() => {
        result.current.addStream('peer-1', createMockStream());
        result.current.addStream('peer-2', createMockStream());
        result.current.addStream('peer-3', createMockStream());
        result.current.addStream('peer-4', createMockStream());
        result.current.setVolume('peer-1', 0.8);
      });

      const peer1Volume = result.current.volumes.find((v) => v.id === 'peer-1');
      expect(peer1Volume?.volume).toBe(0.8);
      expect(peer1Volume?.effectiveVolume).toBe(0.4); // 0.8 * 0.5
    });
  });

  describe('Mixed Stream', () => {
    it('returns mixed stream after initialization', async () => {
      const { result } = renderHook(() => useAudioMixer());

      await act(async () => {
        await new Promise((r) => setTimeout(r, 10));
      });

      const stream = result.current.getMixedStream();
      expect(stream).not.toBeNull();
      expect(stream?.id).toBe('mock-destination-stream');
    });

    it('returns null before initialization', async () => {
      const { result } = renderHook(() => useAudioMixer({ autoInitialize: false }));

      const stream = result.current.getMixedStream();
      expect(stream).toBeNull();
    });
  });

  describe('Suspend/Resume', () => {
    it('suspends audio processing', async () => {
      const { result } = renderHook(() => useAudioMixer());

      await act(async () => {
        await new Promise((r) => setTimeout(r, 10));
      });

      mockAudioContext.state = 'running';

      await act(async () => {
        await result.current.suspend();
      });

      expect(mockAudioContext.suspend).toHaveBeenCalled();
    });

    it('resumes audio processing', async () => {
      const { result } = renderHook(() => useAudioMixer());

      await act(async () => {
        await new Promise((r) => setTimeout(r, 10));
      });

      mockAudioContext.state = 'suspended';

      await act(async () => {
        await result.current.resume();
      });

      expect(mockAudioContext.resume).toHaveBeenCalled();
    });
  });

  describe('Dispose', () => {
    it('disposes and resets state', async () => {
      const { result } = renderHook(() => useAudioMixer());

      await act(async () => {
        await new Promise((r) => setTimeout(r, 10));
      });

      act(() => {
        result.current.addStream('peer-1', createMockStream());
      });

      expect(result.current.isInitialized).toBe(true);
      expect(result.current.sourceCount).toBe(1);

      act(() => {
        result.current.dispose();
      });

      expect(result.current.isInitialized).toBe(false);
      expect(result.current.sourceCount).toBe(0);
      expect(result.current.volumes).toHaveLength(0);
    });

    it('closes audio context on dispose', async () => {
      const { result } = renderHook(() => useAudioMixer());

      await act(async () => {
        await new Promise((r) => setTimeout(r, 10));
      });

      act(() => {
        result.current.dispose();
      });

      expect(mockAudioContext.close).toHaveBeenCalled();
    });
  });

  describe('Cleanup on Unmount', () => {
    it('disposes mixer on unmount', async () => {
      const { result, unmount } = renderHook(() => useAudioMixer());

      await act(async () => {
        await new Promise((r) => setTimeout(r, 10));
      });

      act(() => {
        result.current.addStream('peer-1', createMockStream());
      });

      unmount();

      expect(mockAudioContext.close).toHaveBeenCalled();
    });
  });

  describe('State Change Callback', () => {
    it('calls onStateChange on state updates', async () => {
      const onStateChange = vi.fn();
      const { result } = renderHook(() => useAudioMixer({ onStateChange }));

      await act(async () => {
        await new Promise((r) => setTimeout(r, 10));
      });

      onStateChange.mockClear();

      act(() => {
        result.current.addStream('peer-1', createMockStream());
      });

      expect(onStateChange).toHaveBeenCalled();
    });
  });

  describe('Running State', () => {
    it('reflects running state correctly', async () => {
      const { result } = renderHook(() => useAudioMixer());

      await act(async () => {
        await new Promise((r) => setTimeout(r, 10));
      });

      expect(result.current.isRunning).toBe(true);
    });
  });
});
