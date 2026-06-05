// dashboard/lib/grid/regridCandidate.ts
// Dynamic Regrid — Phase 1 READ-ONLY candidate evaluator.
//
// SAFETY: pure, read-only. Computes WHETHER a future dynamic-grid candidate is forming
// around the current price when the market is OUT of the old grid. It NEVER activates a
// grid, NEVER places orders, NEVER forces fills. `activationAllowed` is hard-wired false
// in Phase 1 — activation is a separate, gated phase pending operator approval & M-0B.

import { calculateDynamicGrid, DEFAULT_DYNAMIC_GRID_CONFIG, type DynamicGridConfig } from "./dynamicGrid.ts";

export type RegridCandidateStatus =
  | "INACTIVE"          // not in a regrid context (price in range)
  | "REGRID_REQUIRED"
  | "REGRID_CANDIDATE"
  | "DYNAMIC_GRID_ACTIVE" // geometry valid, but Phase 1 still blocks activation
  | "STALE_DATA"
  | "NO_TRADE";

export interface RegridCandidateInput {
  /** real priceVsGrid against the OLD grid */
  priceVsGrid: "BELOW_GRID" | "INSIDE_GRID" | "ABOVE_GRID" | "UNKNOWN";
  paperLoopState?: string;
  currentPrice: number | null;
  oldGridLower: number | null;
  oldGridUpper: number | null;
  marketMode: string | null;
  regime: string | null;
  recentCloses?: number[];
  roundTripCostPct?: number;
  costGatePass?: boolean;
  buyFillCount?: number;
  sellFillCount?: number;
  /** consecutive stable candles needed before activation would be allowed (future phase) */
  stableCandlesRequired?: number;
  /** max % deviation from current price for a candle to count as "stable" */
  stabilityMaxPct?: number;
}

export interface RegridCandidate {
  candidateStatus: RegridCandidateStatus;
  candidateReason: string;
  candidateGridLower: number | null;
  candidateGridUpper: number | null;
  candidateGridMid: number | null;
  candidateGridWidthPct: number | null;
  candidateSpacingPct: number | null;
  candidateGridCount: number;
  stableCandleCount: number;
  cooldownRemaining: number;
  /** Phase 1: ALWAYS false — read-only evaluator never activates a grid */
  activationAllowed: false;
}

const OUT_OF_RANGE_STATES = new Set(["REGRID_REQUIRED", "PAUSE_OUT_OF_RANGE", "BELOW_GRID", "ABOVE_GRID"]);

function countStableTrailingCandles(closes: number[] | undefined, price: number | null, maxPct: number): number {
  if (!closes || closes.length === 0 || price == null || price <= 0) return 0;
  let count = 0;
  for (let i = closes.length - 1; i >= 0; i--) {
    const devPct = Math.abs((closes[i] - price) / price) * 100;
    if (devPct <= maxPct) count++;
    else break;
  }
  return count;
}

/**
 * Read-only regrid candidate evaluation. Returns geometry for a NEW grid centered on the
 * current price (computed with the old-grid range gate disabled), plus cooldown/stability,
 * but with activationAllowed pinned to false.
 */
export function evaluateRegridCandidate(
  input: RegridCandidateInput,
  cfg: DynamicGridConfig = DEFAULT_DYNAMIC_GRID_CONFIG,
): RegridCandidate {
  const stableRequired = input.stableCandlesRequired ?? 4;
  const stabilityMaxPct = input.stabilityMaxPct ?? 0.8;

  const isOutOfRange =
    input.priceVsGrid === "BELOW_GRID" ||
    input.priceVsGrid === "ABOVE_GRID" ||
    OUT_OF_RANGE_STATES.has((input.paperLoopState ?? "").toUpperCase());

  const inactive: RegridCandidate = {
    candidateStatus: "INACTIVE",
    candidateReason: "price in range / not a regrid context",
    candidateGridLower: null, candidateGridUpper: null, candidateGridMid: null,
    candidateGridWidthPct: null, candidateSpacingPct: null, candidateGridCount: 10,
    stableCandleCount: 0, cooldownRemaining: stableRequired, activationAllowed: false,
  };
  if (!isOutOfRange || input.currentPrice == null) return inactive;

  // compute a candidate grid AROUND the current price (disable old-grid range gate by nulling it)
  const dg = calculateDynamicGrid(
    {
      currentPrice: input.currentPrice,
      oldGridLower: null,
      oldGridUpper: null,
      marketMode: input.marketMode,
      regime: input.regime,
      recentCloses: input.recentCloses,
      roundTripCostPct: input.roundTripCostPct,
      costGatePass: input.costGatePass,
      buyFillCount: input.buyFillCount,
      sellFillCount: input.sellFillCount,
    },
    cfg,
  );

  const stableCandleCount = countStableTrailingCandles(input.recentCloses, input.currentPrice, stabilityMaxPct);
  const cooldownRemaining = Math.max(0, stableRequired - stableCandleCount);

  const status: RegridCandidateStatus =
    dg.status === "STALE_DATA" ? "STALE_DATA"
    : dg.status === "DYNAMIC_GRID_ACTIVE" ? "DYNAMIC_GRID_ACTIVE"
    : dg.status === "REGRID_CANDIDATE" ? "REGRID_CANDIDATE"
    : dg.status === "NO_TRADE" || dg.status === "TREND_CHECK" || dg.status === "PAUSE_EXPOSURE_LIMIT" ? "NO_TRADE"
    : "REGRID_REQUIRED";

  const reasonSuffix = cooldownRemaining > 0 ? ` (cooldown ${cooldownRemaining} stable candle(s) remaining)` : "";

  return {
    candidateStatus: status,
    candidateReason: `${dg.reason}${reasonSuffix}; Phase 1 read-only (activation blocked)`,
    candidateGridLower: dg.dynamicGridLower,
    candidateGridUpper: dg.dynamicGridUpper,
    candidateGridMid: dg.dynamicGridMid,
    candidateGridWidthPct: dg.gridWidthPct,
    candidateSpacingPct: dg.spacingPct,
    candidateGridCount: dg.gridCount,
    stableCandleCount,
    cooldownRemaining,
    activationAllowed: false, // Phase 1 invariant
  };
}
