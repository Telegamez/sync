# Phase 8: Synchronized Video Player with Voice Commands

## Overview

Implement a synchronized video player overlay that allows room participants to watch YouTube videos together via voice commands. Videos from the search results panel can be played sequentially as a playlist, with all playback events synchronized across all participants.

## User Stories

1. **As a participant**, I want to say "play videos" or "watch videos" to start playing YouTube videos from the search results
2. **As a participant**, I want to say "stop video" or "close video" to stop playback and close the player
3. **As a participant**, I want all participants to see the same video at the same time (synchronized)
4. **As a participant**, I want playback controls (pause, play, seek) to be synchronized across all participants
5. **Stretch Goal**: Voice-activated playback controls ("pause", "next video", "previous video")

## Technical Architecture

### Voice Commands (OpenAI Function Calling)

New functions to add to `server.ts`:

```typescript
const PLAY_VIDEO_TOOL = {
  type: "function",
  name: "playVideo",
  description:
    "Play videos from search results. Use when user says 'play videos', 'watch videos', 'show videos', or wants to start video playback.",
  parameters: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["play", "stop", "pause", "resume", "next", "previous"],
        description: "The playback action to perform",
      },
    },
    required: ["action"],
  },
};
```

### Socket.io Events

New events for video synchronization:

| Event          | Direction        | Payload                                         | Purpose                       |
| -------------- | ---------------- | ----------------------------------------------- | ----------------------------- |
| `video:play`   | Server → Clients | `{ roomId, playlist, currentIndex, startTime }` | Start playlist playback       |
| `video:stop`   | Server → Clients | `{ roomId }`                                    | Stop and close player         |
| `video:pause`  | Server → Clients | `{ roomId, currentTime }`                       | Pause at specific time        |
| `video:resume` | Server → Clients | `{ roomId, currentTime }`                       | Resume from time              |
| `video:seek`   | Server → Clients | `{ roomId, time }`                              | Seek to time                  |
| `video:next`   | Server → Clients | `{ roomId, index }`                             | Next video in playlist        |
| `video:sync`   | Client → Server  | `{ roomId, currentTime }`                       | Sync request from late joiner |
| `video:state`  | Server → Clients | Full state for late joiners                     |

### New Types (`src/types/video.ts`)

```typescript
export interface VideoPlaylist {
  id: string;
  roomId: RoomId;
  videos: SerperVideoResult[];
  currentIndex: number;
  createdAt: Date;
}

export interface VideoPlaybackState {
  isPlaying: boolean;
  isPaused: boolean;
  currentVideoIndex: number;
  currentTime: number;
  playlist: VideoPlaylist | null;
  syncedStartTime: number; // Server timestamp for sync
  triggeredBy: PeerId;
}

// Socket.io payload types
export interface VideoPlayPayload {
  roomId: RoomId;
  playlist: VideoPlaylist;
  currentIndex: number;
  startTime: number;
}

export interface VideoStopPayload {
  roomId: RoomId;
}

export interface VideoPausePayload {
  roomId: RoomId;
  currentTime: number;
}

export interface VideoSeekPayload {
  roomId: RoomId;
  time: number;
}
```

### New Hook (`src/hooks/useVideo.ts`)

```typescript
export interface UseVideoOptions {
  roomId: RoomId;
  client: SignalingClient | null;
  searchResults: SearchResults | null;
}

export interface UseVideoReturn {
  // State
  isPlayerOpen: boolean;
  isPlaying: boolean;
  isPaused: boolean;
  playlist: VideoPlaylist | null;
  currentVideo: SerperVideoResult | null;
  currentIndex: number;
  currentTime: number;

  // Actions
  play: () => void;
  stop: () => void;
  pause: () => void;
  resume: () => void;
  seek: (time: number) => void;
  nextVideo: () => void;
  previousVideo: () => void;

  // Sync
  onTimeUpdate: (time: number) => void;
  onVideoEnd: () => void;
}
```

### New Component (`src/components/room/VideoPlayerOverlay.tsx`)

Full-screen overlay component with:

- YouTube iframe embed (using youtube-nocookie.com for privacy)
- Synchronized playback using YouTube IFrame API
- Playlist display showing current/upcoming videos
- Playback controls (play/pause, next/prev, seek bar)
- Close button
- Mobile-responsive design

