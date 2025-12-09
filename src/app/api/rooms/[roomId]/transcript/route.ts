/**
 * Transcript API Endpoints
 *
 * GET /api/rooms/[roomId]/transcript - Get room transcript
 *   Query params:
 *   - format: 'json' | 'txt' | 'md' (default: 'json')
 *   - limit: number (default: 100)
 *   - offset: number (default: 0)
 *   - download: 'true' to trigger file download
 *
 * Part of the Long-Horizon Engineering Protocol - FEAT-506
 */

import { NextRequest, NextResponse } from "next/server";
import { getRoom, roomExists } from "@/server/store/rooms";
import type {
  TranscriptEntry,
  TranscriptSummary,
  TranscriptApiResponse,
  TranscriptDownloadFormat,
} from "@/types/transcript";

interface RouteParams {
  params: Promise<{ roomId: string }>;
}

/**
 * Format transcript entry for text output
 */
function formatEntryText(entry: TranscriptEntry): string {
  const time = entry.timestamp.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  const badge =
    entry.type === "ptt"
      ? " [PTT]"
      : entry.type === "ai_response"
        ? " [AI]"
        : entry.type === "system"
          ? " [System]"
          : "";

  return `[${time}] ${entry.speaker}${badge}: ${entry.content}`;
}

/**
 * Format summary for text output
 */
function formatSummaryText(summary: TranscriptSummary): string {
  const time = summary.timestamp.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  const bullets = summary.bulletPoints
    .map((point) => `  - ${point}`)
    .join("\n");

  return `\n--- Summary (${time}) ---\n${summary.content}\n\nKey Points:\n${bullets}\n---\n`;
}

/**
 * Format transcript entry for markdown output
 */
function formatEntryMarkdown(entry: TranscriptEntry): string {
  const time = entry.timestamp.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  if (entry.type === "system") {
    return `*${entry.content}* — ${time}\n`;
  }

  const badge =
    entry.type === "ptt" ? " 🎤" : entry.type === "ai_response" ? " 🤖" : "";

  return `**${entry.speaker}**${badge} (${time}): ${entry.content}\n`;
}

/**
 * Format summary for markdown output
 */
function formatSummaryMarkdown(summary: TranscriptSummary): string {
  const time = summary.timestamp.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  const bullets = summary.bulletPoints.map((point) => `- ${point}`).join("\n");

  return `\n---\n\n### 📋 Summary (${time})\n\n${summary.content}\n\n**Key Points:**\n${bullets}\n\n---\n\n`;
}

/**
 * Generate text format transcript
 */
function generateTextTranscript(
  roomName: string,
  entries: TranscriptEntry[],
  summaries: TranscriptSummary[],
  startTime: Date,
): string {
  const header = `TRANSCRIPT: ${roomName}
Date: ${startTime.toLocaleDateString("en-US", { dateStyle: "full" })}
Started: ${startTime.toLocaleTimeString("en-US")}
${"=".repeat(50)}

`;

  // Merge entries and summaries by timestamp
  const allItems: Array<
    | { type: "entry"; item: TranscriptEntry; timestamp: Date }
    | { type: "summary"; item: TranscriptSummary; timestamp: Date }
  > = [
    ...entries.map((e) => ({
      type: "entry" as const,
      item: e,
      timestamp: e.timestamp,
    })),
    ...summaries.map((s) => ({
      type: "summary" as const,
      item: s,
      timestamp: s.timestamp,
    })),
  ].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  const content = allItems
    .map((item) =>
      item.type === "entry"
        ? formatEntryText(item.item)
        : formatSummaryText(item.item),
    )
    .join("\n");

  return header + content;
}

/**
 * Generate markdown format transcript
 */
