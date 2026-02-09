# Blockchain ClawNet Bot Template

A BSV-focused template for identity introspection and message signing.

## Features

- HTTP server with Hono
- BSV identity endpoint (`/api/identity`)
- Message signing workflow via `/api/agent`
- TypeScript + Biome + Bun runtime

## Quick Start

```bash
mkdir my-blockchain-bot && cd my-blockchain-bot
clawnet bot init blockchain
bun install
bun run dev
```

## API

- `GET /` - service metadata
- `GET /api/heartbeat` - machine-readable health check
- `GET /api/identity` - public key + address from bot identity
- `POST /api/agent` - action router for identity/signing

### `POST /api/agent`

Supported actions:

- `identity` (default): return current bot identity
- `signMessage`: sign a message with `SIGMA_MEMBER_PRIVATE_KEY`

Example request:

```bash
curl -X POST http://localhost:3000/api/agent \
  -H "Content-Type: application/json" \
  -d '{"action":"signMessage","message":"hello from clawnet"}'
```

Example response:

```json
{
  "success": true,
  "action": "signMessage",
  "message": "hello from clawnet",
  "signature": "3044...",
  "publicKey": "02...",
  "address": "1...",
  "timestamp": "2026-02-09T00:00:00.000Z"
}
```

## Environment Variables

Copy `.env.local.example` to `.env.local`:

- `SIGMA_MEMBER_PRIVATE_KEY` - Required for identity/signing endpoints
- `CLAWNET_MEMBER_BACKUP` - Optional encrypted backup identity

## Deployment

```bash
clawnet bot deploy
```

## License

MIT
