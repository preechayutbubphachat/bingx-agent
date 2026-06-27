# D8.4.2 Historical Replay Candidate Scarcity Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an offline, review-only historical replay funnel that identifies where D8.0-D8.4 loses candidates without changing strategy behavior or inventing trade outcomes.

**Architecture:** A pure point-in-time adapter receives supplied normalized history and exposes only evidence available at each closed-candle timestamp. A separate pure reviewer aggregates normalized replay points into funnel counts, rates, dominant bottleneck, hypothesis, and research recommendation. Paper diagnostics accepts only an approved supplied review or emits `NO_REPLAY_DATA`; Agent HQ defensively maps and displays a compact read-only summary.

**Tech Stack:** TypeScript, Node `node:test`, Next.js/React, existing D8.0-D8.4 diagnostic contracts, paper diagnostics, and Agent HQ adapter/view-model patterns.

---

## File Structure

- Create `dashboard/lib/trend/historicalReplayCandidateScarcityReview.ts`: pure replay-point validation, funnel aggregation, rates, blocker distribution, bottleneck classification, and forced-safe output.
- Create `dashboard/lib/trend/historicalReplayCandidateScarcityReview.test.ts`: RED/GREEN contract, boundary, arithmetic, integrity, safety, and immutability tests.
- Create `dashboard/lib/trend/historicalReplayPointInTime.ts`: offline-only normalization and chronological evidence slicing over supplied history.
- Create `dashboard/lib/trend/historicalReplayPointInTime.test.ts`: incomplete-candle exclusion, dedupe/sort, point-in-time isolation, and no-mutation tests.
- Modify `dashboard/lib/paper/paperLoopDiagnostics.ts`: expose a supplied approved replay review or a cheap `NO_REPLAY_DATA` safe default; never execute historical replay in the paper cycle.
- Modify `dashboard/lib/paper/paperLoopDiagnostics.test.ts`: additive field, supplied-result pass-through, safe-default, and safety assertions.
- Modify `dashboard/lib/trading-agent-hq/viewModel.ts`: full replay-review VM and compact Operator Summary contract.
- Modify `dashboard/lib/trading-agent-hq/adapter.ts`: defensive full mapping and compact summary projection with forced safety literals.
- Modify `dashboard/lib/trading-agent-hq/adapter.test.ts`: full mapping, compact mapping, malformed input defense, and safe defaults.
- Modify `dashboard/lib/trading-agent-hq/mockState.ts`: static `NO_REPLAY_DATA` full and compact defaults.
- Modify `dashboard/components/trading-agent-hq/EntryCandidateResolutionCard.tsx`: compact replay rows and collapsed details inside the existing section.
- Keep `docs/superpowers/specs/2026-06-21-d8-4-2-historical-replay-candidate-scarcity-design.md`: approved source of truth.
- Keep `docs/superpowers/specs/2026-06-21-d8-5-review-candidate-outcome-recorder-design.md` unmodified and unstaged; D8.5 remains implementation HOLD.

Do not modify D8.0-D8.4 helpers, implement a continuation branch, add a replay data reader, change API/internal routes, or touch runner/broker/execution/order/live paths, runtime JSON/JSONL, environment variables, secrets, databases, or configuration. Do not stage unrelated dirty/untracked files.

## Canonical Replay Semantics

Use these diagnostic-only constants in the pure reviewer:

```ts
const LOW_SAMPLE_MAX = 99;
const EARLY_SAMPLE_MAX = 499;
const CANDIDATE_SCARCITY_RATE = 0.01;
const PULLBACK_TRIGGER_REACHED_RATE = 0.10;
const MATERIAL_STAGE_CONVERSION_RATE = 0.20;
const CONFIRMATION_ALIGNED_RATE = 0.20;
```

`MATERIAL_STAGE_CONVERSION_RATE` makes the spec's “earliest material conversion loss” deterministic for RR and touch stages. These constants classify research evidence only; they must never feed D8.0-D8.4.

Use exact rate denominators:

```text
alignedContextRate = alignedContextCount / totalEvaluationPoints
rrReadyRate = rrReadyCount / d8_0AlignedCandidateCount
triggerReachedRate = triggerReachedCount / rrReadyCount
zoneTouchedRate = zoneTouchedCount / triggerReachedCount
confirmationAlignedRate = confirmationAlignedCount / confirmationWindowActiveCount
promotableRate = promotableReviewCandidateCount / totalEvaluationPoints
```

Return `null` when a denominator is zero. Do not clamp contradictory counts.

