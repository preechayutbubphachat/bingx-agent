export type ReviewDimensionKey = "grid" | "shadow" | "trend" | "noTradeExplanation";
export type ReviewOverallStatus = "NO_DATA" | "NOT_READY" | "PARTIAL_REVIEW" | "READY_FOR_REVIEW";

export interface ReviewDimension {
  status: string;
  score: number;
  weight: number;
  weightedScore: number;
  drivers: string[];
}

export interface ReviewReadinessScore {
  schemaVersion: 1;
  source: "REVIEW_READINESS_SCORE_V1";
  scoreType: "REVIEW_READINESS_NOT_ACTIVATION";
  tag: string;
  overallStatus: ReviewOverallStatus;
  overallScore: number;
  activationAllowed: false;
  reviewOnly: true;
  weights: { grid: 35; shadow: 35; trend: 20; noTradeExplanation: 10 };
  dimensions: Record<ReviewDimensionKey, ReviewDimension>;
  blockers: string[];
  disclaimer: "Review readiness only - not activation, not live, not order placement.";
  notes: string[];
}

export interface ReviewReadinessInput {
  edgeDiagnostics?: unknown;
  costGate?: unknown;
  paperDataQuality?: unknown;
  paperLoopDiagnostics?: unknown;
  closedCycles?: unknown;
  sellFillCount?: unknown;
  expectancy?: unknown;
  trendEdgeReview?: unknown;
  trendStrategy?: unknown;
  trendPaperEvidenceRunner?: unknown;
  trendEvidenceDecisionSummary?: unknown;
  shadowOutcomeQualityGate?: unknown;
  shadowEvidenceCoverage?: unknown;
  noTradeReasonAnalysis?: unknown;
}

const SOURCE = "REVIEW_READINESS_SCORE_V1" as const;
const SCORE_TYPE = "REVIEW_READINESS_NOT_ACTIVATION" as const;
const DISCLAIMER = "Review readiness only - not activation, not live, not order placement." as const;
const WEIGHTS = { grid: 35, shadow: 35, trend: 20, noTradeExplanation: 10 } as const;

function objectOrEmpty(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function upper(value: unknown): string | null {
  return stringOrNull(value)?.toUpperCase() ?? null;
}

function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function weighted(score: number, weight: number): number {
  return Math.round(score * weight) / 100;
}

function dimension(status: string, score: number, weight: number, drivers: string[]): ReviewDimension {
  const safeScore = clampScore(score);
  return {
    status,
    score: safeScore,
    weight,
    weightedScore: weighted(safeScore, weight),
    drivers,
  };
}

function hasAnyInput(input: ReviewReadinessInput): boolean {
  return Object.values(input).some((value) => {
    if (value == null) return false;
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === "object") return Object.keys(value).length > 0;
    return true;
  });
}

function firstNumber(...values: unknown[]): number | null {
  for (const value of values) {
    const num = numberOrNull(value);
    if (num != null) return num;
  }
  return null;
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    const text = stringOrNull(value);
    if (text) return text;
  }
  return null;
}

function buildGridDimension(input: ReviewReadinessInput, paperLoopDiagnostics: Record<string, unknown>): ReviewDimension {
  const edgeDiagnostics = objectOrEmpty(input.edgeDiagnostics);
  const costGate = objectOrEmpty(input.costGate);
  const paperDataQuality = objectOrEmpty(input.paperDataQuality);
  const closedCycles = firstNumber(edgeDiagnostics.closedCycles, input.closedCycles, paperLoopDiagnostics.closedCycles) ?? 0;
  const sellFillCount = firstNumber(input.sellFillCount, paperLoopDiagnostics.sampleSellFillCount, paperLoopDiagnostics.rawSellFillCount) ?? 0;
  const expectancy = firstNumber(edgeDiagnostics.expectancy, input.expectancy);
  const qualityStatus = upper(paperDataQuality.qualityStatus);
  const costGateStatus = upper(costGate.status);
  const drivers = [
    `closedCycles=${closedCycles}`,
    `sellFillCount=${sellFillCount}`,
    `expectancy=${expectancy == null ? "null" : expectancy}`,
  ];

  if (closedCycles === 0 || sellFillCount === 0 || expectancy == null) {
    return dimension("NO_REALIZED_EDGE_SAMPLE", 0, WEIGHTS.grid, drivers);
  }

  let score = 35;
  score += Math.min(35, closedCycles * 2);
  if (expectancy > 0) score += 15;
  if (qualityStatus && qualityStatus !== "INSUFFICIENT") score += 8;
  if (costGateStatus && costGateStatus !== "UNKNOWN") score += 7;
  const status = score >= 70 ? "REVIEWABLE" : "PARTIAL";
  return dimension(status, score, WEIGHTS.grid, drivers);
}

