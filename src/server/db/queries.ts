/**
 * Database Query Functions
 *
 * CRUD operations for room persistence.
 * Supports both mock mode (in-memory) and database mode.
 *
 * Part of the Long-Horizon Engineering Protocol - FEAT-402
 */

import { nanoid } from 'nanoid';
import type { UserId } from '@/types/auth';
import type { RoomId, RoomStatus, AIPersonality, CreateRoomRequest } from '@/types/room';
import type { PeerId, PeerRole } from '@/types/peer';
import type { RoomVoiceSettings } from '@/types/voice-mode';
import {
  RoomsTable,
  ParticipantsTable,
  RoomHistoryTable,
  RoomEventType,
  InsertRoom,
  UpdateRoom,
  InsertParticipant,
  UpdateParticipant,
  InsertRoomHistory,
  RoomWithCount,
  RoomWithParticipants,
  ParticipantWithUser,
  ROOM_DEFAULTS,
  DEFAULT_VOICE_SETTINGS_JSON,
  validateInsertRoom,
  validateInsertParticipant,
} from './schema';

// ========== Types ==========

/**
 * Database client interface
 * Can be implemented by Drizzle, Supabase, or mock
 */
export interface DatabaseClient {
  query<T>(sql: string, params?: unknown[]): Promise<T[]>;
  queryOne<T>(sql: string, params?: unknown[]): Promise<T | null>;
  execute(sql: string, params?: unknown[]): Promise<{ rowCount: number }>;
}

/**
 * Query options for filtering and pagination
 */
export interface QueryOptions {
  /** Filter by status */
  status?: RoomStatus | RoomStatus[];
  /** Filter by owner */
  ownerId?: UserId;
  /** Search by name (case-insensitive contains) */
  searchName?: string;
  /** Include only active (not deleted) */
  activeOnly?: boolean;
  /** Order by field */
  orderBy?: 'created_at' | 'last_activity_at' | 'name';
  /** Order direction */
  orderDir?: 'asc' | 'desc';
  /** Limit results */
  limit?: number;
  /** Offset for pagination */
  offset?: number;
}

/**
 * Result of a create operation
 */
export interface CreateResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  errors?: string[];
}

/**
 * Result of an update operation
 */
export interface UpdateResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  rowsAffected?: number;
}

/**
 * Result of a delete operation
 */
export interface DeleteResult {
  success: boolean;
  error?: string;
  rowsAffected?: number;
}

// ========== Mock Storage ==========

/**
 * In-memory storage for mock mode
 */
const mockRooms = new Map<RoomId, RoomsTable>();
const mockParticipants = new Map<string, ParticipantsTable>();
const mockHistory = new Map<string, RoomHistoryTable>();

/**
 * Clear all mock data (for testing)
 */
export function clearMockData(): void {
  mockRooms.clear();
  mockParticipants.clear();
  mockHistory.clear();
}

/**
 * Get mock storage maps (for testing)
 */
export function getMockStorage() {
  return {
    rooms: mockRooms,
    participants: mockParticipants,
    history: mockHistory,
  };
}

// ========== Room Queries ==========

/**
 * Generate a unique room ID
 */
export function generateRoomId(): RoomId {
  return nanoid(10);
}

/**
 * Generate a unique record ID
 */
export function generateRecordId(): string {
  return nanoid(21);
}

/**
 * Create a new room
 */