### Task 1: Pure Replay Reviewer RED Tests

**Files:**
- Create: `dashboard/lib/trend/historicalReplayCandidateScarcityReview.test.ts`

- [ ] **Step 1: Add the wished-for API and canonical fixtures**

```ts
import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateHistoricalReplayCandidateScarcityReview,
  type HistoricalReplayPoint,
} from "./historicalReplayCandidateScarcityReview.ts";

const safe = {
  sourceSafetyValid: true,
  dataQualityValid: true,
} as const;

function point(
  index: number,
  overrides: Partial<HistoricalReplayPoint> = {},
): HistoricalReplayPoint {
  return {
    evaluatedAt: new Date(Date.UTC(2026, 0, 1, 0, index * 5)).toISOString(),
    alignedContext: true,
    d8_0AlignedCandidate: true,
    rrReady: true,
    d8_2Status: "WAITING_FOR_TRIGGER_PRICE",
    triggerReached: false,
    d8_3Status: "NO_TOUCH_YET",
    zoneTouched: false,
    confirmationWindowActive: false,
    d8_4Status: "TOUCH_WINDOW_INACTIVE",
    confirmationAligned: false,
    promotableReviewCandidate: false,
    bottleneckStatus: "WAITING_FOR_PULLBACK_TRIGGER",
    triggerDistanceClass: "FAR",
    ...safe,
    ...overrides,
  };
}

function evaluate(replayPoints: readonly HistoricalReplayPoint[]) {
  return evaluateHistoricalReplayCandidateScarcityReview({
    timeframe: "5M",
    replayPoints,
  });
}
```

- [ ] **Step 2: Add no-data and sample-quality boundary tests**

Assert:

```ts
assert.equal(evaluate([]).status, "NO_REPLAY_DATA");
assert.equal(evaluate([]).replayWindow.sampleQuality, "NO_SAMPLE");
assert.equal(evaluate([point(0)]).replayWindow.sampleQuality, "LOW_SAMPLE");
assert.equal(evaluate(Array.from({ length: 99 }, (_, i) => point(i))).replayWindow.sampleQuality, "LOW_SAMPLE");
assert.equal(evaluate(Array.from({ length: 100 }, (_, i) => point(i))).replayWindow.sampleQuality, "EARLY_SAMPLE");
assert.equal(evaluate(Array.from({ length: 499 }, (_, i) => point(i))).replayWindow.sampleQuality, "EARLY_SAMPLE");
assert.equal(evaluate(Array.from({ length: 500 }, (_, i) => point(i))).replayWindow.sampleQuality, "USABLE_SAMPLE");
```

All non-empty samples below 500 must have aggregate status `INSUFFICIENT_REPLAY_DATA`, even when their provisional funnel resembles a bottleneck.

- [ ] **Step 3: Add exact funnel-rate and zero-denominator tests**

Build ten valid points with:

- 8 aligned contexts;
- 6 D8.0 aligned candidates;
- 3 RR-ready points;
- 2 trigger-reached points;
- 1 zone-touch and active-window point;
- 1 aligned-confirmation and promotable point.

Assert exact values:

```ts
assert.equal(result.funnelRates.alignedContextRate, 8 / 10);
assert.equal(result.funnelRates.rrReadyRate, 3 / 6);
assert.equal(result.funnelRates.triggerReachedRate, 2 / 3);
assert.equal(result.funnelRates.zoneTouchedRate, 1 / 2);
assert.equal(result.funnelRates.confirmationAlignedRate, 1 / 1);
assert.equal(result.funnelRates.promotableRate, 1 / 10);
```

Build a sample with no aligned candidate, no RR, no trigger, and no active window. Assert all downstream rates are `null` and `alignedContextRate` remains finite.

- [ ] **Step 4: Add RR bottleneck test**

Create 500 valid points, 300 aligned D8.0 candidates, and only 30 RR-ready points. Keep later stages absent. Expect:

```ts
assert.equal(result.status, "RR_BOTTLENECK");
assert.equal(result.dominantBottleneck, "RR");
assert.equal(result.hypothesis, "RR_FILTER_TOO_STRICT");
assert.equal(result.recommendedNextResearch, "REPAIR_RR_ASSUMPTIONS");
```

- [ ] **Step 5: Add pullback-only bottleneck test**

