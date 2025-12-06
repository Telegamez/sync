# SwenSync Development Progress

> **Long-Horizon Engineering Protocol**
> This file tracks all development progress. Each entry represents a completed feature.

---

## Current Status

| Phase | Status | Features | Passed |
|-------|--------|----------|--------|
| Phase 1: Foundation | Complete | 5/5 | 100% |
| Phase 2: Room Infrastructure | **Complete** | 23/23 | 100% |
| Phase 3: Multi-Peer Audio | **Complete** | 13/13 | 100% |
| Phase 4: Shared AI Session | **Complete** | 9/9 | 100% |
| Phase 5: Production Polish | In Progress | 3/11 | 27% |

**Phase 5 In Progress!** Next Feature: `FEAT-403` - Room permissions - Owner and participant roles

---

## Phase 1: Foundation (Complete)

### Initial Project Setup
**Date:** 2024-12-04
**Commit:** `90f0c4e`

Established the SwenSync project with single-peer voice AI capabilities:

- Next.js 14 with App Router and TypeScript
- TailwindCSS styling with dark mode
- WebRTC connection to OpenAI Realtime API
- Full-screen voice interface (SwensyncOverlay)
- Audio wave visualization (multiple modes)
- Session timer with auto-disconnect
- Turn-by-turn latency tracking
- Client-side Silero VAD for faster turn detection
- Docker containerization with health checks
- Nginx configuration for production

**Key Files Created:**
- `src/hooks/useSwensyncRealtime.ts` (923 lines)
- `src/components/swensync/*` (6 components)
- `src/types/swensync.ts`
- `src/app/api/swensync-realtime-token/route.ts`
- `src/app/api/health/route.ts`

### Branding Update
**Date:** 2024-12-05
**Commit:** `defda4a`

Rebranded to "AI Collaboration Engine" with synchronized intelligence messaging:

- Updated AI personality and system instructions
- Emphasized synchronized intelligence value proposition
- Prepared messaging for multi-peer future

---

## Phase 2: Room Infrastructure (In Progress)

### FEAT-100: Define Room and Peer TypeScript types
**Date:** 2024-12-05
**Test:** `tests/unit/types/room.test.ts`

Created comprehensive TypeScript type definitions for multi-peer room functionality:

**Files Created:**
- `src/types/room.ts` - Room, RoomSummary, CreateRoomRequest, JoinRoomResponse, etc.
- `src/types/peer.ts` - Peer, PeerSummary, PeerRole, PeerConnectionState, etc.
- `src/types/signaling.ts` - All signaling event types and payloads
- `src/types/index.ts` - Central type exports

**Test Results:**
✅ 14 tests passing

---

### FEAT-150: Voice mode and turn management types
**Date:** 2024-12-05
**Test:** `tests/unit/types/voice-mode.test.ts`

Created types for PTT and turn management to prevent AI interruption chaos:

**Files Created:**
- `src/types/voice-mode.ts` - VoiceMode, AIResponseState, TurnRequest, RoomVoiceSettings, etc.

**Key Types:**
- `VoiceMode`: 'open' | 'pushToTalk' | 'wakeWord' | 'designatedSpeaker'
- `AIResponseState`: 'idle' | 'listening' | 'processing' | 'speaking' | 'locked'
- `TurnRequest`: Queue management for AI requests
- `DEFAULT_VOICE_SETTINGS`: Sensible defaults (PTT mode, locking enabled)

**Test Results:**
✅ Covered by room.test.ts (types imported and validated)

---

### FEAT-101: Room CRUD API - Create Room endpoint
**Date:** 2024-12-05
**Test:** `tests/unit/api/rooms/create.test.ts`

Implemented room creation API with in-memory storage:

**Files Created:**
- `src/server/store/rooms.ts` - In-memory room store with CRUD operations
- `src/app/api/rooms/route.ts` - POST endpoint for room creation

**Key Features:**
- `createRoom()` - Creates room with unique nanoid, defaults for voice settings
- `getRoom()` - Retrieves room by ID
- `generateRoomId()` - Generates unique 10-character room IDs
- Request validation for name, maxParticipants, aiPersonality
- Voice settings merged with DEFAULT_VOICE_SETTINGS

**Test Results:**
✅ 19 tests passing

---

### FEAT-102: Room CRUD API - List Rooms endpoint
**Date:** 2024-12-05
**Test:** `tests/unit/api/rooms/list.test.ts`

Implemented room listing API with status filtering:

**Key Features:**
- `getAllRooms()` - Returns all rooms
- `getRoomsByStatus()` - Filter by waiting/active/full/closed
- `getRoomSummaries()` - Privacy-safe summaries for list views
- `addParticipant()` - Automatically updates room status (waiting→active→full)
- `updateRoomStatus()` - Manual status updates with timestamp

**Test Results:**
✅ 19 tests passing

---

### FEAT-103: Room CRUD API - Get Room by ID endpoint
**Date:** 2024-12-05
**Test:** `tests/unit/api/rooms/get.test.ts`

Implemented room retrieval and deletion endpoints:

**Files Created:**
- `src/app/api/rooms/[roomId]/route.ts` - GET and DELETE handlers

**Key Features:**
- `GET /api/rooms/[roomId]` - Returns full room details
- `DELETE /api/rooms/[roomId]?action=close` - Soft close room
- `DELETE /api/rooms/[roomId]?action=delete` - Hard delete room
- `roomExists()` - Check room existence
- `closeRoom()` - Soft close with status update

**Test Results:**
✅ 18 tests passing

---

### FEAT-104, 105, 106: Socket.io Signaling Server
**Date:** 2024-12-05
**Test:** `tests/unit/signaling/server.test.ts`

Implemented real-time signaling server for WebRTC coordination:

**Files Created:**
- `src/server/signaling/index.ts` - Socket.io server with room management
- `src/lib/signaling/client.ts` - Client-side signaling wrapper

**FEAT-104: Socket.io Integration**
- Socket.io server with CORS configuration
- Connection/disconnection handlers
- Peer ID generation on connect

**FEAT-105: Room Join/Leave Events**
- `room:join` event with validation (room exists, not full, not closed)
- `room:leave` event with cleanup
- `peer:joined` / `peer:left` broadcasts
- Automatic cleanup on disconnect
- First joiner becomes room owner

**FEAT-106: WebRTC Signaling Relay**
- `signal:offer` relay to target peer
- `signal:answer` relay to target peer
- `signal:ice` candidate relay
- Presence updates (`presence:update`)

**Test Results:**
✅ 13 tests passing (connection, join, leave, presence)

---

### FEAT-107: Signaling server - Presence and state sync
**Date:** 2024-12-05
**Test:** `tests/unit/signaling/presence.test.ts`

Implemented comprehensive presence tracking and state synchronization:

**Key Features:**
- Presence state tracking (connected, muted, speaking, isAddressingAI)
- `presence:update` event broadcasts to room members
- Full room state on join (existing peers, AI state, room details)
- Heartbeat for stale connection detection with `lastActiveAt` tracking
- Disconnection cleanup with peer removal
- `getRoomPeerSummaries()` for privacy-safe presence data

**Presence Structure:**
```typescript
{
  connectionState: 'connected',
  audio: {
    isMuted: boolean,
    isSpeaking: boolean,
    isAddressingAI: boolean,
    audioLevel: number
  },
  lastActiveAt: Date,
  isIdle: boolean
}
```

**Test Results:**
✅ 12 tests passing (presence tracking, room state, cleanup, heartbeat)

---

### FEAT-108: useRoomConnection hook
**Date:** 2024-12-05
**Test:** `tests/unit/hooks/useRoomConnection.test.ts`

Implemented React hook for Socket.io connection lifecycle management:

**Files Created:**
- `src/hooks/useRoomConnection.ts` - Full connection management hook

**Key Features:**
- `connect()` / `disconnect()` - Connection lifecycle
- `joinRoom()` / `leaveRoom()` - Room membership management
- Automatic reconnection with configurable attempts/delay
- Heartbeat sending for presence maintenance
- Event handler registration for real-time updates
- Error tracking with `ConnectionError` type
- `getClient()` for direct signaling client access

**State Exposed:**
- `connectionState`: 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error'
- `room`, `localPeer`, `peers`, `aiState`: Current room state
- `isInRoom`, `isLoading`, `error`, `reconnectAttempts`

**Test Results:**
✅ 19 tests passing (connection, join/leave, peer events, error handling, cleanup)

---

### FEAT-109: useRoomPeers hook - Peer state management
**Date:** 2024-12-05
**Test:** `tests/unit/hooks/useRoomPeers.test.ts`

Implemented React hook for WebRTC peer connection management in mesh topology:

**Files Created:**
- `src/hooks/useRoomPeers.ts` - Full peer connection management hook

**Key Features:**
- WebRTC mesh topology connections (higher ID initiates)
- Peer connection lifecycle (create, connect, close)
- ICE candidate exchange via signaling
- Offer/answer exchange via signaling
- Remote audio stream handling
- Connection state tracking per peer
- `setLocalStream()` - Add local audio to all connections
- `getPeer()` - Get peer with WebRTC state
- `getAudioStreams()` - Get all remote audio streams
- `reconnectPeer()` - Force reconnection to specific peer

**State Exposed:**
- `peers`: ConnectedPeer[] with webrtcState, hasAudio, audioStream
- `peerCount`, `connectedCount`, `allConnected`
- `localPeerId`

**Test Results:**
✅ 18 tests passing (initial state, peer events, WebRTC connection, signaling, connection state, audio streams, cleanup, reconnection)

---

