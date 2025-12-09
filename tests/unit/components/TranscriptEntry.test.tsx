/**
 * TranscriptEntry Component Tests
 *
 * Tests for FEAT-509: TranscriptEntry component.
 * Verifies entry type rendering, badges, timestamps, and interactions.
 *
 * Part of the Long-Horizon Engineering Protocol - FEAT-509
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  TranscriptEntry,
  TranscriptEntryCompact,
  type TranscriptEntryProps,
} from "@/components/room/TranscriptEntry";
import type { TranscriptEntry as TranscriptEntryType } from "@/types/transcript";

// Helper to create mock entries
function createMockEntry(
  id: string,
  speaker: string,
  content: string,
  type: "ambient" | "ptt" | "ai_response" | "system" = "ambient",
  options: Partial<TranscriptEntryType> = {},
): TranscriptEntryType {
  return {
    id,
    roomId: "room-123",
    timestamp: new Date("2024-12-09T10:00:00Z"),
    speaker,
    speakerId: type === "ai_response" || type === "system" ? null : "peer-1",
    content,
    type,
    ...options,
  };
}

describe("FEAT-509: TranscriptEntry Component", () => {
  describe("Ambient entries", () => {
    it("should render ambient entry without badge", () => {
      const entry = createMockEntry("1", "Alice", "Hello everyone", "ambient");

      render(<TranscriptEntry entry={entry} />);

      expect(screen.getByText("Alice")).toBeInTheDocument();
      expect(screen.getByText("Hello everyone")).toBeInTheDocument();
      // No badge for ambient
      expect(screen.queryByText("PTT")).not.toBeInTheDocument();
      expect(screen.queryByText("AI")).not.toBeInTheDocument();
    });

    it("should render speaker name in white", () => {
      const entry = createMockEntry("1", "Alice", "Hello", "ambient");

      render(<TranscriptEntry entry={entry} />);

      const speakerName = screen.getByText("Alice");
      expect(speakerName.className).toContain("text-white");
    });
  });

  describe("PTT entries", () => {
    it("should render PTT entry with microphone badge", () => {
      const entry = createMockEntry("1", "Bob", "Speaking via PTT", "ptt");

      render(<TranscriptEntry entry={entry} />);

      expect(screen.getByText("Bob")).toBeInTheDocument();
      expect(screen.getByText("Speaking via PTT")).toBeInTheDocument();
      expect(screen.getByText("PTT")).toBeInTheDocument();
    });

    it("should style PTT badge with blue color", () => {
      const entry = createMockEntry("1", "Bob", "PTT message", "ptt");

      render(<TranscriptEntry entry={entry} />);

      const badge = screen.getByText("PTT").parentElement;
      expect(badge?.className).toContain("bg-blue-500/20");
      expect(badge?.className).toContain("text-blue-400");
    });
  });

  describe("AI response entries", () => {
    it("should render AI response with robot badge", () => {
      const entry = createMockEntry(
        "1",
        "Assistant",
        "AI response text",
        "ai_response",
      );

      render(<TranscriptEntry entry={entry} />);

      expect(screen.getByText("Assistant")).toBeInTheDocument();
      expect(screen.getByText("AI response text")).toBeInTheDocument();
      expect(screen.getByText("AI")).toBeInTheDocument();
    });

    it("should style AI badge with purple color", () => {
      const entry = createMockEntry("1", "Bot", "Response", "ai_response");

      render(<TranscriptEntry entry={entry} />);

      const badge = screen.getByText("AI").parentElement;
      expect(badge?.className).toContain("bg-purple-500/20");
      expect(badge?.className).toContain("text-purple-400");
    });

    it("should style AI speaker name in purple", () => {
      const entry = createMockEntry(
        "1",
        "AI Assistant",
        "Hello",
        "ai_response",
      );

      render(<TranscriptEntry entry={entry} />);

      const speakerName = screen.getByText("AI Assistant");
      expect(speakerName.className).toContain("text-purple-300");
    });
  });

  describe("System entries", () => {
    it("should render system entry centered", () => {
      const entry = createMockEntry("1", "System", "User joined", "system");

      render(<TranscriptEntry entry={entry} />);

      expect(screen.getByText("User joined")).toBeInTheDocument();
      // System messages have centered container
      const container = screen.getByText("User joined").parentElement;
      expect(container?.className).toContain("justify-center");
    });

    it("should style system message in gray italic", () => {
      const entry = createMockEntry("1", "System", "User left", "system");

      render(<TranscriptEntry entry={entry} />);

      const message = screen.getByText("User left");
      expect(message.className).toContain("text-gray-500");
      expect(message.className).toContain("italic");
    });
  });

  describe("Timestamps", () => {
    it("should show relative time by default", () => {
      const entry = createMockEntry("1", "Alice", "Hello", "ambient");

      render(<TranscriptEntry entry={entry} />);

      // Should show relative time (depends on current time)
      // Check that some time indicator is present
      const timeElement = screen
        .getByText("Alice")
        .parentElement?.querySelector(".text-gray-500");
      expect(timeElement).toBeInTheDocument();
    });

    it("should show absolute time when relativeTime is false", () => {
      const entry = createMockEntry("1", "Alice", "Hello", "ambient");

      render(<TranscriptEntry entry={entry} relativeTime={false} />);

      // Should show formatted absolute time
      expect(screen.getByText(/AM|PM/)).toBeInTheDocument();
    });
  });

  describe("Own entry indicator", () => {
    it("should show (you) indicator for own entries", () => {
      const entry = createMockEntry("1", "Alice", "My message", "ambient");

      render(<TranscriptEntry entry={entry} isOwnEntry={true} />);

      expect(screen.getByText("(you)")).toBeInTheDocument();
    });

    it("should not show (you) for other entries", () => {
      const entry = createMockEntry("1", "Bob", "Other message", "ambient");

      render(<TranscriptEntry entry={entry} isOwnEntry={false} />);

      expect(screen.queryByText("(you)")).not.toBeInTheDocument();
    });
  });

  describe("Partial entries", () => {
    it("should show typing indicator for partial entries", () => {
      const entry = createMockEntry("1", "Alice", "Typing...", "ambient", {
        isPartial: true,
      });

      render(<TranscriptEntry entry={entry} />);

      expect(screen.getByText("(typing...)")).toBeInTheDocument();
    });

    it("should not show typing indicator for complete entries", () => {
      const entry = createMockEntry("1", "Alice", "Complete", "ambient", {
        isPartial: false,
      });

      render(<TranscriptEntry entry={entry} />);

      expect(screen.queryByText("(typing...)")).not.toBeInTheDocument();
    });
  });

  describe("Click handling", () => {
    it("should call onClick when clicked", () => {
      const entry = createMockEntry("1", "Alice", "Click me", "ambient");
      const handleClick = vi.fn();

      render(<TranscriptEntry entry={entry} onClick={handleClick} />);

      fireEvent.click(screen.getByText("Click me"));

      expect(handleClick).toHaveBeenCalledWith(entry);
    });

    it("should be keyboard accessible when clickable", () => {
      const entry = createMockEntry("1", "Alice", "Press Enter", "ambient");
      const handleClick = vi.fn();

      render(<TranscriptEntry entry={entry} onClick={handleClick} />);

      const container = screen.getByRole("button");
      fireEvent.keyDown(container, { key: "Enter" });

      expect(handleClick).toHaveBeenCalled();
    });

    it("should respond to space key when clickable", () => {
      const entry = createMockEntry("1", "Alice", "Press Space", "ambient");
      const handleClick = vi.fn();

      render(<TranscriptEntry entry={entry} onClick={handleClick} />);

      const container = screen.getByRole("button");
      fireEvent.keyDown(container, { key: " " });

      expect(handleClick).toHaveBeenCalled();
    });

    it("should not have button role when not clickable", () => {
      const entry = createMockEntry("1", "Alice", "Not clickable", "ambient");

      render(<TranscriptEntry entry={entry} />);

      expect(screen.queryByRole("button")).not.toBeInTheDocument();
    });
  });

  describe("System entry click handling", () => {
    it("should call onClick for system entries", () => {
      const entry = createMockEntry("1", "System", "User joined", "system");
      const handleClick = vi.fn();

      render(<TranscriptEntry entry={entry} onClick={handleClick} />);

      fireEvent.click(screen.getByText("User joined"));

      expect(handleClick).toHaveBeenCalledWith(entry);
    });
  });

  describe("Custom className", () => {
    it("should apply custom className", () => {
      const entry = createMockEntry("1", "Alice", "Hello", "ambient");

      const { container } = render(
        <TranscriptEntry entry={entry} className="custom-class" />,
      );

      expect(container.firstChild).toHaveClass("custom-class");
    });
  });
});

describe("TranscriptEntryCompact Component", () => {
  describe("Rendering", () => {
    it("should render compact ambient entry", () => {
      const entry = createMockEntry("1", "Alice", "Hello", "ambient");

      render(<TranscriptEntryCompact entry={entry} />);

      expect(screen.getByText("Alice")).toBeInTheDocument();
      expect(screen.getByText(/Hello/)).toBeInTheDocument();
    });

    it("should render compact PTT entry with badge", () => {
      const entry = createMockEntry("1", "Bob", "PTT message", "ptt");

      render(<TranscriptEntryCompact entry={entry} />);

      expect(screen.getByText("Bob")).toBeInTheDocument();
      expect(screen.getByText("[PTT]")).toBeInTheDocument();
    });

    it("should render compact AI entry with badge", () => {
      const entry = createMockEntry("1", "AI", "Response", "ai_response");

      render(<TranscriptEntryCompact entry={entry} />);

      expect(screen.getByText("AI")).toBeInTheDocument();
      expect(screen.getByText("[AI]")).toBeInTheDocument();
    });

    it("should render compact system entry inline", () => {
      const entry = createMockEntry("1", "System", "User joined", "system");

      render(<TranscriptEntryCompact entry={entry} />);

      expect(screen.getByText("User joined")).toBeInTheDocument();
      const message = screen.getByText("User joined");
      expect(message.className).toContain("italic");
    });
  });

  describe("Custom className", () => {
    it("should apply custom className", () => {
      const entry = createMockEntry("1", "Alice", "Hello", "ambient");

      const { container } = render(
        <TranscriptEntryCompact entry={entry} className="compact-custom" />,
      );

      expect(container.firstChild).toHaveClass("compact-custom");
    });
  });
});
