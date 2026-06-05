import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateTrendStrategy, buildTrendPaperEpoch, type TrendStrategyInput } from "./trendStrategy.ts";

const downInput: TrendStrategyInput = {
  canonicalMarketRegime: {
    regime: "DOWNTREND",
    direction: "BEARISH",
    confidence: 80,
    confidenceLabel: "high",
    reasons: ["trend_down_confirmed_by_indicators"],
    warnings: [],
    allowedModes: ["NO_TRADE", "TREND_CHECK"],
    blockedModes: ["NEUTRAL_GRID", "DYNAMIC_NEUTRAL_GRID", "PHASE_2B_ACTIVATION"],
    sourcePriority: ["market_snapshot.klines"],
    ignoredLegacyFields: ["latest_decision.market_mode"],
    sourceFreshness: { status: "fresh", generatedAt: null, latestCandleAtByTimeframe: {}, warnings: [] },
    evidenceCompleteness: { status: "partial", scorePct: 80, availableGroups: ["multi_timeframe_indicators"], missingGroups: [] },
    shadowOnly: true,
    paperActivationAllowed: false,
    liveActivationAllowed: false,
  },
  indicatorGate: {
    status: "TREND_DOWN_BLOCK",
    reasons: ["trend_down_confirmed"],
    passed: [],
    failed: [],
    confidence: "high",
    blocking: true,
    paperActivationAllowed: false,
    liveActivationAllowed: false,
  },
  trendZoneCandidate: {
    buildStatus: "READY",
    dir: "DOWN",
    pullbackZone: [65000, 66000],
    invalidation: 67000,
    triggerRule: "wait_5m_confirm",
    targets: { t1: 63500, t2: 62000 },
    entry: { type: "CONFIRM", hint: "wait" },
    smc: { swingHigh1h: 67000, swingLow1h: 63500, eq1h: 65250, liquidityNote: null },
    warnings: [],
    shadowOnly: true,
    paperActivationAllowed: false,
    liveActivationAllowed: false,
  },
  multiTimeframeIndicatorEvidence: {},
  currentPrice: 63580,
  priceVsGrid: "BELOW_GRID",
  session: "ASIA",
  derivatives: null,
  obGate: null,
  oldGridExposure: { buyFillCount: 14, sellFillCount: 0 },
  freshness: { stale: false },
};

function withPrice(currentPrice: number): TrendStrategyInput {
  return { ...downInput, currentPrice };
}

test("DOWNTREND price near target returns no-trade near-target and never activates", () => {
  const strategy = evaluateTrendStrategy(downInput);

  assert.equal(strategy.enabled, false);
  assert.equal(strategy.phase, "T-1_SHADOW");
  assert.equal(strategy.direction, "SHORT");
  assert.equal(strategy.status, "NO_TRADE");
  assert.equal(strategy.riskStatus, "NO_TRADE_NEAR_TARGET");
  assert.equal(strategy.setupReason, "price_already_near_target_do_not_chase");
  assert.equal(strategy.paperActivationAllowed, false);
  assert.equal(strategy.liveActivationAllowed, false);
  assert.equal(strategy.oldExposurePolicy, "QUARANTINE_OLD_GRID_EXPOSURE");
  assert.equal(strategy.countTowardGridClosedCycles, false);
  assert.equal(strategy.countTowardTrendEvidence, false);
});

test("DOWNTREND below pullback zone but not near target watches pullback", () => {
  const strategy = evaluateTrendStrategy(withPrice(64500));

  assert.equal(strategy.direction, "SHORT");
  assert.equal(strategy.status, "WATCHING_PULLBACK");
  assert.equal(strategy.riskStatus, "PASS");
  assert.equal(strategy.confirmationRequired, true);
  assert.equal(strategy.confirmationStatus, "WAITING_5M_CONFIRM");
});

test("DOWNTREND inside pullback zone awaits confirmation", () => {
  const strategy = evaluateTrendStrategy(withPrice(65500));

  assert.equal(strategy.status, "AWAITING_CONFIRMATION");
  assert.equal(strategy.confirmationRequired, true);
  assert.equal(strategy.confirmationStatus, "WAITING_5M_CONFIRM");
  assert.equal(strategy.distanceToEntryZonePct, 0);
});

test("DOWNTREND above invalidation is invalidated", () => {
  const strategy = evaluateTrendStrategy(withPrice(67100));

  assert.equal(strategy.status, "INVALIDATED");
  assert.equal(strategy.riskStatus, "PASS");
});

test("UPTREND mirror watches, awaits, invalidates, and no-chases near target", () => {
  const up: TrendStrategyInput = {
    ...downInput,
    canonicalMarketRegime: { ...downInput.canonicalMarketRegime!, regime: "UPTREND", direction: "BULLISH" },
    indicatorGate: { ...downInput.indicatorGate!, status: "RANGE_WATCH" },
    trendZoneCandidate: {
      ...downInput.trendZoneCandidate!,
      dir: "UP",
      pullbackZone: [64000, 65000],
      invalidation: 63000,
      targets: { t1: 66500, t2: 68000 },
    },
    currentPrice: 66350,
  };

  assert.equal(evaluateTrendStrategy(up).riskStatus, "NO_TRADE_NEAR_TARGET");
  assert.equal(evaluateTrendStrategy({ ...up, currentPrice: 65500 }).status, "WATCHING_PULLBACK");
  assert.equal(evaluateTrendStrategy({ ...up, currentPrice: 64500 }).status, "AWAITING_CONFIRMATION");
  assert.equal(evaluateTrendStrategy({ ...up, currentPrice: 62900 }).status, "INVALIDATED");
});

test("missing trend zone candidate returns no-trade", () => {
  const strategy = evaluateTrendStrategy({ ...downInput, trendZoneCandidate: null });

  assert.equal(strategy.status, "NO_TRADE");
  assert.equal(strategy.riskStatus, "PASS");
  assert.ok(strategy.reasons.includes("missing_trend_zone_candidate"));
  assert.equal(strategy.paperActivationAllowed, false);
  assert.equal(strategy.liveActivationAllowed, false);
});

test("bad reward risk is rejected", () => {
  const strategy = evaluateTrendStrategy({
    ...downInput,
    currentPrice: 65500,
    trendZoneCandidate: {
      ...downInput.trendZoneCandidate!,
      pullbackZone: [65000, 66000],
      invalidation: 70000,
      targets: { t1: 64800, t2: null },
    },
  });

  assert.equal(strategy.status, "RISK_REJECTED");
  assert.equal(strategy.riskStatus, "NO_TRADE_BAD_RR");
  assert.ok((strategy.rewardRisk ?? 0) < 1.2);
});

test("trend paper epoch is separated from grid evidence", () => {
  const strategy = evaluateTrendStrategy(downInput);
  const epoch = buildTrendPaperEpoch(strategy);

  assert.match(epoch.epochId, /^trend-shadow:/);
  assert.equal(epoch.source, "TREND_STRATEGY");
  assert.equal(epoch.phase, "T-1_SHADOW");
  assert.equal(epoch.oldGridExposurePolicy, "QUARANTINE_OLD_GRID_EXPOSURE");
  assert.equal(epoch.countTowardGridClosedCycles, false);
  assert.equal(epoch.countTowardTrendEvidence, false);
});
