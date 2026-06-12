// dashboard/lib/trend/exactZoneComparisonSummary.ts
// Phase T-3H-6-d5 - exact-zone vs heuristic shadow comparison.
//
// SAFETY:
//   - Pure helper only. No I/O, no env reads, no route/runner/execution imports.
//   - Observability-only. REVIEW_ELIGIBLE never means activation approval.

export type ExactZoneComparisonSampleTier =
  | "NO_DATA"
  | "INFORMATIONAL_LT_50"
  | "EARLY_PATTERN_50_TO_99"
  | "REVIEW_ELIGIBLE_100_PLUS";

export type ExactZoneComparisonReadiness =
  | "NO_DATA"
  | "CONTINUE_LOGGING"
  | "EARLY_PATTERN"
  | "REVIEW_ELIGIBLE"
  | "WARNING_DEGRADED"
  | "NOT_ACTIVATION_READY";

export type ExactZoneFillResolutionStatus = "NOT_CONFIGURED" | "NO_CANDLES" | "PENDING" | "PARTIAL" | "RESOLVED";

export type ExactZoneWarningFlag =
  | "LOW_EXACT_SAMPLE_SIZE"
  | "EXACT_SAMPLES_STUCK"
  | "OB_ONLY_DOMINANT"
  | "NO_FVG_CONFLUENCE"
  | "NEGATIVE_EXACT_DELTA"
  | "LOW_EXACT_PASS_RATE"
  | "HIGH_CONFLICT_RATE"
  | "HIGH_TARGET_TOO_CLOSE_RATE"
  | "HIGH_COST_TOO_HIGH_RATE"
  | "HIGH_MISSED_FILL_RATE"
  | "REVIEW_NOT_ACTIVATION";

export interface ExactZoneComparisonCandle {
  t: string | number;
  open?: number;
  high: number;
  low: number;
  close?: number;
}

export interface ExactZoneComparisonSettings {
  requiredRR?: number | null;
  fillLookaheadBars?: number | null;
  minSamplesForEarlyPattern?: number | null;
  minSamplesForReview?: number | null;
}

export interface ExactZoneFillResolution {
  status: ExactZoneFillResolutionStatus;
  totalResolvable: number;
  filled: number;
  missed: number;
  pending: number;
  invalidationFirst: number;
  missedFillRate: number | null;
}

export interface ExactZoneComparisonSummary {
  schemaVersion: 1;
  sampleTier: ExactZoneComparisonSampleTier;
  exactSamples: number;
  heuristicSamples: number;
  exactAvgNetRR: number | null;
  heuristicAvgNetRR: number | null;
  avgExactVsHeuristicDelta: number | null;
  exactPassCount: number;
  exactPassRate: number | null;
  exactDataStatusCounts: Record<string, number>;
  exactReadinessCounts: Record<string, number>;
  usesExactObFvgZonesCount: number;
  dominantExactStatus: string | null;
  dominantExactReadiness: string | null;
  fillResolution: ExactZoneFillResolution;
  warningFlags: ExactZoneWarningFlag[];
  readiness: ExactZoneComparisonReadiness;
  source: "EXACT_ZONE_COMPARISON_SUMMARY_V1";
}

interface NormalizedSnapshot {
  capturedAt: string | null;
  direction: "LONG" | "SHORT" | null;
  heuristicNetRR: number | null;
  exactNetRR: number | null;
  exactVsHeuristicDelta: number | null;
  exactDataStatus: string | null;
  exactReadiness: string | null;
  usesExactObFvgZones: boolean;
  entry: number | null;
  invalidation: number | null;
}

const SOURCE = "EXACT_ZONE_COMPARISON_SUMMARY_V1" as const;

