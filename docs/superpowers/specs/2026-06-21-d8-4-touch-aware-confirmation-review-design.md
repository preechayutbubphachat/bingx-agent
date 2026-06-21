# D8.4 Touch-Aware Confirmation Review & Promotion Design

## Purpose

D8.3 records whether recent 5M/15M candles touched an aligned pullback zone, whether the confirmation window is active, and whether invalidation risk appeared. D8.4 consumes that temporal touch context together with fresh multi-timeframe momentum evidence to decide whether the setup can be promoted to a human review-only candidate.

D8.4 does not activate paper or live trading, arm a strategy, approve a trade, place or cancel an order, or call an exchange API. `PROMOTABLE_REVIEW_CANDIDATE` means only that the evidence is coherent enough for human review.

## Approaches Considered

### 1. Dedicated pure D8.4 helper (selected)

Create one pure helper that consumes D8.1, D8.2, D8.3, and multi-timeframe indicators. This preserves each existing state machine, gives D8.4 one responsibility, and makes status precedence independently testable.

### 2. Extend D8.1 confirmation gate

This would reduce the number of contracts but would make D8.1 depend on later touch/window semantics and change approved D8.1 behavior. It is rejected.

### 3. Calculate promotion in the adapter or UI

This would spread analytical semantics into presentation code and leave paper diagnostics without a canonical result. It is rejected.

## Architecture

Create later during implementation:

`dashboard/lib/trend/touchAwareConfirmationReview.ts`

```ts
evaluateTouchAwareConfirmationReview({
  pullbackZoneTouchEvidence,
  pullbackTriggerThresholds,
  resolverDrivenPullbackGate,
  multiTimeframeIndicatorEvidence,
})
```

The helper is deterministic and side-effect free. It must not mutate inputs or read runtime files, market snapshots, raw exact candidates, watchlist candidates, strategy state, or exchange state.

Source responsibilities:

- D8.3 supplies touch status, touch type, window status, and invalidation state.
- D8.2 supplies aligned direction, current price, canonical trigger geometry, RR values, and `rrReady`.
- D8.1 supplies an independent aligned context and source safety primitives.
- `multiTimeframeIndicatorEvidence` supplies fresh 5M/15M DI, MACD histogram, and EMA slope evidence.

D8.4 does not reconstruct trigger geometry and does not change D8.0-D8.3 behavior.

## Output Contract

```ts
type TouchAwareConfirmationReviewStatus =
  | "NO_TOUCH_CONTEXT"
  | "INVALIDATION_REVIEW_REQUIRED"
  | "TOUCH_WINDOW_INACTIVE"
  | "RR_NOT_READY"
  | "SOURCE_SAFETY_INVALID"
  | "WAITING_FOR_FRESH_CONFIRMATION"
  | "CONFIRMATION_CONFLICTING"
  | "CONFIRMATION_NOT_ALIGNED"
  | "PROMOTABLE_REVIEW_CANDIDATE";

type TouchAwareConfirmationStatus =
  | "NOT_EVALUATED"
  | "WAITING_FOR_FRESH_EVIDENCE"
  | "CONFLICTING_MOMENTUM"
  | "MOMENTUM_NOT_CONFIRMED"
  | "CONFIRMED_BULLISH"
  | "CONFIRMED_BEARISH";

type ConfirmationVote =
  | "BULLISH"
  | "BEARISH"
  | "NEUTRAL"
  | "UNAVAILABLE";

interface ConfirmationTimeframeVotes {
  timeframe: "5M" | "15M";
  ageMs: number;
  diVote: ConfirmationVote;
  macdHistogramVote: ConfirmationVote;
  emaSlopeVote: ConfirmationVote;
  classification:
    | "BULLISH_SUPPORT"
    | "BEARISH_SUPPORT"
    | "MIXED_NEUTRAL";
}

interface TouchAwareConfirmationReview {
  schemaVersion: 1;
  source: "TOUCH_AWARE_CONFIRMATION_REVIEW_V1";
  readiness: "REVIEW_NOT_ACTIVATION";
  status: TouchAwareConfirmationReviewStatus;
  alignedDirection: "LONG" | "SHORT" | "UNKNOWN";
  touchStatus: string;
  touchType: "RAW_ZONE_TOUCHED" | "EXPANDED_ZONE_TOUCHED" | null;
  confirmationWindowStatus: string;
  currentPrice: number | null;
  triggerPrice: number | null;
  rawZoneLow: number | null;
  rawZoneHigh: number | null;
  expandedZoneLow: number | null;
  expandedZoneHigh: number | null;
  bestRR: number | null;
  rrThreshold: number | null;
  rrReady: boolean;
  confirmationStatus: TouchAwareConfirmationStatus;
  confirmationTimeframesUsed: Array<"5M" | "15M">;
  confirmationVotes: ConfirmationTimeframeVotes[];
  shouldPromoteToReview: boolean;
  blockers: string[];
  nextAction: string;
  activationAllowed: false;
  paperActivationAllowed: false;
  liveActivationAllowed: false;
  reviewOnly: true;
  shadowOnly: true;
}
```

