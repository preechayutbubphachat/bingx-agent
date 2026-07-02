# D8 Diagnostics Input Capture Write Preflight Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans only after later implementation approval. This Phase 6G document is docs-only and must not be treated as approval to write local mirror data, call exporter write helpers, run producers, run collectors, run L5 apply, or run L7 replay.

**Goal:** Define the preflight gate for a later controlled diagnostics input capture/write phase that can persist producer-compatible diagnostics input rows from already-computed `paperLoopDiagnostics` output.

**Architecture:** Keep the evidence flow separated into computed diagnostics, diagnostics input JSONL, producer diagnostics output, collector final snapshots, L5 pack build, and L7 replay. The later capture/write phase may only persist rows that already exist as `d8SnapshotDiagnosticsInput` on `paperLoopDiagnostics`, and only after dry-run validation and explicit write approval.

**Tech Stack:** TypeScript, Node test runner with `--experimental-strip-types`, dashboard paper diagnostics modules, local-only replay tools, guarded JSONL evidence paths.

---

## Roadmap Gate

Roadmap gate remains:

```text
D8 Snapshot Capture & Replay Evidence Repair
```

This plan is docs-only. It does not implement code, write the local mirror, create `d8-diagnostics-input`, call exporter write helpers, run the producer, run the collector, run L5 apply, run L7 replay, stage files, commit files, push files, touch D8.5, touch continuation, or change activation, order, execution, API, env, config, secret, or network paths.

## Problem Statement

Phase 6F read-only discovery found no real local mirror JSONL rows containing:

- `d8SnapshotDiagnosticsInput`
- `d8PointInTimeSnapshot`
- exportable D8 diagnostics input fields such as `evaluatedAt`, `sourceTimeframe`, and `diagnostics`

The Phase 6F mirror evidence stayed unchanged:

- no diagnostics output paths were created
- no exporter write helper was called
- no producer was run
- no collector was run
- no L5 apply was run
- no L7 replay was run

Phase 6E released in-memory support at `7d94b38f788e6cf261d14138d2bf162466d75269`: `buildPaperLoopDiagnostics` now exposes `d8SnapshotDiagnosticsInput` as an in-memory/read-only producer-compatible row. That row is not persisted anywhere. Therefore a controlled capture/write step is required before any producer dry-run can consume real diagnostics input rows.

The next gate must not promote partial evidence into D8 truth. It must persist only already-computed `paperLoopDiagnostics.d8SnapshotDiagnosticsInput` rows, and it must do so under a strict local-only path guard after a dry-run proves the rows are valid.

## Approved Capture Source

The only approved capture source is already-computed `paperLoopDiagnostics` output containing:

- `d8SnapshotDiagnosticsInput`
- `d8SnapshotDiagnosticsInput.evaluatedAt`
- `d8SnapshotDiagnosticsInput.source`
- `d8SnapshotDiagnosticsInput.sourceTimeframe`
- `d8SnapshotDiagnosticsInput.diagnostics`
- `d8SnapshotDiagnosticsInput.d8PointInTimeSnapshot`
- `d8SnapshotDiagnosticsInput.safety`

The captured row must validate with the dashboard exporter row-shape validator:

```text
validateD8SnapshotDiagnosticsInputRowShape(row).valid = true
```

The safety flags must remain:

```text
activationAllowed = false
paperActivationAllowed = false
liveActivationAllowed = false
reviewOnly = true
shadowOnly = true
```

Explicitly rejected as D8 diagnostics input truth:

- `latest_decision.json` as historical truth
- `market_snapshot.json` as historical truth
- `dashboard/tmp/trend-paper/*.jsonl` partial trend-paper rows as final D8 truth
- `dashboard/tmp/execution-runner/paper_no_trade.jsonl` partial no-trade rows as final D8 truth
- `dashboard/tmp/execution-runner/regrid_candidate.jsonl` partial regrid rows as final D8 truth
- `dashboard/tmp/execution-runner/regrid_readiness.jsonl` partial regrid rows as final D8 truth
- execution-runner implementation dependencies
- API, broker, order, execution, env, config, secret, and network paths

## Approved Output Path

A future controlled write may target only:

```text
C:/2025/ob-gate-local-mirror/httpdocs/dashboard/tmp/d8-diagnostics-input/
```

