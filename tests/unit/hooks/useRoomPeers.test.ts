/**
 * useRoomPeers Hook Tests
 *
 * Tests for peer state management and WebRTC connections.
 *
 * Part of the Long-Horizon Engineering Protocol - FEAT-109
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { useRoomPeers } from '@/hooks/useRoomPeers';
import type { PeerSummary } from '@/types/peer';
import type { SignalingClient } from '@/lib/signaling/client';

// Simplified mock RTCPeerConnection
class MockRTCPeerConnection {
  connectionState: RTCPeerConnectionState = 'new';
  remoteDescription: RTCSessionDescription | null = null;
  localDescription: RTCSessionDescription | null = null;
  private senders: { track: { kind: string } | null }[] = [];

  onconnectionstatechange: (() => void) | null = null;
  onicecandidate: ((event: { candidate: RTCIceCandidate | null }) => void) | null = null;
  ontrack: ((event: { streams: MediaStream[] }) => void) | null = null;

  async createOffer() {
    return { type: 'offer' as const, sdp: 'mock-offer' };
  }

  async createAnswer() {
    return { type: 'answer' as const, sdp: 'mock-answer' };
  }

  async setLocalDescription(desc: RTCSessionDescriptionInit) {
    this.localDescription = desc as RTCSessionDescription;
  }

  async setRemoteDescription(desc: RTCSessionDescription) {
    this.remoteDescription = desc;
  }

  async addIceCandidate() {}

  addTrack(track: MediaStreamTrack, _stream: MediaStream) {
    this.senders.push({ track: { kind: track.kind } });
    return {} as RTCRtpSender;
  }

  removeTrack() {
    this.senders.pop();
  }

  getSenders() {
    return this.senders as unknown as RTCRtpSender[];
  }

  close() {
    this.connectionState = 'closed';
    this.onconnectionstatechange?.();
  }

  // Test helpers
  simulateConnectionState(state: RTCPeerConnectionState) {
    this.connectionState = state;
    this.onconnectionstatechange?.();
  }

  simulateTrack(stream: MediaStream) {
    this.ontrack?.({ streams: [stream] });
  }
}

// Store instances for testing
let mockPcInstances: MockRTCPeerConnection[] = [];

// Mock signaling client factory
function createMockClient() {
  const handlers = new Map<string, Function>();
  return {
    on: vi.fn((event: string, handler: Function) => handlers.set(event, handler)),
    off: vi.fn((event: string) => handlers.delete(event)),
    sendOffer: vi.fn(),
    sendAnswer: vi.fn(),
    sendIce: vi.fn(),
    _trigger: (event: string, ...args: unknown[]) => handlers.get(event)?.(...args),
  };
}

// Mock peer summary factory
function createMockPeerSummary(overrides?: Partial<PeerSummary>): PeerSummary {
  return {
    id: 'peer-2',
    displayName: 'Other User',
    role: 'participant',
    isMuted: false,
    isSpeaking: false,
    connectionState: 'connected',
    ...overrides,
  };
}

beforeEach(() => {
  mockPcInstances = [];
  vi.stubGlobal('RTCPeerConnection', function () {
    const pc = new MockRTCPeerConnection();
    mockPcInstances.push(pc);
    return pc;
  });
  vi.stubGlobal('RTCSessionDescription', function (init: RTCSessionDescriptionInit) {
    return init;
  });
  vi.stubGlobal('RTCIceCandidate', function (init: RTCIceCandidateInit) {
    return { ...init, toJSON: () => init };
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('useRoomPeers', () => {
  describe('Initial State', () => {
    it('returns empty state when no client', () => {
      const { result } = renderHook(() =>
        useRoomPeers({ client: null, roomId: null, localPeerId: null })
      );

      expect(result.current.peers).toEqual([]);
      expect(result.current.peerCount).toBe(0);
      expect(result.current.connectedCount).toBe(0);
      expect(result.current.allConnected).toBe(false);
    });

    it('initializes with provided peers', () => {
      const initialPeers = [
        createMockPeerSummary({ id: 'peer-2', displayName: 'User 2' }),
        createMockPeerSummary({ id: 'peer-3', displayName: 'User 3' }),
      ];
      const mockClient = createMockClient();

      const { result } = renderHook(() =>
        useRoomPeers({
          client: mockClient as unknown as SignalingClient,
          roomId: 'room-123',
          localPeerId: 'peer-1',
          initialPeers,
        })
      );

      expect(result.current.peers).toHaveLength(2);
      expect(result.current.peerCount).toBe(2);
    });

    it('provides action functions', () => {
      const { result } = renderHook(() =>
        useRoomPeers({ client: null, roomId: null, localPeerId: null })
      );

      expect(typeof result.current.setLocalStream).toBe('function');
      expect(typeof result.current.getPeer).toBe('function');
      expect(typeof result.current.getAudioStreams).toBe('function');
      expect(typeof result.current.reconnectPeer).toBe('function');
    });
  });

  describe('Peer Events', () => {
    it('adds peer on peer:joined', () => {
      const mockClient = createMockClient();

      const { result } = renderHook(() =>
        useRoomPeers({
          client: mockClient as unknown as SignalingClient,
          roomId: 'room-123',
          localPeerId: 'peer-1',
        })
      );

      act(() => {
        mockClient._trigger('onPeerJoined', createMockPeerSummary({ id: 'peer-3' }));
      });

      expect(result.current.peers).toHaveLength(1);
    });

    it('removes peer on peer:left', () => {
      const mockClient = createMockClient();

      const { result } = renderHook(() =>
        useRoomPeers({
          client: mockClient as unknown as SignalingClient,
          roomId: 'room-123',
          localPeerId: 'peer-1',
          initialPeers: [createMockPeerSummary({ id: 'peer-2' })],
        })
      );

      expect(result.current.peers).toHaveLength(1);

      act(() => {
        mockClient._trigger('onPeerLeft', 'peer-2');
      });

      expect(result.current.peers).toHaveLength(0);
    });

    it('updates peer on peer:updated', () => {
      const mockClient = createMockClient();

      const { result } = renderHook(() =>
        useRoomPeers({
          client: mockClient as unknown as SignalingClient,
          roomId: 'room-123',
          localPeerId: 'peer-1',
          initialPeers: [createMockPeerSummary({ id: 'peer-2', isMuted: false })],
        })
      );

      act(() => {
        mockClient._trigger('onPeerUpdated', createMockPeerSummary({ id: 'peer-2', isMuted: true }));
      });

      expect(result.current.peers[0].isMuted).toBe(true);
    });
  });

  describe('WebRTC Connection', () => {
    it('initiates connection to peer with higher ID', async () => {
      const mockClient = createMockClient();

      renderHook(() =>
        useRoomPeers({
          client: mockClient as unknown as SignalingClient,
          roomId: 'room-123',
          localPeerId: 'peer-1',
          initialPeers: [createMockPeerSummary({ id: 'peer-2' })],
        })
      );

      // Wait for effects to run
      await act(async () => {
        await new Promise((r) => setTimeout(r, 10));
      });

      expect(mockClient.sendOffer).toHaveBeenCalledWith(
        expect.objectContaining({ targetPeerId: 'peer-2' })
      );
    });

    it('does not initiate to peer with lower ID', () => {
      const mockClient = createMockClient();

      renderHook(() =>
        useRoomPeers({
          client: mockClient as unknown as SignalingClient,
          roomId: 'room-123',
          localPeerId: 'peer-5',
          initialPeers: [createMockPeerSummary({ id: 'peer-2' })],
        })
      );

      expect(mockClient.sendOffer).not.toHaveBeenCalled();
    });
  });

  describe('Signaling', () => {
    it('handles incoming offer and sends answer', async () => {
      const mockClient = createMockClient();

      renderHook(() =>
        useRoomPeers({
          client: mockClient as unknown as SignalingClient,
          roomId: 'room-123',
          localPeerId: 'peer-1',
        })
      );

      await act(async () => {
        mockClient._trigger('onSignalOffer', 'peer-2', { type: 'offer', sdp: 'remote-offer' });
        await new Promise((r) => setTimeout(r, 10));
      });

      expect(mockClient.sendAnswer).toHaveBeenCalledWith(
        expect.objectContaining({ targetPeerId: 'peer-2' })
      );
    });
  });

  describe('getPeer', () => {
    it('returns peer with WebRTC state', () => {
      const mockClient = createMockClient();

      const { result } = renderHook(() =>
        useRoomPeers({
          client: mockClient as unknown as SignalingClient,
          roomId: 'room-123',
          localPeerId: 'peer-1',
          initialPeers: [createMockPeerSummary({ id: 'peer-2' })],
        })
      );

      const peer = result.current.getPeer('peer-2');
      expect(peer).toBeDefined();
      expect(peer?.webrtcState).toBeDefined();
    });

    it('returns undefined for unknown peer', () => {
      const { result } = renderHook(() =>
        useRoomPeers({ client: null, roomId: null, localPeerId: null })
      );

      expect(result.current.getPeer('unknown')).toBeUndefined();
    });
  });

  describe('Connection State', () => {
    it('tracks connection state changes', async () => {
      const mockClient = createMockClient();
      const onStateChange = vi.fn();

      renderHook(() =>
        useRoomPeers({
          client: mockClient as unknown as SignalingClient,
          roomId: 'room-123',
          localPeerId: 'peer-1',
          initialPeers: [createMockPeerSummary({ id: 'peer-2' })],
          onPeerConnectionStateChange: onStateChange,
        })
      );

      await act(async () => {
        await new Promise((r) => setTimeout(r, 10));
      });

      act(() => {
        mockPcInstances[0]?.simulateConnectionState('connected');
      });

      expect(onStateChange).toHaveBeenCalledWith('peer-2', 'connected');
    });

    it('computes connectedCount', async () => {
      const mockClient = createMockClient();

      const { result } = renderHook(() =>
        useRoomPeers({
          client: mockClient as unknown as SignalingClient,
          roomId: 'room-123',
          localPeerId: 'peer-1',
          initialPeers: [createMockPeerSummary({ id: 'peer-2' })],
        })
      );

      expect(result.current.connectedCount).toBe(0);

      await act(async () => {
        await new Promise((r) => setTimeout(r, 10));
        mockPcInstances[0]?.simulateConnectionState('connected');
      });

      expect(result.current.connectedCount).toBe(1);
    });
  });

  describe('Audio Streams', () => {
    it('calls onPeerAudioStream when track received', async () => {
      const mockClient = createMockClient();
      const onAudioStream = vi.fn();
      const mockStream = { id: 'stream' } as unknown as MediaStream;

      renderHook(() =>
        useRoomPeers({
          client: mockClient as unknown as SignalingClient,
          roomId: 'room-123',
          localPeerId: 'peer-1',
          initialPeers: [createMockPeerSummary({ id: 'peer-2' })],
          onPeerAudioStream: onAudioStream,
        })
      );

      await act(async () => {
        await new Promise((r) => setTimeout(r, 10));
        mockPcInstances[0]?.simulateTrack(mockStream);
      });

      expect(onAudioStream).toHaveBeenCalledWith('peer-2', mockStream);
    });

    it('returns audio streams via getAudioStreams', async () => {
      const mockClient = createMockClient();
      const mockStream = { id: 'stream' } as unknown as MediaStream;

      const { result } = renderHook(() =>
        useRoomPeers({
          client: mockClient as unknown as SignalingClient,
          roomId: 'room-123',
          localPeerId: 'peer-1',
          initialPeers: [createMockPeerSummary({ id: 'peer-2' })],
        })
      );

      await act(async () => {
        await new Promise((r) => setTimeout(r, 10));
        mockPcInstances[0]?.simulateTrack(mockStream);
      });

      const streams = result.current.getAudioStreams();
      expect(streams.get('peer-2')).toBe(mockStream);
    });
  });

  describe('Cleanup', () => {
    it('closes connections on unmount', async () => {
      const mockClient = createMockClient();

      const { unmount } = renderHook(() =>
        useRoomPeers({
          client: mockClient as unknown as SignalingClient,
          roomId: 'room-123',
          localPeerId: 'peer-1',
          initialPeers: [createMockPeerSummary({ id: 'peer-2' })],
        })
      );

      await act(async () => {
        await new Promise((r) => setTimeout(r, 10));
      });

      const pc = mockPcInstances[0];
      unmount();

      expect(pc.connectionState).toBe('closed');
    });

    it('closes connection when peer leaves', async () => {
      const mockClient = createMockClient();

      renderHook(() =>
        useRoomPeers({
          client: mockClient as unknown as SignalingClient,
          roomId: 'room-123',
          localPeerId: 'peer-1',
          initialPeers: [createMockPeerSummary({ id: 'peer-2' })],
        })
      );

      await act(async () => {
        await new Promise((r) => setTimeout(r, 10));
      });

      const pc = mockPcInstances[0];

      act(() => {
        mockClient._trigger('onPeerLeft', 'peer-2');
      });

      expect(pc.connectionState).toBe('closed');
    });
  });

  describe('reconnectPeer', () => {
    it('closes and re-initiates connection', async () => {
      const mockClient = createMockClient();

      const { result } = renderHook(() =>
        useRoomPeers({
          client: mockClient as unknown as SignalingClient,
          roomId: 'room-123',
          localPeerId: 'peer-1',
          initialPeers: [createMockPeerSummary({ id: 'peer-2' })],
        })
      );

      await act(async () => {
        await new Promise((r) => setTimeout(r, 10));
      });

      const originalPc = mockPcInstances[0];
      mockClient.sendOffer.mockClear();

      await act(async () => {
        result.current.reconnectPeer('peer-2');
        await new Promise((r) => setTimeout(r, 10));
      });

      expect(originalPc.connectionState).toBe('closed');
      expect(mockClient.sendOffer).toHaveBeenCalled();
    });
  });
});
