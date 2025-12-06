/**
 * RoomLobby Component
 *
 * Displays a list of available rooms with search/filter and create room button.
 * Allows users to browse and join existing rooms.
 *
 * Part of the Long-Horizon Engineering Protocol - FEAT-111
 */

'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Search, Plus, RefreshCw, Users, Loader2, AlertCircle } from 'lucide-react';
import type { RoomSummary, RoomStatus } from '@/types/room';

/**
 * Props for the RoomLobby component
 */
export interface RoomLobbyProps {
  /** Callback when user clicks join on a room */
  onJoinRoom: (roomId: string) => void;
  /** Callback when user clicks create room button */
  onCreateRoom: () => void;
  /** Optional custom fetch function for rooms */
  fetchRooms?: (status?: RoomStatus) => Promise<{ rooms: RoomSummary[]; total: number }>;
  /** Auto-refresh interval in ms (0 to disable) */
  refreshInterval?: number;
  /** Whether to show the create room button */
  showCreateButton?: boolean;
  /** Custom class name */
  className?: string;
}

/**
 * Status filter options
 */
const STATUS_FILTERS: { value: RoomStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'All Rooms' },
  { value: 'waiting', label: 'Waiting' },
  { value: 'active', label: 'Active' },
  { value: 'full', label: 'Full' },
];

/**
 * Default fetch function using the rooms API
 */
async function defaultFetchRooms(status?: RoomStatus): Promise<{ rooms: RoomSummary[]; total: number }> {
  const url = status ? `/api/rooms?status=${status}` : '/api/rooms';
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error('Failed to fetch rooms');
  }
  return response.json();
}

/**
 * Get status badge color classes
 */