Allowed file example:

```text
C:/2025/ob-gate-local-mirror/httpdocs/dashboard/tmp/d8-diagnostics-input/d8_diagnostics_input.jsonl
```

The capture/write phase must not write:

- active repo paths under `C:/2025/web-69/ob-gate17-200369/httpdocs`
- `source`
- `staging`
- `server`
- `research-packs`
- `research-runs`
- final `dashboard/tmp/d8-snapshots`
- producer output path `dashboard/tmp/d8-snapshot-diagnostics` unless separately approved
- `.env`, secrets, API keys, or `config/db.php`

## Capture Write Mode

The later capture/write phase must run in this order:

1. Preflight guard.
2. Dry-run/in-memory validation.
3. Report candidate counters.
4. Stop unless explicit apply/write approval is granted in a later request.
5. After explicit approval, write append-only JSONL to the approved output path only.
6. Recompute deterministic fingerprints and report exactly which paths changed.

Preflight guard requirements:

- confirm branch and sync state
- confirm active repo path
- confirm local mirror path is outside active repo
- confirm `localMirrorStatus.status = FRESH`
- confirm index is empty before any staging request
- record local mirror count and total bytes
- record content inventory fingerprint
- record metadata-aware fingerprint separately
- record existence state of `d8-diagnostics-input`, `d8-snapshot-diagnostics`, and `d8-snapshots`

Dry-run validation requirements:

- inspect only approved in-memory `paperLoopDiagnostics.d8SnapshotDiagnosticsInput` rows
- validate row shape in memory
- validate `d8PointInTimeSnapshot`
- validate safety flags exactly
- compute duplicate `evaluatedAt` outcomes without writing
- report `inputRowsInspected`
- report `candidateRows`
- report `validRows`
- report `rowsRejected`
- report `missingEvaluatedAt`
- report `missingSource`
- report `missingSourceTimeframe`
- report `missingDiagnostics`
- report `snapshotsPresent`
- report `snapshotsValid`
- report `duplicateEvaluatedAt`
- report blockers and warnings

Write requirements after later explicit approval:

- write append-only JSONL
- never overwrite existing valid rows
- reject malformed existing JSONL instead of replacing it
- reject duplicate `evaluatedAt` deterministically
- validate each row before write
- preserve row object values without mutation
- create the approved directory only after explicit write approval
- write no files outside the approved `d8-diagnostics-input` path

## Fingerprint Policy

Use the Phase 6E fingerprint policy.

Content inventory fingerprint:

- include normalized relative path and byte length for every included file
- include content hash for files below a bounded size limit
- for large files, include relative path, byte length, and last modified time separately in the evidence report
- sort paths case-insensitively after normalizing separators to `/`
- use this fingerprint as the primary proof of content change or no content change

Metadata-aware fingerprint:

- include normalized relative path, byte length, and last modified time ticks
- use this fingerprint to detect timestamp or metadata drift
- do not treat metadata-only drift as proof of content mutation without the content inventory fingerprint

Included paths:

- `dashboard/tmp/trend-paper/`
- `dashboard/tmp/historical-packs/`
- `dashboard/tmp/d8-diagnostics-input/` if it exists
- `dashboard/tmp/d8-snapshot-diagnostics/` if it exists
- `dashboard/tmp/d8-snapshots/` if it exists
- `localMirrorStatus.json`

Excluded paths:

- active repo paths
- local mirror `research-packs/`
- local mirror `research-runs/`
- `node_modules/`
- `.next/`
- caches and logs that are not approved D8 diagnostics input sources

Drift reporting:

- count, bytes, and content inventory fingerprint unchanged: `UNCHANGED`
- count and bytes stable but metadata-aware fingerprint drifted: `METADATA_DRIFT_NOT_CONTENT_PROVEN`
- count changed: `CONTENT_INVENTORY_CHANGED`
- bytes changed: `CONTENT_INVENTORY_CHANGED`
- included file content hash changed: `CONTENT_INVENTORY_CHANGED`

Future write acceptance:

- before explicit write, fingerprints must be recorded
- after explicit write, changed paths must be limited to the approved `dashboard/tmp/d8-diagnostics-input/` path
- any change outside the approved path blocks producer, collector, L5, and L7 actions

