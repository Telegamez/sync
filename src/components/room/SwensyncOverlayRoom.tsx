/**
 * SwensyncOverlayRoom Component
 *
 * Enhanced full-screen overlay for multi-peer room voice conversations.
 * Displays shared AI state, current speaker, and room-specific controls.
 *
 * Part of the Long-Horizon Engineering Protocol - FEAT-306
 */

'use client';

import React, { useEffect, useCallback, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { X, Loader2, AlertCircle, Users, Settings, Volume2, VolumeX } from 'lucide-react';
import { isMobile } from 'react-device-detect';
import { AudioWaveVisualizer } from '@/components/swensync/AudioWaveVisualizer';
import { VisualizerModeSwitcher, type VisualizerVariant } from '@/components/swensync/VisualizerModeSwitcher';
import { SessionTimer } from '@/components/swensync/SessionTimer';
import { AIStateIndicator, AIStateBadge } from './AIStateIndicator';
import { SpeakingIndicator, type SpeakerInfo } from './SpeakingIndicator';
import { ParticipantAvatar } from './ParticipantAvatar';
import { PTTButton, MainPTTButton } from './PTTButton';
import type { AIResponseState } from '@/types/voice-mode';
import type { PeerId } from '@/types/peer';
import type { RoomId } from '@/types/room';

/**
 * Participant info for room overlay
 */
export interface RoomParticipant {
  /** Peer ID */
  id: PeerId;
  /** Display name */
  displayName: string;
  /** Avatar URL */
  avatarUrl?: string;
  /** Whether currently speaking */
  isSpeaking?: boolean;
  /** Audio level (0-1) */
  audioLevel?: number;
  /** Whether muted */
  isMuted?: boolean;
  /** Whether this is the local user */
  isLocal?: boolean;
  /** Whether currently addressing AI */
  isAddressingAI?: boolean;
}

/**
 * AI session info for room overlay
 */
export interface RoomAISession {
  /** Current AI state */
  state: AIResponseState;
  /** Whether session is healthy */
  isHealthy: boolean;
  /** Session duration in seconds */
  sessionDuration: number;
  /** Whether session is expiring soon */
  isExpiring: boolean;
  /** Current speaker ID (who AI is responding to) */
  currentSpeakerId?: PeerId | null;
  /** Current speaker name */
  currentSpeakerName?: string;
  /** Queue position (0 = not in queue) */
  queuePosition: number;
  /** Total queue length */
  queueLength: number;
  /** Last error */
  lastError?: string | null;
}

/**
 * Room overlay connection state
 */
export type RoomOverlayConnectionState = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'error';

/**
 * SwensyncOverlayRoom props
 */
export interface SwensyncOverlayRoomProps {
  /** Whether the overlay is open */
  isOpen: boolean;
  /** Callback when overlay should close */
  onClose: () => void;
  /** Room ID */
  roomId: RoomId;
  /** Room name */
  roomName?: string;
  /** Local peer ID */
  localPeerId?: PeerId;
  /** Connection state */
  connectionState: RoomOverlayConnectionState;
  /** Connection error */
  error?: Error | null;
  /** Room participants */
  participants: RoomParticipant[];
  /** AI session info */
  aiSession: RoomAISession;
  /** Audio analyser node for visualization */
  analyserNode?: AnalyserNode | null;
  /** Whether visualizer is active */
  isVisualizerActive?: boolean;
  /** Callback to connect */
  onConnect?: () => void;
  /** Callback to disconnect */
  onDisconnect?: () => void;
  /** Callback to retry connection */
  onRetry?: () => void;
  /** Callback when PTT starts */
  onPTTStart?: () => void;
  /** Callback when PTT ends */
  onPTTEnd?: () => void;
  /** Callback to toggle mute */
  onToggleMute?: () => void;
  /** Whether local user is muted */
  isLocalMuted?: boolean;
  /** Callback to open settings */
  onOpenSettings?: () => void;
  /** Callback to show participants */
  onShowParticipants?: () => void;
  /** Whether to show PTT button */
  showPTT?: boolean;
  /** Whether local user is designated speaker */
  isDesignatedSpeaker?: boolean;
  /** Maximum participants to show in header */
  maxHeaderParticipants?: number;
}

/**
 * Format time as MM:SS
 */
function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * SwensyncOverlayRoom - Enhanced overlay for multi-peer rooms
 */
export const SwensyncOverlayRoom: React.FC<SwensyncOverlayRoomProps> = ({
  isOpen,
  onClose,
  roomId,
  roomName = 'Room',
  localPeerId,
  connectionState,
  error,
  participants,
  aiSession,
  analyserNode,
  isVisualizerActive = false,
  onConnect,
  onDisconnect,
  onRetry,
  onPTTStart,
  onPTTEnd,
  onToggleMute,
  isLocalMuted = false,
  onOpenSettings,
  onShowParticipants,
  showPTT = true,
  isDesignatedSpeaker = true,
  maxHeaderParticipants = 4,
}) => {
  // Track if we're mounted (for portal)
  const [mounted, setMounted] = useState(false);
  // Visualization mode state
  const [visualizerMode, setVisualizerMode] = useState<VisualizerVariant>('bars');
  // Track mobile landscape mode
  const [isMobileLandscape, setIsMobileLandscape] = useState(false);
  const [isMobileDevice, setIsMobileDevice] = useState(false);

  // Set mounted state for portal
  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  // Detect mobile device and landscape mode
  useEffect(() => {
    const checkOrientation = () => {
      const isLandscape = window.innerWidth > window.innerHeight;
      setIsMobileLandscape(isMobile && isLandscape);
      setIsMobileDevice(isMobile);
    };

    checkOrientation();
    window.addEventListener('resize', checkOrientation);
    window.addEventListener('orientationchange', checkOrientation);

    return () => {
      window.removeEventListener('resize', checkOrientation);
      window.removeEventListener('orientationchange', checkOrientation);
    };
  }, []);

  // Handle ESC key to close overlay
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    },
    [onClose]
  );

  // Auto-connect when overlay opens
  useEffect(() => {
    if (isOpen && connectionState === 'idle' && onConnect) {
      onConnect();
    }
  }, [isOpen, connectionState, onConnect]);

  // Disconnect when overlay closes
  useEffect(() => {
    if (!isOpen && connectionState === 'connected' && onDisconnect) {
      onDisconnect();
    }
  }, [isOpen, connectionState, onDisconnect]);

  // Setup keyboard listeners and body scroll lock
  useEffect(() => {
    if (!isOpen) return;

    window.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, handleKeyDown]);

  // Handle close button click
  const handleClose = useCallback(() => {
    onDisconnect?.();
    onClose();
  }, [onDisconnect, onClose]);

  // Handle retry connection
  const handleRetry = useCallback(() => {
    onRetry?.();
  }, [onRetry]);

  // Get currently speaking participants
  const speakers = useMemo((): SpeakerInfo[] => {
    return participants
      .filter((p) => p.isSpeaking)
      .map((p) => ({
        id: p.id,
        displayName: p.displayName,
        avatarUrl: p.avatarUrl,
        audioLevel: p.audioLevel,
        isLocal: p.isLocal,
      }));
  }, [participants]);

  // Get participant who AI is responding to
  const respondingToParticipant = useMemo(() => {
    if (!aiSession.currentSpeakerId) return null;
    return participants.find((p) => p.id === aiSession.currentSpeakerId);
  }, [aiSession.currentSpeakerId, participants]);

  // Check if local user is current speaker
  const isLocalCurrentSpeaker = localPeerId === aiSession.currentSpeakerId;

  // Get animation state for visualizer
  const animState = useMemo(() => {
    switch (aiSession.state) {
      case 'listening':
        return 'Listening';
      case 'processing':
        return 'Thinking';
      case 'speaking':
        return 'Speaking';
      default:
        return 'Listening';
    }
  }, [aiSession.state]);

  // Don't render if not open or not mounted
  if (!isOpen || !mounted) return null;

  // Determine background style
  const getBackgroundImage = () => {
    if (!isMobileDevice) return '/landscape1920X1080.png';
    if (isMobileLandscape) return '/landscape-background.png';
    return '/portrait-background.png';
  };

  const backgroundStyle = {
    backgroundImage: `url(${getBackgroundImage()})`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
  };

  // Render header participants (compact avatars)
  const renderHeaderParticipants = () => {
    const visibleParticipants = participants.slice(0, maxHeaderParticipants);
    const overflow = participants.length - maxHeaderParticipants;

    return (
      <div className="flex items-center -space-x-2">
        {visibleParticipants.map((p) => (
          <ParticipantAvatar
            key={p.id}
            displayName={p.displayName}
            avatarUrl={p.avatarUrl}
            size="xs"
            isSpeaking={p.isSpeaking}
            isMuted={p.isMuted}
            isLocal={p.isLocal}
            audioLevel={p.audioLevel}
            className="ring-2 ring-background"
          />
        ))}
        {overflow > 0 && (
          <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-xs ring-2 ring-background">
            +{overflow}
          </div>
        )}
      </div>
    );
  };

  // Render main content based on connection state
  const renderContent = () => {
    if (connectionState === 'error') {
      return (
        <div className="flex flex-col items-center gap-3 sm:gap-4 text-foreground">
          <AlertCircle className="w-12 h-12 sm:w-16 sm:h-16 text-red-400" />
          <h2 className="text-lg sm:text-xl font-semibold">Connection Failed</h2>
          <p className="text-muted-foreground text-center max-w-md text-sm sm:text-base">
            {error?.message || aiSession.lastError || 'Unable to connect. Please try again.'}
          </p>
          <button
            onClick={handleRetry}
            className="px-5 py-2 bg-primary text-primary-foreground hover:opacity-90 rounded-full transition-colors text-sm"
          >
            Retry Connection
          </button>
        </div>
      );
    }

    if (connectionState === 'connecting' || connectionState === 'reconnecting') {
      return (
        <div className="flex flex-col items-center gap-3 sm:gap-4 text-foreground">
          <Loader2 className="w-12 h-12 sm:w-16 sm:h-16 animate-spin text-primary" />
          <h2 className="text-lg sm:text-xl font-semibold">
            {connectionState === 'reconnecting' ? 'Reconnecting...' : 'Connecting to Room'}
          </h2>
          <p className="text-muted-foreground text-sm">{roomName}</p>
        </div>
      );
    }

    // Connected - show room content
    return (
      <div className={`w-full max-w-4xl h-full flex flex-col ${isMobileLandscape ? 'justify-start' : 'justify-center'}`}>
        {/* AI State and Speaker Info */}
        <div className={`text-center ${isMobileLandscape ? 'pt-2 pb-2' : 'pb-4 sm:pb-6'}`}>
          {/* Who AI is responding to */}
          {aiSession.state === 'speaking' && respondingToParticipant && (
            <div className="flex items-center justify-center gap-2 mb-2">
              <span className="text-muted-foreground text-sm">Responding to</span>
              <ParticipantAvatar
                displayName={respondingToParticipant.displayName}
                avatarUrl={respondingToParticipant.avatarUrl}
                size="xs"
                isLocal={respondingToParticipant.isLocal}
              />
              <span className="text-foreground font-medium">
                {respondingToParticipant.isLocal ? 'you' : respondingToParticipant.displayName}
              </span>
            </div>
          )}

          {/* AI State indicator */}
          <AIStateIndicator
            state={aiSession.state}
            queuePosition={aiSession.queuePosition}
            queueLength={aiSession.queueLength}
            isCurrentSpeaker={isLocalCurrentSpeaker}
            currentSpeakerName={aiSession.currentSpeakerName}
            size="md"
            mode="compact"
            showQueue
            showSpeaker
            animate
          />

          {/* Current speakers */}
          {speakers.length > 0 && aiSession.state === 'listening' && (
            <div className="mt-3">
              <SpeakingIndicator
                speakers={speakers}
                mode="compact"
                showAudioLevel
                maxDisplayed={3}
              />
            </div>
          )}
        </div>

        {/* Audio Visualizer */}
        <AudioWaveVisualizer
          analyserNode={analyserNode}
          isActive={isVisualizerActive}
          animState={animState}
          variant={visualizerMode}
        />
      </div>
    );
  };

  // Use portal to render at document body level
  const overlayContent = (
    <div
      className={`fixed inset-0 z-[9999] flex ${isMobileLandscape ? 'flex-row' : 'flex-col'}`}
      style={backgroundStyle}
      role="dialog"
      aria-modal="true"
      aria-label={`${roomName} Voice Conversation`}
      data-room-id={roomId}
      data-ai-state={aiSession.state}
    >
      {/* Header - Portrait/Desktop only */}
      {!isMobileLandscape && (
        <div className="flex items-center justify-between p-3 sm:p-4 gap-2">
          {/* Left: Room info and participants */}
          <div className="flex items-center gap-3 min-w-0 flex-1 overflow-hidden">
            {/* Session timer */}
            {connectionState === 'connected' && (
              <SessionTimer
                duration={aiSession.sessionDuration}
                isExpiring={aiSession.isExpiring}
              />
            )}

            {/* Room name */}
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-foreground font-medium truncate">{roomName}</span>
              <AIStateBadge state={aiSession.state} />
            </div>

            {/* Participants button */}
            <button
              onClick={onShowParticipants}
              className="flex items-center gap-1 px-2 py-1 rounded-lg bg-foreground/10 hover:bg-foreground/20 transition-colors"
              aria-label={`${participants.length} participants`}
            >
              {renderHeaderParticipants()}
              <span className="text-muted-foreground text-sm ml-1">
                {participants.length}
              </span>
            </button>
          </div>

          {/* Right: Settings and Close */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {onOpenSettings && (
              <button
                onClick={onOpenSettings}
                className="p-2 rounded-full bg-foreground/10 hover:bg-foreground/20 transition-colors"
                aria-label="Room settings"
              >
                <Settings className="h-5 w-5 text-foreground" />
              </button>
            )}
            <button
              onClick={handleClose}
              className="p-2 rounded-full bg-foreground/10 hover:bg-foreground/20 transition-colors"
              aria-label="Leave room"
            >
              <X className="h-6 w-6 text-foreground" />
            </button>
          </div>
        </div>
      )}

      {/* Left Sidebar - Mobile Landscape only */}
      {isMobileLandscape && (
        <div className="flex flex-col items-center justify-center gap-3 p-2 min-w-[70px]">
          <button
            onClick={handleClose}
            className="flex-shrink-0 p-2 rounded-full bg-foreground/10 hover:bg-foreground/20 transition-colors"
            aria-label="Leave room"
          >
            <X className="h-5 w-5 text-foreground" />
          </button>

          {connectionState === 'connected' && (
            <>
              <SessionTimer
                duration={aiSession.sessionDuration}
                isExpiring={aiSession.isExpiring}
              />
              <AIStateBadge state={aiSession.state} />
              <button
                onClick={onShowParticipants}
                className="flex items-center justify-center p-2 rounded-full bg-foreground/10 hover:bg-foreground/20 transition-colors"
                aria-label={`${participants.length} participants`}
              >
                <Users className="h-4 w-4 text-foreground" />
                <span className="text-xs ml-1">{participants.length}</span>
              </button>
            </>
          )}
        </div>
      )}

      {/* Main content area */}
      <div className={`flex-1 flex flex-col items-center ${isMobileLandscape ? 'p-2 justify-start' : 'p-2 sm:p-4 justify-center'}`}>
        {renderContent()}
      </div>

      {/* Footer controls - Portrait/Desktop: bottom, Mobile Landscape: right sidebar */}
      <div className={`flex flex-col items-center ${
        isMobileLandscape
          ? 'p-2 justify-center gap-3 min-w-[80px]'
          : 'p-3 pb-5 sm:p-4 sm:pb-6 gap-3'
      }`}>
        {connectionState === 'connected' && (
          <>
            {/* Room controls row */}
            <div className={`flex items-center ${isMobileLandscape ? 'flex-col gap-2' : 'gap-3'}`}>
              {/* Mute button */}
              {onToggleMute && (
                <button
                  onClick={onToggleMute}
                  className={`p-3 rounded-full transition-colors ${
                    isLocalMuted
                      ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                      : 'bg-foreground/10 text-foreground hover:bg-foreground/20'
                  }`}
                  aria-label={isLocalMuted ? 'Unmute microphone' : 'Mute microphone'}
                  aria-pressed={isLocalMuted}
                >
                  {isLocalMuted ? (
                    <VolumeX className="h-5 w-5" />
                  ) : (
                    <Volume2 className="h-5 w-5" />
                  )}
                </button>
              )}

              {/* PTT button */}
              {showPTT && onPTTStart && onPTTEnd && (
                <MainPTTButton
                  aiState={aiSession.state}
                  isDesignatedSpeaker={isDesignatedSpeaker}
                  onPTTStart={onPTTStart}
                  onPTTEnd={onPTTEnd}
                />
              )}
            </div>

            {/* Visualizer mode switcher */}
            <VisualizerModeSwitcher
              value={visualizerMode}
              onChange={setVisualizerMode}
              compact={isMobileLandscape}
            />
          </>
        )}
      </div>

      {/* Expiring session warning */}
      {aiSession.isExpiring && connectionState === 'connected' && (
        <div className={`absolute left-1/2 -translate-x-1/2 px-3 py-1.5 sm:px-4 sm:py-2 bg-orange-500/30 border border-orange-400/50 rounded-lg text-orange-200 text-xs sm:text-sm ${
          isMobileLandscape ? 'top-2' : 'top-16 sm:top-20'
        }`}>
          Session ending in {formatTime(10 * 60 - aiSession.sessionDuration)}
        </div>
      )}

      {/* Queue position indicator */}
      {aiSession.queuePosition > 0 && connectionState === 'connected' && (
        <div className={`absolute left-1/2 -translate-x-1/2 px-3 py-1.5 bg-blue-500/30 border border-blue-400/50 rounded-lg text-blue-200 text-xs sm:text-sm ${
          isMobileLandscape ? 'bottom-2' : 'bottom-20 sm:bottom-24'
        }`}>
          {aiSession.queuePosition === 1
            ? "You're next"
            : `Position ${aiSession.queuePosition} of ${aiSession.queueLength}`}
        </div>
      )}

      {/* Session unhealthy warning */}
      {!aiSession.isHealthy && connectionState === 'connected' && (
        <div className={`absolute right-4 px-3 py-1.5 bg-red-500/30 border border-red-400/50 rounded-lg text-red-200 text-xs ${
          isMobileLandscape ? 'top-2' : 'top-16 sm:top-20'
        }`}>
          AI connection unstable
        </div>
      )}
    </div>
  );

  // Render through portal to document body
  return createPortal(overlayContent, document.body);
};

/**
 * Default export
 */
export default SwensyncOverlayRoom;
