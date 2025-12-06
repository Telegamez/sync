/**
 * AIStateIndicator Component
 *
 * Displays the current AI response state with visual feedback
 * and queue position when waiting.
 *
 * Part of the Long-Horizon Engineering Protocol - FEAT-155
 */

'use client';

import { useMemo } from 'react';
import type { AIResponseState } from '@/types/voice-mode';

/**
 * AI state indicator size variants
 */
export type AIStateIndicatorSize = 'sm' | 'md' | 'lg';

/**
 * AI state indicator display mode
 */
export type AIStateIndicatorMode = 'compact' | 'expanded' | 'minimal';

/**
 * AIStateIndicator props
 */
export interface AIStateIndicatorProps {
  /** Current AI response state */
  state: AIResponseState;
  /** Queue position (0 = not in queue, 1+ = position) */
  queuePosition?: number;
  /** Total queue length */
  queueLength?: number;
  /** Whether the local user is the current speaker */
  isCurrentSpeaker?: boolean;
  /** Current speaker's display name */
  currentSpeakerName?: string;
  /** Size variant */
  size?: AIStateIndicatorSize;
  /** Display mode */
  mode?: AIStateIndicatorMode;
  /** Whether to show queue info */
  showQueue?: boolean;
  /** Whether to show speaker info */
  showSpeaker?: boolean;
  /** Whether to animate state changes */
  animate?: boolean;
  /** Custom class name */
  className?: string;
  /** Callback when state changes */
  onStateChange?: (state: AIResponseState) => void;
}

/**
 * Size configurations
 */
const SIZE_CONFIG = {
  sm: {
    container: 'px-2 py-1',
    icon: 'w-4 h-4',
    text: 'text-xs',
    gap: 'gap-1.5',
    dot: 'w-2 h-2',
  },
  md: {
    container: 'px-3 py-1.5',
    icon: 'w-5 h-5',
    text: 'text-sm',
    gap: 'gap-2',
    dot: 'w-2.5 h-2.5',
  },
  lg: {
    container: 'px-4 py-2',
    icon: 'w-6 h-6',
    text: 'text-base',
    gap: 'gap-2.5',
    dot: 'w-3 h-3',
  },
};

/**
 * State configurations with colors and labels
 */
const STATE_CONFIG: Record<AIResponseState, {
  label: string;
  shortLabel: string;
  color: string;
  bgColor: string;
  borderColor: string;
  dotColor: string;
  animate: boolean;
}> = {
  idle: {
    label: 'Ready',
    shortLabel: 'Ready',
    color: 'text-gray-600 dark:text-gray-400',
    bgColor: 'bg-gray-100 dark:bg-gray-800',
    borderColor: 'border-gray-200 dark:border-gray-700',
    dotColor: 'bg-gray-400 dark:bg-gray-500',
    animate: false,
  },
  listening: {
    label: 'Listening...',
    shortLabel: 'Listening',
    color: 'text-blue-600 dark:text-blue-400',
    bgColor: 'bg-blue-50 dark:bg-blue-900/30',
    borderColor: 'border-blue-200 dark:border-blue-800',
    dotColor: 'bg-blue-500',
    animate: true,
  },
  processing: {
    label: 'Thinking...',
    shortLabel: 'Thinking',
    color: 'text-amber-600 dark:text-amber-400',
    bgColor: 'bg-amber-50 dark:bg-amber-900/30',
    borderColor: 'border-amber-200 dark:border-amber-800',
    dotColor: 'bg-amber-500',
    animate: true,
  },
  speaking: {
    label: 'Speaking...',
    shortLabel: 'Speaking',
    color: 'text-green-600 dark:text-green-400',
    bgColor: 'bg-green-50 dark:bg-green-900/30',
    borderColor: 'border-green-200 dark:border-green-800',
    dotColor: 'bg-green-500',
    animate: true,
  },
  locked: {
    label: 'Locked',
    shortLabel: 'Locked',
    color: 'text-red-600 dark:text-red-400',
    bgColor: 'bg-red-50 dark:bg-red-900/30',
    borderColor: 'border-red-200 dark:border-red-800',
    dotColor: 'bg-red-500',
    animate: false,
  },
};

/**
 * Idle icon (circle)
 */
function IdleIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" strokeWidth={2} />
    </svg>
  );
}

/**
 * Listening icon (ear/microphone)
 */
function ListeningIcon({ className }: { className?: string }) {
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
 * Processing icon (brain/thinking)
 */
function ProcessingIcon({ className }: { className?: string }) {
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
        d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
      />
    </svg>
  );
}

/**
 * Speaking icon (sound waves)
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
        d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
      />
    </svg>
  );
}

/**
 * Locked icon (lock)
 */
function LockedIcon({ className }: { className?: string }) {
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
 * Queue icon (list)
 */
function QueueIcon({ className }: { className?: string }) {
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
        d="M4 6h16M4 12h16M4 18h16"
      />
    </svg>
  );
}

/**
 * Get icon component for state
 */
function getStateIcon(state: AIResponseState, className?: string) {
  switch (state) {
    case 'idle':
      return <IdleIcon className={className} />;
    case 'listening':
      return <ListeningIcon className={className} />;
    case 'processing':
      return <ProcessingIcon className={className} />;
    case 'speaking':
      return <SpeakingIcon className={className} />;
    case 'locked':
      return <LockedIcon className={className} />;
  }
}

/**
 * AIStateIndicator Component
 *
 * Displays the current AI response state with visual feedback.
 *
 * @example
 * ```tsx
 * <AIStateIndicator
 *   state="listening"
 *   queuePosition={2}
 *   queueLength={5}
 *   size="md"
 * />
 * ```
 */
export function AIStateIndicator({
  state,
  queuePosition = 0,
  queueLength = 0,
  isCurrentSpeaker = false,
  currentSpeakerName,
  size = 'md',
  mode = 'compact',
  showQueue = true,
  showSpeaker = true,
  animate = true,
  className = '',
}: AIStateIndicatorProps) {
  const sizeConfig = SIZE_CONFIG[size];
  const stateConfig = STATE_CONFIG[state];

  // Determine if we should show queue position
  const shouldShowQueue = showQueue && queuePosition > 0 && state !== 'idle';

  // Determine if we should show speaker info
  const shouldShowSpeaker = showSpeaker && currentSpeakerName && (state === 'listening' || state === 'speaking');

  // Build label based on mode and state
  const label = useMemo(() => {
    if (mode === 'minimal') {
      return stateConfig.shortLabel;
    }

    let text = stateConfig.label;

    if (isCurrentSpeaker && (state === 'listening' || state === 'speaking')) {
      text = state === 'listening' ? 'Listening to you...' : 'Responding to you...';
    } else if (shouldShowSpeaker && currentSpeakerName) {
      text = state === 'listening'
        ? `Listening to ${currentSpeakerName}...`
        : `Responding to ${currentSpeakerName}...`;
    }

    return text;
  }, [mode, stateConfig, state, isCurrentSpeaker, shouldShowSpeaker, currentSpeakerName]);

  // Queue info text
  const queueInfo = useMemo(() => {
    if (!shouldShowQueue) return null;

    if (queuePosition === 1) {
      return 'You\'re next';
    }

    return `Position ${queuePosition}${queueLength > 0 ? ` of ${queueLength}` : ''}`;
  }, [shouldShowQueue, queuePosition, queueLength]);

  // Animation classes
  const animationClasses = useMemo(() => {
    if (!animate || !stateConfig.animate) return '';

    switch (state) {
      case 'listening':
        return 'animate-pulse';
      case 'processing':
        return 'animate-bounce';
      case 'speaking':
        return 'animate-pulse';
      default:
        return '';
    }
  }, [animate, stateConfig.animate, state]);

  // Dot animation classes
  const dotAnimationClasses = useMemo(() => {
    if (!animate || !stateConfig.animate) return '';
    return 'animate-ping';
  }, [animate, stateConfig.animate]);

  // Render minimal mode
  if (mode === 'minimal') {
    return (
      <div
        className={`inline-flex items-center ${sizeConfig.gap} ${className}`}
        role="status"
        aria-live="polite"
        aria-label={`AI is ${stateConfig.shortLabel.toLowerCase()}`}
        data-state={state}
      >
        <span
          className={`${sizeConfig.dot} rounded-full ${stateConfig.dotColor} ${dotAnimationClasses}`}
          aria-hidden="true"
        />
        <span className={`${sizeConfig.text} ${stateConfig.color}`}>
          {label}
        </span>
      </div>
    );
  }

  // Render compact mode
  if (mode === 'compact') {
    return (
      <div
        className={`
          inline-flex items-center ${sizeConfig.gap} ${sizeConfig.container}
          rounded-full border ${stateConfig.bgColor} ${stateConfig.borderColor}
          transition-colors duration-300
          ${className}
        `}
        role="status"
        aria-live="polite"
        aria-label={`AI is ${stateConfig.label.toLowerCase()}`}
        data-state={state}
      >
        <span
          className={`${stateConfig.color} ${animationClasses}`}
          aria-hidden="true"
        >
          {getStateIcon(state, sizeConfig.icon)}
        </span>
        <span className={`${sizeConfig.text} ${stateConfig.color} font-medium`}>
          {label}
        </span>
        {shouldShowQueue && (
          <>
            <span className="text-gray-300 dark:text-gray-600" aria-hidden="true">|</span>
            <span className={`${sizeConfig.text} text-gray-500 dark:text-gray-400`}>
              {queueInfo}
            </span>
          </>
        )}
      </div>
    );
  }

  // Render expanded mode
  return (
    <div
      className={`
        flex flex-col items-center ${sizeConfig.gap} ${sizeConfig.container}
        rounded-lg border ${stateConfig.bgColor} ${stateConfig.borderColor}
        transition-colors duration-300
        ${className}
      `}
      role="status"
      aria-live="polite"
      aria-label={`AI is ${stateConfig.label.toLowerCase()}`}
      data-state={state}
    >
      {/* Icon with animation */}
      <div
        className={`${stateConfig.color} ${animationClasses}`}
        aria-hidden="true"
      >
        {getStateIcon(state, `${sizeConfig.icon} scale-150`)}
      </div>

      {/* State label */}
      <span className={`${sizeConfig.text} ${stateConfig.color} font-semibold`}>
        {label}
      </span>

      {/* Queue info */}
      {shouldShowQueue && (
        <div className={`flex items-center ${sizeConfig.gap} text-gray-500 dark:text-gray-400`}>
          <QueueIcon className={sizeConfig.icon} />
          <span className={sizeConfig.text}>{queueInfo}</span>
        </div>
      )}

      {/* Current speaker info */}
      {shouldShowSpeaker && currentSpeakerName && !isCurrentSpeaker && (
        <span className={`${sizeConfig.text} text-gray-500 dark:text-gray-400 italic`}>
          {currentSpeakerName}
        </span>
      )}
    </div>
  );
}