function buildShadowDimension(input: ReviewReadinessInput, paperLoopDiagnostics: Record<string, unknown>): ReviewDimension {
  const decisionSummary = objectOrEmpty(input.trendEvidenceDecisionSummary ?? paperLoopDiagnostics.trendEvidenceDecisionSummary);
  const gate = objectOrEmpty(input.shadowOutcomeQualityGate ?? decisionSummary.shadowOutcomeQualityGate);
  const coverage = objectOrEmpty(input.shadowEvidenceCoverage ?? decisionSummary.shadowEvidenceCoverage);
  const gateStatus = upper(gate.status);
  const coverageStatus = upper(coverage.status);
  const sampleQuality = upper(gate.sampleQuality);
  const coverageScore = numberOrNull(coverage.coverageScore);
  const qualityFactor = sampleQuality === "HIGH" ? 1 : sampleQuality === "MEDIUM" ? 0.7 : sampleQuality === "LOW" ? 0.4 : 0;
  const score = coverageScore == null ? 0 : coverageScore * 100 * qualityFactor;
  const drivers = [
    `gate=${gateStatus ?? "NO_DATA"}`,
    `sampleQuality=${sampleQuality ?? "NO_DATA"}`,
    `coverage=${coverageScore == null ? "null" : coverageScore}`,
  ];

  if (!gateStatus || gateStatus === "NO_DATA" || coverageScore == null) return dimension("NO_DATA", 0, WEIGHTS.shadow, drivers);
  if (sampleQuality === "LOW" || coverageStatus === "NOT_READY") return dimension("LOW_QUALITY_NOT_READY", score, WEIGHTS.shadow, drivers);
  if (coverageStatus === "READY" && gateStatus === "REVIEW_READY") return dimension("REVIEWABLE", score, WEIGHTS.shadow, drivers);
  return dimension("PARTIAL", score, WEIGHTS.shadow, drivers);
}

function buildTrendDimension(input: ReviewReadinessInput, paperLoopDiagnostics: Record<string, unknown>): ReviewDimension {
  const trendStrategy = objectOrEmpty(input.trendStrategy ?? paperLoopDiagnostics.trendStrategy);
  const trendEdgeReview = objectOrEmpty(input.trendEdgeReview ?? paperLoopDiagnostics.trendEdgeReview);
  const evidenceRunner = objectOrEmpty(input.trendPaperEvidenceRunner ?? paperLoopDiagnostics.trendPaperEvidenceRunner);
  const trendStrategyStatus = upper(trendStrategy.status);
  const edgeStatus = upper(trendEdgeReview.status);
  const trendClosedTrades = firstNumber(trendEdgeReview.trendClosedTrades, evidenceRunner.trendClosedTrades) ?? 0;
  const expectancyR = firstNumber(trendEdgeReview.expectancyR, evidenceRunner.expectancyR);
  const drivers = [
    `trendStrategy=${trendStrategyStatus ?? "NO_DATA"}`,
    `trendEdgeReview=${edgeStatus ?? "NO_DATA"}`,
    `trendClosedTrades=${trendClosedTrades}`,
  ];

  if ((!trendStrategyStatus || trendStrategyStatus === "INVALIDATED") && (!edgeStatus || edgeStatus === "NO_DATA" || edgeStatus === "INSUFFICIENT_DATA") && trendClosedTrades === 0) {
    return dimension("NO_DATA_INVALIDATED", 0, WEIGHTS.trend, drivers);
  }
  if (!trendStrategyStatus && !edgeStatus && trendClosedTrades === 0) return dimension("NO_DATA", 0, WEIGHTS.trend, drivers);

  let score = Math.min(60, trendClosedTrades * 2);
  if (expectancyR != null && expectancyR > 0) score += 20;
  if (trendStrategyStatus && trendStrategyStatus !== "INVALIDATED") score += 10;
  if (edgeStatus && edgeStatus !== "NO_DATA" && edgeStatus !== "INSUFFICIENT_DATA") score += 10;
  const status = score >= 70 ? "REVIEWABLE" : "PARTIAL";
  return dimension(status, score, WEIGHTS.trend, drivers);
}

