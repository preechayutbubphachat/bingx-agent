# D8 Diagnostics Input Source Wiring Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans only after a later implementation approval. This Phase 6E document is docs-only and must not be treated as approval to write local mirror data, run exporters, run producers, run collectors, run L5 apply, or run L7 replay.

**Goal:** Define the smallest safe future path for producing approved diagnostics input rows from already-computed paper diagnostics.

**Architecture:** Keep D8 evidence construction separated into three controlled boundaries: computed paper diagnostics, diagnostics input rows, and final D8 snapshot journal rows. The next implementation should expose or persist approved diagnostics input rows only under a guarded local-only diagnostics input path, then let the already guarded producer and collector handle later steps under separate approvals.

**Tech Stack:** TypeScript, Node test runner with `--experimental-strip-types`, dashboard paper diagnostics modules, local-only replay tools, JSONL evidence files.

---

## Roadmap Gate

Roadmap gate remains:

```text
D8 Snapshot Capture & Replay Evidence Repair
```

This plan is docs-only. It does not implement code, write the local mirror, run the exporter, run the producer, run the collector, run L5 apply, run L7 replay, stage files, commit files, push files, touch D8.5, touch continuation, or change activation, order, execution, API, env, or config paths.

## Problem Statement

Phase 6D found no approved producer/exporter-compatible diagnostics input in the real local mirror. Because no approved input existed, the exporter was not run, the producer was not run, the collector was not run, and no `dashboard/tmp/d8-snapshot-diagnostics` or `dashboard/tmp/d8-snapshots` path was created.

The current local mirror candidates are partial only:

- `dashboard/tmp/trend-paper/trend_paper_evidence_decisions.jsonl` has trend paper evidence fields and timestamps, but no approved diagnostics input shape, no `sourceTimeframe`, and no canonical `d8PointInTimeSnapshot`.
- `dashboard/tmp/execution-runner/paper_no_trade.jsonl` has paper no-trade runtime context, but no approved D8 diagnostics input shape.
- `dashboard/tmp/execution-runner/regrid_candidate.jsonl` has grid regrid context, but no approved D8 diagnostics input shape.
- `dashboard/tmp/execution-runner/regrid_readiness.jsonl` has grid readiness context, but no approved D8 diagnostics input shape.
- `latest_decision` and `market_snapshot` style sources are single-point or market-state evidence, not point-in-time D8 diagnostics input.

No source should be promoted into D8 replay evidence without the approved diagnostics input shape. Fabricating rows from partial trend, no-trade, regrid, latest-decision, or market-snapshot evidence would hide the real bottleneck and weaken the replay gate.

## Approved Source Definition

An approved diagnostics input source must meet all of these conditions:

- It is an already-computed paper diagnostics object, not an API fetch and not a broker, order, execution, env, or config dependency.
- It has a valid `evaluatedAt` timestamp that represents the diagnostics evaluation time.
- It has a non-empty `source` value that identifies the diagnostic boundary that produced the row.
- It has `sourceTimeframe` as one of the canonical D8 snapshot timeframes accepted by `dashboard/lib/paper/d8PointInTimeSnapshot.ts`: `5M`, `15M`, or `1H`.
- It contains a `diagnostics` payload compatible with `createD8SnapshotDiagnosticsInputRow` in `dashboard/lib/paper/d8SnapshotDiagnosticsInputExporter.ts`.
- The `diagnostics` payload contains an existing valid `d8PointInTimeSnapshot`, or it contains enough already-computed D8 diagnostic fields for the existing capture helper to deterministically build one.
- The safe fields are forced to this policy at the exported row and snapshot boundary:

```text
activationAllowed = false
paperActivationAllowed = false
liveActivationAllowed = false
reviewOnly = true
shadowOnly = true
```

The diagnostics payload may include these already-computed D8 fields when they exist:

- `alignedContext`
- `d8_0AlignedCandidate`
- `rrReady`
- `triggerReached`
- `zoneTouched`
- `confirmationWindowActive`
- `confirmationAligned`
- `promotableReviewCandidate`
- `bottleneckStatus`
- `triggerDistanceClass`
- `sourceSafetyValid`
- `dataQualityValid`
- `entryCandidateResolution`
- `pullbackTriggerThresholds`
- `pullbackZoneTouchEvidence`
- `touchAwareConfirmationReview`
- `noReviewCandidateBottleneckResolver`
- `d8PointInTimeSnapshot`

