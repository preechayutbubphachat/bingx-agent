# D8.4.1 No-Review-Candidate Bottleneck Resolver Design

## Purpose

D8.0-D8.4 form a review-only candidate pipeline. D8.4 can emit `PROMOTABLE_REVIEW_CANDIDATE`, but the current runtime remains upstream of that state:

- aligned direction is LONG;
- best RR is approximately 6.208 and `rrReady = true`;
- current price is approximately 64435.4;
- trigger price is approximately 63834.4677;
- distance to trigger is approximately 600.93 USDT;
- D8.2 is `WAITING_FOR_TRIGGER_PRICE`;
- D8.3 is `NO_TOUCH_YET`;
- D8.4 is `TOUCH_WINDOW_INACTIVE`;
- review promotion is false.

RR is no longer the primary blocker. Price has not reached the pullback trigger, so touch and confirmation evaluation cannot advance.

D8.4.1 defines a pure diagnostic resolver that identifies the first meaningful bottleneck in D8.0-D8.4 and recommends the next algorithmic research branch. It does not create a candidate, relax an upstream gate, or execute any trading behavior.

D8.5 remains on hold. Implementing an outcome recorder while no review candidate exists would only produce `NO_REVIEW_CANDIDATE` and would not resolve candidate-generation scarcity.

## Scope

The future D8.4.1 implementation may add:

- `dashboard/lib/trend/noReviewCandidateBottleneckResolver.ts`;
- focused pure-helper tests;
- additive `paperLoopDiagnostics.noReviewCandidateBottleneckResolver` output;
- additive Agent HQ adapter/view-model mapping;
- four compact read-only fields inside the existing Entry Candidate section.

It must not add a continuation entry, change D8.0-D8.4 decisions, implement D8.5, persist runtime state, or add an operational consumer.

## Approaches Considered

### Approach A: Dedicated pure precedence resolver (selected)

Create one helper that consumes the existing D8.0-D8.4 contracts and normalized multi-timeframe evidence. It classifies the earliest actionable diagnostic bottleneck and produces a non-operational research recommendation.

Advantages:

- preserves D8.0-D8.4 as sources of truth;
- makes precedence and current-runtime interpretation independently testable;
- separates candidate scarcity from outcome tracking;
- keeps recommendations review-only;
- supports safe additive integration.

### Approach B: Derive the bottleneck in Agent HQ (rejected)

The UI could compare D8 status strings directly. This would duplicate semantics in presentation code, leave paper diagnostics without a canonical result, and make status precedence difficult to test. Agent HQ must display the resolver output, not invent it.

### Approach C: Extend D8.2, D8.3, or D8.4 with continuation logic (rejected)

Adding continuation behavior to an approved pullback state machine would change existing semantics and combine diagnosis with a new strategy branch. D8.4.1 must identify that a continuation-review design may be useful; it must not implement one.

## Pure Helper Boundary

Future API:

```ts
evaluateNoReviewCandidateBottleneckResolver({
  entryCandidateResolution,
  resolverDrivenPullbackGate,
  pullbackTriggerThresholds,
  pullbackZoneTouchEvidence,
  touchAwareConfirmationReview,
  multiTimeframeIndicatorEvidence,
})
```

The helper must be:

- pure and deterministic;
- side-effect free;
- non-mutating;
- independent of runtime files, market-snapshot parsing, routes, environment variables, databases, and APIs;
- dependent only on normalized contracts supplied by paper diagnostics;
- unable to alter any source status or safety flag.

## Source Responsibilities

- D8.0 supplies aligned resolution context and confirms that an aligned review geometry exists.
- D8.1 supplies pullback-gate status and an independent aligned-direction/safety checksum.
- D8.2 is authoritative for current price, trigger price, distance to trigger, best RR, RR threshold, and `rrReady`.
- D8.3 is authoritative for touch and confirmation-window state.
- D8.4 is authoritative for confirmation-review and promotion state.
- Multi-timeframe evidence is used only to classify whether a continuation-research recommendation is supported. It is not used to create a candidate.

