/**
 * ParticipantList Component
 *
 * Displays all participants in a room with real-time speaking/muted indicators.
 * Highlights the current active speaker and supports responsive layouts.
 *
 * Part of the Long-Horizon Engineering Protocol - FEAT-114
 */

'use client';

import { useMemo } from 'react';
import type { PeerId, PeerSummary, PeerRole, PeerConnectionState } from '@/types/peer';

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
}

/**
 * Layout orientation
 */
export type ParticipantListLayout = 'horizontal' | 'vertical' | 'grid';

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
    case 'owner':
      return 'Host';
    case 'moderator':
      return 'Mod';
    case 'participant':
      return '';
    default:
      return '';
  }
}

/**
 * Get role badge color
 */
function getRoleBadgeColor(role: PeerRole): string {
  switch (role) {
    case 'owner':
      return 'bg-amber-500 text-white';
    case 'moderator':
      return 'bg-blue-500 text-white';
    default:
      return '';
  }
}

/**
 * Get connection status color
 */
function getConnectionStatusColor(state: PeerConnectionState | undefined): string {
  switch (state) {
    case 'connected':
      return 'bg-green-500';
    case 'connecting':
    case 'reconnecting':
      return 'bg-yellow-500';
    case 'disconnected':
    case 'failed':
      return 'bg-red-500';
    default:
      return 'bg-gray-400';
  }
}

/**
 * Get connection status label
 */
function getConnectionStatusLabel(state: PeerConnectionState | undefined): string {
  switch (state) {
    case 'connected':
      return 'Connected';
    case 'connecting':
      return 'Connecting...';
    case 'reconnecting':
      return 'Reconnecting...';
    case 'disconnected':
      return 'Disconnected';
    case 'failed':
      return 'Connection failed';
    default:
      return 'Unknown status';
  }
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
  layout,
  onClick,
}: {
  participant: ParticipantInfo;
  isActiveSpeaker: boolean;
  isLocal: boolean;
  showConnectionStatus: boolean;
  showRoleBadge: boolean;
  layout: ParticipantListLayout;
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
  } = participant;

  const initials = getInitials(displayName);
  const roleLabel = getRoleLabel(role);
  const roleBadgeColor = getRoleBadgeColor(role);
  const connectionColor = getConnectionStatusColor(connectionState);
  const connectionLabel = getConnectionStatusLabel(connectionState);

  // Ring animation intensity based on audio level
  const ringIntensity = isSpeaking ? Math.min(audioLevel * 2 + 0.3, 1) : 0;
  const speakingRingStyle = isSpeaking
    ? {
        boxShadow: `0 0 0 ${3 + ringIntensity * 4}px rgba(34, 197, 94, ${ringIntensity * 0.6})`,
      }
    : {};

  // PTT indicator style
  const pttIndicatorStyle = isAddressingAI
    ? {
        boxShadow: `0 0 0 3px rgba(168, 85, 247, 0.7)`,
      }
    : {};

  const isHorizontal = layout === 'horizontal';
  const isGrid = layout === 'grid';

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={`
        flex items-center gap-2 p-2 rounded-lg transition-all duration-200
        ${onClick ? 'hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer' : 'cursor-default'}
        ${isActiveSpeaker ? 'bg-green-50 dark:bg-green-900/20 ring-2 ring-green-500' : ''}
        ${isHorizontal ? 'flex-col w-20' : isGrid ? 'flex-col w-24' : 'w-full'}
      `}
      aria-label={`${displayName}${isLocal ? ' (You)' : ''}${isMuted ? ', muted' : ''}${isSpeaking ? ', speaking' : ''}${isActiveSpeaker ? ', active speaker' : ''}`}
    >
      {/* Avatar */}
      <div
        className="relative"
        style={{ ...speakingRingStyle, ...pttIndicatorStyle }}
      >
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt={displayName}
            className={`
              rounded-full object-cover border-2 transition-all
              ${isSpeaking ? 'border-green-500' : 'border-gray-200 dark:border-gray-600'}
              ${isHorizontal || isGrid ? 'w-12 h-12' : 'w-10 h-10'}
            `}
          />
        ) : (
          <div
            className={`
              rounded-full flex items-center justify-center font-medium
              bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200
              border-2 transition-all
              ${isSpeaking ? 'border-green-500' : 'border-gray-300 dark:border-gray-500'}
              ${isHorizontal || isGrid ? 'w-12 h-12 text-sm' : 'w-10 h-10 text-xs'}
            `}
          >
            {initials}
          </div>
        )}

        {/* Mute indicator */}
        {isMuted && (
          <div
            className="absolute -bottom-1 -right-1 bg-red-500 rounded-full p-0.5"
            title="Muted"
          >
            <svg
              className="w-3 h-3 text-white"
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

        {/* Connection status indicator */}
        {showConnectionStatus && connectionState && connectionState !== 'connected' && (
          <div
            className={`absolute -top-1 -right-1 w-3 h-3 rounded-full ${connectionColor}`}
            title={connectionLabel}
          />
        )}

        {/* PTT indicator */}
        {isAddressingAI && (
          <div
            className="absolute -top-1 -left-1 bg-purple-500 rounded-full p-0.5"
            title="Addressing AI"
          >
            <svg
              className="w-3 h-3 text-white"
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
      <div
        className={`
          flex flex-col items-center overflow-hidden
          ${isHorizontal || isGrid ? 'w-full text-center' : 'flex-1 items-start'}
        `}
      >
        <span
          className={`
            font-medium text-gray-900 dark:text-white truncate max-w-full
            ${isHorizontal || isGrid ? 'text-xs' : 'text-sm'}
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
              text-xs px-1.5 py-0.5 rounded-full mt-0.5
              ${roleBadgeColor}
            `}
          >
            {roleLabel}
          </span>
        )}

        {/* Speaking indicator text (vertical layout only) */}
        {!isHorizontal && !isGrid && isSpeaking && (
          <span className="text-xs text-green-600 dark:text-green-400">
            Speaking
          </span>
        )}
      </div>

      {/* Speaking indicator wave (horizontal/grid only) */}
      {(isHorizontal || isGrid) && isSpeaking && (
        <div className="flex items-center gap-0.5 h-3">
          <div
            className="w-0.5 bg-green-500 rounded-full animate-pulse"
            style={{ height: `${Math.max(30, audioLevel * 100)}%` }}
          />
          <div
            className="w-0.5 bg-green-500 rounded-full animate-pulse"
            style={{ height: `${Math.max(50, audioLevel * 100)}%`, animationDelay: '0.1s' }}
          />
          <div
            className="w-0.5 bg-green-500 rounded-full animate-pulse"
            style={{ height: `${Math.max(30, audioLevel * 100)}%`, animationDelay: '0.2s' }}
          />
        </div>
      )}
    </button>
  );
}

