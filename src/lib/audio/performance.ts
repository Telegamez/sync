/**
 * Audio Pipeline Performance Optimization
 *
 * Provides optimizations for the audio processing pipeline:
 * - Object pooling for audio buffers to reduce GC pressure
 * - AudioWorklet processor for low-latency processing
 * - Performance monitoring and metrics collection
 * - Memory-efficient buffer management
 *
 * Part of the Long-Horizon Engineering Protocol - FEAT-406
 */

/**
 * Performance metrics for audio processing
 */
export interface AudioPerformanceMetrics {
  /** Average processing time in ms */
  avgProcessingTime: number;
  /** Maximum processing time in ms */
  maxProcessingTime: number;
  /** Minimum processing time in ms */
  minProcessingTime: number;
  /** Number of samples processed */
  sampleCount: number;
  /** Number of buffer underruns */
  underrunCount: number;
  /** Number of buffer overruns */
  overrunCount: number;
  /** Current buffer utilization (0-1) */
  bufferUtilization: number;
  /** Memory used by audio buffers (bytes) */
  bufferMemoryUsage: number;
  /** Pool hit rate (0-1) */
  poolHitRate: number;
  /** Processing latency in ms */
  latency: number;
  /** Timestamp of last update */
  lastUpdated: Date;
}

/**
 * Buffer pool options
 */
export interface BufferPoolOptions {
  /** Initial number of buffers to pre-allocate */
  initialSize?: number;
  /** Maximum number of buffers in pool */
  maxSize?: number;
  /** Buffer size in samples */
  bufferSize?: number;
  /** Number of channels per buffer */
  channelCount?: number;
}

/**
 * Default buffer pool options
 */
export const DEFAULT_BUFFER_POOL_OPTIONS: Required<BufferPoolOptions> = {
  initialSize: 8,
  maxSize: 32,
  bufferSize: 128,  // Matches AudioWorklet quantum size
  channelCount: 2,  // Stereo
};

/**
 * Pooled audio buffer wrapper
 */
export interface PooledBuffer {
  /** Unique buffer ID */
  id: number;
  /** The actual Float32Array data for each channel */
  channels: Float32Array[];
  /** Whether buffer is currently in use */
  inUse: boolean;
  /** Timestamp when acquired */
  acquiredAt: number | null;
}

/**
 * Audio Buffer Pool
 *
 * Provides object pooling for Float32Array buffers to reduce
 * garbage collection pressure in the audio processing path.
 */
export class AudioBufferPool {
  private pool: PooledBuffer[] = [];
  private nextId: number = 0;
  private bufferSize: number;
  private channelCount: number;
  private maxSize: number;

  // Stats
  private totalAcquired: number = 0;
  private poolHits: number = 0;
  private poolMisses: number = 0;

  constructor(options: BufferPoolOptions = {}) {
    const opts = { ...DEFAULT_BUFFER_POOL_OPTIONS, ...options };
    this.bufferSize = opts.bufferSize;
    this.channelCount = opts.channelCount;
    this.maxSize = opts.maxSize;

    // Pre-allocate initial buffers
    for (let i = 0; i < opts.initialSize; i++) {
      this.pool.push(this.createBuffer());
    }
  }

  /**
   * Acquire a buffer from the pool
   */
  acquire(): PooledBuffer {
    this.totalAcquired++;

    // Try to find an available buffer
    for (const buffer of this.pool) {
      if (!buffer.inUse) {
        buffer.inUse = true;
        buffer.acquiredAt = Date.now();
        this.poolHits++;
        return buffer;
      }
    }

    // No available buffer, create new if under max size
    this.poolMisses++;

    if (this.pool.length < this.maxSize) {
      const buffer = this.createBuffer();
      buffer.inUse = true;
      buffer.acquiredAt = Date.now();
      this.pool.push(buffer);
      return buffer;
    }

    // Pool exhausted, create temporary buffer (not tracked)
    const tempBuffer = this.createBuffer();
    tempBuffer.inUse = true;
    tempBuffer.acquiredAt = Date.now();
    return tempBuffer;
  }

  /**
   * Release a buffer back to the pool
   */
  release(buffer: PooledBuffer): void {
    buffer.inUse = false;
    buffer.acquiredAt = null;

    // Clear buffer data to prevent data leakage
    for (const channel of buffer.channels) {
      channel.fill(0);
    }
  }

