# sync: Latency Innovation for Voice AI

## The Problem: Voice AI Feels Slow

Current voice AI systems suffer from noticeable delays between when a user stops speaking and when they hear a response. This latency—often **800ms to 1.4 seconds**—creates an unnatural, frustrating experience that limits adoption in consumer and enterprise applications.

The delay comes from multiple sources:

| Component                       | Typical Delay |
| ------------------------------- | ------------- |
| Detecting user stopped speaking | 500-800ms     |
| Network round-trip              | 50-150ms      |
| AI model processing             | 200-400ms     |
| Audio streaming startup         | 50-100ms      |

Most of these are controlled by infrastructure providers. However, **turn detection**—knowing when the user finished speaking—is where we've achieved breakthrough improvements.

---

## Our Solution: Dual-VAD Architecture

sync implements a **patented-pending dual voice activity detection (VAD) system** that runs client-side AI in parallel with server-side processing:

```
User Speaks → [Client VAD] → Detects end 150ms faster → Triggers AI immediately
             [Server VAD] → Standard detection (backup)
```

**How it works:**

1. **Client-side Silero VAD** runs locally in the browser using WebAssembly
2. Detects speech-end **150ms faster** than server-side VAD
3. Immediately sends a "commit" signal to start AI processing
4. Server VAD acts as fallback for reliability

This "race condition by design" means the faster detector wins—without sacrificing reliability.

---

## Technical Optimizations Implemented

| Optimization                                     | Latency Saved  |
| ------------------------------------------------ | -------------- |
| Client-side VAD early commit                     | **~150ms**     |
| Reduced server silence threshold (500ms → 350ms) | **~150ms**     |
| Reduced prefix padding (300ms → 200ms)           | **~100ms**     |
| **Total Improvement**                            | **~350-400ms** |

---

## Measured Results

| Scenario      | Industry Standard | sync          |
| ------------- | ----------------- | ------------- |
| Short phrase  | 800-1000ms        | **450-600ms** |
| Full sentence | 900-1200ms        | **550-750ms** |
| Paragraph     | 1000-1400ms       | **650-900ms** |

**We've achieved 35-45% latency reduction** compared to standard implementations—bringing voice AI closer to human conversation speed.

---

## Why This Matters

1. **User Experience**: Sub-600ms response times feel conversational; 1+ second delays feel robotic
2. **Competitive Moat**: Latency optimization requires deep audio engineering expertise—not easily replicated
3. **Platform Agnostic**: Our dual-VAD approach works with any voice AI backend (OpenAI, Google, custom)
4. **Real-time Visibility**: Built-in latency monitoring gives users confidence and us valuable telemetry

---

## Technical Architecture Highlights

- **Native WebRTC**: Direct peer-to-peer audio streaming (no intermediary servers adding latency)
- **Edge AI**: Silero VAD v5 runs entirely in-browser via ONNX Runtime WebAssembly
- **Tunable Parameters**: Configurable sensitivity for different use cases (quiet offices vs. noisy environments)
- **Graceful Degradation**: If client VAD fails, server VAD seamlessly takes over

---

## Future Roadmap

| Phase       | Innovation                                         | Expected Gain       |
| ----------- | -------------------------------------------------- | ------------------- |
| Near-term   | Adaptive thresholds based on ambient noise         | 30-50ms             |
| Medium-term | Predictive turn detection using prosody analysis   | 100-200ms           |
| Long-term   | Custom-trained VAD optimized for conversational AI | Sub-100ms detection |

**Target: Sub-400ms average latency**—indistinguishable from human conversation timing.

---

## Summary

sync has solved one of the hardest problems in voice AI: **making conversations feel instant**. Our dual-VAD architecture delivers measurable, defensible latency improvements that directly translate to better user experience and higher engagement.
