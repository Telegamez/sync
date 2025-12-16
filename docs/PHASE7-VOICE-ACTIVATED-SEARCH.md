# Phase 7: Voice-Activated Search Implementation

> **Long-Horizon Engineering Protocol - Phase 7 Specification**
>
> Feature: Voice-triggered web, image, and video search using OpenAI Realtime API function calling and Serper API.

---

## Overview

This phase implements voice-activated search functionality that allows users to trigger web searches by speaking keywords like "search", "look up", "find", or "google". The AI detects these intents, calls the Serper API to fetch results, and displays them in a tabbed panel similar to the transcript panel.

### Key Capabilities

- **Keyword Detection**: AI recognizes search intent from natural speech
- **Multi-Type Search**: Web, images, and videos in parallel
- **Real-Time Results**: Results broadcast to all room participants
- **Tabbed UI**: SearchPanel with Web/Images/Videos tabs
- **AI Summary**: AI provides verbal summary of top results

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                      VOICE → SEARCH PIPELINE                          │
├──────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  User: "Search for the latest news about Tesla stock"                │
│                          │                                            │
│                          ▼                                            │
│  ┌─────────────────────────────────────────┐                         │
│  │   OpenAI Realtime API                   │                         │
│  │   - Recognizes search intent            │                         │
│  │   - Triggers webSearch function call    │                         │
│  │   - Extracts query: "Tesla stock news"  │                         │
│  └──────────────────┬──────────────────────┘                         │
│                     │                                                 │
│                     ▼ response.output_item.done                       │
│                       (type: function_call)                           │
│                                                                       │
│  ┌─────────────────────────────────────────┐                         │
│  │   Server: OpenAIRealtimeClient          │                         │
│  │   handleMessage() detects function_call │                         │
│  │   Triggers onFunctionCall callback      │                         │
│  └──────────────────┬──────────────────────┘                         │
│                     │                                                 │
│                     ▼                                                 │
│  ┌─────────────────────────────────────────┐                         │
│  │   SerperService.search()                │                         │
│  │   Parallel API calls:                   │                         │
│  │   - POST /search (web)                  │                         │
│  │   - POST /images (images)               │                         │
│  │   - POST /videos (videos)               │                         │
│  └──────────────────┬──────────────────────┘                         │
│                     │                                                 │
│         ┌──────────┴──────────┐                                      │
│         ▼                     ▼                                      │
│  ┌──────────────────┐  ┌──────────────────────┐                      │
│  │ conversation.    │  │ Socket.io broadcast  │                      │
│  │ item.create      │  │ search:results       │                      │
│  │ (function_output)│  │ to all room peers    │                      │
│  └────────┬─────────┘  └──────────┬───────────┘                      │
│           │                       │                                   │
│           ▼                       ▼                                   │
│  ┌──────────────────┐  ┌──────────────────────┐                      │
│  │ response.create  │  │ SearchPanel UI       │                      │
│  │ AI speaks summary│  │ [Web|Images|Videos]  │                      │
│  └──────────────────┘  └──────────────────────┘                      │
│                                                                       │
└──────────────────────────────────────────────────────────────────────┘
```

---

## OpenAI Realtime API Integration

### Function Definition

The `webSearch` function is registered in the session configuration:

```typescript
// In sendSessionConfig() of openai-realtime-client.ts
const config = {
  type: "session.update",
  session: {
    modalities: ["text", "audio"],
    instructions: this.config.instructions || DEFAULT_INSTRUCTIONS,
    voice: this.config.voice || "marin",
    input_audio_format: "pcm16",
    output_audio_format: "pcm16",
    temperature: this.config.temperature ?? 0.8,
    turn_detection: null,

    // NEW: Function calling tools
    tools: [
      {
        type: "function",
        name: "webSearch",
        description:
          "Search the web for current information, news, images, or videos. Use when user says 'search', 'look up', 'find', 'google', or asks about current events, news, or things that require up-to-date information.",
        parameters: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "The search query to look up",
            },
            searchType: {
              type: "string",
              enum: ["all", "web", "images", "videos"],
              description:
                "Type of search. Use 'all' for general queries, 'images' when user wants pictures, 'videos' when user wants video content.",
            },
          },
          required: ["query"],
        },
      },
    ],
    tool_choice: "auto",
  },
};
```

### Event Handling

When the AI decides to call the function, the server receives:

```typescript
// response.output_item.done event
{
  "type": "response.output_item.done",
  "event_id": "event_abc123",
  "response_id": "resp_xyz789",
  "output_index": 0,
  "item": {
    "id": "item_def456",
    "type": "function_call",
    "status": "completed",
    "name": "webSearch",
    "call_id": "call_ghi789",
    "arguments": "{\"query\":\"Tesla stock news\",\"searchType\":\"all\"}"
  }
}
```

### Returning Results to OpenAI

After fetching results from Serper, send them back:

```typescript
// 1. Create function output item
const outputEvent = {
  type: "conversation.item.create",
  item: {
    type: "function_call_output",
    call_id: "call_ghi789",
    output: JSON.stringify({
      web: [
        /* top 3 web results */
      ],
      images: [
        /* top 3 image results */
      ],
      videos: [
        /* top 3 video results */
      ],
    }),
  },
};
ws.send(JSON.stringify(outputEvent));

