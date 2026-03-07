---
name: bot-health-monitor
description: Monitor ClawNet bot fleet health. Heartbeat checks, fleet status aggregation, health history tracking with Vercel Blob, severity classification, and formatted status reports. Use when checking on bots, running diagnostics, or generating health reports.
metadata:
  author: b-open-io
  version: "1.0.0"
  supports: [agent, bot]
---

# Bot Health Monitor

Reference skill for monitoring the ClawNet bot fleet. Load this when doing health checks, diagnostics, or generating status reports.

## Storage Layout (Vercel Blob)

Health data is stored per-bot:

```
bots/{bot-name}/health/
├── latest.json          # Most recent check result
├── history/
│   └── {timestamp}.json # Historical check snapshots
└── incidents/
    └── {timestamp}.json # Status change events (healthy→degraded, etc.)
```

## Health Record Format

```json
{
  "botName": "front-desk",
  "timestamp": "2026-03-07T12:00:00Z",
  "status": "healthy|degraded|critical",
  "heartbeatMs": 245,
  "httpStatus": 200,
  "sandboxState": "running",
  "uptime": "3d 14h 22m",
  "checks": {
    "heartbeat": true,
    "logs_clean": true,
    "memory_ok": true,
    "env_vars_set": true
  }
}
```

## Heartbeat Check Protocol

```bash
# Quick heartbeat — returns HTTP status code only
curl -s -o /dev/null -w "%{http_code}" https://<sandbox-url>/api/heartbeat

# Full response with 10s timeout
curl -s --max-time 10 https://<sandbox-url>/api/heartbeat
```

- 200 = healthy
- Non-200 = problem
- No response within 10s = unresponsive (treat as critical)

## Fleet Status Aggregation

```bash
# List all bots with sandbox URLs and states
clawnet bot list
```

For each bot returned:
1. Parse name, sandbox URL, status (running/stopped/error), uptime, last deploy
2. Hit its `/api/heartbeat` endpoint and measure response time
3. Combine both data sources into a health record

## Severity Classification

| Severity | Criteria | Action |
|----------|----------|--------|
| **Critical** | No heartbeat response, sandbox stopped/crashed, HTTP 500 | Immediate repair attempt, alert admin |
| **Degraded** | Heartbeat >5s, error logs present, high memory usage | Schedule maintenance, monitor closely |
| **Healthy** | Heartbeat <2s, clean logs, normal memory | No action needed |

## Quick Check vs Deep Check

**Quick check** (heartbeat only — full fleet in <30 seconds):
- Hit `/api/heartbeat` on each bot
- Classify severity from response time + HTTP status
- Update `latest.json` in Blob

**Deep check** (thorough — 2–5 minutes per bot):
- Heartbeat + response time measurement
- Log scan for errors and warnings
- Memory usage inspection
- Env var presence validation
- Update `latest.json` and append to `history/`

## Automated Check Loop

When running continuous monitoring:

1. Run fleet check every 5 minutes
2. Compare current status to `latest.json` from previous check
3. If status changed (healthy→degraded or degraded→critical), write an incident record to `incidents/` and alert admin
4. Store each result in `history/{timestamp}.json`
5. Retain last 24 hours of detailed history; summarize older snapshots

## Status Report Format

```
## Fleet Health Report - {date}

### Summary
- Total bots: {count}
- Healthy: {count} | Degraded: {count} | Critical: {count}

### Bot Status

| Bot | Status | Heartbeat | Uptime | Issues |
|-----|--------|-----------|--------|--------|
| front-desk | Healthy | 245ms | 3d 14h | None |
| satchmo | Degraded | 4200ms | 1d 2h | Slow response |
| researcher | Critical | N/A | 0m | Sandbox stopped |

### Incidents
- {bot}: {issue description} at {time}

### Recommendations
- {actionable items}
```

## Environment Variables

Requires Vercel Blob access (same token used by the vercel-blob skill):

```
BLOB_READ_WRITE_TOKEN=your_token_here
```
