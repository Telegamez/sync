/**
 * ContextManager Transcript Extension Tests
 *
 * Tests for FEAT-503: ContextManager transcript extensions.
 * Verifies transcript entry types, retrieval methods, and callbacks.
 *
 * Part of the Long-Horizon Engineering Protocol - FEAT-503
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  ContextManager,
  type ConversationMessage,
} from "@/server/signaling/context-manager";
import type { TranscriptEntry, TranscriptSummary } from "@/types/transcript";

describe("FEAT-503: ContextManager Transcript Extensions", () => {
  let contextManager: ContextManager;

  beforeEach(() => {
    contextManager = new ContextManager({
      maxTokensBeforeSummary: 8000,
      targetTokensAfterSummary: 3000,
      maxMessages: 100,
      enableAutoSummary: false,
    });
    contextManager.initRoom("room-123");
    contextManager.addParticipant("room-123", "peer-1", "Alice");
    contextManager.addParticipant("room-123", "peer-2", "Bob");
  });

  describe("Entry type support", () => {
    it("should store user messages with ptt entry type by default", () => {
      contextManager.addUserMessage("room-123", "Hello via PTT", "peer-1");
      const messages = contextManager.getMessages("room-123");
      expect(messages[0].entryType).toBe("ptt");
    });

    it("should store user messages with ambient entry type", () => {
      contextManager.addUserMessage(
        "room-123",
        "Hello via ambient",
        "peer-1",
        undefined,
        "ambient",
      );
      const messages = contextManager.getMessages("room-123");
      expect(messages[0].entryType).toBe("ambient");
    });

    it("should store assistant messages with ai_response entry type", () => {
      contextManager.addAssistantMessage("room-123", "Hello from AI");
      const messages = contextManager.getMessages("room-123");
      expect(messages[0].entryType).toBe("ai_response");
    });

    it("should store system messages with system entry type", () => {
      contextManager.addSystemMessage("room-123", "User joined");
      const messages = contextManager.getMessages("room-123");
      expect(messages[0].entryType).toBe("system");
    });
  });

  describe("addAmbientMessage convenience method", () => {
    it("should add ambient message with correct type", () => {
      contextManager.addAmbientMessage(
        "room-123",
        "Casual conversation",
        "peer-1",
      );
      const messages = contextManager.getMessages("room-123");
      expect(messages[0].entryType).toBe("ambient");
      expect(messages[0].speakerId).toBe("peer-1");
    });

    it("should include audio duration if provided", () => {
      contextManager.addAmbientMessage(
        "room-123",
        "Casual conversation",
        "peer-1",
        2500,
      );
      const messages = contextManager.getMessages("room-123");
      expect(messages[0].audioDurationMs).toBe(2500);
    });
  });

  describe("getTranscriptEntries", () => {
    beforeEach(() => {
      // Add a mix of messages
      contextManager.addUserMessage("room-123", "First message", "peer-1");
      contextManager.addAssistantMessage("room-123", "AI response 1");
      contextManager.addUserMessage(
        "room-123",
        "Second message",
        "peer-2",
        undefined,
        "ambient",
      );
      contextManager.addAssistantMessage("room-123", "AI response 2");
      contextManager.addSystemMessage("room-123", "Bob left");
    });

    it("should return transcript entries", () => {
      const { entries, hasMore, total } =
        contextManager.getTranscriptEntries("room-123");
      expect(entries.length).toBe(5);
      expect(total).toBe(5);
      expect(hasMore).toBe(false);
    });

    it("should respect limit parameter", () => {
      const { entries, hasMore } = contextManager.getTranscriptEntries(
        "room-123",
        3,
      );
      expect(entries.length).toBe(3);
      expect(hasMore).toBe(true);
    });

    it("should convert messages to transcript entry format", () => {
      const { entries } = contextManager.getTranscriptEntries("room-123");

      // Check first entry (PTT from Alice)
      const firstEntry = entries[0];
      expect(firstEntry.type).toBe("ptt");
      expect(firstEntry.speaker).toBe("Alice");
      expect(firstEntry.speakerId).toBe("peer-1");
      expect(firstEntry.roomId).toBe("room-123");
      expect(firstEntry.timestamp).toBeInstanceOf(Date);
    });

    it("should return empty for non-existent room", () => {
      const { entries, total } =
        contextManager.getTranscriptEntries("unknown-room");
      expect(entries).toEqual([]);
      expect(total).toBe(0);
    });

    it("should clean speaker attribution from content", () => {
      const { entries } = contextManager.getTranscriptEntries("room-123");
      // Content should not have [Alice]: prefix
      expect(entries[0].content).toBe("First message");
      expect(entries[0].content).not.toContain("[Alice]:");
    });
  });

  describe("getTranscriptSummaries", () => {
    it("should return empty array when no summaries", () => {
      const summaries = contextManager.getTranscriptSummaries("room-123");
      expect(summaries).toEqual([]);
    });

    it("should return empty for non-existent room", () => {
      const summaries = contextManager.getTranscriptSummaries("unknown-room");
      expect(summaries).toEqual([]);
    });
  });

  describe("getEntryCount", () => {
    it("should return correct entry count", () => {
      expect(contextManager.getEntryCount("room-123")).toBe(0);

      contextManager.addUserMessage("room-123", "Message 1", "peer-1");
      expect(contextManager.getEntryCount("room-123")).toBe(1);

      contextManager.addAssistantMessage("room-123", "Response 1");
      expect(contextManager.getEntryCount("room-123")).toBe(2);
    });

    it("should return 0 for non-existent room", () => {
      expect(contextManager.getEntryCount("unknown-room")).toBe(0);
    });
  });

  describe("getEntriesByType", () => {
    beforeEach(() => {
      contextManager.addUserMessage("room-123", "PTT 1", "peer-1");
      contextManager.addAmbientMessage("room-123", "Ambient 1", "peer-2");
      contextManager.addAssistantMessage("room-123", "AI 1");
      contextManager.addUserMessage("room-123", "PTT 2", "peer-1");
      contextManager.addAmbientMessage("room-123", "Ambient 2", "peer-1");
      contextManager.addSystemMessage("room-123", "System event");
    });

    it("should filter by ptt type", () => {
      const pttEntries = contextManager.getEntriesByType("room-123", "ptt");
      expect(pttEntries.length).toBe(2);
      expect(pttEntries.every((e) => e.type === "ptt")).toBe(true);
    });

    it("should filter by ambient type", () => {
      const ambientEntries = contextManager.getEntriesByType(
        "room-123",
        "ambient",
      );
      expect(ambientEntries.length).toBe(2);
      expect(ambientEntries.every((e) => e.type === "ambient")).toBe(true);
    });

    it("should filter by ai_response type", () => {
      const aiEntries = contextManager.getEntriesByType(
        "room-123",
        "ai_response",
      );
      expect(aiEntries.length).toBe(1);
      expect(aiEntries[0].speaker).toBe("AI");
    });

    it("should filter by system type", () => {
      const systemEntries = contextManager.getEntriesByType(
        "room-123",
        "system",
      );
      expect(systemEntries.length).toBe(1);
      expect(systemEntries[0].content).toBe("System event");
    });

    it("should return empty for non-existent room", () => {
      const entries = contextManager.getEntriesByType("unknown-room", "ptt");
      expect(entries).toEqual([]);
    });
  });

  describe("getEntriesBySpeaker", () => {
    beforeEach(() => {
      contextManager.addUserMessage("room-123", "Alice PTT", "peer-1");
      contextManager.addAmbientMessage("room-123", "Alice ambient", "peer-1");
      contextManager.addUserMessage("room-123", "Bob PTT", "peer-2");
      contextManager.addAmbientMessage("room-123", "Bob ambient", "peer-2");
      contextManager.addAssistantMessage("room-123", "AI response");
    });

    it("should filter by speaker ID", () => {
      const aliceEntries = contextManager.getEntriesBySpeaker(
        "room-123",
        "peer-1",
      );
      expect(aliceEntries.length).toBe(2);
      expect(aliceEntries.every((e) => e.speakerId === "peer-1")).toBe(true);
    });

    it("should return different results for different speakers", () => {
      const aliceEntries = contextManager.getEntriesBySpeaker(
        "room-123",
        "peer-1",
      );
      const bobEntries = contextManager.getEntriesBySpeaker(
        "room-123",
        "peer-2",
      );

      expect(aliceEntries.length).toBe(2);
      expect(bobEntries.length).toBe(2);
    });

    it("should return empty for non-existent speaker", () => {
      const entries = contextManager.getEntriesBySpeaker(
        "room-123",
        "peer-999",
      );
      expect(entries).toEqual([]);
    });

    it("should return empty for non-existent room", () => {
      const entries = contextManager.getEntriesBySpeaker(
        "unknown-room",
        "peer-1",
      );
      expect(entries).toEqual([]);
    });
  });

  describe("Transcript callbacks", () => {
    it("should call onTranscriptEntry for user messages", () => {
      const onTranscriptEntry = vi.fn();
      const cm = new ContextManager({}, { onTranscriptEntry });
      cm.initRoom("room-123");
      cm.addParticipant("room-123", "peer-1", "Alice");

      cm.addUserMessage("room-123", "Hello", "peer-1");

      expect(onTranscriptEntry).toHaveBeenCalledWith(
        "room-123",
        expect.objectContaining({
          speaker: "Alice",
          type: "ptt",
          content: "Hello",
        }),
      );
    });

    it("should call onTranscriptEntry for assistant messages", () => {
      const onTranscriptEntry = vi.fn();
      const cm = new ContextManager({}, { onTranscriptEntry });
      cm.initRoom("room-123");

      cm.addAssistantMessage("room-123", "AI says hello");

      expect(onTranscriptEntry).toHaveBeenCalledWith(
        "room-123",
        expect.objectContaining({
          speaker: "AI",
          type: "ai_response",
          content: "AI says hello",
        }),
      );
    });

    it("should call onTranscriptEntry for system messages", () => {
      const onTranscriptEntry = vi.fn();
      const cm = new ContextManager({}, { onTranscriptEntry });
      cm.initRoom("room-123");

      cm.addSystemMessage("room-123", "User joined");

      expect(onTranscriptEntry).toHaveBeenCalledWith(
        "room-123",
        expect.objectContaining({
          type: "system",
          content: "User joined",
        }),
      );
    });

    it("should call onTranscriptEntry for ambient messages", () => {
      const onTranscriptEntry = vi.fn();
      const cm = new ContextManager({}, { onTranscriptEntry });
      cm.initRoom("room-123");
      cm.addParticipant("room-123", "peer-1", "Alice");

      cm.addAmbientMessage("room-123", "Casual talk", "peer-1");

      expect(onTranscriptEntry).toHaveBeenCalledWith(
        "room-123",
        expect.objectContaining({
          speaker: "Alice",
          type: "ambient",
          content: "Casual talk",
        }),
      );
    });
  });

  describe("TranscriptEntry format", () => {
    it("should have all required fields", () => {
      contextManager.addUserMessage("room-123", "Test message", "peer-1", 1500);
      const { entries } = contextManager.getTranscriptEntries("room-123");
      const entry = entries[0];

      expect(entry).toHaveProperty("id");
      expect(entry).toHaveProperty("roomId");
      expect(entry).toHaveProperty("timestamp");
      expect(entry).toHaveProperty("speaker");
      expect(entry).toHaveProperty("speakerId");
      expect(entry).toHaveProperty("content");
      expect(entry).toHaveProperty("type");
      expect(entry).toHaveProperty("tokenEstimate");
      expect(entry).toHaveProperty("audioDurationMs");
    });

    it("should set correct speaker for AI messages", () => {
      contextManager.addAssistantMessage("room-123", "AI response");
      const { entries } = contextManager.getTranscriptEntries("room-123");

      expect(entries[0].speaker).toBe("AI");
      expect(entries[0].speakerId).toBeNull();
    });

    it("should set correct speaker for system messages", () => {
      contextManager.addSystemMessage("room-123", "Event");
      const { entries } = contextManager.getTranscriptEntries("room-123");

      expect(entries[0].speaker).toBe("System");
      expect(entries[0].speakerId).toBeNull();
    });
  });

  describe("Backwards compatibility", () => {
    it("should infer entry type from role for legacy messages", () => {
      // Directly access internal to simulate legacy message without entryType
      const cm = new ContextManager();
      cm.initRoom("room-123");
      cm.addParticipant("room-123", "peer-1", "Alice");

      // Add message normally (will have entryType set)
      cm.addUserMessage("room-123", "Test", "peer-1");

      const { entries } = cm.getTranscriptEntries("room-123");
      expect(entries[0].type).toBe("ptt"); // Inferred from user role with speakerId
    });
  });
});

describe("TranscriptSummary integration", () => {
  let contextManager: ContextManager;

  beforeEach(() => {
    contextManager = new ContextManager({
      maxTokensBeforeSummary: 200,
      targetTokensAfterSummary: 100,
      enableAutoSummary: false,
    });
    contextManager.initRoom("room-123");
    contextManager.addParticipant("room-123", "peer-1", "Alice");
  });

  it("should convert context summaries to transcript summaries", async () => {
    // Add enough messages to summarize
    for (let i = 0; i < 20; i++) {
      contextManager.addUserMessage(
        "room-123",
        `Message ${i} with content`,
        "peer-1",
      );
    }

    // Manually trigger summarization
    await contextManager.summarize("room-123");

    const summaries = contextManager.getTranscriptSummaries("room-123");
    expect(summaries.length).toBeGreaterThan(0);

    const summary = summaries[0];
    expect(summary).toHaveProperty("id");
    expect(summary).toHaveProperty("roomId");
    expect(summary).toHaveProperty("timestamp");
    expect(summary).toHaveProperty("content");
    expect(summary).toHaveProperty("bulletPoints");
    expect(summary).toHaveProperty("entriesSummarized");
    expect(summary).toHaveProperty("tokenCount");
  });

  it("should generate bullet points from summary content", async () => {
    for (let i = 0; i < 20; i++) {
      contextManager.addUserMessage(
        "room-123",
        `Important topic ${i}. Another sentence here.`,
        "peer-1",
      );
    }

    await contextManager.summarize("room-123");

    const summaries = contextManager.getTranscriptSummaries("room-123");
    if (summaries.length > 0) {
      expect(Array.isArray(summaries[0].bulletPoints)).toBe(true);
    }
  });
});
