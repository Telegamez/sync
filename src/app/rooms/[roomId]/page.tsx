/**
 * Room Experience Page
 *
 * Main page for the room collaboration experience. Handles room connection,
 * participant display, and voice controls.
 *
 * Part of the Long-Horizon Engineering Protocol - FEAT-119
 * Updated in FEAT-411 to integrate real Socket.io signaling
 */

"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Users,
  AlertCircle,
  Loader2,
  LogOut,
  Copy,
  Check,
} from "lucide-react";
import { ParticipantList, RoomControls } from "@/components/room";
import type { ParticipantInfo } from "@/components/room";
import type { Room } from "@/types/room";
import { useRoomConnection } from "@/hooks/useRoomConnection";

/**
 * Room loading states
 */
type RoomState =
  | "loading"
  | "joining"
  | "connected"
  | "error"
  | "not_found"
  | "full"
  | "closed";

/**
 * Room error info
 */
interface RoomError {
  message: string;
  code?: string;
}

/**
 * Map signaling connection state to peer connection state
 * Note: Signaling uses 'error', but PeerConnectionState uses 'disconnected' instead
 */
function mapConnectionState(
  state: string,
): "new" | "connecting" | "connected" | "reconnecting" | "disconnected" {
  switch (state) {
    case "connected":
      return "connected";
    case "connecting":
      return "connecting";
    case "reconnecting":
      return "reconnecting";
    case "error":
    case "disconnected":
    default:
      return "disconnected";
  }
}

/**
 * Convert signaling peers to ParticipantInfo format
 */
function convertPeersToParticipants(
  peers: Array<{
    id: string;
    displayName: string;
    avatarUrl?: string;
    role: string;
    isMuted: boolean;
    isSpeaking: boolean;
    connectionState: string;
  }>,
  localPeerId: string | null,
): ParticipantInfo[] {
  return peers.map((peer) => ({
    id: peer.id,
    displayName: peer.displayName,
    avatarUrl: peer.avatarUrl,
    role: peer.role as "owner" | "moderator" | "participant",
    isMuted: peer.isMuted,
    isSpeaking: peer.isSpeaking,
    isLocal: peer.id === localPeerId,
    connectionState: mapConnectionState(peer.connectionState),
  }));
}

/**
 * Room Experience Page Component
 */
