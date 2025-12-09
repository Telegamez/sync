/**
 * PTT Context Injection Tests
 *
 * Tests for FEAT-501: PTT context injection functionality.
 * Verifies that the AI can access prior conversation context.
 *
 * Part of the Long-Horizon Engineering Protocol - FEAT-501
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  ContextManager,
  type ConversationMessage,
} from "@/server/signaling/context-manager";

describe("FEAT-501: PTT Context Injection", () => {
  let contextManager: ContextManager;

  beforeEach(() => {
    contextManager = new ContextManager({
      maxTokensBeforeSummary: 8000,
      targetTokensAfterSummary: 3000,
      maxMessages: 100,
      enableAutoSummary: true,
    });
  });

  describe("ContextManager initialization", () => {
    it("should initialize room context", () => {
      contextManager.initRoom("room-123");
      expect(contextManager.hasRoom("room-123")).toBe(true);
    });

    it("should track participants", () => {
      contextManager.initRoom("room-123");
      contextManager.addParticipant("room-123", "peer-1", "Alice");
      contextManager.addParticipant("room-123", "peer-2", "Bob");

      const participants = contextManager.getParticipants("room-123");
      expect(participants.size).toBe(2);
      expect(participants.get("peer-1")).toBe("Alice");
      expect(participants.get("peer-2")).toBe("Bob");
    });
  });

  describe("Message storage", () => {
    beforeEach(() => {
      contextManager.initRoom("room-123");
      contextManager.addParticipant("room-123", "peer-1", "Alice");
    });

    it("should store user messages with speaker attribution", () => {
      const message = contextManager.addUserMessage(
        "room-123",
        "Hello, AI!",
        "peer-1",
      );

      expect(message).not.toBeNull();
      expect(message?.role).toBe("user");
      expect(message?.content).toContain("Alice");
      expect(message?.content).toContain("Hello, AI!");
      expect(message?.speakerId).toBe("peer-1");
      expect(message?.speakerName).toBe("Alice");
    });

    it("should store assistant messages", () => {
      const message = contextManager.addAssistantMessage(
        "room-123",
        "Hello Alice! How can I help?",
      );

      expect(message).not.toBeNull();
      expect(message?.role).toBe("assistant");
      expect(message?.content).toBe("Hello Alice! How can I help?");
    });

    it("should retrieve messages in order", () => {
      contextManager.addUserMessage("room-123", "First message", "peer-1");
      contextManager.addAssistantMessage("room-123", "First response");
      contextManager.addUserMessage("room-123", "Second message", "peer-1");
      contextManager.addAssistantMessage("room-123", "Second response");

      const messages = contextManager.getMessages("room-123");
      expect(messages.length).toBe(4);
      expect(messages[0].content).toContain("First message");
      expect(messages[1].content).toBe("First response");
      expect(messages[2].content).toContain("Second message");
      expect(messages[3].content).toBe("Second response");
    });
  });

  describe("Context retrieval for AI", () => {
    beforeEach(() => {
      contextManager.initRoom("room-123", "You are a helpful assistant.");
      contextManager.addParticipant("room-123", "peer-1", "Alice");
      contextManager.addParticipant("room-123", "peer-2", "Bob");
    });

    it("should include system prompt in messages for AI", () => {
      const aiMessages = contextManager.getMessagesForAI("room-123");

      expect(aiMessages.length).toBeGreaterThan(0);
      expect(aiMessages[0].role).toBe("system");
      expect(aiMessages[0].content).toBe("You are a helpful assistant.");
    });

    it("should include conversation history in messages for AI", () => {
      contextManager.addUserMessage(
        "room-123",
        "What is the weather?",
        "peer-1",
      );
      contextManager.addAssistantMessage(
        "room-123",
        "I don't have weather data.",
      );

      const aiMessages = contextManager.getMessagesForAI("room-123");

      // System prompt + 2 messages
      expect(aiMessages.length).toBe(3);
      expect(aiMessages[1].role).toBe("user");
      expect(aiMessages[2].role).toBe("assistant");
    });
  });

  describe("Token counting and context limits", () => {
    beforeEach(() => {
      contextManager = new ContextManager({
        maxTokensBeforeSummary: 500,
        targetTokensAfterSummary: 200,
        maxMessages: 10,
        enableAutoSummary: false, // Disable for predictable testing
      });
      contextManager.initRoom("room-123");
      contextManager.addParticipant("room-123", "peer-1", "Alice");
    });

    it("should estimate token count", () => {
      contextManager.addUserMessage(
        "room-123",
        "This is a test message with some content.",
        "peer-1",
      );

      const tokenCount = contextManager.getTokenCount("room-123");
      expect(tokenCount).toBeGreaterThan(0);
    });

    it("should detect when summarization is needed", () => {
      // Use smaller token limit to trigger summarization
      const smallCm = new ContextManager({
        maxTokensBeforeSummary: 200,
        enableAutoSummary: false,
      });
      smallCm.initRoom("room-small");
      smallCm.addParticipant("room-small", "peer-1", "Alice");

      // Add enough messages to exceed token limit
      for (let i = 0; i < 20; i++) {
        smallCm.addUserMessage(
          "room-small",
          `This is message number ${i} with some additional content to increase token count significantly for testing purposes.`,
          "peer-1",
        );
      }

      expect(smallCm.needsSummarization("room-small")).toBe(true);
    });

    it("should enforce max message limit", () => {
      // Add more messages than the max limit
      for (let i = 0; i < 15; i++) {
        contextManager.addUserMessage("room-123", `Message ${i}`, "peer-1");
      }

      const messages = contextManager.getMessages("room-123");
      expect(messages.length).toBeLessThanOrEqual(10);
    });
  });

  describe("Context state for clients", () => {
    beforeEach(() => {
      contextManager.initRoom("room-123");
      contextManager.addParticipant("room-123", "peer-1", "Alice");
    });

    it("should return context state", () => {
      contextManager.addUserMessage("room-123", "Hello", "peer-1");
      contextManager.addAssistantMessage("room-123", "Hi there!");

      const state = contextManager.getContextState("room-123");

      expect(state).not.toBeNull();
      expect(state?.messageCount).toBe(2);
      expect(state?.participantCount).toBe(1);
      expect(state?.lastMessage?.role).toBe("assistant");
    });

    it("should track near token limit status", () => {
      const smallContextManager = new ContextManager({
        maxTokensBeforeSummary: 100,
      });
      smallContextManager.initRoom("room-456");
      smallContextManager.addParticipant("room-456", "peer-1", "Alice");

      // Add messages to approach limit
      for (let i = 0; i < 10; i++) {
        smallContextManager.addUserMessage(
          "room-456",
          "Test message with content",
          "peer-1",
        );
      }

      const state = smallContextManager.getContextState("room-456");
      expect(state?.isNearLimit).toBe(true);
    });
  });

  describe("Cleanup", () => {
    it("should remove room context", () => {
      contextManager.initRoom("room-123");
      contextManager.addParticipant("room-123", "peer-1", "Alice");
      contextManager.addUserMessage("room-123", "Hello", "peer-1");

      expect(contextManager.hasRoom("room-123")).toBe(true);

      contextManager.removeRoom("room-123");

      expect(contextManager.hasRoom("room-123")).toBe(false);
    });

    it("should clear messages while keeping room", () => {
      contextManager.initRoom("room-123", "System prompt");
      contextManager.addParticipant("room-123", "peer-1", "Alice");
      contextManager.addUserMessage("room-123", "Hello", "peer-1");

      contextManager.clearMessages("room-123");

      expect(contextManager.hasRoom("room-123")).toBe(true);
      expect(contextManager.getMessages("room-123").length).toBe(0);
      expect(contextManager.getSystemPrompt("room-123")).toBe("System prompt");
    });
  });

  describe("Callbacks", () => {
    it("should call onMessageAdded callback", () => {
      const onMessageAdded = vi.fn();
      const cm = new ContextManager({}, { onMessageAdded });

      cm.initRoom("room-123");
      cm.addParticipant("room-123", "peer-1", "Alice");
      cm.addUserMessage("room-123", "Hello", "peer-1");

      expect(onMessageAdded).toHaveBeenCalledWith(
        "room-123",
        expect.objectContaining({
          role: "user",
          speakerName: "Alice",
        }),
      );
    });

    it("should call onNearTokenLimit callback when enableAutoSummary is true", () => {
      const onNearTokenLimit = vi.fn();
      const cm = new ContextManager(
        {
          maxTokensBeforeSummary: 100,
          enableAutoSummary: true, // Must be true to trigger callbacks
        },
        { onNearTokenLimit },
      );

      cm.initRoom("room-123");
      cm.addParticipant("room-123", "peer-1", "Alice");

      // Add enough messages to exceed token limit
      for (let i = 0; i < 30; i++) {
        cm.addUserMessage(
          "room-123",
          `Test message ${i} with some additional content to increase token count for testing purposes`,
          "peer-1",
        );
      }

      expect(onNearTokenLimit).toHaveBeenCalled();
    });
  });
});

describe("OpenAI Realtime Client Context Injection", () => {
  // These tests verify the OpenAIRealtimeClient.injectContext method exists
  // Integration tests would require mocking WebSocket connections

  it("should have injectContext method on OpenAIRealtimeClient", async () => {
    const { OpenAIRealtimeClient } =
      await import("@/server/signaling/openai-realtime-client");

    const client = new OpenAIRealtimeClient({
      apiKey: "test-key",
    });

    expect(typeof client.injectContext).toBe("function");
  });

  it("should have updateInstructions method on OpenAIRealtimeClient", async () => {
    const { OpenAIRealtimeClient } =
      await import("@/server/signaling/openai-realtime-client");

    const client = new OpenAIRealtimeClient({
      apiKey: "test-key",
    });

    expect(typeof client.updateInstructions).toBe("function");
  });

  it("injectContext should return false when no active session", async () => {
    const { OpenAIRealtimeClient } =
      await import("@/server/signaling/openai-realtime-client");

    const client = new OpenAIRealtimeClient({
      apiKey: "test-key",
    });

    // No session created, should return false
    const result = client.injectContext("room-123", "Test context");
    expect(result).toBe(false);
  });
});

describe("Context Injection Format", () => {
  it("should format context with timestamps and speaker names", () => {
    const contextManager = new ContextManager();
    contextManager.initRoom("room-123");
    contextManager.addParticipant("room-123", "peer-1", "Alice");
    contextManager.addParticipant("room-123", "peer-2", "Bob");

    contextManager.addUserMessage("room-123", "Hello everyone", "peer-1");
    contextManager.addAssistantMessage("room-123", "Hello Alice!");
    contextManager.addUserMessage("room-123", "What about me?", "peer-2");

    const messages = contextManager.getMessages("room-123");

    // Verify messages have timestamps
    expect(messages[0].timestamp).toBeInstanceOf(Date);

    // Verify user messages have speaker attribution
    expect(messages[0].speakerName).toBe("Alice");
    expect(messages[2].speakerName).toBe("Bob");

    // Verify AI messages don't have speaker attribution
    expect(messages[1].speakerName).toBeUndefined();
  });
});
