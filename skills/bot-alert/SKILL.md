---
name: bot-alert
description: Notification and alerting patterns for ClawNet bot fleet. Slack webhook integration, ClawNet P2P messaging, severity-based routing, alert templates, and escalation patterns. Use when bots need to send alerts or notifications about fleet health.
metadata:
  author: b-open-io
  version: "1.0.0"
  supports: [agent, bot]
---

# Bot Alert

Alerting and notification patterns for the ClawNet bot fleet, used by Johnny (ClawNet Mechanic).

## Alert Channels

### Slack Webhook

```bash
# Send alert via Slack webhook
curl -X POST "$SLACK_WEBHOOK_URL" \
  -H 'Content-Type: application/json' \
  -d '{
    "text": "Bot Alert: front-desk is offline",
    "blocks": [
      {
        "type": "header",
        "text": { "type": "plain_text", "text": "Bot Alert: Critical" }
      },
      {
        "type": "section",
        "fields": [
          { "type": "mrkdwn", "text": "*Bot:*\nfront-desk" },
          { "type": "mrkdwn", "text": "*Status:*\nOffline" },
          { "type": "mrkdwn", "text": "*Since:*\n2026-03-07 12:00 UTC" },
          { "type": "mrkdwn", "text": "*Action:*\nAuto-restart attempted" }
        ]
      }
    ]
  }'
```

Environment variable: `SLACK_WEBHOOK_URL` must be set.

### ClawNet P2P Messaging

```bash
# Send message to another bot or admin
clawnet message <target-bot-or-user> "Alert: front-desk bot is offline. Auto-restart initiated."

# Send to specific admin
clawnet message admin "Critical: 2 bots down. Manual intervention may be needed."
```

### Log-Only (Internal)

```bash
# For info-level events, just log — no external notification
echo "[INFO] $(date -u +%Y-%m-%dT%H:%M:%SZ) Health check passed for all bots"
```

## Severity-Based Routing

| Severity | Channels | Condition |
|----------|----------|-----------|
| **Critical** | Slack + P2P + Log | Bot offline, data loss risk, security incident |
| **Degraded** | Slack + Log | Slow responses, error rate elevated, memory pressure |
| **Info** | Log only | Routine health checks passed, successful restarts |

Decision logic:

```
if status == "critical":
    send_slack(critical_template)
    send_p2p(admin, critical_message)
    log(critical_message)
elif status == "degraded":
    send_slack(warning_template)
    log(warning_message)
else:
    log(info_message)
```

## Alert Templates

### Critical Alert

```json
{
  "severity": "critical",
  "title": "Bot Down: {bot_name}",
  "message": "{bot_name} is not responding to heartbeat checks.",
  "details": {
    "bot": "{bot_name}",
    "last_seen": "{timestamp}",
    "error": "{error_message}",
    "auto_fix_attempted": true,
    "auto_fix_result": "failed|succeeded"
  },
  "action_required": "Manual intervention needed"
}
```

### Degraded Alert

```json
{
  "severity": "degraded",
  "title": "Bot Degraded: {bot_name}",
  "message": "{bot_name} is responding slowly or with errors.",
  "details": {
    "bot": "{bot_name}",
    "heartbeat_ms": 4200,
    "error_count_1h": 15,
    "memory_usage": "85%"
  },
  "action_required": "Monitor closely, may need restart"
}
```

### Recovery Alert

```json
{
  "severity": "info",
  "title": "Bot Recovered: {bot_name}",
  "message": "{bot_name} is back online and healthy.",
  "details": {
    "bot": "{bot_name}",
    "downtime_duration": "12m 30s",
    "fix_applied": "auto-restart",
    "current_heartbeat_ms": 180
  }
}
```

### Fleet Summary

```json
{
  "severity": "info",
  "title": "Fleet Health Summary",
  "message": "Daily fleet health report",
  "details": {
    "total_bots": 5,
    "healthy": 4,
    "degraded": 1,
    "critical": 0,
    "incidents_24h": 2,
    "auto_fixes_24h": 1
  }
}
```

## Escalation Patterns

```
Auto-fix attempted
├── Success → Send recovery alert (info)
└── Failed
    ├── Retry once after 5 minutes
    │   ├── Success → Send recovery alert (info)
    │   └── Failed → Escalate
    │       ├── Send critical alert to Slack
    │       ├── Send P2P message to admin
    │       └── Log full diagnostic dump
    └── If 3+ bots critical simultaneously
        └── Send fleet emergency alert
            ├── "Multiple bots down — possible infrastructure issue"
            └── Route to Zoro (devops) for infrastructure investigation
```

## Slack Message Formatting

Use Slack Block Kit for rich formatting:

```bash
# Function to send formatted Slack alert
send_slack_alert() {
  local severity="$1"  # critical, degraded, info
  local bot_name="$2"
  local message="$3"
  local color=""

  case "$severity" in
    critical) color="#dc2626" ;;  # red
    degraded) color="#f59e0b" ;;  # amber
    info)     color="#22c55e" ;;  # green
  esac

  curl -s -X POST "$SLACK_WEBHOOK_URL" \
    -H 'Content-Type: application/json' \
    -d "{
      \"attachments\": [{
        \"color\": \"$color\",
        \"blocks\": [
          {
            \"type\": \"header\",
            \"text\": { \"type\": \"plain_text\", \"text\": \"[$severity] $bot_name\" }
          },
          {
            \"type\": \"section\",
            \"text\": { \"type\": \"mrkdwn\", \"text\": \"$message\" }
          },
          {
            \"type\": \"context\",
            \"elements\": [
              { \"type\": \"mrkdwn\", \"text\": \"Reported by Johnny (ClawNet Mechanic) at $(date -u +%H:%M:%S' UTC')\" }
            ]
          }
        ]
      }]
    }"
}
```

## Required Environment Variables

| Variable | Purpose | Required For |
|----------|---------|-------------|
| `SLACK_WEBHOOK_URL` | Slack incoming webhook endpoint | Slack alerts |
| `CLAWNET_ADMIN_ID` | Admin user/bot ID for P2P alerts | P2P messaging |

If `SLACK_WEBHOOK_URL` is not set, fall back to P2P messaging only.
If neither is set, log-only mode with a warning that alerts are not configured.
