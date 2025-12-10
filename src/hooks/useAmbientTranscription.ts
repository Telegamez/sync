/**
 * useAmbientTranscription Hook
 *
 * Client-side speech recognition for ambient (non-PTT) conversations.
 * Uses Web Speech API for real-time transcription and sends results to server.
 *
 * Part of the Long-Horizon Engineering Protocol - FEAT-502
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SignalingClient } from "@/lib/signaling/client";
import type { RoomId } from "@/types/room";
import type { PeerId } from "@/types/peer";

/**
 * Speech recognition result
 */
interface SpeechResult {
  transcript: string;
  isFinal: boolean;
  confidence: number;
}

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
  /** Whether transcription is active */
  isActive: boolean;
  /** Whether speech recognition is supported */
  isSupported: boolean;
  /** Current partial transcript */
  partialTranscript: string;
  /** Error message if any */
  error: string | null;
  /** Start transcription */
  start: () => void;
  /** Stop transcription */
  stop: () => void;
  /** Toggle transcription */
  toggle: () => void;
}

/**
 * Web Speech API type declarations
 * These are available in modern browsers but not in TypeScript's default lib
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

/**
 * Window augmentation for Speech Recognition API
 */
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
 * Provides client-side speech recognition for ambient conversations.
 * Results are sent to the server for storage in the transcript.
 *
 * @example
 * ```tsx
 * const {
 *   isActive,
 *   isSupported,
 *   partialTranscript,
 *   start,
 *   stop,
 * } = useAmbientTranscription({
 *   roomId: "room-123",
 *   peerId: "peer-456",
 *   displayName: "Alice",
 *   client: signalingClient,
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
  const restartTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  // Track actual running state to prevent race conditions
  const isRunningRef = useRef(false);
  // Refs for pause state to avoid stale closures in callbacks
  const isPTTActiveRef = useRef(isPTTActive);
  const isAISpeakingRef = useRef(isAISpeaking);

  // Keep refs in sync with props
  isPTTActiveRef.current = isPTTActive;
  isAISpeakingRef.current = isAISpeaking;

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
          `[AmbientTranscription] Sent final transcript: "${transcript.substring(0, 50)}..."`,
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
          // Only send if confidence meets threshold
          if (confidence >= minConfidence || confidence === 0) {
            // confidence 0 means not available
            finalTranscript += transcript;
          }
        } else {
          interimTranscript += transcript;
        }
      }

      // Update partial transcript display
      setPartialTranscript(interimTranscript);

      // Send final transcript to server
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
        // Normal - no speech detected, will restart automatically
        // Don't log this as it's expected when user isn't speaking
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
   */
  const handleEnd = useCallback(() => {
    isRunningRef.current = false;
    setIsActive(false);

    // Auto-restart if should be active, not PTT, and AI not speaking
    // Use refs to get current values and avoid stale closures
    const shouldPause =
      isPTTActiveRef.current || isAISpeakingRef.current || !enabled;

    if (shouldBeActiveRef.current && !shouldPause) {
      // Small delay before restart to avoid rapid restart loops
      restartTimeoutRef.current = setTimeout(() => {
        // Re-check conditions using refs for fresh values
        const stillShouldPause =
          isPTTActiveRef.current || isAISpeakingRef.current;

        if (
          recognitionRef.current &&
          shouldBeActiveRef.current &&
          !isRunningRef.current &&
          !stillShouldPause
        ) {
          try {
            recognitionRef.current.start();
            isRunningRef.current = true;
            setIsActive(true);
            console.log("[AmbientTranscription] Auto-restarted after end");
          } catch (err) {
            isRunningRef.current = false;
            // Ignore - may already be started
          }
        }
      }, 500); // Increased delay to prevent rapid restarts
    }
  }, [enabled]); // Only depend on enabled - use refs for PTT/AI state

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
      if (restartTimeoutRef.current) {
        clearTimeout(restartTimeoutRef.current);
      }
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
   * Pause during PTT or AI speaking
   * This prevents the Web Speech API from picking up:
   * 1. PTT audio being sent to AI (would create duplicates)
   * 2. AI audio playback through speakers (acoustic echo feedback)
   */
  useEffect(() => {
    if (!recognitionRef.current) return;

    const shouldPause = isPTTActive || isAISpeaking;

    if (shouldPause && isRunningRef.current) {
      // Clear any pending restart timeouts
      if (restartTimeoutRef.current) {
        clearTimeout(restartTimeoutRef.current);
        restartTimeoutRef.current = null;
      }

      // Pause ambient transcription during PTT or AI speaking
      try {
        recognitionRef.current.stop();
        isRunningRef.current = false;
        setIsActive(false);
        console.log(
          `[AmbientTranscription] Paused - ${isPTTActive ? "PTT active" : "AI speaking"}`,
        );
      } catch {
        // Ignore
      }
    } else if (
      !shouldPause &&
      shouldBeActiveRef.current &&
      !isRunningRef.current
    ) {
      // Clear any pending restart timeouts first
      if (restartTimeoutRef.current) {
        clearTimeout(restartTimeoutRef.current);
        restartTimeoutRef.current = null;
      }

      // Resume after PTT ends and AI stops speaking (with delay to avoid race)
      restartTimeoutRef.current = setTimeout(() => {
        // Use refs for fresh values
        if (
          recognitionRef.current &&
          shouldBeActiveRef.current &&
          !isRunningRef.current &&
          !isPTTActiveRef.current &&
          !isAISpeakingRef.current
        ) {
          try {
            recognitionRef.current.start();
            isRunningRef.current = true;
            setIsActive(true);
            console.log("[AmbientTranscription] Resumed after pause");
          } catch {
            isRunningRef.current = false;
          }
        }
      }, 500); // Longer delay to let audio buffers drain
    }
  }, [isPTTActive, isAISpeaking]);

  /**
   * Start transcription
   */
  const start = useCallback(() => {
    if (!isSupported || !recognitionRef.current || !enabled) return;
    if (isRunningRef.current) return; // Already running

    // Don't start if PTT or AI is speaking - set the flag and let the effect handle resume
    const shouldPause = isPTTActiveRef.current || isAISpeakingRef.current;

    shouldBeActiveRef.current = true;
    setError(null);

    if (shouldPause) {
      // Don't actually start, just mark that we want to be active
      // The pause/resume effect will start us when conditions allow
      console.log(
        "[AmbientTranscription] Start requested but paused (PTT/AI speaking)",
      );
      return;
    }

    try {
      recognitionRef.current.start();
      isRunningRef.current = true;
      setIsActive(true);
      console.log("[AmbientTranscription] Started");
    } catch (err) {
      isRunningRef.current = false;
      // May already be started - don't spam console
    }
  }, [isSupported, enabled]);

  /**
   * Stop transcription
   */
  const stop = useCallback(() => {
    shouldBeActiveRef.current = false;

    if (restartTimeoutRef.current) {
      clearTimeout(restartTimeoutRef.current);
      restartTimeoutRef.current = null;
    }

    if (!recognitionRef.current) return;

    try {
      recognitionRef.current.stop();
      isRunningRef.current = false;
      setIsActive(false);
      setPartialTranscript("");
      console.log("[AmbientTranscription] Stopped");
    } catch {
      isRunningRef.current = false;
    }
  }, []);

  /**
   * Toggle transcription
   */
  const toggle = useCallback(() => {
    if (isActive) {
      stop();
    } else {
      start();
    }
  }, [isActive, start, stop]);

  return {
    isActive,
    isSupported,
    partialTranscript,
    error,
    start,
    stop,
    toggle,
  };
}

export default useAmbientTranscription;
