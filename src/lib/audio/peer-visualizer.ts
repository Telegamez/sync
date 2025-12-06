/**
 * Peer Audio Visualizer
 *
 * Per-peer audio visualization using AnalyserNode.
 * Provides audio level data for visual feedback on participant avatars.
 *
 * Part of the Long-Horizon Engineering Protocol - FEAT-204
 */

import type { PeerId } from '@/types/peer';

/**
 * Visualization data for a peer
 */
export interface PeerVisualizationData {
  /** Peer ID */
  peerId: PeerId;
  /** Current audio level (0-1) */
  audioLevel: number;
  /** Frequency data for waveform visualization (0-255 values) */
  frequencyData: Uint8Array;
  /** Time domain data for oscilloscope visualization (0-255 values) */
  timeDomainData: Uint8Array;
  /** Whether the peer is local (for different styling) */
  isLocal: boolean;
}

/**
 * Visualizer options
 */
export interface PeerVisualizerOptions {
  /** Audio context to use (creates one if not provided) */
  audioContext?: AudioContext;
  /** FFT size for analyser (default: 256) */
  fftSize?: number;
  /** Smoothing time constant for analyser (0-1, default: 0.8) */
  smoothingTimeConstant?: number;
  /** How often to update visualization in ms (default: 16 ~60fps) */
  updateIntervalMs?: number;
  /** Whether to track frequency data (default: true) */
  trackFrequencyData?: boolean;
  /** Whether to track time domain data (default: false) */
  trackTimeDomainData?: boolean;
}

/**
 * Source info with analyser
 */
interface SourceInfo {
  peerId: PeerId;
  stream: MediaStream;
  sourceNode: MediaStreamAudioSourceNode;
  analyserNode: AnalyserNode;
  frequencyData: Uint8Array;
  timeDomainData: Uint8Array;
  isLocal: boolean;
}

/**
 * Callbacks for visualization updates
 */
export interface PeerVisualizerCallbacks {
  /** Called on each visualization update with all peer data */
  onVisualizationUpdate?: (data: PeerVisualizationData[]) => void;
  /** Called when a single peer's visualization updates */
  onPeerUpdate?: (data: PeerVisualizationData) => void;
}

/**
 * Default options
 */
const DEFAULT_OPTIONS: Required<Omit<PeerVisualizerOptions, 'audioContext'>> = {
  fftSize: 256,
  smoothingTimeConstant: 0.8,
  updateIntervalMs: 16, // ~60fps
  trackFrequencyData: true,
  trackTimeDomainData: false,
};

/**
 * PeerVisualizer class
 *
 * Provides audio visualization data for multiple peers.
 *
 * @example
 * ```ts
 * const visualizer = new PeerVisualizer({
 *   onVisualizationUpdate: (data) => {
 *     data.forEach(peerData => {
 *       updateAvatarVisualization(peerData.peerId, peerData.audioLevel);
 *     });
 *   },
 * });
 *
 * await visualizer.initialize();
 * visualizer.addStream('peer-1', stream);
 * visualizer.addStream('local', localStream, true);
 * ```
 */
export class PeerVisualizer {
  private audioContext: AudioContext | null = null;
  private ownAudioContext: boolean = false;
  private sources: Map<PeerId, SourceInfo> = new Map();
  private updateInterval: ReturnType<typeof setInterval> | null = null;
  private animationFrameId: number | null = null;
  private isInitialized: boolean = false;
  private isRunning: boolean = false;

  // Options
  private fftSize: number;
  private smoothingTimeConstant: number;
  private updateIntervalMs: number;
  private trackFrequencyData: boolean;
  private trackTimeDomainData: boolean;

  // Callbacks
  private callbacks: PeerVisualizerCallbacks;

  // Use requestAnimationFrame for smooth updates
  private useAnimationFrame: boolean = true;