function buildNoTradeDimension(input: ReviewReadinessInput, paperLoopDiagnostics: Record<string, unknown>): ReviewDimension {
  const noTrade = objectOrEmpty(input.noTradeReasonAnalysis ?? paperLoopDiagnostics.noTradeReasonAnalysis);
  const status = upper(noTrade.status);
  const diagnosticsGap = noTrade.diagnosticsGap === true;
  const explained = status === "BOTH_PATHS_BLOCKED" || status === "GRID_BLOCKED_ONLY" || status === "TREND_BLOCKED_ONLY" || status === "NO_STRATEGY_BLOCKER";
  const drivers = [
    `noTradeStatus=${status ?? "NO_DATA"}`,
    `diagnosticsGap=${diagnosticsGap}`,
  ];

  if (!status || status === "NO_DIAGNOSTICS" || !explained) return dimension("NOT_EXPLAINED", 0, WEIGHTS.noTradeExplanation, drivers);
  if (diagnosticsGap) return dimension("EXPLAINED_WITH_DIAGNOSTICS_GAP", 70, WEIGHTS.noTradeExplanation, drivers);
  return dimension("EXPLAINED", 100, WEIGHTS.noTradeExplanation, drivers);
}

function tagForStatus(status: ReviewOverallStatus): string {
  return `D5_5_REVIEW_READINESS_${status}`;
}

export function emptyReviewReadinessScore(): ReviewReadinessScore {
  const dimensions = {
    grid: dimension("NO_DATA", 0, WEIGHTS.grid, ["No grid review diagnostics available."]),
    shadow: dimension("NO_DATA", 0, WEIGHTS.shadow, ["No shadow review diagnostics available."]),
    trend: dimension("NO_DATA", 0, WEIGHTS.trend, ["No trend review diagnostics available."]),
    noTradeExplanation: dimension("NOT_EXPLAINED", 0, WEIGHTS.noTradeExplanation, ["No no-trade explanation available."]),
  };
  return {
    schemaVersion: 1,
    source: SOURCE,
    scoreType: SCORE_TYPE,
    tag: tagForStatus("NO_DATA"),
    overallStatus: "NO_DATA",
    overallScore: 0,
    activationAllowed: false,
    reviewOnly: true,
    weights: WEIGHTS,
    dimensions,
    blockers: ["No review diagnostics available."],
    disclaimer: DISCLAIMER,
    notes: ["Review readiness only; this is not activation readiness or live readiness."],
  };
}

export function evaluateReviewReadinessScore(input: ReviewReadinessInput | null | undefined): ReviewReadinessScore {
  const sourceInput = input ?? {};
  if (!hasAnyInput(sourceInput)) return emptyReviewReadinessScore();

  const paperLoopDiagnostics = objectOrEmpty(sourceInput.paperLoopDiagnostics);
  const dimensions = {
    grid: buildGridDimension(sourceInput, paperLoopDiagnostics),
    shadow: buildShadowDimension(sourceInput, paperLoopDiagnostics),
    trend: buildTrendDimension(sourceInput, paperLoopDiagnostics),
    noTradeExplanation: buildNoTradeDimension(sourceInput, paperLoopDiagnostics),
  };
  const dimensionValues = Object.values(dimensions);
  const allNoData = dimensionValues.every((item) => item.status === "NO_DATA" || item.status === "NOT_EXPLAINED");
  const overallScore = clampScore(dimensionValues.reduce((sum, item) => sum + item.weightedScore, 0));
  const overallStatus: ReviewOverallStatus = allNoData
    ? "NO_DATA"
    : overallScore >= 70 && dimensions.grid.score > 0 && dimensions.shadow.score > 0
      ? "READY_FOR_REVIEW"
      : overallScore >= 40
        ? "PARTIAL_REVIEW"
        : "NOT_READY";
  const blockers: string[] = [];
  if (dimensions.grid.score === 0) blockers.push("no realized grid edge sample");
  if (dimensions.shadow.score === 0 || dimensions.shadow.status === "LOW_QUALITY_NOT_READY") blockers.push("shadow evidence not review quality");
  if (dimensions.trend.score === 0) blockers.push("trend evidence not review quality");
  if (dimensions.noTradeExplanation.score === 0) blockers.push("no-trade explanation missing");

  return {
    schemaVersion: 1,
    source: SOURCE,
    scoreType: SCORE_TYPE,
    tag: tagForStatus(overallStatus),
    overallStatus,
    overallScore,
    activationAllowed: false,
    reviewOnly: true,
    weights: WEIGHTS,
    dimensions,
    blockers,
    disclaimer: DISCLAIMER,
    notes: [
      "Review readiness only; this is not activation readiness or live readiness.",
      "Score must not feed any gate, runner, activation path, or order-placement path.",
    ],
  };
}
