export type IndicatorGateStatus =
  | "INSUFFICIENT_DATA"
  | "TREND_DOWN_BLOCK"
  | "VOLATILITY_BLOCK"
  | "RECOVERY_WATCH"
  | "RANGE_WATCH";

export type IndicatorGateConfidence = "low" | "medium" | "high";

export interface IndicatorGateInput {
  adx: number | null;
  plusDI: number | null;
  minusDI: number | null;
  rsi: number | null;
  atrPct: number | null;
  bbw: number | null;
  macdHistogram: number | null;
  emaSlope: number | null;
  freshness?: {
    latestCandleAt: string | null;
    ageMs: number | null;
  } | null;
  previousMacdHistogram?: number | null;
  previousEmaSlope?: number | null;
  previousPlusDI?: number | null;
  previousMinusDI?: number | null;
  bbwExpansionPct?: number | null;
  diSpreadCompressing?: boolean | null;
}

export interface IndicatorGateConfig {
  trendAdxMin: number;
  diDominanceMultiplier: number;
  rangeAdxMax: number;
  rsiRangeMin: number;
  rsiRangeMax: number;
  recoveryRsiMin: number;
  atrPctMax: number;
  bbwExpansionPctMax: number;
  maxFreshnessAgeMs: number;
}

export interface IndicatorGate {
  status: IndicatorGateStatus;
  reasons: string[];
  passed: string[];
  failed: string[];
  confidence: IndicatorGateConfidence;
  blocking: boolean;
  paperActivationAllowed: false;
  liveActivationAllowed: false;
}

export const DEFAULT_INDICATOR_GATE_CONFIG: IndicatorGateConfig = {
  trendAdxMin: 25,
  diDominanceMultiplier: 1.2,
  rangeAdxMax: 20,
  rsiRangeMin: 35,
  rsiRangeMax: 65,
  recoveryRsiMin: 45,
  atrPctMax: 2.5,
  bbwExpansionPctMax: 0.25,
  maxFreshnessAgeMs: 30 * 60_000,
};

const REQUIRED_FIELDS = [
  "adx",
  "plusDI",
  "minusDI",
  "rsi",
  "atrPct",
  "bbw",
  "macdHistogram",
  "emaSlope",
] as const;

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function missReason(field: (typeof REQUIRED_FIELDS)[number]): string {
  if (field === "plusDI") return "missing_plus_di";
  if (field === "minusDI") return "missing_minus_di";
  if (field === "atrPct") return "missing_atr_pct";
  if (field === "macdHistogram") return "missing_macd_histogram";
  if (field === "emaSlope") return "missing_ema_slope";
  return `missing_${field}`;
}

function lockedGate(
  status: IndicatorGateStatus,
  reasons: string[],
  passed: string[],
  failed: string[],
  confidence: IndicatorGateConfidence,
  blocking: boolean,
): IndicatorGate {
  return {
    status,
    reasons,
    passed,
    failed,
    confidence,
    blocking,
    paperActivationAllowed: false,
    liveActivationAllowed: false,
  };
}

export function evaluateIndicatorGate(
  input: IndicatorGateInput | null | undefined,
  config: Partial<IndicatorGateConfig> = {},
): IndicatorGate {
  const cfg = { ...DEFAULT_INDICATOR_GATE_CONFIG, ...config };
  if (!input) {
    return lockedGate("INSUFFICIENT_DATA", ["missing_indicator_evidence"], [], REQUIRED_FIELDS.map(missReason), "low", true);
  }

  const missing = REQUIRED_FIELDS.filter((field) => !finite(input[field]));
  const stale = finite(input.freshness?.ageMs) && input.freshness.ageMs > cfg.maxFreshnessAgeMs;
  if (missing.length > 0 || stale) {
    return lockedGate(
      "INSUFFICIENT_DATA",
      [...missing.map(missReason), ...(stale ? ["stale_indicator_evidence"] : [])],
      [],
      missing.map(missReason),
      "low",
      true,
    );
  }

  const adx = input.adx as number;
  const plusDI = input.plusDI as number;
  const minusDI = input.minusDI as number;
  const rsi = input.rsi as number;
  const atrPct = input.atrPct as number;
  const macdHistogram = input.macdHistogram as number;
  const emaSlope = input.emaSlope as number;

  const passed: string[] = [];
  const failed: string[] = [];
  const mark = (condition: boolean, key: string) => (condition ? passed : failed).push(key);

  const adxTrend = adx > cfg.trendAdxMin;
  const diDominates = minusDI > plusDI * cfg.diDominanceMultiplier;
  const macdBearish = macdHistogram < 0;
  const emaDown = emaSlope < 0;
  mark(adxTrend, "adx_gt_25");
  mark(diDominates, "minus_di_gt_plus_di_x_1_2");
  mark(macdBearish, "macd_histogram_lt_0");
  mark(emaDown, "ema_slope_lt_0");

  if (adxTrend && diDominates && macdBearish && emaDown) {
    return lockedGate("TREND_DOWN_BLOCK", ["trend_down_confirmed"], passed, failed, "high", true);
  }

  const atrExtreme = atrPct > cfg.atrPctMax;
  const bbwExpansionExtreme = finite(input.bbwExpansionPct) && input.bbwExpansionPct > cfg.bbwExpansionPctMax;
  if (atrExtreme || bbwExpansionExtreme) {
    return lockedGate(
      "VOLATILITY_BLOCK",
      [
        ...(atrExtreme ? ["atr_pct_above_configured_max"] : []),
        ...(bbwExpansionExtreme ? ["bbw_expansion_above_configured_max"] : []),
      ],
      passed,
      failed,
      "high",
      true,
    );
  }

  const macdImproving = finite(input.previousMacdHistogram) && macdHistogram > input.previousMacdHistogram;
  const emaFlattening = finite(input.previousEmaSlope) && Math.abs(emaSlope) < Math.abs(input.previousEmaSlope);
  const previousDominance = finite(input.previousMinusDI) && finite(input.previousPlusDI)
    ? input.previousMinusDI / Math.max(input.previousPlusDI, Number.EPSILON)
    : null;
  const currentDominance = minusDI / Math.max(plusDI, Number.EPSILON);
  const diWeakening = previousDominance != null && currentDominance < previousDominance;
  if (rsi > cfg.recoveryRsiMin && macdImproving && emaFlattening && diWeakening) {
    return lockedGate(
      "RECOVERY_WATCH",
      ["recovery_watch_no_activation_state", "shadow_only_no_activation_state"],
      passed,
      failed,
      "medium",
      false,
    );
  }

  const rangeAdx = adx < cfg.rangeAdxMax;
  const diCompression = input.diSpreadCompressing === true;
  const rsiInRange = rsi >= cfg.rsiRangeMin && rsi <= cfg.rsiRangeMax;
  const bbwNotExpanding = !finite(input.bbwExpansionPct) || input.bbwExpansionPct <= cfg.bbwExpansionPctMax;
  const atrUnderMax = atrPct <= cfg.atrPctMax;
  if ((rangeAdx || diCompression) && rsiInRange && bbwNotExpanding && atrUnderMax) {
    return lockedGate(
      "RANGE_WATCH",
      ["range_watch_no_activation_state", "shadow_only_no_activation_state"],
      passed,
      failed,
      "medium",
      false,
    );
  }

  return lockedGate(
    "INSUFFICIENT_DATA",
    ["indicator_gate_conditions_not_confirmed", "shadow_only_no_activation_state"],
    passed,
    failed,
    "low",
    true,
  );
}