  constructor(
    options: PeerVisualizerOptions = {},
    callbacks: PeerVisualizerCallbacks = {}
  ) {
    this.fftSize = options.fftSize ?? DEFAULT_OPTIONS.fftSize;
    this.smoothingTimeConstant = options.smoothingTimeConstant ?? DEFAULT_OPTIONS.smoothingTimeConstant;
    this.updateIntervalMs = options.updateIntervalMs ?? DEFAULT_OPTIONS.updateIntervalMs;
    this.trackFrequencyData = options.trackFrequencyData ?? DEFAULT_OPTIONS.trackFrequencyData;
    this.trackTimeDomainData = options.trackTimeDomainData ?? DEFAULT_OPTIONS.trackTimeDomainData;

    if (options.audioContext) {
      this.audioContext = options.audioContext;
      this.ownAudioContext = false;
    }

    this.callbacks = callbacks;

    // Check if requestAnimationFrame is available
    this.useAnimationFrame = typeof requestAnimationFrame !== 'undefined';
  }

  /**
   * Initialize the visualizer
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
   * Add a stream to visualize
   */
  addStream(peerId: PeerId, stream: MediaStream, isLocal: boolean = false): void {
    if (!this.isInitialized || !this.audioContext) {
      throw new Error('PeerVisualizer not initialized. Call initialize() first.');
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

    // Create data arrays
    const frequencyBinCount = analyserNode.frequencyBinCount;
    const frequencyData = new Uint8Array(frequencyBinCount);
    const timeDomainData = new Uint8Array(frequencyBinCount);

    // Store source info
    this.sources.set(peerId, {
      peerId,
      stream,
      sourceNode,
      analyserNode,
      frequencyData,
      timeDomainData,
      isLocal,
    });

    // Start visualization if not already running
    if (!this.isRunning && this.sources.size > 0) {
      this.startVisualization();
    }
  }

  /**
   * Remove a stream from visualization
   */
  removeStream(peerId: PeerId): boolean {
    const source = this.sources.get(peerId);
    if (!source) {
      return false;
    }

    // Disconnect nodes
    source.sourceNode.disconnect();
    source.analyserNode.disconnect();

    // Remove from map
    this.sources.delete(peerId);

    // Stop visualization if no more sources
    if (this.sources.size === 0) {
      this.stopVisualization();
    }

    return true;
  }

  /**
   * Check if a stream is being visualized
   */
  hasStream(peerId: PeerId): boolean {
    return this.sources.has(peerId);
  }

  /**
   * Get visualization data for a specific peer
   */
  getVisualizationData(peerId: PeerId): PeerVisualizationData | null {
    const source = this.sources.get(peerId);
    if (!source) {
      return null;
    }

    // Update data from analyser
    if (this.trackFrequencyData) {
      source.analyserNode.getByteFrequencyData(source.frequencyData);
    }
    if (this.trackTimeDomainData) {
      source.analyserNode.getByteTimeDomainData(source.timeDomainData);
    }

    return {
      peerId: source.peerId,
      audioLevel: this.calculateAudioLevel(source.frequencyData),
      frequencyData: source.frequencyData,
      timeDomainData: source.timeDomainData,
      isLocal: source.isLocal,
    };
  }

  /**
   * Get visualization data for all peers
   */
  getAllVisualizationData(): PeerVisualizationData[] {
    const data: PeerVisualizationData[] = [];
    this.sources.forEach((source) => {
      const peerData = this.getVisualizationData(source.peerId);
      if (peerData) {
        data.push(peerData);
      }
    });
    return data;
  }

  /**
   * Get audio level for a peer (0-1)
   */
  getAudioLevel(peerId: PeerId): number {
    const source = this.sources.get(peerId);
    if (!source) {
      return 0;
    }

    source.analyserNode.getByteFrequencyData(source.frequencyData);
    return this.calculateAudioLevel(source.frequencyData);
  }

  /**
   * Get frequency data for a peer
   */
  getFrequencyData(peerId: PeerId): Uint8Array | null {
    const source = this.sources.get(peerId);
    if (!source) {
      return null;
    }

    source.analyserNode.getByteFrequencyData(source.frequencyData);
    return source.frequencyData;
  }

  /**
   * Get time domain data for a peer
   */
  getTimeDomainData(peerId: PeerId): Uint8Array | null {
    const source = this.sources.get(peerId);
    if (!source) {
      return null;
    }

    source.analyserNode.getByteTimeDomainData(source.timeDomainData);
    return source.timeDomainData;
  }

  /**
   * Get source count
   */
  getSourceCount(): number {
    return this.sources.size;
  }

  /**
   * Get all source IDs
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
   * Check if visualization is running
   */
  getIsRunning(): boolean {
    return this.isRunning;
  }

  /**
   * Set FFT size (affects frequency resolution)
   */
  setFftSize(fftSize: number): void {
    this.fftSize = fftSize;
    this.sources.forEach((source) => {
      source.analyserNode.fftSize = fftSize;
      // Recreate data arrays with new size
      const frequencyBinCount = source.analyserNode.frequencyBinCount;
      source.frequencyData = new Uint8Array(frequencyBinCount);
      source.timeDomainData = new Uint8Array(frequencyBinCount);
    });
  }

  /**
   * Get FFT size
   */
  getFftSize(): number {
    return this.fftSize;
  }

  /**
   * Set smoothing time constant
   */
  setSmoothingTimeConstant(value: number): void {
    this.smoothingTimeConstant = Math.max(0, Math.min(1, value));
    this.sources.forEach((source) => {
      source.analyserNode.smoothingTimeConstant = this.smoothingTimeConstant;
    });
  }

  /**
   * Get smoothing time constant
   */
  getSmoothingTimeConstant(): number {
    return this.smoothingTimeConstant;
  }

  /**
   * Calculate audio level from frequency data (0-1)
   */
  private calculateAudioLevel(frequencyData: Uint8Array): number {
    // Calculate RMS from frequency data
    let sum = 0;
    for (let i = 0; i < frequencyData.length; i++) {
      const normalized = frequencyData[i] / 255;
      sum += normalized * normalized;
    }
    return Math.sqrt(sum / frequencyData.length);
  }

  /**
   * Start the visualization loop
   */
  private startVisualization(): void {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;

    if (this.useAnimationFrame) {
      this.animationLoop();
    } else {
      this.updateInterval = setInterval(() => {
        this.updateVisualization();
      }, this.updateIntervalMs);
    }
  }

  /**
   * Animation frame loop for smooth updates
   */
  private animationLoop = (): void => {
    if (!this.isRunning) {
      return;
    }

    this.updateVisualization();
    this.animationFrameId = requestAnimationFrame(this.animationLoop);
  };

  /**
   * Stop the visualization loop
   */
  private stopVisualization(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }

    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    this.isRunning = false;
  }

