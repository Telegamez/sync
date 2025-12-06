/**
 * ParticipantAvatar Component
 *
 * Displays a participant avatar with status indicators for speaking, muted,
 * and connection state. Supports image avatars or initial-based fallbacks.
 *
 * Part of the Long-Horizon Engineering Protocol - FEAT-115
 */

'use client';

import { useMemo, type CSSProperties } from 'react';
import type { PeerConnectionState } from '@/types/peer';

/**
 * Avatar size presets
 */
export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

/**
 * ParticipantAvatar props
 */
export interface ParticipantAvatarProps {
  /** Display name for initials generation */
  displayName: string;
  /** Optional avatar image URL */
  avatarUrl?: string;
  /** Avatar size */
  size?: AvatarSize;
  /** Whether participant is speaking (shows ring animation) */
  isSpeaking?: boolean;
  /** Whether participant is muted (shows mute icon) */
  isMuted?: boolean;
  /** Whether participant is addressing AI (PTT active) */
  isAddressingAI?: boolean;
  /** Audio level for ring animation intensity (0-1) */
  audioLevel?: number;
  /** Connection state */
  connectionState?: PeerConnectionState;
  /** Whether this is the active speaker (stronger highlight) */
  isActiveSpeaker?: boolean;
  /** Whether this is the local user */
  isLocal?: boolean;
  /** Show connection status indicator */
  showConnectionStatus?: boolean;
  /** Custom class name */
  className?: string;
  /** Click handler */
  onClick?: () => void;
}

/**
 * Size configuration
 */
const SIZE_CONFIG: Record<AvatarSize, { container: string; text: string; badge: string; ring: number }> = {
  xs: { container: 'w-6 h-6', text: 'text-xs', badge: 'w-3 h-3', ring: 2 },
  sm: { container: 'w-8 h-8', text: 'text-xs', badge: 'w-3.5 h-3.5', ring: 2 },
  md: { container: 'w-10 h-10', text: 'text-sm', badge: 'w-4 h-4', ring: 3 },
  lg: { container: 'w-12 h-12', text: 'text-base', badge: 'w-5 h-5', ring: 3 },
  xl: { container: 'w-16 h-16', text: 'text-lg', badge: 'w-6 h-6', ring: 4 },
};

/**
 * Background colors for initials (based on name hash)
 */
const AVATAR_COLORS = [
  'bg-red-500',
  'bg-orange-500',
  'bg-amber-500',
  'bg-yellow-500',
  'bg-lime-500',
  'bg-green-500',
  'bg-emerald-500',
  'bg-teal-500',
  'bg-cyan-500',
  'bg-sky-500',
  'bg-blue-500',
  'bg-indigo-500',
  'bg-violet-500',
  'bg-purple-500',
  'bg-fuchsia-500',
  'bg-pink-500',
  'bg-rose-500',
];

/**
 * Generate initials from display name
 */
function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

/**
 * Get consistent color based on name
 */
function getNameColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    const char = name.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
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
 * Mute icon SVG
 */
function MuteIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
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
  );
}

/**
 * AI/Globe icon for PTT indicator
 */
function AIIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" />
    </svg>
  );
}

/**
 * ParticipantAvatar Component
 *
 * Displays a participant's avatar with optional status indicators.
 *
 * @example
 * ```tsx
 * <ParticipantAvatar
 *   displayName="Alice Johnson"
 *   isSpeaking={true}
 *   audioLevel={0.7}
 *   size="lg"
 * />
 *
 * <ParticipantAvatar
 *   displayName="Bob Smith"
 *   avatarUrl="https://example.com/bob.jpg"
 *   isMuted={true}
 *   connectionState="connected"
 * />
 * ```
 */
