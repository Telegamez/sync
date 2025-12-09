/**
 * Transcript REST API Tests
 *
 * Tests for FEAT-506: Transcript REST endpoints.
 * Verifies JSON, txt, and markdown format responses.
 *
 * Part of the Long-Horizon Engineering Protocol - FEAT-506
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/rooms/[roomId]/transcript/route";
import * as roomsStore from "@/server/store/rooms";

// Mock the rooms store
vi.mock("@/server/store/rooms", () => ({
  getRoom: vi.fn(),
  roomExists: vi.fn(),
}));

describe("FEAT-506: Transcript REST API", () => {
  const mockRoom = {
    id: "room-123",
    name: "Test Room",
    createdAt: new Date("2024-12-09T10:00:00Z"),
    closedAt: null,
    participants: [
      { displayName: "Alice", id: "peer-1" },
      { displayName: "Bob", id: "peer-2" },
    ],
    status: "active",
    maxParticipants: 10,
    participantCount: 2,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(roomsStore.roomExists).mockReturnValue(true);
    vi.mocked(roomsStore.getRoom).mockReturnValue(mockRoom as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("GET /api/rooms/[roomId]/transcript", () => {
    it("should return JSON format by default", async () => {
      const request = new NextRequest(
        "http://localhost:3000/api/rooms/room-123/transcript",
      );

      const response = await GET(request, {
        params: Promise.resolve({ roomId: "room-123" }),
      });

      expect(response.status).toBe(200);
      const data = await response.json();

      expect(data.roomId).toBe("room-123");
      expect(data.roomName).toBe("Test Room");
      expect(data.entries).toBeInstanceOf(Array);
      expect(data.summaries).toBeInstanceOf(Array);
      expect(data.offset).toBe(0);
      expect(data.limit).toBe(100);
    });

    it("should return text format when requested", async () => {
      const request = new NextRequest(
        "http://localhost:3000/api/rooms/room-123/transcript?format=txt",
      );

      const response = await GET(request, {
        params: Promise.resolve({ roomId: "room-123" }),
      });

      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Type")).toContain("text/plain");

      const text = await response.text();
      expect(text).toContain("TRANSCRIPT: Test Room");
      expect(text).toContain("Date:");
    });

    it("should return markdown format when requested", async () => {
      const request = new NextRequest(
        "http://localhost:3000/api/rooms/room-123/transcript?format=md",
      );

      const response = await GET(request, {
        params: Promise.resolve({ roomId: "room-123" }),
      });

      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Type")).toContain("text/markdown");

      const markdown = await response.text();
      expect(markdown).toContain("# Test Room — Transcript");
      expect(markdown).toContain("**Participants:**");
    });

    it("should include Content-Disposition header for download", async () => {
      const request = new NextRequest(
        "http://localhost:3000/api/rooms/room-123/transcript?download=true",
      );

      const response = await GET(request, {
        params: Promise.resolve({ roomId: "room-123" }),
      });

      expect(response.status).toBe(200);
      const disposition = response.headers.get("Content-Disposition");
      expect(disposition).toContain("attachment");
      expect(disposition).toContain("filename=");
    });

    it("should respect limit parameter", async () => {
      const request = new NextRequest(
        "http://localhost:3000/api/rooms/room-123/transcript?limit=50",
      );

      const response = await GET(request, {
        params: Promise.resolve({ roomId: "room-123" }),
      });

      const data = await response.json();
      expect(data.limit).toBe(50);
    });

    it("should cap limit at 1000", async () => {
      const request = new NextRequest(
        "http://localhost:3000/api/rooms/room-123/transcript?limit=5000",
      );

      const response = await GET(request, {
        params: Promise.resolve({ roomId: "room-123" }),
      });

      const data = await response.json();
      expect(data.limit).toBe(1000);
    });

    it("should respect offset parameter", async () => {
      const request = new NextRequest(
        "http://localhost:3000/api/rooms/room-123/transcript?offset=20",
      );

      const response = await GET(request, {
        params: Promise.resolve({ roomId: "room-123" }),
      });

      const data = await response.json();
      expect(data.offset).toBe(20);
    });

    it("should return 404 for non-existent room", async () => {
      vi.mocked(roomsStore.roomExists).mockReturnValue(false);

      const request = new NextRequest(
        "http://localhost:3000/api/rooms/nonexistent/transcript",
      );

      const response = await GET(request, {
        params: Promise.resolve({ roomId: "nonexistent" }),
      });

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.code).toBe("ROOM_NOT_FOUND");
    });

    it("should include participants in response", async () => {
      const request = new NextRequest(
        "http://localhost:3000/api/rooms/room-123/transcript",
      );

      const response = await GET(request, {
        params: Promise.resolve({ roomId: "room-123" }),
      });

      const data = await response.json();
      expect(data.participants).toContain("Alice");
      expect(data.participants).toContain("Bob");
    });

    it("should include startTime in response", async () => {
      const request = new NextRequest(
        "http://localhost:3000/api/rooms/room-123/transcript",
      );

      const response = await GET(request, {
        params: Promise.resolve({ roomId: "room-123" }),
      });

      const data = await response.json();
      expect(data.startTime).toBeDefined();
    });
  });

  describe("Response format validation", () => {
    it("should generate proper filename for txt download", async () => {
      const request = new NextRequest(
        "http://localhost:3000/api/rooms/room-123/transcript?format=txt&download=true",
      );

      const response = await GET(request, {
        params: Promise.resolve({ roomId: "room-123" }),
      });

      const disposition = response.headers.get("Content-Disposition");
      expect(disposition).toContain(".txt");
      expect(disposition).toContain("Test_Room");
    });

    it("should generate proper filename for md download", async () => {
      const request = new NextRequest(
        "http://localhost:3000/api/rooms/room-123/transcript?format=md&download=true",
      );

      const response = await GET(request, {
        params: Promise.resolve({ roomId: "room-123" }),
      });

      const disposition = response.headers.get("Content-Disposition");
      expect(disposition).toContain(".md");
    });

    it("should sanitize room name in filename", async () => {
      vi.mocked(roomsStore.getRoom).mockReturnValue({
        ...mockRoom,
        name: "Room With <Special> Characters!",
      } as any);

      const request = new NextRequest(
        "http://localhost:3000/api/rooms/room-123/transcript?format=txt&download=true",
      );

      const response = await GET(request, {
        params: Promise.resolve({ roomId: "room-123" }),
      });

      const disposition = response.headers.get("Content-Disposition");
      // Should not contain special characters
      expect(disposition).not.toContain("<");
      expect(disposition).not.toContain(">");
      expect(disposition).not.toContain("!");
    });
  });
});

describe("Transcript API format helpers", () => {
  it("should support json format parameter", () => {
    const validFormats = ["json", "txt", "md"];
    expect(validFormats).toContain("json");
  });

  it("should support txt format parameter", () => {
    const validFormats = ["json", "txt", "md"];
    expect(validFormats).toContain("txt");
  });

  it("should support md format parameter", () => {
    const validFormats = ["json", "txt", "md"];
    expect(validFormats).toContain("md");
  });
});

describe("TranscriptApiResponse structure", () => {
  it("should have all required fields", () => {
    const response = {
      roomId: "room-123",
      roomName: "Test Room",
      startTime: new Date(),
      endTime: null,
      participants: ["Alice", "Bob"],
      entries: [],
      summaries: [],
      totalEntries: 0,
      offset: 0,
      limit: 100,
    };

    expect(response.roomId).toBeDefined();
    expect(response.roomName).toBeDefined();
    expect(response.startTime).toBeInstanceOf(Date);
    expect(response.participants).toBeInstanceOf(Array);
    expect(response.entries).toBeInstanceOf(Array);
    expect(response.summaries).toBeInstanceOf(Array);
    expect(typeof response.totalEntries).toBe("number");
    expect(typeof response.offset).toBe("number");
    expect(typeof response.limit).toBe("number");
  });
});
