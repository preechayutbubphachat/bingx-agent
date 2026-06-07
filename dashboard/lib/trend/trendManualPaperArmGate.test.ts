import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateTrendManualPaperArmGate } from "./trendManualPaperArmGate.ts";
import type { TrendStrategy } from "./trendStrategy.ts";

function strat(p: Partial<TrendStrategy>): TrendStrategy {
  return {
    enabled: false, phase: "T-1_SHADOW", status: "AWAITING_CONFIRMATION", direction: "SHORT",
    setupReason: null, entryZone: [63142, 63453], currentPrice: 63300,
    distanceToEntryZonePct: 0, invalidation: 64552, target1: 61825, target2: null,
    rewardRisk: 1.5, confirmationRequired: true, confirmationStatus: "WAITING_5M_CONFIRM",
    riskStatus: "PASS", oldExposurePolicy: "QUARANTINE_OLD_GRID_EXPOSURE",
    countTowardGridClosedCycles: false, countTowardTrendEvidence: false,
    paperActivationAllowed: false, liveActivationAllowed: false, shadowOnly: true,
    reasons: [], warnings: [], ...p,
  };
}
const DOWN = { regime: "DOWNTREND", direction: "BEARISH" } as any;
const zoneReady = { buildStatus: "READY" } as any;
const igOk = { status: "TREND_DOWN_BLOCK" } as any;

function gate(over: any = {}) {
  return evaluateTrendManualPaperArmGate({
    trendStrategy: strat(over.trendStrategy ?? {}),
    trendZoneCandidate: over.zone ?? zoneReady,
    canonicalMarketRegime: over.regime ?? DOWN,
    indicatorGate: over.ig ?? igOk,
    currentPrice: over.currentPrice ?? 63300,
    freshness: over.freshness ?? { stale: false },
    awaitingSince: over.awaitingSince,
    checkedAt: over.checkedAt,
    expiryMs: over.expiryMs,
  });
}

test("all conditions pass => READY_FOR_OPERATOR_REVIEW, operatorActionRequired true", () => {
  const g = gate();
  assert.equal(g.status, "READY_FOR_OPERATOR_REVIEW");
  assert.equal(g.operatorActionRequired, true);
  assert.equal(g.failedConditions.length, 0);
  assert.ok(g.setupId);
});

test("paperActivationAllowed/liveActivationAllowed always false", () => {
  for (const s of ["AWAITING_CONFIRMATION", "NO_TRADE", "INVALIDATED"] as const) {
    const g = gate({ trendStrategy: { status: s } });
    assert.equal(g.paperActivationAllowed, false);
    assert.equal(g.liveActivationAllowed, false);
  }
});

test("NO_TRADE_NEAR_TARGET => NOT_READY, operatorActionRequired false", () => {
  const g = gate({ trendStrategy: { status: "NO_TRADE", riskStatus: "NO_TRADE_NEAR_TARGET", confirmationStatus: "NOT_REQUIRED", confirmationRequired: false }, currentPrice: 61847 });
  assert.equal(g.status, "NOT_READY");
  assert.equal(g.operatorActionRequired, false);
  assert.ok(g.failedConditions.includes("trend_status_awaiting_or_setup_ready"));
});

test("riskStatus not PASS => NOT_READY", () => {
  const g = gate({ trendStrategy: { riskStatus: "NO_TRADE_BAD_RR" } });
  assert.equal(g.status, "NOT_READY");
  assert.ok(g.failedConditions.includes("risk_status_pass"));
});

test("reward_risk below min => fail reward_risk_min", () => {
  const g = gate({ trendStrategy: { rewardRisk: 1.0 } });
  assert.ok(g.failedConditions.includes("reward_risk_min"));
  assert.equal(g.status, "NOT_READY");
});

test("regime mismatch => fail regime_direction_match", () => {
  const g = gate({ regime: { regime: "RANGE" } });
  assert.ok(g.failedConditions.includes("regime_direction_match"));
});

test("zone not READY => fail zone_build_ready", () => {
  const g = gate({ zone: { buildStatus: "INSUFFICIENT_DATA" } });
  assert.ok(g.failedConditions.includes("zone_build_ready"));
});

test("stale data => fail data_fresh", () => {
  const g = gate({ freshness: { stale: true } });
  assert.ok(g.failedConditions.includes("data_fresh"));
});

test("missing strategy => BLOCKED", () => {
  const g = evaluateTrendManualPaperArmGate({ trendStrategy: null, trendZoneCandidate: zoneReady, canonicalMarketRegime: DOWN });
  assert.equal(g.status, "BLOCKED");
  assert.equal(g.operatorActionRequired, false);
  assert.equal(g.paperActivationAllowed, false);
});

test("activation flag true on strategy => BLOCKED (safety)", () => {
  const g = gate({ trendStrategy: { paperActivationAllowed: true } as any });
  assert.equal(g.status, "BLOCKED");
});

test("expired arm window => EXPIRED", () => {
  const g = gate({ awaitingSince: "2026-06-05T06:00:00Z", checkedAt: "2026-06-05T06:20:00Z", expiryMs: 15 * 60 * 1000 });
  assert.equal(g.status, "EXPIRED");
  assert.equal(g.operatorActionRequired, false);
  assert.ok(g.expiryAt);
});

test("price near target => fail price_not_near_target", () => {
  const g = gate({ trendStrategy: { currentPrice: 61830 }, currentPrice: 61830 });
  assert.ok(g.failedConditions.includes("price_not_near_target"));
});
