/**
 * Room Layout with Dynamic Metadata
 *
 * Provides Open Graph metadata for room links shared via SMS/social media.
 * Fetches room data server-side for proper preview rendering.
 */

import type { Metadata, ResolvingMetadata } from "next";
import { getRoom } from "@/server/store/rooms";

interface LayoutProps {
  children: React.ReactNode;
  params: Promise<{ roomId: string }>;
}

/**
 * Get the base URL for constructing absolute URLs
 */
function getBaseUrl(): string {
  // Production URL
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL;
  }
  // Vercel deployment
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  // Default production domain
  return "https://www.chnl.net";
}

/**
 * Generate dynamic metadata for room pages
 * This runs on the server and provides Open Graph tags for link previews
 */
export async function generateMetadata(
  { params }: LayoutProps,
  parent: ResolvingMetadata,
): Promise<Metadata> {
  const { roomId } = await params;
  const room = getRoom(roomId);
  const baseUrl = getBaseUrl();
  const roomUrl = `${baseUrl}/rooms/${roomId}`;

  // Fallback metadata if room doesn't exist
  if (!room) {
    return {
      title: "Room Not Found | sync",
      description: "This room doesn't exist or has been closed.",
      openGraph: {
        title: "Room Not Found | sync",
        description: "This room doesn't exist or has been closed.",
        url: roomUrl,
        siteName: "sync",
        type: "website",
        images: [
          {
            url: `${baseUrl}/android-chrome-512x512.png`,
            width: 512,
            height: 512,
            alt: "sync - The AI Collaboration Engine",
          },
        ],
      },
      twitter: {
        card: "summary",
        title: "Room Not Found | sync",
        description: "This room doesn't exist or has been closed.",
        images: [`${baseUrl}/android-chrome-512x512.png`],
      },
    };
  }

  // Build dynamic description
  const participantText =
    room.participantCount === 0
      ? "Be the first to join"
      : room.participantCount === 1
        ? "1 person is here"
        : `${room.participantCount} people are here`;

  const description =
    room.description ||
    `Join "${room.name}" on sync. ${participantText}. AI-powered voice collaboration for teams.`;

  // Truncate description to optimal length for social cards
  const truncatedDescription =
    description.length > 160 ? description.slice(0, 157) + "..." : description;

  const title = `${room.name} | sync`;

  return {
    title,
    description: truncatedDescription,
    openGraph: {
      title,
      description: truncatedDescription,
      url: roomUrl,
      siteName: "sync",
      type: "website",
      images: [
        {
          url: `${baseUrl}/android-chrome-512x512.png`,
          width: 512,
          height: 512,
          alt: `${room.name} - sync room`,
        },
      ],
    },
    twitter: {
      card: "summary",
      title,
      description: truncatedDescription,
      images: [`${baseUrl}/android-chrome-512x512.png`],
    },
    // Additional metadata for better sharing
    other: {
      "og:locale": "en_US",
    },
  };
}

/**
 * Room layout component
 * Simply passes through children - metadata is the key feature here
 */
export default async function RoomLayout({ children }: LayoutProps) {
  return <>{children}</>;
}