  /**
   * Get pool statistics
   */
  getStats(): {
    poolSize: number;
    inUse: number;
    available: number;
    hitRate: number;
    memoryUsage: number;
  } {
    const inUse = this.pool.filter(b => b.inUse).length;
    const hitRate = this.totalAcquired > 0
      ? this.poolHits / this.totalAcquired
      : 1;

    return {
      poolSize: this.pool.length,
      inUse,
      available: this.pool.length - inUse,
      hitRate,
      memoryUsage: this.calculateMemoryUsage(),
    };
  }

  /**
   * Get hit rate (0-1)
   */
  getHitRate(): number {
    return this.totalAcquired > 0
      ? this.poolHits / this.totalAcquired
      : 1;
  }

  /**
   * Calculate memory usage in bytes
   */
  calculateMemoryUsage(): number {
    // Float32Array uses 4 bytes per element
    return this.pool.length * this.channelCount * this.bufferSize * 4;
  }

  /**
   * Clear the pool
   */
  clear(): void {
    this.pool = [];
    this.totalAcquired = 0;
    this.poolHits = 0;
    this.poolMisses = 0;
  }

  /**
   * Get buffer size
   */
  getBufferSize(): number {
    return this.bufferSize;
  }

  /**
   * Get channel count
   */
  getChannelCount(): number {
    return this.channelCount;
  }

  /**
   * Create a new buffer
   */
  private createBuffer(): PooledBuffer {
    const channels: Float32Array[] = [];
    for (let i = 0; i < this.channelCount; i++) {
      channels.push(new Float32Array(this.bufferSize));
    }

    return {
      id: this.nextId++,
      channels,
      inUse: false,
      acquiredAt: null,
    };
  }
}

/**
 * Performance monitor options
 */
export interface PerformanceMonitorOptions {
  /** Sample window size for averaging */
  sampleWindowSize?: number;
  /** Latency measurement interval in ms */
  latencyInterval?: number;
  /** Enable detailed profiling */
  detailedProfiling?: boolean;
}

/**
 * Default performance monitor options
 */
export const DEFAULT_PERFORMANCE_MONITOR_OPTIONS: Required<PerformanceMonitorOptions> = {
  sampleWindowSize: 100,
  latencyInterval: 1000,
  detailedProfiling: false,
};

/**
 * Processing time sample
 */
interface ProcessingSample {
  timestamp: number;
  duration: number;
}

/**
 * Audio Performance Monitor
 *
 * Tracks performance metrics for the audio processing pipeline.
 */
export class AudioPerformanceMonitor {
  private samples: ProcessingSample[] = [];
  private windowSize: number;
  private detailedProfiling: boolean;

  private underrunCount: number = 0;
  private overrunCount: number = 0;
  private lastLatencyMeasurement: number = 0;
  private currentLatency: number = 0;

  private bufferPool: AudioBufferPool | null = null;
  private isRunning: boolean = false;
  private startTime: number = 0;

  constructor(options: PerformanceMonitorOptions = {}) {
    const opts = { ...DEFAULT_PERFORMANCE_MONITOR_OPTIONS, ...options };
    this.windowSize = opts.sampleWindowSize;
    this.detailedProfiling = opts.detailedProfiling;
  }

  /**
   * Start monitoring
   */
  start(): void {
    this.isRunning = true;
    this.startTime = Date.now();
    this.samples = [];
    this.underrunCount = 0;
    this.overrunCount = 0;
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    this.isRunning = false;
  }

  /**
   * Set buffer pool for monitoring
   */
  setBufferPool(pool: AudioBufferPool): void {
    this.bufferPool = pool;
  }

  /**
   * Record a processing time sample
   */
  recordProcessingTime(durationMs: number): void {
    if (!this.isRunning) return;

    this.samples.push({
      timestamp: Date.now(),
      duration: durationMs,
    });

    // Keep window size limited
    while (this.samples.length > this.windowSize) {
      this.samples.shift();
    }
  }

  /**
   * Record a buffer underrun
   */
  recordUnderrun(): void {
    this.underrunCount++;
  }

  /**
   * Record a buffer overrun
   */
  recordOverrun(): void {
    this.overrunCount++;
  }

