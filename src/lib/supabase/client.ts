/**
 * Supabase Client Configuration
 *
 * Client-side Supabase instance for browser environments.
 *
 * Part of the Long-Horizon Engineering Protocol - FEAT-400
 */

import type { UserProfile, Session } from "@/types/auth";

/**
 * Supabase configuration from environment
 */
export interface SupabaseConfig {
  url: string;
  anonKey: string;
}

/**
 * Get Supabase configuration
 */
export function getSupabaseConfig(): SupabaseConfig {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    // Return mock config for development/testing without Supabase
    return {
      url: "http://localhost:54321",
      anonKey: "mock-anon-key",
    };
  }

  return { url, anonKey };
}

/**
 * Check if Supabase is configured
 */
export function isSupabaseConfigured(): boolean {
  return !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

/**
 * Auth user metadata from Supabase
 */
export interface SupabaseUserMetadata {
  display_name?: string;
  avatar_url?: string;
  full_name?: string;
  name?: string;
  picture?: string;
}

/**
 * Raw Supabase user object (simplified for our needs)
 */
export interface SupabaseUser {
  id: string;
  email?: string;
  user_metadata?: SupabaseUserMetadata;
  created_at?: string;
  last_sign_in_at?: string;
}

/**
 * Raw Supabase session object (simplified)
 */
export interface SupabaseSession {
  access_token: string;
  refresh_token: string;
  expires_at?: number;
  expires_in?: number;
  user: SupabaseUser;
}

/**
 * Transform Supabase user to UserProfile
 */
export function transformUser(user: SupabaseUser): UserProfile {
  const metadata = user.user_metadata || {};

  return {
    id: user.id,
    email: user.email || "",
    displayName:
      metadata.display_name ||
      metadata.full_name ||
      metadata.name ||
      user.email?.split("@")[0] ||
      "User",
    avatarUrl: metadata.avatar_url || metadata.picture,
    createdAt: user.created_at ? new Date(user.created_at) : new Date(),
    lastSignInAt: user.last_sign_in_at
      ? new Date(user.last_sign_in_at)
      : undefined,
  };
}

/**
 * Transform Supabase session to Session
 */
export function transformSession(session: SupabaseSession): Session {
  const expiresAt = session.expires_at
    ? new Date(session.expires_at * 1000)
    : new Date(Date.now() + (session.expires_in || 3600) * 1000);

  return {
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
    expiresAt,
    user: transformUser(session.user),
  };
}

/**
 * Storage key for auth tokens
 */
export const AUTH_STORAGE_KEY = "sync-auth";

/**
 * Get stored session from localStorage
 */
export function getStoredSession(): Session | null {
  if (typeof window === "undefined") return null;

  try {
    const stored = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!stored) return null;

    const data = JSON.parse(stored);

    // Validate required fields exist
    if (!data.accessToken || !data.user?.id) {
      return null;
    }

    // Reconstruct dates with fallbacks
    return {
      accessToken: data.accessToken,
      refreshToken: data.refreshToken || "",
      expiresAt: data.expiresAt
        ? new Date(data.expiresAt)
        : new Date(Date.now() + 3600000),
      user: {
        id: data.user.id,
        email: data.user.email || "",
        displayName:
          data.user.displayName || data.user.email?.split("@")[0] || "User",
        avatarUrl: data.user.avatarUrl,
        createdAt: data.user.createdAt
          ? new Date(data.user.createdAt)
          : new Date(),
        lastSignInAt: data.user.lastSignInAt
          ? new Date(data.user.lastSignInAt)
          : undefined,
      },
    };
  } catch {
    return null;
  }
}

/**
 * Store session in localStorage and cookie (for middleware)
 */
export function storeSession(session: Session): void {
  if (typeof window === "undefined") return;

  try {
    const sessionJson = JSON.stringify(session);

    // Store in localStorage
    localStorage.setItem(AUTH_STORAGE_KEY, sessionJson);

    // Store in cookie for middleware (domain=.chnl.net for subdomain support)
    const cookieDomain = window.location.hostname.endsWith(".chnl.net")
      ? "; domain=.chnl.net"
      : "";
    document.cookie = `${AUTH_STORAGE_KEY}=${encodeURIComponent(sessionJson)}; path=/; expires=${session.expiresAt.toUTCString()}; SameSite=Lax${cookieDomain}`;
  } catch {
    // Ignore storage errors
  }
}

