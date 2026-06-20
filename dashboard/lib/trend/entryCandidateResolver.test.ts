// dashboard/lib/trend/entryCandidateResolver.test.ts
// Run: node --test --experimental-strip-types lib/trend/entryCandidateResolver.test.ts

import assert from "node:assert/strict";
import test from "node:test";

import { resolveEntryCandidate } from "./entryCandidateResolver.ts";

function bullishInput(overrides: Record<string, unknown> = {}) {
  return {
    canonicalMarketRegime: {
      regime: "UPTREND",
      direction: "BULLISH",
      confidence: 82,
    },
    trendStrategy: {
      status: "RISK_REJECTED",
      direction: "LONG",
      entryZone: [99, 101],
      currentPrice: 105,
      invalidation: 97,
      target1: 103,
      target2: null,
      rewardRisk: 1,
      confirmationRequired: true,
      confirmationStatus: "WAITING_5M_CONFIRM",
      riskStatus: "NO_TRADE_BAD_RR",
    },
    currentPriceConsistencyAudit: {
      canonicalCurrentPrice: {
        value: 105,
        freshnessStatus: "FRESH",
      },
    },
    currentPriceEligibleExactSubset: {
      topCandidates: [],
    },
    regimeAwareExactCandidateWatchlist: {
      topWatchCandidates: [],
    },
    multiTimeframeIndicatorEvidence: {},
    ...overrides,
  };
}

function scenariosByName(result: ReturnType<typeof resolveEntryCandidate>) {
  return Object.fromEntries(result.rrScenarios.map((scenario) => [scenario.name, scenario]));
}

test("bullish setup waits for LONG pullback and rejects near-price SHORT candidate", () => {
  const result = resolveEntryCandidate(bullishInput({
    regimeAwareExactCandidateWatchlist: {
      topWatchCandidates: [{
        id: "short-near",
        direction: "SHORT",
        directionAlignment: "COUNTER_REGIME",
        actionability: "COUNTER_REGIME_REJECTED",
        qualityStatus: "TARGET_TOO_CLOSE",
        currentPriceStatus: "NEAR_ENTRY",
        entry: 105,
        stopLoss: 106,
        target1: 104.5,
        blockers: ["REGIME_DIRECTION_CONFLICT", "TARGET_TOO_CLOSE"],
      }],
    },
  }));

  assert.equal(result.alignedDirection, "LONG");
  assert.equal(result.priceLocation, "ABOVE_LONG_ZONE");
  assert.equal(result.status, "WAITING_PULLBACK");
  assert.equal(result.rejectedOppositeCandidates.length, 1);
  assert.equal(result.rejectedOppositeCandidates[0]?.doNotUseAsEntry, true);
  assert.deepEqual(result.rejectedOppositeCandidates[0]?.blockers, [
    "REGIME_DIRECTION_CONFLICT",
    "TARGET_TOO_CLOSE",
  ]);
  assert.equal(result.activationAllowed, false);
  assert.equal(result.paperActivationAllowed, false);
  assert.equal(result.liveActivationAllowed, false);
  assert.equal(result.reviewOnly, true);
  assert.equal(result.shadowOnly, true);
});

test("calculates LONG RR for zone low, midpoint, and zone high entries", () => {
  const result = resolveEntryCandidate(bullishInput({
    trendStrategy: {
      ...bullishInput().trendStrategy,
      target1: 105,
    },
  }));
  const scenarios = scenariosByName(result);

  assert.equal(scenarios.ZONE_LOW_ENTRY?.rr, 3);
  assert.equal(scenarios.ZONE_MID_ENTRY?.rr, 5 / 3);
  assert.equal(scenarios.ZONE_HIGH_ENTRY?.rr, 1);
  assert.equal(result.rrThreshold, 1.2);
  assert.equal(result.rrThresholdSource, "trendStrategy.DEFAULT_MIN_RR");
});

