/**
 * useSharedAI Hook
 *
 * React hook for client-side integration with shared AI sessions.
 * Subscribes to AI state events, receives broadcasted audio, and handles reconnection.
 *
 * Part of the Long-Horizon Engineering Protocol - FEAT-303
 */

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SignalingClient } from "@/lib/signaling/client";
import type { PeerId } from "@/types/peer";
import type { RoomId } from "@/types/room";
import type {
  AIResponseState,
  RoomAIState,
  AIStateEvent,
} from "@/types/voice-mode";

/**
 * AI audio chunk received from broadcast
 */
export interface AIAudioChunk {
  /** Unique chunk ID */
  chunkId: string;
  /** Sequence number for ordering */
  sequenceNumber: number;
  /** Audio data (PCM16 ArrayBuffer) */
  data: ArrayBuffer;
  /** When chunk was received */
  receivedAt: number;
  /** Duration in milliseconds */
  durationMs: number;
  /** Whether this is the first chunk */
  isFirst: boolean;
  /** Whether this is the last chunk */
  isLast: boolean;
}

/**
 * Response info from broadcast
 */
export interface AIResponseInfo {
  /** Unique response ID */
  responseId: string;
  /** Peer who triggered this response */
  triggerPeerId: PeerId;
  /** Synchronized playback start time */
  syncedStartTime: number;
  /** Total chunks received */
  totalChunks: number;
  /** Total duration received */
  totalDurationMs: number;
}

/**
 * Shared AI session state
 */
export interface SharedAIState {
  /** Whether connected to AI session */
  isConnected: boolean;
  /** Current AI state */
  aiState: AIResponseState;
  /** Whether AI session is healthy */
  isSessionHealthy: boolean;
  /** Current speaker (peer addressing AI) */
  currentSpeakerId: PeerId | null;
  /** Current speaker's display name */
  currentSpeakerName: string | null;
  /** Whether AI is currently responding */
  isResponding: boolean;
  /** Current response info */
  currentResponse: AIResponseInfo | null;
  /** Last error message */
  lastError: string | null;
  /** Reconnection attempt count */
  reconnectAttempts: number;
}

/**
 * Audio playback state
 */
export interface AudioPlaybackState {
  /** Whether audio is playing */
  isPlaying: boolean;
  /** Current playback position (ms) */
  playbackPosition: number;
  /** Total buffered duration (ms) */
  bufferedDuration: number;
  /** Number of chunks in buffer */
  chunksBuffered: number;
  /** Whether playback is ready to start */
  isReady: boolean;
}

/**
 * useSharedAI options
 */
export interface UseSharedAIOptions {
  /** Signaling client for server communication */
  signalingClient?: SignalingClient | null;
  /** Current room ID */
  roomId?: RoomId;
  /** Local peer ID */
  localPeerId?: PeerId;
  /** Auto-reconnect on disconnect (default: true) */
  autoReconnect?: boolean;
  /** Max reconnect attempts (default: 5) */
  maxReconnectAttempts?: number;
  /** Buffer size before playback starts (ms, default: 200) */
  playbackBufferMs?: number;
  /** Sample rate for audio playback (default: 24000) */
  sampleRate?: number;
}

/**
 * useSharedAI callbacks
 */
export interface UseSharedAICallbacks {
  /** Called when AI state changes */
  onAIStateChange?: (
    state: AIResponseState,
    previousState?: AIResponseState,
  ) => void;
  /** Called when AI starts responding */
  onResponseStart?: (response: AIResponseInfo) => void;
  /** Called when AI response ends */
  onResponseEnd?: (response: AIResponseInfo) => void;
  /** Called when audio chunk is received */
  onAudioChunk?: (chunk: AIAudioChunk) => void;
  /** Called when audio playback starts */
  onPlaybackStart?: () => void;
  /** Called when audio playback ends */
  onPlaybackEnd?: () => void;
  /** Called when session connects */
  onSessionConnect?: () => void;
  /** Called when session disconnects */
  onSessionDisconnect?: () => void;
  /** Called when reconnection starts */
  onReconnecting?: (attempt: number) => void;
  /** Called on error */
  onError?: (error: string) => void;
}