## Candidate Wiring Classification

| Candidate | Classification | Reason |
| --- | --- | --- |
| `dashboard/lib/paper/paperLoopDiagnostics.ts` output boundary | APPROVED_FUTURE_SOURCE_HOOK | The diagnostics object already computes D8-related fields, including `entryCandidateResolution`, `pullbackTriggerThresholds`, `pullbackZoneTouchEvidence`, `touchAwareConfirmationReview`, `noReviewCandidateBottleneckResolver`, and `d8PointInTimeSnapshot`. It still needs a separately approved export boundary that adds `source` and canonical `sourceTimeframe` without changing strategy behavior. |
| `dashboard/lib/paper/d8SnapshotDiagnosticsInputExporter.ts` | APPROVED_EXPORTER_BOUNDARY | The pure `createD8SnapshotDiagnosticsInputRow` function can build a producer-compatible row from approved inputs. Its write helper is guarded and must remain separated from default dry-run use. |
| `C:/2025/ob-gate-local-mirror/httpdocs/dashboard/tmp/d8-diagnostics-input/` | APPROVED_FUTURE_OUTPUT_PATH | This is the approved diagnostics input output root for a future local-only source step. It did not exist during Phase 6D and must be created only by a later approved write step. |
| `C:/2025/ob-gate-local-mirror/httpdocs/dashboard/tmp/d8-snapshot-diagnostics/` | PRODUCER_INTERMEDIATE_ONLY | This path belongs to the producer output stage, not the diagnostics input source stage. It must not be created by the source wiring step. |
| `C:/2025/ob-gate-local-mirror/httpdocs/dashboard/tmp/d8-snapshots/` | FINAL_SNAPSHOT_OUTPUT_ONLY | This path belongs to the collector/final snapshot stage. The diagnostics input source step must never write final snapshots directly. |
| `dashboard/tmp/trend-paper/trend_paper_evidence_decisions.jsonl` | PARTIAL_NON_APPROVED | It has trend evidence and timestamps but lacks approved diagnostics input shape, `sourceTimeframe`, and canonical D8 snapshot rows. |
| `dashboard/tmp/execution-runner/paper_no_trade.jsonl` | FORBIDDEN_DEPENDENCY | It is an execution-runner path and lacks approved D8 diagnostics input shape. It must not become the source for D8 evidence repair. |
| `dashboard/tmp/execution-runner/regrid_candidate.jsonl` | FORBIDDEN_DEPENDENCY | It is an execution-runner path, grid-focused, and lacks approved D8 diagnostics input shape. |
| `dashboard/tmp/execution-runner/regrid_readiness.jsonl` | FORBIDDEN_DEPENDENCY | It is an execution-runner path, grid-focused, and lacks approved D8 diagnostics input shape. |
| `latest_decision` | INSUFFICIENT_SINGLE_POINT_EVIDENCE | It can describe a current or recent decision but cannot prove point-in-time D8 diagnostics coverage. |
| `market_snapshot` | INSUFFICIENT_SINGLE_POINT_EVIDENCE | It can support market context but cannot substitute for already-computed D8 paper diagnostics rows. |

## Proposed Minimal Future Implementation

The smallest safe implementation path is:

1. Add a dashboard-local diagnostics input source function adjacent to the paper diagnostics boundary.
2. Feed it only an already-built `PaperLoopDiagnostics` object plus explicit metadata: `evaluatedAt`, `source`, and `sourceTimeframe`.
3. Call `createD8SnapshotDiagnosticsInputRow` in memory to produce a `D8SnapshotDiagnosticsInputRow`.
4. Keep the default path as dry-run/no-write.
5. Add an optional local-only writer for diagnostics input rows only if a later implementation request explicitly approves writing.
6. Guard that writer to this output root only:

```text
C:/2025/ob-gate-local-mirror/httpdocs/dashboard/tmp/d8-diagnostics-input/
```

7. Reject active repo paths, `source`, `staging`, `server`, `research-packs`, `research-runs`, and final snapshot paths.
8. Never write final `dashboard/tmp/d8-snapshots` rows directly from this source step.
9. Let the existing producer consume approved diagnostics input under a separate controlled phase.
10. Let the existing collector create final `d8-snapshots` under a separate controlled phase.

