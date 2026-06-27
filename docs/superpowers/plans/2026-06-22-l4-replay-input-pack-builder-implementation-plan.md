# L4 Replay Input Pack Builder Implementation Plan

Date: 2026-06-22
Status: Plan only
Scope: Future local-only replay input pack builder for D8.4.2

## Current Release Context

- D8.4.2 Historical Replay Candidate Scarcity Review is released.
- L0 Local Research Node / Pull-only Runtime Mirror Design is released.
- L2 Local Pull-only Mirror Prototype is released.
- L3 Replay Input Pack Builder Design is released.
- D8.5 remains on implementation hold.
- Continuation branch remains not approved.
- The working tree has unrelated dirty and untracked files that must not be touched.

## Goal

Implement, in a future task, a local-only builder that converts approved pull-only mirrored server data into a deterministic replay input pack for D8.4.2 Historical Replay Candidate Scarcity Review.

This L4 task is a plan only. It does not implement builder code, run replay, generate packs, upload to server, or touch runtime, env, config, order, execution, broker, runner, or API route paths.

## Chosen Builder Approach

Choose:

```text
tools/local-replay/build-d8-4-2-replay-input-pack.ts
```

Use TypeScript instead of PowerShell for the builder.

Reason:

- D8.4.2 reviewer and point-in-time adapter are already TypeScript.
- The builder needs structured schema validation, JSONL parsing, deterministic candle normalization, and unit tests.
- TypeScript can share future pack types with `historicalReplayCandidateScarcityReview.ts` and `historicalReplayPointInTime.ts` without shell parsing.
- PowerShell remains the right layer for the L2 local mirror transfer skeleton, not the D8 replay data contract.

## Future Builder Contract

The builder must:

- Run local-only.
- Read only from `LOCAL_MIRROR_ROOT`.
- Write only under `<LOCAL_MIRROR_ROOT>/research-packs/d8-4-2-replay-input/`.
- Refuse output inside the Git repository.
- Refuse server-like paths.
- Never upload to server.
- Never call server, API, or exchange endpoints.
- Never read `.env`, secrets, private keys, or `config/db.php`.
- Never touch runner, broker, execution, order, approval, or activation paths.
- Default to dry-run behavior where practical.
- Require an explicit build/apply flag before pack generation.

Future command shape:

```powershell
node tools/local-replay/build-d8-4-2-replay-input-pack.ts `
  --local-mirror-root "C:/2025/ob-gate-local-mirror/httpdocs" `
  --dry-run
```

Future build mode:

```powershell
node tools/local-replay/build-d8-4-2-replay-input-pack.ts `
  --local-mirror-root "C:/2025/ob-gate-local-mirror/httpdocs" `
  --build
```

The exact runner may use the repo's existing TypeScript execution pattern when implementation begins.

## Pack Files

Future output directory:

```text
<LOCAL_MIRROR_ROOT>/research-packs/d8-4-2-replay-input/
```

Future pack files:

- `manifest.json`
- `candles_5m.jsonl`
- `candles_15m.jsonl`
- `candles_1h.jsonl`
- `d8_snapshots.jsonl`, if available
- `source_file_inventory.json`
- `data_quality_report.json`

The pack directory is local mirror data and must not be committed.

## Task 1 - Pack Schema, Types, And RED Tests

Future files:

- `tools/local-replay/build-d8-4-2-replay-input-pack.ts`
- Focused test file using the repo's established test runner and naming convention.

Define schemas:

- Manifest schema matching `D8_4_2_REPLAY_INPUT_PACK_V1`.
- Source inventory schema.
- Data quality report schema.
- Normalized candle row schema.
- Optional D8 snapshot row schema.
- Safety literal schema with activation flags always false and review flags always true.

RED tests first:

- Reject empty `LOCAL_MIRROR_ROOT`.
- Reject output inside repo root.
- Reject server-like local mirror root.
- Reject forbidden source paths.
- Produce `NO_INPUT` for empty approved mirror data.
- Keep `activationAllowed`, `paperActivationAllowed`, and `liveActivationAllowed` false.
- Keep `reviewOnly` and `shadowOnly` true.

## Task 2 - Candle Normalization

Implement deterministic candle normalization for `5M`, `15M`, and `1H`.

Requirements:

- Require finite `open`, `high`, `low`, `close`, and `volume`.
- Require valid timestamps.
- Normalize timestamps to ISO-8601 UTC.
- Sort candles by timestamp ascending.
- Deduplicate timestamps deterministically by source priority and source position.
- Exclude incomplete candles.
- Detect large timestamp gaps by timeframe.
- Detect future timestamps relative to pack build time.
- Detect timeframe mismatch.
- Preserve source file and source line for audit.

Tests:

- Accept valid closed candles.
- Reject non-finite OHLC.
- Reject malformed timestamps.
- Deduplicate repeated timestamps deterministically.
- Report gaps without treating gaps as strategy failure.
- Classify future timestamps as `DATA_QUALITY_BLOCKED`.

## Task 3 - Snapshot Inventory

Inventory local mirror snapshots without pretending they are historical replay truth.

