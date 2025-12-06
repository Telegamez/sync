/**
 * Rooms Page Tests
 *
 * Tests for the /rooms lobby page that displays available rooms
 * and allows users to join or create rooms.
 *
 * Part of the Long-Horizon Engineering Protocol - FEAT-117
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RoomsPage from '@/app/rooms/page';

// Mock next/navigation
const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

// Mock fetch for room API
const mockRooms = [
  {
    id: 'room-1',
    name: 'Team Standup',
    description: 'Daily sync meeting',
    status: 'active' as const,
    participantCount: 3,
    maxParticipants: 6,
    createdAt: new Date().toISOString(),
    aiPersonality: 'facilitator' as const,
  },
  {
    id: 'room-2',
    name: 'Brainstorm Session',
    description: 'Product ideation',
    status: 'waiting' as const,
    participantCount: 1,
    maxParticipants: 10,
    createdAt: new Date().toISOString(),
    aiPersonality: 'brainstorm' as const,
  },
];

describe('RoomsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });

    // Mock successful fetch
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ rooms: mockRooms, total: 2 }),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Page Structure', () => {
    it('should render the page header', async () => {
      render(<RoomsPage />);

      await waitFor(() => {
        expect(screen.getByText('Collaboration Rooms')).toBeInTheDocument();
      });
    });

    it('should render back to home link', async () => {
      render(<RoomsPage />);

      await waitFor(() => {
        const backLink = screen.getByRole('link', { name: /back to home/i });
        expect(backLink).toBeInTheDocument();
        expect(backLink).toHaveAttribute('href', '/');
      });
    });

    it('should render page description', async () => {
      render(<RoomsPage />);

      await waitFor(() => {
        expect(screen.getByText(/join an existing collaboration room/i)).toBeInTheDocument();
      });
    });

    it('should render footer', async () => {
      render(<RoomsPage />);

      await waitFor(() => {
        expect(screen.getByText(/The AI Collaboration Engine/)).toBeInTheDocument();
      });
    });
  });

  describe('Room List', () => {
    it('should fetch and display rooms', async () => {
      render(<RoomsPage />);

      await waitFor(() => {
        expect(screen.getByText('Team Standup')).toBeInTheDocument();
        expect(screen.getByText('Brainstorm Session')).toBeInTheDocument();
      });
    });

    it('should call fetch API on mount', async () => {
      render(<RoomsPage />);

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith('/api/rooms');
      });
    });

    it('should show loading state initially', () => {
      render(<RoomsPage />);

      // RoomLobby shows loading state
      expect(screen.getByText('Loading rooms...')).toBeInTheDocument();
    });
  });

  describe('Create Room Navigation', () => {
    it('should navigate to create room page when create button clicked', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      render(<RoomsPage />);

      // Wait for rooms to load
      await waitFor(() => {
        expect(screen.getByText('Team Standup')).toBeInTheDocument();
      });

      // Find and click create button (aria-label is "Create new room")
      const createButton = screen.getByRole('button', { name: /create new room/i });
      await user.click(createButton);

      expect(mockPush).toHaveBeenCalledWith('/rooms/create');
    });
  });

  describe('Join Room Navigation', () => {
    it('should navigate to room page when join button clicked', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      render(<RoomsPage />);

      // Wait for rooms to load
      await waitFor(() => {
        expect(screen.getByText('Team Standup')).toBeInTheDocument();
      });

      // Find and click first join button
      const joinButtons = screen.getAllByRole('button', { name: /join/i });
      await user.click(joinButtons[0]);

      expect(mockPush).toHaveBeenCalledWith('/rooms/room-1');
    });

    it('should show joining overlay when joining', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      render(<RoomsPage />);

      // Wait for rooms to load
      await waitFor(() => {
        expect(screen.getByText('Team Standup')).toBeInTheDocument();
      });

      // Find and click first join button
      const joinButtons = screen.getAllByRole('button', { name: /join/i });
      await user.click(joinButtons[0]);

      // Should show joining overlay
      expect(screen.getByText('Joining room...')).toBeInTheDocument();
      expect(screen.getByText('Establishing connection')).toBeInTheDocument();
    });
  });

  describe('Error Handling', () => {
    it('should show error state when fetch fails', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
      });

      render(<RoomsPage />);

      await waitFor(() => {
        // RoomLobby shows "Failed to fetch rooms"
        expect(screen.getByText(/failed to fetch rooms/i)).toBeInTheDocument();
      });
    });

    it('should show retry button on error', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
      });

      render(<RoomsPage />);

      await waitFor(() => {
        // RoomLobby shows "Try Again" button
        expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
      });
    });
  });

  describe('Empty State', () => {
    it('should show empty state when no rooms', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ rooms: [], total: 0 }),
      });

      render(<RoomsPage />);

      await waitFor(() => {
        expect(screen.getByText(/no rooms available/i)).toBeInTheDocument();
      });
    });
  });

  describe('Search and Filter', () => {
    it('should render search input', async () => {
      render(<RoomsPage />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/search rooms/i)).toBeInTheDocument();
      });
    });

    it('should filter rooms by search', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      render(<RoomsPage />);

      await waitFor(() => {
        expect(screen.getByText('Team Standup')).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText(/search rooms/i);
      await user.type(searchInput, 'Brainstorm');

      // Should only show matching room
      expect(screen.queryByText('Team Standup')).not.toBeInTheDocument();
      expect(screen.getByText('Brainstorm Session')).toBeInTheDocument();
    });
  });

  describe('Refresh', () => {
    it('should render refresh button', async () => {
      render(<RoomsPage />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /refresh/i })).toBeInTheDocument();
      });
    });

    it('should refetch rooms when refresh clicked', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      render(<RoomsPage />);

      await waitFor(() => {
        expect(screen.getByText('Team Standup')).toBeInTheDocument();
      });

      // Clear mock to track new calls
      (global.fetch as ReturnType<typeof vi.fn>).mockClear();

      const refreshButton = screen.getByRole('button', { name: /refresh/i });
      await user.click(refreshButton);

      expect(global.fetch).toHaveBeenCalled();
    });
  });

  describe('Responsive Design', () => {
    it('should have responsive container classes', async () => {
      const { container } = render(<RoomsPage />);

      await waitFor(() => {
        const main = container.querySelector('main');
        expect(main).toHaveClass('max-w-7xl');
      });
    });
  });
});
