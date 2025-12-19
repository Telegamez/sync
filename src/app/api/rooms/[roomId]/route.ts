/**
 * Room by ID API Endpoints
 *
 * GET /api/rooms/[roomId] - Get room details
 * DELETE /api/rooms/[roomId] - Delete/close room
 *
 * Part of the Long-Horizon Engineering Protocol - FEAT-103
 */

import { NextRequest, NextResponse } from "next/server";
import {
  getRoom,
  deleteRoom,
  closeRoom,
  roomExists,
} from "@/server/store/rooms";

/**
 * Notify socket server about room deletion
 * This allows the socket server to:
 * - Eject participants with room:closed event
 * - Clean up AI sessions and resources
 * - Broadcast room:deleted to lobby
 */
async function notifySocketServerRoomDeleted(roomId: string): Promise<void> {
  const socketServerPort = process.env.PORT || 3001;
  const socketServerUrl = `http://localhost:${socketServerPort}/internal/room-deleted`;

  try {
    const response = await fetch(socketServerUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roomId }),
    });

    if (!response.ok) {
      console.error(`[API] Failed to notify socket server: ${response.status}`);
    } else {
      const result = await response.json();
      console.log(`[API] Socket server notified of room deletion:`, result);
    }
  } catch (error) {
    // Log but don't fail the delete - socket server might be down
    console.error(
      "[API] Error notifying socket server of room deletion:",
      error,
    );
  }
}

interface RouteParams {
  params: Promise<{ roomId: string }>;
}

/**
 * GET /api/rooms/[roomId]
 * Get room details by ID
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { roomId } = await params;

    if (!roomId) {
      return NextResponse.json(
        { error: "Room ID is required" },
        { status: 400 },
      );
    }

    const room = getRoom(roomId);

    if (!room) {
      return NextResponse.json(
        { error: "Room not found", code: "ROOM_NOT_FOUND" },
        { status: 404 },
      );
    }

    return NextResponse.json(room);
  } catch (error) {
    console.error("Error getting room:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/rooms/[roomId]
 * Delete or close a room
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { roomId } = await params;
    const { searchParams } = new URL(request.url);
    const action = searchParams.get("action") || "close";

    if (!roomId) {
      return NextResponse.json(
        { error: "Room ID is required" },
        { status: 400 },
      );
    }

    if (!roomExists(roomId)) {
      return NextResponse.json(
        { error: "Room not found", code: "ROOM_NOT_FOUND" },
        { status: 404 },
      );
    }

    if (action === "delete") {
      // Hard delete - removes room entirely
      deleteRoom(roomId);

      // Notify socket server to eject participants and broadcast to lobby
      await notifySocketServerRoomDeleted(roomId);

      return NextResponse.json(
        { success: true, message: "Room deleted" },
        { status: 200 },
      );
    } else {
      // Soft close - marks room as closed
      const closedRoom = closeRoom(roomId);

      // Notify socket server to broadcast the status change to lobby
      await notifySocketServerRoomDeleted(roomId);

      return NextResponse.json(
        { success: true, message: "Room closed", room: closedRoom },
        { status: 200 },
      );
    }
  } catch (error) {
    console.error("Error deleting room:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
