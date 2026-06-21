// dashboard/lib/trend/touchAwareConfirmationReview.ts
// D8.4 - pure touch-aware momentum confirmation and review promotion diagnostics.

const FIVE_MINUTE_FRESH_MS = 15 * 60 * 1000;
const FIFTEEN_MINUTE_FRESH_MS = 45 * 60 * 1000;

export type TouchAwareConfirmationReviewStatus =
  | "NO_TOUCH_CONTEXT"
  | "INVALIDATION_REVIEW_REQUIRED"
  | "TOUCH_WINDOW_INACTIVE"
  | "RR_NOT_READY"
  | "SOURCE_SAFETY_INVALID"
  | "WAITING_FOR_FRESH_CONFIRMATION"
  | "CONFIRMATION_CONFLICTING"
  | "CONFIRMATION_NOT_ALIGNED"
  | "PROMOTABLE_REVIEW_CANDIDATE";

export type TouchAwareConfirmationStatus =
  | "NOT_EVALUATED"
  | "WAITING_FOR_FRESH_EVIDENCE"
  | "CONFLICTING_MOMENTUM"
  | "MOMENTUM_NOT_CONFIRMED"
  | "CONFIRMED_BULLISH"
  | "CONFIRMED_BEARISH";

export type ConfirmationVote =
  | "BULLISH"
  | "BEARISH"
  | "NEUTRAL"
  | "UNAVAILABLE";

export interface ConfirmationTimeframeVotes {
  timeframe: "5M" | "15M";
  ageMs: number;
  diVote: ConfirmationVote;
  macdHistogramVote: ConfirmationVote;
  emaSlopeVote: ConfirmationVote;
  classification: "BULLISH_SUPPORT" | "BEARISH_SUPPORT" | "MIXED_NEUTRAL";
}

export interface TouchAwareConfirmationReviewInput {
  pullbackZoneTouchEvidence?: unknown;
  pullbackTriggerThresholds?: unknown;
  resolverDrivenPullbackGate?: unknown;
  multiTimeframeIndicatorEvidence?: unknown;
}

export interface TouchAwareConfirmationReview {
  schemaVersion: 1;
  source: "TOUCH_AWARE_CONFIRMATION_REVIEW_V1";
  readiness: "REVIEW_NOT_ACTIVATION";
  status: TouchAwareConfirmationReviewStatus;
  alignedDirection: "LONG" | "SHORT" | "UNKNOWN";
  touchStatus: string;
  touchType: "RAW_ZONE_TOUCHED" | "EXPANDED_ZONE_TOUCHED" | null;
  confirmationWindowStatus: string;
  currentPrice: number | null;
  triggerPrice: number | null;
  rawZoneLow: number | null;
  rawZoneHigh: number | null;
  expandedZoneLow: number | null;
  expandedZoneHigh: number | null;
  bestRR: number | null;
  rrThreshold: number | null;
  rrReady: boolean;
  confirmationStatus: TouchAwareConfirmationStatus;
  confirmationTimeframesUsed: Array<"5M" | "15M">;
  confirmationVotes: ConfirmationTimeframeVotes[];
  shouldPromoteToReview: boolean;
  blockers: string[];
  nextAction: string;
  activationAllowed: false;
  paperActivationAllowed: false;
  liveActivationAllowed: false;
  reviewOnly: true;
  shadowOnly: true;
}

type AnyObj = Record<string, unknown>;
type AlignedDirection = "LONG" | "SHORT";

interface ValidContext {
  direction: AlignedDirection;
  touchStatus: string;
  touchType: "RAW_ZONE_TOUCHED" | "EXPANDED_ZONE_TOUCHED" | null;
  confirmationWindowStatus: string;
  currentPrice: number;
  triggerPrice: number;
  rawZoneLow: number;
  rawZoneHigh: number;
  expandedZoneLow: number;
  expandedZoneHigh: number;
  bestRR: number | null;
  rrThreshold: number | null;
  rrReady: boolean;
  safetyValid: boolean;
}

