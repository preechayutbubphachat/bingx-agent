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

# Algorithm v2 hotfix: read the LAST occurrence of a numeric key (newest candle in an
# oldest→newest array). Used for market_snapshot close so we use the latest close, not the first.
json_number_last() {
  local file="$1"
  shift
  local key match value
  [ -f "$file" ] || return 1
  for key in "$@"; do
    match="$(grep -oE "\"${key}\"[[:space:]]*:[[:space:]]*-?[0-9]+([.][0-9]+)?([eE][+-]?[0-9]+)?" "$file" | tail -n 1 || true)"
    if [ -n "$match" ]; then
      value="${match#*:}"
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
  local ca_file=""

  CURL_FLAGS=()

  if [ -n "$CURL_EXTRA_FLAGS" ]; then
    # shellcheck disable=SC2206
    CURL_FLAGS=($CURL_EXTRA_FLAGS)
  fi

  if [ -f /etc/ssl/certs/ca-certificates.crt ]; then
    ca_file="/etc/ssl/certs/ca-certificates.crt"
  elif [ -f /etc/pki/tls/certs/ca-bundle.crt ]; then
    ca_file="/etc/pki/tls/certs/ca-bundle.crt"
  elif [ -f /usr/share/ssl/certs/ca-bundle.crt ]; then
    ca_file="/usr/share/ssl/certs/ca-bundle.crt"
  fi

  if [ -n "$ca_file" ]; then
    CURL_FLAGS+=(--cacert "$ca_file")
  elif [[ "$EXECUTION_URL" == https://ob-gate.com/* ]]; then
    # Plesk/chroot CA bundle fallback for internal self-call only.
    CURL_FLAGS+=(--insecure)
  fi
}

audit_log_path() {
  local audit_root log_dir

  if [ -n "${EXECUTION_AUDIT_LOG_PATH:-}" ]; then
    printf '%s\n' "$EXECUTION_AUDIT_LOG_PATH"
    return 0
  fi

  # write into the SAME execution-runner journal root as FILL_RESULT so
  # `grep -R PAPER_NO_TRADE <root>/tmp/execution-runner` works and the reader scans it.
  audit_root="${EXECUTION_AUDIT_ROOT_DIR:-$ROOT_DIR}"
  log_dir="$audit_root/tmp/execution-runner"
  mkdir -p "$log_dir" 2>/dev/null || return 1
  printf '%s/paper_no_trade.jsonl\n' "$log_dir"
}

append_no_trade_audit() {
  local primary_reason="$1"
  local range_status="$2"
  local secondary_reason="${3:-}"
  local tertiary_reason="${4:-}"
  local audit_file audit_body

  audit_file="$(audit_log_path || true)"
  if [ -z "$audit_file" ]; then
    log "could not resolve audit log path for no-trade event"
    return 0
  fi

  read -r -d '' audit_body <<JSON || true
{"schema_version":"execution_audit_v1","ts":$EVENT_TS,"type":"PAPER_NO_TRADE","symbol":"$(json_escape "$SYMBOL")","mode":"PAPER","eventKey":"$(json_escape "$EVENT_KEY")","payload":{"decision":{"side":"NONE","quantity":null,"kind":"NO_TRADE"},"context":{"schemaVersion":"$SCHEMA_VERSION","paperObservabilitySchemaVersion":"$SCHEMA_VERSION","gridLower":$(json_num_or_null "$GRID_LOWER"),"gridUpper":$(json_num_or_null "$GRID_UPPER"),"gridMid":$(json_num_or_null "$GRID_MID"),"currentPrice":$(json_num_or_null "$CURRENT_PRICE"),"gridSpacingPct":$(json_num_or_null "$GRID_SPACING_PCT"),"side":"NONE","symbol":"$(json_escape "$SYMBOL")","mode":$(json_str_or_null "$MODE"),"market_mode":$(json_str_or_null "$MODE"),"regime":$(json_str_or_null "$REGIME"),"session":$(json_str_or_null "$SESSION"),"paperModeDetected":true,"eventTs":$EVENT_TS,"timestamp":"$(date -u '+%Y-%m-%dT%H:%M:%SZ')","noTradeReason":"$(json_escape "$primary_reason")","reason":"$(json_escape "$primary_reason")","reasons":["$(json_escape "$primary_reason")","$(json_escape "$secondary_reason")","$(json_escape "$tertiary_reason")"],"rangeStatus":"$(json_escape "$range_status")","state":"$(json_escape "$range_status")","priceVsGrid":$(json_str_or_null "${PRICE_VS_GRID:-}"),"decisionPrice":$(json_num_or_null "${DECISION_PRICE:-}"),"snapshotPrice":$(json_num_or_null "${SNAPSHOT_CLOSE:-}"),"priceDriftPct":$(json_num_or_null "${PRICE_DRIFT_PCT:-}"),"buyFillCount":$(json_num_or_null "${BUY_FILL_COUNT:-}"),"sellFillCount":$(json_num_or_null "${SELL_FILL_COUNT:-}")}}}
JSON

  if [ -n "$audit_body" ]; then
    printf '%s\n' "$audit_body" >> "$audit_file" || log "could not append no-trade audit event"
  fi
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

# Algorithm v2: market_snapshot CLOSE is the source of truth for the range/stale gate.
# orderbook mid (and the price the decision was built on) is kept separately to detect drift.
# prefer an explicit "latest" scalar; else take the LAST close in the candle array (newest)
SNAPSHOT_CLOSE="$(json_number "$MARKET_FILE" last_close lastClose latest_close lastPrice latestClose || json_number_last "$MARKET_FILE" close c || true)"
DECISION_PRICE="$MID_PRICE"

GRID_LOWER_MILLI=""
GRID_UPPER_MILLI=""
GRID_MID_MILLI=""
GRID_MID=""
GRID_SPACING_PCT=""
# prefer fresh snapshot close; fall back to orderbook mid / bid-ask / mark / index
CURRENT_PRICE="$SNAPSHOT_CLOSE"
if [ -z "$CURRENT_PRICE" ]; then CURRENT_PRICE="$MID_PRICE"; fi

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

EVENT_TS="$(printf '%(%s)T' -1)000"
EVENT_KEY="${SYMBOL}:paper_cycle:${EVENT_TS}"

# priceVsGrid (computed from latest snapshot close) — used in every no-trade audit event
CURRENT_MILLI="$(num_to_milli "$CURRENT_PRICE")"
PRICE_VS_GRID=""
if [ -n "$GRID_LOWER_MILLI" ] && [ -n "$GRID_UPPER_MILLI" ]; then
  if [ "$CURRENT_MILLI" -lt "$GRID_LOWER_MILLI" ]; then
    PRICE_VS_GRID="BELOW_GRID"
  elif [ "$CURRENT_MILLI" -gt "$GRID_UPPER_MILLI" ]; then
    PRICE_VS_GRID="ABOVE_GRID"
  else
    PRICE_VS_GRID="INSIDE_GRID"
  fi
fi

# Part D — stale decision / price-source mismatch gate (drift between decision price and fresh close)
PRICE_DRIFT_PCT=""
if [ -n "$DECISION_PRICE" ] && [ -n "$SNAPSHOT_CLOSE" ]; then
  dprice_milli="$(num_to_milli "$DECISION_PRICE")"
  sclose_milli="$(num_to_milli "$SNAPSHOT_CLOSE")"
  if [ "$sclose_milli" -gt 0 ]; then
    drift_milli=$(( dprice_milli - sclose_milli ))
    if [ "$drift_milli" -lt 0 ]; then drift_milli=$(( -drift_milli )); fi
    drift_scaled=$(( drift_milli * 100 * 1000 / sclose_milli ))  # pct x1000 (3 decimals)
    PRICE_DRIFT_PCT="$(milli_to_num "$drift_scaled")"
    max_drift_scaled="${PAPER_MAX_PRICE_DRIFT_SCALED:-1000}"       # 1000 = 1.000%
    if [ "$drift_scaled" -gt "$max_drift_scaled" ]; then
      NO_TRADE_REASON="stale_decision_or_price_mismatch"
      append_no_trade_audit "$NO_TRADE_REASON" "STALE_DATA" "decision_vs_snapshot_drift" "drift_pct=$PRICE_DRIFT_PCT"
      log "stale/price mismatch; no paper order (reason=$NO_TRADE_REASON decisionPrice=$DECISION_PRICE snapshotClose=$SNAPSHOT_CLOSE driftPct=$PRICE_DRIFT_PCT)"
      exit 0
    fi
  fi
fi

# Part C — one-sided exposure guardrail (best-effort count from paper fills journal)
BUY_FILL_COUNT=0
SELL_FILL_COUNT=0
FILLS_DIR="${EXECUTION_AUDIT_ROOT_DIR:-$ROOT_DIR}/tmp/execution-runner"
if [ -d "$FILLS_DIR" ]; then
  BUY_FILL_COUNT="$(grep -rhoE '"side"[[:space:]]*:[[:space:]]*"BUY"' "$FILLS_DIR" 2>/dev/null | grep -c . || true)"
  SELL_FILL_COUNT="$(grep -rhoE '"side"[[:space:]]*:[[:space:]]*"SELL"' "$FILLS_DIR" 2>/dev/null | grep -c . || true)"
fi
BUY_FILL_COUNT="${BUY_FILL_COUNT:-0}"
SELL_FILL_COUNT="${SELL_FILL_COUNT:-0}"
MAX_ONE_SIDED="${PAPER_MAX_ONE_SIDED_FILLS:-5}"
if [ "$BUY_FILL_COUNT" -gt "$MAX_ONE_SIDED" ] && [ "$SELL_FILL_COUNT" -eq 0 ]; then
  NO_TRADE_REASON="one_sided_buy_limit"
  append_no_trade_audit "$NO_TRADE_REASON" "PAUSE_EXPOSURE_LIMIT" "buy=$BUY_FILL_COUNT" "sell=$SELL_FILL_COUNT"
  log "one-sided BUY exposure cap; no paper BUY (buy=$BUY_FILL_COUNT sell=$SELL_FILL_COUNT max=$MAX_ONE_SIDED)"
  exit 0
fi
if [ "$SELL_FILL_COUNT" -gt "$MAX_ONE_SIDED" ] && [ "$BUY_FILL_COUNT" -eq 0 ]; then
  NO_TRADE_REASON="one_sided_sell_limit"
  append_no_trade_audit "$NO_TRADE_REASON" "PAUSE_EXPOSURE_LIMIT" "buy=$BUY_FILL_COUNT" "sell=$SELL_FILL_COUNT"
  log "one-sided SELL exposure cap; no paper SELL (buy=$BUY_FILL_COUNT sell=$SELL_FILL_COUNT max=$MAX_ONE_SIDED)"
  exit 0
fi

CURRENT_MILLI="$(num_to_milli "$CURRENT_PRICE")"
if [ -n "$GRID_LOWER_MILLI" ] && [ "$CURRENT_MILLI" -lt "$GRID_LOWER_MILLI" ]; then
  NO_TRADE_REASON="price_below_grid_lower"
  append_no_trade_audit "$NO_TRADE_REASON" "BELOW_GRID" "range_breakdown" "waiting_for_regrid_or_reentry"
  log "price below grid_lower; no paper BUY sent (reason=$NO_TRADE_REASON currentPrice=$CURRENT_PRICE grid_lower=$GRID_LOWER grid_upper=$GRID_UPPER gridMid=$GRID_MID mode=${MODE:-unknown})"
  exit 0
fi

if [ -n "$GRID_UPPER_MILLI" ] && [ "$CURRENT_MILLI" -gt "$GRID_UPPER_MILLI" ]; then
  NO_TRADE_REASON="price_above_grid_upper"
  append_no_trade_audit "$NO_TRADE_REASON" "ABOVE_GRID" "range_breakout" ""
  log "price above grid_upper; no inappropriate paper order sent (reason=$NO_TRADE_REASON currentPrice=$CURRENT_PRICE grid_lower=$GRID_LOWER grid_upper=$GRID_UPPER gridMid=$GRID_MID mode=${MODE:-unknown})"
  exit 0
fi

if [ "$CURRENT_MILLI" -lt "$GRID_MID_MILLI" ]; then
  SIDE="BUY"
else
  SIDE="SELL"
fi

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

CURL_FLAGS=()
build_curl_flags

response="$(
  curl -sS -w "\nHTTP_STATUS=%{http_code}" \
    "${CURL_FLAGS[@]}" \
    -X POST "$EXECUTION_URL" \
    -H "content-type: application/json" \
    -H "x-run-cycle-key: $KEY" \
    --data-raw "$BODY"
)"
status="${response##*HTTP_STATUS=}"

if [ "$status" -lt 200 ] || [ "$status" -ge 300 ]; then
  log "execution-runner returned http=$status"
  printf '%s\n' "${response%HTTP_STATUS=*}" >&2
  exit 1
fi

log "execution-runner accepted paper context side=$SIDE symbol=$SYMBOL http=$status"
