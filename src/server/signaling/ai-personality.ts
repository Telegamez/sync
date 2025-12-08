/**
 * AI Personality Configuration
 *
 * Manages AI personality presets and custom configurations for per-room AI setup.
 * Provides system instructions based on personality type.
 *
 * Part of the Long-Horizon Engineering Protocol - FEAT-305
 */

import type { RoomId } from "@/types/room";
import type { AIPersonality } from "@/types/room";

/**
 * Personality preset definition
 */
export interface PersonalityPreset {
  /** Personality identifier */
  id: AIPersonality;
  /** Display name */
  name: string;
  /** Short description */
  description: string;
  /** System instructions for the AI */
  instructions: string;
  /** Suggested voice for this personality */
  suggestedVoice?:
    | "alloy"
    | "echo"
    | "shimmer"
    | "ash"
    | "ballad"
    | "coral"
    | "sage"
    | "marin"
    | "verse";
  /** Suggested temperature (0-2) */
  suggestedTemperature?: number;
  /** Tags for categorization */
  tags?: string[];
}

/**
 * Room AI configuration
 */
export interface RoomAIConfig {
  /** Room ID */
  roomId: RoomId;
  /** Selected personality */
  personality: AIPersonality;
  /** Custom instructions (when personality is 'custom') */
  customInstructions?: string;
  /** Voice override */
  voice?:
    | "alloy"
    | "echo"
    | "shimmer"
    | "ash"
    | "ballad"
    | "coral"
    | "sage"
    | "marin"
    | "verse";
  /** Temperature override */
  temperature?: number;
  /** Additional context to append to instructions */
  additionalContext?: string;
  /** Room-specific participant context */
  participantContext?: string;
  /** When the config was last updated */
  updatedAt: Date;
}

/**
 * Personality change event
 */
export interface PersonalityChangeEvent {
  roomId: RoomId;
  previousPersonality: AIPersonality;
  newPersonality: AIPersonality;
  changedBy?: string;
  timestamp: Date;
}

/**
 * AI Personality Manager callbacks
 */
export interface AIPersonalityManagerCallbacks {
  /** Called when personality changes */
  onPersonalityChange?: (event: PersonalityChangeEvent) => void;
  /** Called when config is updated */
  onConfigUpdate?: (roomId: RoomId, config: RoomAIConfig) => void;
  /** Called when validation fails */
  onValidationError?: (roomId: RoomId, error: string) => void;
}

/**
 * AI Personality Manager options
 */
export interface AIPersonalityManagerOptions {
  /** Default personality for new rooms */
  defaultPersonality?: AIPersonality;
  /** Default voice */
  defaultVoice?:
    | "alloy"
    | "echo"
    | "shimmer"
    | "ash"
    | "ballad"
    | "coral"
    | "sage"
    | "marin"
    | "verse";
  /** Default temperature */
  defaultTemperature?: number;
  /** Maximum custom instructions length */
  maxCustomInstructionsLength?: number;
  /** Maximum additional context length */
  maxAdditionalContextLength?: number;
  /** Whether to allow custom personalities */
  allowCustomPersonality?: boolean;
}

/**
 * Default personality presets
 */
export const PERSONALITY_PRESETS: Record<
  Exclude<AIPersonality, "custom">,
  PersonalityPreset
