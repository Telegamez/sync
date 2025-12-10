# Dual-Track Unified Transcript - Functional Specification

> **Status**: ✅ Implemented (Phase 6 Complete)
> **Created**: 2024-12-09
> **Updated**: 2024-12-10
> **Feature ID**: FEAT-500 (Transcript System)
> **Parent Document**: [AI-CONTEXT-ENHANCEMENT-PROPOSAL.md](./AI-CONTEXT-ENHANCEMENT-PROPOSAL.md)

---

## Table of Contents

1. [Overview](#overview)
2. [User Stories](#user-stories)
3. [Functional Requirements](#functional-requirements)
4. [User Experience Flows](#user-experience-flows)
5. [UI Specifications](#ui-specifications)
6. [Data Models](#data-models)
7. [API Specifications](#api-specifications)
8. [Implementation Plan](#implementation-plan)
9. [Acceptance Criteria](#acceptance-criteria)
10. [Out of Scope](#out-of-scope)

---

## Overview

### Purpose

Enable the AI agent to have full awareness of room conversations (not just PTT interactions) while simultaneously providing users with a live, downloadable transcript of their meetings.

### Goals

1. **AI Context**: AI remembers and references all room conversation
2. **Live Transcript**: Users see real-time transcript in room sidebar
3. **Meeting Notes**: Users can download transcript as meeting notes
4. **Late-Joiner Support**: New participants can catch up via transcript history

### Non-Goals (This Release)

- Consent modals for joining transcribed rooms (deferred)
- Video transcription or screen capture
- Real-time translation
- Speaker diarization for ambient audio (use peer ID attribution instead)

---

## User Stories

### US-1: Room Creator Enables Transcript

**As a** room creator
**I want to** enable live transcription when creating a room
**So that** the AI has full context and participants have meeting notes

**Acceptance Criteria:**

- Toggle in Create Room form to enable transcript
- Option to enable/disable AI summaries
- Option to set retention period (session-only, 7 days, 30 days)
- Recording indicator visible in room header when enabled

---

### US-2: Participant Sees Live Transcript

**As a** room participant
**I want to** see a live transcript of the conversation
**So that** I can follow along and reference what was said

**Acceptance Criteria:**

- Transcript panel visible in room sidebar (desktop) or bottom sheet (mobile)
- Entries appear within 2 seconds of speech
- Clear distinction between ambient speech, PTT, and AI responses
- Auto-scroll to new messages with ability to scroll up

---

### US-3: Late-Joiner Catches Up

**As a** participant who joins mid-meeting
**I want to** see the conversation history
**So that** I can understand what I missed

**Acceptance Criteria:**

- Full transcript history available on join
- Summary cards provide quick overview
- Can scroll up to see earlier conversation
- System message shows when I joined

---

### US-4: Download Meeting Notes

**As a** room participant
**I want to** download the transcript
**So that** I have a record of the meeting

**Acceptance Criteria:**

- Download button in transcript panel
- Format options: Plain text (.txt), Markdown (.md)
- Includes timestamps, speaker names, and summaries
- File named with room name and date

---

### US-5: AI References Prior Context

**As a** user talking to the AI via PTT
**I want** the AI to know what was discussed earlier
**So that** I don't have to repeat context

**Acceptance Criteria:**

- AI can reference "As [Name] mentioned earlier..."
- AI knows about ambient conversations, not just PTT
- AI summaries include topics from ambient discussion

---

### US-6: Periodic Summaries

**As a** room participant
**I want to** see periodic summaries of the conversation
**So that** I can quickly understand key points

**Acceptance Criteria:**

- Summary generated every 5 minutes or 20 transcript segments
- Summary card appears in transcript with bullet points
- Summaries include: topics, decisions, action items
- Summaries are collapsible

---

## Functional Requirements

### FR-1: Ambient Audio Transcription

| ID     | Requirement                                                            | Priority | Status  |
| ------ | ---------------------------------------------------------------------- | -------- | ------- |
| FR-1.1 | System SHALL transcribe all non-PTT peer audio in real-time            | Must     | ✅ Done |
| FR-1.2 | Transcription latency SHALL be < 2 seconds from speech to display      | Must     | ✅ Done |
| FR-1.3 | System SHALL attribute transcripts to the speaking peer                | Must     | ✅ Done |
| FR-1.4 | System SHALL use cost-efficient transcription (Web Speech API)         | Must     | ✅ Done |
| FR-1.5 | Transcription SHALL only run when room has transcript enabled          | Must     | ✅ Done |
| FR-1.6 | System SHALL handle peer join/leave without interrupting transcription | Must     | ✅ Done |

**Implementation Note (2024-12-10):**
Ambient transcription uses the browser's **Web Speech API** instead of server-side `gpt-4o-mini-transcribe`. This approach:

- **Zero API cost** - Uses browser's built-in speech recognition (Chrome uses Google's, Safari uses Apple's)
- **Low latency** - Processes locally in browser (~100ms)
- **No audio streaming** - Only final text sent to server via Socket.io
- **PTT-aware** - Pauses during PTT to avoid duplicate transcription

See [useAmbientTranscription.ts](../src/hooks/useAmbientTranscription.ts) for implementation.

---

### FR-2: PTT Transcription

| ID     | Requirement                                                         | Priority | Status  |
| ------ | ------------------------------------------------------------------- | -------- | ------- |
| FR-2.1 | System SHALL capture transcripts from OpenAI Realtime API responses | Must     | ✅ Done |
| FR-2.2 | PTT transcripts SHALL be marked with `[PTT]` indicator              | Must     | ✅ Done |
| FR-2.3 | AI responses SHALL be captured and displayed in transcript          | Must     | ✅ Done |
| FR-2.4 | Speaker name SHALL be attributed to PTT entries                     | Must     | ✅ Done |

---

### FR-3: Unified Transcript Storage

| ID     | Requirement                                                       | Priority | Status      |
| ------ | ----------------------------------------------------------------- | -------- | ----------- |
| FR-3.1 | System SHALL store all transcript entries in ContextManager       | Must     | ✅ Done     |
| FR-3.2 | Entries SHALL include: id, timestamp, speaker, content, type      | Must     | ✅ Done     |
| FR-3.3 | System SHALL support pagination for transcript retrieval          | Must     | ✅ Done     |
| FR-3.4 | Transcript SHALL persist for configured retention period          | Should   | ⏳ Deferred |
| FR-3.5 | System SHALL delete transcript when room closes (if session-only) | Must     | ✅ Done     |

---

### FR-4: Periodic Summarization

| ID     | Requirement                                                    | Priority | Status      |
| ------ | -------------------------------------------------------------- | -------- | ----------- |
| FR-4.1 | System SHALL generate summaries every 5 minutes OR 20 segments | Must     | ✅ Done     |
| FR-4.2 | Summaries SHALL include: topics, decisions, action items       | Must     | ✅ Done     |
| FR-4.3 | System SHALL use `gpt-4o-mini` for summarization               | Must     | ✅ Done     |
| FR-4.4 | Summaries SHALL be stored in ContextManager                    | Must     | ✅ Done     |
| FR-4.5 | System SHOULD use Batch API for cost savings when not urgent   | Should   | ⏳ Deferred |

**Implementation Note (2024-12-10):**
Summarization uses the **OpenAI Responses API** (released March 2025) instead of Chat Completions for a more streamlined interface. Configuration in [server.ts](../server.ts):

- Minimum 6 entries before generating a summary
- Minimum 5 minutes between summaries
- Maximum 20 entries before forcing a summary

---

### FR-5: AI Context Injection

| ID     | Requirement                                                             | Priority | Status  |
| ------ | ----------------------------------------------------------------------- | -------- | ------- |
| FR-5.1 | System SHALL inject context on PTT start via `conversation.item.create` | Must     | ✅ Done |
| FR-5.2 | Context SHALL include: latest summary + recent transcript (2-3 min)     | Must     | ✅ Done |
| FR-5.3 | Context SHALL be injected as `role: "system"` message                   | Must     | ✅ Done |
| FR-5.4 | Context injection SHALL NOT increase PTT response latency               | Must     | ✅ Done |
| FR-5.5 | Context SHALL include participant list                                  | Should   | ✅ Done |

**Implementation Note (2024-12-10):**
Context injection includes **both PTT and ambient** transcripts. When a user starts PTT:

1. `buildContextInjection()` pulls recent messages from ContextManager (up to 2000 tokens)
2. Injected as system message via `conversation.item.create`
3. Speaker attribution added via separate `conversation.item.create`
4. Audio streaming begins

This allows AI to reference ambient participant-to-participant conversations, not just PTT interactions.

---

### FR-6: Transcript UI

| ID     | Requirement                                                         | Priority | Status      |
| ------ | ------------------------------------------------------------------- | -------- | ----------- |
| FR-6.1 | Transcript panel SHALL display in room sidebar (desktop)            | Must     | ✅ Done     |
| FR-6.2 | Transcript panel SHALL display as bottom sheet (mobile)             | Must     | ✅ Done     |
| FR-6.3 | Panel SHALL auto-scroll to new entries                              | Must     | ✅ Done     |
| FR-6.4 | Panel SHALL pause auto-scroll when user scrolls up                  | Must     | ✅ Done     |
| FR-6.5 | Panel SHALL show "New messages" button when scroll is paused        | Should   | ⏳ Deferred |
| FR-6.6 | Entries SHALL be visually distinct by type (ambient/PTT/AI/summary) | Must     | ✅ Done     |
| FR-6.7 | Summary cards SHALL be collapsible                                  | Should   | ✅ Done     |

---

### FR-7: Download/Export

| ID     | Requirement                                             | Priority | Status  |
| ------ | ------------------------------------------------------- | -------- | ------- |
| FR-7.1 | Users SHALL be able to download transcript as .txt file | Must     | ✅ Done |
| FR-7.2 | Users SHALL be able to download transcript as .md file  | Should   | ✅ Done |
| FR-7.3 | Download SHALL include timestamps and speaker names     | Must     | ✅ Done |
| FR-7.4 | Download SHALL include summaries                        | Must     | ✅ Done |
| FR-7.5 | File name SHALL include room name and date              | Must     | ✅ Done |

---

### FR-8: Room Settings

| ID     | Requirement                                                  | Priority | Status  |
| ------ | ------------------------------------------------------------ | -------- | ------- |
| FR-8.1 | Room creator SHALL be able to enable/disable transcript      | Must     | ✅ Done |
| FR-8.2 | Room creator SHALL be able to enable/disable AI summaries    | Should   | ✅ Done |
| FR-8.3 | Room creator SHALL be able to set retention period           | Should   | ✅ Done |
| FR-8.4 | Recording indicator SHALL be visible when transcript enabled | Must     | ✅ Done |

---

## User Experience Flows

### Flow 1: Create Room with Transcript

```
User clicks "Create Room"
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│                    CREATE ROOM                               │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Room Name: [Q4 Planning Session____________]               │
│                                                              │
│  Max Participants: [6 ▼]                                    │
│                                                              │
│  AI Personality: [Facilitator ▼]                            │
│                                                              │
│  Topic/Domain: [Product Strategy_____________] (optional)   │
│                                                              │
│  ─────────────────────────────────────────────────────────  │
│                                                              │
│  📝 Transcript Settings                                     │
│                                                              │
│  [✓] Enable live transcript                                 │
│      Record and display conversation in real-time           │
│                                                              │
│  [✓] Enable AI summaries                                    │
│      Generate periodic meeting summaries                    │
│                                                              │
│  Retention: [Session only ▼]                                │
│             ○ Session only (deleted when room closes)       │
│             ○ 7 days                                        │
│             ○ 30 days                                       │
│                                                              │
│  ─────────────────────────────────────────────────────────  │
│                                                              │
│              [ Cancel ]  [ Create Room ]                    │
│                                                              │
└─────────────────────────────────────────────────────────────┘
         │
         ▼
Room created → User enters room → Transcript panel visible
```

---

### Flow 2: In-Room Transcript Experience

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Q4 Planning Session                           🔴 Recording    [⚙️] [×] │
├───────────────────────────────────────────┬─────────────────────────────┤
│                                           │                             │
│                                           │  📝 Transcript         [−] │
│    ┌─────┐   ┌─────┐   ┌─────┐           │  ─────────────────────────  │
│    │Alice│   │ Bob │   │Carol│           │                             │
│    │ 🎤  │   │     │   │     │           │  10:01 AM                   │
│    └─────┘   └─────┘   └─────┘           │  Alice                      │
│                                           │  I think we should focus   │
│          ┌───────────┐                   │  on mobile this quarter.   │
│          │    AI     │                   │                             │
│          │   🤖      │                   │  10:02 AM                   │
│          └───────────┘                   │  Bob                        │
│                                           │  Agreed. Analytics show    │
│                                           │  60% mobile traffic.       │
│    ┌─────────────────────────────┐       │                             │
│    │                             │       │  10:03 AM  🎤 PTT           │
│    │    Hold SPACE to talk      │       │  Carol                      │
│    │         to AI              │       │  What should our priorities │
│    │                             │       │  be for Q4?                 │
│    └─────────────────────────────┘       │                             │
│                                           │  10:03 AM  🤖 AI           │
│                                           │  Swensync                   │
│    [ 🔇 Mute ]    [ 📤 Leave ]           │  Based on what Alice and   │
│                                           │  Bob mentioned about mobile │
│                                           │  traffic, I'd suggest...   │
│                                           │                             │
│                                           │  ┌───────────────────────┐ │
│                                           │  │ 📋 Summary • 2m ago   │ │
│                                           │  │ • Mobile app priority │ │
│                                           │  │ • 60% mobile traffic  │ │
│                                           │  │ • Q4 priorities TBD   │ │
│                                           │  └───────────────────────┘ │
│                                           │                             │
│                                           │  [📥 Download] [📋 Copy]   │
└───────────────────────────────────────────┴─────────────────────────────┘

INTERACTIONS:

A. Alice speaks (ambient, peer-to-peer):
   • Audio goes to Bob and Carol via WebRTC
   • Audio also sent to transcription service
   • Transcript entry appears: "Alice: I think we should..."
   • Entry type: ambient (no badge)

B. Carol uses PTT to address AI:
   • Audio goes to OpenAI Realtime API
   • Transcript entry appears: "Carol: What should our..." with 🎤 PTT badge
   • AI responds with full context awareness
   • AI response appears: "Swensync: Based on what Alice and Bob..." with 🤖 AI badge

C. Summary generated (every 5 min or 20 segments):
   • Summary card inserted into transcript
   • Shows bullet points of key topics
   • Collapsible (click to expand/collapse)

D. User scrolls up:
   • Auto-scroll pauses
   • "↓ New messages" button appears at bottom
   • Click button to resume auto-scroll
```

---

### Flow 3: Late-Joiner Experience

```
David joins 15 minutes into meeting
              │
              ▼
┌─────────────────────────────────────────────────────────────┐
│  Transcript loads with full history                         │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  📝 Transcript                                              │
│  ─────────────────────────────────────────────────────────  │
│                                                              │
│  ▲ Scroll up for earlier messages                           │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ 📋 Summary • 10 min ago                         [▼] │   │
│  │ • Mobile app is Q4 priority                         │   │
│  │ • Budget discussion pending                         │   │
│  │ • Alice leading mobile workstream                   │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                              │
│  10:12 AM                                                   │
│  Bob                                                        │
│  Let's discuss the budget now.                             │
│                                                              │
│  10:13 AM  🎤 PTT                                           │
│  Alice                                                      │
│  Can you summarize our budget options?                     │
│                                                              │
│  10:13 AM  🤖 AI                                            │
│  Swensync                                                   │
│  Based on the earlier discussion...                        │
│                                                              │
│  ─────────────────────────────────────────────────────────  │
│  🟢 David joined                                            │
│  ─────────────────────────────────────────────────────────  │
│                                                              │
│  [📥 Download] [📋 Copy]                                    │
└─────────────────────────────────────────────────────────────┘

David can:
1. Read the summary card for quick catch-up
2. Scroll up to see full conversation history
3. Continue participating with full context
```

---

### Flow 4: Download Transcript

```
User clicks [📥 Download]
              │
              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Download Transcript                       │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Format:                                                    │
│  ● Plain text (.txt)                                        │
│  ○ Markdown (.md)                                           │
│                                                              │
│  Include:                                                   │
│  [✓] Full transcript                                        │
│  [✓] Summaries                                              │
│  [✓] Timestamps                                             │
│                                                              │
│              [ Cancel ]  [ Download ]                       │
│                                                              │
└─────────────────────────────────────────────────────────────┘
              │
              ▼
File downloads: Q4_Planning_Session_2024-12-09.txt

═══════════════════════════════════════════════════════════════
TRANSCRIPT - Q4 Planning Session
Date: December 9, 2024
Duration: 32 minutes
Participants: Alice, Bob, Carol, David
═══════════════════════════════════════════════════════════════

[10:01 AM] Alice: I think we should focus on the mobile app
this quarter.

[10:02 AM] Bob: Agreed. The analytics show 60% mobile traffic.

[10:03 AM] Carol [PTT → AI]: What should our priorities be?

[10:03 AM] AI: Based on what Alice and Bob mentioned, I'd
suggest prioritizing...

─── SUMMARY (10:05 AM) ───────────────────────────────────────
• Mobile app is Q4 priority
• 60% of traffic is mobile
• Priorities being discussed
──────────────────────────────────────────────────────────────

[10:12 AM] Bob: Let's discuss the budget now.

...

═══════════════════════════════════════════════════════════════
End of Transcript
Generated by Swensync
═══════════════════════════════════════════════════════════════
```

---

## UI Specifications

### Transcript Panel (Desktop)

```
COMPONENT: TranscriptPanel
LOCATION: Right sidebar of room page
WIDTH: 320px (collapsible)
HEIGHT: 100% of room content area

┌─────────────────────────────────────────┐
│ HEADER (48px)                           │
│ ┌─────────────────────────────────────┐ │
│ │ 📝 Transcript              [−] [×] │ │  [−] Minimize  [×] Close
│ └─────────────────────────────────────┘ │
│ Background: slate-800                   │
│ Border-bottom: 1px slate-700            │
├─────────────────────────────────────────┤
│ BODY (scrollable)                       │
│                                         │
│ Padding: 12px                           │
│ Background: slate-900                   │
│ Overflow-y: auto                        │
│                                         │
│ [TranscriptEntry components...]         │
│                                         │
│ Auto-scroll: enabled by default         │
│ Scroll-behavior: smooth                 │
│                                         │
├─────────────────────────────────────────┤
│ FOOTER (56px)                           │
│ ┌─────────────────────────────────────┐ │
│ │ [📥 Download]    [📋 Copy All]     │ │
│ └─────────────────────────────────────┘ │
│ Background: slate-800                   │
│ Border-top: 1px slate-700               │
│ Padding: 12px                           │
└─────────────────────────────────────────┘
```

### Transcript Entry Types

```
TYPE 1: Ambient Speech
┌─────────────────────────────────────────┐
│ 10:01 AM                                │  ← Timestamp: slate-500, text-xs
│ Alice                                   │  ← Speaker: blue-400, font-medium
│ I think we should focus on the mobile  │  ← Content: slate-300, text-sm
│ app this quarter.                       │
└─────────────────────────────────────────┘
Margin-bottom: 16px

TYPE 2: PTT Speech
┌─────────────────────────────────────────┐
│ 10:03 AM  🎤 PTT                        │  ← Badge: amber-500 bg, amber-900 text
│ Carol                                   │
│ What should our priorities be?         │
└─────────────────────────────────────────┘
Border-left: 3px solid amber-500
Padding-left: 12px

TYPE 3: AI Response
┌─────────────────────────────────────────┐
│ 10:03 AM  🤖 AI                         │  ← Badge: emerald-500 bg, emerald-900 text
│ Swensync                                │  ← Speaker: emerald-400
│ Based on what Alice and Bob mentioned, │
│ I'd suggest prioritizing...            │
└─────────────────────────────────────────┘
Border-left: 3px solid emerald-500
Background: slate-800/50
Padding: 12px
Border-radius: 8px

TYPE 4: Summary Card
┌─────────────────────────────────────────┐
│ 📋 Summary • 2 min ago             [▼] │  ← Header: clickable, toggles expand
├─────────────────────────────────────────┤
│ • Mobile app is Q4 priority            │  ← Bullet list
│ • 60% of traffic is mobile             │
│ • Alice leading workstream             │
└─────────────────────────────────────────┘
Background: indigo-900/30
Border: 1px solid indigo-500/50
Border-radius: 8px
Margin: 16px 0

TYPE 5: System Event (join/leave)
┌─────────────────────────────────────────┐
│ ─────── 🟢 David joined ─────────      │
└─────────────────────────────────────────┘
Text: slate-500, text-xs, centered
Margin: 8px 0
```

### Mobile Layout

```
DEFAULT STATE: Transcript hidden

┌─────────────────────────┐
│ Q4 Planning    🔴 [≡]  │
├─────────────────────────┤
│                         │
│   [Participants]        │
│                         │
│   [AI Avatar]           │
│                         │
│   [PTT Button]          │
│                         │
│ [🔇] [📝] [📤]          │  ← [📝] opens transcript
└─────────────────────────┘

TRANSCRIPT OPEN: Bottom sheet slides up

┌─────────────────────────┐
│ Q4 Planning    🔴 [≡]  │
├─────────────────────────┤
│   (dimmed room view)    │
├─────────────────────────┤  ← Drag handle
│ 📝 Transcript      [×] │
├─────────────────────────┤
│                         │
│ [Scrollable entries]    │
│                         │
│ [📥] [📋]              │
└─────────────────────────┘
Height: 60% of screen
Swipe down to dismiss
```

### Recording Indicator

```
LOCATION: Room header, right side

ACTIVE:
┌─────────────────────────────────────────┐
│ Q4 Planning Session    🔴 Recording    │
└─────────────────────────────────────────┘
🔴 = red-500, pulsing animation (opacity 0.5 → 1.0, 1.5s)
Text: "Recording" in slate-400

DISABLED: (no indicator shown)
```

---

## Data Models

### TranscriptEntry

```typescript
interface TranscriptEntry {
  /** Unique entry ID */
  id: string;

  /** Room this entry belongs to */
  roomId: string;

  /** Entry timestamp */
  timestamp: Date;

  /** Speaker display name */
  speaker: string;

  /** Speaker peer ID (null for AI) */
  speakerId: string | null;

  /** Transcript content */
  content: string;

  /** Entry type */
  type: "ambient" | "ptt" | "ai_response" | "system";

  /** Token count estimate (for context management) */
  tokenEstimate?: number;
}
```

### TranscriptSummary

```typescript
interface TranscriptSummary {
  /** Unique summary ID */
  id: string;

  /** Room this summary belongs to */
  roomId: string;

  /** Summary timestamp */
  timestamp: Date;

  /** Full summary text */
  content: string;

  /** Bullet point list */
  bulletPoints: string[];

  /** Number of entries summarized */
  entriesSummarized: number;

  /** Token count */
  tokenCount: number;
}
```

### RoomTranscriptSettings

```typescript
interface RoomTranscriptSettings {
  /** Enable live transcription */
  enabled: boolean;

  /** Enable AI summaries */
  summariesEnabled: boolean;

  /** Retention period */
  retention: "session" | "7days" | "30days";

  /** Allow participants to download */
  allowDownload: boolean;
}
```

### TranscriptState (Client-side)

```typescript
interface TranscriptState {
  /** All transcript entries */
  entries: TranscriptEntry[];

  /** All summaries */
  summaries: TranscriptSummary[];

  /** Loading state */
  isLoading: boolean;

  /** Error state */
  error: string | null;

  /** Has more history to load */
  hasMore: boolean;

  /** Auto-scroll enabled */
  autoScroll: boolean;
}
```

---

## API Specifications

### Socket.io Events

#### Server → Client Events

**`transcript:entry`** - New transcript entry

```typescript
interface TranscriptEntryEvent {
  entry: TranscriptEntry;
}
```

**`transcript:summary`** - New summary generated

```typescript
interface TranscriptSummaryEvent {
  summary: TranscriptSummary;
}
```

**`transcript:history`** - Response to history request

```typescript
interface TranscriptHistoryResponse {
  entries: TranscriptEntry[];
  summaries: TranscriptSummary[];
  hasMore: boolean;
}
```

#### Client → Server Events

**`transcript:request-history`** - Request transcript history

```typescript
interface TranscriptHistoryRequest {
  roomId: string;
  limit: number; // Max entries to return
  beforeId?: string; // For pagination (entries before this ID)
}
```

---

### REST Endpoints

#### GET /api/rooms/:roomId/transcript

Get transcript for a room.

**Query Parameters:**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| format | string | json | Response format: json, txt, md |
| limit | number | 100 | Max entries |
| offset | number | 0 | Pagination offset |

**Response (JSON):**

```typescript
interface TranscriptResponse {
  roomId: string;
  roomName: string;
  startTime: Date;
  endTime: Date | null;
  participants: string[];
  entries: TranscriptEntry[];
  summaries: TranscriptSummary[];
  totalEntries: number;
}
```

**Response (TXT/MD):**
Plain text or markdown formatted transcript file.

---

#### GET /api/rooms/:roomId/transcript/download

Download transcript as file.

**Query Parameters:**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| format | string | txt | File format: txt, md |

**Response:**
File download with appropriate Content-Disposition header.

**Filename format:** `{RoomName}_{YYYY-MM-DD}.{ext}`

---

## Implementation Plan

### Phase A: PTT Context Injection (1-2 Days)

**Objective:** Wire up existing ContextManager to inject context on PTT

#### Task A.1: Modify OpenAI Realtime Client

**File:** `src/server/signaling/openai-realtime-client.ts`

**Changes:**

1. Add `injectContext(roomId: string, context: string)` method
2. Send `conversation.item.create` with system message
3. Call before `response.create`

**Pseudocode:**

```typescript
injectContext(roomId: string, context: string): boolean {
  const session = this.sessions.get(roomId);
  if (!session?.ws) return false;

  session.ws.send(JSON.stringify({
    type: "conversation.item.create",
    item: {
      type: "message",
      role: "system",
      content: [{ type: "input_text", text: context }]
    }
  }));

  return true;
}
```

#### Task A.2: Capture PTT Transcripts

**File:** `server.ts`

**Changes:**

1. On `response.audio_transcript.done`, call `contextManager.addUserMessage()`
2. On AI response complete, call `contextManager.addAssistantMessage()`

#### Task A.3: Inject Context on PTT Start

**File:** `server.ts`

**Changes:**

1. In PTT start handler, get context from `contextManager.getMessagesForAI()`
2. Format as system message
3. Call `openaiClient.injectContext()` before audio streaming

---

### Phase B: Dual-Track Transcript (1-2 Weeks)

#### Week 1: Backend

##### Task B.1: Transcription Service

**File:** `src/server/signaling/transcription-service.ts` (NEW)

**Purpose:** WebSocket client for `gpt-4o-mini-transcribe`

**Interface:**

```typescript
class TranscriptionService {
  createSession(roomId: string): Promise<void>;
  streamAudio(roomId: string, audioBase64: string): void;
  onTranscript(callback: (roomId, speaker, text) => void): void;
  destroySession(roomId: string): void;
}
```

**Implementation:**

- Connect to `wss://api.openai.com/v1/realtime?intent=transcription`
- Configure session with `gpt-4o-mini-transcribe`
- Handle reconnection with exponential backoff

##### Task B.2: Audio Mixer Integration

**File:** `src/lib/audio/mixer.ts` (MODIFY)

**Changes:**

1. Add `getMixedStream(roomId): MediaStream` method
2. Combine all peer audio except current PTT speaker
3. Output PCM16 format for transcription

##### Task B.3: Enhance ContextManager

**File:** `src/server/signaling/context-manager.ts` (MODIFY)

**Changes:**

1. Add `type` field to messages: 'ambient' | 'ptt' | 'ai_response' | 'system'
2. Add `getTranscriptEntries(roomId, limit, offset)` method
3. Add `getSummaries(roomId)` method
4. Add transcript-specific callbacks

##### Task B.4: Summarization Service

**File:** `src/server/signaling/summarization-service.ts` (NEW)

**Purpose:** Periodic conversation summarization

**Interface:**

```typescript
class SummarizationService {
  startMonitoring(roomId: string): void;
  stopMonitoring(roomId: string): void;
  summarizeNow(roomId: string): Promise<TranscriptSummary>;
  onSummary(callback: (roomId, summary) => void): void;
}
```

**Implementation:**

- Monitor entry count and time elapsed
- Trigger at 5 minutes OR 20 segments
- Use `gpt-4o-mini` with summarization prompt
- Store summary in ContextManager

##### Task B.5: Socket.io Events

**File:** `server.ts` (MODIFY)

**New events:**

- `transcript:entry` - Broadcast new entries
- `transcript:summary` - Broadcast new summaries
- `transcript:request-history` - Handle history requests

##### Task B.6: REST Endpoints

**File:** `src/app/api/rooms/[roomId]/transcript/route.ts` (NEW)

**Endpoints:**

- GET `/api/rooms/:roomId/transcript` - Get transcript JSON
- GET `/api/rooms/:roomId/transcript/download` - Download file

---

#### Week 2: Frontend

##### Task B.7: Transcript Types

**File:** `src/types/transcript.ts` (NEW)

Define TypeScript interfaces for transcript data.

##### Task B.8: useTranscript Hook

**File:** `src/hooks/useTranscript.ts` (NEW)

**Purpose:** Manage transcript state and Socket.io subscriptions

**Interface:**

```typescript
function useTranscript(roomId: string): {
  entries: TranscriptEntry[];
  summaries: TranscriptSummary[];
  isLoading: boolean;
  error: string | null;
  hasMore: boolean;
  loadMore: () => void;
  autoScroll: boolean;
  setAutoScroll: (enabled: boolean) => void;
};
```

##### Task B.9: TranscriptPanel Component

**File:** `src/components/room/TranscriptPanel.tsx` (NEW)

**Features:**

- Header with title and collapse button
- Scrollable entry list
- Auto-scroll with pause detection
- Footer with download/copy buttons

##### Task B.10: TranscriptEntry Component

**File:** `src/components/room/TranscriptEntry.tsx` (NEW)

**Features:**

- Render entry based on type
- Badge for PTT and AI entries
- Timestamp formatting

##### Task B.11: SummaryCard Component

**File:** `src/components/room/SummaryCard.tsx` (NEW)

**Features:**

- Collapsible card
- Bullet point list
- Relative timestamp

##### Task B.12: TranscriptDownloadModal Component

**File:** `src/components/room/TranscriptDownloadModal.tsx` (NEW)

**Features:**

- Format selection (txt, md)
- Include options checkboxes
- Download trigger

##### Task B.13: Room Page Integration

**File:** `src/app/rooms/[roomId]/page.tsx` (MODIFY)

**Changes:**

1. Add TranscriptPanel to layout
2. Add recording indicator to header
3. Add mobile transcript button
4. Initialize useTranscript hook

##### Task B.14: CreateRoomForm Updates

**File:** `src/components/room/CreateRoomForm.tsx` (MODIFY)

**Changes:**

1. Add "Transcript Settings" section
2. Enable transcript toggle
3. Enable summaries toggle
4. Retention period selector

##### Task B.15: Room Types Update

**File:** `src/types/room.ts` (MODIFY)

**Changes:**

1. Add `transcriptSettings` to Room interface
2. Add `transcriptSettings` to CreateRoomRequest

---

## Acceptance Criteria

### Phase A Complete When:

- [x] AI references previous PTT turns ("As you mentioned earlier...")
- [x] No increase in PTT response latency
- [x] Context limited to recent turns (token budget respected)

### Phase B Complete When:

- [x] Transcript panel visible in room
- [x] Ambient speech appears in transcript within 2 seconds
- [x] PTT speech marked with badge
- [x] AI responses appear in transcript
- [x] Summary cards generated every 5 min or 20 segments
- [x] Late-joiners see full history
- [x] Download produces correct .txt file
- [x] Create room form has transcript settings
- [x] Recording indicator visible when enabled
- [x] Mobile bottom sheet works correctly

---

## Out of Scope

The following are explicitly **not** included in this release:

1. **Consent modals** - Deferred to future release
2. **Video transcription** - Audio only
3. **Real-time translation** - English only
4. **Speaker diarization for ambient audio** - Use peer ID attribution
5. **PDF export** - Only .txt and .md for now
6. **Transcript search** - Deferred to Phase C
7. **Cross-session memory** - Deferred to Phase C
8. **Transcript editing** - Read-only transcript
9. **Custom retention periods** - Fixed options only
10. **Transcript sharing** - Download only, no direct share links

---

## Success Metrics

| Metric                | Target      | Measurement                            |
| --------------------- | ----------- | -------------------------------------- |
| Transcription latency | < 2 seconds | Time from speech to UI                 |
| AI context accuracy   | > 90%       | AI correctly references prior context  |
| Rooms with transcript | > 70%       | % of new rooms with transcript enabled |
| Download usage        | > 25%       | % of sessions with download            |
| Summary accuracy      | > 85%       | Manual review of summary quality       |

---

## Appendix: File Changes Summary

### New Files

```
src/server/signaling/transcription-service.ts     # Server-side transcription (available but not integrated)
src/server/signaling/summarization-service.ts     # Standalone summarization service
src/types/transcript.ts                           # TypeScript interfaces
src/hooks/useTranscript.ts                        # Client-side transcript state management
src/hooks/useAmbientTranscription.ts              # Client-side Web Speech API for ambient transcription
src/components/room/TranscriptPanel.tsx           # Main transcript UI panel
src/components/room/TranscriptEntry.tsx           # Individual transcript entry component
src/components/room/SummaryCard.tsx               # AI summary card component
src/components/room/TranscriptDownloadModal.tsx   # Download options modal
src/app/api/rooms/[roomId]/transcript/route.ts    # REST API for transcript data
```

### Modified Files

```
src/server/signaling/openai-realtime-client.ts    # Context injection methods
src/server/signaling/context-manager.ts           # Extended for transcript storage
src/lib/signaling/client.ts                       # Added sendAmbientTranscript() method
src/types/room.ts                                 # Added transcriptSettings interface
src/components/room/CreateRoomForm.tsx            # Transcript settings UI
src/app/rooms/[roomId]/page.tsx                   # Transcript panel + ambient hook integration
server.ts                                         # Socket handlers, summarization, context injection
```

### Implementation Notes

**Ambient Transcription Architecture:**

- Uses browser's Web Speech API instead of server-side `gpt-4o-mini-transcribe`
- Zero API cost - browser handles speech recognition locally
- Only final text sent to server via `transcript:ambient` Socket.io event
- Pauses during PTT to avoid duplicate transcription
- Flows through ContextManager → `buildContextInjection()` → AI context
