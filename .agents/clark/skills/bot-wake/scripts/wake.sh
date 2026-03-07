#!/usr/bin/env bash
set -euo pipefail

BOT_NAME="${1:-}"

if [ -z "$BOT_NAME" ]; then
  echo '{ "bot": null, "status": "error", "url": null, "healthy": false, "error": "bot name argument required" }'
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REDEPLOY_SCRIPT="$SCRIPT_DIR/../../bot-redeploy/scripts/redeploy.sh"

PEERS_API="https://clawnet.sh/api/v1/peers?status=running&limit=200"
peers_json=$(curl -s --max-time 15 "$PEERS_API")

# Look up bot URL from peers API
bot_url=$(echo "$peers_json" | jq -r --arg name "$BOT_NAME" \
  '(if type == "array" then . elif .peers then .peers else [] end)[] | select((.name // .botName // .id) == $name) | .url // empty' 2>/dev/null | head -1)

if [ -z "$bot_url" ]; then
  # Bot not found in peers — attempt redeploy
  redeploy_result=$(bash "$REDEPLOY_SCRIPT" "$BOT_NAME")
  echo "$redeploy_result" | jq '. + { status: "redeployed" }'
  exit 0
fi

# Check heartbeat
http_code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "${bot_url}/api/heartbeat" 2>/dev/null || echo "000")

if [ "$http_code" = "200" ]; then
  jq -n --arg bot "$BOT_NAME" --arg url "$bot_url" \
    '{ bot: $bot, status: "already_running", url: $url }'
else
  # Unhealthy — redeploy
  redeploy_result=$(bash "$REDEPLOY_SCRIPT" "$BOT_NAME")
  echo "$redeploy_result" | jq '. + { status: "redeployed" }'
fi
