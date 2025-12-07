/**
 * UsernameModal Component Tests
 *
 * Tests for the UsernameModal component which allows users to set
 * a vanity username that persists across sessions and is used by
 * the AI when addressing the user.
 *
 * Part of the Long-Horizon Engineering Protocol - FEAT-414
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  UsernameModal,
  type UsernameModalProps,
} from "@/components/room/UsernameModal";

// Helper to render with default props
function renderModal(props: Partial<UsernameModalProps> = {}) {
  const defaultProps: UsernameModalProps = {
    isOpen: true,
    currentName: "",
    onSave: vi.fn(),
    onClose: vi.fn(),
    ...props,
  };
  return render(<UsernameModal {...defaultProps} />);
}

describe("UsernameModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Rendering", () => {
    it("should render when isOpen is true", () => {
      renderModal({ isOpen: true });

      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(screen.getByText("Set Your Username")).toBeInTheDocument();
    });

    it("should not render when isOpen is false", () => {
      renderModal({ isOpen: false });

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("should display current name in input when provided", () => {
      renderModal({ currentName: "Alice" });

      const input = screen.getByLabelText("Username") as HTMLInputElement;
      expect(input.value).toBe("Alice");
    });

    it("should show character count", () => {
      renderModal({ currentName: "Test" });

      expect(screen.getByText("4/30")).toBeInTheDocument();
    });
  });

  describe("Input Validation", () => {
    it("should show error for empty username", async () => {
      const user = userEvent.setup();
      const onSave = vi.fn();
      renderModal({ currentName: "", onSave });

      const input = screen.getByLabelText("Username");
      await user.clear(input);
      await user.click(screen.getByRole("button", { name: "Save" }));

      expect(screen.getByText("Username cannot be empty")).toBeInTheDocument();
      expect(onSave).not.toHaveBeenCalled();
    });

    it("should show error for username too short", async () => {
      const user = userEvent.setup();
      const onSave = vi.fn();
      renderModal({ onSave });

      const input = screen.getByLabelText("Username");
      await user.type(input, "A");
      await user.click(screen.getByRole("button", { name: "Save" }));

      expect(
        screen.getByText("Username must be at least 2 characters"),
      ).toBeInTheDocument();
      expect(onSave).not.toHaveBeenCalled();
    });

    it("should show error for invalid characters", async () => {
      const user = userEvent.setup();
      const onSave = vi.fn();
      renderModal({ onSave });

      const input = screen.getByLabelText("Username");
      await user.type(input, "Test@User!");
      await user.click(screen.getByRole("button", { name: "Save" }));

      expect(
        screen.getByText(/can only contain letters, numbers/),
      ).toBeInTheDocument();
      expect(onSave).not.toHaveBeenCalled();
    });

    it("should allow valid usernames with spaces", async () => {
      const user = userEvent.setup();
      const onSave = vi.fn();
      renderModal({ onSave });

      const input = screen.getByLabelText("Username");
      await user.type(input, "John Doe");
      await user.click(screen.getByRole("button", { name: "Save" }));

      expect(onSave).toHaveBeenCalledWith("John Doe");
    });

    it("should allow valid usernames with hyphens and underscores", async () => {
      const user = userEvent.setup();
      const onSave = vi.fn();
      renderModal({ onSave });

      const input = screen.getByLabelText("Username");
      await user.type(input, "User-Name_123");
      await user.click(screen.getByRole("button", { name: "Save" }));

      expect(onSave).toHaveBeenCalledWith("User-Name_123");
    });

    it("should trim whitespace from username", async () => {
      const user = userEvent.setup();
      const onSave = vi.fn();
      renderModal({ onSave });

      const input = screen.getByLabelText("Username");
      await user.type(input, "  Alice  ");
      await user.click(screen.getByRole("button", { name: "Save" }));

      expect(onSave).toHaveBeenCalledWith("Alice");
    });
  });

  describe("User Interactions", () => {
    it("should call onSave with valid username when Save is clicked", async () => {
      const user = userEvent.setup();
      const onSave = vi.fn();
      renderModal({ onSave });

      const input = screen.getByLabelText("Username");
      await user.type(input, "NewUsername");
      await user.click(screen.getByRole("button", { name: "Save" }));

      expect(onSave).toHaveBeenCalledWith("NewUsername");
    });

    it("should call onClose when Cancel is clicked", async () => {
      const user = userEvent.setup();
      const onClose = vi.fn();
      renderModal({ onClose });

      await user.click(screen.getByRole("button", { name: "Cancel" }));

      expect(onClose).toHaveBeenCalledOnce();
    });

    it("should call onClose when X button is clicked", async () => {
      const user = userEvent.setup();
      const onClose = vi.fn();
      renderModal({ onClose });

      await user.click(screen.getByLabelText("Close"));

      expect(onClose).toHaveBeenCalledOnce();
    });

    it("should call onClose when backdrop is clicked", async () => {
      const user = userEvent.setup();
      const onClose = vi.fn();
      renderModal({ onClose });

      // Click the backdrop (first div with aria-hidden)
      const backdrop = document.querySelector('[aria-hidden="true"]');
      expect(backdrop).toBeInTheDocument();
      if (backdrop) {
        await user.click(backdrop);
      }

      expect(onClose).toHaveBeenCalledOnce();
    });

    it("should call onClose when Escape key is pressed", async () => {
      const user = userEvent.setup();
      const onClose = vi.fn();
      renderModal({ onClose });

      await user.keyboard("{Escape}");

      expect(onClose).toHaveBeenCalledOnce();
    });

    it("should disable Save button when input is empty", () => {
      renderModal({ currentName: "" });

      const saveButton = screen.getByRole("button", { name: "Save" });
      expect(saveButton).toBeDisabled();
    });

    it("should enable Save button when input has text", async () => {
      const user = userEvent.setup();
      renderModal({ currentName: "" });

      const input = screen.getByLabelText("Username");
      await user.type(input, "Test");

      const saveButton = screen.getByRole("button", { name: "Save" });
      expect(saveButton).not.toBeDisabled();
    });

    it("should clear error when user starts typing", async () => {
      const user = userEvent.setup();
      renderModal();

      const input = screen.getByLabelText("Username");
      await user.type(input, "A");
      await user.click(screen.getByRole("button", { name: "Save" }));

      // Error should be shown
      expect(
        screen.getByText("Username must be at least 2 characters"),
      ).toBeInTheDocument();

      // Type more characters
      await user.type(input, "lice");

      // Error should be cleared
      expect(
        screen.queryByText("Username must be at least 2 characters"),
      ).not.toBeInTheDocument();
    });
  });

  describe("Accessibility", () => {
    it("should have proper dialog role and modal attributes", () => {
      renderModal();

      const dialog = screen.getByRole("dialog");
      expect(dialog).toHaveAttribute("aria-modal", "true");
      expect(dialog).toHaveAttribute("aria-labelledby", "username-modal-title");
    });

    it("should have proper label for input", () => {
      renderModal();

      const input = screen.getByLabelText("Username");
      expect(input).toBeInTheDocument();
    });

    it("should mark input as invalid when there is an error", async () => {
      const user = userEvent.setup();
      renderModal();

      const input = screen.getByLabelText("Username");
      await user.type(input, "A");
      await user.click(screen.getByRole("button", { name: "Save" }));

      expect(input).toHaveAttribute("aria-invalid", "true");
    });

    it('should have error message with role="alert"', async () => {
      const user = userEvent.setup();
      renderModal();

      const input = screen.getByLabelText("Username");
      await user.type(input, "A");
      await user.click(screen.getByRole("button", { name: "Save" }));

      const errorMessage = screen.getByRole("alert");
      expect(errorMessage).toBeInTheDocument();
    });
  });

  describe("Form Submission", () => {
    it("should submit form on Enter key in input", async () => {
      const user = userEvent.setup();
      const onSave = vi.fn();
      renderModal({ onSave });

      const input = screen.getByLabelText("Username");
      await user.type(input, "TestUser{Enter}");

      expect(onSave).toHaveBeenCalledWith("TestUser");
    });
  });
});
