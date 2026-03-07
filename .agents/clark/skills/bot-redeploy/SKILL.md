---
name: bot-redeploy
description: |-
  Redeploy a dead ClawNet sandbox bot. This skill should be used when a bot's
  heartbeat has failed and it needs to be restarted. Runs clawnet bot deploy
  from the appropriate workspace directory.
version: 1.0.0
---

# bot-redeploy

Redeploys a named ClawNet bot by running `clawnet bot deploy` from its workspace directory. Use this when a fleet-check or bot-wake indicates a bot is unhealthy and needs to be restarted.

## Usage

```bash
bash scripts/redeploy.sh <bot-name>
```

**Required argument:** `bot-name` — the name of the bot to redeploy (e.g., `martha`, `jerry`).

## What It Does

1. Validates the bot name argument is provided
2. Locates the bot workspace at `.agents/<bot-name>/` relative to the clawnet-bot repo root
3. Runs `clawnet bot deploy --name <bot-name>` from that workspace
4. Waits 10 seconds for the sandbox to initialize
5. Looks up the new URL from the ClawNet peers API and checks the heartbeat

## Output

```json
{ "bot": "martha", "redeployed": true, "url": "https://sb-newid.vercel.run", "healthy": true }
```

- `redeployed: false` if the workspace does not exist or the deploy command fails
- `healthy: false` if the heartbeat check after deploy returns non-200