Every branch returns the same literal safety posture.

## Context Validation

D8.4 has valid context only when all conditions hold:

- D8.3, D8.2, and D8.1 objects are present;
- D8.3/D8.2/D8.1 aligned directions are `LONG` or `SHORT` and agree;
- D8.2 current price and trigger price are finite and positive;
- D8.2 raw and expanded bounds are finite, positive, and ordered;
- D8.2 status is not `NO_GATE`;
- D8.3 status is not `NO_TRIGGER_CONTEXT`.

Missing or inconsistent context returns `NO_TOUCH_CONTEXT`. The helper must not fill missing geometry from raw candidates or other diagnostics.

Output geometry and RR values use D8.2 canonical fields. D8.1 RR fields do not override D8.2 `rrReady`.

## Safety Validation

Source safety is valid only when all activation primitives are exactly false on D8.1, D8.2, and D8.3:

```text
activationAllowed = false
paperActivationAllowed = false
liveActivationAllowed = false
```

Missing, true, or non-boolean source values are invalid. A safety mismatch returns `SOURCE_SAFETY_INVALID` before indicator evaluation and always keeps D8.4 output permissions false.

D8.3 `shouldEvaluateConfirmation` is a derived checksum only. It is not a precedence gate because it can be false due to window, RR, safety, or invalidation conditions that D8.4 must classify separately.

## Indicator Freshness

Only 5M and 15M evidence may be used.

- 5M is fresh when `freshness.ageMs` is finite, non-negative, and at most 15 minutes.
- 15M is fresh when `freshness.ageMs` is finite, non-negative, and at most 45 minutes.
- stale, negative-age, missing-age, or non-finite-age evidence is ignored completely.

A timeframe is usable only when it is fresh and has at least one usable vote. An `UNAVAILABLE`-only timeframe is not included in `confirmationTimeframesUsed` or `confirmationVotes`.

If no fresh usable timeframe remains after filtering, return `WAITING_FOR_FRESH_CONFIRMATION` with confirmation status `WAITING_FOR_FRESH_EVIDENCE`.

## Vote Derivation

### DI vote

DI is usable only when `plusDI` and `minusDI` are both finite:

- `plusDI > minusDI` -> `BULLISH`;
- `minusDI > plusDI` -> `BEARISH`;
- equal values -> `NEUTRAL`;
- missing/invalid pair -> `UNAVAILABLE`.

### MACD histogram vote

- finite positive -> `BULLISH`;
- finite negative -> `BEARISH`;
- finite zero -> `NEUTRAL`;
- missing/invalid -> `UNAVAILABLE`.

### EMA slope vote

- finite positive -> `BULLISH`;
- finite negative -> `BEARISH`;
- finite zero -> `NEUTRAL`;
- missing/invalid -> `UNAVAILABLE`.

## Timeframe Classification

Classify each fresh usable timeframe from its non-`UNAVAILABLE` votes:

- `BULLISH_SUPPORT`: at least one bullish vote and no bearish vote;
- `BEARISH_SUPPORT`: at least one bearish vote and no bullish vote;
- `MIXED_NEUTRAL`: bullish and bearish both appear, all usable votes are neutral, or no directional usable vote exists.

Each fresh usable timeframe produces exactly one `ConfirmationTimeframeVotes` object. Preserve deterministic timeframe order: 5M, then 15M.

## Directional Confirmation

### LONG

