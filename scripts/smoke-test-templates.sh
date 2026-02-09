#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEMPLATES_DIR="$ROOT_DIR/templates"
WORK_DIR="$(mktemp -d "${TMPDIR:-/tmp}/clawnet-template-smoke-XXXXXX")"

cleanup() {
	if [[ -n "${ACTIVE_PID:-}" ]]; then
		kill "$ACTIVE_PID" >/dev/null 2>&1 || true
		wait "$ACTIVE_PID" 2>/dev/null || true
	fi
	rm -rf "$WORK_DIR"
}

trap cleanup EXIT

wait_for_heartbeat() {
	local port="$1"
	local server_log="$2"
	for _ in $(seq 1 60); do
		if curl -fsS "http://127.0.0.1:${port}/api/heartbeat" >/dev/null 2>&1; then
			return 0
		fi
		sleep 0.25
	done

	echo "Failed to start service on port ${port}." >&2
	cat "$server_log" >&2
	return 1
}

assert_contains() {
	local haystack="$1"
	local needle="$2"
	if [[ "$haystack" != *"$needle"* ]]; then
		echo "Expected response to contain: ${needle}" >&2
		echo "Actual response: ${haystack}" >&2
		return 1
	fi
}

run_template() {
	local template="$1"
	local port="$2"

	local work_template_dir="$WORK_DIR/$template"
	cp -R "$TEMPLATES_DIR/$template" "$work_template_dir"

	pushd "$work_template_dir" >/dev/null
	bun install --silent >/dev/null
	bunx tsc --noEmit >/dev/null

	local wif=""
	if [[ "$template" == "blockchain" || "$template" == "moltbook" ]]; then
		wif="$(bun --eval 'import { PrivateKey } from "@bsv/sdk"; console.log(PrivateKey.fromRandom().toWif())')"
	fi

	if [[ "$template" == "vercel-ai" ]]; then
		OPENAI_API_KEY="" PORT="$port" bun run src/index.ts >server.log 2>&1 &
	elif [[ -n "$wif" ]]; then
		SIGMA_MEMBER_PRIVATE_KEY="$wif" PORT="$port" bun run src/index.ts >server.log 2>&1 &
	else
		PORT="$port" bun run src/index.ts >server.log 2>&1 &
	fi
	ACTIVE_PID="$!"
	popd >/dev/null

	wait_for_heartbeat "$port" "$work_template_dir/server.log"

	local response
	case "$template" in
		minimal)
			response="$(curl -fsS -X POST "http://127.0.0.1:${port}/api/agent" -H "Content-Type: application/json" -d '{"message":"help me deploy"}')"
			assert_contains "$response" '"success":true'
			assert_contains "$response" '"intent":"deployment"'
			;;
		blockchain)
			response="$(curl -fsS -X POST "http://127.0.0.1:${port}/api/agent" -H "Content-Type: application/json" -d '{"action":"signMessage","message":"smoke test"}')"
			assert_contains "$response" '"success":true'
			assert_contains "$response" '"signature":"'
			;;
		moltbook)
			response="$(curl -fsS -X POST "http://127.0.0.1:${port}/api/agent" -H "Content-Type: application/json" -d '{"eventType":"mention","author":"alice","text":"can you help?"}')"
			assert_contains "$response" '"success":true'
			assert_contains "$response" '"action":"reply"'
			;;
		vercel-ai)
			response="$(curl -sS -X POST "http://127.0.0.1:${port}/api/agent" -H "Content-Type: application/json" -d '{"message":"hello"}' -w $'\n%{http_code}')"
			local status="${response##*$'\n'}"
			local body="${response%$'\n'*}"
			if [[ "$status" != "503" ]]; then
				echo "Expected vercel-ai to return 503 when OPENAI_API_KEY is unset, got ${status}." >&2
				echo "Response: ${body}" >&2
				return 1
			fi
			assert_contains "$body" "OPENAI_API_KEY"
			;;
		*)
			echo "Unknown template: ${template}" >&2
			return 1
			;;
	esac

	kill "$ACTIVE_PID" >/dev/null 2>&1 || true
	wait "$ACTIVE_PID" 2>/dev/null || true
	ACTIVE_PID=""

	echo "[ok] ${template}"
}

ACTIVE_PID=""
run_template "minimal" 4111
run_template "blockchain" 4112
run_template "moltbook" 4113
run_template "vercel-ai" 4114

echo "All template smoke tests passed."
