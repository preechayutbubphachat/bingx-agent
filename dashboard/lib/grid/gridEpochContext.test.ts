import { test } from "node:test";
import assert from "node:assert/strict";
import { buildGridEpochContext, type GridEpochContextInput } from "./gridEpochContext.ts";

function baseInput(overrides: Partial<GridEpochContextInput> = {}): GridEpochContextInput {
  return {
    oldEpoch: {
      buyFillCount: 1,
      sellFillCount: 0,
      oldGridLower: 90,
      oldGridUpper: 110,
      marketChanged: true,
    },
    current: {
      currentPrice: 120,
      regime: "RANGE",
      atrPct: 1.2,
      bbwPct: 3.2,
      adx: 16,
      sourceFresh: true,
    },
    costGate: {
      roundTripCostPct: 0.2,
      candidateGridSpacingPct: 0.7,
    },
    candidate: {
      gridCount: 10,
    },
    ...overrides,
  };
}

test("old epoch quarantined but current grid eligibility can still be evaluated", () => {
  const result = buildGridEpochContext(baseInput({
    oldEpoch: {
      buyFillCount: 3,
      sellFillCount: 0,
      oldGridLower: 70,
      oldGridUpper: 80,
      marketChanged: false,
    },
  }));

  assert.equal(result.oldEpochStatus, "QUARANTINED");
  assert.equal(result.currentGridEligibility, "GRID_REGIME_ELIGIBLE");
  assert.equal(result.proposedNextResearch, "EVALUATE_FRESH_GRID_CANDIDATE");
  assert.equal(result.freshGridCandidateReview.status, "CANDIDATE_REVIEW_READY");
  assert.ok(result.oldEpochPolicy.includes("KEEP_FOR_AUDIT_ONLY"));
});

test("old grid bounds are not reused for a fresh candidate", () => {
  const result = buildGridEpochContext(baseInput({
    oldEpoch: {
      buyFillCount: 1,
      sellFillCount: 0,
      oldGridLower: 90,
      oldGridUpper: 110,
      marketChanged: true,
    },
    current: {
      currentPrice: 120,
      regime: "RANGE",
      atrPct: 1,
      bbwPct: 4,
      adx: 14,
      sourceFresh: true,
    },
  }));

  assert.equal(result.oldEpochStatus, "OBSOLETE_MARKET_CHANGED");
  assert.notEqual(result.freshGridCandidateReview.candidateGridLower, 90);
  assert.notEqual(result.freshGridCandidateReview.candidateGridUpper, 110);
  assert.equal(result.freshGridCandidateReview.candidateGridMid, 120);
});

test("RANGE regime produces a review-only fresh candidate", () => {
  const result = buildGridEpochContext(baseInput());

  assert.equal(result.currentRegime, "RANGE");
  assert.equal(result.currentGridEligibility, "GRID_REGIME_ELIGIBLE");
  assert.equal(result.freshGridCandidateReview.status, "CANDIDATE_REVIEW_READY");
  assert.equal(result.freshGridCandidateReview.costGatePass, true);
  assert.equal(result.activationAllowed, false);
  assert.equal(result.paperActivationAllowed, false);
  assert.equal(result.liveActivationAllowed, false);
  assert.equal(result.reviewOnly, true);
  assert.equal(result.shadowOnly, true);
});

test("VOLATILITY_COMPRESSION and NEUTRAL can produce review-only candidates when cost and freshness pass", () => {
  for (const regime of ["VOLATILITY_COMPRESSION", "NEUTRAL"] as const) {
    const result = buildGridEpochContext(baseInput({
      current: {
        currentPrice: 120,
        regime,
        atrPct: 0.9,
        bbwPct: 2.8,
        adx: 18,
        sourceFresh: true,
      },
    }));

    assert.equal(result.currentGridEligibility, "GRID_REGIME_ELIGIBLE");
    assert.equal(result.freshGridCandidateReview.status, "CANDIDATE_REVIEW_READY");
  }
});

test("DOWNTREND and UPTREND block grid review and route to trend review", () => {
  for (const regime of ["DOWNTREND", "UPTREND"] as const) {
    const result = buildGridEpochContext(baseInput({
      current: {
        currentPrice: 120,
        regime,
        atrPct: 1,
        bbwPct: 3,
        adx: 24,
        sourceFresh: true,
      },
    }));

    assert.equal(result.currentGridEligibility, "TREND_REGIME_BLOCKED");
    assert.equal(result.proposedNextResearch, "USE_TREND_REVIEW_PATH");
    assert.equal(result.freshGridCandidateReview.status, "REGIME_BLOCKED");
  }
});

test("volatility blocks grid review", () => {
  const result = buildGridEpochContext(baseInput({
    current: {
      currentPrice: 120,
      regime: "HIGH_VOL",
      atrPct: 5.5,
      bbwPct: 12,
      adx: 18,
      sourceFresh: true,
    },
  }));

  assert.equal(result.currentGridEligibility, "VOLATILITY_BLOCKED");
  assert.equal(result.freshGridCandidateReview.status, "VOLATILITY_BLOCKED");
});

test("cost gate blocks grid review when spacing is below required threshold", () => {
  const result = buildGridEpochContext(baseInput({
    costGate: {
      roundTripCostPct: 0.2,
      candidateGridSpacingPct: 0.49,
    },
  }));

  assert.equal(result.currentGridEligibility, "COST_GATE_BLOCKED");
  assert.equal(result.freshGridCandidateReview.status, "COST_GATE_BLOCKED");
  assert.equal(result.freshGridCandidateReview.costGatePass, false);
});

test("missing gridSpacingPct is data quality blocked, not strategy failure", () => {
  const result = buildGridEpochContext(baseInput({
    costGate: {
      roundTripCostPct: 0.2,
      candidateGridSpacingPct: null,
    },
  }));

  assert.equal(result.currentGridEligibility, "DATA_QUALITY_BLOCKED");
  assert.equal(result.proposedNextResearch, "REPAIR_GRID_DATA_QUALITY");
  assert.equal(result.freshGridCandidateReview.status, "DATA_QUALITY_BLOCKED");
  assert.ok(result.blockers.includes("missing_candidate_grid_spacing_pct"));
});

test("safety flags are forced false", () => {
  const result = buildGridEpochContext(baseInput());

  assert.equal(result.activationAllowed, false);
  assert.equal(result.paperActivationAllowed, false);
  assert.equal(result.liveActivationAllowed, false);
  assert.equal(result.reviewOnly, true);
  assert.equal(result.shadowOnly, true);
});

test("helper is pure and does not mutate input", () => {
  const input = baseInput();
  const before = structuredClone(input);

  buildGridEpochContext(input);

  assert.deepEqual(input, before);
}
);
