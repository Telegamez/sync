/**
 * AI Orchestrator Tests
 *
 * Tests for the AI Orchestrator which manages single OpenAI
 * Realtime API connections per room.
 *
 * Part of the Long-Horizon Engineering Protocol - FEAT-300
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  AIOrchestrator,
  createAIOrchestrator,
  type AIOrchestatorOptions,
  type AIOrchestatorCallbacks,
  type AISessionInfo,
  type OpenAISessionConfig,
} from '@/server/signaling/ai-orchestrator';
import type { RoomId } from '@/types/room';
import type { PeerId } from '@/types/peer';

// Helper to create orchestrator with defaults
function createTestOrchestrator(
  options?: Partial<AIOrchestatorOptions>,
  callbacks?: AIOrchestatorCallbacks
) {
  const defaultOptions: AIOrchestatorOptions = {
    openaiConfig: {
      apiKey: 'test-api-key',
    },
    ...options,
  };
  return createAIOrchestrator(defaultOptions, callbacks);
}

describe('AIOrchestrator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Session Creation', () => {
    it('creates a session for a room', async () => {
      const orchestrator = createTestOrchestrator();
      const roomId = 'room-123' as RoomId;

      const session = await orchestrator.createSession(roomId);

      expect(session).toBeDefined();
      expect(session.roomId).toBe(roomId);
      expect(session.sessionId).toBeDefined();
      expect(session.state).toBe('connected');
      expect(session.isHealthy).toBe(true);
    });

    it('returns existing session if already created', async () => {
      const orchestrator = createTestOrchestrator();
      const roomId = 'room-123' as RoomId;

      const session1 = await orchestrator.createSession(roomId);
      const session2 = await orchestrator.createSession(roomId);

      expect(session1.sessionId).toBe(session2.sessionId);
    });

    it('calls onSessionStateChange callback during creation', async () => {
      const onSessionStateChange = vi.fn();
      const orchestrator = createTestOrchestrator({}, { onSessionStateChange });
      const roomId = 'room-123' as RoomId;

      await orchestrator.createSession(roomId);

      expect(onSessionStateChange).toHaveBeenCalled();
      const lastCall = onSessionStateChange.mock.calls[onSessionStateChange.mock.calls.length - 1];
      expect(lastCall[0]).toBe(roomId);
      expect(lastCall[1].state).toBe('connected');
    });

    it('creates session with custom OpenAI config', async () => {
      const orchestrator = createTestOrchestrator();
      const roomId = 'room-123' as RoomId;

      const session = await orchestrator.createSession(roomId, {
        voice: 'echo',
        temperature: 0.5,
        instructions: 'Be helpful',
      });

      expect(session).toBeDefined();
      expect(session.state).toBe('connected');
    });

    it('tracks session info correctly', async () => {
      const orchestrator = createTestOrchestrator();
      const roomId = 'room-123' as RoomId;

      await orchestrator.createSession(roomId);
      const session = orchestrator.getSession(roomId);

      expect(session).toBeDefined();
      expect(session!.sessionId).toBeDefined();
      expect(session!.createdAt).toBeInstanceOf(Date);
      expect(session!.lastActiveAt).toBeInstanceOf(Date);
      expect(session!.reconnectAttempts).toBe(0);
    });
  });

  describe('Session Destruction', () => {
    it('destroys a session', async () => {
      const orchestrator = createTestOrchestrator();
      const roomId = 'room-123' as RoomId;

      await orchestrator.createSession(roomId);
      expect(orchestrator.hasSession(roomId)).toBe(true);

      const destroyed = orchestrator.destroySession(roomId);

      expect(destroyed).toBe(true);
      expect(orchestrator.hasSession(roomId)).toBe(false);
    });

    it('returns false when destroying non-existent session', () => {
      const orchestrator = createTestOrchestrator();

      const destroyed = orchestrator.destroySession('non-existent' as RoomId);

      expect(destroyed).toBe(false);
    });

    it('clears all timers on destruction', async () => {
      const orchestrator = createTestOrchestrator({
        healthCheckIntervalMs: 1000,
      });
      const roomId = 'room-123' as RoomId;

      await orchestrator.createSession(roomId);
      orchestrator.destroySession(roomId);

      // Advance time - should not throw
      vi.advanceTimersByTime(10000);
    });
  });

  describe('Session Queries', () => {
    it('checks if room has session', async () => {
      const orchestrator = createTestOrchestrator();
      const roomId = 'room-123' as RoomId;

      expect(orchestrator.hasSession(roomId)).toBe(false);

      await orchestrator.createSession(roomId);

      expect(orchestrator.hasSession(roomId)).toBe(true);
    });

    it('gets all active room IDs', async () => {
      const orchestrator = createTestOrchestrator();
      const roomId1 = 'room-1' as RoomId;
      const roomId2 = 'room-2' as RoomId;

      await orchestrator.createSession(roomId1);
      await orchestrator.createSession(roomId2);

      const roomIds = orchestrator.getActiveRoomIds();

      expect(roomIds).toContain(roomId1);
      expect(roomIds).toContain(roomId2);
      expect(roomIds.length).toBe(2);
    });

    it('gets session count', async () => {
      const orchestrator = createTestOrchestrator();

      expect(orchestrator.getSessionCount()).toBe(0);

      await orchestrator.createSession('room-1' as RoomId);
      expect(orchestrator.getSessionCount()).toBe(1);

      await orchestrator.createSession('room-2' as RoomId);
      expect(orchestrator.getSessionCount()).toBe(2);

      orchestrator.destroySession('room-1' as RoomId);
      expect(orchestrator.getSessionCount()).toBe(1);
    });

    it('gets AI state for a room', async () => {
      const orchestrator = createTestOrchestrator();
      const roomId = 'room-123' as RoomId;

      await orchestrator.createSession(roomId);
      const aiState = orchestrator.getAIState(roomId);

      expect(aiState).toBeDefined();
      expect(aiState!.state).toBe('idle');
      expect(aiState!.isSessionHealthy).toBe(true);
    });

    it('returns undefined for non-existent session AI state', () => {
      const orchestrator = createTestOrchestrator();

      const aiState = orchestrator.getAIState('non-existent' as RoomId);

      expect(aiState).toBeUndefined();
    });
  });

  describe('Turn Management', () => {
    it('requests a turn', async () => {
      const orchestrator = createTestOrchestrator();
      const roomId = 'room-123' as RoomId;
      const peerId = 'peer-1' as PeerId;

      await orchestrator.createSession(roomId);
      const result = orchestrator.requestTurn(roomId, peerId, 'Alice');

      expect(result).toBeDefined();
      expect(result!.requestId).toBeDefined();
      expect(result!.position).toBe(1); // Active turn has position 1
    });

    it('returns null when requesting turn for non-existent room', () => {
      const orchestrator = createTestOrchestrator();
      const peerId = 'peer-1' as PeerId;

      const result = orchestrator.requestTurn('non-existent' as RoomId, peerId, 'Alice');

      expect(result).toBeNull();
    });

    it('checks if peer can request turn', async () => {
      const orchestrator = createTestOrchestrator();
      const roomId = 'room-123' as RoomId;
      const peerId = 'peer-1' as PeerId;

      await orchestrator.createSession(roomId);
      const result = orchestrator.canRequestTurn(roomId, peerId);

      expect(result.allowed).toBe(true);
    });

    it('returns false when no session exists', () => {
      const orchestrator = createTestOrchestrator();
      const peerId = 'peer-1' as PeerId;

      const result = orchestrator.canRequestTurn('non-existent' as RoomId, peerId);

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('No active AI session');
    });

    it('cancels a turn request', async () => {
      const orchestrator = createTestOrchestrator();
      const roomId = 'room-123' as RoomId;
      const peerId = 'peer-1' as PeerId;

      await orchestrator.createSession(roomId);
      const turn = orchestrator.requestTurn(roomId, peerId, 'Alice');
      expect(turn).toBeDefined();

      const cancelled = orchestrator.cancelTurn(roomId, turn!.requestId);

      // The turn is active (not in queue), so canceling ends the turn
      expect(cancelled).toBe(true);
    });

    it('gets queue position for a peer', async () => {
      const orchestrator = createTestOrchestrator();
      const roomId = 'room-123' as RoomId;
      const peerId1 = 'peer-1' as PeerId;
      const peerId2 = 'peer-2' as PeerId;

      await orchestrator.createSession(roomId);

      // First peer gets active turn
      orchestrator.requestTurn(roomId, peerId1, 'Alice');
      orchestrator.startListening(roomId, peerId1);
      orchestrator.startSpeaking(roomId);

      // Second peer queues
      orchestrator.requestTurn(roomId, peerId2, 'Bob');

      const position = orchestrator.getQueuePosition(roomId, peerId2);
      expect(position).toBe(1);
    });
  });

  describe('AI State Transitions', () => {
    it('starts listening', async () => {
      const orchestrator = createTestOrchestrator();
      const roomId = 'room-123' as RoomId;
      const peerId = 'peer-1' as PeerId;

      await orchestrator.createSession(roomId);
      orchestrator.requestTurn(roomId, peerId, 'Alice');

      const started = orchestrator.startListening(roomId, peerId);

      expect(started).toBe(true);
      const aiState = orchestrator.getAIState(roomId);
      expect(aiState!.state).toBe('listening');
    });

    it('starts processing', async () => {
      const orchestrator = createTestOrchestrator();
      const roomId = 'room-123' as RoomId;
      const peerId = 'peer-1' as PeerId;

      await orchestrator.createSession(roomId);
      orchestrator.requestTurn(roomId, peerId, 'Alice');
      orchestrator.startListening(roomId, peerId);

      const started = orchestrator.startProcessing(roomId);

      expect(started).toBe(true);
      const aiState = orchestrator.getAIState(roomId);
      expect(aiState!.state).toBe('processing');
    });

    it('starts speaking', async () => {
      const onAudioResponseStart = vi.fn();
      const orchestrator = createTestOrchestrator({}, { onAudioResponseStart });
      const roomId = 'room-123' as RoomId;
      const peerId = 'peer-1' as PeerId;

      await orchestrator.createSession(roomId);
      orchestrator.requestTurn(roomId, peerId, 'Alice');
      orchestrator.startListening(roomId, peerId);

      const started = orchestrator.startSpeaking(roomId);

      expect(started).toBe(true);
      const aiState = orchestrator.getAIState(roomId);
      expect(aiState!.state).toBe('speaking');
      expect(onAudioResponseStart).toHaveBeenCalledWith(roomId);
    });

    it('finishes speaking', async () => {
      const onAudioResponseEnd = vi.fn();
      const orchestrator = createTestOrchestrator({}, { onAudioResponseEnd });
      const roomId = 'room-123' as RoomId;
      const peerId = 'peer-1' as PeerId;

      await orchestrator.createSession(roomId);
      orchestrator.requestTurn(roomId, peerId, 'Alice');
      orchestrator.startListening(roomId, peerId);
      orchestrator.startSpeaking(roomId);

      const finished = orchestrator.finishSpeaking(roomId);

      expect(finished).toBe(true);
      const aiState = orchestrator.getAIState(roomId);
      expect(aiState!.state).toBe('idle');
      expect(onAudioResponseEnd).toHaveBeenCalledWith(roomId);
    });

    it('interrupts AI response', async () => {
      const orchestrator = createTestOrchestrator();
      const roomId = 'room-123' as RoomId;
      const peerId = 'peer-1' as PeerId;
      const interrupterId = 'peer-owner' as PeerId;

      await orchestrator.createSession(roomId);
      orchestrator.requestTurn(roomId, peerId, 'Alice');
      orchestrator.startListening(roomId, peerId);
      orchestrator.startSpeaking(roomId);

      const interrupted = orchestrator.interrupt(roomId, interrupterId, 'Owner override');

      expect(interrupted).toBe(true);
      const aiState = orchestrator.getAIState(roomId);
      expect(aiState!.state).toBe('idle');
    });
  });

  describe('Audio Input/Output', () => {
    it('sends audio input', async () => {
      const orchestrator = createTestOrchestrator();
      const roomId = 'room-123' as RoomId;

      await orchestrator.createSession(roomId);
      const audioData = new ArrayBuffer(1024);

      const sent = orchestrator.sendAudioInput(roomId, audioData);

      expect(sent).toBe(true);
    });

    it('fails to send audio when not connected', () => {
      const orchestrator = createTestOrchestrator();
      const roomId = 'room-123' as RoomId;
      const audioData = new ArrayBuffer(1024);

      // No session created
      const sent = orchestrator.sendAudioInput(roomId, audioData);

      expect(sent).toBe(false);
    });

    it('commits audio buffer', async () => {
      const orchestrator = createTestOrchestrator();
      const roomId = 'room-123' as RoomId;
      const peerId = 'peer-1' as PeerId;

      await orchestrator.createSession(roomId);
      orchestrator.requestTurn(roomId, peerId, 'Alice');
      orchestrator.startListening(roomId, peerId);

      const committed = orchestrator.commitAudioBuffer(roomId);

      expect(committed).toBe(true);
      const aiState = orchestrator.getAIState(roomId);
      expect(aiState!.state).toBe('processing');
    });

    it('handles audio response callback', async () => {
      const onAudioData = vi.fn();
      const orchestrator = createTestOrchestrator({}, { onAudioData });
      const roomId = 'room-123' as RoomId;

      await orchestrator.createSession(roomId);
      const audioData = new ArrayBuffer(1024);

      // Simulate incoming audio from OpenAI
      orchestrator.handleAudioResponse(roomId, audioData);

      expect(onAudioData).toHaveBeenCalledWith(roomId, audioData);
    });

    it('handles transcription callback', async () => {
      const onTranscription = vi.fn();
      const orchestrator = createTestOrchestrator({}, { onTranscription });
      const roomId = 'room-123' as RoomId;

      await orchestrator.createSession(roomId);

      orchestrator.handleTranscription(roomId, 'Hello world', true);

      expect(onTranscription).toHaveBeenCalledWith(roomId, 'Hello world', true);
    });
  });

  describe('Session Configuration', () => {
    it('updates session configuration', async () => {
      const orchestrator = createTestOrchestrator();
      const roomId = 'room-123' as RoomId;

      await orchestrator.createSession(roomId);

      const updated = orchestrator.updateSessionConfig(roomId, {
        voice: 'shimmer',
        temperature: 0.3,
      });

      expect(updated).toBe(true);
    });

    it('fails to update non-existent session', () => {
      const orchestrator = createTestOrchestrator();

      const updated = orchestrator.updateSessionConfig('non-existent' as RoomId, {
        voice: 'shimmer',
      });

      expect(updated).toBe(false);
    });
  });

  describe('Reconnection', () => {
    it('reconnects a session', async () => {
      const onSessionStateChange = vi.fn();
      const orchestrator = createTestOrchestrator({}, { onSessionStateChange });
      const roomId = 'room-123' as RoomId;

      await orchestrator.createSession(roomId);

      // Simulate disconnect (would happen via WebSocket close in real impl)
      const session = orchestrator.getSession(roomId);
      expect(session!.state).toBe('connected');

      const reconnected = await orchestrator.reconnect(roomId);

      expect(reconnected).toBe(true);
    });

    it('returns false when reconnecting non-existent session', async () => {
      const orchestrator = createTestOrchestrator();

      const reconnected = await orchestrator.reconnect('non-existent' as RoomId);

      expect(reconnected).toBe(false);
    });
  });

  describe('Health Checks', () => {
    it('starts health check on connection', async () => {
      const orchestrator = createTestOrchestrator({
        healthCheckIntervalMs: 1000,
      });
      const roomId = 'room-123' as RoomId;

      await orchestrator.createSession(roomId);

      // Session should be healthy initially
      const session = orchestrator.getSession(roomId);
      expect(session!.isHealthy).toBe(true);
    });

    it('marks session unhealthy on timeout', async () => {
      const onError = vi.fn();
      const orchestrator = createTestOrchestrator(
        {
          healthCheckIntervalMs: 1000,
          sessionTimeoutMs: 5000,
        },
        { onError }
      );
      const roomId = 'room-123' as RoomId;

      await orchestrator.createSession(roomId);

      // Advance past timeout
      vi.advanceTimersByTime(6000);

      const session = orchestrator.getSession(roomId);
      expect(session!.isHealthy).toBe(false);
      expect(onError).toHaveBeenCalled();
    });
  });

  describe('Dispose', () => {
    it('disposes all sessions', async () => {
      const orchestrator = createTestOrchestrator();
      const roomId1 = 'room-1' as RoomId;
      const roomId2 = 'room-2' as RoomId;

      await orchestrator.createSession(roomId1);
      await orchestrator.createSession(roomId2);

      expect(orchestrator.getSessionCount()).toBe(2);

      orchestrator.dispose();

      expect(orchestrator.getSessionCount()).toBe(0);
      expect(orchestrator.hasSession(roomId1)).toBe(false);
      expect(orchestrator.hasSession(roomId2)).toBe(false);
    });
  });

  describe('Factory Function', () => {
    it('creates orchestrator via factory', () => {
      const orchestrator = createAIOrchestrator({
        openaiConfig: { apiKey: 'test-key' },
      });

      expect(orchestrator).toBeInstanceOf(AIOrchestrator);
    });

    it('creates orchestrator with callbacks', async () => {
      const onSessionStateChange = vi.fn();
      const orchestrator = createAIOrchestrator(
        { openaiConfig: { apiKey: 'test-key' } },
        { onSessionStateChange }
      );
      const roomId = 'room-123' as RoomId;

      await orchestrator.createSession(roomId);

      expect(onSessionStateChange).toHaveBeenCalled();
    });
  });

  describe('Default Configuration', () => {
    it('uses default OpenAI config values', async () => {
      const orchestrator = createTestOrchestrator();
      const roomId = 'room-123' as RoomId;

      await orchestrator.createSession(roomId);

      // Session should be created with defaults
      expect(orchestrator.hasSession(roomId)).toBe(true);
    });

    it('merges custom config with defaults', async () => {
      const orchestrator = createTestOrchestrator({
        maxReconnectAttempts: 10,
        reconnectDelayMs: 2000,
      });
      const roomId = 'room-123' as RoomId;

      await orchestrator.createSession(roomId);

      expect(orchestrator.hasSession(roomId)).toBe(true);
    });
  });

  describe('Multiple Rooms', () => {
    it('manages separate sessions for multiple rooms', async () => {
      const orchestrator = createTestOrchestrator();
      const roomId1 = 'room-1' as RoomId;
      const roomId2 = 'room-2' as RoomId;
      const peerId1 = 'peer-1' as PeerId;
      const peerId2 = 'peer-2' as PeerId;

      await orchestrator.createSession(roomId1);
      await orchestrator.createSession(roomId2);

      // Start turn in room 1
      orchestrator.requestTurn(roomId1, peerId1, 'Alice');
      orchestrator.startListening(roomId1, peerId1);

      // Start turn in room 2
      orchestrator.requestTurn(roomId2, peerId2, 'Bob');
      orchestrator.startListening(roomId2, peerId2);

      const aiState1 = orchestrator.getAIState(roomId1);
      const aiState2 = orchestrator.getAIState(roomId2);

      expect(aiState1!.state).toBe('listening');
      expect(aiState1!.activeSpeakerId).toBe(peerId1);
      expect(aiState2!.state).toBe('listening');
      expect(aiState2!.activeSpeakerId).toBe(peerId2);
    });

    it('destroying one room does not affect others', async () => {
      const orchestrator = createTestOrchestrator();
      const roomId1 = 'room-1' as RoomId;
      const roomId2 = 'room-2' as RoomId;

      await orchestrator.createSession(roomId1);
      await orchestrator.createSession(roomId2);

      orchestrator.destroySession(roomId1);

      expect(orchestrator.hasSession(roomId1)).toBe(false);
      expect(orchestrator.hasSession(roomId2)).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('handles errors through callback', async () => {
      const onError = vi.fn();
      const orchestrator = createTestOrchestrator({}, { onError });
      const roomId = 'room-123' as RoomId;

      await orchestrator.createSession(roomId);

      // Simulate timeout triggering error
      vi.advanceTimersByTime(4000000); // Way past timeout

      expect(onError).toHaveBeenCalled();
    });
  });

  describe('Last Activity Tracking', () => {
    it('updates lastActiveAt on audio input', async () => {
      const orchestrator = createTestOrchestrator();
      const roomId = 'room-123' as RoomId;

      await orchestrator.createSession(roomId);
      const session1 = orchestrator.getSession(roomId);
      const initialTime = session1!.lastActiveAt.getTime();

      vi.advanceTimersByTime(1000);

      orchestrator.sendAudioInput(roomId, new ArrayBuffer(1024));
      const session2 = orchestrator.getSession(roomId);

      expect(session2!.lastActiveAt.getTime()).toBeGreaterThan(initialTime);
    });

    it('updates lastActiveAt on state transitions', async () => {
      const orchestrator = createTestOrchestrator();
      const roomId = 'room-123' as RoomId;
      const peerId = 'peer-1' as PeerId;

      await orchestrator.createSession(roomId);
      orchestrator.requestTurn(roomId, peerId, 'Alice');

      const session1 = orchestrator.getSession(roomId);
      const initialTime = session1!.lastActiveAt.getTime();

      vi.advanceTimersByTime(1000);

      orchestrator.startListening(roomId, peerId);
      const session2 = orchestrator.getSession(roomId);

      expect(session2!.lastActiveAt.getTime()).toBeGreaterThan(initialTime);
    });
  });
});

describe('AIOrchestrator Integration', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('full turn lifecycle: request -> listen -> process -> speak -> finish', async () => {
    const onAudioResponseStart = vi.fn();
    const onAudioResponseEnd = vi.fn();

    const orchestrator = createTestOrchestrator(
      {},
      { onAudioResponseStart, onAudioResponseEnd }
    );

    const roomId = 'room-123' as RoomId;
    const peerId = 'peer-1' as PeerId;

    // Create session
    await orchestrator.createSession(roomId);
    expect(orchestrator.hasSession(roomId)).toBe(true);

    // Request turn
    const turn = orchestrator.requestTurn(roomId, peerId, 'Alice');
    expect(turn).toBeDefined();

    // Start listening
    orchestrator.startListening(roomId, peerId);
    let aiState = orchestrator.getAIState(roomId);
    expect(aiState!.state).toBe('listening');

    // Simulate VAD end -> processing
    orchestrator.startProcessing(roomId);
    aiState = orchestrator.getAIState(roomId);
    expect(aiState!.state).toBe('processing');

    // AI starts speaking
    orchestrator.startSpeaking(roomId);
    aiState = orchestrator.getAIState(roomId);
    expect(aiState!.state).toBe('speaking');
    expect(onAudioResponseStart).toHaveBeenCalledWith(roomId);

    // AI finishes
    orchestrator.finishSpeaking(roomId);
    aiState = orchestrator.getAIState(roomId);
    expect(aiState!.state).toBe('idle');
    expect(onAudioResponseEnd).toHaveBeenCalledWith(roomId);
  });

  it('queue processing: second peer waits while first speaks', async () => {
    const orchestrator = createTestOrchestrator();
    const roomId = 'room-123' as RoomId;
    const peerId1 = 'peer-1' as PeerId;
    const peerId2 = 'peer-2' as PeerId;

    await orchestrator.createSession(roomId);

    // First peer starts turn
    orchestrator.requestTurn(roomId, peerId1, 'Alice');
    orchestrator.startListening(roomId, peerId1);
    orchestrator.startSpeaking(roomId);

    // Second peer queues
    const turn2 = orchestrator.requestTurn(roomId, peerId2, 'Bob');
    expect(turn2).toBeDefined();
    expect(turn2!.position).toBe(1);

    // First peer finishes
    orchestrator.finishSpeaking(roomId);

    // Second peer's turn should now be active
    const aiState = orchestrator.getAIState(roomId);
    expect(aiState!.queue.activeTurn?.peerId).toBe(peerId2);
  });
});
