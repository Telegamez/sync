/**
 * useTurnManager Hook
 *
 * React hook for client-side turn-taking coordination.
 * Tracks AI state, manages turn requests, and provides queue position feedback.
 *
 * Part of the Long-Horizon Engineering Protocol - FEAT-153
 */

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SignalingClient } from '@/lib/signaling/client';
import type { PeerId } from '@/types/peer';
import type { RoomId } from '@/types/room';
import type {
  AIResponseState,
  RoomAIState,
  TurnRequest,
  TurnManagerState,
  VoiceMode,
  AIStateEvent,
} from '@/types/voice-mode';

/**
 * Turn manager options
 */
export interface UseTurnManagerOptions {
  /** Signaling client for server communication */
  signalingClient?: SignalingClient | null;
  /** Current room ID */
  roomId?: RoomId;
  /** Local peer ID */
  localPeerId?: PeerId;
  /** Local peer display name (for turn requests) */
  localDisplayName?: string;
  /** Current voice mode */
  voiceMode?: VoiceMode;
  /** Whether local user is a designated speaker */
  isDesignatedSpeaker?: boolean;
  /** Whether local user is room owner/moderator (can interrupt) */
  canInterrupt?: boolean;
  /** Priority for turn requests (higher = earlier in queue) */
  turnPriority?: number;
}

/**
 * Turn manager callbacks
 */
export interface UseTurnManagerCallbacks {
  /** Called when AI state changes */
  onAIStateChange?: (state: AIResponseState, previousState?: AIResponseState) => void;
  /** Called when turn is granted */
  onTurnGranted?: () => void;
  /** Called when turn ends */
  onTurnEnded?: () => void;
  /** Called when turn request is rejected */
  onTurnRejected?: (reason: string) => void;
  /** Called when queue position changes */
  onQueuePositionChange?: (position: number) => void;
  /** Called when AI error occurs */
  onAIError?: (error: string) => void;
}

/**
 * Turn manager return type
 */
export interface UseTurnManagerReturn {
  /** Current turn manager state */
  state: TurnManagerState;
  /** Current AI response state */
  aiState: AIResponseState;
  /** Whether local user can request a turn */
  canRequestTurn: boolean;
  /** Whether local user's turn is currently active */
  isMyTurn: boolean;
  /** Current queue position (0 = not in queue, active turn = 0) */
  queuePosition: number;
  /** Current queue length */
  queueLength: number;
  /** Current speaker's peer ID */
  currentSpeakerId: PeerId | null;
  /** Whether AI session is healthy */
  isSessionHealthy: boolean;
  /** Last AI error message */
  lastError: string | null;
  /** Request a turn to address the AI */
  requestTurn: () => Promise<TurnRequest | null>;
  /** Cancel pending turn request */
  cancelTurn: () => void;
  /** Interrupt current AI response (owner/moderator only) */
  interruptAI: (reason?: string) => boolean;
  /** Full AI state from server */
  fullAIState: RoomAIState | null;
}

/**
 * Default state
 */
const DEFAULT_STATE: TurnManagerState = {
  aiState: 'idle',
  canRequestTurn: true,
  queuePosition: 0,
  isMyTurn: false,
  queueLength: 0,
  ptt: {
    isActive: false,
    canActivate: true,
  },
};

/**
 * useTurnManager Hook
 *
 * Provides client-side turn management for AI interactions.
 *
 * @example
 * ```tsx
 * const {
 *   aiState,
 *   canRequestTurn,
 *   isMyTurn,
 *   queuePosition,
 *   requestTurn,
 *   cancelTurn,
 * } = useTurnManager({
 *   signalingClient,
 *   roomId: 'room-123',
 *   localPeerId: 'peer-1',
 *   localDisplayName: 'Alice',
 * }, {
 *   onTurnGranted: () => startRecording(),
 *   onTurnEnded: () => stopRecording(),
 * });
 *
 * return (
 *   <button
 *     onClick={requestTurn}
 *     disabled={!canRequestTurn}
 *   >
 *     {isMyTurn ? 'Your Turn' : `Request Turn (Queue: ${queuePosition})`}
 *   </button>
 * );
 * ```
 */
