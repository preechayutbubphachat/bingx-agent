// dashboard/lib/trend/regimeAwareExactCandidateWatchlist.test.ts
// Run: node --test --experimental-strip-types lib/trend/regimeAwareExactCandidateWatchlist.test.ts

import assert from "node:assert/strict";
import test from "node:test";

import { evaluateRegimeAwareExactCandidateWatchlist } from "./regimeAwareExactCandidateWatchlist.ts";

function subset(overrides: Record<string, unknown> = {}) {
  return {
    status: "NO_CURRENT_PRICE_ELIGIBLE_CANDIDATES",
    currentPrice: {
      value: 62_718.5,
      source: "market_snapshot.15m.close",
      latestCandleAt: "2026-06-19T02:00:00.000Z",
      freshnessStatus: "FRESH",
      ageSeconds: 120,
    },
    sampleAccounting: {
      currentPriceEligibleExactSamples: 0,
      cleanCurrentPriceEligibleSamples: 0,
    },
    eligibilityFilters: {
      totalCandidates: 65,
      missedCandidates: 44,
      invalidatedCandidates: 4,
      targetTooCloseCandidates: 12,
      costTooHighCandidates: 0,
      cleanCandidates: 0,
    },
    dedupSummary: {
      rawCandidates: 65,
      uniqueCandidates: 48,
      duplicateCandidates: 17,
    },
    cleanSubsetGate: {
      status: "NOT_READY",
      failed: ["targetTooCloseRate > 0.4"],
    },
    topCandidates: [{
      id: "short-watch-63654",
      direction: "SHORT",
      status: "TARGET_TOO_CLOSE",
      currentPriceStatus: "WAITING_PULLBACK_TO_ENTRY",
      qualityStatus: "TARGET_TOO_CLOSE",
      entry: 63_654.92,
      entryLow: 63_600,
      entryHigh: 63_700,
      stopLoss: 64_200,
      target1: 62_900,
      target2: null,
      netRR: 1.1,
      distanceToEntryPct: 1.4931,
      distanceToEntryAbs: 936.42,
      priceMoveRequiredDirection: "UP_TO_ENTRY",
      occurrenceCount: 2,
      flags: ["REVIEW_ONLY"],
      reason: "SHORT candidate waits for pullback but target is too close.",
    }],
    ...overrides,
  };
}

function baseInput(overrides: Record<string, unknown> = {}) {
  return {
    currentPriceEligibleExactSubset: subset(),
    currentPriceConsistencyAudit: {
      canonicalCurrentPrice: {
        value: 62_718.5,
        freshnessStatus: "FRESH",
      },
      currentPriceReevaluation: {
        trendZoneStatus: "NO_ACTIVE_TREND_ZONE",
        explanation: "No active trend zone exists under the current regime.",
      },
    },
    canonicalMarketRegime: {
      regime: "NO_TRADE",
      direction: "UNKNOWN",
      confidence: 35,
      confidenceLabel: "low",
    },
    trendZoneCandidate: null,
    trendStrategy: { status: "NO_TRADE" },
    ...overrides,
  };
}

test("runtime-like no-trade regime produces watchlist only with regime and price blockers", () => {
  const result = evaluateRegimeAwareExactCandidateWatchlist(baseInput());
  const top = result.topWatchCandidates[0];

  assert.equal(result.status, "REGIME_NOT_CONFIRMED");
  assert.equal(result.verdict.status, "WAIT_FOR_REGIME_AND_PRICE");
  assert.equal(result.watchlistSummary.totalCandidates, 65);
  assert.equal(result.watchlistSummary.uniqueCandidates, 48);
  assert.equal(result.watchlistSummary.cleanReviewCandidates, 0);
  assert.equal(top?.actionability, "WAIT_FOR_REGIME_CONFIRMATION");
  assert.ok(top?.blockers.some((item) => item.includes("regime not confirmed")));
  assert.ok(top?.blockers.some((item) => item.includes("price not near entry")));
  assert.ok(top?.blockers.some((item) => item.includes("TARGET_TOO_CLOSE")));
  assert.match(top?.watchCondition ?? "", /63654\.92/);
  assert.equal(result.activationAllowed, false);
  assert.equal(result.paperActivationAllowed, false);
  assert.equal(result.liveActivationAllowed, false);
  assert.equal(result.reviewOnly, true);
  assert.equal(result.shadowOnly, true);
});