/**
 * Compact AI state badge for headers
 */
export interface AIStateBadgeProps extends Omit<AIStateIndicatorProps, 'mode' | 'showQueue' | 'showSpeaker'> {
  /** Custom class name */
  className?: string;
}

export function AIStateBadge({
  size = 'sm',
  className = '',
  ...props
}: AIStateBadgeProps) {
  return (
    <AIStateIndicator
      size={size}
      mode="compact"
      showQueue={false}
      showSpeaker={false}
      className={className}
      {...props}
    />
  );
}

/**
 * Minimal AI state dot indicator
 */
export interface AIStateDotProps extends Omit<AIStateIndicatorProps, 'mode' | 'showQueue' | 'showSpeaker'> {
  /** Custom class name */
  className?: string;
}

export function AIStateDot({
  size = 'sm',
  className = '',
  ...props
}: AIStateDotProps) {
  return (
    <AIStateIndicator
      size={size}
      mode="minimal"
      showQueue={false}
      showSpeaker={false}
      className={className}
      {...props}
    />
  );
}

/**
 * Full AI state display for room main area
 */
export interface AIStateDisplayProps extends Omit<AIStateIndicatorProps, 'mode'> {
  /** Custom class name */
  className?: string;
}

export function AIStateDisplay({
  size = 'lg',
  className = '',
  ...props
}: AIStateDisplayProps) {
  return (
    <AIStateIndicator
      size={size}
      mode="expanded"
      showQueue={true}
      showSpeaker={true}
      className={className}
      {...props}
    />
  );
}

export default AIStateIndicator;
