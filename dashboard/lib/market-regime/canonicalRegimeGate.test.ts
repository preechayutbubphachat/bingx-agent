import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyCanonicalRegimeGateShadow,
  buildCanonicalRegimeGate,
  type CanonicalRegimeGateInput,
  type RegridReadinessSnapshot,
} from "./canonicalRegimeGate.ts";
import type { CanonicalMarketRegime } from "./canonicalMarketRegime.ts";

const READY: RegridReadinessSnapshot = {
  status: "READY_FOR_OPERATOR_REVIEW",
  score: 90,
  passedGates: [],
  failedGates: [],
  warnings: [],
  nextAction: "operator_review_required_before_any_phase_2b_activation",
  operatorReviewRequired: true,
  paperActivationAllowed: false,
  liveActivationAllowed: false,
};

const WATCH: RegridReadinessSnapshot = { ...READY, status: "WATCH", score: 55, operatorReviewRequired: false };
const NOT_READY: RegridReadinessSnapshot = { ...READY, status: "NOT_READY", score: 10, operatorReviewRequired: false };

function input(regime: CanonicalMarketRegime["regime"]): CanonicalRegimeGateInput {
  return {
    canonicalMarketRegime: {
      regime,
      direction: regime === "DOWNTREND" ? "BEARISH" : regime === "UPTREND" ? "BULLISH" : "NEUTRAL",
      confidence: 78,
      confidenceLabel: "high",
      reasons: ["test_regime"],
      warnings: [],
      allowedModes: regime === "RANGE" ? ["NO_TRADE", "RANGE_WATCH"] : ["NO_TRADE", "TREND_CHECK"],
      blockedModes: regime === "RANGE" ? ["PHASE_2B_ACTIVATION"] : ["NEUTRAL_GRID", "DYNAMIC_NEUTRAL_GRID", "PHASE_2B_ACTIVATION"],
      sourcePriority: ["market_snapshot.klines"],
      ignoredLegacyFields: ["latest_decision.market_mode"],
      sourceFreshness: { status: "fresh", generatedAt: null, latestCandleAtByTimeframe: {}, warnings: [] },
      evidenceCompleteness: { status: "partial", scorePct: 60, availableGroups: [], missingGroups: [] },
      shadowOnly: true,
      paperActivationAllowed: false,
      liveActivationAllowed: false,
    },
    currentRegridReadiness: READY,
  };
}

test("DOWNTREND requires trend check and blocks neutral grid modes", () => {
  const gate = buildCanonicalRegimeGate(input("DOWNTREND"));

  assert.equal(gate.status, "TREND_CHECK_REQUIRED");
  assert.equal(gate.blocking, true);
  assert.equal(gate.downgradeOnly, true);
  assert.ok(gate.affectedModes.includes("NEUTRAL_GRID"));
  assert.ok(gate.affectedModes.includes("DYNAMIC_NEUTRAL_GRID"));
  assert.ok(gate.affectedModes.includes("PHASE_2B_ACTIVATION"));
  assert.equal(gate.paperActivationAllowed, false);
  assert.equal(gate.liveActivationAllowed, false);
});

test("RANGE is passive shadow and does not allow activation", () => {
  const gate = buildCanonicalRegimeGate(input("RANGE"));

  assert.equal(gate.status, "PASSIVE_SHADOW");
  assert.equal(gate.blocking, false);
  assert.equal(gate.paperActivationAllowed, false);
  assert.equal(gate.liveActivationAllowed, false);
});

test("VOLATILITY_EXPANSION blocks all grid modes", () => {
  const gate = buildCanonicalRegimeGate(input("VOLATILITY_EXPANSION"));

  assert.equal(gate.status, "VOLATILITY_BLOCK");
  assert.equal(gate.blocking, true);
  assert.ok(gate.affectedModes.includes("ALL_GRID_MODES"));
  assert.ok(gate.affectedModes.includes("PHASE_2B_ACTIVATION"));
});

test("UNKNOWN maps to unknown data block", () => {
  const gate = buildCanonicalRegimeGate(input("UNKNOWN"));

  assert.equal(gate.status, "UNKNOWN_DATA_BLOCK");
  assert.equal(gate.blocking, true);
});

test("NO_TRADE requires no-trade", () => {
  const gate = buildCanonicalRegimeGate(input("NO_TRADE"));

  assert.equal(gate.status, "NO_TRADE_REQUIRED");
  assert.equal(gate.blocking, true);
});

test("READY plus DOWNTREND downgrades in shadow compare but never mutates before", () => {
  const gate = buildCanonicalRegimeGate(input("DOWNTREND"));
  const compare = applyCanonicalRegimeGateShadow(READY, gate);

  assert.ok(compare.before);
  assert.ok(compare.after);
  assert.equal(compare.before.status, "READY_FOR_OPERATOR_REVIEW");
  assert.equal(compare.after.status, "WATCH");
  assert.equal(compare.changed, true);
  assert.equal(READY.status, "READY_FOR_OPERATOR_REVIEW");
});

test("WATCH plus DOWNTREND downgrades to NOT_READY", () => {
  const gate = buildCanonicalRegimeGate(input("DOWNTREND"));
  const compare = applyCanonicalRegimeGateShadow(WATCH, gate);

  assert.ok(compare.before);
  assert.ok(compare.after);
  assert.equal(compare.before.status, "WATCH");
  assert.equal(compare.after.status, "NOT_READY");
  assert.equal(compare.changed, true);
});

test("NOT_READY never upgrades", () => {
  const gate = buildCanonicalRegimeGate(input("RANGE"));
  const compare = applyCanonicalRegimeGateShadow(NOT_READY, gate);

  assert.ok(compare.before);
  assert.ok(compare.after);
  assert.equal(compare.before.status, "NOT_READY");
  assert.equal(compare.after.status, "NOT_READY");
  assert.equal(compare.changed, false);
});

test("RANGE passive shadow does not downgrade READY", () => {
  const gate = buildCanonicalRegimeGate(input("RANGE"));
  const compare = applyCanonicalRegimeGateShadow(READY, gate);

  assert.ok(compare.after);
  assert.equal(compare.after.status, "READY_FOR_OPERATOR_REVIEW");
  assert.equal(compare.changed, false);
});

test("missing canonical regime data blocks and downgrades to NOT_READY", () => {
  const gate = buildCanonicalRegimeGate({ canonicalMarketRegime: null, currentRegridReadiness: READY });
  const compare = applyCanonicalRegimeGateShadow(READY, gate);

  assert.equal(gate.status, "UNKNOWN_DATA_BLOCK");
  assert.ok(compare.after);
  assert.equal(compare.after.status, "NOT_READY");
  assert.ok(gate.reasons.includes("missing_canonical_market_regime"));
});

test("latest_decision.market_mode is not used by the gate input", () => {
  const gate = buildCanonicalRegimeGate({
    ...input("DOWNTREND"),
    legacyPlanMode: "GRID_NEUTRAL",
  });

  assert.equal(gate.status, "TREND_CHECK_REQUIRED");
  assert.ok(gate.warnings.includes("legacy_plan_mode_ignored_by_canonical_regime_gate"));
});
