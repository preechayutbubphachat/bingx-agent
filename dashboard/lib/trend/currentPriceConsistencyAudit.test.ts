// dashboard/lib/trend/currentPriceConsistencyAudit.test.ts
// Run: node --test --experimental-strip-types lib/trend/currentPriceConsistencyAudit.test.ts

import assert from "node:assert/strict";
import test from "node:test";

import { buildCurrentPriceConsistencyAudit } from "./currentPriceConsistencyAudit.ts";

const freshCurrentPriceContext = {
  currentPrice: 62_850.7,
  priceSource: "market_snapshot.15m.close",
  latestCandleAt: "2026-06-18T22:45:00.000Z",
  freshnessStatus: "FRESH",
  ageSeconds: 60,
};

function consistentInput() {
  return {
    mtfEntryCandidatePipeline: {
      currentPriceContext: freshCurrentPriceContext,
    },
    currentPriceEligibleExactSubset: {
      currentPrice: {
        value: 62_850.7,
        source: "market_snapshot.15m.close",
        latestCandleAt: "2026-06-18T22:45:00.000Z",
        freshnessStatus: "FRESH",
        ageSeconds: 60,
      },
    },
    trendStrategy: {
      currentPrice: 62_850.7,
      direction: "SHORT",
      entryZone: [63_442.4, 63_727.91],
      invalidation: 64_748.42,
      target1: 62_232.6,
    },
    trendTransitionMonitor: {
      watchedFields: {
        currentPrice: 62_850.7,
      },
    },
    trendManualPaperArmGate: {
      passedConditions: [],
      failedConditions: ["price_inside_entry_zone_or_edge"],
    },
  };
}

test("current price matches all consumers", () => {
  const result = buildCurrentPriceConsistencyAudit(consistentInput());

  assert.equal(result.status, "CONSISTENT");
  assert.equal(result.canonicalCurrentPrice.value, 62_850.7);
  assert.equal(result.detectedConsumers.find((item) => item.path === "trendStrategy.currentPrice")?.status, "MATCH");
  assert.equal(result.safety.activationAllowed, false);
  assert.equal(result.safety.paperActivationAllowed, false);
  assert.equal(result.safety.liveActivationAllowed, false);
  assert.equal(result.safety.orderAllowed, false);
});

test("stale trend price flags mismatched consumers and current-price gate downgrade", () => {
  const result = buildCurrentPriceConsistencyAudit({
    ...consistentInput(),
    trendStrategy: {
      currentPrice: 63_500.7,
      direction: "SHORT",
      entryZone: [63_442.4, 63_727.91],
      invalidation: 64_748.42,
      target1: 62_232.6,
    },
    trendTransitionMonitor: {
      watchedFields: {
        currentPrice: 63_500.7,
      },
    },
    trendManualPaperArmGate: {
      passedConditions: ["price_inside_entry_zone_or_edge"],
      failedConditions: [],
    },
  });

  const trendStrategyConsumer = result.detectedConsumers.find((item) => item.path === "trendStrategy.currentPrice");
  const transitionConsumer = result.detectedConsumers.find((item) => item.path === "trendTransitionMonitor.watchedFields.currentPrice");
  const condition = result.affectedConditions.find((item) => item.condition === "price_inside_entry_zone_or_edge");

  assert.equal(result.status, "PRICE_MISMATCH_DETECTED");
  assert.equal(trendStrategyConsumer?.status, "MISMATCH");
  assert.equal(trendStrategyConsumer?.priceDelta, 650);
  assert.equal(trendStrategyConsumer?.priceDeltaPct, 1.0342);
  assert.equal(transitionConsumer?.status, "MISMATCH");
  assert.equal(condition?.previousValue, true);
  assert.equal(condition?.currentPriceBasedValue, false);
  assert.equal(condition?.impact, "PASS_TO_FAIL");
  assert.equal(result.currentPriceReevaluation.trendZoneStatus, "WAITING_PULLBACK_TO_ENTRY");
  assert.equal(result.currentPriceReevaluation.priceMoveRequiredDirection, "UP_TO_ENTRY");
  assert.equal(result.currentPriceReevaluation.distanceToEntryZoneAbs, 591.7);
  assert.equal(result.currentPriceReevaluation.distanceToEntryZonePct, 0.9414);
  assert.ok(result.recommendations.includes("Use canonical current price for all trend gate diagnostics before interpreting readiness."));
  assert.equal(result.safety.activationAllowed, false);
});

test("missing canonical current price reports missing current price", () => {
  const result = buildCurrentPriceConsistencyAudit({
    trendStrategy: { currentPrice: 63_500.7 },
  });

  assert.equal(result.status, "MISSING_CURRENT_PRICE");
  assert.equal(result.canonicalCurrentPrice.value, null);
  assert.equal(result.currentPriceReevaluation.trendZoneStatus, "UNKNOWN");
  assert.equal(result.safety.activationAllowed, false);
});

test("helper does not mutate input", () => {
  const input = consistentInput();
  const before = JSON.stringify(input);

  buildCurrentPriceConsistencyAudit(input);

  assert.equal(JSON.stringify(input), before);
});
