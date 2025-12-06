/**
 * Speaking Detector
 *
 * Per-peer audio analysis for speaking detection using AnalyserNode.
 * Detects when peers are speaking based on audio volume levels.
 *
 * Part of the Long-Horizon Engineering Protocol - FEAT-203
 */

import type { PeerId } from '@/types/peer';

/**
 * Speaking state for a peer
 */
export interface PeerSpeakingState {
  /** Peer ID */
  peerId: PeerId;
  /** Whether the peer is currently speaking */
  isSpeaking: boolean;
  /** Current audio level (0-1) */
  audioLevel: number;
  /** Time when speaking started (null if not speaking) */
  speakingStartTime: number | null;
  /** Duration of current speaking session in ms */
  speakingDuration: number;
}

/**
 * Speaking detector options
 */
export interface SpeakingDetectorOptions {
  /** Audio context to use (creates one if not provided) */
  audioContext?: AudioContext;
  /** Volume threshold to consider as speaking (0-1, default: 0.01) */
  speakingThreshold?: number;
  /** Hysteresis threshold - lower threshold to stop speaking (default: 0.005) */
  silenceThreshold?: number;
  /** Debounce time in ms before marking as not speaking (default: 300) */
  silenceDebounceMs?: number;
  /** How often to analyze audio in ms (default: 50) */
  analyzeIntervalMs?: number;
  /** FFT size for analyser (default: 256) */
  fftSize?: number;
  /** Smoothing time constant for analyser (0-1, default: 0.8) */
  smoothingTimeConstant?: number;
}

/**
 * Source info with analyser
 */
interface SourceInfo {
  peerId: PeerId;
  stream: MediaStream;
  sourceNode: MediaStreamAudioSourceNode;
  analyserNode: AnalyserNode;
  isSpeaking: boolean;
  audioLevel: number;
  speakingStartTime: number | null;
  lastSpeakingTime: number;
}

/**
 * Callbacks for speaking events
 */
export interface SpeakingDetectorCallbacks {
  /** Called when a peer starts speaking */
  onSpeakingStart?: (peerId: PeerId) => void;
  /** Called when a peer stops speaking */
  onSpeakingEnd?: (peerId: PeerId, duration: number) => void;
  /** Called on every audio level update */
  onAudioLevelChange?: (peerId: PeerId, level: number) => void;
  /** Called when speaking state changes */
  onSpeakingStateChange?: (states: PeerSpeakingState[]) => void;
}

/**
 * Default options
 */
const DEFAULT_OPTIONS: Required<Omit<SpeakingDetectorOptions, 'audioContext'>> = {
  speakingThreshold: 0.01,
  silenceThreshold: 0.005,
  silenceDebounceMs: 300,
  analyzeIntervalMs: 50,
  fftSize: 256,
  smoothingTimeConstant: 0.8,
};

/**
 * SpeakingDetector class
 *
 * Analyzes audio streams to detect when peers are speaking.
 *
 * @example
 * ```ts
 * const detector = new SpeakingDetector({
 *   onSpeakingStart: (peerId) => console.log(`${peerId} started speaking`),
 *   onSpeakingEnd: (peerId, duration) => console.log(`${peerId} stopped after ${duration}ms`),
 * });
 *
 * await detector.initialize();
 * detector.addStream('peer-1', stream);
 *
 * // Get current states
 * const states = detector.getAllStates();
 * ```
 */
export class SpeakingDetector {
  private audioContext: AudioContext | null = null;
  private ownAudioContext: boolean = false;
  private sources: Map<PeerId, SourceInfo> = new Map();
  private analyzeInterval: ReturnType<typeof setInterval> | null = null;
  private isInitialized: boolean = false;
  private isRunning: boolean = false;

  // Options
  private speakingThreshold: number;
  private silenceThreshold: number;
  private silenceDebounceMs: number;
  private analyzeIntervalMs: number;
  private fftSize: number;
  private smoothingTimeConstant: number;

  // Callbacks
  private callbacks: SpeakingDetectorCallbacks;

  constructor(
    options: SpeakingDetectorOptions = {},
    callbacks: SpeakingDetectorCallbacks = {}
  ) {
    this.speakingThreshold = options.speakingThreshold ?? DEFAULT_OPTIONS.speakingThreshold;
    this.silenceThreshold = options.silenceThreshold ?? DEFAULT_OPTIONS.silenceThreshold;
    this.silenceDebounceMs = options.silenceDebounceMs ?? DEFAULT_OPTIONS.silenceDebounceMs;
    this.analyzeIntervalMs = options.analyzeIntervalMs ?? DEFAULT_OPTIONS.analyzeIntervalMs;
    this.fftSize = options.fftSize ?? DEFAULT_OPTIONS.fftSize;
    this.smoothingTimeConstant = options.smoothingTimeConstant ?? DEFAULT_OPTIONS.smoothingTimeConstant;

    if (options.audioContext) {
      this.audioContext = options.audioContext;
      this.ownAudioContext = false;
    }

    this.callbacks = callbacks;
  }

