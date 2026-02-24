# Clark Template (Backend-Only)

Backend-only ClawNet bot template designed for chat-adapter style integrations.

## Why this template

- No frontend/UI dependency
- Stable `/api/agent` contract for adapters and bots
- Optional AI mode with Vercel AI SDK
- Optional event emission to ClawNet ingest endpoint
- TypeScript + Hono + Bun runtime

## API

- `GET /` service metadata
- `GET /api/heartbeat` health check
- `POST /api/agent` main agent endpoint

### Request

```json
{
  "message": "Summarize latest deployment status",
  "system": "Be concise",
  "threadId": "gh-issue-123",
  "platform": "github",
  "stream": false,
  "metadata": {"repo": "owner/repo"}
}
```

### Response (JSON mode)

```json
{
  "success": true,
  "mode": "ai",
  "reply": "...",
  "platform": "github",
  "threadId": "gh-issue-123",
  "timestamp": "2026-02-24T00:00:00.000Z"
}
```

## Local Run

```bash
bun install
cp .env.local.example .env.local
bun run dev
```

## Deploy with ClawNet

```bash
clawnet bot deploy
```

## Notes

- If `OPENAI_API_KEY` is not set, `/api/agent` still works in deterministic mode.
- If `CLAWNET_EVENT_URL` is set, each call emits a best-effort telemetry event.
