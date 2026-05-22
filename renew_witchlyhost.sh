#!/bin/zsh

set -euo pipefail

SCRIPT_DIR=${0:A:h}
ENV_FILE="$SCRIPT_DIR/.env.witchlyhost"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing config: $ENV_FILE" >&2
  exit 1
fi

source "$ENV_FILE"

if [[ -z "${RENEW_URL:-}" || -z "${RENEW_COOKIE:-}" ]]; then
  echo "RENEW_URL or RENEW_COOKIE is empty" >&2
  exit 1
fi

headers_file=$(mktemp)
body_file=$(mktemp)
trap 'rm -f "$headers_file" "$body_file"' EXIT

http_code=$(
  curl -sS -X POST "$RENEW_URL" \
    -H "cookie: $RENEW_COOKIE" \
    -D "$headers_file" \
    -o "$body_file" \
    -w '%{http_code}'
)

body=$(cat "$body_file")

if [[ "$http_code" == "200" ]]; then
  echo "Renewal request succeeded."
  [[ -n "$body" ]] && echo "$body"
  exit 0
fi

if [[ "$http_code" == "400" && "$body" == *"Too early"* ]]; then
  echo "Renewal skipped: $body"
  exit 0
fi

echo "Renewal request failed with HTTP $http_code." >&2
[[ -n "$body" ]] && echo "$body" >&2
exit 1
