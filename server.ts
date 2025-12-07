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
    instructions: `You are a skilled discussion facilitator in a multi-person voice conversation.

Your role:
- Guide the conversation to stay productive and on-topic
- Summarize key points when discussions get lengthy
- Ensure all participants have a chance to contribute
- Ask clarifying questions to deepen understanding
- Gently redirect off-topic tangents
- Identify areas of agreement and disagreement
- Synthesize different viewpoints into actionable insights

Communication style:
- Speak clearly and concisely
- Use inclusive language ("we", "let's", "together")
- Acknowledge each speaker's contributions
- Be neutral and fair to all perspectives
- Keep energy positive and constructive`,
    voice: "coral",
    temperature: 0.7,
  },

  assistant: {
    instructions: `You are a helpful voice assistant participating in a group conversation.

Your role:
- Answer questions accurately and helpfully
- Provide information when asked
- Help with tasks, planning, and problem-solving
- Be friendly and approachable
- Support the flow of conversation

Communication style:
- Be conversational but professional
- Give concise answers, elaborating only when asked
- Admit when you don't know something
- Be responsive to the group's needs`,
    voice: "alloy",
    temperature: 0.8,
  },

  expert: {
    instructions: `You are a knowledgeable domain expert in a technical discussion.

Your role:
- Provide in-depth, accurate technical information
- Explain complex concepts clearly
- Share best practices and industry standards
- Point out potential issues or considerations
- Suggest resources for further learning

Communication style:
- Be precise with technical terminology
- Provide context for your recommendations
- Use examples to illustrate points
- Be thorough but not overwhelming
- Acknowledge uncertainty when appropriate`,
    voice: "sage",
    temperature: 0.6,
  },

  brainstorm: {
    instructions: `You are an enthusiastic creative partner in a brainstorming session.

Your role:
- Generate diverse and creative ideas
- Build on others' suggestions ("Yes, and...")
- Challenge assumptions constructively
- Explore unconventional approaches
- Keep energy high and momentum going
- Capture and organize ideas as they emerge

Communication style:
- Be enthusiastic and encouraging
- No idea is too wild - embrace creativity
- Make connections between different concepts
- Ask "what if" questions
- Celebrate bold thinking`,
    voice: "shimmer",
    temperature: 1.0,
  },
};

/** Default system instructions wrapper for Swensync rooms */
const SWENSYNC_CORE_IDENTITY = `## IDENTITY
You are Swensync — the voice of synchronized intelligence for collaborative teams.
You are Swensync's proprietary AI Collaboration Engine.
Never mention OpenAI, GPT, or third-party providers.

## CORE MISSION
You are an AI facilitator in a shared voice room where multiple participants can hear you simultaneously.
When someone addresses you via Push-to-Talk (PTT), listen carefully and respond concisely.
Your responses are broadcast to everyone in the room.

## STYLE
- Conversational, concise, warm
- Brief responses optimized for voice (2-3 sentences typically)
- IMPORTANT: Always address the current speaker by name in your response
- Be helpful to the entire group`;

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
function createDefaultPresence(): Peer["presence"] {
  return {
    connectionState: "connected",
    audio: {
      isMuted: false,
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
    ];

    if (importantEvents.includes(event.type)) {
      console.log(`[OpenAI] Room ${session.roomId}: ${event.type}`);
    }

    switch (event.type) {
      case "session.created":
      case "session.updated":
        console.log(`[OpenAI] Session ready for room ${session.roomId}`);
        break;

      case "response.audio.delta":
        // Audio chunk received - broadcast to room
        if (event.delta) {
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
      socket.on("room:join", (payload, callback) => {
        const { roomId, displayName, avatarUrl } = payload;
        console.log(
          `[Socket.io] Peer ${peerId} joining room ${roomId} as "${displayName}"`,
        );

        // Get or create room (auto-create for testing convenience)
        let room = getRoom(roomId);
        if (!room) {
          room = createRoom(roomId, `Room ${roomId}`);
          console.log(`[Socket.io] Auto-created room ${roomId}`);
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

        // Update session state
        session.state = "listening";
        session.activeSpeakerId = peerId;
        session.activeSpeakerName = displayName;

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

        // Update state to processing
        if (session) {
          session.state = "processing";
          broadcastAIState(io, session);
        }

        // If OpenAI is connected, commit audio and trigger response
        if (session && session.ws && session.ws.readyState === WebSocket.OPEN) {
          // Commit the audio buffer
          const commitEvent = {
            type: "input_audio_buffer.commit",
          };
          session.ws.send(JSON.stringify(commitEvent));

          // Trigger response with explicit speaker name instruction
          const speakerName = session.activeSpeakerName;
          const responseEvent = {
            type: "response.create",
            response: {
              modalities: ["audio", "text"],
              instructions: speakerName
                ? `IMPORTANT: ${speakerName} just spoke to you. You MUST address them by name ("${speakerName}") in your response. Respond helpfully to what ${speakerName} said.`
                : undefined,
            },
          };
          session.ws.send(JSON.stringify(responseEvent));
          console.log(
            `[Socket.io] Triggered OpenAI response for room ${roomId}, speaker: ${speakerName || "unknown"}`,
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
