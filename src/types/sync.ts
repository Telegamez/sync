/**
 * sync Type Definitions
 *
 * Core types for the sync Voice AI platform
 */

/**
 * Connection states for the sync WebRTC session
 */
export type syncConnectionState = "idle" | "connecting" | "connected" | "error";

/**
 * Animation states for visual feedback
 */
export type syncAnimState = "Listening" | "Focused" | "Thinking" | "Speaking";

/**
 * Turn latency measurement
 */
export interface TurnLatency {
  /** Sequential turn counter */
  turnNumber: number;
  /** Time in milliseconds from user speech start to first audio response */
  latencyMs: number;
  /** When the turn completed */
  timestamp: Date;
}

/**
 * Hook options interface
 */
export interface syncRealtimeOptions {
  /** User's name for personalized greeting (optional) */
  userName?: string;
  /** Enable client-side Silero VAD for faster turn detection (default: true) */
  useClientVAD?: boolean;
}

/**
 * Hook return interface
 */
export interface syncRealtimeHook {
  /** Current connection state */
  connectionState: syncConnectionState;
  /** Connect to OpenAI Realtime API */
  connect: () => Promise<void>;
  /** Disconnect and cleanup resources */
  disconnect: () => void;
  /** Current error if any */
  error: Error | null;
  /** AnalyserNode for audio visualization */
  modelAnalyserNode: AnalyserNode | null;
  /** Current animation state derived from OpenAI events */
  animState: syncAnimState;
  /** Whether lip-sync/visualization is currently active (during Speaking state) */
  isVisualizerActive: boolean;
  /** Session duration in seconds */
  sessionDuration: number;
  /** Whether session is about to expire (8+ minutes) */
  isSessionExpiring: boolean;

  // Latency tracking
  /** Whether the stopwatch is currently running */
  isStopwatchRunning: boolean;
  /** Current stopwatch elapsed time in ms (live updating) */
  stopwatchElapsed: number;
  /** Last 5 turn latencies (most recent first) */
  turnLatencies: TurnLatency[];
  /** Current turn number */
  currentTurnNumber: number;
}
