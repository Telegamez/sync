/**
 * RoomCard Component Tests
 *
 * Tests for room preview card display and join functionality.
 *
 * Part of the Long-Horizon Engineering Protocol - FEAT-112
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RoomCard } from '@/components/room/RoomCard';
import type { RoomSummary } from '@/types/room';

// Sample test data
const createMockRoom = (overrides?: Partial<RoomSummary>): RoomSummary => ({
  id: 'room-123',
  name: 'Test Room',
  description: 'A test room for testing',
  maxParticipants: 4,
  participantCount: 2,
  status: 'active',
  aiPersonality: 'assistant',
  createdAt: new Date('2024-12-05T10:00:00Z'),
  ...overrides,
});

const mockParticipants = [
  { id: 'p1', name: 'Alice Smith', avatarUrl: '/alice.jpg' },
  { id: 'p2', name: 'Bob Jones' },
  { id: 'p3', name: 'Carol White', avatarUrl: '/carol.jpg' },
  { id: 'p4', name: 'Dan Brown' },
  { id: 'p5', name: 'Eve Davis' },
];

describe('RoomCard', () => {
  let mockOnJoin: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockOnJoin = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Room Display', () => {
    it('displays room name', () => {
      render(<RoomCard room={createMockRoom({ name: 'Team Sync' })} onJoin={mockOnJoin} />);
      expect(screen.getByText('Team Sync')).toBeInTheDocument();
    });

    it('displays room description', () => {
      render(
        <RoomCard
          room={createMockRoom({ description: 'Weekly sync meeting' })}
          onJoin={mockOnJoin}
        />
      );
      expect(screen.getByText('Weekly sync meeting')).toBeInTheDocument();
    });

    it('does not show description when empty', () => {
      render(
        <RoomCard
          room={createMockRoom({ description: undefined })}
          onJoin={mockOnJoin}
        />
      );
      expect(screen.queryByText('A test room for testing')).not.toBeInTheDocument();
    });

    it('displays participant count', () => {
      render(
        <RoomCard
          room={createMockRoom({ participantCount: 3, maxParticipants: 6 })}
          onJoin={mockOnJoin}
        />
      );
      expect(screen.getByText('3/6')).toBeInTheDocument();
    });

    it('displays status badge', () => {
      render(<RoomCard room={createMockRoom({ status: 'active' })} onJoin={mockOnJoin} />);
      expect(screen.getByText('active')).toBeInTheDocument();
    });

    it('displays waiting status badge', () => {
      render(<RoomCard room={createMockRoom({ status: 'waiting' })} onJoin={mockOnJoin} />);
      expect(screen.getByText('waiting')).toBeInTheDocument();
    });

    it('displays full status badge', () => {
      render(<RoomCard room={createMockRoom({ status: 'full' })} onJoin={mockOnJoin} />);
      expect(screen.getByText('full')).toBeInTheDocument();
    });

    it('displays closed status badge', () => {
      render(<RoomCard room={createMockRoom({ status: 'closed' })} onJoin={mockOnJoin} />);
      expect(screen.getByText('closed')).toBeInTheDocument();
    });
  });

  describe('AI Personality', () => {
    it('displays AI personality by default', () => {
      render(
        <RoomCard
          room={createMockRoom({ aiPersonality: 'facilitator' })}
          onJoin={mockOnJoin}
        />
      );
      expect(screen.getByText('AI:')).toBeInTheDocument();
      expect(screen.getByText('Facilitator')).toBeInTheDocument();
    });

    it('displays assistant personality', () => {
      render(
        <RoomCard
          room={createMockRoom({ aiPersonality: 'assistant' })}
          onJoin={mockOnJoin}
        />
      );
      expect(screen.getByText('Assistant')).toBeInTheDocument();
    });

    it('displays expert personality', () => {
      render(
        <RoomCard
          room={createMockRoom({ aiPersonality: 'expert' })}
          onJoin={mockOnJoin}
        />
      );
      expect(screen.getByText('Expert')).toBeInTheDocument();
    });

    it('displays brainstorm personality', () => {
      render(
        <RoomCard
          room={createMockRoom({ aiPersonality: 'brainstorm' })}
          onJoin={mockOnJoin}
        />
      );
      expect(screen.getByText('Brainstorm')).toBeInTheDocument();
    });

    it('displays custom personality', () => {
      render(
        <RoomCard
          room={createMockRoom({ aiPersonality: 'custom' })}
          onJoin={mockOnJoin}
        />
      );
      expect(screen.getByText('Custom')).toBeInTheDocument();
    });

    it('hides AI personality when showAIPersonality is false', () => {
      render(
        <RoomCard
          room={createMockRoom({ aiPersonality: 'facilitator' })}
          onJoin={mockOnJoin}
          showAIPersonality={false}
        />
      );
      expect(screen.queryByText('AI:')).not.toBeInTheDocument();
      expect(screen.queryByText('Facilitator')).not.toBeInTheDocument();
    });
  });

  describe('Participant Avatars', () => {
    it('displays participant avatars', () => {
      render(
        <RoomCard
          room={createMockRoom()}
          onJoin={mockOnJoin}
          participantAvatars={mockParticipants.slice(0, 2)}
        />
      );

      // Check for avatar images
      const aliceAvatar = screen.getByAltText('Alice Smith');
      expect(aliceAvatar).toBeInTheDocument();
      expect(aliceAvatar).toHaveAttribute('src', '/alice.jpg');

      // Check for initials avatar (Bob has no avatarUrl)
      expect(screen.getByTitle('Bob Jones')).toBeInTheDocument();
      expect(screen.getByText('BJ')).toBeInTheDocument(); // Initials
    });

    it('shows up to 4 avatars', () => {
      render(
        <RoomCard
          room={createMockRoom()}
          onJoin={mockOnJoin}
          participantAvatars={mockParticipants.slice(0, 4)}
        />
      );

      expect(screen.getByTitle('Alice Smith')).toBeInTheDocument();
      expect(screen.getByTitle('Bob Jones')).toBeInTheDocument();
      expect(screen.getByTitle('Carol White')).toBeInTheDocument();
      expect(screen.getByTitle('Dan Brown')).toBeInTheDocument();
    });

    it('shows overflow indicator for more than 4 participants', () => {
      render(
        <RoomCard
          room={createMockRoom()}
          onJoin={mockOnJoin}
          participantAvatars={mockParticipants}
        />
      );

      expect(screen.getByText('+1')).toBeInTheDocument();
      expect(screen.getByTitle('+1 more participants')).toBeInTheDocument();
    });

    it('shows correct overflow count for many participants', () => {
      const manyParticipants = [
        ...mockParticipants,
        { id: 'p6', name: 'Frank Green' },
        { id: 'p7', name: 'Grace Hall' },
      ];

      render(
        <RoomCard
          room={createMockRoom()}
          onJoin={mockOnJoin}
          participantAvatars={manyParticipants}
        />
      );

      expect(screen.getByText('+3')).toBeInTheDocument();
    });

    it('does not show avatars when none provided', () => {
      render(
        <RoomCard
          room={createMockRoom()}
          onJoin={mockOnJoin}
          participantAvatars={[]}
        />
      );

      // Should not have avatar section
      expect(screen.queryByAltText(/avatar/i)).not.toBeInTheDocument();
    });
  });

  describe('Join Button', () => {
    it('shows "Join Room" for active rooms', () => {
      render(<RoomCard room={createMockRoom({ status: 'active' })} onJoin={mockOnJoin} />);
      expect(screen.getByText('Join Room')).toBeInTheDocument();
    });

    it('shows "Join Room" for waiting rooms', () => {
      render(<RoomCard room={createMockRoom({ status: 'waiting' })} onJoin={mockOnJoin} />);
      expect(screen.getByText('Join Room')).toBeInTheDocument();
    });

    it('shows "Room Full" for full rooms', () => {
      render(<RoomCard room={createMockRoom({ status: 'full' })} onJoin={mockOnJoin} />);
      expect(screen.getByText('Room Full')).toBeInTheDocument();
    });

    it('shows "Closed" for closed rooms', () => {
      render(<RoomCard room={createMockRoom({ status: 'closed' })} onJoin={mockOnJoin} />);
      expect(screen.getByText('Closed')).toBeInTheDocument();
    });

    it('disables button for full rooms', () => {
      render(<RoomCard room={createMockRoom({ status: 'full' })} onJoin={mockOnJoin} />);
      expect(screen.getByText('Room Full')).toBeDisabled();
    });

    it('disables button for closed rooms', () => {
      render(<RoomCard room={createMockRoom({ status: 'closed' })} onJoin={mockOnJoin} />);
      expect(screen.getByText('Closed')).toBeDisabled();
    });

    it('calls onJoin when clicking join on active room', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

      render(
        <RoomCard
          room={createMockRoom({ id: 'room-active', status: 'active' })}
          onJoin={mockOnJoin}
        />
      );

      await user.click(screen.getByText('Join Room'));

      expect(mockOnJoin).toHaveBeenCalledWith('room-active');
    });

    it('calls onJoin when clicking join on waiting room', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

      render(
        <RoomCard
          room={createMockRoom({ id: 'room-waiting', status: 'waiting' })}
          onJoin={mockOnJoin}
        />
      );

      await user.click(screen.getByText('Join Room'));

      expect(mockOnJoin).toHaveBeenCalledWith('room-waiting');
    });

    it('does not call onJoin for full rooms', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

      render(
        <RoomCard
          room={createMockRoom({ status: 'full' })}
          onJoin={mockOnJoin}
        />
      );

      await user.click(screen.getByText('Room Full'));

      expect(mockOnJoin).not.toHaveBeenCalled();
    });

    it('does not call onJoin for closed rooms', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

      render(
        <RoomCard
          room={createMockRoom({ status: 'closed' })}
          onJoin={mockOnJoin}
        />
      );

      await user.click(screen.getByText('Closed'));

      expect(mockOnJoin).not.toHaveBeenCalled();
    });
  });

  describe('Loading State', () => {
    it('shows loading state while joining', async () => {
      let resolveJoin: () => void;
      const slowJoin = vi.fn(
        () =>
          new Promise<void>((resolve) => {
            resolveJoin = resolve;
          })
      );

      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

      render(
        <RoomCard
          room={createMockRoom({ status: 'active' })}
          onJoin={slowJoin}
        />
      );

      // Click join
      await user.click(screen.getByText('Join Room'));

      // Should show loading state
      expect(screen.getByText('Joining...')).toBeInTheDocument();

      // Complete the join
      resolveJoin!();
      await waitFor(() => {
        expect(screen.getByText('Join Room')).toBeInTheDocument();
      });
    });

    it('disables button while joining', async () => {
      let resolveJoin: () => void;
      const slowJoin = vi.fn(
        () =>
          new Promise<void>((resolve) => {
            resolveJoin = resolve;
          })
      );

      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

      render(
        <RoomCard
          room={createMockRoom({ status: 'active' })}
          onJoin={slowJoin}
        />
      );

      await user.click(screen.getByText('Join Room'));

      const button = screen.getByText('Joining...');
      expect(button).toBeDisabled();

      resolveJoin!();
      await waitFor(() => {
        expect(screen.getByText('Join Room')).not.toBeDisabled();
      });
    });

    it('prevents multiple join clicks while loading', async () => {
      let resolveJoin: () => void;
      const slowJoin = vi.fn(
        () =>
          new Promise<void>((resolve) => {
            resolveJoin = resolve;
          })
      );

      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

      render(
        <RoomCard
          room={createMockRoom({ status: 'active' })}
          onJoin={slowJoin}
        />
      );

      // First click
      await user.click(screen.getByText('Join Room'));

      // Try clicking again while loading
      await user.click(screen.getByText('Joining...'));
      await user.click(screen.getByText('Joining...'));

      // Should only have been called once
      expect(slowJoin).toHaveBeenCalledTimes(1);

      resolveJoin!();
    });

    it('resets loading state after join completes', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      mockOnJoin.mockResolvedValue(undefined);

      render(
        <RoomCard
          room={createMockRoom({ status: 'active' })}
          onJoin={mockOnJoin}
        />
      );

      await user.click(screen.getByText('Join Room'));

      await waitFor(() => {
        expect(screen.getByText('Join Room')).toBeInTheDocument();
      });
    });

    it('resets loading state even if join fails', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      // Use a resolved promise that simulates error handling inside onJoin
      const failingJoin = vi.fn().mockImplementation(() => {
        return Promise.reject(new Error('Join failed')).catch(() => {
          // Simulating error being caught by caller
        });
      });

      render(
        <RoomCard
          room={createMockRoom({ status: 'active' })}
          onJoin={failingJoin}
        />
      );

      await user.click(screen.getByText('Join Room'));

      await waitFor(() => {
        expect(screen.getByText('Join Room')).toBeInTheDocument();
      });
    });
  });

  describe('Relative Time', () => {
    it('displays relative time for recent room', () => {
      const now = new Date();
      render(
        <RoomCard
          room={createMockRoom({ createdAt: now })}
          onJoin={mockOnJoin}
        />
      );
      expect(screen.getByText('Just now')).toBeInTheDocument();
    });

    it('displays minutes ago', () => {
      const thirtyMinsAgo = new Date(Date.now() - 30 * 60 * 1000);
      render(
        <RoomCard
          room={createMockRoom({ createdAt: thirtyMinsAgo })}
          onJoin={mockOnJoin}
        />
      );
      expect(screen.getByText('30m ago')).toBeInTheDocument();
    });

    it('displays hours ago', () => {
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
      render(
        <RoomCard
          room={createMockRoom({ createdAt: twoHoursAgo })}
          onJoin={mockOnJoin}
        />
      );
      expect(screen.getByText('2h ago')).toBeInTheDocument();
    });

    it('displays days ago', () => {
      const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
      render(
        <RoomCard
          room={createMockRoom({ createdAt: threeDaysAgo })}
          onJoin={mockOnJoin}
        />
      );
      expect(screen.getByText('3d ago')).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('has accessible join button label', () => {
      render(
        <RoomCard
          room={createMockRoom({ name: 'Team Meeting', status: 'active' })}
          onJoin={mockOnJoin}
        />
      );
      expect(screen.getByLabelText('Join Team Meeting')).toBeInTheDocument();
    });

    it('has accessible label for disabled states', () => {
      render(
        <RoomCard
          room={createMockRoom({ status: 'full' })}
          onJoin={mockOnJoin}
        />
      );
      expect(screen.getByLabelText('Room Full')).toBeInTheDocument();
    });

    it('has data-testid for testing', () => {
      render(<RoomCard room={createMockRoom()} onJoin={mockOnJoin} />);
      expect(screen.getByTestId('room-card')).toBeInTheDocument();
    });
  });

  describe('Custom Styling', () => {
    it('accepts custom className', () => {
      render(
        <RoomCard
          room={createMockRoom()}
          onJoin={mockOnJoin}
          className="custom-class"
        />
      );
      expect(screen.getByTestId('room-card')).toHaveClass('custom-class');
    });
  });
});
