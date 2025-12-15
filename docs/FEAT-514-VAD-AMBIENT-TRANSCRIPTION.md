# FEAT-514: Voice Activity Detection (VAD) for Ambient Transcription

> **Status**: Planning
> **Created**: 2024-12-10
> **Feature ID**: FEAT-514
> **Parent Feature**: FEAT-502 (Ambient Transcription)
> **Priority**: Critical (Bug Fix / Re-architecture)

---

## Problem Statement

The current ambient transcription implementation (useAmbientTranscription.ts) has a fundamental architectural flaw:

### Current Behavior (Broken)

```
Web Speech API starts → Silence detected → API auto-ends → Restart loop triggered
                                                              ↓
                              [AmbientTranscription] Started
                              [AmbientTranscription] Auto-restarted after end
                              [AmbientTranscription] Started
                              [AmbientTranscription] Auto-restarted after end
                              ... (infinite loop)
```

### Root Cause

The Web Speech API is designed to auto-stop after silence. The current code fights this by auto-restarting, but:

1. **Silence is the normal state** - In a meeting, each participant speaks only ~10-20% of the time
2. **Restart-on-end is fighting browser behavior** - Creates a loop when no speech is detected
3. **No Voice Activity Detection (VAD)** - The code doesn't know when actual speech begins

### Impact

- Rapid CPU usage from restart loops
- Console spam with "[AmbientTranscription] Started/Auto-restarted" messages
- Battery drain on mobile devices
- No user-facing control to restart after the loop fails

---

## Existing VAD Implementations (Leverage These!)

The project already has **two VAD implementations** we can reuse:

### 1. Silero VAD (`@ricky0123/vad-web`)

**Location:** `src/hooks/useSwensyncRealtime.ts` (lines 343-432)

```typescript
// Already configured for fast turn detection:
positiveSpeechThreshold: 0.6,
negativeSpeechThreshold: 0.35,
redemptionMs: 200,  // Only 200ms silence before triggering end
minSpeechMs: 150,   // Minimum speech duration
model: "v5",        // Latest Silero model
```

**Pros:**

- Neural network-based (more accurate than RMS)
- Already integrated with @ricky0123/vad-web
- Configurable speech/silence thresholds
- Callbacks for onSpeechStart/onSpeechEnd

**Cons:**

- Requires ONNX WASM loading (~2MB)
- Slightly higher CPU than RMS

### 2. SpeakingDetector (RMS-based)

**Location:** `src/lib/audio/speaking-detector.ts`

```typescript
// Simple threshold-based detection:
speakingThreshold: 0.01,
silenceThreshold: 0.005,
silenceDebounceMs: 300,
analyzeIntervalMs: 50,
```

**Pros:**

- Lightweight (no WASM)
- Already used for multi-peer speaking indicators
- Simple and fast

**Cons:**

- Less accurate than neural VAD
- May trigger on background noise

---

## Proposed Solution: VAD-Gated Speech Recognition

