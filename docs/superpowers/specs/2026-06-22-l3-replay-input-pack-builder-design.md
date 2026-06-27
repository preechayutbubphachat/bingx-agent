# L3 Replay Input Pack Builder Design

Date: 2026-06-22
Status: Design only
Scope: Local-only replay input pack builder for D8.4.2 Historical Replay Candidate Scarcity Review

## Current Release Context

- D8.4.2 Historical Replay Candidate Scarcity Review is released.
- L0 Local Research Node / Pull-only Runtime Mirror Design is released.
- L2 Local Pull-only Mirror Prototype is released.
- D8.5 outcome recorder remains on implementation hold.
- Continuation branch remains not approved.

## Purpose

L3 defines how pull-only mirrored server data becomes a deterministic, local-only replay input pack for a future D8.4.2 one-shot replay.

The pack builder is not implemented in L3. L3 does not run replay, upload output, alter server diagnostics, or claim strategy edge.

## Data Boundary

Allowed input boundary:

```text
<LOCAL_MIRROR_ROOT> -> <LOCAL_MIRROR_ROOT>/research-packs/d8-4-2-replay-input/
```

Forbidden boundaries:

```text
SERVER -> REPLAY_BUILDER
REPLAY_BUILDER -> SERVER
REPO_RUNTIME_JSON -> REPLAY_BUILDER
PUBLIC_CACHE -> REPLAY_BUILDER
```

The builder must read only from the approved local mirror root and write only under the proposed local research pack path. It must not write runtime JSON or JSONL inside the Git repository.

## Required Mirrored Sources

The builder may use only these local mirror inputs:

- `<LOCAL_MIRROR_ROOT>/market_snapshot.json`
- `<LOCAL_MIRROR_ROOT>/latest_decision.json`
- `<LOCAL_MIRROR_ROOT>/dashboard/tmp/execution-runner/*.jsonl`
- `<LOCAL_MIRROR_ROOT>/dashboard/tmp/trend-paper/*.jsonl`
- Approved historical candle or snapshot packs under the local mirror root, if present later

Required minimum for a useful D8.4.2 replay input pack:

- At least one approved historical candle source for a replay timeframe.
- A source inventory for `market_snapshot.json` and `latest_decision.json`, even when those files do not supply enough history by themselves.
- Journal inventory for execution-runner and trend-paper data, with missing journals reported separately from missing candles.

## Forbidden Sources

The builder must not read from:

- Direct server paths during pack build
- Public cache files as source-of-truth
- `.env`
- Secrets
- `config/db.php`
- Private exchange API
- Broker, runner, execution, order, or approval paths
- Local files outside the approved mirror root unless separately approved

Forbidden sources must be reported as blockers if detected in the source inventory.

## Proposed Pack Path

The future builder should write the pack locally to:

```text
<LOCAL_MIRROR_ROOT>/research-packs/d8-4-2-replay-input/
```

Proposed pack files:

- `manifest.json`
- `candles_5m.jsonl`
- `candles_15m.jsonl`
- `candles_1h.jsonl`
- `d8_snapshots.jsonl`, if available
- `source_file_inventory.json`
- `data_quality_report.json`

The pack is local-only. L3 does not design a server upload path.

## Manifest Schema

```json
{
  "schemaVersion": 1,
  "source": "D8_4_2_REPLAY_INPUT_PACK_V1",
  "createdAt": "string",
  "localMirrorRoot": "string",
  "mirrorLastSyncAt": null,
  "timeframesIncluded": ["5M", "15M", "1H"],
  "startAt": null,
  "endAt": null,
  "candleCounts": {
    "5M": 0,
    "15M": 0,
    "1H": 0
  },
  "snapshotCounts": {
    "latestDecision": 0,
    "marketSnapshot": 0,
    "d8Diagnostics": 0
  },
  "dataQualityStatus": "NO_INPUT",
  "blockers": [],
  "nextAction": "Collect approved local mirror inputs before replay.",
  "activationAllowed": false,
  "paperActivationAllowed": false,
  "liveActivationAllowed": false,
  "reviewOnly": true,
  "shadowOnly": true
}
```