test("confirmed trend regime with price far from entry waits for pullback", () => {
  const result = evaluateRegimeAwareExactCandidateWatchlist(baseInput({
    canonicalMarketRegime: {
      regime: "DOWNTREND",
      direction: "BEARISH",
      confidence: 75,
      confidenceLabel: "high",
    },
    currentPriceConsistencyAudit: {
      canonicalCurrentPrice: { value: 62_718.5, freshnessStatus: "FRESH" },
      currentPriceReevaluation: { trendZoneStatus: "PRICE_BELOW_ENTRY_ZONE", explanation: "" },
    },
    trendZoneCandidate: { dir: "DOWN", pullbackZone: [63_600, 63_700] },
  }));

  assert.equal(result.status, "WAITING_PULLBACK");
  assert.equal(result.verdict.status, "WAIT_FOR_PULLBACK_ONLY");
  assert.equal(result.topWatchCandidates[0]?.actionability, "WAIT_FOR_PULLBACK_DEGRADED");
  assert.equal(result.watchlistSummary.degradedWatchCandidates > 0, true);
  assert.equal(result.watchlistSummary.qualityRejectedCandidates > 0, true);
  assert.equal(result.watchlistSummary.cleanReviewCandidates, 0);
});

test("passes canonical freshness from pipeline context when subset and audit are unknown", () => {
  const result = evaluateRegimeAwareExactCandidateWatchlist(baseInput({
    mtfEntryCandidatePipeline: {
      currentPriceContext: {
        currentPrice: 62_752,
        priceSource: "market_snapshot.15m.close",
        latestCandleAt: "2026-06-19T03:45:00.000Z",
        freshnessStatus: "FRESH",
        ageSeconds: 180,
      },
    },
    currentPriceConsistencyAudit: {
      canonicalCurrentPrice: {
        value: 62_752,
        freshnessStatus: "UNKNOWN",
      },
      currentPriceReevaluation: {
        trendZoneStatus: "PRICE_BELOW_ENTRY_ZONE",
      },
    },
    currentPriceEligibleExactSubset: subset({
      currentPrice: {
        value: 62_752,
        source: "market_snapshot.15m.close",
        latestCandleAt: "2026-06-19T03:45:00.000Z",
        freshnessStatus: "UNKNOWN",
        ageSeconds: null,
      },
    }),
  }));

  assert.equal(result.currentMarket.currentPrice, 62_752);
  assert.equal(result.currentMarket.freshnessStatus, "FRESH");
  assert.equal(result.currentMarket.latestCandleAt, "2026-06-19T03:45:00.000Z");
  assert.equal(result.currentMarket.ageSeconds, 180);
});

test("clusters duplicate watch candidates and exposes stop loss range", () => {
  const candidate = subset().topCandidates[0];
  const result = evaluateRegimeAwareExactCandidateWatchlist(baseInput({
    canonicalMarketRegime: {
      regime: "DOWNTREND",
      direction: "BEARISH",
      confidence: 78,
    },
    currentPriceConsistencyAudit: {
      canonicalCurrentPrice: { value: 62_752, freshnessStatus: "FRESH" },
      currentPriceReevaluation: { trendZoneStatus: "PRICE_BELOW_ENTRY_ZONE", explanation: "" },
    },
    currentPriceEligibleExactSubset: subset({
      topCandidates: [
        { ...candidate, id: "dup-a", stopLoss: 64_200 },
        { ...candidate, id: "dup-b", stopLoss: 64_200.3 },
        { ...candidate, id: "dup-c", stopLoss: 64_199.8 },
      ],
    }),
  }));

  assert.equal(result.watchlistDedupSummary.rawWatchCandidates, 3);
  assert.equal(result.watchlistDedupSummary.uniqueWatchCandidates, 1);
  assert.equal(result.watchlistDedupSummary.duplicateWatchCandidates, 2);
  assert.equal(result.topWatchCandidates.length, 1);
  assert.equal(result.topWatchCandidates[0]?.occurrenceCount, 3);
  assert.deepEqual(result.topWatchCandidates[0]?.stopLossRange, [64_199.8, 64_200.3]);
  assert.equal(result.topWatchCandidates[0]?.representativeStopLoss, 64_200);
});

