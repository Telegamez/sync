/**
 * useRoomPeers Hook
 *
 * React hook for managing peer state and WebRTC peer connections.
 * Tracks all peers in a room and maintains mesh topology connections.
 *
 * Part of the Long-Horizon Engineering Protocol - FEAT-109
 */

"use client";

import { useCallback, useEffect, useRef, useState, useMemo } from "react";
import type { SignalingClient } from "@/lib/signaling/client";
import type { PeerId, PeerSummary, PeerConnectionState } from "@/types/peer";
import type { RoomId } from "@/types/room";
import {
  calculateReconnectionDelay,
  shouldReconnect,
  DEFAULT_RECONNECTION_OPTIONS,
} from "@/lib/reconnection";

/**
 * WebRTC connection info for a peer
 */
export interface PeerConnection {
  /** Peer ID */
  peerId: PeerId;
  /** RTCPeerConnection instance */
  connection: RTCPeerConnection;
  /** Connection state */
  connectionState: PeerConnectionState;
  /** Remote audio stream */
  remoteStream: MediaStream | null;
  /** Whether we initiated the connection */
  isInitiator: boolean;
  /** Reconnection attempt count */
  reconnectAttempts: number;
  /** Timestamp when connection started */
  connectionStartedAt: number;
}

/**
 * Reconnection state for a peer
 */
export interface PeerReconnectionState {
  peerId: PeerId;
  attempt: number;
  maxAttempts: number;
  isReconnecting: boolean;
  lastError?: string;
}

/**
 * Enhanced peer with WebRTC connection info
 */
export interface ConnectedPeer extends PeerSummary {
  /** WebRTC connection state */
  webrtcState: PeerConnectionState;
  /** Whether audio is available */
  hasAudio: boolean;
  /** Remote audio stream */
  audioStream: MediaStream | null;
}

/**
 * Peers state
 */
export interface RoomPeersState {
  /** All peers in room (excluding local) */
  peers: ConnectedPeer[];
  /** Peer count */
  peerCount: number;
  /** Number of fully connected peers */
  connectedCount: number;
  /** Whether all peers are connected */
  allConnected: boolean;
  /** Local peer ID */
  localPeerId: PeerId | null;
}

/**
 * Peers actions
 */
export interface RoomPeersActions {
  /** Set local audio stream for all connections */
  setLocalStream: (stream: MediaStream | null) => void;
  /** Get peer by ID */
  getPeer: (peerId: PeerId) => ConnectedPeer | undefined;
  /** Get all audio streams */
  getAudioStreams: () => Map<PeerId, MediaStream>;
  /** Force reconnect to a peer */
  reconnectPeer: (peerId: PeerId) => void;
}

/**
 * Hook options
 */
export interface UseRoomPeersOptions {
  /** Signaling client instance */
  client: SignalingClient | null;
  /** Room ID */
  roomId: RoomId | null;
  /** Local peer ID */
  localPeerId: PeerId | null;
  /** Initial peers list */
  initialPeers?: PeerSummary[];
  /** RTC configuration */
  rtcConfig?: RTCConfiguration;
  /** Called when peer audio stream available */
  onPeerAudioStream?: (peerId: PeerId, stream: MediaStream) => void;
  /** Called when peer connection state changes */
  onPeerConnectionStateChange?: (
    peerId: PeerId,
    state: PeerConnectionState,
  ) => void;
  /** Called when peer reconnection starts */
  onPeerReconnecting?: (peerId: PeerId, attempt: number) => void;
  /** Called when peer reconnection fails after all attempts */
  onPeerReconnectFailed?: (peerId: PeerId, error: string) => void;
  /** Called when peer reconnection succeeds */
  onPeerReconnected?: (peerId: PeerId) => void;
  /** Maximum reconnection attempts per peer (default: 5) */
  maxReconnectAttempts?: number;
  /** Connection timeout in milliseconds (default: 20000) */
  connectionTimeout?: number;
}

/**
 * Default RTC configuration
 */
