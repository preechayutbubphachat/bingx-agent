# D8 Snapshot Capture And Replay Evidence Repair Plan

## Roadmap Gate

Roadmap gate moved to:

```text
D8 Snapshot Capture & Replay Evidence Repair Planning
```

This is a docs-only implementation plan. It does not implement capture code, run replay, generate replay output, copy local mirror JSON or JSONL into the repository, create repository `research-packs` or `research-runs`, touch D8.5, touch continuation, or alter activation, order, execution, API, env, or config paths.

## Problem Statement

The L7 runner is mechanically valid. The one-shot local replay executed safely and produced interpretable evidence with result:

```text
PASS_WITH_LIMITATIONS
```

The replay evidence remains limited because `d8_snapshots.jsonl` had `0` rows. The run produced:

- `NO_D8_SNAPSHOTS = 199`
- `candidateEntryCount = 0`
- `candidateExitCount = 0`
- `closedCycleCount = 0`
- `expectancy = null`
- `edgeStatus = EDGE_UNPROVEN_NO_CLOSED_CYCLES`

Therefore the local replay infrastructure is usable, but algorithm edge remains unproven. The current bottleneck is evidence coverage, not replay runner safety.

## Evidence Repair Objective

The repair objective is to capture or reconstruct point-in-time D8 snapshots and attach D8 diagnostics to future replay input packs while preserving all local-only replay safety boundaries.

Future repaired evidence should support:

- replay input packs with `d8_snapshots.jsonl` rows greater than `0`
- point-in-time D8 funnel diagnostics at or before each evaluation candle
- interpretable grid and trend review decisions in a later local-only replay
- explicit data-quality reporting for D8 snapshot coverage
- activation flags forced to false in every pack, replay result, and report

The repair must not claim edge, approve D8.5, approve continuation, activate paper/live, or alter strategy behavior.

## Point-In-Time Safety Rules

Every D8 snapshot row must carry a deterministic time boundary:

- `evaluatedAt`, `timestamp`, `openTime`, `closeTime`, or an equivalent normalized timestamp
- `sourceTimeframe`
- source file and source line or equivalent inventory reference
- schema version

Point-in-time rules:

- A snapshot must not use future candles.
- A snapshot must be matched only to candle data available at or before the current evaluation point.
- Any snapshot newer than the evaluation point must be rejected.
- Snapshot matching must use the latest valid snapshot at or before the evaluation time.
- Stale snapshot tolerance must be explicit, such as `maxSnapshotAgeMs`.
- A stale snapshot must be counted separately from a missing snapshot.
- Missing D8 snapshot evidence must be treated as a data-quality limitation, not a strategy failure.
- Contradictory snapshot timestamps must block replay evidence repair until inspected.

The existing `historicalReplayPointInTime` helper already models point-in-time snapshots as `evaluatedAt` plus `value`, and selects only snapshots whose timestamp is not newer than the evaluation point. The repair should build on that rule rather than invent a looser matcher.

## Candidate D8 Snapshot Sources

Read-only inspection found these candidate source categories:

### Existing Supported Destination

The L5 replay pack builder already includes `d8_snapshots.jsonl` in the planned pack files. The L7 runner already reads `d8_snapshots.jsonl` and reports `d8SnapshotsMissing` when it is empty.

Current limitation:

```text
There is no approved producer that fills d8_snapshots.jsonl with point-in-time D8 diagnostics.
```

### Historical Replay Point-In-Time Adapter

`dashboard/lib/trend/historicalReplayPointInTime.ts` supports supplied snapshots and prevents future leakage by choosing the latest snapshot whose timestamp is at or before the evaluation point.

Classification:

```text
APPROVED_MODEL_FOR_MATCHING
```

It is a pure helper and should define the point-in-time matching semantics for repaired D8 evidence.

### Trend Paper Journals

`dashboard/lib/trend/trendPaperJournalSchema.ts` and `dashboard/lib/trend/trendPaperJournalWriter.ts` include timestamped trend paper events and optional enrichment fields such as regime, indicators, and trend zone context.

Classification:

```text
NEEDS_OPERATOR_APPROVAL_AND_SCHEMA_MAPPING
```

These journals may help enrich D8 evidence, but they are not a complete historical D8 funnel snapshot source by themselves. They must not be treated as full D8 truth unless a later mapping proves the required D8 fields are present point-in-time.

### Paper Loop Diagnostics

`dashboard/lib/paper/paperLoopDiagnostics.ts` imports the D8 trend evaluators and produces read-only diagnostics. This is a plausible future capture hook because it can observe D8 state without activating trading.

Classification:

```text
FUTURE_CAPTURE_HOOK_CANDIDATE
```

Using it requires a separate implementation task and tests. It must remain additive and read-only.

### latestDecision And marketSnapshot

The L6/L7 pack includes one `latestDecision` snapshot and one `marketSnapshot` snapshot.

Classification:

```text
INSUFFICIENT_SINGLE_POINT_EVIDENCE
```

These files can support inventory and current-state context, but they cannot prove historical D8 funnel state across `199` evaluation points.

