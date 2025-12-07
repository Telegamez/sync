/**
 * Response Broadcast Manager
 *
 * Broadcasts AI audio responses to all room participants.
 * Handles synchronized playback start and late-joining peers.
 *
 * Part of the Long-Horizon Engineering Protocol - FEAT-302
 */

import type { RoomId } from '@/types/room';
import type { PeerId } from '@/types/peer';

/**
 * Audio chunk for broadcasting
 */
export interface BroadcastAudioChunk {
  /** Unique chunk ID */
  chunkId: string;
  /** Sequence number for ordering */
  sequenceNumber: number;
  /** Audio data (PCM16 or encoded) */
  data: ArrayBuffer;
  /** Timestamp when chunk was received from AI */
  timestamp: number;
  /** Duration in milliseconds */
  durationMs: number;
  /** Whether this is the first chunk of a response */
  isFirst: boolean;
  /** Whether this is the last chunk of a response */
  isLast: boolean;
}

/**
 * Response state for broadcast
 */
export type ResponseBroadcastState =
  | 'idle'
  | 'buffering'
  | 'broadcasting'
  | 'completed'
  | 'cancelled';

/**
 * Response info
 */
export interface ResponseInfo {
  /** Unique response ID */
  responseId: string;
  /** Room this response belongs to */
  roomId: RoomId;
  /** Peer who triggered this response */
  triggerPeerId: PeerId;
  /** Current broadcast state */
  state: ResponseBroadcastState;
  /** When the response started */
  startedAt: Date;
  /** When the response completed */
  completedAt?: Date;
  /** Total chunks received */
  totalChunks: number;
  /** Total chunks broadcasted */
  broadcastedChunks: number;
  /** Total duration in milliseconds */
  totalDurationMs: number;
  /** Synchronized playback start time */
  syncedStartTime: number;
}

/**
 * Peer subscription info
 */
interface PeerSubscription {
  peerId: PeerId;
  joinedAt: Date;
  lastChunkSent: number; // Sequence number
  isReady: boolean;
  bufferStatus: 'empty' | 'filling' | 'ready' | 'playing';
}

/**
 * Response broadcast options
 */
export interface ResponseBroadcastOptions {
  /** Buffer size before starting broadcast (ms, default: 200) */
  bufferSizeMs?: number;
  /** Minimum peers ready before starting (default: 1) */
  minPeersReady?: number;
  /** Max wait for peers to be ready (ms, default: 1000) */
  maxWaitForPeersMs?: number;
  /** Chunk size for broadcasting (default: all at once) */
  chunkBroadcastSize?: number;
  /** Enable late-joiner catch-up (default: true) */
  enableLateJoinerCatchUp?: boolean;
  /** Max chunks to buffer for late joiners (default: 100) */
  maxBufferedChunks?: number;
  /** Sync offset for playback alignment (ms, default: 50) */
  syncOffsetMs?: number;
}

/**
 * Response broadcast callbacks
 */
export interface ResponseBroadcastCallbacks {
  /** Called to send audio chunk to a peer */
  onSendToPeer?: (peerId: PeerId, chunk: BroadcastAudioChunk, responseInfo: ResponseInfo) => void;
  /** Called when broadcast starts */
  onBroadcastStart?: (roomId: RoomId, responseInfo: ResponseInfo) => void;
  /** Called when broadcast completes */
  onBroadcastComplete?: (roomId: RoomId, responseInfo: ResponseInfo) => void;
  /** Called when broadcast is cancelled */
  onBroadcastCancelled?: (roomId: RoomId, responseInfo: ResponseInfo) => void;
  /** Called when response state changes */
  onStateChange?: (roomId: RoomId, state: ResponseBroadcastState, responseInfo: ResponseInfo) => void;
  /** Called when a peer needs catch-up */
  onPeerCatchUp?: (peerId: PeerId, chunksNeeded: number) => void;
  /** Called on error */
  onError?: (roomId: RoomId, error: string) => void;
}

/**
 * Per-room broadcast state
 */
interface RoomBroadcastState {
  /** Current response info (if active) */
  currentResponse: ResponseInfo | null;
  /** Subscribed peers */
  peers: Map<PeerId, PeerSubscription>;
  /** Buffered chunks for current response */
  chunkBuffer: BroadcastAudioChunk[];
  /** Total buffered duration */
  bufferedDurationMs: number;
  /** Broadcast timer */
  broadcastTimer?: ReturnType<typeof setTimeout>;
  /** Wait-for-peers timer */
  waitTimer?: ReturnType<typeof setTimeout>;
}

/**
 * Default options
 */
