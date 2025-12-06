/**
 * Room Lobby Page
 *
 * Displays a list of available rooms, allows joining existing rooms,
 * and provides navigation to create a new room.
 *
 * Part of the Long-Horizon Engineering Protocol - FEAT-117
 */

'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';
import { RoomLobby } from '@/components/room';
import { ArrowLeft, Users } from 'lucide-react';
import Link from 'next/link';

/**
 * Room Lobby Page Component
 *
 * Main page for browsing and joining rooms.
 */
export default function RoomsPage() {
  const router = useRouter();
  const [isJoining, setIsJoining] = useState<string | null>(null);

  /**
   * Handle joining a room
   */
  const handleJoinRoom = useCallback(
    async (roomId: string) => {
      setIsJoining(roomId);
      try {
        // Navigate to the room experience page
        router.push(`/rooms/${roomId}`);
      } catch (error) {
        console.error('Failed to join room:', error);
        setIsJoining(null);
      }
    },
    [router]
  );

  /**
   * Handle creating a new room
   */
  const handleCreateRoom = useCallback(() => {
    router.push('/rooms/create');
  }, [router]);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Back to home */}
            <Link
              href="/"
              className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
              <span className="hidden sm:inline">Back to Home</span>
            </Link>

            {/* Title */}
            <div className="flex items-center gap-2">
              <Users className="w-6 h-6 text-primary" />
              <h1 className="text-xl font-semibold text-foreground">
                Collaboration Rooms
              </h1>
            </div>

            {/* Placeholder for balance */}
            <div className="w-24" />
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Page description */}
        <div className="mb-8 text-center">
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Join an existing collaboration room or create a new one to start
            a shared AI conversation with your team.
          </p>
        </div>

        {/* Room lobby component */}
        <RoomLobby
          onJoinRoom={handleJoinRoom}
          onCreateRoom={handleCreateRoom}
          refreshInterval={30000}
          showCreateButton
          className="max-w-5xl mx-auto"
        />

        {/* Joining overlay */}
        {isJoining && (
          <div className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-card border border-border rounded-lg p-8 text-center shadow-xl">
              <div className="animate-spin w-12 h-12 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4" />
              <p className="text-lg font-medium text-foreground">
                Joining room...
              </p>
              <p className="text-sm text-muted-foreground mt-2">
                Establishing connection
              </p>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-border py-6 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-sm text-muted-foreground">
          <p>
            Swensync - The AI Collaboration Engine
          </p>
        </div>
      </footer>
    </div>
  );
}
