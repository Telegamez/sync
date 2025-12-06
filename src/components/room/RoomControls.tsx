/**
 * RoomControls Component
 *
 * Control bar for room actions: mute/unmute, leave room, and settings.
 * Fully accessible with keyboard navigation support.
 *
 * Part of the Long-Horizon Engineering Protocol - FEAT-116
 */

'use client';

import { useCallback, useState, type KeyboardEvent } from 'react';

/**
 * RoomControls props
 */
export interface RoomControlsProps {
  /** Whether the local user is muted */
  isMuted: boolean;
  /** Callback to toggle mute state */
  onMuteToggle: () => void;
  /** Callback when leaving the room */
  onLeaveRoom: () => void;
  /** Optional callback for settings button */
  onSettingsClick?: () => void;
  /** Whether leaving is in progress */
  isLeaving?: boolean;
  /** Whether the user is currently speaking to AI (PTT active) */
  isAddressingAI?: boolean;
  /** Callback for PTT (push-to-talk) button press */
  onPTTStart?: () => void;
  /** Callback for PTT button release */
  onPTTEnd?: () => void;
  /** Whether to show the PTT button */
  showPTT?: boolean;
  /** Whether to show the settings button */
  showSettings?: boolean;
  /** Layout orientation */
  layout?: 'horizontal' | 'vertical';
  /** Button size */
  size?: 'sm' | 'md' | 'lg';
  /** Custom class name */
  className?: string;
}

/**
 * Size configuration for buttons
 */
const SIZE_CONFIG = {
  sm: {
    button: 'w-10 h-10',
    icon: 'w-5 h-5',
    text: 'text-xs',
    gap: 'gap-2',
  },
  md: {
    button: 'w-12 h-12',
    icon: 'w-6 h-6',
    text: 'text-sm',
    gap: 'gap-3',
  },
  lg: {
    button: 'w-14 h-14',
    icon: 'w-7 h-7',
    text: 'text-base',
    gap: 'gap-4',
  },
};

/**
 * Microphone icon (unmuted)
 */
function MicrophoneIcon({ className }: { className?: string }) {
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
        d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
      />
    </svg>
  );
}

/**
 * Microphone off icon (muted)
 */
function MicrophoneOffIcon({ className }: { className?: string }) {
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
 * Leave/exit icon
 */
function LeaveIcon({ className }: { className?: string }) {
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
        d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
      />
    </svg>
  );
}

/**
 * Settings/cog icon
 */
function SettingsIcon({ className }: { className?: string }) {
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
        d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
      />
    </svg>
  );
}

/**
 * PTT/AI icon
 */
function PTTIcon({ className }: { className?: string }) {
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
        d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
      />
    </svg>
  );
}

/**
 * Loading spinner
 */
function LoadingSpinner({ className }: { className?: string }) {
  return (
    <svg
      className={`animate-spin ${className}`}
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}

/**
 * Control button component
 */
function ControlButton({
  onClick,
  onMouseDown,
  onMouseUp,
  onMouseLeave,
  onTouchStart,
  onTouchEnd,
  onKeyDown,
  onKeyUp,
  label,
  icon,
  variant = 'default',
  size = 'md',
  isActive = false,
  isLoading = false,
  disabled = false,
}: {
  onClick?: () => void;
  onMouseDown?: () => void;
  onMouseUp?: () => void;
  onMouseLeave?: () => void;
  onTouchStart?: () => void;
  onTouchEnd?: () => void;
  onKeyDown?: (e: KeyboardEvent<HTMLButtonElement>) => void;
  onKeyUp?: (e: KeyboardEvent<HTMLButtonElement>) => void;
  label: string;
  icon: React.ReactNode;
  variant?: 'default' | 'danger' | 'active' | 'muted';
  size?: 'sm' | 'md' | 'lg';
  isActive?: boolean;
  isLoading?: boolean;
  disabled?: boolean;
}) {
  const config = SIZE_CONFIG[size];

  const variantClasses = {
    default: 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600',
    danger: 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50',
    active: 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-900/50 ring-2 ring-green-500',
    muted: 'bg-red-500 text-white hover:bg-red-600',
  };

  return (
    <button
      type="button"
      onClick={onClick}
      onMouseDown={onMouseDown}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseLeave}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
      disabled={disabled || isLoading}
      className={`
        ${config.button} rounded-full flex items-center justify-center
        transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2
        ${isActive ? 'ring-2 ring-purple-500' : ''}
        ${variantClasses[variant]}
        ${disabled || isLoading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
      `}
      aria-label={label}
      aria-pressed={isActive}
    >
      {isLoading ? (
        <LoadingSpinner className={config.icon} />
      ) : (
        icon
      )}
    </button>
  );
}

