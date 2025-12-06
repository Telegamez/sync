/**
 * Push-to-Talk Hook Tests
 *
 * Tests for the usePushToTalk hook including keyboard, mouse, and touch interactions.
 *
 * Part of the Long-Horizon Engineering Protocol - FEAT-151
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePushToTalk } from '@/hooks/usePushToTalk';
import type { AIResponseState } from '@/types/voice-mode';

// Mock navigator.vibrate
const mockVibrate = vi.fn();
Object.defineProperty(navigator, 'vibrate', {
  value: mockVibrate,
  writable: true,
});

describe('usePushToTalk', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockVibrate.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Initialization', () => {
    it('initializes with default state', () => {
      const { result } = renderHook(() => usePushToTalk());

      expect(result.current.isActive).toBe(false);
      expect(result.current.canActivate).toBe(true);
      expect(result.current.blockReason).toBeUndefined();
      expect(result.current.activeDuration).toBe(0);
    });

    it('initializes with custom options', () => {
      const { result } = renderHook(() =>
        usePushToTalk({
          enabled: true,
          activationKey: 'Enter',
          minHoldTimeMs: 100,
        })
      );

      expect(result.current.isActive).toBe(false);
      expect(result.current.canActivate).toBe(true);
    });

    it('returns disabled state when enabled is false', () => {
      const { result } = renderHook(() =>
        usePushToTalk({ enabled: false })
      );

      expect(result.current.canActivate).toBe(false);
    });
  });

  describe('PTT State', () => {
    it('exposes correct pttState object', () => {
      const { result } = renderHook(() => usePushToTalk());

      expect(result.current.pttState).toEqual({
        isActive: false,
        activatedAt: undefined,
        canActivate: true,
        blockReason: undefined,
      });
    });

    it('updates pttState when activated', () => {
      const { result } = renderHook(() => usePushToTalk());

      act(() => {
        result.current.startPTT();
      });

      expect(result.current.pttState.isActive).toBe(true);
      expect(result.current.pttState.activatedAt).toBeInstanceOf(Date);
    });
  });

  describe('Programmatic Activation', () => {
    it('activates PTT with startPTT()', () => {
      const onPTTStart = vi.fn();
      const { result } = renderHook(() =>
        usePushToTalk({}, { onPTTStart })
      );

      act(() => {
        const success = result.current.startPTT();
        expect(success).toBe(true);
      });

      expect(result.current.isActive).toBe(true);
      expect(onPTTStart).toHaveBeenCalledWith('programmatic');
    });

    it('deactivates PTT with endPTT()', () => {
      const onPTTEnd = vi.fn();
      const { result } = renderHook(() =>
        usePushToTalk({}, { onPTTEnd })
      );

      act(() => {
        result.current.startPTT();
      });

      act(() => {
        vi.advanceTimersByTime(500);
        result.current.endPTT();
      });

      expect(result.current.isActive).toBe(false);
      expect(onPTTEnd).toHaveBeenCalled();
    });

    it('toggles PTT with togglePTT()', () => {
      const { result } = renderHook(() => usePushToTalk());

      act(() => {
        result.current.togglePTT();
      });
      expect(result.current.isActive).toBe(true);

      act(() => {
        result.current.togglePTT();
      });
      expect(result.current.isActive).toBe(false);
    });

    it('returns false when startPTT is blocked', () => {
      const onPTTBlocked = vi.fn();
      const { result } = renderHook(() =>
        usePushToTalk(
          { aiState: 'speaking' },
          { onPTTBlocked }
        )
      );

      act(() => {
        const success = result.current.startPTT();
        expect(success).toBe(false);
      });

      expect(result.current.isActive).toBe(false);
      expect(onPTTBlocked).toHaveBeenCalledWith('ai_speaking');
    });

    it('does not activate twice', () => {
      const onPTTStart = vi.fn();
      const { result } = renderHook(() =>
        usePushToTalk({}, { onPTTStart })
      );

      act(() => {
        result.current.startPTT();
        result.current.startPTT();
      });

      expect(onPTTStart).toHaveBeenCalledTimes(1);
    });
  });

  describe('AI State Blocking', () => {
    it('blocks activation when AI is speaking', () => {
      const { result } = renderHook(() =>
        usePushToTalk({ aiState: 'speaking' })
      );

      expect(result.current.canActivate).toBe(false);
      expect(result.current.blockReason).toBe('ai_speaking');
    });

    it('blocks activation when AI is locked', () => {
      const { result } = renderHook(() =>
        usePushToTalk({ aiState: 'locked' })
      );

      expect(result.current.canActivate).toBe(false);
      expect(result.current.blockReason).toBe('ai_speaking');
    });

    it('allows activation when AI is idle', () => {
      const { result } = renderHook(() =>
        usePushToTalk({ aiState: 'idle' })
      );

      expect(result.current.canActivate).toBe(true);
      expect(result.current.blockReason).toBeUndefined();
    });

    it('allows activation when AI is listening', () => {
      const { result } = renderHook(() =>
        usePushToTalk({ aiState: 'listening' })
      );

      expect(result.current.canActivate).toBe(true);
    });

    it('allows activation when AI is processing', () => {
      const { result } = renderHook(() =>
        usePushToTalk({ aiState: 'processing' })
      );

      expect(result.current.canActivate).toBe(true);
    });
  });

  describe('Voice Mode Blocking', () => {
    it('blocks non-designated speakers in designatedSpeaker mode', () => {
      const { result } = renderHook(() =>
        usePushToTalk({
          voiceMode: 'designatedSpeaker',
          isDesignatedSpeaker: false,
        })
      );

      expect(result.current.canActivate).toBe(false);
      expect(result.current.blockReason).toBe('not_designated');
    });

    it('allows designated speakers in designatedSpeaker mode', () => {
      const { result } = renderHook(() =>
        usePushToTalk({
          voiceMode: 'designatedSpeaker',
          isDesignatedSpeaker: true,
        })
      );

      expect(result.current.canActivate).toBe(true);
    });

    it('allows activation in open mode', () => {
      const { result } = renderHook(() =>
        usePushToTalk({ voiceMode: 'open' })
      );

      expect(result.current.canActivate).toBe(true);
    });

    it('allows activation in pushToTalk mode', () => {
      const { result } = renderHook(() =>
        usePushToTalk({ voiceMode: 'pushToTalk' })
      );

      expect(result.current.canActivate).toBe(true);
    });
  });

  describe('Minimum Hold Time', () => {
    it('waits for minimum hold time before activating', () => {
      const onPTTStart = vi.fn();
      const { result } = renderHook(() =>
        usePushToTalk(
          { minHoldTimeMs: 200 },
          { onPTTStart }
        )
      );

      act(() => {
        result.current.startPTT();
      });

      expect(result.current.isActive).toBe(false);

      act(() => {
        vi.advanceTimersByTime(200);
      });

      expect(result.current.isActive).toBe(true);
      expect(onPTTStart).toHaveBeenCalled();
    });

    it('does not activate if released before minimum hold time', () => {
      const onPTTStart = vi.fn();
      const { result } = renderHook(() =>
        usePushToTalk(
          { minHoldTimeMs: 200 },
          { onPTTStart }
        )
      );

      act(() => {
        result.current.startPTT();
      });

      act(() => {
        vi.advanceTimersByTime(100);
        result.current.endPTT();
      });

      expect(result.current.isActive).toBe(false);
      expect(onPTTStart).not.toHaveBeenCalled();
    });
  });

  describe('Maximum Duration', () => {
    it('auto-releases after maximum duration', () => {
      const onPTTEnd = vi.fn();
      const { result } = renderHook(() =>
        usePushToTalk(
          { maxDurationMs: 1000 },
          { onPTTEnd }
        )
      );

      act(() => {
        result.current.startPTT();
      });

      expect(result.current.isActive).toBe(true);

      act(() => {
        vi.advanceTimersByTime(1000);
      });

      expect(result.current.isActive).toBe(false);
      expect(onPTTEnd).toHaveBeenCalled();
    });
  });

  describe('Duration Tracking', () => {
    it('tracks active duration', () => {
      const { result } = renderHook(() => usePushToTalk());

      act(() => {
        result.current.startPTT();
      });

      act(() => {
        vi.advanceTimersByTime(500);
      });

      expect(result.current.activeDuration).toBeGreaterThanOrEqual(400);
    });

    it('resets duration on end', () => {
      const { result } = renderHook(() => usePushToTalk());

      act(() => {
        result.current.startPTT();
      });

      act(() => {
        vi.advanceTimersByTime(500);
      });

      act(() => {
        result.current.endPTT();
      });

      expect(result.current.activeDuration).toBe(0);
    });

    it('passes duration to onPTTEnd callback', () => {
      const onPTTEnd = vi.fn();
      const { result } = renderHook(() =>
        usePushToTalk({}, { onPTTEnd })
      );

      act(() => {
        result.current.startPTT();
      });

      act(() => {
        vi.advanceTimersByTime(500);
        result.current.endPTT();
      });

      expect(onPTTEnd).toHaveBeenCalledWith(expect.any(Number));
      const duration = onPTTEnd.mock.calls[0][0];
      expect(duration).toBeGreaterThanOrEqual(400);
    });
  });

  describe('Haptic Feedback', () => {
    it('triggers haptic feedback on activation when enabled', () => {
      const { result } = renderHook(() =>
        usePushToTalk({ enableHapticFeedback: true })
      );

      act(() => {
        result.current.startPTT();
      });

      expect(mockVibrate).toHaveBeenCalledWith(50);
    });

    it('does not trigger haptic feedback when disabled', () => {
      const { result } = renderHook(() =>
        usePushToTalk({ enableHapticFeedback: false })
      );

      act(() => {
        result.current.startPTT();
      });

      expect(mockVibrate).not.toHaveBeenCalled();
    });
  });

  describe('Button Props', () => {
    it('provides button props for PTT button', () => {
      const { result } = renderHook(() => usePushToTalk());

      expect(result.current.buttonProps).toHaveProperty('onMouseDown');
      expect(result.current.buttonProps).toHaveProperty('onMouseUp');
      expect(result.current.buttonProps).toHaveProperty('onMouseLeave');
      expect(result.current.buttonProps).toHaveProperty('onTouchStart');
      expect(result.current.buttonProps).toHaveProperty('onTouchEnd');
      expect(result.current.buttonProps).toHaveProperty('onKeyDown');
      expect(result.current.buttonProps).toHaveProperty('onKeyUp');
      expect(result.current.buttonProps).toHaveProperty('aria-pressed');
      expect(result.current.buttonProps).toHaveProperty('disabled');
    });

    it('sets aria-pressed to true when active', () => {
      const { result } = renderHook(() => usePushToTalk());

      act(() => {
        result.current.startPTT();
      });

      expect(result.current.buttonProps['aria-pressed']).toBe(true);
    });

    it('sets aria-pressed to false when inactive', () => {
      const { result } = renderHook(() => usePushToTalk());

      expect(result.current.buttonProps['aria-pressed']).toBe(false);
    });

    it('sets disabled to true when cannot activate', () => {
      const { result } = renderHook(() =>
        usePushToTalk({ aiState: 'speaking' })
      );

      expect(result.current.buttonProps.disabled).toBe(true);
    });

    it('sets disabled to false when can activate', () => {
      const { result } = renderHook(() =>
        usePushToTalk({ aiState: 'idle' })
      );

      expect(result.current.buttonProps.disabled).toBe(false);
    });
  });

  describe('Mouse Events', () => {
    it('activates on mousedown', () => {
      const onPTTStart = vi.fn();
      const { result } = renderHook(() =>
        usePushToTalk({}, { onPTTStart })
      );

      act(() => {
        result.current.buttonProps.onMouseDown({
          button: 0,
        } as React.MouseEvent);
      });

      expect(result.current.isActive).toBe(true);
      expect(onPTTStart).toHaveBeenCalledWith('mouse');
    });

    it('deactivates on mouseup', () => {
      const { result } = renderHook(() => usePushToTalk());

      act(() => {
        result.current.buttonProps.onMouseDown({
          button: 0,
        } as React.MouseEvent);
      });

      act(() => {
        result.current.buttonProps.onMouseUp({} as React.MouseEvent);
      });

      expect(result.current.isActive).toBe(false);
    });

    it('deactivates on mouseleave', () => {
      const { result } = renderHook(() => usePushToTalk());

      act(() => {
        result.current.buttonProps.onMouseDown({
          button: 0,
        } as React.MouseEvent);
      });

      act(() => {
        result.current.buttonProps.onMouseLeave({} as React.MouseEvent);
      });

      expect(result.current.isActive).toBe(false);
    });

    it('ignores right click', () => {
      const { result } = renderHook(() => usePushToTalk());

      act(() => {
        result.current.buttonProps.onMouseDown({
          button: 2, // Right click
        } as React.MouseEvent);
      });

      expect(result.current.isActive).toBe(false);
    });

    it('respects enableMouse option', () => {
      const { result } = renderHook(() =>
        usePushToTalk({ enableMouse: false })
      );

      act(() => {
        result.current.buttonProps.onMouseDown({
          button: 0,
        } as React.MouseEvent);
      });

      expect(result.current.isActive).toBe(false);
    });
  });

  describe('Touch Events', () => {
    it('activates on touchstart', () => {
      const onPTTStart = vi.fn();
      const { result } = renderHook(() =>
        usePushToTalk({}, { onPTTStart })
      );

      act(() => {
        result.current.buttonProps.onTouchStart({} as React.TouchEvent);
      });

      expect(result.current.isActive).toBe(true);
      expect(onPTTStart).toHaveBeenCalledWith('touch');
    });

    it('deactivates on touchend', () => {
      const { result } = renderHook(() => usePushToTalk());

      act(() => {
        result.current.buttonProps.onTouchStart({} as React.TouchEvent);
      });

      act(() => {
        result.current.buttonProps.onTouchEnd({} as React.TouchEvent);
      });

      expect(result.current.isActive).toBe(false);
    });

    it('respects enableTouch option', () => {
      const { result } = renderHook(() =>
        usePushToTalk({ enableTouch: false })
      );

      act(() => {
        result.current.buttonProps.onTouchStart({} as React.TouchEvent);
      });

      expect(result.current.isActive).toBe(false);
    });
  });

  describe('Keyboard Events', () => {
    it('activates on space key by default', () => {
      const onPTTStart = vi.fn();
      const { result } = renderHook(() =>
        usePushToTalk({}, { onPTTStart })
      );

      act(() => {
        result.current.buttonProps.onKeyDown({
          key: ' ',
          repeat: false,
          preventDefault: vi.fn(),
        } as unknown as React.KeyboardEvent);
      });

      expect(result.current.isActive).toBe(true);
      expect(onPTTStart).toHaveBeenCalledWith('keyboard');
    });

    it('deactivates on space key up', () => {
      const { result } = renderHook(() => usePushToTalk());

      act(() => {
        result.current.buttonProps.onKeyDown({
          key: ' ',
          repeat: false,
          preventDefault: vi.fn(),
        } as unknown as React.KeyboardEvent);
      });

      act(() => {
        result.current.buttonProps.onKeyUp({
          key: ' ',
          preventDefault: vi.fn(),
        } as unknown as React.KeyboardEvent);
      });

      expect(result.current.isActive).toBe(false);
    });

    it('respects custom activation key', () => {
      const onPTTStart = vi.fn();
      const { result } = renderHook(() =>
        usePushToTalk(
          { activationKey: 'Enter' },
          { onPTTStart }
        )
      );

      // Space should not work
      act(() => {
        result.current.buttonProps.onKeyDown({
          key: ' ',
          repeat: false,
          preventDefault: vi.fn(),
        } as unknown as React.KeyboardEvent);
      });

      expect(result.current.isActive).toBe(false);

      // Enter should work
      act(() => {
        result.current.buttonProps.onKeyDown({
          key: 'Enter',
          repeat: false,
          preventDefault: vi.fn(),
        } as unknown as React.KeyboardEvent);
      });

      expect(result.current.isActive).toBe(true);
    });

    it('ignores key repeat events', () => {
      const onPTTStart = vi.fn();
      const { result } = renderHook(() =>
        usePushToTalk({}, { onPTTStart })
      );

      act(() => {
        result.current.buttonProps.onKeyDown({
          key: ' ',
          repeat: false,
          preventDefault: vi.fn(),
        } as unknown as React.KeyboardEvent);
      });

      act(() => {
        result.current.buttonProps.onKeyDown({
          key: ' ',
          repeat: true, // Key repeat
          preventDefault: vi.fn(),
        } as unknown as React.KeyboardEvent);
      });

      // Should only be called once
      expect(onPTTStart).toHaveBeenCalledTimes(1);
    });

    it('respects enableKeyboard option', () => {
      const { result } = renderHook(() =>
        usePushToTalk({ enableKeyboard: false })
      );

      act(() => {
        result.current.buttonProps.onKeyDown({
          key: ' ',
          repeat: false,
          preventDefault: vi.fn(),
        } as unknown as React.KeyboardEvent);
      });

      expect(result.current.isActive).toBe(false);
    });
  });

  describe('Callbacks', () => {
    it('calls onPTTStateChange when state changes', () => {
      const onPTTStateChange = vi.fn();
      const { result } = renderHook(() =>
        usePushToTalk({}, { onPTTStateChange })
      );

      // Initial call
      expect(onPTTStateChange).toHaveBeenCalled();
      onPTTStateChange.mockClear();

      act(() => {
        result.current.startPTT();
      });

      expect(onPTTStateChange).toHaveBeenCalledWith(
        expect.objectContaining({
          isActive: true,
          canActivate: true,
        })
      );
    });

    it('calls onPTTBlocked when activation is blocked', () => {
      const onPTTBlocked = vi.fn();
      const { result } = renderHook(() =>
        usePushToTalk(
          { aiState: 'speaking' },
          { onPTTBlocked }
        )
      );

      act(() => {
        result.current.startPTT();
      });

      expect(onPTTBlocked).toHaveBeenCalledWith('ai_speaking');
    });
  });

  describe('State Updates', () => {
    it('updates canActivate when aiState changes', () => {
      const { result, rerender } = renderHook(
        ({ aiState }) => usePushToTalk({ aiState }),
        { initialProps: { aiState: 'idle' as AIResponseState } }
      );

      expect(result.current.canActivate).toBe(true);

      rerender({ aiState: 'speaking' as AIResponseState });

      expect(result.current.canActivate).toBe(false);
      expect(result.current.blockReason).toBe('ai_speaking');
    });

    it('updates canActivate when enabled changes', () => {
      const { result, rerender } = renderHook(
        ({ enabled }) => usePushToTalk({ enabled }),
        { initialProps: { enabled: true } }
      );

      expect(result.current.canActivate).toBe(true);

      rerender({ enabled: false });

      expect(result.current.canActivate).toBe(false);
    });
  });

  describe('Cleanup', () => {
    it('cleans up timers on unmount', () => {
      const { result, unmount } = renderHook(() =>
        usePushToTalk({ minHoldTimeMs: 200 })
      );

      act(() => {
        result.current.startPTT();
      });

      // Should not throw
      unmount();
    });

    it('cleans up duration interval on unmount', () => {
      const { result, unmount } = renderHook(() => usePushToTalk());

      act(() => {
        result.current.startPTT();
      });

      // Should not throw
      unmount();
    });
  });

  describe('Target Ref', () => {
    it('provides a target ref for global keyboard events', () => {
      const { result } = renderHook(() => usePushToTalk());

      expect(result.current.targetRef).toBeDefined();
      expect(result.current.targetRef.current).toBeNull();
    });
  });
});