  /**
   * Initialize the detector
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    // Create audio context if needed
    if (!this.audioContext) {
      this.audioContext = new AudioContext();
      this.ownAudioContext = true;
    }

    // Resume if suspended
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }

    this.isInitialized = true;
  }

  /**
   * Add a stream to monitor
   */
  addStream(peerId: PeerId, stream: MediaStream): void {
    if (!this.isInitialized || !this.audioContext) {
      throw new Error('SpeakingDetector not initialized. Call initialize() first.');
    }

    // Remove existing if present
    if (this.sources.has(peerId)) {
      this.removeStream(peerId);
    }

    // Create source node
    const sourceNode = this.audioContext.createMediaStreamSource(stream);

    // Create analyser node
    const analyserNode = this.audioContext.createAnalyser();
    analyserNode.fftSize = this.fftSize;
    analyserNode.smoothingTimeConstant = this.smoothingTimeConstant;

    // Connect source to analyser
    sourceNode.connect(analyserNode);

    // Store source info
    this.sources.set(peerId, {
      peerId,
      stream,
      sourceNode,
      analyserNode,
      isSpeaking: false,
      audioLevel: 0,
      speakingStartTime: null,
      lastSpeakingTime: 0,
    });

    // Start analysis if not already running
    if (!this.isRunning && this.sources.size > 0) {
      this.startAnalysis();
    }
  }

  /**
   * Remove a stream from monitoring
   */
  removeStream(peerId: PeerId): boolean {
    const source = this.sources.get(peerId);
    if (!source) {
      return false;
    }

    // If was speaking, emit end event
    if (source.isSpeaking && source.speakingStartTime !== null) {
      const duration = Date.now() - source.speakingStartTime;
      this.callbacks.onSpeakingEnd?.(peerId, duration);
    }

    // Disconnect nodes
    source.sourceNode.disconnect();
    source.analyserNode.disconnect();

    // Remove from map
    this.sources.delete(peerId);

    // Stop analysis if no more sources
    if (this.sources.size === 0) {
      this.stopAnalysis();
    }

    return true;
  }

  /**
   * Check if a stream is being monitored
   */
  hasStream(peerId: PeerId): boolean {
    return this.sources.has(peerId);
  }

  /**
   * Get speaking state for a peer
   */
  getState(peerId: PeerId): PeerSpeakingState | null {
    const source = this.sources.get(peerId);
    if (!source) {
      return null;
    }

    return {
      peerId: source.peerId,
      isSpeaking: source.isSpeaking,
      audioLevel: source.audioLevel,
      speakingStartTime: source.speakingStartTime,
      speakingDuration: source.speakingStartTime ? Date.now() - source.speakingStartTime : 0,
    };
  }

  /**
   * Get speaking states for all peers
   */
  getAllStates(): PeerSpeakingState[] {
    const states: PeerSpeakingState[] = [];
    this.sources.forEach((source) => {
      states.push({
        peerId: source.peerId,
        isSpeaking: source.isSpeaking,
        audioLevel: source.audioLevel,
        speakingStartTime: source.speakingStartTime,
        speakingDuration: source.speakingStartTime ? Date.now() - source.speakingStartTime : 0,
      });
    });
    return states;
  }

  /**
   * Get IDs of all peers who are currently speaking
   */
  getSpeakingPeers(): PeerId[] {
    const speaking: PeerId[] = [];
    this.sources.forEach((source) => {
      if (source.isSpeaking) {
        speaking.push(source.peerId);
      }
    });
    return speaking;
  }

  /**
   * Check if a specific peer is speaking
   */
  isSpeaking(peerId: PeerId): boolean {
    return this.sources.get(peerId)?.isSpeaking ?? false;
  }

  /**
   * Get audio level for a peer (0-1)
   */
  getAudioLevel(peerId: PeerId): number {
    return this.sources.get(peerId)?.audioLevel ?? 0;
  }

  /**
   * Set speaking threshold
   */
  setSpeakingThreshold(threshold: number): void {
    this.speakingThreshold = Math.max(0, Math.min(1, threshold));
  }

  /**
   * Get speaking threshold
   */
  getSpeakingThreshold(): number {
    return this.speakingThreshold;
  }

