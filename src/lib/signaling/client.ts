/**
 * Socket.io Signaling Client
 *
 * Client-side signaling for WebRTC peer connections and room coordination.
 *
 * Part of the Long-Horizon Engineering Protocol - FEAT-104
 */

import { io, Socket } from "socket.io-client";
import type {
  JoinRoomPayload,
  LeaveRoomPayload,
  SignalOfferPayload,
  SignalAnswerPayload,
  SignalIcePayload,
  PresenceUpdatePayload,
  RoomJoinedPayload,
  RoomLeftPayload,
  RoomErrorPayload,
  SocketConnectionState,
  SignalingEventHandlers,
} from "@/types/signaling";
import type { PeerId, PeerSummary } from "@/types/peer";
import type { RoomId, Room } from "@/types/room";
import type { RoomAIState } from "@/types/voice-mode";

/**
 * Signaling client options
 */
export interface SignalingClientOptions {
  url?: string;
  autoConnect?: boolean;
  reconnection?: boolean;
  reconnectionAttempts?: number;
  reconnectionDelay?: number;
}

/**
 * Default options
 */
const DEFAULT_OPTIONS: Required<SignalingClientOptions> = {
  url: typeof window !== "undefined" ? window.location.origin : "",
  autoConnect: false,
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
};

/**
 * SignalingClient class
 */
export class SignalingClient {
  private socket: Socket | null = null;
  private options: Required<SignalingClientOptions>;
  private handlers: Partial<SignalingEventHandlers> = {};
  private connectionState: SocketConnectionState = "disconnected";

  constructor(options?: SignalingClientOptions) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Get current connection state
   */
  public getConnectionState(): SocketConnectionState {
    return this.connectionState;
  }

