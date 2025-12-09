/**
 * Transcript Types Tests
 *
 * Tests for transcript type definitions and utility functions.
 * Part of the Long-Horizon Engineering Protocol - FEAT-500
 */

import { describe, it, expect } from "vitest";
import {
  type TranscriptEntry,
  type TranscriptSummary,
  type RoomTranscriptSettings,
  type TranscriptState,
  type TranscriptEntryType,
  type TranscriptRetention,
  DEFAULT_TRANSCRIPT_SETTINGS,
  isSpeechEntry,
  isHumanEntry,
  isAIEntry,
  formatEntryTimestamp,
  formatRelativeTime,
} from "@/types/transcript";

describe("Transcript Types", () => {
  describe("TranscriptEntry", () => {
    it("should have all required properties", () => {
      const entry: TranscriptEntry = {
        id: "entry-1",
        roomId: "room-123",
        timestamp: new Date(),
        speaker: "Alice",
        speakerId: "peer-1",
        content: "Hello, this is a test message",
        type: "ambient",
      };

      expect(entry.id).toBe("entry-1");
      expect(entry.roomId).toBe("room-123");
      expect(entry.speaker).toBe("Alice");
      expect(entry.speakerId).toBe("peer-1");
      expect(entry.content).toBe("Hello, this is a test message");
      expect(entry.type).toBe("ambient");
    });

    it("should support optional properties", () => {
      const entry: TranscriptEntry = {
        id: "entry-2",
        roomId: "room-123",
        timestamp: new Date(),
        speaker: "Bob",
        speakerId: "peer-2",
        content: "Test with optional fields",
        type: "ptt",
        tokenEstimate: 25,
        audioDurationMs: 5000,
        isPartial: false,
      };

      expect(entry.tokenEstimate).toBe(25);
      expect(entry.audioDurationMs).toBe(5000);
      expect(entry.isPartial).toBe(false);
    });

    it("should allow null speakerId for AI responses", () => {
      const aiEntry: TranscriptEntry = {
        id: "entry-ai",
        roomId: "room-123",
        timestamp: new Date(),
        speaker: "Swensync",
        speakerId: null,
        content: "I understand. Let me help with that.",
        type: "ai_response",
      };

      expect(aiEntry.speakerId).toBeNull();
      expect(aiEntry.type).toBe("ai_response");
    });

    it("should allow null speakerId for system messages", () => {
      const systemEntry: TranscriptEntry = {
        id: "entry-sys",
        roomId: "room-123",
        timestamp: new Date(),
        speaker: "System",
        speakerId: null,
        content: "David joined the room",
        type: "system",
      };

      expect(systemEntry.speakerId).toBeNull();
      expect(systemEntry.type).toBe("system");
    });
  });

  describe("TranscriptSummary", () => {
    it("should have all required properties", () => {
      const summary: TranscriptSummary = {
        id: "summary-1",
        roomId: "room-123",
        timestamp: new Date(),
        content: "Discussion about Q4 priorities including mobile focus.",
        bulletPoints: [
          "Mobile app is Q4 priority",
          "60% of traffic is mobile",
          "Alice leading workstream",
        ],
        entriesSummarized: 15,
        tokenCount: 50,
        coverageStart: new Date(Date.now() - 300000),
        coverageEnd: new Date(),
      };

      expect(summary.id).toBe("summary-1");
      expect(summary.bulletPoints).toHaveLength(3);
      expect(summary.entriesSummarized).toBe(15);
    });
  });

  describe("RoomTranscriptSettings", () => {
    it("should have all required properties", () => {
      const settings: RoomTranscriptSettings = {
        enabled: true,
        summariesEnabled: true,
        retention: "session",
        allowDownload: true,
      };

      expect(settings.enabled).toBe(true);
      expect(settings.summariesEnabled).toBe(true);
      expect(settings.retention).toBe("session");
      expect(settings.allowDownload).toBe(true);
    });

    it("should support all retention options", () => {
      const retentionOptions: TranscriptRetention[] = [
        "session",
        "7days",
        "30days",
      ];

      retentionOptions.forEach((retention) => {
        const settings: RoomTranscriptSettings = {
          enabled: true,
          summariesEnabled: true,
          retention,
          allowDownload: true,
        };
        expect(settings.retention).toBe(retention);
      });
    });
  });

  describe("DEFAULT_TRANSCRIPT_SETTINGS", () => {
    it("should have sensible defaults", () => {
      expect(DEFAULT_TRANSCRIPT_SETTINGS.enabled).toBe(true);
      expect(DEFAULT_TRANSCRIPT_SETTINGS.summariesEnabled).toBe(true);
      expect(DEFAULT_TRANSCRIPT_SETTINGS.retention).toBe("session");
      expect(DEFAULT_TRANSCRIPT_SETTINGS.allowDownload).toBe(true);
    });
  });

  describe("TranscriptState", () => {
    it("should have all required properties", () => {
      const state: TranscriptState = {
        entries: [],
        summaries: [],
        isLoading: false,
        isLoadingMore: false,
        error: null,
        hasMore: true,
        autoScroll: true,
        totalEntries: 0,
      };

      expect(state.entries).toEqual([]);
      expect(state.summaries).toEqual([]);
      expect(state.isLoading).toBe(false);
      expect(state.autoScroll).toBe(true);
    });
  });

  describe("TranscriptEntryType", () => {
    it("should support all entry types", () => {
      const types: TranscriptEntryType[] = [
        "ambient",
        "ptt",
        "ai_response",
        "system",
      ];

      types.forEach((type) => {
        const entry: TranscriptEntry = {
          id: `entry-${type}`,
          roomId: "room-123",
          timestamp: new Date(),
          speaker: "Test",
          speakerId:
            type === "ai_response" || type === "system" ? null : "peer-1",
          content: `Test ${type}`,
          type,
        };
        expect(entry.type).toBe(type);
      });
    });
  });
});

