/**
 * Transcript Socket.io Event Handlers
 *
 * Handles real-time transcript events for the signaling server.
 * Broadcasts transcript entries and summaries to room participants.
 *
 * Part of the Long-Horizon Engineering Protocol - FEAT-505
 */

import type { Server as SocketIOServer, Socket } from "socket.io";
import type { RoomId } from "@/types/room";
import type { PeerId } from "@/types/peer";
import type {
  TranscriptEntry,
  TranscriptSummary,
  TranscriptHistoryRequest,
  TranscriptHistoryResponse,
  TranscriptEntryEvent,
  TranscriptSummaryEvent,
} from "@/types/transcript";
import type { ContextManager } from "./context-manager";

/**
 * Socket data interface (from main signaling server)
 */
interface SocketData {
  peerId: PeerId;
  displayName: string;
  avatarUrl?: string;
  roomId?: RoomId;
}

/**
 * Transcript events configuration
 */
export interface TranscriptEventsConfig {
  /** Socket.io server instance */
  io: SocketIOServer;
  /** Context manager for transcript data */
  contextManager: ContextManager;
}

/**
 * Transcript Events Handler
 *
 * Manages Socket.io events for real-time transcript broadcasting.
 *
 * @example
 * ```ts
 * const transcriptEvents = new TranscriptEventsHandler({
 *   io: socketIOServer,
 *   contextManager: contextManager,
 * });
 *
 * // Register socket handlers
 * io.on('connection', (socket) => {
 *   transcriptEvents.registerSocketHandlers(socket);
 * });
 *
 * // Broadcast entry to room
 * transcriptEvents.broadcastEntry(roomId, entry);
 * ```
 */
export class TranscriptEventsHandler {
  private io: SocketIOServer;
  private contextManager: ContextManager;

  constructor(config: TranscriptEventsConfig) {
    this.io = config.io;
    this.contextManager = config.contextManager;
  }

  /**
   * Register transcript event handlers for a socket
   */
  registerSocketHandlers(socket: Socket): void {
    // Handle history request
    socket.on(
      "transcript:request-history",
      (
        payload: TranscriptHistoryRequest,
        callback?: (response: TranscriptHistoryResponse) => void,
      ) => {
        this.handleHistoryRequest(socket, payload, callback);
      },
    );
  }

  /**
   * Handle transcript history request
   */
  private handleHistoryRequest(
    socket: Socket,
    payload: TranscriptHistoryRequest,
    callback?: (response: TranscriptHistoryResponse) => void,
  ): void {
    const { roomId, limit, beforeId, includeSummaries } = payload;
    const socketData = socket.data as SocketData;

    // Verify socket is in the room
    if (socketData.roomId !== roomId) {
      console.log(
        `[Transcript] History request denied - socket not in room ${roomId}`,
      );
      const emptyResponse: TranscriptHistoryResponse = {
        entries: [],
        summaries: [],
        hasMore: false,
        totalEntries: 0,
      };
      if (callback) {
        callback(emptyResponse);
      } else {
        socket.emit("transcript:history", emptyResponse);
      }
      return;
    }

    // Get entries from context manager
    const { entries, hasMore, total } =
      this.contextManager.getTranscriptEntries(roomId, limit, 0, beforeId);

    // Get summaries if requested
    const summaries = includeSummaries
      ? this.contextManager.getTranscriptSummaries(roomId)
      : [];

    const response: TranscriptHistoryResponse = {
      entries,
      summaries,
      hasMore,
      totalEntries: total,
    };

    console.log(
      `[Transcript] Sending history for room ${roomId}: ${entries.length} entries, ${summaries.length} summaries`,
    );

    // Send response via callback or event
    if (callback) {
      callback(response);
    } else {
      socket.emit("transcript:history", response);
    }
  }

  /**
   * Broadcast a new transcript entry to all room participants
   */
  broadcastEntry(roomId: RoomId, entry: TranscriptEntry): void {
    const event: TranscriptEntryEvent = { entry };
    this.io.to(roomId).emit("transcript:entry", event);

    console.log(
      `[Transcript] Broadcast entry to room ${roomId}: ${entry.speaker} (${entry.type})`,
    );
  }

  /**
   * Broadcast a new summary to all room participants
   */
  broadcastSummary(roomId: RoomId, summary: TranscriptSummary): void {
    const event: TranscriptSummaryEvent = { summary };
    this.io.to(roomId).emit("transcript:summary", event);

    console.log(
      `[Transcript] Broadcast summary to room ${roomId}: ${summary.entriesSummarized} entries summarized`,
    );
  }

  /**
   * Send transcript history to a specific socket (for late joiners)
   */
  sendHistoryToSocket(
    socket: Socket,
    roomId: RoomId,
    limit: number = 50,
  ): void {
    const { entries, hasMore, total } =
      this.contextManager.getTranscriptEntries(roomId, limit);

    const summaries = this.contextManager.getTranscriptSummaries(roomId);

    const response: TranscriptHistoryResponse = {
      entries,
      summaries,
      hasMore,
      totalEntries: total,
    };

    socket.emit("transcript:history", response);

    console.log(
      `[Transcript] Sent initial history to socket: ${entries.length} entries`,
    );
  }
}

/**
 * Create transcript events handler instance
 */
export function createTranscriptEventsHandler(
  config: TranscriptEventsConfig,
): TranscriptEventsHandler {
  return new TranscriptEventsHandler(config);
}

export default TranscriptEventsHandler;
