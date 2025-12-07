/**
 * Graceful Degradation System
 *
 * Handles partial failures and provides fallback mechanisms for:
 * - Peer connection failures
 * - Bandwidth issues (audio-only fallback)
 * - AI session unavailability
 * - Service circuit breakers
 *
 * Part of the Long-Horizon Engineering Protocol - FEAT-405
 */

import type { PeerId } from '@/types/peer';

/**
 * Degradation level from best to worst
 */
export type DegradationLevel =
  | 'full'           // All features available
  | 'limited'        // Some features degraded
  | 'audio_only'     // Video disabled, audio only
  | 'minimal'        // Minimal functionality
  | 'offline';       // No connectivity

/**
 * Feature availability status
 */
export interface FeatureStatus {
  available: boolean;
  degraded: boolean;
  reason?: string;
}

/**
 * Overall degradation state
 */
export interface DegradationState {
  level: DegradationLevel;
  features: {
    video: FeatureStatus;
    audio: FeatureStatus;
    ai: FeatureStatus;
    signaling: FeatureStatus;
    webrtc: FeatureStatus;
  };
  activeFallbacks: string[];
  lastUpdated: Date;
}

/**
 * Peer connection health status
 */
export interface PeerConnectionHealth {
  peerId: PeerId;
  connected: boolean;
  audioWorking: boolean;
  videoWorking: boolean;
  latency: number | null;
  packetLoss: number;
  lastError?: string;
  degraded: boolean;
}

/**
 * Bandwidth thresholds for degradation decisions
 */
export interface BandwidthThresholds {
  /** Minimum bandwidth for video (kbps) */
  videoMinBandwidth: number;
  /** Minimum bandwidth for HD video (kbps) */
  videoHDMinBandwidth: number;
  /** Maximum packet loss before degradation (%) */
  maxPacketLoss: number;
  /** Maximum latency before degradation (ms) */
  maxLatency: number;
}

/**
 * Default bandwidth thresholds
 */
export const DEFAULT_BANDWIDTH_THRESHOLDS: BandwidthThresholds = {
  videoMinBandwidth: 150,      // 150 kbps minimum for video
  videoHDMinBandwidth: 1000,   // 1 Mbps for HD video
  maxPacketLoss: 5,            // 5% packet loss threshold
  maxLatency: 300,             // 300ms latency threshold
};

/**
 * Circuit breaker state
 */
export type CircuitState = 'closed' | 'open' | 'half_open';

/**
 * Circuit breaker configuration
 */
export interface CircuitBreakerConfig {
  /** Number of failures before opening circuit */
  failureThreshold: number;
  /** Time to wait before attempting reset (ms) */
  resetTimeout: number;
  /** Number of successes in half-open state to close circuit */
  successThreshold: number;
}

/**
 * Circuit breaker stats
 */
export interface CircuitBreakerStats {
  state: CircuitState;
  failures: number;
  successes: number;
  lastFailure: Date | null;
  lastSuccess: Date | null;
  lastStateChange: Date;
}

/**
 * Default circuit breaker config
 */
export const DEFAULT_CIRCUIT_BREAKER_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  resetTimeout: 30000,    // 30 seconds
  successThreshold: 2,
};

/**
 * Degradation event types
 */
export type DegradationEventType =
  | 'level_changed'
  | 'fallback_activated'
  | 'fallback_deactivated'
  | 'feature_degraded'
  | 'feature_restored'
  | 'circuit_opened'
  | 'circuit_closed';

/**
 * Degradation event
 */
export interface DegradationEvent {
  type: DegradationEventType;
  timestamp: Date;
  data: Record<string, unknown>;
}

/**
 * Degradation manager callbacks
 */
export interface DegradationCallbacks {
  onLevelChanged?: (level: DegradationLevel, previous: DegradationLevel) => void;
  onFallbackActivated?: (fallback: string, reason: string) => void;
  onFallbackDeactivated?: (fallback: string) => void;
  onFeatureDegraded?: (feature: string, reason: string) => void;
  onFeatureRestored?: (feature: string) => void;
}

/**
 * Circuit Breaker for service protection
 */
