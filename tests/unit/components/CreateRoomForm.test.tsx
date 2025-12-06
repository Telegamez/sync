/**
 * CreateRoomForm Component Tests
 *
 * Tests for room creation form validation and submission.
 *
 * Part of the Long-Horizon Engineering Protocol - FEAT-113
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CreateRoomForm } from '@/components/room/CreateRoomForm';
import type { CreateRoomRequest } from '@/types/room';

describe('CreateRoomForm', () => {
  let mockOnSubmit: ReturnType<typeof vi.fn>;
  let mockOnCancel: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockOnSubmit = vi.fn();
    mockOnCancel = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Initial Render', () => {
    it('renders form with all fields', () => {
      render(<CreateRoomForm onSubmit={mockOnSubmit} />);

      expect(screen.getByLabelText(/room name/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/description/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/max participants/i)).toBeInTheDocument();
      expect(screen.getByText(/ai personality/i)).toBeInTheDocument();
    });

    it('renders with default values', () => {
      render(<CreateRoomForm onSubmit={mockOnSubmit} />);

      expect(screen.getByLabelText(/room name/i)).toHaveValue('');
      expect(screen.getByLabelText(/description/i)).toHaveValue('');
      expect(screen.getByLabelText(/max participants/i)).toHaveValue('4');
    });

    it('renders with initial values', () => {
      render(
        <CreateRoomForm
          onSubmit={mockOnSubmit}
          initialValues={{
            name: 'Team Meeting',
            description: 'Weekly sync',
            maxParticipants: 6,
            aiPersonality: 'facilitator',
          }}
        />
      );

      expect(screen.getByLabelText(/room name/i)).toHaveValue('Team Meeting');
      expect(screen.getByLabelText(/description/i)).toHaveValue('Weekly sync');
      expect(screen.getByLabelText(/max participants/i)).toHaveValue('6');
      expect(screen.getByRole('button', { name: /facilitator/i })).toHaveAttribute('aria-pressed', 'true');
    });

    it('renders create button', () => {
      render(<CreateRoomForm onSubmit={mockOnSubmit} />);
      expect(screen.getByRole('button', { name: /create room/i })).toBeInTheDocument();
    });

    it('hides cancel button by default', () => {
      render(<CreateRoomForm onSubmit={mockOnSubmit} />);
      expect(screen.queryByRole('button', { name: /cancel/i })).not.toBeInTheDocument();
    });

    it('shows cancel button when showCancel is true', () => {
      render(<CreateRoomForm onSubmit={mockOnSubmit} onCancel={mockOnCancel} showCancel />);
      expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
    });

    it('has data-testid for testing', () => {
      render(<CreateRoomForm onSubmit={mockOnSubmit} />);
      expect(screen.getByTestId('create-room-form')).toBeInTheDocument();
    });
  });

  describe('Name Validation', () => {
    it('shows error when name is empty on blur', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

      render(<CreateRoomForm onSubmit={mockOnSubmit} />);

      const nameInput = screen.getByLabelText(/room name/i);
      await user.click(nameInput);
      await user.tab();

      expect(screen.getByText(/room name is required/i)).toBeInTheDocument();
    });

    it('shows error when name is too short', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

      render(<CreateRoomForm onSubmit={mockOnSubmit} />);

      const nameInput = screen.getByLabelText(/room name/i);
      await user.type(nameInput, 'A');
      await user.tab();

      expect(screen.getByText(/at least 2 characters/i)).toBeInTheDocument();
    });

    it('shows error when name is too long', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

      render(<CreateRoomForm onSubmit={mockOnSubmit} />);

      const nameInput = screen.getByLabelText(/room name/i);
      await user.type(nameInput, 'A'.repeat(101));
      await user.tab();

      expect(screen.getByText(/at most 100 characters/i)).toBeInTheDocument();
    });

    it('clears error when valid name is entered', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

      render(<CreateRoomForm onSubmit={mockOnSubmit} />);

      const nameInput = screen.getByLabelText(/room name/i);
      await user.type(nameInput, 'A');
      await user.tab();

      expect(screen.getByText(/at least 2 characters/i)).toBeInTheDocument();

      await user.clear(nameInput);
      await user.type(nameInput, 'Valid Name');

      expect(screen.queryByText(/at least 2 characters/i)).not.toBeInTheDocument();
    });

    it('shows character count', () => {
      render(<CreateRoomForm onSubmit={mockOnSubmit} />);
      expect(screen.getByText('0/100 characters')).toBeInTheDocument();
    });

    it('updates character count as user types', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

      render(<CreateRoomForm onSubmit={mockOnSubmit} />);

      const nameInput = screen.getByLabelText(/room name/i);
      await user.type(nameInput, 'Hello');

      expect(screen.getByText('5/100 characters')).toBeInTheDocument();
    });
  });

  describe('Description Validation', () => {
    it('allows empty description', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

      render(<CreateRoomForm onSubmit={mockOnSubmit} />);

      const descInput = screen.getByLabelText(/description/i);
      await user.click(descInput);
      await user.tab();

      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('shows error when description is too long', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

      render(<CreateRoomForm onSubmit={mockOnSubmit} />);

      const descInput = screen.getByLabelText(/description/i);
      await user.type(descInput, 'A'.repeat(501));
      await user.tab();

      expect(screen.getByText(/at most 500 characters/i)).toBeInTheDocument();
    });

    it('shows description character count', () => {
      render(<CreateRoomForm onSubmit={mockOnSubmit} />);
      expect(screen.getByText('0/500 characters')).toBeInTheDocument();
    });
  });

  describe('Max Participants', () => {
    it('has options from 2 to 10', () => {
      render(<CreateRoomForm onSubmit={mockOnSubmit} />);

      const select = screen.getByLabelText(/max participants/i);
      const options = select.querySelectorAll('option');

      expect(options).toHaveLength(9);
      expect(options[0]).toHaveValue('2');
      expect(options[8]).toHaveValue('10');
    });

    it('allows changing max participants', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

      render(<CreateRoomForm onSubmit={mockOnSubmit} />);

      const select = screen.getByLabelText(/max participants/i);
      await user.selectOptions(select, '8');

      expect(select).toHaveValue('8');
    });
  });

  describe('AI Personality', () => {
    it('shows all personality options', () => {
      render(<CreateRoomForm onSubmit={mockOnSubmit} />);

      expect(screen.getByRole('button', { name: /facilitator/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /assistant/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /expert/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /brainstorm/i })).toBeInTheDocument();
    });

    it('defaults to assistant personality', () => {
      render(<CreateRoomForm onSubmit={mockOnSubmit} />);

      expect(screen.getByRole('button', { name: /assistant/i })).toHaveAttribute('aria-pressed', 'true');
    });

    it('allows selecting different personality', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

      render(<CreateRoomForm onSubmit={mockOnSubmit} />);

      await user.click(screen.getByRole('button', { name: /expert/i }));

      expect(screen.getByRole('button', { name: /expert/i })).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByRole('button', { name: /assistant/i })).toHaveAttribute('aria-pressed', 'false');
    });

    it('shows personality descriptions', () => {
      render(<CreateRoomForm onSubmit={mockOnSubmit} />);

      expect(screen.getByText(/guides discussions/i)).toBeInTheDocument();
      expect(screen.getByText(/general helpful/i)).toBeInTheDocument();
      expect(screen.getByText(/technical depth/i)).toBeInTheDocument();
      expect(screen.getByText(/creative ideation/i)).toBeInTheDocument();
    });
  });

  describe('Form Submission', () => {
    it('calls onSubmit with form data', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

      render(<CreateRoomForm onSubmit={mockOnSubmit} />);

      await user.type(screen.getByLabelText(/room name/i), 'Team Meeting');
      await user.type(screen.getByLabelText(/description/i), 'Weekly sync');
      await user.selectOptions(screen.getByLabelText(/max participants/i), '6');
      await user.click(screen.getByRole('button', { name: /facilitator/i }));
      await user.click(screen.getByRole('button', { name: /create room/i }));

      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalledWith({
          name: 'Team Meeting',
          description: 'Weekly sync',
          maxParticipants: 6,
          aiPersonality: 'facilitator',
        });
      });
    });

    it('trims whitespace from name and description', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

      render(<CreateRoomForm onSubmit={mockOnSubmit} />);

      await user.type(screen.getByLabelText(/room name/i), '  Team Meeting  ');
      await user.type(screen.getByLabelText(/description/i), '  Weekly sync  ');
      await user.click(screen.getByRole('button', { name: /create room/i }));

      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'Team Meeting',
            description: 'Weekly sync',
          })
        );
      });
    });

    it('omits description when empty', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

      render(<CreateRoomForm onSubmit={mockOnSubmit} />);

      await user.type(screen.getByLabelText(/room name/i), 'Team Meeting');
      await user.click(screen.getByRole('button', { name: /create room/i }));

      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalledWith(
          expect.objectContaining({
            description: undefined,
          })
        );
      });
    });

    it('does not submit with validation errors', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

      render(<CreateRoomForm onSubmit={mockOnSubmit} />);

      // Button is disabled when form is invalid
      const submitButton = screen.getByRole('button', { name: /create room/i });
      expect(submitButton).toBeDisabled();

      // Try to click anyway - should not call onSubmit
      await user.click(submitButton);

      expect(mockOnSubmit).not.toHaveBeenCalled();
    });

    it('disables submit button when form is invalid', () => {
      render(<CreateRoomForm onSubmit={mockOnSubmit} />);

      expect(screen.getByRole('button', { name: /create room/i })).toBeDisabled();
    });

    it('enables submit button when form is valid', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

      render(<CreateRoomForm onSubmit={mockOnSubmit} />);

      await user.type(screen.getByLabelText(/room name/i), 'Valid Name');

      expect(screen.getByRole('button', { name: /create room/i })).not.toBeDisabled();
    });
  });

  describe('Loading State', () => {
    it('shows loading state during submission', async () => {
      let resolveSubmit: () => void;
      const slowSubmit = vi.fn(
        () =>
          new Promise<void>((resolve) => {
            resolveSubmit = resolve;
          })
      );

      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

      render(<CreateRoomForm onSubmit={slowSubmit} />);

      await user.type(screen.getByLabelText(/room name/i), 'Team Meeting');
      await user.click(screen.getByRole('button', { name: /create room/i }));

      expect(screen.getByText(/creating.../i)).toBeInTheDocument();

      resolveSubmit!();
      await waitFor(() => {
        expect(screen.getByText(/create room/i)).toBeInTheDocument();
      });
    });

    it('disables all inputs during submission', async () => {
      let resolveSubmit: () => void;
      const slowSubmit = vi.fn(
        () =>
          new Promise<void>((resolve) => {
            resolveSubmit = resolve;
          })
      );

      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

      render(<CreateRoomForm onSubmit={slowSubmit} />);

      await user.type(screen.getByLabelText(/room name/i), 'Team Meeting');
      await user.click(screen.getByRole('button', { name: /create room/i }));

      expect(screen.getByLabelText(/room name/i)).toBeDisabled();
      expect(screen.getByLabelText(/description/i)).toBeDisabled();
      expect(screen.getByLabelText(/max participants/i)).toBeDisabled();

      resolveSubmit!();
    });

    it('disables personality buttons during submission', async () => {
      let resolveSubmit: () => void;
      const slowSubmit = vi.fn(
        () =>
          new Promise<void>((resolve) => {
            resolveSubmit = resolve;
          })
      );

      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

      render(<CreateRoomForm onSubmit={slowSubmit} />);

      await user.type(screen.getByLabelText(/room name/i), 'Team Meeting');
      await user.click(screen.getByRole('button', { name: /create room/i }));

      expect(screen.getByRole('button', { name: /facilitator/i })).toBeDisabled();
      expect(screen.getByRole('button', { name: /assistant/i })).toBeDisabled();

      resolveSubmit!();
    });

    it('resets loading state after submission', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      mockOnSubmit.mockResolvedValue(undefined);

      render(<CreateRoomForm onSubmit={mockOnSubmit} />);

      await user.type(screen.getByLabelText(/room name/i), 'Team Meeting');
      await user.click(screen.getByRole('button', { name: /create room/i }));

      await waitFor(() => {
        expect(screen.queryByText(/creating.../i)).not.toBeInTheDocument();
      });
    });
  });

  describe('Cancel Button', () => {
    it('calls onCancel when clicked', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

      render(<CreateRoomForm onSubmit={mockOnSubmit} onCancel={mockOnCancel} showCancel />);

      await user.click(screen.getByRole('button', { name: /cancel/i }));

      expect(mockOnCancel).toHaveBeenCalledTimes(1);
    });

    it('disables cancel button during submission', async () => {
      let resolveSubmit: () => void;
      const slowSubmit = vi.fn(
        () =>
          new Promise<void>((resolve) => {
            resolveSubmit = resolve;
          })
      );

      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

      render(<CreateRoomForm onSubmit={slowSubmit} onCancel={mockOnCancel} showCancel />);

      await user.type(screen.getByLabelText(/room name/i), 'Team Meeting');
      await user.click(screen.getByRole('button', { name: /create room/i }));

      expect(screen.getByRole('button', { name: /cancel/i })).toBeDisabled();

      resolveSubmit!();
    });
  });

  describe('Accessibility', () => {
    it('has proper form structure', () => {
      render(<CreateRoomForm onSubmit={mockOnSubmit} />);

      expect(screen.getByTestId('create-room-form')).toBeInTheDocument();
    });

    it('labels are associated with inputs', () => {
      render(<CreateRoomForm onSubmit={mockOnSubmit} />);

      expect(screen.getByLabelText(/room name/i)).toHaveAttribute('id', 'room-name');
      expect(screen.getByLabelText(/description/i)).toHaveAttribute('id', 'room-description');
      expect(screen.getByLabelText(/max participants/i)).toHaveAttribute('id', 'max-participants');
    });

    it('marks required field', () => {
      render(<CreateRoomForm onSubmit={mockOnSubmit} />);

      expect(screen.getByText('*')).toBeInTheDocument();
    });

    it('has aria-invalid on error', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

      render(<CreateRoomForm onSubmit={mockOnSubmit} />);

      const nameInput = screen.getByLabelText(/room name/i);
      await user.click(nameInput);
      await user.tab();

      expect(nameInput).toHaveAttribute('aria-invalid', 'true');
    });

    it('has aria-describedby for error message', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

      render(<CreateRoomForm onSubmit={mockOnSubmit} />);

      const nameInput = screen.getByLabelText(/room name/i);
      await user.click(nameInput);
      await user.tab();

      expect(nameInput).toHaveAttribute('aria-describedby', 'name-error');
    });

    it('error messages have role alert', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

      render(<CreateRoomForm onSubmit={mockOnSubmit} />);

      const nameInput = screen.getByLabelText(/room name/i);
      await user.click(nameInput);
      await user.tab();

      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });

  describe('Custom Styling', () => {
    it('accepts custom className', () => {
      render(<CreateRoomForm onSubmit={mockOnSubmit} className="custom-class" />);

      expect(screen.getByTestId('create-room-form')).toHaveClass('custom-class');
    });
  });
});
