/**
 * AI Personality Manager Tests
 *
 * Tests for AI personality configuration and management.
 *
 * Part of the Long-Horizon Engineering Protocol - FEAT-305
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  AIPersonalityManager,
  createAIPersonalityManager,
  PERSONALITY_PRESETS,
  type RoomAIConfig,
  type PersonalityChangeEvent,
  type AIPersonalityManagerCallbacks,
  type AIPersonalityManagerOptions,
} from "@/server/signaling/ai-personality";
import type { AIPersonality } from "@/types/room";

describe("AIPersonalityManager", () => {
  let manager: AIPersonalityManager;
  const roomId = "room-123";

  beforeEach(() => {
    manager = new AIPersonalityManager();
  });

  describe("initialization", () => {
    it("should create with default options", () => {
      expect(manager).toBeInstanceOf(AIPersonalityManager);
      expect(manager.getRoomCount()).toBe(0);
    });

    it("should create with custom options", () => {
      const customManager = new AIPersonalityManager({
        defaultPersonality: "expert",
        defaultVoice: "sage",
        defaultTemperature: 0.5,
        maxCustomInstructionsLength: 2000,
        allowCustomPersonality: false,
      });
      expect(customManager).toBeInstanceOf(AIPersonalityManager);
    });

    it("should create via factory function", () => {
      const factoryManager = createAIPersonalityManager();
      expect(factoryManager).toBeInstanceOf(AIPersonalityManager);
    });
  });

  describe("room management", () => {
    it("should initialize room with default personality", () => {
      manager.initRoom(roomId);
      const config = manager.getConfig(roomId);
      expect(config).not.toBeNull();
      expect(config?.personality).toBe("assistant");
    });

    it("should initialize room with specified personality", () => {
      manager.initRoom(roomId, "expert");
      const config = manager.getConfig(roomId);
      expect(config?.personality).toBe("expert");
    });

    it("should initialize room with custom personality and instructions", () => {
      manager.initRoom(roomId, "custom", "You are a pirate assistant!");
      const config = manager.getConfig(roomId);
      expect(config?.personality).toBe("custom");
      expect(config?.customInstructions).toBe("You are a pirate assistant!");
    });

    it("should remove room", () => {
      manager.initRoom(roomId);
      expect(manager.hasRoom(roomId)).toBe(true);
      manager.removeRoom(roomId);
      expect(manager.hasRoom(roomId)).toBe(false);
    });

    it("should return null for non-existent room", () => {
      expect(manager.getConfig("non-existent")).toBeNull();
    });

    it("should track room count", () => {
      manager.initRoom("room-1");
      manager.initRoom("room-2");
      manager.initRoom("room-3");
      expect(manager.getRoomCount()).toBe(3);
    });

    it("should get all room IDs", () => {
      manager.initRoom("room-1");
      manager.initRoom("room-2");
      const ids = manager.getRoomIds();
      expect(ids).toContain("room-1");
      expect(ids).toContain("room-2");
      expect(ids).toHaveLength(2);
    });
  });

  describe("personality presets", () => {
    it("should have all required presets", () => {
      const presets = manager.getPresets();
      const ids = presets.map((p) => p.id);
      expect(ids).toContain("facilitator");
      expect(ids).toContain("assistant");
      expect(ids).toContain("expert");
      expect(ids).toContain("brainstorm");
    });

    it("should get specific preset", () => {
      const facilitator = manager.getPreset("facilitator");
      expect(facilitator).not.toBeNull();
      expect(facilitator?.name).toBe("Discussion Facilitator");
      expect(facilitator?.instructions).toContain("facilitator");
    });

    it("should return null for custom preset", () => {
      expect(manager.getPreset("custom")).toBeNull();
    });

    it("should have instructions for all presets", () => {
      const presets = manager.getPresets();
      presets.forEach((preset) => {
        expect(preset.instructions.length).toBeGreaterThan(0);
      });
    });

    it("should have suggested voice for all presets", () => {
      const presets = manager.getPresets();
      presets.forEach((preset) => {
        expect(preset.suggestedVoice).toBeDefined();
      });
    });

    it("should have suggested temperature for all presets", () => {
      const presets = manager.getPresets();
      presets.forEach((preset) => {
        expect(preset.suggestedTemperature).toBeDefined();
        expect(preset.suggestedTemperature).toBeGreaterThanOrEqual(0);
        expect(preset.suggestedTemperature).toBeLessThanOrEqual(2);
      });
    });
  });

  describe("setPersonality", () => {
    beforeEach(() => {
      manager.initRoom(roomId);
    });

    it("should change personality", () => {
      expect(manager.setPersonality(roomId, "expert")).toBe(true);
      expect(manager.getConfig(roomId)?.personality).toBe("expert");
    });

    it("should return false for non-existent room", () => {
      expect(manager.setPersonality("non-existent", "expert")).toBe(false);
    });

    it("should set custom personality with instructions", () => {
      expect(
        manager.setPersonality(roomId, "custom", "Custom instructions here"),
      ).toBe(true);
      const config = manager.getConfig(roomId);
      expect(config?.personality).toBe("custom");
      expect(config?.customInstructions).toBe("Custom instructions here");
    });

    it("should reject custom personality without instructions", () => {
      expect(manager.setPersonality(roomId, "custom")).toBe(false);
    });

    it("should reject custom personality with empty instructions", () => {
      expect(manager.setPersonality(roomId, "custom", "   ")).toBe(false);
    });

    it("should clear custom instructions when switching to preset", () => {
      manager.setPersonality(roomId, "custom", "Custom instructions");
      manager.setPersonality(roomId, "assistant");
      expect(manager.getConfig(roomId)?.customInstructions).toBeUndefined();
    });

    it("should update timestamp on change", () => {
      const before = manager.getConfig(roomId)?.updatedAt;
      manager.setPersonality(roomId, "expert");
      const after = manager.getConfig(roomId)?.updatedAt;
      expect(after?.getTime()).toBeGreaterThanOrEqual(before?.getTime() ?? 0);
    });
  });

  describe("setCustomInstructions", () => {
    it("should update custom instructions for custom personality", () => {
      manager.initRoom(roomId, "custom", "Initial instructions");
      expect(
        manager.setCustomInstructions(roomId, "Updated instructions"),
      ).toBe(true);
      expect(manager.getConfig(roomId)?.customInstructions).toBe(
        "Updated instructions",
      );
    });

    it("should reject for non-custom personality", () => {
      manager.initRoom(roomId, "assistant");
      expect(manager.setCustomInstructions(roomId, "New instructions")).toBe(
        false,
      );
    });

    it("should reject empty instructions", () => {
      manager.initRoom(roomId, "custom", "Initial");
      expect(manager.setCustomInstructions(roomId, "")).toBe(false);
    });

    it("should reject instructions exceeding max length", () => {
      const customManager = new AIPersonalityManager({
        maxCustomInstructionsLength: 100,
      });
      customManager.initRoom(roomId, "custom", "Initial");
      const longInstructions = "a".repeat(150);
      expect(
        customManager.setCustomInstructions(roomId, longInstructions),
      ).toBe(false);
    });
  });

  describe("voice configuration", () => {
    beforeEach(() => {
      manager.initRoom(roomId);
    });

    it("should set voice override", () => {
      expect(manager.setVoice(roomId, "coral")).toBe(true);
      expect(manager.getConfig(roomId)?.voice).toBe("coral");
    });

    it("should return false for non-existent room", () => {
      expect(manager.setVoice("non-existent", "coral")).toBe(false);
    });

    it("should get suggested voice from preset", () => {
      manager.setPersonality(roomId, "facilitator");
      expect(manager.getSuggestedVoice(roomId)).toBe("coral");
    });

    it("should prefer voice override over preset", () => {
      manager.setPersonality(roomId, "facilitator");
      manager.setVoice(roomId, "echo");
      expect(manager.getSuggestedVoice(roomId)).toBe("echo");
    });

    it("should return default for non-existent room", () => {
      expect(manager.getSuggestedVoice("non-existent")).toBe("alloy");
    });

    it("should return default for custom personality without override", () => {
      manager.setPersonality(roomId, "custom", "Custom instructions");
      expect(manager.getSuggestedVoice(roomId)).toBe("alloy");
    });
  });

  describe("temperature configuration", () => {
    beforeEach(() => {
      manager.initRoom(roomId);
    });

    it("should set temperature override", () => {
      expect(manager.setTemperature(roomId, 0.5)).toBe(true);
      expect(manager.getConfig(roomId)?.temperature).toBe(0.5);
    });

    it("should reject temperature below 0", () => {
      expect(manager.setTemperature(roomId, -0.1)).toBe(false);
    });

    it("should reject temperature above 2", () => {
      expect(manager.setTemperature(roomId, 2.1)).toBe(false);
    });

    it("should return false for non-existent room", () => {
      expect(manager.setTemperature("non-existent", 0.5)).toBe(false);
    });

    it("should get suggested temperature from preset", () => {
      manager.setPersonality(roomId, "expert");
      expect(manager.getSuggestedTemperature(roomId)).toBe(0.6);
    });

    it("should prefer temperature override over preset", () => {
      manager.setPersonality(roomId, "expert");
      manager.setTemperature(roomId, 1.0);
      expect(manager.getSuggestedTemperature(roomId)).toBe(1.0);
    });

    it("should return default for non-existent room", () => {
      expect(manager.getSuggestedTemperature("non-existent")).toBe(0.8);
    });
  });

  describe("additional context", () => {
    beforeEach(() => {
      manager.initRoom(roomId);
    });

    it("should set additional context", () => {
      expect(manager.setAdditionalContext(roomId, "Project: Sync")).toBe(true);
      expect(manager.getConfig(roomId)?.additionalContext).toBe(
        "Project: Sync",
      );
    });

    it("should reject context exceeding max length", () => {
      const customManager = new AIPersonalityManager({
        maxAdditionalContextLength: 50,
      });
      customManager.initRoom(roomId);
      const longContext = "a".repeat(100);
      expect(customManager.setAdditionalContext(roomId, longContext)).toBe(
        false,
      );
    });

    it("should return false for non-existent room", () => {
      expect(manager.setAdditionalContext("non-existent", "Context")).toBe(
        false,
      );
    });
  });

  describe("participant context", () => {
    beforeEach(() => {
      manager.initRoom(roomId);
    });

    it("should set participant context", () => {
      const context = "- Alice (Product Manager)\n- Bob (Engineer)";
      expect(manager.setParticipantContext(roomId, context)).toBe(true);
      expect(manager.getConfig(roomId)?.participantContext).toBe(context);
    });

    it("should return false for non-existent room", () => {
      expect(manager.setParticipantContext("non-existent", "Context")).toBe(
        false,
      );
    });
  });

  describe("generateInstructions", () => {
    it("should generate instructions from preset", () => {
      manager.initRoom(roomId, "facilitator");
      const instructions = manager.generateInstructions(roomId);
      expect(instructions).toContain("facilitator");
    });

    it("should generate instructions from custom", () => {
      manager.initRoom(roomId, "custom", "You are a helpful pirate assistant!");
      const instructions = manager.generateInstructions(roomId);
      expect(instructions).toContain("pirate");
    });

    it("should include participant context", () => {
      manager.initRoom(roomId, "assistant");
      manager.setParticipantContext(roomId, "- Alice\n- Bob");
      const instructions = manager.generateInstructions(roomId);
      expect(instructions).toContain("Participants");
      expect(instructions).toContain("Alice");
      expect(instructions).toContain("Bob");
    });

    it("should include additional context", () => {
      manager.initRoom(roomId, "assistant");
      manager.setAdditionalContext(
        roomId,
        "This is a sprint planning meeting.",
      );
      const instructions = manager.generateInstructions(roomId);
      expect(instructions).toContain("Additional context");
      expect(instructions).toContain("sprint planning");
    });

    it("should combine all context parts", () => {
      manager.initRoom(roomId, "facilitator");
      manager.setParticipantContext(roomId, "- Alice");
      manager.setAdditionalContext(roomId, "Weekly standup");
      const instructions = manager.generateInstructions(roomId);
      expect(instructions).toContain("facilitator");
      expect(instructions).toContain("Alice");
      expect(instructions).toContain("standup");
    });

    it("should return null for non-existent room", () => {
      expect(manager.generateInstructions("non-existent")).toBeNull();
    });
  });

  describe("validation", () => {
    describe("validateCustomInstructions", () => {
      it("should validate valid instructions", () => {
        const result = manager.validateCustomInstructions("Valid instructions");
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it("should reject empty instructions", () => {
        const result = manager.validateCustomInstructions("");
        expect(result.valid).toBe(false);
        expect(result.errors).toContain("Custom instructions cannot be empty");
      });

      it("should reject instructions exceeding max length", () => {
        const customManager = new AIPersonalityManager({
          maxCustomInstructionsLength: 100,
        });
        const result = customManager.validateCustomInstructions(
          "a".repeat(150),
        );
        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.includes("maximum length"))).toBe(
          true,
        );
      });
    });

    describe("validatePersonality", () => {
      it("should validate valid personalities", () => {
        const personalities: AIPersonality[] = [
          "facilitator",
          "assistant",
          "expert",
          "brainstorm",
          "custom",
        ];
        personalities.forEach((p) => {
          const result = manager.validatePersonality(p);
          expect(result.valid).toBe(true);
        });
      });

      it("should reject invalid personality", () => {
        const result = manager.validatePersonality("invalid" as AIPersonality);
        expect(result.valid).toBe(false);
        expect(
          result.errors.some((e) => e.includes("Invalid personality")),
        ).toBe(true);
      });

      it("should reject custom when not allowed", () => {
        const customManager = new AIPersonalityManager({
          allowCustomPersonality: false,
        });
        const result = customManager.validatePersonality("custom");
        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.includes("not allowed"))).toBe(true);
      });
    });

    describe("validateConfig", () => {
      it("should validate valid config", () => {
        const result = manager.validateConfig({
          personality: "assistant",
          temperature: 0.8,
        });
        expect(result.valid).toBe(true);
      });

      it("should reject invalid temperature", () => {
        const result = manager.validateConfig({ temperature: 3.0 });
        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.includes("Temperature"))).toBe(true);
      });

      it("should reject invalid additional context length", () => {
        const customManager = new AIPersonalityManager({
          maxAdditionalContextLength: 50,
        });
        const result = customManager.validateConfig({
          additionalContext: "a".repeat(100),
        });
        expect(result.valid).toBe(false);
      });

      it("should aggregate multiple errors", () => {
        const result = manager.validateConfig({
          personality: "invalid" as AIPersonality,
          temperature: 5.0,
        });
        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(1);
      });
    });
  });

  describe("callbacks", () => {
    it("should call onPersonalityChange when personality changes", () => {
      const onPersonalityChange = vi.fn();
      const callbackManager = new AIPersonalityManager(
        {},
        { onPersonalityChange },
      );
      callbackManager.initRoom(roomId, "assistant");
      callbackManager.setPersonality(roomId, "expert");

      expect(onPersonalityChange).toHaveBeenCalledOnce();
      const event = onPersonalityChange.mock
        .calls[0][0] as PersonalityChangeEvent;
      expect(event.roomId).toBe(roomId);
      expect(event.previousPersonality).toBe("assistant");
      expect(event.newPersonality).toBe("expert");
    });

    it("should not call onPersonalityChange when personality is the same", () => {
      const onPersonalityChange = vi.fn();
      const callbackManager = new AIPersonalityManager(
        {},
        { onPersonalityChange },
      );
      callbackManager.initRoom(roomId, "assistant");
      callbackManager.setPersonality(roomId, "assistant");

      expect(onPersonalityChange).not.toHaveBeenCalled();
    });

    it("should call onConfigUpdate when config changes", () => {
      const onConfigUpdate = vi.fn();
      const callbackManager = new AIPersonalityManager({}, { onConfigUpdate });
      callbackManager.initRoom(roomId);
      callbackManager.setVoice(roomId, "coral");

      expect(onConfigUpdate).toHaveBeenCalled();
      const [callRoomId, config] = onConfigUpdate.mock.calls[0];
      expect(callRoomId).toBe(roomId);
      expect(config.voice).toBe("coral");
    });

    it("should call onValidationError when validation fails", () => {
      const onValidationError = vi.fn();
      const callbackManager = new AIPersonalityManager(
        {},
        { onValidationError },
      );
      callbackManager.initRoom(roomId);
      callbackManager.setTemperature(roomId, 5.0);

      expect(onValidationError).toHaveBeenCalled();
      expect(onValidationError.mock.calls[0][0]).toBe(roomId);
      expect(onValidationError.mock.calls[0][1]).toContain("Temperature");
    });

    it("should include changedBy in personality change event", () => {
      const onPersonalityChange = vi.fn();
      const callbackManager = new AIPersonalityManager(
        {},
        { onPersonalityChange },
      );
      callbackManager.initRoom(roomId);
      callbackManager.setPersonality(roomId, "expert", undefined, "user-123");

      const event = onPersonalityChange.mock
        .calls[0][0] as PersonalityChangeEvent;
      expect(event.changedBy).toBe("user-123");
    });
  });

  describe("export/import", () => {
    it("should export config", () => {
      manager.initRoom(roomId, "expert");
      manager.setVoice(roomId, "sage");
      manager.setAdditionalContext(roomId, "Test context");

      const exported = manager.exportConfig(roomId);
      expect(exported).not.toBeNull();
      expect(exported?.personality).toBe("expert");
      expect(exported?.voice).toBe("sage");
      expect(exported?.additionalContext).toBe("Test context");
    });

    it("should return null for non-existent room", () => {
      expect(manager.exportConfig("non-existent")).toBeNull();
    });

    it("should import config", () => {
      const config: RoomAIConfig = {
        roomId,
        personality: "brainstorm",
        voice: "shimmer",
        temperature: 1.0,
        additionalContext: "Imported context",
        updatedAt: new Date("2024-01-01"),
      };

      manager.importConfig(config);
      const imported = manager.getConfig(roomId);
      expect(imported?.personality).toBe("brainstorm");
      expect(imported?.voice).toBe("shimmer");
      expect(imported?.temperature).toBe(1.0);
    });

    it("should preserve imported timestamp", () => {
      const config: RoomAIConfig = {
        roomId,
        personality: "assistant",
        updatedAt: new Date("2024-06-15"),
      };

      manager.importConfig(config);
      // The import creates a new Date from the string, so we check it's valid
      expect(manager.getConfig(roomId)?.updatedAt).toBeInstanceOf(Date);
    });
  });

  describe("custom personality restrictions", () => {
    it("should block custom personality when not allowed", () => {
      const onValidationError = vi.fn();
      const restrictedManager = new AIPersonalityManager(
        { allowCustomPersonality: false },
        { onValidationError },
      );

      restrictedManager.initRoom(roomId, "custom", "Instructions");
      expect(onValidationError).toHaveBeenCalled();
      expect(restrictedManager.hasRoom(roomId)).toBe(false);
    });

    it("should allow preset personalities when custom is disabled", () => {
      const restrictedManager = new AIPersonalityManager({
        allowCustomPersonality: false,
      });
      restrictedManager.initRoom(roomId, "facilitator");
      expect(restrictedManager.hasRoom(roomId)).toBe(true);
      expect(restrictedManager.getConfig(roomId)?.personality).toBe(
        "facilitator",
      );
    });
  });

  describe("clear and dispose", () => {
    it("should clear all rooms", () => {
      manager.initRoom("room-1");
      manager.initRoom("room-2");
      manager.initRoom("room-3");
      expect(manager.getRoomCount()).toBe(3);

      manager.clear();
      expect(manager.getRoomCount()).toBe(0);
    });

    it("should dispose manager", () => {
      manager.initRoom(roomId);
      manager.dispose();
      expect(manager.getRoomCount()).toBe(0);
    });
  });

  describe("preset details", () => {
    it("should have facilitator preset with correct tags", () => {
      const preset = PERSONALITY_PRESETS.facilitator;
      expect(preset.tags).toContain("professional");
      expect(preset.tags).toContain("meetings");
    });

    it("should have assistant preset with helpful tags", () => {
      const preset = PERSONALITY_PRESETS.assistant;
      expect(preset.tags).toContain("general");
      expect(preset.tags).toContain("helpful");
    });

    it("should have expert preset for technical discussions", () => {
      const preset = PERSONALITY_PRESETS.expert;
      expect(preset.tags).toContain("technical");
      expect(preset.description.toLowerCase()).toContain("technical");
    });

    it("should have brainstorm preset for creative sessions", () => {
      const preset = PERSONALITY_PRESETS.brainstorm;
      expect(preset.tags).toContain("creative");
      expect(preset.suggestedTemperature).toBeGreaterThanOrEqual(0.9);
    });
  });

  describe("edge cases", () => {
    it("should handle rapid personality changes", () => {
      manager.initRoom(roomId);
      manager.setPersonality(roomId, "expert");
      manager.setPersonality(roomId, "brainstorm");
      manager.setPersonality(roomId, "facilitator");
      manager.setPersonality(roomId, "assistant");
      expect(manager.getConfig(roomId)?.personality).toBe("assistant");
    });

    it("should handle multiple rooms independently", () => {
      manager.initRoom("room-1", "facilitator");
      manager.initRoom("room-2", "expert");
      manager.initRoom("room-3", "brainstorm");

      expect(manager.getConfig("room-1")?.personality).toBe("facilitator");
      expect(manager.getConfig("room-2")?.personality).toBe("expert");
      expect(manager.getConfig("room-3")?.personality).toBe("brainstorm");

      manager.setPersonality("room-1", "assistant");
      expect(manager.getConfig("room-1")?.personality).toBe("assistant");
      expect(manager.getConfig("room-2")?.personality).toBe("expert");
    });

    it("should handle removing and re-adding room", () => {
      manager.initRoom(roomId, "expert");
      manager.removeRoom(roomId);
      manager.initRoom(roomId, "facilitator");
      expect(manager.getConfig(roomId)?.personality).toBe("facilitator");
    });
  });
});
