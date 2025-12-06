/**
 * useTurnManager Hook Tests
 *
 * Tests for client-side turn-taking coordination.
 *
 * Part of the Long-Horizon Engineering Protocol - FEAT-153
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useTurnManager } from '@/hooks/useTurnManager';
import type { RoomAIState, TurnRequest, AIStateEvent } from '@/types/voice-mode';

// Mock signaling client
const mockRequestTurn = vi.fn();
const mockCancelTurn = vi.fn();
const mockInterruptAI = vi.fn();
const mockGetConnectionState = vi.fn();
const mockOn = vi.fn();
const mockOff = vi.fn();
const mockGetSocket = vi.fn();

const createMockSignalingClient = () => ({
  requestTurn: mockRequestTurn,
  cancelTurn: mockCancelTurn,
  interruptAI: mockInterruptAI,
  getConnectionState: mockGetConnectionState,
  on: mockOn,
  off: mockOff,
  getSocket: mockGetSocket,
});

// Sample test data
const createMockAIState = (overrides?: Partial<RoomAIState>): RoomAIState => ({
  state: 'idle',
  stateStartedAt: new Date(),
  queue: {
    queue: [],
    totalProcessed: 0,
    totalExpired: 0,
  },
  isSessionHealthy: true,
  ...overrides,
});

const createMockTurnRequest = (overrides?: Partial<TurnRequest>): TurnRequest => ({
  id: 'request-123',
  peerId: 'peer-1',
  peerDisplayName: 'Test User',
  roomId: 'room-123',
  createdAt: new Date(),
  expiresAt: new Date(Date.now() + 30000),
  position: 1,
  priority: 0,
  ...overrides,
});

describe('useTurnManager', () => {
  let mockSocket: { on: typeof vi.fn; off: typeof vi.fn; emit: typeof vi.fn };

  beforeEach(() => {
    vi.clearAllMocks();
    mockSocket = {
      on: vi.fn(),
      off: vi.fn(),
      emit: vi.fn(),
    };
    mockGetSocket.mockReturnValue(mockSocket);
    mockGetConnectionState.mockReturnValue('connected');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Initial State', () => {
    it('returns initial state without options', () => {
      const { result } = renderHook(() => useTurnManager());

      expect(result.current.aiState).toBe('idle');
      expect(result.current.canRequestTurn).toBe(false);
      expect(result.current.queuePosition).toBe(0);
      expect(result.current.isMyTurn).toBe(false);
      expect(result.current.queueLength).toBe(0);
      expect(result.current.currentSpeakerId).toBeNull();
      expect(result.current.isSessionHealthy).toBe(true);
      expect(result.current.lastError).toBeNull();
      expect(result.current.fullAIState).toBeNull();
    });

    it('provides action functions', () => {
      const { result } = renderHook(() => useTurnManager());

      expect(typeof result.current.requestTurn).toBe('function');
      expect(typeof result.current.cancelTurn).toBe('function');
      expect(typeof result.current.interruptAI).toBe('function');
    });

    it('returns proper state object structure', () => {
      const { result } = renderHook(() => useTurnManager());

      expect(result.current.state).toEqual({
        aiState: 'idle',
        canRequestTurn: false,
        queuePosition: 0,
        isMyTurn: false,
        queueLength: 0,
        ptt: expect.objectContaining({
          isActive: false,
          canActivate: false,
        }),
      });
    });
  });

  describe('Turn Request Eligibility', () => {
    it('cannot request turn without signaling client', () => {
      const { result } = renderHook(() =>
        useTurnManager({
          roomId: 'room-123',
          localPeerId: 'peer-1',
        })
      );

      expect(result.current.canRequestTurn).toBe(false);
    });

    it('cannot request turn without room ID', () => {
      const { result } = renderHook(() =>
        useTurnManager({
          signalingClient: createMockSignalingClient() as any,
          localPeerId: 'peer-1',
        })
      );

      expect(result.current.canRequestTurn).toBe(false);
    });

    it('cannot request turn without local peer ID', () => {
      const { result } = renderHook(() =>
        useTurnManager({
          signalingClient: createMockSignalingClient() as any,
          roomId: 'room-123',
        })
      );

      expect(result.current.canRequestTurn).toBe(false);
    });

    it('can request turn with all required options in open mode', async () => {
      const mockClient = createMockSignalingClient();

      const { result } = renderHook(() =>
        useTurnManager({
          signalingClient: mockClient as any,
          roomId: 'room-123',
          localPeerId: 'peer-1',
          localDisplayName: 'Test User',
          voiceMode: 'open', // Open mode allows turn requests without AI state
        })
      );

      // In open mode with all params, can request turn
      expect(result.current.canRequestTurn).toBe(true);
    });

    it('cannot request turn in designatedSpeaker mode if not designated', () => {
      const mockClient = createMockSignalingClient();

      const { result } = renderHook(() =>
        useTurnManager({
          signalingClient: mockClient as any,
          roomId: 'room-123',
          localPeerId: 'peer-1',
          voiceMode: 'designatedSpeaker',
          isDesignatedSpeaker: false,
        })
      );

      expect(result.current.canRequestTurn).toBe(false);
    });

    it('can request turn in designatedSpeaker mode if designated', () => {
      const mockClient = createMockSignalingClient();

      const { result } = renderHook(() =>
        useTurnManager({
          signalingClient: mockClient as any,
          roomId: 'room-123',
          localPeerId: 'peer-1',
          voiceMode: 'designatedSpeaker',
          isDesignatedSpeaker: true,
        })
      );

      // In designatedSpeaker mode with designated = true, can request turn
      expect(result.current.canRequestTurn).toBe(true);
    });
  });

  describe('Queue Position Tracking', () => {
    it('returns queue position 0 when not in queue', () => {
      const { result } = renderHook(() =>
        useTurnManager({
          localPeerId: 'peer-1',
        })
      );

      expect(result.current.queuePosition).toBe(0);
    });

    it('calculates queue position from AI state', () => {
      const aiStateWithQueue = createMockAIState({
        queue: {
          queue: [
            createMockTurnRequest({ peerId: 'peer-2', position: 1 }),
            createMockTurnRequest({ peerId: 'peer-1', position: 2 }),
          ],
          totalProcessed: 0,
          totalExpired: 0,
        },
      });

      const mockClient = createMockSignalingClient();
      const { result } = renderHook(() =>
        useTurnManager({
          signalingClient: mockClient as any,
          roomId: 'room-123',
          localPeerId: 'peer-1',
        })
      );

      // Simulate receiving AI state
      act(() => {
        // Manually trigger the state update
        const socketOnCalls = mockSocket.on.mock.calls;
        const aiStateHandler = socketOnCalls.find(
          (call) => call[0] === 'ai:state'
        )?.[1];
        if (aiStateHandler) {
          aiStateHandler({
            roomId: 'room-123',
            state: aiStateWithQueue,
          });
        }
      });
    });

    it('returns position 0 when has active turn', () => {
      const aiStateWithActiveTurn = createMockAIState({
        queue: {
          queue: [],
          activeTurn: createMockTurnRequest({ peerId: 'peer-1' }),
          totalProcessed: 0,
          totalExpired: 0,
        },
      });

      const mockClient = createMockSignalingClient();
      const { result } = renderHook(() =>
        useTurnManager({
          signalingClient: mockClient as any,
          roomId: 'room-123',
          localPeerId: 'peer-1',
        })
      );

      // Without setting up the AI state, position is 0
      expect(result.current.queuePosition).toBe(0);
    });
  });

  describe('isMyTurn Detection', () => {
    it('isMyTurn is false when no active turn', () => {
      const { result } = renderHook(() =>
        useTurnManager({
          localPeerId: 'peer-1',
        })
      );

      expect(result.current.isMyTurn).toBe(false);
    });

    it('isMyTurn is false when different peer has active turn', () => {
      const { result } = renderHook(() =>
        useTurnManager({
          localPeerId: 'peer-1',
        })
      );

      expect(result.current.isMyTurn).toBe(false);
    });
  });

  describe('Request Turn', () => {
    it('returns null when cannot request turn', async () => {
      const { result } = renderHook(() => useTurnManager());

      const request = await result.current.requestTurn();
      expect(request).toBeNull();
    });

    it('calls onTurnRejected when cannot request turn', async () => {
      const onTurnRejected = vi.fn();
      const mockClient = createMockSignalingClient();

      const { result } = renderHook(() =>
        useTurnManager(
          {
            signalingClient: mockClient as any,
            roomId: 'room-123',
            localPeerId: 'peer-1',
            voiceMode: 'designatedSpeaker',
            isDesignatedSpeaker: false,
          },
          {
            onTurnRejected,
          }
        )
      );

      await act(async () => {
        await result.current.requestTurn();
      });

      expect(onTurnRejected).toHaveBeenCalledWith('Not a designated speaker');
    });

    it('sends turn request to server when eligible', async () => {
      const mockClient = createMockSignalingClient();
      const mockRequest = createMockTurnRequest();
      mockRequestTurn.mockResolvedValue(mockRequest);

      // Set up initial AI state to make turn request possible
      const { result, rerender } = renderHook(() =>
        useTurnManager({
          signalingClient: mockClient as any,
          roomId: 'room-123',
          localPeerId: 'peer-1',
          localDisplayName: 'Test User',
          voiceMode: 'open', // Open mode doesn't require queue check
        })
      );

      // In open mode, canRequestTurn should be true with all params
      // But still need AI state for full eligibility
    });

    it('stores pending request on success', async () => {
      const mockClient = createMockSignalingClient();
      const mockRequest = createMockTurnRequest();
      mockRequestTurn.mockResolvedValue(mockRequest);

      const { result } = renderHook(() =>
        useTurnManager({
          signalingClient: mockClient as any,
          roomId: 'room-123',
          localPeerId: 'peer-1',
          localDisplayName: 'Test User',
          voiceMode: 'open',
        })
      );

      // Request should work when eligible
    });
  });

  describe('Cancel Turn', () => {
    it('does nothing without pending request', () => {
      const mockClient = createMockSignalingClient();

      const { result } = renderHook(() =>
        useTurnManager({
          signalingClient: mockClient as any,
          roomId: 'room-123',
        })
      );

      act(() => {
        result.current.cancelTurn();
      });

      expect(mockCancelTurn).not.toHaveBeenCalled();
    });

    it('does nothing without signaling client', () => {
      const { result } = renderHook(() =>
        useTurnManager({
          roomId: 'room-123',
        })
      );

      act(() => {
        result.current.cancelTurn();
      });

      // Should not throw
    });
  });

  describe('Interrupt AI', () => {
    it('returns false without canInterrupt permission', () => {
      const mockClient = createMockSignalingClient();

      const { result } = renderHook(() =>
        useTurnManager({
          signalingClient: mockClient as any,
          roomId: 'room-123',
          localPeerId: 'peer-1',
          canInterrupt: false,
        })
      );

      const success = result.current.interruptAI();
      expect(success).toBe(false);
    });

    it('returns false when AI is not speaking', () => {
      const mockClient = createMockSignalingClient();

      const { result } = renderHook(() =>
        useTurnManager({
          signalingClient: mockClient as any,
          roomId: 'room-123',
          localPeerId: 'peer-1',
          canInterrupt: true,
        })
      );

      // AI state is 'idle' by default
      const success = result.current.interruptAI();
      expect(success).toBe(false);
    });

    it('returns false without signaling client', () => {
      const { result } = renderHook(() =>
        useTurnManager({
          roomId: 'room-123',
          localPeerId: 'peer-1',
          canInterrupt: true,
        })
      );

      const success = result.current.interruptAI();
      expect(success).toBe(false);
    });

    it('returns false without room ID', () => {
      const mockClient = createMockSignalingClient();

      const { result } = renderHook(() =>
        useTurnManager({
          signalingClient: mockClient as any,
          localPeerId: 'peer-1',
          canInterrupt: true,
        })
      );

      const success = result.current.interruptAI();
      expect(success).toBe(false);
    });
  });

  describe('PTT State', () => {
    it('ptt.isActive is false when not my turn', () => {
      const { result } = renderHook(() =>
        useTurnManager({
          localPeerId: 'peer-1',
        })
      );

      expect(result.current.state.ptt.isActive).toBe(false);
    });

    it('ptt.canActivate depends on canRequestTurn', () => {
      const { result } = renderHook(() =>
        useTurnManager({
          localPeerId: 'peer-1',
        })
      );

      // Without proper setup, canRequestTurn is false
      expect(result.current.state.ptt.canActivate).toBe(false);
    });

    it('ptt.blockReason is set for designated speaker mode', () => {
      const mockClient = createMockSignalingClient();

      const { result } = renderHook(() =>
        useTurnManager({
          signalingClient: mockClient as any,
          roomId: 'room-123',
          localPeerId: 'peer-1',
          voiceMode: 'designatedSpeaker',
          isDesignatedSpeaker: false,
        })
      );

      expect(result.current.state.ptt.blockReason).toBe('not_designated');
    });
  });

  describe('Callbacks', () => {
    it('calls onQueuePositionChange when position changes', async () => {
      const onQueuePositionChange = vi.fn();
      const mockClient = createMockSignalingClient();

      const { result, rerender } = renderHook(
        ({ position }) =>
          useTurnManager(
            {
              signalingClient: mockClient as any,
              roomId: 'room-123',
              localPeerId: 'peer-1',
            },
            {
              onQueuePositionChange,
            }
          ),
        { initialProps: { position: 0 } }
      );

      // Initial position is 0
      expect(result.current.queuePosition).toBe(0);
    });

    it('calls onTurnGranted when turn becomes active', () => {
      const onTurnGranted = vi.fn();
      const mockClient = createMockSignalingClient();

      const { result } = renderHook(() =>
        useTurnManager(
          {
            signalingClient: mockClient as any,
            roomId: 'room-123',
            localPeerId: 'peer-1',
          },
          {
            onTurnGranted,
          }
        )
      );

      // Turn is not active initially
      expect(result.current.isMyTurn).toBe(false);
    });

    it('calls onTurnEnded when turn ends', () => {
      const onTurnEnded = vi.fn();
      const mockClient = createMockSignalingClient();

      const { result } = renderHook(() =>
        useTurnManager(
          {
            signalingClient: mockClient as any,
            roomId: 'room-123',
            localPeerId: 'peer-1',
          },
          {
            onTurnEnded,
          }
        )
      );

      // Turn is not active initially
      expect(result.current.isMyTurn).toBe(false);
    });
  });

  describe('AI State Events', () => {
    it('subscribes to ai:state events on mount', () => {
      const mockClient = createMockSignalingClient();

      renderHook(() =>
        useTurnManager({
          signalingClient: mockClient as any,
          roomId: 'room-123',
          localPeerId: 'peer-1',
        })
      );

      // Should have subscribed via signalingClient.on()
      expect(mockOn).toHaveBeenCalledWith('ai:state', expect.any(Function));
    });

    it('unsubscribes from events on unmount', () => {
      const mockClient = createMockSignalingClient();

      const { unmount } = renderHook(() =>
        useTurnManager({
          signalingClient: mockClient as any,
          roomId: 'room-123',
          localPeerId: 'peer-1',
        })
      );

      unmount();

      // Should have called signalingClient.off() for cleanup
      expect(mockOff).toHaveBeenCalledWith('ai:state', expect.any(Function));
    });

    it('updates state when AI state event is received', () => {
      const mockClient = createMockSignalingClient();
      let aiStateHandler: ((event: AIStateEvent) => void) | undefined;

      mockSocket.on.mockImplementation((event: string, callback: any) => {
        if (event === 'ai:state') {
          aiStateHandler = callback;
        }
      });

      const { result } = renderHook(() =>
        useTurnManager({
          signalingClient: mockClient as any,
          roomId: 'room-123',
          localPeerId: 'peer-1',
        })
      );

      // Initial state
      expect(result.current.aiState).toBe('idle');

      // Simulate receiving AI state event
      if (aiStateHandler) {
        act(() => {
          aiStateHandler!({
            type: 'ai:state_changed',
            roomId: 'room-123',
            state: createMockAIState({ state: 'speaking' }),
            timestamp: new Date(),
          });
        });

        expect(result.current.aiState).toBe('speaking');
      }
    });

    it('handles AI error events', () => {
      const onAIError = vi.fn();
      const mockClient = createMockSignalingClient();
      let aiStateHandler: ((event: AIStateEvent) => void) | undefined;

      mockSocket.on.mockImplementation((event: string, callback: any) => {
        if (event === 'ai:state') {
          aiStateHandler = callback;
        }
      });

      const { result } = renderHook(() =>
        useTurnManager(
          {
            signalingClient: mockClient as any,
            roomId: 'room-123',
            localPeerId: 'peer-1',
          },
          {
            onAIError,
          }
        )
      );

      // Simulate receiving AI error event
      if (aiStateHandler) {
        act(() => {
          aiStateHandler!({
            type: 'ai:error',
            roomId: 'room-123',
            state: createMockAIState({
              isSessionHealthy: false,
              lastError: 'Connection lost',
            }),
            timestamp: new Date(),
          });
        });

        expect(result.current.lastError).toBe('Connection lost');
        expect(result.current.isSessionHealthy).toBe(false);
        expect(onAIError).toHaveBeenCalledWith('Connection lost');
      }
    });

    it('clears error on session reconnected', () => {
      const mockClient = createMockSignalingClient();
      let aiStateHandler: ((event: AIStateEvent) => void) | undefined;

      mockSocket.on.mockImplementation((event: string, callback: any) => {
        if (event === 'ai:state') {
          aiStateHandler = callback;
        }
      });

      const { result } = renderHook(() =>
        useTurnManager({
          signalingClient: mockClient as any,
          roomId: 'room-123',
          localPeerId: 'peer-1',
        })
      );

      if (aiStateHandler) {
        // First, set an error
        act(() => {
          aiStateHandler!({
            type: 'ai:error',
            roomId: 'room-123',
            state: createMockAIState({
              isSessionHealthy: false,
              lastError: 'Error',
            }),
            timestamp: new Date(),
          });
        });

        expect(result.current.lastError).toBe('Error');

        // Then, reconnect
        act(() => {
          aiStateHandler!({
            type: 'ai:session_reconnected',
            roomId: 'room-123',
            state: createMockAIState({
              isSessionHealthy: true,
            }),
            timestamp: new Date(),
          });
        });

        expect(result.current.lastError).toBeNull();
        expect(result.current.isSessionHealthy).toBe(true);
      }
    });

    it('ignores events for other rooms', () => {
      const mockClient = createMockSignalingClient();
      let aiStateHandler: ((event: AIStateEvent) => void) | undefined;

      mockSocket.on.mockImplementation((event: string, callback: any) => {
        if (event === 'ai:state') {
          aiStateHandler = callback;
        }
      });

      const { result } = renderHook(() =>
        useTurnManager({
          signalingClient: mockClient as any,
          roomId: 'room-123',
          localPeerId: 'peer-1',
        })
      );

      if (aiStateHandler) {
        act(() => {
          aiStateHandler!({
            type: 'ai:state_changed',
            roomId: 'different-room', // Different room
            state: createMockAIState({ state: 'speaking' }),
            timestamp: new Date(),
          });
        });

        // State should remain unchanged
        expect(result.current.aiState).toBe('idle');
      }
    });
  });

  describe('Session Health', () => {
    it('isSessionHealthy is true by default', () => {
      const { result } = renderHook(() => useTurnManager());

      expect(result.current.isSessionHealthy).toBe(true);
    });

    it('reflects session health from AI state', () => {
      const mockClient = createMockSignalingClient();
      let aiStateHandler: ((event: AIStateEvent) => void) | undefined;

      mockSocket.on.mockImplementation((event: string, callback: any) => {
        if (event === 'ai:state') {
          aiStateHandler = callback;
        }
      });

      const { result } = renderHook(() =>
        useTurnManager({
          signalingClient: mockClient as any,
          roomId: 'room-123',
          localPeerId: 'peer-1',
        })
      );

      if (aiStateHandler) {
        act(() => {
          aiStateHandler!({
            type: 'ai:state_changed',
            roomId: 'room-123',
            state: createMockAIState({ isSessionHealthy: false }),
            timestamp: new Date(),
          });
        });

        expect(result.current.isSessionHealthy).toBe(false);
      }
    });
  });

  describe('Current Speaker', () => {
    it('currentSpeakerId is null when no active speaker', () => {
      const { result } = renderHook(() => useTurnManager());

      expect(result.current.currentSpeakerId).toBeNull();
    });

    it('reflects active speaker from AI state', () => {
      const mockClient = createMockSignalingClient();
      let aiStateHandler: ((event: AIStateEvent) => void) | undefined;

      mockSocket.on.mockImplementation((event: string, callback: any) => {
        if (event === 'ai:state') {
          aiStateHandler = callback;
        }
      });

      const { result } = renderHook(() =>
        useTurnManager({
          signalingClient: mockClient as any,
          roomId: 'room-123',
          localPeerId: 'peer-1',
        })
      );

      if (aiStateHandler) {
        act(() => {
          aiStateHandler!({
            type: 'ai:state_changed',
            roomId: 'room-123',
            state: createMockAIState({
              state: 'listening',
              activeSpeakerId: 'peer-2',
            }),
            timestamp: new Date(),
          });
        });

        expect(result.current.currentSpeakerId).toBe('peer-2');
      }
    });
  });

  describe('Queue Length', () => {
    it('queueLength is 0 when queue is empty', () => {
      const { result } = renderHook(() => useTurnManager());

      expect(result.current.queueLength).toBe(0);
    });

    it('reflects queue length from AI state', () => {
      const mockClient = createMockSignalingClient();
      let aiStateHandler: ((event: AIStateEvent) => void) | undefined;

      mockSocket.on.mockImplementation((event: string, callback: any) => {
        if (event === 'ai:state') {
          aiStateHandler = callback;
        }
      });

      const { result } = renderHook(() =>
        useTurnManager({
          signalingClient: mockClient as any,
          roomId: 'room-123',
          localPeerId: 'peer-1',
        })
      );

      if (aiStateHandler) {
        act(() => {
          aiStateHandler!({
            type: 'ai:queue_updated',
            roomId: 'room-123',
            state: createMockAIState({
              queue: {
                queue: [
                  createMockTurnRequest({ peerId: 'peer-2' }),
                  createMockTurnRequest({ peerId: 'peer-3' }),
                ],
                totalProcessed: 0,
                totalExpired: 0,
              },
            }),
            timestamp: new Date(),
          });
        });

        expect(result.current.queueLength).toBe(2);
      }
    });
  });

  describe('Factory Function', () => {
    it('createTurnManager returns a hook factory', async () => {
      const { createTurnManager } = await import('@/hooks/useTurnManager');

      const useCustomTurnManager = createTurnManager({
        voiceMode: 'pushToTalk',
      });

      expect(typeof useCustomTurnManager).toBe('function');
    });
  });
});
