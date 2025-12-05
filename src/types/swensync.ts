/**
 * Swensync Type Definitions
 *
 * Core types for the Swensync Voice AI platform
 */

/**
 * Connection states for the Swensync WebRTC session
 */
export type SwensyncConnectionState = 'idle' | 'connecting' | 'connected' | 'error';

/**
 * Animation states for visual feedback
 */
export type SwensyncAnimState = 'Listening' | 'Focused' | 'Thinking' | 'Speaking';

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
export interface SwensyncRealtimeOptions {
  /** User's name for personalized greeting (optional) */
  userName?: string;
  /** Enable client-side Silero VAD for faster turn detection (default: true) */
  useClientVAD?: boolean;
}

/**
 * Hook return interface
 */
export interface SwensyncRealtimeHook {
  /** Current connection state */
  connectionState: SwensyncConnectionState;
  /** Connect to OpenAI Realtime API */
  connect: () => Promise<void>;
  /** Disconnect and cleanup resources */
  disconnect: () => void;
  /** Current error if any */
  error: Error | null;
  /** AnalyserNode for audio visualization */
  modelAnalyserNode: AnalyserNode | null;
  /** Current animation state derived from OpenAI events */
  animState: SwensyncAnimState;
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
