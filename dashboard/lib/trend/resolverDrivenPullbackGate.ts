// dashboard/lib/trend/resolverDrivenPullbackGate.ts
// D8.1 - pure resolver-driven pullback and confirmation diagnostics.

const FIVE_MINUTE_FRESH_MS = 15 * 60 * 1000;
const FIFTEEN_MINUTE_FRESH_MS = 45 * 60 * 1000;
const PRICE_TOLERANCE_RATIO = 0.0005;
const ATR_TOLERANCE_RATIO = 0.10;

export type ResolverDrivenPullbackGateStatus =
  | "NO_ALIGNED_RESOLUTION"
  | "WAITING_PULLBACK"
  | "PRICE_IN_ALIGNED_ZONE"
  | "RR_READY_WAITING_CONFIRMATION"
  | "CONFIRMATION_PENDING"
  | "CLEAN_REVIEW_CANDIDATE"
  | "NO_TRADE_BAD_RR";

export type PullbackRrStatus = "PASS" | "FAIL" | "UNKNOWN";

export type PullbackConfirmationStatus =
  | "NOT_EVALUATED_OUTSIDE_ZONE"
  | "WAITING_FOR_FRESH_EVIDENCE"
  | "CONFLICTING_MOMENTUM"
  | "MOMENTUM_NOT_CONFIRMED"
  | "CONFIRMED_BULLISH"
  | "CONFIRMED_BEARISH"
  | "UNKNOWN";

export interface ResolverDrivenPullbackGateInput {
  entryCandidateResolution?: unknown;
  multiTimeframeIndicatorEvidence?: unknown;
}

export interface ResolverDrivenPullbackGate {
  schemaVersion: 1;
  source: "RESOLVER_DRIVEN_PULLBACK_GATE_V1";
  readiness: "REVIEW_NOT_ACTIVATION";
  status: ResolverDrivenPullbackGateStatus;
  alignedDirection: "LONG" | "SHORT" | "UNKNOWN";
  currentPrice: number | null;
  zone: [number, number] | null;
  zoneTolerance: number | null;
  priceDistanceToZonePct: number | null;
  bestRR: number | null;
  rrThreshold: number | null;
  rrStatus: PullbackRrStatus;
  confirmationStatus: PullbackConfirmationStatus;
  blockers: string[];
  nextAction: string;
  doNotDo: string[];
  activationAllowed: false;
  paperActivationAllowed: false;
  liveActivationAllowed: false;
  reviewOnly: true;
  shadowOnly: true;
}

type AnyObj = Record<string, unknown>;
type AlignedDirection = "LONG" | "SHORT";
type TimeframeDirection = "BULLISH" | "BEARISH" | "NEUTRAL";

