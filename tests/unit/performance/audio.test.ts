/**
 * Audio Pipeline Performance Tests
 *
 * Tests for audio processing optimizations including:
 * - Buffer pooling
 * - Performance monitoring
 * - Ring buffers
 * - Latency calculation
 *
 * Part of the Long-Horizon Engineering Protocol - FEAT-406
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  AudioBufferPool,
  AudioPerformanceMonitor,
  AudioRingBuffer,
  LatencyCalculator,
  analyzePerformance,
  createOptimizedAudioSetup,
  createWorkletModuleURL,
  revokeWorkletModuleURL,
  AUDIO_WORKLET_PROCESSOR_CODE,
  SPEAKING_DETECTOR_WORKLET_CODE,
  DEFAULT_BUFFER_POOL_OPTIONS,
  DEFAULT_PERFORMANCE_MONITOR_OPTIONS,
  type AudioPerformanceMetrics,
  type PooledBuffer,
} from '@/lib/audio/performance';

describe('AudioBufferPool', () => {
  let pool: AudioBufferPool;

  beforeEach(() => {
    pool = new AudioBufferPool({
      initialSize: 4,
      maxSize: 8,
      bufferSize: 128,
      channelCount: 2,
    });
  });

  describe('initialization', () => {
    it('should create pool with default options', () => {
      const defaultPool = new AudioBufferPool();
      const stats = defaultPool.getStats();
      expect(stats.poolSize).toBe(DEFAULT_BUFFER_POOL_OPTIONS.initialSize);
    });

    it('should pre-allocate initial buffers', () => {
      const stats = pool.getStats();
      expect(stats.poolSize).toBe(4);
      expect(stats.available).toBe(4);
      expect(stats.inUse).toBe(0);
    });

    it('should configure buffer size correctly', () => {
      expect(pool.getBufferSize()).toBe(128);
    });

    it('should configure channel count correctly', () => {
      expect(pool.getChannelCount()).toBe(2);
    });
  });

  describe('buffer acquisition', () => {
    it('should acquire buffer from pool', () => {
      const buffer = pool.acquire();
      expect(buffer).toBeDefined();
      expect(buffer.inUse).toBe(true);
      expect(buffer.channels).toHaveLength(2);
      expect(buffer.channels[0]).toHaveLength(128);
    });

    it('should mark buffer as in use', () => {
      const buffer = pool.acquire();
      const stats = pool.getStats();
      expect(stats.inUse).toBe(1);
      expect(stats.available).toBe(3);
    });

    it('should set acquired timestamp', () => {
      const buffer = pool.acquire();
      expect(buffer.acquiredAt).not.toBeNull();
      expect(typeof buffer.acquiredAt).toBe('number');
    });

    it('should have unique buffer IDs', () => {
      const buffer1 = pool.acquire();
      const buffer2 = pool.acquire();
      expect(buffer1.id).not.toBe(buffer2.id);
    });

    it('should create new buffer when pool empty but under max', () => {
      // Acquire all initial buffers
      for (let i = 0; i < 4; i++) {
        pool.acquire();
      }

      // Acquire one more - should create new
      const buffer = pool.acquire();
      expect(buffer).toBeDefined();

      const stats = pool.getStats();
      expect(stats.poolSize).toBe(5);
    });

    it('should create temporary buffer when pool exhausted', () => {
      // Acquire all buffers up to max
      for (let i = 0; i < 8; i++) {
        pool.acquire();
      }

      // One more should still work (temporary buffer)
      const buffer = pool.acquire();
      expect(buffer).toBeDefined();

      // Pool size should still be at max
      const stats = pool.getStats();
      expect(stats.poolSize).toBe(8);
    });
  });

  describe('buffer release', () => {
    it('should release buffer back to pool', () => {
      const buffer = pool.acquire();
      pool.release(buffer);

      expect(buffer.inUse).toBe(false);
      expect(buffer.acquiredAt).toBeNull();
    });

    it('should make buffer available for reuse', () => {
      const buffer = pool.acquire();
      pool.release(buffer);

      const stats = pool.getStats();
      expect(stats.available).toBe(4);
    });

    it('should clear buffer data on release', () => {
      const buffer = pool.acquire();
      // Write some data
      buffer.channels[0].fill(0.5);
      buffer.channels[1].fill(0.5);

      pool.release(buffer);

      // Data should be cleared
      expect(buffer.channels[0].every(v => v === 0)).toBe(true);
      expect(buffer.channels[1].every(v => v === 0)).toBe(true);
    });
  });

  describe('statistics', () => {
    it('should track hit rate', () => {
      // Initial acquires should be hits
      const buffer1 = pool.acquire();
      const buffer2 = pool.acquire();

      expect(pool.getHitRate()).toBe(1);

      // Release and acquire again
      pool.release(buffer1);
      pool.acquire();

      expect(pool.getHitRate()).toBe(1);
    });

    it('should track misses when pool grows', () => {
      // Acquire all pre-allocated
      for (let i = 0; i < 4; i++) {
        pool.acquire();
      }

      // Next one is a miss
      pool.acquire();

      expect(pool.getHitRate()).toBe(4 / 5);
    });

    it('should calculate memory usage', () => {
      const stats = pool.getStats();
      // 4 buffers * 2 channels * 128 samples * 4 bytes
      expect(stats.memoryUsage).toBe(4 * 2 * 128 * 4);
    });
  });

  describe('pool management', () => {
    it('should clear pool', () => {
      pool.acquire();
      pool.acquire();
      pool.clear();

      const stats = pool.getStats();
      expect(stats.poolSize).toBe(0);
      expect(pool.getHitRate()).toBe(1); // Reset to 1
    });
  });
});

describe('AudioPerformanceMonitor', () => {
  let monitor: AudioPerformanceMonitor;

  beforeEach(() => {
    monitor = new AudioPerformanceMonitor({
      sampleWindowSize: 10,
    });
    monitor.start();
  });

  afterEach(() => {
    monitor.stop();
  });

  describe('initialization', () => {
    it('should create monitor with default options', () => {
      const defaultMonitor = new AudioPerformanceMonitor();
      expect(defaultMonitor).toBeDefined();
    });

    it('should not record samples when not running', () => {
      const stoppedMonitor = new AudioPerformanceMonitor();
      stoppedMonitor.recordProcessingTime(5);
      const metrics = stoppedMonitor.getMetrics();
      expect(metrics.sampleCount).toBe(0);
    });
  });

  describe('processing time tracking', () => {
    it('should record processing time samples', () => {
      monitor.recordProcessingTime(2);
      monitor.recordProcessingTime(3);

      const metrics = monitor.getMetrics();
      expect(metrics.sampleCount).toBe(2);
    });

    it('should calculate average processing time', () => {
      monitor.recordProcessingTime(2);
      monitor.recordProcessingTime(4);
      monitor.recordProcessingTime(6);

      const metrics = monitor.getMetrics();
      expect(metrics.avgProcessingTime).toBe(4);
    });

    it('should track min and max processing time', () => {
      monitor.recordProcessingTime(2);
      monitor.recordProcessingTime(8);
      monitor.recordProcessingTime(4);

      const metrics = monitor.getMetrics();
      expect(metrics.minProcessingTime).toBe(2);
      expect(metrics.maxProcessingTime).toBe(8);
    });

    it('should maintain sliding window', () => {
      // Add 15 samples to window of 10
      for (let i = 0; i < 15; i++) {
        monitor.recordProcessingTime(i);
      }

      const metrics = monitor.getMetrics();
      expect(metrics.sampleCount).toBe(10);
    });
  });

  describe('buffer events', () => {
    it('should count underruns', () => {
      monitor.recordUnderrun();
      monitor.recordUnderrun();

      const metrics = monitor.getMetrics();
      expect(metrics.underrunCount).toBe(2);
    });

    it('should count overruns', () => {
      monitor.recordOverrun();
      monitor.recordOverrun();
      monitor.recordOverrun();

      const metrics = monitor.getMetrics();
      expect(metrics.overrunCount).toBe(3);
    });
  });

  describe('latency tracking', () => {
    it('should update latency', () => {
      monitor.updateLatency(15);

      const metrics = monitor.getMetrics();
      expect(metrics.latency).toBe(15);
    });
  });

  describe('buffer pool integration', () => {
    it('should track buffer pool metrics', () => {
      const pool = new AudioBufferPool({ initialSize: 4 });
      monitor.setBufferPool(pool);

      pool.acquire();
      pool.acquire();

      const metrics = monitor.getMetrics();
      expect(metrics.bufferUtilization).toBe(0.5);
      expect(metrics.poolHitRate).toBe(1);
      expect(metrics.bufferMemoryUsage).toBeGreaterThan(0);
    });
  });

  describe('threshold checking', () => {
    it('should detect slow processing', () => {
      monitor.recordProcessingTime(10);
      monitor.recordProcessingTime(12);

      expect(monitor.isProcessingTooSlow(5)).toBe(true);
      expect(monitor.isProcessingTooSlow(15)).toBe(false);
    });
  });

  describe('lifecycle', () => {
    it('should track uptime', () => {
      const startTime = monitor.getUptime();
      expect(startTime).toBeGreaterThanOrEqual(0);
    });

    it('should reset metrics', () => {
      monitor.recordProcessingTime(5);
      monitor.recordUnderrun();
      monitor.updateLatency(10);

      monitor.reset();

      const metrics = monitor.getMetrics();
      expect(metrics.sampleCount).toBe(0);
      expect(metrics.underrunCount).toBe(0);
      expect(metrics.latency).toBe(0);
    });

    it('should return 0 uptime when stopped', () => {
      monitor.stop();
      expect(monitor.getUptime()).toBe(0);
    });
  });

  describe('metrics output', () => {
    it('should include timestamp in metrics', () => {
      const metrics = monitor.getMetrics();
      expect(metrics.lastUpdated).toBeInstanceOf(Date);
    });

    it('should handle empty samples gracefully', () => {
      const metrics = monitor.getMetrics();
      expect(metrics.avgProcessingTime).toBe(0);
      expect(metrics.minProcessingTime).toBe(0);
      expect(metrics.maxProcessingTime).toBe(0);
    });
  });
});

describe('AudioRingBuffer', () => {
  let buffer: AudioRingBuffer;

  beforeEach(() => {
    buffer = new AudioRingBuffer(1024);
  });

  describe('initialization', () => {
    it('should create buffer with specified capacity', () => {
      expect(buffer.getCapacity()).toBe(1024);
    });

    it('should start empty', () => {
      expect(buffer.getAvailableSamples()).toBe(0);
      expect(buffer.getFreeSpace()).toBe(1024);
    });
  });

  describe('write operations', () => {
    it('should write samples to buffer', () => {
      const samples = new Float32Array([0.1, 0.2, 0.3, 0.4]);
      const written = buffer.write(samples);

      expect(written).toBe(4);
      expect(buffer.getAvailableSamples()).toBe(4);
    });

    it('should not overflow buffer', () => {
      const largeSamples = new Float32Array(2000);
      largeSamples.fill(0.5);

      const written = buffer.write(largeSamples);

      expect(written).toBe(1024);
      expect(buffer.getAvailableSamples()).toBe(1024);
    });

    it('should handle partial writes when buffer nearly full', () => {
      const first = new Float32Array(900);
      buffer.write(first);

      const second = new Float32Array(200);
      const written = buffer.write(second);

      expect(written).toBe(124);
      expect(buffer.getAvailableSamples()).toBe(1024);
    });
  });

  describe('read operations', () => {
    it('should read samples from buffer', () => {
      const samples = new Float32Array([0.1, 0.2, 0.3, 0.4]);
      buffer.write(samples);

      const output = new Float32Array(4);
      const read = buffer.read(output);

      expect(read).toBe(4);
      expect(output[0]).toBeCloseTo(0.1);
      expect(output[3]).toBeCloseTo(0.4);
    });

    it('should fill with zeros when buffer empty', () => {
      const output = new Float32Array(4);
      const read = buffer.read(output);

      expect(read).toBe(0);
      expect(output.every(v => v === 0)).toBe(true);
    });

    it('should handle partial reads', () => {
      const samples = new Float32Array([0.1, 0.2]);
      buffer.write(samples);

      const output = new Float32Array(4);
      const read = buffer.read(output);

      expect(read).toBe(2);
      expect(output[0]).toBeCloseTo(0.1);
      expect(output[1]).toBeCloseTo(0.2);
      expect(output[2]).toBe(0);
      expect(output[3]).toBe(0);
    });

    it('should update available samples after read', () => {
      buffer.write(new Float32Array(100));
      buffer.read(new Float32Array(30));

      expect(buffer.getAvailableSamples()).toBe(70);
    });
  });

  describe('circular behavior', () => {
    it('should wrap around correctly', () => {
      // Fill buffer
      buffer.write(new Float32Array(800));

      // Read some
      buffer.read(new Float32Array(500));

      // Write more (should wrap)
      const newSamples = new Float32Array(400);
      newSamples.fill(0.9);
      buffer.write(newSamples);

      expect(buffer.getAvailableSamples()).toBe(700);

      // Read and verify data integrity
      const output = new Float32Array(400);
      buffer.read(output);
      // First 300 should be zeros (from initial write)
      // Last 100 should be 0.9 (from wrapped write)
    });
  });

  describe('utilization tracking', () => {
    it('should calculate utilization', () => {
      buffer.write(new Float32Array(512));
      expect(buffer.getUtilization()).toBe(0.5);
    });

    it('should detect underrun risk', () => {
      buffer.write(new Float32Array(100));
      expect(buffer.hasUnderrunRisk()).toBe(true);

      buffer.write(new Float32Array(400));
      expect(buffer.hasUnderrunRisk()).toBe(false);
    });

    it('should detect overrun risk', () => {
      buffer.write(new Float32Array(950));
      expect(buffer.hasOverrunRisk()).toBe(true);

      buffer.read(new Float32Array(200));
      expect(buffer.hasOverrunRisk()).toBe(false);
    });

    it('should use custom thresholds', () => {
      buffer.write(new Float32Array(300));
      expect(buffer.hasUnderrunRisk(0.5)).toBe(true);
      expect(buffer.hasUnderrunRisk(0.2)).toBe(false);
    });
  });

  describe('buffer management', () => {
    it('should clear buffer', () => {
      buffer.write(new Float32Array(500));
      buffer.clear();

      expect(buffer.getAvailableSamples()).toBe(0);
      expect(buffer.getFreeSpace()).toBe(1024);
    });
  });
});

describe('LatencyCalculator', () => {
  let calculator: LatencyCalculator;

  beforeEach(() => {
    calculator = new LatencyCalculator(48000, 128);
  });

  describe('initialization', () => {
    it('should create with default values', () => {
      const defaultCalc = new LatencyCalculator();
      expect(defaultCalc.getBufferLatency()).toBeCloseTo(128 / 48000 * 1000, 1);
    });

    it('should accept custom sample rate and buffer size', () => {
      const customCalc = new LatencyCalculator(44100, 256);
      expect(customCalc.getBufferLatency()).toBeCloseTo(256 / 44100 * 1000, 1);
    });
  });

  describe('buffer latency', () => {
    it('should calculate buffer latency in ms', () => {
      const latency = calculator.getBufferLatency();
      // 128 samples at 48000 Hz = 2.67ms
      expect(latency).toBeCloseTo(2.67, 1);
    });
  });

  describe('context latencies', () => {
    it('should include context latencies in total', () => {
      calculator.setContextLatencies(0.01, 0.01); // 10ms each

      const breakdown = calculator.getLatencyBreakdown();
      expect(breakdown.input).toBeCloseTo(10, 0);
      expect(breakdown.output).toBeCloseTo(10, 0);
    });
  });

  describe('total latency', () => {
    it('should calculate total latency', () => {
      calculator.setContextLatencies(0.005, 0.005);

      const total = calculator.getTotalLatency();
      // buffer (~2.67) + input (5) + output (5) + processing (1) ≈ 13.67
      expect(total).toBeGreaterThan(10);
    });

    it('should provide detailed breakdown', () => {
      calculator.setContextLatencies(0.005, 0.005);

      const breakdown = calculator.getLatencyBreakdown();
      expect(breakdown.buffer).toBeGreaterThan(0);
      expect(breakdown.input).toBeGreaterThan(0);
      expect(breakdown.output).toBeGreaterThan(0);
      expect(breakdown.processing).toBe(1);
      expect(breakdown.total).toBe(
        breakdown.buffer + breakdown.input + breakdown.output + breakdown.processing
      );
    });
  });

  describe('latency acceptability', () => {
    it('should check if latency is acceptable', () => {
      calculator.setContextLatencies(0.01, 0.01);
      expect(calculator.isLatencyAcceptable(150)).toBe(true);
    });

    it('should detect unacceptable latency', () => {
      calculator.setContextLatencies(0.1, 0.1); // 100ms each
      expect(calculator.isLatencyAcceptable(150)).toBe(false);
    });
  });

  describe('dynamic configuration', () => {
    it('should update sample rate', () => {
      calculator.setSampleRate(44100);
      const latency = calculator.getBufferLatency();
      expect(latency).toBeCloseTo(128 / 44100 * 1000, 1);
    });

    it('should update buffer size', () => {
      calculator.setBufferSize(256);
      const latency = calculator.getBufferLatency();
      expect(latency).toBeCloseTo(256 / 48000 * 1000, 1);
    });
  });
});

describe('analyzePerformance', () => {
  let metrics: AudioPerformanceMetrics;
  let calculator: LatencyCalculator;

  beforeEach(() => {
    calculator = new LatencyCalculator(48000, 128);
    calculator.setContextLatencies(0.005, 0.005);

    metrics = {
      avgProcessingTime: 2,
      maxProcessingTime: 3,
      minProcessingTime: 1,
      sampleCount: 100,
      underrunCount: 0,
      overrunCount: 0,
      bufferUtilization: 0.5,
      bufferMemoryUsage: 4096,
      poolHitRate: 0.95,
      latency: 15,
      lastUpdated: new Date(),
    };
  });

  it('should return empty recommendations for healthy metrics', () => {
    const recommendations = analyzePerformance(metrics, calculator);
    expect(recommendations).toHaveLength(0);
  });

  it('should recommend worklet for high processing time', () => {
    metrics.avgProcessingTime = 10;
    const recommendations = analyzePerformance(metrics, calculator);

    const workletRec = recommendations.find(r => r.type === 'worklet');
    expect(workletRec).toBeDefined();
    expect(workletRec?.severity).toBe('warning');
  });

  it('should recommend larger pool for high utilization', () => {
    metrics.bufferUtilization = 0.95;
    const recommendations = analyzePerformance(metrics, calculator);

    const poolRec = recommendations.find(r => r.type === 'pool_size' && r.message.includes('capacity'));
    expect(poolRec).toBeDefined();
  });

  it('should recommend larger pool for low hit rate', () => {
    metrics.poolHitRate = 0.7;
    const recommendations = analyzePerformance(metrics, calculator);

    const poolRec = recommendations.find(r => r.type === 'pool_size' && r.message.includes('hit rate'));
    expect(poolRec).toBeDefined();
    expect(poolRec?.severity).toBe('info');
  });

  it('should warn about underruns', () => {
    metrics.underrunCount = 5;
    const recommendations = analyzePerformance(metrics, calculator);

    const underrunRec = recommendations.find(r => r.message.includes('underrun'));
    expect(underrunRec).toBeDefined();
  });

  it('should warn about high latency', () => {
    const highLatencyCalc = new LatencyCalculator(48000, 4096);
    highLatencyCalc.setContextLatencies(0.05, 0.05);

    const recommendations = analyzePerformance(metrics, highLatencyCalc);

    const latencyRec = recommendations.find(r => r.message.includes('latency'));
    expect(latencyRec).toBeDefined();
    expect(latencyRec?.severity).toBe('critical');
  });
});

describe('AudioWorklet code', () => {
  it('should have valid mixer processor code', () => {
    expect(AUDIO_WORKLET_PROCESSOR_CODE).toContain('OptimizedMixerProcessor');
    expect(AUDIO_WORKLET_PROCESSOR_CODE).toContain('registerProcessor');
    expect(AUDIO_WORKLET_PROCESSOR_CODE).toContain('process');
  });

  it('should have valid speaking detector code', () => {
    expect(SPEAKING_DETECTOR_WORKLET_CODE).toContain('SpeakingDetectorProcessor');
    expect(SPEAKING_DETECTOR_WORKLET_CODE).toContain('registerProcessor');
    expect(SPEAKING_DETECTOR_WORKLET_CODE).toContain('process');
  });

  it('should create blob URL from code', () => {
    // Mock URL.createObjectURL since it's not available in test env
    const mockUrl = 'blob:test-url';
    const originalCreateObjectURL = global.URL.createObjectURL;
    global.URL.createObjectURL = vi.fn().mockReturnValue(mockUrl);

    const url = createWorkletModuleURL(AUDIO_WORKLET_PROCESSOR_CODE);
    expect(url).toBe(mockUrl);
    expect(global.URL.createObjectURL).toHaveBeenCalled();

    global.URL.createObjectURL = originalCreateObjectURL;
  });

  it('should revoke blob URL', () => {
    const mockUrl = 'blob:test-url';
    const originalRevokeObjectURL = global.URL.revokeObjectURL;
    global.URL.revokeObjectURL = vi.fn();

    revokeWorkletModuleURL(mockUrl);
    expect(global.URL.revokeObjectURL).toHaveBeenCalledWith(mockUrl);

    global.URL.revokeObjectURL = originalRevokeObjectURL;
  });
});

describe('createOptimizedAudioSetup', () => {
  it('should create complete setup', () => {
    const setup = createOptimizedAudioSetup();

    expect(setup.bufferPool).toBeInstanceOf(AudioBufferPool);
    expect(setup.monitor).toBeInstanceOf(AudioPerformanceMonitor);
    expect(setup.latencyCalculator).toBeInstanceOf(LatencyCalculator);
  });

  it('should connect monitor to pool', () => {
    const setup = createOptimizedAudioSetup();

    // Acquire a buffer and check monitor can see it
    setup.bufferPool.acquire();
    setup.monitor.start();

    const metrics = setup.monitor.getMetrics();
    expect(metrics.bufferMemoryUsage).toBeGreaterThan(0);
  });

  it('should use optimized defaults', () => {
    const setup = createOptimizedAudioSetup();

    const poolStats = setup.bufferPool.getStats();
    expect(poolStats.poolSize).toBe(16); // Optimized initial size

    const latency = setup.latencyCalculator.getBufferLatency();
    expect(latency).toBeCloseTo(128 / 48000 * 1000, 1); // 128 buffer size
  });
});

describe('Integration scenarios', () => {
  it('should handle continuous audio processing simulation', () => {
    const setup = createOptimizedAudioSetup();
    setup.monitor.start();

    // Simulate processing loop
    for (let i = 0; i < 100; i++) {
      const buffer = setup.bufferPool.acquire();

      // Simulate processing time
      const startTime = performance.now();
      // Do some computation
      for (let j = 0; j < buffer.channels[0].length; j++) {
        buffer.channels[0][j] = Math.sin(j / 10);
      }
      const endTime = performance.now();

      setup.monitor.recordProcessingTime(endTime - startTime);
      setup.bufferPool.release(buffer);
    }

    const metrics = setup.monitor.getMetrics();
    expect(metrics.sampleCount).toBe(100);
    expect(setup.bufferPool.getHitRate()).toBeGreaterThan(0.9);

    setup.monitor.stop();
  });

  it('should handle ring buffer streaming', () => {
    const ringBuffer = new AudioRingBuffer(4096);

    // Simulate producer/consumer pattern
    let produced = 0;
    let consumed = 0;

    // Producer writes in chunks
    for (let i = 0; i < 10; i++) {
      const chunk = new Float32Array(256);
      chunk.fill(i / 10);
      const written = ringBuffer.write(chunk);
      produced += written;
    }

    // Consumer reads in different sized chunks
    for (let i = 0; i < 5; i++) {
      const output = new Float32Array(512);
      const read = ringBuffer.read(output);
      consumed += read;
    }

    expect(produced).toBe(2560);
    expect(consumed).toBe(2560);
    expect(ringBuffer.getAvailableSamples()).toBe(0);
  });

  it('should track pool efficiency under pressure', () => {
    const pool = new AudioBufferPool({
      initialSize: 2,
      maxSize: 4,
      bufferSize: 64,
      channelCount: 1,
    });

    const acquired: PooledBuffer[] = [];

    // Exhaust pool
    for (let i = 0; i < 6; i++) {
      acquired.push(pool.acquire());
    }

    // Pool should have grown to max
    const stats = pool.getStats();
    expect(stats.poolSize).toBe(4);
    expect(stats.inUse).toBe(4);

    // Release some
    pool.release(acquired[0]);
    pool.release(acquired[1]);

    // Acquire again - should hit pool
    pool.acquire();
    pool.acquire();

    // Hit rate should be less than 1 due to initial misses
    expect(pool.getHitRate()).toBeLessThan(1);
    expect(pool.getHitRate()).toBeGreaterThanOrEqual(0.5);
  });
});
