/**
 * Room Permissions System
 *
 * Role-based permission management for room operations.
 *
 * Part of the Long-Horizon Engineering Protocol - FEAT-403
 */

import type { PeerId, PeerRole } from '@/types/peer';
import type { RoomId } from '@/types/room';
import type { UserId } from '@/types/auth';

// ========== Permission Types ==========

/**
 * All available room permissions
 */
export type RoomPermission =
  // Room management
  | 'room:update'           // Update room settings (name, description, etc.)
  | 'room:close'            // Close the room
  | 'room:delete'           // Delete the room
  | 'room:voice_settings'   // Change voice settings
  // Participant management
  | 'participant:kick'      // Kick participants
  | 'participant:ban'       // Ban participants
  | 'participant:mute'      // Mute other participants
  | 'participant:role'      // Change participant roles
  // AI management
  | 'ai:interrupt'          // Interrupt AI response
  | 'ai:personality'        // Change AI personality
  | 'ai:settings'           // Change AI settings
  // Moderator-specific
  | 'moderator:assign'      // Assign moderator role
  | 'moderator:revoke';     // Revoke moderator role

/**
 * Role hierarchy (higher number = more permissions)
 */
export const ROLE_HIERARCHY: Record<PeerRole, number> = {
  participant: 0,
  moderator: 1,
  owner: 2,
};

/**
 * Permissions granted to each role
 */
export const ROLE_PERMISSIONS: Record<PeerRole, RoomPermission[]> = {
  participant: [],
  moderator: [
    'participant:kick',
    'participant:mute',
    'ai:interrupt',
  ],
  owner: [
    'room:update',
    'room:close',
    'room:delete',
    'room:voice_settings',
    'participant:kick',
    'participant:ban',
    'participant:mute',
    'participant:role',
    'ai:interrupt',
    'ai:personality',
    'ai:settings',
    'moderator:assign',
    'moderator:revoke',
  ],
};

/**
 * Ban entry for a user
 */
export interface BanEntry {
  userId: UserId;
  roomId: RoomId;
  bannedBy: UserId;
  reason?: string;
  bannedAt: Date;
  expiresAt?: Date;
}

/**
 * Permission check result
 */
export interface PermissionCheckResult {
  allowed: boolean;
  reason?: string;
  requiredRole?: PeerRole;
}

/**
 * Role change request
 */
export interface RoleChangeRequest {
  roomId: RoomId;
  targetPeerId: PeerId;
  targetUserId: UserId;
  newRole: PeerRole;
  changedBy: UserId;
  changedByRole: PeerRole;
}

/**
 * Kick request
 */
export interface KickRequest {
  roomId: RoomId;
  targetPeerId: PeerId;
  targetUserId: UserId;
  targetRole: PeerRole;
  kickedBy: UserId;
  kickedByRole: PeerRole;
  reason?: string;
}

/**
 * Ban request
 */
export interface BanRequest {
  roomId: RoomId;
  targetUserId: UserId;
  targetRole: PeerRole;
  bannedBy: UserId;
  bannedByRole: PeerRole;
  reason?: string;
  duration?: number; // Duration in seconds, undefined = permanent
}

// ========== Permission Checking ==========

/**
 * Check if a role has a specific permission
 */
