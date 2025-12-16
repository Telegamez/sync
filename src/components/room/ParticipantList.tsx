/**
 * ParticipantList Component
 *
 * Displays all participants in a room with real-time speaking/muted indicators.
 * Highlights the current active speaker and supports responsive layouts.
 * Includes AI participant with special avatar and audio waveform visualization.
 *
 * Part of the Long-Horizon Engineering Protocol - FEAT-114
 */

"use client";

import { useMemo, useState, useEffect } from "react";
import type { PeerId, PeerRole, PeerConnectionState } from "@/types/peer";
import { InwardWaveform, type InwardWaveformColor } from "./InwardWaveform";
import {
  getParticipantColor,
  type ParticipantColorConfig,
} from "@/lib/participant-colors";

/**
 * Extended participant info with presence state
 */
export interface ParticipantInfo {
  /** Unique peer identifier */
  id: PeerId;
  /** Display name */
  displayName: string;
  /** Optional avatar URL */
  avatarUrl?: string;
  /** Role in the room */
  role: PeerRole;
  /** Whether participant is muted */
  isMuted: boolean;
  /** Whether participant is speaking */
  isSpeaking: boolean;
  /** Whether participant is addressing AI (PTT active) */
  isAddressingAI?: boolean;
  /** Audio level for visualization (0-1) */
  audioLevel?: number;
  /** Connection state */
  connectionState?: PeerConnectionState;
  /** Whether this is the local user */
  isLocal?: boolean;
  /** Whether this is the AI participant */
  isAI?: boolean;
}

/**
 * Layout orientation
 */
export type ParticipantListLayout = "horizontal" | "vertical" | "grid";

/**
 * ParticipantList props
 */
export interface ParticipantListProps {
  /** List of participants */
  participants: ParticipantInfo[];
  /** ID of the active speaker (highlighted) */
  activeSpeakerId?: PeerId | null;
  /** Local peer ID (for "You" label) */
  localPeerId?: PeerId | null;
  /** Layout orientation */
  layout?: ParticipantListLayout;
  /** Maximum number of visible participants before overflow */
  maxVisible?: number;
  /** Show connection status indicator */
  showConnectionStatus?: boolean;
  /** Show role badge */
  showRoleBadge?: boolean;
  /** Callback when participant is clicked */
  onParticipantClick?: (participantId: PeerId) => void;
  /** Custom class name */
  className?: string;
  /** Use viewport-aware sizing to prevent scrolling */
  viewportAware?: boolean;
}

/**
 * Get initials from display name
 */
function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

/**
 * Get role display label
 */
function getRoleLabel(role: PeerRole): string {
  switch (role) {
    case "owner":
      return "Host";
    case "moderator":
      return "Mod";
    case "participant":
      return "";
    default:
      return "";
  }
}

/**
 * Get role badge color
 */
function getRoleBadgeColor(role: PeerRole): string {
  switch (role) {
    case "owner":
      return "bg-amber-500 text-white";
    case "moderator":
      return "bg-blue-500 text-white";
    default:
      return "";
  }
}

/**
 * Get connection status color
 */
function getConnectionStatusColor(
  state: PeerConnectionState | undefined,
): string {
  switch (state) {
    case "connected":
      return "bg-green-500";
    case "connecting":
    case "reconnecting":
      return "bg-yellow-500";
    case "disconnected":
    case "failed":
      return "bg-red-500";
    default:
      return "bg-gray-400";
  }
}

/**
 * Get connection status label
 */
function getConnectionStatusLabel(
  state: PeerConnectionState | undefined,
): string {
  switch (state) {
    case "connected":
      return "Connected";
    case "connecting":
      return "Connecting...";
    case "reconnecting":
      return "Reconnecting...";
    case "disconnected":
      return "Disconnected";
    case "failed":
      return "Connection failed";
    default:
      return "Unknown status";
  }
}

/**
 * Avatar size configuration - dynamic based on participant count
 */
type AvatarSizeConfig = "xs" | "sm" | "md" | "lg" | "xl";

const AVATAR_SIZE_CLASSES: Record<
  AvatarSizeConfig,
  {
    container: string;
    avatar: string;
    icon: string;
    text: string;
    waveform: number;
    badge: string;
  }
