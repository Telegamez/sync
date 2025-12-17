/**
 * VideoPlayerOverlay Component
 *
 * Full-screen video player overlay with YouTube embed and synchronized playback.
 * Displays video playlist and playback controls for room participants.
 *
 * Part of the Long-Horizon Engineering Protocol - FEAT-802
 *
 * Mobile Autoplay Handling:
 * - Mobile browsers block autoplay with audio due to user interaction requirements
 * - On mobile, we start muted to allow synchronized playback
 * - A prominent "Tap to unmute" banner is shown until user interacts
 * - After any user interaction (tap anywhere), audio is unmuted automatically
 *
 * Positioning:
 * - Mobile: top-[104px] to account for header (64px) + interaction state row (~40px)
 * - Desktop: top-16 (64px) for just the header
 * - Bottom: bottom-40 (160px) to leave space for PTT footer controls
 */

"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  X,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  List,
  Volume1,
} from "lucide-react";
import type { SerperVideoResult } from "@/types/search";
import type { VideoPlaylist, YouTubeVideoId } from "@/types/video";
import { extractYouTubeVideoId, formatSecondsToDuration } from "@/types/video";

/**
 * Detect if the current device is mobile
 * Uses a combination of user agent and touch capability detection
 */
function isMobileDevice(): boolean {
  if (typeof window === "undefined") return false;

  // Check for touch capability
  const hasTouch =
    "ontouchstart" in window ||
    navigator.maxTouchPoints > 0 ||
    (navigator as any).msMaxTouchPoints > 0;

  // Check user agent for mobile indicators
  const mobileUA =
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent,
    );

  // Check for mobile screen width (as additional heuristic)
  const mobileWidth = window.innerWidth <= 768;

  // Consider it mobile if it has touch AND (mobile UA OR mobile width)
  return hasTouch && (mobileUA || mobileWidth);
}

/**
 * YouTube IFrame API player interface
 */
interface YTPlayer {
  playVideo: () => void;
  pauseVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead?: boolean) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  getPlayerState: () => number;
  mute: () => void;
  unMute: () => void;
  isMuted: () => boolean;
  setVolume: (volume: number) => void;
  getVolume: () => number;
  destroy: () => void;
}

/**
 * YouTube player states
 */
const YT_STATE = {
  UNSTARTED: -1,
  ENDED: 0,
  PLAYING: 1,
  PAUSED: 2,
  BUFFERING: 3,
  CUED: 5,
} as const;

/**
 * VideoPlayerOverlay props
 */
export interface VideoPlayerOverlayProps {
  /** Whether the overlay is open */
  isOpen: boolean;
  /** Current playlist */
  playlist: VideoPlaylist | null;
  /** Current video index */
  currentIndex: number;
  /** Target playback time (for sync) */
  currentTime: number;
  /** Whether video should be playing */
  isPlaying: boolean;
  /** Whether video is paused */
  isPaused: boolean;
  /** Sync start timestamp */
  syncedStartTime: number;
  /** Close the player */
  onClose: () => void;
  /** Pause callback */
  onPause: (currentTime: number) => void;
  /** Resume callback */
  onResume: () => void;
  /** Seek callback */
  onSeek: (time: number) => void;
  /** Next video callback */
  onNext: () => void;
  /** Previous video callback */
  onPrevious: (currentTime: number) => void;
  /** Video ended callback */
  onVideoEnd: (videoIndex: number) => void;
  /** Time update callback */
  onTimeUpdate: (time: number) => void;
}

/**
 * Load YouTube IFrame API script
 */
function loadYouTubeAPI(): Promise<void> {
  return new Promise((resolve) => {
    if ((window as any).YT && (window as any).YT.Player) {
      resolve();
      return;
    }

    // Check if script already exists
    if (document.getElementById("youtube-iframe-api")) {
      // Wait for it to load
      const checkYT = setInterval(() => {
        if ((window as any).YT && (window as any).YT.Player) {
          clearInterval(checkYT);
          resolve();
        }
      }, 100);
      return;
    }

    // Create script element
    const script = document.createElement("script");
    script.id = "youtube-iframe-api";
    script.src = "https://www.youtube.com/iframe_api";

    // Set up callback
    (window as any).onYouTubeIframeAPIReady = () => {
      resolve();
    };

    document.body.appendChild(script);
  });
}

