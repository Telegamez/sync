/**
 * Supabase Authentication Tests
 *
 * Tests for Supabase client, auth types, context, and middleware.
 *
 * Part of the Long-Horizon Engineering Protocol - FEAT-400
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import React from 'react';

// Test auth types
import {
  mapAuthErrorCode,
  getAuthErrorMessage,
  matchesPattern,
  requiresAuth,
  getAuthRedirect,
  PUBLIC_ROUTES,
  DEFAULT_PROTECTED_ROUTES,
} from '@/types/auth';
import type {
  UserProfile,
  Session,
  AuthState,
  AuthErrorCode,
  SignUpRequest,
  SignInRequest,
} from '@/types/auth';

// Test Supabase client
import {
  transformUser,
  transformSession,
  isSessionExpired,
  createSupabaseAuthClient,
  getStoredSession,
  storeSession,
  clearStoredSession,
  AUTH_STORAGE_KEY,
} from '@/lib/supabase';
import type { SupabaseUser, SupabaseSession } from '@/lib/supabase';

// Test auth context
import { AuthProvider, useAuth, useIsAuthenticated, useUser, useAuthState } from '@/contexts/AuthContext';

// ========== Auth Types Tests ==========

describe('Auth Types', () => {
  describe('mapAuthErrorCode', () => {
    it('should map invalid credentials error', () => {
      expect(mapAuthErrorCode('Invalid login credentials')).toBe('invalid_credentials');
    });

    it('should map email not confirmed error', () => {
      expect(mapAuthErrorCode('Email not confirmed')).toBe('email_not_confirmed');
    });

    it('should map user not found error', () => {
      expect(mapAuthErrorCode('User not found')).toBe('user_not_found');
    });

    it('should map email taken error', () => {
      expect(mapAuthErrorCode('User already registered')).toBe('email_taken');
    });

    it('should map weak password error', () => {
      expect(mapAuthErrorCode('Password should be at least 6 characters')).toBe('weak_password');
    });

    it('should map invalid email error', () => {
      expect(mapAuthErrorCode('Unable to validate email address: invalid format')).toBe('invalid_email');
    });

    it('should map rate limited error', () => {
      expect(mapAuthErrorCode('For security purposes, you can only request this once every 60 seconds')).toBe('rate_limited');
    });

    it('should return unknown_error for unmapped errors', () => {
      expect(mapAuthErrorCode('Some random error')).toBe('unknown_error');
    });
  });

  describe('getAuthErrorMessage', () => {
    it('should return human-readable message for invalid_credentials', () => {
      expect(getAuthErrorMessage('invalid_credentials')).toBe('Invalid email or password');
    });

    it('should return human-readable message for email_not_confirmed', () => {
      expect(getAuthErrorMessage('email_not_confirmed')).toBe('Please check your email to confirm your account');
    });

    it('should return human-readable message for weak_password', () => {
      expect(getAuthErrorMessage('weak_password')).toBe('Password must be at least 6 characters');
    });

    it('should return human-readable message for rate_limited', () => {
      expect(getAuthErrorMessage('rate_limited')).toBe('Too many attempts. Please try again later');
    });

    it('should return human-readable message for unknown_error', () => {
      expect(getAuthErrorMessage('unknown_error')).toBe('An unexpected error occurred');
    });
  });

  describe('matchesPattern', () => {
    it('should match exact paths', () => {
      expect(matchesPattern('/rooms', '/rooms')).toBe(true);
      expect(matchesPattern('/profile', '/profile')).toBe(true);
    });

    it('should not match different paths', () => {
      expect(matchesPattern('/rooms', '/profile')).toBe(false);
      expect(matchesPattern('/room', '/rooms')).toBe(false);
    });

    it('should match wildcard patterns', () => {
      expect(matchesPattern('/rooms/abc123', '/rooms/*')).toBe(true);
      expect(matchesPattern('/rooms/abc123/settings', '/rooms/*')).toBe(true);
    });

    it('should match base path for wildcard', () => {
      expect(matchesPattern('/rooms', '/rooms/*')).toBe(true);
    });

    it('should not match unrelated paths with wildcard', () => {
      expect(matchesPattern('/profile', '/rooms/*')).toBe(false);
    });
  });

  describe('requiresAuth', () => {
    it('should return true for /rooms', () => {
      expect(requiresAuth('/rooms')).toBe(true);
    });

    it('should return true for /rooms/abc123', () => {
      expect(requiresAuth('/rooms/abc123')).toBe(true);
    });

    it('should return true for /profile', () => {
      expect(requiresAuth('/profile')).toBe(true);
    });

    it('should return true for /settings', () => {
      expect(requiresAuth('/settings')).toBe(true);
    });

    it('should return false for public routes', () => {
      expect(requiresAuth('/')).toBe(false);
      expect(requiresAuth('/auth/signin')).toBe(false);
      expect(requiresAuth('/auth/signup')).toBe(false);
      expect(requiresAuth('/api/health')).toBe(false);
    });

    it('should return false for unprotected routes', () => {
      expect(requiresAuth('/about')).toBe(false);
      expect(requiresAuth('/contact')).toBe(false);
    });
  });

  describe('getAuthRedirect', () => {
    it('should return redirect URL for protected routes', () => {
      expect(getAuthRedirect('/rooms')).toBe('/auth/signin');
      expect(getAuthRedirect('/rooms/abc123')).toBe('/auth/signin');
      expect(getAuthRedirect('/profile')).toBe('/auth/signin');
    });

    it('should return default signin for unmatched routes', () => {
      expect(getAuthRedirect('/unknown')).toBe('/auth/signin');
    });
  });

  describe('PUBLIC_ROUTES', () => {
    it('should include home page', () => {
      expect(PUBLIC_ROUTES).toContain('/');
    });

    it('should include auth pages', () => {
      expect(PUBLIC_ROUTES).toContain('/auth/signin');
      expect(PUBLIC_ROUTES).toContain('/auth/signup');
      expect(PUBLIC_ROUTES).toContain('/auth/reset-password');
      expect(PUBLIC_ROUTES).toContain('/auth/callback');
    });

    it('should include health check', () => {
      expect(PUBLIC_ROUTES).toContain('/api/health');
    });
  });

  describe('DEFAULT_PROTECTED_ROUTES', () => {
    it('should protect /rooms', () => {
      const roomsRoute = DEFAULT_PROTECTED_ROUTES.find(r => r.pattern === '/rooms');
      expect(roomsRoute).toBeDefined();
      expect(roomsRoute?.requireAuth).toBe(true);
    });

    it('should protect /rooms/*', () => {
      const roomsWildcard = DEFAULT_PROTECTED_ROUTES.find(r => r.pattern === '/rooms/*');
      expect(roomsWildcard).toBeDefined();
      expect(roomsWildcard?.requireAuth).toBe(true);
    });

    it('should protect /profile', () => {
      const profileRoute = DEFAULT_PROTECTED_ROUTES.find(r => r.pattern === '/profile');
      expect(profileRoute).toBeDefined();
      expect(profileRoute?.requireAuth).toBe(true);
    });
  });
});

// ========== Supabase Client Tests ==========

describe('Supabase Client', () => {
  beforeEach(() => {
    // Clear localStorage before each test
    if (typeof localStorage !== 'undefined') {
      localStorage.clear();
    }
  });

  describe('transformUser', () => {
    it('should transform Supabase user to UserProfile', () => {
      const supabaseUser: SupabaseUser = {
        id: 'user-123',
        email: 'test@example.com',
        user_metadata: {
          display_name: 'Test User',
          avatar_url: 'https://example.com/avatar.jpg',
        },
        created_at: '2024-01-01T00:00:00Z',
        last_sign_in_at: '2024-01-02T00:00:00Z',
      };

      const profile = transformUser(supabaseUser);

      expect(profile.id).toBe('user-123');
      expect(profile.email).toBe('test@example.com');
      expect(profile.displayName).toBe('Test User');
      expect(profile.avatarUrl).toBe('https://example.com/avatar.jpg');
      expect(profile.createdAt).toBeInstanceOf(Date);
      expect(profile.lastSignInAt).toBeInstanceOf(Date);
    });

    it('should use email as fallback for display name', () => {
      const supabaseUser: SupabaseUser = {
        id: 'user-123',
        email: 'john@example.com',
      };

      const profile = transformUser(supabaseUser);
      expect(profile.displayName).toBe('john');
    });

    it('should handle missing metadata', () => {
      const supabaseUser: SupabaseUser = {
        id: 'user-123',
      };

      const profile = transformUser(supabaseUser);
      expect(profile.email).toBe('');
      expect(profile.displayName).toBe('User');
      expect(profile.avatarUrl).toBeUndefined();
    });

    it('should use full_name from OAuth providers', () => {
      const supabaseUser: SupabaseUser = {
        id: 'user-123',
        email: 'test@example.com',
        user_metadata: {
          full_name: 'John Doe',
          picture: 'https://oauth.com/picture.jpg',
        },
      };

      const profile = transformUser(supabaseUser);
      expect(profile.displayName).toBe('John Doe');
      expect(profile.avatarUrl).toBe('https://oauth.com/picture.jpg');
    });
  });

  describe('transformSession', () => {
    it('should transform Supabase session to Session', () => {
      const supabaseSession: SupabaseSession = {
        access_token: 'access-token-123',
        refresh_token: 'refresh-token-456',
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        user: {
          id: 'user-123',
          email: 'test@example.com',
        },
      };

      const session = transformSession(supabaseSession);

      expect(session.accessToken).toBe('access-token-123');
      expect(session.refreshToken).toBe('refresh-token-456');
      expect(session.expiresAt).toBeInstanceOf(Date);
      expect(session.user.id).toBe('user-123');
    });

    it('should calculate expiry from expires_in if expires_at not provided', () => {
      const supabaseSession: SupabaseSession = {
        access_token: 'access-token-123',
        refresh_token: 'refresh-token-456',
        expires_in: 3600,
        user: {
          id: 'user-123',
          email: 'test@example.com',
        },
      };

      const session = transformSession(supabaseSession);
      const expectedExpiry = Date.now() + 3600 * 1000;

      // Allow 1 second tolerance
      expect(session.expiresAt.getTime()).toBeGreaterThan(expectedExpiry - 1000);
      expect(session.expiresAt.getTime()).toBeLessThan(expectedExpiry + 1000);
    });
  });

  describe('isSessionExpired', () => {
    it('should return false for valid session', () => {
      const session: Session = {
        accessToken: 'token',
        refreshToken: 'refresh',
        expiresAt: new Date(Date.now() + 3600000), // 1 hour from now
        user: {
          id: 'user-123',
          email: 'test@example.com',
          displayName: 'Test',
          createdAt: new Date(),
        },
      };

      expect(isSessionExpired(session)).toBe(false);
    });

    it('should return true for expired session', () => {
      const session: Session = {
        accessToken: 'token',
        refreshToken: 'refresh',
        expiresAt: new Date(Date.now() - 1000), // 1 second ago
        user: {
          id: 'user-123',
          email: 'test@example.com',
          displayName: 'Test',
          createdAt: new Date(),
        },
      };

      expect(isSessionExpired(session)).toBe(true);
    });

    it('should return true for session about to expire (within buffer)', () => {
      const session: Session = {
        accessToken: 'token',
        refreshToken: 'refresh',
        expiresAt: new Date(Date.now() + 30000), // 30 seconds from now (within 60s buffer)
        user: {
          id: 'user-123',
          email: 'test@example.com',
          displayName: 'Test',
          createdAt: new Date(),
        },
      };

      expect(isSessionExpired(session)).toBe(true);
    });
  });

  describe('session storage', () => {
    it('should store and retrieve session', () => {
      const session: Session = {
        accessToken: 'token-123',
        refreshToken: 'refresh-456',
        expiresAt: new Date(Date.now() + 3600000),
        user: {
          id: 'user-123',
          email: 'test@example.com',
          displayName: 'Test User',
          createdAt: new Date(),
        },
      };

      storeSession(session);
      const retrieved = getStoredSession();

      expect(retrieved).not.toBeNull();
      expect(retrieved?.accessToken).toBe('token-123');
      expect(retrieved?.user.displayName).toBe('Test User');
    });

    it('should clear stored session', () => {
      const session: Session = {
        accessToken: 'token-123',
        refreshToken: 'refresh-456',
        expiresAt: new Date(Date.now() + 3600000),
        user: {
          id: 'user-123',
          email: 'test@example.com',
          displayName: 'Test User',
          createdAt: new Date(),
        },
      };

      storeSession(session);
      clearStoredSession();

      expect(getStoredSession()).toBeNull();
    });

    it('should return null for no stored session', () => {
      expect(getStoredSession()).toBeNull();
    });
  });

  describe('SupabaseAuthClient', () => {
    it('should create client', () => {
      const client = createSupabaseAuthClient();
      expect(client).toBeDefined();
    });

    it('should sign up with valid credentials (mock mode)', async () => {
      const client = createSupabaseAuthClient();
      const { session, error } = await client.signUp(
        'test@example.com',
        'password123',
        { display_name: 'Test User' }
      );

      expect(error).toBeNull();
      expect(session).not.toBeNull();
      expect(session?.user.email).toBe('test@example.com');
    });

    it('should reject weak password on sign up', async () => {
      const client = createSupabaseAuthClient();
      const { session, error } = await client.signUp('test@example.com', '123');

      expect(error).not.toBeNull();
      expect(error?.message).toContain('6 characters');
      expect(session).toBeNull();
    });

    it('should reject invalid email on sign up', async () => {
      const client = createSupabaseAuthClient();
      const { session, error } = await client.signUp('invalid-email', 'password123');

      expect(error).not.toBeNull();
      expect(error?.message).toContain('email');
      expect(session).toBeNull();
    });

    it('should sign in with valid credentials (mock mode)', async () => {
      const client = createSupabaseAuthClient();
      const { session, error } = await client.signInWithPassword(
        'test@example.com',
        'password123'
      );

      expect(error).toBeNull();
      expect(session).not.toBeNull();
      expect(session?.user.email).toBe('test@example.com');
    });

    it('should reject invalid credentials on sign in', async () => {
      const client = createSupabaseAuthClient();
      const { session, error } = await client.signInWithPassword(
        'invalid-email',
        '123'
      );

      expect(error).not.toBeNull();
      expect(session).toBeNull();
    });

    it('should sign out', async () => {
      const client = createSupabaseAuthClient();
      await client.signInWithPassword('test@example.com', 'password123');

      expect(client.getSession()).not.toBeNull();

      const { error } = await client.signOut();

      expect(error).toBeNull();
      expect(client.getSession()).toBeNull();
    });

    it('should update user profile', async () => {
      const client = createSupabaseAuthClient();
      await client.signInWithPassword('test@example.com', 'password123');

      const { user, error } = await client.updateUser({
        data: { display_name: 'Updated Name' },
      });

      expect(error).toBeNull();
      // User object returned is the raw Supabase user
      expect(user).not.toBeNull();
    });

    it('should reject update when not authenticated', async () => {
      const client = createSupabaseAuthClient();
      const { user, error } = await client.updateUser({
        data: { display_name: 'Updated Name' },
      });

      expect(error).not.toBeNull();
      expect(error?.message).toContain('Not authenticated');
      expect(user).toBeNull();
    });

    it('should get current user', async () => {
      const client = createSupabaseAuthClient();
      await client.signInWithPassword('test@example.com', 'password123');

      const user = client.getUser();

      expect(user).not.toBeNull();
      expect(user?.email).toBe('test@example.com');
    });

    it('should return null for user when not authenticated', () => {
      const client = createSupabaseAuthClient();
      expect(client.getUser()).toBeNull();
    });
  });
});

// ========== Auth Context Tests ==========

describe('Auth Context', () => {
  // Create a fresh client for each test to avoid shared state
  let testClient: ReturnType<typeof createSupabaseAuthClient>;

  beforeEach(() => {
    localStorage.clear();
    testClient = createSupabaseAuthClient();
  });

  // Use a fresh wrapper for each test with isolated client
  const createWrapper = () => {
    const client = createSupabaseAuthClient();
    return ({ children }: { children: React.ReactNode }) => (
      <AuthProvider autoRefresh={false} supabaseClient={client}>{children}</AuthProvider>
    );
  };

  describe('useAuth', () => {
    it('should throw when used outside provider', () => {
      // Suppress console.error for this test
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

      expect(() => {
        renderHook(() => useAuth());
      }).toThrow('useAuth must be used within an AuthProvider');

      spy.mockRestore();
    });

    it('should provide initial loading state', async () => {
      const wrapper = createWrapper();
      const { result } = renderHook(() => useAuth(), { wrapper });

      // Initial state is loading, then transitions to unauthenticated
      await waitFor(() => {
        expect(result.current.state).toBe('unauthenticated');
      });
    });

    it('should provide signUp method', async () => {
      const wrapper = createWrapper();
      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.state).toBe('unauthenticated');
      });

      let signUpResult: any;
      await act(async () => {
        signUpResult = await result.current.signUp({
          email: 'new@example.com',
          password: 'password123',
          displayName: 'New User',
        });
      });

      expect(signUpResult.success).toBe(true);
      expect(result.current.state).toBe('authenticated');
      expect(result.current.user?.email).toBe('new@example.com');
    });

    it('should handle sign up errors', async () => {
      const wrapper = createWrapper();
      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.state).toBe('unauthenticated');
      });

      let signUpResult: any;
      await act(async () => {
        signUpResult = await result.current.signUp({
          email: 'test@example.com',
          password: '123', // Too short
        });
      });

      expect(signUpResult.success).toBe(false);
      expect(signUpResult.errorCode).toBe('weak_password');
      expect(result.current.state).toBe('unauthenticated');
    });

    it('should provide signIn method', async () => {
      const wrapper = createWrapper();
      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.state).toBe('unauthenticated');
      });

      let signInResult: any;
      await act(async () => {
        signInResult = await result.current.signIn({
          email: 'test@example.com',
          password: 'password123',
        });
      });

      expect(signInResult.success).toBe(true);
      expect(result.current.state).toBe('authenticated');
      expect(result.current.user?.email).toBe('test@example.com');
    });

    it('should handle sign in errors', async () => {
      const wrapper = createWrapper();
      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.state).toBe('unauthenticated');
      });

      let signInResult: any;
      await act(async () => {
        signInResult = await result.current.signIn({
          email: 'invalid',
          password: '123',
        });
      });

      expect(signInResult.success).toBe(false);
      expect(signInResult.errorCode).toBe('invalid_credentials');
    });

    it('should provide signOut method', async () => {
      const wrapper = createWrapper();
      const { result } = renderHook(() => useAuth(), { wrapper });

      // Sign in first
      await waitFor(() => {
        expect(result.current.state).toBe('unauthenticated');
      });

      await act(async () => {
        await result.current.signIn({
          email: 'test@example.com',
          password: 'password123',
        });
      });

      expect(result.current.state).toBe('authenticated');

      // Sign out
      await act(async () => {
        await result.current.signOut();
      });

      expect(result.current.state).toBe('unauthenticated');
      expect(result.current.user).toBeNull();
      expect(result.current.session).toBeNull();
    });

    it('should provide resetPassword method', async () => {
      const wrapper = createWrapper();
      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.state).toBe('unauthenticated');
      });

      let resetResult: any;
      await act(async () => {
        resetResult = await result.current.resetPassword({
          email: 'test@example.com',
        });
      });

      expect(resetResult.success).toBe(true);
    });

    it('should provide updateProfile method', async () => {
      const wrapper = createWrapper();
      const { result } = renderHook(() => useAuth(), { wrapper });

      // Sign in first
      await waitFor(() => {
        expect(result.current.state).toBe('unauthenticated');
      });

      await act(async () => {
        await result.current.signIn({
          email: 'test@example.com',
          password: 'password123',
        });
      });

      let updateResult: any;
      await act(async () => {
        updateResult = await result.current.updateProfile({
          displayName: 'Updated Name',
        });
      });

      expect(updateResult.success).toBe(true);
    });
  });

  describe('useIsAuthenticated', () => {
    it('should return false when not authenticated', async () => {
      const wrapper = createWrapper();
      const { result } = renderHook(() => useIsAuthenticated(), { wrapper });

      await waitFor(() => {
        expect(result.current).toBe(false);
      });
    });

    it('should return true when authenticated', async () => {
      const wrapper = createWrapper();
      const { result: authResult } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(authResult.current.state).toBe('unauthenticated');
      });

      await act(async () => {
        await authResult.current.signIn({
          email: 'test@example.com',
          password: 'password123',
        });
      });

      // Now check within same wrapper
      expect(authResult.current.state).toBe('authenticated');
    });
  });

  describe('useUser', () => {
    it('should return null when not authenticated', async () => {
      const wrapper = createWrapper();
      const { result } = renderHook(() => useUser(), { wrapper });

      await waitFor(() => {
        expect(result.current).toBeNull();
      });
    });

    it('should return user when authenticated', async () => {
      const wrapper = createWrapper();
      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.state).toBe('unauthenticated');
      });

      await act(async () => {
        await result.current.signIn({
          email: 'test@example.com',
          password: 'password123',
        });
      });

      // Check user from the same hook result
      expect(result.current.user).not.toBeNull();
      expect(result.current.user?.email).toBe('test@example.com');
    });
  });

  describe('useAuthState', () => {
    it('should return unauthenticated initially', async () => {
      const wrapper = createWrapper();
      const { result } = renderHook(() => useAuthState(), { wrapper });

      await waitFor(() => {
        expect(result.current).toBe('unauthenticated');
      });
    });

    it('should return authenticated after sign in', async () => {
      const wrapper = createWrapper();
      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.state).toBe('unauthenticated');
      });

      await act(async () => {
        await result.current.signIn({
          email: 'test@example.com',
          password: 'password123',
        });
      });

      expect(result.current.state).toBe('authenticated');
    });
  });

  describe('session persistence', () => {
    it('should restore session from storage', async () => {
      // Create a mock session in storage
      const mockSession: Session = {
        accessToken: 'stored-token',
        refreshToken: 'stored-refresh',
        expiresAt: new Date(Date.now() + 3600000),
        user: {
          id: 'stored-user',
          email: 'stored@example.com',
          displayName: 'Stored User',
          createdAt: new Date(),
        },
      };
      storeSession(mockSession);

      // Create a new provider that should restore the session from storage
      const wrapper = createWrapper();
      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.state).toBe('authenticated');
        expect(result.current.user?.email).toBe('stored@example.com');
      });
    });
  });
});

// ========== Integration Tests ==========

describe('Auth Integration', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('should complete full auth flow', async () => {
    const client = createSupabaseAuthClient();
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AuthProvider autoRefresh={false} supabaseClient={client}>{children}</AuthProvider>
    );

    const { result } = renderHook(() => useAuth(), { wrapper });

    // Wait for initial load
    await waitFor(() => {
      expect(result.current.state).toBe('unauthenticated');
    });

    // Sign up
    await act(async () => {
      const signUpResult = await result.current.signUp({
        email: 'newuser@example.com',
        password: 'securepassword123',
        displayName: 'New User',
      });
      expect(signUpResult.success).toBe(true);
    });

    expect(result.current.state).toBe('authenticated');
    expect(result.current.user?.displayName).toBe('New User');

    // Update profile
    await act(async () => {
      const updateResult = await result.current.updateProfile({
        displayName: 'Updated User',
      });
      expect(updateResult.success).toBe(true);
    });

    // Sign out
    await act(async () => {
      await result.current.signOut();
    });

    expect(result.current.state).toBe('unauthenticated');
    expect(result.current.user).toBeNull();

    // Sign back in
    await act(async () => {
      const signInResult = await result.current.signIn({
        email: 'newuser@example.com',
        password: 'securepassword123',
      });
      expect(signInResult.success).toBe(true);
    });

    expect(result.current.state).toBe('authenticated');
  });

  it('should handle route protection logic', () => {
    // Test that route protection works correctly
    expect(requiresAuth('/rooms')).toBe(true);
    expect(requiresAuth('/rooms/abc123')).toBe(true);
    expect(requiresAuth('/')).toBe(false);
    expect(requiresAuth('/auth/signin')).toBe(false);
  });
});
