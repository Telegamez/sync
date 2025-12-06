/**
 * SwensyncOverlayRoom Component Tests
 *
 * Tests for the enhanced overlay for multi-peer rooms.
 *
 * Part of the Long-Horizon Engineering Protocol - FEAT-306
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import {
  SwensyncOverlayRoom,
  type SwensyncOverlayRoomProps,
  type RoomParticipant,
  type RoomAISession,
} from '@/components/room/SwensyncOverlayRoom';
import type { PeerId } from '@/types/peer';
import type { RoomId } from '@/types/room';

// Mock react-device-detect
vi.mock('react-device-detect', () => ({
  isMobile: false,
}));

// Mock createPortal
vi.mock('react-dom', async () => {
  const actual = await vi.importActual('react-dom');
  return {
    ...actual,
    createPortal: (node: React.ReactNode) => node,
  };
});

describe('SwensyncOverlayRoom', () => {
  const mockRoomId = 'room-123' as RoomId;
  const mockLocalPeerId = 'peer-local' as PeerId;

  const defaultParticipants: RoomParticipant[] = [
    {
      id: 'peer-local' as PeerId,
      displayName: 'Local User',
      isLocal: true,
      isSpeaking: false,
      isMuted: false,
    },
    {
      id: 'peer-1' as PeerId,
      displayName: 'Alice',
      isLocal: false,
      isSpeaking: false,
      isMuted: false,
    },
    {
      id: 'peer-2' as PeerId,
      displayName: 'Bob',
      isLocal: false,
      isSpeaking: false,
      isMuted: true,
    },
  ];

  const defaultAISession: RoomAISession = {
    state: 'idle',
    isHealthy: true,
    sessionDuration: 120,
    isExpiring: false,
    currentSpeakerId: null,
    currentSpeakerName: undefined,
    queuePosition: 0,
    queueLength: 0,
    lastError: null,
  };

  const defaultProps: SwensyncOverlayRoomProps = {
    isOpen: true,
    onClose: vi.fn(),
    roomId: mockRoomId,
    roomName: 'Test Room',
    localPeerId: mockLocalPeerId,
    connectionState: 'connected',
    error: null,
    participants: defaultParticipants,
    aiSession: defaultAISession,
    analyserNode: null,
    isVisualizerActive: false,
    onConnect: vi.fn(),
    onDisconnect: vi.fn(),
    onRetry: vi.fn(),
    onPTTStart: vi.fn(),
    onPTTEnd: vi.fn(),
    onToggleMute: vi.fn(),
    isLocalMuted: false,
    onOpenSettings: vi.fn(),
    onShowParticipants: vi.fn(),
    showPTT: true,
    isDesignatedSpeaker: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  describe('rendering', () => {
    it('renders when isOpen is true', () => {
      render(<SwensyncOverlayRoom {...defaultProps} />);
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('does not render when isOpen is false', () => {
      render(<SwensyncOverlayRoom {...defaultProps} isOpen={false} />);
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('displays room name in header', () => {
      render(<SwensyncOverlayRoom {...defaultProps} />);
      expect(screen.getByText('Test Room')).toBeInTheDocument();
    });

    it('has correct aria label with room name', () => {
      render(<SwensyncOverlayRoom {...defaultProps} />);
      expect(screen.getByLabelText('Test Room Voice Conversation')).toBeInTheDocument();
    });

    it('sets data attributes for room and AI state', () => {
      render(<SwensyncOverlayRoom {...defaultProps} />);
      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveAttribute('data-room-id', 'room-123');
      expect(dialog).toHaveAttribute('data-ai-state', 'idle');
    });
  });

  describe('connection states', () => {
    it('shows connecting state', () => {
      render(<SwensyncOverlayRoom {...defaultProps} connectionState="connecting" />);
      expect(screen.getByText('Connecting to Room')).toBeInTheDocument();
      // Room name shown in loading state description
      expect(screen.getAllByText('Test Room').length).toBeGreaterThan(0);
    });

    it('shows reconnecting state', () => {
      render(<SwensyncOverlayRoom {...defaultProps} connectionState="reconnecting" />);
      expect(screen.getByText('Reconnecting...')).toBeInTheDocument();
    });

    it('shows error state with message', () => {
      const error = new Error('Connection failed');
      render(<SwensyncOverlayRoom {...defaultProps} connectionState="error" error={error} />);
      expect(screen.getByText('Connection Failed')).toBeInTheDocument();
      expect(screen.getByText('Connection failed')).toBeInTheDocument();
    });

    it('shows error state with AI session error', () => {
      const aiSession = { ...defaultAISession, lastError: 'AI service unavailable' };
      render(<SwensyncOverlayRoom {...defaultProps} connectionState="error" aiSession={aiSession} />);
      expect(screen.getByText('AI service unavailable')).toBeInTheDocument();
    });

    it('shows retry button on error', () => {
      render(<SwensyncOverlayRoom {...defaultProps} connectionState="error" />);
      expect(screen.getByRole('button', { name: 'Retry Connection' })).toBeInTheDocument();
    });

    it('calls onRetry when retry button is clicked', () => {
      const onRetry = vi.fn();
      render(<SwensyncOverlayRoom {...defaultProps} connectionState="error" onRetry={onRetry} />);
      fireEvent.click(screen.getByRole('button', { name: 'Retry Connection' }));
      expect(onRetry).toHaveBeenCalledOnce();
    });
  });

  describe('participant display', () => {
    it('shows participant count', () => {
      render(<SwensyncOverlayRoom {...defaultProps} />);
      expect(screen.getByText('3')).toBeInTheDocument();
    });

    it('shows participant avatars in header', () => {
      render(<SwensyncOverlayRoom {...defaultProps} />);
      // Should show initials for participants
      expect(screen.getByText('LU')).toBeInTheDocument(); // Local User
    });

    it('shows overflow indicator for many participants', () => {
      const manyParticipants: RoomParticipant[] = Array.from({ length: 7 }, (_, i) => ({
        id: `peer-${i}` as PeerId,
        displayName: `User ${i}`,
        isLocal: i === 0,
      }));
      render(<SwensyncOverlayRoom {...defaultProps} participants={manyParticipants} maxHeaderParticipants={4} />);
      expect(screen.getByText('+3')).toBeInTheDocument();
    });

    it('calls onShowParticipants when participants button clicked', () => {
      const onShowParticipants = vi.fn();
      render(<SwensyncOverlayRoom {...defaultProps} onShowParticipants={onShowParticipants} />);
      fireEvent.click(screen.getByLabelText('3 participants'));
      expect(onShowParticipants).toHaveBeenCalledOnce();
    });
  });

  describe('AI state display', () => {
    it('displays AI state badge in header', () => {
      render(<SwensyncOverlayRoom {...defaultProps} />);
      // AI state badge should show "Ready" for idle state
      expect(screen.getAllByText('Ready').length).toBeGreaterThan(0);
    });

    it('shows listening state', () => {
      const aiSession = { ...defaultAISession, state: 'listening' as const };
      render(<SwensyncOverlayRoom {...defaultProps} aiSession={aiSession} />);
      // AI state indicator shows "Listening" label
      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveAttribute('data-ai-state', 'listening');
    });

    it('shows processing state', () => {
      const aiSession = { ...defaultAISession, state: 'processing' as const };
      render(<SwensyncOverlayRoom {...defaultProps} aiSession={aiSession} />);
      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveAttribute('data-ai-state', 'processing');
    });

    it('shows speaking state', () => {
      const aiSession = { ...defaultAISession, state: 'speaking' as const };
      render(<SwensyncOverlayRoom {...defaultProps} aiSession={aiSession} />);
      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveAttribute('data-ai-state', 'speaking');
    });
  });

  describe('responding to speaker', () => {
    it('shows who AI is responding to', () => {
      const participants: RoomParticipant[] = [
        ...defaultParticipants,
      ];
      const aiSession: RoomAISession = {
        ...defaultAISession,
        state: 'speaking',
        currentSpeakerId: 'peer-1' as PeerId,
        currentSpeakerName: 'Alice',
      };
      render(<SwensyncOverlayRoom {...defaultProps} participants={participants} aiSession={aiSession} />);
      expect(screen.getByText('Responding to')).toBeInTheDocument();
      expect(screen.getByText('Alice')).toBeInTheDocument();
    });

    it('shows "you" when responding to local user', () => {
      const aiSession: RoomAISession = {
        ...defaultAISession,
        state: 'speaking',
        currentSpeakerId: mockLocalPeerId,
        currentSpeakerName: 'Local User',
      };
      render(<SwensyncOverlayRoom {...defaultProps} aiSession={aiSession} />);
      expect(screen.getByText('Responding to')).toBeInTheDocument();
      expect(screen.getByText('you')).toBeInTheDocument();
    });
  });

  describe('speaking indicators', () => {
    it('shows speaking indicator when someone is speaking and AI is listening', () => {
      const participants: RoomParticipant[] = [
        { ...defaultParticipants[0], isSpeaking: true, audioLevel: 0.7 },
        ...defaultParticipants.slice(1),
      ];
      const aiSession = { ...defaultAISession, state: 'listening' as const };
      render(<SwensyncOverlayRoom {...defaultProps} participants={participants} aiSession={aiSession} />);
      // SpeakingIndicator should show the speaker (contains display name)
      expect(screen.getByText(/Local User/)).toBeInTheDocument();
    });

    it('shows multiple speakers', () => {
      const participants: RoomParticipant[] = [
        { ...defaultParticipants[0], isSpeaking: true, audioLevel: 0.7 },
        { ...defaultParticipants[1], isSpeaking: true, audioLevel: 0.5 },
        ...defaultParticipants.slice(2),
      ];
      const aiSession = { ...defaultAISession, state: 'listening' as const };
      render(<SwensyncOverlayRoom {...defaultProps} participants={participants} aiSession={aiSession} />);
      expect(screen.getByText('2 people speaking')).toBeInTheDocument();
    });
  });

  describe('queue position', () => {
    it('shows queue position indicator', () => {
      const aiSession: RoomAISession = {
        ...defaultAISession,
        queuePosition: 3,
        queueLength: 5,
      };
      render(<SwensyncOverlayRoom {...defaultProps} aiSession={aiSession} />);
      expect(screen.getByText('Position 3 of 5')).toBeInTheDocument();
    });

    it('shows "You\'re next" when position is 1', () => {
      const aiSession: RoomAISession = {
        ...defaultAISession,
        queuePosition: 1,
        queueLength: 3,
      };
      render(<SwensyncOverlayRoom {...defaultProps} aiSession={aiSession} />);
      expect(screen.getByText("You're next")).toBeInTheDocument();
    });

    it('does not show queue indicator when not in queue', () => {
      render(<SwensyncOverlayRoom {...defaultProps} />);
      expect(screen.queryByText(/Position \d+ of \d+/)).not.toBeInTheDocument();
      expect(screen.queryByText("You're next")).not.toBeInTheDocument();
    });
  });

  describe('session warnings', () => {
    it('shows expiring session warning', () => {
      const aiSession: RoomAISession = {
        ...defaultAISession,
        isExpiring: true,
        sessionDuration: 540, // 9 minutes
      };
      render(<SwensyncOverlayRoom {...defaultProps} aiSession={aiSession} />);
      expect(screen.getByText(/Session ending in/)).toBeInTheDocument();
    });

    it('shows unhealthy session warning', () => {
      const aiSession: RoomAISession = {
        ...defaultAISession,
        isHealthy: false,
      };
      render(<SwensyncOverlayRoom {...defaultProps} aiSession={aiSession} />);
      expect(screen.getByText('AI connection unstable')).toBeInTheDocument();
    });
  });

  describe('controls', () => {
    it('shows mute button', () => {
      render(<SwensyncOverlayRoom {...defaultProps} />);
      expect(screen.getByLabelText('Mute microphone')).toBeInTheDocument();
    });

    it('shows unmute button when muted', () => {
      render(<SwensyncOverlayRoom {...defaultProps} isLocalMuted={true} />);
      expect(screen.getByLabelText('Unmute microphone')).toBeInTheDocument();
    });

    it('calls onToggleMute when mute button clicked', () => {
      const onToggleMute = vi.fn();
      render(<SwensyncOverlayRoom {...defaultProps} onToggleMute={onToggleMute} />);
      fireEvent.click(screen.getByLabelText('Mute microphone'));
      expect(onToggleMute).toHaveBeenCalledOnce();
    });

    it('shows PTT button when showPTT is true', () => {
      render(<SwensyncOverlayRoom {...defaultProps} showPTT={true} />);
      // MainPTTButton may have different text - check for the button role with PTT-related text
      const pttButton = screen.getByRole('button', { name: /talk|speak|ptt/i });
      expect(pttButton).toBeInTheDocument();
    });

    it('hides PTT button when showPTT is false', () => {
      render(<SwensyncOverlayRoom {...defaultProps} showPTT={false} />);
      expect(screen.queryByText('Hold to Talk')).not.toBeInTheDocument();
    });

    it('shows settings button when onOpenSettings provided', () => {
      render(<SwensyncOverlayRoom {...defaultProps} />);
      expect(screen.getByLabelText('Room settings')).toBeInTheDocument();
    });

    it('hides settings button when onOpenSettings not provided', () => {
      render(<SwensyncOverlayRoom {...defaultProps} onOpenSettings={undefined} />);
      expect(screen.queryByLabelText('Room settings')).not.toBeInTheDocument();
    });

    it('calls onOpenSettings when settings button clicked', () => {
      const onOpenSettings = vi.fn();
      render(<SwensyncOverlayRoom {...defaultProps} onOpenSettings={onOpenSettings} />);
      fireEvent.click(screen.getByLabelText('Room settings'));
      expect(onOpenSettings).toHaveBeenCalledOnce();
    });
  });

  describe('close behavior', () => {
    it('shows close button', () => {
      render(<SwensyncOverlayRoom {...defaultProps} />);
      expect(screen.getByLabelText('Leave room')).toBeInTheDocument();
    });

    it('calls onClose and onDisconnect when close button clicked', () => {
      const onClose = vi.fn();
      const onDisconnect = vi.fn();
      render(<SwensyncOverlayRoom {...defaultProps} onClose={onClose} onDisconnect={onDisconnect} />);
      fireEvent.click(screen.getByLabelText('Leave room'));
      expect(onDisconnect).toHaveBeenCalledOnce();
      expect(onClose).toHaveBeenCalledOnce();
    });

    it('closes on ESC key press', async () => {
      const onClose = vi.fn();
      render(<SwensyncOverlayRoom {...defaultProps} onClose={onClose} />);
      fireEvent.keyDown(window, { key: 'Escape' });
      expect(onClose).toHaveBeenCalledOnce();
    });
  });

  describe('auto-connect behavior', () => {
    it('calls onConnect when opening with idle state', () => {
      const onConnect = vi.fn();
      render(<SwensyncOverlayRoom {...defaultProps} connectionState="idle" onConnect={onConnect} />);
      expect(onConnect).toHaveBeenCalledOnce();
    });

    it('does not call onConnect when already connected', () => {
      const onConnect = vi.fn();
      render(<SwensyncOverlayRoom {...defaultProps} connectionState="connected" onConnect={onConnect} />);
      expect(onConnect).not.toHaveBeenCalled();
    });
  });

  describe('session timer', () => {
    it('shows session timer when connected', () => {
      const aiSession: RoomAISession = {
        ...defaultAISession,
        sessionDuration: 125,
      };
      render(<SwensyncOverlayRoom {...defaultProps} aiSession={aiSession} />);
      expect(screen.getByText('2:05')).toBeInTheDocument();
    });
  });

  describe('visualizer mode', () => {
    it('shows visualizer mode switcher when connected', () => {
      render(<SwensyncOverlayRoom {...defaultProps} />);
      // Visualizer mode switcher should be present
      expect(screen.getByRole('group')).toBeInTheDocument();
    });
  });

  describe('accessibility', () => {
    it('has modal aria attributes', () => {
      render(<SwensyncOverlayRoom {...defaultProps} />);
      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveAttribute('aria-modal', 'true');
    });

    it('has correct aria-pressed on mute button', () => {
      render(<SwensyncOverlayRoom {...defaultProps} isLocalMuted={true} />);
      expect(screen.getByLabelText('Unmute microphone')).toHaveAttribute('aria-pressed', 'true');
    });
  });

  describe('edge cases', () => {
    it('handles empty participants array', () => {
      render(<SwensyncOverlayRoom {...defaultProps} participants={[]} />);
      expect(screen.getByText('0')).toBeInTheDocument();
    });

    it('handles missing optional callbacks', () => {
      const minimalProps: SwensyncOverlayRoomProps = {
        isOpen: true,
        onClose: vi.fn(),
        roomId: mockRoomId,
        connectionState: 'connected',
        participants: [],
        aiSession: defaultAISession,
      };
      expect(() => render(<SwensyncOverlayRoom {...minimalProps} />)).not.toThrow();
    });

    it('handles very long room name', () => {
      const longName = 'A'.repeat(100);
      render(<SwensyncOverlayRoom {...defaultProps} roomName={longName} />);
      expect(screen.getByText(longName)).toBeInTheDocument();
    });
  });
});
