'use client';

import React from 'react';
import { Clock } from 'lucide-react';
import { formatTime } from '@/lib/utils';

interface SessionTimerProps {
  /** Session duration in seconds */
  duration: number;
  /** Whether the session is about to expire */
  isExpiring: boolean;
}

/**
 * SessionTimer - Displays the session duration and time remaining
 */
export const SessionTimer: React.FC<SessionTimerProps> = ({
  duration,
  isExpiring,
}) => {
  const timeLeft = 10 * 60 - duration; // 10 minutes max

  return (
    <div
      className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm ${
        isExpiring
          ? 'bg-orange-500/20 text-orange-300 animate-pulse'
          : 'bg-white/10 text-white/70'
      }`}
    >
      <Clock className="w-3.5 h-3.5" />
      <span>
        {isExpiring ? `${formatTime(timeLeft)} left` : formatTime(duration)}
      </span>
    </div>
  );
};

export default SessionTimer;
