#!/usr/bin/env bash
set -euo pipefail

PEERS_API="https://clawnet.sh/api/v1/peers?status=running&limit=200"

# Fetch peers list
peers_json=$(curl -s --max-time 15 "$PEERS_API")

if [ -z "$peers_json" ] || [ "$peers_json" = "null" ]; then
  echo "[]"
  exit 0
fi

results="[]"

# Iterate over each peer that has a url field
while IFS= read -r peer; do
  bot_name=$(echo "$peer" | jq -r '.name // .botName // .id // "unknown"')
  url=$(echo "$peer" | jq -r '.url // empty')
  last_seen=$(echo "$peer" | jq -r '.last_seen // .lastSeen // ""')

  if [ -z "$url" ]; then
    continue
  fi

  # Check heartbeat with 5-second timeout
  http_code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "${url}/api/heartbeat" 2>/dev/null || echo "000")

  if [ "$http_code" = "200" ]; then
    healthy="true"
  else
    healthy="false"
  fi

  entry=$(jq -n \
    --arg botName "$bot_name" \
    --arg url "$url" \
    --argjson healthy "$healthy" \
    --arg lastSeen "$last_seen" \
    '{ botName: $botName, url: $url, healthy: $healthy, lastSeen: $lastSeen }')

  results=$(echo "$results" | jq ". + [$entry]")

done < <(echo "$peers_json" | jq -c 'if type == "array" then .[] elif .peers then .peers[] else empty end' 2>/dev/null)

echo "$results"