function getStatusBadgeClasses(status: RoomStatus): string {
  switch (status) {
    case 'waiting':
      return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
    case 'active':
      return 'bg-green-500/20 text-green-400 border-green-500/30';
    case 'full':
      return 'bg-red-500/20 text-red-400 border-red-500/30';
    case 'closed':
      return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
    default:
      return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
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

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}

/**
 * RoomLobby Component
 *
 * Displays available rooms with search, filter, and join functionality.
 *
 * @example
 * ```tsx
 * <RoomLobby
 *   onJoinRoom={(roomId) => router.push(`/rooms/${roomId}`)}
 *   onCreateRoom={() => router.push('/rooms/create')}
 *   refreshInterval={30000}
 * />
 * ```
 */
export function RoomLobby({
  onJoinRoom,
  onCreateRoom,
  fetchRooms = defaultFetchRooms,
  refreshInterval = 30000,
  showCreateButton = true,
  className = '',
}: RoomLobbyProps) {
  // State
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<RoomStatus | 'all'>('all');
  const [isRefreshing, setIsRefreshing] = useState(false);

  /**
   * Load rooms from API
   */
  const loadRooms = useCallback(async (showRefreshing = false) => {
    if (showRefreshing) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    setError(null);

    try {
      const status = statusFilter === 'all' ? undefined : statusFilter;
      const result = await fetchRooms(status);
      setRooms(result.rooms);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load rooms');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [fetchRooms, statusFilter]);

  // Initial load and filter changes
  useEffect(() => {
    loadRooms();
  }, [loadRooms]);

  // Auto-refresh
  useEffect(() => {
    if (refreshInterval <= 0) return;

    const intervalId = setInterval(() => {
      loadRooms(true);
    }, refreshInterval);

    return () => clearInterval(intervalId);
  }, [refreshInterval, loadRooms]);

  /**
   * Filter rooms by search query
   */
  const filteredRooms = useMemo(() => {
    if (!searchQuery.trim()) return rooms;

    const query = searchQuery.toLowerCase();
    return rooms.filter(
      (room) =>
        room.name.toLowerCase().includes(query) ||
        room.description?.toLowerCase().includes(query)
    );
  }, [rooms, searchQuery]);

  /**
   * Handle manual refresh
   */
  const handleRefresh = useCallback(() => {
    loadRooms(true);
  }, [loadRooms]);

  /**
   * Handle join room click
   */
  const handleJoinClick = useCallback(
    (roomId: string, status: RoomStatus) => {
      if (status === 'full' || status === 'closed') return;
      onJoinRoom(roomId);
    },
    [onJoinRoom]
  );

  return (
    <div className={`flex flex-col h-full ${className}`}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search rooms..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-card border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            aria-label="Search rooms"
          />
        </div>

        {/* Filter and Actions */}
        <div className="flex gap-2">
          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as RoomStatus | 'all')}
            className="px-3 py-2 bg-card border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            aria-label="Filter by status"
          >
            {STATUS_FILTERS.map((filter) => (
              <option key={filter.value} value={filter.value}>
                {filter.label}
              </option>
            ))}
          </select>

          {/* Refresh Button */}
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="p-2 bg-card border border-border rounded-lg hover:bg-muted transition-colors disabled:opacity-50"
            aria-label="Refresh rooms"
          >
            <RefreshCw className={`w-5 h-5 text-foreground ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>

          {/* Create Room Button */}
          {showCreateButton && (
            <button
              onClick={onCreateRoom}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity"
              aria-label="Create new room"
            >
              <Plus className="w-5 h-5" />
              <span className="hidden sm:inline">Create Room</span>
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {/* Loading State */}
        {isLoading && (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="w-8 h-8 animate-spin mb-4" />
            <p>Loading rooms...</p>
          </div>
        )}

        {/* Error State */}
        {!isLoading && error && (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <AlertCircle className="w-8 h-8 text-red-400 mb-4" />
            <p className="text-red-400 mb-4">{error}</p>
            <button
              onClick={handleRefresh}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity"
            >
              Try Again
            </button>
          </div>
        )}

        {/* Empty State */}
        {!isLoading && !error && filteredRooms.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Users className="w-12 h-12 mb-4 opacity-50" />
            {searchQuery ? (
              <>
                <p className="text-lg mb-2">No rooms match your search</p>
                <p className="text-sm">Try a different search term</p>
              </>
            ) : (
              <>
                <p className="text-lg mb-2">No rooms available</p>
                <p className="text-sm mb-4">Be the first to create one!</p>
                {showCreateButton && (
                  <button
                    onClick={onCreateRoom}
                    className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity"
                  >
                    <Plus className="w-5 h-5" />
                    Create Room
                  </button>
                )}
              </>
            )}
          </div>
        )}

        {/* Room List */}
        {!isLoading && !error && filteredRooms.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredRooms.map((room) => (
              <div
                key={room.id}
                className="flex flex-col p-4 bg-card border border-border rounded-lg hover:border-primary/50 transition-colors"
              >
                {/* Room Header */}
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h3 className="font-semibold text-foreground truncate flex-1">
                    {room.name}
                  </h3>
                  <span
                    className={`px-2 py-0.5 text-xs font-medium border rounded-full ${getStatusBadgeClasses(room.status)}`}
                  >
                    {room.status}
                  </span>
                </div>

                {/* Description */}
                {room.description && (
                  <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
                    {room.description}
                  </p>
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
                  onClick={() => handleJoinClick(room.id, room.status)}
                  disabled={room.status === 'full' || room.status === 'closed'}
                  className="w-full py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {room.status === 'full'
                    ? 'Room Full'
                    : room.status === 'closed'
                    ? 'Closed'
                    : 'Join Room'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer with room count */}
      {!isLoading && !error && filteredRooms.length > 0 && (
        <div className="mt-4 pt-4 border-t border-border text-sm text-muted-foreground text-center">
          {searchQuery
            ? `${filteredRooms.length} of ${rooms.length} rooms`
            : `${rooms.length} room${rooms.length !== 1 ? 's' : ''} available`}
        </div>
      )}
    </div>
  );
}

export default RoomLobby;
