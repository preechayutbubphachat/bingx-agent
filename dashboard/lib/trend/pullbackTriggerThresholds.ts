// dashboard/lib/trend/pullbackTriggerThresholds.ts
// D8.2 - pure direction-aware trigger and review-promotion diagnostics.

export type PullbackTriggerThresholdStatus =
  | "NO_GATE"
  | "WAITING_FOR_TRIGGER_PRICE"
  | "INSIDE_EXPANDED_ZONE"
  | "INSIDE_RAW_ZONE"
  | "BEYOND_ZONE_INVALIDATION_RISK"
  | "READY_FOR_CONFIRMATION_REVIEW";

export interface PullbackTriggerThresholdsInput {
  resolverDrivenPullbackGate?: unknown;
}

export interface PullbackTriggerThresholds {
  schemaVersion: 1;
  source: "PULLBACK_TRIGGER_THRESHOLDS_V1";
  readiness: "REVIEW_NOT_ACTIVATION";
  status: PullbackTriggerThresholdStatus;
  alignedDirection: "LONG" | "SHORT" | "UNKNOWN";
  currentPrice: number | null;
  rawZoneLow: number | null;
  rawZoneHigh: number | null;
  expandedZoneLow: number | null;
  expandedZoneHigh: number | null;
  triggerPrice: number | null;
  rawZoneTriggerPrice: number | null;
  distanceToTriggerAbs: number | null;
  distanceToTriggerPct: number | null;
  bestRR: number | null;
  rrThreshold: number | null;
  rrReady: boolean;
  confirmationRequired: boolean;
  promotionBlockedBy: string[];
  nextAction: string;
  activationAllowed: false;
  paperActivationAllowed: false;
  liveActivationAllowed: false;
  reviewOnly: true;
  shadowOnly: true;
}

type AnyObj = Record<string, unknown>;
type AlignedDirection = "LONG" | "SHORT";
type PriceLocation =
  | "WAITING_FOR_TRIGGER_PRICE"
  | "INSIDE_EXPANDED_ZONE"
  | "INSIDE_RAW_ZONE"
  | "BEYOND_ZONE_INVALIDATION_RISK";