/**
 * useSharedAI actions
 */
export interface UseSharedAIActions {
  /** Start audio playback */
  startPlayback: () => void;
  /** Stop audio playback */
  stopPlayback: () => void;
  /** Pause audio playback */
  pausePlayback: () => void;
  /** Resume audio playback */
  resumePlayback: () => void;
  /** Clear audio buffer */
  clearBuffer: () => void;
  /** Set playback volume (0-1) */
  setVolume: (volume: number) => void;
  /** Get current volume */
  getVolume: () => number;
  /** Mute audio */
  mute: () => void;
  /** Unmute audio */
  unmute: () => void;
  /** Mark as ready for playback (tells server) */
  markReady: () => void;
  /** Force reconnect to AI session */
  reconnect: () => Promise<void>;
}

/**
 * Default options
 */
const DEFAULT_OPTIONS: Required<
  Omit<UseSharedAIOptions, "signalingClient" | "roomId" | "localPeerId">
> = {
  autoReconnect: true,
  maxReconnectAttempts: 5,
  playbackBufferMs: 200,
  sampleRate: 24000,
};

/**
 * Default state
 */
const DEFAULT_STATE: SharedAIState = {
  isConnected: false,
  aiState: "idle",
  isSessionHealthy: true,
  currentSpeakerId: null,
  currentSpeakerName: null,
  isResponding: false,
  currentResponse: null,
  lastError: null,
  reconnectAttempts: 0,
};

/**
 * Default playback state
 */
const DEFAULT_PLAYBACK_STATE: AudioPlaybackState = {
  isPlaying: false,
  playbackPosition: 0,
  bufferedDuration: 0,
  chunksBuffered: 0,
  isReady: false,
};

/**
 * useSharedAI Hook
 *
 * Provides client-side integration with shared AI sessions.
 *
 * @example
 * ```tsx
 * const {
 *   state,
 *   playback,
 *   startPlayback,
 *   stopPlayback,
 *   setVolume,
 * } = useSharedAI({
 *   signalingClient,
 *   roomId: 'room-123',
 *   localPeerId: 'peer-1',
 * }, {
 *   onResponseStart: () => console.log('AI is responding'),
 *   onAudioChunk: (chunk) => console.log(`Received chunk ${chunk.sequenceNumber}`),
 * });
 *
 * return (
 *   <div>
 *     <p>AI State: {state.aiState}</p>
 *     {state.isResponding && (
 *       <p>Responding to: {state.currentSpeakerName}</p>
 *     )}
 *     {playback.isPlaying && (
 *       <p>Playing: {playback.playbackPosition}ms / {playback.bufferedDuration}ms</p>
 *     )}
 *   </div>
 * );
 * ```
 */
