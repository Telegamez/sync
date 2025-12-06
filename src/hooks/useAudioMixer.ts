/**
 * useAudioMixer Hook
 *
 * React hook for managing audio mixing in a room.
 * Integrates with AudioMixer to combine multiple peer audio streams.
 *
 * Part of the Long-Horizon Engineering Protocol - FEAT-202
 */

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { PeerId } from '@/types/peer';
import {
  AudioMixer,
  createAudioMixer,
  type AudioMixerState,
  type SourceVolumeInfo,
  type NormalizationMode,
} from '@/lib/audio/mixer';

/**
 * Hook options
 */
export interface UseAudioMixerOptions {
  /** Initial master volume (0-1) */
  masterVolume?: number;
  /** Sample rate for audio context */
  sampleRate?: number;
  /** Volume normalization mode */
  normalizationMode?: NormalizationMode;
  /** Target output level for auto normalization */
  targetOutputLevel?: number;
  /** Minimum source gain for normalization */
  minSourceGain?: number;
  /** Auto-initialize on mount */
  autoInitialize?: boolean;
  /** Called when mixer is initialized */
  onInitialized?: () => void;
  /** Called when mixer state changes */
  onStateChange?: (state: AudioMixerState) => void;
  /** Called when source is added */
  onSourceAdded?: (peerId: PeerId) => void;
  /** Called when source is removed */
  onSourceRemoved?: (peerId: PeerId) => void;
}

/**
 * Hook state
 */
export interface UseAudioMixerState {
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
  /** Current normalization mode */
  normalizationMode: NormalizationMode;
  /** Current normalization factor */
  normalizationFactor: number;
  /** Volume info for all sources */
  volumes: SourceVolumeInfo[];
}

/**
 * Hook actions
 */
export interface UseAudioMixerActions {
  /** Initialize the mixer */
  initialize: () => Promise<void>;
  /** Add audio stream for a peer */
  addStream: (peerId: PeerId, stream: MediaStream) => void;
  /** Remove audio stream for a peer */
  removeStream: (peerId: PeerId) => boolean;
  /** Check if peer has a stream */
  hasStream: (peerId: PeerId) => boolean;
  /** Set volume for a peer (0-1) */
  setVolume: (peerId: PeerId, volume: number) => void;
  /** Get volume for a peer */
  getVolume: (peerId: PeerId) => number;
  /** Mute a peer */
  mute: (peerId: PeerId) => void;
  /** Unmute a peer */
  unmute: (peerId: PeerId) => void;
  /** Check if peer is muted */
  isMuted: (peerId: PeerId) => boolean;
  /** Set master volume (0-1) */
  setMasterVolume: (volume: number) => void;
  /** Mute master output */
  muteMaster: () => void;
  /** Unmute master output */
  unmuteMaster: () => void;
  /** Set normalization mode */
  setNormalizationMode: (mode: NormalizationMode) => void;
  /** Get the mixed output stream */
  getMixedStream: () => MediaStream | null;
  /** Suspend audio processing */
  suspend: () => Promise<void>;
  /** Resume audio processing */
  resume: () => Promise<void>;
  /** Dispose and cleanup */
  dispose: () => void;
  /** Get volume info for a specific source */
  getSourceVolumeInfo: (peerId: PeerId) => SourceVolumeInfo | null;
  /** Get all source IDs */
  getSourceIds: () => PeerId[];
}

/**
 * Default options
 */
const DEFAULT_OPTIONS: Required<
  Omit<
    UseAudioMixerOptions,
    'onInitialized' | 'onStateChange' | 'onSourceAdded' | 'onSourceRemoved'
  >
> = {
  masterVolume: 1.0,
  sampleRate: 48000,
  normalizationMode: 'none',
  targetOutputLevel: 0.9,
  minSourceGain: 0.2,
  autoInitialize: true,
};

