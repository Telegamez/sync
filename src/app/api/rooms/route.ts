/**
 * Room CRUD API Endpoints
 *
 * POST /api/rooms - Create a new room
 * GET /api/rooms - List all rooms
 *
 * Part of the Long-Horizon Engineering Protocol - FEAT-101, FEAT-102
 */

import { NextRequest, NextResponse } from 'next/server';
import { nanoid } from 'nanoid';
import {
  createRoom,
  getRoomSummaries,
} from '@/server/store/rooms';
import type { CreateRoomRequest, RoomStatus } from '@/types/room';

/**
 * Validation constants
 */
const ROOM_NAME_MIN_LENGTH = 2;
const ROOM_NAME_MAX_LENGTH = 100;
const MIN_PARTICIPANTS = 2;
const MAX_PARTICIPANTS = 10;

/**
 * Validate room creation request
 */
function validateCreateRequest(body: unknown): {
  valid: boolean;
  error?: string;
  data?: CreateRoomRequest;
} {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Request body is required' };
  }

  const { name, description, maxParticipants, aiPersonality, voiceSettings } =
    body as CreateRoomRequest;

  // Validate name
  if (!name || typeof name !== 'string') {
    return { valid: false, error: 'Room name is required' };
  }

  const trimmedName = name.trim();
  if (trimmedName.length < ROOM_NAME_MIN_LENGTH) {
    return {
      valid: false,
      error: `Room name must be at least ${ROOM_NAME_MIN_LENGTH} characters`,
    };
  }

  if (trimmedName.length > ROOM_NAME_MAX_LENGTH) {
    return {
      valid: false,
      error: `Room name must be at most ${ROOM_NAME_MAX_LENGTH} characters`,
    };
  }

  // Validate description (optional)
  if (description !== undefined && typeof description !== 'string') {
    return { valid: false, error: 'Description must be a string' };
  }

  // Validate maxParticipants (optional)
  if (maxParticipants !== undefined) {
    if (typeof maxParticipants !== 'number' || !Number.isInteger(maxParticipants)) {
      return { valid: false, error: 'maxParticipants must be an integer' };
    }

    if (maxParticipants < MIN_PARTICIPANTS || maxParticipants > MAX_PARTICIPANTS) {
      return {
        valid: false,
        error: `maxParticipants must be between ${MIN_PARTICIPANTS} and ${MAX_PARTICIPANTS}`,
      };
    }
  }

  // Validate aiPersonality (optional)
  const validPersonalities = ['facilitator', 'assistant', 'expert', 'brainstorm', 'custom'];
  if (aiPersonality !== undefined && !validPersonalities.includes(aiPersonality)) {
    return {
      valid: false,
      error: `aiPersonality must be one of: ${validPersonalities.join(', ')}`,
    };
  }

  // Validate voiceSettings (optional, basic validation)
  if (voiceSettings !== undefined && typeof voiceSettings !== 'object') {
    return { valid: false, error: 'voiceSettings must be an object' };
  }

  return {
    valid: true,
    data: {
      name: trimmedName,
      description: description?.trim(),
      maxParticipants,
      aiPersonality,
      voiceSettings,
    },
  };
}

/**
 * POST /api/rooms
 * Create a new room
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validation = validateCreateRequest(body);

    if (!validation.valid) {
      return NextResponse.json(
        { error: validation.error },
        { status: 400 }
      );
    }

    // Generate a temporary owner ID (will be replaced with auth in Phase 5)
    const ownerId = nanoid(12);

    const room = createRoom(validation.data!, ownerId);

    return NextResponse.json(room, { status: 201 });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { error: 'Invalid JSON in request body' },
        { status: 400 }
      );
    }

    console.error('Error creating room:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/rooms
 * List all rooms with optional filtering
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const statusParam = searchParams.get('status');

    // Validate status filter
    const validStatuses: RoomStatus[] = ['waiting', 'active', 'full', 'closed'];
    let status: RoomStatus | undefined;

    if (statusParam) {
      if (!validStatuses.includes(statusParam as RoomStatus)) {
        return NextResponse.json(
          { error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` },
          { status: 400 }
        );
      }
      status = statusParam as RoomStatus;
    }

    const rooms = getRoomSummaries(status);

    return NextResponse.json({
      rooms,
      total: rooms.length,
    });
  } catch (error) {
    console.error('Error listing rooms:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
