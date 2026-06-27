import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateHistoricalReplayCandidateScarcityReview,
  type HistoricalReplayPoint,
} from "./historicalReplayCandidateScarcityReview.ts";

type Stage =
  | "NO_ALIGNED_CONTEXT"
  | "ALIGNED_NO_CANDIDATE"
  | "RR_REJECTED"
  | "WAITING_TRIGGER"
  | "TRIGGER_NO_TOUCH"
  | "TOUCH_EXPIRED"
  | "CONFIRMATION_PENDING"
  | "PROMOTABLE";

function evaluatedAt(index: number): string {
  return new Date(Date.UTC(2026, 0, 1, 0, index * 5)).toISOString();
}

function point(
  index: number,
  stage: Stage = "WAITING_TRIGGER",
  overrides: Partial<HistoricalReplayPoint> = {},
): HistoricalReplayPoint {
  const common = {
    evaluatedAt: evaluatedAt(index),
    sourceSafetyValid: true,
    dataQualityValid: true,
  } as const;

  const stages: Record<Stage, Omit<HistoricalReplayPoint, keyof typeof common>> = {
    NO_ALIGNED_CONTEXT: {
      alignedContext: false,
      d8_0AlignedCandidate: false,
      rrReady: false,
      d8_2Status: "NO_GATE",
      triggerReached: false,
      d8_3Status: "NO_TRIGGER_CONTEXT",
      zoneTouched: false,
      confirmationWindowActive: false,
      d8_4Status: "NO_TOUCH_CONTEXT",
      confirmationAligned: false,
      promotableReviewCandidate: false,
      bottleneckStatus: "NO_CONTEXT",
      triggerDistanceClass: "UNKNOWN",
    },
    ALIGNED_NO_CANDIDATE: {
      alignedContext: true,
      d8_0AlignedCandidate: false,
      rrReady: false,
      d8_2Status: "NO_GATE",
      triggerReached: false,
      d8_3Status: "NO_TRIGGER_CONTEXT",
      zoneTouched: false,
      confirmationWindowActive: false,
      d8_4Status: "NO_TOUCH_CONTEXT",
      confirmationAligned: false,
      promotableReviewCandidate: false,
      bottleneckStatus: "NO_CONTEXT",
      triggerDistanceClass: "UNKNOWN",
    },
    RR_REJECTED: {
      alignedContext: true,
      d8_0AlignedCandidate: true,
      rrReady: false,
      d8_2Status: "NO_GATE",
      triggerReached: false,
      d8_3Status: "NO_TRIGGER_CONTEXT",
      zoneTouched: false,
      confirmationWindowActive: false,
      d8_4Status: "NO_TOUCH_CONTEXT",
      confirmationAligned: false,
      promotableReviewCandidate: false,
      bottleneckStatus: "RR_NOT_READY",
      triggerDistanceClass: "UNKNOWN",
    },
    WAITING_TRIGGER: {
      alignedContext: true,
      d8_0AlignedCandidate: true,
      rrReady: true,
      d8_2Status: "WAITING_FOR_TRIGGER_PRICE",
      triggerReached: false,
      d8_3Status: "NO_TOUCH_YET",
      zoneTouched: false,
      confirmationWindowActive: false,
      d8_4Status: "TOUCH_WINDOW_INACTIVE",
      confirmationAligned: false,
      promotableReviewCandidate: false,
      bottleneckStatus: "WAITING_FOR_PULLBACK_TRIGGER",
      triggerDistanceClass: "FAR",
    },
    TRIGGER_NO_TOUCH: {
      alignedContext: true,
      d8_0AlignedCandidate: true,
      rrReady: true,
      d8_2Status: "READY_FOR_CONFIRMATION_REVIEW",
      triggerReached: true,
      d8_3Status: "NO_TOUCH_YET",
      zoneTouched: false,
      confirmationWindowActive: false,
      d8_4Status: "TOUCH_WINDOW_INACTIVE",
      confirmationAligned: false,
      promotableReviewCandidate: false,
      bottleneckStatus: "NO_TOUCH_EVIDENCE",
      triggerDistanceClass: "AT_TRIGGER",
    },
    TOUCH_EXPIRED: {
      alignedContext: true,
      d8_0AlignedCandidate: true,
      rrReady: true,
      d8_2Status: "INSIDE_RAW_ZONE",
      triggerReached: true,
      d8_3Status: "CONFIRMATION_WINDOW_EXPIRED",
      zoneTouched: true,
      confirmationWindowActive: false,
      d8_4Status: "TOUCH_WINDOW_INACTIVE",
      confirmationAligned: false,
      promotableReviewCandidate: false,
      bottleneckStatus: "TOUCH_WINDOW_EXPIRED",
      triggerDistanceClass: "AT_TRIGGER",
    },
    CONFIRMATION_PENDING: {
      alignedContext: true,
      d8_0AlignedCandidate: true,
      rrReady: true,
      d8_2Status: "INSIDE_RAW_ZONE",
      triggerReached: true,
      d8_3Status: "CONFIRMATION_WINDOW_ACTIVE",
      zoneTouched: true,
      confirmationWindowActive: true,
      d8_4Status: "CONFIRMATION_NOT_ALIGNED",
      confirmationAligned: false,
      promotableReviewCandidate: false,
      bottleneckStatus: "CONFIRMATION_NOT_READY",
      triggerDistanceClass: "AT_TRIGGER",
    },
    PROMOTABLE: {
      alignedContext: true,
      d8_0AlignedCandidate: true,
      rrReady: true,
      d8_2Status: "READY_FOR_CONFIRMATION_REVIEW",
      triggerReached: true,
      d8_3Status: "CONFIRMATION_WINDOW_ACTIVE",
      zoneTouched: true,
      confirmationWindowActive: true,
      d8_4Status: "PROMOTABLE_REVIEW_CANDIDATE",
      confirmationAligned: true,
      promotableReviewCandidate: true,
      bottleneckStatus: "NONE",
      triggerDistanceClass: "AT_TRIGGER",
    },
  };

  return { ...common, ...stages[stage], ...overrides };
}