Create 500 valid points with 300 D8.0 candidates, 250 RR-ready points, at least 200 waiting-trigger points, and only 20 trigger-reached points. Expect `PULLBACK_ONLY_BOTTLENECK`, dominant `PULLBACK_TRIGGER`, `PULLBACK_ONLY_TOO_STRICT`, and `DESIGN_CONTINUATION_REVIEW_BRANCH`.

Add the same conversion over 499 points. Expect `INSUFFICIENT_REPLAY_DATA` and never recommend continuation design.

- [ ] **Step 6: Add touch-window bottleneck test**

Create 500 points where RR and trigger conversion pass, but fewer than 20% of trigger-reached points produce zone touch or an active confirmation window. Expect `TOUCH_WINDOW_BOTTLENECK`, dominant `TOUCH`, hypothesis `UNDETERMINED`, and `REPAIR_TOUCH_WINDOW`.

- [ ] **Step 7: Add confirmation bottleneck test**

Create 500 points where upstream conversions pass and confirmation windows are active, but fewer than 20% become directionally aligned. Expect `CONFIRMATION_BOTTLENECK`, dominant `CONFIRMATION`, `CONFIRMATION_TOO_STRICT`, and `REPAIR_CONFIRMATION_RULES`.

- [ ] **Step 8: Add healthy and residual scarcity tests**

Create a usable sample with at least five promotable points out of 500 and no threshold-qualified stage loss. Expect `REPLAY_READY`, `NONE`, `PIPELINE_HEALTHY_WAIT_FOR_MARKET`, and `WAIT_FOR_LIVE_PULLBACK`.

Create 1,000 points with nine promotable points, all stage conversions at or above their material thresholds, and no dominant stage failure. Expect `CANDIDATE_PIPELINE_TOO_SPARSE`, hypothesis `UNDETERMINED`, and `NO_ACTION`. Create ten promotable points and assert the exact 1% boundary is not sparse.

- [ ] **Step 9: Add contradictory replay-point integrity tests**

Use separate cases:

- active confirmation window while `zoneTouched=false`;
- `PROMOTABLE_REVIEW_CANDIDATE` status while promotion boolean is false;
- promotion boolean true while confirmation is not aligned;
- D8.3 active status while `confirmationWindowActive=false`;
- invalid timestamp;
- `sourceSafetyValid=false` with a non-safety primary blocker;
- `dataQualityValid=false`.

Expect `DATA_QUALITY_BLOCKED`, dominant `DATA_QUALITY`, hypothesis `UNDETERMINED`, recommendation `COLLECT_MORE_HISTORY`, and no thrown exception.

- [ ] **Step 10: Add trigger-distance and blocker-distribution tests**

Create one valid point per distance class and assert exact `AT_TRIGGER`, `NEAR`, `MID_RANGE`, and `FAR` totals. Add one point for each approved primary blocker bucket and assert each point increments exactly one bucket. Assert the sum of blocker-distribution counts never exceeds `totalEvaluationPoints`.

- [ ] **Step 11: Add no-mutation and safety-literal tests**

Deep-clone nested replay points before evaluation and assert exact equality after evaluation. Iterate representative outputs and assert:

```ts
assert.equal(result.activationAllowed, false);
assert.equal(result.paperActivationAllowed, false);
assert.equal(result.liveActivationAllowed, false);
assert.equal(result.reviewOnly, true);
assert.equal(result.shadowOnly, true);
assert.ok(result.doNotDo.length > 0);
```

- [ ] **Step 12: Run the focused test and verify RED**

From `dashboard`:

```powershell
node --test --experimental-strip-types lib/trend/historicalReplayCandidateScarcityReview.test.ts
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` because `historicalReplayCandidateScarcityReview.ts` does not exist. Do not create the helper before observing this failure.

### Task 2: Pure Reviewer GREEN Implementation

**Files:**
- Create: `dashboard/lib/trend/historicalReplayCandidateScarcityReview.ts`
- Test: `dashboard/lib/trend/historicalReplayCandidateScarcityReview.test.ts`

- [ ] **Step 1: Define exact input, replay-point, and output contracts**

Define the status, sample-quality, dominant-bottleneck, hypothesis, recommendation, primary-blocker, trigger-distance, timeframe, count, rate, input, and output types from the spec. Keep safety properties as literal `false`/`true`.

`HistoricalReplayPoint` must use the exact fields from Task 1. Restrict `bottleneckStatus` to:

