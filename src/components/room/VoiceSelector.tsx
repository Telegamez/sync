/**
 * VoiceSelector Component
 *
 * Allows users to select and preview AI voices during room creation.
 * Fetches available voices from the API based on the active voice AI provider.
 *
 * Part of the Long-Horizon Engineering Protocol - FEAT-1007
 */

"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { Volume2, Loader2, Play, Pause, User, Check } from "lucide-react";
import type { VoiceInfo, VoiceOption } from "@/types/voice-ai-provider";

/**
 * Props for the VoiceSelector component
 */
export interface VoiceSelectorProps {
  /** Currently selected voice */
  value: VoiceOption | undefined;
  /** Callback when voice selection changes */
  onChange: (voice: VoiceOption) => void;
  /** Whether the selector is disabled */
  disabled?: boolean;
  /** Custom class name */
  className?: string;
}

/**
 * Voice API response type
 */
interface VoicesResponse {
  provider: string;
  providerName: string;
  voices: VoiceInfo[];
  defaultVoice: string;
}

/**
 * Style badge colors
 */
const STYLE_COLORS = {
  feminine: "bg-pink-500/20 text-pink-300",
  masculine: "bg-blue-500/20 text-blue-300",
  neutral: "bg-purple-500/20 text-purple-300",
};

/**
 * VoiceSelector Component
 *
 * Displays available voices for the current provider with preview functionality.
 *
 * @example
 * ```tsx
 * <VoiceSelector
 *   value={selectedVoice}
 *   onChange={(voice) => setSelectedVoice(voice)}
 * />
 * ```
 */
