# sync Implementation Plan

## Project Overview

**sync** — The AI Collaboration Engine. Synchronized intelligence for teams.

A clean, lightweight, independent implementation bootstrapped from the rc6 support agent codebase, with all legacy references renamed to "sync" and unnecessary features removed.

---

## Status Dashboard

| Phase                        | Status      | Progress | Last Updated |
| ---------------------------- | ----------- | -------- | ------------ |
| Phase 1: Project Foundation  | 🟢 Complete | 100%     | 2024-12-04   |
| Phase 2: Core Realtime Hook  | 🟢 Complete | 100%     | 2024-12-04   |
| Phase 3: UI Components       | 🟢 Complete | 100%     | 2024-12-04   |
| Phase 4: Audio Visualizer    | 🟢 Complete | 100%     | 2024-12-04   |
| Phase 5: API Endpoints       | 🟢 Complete | 100%     | 2024-12-04   |
| Phase 6: Docker & Deployment | 🟢 Complete | 100%     | 2024-12-04   |
| Phase 7: Testing & Polish    | 🟢 Complete | 100%     | 2024-12-04   |

**Overall Progress: 7/7 Phases Complete ✅**

### Status Legend

- 🔴 Not Started
- 🟡 In Progress
- 🟢 Complete
- 🔵 Blocked

---

## Phase 1: Project Foundation

**Goal:** Initialize Next.js project with all dependencies and project structure.

### Tasks

| Task ID | Task                                   | Status | Notes                        |
| ------- | -------------------------------------- | ------ | ---------------------------- |
| 1.1     | Initialize Next.js 14+ with App Router | 🔴     | `npx create-next-app@latest` |
| 1.2     | Configure TypeScript strict mode       | 🔴     | tsconfig.json                |
| 1.3     | Install and configure shadcn/ui        | 🔴     | `npx shadcn-ui@latest init`  |
| 1.4     | Install required shadcn components     | 🔴     | button, card, badge          |
| 1.5     | Setup Tailwind CSS configuration       | 🔴     | Dark theme focus             |
| 1.6     | Install lucide-react icons             | 🔴     | Required for UI              |
| 1.7     | Create project folder structure        | 🔴     | See structure below          |
| 1.8     | Setup environment variables template   | 🔴     | .env.example                 |

### Folder Structure

```
sync/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   └── sync-realtime-token/
│   │   │       └── route.ts
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   └── globals.css
│   ├── components/
│   │   ├── sync/
│   │   │   ├── syncOverlay.tsx
│   │   │   ├── AudioWaveVisualizer.tsx
│   │   │   ├── ConnectionStatus.tsx
│   │   │   ├── SessionTimer.tsx
│   │   │   └── index.ts
│   │   └── ui/
│   │       └── (shadcn components)
│   ├── hooks/
│   │   └── usesyncRealtime.ts
│   ├── types/
│   │   └── sync.ts
│   └── lib/
│       └── utils.ts
├── public/
├── docker-compose.yml
├── Dockerfile
├── .env.example
├── .env.local
└── package.json
```

### Dependencies

```json
{
  "dependencies": {
    "next": "^14.x",
    "react": "^18.x",
    "react-dom": "^18.x",
    "lucide-react": "^0.x",
    "class-variance-authority": "^0.x",
    "clsx": "^2.x",
    "tailwind-merge": "^2.x"
  },
  "devDependencies": {
    "typescript": "^5.x",
    "@types/node": "^20.x",
    "@types/react": "^18.x",
    "tailwindcss": "^3.x",
    "autoprefixer": "^10.x",
    "postcss": "^8.x"
  }
}
```

### Acceptance Criteria

- [ ] `npm run dev` starts successfully on port 3000
- [ ] TypeScript compiles without errors
- [ ] shadcn/ui components render correctly
- [ ] Tailwind styles apply correctly

---

## Phase 2: Core Realtime Hook

**Goal:** Port and clean `useSupportAgentRealtime.ts` → `usesyncRealtime.ts`

### Tasks