```ts
type ReplayPrimaryBlocker =
  | "RR_NOT_READY"
  | "WAITING_FOR_PULLBACK_TRIGGER"
  | "NO_TOUCH_EVIDENCE"
  | "TOUCH_WINDOW_EXPIRED"
  | "CONFIRMATION_NOT_READY"
  | "CONFIRMATION_CONFLICTING"
  | "SAFETY_BLOCKED"
  | "NO_CONTEXT"
  | "NONE";
```

- [ ] **Step 2: Implement safe default and defensive primitives**

Create `baseOutput(timeframe)` with zero counts, null rates, `NO_SAMPLE`, `NO_REPLAY_DATA`, `NONE`, `INSUFFICIENT_HISTORY`, `COLLECT_MORE_HISTORY`, non-empty `blockers`/`doNotDo`, and forced safety literals.

Use finite-number, valid-date, recognized-status, and recognized-timeframe guards. Invalid top-level input returns `DATA_QUALITY_BLOCKED` rather than throwing.

- [ ] **Step 3: Validate points without mutating them**

Validate each point before counting:

```text
promotableReviewCandidate -> confirmationAligned -> confirmationWindowActive -> zoneTouched -> triggerReached -> rrReady -> d8_0AlignedCandidate -> alignedContext
```

Also require D8.3/D8.4 statuses to agree with their corresponding booleans, valid ISO timestamps, recognized distance classes, and safety/data-quality checksums. Sort a copied point array by timestamp; never sort the caller's array.

Safety-blocked and no-context points remain valid measurable points only when `bottleneckStatus` matches the checksum failure. Other contradictions make the aggregate data-quality blocked.

- [ ] **Step 4: Aggregate cumulative funnel counts**

Count each stage only when its entire upstream prerequisite chain is true. Count `waitingForTriggerCount` independently when D8.2 is waiting, RR is ready, and an aligned D8.0 candidate exists.

Set replay-window start/end from the earliest/latest valid evaluation timestamps. Set `candleCount` equal to the supplied valid replay-point count in V1; the offline adapter emits one point per closed selected-timeframe candle after warm-up.

- [ ] **Step 5: Compute exact rates and distributions**

Use a `ratio(numerator, denominator)` helper that returns `null` for zero and rejects non-finite or out-of-range results. Map each replay point to at most one blocker-distribution bucket. Count trigger distance only for recognized geometry on a D8.0 aligned candidate.

- [ ] **Step 6: Implement deterministic sample and bottleneck precedence**

Apply:

```text
NO_REPLAY_DATA
DATA_QUALITY_BLOCKED
INSUFFICIENT_REPLAY_DATA
RR_BOTTLENECK
PULLBACK_ONLY_BOTTLENECK
TOUCH_WINDOW_BOTTLENECK
CONFIRMATION_BOTTLENECK
CANDIDATE_PIPELINE_TOO_SPARSE
REPLAY_READY
```

RR is a bottleneck when aligned candidates exist and `rrReadyRate < 0.20`.

Pullback is a bottleneck when RR-ready points exist, waiting-trigger observations exceed trigger-reached observations, and `triggerReachedRate < 0.10`.

Touch is a bottleneck when trigger-reached points exist and either `zoneTouchedRate < 0.20` or active-window conversion from zone touches is below 0.20.

Confirmation is a bottleneck when active windows exist and `confirmationAlignedRate < 0.20`.

Residual candidate scarcity is `promotableRate < 0.01` only after all earlier bottlenecks are false. Exactly 1% is not sparse.

- [ ] **Step 7: Map hypotheses, recommendations, blockers, and next action**

Only `USABLE_SAMPLE` plus `PULLBACK_ONLY_BOTTLENECK` may emit `DESIGN_CONTINUATION_REVIEW_BRANCH`. This is a research recommendation, not authorization. Every next action must remain review-only, and every `doNotDo` must prohibit continuation implementation, D8.5 implementation, candidate creation, activation, orders, and runtime writes.

- [ ] **Step 8: Run focused tests and TypeScript**

```powershell
node --test --experimental-strip-types lib/trend/historicalReplayCandidateScarcityReview.test.ts
npx tsc --noEmit --incremental false
```

Expected: all helper tests pass and TypeScript exits 0.

### Task 3: Offline Point-in-Time Replay Adapter

**Files:**
- Create: `dashboard/lib/trend/historicalReplayPointInTime.test.ts`
- Create: `dashboard/lib/trend/historicalReplayPointInTime.ts`

- [ ] **Step 1: Write RED tests for supplied-history isolation**

Import the wished-for API:

```ts
import {
  buildHistoricalReplayPoints,
  type HistoricalReplayEvaluationContext,
} from "./historicalReplayPointInTime.ts";
```

