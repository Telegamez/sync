/**
 * Audio Mixer
 *
 * Multi-stream audio mixing using Web Audio API.
 * Combines multiple audio streams into a single mixed output.
 *
 * Part of the Long-Horizon Engineering Protocol - FEAT-200
 */

import type { PeerId } from '@/types/peer';

/**
 * Audio source info
 */
export interface AudioSource {
  /** Source identifier (peer ID) */
  id: PeerId;
  /** Original media stream */
  stream: MediaStream;
  /** Media stream source node */
  sourceNode: MediaStreamAudioSourceNode;
  /** Gain node for volume control */
  gainNode: GainNode;
  /** Whether this source is muted */
  isMuted: boolean;
  /** Current volume (0-1) */
  volume: number;
}

/**
 * Mixer options
 */
export interface AudioMixerOptions {
  /** Audio context to use (created if not provided) */
  audioContext?: AudioContext;
  /** Initial master volume (0-1) */
  masterVolume?: number;
  /** Sample rate for audio context */
  sampleRate?: number;
}

/**
 * Mixer state
 */
export interface AudioMixerState {
  /** Whether the mixer is initialized */
  isInitialized: boolean;
  /** Whether the mixer is running */
  isRunning: boolean;
  /** Number of active sources */
  sourceCount: number;
  /** Master volume (0-1) */
  masterVolume: number;
  /** Whether master is muted */
  isMasterMuted: boolean;
}

/**
 * Source volume info for UI
 */
export interface SourceVolumeInfo {
  /** Source ID */
  id: PeerId;
  /** Volume level (0-1) */
  volume: number;
  /** Whether source is muted */
  isMuted: boolean;
  /** Effective volume after normalization (0-1) */
  effectiveVolume: number;
}

/**
 * Volume normalization mode
 */
export type NormalizationMode = 'none' | 'auto' | 'constant';

/**
 * Extended mixer options with volume normalization
 */
export interface AudioMixerOptionsV2 extends AudioMixerOptions {
  /** Volume normalization mode (default: 'none') */
  normalizationMode?: NormalizationMode;
  /** Target combined output level for auto normalization (0-1, default: 0.9) */
  targetOutputLevel?: number;
  /** Minimum gain per source for auto normalization (0-1, default: 0.2) */
  minSourceGain?: number;
}

/**
 * AudioMixer class
 *
 * Manages multiple audio streams and mixes them into a single output.
 *
 * @example
 * ```ts
 * const mixer = new AudioMixer();
 * await mixer.initialize();
 *
 * // Add peer audio streams
 * mixer.addStream('peer-1', peerStream1);
 * mixer.addStream('peer-2', peerStream2);
 *
 * // Get mixed output for AI
 * const mixedStream = mixer.getMixedStream();
 *
 * // Control individual volumes
 * mixer.setVolume('peer-1', 0.5);
 * mixer.mute('peer-2');
 *
 * // Cleanup
 * mixer.dispose();
 * ```
 */
export class AudioMixer {
  private audioContext: AudioContext | null = null;
  private ownAudioContext: boolean = false;
  private masterGainNode: GainNode | null = null;
  private destinationNode: MediaStreamAudioDestinationNode | null = null;
  private sources: Map<PeerId, AudioSource> = new Map();
  private masterVolume: number = 1.0;
  private isMasterMuted: boolean = false;
  private isInitialized: boolean = false;
  private options: AudioMixerOptionsV2;
  private normalizationMode: NormalizationMode = 'none';
  private targetOutputLevel: number = 0.9;
  private minSourceGain: number = 0.2;

  constructor(options: AudioMixerOptionsV2 = {}) {
    this.options = options;
    this.masterVolume = options.masterVolume ?? 1.0;
    this.normalizationMode = options.normalizationMode ?? 'none';
    this.targetOutputLevel = options.targetOutputLevel ?? 0.9;
    this.minSourceGain = options.minSourceGain ?? 0.2;
  }

