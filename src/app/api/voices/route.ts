/**
 * Voice AI Voices API
 *
 * Returns available voices for the currently configured voice AI provider.
 * Includes voice metadata for display and selection in the UI.
 *
 * Part of the Long-Horizon Engineering Protocol - FEAT-1007
 */

import { NextResponse } from "next/server";
import {
  getVoicesForProvider,
  type VoiceInfo,
  type VoiceAIProviderType,
} from "@/types/voice-ai-provider";
import {
  getConfiguredProviderType,
  getProviderDisplayName,
} from "@/server/ai-providers/voice-ai-factory";

/**
 * Response type for the voices API
 */
export interface VoicesResponse {
  /** Current voice AI provider */
  provider: VoiceAIProviderType;
  /** Human-readable provider name */
  providerName: string;
  /** Available voices for this provider */
  voices: VoiceInfo[];
  /** Default voice ID */
  defaultVoice: string;
}

/**
 * GET /api/voices
 *
 * Returns available voices for the current voice AI provider.
 * The provider is determined by the VOICE_AI_PROVIDER environment variable.
 *
 * @returns VoicesResponse with provider info and available voices
 */
export async function GET() {
  try {
    const provider = getConfiguredProviderType();
    const voices = getVoicesForProvider(provider);
    const providerName = getProviderDisplayName(provider);

    // Default voice is the first one in the list
    const defaultVoice =
      voices[0]?.id || (provider === "openai" ? "marin" : "ara");

    const response: VoicesResponse = {
      provider,
      providerName,
      voices,
      defaultVoice,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("[API /voices] Error:", error);
    return NextResponse.json(
      { error: "Failed to get available voices" },
      { status: 500 },
    );
  }
}
