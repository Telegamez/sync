/**
 * useAmbientTranscription Hook
 *
 * Client-side speech recognition for ambient (non-PTT) conversations.
 * Uses Silero VAD to gate Web Speech API - only starts recognition when voice detected.
 * Sends results to server for storage in the transcript.
 *
 * Part of the Long-Horizon Engineering Protocol - FEAT-502, FEAT-514
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SignalingClient } from "@/lib/signaling/client";
import type { RoomId } from "@/types/room";
import type { PeerId } from "@/types/peer";
import { useSileroVAD } from "./useSileroVAD";

/**
 * Transcription state for UI indicators
 */
export type TranscriptionState =
  | "idle"
  | "listening"
  | "transcribing"
  | "paused";

/**
 * Hook options
 */
export interface UseAmbientTranscriptionOptions {
  /** Room ID */
  roomId: RoomId;
  /** Local peer ID */
  peerId: PeerId | null;
  /** Display name for attribution */
  displayName: string;
  /** Signaling client instance */
  client: SignalingClient | null;
  /** Local audio stream for VAD monitoring */
  localStream: MediaStream | null;
  /** Whether transcription is enabled */
  enabled?: boolean;
  /** Language for recognition (default: en-US) */
  language?: string;
  /** Minimum confidence threshold (0-1) */
  minConfidence?: number;
  /** Whether PTT is currently active (pause ambient during PTT) */
  isPTTActive?: boolean;
  /** Whether AI is currently speaking (pause ambient to avoid echo feedback) */
  isAISpeaking?: boolean;
}

/**
 * Hook return type
 */
export interface UseAmbientTranscriptionReturn {
  /** Whether transcription is active (recognition running) */
  isActive: boolean;
  /** Whether speech recognition is supported */
  isSupported: boolean;
  /** Current transcription state for UI */
  transcriptionState: TranscriptionState;
  /** Whether VAD is ready */
  isVADReady: boolean;
  /** Current partial transcript */
  partialTranscript: string;
  /** Error message if any */
  error: string | null;
  /** Start transcription (enables VAD monitoring) */
  start: () => void;
  /** Stop transcription */
  stop: () => void;
  /** Toggle transcription */
  toggle: () => void;
}

/**
 * Web Speech API type declarations
 */
interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionResultList {
  length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  isFinal: boolean;
  length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message: string;
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

interface SpeechRecognitionConstructor {
  new (): SpeechRecognition;
}

interface WindowWithSpeechRecognition extends Window {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
}

/**
 * Check if Web Speech API is supported
 */
function isSpeechRecognitionSupported(): boolean {
  if (typeof window === "undefined") return false;
  const win = window as WindowWithSpeechRecognition;
  return !!(win.SpeechRecognition || win.webkitSpeechRecognition);
}

/**
 * Get SpeechRecognition constructor
 */
function getSpeechRecognition(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const win = window as WindowWithSpeechRecognition;
  return win.SpeechRecognition || win.webkitSpeechRecognition || null;
}

/**
 * useAmbientTranscription hook
 *
 * VAD-gated speech recognition for ambient conversations.
 * Uses Silero VAD to detect when user starts speaking, then activates Web Speech API.
 * Recognition ends naturally when user stops speaking - no restart loops.
 *
 * @example
 * ```tsx
 * const {
 *   isActive,
 *   isSupported,
 *   transcriptionState,
 *   partialTranscript,
 *   start,
 *   stop,
 * } = useAmbientTranscription({
 *   roomId: "room-123",
 *   peerId: "peer-456",
 *   displayName: "Alice",
 *   client: signalingClient,
 *   localStream: audioStream,
 *   enabled: true,
 * });
 * ```
 */
export function useAmbientTranscription(
  options: UseAmbientTranscriptionOptions,
): UseAmbientTranscriptionReturn {
  const {
    roomId,
    peerId,
    displayName,
    client,
    localStream,
    enabled = true,
    language = "en-US",
    minConfidence = 0.7,
    isPTTActive = false,
    isAISpeaking = false,
  } = options;

  // State
  const [isActive, setIsActive] = useState(false);
  const [partialTranscript, setPartialTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Refs
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const isSupported = isSpeechRecognitionSupported();
  const shouldBeActiveRef = useRef(false);
  const isRecognizingRef = useRef(false);

  // Determine if we should pause (PTT or AI speaking)
  const shouldPause = isPTTActive || isAISpeaking;

  // VAD should be enabled when:
  // 1. User wants transcription active (shouldBeActiveRef)
  // 2. Transcription is enabled
  // 3. We have a stream
  // 4. Not paused for PTT/AI
  const vadEnabled = enabled && !shouldPause && shouldBeActiveRef.current;

  /**
   * Handle VAD speech start - begin recognition
   */
  const handleVADSpeechStart = useCallback(() => {
    if (!recognitionRef.current || !shouldBeActiveRef.current) return;
    if (isRecognizingRef.current) return; // Already recognizing

    try {
      recognitionRef.current.start();
      isRecognizingRef.current = true;
      setIsActive(true);
      console.log("[AmbientTranscription] VAD triggered - recognition started");
    } catch (err) {
      // May already be started - ignore
      console.warn("[AmbientTranscription] Failed to start recognition:", err);
    }
  }, []);

  /**
   * Handle VAD speech end - let recognition end naturally
   * We don't force stop here because Web Speech API may still be processing
   */
  const handleVADSpeechEnd = useCallback((durationMs: number) => {
    console.log(`[AmbientTranscription] VAD speech ended (${durationMs}ms)`);
    // Recognition will end naturally via onend - no action needed
  }, []);

  // Initialize Silero VAD
  const vad = useSileroVAD({
    stream: localStream,
    enabled: vadEnabled,
    // Use longer redemptionMs than usesyncRealtime since we don't need fast commit signals
    redemptionMs: 800, // 800ms silence before triggering end
    minSpeechMs: 200, // Minimum 200ms of speech
    onSpeechStart: handleVADSpeechStart,
    onSpeechEnd: handleVADSpeechEnd,
  });

  /**
   * Send transcript to server
   */
  const sendTranscript = useCallback(
    (transcript: string, isFinal: boolean) => {
      if (!client || !roomId || !peerId || !transcript.trim()) return;

      client.sendAmbientTranscript({
        roomId,
        peerId,
        displayName,
        transcript: transcript.trim(),
        isFinal,
        timestamp: new Date().toISOString(),
      });

      if (isFinal) {
        console.log(
          `[AmbientTranscription] Sent: "${transcript.substring(0, 50)}${transcript.length > 50 ? "..." : ""}"`,
        );
      }
    },
    [client, roomId, peerId, displayName],
  );

  /**
   * Handle speech recognition result
   */
  const handleResult = useCallback(
    (event: SpeechRecognitionEvent) => {
      const results = event.results;
      let finalTranscript = "";
      let interimTranscript = "";

      for (let i = event.resultIndex; i < results.length; i++) {
        const result = results[i];
        const transcript = result[0].transcript;
        const confidence = result[0].confidence;

        if (result.isFinal) {
          // Only send if confidence meets threshold (0 means not available)
          if (confidence >= minConfidence || confidence === 0) {
            finalTranscript += transcript;
          }
        } else {
          interimTranscript += transcript;
        }
      }

      setPartialTranscript(interimTranscript);

      if (finalTranscript) {
        sendTranscript(finalTranscript, true);
        setPartialTranscript("");
      }
    },
    [minConfidence, sendTranscript],
  );

  /**
   * Handle speech recognition error
   */
  const handleError = useCallback((event: SpeechRecognitionErrorEvent) => {
    switch (event.error) {
      case "no-speech":
        // Normal - no speech detected, VAD will trigger next recognition
        break;
      case "aborted":
        // User or system stopped recognition - expected during PTT
        break;
      case "audio-capture":
        console.warn("[AmbientTranscription] Microphone not available");
        setError("Microphone not available");
        break;
      case "not-allowed":
        console.warn("[AmbientTranscription] Microphone permission denied");
        setError("Microphone permission denied");
        break;
      case "network":
        console.warn("[AmbientTranscription] Network error");
        setError("Network error - check connection");
        break;
      default:
        console.error(
          "[AmbientTranscription] Error:",
          event.error,
          event.message,
        );
        setError(`Speech recognition error: ${event.error}`);
    }
  }, []);

  /**
   * Handle speech recognition end
   * VAD-gated: No auto-restart - VAD will trigger next recognition when voice detected
   */
  const handleEnd = useCallback(() => {
    isRecognizingRef.current = false;
    setIsActive(false);
    console.log("[AmbientTranscription] Recognition ended, waiting for VAD");
    // No restart logic - VAD will call handleVADSpeechStart when voice is detected again
  }, []);

  /**
   * Initialize speech recognition
   */
  useEffect(() => {
    if (!isSupported) return;

    const SpeechRecognitionClass = getSpeechRecognition();
    if (!SpeechRecognitionClass) return;

    const recognition = new SpeechRecognitionClass();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = language;
    recognition.maxAlternatives = 1;

    recognition.onresult = handleResult;
    recognition.onerror = handleError;
    recognition.onend = handleEnd;

    recognitionRef.current = recognition;

    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {
          // Ignore
        }
        recognitionRef.current = null;
      }
    };
  }, [isSupported, language, handleResult, handleError, handleEnd]);

  /**
   * Stop recognition when paused (PTT or AI speaking)
   */
  useEffect(() => {
    if (shouldPause && isRecognizingRef.current && recognitionRef.current) {
      try {
        recognitionRef.current.stop();
        isRecognizingRef.current = false;
        setIsActive(false);
        console.log(
          `[AmbientTranscription] Paused - ${isPTTActive ? "PTT active" : "AI speaking"}`,
        );
      } catch {
        // Ignore
      }
    }
  }, [shouldPause, isPTTActive]);

  /**
   * Start transcription (enables VAD monitoring)
   */
  const start = useCallback(() => {
    if (!isSupported || !enabled) return;
    if (shouldBeActiveRef.current) return; // Already active, don't log again

    shouldBeActiveRef.current = true;
    setError(null);
    console.log(
      "[AmbientTranscription] Enabled - VAD will trigger recognition on voice",
    );
  }, [isSupported, enabled]);

  /**
   * Stop transcription
   */
  const stop = useCallback(() => {
    shouldBeActiveRef.current = false;

    if (recognitionRef.current && isRecognizingRef.current) {
      try {
        recognitionRef.current.stop();
        isRecognizingRef.current = false;
        setIsActive(false);
        setPartialTranscript("");
        console.log("[AmbientTranscription] Stopped");
      } catch {
        isRecognizingRef.current = false;
      }
    }
  }, []);

  /**
   * Toggle transcription
   */
  const toggle = useCallback(() => {
    if (shouldBeActiveRef.current) {
      stop();
    } else {
      start();
    }
  }, [start, stop]);

  /**
   * Compute transcription state for UI
   */
  const transcriptionState: TranscriptionState = (() => {
    if (!shouldBeActiveRef.current || !enabled) return "idle";
    if (shouldPause) return "paused";
    if (isActive) return "transcribing";
    if (vad.isReady) return "listening";
    return "idle";
  })();

  return {
    isActive,
    isSupported,
    transcriptionState,
    isVADReady: vad.isReady,
    partialTranscript,
    error: error || vad.error,
    start,
    stop,
    toggle,
  };
}

export default useAmbientTranscription;