- any `BEARISH_SUPPORT` timeframe -> `CONFLICTING_MOMENTUM`;
- otherwise at least one `BULLISH_SUPPORT` timeframe -> `CONFIRMED_BULLISH`;
- otherwise -> `MOMENTUM_NOT_CONFIRMED`.

### SHORT

- any `BULLISH_SUPPORT` timeframe -> `CONFLICTING_MOMENTUM`;
- otherwise at least one `BEARISH_SUPPORT` timeframe -> `CONFIRMED_BEARISH`;
- otherwise -> `MOMENTUM_NOT_CONFIRMED`.

A `MIXED_NEUTRAL` timeframe neither confirms nor conflicts. For example, bullish 5M plus mixed 15M confirms LONG; bullish 5M plus bearish-support 15M conflicts.

## Evaluation Timing

Indicator evidence is evaluated only after context, invalidation, touch-window, RR, and source-safety gates pass.

Before indicator evaluation:

- `confirmationStatus = NOT_EVALUATED`;
- `confirmationTimeframesUsed = []`;
- `confirmationVotes = []`.

This avoids presenting stale or irrelevant momentum as confirmation when the touch setup is not eligible for confirmation review.

## Status Precedence

Apply the first matching rule:

1. Missing/inconsistent D8.3, D8.2, or D8.1 context -> `NO_TOUCH_CONTEXT`.
2. D8.3 status is `INVALIDATION_RISK_TOUCHED` -> `INVALIDATION_REVIEW_REQUIRED`.
3. D8.3 status is not `CONFIRMATION_WINDOW_ACTIVE` -> `TOUCH_WINDOW_INACTIVE`.
4. D8.2 `rrReady` is not exactly true -> `RR_NOT_READY`.
5. Any D8.1/D8.2/D8.3 safety mismatch -> `SOURCE_SAFETY_INVALID`.
6. No fresh usable 5M/15M evidence -> `WAITING_FOR_FRESH_CONFIRMATION`.
7. Directional confirmation conflicts -> `CONFIRMATION_CONFLICTING`.
8. Fresh confirmation is not cleanly aligned -> `CONFIRMATION_NOT_ALIGNED`.
9. Clean aligned confirmation -> `PROMOTABLE_REVIEW_CANDIDATE`.

This ordering keeps every status reachable. D8.3 `shouldEvaluateConfirmation` must not be checked before RR or safety primitives.

## Confirmation Status Mapping

- Steps 1-5 -> `NOT_EVALUATED`.
- Step 6 -> `WAITING_FOR_FRESH_EVIDENCE`.
- Step 7 -> `CONFLICTING_MOMENTUM`.
- Step 8 -> `MOMENTUM_NOT_CONFIRMED`.
- Step 9 LONG -> `CONFIRMED_BULLISH`.
- Step 9 SHORT -> `CONFIRMED_BEARISH`.

## Promotion Rule

`shouldPromoteToReview=true` only when all conditions hold:

- D8.4 status is `PROMOTABLE_REVIEW_CANDIDATE`;
- D8.3 status is `CONFIRMATION_WINDOW_ACTIVE`;
- D8.2 `rrReady=true`;
- D8.1/D8.2/D8.3 safety primitives are valid;
- directional confirmation aligns with the canonical direction;
- no invalidation risk is present.

The result remains human review only. It does not activate, approve, arm, execute, or place/cancel anything.

## Blockers and Next Actions

Use stable blocker identifiers:

- `NO_TOUCH_CONTEXT`;
- `INVALIDATION_RISK_TOUCHED`;
- `TOUCH_WINDOW_INACTIVE`;
- `RR_NOT_READY`;
- `SOURCE_SAFETY_INVALID`;
- `FRESH_CONFIRMATION_EVIDENCE_MISSING`;
- `MOMENTUM_CONFLICT`;
- `MOMENTUM_NOT_CONFIRMED`.

The promotable state has no blockers.

Next actions:

- no context: wait for consistent D8.1-D8.3 context;
- invalidation: re-evaluate resolver/zone geometry before review;
- inactive window: wait for a new aligned pullback touch;
- RR not ready: wait for improved resolver RR geometry;
- safety invalid: retain diagnostics and restore valid review-only source safety;
- no fresh evidence: wait for a fresh 5M/15M indicator cycle;
- conflicting/not aligned: wait for non-conflicting aligned momentum;
- promotable: review the candidate manually with no activation or order action.

