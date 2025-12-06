/**
 * useRoomAudio Hook
 *
 * React hook for managing audio playback and track management in a room.
 * Creates audio elements for each peer's audio, handles muting/unmuting,
 * and cleans up on disconnect.
 *
 * Part of the Long-Horizon Engineering Protocol - FEAT-121
 */

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { PeerId } from '@/types/peer';

/**
 * Audio playback state for a peer
 */
export interface PeerAudioState {
  /** Peer ID */
  peerId: PeerId;
  /** Whether the peer's audio is muted locally */
  isMuted: boolean;
  /** Current volume (0-1) */
  volume: number;
  /** Whether audio is currently playing */
  isPlaying: boolean;
  /** Audio element reference */
  audioElement: HTMLAudioElement | null;
}

/**
 * Room audio state
 */
export interface RoomAudioState {
  /** Audio state for each peer */
  peerAudio: Map<PeerId, PeerAudioState>;
  /** Whether all peers are muted */
  isAllMuted: boolean;
  /** Master volume (0-1) */
  masterVolume: number;
}

/**
 * Room audio actions
 */
export interface RoomAudioActions {
  /** Add audio stream for a peer */
  addPeerStream: (peerId: PeerId, stream: MediaStream) => void;
  /** Remove audio stream for a peer */
  removePeerStream: (peerId: PeerId) => void;
  /** Mute a specific peer */
  mutePeer: (peerId: PeerId) => void;
  /** Unmute a specific peer */
  unmutePeer: (peerId: PeerId) => void;
  /** Toggle mute for a specific peer */
  togglePeerMute: (peerId: PeerId) => void;
  /** Set volume for a specific peer (0-1) */
  setPeerVolume: (peerId: PeerId, volume: number) => void;
  /** Mute all peers */
  muteAll: () => void;
  /** Unmute all peers */
  unmuteAll: () => void;
  /** Set master volume (0-1) */
  setMasterVolume: (volume: number) => void;
  /** Get audio element for a peer */
  getAudioElement: (peerId: PeerId) => HTMLAudioElement | null;
  /** Check if peer audio is playing */
  isPeerPlaying: (peerId: PeerId) => boolean;
}

/**
 * Hook options
 */
export interface UseRoomAudioOptions {
  /** Initial master volume (0-1) */
  initialMasterVolume?: number;
  /** Auto-play audio when stream is added */
  autoPlay?: boolean;
  /** Called when peer audio starts playing */
  onPeerAudioStart?: (peerId: PeerId) => void;
  /** Called when peer audio stops playing */
  onPeerAudioEnd?: (peerId: PeerId) => void;
  /** Called on audio playback error */
  onAudioError?: (peerId: PeerId, error: Error) => void;
}

/**
 * Default options
 */
const DEFAULT_OPTIONS: Required<Omit<UseRoomAudioOptions, 'onPeerAudioStart' | 'onPeerAudioEnd' | 'onAudioError'>> = {
  initialMasterVolume: 1.0,
  autoPlay: true,
};

/**
 * useRoomAudio Hook
 *
 * Manages audio playback for all peers in a room.
 *
 * @example
 * ```tsx
 * const { addPeerStream, removePeerStream, mutePeer } = useRoomAudio({
 *   onPeerAudioStart: (peerId) => console.log(`${peerId} audio started`),
 * });
 *
 * // When receiving a remote stream from WebRTC
 * useEffect(() => {
 *   peers.forEach(peer => {
 *     if (peer.audioStream) {
 *       addPeerStream(peer.id, peer.audioStream);
 *     }
 *   });
 * }, [peers]);
 * ```
 */
