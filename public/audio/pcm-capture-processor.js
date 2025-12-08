/**
 * PCM Capture AudioWorklet Processor
 *
 * Captures audio from microphone and converts to PCM16 for streaming.
 * Replaces deprecated ScriptProcessorNode for better performance.
 */
class PCMCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.bufferSize = 4096; // ~170ms at 24kHz
    this.buffer = new Float32Array(this.bufferSize);
    this.bufferIndex = 0;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (!input || !input[0]) return true;

    const inputChannel = input[0];

    // Accumulate samples until we have a full buffer
    for (let i = 0; i < inputChannel.length; i++) {
      this.buffer[this.bufferIndex++] = inputChannel[i];

      if (this.bufferIndex >= this.bufferSize) {
        // Convert Float32 to PCM16
        const pcm16 = new Int16Array(this.bufferSize);
        for (let j = 0; j < this.bufferSize; j++) {
          const s = Math.max(-1, Math.min(1, this.buffer[j]));
          pcm16[j] = s < 0 ? s * 0x8000 : s * 0x7fff;
        }

        // Send to main thread
        this.port.postMessage(
          {
            type: "audio",
            pcm16: pcm16.buffer,
          },
          [pcm16.buffer],
        );

        // Reset buffer
        this.bufferIndex = 0;
        this.buffer = new Float32Array(this.bufferSize);
      }
    }

    return true;
  }
}

registerProcessor("pcm-capture-processor", PCMCaptureProcessor);
