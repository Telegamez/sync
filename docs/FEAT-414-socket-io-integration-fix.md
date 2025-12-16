# FEAT-411: Socket.io Integration Fix

> **Date:** 2024-12-07
> **Status:** Resolved
> **Severity:** Critical - Production blocking

## Summary

Fixed a critical issue where peers could not see each other in production rooms. The Socket.io signaling server was running correctly, but the room page was not connecting to it.

## Root Cause Analysis

### Initial Symptoms

- Server logs showed: `[Socket.io] Client connected` followed immediately by `[Socket.io] Client disconnected (transport close)`
- No `room:join` events were being logged
- Users could not see other participants in rooms

### Investigation Steps

1. **Verified nginx WebSocket proxy configuration** - Correct with proper headers
2. **Tested Socket.io polling endpoint** - Working (`/socket.io/?EIO=4&transport=polling`)
3. **Tested local Socket.io connection** - Working perfectly
4. **Tested connection through nginx** - Initially failing with "transport close"

### Root Causes Identified

**Primary Issue: Room page using mock data**

The room page (`src/app/rooms/[roomId]/page.tsx`) was rendering participant data but never actually connecting to the Socket.io signaling server. The `useRoomConnection` hook was imported but not being used.

**Secondary Issue: Missing useEffect cleanup**

The `useEffect` that connected to Socket.io had:

- Functions (`connect`, `joinRoom`) in the dependency array causing potential infinite reconnects
- No cleanup function to call `leaveRoom()` on unmount
- Component remounts (React Strict Mode) created orphaned connections

## The Fix

### 1. Integrated useRoomConnection Hook

```tsx
// Socket.io room connection hook - provides real signaling
const {
  connectionState,
  room,
  localPeer,
  peers,
  isInRoom,
  connect,
  joinRoom,
  leaveRoom,
  getClient,
} = useRoomConnection({
  autoConnect: false,
  handlers: {
    onPeerJoined: (peer) =>
      console.log("[Room] Peer joined:", peer.displayName),
    onPeerLeft: (peerId) => console.log("[Room] Peer left:", peerId),
    onRoomError: (err) => setError({ message: err.message, code: err.code }),
  },
});
```

### 2. Fixed useEffect Dependencies with Refs

```tsx
// Use refs to avoid dependency issues
const connectRef = useRef(connect);
const joinRoomRef = useRef(joinRoom);
const leaveRoomRef = useRef(leaveRoom);

// Keep refs updated
useEffect(() => {
  connectRef.current = connect;
  joinRoomRef.current = joinRoom;
  leaveRoomRef.current = leaveRoom;
}, [connect, joinRoom, leaveRoom]);

useEffect(() => {
  let mounted = true;
  let hasJoined = false;

  async function connectAndJoin() {
    await connectRef.current();
    await joinRoomRef.current(roomId, displayName);
    hasJoined = true;
    // ... error handling
  }

  connectAndJoin();

  // Cleanup: Leave room when component unmounts
  return () => {
    mounted = false;
    if (hasJoined) {
      leaveRoomRef.current().catch(console.error);
    }
  };
}, [roomId, displayName]); // Only depend on stable values
```

### 3. Added Connection State Mapping

The signaling layer uses `'error'` state, but `PeerConnectionState` uses `'disconnected'`:

```tsx
function mapConnectionState(state: string): PeerConnectionState {
  switch (state) {
    case "connected":
      return "connected";
    case "connecting":
      return "connecting";
    case "reconnecting":
      return "reconnecting";
    case "error":
    case "disconnected":
    default:
      return "disconnected";
  }
}
```

### 4. Converted Signaling Peers to ParticipantInfo

```tsx
function convertPeersToParticipants(
  peers: PeerSummary[],
  localPeerId: string | null,
): ParticipantInfo[] {
  return peers.map((peer) => ({
    id: peer.id,
    displayName: peer.displayName,
    avatarUrl: peer.avatarUrl,
    role: peer.role as "owner" | "moderator" | "participant",
    isMuted: peer.isMuted,
    isSpeaking: peer.isSpeaking,
    isLocal: peer.id === localPeerId,
    connectionState: mapConnectionState(peer.connectionState),
  }));
}
```

