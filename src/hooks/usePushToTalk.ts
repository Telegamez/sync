/**
 * usePushToTalk Hook
 *
 * React hook for Push-to-Talk (PTT) functionality with keyboard and touch support.
 * Gates audio to AI only when PTT is active.
 *
 * Part of the Long-Horizon Engineering Protocol - FEAT-151
 */

'use client';

import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import type { PTTState, AIResponseState } from '@/types/voice-mode';

/**
 * PTT activation method
 */
export type PTTActivationMethod = 'keyboard' | 'mouse' | 'touch' | 'programmatic';

/**
 * PTT hook options
 */
export interface UsePushToTalkOptions {
  /** Whether PTT mode is enabled */
  enabled?: boolean;
  /** Key to activate PTT (default: Space) */
  activationKey?: string;
  /** Whether to enable keyboard activation */
  enableKeyboard?: boolean;
  /** Whether to enable touch activation */
  enableTouch?: boolean;
  /** Whether to enable mouse activation */
  enableMouse?: boolean;
  /** Minimum hold time in ms before PTT activates (prevents accidental taps) */
  minHoldTimeMs?: number;
  /** Maximum PTT duration in ms (auto-release) */
  maxDurationMs?: number;
  /** Whether to provide haptic feedback on mobile */
  enableHapticFeedback?: boolean;
  /** Current AI state (to determine if PTT can be activated) */
  aiState?: AIResponseState;
  /** Whether the local user is in a queue */
  isInQueue?: boolean;
  /** Whether the local user is a designated speaker */
  isDesignatedSpeaker?: boolean;
  /** Voice mode (affects PTT behavior) */
  voiceMode?: 'open' | 'pushToTalk' | 'wakeWord' | 'designatedSpeaker';
}

/**
 * PTT hook callbacks
 */
export interface UsePushToTalkCallbacks {
  /** Called when PTT is activated */
  onPTTStart?: (method: PTTActivationMethod) => void;
  /** Called when PTT is released */
  onPTTEnd?: (duration: number) => void;
  /** Called when PTT activation is blocked */
  onPTTBlocked?: (reason: PTTState['blockReason']) => void;
  /** Called when PTT state changes */
  onPTTStateChange?: (state: PTTState) => void;
}

/**
 * PTT hook return type
 */
export interface UsePushToTalkReturn {
  /** Current PTT state */
  pttState: PTTState;
  /** Whether PTT is currently active */
  isActive: boolean;
  /** Whether PTT can be activated */
  canActivate: boolean;
  /** Reason if PTT cannot be activated */
  blockReason: PTTState['blockReason'];
  /** How long PTT has been active in ms */
  activeDuration: number;
  /** Programmatically start PTT */
  startPTT: () => boolean;
  /** Programmatically end PTT */
  endPTT: () => void;
  /** Toggle PTT state */
  togglePTT: () => void;
  /** Props to spread on a PTT button element */
  buttonProps: {
    onMouseDown: (e: React.MouseEvent) => void;
    onMouseUp: (e: React.MouseEvent) => void;
    onMouseLeave: (e: React.MouseEvent) => void;
    onTouchStart: (e: React.TouchEvent) => void;
    onTouchEnd: (e: React.TouchEvent) => void;
    onKeyDown: (e: React.KeyboardEvent) => void;
    onKeyUp: (e: React.KeyboardEvent) => void;
    'aria-pressed': boolean;
    disabled: boolean;
  };
  /** Ref for the target element to attach global keyboard events */
  targetRef: React.RefObject<HTMLElement>;
}

/**
 * Default options
 */
const DEFAULT_OPTIONS: Required<Omit<UsePushToTalkOptions, 'aiState' | 'isInQueue' | 'isDesignatedSpeaker' | 'voiceMode'>> = {
  enabled: true,
  activationKey: ' ', // Space key
  enableKeyboard: true,
  enableTouch: true,
  enableMouse: true,
  minHoldTimeMs: 0,
  maxDurationMs: 120000, // 2 minutes max
  enableHapticFeedback: true,
};

