/**
 * WebRTC Mesh Topology Tests
 *
 * Tests for multi-peer WebRTC mesh connection management.
 * Validates full mesh topology where each peer connects to every other peer.
 *
 * Part of the Long-Horizon Engineering Protocol - FEAT-120
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { useRoomPeers } from '@/hooks/useRoomPeers';
import type { PeerSummary } from '@/types/peer';
import type { SignalingClient } from '@/lib/signaling/client';

/**
 * Mock RTCPeerConnection with full mesh support
 */
class MockRTCPeerConnection {
  connectionState: RTCPeerConnectionState = 'new';
  remoteDescription: RTCSessionDescription | null = null;
  localDescription: RTCSessionDescription | null = null;
  private senders: { track: { kind: string } | null }[] = [];
  private iceCandidates: RTCIceCandidateInit[] = [];

  onconnectionstatechange: (() => void) | null = null;
  onicecandidate: ((event: { candidate: RTCIceCandidate | null }) => void) | null = null;
  ontrack: ((event: { streams: MediaStream[] }) => void) | null = null;

  async createOffer() {
    return { type: 'offer' as const, sdp: 'mock-offer-sdp' };
  }

  async createAnswer() {
    return { type: 'answer' as const, sdp: 'mock-answer-sdp' };
  }

  async setLocalDescription(desc: RTCSessionDescriptionInit) {
    this.localDescription = desc as RTCSessionDescription;
  }

  async setRemoteDescription(desc: RTCSessionDescription) {
    this.remoteDescription = desc;
  }

  async addIceCandidate(candidate: RTCIceCandidate) {
    this.iceCandidates.push(candidate as RTCIceCandidateInit);
  }

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

  simulateIceCandidate(candidate: RTCIceCandidateInit) {
    this.onicecandidate?.({ candidate: { ...candidate, toJSON: () => candidate } as RTCIceCandidate });
  }

  getIceCandidates() {
    return this.iceCandidates;
  }
}

// Store instances for testing
let mockPcInstances: Map<string, MockRTCPeerConnection> = new Map();
let pcCreateOrder: string[] = [];

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
    _getHandler: (event: string) => handlers.get(event),
  };
}

// Mock peer summary factory
function createMockPeer(id: string, name?: string): PeerSummary {
  return {
    id,
    displayName: name || `User ${id}`,
    role: 'participant',
    isMuted: false,
    isSpeaking: false,
    connectionState: 'connected',
  };
}

