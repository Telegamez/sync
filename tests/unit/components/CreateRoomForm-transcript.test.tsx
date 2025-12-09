/**
 * CreateRoomForm Transcript Settings Tests
 *
 * Tests for FEAT-513: CreateRoomForm transcript settings integration.
 * Verifies transcript toggle, AI summaries, retention selection, and download options.
 *
 * Part of the Long-Horizon Engineering Protocol - FEAT-513
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CreateRoomForm } from "@/components/room/CreateRoomForm";
import type { CreateRoomRequest } from "@/types/room";
import { DEFAULT_TRANSCRIPT_SETTINGS } from "@/types/transcript";

describe("FEAT-513: CreateRoomForm Transcript Settings", () => {
  const mockOnSubmit = vi.fn();
  const mockOnCancel = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockOnSubmit.mockResolvedValue(undefined);
  });

  describe("Rendering", () => {
    it("should render transcript settings section", () => {
      render(<CreateRoomForm onSubmit={mockOnSubmit} />);

      expect(screen.getByText("Transcript Settings")).toBeInTheDocument();
    });

    it("should render all transcript setting controls", () => {
      render(<CreateRoomForm onSubmit={mockOnSubmit} />);

      expect(screen.getByText("Enable Transcript")).toBeInTheDocument();
      expect(screen.getByText("AI Summaries")).toBeInTheDocument();
      expect(screen.getByText("Retention Period")).toBeInTheDocument();
      expect(screen.getByText("Allow Download")).toBeInTheDocument();
    });

    it("should show helpful descriptions for each setting", () => {
      render(<CreateRoomForm onSubmit={mockOnSubmit} />);

      expect(
        screen.getByText("Record and save conversation history"),
      ).toBeInTheDocument();
      expect(
        screen.getByText("Generate periodic conversation summaries"),
      ).toBeInTheDocument();
      expect(
        screen.getByText("Participants can download transcript"),
      ).toBeInTheDocument();
    });
  });

  describe("Default values", () => {
    it("should have transcript enabled by default", () => {
      render(<CreateRoomForm onSubmit={mockOnSubmit} />);

      const toggle = screen.getByTestId("transcript-enabled-toggle");
      expect(toggle).toHaveAttribute(
        "aria-checked",
        String(DEFAULT_TRANSCRIPT_SETTINGS.enabled),
      );
    });

    it("should have summaries enabled by default", () => {
      render(<CreateRoomForm onSubmit={mockOnSubmit} />);

      const toggle = screen.getByTestId("summaries-enabled-toggle");
      expect(toggle).toHaveAttribute(
        "aria-checked",
        String(DEFAULT_TRANSCRIPT_SETTINGS.summariesEnabled),
      );
    });

    it("should have default retention period selected", () => {
      render(<CreateRoomForm onSubmit={mockOnSubmit} />);

      const select = screen.getByTestId(
        "retention-select",
      ) as HTMLSelectElement;
      expect(select.value).toBe(DEFAULT_TRANSCRIPT_SETTINGS.retention);
    });

    it("should have allow download enabled by default", () => {
      render(<CreateRoomForm onSubmit={mockOnSubmit} />);

      const toggle = screen.getByTestId("allow-download-toggle");
      expect(toggle).toHaveAttribute(
        "aria-checked",
        String(DEFAULT_TRANSCRIPT_SETTINGS.allowDownload),
      );
    });
  });

  describe("Enable Transcript toggle", () => {
    it("should toggle transcript enabled state", () => {
      render(<CreateRoomForm onSubmit={mockOnSubmit} />);

      const toggle = screen.getByTestId("transcript-enabled-toggle");
      const initialState = toggle.getAttribute("aria-checked") === "true";

      fireEvent.click(toggle);

      expect(toggle).toHaveAttribute("aria-checked", String(!initialState));
    });

    it("should disable other settings when transcript is disabled", () => {
      render(<CreateRoomForm onSubmit={mockOnSubmit} />);

      // Disable transcript
      const transcriptToggle = screen.getByTestId("transcript-enabled-toggle");
      if (transcriptToggle.getAttribute("aria-checked") === "true") {
        fireEvent.click(transcriptToggle);
      }

      // Check other controls are disabled
      const summariesToggle = screen.getByTestId("summaries-enabled-toggle");
      const retentionSelect = screen.getByTestId("retention-select");
      const downloadToggle = screen.getByTestId("allow-download-toggle");

      expect(summariesToggle).toBeDisabled();
      expect(retentionSelect).toBeDisabled();
      expect(downloadToggle).toBeDisabled();
    });

    it("should enable other settings when transcript is enabled", () => {
      render(<CreateRoomForm onSubmit={mockOnSubmit} />);

      // Ensure transcript is enabled
      const transcriptToggle = screen.getByTestId("transcript-enabled-toggle");
      if (transcriptToggle.getAttribute("aria-checked") === "false") {
        fireEvent.click(transcriptToggle);
      }

      // Check other controls are enabled
      const summariesToggle = screen.getByTestId("summaries-enabled-toggle");
      const retentionSelect = screen.getByTestId("retention-select");
      const downloadToggle = screen.getByTestId("allow-download-toggle");

      expect(summariesToggle).not.toBeDisabled();
      expect(retentionSelect).not.toBeDisabled();
      expect(downloadToggle).not.toBeDisabled();
    });
  });

  describe("AI Summaries toggle", () => {
    it("should toggle summaries enabled state", () => {
      render(<CreateRoomForm onSubmit={mockOnSubmit} />);

      // Ensure transcript is enabled first
      const transcriptToggle = screen.getByTestId("transcript-enabled-toggle");
      if (transcriptToggle.getAttribute("aria-checked") === "false") {
        fireEvent.click(transcriptToggle);
      }

      const toggle = screen.getByTestId("summaries-enabled-toggle");
      const initialState = toggle.getAttribute("aria-checked") === "true";

      fireEvent.click(toggle);

      expect(toggle).toHaveAttribute("aria-checked", String(!initialState));
    });
  });

  describe("Retention Period selection", () => {
    it("should show all retention options", () => {
      render(<CreateRoomForm onSubmit={mockOnSubmit} />);

      const select = screen.getByTestId("retention-select");
      const options = select.querySelectorAll("option");

      expect(options.length).toBe(3);
      expect(
        screen.getByText("Session Only - Deleted when room closes"),
      ).toBeInTheDocument();
      expect(
        screen.getByText("7 Days - Kept for one week"),
      ).toBeInTheDocument();
      expect(
        screen.getByText("30 Days - Kept for one month"),
      ).toBeInTheDocument();
    });

    it("should allow changing retention period", () => {
      render(<CreateRoomForm onSubmit={mockOnSubmit} />);

      const select = screen.getByTestId(
        "retention-select",
      ) as HTMLSelectElement;
      fireEvent.change(select, { target: { value: "30days" } });

      expect(select.value).toBe("30days");
    });
  });

  describe("Allow Download toggle", () => {
    it("should toggle allow download state", () => {
      render(<CreateRoomForm onSubmit={mockOnSubmit} />);

      // Ensure transcript is enabled first
      const transcriptToggle = screen.getByTestId("transcript-enabled-toggle");
      if (transcriptToggle.getAttribute("aria-checked") === "false") {
        fireEvent.click(transcriptToggle);
      }

      const toggle = screen.getByTestId("allow-download-toggle");
      const initialState = toggle.getAttribute("aria-checked") === "true";

      fireEvent.click(toggle);

      expect(toggle).toHaveAttribute("aria-checked", String(!initialState));
    });
  });

  describe("Form submission", () => {
    it("should include transcript settings in submit data", async () => {
      render(<CreateRoomForm onSubmit={mockOnSubmit} />);

      // Fill required field
      const nameInput = screen.getByPlaceholderText("Enter room name");
      fireEvent.change(nameInput, { target: { value: "Test Room" } });

      // Submit form
      const submitButton = screen.getByText("Create Room");
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalledWith(
          expect.objectContaining({
            name: "Test Room",
            transcriptSettings: expect.objectContaining({
              enabled: expect.any(Boolean),
              summariesEnabled: expect.any(Boolean),
              retention: expect.any(String),
              allowDownload: expect.any(Boolean),
            }),
          }),
        );
      });
    });

    it("should submit with modified transcript settings", async () => {
      render(<CreateRoomForm onSubmit={mockOnSubmit} />);

      // Fill required field
      const nameInput = screen.getByPlaceholderText("Enter room name");
      fireEvent.change(nameInput, { target: { value: "Test Room" } });

      // Modify transcript settings
      const transcriptToggle = screen.getByTestId("transcript-enabled-toggle");
      if (transcriptToggle.getAttribute("aria-checked") === "true") {
        fireEvent.click(transcriptToggle); // Disable transcript
      }

      // Submit form
      const submitButton = screen.getByText("Create Room");
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalledWith(
          expect.objectContaining({
            transcriptSettings: expect.objectContaining({
              enabled: false,
            }),
          }),
        );
      });
    });

    it("should submit with changed retention period", async () => {
      render(<CreateRoomForm onSubmit={mockOnSubmit} />);

      // Fill required field
      const nameInput = screen.getByPlaceholderText("Enter room name");
      fireEvent.change(nameInput, { target: { value: "Test Room" } });

      // Change retention
      const select = screen.getByTestId("retention-select");
      fireEvent.change(select, { target: { value: "30days" } });

      // Submit form
      const submitButton = screen.getByText("Create Room");
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalledWith(
          expect.objectContaining({
            transcriptSettings: expect.objectContaining({
              retention: "30days",
            }),
          }),
        );
      });
    });
  });

  describe("Initial values", () => {
    it("should respect initial transcript settings", () => {
      render(
        <CreateRoomForm
          onSubmit={mockOnSubmit}
          initialValues={{
            transcriptSettings: {
              enabled: false,
              summariesEnabled: false,
              retention: "30days",
              allowDownload: false,
            },
          }}
        />,
      );

      const transcriptToggle = screen.getByTestId("transcript-enabled-toggle");
      const summariesToggle = screen.getByTestId("summaries-enabled-toggle");
      const retentionSelect = screen.getByTestId(
        "retention-select",
      ) as HTMLSelectElement;
      const downloadToggle = screen.getByTestId("allow-download-toggle");

      expect(transcriptToggle).toHaveAttribute("aria-checked", "false");
      expect(summariesToggle).toHaveAttribute("aria-checked", "false");
      expect(retentionSelect.value).toBe("30days");
      expect(downloadToggle).toHaveAttribute("aria-checked", "false");
    });

    it("should apply partial initial values with defaults", () => {
      render(
        <CreateRoomForm
          onSubmit={mockOnSubmit}
          initialValues={{
            transcriptSettings: {
              retention: "7days",
            },
          }}
        />,
      );

      const retentionSelect = screen.getByTestId(
        "retention-select",
      ) as HTMLSelectElement;

      expect(retentionSelect.value).toBe("7days");
      // Other settings should use defaults
      const transcriptToggle = screen.getByTestId("transcript-enabled-toggle");
      expect(transcriptToggle).toHaveAttribute(
        "aria-checked",
        String(DEFAULT_TRANSCRIPT_SETTINGS.enabled),
      );
    });
  });

  describe("Accessibility", () => {
    it("should have proper role for toggle switches", () => {
      render(<CreateRoomForm onSubmit={mockOnSubmit} />);

      const switches = screen.getAllByRole("switch");
      expect(switches.length).toBe(3); // transcript, summaries, download
    });

    it("should have aria-checked attribute on toggles", () => {
      render(<CreateRoomForm onSubmit={mockOnSubmit} />);

      const transcriptToggle = screen.getByTestId("transcript-enabled-toggle");
      const summariesToggle = screen.getByTestId("summaries-enabled-toggle");
      const downloadToggle = screen.getByTestId("allow-download-toggle");

      expect(transcriptToggle).toHaveAttribute("aria-checked");
      expect(summariesToggle).toHaveAttribute("aria-checked");
      expect(downloadToggle).toHaveAttribute("aria-checked");
    });

    it("should have proper label for retention select", () => {
      render(<CreateRoomForm onSubmit={mockOnSubmit} />);

      const select = screen.getByLabelText(/Retention Period/);
      expect(select).toBeInTheDocument();
    });
  });

  describe("Disabled state during submission", () => {
    it("should disable all transcript controls during submission", async () => {
      mockOnSubmit.mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 100)),
      );

      render(<CreateRoomForm onSubmit={mockOnSubmit} />);

      // Fill required field
      const nameInput = screen.getByPlaceholderText("Enter room name");
      fireEvent.change(nameInput, { target: { value: "Test Room" } });

      // Submit form
      const submitButton = screen.getByText("Create Room");
      fireEvent.click(submitButton);

      // Check all transcript controls are disabled
      const transcriptToggle = screen.getByTestId("transcript-enabled-toggle");
      const summariesToggle = screen.getByTestId("summaries-enabled-toggle");
      const retentionSelect = screen.getByTestId("retention-select");
      const downloadToggle = screen.getByTestId("allow-download-toggle");

      expect(transcriptToggle).toBeDisabled();
      expect(summariesToggle).toBeDisabled();
      expect(retentionSelect).toBeDisabled();
      expect(downloadToggle).toBeDisabled();
    });
  });
});
