// Unit tests for paper-loop diagnostics (Part F observability builder).
// Runner-agnostic: node:test + node:assert.

import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPaperLoopDiagnostics } from "./paperLoopDiagnostics.ts";
import type { PaperJournalSummary, PaperEventSummary } from "../readPaperJournal.ts";
import { buildRegimeEvidence } from "./regimeEvidence.ts";

function ev(p: Partial<PaperEventSummary>): PaperEventSummary {
  return {
    ts: 0, type: "NO_TRADE_DECISION", symbol: "BTC-USDT", mode: "PAPER",
    strategyMode: null, regime: null, session: null, gridSpacingPct: null,
    gridLower: null, gridUpper: null, gridMid: null, currentPrice: null,
    eventTs: null, paperModeDetected: true, noTradeReason: null, schemaVersion: null,
    eventKey: null, orderId: null, orderStatus: null, filledQuantity: null,
    averageFillPrice: null, side: null, quantity: null, kind: null,
    liveOrder: false, source: "paper_audit_log", ...p,
  };
}

function summary(p: Partial<PaperJournalSummary>): PaperJournalSummary {
  return {
    status: "has_data" as PaperJournalSummary["status"], totalPaperEvents: 0,
    totalOrderSimulated: 0, totalOrderFilled: 0, buyFillCount: 0, sellFillCount: 0,
    totalOrderCanceled: 0, totalOrderRejected: 0, openPaperOrders: 0,
    lastPaperEventAt: null, lastPaperEventType: null, lastPaperMode: null,
    paperModeDetected: true, auditFilesScanned: 1, auditRootDir: "/tmp", warnings: [],
    checkedAt: "now", recentEvents: [], ...p,
  };
}

test("below-grid no-trade → priceVsGrid BELOW_GRID + state REGRID_REQUIRED", () => {
  const d = buildPaperLoopDiagnostics(summary({
    buyFillCount: 1316, sellFillCount: 0, lastPaperEventAt: "t1",
    recentEvents: [
      ev({ gridLower: 72480, gridUpper: 78053, gridMid: 75266, currentPrice: 66849, noTradeReason: "price_below_grid_lower", strategyMode: "GRID_NEUTRAL" }),
      ev({ noTradeReason: "price_below_grid_lower" }),
    ],
  }));
  assert.equal(d.rawBuyFillCount, 1316);
  assert.equal(d.rawSellFillCount, 0);
  assert.equal(d.priceVsGrid, "BELOW_GRID");
  assert.equal(d.paperLoopState, "REGRID_REQUIRED");
  assert.equal(d.lastNoTradeReason, "price_below_grid_lower");
  assert.equal(d.noTradeReasonCounts["price_below_grid_lower"], 2);
  assert.equal(d.dynamicGrid.enabled, true);
  // Phase 1 read-only candidate: forms when out of grid, but never activates
  assert.notEqual(d.dynamicGrid.candidate.candidateStatus, "INACTIVE");
  assert.equal(d.dynamicGrid.candidate.activationAllowed, false);
});

test("stale reason → paperLoopState STALE_DATA", () => {
  const d = buildPaperLoopDiagnostics(summary({
    recentEvents: [ev({ currentPrice: 66849, gridLower: 72480, gridUpper: 78053, noTradeReason: "stale_decision_or_price_mismatch" })],
  }));
  assert.equal(d.paperLoopState, "STALE_DATA");
  assert.equal(d.lastNoTradeReason, "stale_decision_or_price_mismatch");
});

test("exposure reason → PAUSE_EXPOSURE_LIMIT", () => {
  const d = buildPaperLoopDiagnostics(summary({
    buyFillCount: 9, sellFillCount: 0,
    recentEvents: [ev({ currentPrice: 74000, gridLower: 72480, gridUpper: 78053, noTradeReason: "one_sided_buy_limit" })],
  }));
  assert.equal(d.paperLoopState, "PAUSE_EXPOSURE_LIMIT");
});

test("empty journal → safe defaults, no throw", () => {
  const d = buildPaperLoopDiagnostics(summary({ recentEvents: [] }));
  assert.equal(d.priceVsGrid, "UNKNOWN");
  assert.equal(d.lastNoTradeReason, null);
  assert.equal(d.dynamicGrid.enabled, false);
});