Inputs:

- `latest_decision.json`
- `market_snapshot.json`
- `dashboard/tmp/execution-runner/*.jsonl`
- `dashboard/tmp/trend-paper/*.jsonl`
- Approved historical candle or snapshot packs under local mirror root.

Requirements:

- Count `latest_decision.json` inventory separately.
- Count `market_snapshot.json` inventory separately.
- Detect D8 diagnostic snapshots only when present in approved local mirror sources.
- Preserve source file, source line, and observation timestamp when present.
- Clearly state in output reports that `latest_decision.json` alone is not historical truth.
- Report missing D8 snapshots separately from missing candles.
- Never fabricate historical D8 statuses.

Tests:

- Missing `latest_decision.json` is inventory missing, not strategy failure.
- Missing `market_snapshot.json` is inventory missing, not strategy failure.
- Current-only latest decision does not backfill earlier replay timestamps.
- Missing D8 snapshots does not block candle pack creation unless replay mode requires them.

## Task 4 - Pack Writer

Implement local-only pack writing behind an explicit build flag.

Requirements:

- Dry-run prints planned pack files and data quality status without writing pack files.
- Build mode writes only under `<LOCAL_MIRROR_ROOT>/research-packs/d8-4-2-replay-input/`.
- Refuse repo-root output.
- Refuse server-like paths such as `server:` or `/var/www/vhosts`.
- Refuse forbidden file names and directories.
- Create pack files atomically where practical by writing temporary local files under the pack directory and renaming.
- Never write runtime JSON or JSONL inside the repo.
- Never write to server.

Tests:

- Dry-run creates no files.
- Build mode writes only expected pack files.
- Output escaping local mirror root fails.
- Repo-root output fails.
- Forbidden source detection fails safely.

## Task 5 - Data Quality And Readiness Classification

Implement readiness classifications:

- `NO_INPUT`
- `INSUFFICIENT_HISTORY`
- `USABLE_FOR_REPLAY`
- `DATA_QUALITY_BLOCKED`

Rules:

- `NO_INPUT`: no usable mirrored candle rows.
- `INSUFFICIENT_HISTORY`: normalized data exists but does not meet D8.4.2 sample goals.
- `USABLE_FOR_REPLAY`: enough normalized closed candles exist and point-in-time blockers are absent.
- `DATA_QUALITY_BLOCKED`: contradiction, corruption, future data, timeframe mismatch, path violation, or forbidden source prevents replay.

Important distinction:

- Pack readiness is not D8.4.2 result.
- A usable pack does not mean replay has run.
- A usable pack does not permit edge claims, activation, continuation branch, D8.5, or order behavior.

Tests:

- Empty mirror creates `NO_INPUT`.
- Small valid history creates `INSUFFICIENT_HISTORY`.
- Large valid history creates `USABLE_FOR_REPLAY`.
- Corrupt timestamps create `DATA_QUALITY_BLOCKED`.
- Missing data never becomes a strategy failure.

## Task 6 - Local Agent HQ Future Visibility

Plan only. Future local `/agent-hq` may display:

- Pack readiness.
- Candle counts by timeframe.
- Data quality blockers.
- Mirror freshness.
- Approved replay result availability.

It must not include:

- Buttons.
- Activation controls.
- Order controls.
- Upload controls.
- Server writeback controls.

Required label:

```text
LOCAL RESEARCH MIRROR - NOT PRODUCTION CONTROL
```

This task does not implement Agent HQ UI.

## Task 7 - Validation

Future implementation must run:

- Focused unit tests for pack builder schemas and classification.
- TypeScript parse/typecheck for the builder path.
- Static safety scan for server writeback, env reads, config reads, exchange calls, API calls, scheduler/service creation, and runtime writes inside repo.
- Dry-run smoke test proving no pack files are created.
- Build-mode test against a temporary local fixture outside repo.
- `git diff --cached --check` before any approved release.

Future release must prove:

- No runtime, env, or config writes.
- No server writeback.
- No generated pack committed.
- No `git add .`.
- No D8.5 staged.
- No continuation branch work staged.

## How This Prepares L5

L4 implementation will produce a validated local replay input pack contract. L5 can then be a one-shot local replay run that reads only:

- `manifest.json`
- Normalized candle JSONL files
- Optional `d8_snapshots.jsonl`

L5 must refuse to run unless the pack status is `USABLE_FOR_REPLAY`. L5 remains local-only and cannot approve continuation branch, D8.5, paper activation, live activation, orders, or server writes.

## Hard Safety

- D8.5 remains on implementation hold.
- No continuation branch.
- No paper or live activation.
- No order, execution, broker, runner, or API changes.
- No env, secrets, or config changes.
- No server writeback.
- No scheduler or service.
- No runtime or generated files committed.
- No staging unless explicitly approved.

## Docs-only Validation For This Plan

For this L4 planning task:

- Marker scan must pass.
- Trailing whitespace scan must pass.
- Changed files should be limited to this new L4 plan.
- No code, test, runtime, env, or config changes.
- No files staged.
- No commit or push.