D8.4.1 must not reconstruct zones or prices from raw exact candidates, watchlists, paper fills, or strategy internals.

## Output Contract

```ts
interface NoReviewCandidateBottleneckResolver {
  schemaVersion: 1;
  source: "NO_REVIEW_CANDIDATE_BOTTLENECK_RESOLVER_V1";
  readiness: "REVIEW_NOT_ACTIVATION";

  status:
    | "NO_CONTEXT"
    | "PROMOTABLE_REVIEW_EXISTS"
    | "RR_NOT_READY"
    | "WAITING_FOR_PULLBACK_TRIGGER"
    | "NO_TOUCH_EVIDENCE"
    | "TOUCH_WINDOW_EXPIRED"
    | "CONFIRMATION_NOT_READY"
    | "CONFIRMATION_CONFLICTING"
    | "SAFETY_BLOCKED"
    | "STRATEGY_BRANCH_GAP";

  primaryBlocker:
    | "MISSING_CONTEXT"
    | "NONE"
    | "RR_BELOW_THRESHOLD"
    | "PRICE_ABOVE_LONG_TRIGGER"
    | "PRICE_BELOW_SHORT_TRIGGER"
    | "PULLBACK_ZONE_NOT_TOUCHED"
    | "TOUCH_WINDOW_INACTIVE"
    | "MOMENTUM_NOT_CONFIRMED"
    | "MOMENTUM_CONFLICT"
    | "SOURCE_SAFETY_INVALID"
    | "PULLBACK_ONLY_STRATEGY_GAP";

  contributingBlockers: Array<
    | "RR_BELOW_THRESHOLD"
    | "PRICE_ABOVE_LONG_TRIGGER"
    | "PRICE_BELOW_SHORT_TRIGGER"
    | "PULLBACK_ZONE_NOT_TOUCHED"
    | "TOUCH_WINDOW_INACTIVE"
    | "MOMENTUM_NOT_CONFIRMED"
    | "MOMENTUM_CONFLICT"
    | "SOURCE_SAFETY_INVALID"
    | "PULLBACK_ONLY_STRATEGY_GAP"
  >;

  alignedDirection: "LONG" | "SHORT" | "UNKNOWN";
  currentPrice: number | null;
  triggerPrice: number | null;
  distanceToTriggerAbs: number | null;
  distanceToTriggerPct: number | null;
  bestRR: number | null;
  rrThreshold: number | null;
  rrReady: boolean;
  touchStatus: string;
  confirmationStatus: string;

  d8Statuses: {
    d8_0: string;
    d8_1: string;
    d8_2: string;
    d8_3: string;
    d8_4: string;
  };

  triggerDistanceClass: "AT_TRIGGER" | "NEAR" | "MID_RANGE" | "FAR" | "UNKNOWN";
  continuationEvidence: {
    status: "STRONG_ALIGNED" | "WEAK_OR_MIXED" | "CONFLICTING" | "INSUFFICIENT";
    timeframesUsed: Array<"5M" | "15M">;
    reasons: string[];
  };

  nextAlgorithmBranch:
    | "WAIT_FOR_PULLBACK"
    | "DESIGN_CONTINUATION_REVIEW_BRANCH"
    | "RUN_HISTORICAL_REPLAY_REVIEW"
    | "REPAIR_RR"
    | "REPAIR_CONFIRMATION"
    | "NO_ACTION";

  nextAction: string;
  doNotDo: string[];

  activationAllowed: false;
  paperActivationAllowed: false;
  liveActivationAllowed: false;
  reviewOnly: true;
  shadowOnly: true;
}
```

`triggerDistanceClass` and `continuationEvidence` make the recommendation auditable. They do not represent a new entry model.

## Context Validation

Context is valid only when:

- all D8.0-D8.4 objects are present;
- their source identifiers and schema versions match the approved contracts;
- aligned directions are LONG or SHORT and agree across D8.0-D8.4;
- D8.2 current price and trigger price are finite and positive;
- D8.2 distance fields are finite and non-negative;
- D8.2 best RR and threshold are finite and positive;
- D8.2 `rrReady` is boolean;
- source safety primitives are present.

