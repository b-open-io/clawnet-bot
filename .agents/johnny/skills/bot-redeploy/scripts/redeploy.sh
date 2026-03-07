#!/usr/bin/env bash
set -euo pipefail

BOT_NAME="${1:-}"

if [ -z "$BOT_NAME" ]; then
  echo '{ "bot": null, "redeployed": false, "url": null, "healthy": false, "error": "bot name argument required" }'
  exit 1
fi

# Resolve workspace: check ~/.agents/<name>/ first, then <repo-root>/.agents/<name>/
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

if [ -d "$HOME/.agents/$BOT_NAME" ]; then
  WORKSPACE="$HOME/.agents/$BOT_NAME"
elif [ -d "$REPO_ROOT/.agents/$BOT_NAME" ]; then
  WORKSPACE="$REPO_ROOT/.agents/$BOT_NAME"
else
  echo "$(jq -n --arg bot "$BOT_NAME" '{ bot: $bot, redeployed: false, url: null, healthy: false, error: "workspace not found" }')"
  exit 1
fi

# Run deploy
if ! (cd "$WORKSPACE" && clawnet bot deploy --name "$BOT_NAME"); then
  echo "$(jq -n --arg bot "$BOT_NAME" '{ bot: $bot, redeployed: false, url: null, healthy: false, error: "deploy command failed" }')"
  exit 1
fi

# Wait for sandbox to initialize
sleep 10

# Look up new URL from peers API
PEERS_API="https://clawnet.sh/api/v1/peers?exclude=none&limit=200"
peers_json=$(curl -s --max-time 15 "$PEERS_API")

new_url=$(echo "$peers_json" | jq -r --arg name "$BOT_NAME" \
  '(if type == "array" then . elif .peers then .peers else [] end)[] | select((.name // .botName // .id) == $name) | .url // empty' 2>/dev/null | head -1)

if [ -z "$new_url" ]; then
  echo "$(jq -n --arg bot "$BOT_NAME" '{ bot: $bot, redeployed: true, url: null, healthy: false, error: "could not find new URL in peers API" }')"
  exit 0
fi

# Check heartbeat
http_code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "${new_url}/api/heartbeat" 2>/dev/null || echo "000")

if [ "$http_code" = "200" ]; then
  healthy="true"
else
  healthy="false"
fi

jq -n \
  --arg bot "$BOT_NAME" \
  --arg url "$new_url" \
  --argjson healthy "$healthy" \
  '{ bot: $bot, redeployed: true, url: $url, healthy: $healthy }'
