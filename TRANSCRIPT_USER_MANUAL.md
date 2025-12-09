# SwenSync Transcript System User Manual

This manual covers the transcript functionality implemented in Phase 6 of SwenSync development.

---

## Table of Contents

1. [Overview](#overview)
2. [Creating a Room with Transcript Settings](#creating-a-room-with-transcript-settings)
3. [Using the Transcript Panel](#using-the-transcript-panel)
4. [Transcript Entries](#transcript-entries)
5. [AI Summaries](#ai-summaries)
6. [Downloading Transcripts](#downloading-transcripts)
7. [Keyboard Shortcuts & Accessibility](#keyboard-shortcuts--accessibility)

---

## Overview

The SwenSync Transcript System provides real-time conversation recording with AI-powered summaries. Key features include:

- **Real-time transcription** of participant speech and AI responses
- **Automatic AI summaries** generated periodically during conversations
- **Multiple export formats** (plain text and markdown)
- **Configurable retention** (session-only, 7 days, or 30 days)
- **Responsive design** with desktop side panel and mobile bottom sheet

---

## Creating a Room with Transcript Settings

When creating a new room, you can configure transcript settings in the **Transcript Settings** section of the form.

### Available Options

| Setting               | Description                              | Default      |
| --------------------- | ---------------------------------------- | ------------ |
| **Enable Transcript** | Record and save conversation history     | Enabled      |
| **AI Summaries**      | Generate periodic conversation summaries | Enabled      |
| **Retention Period**  | How long transcripts are kept            | Session Only |
| **Allow Download**    | Participants can download transcript     | Enabled      |

### Retention Options

- **Session Only** - Transcript is deleted when the room closes
- **7 Days** - Transcript is kept for one week after the session
- **30 Days** - Transcript is kept for one month after the session

### Usage

1. Fill in the room name and other settings
2. Scroll to the **Transcript Settings** section
3. Toggle settings as needed:
   - Click the toggle switches to enable/disable features
   - Select retention period from the dropdown
4. Click **Create Room**

> **Note:** When transcript is disabled, AI Summaries, Retention Period, and Allow Download settings are automatically disabled.

---

## Using the Transcript Panel

The transcript panel displays the real-time conversation history during a room session.

### Opening the Panel

1. Join a room
2. Click the **Transcript** button in the header
3. The panel opens on the right side (desktop) or as a bottom sheet (mobile)

### Panel Header

The header shows:

- **Title** with entry count (e.g., "Transcript (15)")
- **Auto-scroll toggle** - Click "Auto" to enable/disable auto-scrolling
- **Action buttons**:
  - Copy to clipboard
  - Download as text
  - Download as markdown
  - Collapse/expand panel

### Recording Indicator

When transcription is active, a red **REC** badge appears next to the room name in the header, indicating that the conversation is being recorded.

### Auto-Scroll

- **Enabled (default)**: Panel automatically scrolls to show new entries
- **Disabled**: Panel stays at current position; useful for reviewing older entries

Click the **Auto** button to toggle auto-scroll on/off.

### Collapsing the Panel

Click the collapse button (chevron icon) to minimize the panel while keeping it visible. Click again to expand.

---

## Transcript Entries

Each transcript entry represents a single utterance in the conversation.

### Entry Types

| Type        | Icon      | Description                  |
| ----------- | --------- | ---------------------------- |
| **Human**   | User icon | Participant speech           |
| **AI**      | Bot icon  | AI assistant response        |
| **System**  | Info icon | System messages (join/leave) |
| **Summary** | File icon | AI-generated summary         |

### Entry Information

Each entry displays:

- **Speaker name** or "AI Assistant"
- **Timestamp** (relative or absolute)
- **Content** of the utterance
- **Type badge** indicating the entry type

### Entry Badges

- Human entries show speaker name with user icon
- AI entries show "AI Assistant" with bot icon
- System entries are styled differently for visibility

---

## AI Summaries

AI summaries are automatically generated at intervals during the conversation.

### Summary Cards

Summary cards appear in the transcript and show:

- **Summary icon** with "Summary" label
- **Generation time**
- **Entry count** (number of entries summarized)
- **Summary content** (expandable)

### Viewing Summaries

1. Summaries appear inline with transcript entries
2. Click on a summary card to expand/collapse the full content
3. Summaries include key points, decisions, and action items

### Summary Card Variants

- **Full card**: Shows complete summary with expand/collapse
- **Compact card**: Condensed view for mobile or space-constrained layouts
- **Skeleton**: Loading placeholder while summary generates

---

## Downloading Transcripts

Export your conversation transcript in multiple formats.

### Quick Download

From the transcript panel header:

- Click **TXT** button for plain text format
- Click **MD** button for markdown format

### Download Modal

For more options, click the download icon to open the download modal:

#### Format Selection

| Format                | Description                                 |
| --------------------- | ------------------------------------------- |
| **Plain Text (.txt)** | Simple text file, universally compatible    |
| **Markdown (.md)**    | Formatted document with headers and styling |

#### Include Options

- **AI Summaries** - Include generated summaries in export
- **Timestamps** - Include time for each entry
- **Speaker names** - Include who said what
- **Entry type badges** - Include [Human], [AI], etc. markers

#### Download Process

1. Select format (TXT or MD)
2. Check/uncheck include options
3. Click **Download**
4. File downloads automatically
5. Modal closes after successful download

### File Naming

Downloaded files are named: `{room-name}-transcript.{ext}`

Example: `team-meeting-transcript.txt`

---

## Keyboard Shortcuts & Accessibility

### Accessibility Features

- **ARIA labels** on all interactive elements
- **Role attributes** for screen readers
- **Keyboard navigation** support
- **Focus management** in modals

### Toggle Switches

All toggle switches use proper `role="switch"` and `aria-checked` attributes for screen reader compatibility.

### Modal Behavior

- **Close button** has `aria-label="Close modal"`
- **Dialog** has `role="dialog"` and `aria-modal="true"`
- **Title** is linked via `aria-labelledby`

### Panel Navigation

- Use Tab to navigate between controls
- Enter/Space to activate buttons and toggles
- Escape to close modals (when not downloading)

---

## Technical Reference

### Transcript Entry Structure

```typescript
interface TranscriptEntry {
  id: string;
  roomId: string;
  type: "human" | "ai" | "system" | "summary";
  speakerId?: string;
  speakerName?: string;
  content: string;
  timestamp: Date;
  metadata?: {
    responseId?: string;
    turnId?: string;
    duration?: number;
  };
}
```

### Summary Structure

```typescript
interface TranscriptSummary {
  id: string;
  roomId: string;
  content: string;
  entryCount: number;
  startEntryId: string;
  endEntryId: string;
  generatedAt: Date;
}
```

### Room Transcript Settings

```typescript
interface RoomTranscriptSettings {
  enabled: boolean;
  summariesEnabled: boolean;
  retention: "session" | "7days" | "30days";
  allowDownload: boolean;
}
```

---

## Troubleshooting

### Transcript Not Appearing

1. Ensure transcript is enabled for the room
2. Check that you've joined the room successfully
3. Verify the transcript panel is open (click Transcript button)

### Download Not Working

1. Check browser permissions for file downloads
2. Ensure there are entries to download
3. Try a different format if one fails

### Auto-Scroll Not Working

1. Toggle auto-scroll off and on again
2. Scroll manually to bottom to trigger auto-scroll reset
3. Check if panel is collapsed

### Missing Summaries

1. Verify AI Summaries is enabled in room settings
2. Summaries generate after sufficient conversation
3. Check for errors in the transcript panel

---

## Feature Implementation Details

This transcript system was implemented as part of Phase 6, consisting of 14 features:

| Feature  | Description                          |
| -------- | ------------------------------------ |
| FEAT-500 | Transcript types and data models     |
| FEAT-501 | PTT context injection                |
| FEAT-502 | Transcription service integration    |
| FEAT-503 | ContextManager transcript extensions |
| FEAT-504 | Summarization service                |
| FEAT-505 | Transcript Socket.io events          |
| FEAT-506 | Transcript REST endpoints            |
| FEAT-507 | useTranscript hook                   |
| FEAT-508 | TranscriptPanel component            |
| FEAT-509 | TranscriptEntry component            |
| FEAT-510 | SummaryCard component                |
| FEAT-511 | TranscriptDownloadModal component    |
| FEAT-512 | Room page transcript integration     |
| FEAT-513 | CreateRoomForm transcript settings   |

---

_Last updated: Phase 6 completion_
