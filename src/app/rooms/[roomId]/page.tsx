/**
 * Room Experience Page
 *
 * Main page for the room collaboration experience. Handles room connection,
 * participant display, and voice controls.
 *
 * Part of the Long-Horizon Engineering Protocol - FEAT-119
 */

'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Users, AlertCircle, Loader2, LogOut, Copy, Check } from 'lucide-react';
import { ParticipantList, RoomControls } from '@/components/room';
import type { ParticipantInfo } from '@/components/room';
import type { Room } from '@/types/room';

/**
 * Room loading states
 */
type RoomState = 'loading' | 'joining' | 'connected' | 'error' | 'not_found' | 'full' | 'closed';

/**
 * Room error info
 */
interface RoomError {
  message: string;
  code?: string;
}

/**
 * Mock participant data for initial implementation
 * Will be replaced with useRoomConnection hook data
 */
function getMockParticipants(localName: string): ParticipantInfo[] {
  return [
    {
      id: 'local-peer',
      displayName: localName,
      role: 'participant',
      isMuted: false,
      isSpeaking: false,
      isLocal: true,
      connectionState: 'connected',
    },
  ];
}

/**
 * Room Experience Page Component
 */
export default function RoomPage() {
  const params = useParams<{ roomId: string }>();
  const roomId = params.roomId;
  const router = useRouter();

  // Room state
  const [roomState, setRoomState] = useState<RoomState>('loading');
  const [room, setRoom] = useState<Room | null>(null);
  const [error, setError] = useState<RoomError | null>(null);

  // Local user state
  const [displayName] = useState(() => `User-${Math.random().toString(36).slice(2, 6)}`);
  const [isMuted, setIsMuted] = useState(false);
  const [isAddressingAI, setIsAddressingAI] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  const [copied, setCopied] = useState(false);

  // Participants (mock data for now - will integrate with useRoomConnection)
  const [participants, setParticipants] = useState<ParticipantInfo[]>([]);

  /**
   * Fetch room details
   */
  useEffect(() => {
    async function fetchRoom() {
      try {
        const response = await fetch(`/api/rooms/${roomId}`);

        if (response.status === 404) {
          setRoomState('not_found');
          setError({ message: 'Room not found', code: 'ROOM_NOT_FOUND' });
          return;
        }

        if (!response.ok) {
          throw new Error('Failed to fetch room');
        }

        const roomData: Room = await response.json();

        // Check room status
        if (roomData.status === 'closed') {
          setRoomState('closed');
          setError({ message: 'This room has been closed', code: 'ROOM_CLOSED' });
          return;
        }

        if (roomData.status === 'full') {
          setRoomState('full');
          setError({ message: 'This room is full', code: 'ROOM_FULL' });
          return;
        }

        setRoom(roomData);
        setRoomState('joining');

        // Simulate joining (will be replaced with actual signaling connection)
        setTimeout(() => {
          setRoomState('connected');
          setParticipants(getMockParticipants(displayName));
        }, 500);
      } catch (err) {
        setRoomState('error');
        setError({
          message: err instanceof Error ? err.message : 'Failed to load room',
        });
      }
    }

    fetchRoom();
  }, [roomId, displayName]);

  /**
   * Handle mute toggle
   */
  const handleMuteToggle = useCallback(() => {
    setIsMuted((prev) => !prev);
    // Update local participant state
    setParticipants((prev) =>
      prev.map((p) => (p.isLocal ? { ...p, isMuted: !p.isMuted } : p))
    );
  }, []);

  /**
   * Handle leave room
   */
  const handleLeaveRoom = useCallback(async () => {
    setIsLeaving(true);
    try {
      // Simulate disconnect (will be replaced with actual signaling disconnect)
      await new Promise((resolve) => setTimeout(resolve, 300));
      router.push('/rooms');
    } catch {
      setIsLeaving(false);
    }
  }, [router]);

  /**
   * Handle PTT start
   */
  const handlePTTStart = useCallback(() => {
    setIsAddressingAI(true);
    setParticipants((prev) =>
      prev.map((p) => (p.isLocal ? { ...p, isAddressingAI: true } : p))
    );
  }, []);

  /**
   * Handle PTT end
   */
  const handlePTTEnd = useCallback(() => {
    setIsAddressingAI(false);
    setParticipants((prev) =>
      prev.map((p) => (p.isLocal ? { ...p, isAddressingAI: false } : p))
    );
  }, []);

  /**
   * Copy room link to clipboard
   */
  const handleCopyLink = useCallback(async () => {
    try {
      const url = `${window.location.origin}/rooms/${roomId}`;
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      console.error('Failed to copy link');
    }
  }, [roomId]);

  /**
   * Render loading state
   */
  if (roomState === 'loading' || roomState === 'joining') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto mb-4" />
          <p className="text-lg font-medium text-foreground">
            {roomState === 'loading' ? 'Loading room...' : 'Joining room...'}
          </p>
          <p className="text-sm text-muted-foreground mt-2">
            Setting up your connection
          </p>
        </div>
      </div>
    );
  }

  /**
   * Render error states
   */
  if (roomState === 'not_found' || roomState === 'full' || roomState === 'closed' || roomState === 'error') {
    const errorConfig = {
      not_found: {
        title: 'Room Not Found',
        message: 'The room you are looking for does not exist or has been deleted.',
        icon: AlertCircle,
      },
      full: {
        title: 'Room is Full',
        message: 'This room has reached its maximum number of participants.',
        icon: Users,
      },
      closed: {
        title: 'Room Closed',
        message: 'This room has been closed by the host.',
        icon: AlertCircle,
      },
      error: {
        title: 'Connection Error',
        message: error?.message || 'Unable to connect to the room.',
        icon: AlertCircle,
      },
    };

    const config = errorConfig[roomState];
    const Icon = config.icon;

    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="max-w-md w-full text-center">
          <div className="bg-card border border-border rounded-lg p-8 shadow-sm">
            <Icon className="w-16 h-16 text-red-400 mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-foreground mb-2">{config.title}</h1>
            <p className="text-muted-foreground mb-6">{config.message}</p>
            <Link
              href="/rooms"
              className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:opacity-90 transition-opacity"
            >
              <ArrowLeft className="w-5 h-5" />
              Back to Rooms
            </Link>
          </div>
        </div>
      </div>
    );
  }

  /**
   * Render connected room experience
   */
  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Back / Leave */}
            <button
              onClick={handleLeaveRoom}
              disabled={isLeaving}
              className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
              aria-label="Leave room"
            >
              {isLeaving ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <LogOut className="w-5 h-5" />
              )}
              <span className="hidden sm:inline">Leave</span>
            </button>

            {/* Room info */}
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-primary" />
              <div className="text-center">
                <h1 className="text-lg font-semibold text-foreground truncate max-w-[200px] sm:max-w-[300px]">
                  {room?.name || 'Room'}
                </h1>
                <p className="text-xs text-muted-foreground">
                  {participants.length}/{room?.maxParticipants || 4} participants
                </p>
              </div>
            </div>

            {/* Share button */}
            <button
              onClick={handleCopyLink}
              className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:text-foreground border border-border rounded-lg hover:bg-muted transition-colors"
              aria-label={copied ? 'Link copied' : 'Copy room link'}
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4 text-green-500" />
                  <span className="hidden sm:inline">Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  <span className="hidden sm:inline">Share</span>
                </>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 flex flex-col">
        {/* Room description */}
        {room?.description && (
          <div className="px-4 sm:px-6 lg:px-8 py-3 bg-muted/50 border-b border-border">
            <p className="text-sm text-muted-foreground max-w-7xl mx-auto">
              {room.description}
            </p>
          </div>
        )}

        {/* Participants area */}
        <div className="flex-1 flex flex-col items-center justify-center p-4 sm:p-8">
          <div className="w-full max-w-4xl">
            {/* Participant list */}
            <ParticipantList
              participants={participants}
              localPeerId="local-peer"
              activeSpeakerId={null}
              layout="grid"
              showConnectionStatus
              showRoleBadge
              className="justify-center"
            />

            {/* Room status */}
            <div className="mt-8 text-center">
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-green-500/10 border border-green-500/30 rounded-full text-green-400 text-sm">
                <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                Connected
              </div>
            </div>
          </div>
        </div>

        {/* AI status placeholder */}
        <div className="px-4 sm:px-6 lg:px-8 py-4 border-t border-border bg-card/50">
          <div className="max-w-7xl mx-auto text-center">
            <p className="text-sm text-muted-foreground">
              {isAddressingAI ? (
                <span className="text-purple-400">Addressing AI...</span>
              ) : (
                'Hold the Talk button to address the AI assistant'
              )}
            </p>
          </div>
        </div>
      </main>

      {/* Controls footer */}
      <footer className="sticky bottom-0 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-t border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-center">
            <RoomControls
              isMuted={isMuted}
              onMuteToggle={handleMuteToggle}
              onLeaveRoom={handleLeaveRoom}
              isLeaving={isLeaving}
              showPTT
              onPTTStart={handlePTTStart}
              onPTTEnd={handlePTTEnd}
              isAddressingAI={isAddressingAI}
              size="lg"
            />
          </div>
        </div>
      </footer>
    </div>
  );
}
