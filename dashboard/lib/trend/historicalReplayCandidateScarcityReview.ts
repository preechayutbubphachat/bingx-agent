// D8.4.2 - pure historical candidate-funnel scarcity diagnostics.

const CANDIDATE_SCARCITY_RATE = 0.01;
const PULLBACK_TRIGGER_REACHED_RATE = 0.10;
const MATERIAL_STAGE_CONVERSION_RATE = 0.20;
const CONFIRMATION_ALIGNED_RATE = 0.20;

export type HistoricalReplayTimeframe = "5M" | "15M" | "1H";

export type HistoricalReplayCandidateScarcityStatus =
  | "NO_REPLAY_DATA"
  | "INSUFFICIENT_REPLAY_DATA"
  | "REPLAY_READY"
  | "CANDIDATE_PIPELINE_TOO_SPARSE"
  | "PULLBACK_ONLY_BOTTLENECK"
  | "RR_BOTTLENECK"
  | "TOUCH_WINDOW_BOTTLENECK"
  | "CONFIRMATION_BOTTLENECK"
  | "DATA_QUALITY_BLOCKED";

export type HistoricalReplaySampleQuality =
  | "NO_SAMPLE"
  | "LOW_SAMPLE"
  | "EARLY_SAMPLE"
  | "USABLE_SAMPLE";

export type HistoricalReplayPrimaryBlocker =
  | "RR_NOT_READY"
  | "WAITING_FOR_PULLBACK_TRIGGER"
  | "NO_TOUCH_EVIDENCE"
  | "TOUCH_WINDOW_EXPIRED"
  | "CONFIRMATION_NOT_READY"
  | "CONFIRMATION_CONFLICTING"
  | "SAFETY_BLOCKED"
  | "NO_CONTEXT"
  | "NONE";

export type HistoricalReplayTriggerDistanceClass =
  | "AT_TRIGGER"
  | "NEAR"
  | "MID_RANGE"
  | "FAR"
  | "UNKNOWN";

export interface HistoricalReplayPoint {
  evaluatedAt: string;
  alignedContext: boolean;
  d8_0AlignedCandidate: boolean;
  rrReady: boolean;
  d8_2Status: string;
  triggerReached: boolean;
  d8_3Status: string;
  zoneTouched: boolean;
  confirmationWindowActive: boolean;
  d8_4Status: string;
  confirmationAligned: boolean;
  promotableReviewCandidate: boolean;
  bottleneckStatus: HistoricalReplayPrimaryBlocker;
  triggerDistanceClass: HistoricalReplayTriggerDistanceClass;
  sourceSafetyValid: boolean;
  dataQualityValid: boolean;
}

export interface HistoricalReplayFunnelCounts {
  totalEvaluationPoints: number;
  alignedContextCount: number;
  d8_0AlignedCandidateCount: number;
  rrReadyCount: number;
  waitingForTriggerCount: number;
  triggerReachedCount: number;
  zoneTouchedCount: number;
  confirmationWindowActiveCount: number;
  confirmationAlignedCount: number;
  promotableReviewCandidateCount: number;
}

export interface HistoricalReplayFunnelRates {
  alignedContextRate: number | null;
  rrReadyRate: number | null;
  triggerReachedRate: number | null;
  zoneTouchedRate: number | null;
  confirmationAlignedRate: number | null;
  promotableRate: number | null;
}

export interface HistoricalReplayBlockerDistribution {
  RR_NOT_READY: number;
  WAITING_FOR_PULLBACK_TRIGGER: number;
  NO_TOUCH_EVIDENCE: number;
  TOUCH_WINDOW_EXPIRED: number;
  CONFIRMATION_NOT_READY: number;
  CONFIRMATION_CONFLICTING: number;
  SAFETY_BLOCKED: number;
  NO_CONTEXT: number;
}

export interface HistoricalReplayTriggerDistanceBuckets {
  AT_TRIGGER: number;
  NEAR: number;
  MID_RANGE: number;
  FAR: number;
}

