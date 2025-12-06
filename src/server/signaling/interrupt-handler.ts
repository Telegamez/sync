/**
 * Interrupt Handler
 *
 * Manages interrupt requests for urgent overrides during AI responses.
 * Allows room owners/moderators to interrupt AI speech and process
 * urgent requests immediately.
 *
 * Part of the Long-Horizon Engineering Protocol - FEAT-158
 */

import { nanoid } from 'nanoid';
import type { PeerId } from '@/types/peer';
import type { RoomId } from '@/types/room';
import type { AIResponseState } from '@/types/voice-mode';

/**
 * Interrupt request
 */
export interface InterruptRequest {
  /** Unique interrupt ID */
  id: string;
  /** Room ID */
  roomId: RoomId;
  /** Peer who requested the interrupt */
  requestedBy: PeerId;
  /** Display name of requester */
  requesterName: string;
  /** Role of requester */
  role: 'owner' | 'moderator' | 'member';
  /** Reason for interrupt */
  reason?: string;
  /** When the interrupt was requested */
  requestedAt: Date;
  /** When the interrupt was processed */
  processedAt?: Date;
  /** Whether interrupt was successful */
  success?: boolean;
  /** Error message if failed */
  error?: string;
}

/**
 * Interrupt event for logging/analytics
 */
export interface InterruptEvent {
  /** Event type */
  type: 'requested' | 'processed' | 'rejected' | 'cancelled';
  /** Interrupt request */
  request: InterruptRequest;
  /** AI state at time of interrupt */
  aiState: AIResponseState;
  /** Peer who was interrupted */
  interruptedPeerId?: PeerId;
  /** Duration of response before interrupt (ms) */
  responseDuration?: number;
  /** Timestamp */
  timestamp: Date;
}

/**
 * Interrupt handler options
 */
export interface InterruptHandlerOptions {
  /** Whether interrupts are enabled */
  enabled?: boolean;
  /** Whether only owners can interrupt */
  ownerOnly?: boolean;
  /** Whether moderators can interrupt */
  moderatorsCanInterrupt?: boolean;
  /** Cooldown between interrupts (ms) */
  interruptCooldownMs?: number;
  /** Maximum interrupts per room per minute */
  maxInterruptsPerMinute?: number;
  /** Whether to log all interrupt events */
  logAllEvents?: boolean;
}

/**
 * Interrupt handler callbacks
 */
export interface InterruptHandlerCallbacks {
  /** Called when interrupt is requested */
  onInterruptRequested?: (event: InterruptEvent) => void;
  /** Called when interrupt is processed */
  onInterruptProcessed?: (event: InterruptEvent) => void;
  /** Called when interrupt is rejected */
  onInterruptRejected?: (event: InterruptEvent, reason: string) => void;
  /** Called to send response.cancel to OpenAI */
  onSendCancel?: (roomId: RoomId) => Promise<boolean>;
  /** Called to clear current response */
  onClearResponse?: (roomId: RoomId) => void;
  /** Called to unlock AI */
  onUnlock?: (roomId: RoomId) => void;
  /** Called for analytics logging */
  onLogEvent?: (event: InterruptEvent) => void;
}

/**
 * Per-room interrupt state
 */
interface RoomInterruptState {
  /** Whether interrupts are enabled for this room */
  enabled: boolean;
  /** Last interrupt time */
  lastInterruptAt?: Date;
  /** Interrupt count in current minute */
  interruptCountThisMinute: number;
  /** Minute tracker reset time */
  minuteResetAt: Date;
  /** Pending interrupt (if any) */
  pendingInterrupt?: InterruptRequest;
  /** Interrupt history */
  history: InterruptEvent[];
}

/**
 * Default options
 */
const DEFAULT_OPTIONS: Required<InterruptHandlerOptions> = {
  enabled: true,
  ownerOnly: false,
  moderatorsCanInterrupt: true,
  interruptCooldownMs: 2000, // 2 seconds
  maxInterruptsPerMinute: 10,
  logAllEvents: true,
};

/**
 * Interrupt Handler
 *
 * Manages AI response interrupts for urgent overrides.
 */
export class InterruptHandler {
  private rooms = new Map<RoomId, RoomInterruptState>();
  private options: Required<InterruptHandlerOptions>;
  private callbacks: InterruptHandlerCallbacks;