```tsx
export interface VideoPlayerOverlayProps {
  isOpen: boolean;
  playlist: VideoPlaylist | null;
  currentIndex: number;
  currentTime: number;
  isPlaying: boolean;
  isPaused: boolean;
  onClose: () => void;
  onTimeUpdate: (time: number) => void;
  onVideoEnd: () => void;
  onPause: () => void;
  onResume: () => void;
  onSeek: (time: number) => void;
  onNext: () => void;
  onPrevious: () => void;
}
```

### Server-Side State (`server.ts`)

```typescript
interface RoomVideoState {
  roomId: string;
  playlist: VideoPlaylist | null;
  isPlaying: boolean;
  isPaused: boolean;
  currentIndex: number;
  currentTime: number;
  syncedStartTime: number;
  triggeredBy: string | null;
}

const roomVideoStates = new Map<string, RoomVideoState>();
```

### YouTube Video ID Extraction

Utility to extract video ID from various YouTube URL formats:

- `https://www.youtube.com/watch?v=VIDEO_ID`
- `https://youtu.be/VIDEO_ID`
- `https://www.youtube.com/embed/VIDEO_ID`

```typescript
function extractYouTubeVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&?/]+)/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}
```

## Implementation Features

### Feature 1: Video Types and Interfaces (`FEAT-800`)

- Create `src/types/video.ts` with all type definitions
- Export from central types index

### Feature 2: useVideo Hook (`FEAT-801`)

- Client-side video state management
- Subscribe to video Socket.io events
- Expose playback controls and state

### Feature 3: VideoPlayerOverlay Component (`FEAT-802`)

- Full-screen overlay with YouTube embed
- Playlist sidebar
- Playback controls
- Mobile responsive

### Feature 4: Server-Side Video State (`FEAT-803`)

- Add video state tracking to `server.ts`
- Add `playVideo` function tool to OpenAI
- Handle video Socket.io events
- Broadcast playback state to room

### Feature 5: Room Page Integration (`FEAT-804`)

- Integrate `useVideo` hook
- Add `VideoPlayerOverlay` component
- Handle overlay z-index (above search/transcript panels)

### Feature 6: Playback Synchronization (`FEAT-805`)

- Implement sync protocol for late joiners
- Handle network latency compensation
- Periodic sync heartbeats

### Feature 7: Voice-Activated Controls (Stretch) (`FEAT-806`)

- Add voice commands for pause/resume/next/previous
- Extend `playVideo` function with action parameter

## UI/UX Design

### Video Player Overlay

- **Position**: Fixed, full viewport between header and footer
- **Background**: Dark overlay (bg-gray-900/95)
- **Layout**:
  - Main area: YouTube iframe (16:9 aspect ratio)
  - Right sidebar (desktop): Playlist with thumbnails
  - Bottom (mobile): Collapsed playlist
  - Top: Video title, close button
  - Bottom: Playback controls

### Z-Index Strategy

```
Header: z-50
Video Overlay: z-40 (below header, above panels)
Search/Transcript Panels: z-30
Main content: z-0
Footer: z-50
```

### Panel Visibility

When video player opens:

- Hide search panel
- Hide transcript panel
- Show video overlay full-width

## Synchronization Protocol

1. **Play Command**:
   - Server receives playVideo function call
   - Server creates playlist from search results videos
   - Server broadcasts `video:play` with `syncedStartTime = Date.now()`
   - All clients start playback at syncedStartTime

2. **Seek/Pause/Resume**:
   - Any client action emits event to server
   - Server broadcasts to all clients with exact timestamp
   - Clients adjust playback to match

3. **Late Joiner**:
   - Client joins room
   - If video is playing, server sends current state
   - Client seeks to current position and starts

4. **Video End**:
   - YouTube player fires `onEnd` event
   - Server broadcasts `video:next` with new index
   - If last video, server broadcasts `video:stop`

## Feature List Updates

Add to `features_list.json`:

