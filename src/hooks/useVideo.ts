/**
 * useVideo Hook
 *
 * React hook for managing synchronized video playback state in a room.
 * Handles video events from voice commands and UI controls via Socket.io.
 *
 * Part of the Long-Horizon Engineering Protocol - FEAT-801
 */

"use client";

import { useCallback, useEffect, useState, useRef } from "react";
import type { SignalingClient } from "@/lib/signaling/client";
import type { RoomId } from "@/types/room";
import type { PeerId } from "@/types/peer";
import type { SerperVideoResult } from "@/types/search";
import type {
  VideoPlaylist,
  VideoPlaybackState,
  VideoPlayPayload,
  VideoStopPayload,
  VideoPausePayload,
  VideoResumePayload,
  VideoSeekPayload,
  VideoNextPayload,
  VideoPreviousPayload,
  VideoStatePayload,
  INITIAL_VIDEO_STATE,
} from "@/types/video";

/**
 * Hook options
 */
export interface UseVideoOptions {
  /** Room ID */
  roomId: RoomId;
  /** Signaling client instance */
  client: SignalingClient | null;
  /** Local peer ID */
  peerId: PeerId | null;
}

/**
 * Hook return type
 */
export interface UseVideoReturn {
  /** Whether the video player overlay is open */
  isPlayerOpen: boolean;
  /** Whether video is currently playing */
  isPlaying: boolean;
  /** Whether video is paused */
  isPaused: boolean;
  /** Current playlist */
  playlist: VideoPlaylist | null;
  /** Currently playing video */
  currentVideo: SerperVideoResult | null;
  /** Current video index in playlist */
  currentIndex: number;
  /** Current playback time in seconds */
  currentTime: number;
  /** Sync timestamp for coordinated playback */
  syncedStartTime: number;
  /** Who triggered the current playback */
  triggeredBy: PeerId | string | null;

  // Actions (emit to server for broadcast)
  /** Pause video */
  pause: (currentTime: number) => void;
  /** Resume video */
  resume: () => void;
  /** Stop video and close player */
  stop: () => void;
  /** Go to next video */
  next: () => void;
  /** Go to previous video */
  previous: (currentTime: number) => void;
  /** Seek to time */
  seek: (time: number) => void;
  /** Close player without stopping (local only) */
  closePlayer: () => void;

  // Callbacks for YouTube player
  /** Called when video ends */
  onVideoEnd: (videoIndex: number) => void;
  /** Called on time update (for sync checking) */
  onTimeUpdate: (time: number) => void;
  /** Request sync from server */
  requestSync: () => void;
}

/**
 * Initial video state
 */
const INITIAL_STATE: VideoPlaybackState = {
  isOpen: false,
  isPlaying: false,
  isPaused: false,
  currentIndex: 0,
  currentTime: 0,
  playlist: null,
  syncedStartTime: 0,
  triggeredBy: null,
  lastSyncAt: 0,
};

/**
 * useVideo - Hook for synchronized video playback state management
 *
 * Subscribes to video:* events from the signaling server to synchronize
 * video playback across all participants in a room.
 *
 * @param options - Hook configuration options
 * @returns Video state and actions
 *
 * @example
 * ```tsx
 * const {
 *   isPlayerOpen,
 *   isPlaying,
 *   playlist,
 *   currentVideo,
 *   pause,
 *   resume,
 *   stop,
 * } = useVideo({ roomId, client, peerId });
 *
 * if (isPlayerOpen && currentVideo) {
 *   return <VideoPlayerOverlay video={currentVideo} />;
 * }
 * ```
 */
