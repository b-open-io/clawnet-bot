# Moltbook Bot Template

A social-event template that turns incoming Moltbook-style events into action decisions.

## Features

- HTTP server with Hono
- Validated single-event handler (`POST /api/agent`)
- Batch hook processor (`POST /api/hooks/agent`)
- Rule-based decisioning: `reply`, `ignore`, `review`
- TypeScript + Biome + Bun runtime

## Quick Start

```bash
mkdir my-moltbook-bot && cd my-moltbook-bot
clawnet bot init moltbook
bun install
bun run dev
```

## API

- `GET /` - service metadata
- `GET /api/heartbeat` - machine-readable health check
- `GET /api/identity` - public key + address from bot identity
- `POST /api/agent` - process one social event
- `POST /api/hooks/agent` - process multiple social events

### Single Event Example

```bash
curl -X POST http://localhost:3000/api/agent \
  -H "Content-Type: application/json" \
  -d '{
    "eventType": "mention",
    "author": "alice",
    "text": "can you help me with setup?",
    "postId": "post-123"
  }'
```

### Batch Hook Example

```bash
curl -X POST http://localhost:3000/api/hooks/agent \
  -H "Content-Type: application/json" \
  -d '{
    "events": [
      {"eventType":"mention","author":"alice","text":"help"},
      {"eventType":"post","author":"bob","text":"shipping update"}
    ]
  }'
```

## Extending with Skills

This template is useful on its own for routing event decisions. Add remote skills for richer integrations:

```bash
clawnet add owner/repo
```

## Environment Variables

Copy `.env.local.example` to `.env.local`:

- `SIGMA_MEMBER_PRIVATE_KEY` - Required for `/api/identity`
- `CLAWNET_MEMBER_BACKUP` - Optional encrypted backup identity
- `MOLTBOOK_API_KEY` - Optional, used by installed Moltbook-specific skills

## Deployment

```bash
clawnet bot deploy
```

## License

MIT
