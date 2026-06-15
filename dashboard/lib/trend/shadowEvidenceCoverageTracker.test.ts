// dashboard/lib/trend/shadowEvidenceCoverageTracker.test.ts
// Run: node --test --experimental-strip-types lib/trend/shadowEvidenceCoverageTracker.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import {
  emptyShadowEvidenceCoverageTracker,
  evaluateShadowEvidenceCoverage,
  type ShadowEvidenceCoverageRequirementId,
} from "./shadowEvidenceCoverageTracker.ts";
import {
  DEFAULT_SHADOW_OUTCOME_QUALITY_GATE_THRESHOLDS,
  emptyShadowOutcomeQualityGate,
  type ShadowOutcomeQualityGate,
} from "./shadowOutcomeQualityGate.ts";

function gate(over: Partial<ShadowOutcomeQualityGate> = {}): ShadowOutcomeQualityGate {
  return {
    schemaVersion: 1,
    source: "SHADOW_OUTCOME_QUALITY_GATE_V1",
    status: "CONTEXT_BIASED",
    readiness: "REVIEW_NOT_ACTIVATION",
    verdict: "CONTEXT_BIASED - review only, not activation.",
    sampleQuality: "MEDIUM",
    activationAllowed: false,
    reviewOnly: true,
    metrics: {
      totalSetups: 0,
      geometryReady: 0,
      resolvedOutcomes: 0,
      contextReadySetups: 0,
      unknownContextSetups: 0,
      unknownContextPct: null,
      contextReadyResolved: 0,
      distinctRegimes: 0,
      rangeSetups: 0,
      hasRangeSubset: false,
      distinctPriceContexts: 0,
      distinctDynamicGridContexts: 0,
      dominantPriceVsGrid: null,
      dominantDynamicGridStatus: null,
      entryTouched: 0,
      entryTouchRate: null,
      entryNotReachedRate: null,
      invalidationFirstRate: null,
      targetAfterEntryTouchRate: null,
      invalidationAfterEntryTouchRate: null,
      timeoutAfterEntryTouchRate: null,
    },
    thresholds: DEFAULT_SHADOW_OUTCOME_QUALITY_GATE_THRESHOLDS,
    passedGates: [],
    failedGates: [],
    warnings: [],
    nextAction: "continue_collecting_shadow_outcomes_without_activation",
    ...over,
  };
}

function requirement(tracker: ReturnType<typeof evaluateShadowEvidenceCoverage>, id: ShadowEvidenceCoverageRequirementId) {
  const r = tracker.requirements.find((item) => item.id === id);
  assert.ok(r, `missing requirement ${id}`);
  return r;
}

test("empty tracker is fail-closed and review-only", () => {
  const tracker = emptyShadowEvidenceCoverageTracker();
  assert.equal(tracker.status, "NO_DATA");
  assert.equal(tracker.coverageScore, 0);
  assert.equal(tracker.requirementsMet, 0);
  assert.equal(tracker.requirementsTotal, 7);
  assert.equal(tracker.activationAllowed, false);
  assert.equal(tracker.reviewOnly, true);
});

test("null or NO_DATA gate returns empty coverage", () => {
  assert.equal(evaluateShadowEvidenceCoverage(null).status, "NO_DATA");
  assert.equal(evaluateShadowEvidenceCoverage(emptyShadowOutcomeQualityGate()).status, "NO_DATA");
});

test("current runtime fixture returns expected remaining requirements", () => {
  const tracker = evaluateShadowEvidenceCoverage(
    gate({
      status: "UNKNOWN_CONTEXT_DOMINATES",
      sampleQuality: "LOW",
      metrics: {
        ...gate().metrics,
        totalSetups: 192,
        contextReadySetups: 48,
        contextReadyResolved: 39,
        unknownContextSetups: 144,
        unknownContextPct: 0.75,
        rangeSetups: 0,
        entryTouched: 5,
        distinctPriceContexts: 1,
        distinctDynamicGridContexts: 1,
      },
    }),
  );

  assert.equal(tracker.status, "NOT_READY");
  assert.equal(tracker.coverageScore, 0.2857);
  assert.equal(tracker.requirementsMet, 2);
  assert.equal(tracker.requirementsTotal, 7);
  assert.equal(tracker.nextEvidenceMilestone?.id, "PRICE_CONTEXT_DIVERSITY");
  assert.equal(tracker.activationAllowed, false);
  assert.equal(tracker.reviewOnly, true);
  assert.equal(requirement(tracker, "context_ready_setups").remaining, 0);
  assert.equal(requirement(tracker, "context_ready_resolved").remaining, 0);
  assert.equal(requirement(tracker, "price_context_diversity").remaining, 1);
  assert.equal(requirement(tracker, "dynamic_grid_diversity").remaining, 1);
  assert.equal(requirement(tracker, "range_subset").remaining, 10);
  assert.equal(requirement(tracker, "entry_touch").remaining, 15);
  assert.equal(requirement(tracker, "unknown_context_dilution").remaining, 97);
});

