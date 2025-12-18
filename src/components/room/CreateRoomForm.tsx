/**
 * CreateRoomForm Component
 *
 * Form for creating a new room with name, participants, AI, and transcript settings.
 *
 * Part of the Long-Horizon Engineering Protocol - FEAT-113
 * Updated in FEAT-513 to add transcript settings
 * Updated in FEAT-1007 to add voice selection
 */

"use client";

import React, { useState, useCallback, useMemo } from "react";
import {
  Loader2,
  Users,
  Bot,
  MessageSquare,
  Lightbulb,
  FileText,
  Clock,
  Volume2,
} from "lucide-react";
import type { CreateRoomRequest, AIPersonality } from "@/types/room";
import type { VoiceOption } from "@/types/voice-ai-provider";
import type {
  RoomTranscriptSettings,
  TranscriptRetention,
} from "@/types/transcript";
import { DEFAULT_TRANSCRIPT_SETTINGS } from "@/types/transcript";
import { VoiceSelector } from "./VoiceSelector";

/**
 * Props for the CreateRoomForm component
 */
export interface CreateRoomFormProps {
  /** Callback when form is submitted */
  onSubmit: (data: CreateRoomRequest) => void | Promise<void>;
  /** Callback when form is cancelled */
  onCancel?: () => void;
  /** Initial values for the form */
  initialValues?: Partial<CreateRoomRequest>;
  /** Whether to show the cancel button */
  showCancel?: boolean;
  /** Custom class name */
  className?: string;
}

/**
 * Form validation errors
 */
interface FormErrors {
  name?: string;
  description?: string;
  maxParticipants?: string;
  aiTopic?: string;
}

/**
 * AI Personality options
 */
const AI_PERSONALITIES: {
  value: AIPersonality;
  label: string;
  description: string;
}[] = [
  {
    value: "facilitator",
    label: "Facilitator",
    description: "Guides discussions, summarizes, keeps on track",
  },
  {
    value: "assistant",
    label: "Assistant",
    description: "General helpful assistant",
  },
  {
    value: "expert",
    label: "Expert",
    description: "Domain expert with technical depth",
  },
  {
    value: "brainstorm",
    label: "Brainstorm",
    description: "Creative ideation partner",
  },
];

/**
 * Participant count options
 */
const PARTICIPANT_OPTIONS = [2, 3, 4, 5, 6, 7, 8, 9, 10];

/**
 * Transcript retention options
 */
const RETENTION_OPTIONS: {
  value: TranscriptRetention;
  label: string;
  description: string;
}[] = [
  {
    value: "session",
    label: "Session Only",
    description: "Deleted when room closes",
  },
  {
    value: "7days",
    label: "7 Days",
    description: "Kept for one week",
  },
  {
    value: "30days",
    label: "30 Days",
    description: "Kept for one month",
  },
];

/**
 * Validation constants
 */
const ROOM_NAME_MIN = 2;
const ROOM_NAME_MAX = 100;
const DESCRIPTION_MAX = 500;
const AI_TOPIC_MAX = 200;

/**
 * Validate room name
 */
function validateName(name: string): string | undefined {
  const trimmed = name.trim();
  if (!trimmed) {
    return "Room name is required";
  }
  if (trimmed.length < ROOM_NAME_MIN) {
    return `Room name must be at least ${ROOM_NAME_MIN} characters`;
  }
  if (trimmed.length > ROOM_NAME_MAX) {
    return `Room name must be at most ${ROOM_NAME_MAX} characters`;
  }
  return undefined;
}

/**
 * Validate description
 */
function validateDescription(description: string): string | undefined {
  if (description.length > DESCRIPTION_MAX) {
    return `Description must be at most ${DESCRIPTION_MAX} characters`;
  }
  return undefined;
}

/**
 * Validate AI topic
 */
function validateAITopic(topic: string): string | undefined {
  if (topic.length > AI_TOPIC_MAX) {
    return `Topic must be at most ${AI_TOPIC_MAX} characters`;
  }
  return undefined;
}

/**
 * CreateRoomForm Component
 *
 * A form for creating new rooms with validation.
 *
 * @example
 * ```tsx
 * <CreateRoomForm
 *   onSubmit={async (data) => {
 *     const room = await createRoom(data);
 *     router.push(`/rooms/${room.id}`);
 *   }}
 *   onCancel={() => router.back()}
 *   showCancel
 * />
 * ```
 */
