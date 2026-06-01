#!/usr/bin/env bash
set -euo pipefail

# M-0Z-6 paper caller context patch.
# Observability-only: sends market/grid context to the paper execution runner.

ROOT_DIR="${BINGX_AGENT_DIR:-}"
if [ -z "$ROOT_DIR" ]; then
  SCRIPT_DIR="${BASH_SOURCE[0]%/*}"
  if [ "$SCRIPT_DIR" = "${BASH_SOURCE[0]}" ]; then
    SCRIPT_DIR="."
  fi
  ROOT_DIR="$(cd "$SCRIPT_DIR" && pwd)"
fi

SCHEMA_VERSION="m0z6-observability-v1"
SYMBOL="${SYMBOL:-BTC-USDT}"
QUANTITY="${PAPER_CYCLE_QUANTITY:-0.001}"
BASE_URL="${PAPER_EXECUTION_BASE_URL:-${OBGATE_PAPER_BASE_URL:-${OBGATE_RUN_CYCLE_BASE_URL:-https://ob-gate.com}}}"
EXECUTION_URL="${PAPER_EXECUTION_URL:-${BASE_URL%/}/api/internal/execution-runner}"
CURL_EXTRA_FLAGS="${CURL_EXTRA_FLAGS:-}"

DECISION_FILE="${LATEST_DECISION_PATH:-$ROOT_DIR/latest_decision.json}"
ORDERBOOK_FILE="${ORDERBOOK_SNAPSHOT_PATH:-$ROOT_DIR/orderbook_snapshot.json}"
FUNDING_FILE="${FUNDING_SNAPSHOT_PATH:-$ROOT_DIR/funding_snapshot.json}"
MARKET_FILE="${MARKET_SNAPSHOT_PATH:-$ROOT_DIR/market_snapshot.json}"

log() {
  printf '[paper_cycle] %s\n' "$*" >&2
}

read_setting_from_file() {
  local file="$1"
  local name="$2"
  local line value
  [ -f "$file" ] || return 1
  line="$(grep -m 1 -E "^[[:space:]]*${name}=" "$file" || true)"
  [ -n "$line" ] || return 1
  value="${line#*=}"
  value="${value%%#*}"
  value="${value#"${value%%[![:space:]]*}"}"
  value="${value%"${value##*[![:space:]]}"}"
  value="${value%\"}"
  value="${value#\"}"
  value="${value%\'}"
  value="${value#\'}"
  [ -n "$value" ] || return 1
  printf '%s\n' "$value"
}

read_setting() {
  local current="$1"
  shift
  local name file value
  if [ -n "$current" ]; then
    printf '%s\n' "$current"
    return 0
  fi
  for name in "$@"; do
    for file in "$ROOT_DIR/.env" "$ROOT_DIR/.env.local" "$ROOT_DIR/dashboard/.env.local"; do
      value="$(read_setting_from_file "$file" "$name" || true)"
      if [ -n "$value" ]; then
        printf '%s\n' "$value"
        return 0
      fi
    done
  done
  return 1
}

json_number() {
  local file="$1"
  shift
  local key line value
  [ -f "$file" ] || return 1
  for key in "$@"; do
    line="$(grep -m 1 -E "\"${key}\"[[:space:]]*:[[:space:]]*-?[0-9]+([.][0-9]+)?([eE][+-]?[0-9]+)?" "$file" || true)"
    if [ -n "$line" ]; then
      value="${line#*:}"
      value="${value%%,*}"
      value="${value//[!0-9eE+.-]/}"
      if [ -n "$value" ]; then
        printf '%s\n' "$value"
        return 0
      fi
    fi
  done
  return 1
}

json_string() {
  local file="$1"
  shift
  local key line value
  [ -f "$file" ] || return 1
  for key in "$@"; do
    line="$(grep -m 1 -E "\"${key}\"[[:space:]]*:[[:space:]]*\"[^\"]*\"" "$file" || true)"
    if [ -n "$line" ]; then
      value="${line#*:}"
      value="${value#*\"}"
      value="${value%%\"*}"
      if [ -n "$value" ]; then
        printf '%s\n' "$value"
        return 0
      fi
    fi
  done
  return 1
}

json_escape() {
  local value="${1:-}"
  value="${value//\\/\\\\}"
  value="${value//\"/\\\"}"
  value="${value//$'\n'/ }"
  value="${value//$'\r'/ }"
  printf '%s' "$value"
}

num_to_milli() {
  local raw="${1:-}"
  local sign="" int frac
  raw="${raw//,/}"
  if [[ "$raw" == -* ]]; then
    sign="-"
    raw="${raw#-}"
  fi
  int="${raw%%.*}"
  frac=""
  if [[ "$raw" == *.* ]]; then
    frac="${raw#*.}"
  fi
  int="${int:-0}"
  frac="${frac}000"
  frac="${frac:0:3}"
  printf '%s%s\n' "$sign" "$((10#$int * 1000 + 10#$frac))"
}

