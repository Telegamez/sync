/**
 * Graceful Degradation Tests
 *
 * Tests for partial failure handling, fallback mechanisms,
 * circuit breakers, and degradation state management.
 *
 * Part of the Long-Horizon Engineering Protocol - FEAT-405
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  DegradationManager,
  CircuitBreaker,
  createDegradationManager,
  getDegradationIndicator,
  shouldDisableVideo,
  shouldDisableHDVideo,
  calculateConnectionQuality,
  getRecommendedAction,
  DEFAULT_BANDWIDTH_THRESHOLDS,
  DEFAULT_CIRCUIT_BREAKER_CONFIG,
  type DegradationLevel,
  type DegradationState,
  type PeerConnectionHealth,
  type CircuitBreakerConfig,
} from '@/lib/degradation';

describe('DegradationManager', () => {
  let manager: DegradationManager;

  beforeEach(() => {
    manager = createDegradationManager();
  });

  afterEach(() => {
    manager.destroy();
  });

  describe('initialization', () => {
    it('should start with full degradation level', () => {
      expect(manager.getLevel()).toBe('full');
    });

    it('should start with all features available', () => {
      const state = manager.getState();
      expect(state.features.video.available).toBe(true);
      expect(state.features.audio.available).toBe(true);
      expect(state.features.ai.available).toBe(true);
      expect(state.features.signaling.available).toBe(true);
      expect(state.features.webrtc.available).toBe(true);
    });

    it('should start with no active fallbacks', () => {
      expect(manager.getActiveFallbacks()).toHaveLength(0);
    });

    it('should start with empty event history', () => {
      expect(manager.getEventHistory()).toHaveLength(0);
    });

    it('should accept custom thresholds', () => {
      const customThresholds = {
        ...DEFAULT_BANDWIDTH_THRESHOLDS,
        videoMinBandwidth: 200,
      };
      const customManager = new DegradationManager(customThresholds);
      expect(customManager.getLevel()).toBe('full');
      customManager.destroy();
    });
  });

  describe('feature status', () => {
    it('should check if feature is available', () => {
      expect(manager.isFeatureAvailable('video')).toBe(true);
      expect(manager.isFeatureAvailable('audio')).toBe(true);
    });

    it('should check if feature is degraded', () => {
      expect(manager.isFeatureDegraded('video')).toBe(false);
      manager.handleBandwidthChange(500); // Below HD threshold
      expect(manager.isFeatureDegraded('video')).toBe(true);
    });
  });

  describe('bandwidth handling', () => {
    it('should activate audio-only fallback on very low bandwidth', () => {
      manager.handleBandwidthChange(100); // Below video minimum
      expect(manager.getActiveFallbacks()).toContain('audio_only');
      expect(manager.getLevel()).toBe('audio_only');
    });

    it('should degrade video on low bandwidth', () => {
      manager.handleBandwidthChange(500); // Below HD threshold but above minimum
      expect(manager.isFeatureDegraded('video')).toBe(true);
      expect(manager.getLevel()).toBe('limited');
    });

    it('should restore video when bandwidth improves', () => {
      manager.handleBandwidthChange(100); // Trigger audio-only
      expect(manager.getActiveFallbacks()).toContain('audio_only');

      manager.handleBandwidthChange(2000); // Good bandwidth
      expect(manager.getActiveFallbacks()).not.toContain('audio_only');
      expect(manager.isFeatureDegraded('video')).toBe(false);
    });

    it('should not change state when bandwidth is good', () => {
      manager.handleBandwidthChange(2000);
      expect(manager.getLevel()).toBe('full');
      expect(manager.getActiveFallbacks()).toHaveLength(0);
    });
  });

  describe('AI session handling', () => {
    it('should handle AI unavailability', () => {
      manager.handleAIUnavailable('Service overloaded');
      expect(manager.isFeatureDegraded('ai')).toBe(true);
      expect(manager.getActiveFallbacks()).toContain('ai_unavailable');
    });

    it('should restore AI when available again', () => {
      manager.handleAIUnavailable('Service overloaded');
      manager.handleAIRestored();
      expect(manager.isFeatureDegraded('ai')).toBe(false);
      expect(manager.getActiveFallbacks()).not.toContain('ai_unavailable');
    });
  });

  describe('signaling handling', () => {
    it('should handle signaling issues', () => {
      manager.handleSignalingIssue('Connection unstable');
      expect(manager.isFeatureDegraded('signaling')).toBe(true);
    });

    it('should restore signaling', () => {
      manager.handleSignalingIssue('Connection unstable');
      manager.handleSignalingRestored();
      expect(manager.isFeatureDegraded('signaling')).toBe(false);
    });
  });

  describe('peer connection health', () => {
    const mockPeerHealth: PeerConnectionHealth = {
      peerId: 'peer-1',
      connected: true,
      audioWorking: true,
      videoWorking: true,
      latency: 50,
      packetLoss: 1,
      degraded: false,
    };

    it('should track peer health', () => {
      manager.updatePeerHealth(mockPeerHealth);
      const health = manager.getPeerHealth('peer-1');
      expect(health).toBeDefined();
      expect(health?.peerId).toBe('peer-1');
    });

    it('should get all peer health statuses', () => {
      manager.updatePeerHealth(mockPeerHealth);
      manager.updatePeerHealth({ ...mockPeerHealth, peerId: 'peer-2' });
      const allHealth = manager.getAllPeerHealth();
      expect(allHealth).toHaveLength(2);
    });

    it('should mark peer as degraded on high packet loss', () => {
      manager.updatePeerHealth({
        ...mockPeerHealth,
        packetLoss: 10, // Above threshold
      });
      const health = manager.getPeerHealth('peer-1');
      expect(health?.degraded).toBe(true);
    });

    it('should mark peer as degraded on high latency', () => {
      manager.updatePeerHealth({
        ...mockPeerHealth,
        latency: 500, // Above threshold
      });
      const health = manager.getPeerHealth('peer-1');
      expect(health?.degraded).toBe(true);
    });

    it('should remove peer health tracking', () => {
      manager.updatePeerHealth(mockPeerHealth);
      manager.removePeerHealth('peer-1');
      expect(manager.getPeerHealth('peer-1')).toBeUndefined();
    });

    it('should handle peer connection failure', () => {
      manager.handlePeerConnectionFailure('peer-1', 'ICE connection failed');
      const health = manager.getPeerHealth('peer-1');
      expect(health?.connected).toBe(false);
      expect(health?.degraded).toBe(true);
      expect(health?.lastError).toBe('ICE connection failed');
    });
  });

  describe('degradation level calculation', () => {
    it('should remain full when no issues', () => {
      expect(manager.getLevel()).toBe('full');
    });

    it('should be limited when one feature degraded', () => {
      manager.handleBandwidthChange(500); // Degrade video
      expect(manager.getLevel()).toBe('limited');
    });

    it('should be audio_only when audio-only fallback active', () => {
      manager.handleBandwidthChange(100);
      expect(manager.getLevel()).toBe('audio_only');
    });

    it('should be limited when AI unavailable', () => {
      manager.handleAIUnavailable('test');
      expect(manager.getLevel()).toBe('limited');
    });
  });

  describe('callbacks', () => {
    it('should call onLevelChanged callback', () => {
      const onLevelChanged = vi.fn();
      manager.setCallbacks({ onLevelChanged });
      manager.handleBandwidthChange(100);
      expect(onLevelChanged).toHaveBeenCalledWith('audio_only', 'full');
    });

    it('should call onFallbackActivated callback', () => {
      const onFallbackActivated = vi.fn();
      manager.setCallbacks({ onFallbackActivated });
      manager.handleBandwidthChange(100);
      expect(onFallbackActivated).toHaveBeenCalledWith('audio_only', expect.any(String));
    });

    it('should call onFallbackDeactivated callback', () => {
      const onFallbackDeactivated = vi.fn();
      manager.setCallbacks({ onFallbackDeactivated });
      manager.handleBandwidthChange(100);
      manager.handleBandwidthChange(2000);
      expect(onFallbackDeactivated).toHaveBeenCalledWith('audio_only');
    });

    it('should call onFeatureDegraded callback', () => {
      const onFeatureDegraded = vi.fn();
      manager.setCallbacks({ onFeatureDegraded });
      manager.handleAIUnavailable('Service down');
      expect(onFeatureDegraded).toHaveBeenCalledWith('ai', 'Service down');
    });

    it('should call onFeatureRestored callback', () => {
      const onFeatureRestored = vi.fn();
      manager.setCallbacks({ onFeatureRestored });
      manager.handleAIUnavailable('Service down');
      manager.handleAIRestored();
      expect(onFeatureRestored).toHaveBeenCalledWith('ai');
    });
  });

  describe('event history', () => {
    it('should record degradation events', () => {
      manager.handleBandwidthChange(100);
      const history = manager.getEventHistory();
      expect(history.length).toBeGreaterThan(0);
      expect(history.some(e => e.type === 'fallback_activated')).toBe(true);
    });

    it('should include timestamp in events', () => {
      manager.handleAIUnavailable('test');
      const history = manager.getEventHistory();
      expect(history[0].timestamp).toBeInstanceOf(Date);
    });

    it('should limit event history size', () => {
      // Generate many events
      for (let i = 0; i < 150; i++) {
        manager.handleAIUnavailable(`test-${i}`);
        manager.handleAIRestored();
      }
      const history = manager.getEventHistory();
      expect(history.length).toBeLessThanOrEqual(100);
    });
  });

  describe('circuit breakers', () => {
    it('should create circuit breaker for service', () => {
      const breaker = manager.getCircuitBreaker('ai-service');
      expect(breaker).toBeDefined();
      expect(breaker.getName()).toBe('ai-service');
    });

    it('should reuse existing circuit breaker', () => {
      const breaker1 = manager.getCircuitBreaker('ai-service');
      const breaker2 = manager.getCircuitBreaker('ai-service');
      expect(breaker1).toBe(breaker2);
    });

    it('should check service availability', () => {
      manager.getCircuitBreaker('ai-service');
      expect(manager.isServiceAvailable('ai-service')).toBe(true);
    });

    it('should return true for unknown services', () => {
      expect(manager.isServiceAvailable('unknown-service')).toBe(true);
    });

    it('should record service success', () => {
      const breaker = manager.getCircuitBreaker('ai-service');
      manager.recordServiceSuccess('ai-service');
      const stats = breaker.getStats();
      expect(stats.lastSuccess).not.toBeNull();
    });

    it('should record service failure', () => {
      const breaker = manager.getCircuitBreaker('ai-service');
      manager.recordServiceFailure('ai-service');
      const stats = breaker.getStats();
      expect(stats.failures).toBe(1);
    });
  });
});

describe('CircuitBreaker', () => {
  let breaker: CircuitBreaker;

  beforeEach(() => {
    breaker = new CircuitBreaker('test-service');
  });

  afterEach(() => {
    breaker.destroy();
  });

  describe('initialization', () => {
    it('should start in closed state', () => {
      expect(breaker.getState()).toBe('closed');
    });

    it('should allow requests when closed', () => {
      expect(breaker.allowRequest()).toBe(true);
    });

    it('should have zero failures initially', () => {
      const stats = breaker.getStats();
      expect(stats.failures).toBe(0);
    });
  });

  describe('failure handling', () => {
    it('should increment failure count', () => {
      breaker.recordFailure();
      expect(breaker.getStats().failures).toBe(1);
    });

    it('should open circuit after threshold failures', () => {
      for (let i = 0; i < DEFAULT_CIRCUIT_BREAKER_CONFIG.failureThreshold; i++) {
        breaker.recordFailure();
      }
      expect(breaker.getState()).toBe('open');
    });

    it('should deny requests when open', () => {
      for (let i = 0; i < DEFAULT_CIRCUIT_BREAKER_CONFIG.failureThreshold; i++) {
        breaker.recordFailure();
      }
      expect(breaker.allowRequest()).toBe(false);
    });

    it('should record last failure time', () => {
      breaker.recordFailure();
      expect(breaker.getStats().lastFailure).not.toBeNull();
    });
  });

  describe('success handling', () => {
    it('should reset failure count on success', () => {
      breaker.recordFailure();
      breaker.recordFailure();
      breaker.recordSuccess();
      expect(breaker.getStats().failures).toBe(0);
    });

    it('should record last success time', () => {
      breaker.recordSuccess();
      expect(breaker.getStats().lastSuccess).not.toBeNull();
    });
  });

  describe('half-open state', () => {
    it('should transition to half-open after reset timeout', () => {
      const quickBreaker = new CircuitBreaker('quick', {
        ...DEFAULT_CIRCUIT_BREAKER_CONFIG,
        resetTimeout: 0, // Immediate
      });

      // Open the circuit
      for (let i = 0; i < DEFAULT_CIRCUIT_BREAKER_CONFIG.failureThreshold; i++) {
        quickBreaker.recordFailure();
      }

      // Allow request should transition to half-open
      expect(quickBreaker.allowRequest()).toBe(true);
      expect(quickBreaker.getState()).toBe('half_open');

      quickBreaker.destroy();
    });

    it('should close circuit after successes in half-open', () => {
      const quickBreaker = new CircuitBreaker('quick', {
        ...DEFAULT_CIRCUIT_BREAKER_CONFIG,
        resetTimeout: 0,
        successThreshold: 2,
      });

      // Open the circuit
      for (let i = 0; i < DEFAULT_CIRCUIT_BREAKER_CONFIG.failureThreshold; i++) {
        quickBreaker.recordFailure();
      }

      // Transition to half-open
      quickBreaker.allowRequest();

      // Record successes
      quickBreaker.recordSuccess();
      quickBreaker.recordSuccess();

      expect(quickBreaker.getState()).toBe('closed');

      quickBreaker.destroy();
    });

    it('should reopen circuit on failure in half-open', () => {
      const quickBreaker = new CircuitBreaker('quick', {
        ...DEFAULT_CIRCUIT_BREAKER_CONFIG,
        resetTimeout: 0,
      });

      // Open the circuit
      for (let i = 0; i < DEFAULT_CIRCUIT_BREAKER_CONFIG.failureThreshold; i++) {
        quickBreaker.recordFailure();
      }

      // Transition to half-open
      quickBreaker.allowRequest();
      expect(quickBreaker.getState()).toBe('half_open');

      // Failure reopens circuit
      quickBreaker.recordFailure();
      expect(quickBreaker.getState()).toBe('open');

      quickBreaker.destroy();
    });
  });

  describe('manual control', () => {
    it('should allow manual trip', () => {
      breaker.trip();
      expect(breaker.getState()).toBe('open');
    });

    it('should allow manual reset', () => {
      breaker.trip();
      breaker.reset();
      expect(breaker.getState()).toBe('closed');
    });
  });

  describe('custom configuration', () => {
    it('should accept custom failure threshold', () => {
      const customBreaker = new CircuitBreaker('custom', {
        ...DEFAULT_CIRCUIT_BREAKER_CONFIG,
        failureThreshold: 3,
      });

      customBreaker.recordFailure();
      customBreaker.recordFailure();
      expect(customBreaker.getState()).toBe('closed');

      customBreaker.recordFailure();
      expect(customBreaker.getState()).toBe('open');

      customBreaker.destroy();
    });
  });
});

describe('getDegradationIndicator', () => {
  it('should return info severity for full level', () => {
    const state: DegradationState = {
      level: 'full',
      features: {
        video: { available: true, degraded: false },
        audio: { available: true, degraded: false },
        ai: { available: true, degraded: false },
        signaling: { available: true, degraded: false },
        webrtc: { available: true, degraded: false },
      },
      activeFallbacks: [],
      lastUpdated: new Date(),
    };

    const indicator = getDegradationIndicator(state);
    expect(indicator.level).toBe('full');
    expect(indicator.severity).toBe('info');
    expect(indicator.message).toBe('All features available');
    expect(indicator.details).toHaveLength(0);
  });

  it('should return warning severity for limited level', () => {
    const state: DegradationState = {
      level: 'limited',
      features: {
        video: { available: true, degraded: true, reason: 'Low bandwidth' },
        audio: { available: true, degraded: false },
        ai: { available: true, degraded: false },
        signaling: { available: true, degraded: false },
        webrtc: { available: true, degraded: false },
      },
      activeFallbacks: [],
      lastUpdated: new Date(),
    };

    const indicator = getDegradationIndicator(state);
    expect(indicator.severity).toBe('warning');
    expect(indicator.details).toContain('video degraded: Low bandwidth');
  });

  it('should return warning severity for audio_only level', () => {
    const state: DegradationState = {
      level: 'audio_only',
      features: {
        video: { available: false, degraded: false, reason: 'Disabled' },
        audio: { available: true, degraded: false },
        ai: { available: true, degraded: false },
        signaling: { available: true, degraded: false },
        webrtc: { available: true, degraded: false },
      },
      activeFallbacks: ['audio_only'],
      lastUpdated: new Date(),
    };

    const indicator = getDegradationIndicator(state);
    expect(indicator.level).toBe('audio_only');
    expect(indicator.severity).toBe('warning');
    expect(indicator.message).toBe('Audio-only mode');
  });

  it('should return error severity for minimal level', () => {
    const state: DegradationState = {
      level: 'minimal',
      features: {
        video: { available: true, degraded: true },
        audio: { available: true, degraded: true },
        ai: { available: true, degraded: true },
        signaling: { available: true, degraded: false },
        webrtc: { available: true, degraded: false },
      },
      activeFallbacks: [],
      lastUpdated: new Date(),
    };

    const indicator = getDegradationIndicator(state);
    expect(indicator.severity).toBe('error');
    expect(indicator.message).toBe('Limited functionality');
  });

  it('should return error severity for offline level', () => {
    const state: DegradationState = {
      level: 'offline',
      features: {
        video: { available: false, degraded: false },
        audio: { available: false, degraded: false },
        ai: { available: false, degraded: false },
        signaling: { available: false, degraded: false },
        webrtc: { available: false, degraded: false },
      },
      activeFallbacks: [],
      lastUpdated: new Date(),
    };

    const indicator = getDegradationIndicator(state);
    expect(indicator.level).toBe('offline');
    expect(indicator.severity).toBe('error');
    expect(indicator.message).toBe('Connection lost');
  });

  it('should include active fallbacks in details', () => {
    const state: DegradationState = {
      level: 'limited',
      features: {
        video: { available: true, degraded: false },
        audio: { available: true, degraded: false },
        ai: { available: true, degraded: false },
        signaling: { available: true, degraded: false },
        webrtc: { available: true, degraded: false },
      },
      activeFallbacks: ['ai_unavailable'],
      lastUpdated: new Date(),
    };

    const indicator = getDegradationIndicator(state);
    expect(indicator.details).toContain('Fallback active: ai_unavailable');
  });
});

describe('shouldDisableVideo', () => {
  it('should return true when bandwidth below minimum', () => {
    expect(shouldDisableVideo(100)).toBe(true);
  });

  it('should return false when bandwidth above minimum', () => {
    expect(shouldDisableVideo(200)).toBe(false);
  });

  it('should use custom thresholds', () => {
    const customThresholds = {
      ...DEFAULT_BANDWIDTH_THRESHOLDS,
      videoMinBandwidth: 300,
    };
    expect(shouldDisableVideo(250, customThresholds)).toBe(true);
    expect(shouldDisableVideo(350, customThresholds)).toBe(false);
  });
});

describe('shouldDisableHDVideo', () => {
  it('should return true when bandwidth below HD minimum', () => {
    expect(shouldDisableHDVideo(500)).toBe(true);
  });

  it('should return false when bandwidth above HD minimum', () => {
    expect(shouldDisableHDVideo(1500)).toBe(false);
  });

  it('should use custom thresholds', () => {
    const customThresholds = {
      ...DEFAULT_BANDWIDTH_THRESHOLDS,
      videoHDMinBandwidth: 2000,
    };
    expect(shouldDisableHDVideo(1500, customThresholds)).toBe(true);
    expect(shouldDisableHDVideo(2500, customThresholds)).toBe(false);
  });
});

describe('calculateConnectionQuality', () => {
  it('should return 100 for perfect connection', () => {
    expect(calculateConnectionQuality(0, 0)).toBe(100);
  });

  it('should deduct for moderate latency', () => {
    const score = calculateConnectionQuality(100, 0);
    expect(score).toBeLessThan(100);
    expect(score).toBeGreaterThan(50);
  });

  it('should deduct heavily for high latency', () => {
    const score = calculateConnectionQuality(400, 0);
    expect(score).toBeLessThanOrEqual(50);
  });

  it('should deduct for moderate packet loss', () => {
    const score = calculateConnectionQuality(0, 3);
    expect(score).toBeLessThan(100);
    expect(score).toBeGreaterThan(50);
  });

  it('should deduct heavily for high packet loss', () => {
    const score = calculateConnectionQuality(0, 10);
    expect(score).toBeLessThanOrEqual(50);
  });

  it('should combine latency and packet loss deductions', () => {
    const score = calculateConnectionQuality(200, 3);
    expect(score).toBeLessThan(75);
  });

  it('should not go below 0', () => {
    const score = calculateConnectionQuality(1000, 100);
    expect(score).toBe(0);
  });

  it('should handle null latency', () => {
    const score = calculateConnectionQuality(null, 0);
    expect(score).toBe(100);
  });
});

describe('getRecommendedAction', () => {
  it('should return null for full level', () => {
    const state: DegradationState = {
      level: 'full',
      features: {
        video: { available: true, degraded: false },
        audio: { available: true, degraded: false },
        ai: { available: true, degraded: false },
        signaling: { available: true, degraded: false },
        webrtc: { available: true, degraded: false },
      },
      activeFallbacks: [],
      lastUpdated: new Date(),
    };
    expect(getRecommendedAction(state)).toBeNull();
  });

  it('should recommend checking connection for offline', () => {
    const state: DegradationState = {
      level: 'offline',
      features: {
        video: { available: false, degraded: false },
        audio: { available: false, degraded: false },
        ai: { available: false, degraded: false },
        signaling: { available: false, degraded: false },
        webrtc: { available: false, degraded: false },
      },
      activeFallbacks: [],
      lastUpdated: new Date(),
    };
    const action = getRecommendedAction(state);
    expect(action).toContain('internet connection');
  });

  it('should recommend refresh for minimal', () => {
    const state: DegradationState = {
      level: 'minimal',
      features: {
        video: { available: true, degraded: true },
        audio: { available: true, degraded: true },
        ai: { available: true, degraded: true },
        signaling: { available: true, degraded: false },
        webrtc: { available: true, degraded: false },
      },
      activeFallbacks: [],
      lastUpdated: new Date(),
    };
    const action = getRecommendedAction(state);
    expect(action).toContain('refresh');
  });

  it('should mention bandwidth for audio_only', () => {
    const state: DegradationState = {
      level: 'audio_only',
      features: {
        video: { available: false, degraded: false },
        audio: { available: true, degraded: false },
        ai: { available: true, degraded: false },
        signaling: { available: true, degraded: false },
        webrtc: { available: true, degraded: false },
      },
      activeFallbacks: ['audio_only'],
      lastUpdated: new Date(),
    };
    const action = getRecommendedAction(state);
    expect(action).toContain('bandwidth');
  });

  it('should mention network for limited', () => {
    const state: DegradationState = {
      level: 'limited',
      features: {
        video: { available: true, degraded: true },
        audio: { available: true, degraded: false },
        ai: { available: true, degraded: false },
        signaling: { available: true, degraded: false },
        webrtc: { available: true, degraded: false },
      },
      activeFallbacks: [],
      lastUpdated: new Date(),
    };
    const action = getRecommendedAction(state);
    expect(action).toContain('network');
  });
});

describe('createDegradationManager', () => {
  it('should create a manager with default thresholds', () => {
    const manager = createDegradationManager();
    expect(manager).toBeInstanceOf(DegradationManager);
    manager.destroy();
  });

  it('should create a manager with custom thresholds', () => {
    const customThresholds = {
      ...DEFAULT_BANDWIDTH_THRESHOLDS,
      videoMinBandwidth: 200,
    };
    const manager = createDegradationManager(customThresholds);
    expect(manager).toBeInstanceOf(DegradationManager);
    manager.destroy();
  });
});

describe('Integration scenarios', () => {
  let manager: DegradationManager;

  beforeEach(() => {
    manager = createDegradationManager();
  });

  afterEach(() => {
    manager.destroy();
  });

  it('should handle progressive degradation', () => {
    // Start with full features
    expect(manager.getLevel()).toBe('full');

    // AI becomes unavailable
    manager.handleAIUnavailable('Rate limited');
    expect(manager.getLevel()).toBe('limited');

    // Bandwidth drops
    manager.handleBandwidthChange(500);
    expect(manager.getLevel()).toBe('limited');
    expect(manager.isFeatureDegraded('video')).toBe(true);

    // Bandwidth drops further
    manager.handleBandwidthChange(100);
    expect(manager.getLevel()).toBe('audio_only');
  });

  it('should handle recovery from degradation', () => {
    // Fully degraded state
    manager.handleBandwidthChange(100);
    manager.handleAIUnavailable('Down');
    expect(manager.getLevel()).toBe('audio_only');

    // Bandwidth improves
    manager.handleBandwidthChange(2000);
    expect(manager.getLevel()).toBe('limited'); // Still limited due to AI

    // AI recovers
    manager.handleAIRestored();
    expect(manager.getLevel()).toBe('full');
  });

  it('should handle peer connection issues', () => {
    const peerId = 'peer-1';

    // Add healthy peer
    manager.updatePeerHealth({
      peerId,
      connected: true,
      audioWorking: true,
      videoWorking: true,
      latency: 50,
      packetLoss: 1,
      degraded: false,
    });

    // Peer connection degrades
    manager.updatePeerHealth({
      peerId,
      connected: true,
      audioWorking: true,
      videoWorking: false,
      latency: 500,
      packetLoss: 10,
      degraded: false, // Will be set to true by manager
    });

    const health = manager.getPeerHealth(peerId);
    expect(health?.degraded).toBe(true);
  });

  it('should use circuit breaker to protect failing service', () => {
    const serviceName = 'ai-api';
    const breaker = manager.getCircuitBreaker(serviceName, {
      failureThreshold: 3,
      resetTimeout: 100,
      successThreshold: 1,
    });

    // Simulate failures
    for (let i = 0; i < 3; i++) {
      manager.recordServiceFailure(serviceName);
    }

    // Service should be unavailable
    expect(manager.isServiceAvailable(serviceName)).toBe(false);
    expect(breaker.getState()).toBe('open');
  });
});