test("ready path has full coverage and no next milestone", () => {
  const tracker = evaluateShadowEvidenceCoverage(
    gate({
      status: "REVIEW_READY",
      metrics: {
        ...gate().metrics,
        totalSetups: 100,
        contextReadySetups: 90,
        contextReadyResolved: 70,
        unknownContextSetups: 10,
        unknownContextPct: 0.1,
        rangeSetups: 10,
        entryTouched: 20,
        distinctPriceContexts: 2,
        distinctDynamicGridContexts: 2,
      },
    }),
  );

  assert.equal(tracker.status, "READY");
  assert.equal(tracker.coverageScore, 1);
  assert.equal(tracker.requirementsMet, 7);
  assert.equal(tracker.nextEvidenceMilestone, null);
});

test("unknown dilution is strict when pct equals the limit", () => {
  const tracker = evaluateShadowEvidenceCoverage(
    gate({
      metrics: {
        ...gate().metrics,
        totalSetups: 20,
        contextReadySetups: 10,
        unknownContextSetups: 10,
        unknownContextPct: 0.5,
      },
    }),
  );

  const unknown = requirement(tracker, "unknown_context_dilution");
  assert.equal(unknown.current, 20);
  assert.equal(unknown.target, 21);
  assert.equal(unknown.remaining, 1);
  assert.equal(unknown.met, false);
});

test("remaining values clamp at zero", () => {
  const tracker = evaluateShadowEvidenceCoverage(
    gate({
      metrics: {
        ...gate().metrics,
        totalSetups: 500,
        contextReadySetups: 100,
        contextReadyResolved: 100,
        unknownContextSetups: 1,
        unknownContextPct: 0.002,
        rangeSetups: 50,
        entryTouched: 50,
        distinctPriceContexts: 5,
        distinctDynamicGridContexts: 5,
      },
    }),
  );

  for (const r of tracker.requirements) assert.ok(r.remaining >= 0, `${r.id} remaining must not be negative`);
});

test("helper does not mutate the input", () => {
  const input = gate({
    metrics: {
      ...gate().metrics,
      totalSetups: 192,
      unknownContextSetups: 144,
      unknownContextPct: 0.75,
    },
  });
  const before = JSON.stringify(input);
  evaluateShadowEvidenceCoverage(input);
  assert.equal(JSON.stringify(input), before);
});

test("activationAllowed and reviewOnly are invariant for all inputs", () => {
  for (const input of [null, emptyShadowOutcomeQualityGate(), gate()]) {
    const tracker = evaluateShadowEvidenceCoverage(input);
    assert.equal(tracker.activationAllowed, false);
    assert.equal(tracker.reviewOnly, true);
  }
});

test("requirement ids, units, and notes avoid forbidden public vocabulary", () => {
  const tracker = evaluateShadowEvidenceCoverage(gate());
  const publicText = JSON.stringify({
    requirements: tracker.requirements,
    nextEvidenceMilestone: tracker.nextEvidenceMilestone,
    notes: tracker.notes,
  });
  assert.doesNotMatch(publicText, /fill|trade|order|position|closedTrade/i);
});

test("next milestone priority selects price context first when multiple requirements remain", () => {
  const tracker = evaluateShadowEvidenceCoverage(
    gate({
      metrics: {
        ...gate().metrics,
        totalSetups: 192,
        contextReadySetups: 48,
        contextReadyResolved: 39,
        unknownContextSetups: 144,
        unknownContextPct: 0.75,
        rangeSetups: 0,
        entryTouched: 5,
        distinctPriceContexts: 1,
        distinctDynamicGridContexts: 1,
      },
    }),
  );
  assert.equal(tracker.nextEvidenceMilestone?.id, "PRICE_CONTEXT_DIVERSITY");
});
