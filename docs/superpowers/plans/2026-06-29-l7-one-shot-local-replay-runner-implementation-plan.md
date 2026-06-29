# L7 One-Shot Local Replay Runner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:test-driven-development and superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local-only one-shot replay runner that reads the approved L6 replay input pack, writes deterministic review evidence to an explicit local output root, and preserves every activation, order, execution, and server-write safety boundary.

**Architecture:** The runner is a root-level TypeScript CLI under `tools/local-replay/`. It validates the input pack and output root first, reads normalized candle JSONL as read-only replay input, produces review-only evaluation events and summary files, and refuses any broker, paper execution, order, approval, API, env, secret, or config dependency.

**Tech Stack:** TypeScript, Node.js `node:test`, Node filesystem APIs, existing pure D8.4.2 replay helpers, and dashboard-installed TypeScript validation.

---

## Roadmap Gate

Roadmap gate remains:

```text
L7
```

This is an implementation plan only. It does not run replay, create runner code, generate replay output, stage files, commit, push, touch D8.5, touch continuation, or alter activation/order/execution/API/env/config behavior.

## Current Confirmed Inputs

Clean replay input pack:

```text
C:/2025/ob-gate-local-mirror/httpdocs/research-packs/d8-4-2-replay-input
```

Current pack facts:

- `dataQualityStatus = USABLE_FOR_REPLAY`
- `5M = 199`
- `15M = 199`
- `1H = 199`
- candle delta audit is clean
- `d8_snapshots.jsonl = 0`
- activation flags are false
- `reviewOnly = true`
- `shadowOnly = true`

Known blocker:

- Exact L7 runner command is not present in the repository.
- `scripts/replay_paper_execution.ts` is forbidden for L7 because it imports broker and execution paths.

## Proposed Files

Future runner file:

```text
tools/local-replay/run-d8-4-2-one-shot-local-replay.ts
```

Future test file:

```text
tools/local-replay/run-d8-4-2-one-shot-local-replay.test.ts
```

No dashboard UI, API route, scheduler, service, broker, execution, order, approval, env, config, runtime JSON, or generated replay output belongs in the implementation commit.

## Input Contract

Required CLI input:

```text
--input-pack "C:/2025/ob-gate-local-mirror/httpdocs/research-packs/d8-4-2-replay-input"
```

Required files under `--input-pack`:

- `manifest.json`
- `data_quality_report.json`
- `candles_5m.jsonl`
- `candles_15m.jsonl`
- `candles_1h.jsonl`
- `d8_snapshots.jsonl`
- `source_file_inventory.json`

Input pack rules:

- Must be outside the active Git repository.
- Must not be modified by the runner.
- Must have `manifest.source = "D8_4_2_REPLAY_INPUT_PACK_V1"`.
- Must have `manifest.schemaVersion = 1`.
- Must have `manifest.dataQualityStatus = "USABLE_FOR_REPLAY"`.
- Must have `data_quality_report.dataQualityStatus = "USABLE_FOR_REPLAY"`.
- Must force `activationAllowed=false`, `paperActivationAllowed=false`, `liveActivationAllowed=false`, `reviewOnly=true`, and `shadowOnly=true`.
- Candle counts in JSONL files must match `manifest.candleCounts`.
- Candle timestamps must be ascending, deduplicated, and timeframe-clean.
- `d8_snapshots.jsonl` may have `0` rows, but that must be reported as a limitation.

## Output Contract

Required CLI output:

```text
--output-root "C:/2025/ob-gate-local-mirror/httpdocs/research-runs/l7-one-shot-replay"
```

Output root rules:

- Must be explicitly provided by CLI.
- Must be outside the active Git repository.
- Must be under the local mirror root.
- Must not be under `research-packs/d8-4-2-replay-input`.
- Must not be the manual download staging path.
- Must not be a server-like path.
- Must be absent before run unless a versioned child run directory is approved by the same implementation task.

Expected output files:

- `replay_manifest.json`
- `replay_summary.json`
- `replay_events.jsonl`
- `replay_limitations.json`
- `replay_safety_audit.json`

