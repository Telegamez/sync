/**
 * Next.js Middleware for Route Protection
 *
 * Protects routes that require authentication.
 *
 * Part of the Long-Horizon Engineering Protocol - FEAT-400
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  requiresAuth,
  getAuthRedirect,
  PUBLIC_ROUTES,
  matchesPattern,
} from "@/types/auth";

/**
 * Auth storage key (must match client)
 */
const AUTH_STORAGE_KEY = "swensync-auth";

/**
 * Check if request has valid auth cookie/header
 */
function hasValidAuth(request: NextRequest): boolean {
  // Check for auth cookie
  const authCookie = request.cookies.get(AUTH_STORAGE_KEY);
  if (authCookie?.value) {
    try {
      const session = JSON.parse(authCookie.value);
      if (session.accessToken && session.expiresAt) {
        // Check if session is not expired
        const expiresAt = new Date(session.expiresAt);
        if (expiresAt > new Date()) {
          return true;
        }
      }
    } catch {
      // Invalid cookie format
    }
  }

  // Check for Authorization header (for API routes)
  const authHeader = request.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return true; // Token validation happens at API level
  }

  return false;
}

/**
 * Check if request is from a room subdomain (e.g., abc123.chnl.net)
 * These requests get internally rewritten by nginx to /rooms/{subdomain}
 */
function isRoomSubdomainRequest(request: NextRequest): boolean {
  const host =
    request.headers.get("x-original-host") || request.headers.get("host") || "";
  // Match pattern like "abc123.chnl.net" but not "www.chnl.net"
  const subdomainMatch = host.match(/^([a-z0-9]+)\.chnl\.net$/i);
  if (subdomainMatch && subdomainMatch[1] !== "www") {
    return true;
  }
  return false;
}

/**
 * Middleware function
 */
export function middleware(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;

  // Skip middleware for static files and Next.js internals
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/static") ||
    pathname.includes(".") // Files with extensions (images, etc.)
  ) {
    return NextResponse.next();
  }

  // Skip API routes (they handle their own auth)
  if (pathname.startsWith("/api")) {
    return NextResponse.next();
  }

  // Skip auth for room subdomain requests (e.g., abc123.chnl.net)
  // These are publicly accessible room links
  if (isRoomSubdomainRequest(request)) {
    return NextResponse.next();
  }

  // Check if route requires authentication
  if (requiresAuth(pathname)) {
    const isAuthenticated = hasValidAuth(request);

    if (!isAuthenticated) {
      // Redirect to sign-in page with return URL
      const redirectUrl = getAuthRedirect(pathname);
      const url = request.nextUrl.clone();
      url.pathname = redirectUrl;
      url.searchParams.set("returnUrl", pathname);

      return NextResponse.redirect(url);
    }
  }

  // If authenticated and trying to access auth pages, redirect to rooms
  if (hasValidAuth(request)) {
    const authPages = ["/auth/signin", "/auth/signup"];
    if (authPages.some((page) => pathname === page)) {
      const url = request.nextUrl.clone();
      url.pathname = "/rooms";
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

/**
 * Matcher configuration
 * Define which routes the middleware should run on
 */
export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    "/((?!_next/static|_next/image|favicon.ico|public).*)",
  ],
};
