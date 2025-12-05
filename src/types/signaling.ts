/**
 * Signaling Type Definitions
 *
 * Types for WebSocket signaling events and WebRTC coordination.
 * Part of the Long-Horizon Engineering Protocol - FEAT-100
 */

import type { Peer, PeerId, PeerEvent, PeerSummary, PeerAudioLevelUpdate } from './peer';
import type { Room, RoomId, RoomEvent, RoomSummary } from './room';
import type { AIStateEvent, RoomAIState, TurnRequest } from './voice-mode';

/**
 * Socket connection state
 */
export type SocketConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'error';

/**
 * Client-to-server event types
 */
export type ClientEventType =
  // Room events
  | 'room:create'
  | 'room:join'
  | 'room:leave'
  | 'room:update'
  // Peer events
  | 'peer:update'
  | 'peer:mute'
  | 'peer:unmute'
  // Signaling events
  | 'signal:offer'
  | 'signal:answer'
  | 'signal:ice'
  // Presence events
  | 'presence:update'
  | 'presence:heartbeat'
  // AI/Turn events
  | 'ai:request_turn'
  | 'ai:cancel_turn'
  | 'ai:interrupt'
  | 'ai:ptt_start'
  | 'ai:ptt_end';

/**
 * Server-to-client event types
 */
export type ServerEventType =
  // Room events
  | 'room:created'
  | 'room:joined'
  | 'room:left'
  | 'room:updated'
  | 'room:closed'
  | 'room:error'
  // Peer events
  | 'peer:joined'
  | 'peer:left'
  | 'peer:updated'
  | 'peer:kicked'
  // Signaling events
  | 'signal:offer'
  | 'signal:answer'
  | 'signal:ice'
  // Presence events
  | 'presence:update'
  | 'presence:sync'
  // AI/Turn events
  | 'ai:state'
  | 'ai:turn_granted'
  | 'ai:turn_denied'
  | 'ai:queue_update'
  // Audio level events (high frequency)
  | 'audio:levels';

// ============================================
// Client-to-Server Event Payloads
// ============================================

/**
 * Room join request
 */
export interface JoinRoomPayload {
  roomId: RoomId;
  displayName: string;
  avatarUrl?: string;
}

/**
 * Room leave request
 */
export interface LeaveRoomPayload {
  roomId: RoomId;
}

/**
 * Peer update request
 */
export interface UpdatePeerPayload {
  displayName?: string;
  avatarUrl?: string;
}

/**
 * WebRTC signaling offer
 */
export interface SignalOfferPayload {
  /** Target peer ID */
  targetPeerId: PeerId;
  /** SDP offer */
  sdp: RTCSessionDescriptionInit;
}

/**
 * WebRTC signaling answer
 */
export interface SignalAnswerPayload {
  /** Target peer ID */
  targetPeerId: PeerId;
  /** SDP answer */
  sdp: RTCSessionDescriptionInit;
}

/**
 * WebRTC ICE candidate
 */
export interface SignalIcePayload {
  /** Target peer ID */
  targetPeerId: PeerId;
  /** ICE candidate */
  candidate: RTCIceCandidateInit;
}

/**
 * Presence update
 */
export interface PresenceUpdatePayload {
  isMuted?: boolean;
  isSpeaking?: boolean;
  isAddressingAI?: boolean;
  audioLevel?: number;
}

/**
 * Turn request payload
 */
export interface RequestTurnPayload {
  roomId: RoomId;
  /** Optional priority (for moderators) */
  priority?: number;
}

/**
 * PTT start/end payload
 */
export interface PTTPayload {
  roomId: RoomId;
}

// ============================================
// Server-to-Client Event Payloads
// ============================================

/**
 * Room joined response
 */
export interface RoomJoinedPayload {
  room: Room;
  localPeer: Peer;
  peers: PeerSummary[];
  aiState: RoomAIState;
}

/**
 * Room left response
 */
export interface RoomLeftPayload {
  roomId: RoomId;
  reason?: 'left' | 'kicked' | 'room_closed';
}

/**
 * Room error response
 */
