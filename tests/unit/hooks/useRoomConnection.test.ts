/**
 * useRoomConnection Hook Tests
 *
 * Tests for Socket.io connection management and room state.
 *
 * Part of the Long-Horizon Engineering Protocol - FEAT-108
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useRoomConnection } from '@/hooks/useRoomConnection';
import type { RoomJoinedPayload, SocketConnectionState } from '@/types/signaling';
import type { Room } from '@/types/room';
import type { Peer, PeerSummary } from '@/types/peer';

// Mock the signaling client
const mockConnect = vi.fn();
const mockDisconnect = vi.fn();
const mockJoinRoom = vi.fn();
const mockLeaveRoom = vi.fn();
const mockSendHeartbeat = vi.fn();
const mockGetConnectionState = vi.fn();
const mockOn = vi.fn();
const mockOff = vi.fn();

vi.mock('@/lib/signaling/client', () => ({
  createSignalingClient: vi.fn(() => ({
    connect: mockConnect,
    disconnect: mockDisconnect,
    joinRoom: mockJoinRoom,
    leaveRoom: mockLeaveRoom,
    sendHeartbeat: mockSendHeartbeat,
    getConnectionState: mockGetConnectionState,
    on: mockOn,
    off: mockOff,
  })),
}));

// Sample test data
const createMockRoom = (overrides?: Partial<Room>): Room => ({
  id: 'room-123',
  name: 'Test Room',
  description: '',
  ownerId: 'owner-1',
  maxParticipants: 4,
  status: 'active',
  participants: [],
  participantCount: 1,
  aiPersonality: 'default',
  voiceSettings: {
    mode: 'pushToTalk',
    aiResponseLocking: true,
    autoUnmute: false,
    peerAudio: true,
    aiAudio: true,
    turnTimeout: 30000,
    maxQueueSize: 10,
  },
  createdAt: new Date(),
  lastActivityAt: new Date(),
  ...overrides,
});

const createMockPeer = (overrides?: Partial<Peer>): Peer => ({
  id: 'peer-1',
  displayName: 'Test User',
  role: 'participant',
  roomId: 'room-123',
  presence: {
    connectionState: 'connected',
    audio: {
      isMuted: false,
      isSpeaking: false,
      isAddressingAI: false,
      audioLevel: 0,
    },
    lastActiveAt: new Date(),
    isIdle: false,
  },
  joinedAt: new Date(),
  ...overrides,
});

const createMockPeerSummary = (overrides?: Partial<PeerSummary>): PeerSummary => ({
  id: 'peer-2',
  displayName: 'Other User',
  role: 'participant',
  isMuted: false,
  isSpeaking: false,
  connectionState: 'connected',
  ...overrides,
});

const createMockJoinResponse = (): RoomJoinedPayload => ({
  room: createMockRoom(),
  localPeer: createMockPeer(),
  peers: [createMockPeerSummary()],
  aiState: {
    state: 'idle',
    stateStartedAt: new Date(),
    queue: {
      queue: [],
      totalProcessed: 0,
      totalExpired: 0,
    },
    isSessionHealthy: true,
  },
});

describe('useRoomConnection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockGetConnectionState.mockReturnValue('disconnected');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Initial State', () => {
    it('returns initial disconnected state', () => {
      const { result } = renderHook(() => useRoomConnection());

      expect(result.current.connectionState).toBe('disconnected');
      expect(result.current.room).toBeNull();
      expect(result.current.localPeer).toBeNull();
      expect(result.current.peers).toEqual([]);
      expect(result.current.aiState).toBeNull();
      expect(result.current.isInRoom).toBe(false);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it('provides action functions', () => {
      const { result } = renderHook(() => useRoomConnection());

      expect(typeof result.current.connect).toBe('function');
      expect(typeof result.current.disconnect).toBe('function');
      expect(typeof result.current.joinRoom).toBe('function');
      expect(typeof result.current.leaveRoom).toBe('function');
      expect(typeof result.current.clearError).toBe('function');
      expect(typeof result.current.getClient).toBe('function');
    });
  });

  describe('Connection', () => {
    it('connects to signaling server', async () => {
      mockConnect.mockResolvedValue(undefined);
      mockGetConnectionState.mockReturnValue('connected');

      const { result } = renderHook(() => useRoomConnection());

      await act(async () => {
        await result.current.connect();
      });

      expect(mockConnect).toHaveBeenCalled();
      expect(result.current.connectionState).toBe('connected');
      expect(result.current.isLoading).toBe(false);
    });

    it('sets loading state while connecting', async () => {
      let resolveConnect: () => void;
      mockConnect.mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveConnect = resolve;
          })
      );

      const { result } = renderHook(() => useRoomConnection());

      act(() => {
        result.current.connect();
      });

      expect(result.current.connectionState).toBe('connecting');
      expect(result.current.isLoading).toBe(true);

      await act(async () => {
        resolveConnect!();
      });

      expect(result.current.isLoading).toBe(false);
    });

    it('handles connection error', async () => {
      mockConnect.mockRejectedValue(new Error('Connection failed'));

      const { result } = renderHook(() => useRoomConnection());

      await act(async () => {
        try {
          await result.current.connect();
        } catch {
          // Expected
        }
      });

      expect(result.current.connectionState).toBe('error');
      expect(result.current.error?.code).toBe('CONNECTION_FAILED');
      expect(result.current.error?.message).toBe('Connection failed');
    });

    it('disconnects from signaling server', async () => {
      mockConnect.mockResolvedValue(undefined);
      mockGetConnectionState.mockReturnValue('connected');

      const { result } = renderHook(() => useRoomConnection());

      await act(async () => {
        await result.current.connect();
      });

      act(() => {
        result.current.disconnect();
      });

      expect(mockDisconnect).toHaveBeenCalled();
      expect(result.current.connectionState).toBe('disconnected');
    });
  });

  describe('Room Join', () => {
    beforeEach(() => {
      mockConnect.mockResolvedValue(undefined);
      mockGetConnectionState.mockReturnValue('connected');
    });

    it('joins a room successfully', async () => {
      const joinResponse = createMockJoinResponse();
      mockJoinRoom.mockResolvedValue(joinResponse);

      // Capture the onRoomJoined handler
      let onRoomJoinedHandler: ((payload: RoomJoinedPayload) => void) | undefined;
      mockOn.mockImplementation((event: string, handler: unknown) => {
        if (event === 'onRoomJoined') {
          onRoomJoinedHandler = handler as (payload: RoomJoinedPayload) => void;
        }
      });

      const { result } = renderHook(() => useRoomConnection());

      await act(async () => {
        await result.current.connect();
      });

      await act(async () => {
        const response = await result.current.joinRoom('room-123', 'Test User');
        // Simulate the event handler being called
        onRoomJoinedHandler?.(response);
      });

      expect(mockJoinRoom).toHaveBeenCalledWith({
        roomId: 'room-123',
        displayName: 'Test User',
        avatarUrl: undefined,
      });
      expect(result.current.isInRoom).toBe(true);
      expect(result.current.room?.id).toBe('room-123');
      expect(result.current.localPeer?.displayName).toBe('Test User');
      expect(result.current.peers).toHaveLength(1);
    });

    it('handles join error', async () => {
      mockJoinRoom.mockRejectedValue(new Error('Room not found'));

      const { result } = renderHook(() => useRoomConnection());

      await act(async () => {
        await result.current.connect();
      });

      await act(async () => {
        try {
          await result.current.joinRoom('invalid-room', 'Test User');
        } catch {
          // Expected
        }
      });

      expect(result.current.error?.code).toBe('JOIN_FAILED');
      expect(result.current.error?.roomId).toBe('invalid-room');
      expect(result.current.isInRoom).toBe(false);
    });

    it('throws if not connected', async () => {
      const { result } = renderHook(() => useRoomConnection());

      await expect(
        result.current.joinRoom('room-123', 'Test User')
      ).rejects.toThrow('Not connected to signaling server');
    });
  });

  describe('Room Leave', () => {
    it('leaves room successfully', async () => {
      const joinResponse = createMockJoinResponse();
      mockConnect.mockResolvedValue(undefined);
      mockGetConnectionState.mockReturnValue('connected');
      mockJoinRoom.mockResolvedValue(joinResponse);
      mockLeaveRoom.mockResolvedValue(undefined);

      // Capture handlers
      let onRoomJoinedHandler: ((payload: RoomJoinedPayload) => void) | undefined;
      let onRoomLeftHandler: ((payload: { roomId: string }) => void) | undefined;
      mockOn.mockImplementation((event: string, handler: unknown) => {
        if (event === 'onRoomJoined') {
          onRoomJoinedHandler = handler as (payload: RoomJoinedPayload) => void;
        }
        if (event === 'onRoomLeft') {
          onRoomLeftHandler = handler as (payload: { roomId: string }) => void;
        }
      });

      const { result } = renderHook(() => useRoomConnection());

      await act(async () => {
        await result.current.connect();
      });

      await act(async () => {
        const response = await result.current.joinRoom('room-123', 'Test User');
        onRoomJoinedHandler?.(response);
      });

      expect(result.current.isInRoom).toBe(true);

      await act(async () => {
        await result.current.leaveRoom();
        onRoomLeftHandler?.({ roomId: 'room-123' });
      });

      expect(mockLeaveRoom).toHaveBeenCalledWith({ roomId: 'room-123' });
      expect(result.current.isInRoom).toBe(false);
      expect(result.current.room).toBeNull();
    });

    it('handles leave when not in room', async () => {
      mockConnect.mockResolvedValue(undefined);
      mockGetConnectionState.mockReturnValue('connected');

      const { result } = renderHook(() => useRoomConnection());

      await act(async () => {
        await result.current.connect();
      });

      // Should not throw
      await act(async () => {
        await result.current.leaveRoom();
      });

      expect(mockLeaveRoom).not.toHaveBeenCalled();
    });
  });

  describe('Peer Events', () => {
    it('updates peers on peer:joined', async () => {
      const joinResponse = createMockJoinResponse();
      mockConnect.mockResolvedValue(undefined);
      mockGetConnectionState.mockReturnValue('connected');
      mockJoinRoom.mockResolvedValue(joinResponse);

      let onRoomJoinedHandler: ((payload: RoomJoinedPayload) => void) | undefined;
      let onPeerJoinedHandler: ((peer: PeerSummary) => void) | undefined;
      mockOn.mockImplementation((event: string, handler: unknown) => {
        if (event === 'onRoomJoined') {
          onRoomJoinedHandler = handler as (payload: RoomJoinedPayload) => void;
        }
        if (event === 'onPeerJoined') {
          onPeerJoinedHandler = handler as (peer: PeerSummary) => void;
        }
      });

      const { result } = renderHook(() => useRoomConnection());

      await act(async () => {
        await result.current.connect();
      });

      await act(async () => {
        const response = await result.current.joinRoom('room-123', 'Test User');
        onRoomJoinedHandler?.(response);
      });

      const newPeer = createMockPeerSummary({ id: 'peer-3', displayName: 'New User' });

      act(() => {
        onPeerJoinedHandler?.(newPeer);
      });

      expect(result.current.peers).toHaveLength(2);
      expect(result.current.peers.find((p) => p.id === 'peer-3')).toBeDefined();
      expect(result.current.room?.participantCount).toBe(2);
    });

    it('removes peer on peer:left', async () => {
      const joinResponse = createMockJoinResponse();
      mockConnect.mockResolvedValue(undefined);
      mockGetConnectionState.mockReturnValue('connected');
      mockJoinRoom.mockResolvedValue(joinResponse);

      let onRoomJoinedHandler: ((payload: RoomJoinedPayload) => void) | undefined;
      let onPeerLeftHandler: ((peerId: string) => void) | undefined;
      mockOn.mockImplementation((event: string, handler: unknown) => {
        if (event === 'onRoomJoined') {
          onRoomJoinedHandler = handler as (payload: RoomJoinedPayload) => void;
        }
        if (event === 'onPeerLeft') {
          onPeerLeftHandler = handler as (peerId: string) => void;
        }
      });

      const { result } = renderHook(() => useRoomConnection());

      await act(async () => {
        await result.current.connect();
      });

      await act(async () => {
        const response = await result.current.joinRoom('room-123', 'Test User');
        onRoomJoinedHandler?.(response);
      });

      expect(result.current.peers).toHaveLength(1);

      act(() => {
        onPeerLeftHandler?.('peer-2');
      });

      expect(result.current.peers).toHaveLength(0);
    });
  });

  describe('Error Handling', () => {
    it('clears error state', async () => {
      mockConnect.mockRejectedValue(new Error('Connection failed'));

      const { result } = renderHook(() => useRoomConnection());

      await act(async () => {
        try {
          await result.current.connect();
        } catch {
          // Expected
        }
      });

      expect(result.current.error).not.toBeNull();

      act(() => {
        result.current.clearError();
      });

      expect(result.current.error).toBeNull();
    });

    it('sets error on room closed', async () => {
      const joinResponse = createMockJoinResponse();
      mockConnect.mockResolvedValue(undefined);
      mockGetConnectionState.mockReturnValue('connected');
      mockJoinRoom.mockResolvedValue(joinResponse);

      let onRoomJoinedHandler: ((payload: RoomJoinedPayload) => void) | undefined;
      let onRoomClosedHandler: ((roomId: string) => void) | undefined;
      mockOn.mockImplementation((event: string, handler: unknown) => {
        if (event === 'onRoomJoined') {
          onRoomJoinedHandler = handler as (payload: RoomJoinedPayload) => void;
        }
        if (event === 'onRoomClosed') {
          onRoomClosedHandler = handler as (roomId: string) => void;
        }
      });

      const { result } = renderHook(() => useRoomConnection());

      await act(async () => {
        await result.current.connect();
      });

      await act(async () => {
        const response = await result.current.joinRoom('room-123', 'Test User');
        onRoomJoinedHandler?.(response);
      });

      act(() => {
        onRoomClosedHandler?.('room-123');
      });

      expect(result.current.error?.code).toBe('ROOM_CLOSED');
      expect(result.current.isInRoom).toBe(false);
    });
  });

  describe('Heartbeat', () => {
    it('sends heartbeat periodically after joining', async () => {
      const joinResponse = createMockJoinResponse();
      mockConnect.mockResolvedValue(undefined);
      mockGetConnectionState.mockReturnValue('connected');
      mockJoinRoom.mockResolvedValue(joinResponse);

      let onRoomJoinedHandler: ((payload: RoomJoinedPayload) => void) | undefined;
      mockOn.mockImplementation((event: string, handler: unknown) => {
        if (event === 'onRoomJoined') {
          onRoomJoinedHandler = handler as (payload: RoomJoinedPayload) => void;
        }
      });

      const { result } = renderHook(() =>
        useRoomConnection({ heartbeatInterval: 1000 })
      );

      await act(async () => {
        await result.current.connect();
      });

      await act(async () => {
        const response = await result.current.joinRoom('room-123', 'Test User');
        onRoomJoinedHandler?.(response);
      });

      // Fast-forward time
      await act(async () => {
        vi.advanceTimersByTime(1000);
      });

      expect(mockSendHeartbeat).toHaveBeenCalled();
    });
  });

  describe('Cleanup', () => {
    it('disconnects on unmount', async () => {
      mockConnect.mockResolvedValue(undefined);
      mockGetConnectionState.mockReturnValue('connected');

      const { result, unmount } = renderHook(() =>
        useRoomConnection({ autoConnect: true })
      );

      await act(async () => {
        await vi.runAllTimersAsync();
      });

      unmount();

      expect(mockDisconnect).toHaveBeenCalled();
    });
  });

  describe('getClient', () => {
    it('returns null when not connected', () => {
      const { result } = renderHook(() => useRoomConnection());

      expect(result.current.getClient()).toBeNull();
    });

    it('returns client after connect', async () => {
      mockConnect.mockResolvedValue(undefined);
      mockGetConnectionState.mockReturnValue('connected');

      const { result } = renderHook(() => useRoomConnection());

      await act(async () => {
        await result.current.connect();
      });

      expect(result.current.getClient()).not.toBeNull();
    });
  });
});
