# M-0Z-6 Paper Caller Context Patch

## Purpose

This patch adds the tracked `paper_cycle.sh` caller script and makes the caller
send optional paper observability context to `/api/internal/execution-runner`.

The previous receiver patch already accepted and reported the context. This
patch makes future cron-produced paper events carry the context when runtime
files contain the needed fields.

## Scope

Changed source:

- `paper_cycle.sh`
- `docs/M0Z6_PAPER_CALLER_CONTEXT_PATCH.md`

The patch is observability-only. It does not change strategy, grid trigger,
risk, fill, live trading, order placement, or approval behavior.

## Schema

Schema version:

```text
m0z6-observability-v1
```

Caller context fields:

- `schemaVersion`
- `paperObservabilitySchemaVersion`
- `gridLower`
- `gridUpper`
- `gridMid`
- `currentPrice`
- `gridSpacingPct`
- `side`
- `symbol`
- `mode`
- `regime`
- `session`
- `paperModeDetected`
- `eventTs`
- `noTradeReason`

`gridSpacingPct` is calculated only when `gridLower`, `gridUpper`, and
`gridMid` are numeric and `gridMid > 0`:

```text
abs(gridUpper - gridLower) / gridMid * 100
```

If `gridMid` is not directly present, the caller derives it from
`(gridUpper + gridLower) / 2`.

## Runtime Behavior

`paper_cycle.sh` reads runtime source files from `BINGX_AGENT_DIR` or the script
directory:

- `latest_decision.json`
- `orderbook_snapshot.json`
- `funding_snapshot.json`
- `market_snapshot.json`

It sends a PAPER request with `entryPrice: null` so the existing paper execution
path remains a MARKET paper order. The side rule is unchanged:

```text
BUY when current price < gridMid; otherwise SELL
```

If required price or grid data is missing, the script exits without sending a
paper order. It does not fabricate fills.

## Secret Rule

The script does not contain secrets. It reads the internal key at runtime from:

- `RUN_CYCLE_TRIGGER_KEY`
- `INTERNAL_API_KEY`
- `REFRESH_ENDPOINT_KEY`

The key may come from the process environment or server-side env files. The
value is never printed.

## Safety Boundaries

This patch does not:

- enable `LIVE_TRADING_ENABLED`
- enable `ENABLE_ORDER_PLACEMENT`
- set `PRODUCTION_TRADING_READY=true`
- set `EXCHANGE_MANUAL_APPROVAL=approved`
- call BingX private/execution APIs
- place real orders
- force paper fills
- change BUY/SELL trigger logic
- change risk logic
- change fill logic

## Acceptance Criteria

- `paper_cycle.sh` is tracked source.
- `bash -n paper_cycle.sh` passes.
- Dashboard build passes.
- No runtime JSON, paper journals, env files, secrets, `node_modules`, or
  `.next` output are committed.
- Future paper events include observability context when runtime source files
  contain the relevant values.

## Plesk Deploy Notes

```bash
cd /var/www/vhosts/ob-gate.com/httpdocs
git pull origin main
cd dashboard
npm ci
npm run build
```

Then restart the Node.js App from Plesk.

Confirm the cron task runs:

```bash
/bin/bash /var/www/vhosts/ob-gate.com/httpdocs/paper_cycle.sh
```

Do not paste secrets into chat or logs.

## Post-Deploy Verification

After one or two natural cron runs, check authenticated paper performance:

```bash
curl -k -sS https://ob-gate.com/api/paper-performance | head -c 3000
```

Expected improvements:

- `schemaVersion` appears in recent paper event summaries.
- `gridSpacingPct` appears when grid bounds are available.
- `mode`, `regime`, and `session` appear when source data contains them.
- `costGate` can become computable after new events include grid spacing.
- `closedCycles` remains DATA_GAP until real round trips occur.

## Final Decision

Caller context improves future evidence quality only. It does not unlock M-0B.
