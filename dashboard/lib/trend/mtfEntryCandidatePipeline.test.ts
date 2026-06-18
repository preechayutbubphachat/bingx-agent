// dashboard/lib/trend/mtfEntryCandidatePipeline.test.ts
// Run: node --test --experimental-strip-types lib/trend/mtfEntryCandidatePipeline.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { evaluateMtfEntryCandidatePipeline } from "./mtfEntryCandidatePipeline.ts";

function exact(over = {}) {
  return {
    schemaVersion: 1,
    sampleTier: "EARLY_PATTERN_50_TO_99",
    exactSamples: 75,
    heuristicSamples: 83,
    exactAvgNetRR: 6.19,
    heuristicAvgNetRR: 1.71,
    avgExactVsHeuristicDelta: 4.87,
    exactPassCount: 75,
    exactPassRate: 1,
    exactDataStatusCounts: { EXACT_ZONE_CONFLICT: 75 },
    exactReadinessCounts: { TARGET_TOO_CLOSE: 50, COST_TOO_HIGH: 3, CONFLICTING_MTF: 4 },
    usesExactObFvgZonesCount: 75,
    fillResolutionInputSamples: 64,
    fillResolutionInputMissing: 11,
    fillResolutionGeometryReadyCount: 64,
    dominantExactStatus: "EXACT_ZONE_CONFLICT",
    dominantExactReadiness: "TARGET_TOO_CLOSE",
    fillResolution: {
      status: "PARTIAL",
      totalResolvable: 64,
      filled: 21,
      missed: 43,
      pending: 11,
      invalidationFirst: 20,
      missedFillRate: 0.6719,
    },
    warningFlags: ["HIGH_TARGET_TOO_CLOSE_RATE", "HIGH_MISSED_FILL_RATE", "REVIEW_NOT_ACTIVATION"],
    rrMetricScope: "TOP_CLEAN_CANDIDATE",
    readinessMetricScope: "AGGREGATE_WORST_OF_ALL_ZONES",
    conflictLabelNote: "exact-zone conflict aggregate",
    conflictBreakdown: {
      TARGET_TOO_CLOSE: 50,
      COST_TOO_HIGH: 3,
      CONFLICTING_MTF: 4,
      other: {},
    },
    readiness: "WARNING_DEGRADED",
    source: "EXACT_ZONE_COMPARISON_SUMMARY_V1",
    ...over,
  };
}

function shadowBucket(over = {}) {
  return {
    totalSetups: 75,
    geometryReady: 64,
    noGeometry: 11,
    pending: 11,
    insufficientFutureCandles: 0,
    entryNotReached: 0,
    invalidationFirst: 0,
    entryTouched: 21,
    entryTouchRate: 0.28,
    entryNotReachedRate: 0,
    invalidationFirstRate: 0,
    targetAfterEntryTouchRate: 0,
    invalidationAfterEntryTouchRate: 0.9524,
    timeoutAfterEntryTouchRate: 0.0476,
    ...over,
  };
}

function shadow(over = {}) {
  return {
    shadowOutcomes: shadowBucket(),
    splitByCanonicalRegime: {},
    splitByPriceVsGrid: {},
    splitByDynamicGridStatus: {},
    settings: { entryLookahead: 12, exitLookahead: 48 },
    ...over,
  };
}

function input(over = {}) {
  return {
    currentPriceContext: {
      currentPrice: 101.5,
      priceSource: "market_snapshot.15m.close",
      latestCandleAt: "2026-06-18T10:00:00.000Z",
      snapshotGeneratedAt: "2026-06-18T10:01:00.000Z",
      evaluatedAt: "2026-06-18T10:05:00.000Z",
      timeframe: "15m",
      previousAnalysisPrice: 101,
    },
    canonicalMarketRegime: {
      regime: "DOWNTREND",
      direction: "BEARISH",
      confidence: 82,
      reasons: ["HTF downtrend"],
      warnings: [],
    },
    trendStrategy: {
      direction: "SHORT",
      status: "SETUP_READY",
      reasons: ["pullback setup"],
      warnings: [],
    },
    trendPaperExecutionPreflight: {
      status: "NOT_READY",
      direction: "SHORT",
      entry: 100,
      stopLoss: 103,
      takeProfit1: 94,
      rewardRisk: 2,
      failedInputs: ["operator_arm_missing"],
      notes: [],
    },
    mtfObFvgShadowSummary: { available: true, totalShadowSamples: 75 },
    exactZoneComparisonSummary: exact(),
    shadowOutcomeSummary: shadow(),
    shadowOutcomeQualityGate: {
      status: "WARNING_DEGRADED",
      metrics: {
        entryTouched: 21,
        targetAfterEntryTouchRate: 0,
        invalidationAfterEntryTouchRate: 0.9524,
      },
      warnings: ["TARGET_NOT_OUTPERFORMING_INVALIDATION"],
    },
    shadowEvidenceCoverage: { status: "NOT_READY" },
    noTradeReasonAnalysis: { status: "BLOCKED", primaryReason: { code: "operator_arm_missing" } },
    reviewReadinessScore: { overallStatus: "NOT_READY" },
    ...over,
  };
}

