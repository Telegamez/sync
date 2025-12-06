/**
 * useRoomPeers Hook
 *
 * React hook for managing peer state and WebRTC peer connections.
 * Tracks all peers in a room and maintains mesh topology connections.
 *
 * Part of the Long-Horizon Engineering Protocol - FEAT-109
 */

'use client';

import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import type { SignalingClient } from '@/lib/signaling/client';
import type { PeerId, PeerSummary, PeerConnectionState } from '@/types/peer';
import type { RoomId } from '@/types/room';

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
  onPeerConnectionStateChange?: (peerId: PeerId, state: PeerConnectionState) => void;
}

/**
 * Default RTC configuration
 */
const DEFAULT_RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
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
export function useRoomPeers(options: UseRoomPeersOptions): RoomPeersState & RoomPeersActions {
  const {
    client,
    roomId,
    localPeerId,
    initialPeers = [],
    rtcConfig = DEFAULT_RTC_CONFIG,
    onPeerAudioStream,
    onPeerConnectionStateChange,
  } = options;

  // Refs for connections and streams
  const connectionsRef = useRef<Map<PeerId, PeerConnection>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const pendingCandidatesRef = useRef<Map<PeerId, RTCIceCandidateInit[]>>(new Map());

  // Peer summaries state
  const [peerSummaries, setPeerSummaries] = useState<Map<PeerId, PeerSummary>>(
    new Map(initialPeers.map((p) => [p.id, p]))
  );

  // Connection states
  const [connectionStates, setConnectionStates] = useState<Map<PeerId, PeerConnectionState>>(
    new Map()
  );

  // Audio streams
  const [audioStreams, setAudioStreams] = useState<Map<PeerId, MediaStream>>(new Map());

  /**
   * Create RTCPeerConnection for a peer
   */
  const createPeerConnection = useCallback(
    (peerId: PeerId, isInitiator: boolean): RTCPeerConnection => {
      const pc = new RTCPeerConnection(rtcConfig);

      // Track connection state
      pc.onconnectionstatechange = () => {
        const state = pc.connectionState as PeerConnectionState;
        setConnectionStates((prev) => new Map(prev).set(peerId, state));
        onPeerConnectionStateChange?.(peerId, state);

        // Clean up on failed/closed (remove from tracking only, connection already closed)
        if (state === 'failed' || state === 'closed') {
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

      // Store connection
      connectionsRef.current.set(peerId, {
        peerId,
        connection: pc,
        connectionState: 'new',
        remoteStream: null,
        isInitiator,
      });

      return pc;
    },
    [client, rtcConfig, onPeerAudioStream, onPeerConnectionStateChange]
  );

  /**
   * Initiate connection to peer (create offer)
   */
  const initiateConnection = useCallback(
    async (peerId: PeerId) => {
      if (!client) return;

      const pc = createPeerConnection(peerId, true);

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
      } catch (error) {
        console.error(`[useRoomPeers] Failed to create offer for ${peerId}:`, error);
      }
    },
    [client, createPeerConnection]
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
        console.error(`[useRoomPeers] Failed to handle offer from ${fromPeerId}:`, error);
      }
    },
    [client, createPeerConnection]
  );

  /**
   * Handle incoming answer
   */
  const handleAnswer = useCallback(async (fromPeerId: PeerId, sdp: RTCSessionDescriptionInit) => {
    const peerConn = connectionsRef.current.get(fromPeerId);
    if (!peerConn) {
      console.warn(`[useRoomPeers] No connection for answer from ${fromPeerId}`);
      return;
    }

    try {
      await peerConn.connection.setRemoteDescription(new RTCSessionDescription(sdp));

      // Apply pending ICE candidates
      const pending = pendingCandidatesRef.current.get(fromPeerId) || [];
      for (const candidate of pending) {
        await peerConn.connection.addIceCandidate(new RTCIceCandidate(candidate));
      }
      pendingCandidatesRef.current.delete(fromPeerId);
    } catch (error) {
      console.error(`[useRoomPeers] Failed to handle answer from ${fromPeerId}:`, error);
    }
  }, []);

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
        await peerConn.connection.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (error) {
        console.error(`[useRoomPeers] Failed to add ICE candidate from ${fromPeerId}:`, error);
      }
    },
    []
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
    [localPeerId, initiateConnection]
  );

  /**
   * Handle peer left
   */
  const handlePeerLeft = useCallback((peerId: PeerId) => {
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
  }, []);

  /**
   * Handle peer updated
   */
  const handlePeerUpdated = useCallback((peer: PeerSummary) => {
    setPeerSummaries((prev) => new Map(prev).set(peer.id, peer));
  }, []);

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
        if (sender.track?.kind === 'audio') {
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

      const webrtcState = connectionStates.get(peerId) || 'new';
      const audioStream = audioStreams.get(peerId) || null;

      return {
        ...summary,
        webrtcState,
        hasAudio: audioStream !== null,
        audioStream,
      };
    },
    [peerSummaries, connectionStates, audioStreams]
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
    [localPeerId, initiateConnection]
  );

  // Setup signaling event handlers
  useEffect(() => {
    if (!client) return;

    // Register handlers
    client.on('onSignalOffer', handleOffer);
    client.on('onSignalAnswer', handleAnswer);
    client.on('onSignalIce', handleIceCandidate);
    client.on('onPeerJoined', handlePeerJoined);
    client.on('onPeerLeft', handlePeerLeft);
    client.on('onPeerUpdated', handlePeerUpdated);
    client.on('onPresenceUpdate', handlePeerUpdated);

    return () => {
      client.off('onSignalOffer', handleOffer);
      client.off('onSignalAnswer', handleAnswer);
      client.off('onSignalIce', handleIceCandidate);
      client.off('onPeerJoined', handlePeerJoined);
      client.off('onPeerLeft', handlePeerLeft);
      client.off('onPeerUpdated', handlePeerUpdated);
      client.off('onPresenceUpdate', handlePeerUpdated);
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

  // Initialize connections to existing peers (only runs once on setup)
  const hasInitializedRef = useRef(false);
  useEffect(() => {
    if (!client || !localPeerId || !roomId) return;
    if (hasInitializedRef.current) return;
    hasInitializedRef.current = true;

    // Connect to all existing peers (higher ID initiates)
    peerSummaries.forEach((peer) => {
      if (peer.id !== localPeerId && peer.id > localPeerId) {
        if (!connectionsRef.current.has(peer.id)) {
          initiateConnection(peer.id);
        }
      }
    });
  }, [client, localPeerId, roomId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cleanup on unmount or room change
  useEffect(() => {
    return () => {
      // Close all connections
      connectionsRef.current.forEach((peerConn) => {
        peerConn.connection.close();
      });
      connectionsRef.current.clear();
      pendingCandidatesRef.current.clear();
    };
  }, [roomId]);

  // Update initial peers when they change (only on mount)
  const initialPeersRef = useRef(initialPeers);
  useEffect(() => {
    // Only run on mount with initial peers
    if (initialPeersRef.current.length > 0) {
      setPeerSummaries(new Map(initialPeersRef.current.map((p) => [p.id, p])));
    }
  }, []); // Empty deps - run only on mount

  // Compute derived state
  const peers: ConnectedPeer[] = useMemo(() => {
    return Array.from(peerSummaries.values()).map((summary) => ({
      ...summary,
      webrtcState: connectionStates.get(summary.id) || 'new',
      hasAudio: audioStreams.has(summary.id),
      audioStream: audioStreams.get(summary.id) || null,
    }));
  }, [peerSummaries, connectionStates, audioStreams]);

  const connectedCount = useMemo(() => {
    return peers.filter((p) => p.webrtcState === 'connected').length;
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
