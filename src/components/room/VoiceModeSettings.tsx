/**
 * VoiceModeSettings Component
 *
 * Settings panel for configuring voice mode options in a room.
 * Includes mode selection, AI response locking, and peer audio settings.
 *
 * Part of the Long-Horizon Engineering Protocol - FEAT-156
 */

'use client';

import { useCallback, useState, useMemo, useId } from 'react';
import type { VoiceMode, RoomVoiceSettings } from '@/types/voice-mode';
import { DEFAULT_VOICE_SETTINGS } from '@/types/voice-mode';
import type { PeerId } from '@/types/peer';

/**
 * Voice mode option with display info
 */
interface VoiceModeOption {
  value: VoiceMode;
  label: string;
  description: string;
  icon: React.ReactNode;
}

/**
 * VoiceModeSettings props
 */
export interface VoiceModeSettingsProps {
  /** Current voice settings */
  settings: RoomVoiceSettings;
  /** Callback when settings change */
  onSettingsChange: (settings: RoomVoiceSettings) => void;
  /** Whether the user can edit settings (owner/moderator) */
  canEdit?: boolean;
  /** Available peers for designated speaker selection */
  availablePeers?: Array<{ id: PeerId; displayName: string }>;
  /** Whether to show advanced settings */
  showAdvanced?: boolean;
  /** Whether settings are being saved */
  isSaving?: boolean;
  /** Layout mode */
  layout?: 'compact' | 'expanded';
  /** Custom class name */
  className?: string;
}

/**
 * Size configuration
 */
export type VoiceModeSettingsSize = 'sm' | 'md' | 'lg';

/**
 * Microphone icon for Open mode
 */
function MicrophoneIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
      />
    </svg>
  );
}

/**
 * Push-to-talk icon
 */
function PTTIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
      />
    </svg>
  );
}

/**
 * User/designated speaker icon
 */
function UserIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
      />
    </svg>
  );
}

/**
 * Lock icon for AI locking
 */
function LockIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
      />
    </svg>
  );
}

/**
 * Users icon for peer audio
 */
function UsersIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
      />
    </svg>
  );
}

/**
 * Queue icon
 */
function QueueIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M4 6h16M4 10h16M4 14h16M4 18h16"
      />
    </svg>
  );
}

/**
 * Interrupt icon
 */
function InterruptIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
      />
    </svg>
  );
}

/**
 * Check icon
 */
function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M5 13l4 4L19 7"
      />
    </svg>
  );
}

/**
 * Voice mode options with icons
 */
const VOICE_MODE_OPTIONS: VoiceModeOption[] = [
  {
    value: 'open',
    label: 'Open',
    description: 'All audio is sent to AI continuously',
    icon: <MicrophoneIcon className="w-5 h-5" />,
  },
  {
    value: 'pushToTalk',
    label: 'Push to Talk',
    description: 'Hold a button to address AI',
    icon: <PTTIcon className="w-5 h-5" />,
  },
  {
    value: 'designatedSpeaker',
    label: 'Designated Speaker',
    description: 'Only selected users can address AI',
    icon: <UserIcon className="w-5 h-5" />,
  },
];

/**
 * Toggle switch component
 */
function Toggle({
  id,
  checked,
  onChange,
  disabled = false,
  label,
  description,
  icon,
}: {
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  label: string;
  description?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between py-3">
      <div className="flex items-center gap-3">
        {icon && (
          <div className="flex-shrink-0 text-gray-500 dark:text-gray-400">
            {icon}
          </div>
        )}
        <div className="flex flex-col">
          <label
            htmlFor={id}
            className={`text-sm font-medium ${
              disabled
                ? 'text-gray-400 dark:text-gray-500'
                : 'text-gray-900 dark:text-gray-100'
            }`}
          >
            {label}
          </label>
          {description && (
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {description}
            </span>
          )}
        </div>
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
        className={`
          relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer
          rounded-full border-2 border-transparent transition-colors
          duration-200 ease-in-out focus:outline-none focus:ring-2
          focus:ring-blue-500 focus:ring-offset-2
          ${checked ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-600'}
          ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
        `}
      >
        <span
          className={`
            pointer-events-none inline-block h-5 w-5 transform rounded-full
            bg-white shadow ring-0 transition duration-200 ease-in-out
            ${checked ? 'translate-x-5' : 'translate-x-0'}
          `}
        />
      </button>
    </div>
  );
}

