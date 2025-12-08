/**
 * usePresence Hook
 *
 * React hook for managing real-time presence state in a room.
 * Tracks speaking/muted state per peer and handles local presence updates.
 *
 * Part of the Long-Horizon Engineering Protocol - FEAT-110
 */

"use client";

import { useCallback, useEffect, useRef, useState, useMemo } from "react";
import type { SignalingClient } from "@/lib/signaling/client";
import type { PeerId, PeerSummary, PeerAudioLevelUpdate } from "@/types/peer";
import type { RoomId } from "@/types/room";
import type {
  PresenceUpdatePayload,
  PresenceSyncPayload,
  AudioLevelsPayload,
} from "@/types/signaling";

/**
 * Presence state for a single peer
 */
export interface PeerPresenceState {
  /** Peer ID */
  peerId: PeerId;
  /** Whether peer is muted */
  isMuted: boolean;
  /** Whether peer is speaking (VAD detected) */
  isSpeaking: boolean;
  /** Whether peer is addressing AI (PTT active) */
  isAddressingAI: boolean;
  /** Audio level (0-1) for visualization */
  audioLevel: number;
  /** Last update timestamp */
  lastUpdatedAt: Date;
}

/**
 * Local presence state that can be updated
 */
export interface LocalPresenceState {
  /** Whether local user is muted */
  isMuted: boolean;
  /** Whether local user is speaking */
  isSpeaking: boolean;
  /** Whether local user is addressing AI */
  isAddressingAI: boolean;
  /** Current audio level */
  audioLevel: number;
}

/**
 * Presence hook state
 */
export interface PresenceState {
  /** Presence state for all peers (excluding local) */
  peerPresence: Map<PeerId, PeerPresenceState>;
  /** Local presence state */
  localPresence: LocalPresenceState;
  /** List of currently speaking peers */
  speakingPeers: PeerId[];
  /** List of currently muted peers */
  mutedPeers: PeerId[];
  /** Active speaker (peer with highest audio level) */
  activeSpeaker: PeerId | null;
  /** Whether any peer is addressing AI */
  anyAddressingAI: boolean;
}

/**
 * Presence hook actions
 */
export interface PresenceActions {
  /** Update local presence state */
  updatePresence: (update: Partial<LocalPresenceState>) => void;
  /** Set local muted state */
  setMuted: (muted: boolean) => void;
  /** Toggle local muted state */
  toggleMute: () => void;
  /** Set local speaking state (usually from VAD) */
  setSpeaking: (speaking: boolean) => void;
  /** Set local addressing AI state (PTT) */
  setAddressingAI: (addressing: boolean) => void;
  /** Set local audio level (from analyzer) */
  setAudioLevel: (level: number) => void;
  /** Get presence for a specific peer */
  getPeerPresence: (peerId: PeerId) => PeerPresenceState | undefined;
  /** Check if peer is speaking */
  isPeerSpeaking: (peerId: PeerId) => boolean;
  /** Check if peer is muted */
  isPeerMuted: (peerId: PeerId) => boolean;
}

/**
 * Hook options
 */
export interface UsePresenceOptions {
  /** Signaling client instance */
  client: SignalingClient | null;
  /** Current room ID */
  roomId: RoomId | null;
  /** Local peer ID */
  localPeerId: PeerId | null;
  /** Initial peers list */
  initialPeers?: PeerSummary[];
  /** Debounce interval for presence updates (ms) */
  debounceInterval?: number;
  /** Minimum audio level change to trigger update */
  audioLevelThreshold?: number;
  /** Called when local presence changes */
  onLocalPresenceChange?: (presence: LocalPresenceState) => void;
  /** Called when peer presence changes */
  onPeerPresenceChange?: (peerId: PeerId, presence: PeerPresenceState) => void;
  /** Called when active speaker changes */
  onActiveSpeakerChange?: (peerId: PeerId | null) => void;
}

/**
 * Default options
 */
const DEFAULT_OPTIONS = {
  debounceInterval: 100,
  audioLevelThreshold: 0.05,
};

/**
 * Initial local presence state
 */
const INITIAL_LOCAL_PRESENCE: LocalPresenceState = {
  isMuted: true, // Default to muted
  isSpeaking: false,
  isAddressingAI: false,
  audioLevel: 0,
};

/**
 * Create presence state from peer summary
 */
