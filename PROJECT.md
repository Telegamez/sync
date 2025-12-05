# SwenSync - Synchronized Intelligence Platform

> **Long-Horizon Engineering Protocol Active**
> This project follows a stateless, file-based development methodology.
> All progress is tracked in `features_list.json` and `project-progress.md`.

---

## Vision

SwenSync is the world's first **Synchronized Intelligence Platform** — enabling multiple participants to share a single, unified AI experience in real-time. Unlike traditional AI assistants that serve individuals in isolation, SwenSync creates **shared AI rooms** where teams collaborate with a multimodal AI agent that:

- **Hears everyone** — All participants' voices contribute to shared context
- **Speaks once** — Unified audio response broadcast to all participants simultaneously
- **Remembers together** — Shared conversation history and evolving context
- **Thinks as one** — Single inference serving the entire room

This is **synchronized intelligence**: AI that thinks *with* groups, not just individuals.

---

## Core Concepts

### Shared Room Model

```
┌─────────────────────────────────────────────────────────────────┐
│                         SWENSYNC ROOM                           │
│                                                                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐        │
│  │ Peer A   │  │ Peer B   │  │ Peer C   │  │ Peer N   │        │
│  │ (Voice)  │  │ (Voice)  │  │ (Voice)  │  │ (Voice)  │        │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘        │
│       │             │             │             │               │
│       ▼             ▼             ▼             ▼               │
│  ┌─────────────────────────────────────────────────────┐       │
│  │              AUDIO MIXER / COMPOSITOR                │       │
│  │         (Combines all peer audio streams)            │       │
│  └──────────────────────┬──────────────────────────────┘       │
│                         │                                       │
│                         ▼                                       │
│  ┌─────────────────────────────────────────────────────┐       │
│  │           OPENAI REALTIME API (WebRTC)               │       │
│  │              Single Inference Instance               │       │
│  └──────────────────────┬──────────────────────────────┘       │
│                         │                                       │
│                         ▼                                       │
│  ┌─────────────────────────────────────────────────────┐       │
│  │           SYNCHRONIZED AUDIO BROADCAST               │       │
│  │      (Same response to all peers simultaneously)     │       │
│  └──────────────────────┬──────────────────────────────┘       │
│                         │                                       │
│       ┌─────────────────┼─────────────────┐                    │
│       ▼                 ▼                 ▼                    │
│  ┌──────────┐     ┌──────────┐     ┌──────────┐               │
│  │ Peer A   │     │ Peer B   │     │ Peer N   │               │
│  │ (Hears)  │     │ (Hears)  │     │ (Hears)  │               │
│  └──────────┘     └──────────┘     └──────────┘               │
└─────────────────────────────────────────────────────────────────┘
```

### Key Differentiators

| Traditional AI | SwenSync Synchronized Intelligence |
|----------------|-----------------------------------|
| 1:1 conversations | Many:1 shared rooms |
| Fragmented context | Unified shared context |
| Individual assistants | Single room AI participant |
| Isolated responses | Synchronized broadcasts |
| Per-user inference | Shared inference (cost efficient) |

---

## Technology Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| **Frontend** | Next.js 15 / React 19 | App Router, SSR, Client Components |
| **Language** | TypeScript 5.x | Type safety throughout |
| **Styling** | TailwindCSS 3.x | Utility-first CSS |
| **Real-time Transport** | WebRTC | Peer audio/video, low latency |
| **Signaling** | Socket.io / WebSocket | Room management, peer discovery |
| **AI Backend** | OpenAI Realtime API | Multimodal voice AI |
| **Audio Processing** | Web Audio API | Mixing, analysis, VAD |
| **VAD** | Silero VAD (ONNX) | Client-side voice detection |
| **Database** | PostgreSQL / Neon | Room state, user data |
| **Cache/Presence** | Redis | Real-time presence, session state |
| **Auth** | Supabase Auth | User authentication |
| **Testing** | Vitest + Playwright | Unit + E2E tests |
| **Containerization** | Docker | Reproducible deployments |

---

## Architecture Overview

### System Components

