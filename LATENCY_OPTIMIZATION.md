# sync Latency Optimization

This document details the latency optimization strategies implemented in sync to achieve the fastest possible voice-to-voice AI response times.

## Problem Statement

Voice AI latency consists of several components:

```
Total Latency = Turn Detection + Network + Model Processing + Audio Streaming
```

The component we have the most control over is **Turn Detection** - the time it takes to determine that the user has stopped speaking and trigger the AI response.

### Baseline Latency Sources

| Source                       | Typical Latency | Controllable? |
| ---------------------------- | --------------- | ------------- |
| Server VAD silence detection | 500ms           | ✅ Yes        |
| Server VAD prefix padding    | 300ms           | ✅ Yes        |
| Network round-trip           | 50-150ms        | ❌ Limited    |
| OpenAI model processing      | 200-400ms       | ❌ No         |
| Audio streaming start        | 50-100ms        | ❌ Limited    |

## Solution Architecture

We implemented a **dual-VAD architecture** that runs client-side Silero VAD in parallel with OpenAI's server-side VAD. The client VAD detects speech end faster and sends an early commit signal.

```
┌─────────────────────────────────────────────────────────────────┐
│                         User Speaking                            │
└─────────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┴───────────────┐
              ▼                               ▼
┌─────────────────────────┐     ┌─────────────────────────┐
│   Client-Side VAD       │     │   Server-Side VAD       │
│   (Silero v5 WASM)      │     │   (OpenAI server_vad)   │
│                         │     │                         │
│   redemptionMs: 200ms   │     │   silence_duration: 350ms│
│   Runs locally          │     │   Runs on OpenAI        │
└───────────┬─────────────┘     └───────────┬─────────────┘
            │                               │
            │ ~100ms faster                 │
            ▼                               ▼
┌─────────────────────────┐     ┌─────────────────────────┐
│ input_audio_buffer.commit│     │ Automatic turn end      │
│ (Early trigger)         │     │ (Standard behavior)     │
└───────────┬─────────────┘     └───────────┴─────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────────────────┐
│              OpenAI Starts Processing Immediately                │
│              (Whichever signal arrives first wins)               │
└─────────────────────────────────────────────────────────────────┘
```

## Implementation Details

### 1. Server VAD Parameter Tuning

**File:** `src/hooks/usesyncRealtime.ts` (lines 503-508)

```typescript
turn_detection: {
  type: 'server_vad',
  threshold: 0.5,
  prefix_padding_ms: 200,    // Reduced from 300ms
  silence_duration_ms: 350,  // Reduced from 500ms
}
```

| Parameter             | Before | After | Impact         |
| --------------------- | ------ | ----- | -------------- |
| `prefix_padding_ms`   | 300ms  | 200ms | -100ms latency |
| `silence_duration_ms` | 500ms  | 350ms | -150ms latency |

**Trade-offs:**

- Lower `silence_duration_ms` may cut off users who pause mid-sentence
- Lower `prefix_padding_ms` may miss the start of speech in some edge cases

### 2. Client-Side Silero VAD

**Package:** `@ricky0123/vad-web` (Silero VAD v5 via ONNX Runtime Web)

**File:** `src/hooks/usesyncRealtime.ts` (lines 332-425)

```typescript
const vad = await MicVAD.new({
  // Reuse existing microphone stream
  getStream: async () => stream,
  pauseStream: async () => {},
  resumeStream: async () => stream,

  // Aggressive settings for fast detection
  positiveSpeechThreshold: 0.6,
  negativeSpeechThreshold: 0.35,
  redemptionMs: 200, // KEY: 150ms faster than server
  preSpeechPadMs: 0, // We don't need the audio
  minSpeechMs: 150, // Avoid false positives

  model: "v5", // Latest Silero model

  onSpeechEnd: () => {
    sendCommitSignal(); // Trigger OpenAI immediately
  },
});
```

### 3. Early Commit Signal

**File:** `src/hooks/usesyncRealtime.ts` (lines 316-326)

When client VAD detects speech end, we immediately send:

```typescript
const commitMsg = {
  type: "input_audio_buffer.commit",
};
dataChannel.send(JSON.stringify(commitMsg));
```

This tells OpenAI: "The user is done speaking, start processing now" - before the server VAD would have detected it.

## Configuration

### Enabling/Disabling Client VAD

Client VAD is **enabled by default**. To disable:

```typescript
const sync = usesyncRealtime({
  userName: "John",
  useClientVAD: false, // Disable client-side VAD
});
```

### Tuning Parameters

For different use cases, adjust these values in `initializeClientVAD`:

| Parameter                 | Conservative | Balanced (Default) | Aggressive |
| ------------------------- | ------------ | ------------------ | ---------- |
| `positiveSpeechThreshold` | 0.7          | 0.6                | 0.5        |
| `negativeSpeechThreshold` | 0.45         | 0.35               | 0.25       |
| `redemptionMs`            | 400          | 200                | 150        |
| `minSpeechMs`             | 250          | 150                | 100        |

**Conservative:** Better for noisy environments, fewer false triggers
**Aggressive:** Faster response, risk of cutting off speech

## Expected Performance Gains

| Optimization                             | Latency Reduction |
| ---------------------------------------- | ----------------- |
| `prefix_padding_ms` 300→200              | ~100ms            |
| `silence_duration_ms` 500→350            | ~150ms            |
| Client VAD early commit (200ms vs 350ms) | ~150ms            |
| **Total Expected Improvement**           | **~350-400ms**    |

### Benchmark Expectations