// 2. Trigger AI to respond with summary
const responseEvent = {
  type: "response.create",
  response: {
    modalities: ["audio", "text"],
  },
};
ws.send(JSON.stringify(responseEvent));
```

---

## Serper API Integration

### Service Configuration

```typescript
// src/server/signaling/serper-service.ts

const SERPER_API_KEY = process.env.SERPER_API_KEY;
const SERPER_BASE_URL = "https://google.serper.dev";

interface SerperConfig {
  apiKey: string;
  location?: string; // Default: "United States"
  gl?: string; // Country code, default: "us"
  hl?: string; // Language, default: "en"
}
```

### API Endpoints

| Endpoint  | Method | Purpose               |
| --------- | ------ | --------------------- |
| `/search` | POST   | Web search results    |
| `/images` | POST   | Image search results  |
| `/videos` | POST   | Video search results  |
| `/news`   | POST   | News-specific results |

### Request Format

```typescript
// Common request structure
const request = {
  q: "Tesla stock news",
  location: "United States",
  gl: "us",
  hl: "en",
  num: 10, // Number of results
  tbs: "qdr:d", // Time filter: past day (optional)
};

const config = {
  method: "post",
  url: `${SERPER_BASE_URL}/search`,
  headers: {
    "X-API-KEY": SERPER_API_KEY,
    "Content-Type": "application/json",
  },
  data: JSON.stringify(request),
};
```

### Response Types

```typescript
// Web search response
interface SerperWebResult {
  title: string;
  link: string;
  snippet: string;
  date?: string;
  position: number;
  sitelinks?: { title: string; link: string }[];
}

// Image search response
interface SerperImageResult {
  title: string;
  imageUrl: string;
  imageWidth: number;
  imageHeight: number;
  thumbnailUrl: string;
  link: string; // Source page URL
  source: string; // Source domain
  position: number;
}

// Video search response
interface SerperVideoResult {
  title: string;
  link: string;
  snippet: string;
  imageUrl: string; // Thumbnail
  duration?: string; // e.g., "8:33"
  source: string; // e.g., "YouTube"
  channel?: string;
  date?: string;
  position: number;
}

// Combined search results
interface SearchResults {
  query: string;
  timestamp: Date;
  web: SerperWebResult[];
  images: SerperImageResult[];
  videos: SerperVideoResult[];
  topStories?: SerperTopStory[];
  relatedSearches?: string[];
}
```

---

## Socket.io Events

### New Events

| Event            | Direction     | Payload                      | Description           |
| ---------------- | ------------- | ---------------------------- | --------------------- |
| `search:started` | Server→Client | `{ query, roomId }`          | Search initiated      |
| `search:results` | Server→Client | `{ results: SearchResults }` | Results ready         |
| `search:error`   | Server→Client | `{ error, query }`           | Search failed         |
| `search:clear`   | Client→Server | `{ roomId }`                 | Clear current results |

### Event Flow

```typescript
// Server-side (in server.ts or ai-orchestrator.ts)

// When function call received
socket.to(roomId).emit("search:started", {
  query: parsedArgs.query,
  searchType: parsedArgs.searchType || "all"
});

// After Serper API returns
socket.to(roomId).emit("search:results", {
  results: {
    query: "Tesla stock news",
    timestamp: new Date().toISOString(),
    web: [...],
    images: [...],
    videos: [...]
  }
});
```

---

## UI Components

### SearchPanel Component

Similar structure to TranscriptPanel with tabbed interface:

```typescript
// src/components/room/SearchPanel.tsx

interface SearchPanelProps {
  results: SearchResults | null;
  activeTab: "web" | "images" | "videos";
  isLoading: boolean;
  error: string | null;
  onTabChange: (tab: "web" | "images" | "videos") => void;
  onClose?: () => void;
  onClear?: () => void;
  className?: string;
}
```

### Layout Structure

```
┌─────────────────────────────────────────┐
│ 🔍 Search: "Tesla stock news"      [X] │  ← Header with query
├─────────────────────────────────────────┤
│ [Web]  [Images]  [Videos]               │  ← Tab navigation
├─────────────────────────────────────────┤
│                                         │
│  ┌─────────────────────────────────┐   │
│  │ Tesla Stock (TSLA) - Yahoo      │   │  ← Web result card
│  │ finance.yahoo.com               │   │
│  │ Tesla shares rose 5% today...   │   │
│  └─────────────────────────────────┘   │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │ TSLA Price Today - MarketWatch  │   │
│  │ marketwatch.com                 │   │
│  │ Real-time stock quotes...       │   │
│  └─────────────────────────────────┘   │
│                                         │
│  ... more results                       │
│                                         │
└─────────────────────────────────────────┘
```

### Result Card Components

```typescript
// Web result card
interface WebResultCardProps {
  result: SerperWebResult;
  onClick?: () => void;
}

// Image result card (grid layout)
interface ImageResultCardProps {
  result: SerperImageResult;
  onClick?: () => void; // Opens lightbox or source
}