export function useSharedAI(
  options: UseSharedAIOptions = {},
  callbacks: UseSharedAICallbacks = {},
): {
  state: SharedAIState;
  playback: AudioPlaybackState;
} & UseSharedAIActions {
  const {
    signalingClient,
    roomId,
    localPeerId,
    autoReconnect = DEFAULT_OPTIONS.autoReconnect,
    maxReconnectAttempts = DEFAULT_OPTIONS.maxReconnectAttempts,
    playbackBufferMs = DEFAULT_OPTIONS.playbackBufferMs,
    sampleRate = DEFAULT_OPTIONS.sampleRate,
  } = options;

  // Destructure callbacks
  const {
    onAIStateChange,
    onResponseStart,
    onResponseEnd,
    onAudioChunk,
    onPlaybackStart,
    onPlaybackEnd,
    onSessionConnect,
    onSessionDisconnect,
    onReconnecting,
    onError,
  } = callbacks;

  // State
  const [state, setState] = useState<SharedAIState>(DEFAULT_STATE);
  const [playback, setPlayback] = useState<AudioPlaybackState>(
    DEFAULT_PLAYBACK_STATE,
  );

  // Audio buffer and context
  const audioBufferRef = useRef<AIAudioChunk[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const volumeRef = useRef(1.0);
  const isMutedRef = useRef(false);
  const gainNodeRef = useRef<GainNode | null>(null);
  const isPlayingRef = useRef(false);
  const playbackPositionRef = useRef(0);
  const nextPlaybackTimeRef = useRef(0); // Track when next chunk should start
  const isInterruptedRef = useRef(false); // Block audio during PTT

  // Callback refs
  const onAIStateChangeRef = useRef(onAIStateChange);
  const onResponseStartRef = useRef(onResponseStart);
  const onResponseEndRef = useRef(onResponseEnd);
  const onAudioChunkRef = useRef(onAudioChunk);
  const onPlaybackStartRef = useRef(onPlaybackStart);
  const onPlaybackEndRef = useRef(onPlaybackEnd);
  const onSessionConnectRef = useRef(onSessionConnect);
  const onSessionDisconnectRef = useRef(onSessionDisconnect);
  const onReconnectingRef = useRef(onReconnecting);
  const onErrorRef = useRef(onError);

  // Keep callback refs updated
  useEffect(() => {
    onAIStateChangeRef.current = onAIStateChange;
    onResponseStartRef.current = onResponseStart;
    onResponseEndRef.current = onResponseEnd;
    onAudioChunkRef.current = onAudioChunk;
    onPlaybackStartRef.current = onPlaybackStart;
    onPlaybackEndRef.current = onPlaybackEnd;
    onSessionConnectRef.current = onSessionConnect;
    onSessionDisconnectRef.current = onSessionDisconnect;
    onReconnectingRef.current = onReconnecting;
    onErrorRef.current = onError;
  }, [
    onAIStateChange,
    onResponseStart,
    onResponseEnd,
    onAudioChunk,
    onPlaybackStart,
    onPlaybackEnd,
    onSessionConnect,
    onSessionDisconnect,
    onReconnecting,
    onError,
  ]);

  /**
   * Initialize audio context
   */
  const initAudioContext = useCallback(() => {
    if (audioContextRef.current) return;

    try {
      audioContextRef.current = new AudioContext({ sampleRate });
      gainNodeRef.current = audioContextRef.current.createGain();
      gainNodeRef.current.connect(audioContextRef.current.destination);
      gainNodeRef.current.gain.value = isMutedRef.current
        ? 0
        : volumeRef.current;
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to create audio context";
      onErrorRef.current?.(message);
    }
  }, [sampleRate]);

  /**
   * Update playback state
   */
  const updatePlaybackState = useCallback(() => {
    const buffer = audioBufferRef.current;
    const totalDuration = buffer.reduce(
      (acc, chunk) => acc + chunk.durationMs,
      0,
    );

    setPlayback({
      isPlaying: isPlayingRef.current,
      playbackPosition: playbackPositionRef.current,
      bufferedDuration: totalDuration,
      chunksBuffered: buffer.length,
      isReady: totalDuration >= playbackBufferMs,
    });
  }, [playbackBufferMs]);

  /**
   * Handle incoming audio chunk
   */
  const handleAudioChunk = useCallback(
    (chunk: AIAudioChunk) => {
      audioBufferRef.current.push(chunk);
      onAudioChunkRef.current?.(chunk);
      updatePlaybackState();
    },
    [updatePlaybackState],
  );

  /**
   * Play audio chunk with proper scheduling (streaming playback)
   */
  const playAudioChunk = useCallback(
    async (chunk: AIAudioChunk) => {
      try {
        // Block audio playback if interrupted (PTT is active)
        if (isInterruptedRef.current) {
          return;
        }

        // Initialize audio context if needed
        if (!audioContextRef.current) {
          audioContextRef.current = new AudioContext({ sampleRate });
          gainNodeRef.current = audioContextRef.current.createGain();
          gainNodeRef.current.connect(audioContextRef.current.destination);
          gainNodeRef.current.gain.value = isMutedRef.current
            ? 0
            : volumeRef.current;
        }

        const audioContext = audioContextRef.current;

        // Resume if suspended (requires user interaction)
        if (audioContext.state === "suspended") {
          await audioContext.resume();
        }

        // Decode PCM16 to Float32
        const pcm16 = new Int16Array(chunk.data);
        const float32 = new Float32Array(pcm16.length);
        for (let i = 0; i < pcm16.length; i++) {
          float32[i] = pcm16[i] / 32768;
        }

        // Create audio buffer
        const audioBuffer = audioContext.createBuffer(
          1,
          float32.length,
          sampleRate,
        );
        audioBuffer.getChannelData(0).set(float32);

        // Play buffer with proper scheduling
        const source = audioContext.createBufferSource();
        source.buffer = audioBuffer;

        if (gainNodeRef.current) {
          source.connect(gainNodeRef.current);
        } else {
          source.connect(audioContext.destination);
        }

        // Schedule this chunk to play after previous chunks
        const currentTime = audioContext.currentTime;
        const startTime = Math.max(currentTime, nextPlaybackTimeRef.current);
        const duration = audioBuffer.duration;

        source.start(startTime);

        // Update next playback time for the following chunk
        nextPlaybackTimeRef.current = startTime + duration;

        // Mark as playing on first chunk
        if (!isPlayingRef.current && chunk.isFirst) {
          isPlayingRef.current = true;
          // Reset playback time tracking for new response
          nextPlaybackTimeRef.current = currentTime + duration;
          onPlaybackStartRef.current?.();
          updatePlaybackState();
        }
      } catch (error) {
        console.error("[useSharedAI] Failed to play audio chunk:", error);
      }
    },
    [sampleRate, updatePlaybackState],
  );

  /**
   * Handle AI state event
   */
  const handleAIStateEvent = useCallback(
    (event: AIStateEvent) => {
      const previousState = state.aiState;
      const newAIState = event.state.state;

      setState((prev) => ({
        ...prev,
        aiState: newAIState,
        isSessionHealthy: event.state.isSessionHealthy,
        currentSpeakerId: event.state.activeSpeakerId ?? null,
        currentSpeakerName: event.state.activeSpeakerName ?? null,
        isResponding: newAIState === "speaking",
        lastError: event.state.lastError ?? null,
      }));

      // Notify state change
      if (newAIState !== previousState) {
        onAIStateChangeRef.current?.(newAIState, previousState);
      }

      // Handle errors
      if (event.type === "ai:error") {
        onErrorRef.current?.(event.state.lastError ?? "Unknown error");
      }
    },
    [state.aiState],
  );

  /**
   * Handle response start
   */
  const handleResponseStart = useCallback((info: AIResponseInfo) => {
    setState((prev) => ({
      ...prev,
      isResponding: true,
      currentResponse: info,
    }));
    onResponseStartRef.current?.(info);
  }, []);

  /**
   * Handle response end
   */
  const handleResponseEnd = useCallback((info: AIResponseInfo) => {
    setState((prev) => ({
      ...prev,
      isResponding: false,
      currentResponse: null,
    }));
    onResponseEndRef.current?.(info);
  }, []);

  /**
   * Handle session connect
   */
  const handleSessionConnect = useCallback(() => {
    setState((prev) => ({
      ...prev,
      isConnected: true,
      reconnectAttempts: 0,
    }));
    onSessionConnectRef.current?.();
  }, []);

  /**
   * Handle session disconnect
   */
  const handleSessionDisconnect = useCallback(() => {
    setState((prev) => ({
      ...prev,
      isConnected: false,
    }));
    onSessionDisconnectRef.current?.();
  }, []);

  /**
   * Subscribe to signaling events
   */
  useEffect(() => {
    if (!signalingClient || !roomId) return;

    // Define event handlers
    const onAIState = (event: AIStateEvent) => {
      if (event.roomId === roomId) {
        // Clear interrupt flag when transitioning to processing (PTT ended)
        // This allows audio to play for the new response
        if (event.state.state === "processing") {
          isInterruptedRef.current = false;
        }
        handleAIStateEvent(event);
      }
    };

    // Handle direct base64 audio from server (FEAT-413)
    const onAudioBase64 = (audioBase64: string) => {
      try {
        // Decode base64 to ArrayBuffer
        const binaryString = atob(audioBase64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }

        const chunk: AIAudioChunk = {
          chunkId: `chunk-${Date.now()}`,
          sequenceNumber: audioBufferRef.current.length,
          data: bytes.buffer,
          receivedAt: Date.now(),
          durationMs: bytes.length / 2 / (sampleRate / 1000), // PCM16 bytes to duration
          isFirst: audioBufferRef.current.length === 0,
          isLast: false,
        };

        handleAudioChunk(chunk);
        playAudioChunk(chunk);
      } catch (error) {
        console.error("[useSharedAI] Failed to decode audio:", error);
      }
    };

    // Legacy structured audio data format
    const onAudioData = (data: {
      roomId: RoomId;
      chunk: AIAudioChunk;
      response: AIResponseInfo;
    }) => {
      if (data.roomId === roomId) {
        if (data.chunk.isFirst) {
          handleResponseStart(data.response);
        }
        handleAudioChunk(data.chunk);
        if (data.chunk.isLast) {
          handleResponseEnd(data.response);
        }
      }
    };

    const onConnect = () => {
      handleSessionConnect();
    };

    const onDisconnect = () => {
      handleSessionDisconnect();
    };

    // Handle voice interrupt - immediately stop all audio playback
    const onInterrupted = (data: {
      roomId: string;
      interruptedBy: string;
      interruptedByName: string;
      reason: string;
      previousState: string;
    }) => {
      if (data.roomId === roomId) {
        console.log(
          `[useSharedAI] Voice interrupt received from ${data.interruptedByName}: ${data.reason}`,
        );

        // Set interrupted flag FIRST to block any new audio from being played
        isInterruptedRef.current = true;

        // Immediately stop audio playback by closing and recreating audio context
        // This is the only way to stop already-scheduled audio
        if (audioContextRef.current) {
          try {
            audioContextRef.current.close();
          } catch {
            // Already closed
          }
          audioContextRef.current = null;
          gainNodeRef.current = null;
        }

        // Clear all refs
        isPlayingRef.current = false;
        playbackPositionRef.current = 0;
        nextPlaybackTimeRef.current = 0;
        audioBufferRef.current = [];

        // Update state
        setState((prev) => ({
          ...prev,
          aiState: "idle",
          isResponding: false,
          currentResponse: null,
          currentSpeakerId: null,
          currentSpeakerName: null,
        }));

        setPlayback({
          isPlaying: false,
          playbackPosition: 0,
          bufferedDuration: 0,
          chunksBuffered: 0,
          isReady: false,
        });

        // Call playback end callback
        onPlaybackEndRef.current?.();
      }
    };

    // Subscribe to AI events (these are extended events not in base SignalingEventHandlers)
    const client = signalingClient as any;
    const socket = client.getSocket?.();

    if (socket) {
      socket.on("ai:state", onAIState);
      socket.on("ai:audio", onAudioBase64); // Direct base64 audio from server
      socket.on("ai:audio_data", onAudioData); // Legacy structured format
      socket.on("ai:interrupted", onInterrupted); // Voice interrupt handler
    }

    client.on("onConnect", onConnect);
    client.on("onDisconnect", onDisconnect);

    // Check initial connection
    if (client.getConnectionState?.() === "connected") {
      handleSessionConnect();
    }

    return () => {
      if (socket) {
        socket.off("ai:state", onAIState);
        socket.off("ai:audio", onAudioBase64);
        socket.off("ai:audio_data", onAudioData);
        socket.off("ai:interrupted", onInterrupted);
      }
      client.off("onConnect", onConnect);
      client.off("onDisconnect", onDisconnect);
    };
  }, [
    signalingClient,
    roomId,
    sampleRate,
    handleAIStateEvent,
    handleAudioChunk,
    playAudioChunk,
    handleResponseStart,
    handleResponseEnd,
    handleSessionConnect,
    handleSessionDisconnect,
  ]);

  // ========== Actions ==========

  /**
   * Start audio playback
   */
  const startPlayback = useCallback(() => {
    initAudioContext();
    isPlayingRef.current = true;
    playbackPositionRef.current = 0;
    updatePlaybackState();
    onPlaybackStartRef.current?.();
  }, [initAudioContext, updatePlaybackState]);

  /**
   * Stop audio playback
   */
  const stopPlayback = useCallback(() => {
    isPlayingRef.current = false;
    playbackPositionRef.current = 0;
    nextPlaybackTimeRef.current = 0; // Reset scheduling
    audioBufferRef.current = [];
    updatePlaybackState();
    onPlaybackEndRef.current?.();
  }, [updatePlaybackState]);

  /**
   * Pause audio playback
   */
  const pausePlayback = useCallback(() => {
    isPlayingRef.current = false;
    updatePlaybackState();
  }, [updatePlaybackState]);

  /**
   * Resume audio playback
   */
  const resumePlayback = useCallback(() => {
    isPlayingRef.current = true;
    updatePlaybackState();
  }, [updatePlaybackState]);

  /**
   * Clear audio buffer
   */
  const clearBuffer = useCallback(() => {
    audioBufferRef.current = [];
    playbackPositionRef.current = 0;
    nextPlaybackTimeRef.current = 0; // Reset scheduling
    updatePlaybackState();
  }, [updatePlaybackState]);

  /**
   * Set playback volume
   */
  const setVolume = useCallback((volume: number) => {
    const clampedVolume = Math.max(0, Math.min(1, volume));
    volumeRef.current = clampedVolume;

    if (gainNodeRef.current && !isMutedRef.current) {
      gainNodeRef.current.gain.value = clampedVolume;
    }
  }, []);

  /**
   * Get current volume
   */
  const getVolume = useCallback((): number => {
    return volumeRef.current;
  }, []);

  /**
   * Mute audio
   */
  const mute = useCallback(() => {
    isMutedRef.current = true;
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = 0;
    }
  }, []);

  /**
   * Unmute audio
   */
  const unmute = useCallback(() => {
    isMutedRef.current = false;
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = volumeRef.current;
    }
  }, []);

  /**
   * Mark as ready for playback
   */
  const markReady = useCallback(() => {
    if (!signalingClient || !roomId || !localPeerId) return;

    // Tell server we're ready for playback
    (
      signalingClient as unknown as {
        emit: (event: string, data: unknown) => void;
      }
    ).emit("ai:ready", { roomId, peerId: localPeerId });
  }, [signalingClient, roomId, localPeerId]);

  /**
   * Force reconnect to AI session
   */
  const reconnect = useCallback(async (): Promise<void> => {
    if (!signalingClient || !roomId) return;

    setState((prev) => ({
      ...prev,
      reconnectAttempts: prev.reconnectAttempts + 1,
    }));

    onReconnectingRef.current?.(state.reconnectAttempts + 1);

    // Request reconnection via signaling
    (
      signalingClient as unknown as {
        emit: (event: string, data: unknown) => void;
      }
    ).emit("ai:reconnect", { roomId });
  }, [signalingClient, roomId, state.reconnectAttempts]);

  /**
   * Cleanup on unmount
   */
  useEffect(() => {
    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }
      gainNodeRef.current = null;
      audioBufferRef.current = [];
    };
  }, []);

  return {
    state,
    playback,
    startPlayback,
    stopPlayback,
    pausePlayback,
    resumePlayback,
    clearBuffer,
    setVolume,
    getVolume,
    mute,
    unmute,
    markReady,
    reconnect,
  };
}

/**
 * Factory function for creating shared AI hook
 */
export function createSharedAI(
  options?: UseSharedAIOptions,
  callbacks?: UseSharedAICallbacks,
) {
  return () => useSharedAI(options, callbacks);
}

export default useSharedAI;