/**
 * Playlist item component
 */
function PlaylistItem({
  video,
  index,
  isActive,
  onClick,
}: {
  video: SerperVideoResult;
  index: number;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex gap-3 p-2 rounded-lg transition-colors text-left ${
        isActive
          ? "bg-blue-500/20 border border-blue-500/40"
          : "hover:bg-white/5"
      }`}
    >
      <div className="relative flex-shrink-0 w-20 h-12 bg-gray-800 rounded overflow-hidden">
        {video.imageUrl && (
          <img
            src={video.imageUrl}
            alt=""
            className="w-full h-full object-cover"
            loading="lazy"
          />
        )}
        {video.duration && (
          <span className="absolute bottom-0.5 right-0.5 px-1 py-0.5 text-[10px] bg-black/80 text-white rounded">
            {video.duration}
          </span>
        )}
        <span className="absolute top-0.5 left-0.5 px-1 py-0.5 text-[10px] bg-black/60 text-white rounded">
          {index + 1}
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <h4
          className={`text-sm line-clamp-2 ${isActive ? "text-blue-400" : "text-gray-300"}`}
        >
          {video.title}
        </h4>
        {video.channel && (
          <span className="text-xs text-gray-500 truncate block">
            {video.channel}
          </span>
        )}
      </div>
    </button>
  );
}

/**
 * VideoPlayerOverlay component
 */
export function VideoPlayerOverlay({
  isOpen,
  playlist,
  currentIndex,
  currentTime,
  isPlaying,
  isPaused,
  syncedStartTime,
  onClose,
  onPause,
  onResume,
  onSeek,
  onNext,
  onPrevious,
  onVideoEnd,
  onTimeUpdate,
}: VideoPlayerOverlayProps) {
  const playerContainerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const [isApiReady, setIsApiReady] = useState(false);
  const [localTime, setLocalTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [showPlaylist, setShowPlaylist] = useState(true);
  const timeUpdateRef = useRef<NodeJS.Timeout | null>(null);
  const lastVideoIdRef = useRef<string | null>(null);

  // Mobile autoplay handling state
  // Note: hasUserInteracted is initialized from sessionStorage to persist across player open/close
  // Once a user unmutes, they shouldn't have to do it again for the session
  const [isMobile, setIsMobile] = useState(false);
  const [showUnmuteBanner, setShowUnmuteBanner] = useState(false);
  const [hasUserInteracted, setHasUserInteracted] = useState(() => {
    if (typeof window !== "undefined") {
      const stored =
        sessionStorage.getItem("videoPlayerUserInteracted") === "true";
      console.log(
        `[VideoPlayer] Initialized hasUserInteracted from sessionStorage: ${stored}`,
      );
      return stored;
    }
    return false;
  });
  const mobileAutoMutedRef = useRef(false);
  // Use a ref to track interaction state for player creation (avoids stale closures)
  const hasUserInteractedRef = useRef(hasUserInteracted);

  // Get current video
  const currentVideo = playlist?.videos[currentIndex] || null;
  const videoId = currentVideo
    ? extractYouTubeVideoId(currentVideo.link)
    : null;

  // Keep ref in sync with state
  useEffect(() => {
    hasUserInteractedRef.current = hasUserInteracted;
  }, [hasUserInteracted]);

  // Detect mobile device and set initial muted state
  useEffect(() => {
    if (isOpen) {
      const mobile = isMobileDevice();
      setIsMobile(mobile);

      if (mobile && !hasUserInteractedRef.current) {
        // Mobile: start muted for autoplay compliance
        setIsMuted(true);
        setShowUnmuteBanner(true);
        mobileAutoMutedRef.current = true;
        console.log(
          "[VideoPlayer] Mobile detected - starting muted for autoplay",
        );
      }
    }
  }, [isOpen]);

  // Handle user interaction to enable sound on mobile
  const handleUserInteraction = useCallback(() => {
    if (
      isMobile &&
      !hasUserInteractedRef.current &&
      mobileAutoMutedRef.current
    ) {
      console.log("[VideoPlayer] User interaction detected - unmuting");
      setHasUserInteracted(true);
      hasUserInteractedRef.current = true;
      setShowUnmuteBanner(false);

      // Persist to sessionStorage so subsequent videos play with audio
      try {
        sessionStorage.setItem("videoPlayerUserInteracted", "true");
      } catch (e) {
        // sessionStorage might not be available
      }

      // Unmute the player
      if (playerRef.current) {
        try {
          playerRef.current.unMute();
          setIsMuted(false);
          mobileAutoMutedRef.current = false;
        } catch (e) {
          console.warn("[VideoPlayer] Could not unmute:", e);
        }
      }
    }
  }, [isMobile]);

  // Load YouTube API
  useEffect(() => {
    if (isOpen && !isApiReady) {
      loadYouTubeAPI().then(() => {
        setIsApiReady(true);
      });
    }
  }, [isOpen, isApiReady]);

  // Create/update player when video changes
  useEffect(() => {
    if (!isOpen || !isApiReady || !videoId || !playerContainerRef.current) {
      return;
    }

    // If same video, just sync time
    if (playerRef.current && lastVideoIdRef.current === videoId) {
      return;
    }

    // Destroy old player
    if (playerRef.current) {
      try {
        playerRef.current.destroy();
      } catch (e) {
        // Ignore
      }
      playerRef.current = null;
    }

    lastVideoIdRef.current = videoId;

    // Create container
    const containerId = "youtube-player-" + Date.now();
    const playerDiv = document.createElement("div");
    playerDiv.id = containerId;
    playerContainerRef.current.innerHTML = "";
    playerContainerRef.current.appendChild(playerDiv);

    // Calculate start time based on sync
    let startSeconds = 0;
    if (syncedStartTime > 0 && isPlaying) {
      const elapsedMs = Date.now() - syncedStartTime;
      startSeconds = currentTime + elapsedMs / 1000;
    } else {
      startSeconds = currentTime;
    }

    // Check if we need to start muted for mobile autoplay
    // Use ref to get latest interaction state (avoids stale closures and unnecessary re-renders)
    const shouldStartMuted = isMobileDevice() && !hasUserInteractedRef.current;
    console.log(
      `[VideoPlayer] Creating player for video ${videoId}: isMobile=${isMobileDevice()}, hasUserInteracted=${hasUserInteractedRef.current}, shouldStartMuted=${shouldStartMuted}`,
    );

    // Create new player
    const YT = (window as any).YT;
    playerRef.current = new YT.Player(containerId, {
      videoId,
      width: "100%",
      height: "100%",
      playerVars: {
        autoplay: isPlaying ? 1 : 0,
        start: Math.floor(startSeconds),
        enablejsapi: 1,
        modestbranding: 1,
        rel: 0,
        playsinline: 1,
        origin: window.location.origin,
        // Mute on mobile for autoplay compliance
        mute: shouldStartMuted ? 1 : 0,
      },
      events: {
        onReady: (event: any) => {
          const player = event.target as YTPlayer;
          setDuration(player.getDuration());

          // Check CURRENT interaction state (not stale closure value)
          // User may have interacted while player was being created
          const currentlyNeedsMute =
            isMobileDevice() && !hasUserInteractedRef.current;
          console.log(
            `[VideoPlayer] onReady: isMobile=${isMobileDevice()}, hasUserInteracted=${hasUserInteractedRef.current}, needsMute=${currentlyNeedsMute}`,
          );

          if (currentlyNeedsMute) {
            // Mobile user hasn't interacted yet - keep muted for autoplay compliance
            player.mute();
            setIsMuted(true);
            mobileAutoMutedRef.current = true;
            setShowUnmuteBanner(true);
            console.log(
              "[VideoPlayer] Player ready - muted for mobile autoplay",
            );
          } else if (isMobileDevice() && hasUserInteractedRef.current) {
            // Mobile user already interacted - unmute immediately
            player.unMute();
            setIsMuted(false);
            mobileAutoMutedRef.current = false;
            setShowUnmuteBanner(false);
            console.log(
              "[VideoPlayer] Player ready - unmuted (user previously interacted)",
            );
          }

          // Seek to correct position
          if (startSeconds > 0) {
            player.seekTo(startSeconds, true);
          }

          // Set playback state
          if (isPlaying && !isPaused) {
            player.playVideo();
          } else if (isPaused) {
            player.pauseVideo();
          }
        },
        onStateChange: (event: any) => {
          const state = event.data;

          if (state === YT_STATE.ENDED) {
            onVideoEnd(currentIndex);
          }

          if (state === YT_STATE.PLAYING) {
            setDuration(event.target.getDuration());
          }
        },
        onError: (event: any) => {
          console.error("[VideoPlayer] YouTube error:", event.data);
        },
      },
    });

    return () => {
      if (timeUpdateRef.current) {
        clearInterval(timeUpdateRef.current);
        timeUpdateRef.current = null;
      }
    };
  }, [
    isOpen,
    isApiReady,
    videoId,
    currentIndex,
    // Note: hasUserInteracted is accessed via ref (hasUserInteractedRef) to avoid
    // recreating player when user unmutes. The ref is updated synchronously.
    // Don't re-create player on these changes:
    // isPlaying, isPaused, currentTime, syncedStartTime
  ]);

  // Handle play/pause state changes
  useEffect(() => {
    if (!playerRef.current) return;

    try {
      if (isPlaying && !isPaused) {
        playerRef.current.playVideo();
      } else if (isPaused) {
        playerRef.current.pauseVideo();
      }
    } catch (e) {
      // Player not ready
    }
  }, [isPlaying, isPaused]);

  // Handle external seek (from sync)
  useEffect(() => {
    if (!playerRef.current || !isOpen) return;

    // Calculate expected time
    let expectedTime = currentTime;
    if (syncedStartTime > 0 && isPlaying && !isPaused) {
      const elapsedMs = Date.now() - syncedStartTime;
      expectedTime = currentTime + elapsedMs / 1000;
    }

    // Check if we need to sync (more than 2 seconds drift)
    try {
      const playerTime = playerRef.current.getCurrentTime();
      const drift = Math.abs(playerTime - expectedTime);

      if (drift > 2) {
        console.log(
          `[VideoPlayer] Syncing: drift ${drift.toFixed(1)}s, seeking to ${expectedTime.toFixed(1)}s`,
        );
        playerRef.current.seekTo(expectedTime, true);
      }
    } catch (e) {
      // Player not ready
    }
  }, [currentTime, syncedStartTime]);

  // Time update interval
  useEffect(() => {
    if (!isOpen) {
      if (timeUpdateRef.current) {
        clearInterval(timeUpdateRef.current);
        timeUpdateRef.current = null;
      }
      return;
    }

    timeUpdateRef.current = setInterval(() => {
      if (playerRef.current) {
        try {
          const time = playerRef.current.getCurrentTime();
          setLocalTime(time);
          onTimeUpdate(time);
        } catch (e) {
          // Player not ready
        }
      }
    }, 500);

    return () => {
      if (timeUpdateRef.current) {
        clearInterval(timeUpdateRef.current);
        timeUpdateRef.current = null;
      }
    };
  }, [isOpen, onTimeUpdate]);

  // Handle play/pause toggle
  const handlePlayPause = useCallback(() => {
    console.log(
      `[VideoPlayerOverlay] handlePlayPause called: isPlaying=${isPlaying}, isPaused=${isPaused}, localTime=${localTime}`,
    );
    if (isPlaying && !isPaused) {
      console.log(`[VideoPlayerOverlay] Calling onPause(${localTime})`);
      onPause(localTime);
    } else {
      console.log(`[VideoPlayerOverlay] Calling onResume()`);
      onResume();
    }
  }, [isPlaying, isPaused, localTime, onPause, onResume]);

  // Handle previous
  const handlePrevious = useCallback(() => {
    onPrevious(localTime);
  }, [localTime, onPrevious]);

  // Handle mute toggle
  const handleMuteToggle = useCallback(() => {
    if (!playerRef.current) return;

    try {
      if (isMuted) {
        playerRef.current.unMute();
        setIsMuted(false);
      } else {
        playerRef.current.mute();
        setIsMuted(true);
      }
    } catch (e) {
      // Player not ready
    }
  }, [isMuted]);

  // Handle seek via progress bar
  const handleSeek = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const time = parseFloat(e.target.value);
      onSeek(time);
      setLocalTime(time);

      if (playerRef.current) {
        try {
          playerRef.current.seekTo(time, true);
        } catch (e) {
          // Player not ready
        }
      }
    },
    [onSeek],
  );

  // Cleanup on close
  useEffect(() => {
    if (!isOpen && playerRef.current) {
      try {
        playerRef.current.destroy();
      } catch (e) {
        // Ignore
      }
      playerRef.current = null;
      lastVideoIdRef.current = null;
    }
  }, [isOpen]);

  if (!isOpen || !playlist) {
    return null;
  }

  return (
    <div className="fixed inset-x-0 top-[104px] md:top-16 bottom-40 z-40 bg-gray-950/98 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-800">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-xs text-gray-500">
            {currentIndex + 1} / {playlist.videos.length}
          </span>
          <h2 className="text-sm font-medium text-gray-200 truncate">
            {currentVideo?.title || "Loading..."}
          </h2>
          {/* Muted indicator badge - shown when muted but banner dismissed */}
          {isMuted && !showUnmuteBanner && isMobile && (
            <button
              onClick={handleUserInteraction}
              className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-amber-400 bg-amber-500/20 rounded-full hover:bg-amber-500/30 transition-colors animate-pulse"
            >
              <VolumeX className="w-3 h-3" />
              <span>Tap to unmute</span>
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowPlaylist(!showPlaylist)}
            className={`p-2 rounded-lg transition-colors ${
              showPlaylist
                ? "bg-blue-500/20 text-blue-400"
                : "hover:bg-white/5 text-gray-400"
            }`}
            title="Toggle playlist"
          >
            <List className="w-4 h-4" />
          </button>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/5 rounded-lg transition-colors"
            title="Close video player"
          >
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex min-h-0">
        {/* Video area */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* YouTube player with tap-to-unmute overlay */}
          <div className="relative flex-1 min-h-0">
            <div
              ref={playerContainerRef}
              className="absolute inset-0 bg-black"
              style={{ aspectRatio: "16/9" }}
            />

            {/* Mobile tap-to-unmute banner */}
            {showUnmuteBanner && (
              <button
                onClick={handleUserInteraction}
                className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm transition-opacity duration-300"
                aria-label="Tap to unmute video"
              >
                <div className="flex flex-col items-center gap-3 p-6 rounded-2xl bg-white/10 border border-white/20 backdrop-blur-md animate-pulse">
                  <div className="p-4 rounded-full bg-blue-500/20 border-2 border-blue-400">
                    <VolumeX className="w-10 h-10 text-blue-400" />
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-semibold text-white mb-1">
                      Tap to Unmute
                    </p>
                    <p className="text-sm text-gray-300">
                      Video is playing muted for sync
                    </p>
                  </div>
                </div>
              </button>
            )}
          </div>

          {/* Controls */}
          <div className="px-4 py-3 bg-gray-900 border-t border-gray-800">
            {/* Progress bar */}
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xs text-gray-500 w-12 text-right">
                {formatSecondsToDuration(localTime)}
              </span>
              <input
                type="range"
                min={0}
                max={duration || 100}
                value={localTime}
                onChange={handleSeek}
                className="flex-1 h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
              />
              <span className="text-xs text-gray-500 w-12">
                {formatSecondsToDuration(duration)}
              </span>
            </div>

            {/* Playback controls */}
            <div className="flex items-center justify-center gap-4">
              <button
                onClick={handlePrevious}
                className="p-2 hover:bg-white/10 rounded-full transition-colors"
                title="Previous"
                disabled={currentIndex === 0 && localTime < 3}
              >
                <SkipBack className="w-5 h-5 text-gray-300" />
              </button>

              <button
                onClick={handlePlayPause}
                className="p-3 bg-white/10 hover:bg-white/20 rounded-full transition-colors"
                title={isPlaying && !isPaused ? "Pause" : "Play"}
              >
                {isPlaying && !isPaused ? (
                  <Pause className="w-6 h-6 text-white" />
                ) : (
                  <Play className="w-6 h-6 text-white ml-0.5" />
                )}
              </button>

              <button
                onClick={onNext}
                className="p-2 hover:bg-white/10 rounded-full transition-colors"
                title="Next"
                disabled={currentIndex >= playlist.videos.length - 1}
              >
                <SkipForward className="w-5 h-5 text-gray-300" />
              </button>

              <button
                onClick={() => {
                  // On mobile with auto-muted state, use the interaction handler
                  if (isMobile && mobileAutoMutedRef.current) {
                    handleUserInteraction();
                  } else {
                    handleMuteToggle();
                  }
                }}
                className={`p-2 rounded-full transition-colors ml-4 ${
                  isMuted && isMobile
                    ? "bg-amber-500/30 hover:bg-amber-500/40 animate-pulse"
                    : "hover:bg-white/10"
                }`}
                title={isMuted ? "Unmute" : "Mute"}
              >
                {isMuted ? (
                  <VolumeX
                    className={`w-5 h-5 ${isMobile ? "text-amber-400" : "text-gray-300"}`}
                  />
                ) : (
                  <Volume2 className="w-5 h-5 text-gray-300" />
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Playlist sidebar (desktop) / drawer (mobile) */}
        {showPlaylist && (
          <div className="w-80 border-l border-gray-800 bg-gray-900/50 flex flex-col max-h-full hidden md:flex">
            <div className="px-4 py-2 border-b border-gray-800 flex items-center justify-between">
              <span className="text-sm font-medium text-gray-300">
                Playlist
              </span>
              <span className="text-xs text-gray-500">
                {playlist.videos.length} videos
              </span>
            </div>
            <div className="flex-1 overflow-y-auto min-h-0 p-2 space-y-1">
              {playlist.videos.map((video, index) => (
                <PlaylistItem
                  key={index}
                  video={video}
                  index={index}
                  isActive={index === currentIndex}
                  onClick={() => {
                    if (index !== currentIndex) {
                      // Use seek to jump to that video by changing index
                      // This requires emitting a specific event - for now, use next/previous
                      if (index > currentIndex) {
                        // Skip forward
                        for (let i = currentIndex; i < index; i++) {
                          onNext();
                        }
                      } else {
                        // Skip backward
                        for (let i = currentIndex; i > index; i--) {
                          onPrevious(0);
                        }
                      }
                    }
                  }}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Mobile playlist toggle */}
      <div className="md:hidden">
        {showPlaylist && (
          <div className="absolute bottom-0 left-0 right-0 bg-gray-900 border-t border-gray-800 max-h-48 overflow-y-auto">
            <div className="p-2 space-y-1">
              {playlist.videos.map((video, index) => (
                <PlaylistItem
                  key={index}
                  video={video}
                  index={index}
                  isActive={index === currentIndex}
                  onClick={() => {
                    // Same logic as desktop
                    if (index !== currentIndex) {
                      if (index > currentIndex) {
                        for (let i = currentIndex; i < index; i++) {
                          onNext();
                        }
                      } else {
                        for (let i = currentIndex; i > index; i--) {
                          onPrevious(0);
                        }
                      }
                    }
                  }}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default VideoPlayerOverlay;