export function useTurnManager(
  options: UseTurnManagerOptions = {},
  callbacks: UseTurnManagerCallbacks = {}
): UseTurnManagerReturn {
  const {
    signalingClient,
    roomId,
    localPeerId,
    localDisplayName = 'Anonymous',
    voiceMode = 'pushToTalk',
    isDesignatedSpeaker = true,
    canInterrupt = false,
    turnPriority = 0,
  } = options;

  const {
    onAIStateChange,
    onTurnGranted,
    onTurnEnded,
    onTurnRejected,
    onQueuePositionChange,
    onAIError,
  } = callbacks;

  // State
  const [fullAIState, setFullAIState] = useState<RoomAIState | null>(null);
  const [pendingRequest, setPendingRequest] = useState<TurnRequest | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);

  // Refs for callbacks
  const onAIStateChangeRef = useRef(onAIStateChange);
  const onTurnGrantedRef = useRef(onTurnGranted);
  const onTurnEndedRef = useRef(onTurnEnded);
  const onTurnRejectedRef = useRef(onTurnRejected);
  const onQueuePositionChangeRef = useRef(onQueuePositionChange);
  const onAIErrorRef = useRef(onAIError);
  const previousQueuePositionRef = useRef(0);
  const hadTurnRef = useRef(false);

  // Keep refs updated
  useEffect(() => {
    onAIStateChangeRef.current = onAIStateChange;
    onTurnGrantedRef.current = onTurnGranted;
    onTurnEndedRef.current = onTurnEnded;
    onTurnRejectedRef.current = onTurnRejected;
    onQueuePositionChangeRef.current = onQueuePositionChange;
    onAIErrorRef.current = onAIError;
  }, [onAIStateChange, onTurnGranted, onTurnEnded, onTurnRejected, onQueuePositionChange, onAIError]);

  // Derived state
  const aiState = fullAIState?.state ?? 'idle';
  const isSessionHealthy = fullAIState?.isSessionHealthy ?? true;
  const currentSpeakerId = fullAIState?.activeSpeakerId ?? null;
  const queueLength = fullAIState?.queue.queue.length ?? 0;

  // Check if local user has active turn
  const isMyTurn = useMemo(() => {
    if (!localPeerId || !fullAIState) return false;
    return fullAIState.queue.activeTurn?.peerId === localPeerId;
  }, [localPeerId, fullAIState]);

  // Calculate queue position
  const queuePosition = useMemo(() => {
    if (!localPeerId || !fullAIState) return 0;

    // Active turn = 0 (not in queue, currently speaking)
    if (fullAIState.queue.activeTurn?.peerId === localPeerId) {
      return 0;
    }

    // Find in queue
    const index = fullAIState.queue.queue.findIndex((r) => r.peerId === localPeerId);
    return index >= 0 ? index + 1 : 0;
  }, [localPeerId, fullAIState]);

  // Check if can request turn
  const canRequestTurn = useMemo(() => {
    // Need client and room
    if (!signalingClient || !roomId || !localPeerId) {
      return false;
    }

    // Check designated speaker mode
    if (voiceMode === 'designatedSpeaker' && !isDesignatedSpeaker) {
      return false;
    }

    // Can't request if already in queue
    if (queuePosition > 0) {
      return false;
    }

    // Can't request if already have active turn
    if (isMyTurn) {
      return false;
    }

    // In open mode, no explicit turn needed
    if (voiceMode === 'open') {
      return true;
    }

    // Check AI state
    if (aiState === 'speaking' || aiState === 'locked') {
      // Can still request to queue, but turn won't start immediately
      return true;
    }

    return true;
  }, [signalingClient, roomId, localPeerId, voiceMode, isDesignatedSpeaker, queuePosition, isMyTurn, aiState]);

  // Build PTT state
  const pttState = useMemo(() => ({
    isActive: isMyTurn && (aiState === 'listening' || aiState === 'idle'),
    activatedAt: isMyTurn ? new Date() : undefined,
    canActivate: canRequestTurn || isMyTurn,
    blockReason: !canRequestTurn && !isMyTurn
      ? (voiceMode === 'designatedSpeaker' && !isDesignatedSpeaker
          ? 'not_designated' as const
          : aiState === 'speaking' || aiState === 'locked'
            ? 'ai_speaking' as const
            : undefined)
      : undefined,
  }), [isMyTurn, aiState, canRequestTurn, voiceMode, isDesignatedSpeaker]);

  // Build full state object
  const state: TurnManagerState = useMemo(() => ({
    aiState,
    canRequestTurn,
    queuePosition,
    isMyTurn,
    queueLength,
    ptt: pttState,
  }), [aiState, canRequestTurn, queuePosition, isMyTurn, queueLength, pttState]);

  // Notify on queue position change
  useEffect(() => {
    if (queuePosition !== previousQueuePositionRef.current) {
      onQueuePositionChangeRef.current?.(queuePosition);
      previousQueuePositionRef.current = queuePosition;
    }
  }, [queuePosition]);

  // Notify on turn granted/ended
  useEffect(() => {
    if (isMyTurn && !hadTurnRef.current) {
      hadTurnRef.current = true;
      onTurnGrantedRef.current?.();
    } else if (!isMyTurn && hadTurnRef.current) {
      hadTurnRef.current = false;
      onTurnEndedRef.current?.();
    }
  }, [isMyTurn]);

  // Handle AI state events from server
  const handleAIStateEvent = useCallback((event: AIStateEvent) => {
    setFullAIState(event.state);

    // Notify state change
    if (event.type === 'ai:state_changed' && event.previousState) {
      onAIStateChangeRef.current?.(event.state.state, event.previousState);
    }

    // Handle errors
    if (event.type === 'ai:error') {
      const error = event.state.lastError ?? 'Unknown error';
      setLastError(error);
      onAIErrorRef.current?.(error);
    }

    // Clear error on reconnect
    if (event.type === 'ai:session_reconnected') {
      setLastError(null);
    }
  }, []);

  // Subscribe to signaling events
  useEffect(() => {
    if (!signalingClient || !roomId) return;

    const handleAIState = (event: AIStateEvent) => {
      if (event.roomId === roomId) {
        handleAIStateEvent(event);
      }
    };

    // Subscribe to AI state events (extended event not in base SignalingEventHandlers)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = signalingClient as any;
    client.on('ai:state', handleAIState);

    return () => {
      client.off('ai:state', handleAIState);
    };
  }, [signalingClient, roomId, handleAIStateEvent]);

  // Request a turn
  const requestTurn = useCallback(async (): Promise<TurnRequest | null> => {
    if (!signalingClient || !roomId || !localPeerId) {
      return null;
    }

    if (!canRequestTurn && !isMyTurn) {
      const reason = voiceMode === 'designatedSpeaker' && !isDesignatedSpeaker
        ? 'Not a designated speaker'
        : queuePosition > 0
          ? 'Already in queue'
          : 'Cannot request turn';
      onTurnRejectedRef.current?.(reason);
      return null;
    }

    try {
      // Send turn request to server via the signaling client
      const request = await (signalingClient as unknown as {
        requestTurn: (roomId: string, peerId: string, displayName: string, priority: number) => Promise<TurnRequest | null>
      }).requestTurn(
        roomId,
        localPeerId,
        localDisplayName,
        turnPriority
      );

      if (request) {
        setPendingRequest(request);
        return request;
      } else {
        onTurnRejectedRef.current?.('Turn request rejected by server');
        return null;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to request turn';
      onTurnRejectedRef.current?.(message);
      return null;
    }
  }, [
    signalingClient,
    roomId,
    localPeerId,
    localDisplayName,
    canRequestTurn,
    isMyTurn,
    voiceMode,
    isDesignatedSpeaker,
    queuePosition,
    turnPriority,
  ]);

  // Cancel pending turn
  const cancelTurn = useCallback(() => {
    if (!signalingClient || !roomId || !pendingRequest) return;

    (signalingClient as unknown as {
      cancelTurn: (roomId: string, requestId: string) => void
    }).cancelTurn(roomId, pendingRequest.id);
    setPendingRequest(null);
  }, [signalingClient, roomId, pendingRequest]);

  // Interrupt AI response
  const interruptAI = useCallback((reason?: string): boolean => {
    if (!signalingClient || !roomId || !localPeerId || !canInterrupt) {
      return false;
    }

    if (aiState !== 'speaking' && aiState !== 'locked') {
      return false;
    }

    return (signalingClient as unknown as {
      interruptAI: (roomId: string, peerId: string, reason?: string) => boolean
    }).interruptAI(roomId, localPeerId, reason);
  }, [signalingClient, roomId, localPeerId, canInterrupt, aiState]);

  return {
    state,
    aiState,
    canRequestTurn,
    isMyTurn,
    queuePosition,
    queueLength,
    currentSpeakerId,
    isSessionHealthy,
    lastError,
    requestTurn,
    cancelTurn,
    interruptAI,
    fullAIState,
  };
}

/**
 * Factory function for creating turn manager hook
 */
export function createTurnManager(
  options?: UseTurnManagerOptions,
  callbacks?: UseTurnManagerCallbacks
) {
  return () => useTurnManager(options, callbacks);
}

export default useTurnManager;
