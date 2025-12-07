/**
 * useRoomAI Hook
 *
 * Manages AI session for a room using PTT (Push-to-Talk) interaction.
 * When PTT is active, streams audio to server which routes to OpenAI.
 * Receives and plays AI audio responses broadcast to all room participants.
 *
 * Part of the Long-Horizon Engineering Protocol - FEAT-413
 */

"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import type { AIResponseState } from "@/types/voice-mode";
import type { SignalingClient } from "@/lib/signaling/client";

/**
 * AI session state for room
 */
export interface RoomAIState {
  /** Current AI state */
  aiState: AIResponseState;
  /** Whether AI is ready */
  isReady: boolean;
  /** Active speaker ID (who triggered AI) */
  activeSpeakerId: string | null;
  /** Active speaker display name */
  activeSpeakerName: string | null;
  /** Whether local user triggered current AI response */
  isLocalSpeaker: boolean;
  /** Session health */
  isSessionHealthy: boolean;
  /** Last error */
  lastError: string | null;
}

/**
 * Hook options
 */
export interface UseRoomAIOptions {
  /** Room ID */
  roomId?: string;
  /** Local peer ID */
  localPeerId?: string;
  /** Signaling client for socket events */
  signalingClient?: SignalingClient | null;
  /** Audio context for AI audio playback */
  audioContext?: AudioContext | null;
}

/**
 * Hook callbacks
 */
export interface UseRoomAICallbacks {
  /** Called when AI state changes */
  onAIStateChange?: (
    state: AIResponseState,
    prevState: AIResponseState,
  ) => void;
  /** Called when AI audio starts playing */
  onAIAudioStart?: () => void;
  /** Called when AI audio chunk is received */
  onAIAudioChunk?: (audioData: ArrayBuffer) => void;
  /** Called when AI audio finishes */
  onAIAudioEnd?: () => void;
  /** Called on error */
  onError?: (error: string) => void;
}

/**
 * Hook return type
 */
export interface UseRoomAIReturn {
  /** Current AI state */
  state: RoomAIState;
  /** Audio analyser node for visualization */
  analyserNode: AnalyserNode | null;
  /** Whether PTT is currently active */
  isPTTActive: boolean;
  /** Start PTT - begin streaming audio to AI */
  startPTT: () => Promise<void>;
  /** End PTT - stop streaming and trigger AI response */
  endPTT: () => void;
  /** Cancel PTT - stop streaming without response */
  cancelPTT: () => void;
  /** Stop current AI audio playback */
  stopPlayback: () => void;
}

/**
 * Audio worklet processor for capturing mic audio
 */
const AUDIO_WORKLET_URL = "/audio-worklets/pcm-processor.js";

/**
 * Default AI state
 */
const DEFAULT_AI_STATE: RoomAIState = {
  aiState: "idle",
  isReady: true,
  activeSpeakerId: null,
  activeSpeakerName: null,
  isLocalSpeaker: false,
  isSessionHealthy: true,
  lastError: null,
};

/**
 * useRoomAI Hook
 *
 * Manages the AI session for a shared room.
 * Handles PTT audio capture and AI response playback.
 *
 * @example
 * ```tsx
 * const { state, startPTT, endPTT, analyserNode } = useRoomAI({
 *   roomId: 'room-123',
 *   localPeerId: 'peer-abc',
 *   signalingClient: client,
 * }, {
 *   onAIStateChange: (state) => console.log('AI state:', state),
 * });
 *
 * // PTT button handlers
 * <button onMouseDown={startPTT} onMouseUp={endPTT}>
 *   Push to Talk
 * </button>
 * ```
 */
