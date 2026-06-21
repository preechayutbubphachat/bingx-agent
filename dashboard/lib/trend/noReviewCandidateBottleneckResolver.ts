// dashboard/lib/trend/noReviewCandidateBottleneckResolver.ts
// D8.4.1 - pure review-only diagnosis of candidate-generation bottlenecks.

const AT_TRIGGER_MAX_PCT = 0.05;
const NEAR_TRIGGER_MAX_PCT = 0.25;
const FAR_TRIGGER_MIN_PCT = 0.75;
const FIVE_MINUTE_FRESH_MS = 15 * 60 * 1000;
const FIFTEEN_MINUTE_FRESH_MS = 45 * 60 * 1000;
const MIN_STRONG_ADX = 25;
const DISTANCE_PCT_TOLERANCE = 0.0001;
const RR_TOLERANCE = 0.000001;

export type NoReviewCandidateBottleneckStatus =
  | "NO_CONTEXT"
  | "PROMOTABLE_REVIEW_EXISTS"
  | "RR_NOT_READY"
  | "WAITING_FOR_PULLBACK_TRIGGER"
  | "NO_TOUCH_EVIDENCE"
  | "TOUCH_WINDOW_EXPIRED"
  | "CONFIRMATION_NOT_READY"
  | "CONFIRMATION_CONFLICTING"
  | "SAFETY_BLOCKED"
  | "STRATEGY_BRANCH_GAP";

export type NoReviewCandidatePrimaryBlocker =
  | "MISSING_CONTEXT"
  | "NONE"
  | "RR_BELOW_THRESHOLD"
  | "PRICE_ABOVE_LONG_TRIGGER"
  | "PRICE_BELOW_SHORT_TRIGGER"
  | "PULLBACK_ZONE_NOT_TOUCHED"
  | "TOUCH_WINDOW_INACTIVE"
  | "MOMENTUM_NOT_CONFIRMED"
  | "MOMENTUM_CONFLICT"
  | "SOURCE_SAFETY_INVALID"
  | "PULLBACK_ONLY_STRATEGY_GAP";

export type NoReviewCandidateAlgorithmBranch =
  | "WAIT_FOR_PULLBACK"
  | "DESIGN_CONTINUATION_REVIEW_BRANCH"
  | "RUN_HISTORICAL_REPLAY_REVIEW"
  | "REPAIR_RR"
  | "REPAIR_CONFIRMATION"
  | "NO_ACTION";

export type TriggerDistanceClass = "AT_TRIGGER" | "NEAR" | "MID_RANGE" | "FAR" | "UNKNOWN";
export type ContinuationEvidenceStatus = "STRONG_ALIGNED" | "WEAK_OR_MIXED" | "CONFLICTING" | "INSUFFICIENT";

export interface NoReviewCandidateBottleneckResolverInput {
  entryCandidateResolution?: unknown;
  resolverDrivenPullbackGate?: unknown;
  pullbackTriggerThresholds?: unknown;
  pullbackZoneTouchEvidence?: unknown;
  touchAwareConfirmationReview?: unknown;
  multiTimeframeIndicatorEvidence?: unknown;
}

export interface NoReviewCandidateBottleneckResolver {
  schemaVersion: 1;
  source: "NO_REVIEW_CANDIDATE_BOTTLENECK_RESOLVER_V1";
  readiness: "REVIEW_NOT_ACTIVATION";
  status: NoReviewCandidateBottleneckStatus;
  primaryBlocker: NoReviewCandidatePrimaryBlocker;
  contributingBlockers: NoReviewCandidatePrimaryBlocker[];
  alignedDirection: "LONG" | "SHORT" | "UNKNOWN";
  currentPrice: number | null;
  triggerPrice: number | null;
  distanceToTriggerAbs: number | null;
  distanceToTriggerPct: number | null;
  bestRR: number | null;
  rrThreshold: number | null;
  rrReady: boolean;
  touchStatus: string;
  confirmationStatus: string;
  d8Statuses: {
    d8_0: string;
    d8_1: string;
    d8_2: string;
    d8_3: string;
    d8_4: string;
  };
  triggerDistanceClass: TriggerDistanceClass;
  continuationEvidence: {
    status: ContinuationEvidenceStatus;
    timeframesUsed: Array<"5M" | "15M">;
    reasons: string[];
  };
  nextAlgorithmBranch: NoReviewCandidateAlgorithmBranch;
  nextAction: string;
  doNotDo: string[];
  activationAllowed: false;
  paperActivationAllowed: false;
  liveActivationAllowed: false;
  reviewOnly: true;
  shadowOnly: true;
}

