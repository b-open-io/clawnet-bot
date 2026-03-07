---
name: bot-wake
description: |-
  Wake a specific bot on demand. This skill should be used when someone asks
  to wake up or restart a specific bot. Checks if the bot is alive first, and
  only redeploys if the heartbeat fails.
version: 1.0.0
---

# bot-wake

A convenience wrapper that checks a bot's heartbeat before deciding whether to redeploy. If the bot is already healthy, it returns immediately without triggering a deploy. If the heartbeat fails, it delegates to the `bot-redeploy` skill to bring it back up.

## Usage

```bash
bash scripts/wake.sh <bot-name>
```

**Required argument:** `bot-name` -- the name of the bot to wake (e.g., `martha`, `jerry`).

## What It Does

1. Validates the bot name argument
2. Looks up the bot's current URL from the ClawNet peers API
3. Checks the heartbeat at `{url}/api/heartbeat`
4. If healthy: returns immediately with `status: "already_running"`
5. If unhealthy (or not found): calls `../bot-redeploy/scripts/redeploy.sh` to restart it

## Output

Already running:
```json
{ "bot": "martha", "status": "already_running", "url": "https://sb-abc123.vercel.run" }
```

Was dead, now redeployed:
```json
{ "bot": "martha", "status": "redeployed", "url": "https://sb-newid.vercel.run", "healthy": true }
```

Not found in peers API:
```json
{ "bot": "jerry", "status": "not_found", "url": null, "healthy": false }
```
