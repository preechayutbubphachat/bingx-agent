# D8.4.2 Historical Replay Review for Candidate Scarcity Design

## Purpose

D8.0-D8.4 can produce a review-only candidate, but the current runtime has none. D8.4.1 identifies candidate-generation scarcity rather than RR as the immediate blocker:

- aligned direction is LONG;
- `rrReady = true` and best RR is approximately 6.208;
- the current price is approximately 0.9326% above the pullback trigger;
- trigger distance is `FAR`;
- D8.2 is `WAITING_FOR_TRIGGER_PRICE`;
- D8.3 is `NO_TOUCH_YET`;
- D8.4 is `TOUCH_WINDOW_INACTIVE`.

A single live snapshot cannot distinguish a healthy pipeline waiting for market structure from a pullback-only design that systematically suppresses candidates. D8.4.2 defines an offline, read-only historical replay review that measures where D8.0-D8.4 loses candidate opportunities.

The review measures candidate-generation scarcity only. It does not fabricate fills, evaluate trading edge, record outcomes, create a continuation candidate, or alter any existing D8 decision.

D8.5 remains implementation HOLD until replay evidence shows that promotable review candidates exist often enough to make outcome recording meaningful.

## Scope

The future D8.4.2 implementation may add:

- a pure replay-review helper and focused tests;
- an offline point-in-time replay orchestrator over supplied normalized history;
- additive `paperLoopDiagnostics.historicalReplayCandidateScarcityReview` output when an approved replay result is supplied;
- additive Agent HQ adapter/view-model mapping;
- compact read-only rows inside the existing Entry Candidate / Evidence area.

It must not change D8.0-D8.4 behavior, implement D8.5, implement a continuation branch, persist replay results, read a public cache as source of truth, or add an operational consumer.

## Approaches Considered

### Approach A: Point-in-time replay plus pure funnel reviewer (selected)

An offline orchestrator walks normalized historical candles or supplied historical snapshots in chronological order. At each evaluation point it exposes only evidence available at that time, invokes the existing D8.0-D8.4 contracts without changing their rules, and emits a normalized replay-point result. A separate pure reviewer aggregates those points into funnel counts, rates, blocker distribution, bottleneck classification, and a research recommendation.

Advantages:

- prevents look-ahead leakage;
- reuses approved D8 semantics rather than approximating them;
- separates expensive replay construction from deterministic classification;
- makes funnel arithmetic and thresholds independently testable;
- keeps runtime diagnostics additive and read-only.

### Approach B: Infer scarcity from current runtime counters (rejected)

Current diagnostics contain only the latest state and selected cumulative evidence. They cannot reconstruct whether prior historical points had aligned setup, RR readiness, trigger reach, touch, or confirmation. This approach would confuse observation frequency with candidate scarcity.

### Approach C: Simulate fills and outcomes during replay (rejected)

Fill simulation is outside the candidate-generation question and would introduce assumptions about execution, slippage, and trade lifecycle. D8.4.2 stops at `PROMOTABLE_REVIEW_CANDIDATE`. Target-first and invalidation-first analysis belongs after valid candidates exist and D8.5 is separately authorized.

## Architecture

### Layer 1: Offline point-in-time replay

The future orchestrator accepts normalized historical candles or normalized historical snapshots supplied explicitly by an offline caller. It must not discover data through runtime files, routes, public cache, private exchange APIs, environment variables, or databases.

For each evaluation timestamp, it must:

1. slice every timeframe at or before the evaluation timestamp;
2. provide only the rolling evidence required by the existing D8 contracts;
3. evaluate the approved D8.0-D8.4 chain in dependency order;
4. capture normalized statuses and booleans without mutating source data;
5. emit one replay point even when context is missing, so data loss remains measurable.

Future candles must never influence regime, setup, price, RR, trigger, touch, freshness, or confirmation at an earlier evaluation point. A replay that cannot prove point-in-time isolation is `DATA_QUALITY_BLOCKED` and cannot support a continuation-branch decision.

Evaluation cadence uses the selected replay timeframe (`5M`, `15M`, or `1H`). One closed candle equals one evaluation point. Incomplete candles are excluded. The review must report the selected timeframe and actual start/end timestamps.

### Layer 2: Pure scarcity reviewer

The pure reviewer consumes normalized replay points. It does not invoke routes, parse runtime snapshots, read files, or call the clock.

Conceptual API:

```ts
evaluateHistoricalReplayCandidateScarcityReview({
  timeframe,
  replayPoints,
})
```

Each replay point must contain enough point-in-time evidence to account for exactly one evaluation:

```ts
{
  evaluatedAt,
  alignedContext,
  d8_0AlignedCandidate,
  rrReady,
  d8_2Status,
  triggerReached,
  d8_3Status,
  zoneTouched,
  confirmationWindowActive,
  d8_4Status,
  confirmationAligned,
  promotableReviewCandidate,
  bottleneckStatus,
  triggerDistanceClass,
  sourceSafetyValid,
  dataQualityValid,
}
```

The implementation plan must define strict source-version checks and reject contradictory point states. It must not silently coerce an impossible downstream success when its upstream prerequisite is false.

## Output Contract

```ts
historicalReplayCandidateScarcityReview {
  schemaVersion: 1,
  source: "HISTORICAL_REPLAY_CANDIDATE_SCARCITY_REVIEW_V1",
  readiness: "REVIEW_NOT_ACTIVATION",

  status:
    | "NO_REPLAY_DATA"
    | "INSUFFICIENT_REPLAY_DATA"
    | "REPLAY_READY"
    | "CANDIDATE_PIPELINE_TOO_SPARSE"
    | "PULLBACK_ONLY_BOTTLENECK"
    | "RR_BOTTLENECK"
    | "TOUCH_WINDOW_BOTTLENECK"
    | "CONFIRMATION_BOTTLENECK"
    | "DATA_QUALITY_BLOCKED",

  replayWindow: {
    timeframe: "5M" | "15M" | "1H",
    startAt: string | null,
    endAt: string | null,
    candleCount: number,
    sampleQuality: "NO_SAMPLE" | "LOW_SAMPLE" | "EARLY_SAMPLE" | "USABLE_SAMPLE"
  },

  funnelCounts: {
    totalEvaluationPoints: number,
    alignedContextCount: number,
    d8_0AlignedCandidateCount: number,
    rrReadyCount: number,
    waitingForTriggerCount: number,
    triggerReachedCount: number,
    zoneTouchedCount: number,
    confirmationWindowActiveCount: number,
    confirmationAlignedCount: number,
    promotableReviewCandidateCount: number
  },

  funnelRates: {
    alignedContextRate: number | null,
    rrReadyRate: number | null,
    triggerReachedRate: number | null,
    zoneTouchedRate: number | null,
    confirmationAlignedRate: number | null,
    promotableRate: number | null
  },

  blockerDistribution: {
    RR_NOT_READY: number,
    WAITING_FOR_PULLBACK_TRIGGER: number,
    NO_TOUCH_EVIDENCE: number,
    TOUCH_WINDOW_EXPIRED: number,
    CONFIRMATION_NOT_READY: number,
    CONFIRMATION_CONFLICTING: number,
    SAFETY_BLOCKED: number,
    NO_CONTEXT: number
  },

  triggerDistanceBuckets: {
    AT_TRIGGER: number,
    NEAR: number,
    MID_RANGE: number,
    FAR: number
  },

  dominantBottleneck:
    | "NONE"
    | "RR"
    | "PULLBACK_TRIGGER"
    | "TOUCH"
    | "CONFIRMATION"
    | "DATA_QUALITY"
    | "CONTEXT",

  hypothesis:
    | "PULLBACK_ONLY_TOO_STRICT"
    | "RR_FILTER_TOO_STRICT"
    | "CONFIRMATION_TOO_STRICT"
    | "INSUFFICIENT_HISTORY"
    | "PIPELINE_HEALTHY_WAIT_FOR_MARKET"
    | "UNDETERMINED",

  recommendedNextResearch:
    | "WAIT_FOR_LIVE_PULLBACK"
    | "DESIGN_CONTINUATION_REVIEW_BRANCH"
    | "REPAIR_RR_ASSUMPTIONS"
    | "REPAIR_TOUCH_WINDOW"
    | "REPAIR_CONFIRMATION_RULES"
    | "COLLECT_MORE_HISTORY"
    | "NO_ACTION",

  blockers: string[],
  nextAction: string,
  doNotDo: string[],

  activationAllowed: false,
  paperActivationAllowed: false,
  liveActivationAllowed: false,
  reviewOnly: true,
  shadowOnly: true
}
```

## Funnel Accounting

Counts are cumulative prerequisite counts over valid evaluation points:

- `alignedContextCount`: regime/setup context is aligned and usable;
- `d8_0AlignedCandidateCount`: D8.0 resolves an aligned candidate;
- `rrReadyCount`: D8.2 canonical `rrReady` is true for an aligned candidate;
- `waitingForTriggerCount`: D8.2 is waiting for the aligned trigger;
- `triggerReachedCount`: D8.2 geometry says the trigger has been reached or crossed without inventing a fill;
- `zoneTouchedCount`: D8.3 reports raw or expanded zone touch evidence;
- `confirmationWindowActiveCount`: D8.3 status is `CONFIRMATION_WINDOW_ACTIVE`;
- `confirmationAlignedCount`: D8.4 has fresh usable evidence aligned with direction;
- `promotableReviewCandidateCount`: D8.4 status is `PROMOTABLE_REVIEW_CANDIDATE` and its promotion boolean is true.

