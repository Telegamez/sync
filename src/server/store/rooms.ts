/**
 * In-Memory Room Store
 *
 * Provides in-memory storage for rooms during Phase 2.
 * Will be replaced with database persistence in Phase 5.
 *
 * Part of the Long-Horizon Engineering Protocol - FEAT-101
 */

import { nanoid } from 'nanoid';
import type {
  Room,
  RoomId,
  RoomStatus,
  CreateRoomRequest,
  RoomSummary,
} from '@/types/room';
import type { Peer, PeerId } from '@/types/peer';
import { DEFAULT_VOICE_SETTINGS } from '@/types/voice-mode';

/**
 * In-memory room storage
 */
const rooms = new Map<RoomId, Room>();

/**
 * Generate a unique room ID
 */
export function generateRoomId(): RoomId {
  return nanoid(10);
}

/**
 * Create a new room
 */
export function createRoom(request: CreateRoomRequest, ownerId: PeerId): Room {
  const now = new Date();
  const roomId = generateRoomId();

  const room: Room = {
    id: roomId,
    name: request.name,
    description: request.description,
    maxParticipants: request.maxParticipants ?? 6,
    status: 'waiting',
    aiPersonality: request.aiPersonality ?? 'facilitator',
    voiceSettings: {
      ...DEFAULT_VOICE_SETTINGS,
      ...request.voiceSettings,
    },
    ownerId,
    participants: [],
    participantCount: 0,
    createdAt: now,
    lastActivityAt: now,
  };

  rooms.set(roomId, room);
  return room;
}

/**
 * Get a room by ID
 */
export function getRoom(roomId: RoomId): Room | undefined {
  return rooms.get(roomId);
}

/**
 * Get all rooms
 */
export function getAllRooms(): Room[] {
  return Array.from(rooms.values());
}

/**
 * Get rooms filtered by status
 */
export function getRoomsByStatus(status?: RoomStatus): Room[] {
  const allRooms = getAllRooms();
  if (!status) return allRooms;
  return allRooms.filter((room) => room.status === status);
}

/**
 * Get room summaries for listing
 */
export function getRoomSummaries(status?: RoomStatus): RoomSummary[] {
  const filteredRooms = getRoomsByStatus(status);
  return filteredRooms.map((room) => ({
    id: room.id,
    name: room.name,
    description: room.description,
    participantCount: room.participantCount,
    maxParticipants: room.maxParticipants,
    status: room.status,
    aiPersonality: room.aiPersonality,
    createdAt: room.createdAt,
  }));
}

/**
 * Update room status
 */
export function updateRoomStatus(roomId: RoomId, status: RoomStatus): Room | undefined {
  const room = rooms.get(roomId);
  if (!room) return undefined;

  room.status = status;
  room.lastActivityAt = new Date();
  return room;
}

/**
 * Add a participant to a room
 */
export function addParticipant(roomId: RoomId, peer: Peer): Room | undefined {
  const room = rooms.get(roomId);
  if (!room) return undefined;

  room.participants.push(peer);
  room.participantCount = room.participants.length;
  room.lastActivityAt = new Date();

  // Update status based on capacity
  if (room.participantCount >= room.maxParticipants) {
    room.status = 'full';
  } else if (room.participantCount > 0 && room.status === 'waiting') {
    room.status = 'active';
  }

  return room;
}

/**
 * Remove a participant from a room
 */
export function removeParticipant(roomId: RoomId, peerId: PeerId): Room | undefined {
  const room = rooms.get(roomId);
  if (!room) return undefined;

  room.participants = room.participants.filter((p) => p.id !== peerId);
  room.participantCount = room.participants.length;
  room.lastActivityAt = new Date();

  // Update status based on capacity
  if (room.participantCount === 0) {
    room.status = 'waiting';
  } else if (room.participantCount < room.maxParticipants && room.status === 'full') {
    room.status = 'active';
  }

  return room;
}

/**
 * Delete a room
 */
export function deleteRoom(roomId: RoomId): boolean {
  return rooms.delete(roomId);
}

/**
 * Close a room
 */
export function closeRoom(roomId: RoomId): Room | undefined {
  const room = rooms.get(roomId);
  if (!room) return undefined;

  room.status = 'closed';
  room.lastActivityAt = new Date();
  return room;
}

/**
 * Check if a room exists
 */
export function roomExists(roomId: RoomId): boolean {
  return rooms.has(roomId);
}

/**
 * Get room count
 */
export function getRoomCount(): number {
  return rooms.size;
}

/**
 * Clear all rooms (for testing)
 */
export function clearAllRooms(): void {
  rooms.clear();
}

/**
 * Update room activity timestamp
 */
export function touchRoom(roomId: RoomId): void {
  const room = rooms.get(roomId);
  if (room) {
    room.lastActivityAt = new Date();
  }
}