export function useVideo(options: UseVideoOptions): UseVideoReturn {
  const { roomId, client, peerId } = options;

  // State
  const [playbackState, setPlaybackState] =
    useState<VideoPlaybackState>(INITIAL_STATE);

  // Track local time updates
  const localTimeRef = useRef<number>(0);

  // Subscribe to video events
  useEffect(() => {
    if (!client) return;

    const socket = client.getSocket();
    if (!socket) return;

    // Handle video:play - start playlist
    const handleVideoPlay = (payload: VideoPlayPayload) => {
      if (payload.roomId !== roomId) return;
      console.log(
        `[useVideo] Video play: ${payload.playlist.videos.length} videos`,
      );
      setPlaybackState({
        isOpen: true,
        isPlaying: true,
        isPaused: false,
        currentIndex: payload.currentIndex,
        currentTime: 0,
        playlist: payload.playlist,
        syncedStartTime: payload.syncedStartTime,
        triggeredBy: payload.triggeredBy,
        lastSyncAt: Date.now(),
      });
    };

    // Handle video:stop - close player
    const handleVideoStop = (payload: VideoStopPayload) => {
      if (payload.roomId !== roomId) return;
      console.log(`[useVideo] Video stop`);
      setPlaybackState(INITIAL_STATE);
    };

    // Handle video:pause
    const handleVideoPause = (payload: VideoPausePayload) => {
      if (payload.roomId !== roomId) return;
      console.log(`[useVideo] Video paused at ${payload.currentTime}s`);
      setPlaybackState((prev) => ({
        ...prev,
        isPlaying: false,
        isPaused: true,
        currentTime: payload.currentTime,
        triggeredBy: payload.triggeredBy,
        lastSyncAt: Date.now(),
      }));
    };

    // Handle video:resume
    const handleVideoResume = (payload: VideoResumePayload) => {
      if (payload.roomId !== roomId) return;
      console.log(`[useVideo] Video resumed from ${payload.currentTime}s`);
      setPlaybackState((prev) => ({
        ...prev,
        isPlaying: true,
        isPaused: false,
        currentTime: payload.currentTime,
        syncedStartTime: payload.syncedStartTime,
        triggeredBy: payload.triggeredBy,
        lastSyncAt: Date.now(),
      }));
    };

    // Handle video:seek
    const handleVideoSeek = (payload: VideoSeekPayload) => {
      if (payload.roomId !== roomId) return;
      console.log(`[useVideo] Video seek to ${payload.time}s`);
      setPlaybackState((prev) => ({
        ...prev,
        currentTime: payload.time,
        syncedStartTime: Date.now(),
        triggeredBy: payload.triggeredBy,
        lastSyncAt: Date.now(),
      }));
    };

    // Handle video:next
    const handleVideoNext = (payload: VideoNextPayload) => {
      if (payload.roomId !== roomId) return;
      console.log(`[useVideo] Video next: index ${payload.currentIndex}`);
      setPlaybackState((prev) => ({
        ...prev,
        isPlaying: true,
        isPaused: false,
        currentIndex: payload.currentIndex,
        currentTime: 0,
        syncedStartTime: payload.syncedStartTime,
        triggeredBy: payload.triggeredBy,
        lastSyncAt: Date.now(),
      }));
    };

    // Handle video:previous
    const handleVideoPrevious = (payload: VideoPreviousPayload) => {
      if (payload.roomId !== roomId) return;
      console.log(`[useVideo] Video previous: index ${payload.currentIndex}`);
      setPlaybackState((prev) => ({
        ...prev,
        isPlaying: true,
        isPaused: false,
        currentIndex: payload.currentIndex,
        currentTime: 0,
        syncedStartTime: payload.syncedStartTime,
        triggeredBy: payload.triggeredBy,
        lastSyncAt: Date.now(),
      }));
    };

    // Handle video:state (for late joiners)
    const handleVideoState = (payload: VideoStatePayload) => {
      if (payload.roomId !== roomId) return;
      console.log(`[useVideo] Video state received (late join sync)`);
      setPlaybackState(payload.state);
    };

    // Handle video:goto - jump to specific video by index
    const handleVideoGoto = (payload: VideoNextPayload) => {
      if (payload.roomId !== roomId) return;
      console.log(`[useVideo] Video goto: index ${payload.currentIndex}`);
      setPlaybackState((prev) => ({
        ...prev,
        isPlaying: true,
        isPaused: false,
        currentIndex: payload.currentIndex,
        currentTime: 0,
        syncedStartTime: payload.syncedStartTime,
        triggeredBy: payload.triggeredBy,
        lastSyncAt: Date.now(),
      }));
    };

    // Subscribe to events
    socket.on("video:play", handleVideoPlay);
    socket.on("video:stop", handleVideoStop);
    socket.on("video:pause", handleVideoPause);
    socket.on("video:resume", handleVideoResume);
    socket.on("video:seek", handleVideoSeek);
    socket.on("video:next", handleVideoNext);
    socket.on("video:previous", handleVideoPrevious);
    socket.on("video:state", handleVideoState);
    socket.on("video:goto", handleVideoGoto);

    // Cleanup
    return () => {
      socket.off("video:play", handleVideoPlay);
      socket.off("video:stop", handleVideoStop);
      socket.off("video:pause", handleVideoPause);
      socket.off("video:resume", handleVideoResume);
      socket.off("video:seek", handleVideoSeek);
      socket.off("video:next", handleVideoNext);
      socket.off("video:previous", handleVideoPrevious);
      socket.off("video:state", handleVideoState);
      socket.off("video:goto", handleVideoGoto);
    };
  }, [client, roomId]);

  // Action: Pause
  // Note: We don't guard on playbackState.isPlaying because the local YouTube player
  // state may differ from server state. Trust user intent and let server validate.
  const pause = useCallback(
    (currentTime: number) => {
      console.log(`[useVideo] Pause requested: time=${currentTime}`);

      if (!client) {
        console.log("[useVideo] Pause blocked: no client");
        return;
      }

      const socket = client.getSocket();
      if (!socket) {
        console.log("[useVideo] Pause blocked: no socket");
        return;
      }

      console.log(`[useVideo] Emitting video:control pause to room ${roomId}`);
      socket.emit("video:control", {
        roomId,
        action: "pause",
        currentTime,
      });
    },
    [client, roomId],
  );

  // Action: Resume
  // Note: We don't guard on playbackState.isPaused because the local YouTube player
  // state may differ from server state. Trust user intent and let server validate.
  const resume = useCallback(() => {
    console.log(`[useVideo] Resume requested`);

    if (!client) {
      console.log("[useVideo] Resume blocked: no client");
      return;
    }

    const socket = client.getSocket();
    if (!socket) {
      console.log("[useVideo] Resume blocked: no socket");
      return;
    }

    console.log(`[useVideo] Emitting video:control resume to room ${roomId}`);
    socket.emit("video:control", {
      roomId,
      action: "resume",
    });
  }, [client, roomId]);

  // Action: Stop
  const stop = useCallback(() => {
    if (!client) return;

    const socket = client.getSocket();
    if (!socket) return;

    socket.emit("video:control", {
      roomId,
      action: "stop",
    });
  }, [client, roomId]);

  // Action: Next
  const next = useCallback(() => {
    if (!client || !playbackState.playlist) return;

    const socket = client.getSocket();
    if (!socket) return;

    socket.emit("video:control", {
      roomId,
      action: "next",
    });
  }, [client, roomId, playbackState.playlist]);

  // Action: Previous
  const previous = useCallback(
    (currentTime: number) => {
      if (!client || !playbackState.playlist) return;

      const socket = client.getSocket();
      if (!socket) return;

      socket.emit("video:control", {
        roomId,
        action: "previous",
        currentTime,
      });
    },
    [client, roomId, playbackState.playlist],
  );

  // Action: Seek
  const seek = useCallback(
    (time: number) => {
      if (!client) return;

      const socket = client.getSocket();
      if (!socket) return;

      socket.emit("video:control", {
        roomId,
        action: "seek",
        currentTime: time,
      });
    },
    [client, roomId],
  );

  // Action: Close player locally (without stopping for others)
  const closePlayer = useCallback(() => {
    // Actually, video should stop for everyone, so call stop
    stop();
  }, [stop]);

  // Callback: Video ended
  const onVideoEnd = useCallback(
    (videoIndex: number) => {
      if (!client || !peerId) return;

      const socket = client.getSocket();
      if (!socket) return;

      console.log(`[useVideo] Video ${videoIndex} ended, notifying server`);
      socket.emit("video:ended", {
        roomId,
        videoIndex,
        peerId,
      });
    },
    [client, roomId, peerId],
  );

  // Callback: Time update (track local time)
  const onTimeUpdate = useCallback((time: number) => {
    localTimeRef.current = time;
  }, []);

  // Action: Request sync from server
  const requestSync = useCallback(() => {
    if (!client) return;

    const socket = client.getSocket();
    if (!socket) return;

    socket.emit(
      "video:sync",
      { roomId },
      (response: { state: VideoPlaybackState | null; error?: string }) => {
        if (response.state) {
          console.log(`[useVideo] Sync response received`);
          setPlaybackState(response.state);
        }
      },
    );
  }, [client, roomId]);

  // Derived values
  const currentVideo =
    playbackState.playlist?.videos[playbackState.currentIndex] || null;

  return {
    // State
    isPlayerOpen: playbackState.isOpen,
    isPlaying: playbackState.isPlaying,
    isPaused: playbackState.isPaused,
    playlist: playbackState.playlist,
    currentVideo,
    currentIndex: playbackState.currentIndex,
    currentTime: playbackState.currentTime,
    syncedStartTime: playbackState.syncedStartTime,
    triggeredBy: playbackState.triggeredBy,

    // Actions
    pause,
    resume,
    stop,
    next,
    previous,
    seek,
    closePlayer,

    // Callbacks
    onVideoEnd,
    onTimeUpdate,
    requestSync,
  };
}

export default useVideo;
