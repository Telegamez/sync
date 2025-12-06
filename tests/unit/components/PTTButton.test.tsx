/**
 * PTTButton Component Tests
 *
 * Tests for the PTTButton component which provides push-to-talk functionality
 * with hold-to-talk interaction, visual feedback, and accessibility.
 *
 * Part of the Long-Horizon Engineering Protocol - FEAT-154
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PTTButton, InlinePTTButton, MainPTTButton, type PTTButtonProps } from '@/components/room/PTTButton';

// Helper to render with default props
function renderButton(props: Partial<PTTButtonProps> = {}) {
  const defaultProps: PTTButtonProps = {
    aiState: 'idle',
    enabled: true,
    ...props,
  };
  return render(<PTTButton {...defaultProps} />);
}

describe('PTTButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Initial Rendering', () => {
    it('renders with default props', () => {
      renderButton();

      expect(screen.getByRole('button')).toBeInTheDocument();
      expect(screen.getByText('Hold to talk')).toBeInTheDocument();
    });

    it('renders microphone icon when idle', () => {
      const { container } = renderButton();

      const svg = container.querySelector('svg');
      expect(svg).toBeInTheDocument();
    });

    it('applies correct size classes for different sizes', () => {
      const { rerender } = render(<PTTButton size="sm" />);
      expect(screen.getByRole('button')).toHaveClass('w-12', 'h-12');

      rerender(<PTTButton size="md" />);
      expect(screen.getByRole('button')).toHaveClass('w-16', 'h-16');

      rerender(<PTTButton size="lg" />);
      expect(screen.getByRole('button')).toHaveClass('w-20', 'h-20');

      rerender(<PTTButton size="xl" />);
      expect(screen.getByRole('button')).toHaveClass('w-24', 'h-24');
    });

    it('applies variant styles correctly', () => {
      const { container, rerender } = render(<PTTButton variant="default" />);

      // Default variant should have gray background
      expect(container.querySelector('.bg-gray-100')).toBeInTheDocument();

      rerender(<PTTButton variant="primary" />);
      expect(container.querySelector('.bg-purple-100')).toBeInTheDocument();

      rerender(<PTTButton variant="minimal" />);
      expect(container.querySelector('.bg-transparent')).toBeInTheDocument();
    });

    it('displays custom idle label', () => {
      renderButton({ idleLabel: 'Press and hold' });

      expect(screen.getByText('Press and hold')).toBeInTheDocument();
    });

    it('has correct aria attributes', () => {
      renderButton();

      const button = screen.getByRole('button');
      expect(button).toHaveAttribute('aria-pressed', 'false');
      expect(button).toHaveAttribute('aria-label');
    });

    it('includes keyboard hint in aria-label when keyboard enabled', () => {
      renderButton({ enableKeyboard: true });

      const button = screen.getByRole('button');
      expect(button.getAttribute('aria-label')).toContain('Space');
    });
  });

  describe('Disabled State', () => {
    it('shows disabled state when AI is speaking', () => {
      renderButton({ aiState: 'speaking' });

      const button = screen.getByRole('button');
      expect(button).toHaveAttribute('aria-disabled', 'true');
      expect(button).toHaveAttribute('data-state', 'disabled');
    });

    it('shows disabled state when AI is locked', () => {
      renderButton({ aiState: 'locked' });

      const button = screen.getByRole('button');
      expect(button).toHaveAttribute('aria-disabled', 'true');
    });

    it('shows disabled state when not enabled', () => {
      renderButton({ enabled: false });

      const button = screen.getByRole('button');
      expect(button).toHaveAttribute('aria-disabled', 'true');
    });

    it('shows disabled state for non-designated speakers', () => {
      renderButton({
        voiceMode: 'designatedSpeaker',
        isDesignatedSpeaker: false,
      });

      const button = screen.getByRole('button');
      expect(button).toHaveAttribute('aria-disabled', 'true');
    });

    it('shows blocked icon when disabled with reason', () => {
      const { container } = renderButton({ aiState: 'speaking' });

      // Should show lock/blocked icon
      const svg = container.querySelector('svg');
      expect(svg).toBeInTheDocument();
    });

    it('displays block reason message', () => {
      renderButton({ aiState: 'speaking' });

      // The label should indicate AI is speaking (use getAllByText since it appears in multiple places)
      const messages = screen.getAllByText('AI is speaking');
      expect(messages.length).toBeGreaterThan(0);
    });

    it('shows custom disabled label when no block reason', () => {
      renderButton({ enabled: false, disabledLabel: 'PTT disabled' });

      expect(screen.getByText('PTT disabled')).toBeInTheDocument();
    });
  });

  describe('Mouse Interaction', () => {
    it('activates on mouse down', async () => {
      const onPTTStart = vi.fn();
      renderButton({ onPTTStart });

      const button = screen.getByRole('button');
      fireEvent.mouseDown(button);

      // Advance timers for activation
      act(() => {
        vi.advanceTimersByTime(10);
      });

      expect(onPTTStart).toHaveBeenCalled();
    });

    it('deactivates on mouse up', async () => {
      const onPTTEnd = vi.fn();
      renderButton({ onPTTEnd });

      const button = screen.getByRole('button');
      fireEvent.mouseDown(button);

      act(() => {
        vi.advanceTimersByTime(100);
      });

      fireEvent.mouseUp(button);

      expect(onPTTEnd).toHaveBeenCalled();
    });

    it('deactivates on mouse leave', async () => {
      const onPTTEnd = vi.fn();
      renderButton({ onPTTEnd });

      const button = screen.getByRole('button');
      fireEvent.mouseDown(button);

      act(() => {
        vi.advanceTimersByTime(100);
      });

      fireEvent.mouseLeave(button);

      expect(onPTTEnd).toHaveBeenCalled();
    });

    it('does not activate when disabled', () => {
      const onPTTStart = vi.fn();
      renderButton({ aiState: 'speaking', onPTTStart });

      const button = screen.getByRole('button');
      fireEvent.mouseDown(button);

      act(() => {
        vi.advanceTimersByTime(10);
      });

      expect(onPTTStart).not.toHaveBeenCalled();
    });

    it('shows active label when held', () => {
      renderButton({ activeLabel: 'Talking...' });

      const button = screen.getByRole('button');
      fireEvent.mouseDown(button);

      act(() => {
        vi.advanceTimersByTime(10);
      });

      expect(screen.getByText('Talking...')).toBeInTheDocument();
    });
  });

  describe('Touch Interaction', () => {
    it('activates on touch start', () => {
      const onPTTStart = vi.fn();
      renderButton({ onPTTStart });

      const button = screen.getByRole('button');
      fireEvent.touchStart(button);

      act(() => {
        vi.advanceTimersByTime(10);
      });

      expect(onPTTStart).toHaveBeenCalled();
    });

    it('deactivates on touch end', () => {
      const onPTTEnd = vi.fn();
      renderButton({ onPTTEnd });

      const button = screen.getByRole('button');
      fireEvent.touchStart(button);

      act(() => {
        vi.advanceTimersByTime(100);
      });

      fireEvent.touchEnd(button);

      expect(onPTTEnd).toHaveBeenCalled();
    });

    it('has touch-none class to prevent scrolling', () => {
      renderButton();

      const button = screen.getByRole('button');
      expect(button).toHaveClass('touch-none');
    });
  });

  describe('Keyboard Interaction', () => {
    it('activates on Space key down', () => {
      const onPTTStart = vi.fn();
      renderButton({ onPTTStart, enableKeyboard: true });

      const button = screen.getByRole('button');
      button.focus();
      fireEvent.keyDown(button, { key: ' ' });

      act(() => {
        vi.advanceTimersByTime(10);
      });

      expect(onPTTStart).toHaveBeenCalled();
    });

    it('deactivates on Space key up', () => {
      const onPTTEnd = vi.fn();
      renderButton({ onPTTEnd, enableKeyboard: true });

      const button = screen.getByRole('button');
      button.focus();
      fireEvent.keyDown(button, { key: ' ' });

      act(() => {
        vi.advanceTimersByTime(100);
      });

      fireEvent.keyUp(button, { key: ' ' });

      expect(onPTTEnd).toHaveBeenCalled();
    });

    it('ignores repeated key events', () => {
      const onPTTStart = vi.fn();
      renderButton({ onPTTStart, enableKeyboard: true });

      const button = screen.getByRole('button');
      button.focus();

      // First press
      fireEvent.keyDown(button, { key: ' ' });
      act(() => {
        vi.advanceTimersByTime(10);
      });

      // Repeated key events (should be ignored)
      fireEvent.keyDown(button, { key: ' ', repeat: true });
      fireEvent.keyDown(button, { key: ' ', repeat: true });

      // Should only be called once
      expect(onPTTStart).toHaveBeenCalledTimes(1);
    });

    it('does not activate on Space when keyboard disabled', () => {
      const onPTTStart = vi.fn();
      renderButton({ onPTTStart, enableKeyboard: false });

      const button = screen.getByRole('button');
      button.focus();
      fireEvent.keyDown(button, { key: ' ' });

      act(() => {
        vi.advanceTimersByTime(10);
      });

      expect(onPTTStart).not.toHaveBeenCalled();
    });
  });

  describe('Duration Display', () => {
    it('shows duration when active and showDuration is true', () => {
      renderButton({ showDuration: true });

      const button = screen.getByRole('button');
      fireEvent.mouseDown(button);

      act(() => {
        vi.advanceTimersByTime(1500);
      });

      expect(screen.getByText(/\d+\.?\d*s/)).toBeInTheDocument();
    });

    it('does not show duration when showDuration is false', () => {
      renderButton({ showDuration: false });

      const button = screen.getByRole('button');
      fireEvent.mouseDown(button);

      act(() => {
        vi.advanceTimersByTime(1500);
      });

      expect(screen.queryByText(/\d+\.?\d*s/)).not.toBeInTheDocument();
    });

    it('formats duration correctly', () => {
      renderButton({ showDuration: true });

      const button = screen.getByRole('button');
      fireEvent.mouseDown(button);

      // Less than 10 seconds should show decimal
      act(() => {
        vi.advanceTimersByTime(5500);
      });

      expect(screen.getByText(/5\.\d+s/)).toBeInTheDocument();
    });
  });

  describe('Minimum Hold Time', () => {
    it('does not activate before minimum hold time', () => {
      const onPTTStart = vi.fn();
      renderButton({ onPTTStart, minHoldTimeMs: 200 });

      const button = screen.getByRole('button');
      fireEvent.mouseDown(button);

      act(() => {
        vi.advanceTimersByTime(100);
      });

      expect(onPTTStart).not.toHaveBeenCalled();

      act(() => {
        vi.advanceTimersByTime(150);
      });

      expect(onPTTStart).toHaveBeenCalled();
    });

    it('does not call onPTTEnd if released before activation', () => {
      const onPTTEnd = vi.fn();
      renderButton({ onPTTEnd, minHoldTimeMs: 200 });

      const button = screen.getByRole('button');
      fireEvent.mouseDown(button);

      act(() => {
        vi.advanceTimersByTime(100);
      });

      fireEvent.mouseUp(button);

      expect(onPTTEnd).not.toHaveBeenCalled();
    });
  });

  describe('Maximum Duration', () => {
    it('auto-releases after maximum duration', () => {
      const onPTTEnd = vi.fn();
      renderButton({ onPTTEnd, maxDurationMs: 5000 });

      const button = screen.getByRole('button');
      fireEvent.mouseDown(button);

      act(() => {
        vi.advanceTimersByTime(10);
      });

      act(() => {
        vi.advanceTimersByTime(5100);
      });

      expect(onPTTEnd).toHaveBeenCalled();
    });
  });

  describe('Callbacks', () => {
    it('does not call onPTTStart when activation blocked', () => {
      const onPTTStart = vi.fn();
      renderButton({ aiState: 'speaking', onPTTStart });

      const button = screen.getByRole('button');
      fireEvent.mouseDown(button);

      // Should not start when blocked
      expect(onPTTStart).not.toHaveBeenCalled();
      expect(button).toHaveAttribute('aria-disabled', 'true');
    });

    it('calls onPTTStateChange when state changes', () => {
      const onPTTStateChange = vi.fn();
      renderButton({ onPTTStateChange });

      const button = screen.getByRole('button');
      fireEvent.mouseDown(button);

      act(() => {
        vi.advanceTimersByTime(10);
      });

      expect(onPTTStateChange).toHaveBeenCalled();
    });

    it('passes duration to onPTTEnd', () => {
      const onPTTEnd = vi.fn();
      renderButton({ onPTTEnd });

      const button = screen.getByRole('button');
      fireEvent.mouseDown(button);

      act(() => {
        vi.advanceTimersByTime(1000);
      });

      fireEvent.mouseUp(button);

      expect(onPTTEnd).toHaveBeenCalledWith(expect.any(Number));
      expect(onPTTEnd.mock.calls[0][0]).toBeGreaterThanOrEqual(1000);
    });
  });

  describe('Visual States', () => {
    it('has data-state attribute for styling', () => {
      renderButton();

      const button = screen.getByRole('button');
      expect(button).toHaveAttribute('data-state', 'idle');
    });

    it('updates data-state when active', () => {
      renderButton();

      const button = screen.getByRole('button');
      fireEvent.mouseDown(button);

      act(() => {
        vi.advanceTimersByTime(10);
      });

      expect(button).toHaveAttribute('data-state', 'active');
    });

    it('updates data-state when disabled', () => {
      renderButton({ aiState: 'speaking' });

      const button = screen.getByRole('button');
      expect(button).toHaveAttribute('data-state', 'disabled');
    });

    it('has data-ptt-active attribute', () => {
      renderButton();

      const button = screen.getByRole('button');
      expect(button).toHaveAttribute('data-ptt-active', 'false');

      fireEvent.mouseDown(button);

      act(() => {
        vi.advanceTimersByTime(10);
      });

      expect(button).toHaveAttribute('data-ptt-active', 'true');
    });

    it('shows ring animation when active', () => {
      const { container } = renderButton({ size: 'lg' });

      const button = screen.getByRole('button');
      fireEvent.mouseDown(button);

      act(() => {
        vi.advanceTimersByTime(10);
      });

      // lg size uses ring-4
      expect(button).toHaveClass('ring-4');
    });

    it('applies custom className', () => {
      renderButton({ className: 'my-custom-class' });

      const button = screen.getByRole('button');
      expect(button).toHaveClass('my-custom-class');
    });

    it('applies custom style', () => {
      renderButton({ style: { margin: '10px' } });

      const button = screen.getByRole('button');
      expect(button).toHaveStyle({ margin: '10px' });
    });
  });

  describe('Block Reason Tooltip', () => {
    it('shows tooltip when blocked and showBlockReason is true', () => {
      renderButton({ aiState: 'speaking', showBlockReason: true });

      const button = screen.getByRole('button');
      fireEvent.mouseDown(button);

      expect(screen.getByRole('tooltip')).toBeInTheDocument();
    });

    it('does not show tooltip when showBlockReason is false', () => {
      renderButton({ aiState: 'speaking', showBlockReason: false });

      const button = screen.getByRole('button');
      fireEvent.mouseDown(button);

      expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    });

    it('hides tooltip after timeout', () => {
      renderButton({ aiState: 'speaking', showBlockReason: true });

      const button = screen.getByRole('button');
      fireEvent.mouseDown(button);

      expect(screen.getByRole('tooltip')).toBeInTheDocument();

      act(() => {
        vi.advanceTimersByTime(3500);
      });

      expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('has focus ring on focus', () => {
      renderButton();

      const button = screen.getByRole('button');
      expect(button).toHaveClass('focus:ring-2');
    });

    it('is focusable', () => {
      renderButton();

      const button = screen.getByRole('button');
      button.focus();

      expect(document.activeElement).toBe(button);
    });

    it('updates aria-pressed when active', () => {
      renderButton();

      const button = screen.getByRole('button');
      expect(button).toHaveAttribute('aria-pressed', 'false');

      fireEvent.mouseDown(button);

      act(() => {
        vi.advanceTimersByTime(10);
      });

      expect(button).toHaveAttribute('aria-pressed', 'true');
    });

    it('has select-none to prevent text selection', () => {
      renderButton();

      const button = screen.getByRole('button');
      expect(button).toHaveClass('select-none');
    });
  });

  describe('Voice Mode Integration', () => {
    it('works in pushToTalk mode', () => {
      const onPTTStart = vi.fn();
      renderButton({ voiceMode: 'pushToTalk', onPTTStart });

      const button = screen.getByRole('button');
      fireEvent.mouseDown(button);

      act(() => {
        vi.advanceTimersByTime(10);
      });

      expect(onPTTStart).toHaveBeenCalled();
    });

    it('works in open mode', () => {
      const onPTTStart = vi.fn();
      renderButton({ voiceMode: 'open', onPTTStart });

      const button = screen.getByRole('button');
      fireEvent.mouseDown(button);

      act(() => {
        vi.advanceTimersByTime(10);
      });

      expect(onPTTStart).toHaveBeenCalled();
    });

    it('blocks non-designated speakers in designatedSpeaker mode', () => {
      const onPTTStart = vi.fn();
      const onPTTBlocked = vi.fn();
      renderButton({
        voiceMode: 'designatedSpeaker',
        isDesignatedSpeaker: false,
        onPTTStart,
        onPTTBlocked,
      });

      const button = screen.getByRole('button');
      fireEvent.mouseDown(button);

      // Button should be disabled
      expect(button).toHaveAttribute('aria-disabled', 'true');
      expect(onPTTStart).not.toHaveBeenCalled();
    });

    it('allows designated speakers in designatedSpeaker mode', () => {
      const onPTTStart = vi.fn();
      renderButton({
        voiceMode: 'designatedSpeaker',
        isDesignatedSpeaker: true,
        onPTTStart,
      });

      const button = screen.getByRole('button');
      fireEvent.mouseDown(button);

      act(() => {
        vi.advanceTimersByTime(10);
      });

      expect(onPTTStart).toHaveBeenCalled();
    });
  });
});

describe('InlinePTTButton', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders with small size', () => {
    render(<InlinePTTButton />);

    const button = screen.getByRole('button');
    expect(button).toHaveClass('w-12', 'h-12');
  });

  it('uses minimal variant', () => {
    const { container } = render(<InlinePTTButton />);

    expect(container.querySelector('.bg-transparent')).toBeInTheDocument();
  });

  it('hides duration display', () => {
    render(<InlinePTTButton />);

    const button = screen.getByRole('button');
    fireEvent.mouseDown(button);

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(screen.queryByText(/\d+\.?\d*s/)).not.toBeInTheDocument();
  });

  it('passes through props', () => {
    const onPTTStart = vi.fn();
    render(<InlinePTTButton aiState="idle" onPTTStart={onPTTStart} />);

    const button = screen.getByRole('button');
    fireEvent.mouseDown(button);

    act(() => {
      vi.advanceTimersByTime(10);
    });

    expect(onPTTStart).toHaveBeenCalled();
  });
});

describe('MainPTTButton', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders with xl size', () => {
    render(<MainPTTButton />);

    const button = screen.getByRole('button');
    expect(button).toHaveClass('w-24', 'h-24');
  });

  it('uses primary variant', () => {
    const { container } = render(<MainPTTButton />);

    expect(container.querySelector('.bg-purple-100')).toBeInTheDocument();
  });

  it('shows duration display', () => {
    render(<MainPTTButton />);

    const button = screen.getByRole('button');
    fireEvent.mouseDown(button);

    act(() => {
      vi.advanceTimersByTime(1500);
    });

    expect(screen.getByText(/\d+\.?\d*s/)).toBeInTheDocument();
  });

  it('passes through props', () => {
    const onPTTStart = vi.fn();
    render(<MainPTTButton aiState="idle" onPTTStart={onPTTStart} />);

    const button = screen.getByRole('button');
    fireEvent.mouseDown(button);

    act(() => {
      vi.advanceTimersByTime(10);
    });

    expect(onPTTStart).toHaveBeenCalled();
  });
});