/**
 * Mode selection card
 */
function ModeCard({
  mode,
  isSelected,
  onSelect,
  disabled = false,
}: {
  mode: VoiceModeOption;
  isSelected: boolean;
  onSelect: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      className={`
        relative flex flex-col items-center p-4 rounded-lg border-2
        transition-all duration-200 w-full text-left
        ${
          isSelected
            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
            : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
        }
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
      `}
      aria-pressed={isSelected}
    >
      {isSelected && (
        <div className="absolute top-2 right-2 text-blue-500">
          <CheckIcon className="w-5 h-5" />
        </div>
      )}
      <div
        className={`
          mb-2 p-2 rounded-full
          ${isSelected ? 'bg-blue-100 dark:bg-blue-800 text-blue-600 dark:text-blue-300' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'}
        `}
      >
        {mode.icon}
      </div>
      <span
        className={`
          font-medium text-sm
          ${isSelected ? 'text-blue-900 dark:text-blue-100' : 'text-gray-900 dark:text-gray-100'}
        `}
      >
        {mode.label}
      </span>
      <span className="text-xs text-gray-500 dark:text-gray-400 text-center mt-1">
        {mode.description}
      </span>
    </button>
  );
}

/**
 * Number input with increment/decrement
 */
function NumberInput({
  id,
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  disabled = false,
  label,
  unit,
}: {
  id: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  label: string;
  unit?: string;
}) {
  const handleDecrement = useCallback(() => {
    const newValue = Math.max(min, value - step);
    onChange(newValue);
  }, [value, min, step, onChange]);

  const handleIncrement = useCallback(() => {
    const newValue = Math.min(max, value + step);
    onChange(newValue);
  }, [value, max, step, onChange]);

  return (
    <div className="flex items-center justify-between py-2">
      <label
        htmlFor={id}
        className={`text-sm font-medium ${
          disabled
            ? 'text-gray-400 dark:text-gray-500'
            : 'text-gray-900 dark:text-gray-100'
        }`}
      >
        {label}
      </label>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleDecrement}
          disabled={disabled || value <= min}
          className="w-8 h-8 flex items-center justify-center rounded-md
            bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300
            hover:bg-gray-200 dark:hover:bg-gray-600
            disabled:opacity-50 disabled:cursor-not-allowed"
          aria-label={`Decrease ${label}`}
        >
          −
        </button>
        <input
          id={id}
          type="number"
          value={value}
          onChange={(e) => {
            const newValue = Math.min(max, Math.max(min, parseInt(e.target.value) || 0));
            onChange(newValue);
          }}
          min={min}
          max={max}
          disabled={disabled}
          className="w-16 h-8 text-center rounded-md border border-gray-300 dark:border-gray-600
            bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100
            disabled:opacity-50 disabled:cursor-not-allowed
            focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        {unit && (
          <span className="text-sm text-gray-500 dark:text-gray-400 min-w-[24px]">
            {unit}
          </span>
        )}
        <button
          type="button"
          onClick={handleIncrement}
          disabled={disabled || value >= max}
          className="w-8 h-8 flex items-center justify-center rounded-md
            bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300
            hover:bg-gray-200 dark:hover:bg-gray-600
            disabled:opacity-50 disabled:cursor-not-allowed"
          aria-label={`Increase ${label}`}
        >
          +
        </button>
      </div>
    </div>
  );
}

/**
 * Designated speaker selector
 */