export function useRoomAudio(
  options: UseRoomAudioOptions = {}
): RoomAudioState & RoomAudioActions {
  const {
    initialMasterVolume = DEFAULT_OPTIONS.initialMasterVolume,
    autoPlay = DEFAULT_OPTIONS.autoPlay,
    onPeerAudioStart,
    onPeerAudioEnd,
    onAudioError,
  } = options;

  // Audio elements ref (DOM elements)
  const audioElementsRef = useRef<Map<PeerId, HTMLAudioElement>>(new Map());

  // State
  const [peerAudioState, setPeerAudioState] = useState<Map<PeerId, PeerAudioState>>(new Map());
  const [masterVolume, setMasterVolumeState] = useState(initialMasterVolume);
  const [isAllMuted, setIsAllMuted] = useState(false);

  /**
   * Create audio element for a peer
   */
  const createAudioElement = useCallback((peerId: PeerId, stream: MediaStream): HTMLAudioElement => {
    // Check if element already exists
    let audioEl = audioElementsRef.current.get(peerId);

    if (!audioEl) {
      audioEl = document.createElement('audio');
      audioEl.id = `peer-audio-${peerId}`;
      audioElementsRef.current.set(peerId, audioEl);
    }

    // Configure audio element
    audioEl.srcObject = stream;
    audioEl.autoplay = autoPlay;
    audioEl.volume = masterVolume;

    // Set up event listeners
    const handlePlay = () => {
      setPeerAudioState(prev => {
        const current = prev.get(peerId);
        if (current) {
          const updated = new Map(prev);
          updated.set(peerId, { ...current, isPlaying: true });
          return updated;
        }
        return prev;
      });
      onPeerAudioStart?.(peerId);
    };

    const handleEnded = () => {
      setPeerAudioState(prev => {
        const current = prev.get(peerId);
        if (current) {
          const updated = new Map(prev);
          updated.set(peerId, { ...current, isPlaying: false });
          return updated;
        }
        return prev;
      });
      onPeerAudioEnd?.(peerId);
    };

    const handleError = (event: Event) => {
      const error = new Error(`Audio playback error for peer ${peerId}`);
      console.error('[useRoomAudio] Playback error:', event);
      onAudioError?.(peerId, error);
    };

    audioEl.addEventListener('play', handlePlay);
    audioEl.addEventListener('ended', handleEnded);
    audioEl.addEventListener('error', handleError);

    return audioEl;
  }, [autoPlay, masterVolume, onPeerAudioStart, onPeerAudioEnd, onAudioError]);

  /**
   * Add audio stream for a peer
   */
  const addPeerStream = useCallback((peerId: PeerId, stream: MediaStream) => {
    const audioEl = createAudioElement(peerId, stream);

    // Update state
    setPeerAudioState(prev => {
      const updated = new Map(prev);
      updated.set(peerId, {
        peerId,
        isMuted: isAllMuted,
        volume: masterVolume,
        isPlaying: false,
        audioElement: audioEl,
      });
      return updated;
    });

    // Start playback
    if (autoPlay) {
      audioEl.play().catch(err => {
        console.warn('[useRoomAudio] Auto-play blocked:', err);
        onAudioError?.(peerId, err);
      });
    }
  }, [createAudioElement, autoPlay, isAllMuted, masterVolume, onAudioError]);

  /**
   * Remove audio stream for a peer
   */
  const removePeerStream = useCallback((peerId: PeerId) => {
    const audioEl = audioElementsRef.current.get(peerId);

    if (audioEl) {
      // Stop playback
      audioEl.pause();
      audioEl.srcObject = null;

      // Remove event listeners (cleanup)
      audioEl.removeAttribute('src');

      // Remove from ref
      audioElementsRef.current.delete(peerId);
    }

    // Update state
    setPeerAudioState(prev => {
      const updated = new Map(prev);
      updated.delete(peerId);
      return updated;
    });
  }, []);

  /**
   * Mute a specific peer
   */
  const mutePeer = useCallback((peerId: PeerId) => {
    const audioEl = audioElementsRef.current.get(peerId);
    if (audioEl) {
      audioEl.muted = true;
    }

    setPeerAudioState(prev => {
      const current = prev.get(peerId);
      if (current) {
        const updated = new Map(prev);
        updated.set(peerId, { ...current, isMuted: true });
        return updated;
      }
      return prev;
    });
  }, []);

  /**
   * Unmute a specific peer
   */
  const unmutePeer = useCallback((peerId: PeerId) => {
    const audioEl = audioElementsRef.current.get(peerId);
    if (audioEl) {
      audioEl.muted = false;
    }

    setPeerAudioState(prev => {
      const current = prev.get(peerId);
      if (current) {
        const updated = new Map(prev);
        updated.set(peerId, { ...current, isMuted: false });
        return updated;
      }
      return prev;
    });
  }, []);

  /**
   * Toggle mute for a specific peer
   */
  const togglePeerMute = useCallback((peerId: PeerId) => {
    const current = peerAudioState.get(peerId);
    if (current?.isMuted) {
      unmutePeer(peerId);
    } else {
      mutePeer(peerId);
    }
  }, [peerAudioState, mutePeer, unmutePeer]);

  /**
   * Set volume for a specific peer
   */
  const setPeerVolume = useCallback((peerId: PeerId, volume: number) => {
    const clampedVolume = Math.max(0, Math.min(1, volume));
    const audioEl = audioElementsRef.current.get(peerId);

    if (audioEl) {
      audioEl.volume = clampedVolume * masterVolume;
    }

    setPeerAudioState(prev => {
      const current = prev.get(peerId);
      if (current) {
        const updated = new Map(prev);
        updated.set(peerId, { ...current, volume: clampedVolume });
        return updated;
      }
      return prev;
    });
  }, [masterVolume]);

  /**
   * Mute all peers
   */
  const muteAll = useCallback(() => {
    audioElementsRef.current.forEach((audioEl) => {
      audioEl.muted = true;
    });

    setPeerAudioState(prev => {
      const updated = new Map(prev);
      updated.forEach((state, peerId) => {
        updated.set(peerId, { ...state, isMuted: true });
      });
      return updated;
    });

    setIsAllMuted(true);
  }, []);

  /**
   * Unmute all peers
   */
  const unmuteAll = useCallback(() => {
    audioElementsRef.current.forEach((audioEl) => {
      audioEl.muted = false;
    });

    setPeerAudioState(prev => {
      const updated = new Map(prev);
      updated.forEach((state, peerId) => {
        updated.set(peerId, { ...state, isMuted: false });
      });
      return updated;
    });

    setIsAllMuted(false);
  }, []);

  /**
   * Set master volume
   */
  const setMasterVolume = useCallback((volume: number) => {
    const clampedVolume = Math.max(0, Math.min(1, volume));
    setMasterVolumeState(clampedVolume);

    // Update all audio elements
    audioElementsRef.current.forEach((audioEl, peerId) => {
      const peerState = peerAudioState.get(peerId);
      const peerVolume = peerState?.volume ?? 1;
      audioEl.volume = peerVolume * clampedVolume;
    });
  }, [peerAudioState]);

  /**
   * Get audio element for a peer
   */
  const getAudioElement = useCallback((peerId: PeerId): HTMLAudioElement | null => {
    return audioElementsRef.current.get(peerId) ?? null;
  }, []);

  /**
   * Check if peer audio is playing
   */
  const isPeerPlaying = useCallback((peerId: PeerId): boolean => {
    return peerAudioState.get(peerId)?.isPlaying ?? false;
  }, [peerAudioState]);

  /**
   * Cleanup on unmount
   */
  useEffect(() => {
    return () => {
      // Clean up all audio elements
      audioElementsRef.current.forEach((audioEl) => {
        audioEl.pause();
        audioEl.srcObject = null;
      });
      audioElementsRef.current.clear();
    };
  }, []);

  return {
    // State
    peerAudio: peerAudioState,
    isAllMuted,
    masterVolume,
    // Actions
    addPeerStream,
    removePeerStream,
    mutePeer,
    unmutePeer,
    togglePeerMute,
    setPeerVolume,
    muteAll,
    unmuteAll,
    setMasterVolume,
    getAudioElement,
    isPeerPlaying,
  };
}

/**
 * Export type for hook return value
 */
export type UseRoomAudioReturn = ReturnType<typeof useRoomAudio>;