## Files Modified

| File                              | Changes                                                    |
| --------------------------------- | ---------------------------------------------------------- |
| `src/app/rooms/[roomId]/page.tsx` | Integrated useRoomConnection, added cleanup, state mapping |
| `server.ts`                       | Added error handling for HTTP server startup               |

## Verification

### Local Test

```bash
node -e "
const { io } = require('socket.io-client');
const socket = io('http://localhost:24680', { transports: ['websocket'] });
socket.on('connect', () => {
  socket.emit('room:join', { roomId: 'test', displayName: 'Test' }, (response) => {
    console.log('Joined:', response.room.id);
    socket.disconnect();
  });
});
"
# Output: Joined: test
```

### Production Test (via nginx)

```bash
node -e "
const { io } = require('socket.io-client');
const socket = io('https://sync.ference.ai');
socket.on('connect', () => {
  console.log('Connected via nginx');
  socket.emit('room:join', { roomId: 'test', displayName: 'Test' }, (response) => {
    console.log('Joined via nginx:', response.room.id);
    socket.disconnect();
  });
});
"
# Output: Connected via nginx
# Output: Joined via nginx: test
```

### Multi-Peer Test

```bash
# Two clients joining same room
Client 1 connected, peer ID: 5tMrDUvXXLNl
Client 1 joined, existing peers: 0
Client 2 connected, peer ID: titSfVg2uWRJ
Client 2 joined, existing peers: 1 (User One)
Client 1 sees peer joined: User Two
# Success! Both clients connected and saw each other.
```

## Server Logs After Fix

```
[Socket.io] Client connected: RkBAjS1B09tZ4ndXAAAG (peer: 5tMrDUvXXLNl)
[Socket.io] Client connected: W4ehh2rKGeVb3PsYAAAH (peer: titSfVg2uWRJ)
[Socket.io] Peer 5tMrDUvXXLNl joining room multi-test as "User One"
[Socket.io] Auto-created room multi-test
[Socket.io] Peer 5tMrDUvXXLNl joined room multi-test. Total: 1, Existing peers: 0
[Socket.io] Peer titSfVg2uWRJ joining room multi-test as "User Two"
[Socket.io] Peer titSfVg2uWRJ joined room multi-test. Total: 2, Existing peers: 1
```

## Key Learnings

1. **Always verify client-side integration** - The server can work perfectly, but if the client doesn't connect, nothing happens.

2. **React useEffect dependencies matter** - Callback functions in dependency arrays can cause infinite loops or unexpected reconnects. Use refs for stable function references.

3. **Always add cleanup functions** - Especially for WebSocket connections that maintain server-side state.

4. **Test the full path** - Local → nginx proxy → server. Issues can occur at any layer.

5. **Component remounts are common** - React Strict Mode, hot reloading, and navigation can all cause remounts. Cleanup functions are essential.

## Related Files

- [server.ts](../server.ts) - Custom Next.js server with Socket.io
- [src/app/rooms/[roomId]/page.tsx](../src/app/rooms/[roomId]/page.tsx) - Room experience page
- [src/hooks/useRoomConnection.ts](../src/hooks/useRoomConnection.ts) - Socket.io connection hook
- [src/lib/signaling/client.ts](../src/lib/signaling/client.ts) - SignalingClient class

## Nginx Configuration Reference

The nginx configuration at `/etc/nginx/sites-enabled/sync.ference.ai` is correctly configured for WebSocket:

```nginx
location / {
    proxy_pass http://127.0.0.1:24680;
    proxy_http_version 1.1;

    # WebSocket support
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";

    # Standard proxy headers
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    # Timeouts (important for WebSocket)
    proxy_read_timeout 300s;
    proxy_connect_timeout 75s;
    proxy_send_timeout 300s;
}
```

## Testing Commands

```bash
# Restart production server
pnpm stop && pnpm prod

# Monitor server logs
tail -f /tmp/sync.log

# Test Socket.io polling
curl -s "https://sync.ference.ai/socket.io/?EIO=4&transport=polling"
# Expected: 0{"sid":"...","upgrades":["websocket"],...}
```
