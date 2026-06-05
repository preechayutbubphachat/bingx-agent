export type MarketRegimeFreshnessStatus = "fresh" | "stale" | "partial" | "unknown";

export interface TimeframeFreshnessEvidence {
  freshness?: {
    latestCandleAt: string | null;
    ageMs: number | null;
  } | null;
}

export interface MarketRegimeFreshness {
  status: MarketRegimeFreshnessStatus;
  generatedAt: string | null;
  latestCandleAtByTimeframe: Record<string, string | null>;
  warnings: string[];
}

type AnyObj = Record<string, unknown>;

const IMPORTANT_TIMEFRAMES = ["1H", "4H"] as const;
const STALE_BY_TIMEFRAME_MS: Record<string, number> = {
  "5M": 20 * 60_000,
  "15M": 45 * 60_000,
  "1H": 2 * 60 * 60_000,
  "4H": 8 * 60 * 60_000,
  "1D": 36 * 60 * 60_000,
};

function obj(value: unknown): AnyObj {
  return value && typeof value === "object" ? value as AnyObj : {};
}

function iso(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) {
    const t = Date.parse(value);
    return Number.isFinite(t) ? new Date(t).toISOString() : null;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const ms = value < 10_000_000_000 ? value * 1000 : value;
    return new Date(ms).toISOString();
  }
  return null;
}

function generatedAtOf(marketSnapshot: unknown): string | null {
  const snapshot = obj(marketSnapshot);
  const meta = obj(snapshot.meta);
  return iso(meta.generated_at ?? meta.generatedAt ?? snapshot.generated_at ?? snapshot.updated_at);
}

function maxAgeFor(tf: string): number {
  return STALE_BY_TIMEFRAME_MS[tf] ?? 60 * 60_000;
}

export function assessMarketRegimeFreshness(input: {
  marketSnapshot: unknown;
  indicatorEvidenceByTimeframe: Record<string, TimeframeFreshnessEvidence | null | undefined>;
  nowMs?: number;
}): MarketRegimeFreshness {
  const warnings: string[] = [];
  const generatedAt = generatedAtOf(input.marketSnapshot);
  const generatedAtMs = generatedAt ? Date.parse(generatedAt) : NaN;
  const latestCandleAtByTimeframe: Record<string, string | null> = {};
  const timeframes = Object.keys(input.indicatorEvidenceByTimeframe ?? {});

  for (const tf of timeframes) {
    const latest = input.indicatorEvidenceByTimeframe[tf]?.freshness?.latestCandleAt ?? null;
    latestCandleAtByTimeframe[tf] = latest;
    const latestMs = latest ? Date.parse(latest) : NaN;
    const ageMs = input.indicatorEvidenceByTimeframe[tf]?.freshness?.ageMs;
    const staleByAge = typeof ageMs === "number" && Number.isFinite(ageMs) && ageMs > maxAgeFor(tf);
    const staleByGeneratedAt =
      Number.isFinite(generatedAtMs) &&
      Number.isFinite(latestMs) &&
      generatedAtMs - latestMs > maxAgeFor(tf);
    if (staleByAge || staleByGeneratedAt) warnings.push(`stale_candle_${tf}`);
    if (staleByGeneratedAt) warnings.push(`snapshot_generated_at_far_after_latest_candle_${tf}`);
  }

  for (const tf of IMPORTANT_TIMEFRAMES) {
    if (!input.indicatorEvidenceByTimeframe?.[tf]) {
      warnings.push(`missing_required_timeframe_${tf}`);
      latestCandleAtByTimeframe[tf] = null;
    }
  }

  const hasEvidence = timeframes.length > 0;
  const hasStale = warnings.some((warning) => warning.startsWith("stale_"));
  const hasMissingImportant = warnings.some((warning) => warning.startsWith("missing_required_timeframe_"));
  const status: MarketRegimeFreshnessStatus =
    !generatedAt && !hasEvidence
      ? "unknown"
      : hasStale
        ? "stale"
        : hasMissingImportant
          ? "partial"
          : "fresh";

  return {
    status,
    generatedAt,
    latestCandleAtByTimeframe,
    warnings,
  };
}
