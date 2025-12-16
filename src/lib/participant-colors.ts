/**
 * Participant Color Assignment Utility
 *
 * Provides consistent, unique color assignment for room participants.
 * - Purple is ALWAYS reserved for AI
 * - Each human participant gets a unique color based on their index
 * - Supports up to 10 unique participant colors (excluding AI)
 *
 * Part of the Long-Horizon Engineering Protocol
 */

import type { InwardWaveformColor } from "@/components/room/InwardWaveform";

/**
 * Color configuration for participant avatars
 */
export interface ParticipantColorConfig {
  /** Color name for waveform component */
  name: InwardWaveformColor;
  /** Tailwind border class */
  border: string;
  /** Tailwind text class */
  text: string;
  /** Tailwind background class (with opacity) */
  bg: string;
  /** Solid Tailwind background class */
  bgSolid: string;
}

/**
 * AI color configuration - ALWAYS purple
 */
export const AI_COLOR: ParticipantColorConfig = {
  name: "purple",
  border: "border-purple-500",
  text: "text-purple-500",
  bg: "bg-purple-500/20",
  bgSolid: "bg-purple-500",
};

/**
 * Participant color palette - 10 distinct colors (purple excluded, reserved for AI)
 * Order is intentional to maximize visual distinction between adjacent participants
 */
export const PARTICIPANT_COLORS: ParticipantColorConfig[] = [
  {
    name: "blue",
    border: "border-blue-500",
    text: "text-blue-500",
    bg: "bg-blue-500/20",
    bgSolid: "bg-blue-500",
  },
  {
    name: "emerald",
    border: "border-emerald-500",
    text: "text-emerald-500",
    bg: "bg-emerald-500/20",
    bgSolid: "bg-emerald-500",
  },
  {
    name: "amber",
    border: "border-amber-500",
    text: "text-amber-500",
    bg: "bg-amber-500/20",
    bgSolid: "bg-amber-500",
  },
  {
    name: "rose",
    border: "border-rose-500",
    text: "text-rose-500",
    bg: "bg-rose-500/20",
    bgSolid: "bg-rose-500",
  },
  {
    name: "cyan",
    border: "border-cyan-500",
    text: "text-cyan-500",
    bg: "bg-cyan-500/20",
    bgSolid: "bg-cyan-500",
  },
  {
    name: "orange",
    border: "border-orange-500",
    text: "text-orange-500",
    bg: "bg-orange-500/20",
    bgSolid: "bg-orange-500",
  },
  {
    name: "pink",
    border: "border-pink-500",
    text: "text-pink-500",
    bg: "bg-pink-500/20",
    bgSolid: "bg-pink-500",
  },
  {
    name: "indigo",
    border: "border-indigo-500",
    text: "text-indigo-500",
    bg: "bg-indigo-500/20",
    bgSolid: "bg-indigo-500",
  },
  {
    name: "green",
    border: "border-green-500",
    text: "text-green-500",
    bg: "bg-green-500/20",
    bgSolid: "bg-green-500",
  },
  {
    // 10th color - teal (using cyan waveform as closest match)
    name: "cyan",
    border: "border-teal-500",
    text: "text-teal-500",
    bg: "bg-teal-500/20",
    bgSolid: "bg-teal-500",
  },
];

/**
 * Get color for a participant by their index in the participant list.
 * AI participants always get purple regardless of index.
 *
 * @param index - Zero-based index of the participant (excluding AI)
 * @param isAI - Whether this participant is the AI
 * @returns Color configuration for the participant
 *
 * @example
 * ```ts
 * // AI always gets purple
 * getParticipantColor(0, true) // Returns AI_COLOR (purple)
 *
 * // Humans get indexed colors
 * getParticipantColor(0, false) // Returns PARTICIPANT_COLORS[0] (blue)
 * getParticipantColor(1, false) // Returns PARTICIPANT_COLORS[1] (emerald)
 * ```
 */
export function getParticipantColor(
  index: number,
  isAI: boolean = false,
): ParticipantColorConfig {
  if (isAI) {
    return AI_COLOR;
  }

  // Ensure index is within bounds (wraps if more than 10 participants)
  const colorIndex = Math.abs(index) % PARTICIPANT_COLORS.length;
  return PARTICIPANT_COLORS[colorIndex];
}

/**
 * Build a color assignment map for a list of participants.
 * Ensures each participant gets a unique color, with AI always getting purple.
 *
 * @param participantIds - Array of participant IDs in display order
 * @param aiParticipantId - Optional ID of the AI participant
 * @returns Map of participant ID to color configuration
 *
 * @example
 * ```ts
 * const colorMap = buildParticipantColorMap(
 *   ['peer-1', 'ai-assistant', 'peer-2', 'peer-3'],
 *   'ai-assistant'
 * );
 * // colorMap.get('ai-assistant') => AI_COLOR (purple)
 * // colorMap.get('peer-1') => PARTICIPANT_COLORS[0] (blue)
 * // colorMap.get('peer-2') => PARTICIPANT_COLORS[1] (emerald)
 * // colorMap.get('peer-3') => PARTICIPANT_COLORS[2] (amber)
 * ```
 */
export function buildParticipantColorMap(
  participantIds: string[],
  aiParticipantId?: string | null,
): Map<string, ParticipantColorConfig> {
  const colorMap = new Map<string, ParticipantColorConfig>();
  let humanIndex = 0;

  for (const id of participantIds) {
    if (id === aiParticipantId) {
      colorMap.set(id, AI_COLOR);
    } else {
      colorMap.set(
        id,
        PARTICIPANT_COLORS[humanIndex % PARTICIPANT_COLORS.length],
      );
      humanIndex++;
    }
  }

  return colorMap;
}