### FEAT-110: usePresence hook - Real-time presence state
**Date:** 2024-12-06
**Test:** `tests/unit/hooks/usePresence.test.ts`

Implemented React hook for managing real-time presence state in a room:

**Files Created:**
- `src/hooks/usePresence.ts` - Full presence state management hook

**Key Features:**
- Track speaking/muted state per peer
- `updatePresence()` - Update local presence and broadcast to server
- `setMuted()` / `toggleMute()` - Mute control with server sync
- `setSpeaking()` - Speaking state from VAD
- `setAddressingAI()` - PTT state for AI interaction
- `setAudioLevel()` - Audio level from analyzer (clamped 0-1)
- `getPeerPresence()` / `isPeerSpeaking()` / `isPeerMuted()` - Query peer state
- Debounced presence updates to reduce server traffic
- Audio level threshold to filter insignificant changes
- Derived state: `speakingPeers`, `mutedPeers`, `activeSpeaker`, `anyAddressingAI`
- Callbacks: `onLocalPresenceChange`, `onPeerPresenceChange`, `onActiveSpeakerChange`

**State Exposed:**
- `localPresence`: { isMuted, isSpeaking, isAddressingAI, audioLevel }
- `peerPresence`: Map<PeerId, PeerPresenceState>
- `speakingPeers`, `mutedPeers`, `activeSpeaker`, `anyAddressingAI`

**Test Results:**
✅ 37 tests passing (initial state, local updates, peer events, derived state, helpers, callbacks, cleanup, debouncing)

---

### FEAT-111: RoomLobby component - Room list and join interface
**Date:** 2024-12-06
**Test:** `tests/unit/components/RoomLobby.test.tsx`

Implemented React component for browsing and joining available rooms:

**Files Created:**
- `src/components/room/RoomLobby.tsx` - Main lobby component
- `src/components/room/index.ts` - Component exports

**Key Features:**
- Display list of available rooms in responsive grid
- Room cards with name, description, participant count, status badge
- Search by name and description (client-side filtering)
- Status filter dropdown (All/Waiting/Active/Full)
- Manual refresh button with loading indicator
- Auto-refresh at configurable interval
- Create Room button with callback
- Join button disabled for full/closed rooms
- Empty state with prompt to create room
- Error state with retry functionality
- Loading state with spinner
- Footer showing room count

**Props:**
- `onJoinRoom(roomId)` - Callback when joining
- `onCreateRoom()` - Callback to create room
- `fetchRooms(status?)` - Custom fetch function
- `refreshInterval` - Auto-refresh interval (default 30s)
- `showCreateButton` - Toggle create button visibility

**Test Results:**
✅ 32 tests passing (initial render, room display, search, filter, join, create, refresh, error handling, empty state)

---

### FEAT-112: RoomCard component - Room preview card
**Date:** 2024-12-06
**Test:** `tests/unit/components/RoomCard.test.tsx`

Implemented React component for displaying a single room preview card:

**Files Created:**
- `src/components/room/RoomCard.tsx` - Room card component

**Key Features:**
- Display room name and description (with line clamp)
- Status badge with color coding (waiting/active/full/closed)
- AI personality badge with color coding
- Participant avatars (up to 4 with initials fallback)
- Overflow indicator for 5+ participants (+N)
- Participant count (X/max) display
- Relative time formatting (Just now, Xm ago, Xh ago, Xd ago)
- Join button with loading state and spinner
- Disabled states for full/closed rooms
- Accessible button labels

**Props:**
- `room` - RoomSummary data
- `onJoin(roomId)` - Callback when joining (supports async)
- `participantAvatars` - Array of participant avatar data
- `showAIPersonality` - Toggle AI badge visibility
- `className` - Custom styling

**Test Results:**
✅ 42 tests passing (room display, AI personality, avatars, join button, loading state, relative time, accessibility)

---

### FEAT-113: CreateRoomForm component - Room creation form
**Date:** 2024-12-06
**Test:** `tests/unit/components/CreateRoomForm.test.tsx`

Implemented React component for creating a new room with validation:

**Files Created:**
- `src/components/room/CreateRoomForm.tsx` - Room creation form component

**Key Features:**
- Room name input with character counter (3-50 chars)
- Optional description textarea with character counter (max 500 chars)
- Max participants slider (2-10) with visual indicator
- AI personality dropdown (professional/casual/creative/technical)
- Voice mode toggle (Open Mic/Push-to-Talk)
- Form validation with real-time error display
- Validation triggers on blur and submit
- Submit button disabled when form is invalid
- Loading state with spinner during creation
- Cancel button for aborting creation
- Error message display for API errors
- Success callback with form data

**Props:**
- `onSubmit(data)` - Callback with CreateRoomRequest data (supports async)
- `onCancel()` - Callback when cancel button clicked
- `isLoading` - External loading state control
- `error` - External error message to display
- `defaultValues` - Pre-populate form fields

**Test Results:**
✅ 41 tests passing (initial render, validation, form submission, loading state, cancel, AI personality, voice mode, error handling)

---

### FEAT-114: ParticipantList component - Active participants display
**Date:** 2024-12-06
**Test:** `tests/unit/components/ParticipantList.test.tsx`

Implemented React component for displaying room participants with presence indicators:

**Files Created:**
- `src/components/room/ParticipantList.tsx` - Participant list component

**Key Features:**
- Display all room participants with avatars (initials fallback)
- Speaking indicator with audio level visualization (pulsing ring)
- Muted indicator icon overlay
- Active speaker highlighting (green ring)
- PTT (addressing AI) indicator
- Role badges (Host, Mod) with color coding
- Connection status indicator (connecting, reconnecting, failed)
- Layout modes: vertical, horizontal, grid
- Sorting: local first, then by role, then alphabetically
- Max visible limit with overflow indicator (+N more)
- Click handler for participant selection
- Accessible aria-labels with state descriptions

**Props:**
- `participants` - Array of ParticipantInfo
- `activeSpeakerId` - Highlighted active speaker
- `localPeerId` - For "(You)" label
- `layout` - 'vertical' | 'horizontal' | 'grid'
- `maxVisible` - Limit visible participants
- `showConnectionStatus` / `showRoleBadge` - Toggle indicators
- `onParticipantClick` - Click callback

**Test Results:**
✅ 48 tests passing (empty state, display, indicators, layout, sorting, accessibility, overflow)

---

### FEAT-115: ParticipantAvatar component - Peer avatar with status
**Date:** 2024-12-06
**Test:** `tests/unit/components/ParticipantAvatar.test.tsx`

Implemented standalone avatar component with comprehensive status indicators:

**Files Created:**
- `src/components/room/ParticipantAvatar.tsx` - Avatar component

**Key Features:**
- Initials generation from display name (first + last initial)
- Image avatar support with fallback to initials
- Consistent color assignment based on name hash
- Size variants: xs, sm, md, lg, xl
- Speaking ring animation with audio level intensity
- Muted indicator icon (bottom-right)
- PTT/Addressing AI indicator (top-left, purple)
- Connection status indicator (top-right)
- Active speaker highlight ring
- Local user indicator (blue dot)
- Click handler support with focus/hover states
- Comprehensive accessible aria-labels

**Props:**
- `displayName` - For initials and color
- `avatarUrl` - Optional image
- `size` - 'xs' | 'sm' | 'md' | 'lg' | 'xl'
- `isSpeaking` / `audioLevel` - Speaking animation
- `isMuted` / `isAddressingAI` - Status indicators
- `connectionState` / `showConnectionStatus` - Connection state
- `isActiveSpeaker` / `isLocal` - Highlight indicators
- `onClick` - Click handler

**Test Results:**
✅ 59 tests passing (initials, image, sizes, speaking, muted, PTT, connection, active speaker, local, click, accessibility, precedence)

---

### FEAT-116: RoomControls component - Mute/Leave controls
**Date:** 2024-12-06
**Test:** `tests/unit/components/RoomControls.test.tsx`

Implemented control bar component for room actions with keyboard accessibility:

**Files Created:**
- `src/components/room/RoomControls.tsx` - Room controls component

**Key Features:**
- Mute/Unmute toggle with microphone icons
- Leave room button with loading state
- Optional PTT (Push-to-Talk) button for AI addressing
- Optional settings button
- Keyboard shortcuts (M for mute, Space/Enter for PTT)
- Touch support for mobile PTT
- Size variants: sm, md, lg
- Layout modes: horizontal, vertical
- Full keyboard navigation (Tab through buttons)
- aria-pressed state for PTT toggle
- Loading spinner during leave operation

**Props:**
- `isMuted` / `onMuteToggle` - Mute state and handler
- `onLeaveRoom` / `isLeaving` - Leave with loading state
- `showPTT` / `onPTTStart` / `onPTTEnd` - PTT controls
- `showSettings` / `onSettingsClick` - Settings button
- `isAddressingAI` - External PTT state
- `layout` / `size` - Visual configuration

**Test Results:**
✅ 41 tests passing (mute, leave, settings, PTT, layout, sizes, accessibility, disabled states)

---

### FEAT-117: Room lobby page - /rooms
**Date:** 2024-12-06
**Test:** `tests/unit/pages/rooms.test.tsx`

Implemented the main room lobby page for browsing and joining rooms:

**Files Created:**
- `src/app/rooms/page.tsx` - Room lobby page

**Key Features:**
- Integrates RoomLobby component for room list display
- Header with back navigation and title
- Page description for user guidance
- Joining overlay with loading spinner
- Navigation to create room page (/rooms/create)
- Navigation to room experience page (/rooms/[roomId])
- Responsive layout with max-width container
- Footer with branding

