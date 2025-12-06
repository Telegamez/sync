/**
 * Database Queries Tests
 *
 * Tests for CRUD operations for room persistence.
 *
 * Part of the Long-Horizon Engineering Protocol - FEAT-402
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  // Room operations
  generateRoomId,
  generateRecordId,
  createRoom,
  getRoom,
  getRoomWithCount,
  getRoomWithParticipants,
  getRooms,
  updateRoom,
  updateRoomVoiceSettings,
  updateRoomStatus,
  deleteRoom,
  hardDeleteRoom,
  closeRoom,
  roomExists,
  getRoomCount,
  // Participant operations
  addParticipant,
  removeParticipant,
  kickParticipant,
  updateParticipantRole,
  getParticipants,
  getParticipantByPeerId,
  getParticipantCount,
  // History operations
  recordRoomEvent,
  getRoomHistory,
  // Factory and utilities
  createRoomQueries,
  clearMockData,
  getMockStorage,
} from '@/server/db/queries';
import type { RoomsTable, ParticipantsTable } from '@/server/db/schema';
import type { UserId } from '@/types/auth';
import type { RoomId } from '@/types/room';
import type { PeerId } from '@/types/peer';

// Test data helpers
const createTestUserId = (): UserId => `user-${Math.random().toString(36).slice(2)}` as UserId;
const createTestPeerId = (): PeerId => `peer-${Math.random().toString(36).slice(2)}` as PeerId;

describe('Database Queries - FEAT-402', () => {
  beforeEach(() => {
    clearMockData();
  });

  // ========== ID Generation ==========

  describe('ID Generation', () => {
    it('should generate unique room IDs', () => {
      const id1 = generateRoomId();
      const id2 = generateRoomId();
      expect(id1).not.toBe(id2);
      expect(id1.length).toBe(10);
      expect(id2.length).toBe(10);
    });

    it('should generate unique record IDs', () => {
      const id1 = generateRecordId();
      const id2 = generateRecordId();
      expect(id1).not.toBe(id2);
      expect(id1.length).toBe(21);
      expect(id2.length).toBe(21);
    });
  });

  // ========== Room CRUD ==========

  describe('Room CRUD Operations', () => {
    describe('createRoom', () => {
      it('should create a room with required fields', async () => {
        const ownerId = createTestUserId();
        const result = await createRoom({
          name: 'Test Room',
          ownerId,
        });

        expect(result.success).toBe(true);
        expect(result.data).toBeDefined();
        expect(result.data!.name).toBe('Test Room');
        expect(result.data!.owner_id).toBe(ownerId);
        expect(result.data!.status).toBe('waiting');
        expect(result.data!.ai_personality).toBe('facilitator');
        expect(result.data!.max_participants).toBe(6);
      });

      it('should create a room with optional fields', async () => {
        const ownerId = createTestUserId();
        const result = await createRoom({
          name: 'Full Config Room',
          description: 'A test description',
          maxParticipants: 8,
          aiPersonality: 'expert',
          voiceSettings: {
            mode: 'open',
            lockDuringAIResponse: false,
          },
          ownerId,
        });

        expect(result.success).toBe(true);
        expect(result.data!.description).toBe('A test description');
        expect(result.data!.max_participants).toBe(8);
        expect(result.data!.ai_personality).toBe('expert');
        const settings = JSON.parse(result.data!.voice_settings);
        expect(settings.mode).toBe('open');
        expect(settings.lockDuringAIResponse).toBe(false);
      });

      it('should fail with invalid room name', async () => {
        const result = await createRoom({
          name: 'AB', // Too short
          ownerId: createTestUserId(),
        });

        expect(result.success).toBe(false);
        expect(result.errors).toContain('Room name must be at least 3 characters');
      });

      it('should fail without owner ID', async () => {
        const result = await createRoom({
          name: 'Test Room',
          ownerId: '' as UserId,
        });

        expect(result.success).toBe(false);
        expect(result.errors).toContain('Owner ID is required');
      });

      it('should record room_created event', async () => {
        const ownerId = createTestUserId();
        const result = await createRoom({
          name: 'Event Test Room',
          ownerId,
        });

        const history = await getRoomHistory(result.data!.id);
        expect(history.length).toBe(1);
        expect(history[0].event_type).toBe('room_created');
        expect(history[0].user_id).toBe(ownerId);
      });
    });

    describe('getRoom', () => {
      it('should return room by ID', async () => {
        const ownerId = createTestUserId();
        const created = await createRoom({ name: 'Test Room', ownerId });
        const room = await getRoom(created.data!.id);

        expect(room).toBeDefined();
        expect(room!.id).toBe(created.data!.id);
        expect(room!.name).toBe('Test Room');
      });

      it('should return null for non-existent room', async () => {
        const room = await getRoom('nonexistent' as RoomId);
        expect(room).toBeNull();
      });

      it('should not return soft-deleted rooms', async () => {
        const ownerId = createTestUserId();
        const created = await createRoom({ name: 'Test Room', ownerId });
        await deleteRoom(created.data!.id, ownerId);

        const room = await getRoom(created.data!.id);
        expect(room).toBeNull();
      });
    });

    describe('getRoomWithCount', () => {
      it('should return room with participant count', async () => {
        const ownerId = createTestUserId();
        const created = await createRoom({ name: 'Test Room', ownerId });

        // Add participants
        await addParticipant(created.data!.id, ownerId, createTestPeerId(), 'Owner', 'owner');
        await addParticipant(created.data!.id, createTestUserId(), createTestPeerId(), 'User 2');

        const room = await getRoomWithCount(created.data!.id);
        expect(room).toBeDefined();
        expect(room!.participant_count).toBe(2);
      });

      it('should return 0 count for empty room', async () => {
        const created = await createRoom({ name: 'Empty Room', ownerId: createTestUserId() });
        const room = await getRoomWithCount(created.data!.id);
        expect(room!.participant_count).toBe(0);
      });
    });

    describe('getRoomWithParticipants', () => {
      it('should return room with participant list', async () => {
        const ownerId = createTestUserId();
        const created = await createRoom({ name: 'Test Room', ownerId });

        await addParticipant(created.data!.id, ownerId, createTestPeerId(), 'Owner', 'owner');
        await addParticipant(created.data!.id, createTestUserId(), createTestPeerId(), 'User 2');

        const room = await getRoomWithParticipants(created.data!.id);
        expect(room).toBeDefined();
        expect(room!.participants.length).toBe(2);
        expect(room!.participants[0].display_name).toBe('Owner');
      });
    });

    describe('getRooms', () => {
      beforeEach(async () => {
        // Create several test rooms
        const ownerId = createTestUserId();
        await createRoom({ name: 'Alpha Room', ownerId });
        await createRoom({ name: 'Beta Room', ownerId });
        await createRoom({ name: 'Gamma Room', aiPersonality: 'expert', ownerId });
      });

      it('should return all rooms', async () => {
        const rooms = await getRooms();
        expect(rooms.length).toBe(3);
      });

      it('should filter by status', async () => {
        const { rooms: mockRooms } = getMockStorage();
        const roomId = Array.from(mockRooms.keys())[0];
        await updateRoomStatus(roomId, 'active');

        const activeRooms = await getRooms({ status: 'active' });
        expect(activeRooms.length).toBe(1);
        expect(activeRooms[0].status).toBe('active');
      });

      it('should filter by multiple statuses', async () => {
        const { rooms: mockRooms } = getMockStorage();
        const roomIds = Array.from(mockRooms.keys());
        await updateRoomStatus(roomIds[0], 'active');
        await updateRoomStatus(roomIds[1], 'full');

        const rooms = await getRooms({ status: ['active', 'full'] });
        expect(rooms.length).toBe(2);
      });

      it('should filter by owner', async () => {
        const newOwner = createTestUserId();
        await createRoom({ name: 'New Owner Room', ownerId: newOwner });

        const rooms = await getRooms({ ownerId: newOwner });
        expect(rooms.length).toBe(1);
        expect(rooms[0].owner_id).toBe(newOwner);
      });

      it('should search by name', async () => {
        const rooms = await getRooms({ searchName: 'alpha' });
        expect(rooms.length).toBe(1);
        expect(rooms[0].name).toBe('Alpha Room');
      });

      it('should order by name ascending', async () => {
        const rooms = await getRooms({ orderBy: 'name', orderDir: 'asc' });
        expect(rooms[0].name).toBe('Alpha Room');
        expect(rooms[1].name).toBe('Beta Room');
        expect(rooms[2].name).toBe('Gamma Room');
      });

      it('should support pagination', async () => {
        const page1 = await getRooms({ limit: 2, offset: 0 });
        const page2 = await getRooms({ limit: 2, offset: 2 });

        expect(page1.length).toBe(2);
        expect(page2.length).toBe(1);
      });

      it('should include participant count', async () => {
        const rooms = await getRooms();
        for (const room of rooms) {
          expect(typeof room.participant_count).toBe('number');
        }
      });
    });

    describe('updateRoom', () => {
      it('should update room fields', async () => {
        const created = await createRoom({ name: 'Original', ownerId: createTestUserId() });
        const result = await updateRoom(created.data!.id, {
          name: 'Updated Name',
          description: 'New description',
        });

        expect(result.success).toBe(true);
        expect(result.data!.name).toBe('Updated Name');
        expect(result.data!.description).toBe('New description');
      });

      it('should update last_activity_at automatically', async () => {
        const created = await createRoom({ name: 'Test', ownerId: createTestUserId() });
        const originalActivity = created.data!.last_activity_at;

        // Small delay to ensure timestamp difference
        await new Promise((r) => setTimeout(r, 10));

        const result = await updateRoom(created.data!.id, { name: 'Updated' });
        expect(result.data!.last_activity_at.getTime()).toBeGreaterThan(originalActivity.getTime());
      });

      it('should fail for non-existent room', async () => {
        const result = await updateRoom('nonexistent' as RoomId, { name: 'Test' });
        expect(result.success).toBe(false);
        expect(result.error).toBe('Room not found');
      });
    });

    describe('updateRoomVoiceSettings', () => {
      it('should merge voice settings', async () => {
        const created = await createRoom({
          name: 'Test',
          voiceSettings: { mode: 'pushToTalk', lockDuringAIResponse: true },
          ownerId: createTestUserId(),
        });

        const result = await updateRoomVoiceSettings(created.data!.id, {
          mode: 'open',
        });

        expect(result.success).toBe(true);
        const settings = JSON.parse(result.data!.voice_settings);
        expect(settings.mode).toBe('open');
        expect(settings.lockDuringAIResponse).toBe(true); // Preserved
      });
    });

    describe('updateRoomStatus', () => {
      it('should update room status', async () => {
        const created = await createRoom({ name: 'Test', ownerId: createTestUserId() });
        const result = await updateRoomStatus(created.data!.id, 'active');

        expect(result.success).toBe(true);
        expect(result.data!.status).toBe('active');
      });

      it('should set closed_at when closing', async () => {
        const created = await createRoom({ name: 'Test', ownerId: createTestUserId() });
        const result = await updateRoomStatus(created.data!.id, 'closed');

        expect(result.success).toBe(true);
        expect(result.data!.closed_at).toBeInstanceOf(Date);
      });
    });

    describe('deleteRoom', () => {
      it('should soft delete a room', async () => {
        const ownerId = createTestUserId();
        const created = await createRoom({ name: 'Test', ownerId });
        const result = await deleteRoom(created.data!.id, ownerId);

        expect(result.success).toBe(true);
        expect(result.rowsAffected).toBe(1);

        // Should not be accessible via getRoom
        const room = await getRoom(created.data!.id);
        expect(room).toBeNull();
      });

      it('should record room_deleted event', async () => {
        const ownerId = createTestUserId();
        const created = await createRoom({ name: 'Test', ownerId });
        await deleteRoom(created.data!.id, ownerId);

        // Get history directly from mock storage
        const { history } = getMockStorage();
        const events = Array.from(history.values()).filter(
          (h) => h.room_id === created.data!.id && h.event_type === 'room_deleted'
        );
        expect(events.length).toBe(1);
      });
    });

    describe('hardDeleteRoom', () => {
      it('should permanently delete a room', async () => {
        const created = await createRoom({ name: 'Test', ownerId: createTestUserId() });
        const result = await hardDeleteRoom(created.data!.id);

        expect(result.success).toBe(true);

        // Should not exist at all
        const { rooms } = getMockStorage();
        expect(rooms.has(created.data!.id)).toBe(false);
      });

      it('should also delete related data', async () => {
        const ownerId = createTestUserId();
        const created = await createRoom({ name: 'Test', ownerId });
        await addParticipant(created.data!.id, ownerId, createTestPeerId(), 'User');

        await hardDeleteRoom(created.data!.id);

        const { participants, history } = getMockStorage();
        const relatedParticipants = Array.from(participants.values()).filter(
          (p) => p.room_id === created.data!.id
        );
        const relatedHistory = Array.from(history.values()).filter(
          (h) => h.room_id === created.data!.id
        );
        expect(relatedParticipants.length).toBe(0);
        expect(relatedHistory.length).toBe(0);
      });
    });

    describe('closeRoom', () => {
      it('should close a room and record event', async () => {
        const ownerId = createTestUserId();
        const created = await createRoom({ name: 'Test', ownerId });
        const result = await closeRoom(created.data!.id, ownerId);

        expect(result.success).toBe(true);
        expect(result.data!.status).toBe('closed');
        expect(result.data!.closed_at).toBeInstanceOf(Date);

        const history = await getRoomHistory(created.data!.id);
        const closeEvents = history.filter((h) => h.event_type === 'room_closed');
        expect(closeEvents.length).toBe(1);
      });
    });

    describe('roomExists', () => {
      it('should return true for existing room', async () => {
        const created = await createRoom({ name: 'Test', ownerId: createTestUserId() });
        const exists = await roomExists(created.data!.id);
        expect(exists).toBe(true);
      });

      it('should return false for non-existent room', async () => {
        const exists = await roomExists('nonexistent' as RoomId);
        expect(exists).toBe(false);
      });

      it('should return false for deleted room', async () => {
        const ownerId = createTestUserId();
        const created = await createRoom({ name: 'Test', ownerId });
        await deleteRoom(created.data!.id, ownerId);

        const exists = await roomExists(created.data!.id);
        expect(exists).toBe(false);
      });
    });

    describe('getRoomCount', () => {
      it('should return total room count', async () => {
        const ownerId = createTestUserId();
        await createRoom({ name: 'Room 1', ownerId });
        await createRoom({ name: 'Room 2', ownerId });
        await createRoom({ name: 'Room 3', ownerId });

        const count = await getRoomCount();
        expect(count).toBe(3);
      });

      it('should respect filters', async () => {
        const ownerId = createTestUserId();
        const created = await createRoom({ name: 'Room 1', ownerId });
        await createRoom({ name: 'Room 2', ownerId });
        await updateRoomStatus(created.data!.id, 'active');

        const activeCount = await getRoomCount({ status: 'active' });
        expect(activeCount).toBe(1);
      });
    });
  });

  // ========== Participant CRUD ==========

  describe('Participant CRUD Operations', () => {
    let roomId: RoomId;
    let ownerId: UserId;

    beforeEach(async () => {
      ownerId = createTestUserId();
      const result = await createRoom({ name: 'Test Room', ownerId });
      roomId = result.data!.id;
    });

    describe('addParticipant', () => {
      it('should add a participant to a room', async () => {
        const userId = createTestUserId();
        const peerId = createTestPeerId();
        const result = await addParticipant(roomId, userId, peerId, 'Test User');

        expect(result.success).toBe(true);
        expect(result.data!.display_name).toBe('Test User');
        expect(result.data!.role).toBe('participant');
        expect(result.data!.is_active).toBe(true);
      });

      it('should add a participant with custom role', async () => {
        const result = await addParticipant(
          roomId,
          createTestUserId(),
          createTestPeerId(),
          'Moderator',
          'moderator'
        );

        expect(result.success).toBe(true);
        expect(result.data!.role).toBe('moderator');
      });

      it('should fail when room is full', async () => {
        // Create a small room
        const smallRoom = await createRoom({
          name: 'Small Room',
          maxParticipants: 2,
          ownerId: createTestUserId(),
        });

        await addParticipant(smallRoom.data!.id, createTestUserId(), createTestPeerId(), 'User 1');
        await addParticipant(smallRoom.data!.id, createTestUserId(), createTestPeerId(), 'User 2');
        const result = await addParticipant(
          smallRoom.data!.id,
          createTestUserId(),
          createTestPeerId(),
          'User 3'
        );

        expect(result.success).toBe(false);
        expect(result.error).toBe('Room is full');
      });

      it('should fail for non-existent room', async () => {
        const result = await addParticipant(
          'nonexistent' as RoomId,
          createTestUserId(),
          createTestPeerId(),
          'User'
        );

        expect(result.success).toBe(false);
        expect(result.error).toBe('Room not found');
      });

      it('should update room status based on participants', async () => {
        await addParticipant(roomId, createTestUserId(), createTestPeerId(), 'User 1');
        const room = await getRoom(roomId);
        expect(room!.status).toBe('active');
      });

      it('should record participant_joined event', async () => {
        const userId = createTestUserId();
        const peerId = createTestPeerId();
        await addParticipant(roomId, userId, peerId, 'Test User');

        const history = await getRoomHistory(roomId);
        const joinEvents = history.filter((h) => h.event_type === 'participant_joined');
        expect(joinEvents.length).toBe(1);
        expect(joinEvents[0].user_id).toBe(userId);
        expect(joinEvents[0].peer_id).toBe(peerId);
      });
    });

    describe('removeParticipant', () => {
      it('should remove a participant from a room', async () => {
        const peerId = createTestPeerId();
        await addParticipant(roomId, createTestUserId(), peerId, 'User');

        const result = await removeParticipant(roomId, peerId);
        expect(result.success).toBe(true);
        expect(result.data!.is_active).toBe(false);
        expect(result.data!.left_at).toBeInstanceOf(Date);
      });

      it('should calculate time in room', async () => {
        const peerId = createTestPeerId();
        await addParticipant(roomId, createTestUserId(), peerId, 'User');

        // Small delay
        await new Promise((r) => setTimeout(r, 50));

        const result = await removeParticipant(roomId, peerId);
        expect(result.data!.total_time_seconds).toBeGreaterThanOrEqual(0);
      });

      it('should update room status when last participant leaves', async () => {
        const peerId = createTestPeerId();
        await addParticipant(roomId, createTestUserId(), peerId, 'User');
        await removeParticipant(roomId, peerId);

        const room = await getRoom(roomId);
        expect(room!.status).toBe('waiting');
      });

      it('should fail for non-existent participant', async () => {
        const result = await removeParticipant(roomId, 'nonexistent' as PeerId);
        expect(result.success).toBe(false);
        expect(result.error).toBe('Participant not found');
      });

      it('should record participant_left event', async () => {
        const peerId = createTestPeerId();
        await addParticipant(roomId, createTestUserId(), peerId, 'User');
        await removeParticipant(roomId, peerId);

        const history = await getRoomHistory(roomId);
        const leaveEvents = history.filter((h) => h.event_type === 'participant_left');
        expect(leaveEvents.length).toBe(1);
      });
    });

    describe('kickParticipant', () => {
      it('should kick a participant and record event', async () => {
        const userId = createTestUserId();
        const peerId = createTestPeerId();
        await addParticipant(roomId, userId, peerId, 'User');

        const result = await kickParticipant(roomId, peerId, ownerId, 'Disruptive behavior');
        expect(result.success).toBe(true);
        expect(result.data!.is_active).toBe(false);

        const history = await getRoomHistory(roomId);
        const kickEvents = history.filter((h) => h.event_type === 'participant_kicked');
        expect(kickEvents.length).toBe(1);
        expect(kickEvents[0].user_id).toBe(ownerId);
      });
    });

    describe('updateParticipantRole', () => {
      it('should update participant role', async () => {
        const userId = createTestUserId();
        const peerId = createTestPeerId();
        await addParticipant(roomId, userId, peerId, 'User');

        const result = await updateParticipantRole(roomId, peerId, 'moderator', ownerId);
        expect(result.success).toBe(true);
        expect(result.data!.role).toBe('moderator');
      });

      it('should record role_changed event', async () => {
        const peerId = createTestPeerId();
        await addParticipant(roomId, createTestUserId(), peerId, 'User');
        await updateParticipantRole(roomId, peerId, 'moderator', ownerId);

        const history = await getRoomHistory(roomId);
        const roleEvents = history.filter((h) => h.event_type === 'role_changed');
        expect(roleEvents.length).toBe(1);

        const eventData = JSON.parse(roleEvents[0].event_data!);
        expect(eventData.oldRole).toBe('participant');
        expect(eventData.newRole).toBe('moderator');
      });

      it('should fail for non-existent participant', async () => {
        const result = await updateParticipantRole(roomId, 'nonexistent' as PeerId, 'moderator', ownerId);
        expect(result.success).toBe(false);
      });
    });

    describe('getParticipants', () => {
      it('should return active participants', async () => {
        await addParticipant(roomId, createTestUserId(), createTestPeerId(), 'User 1');
        await addParticipant(roomId, createTestUserId(), createTestPeerId(), 'User 2');

        const participants = await getParticipants(roomId);
        expect(participants.length).toBe(2);
      });

      it('should include inactive when requested', async () => {
        const peerId = createTestPeerId();
        await addParticipant(roomId, createTestUserId(), peerId, 'User 1');
        await addParticipant(roomId, createTestUserId(), createTestPeerId(), 'User 2');
        await removeParticipant(roomId, peerId);

        const activeOnly = await getParticipants(roomId, true);
        expect(activeOnly.length).toBe(1);

        const all = await getParticipants(roomId, false);
        expect(all.length).toBe(2);
      });
    });

    describe('getParticipantByPeerId', () => {
      it('should return participant by peer ID', async () => {
        const peerId = createTestPeerId();
        await addParticipant(roomId, createTestUserId(), peerId, 'Test User');

        const participant = await getParticipantByPeerId(roomId, peerId);
        expect(participant).toBeDefined();
        expect(participant!.display_name).toBe('Test User');
      });

      it('should return null for inactive participant', async () => {
        const peerId = createTestPeerId();
        await addParticipant(roomId, createTestUserId(), peerId, 'Test User');
        await removeParticipant(roomId, peerId);

        const participant = await getParticipantByPeerId(roomId, peerId);
        expect(participant).toBeNull();
      });
    });

    describe('getParticipantCount', () => {
      it('should return active participant count', async () => {
        await addParticipant(roomId, createTestUserId(), createTestPeerId(), 'User 1');
        await addParticipant(roomId, createTestUserId(), createTestPeerId(), 'User 2');

        const count = await getParticipantCount(roomId);
        expect(count).toBe(2);
      });

      it('should not count inactive participants', async () => {
        const peerId = createTestPeerId();
        await addParticipant(roomId, createTestUserId(), peerId, 'User 1');
        await addParticipant(roomId, createTestUserId(), createTestPeerId(), 'User 2');
        await removeParticipant(roomId, peerId);

        const count = await getParticipantCount(roomId);
        expect(count).toBe(1);
      });
    });
  });

  // ========== Room History ==========

  describe('Room History', () => {
    let roomId: RoomId;
    let ownerId: UserId;

    beforeEach(async () => {
      ownerId = createTestUserId();
      const result = await createRoom({ name: 'Test Room', ownerId });
      roomId = result.data!.id;
    });

    describe('recordRoomEvent', () => {
      it('should record an event', async () => {
        const result = await recordRoomEvent(
          roomId,
          'ai_session_started',
          ownerId,
          null,
          { model: 'gpt-4' }
        );

        expect(result.success).toBe(true);
        expect(result.data!.event_type).toBe('ai_session_started');
        expect(JSON.parse(result.data!.event_data!).model).toBe('gpt-4');
      });
    });

    describe('getRoomHistory', () => {
      beforeEach(async () => {
        await recordRoomEvent(roomId, 'ai_session_started', ownerId, null, null);
        await recordRoomEvent(roomId, 'ai_interrupted', ownerId, null, null);
        await recordRoomEvent(roomId, 'ai_session_ended', ownerId, null, null);
      });

      it('should return all history events', async () => {
        const history = await getRoomHistory(roomId);
        // Including room_created event
        expect(history.length).toBe(4);
      });

      it('should filter by event type', async () => {
        const history = await getRoomHistory(roomId, {
          eventTypes: ['ai_session_started', 'ai_session_ended'],
        });
        expect(history.length).toBe(2);
      });

      it('should support pagination', async () => {
        const page1 = await getRoomHistory(roomId, { limit: 2, offset: 0 });
        const page2 = await getRoomHistory(roomId, { limit: 2, offset: 2 });

        expect(page1.length).toBe(2);
        expect(page2.length).toBe(2);
      });

      it('should order by created_at descending', async () => {
        const history = await getRoomHistory(roomId);
        for (let i = 1; i < history.length; i++) {
          expect(history[i - 1].created_at.getTime()).toBeGreaterThanOrEqual(
            history[i].created_at.getTime()
          );
        }
      });
    });
  });

  // ========== Factory Function ==========

  describe('createRoomQueries Factory', () => {
    it('should create queries instance with all methods', () => {
      const queries = createRoomQueries();

      // Room methods
      expect(typeof queries.generateRoomId).toBe('function');
      expect(typeof queries.createRoom).toBe('function');
      expect(typeof queries.getRoom).toBe('function');
      expect(typeof queries.getRoomWithCount).toBe('function');
      expect(typeof queries.getRoomWithParticipants).toBe('function');
      expect(typeof queries.getRooms).toBe('function');
      expect(typeof queries.updateRoom).toBe('function');
      expect(typeof queries.updateRoomVoiceSettings).toBe('function');
      expect(typeof queries.updateRoomStatus).toBe('function');
      expect(typeof queries.deleteRoom).toBe('function');
      expect(typeof queries.hardDeleteRoom).toBe('function');
      expect(typeof queries.closeRoom).toBe('function');
      expect(typeof queries.roomExists).toBe('function');
      expect(typeof queries.getRoomCount).toBe('function');

      // Participant methods
      expect(typeof queries.addParticipant).toBe('function');
      expect(typeof queries.removeParticipant).toBe('function');
      expect(typeof queries.kickParticipant).toBe('function');
      expect(typeof queries.updateParticipantRole).toBe('function');
      expect(typeof queries.getParticipants).toBe('function');
      expect(typeof queries.getParticipantByPeerId).toBe('function');
      expect(typeof queries.getParticipantCount).toBe('function');

      // History methods
      expect(typeof queries.recordRoomEvent).toBe('function');
      expect(typeof queries.getRoomHistory).toBe('function');

      // Utilities
      expect(typeof queries.clearMockData).toBe('function');
    });

    it('should work in mock mode', async () => {
      const queries = createRoomQueries();
      const ownerId = createTestUserId();

      const result = await queries.createRoom({ name: 'Factory Test', ownerId });
      expect(result.success).toBe(true);

      const room = await queries.getRoom(result.data!.id);
      expect(room!.name).toBe('Factory Test');
    });
  });

  // ========== Integration Tests ==========

  describe('Integration Tests', () => {
    it('should handle full room lifecycle', async () => {
      const ownerId = createTestUserId();
      const queries = createRoomQueries();

      // 1. Create room
      const createResult = await queries.createRoom({
        name: 'Lifecycle Test',
        maxParticipants: 3,
        ownerId,
      });
      expect(createResult.success).toBe(true);
      const roomId = createResult.data!.id;

      // 2. Add participants
      const owner = await queries.addParticipant(
        roomId,
        ownerId,
        createTestPeerId(),
        'Owner',
        'owner'
      );
      expect(owner.success).toBe(true);

      const user2 = await queries.addParticipant(
        roomId,
        createTestUserId(),
        createTestPeerId(),
        'User 2'
      );
      expect(user2.success).toBe(true);

      // 3. Check room status updated to active
      let room = await queries.getRoomWithCount(roomId);
      expect(room!.status).toBe('active');
      expect(room!.participant_count).toBe(2);

      // 4. Fill the room
      const user3 = await queries.addParticipant(
        roomId,
        createTestUserId(),
        createTestPeerId(),
        'User 3'
      );
      expect(user3.success).toBe(true);

      room = await queries.getRoom(roomId);
      expect(room!.status).toBe('full');

      // 5. Try to add another (should fail)
      const user4 = await queries.addParticipant(
        roomId,
        createTestUserId(),
        createTestPeerId(),
        'User 4'
      );
      expect(user4.success).toBe(false);
      expect(user4.error).toBe('Room is full');

      // 6. Remove a participant
      await queries.removeParticipant(roomId, user2.data!.peer_id);
      room = await queries.getRoom(roomId);
      expect(room!.status).toBe('active');

      // 7. Close the room
      await queries.closeRoom(roomId, ownerId);
      room = await queries.getRoom(roomId);
      expect(room!.status).toBe('closed');

      // 8. Check history
      const history = await queries.getRoomHistory(roomId);
      expect(history.length).toBeGreaterThan(0);
      expect(history.some((h) => h.event_type === 'room_created')).toBe(true);
      expect(history.some((h) => h.event_type === 'participant_joined')).toBe(true);
      expect(history.some((h) => h.event_type === 'participant_left')).toBe(true);
      expect(history.some((h) => h.event_type === 'room_closed')).toBe(true);
    });

    it('should handle concurrent operations', async () => {
      const ownerId = createTestUserId();
      const queries = createRoomQueries();

      const createResult = await queries.createRoom({
        name: 'Concurrent Test',
        maxParticipants: 10,
        ownerId,
      });
      const roomId = createResult.data!.id;

      // Add multiple participants concurrently
      const addPromises = Array.from({ length: 5 }, (_, i) =>
        queries.addParticipant(roomId, createTestUserId(), createTestPeerId(), `User ${i}`)
      );

      const results = await Promise.all(addPromises);
      expect(results.every((r) => r.success)).toBe(true);

      const count = await queries.getParticipantCount(roomId);
      expect(count).toBe(5);
    });
  });
});
