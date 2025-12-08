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
  MicOff,
} from "lucide-react";
import {
  ParticipantList,
  RoomControls,
  UsernameModal,
  ParticipantModal,
} from "@/components/room";
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

  // Local user state - prioritize localStorage vanity name, fall back to session
  const [displayName, setDisplayName] = useState(() => {
    if (typeof window !== "undefined") {
      // Check localStorage first for persisted vanity username
      const vanity = localStorage.getItem("swensync_vanityUsername");
      if (vanity) return vanity;
      // Fall back to sessionStorage for temporary name
      const stored = sessionStorage.getItem("swensync_displayName");
      if (stored) return stored;
      // Generate new temporary name
      const newName = `User-${Math.random().toString(36).slice(2, 6)}`;
      sessionStorage.setItem("swensync_displayName", newName);
      return newName;
    }
    return "User";
  });
  const [showUsernameModal, setShowUsernameModal] = useState(false);
  const [showParticipantModal, setShowParticipantModal] = useState(false);
  const [selectedParticipant, setSelectedParticipant] =
    useState<ParticipantInfo | null>(null);
  const [isAddressingAI, setIsAddressingAI] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);

  // Track local mute state - start MUTED by default (matches server and audio track state)
  const [localIsMuted, setLocalIsMuted] = useState(true);

  // Local media stream ref
  const localStreamRef = useRef<MediaStream | null>(null);

  // Audio capture refs for PTT streaming (using AudioWorklet)
  const audioContextRef = useRef<AudioContext | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const workletReadyRef = useRef<boolean>(false);

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
  const {
    addPeerStream,
    removePeerStream,
    setLocalStream: setLocalAudioStream,
    peerAudio,
  } = useRoomAudio({
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

  // Determine if AI is actually speaking
  // Use isPlaying as primary indicator - server state may go idle before audio buffer finishes
  // Also show as speaking if server says speaking (even if audio hasn't started yet)
  const isAIActuallySpeaking =
    aiPlayback.isPlaying || aiState.aiState === "speaking";

  // Convert signaling peers to ParticipantInfo format
  // Use local mute state for accurate UI and WebRTC peer states for remote peers
  // Use client-side audio analysis for remote peer speaking detection (isSpeaking from peerAudio)
  const participants: ParticipantInfo[] = [
    // Add AI as the first participant - always present in rooms
    {
      id: "ai-assistant" as string,
      displayName: "AI Assistant",
      role: "participant" as const,
      isMuted: false,
      isSpeaking: isAIActuallySpeaking,
      isLocal: false,
      connectionState: "connected" as const,
      isAI: true,
      audioLevel: isAIActuallySpeaking ? 0.7 : 0, // Simulated audio level when speaking
    },
    // Add local peer with actual local mute state
    // Use client-side VAD for speaking detection when mic is active
    ...(localPeer
      ? (() => {
          const localAudioState = peerAudio.get(localPeer.id);
          // Only use VAD when not muted, otherwise rely on addressing AI state
          const isSpeaking = localIsMuted
            ? isAddressingAI
            : (localAudioState?.isSpeaking ?? false) || isAddressingAI;
          const audioLevel = localIsMuted
            ? isAddressingAI
              ? 0.5
              : 0
            : (localAudioState?.audioLevel ?? 0);

          return [
            {
              id: localPeer.id,
              displayName: localPeer.displayName,
              avatarUrl: localPeer.avatarUrl,
              role: localPeer.role as "owner" | "moderator" | "participant",
              isMuted: localIsMuted, // Use actual local mute state
              isSpeaking,
              isLocal: true,
              connectionState: "connected" as const,
              isAI: false,
              audioLevel,
            },
          ];
        })()
      : []),
    // Add remote peers with WebRTC connection states
    // Use client-side audio analysis for speaking detection
    ...webrtcPeers.map((peer) => {
      const peerAudioState = peerAudio.get(peer.id);
      // Use client-side VAD from audio analysis, fallback to server presence
      const isSpeaking = peerAudioState?.isSpeaking ?? peer.isSpeaking;
      const audioLevel = peerAudioState?.audioLevel ?? 0;

      return {
        id: peer.id,
        displayName: peer.displayName,
        avatarUrl: peer.avatarUrl,
        role: peer.role as "owner" | "moderator" | "participant",
        isMuted: peer.isMuted,
        isSpeaking,
        isLocal: false,
        connectionState: peer.webrtcState,
        isAI: false,
        audioLevel,
      };
    }),
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

    // Cleanup: Leave room, stop microphone, and close audio context when component unmounts
    return () => {
      mounted = false;
      if (hasJoined) {
        console.log("[Room] Cleanup: leaving room and stopping microphone...");
        leaveRoomRef.current().catch((err) => {
          console.error("[Room] Error leaving room:", err);
        });
      }
      stopMicrophoneRef.current();

      // Clean up audio capture
      if (workletNodeRef.current) {
        workletNodeRef.current.port.onmessage = null;
        workletNodeRef.current.disconnect();
        workletNodeRef.current = null;
      }
      if (sourceNodeRef.current) {
        sourceNodeRef.current.disconnect();
        sourceNodeRef.current = null;
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }
    };
  }, [roomId, displayName]); // Only depend on roomId and displayName

  // Set up local audio stream for VAD analysis once we have peer ID and stream
  useEffect(() => {
    if (localPeer?.id && localStreamRef.current) {
      console.log("[Room] Setting up local audio stream for VAD analysis");
      setLocalAudioStream(localPeer.id, localStreamRef.current);
    }

    return () => {
      if (localPeer?.id) {
        setLocalAudioStream(localPeer.id, null);
      }
    };
  }, [localPeer?.id, setLocalAudioStream]);

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
   * Handle PTT start - unmute, address AI, and start audio capture
   * Note: Voice interrupt detection is managed automatically by useEffect when AI is speaking
   */
  const handlePTTStart = useCallback(() => {
    // Block PTT if another user is already addressing the AI
    // Check if AI is in listening or processing state (someone else is talking)
    if (
      (aiState.aiState === "listening" || aiState.aiState === "processing") &&
      aiState.currentSpeakerId !== localPeer?.id
    ) {
      console.log(
        `[Room] PTT blocked - ${aiState.currentSpeakerName || "Someone"} is already addressing AI (state: ${aiState.aiState})`,
      );
      return;
    }

    // Allow PTT even when AI is speaking - user may want to interrupt
    // Voice interrupt detection will handle the "excuse me" keyword

    if (!localStreamRef.current) {
      console.error("[Room] No local stream available for PTT");
      return;
    }

    setIsAddressingAI(true);
    console.log("[Room] PTT started - addressing AI");

    // Unmute microphone when PTT is active
    localStreamRef.current.getAudioTracks().forEach((track) => {
      track.enabled = true;
    });

    // Update presence for signaling
    setPresenceAddressingAI(true);
    setSpeaking(true);

    // Notify server that PTT started - this triggers AI listening
    const client = getClient();
    if (client) {
      client.startPTT(roomId);
      console.log("[Room] Sent ai:ptt_start to server");
    }

    // Set up audio capture for streaming to server (using AudioWorklet)
    const setupAudioCapture = async () => {
      try {
        // Create AudioContext at 24kHz (OpenAI Realtime API requirement)
        // Each new AudioContext needs its own worklet module loaded
        const needsNewContext =
          !audioContextRef.current ||
          audioContextRef.current.state === "closed";
        if (needsNewContext) {
          audioContextRef.current = new AudioContext({ sampleRate: 24000 });
          workletReadyRef.current = false; // Reset worklet flag for new context
        }

        const audioContext = audioContextRef.current!;

        // Resume if suspended (browser autoplay policy)
        if (audioContext.state === "suspended") {
          await audioContext.resume();
        }

        // Load AudioWorklet module if not already loaded for THIS context
        if (!workletReadyRef.current) {
          console.log("[Room] Loading AudioWorklet module...");
          await audioContext.audioWorklet.addModule(
            "/audio/pcm-capture-processor.js",
          );
          workletReadyRef.current = true;
          console.log("[Room] AudioWorklet module loaded successfully");
        }

        // Create source from microphone stream
        const source = audioContext.createMediaStreamSource(
          localStreamRef.current!,
        );
        sourceNodeRef.current = source;

        // Create AudioWorkletNode for audio capture
        const workletNode = new AudioWorkletNode(
          audioContext,
          "pcm-capture-processor",
        );
        workletNodeRef.current = workletNode;

        // Handle PCM16 audio chunks from worklet
        workletNode.port.onmessage = (event) => {
          if (event.data.type === "audio") {
            const pcm16Buffer = event.data.pcm16;
            const uint8Array = new Uint8Array(pcm16Buffer);

            // Convert to base64
            let binary = "";
            for (let i = 0; i < uint8Array.length; i++) {
              binary += String.fromCharCode(uint8Array[i]);
            }
            const audioBase64 = btoa(binary);

            // Send to server
            const socket = client?.getSocket();
            if (socket) {
              socket.emit("ai:audio_data", { roomId, audio: audioBase64 });
            }
          }
        };

        // Connect: source -> workletNode (no need to connect to destination)
        source.connect(workletNode);

        console.log("[Room] Audio capture started for PTT (AudioWorklet)");
      } catch (err) {
        console.error("[Room] Failed to start audio capture:", err);
      }
    };
    setupAudioCapture();
  }, [
    setPresenceAddressingAI,
    setSpeaking,
    getClient,
    roomId,
    aiState.aiState,
    aiState.currentSpeakerId,
    aiState.currentSpeakerName,
    localPeer?.id,
  ]);

  /**
   * Handle PTT end - stop audio capture and restore mute state
   * Note: Voice interrupt detection is managed automatically by useEffect when AI is speaking
   */
  const handlePTTEnd = useCallback(() => {
    if (!isAddressingAI) return; // Not in PTT mode

    setIsAddressingAI(false);
    console.log("[Room] PTT ended");

    // Stop audio capture
    if (workletNodeRef.current) {
      workletNodeRef.current.port.onmessage = null;
      workletNodeRef.current.disconnect();
      workletNodeRef.current = null;
    }
    if (sourceNodeRef.current) {
      sourceNodeRef.current.disconnect();
      sourceNodeRef.current = null;
    }
    console.log("[Room] Audio capture stopped");

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
   * Handle interrupt AI button click - immediately stops AI audio for everyone
   */
  const handleInterruptAI = useCallback(() => {
    const client = getClient();
    if (client && isInRoom) {
      client.voiceInterrupt(roomId, "button");
      console.log("[Room] Sent interrupt via button");
    }
  }, [getClient, isInRoom, roomId]);

  // Button visibility: show when AI is speaking/processing OR when audio is still playing
  // This handles the case where server state goes idle but audio is still buffered/playing
  const isAISpeakingForButton =
    aiState.aiState === "speaking" ||
    aiState.aiState === "processing" ||
    aiPlayback.isPlaying;
  useEffect(() => {
    console.log(
      `[Room] Interrupt button visible: ${isAISpeakingForButton} (aiState: ${aiState.aiState}, isPlaying: ${aiPlayback.isPlaying})`,
    );
  }, [isAISpeakingForButton, aiState.aiState, aiPlayback.isPlaying]);

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
   * Handle username change from modal
   */
  const handleUsernameChange = useCallback(
    (newName: string) => {
      setDisplayName(newName);
      // Persist to localStorage for future sessions
      localStorage.setItem("swensync_vanityUsername", newName);
      // Update via signaling to broadcast to peers
      const client = getClient();
      if (client) {
        client.updateDisplayName(newName);
      }
      setShowUsernameModal(false);
    },
    [getClient],
  );

  /**
   * Handle participant click - open modal with options
   */
  const handleParticipantClick = useCallback(
    (participantId: string) => {
      const participant = participants.find((p) => p.id === participantId);
      if (participant) {
        setSelectedParticipant(participant);
        setShowParticipantModal(true);
      }
    },
    [participants],
  );

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
    <div className="h-screen bg-background flex flex-col overflow-hidden">
      {/* Header */}
      <header className="flex-shrink-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b border-border">
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

          {/* Dynamic status row */}
          <div className="flex items-center justify-center py-2 border-t border-border/50">
            <div className="text-sm font-medium">
              {/* AI Speaking */}
              {aiState.aiState === "speaking" || aiPlayback.isPlaying ? (
                <span className="text-green-400 flex items-center gap-2">
                  <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                  AI is speaking
                </span>
              ) : /* AI Processing */
              aiState.aiState === "processing" ? (
                <span className="text-yellow-400 flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  AI is thinking...
                </span>
              ) : /* AI Listening to someone else */
              aiState.aiState === "listening" &&
                aiState.currentSpeakerId !== localPeer?.id ? (
                <span className="text-purple-400 flex items-center gap-2">
                  <span className="w-2 h-2 bg-purple-500 rounded-full animate-pulse" />
                  {aiState.currentSpeakerName || "Someone"} is speaking
                </span>
              ) : /* Local user addressing AI */
              isAddressingAI ||
                (aiState.aiState === "listening" &&
                  aiState.currentSpeakerId === localPeer?.id) ? (
                <span className="text-purple-400 flex items-center gap-2">
                  <span className="w-2 h-2 bg-purple-500 rounded-full animate-pulse" />
                  Listening... Release to send
                </span>
              ) : /* Remote peer speaking (not to AI) */
              activeSpeaker &&
                activeSpeaker !== localPeer?.id &&
                activeSpeaker !== "ai-assistant" ? (
                <span className="text-blue-400 flex items-center gap-2">
                  <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
                  {webrtcPeers.find((p) => p.id === activeSpeaker)
                    ?.displayName || "Someone"}{" "}
                  is speaking
                </span>
              ) : (
                /* Default idle state */
                <span className="text-muted-foreground">
                  Hold To Speak to AI
                </span>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Participants area - fills available space, no scroll */}
        <div className="flex-1 flex flex-col items-center justify-center p-4 overflow-hidden">
          <div className="w-full max-w-4xl">
            {/* Participant list */}
            <ParticipantList
              participants={participants}
              localPeerId={localPeer?.id || ""}
              activeSpeakerId={activeSpeaker}
              showConnectionStatus
              showRoleBadge
              onParticipantClick={handleParticipantClick}
              viewportAware
            />

            {/* Error indicator only - show mic errors if any */}
            {micError && (
              <div className="mt-4 text-center">
                <div className="inline-flex items-center gap-2 px-4 py-2 bg-red-500/10 border border-red-500/30 rounded-full text-red-400 text-sm">
                  <MicOff className="w-4 h-4" />
                  Microphone error: {micError}
                </div>
              </div>
            )}

            {/* AI error indicator */}
            {aiState.lastError && (
              <div className="mt-4 text-center">
                <div className="inline-flex items-center gap-2 px-4 py-2 bg-red-500/10 border border-red-500/30 rounded-full text-red-400 text-sm">
                  <AlertCircle className="w-4 h-4" />
                  {aiState.lastError}
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Controls footer */}
      <footer className="flex-shrink-0 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-t border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <RoomControls
            isMuted={localIsMuted}
            onMuteToggle={handleMuteToggle}
            showPTT
            onPTTStart={handlePTTStart}
            onPTTEnd={handlePTTEnd}
            isAddressingAI={isAddressingAI}
            isAISpeaking={isAISpeakingForButton}
            onInterruptAI={handleInterruptAI}
            size="lg"
          />
        </div>
      </footer>

      {/* Username edit modal */}
      <UsernameModal
        isOpen={showUsernameModal}
        currentName={displayName}
        onSave={handleUsernameChange}
        onClose={() => setShowUsernameModal(false)}
      />

      {/* Participant options modal */}
      <ParticipantModal
        isOpen={showParticipantModal}
        participant={selectedParticipant}
        isLocalUser={selectedParticipant?.id === localPeer?.id}
        onClose={() => {
          setShowParticipantModal(false);
          setSelectedParticipant(null);
        }}
        onMuteToggle={handleMuteToggle}
        onEditUsername={() => {
          setShowParticipantModal(false);
          setShowUsernameModal(true);
        }}
      />
    </div>
  );
}
