/**
 * PTTButton Component
 *
 * Push-to-Talk button with hold-to-talk interaction, visual feedback,
 * keyboard accessibility, and mobile touch support.
 *
 * Part of the Long-Horizon Engineering Protocol - FEAT-154
 */

'use client';

import { forwardRef, useCallback, useEffect, useState, useMemo } from 'react';
import { usePushToTalk, type UsePushToTalkOptions, type UsePushToTalkCallbacks } from '@/hooks/usePushToTalk';
import type { AIResponseState } from '@/types/voice-mode';

/**
 * PTT button size variants
 */
export type PTTButtonSize = 'sm' | 'md' | 'lg' | 'xl';

/**
 * PTT button variant styles
 */
export type PTTButtonVariant = 'default' | 'primary' | 'minimal';

/**
 * PTTButton props
 */
export interface PTTButtonProps {
  /** Current AI state (determines if PTT can be activated) */
  aiState?: AIResponseState;
  /** Whether the user is in a turn queue */
  isInQueue?: boolean;
  /** Whether the user is a designated speaker */
  isDesignatedSpeaker?: boolean;
  /** Voice mode (affects PTT behavior) */
  voiceMode?: 'open' | 'pushToTalk' | 'wakeWord' | 'designatedSpeaker';
  /** Whether PTT is enabled */
  enabled?: boolean;
  /** Button size variant */
  size?: PTTButtonSize;
  /** Button style variant */
  variant?: PTTButtonVariant;
  /** Show duration indicator while active */
  showDuration?: boolean;
  /** Show block reason tooltip when disabled */
  showBlockReason?: boolean;
  /** Enable keyboard activation (Space key) */
  enableKeyboard?: boolean;
  /** Minimum hold time before activation (ms) */
  minHoldTimeMs?: number;
  /** Maximum PTT duration (ms) */
  maxDurationMs?: number;
  /** Enable haptic feedback on mobile */
  enableHapticFeedback?: boolean;
  /** Custom label when idle */
  idleLabel?: string;
  /** Custom label when active */
  activeLabel?: string;
  /** Custom label when disabled */
  disabledLabel?: string;
  /** Custom class name */
  className?: string;
  /** Custom inline styles */
  style?: React.CSSProperties;
  /** Callback when PTT starts */
  onPTTStart?: (method: 'keyboard' | 'mouse' | 'touch' | 'programmatic') => void;
  /** Callback when PTT ends */
  onPTTEnd?: (duration: number) => void;
  /** Callback when PTT is blocked */
  onPTTBlocked?: (reason: 'ai_speaking' | 'not_designated' | 'queue_full' | undefined) => void;
  /** Callback when PTT state changes */
  onPTTStateChange?: (state: {
    isActive: boolean;
    activatedAt?: Date;
    canActivate: boolean;
    blockReason?: 'ai_speaking' | 'not_designated' | 'queue_full';
  }) => void;
}

/**
 * Size configurations
 */
const SIZE_CONFIG = {
  sm: {
    button: 'w-12 h-12',
    icon: 'w-5 h-5',
    text: 'text-xs',
    ring: 'ring-2',
    pulse: 'scale-95',
  },
  md: {
    button: 'w-16 h-16',
    icon: 'w-6 h-6',
    text: 'text-sm',
    ring: 'ring-2',
    pulse: 'scale-95',
  },
  lg: {
    button: 'w-20 h-20',
    icon: 'w-8 h-8',
    text: 'text-base',
    ring: 'ring-4',
    pulse: 'scale-95',
  },
  xl: {
    button: 'w-24 h-24',
    icon: 'w-10 h-10',
    text: 'text-lg',
    ring: 'ring-4',
    pulse: 'scale-95',
  },
};

/**
 * Variant configurations
 */