Rates use explicit upstream denominators:

```text
alignedContextRate = alignedContextCount / totalEvaluationPoints
rrReadyRate = rrReadyCount / d8_0AlignedCandidateCount
triggerReachedRate = triggerReachedCount / rrReadyCount
zoneTouchedRate = zoneTouchedCount / triggerReachedCount
confirmationAlignedRate = confirmationAlignedCount / confirmationWindowActiveCount
promotableRate = promotableReviewCandidateCount / totalEvaluationPoints
```

A rate is `null` when its denominator is zero. Rates are finite fractions in `[0, 1]`; the UI may format them as percentages. Invalid or contradictory counts produce `DATA_QUALITY_BLOCKED` rather than clamping.

`waitingForTriggerCount` is reported alongside `triggerReachedCount` but is not part of a cumulative success chain because it represents a mutually exclusive waiting state at an evaluation point.

## Sample Quality

Sample quality is based on valid `totalEvaluationPoints` after normalization and point validation:

- `NO_SAMPLE`: 0;
- `LOW_SAMPLE`: 1-99;
- `EARLY_SAMPLE`: 100-499;
- `USABLE_SAMPLE`: 500 or more.

`candleCount` records closed normalized candles in the selected replay window. It may exceed valid evaluation points when warm-up requirements or unusable context prevent evaluation. This difference must remain visible through blockers and cannot be silently discarded.

## Blocker Distribution and Trigger Distance

Each valid replay point contributes to at most one primary blocker bucket using D8.4.1 precedence. This prevents double-counting the same evaluation point as RR, trigger, touch, and confirmation failure.

Trigger distance buckets are counted only when D8.2 supplies valid aligned trigger geometry. The bucket names and threshold boundaries must reuse D8.4.1 semantics exactly; D8.4.2 must not define a competing distance classifier.

Safety or context failures remain measurable:

- any source-safety mismatch contributes to `SAFETY_BLOCKED`;
- missing or contradictory D8 context contributes to `NO_CONTEXT`;
- malformed replay points additionally make the aggregate status `DATA_QUALITY_BLOCKED` when their presence prevents reliable funnel interpretation.

## Status and Bottleneck Precedence

Aggregate status precedence:

1. no supplied replay points -> `NO_REPLAY_DATA`;
2. replay integrity, point-in-time isolation, or source contracts invalid -> `DATA_QUALITY_BLOCKED`;
3. sample quality `LOW_SAMPLE` or `EARLY_SAMPLE` -> `INSUFFICIENT_REPLAY_DATA`;
4. usable sample with RR bottleneck -> `RR_BOTTLENECK`;
5. usable sample with pullback trigger bottleneck -> `PULLBACK_ONLY_BOTTLENECK`;
6. usable sample with touch/window bottleneck -> `TOUCH_WINDOW_BOTTLENECK`;
7. usable sample with confirmation bottleneck -> `CONFIRMATION_BOTTLENECK`;
8. usable sample with promotable rate below 1% but no single threshold-qualified bottleneck -> `CANDIDATE_PIPELINE_TOO_SPARSE`;
9. otherwise -> `REPLAY_READY`.

The dominant bottleneck identifies the earliest stage with the largest material conversion loss after data/context validation. Threshold-qualified earlier stages take precedence over later stages because downstream scarcity may be caused by missing upstream opportunities.

Diagnostic thresholds:

- candidate scarcity: `promotableRate < 0.01` over `USABLE_SAMPLE`;
- pullback bottleneck: `rrReadyCount > 0`, waiting-for-trigger observations dominate RR-ready observations, and `triggerReachedRate < 0.10`;
- confirmation bottleneck: `zoneTouchedCount > 0` and `confirmationAlignedRate < 0.20`;
- RR bottleneck: aligned D8.0 candidates exist and RR-ready conversion is the earliest material loss;
- touch-window bottleneck: trigger reaches exist, but zone-touch or active-window conversion is the earliest material loss.

These are review thresholds, not trading gates. They cannot change trigger geometry, RR thresholds, confirmation rules, or candidate promotion.

## Hypothesis and Research Recommendation

