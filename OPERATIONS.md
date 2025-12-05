# Swensync Operations Guide

## Quick Reference

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start development server (port 24680) |
| `pnpm build` | Build for production |
| `pnpm start` | Start production server (port 24680) |
| `pnpm stop` | Stop process on port 24680 |
| `pnpm restart` | Stop and restart dev server |
| `pnpm prod` | Build and start production (detached) |
| `pnpm start:detached` | Start standalone server (detached) |
| `pnpm logs` | Tail application logs |
| `pnpm lint` | Run ESLint |
| `pnpm type-check` | Run TypeScript type checking |

---

## Environment Setup

### Required Environment Variables

Create a `.env` file in the project root:

```env
# OpenAI API Key (required)
OPENAI_API_KEY=sk-your-api-key-here

# Port (default: 24680)
PORT=24680
```

### Prerequisites

- Node.js 20+
- pnpm (recommended) or npm
- OpenAI API key with Realtime API access

---

## Development

### Starting Development Server

```bash
pnpm dev
```

The app will be available at **http://localhost:24680**

### Stopping Development Server

```bash
pnpm stop
```

### Restarting Development Server

```bash
pnpm restart
```

### Type Checking

```bash
pnpm type-check
```

### Linting

```bash
pnpm lint
```

---

## Production

### Build for Production

```bash
pnpm build
```

This creates an optimized production build in `.next/`

### Start Production Server

```bash
pnpm start
```

### Build and Start (Combined)

```bash
pnpm prod
```

This builds the app and starts it **detached** - you can close the terminal and the server keeps running.

### Start Detached (After Build)

```bash
pnpm start:detached
```

Starts the standalone server in the background without rebuilding.

### View Logs

```bash
pnpm logs
```

Tails `/tmp/swensync.log` in real-time.

### Stop Production Server

```bash
pnpm stop
```

Stops the detached server using the PID stored in `/tmp/swensync.pid`.

---

## Nginx Configuration

A sample Nginx configuration is provided in `nginx/in.ference.ai.conf` for reverse proxy setup.

### Deploy to Host

```bash
# Copy to sites-available
sudo cp nginx/in.ference.ai.conf /etc/nginx/sites-available/

# Create symlink in sites-enabled
sudo ln -sf /etc/nginx/sites-available/in.ference.ai.conf /etc/nginx/sites-enabled/

# Test and reload
sudo nginx -t && sudo systemctl reload nginx
```

---

## Docker Deployment

### Build and Run

```bash
docker-compose up --build
```

### Run in Background

```bash
docker-compose up -d --build
```

### Stop Container

```bash
docker-compose down
```

### View Logs

```bash
docker-compose logs -f swensync
```

### Rebuild Without Cache

```bash
docker-compose build --no-cache
docker-compose up -d
```

### Health Check

```bash
curl http://localhost:24680/api/health
```

Expected response:
```json
{"status":"healthy","service":"swensync","timestamp":"2024-12-04T..."}
```

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        Browser                               │
│  ┌─────────────────────────────────────────────────────┐    │
│  │                  SwensyncOverlay                       │    │
│  │  ┌─────────────┐  ┌──────────────┐  ┌───────────┐   │    │
│  │  │SessionTimer │  │LatencyStop- │  │  Close    │   │    │
│  │  │             │  │   watch     │  │  Button   │   │    │
│  │  └─────────────┘  └──────────────┘  └───────────┘   │    │
│  │                                                      │    │
│  │  ┌─────────────────────────────────────────────┐    │    │
│  │  │         AudioWaveVisualizer                 │    │    │
│  │  │         (bars/waveform/circular)            │    │    │
│  │  └─────────────────────────────────────────────┘    │    │
│  │                                                      │    │
│  │  ┌─────────────────────────────────────────────┐    │    │
│  │  │           ConnectionStatus                  │    │    │
│  │  └─────────────────────────────────────────────┘    │    │
│  └─────────────────────────────────────────────────────┘    │
│                            │                                 │
│                    useSwensyncRealtime                         │
│                            │                                 │
└────────────────────────────┼─────────────────────────────────┘
                             │
                             │ WebRTC (RTCPeerConnection)
                             │
┌────────────────────────────┼─────────────────────────────────┐
│                   Next.js Server                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  /api/swensync-realtime-token                         │    │
│  │  - Fetches ephemeral token from OpenAI              │    │
│  └─────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  /api/health                                        │    │
│  │  - Health check endpoint                            │    │
│  └─────────────────────────────────────────────────────┘    │
└────────────────────────────┼─────────────────────────────────┘
                             │
                             │ HTTPS
                             │
