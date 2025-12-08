/**
 * RoomControls Component
 *
 * Control bar for room actions: mute/unmute, leave room, and settings.
 * Fully accessible with keyboard navigation support.
 *
 * Part of the Long-Horizon Engineering Protocol - FEAT-116
 */

"use client";

import { useCallback, useRef, useState, type KeyboardEvent } from "react";

/**
 * RoomControls props
 */
export interface RoomControlsProps {
  /** Whether the local user is muted */
  isMuted: boolean;
  /** Callback to toggle mute state */
  onMuteToggle: () => void;
  /** Callback when leaving the room (optional - can use header button instead) */
  onLeaveRoom?: () => void;
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
  /** Whether to show the leave room button (default: false) */
  showLeaveButton?: boolean;
  /** Whether AI is currently speaking (for interrupt button) */
  isAISpeaking?: boolean;
  /** Callback to interrupt AI audio */
  onInterruptAI?: () => void;
  /** Layout orientation */
  layout?: "horizontal" | "vertical";
  /** Button size */
  size?: "sm" | "md" | "lg";
  /** Custom class name */
  className?: string;
}

/**
 * Size configuration for buttons
 */
const SIZE_CONFIG = {
  sm: {
    button: "w-10 h-10",
    icon: "w-5 h-5",
    text: "text-xs",
    gap: "gap-2",
  },
  md: {
    button: "w-12 h-12",
    icon: "w-6 h-6",
    text: "text-sm",
    gap: "gap-3",
  },
  lg: {
    button: "w-14 h-14",
    icon: "w-7 h-7",
    text: "text-base",
    gap: "gap-4",
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
 * Stop/Interrupt icon (hand raised)
 */
function InterruptIcon({ className }: { className?: string }) {
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
        d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z"
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
  onTouchCancel,
  onKeyDown,
  onKeyUp,
  label,
  icon,
  variant = "default",
  size = "md",
  isActive = false,
  isLoading = false,
  disabled = false,
}: {
  onClick?: () => void;
  onMouseDown?: () => void;
  onMouseUp?: () => void;
  onMouseLeave?: () => void;
  onTouchStart?: (e: React.TouchEvent) => void;
  onTouchEnd?: (e: React.TouchEvent) => void;
  onTouchCancel?: (e: React.TouchEvent) => void;
  onKeyDown?: (e: KeyboardEvent<HTMLButtonElement>) => void;
  onKeyUp?: (e: KeyboardEvent<HTMLButtonElement>) => void;
  label: string;
  icon: React.ReactNode;
  variant?: "default" | "danger" | "active" | "muted" | "interrupt";
  size?: "sm" | "md" | "lg";
  isActive?: boolean;
  isLoading?: boolean;
  disabled?: boolean;
}) {
  const config = SIZE_CONFIG[size];

  const variantClasses = {
    default:
      "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600",
    danger:
      "bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50",
    active:
      "bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-900/50 ring-2 ring-green-500",
    muted: "bg-red-500 text-white hover:bg-red-600",
    interrupt: "bg-orange-500 text-white hover:bg-orange-600 animate-pulse",
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
      onTouchCancel={onTouchCancel}
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
      disabled={disabled || isLoading}
      className={`
        ${config.button} rounded-full flex items-center justify-center
        transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2
        ${isActive ? "ring-2 ring-purple-500" : ""}
        ${variantClasses[variant]}
        ${disabled || isLoading ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}
        select-none
      `}
      style={{
        touchAction: "none",
        WebkitUserSelect: "none",
        userSelect: "none",
      }}
      aria-label={label}
      aria-pressed={isActive}
    >
      {isLoading ? <LoadingSpinner className={config.icon} /> : icon}
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
  showLeaveButton = false,
  isAISpeaking = false,
  onInterruptAI,
  layout = "horizontal",
  size = "md",
  className = "",
}: RoomControlsProps) {
  const config = SIZE_CONFIG[size];
  const [isPTTActive, setIsPTTActive] = useState(false);
  const isPTTActiveRef = useRef(false); // Ref to avoid stale closures
  const isTouchInteractionRef = useRef(false);
  const pttStartTimeRef = useRef<number>(0); // Track when PTT started to prevent premature end
  const MIN_PTT_DURATION_MS = 200; // Minimum PTT duration before allowing end

  /**
   * Handle PTT mouse down (only if not a touch interaction)
   */
  const handlePTTMouseDown = useCallback(() => {
    console.log(
      "[RoomControls] handlePTTMouseDown called, isTouchInteraction:",
      isTouchInteractionRef.current,
      "isPTTActive:",
      isPTTActiveRef.current,
    );
    // Skip if this is a touch-triggered mouse event
    if (isTouchInteractionRef.current) return;

    if (onPTTStart && !isPTTActiveRef.current) {
      console.log("[RoomControls] Starting PTT via mouseDown");
      pttStartTimeRef.current = Date.now();
      isPTTActiveRef.current = true;
      setIsPTTActive(true);
      onPTTStart();
    }
  }, [onPTTStart]);

  /**
   * Handle PTT mouse up
   */
  const handlePTTMouseUp = useCallback(() => {
    const elapsed = Date.now() - pttStartTimeRef.current;
    console.log(
      "[RoomControls] handlePTTMouseUp called, isTouchInteraction:",
      isTouchInteractionRef.current,
      "isPTTActive:",
      isPTTActiveRef.current,
      "elapsed:",
      elapsed,
    );
    // Skip if this is a touch-triggered mouse event
    if (isTouchInteractionRef.current) return;

    if (onPTTEnd && isPTTActiveRef.current) {
      // Prevent premature end if PTT just started (likely a browser quirk)
      if (elapsed < MIN_PTT_DURATION_MS) {
        console.log(
          "[RoomControls] Ignoring premature mouseUp, elapsed:",
          elapsed,
          "ms < MIN:",
          MIN_PTT_DURATION_MS,
        );
        return;
      }
      console.log("[RoomControls] Ending PTT via mouseUp");
      isPTTActiveRef.current = false;
      setIsPTTActive(false);
      onPTTEnd();
    }
  }, [onPTTEnd]);

  /**
   * Handle PTT mouse leave (only end if using mouse, not touch)
   */
  const handlePTTMouseLeave = useCallback(() => {
    const elapsed = Date.now() - pttStartTimeRef.current;
    console.log(
      "[RoomControls] handlePTTMouseLeave called, isTouchInteraction:",
      isTouchInteractionRef.current,
      "isPTTActive:",
      isPTTActiveRef.current,
      "elapsed:",
      elapsed,
    );
    // Don't end PTT on mouse leave if using touch
    if (isTouchInteractionRef.current) return;

    if (onPTTEnd && isPTTActiveRef.current) {
      // Prevent premature end if PTT just started (likely a browser quirk)
      if (elapsed < MIN_PTT_DURATION_MS) {
        console.log(
          "[RoomControls] Ignoring premature mouseLeave, elapsed:",
          elapsed,
          "ms < MIN:",
          MIN_PTT_DURATION_MS,
        );
        return;
      }
      console.log("[RoomControls] Ending PTT via mouseLeave");
      isPTTActiveRef.current = false;
      setIsPTTActive(false);
      onPTTEnd();
    }
  }, [onPTTEnd]);

  /**
   * Handle PTT touch start
   */
  const handlePTTTouchStart = useCallback(
    (e: React.TouchEvent) => {
      console.log(
        "[RoomControls] handlePTTTouchStart called, isPTTActive:",
        isPTTActiveRef.current,
      );
      e.preventDefault(); // Prevent mouse event emulation
      isTouchInteractionRef.current = true;

      if (onPTTStart && !isPTTActiveRef.current) {
        console.log("[RoomControls] Starting PTT via touchStart");
        pttStartTimeRef.current = Date.now();
        isPTTActiveRef.current = true;
        setIsPTTActive(true);
        onPTTStart();
      }
    },
    [onPTTStart],
  );

  /**
   * Handle PTT touch end
   */
  const handlePTTTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      const elapsed = Date.now() - pttStartTimeRef.current;
      console.log(
        "[RoomControls] handlePTTTouchEnd called, isPTTActive:",
        isPTTActiveRef.current,
        "elapsed:",
        elapsed,
      );
      e.preventDefault(); // Prevent mouse event emulation

      if (onPTTEnd && isPTTActiveRef.current) {
        // Prevent premature end if PTT just started (likely a browser quirk)
        if (elapsed < MIN_PTT_DURATION_MS) {
          console.log(
            "[RoomControls] Ignoring premature touchEnd, elapsed:",
            elapsed,
            "ms < MIN:",
            MIN_PTT_DURATION_MS,
          );
          // Don't reset touch flag - wait for real touchend
          return;
        }
        console.log("[RoomControls] Ending PTT via touchEnd");
        isPTTActiveRef.current = false;
        setIsPTTActive(false);
        onPTTEnd();
      }

      // Reset touch flag after a short delay (to handle any lingering mouse events)
      setTimeout(() => {
        isTouchInteractionRef.current = false;
      }, 100);
    },
    [onPTTEnd],
  );

  /**
   * Handle PTT touch cancel (e.g., when browser interrupts touch)
   */
  const handlePTTTouchCancel = useCallback((e: React.TouchEvent) => {
    console.log(
      "[RoomControls] handlePTTTouchCancel called, isPTTActive:",
      isPTTActiveRef.current,
    );
    e.preventDefault();

    // On touch cancel, we should NOT end PTT - just log it
    // The user's finger is still down but the browser cancelled the gesture
    // Let the user release naturally via touchend
    console.log(
      "[RoomControls] Touch cancelled by browser, PTT state maintained",
    );
  }, []);

  /**
   * Handle PTT keyboard events
   */
  const handlePTTKeyDown = useCallback(
    (e: KeyboardEvent<HTMLButtonElement>) => {
      if (e.key === " " || e.key === "Enter") {
        console.log(
          "[RoomControls] handlePTTKeyDown called, key:",
          e.key,
          "isPTTActive:",
          isPTTActiveRef.current,
        );
        e.preventDefault();
        if (!isPTTActiveRef.current && onPTTStart) {
          console.log("[RoomControls] Starting PTT via keyDown");
          pttStartTimeRef.current = Date.now();
          isPTTActiveRef.current = true;
          setIsPTTActive(true);
          onPTTStart();
        }
      }
    },
    [onPTTStart],
  );

  const handlePTTKeyUp = useCallback(
    (e: KeyboardEvent<HTMLButtonElement>) => {
      if (e.key === " " || e.key === "Enter") {
        const elapsed = Date.now() - pttStartTimeRef.current;
        console.log(
          "[RoomControls] handlePTTKeyUp called, key:",
          e.key,
          "isPTTActive:",
          isPTTActiveRef.current,
          "elapsed:",
          elapsed,
        );
        e.preventDefault();
        if (isPTTActiveRef.current && onPTTEnd) {
          // Prevent premature end if PTT just started (likely a browser quirk)
          if (elapsed < MIN_PTT_DURATION_MS) {
            console.log(
              "[RoomControls] Ignoring premature keyUp, elapsed:",
              elapsed,
              "ms < MIN:",
              MIN_PTT_DURATION_MS,
            );
            return;
          }
          console.log("[RoomControls] Ending PTT via keyUp");
          isPTTActiveRef.current = false;
          setIsPTTActive(false);
          onPTTEnd();
        }
      }
    },
    [onPTTEnd],
  );

  /**
   * Handle mute keyboard shortcut (M key)
   */
  const handleMuteKeyDown = useCallback(
    (e: KeyboardEvent<HTMLButtonElement>) => {
      if (e.key === "m" || e.key === "M") {
        e.preventDefault();
        onMuteToggle();
      }
    },
    [onMuteToggle],
  );

  return (
    <div
      className={`flex flex-col items-center gap-4 ${className}`}
      role="toolbar"
      aria-label="Room controls"
    >
      {/* Row 1: PTT button - large and prominent, always in same position */}
      {showPTT && (
        <div className="w-full flex justify-center">
          <button
            type="button"
            onMouseDown={handlePTTMouseDown}
            onMouseUp={handlePTTMouseUp}
            onMouseLeave={handlePTTMouseLeave}
            onTouchStart={handlePTTTouchStart}
            onTouchEnd={handlePTTTouchEnd}
            onTouchCancel={handlePTTTouchCancel}
            onKeyDown={handlePTTKeyDown}
            onKeyUp={handlePTTKeyUp}
            className={`
              w-full max-w-xs px-8 py-4 rounded-2xl flex items-center justify-center gap-3
              font-semibold text-lg transition-all duration-200
              focus:outline-none focus:ring-2 focus:ring-offset-2
              ${
                isPTTActive || isAddressingAI
                  ? "bg-green-500 text-white ring-2 ring-green-400 shadow-lg shadow-green-500/30"
                  : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600"
              }
              select-none
            `}
            style={{
              touchAction: "none",
              WebkitUserSelect: "none",
              userSelect: "none",
            }}
            aria-label={
              isPTTActive || isAddressingAI
                ? "Release to stop talking to AI"
                : "Hold to talk to AI"
            }
            aria-pressed={isPTTActive || isAddressingAI}
          >
            <PTTIcon className="w-6 h-6" />
            <span>
              {isPTTActive || isAddressingAI
                ? "Speaking to AI..."
                : "Hold To Speak to AI"}
            </span>
          </button>
        </div>
      )}

      {/* Row 2: Excuse Me button - separate row, fixed height to prevent layout shift */}
      <div className="h-12 flex items-center justify-center">
        {isAISpeaking && onInterruptAI ? (
          <button
            type="button"
            onClick={onInterruptAI}
            className={`
              px-6 py-2.5 rounded-full flex items-center gap-2
              bg-orange-500 text-white hover:bg-orange-600
              animate-pulse font-medium text-base
              transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-orange-400
            `}
            aria-label="Excuse Me - Stop AI"
          >
            <InterruptIcon className="w-5 h-5" />
            <span>Excuse Me</span>
          </button>
        ) : (
          /* Invisible placeholder to maintain consistent spacing */
          <div className="h-10" aria-hidden="true" />
        )}
      </div>
    </div>
  );
}

/**
 * Export default for convenience
 */
export default RoomControls;
