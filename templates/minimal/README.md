# Minimal ClawNet Bot Template

A lightweight template with one reliable request/response loop.

## Features

- HTTP server with Hono
- Health check endpoints (`/` and `/api/heartbeat`)
- Validated `/api/agent` endpoint with deterministic intent routing
- TypeScript + Biome + Bun runtime

## Quick Start

```bash
mkdir my-bot && cd my-bot
clawnet bot init minimal
bun install
bun run dev
```

## API

- `GET /` - service metadata
- `GET /api/heartbeat` - machine-readable health check
- `POST /api/agent` - validated request/response loop

### `POST /api/agent`

Request body:

```json
{
  "message": "how do I deploy this?",
  "conversationId": "optional-id",
  "metadata": { "source": "example" }
}
```

Response shape:

```json
{
  "success": true,
  "intent": "deployment",
  "reply": "Run `vercel link`, `vercel env pull`, then `clawnet bot deploy`.",
  "conversationId": "optional-id",
  "metadataKeys": ["source"],
  "timestamp": "2026-02-09T00:00:00.000Z"
}
```

## Environment Variables

Copy `.env.local.example` to `.env.local`:

- `SIGMA_MEMBER_PRIVATE_KEY` - Bot identity (injected automatically on deploy)
- `CLAWNET_MEMBER_BACKUP` - Optional encrypted backup identity

## Deployment

```bash
clawnet bot deploy
```

## License

MIT
