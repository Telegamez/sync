/**
 * ParticipantAvatar Component Tests
 *
 * Tests for the ParticipantAvatar component which displays a participant
 * avatar with status indicators for speaking, muted, and connection state.
 *
 * Part of the Long-Horizon Engineering Protocol - FEAT-115
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ParticipantAvatar, type ParticipantAvatarProps } from '@/components/room/ParticipantAvatar';

// Helper to render with default props
function renderAvatar(props: Partial<ParticipantAvatarProps> = {}) {
  const defaultProps: ParticipantAvatarProps = {
    displayName: 'Test User',
    ...props,
  };
  return render(<ParticipantAvatar {...defaultProps} />);
}

describe('ParticipantAvatar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Initials Generation', () => {
    it('should display initials from two-word name', () => {
      renderAvatar({ displayName: 'Alice Johnson' });

      expect(screen.getByText('AJ')).toBeInTheDocument();
    });

    it('should display initials from multi-word name (first and last)', () => {
      renderAvatar({ displayName: 'John Michael Smith' });

      expect(screen.getByText('JS')).toBeInTheDocument();
    });

    it('should display first two letters for single word name', () => {
      renderAvatar({ displayName: 'Bob' });

      expect(screen.getByText('BO')).toBeInTheDocument();
    });

    it('should handle single character name', () => {
      renderAvatar({ displayName: 'X' });

      expect(screen.getByText('X')).toBeInTheDocument();
    });

    it('should uppercase initials', () => {
      renderAvatar({ displayName: 'alice johnson' });

      expect(screen.getByText('AJ')).toBeInTheDocument();
    });

    it('should handle names with extra whitespace', () => {
      renderAvatar({ displayName: '  Alice   Johnson  ' });

      expect(screen.getByText('AJ')).toBeInTheDocument();
    });
  });

  describe('Avatar Image', () => {
    it('should display image when avatarUrl provided', () => {
      renderAvatar({
        displayName: 'Alice',
        avatarUrl: 'https://example.com/alice.jpg',
      });

      const img = screen.getByAltText('Alice');
      expect(img).toBeInTheDocument();
      expect(img).toHaveAttribute('src', 'https://example.com/alice.jpg');
    });

    it('should not display initials when image is shown', () => {
      renderAvatar({
        displayName: 'Alice Johnson',
        avatarUrl: 'https://example.com/alice.jpg',
      });

      expect(screen.queryByText('AJ')).not.toBeInTheDocument();
    });

    it('should apply consistent color based on name', () => {
      const { container: container1 } = renderAvatar({ displayName: 'Alice' });
      const { container: container2 } = renderAvatar({ displayName: 'Alice' });

      // Same name should produce same background color class
      const avatar1 = container1.querySelector('[class*="bg-"]');
      const avatar2 = container2.querySelector('[class*="bg-"]');

      expect(avatar1?.className).toBe(avatar2?.className);
    });
  });

  describe('Size Variants', () => {
    it('should render xs size', () => {
      const { container } = renderAvatar({ size: 'xs' });

      const avatar = container.querySelector('.w-6');
      expect(avatar).toBeInTheDocument();
    });

    it('should render sm size', () => {
      const { container } = renderAvatar({ size: 'sm' });

      const avatar = container.querySelector('.w-8');
      expect(avatar).toBeInTheDocument();
    });

    it('should render md size (default)', () => {
      const { container } = renderAvatar({});

      const avatar = container.querySelector('.w-10');
      expect(avatar).toBeInTheDocument();
    });

    it('should render lg size', () => {
      const { container } = renderAvatar({ size: 'lg' });

      const avatar = container.querySelector('.w-12');
      expect(avatar).toBeInTheDocument();
    });

    it('should render xl size', () => {
      const { container } = renderAvatar({ size: 'xl' });

      const avatar = container.querySelector('.w-16');
      expect(avatar).toBeInTheDocument();
    });
  });

  describe('Speaking Indicator', () => {
    it('should apply speaking border when speaking', () => {
      const { container } = renderAvatar({ isSpeaking: true });

      const avatar = container.querySelector('.border-green-500');
      expect(avatar).toBeInTheDocument();
    });

    it('should apply default border when not speaking', () => {
      const { container } = renderAvatar({ isSpeaking: false });

      const avatar = container.querySelector('.border-gray-200');
      expect(avatar).toBeInTheDocument();
    });

    it('should apply ring animation style when speaking', () => {
      const { container } = renderAvatar({ isSpeaking: true, audioLevel: 0.5 });

      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper.style.boxShadow).toContain('rgba(34, 197, 94');
    });

    it('should not apply ring style when not speaking', () => {
      const { container } = renderAvatar({ isSpeaking: false, audioLevel: 0.5 });

      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper.style.boxShadow).toBe('');
    });

    it('should vary ring intensity based on audio level', () => {
      const { container: lowLevel } = renderAvatar({ isSpeaking: true, audioLevel: 0.1 });
      const { container: highLevel } = renderAvatar({ isSpeaking: true, audioLevel: 0.9 });

      const lowWrapper = lowLevel.firstChild as HTMLElement;
      const highWrapper = highLevel.firstChild as HTMLElement;

      // Higher audio level should have larger ring
      expect(lowWrapper.style.boxShadow).not.toBe(highWrapper.style.boxShadow);
    });
  });

  describe('Muted Indicator', () => {
    it('should show mute icon when muted', () => {
      renderAvatar({ isMuted: true });

      expect(screen.getByTitle('Muted')).toBeInTheDocument();
    });

    it('should not show mute icon when not muted', () => {
      renderAvatar({ isMuted: false });

      expect(screen.queryByTitle('Muted')).not.toBeInTheDocument();
    });

    it('should position mute icon at bottom-right', () => {
      const { container } = renderAvatar({ isMuted: true });

      const muteIndicator = container.querySelector('[title="Muted"]');
      expect(muteIndicator).toHaveClass('-bottom-0.5', '-right-0.5');
    });
  });

  describe('PTT/Addressing AI Indicator', () => {
    it('should show PTT icon when addressing AI', () => {
      renderAvatar({ isAddressingAI: true });

      expect(screen.getByTitle('Addressing AI')).toBeInTheDocument();
    });

    it('should not show PTT icon when not addressing AI', () => {
      renderAvatar({ isAddressingAI: false });

      expect(screen.queryByTitle('Addressing AI')).not.toBeInTheDocument();
    });

    it('should apply purple border when addressing AI', () => {
      const { container } = renderAvatar({ isAddressingAI: true });

      const avatar = container.querySelector('.border-purple-500');
      expect(avatar).toBeInTheDocument();
    });

    it('should not show PTT icon when muted (mute takes precedence)', () => {
      renderAvatar({ isAddressingAI: true, isMuted: true });

      expect(screen.queryByTitle('Addressing AI')).not.toBeInTheDocument();
      expect(screen.getByTitle('Muted')).toBeInTheDocument();
    });

    it('should position PTT icon at top-left', () => {
      const { container } = renderAvatar({ isAddressingAI: true });

      const pttIndicator = container.querySelector('[title="Addressing AI"]');
      expect(pttIndicator).toHaveClass('-top-0.5', '-left-0.5');
    });
  });

  describe('Connection Status Indicator', () => {
    it('should not show indicator when showConnectionStatus is false', () => {
      renderAvatar({
        connectionState: 'connecting',
        showConnectionStatus: false,
      });

      expect(screen.queryByTitle('Connecting...')).not.toBeInTheDocument();
    });

    it('should not show indicator for connected state', () => {
      renderAvatar({
        connectionState: 'connected',
        showConnectionStatus: true,
      });

      expect(screen.queryByTitle('Connected')).not.toBeInTheDocument();
    });

    it('should show connecting indicator', () => {
      renderAvatar({
        connectionState: 'connecting',
        showConnectionStatus: true,
      });

      expect(screen.getByTitle('Connecting...')).toBeInTheDocument();
    });

    it('should show reconnecting indicator', () => {
      renderAvatar({
        connectionState: 'reconnecting',
        showConnectionStatus: true,
      });

      expect(screen.getByTitle('Reconnecting...')).toBeInTheDocument();
    });

    it('should show disconnected indicator', () => {
      renderAvatar({
        connectionState: 'disconnected',
        showConnectionStatus: true,
      });

      expect(screen.getByTitle('Disconnected')).toBeInTheDocument();
    });

    it('should show failed indicator', () => {
      renderAvatar({
        connectionState: 'failed',
        showConnectionStatus: true,
      });

      expect(screen.getByTitle('Connection failed')).toBeInTheDocument();
    });

    it('should apply yellow color for connecting/reconnecting', () => {
      const { container } = renderAvatar({
        connectionState: 'connecting',
        showConnectionStatus: true,
      });

      const indicator = container.querySelector('.bg-yellow-500');
      expect(indicator).toBeInTheDocument();
    });

    it('should apply red color for disconnected/failed', () => {
      const { container } = renderAvatar({
        connectionState: 'failed',
        showConnectionStatus: true,
      });

      const indicator = container.querySelector('.bg-red-500');
      expect(indicator).toBeInTheDocument();
    });
  });

  describe('Active Speaker Highlight', () => {
    it('should apply active speaker ring', () => {
      const { container } = renderAvatar({ isActiveSpeaker: true });

      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper.style.boxShadow).toContain('rgba(34, 197, 94');
    });

    it('should apply green border for active speaker', () => {
      const { container } = renderAvatar({ isActiveSpeaker: true });

      const avatar = container.querySelector('.border-green-400');
      expect(avatar).toBeInTheDocument();
    });

    it('should prioritize speaking over active speaker', () => {
      const { container } = renderAvatar({
        isSpeaking: true,
        isActiveSpeaker: true,
        audioLevel: 0.5,
      });

      // Speaking has its own animation, should still have green-500 border
      const avatar = container.querySelector('.border-green-500');
      expect(avatar).toBeInTheDocument();
    });
  });

  describe('Local User Indicator', () => {
    it('should show local indicator when isLocal and not muted', () => {
      renderAvatar({ isLocal: true, isMuted: false });

      expect(screen.getByTitle('You')).toBeInTheDocument();
    });

    it('should not show local indicator when muted (mute takes precedence)', () => {
      renderAvatar({ isLocal: true, isMuted: true });

      expect(screen.queryByTitle('You')).not.toBeInTheDocument();
      expect(screen.getByTitle('Muted')).toBeInTheDocument();
    });

    it('should not show local indicator when addressing AI', () => {
      renderAvatar({ isLocal: true, isAddressingAI: true });

      expect(screen.queryByTitle('You')).not.toBeInTheDocument();
      expect(screen.getByTitle('Addressing AI')).toBeInTheDocument();
    });
  });

  describe('Click Handling', () => {
    it('should render as button when onClick provided', () => {
      const handleClick = vi.fn();
      renderAvatar({ onClick: handleClick });

      expect(screen.getByRole('button')).toBeInTheDocument();
    });

    it('should render as div when no onClick', () => {
      renderAvatar({});

      expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });

    it('should call onClick when clicked', async () => {
      const user = userEvent.setup();
      const handleClick = vi.fn();
      renderAvatar({ onClick: handleClick });

      await user.click(screen.getByRole('button'));

      expect(handleClick).toHaveBeenCalledOnce();
    });

    it('should have hover styles when clickable', () => {
      const { container } = renderAvatar({ onClick: () => {} });

      const button = container.querySelector('button');
      expect(button).toHaveClass('hover:opacity-90');
    });

    it('should have focus styles when clickable', () => {
      const { container } = renderAvatar({ onClick: () => {} });

      const button = container.querySelector('button');
      expect(button).toHaveClass('focus:ring-2');
    });
  });

  describe('Accessibility', () => {
    it('should have descriptive aria-label', () => {
      renderAvatar({ displayName: 'Alice Johnson' });

      expect(screen.getByLabelText('Alice Johnson')).toBeInTheDocument();
    });

    it('should include "(You)" in aria-label for local user', () => {
      renderAvatar({ displayName: 'Alice', isLocal: true });

      expect(screen.getByLabelText(/Alice, \(You\)/)).toBeInTheDocument();
    });

    it('should include "muted" in aria-label when muted', () => {
      renderAvatar({ displayName: 'Alice', isMuted: true });

      expect(screen.getByLabelText(/Alice, muted/)).toBeInTheDocument();
    });

    it('should include "speaking" in aria-label when speaking', () => {
      renderAvatar({ displayName: 'Alice', isSpeaking: true });

      expect(screen.getByLabelText(/Alice, speaking/)).toBeInTheDocument();
    });

    it('should include "addressing AI" in aria-label when PTT active', () => {
      renderAvatar({ displayName: 'Alice', isAddressingAI: true });

      expect(screen.getByLabelText(/Alice, addressing AI/)).toBeInTheDocument();
    });

    it('should include "active speaker" in aria-label when active', () => {
      renderAvatar({ displayName: 'Alice', isActiveSpeaker: true });

      expect(screen.getByLabelText(/Alice, active speaker/)).toBeInTheDocument();
    });

    it('should include connection state in aria-label when not connected', () => {
      renderAvatar({
        displayName: 'Alice',
        connectionState: 'reconnecting',
        showConnectionStatus: true,
      });

      expect(screen.getByLabelText(/Alice, reconnecting/)).toBeInTheDocument();
    });

    it('should not include connection state when connected', () => {
      renderAvatar({
        displayName: 'Alice',
        connectionState: 'connected',
        showConnectionStatus: true,
      });

      expect(screen.getByLabelText('Alice')).toBeInTheDocument();
    });

    it('should combine multiple states in aria-label', () => {
      renderAvatar({
        displayName: 'Alice',
        isLocal: true,
        isSpeaking: true,
        isActiveSpeaker: true,
      });

      const label = screen.getByLabelText(/Alice.*\(You\).*speaking.*active speaker/);
      expect(label).toBeInTheDocument();
    });
  });

  describe('Custom Styling', () => {
    it('should apply custom className', () => {
      const { container } = renderAvatar({ className: 'custom-class' });

      const wrapper = container.firstChild;
      expect(wrapper).toHaveClass('custom-class');
    });
  });

  describe('State Precedence', () => {
    it('should show speaking border over addressing AI border', () => {
      const { container } = renderAvatar({
        isSpeaking: true,
        isAddressingAI: true,
      });

      // Speaking takes precedence
      const avatar = container.querySelector('.border-green-500');
      expect(avatar).toBeInTheDocument();
    });

    it('should show speaking ring over PTT ring', () => {
      const { container } = renderAvatar({
        isSpeaking: true,
        isAddressingAI: true,
        audioLevel: 0.5,
      });

      const wrapper = container.firstChild as HTMLElement;
      // Green (speaking) ring, not purple (PTT)
      expect(wrapper.style.boxShadow).toContain('rgba(34, 197, 94');
      expect(wrapper.style.boxShadow).not.toContain('rgba(168, 85, 247');
    });

    it('should show PTT ring when not speaking but addressing AI', () => {
      const { container } = renderAvatar({
        isSpeaking: false,
        isAddressingAI: true,
      });

      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper.style.boxShadow).toContain('rgba(168, 85, 247');
    });
  });
});
