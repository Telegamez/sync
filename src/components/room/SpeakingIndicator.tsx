/**
 * SpeakingIndicator Component
 *
 * Displays the current active speaker(s) with smooth animations for
 * speaker transitions. Supports single and multi-speaker states.
 *
 * Part of the Long-Horizon Engineering Protocol - FEAT-205
 */

'use client';

import { useMemo, useEffect, useState, useCallback } from 'react';
import { ParticipantAvatar } from './ParticipantAvatar';
import type { PeerId } from '@/types/peer';

/**
 * Speaker information
 */
export interface SpeakerInfo {
  /** Peer ID */
  id: PeerId;
  /** Display name */
  displayName: string;
  /** Optional avatar URL */
  avatarUrl?: string;
  /** Current audio level (0-1) */
  audioLevel?: number;
  /** Whether this is the local user */
  isLocal?: boolean;
}

/**
 * SpeakingIndicator display mode
 */
export type SpeakingIndicatorMode = 'compact' | 'detailed' | 'minimal';

/**
 * SpeakingIndicator props
 */
export interface SpeakingIndicatorProps {
  /** Array of currently speaking participants */
  speakers: SpeakerInfo[];
  /** Display mode */
  mode?: SpeakingIndicatorMode;
  /** Maximum speakers to display before showing overflow */
  maxDisplayed?: number;
  /** Animation duration in ms */
  animationDuration?: number;
  /** Whether to show audio level visualization */
  showAudioLevel?: boolean;
  /** Text to show when no one is speaking */
  idleText?: string;
  /** Custom class name */
  className?: string;
  /** Click handler for a speaker */
  onSpeakerClick?: (speakerId: PeerId) => void;
  /** Called when speaker list changes */
  onSpeakersChange?: (speakers: SpeakerInfo[]) => void;
}

/**
 * Animation state for speaker transitions
 */
interface SpeakerState {
  speaker: SpeakerInfo;
  isEntering: boolean;
  isLeaving: boolean;
}

/**
 * Get display text for multiple speakers
 */
function getMultiSpeakerText(count: number): string {
  if (count === 2) {
    return '2 people speaking';
  }
  return `${count} people speaking`;
}

/**
 * Waveform visualization component
 */
function AudioWaveform({ level, className = '' }: { level: number; className?: string }) {
  const bars = 5;
  const baseHeight = 4;
  const maxHeight = 20;

  return (
    <div className={`flex items-end gap-0.5 ${className}`} aria-hidden="true">
      {Array.from({ length: bars }).map((_, i) => {
        // Create wave pattern - middle bars are taller
        const position = Math.abs(i - Math.floor(bars / 2)) / Math.floor(bars / 2);
        const heightMultiplier = 1 - position * 0.3;
        const animatedHeight = baseHeight + (maxHeight - baseHeight) * level * heightMultiplier;

        return (
          <div
            key={i}
            className="w-1 bg-green-500 rounded-full transition-all duration-75"
            style={{
              height: `${animatedHeight}px`,
              opacity: 0.5 + level * 0.5,
            }}
          />
        );
      })}
    </div>
  );
}

/**
 * Speaking microphone icon
 */
function SpeakingIcon({ className = '' }: { className?: string }) {
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
 * Idle/silence icon
 */
function IdleIcon({ className = '' }: { className?: string }) {
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
    </svg>
  );
}

/**
 * SpeakingIndicator Component
 *
 * Displays the current active speaker(s) with smooth transitions.
 *
 * @example
 * ```tsx
 * // Single speaker
 * <SpeakingIndicator
 *   speakers={[{ id: 'peer-1', displayName: 'Alice', audioLevel: 0.7 }]}
 * />
 *
 * // Multiple speakers
 * <SpeakingIndicator
 *   speakers={[
 *     { id: 'peer-1', displayName: 'Alice' },
 *     { id: 'peer-2', displayName: 'Bob' },
 *   ]}
 *   mode="detailed"
 * />
 *
 * // No speakers (idle)
 * <SpeakingIndicator speakers={[]} idleText="Waiting for someone to speak..." />
 * ```
 */