Recommended future file boundaries if separately approved:

- Create: `dashboard/lib/paper/d8DiagnosticsInputSource.ts`
- Create: `dashboard/lib/paper/d8DiagnosticsInputSource.test.ts`
- Optionally create: `dashboard/lib/paper/d8DiagnosticsInputWriter.ts`
- Optionally create: `dashboard/lib/paper/d8DiagnosticsInputWriter.test.ts`
- Modify only if needed: `dashboard/lib/paper/paperLoopDiagnostics.ts`
- Modify only if needed: `dashboard/lib/paper/paperLoopDiagnostics.test.ts`

The future implementation should not modify strategy behavior, trading decisions, paper/live activation, broker/order/execution paths, API routes, env files, config files, D8.5, or continuation files.

## Fingerprint Policy

Phase 6D found local mirror count and bytes unchanged, but hash unchanged was not confirmed. Future write/apply phases need deterministic fingerprint evidence before and after any approved write.

Use two fingerprints:

1. Content inventory fingerprint:
   - Include relative path and byte length for every included file.
   - Include a content hash for files below a bounded size limit.
   - For files above the limit, include relative path, byte length, and last modified time separately in the evidence report.
   - Sort paths case-insensitively after normalizing separators to `/`.

2. Metadata-aware fingerprint:
   - Include relative path, byte length, and last modified time ticks.
   - Use this only to detect timestamp or metadata drift.
   - Do not treat this as proof of content mutation without the content inventory fingerprint.

Included paths for source-step fingerprinting:

- `dashboard/tmp/trend-paper/`
- `dashboard/tmp/historical-packs/`
- `dashboard/tmp/d8-diagnostics-input/` if it exists
- `dashboard/tmp/d8-snapshot-diagnostics/` if it exists
- `dashboard/tmp/d8-snapshots/` if it exists
- `localMirrorStatus.json`

Excluded paths for source-step fingerprinting:

- Active repo paths under `C:/2025/web-69/ob-gate17-200369/httpdocs`
- Local mirror `research-packs/`
- Local mirror `research-runs/`
- `node_modules/`
- `.next/`
- caches and logs not used as approved D8 source input

Timestamp or metadata-only drift handling:

- If count and bytes are unchanged but metadata-aware hash changes, report the drift as `METADATA_DRIFT_NOT_CONTENT_PROVEN`.
- Do not proceed to write/apply when the approved phase requires unchanged fingerprint evidence unless the content inventory fingerprint is unchanged.
- If any count, byte, or content inventory fingerprint changes unexpectedly, stop and report before any producer, collector, L5, or L7 action.

Before any future write/apply:

- Capture included path list.
- Capture count, total bytes, content inventory fingerprint, and metadata-aware fingerprint.
- Capture absence or existing state of `dashboard/tmp/d8-diagnostics-input`, `dashboard/tmp/d8-snapshot-diagnostics`, and `dashboard/tmp/d8-snapshots`.

After any future write/apply:

- Recompute the same fingerprints.
- Attribute every intentional delta to the approved output path and expected file count.
- Stop if any unrelated path changes.

## Future RED Tests

Future implementation must start with failing tests before production code.

### Test 1: approved diagnostics input row shape

Command:

```powershell
node --test --experimental-strip-types dashboard/lib/paper/d8DiagnosticsInputSource.test.ts
```

Expected first failure before implementation:

```text
ERR_MODULE_NOT_FOUND
```

Required assertion after implementation:

```ts
assert.equal(row.schemaVersion, 1);
assert.equal(row.source, "paper-loop-diagnostics");
assert.equal(row.sourceTimeframe, "5M");
assert.equal(row.d8PointInTimeSnapshot.schemaVersion, 1);
assert.equal(row.safety.activationAllowed, false);
assert.equal(row.safety.paperActivationAllowed, false);
assert.equal(row.safety.liveActivationAllowed, false);
assert.equal(row.safety.reviewOnly, true);
assert.equal(row.safety.shadowOnly, true);
```

### Test 2: missing evaluatedAt rejection

Required assertion:

```ts
assert.throws(
  () => createApprovedDiagnosticsInputRow({
    source: "paper-loop-diagnostics",
    sourceTimeframe: "5M",
    diagnostics,
  }),
  /missing_required_field:evaluatedAt/,
);
```