> = {
  xs: {
    container: "w-16",
    avatar: "w-10 h-10",
    icon: "w-5 h-5",
    text: "text-xs",
    waveform: 40,
    badge: "w-3 h-3 p-0.5",
  },
  sm: {
    container: "w-20",
    avatar: "w-14 h-14",
    icon: "w-7 h-7",
    text: "text-sm",
    waveform: 56,
    badge: "w-4 h-4 p-0.5",
  },
  md: {
    container: "w-24",
    avatar: "w-18 h-18",
    icon: "w-9 h-9",
    text: "text-base",
    waveform: 72,
    badge: "w-5 h-5 p-1",
  },
  lg: {
    container: "w-28",
    avatar: "w-20 h-20",
    icon: "w-10 h-10",
    text: "text-lg",
    waveform: 80,
    badge: "w-5 h-5 p-1",
  },
  xl: {
    container: "w-32",
    avatar: "w-24 h-24",
    icon: "w-12 h-12",
    text: "text-xl",
    waveform: 96,
    badge: "w-6 h-6 p-1",
  },
};

/**
 * Get avatar size based on participant count and available height
 * Uses viewport height to ensure avatars fit without scrolling
 */
function getAvatarSize(
  participantCount: number,
  availableHeight?: number,
): AvatarSizeConfig {
  // If we have available height info, use it to constrain size
  if (availableHeight !== undefined) {
    // Estimate height needed per participant row (avatar + name + padding)
    // Each size has different height requirements
    const heightPerItem: Record<AvatarSizeConfig, number> = {
      xl: 160, // 96px avatar + name + padding
      lg: 130, // 80px avatar + name + padding
      md: 110, // 72px avatar + name + padding
      sm: 90, // 56px avatar + name + padding
      xs: 70, // 40px avatar + name + padding
    };

    // Calculate how many rows we'd have (3 participants per row for mobile)
    const itemsPerRow = Math.max(2, Math.min(4, Math.floor(300 / 80))); // ~80px per item minimum
    const rows = Math.ceil(participantCount / itemsPerRow);

    // Find the largest size that fits
    const sizes: AvatarSizeConfig[] = ["xl", "lg", "md", "sm", "xs"];
    for (const size of sizes) {
      if (rows * heightPerItem[size] <= availableHeight) {
        return size;
      }
    }
    return "xs"; // Fallback to smallest
  }

  // Fallback to count-based sizing
  if (participantCount <= 2) return "xl";
  if (participantCount <= 4) return "lg";
  if (participantCount <= 6) return "md";
  if (participantCount <= 10) return "sm";
  return "xs";
}

/**
 * AI Avatar component - special avatar for the AI participant
 * Uses transparent background with purple color theme
 */
function AIAvatar({
  sizeConfig,
}: {
  sizeConfig: (typeof AVATAR_SIZE_CLASSES)[AvatarSizeConfig];
}) {
  return (
    <div
      className={`
        ${sizeConfig.avatar}
        bg-purple-500/20
        rounded-full flex items-center justify-center
        border-2 border-purple-500 transition-all
      `}
    >
      {/* AI Icon - stylized bot/brain icon */}
      <svg
        className={`${sizeConfig.icon} text-purple-500`}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z"
        />
      </svg>
    </div>
  );
}

/**
 * Individual participant item component
 */