Missing or contradictory context returns:

```text
status = NO_CONTEXT
primaryBlocker = MISSING_CONTEXT
nextAlgorithmBranch = NO_ACTION
```

The resolver must not repair missing fields from another source.

## Distance Consistency

D8.2 is the canonical distance source, but D8.4.1 must check it for internal consistency:

```text
computedDistanceAbs = abs(currentPrice - triggerPrice)
computedDistancePct = computedDistanceAbs / currentPrice * 100
```

Canonical and recomputed values must agree within small fixed tolerances:

```text
DISTANCE_ABS_TOLERANCE = max(0.01, currentPrice * 0.000001)
DISTANCE_PCT_TOLERANCE = 0.0001 percentage points
```

An inconsistency returns `NO_CONTEXT`; it must not produce a branch recommendation from stale geometry.

Directional waiting must also agree:

- LONG waiting: `currentPrice > triggerPrice`;
- SHORT waiting: `currentPrice < triggerPrice`.

If D8.2 says `WAITING_FOR_TRIGGER_PRICE` but direction and price relation disagree, return `NO_CONTEXT`.

## Trigger Distance Classification

Use review-only constants:

```text
AT_TRIGGER_MAX_PCT = 0.05
NEAR_TRIGGER_MAX_PCT = 0.25
FAR_TRIGGER_MIN_PCT = 0.75
```

Classification:

- `AT_TRIGGER`: distance is at most 0.05%;
- `NEAR`: distance is above 0.05% and at most 0.25%;
- `MID_RANGE`: distance is above 0.25% and below 0.75%;
- `FAR`: distance is at least 0.75%;
- `UNKNOWN`: distance context is invalid.

These thresholds rank diagnostic urgency only. They do not widen the pullback zone or alter D8.2 trigger geometry.

At the current runtime, the approximate distance is 600.93 / 64435.4 = 0.933%, so the trigger is `FAR`.

## Fresh Multi-Timeframe Evidence

Use only 5M and 15M evidence.

- 5M is fresh when age is finite, non-negative, and at most 15 minutes.
- 15M is fresh when age is finite, non-negative, and at most 45 minutes.
- stale or invalid evidence is ignored.

A fresh timeframe has directional support only when:

- ADX is finite and at least 25;
- for LONG, `plusDI > minusDI`;
- for SHORT, `minusDI > plusDI`;
- at least one momentum vote agrees: positive MACD histogram or EMA slope for LONG, negative MACD histogram or EMA slope for SHORT.

A timeframe is directionally conflicting when DI supports the opposite direction and at least one momentum vote also supports the opposite direction.

Aggregate classification:

- `CONFLICTING`: any fresh usable timeframe is directionally conflicting;
- `STRONG_ALIGNED`: no conflict and at least one fresh timeframe meets all aligned-support rules;
- `WEAK_OR_MIXED`: fresh usable evidence exists but does not meet strong aligned support;
- `INSUFFICIENT`: no fresh usable timeframe remains.

Do not reuse D8.4 confirmation status as continuation evidence when its touch window is inactive. D8.4 correctly avoids confirmation evaluation before touch; D8.4.1 separately summarizes raw fresh trend evidence only to recommend research.

## Strategy Branch Gap

`STRATEGY_BRANCH_GAP` describes an architectural limitation, not a market entry.

All conditions are required:

- D8.0 and D8.1 have an aligned LONG or SHORT resolution;
- D8.2 `rrReady = true`;
- D8.2 is `WAITING_FOR_TRIGGER_PRICE`;
- D8.3 is `NO_TOUCH_YET`;
- D8.4 is `TOUCH_WINDOW_INACTIVE`;
- distance class is `FAR`;
- continuation evidence is `STRONG_ALIGNED`;
- no continuation-review result exists in the approved D8.0-D8.4 pipeline.

For D8.4.1 V1, the last condition is a documented architecture fact: D8.0-D8.4 implement only the aligned pullback path. The resolver must not search for or synthesize an alternative candidate.