test("calculates the bearish SHORT mirror without changing RR direction", () => {
  const result = resolveEntryCandidate(bullishInput({
    canonicalMarketRegime: {
      regime: "DOWNTREND",
      direction: "BEARISH",
      confidence: 82,
    },
    trendStrategy: {
      ...bullishInput().trendStrategy,
      direction: "SHORT",
      currentPrice: 95,
      invalidation: 103,
      target1: 95,
    },
    currentPriceConsistencyAudit: {
      canonicalCurrentPrice: { value: 95, freshnessStatus: "FRESH" },
    },
  }));
  const scenarios = scenariosByName(result);

  assert.equal(result.alignedDirection, "SHORT");
  assert.equal(result.priceLocation, "BELOW_SHORT_ZONE");
  assert.equal(scenarios.ZONE_LOW_ENTRY?.rr, 1);
  assert.equal(scenarios.ZONE_MID_ENTRY?.rr, 5 / 3);
  assert.equal(scenarios.ZONE_HIGH_ENTRY?.rr, 3);
});

test("keeps canonical direction authoritative and rejects conflicting trend geometry", () => {
  const result = resolveEntryCandidate(bullishInput({
    trendStrategy: {
      ...bullishInput().trendStrategy,
      direction: "SHORT",
    },
  }));

  assert.equal(result.alignedDirection, "LONG");
  assert.equal(result.alignedEntryZone, null);
  assert.equal(result.status, "NO_ALIGNED_SETUP");
});

test("keeps WAITING_PULLBACK when RR passes but current price is outside the aligned zone", () => {
  const result = resolveEntryCandidate(bullishInput({
    trendStrategy: {
      ...bullishInput().trendStrategy,
      target1: 105,
      rewardRisk: 1.67,
    },
  }));

  assert.equal(result.bestReviewCandidate?.meetsThreshold, true);
  assert.equal(result.status, "WAITING_PULLBACK");
});

test("returns clean review candidate inside zone with aligned clean quality and false activation flags", () => {
  const result = resolveEntryCandidate(bullishInput({
    trendStrategy: {
      ...bullishInput().trendStrategy,
      currentPrice: 100,
      target1: 105,
      rewardRisk: 5 / 3,
    },
    currentPriceConsistencyAudit: {
      canonicalCurrentPrice: { value: 100, freshnessStatus: "FRESH" },
    },
    regimeAwareExactCandidateWatchlist: {
      topWatchCandidates: [{
        id: "long-clean",
        direction: "LONG",
        directionAlignment: "ALIGNED",
        actionability: "CLEAN_REVIEW_ONLY",
        clean: true,
        qualityStatus: "CLEAN",
        currentPriceStatus: "INSIDE_ENTRY_ZONE",
        entry: 100,
        stopLoss: 97,
        target1: 105,
        blockers: [],
      }],
    },
  }));

  assert.equal(result.priceLocation, "INSIDE_LONG_ZONE");
  assert.equal(result.status, "CLEAN_REVIEW_CANDIDATE");
  assert.equal(result.activationAllowed, false);
  assert.equal(result.paperActivationAllowed, false);
  assert.equal(result.liveActivationAllowed, false);
});

test("does not label a base RR pass as repaired when aligned candidate quality is not clean", () => {
  const result = resolveEntryCandidate(bullishInput({
    trendStrategy: {
      ...bullishInput().trendStrategy,
      currentPrice: 100,
      target1: 105,
      rewardRisk: 5 / 3,
    },
    currentPriceConsistencyAudit: {
      canonicalCurrentPrice: { value: 100, freshnessStatus: "FRESH" },
    },
    regimeAwareExactCandidateWatchlist: {
      topWatchCandidates: [{
        id: "long-quality-rejected",
        direction: "LONG",
        directionAlignment: "ALIGNED",
        actionability: "ELIGIBLE_BUT_QUALITY_REJECTED",
        clean: false,
        qualityStatus: "TARGET_TOO_CLOSE",
        currentPriceStatus: "INSIDE_ENTRY_ZONE",
        blockers: ["TARGET_TOO_CLOSE"],
      }],
    },
  }));

  assert.equal(result.status, "NO_ALIGNED_SETUP");
  assert.notEqual(result.status, "RR_REPAIRED_REVIEW_ONLY");
  assert.ok(result.blockers.includes("TARGET_TOO_CLOSE"));
});