### Direct API, Broker, Order, Or Live Sources

Direct API fetching, broker paths, execution paths, order paths, live capture, private exchange calls, and server writeback are forbidden for this repair gate.

Classification:

```text
FORBIDDEN
```

## Replay Pack Schema Repair Outline

A future replay input pack may extend the existing pack contract with point-in-time D8 diagnostics:

```text
d8_snapshots.jsonl
```

Proposed row shape:

```json
{
  "schemaVersion": 1,
  "source": "D8_POINT_IN_TIME_SNAPSHOT_V1",
  "evaluatedAt": "2026-06-20T18:00:00.000Z",
  "sourceTimeframe": "5M",
  "alignedContext": false,
  "d8_0AlignedCandidate": false,
  "rrReady": false,
  "d8_2Status": "UNKNOWN",
  "triggerReached": false,
  "d8_3Status": "UNKNOWN",
  "zoneTouched": false,
  "confirmationWindowActive": false,
  "d8_4Status": "UNKNOWN",
  "confirmationAligned": false,
  "promotableReviewCandidate": false,
  "bottleneckStatus": "NO_CONTEXT",
  "triggerDistanceClass": "UNKNOWN",
  "sourceSafetyValid": false,
  "dataQualityValid": false,
  "activationAllowed": false,
  "paperActivationAllowed": false,
  "liveActivationAllowed": false,
  "reviewOnly": true,
  "shadowOnly": true
}
```

Future `source_file_inventory.json` should classify D8 snapshot sources separately from candles, latest decision, market snapshot, and journal files.

Future `data_quality_report.json` should include:

- `d8SnapshotCount`
- `d8SnapshotCoverageRatio`
- `d8SnapshotMissingCount`
- `d8SnapshotStaleCount`
- `d8SnapshotFutureLeakCount`
- `d8SnapshotSchemaInvalidCount`
- `d8SnapshotDataQualityStatus`

## Data Quality Criteria

Minimum criteria for repaired D8 replay evidence:

- D8 snapshot coverage ratio must be reported.
- Aligned evaluation points must be counted.
- Missing snapshot count must be reported.
- Stale snapshot count must be reported.
- Future-leaking snapshot count must be `0`.
- Schema-invalid snapshot count must be `0` for replay-ready packs.
- Sample target must reach at least `500` evaluation points before edge discussion.
- Candidate population must exist before any D8.5 discussion.
- Closed cycles must exist before expectancy discussion.
- Missing snapshots remain evidence limitations, not strategy failures.

Suggested readiness states:

- `NO_D8_SNAPSHOTS`
- `LOW_D8_COVERAGE`
- `STALE_D8_SNAPSHOTS`
- `FUTURE_LEAK_BLOCKED`
- `D8_SNAPSHOT_REPLAY_READY`

## Runner And Pack Builder Implications

Plan-only implications:

- L5 pack builder likely needs an update to discover, validate, normalize, and include D8 point-in-time snapshots.
- L7 runner likely needs an update to consume D8 snapshots beyond limitation reporting and convert them into D8 funnel metrics.
- The existing `historicalReplayPointInTime` helper should be reused for snapshot matching.
- The existing `historicalReplayCandidateScarcityReview` helper should remain the review summarizer when replay points can be built without fabrication.
- No strategy mutation is allowed.
- No broker, order, execution, API, env, or config dependency is allowed.
- Output must remain local-only and outside the active repository.

## Future RED Tests

Future implementation must start with RED tests for:

- rejects future-leaking D8 snapshots
- flags missing D8 snapshots as a data-quality limitation
- flags stale D8 snapshots
- accepts point-in-time aligned D8 snapshots
- computes D8 snapshot coverage ratio
- preserves activation flags as false
- ensures no broker, order, execution, or API imports
- ensures generated packs and runs remain outside the repository
- ensures `sampleBelow500` blocks edge approval
- ensures no closed cycles keeps expectancy `null`
- rejects D8.5 approval when candidate population is absent
- rejects continuation approval when replay evidence is insufficient

## Acceptance Criteria For The Repair Gate

This planning gate is complete when:

- the repair plan is documented
- point-in-time D8 snapshot rules are explicit
- candidate source categories are classified
- replay pack schema repair is outlined
- data-quality thresholds are defined
- future RED tests are listed
- non-goals remain explicit

Later implementation must satisfy:

- local-only operation
- no activation, order, or API path
- point-in-time safe D8 snapshots
- repaired replay pack usable for a future L7 rerun
- D8.5 remains `HOLD`
- continuation remains `NOT APPROVED`

## Explicit Non-Goals

This repair plan does not approve:

- paper automation
- supervised live
- autonomous mode
- API activation
- order placement
- D8.5 release
- continuation approval
- strategy tuning from the limited L7 result
- broker routes
- execution routes
- server writeback
- generated replay output inside the repository

## Validation Boundary

Validation for this docs-only task must confirm:

- only this plan file changed
- no replay rerun
- no generated replay output copied into the repository
- no code, runtime, env, config, order, execution, broker, or API changes
- no D8.5 changes
- no continuation changes
- no stage, commit, or push
