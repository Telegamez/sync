/**
 * usePresence Hook Tests
 *
 * Tests for real-time presence state management.
 *
 * Part of the Long-Horizon Engineering Protocol - FEAT-110
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePresence } from '@/hooks/usePresence';
import type { PeerSummary } from '@/types/peer';
import type { PresenceSyncPayload, AudioLevelsPayload } from '@/types/signaling';

// Mock signaling client
const mockUpdatePresence = vi.fn();
const mockOn = vi.fn();
const mockOff = vi.fn();

const createMockClient = () => ({
  updatePresence: mockUpdatePresence,
  on: mockOn,
  off: mockOff,
  connect: vi.fn(),
  disconnect: vi.fn(),
  getConnectionState: vi.fn(() => 'connected'),
});

// Sample test data
const createMockPeerSummary = (overrides?: Partial<PeerSummary>): PeerSummary => ({
  id: 'peer-2',
  displayName: 'Other User',
  role: 'participant',
  isMuted: false,
  isSpeaking: false,
  connectionState: 'connected',
  ...overrides,
});

describe('usePresence', () => {
  let mockClient: ReturnType<typeof createMockClient>;
  let eventHandlers: Record<string, Function>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockClient = createMockClient();
    eventHandlers = {};

    // Capture event handlers
    mockOn.mockImplementation((event: string, handler: Function) => {
      eventHandlers[event] = handler;
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Initial State', () => {
    it('returns initial local presence state', () => {
      const { result } = renderHook(() =>
        usePresence({
          client: null,
          roomId: null,
          localPeerId: null,
        })
      );

      expect(result.current.localPresence).toEqual({
        isMuted: true,
        isSpeaking: false,
        isAddressingAI: false,
        audioLevel: 0,
      });
    });

    it('initializes peer presence from initial peers', () => {
      const initialPeers = [
        createMockPeerSummary({ id: 'peer-2', isMuted: true, isSpeaking: false }),
        createMockPeerSummary({ id: 'peer-3', isMuted: false, isSpeaking: true }),
      ];

      const { result } = renderHook(() =>
        usePresence({
          client: mockClient as any,
          roomId: 'room-123',
          localPeerId: 'peer-1',
          initialPeers,
        })
      );

      expect(result.current.peerPresence.size).toBe(2);
      expect(result.current.peerPresence.get('peer-2')?.isMuted).toBe(true);
      expect(result.current.peerPresence.get('peer-3')?.isSpeaking).toBe(true);
    });

    it('excludes local peer from peer presence', () => {
      const initialPeers = [
        createMockPeerSummary({ id: 'peer-1' }), // Same as local
        createMockPeerSummary({ id: 'peer-2' }),
      ];

      const { result } = renderHook(() =>
        usePresence({
          client: mockClient as any,
          roomId: 'room-123',
          localPeerId: 'peer-1',
          initialPeers,
        })
      );

      expect(result.current.peerPresence.size).toBe(1);
      expect(result.current.peerPresence.has('peer-1')).toBe(false);
      expect(result.current.peerPresence.has('peer-2')).toBe(true);
    });

    it('provides action functions', () => {
      const { result } = renderHook(() =>
        usePresence({
          client: null,
          roomId: null,
          localPeerId: null,
        })
      );

      expect(typeof result.current.updatePresence).toBe('function');
      expect(typeof result.current.setMuted).toBe('function');
      expect(typeof result.current.toggleMute).toBe('function');
      expect(typeof result.current.setSpeaking).toBe('function');
      expect(typeof result.current.setAddressingAI).toBe('function');
      expect(typeof result.current.setAudioLevel).toBe('function');
      expect(typeof result.current.getPeerPresence).toBe('function');
      expect(typeof result.current.isPeerSpeaking).toBe('function');
      expect(typeof result.current.isPeerMuted).toBe('function');
    });
  });

  describe('Local Presence Updates', () => {
    it('updates muted state', () => {
      const { result } = renderHook(() =>
        usePresence({
          client: mockClient as any,
          roomId: 'room-123',
          localPeerId: 'peer-1',
        })
      );

      expect(result.current.localPresence.isMuted).toBe(true);

      act(() => {
        result.current.setMuted(false);
      });

      expect(result.current.localPresence.isMuted).toBe(false);
    });

    it('toggles mute state', () => {
      const { result } = renderHook(() =>
        usePresence({
          client: mockClient as any,
          roomId: 'room-123',
          localPeerId: 'peer-1',
        })
      );

      expect(result.current.localPresence.isMuted).toBe(true);

      act(() => {
        result.current.toggleMute();
      });

      expect(result.current.localPresence.isMuted).toBe(false);

      act(() => {
        result.current.toggleMute();
      });

      expect(result.current.localPresence.isMuted).toBe(true);
    });

    it('updates speaking state', () => {
      const { result } = renderHook(() =>
        usePresence({
          client: mockClient as any,
          roomId: 'room-123',
          localPeerId: 'peer-1',
        })
      );

      act(() => {
        result.current.setSpeaking(true);
      });

      expect(result.current.localPresence.isSpeaking).toBe(true);
    });

    it('updates addressing AI state', () => {
      const { result } = renderHook(() =>
        usePresence({
          client: mockClient as any,
          roomId: 'room-123',
          localPeerId: 'peer-1',
        })
      );

      act(() => {
        result.current.setAddressingAI(true);
      });

      expect(result.current.localPresence.isAddressingAI).toBe(true);
    });

    it('updates audio level with clamping', () => {
      const { result } = renderHook(() =>
        usePresence({
          client: mockClient as any,
          roomId: 'room-123',
          localPeerId: 'peer-1',
        })
      );

      act(() => {
        result.current.setAudioLevel(0.5);
      });

      expect(result.current.localPresence.audioLevel).toBe(0.5);

      // Test clamping above 1
      act(() => {
        result.current.setAudioLevel(1.5);
      });

      expect(result.current.localPresence.audioLevel).toBe(1);

      // Test clamping below 0
      act(() => {
        result.current.setAudioLevel(-0.5);
      });

      expect(result.current.localPresence.audioLevel).toBe(0);
    });

    it('sends presence update to server (debounced)', async () => {
      const { result } = renderHook(() =>
        usePresence({
          client: mockClient as any,
          roomId: 'room-123',
          localPeerId: 'peer-1',
          debounceInterval: 100,
        })
      );

      act(() => {
        result.current.setMuted(false);
      });

      // Not called immediately due to debounce
      expect(mockUpdatePresence).not.toHaveBeenCalled();

      // Advance timers
      await act(async () => {
        vi.advanceTimersByTime(100);
      });

      expect(mockUpdatePresence).toHaveBeenCalledWith(
        expect.objectContaining({ isMuted: false })
      );
    });

    it('does not send update if client is null', async () => {
      const { result } = renderHook(() =>
        usePresence({
          client: null,
          roomId: 'room-123',
          localPeerId: 'peer-1',
          debounceInterval: 100,
        })
      );

      act(() => {
        result.current.setMuted(false);
      });

      await act(async () => {
        vi.advanceTimersByTime(100);
      });

      expect(mockUpdatePresence).not.toHaveBeenCalled();
    });

    it('does not send update if roomId is null', async () => {
      const { result } = renderHook(() =>
        usePresence({
          client: mockClient as any,
          roomId: null,
          localPeerId: 'peer-1',
          debounceInterval: 100,
        })
      );

      act(() => {
        result.current.setMuted(false);
      });

      await act(async () => {
        vi.advanceTimersByTime(100);
      });

      expect(mockUpdatePresence).not.toHaveBeenCalled();
    });
  });

  describe('Peer Presence Events', () => {
    it('handles presence:update event', () => {
      const { result } = renderHook(() =>
        usePresence({
          client: mockClient as any,
          roomId: 'room-123',
          localPeerId: 'peer-1',
          initialPeers: [createMockPeerSummary({ id: 'peer-2', isMuted: false })],
        })
      );

      expect(result.current.peerPresence.get('peer-2')?.isMuted).toBe(false);

      // Trigger presence update
      act(() => {
        eventHandlers.onPresenceUpdate?.(
          createMockPeerSummary({ id: 'peer-2', isMuted: true, isSpeaking: true })
        );
      });

      expect(result.current.peerPresence.get('peer-2')?.isMuted).toBe(true);
      expect(result.current.peerPresence.get('peer-2')?.isSpeaking).toBe(true);
    });

    it('ignores presence update for local peer', () => {
      const { result } = renderHook(() =>
        usePresence({
          client: mockClient as any,
          roomId: 'room-123',
          localPeerId: 'peer-1',
        })
      );

      // Should not add local peer to peerPresence
      act(() => {
        eventHandlers.onPresenceUpdate?.(
          createMockPeerSummary({ id: 'peer-1', isMuted: true })
        );
      });

      expect(result.current.peerPresence.has('peer-1')).toBe(false);
    });

    it('handles presence:sync event', () => {
      const { result } = renderHook(() =>
        usePresence({
          client: mockClient as any,
          roomId: 'room-123',
          localPeerId: 'peer-1',
        })
      );

      const syncPayload: PresenceSyncPayload = {
        roomId: 'room-123',
        peers: [
          createMockPeerSummary({ id: 'peer-2', isMuted: true }),
          createMockPeerSummary({ id: 'peer-3', isSpeaking: true }),
        ],
      };

      act(() => {
        eventHandlers.onPresenceSync?.(syncPayload);
      });

      expect(result.current.peerPresence.size).toBe(2);
      expect(result.current.peerPresence.get('peer-2')?.isMuted).toBe(true);
      expect(result.current.peerPresence.get('peer-3')?.isSpeaking).toBe(true);
    });

    it('ignores presence sync for different room', () => {
      const { result } = renderHook(() =>
        usePresence({
          client: mockClient as any,
          roomId: 'room-123',
          localPeerId: 'peer-1',
        })
      );

      const syncPayload: PresenceSyncPayload = {
        roomId: 'different-room',
        peers: [createMockPeerSummary({ id: 'peer-2' })],
      };

      act(() => {
        eventHandlers.onPresenceSync?.(syncPayload);
      });

      expect(result.current.peerPresence.size).toBe(0);
    });

    it('handles audio:levels event', () => {
      const { result } = renderHook(() =>
        usePresence({
          client: mockClient as any,
          roomId: 'room-123',
          localPeerId: 'peer-1',
          initialPeers: [createMockPeerSummary({ id: 'peer-2' })],
          audioLevelThreshold: 0.01,
        })
      );

      const levelsPayload: AudioLevelsPayload = {
        roomId: 'room-123',
        levels: [
          { peerId: 'peer-2', audioLevel: 0.75, isSpeaking: true, timestamp: Date.now() },
        ],
      };

      act(() => {
        eventHandlers.onAudioLevels?.(levelsPayload);
      });

      expect(result.current.peerPresence.get('peer-2')?.audioLevel).toBe(0.75);
      expect(result.current.peerPresence.get('peer-2')?.isSpeaking).toBe(true);
    });

    it('ignores audio levels for local peer', () => {
      const { result } = renderHook(() =>
        usePresence({
          client: mockClient as any,
          roomId: 'room-123',
          localPeerId: 'peer-1',
          initialPeers: [createMockPeerSummary({ id: 'peer-1' })],
        })
      );

      const levelsPayload: AudioLevelsPayload = {
        roomId: 'room-123',
        levels: [
          { peerId: 'peer-1', audioLevel: 0.75, isSpeaking: true, timestamp: Date.now() },
        ],
      };

      act(() => {
        eventHandlers.onAudioLevels?.(levelsPayload);
      });

      // Local peer should not be in peerPresence
      expect(result.current.peerPresence.has('peer-1')).toBe(false);
    });

    it('handles peer:joined event', () => {
      const { result } = renderHook(() =>
        usePresence({
          client: mockClient as any,
          roomId: 'room-123',
          localPeerId: 'peer-1',
        })
      );

      expect(result.current.peerPresence.size).toBe(0);

      act(() => {
        eventHandlers.onPeerJoined?.(createMockPeerSummary({ id: 'peer-2', isMuted: true }));
      });

      expect(result.current.peerPresence.size).toBe(1);
      expect(result.current.peerPresence.get('peer-2')?.isMuted).toBe(true);
    });

    it('handles peer:left event', () => {
      const { result } = renderHook(() =>
        usePresence({
          client: mockClient as any,
          roomId: 'room-123',
          localPeerId: 'peer-1',
          initialPeers: [createMockPeerSummary({ id: 'peer-2' })],
        })
      );

      expect(result.current.peerPresence.size).toBe(1);

      act(() => {
        eventHandlers.onPeerLeft?.('peer-2');
      });

      expect(result.current.peerPresence.size).toBe(0);
    });
  });

  describe('Derived State', () => {
    it('computes speakingPeers correctly', () => {
      const initialPeers = [
        createMockPeerSummary({ id: 'peer-2', isSpeaking: true }),
        createMockPeerSummary({ id: 'peer-3', isSpeaking: false }),
        createMockPeerSummary({ id: 'peer-4', isSpeaking: true }),
      ];

      const { result } = renderHook(() =>
        usePresence({
          client: mockClient as any,
          roomId: 'room-123',
          localPeerId: 'peer-1',
          initialPeers,
        })
      );

      expect(result.current.speakingPeers).toHaveLength(2);
      expect(result.current.speakingPeers).toContain('peer-2');
      expect(result.current.speakingPeers).toContain('peer-4');
      expect(result.current.speakingPeers).not.toContain('peer-3');
    });

    it('computes mutedPeers correctly', () => {
      const initialPeers = [
        createMockPeerSummary({ id: 'peer-2', isMuted: true }),
        createMockPeerSummary({ id: 'peer-3', isMuted: false }),
        createMockPeerSummary({ id: 'peer-4', isMuted: true }),
      ];

      const { result } = renderHook(() =>
        usePresence({
          client: mockClient as any,
          roomId: 'room-123',
          localPeerId: 'peer-1',
          initialPeers,
        })
      );

      expect(result.current.mutedPeers).toHaveLength(2);
      expect(result.current.mutedPeers).toContain('peer-2');
      expect(result.current.mutedPeers).toContain('peer-4');
    });

    it('computes activeSpeaker as peer with highest audio level', () => {
      const { result } = renderHook(() =>
        usePresence({
          client: mockClient as any,
          roomId: 'room-123',
          localPeerId: 'peer-1',
          initialPeers: [
            createMockPeerSummary({ id: 'peer-2' }),
            createMockPeerSummary({ id: 'peer-3' }),
          ],
          audioLevelThreshold: 0.01,
        })
      );

      // Update audio levels
      act(() => {
        eventHandlers.onAudioLevels?.({
          roomId: 'room-123',
          levels: [
            { peerId: 'peer-2', audioLevel: 0.5, isSpeaking: true, timestamp: Date.now() },
            { peerId: 'peer-3', audioLevel: 0.8, isSpeaking: true, timestamp: Date.now() },
          ],
        });
      });

      expect(result.current.activeSpeaker).toBe('peer-3');
    });

    it('includes local peer in activeSpeaker calculation', () => {
      const { result } = renderHook(() =>
        usePresence({
          client: mockClient as any,
          roomId: 'room-123',
          localPeerId: 'peer-1',
          initialPeers: [createMockPeerSummary({ id: 'peer-2' })],
          audioLevelThreshold: 0.01,
        })
      );

      // Set local speaking with high level
      act(() => {
        result.current.updatePresence({ isSpeaking: true, audioLevel: 0.9 });
      });

      // Update peer with lower level
      act(() => {
        eventHandlers.onAudioLevels?.({
          roomId: 'room-123',
          levels: [
            { peerId: 'peer-2', audioLevel: 0.3, isSpeaking: true, timestamp: Date.now() },
          ],
        });
      });

      expect(result.current.activeSpeaker).toBe('peer-1');
    });

    it('returns null activeSpeaker when no one is speaking', () => {
      const { result } = renderHook(() =>
        usePresence({
          client: mockClient as any,
          roomId: 'room-123',
          localPeerId: 'peer-1',
          initialPeers: [createMockPeerSummary({ id: 'peer-2', isSpeaking: false })],
        })
      );

      expect(result.current.activeSpeaker).toBeNull();
    });

    it('computes anyAddressingAI correctly', () => {
      const { result } = renderHook(() =>
        usePresence({
          client: mockClient as any,
          roomId: 'room-123',
          localPeerId: 'peer-1',
        })
      );

      expect(result.current.anyAddressingAI).toBe(false);

      // Set local addressing AI
      act(() => {
        result.current.setAddressingAI(true);
      });

      expect(result.current.anyAddressingAI).toBe(true);
    });
  });

  describe('Helper Functions', () => {
    it('getPeerPresence returns correct presence', () => {
      const initialPeers = [
        createMockPeerSummary({ id: 'peer-2', isMuted: true, isSpeaking: true }),
      ];

      const { result } = renderHook(() =>
        usePresence({
          client: mockClient as any,
          roomId: 'room-123',
          localPeerId: 'peer-1',
          initialPeers,
        })
      );

      const presence = result.current.getPeerPresence('peer-2');
      expect(presence?.isMuted).toBe(true);
      expect(presence?.isSpeaking).toBe(true);
    });

    it('getPeerPresence returns undefined for unknown peer', () => {
      const { result } = renderHook(() =>
        usePresence({
          client: mockClient as any,
          roomId: 'room-123',
          localPeerId: 'peer-1',
        })
      );

      expect(result.current.getPeerPresence('unknown')).toBeUndefined();
    });

    it('isPeerSpeaking returns correct value', () => {
      const initialPeers = [
        createMockPeerSummary({ id: 'peer-2', isSpeaking: true }),
        createMockPeerSummary({ id: 'peer-3', isSpeaking: false }),
      ];

      const { result } = renderHook(() =>
        usePresence({
          client: mockClient as any,
          roomId: 'room-123',
          localPeerId: 'peer-1',
          initialPeers,
        })
      );

      expect(result.current.isPeerSpeaking('peer-2')).toBe(true);
      expect(result.current.isPeerSpeaking('peer-3')).toBe(false);
      expect(result.current.isPeerSpeaking('unknown')).toBe(false);
    });

    it('isPeerMuted returns correct value', () => {
      const initialPeers = [
        createMockPeerSummary({ id: 'peer-2', isMuted: true }),
        createMockPeerSummary({ id: 'peer-3', isMuted: false }),
      ];

      const { result } = renderHook(() =>
        usePresence({
          client: mockClient as any,
          roomId: 'room-123',
          localPeerId: 'peer-1',
          initialPeers,
        })
      );

      expect(result.current.isPeerMuted('peer-2')).toBe(true);
      expect(result.current.isPeerMuted('peer-3')).toBe(false);
      expect(result.current.isPeerMuted('unknown')).toBe(true); // Default
    });
  });

  describe('Callbacks', () => {
    it('calls onLocalPresenceChange when local presence changes', () => {
      const onLocalPresenceChange = vi.fn();

      const { result } = renderHook(() =>
        usePresence({
          client: mockClient as any,
          roomId: 'room-123',
          localPeerId: 'peer-1',
          onLocalPresenceChange,
        })
      );

      // Called with initial state
      expect(onLocalPresenceChange).toHaveBeenCalledWith(
        expect.objectContaining({ isMuted: true })
      );

      act(() => {
        result.current.setMuted(false);
      });

      expect(onLocalPresenceChange).toHaveBeenCalledWith(
        expect.objectContaining({ isMuted: false })
      );
    });

    it('calls onPeerPresenceChange when peer presence changes', () => {
      const onPeerPresenceChange = vi.fn();

      renderHook(() =>
        usePresence({
          client: mockClient as any,
          roomId: 'room-123',
          localPeerId: 'peer-1',
          initialPeers: [createMockPeerSummary({ id: 'peer-2' })],
          onPeerPresenceChange,
        })
      );

      act(() => {
        eventHandlers.onPresenceUpdate?.(
          createMockPeerSummary({ id: 'peer-2', isMuted: true })
        );
      });

      expect(onPeerPresenceChange).toHaveBeenCalledWith(
        'peer-2',
        expect.objectContaining({ isMuted: true })
      );
    });

    it('calls onActiveSpeakerChange when active speaker changes', () => {
      const onActiveSpeakerChange = vi.fn();

      const { result } = renderHook(() =>
        usePresence({
          client: mockClient as any,
          roomId: 'room-123',
          localPeerId: 'peer-1',
          onActiveSpeakerChange,
        })
      );

      // Set local speaking
      act(() => {
        result.current.updatePresence({ isSpeaking: true, audioLevel: 0.5 });
      });

      expect(onActiveSpeakerChange).toHaveBeenCalledWith('peer-1');
    });
  });

  describe('Cleanup', () => {
    it('removes event handlers on unmount', () => {
      const { unmount } = renderHook(() =>
        usePresence({
          client: mockClient as any,
          roomId: 'room-123',
          localPeerId: 'peer-1',
        })
      );

      unmount();

      expect(mockOff).toHaveBeenCalledWith('onPresenceUpdate', expect.any(Function));
      expect(mockOff).toHaveBeenCalledWith('onPresenceSync', expect.any(Function));
      expect(mockOff).toHaveBeenCalledWith('onAudioLevels', expect.any(Function));
      expect(mockOff).toHaveBeenCalledWith('onPeerJoined', expect.any(Function));
      expect(mockOff).toHaveBeenCalledWith('onPeerLeft', expect.any(Function));
    });

    it('clears debounce timer on unmount', async () => {
      const { result, unmount } = renderHook(() =>
        usePresence({
          client: mockClient as any,
          roomId: 'room-123',
          localPeerId: 'peer-1',
          debounceInterval: 100,
        })
      );

      act(() => {
        result.current.setMuted(false);
      });

      unmount();

      // Advance time - should not call updatePresence since timer was cleared
      await act(async () => {
        vi.advanceTimersByTime(200);
      });

      // The update was cancelled by unmount
      expect(mockUpdatePresence).not.toHaveBeenCalled();
    });
  });

  describe('Debouncing', () => {
    it('debounces rapid updates', async () => {
      const { result } = renderHook(() =>
        usePresence({
          client: mockClient as any,
          roomId: 'room-123',
          localPeerId: 'peer-1',
          debounceInterval: 100,
        })
      );

      // Rapid updates
      act(() => {
        result.current.setAudioLevel(0.1);
        result.current.setAudioLevel(0.2);
        result.current.setAudioLevel(0.3);
        result.current.setAudioLevel(0.4);
      });

      // Advance time
      await act(async () => {
        vi.advanceTimersByTime(100);
      });

      // Should only send once with final value
      expect(mockUpdatePresence).toHaveBeenCalledTimes(1);
      expect(mockUpdatePresence).toHaveBeenCalledWith(
        expect.objectContaining({ audioLevel: 0.4 })
      );
    });

    it('uses audio level threshold to filter insignificant changes', async () => {
      const { result } = renderHook(() =>
        usePresence({
          client: mockClient as any,
          roomId: 'room-123',
          localPeerId: 'peer-1',
          debounceInterval: 100,
          audioLevelThreshold: 0.1,
        })
      );

      // Initial update
      act(() => {
        result.current.setAudioLevel(0.5);
      });

      await act(async () => {
        vi.advanceTimersByTime(100);
      });

      mockUpdatePresence.mockClear();

      // Small change below threshold
      act(() => {
        result.current.setAudioLevel(0.52);
      });

      await act(async () => {
        vi.advanceTimersByTime(100);
      });

      // Should not send update for small change
      expect(mockUpdatePresence).not.toHaveBeenCalled();

      // Change above threshold
      act(() => {
        result.current.setAudioLevel(0.7);
      });

      await act(async () => {
        vi.advanceTimersByTime(100);
      });

      // Should send update for significant change
      expect(mockUpdatePresence).toHaveBeenCalledWith(
        expect.objectContaining({ audioLevel: 0.7 })
      );
    });
  });
});
