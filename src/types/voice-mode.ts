/**
 * Voice Mode Type Definitions
 *
 * Types for voice mode configuration and turn management.
 * Part of the Long-Horizon Engineering Protocol - FEAT-100 & FEAT-150
 */

import type { PeerId } from './peer';
import type { RoomId } from './room';

/**
 * Voice activation modes for addressing the AI
 */
export type VoiceMode =
  | 'open' // All audio sent to AI (small trusted groups)
  | 'pushToTalk' // Hold button/key to address AI
  | 'wakeWord' // Say wake word to activate
  | 'designatedSpeaker'; // Only specific roles can address AI

/**
 * AI response state machine
 */
export type AIResponseState =
  | 'idle' // Waiting for input
  | 'listening' // Receiving audio input
  | 'processing' // Processing input (after VAD end)
  | 'speaking' // AI is responding (LOCKED state)
  | 'locked'; // Explicit lock (queue processing)

/**
 * Voice mode settings for a room
 */
export interface RoomVoiceSettings {
  /** How participants activate AI addressing */
  mode: VoiceMode;

  /** Whether to lock AI during response (prevent interruptions) */
  lockDuringResponse: boolean;

  /** Whether to queue requests during AI response */
  enableQueue: boolean;

  /** Maximum queue size (0 = unlimited) */
  maxQueueSize: number;

  /** Queue request timeout in milliseconds */
  queueTimeoutMs: number;

  /** Whether participants can hear each other */
  enablePeerAudio: boolean;

  /** Whether to allow interrupt button (owner/moderator only) */
  allowInterrupt: boolean;

  /** Designated speaker peer IDs (for designatedSpeaker mode) */
  designatedSpeakers?: PeerId[];

  /** Wake word phrase (for wakeWord mode) */
  wakeWord?: string;
}

/**
 * Default voice settings
 */
export const DEFAULT_VOICE_SETTINGS: RoomVoiceSettings = {
  mode: 'pushToTalk',
  lockDuringResponse: true,
  enableQueue: true,
  maxQueueSize: 10,
  queueTimeoutMs: 30000, // 30 seconds
  enablePeerAudio: true,
  allowInterrupt: true,
};

/**
 * Turn request in the queue
 */
export interface TurnRequest {
  /** Unique request ID */
  id: string;
  /** Peer requesting the turn */
  peerId: PeerId;
  /** Peer display name (for UI) */
  peerDisplayName: string;
  /** Room ID */
  roomId: RoomId;
  /** When the request was created */
  createdAt: Date;
  /** When the request expires */
  expiresAt: Date;
  /** Position in queue (1-based) */
  position: number;
  /** Request priority (higher = processed first) */
  priority: number;
}

/**
 * Turn queue state
 */
export interface TurnQueueState {
  /** Current queue */
  queue: TurnRequest[];
  /** Currently active turn (peer addressing AI) */
  activeTurn?: TurnRequest;
  /** Total requests processed */
  totalProcessed: number;
  /** Total requests expired/cancelled */
  totalExpired: number;
}

/**
 * AI state for a room
 */
export interface RoomAIState {
  /** Current AI response state */
  state: AIResponseState;
  /** Peer currently addressing AI */
  activeSpeakerId?: PeerId;
  /** When the current state started */
  stateStartedAt: Date;
  /** Turn queue */
  queue: TurnQueueState;
  /** Whether the AI session is healthy */
  isSessionHealthy: boolean;
  /** Last error if any */
  lastError?: string;
}

/**
 * AI state event types
 */
export type AIStateEventType =
  | 'ai:state_changed'
  | 'ai:queue_updated'
  | 'ai:turn_started'
  | 'ai:turn_ended'
  | 'ai:interrupt'
  | 'ai:error'
  | 'ai:session_reconnected';

/**
 * AI state event payload
 */
export interface AIStateEvent {
  type: AIStateEventType;
  roomId: RoomId;
  state: RoomAIState;
  /** Previous state (for state_changed events) */
  previousState?: AIResponseState;
  /** Event-specific data */
  data?: {
    interruptedBy?: PeerId;
    reason?: string;
    turnRequest?: TurnRequest;
  };
  timestamp: Date;
}

/**
 * PTT (Push-to-Talk) state
 */
export interface PTTState {
  /** Whether PTT is currently active */
  isActive: boolean;
  /** When PTT was activated */
  activatedAt?: Date;
  /** Whether PTT can be activated (based on AI state) */
  canActivate: boolean;
  /** Reason if cannot activate */
  blockReason?: 'ai_speaking' | 'queue_full' | 'not_designated';
}

/**
 * Client-side turn manager state
 */
export interface TurnManagerState {
  /** Current AI state */
  aiState: AIResponseState;
  /** Whether local peer can request a turn */
  canRequestTurn: boolean;
  /** Local peer's position in queue (0 = not in queue) */
  queuePosition: number;
  /** Whether local peer's turn is active */
  isMyTurn: boolean;
  /** Current queue length */
  queueLength: number;
  /** PTT state */
  ptt: PTTState;
}
