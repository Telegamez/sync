import { NextResponse } from 'next/server';

/**
 * Disable caching - tokens are single-use and must be fresh
 */
export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * OpenAI Realtime API session endpoint
 */
const OPENAI_SESSION_URL = 'https://api.openai.com/v1/realtime/sessions';
const OPENAI_MODEL = 'gpt-4o-realtime-preview';

/**
 * GET /api/swensync-realtime-token
 *
 * Fetches an ephemeral token from OpenAI for WebRTC connection.
 * The token is short-lived and can only be used once.
 */
export async function GET() {
  try {
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      console.error('[Swensync API] OPENAI_API_KEY not configured');
      return NextResponse.json(
        { error: 'OpenAI API key not configured' },
        { status: 500 }
      );
    }

    console.log('[Swensync API] Fetching ephemeral token from OpenAI...');

    const response = await fetch(OPENAI_SESSION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'OpenAI-Beta': 'realtime=v1',
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        voice: 'alloy',
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        '[Swensync API] OpenAI error:',
        response.status,
        errorText
      );
      return NextResponse.json(
        {
          error: `OpenAI API error: ${response.status}`,
          details: errorText,
        },
        { status: response.status }
      );
    }

    const data = await response.json();

    if (!data.client_secret?.value) {
      console.error('[Swensync API] Invalid response from OpenAI:', data);
      return NextResponse.json(
        { error: 'Invalid token response from OpenAI' },
        { status: 500 }
      );
    }

    console.log('[Swensync API] Token acquired successfully');

    // Return the token data
    return NextResponse.json({
      client_secret: data.client_secret,
      expires_at: data.expires_at,
    });
  } catch (error) {
    console.error('[Swensync API] Error fetching token:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch realtime token',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
