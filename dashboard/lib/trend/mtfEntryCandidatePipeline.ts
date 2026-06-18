// dashboard/lib/trend/mtfEntryCandidatePipeline.ts
// D7.0 - read-only MTF Entry Candidate Pipeline.
//
// SAFETY:
//   - Pure helper only. No I/O, no env reads, no network, no runtime writes.
//   - Consumes already-built diagnostics only.
//   - Review-only/shadow-only. Flags remain false and must not feed runner/gate/order paths.

export type MtfEntryCandidateStatus =
  | "NO_CANDIDATE"
  | "ZONE_BUILDING"
  | "ZONE_READY"
  | "WAITING_TRIGGER"
  | "ENTRY_TOUCHED_REVIEW"
  | "WARNING_DEGRADED"
  | "REVIEW_READY"
  | "NOT_READY";

export type MtfEntryCandidateVerdictStatus =
  | "PROMISING_GEOMETRY_BUT_EXECUTION_NOT_READY"
  | "INSUFFICIENT_EXACT_SAMPLES"
  | "TARGET_TOO_CLOSE_DOMINATES"
  | "INVALIDATION_DOMINATES_AFTER_TOUCH"
  | "WAIT_MORE_EVIDENCE"
  | "REVIEW_READY_NOT_ACTIVATION"
  | "NO_CANDIDATE";

export interface MtfEntryCandidatePipeline {
  schemaVersion: 1;
  source: "MTF_ENTRY_CANDIDATE_PIPELINE_V1";
  status: MtfEntryCandidateStatus;
  readiness: "REVIEW_NOT_ACTIVATION";
  activationAllowed: false;
  paperActivationAllowed: false;
  liveActivationAllowed: false;
  reviewOnly: true;
  shadowOnly: true;
  htfBias: {
    status: "BULLISH" | "BEARISH" | "RANGE" | "NO_TRADE" | "CONFLICT" | "UNKNOWN";
    confidence: number | null;
    source: string;
    reasons: string[];
    warnings: string[];
  };
  zoneCandidate: {
    status: "NO_EXACT_ZONE" | "EXACT_ZONE_AVAILABLE" | "EXACT_ZONE_CONFLICT" | "FVG_ONLY" | "TARGET_TOO_CLOSE" | "COST_TOO_HIGH" | "WARNING_DEGRADED";
    exactSamples: number;
    requiredExactSamples: 100;
    samplesRemaining: number;
    exactAvgNetRR: number | null;
    heuristicAvgNetRR: number | null;
    exactVsHeuristicDelta: number | null;
    usesExactObFvgZonesCount: number;
    dominantExactStatus: string | null;
    dominantExactReadiness: string | null;
    warningFlags: string[];
  };
  triggerReview: {
    status: "NO_TRIGGER" | "WAITING_LTF_CONFIRMATION" | "ENTRY_NOT_REACHED" | "ENTRY_TOUCHED" | "INVALIDATION_DOMINATES" | "TARGET_NOT_PROVEN" | "PENDING_FUTURE_CANDLES";
    entryTouched: number;
    entryTouchRate: number | null;
    entryNotReached: number;
    entryNotReachedRate: number | null;
    targetAfterEntryTouchRate: number | null;
    invalidationAfterEntryTouchRate: number | null;
    pending: number;
  };
  geometry: {
    status: "NO_GEOMETRY" | "GEOMETRY_READY" | "PARTIAL" | "WARNING_DEGRADED";
    geometryReady: number;
    noGeometry: number;
    fillResolutionStatus: string | null;
    missedFillRate: number | null;
    pending: number;
    notes: string[];
  };
  verdict: {
    status: MtfEntryCandidateVerdictStatus;
    summary: string;
    blockers: string[];
    nextAction: string;
  };
}

export interface MtfEntryCandidatePipelineInput {
  multiTimeframeIndicatorEvidence?: unknown;
  canonicalMarketRegime?: unknown;
  trendStrategy?: unknown;
  trendManualPaperArmGate?: unknown;
  trendPaperExecutionPreflight?: unknown;
  mtfObFvgShadowSummary?: unknown;
  exactZoneComparisonSummary?: unknown;
  shadowOutcomeSummary?: unknown;
  shadowOutcomeQualityGate?: unknown;
  shadowEvidenceCoverage?: unknown;
  noTradeReasonAnalysis?: unknown;
  reviewReadinessScore?: unknown;
}