export default function RoomPage() {
  const params = useParams<{ roomId: string }>();
  const roomId = params.roomId;
  const router = useRouter();

  // Room state
  const [roomState, setRoomState] = useState<RoomState>("loading");
  const [error, setError] = useState<RoomError | null>(null);

  // Local user state (generate stable display name on client only)
  const [displayName] = useState(() => {
    if (typeof window !== "undefined") {
      // Check sessionStorage for existing name
      const stored = sessionStorage.getItem("swensync_displayName");
      if (stored) return stored;
      const newName = `User-${Math.random().toString(36).slice(2, 6)}`;
      sessionStorage.setItem("swensync_displayName", newName);
      return newName;
    }
    return "User";
  });
  const [isAddressingAI, setIsAddressingAI] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  const [copied, setCopied] = useState(false);

  // Socket.io room connection hook - provides real signaling
  const {
    connectionState,
    room,
    localPeer,
    peers,
    isInRoom,
    isLoading: isConnecting,
    error: connectionError,
    connect,
    joinRoom,
    leaveRoom,
    getClient,
  } = useRoomConnection({
    autoConnect: false,
    handlers: {
      onPeerJoined: (peer) => {
        console.log("[Room] Peer joined:", peer.displayName);
      },
      onPeerLeft: (peerId) => {
        console.log("[Room] Peer left:", peerId);
      },
      onRoomError: (err) => {
        console.error("[Room] Error:", err);
        setError({ message: err.message, code: err.code });
      },
    },
  });

  // Convert signaling peers to ParticipantInfo format
  const participants: ParticipantInfo[] = [
    // Add local peer first
    ...(localPeer
      ? [
          {
            id: localPeer.id,
            displayName: localPeer.displayName,
            avatarUrl: localPeer.avatarUrl,
            role: localPeer.role as "owner" | "moderator" | "participant",
            isMuted: localPeer.presence.audio.isMuted,
            isSpeaking: localPeer.presence.audio.isSpeaking,
            isLocal: true,
            connectionState: "connected" as const,
          },
        ]
      : []),
    // Add remote peers
    ...convertPeersToParticipants(peers, localPeer?.id || null),
  ];

  /**
   * Connect to signaling server and join room
   */
  useEffect(() => {
    let mounted = true;

    async function connectAndJoin() {
      try {
        setRoomState("loading");

        // Connect to Socket.io signaling server
        console.log("[Room] Connecting to signaling server...");
        await connect();

        if (!mounted) return;

        setRoomState("joining");

        // Join the room
        console.log("[Room] Joining room:", roomId);
        await joinRoom(roomId, displayName);

        if (!mounted) return;

        setRoomState("connected");
        console.log("[Room] Successfully joined room");
      } catch (err) {
        if (!mounted) return;

        console.error("[Room] Connection error:", err);
        const errorMessage =
          err instanceof Error ? err.message : "Failed to connect";

        // Handle specific error types
        if (errorMessage.includes("ROOM_FULL")) {
          setRoomState("full");
          setError({ message: "This room is full", code: "ROOM_FULL" });
        } else if (errorMessage.includes("ROOM_CLOSED")) {
          setRoomState("closed");
          setError({
            message: "This room has been closed",
            code: "ROOM_CLOSED",
          });
        } else if (
          errorMessage.includes("not found") ||
          errorMessage.includes("404")
        ) {
          setRoomState("not_found");
          setError({ message: "Room not found", code: "ROOM_NOT_FOUND" });
        } else {
          setRoomState("error");
          setError({ message: errorMessage });
        }
      }
    }

    connectAndJoin();

    return () => {
      mounted = false;
    };
  }, [roomId, displayName, connect, joinRoom]);

  // Track local mute state
  const [localIsMuted, setLocalIsMuted] = useState(false);

  /**
   * Handle mute toggle
   */
  const handleMuteToggle = useCallback(() => {
    const newMuted = !localIsMuted;
    setLocalIsMuted(newMuted);

    // Send presence update to signaling server
    const client = getClient();
    if (client) {
      client.updatePresence({ isMuted: newMuted });
    }
  }, [localIsMuted, getClient]);

  /**
   * Handle leave room
   */
  const handleLeaveRoom = useCallback(async () => {
    setIsLeaving(true);
    try {
      // Leave room via signaling
      await leaveRoom();
      router.push("/rooms");
    } catch {
      setIsLeaving(false);
    }
  }, [router, leaveRoom]);

  /**
   * Handle PTT start
   */
  const handlePTTStart = useCallback(() => {
    setIsAddressingAI(true);

    // Send presence update to signaling server
    const client = getClient();
    if (client) {
      client.updatePresence({ isAddressingAI: true });
    }
  }, [getClient]);

  /**
   * Handle PTT end
   */
  const handlePTTEnd = useCallback(() => {
    setIsAddressingAI(false);

    // Send presence update to signaling server
    const client = getClient();
    if (client) {
      client.updatePresence({ isAddressingAI: false });
    }
  }, [getClient]);

  /**
   * Copy room link to clipboard
   */
  const handleCopyLink = useCallback(async () => {
    try {
      const url = `${window.location.origin}/rooms/${roomId}`;
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      console.error("Failed to copy link");
    }
  }, [roomId]);

  /**
   * Render loading state
   */
  if (roomState === "loading" || roomState === "joining") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto mb-4" />
          <p className="text-lg font-medium text-foreground">
            {roomState === "loading" ? "Loading room..." : "Joining room..."}
          </p>
          <p className="text-sm text-muted-foreground mt-2">
            Setting up your connection
          </p>
        </div>
      </div>
    );
  }

  /**
   * Render error states
   */
  if (
    roomState === "not_found" ||
    roomState === "full" ||
    roomState === "closed" ||
    roomState === "error"
  ) {
    const errorConfig = {
      not_found: {
        title: "Room Not Found",
        message:
          "The room you are looking for does not exist or has been deleted.",
        icon: AlertCircle,
      },
      full: {
        title: "Room is Full",
        message: "This room has reached its maximum number of participants.",
        icon: Users,
      },
      closed: {
        title: "Room Closed",
        message: "This room has been closed by the host.",
        icon: AlertCircle,
      },
      error: {
        title: "Connection Error",
        message: error?.message || "Unable to connect to the room.",
        icon: AlertCircle,
      },
    };

    const config = errorConfig[roomState];
    const Icon = config.icon;

    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="max-w-md w-full text-center">
          <div className="bg-card border border-border rounded-lg p-8 shadow-sm">
            <Icon className="w-16 h-16 text-red-400 mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-foreground mb-2">
              {config.title}
            </h1>
            <p className="text-muted-foreground mb-6">{config.message}</p>
            <Link
              href="/rooms"
              className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:opacity-90 transition-opacity"
            >
              <ArrowLeft className="w-5 h-5" />
              Back to Rooms
            </Link>
          </div>
        </div>
      </div>
    );
  }

  /**
   * Render connected room experience
   */
  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Back / Leave */}
            <button
              onClick={handleLeaveRoom}
              disabled={isLeaving}
              className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
              aria-label="Leave room"
            >
              {isLeaving ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <LogOut className="w-5 h-5" />
              )}
              <span className="hidden sm:inline">Leave</span>
            </button>

            {/* Room info */}
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-primary" />
              <div className="text-center">
                <h1 className="text-lg font-semibold text-foreground truncate max-w-[200px] sm:max-w-[300px]">
                  {room?.name || "Room"}
                </h1>
                <p className="text-xs text-muted-foreground">
                  {participants.length}/{room?.maxParticipants || 4}{" "}
                  participants
                </p>
              </div>
            </div>

            {/* Share button */}
            <button
              onClick={handleCopyLink}
              className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:text-foreground border border-border rounded-lg hover:bg-muted transition-colors"
              aria-label={copied ? "Link copied" : "Copy room link"}
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4 text-green-500" />
                  <span className="hidden sm:inline">Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  <span className="hidden sm:inline">Share</span>
                </>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 flex flex-col">
        {/* Room description */}
        {room?.description && (
          <div className="px-4 sm:px-6 lg:px-8 py-3 bg-muted/50 border-b border-border">
            <p className="text-sm text-muted-foreground max-w-7xl mx-auto">
              {room.description}
            </p>
          </div>
        )}

        {/* Participants area */}
        <div className="flex-1 flex flex-col items-center justify-center p-4 sm:p-8">
          <div className="w-full max-w-4xl">
            {/* Participant list */}
            <ParticipantList
              participants={participants}
              localPeerId={localPeer?.id || ""}
              activeSpeakerId={null}
              layout="grid"
              showConnectionStatus
              showRoleBadge
              className="justify-center"
            />

            {/* Room status */}
            <div className="mt-8 text-center">
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-green-500/10 border border-green-500/30 rounded-full text-green-400 text-sm">
                <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                Connected
              </div>
            </div>
          </div>
        </div>

        {/* AI status placeholder */}
        <div className="px-4 sm:px-6 lg:px-8 py-4 border-t border-border bg-card/50">
          <div className="max-w-7xl mx-auto text-center">
            <p className="text-sm text-muted-foreground">
              {isAddressingAI ? (
                <span className="text-purple-400">Addressing AI...</span>
              ) : (
                "Hold the Talk button to address the AI assistant"
              )}
            </p>
          </div>
        </div>
      </main>

      {/* Controls footer */}
      <footer className="sticky bottom-0 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-t border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-center">
            <RoomControls
              isMuted={localIsMuted}
              onMuteToggle={handleMuteToggle}
              onLeaveRoom={handleLeaveRoom}
              isLeaving={isLeaving}
              showPTT
              onPTTStart={handlePTTStart}
              onPTTEnd={handlePTTEnd}
              isAddressingAI={isAddressingAI}
              size="lg"
            />
          </div>
        </div>
      </footer>
    </div>
  );
}