**Navigation Flow:**
- Back to Home: Link to /
- Create Room: Button navigates to /rooms/create
- Join Room: Button navigates to /rooms/[roomId]
- Joining state shows overlay during navigation

**Test Results:**
✅ 18 tests passing (page structure, room list, create navigation, join navigation, error handling, empty state, search/filter, refresh, responsive)

---

### FEAT-118: Create room page - /rooms/create
**Date:** 2024-12-06
**Test:** `tests/unit/pages/create-room.test.tsx`

Implemented the create room page for creating new collaboration rooms:

**Files Created:**
- `src/app/rooms/create/page.tsx` - Create room page

**Key Features:**
- Integrates CreateRoomForm component with cancel button
- Header with back navigation and title
- Page description for user guidance
- Form submission to POST /api/rooms
- Error display for API errors
- Navigation to new room on success (/rooms/[roomId])
- Navigation back to lobby on cancel (/rooms)
- Responsive layout with centered max-width container
- Footer with branding
- Help text explaining post-creation redirect

**Navigation Flow:**
- Back to Rooms: Link to /rooms
- Cancel: Button navigates to /rooms
- Create Success: Navigates to /rooms/[newRoomId]
- Error: Displays error message, allows retry

**Test Results:**
✅ 20 tests passing (page structure, form integration, submission, error handling, cancel navigation, validation, responsive)

---

### FEAT-119: Room experience page - /rooms/[roomId]
**Date:** 2024-12-06
**Test:** `tests/unit/pages/room-experience.test.tsx`

Implemented the main room collaboration experience page:

**Files Created:**
- `src/app/rooms/[roomId]/page.tsx` - Room experience page

**Key Features:**
- Fetches room details from API on mount
- Displays room name, description, participant count
- Error states: not found (404), room full, room closed, connection error
- Loading states: loading room, joining room, connected
- ParticipantList integration with local user display
- RoomControls integration with mute, leave, PTT buttons
- Share button to copy room link to clipboard
- Leave button in header and controls
- AI addressing status indicator
- Responsive layout with sticky header and footer controls

**States Handled:**
- Loading: Spinner with "Loading room..."
- Joining: Spinner with "Joining room..."
- Connected: Full room experience UI
- Not Found: Error page with link to lobby
- Full: Error page indicating room is full
- Closed: Error page indicating room was closed
- Error: Error page with connection failure message

**Test Results:**
✅ 31 tests passing (loading states, error states, connected room, controls, leave, share, participants, AI status, responsive)

---

### FEAT-120: Multi-peer WebRTC mesh - Peer connection management
**Date:** 2024-12-06
**Test:** `tests/unit/webrtc/mesh.test.ts`

Verified and tested the WebRTC mesh topology implementation in useRoomPeers hook:

**Implementation Already Complete in:**
- `src/hooks/useRoomPeers.ts` - Full mesh WebRTC connection management

**Key Features:**
- Creates RTCPeerConnection for each peer in room
- Full mesh topology (each peer connects to every other peer)
- Higher ID initiates pattern to avoid race conditions
- Offer/answer exchange via signaling server
- ICE candidate exchange with queuing for early candidates
- Per-peer connection state tracking (new, connecting, connected, failed, closed)
- Audio stream management per peer
- Reconnection support via reconnectPeer()
- Cleanup on peer leave and component unmount
- setLocalStream to add local audio to all connections

**Mesh Topology:**
- Local peer initiates connections to all peers with higher IDs
- Receives connections from all peers with lower IDs
- Each peer maintains N-1 connections (where N = room size)

**Test Results:**
✅ 27 tests passing (full mesh pattern, offer/answer, ICE exchange, connection states, peer lifecycle, audio tracks, reconnection, local stream, multiple peers)

---

### FEAT-121: Multi-peer WebRTC mesh - Audio track management
**Date:** 2024-12-06
**Test:** `tests/unit/webrtc/audio-tracks.test.ts`

Implemented React hook for managing audio playback for all peers in a room:

**Files Created:**
- `src/hooks/useRoomAudio.ts` - Audio track management hook

**Key Features:**
- Creates HTMLAudioElement for each peer's audio stream
- Auto-play support with fallback handling
- Per-peer mute/unmute control
- Per-peer volume control (0-1 range)
- Master volume control affecting all peers
- Mute all / unmute all functionality
- Playing state tracking per peer
- Audio element access via getAudioElement()
- Cleanup on peer disconnect and component unmount
- Callbacks for audio start/end/error events
- New peers inherit mute-all state

**API:**
- `addPeerStream(peerId, stream)` - Add audio stream
- `removePeerStream(peerId)` - Remove audio stream
- `mutePeer(peerId)` / `unmutePeer(peerId)` - Individual mute
- `togglePeerMute(peerId)` - Toggle mute
- `setPeerVolume(peerId, volume)` - Set peer volume
- `muteAll()` / `unmuteAll()` - Global mute
- `setMasterVolume(volume)` - Master volume
- `getAudioElement(peerId)` - Get audio element
- `isPeerPlaying(peerId)` - Check playing state

**Test Results:**
✅ 38 tests passing (initial state, add/remove streams, muting, volume control, audio element access, playing state, callbacks, cleanup, multiple operations)

---

## Phase 2: Room Infrastructure (Complete)

All 23 features in Phase 2 have been implemented and tested. The room infrastructure now includes:
- Room and Peer TypeScript types
- Room CRUD API endpoints
- Socket.io signaling server with room management
- Presence and state synchronization
- React hooks for room connections and peer management
- UI components for room lobby, cards, forms, participants, avatars, and controls
- Pages for room lobby, room creation, and room experience
- WebRTC mesh topology with full offer/answer/ICE exchange
- Audio track management with playback, muting, and volume control

---

### Infrastructure Setup
**Date:** 2024-12-05

Set up testing infrastructure:
- Installed Vitest + happy-dom + @testing-library
- Created `vitest.config.ts`
- Added test scripts to package.json
- Created `.claude/settings.json` for permissions

### Upcoming Features:
1. `FEAT-100` - TypeScript types for Room and Peer
2. `FEAT-101` - Room CRUD API - Create endpoint
3. `FEAT-102` - Room CRUD API - List endpoint
4. `FEAT-103` - Room CRUD API - Get by ID endpoint
5. `FEAT-104` - Signaling server with Socket.io
6. `FEAT-105` - Room join/leave events
7. `FEAT-106` - WebRTC signaling relay
8. `FEAT-107` - Presence and state sync
9. `FEAT-108` - useRoomConnection hook
10. `FEAT-109` - useRoomPeers hook
11. `FEAT-110` - usePresence hook
12. `FEAT-111` - RoomLobby component
13. `FEAT-112` - RoomCard component
14. `FEAT-113` - CreateRoomForm component
15. `FEAT-114` - ParticipantList component
16. `FEAT-115` - ParticipantAvatar component
17. `FEAT-116` - RoomControls component
18. `FEAT-117` - Room lobby page (/rooms)
19. `FEAT-118` - Create room page (/rooms/create)
20. `FEAT-119` - Room experience page (/rooms/[roomId])
21. `FEAT-120` - Multi-peer WebRTC mesh connections
22. `FEAT-121` - Multi-peer audio track management

---

## Phase 3: Multi-Peer Audio (In Progress)

### FEAT-200: Audio mixer - Multi-stream mixing foundation
**Date:** 2024-12-06
**Test:** `tests/unit/audio/mixer.test.ts`

Implemented the core audio mixer class for combining multiple peer audio streams:

**Files Created:**
- `src/lib/audio/mixer.ts` - AudioMixer class using Web Audio API

**Key Features:**
- AudioContext initialization with configurable sample rate
- GainNode per audio source for individual volume control
- MediaStreamAudioDestinationNode for mixed output stream
- `addStream(id, stream)` / `removeStream(id)` - Manage audio sources
- `getMixedStream()` - Get combined output for AI input
- `setVolume(id, volume)` / `getVolume(id)` - Per-source volume (0-1)
- `mute(id)` / `unmute(id)` - Per-source muting with volume restoration
- `setMasterVolume(volume)` - Master volume control
- `muteMaster()` / `unmuteMaster()` - Master mute control
- `suspend()` / `resume()` - AudioContext state management
- `dispose()` - Full cleanup with context close
- `getState()` - Current mixer state (initialized, running, sourceCount, etc.)
- `createAudioMixer()` - Factory function

**Architecture:**
```
[Peer Stream 1] → [GainNode 1] ↘
[Peer Stream 2] → [GainNode 2] → [Master GainNode] → [Destination] → [Mixed Output]
[Peer Stream N] → [GainNode N] ↗
```

**Test Results:**
✅ 47 tests passing (initialization, adding/removing streams, volume control, muting, master volume, state, suspend/resume, dispose, factory)

---

### FEAT-201: Audio mixer - Per-peer volume control
**Date:** 2024-12-06
**Test:** `tests/unit/audio/mixer-volume.test.ts`

Extended the audio mixer with advanced per-peer volume control and normalization:

**Key Features:**
- Per-source GainNode control (already in FEAT-200)
- `setVolume(peerId, level)` with normalization support
- `mute(id)` / `unmute(id)` with volume restoration
- **Volume Normalization Modes:**
  - `none`: No normalization (default)
  - `constant`: Constant power normalization (1/√n scaling)
  - `auto`: Dynamic normalization to target output level
- `getAllVolumes()` - Get volume info for all sources (UI)
- `getSourceVolumeInfo(id)` - Get single source volume info
- `setNormalizationMode(mode)` / `getNormalizationMode()`
- `setTargetOutputLevel(level)` / `getTargetOutputLevel()`
- `getNormalizationFactor()` - Current normalization multiplier
- `SourceVolumeInfo` interface with effectiveVolume for UI

