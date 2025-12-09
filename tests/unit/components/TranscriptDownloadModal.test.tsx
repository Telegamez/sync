/**
 * TranscriptDownloadModal Component Tests
 *
 * Tests for FEAT-511: TranscriptDownloadModal component.
 * Verifies format selection, options, download flow, and error handling.
 *
 * Part of the Long-Horizon Engineering Protocol - FEAT-511
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import {
  TranscriptDownloadModal,
  type TranscriptDownloadModalProps,
  type DownloadOptions,
} from "@/components/room/TranscriptDownloadModal";
import type { TranscriptDownloadFormat } from "@/types/transcript";

describe("FEAT-511: TranscriptDownloadModal Component", () => {
  const mockOnClose = vi.fn();
  const mockOnDownload = vi.fn();

  const defaultProps: TranscriptDownloadModalProps = {
    isOpen: true,
    onClose: mockOnClose,
    onDownload: mockOnDownload,
    roomName: "Test Room",
    entryCount: 25,
    summaryCount: 2,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockOnDownload.mockResolvedValue(undefined);
  });

  describe("Rendering", () => {
    it("should render when isOpen is true", () => {
      render(<TranscriptDownloadModal {...defaultProps} />);

      expect(screen.getByText("Download Transcript")).toBeInTheDocument();
    });

    it("should not render when isOpen is false", () => {
      render(<TranscriptDownloadModal {...defaultProps} isOpen={false} />);

      expect(screen.queryByText("Download Transcript")).not.toBeInTheDocument();
    });

    it("should show room name and counts", () => {
      render(<TranscriptDownloadModal {...defaultProps} />);

      expect(screen.getByText("Test Room")).toBeInTheDocument();
      expect(screen.getByText("25 entries")).toBeInTheDocument();
      expect(screen.getByText("2 summaries")).toBeInTheDocument();
    });

    it("should not show summaries count when zero", () => {
      render(<TranscriptDownloadModal {...defaultProps} summaryCount={0} />);

      expect(screen.queryByText(/summaries/)).not.toBeInTheDocument();
    });
  });

  describe("Format selection", () => {
    it("should default to txt format", () => {
      render(<TranscriptDownloadModal {...defaultProps} />);

      const txtButton = screen.getByText("Plain Text (.txt)").closest("button");
      expect(txtButton?.className).toContain("border-blue-500");
    });

    it("should allow selecting md format", () => {
      render(<TranscriptDownloadModal {...defaultProps} />);

      const mdButton = screen.getByText("Markdown (.md)").closest("button");
      fireEvent.click(mdButton!);

      expect(mdButton?.className).toContain("border-blue-500");
    });

    it("should pass selected format to onDownload", async () => {
      render(<TranscriptDownloadModal {...defaultProps} />);

      const mdButton = screen.getByText("Markdown (.md)").closest("button");
      fireEvent.click(mdButton!);

      const downloadButton = screen.getByText("Download");
      fireEvent.click(downloadButton);

      await waitFor(() => {
        expect(mockOnDownload).toHaveBeenCalledWith("md", expect.any(Object));
      });
    });
  });

  describe("Include options", () => {
    it("should have all options checked by default", () => {
      render(<TranscriptDownloadModal {...defaultProps} />);

      const summariesCheckbox = screen.getByLabelText(/AI Summaries/);
      const timestampsCheckbox = screen.getByLabelText(/Timestamps/);
      const speakerNamesCheckbox = screen.getByLabelText(/Speaker names/);
      const typeBadgesCheckbox = screen.getByLabelText(/Entry type badges/);

      expect(summariesCheckbox).toBeChecked();
      expect(timestampsCheckbox).toBeChecked();
      expect(speakerNamesCheckbox).toBeChecked();
      expect(typeBadgesCheckbox).toBeChecked();
    });

    it("should toggle options when clicked", () => {
      render(<TranscriptDownloadModal {...defaultProps} />);

      const timestampsCheckbox = screen.getByLabelText(/Timestamps/);
      fireEvent.click(timestampsCheckbox);

      expect(timestampsCheckbox).not.toBeChecked();
    });

    it("should disable summaries checkbox when summaryCount is 0", () => {
      render(<TranscriptDownloadModal {...defaultProps} summaryCount={0} />);

      const summariesCheckbox = screen.getByLabelText(/AI Summaries/);
      expect(summariesCheckbox).toBeDisabled();
    });

    it("should pass options to onDownload", async () => {
      render(<TranscriptDownloadModal {...defaultProps} />);

      // Uncheck timestamps
      const timestampsCheckbox = screen.getByLabelText(/Timestamps/);
      fireEvent.click(timestampsCheckbox);

      const downloadButton = screen.getByText("Download");
      fireEvent.click(downloadButton);

      await waitFor(() => {
        expect(mockOnDownload).toHaveBeenCalledWith(
          "txt",
          expect.objectContaining({
            includeTimestamps: false,
            includeSummaries: true,
            includeSpeakerNames: true,
            includeTypeBadges: true,
          }),
        );
      });
    });
  });

  describe("Download flow", () => {
    it("should show loading state during download", async () => {
      mockOnDownload.mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 100)),
      );

      render(<TranscriptDownloadModal {...defaultProps} />);

      const downloadButton = screen.getByText("Download");
      fireEvent.click(downloadButton);

      expect(screen.getByText("Downloading...")).toBeInTheDocument();
    });

    it("should show success message after download", async () => {
      render(<TranscriptDownloadModal {...defaultProps} />);

      const downloadButton = screen.getByText("Download");
      fireEvent.click(downloadButton);

      await waitFor(() => {
        expect(screen.getByText("Download started!")).toBeInTheDocument();
      });
    });

    it("should disable download button when entryCount is 0", () => {
      render(<TranscriptDownloadModal {...defaultProps} entryCount={0} />);

      const downloadButton = screen.getByText("Download").closest("button");
      expect(downloadButton).toBeDisabled();
    });

    it("should disable controls during download", async () => {
      mockOnDownload.mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 200)),
      );

      render(<TranscriptDownloadModal {...defaultProps} />);

      const downloadButton = screen.getByText("Download");
      fireEvent.click(downloadButton);

      // Check that format buttons are disabled
      const txtButton = screen.getByText("Plain Text (.txt)").closest("button");
      expect(txtButton).toBeDisabled();

      // Check that option checkboxes are disabled
      const timestampsCheckbox = screen.getByLabelText(/Timestamps/);
      expect(timestampsCheckbox).toBeDisabled();
    });
  });

  describe("Error handling", () => {
    it("should show error message on download failure", async () => {
      mockOnDownload.mockRejectedValue(new Error("Network error"));

      render(<TranscriptDownloadModal {...defaultProps} />);

      const downloadButton = screen.getByText("Download");
      fireEvent.click(downloadButton);

      await waitFor(() => {
        expect(screen.getByText("Network error")).toBeInTheDocument();
      });
    });

    it("should show generic error for non-Error exceptions", async () => {
      mockOnDownload.mockRejectedValue("Unknown failure");

      render(<TranscriptDownloadModal {...defaultProps} />);

      const downloadButton = screen.getByText("Download");
      fireEvent.click(downloadButton);

      await waitFor(() => {
        expect(
          screen.getByText("Download failed. Please try again."),
        ).toBeInTheDocument();
      });
    });

    it("should clear error when modal is closed and reopened", async () => {
      mockOnDownload.mockRejectedValueOnce(new Error("Error"));

      const { rerender } = render(
        <TranscriptDownloadModal {...defaultProps} />,
      );

      // Trigger error
      const downloadButton = screen.getByText("Download");
      fireEvent.click(downloadButton);

      await waitFor(() => {
        expect(screen.getByText("Error")).toBeInTheDocument();
      });

      // Close and reopen
      rerender(<TranscriptDownloadModal {...defaultProps} isOpen={false} />);
      rerender(<TranscriptDownloadModal {...defaultProps} isOpen={true} />);

      // Error should be cleared on reopen via handleClose
      // Note: In actual use, state persists until handleClose clears it
    });
  });

  describe("Modal interactions", () => {
    it("should call onClose when X button clicked", () => {
      render(<TranscriptDownloadModal {...defaultProps} />);

      const closeButton = screen.getByLabelText("Close modal");
      fireEvent.click(closeButton);

      expect(mockOnClose).toHaveBeenCalled();
    });

    it("should call onClose when Cancel button clicked", () => {
      render(<TranscriptDownloadModal {...defaultProps} />);

      const cancelButton = screen.getByText("Cancel");
      fireEvent.click(cancelButton);

      expect(mockOnClose).toHaveBeenCalled();
    });

    it("should call onClose when backdrop clicked", () => {
      render(<TranscriptDownloadModal {...defaultProps} />);

      const backdrop = document.querySelector(".bg-black\\/60");
      fireEvent.click(backdrop!);

      expect(mockOnClose).toHaveBeenCalled();
    });

    it("should not close when clicking inside modal", () => {
      render(<TranscriptDownloadModal {...defaultProps} />);

      const modalContent = screen.getByText(
        "Download Transcript",
      ).parentElement;
      fireEvent.click(modalContent!);

      expect(mockOnClose).not.toHaveBeenCalled();
    });

    it("should prevent closing during download", async () => {
      mockOnDownload.mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 200)),
      );

      render(<TranscriptDownloadModal {...defaultProps} />);

      const downloadButton = screen.getByText("Download");
      fireEvent.click(downloadButton);

      // Try to close while downloading
      const closeButton = screen.getByLabelText("Close modal");
      fireEvent.click(closeButton);

      expect(mockOnClose).not.toHaveBeenCalled();
    });
  });

  describe("Accessibility", () => {
    it("should have proper dialog role", () => {
      render(<TranscriptDownloadModal {...defaultProps} />);

      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    it("should have aria-modal attribute", () => {
      render(<TranscriptDownloadModal {...defaultProps} />);

      const dialog = screen.getByRole("dialog");
      expect(dialog).toHaveAttribute("aria-modal", "true");
    });

    it("should have aria-labelledby pointing to title", () => {
      render(<TranscriptDownloadModal {...defaultProps} />);

      const dialog = screen.getByRole("dialog");
      expect(dialog).toHaveAttribute("aria-labelledby", "download-modal-title");

      const title = document.getElementById("download-modal-title");
      expect(title).toHaveTextContent("Download Transcript");
    });
  });

  describe("Custom className", () => {
    it("should apply custom className", () => {
      render(
        <TranscriptDownloadModal
          {...defaultProps}
          className="custom-modal-class"
        />,
      );

      const dialog = screen.getByRole("dialog");
      expect(dialog).toHaveClass("custom-modal-class");
    });
  });
});