export function CreateRoomForm({
  onSubmit,
  onCancel,
  initialValues = {},
  showCancel = false,
  className = "",
}: CreateRoomFormProps) {
  // Form state
  const [name, setName] = useState(initialValues.name ?? "");
  const [description, setDescription] = useState(
    initialValues.description ?? "",
  );
  const [maxParticipants, setMaxParticipants] = useState(
    initialValues.maxParticipants ?? 4,
  );
  const [aiPersonality, setAIPersonality] = useState<AIPersonality>(
    initialValues.aiPersonality ?? "assistant",
  );
  const [aiVoice, setAIVoice] = useState<VoiceOption | undefined>(
    initialValues.aiVoice,
  );
  const [aiTopic, setAITopic] = useState(initialValues.aiTopic ?? "");

  // Transcript settings state
  const [transcriptEnabled, setTranscriptEnabled] = useState(
    initialValues.transcriptSettings?.enabled ??
      DEFAULT_TRANSCRIPT_SETTINGS.enabled,
  );
  const [summariesEnabled, setSummariesEnabled] = useState(
    initialValues.transcriptSettings?.summariesEnabled ??
      DEFAULT_TRANSCRIPT_SETTINGS.summariesEnabled,
  );
  const [retention, setRetention] = useState<TranscriptRetention>(
    initialValues.transcriptSettings?.retention ??
      DEFAULT_TRANSCRIPT_SETTINGS.retention,
  );
  const [allowDownload, setAllowDownload] = useState(
    initialValues.transcriptSettings?.allowDownload ??
      DEFAULT_TRANSCRIPT_SETTINGS.allowDownload,
  );

  // UI state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  /**
   * Validate all fields
   */
  const validateForm = useCallback((): FormErrors => {
    const newErrors: FormErrors = {};

    const nameError = validateName(name);
    if (nameError) newErrors.name = nameError;

    const descError = validateDescription(description);
    if (descError) newErrors.description = descError;

    const topicError = validateAITopic(aiTopic);
    if (topicError) newErrors.aiTopic = topicError;

    return newErrors;
  }, [name, description, aiTopic]);

  /**
   * Check if form is valid
   */
  const isValid = useMemo(() => {
    const formErrors = validateForm();
    return (
      Object.keys(formErrors).length === 0 &&
      name.trim().length >= ROOM_NAME_MIN
    );
  }, [validateForm, name]);

  /**
   * Handle field blur - validates immediately on blur
   */
  const handleBlur = useCallback(
    (field: "name" | "description" | "aiTopic") => {
      setTouched((prev) => ({ ...prev, [field]: true }));

      // Validate immediately on blur
      if (field === "name") {
        const error = validateName(name);
        setErrors((prev) => ({ ...prev, name: error }));
      } else if (field === "description") {
        const error = validateDescription(description);
        setErrors((prev) => ({ ...prev, description: error }));
      } else if (field === "aiTopic") {
        const error = validateAITopic(aiTopic);
        setErrors((prev) => ({ ...prev, aiTopic: error }));
      }
    },
    [name, description, aiTopic],
  );

  /**
   * Handle name change
   */
  const handleNameChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setName(value);
      if (touched.name) {
        const error = validateName(value);
        setErrors((prev) => ({ ...prev, name: error }));
      }
    },
    [touched.name],
  );

  /**
   * Handle description change
   */
  const handleDescriptionChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const value = e.target.value;
      setDescription(value);
      if (touched.description) {
        const error = validateDescription(value);
        setErrors((prev) => ({ ...prev, description: error }));
      }
    },
    [touched.description],
  );

  /**
   * Handle AI topic change
   */
  const handleAITopicChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setAITopic(value);
      if (touched.aiTopic) {
        const error = validateAITopic(value);
        setErrors((prev) => ({ ...prev, aiTopic: error }));
      }
    },
    [touched.aiTopic],
  );

  /**
   * Handle form submission
   */
  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      // Validate all fields
      const formErrors = validateForm();
      setErrors(formErrors);
      setTouched({ name: true, description: true, aiTopic: true });

      if (Object.keys(formErrors).length > 0) {
        return;
      }

      setIsSubmitting(true);

      try {
        const data: CreateRoomRequest = {
          name: name.trim(),
          description: description.trim() || undefined,
          maxParticipants,
          aiPersonality,
          aiVoice,
          aiTopic: aiTopic.trim() || undefined,
          transcriptSettings: {
            enabled: transcriptEnabled,
            summariesEnabled,
            retention,
            allowDownload,
          },
        };

        await onSubmit(data);
      } finally {
        setIsSubmitting(false);
      }
    },
    [
      name,
      description,
      maxParticipants,
      aiPersonality,
      aiVoice,
      aiTopic,
      transcriptEnabled,
      summariesEnabled,
      retention,
      allowDownload,
      validateForm,
      onSubmit,
    ],
  );

  return (
    <form
      onSubmit={handleSubmit}
      className={`flex flex-col gap-6 ${className}`}
      data-testid="create-room-form"
    >
      {/* Room Name */}
      <div className="flex flex-col gap-2">
        <label
          htmlFor="room-name"
          className="text-sm font-medium text-foreground"
        >
          Room Name <span className="text-red-400">*</span>
        </label>
        <input
          id="room-name"
          type="text"
          value={name}
          onChange={handleNameChange}
          onBlur={() => handleBlur("name")}
          placeholder="Enter room name"
          className={`px-4 py-2 bg-card border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 ${
            errors.name && touched.name ? "border-red-400" : "border-border"
          }`}
          disabled={isSubmitting}
          aria-invalid={errors.name && touched.name ? "true" : "false"}
          aria-describedby={
            errors.name && touched.name ? "name-error" : undefined
          }
        />
        {errors.name && touched.name && (
          <p id="name-error" className="text-sm text-red-400" role="alert">
            {errors.name}
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          {name.length}/{ROOM_NAME_MAX} characters
        </p>
      </div>

      {/* Description */}
      <div className="flex flex-col gap-2">
        <label
          htmlFor="room-description"
          className="text-sm font-medium text-foreground"
        >
          Description <span className="text-muted-foreground">(optional)</span>
        </label>
        <textarea
          id="room-description"
          value={description}
          onChange={handleDescriptionChange}
          onBlur={() => handleBlur("description")}
          placeholder="What's this room about?"
          rows={3}
          className={`px-4 py-2 bg-card border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none ${
            errors.description && touched.description
              ? "border-red-400"
              : "border-border"
          }`}
          disabled={isSubmitting}
          aria-invalid={
            errors.description && touched.description ? "true" : "false"
          }
          aria-describedby={
            errors.description && touched.description
              ? "description-error"
              : undefined
          }
        />
        {errors.description && touched.description && (
          <p
            id="description-error"
            className="text-sm text-red-400"
            role="alert"
          >
            {errors.description}
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          {description.length}/{DESCRIPTION_MAX} characters
        </p>
      </div>

      {/* Max Participants */}
      <div className="flex flex-col gap-2">
        <label
          htmlFor="max-participants"
          className="text-sm font-medium text-foreground flex items-center gap-2"
        >
          <Users className="w-4 h-4" />
          Max Participants
        </label>
        <select
          id="max-participants"
          value={maxParticipants}
          onChange={(e) => setMaxParticipants(Number(e.target.value))}
          className="px-4 py-2 bg-card border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
          disabled={isSubmitting}
        >
          {PARTICIPANT_OPTIONS.map((count) => (
            <option key={count} value={count}>
              {count} participants
            </option>
          ))}
        </select>
      </div>

      {/* AI Personality */}
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-foreground flex items-center gap-2">
          <Bot className="w-4 h-4" />
          AI Personality
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {AI_PERSONALITIES.map((personality) => (
            <button
              key={personality.value}
              type="button"
              onClick={() => setAIPersonality(personality.value)}
              disabled={isSubmitting}
              className={`flex flex-col items-start p-3 border rounded-lg text-left transition-colors ${
                aiPersonality === personality.value
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border hover:border-primary/50 text-muted-foreground hover:text-foreground"
              }`}
              aria-pressed={aiPersonality === personality.value}
            >
              <span className="font-medium text-sm">{personality.label}</span>
              <span className="text-xs opacity-75">
                {personality.description}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* AI Topic */}
      <div className="flex flex-col gap-2">
        <label
          htmlFor="ai-topic"
          className="text-sm font-medium text-foreground flex items-center gap-2"
        >
          <Lightbulb className="w-4 h-4" />
          Topic / Domain{" "}
          <span className="text-muted-foreground">(optional)</span>
        </label>
        <input
          id="ai-topic"
          type="text"
          value={aiTopic}
          onChange={handleAITopicChange}
          onBlur={() => handleBlur("aiTopic")}
          placeholder="e.g., real estate, software engineering, marketing strategy"
          className={`px-4 py-2 bg-card border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 ${
            errors.aiTopic && touched.aiTopic
              ? "border-red-400"
              : "border-border"
          }`}
          disabled={isSubmitting}
          aria-invalid={errors.aiTopic && touched.aiTopic ? "true" : "false"}
          aria-describedby={
            errors.aiTopic && touched.aiTopic
              ? "ai-topic-error"
              : "ai-topic-hint"
          }
        />
        {errors.aiTopic && touched.aiTopic ? (
          <p id="ai-topic-error" className="text-sm text-red-400" role="alert">
            {errors.aiTopic}
          </p>
        ) : (
          <p id="ai-topic-hint" className="text-xs text-muted-foreground">
            The AI will have deep expertise in this subject and tailor responses
            accordingly.
          </p>
        )}
      </div>

      {/* AI Voice Selection */}
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-foreground flex items-center gap-2">
          <Volume2 className="w-4 h-4" />
          AI Voice
        </label>
        <VoiceSelector
          value={aiVoice}
          onChange={setAIVoice}
          disabled={isSubmitting}
        />
      </div>

      {/* Transcript Settings */}
      <div className="flex flex-col gap-4 border-t border-border pt-6">
        <label className="text-sm font-medium text-foreground flex items-center gap-2">
          <FileText className="w-4 h-4" />
          Transcript Settings
        </label>

        {/* Enable Transcript */}
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-sm text-foreground">Enable Transcript</span>
            <span className="text-xs text-muted-foreground">
              Record and save conversation history
            </span>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={transcriptEnabled}
            onClick={() => setTranscriptEnabled(!transcriptEnabled)}
            disabled={isSubmitting}
            className={`relative w-11 h-6 rounded-full transition-colors ${
              transcriptEnabled ? "bg-primary" : "bg-muted"
            } disabled:opacity-50`}
            data-testid="transcript-enabled-toggle"
          >
            <span
              className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                transcriptEnabled ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </div>

        {/* AI Summaries - only when transcript enabled */}
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <span
              className={`text-sm ${transcriptEnabled ? "text-foreground" : "text-muted-foreground"}`}
            >
              AI Summaries
            </span>
            <span className="text-xs text-muted-foreground">
              Generate periodic conversation summaries
            </span>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={summariesEnabled}
            onClick={() => setSummariesEnabled(!summariesEnabled)}
            disabled={isSubmitting || !transcriptEnabled}
            className={`relative w-11 h-6 rounded-full transition-colors ${
              summariesEnabled && transcriptEnabled ? "bg-primary" : "bg-muted"
            } disabled:opacity-50`}
            data-testid="summaries-enabled-toggle"
          >
            <span
              className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                summariesEnabled && transcriptEnabled
                  ? "translate-x-5"
                  : "translate-x-0"
              }`}
            />
          </button>
        </div>

        {/* Retention Period */}
        <div className="flex flex-col gap-2">
          <label
            htmlFor="retention-select"
            className={`text-sm flex items-center gap-2 ${
              transcriptEnabled ? "text-foreground" : "text-muted-foreground"
            }`}
          >
            <Clock className="w-4 h-4" />
            Retention Period
          </label>
          <select
            id="retention-select"
            value={retention}
            onChange={(e) =>
              setRetention(e.target.value as TranscriptRetention)
            }
            disabled={isSubmitting || !transcriptEnabled}
            className="px-4 py-2 bg-card border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50"
            data-testid="retention-select"
          >
            {RETENTION_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label} - {option.description}
              </option>
            ))}
          </select>
        </div>

        {/* Allow Download */}
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <span
              className={`text-sm ${transcriptEnabled ? "text-foreground" : "text-muted-foreground"}`}
            >
              Allow Download
            </span>
            <span className="text-xs text-muted-foreground">
              Participants can download transcript
            </span>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={allowDownload}
            onClick={() => setAllowDownload(!allowDownload)}
            disabled={isSubmitting || !transcriptEnabled}
            className={`relative w-11 h-6 rounded-full transition-colors ${
              allowDownload && transcriptEnabled ? "bg-primary" : "bg-muted"
            } disabled:opacity-50`}
            data-testid="allow-download-toggle"
          >
            <span
              className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                allowDownload && transcriptEnabled
                  ? "translate-x-5"
                  : "translate-x-0"
              }`}
            />
          </button>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={isSubmitting || !isValid}
          className="flex-1 flex items-center justify-center gap-2 py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Creating...
            </>
          ) : (
            <>
              <MessageSquare className="w-4 h-4" />
              Create Room
            </>
          )}
        </button>

        {showCancel && onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className="px-6 py-3 border border-border rounded-lg text-foreground hover:bg-muted transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

export default CreateRoomForm;
