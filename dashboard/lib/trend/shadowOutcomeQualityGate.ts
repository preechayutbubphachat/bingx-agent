// dashboard/lib/trend/shadowOutcomeQualityGate.ts
// D5.2-d - Shadow Outcome Quality Gate (read-only analytics).
//
// Safety contract:
// - Pure helper. Input is a ShadowOutcomeSummary only.
// - No candles, raw records, I/O, runtime writes, runner, execution, broker, grid, or resolver imports.
// - activationAllowed is always false, readiness is always REVIEW_NOT_ACTIVATION,
//   and reviewOnly is always true.

import type { ShadowOutcomeBucket, ShadowOutcomeSummary } from "./shadowOutcomeResolver.ts";

export type ShadowOutcomeQualityStatus =
  | "NO_DATA"
  | "EARLY_SAMPLE"
  | "UNKNOWN_CONTEXT_DOMINATES"
  | "CONTEXT_BIASED"
  | "WARNING_DEGRADED"
  | "REVIEW_READY"
  | "NOT_ACTIONABLE";

export type ShadowOutcomeSampleQuality = "LOW" | "MEDIUM" | "HIGH";

export interface ShadowOutcomeQualityGateThresholds {
  minContextReadySetups: number;
  minContextReadyResolved: number;
  minDistinctRegimes: number;
  rangeSubsetRequired: boolean;
  rangeMinSample: number;
  unknownDominanceLimit: number;
  priceContextDiversityRequired: boolean;
  dynamicGridContextDiversityRequired: boolean;
  minEntryTouchForPerf: number;
}

export interface ShadowOutcomeQualityGate {
  schemaVersion: 1;
  source: "SHADOW_OUTCOME_QUALITY_GATE_V1";
  status: ShadowOutcomeQualityStatus;
  readiness: "REVIEW_NOT_ACTIVATION";
  verdict: string;
  sampleQuality: ShadowOutcomeSampleQuality;
  activationAllowed: false;
  reviewOnly: true;
  metrics: {
    totalSetups: number;
    geometryReady: number;
    resolvedOutcomes: number;
    contextReadySetups: number;
    unknownContextSetups: number;
    unknownContextPct: number | null;
    contextReadyResolved: number;
    distinctRegimes: number;
    rangeSetups: number;
    hasRangeSubset: boolean;
    distinctPriceContexts: number;
    distinctDynamicGridContexts: number;
    dominantPriceVsGrid: string | null;
    dominantDynamicGridStatus: string | null;
    entryTouched: number;
    entryTouchRate: number | null;
    entryNotReachedRate: number | null;
    invalidationFirstRate: number | null;
    targetAfterEntryTouchRate: number | null;
    invalidationAfterEntryTouchRate: number | null;
    timeoutAfterEntryTouchRate: number | null;
  };
  thresholds: ShadowOutcomeQualityGateThresholds;
  passedGates: string[];
  failedGates: string[];
  warnings: string[];
  nextAction: string;
}

const SOURCE = "SHADOW_OUTCOME_QUALITY_GATE_V1" as const;

export const DEFAULT_SHADOW_OUTCOME_QUALITY_GATE_THRESHOLDS: ShadowOutcomeQualityGateThresholds = {
  minContextReadySetups: 30,
  minContextReadyResolved: 30,
  minDistinctRegimes: 2,
  rangeSubsetRequired: true,
  rangeMinSample: 10,
  unknownDominanceLimit: 0.5,
  priceContextDiversityRequired: true,
  dynamicGridContextDiversityRequired: true,
  minEntryTouchForPerf: 20,
};