| Task ID | Task                                       | Status | Notes                                          |
| ------- | ------------------------------------------ | ------ | ---------------------------------------------- |
| 2.1     | Create types/sync.ts with type definitions | 🔴     | Connection states, options, hook return        |
| 2.2     | Create usesyncRealtime.ts base structure   | 🔴     | Rename all references                          |
| 2.3     | Implement WebRTC connection logic          | 🔴     | RTCPeerConnection setup                        |
| 2.4     | Implement token fetching                   | 🔴     | fetchToken() function                          |
| 2.5     | Implement data channel handling            | 🔴     | Session config, events                         |
| 2.6     | Implement audio analyser setup             | 🔴     | For visualizer                                 |
| 2.7     | Implement session timer                    | 🔴     | 8min warning, 10min max                        |
| 2.8     | Implement state machine                    | 🔴     | Listening/Focused/Thinking/Speaking            |
| 2.9     | Remove FAQ tool from session config        | 🔴     | Clean removal                                  |
| 2.10    | Remove handleFAQSearch function            | 🔴     | Not needed                                     |
| 2.11    | Simplify AI instructions                   | 🔴     | Generic assistant                              |
| 2.12    | Update all console logs to [sync]          | 🔴     | Branding                                       |
| 2.13    | Implement turn latency tracking            | 🔴     | Track user speech start → first audio response |
| 2.14    | Store last 5 turn latencies in state       | 🔴     | Array of latency measurements                  |
| 2.15    | Expose latency data from hook              | 🔴     | For LatencyStopwatch component                 |

### Key Modifications from Legacy

| Legacy Code                     | sync Code                  | Change Type |
| ------------------------------- | -------------------------- | ----------- |
| `SupportAgentConnectionState`   | `syncConnectionState`      | Rename      |
| `SupportAgentRealtimeOptions`   | `syncRealtimeOptions`      | Rename      |
| `SupportAgentRealtimeHook`      | `syncRealtimeHook`         | Rename      |
| `useSupportAgentRealtime`       | `usesyncRealtime`          | Rename      |
| `[SupportAgent]` logs           | `[sync]` logs              | Rename      |
| `search_faq` tool               | ❌ Removed                 | Delete      |
| `handleFAQSearch`               | ❌ Removed                 | Delete      |
| Telegames-specific instructions | Generic sync assistant     | Simplify    |
| `/api/support-realtime-token`   | `/api/sync-realtime-token` | Rename      |

### Simplified AI Instructions Template

```
You are sync, a fast and friendly voice AI assistant.

## BEHAVIOR
- Respond conversationally and naturally
- Keep responses concise for voice interaction
- Be helpful, clear, and efficient

## VOICE STYLE
- Warm and professional
- Brief responses optimized for speech
- Natural conversation flow
```

### Turn Latency Tracking

**Purpose:** Measure and display the time from when user starts speaking to when AI audio response begins playing.

#### Latency Measurement Flow

```
User Speech Start (input_audio_buffer.speech_started)
        ↓
    [STOPWATCH RUNNING]
        ↓
First Audio Playback (response.audio.delta - first occurrence)
        ↓
    [STOPWATCH STOPS - Record latency]
```

#### Data Structure

```typescript
interface TurnLatency {
  turnNumber: number; // Sequential turn counter
  latencyMs: number; // Time in milliseconds
  timestamp: Date; // When the turn completed
}

interface syncRealtimeHook {
  // ... existing fields ...

  /** Current stopwatch state */
  isStopwatchRunning: boolean;

  /** Current stopwatch elapsed time in ms (live updating) */
  stopwatchElapsed: number;

  /** Last 5 turn latencies (most recent first) */
  turnLatencies: TurnLatency[];

  /** Current turn number */
  currentTurnNumber: number;
}
```

#### Implementation Details

1. **Start Stopwatch:** On `input_audio_buffer.speech_started` event
2. **Stop Stopwatch:** On first `response.audio.delta` event after speech started
3. **Record Latency:** Push to `turnLatencies` array (keep last 5)
4. **Reset:** Clear stopwatch for next turn
5. **Live Update:** Update `stopwatchElapsed` every ~16ms while running

### Acceptance Criteria

- [ ] Hook compiles without TypeScript errors
- [ ] All references renamed to sync
- [ ] FAQ tool completely removed
- [ ] Session timer works correctly
- [ ] State machine transitions work
- [ ] Stopwatch starts when user begins speaking
- [ ] Stopwatch stops on first audio response
- [ ] Last 5 latencies stored correctly
- [ ] Latency data exposed from hook

---

## Phase 3: UI Components

