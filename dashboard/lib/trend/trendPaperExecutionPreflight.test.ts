import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateTrendPaperExecutionPreflight } from "./trendPaperExecutionPreflight.ts";
import type { TrendStrategy } from "./trendStrategy.ts";
import type { TrendManualPaperArmGate } from "./trendManualPaperArmGate.ts";

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
function arm(p: Partial<TrendManualPaperArmGate>): TrendManualPaperArmGate {
  return {
    phase: "T-2_READY_FOR_OPERATOR", status: "READY_FOR_OPERATOR_REVIEW",
    requiredConditions: [], passedConditions: [], failedConditions: [],
    operatorActionRequired: true, setupId: "trend-arm:SHORT:DOWNTREND:63142-63453", expiryAt: null,
    paperActivationAllowed: false, liveActivationAllowed: false, notes: [], ...p,
  };
}
const DOWN = { regime: "DOWNTREND" } as any;
const zoneReady = { buildStatus: "READY" } as any;

function pf(over: any = {}) {
  return evaluateTrendPaperExecutionPreflight({
    trendManualPaperArmGate: over.arm ?? arm({}),
    trendStrategy: over.strat ?? strat({}),
    trendZoneCandidate: over.zone ?? zoneReady,
    canonicalMarketRegime: over.regime ?? DOWN,
    currentPrice: over.currentPrice ?? 63300,
    freshness: over.freshness ?? { stale: false },
  });
}

test("all inputs present => READY_FOR_PAPER_SIMULATION_REVIEW", () => {
  const p = pf();
  assert.equal(p.status, "READY_FOR_PAPER_SIMULATION_REVIEW");
  assert.equal(p.failedInputs.length, 0);
  assert.ok(p.setupId);
  assert.equal(p.direction, "SHORT");
});

test("all gate flags false in every status", () => {
  for (const s of ["AWAITING_CONFIRMATION", "NO_TRADE", "INVALIDATED"] as const) {
    const p = pf({ strat: strat({ status: s }) });
    assert.equal(p.paperArmAllowed, false);
    assert.equal(p.paperActivationAllowed, false);
    assert.equal(p.liveActivationAllowed, false);
    assert.equal(p.journalWriteAllowed, false);
    assert.equal(p.simulatedFillAllowed, false);
  }
});

test("current NO_TRADE_NEAR_TARGET => NOT_READY", () => {
  const p = pf({
    strat: strat({ status: "NO_TRADE", riskStatus: "NO_TRADE_NEAR_TARGET", confirmationStatus: "NOT_REQUIRED", confirmationRequired: false }),
    arm: arm({ status: "NOT_READY" }),
  });
  assert.equal(p.status, "NOT_READY");
  assert.ok(p.failedInputs.includes("trend_status_awaiting_or_setup_ready"));
});

test("missing strategy => BLOCKED", () => {
  const p = evaluateTrendPaperExecutionPreflight({ trendManualPaperArmGate: arm({}), trendStrategy: null, trendZoneCandidate: zoneReady, canonicalMarketRegime: DOWN });
  assert.equal(p.status, "BLOCKED");
});

test("activation flag true on strategy => BLOCKED", () => {
  const p = pf({ strat: strat({ paperActivationAllowed: true } as any) });
  assert.equal(p.status, "BLOCKED");
});

test("arm gate expired => EXPIRED", () => {
  const p = pf({ arm: arm({ status: "EXPIRED" }) });
  assert.equal(p.status, "EXPIRED");
});

test("strategy invalidated => INVALIDATED", () => {
  const p = pf({ strat: strat({ status: "INVALIDATED" }) });
  assert.equal(p.status, "INVALIDATED");
});

test("reward_risk below min => NOT_READY fail reward_risk_min", () => {
  const p = pf({ strat: strat({ rewardRisk: 1.0 }) });
  assert.ok(p.failedInputs.includes("reward_risk_min"));
  assert.equal(p.status, "NOT_READY");
});

test("regime mismatch => NOT_READY fail regime_direction_match", () => {
  const p = pf({ regime: { regime: "RANGE" } });
  assert.ok(p.failedInputs.includes("regime_direction_match"));
});

test("stale data => NOT_READY fail data_fresh", () => {
  const p = pf({ freshness: { stale: true } });
  assert.ok(p.failedInputs.includes("data_fresh"));
});

test("entry/SL/TP1 present in output", () => {
  const p = pf();
  assert.ok(Number.isFinite(p.entry));
  assert.equal(p.stopLoss, 64552);
  assert.equal(p.takeProfit1, 61825);
});
