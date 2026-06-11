// dashboard/lib/trend/mtfObFvgShadowReview.ts
// Phase T-3H-6-c2 - read-only review of MTF OB/FVG shadow history.
//
// SAFETY:
//   - Pure diagnostics only.
//   - No entry, threshold, runner, route, journal, order, or activation impact.

export type MtfObFvgShadowSampleTier = "INSUFFICIENT_LT_50" | "EARLY_PATTERN_50_TO_99" | "REVIEW_READY_100_PLUS";
export type MtfObFvgShadowEvidenceGrade = "NO_DATA" | "WEAK" | "PROMISING" | "STRONG_SHADOW" | "NEEDS_EXACT_ZONE_DATA";
export type MtfObFvgShadowReadiness =
  | "OBSERVE_ONLY"
  | "CONTINUE_LOGGING"
  | "EXACT_ZONE_DETECTOR_RECOMMENDED"
  | "ELIGIBLE_FOR_REVIEW_AFTER_100";
export type MtfObFvgExactZoneReadiness = "EXACT_ZONE_READY" | "PARTIAL_DATA_ONLY" | "HEURISTIC_ONLY" | "MISSING_REQUIRED_DATA";

export interface MtfObFvgShadowSummaryLike {
  available: boolean;
  totalShadowSamples: number;
  averageCurrentNetRR: number | null;
  averageRefinedNetRR: number | null;
  averageNetRrImprovement: number | null;
  passNetCount: number;
  qualityScoreAverage: number | null;
  classificationCounts: Record<string, number>;
  dataStatusCounts: Record<string, number>;
}

export interface MtfObFvgShadowReview {
  sampleCount: number;
  sampleTier: MtfObFvgShadowSampleTier;
  avgCurrentNetRR: number | null;
  avgRefinedNetRR: number | null;
  avgNetRrImprovement: number | null;
  passNetRate: number | null;
  qualityAverage: number | null;
  dataStatusDominant: string | null;
  classificationDominant: string | null;
  evidenceGrade: MtfObFvgShadowEvidenceGrade;
  readiness: MtfObFvgShadowReadiness;
  exactZoneReadiness: MtfObFvgExactZoneReadiness;
  warnings: string[];
  recommendedNextStep: string;
  shadowOnly: true;
  paperActivationAllowed: false;
  liveActivationAllowed: false;
  exchangeOrderAllowed: false;
}

const PROMISING_MIN_IMPROVEMENT = 0.2;
const PROMISING_MIN_PASS_NET_RATE = 0.7;
const PROMISING_MIN_QUALITY = 65;

const round4 = (v: number): number => Math.round(v * 10_000) / 10_000;

