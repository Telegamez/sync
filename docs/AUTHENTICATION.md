# Authentication System (FEAT-404)

This document describes the authentication system implemented for Sync, enabling user sign-in, registration, and OAuth integration with Supabase.

## Overview

Sync uses Supabase for authentication, supporting:

- Email/password authentication
- OAuth providers (Google, GitHub)
- Session management with automatic refresh
- Route protection via Next.js middleware

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Auth Pages    │────▶│  AuthContext     │────▶│  Supabase API   │
│  (signin/up)    │     │  (React Context) │     │  (GoTrue)       │
└─────────────────┘     └──────────────────┘     └─────────────────┘
         │                       │
         ▼                       ▼
┌─────────────────┐     ┌──────────────────┐
│   Middleware    │     │  localStorage    │
│  (route guard)  │     │  + cookies       │
└─────────────────┘     └──────────────────┘
```

## Files Created

| File                                         | Description                                           |
| -------------------------------------------- | ----------------------------------------------------- |
| `src/app/auth/signin/page.tsx`               | Sign-in page with email/password and OAuth            |
| `src/app/auth/signup/page.tsx`               | Registration page with form validation                |
| `src/app/auth/callback/page.tsx`             | OAuth callback handler for provider redirects         |
| `src/app/providers.tsx`                      | Client-side providers wrapper with AuthProvider       |
| `supabase/migrations/001_initial_schema.sql` | Database schema for rooms, participants, room_history |

## Files Modified

| File                 | Change                                                  |
| -------------------- | ------------------------------------------------------- |
| `src/app/layout.tsx` | Added Providers wrapper to enable auth context app-wide |

## Authentication Flow

### Email/Password Sign-In

1. User visits `/rooms` (protected route)
2. Middleware redirects unauthenticated users to `/auth/signin?returnUrl=/rooms`
3. User enters email and password
4. `AuthContext.signIn()` calls Supabase API
5. On success, session is stored in localStorage and cookie
6. User is redirected to original destination (`/rooms`)

### OAuth Sign-In (Google/GitHub)

1. User clicks "Continue with Google" or "Continue with GitHub"
2. `AuthContext.signInWithOAuth()` generates Supabase OAuth URL
3. Browser redirects to OAuth provider
4. After authorization, provider redirects to `/auth/callback`
5. Callback page exchanges tokens and creates session
6. User is redirected to original destination

### Sign-Up

1. User visits `/auth/signup`
2. Fills out registration form (name, email, password)
3. `AuthContext.signUp()` creates account via Supabase
4. Depending on Supabase settings:
   - Direct sign-in (if email confirmation disabled)
   - Email confirmation required (user sees confirmation message)

## Session Management

Sessions are stored in two locations for different purposes:

| Storage              | Purpose                                         |
| -------------------- | ----------------------------------------------- |
| `localStorage`       | Client-side session access for React components |
| Cookie (`sync-auth`) | Server-side middleware authentication checks    |

### Session Structure

```typescript
interface Session {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  user: {
    id: string;
    email: string;
    displayName: string;
    avatarUrl?: string;
    createdAt: Date;
    lastSignInAt?: Date;
  };
}
```

### Auto-Refresh

The `AuthProvider` automatically refreshes sessions before expiry:

- Default refresh buffer: 60 seconds before expiration
- Configurable via `refreshBuffer` prop

## Route Protection

### Middleware Configuration

Protected routes are defined in `src/types/auth.ts`:

```typescript
const PROTECTED_ROUTES = ["/rooms", "/rooms/*", "/settings"];
const PUBLIC_ROUTES = ["/", "/auth/*", "/api/*"];
```

### Middleware Logic (`src/middleware.ts`)

1. Check if route requires authentication
2. Parse `sync-auth` cookie
3. Validate session expiration
4. Redirect to `/auth/signin` if unauthenticated
5. Redirect authenticated users away from auth pages

## Supabase Configuration

### Environment Variables

```bash
# .env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key  # Server-side only
```

### Database Schema

Run the migration in Supabase SQL Editor:

```sql
-- See: supabase/migrations/001_initial_schema.sql
```

Creates tables:

- `rooms` - Room configuration and metadata
- `participants` - Room membership tracking
- `room_history` - Event logging for analytics

### OAuth Provider Setup

To enable Google/GitHub sign-in:

1. Go to Supabase Dashboard > Authentication > Providers
2. Enable desired provider
3. Configure OAuth credentials:

**Google:**

- Create OAuth app at https://console.cloud.google.com/
- Add authorized redirect URI: `https://your-project.supabase.co/auth/v1/callback`

