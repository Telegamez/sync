/**
 * Audio Track Management Tests
 *
 * Tests for multi-peer audio track management including audio element creation,
 * playback control, muting, volume, and cleanup.
 *
 * Part of the Long-Horizon Engineering Protocol - FEAT-121
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { useRoomAudio } from '@/hooks/useRoomAudio';

// Mock HTMLAudioElement
class MockHTMLAudioElement {
  id = '';
  srcObject: MediaStream | null = null;
  autoplay = false;
  volume = 1;
  muted = false;
  paused = true;

  private eventListeners = new Map<string, Function[]>();

  play = vi.fn().mockImplementation(() => {
    this.paused = false;
    this.dispatchEvent('play');
    return Promise.resolve();
  });

  pause = vi.fn().mockImplementation(() => {
    this.paused = true;
    this.dispatchEvent('pause');
  });

  addEventListener = vi.fn().mockImplementation((event: string, handler: Function) => {
    const handlers = this.eventListeners.get(event) || [];
    handlers.push(handler);
    this.eventListeners.set(event, handlers);
  });

  removeEventListener = vi.fn().mockImplementation((event: string, handler: Function) => {
    const handlers = this.eventListeners.get(event) || [];
    const index = handlers.indexOf(handler);
    if (index > -1) {
      handlers.splice(index, 1);
    }
  });

  removeAttribute = vi.fn();

  dispatchEvent(eventName: string) {
    const handlers = this.eventListeners.get(eventName) || [];
    handlers.forEach(handler => handler(new Event(eventName)));
  }
}

// Track created audio elements
let createdAudioElements: MockHTMLAudioElement[] = [];

// Mock document.createElement for audio elements
const originalCreateElement = document.createElement.bind(document);

beforeEach(() => {
  createdAudioElements = [];

  vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
    if (tagName === 'audio') {
      const audioEl = new MockHTMLAudioElement();
      createdAudioElements.push(audioEl);
      return audioEl as unknown as HTMLElement;
    }
    return originalCreateElement(tagName);
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// Mock MediaStream factory
function createMockStream(id: string = 'test-stream'): MediaStream {
  return {
    id,
    active: true,
    getTracks: () => [],
  } as unknown as MediaStream;
}

describe('useRoomAudio', () => {
  describe('Initial State', () => {
    it('returns empty peer audio map initially', () => {
      const { result } = renderHook(() => useRoomAudio());

      expect(result.current.peerAudio.size).toBe(0);
    });

    it('initializes with default master volume', () => {
      const { result } = renderHook(() => useRoomAudio());

      expect(result.current.masterVolume).toBe(1.0);
    });

    it('initializes with custom master volume', () => {
      const { result } = renderHook(() =>
        useRoomAudio({ initialMasterVolume: 0.5 })
      );

      expect(result.current.masterVolume).toBe(0.5);
    });

    it('initializes with isAllMuted false', () => {
      const { result } = renderHook(() => useRoomAudio());

      expect(result.current.isAllMuted).toBe(false);
    });

    it('provides all action functions', () => {
      const { result } = renderHook(() => useRoomAudio());

      expect(typeof result.current.addPeerStream).toBe('function');
      expect(typeof result.current.removePeerStream).toBe('function');
      expect(typeof result.current.mutePeer).toBe('function');
      expect(typeof result.current.unmutePeer).toBe('function');
      expect(typeof result.current.togglePeerMute).toBe('function');
      expect(typeof result.current.setPeerVolume).toBe('function');
      expect(typeof result.current.muteAll).toBe('function');
      expect(typeof result.current.unmuteAll).toBe('function');
      expect(typeof result.current.setMasterVolume).toBe('function');
      expect(typeof result.current.getAudioElement).toBe('function');
      expect(typeof result.current.isPeerPlaying).toBe('function');
    });
  });

  describe('Adding Peer Streams', () => {
    it('creates audio element when adding peer stream', () => {
      const { result } = renderHook(() => useRoomAudio());
      const stream = createMockStream();

      act(() => {
        result.current.addPeerStream('peer-1', stream);
      });

      expect(createdAudioElements.length).toBe(1);
      expect(createdAudioElements[0].srcObject).toBe(stream);
    });

    it('sets audio element id based on peer id', () => {
      const { result } = renderHook(() => useRoomAudio());
      const stream = createMockStream();

      act(() => {
        result.current.addPeerStream('peer-123', stream);
      });

      expect(createdAudioElements[0].id).toBe('peer-audio-peer-123');
    });

    it('updates peer audio state when adding stream', () => {
      const { result } = renderHook(() => useRoomAudio());
      const stream = createMockStream();

      act(() => {
        result.current.addPeerStream('peer-1', stream);
      });

      expect(result.current.peerAudio.has('peer-1')).toBe(true);
      const peerState = result.current.peerAudio.get('peer-1');
      expect(peerState?.peerId).toBe('peer-1');
      expect(peerState?.isMuted).toBe(false);
      expect(peerState?.volume).toBe(1.0);
    });

    it('auto-plays audio when autoPlay is true (default)', () => {
      const { result } = renderHook(() => useRoomAudio());
      const stream = createMockStream();

      act(() => {
        result.current.addPeerStream('peer-1', stream);
      });

      expect(createdAudioElements[0].autoplay).toBe(true);
      expect(createdAudioElements[0].play).toHaveBeenCalled();
    });

    it('does not auto-play when autoPlay is false', () => {
      const { result } = renderHook(() => useRoomAudio({ autoPlay: false }));
      const stream = createMockStream();

      act(() => {
        result.current.addPeerStream('peer-1', stream);
      });

      expect(createdAudioElements[0].autoplay).toBe(false);
      expect(createdAudioElements[0].play).not.toHaveBeenCalled();
    });

    it('handles multiple peers', () => {
      const { result } = renderHook(() => useRoomAudio());

      act(() => {
        result.current.addPeerStream('peer-1', createMockStream('stream-1'));
        result.current.addPeerStream('peer-2', createMockStream('stream-2'));
        result.current.addPeerStream('peer-3', createMockStream('stream-3'));
      });

      expect(result.current.peerAudio.size).toBe(3);
      expect(createdAudioElements.length).toBe(3);
    });

    it('reuses existing audio element for same peer', () => {
      const { result } = renderHook(() => useRoomAudio());
      const stream1 = createMockStream('stream-1');
      const stream2 = createMockStream('stream-2');

      act(() => {
        result.current.addPeerStream('peer-1', stream1);
      });

      const firstElement = createdAudioElements[0];

      act(() => {
        result.current.addPeerStream('peer-1', stream2);
      });

      // Should reuse the same element
      expect(createdAudioElements.length).toBe(1);
      expect(firstElement.srcObject).toBe(stream2);
    });
  });

  describe('Removing Peer Streams', () => {
    it('removes audio element when removing peer stream', () => {
      const { result } = renderHook(() => useRoomAudio());
      const stream = createMockStream();

      act(() => {
        result.current.addPeerStream('peer-1', stream);
      });

      const audioEl = createdAudioElements[0];

      act(() => {
        result.current.removePeerStream('peer-1');
      });

      expect(audioEl.pause).toHaveBeenCalled();
      expect(audioEl.srcObject).toBe(null);
    });

    it('removes peer from state when removing stream', () => {
      const { result } = renderHook(() => useRoomAudio());

      act(() => {
        result.current.addPeerStream('peer-1', createMockStream());
      });

      expect(result.current.peerAudio.has('peer-1')).toBe(true);

      act(() => {
        result.current.removePeerStream('peer-1');
      });

      expect(result.current.peerAudio.has('peer-1')).toBe(false);
    });

    it('handles removing non-existent peer gracefully', () => {
      const { result } = renderHook(() => useRoomAudio());

      act(() => {
        result.current.removePeerStream('non-existent');
      });

      expect(result.current.peerAudio.size).toBe(0);
    });
  });

  describe('Muting Peers', () => {
    it('mutes a specific peer', () => {
      const { result } = renderHook(() => useRoomAudio());

      act(() => {
        result.current.addPeerStream('peer-1', createMockStream());
      });

      expect(result.current.peerAudio.get('peer-1')?.isMuted).toBe(false);

      act(() => {
        result.current.mutePeer('peer-1');
      });

      expect(result.current.peerAudio.get('peer-1')?.isMuted).toBe(true);
      expect(createdAudioElements[0].muted).toBe(true);
    });

    it('unmutes a specific peer', () => {
      const { result } = renderHook(() => useRoomAudio());

      act(() => {
        result.current.addPeerStream('peer-1', createMockStream());
        result.current.mutePeer('peer-1');
      });

      expect(result.current.peerAudio.get('peer-1')?.isMuted).toBe(true);

      act(() => {
        result.current.unmutePeer('peer-1');
      });

      expect(result.current.peerAudio.get('peer-1')?.isMuted).toBe(false);
      expect(createdAudioElements[0].muted).toBe(false);
    });

    it('toggles peer mute state', () => {
      const { result } = renderHook(() => useRoomAudio());

      act(() => {
        result.current.addPeerStream('peer-1', createMockStream());
      });

      act(() => {
        result.current.togglePeerMute('peer-1');
      });
      expect(result.current.peerAudio.get('peer-1')?.isMuted).toBe(true);

      act(() => {
        result.current.togglePeerMute('peer-1');
      });
      expect(result.current.peerAudio.get('peer-1')?.isMuted).toBe(false);
    });
  });

  describe('Mute All', () => {
    it('mutes all peers', () => {
      const { result } = renderHook(() => useRoomAudio());

      act(() => {
        result.current.addPeerStream('peer-1', createMockStream());
        result.current.addPeerStream('peer-2', createMockStream());
        result.current.addPeerStream('peer-3', createMockStream());
      });

      act(() => {
        result.current.muteAll();
      });

      expect(result.current.isAllMuted).toBe(true);
      result.current.peerAudio.forEach((state) => {
        expect(state.isMuted).toBe(true);
      });
      createdAudioElements.forEach((el) => {
        expect(el.muted).toBe(true);
      });
    });

    it('unmutes all peers', () => {
      const { result } = renderHook(() => useRoomAudio());

      act(() => {
        result.current.addPeerStream('peer-1', createMockStream());
        result.current.addPeerStream('peer-2', createMockStream());
        result.current.muteAll();
      });

      act(() => {
        result.current.unmuteAll();
      });

      expect(result.current.isAllMuted).toBe(false);
      result.current.peerAudio.forEach((state) => {
        expect(state.isMuted).toBe(false);
      });
    });
  });

  describe('Volume Control', () => {
    it('sets volume for a specific peer', () => {
      const { result } = renderHook(() => useRoomAudio());

      act(() => {
        result.current.addPeerStream('peer-1', createMockStream());
      });

      act(() => {
        result.current.setPeerVolume('peer-1', 0.5);
      });

      expect(result.current.peerAudio.get('peer-1')?.volume).toBe(0.5);
      expect(createdAudioElements[0].volume).toBe(0.5);
    });

    it('clamps volume to valid range', () => {
      const { result } = renderHook(() => useRoomAudio());

      act(() => {
        result.current.addPeerStream('peer-1', createMockStream());
      });

      act(() => {
        result.current.setPeerVolume('peer-1', 1.5);
      });
      expect(result.current.peerAudio.get('peer-1')?.volume).toBe(1);

      act(() => {
        result.current.setPeerVolume('peer-1', -0.5);
      });
      expect(result.current.peerAudio.get('peer-1')?.volume).toBe(0);
    });

    it('sets master volume', () => {
      const { result } = renderHook(() => useRoomAudio());

      act(() => {
        result.current.addPeerStream('peer-1', createMockStream());
      });

      act(() => {
        result.current.setMasterVolume(0.5);
      });

      expect(result.current.masterVolume).toBe(0.5);
      expect(createdAudioElements[0].volume).toBe(0.5);
    });

    it('applies master volume to peer volume', () => {
      const { result } = renderHook(() => useRoomAudio());

      act(() => {
        result.current.addPeerStream('peer-1', createMockStream());
        result.current.setPeerVolume('peer-1', 0.5);
      });

      act(() => {
        result.current.setMasterVolume(0.5);
      });

      // Effective volume = peer volume * master volume = 0.5 * 0.5 = 0.25
      expect(createdAudioElements[0].volume).toBe(0.25);
    });

    it('clamps master volume to valid range', () => {
      const { result } = renderHook(() => useRoomAudio());

      act(() => {
        result.current.setMasterVolume(1.5);
      });
      expect(result.current.masterVolume).toBe(1);

      act(() => {
        result.current.setMasterVolume(-0.5);
      });
      expect(result.current.masterVolume).toBe(0);
    });
  });

  describe('Audio Element Access', () => {
    it('returns audio element for peer', () => {
      const { result } = renderHook(() => useRoomAudio());

      act(() => {
        result.current.addPeerStream('peer-1', createMockStream());
      });

      const audioEl = result.current.getAudioElement('peer-1');
      expect(audioEl).toBe(createdAudioElements[0]);
    });

    it('returns null for non-existent peer', () => {
      const { result } = renderHook(() => useRoomAudio());

      const audioEl = result.current.getAudioElement('non-existent');
      expect(audioEl).toBeNull();
    });
  });

  describe('Playing State', () => {
    it('tracks playing state when audio starts', () => {
      const { result } = renderHook(() => useRoomAudio());

      act(() => {
        result.current.addPeerStream('peer-1', createMockStream());
      });

      // Simulate play event
      act(() => {
        createdAudioElements[0].dispatchEvent('play');
      });

      expect(result.current.peerAudio.get('peer-1')?.isPlaying).toBe(true);
      expect(result.current.isPeerPlaying('peer-1')).toBe(true);
    });

    it('tracks playing state when audio ends', () => {
      const { result } = renderHook(() => useRoomAudio());

      act(() => {
        result.current.addPeerStream('peer-1', createMockStream());
      });

      // Start playing
      act(() => {
        createdAudioElements[0].dispatchEvent('play');
      });

      expect(result.current.isPeerPlaying('peer-1')).toBe(true);

      // End playing
      act(() => {
        createdAudioElements[0].dispatchEvent('ended');
      });

      expect(result.current.isPeerPlaying('peer-1')).toBe(false);
    });

    it('returns false for non-existent peer', () => {
      const { result } = renderHook(() => useRoomAudio());

      expect(result.current.isPeerPlaying('non-existent')).toBe(false);
    });
  });

  describe('Callbacks', () => {
    it('calls onPeerAudioStart when audio starts', () => {
      const onPeerAudioStart = vi.fn();
      const { result } = renderHook(() =>
        useRoomAudio({ onPeerAudioStart })
      );

      act(() => {
        result.current.addPeerStream('peer-1', createMockStream());
      });

      // Simulate play event
      act(() => {
        createdAudioElements[0].dispatchEvent('play');
      });

      expect(onPeerAudioStart).toHaveBeenCalledWith('peer-1');
    });

    it('calls onPeerAudioEnd when audio ends', () => {
      const onPeerAudioEnd = vi.fn();
      const { result } = renderHook(() =>
        useRoomAudio({ onPeerAudioEnd })
      );

      act(() => {
        result.current.addPeerStream('peer-1', createMockStream());
      });

      // Simulate ended event
      act(() => {
        createdAudioElements[0].dispatchEvent('ended');
      });

      expect(onPeerAudioEnd).toHaveBeenCalledWith('peer-1');
    });

    it('calls onAudioError on playback error', () => {
      const onAudioError = vi.fn();
      const { result } = renderHook(() =>
        useRoomAudio({ onAudioError })
      );

      act(() => {
        result.current.addPeerStream('peer-1', createMockStream());
      });

      // Simulate error event
      act(() => {
        createdAudioElements[0].dispatchEvent('error');
      });

      expect(onAudioError).toHaveBeenCalledWith('peer-1', expect.any(Error));
    });

    it('calls onAudioError when auto-play fails', async () => {
      const onAudioError = vi.fn();
      const playError = new Error('Autoplay blocked');

      const { result } = renderHook(() =>
        useRoomAudio({ onAudioError, autoPlay: true })
      );

      // Make play() reject
      const audioEl = new MockHTMLAudioElement();
      audioEl.play = vi.fn().mockRejectedValue(playError);
      createdAudioElements = [];
      vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
        if (tagName === 'audio') {
          createdAudioElements.push(audioEl);
          return audioEl as unknown as HTMLElement;
        }
        return originalCreateElement(tagName);
      });

      await act(async () => {
        result.current.addPeerStream('peer-1', createMockStream());
        // Wait for promise rejection to be handled
        await new Promise((r) => setTimeout(r, 10));
      });

      expect(onAudioError).toHaveBeenCalledWith('peer-1', playError);
    });
  });

  describe('Cleanup', () => {
    it('cleans up all audio elements on unmount', () => {
      const { result, unmount } = renderHook(() => useRoomAudio());

      act(() => {
        result.current.addPeerStream('peer-1', createMockStream());
        result.current.addPeerStream('peer-2', createMockStream());
      });

      unmount();

      createdAudioElements.forEach((el) => {
        expect(el.pause).toHaveBeenCalled();
        expect(el.srcObject).toBeNull();
      });
    });
  });

  describe('New Peer Inherits Mute State', () => {
    it('new peers inherit isAllMuted state', () => {
      const { result } = renderHook(() => useRoomAudio());

      act(() => {
        result.current.addPeerStream('peer-1', createMockStream());
        result.current.muteAll();
      });

      act(() => {
        result.current.addPeerStream('peer-2', createMockStream());
      });

      // New peer should be muted because isAllMuted is true
      expect(result.current.peerAudio.get('peer-2')?.isMuted).toBe(true);
    });
  });

  describe('Multiple Operations', () => {
    it('handles rapid add/remove operations', () => {
      const { result } = renderHook(() => useRoomAudio());

      act(() => {
        result.current.addPeerStream('peer-1', createMockStream());
        result.current.addPeerStream('peer-2', createMockStream());
        result.current.removePeerStream('peer-1');
        result.current.addPeerStream('peer-3', createMockStream());
        result.current.removePeerStream('peer-2');
      });

      expect(result.current.peerAudio.size).toBe(1);
      expect(result.current.peerAudio.has('peer-3')).toBe(true);
    });

    it('handles volume changes during mute', () => {
      const { result } = renderHook(() => useRoomAudio());

      act(() => {
        result.current.addPeerStream('peer-1', createMockStream());
        result.current.mutePeer('peer-1');
        result.current.setPeerVolume('peer-1', 0.5);
      });

      // Volume should be updated even when muted
      expect(result.current.peerAudio.get('peer-1')?.volume).toBe(0.5);
      expect(result.current.peerAudio.get('peer-1')?.isMuted).toBe(true);
    });
  });
});