test("clusters the runtime watchlist stop range before limiting top candidates", () => {
  const candidate = {
    ...subset().topCandidates[0],
    direction: "SHORT",
    entry: 63_450.7728,
    target1: 62_232.6,
    currentPriceStatus: "NEAR_ENTRY",
    qualityStatus: "TARGET_TOO_CLOSE",
    distanceToEntryPct: 0.003,
  };
  const result = evaluateRegimeAwareExactCandidateWatchlist(baseInput({
    canonicalMarketRegime: {
      regime: "UPTREND",
      direction: "BULLISH",
      confidence: 78,
    },
    currentPriceConsistencyAudit: {
      canonicalCurrentPrice: { value: 63_470.1, freshnessStatus: "FRESH" },
      currentPriceReevaluation: { trendZoneStatus: "WAITING_PULLBACK_TO_ENTRY" },
    },
    currentPriceEligibleExactSubset: subset({
      sampleAccounting: {
        currentPriceEligibleExactSamples: 11,
        cleanCurrentPriceEligibleSamples: 0,
      },
      topCandidates: [64_474.2029, 64_477.8386, 64_481.6557, 64_482.7429].map((stopLoss, index) => ({
        ...candidate,
        id: `runtime-watch-${index + 1}`,
        stopLoss,
      })),
    }),
  }));

  assert.equal(result.watchlistDedupSummary.rawWatchCandidates, 4);
  assert.equal(result.watchlistDedupSummary.uniqueWatchCandidates, 1);
  assert.equal(result.topWatchCandidates.length, 1);
  assert.equal(result.topWatchCandidates[0]?.occurrenceCount, 4);
  assert.deepEqual(result.topWatchCandidates[0]?.stopLossRange, [64_474.2029, 64_482.7429]);
});

test("near entry candidate with target-too-close quality is quality rejected", () => {
  const result = evaluateRegimeAwareExactCandidateWatchlist(baseInput({
    canonicalMarketRegime: {
      regime: "DOWNTREND",
      direction: "BEARISH",
      confidence: 75,
    },
    trendZoneCandidate: { dir: "DOWN", pullbackZone: [63_600, 63_700] },
    currentPriceEligibleExactSubset: subset({
      eligibilityFilters: {
        totalCandidates: 1,
        missedCandidates: 0,
        invalidatedCandidates: 0,
        targetTooCloseCandidates: 1,
        costTooHighCandidates: 0,
        cleanCandidates: 0,
      },
      topCandidates: [{
        ...subset().topCandidates[0],
        currentPriceStatus: "NEAR_ENTRY",
        distanceToEntryPct: 0.12,
      }],
    }),
  }));

  assert.equal(result.topWatchCandidates[0]?.directionAlignment, "ALIGNED");
  assert.equal(result.topWatchCandidates[0]?.actionability, "ELIGIBLE_BUT_QUALITY_REJECTED");
  assert.equal(result.topWatchCandidates[0]?.clean, false);
  assert.ok(result.topWatchCandidates[0]?.blockers.includes("TARGET_TOO_CLOSE"));
  assert.equal(result.watchlistSummary.qualityRejectedCandidates, 1);
});

test("eligible candidates without a clean subset stay degraded instead of reporting no eligible candidates", () => {
  const result = evaluateRegimeAwareExactCandidateWatchlist(baseInput({
    canonicalMarketRegime: {
      regime: "UPTREND",
      direction: "BULLISH",
      confidence: 78,
    },
    currentPriceConsistencyAudit: {
      canonicalCurrentPrice: { value: 63_470.1, freshnessStatus: "FRESH" },
      currentPriceReevaluation: { trendZoneStatus: "WAITING_PULLBACK_TO_ENTRY" },
    },
    currentPriceEligibleExactSubset: subset({
      status: "CURRENT_PRICE_ELIGIBLE_DEGRADED",
      sampleAccounting: {
        currentPriceEligibleExactSamples: 11,
        cleanCurrentPriceEligibleSamples: 0,
      },
      topCandidates: [{
        ...subset().topCandidates[0],
        direction: "SHORT",
        currentPriceStatus: "NEAR_ENTRY",
        qualityStatus: "TARGET_TOO_CLOSE",
        distanceToEntryPct: 0.003,
      }],
    }),
  }));

  assert.equal(result.status, "CURRENT_PRICE_ELIGIBLE_DEGRADED");
  assert.equal(result.verdict.status, "WATCH_ONLY");
  assert.equal(result.watchlistSummary.cleanReviewCandidates, 0);
  assert.equal(result.topWatchCandidates[0]?.directionAlignment, "COUNTER_REGIME");
  assert.equal(result.topWatchCandidates[0]?.actionability, "COUNTER_REGIME_REJECTED");
  assert.equal(result.topWatchCandidates[0]?.clean, false);
  assert.ok(result.topWatchCandidates[0]?.blockers.includes("REGIME_DIRECTION_CONFLICT"));
  assert.ok(result.topWatchCandidates[0]?.blockers.includes("TARGET_TOO_CLOSE"));
  assert.equal(result.activationAllowed, false);
  assert.equal(result.paperActivationAllowed, false);
  assert.equal(result.liveActivationAllowed, false);
  assert.equal(result.reviewOnly, true);
  assert.equal(result.shadowOnly, true);
});

