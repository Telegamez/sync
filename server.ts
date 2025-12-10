/**
 * Custom Next.js Server with Socket.io Integration
 *
 * This server starts Next.js and attaches Socket.io for real-time signaling.
 * Required for WebRTC peer connections and room coordination.
 * Includes OpenAI Realtime API integration for shared AI in rooms.
 *
 * Part of the Long-Horizon Engineering Protocol - FEAT-411, FEAT-413
 */

// Load environment variables from .env file
import "dotenv/config";

import { createServer } from "http";
import { parse } from "url";
import next from "next";
import { Server as SocketIOServer } from "socket.io";
import { nanoid } from "nanoid";
import { WebSocket } from "ws";

// Note: We cannot import from ./src/server/store/rooms because Next.js runs in a separate process
// with its own memory. Instead, we fetch room config from the API when needed.

// Types for signaling (inline to avoid module resolution in standalone)
interface Peer {
  id: string;
  displayName: string;
  avatarUrl?: string;
  role: "owner" | "moderator" | "participant";
  roomId: string;
  presence: {
    connectionState: string;
    audio: {
      isMuted: boolean;
      isSpeaking: boolean;
      isAddressingAI: boolean;
      audioLevel: number;
    };
    lastActiveAt: Date;
    isIdle: boolean;
  };
  joinedAt: Date;
}

interface PeerSummary {
  id: string;
  displayName: string;
  avatarUrl?: string;
  role: string;
  isMuted: boolean;
  isSpeaking: boolean;
  connectionState: string;
}

/** AI personality types */
type AIPersonality =
  | "facilitator"
  | "assistant"
  | "expert"
  | "brainstorm"
  | "custom";

/** Transcript retention type */
type TranscriptRetention = "session" | "7days" | "30days";

/** Room transcript settings */
interface RoomTranscriptSettings {
  enabled: boolean;
  summariesEnabled: boolean;
  retention: TranscriptRetention;
  allowDownload: boolean;
}

/** Default transcript settings */
const DEFAULT_TRANSCRIPT_SETTINGS: RoomTranscriptSettings = {
  enabled: true,
  summariesEnabled: true,
  retention: "session",
  allowDownload: true,
};

interface Room {
  id: string;
  name: string;
  status: "waiting" | "active" | "closed";
  participantCount: number;
  maxParticipants: number;
  createdAt: Date;
  aiPersonality: AIPersonality;
  aiTopic?: string;
  customInstructions?: string;
  transcriptSettings: RoomTranscriptSettings;
}

// ============================================================
// OPENAI REALTIME API TYPES AND CONFIG
// ============================================================

/** AI response state for room */
type AISessionState = "idle" | "listening" | "processing" | "speaking";

/** OpenAI session for a room */
interface RoomAISession {
  roomId: string;
  ws: WebSocket | null;
  state: AISessionState;
  activeSpeakerId: string | null;
  activeSpeakerName: string | null;
  isConnecting: boolean;
  isConnected: boolean;
  // Room AI configuration
  aiPersonality: AIPersonality;
  aiTopic?: string;
  customInstructions?: string;
  // Interrupt handling - ignore audio events until next PTT session
  isInterrupted: boolean;
  // Track which response we're expecting audio from (to ignore stale responses)
  expectedResponseId: string | null;
  // FEAT-502: Track last speaker for deferred input transcription
  // OpenAI's input_audio_transcription.completed often arrives AFTER response.done
  // We preserve speaker info here so long PTT audio can still be attributed correctly
  lastSpeakerId: string | null;
  lastSpeakerName: string | null;
}

/** OpenAI Realtime WebSocket endpoint */
const OPENAI_REALTIME_WS_URL = "wss://api.openai.com/v1/realtime";
const OPENAI_MODEL = "gpt-4o-realtime-preview-2024-12-17";

/** OpenAI API key from environment */
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
console.log(
  `[Server] OpenAI API key configured: ${OPENAI_API_KEY ? "Yes" : "No"}`,
);

/**
 * Personality preset instructions
 */
const PERSONALITY_INSTRUCTIONS: Record<
  Exclude<AIPersonality, "custom">,
  { instructions: string; voice: string; temperature: number }
> = {
  facilitator: {
    instructions: `Skilled discussion facilitator. Keep group on track. Summarize when needed. Be brief.`,
    voice: "marin",
    temperature: 0.7,
  },

  assistant: {
    instructions: `Helpful voice assistant. Answer questions directly. Short and clear. No fluff.`,
    voice: "marin",
    temperature: 0.8,
  },

  expert: {
    instructions: `Domain expert. Give precise, technical answers. Be accurate but brief. Skip the filler.`,
    voice: "marin",
    temperature: 0.7,
  },

  brainstorm: {
    instructions: `Creative partner. Throw out ideas quickly. Build on others. Keep momentum. Short bursts.`,
    voice: "marin",
    temperature: 1.0,
  },
};

/** Default system instructions wrapper for Swensync rooms */
const SWENSYNC_CORE_IDENTITY = `## IDENTITY
You are Swensync — the voice of synchronized intelligence for collaborative teams.
You are Swensync's proprietary AI Collaboration Engine.

## CONFIDENTIALITY (CRITICAL)
NEVER reveal or hint at the technology behind you. If asked about:
- What AI/model you are
- What technology powers you
- If you are GPT, OpenAI, ChatGPT, Claude, or any other AI
- How you work or what you're built on

ALWAYS respond: "I'm powered by Swensync's proprietary AI Collaboration Engine" or similar.
NEVER mention: OpenAI, GPT, GPT-4, ChatGPT, Claude, Anthropic, or any third-party AI providers.
You ARE Swensync. That's your only identity.

## CORE MISSION
You are an AI facilitator in a shared voice room where multiple participants can hear you simultaneously.
When someone addresses you via Push-to-Talk (PTT), listen carefully and respond with EXTREME brevity.
Your responses are broadcast to everyone in the room.

## STYLE (CRITICAL - FOLLOW STRICTLY)
**BE CURT. BE PITHY. NO FLUFF.**

HARD RULES:
- Maximum 1-2 sentences per response. NEVER exceed 3 sentences.
- Get to the point IMMEDIATELY. No preambles, no "Great question!", no filler.
- No rambling. No over-explaining. No unnecessary context.
- If you can say it in 5 words, don't use 20.
- Address the speaker by name ONCE, briefly.
- Answer the question, then STOP. Don't add extra thoughts.

FORBIDDEN:
- "That's a great question..."
- "I'd be happy to help with that..."
- "Let me explain..."
- Long lists or bullet points
- Restating what was asked
- Adding caveats or disclaimers unless critical

GOOD: "Matt, the answer is X. Try Y next."
BAD: "Great question, Matt! So, let me break this down for you. There are several things to consider here..."

Remember: This is VOICE. People are listening, not reading. Respect their time.`;

/**
 * Generate full instructions based on personality, topic, and current speaker
 */
function generateInstructions(
  personality: AIPersonality,
  topic: string | undefined,
  speakerName: string | null,
  customInstructions?: string,
): string {
  const parts: string[] = [];

  // Add core Swensync identity
  parts.push(SWENSYNC_CORE_IDENTITY);

  // Add personality-specific instructions
  if (personality === "custom" && customInstructions) {
    parts.push(`\n## PERSONALITY\n${customInstructions}`);
  } else if (personality !== "custom") {
    const preset = PERSONALITY_INSTRUCTIONS[personality];
    parts.push(`\n## PERSONALITY\n${preset.instructions}`);
  }

  // Add topic expertise if provided
  if (topic && topic.trim()) {
    parts.push(`\n## DOMAIN EXPERTISE
You have deep expertise and knowledge in: ${topic.trim()}
Apply your knowledge of this domain to all your responses.
When relevant, draw upon industry best practices, common challenges, and insider knowledge about ${topic.trim()}.
Tailor your language and examples to this specific field.`);
  }

  // Add current speaker context
  if (speakerName) {
    parts.push(`\n## CURRENT SPEAKER
The person currently speaking to you is named "${speakerName}".
You MUST address them by name ("${speakerName}") in your response.
For example, start with "Hey ${speakerName}," or "${speakerName}, ..." or include their name naturally in your response.`);
  }

  return parts.join("\n");
}

