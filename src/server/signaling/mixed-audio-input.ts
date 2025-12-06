/**
 * Mixed Audio Input Manager
 *
 * Routes mixed peer audio to AI Orchestrator's OpenAI connection.
 * Handles VAD, audio quality optimization, and empty room states.
 *
 * Part of the Long-Horizon Engineering Protocol - FEAT-301
 */

import type { RoomId } from '@/types/room';
import type { PeerId } from '@/types/peer';

/**
 * Audio chunk info for processing
 */
export interface AudioChunk {
  /** Raw audio data */
  data: ArrayBuffer;
  /** Timestamp when captured */
  timestamp: number;
  /** Sample rate */
  sampleRate: number;
  /** Number of channels */
  channels: number;
  /** Duration in milliseconds */
  durationMs: number;
}

/**
 * VAD (Voice Activity Detection) state
 */
export type VADState = 'silence' | 'speech' | 'unknown';

/**
 * VAD result from analysis
 */
export interface VADResult {
  /** Current VAD state */
  state: VADState;
  /** Speech probability (0-1) */
  speechProbability: number;
  /** Energy level (0-1) */
  energyLevel: number;
  /** Whether this is the start of speech */
  isSpeechStart: boolean;
  /** Whether this is the end of speech */
  isSpeechEnd: boolean;
}

/**
 * Mixed audio input options
 */
export interface MixedAudioInputOptions {
  /** Target sample rate for AI input (default: 24000 for OpenAI) */
  targetSampleRate?: number;
  /** Audio format (default: pcm16) */
  audioFormat?: 'pcm16' | 'g711_ulaw' | 'g711_alaw';
  /** Enable VAD processing (default: true) */
  enableVAD?: boolean;
  /** VAD energy threshold (0-1, default: 0.02) */
  vadEnergyThreshold?: number;
  /** VAD speech probability threshold (0-1, default: 0.5) */
  vadSpeechThreshold?: number;
  /** Silence duration to end speech (ms, default: 500) */
  silenceDurationMs?: number;
  /** Prefix padding duration (ms, default: 300) */
  prefixPaddingMs?: number;
  /** Chunk size in samples (default: 480 for 20ms at 24kHz) */
  chunkSize?: number;
  /** Enable audio quality optimization (default: true) */
  enableOptimization?: boolean;
  /** Target output level (0-1, default: 0.9) */
  targetOutputLevel?: number;
  /** Noise gate threshold (0-1, default: 0.01) */
  noiseGateThreshold?: number;
}

/**
 * Mixed audio input callbacks
 */
export interface MixedAudioInputCallbacks {
  /** Called when audio chunk is ready to send to AI */
  onAudioReady?: (roomId: RoomId, chunk: AudioChunk) => void;
  /** Called when VAD detects speech start */
  onSpeechStart?: (roomId: RoomId) => void;
  /** Called when VAD detects speech end */
  onSpeechEnd?: (roomId: RoomId) => void;
  /** Called when room becomes empty */
  onRoomEmpty?: (roomId: RoomId) => void;
  /** Called when room has participants */
  onRoomOccupied?: (roomId: RoomId) => void;
  /** Called on error */
  onError?: (roomId: RoomId, error: string) => void;
}

/**
 * Per-room audio state
 */
interface RoomAudioState {
  /** Current VAD state */
  vadState: VADState;
  /** Speech start timestamp */
  speechStartTime: number | null;
  /** Last speech timestamp */
  lastSpeechTime: number;
  /** Buffered audio for prefix padding */
  prefixBuffer: AudioChunk[];
  /** Active peer count */
  activePeerCount: number;
  /** Whether room is processing audio */
  isProcessing: boolean;
  /** Accumulated energy for AGC */
  accumulatedEnergy: number;
  /** Sample count for averaging */
  sampleCount: number;
}

/**
 * Default options
 */
const DEFAULT_OPTIONS: Required<MixedAudioInputOptions> = {
  targetSampleRate: 24000,
  audioFormat: 'pcm16',
  enableVAD: true,
  vadEnergyThreshold: 0.02,
  vadSpeechThreshold: 0.5,
  silenceDurationMs: 500,
  prefixPaddingMs: 300,
  chunkSize: 480, // 20ms at 24kHz
  enableOptimization: true,
  targetOutputLevel: 0.9,
  noiseGateThreshold: 0.01,
};

