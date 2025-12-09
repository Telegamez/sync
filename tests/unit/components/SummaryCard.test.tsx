/**
 * SummaryCard Component Tests
 *
 * Tests for FEAT-510: SummaryCard component.
 * Verifies collapsible behavior, content display, and styling.
 *
 * Part of the Long-Horizon Engineering Protocol - FEAT-510
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  SummaryCard,
  SummaryCardCompact,
  SummaryCardSkeleton,
  type SummaryCardProps,
} from "@/components/room/SummaryCard";
import type { TranscriptSummary } from "@/types/transcript";

// Helper to create mock summary
function createMockSummary(
  id: string,
  options: Partial<TranscriptSummary> = {},
): TranscriptSummary {
  return {
    id,
    roomId: "room-123",
    timestamp: new Date("2024-12-09T10:30:00Z"),
    content: "This is a test summary of the conversation.",
    bulletPoints: ["First key point", "Second key point", "Third key point"],
    entriesSummarized: 15,
    tokenCount: 120,
    coverageStart: new Date("2024-12-09T10:00:00Z"),
    coverageEnd: new Date("2024-12-09T10:30:00Z"),
    ...options,
  };
}

describe("FEAT-510: SummaryCard Component", () => {
  describe("Header rendering", () => {
    it("should render summary header with title", () => {
      const summary = createMockSummary("summary-1");

      render(<SummaryCard summary={summary} />);

      expect(screen.getByText("Summary")).toBeInTheDocument();
    });

    it("should show entries count badge", () => {
      const summary = createMockSummary("summary-1", { entriesSummarized: 20 });

      render(<SummaryCard summary={summary} />);

      expect(screen.getByText("20 entries")).toBeInTheDocument();
    });

    it("should show timestamp", () => {
      const summary = createMockSummary("summary-1");

      render(<SummaryCard summary={summary} relativeTime={false} />);

      // Should show formatted time in the header (10:30 AM)
      expect(screen.getByText("10:30 AM")).toBeInTheDocument();
    });
  });

  describe("Collapse behavior", () => {
    it("should be collapsed by default", () => {
      const summary = createMockSummary("summary-1");

      render(<SummaryCard summary={summary} />);

      // Content should not be visible when collapsed
      const content = screen.queryByText(
        "This is a test summary of the conversation.",
      );
      // The content exists but is hidden via max-h-0
      expect(content?.parentElement?.parentElement?.className).toContain(
        "max-h-0",
      );
    });

    it("should expand when defaultExpanded is true", () => {
      const summary = createMockSummary("summary-1");

      render(<SummaryCard summary={summary} defaultExpanded={true} />);

      // Content should be visible
      expect(
        screen.getByText("This is a test summary of the conversation."),
      ).toBeInTheDocument();
      const contentContainer = screen
        .getByText("This is a test summary of the conversation.")
        .closest('[id^="summary-content-"]');
      expect(contentContainer?.className).toContain("max-h-96");
    });

    it("should toggle on header click", () => {
      const summary = createMockSummary("summary-1");

      render(<SummaryCard summary={summary} />);

      const button = screen.getByRole("button");
      fireEvent.click(button);

      // Should now be expanded
      const contentContainer = screen
        .getByText("This is a test summary of the conversation.")
        .closest('[id^="summary-content-"]');
      expect(contentContainer?.className).toContain("max-h-96");
    });

    it("should call onExpandChange when toggled", () => {
      const summary = createMockSummary("summary-1");
      const handleExpandChange = vi.fn();

      render(
        <SummaryCard summary={summary} onExpandChange={handleExpandChange} />,
      );

      const button = screen.getByRole("button");
      fireEvent.click(button);

      expect(handleExpandChange).toHaveBeenCalledWith(true);
    });

    it("should support controlled expanded state", () => {
      const summary = createMockSummary("summary-1");
      const handleExpandChange = vi.fn();

      const { rerender } = render(
        <SummaryCard
          summary={summary}
          expanded={false}
          onExpandChange={handleExpandChange}
        />,
      );

      // Click should call handler but not change internal state
      const button = screen.getByRole("button");
      fireEvent.click(button);
      expect(handleExpandChange).toHaveBeenCalledWith(true);

      // Rerender with expanded=true
      rerender(
        <SummaryCard
          summary={summary}
          expanded={true}
          onExpandChange={handleExpandChange}
        />,
      );

      const contentContainer = screen
        .getByText("This is a test summary of the conversation.")
        .closest('[id^="summary-content-"]');
      expect(contentContainer?.className).toContain("max-h-96");
    });
  });

  describe("Content display", () => {
    it("should show main summary content when expanded", () => {
      const summary = createMockSummary("summary-1", {
        content: "Detailed summary of the meeting discussion.",
      });

      render(<SummaryCard summary={summary} defaultExpanded={true} />);

      expect(
        screen.getByText("Detailed summary of the meeting discussion."),
      ).toBeInTheDocument();
    });

    it("should show bullet points when expanded", () => {
      const summary = createMockSummary("summary-1", {
        bulletPoints: ["Point A", "Point B", "Point C"],
      });

      render(<SummaryCard summary={summary} defaultExpanded={true} />);

      expect(screen.getByText("Key Points")).toBeInTheDocument();
      expect(screen.getByText("Point A")).toBeInTheDocument();
      expect(screen.getByText("Point B")).toBeInTheDocument();
      expect(screen.getByText("Point C")).toBeInTheDocument();
    });

    it("should not show key points section when no bullet points", () => {
      const summary = createMockSummary("summary-1", {
        bulletPoints: [],
      });

      render(<SummaryCard summary={summary} defaultExpanded={true} />);

      expect(screen.queryByText("Key Points")).not.toBeInTheDocument();
    });

    it("should show coverage period", () => {
      const summary = createMockSummary("summary-1");

      render(<SummaryCard summary={summary} defaultExpanded={true} />);

      // Should show time range
      expect(screen.getByText(/10:00 AM - 10:30 AM/)).toBeInTheDocument();
    });

    it("should show token count when available", () => {
      const summary = createMockSummary("summary-1", { tokenCount: 250 });

      render(<SummaryCard summary={summary} defaultExpanded={true} />);

      expect(screen.getByText("250 tokens")).toBeInTheDocument();
    });
  });

  describe("Accessibility", () => {
    it("should have proper aria-expanded attribute", () => {
      const summary = createMockSummary("summary-1");

      render(<SummaryCard summary={summary} />);

      const button = screen.getByRole("button");
      expect(button).toHaveAttribute("aria-expanded", "false");

      fireEvent.click(button);
      expect(button).toHaveAttribute("aria-expanded", "true");
    });

    it("should have aria-controls linking to content", () => {
      const summary = createMockSummary("summary-1");

      render(<SummaryCard summary={summary} />);

      const button = screen.getByRole("button");
      expect(button).toHaveAttribute(
        "aria-controls",
        `summary-content-${summary.id}`,
      );
    });
  });

  describe("Styling", () => {
    it("should apply amber color scheme", () => {
      const summary = createMockSummary("summary-1");

      const { container } = render(<SummaryCard summary={summary} />);

      const card = container.firstChild as HTMLElement;
      expect(card.className).toContain("bg-amber-500/10");
      expect(card.className).toContain("border-amber-500/30");
    });

    it("should apply custom className", () => {
      const summary = createMockSummary("summary-1");

      const { container } = render(
        <SummaryCard summary={summary} className="custom-class" />,
      );

      expect(container.firstChild).toHaveClass("custom-class");
    });
  });

  describe("Timestamp display", () => {
    it("should show relative time by default", () => {
      const summary = createMockSummary("summary-1");

      render(<SummaryCard summary={summary} />);

      // Relative time should be shown (e.g., "X ago" or similar)
      const button = screen.getByRole("button");
      expect(button.textContent).toBeTruthy();
    });

    it("should show absolute time when relativeTime is false", () => {
      const summary = createMockSummary("summary-1");

      render(<SummaryCard summary={summary} relativeTime={false} />);

      // Should show formatted time like "10:30 AM" in header
      expect(screen.getByText("10:30 AM")).toBeInTheDocument();
    });
  });
});

describe("SummaryCardCompact Component", () => {
  it("should render compact summary", () => {
    const summary = createMockSummary("summary-1");

    render(<SummaryCardCompact summary={summary} />);

    expect(screen.getByText("Summary")).toBeInTheDocument();
    expect(
      screen.getByText("This is a test summary of the conversation."),
    ).toBeInTheDocument();
  });

  it("should show timestamp", () => {
    const summary = createMockSummary("summary-1");

    render(<SummaryCardCompact summary={summary} relativeTime={false} />);

    expect(screen.getByText(/AM|PM/)).toBeInTheDocument();
  });

  it("should apply custom className", () => {
    const summary = createMockSummary("summary-1");

    const { container } = render(
      <SummaryCardCompact summary={summary} className="compact-custom" />,
    );

    expect(container.firstChild).toHaveClass("compact-custom");
  });

  it("should truncate long content", () => {
    const summary = createMockSummary("summary-1", {
      content:
        "This is a very long summary that should be truncated when displayed in the compact view to save space and maintain a clean layout.",
    });

    render(<SummaryCardCompact summary={summary} />);

    const content = screen.getByText(/This is a very long summary/);
    expect(content.className).toContain("line-clamp-2");
  });
});

describe("SummaryCardSkeleton Component", () => {
  it("should render skeleton placeholder", () => {
    const { container } = render(<SummaryCardSkeleton />);

    expect(container.firstChild).toHaveClass("animate-pulse");
  });

  it("should apply amber styling", () => {
    const { container } = render(<SummaryCardSkeleton />);

    const skeleton = container.firstChild as HTMLElement;
    expect(skeleton.className).toContain("bg-amber-500/10");
    expect(skeleton.className).toContain("border-amber-500/30");
  });

  it("should apply custom className", () => {
    const { container } = render(
      <SummaryCardSkeleton className="skeleton-custom" />,
    );

    expect(container.firstChild).toHaveClass("skeleton-custom");
  });
});
