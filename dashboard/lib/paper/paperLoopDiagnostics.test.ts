// Unit tests for paper-loop diagnostics (Part F observability builder).
// Runner-agnostic: node:test + node:assert.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildEventRiskContextDiagnostic,
  enrichCostGateWithGridSpacing,
  buildPaperLoopDiagnostics,
  buildRegimeDiagnostic,
  buildRegimeTransitionDiagnostic,
  buildVolBaselineDiagnostic,
} from "./paperLoopDiagnostics.ts";
import type { PaperJournalSummary, PaperEventSummary } from "../readPaperJournal.ts";
import { buildRegimeEvidence } from "./regimeEvidence.ts";
import type { CanonicalMarketRegime } from "../market-regime/canonicalMarketRegime.ts";
import {
  evaluateHistoricalReplayCandidateScarcityReview,
  type HistoricalReplayCandidateScarcityReview,
  type HistoricalReplayPoint,
} from "../trend/historicalReplayCandidateScarcityReview.ts";
import { validateD8PointInTimeSnapshot } from "./d8PointInTimeSnapshot.ts";
import { validateD8SnapshotDiagnosticsInputRowShape } from "./d8SnapshotDiagnosticsInputExporter.ts";

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

function canonicalRegime(p: Partial<CanonicalMarketRegime> = {}): CanonicalMarketRegime {
  return {
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
    ...p,
  };
}