  /**
   * Update latency measurement
   */
  updateLatency(latencyMs: number): void {
    this.currentLatency = latencyMs;
    this.lastLatencyMeasurement = Date.now();
  }

  /**
   * Get current metrics
   */
  getMetrics(): AudioPerformanceMetrics {
    const durations = this.samples.map(s => s.duration);

    let avgProcessingTime = 0;
    let maxProcessingTime = 0;
    let minProcessingTime = 0;

    if (durations.length > 0) {
      avgProcessingTime = durations.reduce((a, b) => a + b, 0) / durations.length;
      maxProcessingTime = Math.max(...durations);
      minProcessingTime = Math.min(...durations);
    }

    const poolStats = this.bufferPool?.getStats();
    const bufferUtilization = poolStats
      ? poolStats.inUse / poolStats.poolSize
      : 0;

    return {
      avgProcessingTime,
      maxProcessingTime,
      minProcessingTime,
      sampleCount: this.samples.length,
      underrunCount: this.underrunCount,
      overrunCount: this.overrunCount,
      bufferUtilization,
      bufferMemoryUsage: poolStats?.memoryUsage ?? 0,
      poolHitRate: poolStats?.hitRate ?? 1,
      latency: this.currentLatency,
      lastUpdated: new Date(),
    };
  }

  /**
   * Check if processing time exceeds threshold
   */
  isProcessingTooSlow(thresholdMs: number): boolean {
    const metrics = this.getMetrics();
    return metrics.avgProcessingTime > thresholdMs;
  }

  /**
   * Get uptime in ms
   */
  getUptime(): number {
    return this.isRunning ? Date.now() - this.startTime : 0;
  }

  /**
   * Reset all metrics
   */
  reset(): void {
    this.samples = [];
    this.underrunCount = 0;
    this.overrunCount = 0;
    this.currentLatency = 0;
    this.startTime = Date.now();
  }
}

/**
 * Ring buffer for efficient audio data management
 */
export class AudioRingBuffer {
  private buffer: Float32Array;
  private writeIndex: number = 0;
  private readIndex: number = 0;
  private availableSamples: number = 0;
  private readonly capacity: number;

  constructor(capacity: number) {
    this.capacity = capacity;
    this.buffer = new Float32Array(capacity);
  }

  /**
   * Write samples to the buffer
   * @returns Number of samples actually written
   */
  write(samples: Float32Array): number {
    const samplesToWrite = Math.min(samples.length, this.capacity - this.availableSamples);

    for (let i = 0; i < samplesToWrite; i++) {
      this.buffer[this.writeIndex] = samples[i];
      this.writeIndex = (this.writeIndex + 1) % this.capacity;
    }

    this.availableSamples += samplesToWrite;
    return samplesToWrite;
  }

  /**
   * Read samples from the buffer
   * @returns Number of samples actually read
   */
  read(output: Float32Array): number {
    const samplesToRead = Math.min(output.length, this.availableSamples);

    for (let i = 0; i < samplesToRead; i++) {
      output[i] = this.buffer[this.readIndex];
      this.readIndex = (this.readIndex + 1) % this.capacity;
    }

    this.availableSamples -= samplesToRead;

    // Fill remainder with zeros if not enough samples
    for (let i = samplesToRead; i < output.length; i++) {
      output[i] = 0;
    }

    return samplesToRead;
  }

  /**
   * Get number of available samples
   */
  getAvailableSamples(): number {
    return this.availableSamples;
  }

  /**
   * Get free space in buffer
   */
  getFreeSpace(): number {
    return this.capacity - this.availableSamples;
  }

  /**
   * Get buffer utilization (0-1)
   */
  getUtilization(): number {
    return this.availableSamples / this.capacity;
  }

  /**
   * Check if buffer has underrun risk
   */
  hasUnderrunRisk(threshold: number = 0.25): boolean {
    return this.getUtilization() < threshold;
  }

  /**
   * Check if buffer has overrun risk
   */
  hasOverrunRisk(threshold: number = 0.9): boolean {
    return this.getUtilization() > threshold;
  }

  /**
   * Clear the buffer
   */
  clear(): void {
    this.writeIndex = 0;
    this.readIndex = 0;
    this.availableSamples = 0;
    this.buffer.fill(0);
  }

  /**
   * Get capacity
   */
  getCapacity(): number {
    return this.capacity;
  }
}