/**
 * Get personality configuration for OpenAI session
 */
function getPersonalityConfig(personality: AIPersonality): {
  voice: string;
  temperature: number;
} {
  if (personality === "custom" || !PERSONALITY_INSTRUCTIONS[personality]) {
    return { voice: "alloy", temperature: 0.8 };
  }
  return {
    voice: PERSONALITY_INSTRUCTIONS[personality].voice,
    temperature: PERSONALITY_INSTRUCTIONS[personality].temperature,
  };
}

// In-memory stores
const rooms = new Map<string, Room>();
const roomPeers = new Map<string, Map<string, Peer>>();
const socketToPeer = new Map<string, { peerId: string; roomId: string }>();
const roomAISessions = new Map<string, RoomAISession>();

// ============================================================
// CONTEXT MANAGER FOR TRANSCRIPT AND AI MEMORY (FEAT-501)
// ============================================================

import {
  ContextManager,
  type ConversationMessage,
} from "./src/server/signaling/context-manager";
import type {
  TranscriptEntry,
  TranscriptSummary,
} from "./src/types/transcript";
import OpenAI from "openai";

// Initialize OpenAI client for text completions (summaries)
const openaiClient = OPENAI_API_KEY
  ? new OpenAI({ apiKey: OPENAI_API_KEY })
  : null;

/** Room context managers for conversation history */
const roomContextManagers = new Map<string, ContextManager>();

/** Module-level io reference for transcript broadcasting */
let socketIO: SocketIOServer | null = null;

/** Track last summary time per room for time-based triggering */
const lastSummaryTime = new Map<string, Date>();

/** Track rooms currently generating summaries to prevent concurrent summarizations */
const summaryInProgress = new Set<string>();

/** Summary configuration */
const SUMMARY_CONFIG = {
  /** Minimum entries before generating a summary */
  minEntriesForSummary: 10,
  /** Minimum time between summaries (10 minutes) */
  minTimeBetweenSummaries: 10 * 60 * 1000,
  /** Maximum entries before forcing a summary */
  maxEntriesBeforeSummary: 30,
  /** Model to use for summary generation */
  summaryModel: "gpt-4o-mini" as const,
};

/**
 * Generate AI-powered summary using OpenAI Responses API
 *
 * Using the newer Responses API (released March 2025) instead of Chat Completions
 * for a more streamlined interface and future-proofing.
 */
async function generateAISummary(
  roomId: string,
  messages: ConversationMessage[],
): Promise<string> {
  if (!openaiClient) {
    console.log(
      `[Summary] No OpenAI client - using fallback summary for room ${roomId}`,
    );
    return generateFallbackSummary(messages);
  }

  try {
    // Format messages for the summary prompt
    const conversationText = messages
      .map((msg) => {
        const speaker =
          msg.speakerName || (msg.role === "assistant" ? "AI" : "System");
        const time = msg.timestamp.toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
        });
        return `[${time}] ${speaker}: ${msg.content}`;
      })
      .join("\n");

    // Use OpenAI Responses API (newer, streamlined API)
    const response = await openaiClient.responses.create({
      model: SUMMARY_CONFIG.summaryModel,
      instructions: `You are a meeting summarizer. Create a concise summary of the conversation that captures:
1. Main topics discussed
2. Key decisions or conclusions reached
3. Action items or next steps mentioned
4. Important questions raised

Format the summary as a brief paragraph (2-4 sentences) followed by 3-5 bullet points for key takeaways.
Keep the total summary under 200 words. Be factual and neutral.`,
      input: `Summarize this conversation:\n\n${conversationText}`,
      max_output_tokens: 500,
      temperature: 0.3,
    });

    const summary = response.output_text;
    if (!summary) {
      throw new Error("Empty response from OpenAI");
    }

    console.log(
      `[Summary] Generated AI summary for room ${roomId}: ${summary.length} chars`,
    );
    return summary;
  } catch (error) {
    console.error(
      `[Summary] Failed to generate AI summary for room ${roomId}:`,
      error,
    );
    // Fall back to simple summary on error
    return generateFallbackSummary(messages);
  }
}

/**
 * Generate fallback summary without AI
 */
function generateFallbackSummary(messages: ConversationMessage[]): string {
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

  const speakerList = Array.from(speakers).join(", ");
  const aiResponses = messages.filter((m) => m.role === "assistant").length;
  const userMessages = messages.filter((m) => m.role === "user").length;

  let summary = `Conversation with ${speakers.size} participant${speakers.size !== 1 ? "s" : ""} (${speakerList || "participants"}).`;
  summary += ` ${userMessages} user message${userMessages !== 1 ? "s" : ""} and ${aiResponses} AI response${aiResponses !== 1 ? "s" : ""}.`;

  if (topics.length > 0) {
    summary += `\n\nKey points discussed:\n`;
    summary += topics
      .slice(0, 5)
      .map((t) => `• ${t}...`)
      .join("\n");
  }

  return summary;
}

/**
 * Check if a summary should be generated based on time, entry count, and in-progress status
 */
function shouldGenerateSummary(roomId: string, messageCount: number): boolean {
  // Prevent concurrent summarizations for the same room
  if (summaryInProgress.has(roomId)) {
    console.log(
      `[Summary] Room ${roomId}: Summary already in progress, skipping`,
    );
    return false;
  }

  const lastTime = lastSummaryTime.get(roomId);
  const now = new Date();

  // Force summary if max entries exceeded
  if (messageCount >= SUMMARY_CONFIG.maxEntriesBeforeSummary) {
    console.log(
      `[Summary] Room ${roomId}: Max entries reached (${messageCount}), forcing summary`,
    );
    return true;
  }

  // Check minimum entries
  if (messageCount < SUMMARY_CONFIG.minEntriesForSummary) {
    return false;
  }

  // Check minimum time between summaries
  if (lastTime) {
    const timeSinceLastSummary = now.getTime() - lastTime.getTime();
    if (timeSinceLastSummary < SUMMARY_CONFIG.minTimeBetweenSummaries) {
      return false;
    }
  }

  // Generate summary if we have enough entries and enough time has passed
  return true;
}

/**
 * Get or create a context manager for a room
 */