test("runtime monitor PASS when activation is blocked and safety journals advance after fills", () => {
  const d = buildPaperLoopDiagnostics(
    summary({
      buyFillCount: 14, sellFillCount: 0, lastPaperEventAt: "2026-06-04T01:00:00.000Z",
      recentEvents: [
        ev({ gridLower: 72480, gridUpper: 78053, gridMid: 75266, currentPrice: 66849, noTradeReason: "price_below_grid_lower" }),
      ],
    }),
    {
      cumulativeBuyFillCount: 1460,
      cumulativeSellFillCount: 0,
      paperNoTradeCount: 122,
      regridCandidateCount: 75,
      latestFillAt: "2026-06-04T00:50:00.000Z",
      latestNoTradeAt: "2026-06-04T01:00:00.000Z",
      latestRegridCandidateAt: "2026-06-04T01:01:00.000Z",
    }
  );

  assert.equal(d.runtimeMonitor.cumulativeBuyFillCount, 1460);
  assert.equal(d.runtimeMonitor.cumulativeSellFillCount, 0);
  assert.equal(d.runtimeMonitor.sampleBuyFillCount, 14);
  assert.equal(d.runtimeMonitor.sampleSellFillCount, 0);
  assert.equal(d.runtimeMonitor.paperNoTradeCount, 122);
  assert.equal(d.runtimeMonitor.regridCandidateCount, 75);
  assert.equal(d.runtimeMonitor.activationAllowed, false);
  assert.equal(d.runtimeMonitor.buyCountStable, true);
  assert.equal(d.runtimeMonitor.noTradeIncreasing, true);
  assert.equal(d.runtimeMonitor.regridCandidateIncreasing, true);
  assert.equal(d.runtimeMonitor.monitorStatus, "PASS");
  assert.equal(d.runtimeMonitor.priceVsGrid, "BELOW_GRID");
  assert.equal(d.runtimeMonitor.paperLoopState, "REGRID_REQUIRED");
  assert.equal(d.runtimeMonitor.monitorSummary, "STABLE_RUNTIME_PASS");
  assert.equal(d.regridReadiness.paperActivationAllowed, false);
  assert.equal(d.regridReadiness.liveActivationAllowed, false);
  assert.equal(d.paperEpoch.previousEpochStatus, "OPEN_ONE_SIDED_EXPOSURE");
  assert.ok(d.paperEpoch.oldExposurePolicy.includes("DO_NOT_FORCE_SELL"));
});

test("runtime monitor WATCH when a fill is newer than no-trade while out of grid", () => {
  const d = buildPaperLoopDiagnostics(
    summary({
      buyFillCount: 1, sellFillCount: 0,
      recentEvents: [
        ev({ gridLower: 72480, gridUpper: 78053, currentPrice: 66849, noTradeReason: "price_below_grid_lower" }),
      ],
    }),
    {
      cumulativeBuyFillCount: 1461,
      cumulativeSellFillCount: 0,
      paperNoTradeCount: 122,
      regridCandidateCount: 75,
      latestFillAt: "2026-06-04T01:05:00.000Z",
      latestNoTradeAt: "2026-06-04T01:00:00.000Z",
      latestRegridCandidateAt: "2026-06-04T01:01:00.000Z",
    }
  );

  assert.equal(d.runtimeMonitor.buyCountStable, false);
  assert.equal(d.runtimeMonitor.monitorStatus, "WATCH");
});

test("regime evidence is exposed additively when upstream evidence is provided", () => {
  const regimeEvidence = buildRegimeEvidence({
    decision: { market_mode: "GRID_NEUTRAL", regime: "RANGE" },
    marketSnapshot: {},
    planStatusState: null,
    sourceInfo: null,
  });
  const d = buildPaperLoopDiagnostics(
    summary({ recentEvents: [] }),
    null,
    { regimeEvidence }
  );

  assert.equal(d.regimeEvidence.decision.marketMode, "GRID_NEUTRAL");
  assert.equal(d.regimeEvidence.decision.regime, "RANGE");
  assert.equal(d.regimeEvidence.indicators.adx.value, null);
  assert.equal(d.regimeEvidence.indicators.adx.source, "missing");
});