```
┌─────────────────────────────────────────────────────────────────────┐
│                           CLIENT LAYER                               │
├─────────────────────────────────────────────────────────────────────┤
│  Next.js App (React 19)                                              │
│  ├── Room UI (join/create/manage)                                   │
│  ├── Voice Interface (SwensyncOverlay - enhanced for multi-peer)    │
│  ├── Participant List & Presence                                     │
│  ├── Audio Visualizer (per-peer + AI response)                      │
│  └── WebRTC Peer Connections (mesh or SFU-routed)                   │
└────────────────────────────────┬────────────────────────────────────┘
                                 │
                                 │ WebSocket / Socket.io
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         SIGNALING LAYER                              │
├─────────────────────────────────────────────────────────────────────┤
│  Signaling Server (Node.js)                                          │
│  ├── Room Management (create, join, leave, destroy)                 │
│  ├── Peer Discovery & ICE Candidate Exchange                        │
│  ├── Presence & Participant State                                    │
│  ├── Turn Coordination (who's speaking)                              │
│  └── AI Session Orchestration                                        │
└────────────────────────────────┬────────────────────────────────────┘
                                 │
                                 │ Internal API
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      AI ORCHESTRATION LAYER                          │
├─────────────────────────────────────────────────────────────────────┤
│  Room AI Manager                                                     │
│  ├── Single OpenAI Realtime session per room                        │
│  ├── Audio Stream Multiplexing (combine peer inputs)                │
│  ├── Response Distribution (broadcast to all peers)                 │
│  ├── Context Management (shared conversation state)                 │
│  └── Session Lifecycle (token refresh, reconnection)                │
└────────────────────────────────┬────────────────────────────────────┘
                                 │
                                 │ WebRTC Data Channel
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│                       OPENAI REALTIME API                            │
├─────────────────────────────────────────────────────────────────────┤
│  ├── Voice-to-Voice Multimodal AI                                   │
│  ├── Server-side VAD                                                 │
│  ├── Real-time Audio Streaming                                       │
│  └── Conversation Context                                            │
└─────────────────────────────────────────────────────────────────────┘
```

### Audio Flow Architecture

```
                    PEER AUDIO INPUTS
                          │
    ┌─────────────────────┼─────────────────────┐
    │                     │                     │
    ▼                     ▼                     ▼
┌────────┐          ┌────────┐          ┌────────┐
│Peer A  │          │Peer B  │          │Peer C  │
│Mic     │          │Mic     │          │Mic     │
└───┬────┘          └───┬────┘          └───┬────┘
    │                   │                   │
    │     WebRTC        │     WebRTC        │
    │                   │                   │
    ▼                   ▼                   ▼
┌─────────────────────────────────────────────────┐
│            SERVER AUDIO COMPOSITOR               │
│                                                  │
│  ┌─────────────────────────────────────────┐   │
│  │  MediaStreamDestination + GainNodes      │   │
│  │  - Per-peer volume control               │   │
│  │  - Noise gate / VAD gating               │   │
│  │  - Mixed output stream                   │   │
│  └─────────────────────────────────────────┘   │
└──────────────────────┬──────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────┐
│         OPENAI REALTIME API CONNECTION          │
│                                                  │
│  Single RTCPeerConnection                        │
│  - Sends: Mixed audio from all peers            │
│  - Receives: AI audio response                   │
└──────────────────────┬──────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────┐
│           SYNCHRONIZED BROADCAST                 │
│                                                  │
│  AI Audio Response → Fanout to all peers        │
│  - Same audio                                    │
│  - Same timing                                   │
│  - Synchronized playback                         │
└─────────────────────────────────────────────────┘
```

### Voice Mode & Turn Management

To prevent chaotic interruptions in shared rooms, SwenSync implements configurable voice modes and AI response locking:

```
┌─────────────────────────────────────────────────────────────────┐
│                    VOICE MODE OPTIONS                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. OPEN MODE (small trusted groups)                            │
│     └─ All audio sent to AI, natural conversation               │
│                                                                  │
│  2. PUSH-TO-TALK MODE (recommended for most rooms)              │
│     └─ Hold button/key to address AI                            │
│     └─ Peer-to-peer chat always available                       │
│                                                                  │
│  3. DESIGNATED SPEAKER MODE (presentations/lectures)            │
│     └─ Only host/moderator can address AI                       │
│     └─ Others listen and chat peer-to-peer                      │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                  AI RESPONSE LOCKING                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Problem: Multiple participants speaking → AI interruption chaos │
│                                                                  │
│  Solution: Response Locking                                      │
│                                                                  │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐  │
│  │  IDLE    │───▶│ LISTENING│───▶│ SPEAKING │───▶│  IDLE    │  │
│  │          │    │          │    │ (LOCKED) │    │          │  │
│  └──────────┘    └──────────┘    └──────────┘    └──────────┘  │
│                                        │                        │
│                                        │ New requests queued    │
│                                        ▼                        │
│                                 ┌──────────────┐                │
│                                 │ TURN QUEUE   │                │
│                                 │ - Peer B (1) │                │
│                                 │ - Peer C (2) │                │
│                                 └──────────────┘                │
│                                                                  │
│  When AI finishes → Process next in queue → Repeat              │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Key Features:**
- **Push-to-Talk (PTT)**: Hold spacebar or button to address AI
- **Response Locking**: AI completes current response before taking new input
- **Turn Queue**: Requests queued during AI response, processed in order
- **Visual Indicators**: Clear UI showing AI state and queue position
- **Interrupt Override**: Optional emergency interrupt for room owner

---

## Project Structure

```
swensync/
├── src/
│   ├── app/                          # Next.js App Router
│   │   ├── api/
│   │   │   ├── health/               # Health check
│   │   │   ├── swensync-realtime-token/  # OpenAI token endpoint
│   │   │   ├── rooms/                # Room CRUD API (NEW)
│   │   │   │   ├── route.ts          # List/Create rooms
│   │   │   │   └── [roomId]/
│   │   │   │       ├── route.ts      # Get/Update/Delete room
│   │   │   │       ├── join/route.ts # Join room
│   │   │   │       └── leave/route.ts # Leave room
│   │   │   └── signaling/            # WebSocket upgrade (NEW)
│   │   ├── rooms/                    # Room pages (NEW)
│   │   │   ├── page.tsx              # Room list/lobby
│   │   │   ├── create/page.tsx       # Create room flow
│   │   │   └── [roomId]/
│   │   │       ├── page.tsx          # Room experience
│   │   │       └── layout.tsx        # Room layout
│   │   ├── page.tsx                  # Landing/Home
│   │   ├── layout.tsx                # Root layout
│   │   └── globals.css               # Global styles
│   │
│   ├── components/
│   │   ├── swensync/                 # Core voice components
│   │   │   ├── SwensyncOverlay.tsx   # Voice interface (enhanced)
│   │   │   ├── AudioWaveVisualizer.tsx
│   │   │   ├── ConnectionStatus.tsx
│   │   │   ├── SessionTimer.tsx
│   │   │   ├── LatencyStopwatch.tsx
│   │   │   └── VisualizerModeSwitcher.tsx
│   │   ├── room/                     # Room components (NEW)
│   │   │   ├── RoomLobby.tsx         # Room list UI
│   │   │   ├── RoomCard.tsx          # Room preview card
│   │   │   ├── CreateRoomForm.tsx    # Room creation
│   │   │   ├── ParticipantList.tsx   # Active participants
│   │   │   ├── ParticipantAvatar.tsx # Peer avatar with status
│   │   │   ├── RoomControls.tsx      # Mute/Leave/Settings
│   │   │   ├── SpeakingIndicator.tsx # Who's talking
│   │   │   └── RoomHeader.tsx        # Room title/info
│   │   └── ui/                       # Shared UI primitives
│   │
│   ├── hooks/
│   │   ├── useSwensyncRealtime.ts    # Current single-peer hook
│   │   ├── useRoomConnection.ts      # Room WebSocket (NEW)
│   │   ├── useRoomPeers.ts           # Peer management (NEW)
│   │   ├── useAudioMixer.ts          # Multi-peer audio (NEW)
│   │   ├── useSharedAI.ts            # Shared AI session (NEW)
│   │   └── usePresence.ts            # Participant presence (NEW)
│   │
│   ├── lib/
│   │   ├── utils.ts                  # Utility functions
│   │   ├── signaling/                # Signaling client (NEW)
│   │   │   ├── client.ts             # Socket.io client
│   │   │   ├── events.ts             # Event types
│   │   │   └── handlers.ts           # Event handlers
│   │   ├── audio/                    # Audio utilities (NEW)
│   │   │   ├── mixer.ts              # Audio mixing
│   │   │   ├── analyzer.ts           # Audio analysis
│   │   │   └── vad.ts                # VAD wrapper
│   │   └── room/                     # Room utilities (NEW)
│   │       ├── types.ts              # Room types
│   │       └── state.ts              # Room state management
│   │
│   ├── types/
│   │   ├── swensync.ts               # Current types
│   │   ├── room.ts                   # Room types (NEW)
│   │   ├── peer.ts                   # Peer types (NEW)
│   │   └── signaling.ts              # Signaling types (NEW)
│   │
│   └── server/                       # Server-side code (NEW)
│       ├── signaling/
│       │   ├── index.ts              # Signaling server
│       │   ├── room-manager.ts       # Room lifecycle
│       │   ├── peer-manager.ts       # Peer connections
│       │   └── ai-orchestrator.ts    # Shared AI session
│       └── db/
│           ├── schema.ts             # Database schema
│           └── queries.ts            # Database queries
│
├── public/
│   └── vad/                          # Silero VAD assets
│
├── tests/
│   ├── unit/                         # Vitest unit tests
│   └── e2e/                          # Playwright E2E tests
│
├── PROJECT.md                        # This file
├── features_list.json                # Feature tracking
├── project-progress.md               # Development log
├── init.sh                           # Bootstrap script
└── [config files]                    # package.json, tsconfig, etc.
```

---

## Feature Phases

### Phase 1: Foundation (Current - Complete)
- [x] Single-peer WebRTC to OpenAI Realtime
- [x] Audio visualization
- [x] Session management
- [x] Latency tracking
- [x] Client-side VAD

### Phase 2: Room Infrastructure (In Progress)
- [ ] Room data model and API
- [ ] Signaling server (Socket.io)
- [ ] Room creation/join/leave flows
- [ ] Basic multi-peer WebRTC mesh

### Phase 3: Multi-Peer Audio
- [ ] Audio stream mixing
- [ ] Per-peer audio analysis
- [ ] Speaking detection per peer
- [ ] Audio synchronization

### Phase 4: Shared AI Session
- [ ] Single OpenAI session per room
- [ ] Mixed audio input to AI
- [ ] Synchronized response broadcast
- [ ] Shared context management

### Phase 5: Production Polish
- [ ] Authentication integration
- [ ] Room persistence
- [ ] Participant permissions
- [ ] Error recovery
- [ ] Performance optimization

---

## Quick Start

### Prerequisites

- Node.js 20+
- OpenAI API key with Realtime API access
- (Optional) Redis for presence
- (Optional) PostgreSQL for room persistence

### Development

```bash
# Bootstrap environment
./init.sh