## Future RED Tests

The later implementation must start with failing tests before production code.

### Test 1: no write by default

Expected assertion:

```ts
const result = await captureD8DiagnosticsInputRows({
  mode: "DRY_RUN",
  rows: [paperDiagnostics.d8SnapshotDiagnosticsInput],
  outputPath,
  activeRepoRoot,
  approvedDiagnosticsInputRoot,
});

assert.equal(result.wrote, false);
assert.equal(await exists(outputPath), false);
assert.equal(result.validRows, 1);
```

### Test 2: explicit write required

Expected assertion:

```ts
await assert.rejects(
  () => captureD8DiagnosticsInputRows({
    mode: "APPLY",
    rows: [paperDiagnostics.d8SnapshotDiagnosticsInput],
    outputPath,
    activeRepoRoot,
    approvedDiagnosticsInputRoot,
    explicitWriteApproved: false,
  }),
  /explicit_write_approval_required/,
);
```

### Test 3: rejects active repo path

Expected assertion:

```ts
await assert.rejects(
  () => captureD8DiagnosticsInputRows({
    mode: "APPLY",
    rows: [paperDiagnostics.d8SnapshotDiagnosticsInput],
    outputPath: join(activeRepoRoot, "dashboard", "tmp", "d8-diagnostics-input", "x.jsonl"),
    activeRepoRoot,
    approvedDiagnosticsInputRoot,
    explicitWriteApproved: true,
  }),
  /output_path_inside_active_repo/,
);
```

### Test 4: rejects research output paths

Expected rejection paths:

```ts
[
  join(approvedLocalMirrorRoot, "research-packs", "d8-diagnostics-input.jsonl"),
  join(approvedLocalMirrorRoot, "research-runs", "d8-diagnostics-input.jsonl"),
]
```

Each case must throw an `output_path_` error.

### Test 5: rejects final snapshot path

Expected assertion:

```ts
await assert.rejects(
  () => captureD8DiagnosticsInputRows({
    mode: "APPLY",
    rows: [paperDiagnostics.d8SnapshotDiagnosticsInput],
    outputPath: join(approvedLocalMirrorRoot, "dashboard", "tmp", "d8-snapshots", "d8_snapshots.jsonl"),
    activeRepoRoot,
    approvedDiagnosticsInputRoot,
    explicitWriteApproved: true,
  }),
  /output_path_final_snapshot_path_forbidden/,
);
```

### Test 6: rejects source, staging, and server paths

Expected rejection paths:

```ts
[
  join(approvedLocalMirrorRoot, "source", "dashboard", "tmp", "d8-diagnostics-input", "x.jsonl"),
  join(approvedLocalMirrorRoot, "staging", "dashboard", "tmp", "d8-diagnostics-input", "x.jsonl"),
  join(approvedLocalMirrorRoot, "server", "dashboard", "tmp", "d8-diagnostics-input", "x.jsonl"),
]
```

Each case must throw an `output_path_` error.

### Test 7: rejects missing evaluatedAt and sourceTimeframe

Expected assertion:

```ts
for (const badRow of [
  { ...row, evaluatedAt: undefined },
  { ...row, sourceTimeframe: undefined },
]) {
  const result = await captureD8DiagnosticsInputRows({
    mode: "DRY_RUN",
    rows: [badRow],
    outputPath,
    activeRepoRoot,
    approvedDiagnosticsInputRoot,
  });

  assert.equal(result.validRows, 0);
  assert.equal(result.rowsRejected, 1);
}
```

### Test 8: accepts paperLoopDiagnostics d8SnapshotDiagnosticsInput

Expected assertion:

```ts
const diagnostics = buildPaperLoopDiagnostics(summary({
  checkedAt: "2026-06-30T00:00:00.000Z",
  recentEvents: [],
}));

const result = await captureD8DiagnosticsInputRows({
  mode: "DRY_RUN",
  rows: [diagnostics.d8SnapshotDiagnosticsInput],
  outputPath,
  activeRepoRoot,
  approvedDiagnosticsInputRoot,
});

assert.equal(result.validRows, 1);
assert.equal(result.rows[0].source, "paper-loop-diagnostics");
assert.equal(result.rows[0].sourceTimeframe, "5M");
```

