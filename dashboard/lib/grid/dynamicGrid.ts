// dashboard/lib/grid/dynamicGrid.ts
// Algorithm v2 — Dynamic Grid + Regime-Aware Guardrail (PAPER-ONLY, pure function).
//
// SAFETY: pure computation. No side effects, no I/O, no exchange API, no order placement,
// no env mutation. This module decides ONLY whether a paper grid is valid / where a candidate
// dynamic grid would sit. It never enables live trading and never forces fills.
//
// It is the algorithmic core for paper_cycle.sh / execution-runner to consult. Callers remain
// responsible for actually writing NO_TRADE audit events and for never bypassing M-0B gating.

export type PriceVsGrid = "BELOW_GRID" | "INSIDE_GRID" | "ABOVE_GRID" | "UNKNOWN";

export type DynamicGridState =
  | "INSIDE_GRID"
  | "BELOW_GRID"
  | "ABOVE_GRID"
  | "PAUSE_OUT_OF_RANGE"
  | "REGRID_REQUIRED"
  | "REGRID_CANDIDATE"
  | "DYNAMIC_GRID_ACTIVE"
  | "TREND_CHECK"
  | "NO_TRADE"
  | "PAUSE_EXPOSURE_LIMIT"
  | "STALE_DATA";

export type NoTradeReason =
  | "price_below_grid_lower"
  | "price_above_grid_upper"
  | "stale_decision_or_price_mismatch"
  | "one_sided_buy_limit"
  | "one_sided_sell_limit"
  | "regime_unclear"
  | "regrid_required"
  | "dynamic_grid_cooldown"
  | "volatility_extreme"
  | "cost_gate_failed"
  | "paper_edge_unproven"
  | null;

export interface DynamicGridInput {
  currentPrice: number;            // fresh snapshot price (source of truth for the gate)
  oldGridLower: number | null;
  oldGridUpper: number | null;
  marketMode: string | null;       // e.g. GRID_NEUTRAL
  regime: string | null;
  recentCloses?: number[];         // newest-last; from market_snapshot
  /** optional decision-side price to detect stale/mismatch (e.g. orderbook mid / decision price_action) */
  decisionPrice?: number | null;
  roundTripCostPct?: number;       // from cost gate; default conservative
  costGatePass?: boolean;          // cost gate status === PASS
  buyFillCount?: number;
  sellFillCount?: number;
  /** configured grid count; default 10 */
  gridCount?: number;
  /** stable-candle confirmation already satisfied by caller (optional) */
  stableCandlesConfirmed?: boolean;
}

export interface DynamicGridConfig {
  maxOneSidedBuyFillsWithoutSell: number;
  maxOneSidedSellFillsWithoutBuy: number;
  maxPriceDriftPct: number;        // stale gate threshold
  minGridWidthPct: number;
  maxGridWidthPct: number;
  atrWidthMultiplier: number;
  spacingCostMultiple: number;     // spacing must exceed roundTripCostPct * this
  volatilityExtremePct: number;    // realizedRangePct above this = extreme
  defaultRoundTripCostPct: number;
}

export const DEFAULT_DYNAMIC_GRID_CONFIG: DynamicGridConfig = {
  maxOneSidedBuyFillsWithoutSell: 5,
  maxOneSidedSellFillsWithoutBuy: 5,
  maxPriceDriftPct: 1.0,
  minGridWidthPct: 1.5,
  maxGridWidthPct: 12,
  atrWidthMultiplier: 6,
  spacingCostMultiple: 2.5,
  volatilityExtremePct: 18,
  defaultRoundTripCostPct: 0.09,
};

export interface DynamicGridResult {
  status: DynamicGridState;
  reason: string;
  priceVsGrid: PriceVsGrid;
  noTradeReason: NoTradeReason;
  /** true only when a paper grid action is permitted INSIDE a valid range */
  tradeAllowed: boolean;
  allowedSide: "BUY" | "SELL" | "NONE";
  // candidate dynamic grid (may be null when not computable / not allowed)
  dynamicGridLower: number | null;
  dynamicGridUpper: number | null;
  dynamicGridMid: number | null;
  gridWidthPct: number | null;
  gridCount: number;
  spacingPct: number | null;
  source: "old_grid" | "dynamic_candidate" | "none";
  confidence: "low" | "medium" | "high";
  cooldownRequired: boolean;
  // diagnostics
  realizedRangePct: number | null;
  atrProxyPct: number | null;
  priceDriftPct: number | null;
  decisionPriceMissing: boolean;
}