Field constraints:

- `schemaVersion` must be `1`.
- `source` must be `D8_4_2_REPLAY_INPUT_PACK_V1`.
- `createdAt` must be the local pack build timestamp in ISO-8601 format.
- `localMirrorRoot` must be the approved mirror root used for the build.
- `mirrorLastSyncAt` must come from local mirror status when available, otherwise `null`.
- `timeframesIncluded` may include only `"5M"`, `"15M"`, and `"1H"`.
- `startAt` and `endAt` must reflect normalized closed candle coverage, not wall-clock builder runtime.
- All activation flags must remain false.
- `reviewOnly` and `shadowOnly` must remain true.

Allowed `dataQualityStatus` values:

- `NO_INPUT`
- `INSUFFICIENT_HISTORY`
- `USABLE_FOR_REPLAY`
- `DATA_QUALITY_BLOCKED`

## Candle Normalization Model

Each normalized candle row should contain only deterministic market data:

```json
{
  "timeframe": "5M",
  "openTime": "string",
  "closeTime": "string",
  "open": 0,
  "high": 0,
  "low": 0,
  "close": 0,
  "volume": 0,
  "sourceFile": "string",
  "sourceLine": 0
}
```

Normalization rules:

- Parse timestamps to a single ISO-8601 UTC representation.
- Require finite numeric `open`, `high`, `low`, `close`, and `volume` values.
- Require `high >= max(open, close)` and `low <= min(open, close)`.
- Require `closeTime > openTime`.
- Require the observed interval to match the declared timeframe.
- Exclude incomplete candles.
- Sort by `openTime` ascending after normalization.
- Deduplicate repeated timestamps deterministically by stable source priority and source position.
- Preserve `sourceFile` and `sourceLine` for auditability.

## Usable Timeframe Data

Usable replay input must be closed, normalized, and point-in-time safe.

Timeframe expectations:

- `5M`: primary fine-grained replay stream.
- `15M`: medium trend context when available.
- `1H`: higher timeframe context when available.

Readiness should not require every timeframe if the future D8.4.2 replay can run with a documented subset. Missing timeframe data must be listed in `data_quality_report.json` and `manifest.blockers` when it blocks the intended replay mode.

## Point-in-time Safety Model

The builder must prove that each replay row uses only information available at or before the replay cursor.

Point-in-time requirements:

- Candle rows are keyed by `closeTime`; a replay cursor may consume a candle only after its `closeTime`.
- Snapshot rows must include their observed or logged timestamp.
- D8 diagnostic snapshots must be tied to the source decision or journal timestamp, not builder runtime.
- Source inventory must record file modified time, local mirror root, and source path.
- Pack manifest must separate `createdAt` from market data timestamps.
- Future replay must not use `latest_decision.json` as historical truth for earlier timestamps.

Point-in-time blockers:

- Missing or unparsable timestamps.
- Future timestamps relative to pack creation time.
- Snapshot data without an observation time.
- Mixed timezones without deterministic normalization.
- Journal rows that cannot be ordered.

## Missing, Stale, And Incomplete Data Detection

The builder should produce `data_quality_report.json` with:

- Missing required files.
- Missing optional files.
- Missing timeframe coverage.
- Candle counts by timeframe.
- Timestamp gaps by timeframe.
- Duplicate timestamp counts.
- Excluded incomplete candle counts.
- Future timestamp counts.
- Timeframe mismatch counts.
- D8 snapshot count and availability.
- Mirror status and mirror age when available.
- Final readiness classification and blockers.

Large timestamp gaps must be reported separately from low total history. Missing D8 snapshots must be reported separately from missing candle data.

## Data Quality Rules

The builder must:

- Require finite OHLC candles.
- Require ascending timestamps after normalization.
- Deduplicate timestamps deterministically.
- Exclude incomplete candles.
- Detect large timestamp gaps.
- Detect future timestamps.
- Detect timeframe mismatch.
- Detect missing D8 snapshots separately from missing candles.
- Never treat missing data as strategy failure.
- Never fabricate historical D8 statuses.

## Readiness Classification

`NO_INPUT`:

- No usable mirrored candle data exists.
- Source inventory may exist, but replay input rows are absent.

`INSUFFICIENT_HISTORY`:

- Usable normalized data exists.
- History is too small for D8.4.2 sample goals or required timeframe context.

`USABLE_FOR_REPLAY`:

- Enough normalized closed candles exist for a future offline D8.4.2 replay attempt.
- Point-in-time blockers are absent.
- This does not mean replay has run.

`DATA_QUALITY_BLOCKED`:

- Contradiction, corruption, timestamp disorder, future data, or source boundary violation prevents replay.

Replay Input Pack readiness is not a D8.4.2 result. A usable pack means only that a future one-shot local replay has approved input. No edge claim is allowed.

## Fabrication Prevention

The builder must not create:

- Synthetic fills
- Synthetic trades
- Synthetic outcomes
- Synthetic candidates
- Synthetic D8 states
- Backfilled D8 diagnostic statuses

Allowed derived fields are limited to deterministic metadata such as normalized timestamps, source line numbers, candle counts, gap counts, and data quality blockers.

If candidate or D8 diagnostic rows are missing, the builder must report absence. It must not infer the missing rows from later state.

## D8 Snapshot Model

`d8_snapshots.jsonl` is optional and may be produced only from approved local mirror sources that already contain D8 diagnostic state.

Each row should preserve:

- Observation timestamp
- Source file
- Source line or event id
- D8.0 aligned candidate status when present
- RR readiness when present
- D8.2 trigger status when present
- D8.3 touch status when present
- D8.4 confirmation or promotable status when present
- D8.4.1 primary blocker when present

Missing fields must remain missing or null. They must not be filled from later records.

## Source File Inventory

`source_file_inventory.json` should include:

- Local mirror root
- Pack path
- Source file path relative to mirror root
- File size
- File modified time
- File class
- Included or excluded status
- Exclusion reason
- Forbidden source detection result

The inventory must never include file contents for `.env`, secrets, `config/db.php`, private keys, or paths outside the approved mirror root.

## Future D8.4.2 Integration

L3 feeds D8.4.2 by defining the input contract for L4 One-shot Local Replay Run.

Future L4 may:

- Read `manifest.json`.
- Read normalized candle JSONL files.
- Read optional `d8_snapshots.jsonl`.
- Refuse replay when `dataQualityStatus` is not `USABLE_FOR_REPLAY`.
- Produce a local replay result for review.

L3 does not:

- Run replay.
- Upload replay result.
- Change server paper diagnostics.
- Approve continuation branch.
- Implement D8.5.
- Claim edge.

## Local Agent HQ Design Hook

Future local `/agent-hq` may show:

- Replay input pack status.
- Candle counts by timeframe.
- Data quality blockers.
- Mirror freshness.
- Whether an approved replay result exists.

The view must remain local, display-only, and clearly labeled:

```text
LOCAL RESEARCH MIRROR - NOT PRODUCTION CONTROL
```

The view must not include:

- Buttons
- Activation controls
- Order controls
- Upload controls
- Server writeback controls

## Safety Constraints

Hard safety:

- No activation
- No paper activation
- No live activation
- No continuation branch approval
- No D8.5 implementation
- No order, execution, broker, runner, or API route changes
- No env, secrets, or config changes
- No server writeback
- No scheduler or service
- No runtime or generated files committed
- No Git staging unless explicitly approved

## Validation Expectations

For this docs-only task:

- Marker scan must pass.
- Trailing whitespace scan must pass.
- Changed files should be limited to this new L3 spec.
- No code, test, runtime, env, or config changes.
- No files staged.
- No commit or push.