export interface RoomErrorPayload {
  roomId?: RoomId;
  code: string;
  message: string;
}

/**
 * Presence sync (full state)
 */
export interface PresenceSyncPayload {
  roomId: RoomId;
  peers: PeerSummary[];
}

/**
 * Audio levels update (high frequency)
 */
export interface AudioLevelsPayload {
  roomId: RoomId;
  levels: PeerAudioLevelUpdate[];
}

/**
 * Turn granted response
 */
export interface TurnGrantedPayload {
  roomId: RoomId;
  request: TurnRequest;
}

/**
 * Turn denied response
 */
export interface TurnDeniedPayload {
  roomId: RoomId;
  reason: 'queue_full' | 'not_allowed' | 'timeout' | 'cancelled';
}

/**
 * Queue update payload
 */
export interface QueueUpdatePayload {
  roomId: RoomId;
  queue: TurnRequest[];
  yourPosition: number;
}

// ============================================
// Signaling Client Interface
// ============================================

/**
 * Signaling client event handlers
 */
export interface SignalingEventHandlers {
  // Connection
  onConnect?: () => void;
  onDisconnect?: (reason: string) => void;
  onError?: (error: Error) => void;
  onReconnect?: (attempt: number) => void;

  // Room
  onRoomJoined?: (payload: RoomJoinedPayload) => void;
  onRoomLeft?: (payload: RoomLeftPayload) => void;
  onRoomUpdated?: (room: Room) => void;
  onRoomClosed?: (roomId: RoomId) => void;
  onRoomError?: (payload: RoomErrorPayload) => void;

  // Peer
  onPeerJoined?: (peer: PeerSummary) => void;
  onPeerLeft?: (peerId: PeerId) => void;
  onPeerUpdated?: (peer: PeerSummary) => void;
  onPeerKicked?: (peerId: PeerId, reason?: string) => void;

  // Signaling
  onSignalOffer?: (fromPeerId: PeerId, sdp: RTCSessionDescriptionInit) => void;
  onSignalAnswer?: (fromPeerId: PeerId, sdp: RTCSessionDescriptionInit) => void;
  onSignalIce?: (fromPeerId: PeerId, candidate: RTCIceCandidateInit) => void;

  // Presence
  onPresenceUpdate?: (peer: PeerSummary) => void;
  onPresenceSync?: (payload: PresenceSyncPayload) => void;

  // Audio
  onAudioLevels?: (payload: AudioLevelsPayload) => void;

  // AI/Turn
  onAIState?: (state: RoomAIState) => void;
  onTurnGranted?: (payload: TurnGrantedPayload) => void;
  onTurnDenied?: (payload: TurnDeniedPayload) => void;
  onQueueUpdate?: (payload: QueueUpdatePayload) => void;
}

/**
 * Signaling client interface
 */
export interface SignalingClient {
  // Connection
  connect(): Promise<void>;
  disconnect(): void;
  getConnectionState(): SocketConnectionState;

  // Room
  joinRoom(payload: JoinRoomPayload): Promise<RoomJoinedPayload>;
  leaveRoom(payload: LeaveRoomPayload): Promise<void>;

  // Peer
  updatePeer(payload: UpdatePeerPayload): void;
  mute(): void;
  unmute(): void;

  // Signaling
  sendOffer(payload: SignalOfferPayload): void;
  sendAnswer(payload: SignalAnswerPayload): void;
  sendIce(payload: SignalIcePayload): void;

  // Presence
  updatePresence(payload: PresenceUpdatePayload): void;
  sendHeartbeat(): void;

  // AI/Turn
  requestTurn(payload: RequestTurnPayload): Promise<TurnGrantedPayload>;
  cancelTurn(roomId: RoomId): void;
  interrupt(roomId: RoomId): void;
  startPTT(payload: PTTPayload): void;
  endPTT(payload: PTTPayload): void;

  // Event handlers
  on<K extends keyof SignalingEventHandlers>(
    event: K,
    handler: SignalingEventHandlers[K]
  ): void;
  off<K extends keyof SignalingEventHandlers>(
    event: K,
    handler?: SignalingEventHandlers[K]
  ): void;
}
