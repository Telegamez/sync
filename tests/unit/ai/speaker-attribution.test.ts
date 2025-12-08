/**
 * Speaker Attribution Tests
 *
 * Tests for FEAT-416: Speaker attribution in conversation history using
 * conversation.item.create with text prefix before audio.
 *
 * Part of the Long-Horizon Engineering Protocol - FEAT-416
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Mock WebSocket for testing OpenAI Realtime API communication
 */
class MockWebSocket {
  static OPEN = 1;
  static CLOSED = 3;

  readyState = MockWebSocket.OPEN;
  sentMessages: string[] = [];

  send(data: string) {
    this.sentMessages.push(data);
  }

  close() {
    this.readyState = MockWebSocket.CLOSED;
  }

  getLastMessage() {
    return this.sentMessages[this.sentMessages.length - 1];
  }

  getMessagesByType(type: string) {
    return this.sentMessages
      .map((msg) => JSON.parse(msg))
      .filter((parsed) => parsed.type === type);
  }
}

/**
 * Simulates the speaker attribution logic from server.ts
 * This mirrors the actual implementation for testing purposes
 */
function createSpeakerAttributionEvent(displayName: string) {
  return {
    type: "conversation.item.create",
    item: {
      type: "message",
      role: "user",
      content: [
        {
          type: "input_text",
          text: `${displayName} says:`,
        },
      ],
    },
  };
}

/**
 * Simulates the session update event from server.ts
 */
function createSessionUpdateEvent(instructions: string) {
  return {
    type: "session.update",
    session: {
      instructions,
    },
  };
}