function createPeerPresenceFromSummary(peer: PeerSummary): PeerPresenceState {
  return {
    peerId: peer.id,
    isMuted: peer.isMuted,
    isSpeaking: peer.isSpeaking,
    isAddressingAI: false,
    audioLevel: 0,
    lastUpdatedAt: new Date(),
  };
}

/**
 * usePresence Hook
 *
 * Manages real-time presence state for all peers in a room.
 *
 * @example
 * ```tsx
 * const {
 *   localPresence,
 *   peerPresence,
 *   speakingPeers,
 *   activeSpeaker,
 *   updatePresence,
 *   setMuted,
 *   toggleMute,
 * } = usePresence({
 *   client: signalingClient,
 *   roomId: 'room-123',
 *   localPeerId: 'peer-1',
 *   initialPeers: existingPeers,
 *   onActiveSpeakerChange: (peerId) => {
 *     console.log('Active speaker:', peerId);
 *   },
 * });
 *
 * // Toggle mute
 * toggleMute();
 *
 * // Update speaking state from VAD
 * setSpeaking(true);
 * ```
 */
export function usePresence(
  options: UsePresenceOptions,
): PresenceState & PresenceActions {
  const {
    client,
    roomId,
    localPeerId,
    initialPeers = [],
    debounceInterval = DEFAULT_OPTIONS.debounceInterval,
    audioLevelThreshold = DEFAULT_OPTIONS.audioLevelThreshold,
    onLocalPresenceChange,
    onPeerPresenceChange,
    onActiveSpeakerChange,
  } = options;

  // Peer presence state
  const [peerPresence, setPeerPresence] = useState<
    Map<PeerId, PeerPresenceState>
  >(() => {
    const map = new Map<PeerId, PeerPresenceState>();
    initialPeers.forEach((peer) => {
      if (peer.id !== localPeerId) {
        map.set(peer.id, createPeerPresenceFromSummary(peer));
      }
    });
    return map;
  });

  // Local presence state
  const [localPresence, setLocalPresence] = useState<LocalPresenceState>(
    INITIAL_LOCAL_PRESENCE,
  );

  // Refs for debouncing and tracking
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastSentPresenceRef = useRef<LocalPresenceState>(
    INITIAL_LOCAL_PRESENCE,
  );
  const previousActiveSpeakerRef = useRef<PeerId | null>(null);

  /**
   * Send presence update to server (debounced)
   */
  const sendPresenceUpdate = useCallback(
    (update: Partial<PresenceUpdatePayload>) => {
      if (!client || !roomId) return;

      // Clear existing timer
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      // Debounce the update
      debounceTimerRef.current = setTimeout(() => {
        client.updatePresence(update);
      }, debounceInterval);
    },
    [client, roomId, debounceInterval],
  );

  /**
   * Update local presence and send to server
   */
  const updatePresence = useCallback(
    (update: Partial<LocalPresenceState>) => {
      setLocalPresence((prev) => {
        const next = { ...prev, ...update };

        // Only send update if values changed significantly
        const shouldSend =
          next.isMuted !== lastSentPresenceRef.current.isMuted ||
          next.isSpeaking !== lastSentPresenceRef.current.isSpeaking ||
          next.isAddressingAI !== lastSentPresenceRef.current.isAddressingAI ||
          Math.abs(next.audioLevel - lastSentPresenceRef.current.audioLevel) >
            audioLevelThreshold;

        if (shouldSend) {
          lastSentPresenceRef.current = next;
          sendPresenceUpdate({
            isMuted: next.isMuted,
            isSpeaking: next.isSpeaking,
            isAddressingAI: next.isAddressingAI,
            audioLevel: next.audioLevel,
          });
        }

        return next;
      });
    },
    [sendPresenceUpdate, audioLevelThreshold],
  );

  /**
   * Set muted state
   */
  const setMuted = useCallback(
    (muted: boolean) => {
      updatePresence({ isMuted: muted });
    },
    [updatePresence],
  );

  /**
   * Toggle mute state
   */
  const toggleMute = useCallback(() => {
    setLocalPresence((prev) => {
      const next = { ...prev, isMuted: !prev.isMuted };
      lastSentPresenceRef.current = next;
      sendPresenceUpdate({ isMuted: next.isMuted });
      return next;
    });
  }, [sendPresenceUpdate]);

  /**
   * Set speaking state
   */
  const setSpeaking = useCallback(
    (speaking: boolean) => {
      updatePresence({ isSpeaking: speaking });
    },
    [updatePresence],
  );

  /**
   * Set addressing AI state
   */
  const setAddressingAI = useCallback(
    (addressing: boolean) => {
      updatePresence({ isAddressingAI: addressing });
    },
    [updatePresence],
  );

  /**
   * Set audio level
   */
  const setAudioLevel = useCallback(
    (level: number) => {
      // Clamp to 0-1
      const clampedLevel = Math.max(0, Math.min(1, level));
      updatePresence({ audioLevel: clampedLevel });
    },
    [updatePresence],
  );

  /**
   * Get presence for a specific peer
   */
  const getPeerPresence = useCallback(
    (peerId: PeerId): PeerPresenceState | undefined => {
      return peerPresence.get(peerId);
    },
    [peerPresence],
  );

  /**
   * Check if peer is speaking
   */
  const isPeerSpeaking = useCallback(
    (peerId: PeerId): boolean => {
      return peerPresence.get(peerId)?.isSpeaking ?? false;
    },
    [peerPresence],
  );

  /**
   * Check if peer is muted
   */
  const isPeerMuted = useCallback(
    (peerId: PeerId): boolean => {
      return peerPresence.get(peerId)?.isMuted ?? true;
    },
    [peerPresence],
  );

  /**
   * Handle presence update from server
   */
  const handlePresenceUpdate = useCallback(
    (peer: PeerSummary) => {
      if (peer.id === localPeerId) return; // Ignore updates for local peer

      setPeerPresence((prev) => {
        const next = new Map(prev);
        const existing = prev.get(peer.id);
        const updated: PeerPresenceState = {
          peerId: peer.id,
          isMuted: peer.isMuted,
          isSpeaking: peer.isSpeaking,
          isAddressingAI: existing?.isAddressingAI ?? false,
          audioLevel: existing?.audioLevel ?? 0,
          lastUpdatedAt: new Date(),
        };
        next.set(peer.id, updated);
        onPeerPresenceChange?.(peer.id, updated);
        return next;
      });
    },
    [localPeerId, onPeerPresenceChange],
  );

  /**
   * Handle presence sync (full state)
   */
  const handlePresenceSync = useCallback(
    (payload: PresenceSyncPayload) => {
      if (payload.roomId !== roomId) return;

      setPeerPresence((prev) => {
        const next = new Map<PeerId, PeerPresenceState>();
        payload.peers.forEach((peer) => {
          if (peer.id !== localPeerId) {
            const existing = prev.get(peer.id);
            next.set(peer.id, {
              peerId: peer.id,
              isMuted: peer.isMuted,
              isSpeaking: peer.isSpeaking,
              isAddressingAI: existing?.isAddressingAI ?? false,
              audioLevel: existing?.audioLevel ?? 0,
              lastUpdatedAt: new Date(),
            });
          }
        });
        return next;
      });
    },
    [roomId, localPeerId],
  );

  /**
   * Handle audio levels update (high frequency)
   */
  const handleAudioLevels = useCallback(
    (payload: AudioLevelsPayload) => {
      if (payload.roomId !== roomId) return;

      setPeerPresence((prev) => {
        const next = new Map(prev);
        let hasChanges = false;

        payload.levels.forEach((update: PeerAudioLevelUpdate) => {
          if (update.peerId === localPeerId) return;

          const existing = prev.get(update.peerId);
          if (existing) {
            // Only update if change is significant
            if (
              Math.abs(existing.audioLevel - update.audioLevel) >
                audioLevelThreshold ||
              existing.isSpeaking !== update.isSpeaking
            ) {
              next.set(update.peerId, {
                ...existing,
                audioLevel: update.audioLevel,
                isSpeaking: update.isSpeaking,
                lastUpdatedAt: new Date(),
              });
              hasChanges = true;
            }
          }
        });

        return hasChanges ? next : prev;
      });
    },
    [roomId, localPeerId, audioLevelThreshold],
  );

  /**
   * Handle peer joined
   */
  const handlePeerJoined = useCallback(
    (peer: PeerSummary) => {
      if (peer.id === localPeerId) return;

      setPeerPresence((prev) => {
        const next = new Map(prev);
        next.set(peer.id, createPeerPresenceFromSummary(peer));
        return next;
      });
    },
    [localPeerId],
  );

  /**
   * Handle peer left
   */
  const handlePeerLeft = useCallback((peerId: PeerId) => {
    setPeerPresence((prev) => {
      const next = new Map(prev);
      next.delete(peerId);
      return next;
    });
  }, []);

  // Setup event handlers
  useEffect(() => {
    if (!client) return;

    client.on("onPresenceUpdate", handlePresenceUpdate);
    client.on("onPresenceSync", handlePresenceSync);
    client.on("onAudioLevels", handleAudioLevels);
    client.on("onPeerJoined", handlePeerJoined);
    client.on("onPeerLeft", handlePeerLeft);

    return () => {
      client.off("onPresenceUpdate", handlePresenceUpdate);
      client.off("onPresenceSync", handlePresenceSync);
      client.off("onAudioLevels", handleAudioLevels);
      client.off("onPeerJoined", handlePeerJoined);
      client.off("onPeerLeft", handlePeerLeft);
    };
  }, [
    client,
    handlePresenceUpdate,
    handlePresenceSync,
    handleAudioLevels,
    handlePeerJoined,
    handlePeerLeft,
  ]);

  // Notify on local presence change
  useEffect(() => {
    onLocalPresenceChange?.(localPresence);
  }, [localPresence, onLocalPresenceChange]);

  // Sync initial presence state when joining a room
  // This ensures other peers see our correct mute state immediately
  useEffect(() => {
    if (!client || !roomId || !localPeerId) return;

    // Send initial presence state to server so other peers see correct state
    // Small delay to ensure room join is complete
    const timer = setTimeout(() => {
      sendPresenceUpdate({
        isMuted: localPresence.isMuted,
        isSpeaking: localPresence.isSpeaking,
        isAddressingAI: localPresence.isAddressingAI,
      });
      console.log(
        "[Presence] Synced initial presence state:",
        localPresence.isMuted ? "muted" : "unmuted",
      );
    }, 100);

    return () => clearTimeout(timer);
    // Only run once when room is joined (roomId and localPeerId become available)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, roomId, localPeerId]);

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  // Compute derived state
  const speakingPeers = useMemo((): PeerId[] => {
    return Array.from(peerPresence.values())
      .filter((p) => p.isSpeaking)
      .map((p) => p.peerId);
  }, [peerPresence]);

  const mutedPeers = useMemo((): PeerId[] => {
    return Array.from(peerPresence.values())
      .filter((p) => p.isMuted)
      .map((p) => p.peerId);
  }, [peerPresence]);

  const activeSpeaker = useMemo((): PeerId | null => {
    // Include local peer if speaking
    let maxLevel = localPresence.isSpeaking ? localPresence.audioLevel : 0;
    let speaker: PeerId | null =
      localPresence.isSpeaking && localPeerId ? localPeerId : null;

    peerPresence.forEach((presence) => {
      if (presence.isSpeaking && presence.audioLevel > maxLevel) {
        maxLevel = presence.audioLevel;
        speaker = presence.peerId;
      }
    });

    return speaker;
  }, [peerPresence, localPresence, localPeerId]);

  // Notify on active speaker change
  useEffect(() => {
    if (activeSpeaker !== previousActiveSpeakerRef.current) {
      previousActiveSpeakerRef.current = activeSpeaker;
      onActiveSpeakerChange?.(activeSpeaker);
    }
  }, [activeSpeaker, onActiveSpeakerChange]);

  const anyAddressingAI = useMemo((): boolean => {
    if (localPresence.isAddressingAI) return true;
    return Array.from(peerPresence.values()).some((p) => p.isAddressingAI);
  }, [peerPresence, localPresence.isAddressingAI]);

  return {
    // State
    peerPresence,
    localPresence,
    speakingPeers,
    mutedPeers,
    activeSpeaker,
    anyAddressingAI,
    // Actions
    updatePresence,
    setMuted,
    toggleMute,
    setSpeaking,
    setAddressingAI,
    setAudioLevel,
    getPeerPresence,
    isPeerSpeaking,
    isPeerMuted,
  };
}

/**
 * Export type for hook return value
 */
export type UsePresenceReturn = ReturnType<typeof usePresence>;
