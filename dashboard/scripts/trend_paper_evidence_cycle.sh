#!/usr/bin/env bash
# ============================================================================
# trend_paper_evidence_cycle.sh  (Phase T-3H-4-c)
# ----------------------------------------------------------------------------
# Calls the internal evidence runner route ONCE: POST {"action":"run_once"}.
#
# SAFETY (read before use):
#   - paper-only            : never live trading, never real money
#   - no live trading       : this script cannot place real orders
#   - no exchange order     : never calls BingX private/execution API
#   - no cron installed      : this script does NOT install or enable cron
#   - single run only        : no loop, no auto-retry
#   - reads token from env   : never hardcodes a secret
#
# For ACTUAL evidence collection BOTH server env gates must be true (operator sets them):
#     TREND_PAPER_SIMULATION_ENABLED=true
#     TREND_PAPER_EVIDENCE_RUNNER_ENABLED=true
#   While either is false the route returns evidencePhase=DISABLED and does nothing.
#
# This script: does NOT edit env, does NOT touch paper_cycle.sh, does NOT create
# a session directly, does NOT unlock M-0B, does NOT activate Phase 2-B.
# ============================================================================
set -euo pipefail

HOST="${TREND_PAPER_EVIDENCE_HOST:-${HOST:-https://ob-gate.com}}"
TOKEN="${RUN_CYCLE_TRIGGER_KEY:-${INTERNAL_API_KEY:-${REFRESH_ENDPOINT_KEY:-}}}"
ROUTE="/api/internal/trend-paper-evidence-cycle"
URL="${HOST%/}${ROUTE}"

if [[ -z "${TOKEN}" ]]; then
  echo "trend_paper_evidence_cycle: missing RUN_CYCLE_TRIGGER_KEY (or INTERNAL_API_KEY / REFRESH_ENDPOINT_KEY)" >&2
  exit 2
fi

# Single POST. -f makes curl fail (non-zero) on HTTP errors incl. 401 unauthorized.
response="$(curl -fsS -X POST "${URL}" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  --data '{"action":"run_once"}')" || {
  echo "trend_paper_evidence_cycle: route call failed (unauthorized / network / HTTP error)" >&2
  exit 3
}

# Parse + print compact summary, and fail-closed on any unsafe / malformed signal.
printf '%s' "${response}" | node -e '
let raw = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (c) => { raw += c; });
process.stdin.on("end", () => {
  let d;
  try { d = JSON.parse(raw || "{}"); } catch { console.error("malformed response"); process.exit(4); }
  const summary = {
    action: d.action ?? null,
    evidencePhase: d.evidencePhase ?? null,
    enabled: d.enabled ?? null,
    lastDecision: d.lastDecision ?? null,
    lastGateStatus: d.lastGateStatus ?? null,
    lastRejectReasons: d.lastRejectReasons ?? [],
    dailyEntryCount: d.dailyEntryCount ?? null,
    trendClosedTrades: d.trendClosedTrades ?? null,
    sampleStatus: d.sampleStatus ?? null,
    readyForNextPhase: d.readyForNextPhase ?? null,
    liveActivationAllowed: d.liveActivationAllowed ?? null,
    exchangeOrderAllowed: d.exchangeOrderAllowed ?? null,
  };
  console.log(JSON.stringify(summary));
  // ---- fail-closed safety guards ----
  if (d.ok !== true) { console.error("STOP: ok!=true"); process.exit(5); }
  if (d.liveActivationAllowed === true) { console.error("STOP: liveActivationAllowed=true"); process.exit(6); }
  if (d.exchangeOrderAllowed === true) { console.error("STOP: exchangeOrderAllowed=true"); process.exit(7); }
  if (d.action == null || d.evidencePhase == null) { console.error("STOP: malformed (missing fields)"); process.exit(8); }
  process.exit(0);
});
'

# ============================================================================
# CRON PROPOSAL — *** NOT INSTALLED BY THIS SCRIPT. DO NOT ENABLE YET. ***
# ----------------------------------------------------------------------------
# Only AFTER operator approval + a successful manual dry run, an operator MAY
# add a crontab entry that runs this single-shot script periodically. Recommended
# cadence: every 15 minutes (drives 5m-based exits; entry still capped to 1 per 1H
# bar + daily caps inside the runner). DO NOT loop inside this script.
#
#   # paper-only trend evidence — every 15 min (operator installs manually, later)
#   */15 * * * * RUN_CYCLE_TRIGGER_KEY=*** TREND_PAPER_EVIDENCE_HOST=https://ob-gate.com \
#     /path/to/dashboard/scripts/trend_paper_evidence_cycle.sh >> /var/log/trend_evidence.log 2>&1
#
# Pre-cron checklist (operator):
#   1) both env gates true: TREND_PAPER_SIMULATION_ENABLED=true + TREND_PAPER_EVIDENCE_RUNNER_ENABLED=true
#   2) global safety flags false: LIVE_TRADING_ENABLED / ENABLE_ORDER_PLACEMENT / PRODUCTION_TRADING_READY = false
#   3) one successful MANUAL run of this script returns ok=true and a non-DISABLED evidencePhase
#   4) confirm grid closedCycles unaffected + trend journal isolated
# Stop anytime: set TREND_PAPER_EVIDENCE_RUNNER_ENABLED=false (route returns DISABLED) and remove the cron line.
# ============================================================================