  constructor(
    options: InterruptHandlerOptions = {},
    callbacks: InterruptHandlerCallbacks = {}
  ) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.callbacks = callbacks;
  }

  /**
   * Initialize a room for interrupt handling
   */
  initRoom(roomId: RoomId, enabled: boolean = true): void {
    if (this.rooms.has(roomId)) {
      return;
    }

    this.rooms.set(roomId, {
      enabled: enabled && this.options.enabled,
      interruptCountThisMinute: 0,
      minuteResetAt: new Date(Date.now() + 60000),
      history: [],
    });
  }

  /**
   * Remove a room
   */
  removeRoom(roomId: RoomId): void {
    this.rooms.delete(roomId);
  }

  /**
   * Enable/disable interrupts for a room
   */
  setEnabled(roomId: RoomId, enabled: boolean): void {
    const state = this.rooms.get(roomId);
    if (state) {
      state.enabled = enabled && this.options.enabled;
    }
  }

  /**
   * Check if a peer can interrupt
   */
  canInterrupt(
    roomId: RoomId,
    peerId: PeerId,
    role: 'owner' | 'moderator' | 'member'
  ): { allowed: boolean; reason?: string } {
    const state = this.rooms.get(roomId);
    if (!state) {
      return { allowed: false, reason: 'Room not initialized' };
    }

    // Check if interrupts are enabled
    if (!state.enabled) {
      return { allowed: false, reason: 'Interrupts disabled for this room' };
    }

    if (!this.options.enabled) {
      return { allowed: false, reason: 'Interrupts disabled globally' };
    }

    // Check role permissions
    if (this.options.ownerOnly && role !== 'owner') {
      return { allowed: false, reason: 'Only room owner can interrupt' };
    }

    if (role === 'member' && !this.options.moderatorsCanInterrupt) {
      return { allowed: false, reason: 'Only owner or moderators can interrupt' };
    }

    if (role === 'moderator' && !this.options.moderatorsCanInterrupt) {
      return { allowed: false, reason: 'Moderator interrupts not allowed' };
    }

    // Check cooldown
    if (state.lastInterruptAt) {
      const elapsed = Date.now() - state.lastInterruptAt.getTime();
      if (elapsed < this.options.interruptCooldownMs) {
        const remaining = Math.ceil((this.options.interruptCooldownMs - elapsed) / 1000);
        return { allowed: false, reason: `Cooldown: wait ${remaining}s` };
      }
    }

    // Check rate limit
    this.updateMinuteCounter(state);
    if (state.interruptCountThisMinute >= this.options.maxInterruptsPerMinute) {
      return { allowed: false, reason: 'Rate limit exceeded' };
    }

    return { allowed: true };
  }

  /**
   * Request an interrupt
   */
  async requestInterrupt(
    roomId: RoomId,
    peerId: PeerId,
    displayName: string,
    role: 'owner' | 'moderator' | 'member',
    aiState: AIResponseState,
    interruptedPeerId?: PeerId,
    reason?: string
  ): Promise<InterruptRequest | null> {
    const state = this.rooms.get(roomId);
    if (!state) return null;

    // Check if can interrupt
    const check = this.canInterrupt(roomId, peerId, role);
    if (!check.allowed) {
      const request: InterruptRequest = {
        id: nanoid(10),
        roomId,
        requestedBy: peerId,
        requesterName: displayName,
        role,
        reason,
        requestedAt: new Date(),
        success: false,
        error: check.reason,
      };

      const event: InterruptEvent = {
        type: 'rejected',
        request,
        aiState,
        interruptedPeerId,
        timestamp: new Date(),
      };

      this.logEvent(state, event);
      this.callbacks.onInterruptRejected?.(event, check.reason!);

      return null;
    }

    // Create request
    const request: InterruptRequest = {
      id: nanoid(10),
      roomId,
      requestedBy: peerId,
      requesterName: displayName,
      role,
      reason,
      requestedAt: new Date(),
    };

    state.pendingInterrupt = request;

    // Log requested event
    const requestedEvent: InterruptEvent = {
      type: 'requested',
      request,
      aiState,
      interruptedPeerId,
      timestamp: new Date(),
    };
    this.logEvent(state, requestedEvent);
    this.callbacks.onInterruptRequested?.(requestedEvent);

    return request;
  }

  /**
   * Process an interrupt request
   */
  async processInterrupt(
    roomId: RoomId,
    requestId: string,
    aiState: AIResponseState,
    interruptedPeerId?: PeerId,
    responseDuration?: number
  ): Promise<boolean> {
    const state = this.rooms.get(roomId);
    if (!state) return false;

    // Find the request
    const request = state.pendingInterrupt;
    if (!request || request.id !== requestId) {
      return false;
    }

    try {
      // Send response.cancel to OpenAI
      if (this.callbacks.onSendCancel) {
        const cancelled = await this.callbacks.onSendCancel(roomId);
        if (!cancelled) {
          request.success = false;
          request.error = 'Failed to cancel OpenAI response';

          const event: InterruptEvent = {
            type: 'rejected',
            request,
            aiState,
            interruptedPeerId,
            responseDuration,
            timestamp: new Date(),
          };
          this.logEvent(state, event);
          this.callbacks.onInterruptRejected?.(event, request.error);

          state.pendingInterrupt = undefined;
          return false;
        }
      }

      // Clear current response
      this.callbacks.onClearResponse?.(roomId);

      // Unlock AI
      this.callbacks.onUnlock?.(roomId);

      // Mark success
      request.processedAt = new Date();
      request.success = true;

      // Update state
      state.lastInterruptAt = new Date();
      this.updateMinuteCounter(state);
      state.interruptCountThisMinute++;
      state.pendingInterrupt = undefined;

      // Log processed event
      const event: InterruptEvent = {
        type: 'processed',
        request,
        aiState,
        interruptedPeerId,
        responseDuration,
        timestamp: new Date(),
      };
      this.logEvent(state, event);
      this.callbacks.onInterruptProcessed?.(event);

      return true;
    } catch (error) {
      request.success = false;
      request.error = error instanceof Error ? error.message : 'Unknown error';
      state.pendingInterrupt = undefined;

      const event: InterruptEvent = {
        type: 'rejected',
        request,
        aiState,
        interruptedPeerId,
        responseDuration,
        timestamp: new Date(),
      };
      this.logEvent(state, event);
      this.callbacks.onInterruptRejected?.(event, request.error);

      return false;
    }
  }

  /**
   * Cancel a pending interrupt request
   */
  cancelInterrupt(roomId: RoomId, requestId: string): boolean {
    const state = this.rooms.get(roomId);
    if (!state || !state.pendingInterrupt) return false;

    if (state.pendingInterrupt.id !== requestId) return false;

    const request = state.pendingInterrupt;
    state.pendingInterrupt = undefined;

    const event: InterruptEvent = {
      type: 'cancelled',
      request,
      aiState: 'idle',
      timestamp: new Date(),
    };
    this.logEvent(state, event);

    return true;
  }

  /**
   * Get pending interrupt for a room
   */
  getPendingInterrupt(roomId: RoomId): InterruptRequest | null {
    return this.rooms.get(roomId)?.pendingInterrupt ?? null;
  }

  /**
   * Check if room has pending interrupt
   */
  hasPendingInterrupt(roomId: RoomId): boolean {
    return !!this.rooms.get(roomId)?.pendingInterrupt;
  }

  /**
   * Get interrupt history for a room
   */
  getHistory(roomId: RoomId, limit?: number): InterruptEvent[] {
    const state = this.rooms.get(roomId);
    if (!state) return [];

    if (limit) {
      return state.history.slice(-limit);
    }
    return [...state.history];
  }

  /**
   * Get interrupt statistics for a room
   */
  getStatistics(roomId: RoomId): {
    enabled: boolean;
    totalInterrupts: number;
    successfulInterrupts: number;
    rejectedInterrupts: number;
    interruptsThisMinute: number;
    lastInterruptAt?: Date;
    cooldownRemaining: number;
  } | null {
    const state = this.rooms.get(roomId);
    if (!state) return null;

    this.updateMinuteCounter(state);

    const successful = state.history.filter((e) => e.type === 'processed').length;
    const rejected = state.history.filter((e) => e.type === 'rejected').length;

    let cooldownRemaining = 0;
    if (state.lastInterruptAt) {
      const elapsed = Date.now() - state.lastInterruptAt.getTime();
      cooldownRemaining = Math.max(0, this.options.interruptCooldownMs - elapsed);
    }

    return {
      enabled: state.enabled,
      totalInterrupts: state.history.length,
      successfulInterrupts: successful,
      rejectedInterrupts: rejected,
      interruptsThisMinute: state.interruptCountThisMinute,
      lastInterruptAt: state.lastInterruptAt,
      cooldownRemaining,
    };
  }

  /**
   * Clear history for a room
   */
  clearHistory(roomId: RoomId): void {
    const state = this.rooms.get(roomId);
    if (state) {
      state.history = [];
    }
  }

  /**
   * Check if room is initialized
   */
  hasRoom(roomId: RoomId): boolean {
    return this.rooms.has(roomId);
  }

  /**
   * Get room count
   */
  getRoomCount(): number {
    return this.rooms.size;
  }

  /**
   * Update global options
   */
  updateOptions(options: Partial<InterruptHandlerOptions>): void {
    this.options = { ...this.options, ...options };
  }

  /**
   * Dispose the handler
   */
  dispose(): void {
    this.rooms.clear();
  }

  // ========== Private Methods ==========

  /**
   * Update minute counter (reset if minute passed)
   */
  private updateMinuteCounter(state: RoomInterruptState): void {
    if (Date.now() > state.minuteResetAt.getTime()) {
      state.interruptCountThisMinute = 0;
      state.minuteResetAt = new Date(Date.now() + 60000);
    }
  }

  /**
   * Log interrupt event
   */
  private logEvent(state: RoomInterruptState, event: InterruptEvent): void {
    if (this.options.logAllEvents) {
      state.history.push(event);

      // Keep history manageable
      if (state.history.length > 100) {
        state.history = state.history.slice(-50);
      }

      this.callbacks.onLogEvent?.(event);
    }
  }
}

/**
 * Factory function
 */
export function createInterruptHandler(
  options?: InterruptHandlerOptions,
  callbacks?: InterruptHandlerCallbacks
): InterruptHandler {
  return new InterruptHandler(options, callbacks);
}

export default InterruptHandler;
