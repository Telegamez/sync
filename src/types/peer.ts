/**
 * Peer Type Definitions
 *
 * Types for room participants and their connection state.
 * Part of the Long-Horizon Engineering Protocol - FEAT-100
 */

import type { RoomId } from './room';

/**
 * Unique identifier for a peer
 */
export type PeerId = string;

/**
 * Peer connection state
 */
export type PeerConnectionState =
  | 'connecting' // Initial connection in progress
  | 'connected' // Fully connected and ready
  | 'reconnecting' // Temporarily disconnected, attempting reconnect
  | 'disconnected' // Cleanly disconnected
  | 'failed'; // Connection failed

/**
 * Peer role within a room
 */
export type PeerRole =
  | 'owner' // Room creator, full permissions
  | 'moderator' // Can manage participants, AI settings
  | 'participant'; // Standard participant

/**
 * Peer audio state
 */
export interface PeerAudioState {
  /** Whether peer's microphone is muted */
  isMuted: boolean;
  /** Whether peer is currently speaking (detected by VAD) */
  isSpeaking: boolean;
  /** Whether peer is currently addressing the AI (PTT active) */
  isAddressingAI: boolean;
  /** Audio volume level (0-1) for visualization */
  audioLevel: number;
}

/**
 * Peer presence information
 */
export interface PeerPresence {
  /** Connection state */
  connectionState: PeerConnectionState;
  /** Audio state */
  audio: PeerAudioState;
  /** Last activity timestamp */
  lastActiveAt: Date;
  /** Whether peer is idle (no recent activity) */
  isIdle: boolean;
}

/**
 * Full peer information
 */
export interface Peer {
  /** Unique peer identifier */
  id: PeerId;
  /** Display name */
  displayName: string;
  /** Optional avatar URL */
  avatarUrl?: string;
  /** Role in the room */
  role: PeerRole;
  /** Current room ID */
  roomId: RoomId;
  /** Presence and connection state */
  presence: PeerPresence;
  /** When the peer joined the room */
  joinedAt: Date;
}

/**
 * Peer summary for list views
 */
export interface PeerSummary {
  id: PeerId;
  displayName: string;
  avatarUrl?: string;
  role: PeerRole;
  isMuted: boolean;
  isSpeaking: boolean;
  connectionState: PeerConnectionState;
}

/**
 * Local peer state (current user)
 */
export interface LocalPeer extends Peer {
  /** Local audio stream */
  audioStream?: MediaStream;
  /** Whether local audio is enabled */
  isAudioEnabled: boolean;
}

/**
 * Remote peer state (other participants)
 */
export interface RemotePeer extends Peer {
  /** WebRTC peer connection */
  peerConnection?: RTCPeerConnection;
  /** Remote audio stream */
  remoteStream?: MediaStream;
  /** Audio element for playback */
  audioElement?: HTMLAudioElement;
}

/**
 * Peer event types for real-time updates
 */
export type PeerEventType =
  | 'peer:joined'
  | 'peer:left'
  | 'peer:updated'
  | 'peer:muted'
  | 'peer:unmuted'
  | 'peer:speaking'
  | 'peer:stopped_speaking'
  | 'peer:addressing_ai'
  | 'peer:stopped_addressing_ai'
  | 'peer:role_changed'
  | 'peer:kicked'
  | 'peer:connection_state_changed';

/**
 * Peer event payload
 */
export interface PeerEvent {
  type: PeerEventType;
  peerId: PeerId;
  roomId: RoomId;
  peer?: Peer | PeerSummary;
  /** Additional event-specific data */
  data?: {
    previousRole?: PeerRole;
    newRole?: PeerRole;
    reason?: string;
    connectionState?: PeerConnectionState;
  };
  timestamp: Date;
}

/**
 * Peer audio level update (high frequency)
 */
export interface PeerAudioLevelUpdate {
  peerId: PeerId;
  audioLevel: number;
  isSpeaking: boolean;
  timestamp: number;
}

/**
 * Create peer request (internal)
 */
export interface CreatePeerRequest {
  displayName: string;
  avatarUrl?: string;
  roomId: RoomId;
  role?: PeerRole;
}
