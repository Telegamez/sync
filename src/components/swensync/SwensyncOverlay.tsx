'use client';

import React, { useEffect, useCallback, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Loader2, AlertCircle } from 'lucide-react';
import { isMobile } from 'react-device-detect';
import { useSwensyncRealtime } from '@/hooks/useSwensyncRealtime';
import { ConnectionStatus } from './ConnectionStatus';
import { SessionTimer } from './SessionTimer';
import { LatencyStopwatch } from './LatencyStopwatch';
import { AudioWaveVisualizer } from './AudioWaveVisualizer';
import { VisualizerModeSwitcher, type VisualizerVariant } from './VisualizerModeSwitcher';
import { formatTime } from '@/lib/utils';

/**
 * Props for the SwensyncOverlay component
 */
export interface SwensyncOverlayProps {
  /** Whether the overlay is open */
  isOpen: boolean;
  /** Callback when overlay should close */
  onClose: () => void;
  /** User's name for personalized greeting (optional) */
  userName?: string;
}

/**
 * SwensyncOverlay - Full-screen overlay for voice conversation
 *
 * Features:
 * - Native WebRTC connection to OpenAI Realtime API
 * - Audio wave visualization
 * - Session timer with auto-disconnect
 * - Turn-by-turn latency tracking
 */