┌────────────────────────────┼─────────────────────────────────┐
│                   OpenAI Realtime API                        │
│  https://api.openai.com/v1/realtime                         │
│  Model: gpt-4o-realtime-preview-2024-12-17                  │
└──────────────────────────────────────────────────────────────┘
```

---

## Key Files

| File | Purpose |
|------|---------|
| `src/hooks/useSwensyncRealtime.ts` | Core WebRTC hook, state machine, latency tracking |
| `src/components/swensync/SwensyncOverlay.tsx` | Main overlay UI component |
| `src/components/swensync/AudioWaveVisualizer.tsx` | 2D audio visualization |
| `src/components/swensync/LatencyStopwatch.tsx` | Turn latency display |
| `src/app/api/swensync-realtime-token/route.ts` | Token endpoint |
| `src/types/swensync.ts` | TypeScript type definitions |

---

## State Machine

The conversation follows this state flow:

```
┌───────────┐
│  Idle     │ ──── connect() ────▶ ┌────────────┐
└───────────┘                      │ Connecting │
                                   └─────┬──────┘
                                         │
                                         ▼
┌───────────┐                      ┌────────────┐
│   Error   │ ◀── connection fail ─│ Connected  │
└───────────┘                      └─────┬──────┘
      │                                  │
      │ retry()                          ▼
      │                           ┌────────────┐
      └──────────────────────────▶│ Listening  │◀─────────┐
                                  └─────┬──────┘          │
                                        │                 │
                          user speaks   │                 │ response ends
                                        ▼                 │
                                  ┌────────────┐          │
                                  │  Focused   │          │
                                  └─────┬──────┘          │
                                        │                 │
                          user stops    │                 │
                                        ▼                 │
                                  ┌────────────┐          │
                                  │  Thinking  │          │
                                  └─────┬──────┘          │
                                        │                 │
                          audio starts  │                 │
                                        ▼                 │
                                  ┌────────────┐          │
                                  │  Speaking  │──────────┘
                                  └────────────┘
```

---

## Latency Tracking

The stopwatch measures **Time to First Audio (TTFA)**:

1. **Start**: When `input_audio_buffer.speech_started` event fires (user begins speaking)
2. **Stop**: When first `response.audio.delta` event fires (AI audio begins)
3. **Record**: Latency stored in `turnLatencies` array (max 5 entries)

### Color Coding

| Latency | Color | Rating |
|---------|-------|--------|
| < 500ms | Green | Excellent |
| 500ms - 1s | Yellow | Good |
| 1s - 2s | Orange | Acceptable |
| > 2s | Red | Slow |

---

## Session Limits

- **Max Duration**: 10 minutes
- **Warning**: At 8 minutes
- **Auto-disconnect**: At 10 minutes

---

## Troubleshooting

### Port Already in Use

```bash
# Check what's using port 24680
lsof -i :24680

# Kill the process
pnpm stop
```

### Connection Fails

1. Check OpenAI API key is valid
2. Ensure API key has Realtime API access
3. Check browser console for errors
4. Verify microphone permissions

### No Audio

1. Check browser microphone permissions
2. Ensure no other app is using the microphone
3. Check system audio settings

### Build Fails

```bash
# Clean and rebuild
rm -rf .next node_modules
pnpm install
pnpm build
```

### Docker Issues

```bash
# View container logs
docker-compose logs -f

# Restart container
docker-compose restart

# Full rebuild
docker-compose down
docker-compose build --no-cache
docker-compose up -d
```

---

## Monitoring

### Health Endpoint

```bash
curl http://localhost:24680/api/health
```

### Docker Health Check

The container has a built-in health check that runs every 30 seconds:

```bash
docker inspect swensync --format='{{.State.Health.Status}}'
```

### Logs

Development:
```bash
# Logs appear in terminal running pnpm dev
```

Docker:
```bash
docker-compose logs -f swensync
```

---

## Security Notes

1. **API Key**: Never commit `.env` file. It's in `.gitignore`
2. **Token Endpoint**: The `/api/swensync-realtime-token` endpoint fetches ephemeral tokens server-side to avoid exposing the main API key
3. **HTTPS**: In production, use Nginx proxy for SSL termination

---

## Updates

To update dependencies:

```bash
pnpm update
pnpm build
```

To update OpenAI model, edit `src/hooks/useSwensyncRealtime.ts`:

```typescript
const OPENAI_MODEL = 'gpt-4o-realtime-preview-2024-12-17';
```

---

*Last Updated: 2025-12-04*
