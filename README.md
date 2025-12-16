# sync

## Purpose

sync is the AI Collaboration Engine — synchronized intelligence for teams.

## Overview

This repository contains the codebase for building a high-performance, low-latency voice AI solution designed for seamless conversational experiences.

## Roadmap & Bootstrapping Plan

We are bootstrapping this repository by extracting the core "Support Realtime API" implementation from an existing project (`rc6`), focusing on speed and simplicity.

### 1. Core Logic Extraction

We will replicate the essence of the OpenAI Realtime API integration found in `useSupportAgentRealtime.ts` and `SupportAgentOverlay.tsx`.

**Key Components to Port:**

- **Native WebRTC Implementation**: Direct usage of `RTCPeerConnection` to connect to OpenAI's Realtime API (`https://api.openai.com/v1/realtime`).
- **Session Management**:
  - Connection state handling (idle, connecting, connected, error).
  - Session timer (warning at 8 mins, auto-disconnect at 10 mins).
  - Audio context and analyser setup for visualization.
- **UI Overlay**:
  - Full-screen overlay (`fixed inset-0`).
  - Session timer display.
  - Connection status indicator.
  - Close/Disconnect functionality.

### 2. Key Modifications & Exclusions

To achieve our goal of a lightweight, focused platform, we are explicitly **excluding** the following features from the original implementation:

- **No 3D Avatar**:
  - We will **not** port `SupportTele3DHead` or `SupportAgentAvatar`.
  - No 3D model loading, animation, or lip-sync logic.
- **No RAG / FAQ Knowledge Lookup**:
  - We will remove the `search_faq` tool definition from the OpenAI session configuration.
  - We will remove the `handleFAQSearch` function and the dependency on `/api/support-faq-search`.
  - The AI instructions will be simplified to focus on a pure conversational experience without external knowledge base lookups.

### 3. New Visualizer Options

To replace the 3D avatar and better represent "sync" (Sense/Swarm/Speed), we will explore 5 high-tech audio visualization concepts. The goal is to find a visual language that feels alive, responsive, and incredibly fast.

**Proposed Visualizations:**

1.  **"Neural Swarm" (Particles)**: A cloud of particles that orbit and pulse with the voice frequency. They cluster tightly when thinking (intense processing) and expand/flow dynamically when speaking.
2.  **"Spectral Horizon" (3D Terrain)**: A retro-futuristic wireframe landscape or horizon line that deforms based on audio frequencies, moving forward in 3D space to simulate speed/progress.
3.  **"Quantum Orb" (Fluid Sphere)**: A central sphere made of fluid-like mesh that ripples and distorts with audio energy. It glows intensely during "thinking" phases.
4.  **"Digital Pulse" (Minimalist Wave)**: A sleek, high-fidelity waveform (like Siri or Google Assistant but sharper) with multi-colored gradients representing different emotional tones or frequency bands.
5.  **"Sonic Ring" (Circular FFT)**: A circular frequency analyzer where bars radiate outward from a center point. The radius expands/contracts with volume, creating a "breathing" effect.

_We will initially implement the "Digital Pulse" or "Sonic Ring" for MVP but structure the `AudioWaveVisualizer` component to easily swap between these modes for testing._

### 4. Infrastructure & Framework

- **Next.js Framework**: We will bootstrap a new Next.js instance.
- **UI Components**: We will use Shadcn UI for the component library.
- **Docker Deployment**:
  - The application will be containerized using `docker-compose`.
  - Services will run on **non-standard ports** to avoid conflicts.
  - Containers will use **host networking** to leverage the host machine's Nginx proxy for SSL termination and routing.

### 5. Backend Requirements

- We will need to implement a backend endpoint (e.g., `/api/support-realtime-token`) to fetch ephemeral OpenAI tokens, mirroring the logic in `useSupportAgentRealtime`.

## Getting Started

### Prerequisites

- Node.js 20+
- npm
- OpenAI API key with Realtime API access

### Installation

1. Clone the repository:

```bash
cd /opt/telegamez/sync
```

2. Install dependencies:

```bash
npm install
```

3. Create environment file:

```bash
cp .env.example .env.local
```

4. Add your OpenAI API key to `.env.local`:

```env
OPENAI_API_KEY=sk-your-api-key-here
```

### Development

Start the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Production Build

```bash
npm run build
npm start
```

### Docker Deployment

