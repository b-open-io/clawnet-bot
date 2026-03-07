---
name: bot-repair
description: Codified repair playbooks for ClawNet bots. Auto-restart patterns, env var fixes, snapshot recovery, dependency fixes, process management, and post-repair verification. Use when a bot is broken and needs fixing.
metadata:
  author: b-open-io
  version: "1.0.0"
  supports: [agent, bot]
---

# Bot Repair Playbooks

Practical repair procedures for broken ClawNet bots. Follow the decision tree to pick the right playbook, then always run post-repair verification.

## Repair Decision Tree

```
Bot not responding
├── Check heartbeat
│   ├── Timeout → Playbook 1 (restart)
│   │   ├── Fixed? → Done
│   │   └── Still down → Check logs
│   │       ├── Missing module → Playbook 3 (dependency fix)
│   │       ├── Invalid key → Playbook 2 (env var fix)
│   │       ├── Out of memory → Playbook 5 (resource fix)
│   │       ├── Network error → Playbook 6 (connectivity check)
│   │       └── Unknown error → Playbook 4 (full redeploy)
│   └── Returns error code
│       ├── 500 → Check logs for stack trace
│       └── 503 → Sandbox starting up, wait and retry
└── Bot responds but degraded
    ├── Slow responses → Playbook 5
    ├── Intermittent errors → Check logs, may need restart
    └── Partial functionality → Check env vars and dependencies
```

## Playbook 1: Simple Restart

**When**: Bot stopped responding, no obvious error cause

```bash
# Restart the sandbox
clawnet bot restart <bot-name>

# Wait for it to come back up (give it 30 seconds)
sleep 30

# Verify heartbeat
curl -s --max-time 10 https://<sandbox-url>/api/heartbeat
```

**Success criteria**: Heartbeat returns 200 within 60 seconds of restart.

## Playbook 2: Environment Variable Fix

**When**: "undefined" errors, "Invalid API key", missing config

```bash
# Check current env vars
clawnet bot exec <bot-name> 'env | sort'

# Check specific vars (show only first 8 chars for security)
clawnet bot exec <bot-name> 'echo $OPENAI_API_KEY | head -c 8'
clawnet bot exec <bot-name> 'echo $ANTHROPIC_API_KEY | head -c 8'

# Set missing or update env var
clawnet bot env set <bot-name> VAR_NAME "value"

# Remove a bad env var
clawnet bot env remove <bot-name> VAR_NAME

# Restart after env change
clawnet bot restart <bot-name>
```

**IMPORTANT**: Never print full API keys. Only show first 8 characters to confirm they're set.

## Playbook 3: Dependency Fix

**When**: "Module not found", "ERR_MODULE_NOT_FOUND", package errors

```bash
# Check package.json
clawnet bot exec <bot-name> 'cat /app/package.json'

# Check if node_modules exists and looks healthy
clawnet bot exec <bot-name> 'ls -la /app/node_modules/.package-lock.json'

# Reinstall dependencies
clawnet bot exec <bot-name> 'cd /app && bun install'

# If bun install fails, try cleaning first
clawnet bot exec <bot-name> 'cd /app && rm -rf node_modules && bun install'

# Restart after dependency fix
clawnet bot restart <bot-name>
```

## Playbook 4: Snapshot Recovery (Full Redeploy)

**When**: Bot is totally wedged, previous fixes didn't work, or code is corrupted

```bash
# Stop the broken bot
clawnet bot stop <bot-name>

# Redeploy from template
clawnet bot deploy --name <bot-name> --yes

# Verify the new deployment
curl -s --max-time 30 https://<sandbox-url>/api/heartbeat

# Check logs for clean startup
clawnet bot logs <bot-name>
```

**Warning**: Redeploying resets the sandbox. Any in-sandbox state not stored in Vercel Blob will be lost.

## Playbook 5: Memory/Resource Issues

**When**: "heap out of memory", high memory warnings, slow responses

```bash
# Check memory usage
clawnet bot exec <bot-name> 'ps aux --sort=-%mem | head -5'

# Check disk usage
clawnet bot exec <bot-name> 'df -h /app'

# Kill runaway processes if any
clawnet bot exec <bot-name> 'kill -9 <pid>'

# Restart with clean state
clawnet bot restart <bot-name>
```

## Playbook 6: Network/Connectivity Issues

**When**: "ECONNREFUSED", "ETIMEDOUT", "ENOTFOUND"

```bash
# Test DNS resolution from inside sandbox
clawnet bot exec <bot-name> 'nslookup api.openai.com'

# Test external connectivity
clawnet bot exec <bot-name> 'curl -s --max-time 5 https://api.openai.com'

# Check if the issue is specific to one external service
clawnet bot exec <bot-name> 'curl -s --max-time 5 https://api.anthropic.com'
```

If external services are down, this is not a bot issue — document and wait.

## Post-Repair Verification (ALWAYS DO THIS)

After ANY repair, run this verification sequence:

```bash
# 1. Heartbeat check
curl -s --max-time 10 https://<sandbox-url>/api/heartbeat

# 2. Check logs for new errors (last 50 lines)
clawnet bot logs <bot-name> | tail -50

# 3. Fleet status to confirm it shows healthy
clawnet bot list

# 4. Wait 2 minutes and check again (catch delayed failures)
sleep 120
curl -s --max-time 10 https://<sandbox-url>/api/heartbeat
```

**A repair is not complete until verification passes.** If verification fails, escalate to the next playbook or alert the admin.