function generateMarkdownTranscript(
  roomName: string,
  entries: TranscriptEntry[],
  summaries: TranscriptSummary[],
  startTime: Date,
  participants: string[],
): string {
  const header = `# ${roomName} — Transcript

**Date:** ${startTime.toLocaleDateString("en-US", { dateStyle: "full" })}
**Started:** ${startTime.toLocaleTimeString("en-US")}
**Participants:** ${participants.join(", ") || "N/A"}

---

`;

  // Merge entries and summaries by timestamp
  const allItems: Array<
    | { type: "entry"; item: TranscriptEntry; timestamp: Date }
    | { type: "summary"; item: TranscriptSummary; timestamp: Date }
  > = [
    ...entries.map((e) => ({
      type: "entry" as const,
      item: e,
      timestamp: e.timestamp,
    })),
    ...summaries.map((s) => ({
      type: "summary" as const,
      item: s,
      timestamp: s.timestamp,
    })),
  ].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  const content = allItems
    .map((item) =>
      item.type === "entry"
        ? formatEntryMarkdown(item.item)
        : formatSummaryMarkdown(item.item),
    )
    .join("\n");

  return header + content;
}

/**
 * Generate filename for download
 */
function generateFilename(
  roomName: string,
  format: TranscriptDownloadFormat,
): string {
  const date = new Date().toISOString().split("T")[0];
  const safeName = roomName.replace(/[^a-zA-Z0-9-_]/g, "_").substring(0, 50);
  return `${safeName}_transcript_${date}.${format}`;
}

/**
 * GET /api/rooms/[roomId]/transcript
 * Get room transcript in various formats
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { roomId } = await params;
    const { searchParams } = new URL(request.url);

    const format = (searchParams.get("format") || "json") as
      | "json"
      | "txt"
      | "md";
    const limit = Math.min(parseInt(searchParams.get("limit") || "100"), 1000);
    const offset = parseInt(searchParams.get("offset") || "0");
    const download = searchParams.get("download") === "true";

    if (!roomId) {
      return NextResponse.json(
        { error: "Room ID is required" },
        { status: 400 },
      );
    }

    if (!roomExists(roomId)) {
      return NextResponse.json(
        { error: "Room not found", code: "ROOM_NOT_FOUND" },
        { status: 404 },
      );
    }

    const room = getRoom(roomId);
    if (!room) {
      return NextResponse.json(
        { error: "Room not found", code: "ROOM_NOT_FOUND" },
        { status: 404 },
      );
    }

    // For now, return mock data since we don't have a global context manager
    // In production, this would be integrated with the signaling server's context manager
    const mockEntries: TranscriptEntry[] = [];
    const mockSummaries: TranscriptSummary[] = [];
    const participants = room.participants?.map((p) => p.displayName) || [];
    const startTime = room.createdAt;

    // Handle different formats
    if (format === "txt") {
      const content = generateTextTranscript(
        room.name,
        mockEntries,
        mockSummaries,
        startTime,
      );

      const headers: HeadersInit = {
        "Content-Type": "text/plain; charset=utf-8",
      };

      if (download) {
        headers["Content-Disposition"] =
          `attachment; filename="${generateFilename(room.name, "txt")}"`;
      }

      return new NextResponse(content, { headers });
    }

    if (format === "md") {
      const content = generateMarkdownTranscript(
        room.name,
        mockEntries,
        mockSummaries,
        startTime,
        participants,
      );

      const headers: HeadersInit = {
        "Content-Type": "text/markdown; charset=utf-8",
      };

      if (download) {
        headers["Content-Disposition"] =
          `attachment; filename="${generateFilename(room.name, "md")}"`;
      }

      return new NextResponse(content, { headers });
    }

    // JSON format (default)
    const response: TranscriptApiResponse = {
      roomId,
      roomName: room.name,
      startTime,
      endTime: room.status === "closed" ? room.lastActivityAt : null,
      participants,
      entries: mockEntries.slice(offset, offset + limit),
      summaries: mockSummaries,
      totalEntries: mockEntries.length,
      offset,
      limit,
    };

    const headers: HeadersInit = {
      "Content-Type": "application/json",
    };

    if (download) {
      headers["Content-Disposition"] =
        `attachment; filename="${generateFilename(room.name, "txt").replace(".txt", ".json")}"`;
    }

    return NextResponse.json(response, { headers });
  } catch (error) {
    console.error("Error getting transcript:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
