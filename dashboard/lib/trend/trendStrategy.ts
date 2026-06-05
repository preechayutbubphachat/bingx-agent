import type { IndicatorGate } from "../grid/indicatorGate.ts";
import type { CanonicalMarketRegime, MultiTimeframeIndicatorEvidence } from "../market-regime/canonicalMarketRegime.ts";
import type { TrendZoneShadow } from "../market-regime/trendZoneBuilder.ts";

export type TrendStrategyStatus =
  | "NO_TRADE"
  | "WATCHING_PULLBACK"
  | "SETUP_READY"
  | "AWAITING_CONFIRMATION"
  | "RISK_REJECTED"
  | "INVALIDATED";

export type TrendStrategyDirection = "LONG" | "SHORT" | null;

export type TrendConfirmationStatus =
  | "NOT_REQUIRED"
  | "WAITING_5M_CONFIRM"
  | "CONFIRMED"
  | "FAILED"
  | "INSUFFICIENT_DATA";

export type TrendRiskStatus =
  | "PASS"
  | "NO_TRADE_NEAR_TARGET"
  | "NO_TRADE_BAD_RR"
  | "NO_TRADE_STALE_DATA"
  | "NO_TRADE_VOLATILITY"
  | "NO_TRADE_CONFLICTING_FLOW"
  | "NO_TRADE_OLD_EXPOSURE";

export interface TrendStrategyInput {
  canonicalMarketRegime: CanonicalMarketRegime | null | undefined;
  indicatorGate: IndicatorGate | null | undefined;
  trendZoneCandidate: TrendZoneShadow | null | undefined;
  multiTimeframeIndicatorEvidence: MultiTimeframeIndicatorEvidence | null | undefined;
  currentPrice: number | null | undefined;
  priceVsGrid: string | null | undefined;
  session: string | null | undefined;
  derivatives: unknown;
  obGate: unknown;
  oldGridExposure: unknown;
  freshness: { stale?: boolean | null; warnings?: string[] | null } | null | undefined;
  minRewardRisk?: number;
  nearTargetThresholdPct?: number;
}

export interface TrendStrategy {
  enabled: false;
  phase: "T-1_SHADOW";
  status: TrendStrategyStatus;
  direction: TrendStrategyDirection;
  setupReason: string | null;
  entryZone: [number, number] | null;
  currentPrice: number | null;
  distanceToEntryZonePct: number | null;
  invalidation: number | null;
  target1: number | null;
  target2: number | null;
  rewardRisk: number | null;
  confirmationRequired: boolean;
  confirmationStatus: TrendConfirmationStatus;
  riskStatus: TrendRiskStatus;
  oldExposurePolicy: "QUARANTINE_OLD_GRID_EXPOSURE";
  countTowardGridClosedCycles: false;
  countTowardTrendEvidence: false;
  paperActivationAllowed: false;
  liveActivationAllowed: false;
  shadowOnly: true;
  reasons: string[];
  warnings: string[];
}

export interface TrendPaperEpoch {
  epochId: string;
  source: "TREND_STRATEGY";
  phase: "T-1_SHADOW";
  status: TrendStrategyStatus;
  direction: TrendStrategyDirection;
  oldGridExposurePolicy: "QUARANTINE_OLD_GRID_EXPOSURE";
  countTowardGridClosedCycles: false;
  countTowardTrendEvidence: false;
}

const DEFAULT_MIN_RR = 1.2;
const DEFAULT_NEAR_TARGET_THRESHOLD_PCT = 0.30;

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function normalizeZone(zone: [number, number] | null | undefined): [number, number] | null {
  if (!Array.isArray(zone) || zone.length !== 2 || !finite(zone[0]) || !finite(zone[1])) return null;
  return zone[0] <= zone[1] ? [zone[0], zone[1]] : [zone[1], zone[0]];
}

function pctDistance(a: number, b: number): number {
  return Math.abs(a - b) / Math.max(Math.abs(b), Number.EPSILON) * 100;
}

