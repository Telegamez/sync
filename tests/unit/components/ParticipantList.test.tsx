/**
 * ParticipantList Component Tests
 *
 * Tests for the ParticipantList component which displays room participants
 * with real-time speaking/muted indicators.
 *
 * Part of the Long-Horizon Engineering Protocol - FEAT-114
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ParticipantList, type ParticipantInfo } from '@/components/room/ParticipantList';

// Helper to create mock participants
function createMockParticipant(overrides: Partial<ParticipantInfo> = {}): ParticipantInfo {
  return {
    id: `peer-${Math.random().toString(36).slice(2, 8)}`,
    displayName: 'Test User',
    role: 'participant',
    isMuted: false,
    isSpeaking: false,
    connectionState: 'connected',
    ...overrides,
  };
}

describe('ParticipantList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Empty State', () => {
    it('should show empty message when no participants', () => {
      render(<ParticipantList participants={[]} />);

      expect(screen.getByText('No participants in this room')).toBeInTheDocument();
    });

    it('should have status role for empty message', () => {
      render(<ParticipantList participants={[]} />);

      expect(screen.getByRole('status')).toBeInTheDocument();
    });
  });

  describe('Participant Display', () => {
    it('should display participant names', () => {
      const participants = [
        createMockParticipant({ id: 'peer-1', displayName: 'Alice' }),
        createMockParticipant({ id: 'peer-2', displayName: 'Bob' }),
      ];

      render(<ParticipantList participants={participants} />);

      expect(screen.getByText('Alice')).toBeInTheDocument();
      expect(screen.getByText('Bob')).toBeInTheDocument();
    });

    it('should display initials when no avatar URL', () => {
      const participants = [
        createMockParticipant({ displayName: 'Alice Johnson' }),
      ];

      render(<ParticipantList participants={participants} />);

      expect(screen.getByText('AJ')).toBeInTheDocument();
    });

    it('should display first two letters for single word name', () => {
      const participants = [
        createMockParticipant({ displayName: 'Bob' }),
      ];

      render(<ParticipantList participants={participants} />);

      expect(screen.getByText('BO')).toBeInTheDocument();
    });

    it('should display avatar image when URL provided', () => {
      const participants = [
        createMockParticipant({
          displayName: 'Alice',
          avatarUrl: 'https://example.com/alice.jpg',
        }),
      ];

      render(<ParticipantList participants={participants} />);

      const img = screen.getByAltText('Alice');
      expect(img).toBeInTheDocument();
      expect(img).toHaveAttribute('src', 'https://example.com/alice.jpg');
    });

    it('should mark local user with "(You)" label', () => {
      const participants = [
        createMockParticipant({ id: 'peer-1', displayName: 'Alice', isLocal: true }),
        createMockParticipant({ id: 'peer-2', displayName: 'Bob' }),
      ];

      render(<ParticipantList participants={participants} localPeerId="peer-1" />);

      expect(screen.getByText('(You)')).toBeInTheDocument();
    });

    it('should identify local user by localPeerId prop', () => {
      const participants = [
        createMockParticipant({ id: 'peer-1', displayName: 'Alice' }),
        createMockParticipant({ id: 'peer-2', displayName: 'Bob' }),
      ];

      render(<ParticipantList participants={participants} localPeerId="peer-1" />);

      expect(screen.getByText('(You)')).toBeInTheDocument();
    });
  });

  describe('Muted Indicator', () => {
    it('should show mute indicator when participant is muted', () => {
      const participants = [
        createMockParticipant({ displayName: 'Alice', isMuted: true }),
      ];

      render(<ParticipantList participants={participants} />);

      expect(screen.getByTitle('Muted')).toBeInTheDocument();
    });

    it('should not show mute indicator when participant is unmuted', () => {
      const participants = [
        createMockParticipant({ displayName: 'Alice', isMuted: false }),
      ];

      render(<ParticipantList participants={participants} />);

      expect(screen.queryByTitle('Muted')).not.toBeInTheDocument();
    });
  });

  describe('Speaking Indicator', () => {
    it('should show speaking indicator in vertical layout', () => {
      const participants = [
        createMockParticipant({ displayName: 'Alice', isSpeaking: true }),
      ];

      render(<ParticipantList participants={participants} layout="vertical" />);

      expect(screen.getByText('Speaking')).toBeInTheDocument();
    });

    it('should apply speaking border style when speaking', () => {
      const participants = [
        createMockParticipant({ displayName: 'Alice', isSpeaking: true }),
      ];

      render(<ParticipantList participants={participants} />);

      const avatar = screen.getByText('AL');
      expect(avatar).toHaveClass('border-green-500');
    });

    it('should not show speaking text when not speaking', () => {
      const participants = [
        createMockParticipant({ displayName: 'Alice', isSpeaking: false }),
      ];

      render(<ParticipantList participants={participants} layout="vertical" />);

      expect(screen.queryByText('Speaking')).not.toBeInTheDocument();
    });
  });

  describe('Active Speaker Highlight', () => {
    it('should highlight active speaker', () => {
      const participants = [
        createMockParticipant({ id: 'peer-1', displayName: 'Alice' }),
        createMockParticipant({ id: 'peer-2', displayName: 'Bob' }),
      ];

      render(
        <ParticipantList
          participants={participants}
          activeSpeakerId="peer-1"
        />
      );

      const buttons = screen.getAllByRole('button');
      const aliceButton = buttons.find(btn => btn.textContent?.includes('Alice'));
      expect(aliceButton).toHaveClass('ring-green-500');
    });

    it('should include active speaker in aria-label', () => {
      const participants = [
        createMockParticipant({ id: 'peer-1', displayName: 'Alice', isSpeaking: true }),
      ];

      render(
        <ParticipantList
          participants={participants}
          activeSpeakerId="peer-1"
        />
      );

      expect(screen.getByLabelText(/Alice.*active speaker/)).toBeInTheDocument();
    });
  });

  describe('PTT (Addressing AI) Indicator', () => {
    it('should show PTT indicator when addressing AI', () => {
      const participants = [
        createMockParticipant({ displayName: 'Alice', isAddressingAI: true }),
      ];

      render(<ParticipantList participants={participants} />);

      expect(screen.getByTitle('Addressing AI')).toBeInTheDocument();
    });

    it('should not show PTT indicator when not addressing AI', () => {
      const participants = [
        createMockParticipant({ displayName: 'Alice', isAddressingAI: false }),
      ];

      render(<ParticipantList participants={participants} />);

      expect(screen.queryByTitle('Addressing AI')).not.toBeInTheDocument();
    });
  });

  describe('Role Badges', () => {
    it('should show Host badge for owner role', () => {
      const participants = [
        createMockParticipant({ displayName: 'Alice', role: 'owner' }),
      ];

      render(<ParticipantList participants={participants} showRoleBadge />);

      expect(screen.getByText('Host')).toBeInTheDocument();
    });

    it('should show Mod badge for moderator role', () => {
      const participants = [
        createMockParticipant({ displayName: 'Alice', role: 'moderator' }),
      ];

      render(<ParticipantList participants={participants} showRoleBadge />);

      expect(screen.getByText('Mod')).toBeInTheDocument();
    });

    it('should not show badge for regular participant', () => {
      const participants = [
        createMockParticipant({ displayName: 'Alice', role: 'participant' }),
      ];

      render(<ParticipantList participants={participants} showRoleBadge />);

      expect(screen.queryByText('Host')).not.toBeInTheDocument();
      expect(screen.queryByText('Mod')).not.toBeInTheDocument();
    });

    it('should hide role badges when showRoleBadge is false', () => {
      const participants = [
        createMockParticipant({ displayName: 'Alice', role: 'owner' }),
      ];

      render(<ParticipantList participants={participants} showRoleBadge={false} />);

      expect(screen.queryByText('Host')).not.toBeInTheDocument();
    });
  });

  describe('Connection Status', () => {
    it('should show connection indicator for non-connected states', () => {
      const participants = [
        createMockParticipant({ displayName: 'Alice', connectionState: 'connecting' }),
      ];

      render(
        <ParticipantList
          participants={participants}
          showConnectionStatus
        />
      );

      expect(screen.getByTitle('Connecting...')).toBeInTheDocument();
    });

    it('should not show indicator for connected state', () => {
      const participants = [
        createMockParticipant({ displayName: 'Alice', connectionState: 'connected' }),
      ];

      render(
        <ParticipantList
          participants={participants}
          showConnectionStatus
        />
      );

      expect(screen.queryByTitle('Connected')).not.toBeInTheDocument();
    });

    it('should show reconnecting indicator', () => {
      const participants = [
        createMockParticipant({ displayName: 'Alice', connectionState: 'reconnecting' }),
      ];

      render(
        <ParticipantList
          participants={participants}
          showConnectionStatus
        />
      );

      expect(screen.getByTitle('Reconnecting...')).toBeInTheDocument();
    });

    it('should show failed indicator', () => {
      const participants = [
        createMockParticipant({ displayName: 'Alice', connectionState: 'failed' }),
      ];

      render(
        <ParticipantList
          participants={participants}
          showConnectionStatus
        />
      );

      expect(screen.getByTitle('Connection failed')).toBeInTheDocument();
    });
  });

  describe('Layout Modes', () => {
    it('should render vertical layout by default', () => {
      const participants = [
        createMockParticipant({ id: 'peer-1', displayName: 'Alice' }),
        createMockParticipant({ id: 'peer-2', displayName: 'Bob' }),
      ];

      render(<ParticipantList participants={participants} />);

      const container = screen.getByRole('list');
      expect(container).toHaveClass('flex-col');
    });

    it('should render horizontal layout', () => {
      const participants = [
        createMockParticipant({ id: 'peer-1', displayName: 'Alice' }),
        createMockParticipant({ id: 'peer-2', displayName: 'Bob' }),
      ];

      render(<ParticipantList participants={participants} layout="horizontal" />);

      const container = screen.getByRole('list');
      expect(container).toHaveClass('flex-row');
    });

    it('should render grid layout', () => {
      const participants = [
        createMockParticipant({ id: 'peer-1', displayName: 'Alice' }),
        createMockParticipant({ id: 'peer-2', displayName: 'Bob' }),
      ];

      render(<ParticipantList participants={participants} layout="grid" />);

      const container = screen.getByRole('list');
      expect(container).toHaveClass('grid');
    });
  });

  describe('Max Visible and Overflow', () => {
    it('should limit visible participants when maxVisible is set', () => {
      const participants = [
        createMockParticipant({ id: 'peer-1', displayName: 'Alice' }),
        createMockParticipant({ id: 'peer-2', displayName: 'Bob' }),
        createMockParticipant({ id: 'peer-3', displayName: 'Charlie' }),
        createMockParticipant({ id: 'peer-4', displayName: 'Diana' }),
      ];

      render(<ParticipantList participants={participants} maxVisible={2} />);

      expect(screen.getByText('Alice')).toBeInTheDocument();
      expect(screen.getByText('Bob')).toBeInTheDocument();
      expect(screen.queryByText('Charlie')).not.toBeInTheDocument();
      expect(screen.queryByText('Diana')).not.toBeInTheDocument();
    });

    it('should show overflow indicator with count', () => {
      const participants = [
        createMockParticipant({ id: 'peer-1', displayName: 'Alice' }),
        createMockParticipant({ id: 'peer-2', displayName: 'Bob' }),
        createMockParticipant({ id: 'peer-3', displayName: 'Charlie' }),
        createMockParticipant({ id: 'peer-4', displayName: 'Diana' }),
      ];

      render(<ParticipantList participants={participants} maxVisible={2} />);

      expect(screen.getByText('+2')).toBeInTheDocument();
      expect(screen.getByText('2 more participants')).toBeInTheDocument();
    });

    it('should show singular "participant" for 1 overflow', () => {
      const participants = [
        createMockParticipant({ id: 'peer-1', displayName: 'Alice' }),
        createMockParticipant({ id: 'peer-2', displayName: 'Bob' }),
        createMockParticipant({ id: 'peer-3', displayName: 'Charlie' }),
      ];

      render(<ParticipantList participants={participants} maxVisible={2} />);

      expect(screen.getByText('+1')).toBeInTheDocument();
      expect(screen.getByText('1 more participant')).toBeInTheDocument();
    });

    it('should not show overflow when all participants visible', () => {
      const participants = [
        createMockParticipant({ id: 'peer-1', displayName: 'Alice' }),
        createMockParticipant({ id: 'peer-2', displayName: 'Bob' }),
      ];

      render(<ParticipantList participants={participants} maxVisible={5} />);

      expect(screen.queryByText(/more/)).not.toBeInTheDocument();
    });
  });

  describe('Sorting', () => {
    it('should sort local user first', () => {
      const participants = [
        createMockParticipant({ id: 'peer-2', displayName: 'Bob', role: 'participant' }),
        createMockParticipant({ id: 'peer-1', displayName: 'Alice', role: 'participant' }),
      ];

      render(<ParticipantList participants={participants} localPeerId="peer-2" />);

      const buttons = screen.getAllByRole('button');
      expect(buttons[0]).toHaveTextContent('Bob');
      expect(buttons[1]).toHaveTextContent('Alice');
    });

    it('should sort isLocal marked participants first', () => {
      const participants = [
        createMockParticipant({ id: 'peer-2', displayName: 'Bob', role: 'participant' }),
        createMockParticipant({ id: 'peer-1', displayName: 'Alice', role: 'participant', isLocal: true }),
      ];

      render(<ParticipantList participants={participants} />);

      const buttons = screen.getAllByRole('button');
      expect(buttons[0]).toHaveTextContent('Alice');
      expect(buttons[1]).toHaveTextContent('Bob');
    });

    it('should sort by role (owner > moderator > participant)', () => {
      const participants = [
        createMockParticipant({ id: 'peer-3', displayName: 'Charlie', role: 'participant' }),
        createMockParticipant({ id: 'peer-1', displayName: 'Alice', role: 'owner' }),
        createMockParticipant({ id: 'peer-2', displayName: 'Bob', role: 'moderator' }),
      ];

      render(<ParticipantList participants={participants} />);

      const buttons = screen.getAllByRole('button');
      expect(buttons[0]).toHaveTextContent('Alice'); // owner
      expect(buttons[1]).toHaveTextContent('Bob'); // moderator
      expect(buttons[2]).toHaveTextContent('Charlie'); // participant
    });

    it('should sort alphabetically within same role', () => {
      const participants = [
        createMockParticipant({ id: 'peer-3', displayName: 'Charlie', role: 'participant' }),
        createMockParticipant({ id: 'peer-1', displayName: 'Alice', role: 'participant' }),
        createMockParticipant({ id: 'peer-2', displayName: 'Bob', role: 'participant' }),
      ];

      render(<ParticipantList participants={participants} />);

      const buttons = screen.getAllByRole('button');
      expect(buttons[0]).toHaveTextContent('Alice');
      expect(buttons[1]).toHaveTextContent('Bob');
      expect(buttons[2]).toHaveTextContent('Charlie');
    });
  });

  describe('Click Handling', () => {
    it('should call onParticipantClick when clicked', async () => {
      const user = userEvent.setup();
      const handleClick = vi.fn();
      const participants = [
        createMockParticipant({ id: 'peer-1', displayName: 'Alice' }),
      ];

      render(
        <ParticipantList
          participants={participants}
          onParticipantClick={handleClick}
        />
      );

      await user.click(screen.getByRole('button'));

      expect(handleClick).toHaveBeenCalledWith('peer-1');
    });

    it('should not be clickable when no handler provided', () => {
      const participants = [
        createMockParticipant({ id: 'peer-1', displayName: 'Alice' }),
      ];

      render(<ParticipantList participants={participants} />);

      const button = screen.getByRole('button');
      expect(button).toBeDisabled();
    });

    it('should be clickable when handler is provided', () => {
      const handleClick = vi.fn();
      const participants = [
        createMockParticipant({ id: 'peer-1', displayName: 'Alice' }),
      ];

      render(
        <ParticipantList
          participants={participants}
          onParticipantClick={handleClick}
        />
      );

      const button = screen.getByRole('button');
      expect(button).not.toBeDisabled();
    });
  });

  describe('Accessibility', () => {
    it('should have list role', () => {
      const participants = [
        createMockParticipant({ displayName: 'Alice' }),
      ];

      render(<ParticipantList participants={participants} />);

      expect(screen.getByRole('list')).toBeInTheDocument();
    });

    it('should have descriptive aria-label on list', () => {
      const participants = [
        createMockParticipant({ displayName: 'Alice' }),
      ];

      render(<ParticipantList participants={participants} />);

      expect(screen.getByLabelText('Room participants')).toBeInTheDocument();
    });

    it('should have accessible labels on participant buttons', () => {
      const participants = [
        createMockParticipant({
          displayName: 'Alice',
          isMuted: true,
          isSpeaking: false,
        }),
      ];

      render(<ParticipantList participants={participants} />);

      expect(screen.getByLabelText(/Alice.*muted/)).toBeInTheDocument();
    });

    it('should indicate speaking state in aria-label', () => {
      const participants = [
        createMockParticipant({
          displayName: 'Alice',
          isSpeaking: true,
        }),
      ];

      render(<ParticipantList participants={participants} />);

      expect(screen.getByLabelText(/Alice.*speaking/)).toBeInTheDocument();
    });

    it('should indicate local user in aria-label', () => {
      const participants = [
        createMockParticipant({
          id: 'peer-1',
          displayName: 'Alice',
        }),
      ];

      render(<ParticipantList participants={participants} localPeerId="peer-1" />);

      expect(screen.getByLabelText(/Alice \(You\)/)).toBeInTheDocument();
    });

    it('should have accessible overflow indicator', () => {
      const participants = [
        createMockParticipant({ id: 'peer-1', displayName: 'Alice' }),
        createMockParticipant({ id: 'peer-2', displayName: 'Bob' }),
        createMockParticipant({ id: 'peer-3', displayName: 'Charlie' }),
      ];

      render(<ParticipantList participants={participants} maxVisible={2} />);

      expect(screen.getByLabelText('1 more participants')).toBeInTheDocument();
    });
  });

  describe('Custom Styling', () => {
    it('should apply custom className', () => {
      const participants = [
        createMockParticipant({ displayName: 'Alice' }),
      ];

      render(
        <ParticipantList
          participants={participants}
          className="custom-class"
        />
      );

      expect(screen.getByRole('list')).toHaveClass('custom-class');
    });
  });

  describe('Audio Level Visualization', () => {
    it('should render audio level bars in horizontal layout when speaking', () => {
      const participants = [
        createMockParticipant({
          displayName: 'Alice',
          isSpeaking: true,
          audioLevel: 0.5,
        }),
      ];

      render(<ParticipantList participants={participants} layout="horizontal" />);

      // Check for wave animation container (3 bars)
      const button = screen.getByRole('button');
      const bars = button.querySelectorAll('.animate-pulse');
      expect(bars.length).toBe(3);
    });

    it('should not render audio level bars when not speaking', () => {
      const participants = [
        createMockParticipant({
          displayName: 'Alice',
          isSpeaking: false,
          audioLevel: 0.5,
        }),
      ];

      render(<ParticipantList participants={participants} layout="horizontal" />);

      const button = screen.getByRole('button');
      const bars = button.querySelectorAll('.animate-pulse');
      expect(bars.length).toBe(0);
    });
  });
});
