/**
 * UsernameModal Component
 *
 * Modal for setting or editing a vanity username that persists across sessions.
 * The username is displayed in the room UI and used by the AI when addressing the user.
 *
 * Part of the Long-Horizon Engineering Protocol - FEAT-414
 */

"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { X } from "lucide-react";

/**
 * Username validation result
 */
interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validate username
 * - 2-30 characters
 * - Letters, numbers, spaces, hyphens, underscores allowed
 * - Cannot be empty or just whitespace
 */
function validateUsername(name: string): ValidationResult {
  const trimmed = name.trim();

  if (!trimmed) {
    return { valid: false, error: "Username cannot be empty" };
  }

  if (trimmed.length < 2) {
    return { valid: false, error: "Username must be at least 2 characters" };
  }

  if (trimmed.length > 30) {
    return { valid: false, error: "Username must be 30 characters or less" };
  }

  // Allow letters, numbers, spaces, hyphens, underscores
  const validPattern = /^[a-zA-Z0-9\s\-_]+$/;
  if (!validPattern.test(trimmed)) {
    return {
      valid: false,
      error:
        "Username can only contain letters, numbers, spaces, hyphens, and underscores",
    };
  }

  return { valid: true };
}

/**
 * UsernameModal props
 */
export interface UsernameModalProps {
  /** Whether the modal is open */
  isOpen: boolean;
  /** Current username (for editing) */
  currentName?: string;
  /** Callback when username is saved */
  onSave: (name: string) => void;
  /** Callback when modal is closed */
  onClose: () => void;
}

/**
 * UsernameModal Component
 *
 * @example
 * ```tsx
 * <UsernameModal
 *   isOpen={showModal}
 *   currentName="Alice"
 *   onSave={(name) => handleUsernameChange(name)}
 *   onClose={() => setShowModal(false)}
 * />
 * ```
 */
export function UsernameModal({
  isOpen,
  currentName = "",
  onSave,
  onClose,
}: UsernameModalProps) {
  const [username, setUsername] = useState(currentName);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setUsername(currentName);
      setError(null);
      // Focus input after a short delay to allow modal animation
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 100);
    }
  }, [isOpen, currentName]);

  // Handle input change
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setUsername(value);

      // Clear error when user starts typing
      if (error) {
        setError(null);
      }
    },
    [error],
  );

  // Handle form submit
  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();

      const trimmed = username.trim();
      const validation = validateUsername(trimmed);

      if (!validation.valid) {
        setError(validation.error || "Invalid username");
        return;
      }

      onSave(trimmed);
    },
    [username, onSave],
  );

  // Handle escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen, onClose]);

  // Don't render if not open
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="username-modal-title"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div className="relative bg-card border border-border rounded-lg shadow-lg w-full max-w-md mx-4 p-6">
        {/* Close button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Title */}
        <h2
          id="username-modal-title"
          className="text-xl font-semibold text-foreground mb-2"
        >
          Set Your Username
        </h2>

        {/* Description */}
        <p className="text-sm text-muted-foreground mb-6">
          Choose a username that will be displayed to other participants and
          used by the AI when addressing you.
        </p>

        {/* Form */}
        <form onSubmit={handleSubmit}>
          <div className="space-y-4">
            {/* Input */}
            <div>
              <label
                htmlFor="username-input"
                className="block text-sm font-medium text-foreground mb-2"
              >
                Username
              </label>
              <input
                ref={inputRef}
                id="username-input"
                type="text"
                value={username}
                onChange={handleChange}
                placeholder="Enter your username"
                maxLength={30}
                className={`
                  w-full px-4 py-3 rounded-lg border bg-background text-foreground
                  placeholder:text-muted-foreground
                  focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent
                  transition-colors
                  ${error ? "border-red-500 focus:ring-red-500" : "border-border"}
                `}
                aria-invalid={!!error}
                aria-describedby={error ? "username-error" : undefined}
              />

              {/* Character count */}
              <div className="flex justify-between mt-1">
                <div>
                  {error && (
                    <p
                      id="username-error"
                      className="text-sm text-red-500"
                      role="alert"
                    >
                      {error}
                    </p>
                  )}
                </div>
                <span className="text-xs text-muted-foreground">
                  {username.length}/30
                </span>
              </div>
            </div>

            {/* Buttons */}
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-3 rounded-lg border border-border text-foreground font-medium hover:bg-muted transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!username.trim()}
                className="flex-1 px-4 py-3 rounded-lg bg-primary text-primary-foreground font-medium hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Save
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

export default UsernameModal;
