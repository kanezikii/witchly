#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/.env.witchly_daily"

if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  source "$ENV_FILE"
fi

if [[ -z "${DAILY_COOKIE:-}" ]]; then
  echo "DAILY_COOKIE is empty." >&2
  echo "Provide it via .env.witchly_daily or environment variables." >&2
  exit 1
fi

DAILY_URL=${DAILY_URL:-https://dash.witchly.host/api/earn/daily}
METHOD=${DAILY_METHOD:-POST}
REFERER=${DAILY_REFERER:-https://dash.witchly.host/}
USER_AGENT=${DAILY_USER_AGENT:-Mozilla/5.0}
HEADERS_JSON=${DAILY_EXTRA_HEADERS_JSON:-}
BODY_JSON=${DAILY_BODY_JSON:-}

headers_file=$(mktemp)
body_file=$(mktemp)
trap 'rm -f "$headers_file" "$body_file"' EXIT

curl_args=(
  -sS
  -X "$METHOD"
  "$DAILY_URL"
  -H "cookie: $DAILY_COOKIE"
  -H "referer: $REFERER"
  -H "user-agent: $USER_AGENT"
  -D "$headers_file"
  -o "$body_file"
  -w "%{http_code}"
)

if [[ -n "$HEADERS_JSON" ]]; then
  while IFS= read -r header; do
    [[ -n "$header" ]] && curl_args+=(-H "$header")
  done < <(printf '%s' "$HEADERS_JSON" | jq -r 'to_entries[] | "\(.key): \(.value)"')
fi

if [[ -n "$BODY_JSON" ]]; then
  curl_args+=(-H "content-type: application/json" --data "$BODY_JSON")
fi

http_code=$(curl "${curl_args[@]}")
body=$(cat "$body_file")

echo "HTTP $http_code"
[[ -n "$body" ]] && echo "$body"

if [[ "$http_code" == "200" ]]; then
  exit 0
fi

if [[ "$body" == *"Too early"* || "$body" == *"already"* ]]; then
  exit 0
fi

if [[ "$http_code" == "400" && "$body" == *'"error":"Ritual failed"'* ]]; then
  exit 0
fi

exit 1