test("current-runtime-like fixture is promising geometry but execution not ready", () => {
  const result = evaluateMtfEntryCandidatePipeline(input());

  assert.equal(result.schemaVersion, 1);
  assert.equal(result.source, "MTF_ENTRY_CANDIDATE_PIPELINE_V1");
  assert.equal(result.activationAllowed, false);
  assert.equal(result.paperActivationAllowed, false);
  assert.equal(result.liveActivationAllowed, false);
  assert.equal(result.reviewOnly, true);
  assert.equal(result.shadowOnly, true);
  assert.notEqual(result.status, "REVIEW_READY");
  assert.equal(result.status, "WARNING_DEGRADED");
  assert.equal(result.zoneCandidate.exactSamples, 75);
  assert.equal(result.zoneCandidate.requiredExactSamples, 100);
  assert.equal(result.zoneCandidate.samplesRemaining, 25);
  assert.equal(result.zoneCandidate.exactAvgNetRR, 6.19);
  assert.equal(result.zoneCandidate.heuristicAvgNetRR, 1.71);
  assert.equal(result.zoneCandidate.exactVsHeuristicDelta, 4.87);
  assert.equal(result.zoneCandidate.status, "TARGET_TOO_CLOSE");
  assert.equal(result.triggerReview.status, "INVALIDATION_DOMINATES");
  assert.equal(result.geometry.status, "WARNING_DEGRADED");
  assert.equal(result.currentPriceContext.freshnessStatus, "FRESH");
  assert.equal(result.currentPriceContext.reevaluationRequired, false);
  assert.equal(result.currentCandidateReevaluation.status, "CURRENT_PRICE_CONFIRMED");
  assert.equal(result.verdict.status, "PROMISING_GEOMETRY_BUT_EXECUTION_NOT_READY");
  assert.match(result.verdict.summary, /execution outcome/i);
  assert.ok(result.verdict.blockers.some((b) => b.includes("75/100")));
  assert.ok(result.verdict.blockers.some((b) => b.includes("TARGET_TOO_CLOSE")));
  assert.ok(result.verdict.blockers.some((b) => b.includes("Missed fill rate")));
  assert.ok(result.verdict.blockers.some((b) => b.includes("target ชนะ invalidation")));
});

test("missing current price requires stale re-evaluation and blocks review ready", () => {
  const result = evaluateMtfEntryCandidatePipeline(input({
    currentPriceContext: {
      currentPrice: null,
      priceSource: null,
      latestCandleAt: "2026-06-18T10:00:00.000Z",
      snapshotGeneratedAt: "2026-06-18T10:01:00.000Z",
      evaluatedAt: "2026-06-18T10:05:00.000Z",
      timeframe: "15m",
      previousAnalysisPrice: 100,
    },
  }));

  assert.equal(result.status, "STALE_REEVALUATION_REQUIRED");
  assert.equal(result.currentPriceContext.freshnessStatus, "MISSING");
  assert.equal(result.currentPriceContext.reevaluationRequired, true);
  assert.equal(result.currentCandidateReevaluation.status, "STALE_REEVALUATION_REQUIRED");
  assert.notEqual(result.verdict.status, "REVIEW_READY_NOT_ACTIVATION");
  assert.equal(result.verdict.nextAction, "refresh_market_snapshot_or_wait_for_latest_runtime_cycle");
  assert.equal(result.activationAllowed, false);
});

test("stale latest candle requires re-evaluation before using candidate verdict", () => {
  const result = evaluateMtfEntryCandidatePipeline(input({
    currentPriceContext: {
      currentPrice: 100.8,
      priceSource: "market_snapshot.15m.close",
      latestCandleAt: "2026-06-18T09:00:00.000Z",
      snapshotGeneratedAt: "2026-06-18T09:01:00.000Z",
      evaluatedAt: "2026-06-18T10:05:00.000Z",
      timeframe: "15m",
      previousAnalysisPrice: 100,
    },
    trendPaperExecutionPreflight: {
      status: "NOT_READY",
      direction: "SHORT",
      entry: 100,
      stopLoss: 120,
      takeProfit1: 94,
      rewardRisk: 2,
      failedInputs: ["operator_arm_missing"],
      notes: [],
    },
  }));

  assert.equal(result.status, "STALE_REEVALUATION_REQUIRED");
  assert.equal(result.currentPriceContext.freshnessStatus, "STALE");
  assert.equal(result.currentPriceContext.reevaluationRequired, true);
  assert.equal(result.currentCandidateReevaluation.status, "STALE_REEVALUATION_REQUIRED");
  assert.equal(result.verdict.nextAction, "refresh_market_snapshot_or_wait_for_latest_runtime_cycle");
});

