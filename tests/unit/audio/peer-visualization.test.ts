/**
 * Peer Audio Visualization Tests
 *
 * Tests for per-peer audio visualization.
 *
 * Part of the Long-Horizon Engineering Protocol - FEAT-204
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PeerVisualizer, createPeerVisualizer } from '@/lib/audio/peer-visualizer';

// Mock AnalyserNode with controllable data
class MockAnalyserNode {
  fftSize = 256;
  frequencyBinCount = 128;
  smoothingTimeConstant = 0.8;
  private mockLevel = 0;

  connect = vi.fn();
  disconnect = vi.fn();

  // Set mock audio level (0-1)
  setMockLevel(level: number) {
    this.mockLevel = level;
  }

  getByteFrequencyData(array: Uint8Array) {
    const value = Math.round(this.mockLevel * 255);
    for (let i = 0; i < array.length; i++) {
      array[i] = value;
    }
  }

  getByteTimeDomainData(array: Uint8Array) {
    // Center value is 128, oscillation based on level
    const amplitude = Math.round(this.mockLevel * 127);
    for (let i = 0; i < array.length; i++) {
      // Simple sine wave simulation
      array[i] = 128 + Math.round(amplitude * Math.sin((i / array.length) * Math.PI * 2));
    }
  }
}

// Mock MediaStreamAudioSourceNode
class MockMediaStreamAudioSourceNode {
  connect = vi.fn();
  disconnect = vi.fn();
}

// Mock AudioContext
class MockAudioContext {
  state: AudioContextState = 'running';

  private mockAnalysers: MockAnalyserNode[] = [];

  createMediaStreamSource = vi.fn(() => new MockMediaStreamAudioSourceNode());
  createAnalyser = vi.fn(() => {
    const analyser = new MockAnalyserNode();
    this.mockAnalysers.push(analyser);
    return analyser;
  });
  resume = vi.fn().mockResolvedValue(undefined);
  close = vi.fn().mockResolvedValue(undefined);

  getMockAnalysers() {
    return this.mockAnalysers;
  }
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

// Store mock instance
let mockAudioContext: MockAudioContext;

// Mock requestAnimationFrame
let animationFrameCallback: FrameRequestCallback | null = null;
let animationFrameId = 1;

beforeEach(() => {
  mockAudioContext = new MockAudioContext();
  vi.stubGlobal('AudioContext', function () {
    return mockAudioContext;
  });
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    animationFrameCallback = callback;
    return animationFrameId++;
  });
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  vi.useFakeTimers();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  vi.useRealTimers();
  animationFrameCallback = null;
});

// Helper to trigger animation frame
function triggerAnimationFrame() {
  if (animationFrameCallback) {
    const callback = animationFrameCallback;
    animationFrameCallback = null;
    callback(performance.now());
  }
}

describe('PeerVisualizer', () => {
  describe('Initialization', () => {
    it('creates visualizer with default options', () => {
      const visualizer = new PeerVisualizer();
      expect(visualizer).toBeInstanceOf(PeerVisualizer);
      expect(visualizer.getIsInitialized()).toBe(false);
    });

    it('initializes audio context', async () => {
      const visualizer = new PeerVisualizer();
      await visualizer.initialize();

      expect(visualizer.getIsInitialized()).toBe(true);
    });

    it('uses provided audio context', async () => {
      const customContext = new MockAudioContext() as unknown as AudioContext;
      const visualizer = new PeerVisualizer({ audioContext: customContext });
      await visualizer.initialize();

      expect(visualizer.getIsInitialized()).toBe(true);
    });

    it('resumes suspended audio context', async () => {
      mockAudioContext.state = 'suspended';
      const visualizer = new PeerVisualizer();
      await visualizer.initialize();

      expect(mockAudioContext.resume).toHaveBeenCalled();
    });

    it('does not reinitialize if already initialized', async () => {
      const visualizer = new PeerVisualizer();
      await visualizer.initialize();
      await visualizer.initialize();

      expect(visualizer.getIsInitialized()).toBe(true);
    });
  });

  describe('Adding Streams', () => {
    it('adds stream to visualize', async () => {
      const visualizer = new PeerVisualizer();
      await visualizer.initialize();

      visualizer.addStream('peer-1', createMockStream());

      expect(visualizer.hasStream('peer-1')).toBe(true);
      expect(visualizer.getSourceCount()).toBe(1);
    });

    it('creates analyser node for stream', async () => {
      const visualizer = new PeerVisualizer();
      await visualizer.initialize();

      visualizer.addStream('peer-1', createMockStream());

      expect(mockAudioContext.createMediaStreamSource).toHaveBeenCalled();
      expect(mockAudioContext.createAnalyser).toHaveBeenCalled();
    });

    it('connects source to analyser', async () => {
      const visualizer = new PeerVisualizer();
      await visualizer.initialize();

      visualizer.addStream('peer-1', createMockStream());

      const sourceNode = mockAudioContext.createMediaStreamSource.mock.results[0].value;
      expect(sourceNode.connect).toHaveBeenCalled();
    });

    it('starts visualization when first stream added', async () => {
      const visualizer = new PeerVisualizer();
      await visualizer.initialize();

      expect(visualizer.getIsRunning()).toBe(false);

      visualizer.addStream('peer-1', createMockStream());

      expect(visualizer.getIsRunning()).toBe(true);
    });

    it('throws if not initialized', () => {
      const visualizer = new PeerVisualizer();

      expect(() => {
        visualizer.addStream('peer-1', createMockStream());
      }).toThrow('not initialized');
    });

    it('replaces existing stream with same ID', async () => {
      const visualizer = new PeerVisualizer();
      await visualizer.initialize();

      visualizer.addStream('peer-1', createMockStream('stream-1'));
      visualizer.addStream('peer-1', createMockStream('stream-2'));

      expect(visualizer.getSourceCount()).toBe(1);
    });

    it('adds multiple streams', async () => {
      const visualizer = new PeerVisualizer();
      await visualizer.initialize();

      visualizer.addStream('peer-1', createMockStream());
      visualizer.addStream('peer-2', createMockStream());
      visualizer.addStream('peer-3', createMockStream());

      expect(visualizer.getSourceCount()).toBe(3);
      expect(visualizer.getSourceIds()).toEqual(['peer-1', 'peer-2', 'peer-3']);
    });

    it('marks local stream correctly', async () => {
      const visualizer = new PeerVisualizer();
      await visualizer.initialize();

      visualizer.addStream('local', createMockStream(), true);

      const data = visualizer.getVisualizationData('local');
      expect(data?.isLocal).toBe(true);
    });
  });

  describe('Removing Streams', () => {
    it('removes stream from visualization', async () => {
      const visualizer = new PeerVisualizer();
      await visualizer.initialize();

      visualizer.addStream('peer-1', createMockStream());
      const removed = visualizer.removeStream('peer-1');

      expect(removed).toBe(true);
      expect(visualizer.hasStream('peer-1')).toBe(false);
      expect(visualizer.getSourceCount()).toBe(0);
    });

    it('disconnects nodes when removing', async () => {
      const visualizer = new PeerVisualizer();
      await visualizer.initialize();

      visualizer.addStream('peer-1', createMockStream());

      const sourceNode = mockAudioContext.createMediaStreamSource.mock.results[0].value;
      const analyserNode = mockAudioContext.createAnalyser.mock.results[0].value;

      visualizer.removeStream('peer-1');

      expect(sourceNode.disconnect).toHaveBeenCalled();
      expect(analyserNode.disconnect).toHaveBeenCalled();
    });

    it('stops visualization when last stream removed', async () => {
      const visualizer = new PeerVisualizer();
      await visualizer.initialize();

      visualizer.addStream('peer-1', createMockStream());
      expect(visualizer.getIsRunning()).toBe(true);

      visualizer.removeStream('peer-1');
      expect(visualizer.getIsRunning()).toBe(false);
    });

    it('returns false for non-existent stream', async () => {
      const visualizer = new PeerVisualizer();
      await visualizer.initialize();

      const removed = visualizer.removeStream('non-existent');
      expect(removed).toBe(false);
    });
  });

  describe('Visualization Data', () => {
    it('returns visualization data for peer', async () => {
      const visualizer = new PeerVisualizer();
      await visualizer.initialize();

      visualizer.addStream('peer-1', createMockStream());
      const analyser = mockAudioContext.getMockAnalysers()[0];
      analyser.setMockLevel(0.5);

      const data = visualizer.getVisualizationData('peer-1');

      expect(data).not.toBeNull();
      expect(data?.peerId).toBe('peer-1');
      expect(data?.audioLevel).toBeCloseTo(0.5, 1);
      expect(data?.frequencyData).toBeInstanceOf(Uint8Array);
      expect(data?.timeDomainData).toBeInstanceOf(Uint8Array);
    });

    it('returns all visualization data', async () => {
      const visualizer = new PeerVisualizer();
      await visualizer.initialize();

      visualizer.addStream('peer-1', createMockStream());
      visualizer.addStream('peer-2', createMockStream());

      const analysers = mockAudioContext.getMockAnalysers();
      analysers[0].setMockLevel(0.5);
      analysers[1].setMockLevel(0.3);

      const allData = visualizer.getAllVisualizationData();

      expect(allData).toHaveLength(2);
      expect(allData.find((d) => d.peerId === 'peer-1')?.audioLevel).toBeCloseTo(0.5, 1);
      expect(allData.find((d) => d.peerId === 'peer-2')?.audioLevel).toBeCloseTo(0.3, 1);
    });

    it('returns null for non-existent peer', async () => {
      const visualizer = new PeerVisualizer();
      await visualizer.initialize();

      expect(visualizer.getVisualizationData('non-existent')).toBeNull();
    });
  });

  describe('Audio Level', () => {
    it('gets audio level for peer', async () => {
      const visualizer = new PeerVisualizer();
      await visualizer.initialize();

      visualizer.addStream('peer-1', createMockStream());
      const analyser = mockAudioContext.getMockAnalysers()[0];
      analyser.setMockLevel(0.7);

      const level = visualizer.getAudioLevel('peer-1');
      expect(level).toBeCloseTo(0.7, 1);
    });

    it('returns 0 for non-existent peer', async () => {
      const visualizer = new PeerVisualizer();
      await visualizer.initialize();

      expect(visualizer.getAudioLevel('non-existent')).toBe(0);
    });
  });

  describe('Frequency Data', () => {
    it('gets frequency data for peer', async () => {
      const visualizer = new PeerVisualizer();
      await visualizer.initialize();

      visualizer.addStream('peer-1', createMockStream());
      const analyser = mockAudioContext.getMockAnalysers()[0];
      analyser.setMockLevel(0.5);

      const data = visualizer.getFrequencyData('peer-1');

      expect(data).not.toBeNull();
      expect(data).toBeInstanceOf(Uint8Array);
      expect(data![0]).toBe(Math.round(0.5 * 255));
    });

    it('returns null for non-existent peer', async () => {
      const visualizer = new PeerVisualizer();
      await visualizer.initialize();

      expect(visualizer.getFrequencyData('non-existent')).toBeNull();
    });
  });

  describe('Time Domain Data', () => {
    it('gets time domain data for peer', async () => {
      const visualizer = new PeerVisualizer({ trackTimeDomainData: true });
      await visualizer.initialize();

      visualizer.addStream('peer-1', createMockStream());
      const analyser = mockAudioContext.getMockAnalysers()[0];
      analyser.setMockLevel(0.5);

      const data = visualizer.getTimeDomainData('peer-1');

      expect(data).not.toBeNull();
      expect(data).toBeInstanceOf(Uint8Array);
    });

    it('returns null for non-existent peer', async () => {
      const visualizer = new PeerVisualizer();
      await visualizer.initialize();

      expect(visualizer.getTimeDomainData('non-existent')).toBeNull();
    });
  });

  describe('Callbacks', () => {
    it('calls onVisualizationUpdate', async () => {
      const onVisualizationUpdate = vi.fn();
      const visualizer = new PeerVisualizer({}, { onVisualizationUpdate });
      await visualizer.initialize();

      visualizer.addStream('peer-1', createMockStream());

      // Trigger animation frame
      triggerAnimationFrame();

      expect(onVisualizationUpdate).toHaveBeenCalled();
      expect(onVisualizationUpdate).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            peerId: 'peer-1',
          }),
        ])
      );
    });

    it('calls onPeerUpdate for each peer', async () => {
      // Use interval mode instead of animation frame for easier testing
      const onPeerUpdate = vi.fn();
      const visualizer = new PeerVisualizer(
        { useAnimationFrame: false, updateIntervalMs: 50 },
        { onPeerUpdate }
      );
      await visualizer.initialize();

      visualizer.addStream('peer-1', createMockStream());
      visualizer.addStream('peer-2', createMockStream());

      // Clear any initial calls
      onPeerUpdate.mockClear();

      // Advance timers to trigger interval update
      vi.advanceTimersByTime(50);

      // Should have been called for both peers
      expect(onPeerUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ peerId: 'peer-1' })
      );
      expect(onPeerUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ peerId: 'peer-2' })
      );
    });
  });

  describe('Configuration', () => {
    it('sets and gets FFT size', async () => {
      const visualizer = new PeerVisualizer({ fftSize: 256 });
      await visualizer.initialize();

      expect(visualizer.getFftSize()).toBe(256);

      visualizer.setFftSize(512);
      expect(visualizer.getFftSize()).toBe(512);
    });

    it('updates analyser FFT size', async () => {
      const visualizer = new PeerVisualizer();
      await visualizer.initialize();

      visualizer.addStream('peer-1', createMockStream());
      const analyser = mockAudioContext.getMockAnalysers()[0];

      visualizer.setFftSize(512);

      expect(analyser.fftSize).toBe(512);
    });

    it('sets and gets smoothing time constant', async () => {
      const visualizer = new PeerVisualizer({ smoothingTimeConstant: 0.8 });
      await visualizer.initialize();

      expect(visualizer.getSmoothingTimeConstant()).toBe(0.8);

      visualizer.setSmoothingTimeConstant(0.5);
      expect(visualizer.getSmoothingTimeConstant()).toBe(0.5);
    });

    it('clamps smoothing time constant', async () => {
      const visualizer = new PeerVisualizer();
      await visualizer.initialize();

      visualizer.setSmoothingTimeConstant(1.5);
      expect(visualizer.getSmoothingTimeConstant()).toBe(1);

      visualizer.setSmoothingTimeConstant(-0.5);
      expect(visualizer.getSmoothingTimeConstant()).toBe(0);
    });

    it('updates analyser smoothing time constant', async () => {
      const visualizer = new PeerVisualizer();
      await visualizer.initialize();

      visualizer.addStream('peer-1', createMockStream());
      const analyser = mockAudioContext.getMockAnalysers()[0];

      visualizer.setSmoothingTimeConstant(0.5);

      expect(analyser.smoothingTimeConstant).toBe(0.5);
    });
  });

  describe('Pause/Resume', () => {
    it('pauses visualization', async () => {
      const visualizer = new PeerVisualizer();
      await visualizer.initialize();

      visualizer.addStream('peer-1', createMockStream());
      expect(visualizer.getIsRunning()).toBe(true);

      visualizer.pause();
      expect(visualizer.getIsRunning()).toBe(false);
    });

    it('resumes visualization', async () => {
      const visualizer = new PeerVisualizer();
      await visualizer.initialize();

      visualizer.addStream('peer-1', createMockStream());
      visualizer.pause();
      expect(visualizer.getIsRunning()).toBe(false);

      visualizer.resume();
      expect(visualizer.getIsRunning()).toBe(true);
    });

    it('does not resume if no sources', async () => {
      const visualizer = new PeerVisualizer();
      await visualizer.initialize();

      visualizer.resume();
      expect(visualizer.getIsRunning()).toBe(false);
    });
  });

  describe('Dispose', () => {
    it('disconnects all sources', async () => {
      const visualizer = new PeerVisualizer();
      await visualizer.initialize();

      visualizer.addStream('peer-1', createMockStream());
      visualizer.addStream('peer-2', createMockStream());

      const sourceNode1 = mockAudioContext.createMediaStreamSource.mock.results[0].value;
      const sourceNode2 = mockAudioContext.createMediaStreamSource.mock.results[1].value;

      visualizer.dispose();

      expect(sourceNode1.disconnect).toHaveBeenCalled();
      expect(sourceNode2.disconnect).toHaveBeenCalled();
    });

    it('clears all sources', async () => {
      const visualizer = new PeerVisualizer();
      await visualizer.initialize();

      visualizer.addStream('peer-1', createMockStream());
      visualizer.dispose();

      expect(visualizer.getSourceCount()).toBe(0);
    });

    it('closes owned audio context', async () => {
      const visualizer = new PeerVisualizer();
      await visualizer.initialize();

      visualizer.dispose();

      expect(mockAudioContext.close).toHaveBeenCalled();
    });

    it('does not close provided audio context', async () => {
      const customContext = new MockAudioContext() as unknown as AudioContext;
      const visualizer = new PeerVisualizer({ audioContext: customContext });
      await visualizer.initialize();

      visualizer.dispose();

      expect((customContext as unknown as MockAudioContext).close).not.toHaveBeenCalled();
    });

    it('sets initialized to false', async () => {
      const visualizer = new PeerVisualizer();
      await visualizer.initialize();

      visualizer.dispose();

      expect(visualizer.getIsInitialized()).toBe(false);
    });

    it('stops visualization', async () => {
      const visualizer = new PeerVisualizer();
      await visualizer.initialize();

      visualizer.addStream('peer-1', createMockStream());
      expect(visualizer.getIsRunning()).toBe(true);

      visualizer.dispose();
      expect(visualizer.getIsRunning()).toBe(false);
    });
  });

  describe('Local vs Remote', () => {
    it('distinguishes local from remote streams', async () => {
      const visualizer = new PeerVisualizer();
      await visualizer.initialize();

      visualizer.addStream('local', createMockStream(), true);
      visualizer.addStream('remote', createMockStream(), false);

      const allData = visualizer.getAllVisualizationData();

      expect(allData.find((d) => d.peerId === 'local')?.isLocal).toBe(true);
      expect(allData.find((d) => d.peerId === 'remote')?.isLocal).toBe(false);
    });
  });

  describe('createPeerVisualizer factory', () => {
    it('creates visualizer instance', () => {
      const visualizer = createPeerVisualizer();
      expect(visualizer).toBeInstanceOf(PeerVisualizer);
    });

    it('passes options and callbacks', async () => {
      const onVisualizationUpdate = vi.fn();
      const visualizer = createPeerVisualizer(
        { fftSize: 512 },
        { onVisualizationUpdate }
      );

      expect(visualizer.getFftSize()).toBe(512);
    });
  });
});