export function VoiceSelector({
  value,
  onChange,
  disabled = false,
  className = "",
}: VoiceSelectorProps) {
  // State
  const [voices, setVoices] = useState<VoiceInfo[]>([]);
  const [providerName, setProviderName] = useState<string>("");
  const [defaultVoice, setDefaultVoice] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadingVoice, setLoadingVoice] = useState<string | null>(null);
  const [playingVoice, setPlayingVoice] = useState<string | null>(null);

  // Audio ref for preview
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);

  /**
   * Fetch available voices from API
   */
  useEffect(() => {
    async function fetchVoices() {
      try {
        setIsLoading(true);
        setError(null);

        const response = await fetch("/api/voices");
        if (!response.ok) {
          throw new Error("Failed to fetch voices");
        }

        const data: VoicesResponse = await response.json();
        setVoices(data.voices);
        setProviderName(data.providerName);
        setDefaultVoice(data.defaultVoice);

        // Set default voice if none selected
        if (!value && data.defaultVoice) {
          onChange(data.defaultVoice as VoiceOption);
        }
      } catch (err) {
        console.error("[VoiceSelector] Error fetching voices:", err);
        setError("Failed to load voices");
      } finally {
        setIsLoading(false);
      }
    }

    fetchVoices();
  }, [value, onChange]);

  /**
   * Stop any current preview
   */
  const stopPreview = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
    setLoadingVoice(null);
    setPlayingVoice(null);
  }, []);

  /**
   * Handle voice preview using on-demand TTS API
   */
  const handlePreview = useCallback(
    async (voice: VoiceInfo) => {
      if (disabled) return;

      // If already playing this voice, stop it
      if (playingVoice === voice.id || loadingVoice === voice.id) {
        stopPreview();
        return;
      }

      // Stop any current preview
      stopPreview();

      // Start loading state
      setLoadingVoice(voice.id);

      try {
        // Fetch preview audio from our API
        const response = await fetch(`/api/voices/preview?voice=${voice.id}`);

        if (!response.ok) {
          throw new Error("Failed to load preview");
        }

        // Create blob URL for audio
        const audioBlob = await response.blob();
        const audioUrl = URL.createObjectURL(audioBlob);
        audioUrlRef.current = audioUrl;

        const audio = new Audio(audioUrl);
        audioRef.current = audio;

        audio.onended = () => {
          stopPreview();
        };

        audio.onerror = () => {
          stopPreview();
        };

        // Switch from loading to playing
        setLoadingVoice(null);
        setPlayingVoice(voice.id);
        await audio.play();
      } catch (err) {
        console.error(`[VoiceSelector] Preview error for ${voice.name}:`, err);
        stopPreview();
      }
    },
    [disabled, playingVoice, loadingVoice, stopPreview],
  );

  /**
   * Handle voice selection
   */
  const handleSelect = useCallback(
    (voice: VoiceInfo) => {
      if (disabled) return;
      onChange(voice.id);
    },
    [disabled, onChange],
  );

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      stopPreview();
    };
  }, [stopPreview]);

  // Loading state
  if (isLoading) {
    return (
      <div className={`flex items-center justify-center py-8 ${className}`}>
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-muted-foreground">Loading voices...</span>
      </div>
    );
  }

  // Error state
  if (error) {
    return <div className={`text-red-400 py-4 ${className}`}>{error}</div>;
  }

  return (
    <div className={`flex flex-col gap-3 ${className}`}>
      {/* Provider info */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Volume2 className="w-3 h-3" />
        <span>Voices from {providerName}</span>
      </div>

      {/* Voice grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {voices.map((voice) => {
          const isSelected = value === voice.id;
          const isLoading = loadingVoice === voice.id;
          const isPlaying = playingVoice === voice.id;
          const isActive = isLoading || isPlaying;
          const isOtherActive =
            (loadingVoice !== null || playingVoice !== null) && !isActive;

          return (
            <button
              key={voice.id}
              type="button"
              onClick={() => handleSelect(voice)}
              disabled={disabled}
              className={`relative flex flex-col items-start p-3 border rounded-lg text-left transition-all ${
                isSelected
                  ? "border-primary bg-primary/10 ring-2 ring-primary/50"
                  : "border-border hover:border-primary/50 hover:bg-muted/50"
              } ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
              aria-pressed={isSelected}
            >
              {/* Selected indicator */}
              {isSelected && (
                <div className="absolute top-2 right-2">
                  <Check className="w-4 h-4 text-primary" />
                </div>
              )}

              {/* Voice header */}
              <div className="flex items-center gap-2 w-full pr-6">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center ${
                    isSelected ? "bg-primary/20" : "bg-muted"
                  }`}
                >
                  <User className="w-4 h-4 text-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <span className="font-medium text-sm text-foreground block truncate">
                    {voice.name}
                  </span>
                  <span
                    className={`text-xs px-1.5 py-0.5 rounded ${STYLE_COLORS[voice.style]}`}
                  >
                    {voice.style}
                  </span>
                </div>
              </div>

              {/* Description */}
              <p className="text-xs text-muted-foreground mt-2 line-clamp-2">
                {voice.description}
              </p>

              {/* Preview button - always shown, uses on-demand TTS */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handlePreview(voice);
                }}
                disabled={disabled || isOtherActive}
                className={`mt-2 flex items-center gap-1 text-xs px-2 py-1 rounded transition-colors ${
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted hover:bg-muted/80 text-muted-foreground disabled:opacity-50"
                }`}
                aria-label={
                  isPlaying
                    ? `Stop preview of ${voice.name}`
                    : `Preview ${voice.name}`
                }
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Loading...
                  </>
                ) : isPlaying ? (
                  <>
                    <Pause className="w-3 h-3" />
                    Stop
                  </>
                ) : (
                  <>
                    <Play className="w-3 h-3" />
                    Preview
                  </>
                )}
              </button>
            </button>
          );
        })}
      </div>

      {/* Default voice hint */}
      {!value && defaultVoice && (
        <p className="text-xs text-muted-foreground">
          Default voice:{" "}
          {voices.find((v) => v.id === defaultVoice)?.name || defaultVoice}
        </p>
      )}
    </div>
  );
}

export default VoiceSelector;