**Normalization Details:**
- Constant mode: `1/√n` - maintains perceived loudness as peers join
- Auto mode: scales to targetOutputLevel / totalVolume
- Both modes respect `minSourceGain` floor (default 0.2)
- Normalization applied automatically on add/remove/volume change

**Test Results:**
✅ 29 tests passing (per-source volume, volume info for UI, normalization modes, mode switching, volume with normalization)

---

### FEAT-202: useAudioMixer hook - React integration
**Date:** 2024-12-06
**Test:** `tests/unit/hooks/useAudioMixer.test.ts`

Implemented React hook for managing audio mixing in a room:

**Files Created:**
- `src/hooks/useAudioMixer.ts` - Audio mixer React hook

**Key Features:**
- Auto-initialize on mount (configurable)
- `addStream(peerId, stream)` / `removeStream(peerId)` - Manage sources
- `setVolume()` / `mute()` / `unmute()` - Per-peer control
- `setMasterVolume()` / `muteMaster()` / `unmuteMaster()` - Master control
- `setNormalizationMode(mode)` - Dynamic normalization switching
- `getMixedStream()` - Get combined output for AI
- `suspend()` / `resume()` - AudioContext lifecycle
- `dispose()` - Full cleanup
- `getSourceVolumeInfo()` / `getSourceIds()` - Query methods
- Callbacks: `onInitialized`, `onStateChange`, `onSourceAdded`, `onSourceRemoved`

**State Exposed:**
- `isInitialized`, `isRunning`, `sourceCount`
- `masterVolume`, `isMasterMuted`
- `normalizationMode`, `normalizationFactor`
- `volumes` - Array of SourceVolumeInfo for all sources

**Test Results:**
✅ 33 tests passing (initialization, adding/removing streams, volume control, master volume, normalization, mixed stream, suspend/resume, dispose, cleanup, callbacks)

---

### FEAT-203: Per-peer audio analysis - Speaking detection
**Date:** 2024-12-06
**Test:** `tests/unit/audio/speaking-detection.test.ts`

Implemented speaking detection using AnalyserNode for per-peer audio analysis:

**Files Created:**
- `src/lib/audio/speaking-detector.ts` - SpeakingDetector class

**Key Features:**
- AnalyserNode per peer for audio level analysis
- RMS-based volume level detection (0-1 normalized)
- Configurable speaking threshold with hysteresis
- Silence debounce to prevent rapid state flickering
- `addStream()` / `removeStream()` - Manage monitored sources
- `isSpeaking(peerId)` / `getAudioLevel(peerId)` - Query state
- `getSpeakingPeers()` - Get all currently speaking peers
- `getState()` / `getAllStates()` - Full state info
- `setSpeakingThreshold()` / `setSilenceThreshold()` - Runtime config
- `pause()` / `resume()` - Control analysis loop
- Callbacks: `onSpeakingStart`, `onSpeakingEnd`, `onAudioLevelChange`, `onSpeakingStateChange`

**Detection Algorithm:**
1. Calculate RMS from FFT frequency data
2. Speaking starts when level ≥ speakingThreshold
3. Speaking continues while level ≥ silenceThreshold (hysteresis)
4. Speaking ends after silenceDebounceMs of silence

**Test Results:**
✅ 45 tests passing (initialization, adding/removing streams, speaking detection, audio level, speaking state, callbacks, thresholds, pause/resume, dispose)

---

### FEAT-204: Per-peer audio visualization
**Date:** 2024-12-06
**Test:** `tests/unit/audio/peer-visualization.test.ts`

Implemented per-peer audio visualization using AnalyserNode for frequency and time domain data:

**Files Created:**
- `src/lib/audio/peer-visualizer.ts` - PeerVisualizer class

**Key Features:**
- AnalyserNode per peer for visualization data
- Frequency data (getByteFrequencyData) for spectrum visualization
- Time domain data (getByteTimeDomainData) for waveform visualization
- RMS-based audio level calculation (0-1 normalized)
- `addStream()` / `removeStream()` - Manage visualized sources
- `getVisualizationData(peerId)` - Get data for single peer
- `getAllVisualizationData()` - Get data for all peers
- `getAudioLevel()` / `getFrequencyData()` / `getTimeDomainData()` - Query methods
- `setFftSize()` / `setSmoothingTimeConstant()` - Runtime config
- `pause()` / `resume()` - Control visualization loop
- `isLocal` flag to distinguish local vs remote streams
- Animation frame mode for smooth updates (default)
- Interval mode for lower resource usage
- Callbacks: `onVisualizationUpdate`, `onPeerUpdate`

**Visualization Data Structure:**
```typescript
{
  peerId: PeerId;
  audioLevel: number;       // 0-1 normalized
  frequencyData: Uint8Array; // Frequency spectrum
  timeDomainData: Uint8Array; // Time domain waveform
  isLocal: boolean;
}
```

**Test Results:**
✅ 45 tests passing (initialization, adding/removing streams, visualization data, audio level, frequency/time domain data, callbacks, configuration, pause/resume, dispose, local vs remote)

---

### FEAT-205: SpeakingIndicator component - Active speaker display
**Date:** 2024-12-06
**Test:** `tests/unit/components/SpeakingIndicator.test.tsx`

Implemented a React component for displaying active speaker(s) with smooth transitions:

**Files Created:**
- `src/components/room/SpeakingIndicator.tsx` - Active speaker display component

**Key Features:**
- Display current active speaker(s) with avatars
- Three display modes: compact (default), detailed, minimal
- Smooth animations for speaker enter/leave transitions
- Multi-speaker state with overflow indicator (+N)
- Audio level waveform visualization
- Primary speaker detection (highest audio level)
- Click handlers for speaker selection
- Keyboard navigation support in detailed mode
- Callbacks: `onSpeakerClick`, `onSpeakersChange`
- Accessible with aria-live for screen readers

**Display Modes:**
- `compact`: Avatar(s) + name + waveform
- `detailed`: Full speaker cards with individual waveforms
- `minimal`: Text only (e.g., "Alice is speaking")

**Props:**
- `speakers` - Array of SpeakerInfo (id, displayName, audioLevel, isLocal)
- `mode` - 'compact' | 'detailed' | 'minimal'
- `maxDisplayed` - Max speakers before overflow (default: 3)
- `showAudioLevel` - Toggle waveform visualization
- `idleText` - Custom text when no one is speaking
- `animationDuration` - Transition duration in ms

**Test Results:**
✅ 42 tests passing (idle state, single/multiple speakers, display modes, transitions, click handlers, callbacks, audio level, edge cases)

---

### FEAT-206: Audio synchronization - Playback timing
**Date:** 2024-12-06
**Test:** `tests/unit/audio/sync.test.ts`

Implemented audio synchronization class for managing playback timing across peers:

**Files Created:**
- `src/lib/audio/sync.ts` - AudioSync class for playback timing

**Key Features:**
- Jitter buffer implementation with adaptive sizing
- Synchronized playback start time calculation
- Sync status tracking per peer (synced, ahead, behind, unknown)
- Sync accuracy measurement with statistics (average offset, max offset, std dev, synced percentage)
- Manual and automatic resync mechanisms
- Server time offset support for accurate timing
- Buffer underrun/overrun detection with recovery
- Periodic measurement mode for continuous monitoring
- Callbacks: `onSyncStatusChange`, `onResyncNeeded`, `onSyncAccuracy`, `onBufferUnderrun`, `onBufferOverrun`

**Jitter Buffer:**
- Adaptive sizing based on network conditions
- Min/max buffer limits (50-300ms default)
- Jitter calculation from packet delay variance
- Buffer target adjustment on underrun/overrun

**API:**
- `addPeer()` / `removePeer()` - Manage tracked peers
- `reportPeerTiming(peerId, timing)` - Report timing info
- `calculateSyncedStartTime()` - Get synchronized start time
- `startPeerPlayback()` / `stopPeerPlayback()` - Control playback
- `measureSyncAccuracy()` - Measure current sync accuracy
- `requestResync()` / `requestResyncAll()` - Trigger resync
- `startMeasuring()` / `stopMeasuring()` - Periodic measurement
- `setServerTimeOffset()` / `setSyncThreshold()` - Configuration

**Test Results:**
✅ 52 tests passing (initialization, peer management, timing reports, sync status, jitter buffer, synchronized start, playback control, buffer events, sync accuracy, periodic measurement, resync, configuration, dispose)

---

### FEAT-151: Push-to-Talk (PTT) implementation
**Date:** 2024-12-06
**Test:** `tests/unit/audio/push-to-talk.test.ts`

Implemented the usePushToTalk hook for PTT functionality with keyboard, mouse, and touch support:

**Files Created:**
- `src/hooks/usePushToTalk.ts` - Push-to-Talk React hook

**Key Features:**
- Keyboard activation (Space key by default, configurable)
- Mouse hold-to-talk support
- Touch hold-to-talk support for mobile
- Minimum hold time option (prevents accidental taps)
- Maximum duration auto-release
- Haptic feedback on mobile devices
- AI state blocking (prevents PTT when AI is speaking/locked)
- Voice mode support (pushToTalk, designatedSpeaker, open)
- Duration tracking with callbacks
- Button props helper for easy integration
- Global keyboard event listeners

**API:**
- `startPTT()` / `endPTT()` / `togglePTT()` - Programmatic control
- `isActive` / `canActivate` / `blockReason` - State
- `activeDuration` - How long PTT has been held
- `buttonProps` - Props to spread on PTT button
- Callbacks: `onPTTStart`, `onPTTEnd`, `onPTTBlocked`, `onPTTStateChange`

