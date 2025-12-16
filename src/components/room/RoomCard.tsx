/**
 * RoomCard Component
 *
 * A preview card for a single room displaying name, description,
 * participant avatars, and join functionality.
 *
 * Part of the Long-Horizon Engineering Protocol - FEAT-112
 */

"use client";

import React, { useState, useCallback } from "react";
import { Users, Loader2 } from "lucide-react";
import type { RoomSummary, RoomStatus, AIPersonality } from "@/types/room";

/**
 * Props for the RoomCard component
 */
export interface RoomCardProps {
  /** Room data to display */
  room: RoomSummary;
  /** Callback when user clicks join */
  onJoin: (roomId: string) => void | Promise<void>;
  /** Optional participant avatars */
  participantAvatars?: { id: string; name: string; avatarUrl?: string }[];
  /** Whether to show the AI personality badge */
  showAIPersonality?: boolean;
  /** Custom class name */
  className?: string;
}

/**
 * Get status badge color classes
 */
function getStatusBadgeClasses(status: RoomStatus): string {
  switch (status) {
    case "waiting":
      return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
    case "active":
      return "bg-green-500/20 text-green-400 border-green-500/30";
    case "full":
      return "bg-red-500/20 text-red-400 border-red-500/30";
    case "closed":
      return "bg-gray-500/20 text-gray-400 border-gray-500/30";
    default:
      return "bg-gray-500/20 text-gray-400 border-gray-500/30";
  }
}

/**
 * Get AI personality display info
 */
function getAIPersonalityInfo(personality: AIPersonality): {
  label: string;
  color: string;
} {
  switch (personality) {
    case "facilitator":
      return { label: "Facilitator", color: "text-blue-400" };
    case "assistant":
      return { label: "Assistant", color: "text-green-400" };
    case "expert":
      return { label: "Expert", color: "text-purple-400" };
    case "brainstorm":
      return { label: "Brainstorm", color: "text-orange-400" };
    case "custom":
      return { label: "Custom", color: "text-pink-400" };
    default:
      return { label: "Assistant", color: "text-gray-400" };
  }
}

/**
 * Format relative time
 */
function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - new Date(date).getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}

/**
 * Get initials from name
 */
function getInitials(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

/**
 * Avatar colors for participants without avatar images
 * Note: Purple is reserved for AI, so excluded from this palette
 */
const AVATAR_COLORS = [
  "bg-blue-500",
  "bg-green-500",
  "bg-orange-500",
  "bg-pink-500",
  "bg-teal-500",
  "bg-indigo-500",
  "bg-amber-500",
  "bg-rose-500",
  "bg-cyan-500",
  "bg-emerald-500",
];

/**
 * Get avatar color based on index or name
 */
function getAvatarColor(index: number, name: string): string {
  const hash = name
    .split("")
    .reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return AVATAR_COLORS[(index + hash) % AVATAR_COLORS.length];
}

/**
 * ParticipantAvatar - Small avatar component for the card
 */
interface ParticipantAvatarProps {
  name: string;
  avatarUrl?: string;
  index: number;
  isOverflow?: boolean;
  overflowCount?: number;
}

function ParticipantAvatar({
  name,
  avatarUrl,
  index,
  isOverflow,
  overflowCount,
}: ParticipantAvatarProps) {
  if (isOverflow && overflowCount) {
    return (
      <div
        className="w-8 h-8 rounded-full bg-muted border-2 border-card flex items-center justify-center text-xs font-medium text-muted-foreground"
        title={`+${overflowCount} more participants`}
      >
        +{overflowCount}
      </div>
    );
  }

  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        title={name}
        className="w-8 h-8 rounded-full border-2 border-card object-cover"
      />
    );
  }

  return (
    <div
      className={`w-8 h-8 rounded-full border-2 border-card flex items-center justify-center text-xs font-medium text-white ${getAvatarColor(index, name)}`}
      title={name}
    >
      {getInitials(name)}
    </div>
  );
}

