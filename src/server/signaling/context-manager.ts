/**
 * Context Manager
 *
 * Manages conversation context for shared AI sessions.
 * Tracks conversation history, speaker attribution, and context summarization.
 *
 * Part of the Long-Horizon Engineering Protocol - FEAT-304
 */

import type { RoomId } from '@/types/room';
import type { PeerId } from '@/types/peer';

/**
 * Message role in conversation
 */
export type MessageRole = 'user' | 'assistant' | 'system';

/**
 * Conversation message
 */
export interface ConversationMessage {
  /** Unique message ID */
  id: string;
  /** Message role */
  role: MessageRole;
  /** Message content (text transcript) */
  content: string;
  /** Speaker peer ID (for user messages) */
  speakerId?: PeerId;
  /** Speaker display name */
  speakerName?: string;
  /** When the message was created */
  timestamp: Date;
  /** Duration of audio in milliseconds */
  audioDurationMs?: number;
  /** Whether this is a partial/streaming message */
  isPartial?: boolean;
  /** Token count estimate */
  tokenEstimate?: number;
}

/**
 * Context summary
 */
export interface ContextSummary {
  /** Summary text */
  content: string;
  /** Messages summarized (count) */
  messageCount: number;
  /** When the summary was created */
  createdAt: Date;
  /** Original token count before summarization */
  originalTokens: number;
  /** Summary token count */
  summaryTokens: number;
}

/**
 * Conversation context
 */
export interface ConversationContext {
  /** Room this context belongs to */
  roomId: RoomId;
  /** System instruction/prompt */
  systemPrompt: string;
  /** Conversation messages */
  messages: ConversationMessage[];
  /** Context summaries (for long conversations) */
  summaries: ContextSummary[];
  /** Total token estimate */
  totalTokens: number;
  /** When context was created */
  createdAt: Date;
  /** When context was last updated */
  updatedAt: Date;
  /** Participant speakers (for attribution) */
  participants: Map<PeerId, string>;
}

/**
 * Context state exposed to clients
 */
export interface ContextState {
  /** Number of messages in context */
  messageCount: number;
  /** Total token estimate */
  totalTokens: number;
  /** Number of summaries */
  summaryCount: number;
  /** Whether context is near token limit */
  isNearLimit: boolean;
  /** Last message preview */
  lastMessage?: {
    role: MessageRole;
    speakerName?: string;
    contentPreview: string;
    timestamp: Date;
  };
  /** Participant count */
  participantCount: number;
}

/**
 * Context manager options
 */
export interface ContextManagerOptions {
  /** Default system prompt */
  defaultSystemPrompt?: string;
  /** Max tokens before summarization (default: 6000) */
  maxTokensBeforeSummary?: number;
  /** Target tokens after summarization (default: 2000) */
  targetTokensAfterSummary?: number;
  /** Max messages to keep (default: 100) */
  maxMessages?: number;
  /** Token estimation ratio (chars per token, default: 4) */
  tokenRatio?: number;
  /** Enable automatic summarization (default: true) */
  enableAutoSummary?: boolean;
  /** Summary instruction for AI */
  summaryInstruction?: string;
}

/**
 * Context manager callbacks
 */
export interface ContextManagerCallbacks {
  /** Called when message is added */
  onMessageAdded?: (roomId: RoomId, message: ConversationMessage) => void;
  /** Called when context is summarized */
  onContextSummarized?: (roomId: RoomId, summary: ContextSummary) => void;
  /** Called when context approaches token limit */
  onNearTokenLimit?: (roomId: RoomId, tokenCount: number) => void;
  /** Called to generate summary (for external AI call) */
  onSummaryNeeded?: (roomId: RoomId, messages: ConversationMessage[]) => Promise<string>;
  /** Called when context is cleared */
  onContextCleared?: (roomId: RoomId) => void;
  /** Called on error */
  onError?: (roomId: RoomId, error: string) => void;
}

/**
 * Default options
 */
const DEFAULT_OPTIONS: Required<ContextManagerOptions> = {
  defaultSystemPrompt: 'You are a helpful AI assistant in a multi-participant voice conversation.',
  maxTokensBeforeSummary: 6000,
  targetTokensAfterSummary: 2000,
  maxMessages: 100,
  tokenRatio: 4,
  enableAutoSummary: true,
  summaryInstruction: 'Summarize the key points of this conversation concisely, preserving important context and any pending questions or topics.',
};

let messageIdCounter = 0;