Output safety literals must appear in `replay_manifest.json`, `replay_summary.json`, and `replay_safety_audit.json`:

```json
{
  "activationAllowed": false,
  "paperActivationAllowed": false,
  "liveActivationAllowed": false,
  "reviewOnly": true,
  "shadowOnly": true
}
```

## CLI Contract

Future command:

```powershell
node --experimental-strip-types ".\tools\local-replay\run-d8-4-2-one-shot-local-replay.ts" `
  --input-pack "C:/2025/ob-gate-local-mirror/httpdocs/research-packs/d8-4-2-replay-input" `
  --output-root "C:/2025/ob-gate-local-mirror/httpdocs/research-runs/l7-one-shot-replay" `
  --one-shot
```

Required flags:

- `--input-pack`
- `--output-root`
- `--one-shot`

CLI rejection rules:

- Reject missing `--input-pack`.
- Reject missing `--output-root`.
- Reject missing `--one-shot`.
- Reject input pack inside active repo.
- Reject output root inside active repo.
- Reject output root outside local mirror.
- Reject output root inside input pack.
- Reject unsafe activation flags.
- Reject input pack not marked `USABLE_FOR_REPLAY`.
- Reject contaminated candle deltas.
- Reject duplicate timestamps.
- Reject non-monotonic timestamps.
- Reject forbidden source inventory paths.

## Replay Behavior

The runner performs local deterministic review only:

- Read `manifest.json`.
- Read `data_quality_report.json`.
- Read `source_file_inventory.json`.
- Read `candles_5m.jsonl`, `candles_15m.jsonl`, and `candles_1h.jsonl`.
- Read `d8_snapshots.jsonl` as optional point-in-time diagnostic input.
- Walk the selected evaluation timeframe in timestamp order.
- Produce replay events with timestamp, timeframe, candle close, available higher-timeframe context, available snapshot status, and review-only evidence fields.
- Use `buildHistoricalReplayPoints` and `evaluateHistoricalReplayCandidateScarcityReview` only when enough point shape can be created without fabrication.
- Record regime/grid/trend evidence only when derivable from existing pure helpers or explicit pack evidence.
- Record no-trade reasons when no setup or no safe evidence exists.
- Record candidate entries and exits only as simulated review evidence, not as orders or paper fills.
- Preserve missing evidence as missing.
- Produce deterministic output from identical inputs.

The runner must not:

- Create orders.
- Create paper orders.
- Call broker adapters.
- Call paper execution engine.
- Call API routes.
- Call private exchange clients.
- Read env files.
- Read secrets.
- Read `config/db.php`.
- Upload to server.
- Write to server.
- Write runtime JSON or JSONL inside the active repo.
- Mutate the L6 input pack.

## Metrics

`replay_summary.json` must include:

- `replayStart`
- `replayEnd`
- `candlesConsumed` by timeframe
- `evaluationPoints`
- `gridEligibilityDecisions`
- `trendReviewDecisions`
- `noTradeReasonCounts`
- `candidateEntryCount`
- `candidateExitCount`
- `closedCycleCount`
- `expectancy`, only when closed cycles exist
- `grossPnlEstimate`, only when evidence supports it
- `costAdjustedPnlEstimate`, only when cost evidence supports it
- `missingEvidenceFields`
- `limitations`
- `passFailStatus`
- `nextAction`

`replay_events.jsonl` must include one deterministic event per evaluation point with:

- `evaluatedAt`
- `timeframe`
- `close`
- `sourceCandleLine`
- `hasD8Snapshot`
- `gridEligibility`
- `trendReviewStatus`
- `noTradeReason`
- `candidateEntryReview`
- `candidateExitReview`
- `blockers`
- `activationAllowed=false`
- `paperActivationAllowed=false`
- `liveActivationAllowed=false`
- `reviewOnly=true`
- `shadowOnly=true`

## Required Limitations

`replay_limitations.json` must explicitly report:

- `d8SnapshotsMissing = true` when `d8_snapshots.jsonl` has `0` rows.
- `sampleBelow500 = true` for the current L6 pack because each timeframe has `199` candles.
- `d8_5ApprovalAllowed = false`.
- `continuationApprovalAllowed = false`.
- `activationAllowed = false`.
- `profitabilityClaimAllowed = false`.
- `paperOrLiveApprovalAllowed = false`.
- `missingClosedCyclesMeans = "EDGE_UNPROVEN_NOT_STRATEGY_FAILURE"`.
- `missingD8SnapshotsMeans = "D8_DIAGNOSTICS_UNAVAILABLE_NOT_STRATEGY_FAILURE"`.

## Pass And Fail Interpretation

L7 pass means:

- Runner executed safely.
- Output files are complete.
- Output is deterministic.
- Evidence is interpretable.
- Input pack was not mutated.
- Server, repo runtime, order, execution, API, env, and config boundaries were not touched.

L7 pass does not mean:

- Strategy is profitable.
- Bot is ready.
- D8.5 is approved.
- Continuation branch is approved.
- Paper activation is approved.
- Live activation is approved.

Block or fail when:

- Input pack is invalid.
- Output path is inside repo.
- Any activation flag is true.
- Any broker/order/execution/API path is referenced by implementation imports.
- Output is non-deterministic.
- Timeframe data is contaminated.
- Required output files are missing.
- Input pack bytes change during run.

## Forbidden Imports And References

The runner implementation must not import or reference:

- `PaperBrokerAdapter`
- `dashboard/lib/broker`
- `dashboard/lib/execution`
- paper execution engine
- order placement helpers
- approval routes
- `dashboard/app/api`
- private exchange clients
- `.env`
- secrets
- `config/db.php`
- live trading routes
- paper/live activation controls

Safety scan command for the future implementation:

```powershell
Select-String `
  -Path "tools/local-replay/run-d8-4-2-one-shot-local-replay.ts","tools/local-replay/run-d8-4-2-one-shot-local-replay.test.ts" `
  -Pattern "PaperBrokerAdapter|dashboard/lib/broker|dashboard/lib/execution|paperExecution|placeOrder|createOrder|cancelOrder|approval|dashboard/app/api|private exchange|process\\.env|\\.env|secret|config/db\\.php|liveActivation|paperActivation" `
  -CaseSensitive:$false
```

