/**
 * Room Permissions Tests
 *
 * Tests for role-based permission management.
 *
 * Part of the Long-Horizon Engineering Protocol - FEAT-403
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  // Permission types and constants
  RoomPermission,
  ROLE_HIERARCHY,
  ROLE_PERMISSIONS,
  // Permission checking functions
  hasPermission,
  isHigherRole,
  isAtLeastRole,
  getMinimumRoleForPermission,
  canPerformAction,
  canKick,
  canBan,
  canChangeRole,
  canInterruptAI,
  canChangeAISettings,
  canUpdateRoom,
  canCloseRoom,
  canDeleteRoom,
  // Permission Manager
  PermissionManager,
  createPermissionManager,
} from '@/lib/permissions';
import type { PeerRole, PeerId } from '@/types/peer';
import type { RoomId } from '@/types/room';
import type { UserId } from '@/types/auth';

// Test data helpers
const createUserId = (suffix: string = ''): UserId => `user-${suffix || Math.random().toString(36).slice(2)}` as UserId;
const createPeerId = (suffix: string = ''): PeerId => `peer-${suffix || Math.random().toString(36).slice(2)}` as PeerId;
const createRoomId = (suffix: string = ''): RoomId => `room-${suffix || Math.random().toString(36).slice(2)}` as RoomId;

describe('Room Permissions - FEAT-403', () => {
  // ========== Role Hierarchy ==========

  describe('Role Hierarchy', () => {
    it('should define correct hierarchy levels', () => {
      expect(ROLE_HIERARCHY.participant).toBe(0);
      expect(ROLE_HIERARCHY.moderator).toBe(1);
      expect(ROLE_HIERARCHY.owner).toBe(2);
    });

    it('should have owner as highest role', () => {
      expect(ROLE_HIERARCHY.owner).toBeGreaterThan(ROLE_HIERARCHY.moderator);
      expect(ROLE_HIERARCHY.owner).toBeGreaterThan(ROLE_HIERARCHY.participant);
    });

    it('should have moderator higher than participant', () => {
      expect(ROLE_HIERARCHY.moderator).toBeGreaterThan(ROLE_HIERARCHY.participant);
    });
  });

  // ========== Role Permissions ==========

  describe('Role Permissions', () => {
    it('should give participant no special permissions', () => {
      expect(ROLE_PERMISSIONS.participant).toEqual([]);
    });

    it('should give moderator kick, mute, and interrupt permissions', () => {
      expect(ROLE_PERMISSIONS.moderator).toContain('participant:kick');
      expect(ROLE_PERMISSIONS.moderator).toContain('participant:mute');
      expect(ROLE_PERMISSIONS.moderator).toContain('ai:interrupt');
    });

    it('should give owner all permissions', () => {
      const ownerPermissions = ROLE_PERMISSIONS.owner;
      expect(ownerPermissions).toContain('room:update');
      expect(ownerPermissions).toContain('room:close');
      expect(ownerPermissions).toContain('room:delete');
      expect(ownerPermissions).toContain('room:voice_settings');
      expect(ownerPermissions).toContain('participant:kick');
      expect(ownerPermissions).toContain('participant:ban');
      expect(ownerPermissions).toContain('participant:mute');
      expect(ownerPermissions).toContain('participant:role');
      expect(ownerPermissions).toContain('ai:interrupt');
      expect(ownerPermissions).toContain('ai:personality');
      expect(ownerPermissions).toContain('ai:settings');
      expect(ownerPermissions).toContain('moderator:assign');
      expect(ownerPermissions).toContain('moderator:revoke');
    });

    it('should not give moderator ban permission', () => {
      expect(ROLE_PERMISSIONS.moderator).not.toContain('participant:ban');
    });

    it('should not give moderator room management permissions', () => {
      expect(ROLE_PERMISSIONS.moderator).not.toContain('room:update');
      expect(ROLE_PERMISSIONS.moderator).not.toContain('room:close');
      expect(ROLE_PERMISSIONS.moderator).not.toContain('room:delete');
    });
  });

  // ========== Permission Checking Functions ==========

  describe('hasPermission', () => {
    it('should return true when role has permission', () => {
      expect(hasPermission('owner', 'room:update')).toBe(true);
      expect(hasPermission('moderator', 'participant:kick')).toBe(true);
    });

    it('should return false when role lacks permission', () => {
      expect(hasPermission('participant', 'room:update')).toBe(false);
      expect(hasPermission('moderator', 'participant:ban')).toBe(false);
    });
  });

  describe('isHigherRole', () => {
    it('should return true when first role is higher', () => {
      expect(isHigherRole('owner', 'moderator')).toBe(true);
      expect(isHigherRole('owner', 'participant')).toBe(true);
      expect(isHigherRole('moderator', 'participant')).toBe(true);
    });

    it('should return false when roles are equal', () => {
      expect(isHigherRole('owner', 'owner')).toBe(false);
      expect(isHigherRole('moderator', 'moderator')).toBe(false);
      expect(isHigherRole('participant', 'participant')).toBe(false);
    });

    it('should return false when first role is lower', () => {
      expect(isHigherRole('moderator', 'owner')).toBe(false);
      expect(isHigherRole('participant', 'owner')).toBe(false);
      expect(isHigherRole('participant', 'moderator')).toBe(false);
    });
  });

  describe('isAtLeastRole', () => {
    it('should return true when first role is equal or higher', () => {
      expect(isAtLeastRole('owner', 'owner')).toBe(true);
      expect(isAtLeastRole('owner', 'moderator')).toBe(true);
      expect(isAtLeastRole('moderator', 'moderator')).toBe(true);
      expect(isAtLeastRole('moderator', 'participant')).toBe(true);
    });

    it('should return false when first role is lower', () => {
      expect(isAtLeastRole('moderator', 'owner')).toBe(false);
      expect(isAtLeastRole('participant', 'moderator')).toBe(false);
    });
  });

  describe('getMinimumRoleForPermission', () => {
    it('should return moderator for kick permission', () => {
      expect(getMinimumRoleForPermission('participant:kick')).toBe('moderator');
    });

    it('should return owner for ban permission', () => {
      expect(getMinimumRoleForPermission('participant:ban')).toBe('owner');
    });

    it('should return owner for room management', () => {
      expect(getMinimumRoleForPermission('room:update')).toBe('owner');
      expect(getMinimumRoleForPermission('room:close')).toBe('owner');
    });

    it('should return null for non-existent permission', () => {
      expect(getMinimumRoleForPermission('nonexistent' as RoomPermission)).toBeNull();
    });
  });

  describe('canPerformAction', () => {
    it('should allow action when role has permission', () => {
      const result = canPerformAction('owner', 'room:update');
      expect(result.allowed).toBe(true);
    });

    it('should deny action when role lacks permission', () => {
      const result = canPerformAction('participant', 'room:update');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('owner');
      expect(result.requiredRole).toBe('owner');
    });
  });

  // ========== Specific Permission Checks ==========

  describe('canKick', () => {
    it('should allow owner to kick participant', () => {
      const result = canKick({
        roomId: createRoomId(),
        targetPeerId: createPeerId(),
        targetUserId: createUserId('target'),
        targetRole: 'participant',
        kickedBy: createUserId('owner'),
        kickedByRole: 'owner',
      });
      expect(result.allowed).toBe(true);
    });

    it('should allow owner to kick moderator', () => {
      const result = canKick({
        roomId: createRoomId(),
        targetPeerId: createPeerId(),
        targetUserId: createUserId('target'),
        targetRole: 'moderator',
        kickedBy: createUserId('owner'),
        kickedByRole: 'owner',
      });
      expect(result.allowed).toBe(true);
    });

    it('should allow moderator to kick participant', () => {
      const result = canKick({
        roomId: createRoomId(),
        targetPeerId: createPeerId(),
        targetUserId: createUserId('target'),
        targetRole: 'participant',
        kickedBy: createUserId('mod'),
        kickedByRole: 'moderator',
      });
      expect(result.allowed).toBe(true);
    });

    it('should not allow moderator to kick another moderator', () => {
      const result = canKick({
        roomId: createRoomId(),
        targetPeerId: createPeerId(),
        targetUserId: createUserId('target'),
        targetRole: 'moderator',
        kickedBy: createUserId('mod'),
        kickedByRole: 'moderator',
      });
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('higher role');
    });

    it('should not allow kicking the owner', () => {
      const result = canKick({
        roomId: createRoomId(),
        targetPeerId: createPeerId(),
        targetUserId: createUserId('owner'),
        targetRole: 'owner',
        kickedBy: createUserId('mod'),
        kickedByRole: 'moderator',
      });
      expect(result.allowed).toBe(false);
      // Moderator can't kick owner because they need higher role
      expect(result.reason).toContain('higher role');
    });

    it('should not allow kicking yourself', () => {
      const userId = createUserId('self');
      const result = canKick({
        roomId: createRoomId(),
        targetPeerId: createPeerId(),
        targetUserId: userId,
        targetRole: 'participant',
        kickedBy: userId,
        kickedByRole: 'owner',
      });
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('yourself');
    });

    it('should not allow participant to kick', () => {
      const result = canKick({
        roomId: createRoomId(),
        targetPeerId: createPeerId(),
        targetUserId: createUserId('target'),
        targetRole: 'participant',
        kickedBy: createUserId('part'),
        kickedByRole: 'participant',
      });
      expect(result.allowed).toBe(false);
      expect(result.requiredRole).toBe('moderator');
    });
  });

  describe('canBan', () => {
    it('should allow owner to ban participant', () => {
      const result = canBan({
        roomId: createRoomId(),
        targetUserId: createUserId('target'),
        targetRole: 'participant',
        bannedBy: createUserId('owner'),
        bannedByRole: 'owner',
      });
      expect(result.allowed).toBe(true);
    });

    it('should allow owner to ban moderator', () => {
      const result = canBan({
        roomId: createRoomId(),
        targetUserId: createUserId('target'),
        targetRole: 'moderator',
        bannedBy: createUserId('owner'),
        bannedByRole: 'owner',
      });
      expect(result.allowed).toBe(true);
    });

    it('should not allow moderator to ban', () => {
      const result = canBan({
        roomId: createRoomId(),
        targetUserId: createUserId('target'),
        targetRole: 'participant',
        bannedBy: createUserId('mod'),
        bannedByRole: 'moderator',
      });
      expect(result.allowed).toBe(false);
      expect(result.requiredRole).toBe('owner');
    });

    it('should not allow banning the owner', () => {
      const result = canBan({
        roomId: createRoomId(),
        targetUserId: createUserId('owner-target'),
        targetRole: 'owner',
        bannedBy: createUserId('owner'),
        bannedByRole: 'owner',
      });
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('owner cannot be banned');
    });

    it('should not allow banning yourself', () => {
      const userId = createUserId('self');
      const result = canBan({
        roomId: createRoomId(),
        targetUserId: userId,
        targetRole: 'owner',
        bannedBy: userId,
        bannedByRole: 'owner',
      });
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('yourself');
    });
  });

  describe('canChangeRole', () => {
    it('should allow owner to promote participant to moderator', () => {
      const result = canChangeRole({
        roomId: createRoomId(),
        targetPeerId: createPeerId(),
        targetUserId: createUserId('target'),
        newRole: 'moderator',
        changedBy: createUserId('owner'),
        changedByRole: 'owner',
      });
      expect(result.allowed).toBe(true);
    });

    it('should allow owner to demote moderator to participant', () => {
      const result = canChangeRole({
        roomId: createRoomId(),
        targetPeerId: createPeerId(),
        targetUserId: createUserId('target'),
        newRole: 'participant',
        changedBy: createUserId('owner'),
        changedByRole: 'owner',
      });
      expect(result.allowed).toBe(true);
    });

    it('should not allow assigning owner role', () => {
      const result = canChangeRole({
        roomId: createRoomId(),
        targetPeerId: createPeerId(),
        targetUserId: createUserId('target'),
        newRole: 'owner',
        changedBy: createUserId('owner'),
        changedByRole: 'owner',
      });
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('ownership must be transferred');
    });

    it('should not allow moderator to change roles', () => {
      const result = canChangeRole({
        roomId: createRoomId(),
        targetPeerId: createPeerId(),
        targetUserId: createUserId('target'),
        newRole: 'moderator',
        changedBy: createUserId('mod'),
        changedByRole: 'moderator',
      });
      expect(result.allowed).toBe(false);
      expect(result.requiredRole).toBe('owner');
    });

    it('should not allow changing your own role', () => {
      const userId = createUserId('self');
      const result = canChangeRole({
        roomId: createRoomId(),
        targetPeerId: createPeerId(),
        targetUserId: userId,
        newRole: 'moderator',
        changedBy: userId,
        changedByRole: 'owner',
      });
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('your own role');
    });
  });

  // ========== Convenience Permission Checks ==========

  describe('Convenience Permission Functions', () => {
    it('canInterruptAI - allows moderator and owner', () => {
      expect(canInterruptAI('owner').allowed).toBe(true);
      expect(canInterruptAI('moderator').allowed).toBe(true);
      expect(canInterruptAI('participant').allowed).toBe(false);
    });

    it('canChangeAISettings - allows owner only', () => {
      expect(canChangeAISettings('owner').allowed).toBe(true);
      expect(canChangeAISettings('moderator').allowed).toBe(false);
      expect(canChangeAISettings('participant').allowed).toBe(false);
    });

    it('canUpdateRoom - allows owner only', () => {
      expect(canUpdateRoom('owner').allowed).toBe(true);
      expect(canUpdateRoom('moderator').allowed).toBe(false);
      expect(canUpdateRoom('participant').allowed).toBe(false);
    });

    it('canCloseRoom - allows owner only', () => {
      expect(canCloseRoom('owner').allowed).toBe(true);
      expect(canCloseRoom('moderator').allowed).toBe(false);
      expect(canCloseRoom('participant').allowed).toBe(false);
    });

    it('canDeleteRoom - allows owner only', () => {
      expect(canDeleteRoom('owner').allowed).toBe(true);
      expect(canDeleteRoom('moderator').allowed).toBe(false);
      expect(canDeleteRoom('participant').allowed).toBe(false);
    });
  });

  // ========== Permission Manager ==========

  describe('PermissionManager', () => {
    let manager: PermissionManager;
    let roomId: RoomId;
    let ownerId: UserId;
    let ownerPeerId: PeerId;

    beforeEach(() => {
      manager = createPermissionManager();
      roomId = createRoomId();
      ownerId = createUserId('owner');
      ownerPeerId = createPeerId('owner');
      manager.initRoom(roomId, ownerId);
      manager.addParticipant(roomId, ownerPeerId, ownerId, 'owner');
    });

    describe('Room Management', () => {
      it('should initialize a room', () => {
        expect(manager.getRoomOwner(roomId)).toBe(ownerId);
        expect(manager.getRole(roomId, ownerPeerId)).toBe('owner');
      });

      it('should add participants', () => {
        const userId = createUserId('user');
        const peerId = createPeerId('user');
        manager.addParticipant(roomId, peerId, userId, 'participant');

        expect(manager.getRole(roomId, peerId)).toBe('participant');
      });

      it('should remove participants', () => {
        const peerId = createPeerId('user');
        manager.addParticipant(roomId, peerId, createUserId(), 'participant');
        manager.removeParticipant(roomId, peerId);

        expect(manager.getRole(roomId, peerId)).toBeUndefined();
      });

      it('should remove room', () => {
        manager.removeRoom(roomId);
        expect(manager.getRoomOwner(roomId)).toBeUndefined();
      });
    });

    describe('Permission Checks', () => {
      it('should check permission by peer ID', () => {
        const result = manager.checkPermission(roomId, ownerPeerId, 'room:update');
        expect(result.allowed).toBe(true);
      });

      it('should deny permission for non-participants', () => {
        const result = manager.checkPermission(roomId, createPeerId('unknown'), 'room:update');
        expect(result.allowed).toBe(false);
        expect(result.reason).toContain('Not a participant');
      });

      it('should check kick permission', () => {
        const targetPeerId = createPeerId('target');
        manager.addParticipant(roomId, targetPeerId, createUserId('target'), 'participant');

        const result = manager.checkKick(roomId, ownerPeerId, targetPeerId);
        expect(result.allowed).toBe(true);
      });

      it('should check ban permission', () => {
        const targetUserId = createUserId('target');
        const result = manager.checkBan(roomId, ownerPeerId, targetUserId);
        expect(result.allowed).toBe(true);
      });

      it('should check role change permission', () => {
        const targetPeerId = createPeerId('target');
        manager.addParticipant(roomId, targetPeerId, createUserId('target'), 'participant');

        const result = manager.checkRoleChange(roomId, ownerPeerId, targetPeerId, 'moderator');
        expect(result.allowed).toBe(true);
      });
    });

    describe('Actions', () => {
      it('should kick a participant', () => {
        const targetPeerId = createPeerId('target');
        manager.addParticipant(roomId, targetPeerId, createUserId('target'), 'participant');

        const result = manager.kick(roomId, ownerPeerId, targetPeerId, 'Test kick');
        expect(result.allowed).toBe(true);
        expect(manager.getRole(roomId, targetPeerId)).toBeUndefined();
      });

      it('should ban a user', () => {
        const targetUserId = createUserId('target');
        const targetPeerId = createPeerId('target');
        manager.addParticipant(roomId, targetPeerId, targetUserId, 'participant');

        const result = manager.ban(roomId, ownerPeerId, targetUserId, 'Test ban');
        expect(result.allowed).toBe(true);
        expect(manager.isBanned(roomId, targetUserId)).toBe(true);
        expect(manager.getRole(roomId, targetPeerId)).toBeUndefined(); // Also kicked
      });

      it('should unban a user', () => {
        const targetUserId = createUserId('target');
        manager.ban(roomId, ownerPeerId, targetUserId);
        expect(manager.isBanned(roomId, targetUserId)).toBe(true);

        const result = manager.unban(roomId, ownerPeerId, targetUserId);
        expect(result.allowed).toBe(true);
        expect(manager.isBanned(roomId, targetUserId)).toBe(false);
      });

      it('should change a role', () => {
        const targetPeerId = createPeerId('target');
        manager.addParticipant(roomId, targetPeerId, createUserId('target'), 'participant');

        const result = manager.changeRole(roomId, ownerPeerId, targetPeerId, 'moderator');
        expect(result.allowed).toBe(true);
        expect(manager.getRole(roomId, targetPeerId)).toBe('moderator');
      });
    });

    describe('Ban Management', () => {
      it('should track bans', () => {
        const targetUserId = createUserId('target');
        manager.ban(roomId, ownerPeerId, targetUserId, 'Bad behavior');

        const ban = manager.getBan(roomId, targetUserId);
        expect(ban).toBeDefined();
        expect(ban!.reason).toBe('Bad behavior');
        expect(ban!.bannedBy).toBe(ownerId);
      });

      it('should handle temporary bans', () => {
        const targetUserId = createUserId('target');
        manager.ban(roomId, ownerPeerId, targetUserId, undefined, 3600); // 1 hour

        const ban = manager.getBan(roomId, targetUserId);
        expect(ban).toBeDefined();
        expect(ban!.expiresAt).toBeDefined();
        expect(ban!.expiresAt!.getTime()).toBeGreaterThan(Date.now());
      });

      it('should expire temporary bans', () => {
        const targetUserId = createUserId('target');
        // Ban for 0 seconds (immediately expires)
        manager.ban(roomId, ownerPeerId, targetUserId, undefined, -1);

        expect(manager.isBanned(roomId, targetUserId)).toBe(false);
      });

      it('should get all room bans', () => {
        const user1 = createUserId('user1');
        const user2 = createUserId('user2');
        manager.ban(roomId, ownerPeerId, user1);
        manager.ban(roomId, ownerPeerId, user2);

        const bans = manager.getRoomBans(roomId);
        expect(bans.length).toBe(2);
      });

      it('should clean up expired bans', () => {
        const targetUserId = createUserId('target');
        // Create expired ban
        manager.ban(roomId, ownerPeerId, targetUserId, undefined, -1);

        const removed = manager.cleanupExpiredBans();
        expect(removed).toBe(1);
      });

      it('should prevent banned users from joining', () => {
        const targetUserId = createUserId('target');
        manager.ban(roomId, ownerPeerId, targetUserId, 'Not allowed');

        const result = manager.canJoinRoom(roomId, targetUserId);
        expect(result.allowed).toBe(false);
        expect(result.reason).toContain('banned');
        expect(result.reason).toContain('Not allowed');
      });
    });

    describe('Callbacks', () => {
      it('should call onKick callback', () => {
        const onKick = vi.fn();
        const managerWithCallback = createPermissionManager({ onKick });
        const roomId2 = createRoomId();
        const ownerId2 = createUserId('owner2');
        const ownerPeerId2 = createPeerId('owner2');

        managerWithCallback.initRoom(roomId2, ownerId2);
        managerWithCallback.addParticipant(roomId2, ownerPeerId2, ownerId2, 'owner');

        const targetPeerId = createPeerId('target');
        managerWithCallback.addParticipant(roomId2, targetPeerId, createUserId('target'), 'participant');

        managerWithCallback.kick(roomId2, ownerPeerId2, targetPeerId, 'Test');
        expect(onKick).toHaveBeenCalledWith(roomId2, targetPeerId, 'Test');
      });

      it('should call onBan callback', () => {
        const onBan = vi.fn();
        const managerWithCallback = createPermissionManager({ onBan });
        const roomId2 = createRoomId();
        const ownerId2 = createUserId('owner2');
        const ownerPeerId2 = createPeerId('owner2');

        managerWithCallback.initRoom(roomId2, ownerId2);
        managerWithCallback.addParticipant(roomId2, ownerPeerId2, ownerId2, 'owner');

        const targetUserId = createUserId('target');
        managerWithCallback.ban(roomId2, ownerPeerId2, targetUserId, 'Test ban');
        expect(onBan).toHaveBeenCalledWith(roomId2, targetUserId, 'Test ban');
      });

      it('should call onRoleChanged callback', () => {
        const onRoleChanged = vi.fn();
        const managerWithCallback = createPermissionManager({ onRoleChanged });
        const roomId2 = createRoomId();
        const ownerId2 = createUserId('owner2');
        const ownerPeerId2 = createPeerId('owner2');

        managerWithCallback.initRoom(roomId2, ownerId2);
        managerWithCallback.addParticipant(roomId2, ownerPeerId2, ownerId2, 'owner');

        const targetPeerId = createPeerId('target');
        managerWithCallback.addParticipant(roomId2, targetPeerId, createUserId('target'), 'participant');

        managerWithCallback.changeRole(roomId2, ownerPeerId2, targetPeerId, 'moderator');
        expect(onRoleChanged).toHaveBeenCalledWith(roomId2, targetPeerId, 'participant', 'moderator');
      });

      it('should call onPermissionDenied callback', () => {
        const onPermissionDenied = vi.fn();
        const managerWithCallback = createPermissionManager({ onPermissionDenied });
        const roomId2 = createRoomId();
        const ownerId2 = createUserId('owner2');
        const participantPeerId = createPeerId('participant');

        managerWithCallback.initRoom(roomId2, ownerId2);
        managerWithCallback.addParticipant(roomId2, participantPeerId, createUserId('participant'), 'participant');

        managerWithCallback.checkPermission(roomId2, participantPeerId, 'room:update');
        expect(onPermissionDenied).toHaveBeenCalled();
      });
    });

    describe('Utilities', () => {
      it('should get role permissions', () => {
        const permissions = manager.getRolePermissions('moderator');
        expect(permissions).toContain('participant:kick');
        expect(permissions).toContain('ai:interrupt');
      });

      it('should get room count', () => {
        expect(manager.getRoomCount()).toBe(1);
        manager.initRoom(createRoomId(), createUserId());
        expect(manager.getRoomCount()).toBe(2);
      });

      it('should get ban count', () => {
        expect(manager.getBanCount()).toBe(0);
        manager.ban(roomId, ownerPeerId, createUserId('target1'));
        manager.ban(roomId, ownerPeerId, createUserId('target2'));
        expect(manager.getBanCount()).toBe(2);
      });

      it('should dispose all data', () => {
        manager.ban(roomId, ownerPeerId, createUserId('target'));
        manager.dispose();

        expect(manager.getRoomCount()).toBe(0);
        expect(manager.getBanCount()).toBe(0);
      });
    });
  });

  // ========== Integration Tests ==========

  describe('Integration Tests', () => {
    it('should handle full moderation flow', () => {
      const manager = createPermissionManager();
      const roomId = createRoomId();
      const ownerId = createUserId('owner');
      const ownerPeerId = createPeerId('owner');

      // 1. Create room
      manager.initRoom(roomId, ownerId);
      manager.addParticipant(roomId, ownerPeerId, ownerId, 'owner');

      // 2. Add participants
      const mod1Id = createUserId('mod1');
      const mod1PeerId = createPeerId('mod1');
      manager.addParticipant(roomId, mod1PeerId, mod1Id, 'participant');

      const user1Id = createUserId('user1');
      const user1PeerId = createPeerId('user1');
      manager.addParticipant(roomId, user1PeerId, user1Id, 'participant');

      // 3. Promote to moderator
      const promoteResult = manager.changeRole(roomId, ownerPeerId, mod1PeerId, 'moderator');
      expect(promoteResult.allowed).toBe(true);
      expect(manager.getRole(roomId, mod1PeerId)).toBe('moderator');

      // 4. Moderator kicks user
      const kickResult = manager.kick(roomId, mod1PeerId, user1PeerId, 'Disruptive');
      expect(kickResult.allowed).toBe(true);
      expect(manager.getRole(roomId, user1PeerId)).toBeUndefined();

      // 5. Moderator cannot ban
      const banResult = manager.ban(roomId, mod1PeerId, user1Id);
      expect(banResult.allowed).toBe(false);

      // 6. Owner bans user
      const ownerBanResult = manager.ban(roomId, ownerPeerId, user1Id, 'Repeated violations');
      expect(ownerBanResult.allowed).toBe(true);
      expect(manager.isBanned(roomId, user1Id)).toBe(true);

      // 7. User cannot rejoin while banned
      const joinResult = manager.canJoinRoom(roomId, user1Id);
      expect(joinResult.allowed).toBe(false);

      // 8. Owner demotes moderator
      const demoteResult = manager.changeRole(roomId, ownerPeerId, mod1PeerId, 'participant');
      expect(demoteResult.allowed).toBe(true);
      expect(manager.getRole(roomId, mod1PeerId)).toBe('participant');

      // 9. Former moderator can no longer kick
      const user2Id = createUserId('user2');
      const user2PeerId = createPeerId('user2');
      manager.addParticipant(roomId, user2PeerId, user2Id, 'participant');

      const failedKickResult = manager.kick(roomId, mod1PeerId, user2PeerId);
      expect(failedKickResult.allowed).toBe(false);
    });

    it('should handle permission denied scenarios', () => {
      const manager = createPermissionManager();
      const roomId = createRoomId();
      const ownerId = createUserId('owner');

      manager.initRoom(roomId, ownerId);

      const participantId = createUserId('participant');
      const participantPeerId = createPeerId('participant');
      manager.addParticipant(roomId, participantPeerId, participantId, 'participant');

      // Participant cannot update room
      expect(manager.checkPermission(roomId, participantPeerId, 'room:update').allowed).toBe(false);

      // Participant cannot kick
      const targetPeerId = createPeerId('target');
      manager.addParticipant(roomId, targetPeerId, createUserId('target'), 'participant');
      expect(manager.checkKick(roomId, participantPeerId, targetPeerId).allowed).toBe(false);

      // Participant cannot change roles
      expect(manager.checkRoleChange(roomId, participantPeerId, targetPeerId, 'moderator').allowed).toBe(false);

      // Participant cannot ban
      expect(manager.checkBan(roomId, participantPeerId, createUserId('someone')).allowed).toBe(false);
    });
  });
});