  /**
   * Set silence threshold
   */
  setSilenceThreshold(threshold: number): void {
    this.silenceThreshold = Math.max(0, Math.min(1, threshold));
  }

  /**
   * Get silence threshold
   */
  getSilenceThreshold(): number {
    return this.silenceThreshold;
  }

  /**
   * Set silence debounce time
   */
  setSilenceDebounceMs(ms: number): void {
    this.silenceDebounceMs = Math.max(0, ms);
  }

  /**
   * Get silence debounce time
   */
  getSilenceDebounceMs(): number {
    return this.silenceDebounceMs;
  }

  /**
   * Get source count
   */
  getSourceCount(): number {
    return this.sources.size;
  }

  /**
   * Get all monitored peer IDs
   */
  getSourceIds(): PeerId[] {
    return Array.from(this.sources.keys());
  }

  /**
   * Check if initialized
   */
  getIsInitialized(): boolean {
    return this.isInitialized;
  }

  /**
   * Check if analysis is running
   */
  getIsRunning(): boolean {
    return this.isRunning;
  }

  /**
   * Start the analysis loop
   */
  private startAnalysis(): void {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    this.analyzeInterval = setInterval(() => {
      this.analyzeAllSources();
    }, this.analyzeIntervalMs);
  }

  /**
   * Stop the analysis loop
   */
  private stopAnalysis(): void {
    if (this.analyzeInterval) {
      clearInterval(this.analyzeInterval);
      this.analyzeInterval = null;
    }
    this.isRunning = false;
  }

  /**
   * Analyze all sources
   */
  private analyzeAllSources(): void {
    const now = Date.now();
    let stateChanged = false;

    this.sources.forEach((source) => {
      const previousLevel = source.audioLevel;
      const wasSpeeaking = source.isSpeaking;

      // Get audio level
      const level = this.getAudioLevelFromAnalyser(source.analyserNode);
      source.audioLevel = level;

      // Emit level change if significant
      if (Math.abs(level - previousLevel) > 0.001) {
        this.callbacks.onAudioLevelChange?.(source.peerId, level);
      }

      // Detect speaking state
      if (!source.isSpeaking && level >= this.speakingThreshold) {
        // Start speaking
        source.isSpeaking = true;
        source.speakingStartTime = now;
        source.lastSpeakingTime = now;
        stateChanged = true;
        this.callbacks.onSpeakingStart?.(source.peerId);
      } else if (source.isSpeaking) {
        if (level >= this.silenceThreshold) {
          // Still speaking
          source.lastSpeakingTime = now;
        } else if (now - source.lastSpeakingTime > this.silenceDebounceMs) {
          // Stop speaking (debounced)
          const duration = source.speakingStartTime ? now - source.speakingStartTime : 0;
          source.isSpeaking = false;
          source.speakingStartTime = null;
          stateChanged = true;
          this.callbacks.onSpeakingEnd?.(source.peerId, duration);
        }
      }

      // Track if any state changed
      if (wasSpeeaking !== source.isSpeaking) {
        stateChanged = true;
      }
    });

    // Emit state change callback
    if (stateChanged) {
      this.callbacks.onSpeakingStateChange?.(this.getAllStates());
    }
  }

  /**
   * Get audio level from analyser node
   */
  private getAudioLevelFromAnalyser(analyser: AnalyserNode): number {
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(dataArray);

    // Calculate RMS (root mean square) for volume level
    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
      const normalized = dataArray[i] / 255;
      sum += normalized * normalized;
    }
    const rms = Math.sqrt(sum / dataArray.length);

    return rms;
  }

  /**
   * Pause analysis (without disposing)
   */
  pause(): void {
    this.stopAnalysis();
  }

  /**
   * Resume analysis
   */
  resume(): void {
    if (this.isInitialized && this.sources.size > 0 && !this.isRunning) {
      this.startAnalysis();
    }
  }

  /**
   * Dispose and release all resources
   */
  dispose(): void {
    // Stop analysis
    this.stopAnalysis();

    // Disconnect all sources
    this.sources.forEach((source) => {
      source.sourceNode.disconnect();
      source.analyserNode.disconnect();
    });
    this.sources.clear();

    // Close audio context if we own it
    if (this.ownAudioContext && this.audioContext) {
      this.audioContext.close();
    }
    this.audioContext = null;

    this.isInitialized = false;
  }
}

/**
 * Create a new speaking detector instance
 */
export function createSpeakingDetector(
  options?: SpeakingDetectorOptions,
  callbacks?: SpeakingDetectorCallbacks
): SpeakingDetector {
  return new SpeakingDetector(options, callbacks);
}
