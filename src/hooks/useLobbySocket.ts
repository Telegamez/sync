/**
 * useLobbySocket Hook
 *
 * React hook for real-time room updates in the lobby.
 * Connects to the /lobby namespace to receive room:updated events.
 *
 * Part of the Long-Horizon Engineering Protocol
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import type { RoomSummary } from "@/types/room";

/**
 * Lobby socket connection state
 */
export type LobbyConnectionState =
  | "disconnected"
  | "connecting"
  | "connected"
  | "error";

/**
 * Hook options
 */
export interface UseLobbySocketOptions {
  /** Auto-connect on mount (default: true) */
  autoConnect?: boolean;
  /** Server URL (default: window.location.origin) */
  url?: string;
  /** Callback when a room is updated */
  onRoomUpdated?: (room: RoomSummary) => void;
  /** Callback when initial room list is received on connect */
  onRoomsLoaded?: (rooms: RoomSummary[]) => void;
}

/**
 * Hook return value
 */
export interface UseLobbySocketReturn {
  /** Current connection state */
  connectionState: LobbyConnectionState;
  /** Connect to lobby */
  connect: () => void;
  /** Disconnect from lobby */
  disconnect: () => void;
  /** Whether connected */
  isConnected: boolean;
}

/**
 * useLobbySocket - Hook for real-time lobby room updates
 *
 * Connects to the /lobby Socket.io namespace to receive real-time
 * updates when rooms change (participants join/leave, status changes).
 *
 * @example
 * ```tsx
 * const { isConnected } = useLobbySocket({
 *   onRoomUpdated: (room) => {
 *     // Update room in local state
 *     setRooms(prev => prev.map(r => r.id === room.id ? room : r));
 *   }
 * });
 * ```
 */
export function useLobbySocket(
  options: UseLobbySocketOptions = {},
): UseLobbySocketReturn {
  const { autoConnect = true, url, onRoomUpdated, onRoomsLoaded } = options;

  const [connectionState, setConnectionState] =
    useState<LobbyConnectionState>("disconnected");
  const socketRef = useRef<Socket | null>(null);
  const onRoomUpdatedRef = useRef(onRoomUpdated);
  const onRoomsLoadedRef = useRef(onRoomsLoaded);

  // Keep callback refs updated
  useEffect(() => {
    onRoomUpdatedRef.current = onRoomUpdated;
  }, [onRoomUpdated]);

  useEffect(() => {
    onRoomsLoadedRef.current = onRoomsLoaded;
  }, [onRoomsLoaded]);

  /**
   * Connect to the lobby namespace
   */
  const connect = useCallback(() => {
    if (socketRef.current?.connected) {
      return;
    }

    setConnectionState("connecting");

    const serverUrl =
      url || (typeof window !== "undefined" ? window.location.origin : "");
    const socket = io(`${serverUrl}/lobby`, {
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    socket.on("connect", () => {
      console.log("[LobbySocket] Connected");
      setConnectionState("connected");

      // Request initial room list from server
      socket.emit(
        "lobby:get-rooms",
        (response: { rooms: RoomSummary[]; total: number }) => {
          console.log(
            `[LobbySocket] Received ${response.rooms.length} rooms from server`,
          );
          onRoomsLoadedRef.current?.(response.rooms);
        },
      );
    });

    socket.on("disconnect", (reason) => {
      console.log(`[LobbySocket] Disconnected: ${reason}`);
      setConnectionState("disconnected");
    });

    socket.on("connect_error", (error) => {
      console.error("[LobbySocket] Connection error:", error);
      setConnectionState("error");
    });

    socket.on("room:updated", (room: RoomSummary) => {
      console.log(`[LobbySocket] Room updated: ${room.id}`, room);
      onRoomUpdatedRef.current?.(room);
    });

    socketRef.current = socket;
  }, [url]);

  /**
   * Disconnect from lobby
   */
  const disconnect = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
      setConnectionState("disconnected");
    }
  }, []);

  // Auto-connect on mount
  useEffect(() => {
    if (autoConnect) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [autoConnect, connect, disconnect]);

  return {
    connectionState,
    connect,
    disconnect,
    isConnected: connectionState === "connected",
  };
}

export default useLobbySocket;
