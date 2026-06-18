// dashboard/lib/trend/mtfExactZoneFailureAttribution.ts
// D7.1 - read-only exact-zone failure attribution.
//
// SAFETY:
//   - Pure helper only. No I/O, no env reads, no network, no runtime writes.
//   - Diagnostics-only. Review-only/shadow-only. Never enables paper or live action.

export interface MtfExactZoneFailureAttribution {
  schemaVersion: 1;
  source: "MTF_EXACT_ZONE_FAILURE_ATTRIBUTION_V1";
  status:
    | "NO_DATA"
    | "GEOMETRY_PROMISING_EXECUTION_WEAK"
    | "FAILURE_DOMINATED"
    | "CLEAN_SUBSET_NOT_FOUND"
    | "CLEAN_CANDIDATE_REVIEW_READY_NOT_ACTIVATION";
  readiness: "REVIEW_NOT_ACTIVATION";
  activationAllowed: false;
  paperActivationAllowed: false;
  liveActivationAllowed: false;
  reviewOnly: true;
  shadowOnly: true;
  sample: {
    lifetimeExactSamples: number | null;
    windowExactSamples: number | null;
    currentPriceEligibleExactSamples: number | null;
    reviewTargetSamples: 100;
    sampleGatePassed: boolean;
    sampleInterpretation: string;
  };
  geometryEdge: {
    exactAvgNetRR: number | null;
    heuristicAvgNetRR: number | null;
    delta: number | null;
    ratio: number | null;
    status: "NO_GEOMETRY_EDGE" | "GEOMETRY_EDGE_PROMISING" | "GEOMETRY_EDGE_STRONG";
  };
  failureRates: {
    targetTooCloseRate: number | null;
    missedFillRate: number | null;
    entryTouchRate: number | null;
    targetAfterTouchRate: number | null;
    invalidationAfterTouchRate: number | null;
  };
  failureAttribution: {
    dominantFailures: Array<{
      code:
        | "TARGET_TOO_CLOSE_DOMINATES"
        | "MISSED_FILL_DOMINATES"
        | "TARGET_AFTER_TOUCH_NOT_PROVEN"
        | "INVALIDATION_AFTER_TOUCH_DOMINATES"
        | "CURRENT_PRICE_ELIGIBLE_MISSING"
        | "NO_DOMINANT_FAILURE";
      severity: "INFO" | "WARNING" | "BLOCKER";
      evidence: string[];
      interpretation: string;
    }>;
  };
  cleanSubsetGate: {
    status: "NOT_READY" | "PARTIAL" | "REVIEW_READY_NOT_ACTIVATION";
    passed: string[];
    failed: string[];
    thresholds: {
      minLifetimeExactSamples: 100;
      maxTargetTooCloseRate: 0.4;
      maxMissedFillRate: 0.5;
      minEntryTouchRate: 0.35;
      minTargetAfterTouchRate: 0.25;
      maxInvalidationAfterTouchRate: 0.5;
      currentPriceEligibleRequired: true;
    };
  };
  nextAction: {
    primary: string;
    reviewTasks: string[];
    doNotDo: string[];
  };
}

export interface MtfExactZoneFailureAttributionInput {
  mtfEntryCandidatePipeline?: unknown;
  exactZoneComparisonSummary?: unknown;
  mtfObFvgShadowSummary?: unknown;
  shadowOutcomeSummary?: unknown;
  shadowOutcomeQualityGate?: unknown;
  shadowEvidenceCoverage?: unknown;
  canonicalMarketRegime?: unknown;
  currentPriceContext?: unknown;
  currentCandidateReevaluation?: unknown;
}

const SOURCE = "MTF_EXACT_ZONE_FAILURE_ATTRIBUTION_V1" as const;
const REVIEW_TARGET = 100 as const;
const THRESHOLDS = {
  minLifetimeExactSamples: REVIEW_TARGET,
  maxTargetTooCloseRate: 0.4,
  maxMissedFillRate: 0.5,
  minEntryTouchRate: 0.35,
  minTargetAfterTouchRate: 0.25,
  maxInvalidationAfterTouchRate: 0.5,
  currentPriceEligibleRequired: true,
} as const;

