/**
 * Authentication Types
 *
 * TypeScript types for user authentication and session management.
 *
 * Part of the Long-Horizon Engineering Protocol - FEAT-400
 */

/**
 * User ID (UUID from Supabase)
 */
export type UserId = string;

/**
 * User profile information
 */
export interface UserProfile {
  /** Unique user ID */
  id: UserId;
  /** User's email address */
  email: string;
  /** Display name */
  displayName: string;
  /** Avatar URL */
  avatarUrl?: string;
  /** When the user was created */
  createdAt: Date;
  /** When the user last signed in */
  lastSignInAt?: Date;
}

/**
 * Authentication state
 */
export type AuthState =
  | 'loading'
  | 'authenticated'
  | 'unauthenticated'
  | 'error';

/**
 * Sign-in methods supported
 */
export type SignInMethod = 'email' | 'google' | 'github' | 'magic_link';

/**
 * Sign-up request
 */
export interface SignUpRequest {
  /** Email address */
  email: string;
  /** Password (min 6 characters) */
  password: string;
  /** Display name */
  displayName?: string;
}

/**
 * Sign-in with email/password request
 */
export interface SignInRequest {
  /** Email address */
  email: string;
  /** Password */
  password: string;
}

/**
 * Magic link request
 */
export interface MagicLinkRequest {
  /** Email address */
  email: string;
  /** Redirect URL after sign-in */
  redirectTo?: string;
}

/**
 * OAuth sign-in request
 */
export interface OAuthSignInRequest {
  /** OAuth provider */
  provider: 'google' | 'github';
  /** Redirect URL after sign-in */
  redirectTo?: string;
}

/**
 * Password reset request
 */
export interface PasswordResetRequest {
  /** Email address */
  email: string;
}

/**
 * Password update request
 */
export interface PasswordUpdateRequest {
  /** New password */
  password: string;
}

/**
 * Authentication result
 */
export interface AuthResult {
  /** Whether the operation succeeded */
  success: boolean;
  /** User profile (if authenticated) */
  user?: UserProfile;
  /** Error message (if failed) */
  error?: string;
  /** Error code (if failed) */
  errorCode?: string;
}

/**
 * Session information
 */
export interface Session {
  /** Access token */
  accessToken: string;
  /** Refresh token */
  refreshToken: string;
  /** When the session expires */
  expiresAt: Date;
  /** User profile */
  user: UserProfile;
}

/**
 * Auth context value
 */
export interface AuthContextValue {
  /** Current auth state */
  state: AuthState;
  /** Current user (if authenticated) */
  user: UserProfile | null;
  /** Current session (if authenticated) */
  session: Session | null;
  /** Sign up with email/password */
  signUp: (request: SignUpRequest) => Promise<AuthResult>;
  /** Sign in with email/password */
  signIn: (request: SignInRequest) => Promise<AuthResult>;
  /** Sign in with OAuth provider */
  signInWithOAuth: (request: OAuthSignInRequest) => Promise<AuthResult>;
  /** Sign in with magic link */
  signInWithMagicLink: (request: MagicLinkRequest) => Promise<AuthResult>;
  /** Sign out */
  signOut: () => Promise<void>;
  /** Reset password */
  resetPassword: (request: PasswordResetRequest) => Promise<AuthResult>;
  /** Update password */
  updatePassword: (request: PasswordUpdateRequest) => Promise<AuthResult>;
  /** Update user profile */
  updateProfile: (updates: Partial<Pick<UserProfile, 'displayName' | 'avatarUrl'>>) => Promise<AuthResult>;
  /** Refresh the session */
  refreshSession: () => Promise<void>;
}

/**
 * Auth error codes
 */
export type AuthErrorCode =
  | 'invalid_credentials'
  | 'email_not_confirmed'
  | 'user_not_found'
  | 'email_taken'
  | 'weak_password'
  | 'invalid_email'
  | 'rate_limited'
  | 'network_error'
  | 'session_expired'
  | 'unknown_error';

/**
 * Map Supabase error codes to our error codes
 */
export function mapAuthErrorCode(supabaseError: string): AuthErrorCode {
  const errorMap: Record<string, AuthErrorCode> = {
    'Invalid login credentials': 'invalid_credentials',
    'Email not confirmed': 'email_not_confirmed',
    'User not found': 'user_not_found',
    'User already registered': 'email_taken',
    'Password should be at least 6 characters': 'weak_password',
    'Unable to validate email address: invalid format': 'invalid_email',
    'For security purposes, you can only request this once every 60 seconds': 'rate_limited',
  };

  return errorMap[supabaseError] || 'unknown_error';
}

/**
 * Get human-readable error message
 */
export function getAuthErrorMessage(code: AuthErrorCode): string {
  const messages: Record<AuthErrorCode, string> = {
    invalid_credentials: 'Invalid email or password',
    email_not_confirmed: 'Please check your email to confirm your account',
    user_not_found: 'No account found with this email',
    email_taken: 'An account with this email already exists',
    weak_password: 'Password must be at least 6 characters',
    invalid_email: 'Please enter a valid email address',
    rate_limited: 'Too many attempts. Please try again later',
    network_error: 'Network error. Please check your connection',
    session_expired: 'Your session has expired. Please sign in again',
    unknown_error: 'An unexpected error occurred',
  };

  return messages[code];
}

/**
 * Protected route configuration
 */
export interface ProtectedRouteConfig {
  /** Route pattern (supports wildcards) */
  pattern: string;
  /** Whether authentication is required */
  requireAuth: boolean;
  /** Redirect URL if not authenticated */
  redirectTo?: string;
}

/**
 * Default protected routes
 */
export const DEFAULT_PROTECTED_ROUTES: ProtectedRouteConfig[] = [
  { pattern: '/rooms', requireAuth: true, redirectTo: '/auth/signin' },
  { pattern: '/rooms/*', requireAuth: true, redirectTo: '/auth/signin' },
  { pattern: '/profile', requireAuth: true, redirectTo: '/auth/signin' },
  { pattern: '/settings', requireAuth: true, redirectTo: '/auth/signin' },
];

/**
 * Public routes that don't require auth
 */
export const PUBLIC_ROUTES = [
  '/',
  '/auth/signin',
  '/auth/signup',
  '/auth/reset-password',
  '/auth/callback',
  '/api/health',
];

/**
 * Check if a path matches a pattern
 */
export function matchesPattern(path: string, pattern: string): boolean {
  if (pattern.endsWith('/*')) {
    const base = pattern.slice(0, -2);
    return path === base || path.startsWith(base + '/');
  }
  return path === pattern;
}

/**
 * Check if a path requires authentication
 */
export function requiresAuth(path: string, routes: ProtectedRouteConfig[] = DEFAULT_PROTECTED_ROUTES): boolean {
  // Check if it's a public route first
  if (PUBLIC_ROUTES.some(route => matchesPattern(path, route))) {
    return false;
  }

  // Check protected routes
  for (const route of routes) {
    if (matchesPattern(path, route.pattern)) {
      return route.requireAuth;
    }
  }

  return false;
}

/**
 * Get redirect URL for unauthenticated access
 */
export function getAuthRedirect(path: string, routes: ProtectedRouteConfig[] = DEFAULT_PROTECTED_ROUTES): string {
  for (const route of routes) {
    if (matchesPattern(path, route.pattern) && route.requireAuth) {
      return route.redirectTo || '/auth/signin';
    }
  }
  return '/auth/signin';
}