### Test 9: forces safety flags false and true

Expected assertion:

```ts
assert.deepEqual(result.rows[0].safety, {
  activationAllowed: false,
  paperActivationAllowed: false,
  liveActivationAllowed: false,
  reviewOnly: true,
  shadowOnly: true,
});
assert.equal(result.rows[0].d8PointInTimeSnapshot.activationAllowed, false);
assert.equal(result.rows[0].d8PointInTimeSnapshot.paperActivationAllowed, false);
assert.equal(result.rows[0].d8PointInTimeSnapshot.liveActivationAllowed, false);
assert.equal(result.rows[0].d8PointInTimeSnapshot.reviewOnly, true);
assert.equal(result.rows[0].d8PointInTimeSnapshot.shadowOnly, true);
```

### Test 10: duplicate evaluatedAt deterministic handling

Expected assertion:

```ts
const result = await captureD8DiagnosticsInputRows({
  mode: "DRY_RUN",
  rows: [row, { ...row }],
  outputPath,
  activeRepoRoot,
  approvedDiagnosticsInputRoot,
});

assert.equal(result.validRows, 1);
assert.equal(result.duplicateEvaluatedAt, 1);
assert.equal(result.rowsRejected, 1);
```

### Test 11: producer can dry-run emitted diagnostics input in temp fixture

Expected assertion:

```ts
const capture = await captureD8DiagnosticsInputRows({
  mode: "APPLY",
  rows: [paperDiagnostics.d8SnapshotDiagnosticsInput],
  outputPath,
  activeRepoRoot,
  approvedDiagnosticsInputRoot,
  explicitWriteApproved: true,
});

const producer = await produceD8SnapshotDiagnostics({
  mode: "DRY_RUN",
  inputPath: outputPath,
  outputPath: join(approvedLocalMirrorRoot, "dashboard", "tmp", "d8-snapshot-diagnostics", "diagnostics.jsonl"),
  activeRepoRoot,
  approvedLocalMirrorRoot,
});

assert.equal(capture.wrote, true);
assert.equal(producer.mode, "DRY_RUN");
assert.equal(producer.wrote, false);
assert.equal(producer.validSnapshotCount, 1);
```

This test must use a temp fixture only, not the real local mirror.

### Test 12: no forbidden imports

Production capture/write files must not import or reference:

```ts
for (const term of [
  "api",
  "broker",
  "order",
  "execution",
  "process.env",
  "config",
  "secret",
  "network",
  "fetch",
]) {
  assert.equal(source.toLowerCase().includes(term.toLowerCase()), false);
}
```

## Acceptance Criteria For Later Implementation Or Run

The later implementation or controlled run is acceptable only if:

- no strategy behavior is mutated
- no paper/live activation is introduced
- no order simulation or order placement is introduced
- no private exchange call is introduced
- no API, broker, order, execution, env, config, secret, or network path is used
- no L5 apply is run
- no L7 replay is run
- no D8.5 work is touched
- no continuation work is touched
- only the approved local mirror tmp diagnostics input path may change after explicit approval
- all changed paths are reported with before/after fingerprints
- producer dry-run remains a separate later approval
- collector remains a separate later approval
- final `d8-snapshots` remains a separate later approval

## Validation Plan For This Docs-Only Change

Run these checks after saving this plan:

```powershell
git diff --check -- docs/superpowers/plans/2026-06-29-d8-diagnostics-input-capture-write-preflight-plan.md
Select-String -Path docs/superpowers/plans/2026-06-29-d8-diagnostics-input-capture-write-preflight-plan.md -Pattern '[ \t]$'
git diff --name-only -- docs/superpowers/plans/2026-06-29-d8-diagnostics-input-capture-write-preflight-plan.md
git diff --cached --name-only
```

Expected result:

- only `docs/superpowers/plans/2026-06-29-d8-diagnostics-input-capture-write-preflight-plan.md` is changed by this task
- no staged files
- no code implementation
- no local mirror write
- no exporter write helper call
- no producer run
- no collector run
- no L5 apply
- no L7 replay
- D8.5 remains HOLD
- continuation remains NOT APPROVED
- activation, order, execution, API, env, and config paths remain untouched by this task
