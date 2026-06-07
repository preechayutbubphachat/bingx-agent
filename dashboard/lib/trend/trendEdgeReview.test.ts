// dashboard/lib/trend/trendEdgeReview.test.ts
// Run: node --experimental-strip-types --test dashboard/lib/trend/trendEdgeReview.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { evaluateTrendEdgeReview, type TrendClosedTradeInput } from "./trendEdgeReview.ts";

function mk(over: Partial<TrendClosedTradeInput> = {}): TrendClosedTradeInput {
  return { rMultiple: 1, netRMultiple: 0.9, ...over };
}

test("null closedTrades → NO_DATA, HOLD, activation false", () => {
  const r = evaluateTrendEdgeReview({ closedTrades: null });
  assert.equal(r.status, "NO_DATA");
  assert.equal(r.decision, "HOLD");
  assert.equal(r.trendClosedTrades, 0);
  assert.equal(r.netExpectancyAfterCosts, null);
  assert.equal(r.paperActivationAllowed, false);
  assert.equal(r.liveActivationAllowed, false);
});

test("journalExists=false → NO_DATA even with array", () => {
  const r = evaluateTrendEdgeReview({ closedTrades: [mk()], journalExists: false });
  assert.equal(r.status, "NO_DATA");
});

test("empty array (present journal) → INSUFFICIENT_DATA, HOLD", () => {
  const r = evaluateTrendEdgeReview({ closedTrades: [] });
  assert.equal(r.status, "INSUFFICIENT_DATA");
  assert.equal(r.decision, "HOLD");
  assert.equal(r.sampleTier, "none");
});

test("expected current runtime: closedTrades=[] yields INSUFFICIENT_DATA + null expectancy", () => {
  const r = evaluateTrendEdgeReview({ closedTrades: [] });
  assert.equal(r.trendClosedTrades, 0);
  assert.equal(r.expectancyR, null);
  assert.equal(r.netExpectancyAfterCosts, null);
});

test("early sample <10 → EARLY_SAMPLE, HOLD", () => {
  const trades = Array.from({ length: 5 }, () => mk({ rMultiple: 1, netRMultiple: 0.9 }));
  const r = evaluateTrendEdgeReview({ closedTrades: trades });
  assert.equal(r.status, "EARLY_SAMPLE");
  assert.equal(r.sampleTier, "early");
  assert.equal(r.decision, "HOLD");
  assert.equal(r.trendClosedTrades, 5);
});

test("usable sample 10-19 → USABLE_SAMPLE, HOLD", () => {
  const trades = Array.from({ length: 12 }, () => mk());
  const r = evaluateTrendEdgeReview({ closedTrades: trades });
  assert.equal(r.status, "USABLE_SAMPLE");
  assert.equal(r.decision, "HOLD");
});

test("review sample 20-29 net>0 → REVIEW_SAMPLE, CONTINUE_PAPER", () => {
  const trades = Array.from({ length: 22 }, (_, i) => mk({ rMultiple: i % 2 === 0 ? 2 : -1, netRMultiple: i % 2 === 0 ? 1.8 : -1 }));
  const r = evaluateTrendEdgeReview({ closedTrades: trades });
  assert.equal(r.status, "REVIEW_SAMPLE");
  assert.ok((r.netExpectancyAfterCosts ?? 0) > 0);
  assert.equal(r.decision, "CONTINUE_PAPER");
});

test("review sample net<=0 → PARAMETER_REVIEW", () => {
  const trades = Array.from({ length: 22 }, () => mk({ rMultiple: -1, netRMultiple: -1 }));
  const r = evaluateTrendEdgeReview({ closedTrades: trades });
  assert.equal(r.status, "REVIEW_SAMPLE");
  assert.equal(r.decision, "PARAMETER_REVIEW");
});

test("production candidate net<=0 → PAUSE_STRATEGY", () => {
  const trades = Array.from({ length: 35 }, () => mk({ rMultiple: -1, netRMultiple: -1 }));
  const r = evaluateTrendEdgeReview({ closedTrades: trades });
  assert.equal(r.status, "PRODUCTION_CANDIDATE_REVIEW");
  assert.equal(r.decision, "PAUSE_STRATEGY");
});

test("production candidate strong edge → READY_FOR_LIMITED_CANARY_REVIEW", () => {
  // 60% winners +2R, 40% losers -1R → strong positive net expectancy, small drawdown
  const trades = Array.from({ length: 40 }, (_, i) => (i % 5 < 3 ? mk({ rMultiple: 2, netRMultiple: 1.9 }) : mk({ rMultiple: -1, netRMultiple: -1 })));
  const r = evaluateTrendEdgeReview({ closedTrades: trades });
  assert.equal(r.status, "PRODUCTION_CANDIDATE_REVIEW");
  assert.equal(r.decision, "READY_FOR_LIMITED_CANARY_REVIEW");
  assert.equal(r.liveActivationAllowed, false);
  assert.equal(r.unlocksLive, false);
  assert.equal(r.unlocksGrid, false);
});

test("metrics: winRate, costDrag, profitFactor, maxConsecutiveLosses computed", () => {
  const trades = [
    mk({ rMultiple: 2, netRMultiple: 1.8 }),
    mk({ rMultiple: -1, netRMultiple: -1 }),
    mk({ rMultiple: -1, netRMultiple: -1 }),
    mk({ rMultiple: 1, netRMultiple: 0.8 }),
  ];
  const r = evaluateTrendEdgeReview({ closedTrades: trades });
  assert.equal(r.winRate, 0.5);
  assert.ok(r.costDrag != null && r.costDrag > 0); // gross > net due to costs
  assert.ok(r.profitFactor != null && r.profitFactor > 0);
  assert.equal(r.maxConsecutiveLosses, 2);
  assert.ok(r.maxDrawdownR != null && r.maxDrawdownR >= 0);
});

test("attribution + failure taxonomy aggregated by net R", () => {
  const trades = [
    mk({ rMultiple: 2, netRMultiple: 1.8, regime: "DOWNTREND", session: "NY", confirmationType: "close_back" }),
    mk({ rMultiple: -1, netRMultiple: -1, regime: "DOWNTREND", session: "Asia", failureLabel: "failed_confirmation" }),
  ];
  const r = evaluateTrendEdgeReview({ closedTrades: trades });
  assert.equal(r.attribution.byRegime["DOWNTREND"].count, 2);
  assert.equal(r.attribution.bySession["NY"].count, 1);
  assert.equal(r.failureTaxonomy["failed_confirmation"], 1);
});

test("profitFactor null when no losses (undefined denominator)", () => {
  const trades = Array.from({ length: 22 }, () => mk({ rMultiple: 1, netRMultiple: 1 }));
  const r = evaluateTrendEdgeReview({ closedTrades: trades });
  assert.equal(r.profitFactor, null);
});

test("riskOfRuinEstimate null below 30 trades", () => {
  const trades = Array.from({ length: 22 }, () => mk({ rMultiple: 1, netRMultiple: 0.9 }));
  const r = evaluateTrendEdgeReview({ closedTrades: trades });
  assert.equal(r.riskOfRuinEstimate, null);
});

test("always-false safety flags on every status", () => {
  for (const tc of [null, [] as TrendClosedTradeInput[], [mk()], Array.from({ length: 40 }, () => mk())]) {
    const r = evaluateTrendEdgeReview({ closedTrades: tc });
    assert.equal(r.paperActivationAllowed, false);
    assert.equal(r.liveActivationAllowed, false);
    assert.equal(r.oldExposurePolicy, "QUARANTINE_OLD_GRID_EXPOSURE");
  }
});