/**
 * Mixed Audio Input Manager
 *
 * Processes and routes mixed peer audio to AI.
 *
 * @example
 * ```typescript
 * const mixedInput = new MixedAudioInputManager({
 *   targetSampleRate: 24000,
 *   enableVAD: true,
 * }, {
 *   onAudioReady: (roomId, chunk) => {
 *     orchestrator.sendAudioInput(roomId, chunk.data);
 *   },
 *   onSpeechStart: (roomId) => {
 *     console.log(`Speech started in room ${roomId}`);
 *   },
 * });
 *
 * // Initialize room
 * mixedInput.initRoom('room-123');
 *
 * // Process incoming mixed audio
 * mixedInput.processAudio('room-123', audioBuffer, sampleRate);
 *
 * // Track peer count
 * mixedInput.setPeerCount('room-123', 3);
 * ```
 */
export class MixedAudioInputManager {
  private rooms = new Map<RoomId, RoomAudioState>();
  private options: Required<MixedAudioInputOptions>;
  private callbacks: MixedAudioInputCallbacks;

  constructor(
    options: MixedAudioInputOptions = {},
    callbacks: MixedAudioInputCallbacks = {}
  ) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.callbacks = callbacks;
  }

  /**
   * Initialize a room for audio processing
   */
  initRoom(roomId: RoomId): void {
    if (this.rooms.has(roomId)) {
      return;
    }

    this.rooms.set(roomId, {
      vadState: 'silence',
      speechStartTime: null,
      lastSpeechTime: 0,
      prefixBuffer: [],
      activePeerCount: 0,
      isProcessing: false,
      accumulatedEnergy: 0,
      sampleCount: 0,
    });
  }

  /**
   * Remove a room from audio processing
   */
  removeRoom(roomId: RoomId): boolean {
    return this.rooms.delete(roomId);
  }

  /**
   * Check if room is initialized
   */
  hasRoom(roomId: RoomId): boolean {
    return this.rooms.has(roomId);
  }

  /**
   * Set the active peer count for a room
   */
  setPeerCount(roomId: RoomId, count: number): void {
    const state = this.rooms.get(roomId);
    if (!state) return;

    const wasEmpty = state.activePeerCount === 0;
    const isEmpty = count === 0;

    state.activePeerCount = count;

    // Notify on empty state changes
    if (!wasEmpty && isEmpty) {
      state.isProcessing = false;
      this.callbacks.onRoomEmpty?.(roomId);
    } else if (wasEmpty && !isEmpty) {
      state.isProcessing = true;
      this.callbacks.onRoomOccupied?.(roomId);
    }
  }

  /**
   * Get the active peer count for a room
   */
  getPeerCount(roomId: RoomId): number {
    return this.rooms.get(roomId)?.activePeerCount ?? 0;
  }

  /**
   * Check if room is empty
   */
  isRoomEmpty(roomId: RoomId): boolean {
    return this.getPeerCount(roomId) === 0;
  }

  /**
   * Process mixed audio from the mixer
   */
  processAudio(
    roomId: RoomId,
    audioData: ArrayBuffer,
    sampleRate: number,
    channels: number = 1
  ): void {
    const state = this.rooms.get(roomId);
    if (!state) {
      this.callbacks.onError?.(roomId, 'Room not initialized');
      return;
    }

    // Skip if room is empty
    if (state.activePeerCount === 0) {
      return;
    }

    // Convert and optimize audio
    const processedAudio = this.processAudioData(audioData, sampleRate, channels);
    if (!processedAudio) {
      return;
    }

    // Create audio chunk
    const chunk: AudioChunk = {
      data: processedAudio.data,
      timestamp: Date.now(),
      sampleRate: this.options.targetSampleRate,
      channels: 1,
      durationMs: processedAudio.durationMs,
    };

    // Run VAD if enabled
    if (this.options.enableVAD) {
      const vadResult = this.analyzeVAD(processedAudio.data, state);
      this.handleVADResult(roomId, state, chunk, vadResult);
    } else {
      // Without VAD, just send all audio
      this.callbacks.onAudioReady?.(roomId, chunk);
    }
  }

  /**
   * Get current VAD state for a room
   */
  getVADState(roomId: RoomId): VADState {
    return this.rooms.get(roomId)?.vadState ?? 'unknown';
  }

  /**
   * Check if speech is currently active
   */
  isSpeechActive(roomId: RoomId): boolean {
    return this.getVADState(roomId) === 'speech';
  }

  /**
   * Force start speech detection (for manual mode)
   */
  forceStartSpeech(roomId: RoomId): void {
    const state = this.rooms.get(roomId);
    if (!state) return;

    if (state.vadState !== 'speech') {
      state.vadState = 'speech';
      state.speechStartTime = Date.now();
      state.lastSpeechTime = Date.now();
      this.callbacks.onSpeechStart?.(roomId);
    }
  }

  /**
   * Force end speech detection (for manual mode)
   */
  forceEndSpeech(roomId: RoomId): void {
    const state = this.rooms.get(roomId);
    if (!state) return;

    if (state.vadState === 'speech') {
      state.vadState = 'silence';
      state.speechStartTime = null;
      this.callbacks.onSpeechEnd?.(roomId);
    }
  }

  /**
   * Get audio processing statistics
   */
  getStats(roomId: RoomId): {
    vadState: VADState;
    speechDurationMs: number;
    averageEnergy: number;
    peerCount: number;
  } | null {
    const state = this.rooms.get(roomId);
    if (!state) return null;

    const speechDurationMs =
      state.speechStartTime !== null
        ? Date.now() - state.speechStartTime
        : 0;

    const averageEnergy =
      state.sampleCount > 0
        ? state.accumulatedEnergy / state.sampleCount
        : 0;

    return {
      vadState: state.vadState,
      speechDurationMs,
      averageEnergy,
      peerCount: state.activePeerCount,
    };
  }

  /**
   * Clear prefix buffer for a room
   */
  clearPrefixBuffer(roomId: RoomId): void {
    const state = this.rooms.get(roomId);
    if (state) {
      state.prefixBuffer = [];
    }
  }

  /**
   * Dispose all rooms
   */
  dispose(): void {
    this.rooms.clear();
  }

  // ========== Private Methods ==========

  /**
   * Process and optimize audio data
   */
  private processAudioData(
    audioData: ArrayBuffer,
    sourceSampleRate: number,
    sourceChannels: number
  ): { data: ArrayBuffer; durationMs: number } | null {
    try {
      // Convert to Int16 array (PCM16)
      let samples = new Int16Array(audioData);

      // Downmix to mono if stereo
      if (sourceChannels === 2) {
        samples = this.downmixToMono(samples);
      }

      // Resample if needed
      if (sourceSampleRate !== this.options.targetSampleRate) {
        samples = this.resample(samples, sourceSampleRate, this.options.targetSampleRate);
      }

      // Apply audio optimizations
      if (this.options.enableOptimization) {
        samples = this.optimizeAudio(samples);
      }

      const durationMs =
        (samples.length / this.options.targetSampleRate) * 1000;

      return {
        data: samples.buffer,
        durationMs,
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Downmix stereo to mono
   */
  private downmixToMono(stereoSamples: Int16Array): Int16Array {
    const monoSamples = new Int16Array(stereoSamples.length / 2);
    for (let i = 0; i < monoSamples.length; i++) {
      const left = stereoSamples[i * 2];
      const right = stereoSamples[i * 2 + 1];
      monoSamples[i] = Math.round((left + right) / 2);
    }
    return monoSamples;
  }

  /**
   * Resample audio to target sample rate
   */
  private resample(
    samples: Int16Array,
    sourceSampleRate: number,
    targetSampleRate: number
  ): Int16Array {
    const ratio = sourceSampleRate / targetSampleRate;
    const targetLength = Math.ceil(samples.length / ratio);
    const resampled = new Int16Array(targetLength);

    for (let i = 0; i < targetLength; i++) {
      const srcIndex = i * ratio;
      const srcIndexFloor = Math.floor(srcIndex);
      const srcIndexCeil = Math.min(srcIndexFloor + 1, samples.length - 1);
      const fraction = srcIndex - srcIndexFloor;

      // Linear interpolation
      const sample =
        samples[srcIndexFloor] * (1 - fraction) +
        samples[srcIndexCeil] * fraction;
      resampled[i] = Math.round(sample);
    }

    return resampled;
  }

  /**
   * Apply audio quality optimizations
   */
  private optimizeAudio(samples: Int16Array): Int16Array {
    const optimized = new Int16Array(samples.length);

    // Find peak amplitude for normalization
    let peak = 0;
    for (let i = 0; i < samples.length; i++) {
      const abs = Math.abs(samples[i]);
      if (abs > peak) peak = abs;
    }

    // Calculate normalization factor
    const maxInt16 = 32767;
    const targetPeak = this.options.targetOutputLevel * maxInt16;
    const normFactor = peak > 0 ? Math.min(targetPeak / peak, 3.0) : 1.0;

    // Apply normalization and noise gate
    const noiseThreshold = this.options.noiseGateThreshold * maxInt16;

    for (let i = 0; i < samples.length; i++) {
      let sample = samples[i] * normFactor;

      // Apply noise gate
      if (Math.abs(sample) < noiseThreshold) {
        sample = 0;
      }

      // Clip to valid range
      optimized[i] = Math.max(-maxInt16, Math.min(maxInt16, Math.round(sample)));
    }

    return optimized;
  }

  /**
   * Analyze audio for voice activity
   */
  private analyzeVAD(audioData: ArrayBuffer, state: RoomAudioState): VADResult {
    const samples = new Int16Array(audioData);
    const maxInt16 = 32767;

    // Calculate energy level
    let energy = 0;
    for (let i = 0; i < samples.length; i++) {
      const normalized = samples[i] / maxInt16;
      energy += normalized * normalized;
    }
    energy = Math.sqrt(energy / samples.length);

    // Update accumulated energy for statistics
    state.accumulatedEnergy += energy;
    state.sampleCount++;

    // Simple speech probability based on energy
    // In a real implementation, this would use a proper VAD model
    const speechProbability = Math.min(
      1,
      energy / (this.options.vadEnergyThreshold * 2)
    );

    // Determine if this is speech
    const isSpeech =
      energy > this.options.vadEnergyThreshold &&
      speechProbability > this.options.vadSpeechThreshold;

    // Detect state transitions
    const wasSpeech = state.vadState === 'speech';
    const isSpeechStart = isSpeech && !wasSpeech;
    const isSpeechEnd =
      !isSpeech &&
      wasSpeech &&
      Date.now() - state.lastSpeechTime > this.options.silenceDurationMs;

    return {
      state: isSpeech ? 'speech' : 'silence',
      speechProbability,
      energyLevel: energy,
      isSpeechStart,
      isSpeechEnd,
    };
  }

  /**
   * Handle VAD result and update state
   */
  private handleVADResult(
    roomId: RoomId,
    state: RoomAudioState,
    chunk: AudioChunk,
    vadResult: VADResult
  ): void {
    // Update last speech time if speech detected
    if (vadResult.state === 'speech') {
      state.lastSpeechTime = Date.now();
    }

    // Handle speech start
    if (vadResult.isSpeechStart) {
      state.vadState = 'speech';
      state.speechStartTime = Date.now();

      // Send prefix buffer first
      for (const prefixChunk of state.prefixBuffer) {
        this.callbacks.onAudioReady?.(roomId, prefixChunk);
      }
      state.prefixBuffer = [];

      // Notify speech start
      this.callbacks.onSpeechStart?.(roomId);
    }

    // Handle speech end
    if (vadResult.isSpeechEnd) {
      state.vadState = 'silence';
      state.speechStartTime = null;

      // Notify speech end
      this.callbacks.onSpeechEnd?.(roomId);
    }

    // During speech, send audio to AI
    if (state.vadState === 'speech') {
      this.callbacks.onAudioReady?.(roomId, chunk);
    } else {
      // During silence, maintain prefix buffer for padding
      this.updatePrefixBuffer(state, chunk);
    }
  }

  /**
   * Update prefix buffer with new chunk
   */
  private updatePrefixBuffer(state: RoomAudioState, chunk: AudioChunk): void {
    state.prefixBuffer.push(chunk);

    // Calculate max buffer duration
    let totalDuration = 0;
    for (const c of state.prefixBuffer) {
      totalDuration += c.durationMs;
    }

    // Remove old chunks if buffer exceeds prefix padding duration
    while (totalDuration > this.options.prefixPaddingMs && state.prefixBuffer.length > 1) {
      const removed = state.prefixBuffer.shift();
      if (removed) {
        totalDuration -= removed.durationMs;
      }
    }
  }
}

/**
 * Create mixed audio input manager
 */
export function createMixedAudioInputManager(
  options?: MixedAudioInputOptions,
  callbacks?: MixedAudioInputCallbacks
): MixedAudioInputManager {
  return new MixedAudioInputManager(options, callbacks);
}

export default MixedAudioInputManager;
