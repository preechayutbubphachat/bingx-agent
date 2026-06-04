export type RegridReadinessStatus = "NOT_READY" | "WATCH" | "READY_FOR_OPERATOR_REVIEW";

export type OldExposurePolicy =
  | "QUARANTINE_OLD_ONE_SIDED_EXPOSURE"
  | "DO_NOT_COUNT_AS_CLOSED_CYCLE"
  | "DO_NOT_FORCE_SELL"
  | "DO_NOT_USE_FOR_EXPECTANCY";

export interface RegridReadinessInput {
  currentPrice: number | null;
  gridLower: number | null;
  gridUpper: number | null;
  gridMid: number | null;
  priceVsGrid: "BELOW_GRID" | "INSIDE_GRID" | "ABOVE_GRID" | "UNKNOWN";
  candidateStatus: string | null;
  candidateGridLower: number | null;
  candidateGridUpper: number | null;
  candidateGridMid: number | null;
  candidateSpacingPct: number | null;
  stableCandleCount: number | null;
  cooldownRemaining: number | null;
  buyFillCount: number;
  sellFillCount: number;
  closedCycles: number;
  costGate?: {
    pass?: boolean | null;
    requiredMinSpacingPct?: number | null;
  } | null;
  regime?: string | null;
  marketMode?: string | null;
  volatilityProxyPct?: number | null;
  staleData?: boolean | null;
  runtimeAuditCritical?: boolean | null;
  requiredStableCandles?: number;
}

export interface RegridReadiness {
  status: RegridReadinessStatus;
  score: number;
  passedGates: string[];
  failedGates: string[];
  warnings: string[];
  nextAction: string;
  operatorReviewRequired: boolean;
  paperActivationAllowed: false;
  liveActivationAllowed: false;
}

export interface PaperEpochDiagnostics {
  currentEpochId: string;
  previousEpochStatus: "OPEN_ONE_SIDED_EXPOSURE" | "NO_PRIOR_EXPOSURE";
  previousEpochReason: string;
  nextEpochCandidateId: string | null;
  nextEpochStatus: "PREPARED_FOR_OPERATOR_REVIEW" | "WATCH" | "NOT_READY";
  oldExposurePolicy: OldExposurePolicy[];
}

const DEFAULT_REQUIRED_STABLE_CANDLES = 4;
const DEFAULT_MAX_VOLATILITY_PROXY_PCT = 8;