function distanceToZonePct(price: number | null, zone: [number, number] | null): number | null {
  if (!finite(price) || !zone) return null;
  if (price >= zone[0] && price <= zone[1]) return 0;
  const edge = price < zone[0] ? zone[0] : zone[1];
  return Math.abs(edge - price) / Math.max(Math.abs(price), Number.EPSILON) * 100;
}

function base(input: TrendStrategyInput, overrides: Partial<TrendStrategy>): TrendStrategy {
  return {
    enabled: false,
    phase: "T-1_SHADOW",
    status: "NO_TRADE",
    direction: null,
    setupReason: null,
    entryZone: null,
    currentPrice: finite(input.currentPrice) ? input.currentPrice : null,
    distanceToEntryZonePct: null,
    invalidation: null,
    target1: null,
    target2: null,
    rewardRisk: null,
    confirmationRequired: false,
    confirmationStatus: "NOT_REQUIRED",
    riskStatus: "PASS",
    oldExposurePolicy: "QUARANTINE_OLD_GRID_EXPOSURE",
    countTowardGridClosedCycles: false,
    countTowardTrendEvidence: false,
    paperActivationAllowed: false,
    liveActivationAllowed: false,
    shadowOnly: true,
    reasons: [],
    warnings: [],
    ...overrides,
  };
}

function eligibleDirection(input: TrendStrategyInput): TrendStrategyDirection {
  const regime = input.canonicalMarketRegime?.regime;
  const direction = input.canonicalMarketRegime?.direction;
  const zone = input.trendZoneCandidate;
  if (
    regime === "DOWNTREND" &&
    direction === "BEARISH" &&
    input.indicatorGate?.status === "TREND_DOWN_BLOCK" &&
    zone?.dir === "DOWN" &&
    zone.buildStatus === "READY"
  ) {
    return "SHORT";
  }
  if (
    regime === "UPTREND" &&
    direction === "BULLISH" &&
    zone?.dir === "UP" &&
    zone.buildStatus === "READY"
  ) {
    return "LONG";
  }
  return null;
}

function rewardRisk(direction: Exclude<TrendStrategyDirection, null>, zone: [number, number], invalidation: number, target1: number): number | null {
  const entryReference = (zone[0] + zone[1]) / 2;
  const risk = direction === "SHORT" ? invalidation - entryReference : entryReference - invalidation;
  const reward = direction === "SHORT" ? entryReference - target1 : target1 - entryReference;
  if (!(risk > 0) || !(reward > 0)) return null;
  return reward / risk;
}