const DEFAULT_OPTIONS: Required<ResponseBroadcastOptions> = {
  bufferSizeMs: 200,
  minPeersReady: 1,
  maxWaitForPeersMs: 1000,
  chunkBroadcastSize: 0, // 0 = all at once
  enableLateJoinerCatchUp: true,
  maxBufferedChunks: 100,
  syncOffsetMs: 50,
};

let responseIdCounter = 0;
let chunkIdCounter = 0;

/**
 * Response Broadcast Manager
 *
 * Manages broadcasting AI audio responses to room participants.
 *
 * @example
 * ```typescript
 * const broadcast = new ResponseBroadcastManager({
 *   bufferSizeMs: 200,
 * }, {
 *   onSendToPeer: (peerId, chunk, responseInfo) => {
 *     socket.to(peerId).emit('ai:audio', { chunk, responseInfo });
 *   },
 *   onBroadcastStart: (roomId, responseInfo) => {
 *     console.log(`Broadcasting response to room ${roomId}`);
 *   },
 * });
 *
 * // Initialize room
 * broadcast.initRoom('room-123');
 *
 * // Add peers
 * broadcast.addPeer('room-123', 'peer-1');
 *
 * // Start a response
 * const responseId = broadcast.startResponse('room-123', 'peer-1');
 *
 * // Add audio chunks as they arrive from AI
 * broadcast.addChunk('room-123', audioChunk, durationMs);
 *
 * // End the response
 * broadcast.endResponse('room-123');
 * ```
 */
export class ResponseBroadcastManager {
  private rooms = new Map<RoomId, RoomBroadcastState>();
  private options: Required<ResponseBroadcastOptions>;
  private callbacks: ResponseBroadcastCallbacks;

