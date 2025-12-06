/**
 * Create Room Page
 *
 * Page for creating a new collaboration room with the CreateRoomForm component.
 * Handles form submission, API calls, and navigation after successful creation.
 *
 * Part of the Long-Horizon Engineering Protocol - FEAT-118
 */

'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';
import { CreateRoomForm } from '@/components/room';
import { ArrowLeft, Users } from 'lucide-react';
import Link from 'next/link';
import type { CreateRoomRequest } from '@/types/room';

/**
 * Create Room Page Component
 *
 * Provides a form for creating a new room and handles the API interaction.
 */
export default function CreateRoomPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Handle form submission
   */
  const handleSubmit = useCallback(
    async (data: CreateRoomRequest) => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch('/api/rooms', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(data),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || 'Failed to create room');
        }

        const room = await response.json();

        // Navigate to the newly created room
        router.push(`/rooms/${room.id}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to create room');
        setIsLoading(false);
      }
    },
    [router]
  );

  /**
   * Handle cancel button
   */
  const handleCancel = useCallback(() => {
    router.push('/rooms');
  }, [router]);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b border-border">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Back to rooms */}
            <Link
              href="/rooms"
              className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
              <span className="hidden sm:inline">Back to Rooms</span>
            </Link>

            {/* Title */}
            <div className="flex items-center gap-2">
              <Users className="w-6 h-6 text-primary" />
              <h1 className="text-xl font-semibold text-foreground">
                Create Room
              </h1>
            </div>

            {/* Placeholder for balance */}
            <div className="w-24" />
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Page description */}
        <div className="mb-8 text-center">
          <p className="text-muted-foreground">
            Create a new collaboration room for your team. Choose your settings
            and invite others to join.
          </p>
        </div>

        {/* Form container */}
        <div className="bg-card border border-border rounded-lg p-6 sm:p-8 shadow-sm">
          {/* Error display */}
          {error && (
            <div
              className="mb-6 p-4 bg-red-500/10 border border-red-500/50 rounded-lg text-red-400"
              role="alert"
            >
              {error}
            </div>
          )}

          <CreateRoomForm
            onSubmit={handleSubmit}
            onCancel={handleCancel}
            showCancel
          />
        </div>

        {/* Help text */}
        <div className="mt-6 text-center text-sm text-muted-foreground">
          <p>
            Once created, you&apos;ll be redirected to your new room where you can
            share the link with others.
          </p>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border py-6 mt-auto">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-sm text-muted-foreground">
          <p>
            Swensync - The AI Collaboration Engine
          </p>
        </div>
      </footer>
    </div>
  );
}