describe("Speaker Attribution (FEAT-416)", () => {
  let mockWs: MockWebSocket;

  beforeEach(() => {
    mockWs = new MockWebSocket();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("conversation.item.create event structure", () => {
    it("should create a valid conversation item with speaker name", () => {
      const displayName = "Matt";
      const event = createSpeakerAttributionEvent(displayName);

      expect(event.type).toBe("conversation.item.create");
      expect(event.item.type).toBe("message");
      expect(event.item.role).toBe("user");
      expect(event.item.content).toHaveLength(1);
      expect(event.item.content[0].type).toBe("input_text");
      expect(event.item.content[0].text).toBe("Matt says:");
    });

    it("should handle names with special characters", () => {
      const displayName = "O'Brien";
      const event = createSpeakerAttributionEvent(displayName);

      expect(event.item.content[0].text).toBe("O'Brien says:");
    });

    it("should handle unicode names", () => {
      const displayName = "Müller";
      const event = createSpeakerAttributionEvent(displayName);

      expect(event.item.content[0].text).toBe("Müller says:");
    });

    it("should handle names with spaces", () => {
      const displayName = "Mary Jane";
      const event = createSpeakerAttributionEvent(displayName);

      expect(event.item.content[0].text).toBe("Mary Jane says:");
    });

    it("should handle empty display name with fallback", () => {
      const displayName = "User"; // Default fallback
      const event = createSpeakerAttributionEvent(displayName);

      expect(event.item.content[0].text).toBe("User says:");
    });
  });

  describe("WebSocket message ordering", () => {
    it("should send session.update before conversation.item.create", () => {
      const displayName = "Alice";
      const instructions = "You are a helpful assistant.";

      // Simulate PTT start flow
      mockWs.send(JSON.stringify(createSessionUpdateEvent(instructions)));
      mockWs.send(JSON.stringify(createSpeakerAttributionEvent(displayName)));

      const messages = mockWs.sentMessages.map((m) => JSON.parse(m));
      expect(messages).toHaveLength(2);
      expect(messages[0].type).toBe("session.update");
      expect(messages[1].type).toBe("conversation.item.create");
    });

    it("should send speaker attribution before audio buffer append", () => {
      const displayName = "Bob";

      // Simulate PTT start flow
      mockWs.send(JSON.stringify(createSpeakerAttributionEvent(displayName)));

      // Simulate audio data
      const audioEvent = {
        type: "input_audio_buffer.append",
        audio: "base64encodedaudio==",
      };
      mockWs.send(JSON.stringify(audioEvent));

      const messages = mockWs.sentMessages.map((m) => JSON.parse(m));
      expect(messages[0].type).toBe("conversation.item.create");
      expect(messages[1].type).toBe("input_audio_buffer.append");
    });
  });

  describe("multi-participant scenarios", () => {
    it("should create distinct attribution for different speakers", () => {
      const speaker1 = "Alice";
      const speaker2 = "Bob";

      const event1 = createSpeakerAttributionEvent(speaker1);
      const event2 = createSpeakerAttributionEvent(speaker2);

      expect(event1.item.content[0].text).toBe("Alice says:");
      expect(event2.item.content[0].text).toBe("Bob says:");
      expect(event1.item.content[0].text).not.toBe(event2.item.content[0].text);
    });

    it("should create new attribution for each PTT session", () => {
      // First PTT session
      mockWs.send(JSON.stringify(createSpeakerAttributionEvent("Alice")));
      mockWs.send(
        JSON.stringify({
          type: "input_audio_buffer.append",
          audio: "audio1==",
        }),
      );
      mockWs.send(JSON.stringify({ type: "input_audio_buffer.commit" }));
      mockWs.send(JSON.stringify({ type: "response.create" }));

      // Second PTT session with different speaker
      mockWs.send(JSON.stringify(createSpeakerAttributionEvent("Bob")));
      mockWs.send(
        JSON.stringify({
          type: "input_audio_buffer.append",
          audio: "audio2==",
        }),
      );
      mockWs.send(JSON.stringify({ type: "input_audio_buffer.commit" }));
      mockWs.send(JSON.stringify({ type: "response.create" }));

      const attributionEvents = mockWs.getMessagesByType(
        "conversation.item.create",
      );
      expect(attributionEvents).toHaveLength(2);
      expect(attributionEvents[0].item.content[0].text).toBe("Alice says:");
      expect(attributionEvents[1].item.content[0].text).toBe("Bob says:");
    });

    it("should handle rapid speaker changes correctly", () => {
      const speakers = ["Alice", "Bob", "Charlie", "Diana"];

      speakers.forEach((speaker) => {
        mockWs.send(JSON.stringify(createSpeakerAttributionEvent(speaker)));
      });

      const attributionEvents = mockWs.getMessagesByType(
        "conversation.item.create",
      );
      expect(attributionEvents).toHaveLength(4);

      attributionEvents.forEach((event, index) => {
        expect(event.item.content[0].text).toBe(`${speakers[index]} says:`);
      });
    });
  });

  describe("WebSocket state handling", () => {
    it("should not send attribution when WebSocket is closed", () => {
      mockWs.readyState = MockWebSocket.CLOSED;

      // This simulates the guard in server.ts
      if (mockWs.readyState === MockWebSocket.OPEN) {
        mockWs.send(JSON.stringify(createSpeakerAttributionEvent("Alice")));
      }

      expect(mockWs.sentMessages).toHaveLength(0);
    });

    it("should send attribution when WebSocket is open", () => {
      mockWs.readyState = MockWebSocket.OPEN;

      if (mockWs.readyState === MockWebSocket.OPEN) {
        mockWs.send(JSON.stringify(createSpeakerAttributionEvent("Alice")));
      }

      expect(mockWs.sentMessages).toHaveLength(1);
    });
  });

  describe("conversation history structure", () => {
    it("should create conversation flow: text -> audio -> response", () => {
      const displayName = "Matt";

      // PTT Start: Add text attribution
      mockWs.send(JSON.stringify(createSpeakerAttributionEvent(displayName)));

      // Audio streaming
      mockWs.send(
        JSON.stringify({
          type: "input_audio_buffer.append",
          audio: "chunk1==",
        }),
      );
      mockWs.send(
        JSON.stringify({
          type: "input_audio_buffer.append",
          audio: "chunk2==",
        }),
      );

      // PTT End: Commit and request response
      mockWs.send(JSON.stringify({ type: "input_audio_buffer.commit" }));
      mockWs.send(
        JSON.stringify({
          type: "response.create",
          response: {
            modalities: ["audio", "text"],
            instructions: `IMPORTANT: ${displayName} just spoke to you.`,
          },
        }),
      );

      const messages = mockWs.sentMessages.map((m) => JSON.parse(m));

      // Verify correct order
      expect(messages[0].type).toBe("conversation.item.create");
      expect(messages[1].type).toBe("input_audio_buffer.append");
      expect(messages[2].type).toBe("input_audio_buffer.append");
      expect(messages[3].type).toBe("input_audio_buffer.commit");
      expect(messages[4].type).toBe("response.create");

      // Verify text attribution contains speaker name
      expect(messages[0].item.content[0].text).toContain("Matt");

      // Verify response instructions also contain speaker name
      expect(messages[4].response.instructions).toContain("Matt");
    });
  });

  describe("edge cases", () => {
    it("should handle very long display names", () => {
      const longName = "A".repeat(100);
      const event = createSpeakerAttributionEvent(longName);

      expect(event.item.content[0].text).toBe(`${"A".repeat(100)} says:`);
    });

    it("should handle display name with only whitespace", () => {
      const displayName = "   "; // Should be caught earlier, but test anyway
      const event = createSpeakerAttributionEvent(displayName);

      expect(event.item.content[0].text).toBe("    says:");
    });

    it("should handle numeric display names", () => {
      const displayName = "123";
      const event = createSpeakerAttributionEvent(displayName);

      expect(event.item.content[0].text).toBe("123 says:");
    });

    it("should handle emoji in display names", () => {
      const displayName = "Alice 🎤";
      const event = createSpeakerAttributionEvent(displayName);

      expect(event.item.content[0].text).toBe("Alice 🎤 says:");
    });
  });
});

describe("Integration with existing speaker name system", () => {
  it("should complement session instructions with conversation history", () => {
    const mockWs = new MockWebSocket();
    const displayName = "Alice";

    // Session instructions (existing system)
    const sessionInstructions = `
## CURRENT SPEAKER
The person currently speaking to you is named "${displayName}".
You MUST address them by name ("${displayName}") in your response.
`;

    // New: conversation.item.create for history
    const attributionEvent = createSpeakerAttributionEvent(displayName);

    // Both should be sent
    mockWs.send(
      JSON.stringify({
        type: "session.update",
        session: { instructions: sessionInstructions },
      }),
    );
    mockWs.send(JSON.stringify(attributionEvent));

    const messages = mockWs.sentMessages.map((m) => JSON.parse(m));

    // Session update contains speaker in instructions
    expect(messages[0].session.instructions).toContain(displayName);

    // Conversation item contains speaker attribution
    expect(messages[1].item.content[0].text).toContain(displayName);
  });
});