function finite(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function scoreFrom(passed: number, failed: number, warnings: number): number {
  const raw = passed * 14 - failed * 18 - warnings * 5;
  return Math.max(0, Math.min(100, raw));
}

export function evaluateRegridReadiness(input: RegridReadinessInput): RegridReadiness {
  const passedGates: string[] = [];
  const failedGates: string[] = [];
  const warnings: string[] = [];
  const requiredStableCandles = input.requiredStableCandles ?? DEFAULT_REQUIRED_STABLE_CANDLES;

  const candidateGridExists =
    finite(input.candidateGridLower) &&
    finite(input.candidateGridUpper) &&
    finite(input.candidateGridMid) &&
    input.candidateGridUpper > input.candidateGridLower;
  if (candidateGridExists) passedGates.push("candidate_grid_exists");
  else failedGates.push("candidate_grid_missing");

  if ((input.stableCandleCount ?? 0) >= requiredStableCandles) passedGates.push("stable_candles_ready");
  else failedGates.push("stable_candles_pending");

  if ((input.cooldownRemaining ?? requiredStableCandles) === 0) passedGates.push("cooldown_complete");
  else failedGates.push("cooldown_pending");

  const requiredSpacing = input.costGate?.requiredMinSpacingPct ?? null;
  const spacingPass =
    input.costGate?.pass === false
      ? false
      : input.costGate?.pass === true ||
        (finite(input.candidateSpacingPct) && finite(requiredSpacing) && input.candidateSpacingPct >= requiredSpacing);
  if (spacingPass) passedGates.push("candidate_spacing_cost_gate_pass");
  else failedGates.push("candidate_spacing_cost_gate_failed");

  if (input.staleData === true) failedGates.push("stale_data");
  else passedGates.push("stale_data_check_pass");

  if (input.runtimeAuditCritical === true) failedGates.push("runtime_audit_critical");
  else passedGates.push("runtime_audit_check_pass");

  if (finite(input.volatilityProxyPct) && input.volatilityProxyPct > DEFAULT_MAX_VOLATILITY_PROXY_PCT) {
    failedGates.push("violent_trend_risk");
  } else {
    passedGates.push("violent_trend_check_pass");
  }

  if (input.priceVsGrid === "BELOW_GRID" || input.priceVsGrid === "ABOVE_GRID") {
    passedGates.push("out_of_grid_context");
  } else {
    warnings.push("not_out_of_grid_context");
  }

  if (input.buyFillCount > 0 && input.sellFillCount === 0) {
    passedGates.push("old_one_sided_exposure_quarantined");
    warnings.push("old_buy_exposure_quarantined_not_counted_as_closed_cycle");
  }

  if (input.closedCycles === 0) {
    warnings.push("closed_cycles_remain_zero_do_not_fake_edge");
  }

  const hasHardBlock =
    failedGates.includes("candidate_grid_missing") ||
    failedGates.includes("stable_candles_pending") ||
    failedGates.includes("cooldown_pending") ||
    failedGates.includes("stale_data") ||
    failedGates.includes("runtime_audit_critical");

  const hasReviewBlock =
    failedGates.includes("candidate_spacing_cost_gate_failed") ||
    failedGates.includes("violent_trend_risk");

  const status: RegridReadinessStatus =
    hasHardBlock ? "NOT_READY" : hasReviewBlock ? "WATCH" : "READY_FOR_OPERATOR_REVIEW";

  const nextAction =
    status === "READY_FOR_OPERATOR_REVIEW"
      ? "operator_review_required_before_any_phase_2b_activation"
      : status === "WATCH"
        ? "continue_observing_candidate_until_warnings_clear"
        : "wait_for_stability_cooldown_and_candidate_grid";

  return {
    status,
    score: scoreFrom(passedGates.length, failedGates.length, warnings.length),
    passedGates,
    failedGates,
    warnings,
    nextAction,
    operatorReviewRequired: status === "READY_FOR_OPERATOR_REVIEW",
    paperActivationAllowed: false,
    liveActivationAllowed: false,
  };
}

export function buildPaperEpochDiagnostics(input: {
  priceVsGrid: RegridReadinessInput["priceVsGrid"];
  buyFillCount: number;
  sellFillCount: number;
  candidateGridMid: number | null;
  readinessStatus: RegridReadinessStatus;
}): PaperEpochDiagnostics {
  const oneSidedBuyExposure = input.buyFillCount > 0 && input.sellFillCount === 0;
  const currentEpochId = `static-grid:${input.priceVsGrid}`;
  const nextEpochCandidateId = finite(input.candidateGridMid)
    ? `dynamic-grid-candidate:${Math.round(input.candidateGridMid * 100) / 100}`
    : null;

  return {
    currentEpochId,
    previousEpochStatus: oneSidedBuyExposure ? "OPEN_ONE_SIDED_EXPOSURE" : "NO_PRIOR_EXPOSURE",
    previousEpochReason: oneSidedBuyExposure
      ? "old static-grid BUY exposure is quarantined and cannot become a closed cycle without real SELL evidence"
      : "no one-sided prior exposure detected in the current paper sample",
    nextEpochCandidateId,
    nextEpochStatus:
      input.readinessStatus === "READY_FOR_OPERATOR_REVIEW"
        ? "PREPARED_FOR_OPERATOR_REVIEW"
        : input.readinessStatus === "WATCH" ? "WATCH" : "NOT_READY",
    oldExposurePolicy: [
      "QUARANTINE_OLD_ONE_SIDED_EXPOSURE",
      "DO_NOT_COUNT_AS_CLOSED_CYCLE",
      "DO_NOT_FORCE_SELL",
      "DO_NOT_USE_FOR_EXPECTANCY",
    ],
  };
}
