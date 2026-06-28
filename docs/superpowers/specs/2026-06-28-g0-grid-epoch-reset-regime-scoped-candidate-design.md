# G0 Grid Epoch Reset and Regime-Scoped Grid Candidate Design

Status: Design only.

## Purpose

G0 defines a safe review-only design for separating obsolete static grid epoch evidence from current market-regime grid eligibility. The old static grid round must not permanently anchor current strategy review when the market has changed.

Core principle:

```text
oldGridEpoch != currentGridEligibility
```

If the current market regime is suitable for grid review, the system should evaluate a fresh grid candidate from current market data. It must not remain blocked forever by old one-sided exposure, and it must not repair that exposure by forcing a trade.

## Problem

Current Grid / Paper diagnostics can still treat old one-sided BUY exposure and `BELOW_GRID` state as dominant blockers. That is correct when auditing the old epoch, but it is not sufficient for current review.

The system needs three separate concepts:

1. old static grid epoch evidence;
2. current market regime classification;
3. fresh grid candidate review.

Old exposure remains visible as audit evidence, but it must not be counted as edge and must not be reused as current grid range geometry.

## Non-Goals

- no paper activation;
- no live activation;
- no order placement;
- no forced SELL;
- no close-old-exposure workflow;
- no strategy change;
- no runner, broker, execution, order, API route, env, secret, or config change;
- no D8.5 implementation;
- no continuation branch implementation.

## Required Model

Future diagnostics should expose:

```ts
type GridEpochContextV1 = {
  schemaVersion: 1;
  source: "GRID_EPOCH_CONTEXT_V1";
  readiness: "REVIEW_NOT_ACTIVATION";

  oldEpochStatus:
    | "NONE"
    | "QUARANTINED"
    | "OBSOLETE_MARKET_CHANGED"
    | "CLOSED_WITH_EVIDENCE"
    | "DATA_QUALITY_BLOCKED";

  oldEpochPolicy: Array<
    | "DO_NOT_FORCE_SELL"
    | "DO_NOT_COUNT_AS_EDGE"
    | "DO_NOT_USE_FOR_NEW_GRID_RANGE"
    | "KEEP_FOR_AUDIT_ONLY"
  >;

  currentGridEligibility:
    | "NOT_EVALUATED"
    | "GRID_REGIME_ELIGIBLE"
    | "TREND_REGIME_BLOCKED"
    | "VOLATILITY_BLOCKED"
    | "COST_GATE_BLOCKED"
    | "DATA_QUALITY_BLOCKED";

  currentRegime:
    | "RANGE"
    | "UPTREND"
    | "DOWNTREND"
    | "HIGH_VOL"
    | "LOW_VOL"
    | "UNKNOWN";

  proposedNextResearch:
    | "EVALUATE_FRESH_GRID_CANDIDATE"
    | "WAIT_FOR_RANGE_REGIME"
    | "USE_TREND_REVIEW_PATH"
    | "REPAIR_GRID_DATA_QUALITY"
    | "NO_ACTION";

  blockers: string[];
  nextAction: string;

  activationAllowed: false;
  paperActivationAllowed: false;
  liveActivationAllowed: false;
  reviewOnly: true;
  shadowOnly: true;
};
```

The object is diagnostic state only. It must not feed order placement or activation.

## Required Separation

### 1. oldEpochAudit

`oldEpochAudit` records why old grid evidence is not usable as current edge.

It should report:

- whether old epoch evidence exists;
- whether old exposure is open, quarantined, obsolete, closed, or data-quality blocked;
- why old bounds are not current active grid bounds;
- whether old BUY exposure remains audit-only;
- whether old closed-cycle claims are supported by evidence.

Policy:

- old exposure is not a reason to force SELL;
- old exposure is not edge evidence;
- old lower/upper grid bounds are not reused for fresh candidate geometry;
- old epoch data remains visible for audit and operator context.

Operator copy:

```text
old exposure is audit-only and not edge evidence.
```

### 2. currentRegimeGridCheck

`currentRegimeGridCheck` determines whether the current market can be reviewed as grid-suitable.

Inputs should be current-only:

- current price;
- current canonical regime;
- current ATR;
- current BBW;
- current ADX or equivalent directional-strength signal;
- current spread, slippage, fee, and funding assumptions;
- current source freshness.