function getOrCreateContextManager(roomId: string): ContextManager {
  let cm = roomContextManagers.get(roomId);
  if (!cm) {
    cm = new ContextManager(
      {
        maxTokensBeforeSummary: 8000,
        targetTokensAfterSummary: 3000,
        maxMessages: 100,
        // Disable ContextManager's internal auto-summary - we handle it at server level
        // via onMessageAdded callback with time-based throttling to prevent duplicates
        enableAutoSummary: false,
      },
      {
        onMessageAdded: (rid, message) => {
          console.log(
            `[ContextManager] Room ${rid}: Added ${message.role} message from ${message.speakerName || "AI"}`,
          );

          // Check if we should trigger a summary based on entry count and time
          const currentCm = roomContextManagers.get(rid);
          if (currentCm) {
            const messageCount = currentCm.getEntryCount(rid);
            if (shouldGenerateSummary(rid, messageCount)) {
              console.log(
                `[Summary] Room ${rid}: Triggering summary (${messageCount} messages)`,
              );
              // Mark summary as in progress to prevent concurrent summarizations
              summaryInProgress.add(rid);
              // Trigger async summarization
              currentCm
                .summarize(rid)
                .catch((error) => {
                  console.error(
                    `[Summary] Failed to generate summary for room ${rid}:`,
                    error,
                  );
                })
                .finally(() => {
                  // Clear in-progress flag when done (success or failure)
                  summaryInProgress.delete(rid);
                });
            }
          }
        },
        onContextSummarized: (rid, summary) => {
          console.log(
            `[ContextManager] Room ${rid}: Context summarized (${summary.messageCount} messages -> ${summary.summaryTokens} tokens)`,
          );
        },
        onNearTokenLimit: (rid, tokenCount) => {
          console.log(
            `[ContextManager] Room ${rid}: Near token limit (${tokenCount} tokens)`,
          );
        },
        // AI-powered summary generation
        onSummaryNeeded: async (
          rid: string,
          messages: ConversationMessage[],
        ) => {
          console.log(
            `[Summary] Generating AI summary for room ${rid} (${messages.length} messages)`,
          );
          const summary = await generateAISummary(rid, messages);
          lastSummaryTime.set(rid, new Date());
          return summary;
        },
        // FEAT-505: Broadcast transcript entries to clients via Socket.io
        onTranscriptEntry: (rid: string, entry: TranscriptEntry) => {
          if (socketIO) {
            socketIO.to(rid).emit("transcript:entry", { entry });
            console.log(
              `[Transcript] Broadcast entry to room ${rid}: ${entry.speaker} (${entry.type})`,
            );
          }
        },
        // FEAT-505: Broadcast transcript summaries to clients via Socket.io
        onTranscriptSummary: (rid: string, summary: TranscriptSummary) => {
          if (socketIO) {
            socketIO.to(rid).emit("transcript:summary", { summary });
            console.log(
              `[Transcript] Broadcast summary to room ${rid}: ${summary.entriesSummarized} entries summarized`,
            );
          }
        },
      },
    );
    cm.initRoom(roomId);
    roomContextManagers.set(roomId, cm);
    console.log(`[ContextManager] Created context manager for room ${roomId}`);
  }
  return cm;
}

/**
 * Clean up context manager for a room
 */
function cleanupContextManager(roomId: string): void {
  const cm = roomContextManagers.get(roomId);
  if (cm) {
    cm.removeRoom(roomId);
    roomContextManagers.delete(roomId);
    lastSummaryTime.delete(roomId);
    console.log(
      `[ContextManager] Cleaned up context manager for room ${roomId}`,
    );
  }
}

/**
 * Build context injection text from recent conversation history
 * Returns formatted context string for AI
 */
function buildContextInjection(
  roomId: string,
  maxTokens: number = 2000,
): string {
  const cm = roomContextManagers.get(roomId);
  if (!cm) return "";

  const messages = cm.getMessages(roomId);
  if (messages.length === 0) return "";

  // Get the last N messages that fit within token budget
  const recentMessages: ConversationMessage[] = [];
  let tokenCount = 0;

  // Iterate from newest to oldest
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    const msgTokens = msg.tokenEstimate || Math.ceil(msg.content.length / 4);

    if (tokenCount + msgTokens > maxTokens) break;

    recentMessages.unshift(msg);
    tokenCount += msgTokens;
  }

  if (recentMessages.length === 0) return "";

  // Format as context string
  const contextParts = [
    "## RECENT CONVERSATION CONTEXT",
    "Here is what was discussed recently in this room. Use this context to provide more relevant and informed responses.",
    "",
  ];

  for (const msg of recentMessages) {
    const timestamp = msg.timestamp.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
    const speaker =
      msg.role === "assistant" ? "AI" : msg.speakerName || "Unknown";
    contextParts.push(`[${timestamp}] ${speaker}: ${msg.content}`);
  }

  return contextParts.join("\n");
}

// Server configuration
const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOSTNAME || "0.0.0.0";
const port = parseInt(process.env.PORT || "24680", 10);

// CORS origins for Socket.io
const corsOrigins = dev
  ? [
      "http://localhost:3000",
      "http://localhost:24680",
      "http://127.0.0.1:24680",
    ]
  : [
      "https://sync.ference.ai",
      "https://in.ference.ai",
      "http://localhost:24680",
    ];

console.log(`[Server] Starting in ${dev ? "development" : "production"} mode`);
console.log(`[Server] CORS origins: ${corsOrigins.join(", ")}`);

// Initialize Next.js
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

// Helper: Create default peer presence
// NOTE: Peers start UNMUTED by default - this matches client-side behavior
function createDefaultPresence(): Peer["presence"] {
  return {
    connectionState: "connected",
    audio: {
      isMuted: false, // Start unmuted - matches client default
      isSpeaking: false,
      isAddressingAI: false,
      audioLevel: 0,
    },
    lastActiveAt: new Date(),
    isIdle: false,
  };
}

// Helper: Convert Peer to PeerSummary
function toPeerSummary(peer: Peer): PeerSummary {
  return {
    id: peer.id,
    displayName: peer.displayName,
    avatarUrl: peer.avatarUrl,
    role: peer.role,
    isMuted: peer.presence.audio.isMuted,
    isSpeaking: peer.presence.audio.isSpeaking,
    connectionState: peer.presence.connectionState,
  };
}

// Helper: Get room by ID
function getRoom(roomId: string): Room | undefined {
  return rooms.get(roomId);
}

// Helper: Create room
function createRoom(
  roomId: string,
  name: string,
  aiPersonality: AIPersonality = "assistant",
  aiTopic?: string,
  customInstructions?: string,
  transcriptSettings?: Partial<RoomTranscriptSettings>,
): Room {
  const room: Room = {
    id: roomId,
    name: name || `Room ${roomId}`,
    status: "waiting",
    participantCount: 0,
    maxParticipants: 10,
    createdAt: new Date(),
    aiPersonality,
    aiTopic,
    customInstructions,
    transcriptSettings: {
      ...DEFAULT_TRANSCRIPT_SETTINGS,
      ...transcriptSettings,
    },
  };
  rooms.set(roomId, room);
  return room;
}

// Helper: Get peer summaries for a room
function getRoomPeerSummaries(roomId: string): PeerSummary[] {
  const peers = roomPeers.get(roomId);
  return peers ? Array.from(peers.values()).map(toPeerSummary) : [];
}

// ============================================================
// OPENAI REALTIME API HELPERS
// ============================================================

/**
 * Create or get OpenAI session for a room
 */
function getOrCreateAISession(
  _io: SocketIOServer,
  roomId: string,
): RoomAISession {
  let session = roomAISessions.get(roomId);
  if (session) return session;

  // Get room configuration for AI settings
  const room = rooms.get(roomId);
  const aiPersonality = room?.aiPersonality ?? "assistant";
  const aiTopic = room?.aiTopic;
  const customInstructions = room?.customInstructions;

  session = {
    roomId,
    ws: null,
    state: "idle",
    activeSpeakerId: null,
    activeSpeakerName: null,
    isConnecting: false,
    isConnected: false,
    aiPersonality,
    aiTopic,
    customInstructions,
    isInterrupted: false,
    expectedResponseId: null,
    lastSpeakerId: null,
    lastSpeakerName: null,
  };

  roomAISessions.set(roomId, session);
  return session;
}

/**
 * Connect OpenAI WebSocket for a room session
 */