  /**
   * Initialize the audio mixer
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    // Use provided context or create new one
    if (this.options.audioContext) {
      this.audioContext = this.options.audioContext;
      this.ownAudioContext = false;
    } else {
      this.audioContext = new AudioContext({
        sampleRate: this.options.sampleRate,
      });
      this.ownAudioContext = true;
    }

    // Resume context if suspended (browser autoplay policy)
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }

    // Create master gain node
    this.masterGainNode = this.audioContext.createGain();
    this.masterGainNode.gain.value = this.masterVolume;

    // Create destination for mixed output
    this.destinationNode = this.audioContext.createMediaStreamDestination();

    // Connect master gain to destination
    this.masterGainNode.connect(this.destinationNode);

    this.isInitialized = true;
  }

  /**
   * Add an audio stream to the mixer
   */
  addStream(id: PeerId, stream: MediaStream): void {
    if (!this.isInitialized || !this.audioContext || !this.masterGainNode) {
      throw new Error('AudioMixer not initialized. Call initialize() first.');
    }

    // Remove existing source with same ID
    if (this.sources.has(id)) {
      this.removeStream(id);
    }

    // Create source node from stream
    const sourceNode = this.audioContext.createMediaStreamSource(stream);

    // Create gain node for this source
    const gainNode = this.audioContext.createGain();
    gainNode.gain.value = 1.0;

    // Connect: source -> gain -> master
    sourceNode.connect(gainNode);
    gainNode.connect(this.masterGainNode);

    // Store source info
    this.sources.set(id, {
      id,
      stream,
      sourceNode,
      gainNode,
      isMuted: false,
      volume: 1.0,
    });

    // Apply normalization after adding source
    if (this.normalizationMode !== 'none') {
      this.applyNormalization();
    }
  }

  /**
   * Remove an audio stream from the mixer
   */
  removeStream(id: PeerId): boolean {
    const source = this.sources.get(id);
    if (!source) {
      return false;
    }

    // Disconnect nodes
    source.sourceNode.disconnect();
    source.gainNode.disconnect();

    // Remove from map
    this.sources.delete(id);

    // Re-apply normalization after removing source
    if (this.normalizationMode !== 'none') {
      this.applyNormalization();
    }

    return true;
  }

  /**
   * Check if a stream is in the mixer
   */
  hasStream(id: PeerId): boolean {
    return this.sources.has(id);
  }

  /**
   * Get the mixed output stream
   */
  getMixedStream(): MediaStream | null {
    return this.destinationNode?.stream ?? null;
  }

  /**
   * Set volume for a specific source
   */
  setVolume(id: PeerId, volume: number): void {
    const source = this.sources.get(id);
    if (!source) {
      return;
    }

    const clampedVolume = Math.max(0, Math.min(1, volume));
    source.volume = clampedVolume;

    // Apply volume (respecting mute state and normalization)
    if (!source.isMuted) {
      if (this.normalizationMode !== 'none') {
        this.applyNormalization();
      } else {
        source.gainNode.gain.value = clampedVolume;
      }
    }
  }

  /**
   * Get volume for a specific source
   */
  getVolume(id: PeerId): number {
    return this.sources.get(id)?.volume ?? 0;
  }

  /**
   * Mute a specific source
   */
  mute(id: PeerId): void {
    const source = this.sources.get(id);
    if (!source) {
      return;
    }

    source.isMuted = true;
    source.gainNode.gain.value = 0;
  }

  /**
   * Unmute a specific source
   */
  unmute(id: PeerId): void {
    const source = this.sources.get(id);
    if (!source) {
      return;
    }

    source.isMuted = false;

    // Apply normalization or direct volume
    if (this.normalizationMode !== 'none') {
      this.applyNormalization();
    } else {
      source.gainNode.gain.value = source.volume;
    }
  }

  /**
   * Check if a source is muted
   */
  isMuted(id: PeerId): boolean {
    return this.sources.get(id)?.isMuted ?? false;
  }

  /**
   * Set master volume
   */
  setMasterVolume(volume: number): void {
    const clampedVolume = Math.max(0, Math.min(1, volume));
    this.masterVolume = clampedVolume;

    if (this.masterGainNode && !this.isMasterMuted) {
      this.masterGainNode.gain.value = clampedVolume;
    }
  }

  /**
   * Get master volume
   */
  getMasterVolume(): number {
    return this.masterVolume;
  }

  /**
   * Mute master output
   */
  muteMaster(): void {
    this.isMasterMuted = true;
    if (this.masterGainNode) {
      this.masterGainNode.gain.value = 0;
    }
  }

  /**
   * Unmute master output
   */
  unmuteMaster(): void {
    this.isMasterMuted = false;
    if (this.masterGainNode) {
      this.masterGainNode.gain.value = this.masterVolume;
    }
  }

  /**
   * Check if master is muted
   */
  isMasterMutedState(): boolean {
    return this.isMasterMuted;
  }

  /**
   * Get all source IDs
   */
  getSourceIds(): PeerId[] {
    return Array.from(this.sources.keys());
  }

  /**
   * Get source count
   */
  getSourceCount(): number {
    return this.sources.size;
  }

