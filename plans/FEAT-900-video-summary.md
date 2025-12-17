# Feature Plan: Voice-Activated Video Summary (Phase 9)

> **Long-Horizon Engineering Protocol - Feature Plan**
> Created: 2025-12-17
> Phase: 9 - Video Intelligence
> Status: PLANNING

---

## Executive Summary

Implement dual-mode voice commands for video intelligence during shared YouTube viewing:

1. **Default Mode** (~1-2s): Quick conversational summary using YouTube metadata + LLM
   - Triggers: "What are we watching?", "What is this video?", "Quick summary"

2. **Deep Mode** (~3-10s): Comprehensive transcript-based analysis with key topics
   - Triggers: "Analyze this video", "Deep dive", "What topics are covered?"

This enhances the real-time shared viewing experience by enabling participants to get context without pausing the video, with different depth levels based on intent.

---

## Technical Approach

### Recommended Architecture: **Dual-Mode Video Intelligence**

```
┌─────────────────────────────────────────────────────────────────┐
│                   DUAL-MODE VIDEO SUMMARY FLOW                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  User Voice Command                                              │
│         │                                                        │
│         ▼                                                        │
│  ┌─────────────────────────────────────────────┐                │
│  │  OpenAI Realtime API Function Call          │                │
│  │  Tool: getVideoSummary                      │                │
│  │  Parameters: { mode: 'default' | 'deep' }   │                │
│  └──────────────────┬──────────────────────────┘                │
│                     │                                            │
│         ┌───────────┴───────────┐                               │
│         ▼                       ▼                               │
│  ┌─────────────┐         ┌─────────────┐                        │
│  │ DEFAULT MODE│         │  DEEP MODE  │                        │
│  │  (~1-2s)    │         │  (~3-10s)   │                        │
│  └──────┬──────┘         └──────┬──────┘                        │
│         │                       │                               │
│         ▼                       ▼                               │
│  ┌─────────────┐         ┌─────────────┐                        │
│  │ YouTube API │         │  Transcript │                        │
│  │ (metadata)  │         │  Fetch      │                        │
│  └──────┬──────┘         └──────┬──────┘                        │
│         │                       │                               │
│         ▼                       ▼                               │
│  ┌─────────────┐         ┌─────────────┐                        │
│  │ gpt-4o-mini │         │ gpt-4o-mini │                        │
│  │ Quick Sum   │         │ Deep Analyze│                        │
│  └──────┬──────┘         └──────┬──────┘                        │
│         │                       │                               │
│         └───────────┬───────────┘                               │
│                     ▼                                            │
│  ┌─────────────────────────────────────────────┐                │
│  │  AI Speaks Summary to Room                   │                │
│  │  (Synchronized broadcast to all peers)       │                │
│  └─────────────────────────────────────────────┘                │
│                                                                  │
│  Fallback: Deep mode → Default if no transcript available       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Latency Targets

| Mode                    | Target Latency | Quality                  |
| ----------------------- | -------------- | ------------------------ |
| Fast (YouTube API only) | < 500ms        | Basic metadata summary   |
| Enhanced (API + LLM)    | 1-2 seconds    | Conversational, natural  |
| Deep (with transcript)  | 3-10 seconds   | Content-aware (optional) |

---

## Feature Breakdown

### FEAT-900: YouTube Data API Service

**Phase**: 9 | **Category**: api | **Priority**: critical

Create server-side YouTube Data API integration for video metadata retrieval.

**Steps:**

1. Create `src/server/signaling/youtube-service.ts`
2. Implement `getVideoMetadata(videoId)` method using YouTube Data API v3
3. Parse and type response with `YouTubeVideoMetadata` interface
4. Handle API errors, rate limits, and invalid video IDs
5. Add response caching (15-minute TTL) to reduce API calls
6. Add environment variable `YOUTUBE_API_KEY` to configuration

**Test File**: `tests/unit/api/youtube-service.test.ts`
**Dependencies**: []

---

### FEAT-901: Video Summary Types

**Phase**: 9 | **Category**: types | **Priority**: critical

Define TypeScript types for video summary functionality.

**Steps:**

1. Create `src/types/video-summary.ts` with `YouTubeVideoMetadata` interface
2. Define `VideoSummaryRequest` interface for function call parameters
3. Define `VideoSummaryResponse` interface with structured summary
4. Define `SummaryMode` enum (fast, enhanced, deep)
5. Add types to central export index

**Test File**: `tests/unit/types/video-summary.test.ts`
**Dependencies**: []

---

### FEAT-902: OpenAI Function Tool for getVideoSummary

**Phase**: 9 | **Category**: ai | **Priority**: critical

Add `getVideoSummary` function tool to OpenAI Realtime API session.

**Steps:**

1. Define `GET_VIDEO_SUMMARY_TOOL` function schema in `openai-realtime-client.ts`
2. Add tool to session.update tools array alongside existing webSearch/playVideo
3. Parameters: `{ mode: 'fast' | 'enhanced' }` (optional, defaults to enhanced)
4. Handle `response.output_item.done` for getVideoSummary function_call type
5. Add to `handleFunctionCall` dispatcher in server.ts

**Test File**: `tests/unit/ai/video-summary-function.test.ts`
**Dependencies**: [FEAT-900, FEAT-901]

---

### FEAT-903: Video Summary Handler

**Phase**: 9 | **Category**: signaling | **Priority**: critical

Implement server-side handler for video summary requests.

**Steps:**

1. Create `handleVideoSummary` function in server.ts
2. Extract current video ID from `roomVideoStates[roomId]`
3. Call `YouTubeService.getVideoMetadata(videoId)`
4. Generate LLM-enhanced summary using gpt-4o-mini (for enhanced mode)
5. Return structured summary for AI voice response
6. Broadcast `video:summary` event to room for optional UI display

**Test File**: `tests/unit/signaling/video-summary-handler.test.ts`
**Dependencies**: [FEAT-900, FEAT-902, FEAT-803]

---

### FEAT-904: LLM Summary Enhancement Service

**Phase**: 9 | **Category**: ai | **Priority**: high

Create service for generating conversational video summaries.

**Steps:**

1. Create `src/server/signaling/summary-llm-service.ts`
2. Implement `generateVideoSummary(metadata: YouTubeVideoMetadata)` method
3. Use gpt-4o-mini with structured prompt for voice-friendly output
4. Format summary to include: title, creator, topic, key points (2-3)
5. Keep response concise (< 100 words) for natural spoken delivery
6. Handle rate limits with fallback to raw metadata

**Prompt Template:**

```
Summarize this video in 2-3 natural sentences for someone watching with friends:

