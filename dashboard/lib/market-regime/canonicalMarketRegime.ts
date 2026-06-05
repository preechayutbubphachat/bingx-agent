import { getCandlesFromSnapshot } from "../candleAdapter.ts";
import { computeIndicatorEvidence, type IndicatorCandle, type IndicatorEvidence } from "../indicators/computeIndicators.ts";
import { assessMarketRegimeFreshness, type MarketRegimeFreshness } from "./freshness.ts";

export type CanonicalMarketRegimeName =
  | "RANGE"
  | "UPTREND"
  | "DOWNTREND"
  | "VOLATILITY_EXPANSION"
  | "VOLATILITY_COMPRESSION"
  | "EVENT_RISK"
  | "NO_TRADE"
  | "UNKNOWN";

export type CanonicalMarketDirection = "BULLISH" | "BEARISH" | "NEUTRAL" | "UNKNOWN";
export type CanonicalConfidenceLabel = "low" | "medium" | "high";
export type CanonicalTimeframe = "1D" | "4H" | "1H" | "15M" | "5M";

export interface TimeframeIndicatorEvidence extends IndicatorEvidence {
  ema50: number | null;
  ema200: number | null;
}

export type MultiTimeframeIndicatorEvidence = Partial<Record<CanonicalTimeframe | string, TimeframeIndicatorEvidence>>;

export interface CanonicalMarketRegimeInput {
  marketSnapshot: unknown;
  indicatorEvidenceByTimeframe: MultiTimeframeIndicatorEvidence;
  priceVsGrid?: string | null;
  dynamicGridState?: string | null;
  obGate?: unknown;
  derivatives?: unknown;
  orderbook?: unknown;
  session?: unknown;
  newsRisk?: unknown;
  legacyPlanMode?: string | null;
}

export interface CanonicalMarketRegime {
  regime: CanonicalMarketRegimeName;
  direction: CanonicalMarketDirection;
  confidence: number;
  confidenceLabel: CanonicalConfidenceLabel;
  reasons: string[];
  warnings: string[];
  allowedModes: string[];
  blockedModes: string[];
  sourcePriority: string[];
  ignoredLegacyFields: string[];
  sourceFreshness: MarketRegimeFreshness;
  evidenceCompleteness: {
    status: "complete" | "partial" | "missing";
    scorePct: number;
    availableGroups: string[];
    missingGroups: string[];
  };
  trendZoneCandidate?: TrendZoneCandidate | null;
  shadowOnly: true;
  paperActivationAllowed: false;
  liveActivationAllowed: false;
}

export interface TrendZoneCandidate {
  dir: "UP" | "DOWN";
  pullbackZone: null;
  invalidation: null;
  triggerRule: null;
  targets: unknown[];
  smcLevels: unknown[];
  buildStatus: "NEXT_STAGE_ONLY";
  warnings: string[];
}

type AnyObj = Record<string, unknown>;

const TIMEFRAMES: CanonicalTimeframe[] = ["1D", "4H", "1H", "15M", "5M"];
const IMPORTANT_TIMEFRAMES: CanonicalTimeframe[] = ["4H", "1H"];
const ATR_PCT_MAX = 2.5;
const BBW_EXPANSION_LEVEL = 0.08;