/**
 * Context Manager
 *
 * Manages conversation context for shared AI sessions.
 *
 * @example
 * ```typescript
 * const contextManager = new ContextManager({
 *   maxTokensBeforeSummary: 6000,
 * }, {
 *   onMessageAdded: (roomId, message) => {
 *     console.log(`New message in ${roomId}: ${message.content}`);
 *   },
 *   onSummaryNeeded: async (roomId, messages) => {
 *     // Call AI to generate summary
 *     return await ai.summarize(messages);
 *   },
 * });
 *
 * // Initialize room context
 * contextManager.initRoom('room-123', 'You are a helpful assistant.');
 *
 * // Add participant
 * contextManager.addParticipant('room-123', 'peer-1', 'Alice');
 *
 * // Add user message
 * contextManager.addUserMessage('room-123', 'Hello, AI!', 'peer-1');
 *
 * // Add AI response
 * contextManager.addAssistantMessage('room-123', 'Hello! How can I help?');
 *
 * // Get context for AI
 * const messages = contextManager.getMessagesForAI('room-123');
 * ```
 */
export class ContextManager {
  private contexts = new Map<RoomId, ConversationContext>();
  private options: Required<ContextManagerOptions>;
  private callbacks: ContextManagerCallbacks;

  constructor(
    options: ContextManagerOptions = {},
    callbacks: ContextManagerCallbacks = {}
  ) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.callbacks = callbacks;
  }

  /**
   * Initialize context for a room
   */
  initRoom(roomId: RoomId, systemPrompt?: string): void {
    if (this.contexts.has(roomId)) {
      return;
    }

    const now = new Date();
    const context: ConversationContext = {
      roomId,
      systemPrompt: systemPrompt ?? this.options.defaultSystemPrompt,
      messages: [],
      summaries: [],
      totalTokens: this.estimateTokens(systemPrompt ?? this.options.defaultSystemPrompt),
      createdAt: now,
      updatedAt: now,
      participants: new Map(),
    };

    this.contexts.set(roomId, context);
  }

  /**
   * Remove context for a room
   */
  removeRoom(roomId: RoomId): boolean {
    return this.contexts.delete(roomId);
  }

  /**
   * Check if room has context
   */
  hasRoom(roomId: RoomId): boolean {
    return this.contexts.has(roomId);
  }

  /**
   * Add a participant to the context
   */
  addParticipant(roomId: RoomId, peerId: PeerId, displayName: string): void {
    const context = this.contexts.get(roomId);
    if (!context) return;

    context.participants.set(peerId, displayName);
    context.updatedAt = new Date();
  }

  /**
   * Remove a participant from the context
   */
  removeParticipant(roomId: RoomId, peerId: PeerId): boolean {
    const context = this.contexts.get(roomId);
    if (!context) return false;

    const removed = context.participants.delete(peerId);
    if (removed) {
      context.updatedAt = new Date();
    }
    return removed;
  }

  /**
   * Get participant display name
   */
  getParticipantName(roomId: RoomId, peerId: PeerId): string | undefined {
    return this.contexts.get(roomId)?.participants.get(peerId);
  }

  /**
   * Get all participants
   */
  getParticipants(roomId: RoomId): Map<PeerId, string> {
    return this.contexts.get(roomId)?.participants ?? new Map();
  }

  /**
   * Update system prompt
   */
  setSystemPrompt(roomId: RoomId, systemPrompt: string): void {
    const context = this.contexts.get(roomId);
    if (!context) return;

    // Adjust token count
    const oldTokens = this.estimateTokens(context.systemPrompt);
    const newTokens = this.estimateTokens(systemPrompt);
    context.totalTokens = context.totalTokens - oldTokens + newTokens;

    context.systemPrompt = systemPrompt;
    context.updatedAt = new Date();
  }

  /**
   * Get system prompt
   */
  getSystemPrompt(roomId: RoomId): string | undefined {
    return this.contexts.get(roomId)?.systemPrompt;
  }

  /**
   * Add a user message to context
   */
  addUserMessage(
    roomId: RoomId,
    content: string,
    speakerId?: PeerId,
    audioDurationMs?: number
  ): ConversationMessage | null {
    const context = this.contexts.get(roomId);
    if (!context) {
      this.callbacks.onError?.(roomId, 'Room not initialized');
      return null;
    }

    const speakerName = speakerId
      ? context.participants.get(speakerId)
      : undefined;

    // Format content with speaker attribution
    const attributedContent = speakerName
      ? `[${speakerName}]: ${content}`
      : content;

    const message: ConversationMessage = {
      id: `msg-${++messageIdCounter}`,
      role: 'user',
      content: attributedContent,
      speakerId,
      speakerName,
      timestamp: new Date(),
      audioDurationMs,
      tokenEstimate: this.estimateTokens(attributedContent),
    };

    return this.addMessage(roomId, message);
  }

  /**
   * Add an assistant message to context
   */
  addAssistantMessage(
    roomId: RoomId,
    content: string,
    audioDurationMs?: number
  ): ConversationMessage | null {
    const context = this.contexts.get(roomId);
    if (!context) {
      this.callbacks.onError?.(roomId, 'Room not initialized');
      return null;
    }

    const message: ConversationMessage = {
      id: `msg-${++messageIdCounter}`,
      role: 'assistant',
      content,
      timestamp: new Date(),
      audioDurationMs,
      tokenEstimate: this.estimateTokens(content),
    };

    return this.addMessage(roomId, message);
  }

  /**
   * Add a system message to context
   */
  addSystemMessage(roomId: RoomId, content: string): ConversationMessage | null {
    const context = this.contexts.get(roomId);
    if (!context) {
      this.callbacks.onError?.(roomId, 'Room not initialized');
      return null;
    }

    const message: ConversationMessage = {
      id: `msg-${++messageIdCounter}`,
      role: 'system',
      content,
      timestamp: new Date(),
      tokenEstimate: this.estimateTokens(content),
    };

    return this.addMessage(roomId, message);
  }

  /**
   * Update a partial message (for streaming)
   */
  updateMessage(
    roomId: RoomId,
    messageId: string,
    content: string,
    isPartial: boolean = true
  ): boolean {
    const context = this.contexts.get(roomId);
    if (!context) return false;

    const message = context.messages.find((m) => m.id === messageId);
    if (!message) return false;

    // Adjust token count
    const oldTokens = message.tokenEstimate ?? 0;
    const newTokens = this.estimateTokens(content);
    context.totalTokens = context.totalTokens - oldTokens + newTokens;

    message.content = content;
    message.isPartial = isPartial;
    message.tokenEstimate = newTokens;
    context.updatedAt = new Date();

    return true;
  }

  /**
   * Get all messages for a room
   */
  getMessages(roomId: RoomId): ConversationMessage[] {
    return this.contexts.get(roomId)?.messages ?? [];
  }

  /**
   * Get messages formatted for AI (with system prompt and summaries)
   */
  getMessagesForAI(roomId: RoomId): Array<{ role: MessageRole; content: string }> {
    const context = this.contexts.get(roomId);
    if (!context) return [];

    const result: Array<{ role: MessageRole; content: string }> = [];

    // Add system prompt
    result.push({
      role: 'system',
      content: context.systemPrompt,
    });

    // Add summaries as system context
    for (const summary of context.summaries) {
      result.push({
        role: 'system',
        content: `[Previous conversation summary]: ${summary.content}`,
      });
    }

    // Add messages
    for (const message of context.messages) {
      result.push({
        role: message.role,
        content: message.content,
      });
    }

    return result;
  }

  /**
   * Get context state for clients
   */
  getContextState(roomId: RoomId): ContextState | null {
    const context = this.contexts.get(roomId);
    if (!context) return null;

    const lastMessage = context.messages[context.messages.length - 1];

    return {
      messageCount: context.messages.length,
      totalTokens: context.totalTokens,
      summaryCount: context.summaries.length,
      isNearLimit: context.totalTokens > this.options.maxTokensBeforeSummary * 0.8,
      lastMessage: lastMessage
        ? {
            role: lastMessage.role,
            speakerName: lastMessage.speakerName,
            contentPreview: lastMessage.content.substring(0, 100),
            timestamp: lastMessage.timestamp,
          }
        : undefined,
      participantCount: context.participants.size,
    };
  }

  /**
   * Get total token count
   */
  getTokenCount(roomId: RoomId): number {
    return this.contexts.get(roomId)?.totalTokens ?? 0;
  }

  /**
   * Check if context needs summarization
   */
  needsSummarization(roomId: RoomId): boolean {
    const context = this.contexts.get(roomId);
    if (!context) return false;

    return context.totalTokens > this.options.maxTokensBeforeSummary;
  }

  /**
   * Manually trigger summarization
   */
  async summarize(roomId: RoomId): Promise<ContextSummary | null> {
    const context = this.contexts.get(roomId);
    if (!context) {
      this.callbacks.onError?.(roomId, 'Room not initialized');
      return null;
    }

    if (context.messages.length < 2) {
      return null; // Not enough to summarize
    }

    // Calculate how many messages to summarize
    let tokensToSummarize = 0;
    let messagesToSummarize: ConversationMessage[] = [];

    for (const message of context.messages) {
      if (
        tokensToSummarize + (message.tokenEstimate ?? 0) >
        this.options.maxTokensBeforeSummary - this.options.targetTokensAfterSummary
      ) {
        break;
      }
      tokensToSummarize += message.tokenEstimate ?? 0;
      messagesToSummarize.push(message);
    }

    if (messagesToSummarize.length === 0) {
      return null;
    }

    try {
      // Get summary from callback
      let summaryContent: string;
      if (this.callbacks.onSummaryNeeded) {
        summaryContent = await this.callbacks.onSummaryNeeded(
          roomId,
          messagesToSummarize
        );
      } else {
        // Default simple summary
        summaryContent = this.createSimpleSummary(messagesToSummarize);
      }

      const summary: ContextSummary = {
        content: summaryContent,
        messageCount: messagesToSummarize.length,
        createdAt: new Date(),
        originalTokens: tokensToSummarize,
        summaryTokens: this.estimateTokens(summaryContent),
      };

      // Remove summarized messages
      context.messages = context.messages.slice(messagesToSummarize.length);

      // Add summary
      context.summaries.push(summary);

      // Recalculate total tokens
      context.totalTokens = this.calculateTotalTokens(context);
      context.updatedAt = new Date();

      this.callbacks.onContextSummarized?.(roomId, summary);

      return summary;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Summarization failed';
      this.callbacks.onError?.(roomId, message);
      return null;
    }
  }

  /**
   * Clear all messages (keep system prompt and participants)
   */
  clearMessages(roomId: RoomId): void {
    const context = this.contexts.get(roomId);
    if (!context) return;

    context.messages = [];
    context.summaries = [];
    context.totalTokens = this.estimateTokens(context.systemPrompt);
    context.updatedAt = new Date();

    this.callbacks.onContextCleared?.(roomId);
  }

  /**
   * Export context for persistence
   */
  exportContext(roomId: RoomId): ConversationContext | null {
    const context = this.contexts.get(roomId);
    if (!context) return null;

    // Return a copy
    return {
      ...context,
      messages: [...context.messages],
      summaries: [...context.summaries],
      participants: new Map(context.participants),
    };
  }

  /**
   * Import context from persistence
   */
  importContext(context: ConversationContext): void {
    this.contexts.set(context.roomId, {
      ...context,
      messages: [...context.messages],
      summaries: [...context.summaries],
      participants: new Map(context.participants),
      updatedAt: new Date(),
    });
  }

  /**
   * Dispose all contexts
   */
  dispose(): void {
    this.contexts.clear();
  }

  // ========== Private Methods ==========

  /**
   * Add a message to context
   */
  private addMessage(
    roomId: RoomId,
    message: ConversationMessage
  ): ConversationMessage {
    const context = this.contexts.get(roomId)!;

    // Enforce max messages
    if (context.messages.length >= this.options.maxMessages) {
      const removed = context.messages.shift();
      if (removed) {
        context.totalTokens -= removed.tokenEstimate ?? 0;
      }
    }

    context.messages.push(message);
    context.totalTokens += message.tokenEstimate ?? 0;
    context.updatedAt = new Date();

    this.callbacks.onMessageAdded?.(roomId, message);

    // Check for auto-summarization
    if (
      this.options.enableAutoSummary &&
      context.totalTokens > this.options.maxTokensBeforeSummary
    ) {
      this.callbacks.onNearTokenLimit?.(roomId, context.totalTokens);

      // Trigger async summarization
      this.summarize(roomId).catch((error) => {
        this.callbacks.onError?.(
          roomId,
          error instanceof Error ? error.message : 'Auto-summarization failed'
        );
      });
    }

    return message;
  }

  /**
   * Estimate token count for text
   */
  private estimateTokens(text: string): number {
    // Simple estimation: ~4 characters per token
    return Math.ceil(text.length / this.options.tokenRatio);
  }

  /**
   * Calculate total tokens for a context
   */
  private calculateTotalTokens(context: ConversationContext): number {
    let total = this.estimateTokens(context.systemPrompt);

    for (const summary of context.summaries) {
      total += summary.summaryTokens;
    }

    for (const message of context.messages) {
      total += message.tokenEstimate ?? 0;
    }

    return total;
  }

  /**
   * Create a simple summary without AI
   */
  private createSimpleSummary(messages: ConversationMessage[]): string {
    const speakers = new Set<string>();
    const topics: string[] = [];

    for (const message of messages) {
      if (message.speakerName) {
        speakers.add(message.speakerName);
      }
      // Extract first sentence as topic hint
      const firstSentence = message.content.split(/[.!?]/)[0];
      if (firstSentence && firstSentence.length > 10) {
        topics.push(firstSentence.substring(0, 50));
      }
    }

    const speakerList = Array.from(speakers).join(', ');
    const topicList = topics.slice(0, 3).join('; ');

    return `Conversation with ${speakers.size} participants (${speakerList}). Topics discussed: ${topicList || 'General conversation'}.`;
  }
}

/**
 * Create context manager instance
 */
export function createContextManager(
  options?: ContextManagerOptions,
  callbacks?: ContextManagerCallbacks
): ContextManager {
  return new ContextManager(options, callbacks);
}

export default ContextManager;