| Scenario                    | Before      | After     |
| --------------------------- | ----------- | --------- |
| Short utterance (1-2 words) | 800-1000ms  | 450-600ms |
| Medium utterance (sentence) | 900-1200ms  | 550-750ms |
| Long utterance (paragraph)  | 1000-1400ms | 650-900ms |

## Latency Measurement

The stopwatch measures **true system latency** - the time from when the user stops speaking until the first audio byte is received from OpenAI.

```
Latency = (End of User Speech) → (First Audio Byte)
```

**What's measured:**

- Server VAD processing time (or client VAD commit signal)
- Network round-trip to OpenAI
- Model processing time
- First audio chunk generation

**What's NOT measured:**

- User speech duration (how long they talked)
- Audio playback time

This gives you an accurate picture of system responsiveness, independent of utterance length.

## Console Logging

Monitor these log messages to verify operation:

```
[sync] Initializing client-side Silero VAD...
[sync] Client VAD initialized and running
[sync] Client VAD: Speech started
[sync] Client VAD: Speech ended (1234ms) - sending commit
[sync] Client VAD: Sent commit signal (local speech end detected)
```

If you see "Misfire" logs frequently, consider raising `minSpeechMs`:

```
[sync] Client VAD: Misfire (too short)
```

## Dependencies

```json
{
  "@ricky0123/vad-web": "^0.0.30"
}
```

This package includes:

- Silero VAD v5 ONNX model (~1.5MB)
- ONNX Runtime Web (WASM)
- AudioWorklet processor

### Static Asset Configuration

The ONNX model and WASM files are served from the `/public/vad/` directory to avoid CDN dependencies and Next.js bundling issues.

**Required files in `/public/vad/`:**

```
public/vad/
├── silero_vad_v5.onnx          # Silero VAD v5 model (~2.3MB)
├── silero_vad_legacy.onnx      # Silero VAD legacy model (~1.8MB)
├── vad.worklet.bundle.min.js   # AudioWorklet processor (~2.5KB)
├── ort-wasm-simd-threaded.mjs  # ONNX Runtime loader (~20KB)
└── ort-wasm-simd-threaded.wasm # ONNX Runtime WASM (~12MB)
```

**To copy files after npm install:**

```bash
mkdir -p public/vad
cp node_modules/@ricky0123/vad-web/dist/silero_vad_v5.onnx public/vad/
cp node_modules/@ricky0123/vad-web/dist/silero_vad_legacy.onnx public/vad/
cp node_modules/@ricky0123/vad-web/dist/vad.worklet.bundle.min.js public/vad/
cp node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.mjs public/vad/
cp node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm public/vad/
```

**Important:** When upgrading `@ricky0123/vad-web`, re-copy these files. Check versions with:

```bash
npm list @ricky0123/vad-web onnxruntime-web
```

## Browser Compatibility

| Browser       | Support                          |
| ------------- | -------------------------------- |
| Chrome 91+    | ✅ Full                          |
| Firefox 89+   | ✅ Full                          |
| Safari 15.4+  | ✅ Full                          |
| Edge 91+      | ✅ Full                          |
| Mobile Chrome | ✅ Full                          |
| Mobile Safari | ⚠️ Limited (AudioWorklet issues) |

## Suggested Next Steps

### Short-term Improvements

1. **Adaptive VAD Thresholds**
   - Detect ambient noise levels and adjust thresholds dynamically
   - Lower thresholds in quiet environments, raise in noisy ones

2. **Latency Analytics Dashboard**
   - Track P50/P95/P99 latencies over time
   - Identify patterns (time of day, session length, etc.)

3. **A/B Testing Framework**
   - Compare different VAD configurations
   - Measure user satisfaction vs. interruption rate

### Medium-term Improvements

4. **AudioWorklet Sample Rate Optimization**
   - Add 48kHz → 24kHz downsampling in browser
   - Reduces bandwidth and matches OpenAI's preferred format
   - Expected gain: 30-50ms

5. **Speculative Response Caching**
   - Pre-generate common greetings/responses
   - Play cached audio while real response loads
   - Expected gain: 200-400ms for predictable flows

6. **WebSocket Fallback**
   - Some networks have WebRTC issues
   - WebSocket can have lower overhead in certain scenarios

### Long-term Research

7. **Custom VAD Model**
   - Train a smaller, faster VAD optimized for voice AI turn-taking
   - Target: sub-100ms detection with <5% false positive rate

8. **Predictive Turn Detection**
   - Use prosody/intonation to predict turn completion
   - Start processing before user fully stops speaking

9. **Streaming Transcription Hybrid**
   - Run Whisper locally for real-time transcription
   - Detect semantic completeness ("thanks" = done, "and..." = continuing)

## Troubleshooting

### Client VAD Not Initializing

Check console for:

```
[sync] Failed to initialize client VAD: [error]
```

Common causes:

- WASM not loading (CORS issues with ONNX files)
- AudioContext blocked by browser policy
- Microphone permission denied

### High False Positive Rate

Symptoms: AI interrupts user frequently

Solutions:

1. Increase `minSpeechMs` (try 200-300ms)
2. Increase `redemptionMs` (try 350-400ms)
3. Raise `positiveSpeechThreshold` (try 0.7)

### Latency Not Improving

Check if commit signal is being sent:

```
[sync] Client VAD: Sent commit signal
```

If not appearing, client VAD may not be detecting speech properly. Check:

- Microphone levels
- Background noise
- Threshold settings

## References

- [OpenAI Realtime API Documentation](https://platform.openai.com/docs/guides/realtime)
- [Silero VAD GitHub](https://github.com/snakers4/silero-vad)
- [@ricky0123/vad-web Documentation](https://docs.vad.ricky0123.com/)
- [WebRTC Audio Processing](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)