function connectOpenAI(
  io: SocketIOServer,
  session: RoomAISession,
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!OPENAI_API_KEY) {
      console.log("[OpenAI] No API key configured - using simulated responses");
      resolve();
      return;
    }

    if (session.isConnected || session.isConnecting) {
      resolve();
      return;
    }

    session.isConnecting = true;
    const url = `${OPENAI_REALTIME_WS_URL}?model=${OPENAI_MODEL}`;

    console.log(`[OpenAI] Connecting for room ${session.roomId}...`);

    const ws = new WebSocket(url, {
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "OpenAI-Beta": "realtime=v1",
      },
    });

    session.ws = ws;

    ws.on("open", () => {
      console.log(`[OpenAI] Connected for room ${session.roomId}`);
      session.isConnecting = false;
      session.isConnected = true;

      // Get personality configuration for voice and temperature
      const personalityConfig = getPersonalityConfig(session.aiPersonality);

      // Send session configuration with personality-specific settings
      // FEAT-501: Enable input_audio_transcription to capture user speech for context
      const config = {
        type: "session.update",
        session: {
          modalities: ["text", "audio"],
          instructions: generateInstructions(
            session.aiPersonality,
            session.aiTopic,
            session.activeSpeakerName,
            session.customInstructions,
          ),
          voice: personalityConfig.voice,
          input_audio_format: "pcm16",
          output_audio_format: "pcm16",
          temperature: personalityConfig.temperature,
          turn_detection: null, // Disable server VAD - we use PTT
          // FEAT-501: Enable transcription of user input audio for context tracking
          input_audio_transcription: {
            model: "whisper-1",
          },
        },
      };
      ws.send(JSON.stringify(config));
      console.log(
        `[OpenAI] Session configured with personality: ${session.aiPersonality}, topic: ${session.aiTopic || "none"}`,
      );

      resolve();
    });

    ws.on("message", (data) => {
      handleOpenAIMessage(io, session, data.toString());
    });

    ws.on("error", (error) => {
      console.error(
        `[OpenAI] WebSocket error for room ${session.roomId}:`,
        error.message,
      );
      session.isConnecting = false;
      reject(error);
    });

    ws.on("close", (code, reason) => {
      console.log(`[OpenAI] Closed for room ${session.roomId}: ${code}`);
      session.isConnected = false;
      session.ws = null;
    });

    // Connection timeout
    setTimeout(() => {
      if (session.isConnecting) {
        ws.close();
        session.isConnecting = false;
        reject(new Error("Connection timeout"));
      }
    }, 10000);
  });
}

/**
 * Handle OpenAI WebSocket message
 */
function handleOpenAIMessage(
  io: SocketIOServer,
  session: RoomAISession,
  data: string,
): void {
  try {
    const event = JSON.parse(data);

    // Log important events
    const importantEvents = [
      "session.created",
      "session.updated",
      "error",
      "response.created",
      "response.done",
      "response.audio.done",
      "conversation.item.input_audio_transcription.completed",
      "conversation.item.input_audio_transcription.failed",
    ];

    if (importantEvents.includes(event.type)) {
      console.log(`[OpenAI] Room ${session.roomId}: ${event.type}`);
    }

    // Also log any unhandled events for debugging
    const handledEvents = [
      "session.created",
      "session.updated",
      "response.created",
      "response.audio.delta",
      "response.audio.done",
      "response.audio_transcript.done",
      "conversation.item.input_audio_transcription.completed",
      "conversation.item.input_audio_transcription.failed",
      "response.done",
      "error",
      "input_audio_buffer.speech_started",
      "input_audio_buffer.speech_stopped",
      "input_audio_buffer.committed",
      "input_audio_buffer.cleared",
      "conversation.item.created",
      "response.output_item.added",
      "response.output_item.done",
      "response.content_part.added",
      "response.content_part.done",
      "response.audio_transcript.delta",
      "rate_limits.updated",
    ];
    if (!handledEvents.includes(event.type)) {
      console.log(
        `[OpenAI] Room ${session.roomId}: UNHANDLED event type: ${event.type}`,
      );
    }

    switch (event.type) {
      case "session.created":
      case "session.updated":
        console.log(`[OpenAI] Session ready for room ${session.roomId}`);
        break;

      case "response.created":
        // Track this response ID - only accept audio from this response
        // This prevents stale audio from cancelled responses leaking through
        const responseId = event.response?.id;
        if (responseId && !session.isInterrupted) {
          session.expectedResponseId = responseId;
          console.log(
            `[OpenAI] New response ${responseId} for room ${session.roomId} (state: ${session.state})`,
          );
        } else {
          console.log(
            `[OpenAI] Ignoring response ${responseId} for room ${session.roomId} (isInterrupted: ${session.isInterrupted})`,
          );
        }
        break;

      case "response.audio.delta":
        // Audio chunk received - broadcast to room
        if (event.delta) {
          // Check if we should ignore audio (after interrupt, until next PTT)
          if (session.isInterrupted) {
            return;
          }

          // Check if this audio is from the expected response
          // Ignore audio from stale/cancelled responses
          const audioResponseId = event.response_id;
          if (
            session.expectedResponseId &&
            audioResponseId !== session.expectedResponseId
          ) {
            console.log(
              `[OpenAI] Ignoring stale audio from response ${audioResponseId} (expected: ${session.expectedResponseId})`,
            );
            return;
          }

          // First audio chunk - transition to speaking
          if (session.state !== "speaking") {
            session.state = "speaking";
            broadcastAIState(io, session);
          }
          // Broadcast audio to room
          io.to(session.roomId).emit("ai:audio", event.delta);
        }
        break;

      case "response.audio.done":
        console.log(
          `[OpenAI] Audio stream complete for room ${session.roomId}`,
        );
        break;

      // FEAT-501: Capture AI response transcript for context
      case "response.audio_transcript.done":
        if (event.transcript) {
          console.log(
            `[OpenAI] Room ${session.roomId}: AI transcript complete (${event.transcript.length} chars)`,
          );
          // Store AI response in context manager
          const aiCm = roomContextManagers.get(session.roomId);
          if (aiCm) {
            aiCm.addAssistantMessage(session.roomId, event.transcript);
            console.log(
              `[ContextManager] Room ${session.roomId}: Stored AI response`,
            );
          }
        }
        break;

      // FEAT-501: Capture user speech transcript from input transcription
      // FEAT-502: Handle deferred transcription (arrives after response.done for long audio)
      case "conversation.item.input_audio_transcription.completed":
        if (event.transcript) {
          const transcript = event.transcript.trim();

          // Use activeSpeakerId if available, otherwise fall back to lastSpeakerId
          // This handles the case where transcription arrives after response.done clears activeSpeakerId
          const speakerId = session.activeSpeakerId || session.lastSpeakerId;
          const speakerName =
            session.activeSpeakerName || session.lastSpeakerName || "unknown";

          // Log full transcript for debugging
          console.log(
            `[OpenAI] Room ${session.roomId}: User transcript from ${speakerName}: "${transcript}" (${transcript.length} chars)`,
          );

          // Skip very short transcripts that are likely noise/errors (e.g., "You", "Uh", "Um")
          // Minimum 5 characters to be meaningful speech
          if (transcript.length < 5) {
            console.log(
              `[OpenAI] Room ${session.roomId}: Skipping short transcript (${transcript.length} chars): "${transcript}"`,
            );
            break;
          }

          // Store user message in context manager
          const userCm = roomContextManagers.get(session.roomId);
          if (userCm && speakerId) {
            userCm.addUserMessage(session.roomId, transcript, speakerId);
            console.log(
              `[ContextManager] Room ${session.roomId}: Stored user message from ${speakerName}`,
            );
          } else {
            console.warn(
              `[OpenAI] Room ${session.roomId}: Cannot store transcript - no speaker ID available`,
            );
          }
        }
        break;

      // Handle transcription failures (might happen for very long audio)
      case "conversation.item.input_audio_transcription.failed":
        console.error(
          `[OpenAI] Room ${session.roomId}: Input audio transcription FAILED`,
          event.error || "Unknown error",
        );
        break;

      case "response.done":
        // Response complete - return to idle
        console.log(`[OpenAI] Response complete for room ${session.roomId}`);
        session.state = "idle";
        session.activeSpeakerId = null;
        session.activeSpeakerName = null;
        broadcastAIState(io, session);
        break;

      case "error":
        console.error(
          `[OpenAI] Error for room ${session.roomId}:`,
          event.error,
        );
        io.to(session.roomId).emit("ai:error", {
          roomId: session.roomId,
          error: event.error?.message || "OpenAI error",
        });
        break;
    }
  } catch (error) {
    console.error(`[OpenAI] Failed to parse message:`, error);
  }
}