function finite(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function count(v: unknown): number {
  return finite(v) ? Math.max(0, v) : 0;
}

function rate(v: unknown): number | null {
  return finite(v) ? v : null;
}

function round4(v: number): number {
  return Math.round(v * 10_000) / 10_000;
}

function resolvedOutcomes(b: ShadowOutcomeBucket | undefined | null): number {
  if (!b) return 0;
  return count(b.entryNotReached) + count(b.invalidationFirst) + count(b.entryTouched);
}

function activeEntries(split: Record<string, ShadowOutcomeBucket> | undefined): Array<[string, ShadowOutcomeBucket]> {
  if (!split || typeof split !== "object") return [];
  return Object.entries(split).filter(([key, bucket]) => key !== "UNKNOWN" && count(bucket?.totalSetups) > 0);
}

function dominantKey(split: Record<string, ShadowOutcomeBucket> | undefined): string | null {
  const entries = activeEntries(split);
  if (!entries.length) return null;
  entries.sort((a, b) => count(b[1].totalSetups) - count(a[1].totalSetups) || a[0].localeCompare(b[0]));
  return entries[0]![0];
}

function buildEmptyGate(thresholds: ShadowOutcomeQualityGateThresholds): ShadowOutcomeQualityGate {
  return {
    schemaVersion: 1,
    source: SOURCE,
    status: "NO_DATA",
    readiness: "REVIEW_NOT_ACTIVATION",
    verdict: "NO_DATA - review only, not activation.",
    sampleQuality: "LOW",
    activationAllowed: false,
    reviewOnly: true,
    metrics: {
      totalSetups: 0,
      geometryReady: 0,
      resolvedOutcomes: 0,
      contextReadySetups: 0,
      unknownContextSetups: 0,
      unknownContextPct: null,
      contextReadyResolved: 0,
      distinctRegimes: 0,
      rangeSetups: 0,
      hasRangeSubset: false,
      distinctPriceContexts: 0,
      distinctDynamicGridContexts: 0,
      dominantPriceVsGrid: null,
      dominantDynamicGridStatus: null,
      entryTouched: 0,
      entryTouchRate: null,
      entryNotReachedRate: null,
      invalidationFirstRate: null,
      targetAfterEntryTouchRate: null,
      invalidationAfterEntryTouchRate: null,
      timeoutAfterEntryTouchRate: null,
    },
    thresholds,
    passedGates: [],
    failedGates: ["no_shadow_outcome_summary"],
    warnings: [],
    nextAction: "continue_collecting_shadow_outcomes",
  };
}

export function emptyShadowOutcomeQualityGate(): ShadowOutcomeQualityGate {
  return buildEmptyGate(DEFAULT_SHADOW_OUTCOME_QUALITY_GATE_THRESHOLDS);
}

export function evaluateShadowOutcomeQualityGate(
  summary: ShadowOutcomeSummary | null | undefined,
  thresholdOverrides?: Partial<ShadowOutcomeQualityGateThresholds>,
): ShadowOutcomeQualityGate {
  const thresholds: ShadowOutcomeQualityGateThresholds = {
    ...DEFAULT_SHADOW_OUTCOME_QUALITY_GATE_THRESHOLDS,
    ...(thresholdOverrides ?? {}),
  };

  if (!summary?.shadowOutcomes || count(summary.shadowOutcomes.totalSetups) <= 0) {
    return buildEmptyGate(thresholds);
  }

  const overall = summary.shadowOutcomes;
  const regimeSplit = summary.splitByCanonicalRegime ?? {};
  const priceSplit = summary.splitByPriceVsGrid ?? {};
  const gridSplit = summary.splitByDynamicGridStatus ?? {};

  const totalSetups = count(overall.totalSetups);
  const unknownContextSetups = count(regimeSplit.UNKNOWN?.totalSetups);
  const contextReadySetups = Math.max(0, totalSetups - unknownContextSetups);
  const unknownContextPct = totalSetups > 0 ? round4(unknownContextSetups / totalSetups) : null;
  const contextReadyResolved = activeEntries(regimeSplit).reduce((sum, [, bucket]) => sum + resolvedOutcomes(bucket), 0);
  const distinctRegimes = activeEntries(regimeSplit).length;
  const rangeSetups = count(regimeSplit.RANGE?.totalSetups);
  const hasRangeSubset = rangeSetups >= thresholds.rangeMinSample;
  const distinctPriceContexts = activeEntries(priceSplit).length;
  const distinctDynamicGridContexts = activeEntries(gridSplit).length;
  const dominantPriceVsGrid = dominantKey(priceSplit);
  const dominantDynamicGridStatus = dominantKey(gridSplit);
  const entryTouched = count(overall.entryTouched);
  const targetAfterEntryTouchRate = rate(overall.targetAfterEntryTouchRate);
  const invalidationAfterEntryTouchRate = rate(overall.invalidationAfterEntryTouchRate);

  const passedGates: string[] = [];
  const failedGates: string[] = [];
  const addGate = (ok: boolean, pass: string, fail: string) => {
    if (ok) passedGates.push(pass);
    else failedGates.push(fail);
  };

  addGate(contextReadySetups >= thresholds.minContextReadySetups, "context_ready_setups_min_pass", "context_ready_setups_below_min");
  addGate(contextReadyResolved >= thresholds.minContextReadyResolved, "context_ready_resolved_min_pass", "context_ready_resolved_below_min");
  addGate(distinctRegimes >= thresholds.minDistinctRegimes, "distinct_regimes_min_pass", "distinct_regimes_below_min");
  if (thresholds.rangeSubsetRequired) addGate(hasRangeSubset, "range_subset_present", "range_subset_missing");
  addGate(
    unknownContextPct !== null && unknownContextPct < thresholds.unknownDominanceLimit,
    "unknown_context_not_dominant",
    "unknown_context_dominates",
  );
  if (thresholds.priceContextDiversityRequired) addGate(distinctPriceContexts >= 2, "price_context_diverse", "price_context_not_diverse");
  if (thresholds.dynamicGridContextDiversityRequired) {
    addGate(distinctDynamicGridContexts >= 2, "dynamic_grid_context_diverse", "dynamic_grid_context_not_diverse");
  }

  const performanceSampleReady = entryTouched >= thresholds.minEntryTouchForPerf;
  const targetUnderperforms =
    targetAfterEntryTouchRate !== null &&
    invalidationAfterEntryTouchRate !== null &&
    targetAfterEntryTouchRate <= invalidationAfterEntryTouchRate;

  const warnings: string[] = [];
  if (unknownContextPct !== null && unknownContextPct >= thresholds.unknownDominanceLimit) warnings.push("UNKNOWN_CONTEXT_DOMINATES");
  if (!hasRangeSubset) warnings.push("RANGE_SUBSET_MISSING");
  if (distinctPriceContexts < 2) warnings.push("PRICE_CONTEXT_NOT_DIVERSE");
  if (distinctDynamicGridContexts < 2) warnings.push("DYNAMIC_GRID_CONTEXT_NOT_DIVERSE");
  if (entryTouched < thresholds.minEntryTouchForPerf) warnings.push("LOW_ENTRY_TOUCH_SAMPLE");
  if (targetUnderperforms) warnings.push("TARGET_NOT_OUTPERFORMING_INVALIDATION");

  let status: ShadowOutcomeQualityStatus;
  if (contextReadySetups < thresholds.minContextReadySetups) {
    status = "EARLY_SAMPLE";
  } else if (unknownContextPct !== null && unknownContextPct >= thresholds.unknownDominanceLimit) {
    status = "UNKNOWN_CONTEXT_DOMINATES";
  } else if (
    distinctRegimes < thresholds.minDistinctRegimes ||
    (thresholds.rangeSubsetRequired && !hasRangeSubset) ||
    (thresholds.priceContextDiversityRequired && distinctPriceContexts < 2) ||
    (thresholds.dynamicGridContextDiversityRequired && distinctDynamicGridContexts < 2)
  ) {
    status = "CONTEXT_BIASED";
  } else if (performanceSampleReady && targetUnderperforms) {
    status = "WARNING_DEGRADED";
  } else if (failedGates.length === 0) {
    status = "REVIEW_READY";
  } else {
    status = "NOT_ACTIONABLE";
  }

  const sampleQuality: ShadowOutcomeSampleQuality =
    status === "REVIEW_READY" ? "HIGH" : status === "NOT_ACTIONABLE" || status === "CONTEXT_BIASED" ? "MEDIUM" : "LOW";

  return {
    schemaVersion: 1,
    source: SOURCE,
    status,
    readiness: "REVIEW_NOT_ACTIVATION",
    verdict: `${status} - review only, not activation.`,
    sampleQuality,
    activationAllowed: false,
    reviewOnly: true,
    metrics: {
      totalSetups,
      geometryReady: count(overall.geometryReady),
      resolvedOutcomes: resolvedOutcomes(overall),
      contextReadySetups,
      unknownContextSetups,
      unknownContextPct,
      contextReadyResolved,
      distinctRegimes,
      rangeSetups,
      hasRangeSubset,
      distinctPriceContexts,
      distinctDynamicGridContexts,
      dominantPriceVsGrid,
      dominantDynamicGridStatus,
      entryTouched,
      entryTouchRate: rate(overall.entryTouchRate),
      entryNotReachedRate: rate(overall.entryNotReachedRate),
      invalidationFirstRate: rate(overall.invalidationFirstRate),
      targetAfterEntryTouchRate,
      invalidationAfterEntryTouchRate,
      timeoutAfterEntryTouchRate: rate(overall.timeoutAfterEntryTouchRate),
    },
    thresholds,
    passedGates,
    failedGates,
    warnings,
    nextAction:
      status === "REVIEW_READY"
        ? "review_shadow_outcome_quality_without_activation"
        : "continue_collecting_shadow_outcomes_without_activation",
  };
}
