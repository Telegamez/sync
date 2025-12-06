/**
 * Supabase Client Exports
 *
 * Part of the Long-Horizon Engineering Protocol - FEAT-400
 */

export {
  getSupabaseConfig,
  isSupabaseConfigured,
  transformUser,
  transformSession,
  AUTH_STORAGE_KEY,
  getStoredSession,
  storeSession,
  clearStoredSession,
  isSessionExpired,
  SupabaseAuthClient,
  getSupabaseAuthClient,
  createSupabaseAuthClient,
} from './client';

export type {
  SupabaseConfig,
  SupabaseUserMetadata,
  SupabaseUser,
  SupabaseSession,
} from './client';