function obj(value: unknown): AnyObj {
  return value && typeof value === "object" && !Array.isArray(value) ? value as AnyObj : {};
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function finitePositive(value: unknown): value is number {
  return finite(value) && value > 0;
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function direction(value: unknown): AlignedDirection | null {
  return value === "LONG" || value === "SHORT" ? value : null;
}

function sourceSafetyValid(source: AnyObj): boolean {
  return source.activationAllowed === false
    && source.paperActivationAllowed === false
    && source.liveActivationAllowed === false;
}

function baseOutput(overrides: Partial<TouchAwareConfirmationReview> = {}): TouchAwareConfirmationReview {
  return {
    schemaVersion: 1,
    source: "TOUCH_AWARE_CONFIRMATION_REVIEW_V1",
    readiness: "REVIEW_NOT_ACTIVATION",
    status: "NO_TOUCH_CONTEXT",
    alignedDirection: "UNKNOWN",
    touchStatus: "UNKNOWN",
    touchType: null,
    confirmationWindowStatus: "NOT_AVAILABLE",
    currentPrice: null,
    triggerPrice: null,
    rawZoneLow: null,
    rawZoneHigh: null,
    expandedZoneLow: null,
    expandedZoneHigh: null,
    bestRR: null,
    rrThreshold: null,
    rrReady: false,
    confirmationStatus: "NOT_EVALUATED",
    confirmationTimeframesUsed: [],
    confirmationVotes: [],
    shouldPromoteToReview: false,
    blockers: ["NO_TOUCH_CONTEXT"],
    nextAction: "wait for consistent D8.1-D8.3 touch and resolver context",
    activationAllowed: false,
    paperActivationAllowed: false,
    liveActivationAllowed: false,
    reviewOnly: true,
    shadowOnly: true,
    ...overrides,
  };
}

function readContext(input: TouchAwareConfirmationReviewInput): ValidContext | null {
  const touch = obj(input.pullbackZoneTouchEvidence);
  const trigger = obj(input.pullbackTriggerThresholds);
  const gate = obj(input.resolverDrivenPullbackGate);
  const touchDirection = direction(touch.alignedDirection);
  const triggerDirection = direction(trigger.alignedDirection);
  const gateDirection = direction(gate.alignedDirection);
  const currentPrice = finitePositive(trigger.currentPrice) ? trigger.currentPrice : null;
  const triggerPrice = finitePositive(trigger.triggerPrice) ? trigger.triggerPrice : null;
  const rawZoneLow = finitePositive(trigger.rawZoneLow) ? trigger.rawZoneLow : null;
  const rawZoneHigh = finitePositive(trigger.rawZoneHigh) ? trigger.rawZoneHigh : null;
  const expandedZoneLow = finitePositive(trigger.expandedZoneLow) ? trigger.expandedZoneLow : null;
  const expandedZoneHigh = finitePositive(trigger.expandedZoneHigh) ? trigger.expandedZoneHigh : null;

  if (
    !touchDirection || touchDirection !== triggerDirection || touchDirection !== gateDirection
    || currentPrice == null || triggerPrice == null
    || rawZoneLow == null || rawZoneHigh == null
    || expandedZoneLow == null || expandedZoneHigh == null
    || rawZoneLow > rawZoneHigh || expandedZoneLow > expandedZoneHigh
    || trigger.status === "NO_GATE" || touch.status === "NO_TRIGGER_CONTEXT"
    || gate.status === "NO_ALIGNED_RESOLUTION"
  ) {
    return null;
  }

  const touchType = touch.touchType === "RAW_ZONE_TOUCHED" || touch.touchType === "EXPANDED_ZONE_TOUCHED"
    ? touch.touchType
    : null;

  return {
    direction: touchDirection,
    touchStatus: stringValue(touch.status, "UNKNOWN"),
    touchType,
    confirmationWindowStatus: stringValue(touch.confirmationWindowStatus, "NOT_AVAILABLE"),
    currentPrice,
    triggerPrice,
    rawZoneLow,
    rawZoneHigh,
    expandedZoneLow,
    expandedZoneHigh,
    bestRR: finite(trigger.bestRR) ? trigger.bestRR : null,
    rrThreshold: finite(trigger.rrThreshold) ? trigger.rrThreshold : null,
    rrReady: trigger.rrReady === true,
    safetyValid: sourceSafetyValid(touch) && sourceSafetyValid(trigger) && sourceSafetyValid(gate),
  };
}

function contextOutput(context: ValidContext): Pick<TouchAwareConfirmationReview,
  | "alignedDirection"
  | "touchStatus"
  | "touchType"
  | "confirmationWindowStatus"
  | "currentPrice"
  | "triggerPrice"
  | "rawZoneLow"
  | "rawZoneHigh"
  | "expandedZoneLow"
  | "expandedZoneHigh"
  | "bestRR"
  | "rrThreshold"
  | "rrReady"
> {
  return {
    alignedDirection: context.direction,
    touchStatus: context.touchStatus,
    touchType: context.touchType,
    confirmationWindowStatus: context.confirmationWindowStatus,
    currentPrice: context.currentPrice,
    triggerPrice: context.triggerPrice,
    rawZoneLow: context.rawZoneLow,
    rawZoneHigh: context.rawZoneHigh,
    expandedZoneLow: context.expandedZoneLow,
    expandedZoneHigh: context.expandedZoneHigh,
    bestRR: context.bestRR,
    rrThreshold: context.rrThreshold,
    rrReady: context.rrReady,
  };
}

function earlyOutput(
  context: ValidContext,
  status: TouchAwareConfirmationReviewStatus,
  blocker: string,
  nextAction: string,
): TouchAwareConfirmationReview {
  return baseOutput({
    ...contextOutput(context),
    status,
    blockers: [blocker],
    nextAction,
  });
}

function signedVote(value: unknown): ConfirmationVote {
  if (!finite(value)) return "UNAVAILABLE";
  if (value > 0) return "BULLISH";
  if (value < 0) return "BEARISH";
  return "NEUTRAL";
}

function diVote(record: AnyObj): ConfirmationVote {
  if (!finite(record.plusDI) || !finite(record.minusDI)) return "UNAVAILABLE";
  if (record.plusDI > record.minusDI) return "BULLISH";
  if (record.minusDI > record.plusDI) return "BEARISH";
  return "NEUTRAL";
}

function classification(votes: ConfirmationVote[]): ConfirmationTimeframeVotes["classification"] {
  const bullish = votes.includes("BULLISH");
  const bearish = votes.includes("BEARISH");
  if (bullish && !bearish) return "BULLISH_SUPPORT";
  if (bearish && !bullish) return "BEARISH_SUPPORT";
  return "MIXED_NEUTRAL";
}

function timeframeVotes(
  evidence: AnyObj,
  timeframe: "5M" | "15M",
  maxAgeMs: number,
): ConfirmationTimeframeVotes | null {
  const record = obj(evidence[timeframe]);
  const ageMs = obj(record.freshness).ageMs;
  if (!finite(ageMs) || ageMs < 0 || ageMs > maxAgeMs) return null;

  const di = diVote(record);
  const macd = signedVote(record.macdHistogram);
  const slope = signedVote(record.emaSlope);
  const votes = [di, macd, slope];
  if (votes.every((vote) => vote === "UNAVAILABLE")) return null;

  return {
    timeframe,
    ageMs,
    diVote: di,
    macdHistogramVote: macd,
    emaSlopeVote: slope,
    classification: classification(votes),
  };
}

export function evaluateTouchAwareConfirmationReview(
  input: TouchAwareConfirmationReviewInput,
): TouchAwareConfirmationReview {
  const context = readContext(input);
  if (!context) return baseOutput();

  if (context.touchStatus === "INVALIDATION_RISK_TOUCHED") {
    return earlyOutput(
      context,
      "INVALIDATION_REVIEW_REQUIRED",
      "INVALIDATION_RISK_TOUCHED",
      "re-evaluate resolver and zone geometry before review",
    );
  }
  if (context.touchStatus !== "CONFIRMATION_WINDOW_ACTIVE") {
    return earlyOutput(
      context,
      "TOUCH_WINDOW_INACTIVE",
      "TOUCH_WINDOW_INACTIVE",
      "wait for a new aligned pullback zone touch",
    );
  }
  if (!context.rrReady) {
    return earlyOutput(
      context,
      "RR_NOT_READY",
      "RR_NOT_READY",
      "wait for improved resolver RR geometry",
    );
  }
  if (!context.safetyValid) {
    return earlyOutput(
      context,
      "SOURCE_SAFETY_INVALID",
      "SOURCE_SAFETY_INVALID",
      "retain diagnostics until D8.1-D8.3 review-only source safety is valid",
    );
  }

  const evidence = obj(input.multiTimeframeIndicatorEvidence);
  const votes = [
    timeframeVotes(evidence, "5M", FIVE_MINUTE_FRESH_MS),
    timeframeVotes(evidence, "15M", FIFTEEN_MINUTE_FRESH_MS),
  ].filter((value): value is ConfirmationTimeframeVotes => value != null);
  const timeframes = votes.map((vote) => vote.timeframe);

  if (!votes.length) {
    return baseOutput({
      ...contextOutput(context),
      status: "WAITING_FOR_FRESH_CONFIRMATION",
      confirmationStatus: "WAITING_FOR_FRESH_EVIDENCE",
      confirmationTimeframesUsed: [],
      confirmationVotes: [],
      blockers: ["FRESH_CONFIRMATION_EVIDENCE_MISSING"],
      nextAction: "wait for a fresh usable 5M or 15M indicator cycle",
    });
  }

  const conflictingClass = context.direction === "LONG" ? "BEARISH_SUPPORT" : "BULLISH_SUPPORT";
  const alignedClass = context.direction === "LONG" ? "BULLISH_SUPPORT" : "BEARISH_SUPPORT";
  const conflicting = votes.some((vote) => vote.classification === conflictingClass);
  const aligned = votes.some((vote) => vote.classification === alignedClass);

  if (conflicting) {
    return baseOutput({
      ...contextOutput(context),
      status: "CONFIRMATION_CONFLICTING",
      confirmationStatus: "CONFLICTING_MOMENTUM",
      confirmationTimeframesUsed: timeframes,
      confirmationVotes: votes,
      blockers: ["MOMENTUM_CONFLICT"],
      nextAction: `wait for non-conflicting ${context.direction} momentum confirmation`,
    });
  }
  if (!aligned) {
    return baseOutput({
      ...contextOutput(context),
      status: "CONFIRMATION_NOT_ALIGNED",
      confirmationStatus: "MOMENTUM_NOT_CONFIRMED",
      confirmationTimeframesUsed: timeframes,
      confirmationVotes: votes,
      blockers: ["MOMENTUM_NOT_CONFIRMED"],
      nextAction: `wait for clean aligned ${context.direction} momentum confirmation`,
    });
  }

  return baseOutput({
    ...contextOutput(context),
    status: "PROMOTABLE_REVIEW_CANDIDATE",
    confirmationStatus: context.direction === "LONG" ? "CONFIRMED_BULLISH" : "CONFIRMED_BEARISH",
    confirmationTimeframesUsed: timeframes,
    confirmationVotes: votes,
    shouldPromoteToReview: true,
    blockers: [],
    nextAction: "manual review of the aligned candidate only; no activation or order action",
  });
}
