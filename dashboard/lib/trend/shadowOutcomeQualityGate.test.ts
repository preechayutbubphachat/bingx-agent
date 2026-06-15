// dashboard/lib/trend/shadowOutcomeQualityGate.test.ts
// Run: node --test --experimental-strip-types lib/trend/shadowOutcomeQualityGate.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_SHADOW_OUTCOME_QUALITY_GATE_THRESHOLDS,
  emptyShadowOutcomeQualityGate,
  evaluateShadowOutcomeQualityGate,
} from "./shadowOutcomeQualityGate.ts";
import type { ShadowOutcomeBucket, ShadowOutcomeSummary } from "./shadowOutcomeResolver.ts";

function bucket(over: Partial<ShadowOutcomeBucket> = {}): ShadowOutcomeBucket {
  return {
    totalSetups: 0,
    geometryReady: 0,
    noGeometry: 0,
    pending: 0,
    insufficientFutureCandles: 0,
    entryNotReached: 0,
    invalidationFirst: 0,
    entryTouched: 0,
    entryTouchRate: null,
    entryNotReachedRate: null,
    invalidationFirstRate: null,
    targetAfterEntryTouchRate: null,
    invalidationAfterEntryTouchRate: null,
    timeoutAfterEntryTouchRate: null,
    ...over,
  };
}

function summary(over: Partial<ShadowOutcomeSummary> = {}): ShadowOutcomeSummary {
  return {
    schemaVersion: 1,
    source: "SHADOW_OUTCOME_SUMMARY_V1",
    shadowOutcomes: bucket(),
    splitByCanonicalRegime: {},
    splitByPriceVsGrid: {},
    splitByDynamicGridStatus: {},
    settings: { entryLookahead: 12, exitLookahead: 48 },
    disclaimer: "Shadow outcome evidence - not real trades",
    ...over,
  };
}

test("empty gate is fail-closed review-only", () => {
  const gate = emptyShadowOutcomeQualityGate();
  assert.equal(gate.status, "NO_DATA");
  assert.equal(gate.readiness, "REVIEW_NOT_ACTIVATION");
  assert.equal(gate.activationAllowed, false);
  assert.equal(gate.reviewOnly, true);
  assert.equal(gate.thresholds.rangeMinSample, 10);
});

test("runtime-like fixture headlines UNKNOWN_CONTEXT_DOMINATES instead of EARLY_SAMPLE", () => {
  const s = summary({
    shadowOutcomes: bucket({
      totalSetups: 192,
      geometryReady: 57,
      pending: 12,
      entryTouched: 5,
      entryTouchRate: 0.026,
      targetAfterEntryTouchRate: 0,
      invalidationAfterEntryTouchRate: 1,
    }),
    splitByCanonicalRegime: {
      UNKNOWN: bucket({ totalSetups: 151, pending: 12 }),
      UPTREND: bucket({ totalSetups: 30, entryTouched: 3, entryNotReached: 28, targetAfterEntryTouchRate: 0, invalidationAfterEntryTouchRate: 1 }),
      DOWNTREND: bucket({ totalSetups: 11, entryTouched: 2, invalidationFirst: 12, targetAfterEntryTouchRate: 0, invalidationAfterEntryTouchRate: 1 }),
    },
    splitByPriceVsGrid: {
      BELOW_GRID: bucket({ totalSetups: 120 }),
      INSIDE_GRID: bucket({ totalSetups: 72 }),
    },
    splitByDynamicGridStatus: {
      REGRID_REQUIRED: bucket({ totalSetups: 120 }),
      ACTIVE_GRID: bucket({ totalSetups: 72 }),
    },
  });

  const before = JSON.stringify(s);
  const gate = evaluateShadowOutcomeQualityGate(s);

  assert.equal(JSON.stringify(s), before, "helper must not mutate input");
  assert.equal(gate.status, "UNKNOWN_CONTEXT_DOMINATES");
  assert.equal(gate.readiness, "REVIEW_NOT_ACTIVATION");
  assert.equal(gate.sampleQuality, "LOW");
  assert.equal(gate.activationAllowed, false);
  assert.equal(gate.reviewOnly, true);
  assert.equal(gate.metrics.contextReadySetups, 41);
  assert.equal(gate.metrics.unknownContextSetups, 151);
  assert.equal(gate.metrics.unknownContextPct, 0.7865);
  assert.equal(gate.metrics.contextReadyResolved, 45);
  assert.ok(gate.failedGates.includes("range_subset_missing"));
  assert.ok(gate.warnings.includes("LOW_ENTRY_TOUCH_SAMPLE"));
  assert.ok(gate.warnings.includes("TARGET_NOT_OUTPERFORMING_INVALIDATION"));
});