### Test 3: missing sourceTimeframe rejection

Required assertion:

```ts
assert.throws(
  () => createApprovedDiagnosticsInputRow({
    evaluatedAt: "2026-06-30T00:00:00.000Z",
    source: "paper-loop-diagnostics",
    diagnostics,
  }),
  /invalid_source_timeframe/,
);
```

### Test 4: unsafe flags forced safe

Required assertion:

```ts
assert.deepEqual(row.safety, {
  activationAllowed: false,
  paperActivationAllowed: false,
  liveActivationAllowed: false,
  reviewOnly: true,
  shadowOnly: true,
});
assert.equal(row.d8PointInTimeSnapshot.activationAllowed, false);
assert.equal(row.d8PointInTimeSnapshot.paperActivationAllowed, false);
assert.equal(row.d8PointInTimeSnapshot.liveActivationAllowed, false);
assert.equal(row.d8PointInTimeSnapshot.reviewOnly, true);
assert.equal(row.d8PointInTimeSnapshot.shadowOnly, true);
```

### Test 5: no write by default

Required assertion:

```ts
const result = createApprovedDiagnosticsInputRow(input);
assert.equal(typeof result.evaluatedAt, "string");
assert.equal(await exists(outputPath), false);
```

### Test 6: path guard rejects unsafe targets

Required rejection cases:

```ts
[
  "C:/2025/web-69/ob-gate17-200369/httpdocs/dashboard/tmp/d8-diagnostics-input/x.jsonl",
  "C:/2025/ob-gate-local-mirror/httpdocs/source/dashboard/tmp/d8-diagnostics-input/x.jsonl",
  "C:/2025/ob-gate-local-mirror/httpdocs/staging/dashboard/tmp/d8-diagnostics-input/x.jsonl",
  "C:/2025/ob-gate-local-mirror/httpdocs/server/dashboard/tmp/d8-diagnostics-input/x.jsonl",
  "C:/2025/ob-gate-local-mirror/httpdocs/research-packs/x.jsonl",
  "C:/2025/ob-gate-local-mirror/httpdocs/research-runs/x.jsonl",
  "C:/2025/ob-gate-local-mirror/httpdocs/dashboard/tmp/d8-snapshots/x.jsonl",
]
```

Each case must throw an `output_path_` error.

### Test 7: no forbidden imports

Required scan terms for new production source and writer files:

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

### Test 8: fingerprint guard behavior

Required cases:

- unchanged count, bytes, and content inventory hash returns `UNCHANGED`.
- unchanged count and bytes with metadata-aware hash drift returns `METADATA_DRIFT_NOT_CONTENT_PROVEN`.
- changed count returns `CONTENT_INVENTORY_CHANGED`.
- changed bytes returns `CONTENT_INVENTORY_CHANGED`.
- changed included file content hash returns `CONTENT_INVENTORY_CHANGED`.
- changed excluded path does not affect the source-step content inventory fingerprint.

## Non-Goals

- No code implementation in this Phase 6E plan.
- No local mirror write.
- No exporter run.
- No producer run.
- No collector run.
- No real L5 apply.
- No L7 replay.
- No generated replay packs.
- No research runs.
- No D8.5 release or D8.5 work.
- No continuation approval or continuation work.
- No paper/live automation.
- No activation, order, execution, or API work.
- No env or config changes.
- No strategy tuning.

## Validation Plan For This Docs-Only Change

Run these checks after saving this plan:

```powershell
git diff --check -- docs/superpowers/plans/2026-06-29-d8-diagnostics-input-source-wiring-plan.md
Select-String -Path docs/superpowers/plans/2026-06-29-d8-diagnostics-input-source-wiring-plan.md -Pattern '[ \t]$'
git diff --name-only
git diff --cached --name-only
```

Expected result:

- Only `docs/superpowers/plans/2026-06-29-d8-diagnostics-input-source-wiring-plan.md` is changed by this task.
- No staged files.
- No code implementation.
- No local mirror write.
- No exporter, producer, or collector run.
- No L5 apply.
- No L7 replay.
- D8.5 remains HOLD.
- Continuation remains NOT APPROVED.
- Activation, order, execution, API, env, and config paths remain untouched by this task.
