/**
 * VoiceModeSettings Component Tests
 *
 * Tests for the VoiceModeSettings component which provides
 * voice mode configuration for rooms.
 *
 * Part of the Long-Horizon Engineering Protocol - FEAT-156
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  VoiceModeSettings,
  VoiceModeSettingsCompact,
  VoiceModeSettingsFull,
  type VoiceModeSettingsProps,
} from '@/components/room/VoiceModeSettings';
import type { RoomVoiceSettings, VoiceMode } from '@/types/voice-mode';
import { DEFAULT_VOICE_SETTINGS } from '@/types/voice-mode';

// Default settings for tests
const defaultSettings: RoomVoiceSettings = {
  ...DEFAULT_VOICE_SETTINGS,
};

// Helper to render with default props
function renderSettings(props: Partial<VoiceModeSettingsProps> = {}) {
  const mockOnSettingsChange = vi.fn();
  const defaultProps: VoiceModeSettingsProps = {
    settings: defaultSettings,
    onSettingsChange: mockOnSettingsChange,
    ...props,
  };
  const result = render(<VoiceModeSettings {...defaultProps} />);
  return { ...result, mockOnSettingsChange };
}

describe('VoiceModeSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Initial Rendering', () => {
    it('renders settings panel', () => {
      renderSettings();

      expect(screen.getByTestId('voice-mode-settings')).toBeInTheDocument();
    });

    it('has correct region role and aria-label', () => {
      renderSettings();

      const panel = screen.getByRole('region');
      expect(panel).toHaveAttribute('aria-label', 'Voice mode settings');
    });

    it('displays Voice Settings heading', () => {
      renderSettings();

      expect(screen.getByText('Voice Settings')).toBeInTheDocument();
    });

    it('shows read-only notice when canEdit is false', () => {
      renderSettings({ canEdit: false });

      expect(
        screen.getByText('Only the room owner can change these settings')
      ).toBeInTheDocument();
    });

    it('does not show read-only notice when canEdit is true', () => {
      renderSettings({ canEdit: true });

      expect(
        screen.queryByText('Only the room owner can change these settings')
      ).not.toBeInTheDocument();
    });
  });

  describe('Voice Mode Selection', () => {
    it('displays all three voice mode options', () => {
      renderSettings();

      expect(screen.getByText('Open')).toBeInTheDocument();
      expect(screen.getByText('Push to Talk')).toBeInTheDocument();
      expect(screen.getByText('Designated Speaker')).toBeInTheDocument();
    });

    it('shows mode descriptions', () => {
      renderSettings();

      expect(
        screen.getByText('All audio is sent to AI continuously')
      ).toBeInTheDocument();
      expect(screen.getByText('Hold a button to address AI')).toBeInTheDocument();
      expect(
        screen.getByText('Only selected users can address AI')
      ).toBeInTheDocument();
    });

    it('shows pushToTalk as selected by default', () => {
      renderSettings();

      const pttButton = screen.getByRole('button', { name: /Push to Talk/i });
      expect(pttButton).toHaveAttribute('aria-pressed', 'true');
    });

    it('calls onSettingsChange when selecting Open mode', async () => {
      const user = userEvent.setup();
      const { mockOnSettingsChange } = renderSettings();

      const openButton = screen.getByRole('button', { name: /Open/i });
      await user.click(openButton);

      expect(mockOnSettingsChange).toHaveBeenCalledWith(
        expect.objectContaining({ mode: 'open' })
      );
    });

    it('calls onSettingsChange when selecting Designated Speaker mode', async () => {
      const user = userEvent.setup();
      const { mockOnSettingsChange } = renderSettings();

      const designatedButton = screen.getByRole('button', {
        name: /Designated Speaker/i,
      });
      await user.click(designatedButton);

      expect(mockOnSettingsChange).toHaveBeenCalledWith(
        expect.objectContaining({ mode: 'designatedSpeaker' })
      );
    });

    it('disables mode selection when canEdit is false', () => {
      renderSettings({ canEdit: false });

      const openButton = screen.getByRole('button', { name: /Open/i });
      expect(openButton).toBeDisabled();
    });
  });

  describe('Designated Speaker Selection', () => {
    const availablePeers = [
      { id: 'peer-1', displayName: 'Alice' },
      { id: 'peer-2', displayName: 'Bob' },
      { id: 'peer-3', displayName: 'Charlie' },
    ];

    it('shows designated speaker selector when mode is designatedSpeaker', async () => {
      const user = userEvent.setup();
      renderSettings({
        settings: { ...defaultSettings, mode: 'designatedSpeaker' },
        availablePeers,
      });

      expect(screen.getByText('Designated Speakers')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Alice' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Bob' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Charlie' })).toBeInTheDocument();
    });

    it('does not show designated speaker selector for other modes', () => {
      renderSettings({
        settings: { ...defaultSettings, mode: 'pushToTalk' },
        availablePeers,
      });

      expect(screen.queryByText('Designated Speakers')).not.toBeInTheDocument();
    });

    it('shows "No participants available" when no peers', () => {
      renderSettings({
        settings: { ...defaultSettings, mode: 'designatedSpeaker' },
        availablePeers: [],
      });

      expect(screen.getByText('No participants available')).toBeInTheDocument();
    });

    it('allows selecting designated speakers', async () => {
      const user = userEvent.setup();
      const { mockOnSettingsChange } = renderSettings({
        settings: { ...defaultSettings, mode: 'designatedSpeaker' },
        availablePeers,
      });

      await user.click(screen.getByRole('button', { name: 'Alice' }));

      expect(mockOnSettingsChange).toHaveBeenCalledWith(
        expect.objectContaining({
          designatedSpeakers: ['peer-1'],
        })
      );
    });

    it('allows toggling designated speaker off', async () => {
      const user = userEvent.setup();
      const { mockOnSettingsChange } = renderSettings({
        settings: {
          ...defaultSettings,
          mode: 'designatedSpeaker',
          designatedSpeakers: ['peer-1'],
        },
        availablePeers,
      });

      await user.click(screen.getByRole('button', { name: 'Alice' }));

      expect(mockOnSettingsChange).toHaveBeenCalledWith(
        expect.objectContaining({
          designatedSpeakers: [],
        })
      );
    });

    it('shows selected state on designated speakers', () => {
      renderSettings({
        settings: {
          ...defaultSettings,
          mode: 'designatedSpeaker',
          designatedSpeakers: ['peer-2'],
        },
        availablePeers,
      });

      const bobButton = screen.getByRole('button', { name: 'Bob' });
      expect(bobButton).toHaveAttribute('aria-pressed', 'true');
    });
  });

  describe('Lock During Response Toggle', () => {
    it('displays lock toggle', () => {
      renderSettings();

      expect(screen.getByText('Lock during AI response')).toBeInTheDocument();
    });

    it('shows lock description', () => {
      renderSettings();

      expect(
        screen.getByText('Prevent interruptions while AI is speaking')
      ).toBeInTheDocument();
    });

    it('shows lock as enabled by default', () => {
      renderSettings();

      const lockSwitch = screen.getByRole('switch', {
        name: /Lock during AI response/i,
      });
      expect(lockSwitch).toHaveAttribute('aria-checked', 'true');
    });

    it('calls onSettingsChange when toggling lock', async () => {
      const user = userEvent.setup();
      const { mockOnSettingsChange } = renderSettings();

      const lockSwitch = screen.getByRole('switch', {
        name: /Lock during AI response/i,
      });
      await user.click(lockSwitch);

      expect(mockOnSettingsChange).toHaveBeenCalledWith(
        expect.objectContaining({ lockDuringResponse: false })
      );
    });

    it('disables toggle when canEdit is false', () => {
      renderSettings({ canEdit: false });

      const lockSwitch = screen.getByRole('switch', {
        name: /Lock during AI response/i,
      });
      expect(lockSwitch).toBeDisabled();
    });
  });

  describe('Peer Audio Toggle', () => {
    it('displays peer audio toggle', () => {
      renderSettings();

      expect(screen.getByText('Enable peer audio')).toBeInTheDocument();
    });

    it('shows peer audio description', () => {
      renderSettings();

      expect(
        screen.getByText('Allow participants to hear each other')
      ).toBeInTheDocument();
    });

    it('shows peer audio as enabled by default', () => {
      renderSettings();

      const peerAudioSwitch = screen.getByRole('switch', {
        name: /Enable peer audio/i,
      });
      expect(peerAudioSwitch).toHaveAttribute('aria-checked', 'true');
    });

    it('calls onSettingsChange when toggling peer audio', async () => {
      const user = userEvent.setup();
      const { mockOnSettingsChange } = renderSettings();

      const peerAudioSwitch = screen.getByRole('switch', {
        name: /Enable peer audio/i,
      });
      await user.click(peerAudioSwitch);

      expect(mockOnSettingsChange).toHaveBeenCalledWith(
        expect.objectContaining({ enablePeerAudio: false })
      );
    });
  });

  describe('Allow Interrupt Toggle', () => {
    it('displays interrupt toggle', () => {
      renderSettings();

      expect(screen.getByText('Allow interrupt')).toBeInTheDocument();
    });

    it('shows interrupt description', () => {
      renderSettings();

      expect(
        screen.getByText('Room owner can interrupt AI response')
      ).toBeInTheDocument();
    });

    it('shows interrupt as enabled by default', () => {
      renderSettings();

      const interruptSwitch = screen.getByRole('switch', {
        name: /Allow interrupt/i,
      });
      expect(interruptSwitch).toHaveAttribute('aria-checked', 'true');
    });

    it('calls onSettingsChange when toggling interrupt', async () => {
      const user = userEvent.setup();
      const { mockOnSettingsChange } = renderSettings();

      const interruptSwitch = screen.getByRole('switch', {
        name: /Allow interrupt/i,
      });
      await user.click(interruptSwitch);

      expect(mockOnSettingsChange).toHaveBeenCalledWith(
        expect.objectContaining({ allowInterrupt: false })
      );
    });
  });

  describe('Advanced Queue Settings', () => {
    it('does not show queue settings by default', () => {
      renderSettings();

      expect(screen.queryByText('Queue Settings')).not.toBeInTheDocument();
    });

    it('shows queue settings when showAdvanced is true', () => {
      renderSettings({ showAdvanced: true });

      expect(screen.getByText('Queue Settings')).toBeInTheDocument();
    });

    it('displays enable queue toggle', () => {
      renderSettings({ showAdvanced: true });

      expect(screen.getByText('Enable request queue')).toBeInTheDocument();
    });

    it('shows queue as enabled by default', () => {
      renderSettings({ showAdvanced: true });

      const queueSwitch = screen.getByRole('switch', {
        name: /Enable request queue/i,
      });
      expect(queueSwitch).toHaveAttribute('aria-checked', 'true');
    });

    it('shows max queue size input when queue is enabled', () => {
      renderSettings({ showAdvanced: true });

      expect(screen.getByText('Max queue size')).toBeInTheDocument();
    });

    it('shows queue timeout input when queue is enabled', () => {
      renderSettings({ showAdvanced: true });

      expect(screen.getByText('Queue timeout')).toBeInTheDocument();
    });

    it('hides queue inputs when queue is disabled', async () => {
      const user = userEvent.setup();
      renderSettings({
        showAdvanced: true,
        settings: { ...defaultSettings, enableQueue: false },
      });

      expect(screen.queryByText('Max queue size')).not.toBeInTheDocument();
      expect(screen.queryByText('Queue timeout')).not.toBeInTheDocument();
    });

    it('calls onSettingsChange when toggling queue', async () => {
      const user = userEvent.setup();
      const { mockOnSettingsChange } = renderSettings({ showAdvanced: true });

      const queueSwitch = screen.getByRole('switch', {
        name: /Enable request queue/i,
      });
      await user.click(queueSwitch);

      expect(mockOnSettingsChange).toHaveBeenCalledWith(
        expect.objectContaining({ enableQueue: false })
      );
    });
  });

  describe('Number Inputs', () => {
    it('displays max queue size value', () => {
      renderSettings({ showAdvanced: true });

      const input = screen.getByRole('spinbutton', { name: /Max queue size/i });
      expect(input).toHaveValue(10);
    });

    it('allows incrementing max queue size', async () => {
      const user = userEvent.setup();
      const { mockOnSettingsChange } = renderSettings({ showAdvanced: true });

      const incrementButton = screen.getByRole('button', {
        name: 'Increase Max queue size',
      });
      await user.click(incrementButton);

      expect(mockOnSettingsChange).toHaveBeenCalledWith(
        expect.objectContaining({ maxQueueSize: 11 })
      );
    });

    it('allows decrementing max queue size', async () => {
      const user = userEvent.setup();
      const { mockOnSettingsChange } = renderSettings({ showAdvanced: true });

      const decrementButton = screen.getByRole('button', {
        name: 'Decrease Max queue size',
      });
      await user.click(decrementButton);

      expect(mockOnSettingsChange).toHaveBeenCalledWith(
        expect.objectContaining({ maxQueueSize: 9 })
      );
    });

    it('does not go below minimum value', async () => {
      const user = userEvent.setup();
      const { mockOnSettingsChange } = renderSettings({
        showAdvanced: true,
        settings: { ...defaultSettings, maxQueueSize: 0 },
      });

      const decrementButton = screen.getByRole('button', {
        name: 'Decrease Max queue size',
      });
      expect(decrementButton).toBeDisabled();
    });

    it('displays queue timeout in seconds', () => {
      renderSettings({ showAdvanced: true });

      const input = screen.getByRole('spinbutton', { name: /Queue timeout/i });
      expect(input).toHaveValue(30); // 30000ms = 30 seconds
    });
  });

  describe('Layout Modes', () => {
    it('uses expanded layout by default', () => {
      const { container } = renderSettings();

      // Expanded layout uses 3-column grid
      expect(container.querySelector('.grid-cols-3')).toBeInTheDocument();
    });

    it('uses single column in compact layout', () => {
      const { container } = renderSettings({ layout: 'compact' });

      expect(container.querySelector('.grid-cols-1')).toBeInTheDocument();
      expect(container.querySelector('.grid-cols-3')).not.toBeInTheDocument();
    });
  });

  describe('Saving State', () => {
    it('shows saving indicator when isSaving is true', () => {
      renderSettings({ isSaving: true });

      expect(screen.getByText('Saving...')).toBeInTheDocument();
    });

    it('disables all inputs when saving', () => {
      renderSettings({ isSaving: true });

      const lockSwitch = screen.getByRole('switch', {
        name: /Lock during AI response/i,
      });
      expect(lockSwitch).toBeDisabled();
    });

    it('does not show saving indicator when not saving', () => {
      renderSettings({ isSaving: false });

      expect(screen.queryByText('Saving...')).not.toBeInTheDocument();
    });
  });

  describe('Changes Pending Indicator', () => {
    it('does not show changes pending initially', () => {
      renderSettings();

      expect(screen.queryByText('Changes pending')).not.toBeInTheDocument();
    });

    it('shows changes pending after making a change', async () => {
      const user = userEvent.setup();
      renderSettings();

      const lockSwitch = screen.getByRole('switch', {
        name: /Lock during AI response/i,
      });
      await user.click(lockSwitch);

      expect(screen.getByText('Changes pending')).toBeInTheDocument();
    });

    it('does not show changes pending while saving', async () => {
      const user = userEvent.setup();
      const { rerender } = render(
        <VoiceModeSettings
          settings={defaultSettings}
          onSettingsChange={vi.fn()}
          isSaving={true}
        />
      );

      expect(screen.queryByText('Changes pending')).not.toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('has radiogroup for voice mode selection', () => {
      renderSettings();

      expect(screen.getByRole('radiogroup')).toBeInTheDocument();
    });

    it('has proper switch roles for toggles', () => {
      renderSettings();

      const switches = screen.getAllByRole('switch');
      expect(switches.length).toBeGreaterThan(0);
    });

    it('has proper button labels', () => {
      renderSettings();

      expect(
        screen.getByRole('button', { name: /Open/i })
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: /Push to Talk/i })
      ).toBeInTheDocument();
    });

    it('associates labels with toggle inputs', () => {
      renderSettings();

      const lockSwitch = screen.getByRole('switch', {
        name: /Lock during AI response/i,
      });
      expect(lockSwitch).toHaveAccessibleName();
    });
  });

  describe('Custom Styling', () => {
    it('applies custom className', () => {
      renderSettings({ className: 'my-custom-class' });

      const panel = screen.getByTestId('voice-mode-settings');
      expect(panel).toHaveClass('my-custom-class');
    });

    it('applies base styles', () => {
      const { container } = renderSettings();

      expect(container.querySelector('.rounded-lg')).toBeInTheDocument();
    });
  });
});

describe('VoiceModeSettingsCompact', () => {
  it('renders with compact layout', () => {
    const { container } = render(
      <VoiceModeSettingsCompact
        settings={defaultSettings}
        onSettingsChange={vi.fn()}
      />
    );

    expect(container.querySelector('.grid-cols-1')).toBeInTheDocument();
  });

  it('does not show advanced settings', () => {
    render(
      <VoiceModeSettingsCompact
        settings={defaultSettings}
        onSettingsChange={vi.fn()}
      />
    );

    expect(screen.queryByText('Queue Settings')).not.toBeInTheDocument();
  });

  it('passes through other props', () => {
    render(
      <VoiceModeSettingsCompact
        settings={defaultSettings}
        onSettingsChange={vi.fn()}
        canEdit={false}
      />
    );

    expect(
      screen.getByText('Only the room owner can change these settings')
    ).toBeInTheDocument();
  });
});

describe('VoiceModeSettingsFull', () => {
  it('shows advanced settings by default', () => {
    render(
      <VoiceModeSettingsFull
        settings={defaultSettings}
        onSettingsChange={vi.fn()}
      />
    );

    expect(screen.getByText('Queue Settings')).toBeInTheDocument();
  });

  it('uses expanded layout', () => {
    const { container } = render(
      <VoiceModeSettingsFull
        settings={defaultSettings}
        onSettingsChange={vi.fn()}
      />
    );

    expect(container.querySelector('.grid-cols-3')).toBeInTheDocument();
  });

  it('passes through other props', () => {
    render(
      <VoiceModeSettingsFull
        settings={defaultSettings}
        onSettingsChange={vi.fn()}
        isSaving={true}
      />
    );

    expect(screen.getByText('Saving...')).toBeInTheDocument();
  });
});

describe('Settings Persistence', () => {
  it('preserves unchanged settings when updating', async () => {
    const user = userEvent.setup();
    const mockOnSettingsChange = vi.fn();
    render(
      <VoiceModeSettings
        settings={defaultSettings}
        onSettingsChange={mockOnSettingsChange}
      />
    );

    // Change just the mode
    const openButton = screen.getByRole('button', { name: /Open/i });
    await user.click(openButton);

    // Verify other settings are preserved
    expect(mockOnSettingsChange).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'open',
        lockDuringResponse: true, // preserved
        enableQueue: true, // preserved
        enablePeerAudio: true, // preserved
        allowInterrupt: true, // preserved
      })
    );
  });

  it('initializes with settings from props', () => {
    render(
      <VoiceModeSettings
        settings={{ ...defaultSettings, mode: 'open' }}
        onSettingsChange={vi.fn()}
      />
    );

    const openButton = screen.getByRole('button', { name: /Open/i });
    expect(openButton).toHaveAttribute('aria-pressed', 'true');

    const pttButton = screen.getByRole('button', { name: /Push to Talk/i });
    expect(pttButton).toHaveAttribute('aria-pressed', 'false');
  });
});

describe('Mode-Specific Behavior', () => {
  it('shows designated speaker UI only in designatedSpeaker mode', async () => {
    const user = userEvent.setup();
    const availablePeers = [{ id: 'peer-1', displayName: 'Test User' }];

    render(
      <VoiceModeSettings
        settings={{ ...defaultSettings, mode: 'pushToTalk' }}
        onSettingsChange={vi.fn()}
        availablePeers={availablePeers}
      />
    );

    // Initially in pushToTalk mode, no designated speakers UI
    expect(screen.queryByText('Designated Speakers')).not.toBeInTheDocument();

    // Click on designated speaker mode
    const designatedButton = screen.getByRole('button', {
      name: /Designated Speaker/i,
    });
    await user.click(designatedButton);

    // Now the designated speakers selector should appear
    expect(screen.getByText('Designated Speakers')).toBeInTheDocument();
  });

  it('hides designated speaker UI when switching away', async () => {
    const user = userEvent.setup();
    const availablePeers = [{ id: 'peer-1', displayName: 'Test User' }];

    render(
      <VoiceModeSettings
        settings={{ ...defaultSettings, mode: 'designatedSpeaker' }}
        onSettingsChange={vi.fn()}
        availablePeers={availablePeers}
      />
    );

    // Initially in designatedSpeaker mode
    expect(screen.getByText('Designated Speakers')).toBeInTheDocument();

    // Switch to Open mode
    const openButton = screen.getByRole('button', { name: /Open/i });
    await user.click(openButton);

    // Designated speakers UI should be hidden
    expect(screen.queryByText('Designated Speakers')).not.toBeInTheDocument();
  });
});