test("indicator gate is shadow-only and does not change regrid readiness", () => {
  const regimeEvidence = buildRegimeEvidence({
    decision: { market_mode: "GRID_NEUTRAL", regime: "RANGE" },
    marketSnapshot: {},
    planStatusState: null,
    sourceInfo: null,
    indicatorEvidence: {
      adx: 35.44,
      plusDI: 14.7,
      minusDI: 29.43,
      rsi: 40.51,
      atr: 480,
      atrPct: 0.75,
      bbw: 0.03,
      macd: -248.06,
      macdSignal: -155.97,
      macdHistogram: -92.09,
      emaSlope: -104.55,
      source: "market_snapshot",
      calculatedAt: "2026-06-05T00:00:00.000Z",
      candleCount: 120,
      timeframe: "15m",
      freshness: { latestCandleAt: "2026-06-05T00:00:00.000Z", ageMs: 60_000 },
      missingFields: [],
      notes: [],
    },
  });
  const d = buildPaperLoopDiagnostics(
    summary({
      buyFillCount: 14,
      sellFillCount: 0,
      recentEvents: [
        ev({ gridLower: 72480, gridUpper: 78053, gridMid: 75266, currentPrice: 63598.5, noTradeReason: "price_below_grid_lower" }),
      ],
    }),
    null,
    { regimeEvidence }
  );

  assert.equal(d.indicatorGate.status, "TREND_DOWN_BLOCK");
  assert.equal(d.indicatorGate.blocking, true);
  assert.equal(d.indicatorGate.paperActivationAllowed, false);
  assert.equal(d.indicatorGate.liveActivationAllowed, false);
  assert.equal(d.regridReadiness.paperActivationAllowed, false);
  assert.equal(d.regridReadiness.liveActivationAllowed, false);
  assert.equal(d.regridReadiness.status, "NOT_READY");
  assert.ok(d.regridReadiness.failedGates.includes("stable_candles_pending"));
  assert.ok(d.regridReadiness.warnings.includes("closed_cycles_remain_zero_do_not_fake_edge"));
});

test("canonical regime gate enforcement uses after readiness as the active readiness", () => {
  const d = buildPaperLoopDiagnostics(
    summary({
      buyFillCount: 14,
      sellFillCount: 0,
      recentEvents: [
        ev({ gridLower: 72480, gridUpper: 78053, gridMid: 75266, currentPrice: 63598.5, noTradeReason: "price_below_grid_lower" }),
      ],
    }),
    null,
    {
      regimeEvidence: buildRegimeEvidence({
        decision: { market_mode: "TREND", regime: "DOWNTREND" },
        marketSnapshot: {},
        planStatusState: null,
        sourceInfo: null,
        indicatorEvidence: {
          adx: 35.44,
          plusDI: 14.7,
          minusDI: 29.43,
          rsi: 40.51,
          atr: 480,
          atrPct: 0.75,
          bbw: 0.03,
          macd: -248.06,
          macdSignal: -155.97,
          macdHistogram: -92.09,
          emaSlope: -104.55,
          source: "market_snapshot",
          calculatedAt: "2026-06-05T00:00:00.000Z",
          candleCount: 120,
          timeframe: "15m",
          freshness: { latestCandleAt: "2026-06-05T00:00:00.000Z", ageMs: 60_000 },
          missingFields: [],
          notes: [],
        },
      }),
      canonicalMarketRegime: {
        regime: "DOWNTREND",
        direction: "BEARISH",
        confidence: 66,
        confidenceLabel: "medium",
        reasons: ["trend_down_confirmed_by_indicators"],
        warnings: [],
        allowedModes: ["NO_TRADE", "TREND_CHECK"],
        blockedModes: ["NEUTRAL_GRID", "DYNAMIC_NEUTRAL_GRID", "PHASE_2B_ACTIVATION"],
        sourcePriority: ["market_snapshot.klines"],
        ignoredLegacyFields: ["latest_decision.market_mode"],
        sourceFreshness: {
          status: "fresh",
          generatedAt: "2026-06-05T00:00:00.000Z",
          latestCandleAtByTimeframe: { "15M": "2026-06-05T00:00:00.000Z" },
          warnings: [],
        },
        evidenceCompleteness: {
          status: "partial",
          scorePct: 60,
          availableGroups: ["multi_timeframe_indicators"],
          missingGroups: ["derivatives"],
        },
        shadowOnly: true,
        paperActivationAllowed: false,
        liveActivationAllowed: false,
      },
      multiTimeframeIndicatorEvidence: {},
    }
  );

  assert.equal(d.canonicalMarketRegime?.regime, "DOWNTREND");
  assert.equal(d.canonicalMarketRegime?.paperActivationAllowed, false);
  assert.equal(d.canonicalMarketRegime?.liveActivationAllowed, false);
  assert.equal(d.canonicalRegimeGate.status, "TREND_CHECK_REQUIRED");
  assert.equal(d.canonicalRegimeGate.blocking, true);
  assert.equal(d.canonicalRegimeGate.paperActivationAllowed, false);
  assert.equal(d.canonicalRegimeGate.liveActivationAllowed, false);
  assert.notStrictEqual(d.regridReadinessBeforeCanonicalGate, d.regridReadiness);
  assert.strictEqual(d.regridReadiness, d.regridReadinessAfterCanonicalGate);
  assert.equal(d.canonicalRegimeGateEnforcement.enabled, true);
  assert.equal(d.canonicalRegimeGateEnforcement.mode, "STRICTER_ONLY");
  assert.equal(d.canonicalRegimeGateEnforcement.activeReadinessSource, "regridReadinessAfterCanonicalGate");
  assert.equal(d.canonicalRegimeGateEnforcement.beforeStatus, d.regridReadinessBeforeCanonicalGate.status);
  assert.equal(d.canonicalRegimeGateEnforcement.afterStatus, d.regridReadiness.status);
  assert.equal(d.regridReadinessAfterCanonicalGate?.status, "NOT_READY");
  assert.equal(d.canonicalRegimeGateShadowCompare.changed, false);
  assert.equal(d.regridReadiness.status, "NOT_READY");
  assert.equal(d.regridReadiness.paperActivationAllowed, false);
  assert.equal(d.regridReadiness.liveActivationAllowed, false);
  assert.equal(d.canonicalRegimeGateEnforcement.paperActivationAllowed, false);
  assert.equal(d.canonicalRegimeGateEnforcement.liveActivationAllowed, false);
});

