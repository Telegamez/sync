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
    console.error("[AmbientTranscription] Error:", event.error, event.message);

    switch (event.error) {
      case "no-speech":
        // Normal - no speech detected, will restart automatically
        break;
      case "audio-capture":
        setError("Microphone not available");
        break;
      case "not-allowed":
        setError("Microphone permission denied");
        break;
      case "network":
        setError("Network error - check connection");
        break;
      case "aborted":
        // User or system stopped recognition
        break;
      default:
        setError(`Speech recognition error: ${event.error}`);
    }
  }, []);

  /**
   * Handle speech recognition end
   */
  const handleEnd = useCallback(() => {
    isRunningRef.current = false;
    setIsActive(false);

    // Auto-restart if should be active and not PTT
    if (shouldBeActiveRef.current && !isPTTActive && enabled) {
      // Small delay before restart to avoid rapid restart loops
      restartTimeoutRef.current = setTimeout(() => {
        if (
          recognitionRef.current &&
          shouldBeActiveRef.current &&
          !isRunningRef.current
        ) {
          try {
            recognitionRef.current.start();
            isRunningRef.current = true;
            setIsActive(true);
          } catch (err) {
            isRunningRef.current = false;
            // Ignore - may already be started
          }
        }
      }, 250); // Increased delay to prevent rapid restarts
    }
  }, [isPTTActive, enabled]);

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
   * Pause during PTT
   */
  useEffect(() => {
    if (!recognitionRef.current) return;

    if (isPTTActive && isRunningRef.current) {
      // Pause ambient transcription during PTT
      try {
        recognitionRef.current.stop();
        isRunningRef.current = false;
        setIsActive(false);
      } catch {
        // Ignore
      }
    } else if (
      !isPTTActive &&
      shouldBeActiveRef.current &&
      !isRunningRef.current
    ) {
      // Resume after PTT ends (with delay to avoid race)
      setTimeout(() => {
        if (
          recognitionRef.current &&
          shouldBeActiveRef.current &&
          !isRunningRef.current &&
          !isPTTActive
        ) {
          try {
            recognitionRef.current.start();
            isRunningRef.current = true;
            setIsActive(true);
          } catch {
            isRunningRef.current = false;
          }
        }
      }, 300);
    }
  }, [isPTTActive]);

  /**
   * Start transcription
   */
  const start = useCallback(() => {
    if (!isSupported || !recognitionRef.current || !enabled) return;
    if (isRunningRef.current) return; // Already running

    shouldBeActiveRef.current = true;
    setError(null);

    try {
      recognitionRef.current.start();
      isRunningRef.current = true;
      setIsActive(true);
      console.log("[AmbientTranscription] Started");
    } catch (err) {
      isRunningRef.current = false;
      // May already be started
      console.warn("[AmbientTranscription] Start error:", err);
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