function isObj(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function fin(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function finiteOrNull(v: unknown): number | null {
  return fin(v) ? v : null;
}

function round4(v: number): number {
  return Math.round(v * 10_000) / 10_000;
}

function strOrNull(v: unknown): string | null {
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
}

function addCount(counts: Record<string, number>, key: string | null): void {
  if (!key) return;
  counts[key] = (counts[key] ?? 0) + 1;
}

function avg(values: Array<number | null>): number | null {
  const nums = values.filter((v): v is number => fin(v));
  if (!nums.length) return null;
  return round4(nums.reduce((sum, v) => sum + v, 0) / nums.length);
}

function dominant(counts: Record<string, number>): string | null {
  const entries = Object.entries(counts).filter(([, count]) => count > 0);
  if (!entries.length) return null;
  entries.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return entries[0]![0];
}

function emptyFillResolution(status: ExactZoneFillResolutionStatus): ExactZoneFillResolution {
  return {
    status,
    totalResolvable: 0,
    filled: 0,
    missed: 0,
    pending: 0,
    invalidationFirst: 0,
    missedFillRate: null,
  };
}

export function emptyExactZoneComparisonSummary(): ExactZoneComparisonSummary {
  return {
    schemaVersion: 1,
    sampleTier: "NO_DATA",
    exactSamples: 0,
    heuristicSamples: 0,
    exactAvgNetRR: null,
    heuristicAvgNetRR: null,
    avgExactVsHeuristicDelta: null,
    exactPassCount: 0,
    exactPassRate: null,
    exactDataStatusCounts: {},
    exactReadinessCounts: {},
    usesExactObFvgZonesCount: 0,
    dominantExactStatus: null,
    dominantExactReadiness: null,
    fillResolution: emptyFillResolution("NOT_CONFIGURED"),
    warningFlags: ["REVIEW_NOT_ACTIVATION"],
    readiness: "NO_DATA",
    source: SOURCE,
  };
}

function extractSnapshot(record: unknown): unknown {
  if (!isObj(record)) return null;
  return record.smcMtfShadowSnapshot ?? record;
}

function normalizeSnapshot(record: unknown): NormalizedSnapshot | null {
  const raw = extractSnapshot(record);
  if (!isObj(raw)) return null;
  if (raw.schemaVersion !== 1 || raw.source !== "mtf-ob-fvg-refinement-shadow") return null;
  const exactZone = isObj(raw.exactZone) ? raw.exactZone : null;
  const directionRaw = strOrNull(raw.direction ?? exactZone?.direction);
  const direction = directionRaw === "LONG" || directionRaw === "SHORT" ? directionRaw : null;
  const heuristicNetRR = finiteOrNull(raw.refinedNetRR ?? raw.currentNetRR);
  const exactNetRR = exactZone ? finiteOrNull(exactZone.exactNetRR) : null;
  const storedDelta = exactZone ? finiteOrNull(exactZone.exactVsHeuristicDelta) : null;
  const computedDelta = exactNetRR != null && heuristicNetRR != null ? round4(exactNetRR - heuristicNetRR) : null;
  const exactVsHeuristicDelta = storedDelta ?? computedDelta;
  const entry = exactZone ? finiteOrNull(exactZone.refinedEntry ?? exactZone.entry ?? exactZone.entryPrice) : null;
  const invalidation = exactZone ? finiteOrNull(exactZone.invalidationPrice ?? exactZone.invalidation ?? exactZone.stopLoss) : null;
  return {
    capturedAt: strOrNull(raw.capturedAt),
    direction,
    heuristicNetRR,
    exactNetRR,
    exactVsHeuristicDelta,
    exactDataStatus: exactZone ? strOrNull(exactZone.exactZoneDataStatus) : null,
    exactReadiness: exactZone ? strOrNull(exactZone.exactZoneReadiness) : null,
    usesExactObFvgZones: raw.usesExactObFvgZones === true || exactZone?.usesExactObFvgZones === true,
    entry,
    invalidation,
  };
}

function sampleTier(exactSamples: number, minEarly: number, minReview: number): ExactZoneComparisonSampleTier {
  if (exactSamples <= 0) return "NO_DATA";
  if (exactSamples < minEarly) return "INFORMATIONAL_LT_50";
  if (exactSamples < minReview) return "EARLY_PATTERN_50_TO_99";
  return "REVIEW_ELIGIBLE_100_PLUS";
}

function normalizeCandles(candles: readonly ExactZoneComparisonCandle[] | null | undefined): ExactZoneComparisonCandle[] {
  if (!Array.isArray(candles)) return [];
  return candles
    .filter((c) => c && fin(c.high) && fin(c.low))
    .map((c) => ({ t: c.t, high: c.high, low: c.low, open: finiteOrNull(c.open) ?? undefined, close: finiteOrNull(c.close) ?? undefined }));
}

function candleTime(candle: ExactZoneComparisonCandle): number {
  return typeof candle.t === "number" ? candle.t : Date.parse(candle.t);
}

function priceTouched(candle: ExactZoneComparisonCandle, price: number): boolean {
  return candle.low <= price && candle.high >= price;
}

function resolveOneFill(snapshot: NormalizedSnapshot, candles: ExactZoneComparisonCandle[], lookahead: number): "FILLED" | "MISSED" | "PENDING" | "INVALIDATION_FIRST" {
  if (!snapshot.capturedAt || !snapshot.direction || snapshot.entry == null || snapshot.invalidation == null) return "PENDING";
  const capturedAt = Date.parse(snapshot.capturedAt);
  if (!Number.isFinite(capturedAt)) return "PENDING";
  const future = candles.filter((c) => {
    const t = candleTime(c);
    return Number.isFinite(t) && t > capturedAt;
  }).slice(0, lookahead);
  if (future.length < lookahead) return "PENDING";
  for (const candle of future) {
    const hitEntry = priceTouched(candle, snapshot.entry);
    const hitInvalidation = priceTouched(candle, snapshot.invalidation);
    if (hitEntry && hitInvalidation) return "INVALIDATION_FIRST";
    if (hitEntry) return "FILLED";
    if (hitInvalidation) return "INVALIDATION_FIRST";
  }
  return "MISSED";
}

function computeFillResolution(
  snapshots: NormalizedSnapshot[],
  candlesByTimeframe: Record<string, readonly ExactZoneComparisonCandle[]> | null | undefined,
  lookahead: number,
): ExactZoneFillResolution {
  if (candlesByTimeframe == null) return emptyFillResolution("NOT_CONFIGURED");
  const candles = normalizeCandles(candlesByTimeframe["15m"] ?? candlesByTimeframe["15M"] ?? Object.values(candlesByTimeframe)[0]);
  if (!candles.length) return emptyFillResolution("NO_CANDLES");

  let totalResolvable = 0;
  let filled = 0;
  let missed = 0;
  let pending = 0;
  let invalidationFirst = 0;

  for (const snapshot of snapshots.filter((s) => s.exactNetRR != null)) {
    const result = resolveOneFill(snapshot, candles, lookahead);
    if (result === "PENDING") {
      pending += 1;
      continue;
    }
    totalResolvable += 1;
    if (result === "FILLED") filled += 1;
    if (result === "MISSED") missed += 1;
    if (result === "INVALIDATION_FIRST") {
      invalidationFirst += 1;
      missed += 1;
    }
  }

  const status: ExactZoneFillResolutionStatus =
    totalResolvable === 0 && pending > 0
      ? "PENDING"
      : pending > 0
        ? "PARTIAL"
        : totalResolvable > 0
          ? "RESOLVED"
          : "PENDING";
  return {
    status,
    totalResolvable,
    filled,
    missed,
    pending,
    invalidationFirst,
    missedFillRate: totalResolvable > 0 ? round4(missed / totalResolvable) : null,
  };
}

export function summarizeExactZoneComparison(
  records: readonly unknown[],
  options: {
    candlesByTimeframe?: Record<string, readonly ExactZoneComparisonCandle[]> | null;
    settings?: ExactZoneComparisonSettings;
  } = {},
): ExactZoneComparisonSummary {
  const settings = options.settings ?? {};
  const requiredRR = fin(settings.requiredRR) && settings.requiredRR > 0 ? settings.requiredRR : 1.2;
  const fillLookaheadBars = fin(settings.fillLookaheadBars) && settings.fillLookaheadBars > 0 ? Math.floor(settings.fillLookaheadBars) : 12;
  const minSamplesForEarlyPattern = fin(settings.minSamplesForEarlyPattern) && settings.minSamplesForEarlyPattern > 0 ? Math.floor(settings.minSamplesForEarlyPattern) : 50;
  const minSamplesForReview = fin(settings.minSamplesForReview) && settings.minSamplesForReview > 0 ? Math.floor(settings.minSamplesForReview) : 100;

  const snapshots = records.map(normalizeSnapshot).filter((s): s is NormalizedSnapshot => s != null);
  const exactSnapshots = snapshots.filter((s) => s.exactNetRR != null || s.exactDataStatus != null);
  const heuristicSnapshots = snapshots.filter((s) => s.heuristicNetRR != null);
  if (!snapshots.length || (!exactSnapshots.length && !heuristicSnapshots.length)) return emptyExactZoneComparisonSummary();

  const exactDataStatusCounts: Record<string, number> = {};
  const exactReadinessCounts: Record<string, number> = {};
  for (const s of exactSnapshots) {
    addCount(exactDataStatusCounts, s.exactDataStatus);
    addCount(exactReadinessCounts, s.exactReadiness ?? "UNKNOWN");
  }

  const exactSamples = exactSnapshots.length;
  const heuristicSamples = heuristicSnapshots.length;
  const exactPassCount = exactSnapshots.filter((s) => s.exactNetRR != null && s.exactNetRR >= requiredRR).length;
  const exactPassRate = exactSamples > 0 ? round4(exactPassCount / exactSamples) : null;
  const tier = sampleTier(exactSamples, minSamplesForEarlyPattern, minSamplesForReview);
  const fillResolution = computeFillResolution(exactSnapshots, options.candlesByTimeframe, fillLookaheadBars);
  const dominantExactStatus = dominant(exactDataStatusCounts);
  const dominantExactReadiness = dominant(exactReadinessCounts);
  const usesExactObFvgZonesCount = snapshots.filter((s) => s.usesExactObFvgZones).length;
  const avgExactVsHeuristicDelta = avg(exactSnapshots.map((s) => s.exactVsHeuristicDelta));

  const warningFlags = new Set<ExactZoneWarningFlag>(["REVIEW_NOT_ACTIVATION"]);
  if (exactSamples < minSamplesForEarlyPattern) warningFlags.add("LOW_EXACT_SAMPLE_SIZE");
  if (exactSamples > 0 && usesExactObFvgZonesCount === 0) warningFlags.add("EXACT_SAMPLES_STUCK");
  if (exactSamples >= 30 && dominantExactStatus === "EXACT_OB_ONLY") {
    warningFlags.add("OB_ONLY_DOMINANT");
    warningFlags.add("NO_FVG_CONFLUENCE");
  }
  if (avgExactVsHeuristicDelta != null && avgExactVsHeuristicDelta < 0) warningFlags.add("NEGATIVE_EXACT_DELTA");
  if (exactPassRate != null && exactSamples >= minSamplesForEarlyPattern && exactPassRate < 0.7) warningFlags.add("LOW_EXACT_PASS_RATE");
  const conflictRate = exactSamples > 0 ? (exactReadinessCounts.CONFLICTING_MTF ?? 0) / exactSamples : 0;
  const targetTooCloseRate = exactSamples > 0 ? (exactReadinessCounts.TARGET_TOO_CLOSE ?? 0) / exactSamples : 0;
  const costTooHighRate = exactSamples > 0 ? (exactReadinessCounts.COST_TOO_HIGH ?? 0) / exactSamples : 0;
  if (conflictRate >= 0.3) warningFlags.add("HIGH_CONFLICT_RATE");
  if (targetTooCloseRate >= 0.3) warningFlags.add("HIGH_TARGET_TOO_CLOSE_RATE");
  if (costTooHighRate >= 0.3) warningFlags.add("HIGH_COST_TOO_HIGH_RATE");
  if ((fillResolution.status === "RESOLVED" || fillResolution.status === "PARTIAL") && (fillResolution.missedFillRate ?? 0) >= 0.5) {
    warningFlags.add("HIGH_MISSED_FILL_RATE");
  }

  const degraded = [...warningFlags].some((w) =>
    ["NEGATIVE_EXACT_DELTA", "LOW_EXACT_PASS_RATE", "HIGH_CONFLICT_RATE", "HIGH_TARGET_TOO_CLOSE_RATE", "HIGH_COST_TOO_HIGH_RATE", "HIGH_MISSED_FILL_RATE"].includes(w),
  );
  const readiness: ExactZoneComparisonReadiness =
    exactSamples <= 0
      ? "NO_DATA"
      : degraded
        ? "WARNING_DEGRADED"
        : tier === "REVIEW_ELIGIBLE_100_PLUS"
          ? "REVIEW_ELIGIBLE"
          : tier === "EARLY_PATTERN_50_TO_99"
            ? "EARLY_PATTERN"
            : "CONTINUE_LOGGING";

  return {
    schemaVersion: 1,
    sampleTier: tier,
    exactSamples,
    heuristicSamples,
    exactAvgNetRR: avg(exactSnapshots.map((s) => s.exactNetRR)),
    heuristicAvgNetRR: avg(heuristicSnapshots.map((s) => s.heuristicNetRR)),
    avgExactVsHeuristicDelta,
    exactPassCount,
    exactPassRate,
    exactDataStatusCounts,
    exactReadinessCounts,
    usesExactObFvgZonesCount,
    dominantExactStatus,
    dominantExactReadiness,
    fillResolution,
    warningFlags: [...warningFlags],
    readiness,
    source: SOURCE,
  };
}