const SOURCE = "MTF_ENTRY_CANDIDATE_PIPELINE_V1" as const;
const REQUIRED_EXACT_SAMPLES = 100 as const;
const TARGET_TOO_CLOSE_DOMINANT_RATE = 0.5;
const ACCEPTABLE_MISSED_FILL_RATE = 0.3;
const MIN_ENTRY_TOUCH_FOR_REVIEW = 20;

function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};
}

function fin(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function count(v: unknown): number {
  const n = fin(v);
  return n == null ? 0 : Math.max(0, n);
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
}

function strArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}

function rate(numerator: number, denominator: number): number | null {
  return denominator > 0 ? Math.round((numerator / denominator) * 10_000) / 10_000 : null;
}

function emptyPipeline(): MtfEntryCandidatePipeline {
  return {
    schemaVersion: 1,
    source: SOURCE,
    status: "NO_CANDIDATE",
    readiness: "REVIEW_NOT_ACTIVATION",
    activationAllowed: false,
    paperActivationAllowed: false,
    liveActivationAllowed: false,
    reviewOnly: true,
    shadowOnly: true,
    htfBias: {
      status: "UNKNOWN",
      confidence: null,
      source: "no_diagnostics",
      reasons: [],
      warnings: ["No MTF/canonical regime diagnostics available."],
    },
    zoneCandidate: {
      status: "NO_EXACT_ZONE",
      exactSamples: 0,
      requiredExactSamples: REQUIRED_EXACT_SAMPLES,
      samplesRemaining: REQUIRED_EXACT_SAMPLES,
      exactAvgNetRR: null,
      heuristicAvgNetRR: null,
      exactVsHeuristicDelta: null,
      usesExactObFvgZonesCount: 0,
      dominantExactStatus: null,
      dominantExactReadiness: null,
      warningFlags: ["REVIEW_NOT_ACTIVATION"],
    },
    triggerReview: {
      status: "NO_TRIGGER",
      entryTouched: 0,
      entryTouchRate: null,
      entryNotReached: 0,
      entryNotReachedRate: null,
      targetAfterEntryTouchRate: null,
      invalidationAfterEntryTouchRate: null,
      pending: 0,
    },
    geometry: {
      status: "NO_GEOMETRY",
      geometryReady: 0,
      noGeometry: 0,
      fillResolutionStatus: null,
      missedFillRate: null,
      pending: 0,
      notes: ["No exact-zone geometry available."],
    },
    verdict: {
      status: "NO_CANDIDATE",
      summary: "No MTF entry candidate diagnostics available.",
      blockers: ["missing exact-zone or MTF shadow diagnostics"],
      nextAction: "continue_collecting_shadow_diagnostics_without_activation",
    },
  };
}

function htfBias(input: MtfEntryCandidatePipelineInput): MtfEntryCandidatePipeline["htfBias"] {
  const canonical = obj(input.canonicalMarketRegime);
  const mtf = obj(input.multiTimeframeIndicatorEvidence);
  const regime = str(canonical.regime)?.toUpperCase() ?? null;
  const direction = str(canonical.direction)?.toUpperCase() ?? str(mtf.direction)?.toUpperCase() ?? null;
  const confidence = fin(canonical.confidence) ?? fin(mtf.confidence);
  const reasons = [...strArray(canonical.reasons), ...strArray(mtf.reasons)];
  const warnings = [...strArray(canonical.warnings), ...strArray(mtf.warnings)];

  let status: MtfEntryCandidatePipeline["htfBias"]["status"] = "UNKNOWN";
  if (regime === "NO_TRADE") status = "NO_TRADE";
  else if (regime === "RANGE") status = "RANGE";
  else if (direction === "BULLISH" || direction === "UP" || direction === "LONG") status = "BULLISH";
  else if (direction === "BEARISH" || direction === "DOWN" || direction === "SHORT") status = "BEARISH";
  if (str(canonical.status)?.toUpperCase() === "CONFLICT") status = "CONFLICT";

  return {
    status,
    confidence,
    source: Object.keys(canonical).length ? "canonicalMarketRegime" : Object.keys(mtf).length ? "multiTimeframeIndicatorEvidence" : "unknown",
    reasons,
    warnings,
  };
}

function shadowBucket(summary: unknown): Record<string, unknown> {
  return obj(obj(summary).shadowOutcomes);
}