  /**
   * Update visualization for all sources
   */
  private updateVisualization(): void {
    const allData: PeerVisualizationData[] = [];

    this.sources.forEach((source) => {
      // Update frequency data
      if (this.trackFrequencyData) {
        source.analyserNode.getByteFrequencyData(source.frequencyData);
      }
      if (this.trackTimeDomainData) {
        source.analyserNode.getByteTimeDomainData(source.timeDomainData);
      }

      const data: PeerVisualizationData = {
        peerId: source.peerId,
        audioLevel: this.calculateAudioLevel(source.frequencyData),
        frequencyData: source.frequencyData,
        timeDomainData: source.timeDomainData,
        isLocal: source.isLocal,
      };

      allData.push(data);
      this.callbacks.onPeerUpdate?.(data);
    });

    this.callbacks.onVisualizationUpdate?.(allData);
  }

  /**
   * Pause visualization (without disposing)
   */
  pause(): void {
    this.stopVisualization();
  }

  /**
   * Resume visualization
   */
  resume(): void {
    if (this.isInitialized && this.sources.size > 0 && !this.isRunning) {
      this.startVisualization();
    }
  }

  /**
   * Dispose and release all resources
   */
  dispose(): void {
    // Stop visualization
    this.stopVisualization();

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
 * Create a new peer visualizer instance
 */
export function createPeerVisualizer(
  options?: PeerVisualizerOptions,
  callbacks?: PeerVisualizerCallbacks
): PeerVisualizer {
  return new PeerVisualizer(options, callbacks);
}
