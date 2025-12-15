/**
 * useSileroVAD Hook
 *
 * Reusable Voice Activity Detection using Silero VAD model.
 * Extracted from useSwensyncRealtime for use in ambient transcription.
 *
 * Part of the Long-Horizon Engineering Protocol - FEAT-514
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Dynamic import for MicVAD to avoid SSR issues
let MicVADClass: typeof import("@ricky0123/vad-web").MicVAD | null = null;

/**
 * Hook options
 */
export interface UseSileroVADOptions {
  /** Audio stream to monitor */
  stream: MediaStream | null;
  /** Whether VAD is enabled */
  enabled?: boolean;
  /** Threshold for detecting speech start (0-1, default: 0.6) */
  positiveSpeechThreshold?: number;
  /** Threshold for detecting speech end (0-1, default: 0.35) */
  negativeSpeechThreshold?: number;
  /** Time in ms of silence before triggering speech end (default: 500) */
  redemptionMs?: number;
  /** Minimum speech duration in ms (default: 150) */
  minSpeechMs?: number;
  /** Callback when speech starts */
  onSpeechStart?: () => void;
  /** Callback when speech ends */
  onSpeechEnd?: (durationMs: number) => void;
  /** Callback on VAD misfire (speech too short) */
  onMisfire?: () => void;
}

/**
 * Hook return type
 */
export interface UseSileroVADReturn {
  /** Whether voice activity is currently detected */
  isVoiceActive: boolean;
  /** Whether VAD is loading (WASM/model) */
  isLoading: boolean;
  /** Whether VAD is ready and monitoring */
  isReady: boolean;
  /** Error message if initialization failed */
  error: string | null;
  /** Manually start VAD (usually auto-starts when enabled) */
  start: () => Promise<void>;
  /** Manually stop VAD */
  stop: () => void;
}

/**
 * VAD asset paths - served from /public/vad/
 */
const VAD_BASE_PATH = "/vad/";

/**
 * Default options for ambient transcription use case
 * (longer redemptionMs than useSwensyncRealtime since we don't need fast commit signals)
 */
const DEFAULT_OPTIONS = {
  positiveSpeechThreshold: 0.6,
  negativeSpeechThreshold: 0.35,
  redemptionMs: 500, // 500ms silence before triggering end (vs 200ms in useSwensyncRealtime)
  minSpeechMs: 150,
};

/**
 * useSileroVAD hook
 *
 * Provides voice activity detection using Silero VAD neural network model.
 * The VAD runs continuously when enabled, detecting speech start/end events.
 *
 * @example
 * ```tsx
 * const {
 *   isVoiceActive,
 *   isReady,
 *   error,
 * } = useSileroVAD({
 *   stream: localAudioStream,
 *   enabled: true,
 *   onSpeechStart: () => console.log('Speech started'),
 *   onSpeechEnd: (duration) => console.log(`Speech ended after ${duration}ms`),
 * });
 * ```
 */