/**
 * useAudioMixer Hook
 *
 * Manages audio mixing for multiple peer streams.
 *
 * @example
 * ```tsx
 * const {
 *   initialize,
 *   addStream,
 *   removeStream,
 *   setVolume,
 *   getMixedStream,
 *   volumes,
 *   isInitialized,
 * } = useAudioMixer({
 *   normalizationMode: 'constant',
 *   onSourceAdded: (peerId) => console.log(`Added ${peerId}`),
 * });
 *
 * // Add peer streams as they arrive
 * useEffect(() => {
 *   peers.forEach(peer => {
 *     if (peer.audioStream && !hasStream(peer.id)) {
 *       addStream(peer.id, peer.audioStream);
 *     }
 *   });
 * }, [peers]);
 *
 * // Use mixed stream for AI input
 * const mixedStream = getMixedStream();
 * ```
 */
export function useAudioMixer(
  options: UseAudioMixerOptions = {}
): UseAudioMixerState & UseAudioMixerActions {
  const {
    masterVolume: initialMasterVolume = DEFAULT_OPTIONS.masterVolume,
    sampleRate = DEFAULT_OPTIONS.sampleRate,
    normalizationMode: initialNormalizationMode = DEFAULT_OPTIONS.normalizationMode,
    targetOutputLevel = DEFAULT_OPTIONS.targetOutputLevel,
    minSourceGain = DEFAULT_OPTIONS.minSourceGain,
    autoInitialize = DEFAULT_OPTIONS.autoInitialize,
    onInitialized,
    onStateChange,
    onSourceAdded,
    onSourceRemoved,
  } = options;

  // Mixer instance ref
  const mixerRef = useRef<AudioMixer | null>(null);

  // State
  const [state, setState] = useState<UseAudioMixerState>({
    isInitialized: false,
    isRunning: false,
    sourceCount: 0,
    masterVolume: initialMasterVolume,
    isMasterMuted: false,
    normalizationMode: initialNormalizationMode,
    normalizationFactor: 1.0,
    volumes: [],
  });

  /**
   * Update state from mixer
   */
  const updateState = useCallback(() => {
    const mixer = mixerRef.current;
    if (!mixer) return;

    const mixerState = mixer.getState();
    const newState: UseAudioMixerState = {
      isInitialized: mixerState.isInitialized,
      isRunning: mixerState.isRunning,
      sourceCount: mixerState.sourceCount,
      masterVolume: mixerState.masterVolume,
      isMasterMuted: mixerState.isMasterMuted,
      normalizationMode: mixer.getNormalizationMode(),
      normalizationFactor: mixer.getNormalizationFactor(),
      volumes: mixer.getAllVolumes(),
    };

    setState(newState);
    onStateChange?.(mixerState);
  }, [onStateChange]);

  /**
   * Initialize the mixer
   */
  const initialize = useCallback(async (): Promise<void> => {
    if (mixerRef.current?.getState().isInitialized) {
      return;
    }

    // Create mixer if needed
    if (!mixerRef.current) {
      mixerRef.current = createAudioMixer({
        masterVolume: initialMasterVolume,
        sampleRate,
        normalizationMode: initialNormalizationMode,
        targetOutputLevel,
        minSourceGain,
      });
    }

    await mixerRef.current.initialize();
    updateState();
    onInitialized?.();
  }, [
    initialMasterVolume,
    sampleRate,
    initialNormalizationMode,
    targetOutputLevel,
    minSourceGain,
    updateState,
    onInitialized,
  ]);

  /**
   * Add audio stream for a peer
   */
  const addStream = useCallback(
    (peerId: PeerId, stream: MediaStream): void => {
      const mixer = mixerRef.current;
      if (!mixer) {
        throw new Error('Mixer not created. Call initialize() first.');
      }

      mixer.addStream(peerId, stream);
      updateState();
      onSourceAdded?.(peerId);
    },
    [updateState, onSourceAdded]
  );

  /**
   * Remove audio stream for a peer
   */
  const removeStream = useCallback(
    (peerId: PeerId): boolean => {
      const mixer = mixerRef.current;
      if (!mixer) return false;

      const removed = mixer.removeStream(peerId);
      if (removed) {
        updateState();
        onSourceRemoved?.(peerId);
      }
      return removed;
    },
    [updateState, onSourceRemoved]
  );

  /**
   * Check if peer has a stream
   */
  const hasStream = useCallback((peerId: PeerId): boolean => {
    return mixerRef.current?.hasStream(peerId) ?? false;
  }, []);

  /**
   * Set volume for a peer
   */
  const setVolume = useCallback(
    (peerId: PeerId, volume: number): void => {
      mixerRef.current?.setVolume(peerId, volume);
      updateState();
    },
    [updateState]
  );

  /**
   * Get volume for a peer
   */
  const getVolume = useCallback((peerId: PeerId): number => {
    return mixerRef.current?.getVolume(peerId) ?? 0;
  }, []);

  /**
   * Mute a peer
   */
  const mute = useCallback(
    (peerId: PeerId): void => {
      mixerRef.current?.mute(peerId);
      updateState();
    },
    [updateState]
  );

  /**
   * Unmute a peer
   */
  const unmute = useCallback(
    (peerId: PeerId): void => {
      mixerRef.current?.unmute(peerId);
      updateState();
    },
    [updateState]
  );

  /**
   * Check if peer is muted
   */
  const isMuted = useCallback((peerId: PeerId): boolean => {
    return mixerRef.current?.isMuted(peerId) ?? false;
  }, []);

  /**
   * Set master volume
   */
  const setMasterVolume = useCallback(
    (volume: number): void => {
      mixerRef.current?.setMasterVolume(volume);
      updateState();
    },
    [updateState]
  );

  /**
   * Mute master output
   */
  const muteMaster = useCallback((): void => {
    mixerRef.current?.muteMaster();
    updateState();
  }, [updateState]);

  /**
   * Unmute master output
   */
  const unmuteMaster = useCallback((): void => {
    mixerRef.current?.unmuteMaster();
    updateState();
  }, [updateState]);

  /**
   * Set normalization mode
   */
  const setNormalizationMode = useCallback(
    (mode: NormalizationMode): void => {
      mixerRef.current?.setNormalizationMode(mode);
      updateState();
    },
    [updateState]
  );

  /**
   * Get the mixed output stream
   */
  const getMixedStream = useCallback((): MediaStream | null => {
    return mixerRef.current?.getMixedStream() ?? null;
  }, []);

  /**
   * Suspend audio processing
   */
  const suspend = useCallback(async (): Promise<void> => {
    await mixerRef.current?.suspend();
    updateState();
  }, [updateState]);

  /**
   * Resume audio processing
   */
  const resume = useCallback(async (): Promise<void> => {
    await mixerRef.current?.resume();
    updateState();
  }, [updateState]);

  /**
   * Dispose and cleanup
   */
  const dispose = useCallback((): void => {
    mixerRef.current?.dispose();
    mixerRef.current = null;
    setState({
      isInitialized: false,
      isRunning: false,
      sourceCount: 0,
      masterVolume: initialMasterVolume,
      isMasterMuted: false,
      normalizationMode: initialNormalizationMode,
      normalizationFactor: 1.0,
      volumes: [],
    });
  }, [initialMasterVolume, initialNormalizationMode]);

  /**
   * Get volume info for a specific source
   */
  const getSourceVolumeInfo = useCallback(
    (peerId: PeerId): SourceVolumeInfo | null => {
      return mixerRef.current?.getSourceVolumeInfo(peerId) ?? null;
    },
    []
  );

  /**
   * Get all source IDs
   */
  const getSourceIds = useCallback((): PeerId[] => {
    return mixerRef.current?.getSourceIds() ?? [];
  }, []);

  /**
   * Auto-initialize on mount
   */
  useEffect(() => {
    if (autoInitialize) {
      initialize().catch(console.error);
    }
  }, [autoInitialize, initialize]);

  /**
   * Cleanup on unmount
   */
  useEffect(() => {
    return () => {
      mixerRef.current?.dispose();
      mixerRef.current = null;
    };
  }, []);

  return {
    // State
    ...state,
    // Actions
    initialize,
    addStream,
    removeStream,
    hasStream,
    setVolume,
    getVolume,
    mute,
    unmute,
    isMuted,
    setMasterVolume,
    muteMaster,
    unmuteMaster,
    setNormalizationMode,
    getMixedStream,
    suspend,
    resume,
    dispose,
    getSourceVolumeInfo,
    getSourceIds,
  };
}

/**
 * Export type for hook return value
 */
export type UseAudioMixerReturn = ReturnType<typeof useAudioMixer>;