export function hasPermission(role: PeerRole, permission: RoomPermission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

/**
 * Check if role A is higher than role B
 */
export function isHigherRole(roleA: PeerRole, roleB: PeerRole): boolean {
  return ROLE_HIERARCHY[roleA] > ROLE_HIERARCHY[roleB];
}

/**
 * Check if role A is at least as high as role B
 */
export function isAtLeastRole(roleA: PeerRole, roleB: PeerRole): boolean {
  return ROLE_HIERARCHY[roleA] >= ROLE_HIERARCHY[roleB];
}

/**
 * Get minimum role required for a permission
 */
export function getMinimumRoleForPermission(permission: RoomPermission): PeerRole | null {
  const roles: PeerRole[] = ['participant', 'moderator', 'owner'];
  for (const role of roles) {
    if (ROLE_PERMISSIONS[role].includes(permission)) {
      return role;
    }
  }
  return null;
}

/**
 * Check if a user can perform an action requiring a specific permission
 */
export function canPerformAction(
  userRole: PeerRole,
  permission: RoomPermission
): PermissionCheckResult {
  if (hasPermission(userRole, permission)) {
    return { allowed: true };
  }

  const requiredRole = getMinimumRoleForPermission(permission);
  return {
    allowed: false,
    reason: requiredRole
      ? `This action requires ${requiredRole} role`
      : 'Permission not available for any role',
    requiredRole: requiredRole ?? undefined,
  };
}

/**
 * Check if a user can kick another user
 */
export function canKick(request: KickRequest): PermissionCheckResult {
  // Must have kick permission
  if (!hasPermission(request.kickedByRole, 'participant:kick')) {
    return {
      allowed: false,
      reason: 'You do not have permission to kick participants',
      requiredRole: 'moderator',
    };
  }

  // Cannot kick yourself
  if (request.targetUserId === request.kickedBy) {
    return {
      allowed: false,
      reason: 'You cannot kick yourself',
    };
  }

  // Cannot kick someone with equal or higher role
  if (!isHigherRole(request.kickedByRole, request.targetRole)) {
    return {
      allowed: false,
      reason: `Cannot kick a ${request.targetRole} - requires higher role`,
    };
  }

  // Cannot kick owner
  if (request.targetRole === 'owner') {
    return {
      allowed: false,
      reason: 'The room owner cannot be kicked',
    };
  }

  return { allowed: true };
}

/**
 * Check if a user can ban another user
 */
export function canBan(request: BanRequest): PermissionCheckResult {
  // Must have ban permission (owner only)
  if (!hasPermission(request.bannedByRole, 'participant:ban')) {
    return {
      allowed: false,
      reason: 'You do not have permission to ban participants',
      requiredRole: 'owner',
    };
  }

  // Cannot ban yourself
  if (request.targetUserId === request.bannedBy) {
    return {
      allowed: false,
      reason: 'You cannot ban yourself',
    };
  }

  // Cannot ban owner
  if (request.targetRole === 'owner') {
    return {
      allowed: false,
      reason: 'The room owner cannot be banned',
    };
  }

  return { allowed: true };
}

/**
 * Check if a user can change another user's role
 */
export function canChangeRole(request: RoleChangeRequest): PermissionCheckResult {
  // Must have role change permission
  if (!hasPermission(request.changedByRole, 'participant:role')) {
    return {
      allowed: false,
      reason: 'You do not have permission to change roles',
      requiredRole: 'owner',
    };
  }

  // Cannot change your own role
  if (request.targetUserId === request.changedBy) {
    return {
      allowed: false,
      reason: 'You cannot change your own role',
    };
  }

  // Cannot change owner's role
  if (request.newRole === 'owner') {
    return {
      allowed: false,
      reason: 'Cannot assign owner role - ownership must be transferred',
    };
  }

  // Special checks for moderator assignment
  if (request.newRole === 'moderator') {
    if (!hasPermission(request.changedByRole, 'moderator:assign')) {
      return {
        allowed: false,
        reason: 'You do not have permission to assign moderator role',
        requiredRole: 'owner',
      };
    }
  }

  return { allowed: true };
}

/**
 * Check if a user can interrupt AI
 */
export function canInterruptAI(userRole: PeerRole): PermissionCheckResult {
  return canPerformAction(userRole, 'ai:interrupt');
}

/**
 * Check if a user can change AI settings
 */
export function canChangeAISettings(userRole: PeerRole): PermissionCheckResult {
  return canPerformAction(userRole, 'ai:settings');
}

/**
 * Check if a user can update room settings
 */
export function canUpdateRoom(userRole: PeerRole): PermissionCheckResult {
  return canPerformAction(userRole, 'room:update');
}

/**
 * Check if a user can close a room
 */
export function canCloseRoom(userRole: PeerRole): PermissionCheckResult {
  return canPerformAction(userRole, 'room:close');
}

/**
 * Check if a user can delete a room
 */
export function canDeleteRoom(userRole: PeerRole): PermissionCheckResult {
  return canPerformAction(userRole, 'room:delete');
}

// ========== Permission Manager Class ==========

/**
 * Options for PermissionManager
 */
export interface PermissionManagerOptions {
  /** Callbacks for permission events */
  onPermissionDenied?: (permission: RoomPermission, role: PeerRole, reason: string) => void;
  onRoleChanged?: (roomId: RoomId, peerId: PeerId, oldRole: PeerRole, newRole: PeerRole) => void;
  onKick?: (roomId: RoomId, peerId: PeerId, reason?: string) => void;
  onBan?: (roomId: RoomId, userId: UserId, reason?: string) => void;
  onUnban?: (roomId: RoomId, userId: UserId) => void;
}

/**
 * Room participant data for permission checks
 */
interface RoomParticipant {
  peerId: PeerId;
  userId: UserId;
  role: PeerRole;
}

/**
 * Permission manager for a set of rooms
 */
export class PermissionManager {
  private bans = new Map<string, BanEntry>(); // Key: `${roomId}:${userId}`
  private rooms = new Map<RoomId, Map<PeerId, RoomParticipant>>();
  private roomOwners = new Map<RoomId, UserId>();
  private options: PermissionManagerOptions;

  constructor(options: PermissionManagerOptions = {}) {
    this.options = options;
  }

  // ========== Room Management ==========

  /**
   * Initialize a room
   */
  initRoom(roomId: RoomId, ownerId: UserId): void {
    if (!this.rooms.has(roomId)) {
      this.rooms.set(roomId, new Map());
      this.roomOwners.set(roomId, ownerId);
    }
  }

  /**
   * Remove a room
   */
  removeRoom(roomId: RoomId): void {
    this.rooms.delete(roomId);
    this.roomOwners.delete(roomId);
    // Clear bans for this room
    for (const key of this.bans.keys()) {
      if (key.startsWith(`${roomId}:`)) {
        this.bans.delete(key);
      }
    }
  }

  /**
   * Add a participant to a room
   */
  addParticipant(roomId: RoomId, peerId: PeerId, userId: UserId, role: PeerRole): void {
    const room = this.rooms.get(roomId);
    if (room) {
      room.set(peerId, { peerId, userId, role });
    }
  }

  /**
   * Remove a participant from a room
   */
  removeParticipant(roomId: RoomId, peerId: PeerId): void {
    const room = this.rooms.get(roomId);
    if (room) {
      room.delete(peerId);
    }
  }

  /**
   * Get a participant's data
   */
  getParticipant(roomId: RoomId, peerId: PeerId): RoomParticipant | undefined {
    return this.rooms.get(roomId)?.get(peerId);
  }

  /**
   * Get a participant's role
   */
  getRole(roomId: RoomId, peerId: PeerId): PeerRole | undefined {
    return this.getParticipant(roomId, peerId)?.role;
  }

  /**
   * Get room owner ID
   */
  getRoomOwner(roomId: RoomId): UserId | undefined {
    return this.roomOwners.get(roomId);
  }

  // ========== Permission Checks ==========

  /**
   * Check if a peer has a permission in a room
   */
  checkPermission(roomId: RoomId, peerId: PeerId, permission: RoomPermission): PermissionCheckResult {
    const participant = this.getParticipant(roomId, peerId);
    if (!participant) {
      return { allowed: false, reason: 'Not a participant in this room' };
    }

    const result = canPerformAction(participant.role, permission);
    if (!result.allowed && this.options.onPermissionDenied) {
      this.options.onPermissionDenied(permission, participant.role, result.reason || 'Permission denied');
    }

    return result;
  }

  /**
   * Check if a peer can kick another peer
   */
  checkKick(roomId: RoomId, kickerPeerId: PeerId, targetPeerId: PeerId, reason?: string): PermissionCheckResult {
    const kicker = this.getParticipant(roomId, kickerPeerId);
    const target = this.getParticipant(roomId, targetPeerId);

    if (!kicker) {
      return { allowed: false, reason: 'You are not a participant in this room' };
    }
    if (!target) {
      return { allowed: false, reason: 'Target is not a participant in this room' };
    }

    return canKick({
      roomId,
      targetPeerId,
      targetUserId: target.userId,
      targetRole: target.role,
      kickedBy: kicker.userId,
      kickedByRole: kicker.role,
      reason,
    });
  }

  /**
   * Check if a peer can ban a user
   */
  checkBan(roomId: RoomId, bannerPeerId: PeerId, targetUserId: UserId, reason?: string): PermissionCheckResult {
    const banner = this.getParticipant(roomId, bannerPeerId);
    if (!banner) {
      return { allowed: false, reason: 'You are not a participant in this room' };
    }

    // Find target's role if they're in the room
    const room = this.rooms.get(roomId);
    let targetRole: PeerRole = 'participant';
    if (room) {
      for (const p of room.values()) {
        if (p.userId === targetUserId) {
          targetRole = p.role;
          break;
        }
      }
    }

    return canBan({
      roomId,
      targetUserId,
      targetRole,
      bannedBy: banner.userId,
      bannedByRole: banner.role,
      reason,
    });
  }

  /**
   * Check if a peer can change another peer's role
   */
  checkRoleChange(roomId: RoomId, changerPeerId: PeerId, targetPeerId: PeerId, newRole: PeerRole): PermissionCheckResult {
    const changer = this.getParticipant(roomId, changerPeerId);
    const target = this.getParticipant(roomId, targetPeerId);

    if (!changer) {
      return { allowed: false, reason: 'You are not a participant in this room' };
    }
    if (!target) {
      return { allowed: false, reason: 'Target is not a participant in this room' };
    }

    return canChangeRole({
      roomId,
      targetPeerId,
      targetUserId: target.userId,
      newRole,
      changedBy: changer.userId,
      changedByRole: changer.role,
    });
  }

  // ========== Actions ==========

  /**
   * Kick a participant (after permission check)
   */
  kick(roomId: RoomId, kickerPeerId: PeerId, targetPeerId: PeerId, reason?: string): PermissionCheckResult {
    const check = this.checkKick(roomId, kickerPeerId, targetPeerId, reason);
    if (!check.allowed) {
      return check;
    }

    this.removeParticipant(roomId, targetPeerId);
    this.options.onKick?.(roomId, targetPeerId, reason);

    return { allowed: true };
  }

  /**
   * Ban a user (after permission check)
   */
  ban(roomId: RoomId, bannerPeerId: PeerId, targetUserId: UserId, reason?: string, durationSeconds?: number): PermissionCheckResult {
    const check = this.checkBan(roomId, bannerPeerId, targetUserId, reason);
    if (!check.allowed) {
      return check;
    }

    const banner = this.getParticipant(roomId, bannerPeerId)!;
    const key = `${roomId}:${targetUserId}`;
    const now = new Date();

    const banEntry: BanEntry = {
      userId: targetUserId,
      roomId,
      bannedBy: banner.userId,
      reason,
      bannedAt: now,
      expiresAt: durationSeconds ? new Date(now.getTime() + durationSeconds * 1000) : undefined,
    };

    this.bans.set(key, banEntry);

    // If target is in room, remove them
    const room = this.rooms.get(roomId);
    if (room) {
      for (const [peerId, p] of room) {
        if (p.userId === targetUserId) {
          this.removeParticipant(roomId, peerId);
          this.options.onKick?.(roomId, peerId, reason);
          break;
        }
      }
    }

    this.options.onBan?.(roomId, targetUserId, reason);

    return { allowed: true };
  }

  /**
   * Unban a user
   */
  unban(roomId: RoomId, unbannerPeerId: PeerId, targetUserId: UserId): PermissionCheckResult {
    const unbanner = this.getParticipant(roomId, unbannerPeerId);
    if (!unbanner) {
      return { allowed: false, reason: 'You are not a participant in this room' };
    }

    if (!hasPermission(unbanner.role, 'participant:ban')) {
      return { allowed: false, reason: 'You do not have permission to unban users', requiredRole: 'owner' };
    }

    const key = `${roomId}:${targetUserId}`;
    const existed = this.bans.delete(key);

    if (existed) {
      this.options.onUnban?.(roomId, targetUserId);
    }

    return { allowed: true };
  }

  /**
   * Change a participant's role (after permission check)
   */
  changeRole(roomId: RoomId, changerPeerId: PeerId, targetPeerId: PeerId, newRole: PeerRole): PermissionCheckResult {
    const check = this.checkRoleChange(roomId, changerPeerId, targetPeerId, newRole);
    if (!check.allowed) {
      return check;
    }

    const target = this.getParticipant(roomId, targetPeerId)!;
    const oldRole = target.role;
    target.role = newRole;

    this.options.onRoleChanged?.(roomId, targetPeerId, oldRole, newRole);

    return { allowed: true };
  }

  // ========== Ban Management ==========

  /**
   * Check if a user is banned from a room
   */
  isBanned(roomId: RoomId, userId: UserId): boolean {
    const key = `${roomId}:${userId}`;
    const ban = this.bans.get(key);
    if (!ban) return false;

    // Check if ban has expired
    if (ban.expiresAt && ban.expiresAt < new Date()) {
      this.bans.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Get ban entry for a user
   */
  getBan(roomId: RoomId, userId: UserId): BanEntry | undefined {
    const key = `${roomId}:${userId}`;
    const ban = this.bans.get(key);
    if (!ban) return undefined;

    // Check if ban has expired
    if (ban.expiresAt && ban.expiresAt < new Date()) {
      this.bans.delete(key);
      return undefined;
    }

    return ban;
  }

  /**
   * Get all bans for a room
   */
  getRoomBans(roomId: RoomId): BanEntry[] {
    const bans: BanEntry[] = [];
    const now = new Date();

    for (const [key, ban] of this.bans) {
      if (key.startsWith(`${roomId}:`)) {
        // Check expiration
        if (ban.expiresAt && ban.expiresAt < now) {
          this.bans.delete(key);
          continue;
        }
        bans.push(ban);
      }
    }

    return bans;
  }

  /**
   * Clean up expired bans
   */
  cleanupExpiredBans(): number {
    const now = new Date();
    let removed = 0;

    for (const [key, ban] of this.bans) {
      if (ban.expiresAt && ban.expiresAt < now) {
        this.bans.delete(key);
        removed++;
      }
    }

    return removed;
  }

  // ========== Utilities ==========

  /**
   * Get all permissions for a role
   */
  getRolePermissions(role: PeerRole): RoomPermission[] {
    return [...ROLE_PERMISSIONS[role]];
  }

  /**
   * Check if a user can join a room (not banned)
   */
  canJoinRoom(roomId: RoomId, userId: UserId): PermissionCheckResult {
    if (this.isBanned(roomId, userId)) {
      const ban = this.getBan(roomId, userId);
      return {
        allowed: false,
        reason: ban?.reason
          ? `You are banned from this room: ${ban.reason}`
          : 'You are banned from this room',
      };
    }
    return { allowed: true };
  }

  /**
   * Get room count
   */
  getRoomCount(): number {
    return this.rooms.size;
  }

  /**
   * Get ban count
   */
  getBanCount(): number {
    return this.bans.size;
  }

  /**
   * Dispose of all data
   */
  dispose(): void {
    this.rooms.clear();
    this.roomOwners.clear();
    this.bans.clear();
  }
}

// ========== Factory Function ==========

/**
 * Create a PermissionManager instance
 */
export function createPermissionManager(options?: PermissionManagerOptions): PermissionManager {
  return new PermissionManager(options);
}

// ========== Default Export ==========

export const permissionManager = createPermissionManager();