function points(start: number, count: number, stage: Stage): HistoricalReplayPoint[] {
  return Array.from({ length: count }, (_, offset) => point(start + offset, stage));
}

function evaluate(replayPoints: readonly HistoricalReplayPoint[]) {
  return evaluateHistoricalReplayCandidateScarcityReview({
    timeframe: "5M",
    replayPoints,
  });
}

test("no replay data returns an honest safe default", () => {
  const result = evaluate([]);

  assert.equal(result.status, "NO_REPLAY_DATA");
  assert.equal(result.replayWindow.sampleQuality, "NO_SAMPLE");
  assert.equal(result.funnelCounts.totalEvaluationPoints, 0);
  assert.equal(result.funnelRates.promotableRate, null);
  assert.equal(result.activationAllowed, false);
  assert.equal(result.paperActivationAllowed, false);
  assert.equal(result.liveActivationAllowed, false);
  assert.equal(result.reviewOnly, true);
  assert.equal(result.shadowOnly, true);
});

test("sample quality boundaries are exact at 0, 100, and 500", () => {
  const cases: Array<[number, string, string]> = [
    [1, "LOW_SAMPLE", "INSUFFICIENT_REPLAY_DATA"],
    [99, "LOW_SAMPLE", "INSUFFICIENT_REPLAY_DATA"],
    [100, "EARLY_SAMPLE", "INSUFFICIENT_REPLAY_DATA"],
    [499, "EARLY_SAMPLE", "INSUFFICIENT_REPLAY_DATA"],
    [500, "USABLE_SAMPLE", "PULLBACK_ONLY_BOTTLENECK"],
  ];

  for (const [count, quality, status] of cases) {
    const result = evaluate(points(0, count, "WAITING_TRIGGER"));
    assert.equal(result.replayWindow.sampleQuality, quality, `${count} quality`);
    assert.equal(result.status, status, `${count} status`);
  }
});

test("funnel rates use exact upstream denominators", () => {
  const replayPoints = [
    ...points(0, 2, "NO_ALIGNED_CONTEXT"),
    ...points(2, 2, "ALIGNED_NO_CANDIDATE"),
    ...points(4, 3, "RR_REJECTED"),
    point(7, "WAITING_TRIGGER"),
    point(8, "TRIGGER_NO_TOUCH"),
    point(9, "PROMOTABLE"),
  ];

  const result = evaluate(replayPoints);

  assert.deepEqual(result.funnelCounts, {
    totalEvaluationPoints: 10,
    alignedContextCount: 8,
    d8_0AlignedCandidateCount: 6,
    rrReadyCount: 3,
    waitingForTriggerCount: 1,
    triggerReachedCount: 2,
    zoneTouchedCount: 1,
    confirmationWindowActiveCount: 1,
    confirmationAlignedCount: 1,
    promotableReviewCandidateCount: 1,
  });
  assert.equal(result.funnelRates.alignedContextRate, 8 / 10);
  assert.equal(result.funnelRates.rrReadyRate, 3 / 6);
  assert.equal(result.funnelRates.triggerReachedRate, 2 / 3);
  assert.equal(result.funnelRates.zoneTouchedRate, 1 / 2);
  assert.equal(result.funnelRates.confirmationAlignedRate, 1);
  assert.equal(result.funnelRates.promotableRate, 1 / 10);
});

