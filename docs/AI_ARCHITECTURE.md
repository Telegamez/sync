# SwenSync AI Architecture

Technical documentation for developers on how AI services integrate with the SwenSync platform.

---

## Table of Contents

1. [Overview](#overview)
2. [OpenAI API Usage](#openai-api-usage)
3. [Voice-to-Voice AI Agent](#voice-to-voice-ai-agent)
4. [Context Injection](#context-injection)
5. [Transcription Service](#transcription-service)
6. [Summarization Service](#summarization-service)
7. [Data Flow Diagrams](#data-flow-diagrams)

---

## Overview

SwenSync uses multiple OpenAI APIs for different purposes:

| Service          | API                      | Model                     | Purpose                         |
| ---------------- | ------------------------ | ------------------------- | ------------------------------- |
| Voice AI Agent   | Realtime API (WebSocket) | `gpt-4o-realtime-preview` | Multi-user voice conversations  |
| Swensync Overlay | Realtime API (WebRTC)    | `gpt-4o-realtime-preview` | Single-user voice assistant     |
| Transcription    | Realtime API (WebSocket) | `gpt-4o-mini-transcribe`  | Ambient audio transcription     |
| Summaries        | Responses API (HTTP)     | `gpt-4o-mini`             | Periodic conversation summaries |

---

## OpenAI API Usage

### Responses API (Text Completions)

Used for summary generation. Newer API released March 2025, replacing Chat Completions.

```typescript
// server.ts - generateAISummary()
const response = await openaiClient.responses.create({
  model: "gpt-4o-mini",
  instructions: "You are a meeting summarizer...",
  input: `Summarize this conversation:\n\n${conversationText}`,
  max_output_tokens: 500,
  temperature: 0.3,
});

const summary = response.output_text;
```

**Key differences from Chat Completions:**

- `messages` → `instructions` + `input`
- `max_tokens` → `max_output_tokens`
- `response.choices[0]?.message?.content` → `response.output_text`

### Realtime API (WebSocket)

Used for server-side voice AI agent and transcription service.

```typescript
// Connection
const ws = new WebSocket("wss://api.openai.com/v1/realtime", {
  headers: {
    Authorization: `Bearer ${apiKey}`,
    "OpenAI-Beta": "realtime=v1",
  },
});

// Session configuration
ws.send(
  JSON.stringify({
    type: "session.update",
    session: {
      modalities: ["text", "audio"],
      voice: "alloy",
      input_audio_format: "pcm16",
      output_audio_format: "pcm16",
    },
  }),
);
```

### Realtime API (WebRTC)

Used for client-side Swensync overlay (single-user direct connection).

```typescript
// Browser connects directly to OpenAI
const pc = new RTCPeerConnection();
const offer = await pc.createOffer();

// Exchange SDP with OpenAI
const response = await fetch("https://api.openai.com/v1/realtime/sessions", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${ephemeralToken}`,
    "Content-Type": "application/sdp",
  },
  body: offer.sdp,
});
```

---

## Voice-to-Voice AI Agent

### Architecture

The Room AI agent handles multi-user voice conversations via the server.

```
┌─────────────┐     Socket.io      ┌─────────────┐    WebSocket     ┌─────────────┐
│   Client    │◄──────────────────►│   Server    │◄────────────────►│   OpenAI    │
│  (Browser)  │                    │  (Node.js)  │                  │ Realtime API│
└─────────────┘                    └─────────────┘                  └─────────────┘
      │                                   │
      │ PTT audio (base64)                │ Audio streaming
      │ ────────────────────────────►     │ ────────────────────────►
      │                                   │
      │ AI response audio                 │ AI response
      │ ◄────────────────────────────     │ ◄────────────────────────
```

### Key Files

- [server.ts](../server.ts) - Main server with PTT handling and OpenAI connection
- [src/server/signaling/openai-realtime-client.ts](../src/server/signaling/openai-realtime-client.ts) - WebSocket client wrapper

### PTT Flow

1. User presses PTT button → `ptt:start` event
2. Server receives audio chunks → `ptt:audio` event
3. User releases PTT → `ptt:stop` event
4. Server commits audio to OpenAI → waits for response
5. AI generates response → streamed back to all room participants

---

## Context Injection

The voice AI agent receives conversation history before processing PTT audio, enabling contextually aware responses.

### How It Works

When a user starts PTT, the server:

1. **Builds context** from `ContextManager` (recent messages, transcripts, summaries)
2. **Injects as system message** via `conversation.item.create`
3. **Adds speaker attribution** ("Matt says:")
4. **Streams audio** for processing

### Implementation

```typescript
// server.ts - ptt:start handler (lines 1555-1604)

// 1. Build context from recent conversation history
const contextText = buildContextInjection(roomId, 2000); // ~2000 tokens max

if (contextText) {
  // 2. Inject as system message before audio
  const contextEvent = {
    type: "conversation.item.create",
    item: {
      type: "message",
      role: "system",
      content: [{ type: "input_text", text: contextText }],
    },
  };
  session.ws.send(JSON.stringify(contextEvent));
}

// 3. Add speaker attribution
const speakerEvent = {
  type: "conversation.item.create",
  item: {
    type: "message",
    role: "user",
    content: [{ type: "input_text", text: `${displayName} says:` }],
  },
};
session.ws.send(JSON.stringify(speakerEvent));

// 4. Audio streaming begins...
```

### Context Format

```
## RECENT CONVERSATION CONTEXT
Here is what was discussed recently in this room. Use this context to provide more relevant and informed responses.

[10:42 AM] Alice: Let's discuss the Q4 roadmap
[10:43 AM] Bob: I think we should prioritize the mobile app
[10:44 AM] AI: Based on your discussion, mobile seems like a good focus...
[10:45 AM] Alice: What about the API redesign?
```

### buildContextInjection Function

```typescript
// server.ts:547-593
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

  // Format as context string with timestamps
  return formatAsContext(recentMessages);
}
```

### What Gets Injected

The AI receives context from multiple sources stored in `ContextManager`:

| Source              | Description                                        |
| ------------------- | -------------------------------------------------- |
| PTT transcripts     | User speech from previous PTT turns                |
| AI responses        | Previous AI assistant responses                    |
| Ambient transcripts | Room conversation captured by TranscriptionService |
| Summaries           | Periodic AI-generated conversation summaries       |

---

## Transcription Service

Real-time ambient audio transcription for room conversations.

### Architecture

```
┌─────────────┐                    ┌─────────────┐    WebSocket     ┌─────────────┐
│   Clients   │   Room Audio       │   Server    │◄────────────────►│   OpenAI    │
│  (Browser)  │ ──────────────────►│  (Node.js)  │                  │ Transcribe  │
└─────────────┘                    └─────────────┘                  └─────────────┘
                                          │
                                          ▼
                                   ContextManager
                                   (stores transcripts)
```

### Key File

- [src/server/signaling/transcription-service.ts](../src/server/signaling/transcription-service.ts)

### Configuration

```typescript
const config = {
  type: "transcription_session.update",
  session: {
    input_audio_format: "pcm16",
    input_audio_transcription: {
      model: "gpt-4o-mini-transcribe",
      language: "en",
    },
    turn_detection: {
      type: "server_vad",
      threshold: 0.5,
      prefix_padding_ms: 300,
      silence_duration_ms: 500,
    },
  },
};
```

### Speaker Attribution

Transcripts are attributed to speakers via `setActiveSpeaker()`:

```typescript
// Before streaming audio
transcriptionService.setActiveSpeaker(roomId, peerId, "Alice");

// Stream audio
transcriptionService.streamAudio(roomId, audioBase64);

// On speech end
transcriptionService.clearActiveSpeaker(roomId);
```

---

## Summarization Service

Periodic AI-generated summaries of conversation history.

### Trigger Conditions

Summaries are generated when:

| Condition      | Threshold                                       |
| -------------- | ----------------------------------------------- |
| Entry count    | ≥ 6 messages AND ≥ 5 minutes since last summary |
| Max entries    | ≥ 20 messages (forced)                          |
| Manual request | User clicks "Generate Summary"                  |

### Key Files

- [server.ts](../server.ts) - `generateAISummary()`, `shouldGenerateSummary()`
- [src/server/signaling/summarization-service.ts](../src/server/signaling/summarization-service.ts) - Standalone service

### Summary Output

```typescript
interface TranscriptSummary {
  id: string;
  roomId: string;
  timestamp: Date;
  content: string; // 2-4 sentence overview
  bulletPoints: string[]; // 3-5 key takeaways
  entriesSummarized: number;
  tokenCount: number;
  coverageStart: Date;
  coverageEnd: Date;
}
```

### Broadcast

Summaries are broadcast to all room participants via Socket.io:

```typescript
// server.ts - ContextManager callback
onTranscriptSummary: (rid: string, summary: TranscriptSummary) => {
  socketIO.to(rid).emit("transcript:summary", { summary });
};
```

---

## Data Flow Diagrams

### Complete AI Data Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              SwenSync Server                                 │
│                                                                             │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐         │
│  │ ContextManager  │◄───│ Transcription   │◄───│ Room Audio      │         │
│  │                 │    │ Service         │    │ (ambient)       │         │
│  │ - Messages      │    └─────────────────┘    └─────────────────┘         │
│  │ - Transcripts   │                                                        │
│  │ - Summaries     │◄───┌─────────────────┐                                │
│  └────────┬────────┘    │ Summarization   │◄─── Responses API              │
│           │             │ Service         │     (gpt-4o-mini)              │
│           │             └─────────────────┘                                │
│           │                                                                 │
│           ▼                                                                 │
│  ┌─────────────────┐    ┌─────────────────┐                                │
│  │ buildContext    │───►│ OpenAI Realtime │◄─── WebSocket                  │
│  │ Injection()     │    │ Client          │     (gpt-4o-realtime)          │
│  └─────────────────┘    └────────┬────────┘                                │
│                                  │                                          │
│                                  ▼                                          │
│                         ┌─────────────────┐                                │
│                         │ PTT Audio +     │                                │
│                         │ Context + Speaker│                               │
│                         └─────────────────┘                                │
└─────────────────────────────────────────────────────────────────────────────┘
```

### PTT Request Sequence

```
User              Server              ContextManager        OpenAI Realtime
  │                  │                      │                      │
  │ ptt:start        │                      │                      │
  │─────────────────►│                      │                      │
  │                  │ getMessages()        │                      │
  │                  │─────────────────────►│                      │
  │                  │◄─────────────────────│                      │
  │                  │                      │                      │
  │                  │ conversation.item.create (context)          │
  │                  │────────────────────────────────────────────►│
  │                  │                      │                      │
  │                  │ conversation.item.create (speaker)          │
  │                  │────────────────────────────────────────────►│
  │                  │                      │                      │
  │ ptt:audio        │                      │                      │
  │─────────────────►│ input_audio_buffer.append                   │
  │                  │────────────────────────────────────────────►│
  │                  │                      │                      │
  │ ptt:stop         │                      │                      │
  │─────────────────►│ input_audio_buffer.commit                   │
  │                  │────────────────────────────────────────────►│
  │                  │                      │                      │
  │                  │◄──────────────────── response.audio.delta   │
  │◄─────────────────│                      │                      │
  │ ai:audio         │                      │                      │
```

---

## Configuration Reference

### Environment Variables

```bash
# Required for all AI features
OPENAI_API_KEY=sk-...

# Optional: Custom model overrides
OPENAI_REALTIME_MODEL=gpt-4o-realtime-preview
OPENAI_TRANSCRIPTION_MODEL=gpt-4o-mini-transcribe
OPENAI_SUMMARY_MODEL=gpt-4o-mini
```

### Summary Configuration

```typescript
// server.ts
const SUMMARY_CONFIG = {
  minEntriesForSummary: 6, // Minimum messages before summary
  minTimeBetweenSummaries: 5 * 60 * 1000, // 5 minutes
  maxEntriesBeforeSummary: 20, // Force summary at this count
  summaryModel: "gpt-4o-mini",
};
```

### Context Injection Configuration

```typescript
// Default token budget for context injection
const DEFAULT_CONTEXT_TOKENS = 2000;

// Context is injected before each PTT turn
buildContextInjection(roomId, 2000);
```

---

## Related Documentation

- [TRANSCRIPT_USER_MANUAL.md](../TRANSCRIPT_USER_MANUAL.md) - End-user documentation
- [docs/FEAT-TRANSCRIPT-FUNCTIONAL-SPEC.md](./FEAT-TRANSCRIPT-FUNCTIONAL-SPEC.md) - Feature specifications

---

_Last updated: Phase 6 completion_
