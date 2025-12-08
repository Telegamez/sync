/**
 * ParticipantModal Component
 *
 * Modal for participant actions when clicking on their avatar.
 * Shows mute participant and rename options for local user,
 * or just mute option for remote participants.
 *
 * Part of the Long-Horizon Engineering Protocol
 */

"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { X, MicOff, Mic, Pencil, Volume2, VolumeX } from "lucide-react";
import type { ParticipantInfo } from "./ParticipantList";

/**
 * ParticipantModal props
 */
export interface ParticipantModalProps {
  /** Whether the modal is open */
  isOpen: boolean;
  /** The participant to show options for */
  participant: ParticipantInfo | null;
  /** Whether this participant is the local user */
  isLocalUser: boolean;
  /** Callback when the modal is closed */
  onClose: () => void;
  /** Callback to toggle mute for the participant (local user's mic) */
  onMuteToggle?: () => void;
  /** Callback to open the username edit modal (local user only) */
  onEditUsername?: () => void;
  /** Callback to mute/unmute remote participant's audio output */
  onMuteRemoteAudio?: (participantId: string, muted: boolean) => void;
  /** Map of participant IDs to their muted audio state (for remote participants) */
  mutedRemoteAudio?: Map<string, boolean>;
}

/**
 * Get initials from display name
 */
function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

/**
 * ParticipantModal Component
 *
 * @example
 * ```tsx
 * <ParticipantModal
 *   isOpen={showModal}
 *   participant={selectedParticipant}
 *   isLocalUser={selectedParticipant?.id === localPeerId}
 *   onClose={() => setShowModal(false)}
 *   onMuteToggle={handleMuteToggle}
 *   onEditUsername={() => setShowUsernameModal(true)}
 * />
 * ```
 */
export function ParticipantModal({
  isOpen,
  participant,
  isLocalUser,
  onClose,
  onMuteToggle,
  onEditUsername,
  onMuteRemoteAudio,
  mutedRemoteAudio,
}: ParticipantModalProps) {
  // Handle escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen, onClose]);

  // Don't render if not open or no participant
  if (!isOpen || !participant) return null;

  const isAI = participant.isAI;
  const isRemoteAudioMuted = participant.id
    ? mutedRemoteAudio?.get(participant.id)
    : false;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="participant-modal-title"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div className="relative bg-card border border-border rounded-lg shadow-lg w-full max-w-xs mx-4 p-5">
        {/* Close button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-3 right-3 text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Participant info header */}
        <div className="flex flex-col items-center mb-4">
          {/* Avatar */}
          {isAI ? (
            <div className="w-16 h-16 bg-purple-500/20 rounded-full flex items-center justify-center border-2 border-purple-500 mb-3">
              <svg
                className="w-8 h-8 text-purple-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z"
                />
              </svg>
            </div>
          ) : (
            <div className="w-16 h-16 bg-primary/20 rounded-full flex items-center justify-center border-2 border-primary text-primary font-semibold text-xl mb-3">
              {getInitials(participant.displayName)}
            </div>
          )}

          {/* Name */}
          <h2
            id="participant-modal-title"
            className="text-lg font-semibold text-foreground text-center"
          >
            {participant.displayName}
            {isLocalUser && (
              <span className="text-muted-foreground font-normal ml-1">
                (You)
              </span>
            )}
          </h2>

          {/* Status */}
          <p className="text-sm text-muted-foreground mt-1">
            {isAI
              ? "AI Assistant"
              : participant.isSpeaking
                ? "Speaking"
                : participant.isMuted
                  ? "Muted"
                  : "Connected"}
          </p>
        </div>

        {/* Actions */}
        <div className="space-y-2">
          {/* Local user actions */}
          {isLocalUser && !isAI && (
            <>
              {/* Mute/Unmute own microphone */}
              {onMuteToggle && (
                <button
                  type="button"
                  onClick={() => {
                    onMuteToggle();
                    onClose();
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-lg bg-muted hover:bg-muted/80 transition-colors"
                >
                  {participant.isMuted ? (
                    <>
                      <Mic className="w-5 h-5 text-green-500" />
                      <span className="text-foreground">Unmute Microphone</span>
                    </>
                  ) : (
                    <>
                      <MicOff className="w-5 h-5 text-red-500" />
                      <span className="text-foreground">Mute Microphone</span>
                    </>
                  )}
                </button>
              )}

              {/* Edit username */}
              {onEditUsername && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onEditUsername();
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-lg bg-muted hover:bg-muted/80 transition-colors"
                >
                  <Pencil className="w-5 h-5 text-primary" />
                  <span className="text-foreground">Change Username</span>
                </button>
              )}
            </>
          )}

          {/* Remote participant actions */}
          {!isLocalUser && !isAI && onMuteRemoteAudio && (
            <button
              type="button"
              onClick={() => {
                onMuteRemoteAudio(participant.id, !isRemoteAudioMuted);
                onClose();
              }}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-lg bg-muted hover:bg-muted/80 transition-colors"
            >
              {isRemoteAudioMuted ? (
                <>
                  <Volume2 className="w-5 h-5 text-green-500" />
                  <span className="text-foreground">Unmute for Me</span>
                </>
              ) : (
                <>
                  <VolumeX className="w-5 h-5 text-red-500" />
                  <span className="text-foreground">Mute for Me</span>
                </>
              )}
            </button>
          )}

          {/* AI participant - no actions available */}
          {isAI && (
            <p className="text-sm text-muted-foreground text-center py-2">
              No actions available for AI assistant
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export default ParticipantModal;