/**
 * Overflow indicator for hidden participants
 */
function OverflowIndicator({
  count,
  layout,
}: {
  count: number;
  layout: ParticipantListLayout;
}) {
  const isHorizontal = layout === 'horizontal';
  const isGrid = layout === 'grid';

  return (
    <div
      className={`
        flex items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-700
        text-gray-600 dark:text-gray-300 font-medium
        ${isHorizontal ? 'flex-col w-20 p-2' : isGrid ? 'flex-col w-24 p-2' : 'w-full p-2'}
      `}
      aria-label={`${count} more participants`}
    >
      <div
        className={`
          rounded-full flex items-center justify-center
          bg-gray-200 dark:bg-gray-600
          ${isHorizontal || isGrid ? 'w-12 h-12 text-lg' : 'w-10 h-10 text-base'}
        `}
      >
        +{count}
      </div>
      {(isHorizontal || isGrid) && (
        <span className="text-xs mt-1">more</span>
      )}
      {!isHorizontal && !isGrid && (
        <span className="ml-2 text-sm">
          {count} more {count === 1 ? 'participant' : 'participants'}
        </span>
      )}
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
  layout = 'vertical',
  maxVisible,
  showConnectionStatus = false,
  showRoleBadge = true,
  onParticipantClick,
  className = '',
}: ParticipantListProps) {
  // Sort participants: local first, then by role (owner > moderator > participant), then by name
  const sortedParticipants = useMemo(() => {
    return [...participants].sort((a, b) => {
      // Local user first
      if (a.isLocal && !b.isLocal) return -1;
      if (!a.isLocal && b.isLocal) return 1;
      if (a.id === localPeerId && b.id !== localPeerId) return -1;
      if (a.id !== localPeerId && b.id === localPeerId) return 1;

      // Then by role
      const roleOrder: Record<PeerRole, number> = { owner: 0, moderator: 1, participant: 2 };
      const roleCompare = roleOrder[a.role] - roleOrder[b.role];
      if (roleCompare !== 0) return roleCompare;

      // Then alphabetically
      return a.displayName.localeCompare(b.displayName);
    });
  }, [participants, localPeerId]);

  // Apply max visible limit
  const visibleParticipants = maxVisible
    ? sortedParticipants.slice(0, maxVisible)
    : sortedParticipants;
  const overflowCount = maxVisible
    ? Math.max(0, sortedParticipants.length - maxVisible)
    : 0;

  // Container styles based on layout
  const containerClasses = useMemo(() => {
    switch (layout) {
      case 'horizontal':
        return 'flex flex-row flex-wrap items-start gap-1';
      case 'grid':
        return 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2';
      case 'vertical':
      default:
        return 'flex flex-col gap-1';
    }
  }, [layout]);

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
      className={`${containerClasses} ${className}`}
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
          layout={layout}
          onClick={onParticipantClick ? () => onParticipantClick(participant.id) : undefined}
        />
      ))}

      {overflowCount > 0 && (
        <OverflowIndicator count={overflowCount} layout={layout} />
      )}
    </div>
  );
}

/**
 * Export default for convenience
 */
export default ParticipantList;