# Or manually:
npm install
cp .env.example .env
# Add OPENAI_API_KEY to .env

# Start development
npm run dev

# Run tests
npm run test
npm run test:e2e
```

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `OPENAI_API_KEY` | OpenAI API key | Yes |
| `DATABASE_URL` | PostgreSQL connection | For persistence |
| `REDIS_URL` | Redis connection | For presence |
| `NEXTAUTH_SECRET` | Auth secret | For auth |

---

## Development Protocol

### The Builder Loop

Every engineering cycle follows these steps:

1. **Context Re-Acquisition**
   - Read `PROJECT.md` for architecture
   - Read `features_list.json` for current task
   - Find first feature with `passes: false`

2. **Implementation**
   - Implement only the active feature
   - Keep changes focused and minimal

3. **Verification**
   - Write Vitest unit tests
   - Write Playwright E2E tests
   - Run tests: must return exit code 0

4. **State Update**
   - Set `passes: true` in `features_list.json`
   - Log to `project-progress.md`

5. **Commit**
   ```bash
   git add .
   git commit -m "feat(FEAT-XXX): description"
   ```

### Rules

- **One feature per turn** — No batching
- **Tests required** — No hallucinated passes
- **File-based memory** — Persist everything

---

## API Reference

### Room API

#### `POST /api/rooms`
Create a new room.

```json
{
  "name": "Design Review",
  "maxParticipants": 6,
  "aiPersonality": "facilitator"
}
```

#### `GET /api/rooms`
List available rooms.

#### `GET /api/rooms/:roomId`
Get room details.

#### `POST /api/rooms/:roomId/join`
Join a room.

#### `POST /api/rooms/:roomId/leave`
Leave a room.

### Signaling Events

| Event | Direction | Payload |
|-------|-----------|---------|
| `room:join` | Client→Server | `{ roomId, peerId }` |
| `room:leave` | Client→Server | `{ roomId, peerId }` |
| `peer:joined` | Server→Client | `{ peer }` |
| `peer:left` | Server→Client | `{ peerId }` |
| `signal:offer` | Client→Client | SDP offer |
| `signal:answer` | Client→Client | SDP answer |
| `signal:ice` | Client→Client | ICE candidate |
| `ai:speaking` | Server→All | `{ isActive }` |
| `presence:update` | Server→All | `{ peers }` |

---

## Testing Strategy

### Unit Tests (Vitest)
- Hooks: `useRoomConnection`, `useAudioMixer`, etc.
- Components: Render and interaction tests
- Utilities: Audio mixing, signaling client

### E2E Tests (Playwright)
- Room creation and joining
- Multi-peer audio (mocked)
- AI interaction flows
- Error handling

### Integration Tests
- Signaling server
- WebRTC connections
- Audio pipeline

---

## License

Proprietary - All rights reserved.

---

## Version

See [project-progress.md](./project-progress.md) for changelog.