beforeEach(() => {
  mockPcInstances.clear();
  pcCreateOrder = [];

  // Track which peer each connection is for
  vi.stubGlobal('RTCPeerConnection', function () {
    const pc = new MockRTCPeerConnection();
    const id = `pc-${mockPcInstances.size}`;
    mockPcInstances.set(id, pc);
    pcCreateOrder.push(id);
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

describe('WebRTC Mesh Topology', () => {
  describe('Full Mesh Connection Pattern', () => {
    it('creates RTCPeerConnection for each peer', async () => {
      const mockClient = createMockClient();
      const initialPeers = [
        createMockPeer('peer-2'),
        createMockPeer('peer-3'),
        createMockPeer('peer-4'),
      ];

      renderHook(() =>
        useRoomPeers({
          client: mockClient as unknown as SignalingClient,
          roomId: 'room-123',
          localPeerId: 'peer-1',
          initialPeers,
        })
      );

      await act(async () => {
        await new Promise((r) => setTimeout(r, 50));
      });

      // peer-1 should initiate connections to all peers with higher IDs
      // peer-2, peer-3, peer-4 all > peer-1
      expect(mockPcInstances.size).toBe(3);
    });

    it('uses higher ID initiates connection pattern', async () => {
      const mockClient = createMockClient();

      // Local peer is peer-3, so should only initiate to peer-4 (higher)
      // peer-2 (lower) should not be initiated by us
      const initialPeers = [
        createMockPeer('peer-2'),
        createMockPeer('peer-4'),
      ];

      renderHook(() =>
        useRoomPeers({
          client: mockClient as unknown as SignalingClient,
          roomId: 'room-123',
          localPeerId: 'peer-3',
          initialPeers,
        })
      );

      await act(async () => {
        await new Promise((r) => setTimeout(r, 50));
      });

      // Only peer-4 connection should be initiated (higher than peer-3)
      expect(mockClient.sendOffer).toHaveBeenCalledTimes(1);
      expect(mockClient.sendOffer).toHaveBeenCalledWith(
        expect.objectContaining({ targetPeerId: 'peer-4' })
      );
    });

    it('initiates connection when new peer with higher ID joins', async () => {
      const mockClient = createMockClient();

      renderHook(() =>
        useRoomPeers({
          client: mockClient as unknown as SignalingClient,
          roomId: 'room-123',
          localPeerId: 'peer-1',
        })
      );

      // New peer joins with higher ID
      await act(async () => {
        mockClient._trigger('onPeerJoined', createMockPeer('peer-5'));
        await new Promise((r) => setTimeout(r, 50));
      });

      expect(mockClient.sendOffer).toHaveBeenCalledWith(
        expect.objectContaining({ targetPeerId: 'peer-5' })
      );
    });

    it('does not initiate when new peer with lower ID joins', async () => {
      const mockClient = createMockClient();

      renderHook(() =>
        useRoomPeers({
          client: mockClient as unknown as SignalingClient,
          roomId: 'room-123',
          localPeerId: 'peer-5',
        })
      );

      // New peer joins with lower ID - they should initiate
      await act(async () => {
        mockClient._trigger('onPeerJoined', createMockPeer('peer-1'));
        await new Promise((r) => setTimeout(r, 50));
      });

      expect(mockClient.sendOffer).not.toHaveBeenCalled();
    });
  });

  describe('Offer/Answer Exchange', () => {
    it('creates and sends offer with correct SDP', async () => {
      const mockClient = createMockClient();

      renderHook(() =>
        useRoomPeers({
          client: mockClient as unknown as SignalingClient,
          roomId: 'room-123',
          localPeerId: 'peer-1',
          initialPeers: [createMockPeer('peer-2')],
        })
      );

      await act(async () => {
        await new Promise((r) => setTimeout(r, 50));
      });

      expect(mockClient.sendOffer).toHaveBeenCalledWith({
        targetPeerId: 'peer-2',
        sdp: expect.objectContaining({
          type: 'offer',
          sdp: 'mock-offer-sdp',
        }),
      });
    });

    it('handles incoming offer and sends answer', async () => {
      const mockClient = createMockClient();

      renderHook(() =>
        useRoomPeers({
          client: mockClient as unknown as SignalingClient,
          roomId: 'room-123',
          localPeerId: 'peer-5', // Higher ID, so we receive offers
        })
      );

      await act(async () => {
        mockClient._trigger('onSignalOffer', 'peer-1', {
          type: 'offer',
          sdp: 'remote-offer-sdp',
        });
        await new Promise((r) => setTimeout(r, 50));
      });

      expect(mockClient.sendAnswer).toHaveBeenCalledWith({
        targetPeerId: 'peer-1',
        sdp: expect.objectContaining({
          type: 'answer',
          sdp: 'mock-answer-sdp',
        }),
      });
    });

    it('sets remote description when receiving answer', async () => {
      const mockClient = createMockClient();

      renderHook(() =>
        useRoomPeers({
          client: mockClient as unknown as SignalingClient,
          roomId: 'room-123',
          localPeerId: 'peer-1',
          initialPeers: [createMockPeer('peer-2')],
        })
      );

      await act(async () => {
        await new Promise((r) => setTimeout(r, 50));
      });

      const pc = Array.from(mockPcInstances.values())[0];

      await act(async () => {
        mockClient._trigger('onSignalAnswer', 'peer-2', {
          type: 'answer',
          sdp: 'remote-answer-sdp',
        });
        await new Promise((r) => setTimeout(r, 50));
      });

      expect(pc.remoteDescription).toEqual({
        type: 'answer',
        sdp: 'remote-answer-sdp',
      });
    });

    it('replaces existing connection on new offer', async () => {
      const mockClient = createMockClient();

      renderHook(() =>
        useRoomPeers({
          client: mockClient as unknown as SignalingClient,
          roomId: 'room-123',
          localPeerId: 'peer-5',
        })
      );

      // First offer creates connection
      await act(async () => {
        mockClient._trigger('onSignalOffer', 'peer-1', {
          type: 'offer',
          sdp: 'first-offer',
        });
        await new Promise((r) => setTimeout(r, 50));
      });

      const firstPcCount = mockPcInstances.size;

      // Second offer should replace
      await act(async () => {
        mockClient._trigger('onSignalOffer', 'peer-1', {
          type: 'offer',
          sdp: 'second-offer',
        });
        await new Promise((r) => setTimeout(r, 50));
      });

      // First should be closed, new one created
      expect(mockPcInstances.size).toBe(firstPcCount + 1);
      const pcs = Array.from(mockPcInstances.values());
      expect(pcs[0].connectionState).toBe('closed');
    });
  });

  describe('ICE Candidate Exchange', () => {
    it('sends ICE candidates to signaling server', async () => {
      const mockClient = createMockClient();

      renderHook(() =>
        useRoomPeers({
          client: mockClient as unknown as SignalingClient,
          roomId: 'room-123',
          localPeerId: 'peer-1',
          initialPeers: [createMockPeer('peer-2')],
        })
      );

      await act(async () => {
        await new Promise((r) => setTimeout(r, 50));
      });

      const pc = Array.from(mockPcInstances.values())[0];

      await act(async () => {
        pc.simulateIceCandidate({ candidate: 'test-candidate', sdpMid: '0' });
      });

      expect(mockClient.sendIce).toHaveBeenCalledWith({
        targetPeerId: 'peer-2',
        candidate: expect.objectContaining({ candidate: 'test-candidate' }),
      });
    });

    it('handles incoming ICE candidates after remote description set', async () => {
      const mockClient = createMockClient();

      renderHook(() =>
        useRoomPeers({
          client: mockClient as unknown as SignalingClient,
          roomId: 'room-123',
          localPeerId: 'peer-1',
          initialPeers: [createMockPeer('peer-2')],
        })
      );

      await act(async () => {
        await new Promise((r) => setTimeout(r, 50));
      });

      const pc = Array.from(mockPcInstances.values())[0];

      // Set remote description first
      await act(async () => {
        mockClient._trigger('onSignalAnswer', 'peer-2', {
          type: 'answer',
          sdp: 'remote-answer',
        });
        await new Promise((r) => setTimeout(r, 10));
      });

      // Now send ICE candidate
      await act(async () => {
        mockClient._trigger('onSignalIce', 'peer-2', {
          candidate: 'remote-candidate',
          sdpMid: '0',
        });
        await new Promise((r) => setTimeout(r, 10));
      });

      expect(pc.getIceCandidates()).toContainEqual(
        expect.objectContaining({ candidate: 'remote-candidate' })
      );
    });

    it('queues ICE candidates if remote description not set', async () => {
      const mockClient = createMockClient();

      renderHook(() =>
        useRoomPeers({
          client: mockClient as unknown as SignalingClient,
          roomId: 'room-123',
          localPeerId: 'peer-1',
          initialPeers: [createMockPeer('peer-2')],
        })
      );

      await act(async () => {
        await new Promise((r) => setTimeout(r, 50));
      });

      const pc = Array.from(mockPcInstances.values())[0];

      // Send ICE before answer (should be queued)
      await act(async () => {
        mockClient._trigger('onSignalIce', 'peer-2', {
          candidate: 'early-candidate',
          sdpMid: '0',
        });
      });

      // Candidate should not be added yet (no remote description)
      expect(pc.getIceCandidates().length).toBe(0);

      // Now set remote description - queued candidates should be applied
      await act(async () => {
        mockClient._trigger('onSignalAnswer', 'peer-2', {
          type: 'answer',
          sdp: 'answer',
        });
        await new Promise((r) => setTimeout(r, 10));
      });

      expect(pc.getIceCandidates()).toContainEqual(
        expect.objectContaining({ candidate: 'early-candidate' })
      );
    });
  });

  describe('Connection State Tracking', () => {
    it('tracks connection state per peer', async () => {
      const mockClient = createMockClient();
      const onStateChange = vi.fn();

      const { result } = renderHook(() =>
        useRoomPeers({
          client: mockClient as unknown as SignalingClient,
          roomId: 'room-123',
          localPeerId: 'peer-1',
          initialPeers: [
            createMockPeer('peer-2'),
            createMockPeer('peer-3'),
          ],
          onPeerConnectionStateChange: onStateChange,
        })
      );

      await act(async () => {
        await new Promise((r) => setTimeout(r, 50));
      });

      // Get connections (order may vary)
      const pcs = Array.from(mockPcInstances.values());

      // Simulate one connected, one connecting
      await act(async () => {
        pcs[0].simulateConnectionState('connected');
        pcs[1].simulateConnectionState('connecting');
      });

      expect(result.current.connectedCount).toBe(1);
      expect(result.current.allConnected).toBe(false);

      // Both connected
      await act(async () => {
        pcs[1].simulateConnectionState('connected');
      });

      expect(result.current.connectedCount).toBe(2);
      expect(result.current.allConnected).toBe(true);
    });

    it('removes connection from tracking on failed state', async () => {
      const mockClient = createMockClient();

      const { result } = renderHook(() =>
        useRoomPeers({
          client: mockClient as unknown as SignalingClient,
          roomId: 'room-123',
          localPeerId: 'peer-1',
          initialPeers: [createMockPeer('peer-2')],
        })
      );

      await act(async () => {
        await new Promise((r) => setTimeout(r, 50));
      });

      const pc = Array.from(mockPcInstances.values())[0];

      await act(async () => {
        pc.simulateConnectionState('connected');
      });

      expect(result.current.connectedCount).toBe(1);

      await act(async () => {
        pc.simulateConnectionState('failed');
      });

      // Failed connections should not count as connected
      expect(result.current.connectedCount).toBe(0);
    });

    it('updates peer webrtcState in peers array', async () => {
      const mockClient = createMockClient();

      const { result } = renderHook(() =>
        useRoomPeers({
          client: mockClient as unknown as SignalingClient,
          roomId: 'room-123',
          localPeerId: 'peer-1',
          initialPeers: [createMockPeer('peer-2')],
        })
      );

      await act(async () => {
        await new Promise((r) => setTimeout(r, 50));
      });

      expect(result.current.peers[0].webrtcState).toBe('new');

      const pc = Array.from(mockPcInstances.values())[0];

      await act(async () => {
        pc.simulateConnectionState('connected');
      });

      expect(result.current.peers[0].webrtcState).toBe('connected');
    });
  });

  describe('Peer Lifecycle', () => {
    it('closes connection when peer leaves', async () => {
      const mockClient = createMockClient();

      renderHook(() =>
        useRoomPeers({
          client: mockClient as unknown as SignalingClient,
          roomId: 'room-123',
          localPeerId: 'peer-1',
          initialPeers: [createMockPeer('peer-2')],
        })
      );

      await act(async () => {
        await new Promise((r) => setTimeout(r, 50));
      });

      const pc = Array.from(mockPcInstances.values())[0];
      expect(pc.connectionState).not.toBe('closed');

      await act(async () => {
        mockClient._trigger('onPeerLeft', 'peer-2');
      });

      expect(pc.connectionState).toBe('closed');
    });

    it('cleans up audio stream when peer leaves', async () => {
      const mockClient = createMockClient();
      const mockStream = { id: 'audio-stream' } as unknown as MediaStream;

      const { result } = renderHook(() =>
        useRoomPeers({
          client: mockClient as unknown as SignalingClient,
          roomId: 'room-123',
          localPeerId: 'peer-1',
          initialPeers: [createMockPeer('peer-2')],
        })
      );

      await act(async () => {
        await new Promise((r) => setTimeout(r, 50));
      });

      // Simulate receiving audio stream
      const pc = Array.from(mockPcInstances.values())[0];
      await act(async () => {
        pc.simulateTrack(mockStream);
      });

      expect(result.current.getAudioStreams().has('peer-2')).toBe(true);

      // Peer leaves
      await act(async () => {
        mockClient._trigger('onPeerLeft', 'peer-2');
      });

      expect(result.current.getAudioStreams().has('peer-2')).toBe(false);
    });

    it('closes all connections on unmount', async () => {
      const mockClient = createMockClient();

      const { unmount } = renderHook(() =>
        useRoomPeers({
          client: mockClient as unknown as SignalingClient,
          roomId: 'room-123',
          localPeerId: 'peer-1',
          initialPeers: [
            createMockPeer('peer-2'),
            createMockPeer('peer-3'),
          ],
        })
      );

      await act(async () => {
        await new Promise((r) => setTimeout(r, 50));
      });

      const pcs = Array.from(mockPcInstances.values());

      unmount();

      pcs.forEach((pc) => {
        expect(pc.connectionState).toBe('closed');
      });
    });
  });

  describe('Audio Track Management', () => {
    it('receives and tracks remote audio streams', async () => {
      const mockClient = createMockClient();
      const mockStream = { id: 'remote-audio' } as unknown as MediaStream;
      const onAudioStream = vi.fn();

      const { result } = renderHook(() =>
        useRoomPeers({
          client: mockClient as unknown as SignalingClient,
          roomId: 'room-123',
          localPeerId: 'peer-1',
          initialPeers: [createMockPeer('peer-2')],
          onPeerAudioStream: onAudioStream,
        })
      );

      await act(async () => {
        await new Promise((r) => setTimeout(r, 50));
      });

      const pc = Array.from(mockPcInstances.values())[0];

      await act(async () => {
        pc.simulateTrack(mockStream);
      });

      expect(onAudioStream).toHaveBeenCalledWith('peer-2', mockStream);
      expect(result.current.peers[0].hasAudio).toBe(true);
      expect(result.current.peers[0].audioStream).toBe(mockStream);
    });

    it('returns all audio streams via getAudioStreams', async () => {
      const mockClient = createMockClient();
      const stream1 = { id: 'stream-1' } as unknown as MediaStream;
      const stream2 = { id: 'stream-2' } as unknown as MediaStream;

      const { result } = renderHook(() =>
        useRoomPeers({
          client: mockClient as unknown as SignalingClient,
          roomId: 'room-123',
          localPeerId: 'peer-1',
          initialPeers: [createMockPeer('peer-2'), createMockPeer('peer-3')],
        })
      );

      await act(async () => {
        await new Promise((r) => setTimeout(r, 50));
      });

      const pcs = Array.from(mockPcInstances.values());

      await act(async () => {
        pcs[0].simulateTrack(stream1);
        pcs[1].simulateTrack(stream2);
      });

      const streams = result.current.getAudioStreams();
      expect(streams.size).toBe(2);
    });
  });

  describe('Reconnection', () => {
    it('reconnectPeer closes existing and creates new connection', async () => {
      const mockClient = createMockClient();

      const { result } = renderHook(() =>
        useRoomPeers({
          client: mockClient as unknown as SignalingClient,
          roomId: 'room-123',
          localPeerId: 'peer-1',
          initialPeers: [createMockPeer('peer-2')],
        })
      );

      await act(async () => {
        await new Promise((r) => setTimeout(r, 50));
      });

      const originalPc = Array.from(mockPcInstances.values())[0];
      const initialCount = mockPcInstances.size;

      mockClient.sendOffer.mockClear();

      await act(async () => {
        result.current.reconnectPeer('peer-2');
        await new Promise((r) => setTimeout(r, 50));
      });

      expect(originalPc.connectionState).toBe('closed');
      expect(mockPcInstances.size).toBe(initialCount + 1);
      expect(mockClient.sendOffer).toHaveBeenCalledWith(
        expect.objectContaining({ targetPeerId: 'peer-2' })
      );
    });

    it('clears audio stream on reconnect', async () => {
      const mockClient = createMockClient();
      const mockStream = { id: 'old-stream' } as unknown as MediaStream;

      const { result } = renderHook(() =>
        useRoomPeers({
          client: mockClient as unknown as SignalingClient,
          roomId: 'room-123',
          localPeerId: 'peer-1',
          initialPeers: [createMockPeer('peer-2')],
        })
      );

      await act(async () => {
        await new Promise((r) => setTimeout(r, 50));
      });

      // Receive stream
      const pc = Array.from(mockPcInstances.values())[0];
      await act(async () => {
        pc.simulateTrack(mockStream);
      });

      expect(result.current.peers[0].hasAudio).toBe(true);

      // Reconnect - should clear stream
      await act(async () => {
        result.current.reconnectPeer('peer-2');
        await new Promise((r) => setTimeout(r, 50));
      });

      expect(result.current.peers[0].hasAudio).toBe(false);
    });
  });

  describe('Local Stream Management', () => {
    it('setLocalStream adds tracks to all peer connections', async () => {
      const mockClient = createMockClient();
      const mockTrack = { kind: 'audio' } as MediaStreamTrack;
      const mockStream = {
        getTracks: () => [mockTrack],
      } as unknown as MediaStream;

      const { result } = renderHook(() =>
        useRoomPeers({
          client: mockClient as unknown as SignalingClient,
          roomId: 'room-123',
          localPeerId: 'peer-1',
          initialPeers: [createMockPeer('peer-2'), createMockPeer('peer-3')],
        })
      );

      await act(async () => {
        await new Promise((r) => setTimeout(r, 50));
      });

      await act(async () => {
        result.current.setLocalStream(mockStream);
      });

      const pcs = Array.from(mockPcInstances.values());
      pcs.forEach((pc) => {
        expect(pc.getSenders().length).toBeGreaterThan(0);
      });
    });

    it('setLocalStream with null removes tracks', async () => {
      const mockClient = createMockClient();
      const mockTrack = { kind: 'audio' } as MediaStreamTrack;
      const mockStream = {
        getTracks: () => [mockTrack],
      } as unknown as MediaStream;

      const { result } = renderHook(() =>
        useRoomPeers({
          client: mockClient as unknown as SignalingClient,
          roomId: 'room-123',
          localPeerId: 'peer-1',
          initialPeers: [createMockPeer('peer-2')],
        })
      );

      await act(async () => {
        await new Promise((r) => setTimeout(r, 50));
      });

      // Add stream
      await act(async () => {
        result.current.setLocalStream(mockStream);
      });

      const pc = Array.from(mockPcInstances.values())[0];
      const sendersBeforeNull = pc.getSenders().length;

      // Remove stream
      await act(async () => {
        result.current.setLocalStream(null);
      });

      // removeTrack should have been called
      expect(pc.getSenders().length).toBeLessThan(sendersBeforeNull);
    });
  });

  describe('getPeer Helper', () => {
    it('returns peer with WebRTC state', async () => {
      const mockClient = createMockClient();

      const { result } = renderHook(() =>
        useRoomPeers({
          client: mockClient as unknown as SignalingClient,
          roomId: 'room-123',
          localPeerId: 'peer-1',
          initialPeers: [createMockPeer('peer-2')],
        })
      );

      await act(async () => {
        await new Promise((r) => setTimeout(r, 50));
      });

      const peer = result.current.getPeer('peer-2');

      expect(peer).toBeDefined();
      expect(peer?.id).toBe('peer-2');
      expect(peer?.webrtcState).toBeDefined();
      expect(peer?.hasAudio).toBe(false);
    });

    it('returns undefined for unknown peer', () => {
      const { result } = renderHook(() =>
        useRoomPeers({
          client: null,
          roomId: null,
          localPeerId: null,
        })
      );

      expect(result.current.getPeer('unknown-peer')).toBeUndefined();
    });
  });

  describe('Multiple Peer Scenario', () => {
    it('handles 4-peer mesh correctly', async () => {
      const mockClient = createMockClient();
      const peers = [
        createMockPeer('peer-2'),
        createMockPeer('peer-3'),
        createMockPeer('peer-4'),
      ];

      const { result } = renderHook(() =>
        useRoomPeers({
          client: mockClient as unknown as SignalingClient,
          roomId: 'room-123',
          localPeerId: 'peer-1',
          initialPeers: peers,
        })
      );

      await act(async () => {
        await new Promise((r) => setTimeout(r, 100));
      });

      // peer-1 initiates to all 3 peers (2, 3, 4 all > 1)
      expect(mockPcInstances.size).toBe(3);
      expect(result.current.peerCount).toBe(3);

      // Simulate all connected
      const pcs = Array.from(mockPcInstances.values());
      await act(async () => {
        pcs.forEach((pc) => pc.simulateConnectionState('connected'));
      });

      expect(result.current.allConnected).toBe(true);
      expect(result.current.connectedCount).toBe(3);
    });

    it('handles peer leaving mid-session', async () => {
      const mockClient = createMockClient();

      const { result } = renderHook(() =>
        useRoomPeers({
          client: mockClient as unknown as SignalingClient,
          roomId: 'room-123',
          localPeerId: 'peer-1',
          initialPeers: [
            createMockPeer('peer-2'),
            createMockPeer('peer-3'),
          ],
        })
      );

      await act(async () => {
        await new Promise((r) => setTimeout(r, 50));
      });

      expect(result.current.peerCount).toBe(2);

      // peer-2 leaves
      await act(async () => {
        mockClient._trigger('onPeerLeft', 'peer-2');
      });

      expect(result.current.peerCount).toBe(1);
      expect(result.current.peers[0].id).toBe('peer-3');
    });
  });
});