milli_to_num() {
  local milli="$1"
  local sign="" int frac
  if [ "$milli" -lt 0 ]; then
    sign="-"
    milli=$(( -milli ))
  fi
  int=$(( milli / 1000 ))
  frac=$(( milli % 1000 ))
  printf '%s%d.%03d\n' "$sign" "$int" "$frac"
}

pct_from_milli() {
  local lower="$1"
  local upper="$2"
  local mid="$3"
  local diff scaled int frac
  [ "$mid" -gt 0 ] || return 1
  diff=$(( upper - lower ))
  if [ "$diff" -lt 0 ]; then diff=$(( -diff )); fi
  scaled=$(( diff * 100 * 1000000 / mid ))
  int=$(( scaled / 1000000 ))
  frac=$(( scaled % 1000000 ))
  printf '%d.%06d\n' "$int" "$frac"
}

json_num_or_null() {
  local value="${1:-}"
  if [ -n "$value" ]; then
    printf '%s' "$value"
  else
    printf 'null'
  fi
}

json_str_or_null() {
  local value="${1:-}"
  if [ -n "$value" ]; then
    printf '"%s"' "$(json_escape "$value")"
  else
    printf 'null'
  fi
}

build_curl_flags() {
  local flags=()
  local ca_file=""

  if [ -n "$CURL_EXTRA_FLAGS" ]; then
    # shellcheck disable=SC2206
    flags=($CURL_EXTRA_FLAGS)
  fi

  if [ -f /etc/ssl/certs/ca-certificates.crt ]; then
    ca_file="/etc/ssl/certs/ca-certificates.crt"
  elif [ -f /etc/pki/tls/certs/ca-bundle.crt ]; then
    ca_file="/etc/pki/tls/certs/ca-bundle.crt"
  elif [ -f /usr/share/ssl/certs/ca-bundle.crt ]; then
    ca_file="/usr/share/ssl/certs/ca-bundle.crt"
  fi

  if [ -n "$ca_file" ]; then
    flags+=(--cacert "$ca_file")
  elif [[ "$EXECUTION_URL" == https://ob-gate.com/* ]]; then
    # Plesk/chroot CA bundle fallback for internal self-call only.
    flags+=(--insecure)
  fi

  printf '%s\n' "${flags[@]}"
}

KEY="$(read_setting "${RUN_CYCLE_TRIGGER_KEY:-}" RUN_CYCLE_TRIGGER_KEY INTERNAL_API_KEY REFRESH_ENDPOINT_KEY || true)"
if [ -z "$KEY" ]; then
  log "missing RUN_CYCLE_TRIGGER_KEY/INTERNAL_API_KEY/REFRESH_ENDPOINT_KEY"
  exit 2
fi

if [ ! -f "$DECISION_FILE" ]; then
  log "latest decision file missing; no paper request sent"
  exit 0
fi

GRID_LOWER="$(json_number "$DECISION_FILE" grid_lower lower gridLower || true)"
GRID_UPPER="$(json_number "$DECISION_FILE" grid_upper upper gridUpper || true)"
MODE="$(json_string "$DECISION_FILE" market_mode mode grid_mode || true)"
REGIME="$(json_string "$DECISION_FILE" regime market_regime status || true)"
DECISION_SYMBOL="$(json_string "$DECISION_FILE" symbol || true)"
[ -n "$DECISION_SYMBOL" ] && SYMBOL="$DECISION_SYMBOL"

BEST_BID="$(json_number "$ORDERBOOK_FILE" bestBid bid || json_number "$MARKET_FILE" bestBid bid || true)"
BEST_ASK="$(json_number "$ORDERBOOK_FILE" bestAsk ask || json_number "$MARKET_FILE" bestAsk ask || true)"
MID_PRICE="$(json_number "$ORDERBOOK_FILE" midPrice orderbook_mid mid || json_number "$MARKET_FILE" midPrice orderbook_mid mid || true)"
MARK_PRICE="$(json_number "$FUNDING_FILE" markPrice || json_number "$MARKET_FILE" markPrice || true)"
INDEX_PRICE="$(json_number "$FUNDING_FILE" indexPrice || json_number "$MARKET_FILE" indexPrice || true)"
SESSION="$(json_string "$MARKET_FILE" session label name || true)"

GRID_LOWER_MILLI=""
GRID_UPPER_MILLI=""
GRID_MID_MILLI=""
GRID_MID=""
GRID_SPACING_PCT=""
CURRENT_PRICE="$MID_PRICE"

if [ -n "$GRID_LOWER" ] && [ -n "$GRID_UPPER" ]; then
  GRID_LOWER_MILLI="$(num_to_milli "$GRID_LOWER")"
  GRID_UPPER_MILLI="$(num_to_milli "$GRID_UPPER")"
  GRID_MID_MILLI=$(( (GRID_LOWER_MILLI + GRID_UPPER_MILLI) / 2 ))
  GRID_MID="$(milli_to_num "$GRID_MID_MILLI")"
  GRID_SPACING_PCT="$(pct_from_milli "$GRID_LOWER_MILLI" "$GRID_UPPER_MILLI" "$GRID_MID_MILLI" || true)"
fi

if [ -z "$CURRENT_PRICE" ] && [ -n "$BEST_BID" ] && [ -n "$BEST_ASK" ]; then
  bid_milli="$(num_to_milli "$BEST_BID")"
  ask_milli="$(num_to_milli "$BEST_ASK")"
  CURRENT_PRICE="$(milli_to_num $(( (bid_milli + ask_milli) / 2 )))"
fi
if [ -z "$CURRENT_PRICE" ]; then CURRENT_PRICE="$MARK_PRICE"; fi
if [ -z "$CURRENT_PRICE" ]; then CURRENT_PRICE="$INDEX_PRICE"; fi

NO_TRADE_REASON=""
if [ -z "$CURRENT_PRICE" ] || [ -z "$GRID_MID" ]; then
  NO_TRADE_REASON="data_missing"
  log "required price/grid data missing; no paper request sent (reason=$NO_TRADE_REASON)"
  exit 0
fi

CURRENT_MILLI="$(num_to_milli "$CURRENT_PRICE")"
if [ "$CURRENT_MILLI" -lt "$GRID_MID_MILLI" ]; then
  SIDE="BUY"
else
  SIDE="SELL"
fi

EVENT_TS="$(printf '%(%s)T' -1)000"
EVENT_KEY="${SYMBOL}:paper_cycle:${EVENT_TS}"

read -r -d '' BODY <<JSON || true
{
  "scenario": "paper_open",
  "mode": "PAPER",
  "symbol": "$(json_escape "$SYMBOL")",
  "machineState": "READY",
  "market": {
    "symbol": "$(json_escape "$SYMBOL")",
    "timeframe": "5m",
    "closeTs5m": $EVENT_TS,
    "eventKey": "$(json_escape "$EVENT_KEY")",
    "price": {
      "last": $(json_num_or_null "$CURRENT_PRICE"),
      "bid": $(json_num_or_null "$BEST_BID"),
      "ask": $(json_num_or_null "$BEST_ASK"),
      "mark": $(json_num_or_null "$MARK_PRICE"),
      "index": $(json_num_or_null "$INDEX_PRICE"),
      "updatedAtMs": $EVENT_TS
    },
    "sourceFreshnessTag": "FRESH",
    "sourceAgeSec": 0,
    "derivativesFreshnessTag": "FRESH",
    "derivativesAgeSec": 0
  },
  "plannedEntry": {
    "side": "$SIDE",
    "quantity": $(json_num_or_null "$QUANTITY"),
    "entryPrice": null,
    "reason": "paper_cycle grid-mid MARKET paper order"
  },
  "context": {
    "schemaVersion": "$SCHEMA_VERSION",
    "paperObservabilitySchemaVersion": "$SCHEMA_VERSION",
    "gridLower": $(json_num_or_null "$GRID_LOWER"),
    "gridUpper": $(json_num_or_null "$GRID_UPPER"),
    "gridMid": $(json_num_or_null "$GRID_MID"),
    "currentPrice": $(json_num_or_null "$CURRENT_PRICE"),
    "gridSpacingPct": $(json_num_or_null "$GRID_SPACING_PCT"),
    "side": "$SIDE",
    "symbol": "$(json_escape "$SYMBOL")",
    "mode": $(json_str_or_null "$MODE"),
    "regime": $(json_str_or_null "$REGIME"),
    "session": $(json_str_or_null "$SESSION"),
    "paperModeDetected": true,
    "eventTs": $EVENT_TS,
    "noTradeReason": null
  }
}
JSON
if [ -z "$BODY" ]; then
  log "failed to construct execution-runner request body"
  exit 1
fi

mapfile -t CURL_FLAGS < <(build_curl_flags)

response="$(
  curl -sS -w "\nHTTP_STATUS=%{http_code}" \
    "${CURL_FLAGS[@]}" \
    -X POST "$EXECUTION_URL" \
    -H "content-type: application/json" \
    -H "x-run-cycle-key: $KEY" \
    --data-binary "$BODY"
)"
status="${response##*HTTP_STATUS=}"

if [ "$status" -lt 200 ] || [ "$status" -ge 300 ]; then
  log "execution-runner returned http=$status"
  printf '%s\n' "${response%HTTP_STATUS=*}" >&2
  exit 1
fi

log "execution-runner accepted paper context side=$SIDE symbol=$SYMBOL http=$status"