test("zero upstream denominators produce null downstream rates", () => {
  const result = evaluate(points(0, 10, "NO_ALIGNED_CONTEXT"));

  assert.equal(result.funnelRates.alignedContextRate, 0);
  assert.equal(result.funnelRates.rrReadyRate, null);
  assert.equal(result.funnelRates.triggerReachedRate, null);
  assert.equal(result.funnelRates.zoneTouchedRate, null);
  assert.equal(result.funnelRates.confirmationAlignedRate, null);
  assert.equal(result.funnelRates.promotableRate, 0);
});

test("usable history identifies an RR bottleneck first", () => {
  const replayPoints = [
    ...points(0, 200, "NO_ALIGNED_CONTEXT"),
    ...points(200, 270, "RR_REJECTED"),
    ...points(470, 30, "WAITING_TRIGGER"),
  ];

  const result = evaluate(replayPoints);

  assert.equal(result.status, "RR_BOTTLENECK");
  assert.equal(result.dominantBottleneck, "RR");
  assert.equal(result.hypothesis, "RR_FILTER_TOO_STRICT");
  assert.equal(result.recommendedNextResearch, "REPAIR_RR_ASSUMPTIONS");
});

test("usable history identifies pullback-only scarcity before downstream gaps", () => {
  const replayPoints = [
    ...points(0, 200, "NO_ALIGNED_CONTEXT"),
    ...points(200, 50, "RR_REJECTED"),
    ...points(250, 230, "WAITING_TRIGGER"),
    ...points(480, 20, "TRIGGER_NO_TOUCH"),
  ];

  const result = evaluate(replayPoints);

  assert.equal(result.status, "PULLBACK_ONLY_BOTTLENECK");
  assert.equal(result.dominantBottleneck, "PULLBACK_TRIGGER");
  assert.equal(result.hypothesis, "PULLBACK_ONLY_TOO_STRICT");
  assert.equal(result.recommendedNextResearch, "DESIGN_CONTINUATION_REVIEW_BRANCH");
  assert.equal(result.funnelRates.triggerReachedRate, 20 / 250);

  const early = evaluate(replayPoints.slice(0, 499));
  assert.equal(early.status, "INSUFFICIENT_REPLAY_DATA");
  assert.notEqual(early.recommendedNextResearch, "DESIGN_CONTINUATION_REVIEW_BRANCH");
});

test("trigger reach without enough touches identifies the touch-window bottleneck", () => {
  const replayPoints = [
    ...points(0, 100, "WAITING_TRIGGER"),
    ...points(100, 360, "TRIGGER_NO_TOUCH"),
    ...points(460, 40, "TOUCH_EXPIRED"),
  ];

  const result = evaluate(replayPoints);

  assert.equal(result.status, "TOUCH_WINDOW_BOTTLENECK");
  assert.equal(result.dominantBottleneck, "TOUCH");
  assert.equal(result.hypothesis, "UNDETERMINED");
  assert.equal(result.recommendedNextResearch, "REPAIR_TOUCH_WINDOW");
  assert.equal(result.funnelRates.zoneTouchedRate, 40 / 400);
});

test("active windows without aligned confirmation identify the confirmation bottleneck", () => {
  const replayPoints = [
    ...points(0, 450, "CONFIRMATION_PENDING"),
    ...points(450, 50, "PROMOTABLE"),
  ];

  const result = evaluate(replayPoints);

  assert.equal(result.status, "CONFIRMATION_BOTTLENECK");
  assert.equal(result.dominantBottleneck, "CONFIRMATION");
  assert.equal(result.hypothesis, "CONFIRMATION_TOO_STRICT");
  assert.equal(result.recommendedNextResearch, "REPAIR_CONFIRMATION_RULES");
  assert.equal(result.funnelRates.confirmationAlignedRate, 50 / 500);
});

test("a one-percent promotable rate with healthy stage conversions is replay ready", () => {
  const replayPoints = [
    ...points(0, 375, "NO_ALIGNED_CONTEXT"),
    ...points(375, 100, "TRIGGER_NO_TOUCH"),
    ...points(475, 20, "CONFIRMATION_PENDING"),
    ...points(495, 5, "PROMOTABLE"),
  ];

  const result = evaluate(replayPoints);

  assert.equal(result.funnelRates.zoneTouchedRate, 25 / 125);
  assert.equal(result.funnelRates.confirmationAlignedRate, 5 / 25);
  assert.equal(result.funnelRates.promotableRate, 0.01);
  assert.equal(result.status, "REPLAY_READY");
  assert.equal(result.dominantBottleneck, "NONE");
  assert.equal(result.hypothesis, "PIPELINE_HEALTHY_WAIT_FOR_MARKET");
  assert.equal(result.recommendedNextResearch, "WAIT_FOR_LIVE_PULLBACK");
});