**Test Results:**
✅ 52 tests passing (initialization, programmatic activation, AI state blocking, voice mode blocking, min/max duration, duration tracking, haptic feedback, button props, mouse/touch/keyboard events, callbacks, state updates, cleanup)

---

### FEAT-152: AI response locking mechanism
**Date:** 2024-12-06
**Test:** `tests/unit/signaling/ai-locking.test.ts`

Implemented AI response locking manager for preventing AI interruption chaos:

**Files Created:**
- `src/server/signaling/ai-locking.ts` - AI locking manager class

**Key Features:**
- AI state machine (idle, listening, processing, speaking, locked)
- Turn request queue with priority sorting
- Lock timeout as safety mechanism
- Designated speaker support
- Interrupt capability for owners/moderators
- Session health tracking

**State Transitions:**
- `idle` → `listening` → `processing` → `speaking` → `idle`
- `speaking`/`locked` → timeout → `idle` (safety release)
- Any state → `interrupt` → `idle` (force release)

**Queue Management:**
- Priority-based sorting (higher first)
- FIFO within same priority
- Request expiration timeout
- Max queue size limit
- Auto-process on response complete

**API:**
- `initRoom()` / `removeRoom()` - Room lifecycle
- `requestTurn()` / `cancelRequest()` - Turn management
- `startListening()` / `startProcessing()` / `startSpeaking()` / `finishSpeaking()` - State transitions
- `lock()` / `unlock()` / `interrupt()` - Control
- `canRequestTurn()` / `getQueuePosition()` - Query
- Callbacks: `onStateChange`, `onQueueUpdate`, `onTurnStart`, `onTurnEnd`, `onError`

**Test Results:**
✅ 53 tests passing (initialization, room management, AI state, turn requests, state transitions, locking, interrupt, queue processing, turn eligibility, queue position, error handling, callbacks, dispose)

---

### FEAT-153: useTurnManager hook - Turn-taking coordination
**Date:** 2024-12-06
**Test:** `tests/unit/hooks/useTurnManager.test.ts`

Implemented React hook for client-side turn-taking coordination with AI locking:

**Files Modified/Created:**
- `src/hooks/useTurnManager.ts` - Turn manager hook (existing, enhanced)
- `src/lib/signaling/client.ts` - Added turn management methods

**Key Features:**
- Client-side turn manager state tracking
- `canRequestTurn` based on AI state and voice mode
- `requestTurn()` method respecting locks and queue
- `cancelTurn()` to cancel pending requests
- `interruptAI()` for owner/moderator interrupt
- Queue position tracking and notifications
- PTT state derivation from turn state
- Current speaker tracking
- Session health monitoring
- Socket event subscription for AI state updates
- Callbacks: `onAIStateChange`, `onTurnGranted`, `onTurnEnded`, `onTurnRejected`, `onQueuePositionChange`, `onAIError`

**SignalingClient Methods Added:**
- `requestTurn(roomId, peerId, displayName, priority)` - Request AI turn
- `cancelTurn(roomId, requestId)` - Cancel turn request
- `interruptAI(roomId, peerId, reason)` - Interrupt AI response
- `startPTT(roomId)` / `endPTT(roomId)` - PTT signaling

**State Exposed:**
- `state` - Full TurnManagerState object
- `aiState` - Current AI response state
- `canRequestTurn` - Whether local peer can request turn
- `isMyTurn` - Whether local peer has active turn
- `queuePosition` - Position in queue (0 = not in queue)
- `queueLength` - Current queue size
- `currentSpeakerId` - Peer currently addressing AI
- `isSessionHealthy` - AI session health
- `lastError` - Last error message
- `fullAIState` - Complete RoomAIState object

**Test Results:**
✅ 43 tests passing (initial state, turn eligibility, queue tracking, turn requests, cancel, interrupt, PTT state, callbacks, AI events, session health, speaker tracking, queue length, factory function)

---

### Planned Features:
1. `FEAT-200` - Audio mixer foundation ✅
2. `FEAT-201` - Per-peer volume control ✅
3. `FEAT-202` - useAudioMixer hook ✅
4. `FEAT-203` - Speaking detection per peer ✅
5. `FEAT-204` - Per-peer audio visualization ✅
6. `FEAT-205` - SpeakingIndicator component ✅
7. `FEAT-206` - Audio synchronization ✅
8. `FEAT-151` - Push-to-Talk (PTT) implementation ✅
9. `FEAT-152` - AI response locking mechanism ✅
10. `FEAT-153` - useTurnManager hook ✅
11. `FEAT-154` - PTTButton component ✅
12. `FEAT-155` - AIStateIndicator component ✅
13. `FEAT-156` - VoiceModeSettings component ✅

---

### FEAT-154: PTTButton component - Push-to-talk interface
**Date:** 2024-12-06
**Test:** `tests/unit/components/PTTButton.test.tsx`

Implemented Push-to-Talk button component with hold-to-talk interaction:

**Files Created:**
- `src/components/room/PTTButton.tsx` - Main PTTButton component with variants
- `src/components/room/index.ts` - Updated exports

**Key Features:**
- Hold-to-talk button with visual feedback
- Four size variants: sm, md, lg, xl
- Three style variants: default, primary, minimal
- Visual states: idle, active, disabled
- Duration display while active (optional)
- Block reason tooltip when disabled
- Icons for each state (microphone, speaking wave, lock)
- Keyboard accessibility (Space key activation)
- Touch support with touch-none class
- Mobile-friendly with haptic feedback option
- Integration with usePushToTalk hook
- Data attributes for styling (data-state, data-ptt-active)

**Convenience Components:**
- `InlinePTTButton` - Small minimal button for inline use
- `MainPTTButton` - Large primary button for main room interface

**Props:**
- `aiState` - Current AI response state
- `isDesignatedSpeaker` / `voiceMode` - Voice mode integration
- `size` / `variant` - Visual configuration
- `showDuration` / `showBlockReason` - Feature toggles
- `enableKeyboard` / `enableHapticFeedback` - Input options
- `minHoldTimeMs` / `maxDurationMs` - Timing configuration
- Callbacks: `onPTTStart`, `onPTTEnd`, `onPTTBlocked`, `onPTTStateChange`

**Test Results:**
✅ 61 tests passing (rendering, sizes, variants, disabled states, mouse/touch/keyboard interaction, duration display, minimum/maximum duration, callbacks, visual states, tooltips, accessibility, voice mode integration, InlinePTTButton, MainPTTButton)

---

### FEAT-155: AIStateIndicator component - Response state display
**Date:** 2024-12-06
**Test:** `tests/unit/components/AIStateIndicator.test.tsx`

Implemented AI state indicator component for displaying current AI response state:

**Files Created:**
- `src/components/room/AIStateIndicator.tsx` - Main component with variants
- `src/components/room/index.ts` - Updated exports

**Key Features:**
- Display all AI states: idle (Ready), listening, processing (Thinking), speaking, locked
- Color-coded states: gray (idle), blue (listening), amber (processing), green (speaking), red (locked)
- Three size variants: sm, md, lg
- Three display modes: compact, minimal, expanded
- Queue position display when waiting (Position X of Y, "You're next")
- Speaker info display (Listening to X, Responding to X, "Listening to you...")
- Animated state transitions (pulse, bounce)
- Icons for each state (circle, microphone, lightbulb, speaker, lock)
- Data attributes for styling (data-state)
- Accessible with role="status" and aria-live="polite"

**Convenience Components:**
- `AIStateBadge` - Small compact badge for headers
- `AIStateDot` - Minimal dot indicator with short label
- `AIStateDisplay` - Large expanded display for main room area

**Props:**
- `state` - Current AIResponseState
- `queuePosition` / `queueLength` - Queue info
- `isCurrentSpeaker` / `currentSpeakerName` - Speaker info
- `size` / `mode` - Visual configuration
- `showQueue` / `showSpeaker` / `animate` - Feature toggles

**Test Results:**
✅ 68 tests passing (initial rendering, state display, size variants, display modes, speaker info, queue info, animations, color coding, custom styling, icons, AIStateBadge, AIStateDot, AIStateDisplay)

---

### FEAT-156: VoiceModeSettings component - Room voice configuration
**Date:** 2024-12-06
**Test:** `tests/unit/components/VoiceModeSettings.test.tsx`

Implemented comprehensive settings panel for room voice mode configuration:

**Files Created:**
- `src/components/room/VoiceModeSettings.tsx` - Main settings panel component
- `src/components/room/index.ts` - Updated exports

**Key Features:**
- Voice mode selection: Open, Push-to-Talk, Designated Speaker
- Mode cards with icons and descriptions
- Designated speaker selector (peer selection chips)
- Lock during AI response toggle
- Enable peer audio toggle
- Allow interrupt toggle
- Advanced queue settings section (optional)
  - Enable/disable queue
  - Max queue size (increment/decrement with min/max bounds)
  - Queue timeout (in seconds)
- Saving indicator with spinner
- Changes pending indicator
- Layout modes: compact (single column) and expanded (3-column grid)
- Read-only mode for non-owners

**Convenience Components:**
- `VoiceModeSettingsCompact` - Compact layout without advanced settings
- `VoiceModeSettingsFull` - Full layout with advanced settings visible

**Props:**
- `settings` - Current RoomVoiceSettings
- `onSettingsChange` - Callback when settings change
- `canEdit` - Whether user can edit (owner/moderator)
- `availablePeers` - List of peers for designated speaker selection
- `showAdvanced` - Whether to show queue settings
- `isSaving` - Whether settings are being saved
- `layout` - compact or expanded