function finiteOrNull(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function dominant(counts: Record<string, number> | null | undefined): string | null {
  if (!counts) return null;
  let winner: string | null = null;
  let winnerCount = 0;
  for (const [key, value] of Object.entries(counts)) {
    if (!key || !Number.isFinite(value) || value <= 0) continue;
    if (value > winnerCount || (value === winnerCount && winner != null && key < winner)) {
      winner = key;
      winnerCount = value;
    }
  }
  return winner;
}

function sampleTier(sampleCount: number): MtfObFvgShadowSampleTier {
  if (sampleCount >= 100) return "REVIEW_READY_100_PLUS";
  if (sampleCount >= 50) return "EARLY_PATTERN_50_TO_99";
  return "INSUFFICIENT_LT_50";
}

function exactZoneReadiness(summary: MtfObFvgShadowSummaryLike, dataStatusDominant: string | null): MtfObFvgExactZoneReadiness {
  if (!summary.available || summary.totalShadowSamples <= 0) return "MISSING_REQUIRED_DATA";
  const exactCount = summary.dataStatusCounts.ACTUAL_OB_FVG_AVAILABLE ?? 0;
  const heuristicCount = summary.dataStatusCounts.HEURISTIC_ESTIMATE_ONLY ?? 0;
  if (exactCount > 0 && heuristicCount === 0 && dataStatusDominant === "ACTUAL_OB_FVG_AVAILABLE") return "EXACT_ZONE_READY";
  if (exactCount > 0) return "PARTIAL_DATA_ONLY";
  if (heuristicCount > 0 || dataStatusDominant === "HEURISTIC_ESTIMATE_ONLY") return "HEURISTIC_ONLY";
  return "MISSING_REQUIRED_DATA";
}

function hasPromisingMetrics(summary: MtfObFvgShadowSummaryLike, passNetRate: number | null): boolean {
  const improvement = finiteOrNull(summary.averageNetRrImprovement);
  const quality = finiteOrNull(summary.qualityScoreAverage);
  return (
    improvement != null &&
    passNetRate != null &&
    quality != null &&
    improvement >= PROMISING_MIN_IMPROVEMENT &&
    passNetRate >= PROMISING_MIN_PASS_NET_RATE &&
    quality >= PROMISING_MIN_QUALITY
  );
}

export function reviewMtfObFvgShadowSummary(summary: MtfObFvgShadowSummaryLike): MtfObFvgShadowReview {
  const sampleCount = Math.max(0, Math.floor(finiteOrNull(summary.totalShadowSamples) ?? 0));
  const tier = sampleTier(sampleCount);
  const passNetRate = sampleCount > 0 ? round4(Math.max(0, Math.min(1, summary.passNetCount / sampleCount))) : null;
  const dataStatusDominant = dominant(summary.dataStatusCounts);
  const classificationDominant = dominant(summary.classificationCounts);
  const exactReadiness = exactZoneReadiness(summary, dataStatusDominant);
  const promising = hasPromisingMetrics(summary, passNetRate);
  const warnings: string[] = [];

  let evidenceGrade: MtfObFvgShadowEvidenceGrade = "NO_DATA";
  let readiness: MtfObFvgShadowReadiness = "OBSERVE_ONLY";
  let recommendedNextStep = "Continue collecting shadow observations before changing any plan.";

  if (!summary.available || sampleCount === 0) {
    warnings.push("No MTF OB/FVG shadow history is available yet.");
  } else if (sampleCount < 50) {
    evidenceGrade = "WEAK";
    readiness = "CONTINUE_LOGGING";
    recommendedNextStep = "Keep logging until at least 50 shadow samples are available.";
    warnings.push("Shadow sample count is below the 50-sample early-pattern threshold.");
  } else if (promising && sampleCount >= 100) {
    evidenceGrade = "STRONG_SHADOW";
    readiness = "ELIGIBLE_FOR_REVIEW_AFTER_100";
    recommendedNextStep = "Review the shadow evidence pack, then design exact-zone detector tests separately.";
  } else if (promising) {
    evidenceGrade = "PROMISING";
    readiness = "EXACT_ZONE_DETECTOR_RECOMMENDED";
    recommendedNextStep = "Design exact OB/FVG coordinate detection before any controlled activation discussion.";
  } else {
    evidenceGrade = sampleCount >= 50 && exactReadiness !== "EXACT_ZONE_READY" ? "NEEDS_EXACT_ZONE_DATA" : "WEAK";
    readiness = sampleCount >= 100 ? "ELIGIBLE_FOR_REVIEW_AFTER_100" : "CONTINUE_LOGGING";
    recommendedNextStep = "Keep this as observe-only and review whether exact-zone data is available.";
    warnings.push("Shadow metrics are not strong enough for readiness review.");
  }

  if (exactReadiness === "HEURISTIC_ONLY") {
    warnings.push("Shadow is promising but still heuristic. Exact OB/FVG coordinates are required before controlled activation.");
  } else if (exactReadiness === "PARTIAL_DATA_ONLY") {
    warnings.push("Exact OB/FVG coordinates are only partially available; do not use this for entry decisions.");
  } else if (exactReadiness === "MISSING_REQUIRED_DATA" && sampleCount > 0) {
    warnings.push("Exact OB/FVG zone readiness is missing required structured data.");
  }

  warnings.push("Shadow review only - not an entry signal and not an activation gate.");

  return {
    sampleCount,
    sampleTier: tier,
    avgCurrentNetRR: finiteOrNull(summary.averageCurrentNetRR),
    avgRefinedNetRR: finiteOrNull(summary.averageRefinedNetRR),
    avgNetRrImprovement: finiteOrNull(summary.averageNetRrImprovement),
    passNetRate,
    qualityAverage: finiteOrNull(summary.qualityScoreAverage),
    dataStatusDominant,
    classificationDominant,
    evidenceGrade,
    readiness,
    exactZoneReadiness: exactReadiness,
    warnings,
    recommendedNextStep,
    shadowOnly: true,
    paperActivationAllowed: false,
    liveActivationAllowed: false,
    exchangeOrderAllowed: false,
  };
}
