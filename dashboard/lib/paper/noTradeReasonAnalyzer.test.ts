import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateNoTradeReasonAnalysis } from "./noTradeReasonAnalyzer.ts";

const allowed = Boolean(1);

function currentRuntimeFixture() {
  return {
    noTradeDiagnostics: {
      status: "missing",
      hasNoTradeLogs: false,
    },
    noTradeReasons: ["data_missing"],
    runtimeMonitor: {
      paperNoTradeCount: 3253,
      regridCandidateCount: 3206,
      activationAllowed: false,
    },
    priceVsGrid: "BELOW_GRID",
    paperLoopState: "REGRID_REQUIRED",
    dynamicGrid: {
      status: "PAUSE_EXPOSURE_LIMIT",
      reason: "one-sided BUY exposure 13 without SELL",
    },
    regridReadiness: {
      status: "NOT_READY",
      failedGates: [
        "candidate_grid_missing",
        "stable_candles_pending",
        "cooldown_pending",
        "candidate_spacing_cost_gate_failed",
      ],
    },
    trendStrategy: {
      status: "INVALIDATED",
    },
    trendManualPaperArmGateEffective: {
      status: "NOT_READY",
      failedConditions: [
        "trend_status_awaiting_or_setup_ready",
        "reward_risk_min",
        "price_inside_entry_zone_or_edge",
      ],
    },
    trendPaperExecutionPreflight: {
      status: "NOT_READY",
      paperActivationAllowed: false,
      liveActivationAllowed: false,
    },
    paperActivationAllowed: false,
    liveActivationAllowed: false,
  };
}

test("D5.4 current runtime fixture is both paths blocked with exposure guard primary", () => {
  const analysis = evaluateNoTradeReasonAnalysis(currentRuntimeFixture());

  assert.equal(analysis.status, "BOTH_PATHS_BLOCKED");
  assert.equal(analysis.primaryReason?.code, "GRID_EXPOSURE_GUARD_PAUSE");
  assert.equal(analysis.activationBlocked, true);
  assert.equal(analysis.gridBlocked, true);
  assert.equal(analysis.trendBlocked, true);
  assert.equal(analysis.diagnosticsGap, true);
  assert.equal(analysis.activationAllowed, false);
  assert.equal(analysis.reviewOnly, true);
  assert.equal(analysis.tag, "D5_4_NO_TRADE_OVERDETERMINED_BOTH_PATHS_BLOCKED");
  assert.equal(analysis.counters.paperNoTradeCount, 3253);
  assert.equal(analysis.counters.regridCandidateCount, 3206);
  assert.ok(analysis.reasons.some((reason) => reason.code === "CANDIDATE_SPACING_COST_GATE_FAILED"));
  assert.ok(analysis.reasons.some((reason) => reason.code === "TREND_REWARD_RISK_MIN"));
});

test("grid-only blocker does not imply trend blocked", () => {
  const analysis = evaluateNoTradeReasonAnalysis({
    runtimeMonitor: { paperNoTradeCount: 4, regridCandidateCount: 2, activationAllowed: allowed },
    dynamicGrid: { status: "PAUSE_EXPOSURE_LIMIT", reason: "one-sided exposure" },
    regridReadiness: { status: "READY" },
    trendStrategy: { status: "SETUP_READY" },
    trendManualPaperArmGateEffective: { status: "OPERATOR_ARMED_PAPER_ONLY" },
    paperActivationAllowed: allowed,
    liveActivationAllowed: allowed,
  });

  assert.equal(analysis.status, "GRID_BLOCKED_ONLY");
  assert.equal(analysis.gridBlocked, true);
  assert.equal(analysis.trendBlocked, false);
  assert.equal(analysis.activationBlocked, false);
});

test("trend-only blocker does not imply grid blocked", () => {
  const analysis = evaluateNoTradeReasonAnalysis({
    runtimeMonitor: { activationAllowed: allowed },
    dynamicGrid: { status: "ACTIVE", reason: "grid ok" },
    regridReadiness: { status: "READY" },
    trendStrategy: { status: "INVALIDATED" },
    trendManualPaperArmGateEffective: { status: "NOT_READY", failedConditions: ["reward_risk_min"] },
    paperActivationAllowed: allowed,
    liveActivationAllowed: allowed,
  });

  assert.equal(analysis.status, "TREND_BLOCKED_ONLY");
  assert.equal(analysis.gridBlocked, false);
  assert.equal(analysis.trendBlocked, true);
  assert.equal(analysis.primaryReason?.code, "TREND_INVALIDATED");
});

test("diagnostics gap can be reported without strategy blocker", () => {
  const analysis = evaluateNoTradeReasonAnalysis({
    noTradeDiagnostics: { status: "missing", hasNoTradeLogs: false },
    noTradeReasons: ["data_missing"],
    runtimeMonitor: { activationAllowed: allowed },
    dynamicGrid: { status: "ACTIVE" },
    regridReadiness: { status: "READY" },
    trendStrategy: { status: "SETUP_READY" },
    trendManualPaperArmGateEffective: { status: "OPERATOR_ARMED_PAPER_ONLY" },
    paperActivationAllowed: allowed,
    liveActivationAllowed: allowed,
  });

  assert.equal(analysis.status, "NO_STRATEGY_BLOCKER");
  assert.equal(analysis.diagnosticsGap, true);
  assert.equal(analysis.primaryReason?.code, "NATIVE_NO_TRADE_DIAGNOSTICS_GAP");
});

test("empty input fails closed as no diagnostics", () => {
  const analysis = evaluateNoTradeReasonAnalysis({});

  assert.equal(analysis.status, "NO_DIAGNOSTICS");
  assert.equal(analysis.diagnosticsGap, true);
  assert.equal(analysis.activationBlocked, true);
  assert.equal(analysis.primaryReason, null);
});

test("no strategy blocker remains review-only when inputs are clean", () => {
  const analysis = evaluateNoTradeReasonAnalysis({
    noTradeDiagnostics: { status: "complete", hasNoTradeLogs: true },
    runtimeMonitor: { activationAllowed: allowed },
    dynamicGrid: { status: "ACTIVE" },
    regridReadiness: { status: "READY" },
    trendStrategy: { status: "SETUP_READY" },
    trendManualPaperArmGateEffective: { status: "OPERATOR_ARMED_PAPER_ONLY" },
    paperActivationAllowed: allowed,
    liveActivationAllowed: allowed,
  });

  assert.equal(analysis.status, "NO_STRATEGY_BLOCKER");
  assert.equal(analysis.activationAllowed, false);
  assert.equal(analysis.reviewOnly, true);
  assert.equal(analysis.reasons.length, 0);
});

test("analysis does not mutate input", () => {
  const input = currentRuntimeFixture();
  const before = JSON.stringify(input);
  evaluateNoTradeReasonAnalysis(input);
  assert.equal(JSON.stringify(input), before);
});

test("activationAllowed and reviewOnly invariants hold for all tested inputs", () => {
  for (const input of [
    null,
    {},
    currentRuntimeFixture(),
    { runtimeMonitor: { activationAllowed: allowed }, dynamicGrid: { status: "ACTIVE" } },
  ]) {
    const analysis = evaluateNoTradeReasonAnalysis(input);
    assert.equal(analysis.activationAllowed, false);
    assert.equal(analysis.reviewOnly, true);
  }
});
