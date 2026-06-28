# DQ-A Paper Evidence Data Quality Repair Implementation Plan

Status: plan only.

Roadmap gate moved: DQ-A.

## Purpose

DQ-A makes collected paper and no-trade evidence measurable enough for review readiness. It does not change strategy behavior, does not activate paper/live trading, and does not infer edge.

The implementation must separate data quality debt from strategy outcomes. Missing `averageFillPrice`, missing closed-cycle visibility, absent `gridSpacingPct`, missing segmentation tags, incomplete no-trade reasons, and stale `latest_decision.json` are evidence quality findings, not trading conclusions.

## Source Inputs

- Master roadmap: `docs/superpowers/MASTER_AUTONOMOUS_BOT_ROADMAP.md`
- DQ-A design: `docs/superpowers/specs/2026-06-28-dq-a-paper-evidence-data-quality-repair-design.md`
- Existing additive diagnostic path: `PaperLoopDiagnostics` to Trading Agent HQ Grid/Paper display

## Non-Goals and Safety Locks

- Do not activate paper or live trading.
- Do not place, cancel, force, or close orders.
- Do not force SELL.
- Do not close old exposure.
- Do not change strategy selection or execution behavior.
- Do not feed DQ-A output into runner, broker, approval, activation, or order placement.
- Do not add API routes, schedulers, services, sync jobs, or server writeback.
- Do not read or write `.env`, secrets, private keys, or `config/db.php`.
- Do not implement D8.5.
- Do not implement the continuation branch.
- Do not generate or commit replay packs or runtime JSON/JSONL.
- Do not use `git add .`.

All outputs must force:

```ts
activationAllowed: false;
paperActivationAllowed: false;
liveActivationAllowed: false;
reviewOnly: true;
shadowOnly: true;
```

## Implementation File Map

Primary future files:

- `dashboard/lib/paper/paperEvidenceDataQuality.ts`
- `dashboard/lib/paper/paperEvidenceDataQuality.test.ts`

Allowed additive integration files only if required:

- `dashboard/lib/paper/paperLoopDiagnostics.ts`
- `dashboard/lib/paper/paperLoopDiagnostics.test.ts`
- `dashboard/lib/trading-agent-hq/adapter.ts`
- `dashboard/lib/trading-agent-hq/adapter.test.ts`
- `dashboard/lib/trading-agent-hq/viewModel.ts`
- Existing Grid/Paper Agent HQ UI component only

Forbidden implementation surfaces:

- runner, broker, execution, order, approval, and API route paths
- env, secrets, private key, and config files
- replay pack generation paths
- scheduler, service, or writeback paths

## Output Contract

Create a pure read-only helper that returns `PaperEvidenceDataQualityV1`.

```ts
type PaperEvidenceDataQualityStatus =
  | "NO_DATA"
  | "INSUFFICIENT"
  | "PARTIAL"
  | "REVIEW_READY";

type PaperEvidenceDataQualityV1 = {
  schemaVersion: 1;
  source: "PAPER_EVIDENCE_DATA_QUALITY_V1";
  status: PaperEvidenceDataQualityStatus;
  blockers: string[];
  warnings: string[];
  missingEvidenceFields: string[];
  averageFillPrice: {
    status: "NO_FILLS" | "AVAILABLE" | "MISSING_ON_FILLED_ORDER" | "NON_FINITE";
    filledOrderCount: number;
    missingAverageFillPriceCount: number;
  };
  closedCyclePairing: {
    status: "NO_FILLS" | "OPEN_BUY_ONLY" | "PAIRING_VISIBLE" | "AMBIGUOUS" | "OLD_EPOCH_AUDIT_ONLY";
    buyFillCount: number;
    sellFillCount: number;
    closedCycleCount: number;
    oldEpochExposureCount: number;
  };
  gridSpacingPct: {
    status: "AVAILABLE" | "MISSING" | "NON_FINITE" | "MISMATCHED";
    observedValue: number | null;
    costGateMeasurable: boolean;
  };
  tags: {
    status: "COMPLETE" | "PARTIAL" | "MISSING";
    mode: string | null;
    regime: string | null;
    session: string | null;
    sourceRunId: string | null;
  };
  noTradeReasonCoverage: {
    status: "NO_NO_TRADE_DATA" | "COMPLETE" | "PARTIAL" | "MISSING";
    noTradeDecisionCount: number;
    reasonedNoTradeCount: number;
    unknownReasonCount: number;
    normalizedReasonBuckets: string[];
  };
  latestDecisionFreshness: {
    status: "NO_LATEST_DECISION" | "FRESH" | "STALE" | "UNKNOWN";
    warningOnly: boolean;
  };
  nextAction: string;
  activationAllowed: false;
  paperActivationAllowed: false;
  liveActivationAllowed: false;
  reviewOnly: true;
  shadowOnly: true;
};
```

