/**
 * Auth Context Provider
 *
 * React context for authentication state and methods.
 *
 * Part of the Long-Horizon Engineering Protocol - FEAT-400
 */

'use client';

import React, {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useState,
  useMemo,
} from 'react';
import type {
  AuthContextValue,
  AuthState,
  UserProfile,
  Session,
  SignUpRequest,
  SignInRequest,
  OAuthSignInRequest,
  MagicLinkRequest,
  PasswordResetRequest,
  PasswordUpdateRequest,
  AuthResult,
} from '@/types/auth';
import { mapAuthErrorCode, getAuthErrorMessage } from '@/types/auth';
import {
  getSupabaseAuthClient,
  isSessionExpired,
  type SupabaseAuthClient,
} from '@/lib/supabase';

/**
 * Auth context
 */
const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Auth provider props
 */
export interface AuthProviderProps {
  /** Child components */
  children: React.ReactNode;
  /** Custom Supabase client (for testing) */
  supabaseClient?: SupabaseAuthClient;
  /** Auto refresh session before expiry */
  autoRefresh?: boolean;
  /** Refresh buffer (ms before expiry to refresh) */
  refreshBuffer?: number;
}

/**
 * Auth provider component
 */
export function AuthProvider({
  children,
  supabaseClient,
  autoRefresh = true,
  refreshBuffer = 60000, // 1 minute before expiry
}: AuthProviderProps): React.ReactElement {
  const [state, setState] = useState<AuthState>('loading');
  const [user, setUser] = useState<UserProfile | null>(null);
  const [session, setSession] = useState<Session | null>(null);

  const client = useMemo(
    () => supabaseClient || getSupabaseAuthClient(),
    [supabaseClient]
  );

  // Initialize auth state from stored session
  useEffect(() => {
    const storedSession = client.getSession();

    if (storedSession) {
      if (isSessionExpired(storedSession)) {
        // Session expired, try to refresh
        client.refreshSession().then(({ session: newSession, error }) => {
          if (newSession && !error) {
            const transformed = client.getSession();
            setSession(transformed);
            setUser(transformed?.user || null);
            setState('authenticated');
          } else {
            setState('unauthenticated');
          }
        });
      } else {
        setSession(storedSession);
        setUser(storedSession.user);
        setState('authenticated');
      }
    } else {
      setState('unauthenticated');
    }
  }, [client]);

  // Auto-refresh session before expiry
  useEffect(() => {
    if (!autoRefresh || !session) return;

    const timeUntilExpiry = session.expiresAt.getTime() - Date.now();
    const refreshTime = Math.max(timeUntilExpiry - refreshBuffer, 0);

    if (refreshTime <= 0) {
      // Already expired or about to, refresh immediately
      client.refreshSession().then(({ error }) => {
        if (error) {
          setState('unauthenticated');
          setUser(null);
          setSession(null);
        } else {
          const newSession = client.getSession();
          if (newSession) {
            setSession(newSession);
            setUser(newSession.user);
          }
        }
      });
      return;
    }

    const timer = setTimeout(() => {
      client.refreshSession().then(({ error }) => {
        if (error) {
          setState('unauthenticated');
          setUser(null);
          setSession(null);
        } else {
          const newSession = client.getSession();
          if (newSession) {
            setSession(newSession);
            setUser(newSession.user);
          }
        }
      });
    }, refreshTime);

    return () => clearTimeout(timer);
  }, [autoRefresh, refreshBuffer, session, client]);

  /**
   * Sign up with email and password
   */
  const signUp = useCallback(
    async (request: SignUpRequest): Promise<AuthResult> => {
      try {
        const { session: supabaseSession, error } = await client.signUp(
          request.email,
          request.password,
          request.displayName ? { display_name: request.displayName } : undefined
        );

        if (error) {
          const errorCode = mapAuthErrorCode(error.message);
          return {
            success: false,
            error: getAuthErrorMessage(errorCode),
            errorCode,
          };
        }

        if (supabaseSession) {
          const newSession = client.getSession();
          if (newSession) {
            setSession(newSession);
            setUser(newSession.user);
            setState('authenticated');
            return { success: true, user: newSession.user };
          }
        }

        // Email confirmation required
        return {
          success: true,
          error: 'Please check your email to confirm your account',
        };
      } catch (error) {
        return {
          success: false,
          error: 'An unexpected error occurred',
          errorCode: 'unknown_error',
        };
      }
    },
    [client]
  );

  /**
   * Sign in with email and password
   */
  const signIn = useCallback(
    async (request: SignInRequest): Promise<AuthResult> => {
      try {
        const { session: supabaseSession, error } = await client.signInWithPassword(
          request.email,
          request.password
        );

        if (error) {
          const errorCode = mapAuthErrorCode(error.message);
          return {
            success: false,
            error: getAuthErrorMessage(errorCode),
            errorCode,
          };
        }

        if (supabaseSession) {
          const newSession = client.getSession();
          if (newSession) {
            setSession(newSession);
            setUser(newSession.user);
            setState('authenticated');
            return { success: true, user: newSession.user };
          }
        }

        return {
          success: false,
          error: 'Sign in failed',
          errorCode: 'unknown_error',
        };
      } catch (error) {
        return {
          success: false,
          error: 'An unexpected error occurred',
          errorCode: 'unknown_error',
        };
      }
    },
    [client]
  );

  /**
   * Sign in with OAuth provider
   */
  const signInWithOAuth = useCallback(
    async (request: OAuthSignInRequest): Promise<AuthResult> => {
      try {
        const { url, error } = await client.signInWithOAuth(
          request.provider,
          request.redirectTo
        );

        if (error) {
          return {
            success: false,
            error: error.message,
            errorCode: 'unknown_error',
          };
        }

        if (url) {
          // Redirect to OAuth provider
          window.location.href = url;
          return { success: true };
        }

        return {
          success: false,
          error: 'OAuth sign in failed',
          errorCode: 'unknown_error',
        };
      } catch (error) {
        return {
          success: false,
          error: 'An unexpected error occurred',
          errorCode: 'unknown_error',
        };
      }
    },
    [client]
  );

  /**
   * Sign in with magic link
   */
  const signInWithMagicLink = useCallback(
    async (request: MagicLinkRequest): Promise<AuthResult> => {
      try {
        const { error } = await client.signInWithOtp(
          request.email,
          request.redirectTo
        );

        if (error) {
          const errorCode = mapAuthErrorCode(error.message);
          return {
            success: false,
            error: getAuthErrorMessage(errorCode),
            errorCode,
          };
        }

        return {
          success: true,
          error: 'Check your email for the magic link',
        };
      } catch (error) {
        return {
          success: false,
          error: 'An unexpected error occurred',
          errorCode: 'unknown_error',
        };
      }
    },
    [client]
  );

  /**
   * Sign out
   */
  const signOut = useCallback(async (): Promise<void> => {
    await client.signOut();
    setState('unauthenticated');
    setUser(null);
    setSession(null);
  }, [client]);

  /**
   * Reset password
   */
  const resetPassword = useCallback(
    async (request: PasswordResetRequest): Promise<AuthResult> => {
      try {
        const { error } = await client.resetPasswordForEmail(request.email);

        if (error) {
          const errorCode = mapAuthErrorCode(error.message);
          return {
            success: false,
            error: getAuthErrorMessage(errorCode),
            errorCode,
          };
        }

        return {
          success: true,
          error: 'Check your email for password reset instructions',
        };
      } catch (error) {
        return {
          success: false,
          error: 'An unexpected error occurred',
          errorCode: 'unknown_error',
        };
      }
    },
    [client]
  );

  /**
   * Update password
   */
  const updatePassword = useCallback(
    async (request: PasswordUpdateRequest): Promise<AuthResult> => {
      try {
        const { error } = await client.updateUser({ password: request.password });

        if (error) {
          const errorCode = mapAuthErrorCode(error.message);
          return {
            success: false,
            error: getAuthErrorMessage(errorCode),
            errorCode,
          };
        }

        return { success: true };
      } catch (error) {
        return {
          success: false,
          error: 'An unexpected error occurred',
          errorCode: 'unknown_error',
        };
      }
    },
    [client]
  );

  /**
   * Update profile
   */
  const updateProfile = useCallback(
    async (
      updates: Partial<Pick<UserProfile, 'displayName' | 'avatarUrl'>>
    ): Promise<AuthResult> => {
      try {
        const { user: updatedUser, error } = await client.updateUser({
          data: {
            display_name: updates.displayName,
            avatar_url: updates.avatarUrl,
          },
        });

        if (error) {
          return {
            success: false,
            error: error.message,
            errorCode: 'unknown_error',
          };
        }

        // Update local state
        const newSession = client.getSession();
        if (newSession) {
          setSession(newSession);
          setUser(newSession.user);
        }

        return { success: true, user: newSession?.user };
      } catch (error) {
        return {
          success: false,
          error: 'An unexpected error occurred',
          errorCode: 'unknown_error',
        };
      }
    },
    [client]
  );

  /**
   * Refresh session
   */
  const refreshSession = useCallback(async (): Promise<void> => {
    const { error } = await client.refreshSession();

    if (error) {
      setState('unauthenticated');
      setUser(null);
      setSession(null);
    } else {
      const newSession = client.getSession();
      if (newSession) {
        setSession(newSession);
        setUser(newSession.user);
        setState('authenticated');
      }
    }
  }, [client]);

  const value = useMemo<AuthContextValue>(
    () => ({
      state,
      user,
      session,
      signUp,
      signIn,
      signInWithOAuth,
      signInWithMagicLink,
      signOut,
      resetPassword,
      updatePassword,
      updateProfile,
      refreshSession,
    }),
    [
      state,
      user,
      session,
      signUp,
      signIn,
      signInWithOAuth,
      signInWithMagicLink,
      signOut,
      resetPassword,
      updatePassword,
      updateProfile,
      refreshSession,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * Hook to access auth context
 */
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }

  return context;
}

/**
 * Hook to check if user is authenticated
 */
export function useIsAuthenticated(): boolean {
  const { state } = useAuth();
  return state === 'authenticated';
}

/**
 * Hook to get current user
 */
export function useUser(): UserProfile | null {
  const { user } = useAuth();
  return user;
}

/**
 * Hook to check auth state
 */
export function useAuthState(): AuthState {
  const { state } = useAuth();
  return state;
}
