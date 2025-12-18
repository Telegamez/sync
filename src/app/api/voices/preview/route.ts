/**
 * Voice Preview API
 *
 * Generates voice preview audio using provider-specific Realtime APIs.
 * - OpenAI: Uses the Realtime API via WebSocket
 * - XAI: Uses the Voice Agent API via WebSocket
 *
 * Both providers use the same WebSocket approach to ensure users hear
 * the actual voice they'll be using in conversations.
 *
 * Part of the Long-Horizon Engineering Protocol - FEAT-1007
 */

import { NextRequest, NextResponse } from "next/server";
import WebSocket from "ws";
import { OPENAI_VOICES, XAI_VOICES } from "@/types/voice-ai-provider";
import { getConfiguredProviderType } from "@/server/ai-providers/voice-ai-factory";

// Cache for generated previews (in-memory, cleared on server restart)
// Cache key includes provider to handle provider switches
const previewCache = new Map<
  string,
  { audio: ArrayBuffer; timestamp: number }
>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// Preview text samples for each voice - keeps it natural and conversational
const PREVIEW_TEXTS: Record<string, string> = {
  // OpenAI voices
  marin:
    "Hey there! I'm Marin, and I'm here to help make your conversations more engaging and fun.",
  alloy:
    "Hello, I'm Alloy. I have a balanced, neutral tone that works well in any situation.",
  echo: "Hi, I'm Echo. I specialize in clear, professional communication and detailed explanations.",
  shimmer:
    "Hi! I'm Shimmer. I bring energy and expressiveness to every conversation!",
  ash: "Hello. I'm Ash. I speak with a calm, measured pace that helps with thoughtful discussions.",
  ballad:
    "Hello, I'm Ballad. My soft, melodic voice creates a relaxing atmosphere.",
  coral:
    "Hey! I'm Coral, and I love bringing enthusiasm and energy to our chats!",
  sage: "Greetings, I'm Sage. I'm here for thoughtful brainstorming and contemplative discussions.",
  verse:
    "Good day, I'm Verse. I speak with refined elegance and clear articulation.",
  // XAI voices
  ara: "Hello, I'm Ara. I bring confidence and professionalism to every conversation.",
  eve: "Hi there! I'm Eve, your friendly and approachable conversation partner.",
  leo: "Hello, I'm Leo. I deliver authoritative and knowledgeable guidance.",
  sal: "Hey! I'm Sal. I bring creativity and expressiveness to our discussions!",
  rex: "Hello, I'm Rex. I speak with bold energy and commanding presence.",
  mika: "Hi, I'm Mika. I'm here to offer gentle, supportive guidance.",
  valentin:
    "Good evening, I'm Valentin. I speak with sophistication and charm.",
};

// OpenAI Realtime API configuration
const OPENAI_REALTIME_URL = "wss://api.openai.com/v1/realtime";
const OPENAI_REALTIME_MODEL = "gpt-4o-realtime-preview-2024-12-17";

// XAI Realtime API configuration
const XAI_REALTIME_URL = "wss://api.x.ai/v1/realtime";
const XAI_REALTIME_CLIENT_SECRETS_URL =
  "https://api.x.ai/v1/realtime/client_secrets";

