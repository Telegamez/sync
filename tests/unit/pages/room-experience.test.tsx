/**
 * Room Experience Page Tests
 *
 * Tests for the /rooms/[roomId] page that provides the main room collaboration experience.
 *
 * Part of the Long-Horizon Engineering Protocol - FEAT-119
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RoomPage from '@/app/rooms/[roomId]/page';

// Mock next/navigation
const mockPush = vi.fn();
let mockRoomId = 'test-room-123';

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
  useParams: () => ({
    roomId: mockRoomId,
  }),
}));

// Mock room data
const mockRoom = {
  id: 'test-room-123',
  name: 'Test Room',
  description: 'A test collaboration room',
  status: 'waiting',
  maxParticipants: 4,
  participantCount: 1,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ownerId: 'owner-123',
};

// Mock clipboard
const mockWriteText = vi.fn();

describe('RoomPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });

    // Mock clipboard
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: mockWriteText,
      },
      writable: true,
      configurable: true,
    });

    // Default successful room fetch
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(mockRoom),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    mockRoomId = 'test-room-123'; // Reset to default
  });

  describe('Loading State', () => {
    it('should show loading state initially', () => {
      render(<RoomPage />);

      expect(screen.getByText('Loading room...')).toBeInTheDocument();
    });

    it('should show joining state after loading', async () => {
      render(<RoomPage />);

      await waitFor(() => {
        expect(screen.getByText('Joining room...')).toBeInTheDocument();
      });
    });

    it('should show connected state after joining', async () => {
      render(<RoomPage />);

      await waitFor(() => {
        expect(screen.getByText('Connected')).toBeInTheDocument();
      });
    });
  });

  describe('Room Not Found', () => {
    it('should show not found error for 404 response', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: () => Promise.resolve({ error: 'Room not found' }),
      });

      mockRoomId = 'nonexistent-room';
      render(<RoomPage />);

      await waitFor(() => {
        expect(screen.getByText('Room Not Found')).toBeInTheDocument();
      });
    });

    it('should show descriptive message for not found', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: () => Promise.resolve({ error: 'Room not found' }),
      });

      mockRoomId = 'nonexistent-room';
      render(<RoomPage />);

      await waitFor(() => {
        expect(
          screen.getByText(/does not exist or has been deleted/i)
        ).toBeInTheDocument();
      });
    });

    it('should show back to rooms link on not found', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: () => Promise.resolve({ error: 'Room not found' }),
      });

      mockRoomId = 'nonexistent-room';
      render(<RoomPage />);

      await waitFor(() => {
        const backLink = screen.getByRole('link', { name: /back to rooms/i });
        expect(backLink).toBeInTheDocument();
        expect(backLink).toHaveAttribute('href', '/rooms');
      });
    });
  });

  describe('Room Full', () => {
    it('should show room full error', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            ...mockRoom,
            status: 'full',
          }),
      });

      mockRoomId = 'full-room';
      render(<RoomPage />);

      await waitFor(() => {
        expect(screen.getByText('Room is Full')).toBeInTheDocument();
      });
    });

    it('should show descriptive message for full room', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            ...mockRoom,
            status: 'full',
          }),
      });

      mockRoomId = 'full-room';
      render(<RoomPage />);

      await waitFor(() => {
        expect(
          screen.getByText(/reached its maximum number of participants/i)
        ).toBeInTheDocument();
      });
    });
  });

  describe('Room Closed', () => {
    it('should show room closed error', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            ...mockRoom,
            status: 'closed',
          }),
      });

      mockRoomId = 'closed-room';
      render(<RoomPage />);

      await waitFor(() => {
        expect(screen.getByText('Room Closed')).toBeInTheDocument();
      });
    });

    it('should show descriptive message for closed room', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            ...mockRoom,
            status: 'closed',
          }),
      });

      mockRoomId = 'closed-room';
      render(<RoomPage />);

      await waitFor(() => {
        expect(screen.getByText(/closed by the host/i)).toBeInTheDocument();
      });
    });
  });

  describe('Connection Error', () => {
    it('should show error state on fetch failure', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      render(<RoomPage />);

      await waitFor(() => {
        expect(screen.getByText('Connection Error')).toBeInTheDocument();
      });
    });

    it('should show error message', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      render(<RoomPage />);

      await waitFor(() => {
        expect(screen.getByText('Network error')).toBeInTheDocument();
      });
    });
  });

  describe('Connected Room', () => {
    it('should display room name in header', async () => {
      render(<RoomPage />);

      await waitFor(() => {
        expect(screen.getByText('Test Room')).toBeInTheDocument();
      });
    });

    it('should display participant count', async () => {
      render(<RoomPage />);

      await waitFor(() => {
        expect(screen.getByText(/1\/4 participants/i)).toBeInTheDocument();
      });
    });

    it('should display room description if present', async () => {
      render(<RoomPage />);

      await waitFor(() => {
        expect(screen.getByText('A test collaboration room')).toBeInTheDocument();
      });
    });

    it('should show leave button in header', async () => {
      render(<RoomPage />);

      await waitFor(() => {
        // Header has a leave button (there are multiple, so use getAllByRole)
        const leaveButtons = screen.getAllByRole('button', { name: /leave room/i });
        expect(leaveButtons.length).toBeGreaterThanOrEqual(1);
      });
    });

    it('should show share button', async () => {
      render(<RoomPage />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /copy room link/i })).toBeInTheDocument();
      });
    });
  });

  describe('Room Controls', () => {
    it('should show mute button', async () => {
      render(<RoomPage />);

      await waitFor(() => {
        expect(screen.getByLabelText(/mute microphone/i)).toBeInTheDocument();
      });
    });

    it('should toggle mute state when clicked', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      render(<RoomPage />);

      await waitFor(() => {
        expect(screen.getByText('Connected')).toBeInTheDocument();
      });

      const muteButton = screen.getByLabelText(/mute microphone/i);
      await user.click(muteButton);

      expect(screen.getByLabelText(/unmute microphone/i)).toBeInTheDocument();
    });

    it('should show PTT button', async () => {
      render(<RoomPage />);

      await waitFor(() => {
        expect(screen.getByLabelText(/hold to talk to ai/i)).toBeInTheDocument();
      });
    });

    it('should update AI status when PTT pressed', async () => {
      render(<RoomPage />);

      await waitFor(() => {
        expect(screen.getByText('Connected')).toBeInTheDocument();
      });

      const pttButton = screen.getByLabelText(/hold to talk to ai/i);
      fireEvent.mouseDown(pttButton);

      expect(screen.getByText(/addressing ai/i)).toBeInTheDocument();
    });

    it('should show leave button in controls', async () => {
      render(<RoomPage />);

      await waitFor(() => {
        // Multiple leave buttons exist (header and controls)
        const leaveButtons = screen.getAllByLabelText('Leave room');
        expect(leaveButtons.length).toBeGreaterThanOrEqual(1);
      });
    });
  });

  describe('Leave Room', () => {
    it('should navigate to rooms when leave clicked', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      render(<RoomPage />);

      await waitFor(() => {
        expect(screen.getByText('Connected')).toBeInTheDocument();
      });

      // Get all leave buttons and click the first one (header)
      const leaveButtons = screen.getAllByRole('button', { name: /leave room/i });
      await user.click(leaveButtons[0]);

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/rooms');
      });
    });

    it('should show loading state when leaving', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      render(<RoomPage />);

      await waitFor(() => {
        expect(screen.getByText('Connected')).toBeInTheDocument();
      });

      // Get all leave buttons and click the first one (header)
      const leaveButtons = screen.getAllByRole('button', { name: /leave room/i });
      await user.click(leaveButtons[0]);

      // Leave button should be disabled during leaving
      expect(leaveButtons[0]).toBeDisabled();
    });
  });

  describe('Share Room', () => {
    it('should show share button that can be clicked', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      mockWriteText.mockResolvedValue(undefined);

      render(<RoomPage />);

      await waitFor(() => {
        expect(screen.getByText('Connected')).toBeInTheDocument();
      });

      const shareButton = screen.getByRole('button', { name: /copy room link/i });
      expect(shareButton).toBeInTheDocument();

      // Click should work (even if clipboard mock doesn't trigger)
      await user.click(shareButton);

      // After click, should show "Copied!" state
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /link copied/i })).toBeInTheDocument();
      });
    });

    it('should show copied feedback after copying', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      mockWriteText.mockResolvedValue(undefined);

      render(<RoomPage />);

      await waitFor(() => {
        expect(screen.getByText('Connected')).toBeInTheDocument();
      });

      const shareButton = screen.getByRole('button', { name: /copy room link/i });
      await user.click(shareButton);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /link copied/i })).toBeInTheDocument();
      });
    });
  });

  describe('Participants Display', () => {
    it('should show local participant', async () => {
      render(<RoomPage />);

      await waitFor(() => {
        // Local participant is shown with (You) label
        expect(screen.getByText(/\(You\)/)).toBeInTheDocument();
      });
    });

    it('should show participant list component', async () => {
      const { container } = render(<RoomPage />);

      await waitFor(() => {
        // ParticipantList renders with a list role
        expect(container.querySelector('[role="list"]')).toBeInTheDocument();
      });
    });
  });

  describe('AI Status', () => {
    it('should show AI helper text when not addressing', async () => {
      render(<RoomPage />);

      await waitFor(() => {
        expect(
          screen.getByText(/hold the talk button to address the ai/i)
        ).toBeInTheDocument();
      });
    });

    it('should show addressing AI status when PTT active', async () => {
      render(<RoomPage />);

      await waitFor(() => {
        expect(screen.getByText('Connected')).toBeInTheDocument();
      });

      const pttButton = screen.getByLabelText(/hold to talk to ai/i);
      fireEvent.mouseDown(pttButton);

      expect(screen.getByText(/addressing ai/i)).toBeInTheDocument();
    });
  });

  describe('Responsive Design', () => {
    it('should have max-width container for main content', async () => {
      const { container } = render(<RoomPage />);

      await waitFor(() => {
        expect(screen.getByText('Connected')).toBeInTheDocument();
      });

      const header = container.querySelector('header');
      expect(header?.querySelector('.max-w-7xl')).toBeInTheDocument();
    });
  });
});