export function useRoomAI(
  options: UseRoomAIOptions,
  callbacks: UseRoomAICallbacks = {},
): UseRoomAIReturn {
  const {
    roomId,
    localPeerId,
    signalingClient,
    audioContext: externalAudioContext,
  } = options;
  const {
    onAIStateChange,
    onAIAudioStart,
    onAIAudioChunk,
    onAIAudioEnd,
    onError,
  } = callbacks;

  // State
  const [aiState, setAIState] = useState<RoomAIState>(DEFAULT_AI_STATE);
  const [isPTTActive, setIsPTTActive] = useState(false);
  const [analyserNode, setAnalyserNode] = useState<AnalyserNode | null>(null);

  // Refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const aiAudioElementRef = useRef<HTMLAudioElement | null>(null);
  const audioQueueRef = useRef<ArrayBuffer[]>([]);
  const isPlayingRef = useRef(false);
  const prevStateRef = useRef<AIResponseState>("idle");

  /**
   * Initialize audio context for AI playback
   */
  const initAudioContext = useCallback(async () => {
    if (externalAudioContext) {
      audioContextRef.current = externalAudioContext;
      return externalAudioContext;
    }

    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext({ sampleRate: 24000 });
    }

    if (audioContextRef.current.state === "suspended") {
      await audioContextRef.current.resume();
    }

    return audioContextRef.current;
  }, [externalAudioContext]);

  /**
   * Play queued AI audio
   */
  const playNextAudioChunk = useCallback(async () => {
    if (audioQueueRef.current.length === 0 || isPlayingRef.current) {
      return;
    }

    const audioContext = audioContextRef.current;
    if (!audioContext) return;

    isPlayingRef.current = true;

    while (audioQueueRef.current.length > 0) {
      const chunk = audioQueueRef.current.shift()!;

      try {
        // Decode PCM16 to AudioBuffer
        const pcm16 = new Int16Array(chunk);
        const float32 = new Float32Array(pcm16.length);

        for (let i = 0; i < pcm16.length; i++) {
          float32[i] = pcm16[i] / 32768;
        }

        const audioBuffer = audioContext.createBuffer(1, float32.length, 24000);
        audioBuffer.getChannelData(0).set(float32);

        // Play buffer
        const source = audioContext.createBufferSource();
        source.buffer = audioBuffer;

        // Create analyser for visualization
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        analyser.connect(audioContext.destination);
        setAnalyserNode(analyser);

        source.start();

        // Wait for playback to complete
        await new Promise<void>((resolve) => {
          source.onended = () => resolve();
        });
      } catch (err) {
        console.error("[useRoomAI] Error playing audio chunk:", err);
      }
    }

    isPlayingRef.current = false;
  }, []);

  /**
   * Handle AI audio data from server
   */
  const handleAIAudio = useCallback(
    (audioBase64: string) => {
      try {
        // Decode base64 to ArrayBuffer
        const binaryString = atob(audioBase64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }

        const audioData = bytes.buffer;
        audioQueueRef.current.push(audioData);
        onAIAudioChunk?.(audioData);

        // Start playback if not already playing
        playNextAudioChunk();
      } catch (err) {
        console.error("[useRoomAI] Error handling AI audio:", err);
      }
    },
    [onAIAudioChunk, playNextAudioChunk],
  );

  /**
   * Handle AI state event from server
   */
  const handleAIStateEvent = useCallback(
    (event: {
      type: string;
      roomId: string;
      state: {
        state: AIResponseState;
        activeSpeakerId?: string | null;
        activeSpeakerName?: string | null;
        isSessionHealthy?: boolean;
      };
    }) => {
      if (event.roomId !== roomId) return;

      const newState = event.state.state;
      const prevState = prevStateRef.current;

      // Update state
      setAIState((prev) => ({
        ...prev,
        aiState: newState,
        activeSpeakerId: event.state.activeSpeakerId ?? null,
        activeSpeakerName: event.state.activeSpeakerName ?? null,
        isLocalSpeaker: event.state.activeSpeakerId === localPeerId,
        isSessionHealthy: event.state.isSessionHealthy ?? true,
      }));

      // Notify callback
      if (newState !== prevState) {
        onAIStateChange?.(newState, prevState);
        prevStateRef.current = newState;
      }

      // Handle state transitions
      if (newState === "speaking" && prevState !== "speaking") {
        onAIAudioStart?.();
      } else if (prevState === "speaking" && newState !== "speaking") {
        onAIAudioEnd?.();
      }
    },
    [roomId, localPeerId, onAIStateChange, onAIAudioStart, onAIAudioEnd],
  );

  /**
   * Start PTT - begin capturing and streaming audio
   */
  const startPTT = useCallback(async () => {
    if (!roomId || !signalingClient) {
      console.warn(
        "[useRoomAI] Cannot start PTT - missing roomId or signalingClient",
      );
      return;
    }

    if (isPTTActive) {
      console.warn("[useRoomAI] PTT already active");
      return;
    }

    // Check if AI is available
    if (aiState.aiState === "speaking" || aiState.aiState === "processing") {
      console.log(
        "[useRoomAI] Cannot start PTT - AI is busy:",
        aiState.aiState,
      );
      onError?.("AI is currently responding. Please wait.");
      return;
    }

    try {
      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 24000,
        },
      });
      mediaStreamRef.current = stream;

      // Initialize audio context
      const audioContext = await initAudioContext();

      // Notify server of PTT start
      signalingClient.startPTT(roomId);
      setIsPTTActive(true);

      console.log("[useRoomAI] PTT started");
    } catch (err) {
      console.error("[useRoomAI] Failed to start PTT:", err);
      onError?.(
        err instanceof Error ? err.message : "Failed to access microphone",
      );
    }
  }, [
    roomId,
    signalingClient,
    isPTTActive,
    aiState.aiState,
    initAudioContext,
    onError,
  ]);

  /**
   * End PTT - stop capturing and trigger AI response
   */
  const endPTT = useCallback(() => {
    if (!isPTTActive || !roomId || !signalingClient) {
      return;
    }

    // Stop media stream
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }

    // Clean up worklet
    if (workletNodeRef.current) {
      workletNodeRef.current.disconnect();
      workletNodeRef.current = null;
    }

    // Notify server of PTT end
    signalingClient.endPTT(roomId);
    setIsPTTActive(false);

    console.log("[useRoomAI] PTT ended");
  }, [isPTTActive, roomId, signalingClient]);

  /**
   * Cancel PTT - stop without triggering AI
   */
  const cancelPTT = useCallback(() => {
    if (!isPTTActive) return;

    // Stop media stream
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }

    // Clean up worklet
    if (workletNodeRef.current) {
      workletNodeRef.current.disconnect();
      workletNodeRef.current = null;
    }

    setIsPTTActive(false);
    console.log("[useRoomAI] PTT cancelled");
  }, [isPTTActive]);

  /**
   * Stop AI audio playback
   */
  const stopPlayback = useCallback(() => {
    audioQueueRef.current = [];
    isPlayingRef.current = false;
    setAnalyserNode(null);
  }, []);

  /**
   * Subscribe to AI events from signaling
   */
  useEffect(() => {
    const socket = signalingClient?.getSocket();
    if (!socket || !roomId) return;

    // Listen for AI state events
    socket.on("ai:state", handleAIStateEvent);

    // Listen for AI audio events
    socket.on("ai:audio", handleAIAudio);

    return () => {
      socket.off("ai:state", handleAIStateEvent);
      socket.off("ai:audio", handleAIAudio);
    };
  }, [signalingClient, roomId, handleAIStateEvent, handleAIAudio]);

  /**
   * Cleanup on unmount
   */
  useEffect(() => {
    return () => {
      // Stop PTT
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      }

      // Clean up worklet
      if (workletNodeRef.current) {
        workletNodeRef.current.disconnect();
      }

      // Close audio context if we created it
      if (audioContextRef.current && !externalAudioContext) {
        audioContextRef.current.close();
      }
    };
  }, [externalAudioContext]);

  return {
    state: aiState,
    analyserNode,
    isPTTActive,
    startPTT,
    endPTT,
    cancelPTT,
    stopPlayback,
  };
}

export default useRoomAI;