/**
 * RoomControls Component
 *
 * Control bar for room actions with full keyboard accessibility.
 *
 * @example
 * ```tsx
 * <RoomControls
 *   isMuted={false}
 *   onMuteToggle={() => setMuted(!muted)}
 *   onLeaveRoom={() => navigate('/rooms')}
 *   onSettingsClick={() => setShowSettings(true)}
 *   showSettings
 * />
 * ```
 */
export function RoomControls({
  isMuted,
  onMuteToggle,
  onLeaveRoom,
  onSettingsClick,
  isLeaving = false,
  isAddressingAI = false,
  onPTTStart,
  onPTTEnd,
  showPTT = false,
  showSettings = false,
  layout = 'horizontal',
  size = 'md',
  className = '',
}: RoomControlsProps) {
  const config = SIZE_CONFIG[size];
  const [isPTTActive, setIsPTTActive] = useState(false);

  /**
   * Handle PTT start (mouse/touch down)
   */
  const handlePTTStart = useCallback(() => {
    if (onPTTStart) {
      setIsPTTActive(true);
      onPTTStart();
    }
  }, [onPTTStart]);

  /**
   * Handle PTT end (mouse/touch up or leave)
   */
  const handlePTTEnd = useCallback(() => {
    if (onPTTEnd && isPTTActive) {
      setIsPTTActive(false);
      onPTTEnd();
    }
  }, [onPTTEnd, isPTTActive]);

  /**
   * Handle PTT keyboard events
   */
  const handlePTTKeyDown = useCallback(
    (e: KeyboardEvent<HTMLButtonElement>) => {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        if (!isPTTActive) {
          handlePTTStart();
        }
      }
    },
    [handlePTTStart, isPTTActive]
  );

  const handlePTTKeyUp = useCallback(
    (e: KeyboardEvent<HTMLButtonElement>) => {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        handlePTTEnd();
      }
    },
    [handlePTTEnd]
  );

  /**
   * Handle mute keyboard shortcut (M key)
   */
  const handleMuteKeyDown = useCallback(
    (e: KeyboardEvent<HTMLButtonElement>) => {
      if (e.key === 'm' || e.key === 'M') {
        e.preventDefault();
        onMuteToggle();
      }
    },
    [onMuteToggle]
  );

  const isHorizontal = layout === 'horizontal';

  return (
    <div
      className={`
        flex items-center justify-center
        ${isHorizontal ? `flex-row ${config.gap}` : `flex-col ${config.gap}`}
        ${className}
      `}
      role="toolbar"
      aria-label="Room controls"
    >
      {/* Mute/Unmute button */}
      <ControlButton
        onClick={onMuteToggle}
        onKeyDown={handleMuteKeyDown}
        label={isMuted ? 'Unmute microphone (M)' : 'Mute microphone (M)'}
        icon={
          isMuted ? (
            <MicrophoneOffIcon className={config.icon} />
          ) : (
            <MicrophoneIcon className={config.icon} />
          )
        }
        variant={isMuted ? 'muted' : 'default'}
        size={size}
      />

      {/* PTT button (optional) */}
      {showPTT && (
        <ControlButton
          onMouseDown={handlePTTStart}
          onMouseUp={handlePTTEnd}
          onMouseLeave={handlePTTEnd}
          onTouchStart={handlePTTStart}
          onTouchEnd={handlePTTEnd}
          onKeyDown={handlePTTKeyDown}
          onKeyUp={handlePTTKeyUp}
          label={isPTTActive || isAddressingAI ? 'Release to stop talking to AI' : 'Hold to talk to AI'}
          icon={<PTTIcon className={config.icon} />}
          variant={isPTTActive || isAddressingAI ? 'active' : 'default'}
          size={size}
          isActive={isPTTActive || isAddressingAI}
        />
      )}

      {/* Settings button (optional) */}
      {showSettings && onSettingsClick && (
        <ControlButton
          onClick={onSettingsClick}
          label="Room settings"
          icon={<SettingsIcon className={config.icon} />}
          variant="default"
          size={size}
        />
      )}

      {/* Leave room button */}
      <ControlButton
        onClick={onLeaveRoom}
        label="Leave room"
        icon={<LeaveIcon className={config.icon} />}
        variant="danger"
        size={size}
        isLoading={isLeaving}
        disabled={isLeaving}
      />
    </div>
  );
}

/**
 * Export default for convenience
 */
export default RoomControls;
