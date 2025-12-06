/**
 * Speaking Detection Tests
 *
 * Tests for per-peer audio analysis and speaking detection.
 *
 * Part of the Long-Horizon Engineering Protocol - FEAT-203
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SpeakingDetector, createSpeakingDetector } from '@/lib/audio/speaking-detector';

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
    // Fill with values based on mock level
    const value = Math.round(this.mockLevel * 255);
    for (let i = 0; i < array.length; i++) {
      array[i] = value;
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

  // Test helper: get mock analysers
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

beforeEach(() => {
  mockAudioContext = new MockAudioContext();
  vi.stubGlobal('AudioContext', function () {
    return mockAudioContext;
  });
  vi.useFakeTimers();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe('SpeakingDetector', () => {
  describe('Initialization', () => {
    it('creates detector with default options', () => {
      const detector = new SpeakingDetector();
      expect(detector).toBeInstanceOf(SpeakingDetector);
      expect(detector.getIsInitialized()).toBe(false);
    });

    it('initializes audio context', async () => {
      const detector = new SpeakingDetector();
      await detector.initialize();

      expect(detector.getIsInitialized()).toBe(true);
    });

    it('uses provided audio context', async () => {
      const customContext = new MockAudioContext() as unknown as AudioContext;
      const detector = new SpeakingDetector({ audioContext: customContext });
      await detector.initialize();

      expect(detector.getIsInitialized()).toBe(true);
    });

    it('resumes suspended audio context', async () => {
      mockAudioContext.state = 'suspended';
      const detector = new SpeakingDetector();
      await detector.initialize();

      expect(mockAudioContext.resume).toHaveBeenCalled();
    });

    it('does not reinitialize if already initialized', async () => {
      const detector = new SpeakingDetector();
      await detector.initialize();
      await detector.initialize();

      // Only one context created
      expect(detector.getIsInitialized()).toBe(true);
    });
  });

  describe('Adding Streams', () => {
    it('adds stream to monitor', async () => {
      const detector = new SpeakingDetector();
      await detector.initialize();

      detector.addStream('peer-1', createMockStream());

      expect(detector.hasStream('peer-1')).toBe(true);
      expect(detector.getSourceCount()).toBe(1);
    });

    it('creates analyser node for stream', async () => {
      const detector = new SpeakingDetector();
      await detector.initialize();

      detector.addStream('peer-1', createMockStream());

      expect(mockAudioContext.createMediaStreamSource).toHaveBeenCalled();
      expect(mockAudioContext.createAnalyser).toHaveBeenCalled();
    });

    it('connects source to analyser', async () => {
      const detector = new SpeakingDetector();
      await detector.initialize();

      detector.addStream('peer-1', createMockStream());

      const sourceNode = mockAudioContext.createMediaStreamSource.mock.results[0].value;
      expect(sourceNode.connect).toHaveBeenCalled();
    });

    it('starts analysis when first stream added', async () => {
      const detector = new SpeakingDetector();
      await detector.initialize();

      expect(detector.getIsRunning()).toBe(false);

      detector.addStream('peer-1', createMockStream());

      expect(detector.getIsRunning()).toBe(true);
    });

    it('throws if not initialized', () => {
      const detector = new SpeakingDetector();

      expect(() => {
        detector.addStream('peer-1', createMockStream());
      }).toThrow('not initialized');
    });

    it('replaces existing stream with same ID', async () => {
      const detector = new SpeakingDetector();
      await detector.initialize();

      detector.addStream('peer-1', createMockStream('stream-1'));
      detector.addStream('peer-1', createMockStream('stream-2'));

      expect(detector.getSourceCount()).toBe(1);
    });

    it('adds multiple streams', async () => {
      const detector = new SpeakingDetector();
      await detector.initialize();

      detector.addStream('peer-1', createMockStream());
      detector.addStream('peer-2', createMockStream());
      detector.addStream('peer-3', createMockStream());

      expect(detector.getSourceCount()).toBe(3);
      expect(detector.getSourceIds()).toEqual(['peer-1', 'peer-2', 'peer-3']);
    });
  });

  describe('Removing Streams', () => {
    it('removes stream from monitoring', async () => {
      const detector = new SpeakingDetector();
      await detector.initialize();

      detector.addStream('peer-1', createMockStream());
      const removed = detector.removeStream('peer-1');

      expect(removed).toBe(true);
      expect(detector.hasStream('peer-1')).toBe(false);
      expect(detector.getSourceCount()).toBe(0);
    });

    it('disconnects nodes when removing', async () => {
      const detector = new SpeakingDetector();
      await detector.initialize();

      detector.addStream('peer-1', createMockStream());

      const sourceNode = mockAudioContext.createMediaStreamSource.mock.results[0].value;
      const analyserNode = mockAudioContext.createAnalyser.mock.results[0].value;

      detector.removeStream('peer-1');

      expect(sourceNode.disconnect).toHaveBeenCalled();
      expect(analyserNode.disconnect).toHaveBeenCalled();
    });

    it('stops analysis when last stream removed', async () => {
      const detector = new SpeakingDetector();
      await detector.initialize();

      detector.addStream('peer-1', createMockStream());
      expect(detector.getIsRunning()).toBe(true);

      detector.removeStream('peer-1');
      expect(detector.getIsRunning()).toBe(false);
    });

    it('returns false for non-existent stream', async () => {
      const detector = new SpeakingDetector();
      await detector.initialize();

      const removed = detector.removeStream('non-existent');
      expect(removed).toBe(false);
    });
  });

  describe('Speaking Detection', () => {
    it('detects speaking when level exceeds threshold', async () => {
      const onSpeakingStart = vi.fn();
      const detector = new SpeakingDetector(
        { speakingThreshold: 0.1 },
        { onSpeakingStart }
      );
      await detector.initialize();

      detector.addStream('peer-1', createMockStream());

      // Set audio level above threshold
      const analyser = mockAudioContext.getMockAnalysers()[0];
      analyser.setMockLevel(0.5);

      // Advance time to trigger analysis
      vi.advanceTimersByTime(50);

      expect(onSpeakingStart).toHaveBeenCalledWith('peer-1');
      expect(detector.isSpeaking('peer-1')).toBe(true);
    });

    it('does not detect speaking below threshold', async () => {
      const onSpeakingStart = vi.fn();
      const detector = new SpeakingDetector(
        { speakingThreshold: 0.1 },
        { onSpeakingStart }
      );
      await detector.initialize();

      detector.addStream('peer-1', createMockStream());

      // Set audio level below threshold
      const analyser = mockAudioContext.getMockAnalysers()[0];
      analyser.setMockLevel(0.05);

      vi.advanceTimersByTime(50);

      expect(onSpeakingStart).not.toHaveBeenCalled();
      expect(detector.isSpeaking('peer-1')).toBe(false);
    });

    it('detects speaking end after silence debounce', async () => {
      const onSpeakingStart = vi.fn();
      const onSpeakingEnd = vi.fn();
      const detector = new SpeakingDetector(
        { speakingThreshold: 0.1, silenceThreshold: 0.05, silenceDebounceMs: 100 },
        { onSpeakingStart, onSpeakingEnd }
      );
      await detector.initialize();

      detector.addStream('peer-1', createMockStream());
      const analyser = mockAudioContext.getMockAnalysers()[0];

      // Start speaking
      analyser.setMockLevel(0.5);
      vi.advanceTimersByTime(50);
      expect(detector.isSpeaking('peer-1')).toBe(true);

      // Go silent
      analyser.setMockLevel(0);
      vi.advanceTimersByTime(50);
      // Still speaking due to debounce
      expect(detector.isSpeaking('peer-1')).toBe(true);

      // Wait for debounce
      vi.advanceTimersByTime(150);
      expect(detector.isSpeaking('peer-1')).toBe(false);
      expect(onSpeakingEnd).toHaveBeenCalledWith('peer-1', expect.any(Number));
    });

    it('uses hysteresis threshold', async () => {
      const detector = new SpeakingDetector({
        speakingThreshold: 0.1,
        silenceThreshold: 0.03,
        silenceDebounceMs: 0,
      });
      await detector.initialize();

      detector.addStream('peer-1', createMockStream());
      const analyser = mockAudioContext.getMockAnalysers()[0];

      // Start speaking
      analyser.setMockLevel(0.5);
      vi.advanceTimersByTime(50);
      expect(detector.isSpeaking('peer-1')).toBe(true);

      // Drop to middle level (below speaking threshold but above silence)
      analyser.setMockLevel(0.05);
      vi.advanceTimersByTime(50);
      // Still speaking due to hysteresis
      expect(detector.isSpeaking('peer-1')).toBe(true);

      // Drop below silence threshold
      analyser.setMockLevel(0.01);
      vi.advanceTimersByTime(50);
      expect(detector.isSpeaking('peer-1')).toBe(false);
    });
  });

  describe('Audio Level', () => {
    it('tracks audio level', async () => {
      const detector = new SpeakingDetector();
      await detector.initialize();

      detector.addStream('peer-1', createMockStream());
      const analyser = mockAudioContext.getMockAnalysers()[0];

      analyser.setMockLevel(0.7);
      vi.advanceTimersByTime(50);

      // Level should be approximately 0.7 (RMS calculation)
      expect(detector.getAudioLevel('peer-1')).toBeCloseTo(0.7, 1);
    });

    it('calls onAudioLevelChange callback', async () => {
      const onAudioLevelChange = vi.fn();
      const detector = new SpeakingDetector({}, { onAudioLevelChange });
      await detector.initialize();

      detector.addStream('peer-1', createMockStream());
      const analyser = mockAudioContext.getMockAnalysers()[0];

      analyser.setMockLevel(0.5);
      vi.advanceTimersByTime(50);

      expect(onAudioLevelChange).toHaveBeenCalledWith('peer-1', expect.any(Number));
    });

    it('returns 0 for non-existent peer', async () => {
      const detector = new SpeakingDetector();
      await detector.initialize();

      expect(detector.getAudioLevel('non-existent')).toBe(0);
    });
  });

  describe('Speaking State', () => {
    it('returns speaking state for peer', async () => {
      const detector = new SpeakingDetector({ speakingThreshold: 0.1 });
      await detector.initialize();

      detector.addStream('peer-1', createMockStream());
      const analyser = mockAudioContext.getMockAnalysers()[0];

      analyser.setMockLevel(0.5);
      vi.advanceTimersByTime(50);

      const state = detector.getState('peer-1');
      expect(state).not.toBeNull();
      expect(state?.isSpeaking).toBe(true);
      expect(state?.audioLevel).toBeGreaterThan(0);
      expect(state?.speakingStartTime).not.toBeNull();
    });

    it('returns all states', async () => {
      const detector = new SpeakingDetector({ speakingThreshold: 0.1 });
      await detector.initialize();

      detector.addStream('peer-1', createMockStream());
      detector.addStream('peer-2', createMockStream());

      const analysers = mockAudioContext.getMockAnalysers();
      analysers[0].setMockLevel(0.5);
      analysers[1].setMockLevel(0.02);
      vi.advanceTimersByTime(50);

      const states = detector.getAllStates();
      expect(states).toHaveLength(2);
      expect(states.find((s) => s.peerId === 'peer-1')?.isSpeaking).toBe(true);
      expect(states.find((s) => s.peerId === 'peer-2')?.isSpeaking).toBe(false);
    });

    it('returns speaking peers', async () => {
      const detector = new SpeakingDetector({ speakingThreshold: 0.1 });
      await detector.initialize();

      detector.addStream('peer-1', createMockStream());
      detector.addStream('peer-2', createMockStream());
      detector.addStream('peer-3', createMockStream());

      const analysers = mockAudioContext.getMockAnalysers();
      analysers[0].setMockLevel(0.5);
      analysers[1].setMockLevel(0.02);
      analysers[2].setMockLevel(0.5);
      vi.advanceTimersByTime(50);

      const speaking = detector.getSpeakingPeers();
      expect(speaking).toEqual(['peer-1', 'peer-3']);
    });

    it('returns null for non-existent peer', async () => {
      const detector = new SpeakingDetector();
      await detector.initialize();

      expect(detector.getState('non-existent')).toBeNull();
    });

    it('tracks speaking duration', async () => {
      const detector = new SpeakingDetector({ speakingThreshold: 0.1 });
      await detector.initialize();

      detector.addStream('peer-1', createMockStream());
      const analyser = mockAudioContext.getMockAnalysers()[0];

      analyser.setMockLevel(0.5);
      vi.advanceTimersByTime(50);

      // Advance more time
      vi.advanceTimersByTime(500);

      const state = detector.getState('peer-1');
      expect(state?.speakingDuration).toBeGreaterThan(400);
    });
  });

  describe('State Change Callback', () => {
    it('calls onSpeakingStateChange when state changes', async () => {
      const onSpeakingStateChange = vi.fn();
      const detector = new SpeakingDetector(
        { speakingThreshold: 0.1 },
        { onSpeakingStateChange }
      );
      await detector.initialize();

      detector.addStream('peer-1', createMockStream());
      const analyser = mockAudioContext.getMockAnalysers()[0];

      analyser.setMockLevel(0.5);
      vi.advanceTimersByTime(50);

      expect(onSpeakingStateChange).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            peerId: 'peer-1',
            isSpeaking: true,
          }),
        ])
      );
    });
  });

  describe('Threshold Configuration', () => {
    it('sets and gets speaking threshold', async () => {
      const detector = new SpeakingDetector({ speakingThreshold: 0.1 });
      await detector.initialize();

      expect(detector.getSpeakingThreshold()).toBe(0.1);

      detector.setSpeakingThreshold(0.2);
      expect(detector.getSpeakingThreshold()).toBe(0.2);
    });

    it('clamps threshold to valid range', async () => {
      const detector = new SpeakingDetector();
      await detector.initialize();

      detector.setSpeakingThreshold(1.5);
      expect(detector.getSpeakingThreshold()).toBe(1);

      detector.setSpeakingThreshold(-0.5);
      expect(detector.getSpeakingThreshold()).toBe(0);
    });

    it('sets and gets silence threshold', async () => {
      const detector = new SpeakingDetector({ silenceThreshold: 0.05 });
      await detector.initialize();

      expect(detector.getSilenceThreshold()).toBe(0.05);

      detector.setSilenceThreshold(0.02);
      expect(detector.getSilenceThreshold()).toBe(0.02);
    });

    it('sets and gets silence debounce', async () => {
      const detector = new SpeakingDetector({ silenceDebounceMs: 200 });
      await detector.initialize();

      expect(detector.getSilenceDebounceMs()).toBe(200);

      detector.setSilenceDebounceMs(500);
      expect(detector.getSilenceDebounceMs()).toBe(500);
    });
  });

  describe('Pause/Resume', () => {
    it('pauses analysis', async () => {
      const detector = new SpeakingDetector();
      await detector.initialize();

      detector.addStream('peer-1', createMockStream());
      expect(detector.getIsRunning()).toBe(true);

      detector.pause();
      expect(detector.getIsRunning()).toBe(false);
    });

    it('resumes analysis', async () => {
      const detector = new SpeakingDetector();
      await detector.initialize();

      detector.addStream('peer-1', createMockStream());
      detector.pause();
      expect(detector.getIsRunning()).toBe(false);

      detector.resume();
      expect(detector.getIsRunning()).toBe(true);
    });

    it('does not resume if no sources', async () => {
      const detector = new SpeakingDetector();
      await detector.initialize();

      detector.resume();
      expect(detector.getIsRunning()).toBe(false);
    });
  });

  describe('Dispose', () => {
    it('disconnects all sources', async () => {
      const detector = new SpeakingDetector();
      await detector.initialize();

      detector.addStream('peer-1', createMockStream());
      detector.addStream('peer-2', createMockStream());

      const sourceNode1 = mockAudioContext.createMediaStreamSource.mock.results[0].value;
      const sourceNode2 = mockAudioContext.createMediaStreamSource.mock.results[1].value;

      detector.dispose();

      expect(sourceNode1.disconnect).toHaveBeenCalled();
      expect(sourceNode2.disconnect).toHaveBeenCalled();
    });

    it('clears all sources', async () => {
      const detector = new SpeakingDetector();
      await detector.initialize();

      detector.addStream('peer-1', createMockStream());
      detector.dispose();

      expect(detector.getSourceCount()).toBe(0);
    });

    it('closes owned audio context', async () => {
      const detector = new SpeakingDetector();
      await detector.initialize();

      detector.dispose();

      expect(mockAudioContext.close).toHaveBeenCalled();
    });

    it('does not close provided audio context', async () => {
      const customContext = new MockAudioContext() as unknown as AudioContext;
      const detector = new SpeakingDetector({ audioContext: customContext });
      await detector.initialize();

      detector.dispose();

      expect((customContext as unknown as MockAudioContext).close).not.toHaveBeenCalled();
    });

    it('sets initialized to false', async () => {
      const detector = new SpeakingDetector();
      await detector.initialize();

      detector.dispose();

      expect(detector.getIsInitialized()).toBe(false);
    });

    it('stops analysis', async () => {
      const detector = new SpeakingDetector();
      await detector.initialize();

      detector.addStream('peer-1', createMockStream());
      expect(detector.getIsRunning()).toBe(true);

      detector.dispose();
      expect(detector.getIsRunning()).toBe(false);
    });
  });

  describe('Speaking End on Remove', () => {
    it('emits speaking end when removing speaking peer', async () => {
      const onSpeakingEnd = vi.fn();
      const detector = new SpeakingDetector(
        { speakingThreshold: 0.1 },
        { onSpeakingEnd }
      );
      await detector.initialize();

      detector.addStream('peer-1', createMockStream());
      const analyser = mockAudioContext.getMockAnalysers()[0];

      // Start speaking
      analyser.setMockLevel(0.5);
      vi.advanceTimersByTime(50);
      expect(detector.isSpeaking('peer-1')).toBe(true);

      // Remove while speaking
      detector.removeStream('peer-1');

      expect(onSpeakingEnd).toHaveBeenCalledWith('peer-1', expect.any(Number));
    });
  });

  describe('createSpeakingDetector factory', () => {
    it('creates detector instance', () => {
      const detector = createSpeakingDetector();
      expect(detector).toBeInstanceOf(SpeakingDetector);
    });

    it('passes options and callbacks', () => {
      const onSpeakingStart = vi.fn();
      const detector = createSpeakingDetector(
        { speakingThreshold: 0.2 },
        { onSpeakingStart }
      );

      expect(detector.getSpeakingThreshold()).toBe(0.2);
    });
  });
});
