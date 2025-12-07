-- SwenSync Database Schema
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard/project/YOUR_PROJECT/sql
-- Part of FEAT-401: Room Persistence

-- ============================================================================
-- ROOMS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS rooms (
  id VARCHAR(21) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  max_participants INTEGER NOT NULL DEFAULT 6 CHECK (max_participants >= 2 AND max_participants <= 10),
  status VARCHAR(20) NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'active', 'full', 'closed')),
  ai_personality VARCHAR(20) NOT NULL DEFAULT 'facilitator' CHECK (ai_personality IN ('facilitator', 'assistant', 'expert', 'brainstorm', 'custom')),
  custom_instructions TEXT,
  voice_settings JSONB NOT NULL DEFAULT '{}',
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ
);

-- ============================================================================
-- PARTICIPANTS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS participants (
  id VARCHAR(21) PRIMARY KEY,
  room_id VARCHAR(21) NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  peer_id VARCHAR(21) NOT NULL,
  display_name VARCHAR(100) NOT NULL,
  avatar_url TEXT,
  role VARCHAR(20) NOT NULL DEFAULT 'participant' CHECK (role IN ('owner', 'moderator', 'participant')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  left_at TIMESTAMPTZ,
  total_time_seconds INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true
);

-- ============================================================================
-- ROOM HISTORY TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS room_history (
  id VARCHAR(21) PRIMARY KEY,
  room_id VARCHAR(21) NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  event_type VARCHAR(30) NOT NULL CHECK (event_type IN (
    'room_created', 'room_closed', 'room_deleted', 'settings_updated',
    'participant_joined', 'participant_left', 'participant_kicked',
    'role_changed', 'ai_session_started', 'ai_session_ended', 'ai_interrupted'
  )),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  peer_id VARCHAR(21),
  event_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Rooms indexes
CREATE INDEX IF NOT EXISTS idx_rooms_owner_id ON rooms(owner_id);
CREATE INDEX IF NOT EXISTS idx_rooms_status ON rooms(status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_rooms_created_at ON rooms(created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_rooms_last_activity ON rooms(last_activity_at DESC) WHERE deleted_at IS NULL;

-- Participants indexes
CREATE INDEX IF NOT EXISTS idx_participants_room_id ON participants(room_id);
CREATE INDEX IF NOT EXISTS idx_participants_user_id ON participants(user_id);
CREATE INDEX IF NOT EXISTS idx_participants_active ON participants(room_id, is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_participants_peer_id ON participants(peer_id);

-- Room history indexes
CREATE INDEX IF NOT EXISTS idx_room_history_room_id ON room_history(room_id);
CREATE INDEX IF NOT EXISTS idx_room_history_user_id ON room_history(user_id);
CREATE INDEX IF NOT EXISTS idx_room_history_event_type ON room_history(event_type);
CREATE INDEX IF NOT EXISTS idx_room_history_created_at ON room_history(created_at DESC);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_history ENABLE ROW LEVEL SECURITY;

-- Rooms policies
CREATE POLICY "Users can view non-deleted rooms" ON rooms
  FOR SELECT USING (deleted_at IS NULL);

CREATE POLICY "Users can create rooms" ON rooms
  FOR INSERT WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Owners can update their rooms" ON rooms
  FOR UPDATE USING (auth.uid() = owner_id);

CREATE POLICY "Owners can delete their rooms" ON rooms
  FOR DELETE USING (auth.uid() = owner_id);

-- Participants policies
CREATE POLICY "Users can view participants in rooms they're in" ON participants
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM participants p
      WHERE p.room_id = participants.room_id
      AND p.user_id = auth.uid()
      AND p.is_active = true
    )
  );

CREATE POLICY "Users can join rooms" ON participants
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own participation" ON participants
  FOR UPDATE USING (auth.uid() = user_id);

-- Room history policies
CREATE POLICY "Users can view history of rooms they're in" ON room_history
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM participants p
      WHERE p.room_id = room_history.room_id
      AND p.user_id = auth.uid()
    )
  );

CREATE POLICY "System can insert history" ON room_history
  FOR INSERT WITH CHECK (true);

-- ============================================================================
-- SUCCESS MESSAGE
-- ============================================================================
DO $$
BEGIN
  RAISE NOTICE 'SwenSync schema created successfully!';
END $$;