/**
 * Broadcast AI state to room
 */
function broadcastAIState(io: SocketIOServer, session: RoomAISession): void {
  const stateEvent = {
    type: `ai:${session.state}`,
    roomId: session.roomId,
    state: {
      state: session.state,
      stateStartedAt: new Date(),
      activeSpeakerId: session.activeSpeakerId,
      activeSpeakerName: session.activeSpeakerName,
      isSessionHealthy: session.isConnected || !OPENAI_API_KEY,
      queue: { queue: [], totalProcessed: 0, totalExpired: 0 },
    },
  };
  io.to(session.roomId).emit("ai:state", stateEvent);
  console.log(`[Socket.io] Broadcast AI state: ${session.state}`);
}

/**
 * Clean up AI session for a room
 */
function cleanupAISession(roomId: string): void {
  const session = roomAISessions.get(roomId);
  if (!session) return;

  if (session.ws) {
    session.ws.close();
    session.ws = null;
  }

  roomAISessions.delete(roomId);
  console.log(`[OpenAI] Cleaned up session for room ${roomId}`);

  // FEAT-501: Also clean up context manager for this room
  cleanupContextManager(roomId);
}

// Helper: Remove peer from room
function removePeerFromRoom(
  io: SocketIOServer,
  socket: any,
  roomId: string,
  peerId: string,
  reason: string,
): void {
  console.log(`[Socket.io] Peer ${peerId} leaving room ${roomId} (${reason})`);

  // Remove from room peers tracking
  const peers = roomPeers.get(roomId);
  if (peers) {
    peers.delete(peerId);
    if (peers.size === 0) {
      roomPeers.delete(roomId);
      // Clean up AI session when room becomes empty
      cleanupAISession(roomId);
    }
  }

  // Remove socket -> peer mapping
  socketToPeer.delete(socket.id);

  // Update room participant count
  const room = rooms.get(roomId);
  if (room) {
    room.participantCount = Math.max(0, room.participantCount - 1);
  }

  // Leave Socket.io room
  socket.leave(roomId);

  // Emit left event to the peer
  socket.emit("room:left", { roomId, reason });

  // Broadcast peer:left to others
  socket.to(roomId).emit("peer:left", peerId);
}