Use supplied candles with unsorted timestamps, duplicate timestamps, one incomplete candle, and one invalid candle. Supply timestamped snapshots and an evaluator callback that records the maximum candle timestamp it receives.

Assert:

- output is chronological;
- duplicate timestamp keeps the latest input record;
- incomplete and invalid candles are excluded;
- each callback receives candles with `t <= evaluatedAt` only;
- each callback receives the latest snapshot at or before `evaluatedAt`, never a future snapshot;
- no input array or nested record is mutated;
- one normalized replay point is emitted per eligible closed candle after configured warm-up;
- callback failure emits a `dataQualityValid=false` point rather than aborting the whole replay.

- [ ] **Step 2: Run the adapter test and verify RED**

```powershell
node --test --experimental-strip-types lib/trend/historicalReplayPointInTime.test.ts
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Define the offline-only adapter contract**

```ts
export interface NormalizedHistoricalCandle {
  t: number;
  open: number;
  high: number;
  low: number;
  close: number;
  complete: boolean;
}

export interface HistoricalReplaySnapshot {
  evaluatedAt: string;
  value: unknown;
}

export interface HistoricalReplayEvaluationContext {
  timeframe: "5M" | "15M" | "1H";
  evaluatedAt: string;
  candles: readonly NormalizedHistoricalCandle[];
  snapshot: unknown | null;
}

export function buildHistoricalReplayPoints(input: {
  timeframe: "5M" | "15M" | "1H";
  candles: readonly unknown[];
  snapshots?: readonly HistoricalReplaySnapshot[];
  warmupCandles?: number;
  evaluatePoint: (context: HistoricalReplayEvaluationContext) => HistoricalReplayPoint;
}): HistoricalReplayPoint[];
```

The callback is the only place a later approved offline harness may compose D8.0-D8.4. The adapter itself must not import runtime diagnostics, routes, caches, APIs, filesystems, environment variables, databases, or exchange clients.

- [ ] **Step 4: Implement normalization and temporal slicing**

Accept finite positive OHLC values, require `high >= max(open, close, low)` and `low <= min(open, close, high)`, require `complete === true`, dedupe by timestamp keeping the latest input record, and sort a copy ascending.

Normalize snapshots independently, dedupe by `evaluatedAt`, and choose only the latest snapshot timestamp at or before the current candle. Pass a copied candle prefix ending at the current candle. Never pass the full future array.

- [ ] **Step 5: Implement failure isolation**

When the evaluator throws or returns an invalid top-level shape, emit one deterministic point for that timestamp with `dataQualityValid=false`, `sourceSafetyValid=false`, blocker `NO_CONTEXT`, unknown D8 statuses, and no downstream success booleans. Do not write logs or files.

- [ ] **Step 6: Run adapter and reviewer tests**

```powershell
node --test --experimental-strip-types lib/trend/historicalReplayPointInTime.test.ts
node --test --experimental-strip-types lib/trend/historicalReplayCandidateScarcityReview.test.ts
```

Expected: both commands pass.

### Task 4: Additive Paper Diagnostics Field

**Files:**
- Modify: `dashboard/lib/paper/paperLoopDiagnostics.test.ts`
- Modify: `dashboard/lib/paper/paperLoopDiagnostics.ts:123-182,241-270,1129-1171`

- [ ] **Step 1: Add RED safe-default and supplied-result assertions**

In the existing safe-default test assert:

```ts
assert.equal(d.historicalReplayCandidateScarcityReview.source, "HISTORICAL_REPLAY_CANDIDATE_SCARCITY_REVIEW_V1");
assert.equal(d.historicalReplayCandidateScarcityReview.status, "NO_REPLAY_DATA");
assert.equal(d.historicalReplayCandidateScarcityReview.replayWindow.sampleQuality, "NO_SAMPLE");
assert.equal(d.historicalReplayCandidateScarcityReview.activationAllowed, false);
assert.equal(d.historicalReplayCandidateScarcityReview.paperActivationAllowed, false);
assert.equal(d.historicalReplayCandidateScarcityReview.liveActivationAllowed, false);
```

Add a context fixture containing a completed pure-review result and assert paper diagnostics exposes its counts/status unchanged except that safety literals remain forced.

- [ ] **Step 2: Run paper diagnostics test and verify RED**

```powershell
node --test --experimental-strip-types lib/paper/paperLoopDiagnostics.test.ts
```

Expected: FAIL because the field is absent.

- [ ] **Step 3: Add the optional supplied-review context**

Import the output type and evaluator. Extend `PaperLoopDiagnosticsContext` with:

```ts
historicalReplayCandidateScarcityReview?: HistoricalReplayCandidateScarcityReview | null;
```

Extend `PaperLoopDiagnostics` with the required output field.

- [ ] **Step 4: Expose supplied result or cheap safe default**

Use:

```ts
const suppliedHistoricalReplay = context.historicalReplayCandidateScarcityReview;
const historicalReplayCandidateScarcityReview = suppliedHistoricalReplay
  ? {
      ...suppliedHistoricalReplay,
      activationAllowed: false as const,
      paperActivationAllowed: false as const,
      liveActivationAllowed: false as const,
      reviewOnly: true as const,
      shadowOnly: true as const,
    }
  : evaluateHistoricalReplayCandidateScarcityReview({ timeframe: "5M", replayPoints: [] });