export interface HistoricalReplayCandidateScarcityReview {
  schemaVersion: 1;
  source: "HISTORICAL_REPLAY_CANDIDATE_SCARCITY_REVIEW_V1";
  readiness: "REVIEW_NOT_ACTIVATION";
  status: HistoricalReplayCandidateScarcityStatus;
  replayWindow: {
    timeframe: HistoricalReplayTimeframe;
    startAt: string | null;
    endAt: string | null;
    candleCount: number;
    sampleQuality: HistoricalReplaySampleQuality;
  };
  funnelCounts: HistoricalReplayFunnelCounts;
  funnelRates: HistoricalReplayFunnelRates;
  blockerDistribution: HistoricalReplayBlockerDistribution;
  triggerDistanceBuckets: HistoricalReplayTriggerDistanceBuckets;
  dominantBottleneck: "NONE" | "RR" | "PULLBACK_TRIGGER" | "TOUCH" | "CONFIRMATION" | "DATA_QUALITY" | "CONTEXT";
  hypothesis:
    | "PULLBACK_ONLY_TOO_STRICT"
    | "RR_FILTER_TOO_STRICT"
    | "CONFIRMATION_TOO_STRICT"
    | "INSUFFICIENT_HISTORY"
    | "PIPELINE_HEALTHY_WAIT_FOR_MARKET"
    | "UNDETERMINED";
  recommendedNextResearch:
    | "WAIT_FOR_LIVE_PULLBACK"
    | "DESIGN_CONTINUATION_REVIEW_BRANCH"
    | "REPAIR_RR_ASSUMPTIONS"
    | "REPAIR_TOUCH_WINDOW"
    | "REPAIR_CONFIRMATION_RULES"
    | "COLLECT_MORE_HISTORY"
    | "NO_ACTION";
  blockers: string[];
  nextAction: string;
  doNotDo: string[];
  activationAllowed: false;
  paperActivationAllowed: false;
  liveActivationAllowed: false;
  reviewOnly: true;
  shadowOnly: true;
}

export interface HistoricalReplayCandidateScarcityReviewInput {
  timeframe: HistoricalReplayTimeframe;
  replayPoints: readonly HistoricalReplayPoint[];
}

const DO_NOT_DO = [
  "do not implement a continuation branch from replay output alone",
  "do not implement D8.5 until a review-candidate population exists",
  "do not create candidates, activate trading, place orders, or write runtime data",
] as const;

const BLOCKER_KEYS: Array<keyof HistoricalReplayBlockerDistribution> = [
  "RR_NOT_READY",
  "WAITING_FOR_PULLBACK_TRIGGER",
  "NO_TOUCH_EVIDENCE",
  "TOUCH_WINDOW_EXPIRED",
  "CONFIRMATION_NOT_READY",
  "CONFIRMATION_CONFLICTING",
  "SAFETY_BLOCKED",
  "NO_CONTEXT",
];

const DISTANCE_KEYS: Array<keyof HistoricalReplayTriggerDistanceBuckets> = [
  "AT_TRIGGER",
  "NEAR",
  "MID_RANGE",
  "FAR",
];

function emptyCounts(): HistoricalReplayFunnelCounts {
  return {
    totalEvaluationPoints: 0,
    alignedContextCount: 0,
    d8_0AlignedCandidateCount: 0,
    rrReadyCount: 0,
    waitingForTriggerCount: 0,
    triggerReachedCount: 0,
    zoneTouchedCount: 0,
    confirmationWindowActiveCount: 0,
    confirmationAlignedCount: 0,
    promotableReviewCandidateCount: 0,
  };
}

function emptyRates(): HistoricalReplayFunnelRates {
  return {
    alignedContextRate: null,
    rrReadyRate: null,
    triggerReachedRate: null,
    zoneTouchedRate: null,
    confirmationAlignedRate: null,
    promotableRate: null,
  };
}

function emptyBlockers(): HistoricalReplayBlockerDistribution {
  return {
    RR_NOT_READY: 0,
    WAITING_FOR_PULLBACK_TRIGGER: 0,
    NO_TOUCH_EVIDENCE: 0,
    TOUCH_WINDOW_EXPIRED: 0,
    CONFIRMATION_NOT_READY: 0,
    CONFIRMATION_CONFLICTING: 0,
    SAFETY_BLOCKED: 0,
    NO_CONTEXT: 0,
  };
}

function emptyDistances(): HistoricalReplayTriggerDistanceBuckets {
  return { AT_TRIGGER: 0, NEAR: 0, MID_RANGE: 0, FAR: 0 };
}

function sampleQuality(count: number): HistoricalReplaySampleQuality {
  if (count === 0) return "NO_SAMPLE";
  if (count < 100) return "LOW_SAMPLE";
  if (count < 500) return "EARLY_SAMPLE";
  return "USABLE_SAMPLE";
}