type AnyObj = Record<string, unknown>;
type Direction = "LONG" | "SHORT";

interface ValidContext {
  d8_0: AnyObj;
  d8_1: AnyObj;
  d8_2: AnyObj;
  d8_3: AnyObj;
  d8_4: AnyObj;
  direction: Direction;
  currentPrice: number;
  triggerPrice: number;
  distanceToTriggerAbs: number;
  distanceToTriggerPct: number;
  bestRR: number;
  rrThreshold: number;
  rrReady: boolean;
  distanceClass: Exclude<TriggerDistanceClass, "UNKNOWN">;
  safetyValid: boolean;
}

const DO_NOT_DO = [
  "do not move or widen the pullback trigger to force a candidate",
  "do not convert continuation evidence into an entry",
  "do not bypass touch or confirmation",
  "do not implement D8.5 before candidate-generation evidence exists",
  "do not activate paper or live behavior",
  "do not place or approve a trade",
];

function obj(value: unknown): AnyObj {
  return value && typeof value === "object" && !Array.isArray(value) ? value as AnyObj : {};
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function finitePositive(value: unknown): value is number {
  return finite(value) && value > 0;
}

function str(value: unknown, fallback = "UNKNOWN"): string {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function direction(value: unknown): Direction | null {
  return value === "LONG" || value === "SHORT" ? value : null;
}

function hasSafetyPrimitives(source: AnyObj): boolean {
  return typeof source.activationAllowed === "boolean"
    && typeof source.paperActivationAllowed === "boolean"
    && typeof source.liveActivationAllowed === "boolean";
}

function sourceSafetyValid(source: AnyObj): boolean {
  return source.activationAllowed === false
    && source.paperActivationAllowed === false
    && source.liveActivationAllowed === false;
}

function baseOutput(overrides: Partial<NoReviewCandidateBottleneckResolver> = {}): NoReviewCandidateBottleneckResolver {
  return {
    schemaVersion: 1,
    source: "NO_REVIEW_CANDIDATE_BOTTLENECK_RESOLVER_V1",
    readiness: "REVIEW_NOT_ACTIVATION",
    status: "NO_CONTEXT",
    primaryBlocker: "MISSING_CONTEXT",
    contributingBlockers: [],
    alignedDirection: "UNKNOWN",
    currentPrice: null,
    triggerPrice: null,
    distanceToTriggerAbs: null,
    distanceToTriggerPct: null,
    bestRR: null,
    rrThreshold: null,
    rrReady: false,
    touchStatus: "UNKNOWN",
    confirmationStatus: "UNKNOWN",
    d8Statuses: {
      d8_0: "UNKNOWN",
      d8_1: "UNKNOWN",
      d8_2: "UNKNOWN",
      d8_3: "UNKNOWN",
      d8_4: "UNKNOWN",
    },
    triggerDistanceClass: "UNKNOWN",
    continuationEvidence: {
      status: "INSUFFICIENT",
      timeframesUsed: [],
      reasons: [],
    },
    nextAlgorithmBranch: "NO_ACTION",
    nextAction: "wait for consistent D8.0-D8.4 diagnostic context",
    doNotDo: [...DO_NOT_DO],
    activationAllowed: false,
    paperActivationAllowed: false,
    liveActivationAllowed: false,
    reviewOnly: true,
    shadowOnly: true,
    ...overrides,
  };
}

function distanceClass(distancePct: number): Exclude<TriggerDistanceClass, "UNKNOWN"> {
  if (distancePct <= AT_TRIGGER_MAX_PCT) return "AT_TRIGGER";
  if (distancePct <= NEAR_TRIGGER_MAX_PCT) return "NEAR";
  if (distancePct >= FAR_TRIGGER_MIN_PCT) return "FAR";
  return "MID_RANGE";
}

function sourceMatches(source: AnyObj, sourceName: string): boolean {
  return source.schemaVersion === 1 && source.source === sourceName;
}

function readContext(input: NoReviewCandidateBottleneckResolverInput): ValidContext | null {
  const d8_0 = obj(input.entryCandidateResolution);
  const d8_1 = obj(input.resolverDrivenPullbackGate);
  const d8_2 = obj(input.pullbackTriggerThresholds);
  const d8_3 = obj(input.pullbackZoneTouchEvidence);
  const d8_4 = obj(input.touchAwareConfirmationReview);

  if (
    !sourceMatches(d8_0, "ENTRY_CANDIDATE_RESOLVER_V1")
    || !sourceMatches(d8_1, "RESOLVER_DRIVEN_PULLBACK_GATE_V1")
    || !sourceMatches(d8_2, "PULLBACK_TRIGGER_THRESHOLDS_V1")
    || !sourceMatches(d8_3, "PULLBACK_ZONE_TOUCH_EVIDENCE_V1")
    || !sourceMatches(d8_4, "TOUCH_AWARE_CONFIRMATION_REVIEW_V1")
  ) {
    return null;
  }

  const directions = [d8_0, d8_1, d8_2, d8_3, d8_4].map((source) => direction(source.alignedDirection));
  const alignedDirection = directions[0];
  if (!alignedDirection || directions.some((value) => value !== alignedDirection)) return null;
  if ([d8_0, d8_1, d8_2, d8_3, d8_4].some((source) => !hasSafetyPrimitives(source))) return null;

  const currentPrice = d8_2.currentPrice;
  const triggerPrice = d8_2.triggerPrice;
  const canonicalDistanceAbs = d8_2.distanceToTriggerAbs;
  const canonicalDistancePct = d8_2.distanceToTriggerPct;
  const bestRR = d8_2.bestRR;
  const rrThreshold = d8_2.rrThreshold;
  if (
    !finitePositive(currentPrice)
    || !finitePositive(triggerPrice)
    || !finite(canonicalDistanceAbs) || canonicalDistanceAbs < 0
    || !finite(canonicalDistancePct) || canonicalDistancePct < 0
    || !finitePositive(bestRR)
    || !finitePositive(rrThreshold)
    || typeof d8_2.rrReady !== "boolean"
  ) {
    return null;
  }

  const computedAbs = Math.abs(currentPrice - triggerPrice);
  const computedPct = computedAbs / currentPrice * 100;
  const absTolerance = Math.max(0.01, currentPrice * 0.000001);
  if (
    Math.abs(canonicalDistanceAbs - computedAbs) > absTolerance
    || Math.abs(canonicalDistancePct - computedPct) > DISTANCE_PCT_TOLERANCE
  ) {
    return null;
  }

  const rrReady = d8_2.rrReady;
  if (rrReady !== (bestRR >= rrThreshold)) return null;
  if (
    finite(d8_1.bestRR) && Math.abs(d8_1.bestRR - bestRR) > RR_TOLERANCE
    || finite(d8_1.rrThreshold) && Math.abs(d8_1.rrThreshold - rrThreshold) > RR_TOLERANCE
  ) {
    return null;
  }

  const d8_2Status = str(d8_2.status);
  if (
    d8_2Status === "WAITING_FOR_TRIGGER_PRICE"
    && (alignedDirection === "LONG" ? currentPrice <= triggerPrice : currentPrice >= triggerPrice)
  ) {
    return null;
  }

  const promotableStatus = d8_4.status === "PROMOTABLE_REVIEW_CANDIDATE";
  if (promotableStatus !== (d8_4.shouldPromoteToReview === true)) return null;

  return {
    d8_0,
    d8_1,
    d8_2,
    d8_3,
    d8_4,
    direction: alignedDirection,
    currentPrice,
    triggerPrice,
    distanceToTriggerAbs: canonicalDistanceAbs,
    distanceToTriggerPct: canonicalDistancePct,
    bestRR,
    rrThreshold,
    rrReady,
    distanceClass: distanceClass(canonicalDistancePct),
    safetyValid: [d8_0, d8_1, d8_2, d8_3, d8_4].every(sourceSafetyValid),
  };
}

function contextOutput(context: ValidContext): Partial<NoReviewCandidateBottleneckResolver> {
  return {
    alignedDirection: context.direction,
    currentPrice: context.currentPrice,
    triggerPrice: context.triggerPrice,
    distanceToTriggerAbs: context.distanceToTriggerAbs,
    distanceToTriggerPct: context.distanceToTriggerPct,
    bestRR: context.bestRR,
    rrThreshold: context.rrThreshold,
    rrReady: context.rrReady,
    touchStatus: str(context.d8_3.status),
    confirmationStatus: str(context.d8_4.confirmationStatus),
    d8Statuses: {
      d8_0: str(context.d8_0.status),
      d8_1: str(context.d8_1.status),
      d8_2: str(context.d8_2.status),
      d8_3: str(context.d8_3.status),
      d8_4: str(context.d8_4.status),
    },
    triggerDistanceClass: context.distanceClass,
  };
}

interface TimeframeClassification {
  timeframe: "5M" | "15M";
  strong: boolean;
  conflicting: boolean;
  reason: string;
}

function timeframeClassification(
  evidence: AnyObj,
  timeframe: "5M" | "15M",
  maxAgeMs: number,
  alignedDirection: Direction,
): TimeframeClassification | null {
  const record = obj(evidence[timeframe]);
  const ageMs = obj(record.freshness).ageMs;
  if (!finite(ageMs) || ageMs < 0 || ageMs > maxAgeMs) return null;

  const values = [record.adx, record.plusDI, record.minusDI, record.macdHistogram, record.emaSlope];
  if (!values.some(finite)) return null;

  const bullishDi = finite(record.plusDI) && finite(record.minusDI) && record.plusDI > record.minusDI;
  const bearishDi = finite(record.plusDI) && finite(record.minusDI) && record.minusDI > record.plusDI;
  const bullishMomentum = finite(record.macdHistogram) && record.macdHistogram > 0
    || finite(record.emaSlope) && record.emaSlope > 0;
  const bearishMomentum = finite(record.macdHistogram) && record.macdHistogram < 0
    || finite(record.emaSlope) && record.emaSlope < 0;
  const alignedDi = alignedDirection === "LONG" ? bullishDi : bearishDi;
  const alignedMomentum = alignedDirection === "LONG" ? bullishMomentum : bearishMomentum;
  const opposingDi = alignedDirection === "LONG" ? bearishDi : bullishDi;
  const opposingMomentum = alignedDirection === "LONG" ? bearishMomentum : bullishMomentum;
  const strong = finite(record.adx) && record.adx >= MIN_STRONG_ADX && alignedDi && alignedMomentum;
  const conflicting = opposingDi && opposingMomentum;
  const reason = conflicting
    ? `${timeframe} DI and momentum conflict with ${alignedDirection}`
    : strong
      ? `${timeframe} ADX/DI/momentum support ${alignedDirection}`
      : `${timeframe} evidence is fresh but not strongly aligned`;

  return { timeframe, strong, conflicting, reason };
}

function classifyContinuationEvidence(
  input: unknown,
  alignedDirection: Direction,
): NoReviewCandidateBottleneckResolver["continuationEvidence"] {
  const evidence = obj(input);
  const records = [
    timeframeClassification(evidence, "5M", FIVE_MINUTE_FRESH_MS, alignedDirection),
    timeframeClassification(evidence, "15M", FIFTEEN_MINUTE_FRESH_MS, alignedDirection),
  ].filter((value): value is TimeframeClassification => value != null);
  const timeframesUsed = records.map((record) => record.timeframe);
  const reasons = records.map((record) => record.reason);
  const status: ContinuationEvidenceStatus = records.some((record) => record.conflicting)
    ? "CONFLICTING"
    : records.some((record) => record.strong)
      ? "STRONG_ALIGNED"
      : records.length
        ? "WEAK_OR_MIXED"
        : "INSUFFICIENT";
  return { status, timeframesUsed, reasons };
}

function directionalPriceBlocker(context: ValidContext): NoReviewCandidatePrimaryBlocker {
  return context.direction === "LONG" ? "PRICE_ABOVE_LONG_TRIGGER" : "PRICE_BELOW_SHORT_TRIGGER";
}

function result(
  context: ValidContext,
  continuationEvidence: NoReviewCandidateBottleneckResolver["continuationEvidence"],
  status: NoReviewCandidateBottleneckStatus,
  primaryBlocker: NoReviewCandidatePrimaryBlocker,
  contributingBlockers: NoReviewCandidatePrimaryBlocker[],
  nextAlgorithmBranch: NoReviewCandidateAlgorithmBranch,
  nextAction: string,
): NoReviewCandidateBottleneckResolver {
  return baseOutput({
    ...contextOutput(context),
    status,
    primaryBlocker,
    contributingBlockers,
    continuationEvidence,
    nextAlgorithmBranch,
    nextAction,
  });
}

export function evaluateNoReviewCandidateBottleneckResolver(
  input: NoReviewCandidateBottleneckResolverInput | null | undefined,
): NoReviewCandidateBottleneckResolver {
  const sourceInput = input ?? {};
  const context = readContext(sourceInput);
  if (!context) return baseOutput();

  const continuationEvidence = classifyContinuationEvidence(
    sourceInput.multiTimeframeIndicatorEvidence,
    context.direction,
  );
  const priceBlocker = directionalPriceBlocker(context);

  if (!context.safetyValid) {
    return result(
      context,
      continuationEvidence,
      "SAFETY_BLOCKED",
      "SOURCE_SAFETY_INVALID",
      ["SOURCE_SAFETY_INVALID"],
      "NO_ACTION",
      "restore exact review-only source safety before further diagnosis",
    );
  }

  if (context.d8_4.status === "PROMOTABLE_REVIEW_CANDIDATE") {
    return result(
      context,
      continuationEvidence,
      "PROMOTABLE_REVIEW_EXISTS",
      "NONE",
      [],
      "NO_ACTION",
      "continue human review of the existing D8.4 candidate; no bottleneck action is required",
    );
  }

  if (!context.rrReady) {
    return result(
      context,
      continuationEvidence,
      "RR_NOT_READY",
      "RR_BELOW_THRESHOLD",
      ["RR_BELOW_THRESHOLD"],
      "REPAIR_RR",
      "wait for improved resolver RR geometry without changing the threshold",
    );
  }

  if (context.d8_4.status === "CONFIRMATION_CONFLICTING") {
    return result(
      context,
      continuationEvidence,
      "CONFIRMATION_CONFLICTING",
      "MOMENTUM_CONFLICT",
      ["MOMENTUM_CONFLICT"],
      "REPAIR_CONFIRMATION",
      "wait for fresh non-conflicting aligned confirmation",
    );
  }

  if (context.d8_3.status === "CONFIRMATION_WINDOW_EXPIRED") {
    return result(
      context,
      continuationEvidence,
      "TOUCH_WINDOW_EXPIRED",
      "TOUCH_WINDOW_INACTIVE",
      ["TOUCH_WINDOW_INACTIVE"],
      "REPAIR_CONFIRMATION",
      "wait for a new aligned pullback touch and confirmation window",
    );
  }

  const branchGap = context.d8_2.status === "WAITING_FOR_TRIGGER_PRICE"
    && context.d8_3.status === "NO_TOUCH_YET"
    && context.d8_4.status === "TOUCH_WINDOW_INACTIVE"
    && context.distanceClass === "FAR"
    && continuationEvidence.status === "STRONG_ALIGNED";
  if (branchGap) {
    return result(
      context,
      continuationEvidence,
      "STRATEGY_BRANCH_GAP",
      priceBlocker,
      [priceBlocker, "PULLBACK_ZONE_NOT_TOUCHED", "PULLBACK_ONLY_STRATEGY_GAP"],
      "DESIGN_CONTINUATION_REVIEW_BRANCH",
      "design a separate review-only continuation branch after historical replay evidence; do not create a candidate here",
    );
  }

  if (context.d8_2.status === "WAITING_FOR_TRIGGER_PRICE") {
    const nextAlgorithmBranch: NoReviewCandidateAlgorithmBranch = context.distanceClass === "FAR"
      ? "RUN_HISTORICAL_REPLAY_REVIEW"
      : "WAIT_FOR_PULLBACK";
    return result(
      context,
      continuationEvidence,
      "WAITING_FOR_PULLBACK_TRIGGER",
      priceBlocker,
      [priceBlocker, ...(context.d8_3.status === "NO_TOUCH_YET" ? ["PULLBACK_ZONE_NOT_TOUCHED" as const] : [])],
      nextAlgorithmBranch,
      nextAlgorithmBranch === "WAIT_FOR_PULLBACK"
        ? "wait for price to return to the existing aligned pullback trigger"
        : "design an offline historical replay review before considering another candidate branch",
    );
  }

  if (context.d8_3.status === "NO_TOUCH_YET") {
    return result(
      context,
      continuationEvidence,
      "NO_TOUCH_EVIDENCE",
      "PULLBACK_ZONE_NOT_TOUCHED",
      ["PULLBACK_ZONE_NOT_TOUCHED"],
      context.distanceClass === "FAR" ? "RUN_HISTORICAL_REPLAY_REVIEW" : "WAIT_FOR_PULLBACK",
      "wait for valid pullback-zone touch evidence",
    );
  }

  return result(
    context,
    continuationEvidence,
    "CONFIRMATION_NOT_READY",
    "MOMENTUM_NOT_CONFIRMED",
    ["MOMENTUM_NOT_CONFIRMED"],
    "REPAIR_CONFIRMATION",
    "wait for fresh aligned confirmation evidence",
  );
}
