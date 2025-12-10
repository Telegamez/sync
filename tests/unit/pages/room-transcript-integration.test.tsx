/**
 * Room Page Transcript Integration Tests
 *
 * Tests for FEAT-512: Room page transcript integration.
 * Verifies TranscriptPanel integration, recording indicator,
 * mobile transcript toggle, and visibility state.
 *
 * Part of the Long-Horizon Engineering Protocol - FEAT-512
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { act } from "react";

// Mock next/navigation
const mockPush = vi.fn();
const mockParams = { roomId: "test-room-123" };
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  useParams: () => mockParams,
}));

// Mock SignalingClient
const mockSignalingClient = {
  on: vi.fn(),
  off: vi.fn(),
  requestTranscriptHistory: vi.fn(),
  getSocket: vi.fn(() => ({ emit: vi.fn() })),
  startPTT: vi.fn(),
  endPTT: vi.fn(),
  voiceInterrupt: vi.fn(),
  updateDisplayName: vi.fn(),
};

// Mock room connection hook
const mockRoomConnection = {
  connectionState: "connected",
  room: {
    name: "Test Room",
    maxParticipants: 4,
    transcriptSettings: {
      enabled: true,
      summariesEnabled: true,
      retention: "session",
      allowDownload: true,
    },
  },
  localPeer: {
    id: "local-peer-1",
    displayName: "Test User",
    role: "participant",
  },
  peers: [],
  isInRoom: true,
  isLoading: false,
  error: null,
  connect: vi.fn().mockResolvedValue(undefined),
  joinRoom: vi.fn().mockResolvedValue(undefined),
  leaveRoom: vi.fn().mockResolvedValue(undefined),
  getClient: vi.fn(() => mockSignalingClient),
};

vi.mock("@/hooks/useRoomConnection", () => ({
  useRoomConnection: () => mockRoomConnection,
}));

// Mock room peers hook
vi.mock("@/hooks/useRoomPeers", () => ({
  useRoomPeers: () => ({
    peers: [],
    setLocalStream: vi.fn(),
    getAudioStreams: vi.fn(() => new Map()),
  }),
}));

// Mock room audio hook
vi.mock("@/hooks/useRoomAudio", () => ({
  useRoomAudio: () => ({
    addPeerStream: vi.fn(),
    removePeerStream: vi.fn(),
    setLocalStream: vi.fn(),
    peerAudio: new Map(),
  }),
}));

// Mock presence hook
vi.mock("@/hooks/usePresence", () => ({
  usePresence: () => ({
    localPresence: null,
    activeSpeaker: null,
    setMuted: vi.fn(),
    setAddressingAI: vi.fn(),
    setSpeaking: vi.fn(),
  }),
}));

// Mock shared AI hook
vi.mock("@/hooks/useSharedAI", () => ({
  useSharedAI: () => ({
    state: { aiState: "idle", lastError: null },
    playback: { isPlaying: false },
    startPlayback: vi.fn(),
    stopPlayback: vi.fn(),
  }),
}));

// Mock transcript entries for tests
const mockTranscriptEntries = [
  {
    id: "entry-1",
    roomId: "test-room-123",
    timestamp: new Date("2024-12-09T10:00:00Z"),
    type: "ptt" as const,
    speaker: "User One",
    speakerId: "user-1",
    content: "Hello everyone",
    isAI: false,
  },
  {
    id: "entry-2",
    roomId: "test-room-123",
    timestamp: new Date("2024-12-09T10:01:00Z"),
    type: "ai_response" as const,
    speaker: "AI Assistant",
    speakerId: "ai",
    content: "Hello! How can I help you?",
    isAI: true,
  },
];

// Mock useTranscript hook with configurable state
let mockTranscriptState = {
  entries: [] as typeof mockTranscriptEntries,
  summaries: [],
  isLoading: false,
  isLoadingMore: false,
  error: null as string | null,
  hasMore: false,
  autoScroll: true,
  totalEntries: 0,
  addEntry: vi.fn(),
  loadMore: vi.fn(),
  toggleAutoScroll: vi.fn(),
  setAutoScroll: vi.fn(),
  downloadAsTxt: vi.fn().mockResolvedValue(undefined),
  downloadAsMd: vi.fn().mockResolvedValue(undefined),
  copyToClipboard: vi.fn().mockResolvedValue(true),
  clearError: vi.fn(),
  refresh: vi.fn(),
};

vi.mock("@/hooks/useTranscript", () => ({
  useTranscript: () => mockTranscriptState,
}));

// Mock navigator for clipboard and mediaDevices
const mockClipboard = { writeText: vi.fn().mockResolvedValue(undefined) };
const mockMediaStream = {
  getTracks: () => [{ stop: vi.fn(), enabled: true }],
  getAudioTracks: () => [{ stop: vi.fn(), enabled: true }],
};
const mockGetUserMedia = vi.fn().mockResolvedValue(mockMediaStream);

Object.defineProperty(navigator, "clipboard", {
  value: mockClipboard,
  writable: true,
});
Object.defineProperty(navigator, "mediaDevices", {
  value: { getUserMedia: mockGetUserMedia },
  writable: true,
});

// Mock sessionStorage and localStorage
const mockStorage: Record<string, string> = {};
Object.defineProperty(window, "sessionStorage", {
  value: {
    getItem: (key: string) => mockStorage[key] || null,
    setItem: (key: string, value: string) => {
      mockStorage[key] = value;
    },
    removeItem: (key: string) => {
      delete mockStorage[key];
    },
  },
  writable: true,
});
Object.defineProperty(window, "localStorage", {
  value: {
    getItem: (key: string) => mockStorage[key] || null,
    setItem: (key: string, value: string) => {
      mockStorage[key] = value;
    },
    removeItem: (key: string) => {
      delete mockStorage[key];
    },
  },
  writable: true,
});

// Import component after mocks
import RoomPage from "@/app/rooms/[roomId]/page";

describe("FEAT-512: Room Page Transcript Integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset transcript state
    mockTranscriptState = {
      entries: [],
      summaries: [],
      isLoading: false,
      isLoadingMore: false,
      error: null,
      hasMore: false,
      autoScroll: true,
      totalEntries: 0,
      addEntry: vi.fn(),
      loadMore: vi.fn(),
      toggleAutoScroll: vi.fn(),
      setAutoScroll: vi.fn(),
      downloadAsTxt: vi.fn().mockResolvedValue(undefined),
      downloadAsMd: vi.fn().mockResolvedValue(undefined),
      copyToClipboard: vi.fn().mockResolvedValue(true),
      clearError: vi.fn(),
      refresh: vi.fn(),
    };
  });

  describe("Transcript toggle button", () => {
    it("should render transcript toggle button in header", async () => {
      await act(async () => {
        render(<RoomPage />);
      });

      await waitFor(() => {
        expect(screen.getByLabelText("Show transcript")).toBeInTheDocument();
      });
    });

    it("should toggle transcript panel visibility on button click", async () => {
      await act(async () => {
        render(<RoomPage />);
      });

      await waitFor(() => {
        expect(screen.getByLabelText("Show transcript")).toBeInTheDocument();
      });

      // Initially hidden
      expect(screen.queryByText("No transcript yet")).not.toBeInTheDocument();

      // Click to show
      const toggleButton = screen.getByLabelText("Show transcript");
      await act(async () => {
        fireEvent.click(toggleButton);
      });

      // Should now show transcript panel (may be multiple due to desktop + mobile)
      await waitFor(() => {
        expect(screen.getAllByText("No transcript yet").length).toBeGreaterThan(
          0,
        );
      });
    });

    it("should show entry count in toggle button when entries exist", async () => {
      mockTranscriptState.entries = mockTranscriptEntries;
      mockTranscriptState.totalEntries = 2;

      await act(async () => {
        render(<RoomPage />);
      });

      await waitFor(() => {
        expect(screen.getByText(/Transcript \(2\)/)).toBeInTheDocument();
      });
    });

    it("should change button style when transcript is visible", async () => {
      await act(async () => {
        render(<RoomPage />);
      });

      await waitFor(() => {
        expect(screen.getByLabelText("Show transcript")).toBeInTheDocument();
      });

      const toggleButton = screen.getByLabelText("Show transcript");

      // Initially not pressed
      expect(toggleButton).toHaveAttribute("aria-pressed", "false");

      // Click to show
      await act(async () => {
        fireEvent.click(toggleButton);
      });

      // Should be pressed
      await waitFor(() => {
        expect(screen.getByLabelText("Hide transcript")).toHaveAttribute(
          "aria-pressed",
          "true",
        );
      });
    });
  });

  describe("Recording indicator", () => {
    it("should not show recording indicator when no entries", async () => {
      await act(async () => {
        render(<RoomPage />);
      });

      await waitFor(() => {
        expect(screen.getByText("Test Room")).toBeInTheDocument();
      });

      // REC indicator should not be present
      expect(screen.queryByText("REC")).not.toBeInTheDocument();
    });

    it("should show recording indicator when transcript has entries", async () => {
      mockTranscriptState.entries = mockTranscriptEntries;
      mockTranscriptState.totalEntries = 2;

      await act(async () => {
        render(<RoomPage />);
      });

      await waitFor(() => {
        expect(screen.getByText("REC")).toBeInTheDocument();
      });
    });

    it("should have tooltip on recording indicator", async () => {
      mockTranscriptState.entries = mockTranscriptEntries;

      await act(async () => {
        render(<RoomPage />);
      });

      await waitFor(() => {
        const recIndicator = screen.getByTitle("Recording transcript");
        expect(recIndicator).toBeInTheDocument();
      });
    });
  });

  describe("Transcript panel integration", () => {
    it("should pass transcript state to TranscriptPanel", async () => {
      mockTranscriptState.entries = mockTranscriptEntries;
      mockTranscriptState.totalEntries = 2;

      await act(async () => {
        render(<RoomPage />);
      });

      // Show transcript panel
      await waitFor(() => {
        expect(screen.getByLabelText("Show transcript")).toBeInTheDocument();
      });

      await act(async () => {
        fireEvent.click(screen.getByLabelText("Show transcript"));
      });

      // Check that entries are displayed (may be multiple due to desktop + mobile)
      await waitFor(() => {
        expect(screen.getAllByText("Hello everyone").length).toBeGreaterThan(0);
        expect(
          screen.getAllByText("Hello! How can I help you?").length,
        ).toBeGreaterThan(0);
      });
    });

    it("should show loading state in transcript panel", async () => {
      mockTranscriptState.isLoading = true;

      await act(async () => {
        render(<RoomPage />);
      });

      // Show transcript panel
      await waitFor(() => {
        expect(screen.getByLabelText("Show transcript")).toBeInTheDocument();
      });

      await act(async () => {
        fireEvent.click(screen.getByLabelText("Show transcript"));
      });

      // Should show loading spinner
      await waitFor(() => {
        expect(document.querySelector(".animate-spin")).toBeInTheDocument();
      });
    });

    it("should show empty state when no entries", async () => {
      await act(async () => {
        render(<RoomPage />);
      });

      // Show transcript panel
      await waitFor(() => {
        expect(screen.getByLabelText("Show transcript")).toBeInTheDocument();
      });

      await act(async () => {
        fireEvent.click(screen.getByLabelText("Show transcript"));
      });

      // Should show empty state (may be multiple due to desktop + mobile)
      await waitFor(() => {
        expect(screen.getAllByText("No transcript yet").length).toBeGreaterThan(
          0,
        );
      });
    });
  });

  describe("Transcript panel actions", () => {
    it("should call downloadAsTxt when download txt clicked", async () => {
      mockTranscriptState.entries = mockTranscriptEntries;

      await act(async () => {
        render(<RoomPage />);
      });

      // Show transcript panel
      await waitFor(() => {
        expect(screen.getByLabelText("Show transcript")).toBeInTheDocument();
      });

      await act(async () => {
        fireEvent.click(screen.getByLabelText("Show transcript"));
      });

      // Click download txt (may be multiple due to desktop + mobile, just click first)
      await waitFor(() => {
        expect(screen.getAllByTitle("Download as text").length).toBeGreaterThan(
          0,
        );
      });

      await act(async () => {
        fireEvent.click(screen.getAllByTitle("Download as text")[0]);
      });

      expect(mockTranscriptState.downloadAsTxt).toHaveBeenCalled();
    });

    it("should call copyToClipboard when copy clicked", async () => {
      mockTranscriptState.entries = mockTranscriptEntries;

      await act(async () => {
        render(<RoomPage />);
      });

      // Show transcript panel
      await waitFor(() => {
        expect(screen.getByLabelText("Show transcript")).toBeInTheDocument();
      });

      await act(async () => {
        fireEvent.click(screen.getByLabelText("Show transcript"));
      });

      // Click copy (may be multiple due to desktop + mobile, just click first)
      await waitFor(() => {
        expect(
          screen.getAllByTitle("Copy to clipboard").length,
        ).toBeGreaterThan(0);
      });

      await act(async () => {
        fireEvent.click(screen.getAllByTitle("Copy to clipboard")[0]);
      });

      expect(mockTranscriptState.copyToClipboard).toHaveBeenCalled();
    });

    it("should call toggleAutoScroll when auto-scroll toggled", async () => {
      mockTranscriptState.entries = mockTranscriptEntries;

      await act(async () => {
        render(<RoomPage />);
      });

      // Show transcript panel
      await waitFor(() => {
        expect(screen.getByLabelText("Show transcript")).toBeInTheDocument();
      });

      await act(async () => {
        fireEvent.click(screen.getByLabelText("Show transcript"));
      });

      // Click auto-scroll toggle (may be multiple due to desktop + mobile, just click first)
      await waitFor(() => {
        expect(screen.getAllByText("Auto").length).toBeGreaterThan(0);
      });

      await act(async () => {
        fireEvent.click(screen.getAllByText("Auto")[0]);
      });

      expect(mockTranscriptState.toggleAutoScroll).toHaveBeenCalled();
    });
  });

  describe("Responsive behavior", () => {
    it("should render desktop panel on large screens", async () => {
      mockTranscriptState.entries = mockTranscriptEntries;

      await act(async () => {
        render(<RoomPage />);
      });

      // Show transcript panel
      await waitFor(() => {
        expect(screen.getByLabelText("Show transcript")).toBeInTheDocument();
      });

      await act(async () => {
        fireEvent.click(screen.getByLabelText("Show transcript"));
      });

      // Check for desktop panel (aside element)
      await waitFor(() => {
        const aside = document.querySelector("aside");
        expect(aside).toBeInTheDocument();
      });
    });

    it("should render mobile sheet on small screens", async () => {
      mockTranscriptState.entries = mockTranscriptEntries;

      await act(async () => {
        render(<RoomPage />);
      });

      // Show transcript panel
      await waitFor(() => {
        expect(screen.getByLabelText("Show transcript")).toBeInTheDocument();
      });

      await act(async () => {
        fireEvent.click(screen.getByLabelText("Show transcript"));
      });

      // Check for mobile sheet (has mobileSheet prop)
      // The mobile version should have the fixed positioning classes
      // Note: bottom-24 keeps panel above the footer controls
      await waitFor(() => {
        const mobileSheet = document.querySelector(
          ".fixed.inset-x-0.bottom-24",
        );
        expect(mobileSheet).toBeInTheDocument();
      });
    });
  });

  describe("Error handling", () => {
    it("should show error in transcript panel when error exists", async () => {
      mockTranscriptState.error = "Failed to load transcript";

      await act(async () => {
        render(<RoomPage />);
      });

      // Show transcript panel
      await waitFor(() => {
        expect(screen.getByLabelText("Show transcript")).toBeInTheDocument();
      });

      await act(async () => {
        fireEvent.click(screen.getByLabelText("Show transcript"));
      });

      // Should show error message (may be multiple due to desktop + mobile)
      await waitFor(() => {
        expect(
          screen.getAllByText("Failed to load transcript").length,
        ).toBeGreaterThan(0);
      });
    });

    it("should call clearError when error dismissed", async () => {
      mockTranscriptState.error = "Test error";

      await act(async () => {
        render(<RoomPage />);
      });

      // Show transcript panel
      await waitFor(() => {
        expect(screen.getByLabelText("Show transcript")).toBeInTheDocument();
      });

      await act(async () => {
        fireEvent.click(screen.getByLabelText("Show transcript"));
      });

      // Find and click error dismiss button (may be multiple, get first one)
      await waitFor(() => {
        expect(screen.getAllByText("Test error").length).toBeGreaterThan(0);
      });

      const errorElements = screen.getAllByText("Test error");
      const dismissButton =
        errorElements[0].parentElement?.querySelector("button");
      if (dismissButton) {
        await act(async () => {
          fireEvent.click(dismissButton);
        });
        expect(mockTranscriptState.clearError).toHaveBeenCalled();
      }
    });
  });
});