  constructor(
    options: ResponseBroadcastOptions = {},
    callbacks: ResponseBroadcastCallbacks = {}
  ) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.callbacks = callbacks;
  }

  /**
   * Initialize a room for broadcasting
   */
  initRoom(roomId: RoomId): void {
    if (this.rooms.has(roomId)) {
      return;
    }

    this.rooms.set(roomId, {
      currentResponse: null,
      peers: new Map(),
      chunkBuffer: [],
      bufferedDurationMs: 0,
    });
  }

  /**
   * Remove a room from broadcasting
   */
  removeRoom(roomId: RoomId): boolean {
    const state = this.rooms.get(roomId);
    if (!state) return false;

    // Clear timers
    if (state.broadcastTimer) {
      clearTimeout(state.broadcastTimer);
    }
    if (state.waitTimer) {
      clearTimeout(state.waitTimer);
    }

    return this.rooms.delete(roomId);
  }

  /**
   * Check if room is initialized
   */
  hasRoom(roomId: RoomId): boolean {
    return this.rooms.has(roomId);
  }

  /**
   * Add a peer to receive broadcasts
   */
  addPeer(roomId: RoomId, peerId: PeerId): void {
    const state = this.rooms.get(roomId);
    if (!state) return;

    if (state.peers.has(peerId)) return;

    const subscription: PeerSubscription = {
      peerId,
      joinedAt: new Date(),
      lastChunkSent: -1,
      isReady: false,
      bufferStatus: 'empty',
    };

    state.peers.set(peerId, subscription);

    // Handle late joiner catch-up
    if (
      this.options.enableLateJoinerCatchUp &&
      state.currentResponse &&
      state.currentResponse.state === 'broadcasting'
    ) {
      this.catchUpPeer(roomId, peerId);
    }
  }

  /**
   * Remove a peer from broadcasts
   */
  removePeer(roomId: RoomId, peerId: PeerId): boolean {
    const state = this.rooms.get(roomId);
    if (!state) return false;

    return state.peers.delete(peerId);
  }

  /**
   * Get all peers in a room
   */
  getPeers(roomId: RoomId): PeerId[] {
    const state = this.rooms.get(roomId);
    if (!state) return [];

    return Array.from(state.peers.keys());
  }

  /**
   * Get peer count in a room
   */
  getPeerCount(roomId: RoomId): number {
    return this.rooms.get(roomId)?.peers.size ?? 0;
  }

  /**
   * Mark peer as ready for playback
   */
  setPeerReady(roomId: RoomId, peerId: PeerId): void {
    const state = this.rooms.get(roomId);
    if (!state) return;

    const peer = state.peers.get(peerId);
    if (peer) {
      peer.isReady = true;
      peer.bufferStatus = 'ready';
    }

    // Check if we can start broadcasting
    if (state.currentResponse?.state === 'buffering') {
      this.checkStartBroadcast(roomId);
    }
  }

  /**
   * Start a new response broadcast
   */
  startResponse(roomId: RoomId, triggerPeerId: PeerId): string | null {
    const state = this.rooms.get(roomId);
    if (!state) {
      this.callbacks.onError?.(roomId, 'Room not initialized');
      return null;
    }

    // Cancel any existing response
    if (state.currentResponse && state.currentResponse.state !== 'completed') {
      this.cancelResponse(roomId);
    }

    const responseId = `resp-${++responseIdCounter}`;
    const now = new Date();

    const response: ResponseInfo = {
      responseId,
      roomId,
      triggerPeerId,
      state: 'buffering',
      startedAt: now,
      totalChunks: 0,
      broadcastedChunks: 0,
      totalDurationMs: 0,
      syncedStartTime: Date.now() + this.options.bufferSizeMs + this.options.syncOffsetMs,
    };

    state.currentResponse = response;
    state.chunkBuffer = [];
    state.bufferedDurationMs = 0;

    // Reset peer states
    Array.from(state.peers.values()).forEach(peer => {
      peer.lastChunkSent = -1;
      peer.isReady = false;
      peer.bufferStatus = 'filling';
    });

    this.callbacks.onStateChange?.(roomId, 'buffering', response);

    // Set up max wait timer
    state.waitTimer = setTimeout(() => {
      if (state.currentResponse?.state === 'buffering') {
        this.startBroadcasting(roomId);
      }
    }, this.options.maxWaitForPeersMs);

    return responseId;
  }

  /**
   * Add an audio chunk to the current response
   */
  addChunk(
    roomId: RoomId,
    audioData: ArrayBuffer,
    durationMs: number,
    isLast: boolean = false
  ): boolean {
    const state = this.rooms.get(roomId);
    if (!state || !state.currentResponse) {
      return false;
    }

    const response = state.currentResponse;
    const isFirst = response.totalChunks === 0;

    const chunk: BroadcastAudioChunk = {
      chunkId: `chunk-${++chunkIdCounter}`,
      sequenceNumber: response.totalChunks,
      data: audioData,
      timestamp: Date.now(),
      durationMs,
      isFirst,
      isLast,
    };

    // Add to buffer (with limit)
    if (state.chunkBuffer.length < this.options.maxBufferedChunks) {
      state.chunkBuffer.push(chunk);
    }

    state.bufferedDurationMs += durationMs;
    response.totalChunks++;
    response.totalDurationMs += durationMs;

    // If we're already broadcasting, send immediately
    if (response.state === 'broadcasting') {
      this.broadcastChunk(roomId, chunk);
    }
    // Check if buffer is full enough to start
    else if (
      response.state === 'buffering' &&
      state.bufferedDurationMs >= this.options.bufferSizeMs
    ) {
      this.checkStartBroadcast(roomId);
    }

    // Handle last chunk
    if (isLast) {
      this.endResponse(roomId);
    }

    return true;
  }

  /**
   * End the current response
   */
  endResponse(roomId: RoomId): boolean {
    const state = this.rooms.get(roomId);
    if (!state || !state.currentResponse) {
      return false;
    }

    const response = state.currentResponse;

    // If still buffering, start broadcasting first
    if (response.state === 'buffering') {
      this.startBroadcasting(roomId);
    }

    // Mark as completed
    response.state = 'completed';
    response.completedAt = new Date();

    // Clear wait timer
    if (state.waitTimer) {
      clearTimeout(state.waitTimer);
      state.waitTimer = undefined;
    }

    this.callbacks.onStateChange?.(roomId, 'completed', response);
    this.callbacks.onBroadcastComplete?.(roomId, response);

    return true;
  }

  /**
   * Cancel the current response
   */
  cancelResponse(roomId: RoomId): boolean {
    const state = this.rooms.get(roomId);
    if (!state || !state.currentResponse) {
      return false;
    }

    const response = state.currentResponse;
    response.state = 'cancelled';
    response.completedAt = new Date();

    // Clear timers
    if (state.waitTimer) {
      clearTimeout(state.waitTimer);
      state.waitTimer = undefined;
    }
    if (state.broadcastTimer) {
      clearTimeout(state.broadcastTimer);
      state.broadcastTimer = undefined;
    }

    // Clear buffer
    state.chunkBuffer = [];
    state.bufferedDurationMs = 0;

    this.callbacks.onStateChange?.(roomId, 'cancelled', response);
    this.callbacks.onBroadcastCancelled?.(roomId, response);

    return true;
  }

  /**
   * Get current response info
   */
  getCurrentResponse(roomId: RoomId): ResponseInfo | null {
    return this.rooms.get(roomId)?.currentResponse ?? null;
  }

  /**
   * Get current broadcast state
   */
  getBroadcastState(roomId: RoomId): ResponseBroadcastState {
    return this.rooms.get(roomId)?.currentResponse?.state ?? 'idle';
  }

  /**
   * Check if room is currently broadcasting
   */
  isBroadcasting(roomId: RoomId): boolean {
    return this.getBroadcastState(roomId) === 'broadcasting';
  }

  /**
   * Get buffer status
   */
  getBufferStatus(roomId: RoomId): {
    chunksBuffered: number;
    durationMs: number;
    isFull: boolean;
  } {
    const state = this.rooms.get(roomId);
    if (!state) {
      return { chunksBuffered: 0, durationMs: 0, isFull: false };
    }

    return {
      chunksBuffered: state.chunkBuffer.length,
      durationMs: state.bufferedDurationMs,
      isFull: state.bufferedDurationMs >= this.options.bufferSizeMs,
    };
  }

  /**
   * Get synchronized start time for playback
   */
  getSyncedStartTime(roomId: RoomId): number {
    return this.rooms.get(roomId)?.currentResponse?.syncedStartTime ?? 0;
  }

  /**
   * Dispose all rooms
   */
  dispose(): void {
    Array.from(this.rooms.values()).forEach(state => {
      if (state.waitTimer) clearTimeout(state.waitTimer);
      if (state.broadcastTimer) clearTimeout(state.broadcastTimer);
    });
    this.rooms.clear();
  }

  // ========== Private Methods ==========

  /**
   * Check if we can start broadcasting
   */
  private checkStartBroadcast(roomId: RoomId): void {
    const state = this.rooms.get(roomId);
    if (!state || !state.currentResponse) return;

    // Count ready peers
    const readyCount = Array.from(state.peers.values()).filter(peer => peer.isReady).length;

    // Check if enough peers are ready
    const hasEnoughPeers =
      readyCount >= this.options.minPeersReady || state.peers.size === 0;

    // Check if buffer is full enough
    const hasEnoughBuffer =
      state.bufferedDurationMs >= this.options.bufferSizeMs;

    if (hasEnoughPeers && hasEnoughBuffer) {
      this.startBroadcasting(roomId);
    }
  }

  /**
   * Start broadcasting buffered chunks
   */
  private startBroadcasting(roomId: RoomId): void {
    const state = this.rooms.get(roomId);
    if (!state || !state.currentResponse) return;

    // Clear wait timer
    if (state.waitTimer) {
      clearTimeout(state.waitTimer);
      state.waitTimer = undefined;
    }

    state.currentResponse.state = 'broadcasting';
    state.currentResponse.syncedStartTime =
      Date.now() + this.options.syncOffsetMs;

    this.callbacks.onStateChange?.(
      roomId,
      'broadcasting',
      state.currentResponse
    );
    this.callbacks.onBroadcastStart?.(roomId, state.currentResponse);

    // Broadcast all buffered chunks
    for (const chunk of state.chunkBuffer) {
      this.broadcastChunk(roomId, chunk);
    }
  }

  /**
   * Broadcast a single chunk to all peers
   */
  private broadcastChunk(roomId: RoomId, chunk: BroadcastAudioChunk): void {
    const state = this.rooms.get(roomId);
    if (!state || !state.currentResponse) return;

    const response = state.currentResponse;

    // Send to all peers
    Array.from(state.peers.entries()).forEach(([peerId, peer]) => {
      // Skip if we've already sent this chunk
      if (chunk.sequenceNumber <= peer.lastChunkSent) return;

      this.callbacks.onSendToPeer?.(peerId, chunk, response);
      peer.lastChunkSent = chunk.sequenceNumber;
      peer.bufferStatus = 'playing';
    });

    response.broadcastedChunks++;
  }

  /**
   * Catch up a late-joining peer
   */
  private catchUpPeer(roomId: RoomId, peerId: PeerId): void {
    const state = this.rooms.get(roomId);
    if (!state || !state.currentResponse) return;

    const peer = state.peers.get(peerId);
    if (!peer) return;

    const response = state.currentResponse;
    const chunksNeeded = state.chunkBuffer.length;

    if (chunksNeeded > 0) {
      this.callbacks.onPeerCatchUp?.(peerId, chunksNeeded);

      // Send all buffered chunks
      for (const chunk of state.chunkBuffer) {
        this.callbacks.onSendToPeer?.(peerId, chunk, response);
        peer.lastChunkSent = chunk.sequenceNumber;
      }

      peer.bufferStatus = 'playing';
    }
  }
}

/**
 * Create response broadcast manager
 */
export function createResponseBroadcastManager(
  options?: ResponseBroadcastOptions,
  callbacks?: ResponseBroadcastCallbacks
): ResponseBroadcastManager {
  return new ResponseBroadcastManager(options, callbacks);
}

export default ResponseBroadcastManager;