function baseOutput(
  timeframe: HistoricalReplayTimeframe,
  overrides: Partial<HistoricalReplayCandidateScarcityReview> = {},
): HistoricalReplayCandidateScarcityReview {
  return {
    schemaVersion: 1,
    source: "HISTORICAL_REPLAY_CANDIDATE_SCARCITY_REVIEW_V1",
    readiness: "REVIEW_NOT_ACTIVATION",
    status: "NO_REPLAY_DATA",
    replayWindow: {
      timeframe,
      startAt: null,
      endAt: null,
      candleCount: 0,
      sampleQuality: "NO_SAMPLE",
    },
    funnelCounts: emptyCounts(),
    funnelRates: emptyRates(),
    blockerDistribution: emptyBlockers(),
    triggerDistanceBuckets: emptyDistances(),
    dominantBottleneck: "NONE",
    hypothesis: "INSUFFICIENT_HISTORY",
    recommendedNextResearch: "COLLECT_MORE_HISTORY",
    blockers: ["NO_REPLAY_DATA"],
    nextAction: "supply approved offline point-in-time replay evidence",
    doNotDo: [...DO_NOT_DO],
    activationAllowed: false,
    paperActivationAllowed: false,
    liveActivationAllowed: false,
    reviewOnly: true,
    shadowOnly: true,
    ...overrides,
  };
}