```json
{
  "id": "FEAT-800",
  "phase": 8,
  "category": "types",
  "description": "Video player types and interfaces for synchronized playback",
  "priority": "critical",
  "steps": [
    "Create src/types/video.ts with VideoPlaylist interface",
    "Define VideoPlaybackState interface",
    "Define Socket.io payload types for video events",
    "Add utility function for YouTube video ID extraction",
    "Export all types from central index"
  ],
  "testFile": "tests/unit/types/video.test.ts",
  "dependencies": ["FEAT-600"],
  "passes": false
},
{
  "id": "FEAT-801",
  "phase": 8,
  "category": "hooks",
  "description": "useVideo hook for client-side video state management",
  "priority": "critical",
  "steps": [
    "Create src/hooks/useVideo.ts",
    "Subscribe to video:play, video:stop, video:pause events",
    "Manage playlist, currentIndex, isPlaying state",
    "Expose play, stop, pause, seek action methods",
    "Handle late-joiner state synchronization"
  ],
  "testFile": "tests/unit/hooks/useVideo.test.ts",
  "dependencies": ["FEAT-800", "FEAT-604"],
  "passes": false
},
{
  "id": "FEAT-802",
  "phase": 8,
  "category": "components",
  "description": "VideoPlayerOverlay component with YouTube embed and playlist",
  "priority": "critical",
  "steps": [
    "Create src/components/room/VideoPlayerOverlay.tsx",
    "Implement YouTube IFrame API integration",
    "Add playlist sidebar with video thumbnails",
    "Add playback controls (play/pause, next/prev, progress)",
    "Add close button and keyboard shortcuts",
    "Implement mobile-responsive layout"
  ],
  "testFile": "tests/unit/components/VideoPlayerOverlay.test.tsx",
  "dependencies": ["FEAT-800"],
  "passes": false
},
{
  "id": "FEAT-803",
  "phase": 8,
  "category": "signaling",
  "description": "Server-side video state and Socket.io event handlers",
  "priority": "critical",
  "steps": [
    "Add playVideo function tool to OpenAI session config",
    "Add roomVideoStates Map for per-room state",
    "Handle playVideo function calls from OpenAI",
    "Implement video:play, video:stop, video:pause handlers",
    "Broadcast video state to late joiners on room:joined"
  ],
  "testFile": "tests/unit/signaling/video-events.test.ts",
  "dependencies": ["FEAT-800", "FEAT-602"],
  "passes": false
},
{
  "id": "FEAT-804",
  "phase": 8,
  "category": "pages",
  "description": "Room page video player integration",
  "priority": "critical",
  "steps": [
    "Add useVideo hook to room page",
    "Integrate VideoPlayerOverlay component",
    "Handle overlay visibility state",
    "Auto-hide search/transcript panels when video opens",
    "Pass video events to overlay component"
  ],
  "testFile": "tests/unit/pages/room-video-integration.test.tsx",
  "dependencies": ["FEAT-801", "FEAT-802", "FEAT-803"],
  "passes": false
},
{
  "id": "FEAT-805",
  "phase": 8,
  "category": "sync",
  "description": "Video playback synchronization across participants",
  "priority": "high",
  "steps": [
    "Implement syncedStartTime protocol for coordinated playback",
    "Add periodic sync heartbeats every 5 seconds",
    "Handle network latency compensation",
    "Implement late-joiner catch-up with seek",
    "Add drift detection and correction"
  ],
  "testFile": "tests/unit/sync/video-sync.test.ts",
  "dependencies": ["FEAT-804"],
  "passes": false
},
{
  "id": "FEAT-806",
  "phase": 8,
  "category": "ai",
  "description": "Voice-activated video playback controls (stretch goal)",
  "priority": "medium",
  "steps": [
    "Extend playVideo function with action parameter",
    "Add 'pause video', 'resume video' voice commands",
    "Add 'next video', 'previous video' voice commands",
    "Add 'stop video', 'close video' voice commands",
    "Update AI instructions for video control keywords"
  ],
  "testFile": "tests/unit/ai/video-controls.test.ts",
  "dependencies": ["FEAT-805"],
  "passes": false
}
```

## Implementation Order

1. **FEAT-800**: Types and interfaces (foundation)
2. **FEAT-803**: Server-side state and handlers (enables testing)
3. **FEAT-801**: useVideo hook (client state management)
4. **FEAT-802**: VideoPlayerOverlay component (UI)
5. **FEAT-804**: Room page integration (wire everything together)
6. **FEAT-805**: Synchronization protocol (polish)
7. **FEAT-806**: Voice controls stretch goal (enhancement)

## Testing Strategy

- Unit tests for type utilities (video ID extraction)
- Unit tests for useVideo hook state transitions
- Component tests for VideoPlayerOverlay
- Integration tests for server event handlers
- E2E tests for full voice-to-video flow

## Dependencies

- YouTube IFrame Player API (loaded via script tag)
- Existing search results (SerperVideoResult)
- Socket.io for real-time sync
- OpenAI function calling for voice commands
