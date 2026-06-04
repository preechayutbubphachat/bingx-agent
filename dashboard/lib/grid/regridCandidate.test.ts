import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateRegridCandidate } from "./regridCandidate";

const OLD_LOWER = 72480;
const OLD_UPPER = 78053;

test("INSIDE_GRID → INACTIVE, no candidate, activationAllowed false", () => {
  const c = evaluateRegridCandidate({
    priceVsGrid: "INSIDE_GRID", currentPrice: 75000, oldGridLower: OLD_LOWER, oldGridUpper: OLD_UPPER,
    marketMode: "GRID_NEUTRAL", regime: "RANGE",
  });
  assert.equal(c.candidateStatus, "INACTIVE");
  assert.equal(c.candidateGridMid, null);
  assert.equal(c.activationAllowed, false);
});

test("BELOW_GRID → candidate geometry formed around current price, activation still blocked", () => {
  const c = evaluateRegridCandidate({
    priceVsGrid: "BELOW_GRID", currentPrice: 62405, oldGridLower: OLD_LOWER, oldGridUpper: OLD_UPPER,
    marketMode: "GRID_NEUTRAL", regime: "RANGE",
    recentCloses: [61800, 62700, 61900, 62800, 62405], roundTripCostPct: 0.09,
  });
  assert.notEqual(c.candidateStatus, "INACTIVE");
  assert.equal(c.candidateGridMid, 62405); // centered on current price
  assert.ok((c.candidateGridLower ?? 0) < 62405 && (c.candidateGridUpper ?? 0) > 62405);
  assert.ok((c.candidateSpacingPct ?? 0) > 0.09 * 2.5, "spacing covers cost");
  assert.equal(c.activationAllowed, false); // Phase 1 invariant
});

test("activationAllowed is ALWAYS false even when geometry is valid (Phase 1)", () => {
  const c = evaluateRegridCandidate({
    priceVsGrid: "ABOVE_GRID", currentPrice: 95000, oldGridLower: OLD_LOWER, oldGridUpper: OLD_UPPER,
    marketMode: "GRID_NEUTRAL", regime: "RANGE",
    recentCloses: [94500, 95300, 94600, 95400, 95000], roundTripCostPct: 0.09,
    stableCandlesRequired: 3,
  });
  assert.equal(c.activationAllowed, false);
});

test("stable candle count + cooldownRemaining", () => {
  const c = evaluateRegridCandidate({
    priceVsGrid: "BELOW_GRID", currentPrice: 62000, oldGridLower: OLD_LOWER, oldGridUpper: OLD_UPPER,
    marketMode: "GRID_NEUTRAL", regime: "RANGE",
    recentCloses: [50000, 61800, 62100, 61950, 62000], // last 4 within 0.8% of 62000, 50000 not
    stableCandlesRequired: 4, stabilityMaxPct: 0.8, roundTripCostPct: 0.09,
  });
  assert.equal(c.stableCandleCount, 4);
  assert.equal(c.cooldownRemaining, 0);
});

test("not enough stable candles → cooldownRemaining > 0 (still no activation)", () => {
  const c = evaluateRegridCandidate({
    priceVsGrid: "BELOW_GRID", currentPrice: 62000, oldGridLower: OLD_LOWER, oldGridUpper: OLD_UPPER,
    marketMode: "GRID_NEUTRAL", regime: "RANGE",
    recentCloses: [50000, 55000, 60000, 62000], // only last 1 within 0.8%
    stableCandlesRequired: 4, stabilityMaxPct: 0.8,
  });
  assert.equal(c.stableCandleCount, 1);
  assert.equal(c.cooldownRemaining, 3);
  assert.equal(c.activationAllowed, false);
});
