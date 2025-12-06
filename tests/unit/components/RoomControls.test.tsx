/**
 * RoomControls Component Tests
 *
 * Tests for the RoomControls component which provides mute, leave,
 * PTT, and settings controls for room participants.
 *
 * Part of the Long-Horizon Engineering Protocol - FEAT-116
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RoomControls, type RoomControlsProps } from '@/components/room/RoomControls';

// Helper to render with default props
function renderControls(props: Partial<RoomControlsProps> = {}) {
  const defaultProps: RoomControlsProps = {
    isMuted: false,
    onMuteToggle: vi.fn(),
    onLeaveRoom: vi.fn(),
    ...props,
  };
  return render(<RoomControls {...defaultProps} />);
}

describe('RoomControls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Mute/Unmute Button', () => {
    it('should display microphone icon when not muted', () => {
      renderControls({ isMuted: false });

      expect(screen.getByLabelText(/Mute microphone/)).toBeInTheDocument();
    });

    it('should display muted icon when muted', () => {
      renderControls({ isMuted: true });

      expect(screen.getByLabelText(/Unmute microphone/)).toBeInTheDocument();
    });

    it('should call onMuteToggle when clicked', async () => {
      const user = userEvent.setup();
      const onMuteToggle = vi.fn();
      renderControls({ onMuteToggle });

      await user.click(screen.getByLabelText(/Mute microphone/));

      expect(onMuteToggle).toHaveBeenCalledOnce();
    });

    it('should have different styling when muted', () => {
      const { container } = renderControls({ isMuted: true });

      const muteButton = container.querySelector('.bg-red-500');
      expect(muteButton).toBeInTheDocument();
    });

    it('should have default styling when not muted', () => {
      const { container } = renderControls({ isMuted: false });

      const muteButton = container.querySelector('.bg-gray-100');
      expect(muteButton).toBeInTheDocument();
    });

    it('should include keyboard shortcut in label', () => {
      renderControls({ isMuted: false });

      expect(screen.getByLabelText(/\(M\)/)).toBeInTheDocument();
    });
  });

  describe('Leave Room Button', () => {
    it('should display leave button', () => {
      renderControls();

      expect(screen.getByLabelText('Leave room')).toBeInTheDocument();
    });

    it('should call onLeaveRoom when clicked', async () => {
      const user = userEvent.setup();
      const onLeaveRoom = vi.fn();
      renderControls({ onLeaveRoom });

      await user.click(screen.getByLabelText('Leave room'));

      expect(onLeaveRoom).toHaveBeenCalledOnce();
    });

    it('should show loading spinner when isLeaving', () => {
      const { container } = renderControls({ isLeaving: true });

      const spinner = container.querySelector('.animate-spin');
      expect(spinner).toBeInTheDocument();
    });

    it('should be disabled when isLeaving', () => {
      renderControls({ isLeaving: true });

      expect(screen.getByLabelText('Leave room')).toBeDisabled();
    });

    it('should have danger styling', () => {
      const { container } = renderControls();

      // Find the leave button (danger variant)
      const leaveButton = screen.getByLabelText('Leave room');
      expect(leaveButton).toHaveClass('bg-red-100');
    });
  });

  describe('Settings Button', () => {
    it('should not display settings button by default', () => {
      renderControls();

      expect(screen.queryByLabelText('Room settings')).not.toBeInTheDocument();
    });

    it('should display settings button when showSettings is true', () => {
      renderControls({
        showSettings: true,
        onSettingsClick: vi.fn(),
      });

      expect(screen.getByLabelText('Room settings')).toBeInTheDocument();
    });

    it('should not display settings button if showSettings true but no handler', () => {
      renderControls({
        showSettings: true,
        onSettingsClick: undefined,
      });

      expect(screen.queryByLabelText('Room settings')).not.toBeInTheDocument();
    });

    it('should call onSettingsClick when clicked', async () => {
      const user = userEvent.setup();
      const onSettingsClick = vi.fn();
      renderControls({
        showSettings: true,
        onSettingsClick,
      });

      await user.click(screen.getByLabelText('Room settings'));

      expect(onSettingsClick).toHaveBeenCalledOnce();
    });
  });

  describe('PTT Button', () => {
    it('should not display PTT button by default', () => {
      renderControls();

      expect(screen.queryByLabelText(/talk to AI/)).not.toBeInTheDocument();
    });

    it('should display PTT button when showPTT is true', () => {
      renderControls({
        showPTT: true,
        onPTTStart: vi.fn(),
        onPTTEnd: vi.fn(),
      });

      expect(screen.getByLabelText(/Hold to talk to AI/)).toBeInTheDocument();
    });

    it('should call onPTTStart on mouse down', () => {
      const onPTTStart = vi.fn();
      renderControls({
        showPTT: true,
        onPTTStart,
        onPTTEnd: vi.fn(),
      });

      fireEvent.mouseDown(screen.getByLabelText(/Hold to talk to AI/));

      expect(onPTTStart).toHaveBeenCalledOnce();
    });

    it('should call onPTTEnd on mouse up', () => {
      const onPTTEnd = vi.fn();
      renderControls({
        showPTT: true,
        onPTTStart: vi.fn(),
        onPTTEnd,
      });

      const button = screen.getByLabelText(/Hold to talk to AI/);
      fireEvent.mouseDown(button);
      fireEvent.mouseUp(button);

      expect(onPTTEnd).toHaveBeenCalledOnce();
    });

    it('should call onPTTEnd on mouse leave', () => {
      const onPTTEnd = vi.fn();
      renderControls({
        showPTT: true,
        onPTTStart: vi.fn(),
        onPTTEnd,
      });

      const button = screen.getByLabelText(/Hold to talk to AI/);
      fireEvent.mouseDown(button);
      fireEvent.mouseLeave(button);

      expect(onPTTEnd).toHaveBeenCalledOnce();
    });

    it('should change label when PTT is active', () => {
      renderControls({
        showPTT: true,
        onPTTStart: vi.fn(),
        onPTTEnd: vi.fn(),
      });

      const button = screen.getByLabelText(/Hold to talk to AI/);
      fireEvent.mouseDown(button);

      expect(screen.getByLabelText(/Release to stop talking to AI/)).toBeInTheDocument();
    });

    it('should show active label when isAddressingAI is true', () => {
      renderControls({
        showPTT: true,
        isAddressingAI: true,
        onPTTStart: vi.fn(),
        onPTTEnd: vi.fn(),
      });

      expect(screen.getByLabelText(/Release to stop talking to AI/)).toBeInTheDocument();
    });

    it('should have active styling when PTT is pressed', () => {
      renderControls({
        showPTT: true,
        onPTTStart: vi.fn(),
        onPTTEnd: vi.fn(),
      });

      const button = screen.getByLabelText(/Hold to talk to AI/);
      fireEvent.mouseDown(button);

      // Should have ring styling when active
      expect(button).toHaveClass('ring-purple-500');
    });

    it('should support touch events', () => {
      const onPTTStart = vi.fn();
      const onPTTEnd = vi.fn();
      renderControls({
        showPTT: true,
        onPTTStart,
        onPTTEnd,
      });

      const button = screen.getByLabelText(/Hold to talk to AI/);
      fireEvent.touchStart(button);
      expect(onPTTStart).toHaveBeenCalledOnce();

      fireEvent.touchEnd(button);
      expect(onPTTEnd).toHaveBeenCalledOnce();
    });

    it('should support keyboard Space key for PTT', () => {
      const onPTTStart = vi.fn();
      const onPTTEnd = vi.fn();
      renderControls({
        showPTT: true,
        onPTTStart,
        onPTTEnd,
      });

      const button = screen.getByLabelText(/Hold to talk to AI/);
      fireEvent.keyDown(button, { key: ' ' });
      expect(onPTTStart).toHaveBeenCalledOnce();

      fireEvent.keyUp(button, { key: ' ' });
      expect(onPTTEnd).toHaveBeenCalledOnce();
    });

    it('should support keyboard Enter key for PTT', () => {
      const onPTTStart = vi.fn();
      const onPTTEnd = vi.fn();
      renderControls({
        showPTT: true,
        onPTTStart,
        onPTTEnd,
      });

      const button = screen.getByLabelText(/Hold to talk to AI/);
      fireEvent.keyDown(button, { key: 'Enter' });
      expect(onPTTStart).toHaveBeenCalledOnce();

      fireEvent.keyUp(button, { key: 'Enter' });
      expect(onPTTEnd).toHaveBeenCalledOnce();
    });
  });

  describe('Layout', () => {
    it('should render horizontal layout by default', () => {
      const { container } = renderControls();

      const toolbar = container.querySelector('[role="toolbar"]');
      expect(toolbar).toHaveClass('flex-row');
    });

    it('should render vertical layout when specified', () => {
      const { container } = renderControls({ layout: 'vertical' });

      const toolbar = container.querySelector('[role="toolbar"]');
      expect(toolbar).toHaveClass('flex-col');
    });
  });

  describe('Size Variants', () => {
    it('should render sm size buttons', () => {
      const { container } = renderControls({ size: 'sm' });

      const button = container.querySelector('.w-10');
      expect(button).toBeInTheDocument();
    });

    it('should render md size buttons (default)', () => {
      const { container } = renderControls({});

      const button = container.querySelector('.w-12');
      expect(button).toBeInTheDocument();
    });

    it('should render lg size buttons', () => {
      const { container } = renderControls({ size: 'lg' });

      const button = container.querySelector('.w-14');
      expect(button).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('should have toolbar role', () => {
      renderControls();

      expect(screen.getByRole('toolbar')).toBeInTheDocument();
    });

    it('should have aria-label on toolbar', () => {
      renderControls();

      expect(screen.getByLabelText('Room controls')).toBeInTheDocument();
    });

    it('should have accessible button labels', () => {
      renderControls({
        showSettings: true,
        showPTT: true,
        onSettingsClick: vi.fn(),
        onPTTStart: vi.fn(),
        onPTTEnd: vi.fn(),
      });

      expect(screen.getByLabelText(/Mute microphone/)).toBeInTheDocument();
      expect(screen.getByLabelText(/talk to AI/)).toBeInTheDocument();
      expect(screen.getByLabelText('Room settings')).toBeInTheDocument();
      expect(screen.getByLabelText('Leave room')).toBeInTheDocument();
    });

    it('should have aria-pressed on PTT button when active', () => {
      renderControls({
        showPTT: true,
        onPTTStart: vi.fn(),
        onPTTEnd: vi.fn(),
      });

      const button = screen.getByLabelText(/Hold to talk to AI/);
      expect(button).toHaveAttribute('aria-pressed', 'false');

      fireEvent.mouseDown(button);
      expect(button).toHaveAttribute('aria-pressed', 'true');
    });

    it('should have focus styles on buttons', async () => {
      const user = userEvent.setup();
      renderControls();

      const muteButton = screen.getByLabelText(/Mute microphone/);
      await user.tab();

      expect(muteButton).toHaveFocus();
      expect(muteButton).toHaveClass('focus:ring-2');
    });

    it('should be keyboard navigable', async () => {
      const user = userEvent.setup();
      renderControls({
        showSettings: true,
        onSettingsClick: vi.fn(),
      });

      // Tab through buttons
      await user.tab();
      expect(screen.getByLabelText(/Mute microphone/)).toHaveFocus();

      await user.tab();
      expect(screen.getByLabelText('Room settings')).toHaveFocus();

      await user.tab();
      expect(screen.getByLabelText('Leave room')).toHaveFocus();
    });
  });

  describe('Custom Styling', () => {
    it('should apply custom className', () => {
      const { container } = renderControls({ className: 'custom-class' });

      const toolbar = container.querySelector('[role="toolbar"]');
      expect(toolbar).toHaveClass('custom-class');
    });
  });

  describe('Button Order', () => {
    it('should render buttons in correct order', () => {
      renderControls({
        showPTT: true,
        showSettings: true,
        onSettingsClick: vi.fn(),
        onPTTStart: vi.fn(),
        onPTTEnd: vi.fn(),
      });

      const buttons = screen.getAllByRole('button');
      expect(buttons).toHaveLength(4);

      // Order: Mute, PTT, Settings, Leave
      expect(buttons[0]).toHaveAttribute('aria-label', expect.stringMatching(/Mute/));
      expect(buttons[1]).toHaveAttribute('aria-label', expect.stringMatching(/talk to AI/));
      expect(buttons[2]).toHaveAttribute('aria-label', 'Room settings');
      expect(buttons[3]).toHaveAttribute('aria-label', 'Leave room');
    });
  });

  describe('Disabled States', () => {
    it('should disable leave button when leaving', () => {
      renderControls({ isLeaving: true });

      expect(screen.getByLabelText('Leave room')).toBeDisabled();
    });

    it('should have opacity when disabled', () => {
      const { container } = renderControls({ isLeaving: true });

      const leaveButton = screen.getByLabelText('Leave room');
      expect(leaveButton).toHaveClass('opacity-50');
    });
  });
});