test("material price move from prior analysis is flagged before confidence is reused", () => {
  const result = evaluateMtfEntryCandidatePipeline(input({
    currentPriceContext: {
      currentPrice: 107,
      priceSource: "market_snapshot.15m.close",
      latestCandleAt: "2026-06-18T10:00:00.000Z",
      snapshotGeneratedAt: "2026-06-18T10:01:00.000Z",
      evaluatedAt: "2026-06-18T10:05:00.000Z",
      timeframe: "15m",
      previousAnalysisPrice: 100,
    },
    trendPaperExecutionPreflight: {
      status: "NOT_READY",
      direction: "SHORT",
      entry: 100,
      stopLoss: 120,
      takeProfit1: 94,
      rewardRisk: 2,
      failedInputs: ["operator_arm_missing"],
      notes: [],
    },
  }));

  assert.equal(result.currentPriceContext.freshnessStatus, "FRESH");
  assert.equal(result.currentCandidateReevaluation.status, "PRICE_MOVED_FROM_PRIOR_ANALYSIS");
  assert.equal(result.currentCandidateReevaluation.priceMovePct, 7);
  assert.equal(result.status, "WARNING_DEGRADED");
  assert.notEqual(result.verdict.status, "REVIEW_READY_NOT_ACTIVATION");
});

test("sample accounting uses lifetime exact samples for review progress when available", () => {
  const result = evaluateMtfEntryCandidatePipeline(input({
    sampleAccounting: {
      lifetimeExactSamples: 75,
      windowExactSamples: 70,
    },
    exactZoneComparisonSummary: exact({ exactSamples: 70 }),
  }));

  assert.equal(result.sampleAccounting.lifetimeExactSamples, 75);
  assert.equal(result.sampleAccounting.windowExactSamples, 70);
  assert.equal(result.sampleAccounting.reviewSamplesUsed, 75);
  assert.equal(result.sampleAccounting.reviewSamplesRemaining, 25);
  assert.equal(result.sampleAccounting.sampleSource, "LIFETIME_CUMULATIVE");
  assert.equal(result.sampleAccounting.isMonotonicExpected, true);
  assert.equal(result.sampleAccounting.canDecrease, false);
});

test("window-only exact samples are labeled as rolling and may decrease", () => {
  const result = evaluateMtfEntryCandidatePipeline(input({
    exactZoneComparisonSummary: exact({ exactSamples: 70 }),
  }));

  assert.equal(result.sampleAccounting.lifetimeExactSamples, null);
  assert.equal(result.sampleAccounting.windowExactSamples, 70);
  assert.equal(result.sampleAccounting.reviewSamplesUsed, 70);
  assert.equal(result.sampleAccounting.reviewSamplesRemaining, 30);
  assert.equal(result.sampleAccounting.sampleSource, "ROLLING_WINDOW");
  assert.equal(result.sampleAccounting.canDecrease, true);
  assert.ok(result.sampleAccounting.warnings.some((warning) => /rolling window can decrease/i.test(warning)));
});

test("current-price eligible exact samples are separate from review progress", () => {
  const result = evaluateMtfEntryCandidatePipeline(input({
    sampleAccounting: {
      lifetimeExactSamples: 100,
      windowExactSamples: 70,
      currentPriceEligibleExactSamples: 12,
    },
    exactZoneComparisonSummary: exact({ exactSamples: 70 }),
  }));

  assert.equal(result.sampleAccounting.reviewSamplesUsed, 100);
  assert.equal(result.sampleAccounting.reviewSamplesRemaining, 0);
  assert.equal(result.sampleAccounting.currentPriceEligibleExactSamples, 12);
  assert.equal(result.sampleAccounting.sampleSource, "LIFETIME_CUMULATIVE");
  assert.equal(result.activationAllowed, false);
});

test("no data fixture returns NO_CANDIDATE without throwing", () => {
  const result = evaluateMtfEntryCandidatePipeline({});
  assert.equal(result.status, "NO_CANDIDATE");
  assert.equal(result.verdict.status, "NO_CANDIDATE");
  assert.equal(result.zoneCandidate.status, "NO_EXACT_ZONE");
  assert.equal(result.triggerReview.status, "NO_TRIGGER");
  assert.equal(result.geometry.status, "NO_GEOMETRY");
  assert.equal(result.activationAllowed, false);
});