const VARIANT_CONFIG = {
  default: {
    idle: 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700',
    active: 'bg-green-500 text-white shadow-lg shadow-green-500/30',
    disabled: 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed',
    ring: 'ring-green-400',
  },
  primary: {
    idle: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 hover:bg-purple-200 dark:hover:bg-purple-900/50',
    active: 'bg-purple-600 text-white shadow-lg shadow-purple-600/30',
    disabled: 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed',
    ring: 'ring-purple-400',
  },
  minimal: {
    idle: 'bg-transparent text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800',
    active: 'bg-green-500/20 text-green-600 dark:text-green-400',
    disabled: 'bg-transparent text-gray-300 dark:text-gray-600 cursor-not-allowed',
    ring: 'ring-green-400',
  },
};

/**
 * Block reason messages
 */
const BLOCK_REASON_MESSAGES: Record<string, string> = {
  ai_speaking: 'AI is speaking',
  not_designated: 'Not a designated speaker',
  queue_full: 'Queue is full',
};

/**
 * Microphone icon
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
 * Wave/speaking icon
 */
function SpeakingIcon({ className }: { className?: string }) {
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
        d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
      />
    </svg>
  );
}

/**
 * Blocked/lock icon
 */
function BlockedIcon({ className }: { className?: string }) {
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
        d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
      />
    </svg>
  );
}

/**
 * Format duration in seconds with one decimal
 */
function formatDuration(ms: number): string {
  const seconds = ms / 1000;
  if (seconds < 10) {
    return `${seconds.toFixed(1)}s`;
  }
  return `${Math.floor(seconds)}s`;
}

/**
 * PTTButton Component
 *
 * A hold-to-talk button for push-to-talk functionality with visual feedback,
 * keyboard support, and mobile touch handling.
 *
 * @example
 * ```tsx
 * <PTTButton
 *   aiState="idle"
 *   size="lg"
 *   onPTTStart={() => startRecording()}
 *   onPTTEnd={(duration) => stopRecording()}
 * />
 * ```
 */