Result:

```text
status = STRATEGY_BRANCH_GAP
primaryBlocker = PRICE_ABOVE_LONG_TRIGGER or PRICE_BELOW_SHORT_TRIGGER
contributingBlockers include PULLBACK_ZONE_NOT_TOUCHED and PULLBACK_ONLY_STRATEGY_GAP
nextAlgorithmBranch = RUN_HISTORICAL_REPLAY_REVIEW
```

The corresponding explanation is:

> Current review strategy is pullback-only. No review candidate can appear until price returns to the aligned zone. A separately approved continuation-review design may be evaluated; this resolver does not create that branch.

## Status Precedence

Apply the first matching rule:

1. Missing or inconsistent D8.0-D8.4 context -> `NO_CONTEXT`.
2. Any D8.0-D8.4 safety mismatch -> `SAFETY_BLOCKED`.
3. D8.4 is `PROMOTABLE_REVIEW_CANDIDATE` and promotion boolean is true -> `PROMOTABLE_REVIEW_EXISTS`.
4. D8.2 `rrReady` is not true or best RR is below threshold -> `RR_NOT_READY`.
5. D8.4 is `CONFIRMATION_CONFLICTING` -> `CONFIRMATION_CONFLICTING`.
6. D8.3 is `CONFIRMATION_WINDOW_EXPIRED` -> `TOUCH_WINDOW_EXPIRED`.
7. All strategy-branch-gap conditions hold -> `STRATEGY_BRANCH_GAP`.
8. D8.2 is `WAITING_FOR_TRIGGER_PRICE` -> `WAITING_FOR_PULLBACK_TRIGGER`.
9. D8.3 is `NO_TOUCH_YET` -> `NO_TOUCH_EVIDENCE`.
10. D8.4 is `WAITING_FOR_FRESH_CONFIRMATION` or `CONFIRMATION_NOT_ALIGNED` -> `CONFIRMATION_NOT_READY`.
11. Any remaining non-promotable valid context -> `CONFIRMATION_NOT_READY`.

The branch-gap rule precedes generic waiting/no-touch rules so it remains reachable. It requires more evidence than ordinary waiting and does not hide safety, RR, conflict, or expiry blockers.

## Primary Blocker Mapping

- `NO_CONTEXT` -> `MISSING_CONTEXT`;
- `PROMOTABLE_REVIEW_EXISTS` -> `NONE`;
- `RR_NOT_READY` -> `RR_BELOW_THRESHOLD`;
- LONG `WAITING_FOR_PULLBACK_TRIGGER` -> `PRICE_ABOVE_LONG_TRIGGER`;
- SHORT `WAITING_FOR_PULLBACK_TRIGGER` -> `PRICE_BELOW_SHORT_TRIGGER`;
- `NO_TOUCH_EVIDENCE` -> `PULLBACK_ZONE_NOT_TOUCHED`;
- `TOUCH_WINDOW_EXPIRED` -> `TOUCH_WINDOW_INACTIVE`;
- `CONFIRMATION_NOT_READY` -> `MOMENTUM_NOT_CONFIRMED`;
- `CONFIRMATION_CONFLICTING` -> `MOMENTUM_CONFLICT`;
- `SAFETY_BLOCKED` -> `SOURCE_SAFETY_INVALID`;
- `STRATEGY_BRANCH_GAP` -> directional price/trigger blocker remains primary; `PULLBACK_ONLY_STRATEGY_GAP` is additive.

## Algorithmic Recommendation

Recommendation is downstream of status classification and never overrides it.

### `NO_ACTION`

Use when context is invalid, source safety is invalid, or a promotable review candidate already exists. D8.4.1 has no further candidate-generation recommendation.

### `REPAIR_RR`

Use only for `RR_NOT_READY`. The next action is to wait for improved resolver geometry. D8.4.1 must not change target, invalidation, or threshold.

### `REPAIR_CONFIRMATION`

Use for confirmation conflict or non-alignment after a valid touch context. The next action is to wait for fresh non-conflicting evidence.

