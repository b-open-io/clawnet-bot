# Vercel AI SDK Bot Template

A streaming AI template with strict request validation and production-safe config checks.

## Features

- Vercel AI SDK streaming endpoints
- Input validation for `/api/chat` and `/api/agent`
- Clear error behavior when `OPENAI_API_KEY` is missing
- TypeScript + Biome + Bun runtime

## Quick Start

```bash
mkdir my-ai-bot && cd my-ai-bot
clawnet bot init vercel-ai
bun install
export OPENAI_API_KEY=your_key_here
bun run dev
```

## API

- `GET /` - service metadata
- `GET /api/heartbeat` - machine-readable health check
- `POST /api/chat` - stream completion from message history
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

Copy `.env.local.example` to `.env.local`:

- `OPENAI_API_KEY` - Required for AI endpoints
- `OPENAI_MODEL` - Optional model override (default: `gpt-4o-mini`)
- `SIGMA_MEMBER_PRIVATE_KEY` - Bot identity (injected automatically on deploy)
- `CLAWNET_MEMBER_BACKUP` - Optional encrypted backup identity

## Deployment

```bash
clawnet bot deploy
```

## License

MIT
