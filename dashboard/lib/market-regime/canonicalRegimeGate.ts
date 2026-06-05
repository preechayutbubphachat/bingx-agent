import type { CanonicalMarketRegime } from "./canonicalMarketRegime.ts";
import type { RegridReadiness } from "../grid/regridReadiness.ts";

export type CanonicalRegimeGateStatus =
  | "PASSIVE_SHADOW"
  | "BLOCK_NEUTRAL_GRID"
  | "TREND_CHECK_REQUIRED"
  | "NO_TRADE_REQUIRED"
  | "UNKNOWN_DATA_BLOCK"
  | "VOLATILITY_BLOCK";

export type RegridReadinessSnapshot = RegridReadiness;

export interface CanonicalRegimeGateInput {
  canonicalMarketRegime: CanonicalMarketRegime | null | undefined;
  currentRegridReadiness: RegridReadinessSnapshot | null | undefined;
  legacyPlanMode?: string | null;
}

export interface CanonicalRegimeGate {
  status: CanonicalRegimeGateStatus;
  blocking: boolean;
  downgradeOnly: true;
  reasons: string[];
  warnings: string[];
  affectedModes: string[];
  paperActivationAllowed: false;
  liveActivationAllowed: false;
}

export interface CanonicalRegimeGateShadowCompare {
  before: RegridReadinessSnapshot | null;
  after: RegridReadinessSnapshot | null;
  changed: boolean;
  downgradeReason: string | null;
}

const NEUTRAL_GRID_MODES = ["NEUTRAL_GRID", "DYNAMIC_NEUTRAL_GRID", "PHASE_2B_ACTIVATION"];

function lockedGate(
  status: CanonicalRegimeGateStatus,
  blocking: boolean,
  reasons: string[],
  warnings: string[],
  affectedModes: string[],
): CanonicalRegimeGate {
  return {
    status,
    blocking,
    downgradeOnly: true,
    reasons,
    warnings,
    affectedModes,
    paperActivationAllowed: false,
    liveActivationAllowed: false,
  };
}

export function buildCanonicalRegimeGate(input: CanonicalRegimeGateInput): CanonicalRegimeGate {
  const warnings = input.legacyPlanMode ? ["legacy_plan_mode_ignored_by_canonical_regime_gate"] : [];
  if (!input.currentRegridReadiness) warnings.push("missing_regrid_readiness_for_shadow_compare");
  const regime = input.canonicalMarketRegime?.regime ?? null;

  if (!input.canonicalMarketRegime || regime === "UNKNOWN") {
    return lockedGate(
      "UNKNOWN_DATA_BLOCK",
      true,
      ["missing_canonical_market_regime"],
      warnings,
      NEUTRAL_GRID_MODES,
    );
  }

  if (regime === "DOWNTREND" || regime === "UPTREND") {
    return lockedGate(
      "TREND_CHECK_REQUIRED",
      true,
      [`canonical_regime_${regime.toLowerCase()}_requires_trend_check`],
      warnings,
      NEUTRAL_GRID_MODES,
    );
  }

  if (regime === "RANGE") {
    return lockedGate(
      "PASSIVE_SHADOW",
      false,
      ["canonical_regime_range_no_shadow_downgrade"],
      warnings,
      [],
    );
  }

  if (regime === "VOLATILITY_EXPANSION") {
    return lockedGate(
      "VOLATILITY_BLOCK",
      true,
      ["canonical_regime_volatility_expansion_blocks_grid"],
      warnings,
      ["ALL_GRID_MODES", "PHASE_2B_ACTIVATION"],
    );
  }

  if (regime === "EVENT_RISK" || regime === "NO_TRADE") {
    return lockedGate(
      "NO_TRADE_REQUIRED",
      true,
      [`canonical_regime_${regime.toLowerCase()}_requires_no_trade`],
      warnings,
      NEUTRAL_GRID_MODES,
    );
  }

  return lockedGate(
    "BLOCK_NEUTRAL_GRID",
    true,
    [`canonical_regime_${String(regime).toLowerCase()}_blocks_neutral_grid`],
    warnings,
    NEUTRAL_GRID_MODES,
  );
}

function cloneReadiness(readiness: RegridReadinessSnapshot): RegridReadinessSnapshot {
  return {
    ...readiness,
    passedGates: [...readiness.passedGates],
    failedGates: [...readiness.failedGates],
    warnings: [...readiness.warnings],
  };
}

function downgraded(readiness: RegridReadinessSnapshot, status: RegridReadinessSnapshot["status"], reason: string): RegridReadinessSnapshot {
  return {
    ...cloneReadiness(readiness),
    status,
    operatorReviewRequired: false,
    paperActivationAllowed: false,
    liveActivationAllowed: false,
    warnings: [...readiness.warnings, reason],
  };
}

export function applyCanonicalRegimeGateShadow(
  readiness: RegridReadinessSnapshot | null | undefined,
  gate: CanonicalRegimeGate,
): CanonicalRegimeGateShadowCompare {
  if (!readiness) {
    return {
      before: null,
      after: null,
      changed: false,
      downgradeReason: "missing_regrid_readiness",
    };
  }

  const before = cloneReadiness(readiness);
  let after = cloneReadiness(readiness);
  let downgradeReason: string | null = null;

  if (before.status === "NOT_READY") {
    return { before, after, changed: false, downgradeReason: null };
  }

  if (!gate.blocking || gate.status === "PASSIVE_SHADOW") {
    return { before, after, changed: false, downgradeReason: null };
  }

  if (gate.status === "TREND_CHECK_REQUIRED") {
    const nextStatus = before.status === "READY_FOR_OPERATOR_REVIEW" ? "WATCH" : "NOT_READY";
    downgradeReason = "canonical_regime_gate_trend_check_required";
    after = downgraded(before, nextStatus, downgradeReason);
  } else if (
    gate.status === "UNKNOWN_DATA_BLOCK" ||
    gate.status === "VOLATILITY_BLOCK" ||
    gate.status === "NO_TRADE_REQUIRED"
  ) {
    downgradeReason = `canonical_regime_gate_${gate.status.toLowerCase()}`;
    after = downgraded(before, "NOT_READY", downgradeReason);
  } else {
    downgradeReason = "canonical_regime_gate_blocks_neutral_grid";
    after = downgraded(before, before.status === "READY_FOR_OPERATOR_REVIEW" ? "WATCH" : "NOT_READY", downgradeReason);
  }

  return {
    before,
    after,
    changed: after.status !== before.status,
    downgradeReason,
  };
}
