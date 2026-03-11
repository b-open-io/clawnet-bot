#!/usr/bin/env bash
set -euo pipefail

# Boot script for ClawNet bots running in Vercel Sandboxes.
# Authenticates with Infisical via REST API, fetches secrets from
# one or more folder paths, exports them as env vars, then starts bun.
#
# Required env vars:
#   INFISICAL_CLIENT_ID      Machine identity client ID
#   INFISICAL_CLIENT_SECRET   Machine identity client secret
#   INFISICAL_PROJECT_ID      Infisical project (workspace) ID
#   INFISICAL_ENV             Environment slug (e.g. "prod")
#   INFISICAL_PATHS           Comma-separated secret paths (e.g. "/shared,/clark")
#   WORKSPACE                 Working directory for the bot

INFISICAL_API="https://app.infisical.com"

# --- Authenticate via Universal Auth ---
AUTH_RESPONSE=$(curl -sf -X POST "${INFISICAL_API}/api/v1/auth/universal-auth/login" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode "clientId=${INFISICAL_CLIENT_ID}" \
  --data-urlencode "clientSecret=${INFISICAL_CLIENT_SECRET}")

TOKEN=$(echo "$AUTH_RESPONSE" | jq -r '.accessToken')

if [ -z "$TOKEN" ] || [ "$TOKEN" = "null" ]; then
  echo "ERROR: Infisical authentication failed" >&2
  echo "$AUTH_RESPONSE" >&2
  exit 1
fi

# --- Fetch and export secrets from each path ---
IFS=',' read -ra PATHS <<< "$INFISICAL_PATHS"
for SECRET_PATH in "${PATHS[@]}"; do
  SECRETS=$(curl -sf "${INFISICAL_API}/api/v3/secrets/raw?workspaceId=${INFISICAL_PROJECT_ID}&environment=${INFISICAL_ENV}&secretPath=${SECRET_PATH}" \
    -H "Authorization: Bearer ${TOKEN}")

  while IFS= read -r line; do
    if [ -n "$line" ]; then
      export "$line"
    fi
  done < <(echo "$SECRETS" | jq -r '.secrets[]? | "\(.secretKey)=\(.secretValue)"')
done

# --- Start the bot ---
cd "${WORKSPACE:-/app}"
exec bun run src/index.ts
