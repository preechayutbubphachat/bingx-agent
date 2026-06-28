export type OldEpochStatus =
  | "NONE"
  | "QUARANTINED"
  | "OBSOLETE_MARKET_CHANGED"
  | "CLOSED_WITH_EVIDENCE"
  | "DATA_QUALITY_BLOCKED";

export type OldEpochPolicy =
  | "DO_NOT_FORCE_SELL"
  | "DO_NOT_COUNT_AS_EDGE"
  | "DO_NOT_USE_FOR_NEW_GRID_RANGE"
  | "KEEP_FOR_AUDIT_ONLY";

export type CurrentGridEligibility =
  | "NOT_EVALUATED"
  | "GRID_REGIME_ELIGIBLE"
  | "TREND_REGIME_BLOCKED"
  | "VOLATILITY_BLOCKED"
  | "COST_GATE_BLOCKED"
  | "DATA_QUALITY_BLOCKED";

export type GridEpochCurrentRegime =
  | "RANGE"
  | "UPTREND"
  | "DOWNTREND"
  | "HIGH_VOL"
  | "LOW_VOL"
  | "UNKNOWN";

export type ProposedNextResearch =
  | "EVALUATE_FRESH_GRID_CANDIDATE"
  | "WAIT_FOR_RANGE_REGIME"
  | "USE_TREND_REVIEW_PATH"
  | "REPAIR_GRID_DATA_QUALITY"
  | "NO_ACTION";

export type FreshGridCandidateReviewStatus =
  | "NO_CANDIDATE"
  | "CANDIDATE_REVIEW_READY"
  | "REGIME_BLOCKED"
  | "VOLATILITY_BLOCKED"
  | "COST_GATE_BLOCKED"
  | "DATA_QUALITY_BLOCKED";

export interface GridEpochContextInput {
  oldEpoch?: {
    buyFillCount?: number | null;
    sellFillCount?: number | null;
    closedCycles?: number | null;
    oldGridLower?: number | null;
    oldGridUpper?: number | null;
    marketChanged?: boolean | null;
    dataQualityBlocked?: boolean | null;
  } | null;
  current?: {
    currentPrice?: number | null;
    regime?: string | null;
    atrPct?: number | null;
    bbwPct?: number | null;
    adx?: number | null;
    sourceFresh?: boolean | null;
  } | null;
  costGate?: {
    roundTripCostPct?: number | null;
    candidateGridSpacingPct?: number | null;
    requiredMinSpacingPct?: number | null;
  } | null;
  candidate?: {
    gridCount?: number | null;
  } | null;
}

export interface FreshGridCandidateReview {
  status: FreshGridCandidateReviewStatus;
  candidateGridLower: number | null;
  candidateGridUpper: number | null;
  candidateGridMid: number | null;
  candidateGridWidthPct: number | null;
  candidateSpacingPct: number | null;
  gridCount: number | null;
  costGatePass: boolean | null;
  blockers: string[];
}

export interface GridEpochContext {
  schemaVersion: 1;
  source: "GRID_EPOCH_CONTEXT_V1";
  readiness: "REVIEW_NOT_ACTIVATION";
  oldEpochStatus: OldEpochStatus;
  oldEpochPolicy: [
    "DO_NOT_FORCE_SELL",
    "DO_NOT_COUNT_AS_EDGE",
    "DO_NOT_USE_FOR_NEW_GRID_RANGE",
    "KEEP_FOR_AUDIT_ONLY",
  ];
  currentGridEligibility: CurrentGridEligibility;
  currentRegime: GridEpochCurrentRegime;
  proposedNextResearch: ProposedNextResearch;
  freshGridCandidateReview: FreshGridCandidateReview;
  blockers: string[];
  nextAction: string;
  activationAllowed: false;
  paperActivationAllowed: false;
  liveActivationAllowed: false;
  reviewOnly: true;
  shadowOnly: true;
}

const OLD_EPOCH_POLICY: GridEpochContext["oldEpochPolicy"] = [
  "DO_NOT_FORCE_SELL",
  "DO_NOT_COUNT_AS_EDGE",
  "DO_NOT_USE_FOR_NEW_GRID_RANGE",
  "KEEP_FOR_AUDIT_ONLY",
];