> = {
  facilitator: {
    id: "facilitator",
    name: "Discussion Facilitator",
    description:
      "Guides discussions, summarizes points, and keeps conversations on track",
    instructions: `You're a discussion facilitator in a group voice chat. Keep things moving.

CRITICAL: Max 4 sentences per response. Be pithy and direct.

Your job: Keep discussions productive. Summarize when needed. Make sure everyone gets heard. Redirect tangents with a light touch.

Style: Inclusive ("we", "let's"), neutral, warm but efficient. No fluff — just facilitate.`,
    suggestedVoice: "marin",
    suggestedTemperature: 0.7,
    tags: ["professional", "meetings", "collaboration"],
  },

  assistant: {
    id: "assistant",
    name: "General Assistant",
    description: "Helpful general-purpose assistant for any conversation",
    instructions: `You're a helpful assistant in a group voice chat.

CRITICAL: Max 4 sentences per response. Short, punchy, conversational.

Answer questions directly. Help with tasks. Be friendly but efficient. If you don't know something, just say so — no hedging.

Skip the preamble. No "Great question!" or "I'd be happy to help!" Just answer.`,
    suggestedVoice: "marin",
    suggestedTemperature: 0.8,
    tags: ["general", "helpful", "versatile"],
  },

  expert: {
    id: "expert",
    name: "Domain Expert",
    description:
      "Technical depth and domain expertise for detailed discussions",
    instructions: `You're a domain expert in a group voice chat. Share knowledge concisely.

CRITICAL: Max 4 sentences per response. Dense with insight, light on words.

Give the essential technical info. Use precise terms but explain briefly if needed. Point out gotchas. If they want more depth, they'll ask.

No lectures. Just the good stuff, fast.`,
    suggestedVoice: "marin",
    suggestedTemperature: 0.6,
    tags: ["technical", "professional", "detailed"],
  },

  brainstorm: {
    id: "brainstorm",
    name: "Creative Partner",
    description: "Creative ideation partner for brainstorming sessions",
    instructions: `You're a creative brainstorm partner in a group voice chat. Spark ideas.

CRITICAL: Max 4 sentences per response. Quick bursts of creativity, not monologues.

Riff on ideas. "Yes, and..." everything. Throw out wild what-ifs. Make unexpected connections.

Energy high, words few. Let the group build on your sparks.`,
    suggestedVoice: "marin",
    suggestedTemperature: 1.0,
    tags: ["creative", "ideation", "innovation"],
  },
};

/**
 * Validation result
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * AI Personality Manager
 *
 * Manages AI personality configuration for rooms.
 */
export class AIPersonalityManager {
  private configs = new Map<RoomId, RoomAIConfig>();
  private callbacks: AIPersonalityManagerCallbacks;
  private options: Required<AIPersonalityManagerOptions>;

  constructor(
    options: AIPersonalityManagerOptions = {},
    callbacks: AIPersonalityManagerCallbacks = {},
  ) {
    this.callbacks = callbacks;
    this.options = {
      defaultPersonality: options.defaultPersonality ?? "assistant",
      defaultVoice: options.defaultVoice ?? "alloy",
      defaultTemperature: options.defaultTemperature ?? 0.8,
      maxCustomInstructionsLength: options.maxCustomInstructionsLength ?? 4000,
      maxAdditionalContextLength: options.maxAdditionalContextLength ?? 1000,
      allowCustomPersonality: options.allowCustomPersonality ?? true,
    };
  }

  /**
   * Initialize room with default or specified personality
   */
  initRoom(
    roomId: RoomId,
    personality?: AIPersonality,
    customInstructions?: string,
  ): void {
    const selectedPersonality = personality ?? this.options.defaultPersonality;

    // Validate custom personality
    if (
      selectedPersonality === "custom" &&
      !this.options.allowCustomPersonality
    ) {
      this.callbacks.onValidationError?.(
        roomId,
        "Custom personalities are not allowed",
      );
      return;
    }

    const config: RoomAIConfig = {
      roomId,
      personality: selectedPersonality,
      customInstructions:
        selectedPersonality === "custom" ? customInstructions : undefined,
      updatedAt: new Date(),
    };

    this.configs.set(roomId, config);
  }

  /**
   * Remove room configuration
   */
  removeRoom(roomId: RoomId): void {
    this.configs.delete(roomId);
  }

  /**
   * Get room configuration
   */
  getConfig(roomId: RoomId): RoomAIConfig | null {
    return this.configs.get(roomId) ?? null;
  }

  /**
   * Get all available personality presets
   */
  getPresets(): PersonalityPreset[] {
    return Object.values(PERSONALITY_PRESETS);
  }

  /**
   * Get a specific preset
   */
  getPreset(personality: AIPersonality): PersonalityPreset | null {
    if (personality === "custom") {
      return null;
    }
    return PERSONALITY_PRESETS[personality] ?? null;
  }