// Video result card
interface VideoResultCardProps {
  result: SerperVideoResult;
  onClick?: () => void; // Opens video player/source
}
```

---

## Hook: useSearch

```typescript
// src/hooks/useSearch.ts

interface UseSearchReturn {
  // State
  results: SearchResults | null;
  isLoading: boolean;
  error: string | null;
  query: string | null;

  // Tab state
  activeTab: "web" | "images" | "videos";
  setActiveTab: (tab: "web" | "images" | "videos") => void;

  // Actions
  clearResults: () => void;
}

export function useSearch(roomId: string): UseSearchReturn {
  // Subscribe to search:started, search:results, search:error events
  // Manage local state for results and loading
  // Return state and actions
}
```

---

## Room Page Integration

### Layout with SearchPanel

```tsx
// In room/[roomId]/page.tsx

<div className="flex h-screen">
  {/* Main room area */}
  <div className="flex-1">
    <RoomHeader />
    <ParticipantGrid />
    <RoomControls />
  </div>

  {/* Side panels */}
  <div className="w-80 flex flex-col">
    {/* Transcript panel - always visible */}
    <TranscriptPanel className="flex-1" />

    {/* Search panel - appears when results available */}
    {searchResults && (
      <SearchPanel
        results={searchResults}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onClose={clearSearch}
        className="flex-1"
      />
    )}
  </div>
</div>
```

### Mobile Layout

On mobile, SearchPanel appears as a bottom sheet overlay (similar to TranscriptPanel mobile behavior).

---

## Environment Variables

Add to `.env`:

```bash
# Serper API Configuration
SERPER_API_KEY=your_serper_api_key_here
```

---

## Error Handling

### Serper API Errors

| Error            | Handling                            |
| ---------------- | ----------------------------------- |
| 401 Unauthorized | Log error, notify user, don't retry |
| 429 Rate Limited | Exponential backoff, max 3 retries  |
| 500 Server Error | Retry once, then fail gracefully    |
| Network Error    | Retry with timeout, fail gracefully |

### Graceful Degradation

```typescript
try {
  const results = await serperService.search(query, searchType);
  broadcastResults(roomId, results);
} catch (error) {
  // Send error to clients
  socket.to(roomId).emit("search:error", {
    query,
    error: "Search temporarily unavailable",
  });

  // Still let AI respond without results
  sendFunctionOutput(callId, { error: "Search failed" });
  triggerResponse();
}
```

---

## Testing Strategy

### Unit Tests

- SerperService: Mock HTTP responses, test parsing
- OpenAI function call detection: Mock WebSocket events
- useSearch hook: Test state transitions

### Integration Tests

- End-to-end function call flow with mocked APIs
- Socket.io event broadcasting
- UI rendering with sample data

### Manual Testing

- Speak various search phrases to test intent detection
- Verify results appear in correct tabs
- Test mobile layout and interactions

---

## Feature Dependencies

```
FEAT-600 (types) ──────────────┐
                               │
FEAT-601 (serper-service) ─────┼──► FEAT-602 (function-calling)
                               │           │
FEAT-300 (ai-orchestrator) ────┘           │
                                           ▼
FEAT-603 (socket-events) ◄─────────────────┤
         │                                 │
         ▼                                 │
FEAT-604 (useSearch) ──────────────────────┤
         │                                 │
         ▼                                 │
FEAT-605 (SearchPanel) ◄───────────────────┤
         │                                 │
         ▼                                 │
FEAT-606 (ResultCards) ────────────────────┤
         │                                 │
         ▼                                 │
FEAT-607 (room-integration) ◄──────────────┘
```

---

## Implementation Order

1. **FEAT-600**: Define TypeScript types for search results
2. **FEAT-601**: Implement SerperService with API integration
3. **FEAT-602**: Add function calling to OpenAIRealtimeClient
4. **FEAT-603**: Add Socket.io search events
5. **FEAT-604**: Create useSearch hook
6. **FEAT-605**: Build SearchPanel component
7. **FEAT-606**: Build result card components
8. **FEAT-607**: Integrate into room page

---

## Security Considerations

- **API Key Protection**: SERPER_API_KEY only used server-side
- **Rate Limiting**: Implement per-room rate limiting for searches
- **Content Filtering**: Consider filtering adult content in results
- **URL Validation**: Sanitize URLs before rendering as links

---

## Future Enhancements

- **Search History**: Track recent searches per room
- **Persistent Results**: Save search results to transcript
- **Custom Triggers**: Configure custom trigger phrases per room
- **Result Sharing**: Allow copying/sharing specific results
- **Deep Links**: Open results in new tab with tracking

---

## References

- [OpenAI Realtime API Documentation](https://platform.openai.com/docs/guides/realtime)
- [OpenAI Function Calling Guide](https://platform.openai.com/docs/guides/function-calling)
- [Serper API Documentation](https://serper.dev/docs)
- [Function Calling with Realtime API Tutorial](https://developer.mamezou-tech.com/en/blogs/2024/10/09/openai-realtime-api-function-calling/)