export const SwensyncOverlay: React.FC<SwensyncOverlayProps> = ({
  isOpen,
  onClose,
  userName,
}) => {
  // Track if we're mounted (for portal)
  const [mounted, setMounted] = useState(false);
  // Visualization mode state
  const [visualizerMode, setVisualizerMode] = useState<VisualizerVariant>('bars');
  // Track mobile landscape mode (only true on mobile devices in landscape)
  const [isMobileLandscape, setIsMobileLandscape] = useState(false);
  // Track if on mobile for background images
  const [isMobileDevice, setIsMobileDevice] = useState(false);

  const {
    connectionState,
    connect,
    disconnect,
    error,
    modelAnalyserNode,
    animState,
    isVisualizerActive,
    sessionDuration,
    isSessionExpiring,
    isStopwatchRunning,
    stopwatchElapsed,
    turnLatencies,
  } = useSwensyncRealtime({ userName });

  // Set mounted state for portal
  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  // Detect mobile device and landscape mode
  useEffect(() => {
    const checkOrientation = () => {
      // Only show landscape layout on actual mobile devices
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

  /**
   * Handle ESC key to close overlay
   */
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    },
    [onClose]
  );

  /**
   * Auto-connect when overlay opens
   */
  useEffect(() => {
    if (isOpen && connectionState === 'idle') {
      connect();
    }
  }, [isOpen, connectionState, connect]);

  /**
   * Disconnect when overlay closes
   */
  useEffect(() => {
    if (!isOpen && connectionState === 'connected') {
      disconnect();
    }
  }, [isOpen, connectionState, disconnect]);

  /**
   * Setup keyboard listeners and body scroll lock
   */
  useEffect(() => {
    if (!isOpen) return;

    window.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, handleKeyDown]);

  /**
   * Handle close button click
   */
  const handleClose = useCallback(() => {
    disconnect();
    onClose();
  }, [disconnect, onClose]);

  /**
   * Handle retry connection
   */
  const handleRetry = useCallback(() => {
    disconnect();
    setTimeout(() => {
      connect();
    }, 100);
  }, [disconnect, connect]);

  // Don't render if not open or not mounted
  if (!isOpen || !mounted) return null;

  // Determine background style based on device and orientation
  const getBackgroundImage = () => {
    if (!isMobileDevice) return '/landscape1920X1080.png'; // Desktop
    if (isMobileLandscape) return '/landscape-background.png'; // Mobile landscape
    return '/portrait-background.png'; // Mobile portrait
  };

  const backgroundStyle = {
    backgroundImage: `url(${getBackgroundImage()})`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
  };

  // Use portal to render at document body level
  const overlayContent = (
    <div
      className={`fixed inset-0 z-[9999] flex ${isMobileLandscape ? 'flex-row' : 'flex-col'}`}
      style={backgroundStyle}
      role="dialog"
      aria-modal="true"
      aria-label="Swensync Voice Conversation"
    >
      {/* Portrait/Desktop layout - standard vertical stack */}
      {/* Mobile Landscape layout - left sidebar | content | right sidebar */}

      {/* Header - Portrait/Desktop only, hidden in mobile landscape */}
      {!isMobileLandscape && (
        <div className="flex items-center justify-between p-3 sm:p-4 gap-2">
          {/* Left: Timer and Stopwatch */}
          <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1 overflow-hidden">
            {connectionState === 'connected' && (
              <>
                <SessionTimer
                  duration={sessionDuration}
                  isExpiring={isSessionExpiring}
                />
                <LatencyStopwatch
                  isRunning={isStopwatchRunning}
                  elapsedMs={stopwatchElapsed}
                  turnLatencies={turnLatencies}
                />
              </>
            )}
          </div>

          {/* Right: Close button */}
          <button
            onClick={handleClose}
            className="flex-shrink-0 p-2 rounded-full bg-foreground/10 hover:bg-foreground/20 transition-colors"
            aria-label="Close Swensync"
          >
            <X className="h-6 w-6 text-foreground" />
          </button>
        </div>
      )}

      {/* Left Sidebar - Mobile Landscape only: Close + Timer + Latency */}
      {isMobileLandscape && (
        <div className="flex flex-col items-center justify-center gap-3 p-2 min-w-[70px]">
          <button
            onClick={handleClose}
            className="flex-shrink-0 p-2 rounded-full bg-foreground/10 hover:bg-foreground/20 transition-colors"
            aria-label="Close Swensync"
          >
            <X className="h-5 w-5 text-foreground" />
          </button>

          {connectionState === 'connected' && (
            <>
              <SessionTimer
                duration={sessionDuration}
                isExpiring={isSessionExpiring}
              />
              <LatencyStopwatch
                isRunning={isStopwatchRunning}
                elapsedMs={stopwatchElapsed}
                turnLatencies={turnLatencies}
                compact
              />
            </>
          )}
        </div>
      )}

      {/* Main content area */}
      <div className={`flex-1 flex flex-col items-center ${isMobileLandscape ? 'p-2 justify-start' : 'p-2 sm:p-4 justify-center'}`}>
        {connectionState === 'error' ? (
          // Error state
          <div className="flex flex-col items-center gap-3 sm:gap-4 text-foreground">
            <AlertCircle className="w-12 h-12 sm:w-16 sm:h-16 text-red-400" />
            <h2 className="text-lg sm:text-xl font-semibold">Connection Failed</h2>
            <p className="text-muted-foreground text-center max-w-md text-sm sm:text-base">
              {error?.message || 'Unable to connect. Please try again.'}
            </p>
            <button
              onClick={handleRetry}
              className="px-5 py-2 bg-primary text-primary-foreground hover:opacity-90 rounded-full transition-colors text-sm"
            >
              Retry Connection
            </button>
          </div>
        ) : connectionState === 'connecting' ? (
          // Loading state
          <div className="flex flex-col items-center gap-3 sm:gap-4 text-foreground">
            <Loader2 className="w-12 h-12 sm:w-16 sm:h-16 animate-spin text-primary" />
            <h2 className="text-lg sm:text-xl font-semibold">Connecting to Swensync</h2>
            <p className="text-muted-foreground text-sm">Please wait...</p>
          </div>
        ) : (
          // Connected - show visualizer
          <div className={`w-full max-w-4xl h-full flex flex-col ${isMobileLandscape ? 'justify-start' : 'justify-center'}`}>
            {/* State indicator - at top for all layouts (mobile landscape, mobile portrait, desktop) */}
            <div className={`text-center ${isMobileLandscape ? 'pt-2 pb-2' : 'pb-4 sm:pb-6'}`}>
              <span className={`text-muted-foreground ${isMobileLandscape ? 'text-sm' : 'text-base sm:text-lg'}`}>
                {animState === 'Listening' && 'Listening...'}
                {animState === 'Focused' && 'Hearing you...'}
                {animState === 'Thinking' && 'Thinking...'}
                {animState === 'Speaking' && 'Speaking...'}
              </span>
            </div>

            <AudioWaveVisualizer
              analyserNode={modelAnalyserNode}
              isActive={isVisualizerActive}
              animState={animState}
              variant={visualizerMode}
            />
          </div>
        )}
      </div>

      {/* Right Sidebar / Footer - Portrait/Desktop: bottom, Mobile Landscape: right sidebar */}
      <div className={`flex flex-col items-center ${
        isMobileLandscape
          ? 'p-2 justify-center gap-3 min-w-[60px]'
          : 'p-3 pb-5 sm:p-4 sm:pb-6 gap-2 sm:gap-3'
      }`}>
        {/* Visualizer mode switcher */}
        {connectionState === 'connected' && (
          <VisualizerModeSwitcher
            value={visualizerMode}
            onChange={setVisualizerMode}
            compact={isMobileLandscape}
          />
        )}

        {/* Connection status - only when not connected */}
        {connectionState !== 'connected' && (
          <ConnectionStatus state={connectionState} error={error} />
        )}
      </div>

      {/* Expiring session warning */}
      {isSessionExpiring && connectionState === 'connected' && (
        <div className={`absolute left-1/2 -translate-x-1/2 px-3 py-1.5 sm:px-4 sm:py-2 bg-orange-500/30 border border-orange-400/50 rounded-lg text-orange-200 text-xs sm:text-sm ${
          isMobileLandscape ? 'top-2' : 'top-16 sm:top-20'
        }`}>
          Session ending in {formatTime(10 * 60 - sessionDuration)}
        </div>
      )}
    </div>
  );

  // Render through portal to document body
  return createPortal(overlayContent, document.body);
};

export default SwensyncOverlay;