/**
 * usePushToTalk Hook
 *
 * Provides PTT functionality with keyboard, mouse, and touch support.
 *
 * @example
 * ```tsx
 * const { pttState, buttonProps, isActive } = usePushToTalk({
 *   enabled: true,
 *   aiState: 'idle',
 *   onPTTStart: () => startRecording(),
 *   onPTTEnd: (duration) => stopRecording(),
 * });
 *
 * return (
 *   <button {...buttonProps} className={isActive ? 'active' : ''}>
 *     {isActive ? 'Speaking...' : 'Hold to Talk'}
 *   </button>
 * );
 * ```
 */
export function usePushToTalk(
  options: UsePushToTalkOptions = {},
  callbacks: UsePushToTalkCallbacks = {}
): UsePushToTalkReturn {
  const {
    enabled = DEFAULT_OPTIONS.enabled,
    activationKey = DEFAULT_OPTIONS.activationKey,
    enableKeyboard = DEFAULT_OPTIONS.enableKeyboard,
    enableTouch = DEFAULT_OPTIONS.enableTouch,
    enableMouse = DEFAULT_OPTIONS.enableMouse,
    minHoldTimeMs = DEFAULT_OPTIONS.minHoldTimeMs,
    maxDurationMs = DEFAULT_OPTIONS.maxDurationMs,
    enableHapticFeedback = DEFAULT_OPTIONS.enableHapticFeedback,
    aiState = 'idle',
    isInQueue = false,
    isDesignatedSpeaker = true,
    voiceMode = 'pushToTalk',
  } = options;

  const { onPTTStart, onPTTEnd, onPTTBlocked, onPTTStateChange } = callbacks;

  // State
  const [isActive, setIsActive] = useState(false);
  const [activatedAt, setActivatedAt] = useState<Date | null>(null);
  const [activeDuration, setActiveDuration] = useState(0);
  const [activationMethod, setActivationMethod] = useState<PTTActivationMethod | null>(null);

  // Refs
  const targetRef = useRef<HTMLElement>(null);
  const holdStartRef = useRef<number | null>(null);
  const minHoldTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const maxDurationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const durationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isActivatingRef = useRef(false);
  const endPTTRef = useRef<() => void>(() => {});

  // Calculate if PTT can be activated
  const { canActivate, blockReason } = useMemo(() => {
    if (!enabled) {
      return { canActivate: false, blockReason: undefined };
    }

    // Check AI state - cannot activate if AI is speaking
    if (aiState === 'speaking' || aiState === 'locked') {
      return { canActivate: false, blockReason: 'ai_speaking' as const };
    }

    // Check designated speaker mode
    if (voiceMode === 'designatedSpeaker' && !isDesignatedSpeaker) {
      return { canActivate: false, blockReason: 'not_designated' as const };
    }

    // In open mode, PTT is not used for gating
    if (voiceMode === 'open') {
      return { canActivate: true, blockReason: undefined };
    }

    return { canActivate: true, blockReason: undefined };
  }, [enabled, aiState, voiceMode, isDesignatedSpeaker]);

  // PTT state object
  const pttState: PTTState = useMemo(() => ({
    isActive,
    activatedAt: activatedAt || undefined,
    canActivate,
    blockReason,
  }), [isActive, activatedAt, canActivate, blockReason]);

  // Notify state changes
  useEffect(() => {
    onPTTStateChange?.(pttState);
  }, [pttState, onPTTStateChange]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (minHoldTimerRef.current) {
        clearTimeout(minHoldTimerRef.current);
      }
      if (maxDurationTimerRef.current) {
        clearTimeout(maxDurationTimerRef.current);
      }
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
      }
    };
  }, []);

  // Haptic feedback helper
  const triggerHaptic = useCallback(() => {
    if (enableHapticFeedback && 'vibrate' in navigator) {
      navigator.vibrate(50);
    }
  }, [enableHapticFeedback]);

  // Start PTT activation
  const startPTT = useCallback((): boolean => {
    if (!canActivate) {
      onPTTBlocked?.(blockReason);
      return false;
    }

    if (isActive || isActivatingRef.current) {
      return false;
    }

    isActivatingRef.current = true;
    holdStartRef.current = Date.now();

    // If there's a minimum hold time, wait before activating
    if (minHoldTimeMs > 0) {
      minHoldTimerRef.current = setTimeout(() => {
        activatePTT('programmatic');
      }, minHoldTimeMs);
    } else {
      activatePTT('programmatic');
    }

    return true;
  }, [canActivate, isActive, minHoldTimeMs, blockReason, onPTTBlocked]);

  // Activate PTT (internal)
  const activatePTT = useCallback((method: PTTActivationMethod) => {
    const now = new Date();
    setIsActive(true);
    setActivatedAt(now);
    setActivationMethod(method);
    setActiveDuration(0);

    triggerHaptic();
    onPTTStart?.(method);

    // Start duration tracking
    durationIntervalRef.current = setInterval(() => {
      if (holdStartRef.current) {
        setActiveDuration(Date.now() - holdStartRef.current);
      }
    }, 100);

    // Set max duration timer
    if (maxDurationMs > 0) {
      maxDurationTimerRef.current = setTimeout(() => {
        endPTTRef.current();
      }, maxDurationMs);
    }
  }, [triggerHaptic, maxDurationMs, onPTTStart]);

  // End PTT
  const endPTT = useCallback(() => {
    if (!isActive && !isActivatingRef.current) {
      return;
    }

    // Clear timers
    if (minHoldTimerRef.current) {
      clearTimeout(minHoldTimerRef.current);
      minHoldTimerRef.current = null;
    }
    if (maxDurationTimerRef.current) {
      clearTimeout(maxDurationTimerRef.current);
      maxDurationTimerRef.current = null;
    }
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
      durationIntervalRef.current = null;
    }

    // Calculate duration
    const duration = holdStartRef.current ? Date.now() - holdStartRef.current : 0;

    // Only call onPTTEnd if we actually activated (not just holding for min time)
    if (isActive) {
      onPTTEnd?.(duration);
    }

    setIsActive(false);
    setActivatedAt(null);
    setActivationMethod(null);
    setActiveDuration(0);
    holdStartRef.current = null;
    isActivatingRef.current = false;
  }, [isActive, onPTTEnd]);

  // Keep endPTTRef updated
  useEffect(() => {
    endPTTRef.current = endPTT;
  }, [endPTT]);

  // Toggle PTT
  const togglePTT = useCallback(() => {
    if (isActive) {
      endPTT();
    } else {
      startPTT();
    }
  }, [isActive, startPTT, endPTT]);

  // Keyboard event handlers
  const handleKeyDown = useCallback((e: KeyboardEvent | React.KeyboardEvent) => {
    if (!enableKeyboard || !enabled) return;
    if (e.repeat) return; // Ignore key repeat

    if (e.key === activationKey) {
      e.preventDefault();
      if (!canActivate) {
        onPTTBlocked?.(blockReason);
        return;
      }

      if (!isActive && !isActivatingRef.current) {
        isActivatingRef.current = true;
        holdStartRef.current = Date.now();

        if (minHoldTimeMs > 0) {
          minHoldTimerRef.current = setTimeout(() => {
            activatePTT('keyboard');
          }, minHoldTimeMs);
        } else {
          activatePTT('keyboard');
        }
      }
    }
  }, [enableKeyboard, enabled, activationKey, canActivate, isActive, minHoldTimeMs, blockReason, activatePTT, onPTTBlocked]);

  const handleKeyUp = useCallback((e: KeyboardEvent | React.KeyboardEvent) => {
    if (!enableKeyboard || !enabled) return;

    if (e.key === activationKey) {
      e.preventDefault();
      endPTT();
    }
  }, [enableKeyboard, enabled, activationKey, endPTT]);

  // Mouse event handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!enableMouse || !enabled) return;
    if (e.button !== 0) return; // Only left click

    if (!canActivate) {
      onPTTBlocked?.(blockReason);
      return;
    }

    if (!isActive && !isActivatingRef.current) {
      isActivatingRef.current = true;
      holdStartRef.current = Date.now();

      if (minHoldTimeMs > 0) {
        minHoldTimerRef.current = setTimeout(() => {
          activatePTT('mouse');
        }, minHoldTimeMs);
      } else {
        activatePTT('mouse');
      }
    }
  }, [enableMouse, enabled, canActivate, isActive, minHoldTimeMs, blockReason, activatePTT, onPTTBlocked]);

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    if (!enableMouse || !enabled) return;
    endPTT();
  }, [enableMouse, enabled, endPTT]);

  const handleMouseLeave = useCallback((e: React.MouseEvent) => {
    if (!enableMouse || !enabled) return;
    // End PTT if mouse leaves while held
    if (isActive || isActivatingRef.current) {
      endPTT();
    }
  }, [enableMouse, enabled, isActive, endPTT]);

  // Touch event handlers
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (!enableTouch || !enabled) return;

    if (!canActivate) {
      onPTTBlocked?.(blockReason);
      return;
    }

    if (!isActive && !isActivatingRef.current) {
      isActivatingRef.current = true;
      holdStartRef.current = Date.now();

      if (minHoldTimeMs > 0) {
        minHoldTimerRef.current = setTimeout(() => {
          activatePTT('touch');
        }, minHoldTimeMs);
      } else {
        activatePTT('touch');
      }
    }
  }, [enableTouch, enabled, canActivate, isActive, minHoldTimeMs, blockReason, activatePTT, onPTTBlocked]);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!enableTouch || !enabled) return;
    endPTT();
  }, [enableTouch, enabled, endPTT]);

  // Global keyboard event listeners
  useEffect(() => {
    if (!enableKeyboard || !enabled) return;

    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Only handle if no input element is focused
      const activeElement = document.activeElement;
      const isInputFocused = activeElement && (
        activeElement.tagName === 'INPUT' ||
        activeElement.tagName === 'TEXTAREA' ||
        activeElement.getAttribute('contenteditable') === 'true'
      );

      if (!isInputFocused) {
        handleKeyDown(e);
      }
    };

    const handleGlobalKeyUp = (e: KeyboardEvent) => {
      handleKeyUp(e);
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    window.addEventListener('keyup', handleGlobalKeyUp);

    return () => {
      window.removeEventListener('keydown', handleGlobalKeyDown);
      window.removeEventListener('keyup', handleGlobalKeyUp);
    };
  }, [enableKeyboard, enabled, handleKeyDown, handleKeyUp]);

  // Global mouse up listener to catch releases outside the button
  useEffect(() => {
    if (!enableMouse || !enabled) return;

    const handleGlobalMouseUp = () => {
      if (isActive || isActivatingRef.current) {
        endPTT();
      }
    };

    window.addEventListener('mouseup', handleGlobalMouseUp);

    return () => {
      window.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [enableMouse, enabled, isActive, endPTT]);

  // Button props to spread on a PTT button element
  const buttonProps = useMemo(() => ({
    onMouseDown: handleMouseDown,
    onMouseUp: handleMouseUp,
    onMouseLeave: handleMouseLeave,
    onTouchStart: handleTouchStart,
    onTouchEnd: handleTouchEnd,
    onKeyDown: handleKeyDown as (e: React.KeyboardEvent) => void,
    onKeyUp: handleKeyUp as (e: React.KeyboardEvent) => void,
    'aria-pressed': isActive,
    disabled: !canActivate,
  }), [
    handleMouseDown,
    handleMouseUp,
    handleMouseLeave,
    handleTouchStart,
    handleTouchEnd,
    handleKeyDown,
    handleKeyUp,
    isActive,
    canActivate,
  ]);

  return {
    pttState,
    isActive,
    canActivate,
    blockReason,
    activeDuration,
    startPTT,
    endPTT,
    togglePTT,
    buttonProps,
    targetRef,
  };
}

/**
 * Factory function for creating PTT hook
 */
export function createPushToTalk(
  options?: UsePushToTalkOptions,
  callbacks?: UsePushToTalkCallbacks
) {
  return () => usePushToTalk(options, callbacks);
}

export default usePushToTalk;
