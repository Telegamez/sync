/**
 * useRoomAudio Hook
 *
 * React hook for managing audio playback and track management in a room.
 * Creates audio elements for each peer's audio, handles muting/unmuting,
 * and cleans up on disconnect.
 *
 * Part of the Long-Horizon Engineering Protocol - FEAT-121
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PeerId } from "@/types/peer";

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
  /** Whether the peer is currently speaking (VAD) */
  isSpeaking: boolean;
  /** Current audio level (0-1) */
  audioLevel: number;
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
  /** Set local audio stream for analysis (no playback, just VAD) */
  setLocalStream: (peerId: PeerId, stream: MediaStream | null) => void;
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
const DEFAULT_OPTIONS: Required<
  Omit<
    UseRoomAudioOptions,
    "onPeerAudioStart" | "onPeerAudioEnd" | "onAudioError"
  >
> = {
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
  options: UseRoomAudioOptions = {},
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

  // Audio analysis refs for voice activity detection
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyzersRef = useRef<
    Map<
      PeerId,
      {
        analyser: AnalyserNode;
        source: MediaStreamAudioSourceNode;
        dataArray: Uint8Array<ArrayBuffer>;
      }
    >
  >(new Map());
  const animationFrameRef = useRef<number | null>(null);

  // State
  const [peerAudioState, setPeerAudioState] = useState<
    Map<PeerId, PeerAudioState>
  >(new Map());
  const [masterVolume, setMasterVolumeState] = useState(initialMasterVolume);
  const [isAllMuted, setIsAllMuted] = useState(false);

  // Speaking detection threshold (0-255 scale from Uint8Array)
  const SPEAKING_THRESHOLD = 20;

  /**
   * Get or create AudioContext
   */
  const getAudioContext = useCallback(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext
      )();
    }
    return audioContextRef.current;
  }, []);

  /**
   * Set up audio analyzer for a peer's stream
   */
  const setupAudioAnalyzer = useCallback(
    (peerId: PeerId, stream: MediaStream) => {
      try {
        const audioContext = getAudioContext();

        // Clean up existing analyzer for this peer
        const existing = analyzersRef.current.get(peerId);
        if (existing) {
          existing.source.disconnect();
        }

        // Create analyzer
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.5;

        // Connect stream to analyzer
        const source = audioContext.createMediaStreamSource(stream);
        source.connect(analyser);

        // Create data array for frequency data
        const dataArray = new Uint8Array(analyser.frequencyBinCount);

        analyzersRef.current.set(peerId, { analyser, source, dataArray });
      } catch (err) {
        console.warn("[useRoomAudio] Failed to setup audio analyzer:", err);
      }
    },
    [getAudioContext],
  );

  /**
   * Clean up audio analyzer for a peer
   */
  const cleanupAudioAnalyzer = useCallback((peerId: PeerId) => {
    const analyzer = analyzersRef.current.get(peerId);
    if (analyzer) {
      analyzer.source.disconnect();
      analyzersRef.current.delete(peerId);
    }
  }, []);

  /**
   * Audio level analysis loop
   */
  const analyzeAudioLevels = useCallback(() => {
    const updates: Array<{
      peerId: PeerId;
      audioLevel: number;
      isSpeaking: boolean;
    }> = [];

    analyzersRef.current.forEach(({ analyser, dataArray }, peerId) => {
      analyser.getByteFrequencyData(dataArray);

      // Calculate average audio level
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i];
      }
      const average = sum / dataArray.length;

      // Normalize to 0-1 range
      const audioLevel = Math.min(1, average / 128);
      const isSpeaking = average > SPEAKING_THRESHOLD;

      // Debug log only when speaking state changes (removed continuous logging)

      updates.push({ peerId, audioLevel, isSpeaking });
    });

    // Batch state updates
    if (updates.length > 0) {
      setPeerAudioState((prev) => {
        let hasChanges = false;
        const updated = new Map(prev);

        for (const { peerId, audioLevel, isSpeaking } of updates) {
          const current = updated.get(peerId);
          if (
            current &&
            (current.audioLevel !== audioLevel ||
              current.isSpeaking !== isSpeaking)
          ) {
            updated.set(peerId, { ...current, audioLevel, isSpeaking });
            hasChanges = true;
          }
        }

        return hasChanges ? updated : prev;
      });
    }

    // Continue animation loop
    animationFrameRef.current = requestAnimationFrame(analyzeAudioLevels);
  }, []);

  /**
   * Start audio level monitoring
   */
  const startAudioMonitoring = useCallback(() => {
    if (animationFrameRef.current === null && analyzersRef.current.size > 0) {
      analyzeAudioLevels();
    }
  }, [analyzeAudioLevels]);

  /**
   * Stop audio level monitoring
   */
  const stopAudioMonitoring = useCallback(() => {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
  }, []);

  /**
   * Create audio element for a peer
   */
  const createAudioElement = useCallback(
    (peerId: PeerId, stream: MediaStream): HTMLAudioElement => {
      // Check if element already exists
      let audioEl = audioElementsRef.current.get(peerId);

      if (!audioEl) {
        audioEl = document.createElement("audio");
        audioEl.id = `peer-audio-${peerId}`;
        audioElementsRef.current.set(peerId, audioEl);
      }

      // Configure audio element
      audioEl.srcObject = stream;
      audioEl.autoplay = autoPlay;
      audioEl.volume = masterVolume;

      // Set up event listeners
      const handlePlay = () => {
        setPeerAudioState((prev) => {
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
        setPeerAudioState((prev) => {
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
        console.error("[useRoomAudio] Playback error:", event);
        onAudioError?.(peerId, error);
      };

      audioEl.addEventListener("play", handlePlay);
      audioEl.addEventListener("ended", handleEnded);
      audioEl.addEventListener("error", handleError);

      return audioEl;
    },
    [autoPlay, masterVolume, onPeerAudioStart, onPeerAudioEnd, onAudioError],
  );

  /**
   * Add audio stream for a peer
   */
  const addPeerStream = useCallback(
    (peerId: PeerId, stream: MediaStream) => {
      console.log(
        `[useRoomAudio] Adding peer stream for ${peerId}, tracks:`,
        stream.getAudioTracks().length,
      );
      const audioEl = createAudioElement(peerId, stream);

      // Set up audio analyzer for voice activity detection
      setupAudioAnalyzer(peerId, stream);
      console.log(
        `[useRoomAudio] Audio analyzer set up for ${peerId}, analyzers count:`,
        analyzersRef.current.size,
      );

      // Update state
      setPeerAudioState((prev) => {
        const updated = new Map(prev);
        updated.set(peerId, {
          peerId,
          isMuted: isAllMuted,
          volume: masterVolume,
          isPlaying: false,
          audioElement: audioEl,
          isSpeaking: false,
          audioLevel: 0,
        });
        return updated;
      });

      // Start audio monitoring if not already running
      startAudioMonitoring();
      console.log(`[useRoomAudio] Audio monitoring started for ${peerId}`);

      // Start playback
      if (autoPlay) {
        audioEl.play().catch((err) => {
          console.warn("[useRoomAudio] Auto-play blocked:", err);
          onAudioError?.(peerId, err);
        });
      }
    },
    [
      createAudioElement,
      setupAudioAnalyzer,
      startAudioMonitoring,
      autoPlay,
      isAllMuted,
      masterVolume,
      onAudioError,
    ],
  );

  /**
   * Remove audio stream for a peer
   */
  const removePeerStream = useCallback(
    (peerId: PeerId) => {
      const audioEl = audioElementsRef.current.get(peerId);

      if (audioEl) {
        // Stop playback
        audioEl.pause();
        audioEl.srcObject = null;

        // Remove event listeners (cleanup)
        audioEl.removeAttribute("src");

        // Remove from ref
        audioElementsRef.current.delete(peerId);
      }

      // Clean up audio analyzer
      cleanupAudioAnalyzer(peerId);

      // Stop monitoring if no more peers
      if (analyzersRef.current.size === 0) {
        stopAudioMonitoring();
      }

      // Update state
      setPeerAudioState((prev) => {
        const updated = new Map(prev);
        updated.delete(peerId);
        return updated;
      });
    },
    [cleanupAudioAnalyzer, stopAudioMonitoring],
  );

  /**
   * Set local audio stream for analysis (no playback, just VAD)
   * Use this to analyze your own microphone for speaking detection
   */
  const setLocalStream = useCallback(
    (peerId: PeerId, stream: MediaStream | null) => {
      if (stream) {
        console.log(
          `[useRoomAudio] Setting local stream for ${peerId}, tracks:`,
          stream.getAudioTracks().length,
        );

        // Set up audio analyzer only (no audio element - we don't want to play our own audio)
        setupAudioAnalyzer(peerId, stream);
        console.log(`[useRoomAudio] Local audio analyzer set up for ${peerId}`);

        // Update state (no audio element for local)
        setPeerAudioState((prev) => {
          const updated = new Map(prev);
          updated.set(peerId, {
            peerId,
            isMuted: false,
            volume: 1,
            isPlaying: false,
            audioElement: null,
            isSpeaking: false,
            audioLevel: 0,
          });
          return updated;
        });

        // Start audio monitoring if not already running
        startAudioMonitoring();
      } else {
        // Remove local stream
        cleanupAudioAnalyzer(peerId);

        if (analyzersRef.current.size === 0) {
          stopAudioMonitoring();
        }

        setPeerAudioState((prev) => {
          const updated = new Map(prev);
          updated.delete(peerId);
          return updated;
        });
      }
    },
    [
      setupAudioAnalyzer,
      cleanupAudioAnalyzer,
      startAudioMonitoring,
      stopAudioMonitoring,
    ],
  );

  /**
   * Mute a specific peer
   */
  const mutePeer = useCallback((peerId: PeerId) => {
    const audioEl = audioElementsRef.current.get(peerId);
    if (audioEl) {
      audioEl.muted = true;
    }

    setPeerAudioState((prev) => {
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

    setPeerAudioState((prev) => {
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
  const togglePeerMute = useCallback(
    (peerId: PeerId) => {
      const current = peerAudioState.get(peerId);
      if (current?.isMuted) {
        unmutePeer(peerId);
      } else {
        mutePeer(peerId);
      }
    },
    [peerAudioState, mutePeer, unmutePeer],
  );

  /**
   * Set volume for a specific peer
   */
  const setPeerVolume = useCallback(
    (peerId: PeerId, volume: number) => {
      const clampedVolume = Math.max(0, Math.min(1, volume));
      const audioEl = audioElementsRef.current.get(peerId);

      if (audioEl) {
        audioEl.volume = clampedVolume * masterVolume;
      }

      setPeerAudioState((prev) => {
        const current = prev.get(peerId);
        if (current) {
          const updated = new Map(prev);
          updated.set(peerId, { ...current, volume: clampedVolume });
          return updated;
        }
        return prev;
      });
    },
    [masterVolume],
  );

  /**
   * Mute all peers
   */
  const muteAll = useCallback(() => {
    audioElementsRef.current.forEach((audioEl) => {
      audioEl.muted = true;
    });

    setPeerAudioState((prev) => {
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

    setPeerAudioState((prev) => {
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
  const setMasterVolume = useCallback(
    (volume: number) => {
      const clampedVolume = Math.max(0, Math.min(1, volume));
      setMasterVolumeState(clampedVolume);

      // Update all audio elements
      audioElementsRef.current.forEach((audioEl, peerId) => {
        const peerState = peerAudioState.get(peerId);
        const peerVolume = peerState?.volume ?? 1;
        audioEl.volume = peerVolume * clampedVolume;
      });
    },
    [peerAudioState],
  );

  /**
   * Get audio element for a peer
   */
  const getAudioElement = useCallback(
    (peerId: PeerId): HTMLAudioElement | null => {
      return audioElementsRef.current.get(peerId) ?? null;
    },
    [],
  );

  /**
   * Check if peer audio is playing
   */
  const isPeerPlaying = useCallback(
    (peerId: PeerId): boolean => {
      return peerAudioState.get(peerId)?.isPlaying ?? false;
    },
    [peerAudioState],
  );

  /**
   * Cleanup on unmount
   */
  useEffect(() => {
    return () => {
      // Stop audio monitoring
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }

      // Clean up all analyzers
      analyzersRef.current.forEach(({ source }) => {
        source.disconnect();
      });
      analyzersRef.current.clear();

      // Close audio context
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
        audioContextRef.current = null;
      }

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
    setLocalStream,
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