function dominant(counts: Record<string, unknown>): string | null {
  const entries = Object.entries(counts).filter(([, value]) => typeof value === "number" && Number.isFinite(value) && value > 0);
  if (!entries.length) return null;
  entries.sort((a, b) => (b[1] as number) - (a[1] as number) || a[0].localeCompare(b[0]));
  return entries[0]![0];
}

function exactSummaryFromInput(input: MtfEntryCandidatePipelineInput): Record<string, unknown> {
  const primary = obj(input.exactZoneComparisonSummary);
  if (Object.keys(primary).length) return primary;

  const mtf = obj(input.mtfObFvgShadowSummary);
  const exactSamples = count(mtf.exactZoneSamples);
  if (exactSamples <= 0) return {};

  const exactDataStatusCounts = obj(mtf.exactZoneDataStatusCounts);
  const exactReadinessCounts = obj(mtf.exactZoneReadinessCounts);
  const targetTooClose = count(exactReadinessCounts.TARGET_TOO_CLOSE);
  const costTooHigh = count(exactReadinessCounts.COST_TOO_HIGH);
  const conflictingMtf = count(exactReadinessCounts.CONFLICTING_MTF);
  const warningFlags = ["REVIEW_NOT_ACTIVATION"];
  if (exactSamples < REQUIRED_EXACT_SAMPLES) warningFlags.push("LOW_EXACT_SAMPLE_SIZE");
  if (targetTooClose / exactSamples >= TARGET_TOO_CLOSE_DOMINANT_RATE) warningFlags.push("HIGH_TARGET_TOO_CLOSE_RATE");

  return {
    exactSamples,
    heuristicSamples: 0,
    exactAvgNetRR: fin(mtf.exactAvgNetRR),
    heuristicAvgNetRR: null,
    avgExactVsHeuristicDelta: fin(mtf.exactVsHeuristicAvgDelta),
    exactDataStatusCounts,
    exactReadinessCounts,
    usesExactObFvgZonesCount: count(mtf.usesExactObFvgZonesCount),
    fillResolutionInputSamples: count(mtf.fillResolutionInputSamples),
    fillResolutionInputMissing: Math.max(0, exactSamples - count(mtf.fillResolutionInputSamples)),
    fillResolutionGeometryReadyCount: count(mtf.fillResolutionGeometryReadyCount),
    dominantExactStatus: dominant(exactDataStatusCounts),
    dominantExactReadiness: dominant(exactReadinessCounts),
    fillResolution: {},
    warningFlags,
    conflictBreakdown: {
      TARGET_TOO_CLOSE: targetTooClose,
      COST_TOO_HIGH: costTooHigh,
      CONFLICTING_MTF: conflictingMtf,
      other: {},
    },
    readiness: "CONTINUE_LOGGING",
    source: "MTF_OB_FVG_SHADOW_SUMMARY_FALLBACK",
  };
}

function zoneStatus(exact: Record<string, unknown>, exactSamples: number): MtfEntryCandidatePipeline["zoneCandidate"]["status"] {
  if (exactSamples <= 0) return "NO_EXACT_ZONE";
  const dominantStatus = str(exact.dominantExactStatus);
  const dominantReadiness = str(exact.dominantExactReadiness);
  if (dominantReadiness === "TARGET_TOO_CLOSE") return "TARGET_TOO_CLOSE";
  if (dominantReadiness === "COST_TOO_HIGH") return "COST_TOO_HIGH";
  if (dominantStatus === "EXACT_ZONE_CONFLICT") return "EXACT_ZONE_CONFLICT";
  if (dominantStatus === "FVG_ONLY") return "FVG_ONLY";
  if (strArray(exact.warningFlags).some((flag) => flag !== "REVIEW_NOT_ACTIVATION")) return "WARNING_DEGRADED";
  return "EXACT_ZONE_AVAILABLE";
}

function targetTooCloseCount(exact: Record<string, unknown>): number {
  const breakdown = obj(exact.conflictBreakdown);
  const readiness = obj(exact.exactReadinessCounts);
  return count(breakdown.TARGET_TOO_CLOSE ?? readiness.TARGET_TOO_CLOSE);
}

