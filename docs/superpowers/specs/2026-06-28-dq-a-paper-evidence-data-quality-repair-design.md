# DQ-A Paper Evidence Data Quality Repair Design

Status: Design only.

## Purpose

Collected paper and no-trade evidence currently cannot raise review readiness when the evidence stream is present but incomplete, ambiguous, or mixed with freshness warnings. DQ-A defines the data quality repairs needed before paper evidence can be trusted as review input.

This design does not change strategy behavior. It only defines how future diagnostics should make missing or unusable evidence visible.

## Problem Statement

Review readiness cannot improve if paper evidence cannot prove:

- whether filled orders had a usable `averageFillPrice`;
- whether BUY and SELL fills form a visible closed cycle;
- what `gridSpacingPct` was in force when the decision was made;
- what mode, regime, and session the evidence belongs to;
- why a no-trade decision happened;
- whether a stale `latest_decision.json` warning is a freshness problem rather than a strategy failure.

Missing data must be reported as data quality debt. It must not be interpreted as a failed strategy result, a profitable result, or permission to activate paper/live trading.

## Non-Goals

- no paper activation;
- no live activation;
- no broker/order placement;
- no forced SELL;
- no strategy parameter change;
- no D8.5 implementation;
- no continuation branch implementation;
- no API route, runner, broker, execution, order, env, secret, or config change.

## Evidence Quality Model

Future diagnostics should expose a read-only object:

```ts
type PaperEvidenceDataQualityStatus =
  | "NO_EVIDENCE"
  | "EVIDENCE_PRESENT_BUT_INCOMPLETE"
  | "DATA_QUALITY_BLOCKED"
  | "READY_FOR_REVIEW_INPUT";

type PaperEvidenceDataQualityV1 = {
  source: "PAPER_EVIDENCE_DATA_QUALITY_V1";
  status: PaperEvidenceDataQualityStatus;
  blockers: string[];
  warnings: string[];
  averageFillPrice: {
    status: "NO_FILLS" | "AVAILABLE" | "MISSING_ON_FILLED_ORDER" | "NON_FINITE";
    filledOrderCount: number;
    missingAverageFillPriceCount: number;
  };
  closedCyclePairing: {
    status:
      | "NO_FILLS"
      | "OPEN_BUY_ONLY"
      | "PAIRABLE_BUY_SELL"
      | "CLOSED_CYCLE_CONFIRMED"
      | "PAIRING_AMBIGUOUS";
    closedCycles: number;
    openBuyCount: number;
    sellFillCount: number;
    ambiguousPairCount: number;
  };
  gridSpacingPct: {
    status: "AVAILABLE" | "MISSING" | "NON_FINITE" | "MISMATCHED";
    observedValue: number | null;
  };
  tags: {
    status: "COMPLETE" | "PARTIAL" | "MISSING";
    mode: string | null;
    regime: string | null;
    session: string | null;
    sourceRunId: string | null;
  };
  noTradeReasonCoverage: {
    status: "COMPLETE" | "PARTIAL" | "MISSING";
    noTradeDecisionCount: number;
    reasonedNoTradeCount: number;
    unknownReasonCount: number;
    coveragePct: number | null;
  };
  latestDecisionFreshness: {
    status: "FRESH" | "STALE" | "MISSING" | "UNKNOWN";
    ageMs: number | null;
    warning: string | null;
  };
  activationAllowed: false;
  paperActivationAllowed: false;
  liveActivationAllowed: false;
  reviewOnly: true;
  shadowOnly: true;
};
```

## averageFillPrice Availability

Filled paper orders must carry a finite `averageFillPrice` before they can support review evidence. A missing fill price is a data quality blocker because profit, loss, and closed-cycle reasoning cannot be reconstructed safely.

Rules:

- `NO_FILLS` means no filled order exists and must not be treated as a missing price error.
- `AVAILABLE` requires every filled order used in evidence to have finite `averageFillPrice`.
- `MISSING_ON_FILLED_ORDER` blocks readiness when a filled order has null or absent `averageFillPrice`.
- `NON_FINITE` blocks readiness when a filled order has `NaN`, `Infinity`, or a non-numeric value.
- The system must not infer fill price from current price, candle close, mark price, or public cache.

Operator copy should say: "มี fill แล้ว แต่ไม่มี averageFillPrice ที่ใช้ตรวจทานได้" for missing filled-order prices.

## Closed Cycle Pairing Visibility

Closed cycles must be visible as paired paper evidence, not inferred from aggregate counters alone. Readiness needs to know whether a BUY was later paired with a SELL and whether the cycle can be audited.

Pairing states:

- `NO_FILLS`: no paper fills exist.
- `OPEN_BUY_ONLY`: BUY fill exists without a paired SELL.
- `PAIRABLE_BUY_SELL`: BUY and SELL fills exist but final cycle evidence is not yet confirmed.
- `CLOSED_CYCLE_CONFIRMED`: an auditable cycle pair exists.
- `PAIRING_AMBIGUOUS`: multiple fills cannot be paired deterministically.