function obj(value: unknown): AnyObj {
  return value && typeof value === "object" ? value as AnyObj : {};
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function generatedAtMs(marketSnapshot: unknown): number | null {
  const snapshot = obj(marketSnapshot);
  const meta = obj(snapshot.meta);
  const raw = meta.generated_at ?? meta.generatedAt ?? snapshot.generated_at ?? snapshot.updated_at;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw < 10_000_000_000 ? raw * 1000 : raw;
  if (typeof raw === "string" && raw.trim()) {
    const t = Date.parse(raw);
    return Number.isFinite(t) ? t : null;
  }
  return null;
}

function emaLatest(candles: IndicatorCandle[], period: number): number | null {
  if (candles.length < period) return null;
  const closes = candles.map((c) => c.close);
  const first = closes.slice(0, period).reduce((sum, value) => sum + value, 0) / period;
  const k = 2 / (period + 1);
  let ema = first;
  for (let i = period; i < closes.length; i++) {
    ema = closes[i] * k + ema * (1 - k);
  }
  return ema;
}

export function buildMultiTimeframeIndicatorEvidence(
  marketSnapshot: unknown,
  options: { nowMs?: number } = {},
): MultiTimeframeIndicatorEvidence {
  const nowMs = options.nowMs ?? generatedAtMs(marketSnapshot) ?? Date.now();
  const out: MultiTimeframeIndicatorEvidence = {};

  for (const tf of TIMEFRAMES) {
    const candles = getCandlesFromSnapshot(marketSnapshot, tf) as IndicatorCandle[];
    if (!candles.length && tf === "5M") continue;
    const evidence = computeIndicatorEvidence(candles, { timeframe: tf, nowMs });
    out[tf] = {
      ...evidence,
      ema50: tf === "1H" ? emaLatest(candles, 50) : null,
      ema200: tf === "4H" ? emaLatest(candles, 200) : null,
      missingFields: [
        ...evidence.missingFields,
        ...(tf === "1H" && candles.length < 50 ? ["ema50"] : []),
        ...(tf === "4H" && candles.length < 200 ? ["ema200"] : []),
      ],
      notes: [
        ...evidence.notes,
        ...(tf === "1H" && candles.length < 50 ? ["insufficient_candles_for_ema50"] : []),
        ...(tf === "4H" && candles.length < 200 ? ["insufficient_candles_for_ema200"] : []),
      ],
    };
  }

  return out;
}

function trendDown(evidence: TimeframeIndicatorEvidence | null | undefined): boolean {
  return Boolean(
    evidence &&
    finite(evidence.adx) && evidence.adx > 25 &&
    finite(evidence.minusDI) &&
    finite(evidence.plusDI) &&
    evidence.minusDI > evidence.plusDI * 1.2 &&
    finite(evidence.macdHistogram) && evidence.macdHistogram < 0 &&
    finite(evidence.emaSlope) && evidence.emaSlope < 0
  );
}

function trendUp(evidence: TimeframeIndicatorEvidence | null | undefined): boolean {
  return Boolean(
    evidence &&
    finite(evidence.adx) && evidence.adx > 25 &&
    finite(evidence.plusDI) &&
    finite(evidence.minusDI) &&
    evidence.plusDI > evidence.minusDI * 1.2 &&
    finite(evidence.macdHistogram) && evidence.macdHistogram > 0 &&
    finite(evidence.emaSlope) && evidence.emaSlope > 0
  );
}

function rangeLike(evidence: TimeframeIndicatorEvidence | null | undefined): boolean {
  return Boolean(
    evidence &&
    finite(evidence.adx) && evidence.adx < 20 &&
    finite(evidence.rsi) && evidence.rsi >= 35 && evidence.rsi <= 65 &&
    finite(evidence.atrPct) && evidence.atrPct <= ATR_PCT_MAX &&
    finite(evidence.bbw) && evidence.bbw < BBW_EXPANSION_LEVEL
  );
}

function volatilityExpansion(evidence: TimeframeIndicatorEvidence | null | undefined): boolean {
  return Boolean(
    evidence &&
    ((finite(evidence.atrPct) && evidence.atrPct > ATR_PCT_MAX) ||
      (finite(evidence.bbw) && evidence.bbw >= BBW_EXPANSION_LEVEL))
  );
}

function completeness(input: CanonicalMarketRegimeInput): CanonicalMarketRegime["evidenceCompleteness"] {
  const availableGroups: string[] = [];
  const missingGroups: string[] = [];
  const hasTf = (tf: CanonicalTimeframe) => Boolean(input.indicatorEvidenceByTimeframe[tf]);
  const importantPresent = IMPORTANT_TIMEFRAMES.every(hasTf);

  if (Object.keys(input.indicatorEvidenceByTimeframe).length) availableGroups.push("multi_timeframe_indicators");
  else missingGroups.push("multi_timeframe_indicators");
  if (importantPresent) availableGroups.push("important_timeframes_4h_1h");
  else missingGroups.push("important_timeframes_4h_1h");
  if (input.priceVsGrid || input.dynamicGridState) availableGroups.push("price_context");
  else missingGroups.push("price_context");
  if (input.obGate) availableGroups.push("ob_gate");
  else missingGroups.push("ob_gate");
  if (input.derivatives) availableGroups.push("derivatives");
  else missingGroups.push("derivatives");

  const total = availableGroups.length + missingGroups.length;
  const scorePct = total ? Math.round((availableGroups.length / total) * 100) : 0;
  return {
    status: scorePct >= 80 ? "complete" : scorePct > 0 ? "partial" : "missing",
    scorePct,
    availableGroups,
    missingGroups,
  };
}

function confidenceLabel(score: number): CanonicalConfidenceLabel {
  if (score >= 75) return "high";
  if (score >= 45) return "medium";
  return "low";
}

function trendZone(regime: CanonicalMarketRegimeName): TrendZoneCandidate | null {
  if (regime !== "UPTREND" && regime !== "DOWNTREND") return null;
  return {
    dir: regime === "UPTREND" ? "UP" : "DOWN",
    pullbackZone: null,
    invalidation: null,
    triggerRule: null,
    targets: [],
    smcLevels: [],
    buildStatus: "NEXT_STAGE_ONLY",
    warnings: ["trend_zone_candidate_is_read_only_next_stage_only"],
  };
}

export function buildCanonicalMarketRegime(input: CanonicalMarketRegimeInput): CanonicalMarketRegime {
  const reasons: string[] = [];
  const warnings: string[] = [];
  const ignoredLegacyFields = input.legacyPlanMode ? ["latest_decision.market_mode"] : [];
  if (input.legacyPlanMode) reasons.push("ignored_legacy_plan_mode_for_canonical_regime");

  const sourceFreshness = assessMarketRegimeFreshness({
    marketSnapshot: input.marketSnapshot,
    indicatorEvidenceByTimeframe: input.indicatorEvidenceByTimeframe,
  });
  warnings.push(...sourceFreshness.warnings);
  const evidenceCompleteness = completeness(input);

  const e15 = input.indicatorEvidenceByTimeframe["15M"];
  const e1h = input.indicatorEvidenceByTimeframe["1H"];
  const e4h = input.indicatorEvidenceByTimeframe["4H"];
  const missingImportant = IMPORTANT_TIMEFRAMES.some((tf) => !input.indicatorEvidenceByTimeframe[tf]);

  let regime: CanonicalMarketRegimeName = "UNKNOWN";
  let direction: CanonicalMarketDirection = "UNKNOWN";

  if (missingImportant) {
    regime = "NO_TRADE";
    direction = "UNKNOWN";
    reasons.push("missing_important_timeframe_bias_to_no_trade");
  } else if (volatilityExpansion(e15) || volatilityExpansion(e1h)) {
    regime = "VOLATILITY_EXPANSION";
    direction = "UNKNOWN";
    reasons.push("volatility_expansion_detected");
  } else if (trendDown(e1h) || trendDown(e15)) {
    regime = "DOWNTREND";
    direction = "BEARISH";
    reasons.push("trend_down_confirmed_by_indicators");
    if ((e1h?.rsi ?? e15?.rsi ?? 100) < 50) reasons.push("rsi_supports_bearish_bias");
  } else if (trendUp(e1h) || trendUp(e15)) {
    regime = "UPTREND";
    direction = "BULLISH";
    reasons.push("trend_up_confirmed_by_indicators");
  } else if (rangeLike(e15) && rangeLike(e1h)) {
    regime = "RANGE";
    direction = "NEUTRAL";
    reasons.push("range_like_multi_timeframe_indicators");
  } else if (rangeLike(e4h) || rangeLike(e1h) || rangeLike(e15)) {
    regime = "VOLATILITY_COMPRESSION";
    direction = "NEUTRAL";
    reasons.push("volatility_compression_or_weak_trend_watch");
  } else {
    regime = "UNKNOWN";
    direction = "UNKNOWN";
    warnings.push("canonical_regime_not_confirmed");
  }

  if (
    regime === "UNKNOWN" ||
    sourceFreshness.status === "stale" ||
    (input.priceVsGrid && input.priceVsGrid !== "INSIDE_GRID" && regime !== "UPTREND" && regime !== "DOWNTREND")
  ) {
    if (regime === "UNKNOWN") regime = "NO_TRADE";
    if (input.priceVsGrid && input.priceVsGrid !== "INSIDE_GRID") reasons.push("price_outside_grid_without_confirmed_regrid_regime");
  }

  const allowedModes =
    regime === "DOWNTREND" || regime === "UPTREND"
      ? ["NO_TRADE", "TREND_CHECK"]
      : regime === "RANGE"
        ? ["NO_TRADE", "RANGE_WATCH"]
        : ["NO_TRADE"];
  const blockedModes =
    regime === "DOWNTREND" || regime === "UPTREND"
      ? ["NEUTRAL_GRID", "DYNAMIC_NEUTRAL_GRID", "PHASE_2B_ACTIVATION"]
      : regime === "NO_TRADE" || sourceFreshness.status === "stale"
        ? ["NEUTRAL_GRID", "DYNAMIC_NEUTRAL_GRID", "PHASE_2B_ACTIVATION"]
        : ["PHASE_2B_ACTIVATION"];

  let confidence = 35;
  if (regime === "DOWNTREND" || regime === "UPTREND") confidence = 78;
  else if (regime === "RANGE") confidence = 65;
  else if (regime === "VOLATILITY_EXPANSION" || regime === "VOLATILITY_COMPRESSION") confidence = 55;
  if (sourceFreshness.status === "stale") confidence -= 25;
  if (evidenceCompleteness.status === "partial") confidence -= 12;
  if (evidenceCompleteness.status === "missing") confidence -= 30;
  confidence = Math.max(0, Math.min(100, confidence));

  return {
    regime,
    direction,
    confidence,
    confidenceLabel: confidenceLabel(confidence),
    reasons,
    warnings,
    allowedModes,
    blockedModes,
    sourcePriority: [
      "market_snapshot.klines",
      "multi_timeframe_indicators",
      "priceVsGrid_dynamicGridState",
      "obGate_smc_if_available",
      "derivatives_if_available",
      "session_news_risk_overlay",
    ],
    ignoredLegacyFields,
    sourceFreshness,
    evidenceCompleteness,
    trendZoneCandidate: trendZone(regime),
    shadowOnly: true,
    paperActivationAllowed: false,
    liveActivationAllowed: false,
  };
}