function isTimeframe(value: unknown): value is HistoricalReplayTimeframe {
  return value === "5M" || value === "15M" || value === "1H";
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

function isBlocker(value: unknown): value is HistoricalReplayPrimaryBlocker {
  return value === "NONE" || BLOCKER_KEYS.includes(value as keyof HistoricalReplayBlockerDistribution);
}

function isDistance(value: unknown): value is HistoricalReplayTriggerDistanceClass {
  return value === "UNKNOWN" || DISTANCE_KEYS.includes(value as keyof HistoricalReplayTriggerDistanceBuckets);
}

function validDate(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && Number.isFinite(Date.parse(value));
}

function structurallyValid(point: HistoricalReplayPoint): boolean {
  if (!validDate(point.evaluatedAt)) return false;
  if (!isBlocker(point.bottleneckStatus) || !isDistance(point.triggerDistanceClass)) return false;
  if (![
    point.alignedContext,
    point.d8_0AlignedCandidate,
    point.rrReady,
    point.triggerReached,
    point.zoneTouched,
    point.confirmationWindowActive,
    point.confirmationAligned,
    point.promotableReviewCandidate,
    point.sourceSafetyValid,
    point.dataQualityValid,
  ].every(isBoolean)) return false;
  if (typeof point.d8_2Status !== "string" || typeof point.d8_3Status !== "string" || typeof point.d8_4Status !== "string") return false;
  if (!point.dataQualityValid) return false;
  if (point.sourceSafetyValid === (point.bottleneckStatus === "SAFETY_BLOCKED")) return false;
  if (point.d8_0AlignedCandidate && !point.alignedContext) return false;
  if (point.rrReady && !point.d8_0AlignedCandidate) return false;
  if (point.triggerReached && !point.rrReady) return false;
  if (point.zoneTouched && !point.triggerReached) return false;
  if (point.confirmationWindowActive && !point.zoneTouched) return false;
  if (point.confirmationAligned && !point.confirmationWindowActive) return false;
  if (point.promotableReviewCandidate && !point.confirmationAligned) return false;
  if (point.d8_2Status === "WAITING_FOR_TRIGGER_PRICE" && point.triggerReached) return false;
  if (point.triggerReached && (point.d8_2Status === "WAITING_FOR_TRIGGER_PRICE" || point.d8_2Status === "NO_GATE")) return false;
  if ((point.d8_3Status === "CONFIRMATION_WINDOW_ACTIVE") !== point.confirmationWindowActive) return false;
  if ((point.d8_4Status === "PROMOTABLE_REVIEW_CANDIDATE") !== point.promotableReviewCandidate) return false;
  return true;
}

function ratio(numerator: number, denominator: number): number | null {
  if (denominator === 0) return null;
  const value = numerator / denominator;
  return Number.isFinite(value) && value >= 0 && value <= 1 ? value : null;
}

function aggregate(points: readonly HistoricalReplayPoint[]): {
  counts: HistoricalReplayFunnelCounts;
  rates: HistoricalReplayFunnelRates;
  blockers: HistoricalReplayBlockerDistribution;
  distances: HistoricalReplayTriggerDistanceBuckets;
  activeWindowRate: number | null;
} {
  const counts = emptyCounts();
  const blockers = emptyBlockers();
  const distances = emptyDistances();
  counts.totalEvaluationPoints = points.length;

  for (const point of points) {
    if (point.alignedContext) counts.alignedContextCount += 1;
    if (point.alignedContext && point.d8_0AlignedCandidate) counts.d8_0AlignedCandidateCount += 1;
    if (point.alignedContext && point.d8_0AlignedCandidate && point.rrReady) {
      counts.rrReadyCount += 1;
      if (point.d8_2Status === "WAITING_FOR_TRIGGER_PRICE") counts.waitingForTriggerCount += 1;
      if (point.triggerReached) {
        counts.triggerReachedCount += 1;
        if (point.zoneTouched) {
          counts.zoneTouchedCount += 1;
          if (point.confirmationWindowActive) {
            counts.confirmationWindowActiveCount += 1;
            if (point.confirmationAligned) {
              counts.confirmationAlignedCount += 1;
              if (point.promotableReviewCandidate) counts.promotableReviewCandidateCount += 1;
            }
          }
        }
      }
    }

    if (BLOCKER_KEYS.includes(point.bottleneckStatus as keyof HistoricalReplayBlockerDistribution)) {
      blockers[point.bottleneckStatus as keyof HistoricalReplayBlockerDistribution] += 1;
    }
    if (point.d8_0AlignedCandidate && DISTANCE_KEYS.includes(point.triggerDistanceClass as keyof HistoricalReplayTriggerDistanceBuckets)) {
      distances[point.triggerDistanceClass as keyof HistoricalReplayTriggerDistanceBuckets] += 1;
    }
  }

  return {
    counts,
    rates: {
      alignedContextRate: ratio(counts.alignedContextCount, counts.totalEvaluationPoints),
      rrReadyRate: ratio(counts.rrReadyCount, counts.d8_0AlignedCandidateCount),
      triggerReachedRate: ratio(counts.triggerReachedCount, counts.rrReadyCount),
      zoneTouchedRate: ratio(counts.zoneTouchedCount, counts.triggerReachedCount),
      confirmationAlignedRate: ratio(counts.confirmationAlignedCount, counts.confirmationWindowActiveCount),
      promotableRate: ratio(counts.promotableReviewCandidateCount, counts.totalEvaluationPoints),
    },
    blockers,
    distances,
    activeWindowRate: ratio(counts.confirmationWindowActiveCount, counts.zoneTouchedCount),
  };
}

function classification(
  quality: HistoricalReplaySampleQuality,
  counts: HistoricalReplayFunnelCounts,
  rates: HistoricalReplayFunnelRates,
  activeWindowRate: number | null,
): Pick<HistoricalReplayCandidateScarcityReview, "status" | "dominantBottleneck" | "hypothesis" | "recommendedNextResearch" | "blockers" | "nextAction"> {
  if (quality !== "USABLE_SAMPLE") {
    return {
      status: "INSUFFICIENT_REPLAY_DATA",
      dominantBottleneck: "DATA_QUALITY",
      hypothesis: "INSUFFICIENT_HISTORY",
      recommendedNextResearch: "COLLECT_MORE_HISTORY",
      blockers: ["USABLE_REPLAY_SAMPLE_NOT_REACHED"],
      nextAction: "collect at least 500 valid offline evaluation points",
    };
  }
  if (rates.rrReadyRate !== null && rates.rrReadyRate < MATERIAL_STAGE_CONVERSION_RATE) {
    return {
      status: "RR_BOTTLENECK",
      dominantBottleneck: "RR",
      hypothesis: "RR_FILTER_TOO_STRICT",
      recommendedNextResearch: "REPAIR_RR_ASSUMPTIONS",
      blockers: ["RR_READY_CONVERSION_BELOW_20_PERCENT"],
      nextAction: "review RR assumptions offline without changing the live threshold",
    };
  }
  if (
    counts.rrReadyCount > 0
    && counts.waitingForTriggerCount > counts.triggerReachedCount
    && rates.triggerReachedRate !== null
    && rates.triggerReachedRate < PULLBACK_TRIGGER_REACHED_RATE
  ) {
    return {
      status: "PULLBACK_ONLY_BOTTLENECK",
      dominantBottleneck: "PULLBACK_TRIGGER",
      hypothesis: "PULLBACK_ONLY_TOO_STRICT",
      recommendedNextResearch: "DESIGN_CONTINUATION_REVIEW_BRANCH",
      blockers: ["TRIGGER_REACHED_RATE_BELOW_10_PERCENT"],
      nextAction: "review continuation-branch design only; do not implement or activate it",
    };
  }
  if (
    counts.triggerReachedCount > 0
    && (
      (rates.zoneTouchedRate !== null && rates.zoneTouchedRate < MATERIAL_STAGE_CONVERSION_RATE)
      || (counts.zoneTouchedCount > 0 && activeWindowRate !== null && activeWindowRate < MATERIAL_STAGE_CONVERSION_RATE)
    )
  ) {
    return {
      status: "TOUCH_WINDOW_BOTTLENECK",
      dominantBottleneck: "TOUCH",
      hypothesis: "UNDETERMINED",
      recommendedNextResearch: "REPAIR_TOUCH_WINDOW",
      blockers: ["TOUCH_OR_ACTIVE_WINDOW_CONVERSION_BELOW_20_PERCENT"],
      nextAction: "review touch-window evidence offline without changing D8.3 behavior",
    };
  }
  if (
    counts.confirmationWindowActiveCount > 0
    && rates.confirmationAlignedRate !== null
    && rates.confirmationAlignedRate < CONFIRMATION_ALIGNED_RATE
  ) {
    return {
      status: "CONFIRMATION_BOTTLENECK",
      dominantBottleneck: "CONFIRMATION",
      hypothesis: "CONFIRMATION_TOO_STRICT",
      recommendedNextResearch: "REPAIR_CONFIRMATION_RULES",
      blockers: ["CONFIRMATION_ALIGNED_RATE_BELOW_20_PERCENT"],
      nextAction: "review confirmation evidence offline without changing D8.4 behavior",
    };
  }
  if (rates.promotableRate !== null && rates.promotableRate < CANDIDATE_SCARCITY_RATE) {
    return {
      status: "CANDIDATE_PIPELINE_TOO_SPARSE",
      dominantBottleneck: "NONE",
      hypothesis: "UNDETERMINED",
      recommendedNextResearch: "NO_ACTION",
      blockers: ["PROMOTABLE_RATE_BELOW_1_PERCENT"],
      nextAction: "inspect the complete replay funnel before proposing another strategy branch",
    };
  }
  return {
    status: "REPLAY_READY",
    dominantBottleneck: "NONE",
    hypothesis: "PIPELINE_HEALTHY_WAIT_FOR_MARKET",
    recommendedNextResearch: "WAIT_FOR_LIVE_PULLBACK",
    blockers: [],
    nextAction: "continue review-only monitoring for an aligned live pullback",
  };
}

export function evaluateHistoricalReplayCandidateScarcityReview(
  input: HistoricalReplayCandidateScarcityReviewInput,
): HistoricalReplayCandidateScarcityReview {
  const timeframe = isTimeframe(input?.timeframe) ? input.timeframe : "5M";
  if (!input || !isTimeframe(input.timeframe) || !Array.isArray(input.replayPoints)) {
    return baseOutput(timeframe, {
      status: "DATA_QUALITY_BLOCKED",
      dominantBottleneck: "DATA_QUALITY",
      hypothesis: "UNDETERMINED",
      recommendedNextResearch: "COLLECT_MORE_HISTORY",
      blockers: ["INVALID_REPLAY_INPUT"],
      nextAction: "repair the supplied offline replay contract before review",
    });
  }
  if (input.replayPoints.length === 0) return baseOutput(timeframe);

  const copied = [...input.replayPoints].sort((left, right) => Date.parse(left.evaluatedAt) - Date.parse(right.evaluatedAt));
  if (!copied.every(structurallyValid)) {
    return baseOutput(timeframe, {
      status: "DATA_QUALITY_BLOCKED",
      replayWindow: {
        timeframe,
        startAt: null,
        endAt: null,
        candleCount: input.replayPoints.length,
        sampleQuality: sampleQuality(input.replayPoints.length),
      },
      dominantBottleneck: "DATA_QUALITY",
      hypothesis: "UNDETERMINED",
      recommendedNextResearch: "COLLECT_MORE_HISTORY",
      blockers: ["CONTRADICTORY_OR_INVALID_REPLAY_POINT"],
      nextAction: "repair point-in-time replay integrity before drawing a bottleneck conclusion",
    });
  }

  const { counts, rates, blockers, distances, activeWindowRate } = aggregate(copied);
  const quality = sampleQuality(counts.totalEvaluationPoints);
  const classified = classification(quality, counts, rates, activeWindowRate);
  return baseOutput(timeframe, {
    ...classified,
    replayWindow: {
      timeframe,
      startAt: copied[0]?.evaluatedAt ?? null,
      endAt: copied.at(-1)?.evaluatedAt ?? null,
      candleCount: copied.length,
      sampleQuality: quality,
    },
    funnelCounts: counts,
    funnelRates: rates,
    blockerDistribution: blockers,
    triggerDistanceBuckets: distances,
  });
}