**Goal:** Port and clean overlay UI, create modular components.

### Tasks

| Task ID | Task                                   | Status | Notes                                   |
| ------- | -------------------------------------- | ------ | --------------------------------------- |
| 3.1     | Create ConnectionStatus.tsx component  | 🔴     | Extracted from overlay                  |
| 3.2     | Create SessionTimer.tsx component      | 🔴     | Extracted from overlay                  |
| 3.3     | Create LatencyStopwatch.tsx component  | 🔴     | **NEW** - Visual stopwatch with history |
| 3.4     | Create syncOverlay.tsx main component  | 🔴     | Full-screen overlay                     |
| 3.5     | Remove room audio muting logic         | 🔴     | Not needed                              |
| 3.6     | Remove SupportAgentActiveContext usage | 🔴     | Not needed                              |
| 3.7     | Remove LocalUserMediaContext usage     | 🔴     | Not needed                              |
| 3.8     | Remove support-overlay-closed events   | 🔴     | Not needed                              |
| 3.9     | Update all component names to sync     | 🔴     | Branding                                |
| 3.10    | Create index.ts barrel export          | 🔴     | Clean imports                           |
| 3.11    | Style with Tailwind (dark theme)       | 🔴     | Consistent styling                      |

### Component Architecture

```
syncOverlay (main container)
├── Header (top bar)
│   ├── SessionTimer (left - countdown to 10min)
│   ├── LatencyStopwatch (left, next to timer)
│   │   ├── Live stopwatch display
│   │   └── Last 5 turn latencies
│   └── Close button (right)
├── ConnectionStatus (top center)
├── AudioWaveVisualizer (center - Phase 4)
└── Error/Loading states (conditional)
```

### Props Interfaces

```typescript
interface syncOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  userName?: string; // Optional personalization
}

interface LatencyStopwatchProps {
  /** Whether the stopwatch is currently running */
  isRunning: boolean;
  /** Current elapsed time in milliseconds */
  elapsedMs: number;
  /** Last 5 turn latencies (most recent first) */
  turnLatencies: TurnLatency[];
}
```

### LatencyStopwatch Component Specification

**Visual Design:**

```
┌─────────────────────────────────────────────┐
│  ⏱️  1.234s  │  1: 1.2s  2: 0.9s  3: 1.5s  │
│   [RUNNING]  │  4: 1.1s  5: 0.8s           │
└─────────────────────────────────────────────┘
```

**Layout:**

- **Left Section:** Live stopwatch display
  - Stopwatch icon (⏱️ or Timer icon from lucide)
  - Current elapsed time (updating every 16ms when running)
  - Running/Stopped indicator
- **Right Section:** Last 5 turn latencies
  - Compact display: `1: 1.2s  2: 0.9s  3: 1.5s ...`
  - Most recent turn highlighted
  - Faded styling for older turns

**Visual States:**
| State | Appearance |
|-------|------------|
| Idle (no turns yet) | Muted stopwatch, no history |
| Running | Pulsing/animated stopwatch, green glow |
| Stopped (recorded) | Static time, new entry in history |

**Color Coding for Latencies:**
| Latency | Color | Meaning |
|---------|-------|---------|
| < 500ms | 🟢 Green | Excellent |
| 500ms - 1000ms | 🟡 Yellow | Good |
| 1000ms - 2000ms | 🟠 Orange | Acceptable |
| > 2000ms | 🔴 Red | Slow |

### Folder Structure Update

```
sync/
├── src/
│   ├── components/
│   │   ├── sync/
│   │   │   ├── syncOverlay.tsx
│   │   │   ├── AudioWaveVisualizer.tsx
│   │   │   ├── ConnectionStatus.tsx
│   │   │   ├── SessionTimer.tsx
│   │   │   ├── LatencyStopwatch.tsx    # NEW
│   │   │   └── index.ts
```

### Acceptance Criteria

- [ ] Overlay renders as full-screen modal
- [ ] Connection states display correctly
- [ ] Session timer updates every second
- [ ] ESC key closes overlay
- [ ] Close button works
- [ ] No legacy room dependencies
- [ ] LatencyStopwatch displays next to SessionTimer
- [ ] Stopwatch updates smoothly when running
- [ ] Last 5 latencies display correctly
- [ ] Latencies color-coded by speed

---

## Phase 4: Audio Visualizer