describe("Transcript Type Guards", () => {
  const ambientEntry: TranscriptEntry = {
    id: "ambient-1",
    roomId: "room-123",
    timestamp: new Date(),
    speaker: "Alice",
    speakerId: "peer-1",
    content: "Regular conversation",
    type: "ambient",
  };

  const pttEntry: TranscriptEntry = {
    id: "ptt-1",
    roomId: "room-123",
    timestamp: new Date(),
    speaker: "Bob",
    speakerId: "peer-2",
    content: "Question to AI",
    type: "ptt",
  };

  const aiEntry: TranscriptEntry = {
    id: "ai-1",
    roomId: "room-123",
    timestamp: new Date(),
    speaker: "Swensync",
    speakerId: null,
    content: "AI response",
    type: "ai_response",
  };

  const systemEntry: TranscriptEntry = {
    id: "sys-1",
    roomId: "room-123",
    timestamp: new Date(),
    speaker: "System",
    speakerId: null,
    content: "User joined",
    type: "system",
  };

  describe("isSpeechEntry", () => {
    it("should return true for ambient entries", () => {
      expect(isSpeechEntry(ambientEntry)).toBe(true);
    });

    it("should return true for ptt entries", () => {
      expect(isSpeechEntry(pttEntry)).toBe(true);
    });

    it("should return true for ai_response entries", () => {
      expect(isSpeechEntry(aiEntry)).toBe(true);
    });

    it("should return false for system entries", () => {
      expect(isSpeechEntry(systemEntry)).toBe(false);
    });
  });

  describe("isHumanEntry", () => {
    it("should return true for ambient entries", () => {
      expect(isHumanEntry(ambientEntry)).toBe(true);
    });

    it("should return true for ptt entries", () => {
      expect(isHumanEntry(pttEntry)).toBe(true);
    });

    it("should return false for ai_response entries", () => {
      expect(isHumanEntry(aiEntry)).toBe(false);
    });

    it("should return false for system entries", () => {
      expect(isHumanEntry(systemEntry)).toBe(false);
    });
  });

  describe("isAIEntry", () => {
    it("should return false for ambient entries", () => {
      expect(isAIEntry(ambientEntry)).toBe(false);
    });

    it("should return false for ptt entries", () => {
      expect(isAIEntry(pttEntry)).toBe(false);
    });

    it("should return true for ai_response entries", () => {
      expect(isAIEntry(aiEntry)).toBe(true);
    });

    it("should return false for system entries", () => {
      expect(isAIEntry(systemEntry)).toBe(false);
    });
  });
});

describe("Transcript Utility Functions", () => {
  describe("formatEntryTimestamp", () => {
    it("should format time with AM/PM", () => {
      const morning = new Date("2024-12-09T09:30:00");
      const formatted = formatEntryTimestamp(morning);
      expect(formatted).toMatch(/9:30\s*AM/i);
    });

    it("should format afternoon time correctly", () => {
      const afternoon = new Date("2024-12-09T14:45:00");
      const formatted = formatEntryTimestamp(afternoon);
      expect(formatted).toMatch(/2:45\s*PM/i);
    });
  });

  describe("formatRelativeTime", () => {
    it("should return 'Just now' for very recent times", () => {
      const now = new Date();
      expect(formatRelativeTime(now)).toBe("Just now");
    });

    it("should return '1 min ago' for 1 minute ago", () => {
      const oneMinAgo = new Date(Date.now() - 60000);
      expect(formatRelativeTime(oneMinAgo)).toBe("1 min ago");
    });

    it("should return 'X min ago' for times under an hour", () => {
      const fiveMinAgo = new Date(Date.now() - 5 * 60000);
      expect(formatRelativeTime(fiveMinAgo)).toBe("5 min ago");
    });

    it("should return '1 hour ago' for 1 hour ago", () => {
      const oneHourAgo = new Date(Date.now() - 60 * 60000);
      expect(formatRelativeTime(oneHourAgo)).toBe("1 hour ago");
    });

    it("should return 'X hours ago' for times under a day", () => {
      const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60000);
      expect(formatRelativeTime(threeHoursAgo)).toBe("3 hours ago");
    });
  });
});