function historicalReplayPoint(index: number): HistoricalReplayPoint {
  return {
    evaluatedAt: new Date(Date.UTC(2026, 0, 1, 0, index * 5)).toISOString(),
    alignedContext: true,
    d8_0AlignedCandidate: true,
    rrReady: true,
    d8_2Status: "WAITING_FOR_TRIGGER_PRICE",
    triggerReached: false,
    d8_3Status: "NO_TOUCH_YET",
    zoneTouched: false,
    confirmationWindowActive: false,
    d8_4Status: "TOUCH_WINDOW_INACTIVE",
    confirmationAligned: false,
    promotableReviewCandidate: false,
    bottleneckStatus: "WAITING_FOR_PULLBACK_TRIGGER",
    triggerDistanceClass: "FAR",
    sourceSafetyValid: true,
    dataQualityValid: true,
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

test("paper evidence data quality exposes missing averageFillPrice as insufficient evidence", () => {
  const d = buildPaperLoopDiagnostics(summary({
    buyFillCount: 1,
    sellFillCount: 0,
    recentEvents: [
      ev({ type: "ORDER_FILLED", side: "BUY", averageFillPrice: null, gridSpacingPct: 0.4, strategyMode: "GRID", regime: "RANGE", session: "Asia" }),
    ],
  }));

  assert.equal(d.paperEvidenceDataQuality.qualityState, "INSUFFICIENT");
  assert.equal(d.paperEvidenceDataQuality.hasFillEvents, true);
  assert.equal(d.paperEvidenceDataQuality.hasAverageFillPrice, false);
  assert.ok(d.paperEvidenceDataQuality.missingFields.includes("averageFillPrice"));
  assert.equal(d.paperEvidenceDataQuality.activationAllowed, false);
});

test("paper evidence data quality separates stale latest decision as warning", () => {
  const d = buildPaperLoopDiagnostics(summary({
    recentEvents: [
      ev({ noTradeReason: "data_missing", gridSpacingPct: 0.4, strategyMode: "GRID", regime: "RANGE", session: "Asia" }),
    ],
  }), null, { latestDecisionFreshness: "STALE" });

  assert.ok(d.paperEvidenceDataQuality.warnings.includes("latest_decision_stale"));
  assert.doesNotMatch(d.paperEvidenceDataQuality.blockers.join(" "), /latest_decision_stale/);
  assert.equal(d.paperEvidenceDataQuality.paperActivationAllowed, false);
  assert.equal(d.paperEvidenceDataQuality.liveActivationAllowed, false);
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

test("G1 grid epoch context quarantines old exposure while evaluating current grid eligibility", () => {
  const regimeEvidence = buildRegimeEvidence({
    decision: { market_mode: "GRID_NEUTRAL", regime: "RANGE" },
    marketSnapshot: null,
    planStatusState: null,
    sourceInfo: null,
    indicatorEvidence: {
      source: "market_snapshot",
      calculatedAt: "2026-06-28T00:00:00.000Z",
      candleCount: 120,
      timeframe: "15M",
      freshness: { latestCandleAt: null, ageMs: 0 },
      missingFields: [],
      notes: [],
      adx: 16,
      plusDI: null,
      minusDI: null,
      rsi: null,
      atr: null,
      atrPct: 1.1,
      bbw: 3.2,
      macd: null,
      macdSignal: null,
      macdHistogram: null,
      emaSlope: null,
    },
  });
  const d = buildPaperLoopDiagnostics(
    summary({
      buyFillCount: 4,
      sellFillCount: 0,
      recentEvents: [
        ev({
          gridLower: 90,
          gridUpper: 110,
          gridMid: 100,
          currentPrice: 120,
          noTradeReason: "price_above_grid_upper",
          strategyMode: "GRID_NEUTRAL",
          regime: "RANGE",
        }),
      ],
    }),
    null,
    {
      canonicalMarketRegime: canonicalRegime({
        regime: "RANGE",
        direction: "NEUTRAL",
        sourceFreshness: { status: "fresh", generatedAt: null, latestCandleAtByTimeframe: {}, warnings: [] },
      }),
      regimeEvidence,
      costGate: { gridSpacingPct: 0.7, requiredMinSpacingPct: 0.5, pass: true },
    },
  );

  assert.equal(d.gridEpochContext.oldEpochStatus, "OBSOLETE_MARKET_CHANGED");
  assert.equal(d.gridEpochContext.currentGridEligibility, "GRID_REGIME_ELIGIBLE");
  assert.equal(d.gridEpochContext.freshGridCandidateReview.status, "CANDIDATE_REVIEW_READY");
  assert.notEqual(d.gridEpochContext.freshGridCandidateReview.candidateGridLower, 90);
  assert.notEqual(d.gridEpochContext.freshGridCandidateReview.candidateGridUpper, 110);
  assert.equal(d.gridEpochContext.activationAllowed, false);
  assert.equal(d.gridEpochContext.paperActivationAllowed, false);
  assert.equal(d.gridEpochContext.liveActivationAllowed, false);
});

test("CostGate spacing observability uses finite dynamicGrid spacing", () => {
  const costGate = enrichCostGateWithGridSpacing(
    {
      status: "unknown",
      roundTripCostPct: 0.09,
      gridSpacingPct: null,
      requiredMinSpacingPct: 0.225,
      pass: null,
      warning: "gridSpacingPct missing",
      nextAction: "add gridSpacingPct",
    },
    { dynamicGrid: { spacingPct: 0.72, candidate: { candidateSpacingPct: 0.61 } } },
  );

  assert.equal(costGate.gridSpacingPct, 0.72);
  assert.equal(costGate.gridSpacingSource, "dynamicGrid.spacingPct");
  assert.equal(costGate.status, "pass");
  assert.equal(costGate.pass, true);
  assert.equal(costGate.warning, null);
});

test("CostGate spacing observability falls back to candidate spacing", () => {
  const costGate = enrichCostGateWithGridSpacing(
    { status: "unknown", roundTripCostPct: 0.09, gridSpacingPct: null, requiredMinSpacingPct: 0.225, pass: null },
    { dynamicGrid: { spacingPct: null, candidate: { candidateSpacingPct: 0.44 } } },
  );

  assert.equal(costGate.gridSpacingPct, 0.44);
  assert.equal(costGate.gridSpacingSource, "candidateSpacingPct");
  assert.equal(costGate.status, "pass");
});

test("CostGate spacing observability preserves null when spacing is missing or non-finite", () => {
  const costGate = enrichCostGateWithGridSpacing(
    { status: "unknown", roundTripCostPct: 0.09, gridSpacingPct: null, requiredMinSpacingPct: 0.225, pass: null, warning: "gridSpacingPct missing" },
    { dynamicGrid: { spacingPct: Number.NaN, candidate: { candidateSpacingPct: Infinity } } },
  );

  assert.equal(costGate.gridSpacingPct, null);
  assert.equal(costGate.gridSpacingSource, null);
  assert.equal(costGate.status, "unknown");
  assert.equal(costGate.pass, null);
  assert.equal(costGate.warning, "gridSpacingPct missing");
});

test("CostGate spacing observability keeps strict existing spacing comparison", () => {
  const costGate = enrichCostGateWithGridSpacing(
    { status: "unknown", roundTripCostPct: 0.09, gridSpacingPct: null, requiredMinSpacingPct: 0.225, pass: null },
    { dynamicGrid: { spacingPct: 0.225 } },
  );

  assert.equal(costGate.gridSpacingPct, 0.225);
  assert.equal(costGate.status, "fail");
  assert.equal(costGate.pass, false);
});

test("OBS-01 decision regime null with canonical available is surfaced read-only", () => {
  const d = buildRegimeDiagnostic({
    canonicalMarketRegime: canonicalRegime(),
    latestCanonicalMarketRegimeDiagnostic: {
      regime: "DOWNTREND",
      direction: "BEARISH",
      confidence: 80,
      source: "canonicalMarketRegime",
      reasons: ["trend_down_confirmed_by_indicators"],
      computedAt: "2026-06-13T00:00:00.000Z",
      decisionRegime: null,
      decisionRegimeMismatch: false,
    },
  });

  assert.equal(d.regimeNullButCanonicalAvailable, true);
  assert.equal(d.status, "DECISION_REGIME_NULL_CANONICAL_AVAILABLE");
  assert.equal(d.paperActivationAllowed, false);
  assert.equal(d.liveActivationAllowed, false);
});

test("OBS-01 decision/canonical mismatch is explicit", () => {
  const d = buildRegimeDiagnostic({
    canonicalMarketRegime: canonicalRegime(),
    latestCanonicalMarketRegimeDiagnostic: {
      regime: "DOWNTREND",
      direction: "BEARISH",
      confidence: 80,
      decisionRegime: "RANGE",
      decisionRegimeMismatch: true,
    },
  });

  assert.equal(d.decisionRegimeMismatch, true);
  assert.equal(d.status, "MISMATCH");
});

test("OBS-01 matching decision/canonical regime is marked matched", () => {
  const d = buildRegimeDiagnostic({
    canonicalMarketRegime: canonicalRegime(),
    latestCanonicalMarketRegimeDiagnostic: {
      regime: "DOWNTREND",
      direction: "BEARISH",
      confidence: 80,
      decisionRegime: "DOWNTREND",
      decisionRegimeMismatch: false,
    },
  });

  assert.equal(d.status, "MATCHED");
  assert.equal(d.decisionRegimeMismatch, false);
});

test("OBS-01 missing canonical returns NO_CANONICAL_DATA", () => {
  const d = buildRegimeDiagnostic({});
  assert.equal(d.status, "NO_CANONICAL_DATA");
  assert.equal(d.canonicalRegime, null);
});

test("OBS-02 NORMAL vol state with insufficient baseline samples warns", () => {
  const snapshot = {
    volatility: {
      baseline: { samples_1h: 24 },
      required_points: { for_baseline_50: 50 },
      relative: { vol_state: "NORMAL", confidence: 0.85 },
    },
  };
  const before = JSON.stringify(snapshot);
  const d = buildVolBaselineDiagnostic(snapshot);

  assert.equal(d.baselineReadiness, "INSUFFICIENT");
  assert.equal(d.baselineSamples1h, 24);
  assert.equal(d.requiredBaselineSamples, 50);
  assert.equal(d.baselineProgressPct, 48);
  assert.equal(d.warning, "Vol state is NORMAL, but baseline is still building. Treat confidence cautiously.");
  assert.equal(JSON.stringify(snapshot), before);
});

test("OBS-02 ready baseline does not warn", () => {
  const d = buildVolBaselineDiagnostic({
    volatility: {
      baseline: { samples_1h: 50 },
      required_points: { for_baseline_50: 50 },
      relative: { vol_state: "NORMAL", confidence: 0.9 },
    },
  });

  assert.equal(d.baselineReadiness, "READY");
  assert.equal(d.warning, null);
});

test("OBS-02 missing volatility or required points returns NO_DATA", () => {
  assert.equal(buildVolBaselineDiagnostic(null).baselineReadiness, "NO_DATA");
  assert.equal(buildVolBaselineDiagnostic({ volatility: { baseline: { samples_1h: 24 } } }).baselineReadiness, "NO_DATA");
});

test("R1F missing news context returns NO_DATA and remains read-only", () => {
  const d = buildEventRiskContextDiagnostic(null, Date.parse("2026-06-13T12:00:00.000Z"));

  assert.equal(d.status, "NO_DATA");
  assert.equal(d.headlineCount, 0);
  assert.equal(d.freshness, "unknown");
  assert.equal(d.warning, "News context missing/stale");
  assert.equal(d.paperActivationAllowed, false);
  assert.equal(d.liveActivationAllowed, false);
});

test("R1F stale news context is labeled STALE without mutating input", () => {
  const input = {
    risk_level: "LOW",
    generated_at: "2026-06-13T10:00:00.000Z",
    crypto_news_headlines: [{ title: "sample headline that must not be exposed raw by route" }],
  };
  const before = JSON.stringify(input);
  const d = buildEventRiskContextDiagnostic(input, Date.parse("2026-06-13T11:00:01.000Z"));

  assert.equal(d.status, "STALE");
  assert.equal(d.headlineCount, 1);
  assert.equal(d.updatedAt, "2026-06-13T10:00:00.000Z");
  assert.equal(d.warning, "News context missing/stale");
  assert.equal(JSON.stringify(input), before);
});

test("R1F populated high event risk maps safe summary fields only", () => {
  const d = buildEventRiskContextDiagnostic(
    {
      risk_level: "HIGH",
      has_hot_news: true,
      headline_count: 4,
      generated_at: "2026-06-13T11:45:00.000Z",
      macro_risk_level: "MED",
      summary: "macro risk elevated",
    },
    Date.parse("2026-06-13T12:00:00.000Z")
  );

  assert.equal(d.status, "HIGH_EVENT_RISK");
  assert.equal(d.headlineCount, 4);
  assert.equal(d.source, "news_context.json");
  assert.equal(d.freshness, "fresh");
  assert.equal(d.riskLabel, "HIGH");
  assert.equal(d.summary, "macro risk elevated");
  assert.equal(d.warning, "High event risk - monitoring only");
});

test("OBS-D regime transition diagnostic is static NOT_CONFIGURED", () => {
  const d = buildRegimeTransitionDiagnostic();

  assert.equal(d.status, "NOT_CONFIGURED");
  assert.equal(d.hasHistoryStore, false);
  assert.equal(d.hysteresisActive, false);
  assert.equal(d.message, "Regime transition history is not configured");
  assert.equal(d.warning, "Design-only - no regime behavior change");
});

test("old paper diagnostics payload remains valid with R1 Pack B defaults", () => {
  const d = buildPaperLoopDiagnostics(summary({ recentEvents: [] }));

  assert.equal(d.noTradeReasonAnalysis.source, "NO_TRADE_REASON_ANALYZER_V1");
  assert.equal(d.noTradeReasonAnalysis.activationAllowed, false);
  assert.equal(d.noTradeReasonAnalysis.reviewOnly, true);
  assert.equal(d.reviewReadinessScore.source, "REVIEW_READINESS_SCORE_V1");
  assert.equal(d.reviewReadinessScore.scoreType, "REVIEW_READINESS_NOT_ACTIVATION");
  assert.equal(d.reviewReadinessScore.activationAllowed, false);
  assert.equal(d.reviewReadinessScore.reviewOnly, true);
  assert.equal(d.eventRiskContext.status, "NO_DATA");
  assert.equal(d.eventRiskContext.paperActivationAllowed, false);
  assert.equal(d.eventRiskContext.liveActivationAllowed, false);
  assert.equal(d.regimeTransitionDiagnostic.status, "NOT_CONFIGURED");
  assert.equal(d.regimeTransitionDiagnostic.hasHistoryStore, false);
  assert.equal(d.regimeTransitionDiagnostic.hysteresisActive, false);
  assert.equal(d.entryCandidateResolution.source, "ENTRY_CANDIDATE_RESOLVER_V1");
  assert.equal(d.entryCandidateResolution.status, "NO_ALIGNED_SETUP");
  assert.equal(d.entryCandidateResolution.alignedDirection, "UNKNOWN");
  assert.equal(d.entryCandidateResolution.activationAllowed, false);
  assert.equal(d.entryCandidateResolution.paperActivationAllowed, false);
  assert.equal(d.entryCandidateResolution.liveActivationAllowed, false);
  assert.equal(d.resolverDrivenPullbackGate.source, "RESOLVER_DRIVEN_PULLBACK_GATE_V1");
  assert.equal(d.resolverDrivenPullbackGate.status, "NO_ALIGNED_RESOLUTION");
  assert.equal(d.resolverDrivenPullbackGate.activationAllowed, false);
  assert.equal(d.resolverDrivenPullbackGate.paperActivationAllowed, false);
  assert.equal(d.resolverDrivenPullbackGate.liveActivationAllowed, false);
  assert.equal(d.pullbackTriggerThresholds.source, "PULLBACK_TRIGGER_THRESHOLDS_V1");
  assert.equal(d.pullbackTriggerThresholds.status, "NO_GATE");
  assert.equal(d.pullbackTriggerThresholds.activationAllowed, false);
  assert.equal(d.pullbackTriggerThresholds.paperActivationAllowed, false);
  assert.equal(d.pullbackTriggerThresholds.liveActivationAllowed, false);
  assert.equal(d.pullbackZoneTouchEvidence.source, "PULLBACK_ZONE_TOUCH_EVIDENCE_V1");
  assert.equal(d.pullbackZoneTouchEvidence.status, "NO_TRIGGER_CONTEXT");
  assert.equal(d.pullbackZoneTouchEvidence.confirmationWindowStatus, "NOT_AVAILABLE");
  assert.equal(d.pullbackZoneTouchEvidence.shouldEvaluateConfirmation, false);
  assert.equal(d.pullbackZoneTouchEvidence.activationAllowed, false);
  assert.equal(d.pullbackZoneTouchEvidence.paperActivationAllowed, false);
  assert.equal(d.pullbackZoneTouchEvidence.liveActivationAllowed, false);
  assert.equal(d.touchAwareConfirmationReview.source, "TOUCH_AWARE_CONFIRMATION_REVIEW_V1");
  assert.equal(d.touchAwareConfirmationReview.status, "NO_TOUCH_CONTEXT");
  assert.equal(d.touchAwareConfirmationReview.confirmationStatus, "NOT_EVALUATED");
  assert.equal(d.touchAwareConfirmationReview.shouldPromoteToReview, false);
  assert.equal(d.touchAwareConfirmationReview.activationAllowed, false);
  assert.equal(d.touchAwareConfirmationReview.paperActivationAllowed, false);
  assert.equal(d.touchAwareConfirmationReview.liveActivationAllowed, false);
  assert.equal(d.noReviewCandidateBottleneckResolver.source, "NO_REVIEW_CANDIDATE_BOTTLENECK_RESOLVER_V1");
  assert.equal(d.noReviewCandidateBottleneckResolver.status, "NO_CONTEXT");
  assert.equal(d.noReviewCandidateBottleneckResolver.primaryBlocker, "MISSING_CONTEXT");
  assert.equal(d.noReviewCandidateBottleneckResolver.activationAllowed, false);
  assert.equal(d.noReviewCandidateBottleneckResolver.paperActivationAllowed, false);
  assert.equal(d.noReviewCandidateBottleneckResolver.liveActivationAllowed, false);
  assert.equal(d.historicalReplayCandidateScarcityReview.source, "HISTORICAL_REPLAY_CANDIDATE_SCARCITY_REVIEW_V1");
  assert.equal(d.historicalReplayCandidateScarcityReview.status, "NO_REPLAY_DATA");
  assert.equal(d.historicalReplayCandidateScarcityReview.replayWindow.sampleQuality, "NO_SAMPLE");
  assert.equal(d.historicalReplayCandidateScarcityReview.activationAllowed, false);
  assert.equal(d.historicalReplayCandidateScarcityReview.paperActivationAllowed, false);
  assert.equal(d.historicalReplayCandidateScarcityReview.liveActivationAllowed, false);
});

test("approved offline replay review is exposed additively with forced safety", () => {
  const approved = evaluateHistoricalReplayCandidateScarcityReview({
    timeframe: "5M",
    replayPoints: Array.from({ length: 500 }, (_, index) => historicalReplayPoint(index)),
  });
  const supplied = {
    ...approved,
    activationAllowed: Boolean(1),
    paperActivationAllowed: Boolean(1),
    liveActivationAllowed: Boolean(1),
    reviewOnly: false,
    shadowOnly: false,
  } as unknown as HistoricalReplayCandidateScarcityReview;

  const d = buildPaperLoopDiagnostics(summary({ recentEvents: [] }), null, {
    historicalReplayCandidateScarcityReview: supplied,
  });

  assert.equal(d.historicalReplayCandidateScarcityReview.status, "PULLBACK_ONLY_BOTTLENECK");
  assert.equal(d.historicalReplayCandidateScarcityReview.funnelCounts.totalEvaluationPoints, 500);
  assert.equal(d.historicalReplayCandidateScarcityReview.funnelRates.triggerReachedRate, 0);
  assert.equal(d.historicalReplayCandidateScarcityReview.activationAllowed, false);
  assert.equal(d.historicalReplayCandidateScarcityReview.paperActivationAllowed, false);
  assert.equal(d.historicalReplayCandidateScarcityReview.liveActivationAllowed, false);
  assert.equal(d.historicalReplayCandidateScarcityReview.reviewOnly, true);
  assert.equal(d.historicalReplayCandidateScarcityReview.shadowOnly, true);
});

test("D8 point-in-time snapshot is exposed read-only from diagnostics", () => {
  const d = buildPaperLoopDiagnostics(summary({ checkedAt: "2026-06-30T00:00:00.000Z", recentEvents: [] }));

  assert.equal(d.d8PointInTimeSnapshot.evaluatedAt, "2026-06-30T00:00:00.000Z");
  assert.equal(d.d8PointInTimeSnapshot.sourceTimeframe, "5M");
  assert.equal(d.d8PointInTimeSnapshot.activationAllowed, false);
  assert.equal(d.d8PointInTimeSnapshot.paperActivationAllowed, false);
  assert.equal(d.d8PointInTimeSnapshot.liveActivationAllowed, false);
  assert.equal(d.d8PointInTimeSnapshot.reviewOnly, true);
  assert.equal(d.d8PointInTimeSnapshot.shadowOnly, true);
  assert.equal(validateD8PointInTimeSnapshot(d.d8PointInTimeSnapshot).valid, true);
});

test("D8 snapshot diagnostics do not change activation order or execution behavior", () => {
  const d = buildPaperLoopDiagnostics(summary({ checkedAt: "2026-06-30T00:00:00.000Z", recentEvents: [] }));

  assert.equal(d.runtimeMonitor.activationAllowed, false);
  assert.equal(d.trendPaperExecutionEngine.lastAction, "NO_ACTION");
  assert.equal(d.trendPaperExecutionEngine.liveActivationAllowed, false);
  assert.equal(d.d8PointInTimeSnapshot.activationAllowed, false);
  assert.equal(d.d8PointInTimeSnapshot.paperActivationAllowed, false);
  assert.equal(d.d8PointInTimeSnapshot.liveActivationAllowed, false);
});

test("D8 diagnostics input row is exposed read-only from paper diagnostics", () => {
  const d = buildPaperLoopDiagnostics(summary({ checkedAt: "2026-06-30T00:00:00.000Z", recentEvents: [] }));
  const row = d.d8SnapshotDiagnosticsInput;

  assert.equal(row.schemaVersion, 1);
  assert.equal(row.source, "paper-loop-diagnostics");
  assert.equal(row.evaluatedAt, "2026-06-30T00:00:00.000Z");
  assert.equal(row.sourceTimeframe, "5M");
  assert.equal(typeof row.producedAt, "string");
  assert.deepEqual(row.d8PointInTimeSnapshot, d.d8PointInTimeSnapshot);
  assert.equal(validateD8PointInTimeSnapshot(row.d8PointInTimeSnapshot).valid, true);
  assert.equal(validateD8SnapshotDiagnosticsInputRowShape(row).valid, true);
});

test("D8 diagnostics input row forces safe flags and preserves deterministic computed diagnostics", () => {
  const d = buildPaperLoopDiagnostics(summary({ checkedAt: "2026-06-30T00:00:00.000Z", recentEvents: [] }));
  const row = d.d8SnapshotDiagnosticsInput;

  assert.deepEqual(row.safety, {
    activationAllowed: false,
    paperActivationAllowed: false,
    liveActivationAllowed: false,
    reviewOnly: true,
    shadowOnly: true,
  });
  assert.equal(row.d8PointInTimeSnapshot.activationAllowed, false);
  assert.equal(row.d8PointInTimeSnapshot.paperActivationAllowed, false);
  assert.equal(row.d8PointInTimeSnapshot.liveActivationAllowed, false);
  assert.equal(row.d8PointInTimeSnapshot.reviewOnly, true);
  assert.equal(row.d8PointInTimeSnapshot.shadowOnly, true);
  assert.equal(row.d8PointInTimeSnapshot.d8_2Status, "NO_GATE");
  assert.equal(row.d8PointInTimeSnapshot.d8_3Status, "NO_TRIGGER_CONTEXT");
  assert.equal(row.d8PointInTimeSnapshot.d8_4Status, "NO_TOUCH_CONTEXT");
  assert.equal(row.d8PointInTimeSnapshot.triggerReached, false);
  assert.equal(row.d8PointInTimeSnapshot.zoneTouched, false);
});

test("D8 diagnostics input source does not import writers producers collectors or locked roadmap paths", async () => {
  const source = await import("node:fs/promises")
    .then(({ readFile }) => readFile("dashboard/lib/paper/paperLoopDiagnostics.ts", "utf8"));

  for (const term of [
    "writeD8SnapshotDiagnosticsInputRows",
    "writeD8PointInTimeSnapshotJournalRows",
    "produce-d8-snapshot-diagnostics-local-only",
    "collect-d8-snapshots-local-only",
    "tools/" + "local-replay",
    "D8" + ".5",
    "cont" + "inuation",
  ]) {
    assert.equal(source.includes(term), false);
  }
});

test("D5.4 no-trade reason analysis surfaces diagnostics gap and runtime counters", () => {
  const d = buildPaperLoopDiagnostics(
    summary({
      buyFillCount: 13,
      sellFillCount: 0,
      lastPaperEventAt: "2026-06-14T12:00:00.000Z",
      recentEvents: [
        ev({ gridLower: 72480, gridUpper: 78053, currentPrice: 63598.5, noTradeReason: "data_missing" }),
      ],
    }),
    {
      cumulativeBuyFillCount: 1460,
      cumulativeSellFillCount: 0,
      paperNoTradeCount: 3253,
      regridCandidateCount: 3206,
      latestFillAt: null,
      latestNoTradeAt: "2026-06-14T12:00:00.000Z",
      latestRegridCandidateAt: "2026-06-14T12:00:00.000Z",
    },
    {
      noTradeDiagnostics: {
        status: "missing",
        hasNoTradeLogs: false,
      },
      noTradeReasons: ["data_missing"],
    }
  );

  assert.equal(d.noTradeReasonAnalysis.status, "BOTH_PATHS_BLOCKED");
  assert.equal(d.noTradeReasonAnalysis.primaryReason?.code, "GRID_EXPOSURE_GUARD_PAUSE");
  assert.equal(d.noTradeReasonAnalysis.diagnosticsGap, true);
  assert.equal(d.noTradeReasonAnalysis.counters.paperNoTradeCount, 3253);
  assert.equal(d.noTradeReasonAnalysis.counters.regridCandidateCount, 3206);
  assert.equal(d.noTradeReasonAnalysis.activationAllowed, false);
  assert.equal(d.noTradeReasonAnalysis.reviewOnly, true);
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

test("trend paper arm session exposes read-only consumeStatus", () => {
  const d = buildPaperLoopDiagnostics(
    summary({ recentEvents: [] }),
    null,
    {
      trendPaperArmSession: {
        schemaVersion: "trend-paper-arm-session/1",
        sessionId: "sess-1",
        status: "ACTIVE",
        symbol: "BTC-USDT",
        direction: "SHORT",
        startedAt: "2026-06-08T00:00:00.000Z",
        expiresAt: "2026-06-08T01:00:00.000Z",
        maxEntries: 3,
        usedEntries: 1,
        maxRiskPerTradePct: 1,
        maxSessionRiskPct: 3,
        approvedBy: "OPERATOR",
        paperOnly: true,
        liveActivationAllowed: false,
        exchangeOrderAllowed: false,
        oldExposurePolicy: "QUARANTINE_OLD_GRID_EXPOSURE",
        notes: [],
      },
    }
  );

  assert.equal(d.trendPaperArmSession.consumeStatus.usedEntries, 1);
  assert.equal(d.trendPaperArmSession.consumeStatus.maxEntries, 3);
  assert.equal(d.trendPaperArmSession.consumeStatus.status, "ACTIVE");
  assert.equal(d.trendPaperArmSession.consumeStatus.lastKnown, "read-only");
});

test("MTF exact-zone attribution is exposed from decision summary diagnostics", () => {
  const d = buildPaperLoopDiagnostics(summary({}), null, {
    trendEvidenceDecisionSummary: {
      sampleAccounting: { lifetimeExactSamples: 325, windowExactSamples: 65, currentPriceEligibleExactSamples: null },
      exactZoneComparisonSummary: {
        exactSamples: 65,
        exactAvgNetRR: 5.06,
        heuristicAvgNetRR: 1.62,
        avgExactVsHeuristicDelta: 3.44,
        exactReadinessCounts: { TARGET_TOO_CLOSE: 40 },
        conflictBreakdown: { TARGET_TOO_CLOSE: 40, COST_TOO_HIGH: 0, CONFLICTING_MTF: 0, other: {} },
        fillResolution: { missedFillRate: 0.797 },
      },
      shadowOutcomeSummary: {
        shadowOutcomes: {
          totalSetups: 65,
          entryTouched: 13,
          entryTouchRate: 0.2,
          targetAfterEntryTouchRate: 0,
          invalidationAfterEntryTouchRate: 0.72,
        },
      },
    },
  });

  assert.equal(d.mtfExactZoneFailureAttribution.sample.sampleGatePassed, true);
  assert.equal(d.mtfExactZoneFailureAttribution.status, "GEOMETRY_PROMISING_EXECUTION_WEAK");
  assert.equal(d.mtfExactZoneFailureAttribution.cleanSubsetGate.status, "NOT_READY");
});

test("current-price eligible exact subset reports missing geometry when only aggregate exact evidence exists", () => {
  const d = buildPaperLoopDiagnostics(summary({}), null, {
    mtfEntryCurrentPriceContext: {
      currentPrice: 100,
      priceSource: "test.currentPrice",
      latestCandleAt: new Date().toISOString(),
      snapshotGeneratedAt: new Date().toISOString(),
      evaluatedAt: new Date().toISOString(),
      timeframe: "15m",
      previousAnalysisPrice: 100,
    },
    trendEvidenceDecisionSummary: {
      sampleAccounting: { lifetimeExactSamples: 325, windowExactSamples: 65, currentPriceEligibleExactSamples: null },
      exactZoneComparisonSummary: {
        exactSamples: 65,
        exactAvgNetRR: 5.06,
        heuristicAvgNetRR: 1.62,
        avgExactVsHeuristicDelta: 3.44,
        exactReadinessCounts: { TARGET_TOO_CLOSE: 40 },
        conflictBreakdown: { TARGET_TOO_CLOSE: 40, COST_TOO_HIGH: 0, CONFLICTING_MTF: 0, other: {} },
        fillResolution: { missedFillRate: 0.797 },
      },
      shadowOutcomeSummary: {
        shadowOutcomes: {
          totalSetups: 65,
          entryTouched: 13,
          entryTouchRate: 0.2,
          targetAfterEntryTouchRate: 0,
          invalidationAfterEntryTouchRate: 0.72,
        },
      },
    },
  });

  assert.equal(d.currentPriceEligibleExactSubset.status, "GEOMETRY_INPUTS_MISSING");
  assert.equal(d.currentPriceEligibleExactSubset.sampleAccounting.currentPriceEligibleExactSamples, null);
  assert.ok(d.currentPriceEligibleExactSubset.requiredGeometryInputs.includes("direction"));
  assert.equal(d.currentPriceEligibleExactSubset.activationAllowed, false);
  assert.equal(d.currentPriceEligibleExactSubset.paperActivationAllowed, false);
  assert.equal(d.currentPriceEligibleExactSubset.liveActivationAllowed, false);
  assert.equal(d.currentPriceConsistencyAudit.schemaVersion, 1);
  assert.equal(d.currentPriceConsistencyAudit.source, "CURRENT_PRICE_CONSISTENCY_AUDIT_V1");
  assert.equal(d.currentPriceConsistencyAudit.canonicalCurrentPrice.value, 100);
  assert.equal(d.currentPriceConsistencyAudit.canonicalCurrentPrice.source, "test.currentPrice");
  assert.equal(d.currentPriceConsistencyAudit.safety.activationAllowed, false);
  assert.equal(d.currentPriceConsistencyAudit.safety.paperActivationAllowed, false);
  assert.equal(d.currentPriceConsistencyAudit.safety.liveActivationAllowed, false);
  assert.equal(d.currentPriceConsistencyAudit.safety.orderAllowed, false);
});

test("current-price eligible exact subset consumes exact candidate geometry snapshot", () => {
  const d = buildPaperLoopDiagnostics(summary({}), null, {
    mtfEntryCurrentPriceContext: {
      currentPrice: 100,
      priceSource: "test.currentPrice",
      latestCandleAt: "2026-06-18T05:00:00.000Z",
      snapshotGeneratedAt: "2026-06-18T05:00:30.000Z",
      evaluatedAt: "2026-06-18T05:01:00.000Z",
      timeframe: "15m",
      previousAnalysisPrice: 100,
    },
    trendEvidenceDecisionSummary: {
      sampleAccounting: { lifetimeExactSamples: 325, windowExactSamples: 65, currentPriceEligibleExactSamples: null },
      exactCandidateGeometrySnapshot: {
        schemaVersion: 1,
        source: "EXACT_CANDIDATE_GEOMETRY_SNAPSHOT_V1",
        capturedAt: new Date().toISOString(),
        candidates: [{
          id: "snapshot-long-clean",
          direction: "LONG",
          zoneType: "OB_FVG_OVERLAP",
          readiness: "READY",
          entry: 100,
          entryLow: 99.9,
          entryHigh: 100.2,
          stopLoss: 98,
          invalidation: 98,
          target1: 103,
          netRR: 1.6,
          flags: [],
        }],
        summary: {
          totalCandidates: 1,
          structuredGeometryCount: 1,
          missingGeometryCount: 0,
          exactCount: 1,
          fvgOnlyCount: 0,
          targetTooCloseCount: 0,
          costTooHighCount: 0,
          conflictCount: 0,
        },
      },
      shadowOutcomeSummary: {
        shadowOutcomes: {
          totalSetups: 65,
          entryTouched: 40,
          entryTouchRate: 0.61,
          targetAfterEntryTouchRate: 0.4,
          invalidationAfterEntryTouchRate: 0.2,
        },
      },
    },
  });

  assert.equal(d.currentPriceEligibleExactSubset.sampleAccounting.currentPriceEligibleExactSamples, 1);
  assert.equal(d.currentPriceEligibleExactSubset.topCandidates[0]?.id, "snapshot-long-clean");
  assert.equal(d.currentPriceEligibleExactSubset.activationAllowed, false);
  assert.equal(d.currentPriceConsistencyAudit.canonicalCurrentPrice.value, 100);
  assert.equal(d.currentPriceConsistencyAudit.detectedConsumers.find((item) => item.path === "currentPriceEligibleExactSubset.currentPrice.value")?.status, "MATCH");
  assert.equal(d.currentPriceConsistencyAudit.safety.activationAllowed, false);
});

test("canonical current price propagates into trend diagnostics while old journal price remains snapshotPrice", () => {
  const d = buildPaperLoopDiagnostics(summary({
    recentEvents: [
      ev({ currentPrice: 63_500.7, noTradeReason: "stale_decision_or_price_mismatch" }),
    ],
  }), null, {
    canonicalMarketRegime: canonicalRegime({
      regime: "VOLATILITY_COMPRESSION",
      direction: "NEUTRAL",
      allowedModes: ["NO_TRADE"],
      blockedModes: ["TREND_CHECK"],
    }),
    trendZoneCandidate: null,
    mtfEntryCurrentPriceContext: {
      currentPrice: 62_928.7,
      priceSource: "market_snapshot.15m.close",
      latestCandleAt: "2026-06-19T01:45:00.000Z",
      snapshotGeneratedAt: "2026-06-19T01:46:00.000Z",
      freshnessStatus: "FRESH",
      ageSeconds: 120,
      previousAnalysisPrice: 63_500.7,
    },
    trendEvidenceDecisionSummary: {
      exactCandidateGeometrySnapshot: {
        schemaVersion: 1,
        source: "EXACT_CANDIDATE_GEOMETRY_SNAPSHOT_V1",
        capturedAt: "2026-06-19T01:45:00.000Z",
        candidates: [{
          id: "runtime-short-watch",
          direction: "SHORT",
          zoneType: "OB_FVG_OVERLAP",
          readiness: "TARGET_TOO_CLOSE",
          entry: 63_654.92,
          entryLow: 63_600,
          entryHigh: 63_700,
          stopLoss: 64_200,
          invalidation: 64_200,
          target1: 62_900,
          netRR: 1.1,
          flags: [],
        }],
        summary: {
          totalCandidates: 1,
          structuredGeometryCount: 1,
          missingGeometryCount: 0,
          exactCount: 1,
          fvgOnlyCount: 0,
          targetTooCloseCount: 1,
          costTooHighCount: 0,
          conflictCount: 0,
        },
      },
      shadowOutcomeSummary: {
        shadowOutcomes: {
          totalSetups: 65,
          entryTouched: 13,
          entryTouchRate: 0.2,
          targetAfterEntryTouchRate: 0,
          invalidationAfterEntryTouchRate: 0.72,
        },
      },
    },
  });

  assert.equal(d.snapshotPrice, 63_500.7);
  assert.equal(d.trendStrategy.currentPrice, 62_928.7);
  assert.equal(d.trendTransitionMonitor.watchedFields.currentPrice, 62_928.7);
  assert.equal(d.currentPriceConsistencyAudit.status, "CONSISTENT_WITH_SNAPSHOT_DRIFT");
  assert.equal(d.currentPriceConsistencyAudit.currentPriceReevaluation.trendZoneStatus, "REGIME_NOT_TREND");
  assert.equal(d.currentPriceConsistencyAudit.currentPriceReevaluation.priceMoveRequiredDirection, "NO_ZONE");
  assert.equal(d.currentPriceConsistencyAudit.pricePropagationAudit.staleConsumerCount, 0);
  assert.equal(d.currentPriceConsistencyAudit.pricePropagationAudit.previousAnalysisPriceCount, 1);
  assert.equal(d.currentPriceConsistencyAudit.safety.activationAllowed, false);
  assert.equal(d.currentPriceEligibleExactSubset.currentPrice.freshnessStatus, "FRESH");
  assert.equal(d.currentPriceEligibleExactSubset.currentPrice.ageSeconds, 120);
  assert.equal(d.regimeAwareExactCandidateWatchlist.status, "REGIME_NOT_CONFIRMED");
  assert.equal(d.regimeAwareExactCandidateWatchlist.currentMarket.currentPrice, 62_928.7);
  assert.equal(d.regimeAwareExactCandidateWatchlist.currentMarket.freshnessStatus, "FRESH");
  assert.equal(d.regimeAwareExactCandidateWatchlist.currentMarket.latestCandleAt, "2026-06-19T01:45:00.000Z");
  assert.equal(d.regimeAwareExactCandidateWatchlist.watchlistSummary.qualityRejectedCandidates, 1);
  assert.equal(d.regimeAwareExactCandidateWatchlist.watchlistSummary.cleanReviewCandidates, 0);
  assert.equal(d.regimeAwareExactCandidateWatchlist.activationAllowed, false);
});
