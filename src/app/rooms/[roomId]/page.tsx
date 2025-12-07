/**
 * Room Experience Page
 *
 * Main page for the room collaboration experience. Handles room connection,
 * participant display, and voice controls.
 *
 * Part of the Long-Horizon Engineering Protocol - FEAT-119
 * Updated in FEAT-411 to integrate real Socket.io signaling
 * Updated in FEAT-412 to integrate WebRTC voice communication
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  Mic,
  MicOff,
} from "lucide-react";
import { ParticipantList, RoomControls } from "@/components/room";
import type { ParticipantInfo } from "@/components/room";
import type { Room } from "@/types/room";
import { useRoomConnection } from "@/hooks/useRoomConnection";
import { useRoomPeers } from "@/hooks/useRoomPeers";
import { useRoomAudio } from "@/hooks/useRoomAudio";
import { usePresence } from "@/hooks/usePresence";
import { useSharedAI } from "@/hooks/useSharedAI";
import type { AIResponseState } from "@/types/voice-mode";

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
  const [micError, setMicError] = useState<string | null>(null);

  // Track local mute state - start muted by default
  const [localIsMuted, setLocalIsMuted] = useState(true);

  // Local media stream ref
  const localStreamRef = useRef<MediaStream | null>(null);

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

  // WebRTC peer connections hook - manages mesh topology
  const {
    peers: webrtcPeers,
    setLocalStream,
    getAudioStreams,
  } = useRoomPeers({
    client: getClient(),
    roomId: isInRoom ? roomId : null,
    localPeerId: localPeer?.id || null,
    initialPeers: peers,
    onPeerAudioStream: (peerId, stream) => {
      console.log("[Room] Peer audio stream received:", peerId);
      addPeerStream(peerId, stream);
    },
    onPeerConnectionStateChange: (peerId, state) => {
      console.log(`[Room] Peer ${peerId} connection state:`, state);
    },
  });

  // Audio playback hook - manages audio elements for each peer
  const { addPeerStream, removePeerStream, peerAudio } = useRoomAudio({
    autoPlay: true,
    onPeerAudioStart: (peerId) => {
      console.log("[Room] Peer audio started:", peerId);
    },
    onAudioError: (peerId, error) => {
      console.error(`[Room] Audio error for peer ${peerId}:`, error);
    },
  });

  // Presence hook - manages speaking/muted state
  const {
    localPresence,
    activeSpeaker,
    setMuted: setPresenceMuted,
    setAddressingAI: setPresenceAddressingAI,
    setSpeaking,
  } = usePresence({
    client: getClient(),
    roomId: isInRoom ? roomId : null,
    localPeerId: localPeer?.id || null,
    initialPeers: peers,
    onActiveSpeakerChange: (peerId) => {
      console.log("[Room] Active speaker:", peerId);
    },
  });

  // Shared AI hook - manages AI state and response playback
  const {
    state: aiState,
    playback: aiPlayback,
    startPlayback: startAIPlayback,
    stopPlayback: stopAIPlayback,
  } = useSharedAI(
    {
      signalingClient: getClient(),
      roomId: isInRoom ? roomId : undefined,
      localPeerId: localPeer?.id,
    },
    {
      onAIStateChange: (state, prevState) => {
        console.log(`[Room] AI state changed: ${prevState} -> ${state}`);
      },
      onResponseStart: (response) => {
        console.log("[Room] AI response started:", response.responseId);
        startAIPlayback();
      },
      onResponseEnd: (response) => {
        console.log("[Room] AI response ended:", response.responseId);
      },
      onError: (error) => {
        console.error("[Room] AI error:", error);
      },
    },
  );

  // Convert signaling peers to ParticipantInfo format
  // Use local mute state for accurate UI and WebRTC peer states for remote peers
  const participants: ParticipantInfo[] = [
    // Add local peer first with actual local mute state
    ...(localPeer
      ? [
          {
            id: localPeer.id,
            displayName: localPeer.displayName,
            avatarUrl: localPeer.avatarUrl,
            role: localPeer.role as "owner" | "moderator" | "participant",
            isMuted: localIsMuted, // Use actual local mute state
            isSpeaking: localPresence.isSpeaking || isAddressingAI,
            isLocal: true,
            connectionState: "connected" as const,
          },
        ]
      : []),
    // Add remote peers with WebRTC connection states
    ...webrtcPeers.map((peer) => ({
      id: peer.id,
      displayName: peer.displayName,
      avatarUrl: peer.avatarUrl,
      role: peer.role as "owner" | "moderator" | "participant",
      isMuted: peer.isMuted,
      isSpeaking: peer.isSpeaking,
      isLocal: false,
      connectionState: peer.webrtcState,
    })),
  ];

  /**
   * Request microphone access and initialize local audio stream
   */
  const initializeMicrophone =
    useCallback(async (): Promise<MediaStream | null> => {
      try {
        console.log("[Room] Requesting microphone access...");
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
          video: false,
        });
        console.log("[Room] Microphone access granted");
        localStreamRef.current = stream;
        setMicError(null);
        return stream;
      } catch (err) {
        console.error("[Room] Microphone access error:", err);
        const errorMessage =
          err instanceof Error ? err.message : "Microphone access denied";
        setMicError(errorMessage);
        return null;
      }
    }, []);

  /**
   * Stop local audio stream
   */
  const stopMicrophone = useCallback(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        track.stop();
      });
      localStreamRef.current = null;
    }
  }, []);

  /**
   * Connect to signaling server and join room
   * Note: Using refs to avoid useEffect dependency issues
   */
  const connectRef = useRef(connect);
  const joinRoomRef = useRef(joinRoom);
  const leaveRoomRef = useRef(leaveRoom);
  const initializeMicrophoneRef = useRef(initializeMicrophone);
  const stopMicrophoneRef = useRef(stopMicrophone);
  const setLocalStreamRef = useRef(setLocalStream);

  // Keep refs updated
  useEffect(() => {
    connectRef.current = connect;
    joinRoomRef.current = joinRoom;
    leaveRoomRef.current = leaveRoom;
    initializeMicrophoneRef.current = initializeMicrophone;
    stopMicrophoneRef.current = stopMicrophone;
    setLocalStreamRef.current = setLocalStream;
  }, [
    connect,
    joinRoom,
    leaveRoom,
    initializeMicrophone,
    stopMicrophone,
    setLocalStream,
  ]);

  useEffect(() => {
    let mounted = true;
    let hasJoined = false;

    async function connectAndJoin() {
      try {
        setRoomState("loading");

        // Connect to Socket.io signaling server
        console.log("[Room] Connecting to signaling server...");
        await connectRef.current();

        if (!mounted) return;

        // Initialize microphone for WebRTC
        console.log("[Room] Initializing microphone...");
        const stream = await initializeMicrophoneRef.current();
        if (stream) {
          // Set local stream for WebRTC peer connections
          setLocalStreamRef.current(stream);
          // Start muted by default
          stream.getAudioTracks().forEach((track) => {
            track.enabled = false;
          });
          console.log("[Room] Local stream set for WebRTC");
        }

        if (!mounted) return;

        setRoomState("joining");

        // Join the room
        console.log("[Room] Joining room:", roomId);
        await joinRoomRef.current(roomId, displayName);
        hasJoined = true;

        if (!mounted) {
          // Component unmounted during join, leave the room
          console.log("[Room] Component unmounted, leaving room...");
          await leaveRoomRef.current();
          stopMicrophoneRef.current();
          return;
        }

        setRoomState("connected");
        console.log("[Room] Successfully joined room with voice enabled");
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

    // Cleanup: Leave room and stop microphone when component unmounts
    return () => {
      mounted = false;
      if (hasJoined) {
        console.log("[Room] Cleanup: leaving room and stopping microphone...");
        leaveRoomRef.current().catch((err) => {
          console.error("[Room] Error leaving room:", err);
        });
      }
      stopMicrophoneRef.current();
    };
  }, [roomId, displayName]); // Only depend on roomId and displayName

  /**
   * Handle mute toggle - controls actual microphone track
   */
  const handleMuteToggle = useCallback(() => {
    const newMuted = !localIsMuted;
    setLocalIsMuted(newMuted);

    // Actually enable/disable the microphone track
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach((track) => {
        track.enabled = !newMuted;
        console.log(
          `[Room] Microphone track ${newMuted ? "disabled" : "enabled"}`,
        );
      });
    }

    // Update presence state for signaling
    setPresenceMuted(newMuted);
  }, [localIsMuted, setPresenceMuted]);

  /**
   * Handle leave room
   */
  const handleLeaveRoom = useCallback(async () => {
    setIsLeaving(true);
    try {
      // Stop microphone
      stopMicrophone();
      // Leave room via signaling
      await leaveRoom();
      router.push("/rooms");
    } catch {
      setIsLeaving(false);
    }
  }, [router, leaveRoom, stopMicrophone]);

  /**
   * Handle PTT start - unmute and address AI
   */
  const handlePTTStart = useCallback(() => {
    // Check if AI is already speaking/processing - don't allow PTT
    if (aiState.aiState === "speaking" || aiState.aiState === "processing") {
      console.log("[Room] PTT blocked - AI is", aiState.aiState);
      return;
    }

    setIsAddressingAI(true);
    console.log("[Room] PTT started - addressing AI");

    // Unmute microphone when PTT is active
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach((track) => {
        track.enabled = true;
      });
    }

    // Update presence for signaling
    setPresenceAddressingAI(true);
    setSpeaking(true);

    // Notify server that PTT started - this triggers AI listening
    const client = getClient();
    if (client) {
      client.startPTT(roomId);
      console.log("[Room] Sent ai:ptt_start to server");
    }
  }, [
    aiState.aiState,
    setPresenceAddressingAI,
    setSpeaking,
    getClient,
    roomId,
  ]);

  /**
   * Handle PTT end - restore mute state
   */
  const handlePTTEnd = useCallback(() => {
    if (!isAddressingAI) return; // Not in PTT mode

    setIsAddressingAI(false);
    console.log("[Room] PTT ended");

    // Restore previous mute state
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach((track) => {
        track.enabled = !localIsMuted;
      });
    }

    // Update presence for signaling
    setPresenceAddressingAI(false);
    setSpeaking(false);

    // Notify server that PTT ended - this triggers AI processing
    const client = getClient();
    if (client) {
      client.endPTT(roomId);
      console.log("[Room] Sent ai:ptt_end to server");
    }
  }, [
    isAddressingAI,
    localIsMuted,
    setPresenceAddressingAI,
    setSpeaking,
    getClient,
    roomId,
  ]);

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
              activeSpeakerId={activeSpeaker}
              layout="grid"
              showConnectionStatus
              showRoleBadge
              className="justify-center"
            />

            {/* Room status */}
            <div className="mt-8 text-center space-y-3">
              {/* Connection status */}
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-green-500/10 border border-green-500/30 rounded-full text-green-400 text-sm">
                <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                Connected
              </div>

              {/* Microphone status */}
              <div className="block">
                {micError ? (
                  <div className="inline-flex items-center gap-2 px-4 py-2 bg-red-500/10 border border-red-500/30 rounded-full text-red-400 text-sm">
                    <MicOff className="w-4 h-4" />
                    Microphone error: {micError}
                  </div>
                ) : localStreamRef.current ? (
                  <div
                    className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm ${
                      localIsMuted
                        ? "bg-yellow-500/10 border border-yellow-500/30 text-yellow-400"
                        : "bg-blue-500/10 border border-blue-500/30 text-blue-400"
                    }`}
                  >
                    {localIsMuted ? (
                      <>
                        <MicOff className="w-4 h-4" />
                        Microphone muted
                      </>
                    ) : (
                      <>
                        <Mic className="w-4 h-4" />
                        Microphone active
                      </>
                    )}
                  </div>
                ) : (
                  <div className="inline-flex items-center gap-2 px-4 py-2 bg-gray-500/10 border border-gray-500/30 rounded-full text-gray-400 text-sm">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Initializing microphone...
                  </div>
                )}
              </div>

              {/* Active speaker indicator */}
              {activeSpeaker && activeSpeaker !== localPeer?.id && (
                <div className="block">
                  <div className="inline-flex items-center gap-2 px-4 py-2 bg-purple-500/10 border border-purple-500/30 rounded-full text-purple-400 text-sm">
                    <span className="w-2 h-2 bg-purple-500 rounded-full animate-pulse" />
                    {webrtcPeers.find((p) => p.id === activeSpeaker)
                      ?.displayName || "Someone"}{" "}
                    is speaking
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* AI status */}
        <div className="px-4 sm:px-6 lg:px-8 py-4 border-t border-border bg-card/50">
          <div className="max-w-7xl mx-auto text-center">
            <div className="flex items-center justify-center gap-2">
              {/* AI state indicator */}
              {aiState.aiState === "idle" && !isAddressingAI && (
                <p className="text-sm text-muted-foreground">
                  Hold the Talk button to address the AI assistant
                </p>
              )}
              {aiState.aiState === "idle" && isAddressingAI && (
                <div className="flex items-center gap-2 text-purple-400">
                  <span className="w-2 h-2 bg-purple-500 rounded-full animate-pulse" />
                  <span className="text-sm">Listening... Release to send</span>
                </div>
              )}
              {aiState.aiState === "listening" && (
                <div className="flex items-center gap-2 text-purple-400">
                  <span className="w-2 h-2 bg-purple-500 rounded-full animate-pulse" />
                  <span className="text-sm">
                    AI is listening
                    {aiState.currentSpeakerName &&
                      ` to ${aiState.currentSpeakerName}`}
                  </span>
                </div>
              )}
              {aiState.aiState === "processing" && (
                <div className="flex items-center gap-2 text-yellow-400">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-sm">AI is thinking...</span>
                </div>
              )}
              {aiState.aiState === "speaking" && (
                <div className="flex items-center gap-2 text-green-400">
                  <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                  <span className="text-sm">AI is speaking</span>
                </div>
              )}
              {aiState.lastError && (
                <div className="flex items-center gap-2 text-red-400">
                  <AlertCircle className="w-4 h-4" />
                  <span className="text-sm">{aiState.lastError}</span>
                </div>
              )}
            </div>
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