function ParticipantItem({
  participant,
  isActiveSpeaker,
  isLocal,
  showConnectionStatus,
  showRoleBadge,
  sizeConfig,
  colorConfig,
  onClick,
}: {
  participant: ParticipantInfo;
  isActiveSpeaker: boolean;
  isLocal: boolean;
  showConnectionStatus: boolean;
  showRoleBadge: boolean;
  sizeConfig: (typeof AVATAR_SIZE_CLASSES)[AvatarSizeConfig];
  colorConfig: ParticipantColorConfig;
  onClick?: () => void;
}) {
  const {
    displayName,
    avatarUrl,
    role,
    isMuted,
    isSpeaking,
    isAddressingAI,
    audioLevel = 0,
    connectionState,
    isAI = false,
  } = participant;

  const initials = getInitials(displayName);
  const roleLabel = isAI ? "AI" : getRoleLabel(role);
  const roleBadgeColor = isAI
    ? "bg-purple-500 text-white"
    : getRoleBadgeColor(role);
  const connectionColor = getConnectionStatusColor(connectionState);
  const connectionLabel = getConnectionStatusLabel(connectionState);

  // Use the color config passed in (already handles AI = purple)
  const waveformColor: InwardWaveformColor = colorConfig.name;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={`
        flex flex-col items-center gap-1 p-2 rounded-xl transition-all duration-200
        ${sizeConfig.container}
        ${onClick ? "hover:bg-gray-100 dark:hover:bg-gray-700/50 cursor-pointer active:scale-95" : "cursor-default"}
        ${isActiveSpeaker && !isAI ? "bg-green-50 dark:bg-green-900/20 ring-2 ring-green-500" : ""}
        ${isActiveSpeaker && isAI ? "bg-purple-50 dark:bg-purple-900/20 ring-2 ring-purple-500" : ""}
      `}
      aria-label={`${displayName}${isLocal ? " (You)" : ""}${isMuted ? ", muted" : ""}${isSpeaking ? ", speaking" : ""}${isActiveSpeaker ? ", active speaker" : ""}${isAI ? ", AI assistant" : ""}`}
    >
      {/* Avatar */}
      <div className="relative">
        {isAI ? (
          <AIAvatar sizeConfig={sizeConfig} />
        ) : avatarUrl ? (
          <img
            src={avatarUrl}
            alt={displayName}
            className={`
              rounded-full object-cover border-2 transition-all
              ${colorConfig.border}
              ${sizeConfig.avatar}
            `}
          />
        ) : (
          <div
            className={`
              rounded-full flex items-center justify-center font-semibold
              ${colorConfig.bg} ${colorConfig.text}
              border-2 ${colorConfig.border} transition-all
              ${sizeConfig.avatar} ${sizeConfig.text}
            `}
          >
            {initials}
          </div>
        )}

        {/* Inward waveform overlay for speaking indicator */}
        <InwardWaveform
          isSpeaking={isSpeaking || !!isAddressingAI}
          audioLevel={audioLevel}
          color={waveformColor}
          size={sizeConfig.waveform}
        />

        {/* Mute indicator - don't show for AI */}
        {isMuted && !isAI && (
          <div
            className={`absolute -bottom-1 -right-1 bg-red-500 rounded-full flex items-center justify-center ${sizeConfig.badge}`}
            title="Muted"
          >
            <svg
              className="w-full h-full text-white"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2"
              />
            </svg>
          </div>
        )}

        {/* Connection status indicator - don't show for AI */}
        {showConnectionStatus &&
          connectionState &&
          connectionState !== "connected" &&
          !isAI && (
            <div
              className={`absolute -top-1 -right-1 w-3 h-3 rounded-full ${connectionColor}`}
              title={connectionLabel}
            />
          )}

        {/* PTT indicator - don't show for AI */}
        {isAddressingAI && !isAI && (
          <div
            className={`absolute -top-1 -left-1 bg-purple-500 rounded-full flex items-center justify-center ${sizeConfig.badge}`}
            title="Addressing AI"
          >
            <svg
              className="w-full h-full text-white"
              fill="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" />
            </svg>
          </div>
        )}
      </div>

      {/* Name and role */}
      <div className="flex flex-col items-center overflow-hidden w-full text-center">
        <span
          className={`
            font-medium truncate max-w-full leading-tight
            ${isAI ? "text-purple-600 dark:text-purple-400" : "text-gray-900 dark:text-white"}
            ${sizeConfig.text}
          `}
        >
          {displayName}
          {isLocal && (
            <span className="text-gray-500 dark:text-gray-400 ml-1">(You)</span>
          )}
        </span>

        {/* Role badge */}
        {showRoleBadge && roleLabel && (
          <span
            className={`
              text-[10px] px-1.5 py-0.5 rounded-full mt-0.5
              ${roleBadgeColor}
            `}
          >
            {roleLabel}
          </span>
        )}
      </div>
    </button>
  );
}

/**
 * Overflow indicator for hidden participants
 */
function OverflowIndicator({
  count,
  sizeConfig,
}: {
  count: number;
  sizeConfig: (typeof AVATAR_SIZE_CLASSES)[AvatarSizeConfig];
}) {
  return (
    <div
      className={`
        flex flex-col items-center justify-center rounded-xl bg-gray-100 dark:bg-gray-700
        text-gray-600 dark:text-gray-300 font-medium p-2
        ${sizeConfig.container}
      `}
      aria-label={`${count} more participants`}
    >
      <div
        className={`
          rounded-full flex items-center justify-center
          bg-gray-200 dark:bg-gray-600
          ${sizeConfig.avatar} ${sizeConfig.text}
        `}
      >
        +{count}
      </div>
      <span className={`mt-1 ${sizeConfig.text}`}>more</span>
    </div>
  );
}

/**
 * ParticipantList Component
 *
 * Displays room participants with real-time presence indicators.
 *
 * @example
 * ```tsx
 * <ParticipantList
 *   participants={[
 *     { id: 'peer-1', displayName: 'Alice', role: 'owner', isMuted: false, isSpeaking: true },
 *     { id: 'peer-2', displayName: 'Bob', role: 'participant', isMuted: true, isSpeaking: false },
 *   ]}
 *   activeSpeakerId="peer-1"
 *   localPeerId="peer-1"
 *   layout="horizontal"
 *   showRoleBadge
 * />
 * ```
 */