export function ParticipantAvatar({
  displayName,
  avatarUrl,
  size = 'md',
  isSpeaking = false,
  isMuted = false,
  isAddressingAI = false,
  audioLevel = 0,
  connectionState,
  isActiveSpeaker = false,
  isLocal = false,
  showConnectionStatus = false,
  className = '',
  onClick,
}: ParticipantAvatarProps) {
  const config = SIZE_CONFIG[size];
  const initials = useMemo(() => getInitials(displayName), [displayName]);
  const bgColor = useMemo(() => getNameColor(displayName), [displayName]);
  const connectionColor = getConnectionStatusColor(connectionState);
  const connectionLabel = getConnectionStatusLabel(connectionState);

  // Speaking ring animation style
  const speakingRingStyle = useMemo((): CSSProperties => {
    if (!isSpeaking) return {};

    const intensity = Math.min(audioLevel * 2 + 0.3, 1);
    const baseRing = config.ring;
    const expandedRing = baseRing + intensity * 4;

    return {
      boxShadow: `0 0 0 ${expandedRing}px rgba(34, 197, 94, ${intensity * 0.6})`,
      transition: 'box-shadow 0.15s ease-out',
    };
  }, [isSpeaking, audioLevel, config.ring]);

  // Active speaker ring style
  const activeSpeakerStyle = useMemo((): CSSProperties => {
    if (!isActiveSpeaker) return {};

    return {
      boxShadow: `0 0 0 ${config.ring}px rgba(34, 197, 94, 0.8)`,
    };
  }, [isActiveSpeaker, config.ring]);

  // PTT indicator style
  const pttStyle = useMemo((): CSSProperties => {
    if (!isAddressingAI) return {};

    return {
      boxShadow: `0 0 0 ${config.ring}px rgba(168, 85, 247, 0.7)`,
    };
  }, [isAddressingAI, config.ring]);

  // Combine all ring styles (speaking takes precedence)
  const ringStyle = isSpeaking
    ? speakingRingStyle
    : isAddressingAI
      ? pttStyle
      : isActiveSpeaker
        ? activeSpeakerStyle
        : {};

  // Border color based on state
  const borderColor = isSpeaking
    ? 'border-green-500'
    : isAddressingAI
      ? 'border-purple-500'
      : isActiveSpeaker
        ? 'border-green-400'
        : 'border-gray-200 dark:border-gray-600';

  // Build aria-label
  const ariaLabel = useMemo(() => {
    const parts = [displayName];
    if (isLocal) parts.push('(You)');
    if (isMuted) parts.push('muted');
    if (isSpeaking) parts.push('speaking');
    if (isAddressingAI) parts.push('addressing AI');
    if (isActiveSpeaker) parts.push('active speaker');
    if (connectionState && connectionState !== 'connected') {
      parts.push(connectionLabel.toLowerCase());
    }
    return parts.join(', ');
  }, [displayName, isLocal, isMuted, isSpeaking, isAddressingAI, isActiveSpeaker, connectionState, connectionLabel]);

  const Component = onClick ? 'button' : 'div';

  return (
    <Component
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`
        relative inline-block rounded-full
        ${onClick ? 'cursor-pointer hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500' : ''}
        ${className}
      `}
      aria-label={ariaLabel}
      style={ringStyle}
    >
      {/* Avatar */}
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt={displayName}
          className={`
            ${config.container} rounded-full object-cover border-2 transition-colors
            ${borderColor}
          `}
        />
      ) : (
        <div
          className={`
            ${config.container} ${config.text} ${bgColor}
            rounded-full flex items-center justify-center font-medium text-white
            border-2 transition-colors
            ${borderColor}
          `}
        >
          {initials}
        </div>
      )}

      {/* Mute indicator */}
      {isMuted && (
        <div
          className={`
            absolute -bottom-0.5 -right-0.5 bg-red-500 rounded-full p-0.5
            flex items-center justify-center
          `}
          title="Muted"
        >
          <MuteIcon className={`${size === 'xs' ? 'w-2 h-2' : 'w-3 h-3'} text-white`} />
        </div>
      )}

      {/* PTT/Addressing AI indicator */}
      {isAddressingAI && !isMuted && (
        <div
          className={`
            absolute -top-0.5 -left-0.5 bg-purple-500 rounded-full p-0.5
            flex items-center justify-center
          `}
          title="Addressing AI"
        >
          <AIIcon className={`${size === 'xs' ? 'w-2 h-2' : 'w-3 h-3'} text-white`} />
        </div>
      )}

      {/* Connection status indicator */}
      {showConnectionStatus && connectionState && connectionState !== 'connected' && (
        <div
          className={`
            absolute -top-0.5 -right-0.5 rounded-full
            ${size === 'xs' ? 'w-2 h-2' : 'w-3 h-3'}
            ${connectionColor}
          `}
          title={connectionLabel}
        />
      )}

      {/* Local user indicator (small dot) */}
      {isLocal && !isMuted && !isAddressingAI && (
        <div
          className={`
            absolute -bottom-0.5 -right-0.5 bg-blue-500 rounded-full
            ${size === 'xs' ? 'w-2 h-2' : 'w-2.5 h-2.5'}
            border border-white dark:border-gray-800
          `}
          title="You"
        />
      )}
    </Component>
  );
}

/**
 * Export default for convenience
 */
export default ParticipantAvatar;
