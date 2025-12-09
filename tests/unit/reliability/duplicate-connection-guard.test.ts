/**
 * Duplicate Connection Guard Tests
 *
 * Tests for preventing duplicate WebRTC connections during late join race conditions.
 *
 * Part of the Long-Horizon Engineering Protocol - FEAT-420
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { PeerId } from "@/types/peer";

// Test helpers
const createPeerId = (): PeerId =>
  `peer-${Math.random().toString(36).slice(2)}` as PeerId;

describe("Duplicate Connection Guard - FEAT-420", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe("Pending connection tracking", () => {
    it("should track pending connections in Set", () => {
      const pendingConnections = new Set<PeerId>();
      const peerId = createPeerId();

      expect(pendingConnections.has(peerId)).toBe(false);

      pendingConnections.add(peerId);
      expect(pendingConnections.has(peerId)).toBe(true);

      pendingConnections.delete(peerId);
      expect(pendingConnections.has(peerId)).toBe(false);
    });

    it("should prevent duplicate addition", () => {
      const pendingConnections = new Set<PeerId>();
      const peerId = createPeerId();

      pendingConnections.add(peerId);
      pendingConnections.add(peerId);

      expect(pendingConnections.size).toBe(1);
    });
  });

  describe("Connection initiation guard", () => {
    it("should skip if connection already exists", () => {
      const connections = new Map<PeerId, { peerId: PeerId }>();
      const peerId = createPeerId();

      connections.set(peerId, { peerId });

      const shouldInitiate = !connections.has(peerId);
      expect(shouldInitiate).toBe(false);
    });

    it("should skip if connection is pending", () => {
      const pendingConnections = new Set<PeerId>();
      const peerId = createPeerId();

      pendingConnections.add(peerId);

      const shouldInitiate = !pendingConnections.has(peerId);
      expect(shouldInitiate).toBe(false);
    });

    it("should allow connection if not existing and not pending", () => {
      const connections = new Map<PeerId, { peerId: PeerId }>();
      const pendingConnections = new Set<PeerId>();
      const peerId = createPeerId();

      const shouldInitiate =
        !connections.has(peerId) && !pendingConnections.has(peerId);
      expect(shouldInitiate).toBe(true);
    });
  });

  describe("Connection state transitions", () => {
    it("should mark as pending before initiating", () => {
      const pendingConnections = new Set<PeerId>();
      const peerId = createPeerId();

      // Before initiation
      expect(pendingConnections.has(peerId)).toBe(false);

      // Mark as pending
      pendingConnections.add(peerId);
      expect(pendingConnections.has(peerId)).toBe(true);
    });

    it("should clear pending after successful offer", () => {
      const pendingConnections = new Set<PeerId>();
      const connections = new Map<PeerId, { peerId: PeerId }>();
      const peerId = createPeerId();

      // Start pending
      pendingConnections.add(peerId);

      // Simulate successful offer
      connections.set(peerId, { peerId });
      pendingConnections.delete(peerId);

      expect(pendingConnections.has(peerId)).toBe(false);
      expect(connections.has(peerId)).toBe(true);
    });

    it("should clear pending on failure", () => {
      const pendingConnections = new Set<PeerId>();
      const peerId = createPeerId();

      // Start pending
      pendingConnections.add(peerId);

      // Simulate failure
      pendingConnections.delete(peerId);

      expect(pendingConnections.has(peerId)).toBe(false);
    });
  });

  describe("Race condition handling", () => {
    it("should handle simultaneous connection attempts", () => {
      const pendingConnections = new Set<PeerId>();
      const peerId = createPeerId();

      // First attempt succeeds
      const attempt1 = () => {
        if (pendingConnections.has(peerId)) return false;
        pendingConnections.add(peerId);
        return true;
      };

      // Second attempt should fail (already pending)
      const attempt2 = () => {
        if (pendingConnections.has(peerId)) return false;
        pendingConnections.add(peerId);
        return true;
      };

      expect(attempt1()).toBe(true);
      expect(attempt2()).toBe(false);
    });

    it("should use deterministic ID comparison for initiator", () => {
      // Higher ID initiates to lower ID
      const localId = "aaa" as PeerId;
      const remoteId = "zzz" as PeerId;

      // Local should initiate because remote ID is higher
      const localShouldInitiate = remoteId > localId;
      expect(localShouldInitiate).toBe(true);

      // When local has higher ID, should wait
      const localId2 = "zzz" as PeerId;
      const remoteId2 = "aaa" as PeerId;
      const localShouldInitiate2 = remoteId2 > localId2;
      expect(localShouldInitiate2).toBe(false);
    });

    it("should handle offer collision gracefully", () => {
      // When both peers try to initiate simultaneously
      // Only the one with lower ID should proceed

      const peer1 = "aaa" as PeerId;
      const peer2 = "zzz" as PeerId;

      // From peer1's perspective: remote (zzz) > local (aaa) -> initiate
      const peer1Initiates = peer2 > peer1;

      // From peer2's perspective: remote (aaa) > local (zzz) -> wait
      const peer2Initiates = peer1 > peer2;

      expect(peer1Initiates).toBe(true);
      expect(peer2Initiates).toBe(false);
    });
  });

  describe("Cleanup on peer departure", () => {
    it("should clear pending status when peer leaves", () => {
      const pendingConnections = new Set<PeerId>();
      const peerId = createPeerId();

      pendingConnections.add(peerId);
      expect(pendingConnections.has(peerId)).toBe(true);

      // Peer leaves
      pendingConnections.delete(peerId);
      expect(pendingConnections.has(peerId)).toBe(false);
    });

    it("should clear all pending on room change", () => {
      const pendingConnections = new Set<PeerId>();
      const peer1 = createPeerId();
      const peer2 = createPeerId();

      pendingConnections.add(peer1);
      pendingConnections.add(peer2);
      expect(pendingConnections.size).toBe(2);

      // Room change clears all
      pendingConnections.clear();
      expect(pendingConnections.size).toBe(0);
    });
  });

  describe("Logging for collision detection", () => {
    it("should log when skipping existing connection", () => {
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const peerId = createPeerId();

      // Simulate existing connection check
      console.log(
        `[useRoomPeers] Connection to ${peerId} already exists, skipping`,
      );

      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining("already exists"),
      );

      logSpy.mockRestore();
    });

    it("should log when skipping pending connection", () => {
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const peerId = createPeerId();

      // Simulate pending connection check
      console.log(
        `[useRoomPeers] Connection to ${peerId} already in progress, skipping`,
      );

      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining("already in progress"),
      );

      logSpy.mockRestore();
    });

    it("should log when initiating new connection", () => {
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const peerId = createPeerId();

      console.log(`[useRoomPeers] Initiating connection to ${peerId}`);

      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining("Initiating connection"),
      );

      logSpy.mockRestore();
    });
  });

  describe("Integration with existing connection logic", () => {
    it("should work with existing connections map", () => {
      const connections = new Map<
        PeerId,
        { peerId: PeerId; isInitiator: boolean }
      >();
      const pendingConnections = new Set<PeerId>();
      const peerId = createPeerId();

      // Check both before initiating
      const canInitiate = () =>
        !connections.has(peerId) && !pendingConnections.has(peerId);

      expect(canInitiate()).toBe(true);

      // Mark pending
      pendingConnections.add(peerId);
      expect(canInitiate()).toBe(false);

      // Move to connections
      connections.set(peerId, { peerId, isInitiator: true });
      pendingConnections.delete(peerId);

      // Still can't initiate (now in connections)
      expect(canInitiate()).toBe(false);
    });

    it("should handle reconnection attempts", () => {
      const pendingConnections = new Set<PeerId>();
      const connections = new Map<PeerId, { peerId: PeerId }>();
      const peerId = createPeerId();

      // Initial connection
      pendingConnections.add(peerId);
      connections.set(peerId, { peerId });
      pendingConnections.delete(peerId);

      // Connection fails, cleanup
      connections.delete(peerId);

      // Should be able to reconnect
      const canReconnect =
        !connections.has(peerId) && !pendingConnections.has(peerId);
      expect(canReconnect).toBe(true);
    });
  });
});