function safePct(numerator: number, denom: number): number | null {
  if (!Number.isFinite(numerator) || !Number.isFinite(denom) || denom === 0) return null;
  return (numerator / denom) * 100;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function priceVsGridOf(price: number, lower: number | null, upper: number | null): PriceVsGrid {
  if (lower == null || upper == null) return "UNKNOWN";
  if (price < lower) return "BELOW_GRID";
  if (price > upper) return "ABOVE_GRID";
  return "INSIDE_GRID";
}

function atrProxyPct(closes: number[] | undefined, price: number): number | null {
  if (!closes || closes.length < 2 || price <= 0) return null;
  let sum = 0;
  let n = 0;
  for (let i = 1; i < closes.length; i++) {
    sum += Math.abs(closes[i] - closes[i - 1]);
    n++;
  }
  if (n === 0) return null;
  return safePct(sum / n, price);
}

function realizedRangePct(closes: number[] | undefined, price: number): number | null {
  if (!closes || closes.length < 2 || price <= 0) return null;
  const hi = Math.max(...closes);
  const lo = Math.min(...closes);
  return safePct(hi - lo, price);
}

/**
 * Decide paper grid validity + candidate dynamic grid. Pure, deterministic.
 * Order of gates (highest priority first): stale → exposure → range → regime → cost → dynamic candidate.
 */
export function calculateDynamicGrid(
  input: DynamicGridInput,
  cfg: DynamicGridConfig = DEFAULT_DYNAMIC_GRID_CONFIG,
): DynamicGridResult {
  const price = input.currentPrice;
  const gridCount = input.gridCount && input.gridCount > 0 ? Math.floor(input.gridCount) : 10;
  const rtCost = input.roundTripCostPct ?? cfg.defaultRoundTripCostPct;
  const buy = input.buyFillCount ?? 0;
  const sell = input.sellFillCount ?? 0;
  const vsGrid = priceVsGridOf(price, input.oldGridLower, input.oldGridUpper);
  const rangePct = realizedRangePct(input.recentCloses, price);
  const atrPct = atrProxyPct(input.recentCloses, price);

  const base = {
    priceVsGrid: vsGrid,
    realizedRangePct: rangePct,
    atrProxyPct: atrPct,
    gridCount,
    dynamicGridLower: null as number | null,
    dynamicGridUpper: null as number | null,
    dynamicGridMid: null as number | null,
    gridWidthPct: null as number | null,
    spacingPct: null as number | null,
    source: "none" as DynamicGridResult["source"],
    confidence: "low" as DynamicGridResult["confidence"],
    cooldownRequired: false,
    priceDriftPct: null as number | null,
    decisionPriceMissing: input.decisionPrice == null,
    tradeAllowed: false,
    allowedSide: "NONE" as DynamicGridResult["allowedSide"],
  };

  // invalid price → cannot decide
  if (!Number.isFinite(price) || price <= 0) {
    return { ...base, status: "STALE_DATA", reason: "currentPrice invalid", noTradeReason: "stale_decision_or_price_mismatch" };
  }

  // Part D — stale decision / price mismatch gate
  let priceDriftPct: number | null = null;
  if (input.decisionPrice != null && Number.isFinite(input.decisionPrice) && input.decisionPrice > 0) {
    priceDriftPct = Math.abs((input.decisionPrice - price) / price) * 100;
    if (priceDriftPct > cfg.maxPriceDriftPct) {
      return {
        ...base, priceDriftPct,
        status: "STALE_DATA",
        reason: `priceDriftPct=${priceDriftPct.toFixed(2)} > ${cfg.maxPriceDriftPct} (decision vs snapshot mismatch)`,
        noTradeReason: "stale_decision_or_price_mismatch",
      };
    }
  }

  // Part C — one-sided exposure guardrail
  if (buy > cfg.maxOneSidedBuyFillsWithoutSell && sell === 0) {
    return { ...base, priceDriftPct, status: "PAUSE_EXPOSURE_LIMIT", reason: `one-sided BUY exposure ${buy} without SELL`, noTradeReason: "one_sided_buy_limit" };
  }
  if (sell > cfg.maxOneSidedSellFillsWithoutBuy && buy === 0) {
    return { ...base, priceDriftPct, status: "PAUSE_EXPOSURE_LIMIT", reason: `one-sided SELL exposure ${sell} without BUY`, noTradeReason: "one_sided_sell_limit" };
  }

  // Part A — range validity gate (against the FRESH price)
  if (vsGrid === "BELOW_GRID") {
    return { ...base, priceDriftPct, status: "REGRID_REQUIRED", reason: "price below grid_lower; neutral grid invalid", noTradeReason: "price_below_grid_lower", cooldownRequired: true };
  }
  if (vsGrid === "ABOVE_GRID") {
    return { ...base, priceDriftPct, status: "REGRID_REQUIRED", reason: "price above grid_upper; neutral grid invalid", noTradeReason: "price_above_grid_upper", cooldownRequired: true };
  }

  // volatility extreme → no-trade
  if (rangePct != null && rangePct > cfg.volatilityExtremePct) {
    return { ...base, priceDriftPct, status: "NO_TRADE", reason: `realizedRangePct=${rangePct.toFixed(1)} extreme`, noTradeReason: "volatility_extreme" };
  }

  // cost gate
  if (input.costGatePass === false) {
    return { ...base, priceDriftPct, status: "NO_TRADE", reason: "cost gate not passing", noTradeReason: "cost_gate_failed" };
  }

  // regime sanity — neutral grid valid only for range/neutral/compression-like modes
  const mode = (input.marketMode ?? "").toUpperCase();
  const regime = (input.regime ?? "").toUpperCase();
  const rangeLike =
    mode.includes("GRID") || mode.includes("NEUTRAL") || mode.includes("RANGE") ||
    regime.includes("RANGE") || regime.includes("NEUTRAL") || regime.includes("COMPRESS");
  if (mode && !rangeLike) {
    return { ...base, priceDriftPct, status: "TREND_CHECK", reason: `mode=${mode} not range-like; route to trend check`, noTradeReason: "regime_unclear" };
  }
  if (!mode && !regime) {
    return { ...base, priceDriftPct, status: "NO_TRADE", reason: "regime/mode unknown", noTradeReason: "regime_unclear" };
  }

  // INSIDE valid range → allow paper side (BUY below mid / SELL above mid)
  const oldMid = input.oldGridLower != null && input.oldGridUpper != null
    ? (input.oldGridLower + input.oldGridUpper) / 2 : price;
  const allowedSide: DynamicGridResult["allowedSide"] = price < oldMid ? "BUY" : "SELL";

  // candidate dynamic grid (informational; activation gated by cooldown/stable candles)
  const minW = Math.max(rtCost * 5, cfg.minGridWidthPct);
  const targetW = clamp((atrPct ?? cfg.minGridWidthPct / cfg.atrWidthMultiplier) * cfg.atrWidthMultiplier, minW, cfg.maxGridWidthPct);
  const spacing = targetW / gridCount;
  const spacingOk = spacing > rtCost * cfg.spacingCostMultiple;
  const dynLower = price * (1 - targetW / 200);
  const dynUpper = price * (1 + targetW / 200);
  const cooldownNeeded = !input.stableCandlesConfirmed;

  return {
    ...base,
    priceDriftPct,
    status: cooldownNeeded ? "REGRID_CANDIDATE" : "DYNAMIC_GRID_ACTIVE",
    reason: cooldownNeeded ? "inside range; dynamic grid candidate awaiting stable-candle confirmation"
                           : "inside range; dynamic grid active",
    noTradeReason: spacingOk ? null : "cost_gate_failed",
    tradeAllowed: spacingOk, // only allow when spacing covers cost
    allowedSide: spacingOk ? allowedSide : "NONE",
    dynamicGridLower: dynLower,
    dynamicGridUpper: dynUpper,
    dynamicGridMid: price,
    gridWidthPct: targetW,
    spacingPct: spacing,
    source: "dynamic_candidate",
    confidence: atrPct != null && rangePct != null ? "medium" : "low",
    cooldownRequired: cooldownNeeded,
  };
}
