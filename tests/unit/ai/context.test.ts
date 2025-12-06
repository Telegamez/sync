/**
 * Context Manager Tests
 *
 * Tests for FEAT-304: Shared context management
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ContextManager,
  createContextManager,
  type ContextManagerOptions,
  type ContextManagerCallbacks,
  type ConversationMessage,
  type ConversationContext,
} from '@/server/signaling/context-manager';
import type { RoomId } from '@/types/room';
import type { PeerId } from '@/types/peer';

describe('ContextManager', () => {
  const roomId: RoomId = 'room-test-123' as RoomId;
  const peer1: PeerId = 'peer-1' as PeerId;
  const peer2: PeerId = 'peer-2' as PeerId;
  let manager: ContextManager;
  let callbacks: ContextManagerCallbacks;

  beforeEach(() => {
    callbacks = {
      onMessageAdded: vi.fn(),
      onContextSummarized: vi.fn(),
      onNearTokenLimit: vi.fn(),
      onSummaryNeeded: vi.fn(),
      onContextCleared: vi.fn(),
      onError: vi.fn(),
    };
    manager = new ContextManager({}, callbacks);
  });

  afterEach(() => {
    manager.dispose();
    vi.clearAllMocks();
  });

  describe('Room initialization', () => {
    it('initializes a room', () => {
      manager.initRoom(roomId);
      expect(manager.hasRoom(roomId)).toBe(true);
    });

    it('uses default system prompt', () => {
      manager.initRoom(roomId);
      const prompt = manager.getSystemPrompt(roomId);
      expect(prompt).toContain('helpful AI assistant');
    });

    it('uses custom system prompt', () => {
      manager.initRoom(roomId, 'You are a coding assistant.');
      const prompt = manager.getSystemPrompt(roomId);
      expect(prompt).toBe('You are a coding assistant.');
    });

    it('does not reinitialize existing room', () => {
      manager.initRoom(roomId, 'First prompt');
      manager.initRoom(roomId, 'Second prompt');
      expect(manager.getSystemPrompt(roomId)).toBe('First prompt');
    });

    it('removes a room', () => {
      manager.initRoom(roomId);
      expect(manager.removeRoom(roomId)).toBe(true);
      expect(manager.hasRoom(roomId)).toBe(false);
    });

    it('returns false when removing non-existent room', () => {
      expect(manager.removeRoom('non-existent' as RoomId)).toBe(false);
    });
  });

  describe('Participant management', () => {
    beforeEach(() => {
      manager.initRoom(roomId);
    });

    it('adds a participant', () => {
      manager.addParticipant(roomId, peer1, 'Alice');
      expect(manager.getParticipantName(roomId, peer1)).toBe('Alice');
    });

    it('adds multiple participants', () => {
      manager.addParticipant(roomId, peer1, 'Alice');
      manager.addParticipant(roomId, peer2, 'Bob');

      const participants = manager.getParticipants(roomId);
      expect(participants.size).toBe(2);
      expect(participants.get(peer1)).toBe('Alice');
      expect(participants.get(peer2)).toBe('Bob');
    });

    it('removes a participant', () => {
      manager.addParticipant(roomId, peer1, 'Alice');
      expect(manager.removeParticipant(roomId, peer1)).toBe(true);
      expect(manager.getParticipantName(roomId, peer1)).toBeUndefined();
    });

    it('returns false when removing non-existent participant', () => {
      expect(manager.removeParticipant(roomId, peer1)).toBe(false);
    });

    it('returns empty map for non-existent room', () => {
      const participants = manager.getParticipants('unknown' as RoomId);
      expect(participants.size).toBe(0);
    });
  });

  describe('System prompt', () => {
    beforeEach(() => {
      manager.initRoom(roomId);
    });

    it('updates system prompt', () => {
      manager.setSystemPrompt(roomId, 'New prompt');
      expect(manager.getSystemPrompt(roomId)).toBe('New prompt');
    });

    it('returns undefined for non-existent room', () => {
      expect(manager.getSystemPrompt('unknown' as RoomId)).toBeUndefined();
    });

    it('adjusts token count when updating prompt', () => {
      // Start with a short prompt
      manager.setSystemPrompt(roomId, 'Short');
      const initialTokens = manager.getTokenCount(roomId);
      manager.setSystemPrompt(roomId, 'A much longer prompt that should increase the token count significantly with more words');
      const newTokens = manager.getTokenCount(roomId);
      expect(newTokens).toBeGreaterThan(initialTokens);
    });
  });

  describe('User messages', () => {
    beforeEach(() => {
      manager.initRoom(roomId);
      manager.addParticipant(roomId, peer1, 'Alice');
    });

    it('adds a user message', () => {
      const message = manager.addUserMessage(roomId, 'Hello!', peer1);
      expect(message).not.toBeNull();
      expect(message!.role).toBe('user');
      expect(message!.content).toContain('Hello!');
    });

    it('attributes speaker in message content', () => {
      const message = manager.addUserMessage(roomId, 'Hello!', peer1);
      expect(message!.content).toBe('[Alice]: Hello!');
      expect(message!.speakerId).toBe(peer1);
      expect(message!.speakerName).toBe('Alice');
    });

    it('handles message without speaker', () => {
      const message = manager.addUserMessage(roomId, 'Anonymous message');
      expect(message!.content).toBe('Anonymous message');
      expect(message!.speakerId).toBeUndefined();
    });

    it('includes audio duration', () => {
      const message = manager.addUserMessage(roomId, 'Hello!', peer1, 3500);
      expect(message!.audioDurationMs).toBe(3500);
    });

    it('fires onMessageAdded callback', () => {
      manager.addUserMessage(roomId, 'Hello!', peer1);
      expect(callbacks.onMessageAdded).toHaveBeenCalledWith(
        roomId,
        expect.objectContaining({ role: 'user' })
      );
    });

    it('returns null for non-existent room', () => {
      const message = manager.addUserMessage('unknown' as RoomId, 'Hello!');
      expect(message).toBeNull();
      expect(callbacks.onError).toHaveBeenCalled();
    });
  });

  describe('Assistant messages', () => {
    beforeEach(() => {
      manager.initRoom(roomId);
    });

    it('adds an assistant message', () => {
      const message = manager.addAssistantMessage(roomId, 'How can I help?');
      expect(message).not.toBeNull();
      expect(message!.role).toBe('assistant');
      expect(message!.content).toBe('How can I help?');
    });

    it('includes audio duration', () => {
      const message = manager.addAssistantMessage(roomId, 'Response', 2500);
      expect(message!.audioDurationMs).toBe(2500);
    });

    it('returns null for non-existent room', () => {
      const message = manager.addAssistantMessage('unknown' as RoomId, 'Hello!');
      expect(message).toBeNull();
    });
  });

  describe('System messages', () => {
    beforeEach(() => {
      manager.initRoom(roomId);
    });

    it('adds a system message', () => {
      const message = manager.addSystemMessage(roomId, 'User joined the room');
      expect(message).not.toBeNull();
      expect(message!.role).toBe('system');
      expect(message!.content).toBe('User joined the room');
    });

    it('returns null for non-existent room', () => {
      const message = manager.addSystemMessage('unknown' as RoomId, 'Hello!');
      expect(message).toBeNull();
    });
  });

  describe('Message updates', () => {
    beforeEach(() => {
      manager.initRoom(roomId);
    });

    it('updates a partial message', () => {
      const message = manager.addAssistantMessage(roomId, 'Hel');
      expect(manager.updateMessage(roomId, message!.id, 'Hello', true)).toBe(true);

      const messages = manager.getMessages(roomId);
      expect(messages[0].content).toBe('Hello');
      expect(messages[0].isPartial).toBe(true);
    });

    it('marks message as complete', () => {
      const message = manager.addAssistantMessage(roomId, 'Hello');
      manager.updateMessage(roomId, message!.id, 'Hello there!', false);

      const messages = manager.getMessages(roomId);
      expect(messages[0].isPartial).toBe(false);
    });

    it('returns false for non-existent message', () => {
      expect(manager.updateMessage(roomId, 'unknown', 'content')).toBe(false);
    });

    it('returns false for non-existent room', () => {
      expect(manager.updateMessage('unknown' as RoomId, 'id', 'content')).toBe(false);
    });
  });

  describe('Getting messages', () => {
    beforeEach(() => {
      manager.initRoom(roomId);
      manager.addParticipant(roomId, peer1, 'Alice');
    });

    it('returns all messages', () => {
      manager.addUserMessage(roomId, 'Hello', peer1);
      manager.addAssistantMessage(roomId, 'Hi there!');
      manager.addUserMessage(roomId, 'How are you?', peer1);

      const messages = manager.getMessages(roomId);
      expect(messages).toHaveLength(3);
    });

    it('returns empty array for non-existent room', () => {
      const messages = manager.getMessages('unknown' as RoomId);
      expect(messages).toEqual([]);
    });

    it('returns messages for AI with system prompt', () => {
      manager.addUserMessage(roomId, 'Hello', peer1);
      manager.addAssistantMessage(roomId, 'Hi there!');

      const aiMessages = manager.getMessagesForAI(roomId);

      // Should have system prompt + 2 messages
      expect(aiMessages.length).toBeGreaterThanOrEqual(3);
      expect(aiMessages[0].role).toBe('system');
    });

    it('returns empty array for non-existent room in AI format', () => {
      const messages = manager.getMessagesForAI('unknown' as RoomId);
      expect(messages).toEqual([]);
    });
  });

  describe('Context state', () => {
    beforeEach(() => {
      manager.initRoom(roomId);
      manager.addParticipant(roomId, peer1, 'Alice');
    });

    it('returns context state', () => {
      manager.addUserMessage(roomId, 'Hello', peer1);
      manager.addAssistantMessage(roomId, 'Hi!');

      const state = manager.getContextState(roomId);

      expect(state).not.toBeNull();
      expect(state!.messageCount).toBe(2);
      expect(state!.totalTokens).toBeGreaterThan(0);
      expect(state!.participantCount).toBe(1);
    });

    it('includes last message preview', () => {
      manager.addUserMessage(roomId, 'Hello there!', peer1);

      const state = manager.getContextState(roomId);

      expect(state!.lastMessage).toBeDefined();
      expect(state!.lastMessage!.role).toBe('user');
      expect(state!.lastMessage!.speakerName).toBe('Alice');
      expect(state!.lastMessage!.contentPreview).toContain('Hello');
    });

    it('returns null for non-existent room', () => {
      const state = manager.getContextState('unknown' as RoomId);
      expect(state).toBeNull();
    });

    it('indicates when near token limit', () => {
      manager = new ContextManager({ maxTokensBeforeSummary: 100 }, callbacks);
      manager.initRoom(roomId);

      // Add messages to approach limit
      for (let i = 0; i < 10; i++) {
        manager.addAssistantMessage(roomId, 'This is a fairly long message that will consume tokens.');
      }

      const state = manager.getContextState(roomId);
      expect(state!.isNearLimit).toBe(true);
    });
  });

  describe('Token counting', () => {
    beforeEach(() => {
      manager.initRoom(roomId);
    });

    it('estimates tokens for messages', () => {
      manager.addUserMessage(roomId, 'Hello!');
      const tokens = manager.getTokenCount(roomId);
      expect(tokens).toBeGreaterThan(0);
    });

    it('increases token count with messages', () => {
      const initial = manager.getTokenCount(roomId);
      manager.addUserMessage(roomId, 'This is a test message');
      const after = manager.getTokenCount(roomId);
      expect(after).toBeGreaterThan(initial);
    });

    it('returns 0 for non-existent room', () => {
      expect(manager.getTokenCount('unknown' as RoomId)).toBe(0);
    });
  });

  describe('Summarization', () => {
    beforeEach(() => {
      manager = new ContextManager(
        { maxTokensBeforeSummary: 200, targetTokensAfterSummary: 50, enableAutoSummary: false },
        callbacks
      );
      manager.initRoom(roomId);
      manager.addParticipant(roomId, peer1, 'Alice');
    });

    it('checks if summarization is needed', () => {
      expect(manager.needsSummarization(roomId)).toBe(false);

      // Add many messages
      for (let i = 0; i < 20; i++) {
        manager.addUserMessage(roomId, `This is message number ${i} with some content`, peer1);
      }

      expect(manager.needsSummarization(roomId)).toBe(true);
    });

    it('summarizes messages with callback', async () => {
      (callbacks.onSummaryNeeded as ReturnType<typeof vi.fn>).mockResolvedValue(
        'Summary of the conversation'
      );

      // Add messages
      for (let i = 0; i < 10; i++) {
        manager.addUserMessage(roomId, `Message ${i} content here`, peer1);
      }

      const summary = await manager.summarize(roomId);

      expect(summary).not.toBeNull();
      expect(summary!.content).toBe('Summary of the conversation');
      expect(callbacks.onContextSummarized).toHaveBeenCalled();
    });

    it('uses simple summary without callback', async () => {
      const noCallbackManager = new ContextManager(
        { maxTokensBeforeSummary: 200, targetTokensAfterSummary: 50 },
        {}
      );
      noCallbackManager.initRoom(roomId);
      noCallbackManager.addParticipant(roomId, peer1, 'Alice');

      for (let i = 0; i < 10; i++) {
        noCallbackManager.addUserMessage(roomId, `Message ${i}`, peer1);
      }

      const summary = await noCallbackManager.summarize(roomId);

      expect(summary).not.toBeNull();
      expect(summary!.content).toContain('Alice');
      noCallbackManager.dispose();
    });

    it('returns null when not enough messages', async () => {
      const summary = await manager.summarize(roomId);
      expect(summary).toBeNull();
    });

    it('returns null for non-existent room', async () => {
      const summary = await manager.summarize('unknown' as RoomId);
      expect(summary).toBeNull();
      expect(callbacks.onError).toHaveBeenCalled();
    });

    it('includes summaries in AI messages', async () => {
      (callbacks.onSummaryNeeded as ReturnType<typeof vi.fn>).mockResolvedValue(
        'Conversation summary here'
      );

      for (let i = 0; i < 10; i++) {
        manager.addUserMessage(roomId, `Long message ${i} with content`, peer1);
      }

      await manager.summarize(roomId);
      manager.addUserMessage(roomId, 'New message after summary', peer1);

      const aiMessages = manager.getMessagesForAI(roomId);

      // Should have system + summary + remaining messages
      const hasSummary = aiMessages.some(m =>
        m.content.includes('Previous conversation summary')
      );
      expect(hasSummary).toBe(true);
    });
  });

  describe('Auto-summarization', () => {
    it('triggers near token limit callback', () => {
      manager = new ContextManager(
        { maxTokensBeforeSummary: 100, enableAutoSummary: true },
        callbacks
      );
      manager.initRoom(roomId);

      // Add messages to exceed limit
      for (let i = 0; i < 10; i++) {
        manager.addAssistantMessage(roomId, 'This is a message with some content to consume tokens');
      }

      expect(callbacks.onNearTokenLimit).toHaveBeenCalled();
    });
  });

  describe('Max messages limit', () => {
    it('enforces max messages', () => {
      manager = new ContextManager({ maxMessages: 5 }, callbacks);
      manager.initRoom(roomId);

      for (let i = 0; i < 10; i++) {
        manager.addUserMessage(roomId, `Message ${i}`);
      }

      const messages = manager.getMessages(roomId);
      expect(messages).toHaveLength(5);
      expect(messages[0].content).toBe('Message 5');
    });
  });

  describe('Clear messages', () => {
    beforeEach(() => {
      manager.initRoom(roomId);
      manager.addParticipant(roomId, peer1, 'Alice');
    });

    it('clears all messages', () => {
      manager.addUserMessage(roomId, 'Hello', peer1);
      manager.addAssistantMessage(roomId, 'Hi!');

      manager.clearMessages(roomId);

      expect(manager.getMessages(roomId)).toHaveLength(0);
      expect(callbacks.onContextCleared).toHaveBeenCalledWith(roomId);
    });

    it('keeps system prompt after clear', () => {
      const prompt = manager.getSystemPrompt(roomId);
      manager.addUserMessage(roomId, 'Hello', peer1);
      manager.clearMessages(roomId);

      expect(manager.getSystemPrompt(roomId)).toBe(prompt);
    });

    it('keeps participants after clear', () => {
      manager.addUserMessage(roomId, 'Hello', peer1);
      manager.clearMessages(roomId);

      expect(manager.getParticipantName(roomId, peer1)).toBe('Alice');
    });

    it('clears summaries', async () => {
      (callbacks.onSummaryNeeded as ReturnType<typeof vi.fn>).mockResolvedValue('Summary');

      manager = new ContextManager(
        { maxTokensBeforeSummary: 100, targetTokensAfterSummary: 50, enableAutoSummary: false },
        callbacks
      );
      manager.initRoom(roomId);

      for (let i = 0; i < 10; i++) {
        manager.addUserMessage(roomId, `Message ${i} content`);
      }

      await manager.summarize(roomId);
      manager.clearMessages(roomId);

      const state = manager.getContextState(roomId);
      expect(state!.summaryCount).toBe(0);
    });
  });

  describe('Export and import', () => {
    beforeEach(() => {
      manager.initRoom(roomId, 'Custom prompt');
      manager.addParticipant(roomId, peer1, 'Alice');
      manager.addUserMessage(roomId, 'Hello', peer1);
      manager.addAssistantMessage(roomId, 'Hi there!');
    });

    it('exports context', () => {
      const exported = manager.exportContext(roomId);

      expect(exported).not.toBeNull();
      expect(exported!.roomId).toBe(roomId);
      expect(exported!.systemPrompt).toBe('Custom prompt');
      expect(exported!.messages).toHaveLength(2);
      expect(exported!.participants.size).toBe(1);
    });

    it('returns null for non-existent room', () => {
      const exported = manager.exportContext('unknown' as RoomId);
      expect(exported).toBeNull();
    });

    it('imports context', () => {
      const exported = manager.exportContext(roomId)!;
      manager.removeRoom(roomId);

      manager.importContext(exported);

      expect(manager.hasRoom(roomId)).toBe(true);
      expect(manager.getMessages(roomId)).toHaveLength(2);
      expect(manager.getParticipantName(roomId, peer1)).toBe('Alice');
    });

    it('exported context is a copy', () => {
      const exported = manager.exportContext(roomId)!;

      manager.addUserMessage(roomId, 'Another message');

      expect(exported.messages).toHaveLength(2);
      expect(manager.getMessages(roomId)).toHaveLength(3);
    });
  });

  describe('Factory function', () => {
    it('creates manager instance', () => {
      const created = createContextManager();
      expect(created).toBeInstanceOf(ContextManager);
      created.dispose();
    });

    it('accepts options and callbacks', () => {
      const created = createContextManager(
        { maxMessages: 50 },
        { onMessageAdded: vi.fn() }
      );
      expect(created).toBeInstanceOf(ContextManager);
      created.dispose();
    });
  });

  describe('Dispose', () => {
    it('clears all contexts', () => {
      manager.initRoom(roomId);
      manager.initRoom('room-2' as RoomId);
      manager.dispose();

      expect(manager.hasRoom(roomId)).toBe(false);
      expect(manager.hasRoom('room-2' as RoomId)).toBe(false);
    });
  });

  describe('Integration scenarios', () => {
    it('handles full conversation flow', () => {
      manager.initRoom(roomId, 'You are a helpful coding assistant.');
      manager.addParticipant(roomId, peer1, 'Alice');
      manager.addParticipant(roomId, peer2, 'Bob');

      // Conversation
      manager.addUserMessage(roomId, 'How do I write a React hook?', peer1);
      manager.addAssistantMessage(roomId, 'To write a React hook, start with...');
      manager.addUserMessage(roomId, 'Can you show an example?', peer2);
      manager.addAssistantMessage(roomId, 'Here is an example: function useCounter()...');

      const messages = manager.getMessages(roomId);
      expect(messages).toHaveLength(4);

      const aiMessages = manager.getMessagesForAI(roomId);
      expect(aiMessages[0].content).toBe('You are a helpful coding assistant.');
      expect(aiMessages[1].content).toContain('[Alice]');
      expect(aiMessages[3].content).toContain('[Bob]');
    });

    it('handles speaker changes correctly', () => {
      manager.initRoom(roomId);
      manager.addParticipant(roomId, peer1, 'Alice');
      manager.addParticipant(roomId, peer2, 'Bob');

      manager.addUserMessage(roomId, 'Question 1', peer1);
      manager.addAssistantMessage(roomId, 'Answer 1');
      manager.addUserMessage(roomId, 'Question 2', peer2);
      manager.addAssistantMessage(roomId, 'Answer 2');
      manager.addUserMessage(roomId, 'Follow up', peer1);

      const messages = manager.getMessages(roomId);
      expect(messages[0].speakerName).toBe('Alice');
      expect(messages[2].speakerName).toBe('Bob');
      expect(messages[4].speakerName).toBe('Alice');
    });
  });
});
