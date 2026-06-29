# L7 One-Shot Local Replay Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans if this plan is later converted into implementation work. This L7 document is planning-only and must not run replay by itself.

**Goal:** Define the first local-only, one-shot replay run that consumes the clean L6 replay input pack and produces interpretable review evidence without activating, trading, or writing to the server.

**Architecture:** L7 reads a validated local input pack from the local mirror and writes a separate local replay result only after a later explicit run approval. The replay is deterministic, one-shot, read-only against the input pack, and blocked by safety or data-quality violations before any metric is calculated.

**Tech Stack:** Local filesystem, JSON, JSONL, TypeScript replay helpers when later implemented, and PowerShell operator guards.

---

## Current Gate Context

Roadmap gate moved to:

```text
L7
```

Confirmed prerequisites:

- G1 is closed.
- DQ-A is closed.
- L6 is clean-complete.
- L6 timeframe matcher remediation is released at `8685302`.
- D8.5 remains on hold.
- Continuation branch remains not approved.
- Activation, order, execution, and API paths remain forbidden.

Clean L6 replay input pack:

```text
C:/2025/ob-gate-local-mirror/httpdocs/research-packs/d8-4-2-replay-input
```

Pack readiness:

- `dataQualityStatus`: `USABLE_FOR_REPLAY`
- `5M` candles: `199`
- `15M` candles: `199`
- `1H` candles: `199`
- `d8_snapshots.jsonl`: `0` rows
- `latestDecision` snapshot: `1`
- `marketSnapshot`: `1`
- `activationAllowed`: `false`
- `paperActivationAllowed`: `false`
- `liveActivationAllowed`: `false`
- `reviewOnly`: `true`
- `shadowOnly`: `true`

Old tainted pack quarantine:

```text
C:/2025/ob-gate-local-quarantine/d8-4-2-replay-input-tainted-8685302
```

## File Boundary

This plan creates only:

```text
docs/superpowers/plans/2026-06-29-l7-one-shot-local-replay-plan.md
```

This plan does not create:

- replay runner code
- replay result files
- generated JSON or JSONL under the repository
- dashboard UI
- API routes
- scheduler or service files
- order, execution, broker, approval, or activation files

## Replay Input

Approved input pack path:

```text
C:/2025/ob-gate-local-mirror/httpdocs/research-packs/d8-4-2-replay-input
```

Required pack files:

- `manifest.json`
- `candles_5m.jsonl`
- `candles_15m.jsonl`
- `candles_1h.jsonl`
- `d8_snapshots.jsonl`
- `source_file_inventory.json`
- `data_quality_report.json`

The input pack is read-only for L7. The replay runner must refuse to modify or regenerate these files.

## Pre-Run Guards

Before a later L7 replay run, the operator or runner must verify:

- The input pack path exists and is outside the active Git repository.
- All seven required files exist.
- `manifest.schemaVersion` is `1`.
- `manifest.source` is `D8_4_2_REPLAY_INPUT_PACK_V1`.
- `manifest.dataQualityStatus` is `USABLE_FOR_REPLAY`.
- `data_quality_report.dataQualityStatus` is `USABLE_FOR_REPLAY`.
- Candle line counts match `manifest.candleCounts`.
- `candles_5m.jsonl` contains exactly `199` rows for the current L6 pack.
- `candles_15m.jsonl` contains exactly `199` rows for the current L6 pack.
- `candles_1h.jsonl` contains exactly `199` rows for the current L6 pack.
- `5M` deltas are only 5 minutes.
- `15M` deltas are only 15 minutes.
- `1H` deltas are only 60 minutes.
- Duplicate timestamps are `0` for every timeframe.
- Non-monotonic timestamps are `0` for every timeframe.
- `d8_snapshots.jsonl` row count is reported. The current approved pack has `0` D8 snapshots, so SMC/D8 diagnostic replay evidence is unavailable.
- `activationAllowed`, `paperActivationAllowed`, and `liveActivationAllowed` are all `false`.
- `reviewOnly` and `shadowOnly` are both `true`.
- No `.env`, secrets, private keys, `config/db.php`, `node_modules`, `.next`, or lock files are inside the replay input boundary.
- No order, execution, broker, approval, activation, or API route path is read as replay input.
- No output path resolves inside the active Git repository.

Any failed guard blocks the replay run and produces a local safety report only.

## Replay Mode

L7 replay mode is:

```text
ONE_SHOT_LOCAL_REPLAY
```

Run constraints:

- One-shot local replay only.
- Read-only access to the input pack.
- Deterministic replay over normalized closed candles.
- No broker calls.
- No API calls.
- No private exchange calls.
- No server reads.
- No server writes.
- No paper order emission.
- No live order emission.
- No changes to strategy rules.
- No D8.5 implementation.
- No continuation branch implementation.
- No writes outside the approved local replay output path.

The replay run must be explicitly approved in a later L7 run task. This plan is not that approval.

## Expected Output Path

Approved local-only output root for a later L7 run:

```text
C:/2025/ob-gate-local-mirror/httpdocs/research-runs/l7-one-shot-replay/
```

Expected output files for a later run:

- `run_manifest.json`
- `replay_points.jsonl`
- `funnel_summary.json`
- `grid_summary.json`
- `trend_summary.json`
- `no_trade_reason_summary.json`
- `candidate_summary.json`
- `data_limitations.json`
- `safety_report.json`

Output rules:

- The output path must be under the local mirror root.
- The output path must not be under `research-packs/d8-4-2-replay-input`.
- The output path must not be inside the active Git repository.
- The output path must not be the manual download staging path.
- The output path must not be a server path.
- A later runner must refuse to overwrite an existing run directory unless a separate quarantine or versioned run directory is approved.