function obj(value: unknown): AnyObj {
  return value && typeof value === "object" && !Array.isArray(value) ? value as AnyObj : {};
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function normalizeZone(value: unknown): [number, number] | null {
  if (!Array.isArray(value) || value.length !== 2 || !finite(value[0]) || !finite(value[1])) return null;
  if (value[0] <= 0 || value[1] <= 0) return null;
  return value[0] <= value[1] ? [value[0], value[1]] : [value[1], value[0]];
}

function direction(value: unknown): AlignedDirection | null {
  return value === "LONG" || value === "SHORT" ? value : null;
}

function freshRecord(value: unknown, maxAgeMs: number): AnyObj | null {
  const record = obj(value);
  const freshness = obj(record.freshness);
  const ageMs = freshness.ageMs;
  if (!finite(ageMs) || ageMs < 0 || ageMs > maxAgeMs) return null;
  return record;
}

function zoneTolerance(currentPrice: number, evidenceInput: unknown): number {
  const evidence = obj(evidenceInput);
  const evidence15m = freshRecord(evidence["15M"], FIFTEEN_MINUTE_FRESH_MS);
  const atr = evidence15m && finite(evidence15m.atr) && evidence15m.atr > 0 ? evidence15m.atr : null;
  const priceFloor = currentPrice * PRICE_TOLERANCE_RATIO;
  return atr == null ? priceFloor : Math.max(atr * ATR_TOLERANCE_RATIO, priceFloor);
}

function distanceToRawZonePct(currentPrice: number, zone: [number, number]): number {
  if (currentPrice >= zone[0] && currentPrice <= zone[1]) return 0;
  const edge = currentPrice < zone[0] ? zone[0] : zone[1];
  return Math.abs(currentPrice - edge) / currentPrice * 100;
}

function inExpandedZone(currentPrice: number, zone: [number, number], tolerance: number): boolean {
  return currentPrice >= zone[0] - tolerance && currentPrice <= zone[1] + tolerance;
}

function rrStatus(bestRR: number | null, threshold: number | null): PullbackRrStatus {
  if (!finite(bestRR) || !finite(threshold) || threshold <= 0) return "UNKNOWN";
  return bestRR >= threshold ? "PASS" : "FAIL";
}

function vote(positive: boolean, negative: boolean): TimeframeDirection {
  if (positive && !negative) return "BULLISH";
  if (negative && !positive) return "BEARISH";
  return "NEUTRAL";
}

function timeframeDirection(record: AnyObj): TimeframeDirection | null {
  const votes: TimeframeDirection[] = [];
  if (finite(record.plusDI) && finite(record.minusDI)) {
    votes.push(vote(record.plusDI > record.minusDI, record.minusDI > record.plusDI));
  }
  if (finite(record.macdHistogram)) {
    votes.push(vote(record.macdHistogram > 0, record.macdHistogram < 0));
  }
  if (finite(record.emaSlope)) {
    votes.push(vote(record.emaSlope > 0, record.emaSlope < 0));
  }
  if (!votes.length) return null;
  const bullish = votes.includes("BULLISH");
  const bearish = votes.includes("BEARISH");
  return vote(bullish, bearish);
}

function confirmationStatus(
  alignedDirection: AlignedDirection,
  evidenceInput: unknown,
): PullbackConfirmationStatus {
  const evidence = obj(evidenceInput);
  const records = [
    freshRecord(evidence["5M"], FIVE_MINUTE_FRESH_MS),
    freshRecord(evidence["15M"], FIFTEEN_MINUTE_FRESH_MS),
  ].filter((record): record is AnyObj => record != null);
  const directions = records
    .map(timeframeDirection)
    .filter((value): value is TimeframeDirection => value != null);

  if (!directions.length) return "WAITING_FOR_FRESH_EVIDENCE";

  if (alignedDirection === "LONG") {
    if (directions.includes("BEARISH")) return "CONFLICTING_MOMENTUM";
    if (directions.includes("BULLISH")) return "CONFIRMED_BULLISH";
    return "MOMENTUM_NOT_CONFIRMED";
  }

  if (directions.includes("BULLISH")) return "CONFLICTING_MOMENTUM";
  if (directions.includes("BEARISH")) return "CONFIRMED_BEARISH";
  return "MOMENTUM_NOT_CONFIRMED";
}

function statusFor(input: {
  inZone: boolean;
  rrStatus: PullbackRrStatus;
  confirmationStatus: PullbackConfirmationStatus;
}): ResolverDrivenPullbackGateStatus {
  if (!input.inZone) return "WAITING_PULLBACK";
  if (input.rrStatus === "UNKNOWN") return "PRICE_IN_ALIGNED_ZONE";
  if (input.rrStatus === "FAIL") return "NO_TRADE_BAD_RR";
  if (input.confirmationStatus === "WAITING_FOR_FRESH_EVIDENCE") return "RR_READY_WAITING_CONFIRMATION";
  if (input.confirmationStatus === "CONFIRMED_BULLISH" || input.confirmationStatus === "CONFIRMED_BEARISH") {
    return "CLEAN_REVIEW_CANDIDATE";
  }
  return "CONFIRMATION_PENDING";
}

function statusDetails(
  status: ResolverDrivenPullbackGateStatus,
  alignedDirection: AlignedDirection | null,
  confirmation: PullbackConfirmationStatus,
): { blockers: string[]; nextAction: string } {
  switch (status) {
    case "WAITING_PULLBACK":
      return {
        blockers: ["CURRENT_PRICE_OUTSIDE_ALIGNED_ZONE"],
        nextAction: `wait for current price to enter the aligned ${alignedDirection ?? "trend"} zone`,
      };
    case "PRICE_IN_ALIGNED_ZONE":
      return { blockers: ["RR_EVIDENCE_MISSING"], nextAction: "refresh resolver RR geometry before candidate review" };
    case "NO_TRADE_BAD_RR":
      return { blockers: ["BEST_RR_BELOW_THRESHOLD"], nextAction: "wait for better entry, stop, or target geometry" };
    case "RR_READY_WAITING_CONFIRMATION":
      return { blockers: ["FRESH_CONFIRMATION_EVIDENCE_MISSING"], nextAction: "wait for the next fresh 5M or 15M confirmation cycle" };
    case "CONFIRMATION_PENDING":
      return {
        blockers: [confirmation === "CONFLICTING_MOMENTUM" ? "MOMENTUM_CONFLICT" : "MOMENTUM_NOT_CONFIRMED"],
        nextAction: `wait for non-conflicting ${alignedDirection ?? "aligned"} momentum confirmation`,
      };
    case "CLEAN_REVIEW_CANDIDATE":
      return { blockers: [], nextAction: "review the aligned pullback candidate; no activation or order action" };
    default:
      return { blockers: ["NO_ALIGNED_RESOLUTION"], nextAction: "wait for a valid D8.0 aligned entry resolution" };
  }
}

function baseOutput(overrides: Partial<ResolverDrivenPullbackGate>): ResolverDrivenPullbackGate {
  return {
    schemaVersion: 1,
    source: "RESOLVER_DRIVEN_PULLBACK_GATE_V1",
    readiness: "REVIEW_NOT_ACTIVATION",
    status: "NO_ALIGNED_RESOLUTION",
    alignedDirection: "UNKNOWN",
    currentPrice: null,
    zone: null,
    zoneTolerance: null,
    priceDistanceToZonePct: null,
    bestRR: null,
    rrThreshold: null,
    rrStatus: "UNKNOWN",
    confirmationStatus: "UNKNOWN",
    blockers: ["NO_ALIGNED_RESOLUTION"],
    nextAction: "wait for a valid D8.0 aligned entry resolution",
    doNotDo: [
      "do not treat diagnostics as an entry signal",
      "do not activate paper or live trading",
      "do not place or cancel orders",
    ],
    activationAllowed: false,
    paperActivationAllowed: false,
    liveActivationAllowed: false,
    reviewOnly: true,
    shadowOnly: true,
    ...overrides,
  };
}

export function evaluateResolverDrivenPullbackGate(
  input: ResolverDrivenPullbackGateInput,
): ResolverDrivenPullbackGate {
  const resolution = obj(input.entryCandidateResolution);
  const resolutionStatus = typeof resolution.status === "string" ? resolution.status : "UNKNOWN";
  const alignedDirection = direction(resolution.alignedDirection);
  const currentPrice = finite(resolution.currentPrice) && resolution.currentPrice > 0 ? resolution.currentPrice : null;
  const zone = normalizeZone(resolution.alignedEntryZone);

  if (
    !alignedDirection ||
    currentPrice == null ||
    !zone ||
    resolutionStatus === "NO_ALIGNED_SETUP" ||
    resolutionStatus === "COUNTER_REGIME_ONLY"
  ) {
    return baseOutput({});
  }

  const best = obj(resolution.bestReviewCandidate);
  const bestRR = finite(best.rr) ? best.rr : null;
  const threshold = finite(resolution.rrThreshold) ? resolution.rrThreshold : null;
  const tolerance = zoneTolerance(currentPrice, input.multiTimeframeIndicatorEvidence);
  const inZone = inExpandedZone(currentPrice, zone, tolerance);
  const rr = rrStatus(bestRR, threshold);
  const confirmation = inZone
    ? confirmationStatus(alignedDirection, input.multiTimeframeIndicatorEvidence)
    : "NOT_EVALUATED_OUTSIDE_ZONE";
  const status = statusFor({ inZone, rrStatus: rr, confirmationStatus: confirmation });
  const details = statusDetails(status, alignedDirection, confirmation);

  return baseOutput({
    status,
    alignedDirection,
    currentPrice,
    zone,
    zoneTolerance: tolerance,
    priceDistanceToZonePct: distanceToRawZonePct(currentPrice, zone),
    bestRR,
    rrThreshold: threshold,
    rrStatus: rr,
    confirmationStatus: confirmation,
    blockers: details.blockers,
    nextAction: details.nextAction,
  });
}
