/**
 * OAuth Callback Page
 *
 * Handles OAuth callback from providers (Google, GitHub).
 * Exchanges the auth code for a session and redirects to the target page.
 *
 * Part of the Long-Horizon Engineering Protocol - FEAT-400
 */

"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, CheckCircle, XCircle } from "lucide-react";
import { getSupabaseConfig, AUTH_STORAGE_KEY } from "@/lib/supabase";

/**
 * OAuth Callback Handler Component
 */
function CallbackHandler() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<"loading" | "success" | "error">(
    "loading",
  );
  const [error, setError] = useState<string | null>(null);

  const returnUrl = searchParams.get("returnUrl") || "/rooms";

  useEffect(() => {
    const handleCallback = async () => {
      try {
        const config = getSupabaseConfig();

        // Get the hash fragment (Supabase uses implicit grant flow)
        const hash = window.location.hash;

        if (hash) {
          // Parse the hash to get access token
          const params = new URLSearchParams(hash.substring(1));
          const accessToken = params.get("access_token");
          const refreshToken = params.get("refresh_token");
          const expiresIn = params.get("expires_in");

          if (accessToken) {
            // Get user info from Supabase
            const userResponse = await fetch(`${config.url}/auth/v1/user`, {
              headers: {
                apikey: config.anonKey,
                Authorization: `Bearer ${accessToken}`,
              },
            });

            if (!userResponse.ok) {
              throw new Error("Failed to get user info");
            }

            const userData = await userResponse.json();

            // Create session
            const expiresAt = new Date(
              Date.now() + parseInt(expiresIn || "3600") * 1000,
            );
            const session = {
              accessToken,
              refreshToken,
              expiresAt: expiresAt.toISOString(),
              user: {
                id: userData.id,
                email: userData.email,
                displayName:
                  userData.user_metadata?.display_name ||
                  userData.user_metadata?.full_name ||
                  userData.email?.split("@")[0],
                avatarUrl: userData.user_metadata?.avatar_url,
                createdAt: userData.created_at,
                lastSignInAt: userData.last_sign_in_at,
              },
            };

            // Store in localStorage
            localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));

            // Store in cookie for middleware (domain=.chnl.net for subdomain support)
            const cookieDomain =
              window.location.hostname.endsWith(".chnl.net") ||
              window.location.hostname === "chnl.net"
                ? "; domain=.chnl.net"
                : "";
            document.cookie = `${AUTH_STORAGE_KEY}=${encodeURIComponent(JSON.stringify(session))}; path=/; expires=${expiresAt.toUTCString()}; SameSite=Lax${cookieDomain}`;

            setStatus("success");

            // Redirect after a short delay
            setTimeout(() => {
              router.push(returnUrl);
            }, 1000);

            return;
          }
        }

        // Check for error in URL params
        const errorParam = searchParams.get("error");
        const errorDescription = searchParams.get("error_description");

        if (errorParam) {
          throw new Error(errorDescription || errorParam);
        }

        // Check for code flow (authorization code)
        const code = searchParams.get("code");

        if (code) {
          // Exchange code for session
          const tokenResponse = await fetch(
            `${config.url}/auth/v1/token?grant_type=authorization_code`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                apikey: config.anonKey,
              },
              body: JSON.stringify({ code }),
            },
          );

          if (!tokenResponse.ok) {
            const errorData = await tokenResponse.json();
            throw new Error(
              errorData.error_description ||
                errorData.msg ||
                "Failed to exchange code",
            );
          }

          const tokenData = await tokenResponse.json();

          // Create session
          const expiresAt = tokenData.expires_at
            ? new Date(tokenData.expires_at * 1000)
            : new Date(Date.now() + (tokenData.expires_in || 3600) * 1000);

          const session = {
            accessToken: tokenData.access_token,
            refreshToken: tokenData.refresh_token,
            expiresAt: expiresAt.toISOString(),
            user: {
              id: tokenData.user.id,
              email: tokenData.user.email,
              displayName:
                tokenData.user.user_metadata?.display_name ||
                tokenData.user.user_metadata?.full_name ||
                tokenData.user.email?.split("@")[0],
              avatarUrl: tokenData.user.user_metadata?.avatar_url,
              createdAt: tokenData.user.created_at,
              lastSignInAt: tokenData.user.last_sign_in_at,
            },
          };

          // Store in localStorage
          localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));

          // Store in cookie for middleware (domain=.chnl.net for subdomain support)
          const cookieDomain =
            window.location.hostname.endsWith(".chnl.net") ||
            window.location.hostname === "chnl.net"
              ? "; domain=.chnl.net"
              : "";
          document.cookie = `${AUTH_STORAGE_KEY}=${encodeURIComponent(JSON.stringify(session))}; path=/; expires=${expiresAt.toUTCString()}; SameSite=Lax${cookieDomain}`;

          setStatus("success");

          setTimeout(() => {
            router.push(returnUrl);
          }, 1000);

          return;
        }

        // No valid auth response
        throw new Error("No authentication response received");
      } catch (err) {
        console.error("OAuth callback error:", err);
        setStatus("error");
        setError(err instanceof Error ? err.message : "Authentication failed");
      }
    };

    handleCallback();
  }, [router, returnUrl, searchParams]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md text-center">
        {status === "loading" && (
          <div className="space-y-4">
            <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto" />
            <h1 className="text-xl font-semibold text-foreground">
              Completing sign in...
            </h1>
            <p className="text-muted-foreground">
              Please wait while we verify your account
            </p>
          </div>
        )}

        {status === "success" && (
          <div className="space-y-4">
            <CheckCircle className="w-12 h-12 text-green-500 mx-auto" />
            <h1 className="text-xl font-semibold text-foreground">
              Sign in successful!
            </h1>
            <p className="text-muted-foreground">
              Redirecting you to the app...
            </p>
          </div>
        )}

        {status === "error" && (
          <div className="space-y-4">
            <XCircle className="w-12 h-12 text-destructive mx-auto" />
            <h1 className="text-xl font-semibold text-foreground">
              Sign in failed
            </h1>
            <p className="text-muted-foreground">
              {error || "An unexpected error occurred"}
            </p>
            <div className="pt-4 space-x-4">
              <button
                onClick={() => router.push("/auth/signin")}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
              >
                Try again
              </button>
              <button
                onClick={() => router.push("/")}
                className="px-4 py-2 bg-muted text-muted-foreground rounded-lg hover:bg-muted/80 transition-colors"
              >
                Go home
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * OAuth Callback Page with Suspense boundary
 */
export default function CallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-background">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      }
    >
      <CallbackHandler />
    </Suspense>
  );
}
