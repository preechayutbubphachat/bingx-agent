// dashboard/lib/trend/currentPriceEligibleExactSubset.test.ts
// Run: node --test --experimental-strip-types lib/trend/currentPriceEligibleExactSubset.test.ts

import assert from "node:assert/strict";
import test from "node:test";

import { evaluateCurrentPriceEligibleExactSubset } from "./currentPriceEligibleExactSubset.ts";

const freshContext = {
  currentPrice: 100,
  priceSource: "market_snapshot.15m.close",
  latestCandleAt: "2026-06-18T05:00:00.000Z",
  freshnessStatus: "FRESH",
  ageSeconds: 60,
};

function baseInput(overrides: Record<string, unknown> = {}) {
  return {
    mtfEntryCandidatePipeline: {
      sampleAccounting: {
        lifetimeExactSamples: 325,
        windowExactSamples: 65,
        currentPriceEligibleExactSamples: null,
      },
      currentPriceContext: freshContext,
      currentCandidateReevaluation: { status: "CURRENT_PRICE_CONFIRMED" },
    },
    mtfExactZoneFailureAttribution: {
      failureRates: {
        targetTooCloseRate: 0.2,
        missedFillRate: 0.3,
        entryTouchRate: 0.5,
        targetAfterTouchRate: 0.4,
        invalidationAfterTouchRate: 0.2,
      },
    },
    currentPriceContext: freshContext,
    currentCandidateReevaluation: { status: "CURRENT_PRICE_CONFIRMED" },
    ...overrides,
  };
}

test("fresh current price and valid LONG candidate near entry produces clean review-only candidate", () => {
  const result = evaluateCurrentPriceEligibleExactSubset(baseInput({
    exactCandidateRecords: [{
      id: "long-clean",
      direction: "LONG",
      entryLow: 99.9,
      entryHigh: 100.2,
      stopLoss: 98,
      target1: 103,
      target2: 105,
      netRR: 1.6,
      capturedAt: "2026-06-18T05:00:00.000Z",
    }],
  }));

  assert.equal(result.sampleAccounting.currentPriceEligibleExactSamples, 1);
  assert.equal(result.sampleAccounting.cleanCurrentPriceEligibleSamples, 1);
  assert.equal(result.eligibilityFilters.cleanCandidates, 1);
  assert.match(result.status, /CLEAN_SUBSET_FOUND_REVIEW_ONLY|CLEAN_SUBSET_REVIEW_READY_NOT_ACTIVATION/);
  assert.equal(result.topCandidates[0]?.status, "CLEAN_REVIEW_ONLY");
  assert.equal(result.activationAllowed, false);
  assert.equal(result.paperActivationAllowed, false);
  assert.equal(result.liveActivationAllowed, false);
  assert.equal(result.reviewOnly, true);
  assert.equal(result.shadowOnly, true);
});

test("stale current price requires re-evaluation and produces no clean subset", () => {
  const result = evaluateCurrentPriceEligibleExactSubset(baseInput({
    currentPriceContext: { ...freshContext, freshnessStatus: "STALE", ageSeconds: 4_000 },
    exactCandidateRecords: [{
      id: "stale-candidate",
      direction: "LONG",
      entry: 100,
      stopLoss: 98,
      target1: 103,
      netRR: 1.6,
    }],
  }));

  assert.equal(result.status, "STALE_REEVALUATION_REQUIRED");
  assert.equal(result.sampleAccounting.currentPriceEligibleExactSamples, 0);
  assert.equal(result.eligibilityFilters.cleanCandidates, 0);
  assert.equal(result.cleanSubsetGate.status, "NOT_READY");
  assert.equal(result.activationAllowed, false);
});

test("missing structured geometry reports required inputs instead of fake eligible count", () => {
  const result = evaluateCurrentPriceEligibleExactSubset(baseInput({
    exactZoneComparisonSummary: {
      exactSamples: 325,
      exactAvgNetRR: 5.06,
      heuristicAvgNetRR: 1.62,
    },
  }));

  assert.equal(result.status, "GEOMETRY_INPUTS_MISSING");
  assert.equal(result.sampleAccounting.currentPriceEligibleExactSamples, null);
  assert.ok(result.requiredGeometryInputs.includes("direction"));
  assert.ok(result.requiredGeometryInputs.includes("entryLow/entryHigh or entry"));
  assert.equal(result.eligibilityFilters.totalCandidates, 0);
});

test("invalidated LONG is classified when current price is at or below stop", () => {
  const result = evaluateCurrentPriceEligibleExactSubset(baseInput({
    currentPriceContext: { ...freshContext, currentPrice: 97.9 },
    exactCandidateRecords: [{
      id: "long-invalidated",
      direction: "LONG",
      entry: 100,
      stopLoss: 98,
      target1: 103,
      netRR: 1.6,
    }],
  }));

  assert.equal(result.topCandidates[0]?.status, "INVALIDATED");
  assert.equal(result.eligibilityFilters.invalidatedCandidates, 1);
});

test("invalidated SHORT is classified when current price is at or above stop", () => {
  const result = evaluateCurrentPriceEligibleExactSubset(baseInput({
    currentPriceContext: { ...freshContext, currentPrice: 102.1 },
    exactCandidateRecords: [{
      id: "short-invalidated",
      direction: "SHORT",
      entry: 100,
      stopLoss: 102,
      target1: 96,
      netRR: 1.6,
    }],
  }));

  assert.equal(result.topCandidates[0]?.status, "INVALIDATED");
  assert.equal(result.eligibilityFilters.invalidatedCandidates, 1);
});

test("target too close candidate fails clean gate", () => {
  const result = evaluateCurrentPriceEligibleExactSubset(baseInput({
    exactCandidateRecords: [{
      id: "target-close",
      direction: "LONG",
      entry: 100,
      stopLoss: 99,
      target1: 100.1,
      netRR: 0.8,
    }],
  }));

  assert.equal(result.topCandidates[0]?.status, "TARGET_TOO_CLOSE");
  assert.equal(result.eligibilityFilters.targetTooCloseCandidates, 1);
  assert.equal(result.cleanSubsetGate.status, "NOT_READY");
});

test("current price far away marks candidate missed and no eligible subset", () => {
  const result = evaluateCurrentPriceEligibleExactSubset(baseInput({
    currentPriceContext: { ...freshContext, currentPrice: 101 },
    exactCandidateRecords: [{
      id: "long-missed",
      direction: "LONG",
      entryLow: 99.8,
      entryHigh: 100,
      stopLoss: 98,
      target1: 104,
      netRR: 1.5,
    }],
  }));

  assert.equal(result.topCandidates[0]?.status, "MISSED");
  assert.equal(result.status, "NO_CURRENT_PRICE_ELIGIBLE_CANDIDATES");
});

test("helper does not mutate input", () => {
  const input = baseInput({
    exactCandidateRecords: [{
      id: "immutable",
      direction: "LONG",
      entry: 100,
      stopLoss: 98,
      target1: 103,
      netRR: 1.6,
    }],
  });
  const before = JSON.stringify(input);

  evaluateCurrentPriceEligibleExactSubset(input);

  assert.equal(JSON.stringify(input), before);
});
