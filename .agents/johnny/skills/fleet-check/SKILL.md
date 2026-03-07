---
name: fleet-check
description: |-
  Check the health of all deployed ClawNet bots. This skill should be used when
  Johnny needs to monitor fleet status, detect dead bots, or report on the health
  of sandbox-deployed instances. Hits the ClawNet peers API and checks each bot's
  heartbeat endpoint.
version: 1.0.0
---

# fleet-check

Queries the ClawNet peers API for all running bots, then checks the `/api/heartbeat` endpoint of each bot that has a URL. Returns a JSON array summarizing health status across the fleet.

## Usage

```bash
bash scripts/check.sh
```

No arguments required. The script fetches all peers with `status=running` from the ClawNet API and probes each one.

## Output

A JSON array written to stdout:

```json
[
  { "botName": "martha", "url": "https://sb-abc123.vercel.run", "healthy": true, "lastSeen": "2026-03-07T12:00:00Z" },
  { "botName": "jerry",  "url": "https://sb-xyz789.vercel.run", "healthy": false, "lastSeen": "2026-03-07T11:45:00Z" }
]
```

- `healthy: true` -- heartbeat returned HTTP 200
- `healthy: false` -- heartbeat timed out, connection refused, or returned non-200
- `lastSeen` -- the `last_seen` timestamp from the ClawNet peers API (not from the bot itself)

Bots without a URL in the peers API are skipped.
