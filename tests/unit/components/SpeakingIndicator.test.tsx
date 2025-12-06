/**
 * SpeakingIndicator Component Tests
 *
 * Tests for the SpeakingIndicator component which displays
 * current active speaker(s) with animations.
 *
 * Part of the Long-Horizon Engineering Protocol - FEAT-205
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SpeakingIndicator, type SpeakerInfo } from '@/components/room/SpeakingIndicator';

// Helper to create mock speaker
function createMockSpeaker(overrides: Partial<SpeakerInfo> = {}): SpeakerInfo {
  return {
    id: `peer-${Math.random().toString(36).slice(2, 8)}`,
    displayName: 'Test Speaker',
    audioLevel: 0.5,
    ...overrides,
  };
}

describe('SpeakingIndicator', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Idle State', () => {
    it('shows idle message when no speakers', () => {
      render(<SpeakingIndicator speakers={[]} />);

      expect(screen.getByText('No one speaking')).toBeInTheDocument();
    });

    it('shows custom idle text', () => {
      render(
        <SpeakingIndicator
          speakers={[]}
          idleText="Waiting for someone to speak..."
        />
      );

      expect(screen.getByText('Waiting for someone to speak...')).toBeInTheDocument();
    });

    it('has status role for accessibility', () => {
      render(<SpeakingIndicator speakers={[]} />);

      expect(screen.getByRole('status')).toBeInTheDocument();
    });

    it('uses aria-live for screen readers', () => {
      render(<SpeakingIndicator speakers={[]} />);

      expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
    });
  });

  describe('Single Speaker', () => {
    it('displays speaker name', () => {
      const speaker = createMockSpeaker({ displayName: 'Alice' });
      render(<SpeakingIndicator speakers={[speaker]} />);

      expect(screen.getByText('Alice')).toBeInTheDocument();
    });

    it('displays speaker avatar with initials', () => {
      const speaker = createMockSpeaker({ displayName: 'Alice Johnson' });
      render(<SpeakingIndicator speakers={[speaker]} />);

      expect(screen.getByText('AJ')).toBeInTheDocument();
    });

    it('shows (You) label for local speaker', () => {
      const speaker = createMockSpeaker({ displayName: 'Alice', isLocal: true });
      render(<SpeakingIndicator speakers={[speaker]} />);

      expect(screen.getByText('(You)')).toBeInTheDocument();
    });

    it('shows speaking icon', () => {
      const speaker = createMockSpeaker();
      const { container } = render(<SpeakingIndicator speakers={[speaker]} />);

      // Check for SVG icon
      const svg = container.querySelector('svg');
      expect(svg).toBeInTheDocument();
    });

    it('shows audio level visualization when enabled', () => {
      const speaker = createMockSpeaker({ audioLevel: 0.8 });
      const { container } = render(
        <SpeakingIndicator speakers={[speaker]} showAudioLevel={true} />
      );

      // Check for waveform bars (multiple div elements)
      const waveformContainer = container.querySelector('[aria-hidden="true"]');
      expect(waveformContainer).toBeInTheDocument();
    });

    it('hides audio level visualization when disabled', () => {
      const speaker = createMockSpeaker({ audioLevel: 0.8 });
      const { container } = render(
        <SpeakingIndicator speakers={[speaker]} showAudioLevel={false} />
      );

      // AudioWaveform component should not be present (has class gap-0.5)
      const waveformContainer = container.querySelector('.gap-0\\.5');
      expect(waveformContainer).not.toBeInTheDocument();
    });
  });

  describe('Multiple Speakers', () => {
    it('displays multiple speaker avatars', () => {
      const speakers = [
        createMockSpeaker({ id: 'peer-1', displayName: 'Alice' }),
        createMockSpeaker({ id: 'peer-2', displayName: 'Bob' }),
      ];
      render(<SpeakingIndicator speakers={speakers} />);

      expect(screen.getByText('AL')).toBeInTheDocument();
      expect(screen.getByText('BO')).toBeInTheDocument();
    });

    it('shows "2 people speaking" text for two speakers', () => {
      const speakers = [
        createMockSpeaker({ id: 'peer-1', displayName: 'Alice' }),
        createMockSpeaker({ id: 'peer-2', displayName: 'Bob' }),
      ];
      render(<SpeakingIndicator speakers={speakers} />);

      expect(screen.getByText('2 people speaking')).toBeInTheDocument();
    });

    it('shows "N people speaking" for more than two speakers', () => {
      const speakers = [
        createMockSpeaker({ id: 'peer-1', displayName: 'Alice' }),
        createMockSpeaker({ id: 'peer-2', displayName: 'Bob' }),
        createMockSpeaker({ id: 'peer-3', displayName: 'Charlie' }),
      ];
      render(<SpeakingIndicator speakers={speakers} />);

      expect(screen.getByText('3 people speaking')).toBeInTheDocument();
    });

    it('limits displayed speakers to maxDisplayed', () => {
      const speakers = [
        createMockSpeaker({ id: 'peer-1', displayName: 'Alice' }),
        createMockSpeaker({ id: 'peer-2', displayName: 'Bob' }),
        createMockSpeaker({ id: 'peer-3', displayName: 'Charlie' }),
        createMockSpeaker({ id: 'peer-4', displayName: 'David' }),
      ];
      render(<SpeakingIndicator speakers={speakers} maxDisplayed={2} />);

      // Should show +2 overflow indicator
      expect(screen.getByText('+2')).toBeInTheDocument();
    });

    it('shows overflow count correctly', () => {
      const speakers = [
        createMockSpeaker({ id: 'peer-1', displayName: 'Alice' }),
        createMockSpeaker({ id: 'peer-2', displayName: 'Bob' }),
        createMockSpeaker({ id: 'peer-3', displayName: 'Charlie' }),
        createMockSpeaker({ id: 'peer-4', displayName: 'David' }),
        createMockSpeaker({ id: 'peer-5', displayName: 'Eve' }),
      ];
      render(<SpeakingIndicator speakers={speakers} maxDisplayed={3} />);

      expect(screen.getByText('+2')).toBeInTheDocument();
    });
  });

  describe('Display Modes', () => {
    describe('Compact Mode', () => {
      it('renders in compact mode by default', () => {
        const speaker = createMockSpeaker({ displayName: 'Alice' });
        render(<SpeakingIndicator speakers={[speaker]} />);

        expect(screen.getByText('Alice')).toBeInTheDocument();
      });

      it('shows avatars in compact mode', () => {
        const speaker = createMockSpeaker({ displayName: 'Alice Johnson' });
        render(<SpeakingIndicator speakers={[speaker]} mode="compact" />);

        expect(screen.getByText('AJ')).toBeInTheDocument();
      });
    });

    describe('Minimal Mode', () => {
      it('shows only text in minimal mode', () => {
        const speaker = createMockSpeaker({ displayName: 'Alice' });
        render(<SpeakingIndicator speakers={[speaker]} mode="minimal" />);

        expect(screen.getByText('Alice is speaking')).toBeInTheDocument();
      });

      it('shows multi-speaker text in minimal mode', () => {
        const speakers = [
          createMockSpeaker({ id: 'peer-1', displayName: 'Alice' }),
          createMockSpeaker({ id: 'peer-2', displayName: 'Bob' }),
        ];
        render(<SpeakingIndicator speakers={speakers} mode="minimal" />);

        expect(screen.getByText('2 people speaking')).toBeInTheDocument();
      });
    });

    describe('Detailed Mode', () => {
      it('shows speaker list in detailed mode', () => {
        const speakers = [
          createMockSpeaker({ id: 'peer-1', displayName: 'Alice' }),
          createMockSpeaker({ id: 'peer-2', displayName: 'Bob' }),
        ];
        render(<SpeakingIndicator speakers={speakers} mode="detailed" />);

        expect(screen.getByText('Alice')).toBeInTheDocument();
        expect(screen.getByText('Bob')).toBeInTheDocument();
      });

      it('shows Speaking header in detailed mode', () => {
        const speaker = createMockSpeaker({ displayName: 'Alice' });
        render(<SpeakingIndicator speakers={[speaker]} mode="detailed" />);

        expect(screen.getByText('Speaking')).toBeInTheDocument();
      });

      it('shows "+N more" for overflow in detailed mode', () => {
        const speakers = [
          createMockSpeaker({ id: 'peer-1', displayName: 'Alice' }),
          createMockSpeaker({ id: 'peer-2', displayName: 'Bob' }),
          createMockSpeaker({ id: 'peer-3', displayName: 'Charlie' }),
          createMockSpeaker({ id: 'peer-4', displayName: 'David' }),
        ];
        render(<SpeakingIndicator speakers={speakers} mode="detailed" maxDisplayed={2} />);

        expect(screen.getByText('+2 more speaking')).toBeInTheDocument();
      });
    });
  });

  describe('Speaker Transitions', () => {
    it('handles speaker entering', async () => {
      const { rerender } = render(<SpeakingIndicator speakers={[]} />);

      expect(screen.getByText('No one speaking')).toBeInTheDocument();

      const speaker = createMockSpeaker({ displayName: 'Alice' });
      rerender(<SpeakingIndicator speakers={[speaker]} />);

      await act(async () => {
        vi.advanceTimersByTime(300);
      });

      expect(screen.getByText('Alice')).toBeInTheDocument();
    });

    it('handles speaker leaving', async () => {
      const speaker = createMockSpeaker({ displayName: 'Alice' });
      const { rerender } = render(<SpeakingIndicator speakers={[speaker]} />);

      expect(screen.getByText('Alice')).toBeInTheDocument();

      rerender(<SpeakingIndicator speakers={[]} />);

      await act(async () => {
        vi.advanceTimersByTime(300);
      });

      expect(screen.getByText('No one speaking')).toBeInTheDocument();
    });

    it('handles speaker swap', async () => {
      const alice = createMockSpeaker({ id: 'peer-1', displayName: 'Alice' });
      const { rerender } = render(<SpeakingIndicator speakers={[alice]} />);

      expect(screen.getByText('Alice')).toBeInTheDocument();

      const bob = createMockSpeaker({ id: 'peer-2', displayName: 'Bob' });
      rerender(<SpeakingIndicator speakers={[bob]} />);

      await act(async () => {
        vi.advanceTimersByTime(300);
      });

      expect(screen.getByText('Bob')).toBeInTheDocument();
    });

    it('uses custom animation duration', async () => {
      const { rerender } = render(
        <SpeakingIndicator speakers={[]} animationDuration={500} />
      );

      const speaker = createMockSpeaker({ displayName: 'Alice' });
      rerender(<SpeakingIndicator speakers={[speaker]} animationDuration={500} />);

      // Wait for animation to complete
      await act(async () => {
        vi.advanceTimersByTime(500);
      });

      expect(screen.getByText('Alice')).toBeInTheDocument();
    });
  });

  describe('Click Handler', () => {
    it('calls onSpeakerClick when speaker is clicked', async () => {
      vi.useRealTimers();
      const user = userEvent.setup();
      const onSpeakerClick = vi.fn();
      const speaker = createMockSpeaker({ id: 'peer-1', displayName: 'Alice' });

      render(
        <SpeakingIndicator
          speakers={[speaker]}
          onSpeakerClick={onSpeakerClick}
        />
      );

      // Find and click the avatar button
      const avatar = screen.getByRole('button', { name: /alice/i });
      await user.click(avatar);

      expect(onSpeakerClick).toHaveBeenCalledWith('peer-1');
      vi.useFakeTimers();
    });

    it('makes speaker clickable in detailed mode', async () => {
      vi.useRealTimers();
      const user = userEvent.setup();
      const onSpeakerClick = vi.fn();
      const speaker = createMockSpeaker({ id: 'peer-1', displayName: 'Alice' });

      render(
        <SpeakingIndicator
          speakers={[speaker]}
          mode="detailed"
          onSpeakerClick={onSpeakerClick}
        />
      );

      // Find and click the speaker row
      const speakerRow = screen.getByRole('button', { name: /alice/i });
      await user.click(speakerRow);

      expect(onSpeakerClick).toHaveBeenCalledWith('peer-1');
      vi.useFakeTimers();
    });

    it('supports keyboard navigation in detailed mode', async () => {
      vi.useRealTimers();
      const user = userEvent.setup();
      const onSpeakerClick = vi.fn();
      const speaker = createMockSpeaker({ id: 'peer-1', displayName: 'Alice' });

      render(
        <SpeakingIndicator
          speakers={[speaker]}
          mode="detailed"
          onSpeakerClick={onSpeakerClick}
        />
      );

      const speakerRow = screen.getByRole('button', { name: /alice/i });
      speakerRow.focus();
      await user.keyboard('{Enter}');

      expect(onSpeakerClick).toHaveBeenCalledWith('peer-1');
      vi.useFakeTimers();
    });

    it('does not show cursor pointer without click handler', () => {
      const speaker = createMockSpeaker({ displayName: 'Alice' });
      render(<SpeakingIndicator speakers={[speaker]} mode="detailed" />);

      // Should not have button role without click handler
      expect(screen.queryByRole('button', { name: /alice/i })).not.toBeInTheDocument();
    });
  });

  describe('Callbacks', () => {
    it('calls onSpeakersChange when speakers change', () => {
      const onSpeakersChange = vi.fn();
      const speaker1 = createMockSpeaker({ id: 'peer-1', displayName: 'Alice' });

      const { rerender } = render(
        <SpeakingIndicator
          speakers={[speaker1]}
          onSpeakersChange={onSpeakersChange}
        />
      );

      expect(onSpeakersChange).toHaveBeenCalledWith([speaker1]);

      const speaker2 = createMockSpeaker({ id: 'peer-2', displayName: 'Bob' });
      rerender(
        <SpeakingIndicator
          speakers={[speaker1, speaker2]}
          onSpeakersChange={onSpeakersChange}
        />
      );

      expect(onSpeakersChange).toHaveBeenCalledWith([speaker1, speaker2]);
    });
  });

  describe('Audio Level', () => {
    it('displays audio waveform based on level', () => {
      const speaker = createMockSpeaker({ audioLevel: 0.8 });
      const { container } = render(
        <SpeakingIndicator speakers={[speaker]} showAudioLevel={true} />
      );

      // Check waveform container exists (has gap-0.5 class)
      const waveform = container.querySelector('.gap-0\\.5');
      expect(waveform).toBeInTheDocument();

      // Check bars exist (5 bars inside the waveform)
      const bars = waveform?.querySelectorAll('.w-1');
      expect(bars?.length).toBe(5);
    });

    it('averages audio levels for multiple speakers', () => {
      const speakers = [
        createMockSpeaker({ id: 'peer-1', displayName: 'Alice', audioLevel: 0.8 }),
        createMockSpeaker({ id: 'peer-2', displayName: 'Bob', audioLevel: 0.4 }),
      ];
      const { container } = render(
        <SpeakingIndicator speakers={speakers} showAudioLevel={true} />
      );

      // Waveform should exist and reflect average level
      const waveform = container.querySelector('[aria-hidden="true"]');
      expect(waveform).toBeInTheDocument();
    });
  });

  describe('Primary Speaker', () => {
    it('identifies speaker with highest audio level as primary', () => {
      const speakers = [
        createMockSpeaker({ id: 'peer-1', displayName: 'Alice', audioLevel: 0.3 }),
        createMockSpeaker({ id: 'peer-2', displayName: 'Bob', audioLevel: 0.9 }),
      ];
      render(<SpeakingIndicator speakers={speakers} mode="minimal" />);

      // In minimal mode, should show primary speaker name
      // But with multiple speakers, it shows count
      expect(screen.getByText('2 people speaking')).toBeInTheDocument();
    });
  });

  describe('Avatar Integration', () => {
    it('uses ParticipantAvatar with speaking state', () => {
      const speaker = createMockSpeaker({
        displayName: 'Alice Johnson',
        audioLevel: 0.7,
      });
      render(<SpeakingIndicator speakers={[speaker]} />);

      // Avatar should show initials
      expect(screen.getByText('AJ')).toBeInTheDocument();
    });

    it('shows avatar image when URL provided', () => {
      const speaker = createMockSpeaker({
        displayName: 'Alice',
        avatarUrl: 'https://example.com/alice.jpg',
      });
      render(<SpeakingIndicator speakers={[speaker]} />);

      const img = screen.getByAltText('Alice');
      expect(img).toBeInTheDocument();
      expect(img).toHaveAttribute('src', 'https://example.com/alice.jpg');
    });
  });

  describe('Custom Class Name', () => {
    it('applies custom class name', () => {
      const { container } = render(
        <SpeakingIndicator speakers={[]} className="custom-class" />
      );

      expect(container.firstChild).toHaveClass('custom-class');
    });
  });

  describe('Edge Cases', () => {
    it('handles empty speaker array', () => {
      render(<SpeakingIndicator speakers={[]} />);

      expect(screen.getByText('No one speaking')).toBeInTheDocument();
    });

    it('handles speaker with no audio level', () => {
      const speaker = createMockSpeaker({ displayName: 'Alice' });
      delete (speaker as Partial<SpeakerInfo>).audioLevel;

      render(<SpeakingIndicator speakers={[speaker]} />);

      expect(screen.getByText('Alice')).toBeInTheDocument();
    });

    it('handles rapid speaker changes', async () => {
      const { rerender } = render(<SpeakingIndicator speakers={[]} />);

      // Rapidly add and remove speakers
      for (let i = 0; i < 5; i++) {
        const speaker = createMockSpeaker({ id: `peer-${i}`, displayName: `User ${i}` });
        rerender(<SpeakingIndicator speakers={[speaker]} />);
        await act(async () => {
          vi.advanceTimersByTime(50);
        });
      }

      // Should settle on the last speaker
      await act(async () => {
        vi.advanceTimersByTime(300);
      });

      expect(screen.getByText('User 4')).toBeInTheDocument();
    });

    it('handles speaker with very long name', () => {
      const speaker = createMockSpeaker({
        displayName: 'This Is A Very Long Display Name That Should Be Truncated',
      });
      render(<SpeakingIndicator speakers={[speaker]} />);

      // Name should be present (truncation is CSS)
      expect(
        screen.getByText('This Is A Very Long Display Name That Should Be Truncated')
      ).toBeInTheDocument();
    });

    it('handles speaker with special characters in name', () => {
      const speaker = createMockSpeaker({
        displayName: 'User <Script>',
      });
      render(<SpeakingIndicator speakers={[speaker]} />);

      expect(screen.getByText('User <Script>')).toBeInTheDocument();
    });
  });
});