Expected result:

```text
No unsafe implementation hits except assertion text in tests proving rejection.
```

## Task 1: CLI Guard Contract And RED Tests

**Files:**

- Create: `tools/local-replay/run-d8-4-2-one-shot-local-replay.test.ts`
- Create: `tools/local-replay/run-d8-4-2-one-shot-local-replay.ts`

- [ ] **Step 1: Write RED tests for CLI guards**

Add tests named:

```ts
test("rejects missing input pack", async () => {});
test("rejects output root inside active repo", async () => {});
test("rejects input pack inside active repo", async () => {});
test("requires one-shot flag", async () => {});
test("rejects unsafe activation flags", async () => {});
```

Each test must create temporary directories outside the repo and call exported pure functions such as `parseReplayArgs`, `validateReplayPaths`, and `validatePackManifest`.

- [ ] **Step 2: Run RED tests**

Run:

```powershell
node --test --experimental-strip-types tools/local-replay/run-d8-4-2-one-shot-local-replay.test.ts
```

Expected result:

```text
FAIL because the runner module and guard functions do not exist.
```

- [ ] **Step 3: Implement minimal guard functions**

Implement exported functions:

- `parseReplayArgs(argv: string[]): ReplayCliOptions`
- `validateReplayPaths(options: ReplayCliOptions, activeRepoRoot: string): ReplayPathValidation`
- `validatePackManifest(manifest: unknown, dataQualityReport: unknown): ReplayPackValidation`

The first green implementation may return guard results without reading candle files.

- [ ] **Step 4: Run guard tests**

Run:

```powershell
node --test --experimental-strip-types tools/local-replay/run-d8-4-2-one-shot-local-replay.test.ts
```

Expected result:

```text
PASS for CLI guard tests.
```

## Task 2: Pack Reader And Candle Integrity Tests

**Files:**

- Modify: `tools/local-replay/run-d8-4-2-one-shot-local-replay.ts`
- Modify: `tools/local-replay/run-d8-4-2-one-shot-local-replay.test.ts`