**Test Results:**
✅ 67 tests passing (initial rendering, voice mode selection, designated speakers, lock toggle, peer audio toggle, interrupt toggle, queue settings, number inputs, layout modes, saving state, changes pending, accessibility, custom styling, VoiceModeSettingsCompact, VoiceModeSettingsFull, settings persistence, mode-specific behavior)

---

## Phase 3 Complete!

All 13 Phase 3 features have been implemented and tested:
- Audio infrastructure: FEAT-200 (Audio mixer), FEAT-201 (Volume control), FEAT-202 (useAudioMixer)
- Speaking detection: FEAT-203 (Per-peer detection), FEAT-204 (Visualization), FEAT-205 (SpeakingIndicator)
- Synchronization: FEAT-206 (Audio sync)
- Turn management: FEAT-151 (PTT hook), FEAT-152 (AI locking), FEAT-153 (useTurnManager)
- UI Components: FEAT-154 (PTTButton), FEAT-155 (AIStateIndicator), FEAT-156 (VoiceModeSettings)

**Total Tests in Phase 3:** 475+ tests passing

---

## Phase 4: Shared AI Session (Complete)

### Planned Features:
1. `FEAT-300` - Single OpenAI connection per room ✅
2. `FEAT-301` - Mixed audio input to AI ✅
3. `FEAT-302` - Response broadcasting ✅
4. `FEAT-303` - useSharedAI hook ✅
5. `FEAT-304` - Shared context management ✅
6. `FEAT-305` - AI personality configuration ✅
7. `FEAT-306` - Enhanced SwensyncOverlay for rooms ✅
8. `FEAT-157` - Server-side turn queue processing ✅
9. `FEAT-158` - Interrupt handling for urgent overrides ✅

---

### FEAT-300: AI Orchestrator - Single OpenAI connection per room
**Date:** 2024-12-06
**Test:** `tests/unit/ai/orchestrator.test.ts`

Implemented AI Orchestrator for managing single OpenAI Realtime API connections per room:

**Files Created:**
- `src/server/signaling/ai-orchestrator.ts` - Main AIOrchestrator class

**Key Features:**
- Session lifecycle management (create, destroy, reconnect)
- Turn management integration with AILockingManager
- OpenAI configuration with voice, temperature, turn detection settings
- Health check monitoring with automatic timeout detection
- Token refresh support for long-running sessions
- Reconnection with exponential backoff
- Multiple room support (isolated sessions per room)
- Audio input/output callbacks for real-time streaming
- Transcription handling

**AIOrchestrator Methods:**
- `createSession(roomId, config?)` - Create AI session for a room
- `destroySession(roomId)` - Destroy AI session
- `requestTurn(roomId, peerId, name, priority?)` - Request turn to address AI
- `cancelTurn(roomId, requestId)` - Cancel turn request
- `startListening/startProcessing/startSpeaking/finishSpeaking` - State transitions
- `interrupt(roomId, interruptedBy, reason?)` - Interrupt AI response
- `sendAudioInput(roomId, audioData)` - Send audio to AI
- `handleAudioResponse/handleTranscription` - Process AI responses

**Session States:**
- `disconnected` - Not connected to OpenAI
- `connecting` - Connection in progress
- `connected` - Active connection
- `error` - Connection error
- `reconnecting` - Reconnection attempt in progress

**Test Results:**
✅ 47 tests passing (session creation, destruction, queries, turn management, AI state transitions, audio I/O, configuration, reconnection, health checks, dispose, factory, defaults, multiple rooms, error handling, activity tracking, integration tests)

---

### FEAT-301: Mixed Audio Input - Routing mixed audio to AI
**Date:** 2024-12-06
**Test:** `tests/unit/ai/mixed-input.test.ts`

Implemented mixed audio input manager for routing combined peer audio to the AI Orchestrator:

**Files Created:**
- `src/server/signaling/mixed-audio-input.ts` - MixedAudioInputManager class

**Key Features:**
- Room initialization and peer count tracking
- Audio processing with resampling to target sample rate (24kHz for OpenAI)
- Stereo to mono downmixing
- Audio quality optimization with normalization and noise gate
- VAD (Voice Activity Detection) with energy-based speech detection
- Speech start/end detection with configurable thresholds
- Prefix buffer for capturing audio before speech start (padding)
- Silence duration tracking for speech end detection
- Manual speech control (forceStartSpeech, forceEndSpeech)
- Empty room state handling (skips processing when no peers)
- Audio statistics tracking (energy, speech duration)
- Multiple rooms support (isolated state per room)

**MixedAudioInputManager Methods:**
- `initRoom(roomId)` / `removeRoom(roomId)` - Room lifecycle
- `setPeerCount(roomId, count)` - Track active peers
- `processAudio(roomId, audioData, sampleRate, channels?)` - Process mixed audio
- `getVADState(roomId)` / `isSpeechActive(roomId)` - VAD queries
- `forceStartSpeech(roomId)` / `forceEndSpeech(roomId)` - Manual control
- `getStats(roomId)` - Get processing statistics
- `clearPrefixBuffer(roomId)` - Clear prefix buffer

**Audio Processing Pipeline:**
1. Skip if room is empty (no peers)
2. Convert PCM16 to Int16Array
3. Downmix stereo to mono if needed
4. Resample to target sample rate (linear interpolation)
5. Apply optimization (normalization, noise gate)
6. Run VAD analysis
7. Buffer during silence (prefix padding)
8. Send audio on speech detection

**VAD Algorithm:**
- RMS-based energy calculation
- Speech probability from energy level
- Configurable thresholds (energy, speech probability)
- Hysteresis with separate speaking/silence thresholds
- Silence debounce to prevent rapid state flickering
- Prefix buffer for pre-speech audio capture

**Test Results:**
✅ 45 tests passing (room initialization, peer count tracking, audio processing, VAD detection, manual speech control, prefix buffer, statistics, configuration, factory function, integration scenarios)

---

### FEAT-302: Response Broadcasting - AI audio to all participants
**Date:** 2024-12-06
**Test:** `tests/unit/ai/broadcast.test.ts`

Implemented response broadcast manager for sending AI audio to all room participants:

**Files Created:**
- `src/server/signaling/response-broadcast.ts` - ResponseBroadcastManager class

**Key Features:**
- Room and peer management for broadcast subscriptions
- Response lifecycle (start, addChunk, end, cancel)
- Buffering before broadcast start (configurable buffer size)
- Peer readiness tracking (wait for peers to be ready)
- Max wait timeout to prevent infinite buffering
- Late joiner catch-up (send buffered chunks to new peers)
- Synchronized playback start time calculation
- Broadcast state machine (idle, buffering, broadcasting, completed, cancelled)
- Chunk sequencing for ordering
- Multiple rooms support (isolated state per room)

**ResponseBroadcastManager Methods:**
- `initRoom(roomId)` / `removeRoom(roomId)` - Room lifecycle
- `addPeer(roomId, peerId)` / `removePeer(roomId, peerId)` - Peer management
- `setPeerReady(roomId, peerId)` - Mark peer ready for playback
- `startResponse(roomId, triggerPeerId)` - Start new AI response
- `addChunk(roomId, audioData, durationMs, isLast?)` - Add audio chunk
- `endResponse(roomId)` - End current response
- `cancelResponse(roomId)` - Cancel current response
- `getCurrentResponse(roomId)` - Get response info
- `getBroadcastState(roomId)` / `isBroadcasting(roomId)` - State queries
- `getBufferStatus(roomId)` - Get buffer fill status
- `getSyncedStartTime(roomId)` - Get synchronized start time

**Broadcast Flow:**
1. `startResponse()` - Initialize response, enter buffering state
2. `addChunk()` - Add audio chunks, buffer accumulates
3. Buffer fills → check peer readiness → start broadcasting
4. Send buffered chunks to all peers
5. New chunks sent immediately during broadcasting
6. `endResponse()` or last chunk → complete

**Late Joiner Support:**
- When peer joins during active broadcast, sends all buffered chunks
- Callback notifies of catch-up operation
- Can be disabled via options

**Test Results:**
✅ 57 tests passing (room initialization, peer management, response lifecycle, audio chunk handling, broadcasting, peer readiness, max wait timeout, late joiner catch-up, response info, buffer status, synchronized start time, max buffered chunks, cancellation, factory function, integration scenarios)

---

### FEAT-303: useSharedAI Hook - Client-side AI integration
**Date:** 2024-12-06
**Test:** `tests/unit/hooks/useSharedAI.test.ts`

Implemented React hook for client-side integration with shared AI sessions:

**Files Created:**
- `src/hooks/useSharedAI.ts` - useSharedAI hook

**Key Features:**
- Subscribe to AI state events from signaling server
- Receive broadcasted AI audio chunks
- Track session connection state
- Audio playback controls (start, stop, pause, resume)
- Volume and mute controls
- Buffer management with ready state detection
- Response tracking (start, end, current info)
- Reconnection support with attempt tracking
- Current speaker tracking (id and name)
- Mark ready notification to server

**State Exposed:**
- `state.isConnected` - Session connection status
- `state.aiState` - Current AI response state (idle, listening, processing, speaking, locked)
- `state.isSessionHealthy` - Session health status
- `state.currentSpeakerId` / `state.currentSpeakerName` - Current speaker info
- `state.isResponding` - Whether AI is currently responding
- `state.currentResponse` - Current response info
- `state.lastError` - Last error message
- `state.reconnectAttempts` - Reconnection attempt count