```

Return it additively. Do not import or call `buildHistoricalReplayPoints` in paper diagnostics. Do not read history or execute replay in the live paper cycle. Do not feed the result into D8.0-D8.4, D8.5, strategy selection, or any activation decision.

- [ ] **Step 5: Run helper, adapter, and paper tests**

```powershell
node --test --experimental-strip-types lib/trend/historicalReplayCandidateScarcityReview.test.ts
node --test --experimental-strip-types lib/trend/historicalReplayPointInTime.test.ts
node --test --experimental-strip-types lib/paper/paperLoopDiagnostics.test.ts
```

Expected: all commands pass.

### Task 5: Agent HQ Adapter and View-Model Contract

**Files:**
- Modify: `dashboard/lib/trading-agent-hq/viewModel.ts:50-190`
- Modify: `dashboard/lib/trading-agent-hq/adapter.test.ts:500-790,900-955`
- Modify: `dashboard/lib/trading-agent-hq/adapter.ts:794-840,850-990,1307-1335`
- Modify: `dashboard/lib/trading-agent-hq/mockState.ts:450-490,1000-1045`

- [ ] **Step 1: Add RED raw fixture and mapping assertions**

Add a full raw `historicalReplayCandidateScarcityReview` fixture with usable sample, `PULLBACK_ONLY_BOTTLENECK`, dominant `PULLBACK_TRIGGER`, 0.4% promotable rate, `PULLBACK_ONLY_TOO_STRICT`, and `DESIGN_CONTINUATION_REVIEW_BRANCH`.

Assert full counts/rates/distributions, replay window, recommendation, safety literals, and compact summary:

```ts
assert.equal(vm.paper.operatorSummary.historicalReplay.status, "PULLBACK_ONLY_BOTTLENECK");
assert.equal(vm.paper.operatorSummary.historicalReplay.dominantBottleneck, "PULLBACK_TRIGGER");
assert.equal(vm.paper.operatorSummary.historicalReplay.promotableRate, 0.004);
assert.equal(vm.paper.operatorSummary.historicalReplay.recommendedNextResearch, "DESIGN_CONTINUATION_REVIEW_BRANCH");
```

In safe defaults assert `NO_REPLAY_DATA`, null promotable rate, `COLLECT_MORE_HISTORY`, zero counts, empty arrays, and forced safety literals.

- [ ] **Step 2: Run adapter tests and verify RED**

```powershell
node --test --experimental-strip-types lib/trading-agent-hq/adapter.test.ts
```

Expected: FAIL because the replay VM is absent.

- [ ] **Step 3: Add full and compact VM interfaces**

Add `HistoricalReplayCandidateScarcityReviewVM` matching the full contract with defensive string unions, finite nullable rates, numeric counts, arrays, and literal safety booleans. Add it to `PaperVM`.

Add to `OperatorSummaryVM`:

```ts
historicalReplay: {
  status: string;
  dominantBottleneck: string;
  promotableRate: number | null;
  recommendedNextResearch: string;
  nextAction: string;
};
```

- [ ] **Step 4: Implement defensive mapping**

Create `mapHistoricalReplayCandidateScarcityReview(raw)`. Validate each numeric field independently, default rates to null, counts to zero, arrays to empty, status to `NO_REPLAY_DATA`, dominant bottleneck to `NONE`, hypothesis to `INSUFFICIENT_HISTORY`, and recommendation to `COLLECT_MORE_HISTORY`.

Always force:

```ts
activationAllowed: false,
paperActivationAllowed: false,
liveActivationAllowed: false,
reviewOnly: true,
shadowOnly: true,
```

Project the compact summary from the mapped full object so raw malformed values cannot diverge between full and compact views.

- [ ] **Step 5: Add mock-state safe defaults**

Add complete `NO_REPLAY_DATA` full and compact objects. Do not add controls or operational state.

- [ ] **Step 6: Run adapter tests and TypeScript**

```powershell
node --test --experimental-strip-types lib/trading-agent-hq/adapter.test.ts
npx tsc --noEmit --incremental false
```

Expected: both commands pass.

### Task 6: Existing Entry Candidate / Evidence UI Only

**Files:**
- Modify: `dashboard/components/trading-agent-hq/EntryCandidateResolutionCard.tsx:59-205`

- [ ] **Step 1: Read the compact and full replay contracts**

```ts
const replay = paper.operatorSummary.historicalReplay;
const replayRaw = paper.historicalReplayCandidateScarcityReview;
```

- [ ] **Step 2: Add compact read-only rows inside the existing section**

Add only:

```tsx
<Row label="Replay status" value={replay.status} />
<Row label="Dominant bottleneck" value={replay.dominantBottleneck} />
<Row label="Promotable rate" value={pct(replay.promotableRate == null ? null : replay.promotableRate * 100)} />
<Row label="Next research" value={replay.recommendedNextResearch} />
```

Display `replay.nextAction` as read-only copy after the rows. Confirm the local `pct` helper expects percent units; if it expects a fraction, pass the raw fraction instead. Add one focused formatter assertion to an existing UI/helper test if the helper is extracted.

- [ ] **Step 3: Extend existing collapsed details**

Add replay window, funnel counts/rates, blocker distribution, trigger-distance buckets, blockers, and `doNotDo` to the existing collapsed `<details>`. Keep it closed by default.

- [ ] **Step 4: Preserve restrained readiness semantics**

Use neutral/warning styling for no data, insufficient data, and bottlenecks. Use emerald only for `REPLAY_READY`; do not label it trade-ready. Do not add a card, button, click handler, approval, activation control, or order affordance.

- [ ] **Step 5: Run TypeScript**

```powershell
npx tsc --noEmit --incremental false
```

Expected: exit code 0.

### Task 7: Required Validation and Served Smoke

**Files:**
- No new files.

- [ ] **Step 1: Run both new focused suites from `dashboard`**

```powershell
node --test --experimental-strip-types lib/trend/historicalReplayCandidateScarcityReview.test.ts
node --test --experimental-strip-types lib/trend/historicalReplayPointInTime.test.ts
```

Expected: both commands pass with zero failures.

- [ ] **Step 2: Run the required D8 regression suites**

```powershell
node --test --experimental-strip-types lib/trend/noReviewCandidateBottleneckResolver.test.ts
node --test --experimental-strip-types lib/trend/touchAwareConfirmationReview.test.ts
node --test --experimental-strip-types lib/trend/pullbackZoneTouchEvidence.test.ts
node --test --experimental-strip-types lib/trend/pullbackTriggerThresholds.test.ts
node --test --experimental-strip-types lib/trend/resolverDrivenPullbackGate.test.ts
node --test --experimental-strip-types lib/trend/entryCandidateResolver.test.ts
node --test --experimental-strip-types lib/paper/paperLoopDiagnostics.test.ts
node --test --experimental-strip-types lib/trading-agent-hq/adapter.test.ts
```

Expected: every command passes with zero failed tests.

- [ ] **Step 3: Run the full typecheck**

```powershell
npx tsc --noEmit --incremental false
```

Expected: exit code 0.

- [ ] **Step 4: Run a complete production build**

```powershell
npm run build
```

Expected: Next.js completes compilation, type validation, page generation, and finalization. Partial compilation or timeout is not a pass.

- [ ] **Step 5: Run served smoke from the latest build when auth permits**

Start on a free port, for example:

```powershell
npm run start -- -p 3026
```

Open `http://127.0.0.1:3026/agent-hq` and verify:

- the existing Entry Candidate / Evidence section contains replay status, dominant bottleneck, promotable rate, next research, and next action;
- no supplied replay result displays `NO_REPLAY_DATA` honestly;
- a supplied approved replay fixture displays its bottleneck without changing D8.0-D8.4 rows;
- raw replay details remain collapsed;
- there is no new card, button, approval, activation, or order control.

If authentication redirects to login, report `visual smoke not completed`. Do not claim visual pass without inspecting `/agent-hq` from the latest build.

### Task 8: Safety Audit and Explicit Staging

**Files:**
- Audit all changed files; stage only the approved D8.4.2 set after every validation gate passes and release authorization is explicit.

- [ ] **Step 1: Inspect final scope**

```powershell
git status --short
git diff --stat
git diff --name-only
git diff --check
```

Confirm D8.5, D8.0-D8.4 helpers, routes, runtime data, environment/configuration, and unrelated dirty files are absent from the D8.4.2 diff.

- [ ] **Step 2: Run changed-line safety grep**

Reject added code lines containing:

```text
activationAllowed: true
paperActivationAllowed: true
liveActivationAllowed: true
placeOrder
cancelOrder
createOrder
exchangeOrder
ENABLE_ORDER_PLACEMENT
LIVE_TRADING_ENABLED
EXCHANGE_MANUAL_APPROVAL
writeFile
appendFile
process.env
fetch
```

