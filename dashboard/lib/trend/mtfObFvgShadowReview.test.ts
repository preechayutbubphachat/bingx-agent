import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { emptyMtfObFvgShadowSnapshotSummary, type MtfObFvgShadowSnapshotSummary } from "./mtfObFvgShadowSnapshot.ts";
import { reviewMtfObFvgShadowSummary } from "./mtfObFvgShadowReview.ts";

function summary(overrides: Partial<MtfObFvgShadowSnapshotSummary>): MtfObFvgShadowSnapshotSummary {
  return {
    ...emptyMtfObFvgShadowSnapshotSummary(),
    available: true,
    totalShadowSamples: 60,
    averageCurrentNetRR: 1.1,
    averageRefinedNetRR: 1.4,
    averageNetRrImprovement: 0.3,
    passNetCount: 45,
    qualityScoreAverage: 70,
    classificationCounts: { REFINEMENT_IMPROVES_RR: 60 },
    dataStatusCounts: { HEURISTIC_ESTIMATE_ONLY: 60 },
    sampleWarning: false,
    ...overrides,
  };
}

describe("reviewMtfObFvgShadowSummary", () => {
  it("returns observe-only no-data diagnostics", () => {
    const review = reviewMtfObFvgShadowSummary(emptyMtfObFvgShadowSnapshotSummary());
    assert.equal(review.sampleCount, 0);
    assert.equal(review.sampleTier, "INSUFFICIENT_LT_50");
    assert.equal(review.evidenceGrade, "NO_DATA");
    assert.equal(review.readiness, "OBSERVE_ONLY");
    assert.equal(review.exactZoneReadiness, "MISSING_REQUIRED_DATA");
    assert.equal(review.paperActivationAllowed, false);
    assert.equal(review.liveActivationAllowed, false);
    assert.equal(review.exchangeOrderAllowed, false);
  });

  it("keeps fewer than 50 samples in weak continue-logging state", () => {
    const review = reviewMtfObFvgShadowSummary(summary({ totalShadowSamples: 49, passNetCount: 40, sampleWarning: true }));
    assert.equal(review.sampleTier, "INSUFFICIENT_LT_50");
    assert.equal(review.evidenceGrade, "WEAK");
    assert.equal(review.readiness, "CONTINUE_LOGGING");
    assert.match(review.warnings.join(" "), /below the 50-sample/);
  });

  it("classifies 50-99 strong shadow metrics as promising", () => {
    const review = reviewMtfObFvgShadowSummary(summary({ totalShadowSamples: 80, passNetCount: 64 }));
    assert.equal(review.sampleTier, "EARLY_PATTERN_50_TO_99");
    assert.equal(review.passNetRate, 0.8);
    assert.equal(review.evidenceGrade, "PROMISING");
    assert.equal(review.readiness, "EXACT_ZONE_DETECTOR_RECOMMENDED");
  });

  it("classifies 100+ strong shadow metrics as strong shadow review-ready", () => {
    const review = reviewMtfObFvgShadowSummary(summary({ totalShadowSamples: 120, passNetCount: 96 }));
    assert.equal(review.sampleTier, "REVIEW_READY_100_PLUS");
    assert.equal(review.evidenceGrade, "STRONG_SHADOW");
    assert.equal(review.readiness, "ELIGIBLE_FOR_REVIEW_AFTER_100");
  });

  it("requires exact zone data before controlled activation", () => {
    const review = reviewMtfObFvgShadowSummary(summary({ totalShadowSamples: 120, passNetCount: 96 }));
    assert.equal(review.exactZoneReadiness, "HEURISTIC_ONLY");
    assert.match(review.warnings.join(" "), /Exact OB\/FVG coordinates are required/);
  });

  it("detects partial and exact zone readiness from data status counts", () => {
    const partial = reviewMtfObFvgShadowSummary(
      summary({ dataStatusCounts: { ACTUAL_OB_FVG_AVAILABLE: 20, HEURISTIC_ESTIMATE_ONLY: 40 } }),
    );
    assert.equal(partial.exactZoneReadiness, "PARTIAL_DATA_ONLY");

    const exact = reviewMtfObFvgShadowSummary(
      summary({ dataStatusCounts: { ACTUAL_OB_FVG_AVAILABLE: 80 }, totalShadowSamples: 80, passNetCount: 60 }),
    );
    assert.equal(exact.exactZoneReadiness, "EXACT_ZONE_READY");
  });

  it("reports dominant data status and classification by count", () => {
    const review = reviewMtfObFvgShadowSummary(
      summary({
        classificationCounts: { COST_DRAG_DOMINANT: 10, REFINEMENT_IMPROVES_RR: 40 },
        dataStatusCounts: { INSUFFICIENT_DATA: 5, HEURISTIC_ESTIMATE_ONLY: 55 },
      }),
    );
    assert.equal(review.classificationDominant, "REFINEMENT_IMPROVES_RR");
    assert.equal(review.dataStatusDominant, "HEURISTIC_ESTIMATE_ONLY");
  });
});
