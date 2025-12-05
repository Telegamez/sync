import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format milliseconds to seconds with decimal (e.g., "1.234s")
 */
export function formatLatency(ms: number): string {
  return `${(ms / 1000).toFixed(3)}s`;
}

/**
 * Format seconds to MM:SS display
 */
export function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Get color class based on latency value
 * Colors: green (excellent), yellow (good), amber (acceptable), red (slow)
 */
export function getLatencyColor(ms: number): string {
  if (ms < 500) return 'text-green-400';
  if (ms < 1000) return 'text-yellow-400';
  if (ms < 2000) return 'text-amber-400';
  return 'text-red-400';
}

/**
 * Get background color class based on latency value
 */
export function getLatencyBgColor(ms: number): string {
  if (ms < 500) return 'bg-green-500/20';
  if (ms < 1000) return 'bg-yellow-500/20';
  if (ms < 2000) return 'bg-amber-500/20';
  return 'bg-red-500/20';
}