export class CircuitBreaker {
  private state: CircuitState = 'closed';
  private failures: number = 0;
  private successes: number = 0;
  private lastFailure: Date | null = null;
  private lastSuccess: Date | null = null;
  private lastStateChange: Date = new Date();
  private resetTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly name: string,
    private readonly config: CircuitBreakerConfig = DEFAULT_CIRCUIT_BREAKER_CONFIG
  ) {}

  /**
   * Get circuit breaker name
   */
  public getName(): string {
    return this.name;
  }

  /**
   * Get current state
   */
  public getState(): CircuitState {
    return this.state;
  }

  /**
   * Get statistics
   */
  public getStats(): CircuitBreakerStats {
    return {
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      lastFailure: this.lastFailure,
      lastSuccess: this.lastSuccess,
      lastStateChange: this.lastStateChange,
    };
  }

  /**
   * Check if request should be allowed
   */
  public allowRequest(): boolean {
    if (this.state === 'closed') {
      return true;
    }

    if (this.state === 'open') {
      // Check if reset timeout has passed
      const elapsed = Date.now() - this.lastStateChange.getTime();
      if (elapsed >= this.config.resetTimeout) {
        this.transitionTo('half_open');
        return true;
      }
      return false;
    }

    // Half-open state allows limited requests
    return true;
  }

  /**
   * Record a successful request
   */
  public recordSuccess(): void {
    this.lastSuccess = new Date();

    if (this.state === 'half_open') {
      this.successes++;
      if (this.successes >= this.config.successThreshold) {
        this.transitionTo('closed');
      }
    } else if (this.state === 'closed') {
      // Reset failure count on success
      this.failures = 0;
    }
  }

  /**
   * Record a failed request
   */
  public recordFailure(): void {
    this.lastFailure = new Date();
    this.failures++;

    if (this.state === 'half_open') {
      // Any failure in half-open state reopens circuit
      this.transitionTo('open');
    } else if (this.state === 'closed') {
      if (this.failures >= this.config.failureThreshold) {
        this.transitionTo('open');
      }
    }
  }

  /**
   * Force circuit open
   */
  public trip(): void {
    this.transitionTo('open');
  }

  /**
   * Force circuit closed
   */
  public reset(): void {
    this.transitionTo('closed');
  }

  /**
   * Clean up timers
   */
  public destroy(): void {
    if (this.resetTimer) {
      clearTimeout(this.resetTimer);
      this.resetTimer = null;
    }
  }

  /**
   * Transition to new state
   */
  private transitionTo(newState: CircuitState): void {
    if (this.state === newState) return;

    this.state = newState;
    this.lastStateChange = new Date();

    if (newState === 'closed') {
      this.failures = 0;
      this.successes = 0;
    } else if (newState === 'half_open') {
      this.successes = 0;
    }

    // Clear any existing reset timer
    if (this.resetTimer) {
      clearTimeout(this.resetTimer);
      this.resetTimer = null;
    }
  }
}

/**
 * Graceful Degradation Manager
 */
export class DegradationManager {
  private state: DegradationState;
  private peerHealth: Map<PeerId, PeerConnectionHealth> = new Map();
  private circuitBreakers: Map<string, CircuitBreaker> = new Map();
  private callbacks: DegradationCallbacks = {};
  private eventHistory: DegradationEvent[] = [];

  constructor(
    private readonly thresholds: BandwidthThresholds = DEFAULT_BANDWIDTH_THRESHOLDS
  ) {
    this.state = this.createInitialState();
  }