  /**
   * Connect to signaling server
   */
  public connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.socket?.connected) {
        resolve();
        return;
      }

      this.connectionState = "connecting";

      this.socket = io(this.options.url, {
        autoConnect: true,
        reconnection: this.options.reconnection,
        reconnectionAttempts: this.options.reconnectionAttempts,
        reconnectionDelay: this.options.reconnectionDelay,
      });

      this.setupSocketHandlers();

      const timeout = setTimeout(() => {
        reject(new Error("Connection timeout"));
      }, 10000);

      this.socket.once("connect", () => {
        clearTimeout(timeout);
        this.connectionState = "connected";
        this.handlers.onConnect?.();
        resolve();
      });

      this.socket.once("connect_error", (error) => {
        clearTimeout(timeout);
        this.connectionState = "error";
        this.handlers.onError?.(error);
        reject(error);
      });
    });
  }

  /**
   * Disconnect from signaling server
   */
  public disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.connectionState = "disconnected";
    }
  }

  /**
   * Setup socket event handlers
   */
  private setupSocketHandlers(): void {
    if (!this.socket) return;

    this.socket.on("connect", () => {
      this.connectionState = "connected";
      this.handlers.onConnect?.();
    });

    this.socket.on("disconnect", (reason) => {
      if (reason === "io server disconnect") {
        this.connectionState = "disconnected";
      } else {
        this.connectionState = "reconnecting";
      }
      this.handlers.onDisconnect?.(reason);
    });

    this.socket.io.on("reconnect", (attempt) => {
      this.connectionState = "connected";
      this.handlers.onReconnect?.(attempt);
    });

    this.socket.io.on("reconnect_error", () => {
      this.connectionState = "reconnecting";
    });

    this.socket.io.on("reconnect_failed", () => {
      this.connectionState = "error";
      this.handlers.onError?.(new Error("Reconnection failed"));
    });

    // Room events
    this.socket.on("room:left", (payload: RoomLeftPayload) => {
      this.handlers.onRoomLeft?.(payload);
    });

    this.socket.on("room:closed", (roomId: RoomId) => {
      this.handlers.onRoomClosed?.(roomId);
    });

    this.socket.on("room:error", (payload: RoomErrorPayload) => {
      this.handlers.onRoomError?.(payload);
    });

    // Peer events
    this.socket.on("peer:joined", (peer: PeerSummary) => {
      this.handlers.onPeerJoined?.(peer);
    });

    this.socket.on("peer:left", (peerId: PeerId) => {
      this.handlers.onPeerLeft?.(peerId);
    });

    this.socket.on("peer:updated", (peer: PeerSummary) => {
      this.handlers.onPeerUpdated?.(peer);
    });

    // Signaling events
    this.socket.on(
      "signal:offer",
      (fromPeerId: PeerId, sdp: RTCSessionDescriptionInit) => {
        this.handlers.onSignalOffer?.(fromPeerId, sdp);
      },
    );

    this.socket.on(
      "signal:answer",
      (fromPeerId: PeerId, sdp: RTCSessionDescriptionInit) => {
        this.handlers.onSignalAnswer?.(fromPeerId, sdp);
      },
    );

    this.socket.on(
      "signal:ice",
      (fromPeerId: PeerId, candidate: RTCIceCandidateInit) => {
        this.handlers.onSignalIce?.(fromPeerId, candidate);
      },
    );

    // Presence events
    this.socket.on("presence:update", (peer: PeerSummary) => {
      this.handlers.onPresenceUpdate?.(peer);
    });
  }

  /**
   * Join a room
   */
  public joinRoom(payload: JoinRoomPayload): Promise<RoomJoinedPayload> {
    return new Promise((resolve, reject) => {
      if (!this.socket?.connected) {
        reject(new Error("Not connected to signaling server"));
        return;
      }

      this.socket.emit(
        "room:join",
        payload,
        (response: RoomJoinedPayload | RoomErrorPayload) => {
          if ("code" in response) {
            reject(new Error(response.message));
          } else {
            this.handlers.onRoomJoined?.(response);
            resolve(response);
          }
        },
      );
    });
  }

  /**
   * Leave a room
   */
  public leaveRoom(payload: LeaveRoomPayload): Promise<void> {
    return new Promise((resolve) => {
      if (!this.socket?.connected) {
        resolve();
        return;
      }

      this.socket.emit("room:leave", payload);
      resolve();
    });
  }

  /**
   * Update peer info
   */
  public updatePeer(payload: {
    displayName?: string;
    avatarUrl?: string;
  }): void {
    if (!this.socket?.connected) return;
    if (payload.displayName) {
      this.updateDisplayName(payload.displayName);
    }
  }

  /**
   * Update display name (vanity username)
   * Broadcasts the new name to all peers in the room
   */
  public updateDisplayName(newDisplayName: string): void {
    if (!this.socket?.connected) return;
    this.socket.emit("peer:update_name", { displayName: newDisplayName });
  }

  /**
   * Mute local audio
   */
  public mute(): void {
    this.updatePresence({ isMuted: true });
  }

  /**
   * Unmute local audio
   */
  public unmute(): void {
    this.updatePresence({ isMuted: false });
  }

  /**
   * Send WebRTC offer
   */
  public sendOffer(payload: SignalOfferPayload): void {
    if (!this.socket?.connected) return;
    this.socket.emit("signal:offer", payload);
  }

  /**
   * Send WebRTC answer
   */
  public sendAnswer(payload: SignalAnswerPayload): void {
    if (!this.socket?.connected) return;
    this.socket.emit("signal:answer", payload);
  }

  /**
   * Send ICE candidate
   */
  public sendIce(payload: SignalIcePayload): void {
    if (!this.socket?.connected) return;
    this.socket.emit("signal:ice", payload);
  }

  /**
   * Update presence state
   */
  public updatePresence(payload: PresenceUpdatePayload): void {
    if (!this.socket?.connected) return;
    this.socket.emit("presence:update", payload);
  }

  /**
   * Send heartbeat
   */
  public sendHeartbeat(): void {
    if (!this.socket?.connected) return;
    this.socket.emit("presence:heartbeat");
  }

  /**
   * Request a turn to address the AI
   */
  public requestTurn(
    roomId: string,
    peerId: string,
    peerDisplayName: string,
    priority: number = 0,
  ): Promise<import("@/types/voice-mode").TurnRequest | null> {
    return new Promise((resolve) => {
      if (!this.socket?.connected) {
        resolve(null);
        return;
      }

      this.socket.emit(
        "ai:request_turn",
        { roomId, peerId, peerDisplayName, priority },
        (response: import("@/types/voice-mode").TurnRequest | null) => {
          resolve(response);
        },
      );
    });
  }

  /**
   * Cancel a turn request
   */
  public cancelTurn(roomId: string, requestId: string): void {
    if (!this.socket?.connected) return;
    this.socket.emit("ai:cancel_turn", { roomId, requestId });
  }

  /**
   * Interrupt the current AI response (owner/moderator only)
   */
  public interruptAI(roomId: string, peerId: string, reason?: string): boolean {
    if (!this.socket?.connected) return false;
    this.socket.emit("ai:interrupt", { roomId, interruptedBy: peerId, reason });
    return true;
  }

  /**
   * Voice-activated interrupt (any participant can trigger)
   * Stops AI audio immediately for all participants when "excuse me" is detected
   */
  public voiceInterrupt(roomId: string, reason?: string): boolean {
    if (!this.socket?.connected) return false;
    this.socket.emit("ai:voice_interrupt", { roomId, reason });
    return true;
  }

  /**
   * Start PTT (Push-to-Talk)
   */
  public startPTT(roomId: string): void {
    if (!this.socket?.connected) return;
    this.socket.emit("ai:ptt_start", { roomId });
  }

  /**
   * End PTT (Push-to-Talk)
   */
  public endPTT(roomId: string): void {
    if (!this.socket?.connected) return;
    this.socket.emit("ai:ptt_end", { roomId });
  }

  /**
   * Register event handler
   */
  public on<K extends keyof SignalingEventHandlers>(
    event: K,
    handler: SignalingEventHandlers[K],
  ): void {
    this.handlers[event] = handler;
  }

  /**
   * Remove event handler
   */
  public off<K extends keyof SignalingEventHandlers>(
    event: K,
    handler?: SignalingEventHandlers[K],
  ): void {
    if (!handler || this.handlers[event] === handler) {
      delete this.handlers[event];
    }
  }

  /**
   * Get raw socket (for testing)
   */
  public getSocket(): Socket | null {
    return this.socket;
  }
}

/**
 * Create signaling client instance
 */
export function createSignalingClient(
  options?: SignalingClientOptions,
): SignalingClient {
  return new SignalingClient(options);
}