export async function createRoom(
  request: CreateRoomRequest & { ownerId: UserId },
  client?: DatabaseClient
): Promise<CreateResult<RoomsTable>> {
  const now = new Date();
  const roomId = generateRoomId();

  // Build voice settings JSON
  const voiceSettings = request.voiceSettings
    ? JSON.stringify(request.voiceSettings)
    : DEFAULT_VOICE_SETTINGS_JSON;

  const insertData: InsertRoom = {
    id: roomId,
    name: request.name,
    description: request.description ?? null,
    max_participants: request.maxParticipants ?? ROOM_DEFAULTS.max_participants,
    status: ROOM_DEFAULTS.status,
    ai_personality: request.aiPersonality ?? ROOM_DEFAULTS.ai_personality,
    custom_instructions: null,
    voice_settings: voiceSettings,
    owner_id: request.ownerId,
    created_at: now,
    last_activity_at: now,
  };

  // Validate
  const validation = validateInsertRoom(insertData);
  if (!validation.valid) {
    return { success: false, errors: validation.errors };
  }

  // Use mock or database
  if (!client) {
    // Mock mode
    const room: RoomsTable = {
      ...insertData,
      description: insertData.description ?? null,
      max_participants: insertData.max_participants!,
      status: insertData.status!,
      ai_personality: insertData.ai_personality!,
      custom_instructions: insertData.custom_instructions ?? null,
      created_at: insertData.created_at!,
      last_activity_at: insertData.last_activity_at!,
      closed_at: null,
      deleted_at: null,
    };
    mockRooms.set(roomId, room);

    // Record history event
    await recordRoomEvent(roomId, 'room_created', request.ownerId, null, { name: request.name });

    return { success: true, data: room };
  }

  // Database mode
  try {
    const result = await client.queryOne<RoomsTable>(
      `INSERT INTO rooms (id, name, description, max_participants, status, ai_personality, custom_instructions, voice_settings, owner_id, created_at, last_activity_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        insertData.id,
        insertData.name,
        insertData.description,
        insertData.max_participants,
        insertData.status,
        insertData.ai_personality,
        insertData.custom_instructions,
        insertData.voice_settings,
        insertData.owner_id,
        insertData.created_at,
        insertData.last_activity_at,
      ]
    );

    if (result) {
      await recordRoomEvent(roomId, 'room_created', request.ownerId, null, { name: request.name }, client);
      return { success: true, data: result };
    }
    return { success: false, error: 'Failed to create room' };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

/**
 * Get a room by ID
 */
export async function getRoom(
  roomId: RoomId,
  client?: DatabaseClient
): Promise<RoomsTable | null> {
  if (!client) {
    const room = mockRooms.get(roomId);
    return room && !room.deleted_at ? room : null;
  }

  return client.queryOne<RoomsTable>(
    `SELECT * FROM rooms WHERE id = $1 AND deleted_at IS NULL`,
    [roomId]
  );
}

/**
 * Get a room with participant count
 */
export async function getRoomWithCount(
  roomId: RoomId,
  client?: DatabaseClient
): Promise<RoomWithCount | null> {
  if (!client) {
    const room = mockRooms.get(roomId);
    if (!room || room.deleted_at) return null;

    const participants = Array.from(mockParticipants.values()).filter(
      (p) => p.room_id === roomId && p.is_active
    );
    return { ...room, participant_count: participants.length };
  }

  return client.queryOne<RoomWithCount>(
    `SELECT r.*,
            COALESCE((SELECT COUNT(*) FROM participants p WHERE p.room_id = r.id AND p.is_active = true), 0)::int AS participant_count
     FROM rooms r
     WHERE r.id = $1 AND r.deleted_at IS NULL`,
    [roomId]
  );
}

/**
 * Get a room with all participants
 */
export async function getRoomWithParticipants(
  roomId: RoomId,
  client?: DatabaseClient
): Promise<RoomWithParticipants | null> {
  if (!client) {
    const room = mockRooms.get(roomId);
    if (!room || room.deleted_at) return null;

    const participants = Array.from(mockParticipants.values()).filter(
      (p) => p.room_id === roomId && p.is_active
    );
    return { ...room, participants };
  }

  const room = await client.queryOne<RoomsTable>(
    `SELECT * FROM rooms WHERE id = $1 AND deleted_at IS NULL`,
    [roomId]
  );

  if (!room) return null;

  const participants = await client.query<ParticipantsTable>(
    `SELECT * FROM participants WHERE room_id = $1 AND is_active = true ORDER BY joined_at ASC`,
    [roomId]
  );

  return { ...room, participants };
}

/**
 * Get rooms with filtering and pagination
 */
export async function getRooms(
  options: QueryOptions = {},
  client?: DatabaseClient
): Promise<RoomWithCount[]> {
  const {
    status,
    ownerId,
    searchName,
    activeOnly = true,
    orderBy = 'created_at',
    orderDir = 'desc',
    limit = 50,
    offset = 0,
  } = options;

  if (!client) {
    let rooms = Array.from(mockRooms.values());

    // Filter deleted
    if (activeOnly) {
      rooms = rooms.filter((r) => !r.deleted_at);
    }

    // Filter by status
    if (status) {
      const statuses = Array.isArray(status) ? status : [status];
      rooms = rooms.filter((r) => statuses.includes(r.status));
    }

    // Filter by owner
    if (ownerId) {
      rooms = rooms.filter((r) => r.owner_id === ownerId);
    }

    // Search by name
    if (searchName) {
      const search = searchName.toLowerCase();
      rooms = rooms.filter((r) => r.name.toLowerCase().includes(search));
    }

    // Sort
    rooms.sort((a, b) => {
      const aVal = a[orderBy];
      const bVal = b[orderBy];
      if (aVal instanceof Date && bVal instanceof Date) {
        return orderDir === 'asc'
          ? aVal.getTime() - bVal.getTime()
          : bVal.getTime() - aVal.getTime();
      }
      const aStr = String(aVal).toLowerCase();
      const bStr = String(bVal).toLowerCase();
      return orderDir === 'asc' ? aStr.localeCompare(bStr) : bStr.localeCompare(aStr);
    });

    // Paginate
    const paginated = rooms.slice(offset, offset + limit);

    // Add participant counts
    return paginated.map((room) => {
      const count = Array.from(mockParticipants.values()).filter(
        (p) => p.room_id === room.id && p.is_active
      ).length;
      return { ...room, participant_count: count };
    });
  }

  // Build SQL query
  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (activeOnly) {
    conditions.push('r.deleted_at IS NULL');
  }

  if (status) {
    const statuses = Array.isArray(status) ? status : [status];
    conditions.push(`r.status = ANY($${paramIndex})`);
    params.push(statuses);
    paramIndex++;
  }

  if (ownerId) {
    conditions.push(`r.owner_id = $${paramIndex}`);
    params.push(ownerId);
    paramIndex++;
  }

  if (searchName) {
    conditions.push(`r.name ILIKE $${paramIndex}`);
    params.push(`%${searchName}%`);
    paramIndex++;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const orderColumn = orderBy === 'name' ? 'r.name' : `r.${orderBy}`;
  const orderClause = `ORDER BY ${orderColumn} ${orderDir.toUpperCase()}`;

  params.push(limit, offset);

  return client.query<RoomWithCount>(
    `SELECT r.*,
            COALESCE((SELECT COUNT(*) FROM participants p WHERE p.room_id = r.id AND p.is_active = true), 0)::int AS participant_count
     FROM rooms r
     ${whereClause}
     ${orderClause}
     LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
    params
  );
}

/**
 * Update a room
 */
export async function updateRoom(
  roomId: RoomId,
  updates: UpdateRoom,
  client?: DatabaseClient
): Promise<UpdateResult<RoomsTable>> {
  if (!client) {
    const room = mockRooms.get(roomId);
    if (!room || room.deleted_at) {
      return { success: false, error: 'Room not found', rowsAffected: 0 };
    }

    // Apply updates
    const updatedRoom: RoomsTable = {
      ...room,
      ...updates,
      last_activity_at: updates.last_activity_at ?? new Date(),
    };
    mockRooms.set(roomId, updatedRoom);

    return { success: true, data: updatedRoom, rowsAffected: 1 };
  }

  // Build SET clause
  const setClauses: string[] = [];
  const params: unknown[] = [];
  let paramIndex = 1;

  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined) {
      setClauses.push(`${key} = $${paramIndex}`);
      params.push(value);
      paramIndex++;
    }
  }

  if (setClauses.length === 0) {
    return { success: false, error: 'No updates provided', rowsAffected: 0 };
  }

  // Always update last_activity_at
  if (!updates.last_activity_at) {
    setClauses.push(`last_activity_at = NOW()`);
  }

  params.push(roomId);

  try {
    const result = await client.queryOne<RoomsTable>(
      `UPDATE rooms SET ${setClauses.join(', ')} WHERE id = $${paramIndex} AND deleted_at IS NULL RETURNING *`,
      params
    );

    if (result) {
      return { success: true, data: result, rowsAffected: 1 };
    }
    return { success: false, error: 'Room not found', rowsAffected: 0 };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

/**
 * Update room voice settings
 */
export async function updateRoomVoiceSettings(
  roomId: RoomId,
  voiceSettings: Partial<RoomVoiceSettings>,
  client?: DatabaseClient
): Promise<UpdateResult<RoomsTable>> {
  // Get current settings first
  const room = await getRoom(roomId, client);
  if (!room) {
    return { success: false, error: 'Room not found' };
  }

  // Merge with existing settings
  const currentSettings: RoomVoiceSettings = JSON.parse(room.voice_settings || DEFAULT_VOICE_SETTINGS_JSON);
  const newSettings = { ...currentSettings, ...voiceSettings };

  return updateRoom(roomId, { voice_settings: JSON.stringify(newSettings) }, client);
}

/**
 * Update room status
 */
export async function updateRoomStatus(
  roomId: RoomId,
  status: RoomStatus,
  client?: DatabaseClient
): Promise<UpdateResult<RoomsTable>> {
  const updates: UpdateRoom = { status };

  if (status === 'closed') {
    updates.closed_at = new Date();
  }

  return updateRoom(roomId, updates, client);
}

/**
 * Soft delete a room
 */
export async function deleteRoom(
  roomId: RoomId,
  userId: UserId,
  client?: DatabaseClient
): Promise<DeleteResult> {
  if (!client) {
    const room = mockRooms.get(roomId);
    if (!room || room.deleted_at) {
      return { success: false, error: 'Room not found', rowsAffected: 0 };
    }

    room.deleted_at = new Date();
    room.status = 'closed';
    await recordRoomEvent(roomId, 'room_deleted', userId, null, null);

    return { success: true, rowsAffected: 1 };
  }

  try {
    const result = await client.execute(
      `UPDATE rooms SET deleted_at = NOW(), status = 'closed' WHERE id = $1 AND deleted_at IS NULL`,
      [roomId]
    );

    if (result.rowCount > 0) {
      await recordRoomEvent(roomId, 'room_deleted', userId, null, null, client);
      return { success: true, rowsAffected: result.rowCount };
    }
    return { success: false, error: 'Room not found', rowsAffected: 0 };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

/**
 * Hard delete a room (permanent)
 */
export async function hardDeleteRoom(
  roomId: RoomId,
  client?: DatabaseClient
): Promise<DeleteResult> {
  if (!client) {
    const existed = mockRooms.delete(roomId);
    // Also delete related data
    Array.from(mockParticipants.entries()).forEach(([id, p]) => {
      if (p.room_id === roomId) mockParticipants.delete(id);
    });
    Array.from(mockHistory.entries()).forEach(([id, h]) => {
      if (h.room_id === roomId) mockHistory.delete(id);
    });
    return { success: existed, rowsAffected: existed ? 1 : 0 };
  }

  try {
    // CASCADE will handle related records
    const result = await client.execute(`DELETE FROM rooms WHERE id = $1`, [roomId]);
    return { success: true, rowsAffected: result.rowCount };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

/**
 * Close a room
 */
export async function closeRoom(
  roomId: RoomId,
  userId: UserId,
  client?: DatabaseClient
): Promise<UpdateResult<RoomsTable>> {
  const result = await updateRoomStatus(roomId, 'closed', client);
  if (result.success) {
    await recordRoomEvent(roomId, 'room_closed', userId, null, null, client);
  }
  return result;
}

/**
 * Check if a room exists
 */
export async function roomExists(
  roomId: RoomId,
  client?: DatabaseClient
): Promise<boolean> {
  if (!client) {
    const room = mockRooms.get(roomId);
    return !!room && !room.deleted_at;
  }

  const result = await client.queryOne<{ exists: boolean }>(
    `SELECT EXISTS(SELECT 1 FROM rooms WHERE id = $1 AND deleted_at IS NULL) AS exists`,
    [roomId]
  );
  return result?.exists ?? false;
}

/**
 * Get room count
 */
export async function getRoomCount(
  options: QueryOptions = {},
  client?: DatabaseClient
): Promise<number> {
  if (!client) {
    let rooms = Array.from(mockRooms.values());
    if (options.activeOnly !== false) {
      rooms = rooms.filter((r) => !r.deleted_at);
    }
    if (options.status) {
      const statuses = Array.isArray(options.status) ? options.status : [options.status];
      rooms = rooms.filter((r) => statuses.includes(r.status));
    }
    if (options.ownerId) {
      rooms = rooms.filter((r) => r.owner_id === options.ownerId);
    }
    return rooms.length;
  }

  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (options.activeOnly !== false) {
    conditions.push('deleted_at IS NULL');
  }
  if (options.status) {
    const statuses = Array.isArray(options.status) ? options.status : [options.status];
    conditions.push(`status = ANY($${paramIndex})`);
    params.push(statuses);
    paramIndex++;
  }
  if (options.ownerId) {
    conditions.push(`owner_id = $${paramIndex}`);
    params.push(options.ownerId);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const result = await client.queryOne<{ count: number }>(
    `SELECT COUNT(*)::int AS count FROM rooms ${whereClause}`,
    params
  );
  return result?.count ?? 0;
}

// ========== Participant Queries ==========

/**
 * Add a participant to a room
 */
export async function addParticipant(
  roomId: RoomId,
  userId: UserId,
  peerId: PeerId,
  displayName: string,
  role: PeerRole = 'participant',
  avatarUrl?: string,
  client?: DatabaseClient
): Promise<CreateResult<ParticipantsTable>> {
  const now = new Date();
  const id = generateRecordId();

  const insertData: InsertParticipant = {
    id,
    room_id: roomId,
    user_id: userId,
    peer_id: peerId,
    display_name: displayName,
    avatar_url: avatarUrl ?? null,
    role,
    joined_at: now,
    is_active: true,
  };

  // Validate
  const validation = validateInsertParticipant(insertData);
  if (!validation.valid) {
    return { success: false, errors: validation.errors };
  }

  if (!client) {
    // Check room exists
    const room = mockRooms.get(roomId);
    if (!room || room.deleted_at) {
      return { success: false, error: 'Room not found' };
    }

    // Check room capacity
    const currentCount = Array.from(mockParticipants.values()).filter(
      (p) => p.room_id === roomId && p.is_active
    ).length;
    if (currentCount >= room.max_participants) {
      return { success: false, error: 'Room is full' };
    }

    const participant: ParticipantsTable = {
      ...insertData,
      avatar_url: insertData.avatar_url ?? null,
      role: insertData.role!,
      joined_at: insertData.joined_at!,
      is_active: insertData.is_active!,
      left_at: null,
      total_time_seconds: 0,
    };
    mockParticipants.set(id, participant);

    // Update room status
    await updateRoomStatusBasedOnParticipants(roomId, client);

    // Record event
    await recordRoomEvent(roomId, 'participant_joined', userId, peerId, { displayName, role });

    return { success: true, data: participant };
  }

  try {
    // Check capacity first
    const room = await getRoomWithCount(roomId, client);
    if (!room) {
      return { success: false, error: 'Room not found' };
    }
    if (room.participant_count >= room.max_participants) {
      return { success: false, error: 'Room is full' };
    }

    const result = await client.queryOne<ParticipantsTable>(
      `INSERT INTO participants (id, room_id, user_id, peer_id, display_name, avatar_url, role, joined_at, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [id, roomId, userId, peerId, displayName, avatarUrl ?? null, role, now, true]
    );

    if (result) {
      await updateRoomStatusBasedOnParticipants(roomId, client);
      await recordRoomEvent(roomId, 'participant_joined', userId, peerId, { displayName, role }, client);
      return { success: true, data: result };
    }
    return { success: false, error: 'Failed to add participant' };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

/**
 * Remove a participant from a room
 */
export async function removeParticipant(
  roomId: RoomId,
  peerId: PeerId,
  client?: DatabaseClient
): Promise<UpdateResult<ParticipantsTable>> {
  const now = new Date();

  if (!client) {
    // Find participant by peer_id
    const participant = Array.from(mockParticipants.values()).find(
      p => p.room_id === roomId && p.peer_id === peerId && p.is_active
    );

    if (!participant) {
      return { success: false, error: 'Participant not found', rowsAffected: 0 };
    }

    // Calculate time in room
    const timeInRoom = Math.floor((now.getTime() - participant.joined_at.getTime()) / 1000);

    participant.left_at = now;
    participant.is_active = false;
    participant.total_time_seconds = timeInRoom;

    // Update room status
    await updateRoomStatusBasedOnParticipants(roomId, client);

    // Record event
    await recordRoomEvent(roomId, 'participant_left', participant.user_id, peerId, { timeInRoom });

    return { success: true, data: participant, rowsAffected: 1 };
  }

  try {
    const result = await client.queryOne<ParticipantsTable>(
      `UPDATE participants
       SET left_at = NOW(),
           is_active = false,
           total_time_seconds = EXTRACT(EPOCH FROM (NOW() - joined_at))::int
       WHERE room_id = $1 AND peer_id = $2 AND is_active = true
       RETURNING *`,
      [roomId, peerId]
    );

    if (result) {
      await updateRoomStatusBasedOnParticipants(roomId, client);
      await recordRoomEvent(roomId, 'participant_left', result.user_id, peerId, { timeInRoom: result.total_time_seconds }, client);
      return { success: true, data: result, rowsAffected: 1 };
    }
    return { success: false, error: 'Participant not found', rowsAffected: 0 };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

/**
 * Kick a participant from a room
 */
export async function kickParticipant(
  roomId: RoomId,
  peerId: PeerId,
  kickedBy: UserId,
  reason?: string,
  client?: DatabaseClient
): Promise<UpdateResult<ParticipantsTable>> {
  const result = await removeParticipant(roomId, peerId, client);
  if (result.success && result.data) {
    await recordRoomEvent(
      roomId,
      'participant_kicked',
      kickedBy,
      peerId,
      { kickedUserId: result.data.user_id, reason },
      client
    );
  }
  return result;
}

/**
 * Update a participant's role
 */
export async function updateParticipantRole(
  roomId: RoomId,
  peerId: PeerId,
  newRole: PeerRole,
  changedBy: UserId,
  client?: DatabaseClient
): Promise<UpdateResult<ParticipantsTable>> {
  if (!client) {
    const participant = Array.from(mockParticipants.values()).find(
      p => p.room_id === roomId && p.peer_id === peerId && p.is_active
    );
    if (participant) {
      const oldRole = participant.role;
      participant.role = newRole;
      await recordRoomEvent(roomId, 'role_changed', changedBy, peerId, { oldRole, newRole });
      return { success: true, data: participant, rowsAffected: 1 };
    }
    return { success: false, error: 'Participant not found', rowsAffected: 0 };
  }

  try {
    // Get current role for event
    const current = await client.queryOne<ParticipantsTable>(
      `SELECT * FROM participants WHERE room_id = $1 AND peer_id = $2 AND is_active = true`,
      [roomId, peerId]
    );

    if (!current) {
      return { success: false, error: 'Participant not found', rowsAffected: 0 };
    }

    const result = await client.queryOne<ParticipantsTable>(
      `UPDATE participants SET role = $1 WHERE room_id = $2 AND peer_id = $3 AND is_active = true RETURNING *`,
      [newRole, roomId, peerId]
    );

    if (result) {
      await recordRoomEvent(roomId, 'role_changed', changedBy, peerId, { oldRole: current.role, newRole }, client);
      return { success: true, data: result, rowsAffected: 1 };
    }
    return { success: false, error: 'Failed to update role', rowsAffected: 0 };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

/**
 * Get participants in a room
 */
export async function getParticipants(
  roomId: RoomId,
  activeOnly: boolean = true,
  client?: DatabaseClient
): Promise<ParticipantsTable[]> {
  if (!client) {
    return Array.from(mockParticipants.values()).filter(
      (p) => p.room_id === roomId && (!activeOnly || p.is_active)
    );
  }

  const activeClause = activeOnly ? 'AND is_active = true' : '';
  return client.query<ParticipantsTable>(
    `SELECT * FROM participants WHERE room_id = $1 ${activeClause} ORDER BY joined_at ASC`,
    [roomId]
  );
}

/**
 * Get a participant by peer ID
 */
export async function getParticipantByPeerId(
  roomId: RoomId,
  peerId: PeerId,
  client?: DatabaseClient
): Promise<ParticipantsTable | null> {
  if (!client) {
    return Array.from(mockParticipants.values()).find(
      p => p.room_id === roomId && p.peer_id === peerId && p.is_active
    ) ?? null;
  }

  return client.queryOne<ParticipantsTable>(
    `SELECT * FROM participants WHERE room_id = $1 AND peer_id = $2 AND is_active = true`,
    [roomId, peerId]
  );
}

/**
 * Get participant count for a room
 */
export async function getParticipantCount(
  roomId: RoomId,
  client?: DatabaseClient
): Promise<number> {
  if (!client) {
    return Array.from(mockParticipants.values()).filter(
      (p) => p.room_id === roomId && p.is_active
    ).length;
  }

  const result = await client.queryOne<{ count: number }>(
    `SELECT COUNT(*)::int AS count FROM participants WHERE room_id = $1 AND is_active = true`,
    [roomId]
  );
  return result?.count ?? 0;
}

// ========== Helper Functions ==========

/**
 * Update room status based on participant count
 */
async function updateRoomStatusBasedOnParticipants(
  roomId: RoomId,
  client?: DatabaseClient
): Promise<void> {
  const room = await getRoom(roomId, client);
  if (!room || room.status === 'closed') return;

  const count = await getParticipantCount(roomId, client);

  let newStatus: RoomStatus;
  if (count >= room.max_participants) {
    newStatus = 'full';
  } else if (count > 0) {
    newStatus = 'active';
  } else {
    newStatus = 'waiting';
  }

  if (room.status !== newStatus) {
    await updateRoom(roomId, { status: newStatus }, client);
  }
}

// ========== Room History ==========

/**
 * Record a room event
 */
export async function recordRoomEvent(
  roomId: RoomId,
  eventType: RoomEventType,
  userId: UserId | null,
  peerId: PeerId | null,
  eventData: Record<string, unknown> | null,
  client?: DatabaseClient
): Promise<CreateResult<RoomHistoryTable>> {
  const now = new Date();
  const id = generateRecordId();

  const insertData: InsertRoomHistory = {
    id,
    room_id: roomId,
    event_type: eventType,
    user_id: userId,
    peer_id: peerId,
    event_data: eventData ? JSON.stringify(eventData) : null,
    created_at: now,
  };

  if (!client) {
    const history: RoomHistoryTable = {
      ...insertData,
      user_id: insertData.user_id ?? null,
      peer_id: insertData.peer_id ?? null,
      event_data: insertData.event_data ?? null,
      created_at: insertData.created_at!,
    };
    mockHistory.set(id, history);
    return { success: true, data: history };
  }

  try {
    const result = await client.queryOne<RoomHistoryTable>(
      `INSERT INTO room_history (id, room_id, event_type, user_id, peer_id, event_data, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [id, roomId, eventType, userId, peerId, insertData.event_data, now]
    );

    if (result) {
      return { success: true, data: result };
    }
    return { success: false, error: 'Failed to record event' };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

/**
 * Get room history
 */
export async function getRoomHistory(
  roomId: RoomId,
  options: {
    eventTypes?: RoomEventType[];
    limit?: number;
    offset?: number;
  } = {},
  client?: DatabaseClient
): Promise<RoomHistoryTable[]> {
  const { eventTypes, limit = 100, offset = 0 } = options;

  if (!client) {
    let history = Array.from(mockHistory.values()).filter((h) => h.room_id === roomId);

    if (eventTypes && eventTypes.length > 0) {
      history = history.filter((h) => eventTypes.includes(h.event_type));
    }

    // Sort by created_at desc
    history.sort((a, b) => b.created_at.getTime() - a.created_at.getTime());

    return history.slice(offset, offset + limit);
  }

  if (eventTypes && eventTypes.length > 0) {
    return client.query<RoomHistoryTable>(
      `SELECT * FROM room_history WHERE room_id = $1 AND event_type = ANY($2) ORDER BY created_at DESC LIMIT $3 OFFSET $4`,
      [roomId, eventTypes, limit, offset]
    );
  }

  return client.query<RoomHistoryTable>(
    `SELECT * FROM room_history WHERE room_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
    [roomId, limit, offset]
  );
}

// ========== Factory Functions ==========

/**
 * Create a RoomQueries instance with optional database client
 */
export function createRoomQueries(client?: DatabaseClient) {
  return {
    // Room operations
    generateRoomId,
    createRoom: (request: CreateRoomRequest & { ownerId: UserId }) => createRoom(request, client),
    getRoom: (roomId: RoomId) => getRoom(roomId, client),
    getRoomWithCount: (roomId: RoomId) => getRoomWithCount(roomId, client),
    getRoomWithParticipants: (roomId: RoomId) => getRoomWithParticipants(roomId, client),
    getRooms: (options?: QueryOptions) => getRooms(options, client),
    updateRoom: (roomId: RoomId, updates: UpdateRoom) => updateRoom(roomId, updates, client),
    updateRoomVoiceSettings: (roomId: RoomId, settings: Partial<RoomVoiceSettings>) =>
      updateRoomVoiceSettings(roomId, settings, client),
    updateRoomStatus: (roomId: RoomId, status: RoomStatus) => updateRoomStatus(roomId, status, client),
    deleteRoom: (roomId: RoomId, userId: UserId) => deleteRoom(roomId, userId, client),
    hardDeleteRoom: (roomId: RoomId) => hardDeleteRoom(roomId, client),
    closeRoom: (roomId: RoomId, userId: UserId) => closeRoom(roomId, userId, client),
    roomExists: (roomId: RoomId) => roomExists(roomId, client),
    getRoomCount: (options?: QueryOptions) => getRoomCount(options, client),

    // Participant operations
    addParticipant: (
      roomId: RoomId,
      userId: UserId,
      peerId: PeerId,
      displayName: string,
      role?: PeerRole,
      avatarUrl?: string
    ) => addParticipant(roomId, userId, peerId, displayName, role, avatarUrl, client),
    removeParticipant: (roomId: RoomId, peerId: PeerId) => removeParticipant(roomId, peerId, client),
    kickParticipant: (roomId: RoomId, peerId: PeerId, kickedBy: UserId, reason?: string) =>
      kickParticipant(roomId, peerId, kickedBy, reason, client),
    updateParticipantRole: (roomId: RoomId, peerId: PeerId, newRole: PeerRole, changedBy: UserId) =>
      updateParticipantRole(roomId, peerId, newRole, changedBy, client),
    getParticipants: (roomId: RoomId, activeOnly?: boolean) => getParticipants(roomId, activeOnly, client),
    getParticipantByPeerId: (roomId: RoomId, peerId: PeerId) => getParticipantByPeerId(roomId, peerId, client),
    getParticipantCount: (roomId: RoomId) => getParticipantCount(roomId, client),

    // History operations
    recordRoomEvent: (
      roomId: RoomId,
      eventType: RoomEventType,
      userId: UserId | null,
      peerId: PeerId | null,
      eventData: Record<string, unknown> | null
    ) => recordRoomEvent(roomId, eventType, userId, peerId, eventData, client),
    getRoomHistory: (roomId: RoomId, options?: { eventTypes?: RoomEventType[]; limit?: number; offset?: number }) =>
      getRoomHistory(roomId, options, client),

    // Utilities
    clearMockData,
  };
}

// Default export for mock mode
export const roomQueries = createRoomQueries();