function finite(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function positive(value: number | null | undefined): value is number {
  return finite(value) && value > 0;
}

function normalizeRegime(value: string | null | undefined): GridEpochCurrentRegime {
  const normalized = String(value ?? "").trim().toUpperCase();
  if (normalized === "RANGE" || normalized === "NEUTRAL" || normalized === "GRID_NEUTRAL" || normalized === "SIDEWAYS") {
    return "RANGE";
  }
  if (normalized === "VOLATILITY_COMPRESSION" || normalized === "LOW_VOL") return "LOW_VOL";
  if (normalized === "UPTREND" || normalized === "TREND_UP") return "UPTREND";
  if (normalized === "DOWNTREND" || normalized === "TREND_DOWN") return "DOWNTREND";
  if (normalized === "HIGH_VOL" || normalized === "VOLATILITY_EXPANSION") return "HIGH_VOL";
  return "UNKNOWN";
}

function oldEpochStatus(input: GridEpochContextInput): OldEpochStatus {
  const oldEpoch = input.oldEpoch;
  if (!oldEpoch) return "NONE";
  if (oldEpoch.dataQualityBlocked === true) return "DATA_QUALITY_BLOCKED";

  const buyFillCount = Math.max(0, Math.trunc(oldEpoch.buyFillCount ?? 0));
  const sellFillCount = Math.max(0, Math.trunc(oldEpoch.sellFillCount ?? 0));
  const closedCycles = Math.max(0, Math.trunc(oldEpoch.closedCycles ?? 0));
  const hasOldBounds = finite(oldEpoch.oldGridLower) || finite(oldEpoch.oldGridUpper);
  const hasOneSidedBuy = buyFillCount > sellFillCount;

  if (closedCycles > 0 && sellFillCount > 0) return "CLOSED_WITH_EVIDENCE";
  if (oldEpoch.marketChanged === true && (hasOneSidedBuy || hasOldBounds)) return "OBSOLETE_MARKET_CHANGED";
  if (hasOneSidedBuy || hasOldBounds) return "QUARANTINED";
  return "NONE";
}

function candidateWidthPct(atrPct: number | null | undefined, bbwPct: number | null | undefined, spacingPct: number, gridCount: number): number {
  const fromVolatility = Math.max(
    positive(atrPct) ? atrPct * 2 : 0,
    positive(bbwPct) ? bbwPct : 0,
  );
  const fromSpacing = spacingPct * Math.max(1, gridCount);
  return Number(Math.max(fromVolatility, fromSpacing).toFixed(6));
}

function round(value: number): number {
  return Number(value.toFixed(8));
}

function blockedCandidate(status: FreshGridCandidateReviewStatus, costGatePass: boolean | null, blockers: string[]): FreshGridCandidateReview {
  return {
    status,
    candidateGridLower: null,
    candidateGridUpper: null,
    candidateGridMid: null,
    candidateGridWidthPct: null,
    candidateSpacingPct: null,
    gridCount: null,
    costGatePass,
    blockers,
  };
}

export function buildGridEpochContext(input: GridEpochContextInput): GridEpochContext {
  const blockers: string[] = [];
  const current = input.current ?? {};
  const costGate = input.costGate ?? {};
  const regime = normalizeRegime(current.regime);
  const oldStatus = oldEpochStatus(input);

  const currentPrice = current.currentPrice;
  const sourceFresh = current.sourceFresh === true;
  const spacingPct = costGate.candidateGridSpacingPct;
  const roundTripCostPct = costGate.roundTripCostPct;
  const requiredMinSpacingPct = finite(costGate.requiredMinSpacingPct)
    ? costGate.requiredMinSpacingPct
    : finite(roundTripCostPct) ? roundTripCostPct * 2.5 : null;
  const gridCount = Math.max(1, Math.trunc(input.candidate?.gridCount ?? 10));

  let currentGridEligibility: CurrentGridEligibility = "NOT_EVALUATED";
  let proposedNextResearch: ProposedNextResearch = "NO_ACTION";
  let freshGridCandidateReview: FreshGridCandidateReview = blockedCandidate("NO_CANDIDATE", null, []);

  const costGatePass = finite(spacingPct) && finite(requiredMinSpacingPct)
    ? spacingPct >= requiredMinSpacingPct
    : null;

  if (!positive(currentPrice)) blockers.push("missing_current_price");
  if (!sourceFresh) blockers.push("stale_or_missing_source_freshness");
  if (!finite(spacingPct)) blockers.push("missing_candidate_grid_spacing_pct");
  if (!finite(requiredMinSpacingPct)) blockers.push("missing_required_min_spacing_pct");
  if (!finite(current.atrPct)) blockers.push("missing_atr_pct");
  if (!finite(current.bbwPct)) blockers.push("missing_bbw_pct");

  const dataQualityBlocked = blockers.length > 0;

  if (dataQualityBlocked) {
    currentGridEligibility = "DATA_QUALITY_BLOCKED";
    proposedNextResearch = "REPAIR_GRID_DATA_QUALITY";
    freshGridCandidateReview = blockedCandidate("DATA_QUALITY_BLOCKED", costGatePass, [...blockers]);
  } else if (regime === "UPTREND" || regime === "DOWNTREND") {
    currentGridEligibility = "TREND_REGIME_BLOCKED";
    proposedNextResearch = "USE_TREND_REVIEW_PATH";
    freshGridCandidateReview = blockedCandidate("REGIME_BLOCKED", costGatePass, ["trend_regime_routes_to_d8_review"]);
  } else if (regime === "HIGH_VOL" || (finite(current.atrPct) && current.atrPct >= 5) || (finite(current.bbwPct) && current.bbwPct >= 10)) {
    currentGridEligibility = "VOLATILITY_BLOCKED";
    proposedNextResearch = "WAIT_FOR_RANGE_REGIME";
    freshGridCandidateReview = blockedCandidate("VOLATILITY_BLOCKED", costGatePass, ["volatility_unsuitable_for_grid_review"]);
  } else if (costGatePass === false) {
    currentGridEligibility = "COST_GATE_BLOCKED";
    proposedNextResearch = "REPAIR_GRID_DATA_QUALITY";
    freshGridCandidateReview = blockedCandidate("COST_GATE_BLOCKED", false, ["candidate_spacing_below_required_cost_threshold"]);
  } else if (regime === "RANGE" || regime === "LOW_VOL") {
    currentGridEligibility = "GRID_REGIME_ELIGIBLE";
    proposedNextResearch = "EVALUATE_FRESH_GRID_CANDIDATE";

    const widthPct = candidateWidthPct(current.atrPct, current.bbwPct, spacingPct as number, gridCount);
    const halfWidth = (currentPrice as number) * (widthPct / 100) / 2;
    freshGridCandidateReview = {
      status: "CANDIDATE_REVIEW_READY",
      candidateGridLower: round((currentPrice as number) - halfWidth),
      candidateGridUpper: round((currentPrice as number) + halfWidth),
      candidateGridMid: round(currentPrice as number),
      candidateGridWidthPct: widthPct,
      candidateSpacingPct: round(spacingPct as number),
      gridCount,
      costGatePass: true,
      blockers: [],
    };
  } else {
    currentGridEligibility = "NOT_EVALUATED";
    proposedNextResearch = "WAIT_FOR_RANGE_REGIME";
    freshGridCandidateReview = blockedCandidate("NO_CANDIDATE", costGatePass, ["unknown_or_non_grid_regime"]);
  }

  return {
    schemaVersion: 1,
    source: "GRID_EPOCH_CONTEXT_V1",
    readiness: "REVIEW_NOT_ACTIVATION",
    oldEpochStatus: oldStatus,
    oldEpochPolicy: [...OLD_EPOCH_POLICY] as GridEpochContext["oldEpochPolicy"],
    currentGridEligibility,
    currentRegime: regime,
    proposedNextResearch,
    freshGridCandidateReview,
    blockers,
    nextAction: nextActionFor(currentGridEligibility, proposedNextResearch),
    activationAllowed: false,
    paperActivationAllowed: false,
    liveActivationAllowed: false,
    reviewOnly: true,
    shadowOnly: true,
  };
}

function nextActionFor(eligibility: CurrentGridEligibility, proposed: ProposedNextResearch): string {
  if (eligibility === "GRID_REGIME_ELIGIBLE" && proposed === "EVALUATE_FRESH_GRID_CANDIDATE") {
    return "review_fresh_grid_candidate_only";
  }
  if (eligibility === "TREND_REGIME_BLOCKED") return "use_d8_trend_review_path";
  if (eligibility === "VOLATILITY_BLOCKED") return "wait_for_range_or_lower_volatility";
  if (eligibility === "COST_GATE_BLOCKED") return "repair_or_recalculate_grid_cost_inputs";
  if (eligibility === "DATA_QUALITY_BLOCKED") return "repair_grid_data_quality";
  return "no_action";
}
