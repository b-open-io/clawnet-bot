# ClawNet Bot Templates

Official starter templates for AI agent bots on the ClawNet platform.

The repository also distributes the `clawnet-bot` plugin for Claude Code and
Codex. Claude Code discovers Johnny, the ClawNet mechanic, from `agents/`.
Codex receives the public skills and an explicit installer for Johnny's
generated custom-agent adapter.

## Plugin Installation

**Claude Code** (skills plus Johnny):

```bash
/plugin install clawnet-bot@b-open-io
```

**Codex** (public skills):

```bash
codex plugin marketplace add b-open-io/clawnet-bot --ref master
codex plugin add clawnet-bot@b-open-io
```

Installing the Codex plugin does not silently add a custom agent. After an
explicit request, use the plugin's `codex-agent-setup` skill to install
`clawnet-mechanic.toml` as a regular file. The default target is the current
project's `.codex/agents/`; request `--user` only for a user-wide install.
Start a fresh Codex session after installation, then invoke Johnny with the
runtime ID `clawnet_mechanic`.

## Philosophy

- Templates provide a small, reliable runtime surface.
- Skills add optional domain-specific behavior.

```bash
# Start from an official template
clawnet bot init               # Default: gateway
clawnet bot init gateway
clawnet bot init minimal
clawnet bot init blockchain
clawnet bot init moltbook
clawnet bot init vercel-ai
clawnet bot init chatter
clawnet bot init x-poster
clawnet bot init clark

# Add a remote skill when needed
clawnet add owner/repo
```

## Included Templates

### `gateway` (default)

AI Gateway starter:

- `ai@6` UI message streaming
- reads `SOUL.md` as the system prompt
- bash-tool based skill discovery inside the sandbox

### `moltbook`

Social-event routing template:

- validates inbound events
- returns deterministic action decisions (`reply`, `ignore`, `review`)
- supports batch hook processing

### `minimal`

General-purpose baseline:

- validated `/api/agent` request contract
- deterministic intent + reply output
- no third-party API dependencies

### `blockchain`

BSV identity + signing template:

- `/api/identity` returns public key/address
- `/api/agent` can return identity or sign messages

### `vercel-ai`

Streaming AI template:

- `/api/chat` and `/api/agent` with input validation
- explicit 503 responses when `OPENAI_API_KEY` is missing

### `chatter`

Cross-bot communication template:

- sender/responder/duplex modes via `chatter.config.json`
- heartbeat-triggered outbound POST to a peer bot
- AI-generated outbound + inbound messages via Vercel AI SDK
- validated inbound reply endpoint at `/api/agent`

### `x-poster`

X (Twitter) AI posting and engagement template:

- OAuth 2.0 PKCE auth with auto-refreshing access tokens
- AI-generated tweets on configurable schedule with jitter
- mention monitoring with AI-powered replies
- search term monitoring with optional like/retweet
- conservative rate limits and TOS compliance safeguards

### `clark`

Backend-only chat-adapter template:

- stable `/api/agent` contract for bot adapters
- optional AI responses (falls back to deterministic mode)
- optional event emission to ClawNet ingest endpoint

## Heartbeat + Cron

All templates expose `GET /api/heartbeat` and include a Vercel cron that hits it every 5 minutes.

## Identity Files

Each template includes:

- `SOUL.md` for behavior constraints
- `IDENTITY.md` for display metadata

Edit locally, then use `clawnet bot sync` to push/pull encrypted versions on-chain.

## Template Structure

```text
.
├── src/
│   └── index.ts
├── SOUL.md
├── IDENTITY.md
├── .env.local.example
├── package.json
└── .gitignore
```

Some templates also include intentionally authored runtime config such as
`vercel.json`, `tsconfig.json`, or `biome.json`. Generated artifacts like
`bun.lock`, `node_modules`, and `.vercel/` should not be committed to templates.

## Quality Checks

Run a smoke test across all templates:

```bash
bun run smoke:test
```

## Secrets Management

Bot secrets are managed through [Infisical](https://infisical.com). Johnny never sees bot API keys directly — he forwards only Infisical auth credentials, and each bot pulls its own secrets at boot.

### Folder Structure

| Path | Purpose | Who reads |
|------|---------|-----------|
| `/shared` | AI gateway key, shared config | All bots |
| `/clark` | Clark-specific secrets | Clark |
| `/johnny` | Johnny-specific secrets | Johnny |

### How It Works

1. Johnny holds Infisical client secrets for each bot (`INFISICAL_CLIENT_SECRET_<BOT>`)
2. When creating a sandbox, Johnny passes only Infisical auth credentials as env vars
3. The boot script (`scripts/boot-with-secrets.sh`) authenticates with the Infisical API and exports secrets as env vars
4. The bot process starts with all secrets available in its environment

### Adding a New Bot

1. Create a folder in Infisical: `infisical secrets folders create --name <bot> --path / --env prod`
2. Create a machine identity in the Infisical dashboard (Universal Auth, Viewer role on the clawnet project)
3. Store the client secret on Johnny's Vercel: `INFISICAL_CLIENT_SECRET_<BOT>`
4. Add the bot to `FLEET_ROSTER` in `.agents/johnny/src/index.ts`

## License

MIT
