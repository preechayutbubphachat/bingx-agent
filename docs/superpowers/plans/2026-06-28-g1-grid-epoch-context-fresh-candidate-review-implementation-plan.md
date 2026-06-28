# G1 Grid Epoch Context and Fresh Candidate Review Implementation Plan

Status: Plan only.

## Purpose

Implement review-only diagnostics that separate:

1. old grid epoch audit;
2. current market regime and grid eligibility;
3. fresh grid candidate review.

Design source:

- `docs/superpowers/specs/2026-06-28-g0-grid-epoch-reset-regime-scoped-candidate-design.md`

Future implementation files:

- `dashboard/lib/grid/gridEpochContext.ts`
- `dashboard/lib/grid/gridEpochContext.test.ts`

G1 must not open a grid, activate paper/live, place orders, force SELL, close old exposure, or reuse old grid bounds as active bounds.

## Output Contract

The helper should return a deterministic object matching G0:

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

  oldEpochPolicy: [
    "DO_NOT_FORCE_SELL",
    "DO_NOT_COUNT_AS_EDGE",
    "DO_NOT_USE_FOR_NEW_GRID_RANGE",
    "KEEP_FOR_AUDIT_ONLY"
  ];

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

  freshGridCandidateReview: {
    status:
      | "NO_CANDIDATE"
      | "CANDIDATE_REVIEW_READY"
      | "REGIME_BLOCKED"
      | "VOLATILITY_BLOCKED"
      | "COST_GATE_BLOCKED"
      | "DATA_QUALITY_BLOCKED";
    candidateGridLower: number | null;
    candidateGridUpper: number | null;
    candidateGridMid: number | null;
    candidateGridWidthPct: number | null;
    candidateSpacingPct: number | null;
    gridCount: number | null;
    costGatePass: boolean | null;
    blockers: string[];
  };

  blockers: string[];
  nextAction: string;

  activationAllowed: false;
  paperActivationAllowed: false;
  liveActivationAllowed: false;
  reviewOnly: true;
  shadowOnly: true;
};
```

All safety flags are literals and must never be derived from input.

## Task 1 - RED Tests for Pure Helper

Create `dashboard/lib/grid/gridEpochContext.test.ts` before the helper implementation.

Test cases:

- old epoch is `QUARANTINED`, but current grid eligibility can still be evaluated from fresh current data;
- old epoch is `OBSOLETE_MARKET_CHANGED`, and old grid lower/upper are not reused in candidate bounds;
- `RANGE` regime with fresh data and cost pass produces `CANDIDATE_REVIEW_READY`;
- `DOWNTREND` blocks grid review with `TREND_REGIME_BLOCKED` and `USE_TREND_REVIEW_PATH`;
- `UPTREND` blocks grid review with `TREND_REGIME_BLOCKED` and `USE_TREND_REVIEW_PATH`;
- high volatility blocks with `VOLATILITY_BLOCKED`;
- cost gate failure blocks with `COST_GATE_BLOCKED`;
- missing or non-finite `gridSpacingPct` blocks with `DATA_QUALITY_BLOCKED`;
- stale source data blocks with `DATA_QUALITY_BLOCKED`;
- all activation flags are false, and `reviewOnly` plus `shadowOnly` are true;
- input objects are not mutated.

The tests should assert exact blocker codes for the important branches so later UI copy does not have to infer causes from free text.

## Task 2 - GREEN Helper Implementation

Implement `dashboard/lib/grid/gridEpochContext.ts` as a pure deterministic helper.

Implementation constraints:

- no file reads;
- no runtime writes;
- no network calls;
- no API calls;
- no exchange calls;
- no order, broker, runner, execution, or activation imports;
- no mutation of input objects;
- no fallback to old grid bounds as candidate geometry.

Suggested public API:

```ts
export function buildGridEpochContext(input: GridEpochContextInput): GridEpochContextV1;
```

Input should include only already-loaded diagnostic values:

- old epoch state: old exposure presence, old bounds if available, old closed-cycle evidence, old data-quality blockers;
- current market state: price, ATR, BBW, ADX or directional-strength signal, current regime, freshness status;
- candidate review parameters: current candidate bounds or enough current data to compute bounds through existing grid helper logic;
- cost gate: `gridSpacingPct`, `requiredMinSpacingPct`, spread/slippage/fee/funding assumptions when available.

The helper may use existing pure grid helpers if they do not import execution paths. Any imported helper must be verified as pure.

## Task 3 - Paper Diagnostics Additive Field

Expose:

```ts
paperLoopDiagnostics.gridEpochContext
```

Rules:

- additive field only;
- do not feed it into runner, strategy selection, approval, activation, or order paths;
- do not change existing paper-loop state transitions;
- do not change how `closedCycles`, `sellFillCount`, or old exposure are counted;
- preserve existing dynamic regrid diagnostics and add the epoch context beside them.

The paper diagnostics layer should assemble inputs from already-available diagnostics only. It must not read files directly for this field.

## Task 4 - Agent HQ Adapter and View-Model

Add defensive mapping in:

- `dashboard/lib/trading-agent-hq/adapter.ts`
- `dashboard/lib/trading-agent-hq/viewModel.ts`

Mapping requirements:

- unknown or missing raw data maps to safe review-only defaults;
- all activation flags remain false;
- stale or blocked data is represented as diagnostic state, not as permission;
- old epoch status, current eligibility, current regime, candidate spacing, cost gate, and next action are available to the UI;
- adapter tests cover absent raw field, blocked raw field, and candidate-ready raw field.

The compact operator summary should use Thai-first copy while preserving useful English handles such as `Grid`, `Review`, `Candidate`, and `Cost gate`.

## Task 5 - Existing Grid / Paper UI Section Only

Surface the diagnostic in the existing Grid / Paper section. Do not add a new card unless the existing section cannot present the rows without crowding or ambiguity.

Rows to show:

- old epoch status;
- old epoch policy;
- current grid eligibility;
- current regime;
- candidate spacing;
- cost gate status;
- next action.

UI constraints:

- no buttons;
- no arm controls;
- no order controls;
- no approval controls;
- no activation controls;
- no copy that implies trade readiness.

Operator copy should keep these ideas separate:

- old epoch audit;
- current regime eligibility;
- fresh candidate review;
- paper/live execution permission.

## Task 6 - Validation

Run implementation validation from `dashboard` because the requested test paths are `lib/...` paths:

```powershell
cd dashboard
node --test --experimental-strip-types lib/grid/gridEpochContext.test.ts
node --test --experimental-strip-types lib/paper/paperLoopDiagnostics.test.ts
node --test --experimental-strip-types lib/trading-agent-hq/adapter.test.ts
npx tsc --noEmit --incremental false
npm run build
```

Safety audit:

- scan staged files for order, broker, runner, execution, activation, approval, API route, env, secret, and config changes;
- confirm no runtime JSON or JSONL files are staged;
- confirm no generated replay pack is staged;
- confirm D8.5 remains untracked or unstaged;
- confirm continuation branch remains untouched;
- confirm `git diff --cached --check` passes.

## Task 7 - Safety Audit and Explicit Staging

Never use `git add .`.

When implementation is later approved, stage only the exact files required by that implementation. The expected future staged set should be limited to helper, focused tests, paper diagnostic additive wiring, Agent HQ adapter/view-model mapping, and the minimum existing Grid / Paper UI surface if needed.

Forbidden staged paths:

- D8.5 spec or implementation;
- runtime/generated files;
- replay packs;
- `.env`;
- secrets;
- `config/db.php`;
- runner, broker, execution, order, or API route files;
- scheduler or service files;
- unrelated dirty/untracked files.

## How Old Epoch Is Separated from Current Grid Eligibility

Old epoch status is used only for audit and warnings. It sets policy literals:

- `DO_NOT_FORCE_SELL`;
- `DO_NOT_COUNT_AS_EDGE`;
- `DO_NOT_USE_FOR_NEW_GRID_RANGE`;
- `KEEP_FOR_AUDIT_ONLY`.

Current grid eligibility is evaluated from current regime, current price, current volatility and trend context, current cost gate, and current freshness. An old `QUARANTINED` or `OBSOLETE_MARKET_CHANGED` epoch can remain visible while current grid eligibility is still evaluated independently.

The implementation must explicitly assert that candidate bounds never equal old bounds because of old-bound reuse. If current data independently produces similar numbers, the helper should still record the source as current candidate geometry, not old epoch geometry.

## How Fresh Grid Candidate Review Is Calculated

The candidate review should use current-only inputs:

- current price;
- current ATR or equivalent range width input;
- current BBW or oscillation-width signal;
- current ADX or directional-strength signal;
- current canonical regime;
- current `gridSpacingPct`;
- current required cost spacing;
- current spread/slippage/fee/funding assumptions where available;
- current source freshness.

Candidate review result:

- `CANDIDATE_REVIEW_READY` only when regime, volatility, spacing, cost, and freshness pass;
- `REGIME_BLOCKED` for trend-primary conditions;
- `VOLATILITY_BLOCKED` for unsuitable expansion or insufficient oscillation;
- `COST_GATE_BLOCKED` for spacing or cost failure;
- `DATA_QUALITY_BLOCKED` for missing, stale, non-finite, or contradictory inputs;
- `NO_CANDIDATE` when evaluation is intentionally not attempted.

No result allows execution.

## This Plan-Only Validation

For this G1 plan-only task:

- create only `docs/superpowers/plans/2026-06-28-g1-grid-epoch-context-fresh-candidate-review-implementation-plan.md`;
- do not implement `gridEpochContext.ts`;
- do not implement tests;
- do not change UI;
- do not change paper diagnostics;
- do not stage, commit, or push.