export function evaluateTrendStrategy(input: TrendStrategyInput): TrendStrategy {
  const warnings = [...(input.freshness?.warnings ?? [])];
  if (input.freshness?.stale === true) {
    return base(input, {
      status: "NO_TRADE",
      riskStatus: "NO_TRADE_STALE_DATA",
      setupReason: "stale_trend_strategy_inputs",
      reasons: ["stale_trend_strategy_inputs"],
      warnings,
    });
  }

  if (!input.trendZoneCandidate) {
    return base(input, {
      status: "NO_TRADE",
      setupReason: "missing_trend_zone_candidate",
      reasons: ["missing_trend_zone_candidate"],
      warnings,
    });
  }

  const direction = eligibleDirection(input);
  const zone = normalizeZone(input.trendZoneCandidate.pullbackZone);
  const invalidation = input.trendZoneCandidate.invalidation;
  const target1 = input.trendZoneCandidate.targets.t1;
  const target2 = input.trendZoneCandidate.targets.t2;
  const price = finite(input.currentPrice) ? input.currentPrice : null;

  const requiredMissing: string[] = [];
  if (!direction) requiredMissing.push("trend_strategy_eligibility_not_met");
  if (!zone) requiredMissing.push("missing_pullback_zone");
  if (!finite(invalidation)) requiredMissing.push("missing_invalidation");
  if (!finite(target1)) requiredMissing.push("missing_target1");
  if (!finite(price)) requiredMissing.push("missing_current_price");

  if (requiredMissing.length > 0 || !direction || !zone || !finite(invalidation) || !finite(target1) || !finite(price)) {
    return base(input, {
      status: "NO_TRADE",
      direction,
      entryZone: zone,
      currentPrice: price,
      invalidation: finite(invalidation) ? invalidation : null,
      target1: finite(target1) ? target1 : null,
      target2: finite(target2) ? target2 : null,
      setupReason: requiredMissing[0] ?? "trend_strategy_inputs_incomplete",
      reasons: requiredMissing,
      warnings,
    });
  }

  const rr = rewardRisk(direction, zone, invalidation, target1);
  const common = {
    direction,
    entryZone: zone,
    currentPrice: price,
    distanceToEntryZonePct: distanceToZonePct(price, zone),
    invalidation,
    target1,
    target2: finite(target2) ? target2 : null,
    rewardRisk: rr,
    confirmationRequired: true,
    confirmationStatus: "WAITING_5M_CONFIRM" as const,
    warnings,
  };

  const nearTargetThreshold = input.nearTargetThresholdPct ?? DEFAULT_NEAR_TARGET_THRESHOLD_PCT;
  const isNearTarget = pctDistance(price, target1) <= nearTargetThreshold;
  const belowZone = price < zone[0];
  const aboveZone = price > zone[1];
  const insideZone = price >= zone[0] && price <= zone[1];
  const invalidated = direction === "SHORT" ? price > invalidation : price < invalidation;
  const chasing = direction === "SHORT" ? belowZone && isNearTarget : aboveZone && isNearTarget;

  if (invalidated) {
    return base(input, {
      ...common,
      status: "INVALIDATED",
      setupReason: "trend_setup_invalidated",
      reasons: ["trend_setup_invalidated"],
    });
  }

  if (chasing) {
    return base(input, {
      ...common,
      status: "NO_TRADE",
      riskStatus: "NO_TRADE_NEAR_TARGET",
      setupReason: "price_already_near_target_do_not_chase",
      reasons: ["price_already_near_target_do_not_chase"],
    });
  }

  const minRewardRisk = input.minRewardRisk ?? DEFAULT_MIN_RR;
  if (!finite(rr) || rr < minRewardRisk) {
    return base(input, {
      ...common,
      status: "RISK_REJECTED",
      riskStatus: "NO_TRADE_BAD_RR",
      setupReason: "reward_risk_below_minimum",
      reasons: ["reward_risk_below_minimum"],
    });
  }

  const watching = direction === "SHORT" ? belowZone : aboveZone;
  if (watching) {
    return base(input, {
      ...common,
      status: "WATCHING_PULLBACK",
      setupReason: "waiting_for_price_to_return_to_pullback_zone",
      reasons: ["waiting_for_price_to_return_to_pullback_zone"],
    });
  }

  if (insideZone) {
    return base(input, {
      ...common,
      status: "AWAITING_CONFIRMATION",
      setupReason: "price_inside_pullback_zone_waiting_5m_confirm",
      reasons: ["price_inside_pullback_zone_waiting_5m_confirm"],
    });
  }

  return base(input, {
    ...common,
    status: "WATCHING_PULLBACK",
    setupReason: "waiting_for_5m_confirmation_or_better_pullback",
    reasons: ["waiting_for_5m_confirmation_or_better_pullback"],
  });
}

export function buildTrendPaperEpoch(strategy: TrendStrategy): TrendPaperEpoch {
  return {
    epochId: `trend-shadow:${strategy.direction ?? "NONE"}:${strategy.status}`,
    source: "TREND_STRATEGY",
    phase: "T-1_SHADOW",
    status: strategy.status,
    direction: strategy.direction,
    oldGridExposurePolicy: "QUARANTINE_OLD_GRID_EXPOSURE",
    countTowardGridClosedCycles: false,
    countTowardTrendEvidence: false,
  };
}