**GitHub:**

- Create OAuth app at https://github.com/settings/developers
- Add callback URL: `https://your-project.supabase.co/auth/v1/callback`

### Auth URL Configuration

In Supabase Dashboard > Authentication > URL Configuration:

| Setting       | Value                                   |
| ------------- | --------------------------------------- |
| Site URL      | `https://your-domain.com`               |
| Redirect URLs | `https://your-domain.com/auth/callback` |

## Components

### AuthProvider

Wraps the application to provide auth context:

```tsx
// src/app/providers.tsx
"use client";

import { AuthProvider } from "@/contexts/AuthContext";

export function Providers({ children }: { children: React.ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}
```

### useAuth Hook

Access auth state and methods in components:

```tsx
import { useAuth } from "@/contexts/AuthContext";

function MyComponent() {
  const { user, state, signIn, signOut } = useAuth();

  if (state === "loading") return <Spinner />;
  if (state === "unauthenticated") return <SignInPrompt />;

  return <div>Hello, {user.displayName}</div>;
}
```

### Available Auth Methods

| Method                         | Description                     |
| ------------------------------ | ------------------------------- |
| `signUp(request)`              | Register with email/password    |
| `signIn(request)`              | Sign in with email/password     |
| `signInWithOAuth(request)`     | Initiate OAuth flow             |
| `signInWithMagicLink(request)` | Send magic link email           |
| `signOut()`                    | Sign out and clear session      |
| `resetPassword(request)`       | Send password reset email       |
| `updatePassword(request)`      | Update password (authenticated) |
| `updateProfile(updates)`       | Update display name/avatar      |
| `refreshSession()`             | Manually refresh session        |

## Error Handling

Auth errors are mapped to user-friendly messages:

| Error Code            | Message                                   |
| --------------------- | ----------------------------------------- |
| `invalid_credentials` | Invalid email or password                 |
| `email_taken`         | An account with this email already exists |
| `weak_password`       | Password should be at least 6 characters  |
| `invalid_email`       | Please enter a valid email address        |
| `rate_limit`          | Too many attempts. Please try again later |

## Security Considerations

1. **Never expose `SUPABASE_SERVICE_ROLE_KEY`** on the client
2. **Use HTTPS** in production for secure cookie transmission
3. **Enable RLS** on all Supabase tables (already configured in migration)
4. **Validate tokens** on API routes using the service role key
5. **Set secure cookie options** (HttpOnly, Secure, SameSite)

## Testing

For development without Supabase:

- The auth client includes mock implementations
- Mock mode activates when `NEXT_PUBLIC_SUPABASE_URL` is not set
- Any valid-looking email/password works in mock mode

## Troubleshooting

### "useAuth must be used within AuthProvider"

- Ensure `Providers` wrapper is in `src/app/layout.tsx`

### OAuth callback fails

- Check redirect URLs in Supabase dashboard
- Verify OAuth provider credentials
- Check browser console for specific errors

### Session not persisting

- Check cookie settings (SameSite, Secure)
- Verify localStorage is accessible
- Check for cookie blockers

### 404 on /auth/signin

- Rebuild the application: `npm run build`
- Restart the server with updated build