## Data Quality States

`NO_DATA`:

- no relevant paper fill or no-trade evidence exists;
- no strategy failure is inferred;
- next action should request evidence collection or mirror/download repair.

`INSUFFICIENT`:

- evidence exists but key fields are missing or non-finite;
- examples include filled orders without `averageFillPrice`, missing `gridSpacingPct`, missing tags, or unknown no-trade reasons;
- readiness cannot improve, but this is still data quality debt.

`PARTIAL`:

- enough evidence exists for limited review visibility;
- at least one review dimension remains blocked, incomplete, ambiguous, or freshness-limited;
- no edge claim is allowed.

`REVIEW_READY`:

- all required evidence fields are present for review input;
- closed-cycle evidence is visible when cycles are claimed;
- `gridSpacingPct` and cost gate measurability are available;
- no-trade reason coverage is sufficient;
- freshness warnings are separated from strategy outcomes;
- this is not activation approval.

## Task 1: RED Tests for Helper

Create failing tests before implementation for:

1. no fills and no no-trade evidence returns `NO_DATA` or `INSUFFICIENT` without strategy failure;
2. filled order without finite `averageFillPrice` returns `INSUFFICIENT`;
3. BUY without SELL has no closed cycle and is not edge evidence;
4. BUY to SELL pair makes closed-cycle visibility available;
5. missing `gridSpacingPct` makes cost gate not measurable;
6. missing mode, regime, or session tags blocks segmentation;
7. missing or unmapped no-trade reasons blocks reason coverage;
8. stale `latest_decision.json` is a freshness warning only;
9. quarantined old epoch exposure is audit-only and not edge evidence;
10. safety flags remain review-only and false;
11. helper is pure and does not mutate input.

## Task 2: GREEN Helper Implementation

Implement `dashboard/lib/paper/paperEvidenceDataQuality.ts` as a pure deterministic helper.

Required properties:

- no filesystem IO;
- no network calls;
- no server reads or writes;
- no current price inference for fill price;
- no public cache as source of truth;
- no mutation of input objects;
- no activation, order, runner, broker, execution, approval, or API dependency.

The helper should accept already-loaded diagnostic or journal-derived evidence objects and return the output contract defensively.

## Task 3: averageFillPrice Availability

Classify fill-price evidence as:

- `NO_FILLS` when no filled order exists;
- `AVAILABLE` only when every filled order used for evidence has finite `averageFillPrice`;
- `MISSING_ON_FILLED_ORDER` when a filled order has null or absent `averageFillPrice`;
- `NON_FINITE` when a filled order has a non-finite value.

Do not infer or backfill fill price from current price, mark price, candle close, grid midpoint, or public cache.

## Task 4: Closed Cycle Pairing Visibility

Pairing must be review-only evidence:

- BUY followed by SELL can count as visible closed-cycle evidence;
- BUY without SELL is open evidence, not failed evidence;
- aggregate `sellFillCount` must stay separate from `closedCycleCount`;
- ambiguous pairing blocks review readiness without forcing SELL;
- old quarantined grid epoch exposure is audit-only and must not count as edge evidence.

G1 remains the source of epoch separation: old grid epoch cannot block current grid eligibility and cannot contaminate current edge evidence.

## Task 5: gridSpacingPct and Cost Gate Measurability

Every grid-dependent evidence row should expose the `gridSpacingPct` used when the decision was made.

Rules:

- missing `gridSpacingPct` is data quality debt, not strategy failure;
- non-finite spacing blocks cost-gate measurability;
- mismatched spacing across rows should be reported as a blocker or warning, depending on evidence scope;
- `costGateMeasurable` is true only when spacing is finite and attributable to the decision under review.

## Task 6: Mode, Regime, and Session Tags