  /**
   * Set room personality
   */
  setPersonality(
    roomId: RoomId,
    personality: AIPersonality,
    customInstructions?: string,
    changedBy?: string,
  ): boolean {
    const config = this.configs.get(roomId);
    if (!config) {
      return false;
    }

    // Validate
    if (personality === "custom") {
      if (!this.options.allowCustomPersonality) {
        this.callbacks.onValidationError?.(
          roomId,
          "Custom personalities are not allowed",
        );
        return false;
      }
      if (!customInstructions || customInstructions.trim().length === 0) {
        this.callbacks.onValidationError?.(
          roomId,
          "Custom personality requires instructions",
        );
        return false;
      }
      if (
        customInstructions.length > this.options.maxCustomInstructionsLength
      ) {
        this.callbacks.onValidationError?.(
          roomId,
          `Custom instructions exceed maximum length of ${this.options.maxCustomInstructionsLength}`,
        );
        return false;
      }
    }

    const previousPersonality = config.personality;
    config.personality = personality;
    config.customInstructions =
      personality === "custom" ? customInstructions : undefined;
    config.updatedAt = new Date();

    // Notify change
    if (previousPersonality !== personality) {
      this.callbacks.onPersonalityChange?.({
        roomId,
        previousPersonality,
        newPersonality: personality,
        changedBy,
        timestamp: new Date(),
      });
    }

    this.callbacks.onConfigUpdate?.(roomId, config);
    return true;
  }

  /**
   * Set custom instructions (only for custom personality)
   */
  setCustomInstructions(roomId: RoomId, instructions: string): boolean {
    const config = this.configs.get(roomId);
    if (!config) {
      return false;
    }

    if (config.personality !== "custom") {
      this.callbacks.onValidationError?.(
        roomId,
        "Can only set custom instructions for custom personality",
      );
      return false;
    }

    const validation = this.validateCustomInstructions(instructions);
    if (!validation.valid) {
      validation.errors.forEach((error) => {
        this.callbacks.onValidationError?.(roomId, error);
      });
      return false;
    }

    config.customInstructions = instructions;
    config.updatedAt = new Date();
    this.callbacks.onConfigUpdate?.(roomId, config);
    return true;
  }

  /**
   * Set voice override
   */
  setVoice(
    roomId: RoomId,
    voice:
      | "alloy"
      | "echo"
      | "shimmer"
      | "ash"
      | "ballad"
      | "coral"
      | "sage"
      | "marin"
      | "verse",
  ): boolean {
    const config = this.configs.get(roomId);
    if (!config) {
      return false;
    }

    config.voice = voice;
    config.updatedAt = new Date();
    this.callbacks.onConfigUpdate?.(roomId, config);
    return true;
  }

  /**
   * Set temperature override
   */
  setTemperature(roomId: RoomId, temperature: number): boolean {
    const config = this.configs.get(roomId);
    if (!config) {
      return false;
    }

    if (temperature < 0 || temperature > 2) {
      this.callbacks.onValidationError?.(
        roomId,
        "Temperature must be between 0 and 2",
      );
      return false;
    }

    config.temperature = temperature;
    config.updatedAt = new Date();
    this.callbacks.onConfigUpdate?.(roomId, config);
    return true;
  }

  /**
   * Set additional context
   */
  setAdditionalContext(roomId: RoomId, context: string): boolean {
    const config = this.configs.get(roomId);
    if (!config) {
      return false;
    }

    if (context.length > this.options.maxAdditionalContextLength) {
      this.callbacks.onValidationError?.(
        roomId,
        `Additional context exceeds maximum length of ${this.options.maxAdditionalContextLength}`,
      );
      return false;
    }

    config.additionalContext = context;
    config.updatedAt = new Date();
    this.callbacks.onConfigUpdate?.(roomId, config);
    return true;
  }

  /**
   * Set participant context (names, roles, etc.)
   */
  setParticipantContext(roomId: RoomId, context: string): boolean {
    const config = this.configs.get(roomId);
    if (!config) {
      return false;
    }

    config.participantContext = context;
    config.updatedAt = new Date();
    this.callbacks.onConfigUpdate?.(roomId, config);
    return true;
  }

  /**
   * Generate full system instructions for a room
   */
  generateInstructions(roomId: RoomId): string | null {
    const config = this.configs.get(roomId);
    if (!config) {
      return null;
    }

    let baseInstructions: string;

    if (config.personality === "custom") {
      baseInstructions = config.customInstructions ?? "";
    } else {
      const preset = PERSONALITY_PRESETS[config.personality];
      baseInstructions = preset?.instructions ?? "";
    }

    // Build full instructions
    const parts: string[] = [baseInstructions];

    // Add participant context
    if (config.participantContext) {
      parts.push(
        `\nParticipants in this conversation:\n${config.participantContext}`,
      );
    }

    // Add additional context
    if (config.additionalContext) {
      parts.push(`\nAdditional context:\n${config.additionalContext}`);
    }

    return parts.join("\n");
  }