Title: {title}
Channel: {channelTitle}
Description: {description}
Tags: {tags}

Format: Conversational, as if telling a friend what they're about to watch.
Include: Who made it, what it's about, 1-2 key topics.
Keep it under 50 words.
```

**Test File**: `tests/unit/ai/summary-llm-service.test.ts`
**Dependencies**: [FEAT-901]

---

### FEAT-905: Socket.io Video Summary Events

**Phase**: 9 | **Category**: signaling | **Priority**: high

Add Socket.io events for video summary broadcasting.

**Steps:**

1. Add `video:summary` event emission with summary payload
2. Add `video:summary-error` event for error feedback
3. Broadcast summary to all room participants on success
4. Include metadata for optional UI display (thumbnail, duration, etc.)
5. Handle late-joiner state (include last summary in video:state)

**Test File**: `tests/unit/signaling/video-summary-events.test.ts`
**Dependencies**: [FEAT-903, FEAT-104]

---

### FEAT-906: useVideoSummary Hook

**Phase**: 9 | **Category**: hooks | **Priority**: high

Client-side hook for receiving and displaying video summaries.

**Steps:**

1. Create `src/hooks/useVideoSummary.ts`
2. Subscribe to `video:summary` and `video:summary-error` events
3. Manage summary state (current summary, loading, error)
4. Expose `lastSummary` with timestamp for recency display
5. Clear summary on video change or stop

**Test File**: `tests/unit/hooks/useVideoSummary.test.ts`
**Dependencies**: [FEAT-905, FEAT-108]

---

### FEAT-907: YouTube Transcript Service

**Phase**: 9 | **Category**: api | **Priority**: high

Fetch and process YouTube video transcripts for deep analysis.

**Steps:**

1. Create `src/server/signaling/youtube-transcript-service.ts`
2. Install `youtube-transcript` npm package for caption retrieval
3. Implement `getTranscript(videoId)` method returning timestamped segments
4. Handle videos without captions gracefully (fallback to enhanced mode)
5. Implement `getTranscriptText(videoId)` for plain text concatenation
6. Add language detection and preference handling
7. Cache transcripts with 1-hour TTL

**Test File**: `tests/unit/api/youtube-transcript-service.test.ts`
**Dependencies**: [FEAT-901]

---

### FEAT-908: Deep Analysis LLM Service

**Phase**: 9 | **Category**: ai | **Priority**: high

Generate comprehensive transcript-based video analysis.

**Steps:**

1. Create `src/server/signaling/deep-analysis-service.ts`
2. Implement `analyzeTranscript(transcript, metadata)` method
3. Use gpt-4o-mini with structured prompt for deep analysis
4. Extract: main topics, key points, speaker insights, timestamps
5. Format response for natural spoken delivery (still concise, ~150 words max)
6. Handle long transcripts with chunking/summarization
7. Graceful fallback if transcript unavailable

**Prompt Template:**

```
Analyze this video transcript and provide a comprehensive summary:

Title: {title}
Channel: {channelTitle}
Transcript: {transcriptText}

Provide:
1. Main topic (1 sentence)
2. Key points covered (3-4 bullets)
3. Who appears/speaks (if identifiable)
4. Most interesting insight

Keep response under 150 words, conversational for voice delivery.
```

**Test File**: `tests/unit/ai/deep-analysis-service.test.ts`
**Dependencies**: [FEAT-907, FEAT-901]

---

### FEAT-909: Dual-Mode Summary Handler

**Phase**: 9 | **Category**: signaling | **Priority**: critical

Update summary handler to support both default and deep modes.

**Steps:**

1. Update `getVideoSummary` function tool with `mode` parameter (default/deep)
2. Modify `handleVideoSummary` to route based on mode
3. Default mode: YouTube API + LLM enhancement (~1-2s)
4. Deep mode: Fetch transcript + deep analysis (~3-10s)
5. Return structured response with mode indicator
6. Handle graceful fallback (deep → default if no transcript)

**Test File**: `tests/unit/signaling/dual-mode-summary.test.ts`
**Dependencies**: [FEAT-903, FEAT-907, FEAT-908]

---

### FEAT-910: E2E Tests for Voice-Activated Video Summary

**Phase**: 9 | **Category**: e2e | **Priority**: high

End-to-end tests for the complete video summary flow.

**Steps:**

1. Test default mode trigger ("what are we watching") via mocked PTT
2. Test deep mode trigger ("analyze this video") via mocked PTT
3. Test summary appearing in AI voice response
4. Test deep analysis with transcript content
5. Test fallback when transcript unavailable
6. Test error handling for invalid/unavailable videos
7. Test summary when no video is playing

**Test File**: `tests/e2e/video-summary.spec.ts`
**Dependencies**: [FEAT-909]

---

## Environment Configuration

Add to `.env`:

```bash
# YouTube Data API (required for video summaries)
YOUTUBE_API_KEY=your_youtube_api_key_here
```

---

## API Quotas & Costs

### YouTube Data API v3

- **Free tier**: 10,000 units/day
- **Cost per video.list call**: 1 unit
- **Estimated usage**: 100-500 calls/day typical
- **Caching strategy**: 15-minute TTL reduces calls by ~80%

### OpenAI gpt-4o-mini (for enhanced summaries)

- **Input cost**: $0.15/1M tokens
- **Output cost**: $0.60/1M tokens
- **Estimated per-summary**: ~$0.0002
- **Can be disabled** for fast mode (YouTube API only)

---

## Voice Command Triggers

### Default Mode (Enhanced ~1-2s)

Quick conversational summary using YouTube metadata + LLM:

- "What are we watching?"
- "What is this video?"
- "Who made this?"
- "Quick summary"

### Deep Mode (~3-10s)

Transcript-based deep analysis with key topics and timestamps:

- "Analyze this video"
- "Deep dive on this video"
- "What topics are covered?"
- "Give me a detailed breakdown"
- "What are the main points?"

The AI will detect the intent and route to the appropriate handler.

---

## Feature Dependencies Graph

```
FEAT-901 (Types) ──────────────────────────────────────────────────┐
       │                                                           │
       ├──────────────────────┬────────────────────┐               │
       ▼                      ▼                    ▼               │