test("bearish regime rejects a near-entry long candidate as counter-regime", () => {
  const result = evaluateRegimeAwareExactCandidateWatchlist(baseInput({
    canonicalMarketRegime: {
      regime: "DOWNTREND",
      direction: "BEARISH",
      confidence: 78,
    },
    currentPriceConsistencyAudit: {
      canonicalCurrentPrice: { value: 63_470.1, freshnessStatus: "FRESH" },
      currentPriceReevaluation: { trendZoneStatus: "WAITING_PULLBACK_TO_ENTRY" },
    },
    currentPriceEligibleExactSubset: subset({
      sampleAccounting: {
        currentPriceEligibleExactSamples: 1,
        cleanCurrentPriceEligibleSamples: 0,
      },
      topCandidates: [{
        ...subset().topCandidates[0],
        direction: "LONG",
        currentPriceStatus: "NEAR_ENTRY",
        qualityStatus: "TARGET_TOO_CLOSE",
        distanceToEntryPct: 0.01,
      }],
    }),
  }));

  assert.equal(result.topWatchCandidates[0]?.directionAlignment, "COUNTER_REGIME");
  assert.equal(result.topWatchCandidates[0]?.actionability, "COUNTER_REGIME_REJECTED");
  assert.equal(result.topWatchCandidates[0]?.clean, false);
  assert.ok(result.topWatchCandidates[0]?.blockers.includes("REGIME_DIRECTION_CONFLICT"));
  assert.ok(result.topWatchCandidates[0]?.blockers.includes("TARGET_TOO_CLOSE"));
  assert.equal(result.activationAllowed, false);
  assert.equal(result.paperActivationAllowed, false);
  assert.equal(result.liveActivationAllowed, false);
});

test("clean near-entry candidate is review-only and never activation-ready", () => {
  const result = evaluateRegimeAwareExactCandidateWatchlist(baseInput({
    canonicalMarketRegime: {
      regime: "DOWNTREND",
      direction: "BEARISH",
      confidence: 82,
    },
    trendZoneCandidate: { dir: "DOWN", pullbackZone: [63_600, 63_700] },
    currentPriceEligibleExactSubset: subset({
      status: "CLEAN_SUBSET_FOUND_REVIEW_ONLY",
      sampleAccounting: {
        currentPriceEligibleExactSamples: 1,
        cleanCurrentPriceEligibleSamples: 1,
      },
      eligibilityFilters: {
        totalCandidates: 1,
        missedCandidates: 0,
        invalidatedCandidates: 0,
        targetTooCloseCandidates: 0,
        costTooHighCandidates: 0,
        cleanCandidates: 1,
      },
      cleanSubsetGate: { status: "PARTIAL", failed: [] },
      topCandidates: [{
        ...subset().topCandidates[0],
        status: "CLEAN_REVIEW_ONLY",
        currentPriceStatus: "INSIDE_ENTRY_ZONE",
        qualityStatus: "CLEAN",
        distanceToEntryPct: 0,
        netRR: 1.8,
      }],
    }),
  }));

  assert.equal(result.status, "CLEAN_REVIEW_CANDIDATE_AVAILABLE_NOT_ACTIVATION");
  assert.equal(result.verdict.status, "CLEAN_REVIEW_READY_NOT_ACTIVATION");
  assert.equal(result.topWatchCandidates[0]?.actionability, "CLEAN_REVIEW_ONLY");
  assert.equal(result.topWatchCandidates[0]?.clean, true);
  assert.equal(result.compactSummary.cleanReviewCandidates, 1);
  assert.equal(result.compactSummary.detailsCollapsedByDefault, true);
  assert.equal(result.activationAllowed, false);
  assert.equal(result.paperActivationAllowed, false);
  assert.equal(result.liveActivationAllowed, false);
});

test("invalidated candidate is classified before other blockers", () => {
  const result = evaluateRegimeAwareExactCandidateWatchlist(baseInput({
    currentPriceEligibleExactSubset: subset({
      topCandidates: [{
        ...subset().topCandidates[0],
        status: "INVALIDATED",
        currentPriceStatus: "ALREADY_INVALIDATED",
        qualityStatus: "TARGET_TOO_CLOSE",
      }],
    }),
  }));

  assert.equal(result.topWatchCandidates[0]?.actionability, "INVALIDATED");
  assert.ok(result.topWatchCandidates[0]?.blockers.includes("candidate invalidated"));
});

test("helper does not mutate input", () => {
  const input = baseInput();
  const before = JSON.stringify(input);

  evaluateRegimeAwareExactCandidateWatchlist(input);

  assert.equal(JSON.stringify(input), before);
});