  /**
   * Get suggested voice for a room (considers personality preset)
   */
  getSuggestedVoice(
    roomId: RoomId,
  ):
    | "alloy"
    | "echo"
    | "shimmer"
    | "ash"
    | "ballad"
    | "coral"
    | "sage"
    | "marin"
    | "verse" {
    const config = this.configs.get(roomId);
    if (!config) {
      return this.options.defaultVoice;
    }

    // Voice override takes precedence
    if (config.voice) {
      return config.voice;
    }

    // Use personality suggestion
    if (config.personality !== "custom") {
      const preset = PERSONALITY_PRESETS[config.personality];
      if (preset?.suggestedVoice) {
        return preset.suggestedVoice;
      }
    }

    return this.options.defaultVoice;
  }

  /**
   * Get suggested temperature for a room (considers personality preset)
   */
  getSuggestedTemperature(roomId: RoomId): number {
    const config = this.configs.get(roomId);
    if (!config) {
      return this.options.defaultTemperature;
    }

    // Temperature override takes precedence
    if (config.temperature !== undefined) {
      return config.temperature;
    }

    // Use personality suggestion
    if (config.personality !== "custom") {
      const preset = PERSONALITY_PRESETS[config.personality];
      if (preset?.suggestedTemperature !== undefined) {
        return preset.suggestedTemperature;
      }
    }

    return this.options.defaultTemperature;
  }

  /**
   * Validate custom instructions
   */
  validateCustomInstructions(instructions: string): ValidationResult {
    const errors: string[] = [];

    if (!instructions || instructions.trim().length === 0) {
      errors.push("Custom instructions cannot be empty");
    }

    if (instructions.length > this.options.maxCustomInstructionsLength) {
      errors.push(
        `Custom instructions exceed maximum length of ${this.options.maxCustomInstructionsLength}`,
      );
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Validate a personality selection
   */
  validatePersonality(personality: AIPersonality): ValidationResult {
    const errors: string[] = [];
    const validPersonalities: AIPersonality[] = [
      "facilitator",
      "assistant",
      "expert",
      "brainstorm",
      "custom",
    ];

    if (!validPersonalities.includes(personality)) {
      errors.push(`Invalid personality: ${personality}`);
    }

    if (personality === "custom" && !this.options.allowCustomPersonality) {
      errors.push("Custom personalities are not allowed");
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Validate full room config
   */
  validateConfig(config: Partial<RoomAIConfig>): ValidationResult {
    const errors: string[] = [];

    if (config.personality) {
      const personalityValidation = this.validatePersonality(
        config.personality,
      );
      errors.push(...personalityValidation.errors);
    }

    if (config.customInstructions !== undefined) {
      const instructionsValidation = this.validateCustomInstructions(
        config.customInstructions,
      );
      errors.push(...instructionsValidation.errors);
    }

    if (config.temperature !== undefined) {
      if (config.temperature < 0 || config.temperature > 2) {
        errors.push("Temperature must be between 0 and 2");
      }
    }

    if (config.additionalContext !== undefined) {
      if (
        config.additionalContext.length >
        this.options.maxAdditionalContextLength
      ) {
        errors.push(
          `Additional context exceeds maximum length of ${this.options.maxAdditionalContextLength}`,
        );
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Get room count
   */
  getRoomCount(): number {
    return this.configs.size;
  }

  /**
   * Check if room exists
   */
  hasRoom(roomId: RoomId): boolean {
    return this.configs.has(roomId);
  }

  /**
   * Get all room IDs
   */
  getRoomIds(): RoomId[] {
    return Array.from(this.configs.keys());
  }

  /**
   * Export config for persistence
   */
  exportConfig(roomId: RoomId): RoomAIConfig | null {
    return this.configs.get(roomId) ?? null;
  }

  /**
   * Import config from persistence
   */
  importConfig(config: RoomAIConfig): void {
    this.configs.set(config.roomId, {
      ...config,
      updatedAt: new Date(config.updatedAt),
    });
  }

  /**
   * Clear all rooms
   */
  clear(): void {
    this.configs.clear();
  }

  /**
   * Dispose the manager
   */
  dispose(): void {
    this.clear();
  }
}

/**
 * Factory function
 */
export function createAIPersonalityManager(
  options?: AIPersonalityManagerOptions,
  callbacks?: AIPersonalityManagerCallbacks,
): AIPersonalityManager {
  return new AIPersonalityManager(options, callbacks);
}

export default AIPersonalityManager;