function obj(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function count(value: unknown): number {
  const n = num(value);
  return n == null ? 0 : Math.max(0, n);
}

function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function rate(numerator: number, denominator: number | null): number | null {
  return denominator != null && denominator > 0 ? round4(numerator / denominator) : null;
}

function firstNumber(...values: unknown[]): number | null {
  for (const value of values) {
    const n = num(value);
    if (n != null) return n;
  }
  return null;
}

function emptyAttribution(): MtfExactZoneFailureAttribution {
  return {
    schemaVersion: 1,
    source: SOURCE,
    status: "NO_DATA",
    readiness: "REVIEW_NOT_ACTIVATION",
    activationAllowed: false,
    paperActivationAllowed: false,
    liveActivationAllowed: false,
    reviewOnly: true,
    shadowOnly: true,
    sample: {
      lifetimeExactSamples: null,
      windowExactSamples: null,
      currentPriceEligibleExactSamples: null,
      reviewTargetSamples: REVIEW_TARGET,
      sampleGatePassed: false,
      sampleInterpretation: "No exact-zone sample accounting is available.",
    },
    geometryEdge: {
      exactAvgNetRR: null,
      heuristicAvgNetRR: null,
      delta: null,
      ratio: null,
      status: "NO_GEOMETRY_EDGE",
    },
    failureRates: {
      targetTooCloseRate: null,
      missedFillRate: null,
      entryTouchRate: null,
      targetAfterTouchRate: null,
      invalidationAfterTouchRate: null,
    },
    failureAttribution: {
      dominantFailures: [{
        code: "NO_DOMINANT_FAILURE",
        severity: "INFO",
        evidence: ["No exact-zone failure diagnostics available."],
        interpretation: "Collect exact-zone and shadow outcome diagnostics before attributing failures.",
      }],
    },
    cleanSubsetGate: {
      status: "NOT_READY",
      passed: [],
      failed: ["no exact-zone failure diagnostics"],
      thresholds: THRESHOLDS,
    },
    nextAction: {
      primary: "continue collecting exact-zone diagnostics before clean subset review",
      reviewTasks: ["collect exact-zone comparison and shadow outcome evidence"],
      doNotDo: ["do not activate paper/live", "do not place trades"],
    },
  };
}

export function evaluateMtfExactZoneFailureAttribution(
  input: MtfExactZoneFailureAttributionInput = {},
): MtfExactZoneFailureAttribution {
  const pipeline = obj(input.mtfEntryCandidatePipeline);
  const accounting = obj(pipeline.sampleAccounting);
  const zone = obj(pipeline.zoneCandidate);
  const trigger = obj(pipeline.triggerReview);
  const geometry = obj(pipeline.geometry);
  const exact = obj(input.exactZoneComparisonSummary);
  const fill = obj(exact.fillResolution);
  const breakdown = obj(exact.conflictBreakdown);
  const readinessCounts = obj(exact.exactReadinessCounts);
  const shadowOutcomes = obj(obj(input.shadowOutcomeSummary).shadowOutcomes);

  const windowExactSamples = firstNumber(accounting.windowExactSamples, exact.exactSamples, zone.exactSamples);
  const lifetimeExactSamples = firstNumber(accounting.lifetimeExactSamples);
  const currentPriceEligibleExactSamples = firstNumber(accounting.currentPriceEligibleExactSamples);
  const exactAvgNetRR = firstNumber(exact.exactAvgNetRR, zone.exactAvgNetRR);
  const heuristicAvgNetRR = firstNumber(exact.heuristicAvgNetRR, zone.heuristicAvgNetRR);
  const delta = firstNumber(exact.avgExactVsHeuristicDelta, zone.exactVsHeuristicDelta)
    ?? (exactAvgNetRR != null && heuristicAvgNetRR != null ? round4(exactAvgNetRR - heuristicAvgNetRR) : null);
  const ratio = exactAvgNetRR != null && heuristicAvgNetRR != null && heuristicAvgNetRR !== 0
    ? round4(exactAvgNetRR / heuristicAvgNetRR)
    : null;

  const targetTooCloseCount = count(breakdown.TARGET_TOO_CLOSE ?? readinessCounts.TARGET_TOO_CLOSE);
  const targetTooCloseRate = rate(targetTooCloseCount, windowExactSamples);
  const missedFillRate = firstNumber(fill.missedFillRate, geometry.missedFillRate);
  const entryTouched = firstNumber(shadowOutcomes.entryTouched, trigger.entryTouched);
  const totalSetups = firstNumber(shadowOutcomes.totalSetups, windowExactSamples);
  const entryTouchRate = firstNumber(shadowOutcomes.entryTouchRate, trigger.entryTouchRate)
    ?? (entryTouched != null ? rate(entryTouched, totalSetups) : null);
  const targetAfterTouchRate = firstNumber(shadowOutcomes.targetAfterEntryTouchRate, trigger.targetAfterEntryTouchRate);
  const invalidationAfterTouchRate = firstNumber(shadowOutcomes.invalidationAfterEntryTouchRate, trigger.invalidationAfterEntryTouchRate);

  const hasAnyData =
    lifetimeExactSamples != null ||
    windowExactSamples != null ||
    exactAvgNetRR != null ||
    heuristicAvgNetRR != null ||
    targetTooCloseRate != null ||
    missedFillRate != null ||
    entryTouchRate != null;
  if (!hasAnyData) return emptyAttribution();

  const sampleGatePassed = lifetimeExactSamples != null && lifetimeExactSamples >= REVIEW_TARGET;
  const geometryStatus: MtfExactZoneFailureAttribution["geometryEdge"]["status"] =
    delta == null || delta <= 0 || exactAvgNetRR == null || heuristicAvgNetRR == null
      ? "NO_GEOMETRY_EDGE"
      : delta >= 2 || (ratio ?? 0) >= 2
        ? "GEOMETRY_EDGE_STRONG"
        : "GEOMETRY_EDGE_PROMISING";

  const passed: string[] = [];
  const failed: string[] = [];
  if (sampleGatePassed) passed.push("lifetimeExactSamples >= 100");
  else failed.push("lifetimeExactSamples < 100");

  if (targetTooCloseRate != null && targetTooCloseRate <= THRESHOLDS.maxTargetTooCloseRate) passed.push("targetTooCloseRate <= 0.4");
  else failed.push("targetTooCloseRate > 0.4 or unavailable");

  if (missedFillRate != null && missedFillRate <= THRESHOLDS.maxMissedFillRate) passed.push("missedFillRate <= 0.5");
  else failed.push("missedFillRate > 0.5 or unavailable");

  if (entryTouchRate != null && entryTouchRate >= THRESHOLDS.minEntryTouchRate) passed.push("entryTouchRate >= 0.35");
  else failed.push("entryTouchRate < 0.35 or unavailable");

  if (targetAfterTouchRate != null && targetAfterTouchRate >= THRESHOLDS.minTargetAfterTouchRate) passed.push("targetAfterTouchRate >= 0.25");
  else failed.push("targetAfterTouchRate < 0.25 or unavailable");

  if (invalidationAfterTouchRate != null && invalidationAfterTouchRate <= THRESHOLDS.maxInvalidationAfterTouchRate) passed.push("invalidationAfterTouchRate <= 0.5");
  else failed.push("invalidationAfterTouchRate > 0.5 or unavailable");

  if (currentPriceEligibleExactSamples != null && currentPriceEligibleExactSamples > 0) passed.push("currentPriceEligibleExactSamples available");
  else failed.push("currentPriceEligibleExactSamples missing");

  const dominantFailures: MtfExactZoneFailureAttribution["failureAttribution"]["dominantFailures"] = [];
  if (targetTooCloseRate != null && targetTooCloseRate > THRESHOLDS.maxTargetTooCloseRate) {
    dominantFailures.push({
      code: "TARGET_TOO_CLOSE_DOMINATES",
      severity: "BLOCKER",
      evidence: [`TARGET_TOO_CLOSE ${targetTooCloseCount}/${windowExactSamples ?? "unknown"} (${round4(targetTooCloseRate * 100)}%)`],
      interpretation: "Many exact-zone candidates are too close to the target, so the clean subset is not isolated.",
    });
  }
  if (missedFillRate != null && missedFillRate > THRESHOLDS.maxMissedFillRate) {
    dominantFailures.push({
      code: "MISSED_FILL_DOMINATES",
      severity: "BLOCKER",
      evidence: [`missedFillRate=${round4(missedFillRate * 100)}%`],
      interpretation: "Exact-zone geometry is not translating into enough reachable fills.",
    });
  }
  if (targetAfterTouchRate == null || targetAfterTouchRate < THRESHOLDS.minTargetAfterTouchRate) {
    dominantFailures.push({
      code: "TARGET_AFTER_TOUCH_NOT_PROVEN",
      severity: "BLOCKER",
      evidence: [`targetAfterTouchRate=${targetAfterTouchRate == null ? "unknown" : `${round4(targetAfterTouchRate * 100)}%`}`],
      interpretation: "After entry touch, target reach is not proven enough for clean review.",
    });
  }
  if (
    targetAfterTouchRate != null &&
    invalidationAfterTouchRate != null &&
    targetAfterTouchRate <= invalidationAfterTouchRate
  ) {
    dominantFailures.push({
      code: "INVALIDATION_AFTER_TOUCH_DOMINATES",
      severity: "BLOCKER",
      evidence: [`targetAfterTouchRate=${round4(targetAfterTouchRate * 100)}%`, `invalidationAfterTouchRate=${round4(invalidationAfterTouchRate * 100)}%`],
      interpretation: "Invalidation is at least as common as target after entry touch.",
    });
  }
  if (currentPriceEligibleExactSamples == null) {
    dominantFailures.push({
      code: "CURRENT_PRICE_ELIGIBLE_MISSING",
      severity: "BLOCKER",
      evidence: ["currentPriceEligibleExactSamples is missing"],
      interpretation: "Current market actionability cannot be proven without current-price eligible exact samples.",
    });
  }
  if (!dominantFailures.length) {
    dominantFailures.push({
      code: "NO_DOMINANT_FAILURE",
      severity: "INFO",
      evidence: ["No dominant failure exceeded D7.1 thresholds."],
      interpretation: "Clean subset thresholds are not blocked by current failure rates.",
    });
  }

  const cleanReady = failed.length === 0;
  const cleanSubsetStatus: MtfExactZoneFailureAttribution["cleanSubsetGate"]["status"] = cleanReady
    ? "REVIEW_READY_NOT_ACTIVATION"
    : passed.length > 0
      ? "NOT_READY"
      : "NOT_READY";
  const status: MtfExactZoneFailureAttribution["status"] =
    cleanReady
      ? "CLEAN_CANDIDATE_REVIEW_READY_NOT_ACTIVATION"
      : geometryStatus !== "NO_GEOMETRY_EDGE" && sampleGatePassed
        ? "GEOMETRY_PROMISING_EXECUTION_WEAK"
        : sampleGatePassed
          ? "FAILURE_DOMINATED"
          : "CLEAN_SUBSET_NOT_FOUND";

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
    sample: {
      lifetimeExactSamples,
      windowExactSamples,
      currentPriceEligibleExactSamples,
      reviewTargetSamples: REVIEW_TARGET,
      sampleGatePassed,
      sampleInterpretation: sampleGatePassed
        ? "Sample gate passed at lifetime cumulative level; remaining blockers are quality and current-actionability gates."
        : "Lifetime cumulative exact samples are below the review target.",
    },
    geometryEdge: {
      exactAvgNetRR,
      heuristicAvgNetRR,
      delta,
      ratio,
      status: geometryStatus,
    },
    failureRates: {
      targetTooCloseRate,
      missedFillRate,
      entryTouchRate,
      targetAfterTouchRate,
      invalidationAfterTouchRate,
    },
    failureAttribution: { dominantFailures },
    cleanSubsetGate: {
      status: cleanSubsetStatus,
      passed,
      failed,
      thresholds: THRESHOLDS,
    },
    nextAction: {
      primary: cleanReady
        ? "manual review only; keep activation disabled"
        : "isolate clean exact-zone subset before review",
      reviewTasks: cleanReady
        ? ["review clean subset evidence manually", "keep paper/live activation disabled"]
        : [
            "separate target-too-close cases from cleaner exact-zone candidates",
            "reduce missed-fill dominant cases before treating RR geometry as actionable",
            "collect current-price eligible exact subset evidence",
          ],
      doNotDo: ["do not activate paper/live", "do not place trades", "do not change entry logic"],
    },
  };
}