export function SpeakingIndicator({
  speakers,
  mode = 'compact',
  maxDisplayed = 3,
  animationDuration = 300,
  showAudioLevel = true,
  idleText = 'No one speaking',
  className = '',
  onSpeakerClick,
  onSpeakersChange,
}: SpeakingIndicatorProps) {
  // Track speaker states for animations
  const [speakerStates, setSpeakerStates] = useState<SpeakerState[]>([]);
  const [prevSpeakerIds, setPrevSpeakerIds] = useState<Set<PeerId>>(new Set());

  // Update speaker states with animations
  useEffect(() => {
    const currentIds = new Set(speakers.map((s) => s.id));

    // Find entering and leaving speakers
    const entering = speakers.filter((s) => !prevSpeakerIds.has(s.id));
    const leaving = Array.from(prevSpeakerIds)
      .filter((id) => !currentIds.has(id))
      .map((id) => speakerStates.find((s) => s.speaker.id === id))
      .filter((s): s is SpeakerState => s !== undefined);

    // Build new state
    const newStates: SpeakerState[] = [
      // Existing speakers (not leaving)
      ...speakerStates
        .filter((s) => currentIds.has(s.speaker.id))
        .map((s) => ({
          ...s,
          speaker: speakers.find((sp) => sp.id === s.speaker.id) || s.speaker,
          isEntering: false,
          isLeaving: false,
        })),
      // New entering speakers
      ...entering.map((speaker) => ({
        speaker,
        isEntering: true,
        isLeaving: false,
      })),
      // Leaving speakers (will be removed after animation)
      ...leaving.map((s) => ({
        ...s,
        isLeaving: true,
        isEntering: false,
      })),
    ];

    setSpeakerStates(newStates);
    setPrevSpeakerIds(currentIds);

    // Remove leaving speakers after animation
    if (leaving.length > 0) {
      const timer = setTimeout(() => {
        setSpeakerStates((prev) => prev.filter((s) => !s.isLeaving));
      }, animationDuration);
      return () => clearTimeout(timer);
    }
  }, [speakers, animationDuration]);

  // Clear entering state after animation
  useEffect(() => {
    const hasEntering = speakerStates.some((s) => s.isEntering);
    if (hasEntering) {
      const timer = setTimeout(() => {
        setSpeakerStates((prev) =>
          prev.map((s) => (s.isEntering ? { ...s, isEntering: false } : s))
        );
      }, animationDuration);
      return () => clearTimeout(timer);
    }
  }, [speakerStates, animationDuration]);

  // Notify on speaker change
  useEffect(() => {
    onSpeakersChange?.(speakers);
  }, [speakers, onSpeakersChange]);

  // Calculate average audio level
  const averageAudioLevel = useMemo(() => {
    if (speakers.length === 0) return 0;
    const sum = speakers.reduce((acc, s) => acc + (s.audioLevel || 0), 0);
    return sum / speakers.length;
  }, [speakers]);

  // Get primary speaker (highest audio level)
  const primarySpeaker = useMemo(() => {
    if (speakers.length === 0) return null;
    return speakers.reduce((max, s) =>
      (s.audioLevel || 0) > (max.audioLevel || 0) ? s : max
    );
  }, [speakers]);

  // Displayed speakers (limited by maxDisplayed)
  const displayedSpeakers = useMemo(() => {
    const nonLeaving = speakerStates.filter((s) => !s.isLeaving);
    return nonLeaving.slice(0, maxDisplayed);
  }, [speakerStates, maxDisplayed]);

  // Overflow count
  const overflowCount = useMemo(() => {
    const nonLeaving = speakerStates.filter((s) => !s.isLeaving).length;
    return Math.max(0, nonLeaving - maxDisplayed);
  }, [speakerStates, maxDisplayed]);

  // Handle speaker click
  const handleSpeakerClick = useCallback(
    (speakerId: PeerId) => {
      onSpeakerClick?.(speakerId);
    },
    [onSpeakerClick]
  );

  // Idle state (no speakers)
  if (speakers.length === 0 && speakerStates.length === 0) {
    return (
      <div
        className={`flex items-center gap-2 text-gray-500 dark:text-gray-400 ${className}`}
        role="status"
        aria-live="polite"
      >
        <IdleIcon className="w-5 h-5" />
        <span className="text-sm">{idleText}</span>
      </div>
    );
  }

  // Minimal mode - just text
  if (mode === 'minimal') {
    const speakerCount = speakers.length;
    const text =
      speakerCount === 1
        ? `${primarySpeaker?.displayName} is speaking`
        : getMultiSpeakerText(speakerCount);

    return (
      <div
        className={`flex items-center gap-2 ${className}`}
        role="status"
        aria-live="polite"
      >
        <SpeakingIcon className="w-5 h-5 text-green-500" />
        <span className="text-sm font-medium">{text}</span>
        {showAudioLevel && <AudioWaveform level={averageAudioLevel} />}
      </div>
    );
  }

  // Compact mode - avatar(s) + name
  if (mode === 'compact') {
    return (
      <div
        className={`flex items-center gap-3 ${className}`}
        role="status"
        aria-live="polite"
      >
        {/* Speaking icon */}
        <SpeakingIcon className="w-5 h-5 text-green-500 flex-shrink-0" />

        {/* Speaker avatars */}
        <div className="flex items-center -space-x-2">
          {displayedSpeakers.map((state) => (
            <div
              key={state.speaker.id}
              className={`transition-all duration-${animationDuration}`}
              style={{
                opacity: state.isEntering || state.isLeaving ? 0 : 1,
                transform:
                  state.isEntering || state.isLeaving ? 'scale(0.5)' : 'scale(1)',
              }}
            >
              <ParticipantAvatar
                displayName={state.speaker.displayName}
                avatarUrl={state.speaker.avatarUrl}
                size="sm"
                isSpeaking={true}
                audioLevel={state.speaker.audioLevel || 0}
                isLocal={state.speaker.isLocal}
                onClick={
                  onSpeakerClick
                    ? () => handleSpeakerClick(state.speaker.id)
                    : undefined
                }
              />
            </div>
          ))}
          {overflowCount > 0 && (
            <div
              className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700
                flex items-center justify-center text-xs font-medium
                text-gray-600 dark:text-gray-300 border-2 border-white dark:border-gray-800"
            >
              +{overflowCount}
            </div>
          )}
        </div>

        {/* Speaker name(s) */}
        <div className="flex-1 min-w-0">
          {speakers.length === 1 && primarySpeaker ? (
            <span className="text-sm font-medium truncate">
              {primarySpeaker.displayName}
              {primarySpeaker.isLocal && (
                <span className="text-gray-500 ml-1">(You)</span>
              )}
            </span>
          ) : (
            <span className="text-sm font-medium">
              {getMultiSpeakerText(speakers.length)}
            </span>
          )}
        </div>

        {/* Audio level visualization */}
        {showAudioLevel && <AudioWaveform level={averageAudioLevel} />}
      </div>
    );
  }

  // Detailed mode - full speaker info
  return (
    <div
      className={`space-y-2 ${className}`}
      role="status"
      aria-live="polite"
    >
      {/* Header */}
      <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
        <SpeakingIcon className="w-5 h-5" />
        <span className="text-sm font-medium">
          {speakers.length === 1 ? 'Speaking' : getMultiSpeakerText(speakers.length)}
        </span>
      </div>

      {/* Speaker list */}
      <div className="space-y-1.5">
        {displayedSpeakers.map((state) => (
          <div
            key={state.speaker.id}
            className={`
              flex items-center gap-3 p-2 rounded-lg
              bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800
              transition-all duration-${animationDuration}
              ${onSpeakerClick ? 'cursor-pointer hover:bg-green-100 dark:hover:bg-green-900/30' : ''}
            `}
            style={{
              opacity: state.isEntering || state.isLeaving ? 0 : 1,
              transform:
                state.isEntering || state.isLeaving
                  ? 'translateY(-10px)'
                  : 'translateY(0)',
            }}
            onClick={
              onSpeakerClick
                ? () => handleSpeakerClick(state.speaker.id)
                : undefined
            }
            role={onSpeakerClick ? 'button' : undefined}
            tabIndex={onSpeakerClick ? 0 : undefined}
            onKeyDown={
              onSpeakerClick
                ? (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleSpeakerClick(state.speaker.id);
                    }
                  }
                : undefined
            }
          >
            <ParticipantAvatar
              displayName={state.speaker.displayName}
              avatarUrl={state.speaker.avatarUrl}
              size="md"
              isSpeaking={true}
              audioLevel={state.speaker.audioLevel || 0}
              isLocal={state.speaker.isLocal}
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">
                {state.speaker.displayName}
                {state.speaker.isLocal && (
                  <span className="text-gray-500 ml-1">(You)</span>
                )}
              </p>
            </div>
            {showAudioLevel && (
              <AudioWaveform
                level={state.speaker.audioLevel || 0}
                className="flex-shrink-0"
              />
            )}
          </div>
        ))}

        {/* Overflow indicator */}
        {overflowCount > 0 && (
          <div className="flex items-center gap-2 px-2 text-sm text-gray-500">
            <span>+{overflowCount} more speaking</span>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Export default for convenience
 */
export default SpeakingIndicator;
