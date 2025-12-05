'use client';

import React from 'react';
import { Timer } from 'lucide-react';
import { formatLatency, getLatencyColor, getLatencyBgColor } from '@/lib/utils';
import type { TurnLatency } from '@/types/swensync';

interface LatencyStopwatchProps {
  /** Whether the stopwatch is currently running */
  isRunning: boolean;
  /** Current elapsed time in milliseconds */
  elapsedMs: number;
  /** Last 5 turn latencies (most recent first) */
  turnLatencies: TurnLatency[];
  /** Compact mode for mobile landscape */
  compact?: boolean;
}

/**
 * LatencyStopwatch - Visual stopwatch showing turn-by-turn latency
 *
 * Displays:
 * - Live stopwatch when user is speaking (waiting for response)
 * - History of last 5 turn latencies with color coding
 */
export const LatencyStopwatch: React.FC<LatencyStopwatchProps> = ({
  isRunning,
  elapsedMs,
  turnLatencies,
  compact = false,
}) => {
  return (
    <div className={`flex items-center min-w-0 ${compact ? 'flex-col gap-1' : 'gap-2 sm:gap-3'}`}>
      {/* Live Stopwatch */}
      <div
        className={`flex items-center gap-1.5 rounded-full flex-shrink-0 ${
          compact ? 'px-1.5 py-1 text-xs' : 'px-2 sm:px-3 py-1.5 text-sm sm:gap-2'
        } ${
          isRunning
            ? 'bg-blue-500/20 text-blue-300 animate-pulse-glow'
            : turnLatencies.length > 0
            ? getLatencyBgColor(turnLatencies[0].latencyMs) +
              ' ' +
              getLatencyColor(turnLatencies[0].latencyMs)
            : 'bg-white/10 text-white/50'
        }`}
      >
        <Timer
          className={`${compact ? 'w-3 h-3' : 'w-3.5 h-3.5'} ${isRunning ? 'animate-stopwatch' : ''}`}
        />
        <span className={`font-mono ${compact ? 'text-xs' : 'min-w-[3.5rem] sm:min-w-[4.5rem] text-xs sm:text-sm'}`}>
          {isRunning
            ? formatLatency(elapsedMs)
            : turnLatencies.length > 0
            ? formatLatency(turnLatencies[0].latencyMs)
            : '0.000s'}
        </span>
        {isRunning && !compact && (
          <span className="hidden sm:inline text-xs uppercase tracking-wider opacity-70">
            measuring
          </span>
        )}
      </div>

      {/* Turn History - hidden on mobile and compact mode, show on larger screens */}
      {turnLatencies.length > 0 && !compact && (
        <div className="hidden sm:flex items-center gap-1.5 overflow-hidden">
          {turnLatencies.slice(0, 5).map((turn, index) => (
            <div
              key={turn.turnNumber}
              className={`flex items-center gap-1 px-2 py-1 rounded text-xs flex-shrink-0 ${
                getLatencyBgColor(turn.latencyMs)
              } ${
                getLatencyColor(turn.latencyMs)
              } ${
                index > 0 ? 'opacity-70' : ''
              }`}
              title={`Turn ${turn.turnNumber}: ${formatLatency(turn.latencyMs)}`}
            >
              <span className="opacity-60">#{turn.turnNumber}</span>
              <span className="font-mono">
                {(turn.latencyMs / 1000).toFixed(1)}s
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default LatencyStopwatch;