const createXaiRealtimeClientSecret = async (): Promise<string> => {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) {
    throw new Error("XAI API key not configured");
  }

  const response = await fetch(XAI_REALTIME_CLIENT_SECRETS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      expires_after: { seconds: 300 },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Failed to create XAI realtime client secret: ${response.status} ${errorText}`,
    );
  }

  const data = (await response.json()) as Record<string, unknown>;
  const clientSecretCandidate = data.client_secret;

  const clientSecret =
    (typeof clientSecretCandidate === "string"
      ? clientSecretCandidate
      : typeof clientSecretCandidate === "object" &&
          clientSecretCandidate !== null &&
          "value" in clientSecretCandidate &&
          typeof (clientSecretCandidate as { value?: unknown }).value ===
            "string"
        ? (clientSecretCandidate as { value: string }).value
        : null) ||
    (typeof data.value === "string" ? data.value : null) ||
    (typeof data.token === "string" ? data.token : null) ||
    (typeof data.secret === "string" ? data.secret : null) ||
    (typeof data.access_token === "string" ? data.access_token : null);

  if (!clientSecret) {
    throw new Error(
      `XAI realtime client secret response did not include a usable token`,
    );
  }

  return clientSecret;
};

/**
 * Generate preview using OpenAI Realtime API via WebSocket
 * Connects, sends text to be spoken, captures audio response
 */
async function generateOpenAIPreview(
  voiceId: string,
  text: string,
): Promise<ArrayBuffer> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OpenAI API key not configured");
  }

  console.log(
    `[Voice Preview] Generating OpenAI Realtime preview for ${voiceId}`,
  );

  return new Promise((resolve, reject) => {
    const audioChunks: Buffer[] = [];
    let sessionConfigured = false;
    let responseStarted = false;
    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error("OpenAI preview generation timed out"));
    }, 30000); // 30 second timeout

    // OpenAI Realtime API requires model in URL query param
    const wsUrl = `${OPENAI_REALTIME_URL}?model=${OPENAI_REALTIME_MODEL}`;

    const ws = new WebSocket(wsUrl, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "OpenAI-Beta": "realtime=v1",
      },
    });

    ws.on("open", () => {
      console.log(`[Voice Preview] OpenAI WebSocket connected for ${voiceId}`);

      // Configure session with the selected voice
      const sessionUpdate = {
        type: "session.update",
        session: {
          modalities: ["text", "audio"],
          voice: voiceId,
          instructions: `You are a voice assistant. When asked to speak, say exactly what is requested without any additional commentary. Speak naturally and expressively.`,
          input_audio_format: "pcm16",
          output_audio_format: "pcm16",
          input_audio_transcription: null,
          turn_detection: null, // Manual mode - we control when to respond
        },
      };

      ws.send(JSON.stringify(sessionUpdate));
    });

    ws.on("message", (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());

        switch (message.type) {
          case "session.created":
          case "session.updated":
            if (!sessionConfigured) {
              sessionConfigured = true;
              console.log(
                `[Voice Preview] OpenAI session configured for ${voiceId}`,
              );

              // Send the text to speak as a conversation item
              const conversationItem = {
                type: "conversation.item.create",
                item: {
                  type: "message",
                  role: "user",
                  content: [
                    {
                      type: "input_text",
                      text: `Please say exactly this: "${text}"`,
                    },
                  ],
                },
              };
              ws.send(JSON.stringify(conversationItem));

              // Trigger the response - must include both audio and text modalities
              const responseCreate = {
                type: "response.create",
                response: {
                  modalities: ["audio", "text"],
                },
              };
              ws.send(JSON.stringify(responseCreate));
            }
            break;

          case "response.audio.delta":
            // Collect audio chunks
            if (message.delta) {
              responseStarted = true;
              const audioData = Buffer.from(message.delta, "base64");
              audioChunks.push(audioData);
            }
            break;

          case "response.audio.done":
          case "response.done":
            if (responseStarted && audioChunks.length > 0) {
              clearTimeout(timeout);
              ws.close();

              // Combine all PCM16 chunks
              const pcmBuffer = Buffer.concat(audioChunks);
              console.log(
                `[Voice Preview] OpenAI preview complete for ${voiceId}: ${pcmBuffer.length} bytes PCM16`,
              );

              // Convert PCM16 to WAV format for browser playback
              const wavBuffer = pcm16ToWav(pcmBuffer, 24000);
              // Create a new ArrayBuffer copy from the Buffer
              const arrayBuffer = new ArrayBuffer(wavBuffer.length);
              const view = new Uint8Array(arrayBuffer);
              for (let i = 0; i < wavBuffer.length; i++) {
                view[i] = wavBuffer[i];
              }
              resolve(arrayBuffer);
            }
            break;

          case "error":
            console.error(
              `[Voice Preview] OpenAI error for ${voiceId}:`,
              message.error,
            );
            clearTimeout(timeout);
            ws.close();
            reject(
              new Error(
                message.error?.message || "OpenAI voice generation failed",
              ),
            );
            break;
        }
      } catch (err) {
        console.error(`[Voice Preview] Error parsing OpenAI message:`, err);
      }
    });

    ws.on("error", (error) => {
      console.error(
        `[Voice Preview] OpenAI WebSocket error for ${voiceId}:`,
        error,
      );
      clearTimeout(timeout);
      reject(error);
    });

    ws.on("close", (code) => {
      clearTimeout(timeout);
      if (!responseStarted || audioChunks.length === 0) {
        reject(
          new Error(
            `OpenAI WebSocket closed with code ${code} before audio received`,
          ),
        );
      }
    });
  });
}

/**
 * Generate preview using XAI Voice Agent API via WebSocket
 * Connects, sends text to be spoken, captures audio response
 */
async function generateXAIPreview(
  voiceId: string,
  text: string,
): Promise<ArrayBuffer> {
  const clientSecret = await createXaiRealtimeClientSecret();

  console.log(`[Voice Preview] Generating XAI preview for ${voiceId}`);

  return new Promise((resolve, reject) => {
    const audioChunks: Buffer[] = [];
    let sessionConfigSent = false;
    let sessionConfigured = false;
    let responseStarted = false;
    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error("XAI preview generation timed out"));
    }, 30000); // 30 second timeout

    const ws = new WebSocket(XAI_REALTIME_URL, {
      headers: {
        Authorization: `Bearer ${clientSecret}`,
        "Content-Type": "application/json",
      },
    });

    ws.on("unexpected-response", (_, response) => {
      const statusCode = response.statusCode || 0;
      const chunks: Buffer[] = [];

      response.on("data", (chunk) => {
        if (chunks.reduce((sum, b) => sum + b.length, 0) < 4096) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
      });

      response.on("end", () => {
        const body = Buffer.concat(chunks).toString("utf8").slice(0, 4096);
        console.error(
          `[Voice Preview] XAI WebSocket unexpected response: ${statusCode} ${body}`,
        );
        clearTimeout(timeout);
        reject(
          new Error(
            `XAI WebSocket unexpected response: ${statusCode}${body ? ` ${body}` : ""}`,
          ),
        );
      });
    });

    ws.on("open", () => {
      console.log(`[Voice Preview] XAI WebSocket connected for ${voiceId}`);
    });

    ws.on("message", (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());

        switch (message.type) {
          case "conversation.created":
          case "session.created":
            if (!sessionConfigSent) {
              sessionConfigSent = true;

              // Configure session with the selected voice (cookbook-compatible shape)
              const sessionUpdate = {
                type: "session.update",
                session: {
                  instructions: `You are a voice assistant. When asked to speak, say exactly what is requested without any additional commentary. Speak naturally and expressively.`,
                  voice: voiceId,
                  audio: {
                    input: {
                      format: {
                        type: "audio/pcm",
                        rate: 24000,
                      },
                    },
                    output: {
                      format: {
                        type: "audio/pcm",
                        rate: 24000,
                      },
                    },
                  },
                  turn_detection: null,
                },
              };

              ws.send(JSON.stringify(sessionUpdate));
            }
            break;

          case "session.created":
          case "session.updated":
            if (!sessionConfigured) {
              sessionConfigured = true;
              console.log(
                `[Voice Preview] XAI session configured for ${voiceId}`,
              );

              // Send the text to speak as a conversation item
              const conversationItem = {
                type: "conversation.item.create",
                item: {
                  type: "message",
                  role: "user",
                  content: [
                    {
                      type: "input_text",
                      text: `Please say exactly this: "${text}"`,
                    },
                  ],
                },
              };
              ws.send(JSON.stringify(conversationItem));

              // Trigger the response - must include both audio and text modalities
              const responseCreate = { type: "response.create" };
              ws.send(JSON.stringify(responseCreate));
            }
            break;

          case "response.audio.delta":
          case "response.output_audio.delta":
            // Collect audio chunks
            if (message.delta) {
              responseStarted = true;
              const audioData = Buffer.from(message.delta, "base64");
              audioChunks.push(audioData);
            }
            break;

          case "response.audio.done":
          case "response.output_audio.done":
          case "response.done":
            if (responseStarted && audioChunks.length > 0) {
              clearTimeout(timeout);
              ws.close();

              // Combine all PCM16 chunks
              const pcmBuffer = Buffer.concat(audioChunks);
              console.log(
                `[Voice Preview] XAI preview complete for ${voiceId}: ${pcmBuffer.length} bytes PCM16`,
              );

              // Convert PCM16 to WAV format for browser playback
              const wavBuffer = pcm16ToWav(pcmBuffer, 24000);
              // Create a new ArrayBuffer copy from the Buffer
              const arrayBuffer = new ArrayBuffer(wavBuffer.length);
              const view = new Uint8Array(arrayBuffer);
              for (let i = 0; i < wavBuffer.length; i++) {
                view[i] = wavBuffer[i];
              }
              resolve(arrayBuffer);
            }
            break;

          case "error":
            console.error(
              `[Voice Preview] XAI error for ${voiceId}:`,
              message.error,
            );
            clearTimeout(timeout);
            ws.close();
            reject(
              new Error(
                message.error?.message || "XAI voice generation failed",
              ),
            );
            break;
        }
      } catch (err) {
        console.error(`[Voice Preview] Error parsing XAI message:`, err);
      }
    });

    ws.on("error", (error) => {
      console.error(
        `[Voice Preview] XAI WebSocket error for ${voiceId}:`,
        error,
      );
      clearTimeout(timeout);
      reject(error);
    });

    ws.on("close", (code) => {
      clearTimeout(timeout);
      if (!responseStarted || audioChunks.length === 0) {
        reject(
          new Error(
            `XAI WebSocket closed with code ${code} before audio received`,
          ),
        );
      }
    });
  });
}

/**
 * Convert raw PCM16 audio to WAV format
 */
function pcm16ToWav(pcmData: Buffer, sampleRate: number): Buffer {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataSize = pcmData.length;
  const headerSize = 44;
  const fileSize = headerSize + dataSize - 8;

  const wavBuffer = Buffer.alloc(headerSize + dataSize);

  // RIFF header
  wavBuffer.write("RIFF", 0);
  wavBuffer.writeUInt32LE(fileSize, 4);
  wavBuffer.write("WAVE", 8);

  // fmt chunk
  wavBuffer.write("fmt ", 12);
  wavBuffer.writeUInt32LE(16, 16); // fmt chunk size
  wavBuffer.writeUInt16LE(1, 20); // audio format (PCM)
  wavBuffer.writeUInt16LE(numChannels, 22);
  wavBuffer.writeUInt32LE(sampleRate, 24);
  wavBuffer.writeUInt32LE(byteRate, 28);
  wavBuffer.writeUInt16LE(blockAlign, 32);
  wavBuffer.writeUInt16LE(bitsPerSample, 34);

  // data chunk
  wavBuffer.write("data", 36);
  wavBuffer.writeUInt32LE(dataSize, 40);
  pcmData.copy(wavBuffer, 44);

  return wavBuffer;
}

/**
 * GET /api/voices/preview?voice=<voice_id>
 *
 * Generates and returns an audio preview for the specified voice.
 * Uses the appropriate provider's Realtime API via WebSocket.
 *
 * @param voice - Voice ID to preview (e.g., "marin", "echo", "ara")
 * @returns Audio stream (WAV format) or error
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const voiceId = searchParams.get("voice");

    if (!voiceId) {
      return NextResponse.json(
        { error: "Missing voice parameter" },
        { status: 400 },
      );
    }

    // Validate voice ID
    const provider = getConfiguredProviderType();
    const validVoices = provider === "openai" ? OPENAI_VOICES : XAI_VOICES;
    const isValidVoice = validVoices.some((v) => v.id === voiceId);

    if (!isValidVoice) {
      return NextResponse.json(
        { error: `Invalid voice: ${voiceId}` },
        { status: 400 },
      );
    }

    // Cache key includes provider to handle provider switches
    const cacheKey = `${provider}:${voiceId}`;

    // Check cache
    const cached = previewCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      console.log(`[Voice Preview] Cache hit for ${cacheKey}`);
      return new NextResponse(cached.audio, {
        headers: {
          "Content-Type": "audio/wav",
          "Cache-Control": "public, max-age=86400",
        },
      });
    }

    // Get preview text
    const previewText =
      PREVIEW_TEXTS[voiceId] || `Hello, I'm ${voiceId}. Nice to meet you!`;

    // Generate audio using the appropriate provider's Realtime API
    let audioBuffer: ArrayBuffer;

    if (provider === "openai") {
      audioBuffer = await generateOpenAIPreview(voiceId, previewText);
    } else {
      // XAI provider
      audioBuffer = await generateXAIPreview(voiceId, previewText);
    }

    // Cache the result
    previewCache.set(cacheKey, {
      audio: audioBuffer,
      timestamp: Date.now(),
    });

    console.log(
      `[Voice Preview] Generated and cached preview for ${cacheKey} (${audioBuffer.byteLength} bytes)`,
    );

    return new NextResponse(audioBuffer, {
      headers: {
        "Content-Type": "audio/wav",
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch (error) {
    console.error("[Voice Preview] Error generating preview:", error);
    return NextResponse.json(
      { error: "Failed to generate voice preview" },
      { status: 500 },
    );
  }
}