## Paper Diagnostics Integration

During later implementation, build D8.4 after D8.3:

```ts
const touchAwareConfirmationReview = evaluateTouchAwareConfirmationReview({
  pullbackZoneTouchEvidence,
  pullbackTriggerThresholds,
  resolverDrivenPullbackGate,
  multiTimeframeIndicatorEvidence: context.multiTimeframeIndicatorEvidence ?? null,
});
```

Expose it additively as:

`paperLoopDiagnostics.touchAwareConfirmationReview`

Do not pass it to strategy, runner, broker, execution, approval, activation, order, or exchange consumers.

## Agent HQ Contract

Add later during implementation:

- full `paper.touchAwareConfirmationReview` contract;
- compact `operatorSummary.touchConfirmation`:

```ts
{
  status: string;
  confirmationStatus: string;
  alignedDirection: string;
  touchStatus: string;
  rrReady: boolean;
  shouldPromoteToReview: boolean;
  nextAction: string;
}
```

Adapter defaults must be conservative:

- status `NO_TOUCH_CONTEXT`;
- confirmation status `NOT_EVALUATED`;
- direction `UNKNOWN`;
- arrays empty;
- numbers null;
- booleans false;
- activation permissions forced false;
- review/shadow flags forced true.

## UI

Extend only the existing Entry Candidate Resolution / Pullback section.

Compact visible fields:

- D8.4 status;
- confirmation status;
- whether the setup should be promoted to review;
- blockers;
- next action.

Keep timeframe votes, freshness ages, and raw confirmation details in the existing collapsed details area. Do not create a new large card, action button, approval control, activation control, or handler.

## TDD Requirements for Later Implementation

Create `dashboard/lib/trend/touchAwareConfirmationReview.test.ts` before the helper and observe RED.

Required cases:

1. Missing D8.1/D8.2/D8.3 context -> `NO_TOUCH_CONTEXT`.
2. Invalidation touch -> `INVALIDATION_REVIEW_REQUIRED`.
3. Inactive/expired/no-touch window -> `TOUCH_WINDOW_INACTIVE`.
4. Active window with D8.2 RR not ready -> `RR_NOT_READY`.
5. D8.1, D8.2, or D8.3 safety mismatch -> `SOURCE_SAFETY_INVALID`.
6. No fresh usable indicators -> `WAITING_FOR_FRESH_CONFIRMATION`.
7. LONG fresh bullish support -> promotable with `CONFIRMED_BULLISH`.
8. LONG bearish-support timeframe -> conflicting.
9. LONG fresh mixed/neutral only -> not aligned.
10. SHORT fresh bearish support -> promotable with `CONFIRMED_BEARISH`.
11. SHORT bullish-support timeframe -> conflicting.
12. Stale evidence is ignored.
13. Negative/missing/non-finite age is ignored.
14. `UNAVAILABLE`-only timeframe is not used.
15. 5M bullish plus 15M bearish conflicts.
16. One aligned timeframe plus one mixed timeframe confirms.
17. D8.3 `shouldEvaluateConfirmation=false` does not hide RR/safety statuses.
18. `shouldPromoteToReview` is true only for the clean promotable branch.
19. Helper does not mutate inputs.
20. Every branch forces output safety literals.
21. Paper diagnostics exposes the additive field.
22. Adapter maps full and compact contracts safely.

## Validation for Later Implementation

From `dashboard`:

```text
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

## Safety and Scope

Allowed later implementation scope:

- pure D8.4 helper and focused tests;
- additive paper diagnostics wiring/tests;
- additive Agent HQ VM, adapter, mock, tests, and existing-card fields;
- D8.4 spec and implementation plan.

Forbidden:

- production behavior changes in D8.0-D8.3;
- raw exact/watchlist candidate reads;
- trigger reconstruction;
- runner, broker, execution, approval, order, activation, or exchange paths;
- private exchange APIs;
- runtime JSON/JSONL writes;
- `.env`, secrets, or `config/db.php`;
- new activation/order UI controls.

All future staging must use explicit file paths and never `git add .`.

## Design-Only Deliverable

This D8.4 task creates only this design specification. It does not create production code, tests, an implementation plan, a commit, a staged change, or a push.