**Playback State:**
- `playback.isPlaying` - Whether audio is playing
- `playback.playbackPosition` - Current position (ms)
- `playback.bufferedDuration` - Total buffered duration (ms)
- `playback.chunksBuffered` - Number of chunks in buffer
- `playback.isReady` - Whether buffer is full enough for playback

**Actions:**
- `startPlayback()` / `stopPlayback()` / `pausePlayback()` / `resumePlayback()`
- `clearBuffer()` - Clear audio buffer
- `setVolume(volume)` / `getVolume()` - Volume control
- `mute()` / `unmute()` - Mute control
- `markReady()` - Tell server ready for playback
- `reconnect()` - Force reconnection to AI session

**Test Results:**
✅ 37 tests passing (initial state, session connection, AI state events, audio chunk handling, playback controls, volume controls, mark ready, reconnection, response state, factory function, cleanup)

---

### FEAT-304: Shared Context Management - Conversation history
**Date:** 2024-12-06
**Test:** `tests/unit/ai/context.test.ts`

Implemented context manager for tracking conversation history with speaker attribution:

**Files Created:**
- `src/server/signaling/context-manager.ts` - ContextManager class

**Key Features:**
- Room-based conversation context management
- Speaker attribution (maps peer IDs to display names)
- Token count estimation for context limits
- System prompt management with token tracking
- Message roles: system, user, assistant
- Context summarization for long sessions
- Context export/import for persistence
- Configurable max tokens and message limits
- Audio duration tracking per message
- Timestamps for all messages

**ContextManager Methods:**
- `initRoom(roomId, systemPrompt?)` / `removeRoom(roomId)` - Room lifecycle
- `addParticipant(roomId, peerId, displayName)` / `removeParticipant(roomId, peerId)` - Participant management
- `addUserMessage(roomId, content, speakerId?, audioDurationMs?)` - Add user message with attribution
- `addAssistantMessage(roomId, content, audioDurationMs?)` - Add AI response
- `setSystemPrompt(roomId, prompt)` - Update system prompt
- `getMessagesForAI(roomId)` - Get formatted messages for AI request
- `getTokenCount(roomId)` - Get estimated token count
- `summarize(roomId)` - Generate context summary (async)
- `exportContext(roomId)` / `importContext(context)` - Context persistence
- `clearContext(roomId)` - Clear all messages

**Token Estimation:**
- Simple word-based estimation (~4 chars per token average)
- Tracks system prompt + all messages
- Respects maxTokens limit
- Truncates oldest messages when limit exceeded

**Test Results:**
✅ 61 tests passing (room initialization, participant management, message handling, speaker attribution, token counting, system prompts, context for AI, summarization, export/import, configuration, factory function, edge cases)

---

### FEAT-305: AI Personality Configuration - Per-room AI setup
**Date:** 2024-12-06
**Test:** `tests/unit/ai/personality.test.ts`

Implemented AI personality configuration manager for per-room AI customization:

**Files Created:**
- `src/server/signaling/ai-personality.ts` - AIPersonalityManager class

**Key Features:**
- Personality presets: facilitator, assistant, expert, brainstorm, custom
- Per-preset system instructions with best practices
- Suggested voice and temperature per personality
- Custom personality support with validation
- Voice and temperature overrides
- Additional context injection (project info, meeting purpose)
- Participant context injection (names, roles)
- Full instruction generation combining all parts
- Configuration validation and error callbacks
- Export/import for persistence

**Personality Presets:**
- `facilitator`: Discussion guide, summarizes points, keeps on track (voice: coral, temp: 0.7)
- `assistant`: General helpful assistant (voice: alloy, temp: 0.8)
- `expert`: Domain expert with technical depth (voice: sage, temp: 0.6)
- `brainstorm`: Creative ideation partner (voice: shimmer, temp: 1.0)
- `custom`: User-provided instructions

**AIPersonalityManager Methods:**
- `initRoom(roomId, personality?, customInstructions?)` - Initialize room
- `setPersonality(roomId, personality, customInstructions?, changedBy?)` - Change personality
- `setCustomInstructions(roomId, instructions)` - Update custom instructions
- `setVoice(roomId, voice)` / `setTemperature(roomId, temp)` - Override settings
- `setAdditionalContext(roomId, context)` - Add project context
- `setParticipantContext(roomId, context)` - Add participant info
- `generateInstructions(roomId)` - Generate full system instructions
- `getSuggestedVoice(roomId)` / `getSuggestedTemperature(roomId)` - Get settings
- `validatePersonality()` / `validateCustomInstructions()` / `validateConfig()` - Validation
- `exportConfig(roomId)` / `importConfig(config)` - Persistence

**Test Results:**
✅ 81 tests passing (initialization, room management, personality presets, setPersonality, setCustomInstructions, voice/temperature configuration, additional context, participant context, generateInstructions, validation, callbacks, export/import, custom personality restrictions, clear/dispose, preset details, edge cases)

---

### FEAT-306: Enhanced SwensyncOverlay for Multi-Peer Rooms
**Date:** 2024-12-06
**Test:** `tests/unit/components/SwensyncOverlay-room.test.tsx`

Implemented enhanced full-screen overlay for multi-peer room voice conversations:

**Files Created:**
- `src/components/room/SwensyncOverlayRoom.tsx` - Enhanced room overlay component

**Key Features:**
- Room context with room name, ID, and participant display
- AI state display with room awareness (idle, listening, processing, speaking)
- Shows which peer AI is responding to with avatar and name
- Speaking indicator for current speakers while AI listens
- Shared audio visualizer with configurable modes
- PTT button integration with MainPTTButton component
- Mute/unmute control with visual feedback
- Queue position indicator ("You're next" or "Position X of Y")
- Session timer and expiring session warning
- Unhealthy session warning indicator
- Settings and participants buttons
- Mobile landscape support with sidebar layout
- Header participant avatars with overflow indicator
- Close button with disconnect behavior
- ESC key to close
- Auto-connect on open, disconnect on close

**Component Props:**
- `isOpen` / `onClose` - Open state management
- `roomId` / `roomName` - Room identification
- `localPeerId` - Local user identification
- `connectionState` - Connection state (idle, connecting, connected, reconnecting, error)
- `participants` - Array of RoomParticipant with speaking/muted state
- `aiSession` - RoomAISession with state, queue, speaker info
- `analyserNode` / `isVisualizerActive` - Audio visualization
- `onPTTStart` / `onPTTEnd` - Push-to-talk callbacks
- `onToggleMute` / `isLocalMuted` - Mute controls
- `onOpenSettings` / `onShowParticipants` - Navigation callbacks

**Test Results:**
✅ 48 tests passing (rendering, connection states, participant display, AI state display, responding to speaker, speaking indicators, queue position, session warnings, controls, close behavior, auto-connect, session timer, visualizer mode, accessibility, edge cases)

---

### FEAT-157: Server-side Turn Queue Processing
**Date:** 2024-12-06
**Test:** `tests/unit/ai/turn-queue.test.ts`

Implemented server-side FIFO queue processor for turn management:

**Files Created:**
- `src/server/signaling/turn-queue-processor.ts` - TurnQueueProcessor class

**Key Features:**
- FIFO queue with priority-based ordering
- Role-based priority (owner > moderator > member)
- Automatic queue advancement after AI response.done
- Request timeout and expiration handling
- Client notification of queue position changes
- "Bump to front" for priority override
- Minimum turn interval enforcement
- Statistics tracking (processed, expired, rejected)
- Cancel by request ID or by peer
- Multiple room support

**TurnQueueProcessor Methods:**
- `initRoom(roomId)` / `removeRoom(roomId)` - Room lifecycle
- `enqueue(roomId, peerId, displayName, role?, priority?)` - Add to queue
- `dequeue(roomId)` - Remove and return first entry
- `cancel(roomId, requestId)` - Cancel specific request
- `cancelAllForPeer(roomId, peerId)` - Cancel all requests from peer
- `processNext(roomId)` - Process next entry, grant turn
- `onResponseDone(roomId)` - Called when AI response completes
- `endTurn(roomId, wasInterrupted?)` - End current turn
- `bumpToFront(roomId, requestId)` - Priority override
- `getPosition(roomId, peerId)` - Get queue position
- `getQueueState(roomId)` - Get full queue state
- `getStatistics(roomId)` - Get queue statistics
- `clearQueue(roomId)` - Clear all entries

**Callbacks:**
- `onPositionChange` - Queue position changes
- `onTurnGranted` - Turn granted to peer
- `onTurnCompleted` - Turn completed
- `onRequestRejected` - Request rejected (max attempts)
- `onRequestExpired` - Request timeout
- `onQueueUpdate` - Queue state updated
- `onProcessingStart` / `onProcessingComplete` - Processing lifecycle

**Test Results:**
✅ 53 tests passing (initialization, enqueue, priority ordering, dequeue, cancel, processNext, onResponseDone, endTurn, timeout handling, callbacks, getPosition, statistics, clearQueue, edge cases, getRoomCount, getQueueState)

---

### FEAT-158: Interrupt Handling for Urgent Overrides
**Date:** 2024-12-06
**Test:** `tests/unit/ai/interrupt.test.ts`

Implemented interrupt handler for allowing room owners/moderators to interrupt AI responses:

**Files Created:**
- `src/server/signaling/interrupt-handler.ts` - InterruptHandler class

**Key Features:**
- Role-based permissions (owner, moderator, member)
- Cooldown enforcement between interrupts (configurable, default 2s)
- Rate limiting (max interrupts per minute)
- Interrupt request/process/cancel lifecycle
- Event logging for analytics
- Room-scoped state management
- Callbacks for OpenAI response.cancel, clear response, unlock AI
- History tracking with statistics
- Pending interrupt queue per room