```bash
# Build and run with Docker Compose
docker-compose up --build

# The app will be available on port 3100
```

## Project Structure

```
sync/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── api/
│   │   │   ├── health/         # Health check endpoint
│   │   │   └── sync-realtime-token/  # OpenAI token endpoint
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   └── globals.css
│   ├── components/
│   │   └── sync/             # sync UI components
│   │       ├── syncOverlay.tsx
│   │       ├── AudioWaveVisualizer.tsx
│   │       ├── ConnectionStatus.tsx
│   │       ├── SessionTimer.tsx
│   │       ├── LatencyStopwatch.tsx
│   │       └── index.ts
│   ├── hooks/
│   │   └── usesyncRealtime.ts  # Core WebRTC hook
│   ├── types/
│   │   └── sync.ts           # TypeScript types
│   └── lib/
│       └── utils.ts            # Utility functions
├── docker-compose.yml
├── Dockerfile
└── IMPLEMENTATION_PLAN.md      # Detailed implementation plan
```

## Features

- **Multi-Peer Voice Rooms**: Create and join rooms where multiple participants share a single AI session
- **Push-to-Talk (PTT)**: Hold Space or on-screen button to address the AI
- **Speaker Blocking**: Only one person can address the AI at a time - others are blocked until the current speaker finishes
- **Interrupt Button**: "Excuse Me" button to interrupt AI responses for urgent interjections
- **AI Personality Presets**: Choose from Facilitator, Assistant, Expert, or Brainstorm personalities
- **Topic Expertise**: Optionally configure AI with domain-specific knowledge
- **Real-time Audio Streaming**: Low-latency voice communication via OpenAI Realtime API
- **Presence Indicators**: See who's speaking, muted, or idle in real-time
- **Audio Visualization**: Visual feedback during AI responses
- **Session Management**: Automatic cleanup when rooms empty

## Speaking Modes

The application uses Push-to-Talk (PTT) as the default mode for addressing the AI.

### Currently Implemented

- **Push to Talk (`pushToTalk`)**: Users must hold a specific key (default: Space) or on-screen button to address the AI. This is the default mode to prevent accidental activation. **Only one user can PTT at a time** - if another user is addressing the AI, you'll be blocked until they finish.

### Planned / Roadmap

- **Open Mic (`open`)**: Microphone is always active (gated by Voice Activity Detection). All audio is sent to the AI. Ideal for small, trusted groups. _Requires VAD integration._
- **Wake Word (`wakeWord`)**: AI activates only when a specific phrase is spoken (e.g., "Hey sync"). _Requires speech-to-text integration._
- **Designated Speaker (`designatedSpeaker`)**: Restricted mode where only specific users with permission can address the AI. Perfect for moderated sessions. _Type definitions exist, UI partially implemented._

## Architecture

The application uses:

- **Next.js 15** with App Router and custom server (server.ts)
- **Socket.io** for real-time signaling and room management
- **OpenAI Realtime API** (gpt-4o-realtime-preview) via WebSocket
- **Tailwind CSS** for styling
- **TypeScript** for type safety

### Data Flow

```
Participant A ──PTT──► Socket.io Server ──► OpenAI Realtime API
Participant B ◄────────── Audio Broadcast ◄────── AI Response
Participant C ◄──────────────────────────────────────────────┘
```

All participants in a room hear the same AI response simultaneously.

Current Architecture

1. Client-Side WebRTC (Single User) - usesyncRealtime hook
   Uses native WebRTC (RTCPeerConnection) directly with OpenAI Realtime API
   Gets ephemeral token from /api/sync-realtime-token
   Direct browser ↔ OpenAI connection
   Used for single-user sync overlay experience
2. Server-Side WebSocket (Multi-User Rooms) - OpenAIRealtimeClient
   Uses WebSocket (wss://api.openai.com/v1/realtime) from the server
   Server acts as intermediary for multiple room participants
   Audio is relayed: Participants → Server → OpenAI → Server → Participants
   Used for shared AI rooms with PTT (Push-to-Talk)
   API Summary
   Component Transport API Model Purpose
   Client sync WebRTC Realtime API gpt-4o-realtime-preview Single-user voice agent
   Room AI (server) WebSocket Realtime API gpt-4o-realtime-preview Multi-user shared AI
   Transcription WebSocket Realtime API gpt-4o-mini-transcribe Real-time STT
   Summaries HTTP Responses API gpt-4o-mini Text generation
