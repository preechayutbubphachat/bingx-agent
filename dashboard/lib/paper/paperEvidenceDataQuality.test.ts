import test from "node:test";
import assert from "node:assert/strict";
import {
  evaluatePaperEvidenceDataQuality,
  NORMALIZED_NO_TRADE_REASON_BUCKETS,
  type PaperEvidenceInput,
} from "./paperEvidenceDataQuality.ts";

function input(partial: Partial<PaperEvidenceInput> = {}): PaperEvidenceInput {
  return {
    events: [],
    buyFillCount: 0,
    sellFillCount: 0,
    closedCycles: 0,
    latestDecisionFreshness: "FRESH",
    oldEpochStatus: "NONE",
    ...partial,
  };
}

test("no paper events returns NO_DATA", () => {
  const result = evaluatePaperEvidenceDataQuality(input());

  assert.equal(result.qualityState, "NO_DATA");
  assert.equal(result.hasFillEvents, false);
  assert.equal(result.hasAverageFillPrice, false);
  assert.match(result.nextAction, /collect/i);
});

test("fills exist but averageFillPrice is missing returns INSUFFICIENT", () => {
  const result = evaluatePaperEvidenceDataQuality(input({
    buyFillCount: 1,
    events: [{ type: "ORDER_FILLED", side: "BUY", averageFillPrice: null }],
  }));

  assert.equal(result.qualityState, "INSUFFICIENT");
  assert.equal(result.hasFillEvents, true);
  assert.equal(result.hasAverageFillPrice, false);
  assert.ok(result.missingFields.includes("averageFillPrice"));
});

test("BUY without SELL has no closed cycle and is not edge evidence", () => {
  const result = evaluatePaperEvidenceDataQuality(input({
    buyFillCount: 1,
    sellFillCount: 0,
    events: [{ type: "ORDER_FILLED", side: "BUY", averageFillPrice: 100 }],
  }));

  assert.equal(result.hasClosedCycleVisibility, false);
  assert.ok(result.blockers.includes("open_buy_without_sell_cycle"));
  assert.doesNotMatch(result.nextAction, /edge/i);
});

test("BUY to SELL pair exposes closed cycle visibility for review only", () => {
  const result = evaluatePaperEvidenceDataQuality(input({
    buyFillCount: 1,
    sellFillCount: 1,
    closedCycles: 1,
    events: [
      { type: "ORDER_FILLED", side: "BUY", averageFillPrice: 100, gridSpacingPct: 0.5, mode: "PAPER", regime: "RANGE", session: "Asia" },
      { type: "ORDER_FILLED", side: "SELL", averageFillPrice: 101, gridSpacingPct: 0.5, mode: "PAPER", regime: "RANGE", session: "Asia" },
      { type: "NO_TRADE_DECISION", noTradeReason: "spread_too_high", gridSpacingPct: 0.5, mode: "PAPER", regime: "RANGE", session: "Asia" },
    ],
  }));

  assert.equal(result.qualityState, "REVIEW_READY");
  assert.equal(result.hasClosedCycleVisibility, true);
  assert.equal(result.activationAllowed, false);
  assert.equal(result.paperActivationAllowed, false);
  assert.equal(result.liveActivationAllowed, false);
  assert.equal(result.reviewOnly, true);
});

test("missing gridSpacingPct blocks cost gate measurability", () => {
  const result = evaluatePaperEvidenceDataQuality(input({
    buyFillCount: 1,
    sellFillCount: 1,
    closedCycles: 1,
    events: [
      { type: "ORDER_FILLED", side: "BUY", averageFillPrice: 100, mode: "PAPER", regime: "RANGE", session: "Asia" },
      { type: "ORDER_FILLED", side: "SELL", averageFillPrice: 101, mode: "PAPER", regime: "RANGE", session: "Asia" },
    ],
  }));

  assert.equal(result.hasGridSpacingPct, false);
  assert.ok(result.missingFields.includes("gridSpacingPct"));
  assert.ok(result.blockers.includes("cost_gate_not_measurable"));
});

test("missing tags block segmentation", () => {
  const result = evaluatePaperEvidenceDataQuality(input({
    events: [{ type: "NO_TRADE_DECISION", noTradeReason: "data_missing", gridSpacingPct: 0.4 }],
  }));

  assert.equal(result.hasModeTags, false);
  assert.equal(result.hasRegimeTags, false);
  assert.equal(result.hasSessionTags, false);
  assert.ok(result.blockers.includes("segmentation_tags_missing"));
});

test("missing no-trade reasons block reason coverage", () => {
  const result = evaluatePaperEvidenceDataQuality(input({
    events: [{ type: "NO_TRADE_DECISION", gridSpacingPct: 0.4, mode: "PAPER", regime: "RANGE", session: "Asia" }],
  }));

  assert.equal(result.hasNoTradeReasonCoverage, false);
  assert.ok(result.missingFields.includes("noTradeReason"));
});

test("stale latest_decision is freshness warning only", () => {
  const result = evaluatePaperEvidenceDataQuality(input({
    latestDecisionFreshness: "STALE",
    events: [{ type: "NO_TRADE_DECISION", noTradeReason: "data_missing", gridSpacingPct: 0.4, mode: "PAPER", regime: "RANGE", session: "Asia" }],
  }));

  assert.ok(result.warnings.includes("latest_decision_stale"));
  assert.doesNotMatch(result.blockers.join(" "), /latest_decision_stale/);
});

test("old epoch quarantine is audit-only and not edge evidence", () => {
  const result = evaluatePaperEvidenceDataQuality(input({
    oldEpochStatus: "QUARANTINED",
    buyFillCount: 1,
    events: [{ type: "ORDER_FILLED", side: "BUY", averageFillPrice: 100, gridSpacingPct: 0.4, mode: "PAPER", regime: "RANGE", session: "Asia" }],
  }));

  assert.ok(result.warnings.includes("old_epoch_audit_only"));
  assert.equal(result.hasClosedCycleVisibility, false);
  assert.equal(result.qualityState, "PARTIAL");
});

test("safety flags are forced false and review-only", () => {
  const result = evaluatePaperEvidenceDataQuality(input({
    events: [{ type: "NO_TRADE_DECISION", noTradeReason: "data_missing", gridSpacingPct: 0.4, mode: "PAPER", regime: "RANGE", session: "Asia" }],
  }));

  assert.equal(result.activationAllowed, false);
  assert.equal(result.paperActivationAllowed, false);
  assert.equal(result.liveActivationAllowed, false);
  assert.equal(result.reviewOnly, true);
  assert.equal(result.shadowOnly, true);
});

test("helper is pure and does not mutate input", () => {
  const source = input({
    events: [{ type: "NO_TRADE_DECISION", noTradeReason: "data_missing", gridSpacingPct: 0.4, mode: "PAPER", regime: "RANGE", session: "Asia" }],
  });
  const before = JSON.stringify(source);

  evaluatePaperEvidenceDataQuality(source);

  assert.equal(JSON.stringify(source), before);
});

test("normalizes approved no-trade buckets", () => {
  assert.ok(NORMALIZED_NO_TRADE_REASON_BUCKETS.includes("current_grid_data_quality_blocked"));
  assert.ok(NORMALIZED_NO_TRADE_REASON_BUCKETS.includes("trend_no_aligned_setup"));
});