function DesignatedSpeakerSelector({
  selectedPeers,
  availablePeers,
  onChange,
  disabled = false,
}: {
  selectedPeers: PeerId[];
  availablePeers: Array<{ id: PeerId; displayName: string }>;
  onChange: (peers: PeerId[]) => void;
  disabled?: boolean;
}) {
  const togglePeer = useCallback(
    (peerId: PeerId) => {
      if (selectedPeers.includes(peerId)) {
        onChange(selectedPeers.filter((id) => id !== peerId));
      } else {
        onChange([...selectedPeers, peerId]);
      }
    },
    [selectedPeers, onChange]
  );

  if (availablePeers.length === 0) {
    return (
      <p className="text-sm text-gray-500 dark:text-gray-400 py-2">
        No participants available
      </p>
    );
  }

  return (
    <div className="space-y-2 py-2">
      <label className="text-sm font-medium text-gray-900 dark:text-gray-100">
        Designated Speakers
      </label>
      <div className="flex flex-wrap gap-2">
        {availablePeers.map((peer) => {
          const isSelected = selectedPeers.includes(peer.id);
          return (
            <button
              key={peer.id}
              type="button"
              onClick={() => !disabled && togglePeer(peer.id)}
              disabled={disabled}
              className={`
                px-3 py-1.5 rounded-full text-sm font-medium
                transition-colors duration-200
                ${
                  isSelected
                    ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 ring-2 ring-blue-500'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                }
                ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
              `}
              aria-pressed={isSelected}
            >
              {peer.displayName}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Settings section wrapper
 */
function SettingsSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="py-4 border-b border-gray-200 dark:border-gray-700 last:border-b-0">
      <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 uppercase tracking-wide mb-3">
        {title}
      </h3>
      {children}
    </div>
  );
}

/**
 * VoiceModeSettings Component
 *
 * Comprehensive settings panel for room voice configuration.
 *
 * @example
 * ```tsx
 * <VoiceModeSettings
 *   settings={roomSettings}
 *   onSettingsChange={handleSettingsChange}
 *   canEdit={isOwner}
 *   availablePeers={participants}
 *   showAdvanced
 * />
 * ```
 */
export function VoiceModeSettings({
  settings,
  onSettingsChange,
  canEdit = true,
  availablePeers = [],
  showAdvanced = false,
  isSaving = false,
  layout = 'expanded',
  className = '',
}: VoiceModeSettingsProps) {
  const [localSettings, setLocalSettings] = useState<RoomVoiceSettings>(settings);
  const uniqueId = useId();

  // Check if settings have changed
  const hasChanges = useMemo(() => {
    return JSON.stringify(localSettings) !== JSON.stringify(settings);
  }, [localSettings, settings]);

  // Update local settings and notify parent
  const updateSettings = useCallback(
    (updates: Partial<RoomVoiceSettings>) => {
      const newSettings = { ...localSettings, ...updates };
      setLocalSettings(newSettings);
      onSettingsChange(newSettings);
    },
    [localSettings, onSettingsChange]
  );

  // Handle mode change
  const handleModeChange = useCallback(
    (mode: VoiceMode) => {
      updateSettings({ mode });
    },
    [updateSettings]
  );

  // Handle toggle changes
  const handleLockToggle = useCallback(
    (checked: boolean) => {
      updateSettings({ lockDuringResponse: checked });
    },
    [updateSettings]
  );

  const handlePeerAudioToggle = useCallback(
    (checked: boolean) => {
      updateSettings({ enablePeerAudio: checked });
    },
    [updateSettings]
  );

  const handleQueueToggle = useCallback(
    (checked: boolean) => {
      updateSettings({ enableQueue: checked });
    },
    [updateSettings]
  );

  const handleInterruptToggle = useCallback(
    (checked: boolean) => {
      updateSettings({ allowInterrupt: checked });
    },
    [updateSettings]
  );

  // Handle number changes
  const handleMaxQueueChange = useCallback(
    (value: number) => {
      updateSettings({ maxQueueSize: value });
    },
    [updateSettings]
  );

  const handleQueueTimeoutChange = useCallback(
    (value: number) => {
      updateSettings({ queueTimeoutMs: value * 1000 }); // Convert to ms
    },
    [updateSettings]
  );

  // Handle designated speakers change
  const handleDesignatedSpeakersChange = useCallback(
    (peers: PeerId[]) => {
      updateSettings({ designatedSpeakers: peers });
    },
    [updateSettings]
  );

  const isCompact = layout === 'compact';
  const disabled = !canEdit || isSaving;

  return (
    <div
      className={`bg-white dark:bg-gray-800 rounded-lg ${className}`}
      role="region"
      aria-label="Voice mode settings"
      data-testid="voice-mode-settings"
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Voice Settings
        </h2>
        {!canEdit && (
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Only the room owner can change these settings
          </p>
        )}
      </div>

      <div className="p-4">
        {/* Voice Mode Selection */}
        <SettingsSection title="Voice Mode">
          <div
            className={`grid gap-3 ${isCompact ? 'grid-cols-1' : 'grid-cols-3'}`}
            role="radiogroup"
            aria-label="Select voice mode"
          >
            {VOICE_MODE_OPTIONS.map((option) => (
              <ModeCard
                key={option.value}
                mode={option}
                isSelected={localSettings.mode === option.value}
                onSelect={() => handleModeChange(option.value)}
                disabled={disabled}
              />
            ))}
          </div>

          {/* Designated Speaker Selection (shown when mode is designatedSpeaker) */}
          {localSettings.mode === 'designatedSpeaker' && (
            <div className="mt-4 pt-3 border-t border-gray-200 dark:border-gray-700">
              <DesignatedSpeakerSelector
                selectedPeers={localSettings.designatedSpeakers || []}
                availablePeers={availablePeers}
                onChange={handleDesignatedSpeakersChange}
                disabled={disabled}
              />
            </div>
          )}
        </SettingsSection>

        {/* Core Settings */}
        <SettingsSection title="Behavior">
          <Toggle
            id={`${uniqueId}-lock`}
            checked={localSettings.lockDuringResponse}
            onChange={handleLockToggle}
            disabled={disabled}
            label="Lock during AI response"
            description="Prevent interruptions while AI is speaking"
            icon={<LockIcon className="w-5 h-5" />}
          />

          <Toggle
            id={`${uniqueId}-peer-audio`}
            checked={localSettings.enablePeerAudio}
            onChange={handlePeerAudioToggle}
            disabled={disabled}
            label="Enable peer audio"
            description="Allow participants to hear each other"
            icon={<UsersIcon className="w-5 h-5" />}
          />

          <Toggle
            id={`${uniqueId}-interrupt`}
            checked={localSettings.allowInterrupt}
            onChange={handleInterruptToggle}
            disabled={disabled}
            label="Allow interrupt"
            description="Room owner can interrupt AI response"
            icon={<InterruptIcon className="w-5 h-5" />}
          />
        </SettingsSection>

        {/* Advanced Settings */}
        {showAdvanced && (
          <SettingsSection title="Queue Settings">
            <Toggle
              id={`${uniqueId}-queue`}
              checked={localSettings.enableQueue}
              onChange={handleQueueToggle}
              disabled={disabled}
              label="Enable request queue"
              description="Queue turn requests during AI response"
              icon={<QueueIcon className="w-5 h-5" />}
            />

            {localSettings.enableQueue && (
              <>
                <NumberInput
                  id={`${uniqueId}-max-queue`}
                  value={localSettings.maxQueueSize}
                  onChange={handleMaxQueueChange}
                  min={0}
                  max={50}
                  disabled={disabled}
                  label="Max queue size"
                  unit="(0 = unlimited)"
                />

                <NumberInput
                  id={`${uniqueId}-queue-timeout`}
                  value={Math.round(localSettings.queueTimeoutMs / 1000)}
                  onChange={handleQueueTimeoutChange}
                  min={5}
                  max={120}
                  step={5}
                  disabled={disabled}
                  label="Queue timeout"
                  unit="sec"
                />
              </>
            )}
          </SettingsSection>
        )}

        {/* Save indicator */}
        {isSaving && (
          <div className="flex items-center justify-center py-3 text-sm text-gray-500 dark:text-gray-400">
            <svg className="animate-spin mr-2 h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
                fill="none"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            Saving...
          </div>
        )}

        {/* Changed indicator */}
        {hasChanges && !isSaving && (
          <div className="flex items-center justify-center py-3 text-sm text-blue-600 dark:text-blue-400">
            <span className="w-2 h-2 bg-blue-500 rounded-full mr-2" />
            Changes pending
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Compact settings panel variant
 */
export interface VoiceModeSettingsCompactProps
  extends Omit<VoiceModeSettingsProps, 'layout' | 'showAdvanced'> {}

export function VoiceModeSettingsCompact(props: VoiceModeSettingsCompactProps) {
  return <VoiceModeSettings {...props} layout="compact" showAdvanced={false} />;
}

/**
 * Full settings panel variant with all options
 */
export interface VoiceModeSettingsFullProps
  extends Omit<VoiceModeSettingsProps, 'showAdvanced'> {}

export function VoiceModeSettingsFull(props: VoiceModeSettingsFullProps) {
  return <VoiceModeSettings {...props} showAdvanced={true} />;
}

/**
 * Export default for convenience
 */
export default VoiceModeSettings;