const DEFAULT_RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

/**
 * Initial state
 */
const INITIAL_STATE: RoomPeersState = {
  peers: [],
  peerCount: 0,
  connectedCount: 0,
  allConnected: false,
  localPeerId: null,
};

/**
 * useRoomPeers Hook
 *
 * Manages peer WebRTC connections in a mesh topology.
 *
 * @example
 * ```tsx
 * const { peers, setLocalStream } = useRoomPeers({
 *   client: signalingClient,
 *   roomId: 'room-123',
 *   localPeerId: 'peer-1',
 *   initialPeers: existingPeers,
 *   onPeerAudioStream: (peerId, stream) => {
 *     // Play remote audio
 *   },
 * });
 *
 * // Set local audio for all connections
 * setLocalStream(localAudioStream);
 * ```
 */
export function useRoomPeers(
  options: UseRoomPeersOptions,
): RoomPeersState & RoomPeersActions {
  const {
    client,
    roomId,
    localPeerId,
    initialPeers = [],
    rtcConfig = DEFAULT_RTC_CONFIG,
    onPeerAudioStream,
    onPeerConnectionStateChange,
    onPeerReconnecting,
    onPeerReconnectFailed,
    onPeerReconnected,
    maxReconnectAttempts = DEFAULT_RECONNECTION_OPTIONS.maxAttempts,
    connectionTimeout = 20000,
  } = options;

  // Refs for connections and streams
  const connectionsRef = useRef<Map<PeerId, PeerConnection>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const pendingCandidatesRef = useRef<Map<PeerId, RTCIceCandidateInit[]>>(
    new Map(),
  );
  // Track reconnection state per peer
  const reconnectionStateRef = useRef<Map<PeerId, PeerReconnectionState>>(
    new Map(),
  );
  // Track reconnection timers to clean up
  const reconnectionTimersRef = useRef<Map<PeerId, NodeJS.Timeout>>(new Map());
  // Track connection timeout timers
  const connectionTimeoutRef = useRef<Map<PeerId, NodeJS.Timeout>>(new Map());
  // Ref for reconnectPeerInternal to break circular dependency
  const reconnectPeerInternalRef = useRef<
    ((peerId: PeerId, attempt: number) => void) | null
  >(null);
  // Track pending connections to prevent duplicate connection attempts (FEAT-420)
  const pendingConnectionsRef = useRef<Set<PeerId>>(new Set());

  // Peer summaries state
  const [peerSummaries, setPeerSummaries] = useState<Map<PeerId, PeerSummary>>(
    new Map(initialPeers.map((p) => [p.id, p])),
  );

  // Connection states
  const [connectionStates, setConnectionStates] = useState<
    Map<PeerId, PeerConnectionState>
  >(new Map());

  // Audio streams
  const [audioStreams, setAudioStreams] = useState<Map<PeerId, MediaStream>>(
    new Map(),
  );

  /**
   * Clear connection timeout for a peer
   */
  const clearConnectionTimeout = useCallback((peerId: PeerId) => {
    const timer = connectionTimeoutRef.current.get(peerId);
    if (timer) {
      clearTimeout(timer);
      connectionTimeoutRef.current.delete(peerId);
    }
  }, []);

  /**
   * Clear reconnection timer for a peer
   */
  const clearReconnectionTimer = useCallback((peerId: PeerId) => {
    const timer = reconnectionTimersRef.current.get(peerId);
    if (timer) {
      clearTimeout(timer);
      reconnectionTimersRef.current.delete(peerId);
    }
  }, []);

  /**
   * Schedule automatic reconnection for a peer with exponential backoff
   */
  const scheduleReconnection = useCallback(
    (peerId: PeerId, attempt: number, error?: string) => {
      // Check if peer is still in the room (hasn't left)
      if (!peerSummaries.has(peerId)) {
        console.log(
          `[useRoomPeers] Peer ${peerId} left room, skipping reconnection`,
        );
        reconnectionStateRef.current.delete(peerId);
        return;
      }

      // Check if we should reconnect
      if (!shouldReconnect(attempt, maxReconnectAttempts, error)) {
        console.error(
          `[useRoomPeers] Max reconnection attempts (${maxReconnectAttempts}) reached for peer ${peerId}`,
        );
        onPeerReconnectFailed?.(
          peerId,
          error || "Max reconnection attempts reached",
        );
        reconnectionStateRef.current.delete(peerId);
        return;
      }

      // Calculate delay with exponential backoff
      const delay = calculateReconnectionDelay(attempt, {
        maxAttempts: maxReconnectAttempts,
      });

      console.log(
        `[useRoomPeers] Scheduling reconnection to peer ${peerId} (attempt ${attempt}/${maxReconnectAttempts}) in ${delay}ms`,
      );

      // Update reconnection state
      reconnectionStateRef.current.set(peerId, {
        peerId,
        attempt,
        maxAttempts: maxReconnectAttempts,
        isReconnecting: true,
        lastError: error,
      });

      // Notify about reconnection attempt
      onPeerReconnecting?.(peerId, attempt);

      // Clear any existing timer
      clearReconnectionTimer(peerId);

      // Schedule reconnection
      const timer = setTimeout(() => {
        reconnectionTimersRef.current.delete(peerId);

        // Double-check peer is still in room before reconnecting
        if (!peerSummaries.has(peerId)) {
          reconnectionStateRef.current.delete(peerId);
          return;
        }

        // Perform reconnection via ref
        reconnectPeerInternalRef.current?.(peerId, attempt);
      }, delay);

      reconnectionTimersRef.current.set(peerId, timer);
    },
    [
      peerSummaries,
      maxReconnectAttempts,
      onPeerReconnecting,
      onPeerReconnectFailed,
      clearReconnectionTimer,
    ],
  );

  /**
   * Create RTCPeerConnection for a peer
   */
  const createPeerConnection = useCallback(
    (
      peerId: PeerId,
      isInitiator: boolean,
      reconnectAttempt: number = 0,
    ): RTCPeerConnection => {
      const pc = new RTCPeerConnection(rtcConfig);
      const connectionStartedAt = Date.now();

      // Track connection state
      pc.onconnectionstatechange = () => {
        const rawState = pc.connectionState;
        const state = rawState as PeerConnectionState;
        setConnectionStates((prev) => new Map(prev).set(peerId, state));
        onPeerConnectionStateChange?.(peerId, state);

        // Clear connection timeout on successful connection
        if (rawState === "connected") {
          clearConnectionTimeout(peerId);

          // Clear reconnection state on success
          const wasReconnecting = reconnectionStateRef.current.has(peerId);
          reconnectionStateRef.current.delete(peerId);

          if (wasReconnecting) {
            console.log(
              `[useRoomPeers] Reconnection to peer ${peerId} successful`,
            );
            onPeerReconnected?.(peerId);
          }
        }

        // Handle connection failure - trigger automatic reconnection
        if (rawState === "failed") {
          console.warn(
            `[useRoomPeers] Connection to peer ${peerId} failed, attempting reconnection`,
          );

          // Clear connection timeout
          clearConnectionTimeout(peerId);

          // Close the failed connection
          const peerConn = connectionsRef.current.get(peerId);
          if (peerConn) {
            peerConn.connection.close();
            connectionsRef.current.delete(peerId);
          }

          // Get current attempt count
          const currentAttempt =
            peerConn?.reconnectAttempts ?? reconnectAttempt;

          // Only auto-reconnect if we're the initiator (higher ID)
          // This prevents both peers from reconnecting simultaneously
          if (localPeerId && peerId > localPeerId) {
            scheduleReconnection(
              peerId,
              currentAttempt + 1,
              "Connection failed",
            );
          }
        }

        // Clean up on closed
        if (rawState === "closed") {
          clearConnectionTimeout(peerId);
          connectionsRef.current.delete(peerId);
        }
      };

      // Handle ICE candidates
      pc.onicecandidate = (event) => {
        if (event.candidate && client) {
          client.sendIce({
            targetPeerId: peerId,
            candidate: event.candidate.toJSON(),
          });
        }
      };

      // Handle incoming tracks
      pc.ontrack = (event) => {
        const stream = event.streams[0];
        if (stream) {
          setAudioStreams((prev) => new Map(prev).set(peerId, stream));
          onPeerAudioStream?.(peerId, stream);

          // Update connection ref
          const existing = connectionsRef.current.get(peerId);
          if (existing) {
            existing.remoteStream = stream;
          }
        }
      };

      // Add local stream if available
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => {
          pc.addTrack(track, localStreamRef.current!);
        });
      }

      // Store connection with reconnection tracking
      connectionsRef.current.set(peerId, {
        peerId,
        connection: pc,
        connectionState: "new",
        remoteStream: null,
        isInitiator,
        reconnectAttempts: reconnectAttempt,
        connectionStartedAt,
      });

      // Set up connection timeout
      clearConnectionTimeout(peerId);
      const timeoutTimer = setTimeout(() => {
        const currentConn = connectionsRef.current.get(peerId);
        if (
          currentConn &&
          currentConn.connection.connectionState !== "connected"
        ) {
          console.warn(
            `[useRoomPeers] Connection to peer ${peerId} timed out after ${connectionTimeout}ms`,
          );

          // Close the timed-out connection
          currentConn.connection.close();
          connectionsRef.current.delete(peerId);

          // Schedule reconnection if we're the initiator
          if (localPeerId && peerId > localPeerId) {
            scheduleReconnection(
              peerId,
              (currentConn.reconnectAttempts ?? 0) + 1,
              "Connection timeout",
            );
          }
        }
      }, connectionTimeout);
      connectionTimeoutRef.current.set(peerId, timeoutTimer);

      return pc;
    },
    [
      client,
      rtcConfig,
      localPeerId,
      connectionTimeout,
      onPeerAudioStream,
      onPeerConnectionStateChange,
      onPeerReconnected,
      clearConnectionTimeout,
      scheduleReconnection,
    ],
  );

  /**
   * Initiate connection to peer (create offer)
   */
  const initiateConnection = useCallback(
    async (peerId: PeerId, reconnectAttempt: number = 0) => {
      if (!client) return;

      // FEAT-420: Check for existing connection or pending connection
      if (connectionsRef.current.has(peerId)) {
        console.log(
          `[useRoomPeers] Connection to ${peerId} already exists, skipping`,
        );
        return;
      }

      if (pendingConnectionsRef.current.has(peerId)) {
        console.log(
          `[useRoomPeers] Connection to ${peerId} already in progress, skipping`,
        );
        return;
      }

      // Mark connection as pending
      pendingConnectionsRef.current.add(peerId);
      console.log(`[useRoomPeers] Initiating connection to ${peerId}`);

      const pc = createPeerConnection(peerId, true, reconnectAttempt);

      try {
        const offer = await pc.createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: false,
        });
        await pc.setLocalDescription(offer);

        client.sendOffer({
          targetPeerId: peerId,
          sdp: offer,
        });

        // Clear pending status after offer sent (connection now tracked in connectionsRef)
        pendingConnectionsRef.current.delete(peerId);
      } catch (error) {
        // Clear pending status on failure
        pendingConnectionsRef.current.delete(peerId);

        console.error(
          `[useRoomPeers] Failed to create offer for ${peerId}:`,
          error,
        );

        // Schedule reconnection on offer creation failure
        if (localPeerId && peerId > localPeerId) {
          scheduleReconnection(
            peerId,
            reconnectAttempt + 1,
            error instanceof Error ? error.message : "Offer creation failed",
          );
        }
      }
    },
    [client, localPeerId, createPeerConnection, scheduleReconnection],
  );

  /**
   * Internal reconnection handler (used by scheduled reconnections)
   */
  const reconnectPeerInternal = useCallback(
    (peerId: PeerId, attempt: number) => {
      console.log(
        `[useRoomPeers] Reconnecting to peer ${peerId} (attempt ${attempt})`,
      );

      // Close existing connection if any
      const existing = connectionsRef.current.get(peerId);
      if (existing) {
        existing.connection.close();
        connectionsRef.current.delete(peerId);
      }

      // Clear state
      setConnectionStates((prev) => {
        const next = new Map(prev);
        next.delete(peerId);
        return next;
      });
      setAudioStreams((prev) => {
        const next = new Map(prev);
        next.delete(peerId);
        return next;
      });
      pendingCandidatesRef.current.delete(peerId);

      // Re-initiate connection with attempt count
      initiateConnection(peerId, attempt);
    },
    [initiateConnection],
  );

  /**
   * Handle incoming offer
   */
  const handleOffer = useCallback(
    async (fromPeerId: PeerId, sdp: RTCSessionDescriptionInit) => {
      if (!client) return;

      // Close existing connection if any
      const existing = connectionsRef.current.get(fromPeerId);
      if (existing) {
        existing.connection.close();
        connectionsRef.current.delete(fromPeerId);
      }

      const pc = createPeerConnection(fromPeerId, false);

      try {
        await pc.setRemoteDescription(new RTCSessionDescription(sdp));

        // Apply pending ICE candidates
        const pending = pendingCandidatesRef.current.get(fromPeerId) || [];
        for (const candidate of pending) {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        }
        pendingCandidatesRef.current.delete(fromPeerId);

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        client.sendAnswer({
          targetPeerId: fromPeerId,
          sdp: answer,
        });
      } catch (error) {
        console.error(
          `[useRoomPeers] Failed to handle offer from ${fromPeerId}:`,
          error,
        );
      }
    },
    [client, createPeerConnection],
  );

  /**
   * Handle incoming answer
   */
  const handleAnswer = useCallback(
    async (fromPeerId: PeerId, sdp: RTCSessionDescriptionInit) => {
      const peerConn = connectionsRef.current.get(fromPeerId);
      if (!peerConn) {
        console.warn(
          `[useRoomPeers] No connection for answer from ${fromPeerId}`,
        );
        return;
      }

      try {
        await peerConn.connection.setRemoteDescription(
          new RTCSessionDescription(sdp),
        );

        // Apply pending ICE candidates
        const pending = pendingCandidatesRef.current.get(fromPeerId) || [];
        for (const candidate of pending) {
          await peerConn.connection.addIceCandidate(
            new RTCIceCandidate(candidate),
          );
        }
        pendingCandidatesRef.current.delete(fromPeerId);
      } catch (error) {
        console.error(
          `[useRoomPeers] Failed to handle answer from ${fromPeerId}:`,
          error,
        );
      }
    },
    [],
  );

  /**
   * Handle incoming ICE candidate
   */
  const handleIceCandidate = useCallback(
    async (fromPeerId: PeerId, candidate: RTCIceCandidateInit) => {
      const peerConn = connectionsRef.current.get(fromPeerId);

      if (!peerConn || !peerConn.connection.remoteDescription) {
        // Queue candidate for later
        const pending = pendingCandidatesRef.current.get(fromPeerId) || [];
        pending.push(candidate);
        pendingCandidatesRef.current.set(fromPeerId, pending);
        return;
      }

      try {
        await peerConn.connection.addIceCandidate(
          new RTCIceCandidate(candidate),
        );
      } catch (error) {
        console.error(
          `[useRoomPeers] Failed to add ICE candidate from ${fromPeerId}:`,
          error,
        );
      }
    },
    [],
  );

  /**
   * Handle peer joined
   */
  const handlePeerJoined = useCallback(
    (peer: PeerSummary) => {
      setPeerSummaries((prev) => new Map(prev).set(peer.id, peer));

      // Initiate connection (higher ID initiates to avoid race condition)
      if (localPeerId && peer.id > localPeerId) {
        initiateConnection(peer.id);
      }
    },
    [localPeerId, initiateConnection],
  );

  /**
   * Handle peer left
   */
  const handlePeerLeft = useCallback(
    (peerId: PeerId) => {
      // Remove peer summary
      setPeerSummaries((prev) => {
        const next = new Map(prev);
        next.delete(peerId);
        return next;
      });

      // Close and remove connection
      const peerConn = connectionsRef.current.get(peerId);
      if (peerConn) {
        peerConn.connection.close();
        connectionsRef.current.delete(peerId);
      }

      // Remove connection state
      setConnectionStates((prev) => {
        const next = new Map(prev);
        next.delete(peerId);
        return next;
      });

      // Remove audio stream
      setAudioStreams((prev) => {
        const next = new Map(prev);
        next.delete(peerId);
        return next;
      });

      // Clear pending candidates
      pendingCandidatesRef.current.delete(peerId);

      // Clean up reconnection state and timers when peer leaves
      clearReconnectionTimer(peerId);
      clearConnectionTimeout(peerId);
      reconnectionStateRef.current.delete(peerId);

      // Clear pending connection status (FEAT-420)
      pendingConnectionsRef.current.delete(peerId);
    },
    [clearReconnectionTimer, clearConnectionTimeout],
  );

  /**
   * Handle peer updated
   */
  const handlePeerUpdated = useCallback(
    (peer: PeerSummary) => {
      // Skip local peer - they shouldn't be in the remote peers list
      if (peer.id === localPeerId) return;
      setPeerSummaries((prev) => new Map(prev).set(peer.id, peer));
    },
    [localPeerId],
  );

  /**
   * Set local audio stream
   */
  const setLocalStream = useCallback((stream: MediaStream | null) => {
    localStreamRef.current = stream;

    // Update all existing connections
    connectionsRef.current.forEach((peerConn) => {
      const pc = peerConn.connection;

      // Remove existing tracks
      pc.getSenders().forEach((sender) => {
        if (sender.track?.kind === "audio") {
          pc.removeTrack(sender);
        }
      });

      // Add new tracks
      if (stream) {
        stream.getTracks().forEach((track) => {
          pc.addTrack(track, stream);
        });
      }
    });
  }, []);

  /**
   * Get peer by ID
   */
  const getPeer = useCallback(
    (peerId: PeerId): ConnectedPeer | undefined => {
      const summary = peerSummaries.get(peerId);
      if (!summary) return undefined;

      const webrtcState = connectionStates.get(peerId) || "new";
      const audioStream = audioStreams.get(peerId) || null;

      return {
        ...summary,
        webrtcState,
        hasAudio: audioStream !== null,
        audioStream,
      };
    },
    [peerSummaries, connectionStates, audioStreams],
  );

  /**
   * Get all audio streams
   */
  const getAudioStreams = useCallback((): Map<PeerId, MediaStream> => {
    return new Map(audioStreams);
  }, [audioStreams]);

  /**
   * Force reconnect to a peer
   */
  const reconnectPeer = useCallback(
    (peerId: PeerId) => {
      // Close existing connection
      const existing = connectionsRef.current.get(peerId);
      if (existing) {
        existing.connection.close();
        connectionsRef.current.delete(peerId);
      }

      // Clear state
      setConnectionStates((prev) => {
        const next = new Map(prev);
        next.delete(peerId);
        return next;
      });
      setAudioStreams((prev) => {
        const next = new Map(prev);
        next.delete(peerId);
        return next;
      });
      pendingCandidatesRef.current.delete(peerId);

      // Re-initiate
      if (localPeerId && peerId > localPeerId) {
        initiateConnection(peerId);
      }
    },
    [localPeerId, initiateConnection],
  );

  // Assign reconnectPeerInternal to ref (breaks circular dependency)
  useEffect(() => {
    reconnectPeerInternalRef.current = reconnectPeerInternal;
  }, [reconnectPeerInternal]);

  // Setup signaling event handlers
  useEffect(() => {
    if (!client) return;

    // Register handlers
    client.on("onSignalOffer", handleOffer);
    client.on("onSignalAnswer", handleAnswer);
    client.on("onSignalIce", handleIceCandidate);
    client.on("onPeerJoined", handlePeerJoined);
    client.on("onPeerLeft", handlePeerLeft);
    client.on("onPeerUpdated", handlePeerUpdated);
    client.on("onPresenceUpdate", handlePeerUpdated);

    return () => {
      client.off("onSignalOffer", handleOffer);
      client.off("onSignalAnswer", handleAnswer);
      client.off("onSignalIce", handleIceCandidate);
      client.off("onPeerJoined", handlePeerJoined);
      client.off("onPeerLeft", handlePeerLeft);
      client.off("onPeerUpdated", handlePeerUpdated);
      client.off("onPresenceUpdate", handlePeerUpdated);
    };
  }, [
    client,
    handleOffer,
    handleAnswer,
    handleIceCandidate,
    handlePeerJoined,
    handlePeerLeft,
    handlePeerUpdated,
  ]);

  // Initialize connections to existing peers when we have all required data
  useEffect(() => {
    if (!client || !localPeerId || !roomId) return;

    // Connect to all existing peers that we haven't connected to yet
    // Higher ID initiates the connection to avoid duplicate connections
    peerSummaries.forEach((peer) => {
      if (peer.id !== localPeerId && peer.id > localPeerId) {
        if (!connectionsRef.current.has(peer.id)) {
          console.log(
            `[useRoomPeers] Initiating connection to ${peer.id} (I am ${localPeerId})`,
          );
          initiateConnection(peer.id);
        }
      }
    });
  }, [client, localPeerId, roomId, peerSummaries, initiateConnection]);

  // Cleanup on unmount or room change
  useEffect(() => {
    return () => {
      // Close all connections
      connectionsRef.current.forEach((peerConn) => {
        peerConn.connection.close();
      });
      connectionsRef.current.clear();
      pendingCandidatesRef.current.clear();

      // Clear all reconnection timers
      reconnectionTimersRef.current.forEach((timer) => clearTimeout(timer));
      reconnectionTimersRef.current.clear();

      // Clear all connection timeout timers
      connectionTimeoutRef.current.forEach((timer) => clearTimeout(timer));
      connectionTimeoutRef.current.clear();

      // Clear reconnection state
      reconnectionStateRef.current.clear();

      // Clear pending connections (FEAT-420)
      pendingConnectionsRef.current.clear();
    };
  }, [roomId]);

  // Update initial peers when they change
  useEffect(() => {
    if (initialPeers.length > 0) {
      setPeerSummaries((prev) => {
        const updated = new Map(prev);
        initialPeers.forEach((peer) => {
          if (!updated.has(peer.id)) {
            updated.set(peer.id, peer);
          }
        });
        return updated;
      });
    }
  }, [initialPeers]);

  // Compute derived state - filter out local peer to prevent duplicates
  const peers: ConnectedPeer[] = useMemo(() => {
    return Array.from(peerSummaries.values())
      .filter((summary) => summary.id !== localPeerId)
      .map((summary) => ({
        ...summary,
        webrtcState: connectionStates.get(summary.id) || "new",
        hasAudio: audioStreams.has(summary.id),
        audioStream: audioStreams.get(summary.id) || null,
      }));
  }, [peerSummaries, connectionStates, audioStreams, localPeerId]);

  const connectedCount = useMemo(() => {
    return peers.filter((p) => p.webrtcState === "connected").length;
  }, [peers]);

  return {
    peers,
    peerCount: peers.length,
    connectedCount,
    allConnected: peers.length > 0 && connectedCount === peers.length,
    localPeerId,
    setLocalStream,
    getPeer,
    getAudioStreams,
    reconnectPeer,
  };
}

/**
 * Export type for hook return value
 */
export type UseRoomPeersReturn = ReturnType<typeof useRoomPeers>;
