// dashboard/lib/trend/mtfExactZoneFailureAttribution.test.ts
// Run: node --test --experimental-strip-types lib/trend/mtfExactZoneFailureAttribution.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { evaluateMtfExactZoneFailureAttribution } from "./mtfExactZoneFailureAttribution.ts";

function runtimeLike(over = {}) {
  return {
    mtfEntryCandidatePipeline: {
      sampleAccounting: {
        lifetimeExactSamples: 325,
        windowExactSamples: 65,
        currentPriceEligibleExactSamples: null,
        reviewTargetSamples: 100,
      },
      zoneCandidate: {
        exactSamples: 65,
        exactAvgNetRR: 5.06,
        heuristicAvgNetRR: 1.62,
        exactVsHeuristicDelta: 3.74,
      },
      triggerReview: {
        entryTouched: 13,
        entryTouchRate: 0.2,
        targetAfterEntryTouchRate: 0,
        invalidationAfterEntryTouchRate: 0.72,
      },
      geometry: {
        missedFillRate: 0.797,
      },
    },
    exactZoneComparisonSummary: {
      exactSamples: 65,
      exactAvgNetRR: 5.06,
      heuristicAvgNetRR: 1.62,
      avgExactVsHeuristicDelta: 3.74,
      exactReadinessCounts: { TARGET_TOO_CLOSE: 40 },
      conflictBreakdown: { TARGET_TOO_CLOSE: 40, COST_TOO_HIGH: 0, CONFLICTING_MTF: 0, other: {} },
      fillResolution: { missedFillRate: 0.797 },
    },
    shadowOutcomeSummary: {
      shadowOutcomes: {
        totalSetups: 65,
        entryTouched: 13,
        entryTouchRate: 0.2,
        targetAfterEntryTouchRate: 0,
        invalidationAfterEntryTouchRate: 0.72,
      },
    },
    currentPriceContext: { freshnessStatus: "FRESH" },
    currentCandidateReevaluation: { status: "CURRENT_PRICE_CONFIRMED" },
    ...over,
  };
}

test("latest-runtime-like fixture classifies sample gate passed but quality weak", () => {
  const result = evaluateMtfExactZoneFailureAttribution(runtimeLike());

  assert.equal(result.sample.sampleGatePassed, true);
  assert.equal(result.status, "GEOMETRY_PROMISING_EXECUTION_WEAK");
  assert.equal(result.cleanSubsetGate.status, "NOT_READY");
  assert.equal(result.activationAllowed, false);
  assert.equal(result.paperActivationAllowed, false);
  assert.equal(result.liveActivationAllowed, false);
  assert.equal(result.reviewOnly, true);
  assert.equal(result.shadowOnly, true);
  const codes = result.failureAttribution.dominantFailures.map((failure) => failure.code);
  assert.ok(codes.includes("TARGET_TOO_CLOSE_DOMINATES"));
  assert.ok(codes.includes("MISSED_FILL_DOMINATES"));
  assert.ok(codes.includes("TARGET_AFTER_TOUCH_NOT_PROVEN"));
  assert.ok(codes.includes("CURRENT_PRICE_ELIGIBLE_MISSING"));
});

test("insufficient lifetime sample keeps sample gate blocked", () => {
  const result = evaluateMtfExactZoneFailureAttribution(runtimeLike({
    mtfEntryCandidatePipeline: {
      sampleAccounting: {
        lifetimeExactSamples: 80,
        windowExactSamples: 65,
        currentPriceEligibleExactSamples: null,
        reviewTargetSamples: 100,
      },
    },
  }));

  assert.equal(result.sample.sampleGatePassed, false);
  assert.notEqual(result.status, "CLEAN_CANDIDATE_REVIEW_READY_NOT_ACTIVATION");
  assert.equal(result.activationAllowed, false);
});

test("good geometry with high missed fill is not clean", () => {
  const result = evaluateMtfExactZoneFailureAttribution(runtimeLike({
    exactZoneComparisonSummary: {
      exactSamples: 120,
      exactAvgNetRR: 4.5,
      heuristicAvgNetRR: 1.5,
      avgExactVsHeuristicDelta: 3,
      exactReadinessCounts: { TARGET_TOO_CLOSE: 10 },
      conflictBreakdown: { TARGET_TOO_CLOSE: 10, COST_TOO_HIGH: 0, CONFLICTING_MTF: 0, other: {} },
      fillResolution: { missedFillRate: 0.7 },
    },
    shadowOutcomeSummary: {
      shadowOutcomes: {
        totalSetups: 120,
        entryTouched: 60,
        entryTouchRate: 0.5,
        targetAfterEntryTouchRate: 0.4,
        invalidationAfterEntryTouchRate: 0.2,
      },
    },
  }));

  assert.equal(result.geometryEdge.status, "GEOMETRY_EDGE_STRONG");
  assert.equal(result.cleanSubsetGate.status, "NOT_READY");
  assert.ok(result.cleanSubsetGate.failed.some((item) => item.includes("missedFillRate")));
});

test("clean subset candidate is review ready only, never activation", () => {
  const result = evaluateMtfExactZoneFailureAttribution(runtimeLike({
    mtfEntryCandidatePipeline: {
      sampleAccounting: {
        lifetimeExactSamples: 140,
        windowExactSamples: 110,
        currentPriceEligibleExactSamples: 18,
        reviewTargetSamples: 100,
      },
    },
    exactZoneComparisonSummary: {
      exactSamples: 110,
      exactAvgNetRR: 3.2,
      heuristicAvgNetRR: 1.5,
      avgExactVsHeuristicDelta: 1.7,
      exactReadinessCounts: { TARGET_TOO_CLOSE: 20 },
      conflictBreakdown: { TARGET_TOO_CLOSE: 20, COST_TOO_HIGH: 0, CONFLICTING_MTF: 0, other: {} },
      fillResolution: { missedFillRate: 0.24 },
    },
    shadowOutcomeSummary: {
      shadowOutcomes: {
        totalSetups: 110,
        entryTouched: 50,
        entryTouchRate: 0.4545,
        targetAfterEntryTouchRate: 0.36,
        invalidationAfterEntryTouchRate: 0.18,
      },
    },
  }));

  assert.equal(result.status, "CLEAN_CANDIDATE_REVIEW_READY_NOT_ACTIVATION");
  assert.equal(result.cleanSubsetGate.status, "REVIEW_READY_NOT_ACTIVATION");
  assert.equal(result.activationAllowed, false);
  assert.equal(result.paperActivationAllowed, false);
  assert.equal(result.liveActivationAllowed, false);
});

test("no data returns safe NO_DATA", () => {
  const result = evaluateMtfExactZoneFailureAttribution({});

  assert.equal(result.status, "NO_DATA");
  assert.equal(result.sample.sampleGatePassed, false);
  assert.equal(result.activationAllowed, false);
});

test("helper does not mutate input", () => {
  const fixture = runtimeLike();
  const before = JSON.stringify(fixture);
  evaluateMtfExactZoneFailureAttribution(fixture);
  assert.equal(JSON.stringify(fixture), before);
});
