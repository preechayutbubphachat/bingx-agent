import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateTrendTransitionMonitor } from "./trendTransitionMonitor.ts";
import type { TrendStrategy } from "./trendStrategy.ts";

function strat(p: Partial<TrendStrategy>): TrendStrategy {
  return {
    enabled: false, phase: "T-1_SHADOW", status: "NO_TRADE", direction: "SHORT",
    setupReason: null, entryZone: [63142.35, 63453.2], currentPrice: 61847.3,
    distanceToEntryZonePct: 2.09, invalidation: 64552.38, target1: 61825.2, target2: null,
    rewardRisk: 1.2, confirmationRequired: false, confirmationStatus: "NOT_REQUIRED",
    riskStatus: "PASS", oldExposurePolicy: "QUARANTINE_OLD_GRID_EXPOSURE",
    countTowardGridClosedCycles: false, countTowardTrendEvidence: false,
    paperActivationAllowed: false, liveActivationAllowed: false, shadowOnly: true,
    reasons: [], warnings: [], ...p,
  };
}
const DOWN = { regime: "DOWNTREND" } as any;

test("NO_TRADE_NEAR_TARGET => IDLE_NO_TRADE, notify false", () => {
  const m = evaluateTrendTransitionMonitor({ trendStrategy: strat({ status: "NO_TRADE", riskStatus: "NO_TRADE_NEAR_TARGET" }), canonicalMarketRegime: DOWN });
  assert.equal(m.status, "IDLE_NO_TRADE");
  assert.equal(m.severity, "info");
  assert.equal(m.shouldNotifyOperator, false);
});

test("WATCHING_PULLBACK => notify true, severity watch", () => {
  const m = evaluateTrendTransitionMonitor({ trendStrategy: strat({ status: "WATCHING_PULLBACK", riskStatus: "PASS" }), canonicalMarketRegime: DOWN });
  assert.equal(m.status, "WATCHING_PULLBACK");
  assert.equal(m.severity, "watch");
  assert.equal(m.shouldNotifyOperator, true);
});

test("AWAITING_CONFIRMATION => notify true, severity warning", () => {
  const m = evaluateTrendTransitionMonitor({ trendStrategy: strat({ status: "AWAITING_CONFIRMATION", riskStatus: "PASS" }), canonicalMarketRegime: DOWN });
  assert.equal(m.status, "AWAITING_CONFIRMATION");
  assert.equal(m.severity, "warning");
  assert.equal(m.shouldNotifyOperator, true);
});

test("RISK_REJECTED => notify true", () => {
  const m = evaluateTrendTransitionMonitor({ trendStrategy: strat({ status: "RISK_REJECTED", riskStatus: "NO_TRADE_BAD_RR" }), canonicalMarketRegime: DOWN });
  assert.equal(m.status, "RISK_REJECTED");
  assert.equal(m.shouldNotifyOperator, true);
  assert.equal(m.severity, "warning");
});

test("INVALIDATED => critical", () => {
  const m = evaluateTrendTransitionMonitor({ trendStrategy: strat({ status: "INVALIDATED", riskStatus: "PASS" }), canonicalMarketRegime: DOWN });
  assert.equal(m.status, "SETUP_INVALIDATED");
  assert.equal(m.severity, "critical");
  assert.equal(m.shouldNotifyOperator, true);
});

test("regime mismatch => REGIME_CHANGED", () => {
  const m = evaluateTrendTransitionMonitor({ trendStrategy: strat({ status: "NO_TRADE", direction: "SHORT" }), canonicalMarketRegime: { regime: "RANGE" } as any });
  assert.equal(m.status, "REGIME_CHANGED");
  assert.equal(m.severity, "warning");
  assert.equal(m.shouldNotifyOperator, true);
});

test("paperActivationAllowed always false / liveActivationAllowed always false", () => {
  for (const s of ["NO_TRADE", "WATCHING_PULLBACK", "AWAITING_CONFIRMATION", "RISK_REJECTED", "INVALIDATED"] as const) {
    const m = evaluateTrendTransitionMonitor({ trendStrategy: strat({ status: s }), canonicalMarketRegime: DOWN });
    assert.equal(m.paperActivationAllowed, false);
    assert.equal(m.liveActivationAllowed, false);
  }
});

test("missing strategy => SAFETY_BLOCK", () => {
  const m = evaluateTrendTransitionMonitor({ trendStrategy: null, canonicalMarketRegime: DOWN });
  assert.equal(m.status, "SAFETY_BLOCK");
  assert.equal(m.severity, "critical");
});

test("monitor never creates execution intent (no order fields, flags false)", () => {
  const m = evaluateTrendTransitionMonitor({ trendStrategy: strat({ status: "AWAITING_CONFIRMATION" }), canonicalMarketRegime: DOWN });
  assert.equal(m.paperActivationAllowed, false);
  assert.equal(m.liveActivationAllowed, false);
  assert.ok(!("orderIntent" in m));
  assert.ok(!("placeOrder" in m));
});
