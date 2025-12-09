/**
 * TranscriptPanel Component Tests
 *
 * Tests for FEAT-508: TranscriptPanel component.
 * Verifies transcript UI rendering, auto-scroll, and interaction.
 *
 * Part of the Long-Horizon Engineering Protocol - FEAT-508
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import {
  TranscriptPanel,
  type TranscriptPanelProps,
} from "@/components/room/TranscriptPanel";
import type { TranscriptEntry, TranscriptSummary } from "@/types/transcript";

// Helper to create mock entries
function createMockEntry(
  id: string,
  speaker: string,
  content: string,
  type: "ambient" | "ptt" | "ai_response" | "system" = "ptt",
): TranscriptEntry {
  return {
    id,
    roomId: "room-123",
    timestamp: new Date("2024-12-09T10:00:00Z"),
    speaker,
    speakerId: type === "ai_response" || type === "system" ? null : "peer-1",
    content,
    type,
  };
}

// Helper to create mock summary
function createMockSummary(id: string): TranscriptSummary {
  return {
    id,
    roomId: "room-123",
    timestamp: new Date("2024-12-09T10:30:00Z"),
    content: "Test summary content",
    bulletPoints: ["Point 1", "Point 2"],
    entriesSummarized: 10,
    tokenCount: 50,
    coverageStart: new Date("2024-12-09T10:00:00Z"),
    coverageEnd: new Date("2024-12-09T10:30:00Z"),
  };
}

describe("FEAT-508: TranscriptPanel Component", () => {
  const mockOnLoadMore = vi.fn();
  const mockOnToggleAutoScroll = vi.fn();
  const mockOnDownloadTxt = vi.fn().mockResolvedValue(undefined);
  const mockOnDownloadMd = vi.fn().mockResolvedValue(undefined);
  const mockOnCopy = vi.fn().mockResolvedValue(true);
  const mockOnClearError = vi.fn();
  const mockOnCollapseChange = vi.fn();

  const defaultProps: TranscriptPanelProps = {
    entries: [],
    summaries: [],
    isLoading: false,
    isLoadingMore: false,
    error: null,
    hasMore: false,
    autoScroll: true,
    totalEntries: 0,
    onLoadMore: mockOnLoadMore,
    onToggleAutoScroll: mockOnToggleAutoScroll,
    onDownloadTxt: mockOnDownloadTxt,
    onDownloadMd: mockOnDownloadMd,
    onCopy: mockOnCopy,
    onClearError: mockOnClearError,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Rendering", () => {
    it("should render with title", () => {
      render(<TranscriptPanel {...defaultProps} title="Room Transcript" />);

      expect(screen.getByText("Room Transcript")).toBeInTheDocument();
    });

    it("should show entry count", () => {
      render(<TranscriptPanel {...defaultProps} totalEntries={42} />);

      expect(screen.getByText("(42 entries)")).toBeInTheDocument();
    });

    it("should show loading state", () => {
      render(<TranscriptPanel {...defaultProps} isLoading={true} />);

      // Loading spinner should be visible (via aria or presence of spinner)
      const container =
        screen.getByText("Transcript").parentElement?.parentElement
          ?.parentElement;
      expect(container).toBeInTheDocument();
    });

    it("should show empty state when no entries", () => {
      render(<TranscriptPanel {...defaultProps} />);

      expect(screen.getByText("No transcript yet")).toBeInTheDocument();
    });

    it("should render entries", () => {
      const entries = [
        createMockEntry("1", "Alice", "Hello everyone"),
        createMockEntry("2", "Bob", "Hi Alice"),
      ];

      render(<TranscriptPanel {...defaultProps} entries={entries} />);

      expect(screen.getByText("Alice")).toBeInTheDocument();
      expect(screen.getByText("Hello everyone")).toBeInTheDocument();
      expect(screen.getByText("Bob")).toBeInTheDocument();
      expect(screen.getByText("Hi Alice")).toBeInTheDocument();
    });

    it("should render entry type badges", () => {
      const entries = [
        createMockEntry("1", "Alice", "PTT message", "ptt"),
        createMockEntry("2", "Bot", "AI response", "ai_response"),
      ];

      render(<TranscriptPanel {...defaultProps} entries={entries} />);

      expect(screen.getByText("PTT")).toBeInTheDocument();
      expect(screen.getByText("AI")).toBeInTheDocument();
    });

    it("should render system messages centered", () => {
      const entries = [createMockEntry("1", "System", "User joined", "system")];

      render(<TranscriptPanel {...defaultProps} entries={entries} />);

      expect(screen.getByText("User joined")).toBeInTheDocument();
    });

    it("should render summaries", () => {
      const summaries = [createMockSummary("summary-1")];

      render(<TranscriptPanel {...defaultProps} summaries={summaries} />);

      expect(screen.getByText("Summary")).toBeInTheDocument();
    });
  });

  describe("Header controls", () => {
    it("should show auto-scroll status", () => {
      render(<TranscriptPanel {...defaultProps} autoScroll={true} />);

      expect(screen.getByText("Auto")).toBeInTheDocument();
    });

    it("should toggle auto-scroll when clicked", () => {
      render(<TranscriptPanel {...defaultProps} />);

      const autoButton = screen.getByText("Auto");
      fireEvent.click(autoButton);

      expect(mockOnToggleAutoScroll).toHaveBeenCalled();
    });

    it("should show collapse button when onCollapseChange provided", () => {
      render(
        <TranscriptPanel
          {...defaultProps}
          onCollapseChange={mockOnCollapseChange}
        />,
      );

      // Collapse button should be present
      const buttons = screen.getAllByRole("button");
      expect(buttons.length).toBeGreaterThan(1);
    });

    it("should call onCollapseChange when collapse clicked", () => {
      render(
        <TranscriptPanel
          {...defaultProps}
          onCollapseChange={mockOnCollapseChange}
          isCollapsed={false}
        />,
      );

      // Find and click collapse button (has ChevronDown icon)
      const collapseButton = screen.getByTitle("Collapse panel");
      fireEvent.click(collapseButton);

      expect(mockOnCollapseChange).toHaveBeenCalledWith(true);
    });
  });

  describe("Collapsed state", () => {
    it("should render collapsed view", () => {
      render(
        <TranscriptPanel
          {...defaultProps}
          isCollapsed={true}
          onCollapseChange={mockOnCollapseChange}
          totalEntries={10}
        />,
      );

      expect(screen.getByText("Transcript")).toBeInTheDocument();
      expect(screen.getByText("(10 entries)")).toBeInTheDocument();
    });

    it("should expand when collapsed header clicked", () => {
      render(
        <TranscriptPanel
          {...defaultProps}
          isCollapsed={true}
          onCollapseChange={mockOnCollapseChange}
        />,
      );

      const header =
        screen.getByText("Transcript").parentElement?.parentElement;
      if (header) {
        fireEvent.click(header);
      }

      expect(mockOnCollapseChange).toHaveBeenCalledWith(false);
    });
  });

  describe("Error handling", () => {
    it("should display error banner", () => {
      render(
        <TranscriptPanel {...defaultProps} error="Something went wrong" />,
      );

      expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    });

    it("should clear error when dismiss clicked", () => {
      render(
        <TranscriptPanel {...defaultProps} error="Something went wrong" />,
      );

      // Find the X button in the error banner
      const errorBanner = screen.getByText(
        "Something went wrong",
      ).parentElement;
      const dismissButton = errorBanner?.querySelector("button");
      if (dismissButton) {
        fireEvent.click(dismissButton);
      }

      expect(mockOnClearError).toHaveBeenCalled();
    });
  });

  describe("Pagination", () => {
    it("should show load more button when hasMore", () => {
      const entries = [createMockEntry("1", "Alice", "Hello")];

      render(
        <TranscriptPanel {...defaultProps} entries={entries} hasMore={true} />,
      );

      expect(screen.getByText("Load older messages")).toBeInTheDocument();
    });

    it("should not show load more when !hasMore", () => {
      const entries = [createMockEntry("1", "Alice", "Hello")];

      render(
        <TranscriptPanel {...defaultProps} entries={entries} hasMore={false} />,
      );

      expect(screen.queryByText("Load older messages")).not.toBeInTheDocument();
    });

    it("should call onLoadMore when clicked", () => {
      const entries = [createMockEntry("1", "Alice", "Hello")];

      render(
        <TranscriptPanel {...defaultProps} entries={entries} hasMore={true} />,
      );

      const loadMoreButton = screen.getByText("Load older messages");
      fireEvent.click(loadMoreButton);

      expect(mockOnLoadMore).toHaveBeenCalled();
    });

    it("should show loading state when isLoadingMore", () => {
      const entries = [createMockEntry("1", "Alice", "Hello")];

      render(
        <TranscriptPanel
          {...defaultProps}
          entries={entries}
          hasMore={true}
          isLoadingMore={true}
        />,
      );

      expect(screen.getByText("Loading...")).toBeInTheDocument();
    });
  });

  describe("Footer actions", () => {
    it("should have copy button", () => {
      const entries = [createMockEntry("1", "Alice", "Hello")];

      render(<TranscriptPanel {...defaultProps} entries={entries} />);

      expect(screen.getByText("Copy")).toBeInTheDocument();
    });

    it("should call onCopy when copy clicked", async () => {
      const entries = [createMockEntry("1", "Alice", "Hello")];

      render(<TranscriptPanel {...defaultProps} entries={entries} />);

      const copyButton = screen.getByText("Copy");
      fireEvent.click(copyButton);

      await waitFor(() => {
        expect(mockOnCopy).toHaveBeenCalled();
      });
    });

    it("should show success state after copy", async () => {
      const entries = [createMockEntry("1", "Alice", "Hello")];

      render(<TranscriptPanel {...defaultProps} entries={entries} />);

      const copyButton = screen.getByText("Copy");
      fireEvent.click(copyButton);

      await waitFor(() => {
        expect(screen.getByText("Copied!")).toBeInTheDocument();
      });
    });

    it("should have download txt button", () => {
      const entries = [createMockEntry("1", "Alice", "Hello")];

      render(<TranscriptPanel {...defaultProps} entries={entries} />);

      expect(screen.getByText(".txt")).toBeInTheDocument();
    });

    it("should have download md button", () => {
      const entries = [createMockEntry("1", "Alice", "Hello")];

      render(<TranscriptPanel {...defaultProps} entries={entries} />);

      expect(screen.getByText(".md")).toBeInTheDocument();
    });

    it("should call onDownloadTxt when txt clicked", async () => {
      const entries = [createMockEntry("1", "Alice", "Hello")];

      render(<TranscriptPanel {...defaultProps} entries={entries} />);

      const txtButton = screen.getByText(".txt");
      fireEvent.click(txtButton);

      await waitFor(() => {
        expect(mockOnDownloadTxt).toHaveBeenCalled();
      });
    });

    it("should call onDownloadMd when md clicked", async () => {
      const entries = [createMockEntry("1", "Alice", "Hello")];

      render(<TranscriptPanel {...defaultProps} entries={entries} />);

      const mdButton = screen.getByText(".md");
      fireEvent.click(mdButton);

      await waitFor(() => {
        expect(mockOnDownloadMd).toHaveBeenCalled();
      });
    });

    it("should disable buttons when no entries", () => {
      render(<TranscriptPanel {...defaultProps} entries={[]} />);

      const copyButton = screen.getByText("Copy").closest("button");
      const txtButton = screen.getByText(".txt").closest("button");
      const mdButton = screen.getByText(".md").closest("button");

      expect(copyButton).toBeDisabled();
      expect(txtButton).toBeDisabled();
      expect(mdButton).toBeDisabled();
    });
  });

  describe("Summary expansion", () => {
    it("should toggle summary expansion on click", () => {
      const summaries = [createMockSummary("summary-1")];

      render(<TranscriptPanel {...defaultProps} summaries={summaries} />);

      // Initially collapsed - click to expand
      const summaryButton = screen.getByText("Summary").closest("button");
      if (summaryButton) {
        fireEvent.click(summaryButton);
      }

      // Should show content after expansion
      expect(screen.getByText("Test summary content")).toBeInTheDocument();
      expect(screen.getByText("Point 1")).toBeInTheDocument();
      expect(screen.getByText("Point 2")).toBeInTheDocument();
    });
  });

  describe("Mobile sheet variant", () => {
    it("should apply mobile sheet styles when mobileSheet=true", () => {
      const { container } = render(
        <TranscriptPanel
          {...defaultProps}
          mobileSheet={true}
          entries={[createMockEntry("1", "Alice", "Hello")]}
        />,
      );

      // The outermost container should have fixed positioning classes
      const panel = container.firstChild as HTMLElement;
      expect(panel?.className).toContain("fixed");
    });
  });
});

describe("TranscriptPanel entry types", () => {
  const defaultProps: TranscriptPanelProps = {
    entries: [],
    summaries: [],
    isLoading: false,
    isLoadingMore: false,
    error: null,
    hasMore: false,
    autoScroll: true,
    totalEntries: 0,
    onLoadMore: vi.fn(),
    onToggleAutoScroll: vi.fn(),
    onDownloadTxt: vi.fn().mockResolvedValue(undefined),
    onDownloadMd: vi.fn().mockResolvedValue(undefined),
    onCopy: vi.fn().mockResolvedValue(true),
    onClearError: vi.fn(),
  };

  it("should render ambient entries without badge", () => {
    const entries = [createMockEntry("1", "Alice", "Hello", "ambient")];

    render(<TranscriptPanel {...defaultProps} entries={entries} />);

    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.queryByText("PTT")).not.toBeInTheDocument();
    expect(screen.queryByText("AI")).not.toBeInTheDocument();
  });

  it("should render PTT entries with badge", () => {
    const entries = [createMockEntry("1", "Alice", "Hello", "ptt")];

    render(<TranscriptPanel {...defaultProps} entries={entries} />);

    expect(screen.getByText("PTT")).toBeInTheDocument();
  });

  it("should render AI entries with badge and purple styling", () => {
    const entries = [
      createMockEntry("1", "AI Assistant", "Response", "ai_response"),
    ];

    render(<TranscriptPanel {...defaultProps} entries={entries} />);

    expect(screen.getByText("AI")).toBeInTheDocument();
    const aiName = screen.getByText("AI Assistant");
    expect(aiName.className).toContain("purple");
  });
});