Instead of fighting the Web Speech API's auto-stop behavior, **embrace it**:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         VAD-Gated Architecture                          │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  User's Microphone                                                       │
│        │                                                                 │
│        ▼                                                                 │
│  ┌──────────────┐                                                        │
│  │ AudioContext │  (Always running, low overhead)                        │
│  │ AnalyserNode │                                                        │
│  └──────┬───────┘                                                        │
│         │                                                                │
│         ▼                                                                │
│  ┌──────────────────────┐         ┌─────────────────────────────────┐   │
│  │ Voice Activity       │ ──YES──▶│ Web Speech API                  │   │
│  │ Detector (VAD)       │         │ (Start recognition)             │   │
│  │                      │         │                                 │   │
│  │ Threshold: -50dB     │         │ onresult → send to server       │   │
│  │ Debounce: 300ms      │         │ onend → stop (don't restart)    │   │
│  └──────────────────────┘         └─────────────────────────────────┘   │
│         │                                                                │
│         │ NO (silence)                                                   │
│         ▼                                                                │
│  ┌──────────────────────┐                                               │
│  │ Keep monitoring      │                                               │
│  │ (VAD stays active)   │                                               │
│  └──────────────────────┘                                               │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### Key Principles

1. **VAD is always running** - Uses AudioContext + AnalyserNode (very low CPU)
2. **Speech Recognition only when voice detected** - Start Web Speech API on voice activity
3. **Let it end naturally** - When speech stops, let the API end without restarting
4. **VAD triggers next recognition** - When voice is detected again, start a new recognition session

---

## Technical Design

### New Hook: useVoiceActivityDetection

```typescript
interface UseVADOptions {
  /** Audio stream to monitor */
  stream: MediaStream | null;
  /** Volume threshold in dB (default: -50) */
  threshold?: number;
  /** Debounce time in ms (default: 300) */
  debounceMs?: number;
  /** Enabled flag */
  enabled?: boolean;
}

interface UseVADReturn {
  /** Whether voice activity is currently detected */
  isVoiceActive: boolean;
  /** Current volume level in dB */
  volumeDb: number;
  /** Whether VAD is running */
  isMonitoring: boolean;
}
```

### Modified useAmbientTranscription Architecture

```typescript
export function useAmbientTranscription(
  options: UseAmbientTranscriptionOptions,
) {
  // ... existing options ...

  // NEW: Get local audio stream for VAD monitoring
  const localStream = useLocalAudioStream();

  // NEW: Voice Activity Detection
  const vad = useVoiceActivityDetection({
    stream: localStream,
    threshold: -50, // dB
    debounceMs: 300,
    enabled: enabled && !isPTTActive && !isAISpeaking,
  });

  // Speech recognition state
  const [isRecognizing, setIsRecognizing] = useState(false);

  // START recognition when voice detected
  useEffect(() => {
    if (vad.isVoiceActive && !isRecognizing && !isPTTActive && !isAISpeaking) {
      startRecognition();
    }
  }, [vad.isVoiceActive, isRecognizing, isPTTActive, isAISpeaking]);

  // Handle recognition end - DO NOT AUTO-RESTART
  const handleEnd = useCallback(() => {
    setIsRecognizing(false);
    // VAD will trigger next recognition when voice is detected again
  }, []);

  // ...
}
```

### State Machine

```
┌────────────────────────────────────────────────────────────────────┐
│                     Ambient Transcription States                    │
├────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────┐                      ┌─────────────────────────┐  │
│  │   IDLE      │◀─────────────────────│   PAUSED               │  │
│  │             │                      │ (PTT/AI speaking)       │  │
│  │ VAD active  │      PTT start or    │                         │  │
│  │ Recognition │      AI speaking     │ VAD inactive            │  │
│  │ stopped     │─────────────────────▶│ Recognition stopped     │  │
│  └──────┬──────┘                      └───────────┬─────────────┘  │
│         │                                         │                │
│         │ Voice detected                          │ PTT end AND    │
│         │ (VAD threshold)                         │ AI idle        │
│         ▼                                         │                │
│  ┌─────────────┐                                  │                │
│  │ RECOGNIZING │◀─────────────────────────────────┘                │
│  │             │                                                   │
│  │ VAD active  │                                                   │
│  │ Web Speech  │                                                   │
│  │ API running │                                                   │
│  └──────┬──────┘                                                   │
│         │                                                          │
│         │ onend (natural end                                       │
│         │ after silence)                                           │
│         ▼                                                          │
│  ┌─────────────┐                                                   │
│  │   IDLE      │  (back to monitoring with VAD)                    │
│  └─────────────┘                                                   │
│                                                                     │
└────────────────────────────────────────────────────────────────────┘
```

---

## Implementation Plan

### Recommendation: Use Silero VAD

Given the existing code, **Silero VAD is the better choice** because:

1. Already proven in production (useSwensyncRealtime)
2. Neural network accuracy reduces false positives
3. Configurable redemptionMs allows tuning for ambient transcription

### Note: Different Use Case from useSwensyncRealtime

In `useSwensyncRealtime`, there's a **race condition by design** where:

- **Client VAD** detects speech end locally (200ms redemption)
- **Server VAD** detects speech end remotely (350ms silence)
- Client VAD sends `input_audio_buffer.commit` to trigger faster response
- Whichever detects first "wins" for lower latency

For **ambient transcription**, we don't need this race. The pattern is simpler:

- **VAD** gates when to start/stop Web Speech API
- **No server involvement** - Web Speech API runs entirely client-side
- **No commit signals** - We just let recognition run until natural end

```
┌──────────────────────────────────────────────────────────────┐
│                   useSwensyncRealtime (PTT)                  │
├──────────────────────────────────────────────────────────────┤
│  Client VAD ──┬── commit signal ──► OpenAI Server VAD       │
│               │   (race for faster)                          │
│               └── Both detect speech end                     │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│              useAmbientTranscription (NEW)                   │
├──────────────────────────────────────────────────────────────┤
│  Silero VAD ─── gates ──► Web Speech API (browser-local)    │
│               │                                              │
│               └── onSpeechStart → start recognition         │
│                   onSpeechEnd → (let it end naturally)      │
└──────────────────────────────────────────────────────────────┘
```

### Task 1: Extract Silero VAD into Reusable Hook

**File:** `src/hooks/useSileroVAD.ts` (NEW - extracted from useSwensyncRealtime)

**Steps:**

1. Extract MicVAD initialization logic from useSwensyncRealtime
2. Create standalone hook with configurable thresholds
3. Expose: isVoiceActive, isSpeechStart (event), isSpeechEnd (event)
4. Handle stream lifecycle (start/stop/destroy)
5. Lazy-load WASM to avoid blocking initial render

```typescript
interface UseSileroVADOptions {
  stream: MediaStream | null;
  enabled?: boolean;
  positiveSpeechThreshold?: number; // default: 0.6
  negativeSpeechThreshold?: number; // default: 0.35
  redemptionMs?: number; // default: 500 (longer for ambient)
  minSpeechMs?: number; // default: 150
  onSpeechStart?: () => void;
  onSpeechEnd?: () => void;
}

interface UseSileroVADReturn {
  isVoiceActive: boolean;
  isLoading: boolean;
  error: string | null;
}
```

**Test File:** `tests/unit/hooks/useSileroVAD.test.ts`

### Task 2: Refactor useAmbientTranscription to Use Silero VAD

**File:** `src/hooks/useAmbientTranscription.ts` (MODIFY)

**Changes:**

1. **Remove** auto-restart logic entirely (handleEnd becomes a no-op)
2. **Remove** exponential backoff refs (no longer needed)
3. **Add** useSileroVAD integration
4. **Start** recognition only on `onSpeechStart` callback
5. **Let** recognition end naturally (no restart on `onend`)
6. **VAD** continues monitoring for next speech segment

**Key Logic Change:**

```typescript
// OLD (broken):
const handleEnd = useCallback(() => {
  // Complex restart logic with exponential backoff
  restartTimeoutRef.current = setTimeout(() => {
    recognitionRef.current.start(); // This causes the loop!
  }, backoffDelay);
}, []);

// NEW (VAD-gated):
const handleEnd = useCallback(() => {
  isRecognizingRef.current = false;
  setIsActive(false);
  // No restart - VAD will trigger next recognition when voice detected
  console.log("[AmbientTranscription] Recognition ended, waiting for VAD");
}, []);

// VAD callback triggers new recognition
const handleSpeechStart = useCallback(() => {
  if (!isRecognizingRef.current && shouldBeActiveRef.current) {
    recognitionRef.current?.start();
    isRecognizingRef.current = true;
    console.log("[AmbientTranscription] VAD triggered recognition start");
  }
}, []);
```

**Test File:** `tests/unit/hooks/useAmbientTranscription.test.ts` (UPDATE)

### Task 3: Update Room Page to Pass Audio Stream

**File:** `src/app/rooms/[roomId]/page.tsx` (MODIFY)

**Steps:**

1. Get local audio stream from useRoomAudio or useRoomPeers
2. Pass stream to useAmbientTranscription
3. Handle stream unavailable gracefully (fallback to disabled state)

### Task 4: Add UI Indicator for Transcription State

**File:** `src/components/room/TranscriptPanel.tsx` (MODIFY - not new file)

**Steps:**

1. Add small indicator showing ambient transcription state
2. States: "Listening" (VAD active), "Transcribing" (recognition active), "Paused"
3. Tooltip explains the state
4. No user action needed - fully automatic

---

## Acceptance Criteria

### Functional Requirements

- [ ] VAD continuously monitors local audio with <1% CPU overhead
- [ ] Speech recognition starts within 200ms of voice detection
- [ ] Recognition ends naturally without restart loops
- [ ] No console spam from restart attempts
- [ ] Transcription pauses during PTT and AI speaking
- [ ] Transcription resumes automatically when PTT/AI ends

### Performance Requirements

- [ ] VAD overhead < 1% CPU when idle
- [ ] No memory leaks from AudioContext
- [ ] Battery efficient on mobile devices

### User Experience

- [ ] User sees when transcription is active vs monitoring
- [ ] No manual intervention needed to restart transcription
- [ ] Transcription works reliably across long meeting sessions

---

## Out of Scope

- Server-side VAD (we use client-side for zero latency)
- Wake word detection (different feature)
- Noise gate / noise suppression (handled by browser)

---

## Dependencies

- FEAT-502 (current ambient transcription implementation)
- Room page local audio stream access

---

## Risk Assessment

### Low Risk

- VAD is a well-established pattern
- AudioContext is highly optimized in browsers
- No server-side changes required

### Medium Risk

- Different browsers may have different AudioContext behaviors
- Mobile browsers may have power saving that affects monitoring

### Mitigation

- Test across Chrome, Safari, Firefox
- Add fallback for browsers without AudioContext support
- Consider visibility API to pause VAD when tab is hidden
