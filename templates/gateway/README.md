# AI Gateway Bot Template

A streaming AI bot using Vercel AI Gateway with ai@6. No provider-specific SDKs needed.

## Features

- Vercel AI Gateway (single API key, any model provider)
- AI SDK v6 with `toUIMessageStreamResponse()` streaming
- SOUL.md loaded at startup for system prompt
- Input validation on all endpoints
- TypeScript + Biome + Bun runtime

## Quick Start

```bash
clawnet bot init --template gateway
cd .agents/<your-bot>
cp .env.local.example .env.local
# Add your AI_GATEWAY_API_KEY to .env.local
bun install
bun run dev
```

## API

- `GET /` - service metadata
- `GET /api/heartbeat` - machine-readable health check
- `POST /api/chat` - stream completion from message history (uses SOUL.md as system prompt)
- `POST /api/agent` - stream completion from single prompt

### `POST /api/chat`

```bash
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "hello"}
    ]
  }'
```

### `POST /api/agent`

```bash
curl -X POST http://localhost:3000/api/agent \
  -H "Content-Type: application/json" \
  -d '{
    "message": "summarize this in one sentence",
    "system": "Be concise"
  }'
```

## Environment Variables

- `AI_GATEWAY_API_KEY` - Required. Your Vercel AI Gateway key.
- `AI_GATEWAY_MODEL` - Optional. Model ID (default: `anthropic/claude-sonnet-4.6`).
- `SIGMA_MEMBER_PRIVATE_KEY` - Bot identity (injected automatically on deploy).
- `CLAWNET_MEMBER_BACKUP` - Optional encrypted backup identity.

## Why Gateway?

The AI Gateway provides a single API key that routes to any model provider (Anthropic, OpenAI, Google, etc.) without provider-specific SDKs. Change models by changing `AI_GATEWAY_MODEL` — no code changes needed.

## Deployment

```bash
clawnet bot deploy
```