- [ ] **Step 1: Write RED tests for input pack reading**

Add tests named:

```ts
test("rejects missing required pack files", async () => {});
test("rejects contaminated candle deltas", async () => {});
test("rejects duplicate candle timestamps", async () => {});
test("accepts clean L6-shaped pack fixture", async () => {});
test("reports d8 snapshots zero as limitation not failure", async () => {});
```

Fixture candles must use `199` rows per timeframe for the clean case and intentionally mixed deltas for the contaminated case.

- [ ] **Step 2: Run RED tests**

Run:

```powershell
node --test --experimental-strip-types tools/local-replay/run-d8-4-2-one-shot-local-replay.test.ts
```

Expected result:

```text
FAIL on missing pack reader and candle integrity validation.
```

- [ ] **Step 3: Implement pack reader**

Implement exported functions:

- `readReplayInputPack(inputPack: string): Promise<ReplayInputPack>`
- `readJsonlFile(path: string): Promise<unknown[]>`
- `auditCandleSeries(rows: unknown[], expectedMinutes: number): CandleAudit`
- `buildReplayLimitations(pack: ReplayInputPack): ReplayLimitations`

The reader must not modify files and must not create output directories.

- [ ] **Step 4: Run pack reader tests**

Run:

```powershell
node --test --experimental-strip-types tools/local-replay/run-d8-4-2-one-shot-local-replay.test.ts
```

Expected result:

```text
PASS for pack reader and candle integrity tests.
```

## Task 3: Deterministic Replay Summary Tests

**Files:**

- Modify: `tools/local-replay/run-d8-4-2-one-shot-local-replay.ts`
- Modify: `tools/local-replay/run-d8-4-2-one-shot-local-replay.test.ts`

- [ ] **Step 1: Write RED tests for deterministic output**

Add tests named:

```ts
test("produces deterministic output across repeated runs", async () => {});
test("no closed cycles means edge unproven not failure", async () => {});
test("sample below 500 blocks D8.5 and continuation approval", async () => {});
test("summary carries forced safe activation flags", async () => {});
```

- [ ] **Step 2: Run RED tests**

Run:

```powershell
node --test --experimental-strip-types tools/local-replay/run-d8-4-2-one-shot-local-replay.test.ts
```

Expected result:

```text
FAIL because replay summary construction does not exist.
```

- [ ] **Step 3: Implement summary builder**

Implement exported functions:

- `buildReplayEvents(pack: ReplayInputPack): ReplayEvent[]`
- `buildReplaySummary(pack: ReplayInputPack, events: ReplayEvent[]): ReplaySummary`
- `buildReplaySafetyAudit(options: ReplayCliOptions, pack: ReplayInputPack): ReplaySafetyAudit`

The first implementation must classify unavailable D8 snapshots and missing closed cycles as limitations, not strategy failure.

- [ ] **Step 4: Run deterministic summary tests**

Run:

```powershell
node --test --experimental-strip-types tools/local-replay/run-d8-4-2-one-shot-local-replay.test.ts
```

Expected result:

```text
PASS for deterministic replay summary tests.
```

## Task 4: Writer Boundary Tests

**Files:**

- Modify: `tools/local-replay/run-d8-4-2-one-shot-local-replay.ts`
- Modify: `tools/local-replay/run-d8-4-2-one-shot-local-replay.test.ts`

- [ ] **Step 1: Write RED tests for output writes**

Add tests named:

```ts
test("writes only to output root", async () => {});
test("refuses to overwrite an existing output root", async () => {});
test("does not mutate the input pack", async () => {});
test("writes all required replay output files", async () => {});
```

The input pack mutation test must hash or byte-read every input file before and after the run.

- [ ] **Step 2: Run RED tests**

Run:

```powershell
node --test --experimental-strip-types tools/local-replay/run-d8-4-2-one-shot-local-replay.test.ts
```

Expected result:

```text
FAIL because the output writer does not exist.
```

- [ ] **Step 3: Implement local-only writer**

Implement exported functions:

- `writeReplayOutputs(outputRoot: string, result: ReplayRunResult): Promise<void>`
- `runOneShotReplay(options: ReplayCliOptions): Promise<ReplayRunResult>`

The writer must create only:

- `replay_manifest.json`
- `replay_summary.json`
- `replay_events.jsonl`
- `replay_limitations.json`
- `replay_safety_audit.json`

- [ ] **Step 4: Run writer tests**

Run:

```powershell
node --test --experimental-strip-types tools/local-replay/run-d8-4-2-one-shot-local-replay.test.ts
```

Expected result:

```text
PASS for writer boundary tests.
```

## Task 5: Static Safety And CLI Smoke

**Files:**

- Modify: `tools/local-replay/run-d8-4-2-one-shot-local-replay.ts`
- Modify: `tools/local-replay/run-d8-4-2-one-shot-local-replay.test.ts`

- [ ] **Step 1: Add tests for forbidden imports and references**

Add a test that reads `tools/local-replay/run-d8-4-2-one-shot-local-replay.ts` and fails if implementation code contains forbidden imports or references.

- [ ] **Step 2: Run focused test suite**

Run:

```powershell
node --test --experimental-strip-types tools/local-replay/run-d8-4-2-one-shot-local-replay.test.ts
```

Expected result:

```text
PASS all L7 runner tests.
```

- [ ] **Step 3: Run TypeScript check using dashboard toolchain**

Run from repo root:

```powershell
cd dashboard
node ./node_modules/typescript/bin/tsc --noEmit --incremental false --allowImportingTsExtensions --module NodeNext --moduleResolution NodeNext --target ES2022 --types node ../tools/local-replay/run-d8-4-2-one-shot-local-replay.ts ../tools/local-replay/run-d8-4-2-one-shot-local-replay.test.ts
```

Expected result:

```text
PASS with no TypeScript errors.
```

- [ ] **Step 4: Run dry CLI smoke against temporary fixture only**

Use a temporary pack outside the repo and a temporary output root outside the repo. Do not use the real local mirror pack during tests unless explicitly approved.

Expected result:

```text
The temporary output root contains exactly five expected files and no input files changed.
```

## Task 6: Release Hygiene For Future Implementation

**Files:**

- Stage only after separate release approval:
  - `tools/local-replay/run-d8-4-2-one-shot-local-replay.ts`
  - `tools/local-replay/run-d8-4-2-one-shot-local-replay.test.ts`

Future release must prove:

- no replay output committed
- no runtime JSON or JSONL committed
- no local mirror pack committed
- no `research-runs` committed
- no `.env`, secrets, or `config/db.php`
- no broker/order/execution/API route changes
- no D8.5 staged
- no continuation branch files staged
- no unrelated dirty or untracked files staged
- no `git add .`

Future release validation commands:

```powershell
git status --short
git diff --name-only
git diff --check -- `
  tools/local-replay/run-d8-4-2-one-shot-local-replay.ts `
  tools/local-replay/run-d8-4-2-one-shot-local-replay.test.ts

node --test --experimental-strip-types tools/local-replay/run-d8-4-2-one-shot-local-replay.test.ts

cd dashboard
node ./node_modules/typescript/bin/tsc --noEmit --incremental false --allowImportingTsExtensions --module NodeNext --moduleResolution NodeNext --target ES2022 --types node ../tools/local-replay/run-d8-4-2-one-shot-local-replay.ts ../tools/local-replay/run-d8-4-2-one-shot-local-replay.test.ts
```

## Validation For This Plan-Only Task

Required checks now:

- marker scan
- unfinished-work marker scan using the repo standard blocked terms
- trailing whitespace scan
- `git diff --check`
- confirm only this plan file changed for this task
- confirm no code or test files changed
- confirm no runtime JSON or JSONL changed in the repository
- confirm no generated replay output changed
- confirm no replay run
- confirm no files staged
- confirm no commit or push

Expected result for this task:

```text
Only docs/superpowers/plans/2026-06-29-l7-one-shot-local-replay-runner-implementation-plan.md changes.
No runner code.
No replay run.
No generated output.
No staging.
No commit.
No push.
```
