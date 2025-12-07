# FEAT-414: Vanity Username Feature Implementation Plan

## Feature Overview

Allow participants to set a custom "vanity username" that persists across sessions and is reflected:

1. In the room UI (ParticipantList)
2. To all peers in the room via signaling
3. In the AI context when the user triggers PTT (so the AI responds using their name)

## Current Architecture Analysis

### Display Name Flow (Current)

1. **Room Join**: User enters room → `sessionStorage` generates random name like `User-abc1` ([room page:119-129](src/app/rooms/[roomId]/page.tsx#L119-L129))
2. **Signaling**: Name sent in `room:join` payload → stored in `Peer.displayName` ([server.ts:522-530](server.ts#L522-L530))
3. **Peer Tracking**: Name stored in `roomPeers` Map → broadcast via `PeerSummary` ([server.ts:154-164](server.ts#L154-L164))
4. **UI Display**: `ParticipantList` renders `displayName` ([ParticipantList.tsx:314](src/components/room/ParticipantList.tsx#L314))
5. **AI Context**: Name passed to OpenAI via `activeSpeakerName` when PTT starts ([server.ts:733-735](server.ts#L733-L735))

### Key Touch Points

| Component        | File                                      | What Changes                      |
| ---------------- | ----------------------------------------- | --------------------------------- |
| Room Page        | `src/app/rooms/[roomId]/page.tsx`         | Add username input/modal          |
| Signaling Client | `src/lib/signaling/client.ts`             | Add `peer:update_name` event      |
| Server           | `server.ts`                               | Handle name update, broadcast     |
| ParticipantList  | `src/components/room/ParticipantList.tsx` | Already displays name (no change) |
| SessionStorage   | Browser                                   | Persist username across sessions  |

## Implementation Plan

### Step 1: Add Username Input Modal Component

**File**: `src/components/room/UsernameModal.tsx` (NEW)

Create a modal component for setting username:

- Text input with validation (3-30 chars, alphanumeric + spaces)
- Save button
- Cancel button (if editing existing name)
- Shows current username when editing
- Accessible with proper ARIA labels

```typescript
interface UsernameModalProps {
  isOpen: boolean;
  currentName?: string;
  onSave: (name: string) => void;
  onClose: () => void;
}
```

### Step 2: Add Username Update to Signaling Client

**File**: `src/lib/signaling/client.ts`

Add method to update peer display name:

```typescript
public updateDisplayName(newDisplayName: string): void {
  if (!this.socket?.connected) return;
  this.socket.emit('peer:update_name', { displayName: newDisplayName });
}
```

### Step 3: Add Server-Side Handler for Name Updates

**File**: `server.ts`

Add socket event handler:

```typescript
socket.on("peer:update_name", (payload) => {
  const { displayName } = payload;
  const roomId = (socket as any).roomId;
  if (!roomId) return;

  const peers = roomPeers.get(roomId);
  const peer = peers?.get(peerId);
  if (!peer) return;

  // Update peer display name
  peer.displayName = displayName;
  (socket as any).displayName = displayName;

  // Broadcast to room
  socket.to(roomId).emit("peer:updated", toPeerSummary(peer));
  // Also emit to self for confirmation
  socket.emit("peer:updated", toPeerSummary(peer));

  console.log(`[Socket.io] Peer ${peerId} changed name to "${displayName}"`);
});
```

### Step 4: Update Room Page to Support Username Changes

**File**: `src/app/rooms/[roomId]/page.tsx`

Changes needed:

1. Add state for showing username modal
2. Update `displayName` state to use `useState` with setter
3. Load persisted username from `sessionStorage`/`localStorage`
4. Add edit username button in header
5. Handle username change flow

```typescript
// Change from const to state
const [displayName, setDisplayName] = useState(() => {
  if (typeof window !== "undefined") {
    // Check localStorage first (persisted)
    const stored = localStorage.getItem("swensync_vanityUsername");
    if (stored) return stored;
    // Fall back to session storage
    const session = sessionStorage.getItem("swensync_displayName");
    if (session) return session;
    // Generate new
    const newName = `User-${Math.random().toString(36).slice(2, 6)}`;
    sessionStorage.setItem("swensync_displayName", newName);
    return newName;
  }
  return "User";
});

const [showUsernameModal, setShowUsernameModal] = useState(false);

const handleUsernameChange = useCallback(
  (newName: string) => {
    setDisplayName(newName);
    // Persist to localStorage
    localStorage.setItem("swensync_vanityUsername", newName);
    // Update via signaling
    const client = getClient();
    if (client) {
      client.updateDisplayName(newName);
    }
    setShowUsernameModal(false);
  },
  [getClient],
);
```

### Step 5: Add Edit Button to Room Header

**File**: `src/app/rooms/[roomId]/page.tsx`

Add a clickable username display in header:

```tsx
<button
  onClick={() => setShowUsernameModal(true)}
  className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
>
  <span>You: {displayName}</span>
  <Edit2 className="w-3 h-3" />
</button>
```

### Step 6: Update useRoomConnection Hook

**File**: `src/hooks/useRoomConnection.ts`

Add handler for `peer:updated` events to update local state when name changes are broadcast.

### Step 7: Ensure AI Uses Updated Name

The AI already receives `activeSpeakerName` from [server.ts:735](server.ts#L735). Since we update `(socket as any).displayName` in the handler, subsequent PTT triggers will use the new name automatically.

## File Changes Summary

| File                                    | Action | Description                            |
| --------------------------------------- | ------ | -------------------------------------- |
| `src/components/room/UsernameModal.tsx` | CREATE | New modal component                    |
| `src/components/room/index.ts`          | EDIT   | Export new component                   |
| `src/lib/signaling/client.ts`           | EDIT   | Add `updateDisplayName` method         |
| `src/app/rooms/[roomId]/page.tsx`       | EDIT   | Add username state, modal, edit UI     |
| `server.ts`                             | EDIT   | Add `peer:update_name` handler         |
| `src/hooks/useRoomConnection.ts`        | EDIT   | Handle `peer:updated` for name changes |

## Data Flow After Implementation

```
User clicks edit → Modal opens → User enters new name → Save
    ↓
localStorage.setItem("swensync_vanityUsername", newName)
    ↓
signalingClient.updateDisplayName(newName)
    ↓
Server receives "peer:update_name" event
    ↓
Server updates peer.displayName and socket.displayName
    ↓
Server broadcasts "peer:updated" to room
    ↓
All clients update ParticipantList
    ↓
Next PTT → Server sends activeSpeakerName = newName → AI addresses by name
```

## Validation Requirements

- Username: 3-30 characters
- Allowed characters: letters, numbers, spaces, hyphens, underscores
- Trim whitespace
- No empty strings

## Testing Plan

1. **Unit Test**: UsernameModal component renders correctly
2. **Unit Test**: Validation logic works for edge cases
3. **Integration Test**: Name update flows through signaling
4. **E2E Test**: Full flow from UI to AI response with name

## Feature Entry for features_list.json

```json
{
  "id": "FEAT-414",
  "phase": 5,
  "category": "user-experience",
  "description": "Vanity username support with persistence and AI integration",
  "priority": "medium",
  "steps": [
    "Create UsernameModal component with validation",
    "Add updateDisplayName method to signaling client",
    "Add peer:update_name handler to server.ts",
    "Update room page with username state and edit UI",
    "Persist username to localStorage",
    "Ensure AI uses updated name in PTT responses"
  ],
  "testFile": "tests/unit/components/UsernameModal.test.tsx",
  "dependencies": ["FEAT-413"],
  "passes": false
}
```

## Implementation Order

1. Create `UsernameModal.tsx` component
2. Add `peer:update_name` handler to `server.ts`
3. Add `updateDisplayName` to `SignalingClient`
4. Update room page with username editing UI
5. Add tests
6. Update `features_list.json`
