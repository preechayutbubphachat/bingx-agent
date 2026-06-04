import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateRegridReadiness } from "./regridReadiness";

const BASE = {
  currentPrice: 63598.5,
  gridLower: 72480,
  gridUpper: 78053,
  gridMid: 75266.5,
  priceVsGrid: "BELOW_GRID" as const,
  candidateStatus: "REGRID_CANDIDATE",
  candidateGridLower: 61200,
  candidateGridUpper: 66000,
  candidateGridMid: 63598.5,
  candidateSpacingPct: 0.7,
  stableCandleCount: 4,
  cooldownRemaining: 0,
  buyFillCount: 14,
  sellFillCount: 0,
  closedCycles: 0,
  costGate: { pass: true, requiredMinSpacingPct: 0.2 },
  regime: "RANGE",
  marketMode: "GRID_NEUTRAL",
};

test("ready for operator review never permits paper or live activation", () => {
  const r = evaluateRegridReadiness(BASE);

  assert.equal(r.status, "READY_FOR_OPERATOR_REVIEW");
  assert.equal(r.operatorReviewRequired, true);
  assert.equal(r.paperActivationAllowed, false);
  assert.equal(r.liveActivationAllowed, false);
  assert.ok(r.passedGates.includes("stable_candles_ready"));
  assert.ok(r.passedGates.includes("old_one_sided_exposure_quarantined"));
});

test("cooldown and missing stability keep readiness not ready", () => {
  const r = evaluateRegridReadiness({
    ...BASE,
    stableCandleCount: 1,
    cooldownRemaining: 3,
  });

  assert.equal(r.status, "NOT_READY");
  assert.ok(r.failedGates.includes("stable_candles_pending"));
  assert.ok(r.failedGates.includes("cooldown_pending"));
});

test("cost gate failure keeps readiness in watch", () => {
  const r = evaluateRegridReadiness({
    ...BASE,
    costGate: { pass: false, requiredMinSpacingPct: 0.2 },
  });

  assert.equal(r.status, "WATCH");
  assert.ok(r.failedGates.includes("candidate_spacing_cost_gate_failed"));
});

test("violent trend prevents operator-ready state", () => {
  const r = evaluateRegridReadiness({
    ...BASE,
    volatilityProxyPct: 12,
  });

  assert.equal(r.status, "WATCH");
  assert.ok(r.failedGates.includes("violent_trend_risk"));
});