export const PTTButton = forwardRef<HTMLButtonElement, PTTButtonProps>(
  function PTTButton(
    {
      aiState = 'idle',
      isInQueue = false,
      isDesignatedSpeaker = true,
      voiceMode = 'pushToTalk',
      enabled = true,
      size = 'lg',
      variant = 'default',
      showDuration = true,
      showBlockReason = true,
      enableKeyboard = true,
      minHoldTimeMs = 0,
      maxDurationMs = 120000,
      enableHapticFeedback = true,
      idleLabel = 'Hold to talk',
      activeLabel = 'Speaking...',
      disabledLabel = 'Cannot speak',
      className = '',
      style,
      onPTTStart,
      onPTTEnd,
      onPTTBlocked,
      onPTTStateChange,
    },
    ref
  ) {
    const sizeConfig = SIZE_CONFIG[size];
    const variantConfig = VARIANT_CONFIG[variant];

    // Use the PTT hook
    const {
      pttState,
      isActive,
      canActivate,
      blockReason,
      activeDuration,
      buttonProps,
    } = usePushToTalk(
      {
        enabled,
        aiState,
        isInQueue,
        isDesignatedSpeaker,
        voiceMode,
        enableKeyboard,
        minHoldTimeMs,
        maxDurationMs,
        enableHapticFeedback,
      } as UsePushToTalkOptions,
      {
        onPTTStart,
        onPTTEnd,
        onPTTBlocked,
        onPTTStateChange,
      } as UsePushToTalkCallbacks
    );

    // State for tooltip visibility
    const [showTooltip, setShowTooltip] = useState(false);

    // Show tooltip on block
    useEffect(() => {
      if (!canActivate && blockReason && showBlockReason) {
        setShowTooltip(true);
        const timer = setTimeout(() => setShowTooltip(false), 3000);
        return () => clearTimeout(timer);
      }
    }, [canActivate, blockReason, showBlockReason]);

    // Determine current visual state
    const visualState = useMemo(() => {
      if (!canActivate || !enabled) return 'disabled';
      if (isActive) return 'active';
      return 'idle';
    }, [canActivate, enabled, isActive]);

    // Determine icon to show
    const icon = useMemo(() => {
      if (visualState === 'disabled' && blockReason) {
        return <BlockedIcon className={sizeConfig.icon} />;
      }
      if (visualState === 'active') {
        return <SpeakingIcon className={`${sizeConfig.icon} animate-pulse`} />;
      }
      return <MicrophoneIcon className={sizeConfig.icon} />;
    }, [visualState, blockReason, sizeConfig.icon]);

    // Determine label
    const label = useMemo(() => {
      if (visualState === 'disabled') {
        if (blockReason) {
          return BLOCK_REASON_MESSAGES[blockReason] || disabledLabel;
        }
        return disabledLabel;
      }
      if (visualState === 'active') {
        return activeLabel;
      }
      return idleLabel;
    }, [visualState, blockReason, idleLabel, activeLabel, disabledLabel]);

    // Build class names
    const buttonClasses = useMemo(() => {
      const baseClasses = `
        ${sizeConfig.button}
        rounded-full
        flex flex-col items-center justify-center
        transition-all duration-200
        focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500
        select-none
        touch-none
      `;

      const stateClasses = variantConfig[visualState];

      const activeRingClasses = isActive
        ? `${sizeConfig.ring} ${variantConfig.ring} animate-pulse`
        : '';

      const pressedClasses = isActive ? sizeConfig.pulse : '';

      return `${baseClasses} ${stateClasses} ${activeRingClasses} ${pressedClasses} ${className}`.trim();
    }, [
      sizeConfig,
      variantConfig,
      visualState,
      isActive,
      className,
    ]);

    // Build aria label
    const ariaLabel = useMemo(() => {
      const baseLabel = label;
      if (enableKeyboard) {
        return `${baseLabel} (Space to activate)`;
      }
      return baseLabel;
    }, [label, enableKeyboard]);

    return (
      <div className="relative inline-flex flex-col items-center">
        {/* Tooltip for block reason */}
        {showTooltip && blockReason && (
          <div
            className="absolute -top-10 left-1/2 -translate-x-1/2 px-2 py-1
                       bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900
                       text-xs rounded shadow-lg whitespace-nowrap z-10"
            role="tooltip"
            aria-live="polite"
          >
            {BLOCK_REASON_MESSAGES[blockReason]}
          </div>
        )}

        {/* Main button */}
        <button
          ref={ref}
          type="button"
          className={buttonClasses}
          style={style}
          aria-label={ariaLabel}
          aria-disabled={!canActivate || !enabled}
          data-state={visualState}
          data-ptt-active={isActive}
          {...buttonProps}
        >
          {icon}

          {/* Duration display when active */}
          {isActive && showDuration && (
            <span className={`mt-1 ${sizeConfig.text} font-mono`}>
              {formatDuration(activeDuration)}
            </span>
          )}
        </button>

        {/* Label below button */}
        <span
          className={`mt-2 ${sizeConfig.text} text-center text-gray-600 dark:text-gray-400`}
          aria-hidden="true"
        >
          {label}
        </span>
      </div>
    );
  }
);

/**
 * Simplified PTT button for inline use
 */
export interface InlinePTTButtonProps extends Omit<PTTButtonProps, 'size' | 'variant' | 'showDuration'> {
  /** Custom class name */
  className?: string;
}

export function InlinePTTButton({
  className = '',
  ...props
}: InlinePTTButtonProps) {
  return (
    <PTTButton
      size="sm"
      variant="minimal"
      showDuration={false}
      showBlockReason={false}
      className={className}
      {...props}
    />
  );
}

/**
 * Large centered PTT button for main room interface
 */
export interface MainPTTButtonProps extends Omit<PTTButtonProps, 'size' | 'variant'> {
  /** Custom class name */
  className?: string;
}

export function MainPTTButton({
  className = '',
  ...props
}: MainPTTButtonProps) {
  return (
    <PTTButton
      size="xl"
      variant="primary"
      showDuration={true}
      showBlockReason={true}
      className={className}
      {...props}
    />
  );
}

export default PTTButton;