/**
 * Clear stored session from localStorage and cookie
 */
export function clearStoredSession(): void {
  if (typeof window === "undefined") return;

  try {
    // Clear localStorage
    localStorage.removeItem(AUTH_STORAGE_KEY);

    // Clear cookie (set expired date)
    const cookieDomain = window.location.hostname.endsWith(".chnl.net")
      ? "; domain=.chnl.net"
      : "";
    document.cookie = `${AUTH_STORAGE_KEY}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax${cookieDomain}`;
  } catch {
    // Ignore storage errors
  }
}

/**
 * Check if session is expired
 */
export function isSessionExpired(session: Session): boolean {
  // Add 60 second buffer for token refresh
  return session.expiresAt.getTime() < Date.now() + 60000;
}

/**
 * Supabase Auth API client (mock implementation for testing)
 * In production, this would use the actual Supabase client
 */
export class SupabaseAuthClient {
  private config: SupabaseConfig;
  private currentSession: Session | null = null;

  constructor(config?: SupabaseConfig) {
    this.config = config || getSupabaseConfig();
    this.currentSession = getStoredSession();
  }

  /**
   * Sign up with email and password
   */
  async signUp(
    email: string,
    password: string,
    metadata?: SupabaseUserMetadata,
  ): Promise<{ session: SupabaseSession | null; error: Error | null }> {
    if (!isSupabaseConfigured()) {
      return this.mockSignUp(email, password, metadata);
    }

    try {
      const response = await fetch(`${this.config.url}/auth/v1/signup`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: this.config.anonKey,
        },
        body: JSON.stringify({
          email,
          password,
          data: metadata,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        return {
          session: null,
          error: new Error(
            data.error_description || data.msg || "Sign up failed",
          ),
        };
      }

      if (data.access_token) {
        const session: SupabaseSession = {
          access_token: data.access_token,
          refresh_token: data.refresh_token,
          expires_at: data.expires_at,
          expires_in: data.expires_in,
          user: data.user,
        };
        this.setSession(transformSession(session));
        return { session, error: null };
      }

      // Email confirmation required
      return { session: null, error: null };
    } catch (error) {
      return { session: null, error: error as Error };
    }
  }

  /**
   * Sign in with email and password
   */
  async signInWithPassword(
    email: string,
    password: string,
  ): Promise<{ session: SupabaseSession | null; error: Error | null }> {
    if (!isSupabaseConfigured()) {
      return this.mockSignIn(email, password);
    }

    try {
      const response = await fetch(
        `${this.config.url}/auth/v1/token?grant_type=password`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: this.config.anonKey,
          },
          body: JSON.stringify({ email, password }),
        },
      );

      const data = await response.json();

      if (!response.ok) {
        return {
          session: null,
          error: new Error(
            data.error_description || data.msg || "Sign in failed",
          ),
        };
      }

      const session: SupabaseSession = {
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_at: data.expires_at,
        expires_in: data.expires_in,
        user: data.user,
      };
      this.setSession(transformSession(session));
      return { session, error: null };
    } catch (error) {
      return { session: null, error: error as Error };
    }
  }

  /**
   * Sign in with OAuth provider
   */
  async signInWithOAuth(
    provider: "google" | "apple",
    redirectTo?: string,
  ): Promise<{ url: string | null; error: Error | null }> {
    if (!isSupabaseConfigured()) {
      return {
        url: null,
        error: new Error("OAuth not available in mock mode"),
      };
    }

    try {
      const params = new URLSearchParams({
        provider,
        redirect_to: redirectTo || `${window.location.origin}/auth/callback`,
      });

      const url = `${this.config.url}/auth/v1/authorize?${params}`;
      return { url, error: null };
    } catch (error) {
      return { url: null, error: error as Error };
    }
  }

  /**
   * Send magic link
   */
  async signInWithOtp(
    email: string,
    redirectTo?: string,
  ): Promise<{ error: Error | null }> {
    if (!isSupabaseConfigured()) {
      return { error: new Error("Magic link not available in mock mode") };
    }

    try {
      const response = await fetch(`${this.config.url}/auth/v1/otp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: this.config.anonKey,
        },
        body: JSON.stringify({
          email,
          options: {
            emailRedirectTo:
              redirectTo || `${window.location.origin}/auth/callback`,
          },
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        return {
          error: new Error(
            data.error_description || data.msg || "Failed to send magic link",
          ),
        };
      }

      return { error: null };
    } catch (error) {
      return { error: error as Error };
    }
  }

  /**
   * Reset password
   */
  async resetPasswordForEmail(
    email: string,
    redirectTo?: string,
  ): Promise<{ error: Error | null }> {
    if (!isSupabaseConfigured()) {
      return { error: null }; // Mock success
    }

    try {
      const response = await fetch(`${this.config.url}/auth/v1/recover`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: this.config.anonKey,
        },
        body: JSON.stringify({
          email,
          options: {
            redirectTo:
              redirectTo || `${window.location.origin}/auth/reset-password`,
          },
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        return {
          error: new Error(
            data.error_description || data.msg || "Failed to reset password",
          ),
        };
      }

      return { error: null };
    } catch (error) {
      return { error: error as Error };
    }
  }

  /**
   * Update password
   */
  async updateUser(updates: {
    password?: string;
    data?: SupabaseUserMetadata;
  }): Promise<{ user: SupabaseUser | null; error: Error | null }> {
    if (!isSupabaseConfigured()) {
      return this.mockUpdateUser(updates);
    }

    if (!this.currentSession) {
      return { user: null, error: new Error("Not authenticated") };
    }

    try {
      const response = await fetch(`${this.config.url}/auth/v1/user`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          apikey: this.config.anonKey,
          Authorization: `Bearer ${this.currentSession.accessToken}`,
        },
        body: JSON.stringify(updates),
      });

      const data = await response.json();

      if (!response.ok) {
        return {
          user: null,
          error: new Error(
            data.error_description || data.msg || "Failed to update user",
          ),
        };
      }

      // Update stored session with new user data
      if (this.currentSession) {
        this.currentSession = {
          ...this.currentSession,
          user: transformUser(data),
        };
        storeSession(this.currentSession);
      }

      return { user: data, error: null };
    } catch (error) {
      return { user: null, error: error as Error };
    }
  }

  /**
   * Sign out
   */
  async signOut(): Promise<{ error: Error | null }> {
    if (!isSupabaseConfigured()) {
      this.clearSession();
      return { error: null };
    }

    try {
      if (this.currentSession) {
        await fetch(`${this.config.url}/auth/v1/logout`, {
          method: "POST",
          headers: {
            apikey: this.config.anonKey,
            Authorization: `Bearer ${this.currentSession.accessToken}`,
          },
        });
      }

      this.clearSession();
      return { error: null };
    } catch (error) {
      this.clearSession();
      return { error: error as Error };
    }
  }

  /**
   * Refresh session
   */
  async refreshSession(): Promise<{
    session: SupabaseSession | null;
    error: Error | null;
  }> {
    if (!isSupabaseConfigured()) {
      return { session: null, error: null };
    }

    if (!this.currentSession) {
      return { session: null, error: new Error("No session to refresh") };
    }

    try {
      const response = await fetch(
        `${this.config.url}/auth/v1/token?grant_type=refresh_token`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: this.config.anonKey,
          },
          body: JSON.stringify({
            refresh_token: this.currentSession.refreshToken,
          }),
        },
      );

      const data = await response.json();

      if (!response.ok) {
        this.clearSession();
        return {
          session: null,
          error: new Error(
            data.error_description || data.msg || "Session refresh failed",
          ),
        };
      }

      const session: SupabaseSession = {
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_at: data.expires_at,
        expires_in: data.expires_in,
        user: data.user,
      };
      this.setSession(transformSession(session));
      return { session, error: null };
    } catch (error) {
      return { session: null, error: error as Error };
    }
  }

  /**
   * Get current session (always reads fresh from localStorage)
   */
  getSession(): Session | null {
    // Always read fresh from localStorage to pick up sessions stored by OAuth callback
    const storedSession = getStoredSession();
    if (storedSession) {
      this.currentSession = storedSession;
    }
    return this.currentSession;
  }

  /**
   * Get current user
   */
  getUser(): UserProfile | null {
    return this.getSession()?.user || null;
  }

  /**
   * Set session
   */
  private setSession(session: Session): void {
    this.currentSession = session;
    storeSession(session);
  }

  /**
   * Clear session
   */
  private clearSession(): void {
    this.currentSession = null;
    clearStoredSession();
  }

  // ========== Mock implementations for testing ==========

  private mockSignUp(
    email: string,
    password: string,
    metadata?: SupabaseUserMetadata,
  ): { session: SupabaseSession | null; error: Error | null } {
    if (password.length < 6) {
      return {
        session: null,
        error: new Error("Password should be at least 6 characters"),
      };
    }

    if (!email.includes("@")) {
      return {
        session: null,
        error: new Error("Unable to validate email address: invalid format"),
      };
    }

    const user: SupabaseUser = {
      id: `mock-user-${Date.now()}`,
      email,
      user_metadata: metadata,
      created_at: new Date().toISOString(),
    };

    const session: SupabaseSession = {
      access_token: `mock-access-token-${Date.now()}`,
      refresh_token: `mock-refresh-token-${Date.now()}`,
      expires_in: 3600,
      user,
    };

    this.setSession(transformSession(session));
    return { session, error: null };
  }

  private mockSignIn(
    email: string,
    password: string,
  ): { session: SupabaseSession | null; error: Error | null } {
    // For mock, accept any valid-looking credentials
    if (!email.includes("@") || password.length < 6) {
      return { session: null, error: new Error("Invalid login credentials") };
    }

    const user: SupabaseUser = {
      id: `mock-user-${email.replace(/[^a-z0-9]/gi, "")}`,
      email,
      user_metadata: { display_name: email.split("@")[0] },
      created_at: new Date().toISOString(),
      last_sign_in_at: new Date().toISOString(),
    };

    const session: SupabaseSession = {
      access_token: `mock-access-token-${Date.now()}`,
      refresh_token: `mock-refresh-token-${Date.now()}`,
      expires_in: 3600,
      user,
    };

    this.setSession(transformSession(session));
    return { session, error: null };
  }

  private mockUpdateUser(updates: {
    password?: string;
    data?: SupabaseUserMetadata;
  }): { user: SupabaseUser | null; error: Error | null } {
    if (!this.currentSession) {
      return { user: null, error: new Error("Not authenticated") };
    }

    if (updates.password && updates.password.length < 6) {
      return {
        user: null,
        error: new Error("Password should be at least 6 characters"),
      };
    }

    const updatedUser: SupabaseUser = {
      id: this.currentSession.user.id,
      email: this.currentSession.user.email,
      user_metadata: {
        ...updates.data,
      },
      created_at: this.currentSession.user.createdAt.toISOString(),
      last_sign_in_at: this.currentSession.user.lastSignInAt?.toISOString(),
    };

    this.currentSession = {
      ...this.currentSession,
      user: transformUser(updatedUser),
    };
    storeSession(this.currentSession);

    return { user: updatedUser, error: null };
  }
}

/**
 * Singleton Supabase auth client
 */
let authClient: SupabaseAuthClient | null = null;

/**
 * Get or create Supabase auth client
 */
export function getSupabaseAuthClient(): SupabaseAuthClient {
  if (!authClient) {
    authClient = new SupabaseAuthClient();
  }
  return authClient;
}

/**
 * Create a new Supabase auth client (for testing)
 */
export function createSupabaseAuthClient(
  config?: SupabaseConfig,
): SupabaseAuthClient {
  return new SupabaseAuthClient(config);
}