**Goal:** Create 2D audio visualizer to replace 3D avatar with swappable modes.

### Tasks

| Task ID | Task                                          | Status | Notes                            |
| ------- | --------------------------------------------- | ------ | -------------------------------- |
| 4.1     | Create AudioWaveVisualizer.tsx base component | 🟢     | Canvas-based                     |
| 4.2     | Implement **Mode 1: Bars**                    | 🟢     | Frequency bar visualization      |
| 4.3     | Implement **Mode 2: Waveform**                | 🟢     | Time-domain waveform display     |
| 4.4     | Implement **Mode 3: Circular**                | 🟢     | Circular frequency analyzer      |
| 4.5     | Optimize render loop (requestAnimationFrame)  | 🟢     | 60fps animation                  |
| 4.6     | State-based color changes                     | 🟢     | Green/Yellow/Blue/Gray per state |

### Visualizer Props

```typescript
type VisualizerVariant = "bars" | "waveform" | "circular";

interface AudioWaveVisualizerProps {
  analyserNode: AnalyserNode | null;
  isActive: boolean;
  animState: syncAnimState;
  variant?: VisualizerVariant; // Default to 'bars'
}
```

### Visual States

| State     | Color            | Animation               |
| --------- | ---------------- | ----------------------- |
| Speaking  | Green (#22c55e)  | Full audio response     |
| Thinking  | Yellow (#eab308) | Subtle idle animation   |
| Focused   | Blue (#3b82f6)   | User speaking indicator |
| Listening | Gray (#6b7280)   | Gentle idle animation   |

### Acceptance Criteria

- [x] 3 modes implemented and swappable (bars, waveform, circular)
- [x] Visualizer responds to audio input `getByteFrequencyData` / `getByteTimeDomainData`
- [x] Smooth 60fps animation
- [x] State-based color changes
- [x] No memory leaks (cleanup on unmount)

---

## Phase 5: API Endpoints

**Goal:** Implement backend token endpoint for OpenAI authentication.

### Tasks

| Task ID | Task                                     | Status | Notes             |
| ------- | ---------------------------------------- | ------ | ----------------- |
| 5.1     | Create /api/sync-realtime-token/route.ts | 🔴     | Next.js API route |
| 5.2     | Implement OpenAI ephemeral token fetch   | 🔴     | Server-side only  |
| 5.3     | Add error handling                       | 🔴     | Graceful failures |
| 5.4     | Add rate limiting (optional)             | 🔴     | Prevent abuse     |
| 5.5     | Setup environment variables              | 🔴     | OPENAI_API_KEY    |

### API Route Implementation

```typescript
// /api/sync-realtime-token/route.ts
export async function GET() {
  // 1. Validate request (optional auth)
  // 2. Fetch ephemeral token from OpenAI
  // 3. Return token to client
}
```

### Environment Variables

```env
# .env.local
OPENAI_API_KEY=sk-...
```

### Acceptance Criteria

- [ ] Endpoint returns valid ephemeral token
- [ ] API key not exposed to client
- [ ] Error responses are informative
- [ ] Works in development and production

---

## Phase 6: Docker & Deployment

**Goal:** Containerize application for deployment.

### Tasks

| Task ID | Task                        | Status | Notes              |
| ------- | --------------------------- | ------ | ------------------ |
| 6.1     | Create Dockerfile           | 🟢     | Multi-stage build  |
| 6.2     | Create docker-compose.yml   | 🟢     | Service definition |
| 6.3     | Configure non-standard port | 🟢     | Port 3100          |
| 6.4     | Setup host networking mode  | 🟢     | For Nginx proxy    |
| 6.5     | Create .dockerignore        | 🟢     | Optimize build     |
| 6.6     | Test local Docker build     | 🟡     | Pending            |
| 6.7     | Document deployment steps   | 🟡     | Pending            |

### Docker Configuration

```yaml
# docker-compose.yml
version: "3.8"
services:
  sync:
    build: .
    network_mode: host
    environment:
      - NODE_ENV=production
      - PORT=3100 # Non-standard port
    env_file:
      - .env.local
```

### Dockerfile Strategy

```dockerfile
# Multi-stage build
FROM node:20-alpine AS builder
# ... build steps

FROM node:20-alpine AS runner
# ... production runtime
```

### Acceptance Criteria

- [ ] `docker-compose up` starts successfully
- [ ] App accessible on configured port
- [ ] Environment variables injected correctly
- [ ] Container size optimized (<500MB)

---

## Phase 7: Testing & Polish

**Goal:** Ensure quality and prepare for production.

### Tasks

| Task ID | Task                        | Status | Notes                          |
| ------- | --------------------------- | ------ | ------------------------------ |
| 7.1     | Manual end-to-end testing   | 🔴     | Full conversation flow         |
| 7.2     | Test microphone permissions | 🔴     | Browser handling               |
| 7.3     | Test session timeout        | 🔴     | 8min warning, 10min disconnect |
| 7.4     | Test error recovery         | 🔴     | Retry functionality            |
| 7.5     | Test across browsers        | 🔴     | Chrome, Firefox, Safari        |
| 7.6     | Performance profiling       | 🔴     | Memory, CPU usage              |
| 7.7     | Accessibility review        | 🔴     | ARIA labels, keyboard nav      |
| 7.8     | Update README with usage    | 🔴     | Documentation                  |
| 7.9     | Clean up any console.logs   | 🔴     | Production ready               |
| 7.10    | Final code review           | 🔴     | Quality check                  |

### Test Scenarios

1. **Happy Path:** Open overlay → Connect → Speak → Get response → Close
2. **Error Handling:** No mic permission → Show error → Retry works
3. **Timeout:** Stay connected 8+ minutes → Warning shown → Auto-disconnect at 10
4. **Reconnect:** Disconnect → Reopen → Connects successfully

### Acceptance Criteria

- [ ] Full conversation works end-to-end
- [ ] No console errors in production
- [ ] Graceful error handling
- [ ] Documentation complete

---

## Implementation Notes

### What's Removed from Legacy

1. ❌ 3D Avatar (`SupportTele3DHead`, `SupportAgentAvatar`)
2. ❌ FAQ/RAG Tool (`search_faq`, `handleFAQSearch`)
3. ❌ Room Integration (`useLocalUserMedia`, `useSupportAgentActiveOptional`)
4. ❌ Room Audio Muting
5. ❌ Custom Events (`support-overlay-closed`)
6. ❌ Telegames-specific AI instructions

### What's Added

1. ✅ **Advanced 2D Visualizers** (Swarm, Horizon, Orb, Pulse, Ring)
2. ✅ Simplified AI instructions
3. ✅ Clean, independent architecture
4. ✅ Docker deployment configuration
5. ✅ **Latency Stopwatch** - Visual turn-by-turn latency tracking
   - Live stopwatch showing time from user speech → AI audio response
   - History of last 5 turn latencies with color coding
   - Performance visibility for synchronized intelligence platform

### Naming Convention

| Concept | Name                               |
| ------- | ---------------------------------- |
| Project | sync                               |
| Hook    | usesyncRealtime                    |
| Overlay | syncOverlay                        |
| Types   | syncConnectionState, syncAnimState |
| API     | /api/sync-realtime-token           |
| Logs    | [sync]                             |

---

## Quick Reference Commands

```bash
# Development
npm run dev

# Build
npm run build

# Docker
docker-compose up --build

# Type check
npm run type-check
```

---

## Change Log

| Date       | Phase | Change                                                                                                    | Author |
| ---------- | ----- | --------------------------------------------------------------------------------------------------------- | ------ |
| 2024-12-04 | -     | Initial plan created                                                                                      | Claude |
| 2024-12-04 | 2, 3  | Added Latency Stopwatch feature (Tasks 2.13-2.15, 3.3)                                                    | Claude |
| 2024-12-04 | 4     | Added 5 new Visualizer Modes (Tasks 4.1-4.8)                                                              | Claude |
| 2024-12-04 | 5     | Fixed 401 auth error: Added `OpenAI-Beta: realtime=v1` header, updated model to `gpt-4o-realtime-preview` | Claude |
| 2024-12-04 | 4     | Updated Phase 4 to reflect implemented modes (bars, waveform, circular)                                   | Claude |
| 2024-12-04 | 7     | End-to-end testing complete, multiple sessions verified working                                           | User   |
| 2024-12-04 | All   | **PROJECT COMPLETE** - All 7 phases finished                                                              | Claude |

---

_Last Updated: 2024-12-04_