  /**
   * Create initial degradation state
   */
  private createInitialState(): DegradationState {
    return {
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
  }

  /**
   * Get current degradation state
   */
  public getState(): DegradationState {
    return { ...this.state };
  }

  /**
   * Get current degradation level
   */
  public getLevel(): DegradationLevel {
    return this.state.level;
  }

  /**
   * Check if a feature is available
   */
  public isFeatureAvailable(feature: keyof DegradationState['features']): boolean {
    return this.state.features[feature].available;
  }

  /**
   * Check if a feature is degraded
   */
  public isFeatureDegraded(feature: keyof DegradationState['features']): boolean {
    return this.state.features[feature].degraded;
  }

  /**
   * Get peer connection health
   */
  public getPeerHealth(peerId: PeerId): PeerConnectionHealth | undefined {
    return this.peerHealth.get(peerId);
  }

  /**
   * Get all peer health statuses
   */
  public getAllPeerHealth(): PeerConnectionHealth[] {
    return Array.from(this.peerHealth.values());
  }

  /**
   * Set callbacks
   */
  public setCallbacks(callbacks: DegradationCallbacks): void {
    this.callbacks = callbacks;
  }

  /**
   * Update peer connection health
   */
  public updatePeerHealth(health: PeerConnectionHealth): void {
    const existing = this.peerHealth.get(health.peerId);
    this.peerHealth.set(health.peerId, health);

    // Check if degradation is needed
    if (health.packetLoss > this.thresholds.maxPacketLoss ||
        (health.latency !== null && health.latency > this.thresholds.maxLatency)) {
      health.degraded = true;
    }

    // Notify if peer became degraded
    if (health.degraded && (!existing || !existing.degraded)) {
      this.emitEvent('feature_degraded', { peerId: health.peerId, reason: 'connection_quality' });
    }

    this.recalculateState();
  }

  /**
   * Remove peer health tracking
   */
  public removePeerHealth(peerId: PeerId): void {
    this.peerHealth.delete(peerId);
    this.recalculateState();
  }

  /**
   * Handle bandwidth change
   */
  public handleBandwidthChange(availableBandwidth: number): void {
    if (availableBandwidth < this.thresholds.videoMinBandwidth) {
      this.activateFallback('audio_only', 'Insufficient bandwidth for video');
    } else if (availableBandwidth < this.thresholds.videoHDMinBandwidth) {
      this.degradeFeature('video', 'Bandwidth below HD threshold');
    } else {
      // Bandwidth is good - restore video if it was degraded
      if (this.state.features.video.degraded) {
        this.restoreFeature('video');
      }
      if (this.state.activeFallbacks.includes('audio_only')) {
        this.deactivateFallback('audio_only');
      }
    }
  }

  /**
   * Handle AI session unavailability
   */
  public handleAIUnavailable(reason: string): void {
    this.degradeFeature('ai', reason);
    this.activateFallback('ai_unavailable', reason);
  }

  /**
   * Handle AI session restored
   */
  public handleAIRestored(): void {
    this.restoreFeature('ai');
    this.deactivateFallback('ai_unavailable');
  }

  /**
   * Handle signaling connection issues
   */
  public handleSignalingIssue(issue: string): void {
    this.degradeFeature('signaling', issue);
  }

  /**
   * Handle signaling restored
   */
  public handleSignalingRestored(): void {
    this.restoreFeature('signaling');
  }

  /**
   * Handle partial peer connection failure
   */
  public handlePeerConnectionFailure(peerId: PeerId, error: string): void {
    const health = this.peerHealth.get(peerId) || {
      peerId,
      connected: false,
      audioWorking: false,
      videoWorking: false,
      latency: null,
      packetLoss: 100,
      degraded: true,
    };

    health.connected = false;
    health.lastError = error;
    health.degraded = true;

    this.peerHealth.set(peerId, health);
    this.recalculateState();
  }

  /**
   * Get or create circuit breaker for a service
   */
  public getCircuitBreaker(
    serviceName: string,
    config?: CircuitBreakerConfig
  ): CircuitBreaker {
    let breaker = this.circuitBreakers.get(serviceName);
    if (!breaker) {
      breaker = new CircuitBreaker(serviceName, config);
      this.circuitBreakers.set(serviceName, breaker);
    }
    return breaker;
  }

  /**
   * Check if a service is available (circuit closed or half-open)
   */
  public isServiceAvailable(serviceName: string): boolean {
    const breaker = this.circuitBreakers.get(serviceName);
    if (!breaker) return true;
    return breaker.allowRequest();
  }

  /**
   * Record service success
   */
  public recordServiceSuccess(serviceName: string): void {
    const breaker = this.circuitBreakers.get(serviceName);
    if (breaker) {
      const wasOpen = breaker.getState() !== 'closed';
      breaker.recordSuccess();
      if (wasOpen && breaker.getState() === 'closed') {
        this.emitEvent('circuit_closed', { service: serviceName });
      }
    }
  }

  /**
   * Record service failure
   */
  public recordServiceFailure(serviceName: string): void {
    const breaker = this.circuitBreakers.get(serviceName);
    if (breaker) {
      const wasClosed = breaker.getState() !== 'open';
      breaker.recordFailure();
      if (wasClosed && breaker.getState() === 'open') {
        this.emitEvent('circuit_opened', { service: serviceName });
      }
    }
  }

  /**
   * Get event history
   */
  public getEventHistory(): DegradationEvent[] {
    return [...this.eventHistory];
  }

  /**
   * Get active fallbacks
   */
  public getActiveFallbacks(): string[] {
    return [...this.state.activeFallbacks];
  }

  /**
   * Clean up resources
   */
  public destroy(): void {
    for (const breaker of this.circuitBreakers.values()) {
      breaker.destroy();
    }
    this.circuitBreakers.clear();
    this.peerHealth.clear();
    this.eventHistory = [];
  }

  /**
   * Activate a fallback mode
   */
  private activateFallback(fallback: string, reason: string): void {
    if (!this.state.activeFallbacks.includes(fallback)) {
      this.state.activeFallbacks.push(fallback);
      this.state.lastUpdated = new Date();
      this.emitEvent('fallback_activated', { fallback, reason });
      this.callbacks.onFallbackActivated?.(fallback, reason);
      this.recalculateState();
    }
  }

  /**
   * Deactivate a fallback mode
   */
  private deactivateFallback(fallback: string): void {
    const index = this.state.activeFallbacks.indexOf(fallback);
    if (index !== -1) {
      this.state.activeFallbacks.splice(index, 1);
      this.state.lastUpdated = new Date();
      this.emitEvent('fallback_deactivated', { fallback });
      this.callbacks.onFallbackDeactivated?.(fallback);
      this.recalculateState();
    }
  }

  /**
   * Degrade a feature
   */
  private degradeFeature(
    feature: keyof DegradationState['features'],
    reason: string
  ): void {
    if (!this.state.features[feature].degraded) {
      this.state.features[feature].degraded = true;
      this.state.features[feature].reason = reason;
      this.state.lastUpdated = new Date();
      this.emitEvent('feature_degraded', { feature, reason });
      this.callbacks.onFeatureDegraded?.(feature, reason);
      this.recalculateState();
    }
  }

  /**
   * Restore a feature
   */
  private restoreFeature(feature: keyof DegradationState['features']): void {
    if (this.state.features[feature].degraded) {
      this.state.features[feature].degraded = false;
      this.state.features[feature].reason = undefined;
      this.state.lastUpdated = new Date();
      this.emitEvent('feature_restored', { feature });
      this.callbacks.onFeatureRestored?.(feature);
      this.recalculateState();
    }
  }

  /**
   * Recalculate overall degradation level
   */
  private recalculateState(): void {
    const previousLevel = this.state.level;
    const features = this.state.features;
    const fallbacks = this.state.activeFallbacks;

    // Determine level based on feature states and fallbacks
    let newLevel: DegradationLevel = 'full';

    // Check for offline state
    if (!features.signaling.available || !features.webrtc.available) {
      newLevel = 'offline';
    }
    // Check for audio-only mode
    else if (fallbacks.includes('audio_only') || !features.video.available) {
      newLevel = 'audio_only';
    }
    // Check for minimal state (multiple features down)
    else if (this.countDegradedFeatures() >= 3) {
      newLevel = 'minimal';
    }
    // Check for limited state
    else if (this.countDegradedFeatures() >= 1 || fallbacks.length > 0) {
      newLevel = 'limited';
    }

    // Update level if changed
    if (newLevel !== previousLevel) {
      this.state.level = newLevel;
      this.state.lastUpdated = new Date();
      this.emitEvent('level_changed', { level: newLevel, previous: previousLevel });
      this.callbacks.onLevelChanged?.(newLevel, previousLevel);
    }
  }

  /**
   * Count degraded features
   */
  private countDegradedFeatures(): number {
    return Object.values(this.state.features).filter(f => f.degraded || !f.available).length;
  }

  /**
   * Emit degradation event
   */
  private emitEvent(type: DegradationEventType, data: Record<string, unknown>): void {
    const event: DegradationEvent = {
      type,
      timestamp: new Date(),
      data,
    };
    this.eventHistory.push(event);

    // Keep history limited
    if (this.eventHistory.length > 100) {
      this.eventHistory.shift();
    }
  }
}

/**
 * Degradation state indicator information
 */
export interface DegradationIndicator {
  level: DegradationLevel;
  message: string;
  details: string[];
  severity: 'info' | 'warning' | 'error';
}

/**
 * Get degradation indicator for UI display
 */
export function getDegradationIndicator(state: DegradationState): DegradationIndicator {
  const details: string[] = [];

  // Collect degraded features
  for (const [name, status] of Object.entries(state.features)) {
    if (!status.available) {
      details.push(`${name} unavailable${status.reason ? `: ${status.reason}` : ''}`);
    } else if (status.degraded) {
      details.push(`${name} degraded${status.reason ? `: ${status.reason}` : ''}`);
    }
  }

  // Add active fallbacks
  for (const fallback of state.activeFallbacks) {
    details.push(`Fallback active: ${fallback}`);
  }

  // Determine message and severity
  let message: string;
  let severity: 'info' | 'warning' | 'error';

  switch (state.level) {
    case 'full':
      message = 'All features available';
      severity = 'info';
      break;
    case 'limited':
      message = 'Some features limited';
      severity = 'warning';
      break;
    case 'audio_only':
      message = 'Audio-only mode';
      severity = 'warning';
      break;
    case 'minimal':
      message = 'Limited functionality';
      severity = 'error';
      break;
    case 'offline':
      message = 'Connection lost';
      severity = 'error';
      break;
  }

  return {
    level: state.level,
    message,
    details,
    severity,
  };
}

/**
 * Check if video should be disabled based on bandwidth
 */
export function shouldDisableVideo(
  availableBandwidth: number,
  thresholds: BandwidthThresholds = DEFAULT_BANDWIDTH_THRESHOLDS
): boolean {
  return availableBandwidth < thresholds.videoMinBandwidth;
}

/**
 * Check if HD video should be disabled
 */
export function shouldDisableHDVideo(
  availableBandwidth: number,
  thresholds: BandwidthThresholds = DEFAULT_BANDWIDTH_THRESHOLDS
): boolean {
  return availableBandwidth < thresholds.videoHDMinBandwidth;
}

/**
 * Calculate connection quality score (0-100)
 */
export function calculateConnectionQuality(
  latency: number | null,
  packetLoss: number,
  thresholds: BandwidthThresholds = DEFAULT_BANDWIDTH_THRESHOLDS
): number {
  let score = 100;

  // Deduct for latency
  if (latency !== null) {
    if (latency > thresholds.maxLatency) {
      score -= 50;
    } else if (latency > thresholds.maxLatency / 2) {
      score -= 25;
    } else if (latency > thresholds.maxLatency / 4) {
      score -= 10;
    }
  }

  // Deduct for packet loss
  if (packetLoss > thresholds.maxPacketLoss) {
    score -= 50;
  } else if (packetLoss > thresholds.maxPacketLoss / 2) {
    score -= 25;
  } else if (packetLoss > 0) {
    score -= 10;
  }

  return Math.max(0, score);
}

/**
 * Get recommended action based on degradation state
 */
export function getRecommendedAction(state: DegradationState): string | null {
  switch (state.level) {
    case 'offline':
      return 'Check your internet connection and try reconnecting';
    case 'minimal':
      return 'Consider refreshing the page or rejoining the room';
    case 'audio_only':
      return 'Video disabled due to bandwidth. Consider closing other applications';
    case 'limited':
      return 'Some features may be unavailable. Check your network quality';
    case 'full':
      return null;
  }
}

/**
 * Create a new DegradationManager instance
 */
export function createDegradationManager(
  thresholds?: BandwidthThresholds
): DegradationManager {
  return new DegradationManager(thresholds);
}
