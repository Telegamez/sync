/**
 * useRoomConnection Hook
 *
 * React hook for managing Socket.io signaling connection lifecycle.
 * Handles connection, reconnection, room joining/leaving, and cleanup.
 *
 * Part of the Long-Horizon Engineering Protocol - FEAT-108
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  SignalingClient,
  createSignalingClient,
  SignalingClientOptions,
} from "@/lib/signaling/client";
import type {
  SocketConnectionState,
  RoomJoinedPayload,
  RoomErrorPayload,
  SignalingEventHandlers,
} from "@/types/signaling";
import type { Peer, PeerId, PeerSummary } from "@/types/peer";
import type { Room, RoomId } from "@/types/room";
import type { RoomAIState } from "@/types/voice-mode";

/**
 * Connection error with additional context
 */
export interface ConnectionError {
  code: string;
  message: string;
  timestamp: Date;
  roomId?: RoomId;
}

/**
 * Room connection state
 */
export interface RoomConnectionState {
  /** Socket connection state */
  connectionState: SocketConnectionState;
  /** Current room (if joined) */
  room: Room | null;
  /** Local peer info (if joined) */
  localPeer: Peer | null;
  /** Peers in room */
  peers: PeerSummary[];
  /** AI state */
  aiState: RoomAIState | null;
  /** Whether currently in a room */
  isInRoom: boolean;
  /** Whether connecting/joining */
  isLoading: boolean;
  /** Last error */
  error: ConnectionError | null;
  /** Reconnection attempt count */
  reconnectAttempts: number;
}

/**
 * Room connection actions
 */
export interface RoomConnectionActions {
  /** Connect to signaling server */
  connect: () => Promise<void>;
  /** Disconnect from signaling server */
  disconnect: () => void;
  /** Join a room */
  joinRoom: (
    roomId: RoomId,
    displayName: string,
    avatarUrl?: string,
  ) => Promise<RoomJoinedPayload>;
  /** Leave current room */
  leaveRoom: () => Promise<void>;
  /** Clear error state */
  clearError: () => void;
  /** Get signaling client for direct access */
  getClient: () => SignalingClient | null;
}

/**
 * Hook options
 */
export interface UseRoomConnectionOptions extends SignalingClientOptions {
  /** Auto-connect on mount */
  autoConnect?: boolean;
  /** Heartbeat interval in ms */
  heartbeatInterval?: number;
  /** Event handlers */
  handlers?: Partial<SignalingEventHandlers>;
}

/**
 * Default options
 */
const DEFAULT_OPTIONS: UseRoomConnectionOptions = {
  autoConnect: false,
  heartbeatInterval: 30000, // 30 seconds
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
};

/**
 * Initial state
 */
const INITIAL_STATE: RoomConnectionState = {
  connectionState: "disconnected",
  room: null,
  localPeer: null,
  peers: [],
  aiState: null,
  isInRoom: false,
  isLoading: false,
  error: null,
  reconnectAttempts: 0,
};

/**
 * useRoomConnection Hook
 *
 * Manages Socket.io signaling connection and room state.
 *
 * @example
 * ```tsx
 * const { connectionState, room, joinRoom, leaveRoom } = useRoomConnection({
 *   autoConnect: true,
 *   handlers: {
 *     onPeerJoined: (peer) => console.log('Peer joined:', peer),
 *   },
 * });
 *
 * // Join a room
 * await joinRoom('room-123', 'John Doe');
 * ```
 */