/**
 * AudioWorklet processor code as string
 * This is meant to be used with URL.createObjectURL and Blob
 */
export const AUDIO_WORKLET_PROCESSOR_CODE = `
class OptimizedMixerProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.gains = new Map();
    this.port.onmessage = this.handleMessage.bind(this);
  }

  handleMessage(event) {
    const { type, data } = event.data;
    switch (type) {
      case 'setGain':
        this.gains.set(data.id, data.gain);
        break;
      case 'removeSource':
        this.gains.delete(data.id);
        break;
      case 'clear':
        this.gains.clear();
        break;
    }
  }

  process(inputs, outputs, parameters) {
    const output = outputs[0];
    if (!output || output.length === 0) return true;

    // Clear output first
    for (let channel = 0; channel < output.length; channel++) {
      output[channel].fill(0);
    }

    // Mix all inputs
    for (let inputIndex = 0; inputIndex < inputs.length; inputIndex++) {
      const input = inputs[inputIndex];
      if (!input || input.length === 0) continue;

      const gain = this.gains.get(inputIndex.toString()) ?? 1.0;

      for (let channel = 0; channel < Math.min(input.length, output.length); channel++) {
        const inputChannel = input[channel];
        const outputChannel = output[channel];

        for (let i = 0; i < outputChannel.length; i++) {
          outputChannel[i] += (inputChannel[i] || 0) * gain;
        }
      }
    }

    // Soft clip to prevent distortion
    for (let channel = 0; channel < output.length; channel++) {
      const outputChannel = output[channel];
      for (let i = 0; i < outputChannel.length; i++) {
        const sample = outputChannel[i];
        // Soft clip using tanh
        outputChannel[i] = Math.tanh(sample);
      }
    }

    return true;
  }
}

registerProcessor('optimized-mixer-processor', OptimizedMixerProcessor);
`;

/**
 * Audio Worklet processor code for speaking detection
 */
export const SPEAKING_DETECTOR_WORKLET_CODE = `
class SpeakingDetectorProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.threshold = 0.01;
    this.port.onmessage = this.handleMessage.bind(this);
  }

  handleMessage(event) {
    const { type, data } = event.data;
    if (type === 'setThreshold') {
      this.threshold = data.threshold;
    }
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (!input || input.length === 0 || !input[0]) return true;

    const inputChannel = input[0];
    let sum = 0;

    // Calculate RMS
    for (let i = 0; i < inputChannel.length; i++) {
      const sample = inputChannel[i];
      sum += sample * sample;
    }

    const rms = Math.sqrt(sum / inputChannel.length);
    const isSpeaking = rms >= this.threshold;

    // Report to main thread
    this.port.postMessage({
      rms,
      isSpeaking,
      timestamp: currentTime,
    });

    return true;
  }
}

registerProcessor('speaking-detector-processor', SpeakingDetectorProcessor);
`;

/**
 * Create AudioWorklet module URL from code string
 */
export function createWorkletModuleURL(code: string): string {
  const blob = new Blob([code], { type: 'application/javascript' });
  return URL.createObjectURL(blob);
}

/**
 * Revoke a worklet module URL
 */
export function revokeWorkletModuleURL(url: string): void {
  URL.revokeObjectURL(url);
}

/**
 * Latency calculator for audio pipeline
 */
export class LatencyCalculator {
  private sampleRate: number;
  private bufferSize: number;
  private inputLatency: number = 0;
  private outputLatency: number = 0;

  constructor(sampleRate: number = 48000, bufferSize: number = 128) {
    this.sampleRate = sampleRate;
    this.bufferSize = bufferSize;
  }

  /**
   * Set audio context latencies
   */
  setContextLatencies(input: number, output: number): void {
    this.inputLatency = input;
    this.outputLatency = output;
  }

  /**
   * Calculate buffer latency in ms
   */
  getBufferLatency(): number {
    return (this.bufferSize / this.sampleRate) * 1000;
  }

  /**
   * Get total round-trip latency estimate in ms
   */
  getTotalLatency(): number {
    const bufferLatency = this.getBufferLatency();
    const contextLatency = (this.inputLatency + this.outputLatency) * 1000;
    // Add processing overhead estimate
    const processingOverhead = 1; // 1ms overhead estimate
    return bufferLatency + contextLatency + processingOverhead;
  }