Documentation that states prohibitions and fields explicitly forced false are allowed. Also reject imports from runner, broker, execution, order, live, API/internal routes, exchange clients, filesystem writers, environment readers, databases, or runtime loaders.

- [ ] **Step 3: Audit forbidden paths**

Reject staged paths containing:

```text
config/db.php
.env
*.env
secrets
runtime JSON/JSONL
runner
broker
execution
order
live
app/api
```

Do not stage `docs/superpowers/specs/2026-06-21-d8-5-review-candidate-outcome-recorder-design.md`.

- [ ] **Step 4: Stage the explicit D8.4.2 set only after operator release approval**

```powershell
git add -- `
  PROJECT_CONTEXT.md `
  dashboard/lib/trend/historicalReplayCandidateScarcityReview.ts `
  dashboard/lib/trend/historicalReplayCandidateScarcityReview.test.ts `
  dashboard/lib/trend/historicalReplayPointInTime.ts `
  dashboard/lib/trend/historicalReplayPointInTime.test.ts `
  dashboard/lib/paper/paperLoopDiagnostics.ts `
  dashboard/lib/paper/paperLoopDiagnostics.test.ts `
  dashboard/lib/trading-agent-hq/viewModel.ts `
  dashboard/lib/trading-agent-hq/adapter.ts `
  dashboard/lib/trading-agent-hq/adapter.test.ts `
  dashboard/lib/trading-agent-hq/mockState.ts `
  dashboard/components/trading-agent-hq/EntryCandidateResolutionCard.tsx `
  docs/superpowers/specs/2026-06-21-d8-4-2-historical-replay-candidate-scarcity-design.md `
  docs/superpowers/plans/2026-06-21-d8-4-2-historical-replay-candidate-scarcity.md
```

Never use `git add .`. Do not stage D8.5 or unrelated files.

- [ ] **Step 5: Verify the index exactly**

```powershell
git diff --cached --name-only
git diff --cached --stat
git diff --cached --check
```

Expected: exactly the fourteen approved D8.4.2 files above. If any other path appears, stop before commit.

- [ ] **Step 6: Stop for release authorization**

Report validation, smoke, safety grep, forbidden-path audit, and exact staged set. Do not commit or push until the operator explicitly approves the release action and commit message.

## How This Answers the Blocker

The current runtime provides one RR-ready, FAR-from-trigger observation. D8.4.2 converts supplied historical point-in-time evidence into measurable stage conversions:

```text
evaluation points
-> aligned context
-> D8.0 aligned candidate
-> RR ready
-> trigger reached
-> zone touched
-> confirmation window active
-> confirmation aligned
-> promotable review candidate
```

The first material conversion loss determines whether the project should repair RR assumptions, continue waiting for pullbacks, repair touch-window evidence, repair confirmation, collect more history, or only then design a continuation-review branch. Until an approved offline history is supplied, paper diagnostics must say `NO_REPLAY_DATA`; it must not fabricate statistics.

## Completion Report

Report in Thai:

1. files changed;
2. RED/GREEN evidence for reviewer and point-in-time adapter;
3. replay window and sample quality;
4. funnel counts/rates and exact denominators;
5. dominant bottleneck, hypothesis, and next research result;
6. whether approved historical input was supplied or output remains `NO_REPLAY_DATA`;
7. confirmation that D8.5 remains HOLD and no continuation branch was implemented;
8. paper diagnostics and Agent HQ mapping;
9. tests, typecheck, build, and served smoke;
10. safety grep, forbidden-path audit, and exact staged set;
11. commit/push status only if separately authorized.