Evidence must carry enough context to segment later review.

Required tag groups:

- mode, such as `PAPER`, `SHADOW`, `NO_TRADE`, or local replay mode;
- evaluator or strategy mode, such as grid, trend, or review-only;
- regime, such as range, uptrend, downtrend, volatility expansion, event risk, or no-trade;
- session, such as Asia, London, New York, or unknown;
- source run or journal identity when available.

Missing tags should use defensive display defaults only. The helper must not fabricate evidence.

## Task 7: Normalized No-Trade Reason Buckets

Normalize no-trade reasons into the approved buckets:

- `data_missing`
- `regime_unclear`
- `spread_too_high`
- `slippage_too_high`
- `funding_risk`
- `news_risk`
- `volatility_extreme`
- `runtime_audit_critical`
- `cost_exceeds_edge`
- `price_below_grid_lower`
- `price_above_grid_upper`
- `paper_edge_unproven`
- `grid_epoch_audit_only`
- `current_grid_data_quality_blocked`
- `trend_no_aligned_setup`

Coverage rules:

- every no-trade decision contributes to `noTradeDecisionCount`;
- mapped reasons contribute to `reasonedNoTradeCount`;
- unmapped or absent reasons contribute to `unknownReasonCount`;
- coverage percentage is displayable only when the denominator is greater than zero.

## Task 8: latest_decision Freshness Separation

Stale `latest_decision.json` is a market data freshness warning, not a paper strategy outcome.

Rules:

- track `latestDecisionFreshness.status` separately;
- stale latest decision may block readiness only when it is the only available decision source;
- stale latest decision must not overwrite journal evidence that has its own timestamps;
- Agent HQ copy should separate market data available, diagnostic passed, candidate generated, and paper/live execution allowed.

## Task 9: Additive Paper Diagnostics Integration

Expose the helper additively as:

```ts
paperLoopDiagnostics.paperEvidenceDataQuality
```

Do not feed this object into:

- runner;
- strategy selection;
- approval;
- activation;
- order placement;
- broker or execution paths;
- API routes.

If existing diagnostic inputs are incomplete, the integration should degrade to `NO_DATA` or `INSUFFICIENT` rather than invent fields.

## Task 10: Agent HQ Visibility

Map defensively into the existing Grid/Paper section only.

Compact rows:

- paper evidence quality state;
- missing evidence fields;
- closed-cycle visibility;
- cost gate measurability;
- no-trade reason coverage;
- freshness warning;
- next action.

No new buttons, arm controls, order controls, approval controls, activation controls, upload controls, or replay controls.

## Task 11: Validation Commands

Run from `dashboard` during implementation:

```powershell
node --test --experimental-strip-types lib/paper/paperEvidenceDataQuality.test.ts
node --test --experimental-strip-types lib/paper/paperLoopDiagnostics.test.ts
node --test --experimental-strip-types lib/trading-agent-hq/adapter.test.ts
npx tsc --noEmit --incremental false
npm run build
```

Expected result:

- focused helper tests pass;
- paper diagnostics tests pass;
- Agent HQ adapter tests pass;
- dashboard TypeScript check passes;
- dashboard production build passes.

## Task 12: Safety Audit and Git Hygiene

Before any future release:

- run `git status --short`;
- run `git diff --name-only`;
- run `git diff --check`;
- scan for unfinished planning markers and draft filler text;
- scan for trailing whitespace;
- scan for `.env`, secrets, private keys, and `config/db.php`;
- scan for order, execution, broker, runner, approval, and API route changes;
- confirm no generated replay pack;
- confirm no runtime JSON/JSONL;
- confirm D8.5 remains HOLD;
- confirm continuation branch remains untouched;
- stage only explicitly approved files;
- never use `git add .`.

## L7 Readiness Relationship

DQ-A prepares paper evidence for later replay and decision review by making evidence quality observable. It does not run replay and does not claim edge.

After DQ-A implementation, L7 can use clearer evidence quality signals to decide whether local one-shot replay and paper review are blocked by missing data, insufficient history, stale inputs, or actual replay findings.

## Acceptance for This Plan-Only Task

- Only this plan document is created.
- No code or test implementation is added.
- No runtime, env, config, order, execution, API, scheduler, or service files are changed.
- No replay pack is generated.
- No files are staged.
- No commit or push is performed.