function obj(value: unknown): AnyObj {
  return value && typeof value === "object" && !Array.isArray(value) ? value as AnyObj : {};
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function direction(value: unknown): AlignedDirection | null {
  return value === "LONG" || value === "SHORT" ? value : null;
}

function normalizeZone(value: unknown): [number, number] | null {
  if (!Array.isArray(value) || value.length !== 2 || !finite(value[0]) || !finite(value[1])) return null;
  if (value[0] <= 0 || value[1] <= 0) return null;
  return value[0] <= value[1] ? [value[0], value[1]] : [value[1], value[0]];
}

function baseOutput(overrides: Partial<PullbackTriggerThresholds> = {}): PullbackTriggerThresholds {
  return {
    schemaVersion: 1,
    source: "PULLBACK_TRIGGER_THRESHOLDS_V1",
    readiness: "REVIEW_NOT_ACTIVATION",
    status: "NO_GATE",
    alignedDirection: "UNKNOWN",
    currentPrice: null,
    rawZoneLow: null,
    rawZoneHigh: null,
    expandedZoneLow: null,
    expandedZoneHigh: null,
    triggerPrice: null,
    rawZoneTriggerPrice: null,
    distanceToTriggerAbs: null,
    distanceToTriggerPct: null,
    bestRR: null,
    rrThreshold: null,
    rrReady: false,
    confirmationRequired: false,
    promotionBlockedBy: ["NO_VALID_PULLBACK_GATE"],
    nextAction: "wait for a valid D8.1 resolver-driven pullback gate",
    activationAllowed: false,
    paperActivationAllowed: false,
    liveActivationAllowed: false,
    reviewOnly: true,
    shadowOnly: true,
    ...overrides,
  };
}

function classifyLocation(input: {
  direction: AlignedDirection;
  currentPrice: number;
  zoneLow: number;
  zoneHigh: number;
  expandedLow: number;
  expandedHigh: number;
}): PriceLocation {
  if (input.direction === "LONG") {
    if (input.currentPrice < input.expandedLow) return "BEYOND_ZONE_INVALIDATION_RISK";
    if (input.currentPrice > input.expandedHigh) return "WAITING_FOR_TRIGGER_PRICE";
  } else {
    if (input.currentPrice > input.expandedHigh) return "BEYOND_ZONE_INVALIDATION_RISK";
    if (input.currentPrice < input.expandedLow) return "WAITING_FOR_TRIGGER_PRICE";
  }

  if (input.currentPrice >= input.zoneLow && input.currentPrice <= input.zoneHigh) {
    return "INSIDE_RAW_ZONE";
  }
  return "INSIDE_EXPANDED_ZONE";
}

function confirmationBlocker(status: unknown, directionValue: AlignedDirection): string | null {
  if (status === (directionValue === "LONG" ? "CONFIRMED_BULLISH" : "CONFIRMED_BEARISH")) return null;
  if (status === "NOT_EVALUATED_OUTSIDE_ZONE" || status === "UNKNOWN" || typeof status !== "string") {
    return "CONFIRMATION_NOT_EVALUATED";
  }
  return "CONFIRMATION_NOT_ALIGNED";
}

function nextAction(input: {
  status: PullbackTriggerThresholdStatus;
  direction: AlignedDirection;
  triggerPrice: number;
  blockers: string[];
}): string {
  if (input.status === "WAITING_FOR_TRIGGER_PRICE") {
    const relation = input.direction === "LONG" ? "or lower" : "or higher";
    return `wait for price to reach ${input.triggerPrice.toFixed(2)} ${relation}, then evaluate confirmation`;
  }
  if (input.status === "BEYOND_ZONE_INVALIDATION_RISK") {
    return "refresh the aligned resolver geometry before further candidate review";
  }
  if (input.status === "READY_FOR_CONFIRMATION_REVIEW") {
    return "review the aligned confirmed candidate; no activation or order action";
  }
  if (input.blockers.includes("RR_NOT_READY")) {
    return "wait for resolver RR to pass before candidate review";
  }
  if (input.blockers.includes("CONFIRMATION_NOT_EVALUATED")) {
    return "evaluate fresh aligned confirmation now that price is in the trigger zone";
  }
  if (input.blockers.includes("CONFIRMATION_NOT_ALIGNED")) {
    return "wait for fresh non-conflicting aligned confirmation";
  }
  return "keep the candidate in review-only diagnostics";
}

export function evaluatePullbackTriggerThresholds(
  input: PullbackTriggerThresholdsInput,
): PullbackTriggerThresholds {
  const gate = obj(input.resolverDrivenPullbackGate);
  const alignedDirection = direction(gate.alignedDirection);
  const currentPrice = finite(gate.currentPrice) && gate.currentPrice > 0 ? gate.currentPrice : null;
  const zone = normalizeZone(gate.zone);
  const tolerance = finite(gate.zoneTolerance) && gate.zoneTolerance >= 0 ? gate.zoneTolerance : null;
  const gateStatus = typeof gate.status === "string" ? gate.status : "UNKNOWN";

  if (!alignedDirection || currentPrice == null || !zone || tolerance == null || gateStatus === "NO_ALIGNED_RESOLUTION") {
    return baseOutput();
  }

  const [zoneLow, zoneHigh] = zone;
  const expandedLow = zoneLow - tolerance;
  const expandedHigh = zoneHigh + tolerance;
  if (expandedLow <= 0 || expandedHigh <= 0) return baseOutput();

  const triggerPrice = alignedDirection === "LONG" ? expandedHigh : expandedLow;
  const rawZoneTriggerPrice = alignedDirection === "LONG" ? zoneHigh : zoneLow;
  const distanceToTriggerAbs = alignedDirection === "LONG"
    ? Math.max(0, currentPrice - triggerPrice)
    : Math.max(0, triggerPrice - currentPrice);
  const location = classifyLocation({
    direction: alignedDirection,
    currentPrice,
    zoneLow,
    zoneHigh,
    expandedLow,
    expandedHigh,
  });
  const bestRR = finite(gate.bestRR) ? gate.bestRR : null;
  const rrThreshold = finite(gate.rrThreshold) ? gate.rrThreshold : null;
  const rrReady = gate.rrStatus === "PASS" && bestRR != null && rrThreshold != null && rrThreshold > 0 && bestRR >= rrThreshold;
  const confirmation = confirmationBlocker(gate.confirmationStatus, alignedDirection);
  const sourceSafetyValid = gate.activationAllowed === false
    && gate.paperActivationAllowed === false
    && gate.liveActivationAllowed === false;
  const blockers: string[] = [];

  if (location === "WAITING_FOR_TRIGGER_PRICE") blockers.push("PRICE_NOT_AT_TRIGGER");
  if (location === "BEYOND_ZONE_INVALIDATION_RISK") blockers.push("PRICE_BEYOND_EXPANDED_ZONE");
  if (!rrReady) blockers.push("RR_NOT_READY");
  if (confirmation) blockers.push(confirmation);
  if (!sourceSafetyValid) blockers.push("SOURCE_SAFETY_FLAGS_INVALID");

  const locationEligible = location === "INSIDE_RAW_ZONE" || location === "INSIDE_EXPANDED_ZONE";
  const status: PullbackTriggerThresholdStatus = locationEligible && blockers.length === 0
    ? "READY_FOR_CONFIRMATION_REVIEW"
    : location;

  return baseOutput({
    status,
    alignedDirection,
    currentPrice,
    rawZoneLow: zoneLow,
    rawZoneHigh: zoneHigh,
    expandedZoneLow: expandedLow,
    expandedZoneHigh: expandedHigh,
    triggerPrice,
    rawZoneTriggerPrice,
    distanceToTriggerAbs,
    distanceToTriggerPct: distanceToTriggerAbs / currentPrice * 100,
    bestRR,
    rrThreshold,
    rrReady,
    confirmationRequired: true,
    promotionBlockedBy: blockers,
    nextAction: nextAction({ status, direction: alignedDirection, triggerPrice, blockers }),
  });
}
