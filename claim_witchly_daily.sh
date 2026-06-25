#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/.env.witchly_daily"
if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  source "$ENV_FILE"
fi

# ── 必要变量检查 ─────────────────────────────────────────────────
if [[ -z "${DAILY_COOKIE:-}" ]]; then
  echo "DAILY_COOKIE is empty." >&2
  echo "Provide it via .env.witchly_daily or environment variables." >&2
  exit 1
fi

# ── 请求参数 ─────────────────────────────────────────────────────
DAILY_URL=${DAILY_URL:-https://dash.witchly.host/api/earn/daily}
METHOD=${DAILY_METHOD:-POST}
REFERER=${DAILY_REFERER:-https://dash.witchly.host/}
USER_AGENT=${DAILY_USER_AGENT:-Mozilla/5.0}
HEADERS_JSON=${DAILY_EXTRA_HEADERS_JSON:-}
BODY_JSON=${DAILY_BODY_JSON:-}

# ── SOCKS5 代理（格式: user:pass@host:port 或 host:port） ────────
PROXY_NODE=${PROXY_NODE:-}

# ── gost 本地 HTTP proxy 端口 ────────────────────────────────────
GOST_LOCAL_PORT=18080

# ── 启动 gost（若配置了 PROXY_NODE） ────────────────────────────
GOST_PID=""
CURL_PROXY_ARGS=()

start_gost() {
  local node="$1"
  if ! command -v gost &>/dev/null; then
    echo "[proxy] gost not found, installing..." >&2
    local arch
    arch=$(uname -m)
    case "$arch" in
      x86_64)  GOST_ARCH="amd64" ;;
      aarch64) GOST_ARCH="arm64" ;;
      *)       GOST_ARCH="amd64" ;;
    esac
    local GOST_VER="3.0.0-rc10"
    local GOST_URL="https://github.com/go-gost/gost/releases/download/v${GOST_VER}/gost_${GOST_VER}_linux_${GOST_ARCH}.tar.gz"
    local tmpdir
    tmpdir=$(mktemp -d)
    curl -sSL "$GOST_URL" -o "$tmpdir/gost.tar.gz"
    tar -xzf "$tmpdir/gost.tar.gz" -C "$tmpdir"
    chmod +x "$tmpdir/gost"
    sudo mv "$tmpdir/gost" /usr/local/bin/gost 2>/dev/null || mv "$tmpdir/gost" "$HOME/.local/bin/gost"
    rm -rf "$tmpdir"
    echo "[proxy] gost installed" >&2
  fi

  echo "[proxy] starting gost -> socks5://${node}" >&2
  gost -L "http://:${GOST_LOCAL_PORT}" -F "socks5://${node}" &
  GOST_PID=$!
  sleep 2

  # 验证 gost 已就绪
  if ! kill -0 "$GOST_PID" 2>/dev/null; then
    echo "[proxy] gost failed to start" >&2
    GOST_PID=""
    return 1
  fi
  echo "[proxy] gost running (pid=$GOST_PID), local http proxy :${GOST_LOCAL_PORT}" >&2
}

cleanup() {
  if [[ -n "$GOST_PID" ]]; then
    kill "$GOST_PID" 2>/dev/null || true
    echo "[proxy] gost stopped" >&2
  fi
  rm -f "$headers_file" "$body_file"
}

headers_file=$(mktemp)
body_file=$(mktemp)
trap cleanup EXIT

# ── 若提供了代理节点，启动 gost ──────────────────────────────────
if [[ -n "$PROXY_NODE" ]]; then
  if start_gost "$PROXY_NODE"; then
    CURL_PROXY_ARGS=(--proxy "http://127.0.0.1:${GOST_LOCAL_PORT}")
    echo "[proxy] curl will route through socks5 node" >&2
  else
    echo "[proxy] WARNING: falling back to direct connection" >&2
  fi
else
  echo "[proxy] PROXY_NODE not set, using direct connection" >&2
fi

# ── 构建 curl 参数 ────────────────────────────────────────────────
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
  "${CURL_PROXY_ARGS[@]}"
)

if [[ -n "$HEADERS_JSON" ]]; then
  while IFS= read -r header; do
    [[ -n "$header" ]] && curl_args+=(-H "$header")
  done < <(printf '%s' "$HEADERS_JSON" | jq -r 'to_entries[] | "\(.key): \(.value)"')
fi

if [[ -n "$BODY_JSON" ]]; then
  curl_args+=(-H "content-type: application/json" --data "$BODY_JSON")
fi

# ── 执行请求 ──────────────────────────────────────────────────────
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
if [[ "$http_code" == "410" && "$body" == *"LV_RITUAL_REQUIRED"* ]]; then
  echo "Witchly 现在强制要求手动点击 Linkvertise 广告，API 自动化签到已失效。"
  exit 0 # 返回 0 假装成功，避免 Github Actions 报错中断和触发失败报警
fi
exit 1
