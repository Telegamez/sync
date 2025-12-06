/**
 * AIStateIndicator Component Tests
 *
 * Tests for the AIStateIndicator component which displays
 * the current AI response state with visual feedback.
 *
 * Part of the Long-Horizon Engineering Protocol - FEAT-155
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  AIStateIndicator,
  AIStateBadge,
  AIStateDot,
  AIStateDisplay,
  type AIStateIndicatorProps,
} from '@/components/room/AIStateIndicator';
import type { AIResponseState } from '@/types/voice-mode';

// Helper to render with default props
function renderIndicator(props: Partial<AIStateIndicatorProps> = {}) {
  const defaultProps: AIStateIndicatorProps = {
    state: 'idle',
    ...props,
  };
  return render(<AIStateIndicator {...defaultProps} />);
}

describe('AIStateIndicator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Initial Rendering', () => {
    it('renders with idle state', () => {
      renderIndicator({ state: 'idle' });

      expect(screen.getByRole('status')).toBeInTheDocument();
      expect(screen.getByText('Ready')).toBeInTheDocument();
    });

    it('has correct aria-label for accessibility', () => {
      renderIndicator({ state: 'idle' });

      const status = screen.getByRole('status');
      expect(status).toHaveAttribute('aria-label', 'AI is ready');
    });

    it('has aria-live for screen readers', () => {
      renderIndicator({ state: 'idle' });

      const status = screen.getByRole('status');
      expect(status).toHaveAttribute('aria-live', 'polite');
    });

    it('has data-state attribute', () => {
      renderIndicator({ state: 'idle' });

      const status = screen.getByRole('status');
      expect(status).toHaveAttribute('data-state', 'idle');
    });
  });

  describe('State Display', () => {
    const states: AIResponseState[] = ['idle', 'listening', 'processing', 'speaking', 'locked'];

    it.each(states)('displays %s state correctly', (state) => {
      renderIndicator({ state });

      const status = screen.getByRole('status');
      expect(status).toHaveAttribute('data-state', state);
    });

    it('shows "Ready" for idle state', () => {
      renderIndicator({ state: 'idle' });
      expect(screen.getByText('Ready')).toBeInTheDocument();
    });

    it('shows "Listening..." for listening state', () => {
      renderIndicator({ state: 'listening' });
      expect(screen.getByText('Listening...')).toBeInTheDocument();
    });

    it('shows "Thinking..." for processing state', () => {
      renderIndicator({ state: 'processing' });
      expect(screen.getByText('Thinking...')).toBeInTheDocument();
    });

    it('shows "Speaking..." for speaking state', () => {
      renderIndicator({ state: 'speaking' });
      expect(screen.getByText('Speaking...')).toBeInTheDocument();
    });

    it('shows "Locked" for locked state', () => {
      renderIndicator({ state: 'locked' });
      expect(screen.getByText('Locked')).toBeInTheDocument();
    });
  });

  describe('Size Variants', () => {
    it('applies small size classes', () => {
      const { container } = renderIndicator({ size: 'sm' });

      expect(container.querySelector('.px-2')).toBeInTheDocument();
      expect(container.querySelector('.text-xs')).toBeInTheDocument();
    });

    it('applies medium size classes', () => {
      const { container } = renderIndicator({ size: 'md' });

      expect(container.querySelector('.px-3')).toBeInTheDocument();
      expect(container.querySelector('.text-sm')).toBeInTheDocument();
    });

    it('applies large size classes', () => {
      const { container } = renderIndicator({ size: 'lg' });

      expect(container.querySelector('.px-4')).toBeInTheDocument();
      expect(container.querySelector('.text-base')).toBeInTheDocument();
    });
  });

  describe('Display Modes', () => {
    describe('Compact Mode', () => {
      it('renders as compact by default', () => {
        const { container } = renderIndicator({ mode: 'compact' });

        expect(container.querySelector('.rounded-full')).toBeInTheDocument();
      });

      it('shows icon and text inline', () => {
        const { container } = renderIndicator({ mode: 'compact', state: 'listening' });

        expect(container.querySelector('svg')).toBeInTheDocument();
        expect(screen.getByText('Listening...')).toBeInTheDocument();
      });

      it('shows queue info when in queue', () => {
        renderIndicator({
          mode: 'compact',
          state: 'speaking',
          queuePosition: 2,
          queueLength: 5,
          showQueue: true,
        });

        expect(screen.getByText('Position 2 of 5')).toBeInTheDocument();
      });

      it('shows "You\'re next" for queue position 1', () => {
        renderIndicator({
          mode: 'compact',
          state: 'speaking',
          queuePosition: 1,
          showQueue: true,
        });

        expect(screen.getByText("You're next")).toBeInTheDocument();
      });
    });

    describe('Minimal Mode', () => {
      it('renders as minimal with dot', () => {
        const { container } = renderIndicator({ mode: 'minimal' });

        expect(container.querySelector('.rounded-full')).toBeInTheDocument();
      });

      it('shows short label', () => {
        renderIndicator({ mode: 'minimal', state: 'processing' });

        expect(screen.getByText('Thinking')).toBeInTheDocument();
      });

      it('does not show queue info', () => {
        renderIndicator({
          mode: 'minimal',
          state: 'speaking',
          queuePosition: 2,
          showQueue: true,
        });

        expect(screen.queryByText(/Position/)).not.toBeInTheDocument();
      });
    });

    describe('Expanded Mode', () => {
      it('renders as expanded with flex-col', () => {
        const { container } = renderIndicator({ mode: 'expanded' });

        expect(container.querySelector('.flex-col')).toBeInTheDocument();
      });

      it('shows larger icon', () => {
        const { container } = renderIndicator({ mode: 'expanded', state: 'listening' });

        expect(container.querySelector('svg')).toBeInTheDocument();
      });

      it('shows queue info with icon', () => {
        renderIndicator({
          mode: 'expanded',
          state: 'speaking',
          queuePosition: 3,
          queueLength: 10,
          showQueue: true,
        });

        expect(screen.getByText('Position 3 of 10')).toBeInTheDocument();
      });

      it('shows speaker name when not current speaker', () => {
        renderIndicator({
          mode: 'expanded',
          state: 'listening',
          currentSpeakerName: 'Alice',
          isCurrentSpeaker: false,
          showSpeaker: true,
        });

        expect(screen.getByText('Alice')).toBeInTheDocument();
      });
    });
  });

  describe('Speaker Info', () => {
    it('shows "Listening to you..." when current speaker', () => {
      renderIndicator({
        state: 'listening',
        isCurrentSpeaker: true,
        showSpeaker: true,
      });

      expect(screen.getByText('Listening to you...')).toBeInTheDocument();
    });

    it('shows "Responding to you..." when current speaker and speaking', () => {
      renderIndicator({
        state: 'speaking',
        isCurrentSpeaker: true,
        showSpeaker: true,
      });

      expect(screen.getByText('Responding to you...')).toBeInTheDocument();
    });

    it('shows speaker name when listening to another user', () => {
      renderIndicator({
        state: 'listening',
        currentSpeakerName: 'Bob',
        isCurrentSpeaker: false,
        showSpeaker: true,
      });

      expect(screen.getByText('Listening to Bob...')).toBeInTheDocument();
    });

    it('shows speaker name when responding to another user', () => {
      renderIndicator({
        state: 'speaking',
        currentSpeakerName: 'Charlie',
        isCurrentSpeaker: false,
        showSpeaker: true,
      });

      expect(screen.getByText('Responding to Charlie...')).toBeInTheDocument();
    });

    it('does not show speaker info when showSpeaker is false', () => {
      renderIndicator({
        state: 'listening',
        currentSpeakerName: 'Alice',
        showSpeaker: false,
      });

      expect(screen.queryByText(/Alice/)).not.toBeInTheDocument();
    });
  });

  describe('Queue Info', () => {
    it('shows queue position when in queue', () => {
      renderIndicator({
        state: 'speaking',
        queuePosition: 3,
        showQueue: true,
      });

      expect(screen.getByText('Position 3')).toBeInTheDocument();
    });

    it('shows queue position and length', () => {
      renderIndicator({
        state: 'speaking',
        queuePosition: 2,
        queueLength: 5,
        showQueue: true,
      });

      expect(screen.getByText('Position 2 of 5')).toBeInTheDocument();
    });

    it('does not show queue info when not in queue', () => {
      renderIndicator({
        state: 'speaking',
        queuePosition: 0,
        showQueue: true,
      });

      expect(screen.queryByText(/Position/)).not.toBeInTheDocument();
    });

    it('does not show queue info in idle state', () => {
      renderIndicator({
        state: 'idle',
        queuePosition: 2,
        showQueue: true,
      });

      expect(screen.queryByText(/Position/)).not.toBeInTheDocument();
    });

    it('does not show queue info when showQueue is false', () => {
      renderIndicator({
        state: 'speaking',
        queuePosition: 2,
        showQueue: false,
      });

      expect(screen.queryByText(/Position/)).not.toBeInTheDocument();
    });
  });

  describe('Animations', () => {
    it('applies pulse animation for listening state', () => {
      const { container } = renderIndicator({
        state: 'listening',
        animate: true,
      });

      expect(container.querySelector('.animate-pulse')).toBeInTheDocument();
    });

    it('applies bounce animation for processing state', () => {
      const { container } = renderIndicator({
        state: 'processing',
        animate: true,
      });

      expect(container.querySelector('.animate-bounce')).toBeInTheDocument();
    });

    it('applies pulse animation for speaking state', () => {
      const { container } = renderIndicator({
        state: 'speaking',
        animate: true,
      });

      expect(container.querySelector('.animate-pulse')).toBeInTheDocument();
    });

    it('does not animate idle state', () => {
      const { container } = renderIndicator({
        state: 'idle',
        animate: true,
      });

      expect(container.querySelector('.animate-pulse')).not.toBeInTheDocument();
      expect(container.querySelector('.animate-bounce')).not.toBeInTheDocument();
    });

    it('does not animate locked state', () => {
      const { container } = renderIndicator({
        state: 'locked',
        animate: true,
      });

      expect(container.querySelector('.animate-pulse')).not.toBeInTheDocument();
      expect(container.querySelector('.animate-bounce')).not.toBeInTheDocument();
    });

    it('disables animations when animate is false', () => {
      const { container } = renderIndicator({
        state: 'listening',
        animate: false,
      });

      expect(container.querySelector('.animate-pulse')).not.toBeInTheDocument();
    });
  });

  describe('Color Coding', () => {
    it('applies gray colors for idle state', () => {
      const { container } = renderIndicator({ state: 'idle' });

      expect(container.querySelector('.bg-gray-100')).toBeInTheDocument();
    });

    it('applies blue colors for listening state', () => {
      const { container } = renderIndicator({ state: 'listening' });

      expect(container.querySelector('.bg-blue-50')).toBeInTheDocument();
    });

    it('applies amber colors for processing state', () => {
      const { container } = renderIndicator({ state: 'processing' });

      expect(container.querySelector('.bg-amber-50')).toBeInTheDocument();
    });

    it('applies green colors for speaking state', () => {
      const { container } = renderIndicator({ state: 'speaking' });

      expect(container.querySelector('.bg-green-50')).toBeInTheDocument();
    });

    it('applies red colors for locked state', () => {
      const { container } = renderIndicator({ state: 'locked' });

      expect(container.querySelector('.bg-red-50')).toBeInTheDocument();
    });
  });

  describe('Custom Styling', () => {
    it('applies custom className', () => {
      renderIndicator({ className: 'my-custom-class' });

      const status = screen.getByRole('status');
      expect(status).toHaveClass('my-custom-class');
    });

    it('applies transition classes', () => {
      const { container } = renderIndicator();

      expect(container.querySelector('.transition-colors')).toBeInTheDocument();
    });
  });

  describe('Icons', () => {
    it('renders icon for each state', () => {
      const states: AIResponseState[] = ['idle', 'listening', 'processing', 'speaking', 'locked'];

      states.forEach((state) => {
        const { container, unmount } = render(<AIStateIndicator state={state} />);
        expect(container.querySelector('svg')).toBeInTheDocument();
        unmount();
      });
    });

    it('hides icons with aria-hidden', () => {
      const { container } = renderIndicator({ state: 'listening' });

      const svg = container.querySelector('svg');
      expect(svg).toHaveAttribute('aria-hidden', 'true');
    });
  });
});

describe('AIStateBadge', () => {
  it('renders with small size by default', () => {
    const { container } = render(<AIStateBadge state="idle" />);

    expect(container.querySelector('.px-2')).toBeInTheDocument();
    expect(container.querySelector('.text-xs')).toBeInTheDocument();
  });

  it('uses compact mode', () => {
    const { container } = render(<AIStateBadge state="listening" />);

    expect(container.querySelector('.rounded-full')).toBeInTheDocument();
  });

  it('does not show queue info', () => {
    render(<AIStateBadge state="speaking" queuePosition={2} />);

    expect(screen.queryByText(/Position/)).not.toBeInTheDocument();
  });

  it('does not show speaker info', () => {
    render(<AIStateBadge state="listening" currentSpeakerName="Alice" />);

    expect(screen.queryByText(/Alice/)).not.toBeInTheDocument();
  });

  it('passes through other props', () => {
    render(<AIStateBadge state="processing" animate={true} />);

    expect(screen.getByRole('status')).toHaveAttribute('data-state', 'processing');
  });
});

describe('AIStateDot', () => {
  it('renders with small size by default', () => {
    const { container } = render(<AIStateDot state="idle" />);

    expect(container.querySelector('.text-xs')).toBeInTheDocument();
  });

  it('uses minimal mode', () => {
    render(<AIStateDot state="idle" />);

    // Minimal mode shows short label
    expect(screen.getByText('Ready')).toBeInTheDocument();
  });

  it('renders colored dot', () => {
    const { container } = render(<AIStateDot state="speaking" />);

    expect(container.querySelector('.rounded-full')).toBeInTheDocument();
  });

  it('does not show queue info', () => {
    render(<AIStateDot state="speaking" queuePosition={2} />);

    expect(screen.queryByText(/Position/)).not.toBeInTheDocument();
  });

  it('passes through other props', () => {
    render(<AIStateDot state="locked" className="my-class" />);

    const status = screen.getByRole('status');
    expect(status).toHaveClass('my-class');
  });
});

describe('AIStateDisplay', () => {
  it('renders with large size by default', () => {
    const { container } = render(<AIStateDisplay state="idle" />);

    expect(container.querySelector('.px-4')).toBeInTheDocument();
    expect(container.querySelector('.text-base')).toBeInTheDocument();
  });

  it('uses expanded mode', () => {
    const { container } = render(<AIStateDisplay state="listening" />);

    expect(container.querySelector('.flex-col')).toBeInTheDocument();
  });

  it('shows queue info by default', () => {
    render(<AIStateDisplay state="speaking" queuePosition={3} queueLength={5} />);

    expect(screen.getByText('Position 3 of 5')).toBeInTheDocument();
  });

  it('shows speaker info by default', () => {
    render(
      <AIStateDisplay
        state="listening"
        currentSpeakerName="Bob"
        isCurrentSpeaker={false}
      />
    );

    expect(screen.getByText('Bob')).toBeInTheDocument();
  });

  it('passes through other props', () => {
    render(<AIStateDisplay state="processing" animate={false} />);

    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('data-state', 'processing');
  });
});