test("falls back to mtfObFvgShadowSummary exact fields when exact comparison is absent", () => {
  const result = evaluateMtfEntryCandidatePipeline(input({
    exactZoneComparisonSummary: null,
    mtfObFvgShadowSummary: {
      available: true,
      exactZoneSamples: 75,
      exactAvgNetRR: 6.1932,
      exactVsHeuristicAvgDelta: 4.8687,
      usesExactObFvgZonesCount: 75,
      exactZoneDataStatusCounts: { EXACT_ZONE_CONFLICT: 75 },
      exactZoneReadinessCounts: { TARGET_TOO_CLOSE: 50 },
      fillResolutionInputSamples: 64,
      fillResolutionGeometryReadyCount: 64,
    },
  }));

  assert.equal(result.zoneCandidate.exactSamples, 75);
  assert.equal(result.zoneCandidate.samplesRemaining, 25);
  assert.equal(result.zoneCandidate.exactAvgNetRR, 6.1932);
  assert.equal(result.zoneCandidate.exactVsHeuristicDelta, 4.8687);
  assert.notEqual(result.zoneCandidate.status, "NO_EXACT_ZONE");
  assert.equal(result.activationAllowed, false);
});

test("100+ exact samples with invalidation dominance is not review ready", () => {
  const result = evaluateMtfEntryCandidatePipeline(input({
    exactZoneComparisonSummary: exact({
      exactSamples: 120,
      sampleTier: "REVIEW_ELIGIBLE_100_PLUS",
      exactReadinessCounts: { TARGET_TOO_CLOSE: 10 },
      conflictBreakdown: { TARGET_TOO_CLOSE: 10, COST_TOO_HIGH: 0, CONFLICTING_MTF: 0, other: {} },
      warningFlags: ["HIGH_MISSED_FILL_RATE", "REVIEW_NOT_ACTIVATION"],
    }),
  }));

  assert.notEqual(result.status, "REVIEW_READY");
  assert.equal(result.verdict.status, "INVALIDATION_DOMINATES_AFTER_TOUCH");
  assert.equal(result.liveActivationAllowed, false);
});

test("100+ clean outcomes can be review ready but never activation ready", () => {
  const result = evaluateMtfEntryCandidatePipeline(input({
    exactZoneComparisonSummary: exact({
      exactSamples: 130,
      sampleTier: "REVIEW_ELIGIBLE_100_PLUS",
      exactReadinessCounts: { EXACT_ZONE_READY: 130 },
      dominantExactStatus: "EXACT_ZONE_AVAILABLE",
      dominantExactReadiness: "EXACT_ZONE_READY",
      fillResolution: { status: "RESOLVED", totalResolvable: 130, filled: 122, missed: 8, pending: 0, invalidationFirst: 2, missedFillRate: 0.0615 },
      conflictBreakdown: { TARGET_TOO_CLOSE: 2, COST_TOO_HIGH: 0, CONFLICTING_MTF: 0, other: {} },
      warningFlags: ["REVIEW_NOT_ACTIVATION"],
      readiness: "REVIEW_ELIGIBLE",
    }),
    shadowOutcomeSummary: shadow({
      shadowOutcomes: shadowBucket({
        totalSetups: 130,
        geometryReady: 130,
        noGeometry: 0,
        pending: 0,
        entryTouched: 36,
        entryTouchRate: 0.2769,
        targetAfterEntryTouchRate: 0.58,
        invalidationAfterEntryTouchRate: 0.22,
        timeoutAfterEntryTouchRate: 0.2,
      }),
    }),
  }));

  assert.equal(result.status, "REVIEW_READY");
  assert.equal(result.verdict.status, "REVIEW_READY_NOT_ACTIVATION");
  assert.equal(result.activationAllowed, false);
  assert.equal(result.paperActivationAllowed, false);
  assert.equal(result.liveActivationAllowed, false);
  assert.equal(result.reviewOnly, true);
  assert.equal(result.shadowOnly, true);
});

test("helper does not mutate the input", () => {
  const fixture = input();
  const before = JSON.stringify(fixture);
  evaluateMtfEntryCandidatePipeline(fixture);
  assert.equal(JSON.stringify(fixture), before);
});

test("safety literals remain false across all branches", () => {
  const cases = [
    {},
    input(),
    input({ exactZoneComparisonSummary: exact({ exactSamples: 120 }) }),
  ];
  for (const c of cases) {
    const result = evaluateMtfEntryCandidatePipeline(c);
    assert.equal(result.activationAllowed, false);
    assert.equal(result.paperActivationAllowed, false);
    assert.equal(result.liveActivationAllowed, false);
    assert.equal(result.reviewOnly, true);
    assert.equal(result.shadowOnly, true);
  }
});
