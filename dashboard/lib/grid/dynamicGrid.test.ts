// Unit tests for the Dynamic Grid engine (paper-only guardrail logic).
// Runner-agnostic: uses node:test + node:assert (works with `node --test`, vitest, etc.).
// These tests document/lock the guardrail order: stale → exposure → range → vol → cost → regime → inside.

import { test } from "node:test";
import assert from "node:assert/strict";
import { calculateDynamicGrid, DEFAULT_DYNAMIC_GRID_CONFIG } from "./dynamicGrid";

const GRID_LOWER = 72480;
const GRID_UPPER = 78053; // mid ≈ 75266.5
const RANGE_MODE = "GRID_NEUTRAL";

test("BELOW_GRID: price under grid_lower blocks BUY → REGRID_REQUIRED", () => {
  const r = calculateDynamicGrid({
    currentPrice: 66849.6, oldGridLower: GRID_LOWER, oldGridUpper: GRID_UPPER,
    marketMode: RANGE_MODE, regime: "RANGE",
  });
  assert.equal(r.priceVsGrid, "BELOW_GRID");
  assert.equal(r.status, "REGRID_REQUIRED");
  assert.equal(r.noTradeReason, "price_below_grid_lower");
  assert.equal(r.tradeAllowed, false);
  assert.equal(r.allowedSide, "NONE");
});

test("ABOVE_GRID: price over grid_upper blocks → REGRID_REQUIRED", () => {
  const r = calculateDynamicGrid({
    currentPrice: 80000, oldGridLower: GRID_LOWER, oldGridUpper: GRID_UPPER,
    marketMode: RANGE_MODE, regime: "RANGE",
  });
  assert.equal(r.priceVsGrid, "ABOVE_GRID");
  assert.equal(r.noTradeReason, "price_above_grid_upper");
  assert.equal(r.tradeAllowed, false);
});

test("STALE_DATA: decision/snapshot price drift > 1% blocks first", () => {
  const r = calculateDynamicGrid({
    currentPrice: 66849.6, decisionPrice: 73981,
    oldGridLower: GRID_LOWER, oldGridUpper: GRID_UPPER, marketMode: RANGE_MODE, regime: "RANGE",
  });
  assert.equal(r.status, "STALE_DATA");
  assert.equal(r.noTradeReason, "stale_decision_or_price_mismatch");
  assert.ok(r.priceDriftPct != null && r.priceDriftPct > 10, "drift ≈ 10.7%");
  assert.equal(r.tradeAllowed, false);
});

test("PAUSE_EXPOSURE_LIMIT: one-sided BUY exposure blocks new BUY", () => {
  const r = calculateDynamicGrid({
    currentPrice: 74000, oldGridLower: GRID_LOWER, oldGridUpper: GRID_UPPER,
    marketMode: RANGE_MODE, regime: "RANGE", buyFillCount: 1316, sellFillCount: 0,
  });
  assert.equal(r.status, "PAUSE_EXPOSURE_LIMIT");
  assert.equal(r.noTradeReason, "one_sided_buy_limit");
  assert.equal(r.tradeAllowed, false);
});

test("INSIDE_GRID below mid → BUY candidate (cooldown until stable candles)", () => {
  const r = calculateDynamicGrid({
    currentPrice: 74000, oldGridLower: GRID_LOWER, oldGridUpper: GRID_UPPER,
    marketMode: RANGE_MODE, regime: "RANGE",
    recentCloses: [73500, 74300, 73600, 74400, 74000], gridCount: 10, roundTripCostPct: 0.09,
  });
  assert.equal(r.priceVsGrid, "INSIDE_GRID");
  assert.equal(r.allowedSide, "BUY"); // 74000 < mid 75266
  assert.equal(r.status, "REGRID_CANDIDATE"); // stableCandlesConfirmed not set
  assert.equal(r.cooldownRequired, true);
  assert.ok((r.spacingPct ?? 0) > 0.09 * 2.5, "spacing must cover round-trip cost");
});

test("DYNAMIC_GRID_ACTIVE when stable candles confirmed", () => {
  const r = calculateDynamicGrid({
    currentPrice: 76000, oldGridLower: GRID_LOWER, oldGridUpper: GRID_UPPER,
    marketMode: RANGE_MODE, regime: "RANGE",
    recentCloses: [75500, 76300, 75600, 76400, 76000], gridCount: 10, roundTripCostPct: 0.09,
    stableCandlesConfirmed: true,
  });
  assert.equal(r.status, "DYNAMIC_GRID_ACTIVE");
  assert.equal(r.allowedSide, "SELL"); // 76000 > mid 75266
  assert.equal(r.tradeAllowed, true);
});

test("TREND_CHECK: non-range mode routes away from neutral grid", () => {
  const r = calculateDynamicGrid({
    currentPrice: 74000, oldGridLower: GRID_LOWER, oldGridUpper: GRID_UPPER,
    marketMode: "TREND_DOWN", regime: "DOWNTREND",
  });
  assert.equal(r.status, "TREND_CHECK");
  assert.equal(r.noTradeReason, "regime_unclear");
  assert.equal(r.tradeAllowed, false);
});

test("cost gate fail → no trade", () => {
  const r = calculateDynamicGrid({
    currentPrice: 74000, oldGridLower: GRID_LOWER, oldGridUpper: GRID_UPPER,
    marketMode: RANGE_MODE, regime: "RANGE", costGatePass: false,
  });
  assert.equal(r.noTradeReason, "cost_gate_failed");
  assert.equal(r.tradeAllowed, false);
});

test("config default sane", () => {
  assert.equal(DEFAULT_DYNAMIC_GRID_CONFIG.maxOneSidedBuyFillsWithoutSell, 5);
  assert.equal(DEFAULT_DYNAMIC_GRID_CONFIG.maxPriceDriftPct, 1.0);
});
