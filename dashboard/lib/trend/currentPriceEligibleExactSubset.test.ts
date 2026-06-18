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

test("consumes exactCandidateGeometrySnapshot candidates as the preferred geometry source", () => {
  const result = evaluateCurrentPriceEligibleExactSubset(baseInput({
    exactCandidateGeometrySnapshot: {
      schemaVersion: 1,
      source: "EXACT_CANDIDATE_GEOMETRY_SNAPSHOT_V1",
      capturedAt: "2026-06-18T05:00:00.000Z",
      candidates: [{
        id: "snapshot-long-clean",
        direction: "LONG",
        zoneType: "OB_FVG_OVERLAP",
        readiness: "READY",
        entry: 100,
        entryLow: 99.9,
        entryHigh: 100.2,
        stopLoss: 98,
        invalidation: 98,
        target1: 103,
        netRR: 1.6,
        flags: [],
      }],
    },
  }));

  assert.equal(result.sampleAccounting.currentPriceEligibleExactSamples, 1);
  assert.equal(result.topCandidates[0]?.id, "snapshot-long-clean");
  assert.equal(result.topCandidates[0]?.zoneType, "OB_FVG_OVERLAP");
  assert.equal(result.topCandidates[0]?.readiness, "READY");
  assert.deepEqual(result.topCandidates[0]?.flags, []);
  assert.equal(result.activationAllowed, false);
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
      target1: 110,
      netRR: 1.5,
    }],
  }));

  assert.equal(result.topCandidates[0]?.status, "MISSED");
  assert.equal(result.status, "NO_CURRENT_PRICE_ELIGIBLE_CANDIDATES");
});

test("SHORT below entry waits for pullback and keeps target-too-close as quality status", () => {
  const result = evaluateCurrentPriceEligibleExactSubset(baseInput({
    currentPriceContext: {
      ...freshContext,
      currentPrice: 62_778,
      priceSource: "mtfEntryCandidatePipeline.currentPriceContext",
    },
    exactCandidateGeometrySnapshot: {
      schemaVersion: 1,
      source: "EXACT_CANDIDATE_GEOMETRY_SNAPSHOT_V1",
      currentPrice: null,
      priceSource: null,
      freshnessStatus: "UNKNOWN",
      candidates: [{
        id: "short-runtime-target-close",
        direction: "SHORT",
        zoneType: "OB_FVG_OVERLAP",
        readiness: "TARGET_TOO_CLOSE",
        entry: 63_654.92,
        stopLoss: 64_876.7,
        target1: 62_232.6,
        netRR: 0.9,
        flags: ["TARGET_TOO_CLOSE"],
      }],
    },
  }));

  assert.equal(result.sampleAccounting.currentPriceEligibleExactSamples, 0);
  assert.equal(result.topCandidates[0]?.currentPriceStatus, "WAITING_PULLBACK_TO_ENTRY");
  assert.equal(result.topCandidates[0]?.qualityStatus, "TARGET_TOO_CLOSE");
  assert.equal(result.topCandidates[0]?.priceMoveRequiredDirection, "UP_TO_ENTRY");
  assert.equal(result.topCandidates[0]?.distanceToEntryPct, 1.3969);
  assert.equal(result.topCandidates[0]?.distanceToEntryAbs, 876.92);
  assert.match(result.topCandidates[0]?.reason ?? "", /ราคาอยู่ต่ำกว่าโซน entry ของ SHORT/);
  assert.equal(result.status, "NO_CURRENT_PRICE_ELIGIBLE_CANDIDATES");
});

test("LONG above entry waits for pullback down to entry", () => {
  const result = evaluateCurrentPriceEligibleExactSubset(baseInput({
    currentPriceContext: { ...freshContext, currentPrice: 105 },
    exactCandidateRecords: [{
      id: "long-waiting-pullback",
      direction: "LONG",
      entryLow: 99.8,
      entryHigh: 100,
      stopLoss: 98,
      target1: 110,
      netRR: 1.5,
    }],
  }));

  assert.equal(result.topCandidates[0]?.currentPriceStatus, "WAITING_PULLBACK_TO_ENTRY");
  assert.equal(result.topCandidates[0]?.priceMoveRequiredDirection, "DOWN_TO_ENTRY");
  assert.equal(result.sampleAccounting.currentPriceEligibleExactSamples, 0);
});

test("deduplicates repeated candidate geometry for presentation and counts occurrences", () => {
  const repeated = {
    id: "duplicate-a",
    direction: "LONG",
    zoneType: "OB_FVG_OVERLAP",
    readiness: "READY",
    entry: 100,
    stopLoss: 98,
    target1: 103,
    netRR: 1.6,
  };
  const result = evaluateCurrentPriceEligibleExactSubset(baseInput({
    exactCandidateRecords: [
      repeated,
      { ...repeated, id: "duplicate-b" },
      { ...repeated, id: "duplicate-c", entry: 100.0004 },
    ],
  }));

  assert.equal(result.dedupSummary.rawCandidates, 3);
  assert.equal(result.dedupSummary.uniqueCandidates, 1);
  assert.equal(result.dedupSummary.duplicateCandidates, 2);
  assert.equal(result.topCandidates.length, 1);
  assert.equal(result.topCandidates[0]?.occurrenceCount, 3);
});

test("audits when subset price source differs from geometry snapshot price source", () => {
  const result = evaluateCurrentPriceEligibleExactSubset(baseInput({
    currentPriceContext: { ...freshContext, currentPrice: 100, priceSource: "runtime.currentPriceContext" },
    exactCandidateGeometrySnapshot: {
      schemaVersion: 1,
      source: "EXACT_CANDIDATE_GEOMETRY_SNAPSHOT_V1",
      currentPrice: null,
      priceSource: null,
      freshnessStatus: "UNKNOWN",
      candidates: [{
        id: "snapshot-price-missing",
        direction: "LONG",
        entry: 100,
        stopLoss: 98,
        target1: 103,
        netRR: 1.6,
      }],
    },
  }));

  assert.equal(result.priceSourceAudit.subsetPriceSource, "runtime.currentPriceContext");
  assert.equal(result.priceSourceAudit.snapshotPriceSource, "not_available_at_snapshot_build");
  assert.equal(result.priceSourceAudit.subsetCurrentPrice, 100);
  assert.equal(result.priceSourceAudit.snapshotCurrentPrice, null);
  assert.equal(result.priceSourceAudit.priceSourceConsistent, false);
  assert.ok(result.priceSourceAudit.notes.some((note) => note.includes("currentPriceContext")));
});

test("clean near-entry candidate exposes clean quality and current-price status separately", () => {
  const result = evaluateCurrentPriceEligibleExactSubset(baseInput({
    currentPriceContext: { ...freshContext, currentPrice: 100.1 },
    exactCandidateRecords: [{
      id: "clean-near-entry",
      direction: "LONG",
      entryLow: 100,
      entryHigh: 100.2,
      stopLoss: 98,
      target1: 104,
      netRR: 1.8,
    }],
  }));

  assert.equal(result.topCandidates[0]?.currentPriceStatus, "INSIDE_ENTRY_ZONE");
  assert.equal(result.topCandidates[0]?.qualityStatus, "CLEAN");
  assert.equal(result.topCandidates[0]?.status, "CLEAN_REVIEW_ONLY");
  assert.equal(result.sampleAccounting.currentPriceEligibleExactSamples, 1);
  assert.equal(result.activationAllowed, false);
  assert.equal(result.paperActivationAllowed, false);
  assert.equal(result.liveActivationAllowed, false);
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