  /**
   * Get latency breakdown
   */
  getLatencyBreakdown(): {
    buffer: number;
    input: number;
    output: number;
    processing: number;
    total: number;
  } {
    const bufferLatency = this.getBufferLatency();
    const inputLatency = this.inputLatency * 1000;
    const outputLatency = this.outputLatency * 1000;
    const processingOverhead = 1;

    return {
      buffer: bufferLatency,
      input: inputLatency,
      output: outputLatency,
      processing: processingOverhead,
      total: bufferLatency + inputLatency + outputLatency + processingOverhead,
    };
  }

  /**
   * Check if latency is acceptable for real-time communication
   */
  isLatencyAcceptable(maxLatencyMs: number = 150): boolean {
    return this.getTotalLatency() <= maxLatencyMs;
  }

  /**
   * Update sample rate
   */
  setSampleRate(sampleRate: number): void {
    this.sampleRate = sampleRate;
  }

  /**
   * Update buffer size
   */
  setBufferSize(bufferSize: number): void {
    this.bufferSize = bufferSize;
  }
}

/**
 * Performance optimization recommendations
 */
export interface OptimizationRecommendation {
  type: 'buffer_size' | 'sample_rate' | 'worklet' | 'pool_size';
  severity: 'info' | 'warning' | 'critical';
  message: string;
  currentValue: number | string;
  recommendedValue: number | string;
}

/**
 * Analyze performance and provide optimization recommendations
 */
export function analyzePerformance(
  metrics: AudioPerformanceMetrics,
  latencyCalculator: LatencyCalculator
): OptimizationRecommendation[] {
  const recommendations: OptimizationRecommendation[] = [];

  // Check processing time
  if (metrics.avgProcessingTime > 5) {
    recommendations.push({
      type: 'worklet',
      severity: 'warning',
      message: 'High processing time detected. Consider using AudioWorklet.',
      currentValue: `${metrics.avgProcessingTime.toFixed(2)}ms`,
      recommendedValue: '<3ms',
    });
  }

  // Check buffer utilization
  if (metrics.bufferUtilization > 0.9) {
    recommendations.push({
      type: 'pool_size',
      severity: 'warning',
      message: 'Buffer pool near capacity. Consider increasing pool size.',
      currentValue: `${(metrics.bufferUtilization * 100).toFixed(0)}%`,
      recommendedValue: '<80%',
    });
  }

  // Check pool hit rate
  if (metrics.poolHitRate < 0.8) {
    recommendations.push({
      type: 'pool_size',
      severity: 'info',
      message: 'Low pool hit rate. Consider increasing initial pool size.',
      currentValue: `${(metrics.poolHitRate * 100).toFixed(0)}%`,
      recommendedValue: '>90%',
    });
  }

  // Check underruns
  if (metrics.underrunCount > 0) {
    recommendations.push({
      type: 'buffer_size',
      severity: 'warning',
      message: 'Buffer underruns detected. Consider increasing buffer size.',
      currentValue: `${metrics.underrunCount} underruns`,
      recommendedValue: '0 underruns',
    });
  }

  // Check latency
  const latencyBreakdown = latencyCalculator.getLatencyBreakdown();
  if (latencyBreakdown.total > 150) {
    recommendations.push({
      type: 'buffer_size',
      severity: 'critical',
      message: 'High latency detected. Consider reducing buffer size.',
      currentValue: `${latencyBreakdown.total.toFixed(0)}ms`,
      recommendedValue: '<150ms',
    });
  }

  return recommendations;
}

/**
 * Create a performance-optimized audio mixer setup
 */
export function createOptimizedAudioSetup(): {
  bufferPool: AudioBufferPool;
  monitor: AudioPerformanceMonitor;
  latencyCalculator: LatencyCalculator;
} {
  const bufferPool = new AudioBufferPool({
    initialSize: 16,
    maxSize: 64,
    bufferSize: 128,
    channelCount: 2,
  });

  const monitor = new AudioPerformanceMonitor({
    sampleWindowSize: 100,
    detailedProfiling: false,
  });

  monitor.setBufferPool(bufferPool);

  const latencyCalculator = new LatencyCalculator(48000, 128);

  return {
    bufferPool,
    monitor,
    latencyCalculator,
  };
}