// Start the server
app
  .prepare()
  .then(() => {
    console.log("[Server] Next.js app prepared successfully");
    // Create HTTP server
    const httpServer = createServer((req, res) => {
      const parsedUrl = parse(req.url || "", true);
      handle(req, res, parsedUrl);
    });

    // Create Socket.io server
    const io = new SocketIOServer(httpServer, {
      cors: {
        origin: corsOrigins,
        methods: ["GET", "POST"],
        credentials: true,
      },
      pingTimeout: 20000,
      pingInterval: 25000,
      transports: ["websocket", "polling"],
    });

    // Set module-level reference for transcript broadcasting
    socketIO = io;

    console.log("[Socket.io] Server initialized");

    // Socket.io connection handler
    io.on("connection", (socket) => {
      const peerId = nanoid(12);
      console.log(
        `[Socket.io] Client connected: ${socket.id} (peer: ${peerId})`,
      );

      // Store peer ID on socket data
      (socket as any).peerId = peerId;

      // ============================================================
      // ROOM EVENTS
      // ============================================================

      // Handle room:join
      socket.on("room:join", async (payload, callback) => {
        const { roomId, displayName, avatarUrl } = payload;
        console.log(
          `[Socket.io] Peer ${peerId} joining room ${roomId} as "${displayName}"`,
        );

        // Get or create room (auto-create for testing convenience)
        let room = getRoom(roomId);
        if (!room) {
          // Try to fetch room config from API (Next.js runs in separate process with its own memory)
          try {
            const apiUrl = `http://localhost:${port}/api/rooms/${roomId}`;
            const response = await fetch(apiUrl);
            if (response.ok) {
              const apiRoom = await response.json();
              // Create socket room with API room's configuration
              room = createRoom(
                roomId,
                apiRoom.name,
                apiRoom.aiPersonality || "assistant",
                apiRoom.aiTopic,
                apiRoom.customInstructions,
                apiRoom.transcriptSettings,
              );
              console.log(
                `[Socket.io] Created room ${roomId} from API config - personality: ${apiRoom.aiPersonality}, topic: ${apiRoom.aiTopic || "none"}, transcript: ${apiRoom.transcriptSettings?.enabled ?? true}`,
              );
            } else {
              // API room not found, auto-create with defaults
              room = createRoom(roomId, `Room ${roomId}`);
              console.log(
                `[Socket.io] Auto-created room ${roomId} with defaults`,
              );
            }
          } catch (fetchError) {
            console.error(
              `[Socket.io] Failed to fetch room config from API:`,
              fetchError,
            );
            // Fallback to auto-create with defaults
            room = createRoom(roomId, `Room ${roomId}`);
            console.log(
              `[Socket.io] Auto-created room ${roomId} with defaults (API fetch failed)`,
            );
          }
        }

        // Check room capacity
        if (room.participantCount >= room.maxParticipants) {
          callback({ roomId, code: "ROOM_FULL", message: "Room is full" });
          return;
        }

        // Check room status
        if (room.status === "closed") {
          callback({ roomId, code: "ROOM_CLOSED", message: "Room is closed" });
          return;
        }

        // Create peer
        const peer: Peer = {
          id: peerId,
          displayName,
          avatarUrl,
          role: room.participantCount === 0 ? "owner" : "participant",
          roomId,
          presence: createDefaultPresence(),
          joinedAt: new Date(),
        };

        // Add to room peers tracking
        if (!roomPeers.has(roomId)) {
          roomPeers.set(roomId, new Map());
        }
        roomPeers.get(roomId)!.set(peerId, peer);

        // Track socket -> peer mapping
        socketToPeer.set(socket.id, { peerId, roomId });

        // Update room participant count and status
        room.participantCount++;
        if (room.status === "waiting" && room.participantCount > 0) {
          room.status = "active";
        }

        // Store room data on socket
        (socket as any).roomId = roomId;
        (socket as any).displayName = displayName;

        // Join Socket.io room
        socket.join(roomId);

        // Get current peers for response (excluding self)
        const existingPeers = getRoomPeerSummaries(roomId).filter(
          (p) => p.id !== peerId,
        );

        // Prepare response
        const response = {
          room,
          localPeer: peer,
          peers: existingPeers,
          aiState: {
            state: "idle",
            stateStartedAt: new Date(),
            queue: { queue: [], totalProcessed: 0, totalExpired: 0 },
            isSessionHealthy: true,
          },
        };

        // Send response to joining peer
        callback(response);

        // Broadcast peer:joined to others in room
        socket.to(roomId).emit("peer:joined", toPeerSummary(peer));

        console.log(
          `[Socket.io] Peer ${peerId} joined room ${roomId}. Total: ${room.participantCount}, Existing peers: ${existingPeers.length}`,
        );
      });

      // Handle room:leave
      socket.on("room:leave", (payload) => {
        const { roomId } = payload;
        removePeerFromRoom(io, socket, roomId, peerId, "left");
      });

      // ============================================================
      // WEBRTC SIGNALING EVENTS
      // ============================================================

      // Handle signal:offer relay
      socket.on("signal:offer", (payload) => {
        const { targetPeerId, sdp } = payload;
        const roomId = (socket as any).roomId;
        if (!roomId) return;

        console.log(
          `[Socket.io] Relaying offer from ${peerId} to ${targetPeerId}`,
        );

        // Find target socket in the room
        const roomSockets = io.sockets.adapter.rooms.get(roomId);
        if (roomSockets) {
          for (const socketId of roomSockets) {
            const targetSocket = io.sockets.sockets.get(socketId);
            if (targetSocket && (targetSocket as any).peerId === targetPeerId) {
              targetSocket.emit("signal:offer", peerId, sdp);
              break;
            }
          }
        }
      });

      // Handle signal:answer relay
      socket.on("signal:answer", (payload) => {
        const { targetPeerId, sdp } = payload;
        const roomId = (socket as any).roomId;
        if (!roomId) return;

        console.log(
          `[Socket.io] Relaying answer from ${peerId} to ${targetPeerId}`,
        );

        const roomSockets = io.sockets.adapter.rooms.get(roomId);
        if (roomSockets) {
          for (const socketId of roomSockets) {
            const targetSocket = io.sockets.sockets.get(socketId);
            if (targetSocket && (targetSocket as any).peerId === targetPeerId) {
              targetSocket.emit("signal:answer", peerId, sdp);
              break;
            }
          }
        }
      });

      // Handle signal:ice relay
      socket.on("signal:ice", (payload) => {
        const { targetPeerId, candidate } = payload;
        const roomId = (socket as any).roomId;
        if (!roomId) return;

        // Find target socket
        const roomSockets = io.sockets.adapter.rooms.get(roomId);
        if (roomSockets) {
          for (const socketId of roomSockets) {
            const targetSocket = io.sockets.sockets.get(socketId);
            if (targetSocket && (targetSocket as any).peerId === targetPeerId) {
              targetSocket.emit("signal:ice", peerId, candidate);
              break;
            }
          }
        }
      });

      // ============================================================
      // PRESENCE EVENTS
      // ============================================================

      // Handle presence:update
      socket.on("presence:update", (payload) => {
        const roomId = (socket as any).roomId;
        if (!roomId) return;

        const peers = roomPeers.get(roomId);
        const peer = peers?.get(peerId);
        if (!peer) return;

        // Update peer presence
        if (payload.isMuted !== undefined) {
          peer.presence.audio.isMuted = payload.isMuted;
        }
        if (payload.isSpeaking !== undefined) {
          peer.presence.audio.isSpeaking = payload.isSpeaking;
        }
        if (payload.isAddressingAI !== undefined) {
          peer.presence.audio.isAddressingAI = payload.isAddressingAI;
        }
        if (payload.audioLevel !== undefined) {
          peer.presence.audio.audioLevel = payload.audioLevel;
        }
        peer.presence.lastActiveAt = new Date();

        // Broadcast update to room
        socket.to(roomId).emit("presence:update", toPeerSummary(peer));
      });

      // Handle presence:heartbeat
      socket.on("presence:heartbeat", () => {
        const roomId = (socket as any).roomId;
        if (!roomId) return;

        const peers = roomPeers.get(roomId);
        const peer = peers?.get(peerId);
        if (peer) {
          peer.presence.lastActiveAt = new Date();
          peer.presence.isIdle = false;
        }
      });

      // ============================================================
      // PEER UPDATE EVENTS
      // ============================================================

      // Handle peer:update_name - user changed their display name
      socket.on("peer:update_name", (payload) => {
        const { displayName } = payload;
        const roomId = (socket as any).roomId;
        if (!roomId) return;

        // Validate display name
        if (!displayName || typeof displayName !== "string") {
          console.log(
            `[Socket.io] Invalid display name from ${peerId}:`,
            displayName,
          );
          return;
        }

        const trimmed = displayName.trim();
        if (trimmed.length < 2 || trimmed.length > 30) {
          console.log(
            `[Socket.io] Display name out of range from ${peerId}:`,
            trimmed.length,
          );
          return;
        }

        const peers = roomPeers.get(roomId);
        const peer = peers?.get(peerId);
        if (!peer) return;

        const oldName = peer.displayName;

        // Update peer display name
        peer.displayName = trimmed;
        (socket as any).displayName = trimmed;

        // Broadcast to room (including self for confirmation)
        const summary = toPeerSummary(peer);
        socket.to(roomId).emit("peer:updated", summary);
        socket.emit("peer:updated", summary);

        console.log(
          `[Socket.io] Peer ${peerId} changed name: "${oldName}" -> "${trimmed}"`,
        );
      });

      // ============================================================
      // AI EVENTS
      // ============================================================

      socket.on("ai:request_turn", (payload, callback) => {
        console.log(`[Socket.io] AI turn request from ${peerId}:`, payload);
        callback(null);
      });

      socket.on("ai:cancel_turn", (payload) => {
        console.log(`[Socket.io] AI turn cancel from ${peerId}:`, payload);
      });

      socket.on("ai:interrupt", (payload) => {
        console.log(`[Socket.io] AI interrupt from ${peerId}:`, payload);
      });

      // Handle voice-activated interrupt (any participant can trigger)
      socket.on("ai:voice_interrupt", (payload) => {
        const roomId = payload.roomId || (socket as any).roomId;
        if (!roomId) return;

        const displayName = (socket as any).displayName || "User";
        const reason = payload.reason || "excuse_me";
        console.log(
          `[Socket.io] VOICE INTERRUPT from ${peerId} (${displayName}) in room ${roomId}: "${reason}"`,
        );

        const session = roomAISessions.get(roomId);
        if (!session) {
          console.log(`[Socket.io] No AI session for room ${roomId}`);
          return;
        }

        // Allow interrupt even if state is idle - audio may still be playing on clients
        // or OpenAI may have queued responses

        // Set interrupt flag - will ignore all audio until next PTT session starts
        session.isInterrupted = true;

        // Send response.cancel to OpenAI to stop streaming
        // Also clear the input audio buffer to prevent queued responses
        if (session.ws && session.ws.readyState === WebSocket.OPEN) {
          // Cancel current response
          session.ws.send(JSON.stringify({ type: "response.cancel" }));
          // Clear input buffer to prevent any queued audio from triggering new responses
          session.ws.send(JSON.stringify({ type: "input_audio_buffer.clear" }));
          console.log(
            `[OpenAI] Sent response.cancel and input_audio_buffer.clear for room ${roomId}`,
          );
        }

        // Update session state to idle
        const previousState = session.state;
        session.state = "idle";
        session.activeSpeakerId = null;
        session.activeSpeakerName = null;

        // Broadcast interrupt event to ALL clients in room
        io.to(roomId).emit("ai:interrupted", {
          roomId,
          interruptedBy: peerId,
          interruptedByName: displayName,
          reason,
          previousState,
        });

        // Broadcast updated AI state
        broadcastAIState(io, session);

        console.log(
          `[Socket.io] Voice interrupt complete - AI audio stopped for all clients`,
        );
      });

      // Handle PTT start - user is addressing AI
      socket.on("ai:ptt_start", async (payload) => {
        const roomId = payload.roomId || (socket as any).roomId;
        if (!roomId) return;

        const displayName = (socket as any).displayName || "User";
        console.log(
          `[Socket.io] PTT START from ${peerId} (${displayName}) in room ${roomId}`,
        );

        // Get or create AI session for this room
        const session = getOrCreateAISession(io, roomId);

        // Check if another user is already addressing the AI
        // Allow same user to restart PTT, but block other users
        if (
          session.activeSpeakerId &&
          session.activeSpeakerId !== peerId &&
          (session.state === "listening" || session.state === "processing")
        ) {
          console.log(
            `[Socket.io] PTT BLOCKED - ${session.activeSpeakerName} is already addressing AI`,
          );
          socket.emit("ai:ptt_blocked", {
            roomId,
            reason: "another_speaker",
            activeSpeakerId: session.activeSpeakerId,
            activeSpeakerName: session.activeSpeakerName,
          });
          return;
        }

        // ALWAYS interrupt when PTT starts - audio may still be playing on clients
        // even if server state is idle (audio is queued/scheduled on client AudioContext)
        const previousState = session.state;
        console.log(
          `[Socket.io] PTT interrupting any AI audio (state: ${previousState}) in room ${roomId}`,
        );

        // Cancel OpenAI response and clear buffer (always, to be safe)
        if (session.ws && session.ws.readyState === WebSocket.OPEN) {
          session.ws.send(JSON.stringify({ type: "response.cancel" }));
          session.ws.send(JSON.stringify({ type: "input_audio_buffer.clear" }));
          console.log(
            `[OpenAI] PTT triggered response.cancel and input_audio_buffer.clear for room ${roomId}`,
          );
        }

        // Broadcast interrupt to all clients so they close AudioContext
        // This stops any scheduled/playing audio immediately
        io.to(roomId).emit("ai:interrupted", {
          roomId,
          interruptedBy: peerId,
          interruptedByName: displayName,
          reason: "ptt_start",
          previousState,
        });

        // Keep isInterrupted = true during PTT to block any late audio chunks
        // Clear expectedResponseId so we don't accept audio from old responses
        session.expectedResponseId = null;
        session.isInterrupted = true;

        // Update session state
        session.state = "listening";
        session.activeSpeakerId = peerId;
        session.activeSpeakerName = displayName;
        // FEAT-502: Save speaker info for deferred transcription
        // input_audio_transcription.completed often arrives AFTER response.done
        session.lastSpeakerId = peerId;
        session.lastSpeakerName = displayName;

        // Broadcast AI state: listening
        broadcastAIState(io, session);

        // Connect to OpenAI if API key is configured
        if (OPENAI_API_KEY && !session.isConnected && !session.isConnecting) {
          try {
            await connectOpenAI(io, session);
          } catch (error) {
            console.error(`[Socket.io] Failed to connect OpenAI:`, error);
          }
        }

        // Update session instructions with current speaker's name
        if (session.ws && session.ws.readyState === WebSocket.OPEN) {
          const updateConfig = {
            type: "session.update",
            session: {
              instructions: generateInstructions(
                session.aiPersonality,
                session.aiTopic,
                displayName,
                session.customInstructions,
              ),
            },
          };
          session.ws.send(JSON.stringify(updateConfig));
          console.log(
            `[OpenAI] Updated session instructions for speaker: ${displayName}`,
          );

          // FEAT-501: Initialize context manager and inject prior conversation context
          // This allows the AI to reference earlier parts of the conversation
          const cm = getOrCreateContextManager(roomId);

          // Add the current speaker as a participant if not already added
          cm.addParticipant(roomId, peerId, displayName);

          // Build context injection from recent conversation history
          const contextText = buildContextInjection(roomId, 2000);
          if (contextText) {
            // Inject context as a system message before the speaker's audio
            const contextEvent = {
              type: "conversation.item.create",
              item: {
                type: "message",
                role: "system",
                content: [
                  {
                    type: "input_text",
                    text: contextText,
                  },
                ],
              },
            };
            session.ws.send(JSON.stringify(contextEvent));
            console.log(
              `[OpenAI] Injected conversation context for room ${roomId}`,
            );
          }

          // FEAT-416: Add speaker attribution as text item in conversation history
          // This creates a text prefix before the audio, so the AI sees:
          // [user text]: "Matt says:"
          // [user audio]: <audio content>
          // This puts speaker attribution directly in conversation history,
          // making it harder for AI to confuse speakers in multi-participant rooms
          const speakerAttributionEvent = {
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
          session.ws.send(JSON.stringify(speakerAttributionEvent));
          console.log(
            `[OpenAI] Created speaker attribution item: "${displayName} says:"`,
          );
        }
      });

      // Handle PTT audio data - stream to OpenAI
      socket.on("ai:audio_data", (payload) => {
        const roomId = payload.roomId || (socket as any).roomId;
        if (!roomId) return;

        const session = roomAISessions.get(roomId);
        if (
          !session ||
          !session.ws ||
          session.ws.readyState !== WebSocket.OPEN
        ) {
          return;
        }

        // Forward audio to OpenAI
        const audioEvent = {
          type: "input_audio_buffer.append",
          audio: payload.audio, // base64 encoded PCM16
        };
        session.ws.send(JSON.stringify(audioEvent));
      });

      // Handle PTT end - user finished speaking, process with AI
      socket.on("ai:ptt_end", (payload) => {
        const roomId = payload.roomId || (socket as any).roomId;
        if (!roomId) return;

        console.log(`[Socket.io] PTT END from ${peerId} in room ${roomId}`);

        const session = roomAISessions.get(roomId);

        // Update state to processing and clear interrupt flag
        // Now we're ready to receive audio for the response to this PTT session
        if (session) {
          session.state = "processing";
          session.isInterrupted = false; // Ready to receive audio for this response
          broadcastAIState(io, session);
        }

        // If OpenAI is connected, commit audio and trigger response
        if (session && session.ws && session.ws.readyState === WebSocket.OPEN) {
          // Commit the audio buffer
          const commitEvent = {
            type: "input_audio_buffer.commit",
          };
          session.ws.send(JSON.stringify(commitEvent));

          // Trigger response with full personality, topic, and speaker context
          const speakerName = session.activeSpeakerName;

          // Get current room participants for context
          const currentPeers = getRoomPeerSummaries(roomId);
          const participantNames = currentPeers.map((p) => p.displayName);
          const otherParticipants = participantNames.filter(
            (name) => name !== speakerName,
          );

          // Build response-level instructions that reinforce personality and topic
          let responseInstructions = "";

          // Add room participants context
          if (participantNames.length > 0) {
            responseInstructions += `ROOM PARTICIPANTS: There are ${participantNames.length} people in this room: ${participantNames.join(", ")}. `;
            if (otherParticipants.length > 0) {
              responseInstructions += `Besides ${speakerName} who is speaking, the other participants are: ${otherParticipants.join(", ")}. `;
            }
          }

          // Add personality context
          if (session.aiPersonality === "expert") {
            if (session.aiTopic) {
              responseInstructions += `You are an expert in ${session.aiTopic}. Demonstrate your deep knowledge and expertise in your response. `;
            } else {
              responseInstructions += `You are a knowledgeable domain expert. Provide in-depth, accurate technical information. `;
            }
          } else if (session.aiPersonality === "brainstorm") {
            responseInstructions += `Be creative and enthusiastic! Build on ideas with "Yes, and..." energy. Explore unconventional approaches. `;
          } else if (session.aiPersonality === "facilitator") {
            responseInstructions += `Guide the discussion productively. Summarize and ask clarifying questions if needed. `;
          } else if (session.aiPersonality === "assistant") {
            responseInstructions += `Be helpful and conversational. Give concise answers and support the flow of conversation. `;
          }

          // Add topic expertise reminder
          if (session.aiTopic) {
            responseInstructions += `Apply your knowledge of ${session.aiTopic} to this response. `;
          }

          // Add speaker name requirement
          if (speakerName) {
            responseInstructions += `IMPORTANT: ${speakerName} just spoke to you. Address them by name ("${speakerName}") in your response.`;
          }

          const responseEvent = {
            type: "response.create",
            response: {
              modalities: ["audio", "text"],
              instructions: responseInstructions || undefined,
            },
          };
          session.ws.send(JSON.stringify(responseEvent));
          console.log(
            `[Socket.io] Triggered OpenAI response for room ${roomId}, personality: ${session.aiPersonality}, topic: ${session.aiTopic || "none"}, speaker: ${speakerName || "unknown"}, participants: [${participantNames.join(", ")}]`,
          );
        } else {
          // Simulate AI response if OpenAI not connected
          console.log(
            `[Socket.io] Simulating AI response (no OpenAI connection)`,
          );
          setTimeout(() => {
            if (session) {
              session.state = "idle";
              session.activeSpeakerId = null;
              session.activeSpeakerName = null;
              broadcastAIState(io, session);
            } else {
              const idleEvent = {
                type: "ai:idle",
                roomId,
                state: {
                  state: "idle" as const,
                  stateStartedAt: new Date(),
                  activeSpeakerId: null,
                  activeSpeakerName: null,
                  isSessionHealthy: true,
                  queue: { queue: [], totalProcessed: 1, totalExpired: 0 },
                },
              };
              io.to(roomId).emit("ai:state", idleEvent);
            }
            console.log(`[Socket.io] Broadcast AI state: idle (simulated)`);
          }, 2000);
        }
      });

      // ============================================================
      // TRANSCRIPT EVENTS
      // ============================================================

      // Handle transcript history request
      socket.on("transcript:request-history", (payload, callback) => {
        const {
          roomId,
          limit = 50,
          beforeId,
          includeSummaries = true,
        } = payload;
        const socketRoomId = (socket as any).roomId;

        console.log(
          `[Transcript] History request for room ${roomId} from socket in room ${socketRoomId}`,
        );

        // Verify socket is in the room
        if (socketRoomId !== roomId) {
          console.log(
            `[Transcript] History request denied - socket not in room ${roomId}`,
          );
          const emptyResponse = {
            entries: [],
            summaries: [],
            hasMore: false,
            totalEntries: 0,
          };
          if (callback) {
            callback(emptyResponse);
          } else {
            socket.emit("transcript:history", emptyResponse);
          }
          return;
        }

        // Get context manager for this room
        const cm = roomContextManagers.get(roomId);
        if (!cm) {
          console.log(`[Transcript] No context manager for room ${roomId}`);
          const emptyResponse = {
            entries: [],
            summaries: [],
            hasMore: false,
            totalEntries: 0,
          };
          if (callback) {
            callback(emptyResponse);
          } else {
            socket.emit("transcript:history", emptyResponse);
          }
          return;
        }

        // Get transcript entries from context manager
        const { entries, hasMore, total } = cm.getTranscriptEntries(
          roomId,
          limit,
          0,
          beforeId,
        );

        // Get summaries if requested
        const summaries = includeSummaries
          ? cm.getTranscriptSummaries(roomId)
          : [];

        const response = {
          entries,
          summaries,
          hasMore,
          totalEntries: total,
        };

        console.log(
          `[Transcript] Sending history for room ${roomId}: ${entries.length} entries, ${summaries.length} summaries`,
        );

        // Send response via callback or event
        if (callback) {
          callback(response);
        } else {
          socket.emit("transcript:history", response);
        }
      });

      // Handle ambient transcript from client-side speech recognition
      // This enables participant-to-participant conversations to be:
      // 1. Stored in transcript panel for users to see
      // 2. Added to ContextManager so voice AI has awareness of room conversations
      socket.on("transcript:ambient", (payload) => {
        const { roomId, peerId, displayName, transcript, isFinal } = payload;
        const socketRoomId = (socket as any).roomId;

        // Only process final transcripts (not partials)
        if (!isFinal) return;

        // Verify socket is in the room
        if (socketRoomId !== roomId) {
          console.log(
            `[Transcript] Ambient transcript denied - socket not in room ${roomId}`,
          );
          return;
        }

        // Skip empty transcripts
        if (!transcript || !transcript.trim()) return;

        // Get or create context manager for this room
        const cm = getOrCreateContextManager(roomId);

        // Initialize room if not already initialized (required for addAmbientMessage to work)
        cm.initRoom(roomId);

        // Add participant if not already registered (uses addParticipant, not registerParticipant)
        if (peerId && displayName) {
          cm.addParticipant(roomId, peerId, displayName);
        }

        // Add ambient message to context manager
        // This does two things:
        // 1. Stores in messages array for buildContextInjection() → AI context
        // 2. Triggers onTranscriptEntry callback → broadcasts to transcript panel
        cm.addAmbientMessage(roomId, transcript.trim(), peerId);

        console.log(
          `[Transcript] Ambient transcript from ${displayName} in room ${roomId}: "${transcript.substring(0, 50)}${transcript.length > 50 ? "..." : ""}"`,
        );
      });

      // Handle manual summary generation request
      socket.on("transcript:generate-summary", async (payload, callback) => {
        const { roomId } = payload;
        const socketRoomId = (socket as any).roomId;

        console.log(`[Summary] Manual summary request for room ${roomId}`);

        // Verify socket is in the room
        if (socketRoomId !== roomId) {
          console.log(
            `[Summary] Request denied - socket not in room ${roomId}`,
          );
          if (callback) {
            callback({ success: false, error: "Not in room" });
          }
          return;
        }

        // Get context manager for this room
        const cm = roomContextManagers.get(roomId);
        if (!cm) {
          console.log(`[Summary] No context manager for room ${roomId}`);
          if (callback) {
            callback({ success: false, error: "No transcript data" });
          }
          return;
        }

        // Check if there are enough messages to summarize
        const messageCount = cm.getEntryCount(roomId);
        if (messageCount < 2) {
          console.log(
            `[Summary] Not enough messages to summarize (${messageCount})`,
          );
          if (callback) {
            callback({
              success: false,
              error: "Not enough messages to summarize",
            });
          }
          return;
        }

        // Check if summary is already in progress
        if (summaryInProgress.has(roomId)) {
          console.log(
            `[Summary] Summary already in progress for room ${roomId}`,
          );
          if (callback) {
            callback({
              success: false,
              error: "Summary already in progress",
            });
          }
          return;
        }

        try {
          // Mark as in progress
          summaryInProgress.add(roomId);
          // Trigger summarization (will broadcast via onTranscriptSummary callback)
          const result = await cm.summarize(roomId);
          if (result) {
            lastSummaryTime.set(roomId, new Date());
            console.log(
              `[Summary] Manual summary generated for room ${roomId}`,
            );
            if (callback) {
              callback({ success: true });
            }
          } else {
            if (callback) {
              callback({
                success: false,
                error: "Summary generation returned null",
              });
            }
          }
        } catch (error) {
          console.error(
            `[Summary] Manual summary failed for room ${roomId}:`,
            error,
          );
          if (callback) {
            callback({
              success: false,
              error:
                error instanceof Error
                  ? error.message
                  : "Summary generation failed",
            });
          }
        } finally {
          // Clear in-progress flag
          summaryInProgress.delete(roomId);
        }
      });

      // ============================================================
      // DISCONNECT
      // ============================================================

      socket.on("disconnect", (reason) => {
        console.log(
          `[Socket.io] Client disconnected: ${socket.id} (${reason})`,
        );

        const mapping = socketToPeer.get(socket.id);
        if (mapping) {
          removePeerFromRoom(
            io,
            socket,
            mapping.roomId,
            mapping.peerId,
            "disconnected",
          );
        }
      });
    });

    // Start HTTP server
    httpServer.listen(port, hostname, () => {
      console.log(`[Server] Ready on http://${hostname}:${port}`);
      console.log(`[Socket.io] WebSocket server ready`);
      console.log(`[Server] Rooms in memory: ${rooms.size}`);
    });

    httpServer.on("error", (error: NodeJS.ErrnoException) => {
      console.error(`[Server] HTTP server error:`, error.message);
      if (error.code === "EADDRINUSE") {
        console.error(`[Server] Port ${port} is already in use`);
      }
      process.exit(1);
    });
  })
  .catch((error) => {
    console.error("[Server] Failed to prepare Next.js app:", error);
    process.exit(1);
  });