export function useSileroVAD(options: UseSileroVADOptions): UseSileroVADReturn {
  const {
    stream,
    enabled = true,
    positiveSpeechThreshold = DEFAULT_OPTIONS.positiveSpeechThreshold,
    negativeSpeechThreshold = DEFAULT_OPTIONS.negativeSpeechThreshold,
    redemptionMs = DEFAULT_OPTIONS.redemptionMs,
    minSpeechMs = DEFAULT_OPTIONS.minSpeechMs,
    onSpeechStart,
    onSpeechEnd,
    onMisfire,
  } = options;

  // State
  const [isVoiceActive, setIsVoiceActive] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Refs - using any for MicVAD instance since the type is complex and dynamically imported
  const vadRef = useRef<any>(null);
  const speechStartTimeRef = useRef<number | null>(null);
  const isMountedRef = useRef(true);

  // Stable callback refs to avoid re-creating VAD on callback changes
  const onSpeechStartRef = useRef(onSpeechStart);
  const onSpeechEndRef = useRef(onSpeechEnd);
  const onMisfireRef = useRef(onMisfire);

  // Keep callback refs in sync
  onSpeechStartRef.current = onSpeechStart;
  onSpeechEndRef.current = onSpeechEnd;
  onMisfireRef.current = onMisfire;

  /**
   * Initialize and start VAD
   */
  const initializeVAD = useCallback(
    async (audioStream: MediaStream) => {
      if (!isMountedRef.current) return;

      setIsLoading(true);
      setError(null);

      try {
        // Dynamic import to avoid SSR issues
        if (!MicVADClass) {
          const vadModule = await import("@ricky0123/vad-web");
          MicVADClass = vadModule.MicVAD;
        }

        console.log("[SileroVAD] Initializing...");

        const vad = await MicVADClass.new({
          // Asset paths - load from local public directory
          baseAssetPath: VAD_BASE_PATH,
          onnxWASMBasePath: VAD_BASE_PATH,

          // Use the existing stream instead of requesting a new one
          getStream: async () => audioStream,
          // Don't stop the stream when pausing VAD (we don't own it)
          pauseStream: async () => {},
          resumeStream: async () => audioStream,

          // VAD thresholds
          positiveSpeechThreshold,
          negativeSpeechThreshold,
          redemptionMs,
          minSpeechMs,

          // Minimal pre-speech padding (we don't need the audio, just the signal)
          preSpeechPadMs: 0,

          // Use v5 model for better accuracy
          model: "v5",

          // Callbacks
          onSpeechStart: () => {
            if (!isMountedRef.current) return;
            console.log("[SileroVAD] Speech started");
            speechStartTimeRef.current = Date.now();
            setIsVoiceActive(true);
            onSpeechStartRef.current?.();
          },

          onSpeechEnd: () => {
            if (!isMountedRef.current) return;
            const duration = speechStartTimeRef.current
              ? Date.now() - speechStartTimeRef.current
              : 0;
            console.log(`[SileroVAD] Speech ended (${duration}ms)`);
            setIsVoiceActive(false);
            speechStartTimeRef.current = null;
            onSpeechEndRef.current?.(duration);
          },

          onVADMisfire: () => {
            if (!isMountedRef.current) return;
            console.log("[SileroVAD] Misfire (speech too short)");
            setIsVoiceActive(false);
            speechStartTimeRef.current = null;
            onMisfireRef.current?.();
          },
        });

        if (!isMountedRef.current) {
          await vad.destroy();
          return;
        }

        vadRef.current = vad;
        await vad.start();

        setIsReady(true);
        setIsLoading(false);
        console.log("[SileroVAD] Ready and monitoring");
      } catch (err) {
        if (!isMountedRef.current) return;
        const message =
          err instanceof Error ? err.message : "VAD initialization failed";
        console.error("[SileroVAD] Initialization failed:", err);
        setError(message);
        setIsLoading(false);
        setIsReady(false);
      }
    },
    [
      positiveSpeechThreshold,
      negativeSpeechThreshold,
      redemptionMs,
      minSpeechMs,
    ],
  );

  /**
   * Cleanup VAD
   */
  const cleanupVAD = useCallback(async () => {
    if (vadRef.current) {
      try {
        await vadRef.current.destroy();
        console.log("[SileroVAD] Destroyed");
      } catch (err) {
        console.warn("[SileroVAD] Error destroying:", err);
      }
      vadRef.current = null;
    }
    setIsReady(false);
    setIsVoiceActive(false);
    speechStartTimeRef.current = null;
  }, []);

  /**
   * Manual start (usually auto-starts via useEffect)
   */
  const start = useCallback(async () => {
    if (!stream || !enabled) return;
    if (vadRef.current) return; // Already initialized

    await initializeVAD(stream);
  }, [stream, enabled, initializeVAD]);

  /**
   * Manual stop
   */
  const stop = useCallback(() => {
    cleanupVAD();
  }, [cleanupVAD]);

  /**
   * Initialize VAD when stream is available and enabled
   */
  useEffect(() => {
    if (!stream || !enabled) {
      // Cleanup if disabled or no stream
      if (vadRef.current) {
        cleanupVAD();
      }
      return;
    }

    // Initialize VAD
    initializeVAD(stream);

    return () => {
      cleanupVAD();
    };
  }, [stream, enabled, initializeVAD, cleanupVAD]);

  /**
   * Track mounted state
   */
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  return {
    isVoiceActive,
    isLoading,
    isReady,
    error,
    start,
    stop,
  };
}

export default useSileroVAD;
