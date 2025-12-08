/**
 * InwardWaveform Component
 *
 * Circular waveform visualization that pulses inward from the avatar border
 * toward the center when a participant is speaking. Creates a visual ripple
 * effect that indicates voice activity.
 *
 * Part of the Long-Horizon Engineering Protocol - FEAT-154
 */

"use client";

import { useMemo } from "react";

/**
 * Waveform color variants - expanded palette for unique participant colors
 */
export type InwardWaveformColor =
  | "green"
  | "purple"
  | "blue"
  | "amber"
  | "rose"
  | "cyan"
  | "emerald"
  | "orange"
  | "pink"
  | "indigo";

/**
 * InwardWaveform props
 */
export interface InwardWaveformProps {
  /** Whether the participant is actively speaking */
  isSpeaking: boolean;
  /** Audio level for intensity (0-1) */
  audioLevel?: number;
  /** Color variant - matches participant's avatar color */
  color?: InwardWaveformColor;
  /** Size of the avatar container (used for positioning) */
  size?: number;
  /** Number of rings to display */
  ringCount?: number;
  /** Custom class name */
  className?: string;
}

/**
 * Color configurations for rings - expanded palette
 */
const COLOR_CONFIG: Record<
  InwardWaveformColor,
  { ring: string; glow: string }
> = {
  green: {
    ring: "border-green-500",
    glow: "shadow-green-500/40",
  },
  purple: {
    ring: "border-purple-500",
    glow: "shadow-purple-500/40",
  },
  blue: {
    ring: "border-blue-500",
    glow: "shadow-blue-500/40",
  },
  amber: {
    ring: "border-amber-500",
    glow: "shadow-amber-500/40",
  },
  rose: {
    ring: "border-rose-500",
    glow: "shadow-rose-500/40",
  },
  cyan: {
    ring: "border-cyan-500",
    glow: "shadow-cyan-500/40",
  },
  emerald: {
    ring: "border-emerald-500",
    glow: "shadow-emerald-500/40",
  },
  orange: {
    ring: "border-orange-500",
    glow: "shadow-orange-500/40",
  },
  pink: {
    ring: "border-pink-500",
    glow: "shadow-pink-500/40",
  },
  indigo: {
    ring: "border-indigo-500",
    glow: "shadow-indigo-500/40",
  },
};

/**
 * InwardWaveform Component
 *
 * Overlays animated concentric rings that pulse inward when speaking.
 * Position this absolutely within a relative container around the avatar.
 *
 * @example
 * ```tsx
 * <div className="relative">
 *   <Avatar />
 *   <InwardWaveform isSpeaking={true} audioLevel={0.7} color="green" />
 * </div>
 * ```
 */
export function InwardWaveform({
  isSpeaking,
  audioLevel = 0.5,
  color = "green",
  size = 48,
  ringCount = 4,
  className = "",
}: InwardWaveformProps) {
  const colorConfig = COLOR_CONFIG[color];

  // Calculate ring animations based on audio level
  const rings = useMemo(() => {
    return Array.from({ length: ringCount }).map((_, index) => {
      // Each ring starts at a different phase of the animation
      const phase = index / ringCount;
      // Stagger the animation delays more for better wave effect
      const delay = phase * 0.3;
      // Faster animation for more dynamic feel
      const duration = 0.6 + index * 0.08;
      // Higher base opacity for visibility, slight decrease for inner rings
      const baseOpacity = isSpeaking ? 1 - index * 0.1 : 0;
      // Audio level affects intensity
      const intensityMultiplier = 0.5 + audioLevel * 0.5;

      return {
        delay,
        duration,
        baseOpacity: Math.max(0.3, baseOpacity * intensityMultiplier),
        index,
      };
    });
  }, [ringCount, isSpeaking, audioLevel]);

  if (!isSpeaking) {
    return null;
  }

  return (
    <div
      className={`absolute inset-0 pointer-events-none overflow-hidden rounded-full ${className}`}
      role="presentation"
      aria-hidden="true"
    >
      {rings.map((ring) => (
        <div
          key={ring.index}
          className={`
            absolute inset-0 rounded-full
            border-[3px] ${colorConfig.ring}
            animate-inward-pulse
          `}
          style={{
            animationDelay: `${ring.delay}s`,
            animationDuration: `${ring.duration}s`,
            opacity: ring.baseOpacity,
          }}
        />
      ))}
    </div>
  );
}

/**
 * AI-specific inward waveform with purple color
 */
export function AIInwardWaveform(props: Omit<InwardWaveformProps, "color">) {
  return <InwardWaveform {...props} color="purple" />;
}

/**
 * Participant inward waveform with green color
 */
export function ParticipantInwardWaveform(
  props: Omit<InwardWaveformProps, "color">,
) {
  return <InwardWaveform {...props} color="green" />;
}

export default InwardWaveform;