- Frequent RR readiness with trigger reach below 10% -> `PULLBACK_ONLY_TOO_STRICT`; only a `USABLE_SAMPLE` may recommend `DESIGN_CONTINUATION_REVIEW_BRANCH`.
- Low RR-ready conversion -> `RR_FILTER_TOO_STRICT` and `REPAIR_RR_ASSUMPTIONS`.
- Trigger reaches occur but zone touch/window conversion fails -> `UNDETERMINED` and `REPAIR_TOUCH_WINDOW`.
- Active confirmation windows exist but aligned confirmation is below 20% -> `CONFIRMATION_TOO_STRICT` and `REPAIR_CONFIRMATION_RULES`.
- Insufficient or invalid history -> `INSUFFICIENT_HISTORY` and `COLLECT_MORE_HISTORY`.
- Promotable candidates occur at or above 1% without a material stage bottleneck -> `PIPELINE_HEALTHY_WAIT_FOR_MARKET` and `WAIT_FOR_LIVE_PULLBACK`.

`DESIGN_CONTINUATION_REVIEW_BRANCH` is a research recommendation only. It does not approve, specify, or implement continuation behavior. It is forbidden for `LOW_SAMPLE`, `EARLY_SAMPLE`, data-quality failure, or context failure.

## Offline and Data-Quality Contract

Accepted sources are supplied normalized historical candles or supplied historical snapshots with deterministic timestamps. The future implementation plan must specify normalization for finite OHLC values, timestamp deduplication, ascending sort, closed-candle filtering, and timeframe consistency.

The replay must:

- never mutate source arrays or nested contracts;
- never use a public cache as source of truth;
- never request private exchange data;
- never use future candles at an earlier evaluation point;
- never fabricate fills, trades, targets, invalidations, or closed outcomes;
- never convert missing data into a failed strategy gate;
- report stale, sparse, malformed, or contradictory evidence explicitly.

## Paper Diagnostics Integration

Future additive field:

```text
paperLoopDiagnostics.historicalReplayCandidateScarcityReview
```

Paper diagnostics may expose an already computed, approved replay result or invoke an explicitly offline/read-only adapter. It must not run a large historical replay inside a live paper cycle, read runtime JSON/JSONL, or write replay results. Safe defaults use `NO_REPLAY_DATA`, null rates, zero counts, and forced safety literals.

The output must not feed strategy selection, trigger geometry, candidate construction, confirmation, activation, approval, execution, or D8.5.

## Agent HQ Design

Extend the existing Entry Candidate / Evidence area with compact read-only rows:

- replay status;
- dominant bottleneck;
- promotable rate;
- recommended next research;
- next action.

Raw funnel counts, rates, blocker distribution, trigger-distance buckets, replay window, blockers, and `doNotDo` remain in existing collapsed details.

Do not create a new card, button, handler, approval control, activation surface, or order affordance.

## Future TDD Contract

The later implementation plan must begin with RED tests for:

1. no replay data -> `NO_REPLAY_DATA`;
2. insufficient sample -> `INSUFFICIENT_REPLAY_DATA`;
3. RR bottleneck;
4. pullback-only bottleneck;
5. touch-window bottleneck;
6. confirmation bottleneck;
7. healthy candidate pipeline;
8. trigger-distance bucket counts;
9. mutually exclusive blocker-distribution counts;
10. candidate-scarcity threshold below 1% over a usable sample;
11. sample-quality boundaries at 0, 100, and 500 evaluation points;
12. exact funnel-rate denominators and zero-denominator nulls;
13. malformed or contradictory replay points -> `DATA_QUALITY_BLOCKED`;
14. point-in-time replay excludes future evidence;
15. no mutation;
16. output safety literals on every branch;
17. no operational consumer usage;
18. additive paper diagnostics field;
19. adapter/view-model full and compact mapping;
20. safe defaults.

## Safety Contract

Every output branch forces:

```text
activationAllowed = false
paperActivationAllowed = false
liveActivationAllowed = false
reviewOnly = true
shadowOnly = true
```

Hard prohibitions:

- no D8.5 implementation;
- no continuation branch implementation;
- no change to D8.0-D8.4 behavior;
- no paper or live activation;
- no order, approval, runner, broker, or execution path;
- no private exchange API;
- no runtime JSON/JSONL write;
- no environment, secret, configuration, or `config/db.php` change;
- no operational consumer or action control.

## Acceptance Criteria

D8.4.2 is acceptable only when:

- it measures the complete D8.0-D8.4 candidate funnel over point-in-time historical evidence;
- it identifies the earliest dominant loss without double-counting primary blockers;
- it distinguishes RR, pullback trigger, touch/window, confirmation, context, and data-quality scarcity;
- it requires a usable sample before recommending continuation-branch research;
- it makes no claim about fills, outcomes, expectancy, or trading edge;
- D8.5 remains implementation HOLD;
- D8.0-D8.4 behavior remains unchanged;
- all activation permissions remain disabled;
- no runtime writer, operational route, exchange API, secret, configuration, or trading control is introduced.