Rules:

- `closedCycles` alone is not enough unless the paired fill references or deterministic pairing evidence are visible.
- `sellFillCount` must be reported separately from `closedCycles`.
- Ambiguous pairing blocks review readiness but must not trigger a forced SELL.
- Open exposure should be described as open evidence, not as failed evidence.

## gridSpacingPct Logging

Every paper/no-trade evidence row that depends on grid logic should include the `gridSpacingPct` used by that decision. Missing spacing makes the decision hard to reproduce and should be marked as data quality debt.

Rules:

- Record the numeric spacing used at decision time.
- Preserve the original source label when available, such as configured grid, dynamic grid, or cost gate.
- Treat missing spacing as `MISSING`, not as a failed grid.
- Treat non-finite spacing as `NON_FINITE`.
- Treat conflicting spacing values across the same decision timestamp as `MISMATCHED`.

Operator copy should separate "grid spacing not logged" from "grid failed".

## Mode, Regime, and Session Tags

Evidence must carry enough context to segment review results. DQ-A should require:

- mode tag, such as `PAPER`, `SHADOW`, `NO_TRADE`, or local replay mode;
- strategy or evaluator mode, such as grid, trend, or review-only;
- regime tag, such as range, trend up, trend down, volatility expansion, event risk, or no-trade;
- session tag, such as Asia, London, New York, or unknown;
- source run or journal identity when available.

Missing tags reduce review readiness because the same behavior cannot be compared across regimes or sessions.

## No-Trade Reason Coverage

No-trade decisions must include both a normalized reason and enough raw detail for audit.

Recommended normalized reasons:

- `PRICE_ABOVE_LONG_TRIGGER`;
- `PRICE_BELOW_GRID_LOWER`;
- `PRICE_OUTSIDE_GRID`;
- `REGRID_REQUIRED`;
- `RISK_OR_COST_GATE_BLOCKED`;
- `REGIME_BLOCKED`;
- `WAITING_FOR_TRIGGER_PRICE`;
- `NO_REPLAY_DATA`;
- `STALE_INPUT`;
- `UNKNOWN_REASON`.

Rules:

- Every no-trade decision should contribute to `noTradeDecisionCount`.
- Decisions with a mapped reason contribute to `reasonedNoTradeCount`.
- Decisions without a mapped reason contribute to `unknownReasonCount`.
- Coverage should be reported as a percentage only when the denominator is greater than zero.
- `UNKNOWN_REASON` is a data quality issue, not a strategy outcome.

## Stale latest_decision Warning Separation

Stale `latest_decision.json` is a freshness warning. It must not be mixed into paper strategy outcomes or no-trade reason coverage.

Rules:

- Track `latestDecisionFreshness.status` separately from paper evidence status.
- A stale latest decision may block readiness when it is the only decision source.
- A stale latest decision must not overwrite journal evidence that has its own timestamps.
- Staleness should be shown as "market data freshness warning", not "diagnostic failed".
- The UI copy must keep these meanings separate:
  - market data available;
  - diagnostic passed;
  - candidate generated;
  - paper/live execution allowed.

## Readiness Classification

`NO_EVIDENCE`:

- no relevant paper or no-trade evidence is available.

`EVIDENCE_PRESENT_BUT_INCOMPLETE`:

- some evidence exists, but one or more required fields are missing.

`DATA_QUALITY_BLOCKED`:

- contradictory, non-finite, unpairable, or stale-only evidence prevents safe review.

`READY_FOR_REVIEW_INPUT`:

- evidence has finite fill prices where fills exist;
- closed-cycle pairing is visible when cycles are claimed;
- `gridSpacingPct` is available where grid decisions depend on it;
- mode, regime, and session tags are complete enough for segmentation;
- no-trade reason coverage is complete enough to audit;
- freshness warnings are separated from strategy outcomes.

`READY_FOR_REVIEW_INPUT` is not activation approval and does not claim edge.

## Future Implementation Surface

The future implementation should be additive and read-only:

1. Extend paper diagnostics with `PaperEvidenceDataQualityV1`.
2. Add focused tests for missing fill price, ambiguous cycle pairing, missing grid spacing, missing tags, unknown no-trade reason, and stale latest decision separation.
3. Surface the diagnostic in Agent HQ as review readiness evidence.
4. Keep all activation flags false.

No scheduler, service, route, server writeback, replay execution, paper activation, or live activation should be introduced by DQ-A.

## Validation Expectations

For this design-only step:

- no code changes;
- no test changes;
- no runtime JSON or JSONL files;
- no env, secret, or config changes;
- no runner, broker, execution, order, or API changes;
- no D8.5 file staging;
- no continuation branch;
- no stage, commit, or push.