FEAT-900 (YouTube API)   FEAT-907 (Transcript)   FEAT-904 (LLM)   │
       │                      │                    │               │
       └──────────┬───────────┘                    │               │
                  ▼                                │               │
          FEAT-902 (Function Tool) ◄───────────────┘               │
                  │                                                │
                  ▼                                                │
          FEAT-903 (Default Handler)                               │
                  │                                                │
                  │         FEAT-908 (Deep Analysis) ◄─── FEAT-907 │
                  │                │                               │
                  └───────┬────────┘                               │
                          ▼                                        │
                  FEAT-909 (Dual-Mode Handler)                     │
                          │                                        │
                          ▼                                        │
                  FEAT-905 (Socket Events)                         │
                          │                                        │
                          ▼                                        │
                  FEAT-906 (Hook)                                  │
                          │                                        │
                          ▼                                        │
                  FEAT-910 (E2E Tests)                             │
```

---

## Estimated Implementation Order

Following the Long-Horizon Engineering Protocol (one feature per cycle):

1. **FEAT-901** - Types (foundation)
2. **FEAT-900** - YouTube Data API Service
3. **FEAT-904** - LLM Summary Enhancement Service
4. **FEAT-902** - OpenAI Function Tool
5. **FEAT-903** - Video Summary Handler (default mode)
6. **FEAT-907** - YouTube Transcript Service
7. **FEAT-908** - Deep Analysis LLM Service
8. **FEAT-909** - Dual-Mode Summary Handler
9. **FEAT-905** - Socket.io Events
10. **FEAT-906** - useVideoSummary Hook
11. **FEAT-910** - E2E Tests

**Total Features**: 11
**Estimated Cycles**: 11 (one per feature as per protocol)

---

## Success Criteria

✅ User can say "What are we watching?" for quick summary (~1-2s)
✅ User can say "Analyze this video" for deep transcript analysis (~3-10s)
✅ Default mode includes: title, creator, topic, key points
✅ Deep mode includes: main topics, key points, speaker insights, timestamps
✅ All room participants hear the same synchronized response
✅ Works for any YouTube video in the playlist
✅ Graceful fallback (deep → default) when transcript unavailable
✅ Graceful error handling for unavailable/invalid videos
✅ All tests pass with zero exit code

---

## Design Decisions (Confirmed)

| Decision     | Choice                               | Rationale                            |
| ------------ | ------------------------------------ | ------------------------------------ |
| Default Mode | Enhanced (API + LLM)                 | ~1-2s latency acceptable for quality |
| Deep Mode    | Transcript-based                     | Distinct voice triggers for intent   |
| UI Card      | Voice-only (no UI)                   | Keeps interface clean, audio-first   |
| Caching      | Yes (15min metadata, 1hr transcript) | Reduces API calls and latency        |

---

## Protocol Compliance Checklist

- [ ] Types defined first (FEAT-901)
- [ ] Each feature has associated test file
- [ ] Features are atomic and independently testable
- [ ] Dependencies explicitly declared
- [ ] Schema follows features_list.json format
- [ ] Progress will be logged to project-progress.md
- [ ] Git commits follow `feat(FEAT-XXX): description` format