test("below-one-percent promotion is sparse when no stage is below its threshold", () => {
  const replayPoints = [
    ...points(0, 775, "NO_ALIGNED_CONTEXT"),
    ...points(775, 180, "TRIGGER_NO_TOUCH"),
    ...points(955, 36, "CONFIRMATION_PENDING"),
    ...points(991, 9, "PROMOTABLE"),
  ];

  const result = evaluate(replayPoints);

  assert.equal(result.funnelRates.zoneTouchedRate, 45 / 225);
  assert.equal(result.funnelRates.confirmationAlignedRate, 9 / 45);
  assert.equal(result.funnelRates.promotableRate, 0.009);
  assert.equal(result.status, "CANDIDATE_PIPELINE_TOO_SPARSE");
  assert.equal(result.hypothesis, "UNDETERMINED");
  assert.equal(result.recommendedNextResearch, "NO_ACTION");
});

test("contradictory replay points block data-quality conclusions", () => {
  const contradictions: HistoricalReplayPoint[] = [
    point(0, "CONFIRMATION_PENDING", { zoneTouched: false }),
    point(1, "PROMOTABLE", { promotableReviewCandidate: false }),
    point(2, "PROMOTABLE", { confirmationAligned: false }),
    point(3, "CONFIRMATION_PENDING", { confirmationWindowActive: false }),
    point(4, "WAITING_TRIGGER", { evaluatedAt: "not-a-date" }),
    point(5, "WAITING_TRIGGER", { sourceSafetyValid: false }),
    point(6, "WAITING_TRIGGER", { dataQualityValid: false }),
  ];

  for (const replayPoint of contradictions) {
    const result = evaluate([replayPoint]);
    assert.equal(result.status, "DATA_QUALITY_BLOCKED");
    assert.equal(result.dominantBottleneck, "DATA_QUALITY");
    assert.equal(result.hypothesis, "UNDETERMINED");
    assert.equal(result.recommendedNextResearch, "COLLECT_MORE_HISTORY");
  }
});

test("trigger distance buckets and blocker distribution are deterministic", () => {
  const replayPoints = [
    point(0, "RR_REJECTED", { triggerDistanceClass: "AT_TRIGGER" }),
    point(1, "WAITING_TRIGGER", { triggerDistanceClass: "NEAR" }),
    point(2, "TRIGGER_NO_TOUCH", { triggerDistanceClass: "MID_RANGE" }),
    point(3, "TOUCH_EXPIRED", { triggerDistanceClass: "FAR" }),
    point(4, "CONFIRMATION_PENDING"),
    point(5, "CONFIRMATION_PENDING", { bottleneckStatus: "CONFIRMATION_CONFLICTING" }),
    point(6, "WAITING_TRIGGER", { sourceSafetyValid: false, bottleneckStatus: "SAFETY_BLOCKED" }),
    point(7, "NO_ALIGNED_CONTEXT"),
  ];

  const result = evaluate(replayPoints);

  assert.deepEqual(result.triggerDistanceBuckets, {
    AT_TRIGGER: 3,
    NEAR: 1,
    MID_RANGE: 1,
    FAR: 2,
  });
  assert.deepEqual(result.blockerDistribution, {
    RR_NOT_READY: 1,
    WAITING_FOR_PULLBACK_TRIGGER: 1,
    NO_TOUCH_EVIDENCE: 1,
    TOUCH_WINDOW_EXPIRED: 1,
    CONFIRMATION_NOT_READY: 1,
    CONFIRMATION_CONFLICTING: 1,
    SAFETY_BLOCKED: 1,
    NO_CONTEXT: 1,
  });
  const distributed = Object.values(result.blockerDistribution).reduce((sum, count) => sum + count, 0);
  assert.equal(distributed, replayPoints.length);
});

test("reviewer does not mutate inputs and forces safety literals", () => {
  const replayPoints = [point(0, "WAITING_TRIGGER"), point(1, "PROMOTABLE")];
  const before = structuredClone(replayPoints);

  const result = evaluate(replayPoints);

  assert.deepEqual(replayPoints, before);
  assert.equal(result.activationAllowed, false);
  assert.equal(result.paperActivationAllowed, false);
  assert.equal(result.liveActivationAllowed, false);
  assert.equal(result.reviewOnly, true);
  assert.equal(result.shadowOnly, true);
  assert.ok(result.doNotDo.length > 0);
});
