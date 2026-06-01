# M-0Z-6 Paper Observability Patch

## Scope

This patch is observability-only. It adds optional paper execution context fields to
audit events and read-only performance reporting.

It does not change:

- trading decisions
- order side selection
- fill behavior
- live trading flags
- order placement flags
- manual approval state

## Schema

`paperObservabilitySchemaVersion = "m0z6-observability-v1"`

Optional context fields:

- `gridSpacingPct`
- `gridLower`
- `gridUpper`
- `gridMid`
- `currentPrice`
- `side`
- `mode`
- `regime`
- `session`
- `symbol`
- `eventTs`
- `paperModeDetected`
- `noTradeReason`
- `schemaVersion`

## Runtime Behavior

The internal execution runner accepts an optional `context` object in the request
body. When provided, the runner attaches sanitized context to paper audit events
such as `ORDER_SIMULATED`, `FILL_RESULT`, and blocked/skipped intent events.

Old audit events without context remain valid. Missing fields remain
`null`/`unknown` and do not become PASS.

## Performance Reporting

`readPaperJournal` now parses optional context fields from audit payloads.

`paperPerformance` uses parsed context to improve:

- `costGate.gridSpacingPct`
- `gridSpacingCheck.spacingPct`
- `paperDataQuality.hasGridSpacing`
- `paperDataQuality.hasModeTags`
- `paperDataQuality.hasRegimeTags`
- no-trade reason coverage
- mode/regime/session attribution when closed cycles exist

If `closedCycles=0`, the edge gate remains `sample_insufficient` / DATA_GAP.
Paper fills alone still do not prove edge.

## Manual Validation Notes

Minimum validation cases:

1. Old `FILL_RESULT` without context still parses.
2. New `FILL_RESULT` with context parses `gridSpacingPct`, `mode`, `regime`, and `session`.
3. `costGate` remains `unknown` if `gridSpacingPct` is missing.
4. `costGate` can calculate when `gridSpacingPct` exists.
5. `closedCycles=0` remains DATA_GAP / `sample_insufficient`.
6. `noTradeReason` is collected if event context includes it.
7. Missing optional context does not crash `/api/paper-performance`.

## Deployment Note

`paper_cycle.sh` was not present in the clean `origin/main` checkout used for
this patch. This release therefore makes the dashboard/API side ready to accept
observability context. The caller that posts to `/api/internal/execution-runner`
must include the optional `context` object for new runtime events to carry grid,
mode, regime, session, and no-trade metadata.

## Safety Decision

Observability improves future evidence quality only. It does not unlock M-0B.