**InterruptHandler Methods:**
- `initRoom(roomId, enabled?)` / `removeRoom(roomId)` - Room lifecycle
- `canInterrupt(roomId, peerId, role)` - Check if peer can interrupt
- `requestInterrupt(roomId, peerId, name, role, aiState, interruptedPeerId?, reason?)` - Request interrupt
- `processInterrupt(roomId, requestId, aiState, interruptedPeerId?, duration?)` - Process pending interrupt
- `cancelInterrupt(roomId, requestId)` - Cancel pending interrupt
- `getPendingInterrupt(roomId)` / `hasPendingInterrupt(roomId)` - Query pending
- `getHistory(roomId, limit?)` - Get interrupt event history
- `getStatistics(roomId)` - Get interrupt stats (total, successful, rejected, cooldown)
- `setEnabled(roomId, enabled)` - Enable/disable interrupts
- `updateOptions(options)` - Update global options

**Interrupt Events:**
- `requested` - Interrupt requested
- `processed` - Interrupt successfully processed
- `rejected` - Interrupt rejected (permissions, cooldown, rate limit)
- `cancelled` - Interrupt cancelled before processing

**Test Results:**
✅ 46 tests passing (initialization, room management, canInterrupt, requestInterrupt, processInterrupt, cancelInterrupt, history, statistics, setEnabled, updateOptions, edge cases, dispose)

---

## Phase 4 Complete!

All 9 Phase 4 features have been implemented and tested:
- AI Session: FEAT-300 (Orchestrator), FEAT-301 (Mixed input), FEAT-302 (Broadcasting), FEAT-303 (useSharedAI)
- Context: FEAT-304 (Context manager), FEAT-305 (AI personality)
- UI: FEAT-306 (SwensyncOverlayRoom)
- Turn Management: FEAT-157 (Turn queue), FEAT-158 (Interrupt handler)

**Total Tests in Phase 4:** 414+ tests passing

---

## Phase 5: Production Polish (In Progress)

### Planned Features:
1. `FEAT-400` - Supabase authentication ✅
2. `FEAT-401` - Database schema
3. `FEAT-402` - Room persistence CRUD
4. `FEAT-403` - Room permissions
5. `FEAT-404` - Reconnection handling
6. `FEAT-405` - Graceful degradation
7. `FEAT-406` - Audio pipeline optimization
8. `FEAT-407` - Signaling efficiency
9. `FEAT-408` - GitHub Actions CI
10. `FEAT-409` - Pre-commit hooks
11. `FEAT-410` - Multi-peer E2E tests

---

### FEAT-400: User Authentication - Supabase Integration
**Date:** 2024-12-06
**Test:** `tests/unit/auth/supabase.test.tsx`

Implemented Supabase authentication with mock mode for development/testing:

**Files Created:**
- `src/types/auth.ts` - Auth types (UserProfile, Session, AuthState, etc.)
- `src/lib/supabase/client.ts` - SupabaseAuthClient class with mock mode
- `src/lib/supabase/index.ts` - Supabase client exports
- `src/contexts/AuthContext.tsx` - AuthProvider and hooks
- `src/contexts/index.ts` - Context exports
- `src/middleware.ts` - Route protection middleware

**Key Features:**
- SupabaseAuthClient with mock mode for development without Supabase
- Sign up/sign in with email/password
- OAuth support (Google, GitHub) when Supabase configured
- Magic link support
- Password reset and update
- Profile update
- Session persistence in localStorage
- Auto session refresh before expiry
- Route protection for /rooms, /profile, /settings
- Auth context with hooks: useAuth, useIsAuthenticated, useUser, useAuthState

**Auth Types:**
- `UserProfile`: id, email, displayName, avatarUrl, createdAt, lastSignInAt
- `Session`: accessToken, refreshToken, expiresAt, user
- `AuthState`: 'loading' | 'authenticated' | 'unauthenticated' | 'error'
- `AuthErrorCode`: Mapped Supabase errors to user-friendly messages

**Route Protection:**
- Protected routes: /rooms, /rooms/*, /profile, /settings
- Public routes: /, /auth/*, /api/health
- Automatic redirect to /auth/signin with returnUrl

**Test Results:**
✅ 73 tests passing (auth types, Supabase client, transformers, storage, auth context, hooks, session persistence, integration)

---

### FEAT-401: Room Persistence - Database Schema
**Date:** 2024-12-06
**Test:** `tests/unit/db/schema.test.ts`

Implemented database schema for room persistence using Drizzle ORM-compatible patterns:

**Files Created:**
- `src/server/db/schema.ts` - Complete database schema
- `src/server/db/index.ts` - Schema exports

**Table Schemas:**
- `RoomsTable`: rooms with owner, voice settings, AI personality, status
- `ParticipantsTable`: room participants with roles and presence
- `RoomHistoryTable`: audit log for room events

**Key Features:**
- PostgreSQL-compatible schema definitions
- Drizzle ORM-style table schemas with types
- JSONB columns for voice_settings and event_data
- Partial indexes for query optimization (active rooms, room participants)
- Insert and Update type definitions
- Query result types (RoomWithCount, RoomWithParticipants)
- Full migration SQL with CREATE TABLE, indexes, and functions
- Validation functions for all fields
- Type guards for enums
- Default value generators

**Validation Functions:**
- `validateRoomName()` - 3-50 chars, alphanumeric with spaces
- `validateMaxParticipants()` - 2-10 range
- `validateAIPersonality()` - Valid personality enum
- `validateRoomStatus()` - Valid status enum
- `validatePeerRole()` - Valid role enum
- `validateEventType()` - Valid event type enum
- `validateInsertRoom()` / `validateInsertParticipant()` - Full object validation

**Test Results:**
✅ 82 tests passing (SQL definitions, defaults, validation functions, type guards, type interfaces)

---

### FEAT-402: Room Persistence - CRUD Operations
**Date:** 2024-12-06
**Test:** `tests/unit/db/queries.test.ts`

Implemented database CRUD operations with support for both mock and database modes:

**Files Created:**
- `src/server/db/queries.ts` - Complete CRUD operations for rooms, participants, and history

**Room Operations:**
- `createRoom()` - Create room with validation and ownership
- `getRoom()` / `getRoomWithCount()` / `getRoomWithParticipants()` - Room retrieval
- `getRooms()` - List rooms with filtering (status, owner, search), pagination, sorting
- `updateRoom()` / `updateRoomVoiceSettings()` / `updateRoomStatus()` - Room updates
- `deleteRoom()` (soft) / `hardDeleteRoom()` (permanent) / `closeRoom()` - Room deletion
- `roomExists()` / `getRoomCount()` - Room queries

**Participant Operations:**
- `addParticipant()` - Add participant with capacity checks and status updates
- `removeParticipant()` - Remove participant with time tracking
- `kickParticipant()` - Remove with audit event
- `updateParticipantRole()` - Change role with audit event
- `getParticipants()` / `getParticipantByPeerId()` / `getParticipantCount()` - Queries

**History Operations:**
- `recordRoomEvent()` - Record events (room_created, participant_joined, role_changed, etc.)
- `getRoomHistory()` - Retrieve history with filtering and pagination

**Key Features:**
- Mock mode for development/testing without database
- DatabaseClient interface for Drizzle/Supabase integration
- Automatic room status updates based on participant count
- Full event history for auditing
- Query options: status filter, owner filter, search, pagination, sorting
- Factory function `createRoomQueries()` for dependency injection

**Test Results:**
✅ 67 tests passing (room CRUD, participant CRUD, history, factory, integration tests)

---

## Changelog Format

Each completed feature entry follows this format:

```markdown
### FEAT-XXX: Feature Title
**Date:** YYYY-MM-DD
**Commit:** `abc1234`
**Test:** `tests/unit/path/to/test.ts`

Brief description of what was implemented.

**Changes:**
- File 1 change
- File 2 change

**Test Results:**
✅ All tests passing (X passed, 0 failed)
```

---

## Development Notes

### Architecture Decisions

1. **Mesh Topology for WebRTC**
   - Chosen for simplicity in Phase 2
   - Can migrate to SFU in Phase 5 if needed for scale

2. **Server-Side Audio Mixing**
   - Centralized mixing for AI input
   - Enables single OpenAI session per room

3. **Socket.io for Signaling**
   - Reliable WebSocket abstraction
   - Built-in room support
   - Automatic reconnection

4. **In-Memory Room State (Phase 2)**
   - Faster development iteration
   - Database persistence added in Phase 5

### Known Limitations

- Maximum ~6 peers in mesh topology (O(n²) connections)
- Session limited to 10 minutes (OpenAI Realtime limit)
- No video support (voice-only)

### Dependencies to Add

Phase 2:
- `socket.io` and `socket.io-client`
- `nanoid` for room IDs

Phase 5:
- `@supabase/supabase-js`
- `drizzle-orm` or similar for database
- `husky` and `lint-staged`

---

## Protocol Compliance

This project follows the **Long-Horizon Engineering Protocol**:

- ✅ File-based memory (PROJECT.md, features_list.json, project-progress.md)
- ✅ Incremental progress (one feature at a time)
- ⏳ Test-driven verification (tests required for each feature)
- ✅ Git history for permanent state

**Agent Instructions:**
1. Read `features_list.json` to find next `passes: false` feature
2. Implement the feature
3. Write and run tests
4. Update `features_list.json` to `passes: true`
5. Add entry to this file
6. Commit with `feat(FEAT-XXX): description`