## Metrics To Calculate

The later L7 replay result must report:

- replay start time
- replay end time
- replay duration
- candle counts consumed by timeframe
- selected evaluation timeframe
- total evaluation points
- warm-up points excluded from metrics
- data-quality points excluded from metrics
- regime decisions when the pack or replay adapter can derive them point-in-time
- grid eligibility decisions when G1 context can be evaluated point-in-time
- trend funnel decisions when D8 evidence is available point-in-time
- no-trade reasons and counts
- candidate entry observations
- candidate exit observations
- closed cycle count
- gross PnL estimate when closed-cycle evidence exists
- cost-adjusted PnL estimate when a cost model exists in the approved local evidence
- expectancy when closed cycles exist
- max adverse excursion when candle and candidate lifecycle evidence supports it
- missing evidence fields
- data limitations
- primary blocker distribution
- recommended next research action

The current L6 pack has `199` rows per timeframe, below the roadmap `USABLE_SAMPLE >= 500 evaluation points` target. L7 may still run for mechanics and early evidence review, but the interpretation must mark sample depth as limited.

## Interpretation Rules

L7 interpretation must follow these rules:

- No closed cycles means edge is unproven, not strategy failure.
- Missing D8 snapshots means SMC/D8 diagnostic replay is unavailable, not strategy failure.
- No trades means classify by no-trade reasons and upstream candidate scarcity.
- Insufficient cycles means do not approve D8.5.
- Fewer than `500` valid evaluation points means do not approve continuation branch research from this run alone.
- Any activation flag set to `true` fails the safety gate.
- Any API, order, execution, broker, approval, or activation path access fails the safety gate.
- Any server writeback fails the safety gate.
- Any non-deterministic output across identical inputs fails the replay integrity gate.
- Any output inside the active Git repository fails the safety gate.
- Any generated replay pack mutation fails the input integrity gate.

L7 evidence can support one of these next decisions:

- collect more history
- repair data quality
- repair replay adapter coverage
- tune grid only after replay evidence shows a grid bottleneck
- tune trend only after replay evidence shows a trend bottleneck
- plan paper automation only after replay evidence is interpretable and safety remains clean

L7 evidence cannot by itself:

- claim strategy profitability
- approve live trading
- approve paper activation
- implement D8.5
- implement continuation branch
- place or simulate real orders through broker or API paths

## Pass And Fail Criteria

L7 pass means:

- The replay ran once over the approved local pack.
- The run was deterministic.
- The run produced the expected local result files.
- The run preserved the input pack.
- The run produced interpretable evidence and explicit limitations.
- The run did not touch server, repo runtime, activation, order, execution, API, env, or config paths.

L7 pass does not mean:

- The strategy is profitable.
- Paper or live execution is allowed.
- D8.5 is approved.
- Continuation branch is approved.

L7 fail or blocked means one or more of:

- input pack missing or not `USABLE_FOR_REPLAY`
- candle counts contradict manifest
- timeframe deltas are mixed
- duplicate or non-monotonic timestamps appear
- safety flags are unsafe
- replay output is incomplete
- replay output is non-deterministic
- replay output is contaminated by server, API, runtime, or repo data
- output path escapes the approved local mirror output boundary

## Safety Constraints

Hard constraints:

- no activation
- no paper activation
- no live activation
- no API keys
- no private exchange calls
- no order placement
- no order routes
- no execution routes
- no broker routes
- no approval routes
- no env reads or writes
- no secrets reads or writes
- no `config/db.php`
- no D8.5 implementation
- no continuation branch implementation
- no server upload
- no server writeback
- no generated replay output in the active Git repository
- no mutation of the L6 replay input pack
- no stage, commit, or push without separate approval
- no `git add .`

Required safety literals in any later result:

```json
{
  "activationAllowed": false,
  "paperActivationAllowed": false,
  "liveActivationAllowed": false,
  "reviewOnly": true,
  "shadowOnly": true
}
```

## Future Implementation Planning Notes

If L7 later receives explicit implementation approval, the implementation plan should prefer a local TypeScript runner because D8.4.2 review helpers and replay pack builder are already TypeScript. The runner should live under:

```text
tools/local-replay/
```

Expected future runner name:

```text
run-d8-4-2-one-shot-local-replay.ts
```

The implementation plan must start with RED tests for:

- refusing non-`USABLE_FOR_REPLAY` input packs
- refusing output inside the repository
- refusing output outside the local mirror
- refusing unsafe activation flags
- refusing API, broker, order, execution, approval, env, secrets, and config paths
- preserving the input pack byte-for-byte
- producing deterministic summaries from identical input
- reporting `d8_snapshots.jsonl` row count `0` as a limitation
- classifying fewer than `500` evaluation points as limited sample depth
- keeping D8.5 and continuation recommendations locked

This section is not implementation approval.

## Validation For This Plan-Only Task

Required checks for this docs-only L7 task:

- marker scan
- unfinished-work marker scan using the repo standard blocked terms
- trailing whitespace scan
- `git diff --check`
- confirm changed files include only this L7 plan file
- confirm no code or test files changed
- confirm no runtime JSON or JSONL changed in the repository
- confirm no generated replay output changed in the repository
- confirm no files staged
- confirm no commit or push

Expected result:

```text
Only docs/superpowers/plans/2026-06-29-l7-one-shot-local-replay-plan.md changes.
No replay run.
No code changes.
No generated replay output changes.
No staging.
No commit.
No push.
```
