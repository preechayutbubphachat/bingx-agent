// dashboard/lib/trend/trendEvidenceMetrics.test.ts
// Pure unit coverage for T-3H-2 closed-trade evidence metrics.
import test from "node:test";
import assert from "node:assert/strict";
import { buildTrendEvidenceMetrics, classifyTrendEvidenceSample } from "./trendEvidenceMetrics.ts";
import type { TrendClosedTradeInput } from "./trendEdgeReview.ts";

function trade(over: Partial<TrendClosedTradeInput> = {}): TrendClosedTradeInput {
  return {
    rMultiple: 1,
    netRMultiple: 0.9,
    feeCost: 0,
    slippageCost: 0,
    fundingCost: 0,
    holdTimeMinutes: 30,
    direction: "SHORT",
    exitReason: "TAKE_PROFIT",
    ...over,
  };
}

test("sample status gates do not classify edge before 30 closed trades", () => {
  assert.equal(classifyTrendEvidenceSample(0), "INSUFFICIENT_SAMPLE_BOOTSTRAP");
  assert.equal(classifyTrendEvidenceSample(5), "BEHAVIOR_CHECK_ONLY");
  assert.equal(classifyTrendEvidenceSample(10), "EARLY_SIGNAL_ONLY");
  assert.equal(classifyTrendEvidenceSample(30), "FIRST_STATISTICAL_READ");
  assert.equal(classifyTrendEvidenceSample(100), "USABLE_EVIDENCE");
});

test("empty metrics are paper-safe and inconclusive", () => {
  const metrics = buildTrendEvidenceMetrics([]);
  assert.equal(metrics.trendClosedTrades, 0);
  assert.equal(metrics.winRate, null);
  assert.equal(metrics.expectancyR, null);
  assert.equal(metrics.netExpectancyAfterCosts, null);
  assert.equal(metrics.paperOnly, true);
  assert.equal(metrics.liveActivationAllowed, false);
  assert.equal(metrics.exchangeOrderAllowed, false);
  assert.equal(metrics.sampleStatus, "INSUFFICIENT_SAMPLE_BOOTSTRAP");
});

test("metrics aggregate win rate, expectancy, drawdown, hold time, direction, and exit reason", () => {
  const metrics = buildTrendEvidenceMetrics([
    trade({ rMultiple: 1.2, netRMultiple: 1.0, holdTimeMinutes: 20, direction: "SHORT", exitReason: "TAKE_PROFIT" }),
    trade({ rMultiple: -1, netRMultiple: -1.1, holdTimeMinutes: 40, direction: "SHORT", exitReason: "STOP_LOSS" }),
    trade({ rMultiple: 0, netRMultiple: 0, holdTimeMinutes: 60, direction: "LONG", exitReason: "BREAKEVEN" }),
  ]);

  assert.equal(metrics.trendClosedTrades, 3);
  assert.equal(metrics.wins, 1);
  assert.equal(metrics.losses, 1);
  assert.equal(metrics.breakeven, 1);
  assert.equal(metrics.winRate, 1 / 3);
  assert.equal(metrics.avgWinR, 1);
  assert.equal(metrics.avgLossR, -1.1);
  assert.ok(Math.abs((metrics.expectancyR ?? 0) - (0.2 / 3)) < 1e-12);
  assert.ok(Math.abs((metrics.netExpectancyAfterCosts ?? 0) - (-0.1 / 3)) < 1e-12);
  assert.equal(metrics.maxDrawdownR, 1.1);
  assert.equal(metrics.maxConsecutiveLosses, 1);
  assert.equal(metrics.averageHoldTimeMinutes, 40);
  assert.deepEqual(metrics.byDirection.SHORT, { count: 2, netRSum: -0.10000000000000009 });
  assert.deepEqual(metrics.byDirection.LONG, { count: 1, netRSum: 0 });
  assert.deepEqual(metrics.byExitReason.TAKE_PROFIT, { count: 1, netRSum: 1 });
  assert.deepEqual(metrics.byExitReason.STOP_LOSS, { count: 1, netRSum: -1.1 });
});

test("missing hold time remains null and records the MAE/MFE gap note", () => {
  const metrics = buildTrendEvidenceMetrics([trade({ holdTimeMinutes: null })]);
  assert.equal(metrics.averageHoldTimeMinutes, null);
  assert.ok(metrics.notes.some((note) => note.includes("averageHoldTimeMinutes null")));
  assert.ok(metrics.notes.some((note) => note.includes("MAE/MFE not included")));
});
