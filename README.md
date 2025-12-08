# Swensync

## Purpose

Swensync is the AI Collaboration Engine — synchronized intelligence for teams.

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

To replace the 3D avatar and better represent "Swensync" (Sense/Swarm/Speed), we will explore 5 high-tech audio visualization concepts. The goal is to find a visual language that feels alive, responsive, and incredibly fast.

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
cd /opt/telegamez/swensync
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
swensync/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── api/
│   │   │   ├── health/         # Health check endpoint
│   │   │   └── swensync-realtime-token/  # OpenAI token endpoint
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   └── globals.css
│   ├── components/
│   │   └── swensync/             # Swensync UI components
│   │       ├── SwensyncOverlay.tsx
│   │       ├── AudioWaveVisualizer.tsx
│   │       ├── ConnectionStatus.tsx
│   │       ├── SessionTimer.tsx
│   │       ├── LatencyStopwatch.tsx
│   │       └── index.ts
│   ├── hooks/
│   │   └── useSwensyncRealtime.ts  # Core WebRTC hook
│   ├── types/
│   │   └── swensync.ts           # TypeScript types
│   └── lib/
│       └── utils.ts            # Utility functions
├── docker-compose.yml
├── Dockerfile
└── IMPLEMENTATION_PLAN.md      # Detailed implementation plan
```

## Features

- **Native WebRTC**: Direct connection to OpenAI Realtime API
- **High-Fidelity Audio Visualizer**: "Neural Swarm" or "Digital Pulse" style visualization
- **Latency Stopwatch**: Real-time measurement of response latency
- **Session Management**: 10-minute sessions with 8-minute warning
- **Turn History**: Last 5 turn latencies with color-coded performance

## Speaking Modes

The application architecture supports four distinct modes for addressing the AI, catering to different collaboration scenarios.

### Currently Implemented

- **Push to Talk (`pushToTalk`)**: Users must hold a specific key (default: Space) or on-screen button to address the AI. This is the default mode to prevent accidental activation.

### Planned / Roadmap

- **Open Mic (`open`)**: Microphone is always active (gated by Voice Activity Detection). All audio is sent to the AI. Ideal for small, trusted groups.
- **Wake Word (`wakeWord`)**: AI activates only when a specific phrase is spoken (e.g., "Hey Swensync").
- **Designated Speaker (`designatedSpeaker`)**: Restricted mode where only specific users with permission can address the AI. Perfect for moderated sessions.

## Architecture

The application uses:

- Next.js 14 with App Router
- Native WebRTC (RTCPeerConnection)
- OpenAI Realtime API (gpt-4o-realtime-preview)
- Tailwind CSS for styling
- TypeScript for type safety
