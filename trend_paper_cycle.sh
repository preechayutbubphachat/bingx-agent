#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${TREND_PAPER_BASE_URL:-http://127.0.0.1:3000}"
TOKEN="${RUN_CYCLE_TRIGGER_KEY:-${INTERNAL_API_KEY:-${REFRESH_ENDPOINT_KEY:-}}}"

if [[ -z "${TOKEN}" ]]; then
  echo "trend_paper_cycle: missing RUN_CYCLE_TRIGGER_KEY/INTERNAL_API_KEY/REFRESH_ENDPOINT_KEY" >&2
  exit 1
fi

response="$(curl -fsS -X POST "${BASE_URL%/}/api/internal/trend-paper-cycle" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  --data '{}')"

printf '%s' "${response}" | node -e '
let raw = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => { raw += chunk; });
process.stdin.on("end", () => {
  const data = JSON.parse(raw || "{}");
  const summary = {
    ok: data.ok ?? false,
    action: data.action ?? "UNKNOWN",
    reason: data.reason ?? null,
    journalAppended: data.journalAppended ?? false,
    closedTradesAfter: data.journalState?.after?.closedTrades ?? null,
  };
  console.log(JSON.stringify(summary));
});
'