### `WAIT_FOR_PULLBACK`

Use when:

- D8.2 is waiting for trigger; and
- distance class is `AT_TRIGGER`, `NEAR`, or `MID_RANGE`.

It may also be used when distance is FAR but continuation evidence is weak or conflicting and historical replay evidence is already sufficient to reject further branch research. The resolver does not move the trigger toward current price.

### `DESIGN_CONTINUATION_REVIEW_BRANCH`

Reserved for a future post-replay decision layer. D8.4.1 V1 does not emit this branch because Historical Replay Review must quantify candidate scarcity before continuation design is justified.

### `RUN_HISTORICAL_REPLAY_REVIEW`

Use when:

- price is FAR from trigger; and
- continuation evidence is `INSUFFICIENT`, `WEAK_OR_MIXED`, or otherwise inadequate to justify branch design.

Historical replay should estimate how often pullback-only waiting suppresses candidates and whether continuation geometry would have produced coherent review evidence. Replay remains offline/read-only and requires its own approved design before implementation.

## Current Runtime Classification

The current evidence yields:

```text
alignedDirection = LONG
rrReady = true
status path = WAITING_FOR_TRIGGER_PRICE -> NO_TOUCH_YET -> TOUCH_WINDOW_INACTIVE
primary blocker = PRICE_ABOVE_LONG_TRIGGER
distance class = FAR
```

Therefore RR repair is not recommended.

The final status depends only on fresh continuation evidence:

- with `STRONG_ALIGNED` evidence: `STRATEGY_BRANCH_GAP` and `RUN_HISTORICAL_REPLAY_REVIEW`;
- with insufficient or mixed evidence: `WAITING_FOR_PULLBACK_TRIGGER` and `RUN_HISTORICAL_REPLAY_REVIEW`;
- if price moves to MID_RANGE, NEAR, or AT_TRIGGER: `WAITING_FOR_PULLBACK_TRIGGER` and `WAIT_FOR_PULLBACK`.

In every case, the immediate market blocker remains that LONG price is above the pullback trigger. Favorable RR does not bypass touch.

## `nextAction` and `doNotDo`

`nextAction` must be concise and status-specific. Representative meanings:

- wait for price to return to the existing aligned trigger;
- collect fresh MTF evidence before recommending continuation research;
- design a separate continuation-review branch;
- run an offline historical replay review;
- repair RR evidence;
- wait for non-conflicting confirmation;
- no bottleneck action because D8.4 already has a promotable review candidate.

`doNotDo` is always non-empty and includes:

- do not move or widen the trigger to force a candidate;
- do not convert continuation evidence into an entry;
- do not bypass touch or confirmation;
- do not implement D8.5 until candidate-generation evidence exists;
- do not activate paper or live behavior;
- do not place or approve a trade.

## Paper Diagnostics Integration

Future additive field:

```text
paperLoopDiagnostics.noReviewCandidateBottleneckResolver
```

Build after D8.4 so all source contracts are already available.

The output must not feed:

- strategy selection;
- candidate construction;
- trigger geometry;
- approval or activation gates;
- operational trading paths;
- exchange integration;
- D8.5 outcome statistics.

No API or internal route change is required.

## Agent HQ Design

Extend the existing Entry Candidate section only.

Compact rows:

- primary blocker;
- distance to trigger;
- next algorithm branch;
- next action.

Existing collapsed details may include:

- D8.0-D8.4 statuses;
- trigger distance class;
- continuation evidence status and reasons;
- `doNotDo` list.

Do not create a new card, button, handler, approval surface, activation control, or trading affordance.

## Safety Contract

Every branch forces:

```text
activationAllowed = false
paperActivationAllowed = false
liveActivationAllowed = false
reviewOnly = true
shadowOnly = true
```

Source safety is valid only when all D8.0-D8.4 activation primitives are exactly false. Missing, true, or non-boolean values produce `SAFETY_BLOCKED` while output safety remains forced to the literals above.

Hard prohibitions:

- no continuation candidate implementation;
- no D8.5 implementation;
- no change to D8.0-D8.4 behavior;
- no runtime JSON/JSONL write;
- no database or configuration change;
- no environment or secret access;
- no private exchange API;
- no operational trading consumer;
- no action control.

## Error Handling

- Invalid top-level inputs produce safe `NO_CONTEXT` output, never exceptions.
- Non-finite numeric values remain null in output.
- Inconsistent distance geometry produces `NO_CONTEXT`.
- Stale MTF evidence is ignored rather than interpreted as weak trend.
- D8.4.1 V1 cannot produce `DESIGN_CONTINUATION_REVIEW_BRANCH` before Historical Replay Review.
- D8.4 promotion boolean and status must agree; disagreement produces `NO_CONTEXT`.
- Unknown future source statuses fall back to `CONFIRMATION_NOT_READY` only after context and safety validation.

## Future TDD Contract

The implementation plan must begin with RED tests for:

1. missing or inconsistent source context -> `NO_CONTEXT`;
2. promotable D8.4 candidate -> `PROMOTABLE_REVIEW_EXISTS`;
3. RR below threshold -> `RR_NOT_READY`;
4. LONG waiting above trigger -> `PRICE_ABOVE_LONG_TRIGGER`;
5. SHORT waiting below trigger -> `PRICE_BELOW_SHORT_TRIGGER`;
6. no touch after trigger context -> `NO_TOUCH_EVIDENCE`;
7. expired touch window -> `TOUCH_WINDOW_EXPIRED`;
8. confirmation not aligned -> `CONFIRMATION_NOT_READY`;
9. confirmation conflicting -> `CONFIRMATION_CONFLICTING`;
10. source safety mismatch -> `SAFETY_BLOCKED`;
11. FAR + strong aligned trend + pullback-only chain -> `STRATEGY_BRANCH_GAP`;
12. NEAR/MID trigger -> `WAIT_FOR_PULLBACK`;
13. FAR + insufficient evidence -> `RUN_HISTORICAL_REPLAY_REVIEW`;
14. threshold boundary inclusivity at 0.05%, 0.25%, and 0.75%;
15. 5M/15M freshness and aligned-strength classification;
16. stale evidence ignored;
17. distance consistency validation;
18. current runtime fixture identifies RR-ready LONG price above trigger;
19. no mutation;
20. output safety literals on every branch;
21. additive paper diagnostics field;
22. adapter/view-model full and compact mapping;
23. safe defaults;
24. no operational consumer usage.

## Future Validation

The later implementation must run:

```text
node --test --experimental-strip-types lib/trend/noReviewCandidateBottleneckResolver.test.ts
node --test --experimental-strip-types lib/trend/touchAwareConfirmationReview.test.ts
node --test --experimental-strip-types lib/trend/pullbackZoneTouchEvidence.test.ts
node --test --experimental-strip-types lib/trend/pullbackTriggerThresholds.test.ts
node --test --experimental-strip-types lib/trend/resolverDrivenPullbackGate.test.ts
node --test --experimental-strip-types lib/trend/entryCandidateResolver.test.ts
node --test --experimental-strip-types lib/paper/paperLoopDiagnostics.test.ts
node --test --experimental-strip-types lib/trading-agent-hq/adapter.test.ts
npx tsc --noEmit --incremental false
npm run build
```

Served smoke may inspect the compact row only after the latest build succeeds. An authentication redirect must be reported as visual smoke not completed.

## Acceptance Criteria

D8.4.1 is acceptable only when:

- the first true candidate-generation bottleneck is explicit;
- RR-ready waiting is not mislabeled as RR failure;
- pullback waiting, missing touch, expired window, and confirmation failure remain distinct;
- strategy-branch-gap status is reachable only with FAR distance and fresh strong aligned evidence;
- insufficient trend evidence recommends replay rather than continuation design;
- recommendations never create or alter a candidate;
- D8.5 remains on hold until candidate-generation evidence exists;
- all output permissions remain disabled;
- no production behavior, runtime writer, route, secret, configuration, operational path, or action control is added by the design artifact.
