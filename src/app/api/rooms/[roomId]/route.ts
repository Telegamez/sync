/**
 * Room by ID API Endpoints
 *
 * GET /api/rooms/[roomId] - Get room details
 * DELETE /api/rooms/[roomId] - Delete/close room
 *
 * Part of the Long-Horizon Engineering Protocol - FEAT-103
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getRoom,
  deleteRoom,
  closeRoom,
  roomExists,
} from '@/server/store/rooms';

interface RouteParams {
  params: Promise<{ roomId: string }>;
}

/**
 * GET /api/rooms/[roomId]
 * Get room details by ID
 */
export async function GET(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const { roomId } = await params;

    if (!roomId) {
      return NextResponse.json(
        { error: 'Room ID is required' },
        { status: 400 }
      );
    }

    const room = getRoom(roomId);

    if (!room) {
      return NextResponse.json(
        { error: 'Room not found', code: 'ROOM_NOT_FOUND' },
        { status: 404 }
      );
    }

    return NextResponse.json(room);
  } catch (error) {
    console.error('Error getting room:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/rooms/[roomId]
 * Delete or close a room
 */
export async function DELETE(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const { roomId } = await params;
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action') || 'close';

    if (!roomId) {
      return NextResponse.json(
        { error: 'Room ID is required' },
        { status: 400 }
      );
    }

    if (!roomExists(roomId)) {
      return NextResponse.json(
        { error: 'Room not found', code: 'ROOM_NOT_FOUND' },
        { status: 404 }
      );
    }

    if (action === 'delete') {
      // Hard delete - removes room entirely
      deleteRoom(roomId);
      return NextResponse.json(
        { success: true, message: 'Room deleted' },
        { status: 200 }
      );
    } else {
      // Soft close - marks room as closed
      const closedRoom = closeRoom(roomId);
      return NextResponse.json(
        { success: true, message: 'Room closed', room: closedRoom },
        { status: 200 }
      );
    }
  } catch (error) {
    console.error('Error deleting room:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
