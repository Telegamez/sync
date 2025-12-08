/**
 * AudioWaveform Component
 *
 * Compact audio waveform visualization for participant cards.
 * Shows animated bars when speaking, with intensity based on audio level.
 *
 * Part of the Long-Horizon Engineering Protocol - FEAT-154
 */

"use client";

import { useMemo } from "react";

/**
 * Waveform size variants
 */
export type WaveformSize = "sm" | "md" | "lg";

/**
 * Waveform color variants
 */
export type WaveformColor = "green" | "purple" | "blue" | "amber";

/**
 * AudioWaveform props
 */
export interface AudioWaveformProps {
  /** Whether the participant is actively speaking */
  isSpeaking: boolean;
  /** Audio level for intensity (0-1) */
  audioLevel?: number;
  /** Size variant */
  size?: WaveformSize;
  /** Color variant */
  color?: WaveformColor;
  /** Number of bars to display */
  barCount?: number;
  /** Custom class name */
  className?: string;
}

/**
 * Size configurations
 */
const SIZE_CONFIG = {
  sm: {
    height: "h-4",
    barWidth: "w-0.5",
    gap: "gap-0.5",
    minHeight: 2,
    maxHeight: 16,
  },
  md: {
    height: "h-6",
    barWidth: "w-1",
    gap: "gap-0.5",
    minHeight: 3,
    maxHeight: 24,
  },
  lg: {
    height: "h-8",
    barWidth: "w-1",
    gap: "gap-1",
    minHeight: 4,
    maxHeight: 32,
  },
};

/**
 * Color configurations
 */
const COLOR_CONFIG = {
  green: "bg-green-500",
  purple: "bg-purple-500",
  blue: "bg-blue-500",
  amber: "bg-amber-500",
};

/**
 * Generate pseudo-random animation delays for natural appearance
 */
function getAnimationDelays(count: number): string[] {
  const delays = [];
  for (let i = 0; i < count; i++) {
    // Create a wave pattern from center outward
    const distanceFromCenter = Math.abs(i - (count - 1) / 2);
    const delay = distanceFromCenter * 0.05;
    delays.push(`${delay}s`);
  }
  return delays;
}

/**
 * Generate bar heights based on audio level with wave pattern
 */
function getBarHeights(
  count: number,
  audioLevel: number,
  minHeight: number,
  maxHeight: number,
  isSpeaking: boolean,
): number[] {
  const heights: number[] = [];
  const time = Date.now() / 200; // Animation time factor

  for (let i = 0; i < count; i++) {
    if (!isSpeaking) {
      // Minimal idle animation
      heights.push(minHeight);
    } else {
      // Dynamic wave based on audio level
      const normalizedPos = i / (count - 1);
      // Create a wave that peaks in the middle
      const wavePosition = Math.sin(normalizedPos * Math.PI);
      // Add time-based variation
      const timeOffset = Math.sin(time + i * 0.5) * 0.3;
      // Calculate height
      const intensity = audioLevel * wavePosition + timeOffset * audioLevel;
      const height = minHeight + intensity * (maxHeight - minHeight);
      heights.push(Math.max(minHeight, Math.min(maxHeight, height)));
    }
  }

  return heights;
}

/**
 * AudioWaveform Component
 *
 * Displays animated audio bars for speaking participants.
 *
 * @example
 * ```tsx
 * <AudioWaveform
 *   isSpeaking={true}
 *   audioLevel={0.7}
 *   size="md"
 *   color="green"
 * />
 * ```
 */
export function AudioWaveform({
  isSpeaking,
  audioLevel = 0.5,
  size = "md",
  color = "green",
  barCount = 5,
  className = "",
}: AudioWaveformProps) {
  const sizeConfig = SIZE_CONFIG[size];
  const colorClass = COLOR_CONFIG[color];
  const animationDelays = useMemo(
    () => getAnimationDelays(barCount),
    [barCount],
  );

  // Calculate bar heights
  const barHeights = useMemo(
    () =>
      getBarHeights(
        barCount,
        audioLevel,
        sizeConfig.minHeight,
        sizeConfig.maxHeight,
        isSpeaking,
      ),
    [
      barCount,
      audioLevel,
      sizeConfig.minHeight,
      sizeConfig.maxHeight,
      isSpeaking,
    ],
  );

  return (
    <div
      className={`flex items-center justify-center ${sizeConfig.height} ${sizeConfig.gap} ${className}`}
      role="img"
      aria-label={isSpeaking ? "Speaking" : "Not speaking"}
    >
      {Array.from({ length: barCount }).map((_, index) => (
        <div
          key={index}
          className={`
            ${sizeConfig.barWidth}
            ${colorClass}
            rounded-full
            transition-all
            ${isSpeaking ? "animate-pulse" : ""}
          `}
          style={{
            height: `${barHeights[index]}px`,
            animationDelay: animationDelays[index],
            animationDuration: isSpeaking ? "0.5s" : "1s",
            opacity: isSpeaking ? 1 : 0.3,
          }}
        />
      ))}
    </div>
  );
}

/**
 * AI-specific waveform with purple color
 */
export function AIWaveform(props: Omit<AudioWaveformProps, "color">) {
  return <AudioWaveform {...props} color="purple" />;
}

/**
 * Participant waveform with green color
 */
export function ParticipantWaveform(props: Omit<AudioWaveformProps, "color">) {
  return <AudioWaveform {...props} color="green" />;
}

export default AudioWaveform;