export function ParticipantList({
  participants,
  activeSpeakerId,
  localPeerId,
  layout = "vertical",
  maxVisible,
  showConnectionStatus = false,
  showRoleBadge = true,
  onParticipantClick,
  className = "",
  viewportAware = false,
}: ParticipantListProps) {
  // Track available height for viewport-aware sizing
  const [availableHeight, setAvailableHeight] = useState<number | undefined>(
    undefined,
  );

  useEffect(() => {
    if (!viewportAware) return;

    const calculateHeight = () => {
      // Estimate fixed UI elements:
      // Header: ~100px (with status row)
      // Footer controls: ~140px
      // Padding: ~32px
      // Safe area (mobile): ~40px
      const fixedHeight = 100 + 140 + 32 + 40;
      const available = window.innerHeight - fixedHeight;
      setAvailableHeight(Math.max(100, available)); // Minimum 100px
    };

    calculateHeight();
    window.addEventListener("resize", calculateHeight);
    return () => window.removeEventListener("resize", calculateHeight);
  }, [viewportAware]);

  // Sort participants: AI first, then local, then by role, then by name
  const sortedParticipants = useMemo(() => {
    return [...participants].sort((a, b) => {
      // AI always first
      if (a.isAI && !b.isAI) return -1;
      if (!a.isAI && b.isAI) return 1;

      // Local user second
      if (a.isLocal && !b.isLocal) return -1;
      if (!a.isLocal && b.isLocal) return 1;
      if (a.id === localPeerId && b.id !== localPeerId) return -1;
      if (a.id !== localPeerId && b.id === localPeerId) return 1;

      // Then by role
      const roleOrder: Record<PeerRole, number> = {
        owner: 0,
        moderator: 1,
        participant: 2,
      };
      const roleCompare = roleOrder[a.role] - roleOrder[b.role];
      if (roleCompare !== 0) return roleCompare;

      // Then alphabetically
      return a.displayName.localeCompare(b.displayName);
    });
  }, [participants, localPeerId]);

  // Build color map: each participant gets a unique color, AI always gets purple
  const participantColorMap = useMemo(() => {
    const colorMap = new Map<string, ParticipantColorConfig>();
    let humanIndex = 0;

    for (const participant of sortedParticipants) {
      colorMap.set(
        participant.id,
        getParticipantColor(humanIndex, participant.isAI),
      );
      // Only increment index for non-AI participants
      if (!participant.isAI) {
        humanIndex++;
      }
    }

    return colorMap;
  }, [sortedParticipants]);

  // Apply max visible limit
  const visibleParticipants = maxVisible
    ? sortedParticipants.slice(0, maxVisible)
    : sortedParticipants;
  const overflowCount = maxVisible
    ? Math.max(0, sortedParticipants.length - maxVisible)
    : 0;

  // Get dynamic size based on participant count and available height
  const avatarSize = getAvatarSize(
    visibleParticipants.length + (overflowCount > 0 ? 1 : 0),
    viewportAware ? availableHeight : undefined,
  );
  const sizeConfig = AVATAR_SIZE_CLASSES[avatarSize];

  if (participants.length === 0) {
    return (
      <div
        className={`text-center text-gray-500 dark:text-gray-400 py-4 ${className}`}
        role="status"
      >
        No participants in this room
      </div>
    );
  }

  return (
    <div
      className={`flex flex-wrap items-center justify-center gap-2 ${className}`}
      role="list"
      aria-label="Room participants"
    >
      {visibleParticipants.map((participant) => (
        <ParticipantItem
          key={participant.id}
          participant={participant}
          isActiveSpeaker={activeSpeakerId === participant.id}
          isLocal={participant.isLocal || participant.id === localPeerId}
          showConnectionStatus={showConnectionStatus}
          showRoleBadge={showRoleBadge}
          sizeConfig={sizeConfig}
          colorConfig={participantColorMap.get(participant.id)!}
          onClick={
            onParticipantClick
              ? () => onParticipantClick(participant.id)
              : undefined
          }
        />
      ))}

      {overflowCount > 0 && (
        <OverflowIndicator count={overflowCount} sizeConfig={sizeConfig} />
      )}
    </div>
  );
}

/**
 * Export default for convenience
 */
export default ParticipantList;
