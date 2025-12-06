/**
 * Create Room Page Tests
 *
 * Tests for the /rooms/create page that allows users to create new rooms.
 *
 * Part of the Long-Horizon Engineering Protocol - FEAT-118
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CreateRoomPage from '@/app/rooms/create/page';

// Mock next/navigation
const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

describe('CreateRoomPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });

    // Mock successful room creation
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: 'new-room-123', name: 'Test Room' }),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Page Structure', () => {
    it('should render the page header', () => {
      render(<CreateRoomPage />);

      expect(screen.getByRole('heading', { name: 'Create Room' })).toBeInTheDocument();
    });

    it('should render back to rooms link', () => {
      render(<CreateRoomPage />);

      const backLink = screen.getByRole('link', { name: /back to rooms/i });
      expect(backLink).toBeInTheDocument();
      expect(backLink).toHaveAttribute('href', '/rooms');
    });

    it('should render page description', () => {
      render(<CreateRoomPage />);

      expect(screen.getByText(/create a new collaboration room/i)).toBeInTheDocument();
    });

    it('should render footer', () => {
      render(<CreateRoomPage />);

      expect(screen.getByText(/The AI Collaboration Engine/)).toBeInTheDocument();
    });

    it('should render help text', () => {
      render(<CreateRoomPage />);

      expect(screen.getByText(/you'll be redirected to your new room/i)).toBeInTheDocument();
    });
  });

  describe('Form Integration', () => {
    it('should render the CreateRoomForm', () => {
      render(<CreateRoomPage />);

      // Check for form elements
      expect(screen.getByLabelText(/room name/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /create room/i })).toBeInTheDocument();
    });

    it('should render cancel button', () => {
      render(<CreateRoomPage />);

      expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
    });
  });

  describe('Form Submission', () => {
    it('should call API when form is submitted', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      render(<CreateRoomPage />);

      // Fill in the form
      const nameInput = screen.getByLabelText(/room name/i);
      await user.type(nameInput, 'My New Room');

      // Submit form
      const submitButton = screen.getByRole('button', { name: /create room/i });
      await user.click(submitButton);

      // Wait for API call
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith('/api/rooms', expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        }));
      });
    });

    it('should include form data in API request', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      render(<CreateRoomPage />);

      // Fill in the form
      const nameInput = screen.getByLabelText(/room name/i);
      await user.type(nameInput, 'My Test Room');

      // Submit form
      const submitButton = screen.getByRole('button', { name: /create room/i });
      await user.click(submitButton);

      // Check API was called with correct data
      await waitFor(() => {
        const fetchCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
        const body = JSON.parse(fetchCall[1].body);
        expect(body.name).toBe('My Test Room');
      });
    });

    it('should navigate to new room after successful creation', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      render(<CreateRoomPage />);

      // Fill in the form
      const nameInput = screen.getByLabelText(/room name/i);
      await user.type(nameInput, 'My New Room');

      // Submit form
      const submitButton = screen.getByRole('button', { name: /create room/i });
      await user.click(submitButton);

      // Should navigate to new room
      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/rooms/new-room-123');
      });
    });

    it('should show loading state during submission', async () => {
      // Make fetch take longer
      global.fetch = vi.fn().mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({
          ok: true,
          json: () => Promise.resolve({ id: 'new-room-123' }),
        }), 1000))
      );

      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      render(<CreateRoomPage />);

      // Fill in the form
      const nameInput = screen.getByLabelText(/room name/i);
      await user.type(nameInput, 'My New Room');

      // Submit form
      const submitButton = screen.getByRole('button', { name: /create room/i });
      await user.click(submitButton);

      // Button should be disabled during loading
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /creating/i })).toBeDisabled();
      });
    });
  });

  describe('Error Handling', () => {
    it('should show error when API returns error', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        json: () => Promise.resolve({ error: 'Room name already exists' }),
      });

      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      render(<CreateRoomPage />);

      // Fill in the form
      const nameInput = screen.getByLabelText(/room name/i);
      await user.type(nameInput, 'Existing Room');

      // Submit form
      const submitButton = screen.getByRole('button', { name: /create room/i });
      await user.click(submitButton);

      // Should show error
      await waitFor(() => {
        expect(screen.getByText('Room name already exists')).toBeInTheDocument();
      });
    });

    it('should show generic error when API fails without message', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        json: () => Promise.resolve({}),
      });

      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      render(<CreateRoomPage />);

      // Fill in the form
      const nameInput = screen.getByLabelText(/room name/i);
      await user.type(nameInput, 'Test Room');

      // Submit form
      const submitButton = screen.getByRole('button', { name: /create room/i });
      await user.click(submitButton);

      // Should show generic error
      await waitFor(() => {
        expect(screen.getByText('Failed to create room')).toBeInTheDocument();
      });
    });

    it('should show error when network fails', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      render(<CreateRoomPage />);

      // Fill in the form
      const nameInput = screen.getByLabelText(/room name/i);
      await user.type(nameInput, 'Test Room');

      // Submit form
      const submitButton = screen.getByRole('button', { name: /create room/i });
      await user.click(submitButton);

      // Should show network error
      await waitFor(() => {
        expect(screen.getByText('Network error')).toBeInTheDocument();
      });
    });

    it('should re-enable form after error', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        json: () => Promise.resolve({ error: 'Error' }),
      });

      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      render(<CreateRoomPage />);

      // Fill in the form
      const nameInput = screen.getByLabelText(/room name/i);
      await user.type(nameInput, 'Test Room');

      // Submit form
      const submitButton = screen.getByRole('button', { name: /create room/i });
      await user.click(submitButton);

      // Wait for error
      await waitFor(() => {
        expect(screen.getByText('Error')).toBeInTheDocument();
      });

      // Submit button should be enabled again
      expect(screen.getByRole('button', { name: /create room/i })).not.toBeDisabled();
    });
  });

  describe('Cancel Navigation', () => {
    it('should navigate to rooms when cancel clicked', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      render(<CreateRoomPage />);

      // Click cancel button
      const cancelButton = screen.getByRole('button', { name: /cancel/i });
      await user.click(cancelButton);

      expect(mockPush).toHaveBeenCalledWith('/rooms');
    });
  });

  describe('Form Validation', () => {
    it('should show validation error for short name', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      render(<CreateRoomPage />);

      // Type short name (1 character - less than 2 min) and blur
      const nameInput = screen.getByLabelText(/room name/i);
      await user.type(nameInput, 'A');
      await user.tab();

      // Should show validation error (form requires at least 2 characters)
      await waitFor(() => {
        expect(screen.getByText(/at least 2 characters/i)).toBeInTheDocument();
      });
    });

    it('should disable submit button with invalid form', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      render(<CreateRoomPage />);

      // Leave name empty
      const nameInput = screen.getByLabelText(/room name/i);
      await user.click(nameInput);
      await user.tab();

      // Submit button should be disabled
      expect(screen.getByRole('button', { name: /create room/i })).toBeDisabled();
    });
  });

  describe('Responsive Design', () => {
    it('should have responsive container classes', () => {
      const { container } = render(<CreateRoomPage />);

      const main = container.querySelector('main');
      expect(main).toHaveClass('max-w-3xl');
    });

    it('should have form container with proper styling', () => {
      const { container } = render(<CreateRoomPage />);

      const formContainer = container.querySelector('.bg-card');
      expect(formContainer).toBeInTheDocument();
    });
  });
});