function triggerStatus(values: {
  entryTouched: number;
  entryNotReached: number;
  pending: number;
  targetAfterEntryTouchRate: number | null;
  invalidationAfterEntryTouchRate: number | null;
}): MtfEntryCandidatePipeline["triggerReview"]["status"] {
  if (values.pending > 0 && values.entryTouched === 0) return "PENDING_FUTURE_CANDLES";
  if (values.entryTouched <= 0 && values.entryNotReached > 0) return "ENTRY_NOT_REACHED";
  if (values.entryTouched <= 0) return "WAITING_LTF_CONFIRMATION";
  if (
    values.entryTouched >= MIN_ENTRY_TOUCH_FOR_REVIEW &&
    values.targetAfterEntryTouchRate != null &&
    values.invalidationAfterEntryTouchRate != null &&
    values.invalidationAfterEntryTouchRate > values.targetAfterEntryTouchRate
  ) return "INVALIDATION_DOMINATES";
  if (values.targetAfterEntryTouchRate === 0) return "TARGET_NOT_PROVEN";
  return "ENTRY_TOUCHED";
}

function hasCandidateData(input: MtfEntryCandidatePipelineInput, exactSamples: number): boolean {
  return exactSamples > 0 || Object.keys(obj(input.mtfObFvgShadowSummary)).length > 0 || Object.keys(obj(input.multiTimeframeIndicatorEvidence)).length > 0;
}