test("trend strategy shadow diagnostics are additive and never activate paper or live", () => {
  const d = buildPaperLoopDiagnostics(
    summary({
      buyFillCount: 14,
      sellFillCount: 0,
      recentEvents: [
        ev({ gridLower: 72480, gridUpper: 78053, gridMid: 75266, currentPrice: 63580, noTradeReason: "price_below_grid_lower" }),
      ],
    }),
    null,
    {
      regimeEvidence: buildRegimeEvidence({
        decision: { market_mode: "TREND", regime: "DOWNTREND" },
        marketSnapshot: {},
        planStatusState: null,
        sourceInfo: null,
        indicatorEvidence: {
          adx: 35.44,
          plusDI: 14.7,
          minusDI: 29.43,
          rsi: 40.51,
          atr: 480,
          atrPct: 0.75,
          bbw: 0.03,
          macd: -248.06,
          macdSignal: -155.97,
          macdHistogram: -92.09,
          emaSlope: -104.55,
          source: "market_snapshot",
          calculatedAt: "2026-06-05T00:00:00.000Z",
          candleCount: 120,
          timeframe: "15m",
          freshness: { latestCandleAt: "2026-06-05T00:00:00.000Z", ageMs: 60_000 },
          missingFields: [],
          notes: [],
        },
      }),
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
    },
  );

  assert.equal(d.trendStrategy.phase, "T-1_SHADOW");
  assert.equal(d.trendStrategy.direction, "SHORT");
  assert.equal(d.trendStrategy.status, "NO_TRADE");
  assert.equal(d.trendStrategy.riskStatus, "NO_TRADE_NEAR_TARGET");
  assert.equal(d.trendStrategy.paperActivationAllowed, false);
  assert.equal(d.trendStrategy.liveActivationAllowed, false);
  assert.equal(d.trendStrategy.countTowardGridClosedCycles, false);
  assert.equal(d.trendStrategy.countTowardTrendEvidence, false);
  assert.equal(d.trendPaperEpoch.source, "TREND_STRATEGY");
  assert.equal(d.trendPaperEpoch.countTowardGridClosedCycles, false);
});