/**
 * RoomCard Component
 *
 * Displays a room preview card with join functionality.
 *
 * @example
 * ```tsx
 * <RoomCard
 *   room={roomSummary}
 *   onJoin={(roomId) => router.push(`/rooms/${roomId}`)}
 *   participantAvatars={[
 *     { id: '1', name: 'Alice', avatarUrl: '/alice.jpg' },
 *     { id: '2', name: 'Bob' },
 *   ]}
 *   showAIPersonality
 * />
 * ```
 */
export function RoomCard({
  room,
  onJoin,
  participantAvatars = [],
  showAIPersonality = true,
  className = "",
}: RoomCardProps) {
  const [isJoining, setIsJoining] = useState(false);

  const isJoinable = room.status !== "full" && room.status !== "closed";
  const aiInfo = getAIPersonalityInfo(room.aiPersonality);

  // Show up to 4 avatars, then overflow indicator
  const maxAvatars = 4;
  const visibleAvatars = participantAvatars.slice(0, maxAvatars);
  const overflowCount = participantAvatars.length - maxAvatars;

  /**
   * Handle join click
   */
  const handleJoin = useCallback(async () => {
    if (!isJoinable || isJoining) return;

    setIsJoining(true);
    try {
      await onJoin(room.id);
    } finally {
      setIsJoining(false);
    }
  }, [room.id, isJoinable, isJoining, onJoin]);

  /**
   * Get join button text
   */
  const getJoinButtonText = (): string => {
    if (isJoining) return "Joining...";
    if (room.status === "full") return "Room Full";
    if (room.status === "closed") return "Closed";
    return "Join Room";
  };

  return (
    <div
      className={`flex flex-col p-4 bg-card border border-border rounded-lg hover:border-primary/50 transition-colors ${className}`}
      data-testid="room-card"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <h3
          className="font-semibold text-foreground truncate flex-1"
          title={room.name}
        >
          {room.name}
        </h3>
        <span
          className={`px-2 py-0.5 text-xs font-medium border rounded-full shrink-0 ${getStatusBadgeClasses(room.status)}`}
        >
          {room.status}
        </span>
      </div>

      {/* Description */}
      {room.description && (
        <p
          className="text-sm text-muted-foreground line-clamp-2 mb-3"
          title={room.description}
        >
          {room.description}
        </p>
      )}

      {/* AI Personality Badge */}
      {showAIPersonality && (
        <div className="flex items-center gap-1 text-xs mb-3">
          <span className="text-muted-foreground">AI:</span>
          <span className={aiInfo.color}>{aiInfo.label}</span>
        </div>
      )}

      {/* Participant Avatars */}
      {participantAvatars.length > 0 && (
        <div className="flex items-center -space-x-2 mb-3">
          {visibleAvatars.map((participant, index) => (
            <ParticipantAvatar
              key={participant.id}
              name={participant.name}
              avatarUrl={participant.avatarUrl}
              index={index}
            />
          ))}
          {overflowCount > 0 && (
            <ParticipantAvatar
              name=""
              index={maxAvatars}
              isOverflow
              overflowCount={overflowCount}
            />
          )}
        </div>
      )}

      {/* Room Info */}
      <div className="flex items-center gap-4 text-sm text-muted-foreground mb-4">
        <div className="flex items-center gap-1">
          <Users className="w-4 h-4" />
          <span>
            {room.participantCount}/{room.maxParticipants}
          </span>
        </div>
        <span>{formatRelativeTime(room.createdAt)}</span>
      </div>

      {/* Join Button */}
      <button
        onClick={handleJoin}
        disabled={!isJoinable || isJoining}
        className="w-full py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        aria-label={isJoinable ? `Join ${room.name}` : getJoinButtonText()}
      >
        {isJoining && <Loader2 className="w-4 h-4 animate-spin" />}
        {getJoinButtonText()}
      </button>
    </div>
  );
}

export default RoomCard;