export function evaluateMtfEntryCandidatePipeline(input: MtfEntryCandidatePipelineInput = {}): MtfEntryCandidatePipeline {
  const exact = exactSummaryFromInput(input);
  const bucket = shadowBucket(input.shadowOutcomeSummary);
  const fill = obj(exact.fillResolution);
  const exactSamples = count(exact.exactSamples);

  if (!hasCandidateData(input, exactSamples)) return emptyPipeline();

  const exactAvgNetRR = fin(exact.exactAvgNetRR);
  const heuristicAvgNetRR = fin(exact.heuristicAvgNetRR);
  const exactVsHeuristicDelta = fin(exact.avgExactVsHeuristicDelta);
  const samplesRemaining = Math.max(0, REQUIRED_EXACT_SAMPLES - exactSamples);
  const ttcCount = targetTooCloseCount(exact);
  const targetTooCloseRate = rate(ttcCount, exactSamples);
  const missedFillRate = fin(fill.missedFillRate);
  const entryTouched = count(bucket.entryTouched);
  const entryNotReached = count(bucket.entryNotReached);
  const pending = count(bucket.pending);
  const targetAfterEntryTouchRate = fin(bucket.targetAfterEntryTouchRate);
  const invalidationAfterEntryTouchRate = fin(bucket.invalidationAfterEntryTouchRate);
  const warningFlags = strArray(exact.warningFlags);
  const promisingGeometry =
    exactAvgNetRR != null &&
    heuristicAvgNetRR != null &&
    (exactVsHeuristicDelta ?? exactAvgNetRR - heuristicAvgNetRR) > 1;
  const invalidationDominates =
    entryTouched >= MIN_ENTRY_TOUCH_FOR_REVIEW &&
    targetAfterEntryTouchRate != null &&
    invalidationAfterEntryTouchRate != null &&
    invalidationAfterEntryTouchRate > targetAfterEntryTouchRate;
  const targetTooCloseDominates = (targetTooCloseRate ?? 0) >= TARGET_TOO_CLOSE_DOMINANT_RATE;
  const missedFillWeak = missedFillRate != null && missedFillRate > ACCEPTABLE_MISSED_FILL_RATE;

  const blockers: string[] = [];
  if (samplesRemaining > 0) blockers.push(`exact samples ${exactSamples}/${REQUIRED_EXACT_SAMPLES} - ขาด exact samples อีก ${samplesRemaining}`);
  if (targetTooCloseDominates) blockers.push(`TARGET_TOO_CLOSE สูง (${ttcCount}/${exactSamples})`);
  if (missedFillWeak) blockers.push(`Missed fill rate สูง (${Math.round((missedFillRate ?? 0) * 100)}%)`);
  if (targetAfterEntryTouchRate === 0) blockers.push("หลัง entry touch ยังไม่เห็น target ชนะ invalidation");
  if (invalidationDominates) blockers.push("invalidation dominates after entry touch");

  let verdictStatus: MtfEntryCandidateVerdictStatus = "WAIT_MORE_EVIDENCE";
  if (promisingGeometry && (blockers.length > 0 || missedFillWeak || invalidationDominates)) {
    verdictStatus = "PROMISING_GEOMETRY_BUT_EXECUTION_NOT_READY";
  } else if (samplesRemaining > 0) {
    verdictStatus = "INSUFFICIENT_EXACT_SAMPLES";
  } else if (targetTooCloseDominates) {
    verdictStatus = "TARGET_TOO_CLOSE_DOMINATES";
  } else if (invalidationDominates) {
    verdictStatus = "INVALIDATION_DOMINATES_AFTER_TOUCH";
  }

  const cleanReviewReady =
    exactSamples >= REQUIRED_EXACT_SAMPLES &&
    !targetTooCloseDominates &&
    !missedFillWeak &&
    entryTouched >= MIN_ENTRY_TOUCH_FOR_REVIEW &&
    targetAfterEntryTouchRate != null &&
    invalidationAfterEntryTouchRate != null &&
    targetAfterEntryTouchRate > invalidationAfterEntryTouchRate &&
    !warningFlags.some((flag) => flag !== "REVIEW_NOT_ACTIVATION");

  if (cleanReviewReady) verdictStatus = "REVIEW_READY_NOT_ACTIVATION";
  else if (exactSamples >= REQUIRED_EXACT_SAMPLES && invalidationDominates) {
    verdictStatus = "INVALIDATION_DOMINATES_AFTER_TOUCH";
  }

  const triggerReview: MtfEntryCandidatePipeline["triggerReview"] = {
    status: triggerStatus({ entryTouched, entryNotReached, pending, targetAfterEntryTouchRate, invalidationAfterEntryTouchRate }),
    entryTouched,
    entryTouchRate: fin(bucket.entryTouchRate),
    entryNotReached,
    entryNotReachedRate: fin(bucket.entryNotReachedRate),
    targetAfterEntryTouchRate,
    invalidationAfterEntryTouchRate,
    pending,
  };

  const geometryReady = count(bucket.geometryReady ?? exact.fillResolutionGeometryReadyCount);
  const noGeometry = count(bucket.noGeometry ?? exact.fillResolutionInputMissing);
  const geometryStatus: MtfEntryCandidatePipeline["geometry"]["status"] =
    geometryReady <= 0
      ? "NO_GEOMETRY"
      : missedFillWeak || invalidationDominates
        ? "WARNING_DEGRADED"
        : noGeometry > 0 || pending > 0
          ? "PARTIAL"
          : "GEOMETRY_READY";

  const status: MtfEntryCandidateStatus =
    cleanReviewReady
      ? "REVIEW_READY"
      : blockers.length > 0 || warningFlags.some((flag) => flag !== "REVIEW_NOT_ACTIVATION")
        ? "WARNING_DEGRADED"
        : triggerReview.status === "ENTRY_TOUCHED"
          ? "ENTRY_TOUCHED_REVIEW"
          : exactSamples > 0
            ? "WAITING_TRIGGER"
            : "ZONE_BUILDING";

  return {
    schemaVersion: 1,
    source: SOURCE,
    status,
    readiness: "REVIEW_NOT_ACTIVATION",
    activationAllowed: false,
    paperActivationAllowed: false,
    liveActivationAllowed: false,
    reviewOnly: true,
    shadowOnly: true,
    htfBias: htfBias(input),
    zoneCandidate: {
      status: zoneStatus(exact, exactSamples),
      exactSamples,
      requiredExactSamples: REQUIRED_EXACT_SAMPLES,
      samplesRemaining,
      exactAvgNetRR,
      heuristicAvgNetRR,
      exactVsHeuristicDelta,
      usesExactObFvgZonesCount: count(exact.usesExactObFvgZonesCount),
      dominantExactStatus: str(exact.dominantExactStatus),
      dominantExactReadiness: str(exact.dominantExactReadiness),
      warningFlags,
    },
    triggerReview,
    geometry: {
      status: geometryStatus,
      geometryReady,
      noGeometry,
      fillResolutionStatus: str(fill.status),
      missedFillRate,
      pending,
      notes: [
        fill.status ? `fill status: ${String(fill.status)}` : "fill status unavailable",
        "review-only geometry; no live or paper activation",
      ],
    },
    verdict: {
      status: verdictStatus,
      summary: verdictStatus === "REVIEW_READY_NOT_ACTIVATION"
        ? "Candidate is ready for manual review only; activation remains disabled."
        : promisingGeometry
          ? "Exact Zone มี RR geometry ดีกว่า heuristic แต่ execution outcome ยังไม่พร้อม"
          : "Candidate needs more evidence before manual review.",
      blockers,
      nextAction: cleanReviewReady
        ? "manual_review_only_keep_activation_disabled"
        : "continue_collecting_exact_zone_and_shadow_outcome_evidence",
    },
  };
}