Rules:

- `RANGE` is preferred for grid review.
- `UPTREND` or `DOWNTREND` should block grid as `TREND_REGIME_BLOCKED` and defer to the D8 trend review path.
- `HIGH_VOL` may block as `VOLATILITY_BLOCKED` when oscillation risk is dominated by expansion or liquidation risk.
- `UNKNOWN` should not approve grid review unless enough fresh data exists to classify the regime.
- stale or contradictory source data returns `DATA_QUALITY_BLOCKED`.

### 3. freshGridCandidateReview

`freshGridCandidateReview` computes review-only candidate geometry from current market data.

It should produce:

- candidate lower bound;
- candidate upper bound;
- candidate mid;
- `gridSpacingPct`;
- proposed grid count;
- expected cost gate status;
- freshness status;
- blocker list;
- review-only next action.

It must not:

- reuse old grid lower/upper as active bounds;
- count old BUY exposure as closed-cycle edge;
- force SELL;
- close or repair old exposure;
- open a new grid;
- mark paper or live execution as allowed.

## Grid Suitability Rules

Grid review should require:

- current regime is `RANGE`, or otherwise non-directional enough for grid review;
- ADX is low or moderate, or trend strength is not directionally dominant;
- BBW and ATR support enough oscillation for spacing;
- `gridSpacingPct` exceeds required minimum cost spacing;
- spread, slippage, fees, and funding risk do not dominate the expected grid interval;
- market data source is fresh;
- enough candles exist for the timeframe used by the grid algorithm;
- no data-quality contradiction exists between price, candles, regime, and cost assumptions.

If these rules fail, the output should explain the failed check without implying strategy failure.

## Old Epoch Must Not Block Fresh Review When Safe

The old epoch must not block current grid eligibility when all of these are true:

- `oldEpochStatus` is `OBSOLETE_MARKET_CHANGED` or `QUARANTINED`;
- current market data is fresh;
- current regime can be evaluated independently;
- current candidate geometry does not reuse old grid bounds;
- the output remains review-only and shadow-only.

The old epoch still remains visible as an audit warning.

## Agent HQ Future UI

The future UI belongs in the existing Grid / Paper section only.

Compact rows:

- old epoch status;
- current grid eligibility;
- current regime;
- proposed next research;
- cost gate status;
- next action.

No UI controls:

- no buttons;
- no arm controls;
- no order controls;
- no approval controls;
- no activation controls.

UI copy must separate:

- old epoch audit;
- current market regime;
- fresh grid candidate review;
- paper/live execution permission.

## Relationship to DQ-A

DQ-A fixes whether paper and no-trade evidence is measurable. It focuses on fill price availability, closed-cycle pairing visibility, `gridSpacingPct` logging, mode/regime/session tags, no-trade reason coverage, and stale `latest_decision` separation.

G0 fixes whether obsolete old grid epoch state incorrectly blocks fresh grid review.

They are separate:

- DQ-A improves evidence quality.
- G0 scopes grid review to the current regime and quarantines obsolete epoch evidence.
- Either can report data-quality blockers without approving activation.

## Relationship to D8

If the current regime is `UPTREND` or `DOWNTREND`, the trend path remains primary and grid review should return `TREND_REGIME_BLOCKED` with `USE_TREND_REVIEW_PATH`.

If the current regime is `RANGE`, grid review may produce `EVALUATE_FRESH_GRID_CANDIDATE` for review only.

G0 does not implement D8.5 and does not change any D8 candidate, trigger, confirmation, or replay behavior.

## Acceptance Criteria

- clearly separates old epoch from current grid eligibility;
- does not force close or trade old exposure;
- does not activate a new grid;
- does not alter live or paper execution;
- defines fresh grid candidate review from current market only;
- keeps old epoch audit visible;
- keeps all outputs review-only and shadow-only;
- keeps activation flags false.

## Validation Expectations

For this design-only step:

- no code changes;
- no test changes;
- no runtime JSON or JSONL files;
- no replay pack generation;
- no env, secret, or config changes;
- no runner, broker, execution, order, or API route changes;
- no D8.5 staging;
- no continuation branch;
- no stage, commit, or push unless a docs-only release is explicitly approved.