export function useRoomConnection(
  options: UseRoomConnectionOptions = {},
): RoomConnectionState & RoomConnectionActions {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Client ref
  const clientRef = useRef<SignalingClient | null>(null);
  const heartbeatRef = useRef<NodeJS.Timeout | null>(null);
  const currentRoomIdRef = useRef<RoomId | null>(null);

  // Track room state for auto-rejoin after reconnect
  const savedRoomStateRef = useRef<{
    roomId: RoomId;
    displayName: string;
    avatarUrl?: string;
  } | null>(null);
  // Flag to prevent multiple rejoin attempts
  const isRejoiningRef = useRef<boolean>(false);

  // State
  const [state, setState] = useState<RoomConnectionState>(INITIAL_STATE);

  /**
   * Create error object
   */
  const createError = useCallback(
    (code: string, message: string, roomId?: RoomId): ConnectionError => ({
      code,
      message,
      timestamp: new Date(),
      roomId,
    }),
    [],
  );

  /**
   * Start heartbeat
   */
  const startHeartbeat = useCallback(() => {
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current);
    }

    heartbeatRef.current = setInterval(() => {
      if (clientRef.current?.getConnectionState() === "connected") {
        clientRef.current.sendHeartbeat();
      }
    }, opts.heartbeatInterval);
  }, [opts.heartbeatInterval]);

  /**
   * Stop heartbeat
   */
  const stopHeartbeat = useCallback(() => {
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }
  }, []);

  /**
   * Setup client event handlers
   */
  const setupEventHandlers = useCallback(
    (client: SignalingClient) => {
      // Connection events
      client.on("onConnect", () => {
        setState((prev) => ({
          ...prev,
          connectionState: "connected",
          error: null,
          reconnectAttempts: 0,
        }));
        opts.handlers?.onConnect?.();
      });

      client.on("onDisconnect", (reason) => {
        setState((prev) => ({
          ...prev,
          connectionState:
            reason === "io server disconnect" ? "disconnected" : "reconnecting",
        }));
        opts.handlers?.onDisconnect?.(reason);
      });

      client.on("onError", (error) => {
        setState((prev) => ({
          ...prev,
          connectionState: "error",
          error: createError("CONNECTION_ERROR", error.message),
        }));
        opts.handlers?.onError?.(error);
      });

      client.on("onReconnect", async (attempt) => {
        setState((prev) => ({
          ...prev,
          connectionState: "connected",
          reconnectAttempts: 0,
          error: null,
        }));
        opts.handlers?.onReconnect?.(attempt);

        // Auto-rejoin room after reconnect if we were in a room
        if (savedRoomStateRef.current && !isRejoiningRef.current) {
          const { roomId, displayName, avatarUrl } = savedRoomStateRef.current;
          isRejoiningRef.current = true;

          console.log(
            `[useRoomConnection] Auto-rejoining room ${roomId} after reconnect`,
          );

          try {
            // Clear current room state first (server has different peer ID now)
            currentRoomIdRef.current = null;
            setState((prev) => ({
              ...prev,
              isInRoom: false,
              localPeer: null,
              peers: [],
            }));

            // Rejoin the room
            await client.joinRoom({
              roomId,
              displayName,
              avatarUrl,
            });

            console.log(
              `[useRoomConnection] Successfully rejoined room ${roomId}`,
            );
          } catch (error) {
            console.error(
              `[useRoomConnection] Failed to rejoin room ${roomId}:`,
              error,
            );

            // Clear saved state on non-recoverable errors
            const errorMessage =
              error instanceof Error ? error.message : "Rejoin failed";
            const isNonRecoverable =
              errorMessage.includes("ROOM_NOT_FOUND") ||
              errorMessage.includes("ROOM_CLOSED") ||
              errorMessage.includes("banned") ||
              errorMessage.includes("kicked");

            if (isNonRecoverable) {
              savedRoomStateRef.current = null;
            }

            setState((prev) => ({
              ...prev,
              error: {
                code: "REJOIN_FAILED",
                message: `Failed to rejoin room: ${errorMessage}`,
                timestamp: new Date(),
                roomId,
              },
            }));
          } finally {
            isRejoiningRef.current = false;
          }
        }
      });

      // Room events
      client.on("onRoomJoined", (payload) => {
        setState((prev) => ({
          ...prev,
          room: payload.room,
          localPeer: payload.localPeer,
          peers: payload.peers,
          aiState: payload.aiState,
          isInRoom: true,
          isLoading: false,
        }));
        currentRoomIdRef.current = payload.room.id;
        startHeartbeat();
        opts.handlers?.onRoomJoined?.(payload);
      });

      client.on("onRoomLeft", (payload) => {
        setState((prev) => ({
          ...prev,
          room: null,
          localPeer: null,
          peers: [],
          aiState: null,
          isInRoom: false,
        }));
        currentRoomIdRef.current = null;
        // Only clear saved state if this was intentional leave (not disconnect)
        // savedRoomStateRef is cleared in leaveRoom() for intentional leaves
        stopHeartbeat();
        opts.handlers?.onRoomLeft?.(payload);
      });

      client.on("onRoomClosed", (roomId) => {
        if (currentRoomIdRef.current === roomId) {
          setState((prev) => ({
            ...prev,
            room: null,
            localPeer: null,
            peers: [],
            aiState: null,
            isInRoom: false,
            error: createError("ROOM_CLOSED", "Room was closed", roomId),
          }));
          currentRoomIdRef.current = null;
          // Clear saved state - can't rejoin a closed room
          savedRoomStateRef.current = null;
          stopHeartbeat();
        }
        opts.handlers?.onRoomClosed?.(roomId);
      });

      client.on("onRoomError", (payload) => {
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: createError(payload.code, payload.message, payload.roomId),
        }));
        opts.handlers?.onRoomError?.(payload);
      });

      // Peer events
      client.on("onPeerJoined", (peer) => {
        setState((prev) => ({
          ...prev,
          peers: [...prev.peers, peer],
          room: prev.room
            ? { ...prev.room, participantCount: prev.room.participantCount + 1 }
            : null,
        }));
        opts.handlers?.onPeerJoined?.(peer);
      });

      client.on("onPeerLeft", (peerId) => {
        setState((prev) => ({
          ...prev,
          peers: prev.peers.filter((p) => p.id !== peerId),
          room: prev.room
            ? {
                ...prev.room,
                participantCount: Math.max(0, prev.room.participantCount - 1),
              }
            : null,
        }));
        opts.handlers?.onPeerLeft?.(peerId);
      });

      client.on("onPeerUpdated", (peer) => {
        setState((prev) => {
          // Check if this is the local peer being updated (e.g., name change)
          const isLocalPeer = prev.localPeer?.id === peer.id;

          return {
            ...prev,
            // Update localPeer if it's us
            localPeer:
              isLocalPeer && prev.localPeer
                ? {
                    ...prev.localPeer,
                    displayName: peer.displayName,
                    avatarUrl: peer.avatarUrl,
                  }
                : prev.localPeer,
            // Update in peers array (for remote peers)
            peers: prev.peers.map((p) => (p.id === peer.id ? peer : p)),
          };
        });
        opts.handlers?.onPeerUpdated?.(peer);
      });

      // Presence events
      client.on("onPresenceUpdate", (peer) => {
        setState((prev) => ({
          ...prev,
          peers: prev.peers.map((p) => (p.id === peer.id ? peer : p)),
        }));
        opts.handlers?.onPresenceUpdate?.(peer);
      });

      // AI state events
      client.on("onAIState", (aiState) => {
        setState((prev) => ({
          ...prev,
          aiState,
        }));
        opts.handlers?.onAIState?.(aiState);
      });

      // Pass through signaling events
      if (opts.handlers?.onSignalOffer) {
        client.on("onSignalOffer", opts.handlers.onSignalOffer);
      }
      if (opts.handlers?.onSignalAnswer) {
        client.on("onSignalAnswer", opts.handlers.onSignalAnswer);
      }
      if (opts.handlers?.onSignalIce) {
        client.on("onSignalIce", opts.handlers.onSignalIce);
      }
    },
    [opts.handlers, createError, startHeartbeat, stopHeartbeat],
  );

  /**
   * Connect to signaling server
   */
  const connect = useCallback(async (): Promise<void> => {
    if (clientRef.current?.getConnectionState() === "connected") {
      return;
    }

    setState((prev) => ({
      ...prev,
      connectionState: "connecting",
      isLoading: true,
      error: null,
    }));

    try {
      // Create client if needed
      if (!clientRef.current) {
        clientRef.current = createSignalingClient({
          url: opts.url,
          reconnection: opts.reconnection,
          reconnectionAttempts: opts.reconnectionAttempts,
          reconnectionDelay: opts.reconnectionDelay,
        });
        setupEventHandlers(clientRef.current);
      }

      await clientRef.current.connect();

      setState((prev) => ({
        ...prev,
        connectionState: "connected",
        isLoading: false,
      }));
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Connection failed";
      setState((prev) => ({
        ...prev,
        connectionState: "error",
        isLoading: false,
        error: createError("CONNECTION_FAILED", errorMessage),
      }));
      throw error;
    }
  }, [opts, setupEventHandlers, createError]);

  /**
   * Disconnect from signaling server
   */
  const disconnect = useCallback((): void => {
    stopHeartbeat();

    if (clientRef.current) {
      clientRef.current.disconnect();
      clientRef.current = null;
    }

    currentRoomIdRef.current = null;
    // Clear saved room state on intentional disconnect
    savedRoomStateRef.current = null;

    setState(INITIAL_STATE);
  }, [stopHeartbeat]);

  /**
   * Join a room
   */
  const joinRoom = useCallback(
    async (
      roomId: RoomId,
      displayName: string,
      avatarUrl?: string,
    ): Promise<RoomJoinedPayload> => {
      if (!clientRef.current) {
        throw new Error("Not connected to signaling server");
      }

      if (currentRoomIdRef.current) {
        throw new Error("Already in a room. Leave current room first.");
      }

      setState((prev) => ({
        ...prev,
        isLoading: true,
        error: null,
      }));

      try {
        const response = await clientRef.current.joinRoom({
          roomId,
          displayName,
          avatarUrl,
        });

        // Save room state for auto-rejoin after reconnect
        savedRoomStateRef.current = {
          roomId,
          displayName,
          avatarUrl,
        };

        // State updated via event handler
        return response;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Join failed";
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: createError("JOIN_FAILED", errorMessage, roomId),
        }));
        throw error;
      }
    },
    [createError],
  );

  /**
   * Leave current room
   */
  const leaveRoom = useCallback(async (): Promise<void> => {
    if (!clientRef.current || !currentRoomIdRef.current) {
      return;
    }

    const roomId = currentRoomIdRef.current;

    // Clear saved room state to prevent auto-rejoin
    savedRoomStateRef.current = null;

    try {
      await clientRef.current.leaveRoom({ roomId });
      // State updated via event handler
    } catch (error) {
      // Still update state even if leave fails
      setState((prev) => ({
        ...prev,
        room: null,
        localPeer: null,
        peers: [],
        aiState: null,
        isInRoom: false,
      }));
      currentRoomIdRef.current = null;
      stopHeartbeat();
    }
  }, [stopHeartbeat]);

  /**
   * Clear error state
   */
  const clearError = useCallback((): void => {
    setState((prev) => ({
      ...prev,
      error: null,
    }));
  }, []);

  /**
   * Get signaling client
   */
  const getClient = useCallback((): SignalingClient | null => {
    return clientRef.current;
  }, []);

  // Auto-connect on mount
  useEffect(() => {
    if (opts.autoConnect) {
      connect().catch(() => {
        // Error handled in state
      });
    }

    return () => {
      disconnect();
    };
  }, [opts.autoConnect]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    ...state,
    connect,
    disconnect,
    joinRoom,
    leaveRoom,
    clearError,
    getClient,
  };
}

/**
 * Export type for hook return value
 */
export type UseRoomConnectionReturn = ReturnType<typeof useRoomConnection>;
