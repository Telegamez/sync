/**
 * RoomLobby Component Tests
 *
 * Tests for room list display, search, filter, and join functionality.
 *
 * Part of the Long-Horizon Engineering Protocol - FEAT-111
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RoomLobby } from '@/components/room/RoomLobby';
import type { RoomSummary, RoomStatus } from '@/types/room';

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

const mockRooms: RoomSummary[] = [
  createMockRoom({ id: 'room-1', name: 'Planning Session', status: 'active', participantCount: 2 }),
  createMockRoom({ id: 'room-2', name: 'Brainstorm', status: 'waiting', participantCount: 0 }),
  createMockRoom({ id: 'room-3', name: 'Full Meeting', status: 'full', participantCount: 4 }),
  createMockRoom({ id: 'room-4', name: 'Closed Room', status: 'closed', participantCount: 0 }),
];

describe('RoomLobby', () => {
  let mockFetchRooms: ReturnType<typeof vi.fn>;
  let mockOnJoinRoom: ReturnType<typeof vi.fn>;
  let mockOnCreateRoom: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });

    mockFetchRooms = vi.fn().mockResolvedValue({ rooms: mockRooms, total: mockRooms.length });
    mockOnJoinRoom = vi.fn();
    mockOnCreateRoom = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Initial Render', () => {
    it('shows loading state initially', () => {
      render(
        <RoomLobby
          onJoinRoom={mockOnJoinRoom}
          onCreateRoom={mockOnCreateRoom}
          fetchRooms={mockFetchRooms}
        />
      );

      expect(screen.getByText('Loading rooms...')).toBeInTheDocument();
    });

    it('fetches rooms on mount', async () => {
      render(
        <RoomLobby
          onJoinRoom={mockOnJoinRoom}
          onCreateRoom={mockOnCreateRoom}
          fetchRooms={mockFetchRooms}
        />
      );

      await waitFor(() => {
        expect(mockFetchRooms).toHaveBeenCalledTimes(1);
      });
    });

    it('displays rooms after loading', async () => {
      render(
        <RoomLobby
          onJoinRoom={mockOnJoinRoom}
          onCreateRoom={mockOnCreateRoom}
          fetchRooms={mockFetchRooms}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Planning Session')).toBeInTheDocument();
        expect(screen.getByText('Brainstorm')).toBeInTheDocument();
        expect(screen.getByText('Full Meeting')).toBeInTheDocument();
      });
    });

    it('renders search input', async () => {
      render(
        <RoomLobby
          onJoinRoom={mockOnJoinRoom}
          onCreateRoom={mockOnCreateRoom}
          fetchRooms={mockFetchRooms}
        />
      );

      await waitFor(() => {
        expect(screen.getByLabelText('Search rooms')).toBeInTheDocument();
      });
    });

    it('renders status filter dropdown', async () => {
      render(
        <RoomLobby
          onJoinRoom={mockOnJoinRoom}
          onCreateRoom={mockOnCreateRoom}
          fetchRooms={mockFetchRooms}
        />
      );

      await waitFor(() => {
        expect(screen.getByLabelText('Filter by status')).toBeInTheDocument();
      });
    });

    it('renders create room button when showCreateButton is true', async () => {
      render(
        <RoomLobby
          onJoinRoom={mockOnJoinRoom}
          onCreateRoom={mockOnCreateRoom}
          fetchRooms={mockFetchRooms}
          showCreateButton={true}
        />
      );

      await waitFor(() => {
        expect(screen.getByLabelText('Create new room')).toBeInTheDocument();
      });
    });

    it('hides create room button when showCreateButton is false', async () => {
      render(
        <RoomLobby
          onJoinRoom={mockOnJoinRoom}
          onCreateRoom={mockOnCreateRoom}
          fetchRooms={mockFetchRooms}
          showCreateButton={false}
        />
      );

      await waitFor(() => {
        expect(screen.queryByLabelText('Create new room')).not.toBeInTheDocument();
      });
    });
  });

  describe('Room Display', () => {
    it('displays room name and description', async () => {
      const rooms = [createMockRoom({ name: 'Team Sync', description: 'Weekly sync meeting' })];
      mockFetchRooms.mockResolvedValue({ rooms, total: 1 });

      render(
        <RoomLobby
          onJoinRoom={mockOnJoinRoom}
          onCreateRoom={mockOnCreateRoom}
          fetchRooms={mockFetchRooms}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Team Sync')).toBeInTheDocument();
        expect(screen.getByText('Weekly sync meeting')).toBeInTheDocument();
      });
    });

    it('displays participant count', async () => {
      const rooms = [createMockRoom({ participantCount: 3, maxParticipants: 6 })];
      mockFetchRooms.mockResolvedValue({ rooms, total: 1 });

      render(
        <RoomLobby
          onJoinRoom={mockOnJoinRoom}
          onCreateRoom={mockOnCreateRoom}
          fetchRooms={mockFetchRooms}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('3/6')).toBeInTheDocument();
      });
    });

    it('displays room status badge', async () => {
      const rooms = [createMockRoom({ status: 'active' })];
      mockFetchRooms.mockResolvedValue({ rooms, total: 1 });

      render(
        <RoomLobby
          onJoinRoom={mockOnJoinRoom}
          onCreateRoom={mockOnCreateRoom}
          fetchRooms={mockFetchRooms}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('active')).toBeInTheDocument();
      });
    });

    it('displays total room count in footer', async () => {
      render(
        <RoomLobby
          onJoinRoom={mockOnJoinRoom}
          onCreateRoom={mockOnCreateRoom}
          fetchRooms={mockFetchRooms}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('4 rooms available')).toBeInTheDocument();
      });
    });
  });

  describe('Search', () => {
    it('filters rooms by name', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

      render(
        <RoomLobby
          onJoinRoom={mockOnJoinRoom}
          onCreateRoom={mockOnCreateRoom}
          fetchRooms={mockFetchRooms}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Planning Session')).toBeInTheDocument();
      });

      const searchInput = screen.getByLabelText('Search rooms');
      await user.type(searchInput, 'Planning');

      expect(screen.getByText('Planning Session')).toBeInTheDocument();
      expect(screen.queryByText('Brainstorm')).not.toBeInTheDocument();
    });

    it('filters rooms by description', async () => {
      const rooms = [
        createMockRoom({ id: 'r1', name: 'Room A', description: 'Design review' }),
        createMockRoom({ id: 'r2', name: 'Room B', description: 'Code review' }),
      ];
      mockFetchRooms.mockResolvedValue({ rooms, total: 2 });

      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

      render(
        <RoomLobby
          onJoinRoom={mockOnJoinRoom}
          onCreateRoom={mockOnCreateRoom}
          fetchRooms={mockFetchRooms}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Room A')).toBeInTheDocument();
      });

      const searchInput = screen.getByLabelText('Search rooms');
      await user.type(searchInput, 'design');

      expect(screen.getByText('Room A')).toBeInTheDocument();
      expect(screen.queryByText('Room B')).not.toBeInTheDocument();
    });

    it('shows empty state when search has no results', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

      render(
        <RoomLobby
          onJoinRoom={mockOnJoinRoom}
          onCreateRoom={mockOnCreateRoom}
          fetchRooms={mockFetchRooms}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Planning Session')).toBeInTheDocument();
      });

      const searchInput = screen.getByLabelText('Search rooms');
      await user.type(searchInput, 'nonexistent');

      expect(screen.getByText('No rooms match your search')).toBeInTheDocument();
    });

    it('updates footer count when filtering', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

      render(
        <RoomLobby
          onJoinRoom={mockOnJoinRoom}
          onCreateRoom={mockOnCreateRoom}
          fetchRooms={mockFetchRooms}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('4 rooms available')).toBeInTheDocument();
      });

      const searchInput = screen.getByLabelText('Search rooms');
      await user.type(searchInput, 'Planning');

      expect(screen.getByText('1 of 4 rooms')).toBeInTheDocument();
    });
  });

  describe('Status Filter', () => {
    it('fetches rooms with status filter', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

      render(
        <RoomLobby
          onJoinRoom={mockOnJoinRoom}
          onCreateRoom={mockOnCreateRoom}
          fetchRooms={mockFetchRooms}
        />
      );

      await waitFor(() => {
        expect(mockFetchRooms).toHaveBeenCalledWith(undefined);
      });

      const filterSelect = screen.getByLabelText('Filter by status');
      await user.selectOptions(filterSelect, 'active');

      await waitFor(() => {
        expect(mockFetchRooms).toHaveBeenCalledWith('active');
      });
    });

    it('resets to all when selecting all filter', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

      render(
        <RoomLobby
          onJoinRoom={mockOnJoinRoom}
          onCreateRoom={mockOnCreateRoom}
          fetchRooms={mockFetchRooms}
        />
      );

      await waitFor(() => {
        expect(mockFetchRooms).toHaveBeenCalled();
      });

      const filterSelect = screen.getByLabelText('Filter by status');
      await user.selectOptions(filterSelect, 'active');
      await user.selectOptions(filterSelect, 'all');

      await waitFor(() => {
        expect(mockFetchRooms).toHaveBeenLastCalledWith(undefined);
      });
    });
  });

  describe('Join Room', () => {
    it('calls onJoinRoom when clicking join on active room', async () => {
      const rooms = [createMockRoom({ id: 'room-active', status: 'active' })];
      mockFetchRooms.mockResolvedValue({ rooms, total: 1 });

      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

      render(
        <RoomLobby
          onJoinRoom={mockOnJoinRoom}
          onCreateRoom={mockOnCreateRoom}
          fetchRooms={mockFetchRooms}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Join Room')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Join Room'));

      expect(mockOnJoinRoom).toHaveBeenCalledWith('room-active');
    });

    it('calls onJoinRoom when clicking join on waiting room', async () => {
      const rooms = [createMockRoom({ id: 'room-waiting', status: 'waiting' })];
      mockFetchRooms.mockResolvedValue({ rooms, total: 1 });

      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

      render(
        <RoomLobby
          onJoinRoom={mockOnJoinRoom}
          onCreateRoom={mockOnCreateRoom}
          fetchRooms={mockFetchRooms}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Join Room')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Join Room'));

      expect(mockOnJoinRoom).toHaveBeenCalledWith('room-waiting');
    });

    it('disables join button for full rooms', async () => {
      const rooms = [createMockRoom({ id: 'room-full', status: 'full' })];
      mockFetchRooms.mockResolvedValue({ rooms, total: 1 });

      render(
        <RoomLobby
          onJoinRoom={mockOnJoinRoom}
          onCreateRoom={mockOnCreateRoom}
          fetchRooms={mockFetchRooms}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Room Full')).toBeInTheDocument();
      });

      const button = screen.getByText('Room Full');
      expect(button).toBeDisabled();
    });

    it('disables join button for closed rooms', async () => {
      const rooms = [createMockRoom({ id: 'room-closed', status: 'closed' })];
      mockFetchRooms.mockResolvedValue({ rooms, total: 1 });

      render(
        <RoomLobby
          onJoinRoom={mockOnJoinRoom}
          onCreateRoom={mockOnCreateRoom}
          fetchRooms={mockFetchRooms}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Closed')).toBeInTheDocument();
      });

      const button = screen.getByText('Closed');
      expect(button).toBeDisabled();
    });

    it('does not call onJoinRoom when clicking disabled button', async () => {
      const rooms = [createMockRoom({ id: 'room-full', status: 'full' })];
      mockFetchRooms.mockResolvedValue({ rooms, total: 1 });

      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

      render(
        <RoomLobby
          onJoinRoom={mockOnJoinRoom}
          onCreateRoom={mockOnCreateRoom}
          fetchRooms={mockFetchRooms}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Room Full')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Room Full'));

      expect(mockOnJoinRoom).not.toHaveBeenCalled();
    });
  });

  describe('Create Room', () => {
    it('calls onCreateRoom when clicking create button', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

      render(
        <RoomLobby
          onJoinRoom={mockOnJoinRoom}
          onCreateRoom={mockOnCreateRoom}
          fetchRooms={mockFetchRooms}
        />
      );

      await waitFor(() => {
        expect(screen.getByLabelText('Create new room')).toBeInTheDocument();
      });

      await user.click(screen.getByLabelText('Create new room'));

      expect(mockOnCreateRoom).toHaveBeenCalledTimes(1);
    });

    it('shows create button in empty state', async () => {
      mockFetchRooms.mockResolvedValue({ rooms: [], total: 0 });

      render(
        <RoomLobby
          onJoinRoom={mockOnJoinRoom}
          onCreateRoom={mockOnCreateRoom}
          fetchRooms={mockFetchRooms}
          showCreateButton={true}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('No rooms available')).toBeInTheDocument();
      });

      // There should be a create button in the empty state
      const createButtons = screen.getAllByText('Create Room');
      expect(createButtons.length).toBeGreaterThan(0);
    });
  });

  describe('Refresh', () => {
    it('refetches rooms when clicking refresh button', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

      render(
        <RoomLobby
          onJoinRoom={mockOnJoinRoom}
          onCreateRoom={mockOnCreateRoom}
          fetchRooms={mockFetchRooms}
        />
      );

      await waitFor(() => {
        expect(mockFetchRooms).toHaveBeenCalledTimes(1);
      });

      await user.click(screen.getByLabelText('Refresh rooms'));

      await waitFor(() => {
        expect(mockFetchRooms).toHaveBeenCalledTimes(2);
      });
    });

    it('auto-refreshes at specified interval', async () => {
      render(
        <RoomLobby
          onJoinRoom={mockOnJoinRoom}
          onCreateRoom={mockOnCreateRoom}
          fetchRooms={mockFetchRooms}
          refreshInterval={5000}
        />
      );

      await waitFor(() => {
        expect(mockFetchRooms).toHaveBeenCalledTimes(1);
      });

      // Advance time by refresh interval
      await vi.advanceTimersByTimeAsync(5000);

      await waitFor(() => {
        expect(mockFetchRooms).toHaveBeenCalledTimes(2);
      });
    });

    it('does not auto-refresh when interval is 0', async () => {
      render(
        <RoomLobby
          onJoinRoom={mockOnJoinRoom}
          onCreateRoom={mockOnCreateRoom}
          fetchRooms={mockFetchRooms}
          refreshInterval={0}
        />
      );

      await waitFor(() => {
        expect(mockFetchRooms).toHaveBeenCalledTimes(1);
      });

      await vi.advanceTimersByTimeAsync(60000);

      expect(mockFetchRooms).toHaveBeenCalledTimes(1);
    });
  });

  describe('Error Handling', () => {
    it('displays error message when fetch fails', async () => {
      mockFetchRooms.mockRejectedValue(new Error('Network error'));

      render(
        <RoomLobby
          onJoinRoom={mockOnJoinRoom}
          onCreateRoom={mockOnCreateRoom}
          fetchRooms={mockFetchRooms}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Network error')).toBeInTheDocument();
      });
    });

    it('shows try again button on error', async () => {
      mockFetchRooms.mockRejectedValue(new Error('Network error'));

      render(
        <RoomLobby
          onJoinRoom={mockOnJoinRoom}
          onCreateRoom={mockOnCreateRoom}
          fetchRooms={mockFetchRooms}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Try Again')).toBeInTheDocument();
      });
    });

    it('retries fetch when clicking try again', async () => {
      mockFetchRooms.mockRejectedValueOnce(new Error('Network error'));
      mockFetchRooms.mockResolvedValueOnce({ rooms: mockRooms, total: mockRooms.length });

      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

      render(
        <RoomLobby
          onJoinRoom={mockOnJoinRoom}
          onCreateRoom={mockOnCreateRoom}
          fetchRooms={mockFetchRooms}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Try Again')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Try Again'));

      await waitFor(() => {
        expect(screen.getByText('Planning Session')).toBeInTheDocument();
      });
    });
  });

  describe('Empty State', () => {
    it('shows empty state when no rooms exist', async () => {
      mockFetchRooms.mockResolvedValue({ rooms: [], total: 0 });

      render(
        <RoomLobby
          onJoinRoom={mockOnJoinRoom}
          onCreateRoom={mockOnCreateRoom}
          fetchRooms={mockFetchRooms}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('No rooms available')).toBeInTheDocument();
        expect(screen.getByText('Be the first to create one!')).toBeInTheDocument();
      });
    });

    it('does not show create button in empty state when showCreateButton is false', async () => {
      mockFetchRooms.mockResolvedValue({ rooms: [], total: 0 });

      render(
        <RoomLobby
          onJoinRoom={mockOnJoinRoom}
          onCreateRoom={mockOnCreateRoom}
          fetchRooms={mockFetchRooms}
          showCreateButton={false}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('No rooms available')).toBeInTheDocument();
      });

      expect(screen.queryByText('Create Room')).not.toBeInTheDocument();
    });
  });
});