test("EARLY_SAMPLE uses contextReadySetups only", () => {
  const gate = evaluateShadowOutcomeQualityGate(
    summary({
      shadowOutcomes: bucket({ totalSetups: 40, entryTouched: 30 }),
      splitByCanonicalRegime: {
        UNKNOWN: bucket({ totalSetups: 11 }),
        UPTREND: bucket({ totalSetups: 29, entryTouched: 30 }),
      },
      splitByPriceVsGrid: { INSIDE_GRID: bucket({ totalSetups: 40 }) },
      splitByDynamicGridStatus: { ACTIVE_GRID: bucket({ totalSetups: 40 }) },
    }),
  );

  assert.equal(gate.metrics.contextReadySetups, 29);
  assert.equal(gate.status, "EARLY_SAMPLE");
});

test("low entry-touch sample warns but does not headline WARNING_DEGRADED", () => {
  const gate = evaluateShadowOutcomeQualityGate(
    summary({
      shadowOutcomes: bucket({
        totalSetups: 80,
        entryTouched: 5,
        targetAfterEntryTouchRate: 0,
        invalidationAfterEntryTouchRate: 1,
      }),
      splitByCanonicalRegime: {
        RANGE: bucket({ totalSetups: 20, entryTouched: 2, entryNotReached: 18 }),
        UPTREND: bucket({ totalSetups: 30, entryTouched: 2, entryNotReached: 28 }),
        DOWNTREND: bucket({ totalSetups: 30, entryTouched: 1, entryNotReached: 29 }),
      },
      splitByPriceVsGrid: {
        INSIDE_GRID: bucket({ totalSetups: 40 }),
        ABOVE_GRID: bucket({ totalSetups: 40 }),
      },
      splitByDynamicGridStatus: {
        ACTIVE_GRID: bucket({ totalSetups: 40 }),
        REGRID_REQUIRED: bucket({ totalSetups: 40 }),
      },
    }),
  );

  assert.notEqual(gate.status, "WARNING_DEGRADED");
  assert.ok(gate.warnings.includes("LOW_ENTRY_TOUCH_SAMPLE"));
  assert.ok(gate.warnings.includes("TARGET_NOT_OUTPERFORMING_INVALIDATION"));
});

test("WARNING_DEGRADED only headlines after enough entry-touch sample", () => {
  const gate = evaluateShadowOutcomeQualityGate(
    summary({
      shadowOutcomes: bucket({
        totalSetups: 80,
        entryTouched: 20,
        targetAfterEntryTouchRate: 0.2,
        invalidationAfterEntryTouchRate: 0.6,
      }),
      splitByCanonicalRegime: {
        RANGE: bucket({ totalSetups: 20, entryTouched: 5, entryNotReached: 15 }),
        UPTREND: bucket({ totalSetups: 30, entryTouched: 8, entryNotReached: 22 }),
        DOWNTREND: bucket({ totalSetups: 30, entryTouched: 7, entryNotReached: 23 }),
      },
      splitByPriceVsGrid: {
        INSIDE_GRID: bucket({ totalSetups: 40 }),
        ABOVE_GRID: bucket({ totalSetups: 40 }),
      },
      splitByDynamicGridStatus: {
        ACTIVE_GRID: bucket({ totalSetups: 40 }),
        REGRID_REQUIRED: bucket({ totalSetups: 40 }),
      },
    }),
  );

  assert.equal(gate.status, "WARNING_DEGRADED");
  assert.equal(gate.readiness, "REVIEW_NOT_ACTIVATION");
  assert.equal(gate.activationAllowed, false);
});

test("default thresholds match approved rescue settings", () => {
  assert.deepEqual(DEFAULT_SHADOW_OUTCOME_QUALITY_GATE_THRESHOLDS, {
    minContextReadySetups: 30,
    minContextReadyResolved: 30,
    minDistinctRegimes: 2,
    rangeSubsetRequired: true,
    rangeMinSample: 10,
    unknownDominanceLimit: 0.5,
    priceContextDiversityRequired: true,
    dynamicGridContextDiversityRequired: true,
    minEntryTouchForPerf: 20,
  });
});