  /**
   * Get mixer state
   */
  getState(): AudioMixerState {
    return {
      isInitialized: this.isInitialized,
      isRunning: this.audioContext?.state === 'running',
      sourceCount: this.sources.size,
      masterVolume: this.masterVolume,
      isMasterMuted: this.isMasterMuted,
    };
  }

  /**
   * Get volume info for all sources (for UI display)
   */
  getAllVolumes(): SourceVolumeInfo[] {
    const normalizationFactor = this.calculateNormalizationFactor();
    const result: SourceVolumeInfo[] = [];

    this.sources.forEach((source) => {
      result.push({
        id: source.id,
        volume: source.volume,
        isMuted: source.isMuted,
        effectiveVolume: source.isMuted ? 0 : source.volume * normalizationFactor,
      });
    });

    return result;
  }

  /**
   * Get volume info for a specific source
   */
  getSourceVolumeInfo(id: PeerId): SourceVolumeInfo | null {
    const source = this.sources.get(id);
    if (!source) {
      return null;
    }

    const normalizationFactor = this.calculateNormalizationFactor();
    return {
      id: source.id,
      volume: source.volume,
      isMuted: source.isMuted,
      effectiveVolume: source.isMuted ? 0 : source.volume * normalizationFactor,
    };
  }

  /**
   * Set volume normalization mode
   */
  setNormalizationMode(mode: NormalizationMode): void {
    this.normalizationMode = mode;
    this.applyNormalization();
  }

  /**
   * Get current normalization mode
   */
  getNormalizationMode(): NormalizationMode {
    return this.normalizationMode;
  }

  /**
   * Set target output level for auto normalization
   */
  setTargetOutputLevel(level: number): void {
    this.targetOutputLevel = Math.max(0, Math.min(1, level));
    if (this.normalizationMode !== 'none') {
      this.applyNormalization();
    }
  }

  /**
   * Get current target output level
   */
  getTargetOutputLevel(): number {
    return this.targetOutputLevel;
  }

  /**
   * Calculate normalization factor based on mode and source count
   */
  private calculateNormalizationFactor(): number {
    const sourceCount = this.sources.size;

    if (sourceCount === 0 || this.normalizationMode === 'none') {
      return 1.0;
    }

    if (this.normalizationMode === 'constant') {
      // Constant power normalization: divide by sqrt(n)
      // This maintains perceived loudness as sources are added
      return Math.max(this.minSourceGain, 1 / Math.sqrt(sourceCount));
    }

    if (this.normalizationMode === 'auto') {
      // Auto normalization: target output level divided by sum of volumes
      let totalVolume = 0;
      this.sources.forEach((source) => {
        if (!source.isMuted) {
          totalVolume += source.volume;
        }
      });

      if (totalVolume === 0) {
        return 1.0;
      }

      // Scale to target output level
      const factor = this.targetOutputLevel / totalVolume;
      return Math.max(this.minSourceGain, Math.min(1, factor));
    }

    return 1.0;
  }

  /**
   * Apply normalization to all sources
   */
  private applyNormalization(): void {
    const factor = this.calculateNormalizationFactor();

    this.sources.forEach((source) => {
      if (!source.isMuted) {
        source.gainNode.gain.value = source.volume * factor;
      }
    });
  }

  /**
   * Get the current normalization factor
   */
  getNormalizationFactor(): number {
    return this.calculateNormalizationFactor();
  }

  /**
   * Get audio context (for advanced use)
   */
  getAudioContext(): AudioContext | null {
    return this.audioContext;
  }

  /**
   * Suspend the audio context
   */
  async suspend(): Promise<void> {
    if (this.audioContext && this.audioContext.state === 'running') {
      await this.audioContext.suspend();
    }
  }

  /**
   * Resume the audio context
   */
  async resume(): Promise<void> {
    if (this.audioContext && this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }
  }

  /**
   * Dispose of the mixer and release resources
   */
  dispose(): void {
    // Disconnect and remove all sources
    this.sources.forEach((source) => {
      source.sourceNode.disconnect();
      source.gainNode.disconnect();
    });
    this.sources.clear();

    // Disconnect master nodes
    if (this.masterGainNode) {
      this.masterGainNode.disconnect();
      this.masterGainNode = null;
    }

    if (this.destinationNode) {
      this.destinationNode = null;
    }

    // Close audio context if we own it
    if (this.ownAudioContext && this.audioContext) {
      this.audioContext.close();
    }
    this.audioContext = null;

    this.isInitialized = false;
  }
}

/**
 * Create a new audio mixer instance
 */
export function createAudioMixer(options?: AudioMixerOptionsV2): AudioMixer {
  return new AudioMixer(options);
}