test("marks extended target unavailable when target2 is absent", () => {
  const result = resolveEntryCandidate(bullishInput());
  const extended = result.rrScenarios.find((scenario) => scenario.name === "EXTENDED_TARGET_ENTRY");

  assert.equal(extended?.available, false);
  assert.equal(extended?.target, null);
  assert.ok(extended?.notes.some((note) => note.includes("target2")));
});

test("uses only fresh finite 5M ATR for the tight-stop scenario", () => {
  const fresh = resolveEntryCandidate(bullishInput({
    multiTimeframeIndicatorEvidence: {
      "5M": {
        atr: 2,
        freshness: { latestCandleAt: "2026-06-20T00:00:00.000Z", ageMs: 60_000 },
      },
    },
  }));
  const stale = resolveEntryCandidate(bullishInput({
    multiTimeframeIndicatorEvidence: {
      "5M": {
        atr: 2,
        freshness: { latestCandleAt: "2026-06-19T23:00:00.000Z", ageMs: 901_000 },
      },
    },
  }));

  assert.equal(scenariosByName(fresh).TIGHT_STOP_ENTRY?.available, true);
  assert.equal(scenariosByName(fresh).TIGHT_STOP_ENTRY?.stopLoss, 97);
  assert.equal(scenariosByName(stale).TIGHT_STOP_ENTRY?.available, false);
});

test("returns RR_REPAIRED_REVIEW_ONLY when fresh ATR repairs failing base RR inside zone", () => {
  const result = resolveEntryCandidate(bullishInput({
    trendStrategy: {
      ...bullishInput().trendStrategy,
      currentPrice: 100,
      invalidation: 95,
      target1: 102.5,
      rewardRisk: 0.5,
    },
    currentPriceConsistencyAudit: {
      canonicalCurrentPrice: { value: 100, freshnessStatus: "FRESH" },
    },
    multiTimeframeIndicatorEvidence: {
      "5M": { atr: 1, freshness: { ageMs: 60_000 } },
    },
  }));

  assert.equal(scenariosByName(result).TIGHT_STOP_ENTRY?.rr, 1.25);
  assert.equal(result.status, "RR_REPAIRED_REVIEW_ONLY");
});

test("distinguishes missing repair evidence from evaluated bad RR", () => {
  const common = {
    trendStrategy: {
      ...bullishInput().trendStrategy,
      currentPrice: 100,
      invalidation: 95,
      target1: 100.5,
      rewardRisk: 0.1,
    },
    currentPriceConsistencyAudit: {
      canonicalCurrentPrice: { value: 100, freshnessStatus: "FRESH" },
    },
  };
  const missing = resolveEntryCandidate(bullishInput(common));
  const evaluated = resolveEntryCandidate(bullishInput({
    ...common,
    multiTimeframeIndicatorEvidence: {
      "5M": { atr: 1, freshness: { ageMs: 60_000 } },
    },
  }));

  assert.equal(missing.status, "RR_REPAIR_REQUIRED");
  assert.equal(evaluated.status, "NO_TRADE_BAD_RR");
});

test("returns COUNTER_REGIME_ONLY when no aligned zone exists and only opposite candidates remain", () => {
  const result = resolveEntryCandidate(bullishInput({
    trendStrategy: {
      ...bullishInput().trendStrategy,
      entryZone: null,
      invalidation: null,
      target1: null,
    },
    regimeAwareExactCandidateWatchlist: {
      topWatchCandidates: [{
        id: "short-only",
        direction: "SHORT",
        directionAlignment: "COUNTER_REGIME",
        qualityStatus: "TARGET_TOO_CLOSE",
        blockers: ["TARGET_TOO_CLOSE"],
      }],
    },
  }));

  assert.equal(result.status, "COUNTER_REGIME_ONLY");
  assert.equal(result.rejectedOppositeCandidates.length, 1);
});

test("does not mutate resolver inputs or raw candidate arrays", () => {
  const input = bullishInput({
    regimeAwareExactCandidateWatchlist: {
      topWatchCandidates: [{
        id: "short-immutable",
        direction: "SHORT",
        directionAlignment: "COUNTER_REGIME",
        qualityStatus: "TARGET_TOO_CLOSE",
        blockers: ["TARGET_TOO_CLOSE"],
      }],
    },
  });
  const before = structuredClone(input);

  resolveEntryCandidate(input);

  assert.deepEqual(input, before);
});
