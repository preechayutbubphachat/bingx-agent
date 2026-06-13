import test from "node:test";
import assert from "node:assert/strict";

import {
  evaluateTrendPaperExecutionEngine,
  summarizeTrendPaperExecutionSnapshot,
  type TrendPaperExecutionCandle,
  type TrendPaperExecutionConfig,
  type TrendPaperPosition,
} from "./trendPaperExecutionEngine.ts";
import type { TrendStrategy } from "./trendStrategy.ts";
import type { TrendManualPaperArmGate } from "./trendManualPaperArmGate.ts";
import type { TrendPaperExecutionPreflight } from "./trendPaperExecutionPreflight.ts";
import type { TrendZoneShadow } from "../market-regime/trendZoneBuilder.ts";
import type { CanonicalMarketRegime, TimeframeIndicatorEvidence } from "../market-regime/canonicalMarketRegime.ts";
import type { TrendPaperArmSession } from "./trendPaperArmSession.ts";

const ARM_SESSION_ACTIVE: TrendPaperArmSession = {
  schemaVersion: "trend-paper-arm-session/1",
  sessionId: "sess-1",
  status: "ACTIVE",
  symbol: "BTC-USDT",
  direction: "SHORT",
  startedAt: "2026-06-07T23:00:00.000Z",
  expiresAt: "2026-06-08T01:00:00.000Z",
  maxEntries: 3,
  usedEntries: 0,
  maxRiskPerTradePct: 1,
  maxSessionRiskPct: 3,
  approvedBy: "OPERATOR",
  paperOnly: true,
  liveActivationAllowed: false,
  exchangeOrderAllowed: false,
  oldExposurePolicy: "QUARANTINE_OLD_GRID_EXPOSURE",
  notes: [],
};

const CONFIG: TrendPaperExecutionConfig = {
  enabled: true,
  mode: "PAPER_SIMULATION_ONLY",
  maxConcurrentTrendPositions: 1,
  riskPerTradePct: 1,
  minRewardRisk: 1.2,
  feePct: 0.05,
  slippagePct: 0.02,
  allowShort: true,
  allowLong: true,
};

const SHORT_STRATEGY: TrendStrategy = {
  enabled: false,
  phase: "T-1_SHADOW",
  status: "AWAITING_CONFIRMATION",
  direction: "SHORT",
  setupReason: "price_inside_pullback_zone_waiting_5m_confirm",
  entryZone: [63142, 63453],
  currentPrice: 63300,
  distanceToEntryZonePct: 0,
  invalidation: 64552,
  target1: 61825,
  target2: 61050,
  rewardRisk: 1.25,
  confirmationRequired: true,
  confirmationStatus: "WAITING_5M_CONFIRM",
  riskStatus: "PASS",
  oldExposurePolicy: "QUARANTINE_OLD_GRID_EXPOSURE",
  countTowardGridClosedCycles: false,
  countTowardTrendEvidence: false,
  paperActivationAllowed: false,
  liveActivationAllowed: false,
  shadowOnly: true,
  reasons: [],
  warnings: [],
};

const ARM_READY: TrendManualPaperArmGate = {
  phase: "T-2_ARMED",
  status: "OPERATOR_ARMED_PAPER_ONLY",
  requiredConditions: [],
  passedConditions: [],
  failedConditions: [],
  operatorActionRequired: true,
  setupId: "trend-arm:SHORT:DOWNTREND:63142-63453",
  expiryAt: null,
  paperActivationAllowed: false,
  liveActivationAllowed: false,
  notes: [],
};

const PREFLIGHT_READY: TrendPaperExecutionPreflight = {
  phase: "T-3_PREFLIGHT",
  status: "READY_FOR_PAPER_SIMULATION_REVIEW",
  requiredInputs: [],
  passedInputs: [],
  failedInputs: [],
  setupId: "trend-arm:SHORT:DOWNTREND:63142-63453",
  direction: "SHORT",
  entry: 63297.5,
  stopLoss: 64552,
  takeProfit1: 61825,
  takeProfit2: 61050,
  rewardRisk: 1.25,
  paperArmAllowed: false,
  paperActivationAllowed: false,
  liveActivationAllowed: false,
  journalWriteAllowed: false,
  simulatedFillAllowed: false,
  oldExposurePolicy: "QUARANTINE_OLD_GRID_EXPOSURE",
  notes: [],
};

const ZONE_READY: TrendZoneShadow = {
  buildStatus: "READY",
  dir: "DOWN",
  pullbackZone: [63142, 63453],
  invalidation: 64552,
  triggerRule: "wait_5m_confirm",
  targets: { t1: 61825, t2: 61050 },
  entry: { type: "CONFIRM", hint: "wait" },
  smc: { swingHigh1h: 64500, swingLow1h: 61825, eq1h: 63162.5, liquidityNote: null },
  warnings: [],
  shadowOnly: true,
  paperActivationAllowed: false,
  liveActivationAllowed: false,
};

const DOWN_REGIME: CanonicalMarketRegime = {
  regime: "DOWNTREND",
  direction: "BEARISH",
  confidence: 80,
  confidenceLabel: "high",
  reasons: ["trend_down_confirmed"],
  warnings: [],
  allowedModes: ["NO_TRADE", "TREND_CHECK"],
  blockedModes: ["NEUTRAL_GRID", "DYNAMIC_NEUTRAL_GRID", "PHASE_2B_ACTIVATION"],
  sourcePriority: ["market_snapshot.klines"],
  ignoredLegacyFields: [],
  sourceFreshness: { status: "fresh", generatedAt: null, latestCandleAtByTimeframe: {}, warnings: [] },
  evidenceCompleteness: { status: "partial", scorePct: 80, availableGroups: ["multi_timeframe_indicators"], missingGroups: [] },
  shadowOnly: true,
  paperActivationAllowed: false,
  liveActivationAllowed: false,
};

const TF5M: TimeframeIndicatorEvidence = {
  adx: 30,
  plusDI: 12,
  minusDI: 26,
  rsi: 41,
  atr: 110,
  atrPct: 0.18,
  bbw: 0.02,
  macd: -20,
  macdSignal: -15,
  macdHistogram: -5,
  emaSlope: -12,
  ema50: null,
  ema200: null,
  source: "market_snapshot",
  calculatedAt: "2026-06-08T00:00:00.000Z",
  candleCount: 100,
  timeframe: "5M",
  freshness: { latestCandleAt: "2026-06-08T00:00:00.000Z", ageMs: 60_000 },
  missingFields: [],
  notes: [],
};

function candles(values: Array<[number, number, number, number, number]>): TrendPaperExecutionCandle[] {
  return values.map(([t, open, high, low, close]) => ({ t, open, high, low, close }));
}

function openPosition(overrides: Partial<TrendPaperPosition> = {}): TrendPaperPosition {
  return {
    positionId: "pos-1",
    setupId: "trend-arm:SHORT:DOWNTREND:63142-63453",
    epochId: "trend-epoch-1",
    symbol: "BTC-USDT",
    direction: "SHORT",
    entryPrice: 63300,
    stopLoss: 64552,
    takeProfit1: 61825,
    takeProfit2: 61050,
    quantityPaper: 0.01,
    remainingQuantityPaper: 0.01,
    riskAmountPaper: 12.5,
    entryFeeEstimate: 0.4,
    entrySlippageEstimate: 0.2,
    openedAt: "2026-06-08T00:00:00.000Z",
    status: "OPEN",
    ...overrides,
  };
}

function run(overrides: Partial<Parameters<typeof evaluateTrendPaperExecutionEngine>[0]> = {}) {
  return evaluateTrendPaperExecutionEngine({
    trendStrategy: SHORT_STRATEGY,
    trendManualPaperArmGate: ARM_READY,
    trendPaperArmSession: ARM_SESSION_ACTIVE,
    trendPaperExecutionPreflight: PREFLIGHT_READY,
    trendZoneCandidate: ZONE_READY,
    canonicalMarketRegime: DOWN_REGIME,
    multiTimeframeIndicatorEvidence: { "5M": TF5M },
    currentPrice: 63280,
    latest5mCandles: candles([
      [1, 63320, 63340, 63290, 63310],
      [2, 63310, 63300, 63220, 63240],
    ]),
    openTrendPaperPosition: null,
    config: CONFIG,
    now: "2026-06-08T00:05:00.000Z",
    symbol: "BTC-USDT",
    ...overrides,
  });
}

test("no action when config disabled", () => {
  const result = run({ config: { ...CONFIG, enabled: false } });
  assert.equal(result.action, "NO_ACTION");
  assert.equal(result.reason, "CONFIG_DISABLED");
});

test("no action when preflight not ready", () => {
  const result = run({
    trendPaperExecutionPreflight: { ...PREFLIGHT_READY, status: "NOT_READY" },
  });
  assert.equal(result.action, "NO_ACTION");
  assert.equal(result.reason, "PREFLIGHT_NOT_READY");
});

test("T-3A hardening: READY_FOR_OPERATOR_REVIEW does NOT auto-enter (operator arm required)", () => {
  const result = run({
    trendManualPaperArmGate: { ...ARM_READY, phase: "T-2_READY_FOR_OPERATOR", status: "READY_FOR_OPERATOR_REVIEW" },
  });
  assert.equal(result.action, "NO_ACTION");
  assert.equal(result.reason, "OPERATOR_ARM_REQUIRED");
  assert.equal(result.journalEventDraft, null);
  assert.equal(result.liveActivationAllowed, false);
  assert.equal(result.exchangeOrderAllowed, false);
});

test("T-3A hardening: OPERATOR_ARMED_PAPER_ONLY is the only valid entry trigger", () => {
  const result = run({
    trendManualPaperArmGate: { ...ARM_READY, phase: "T-2_ARMED", status: "OPERATOR_ARMED_PAPER_ONLY" },
  });
  assert.equal(result.action, "CREATE_PAPER_ENTRY");
  assert.equal(result.journalEventDraft?.countTowardGridClosedCycles, false);
  assert.equal(result.journalEventDraft?.oldExposurePolicy, "QUARANTINE_OLD_GRID_EXPOSURE");
  assert.equal(result.liveActivationAllowed, false);
  assert.equal(result.exchangeOrderAllowed, false);
});

test("T-3B: armed but no session → NO_ACTION / PAPER_ARM_SESSION_NOT_ACTIVE", () => {
  const result = run({ trendPaperArmSession: null });
  assert.equal(result.action, "NO_ACTION");
  assert.equal(result.reason, "PAPER_ARM_SESSION_NOT_ACTIVE");
  assert.equal(result.journalEventDraft, null);
  assert.equal(result.liveActivationAllowed, false);
  assert.equal(result.exchangeOrderAllowed, false);
});

test("T-3B: expired session → NO_ACTION / PAPER_ARM_SESSION_EXPIRED", () => {
  const result = run({ trendPaperArmSession: { ...ARM_SESSION_ACTIVE, startedAt: "2026-06-07T22:00:00.000Z", expiresAt: "2026-06-07T23:30:00.000Z" } });
  assert.equal(result.action, "NO_ACTION");
  assert.equal(result.reason, "PAPER_ARM_SESSION_EXPIRED");
});

test("T-3B: limit reached → NO_ACTION / PAPER_ARM_SESSION_LIMIT_REACHED", () => {
  const result = run({ trendPaperArmSession: { ...ARM_SESSION_ACTIVE, maxEntries: 2, usedEntries: 2 } });
  assert.equal(result.action, "NO_ACTION");
  assert.equal(result.reason, "PAPER_ARM_SESSION_LIMIT_REACHED");
});

test("T-3B: active session + all gates → CREATE_PAPER_ENTRY", () => {
  const result = run({ trendPaperArmSession: ARM_SESSION_ACTIVE });
  assert.equal(result.action, "CREATE_PAPER_ENTRY");
  assert.equal(result.liveActivationAllowed, false);
  assert.equal(result.exchangeOrderAllowed, false);
});

test("entry created when all gates pass", () => {
  const result = run();
  assert.equal(result.action, "CREATE_PAPER_ENTRY");
  assert.equal(result.reason, "ENTRY_CONDITIONS_MET");
  assert.equal(result.paperOnly, true);
  assert.equal(result.exchangeOrderAllowed, false);
  assert.ok(result.journalEventDraft);
  assert.equal(result.journalEventDraft?.eventType, "TREND_PAPER_ENTRY");
  assert.equal(result.validation?.valid, true);
});

test("missing stop loss blocks paper entry with explicit risk-model reason", () => {
  const result = run({
    trendPaperExecutionPreflight: { ...PREFLIGHT_READY, stopLoss: null },
  });
  assert.equal(result.action, "NO_ACTION");
  assert.equal(result.reason, "PAPER_TRADE_BLOCKED_MISSING_STOP_LOSS");
  assert.equal(result.paperOrderIntent, null);
  assert.equal(result.journalEventDraft, null);
  assert.equal(result.liveActivationAllowed, false);
  assert.equal(result.exchangeOrderAllowed, false);
});

test("non-finite stop loss blocks paper entry", () => {
  const result = run({
    trendPaperExecutionPreflight: { ...PREFLIGHT_READY, stopLoss: Number.NaN },
  });
  assert.equal(result.action, "NO_ACTION");
  assert.equal(result.reason, "PAPER_TRADE_BLOCKED_MISSING_STOP_LOSS");
});

test("zero risk distance blocks paper entry as invalid risk model", () => {
  const result = run({
    currentPrice: PREFLIGHT_READY.stopLoss,
  });
  assert.equal(result.action, "NO_ACTION");
  assert.equal(result.reason, "INVALID_RISK_MODEL");
});

test("entry event validates before write", () => {
  const result = run();
  assert.ok(result.validation);
  assert.equal(result.validation?.valid, true);
  assert.equal(result.journalEventDraft?.countTowardGridClosedCycles, false);
  assert.equal(result.journalEventDraft?.liveActivationAllowed, false);
});

test("sl before tp when both hit same candle", () => {
  const result = run({
    openTrendPaperPosition: openPosition(),
    latest5mCandles: candles([
      [1, 63300, 63310, 63290, 63305],
      [2, 63305, 64600, 61700, 62000],
    ]),
  });
  assert.equal(result.action, "CREATE_PAPER_EXIT");
  assert.equal(result.reason, "stop_loss_hit_before_take_profit_same_candle");
  assert.equal(result.journalEventDraft?.eventType, "TREND_PAPER_INVALIDATED");
});

test("tp exit calculates r correctly", () => {
  const result = run({
    openTrendPaperPosition: openPosition({ takeProfit2: null }),
    latest5mCandles: candles([
      [1, 63300, 63310, 63290, 63305],
      [2, 63305, 63308, 61780, 61810],
    ]),
  });
  assert.equal(result.action, "CREATE_PAPER_EXIT");
  assert.equal(result.reason, "take_profit_1_hit");
  assert.equal(result.journalEventDraft?.eventType, "TREND_PAPER_EXIT");
  assert.ok((result.journalEventDraft?.rMultiple ?? 0) > 0);
});

test("fee and slippage reduce net pnl", () => {
  const result = run({
    openTrendPaperPosition: openPosition({ takeProfit2: null }),
    latest5mCandles: candles([
      [1, 63300, 63310, 63290, 63305],
      [2, 63305, 63308, 61780, 61810],
    ]),
  });
  assert.ok((result.journalEventDraft?.grossPnlPaper ?? 0) > (result.journalEventDraft?.netPnlPaper ?? 0));
  assert.ok((result.journalEventDraft?.feeEstimate ?? 0) > 0);
  assert.ok((result.journalEventDraft?.slippageEstimate ?? 0) > 0);
});

test("old grid exposure never converted", () => {
  const result = run();
  assert.equal(result.journalEventDraft?.oldExposurePolicy, "QUARANTINE_OLD_GRID_EXPOSURE");
  assert.equal(result.journalEventDraft?.countTowardGridClosedCycles, false);
});

test("live activation always false", () => {
  const entry = run();
  const exit = run({
    openTrendPaperPosition: openPosition({ takeProfit2: null }),
    latest5mCandles: candles([
      [1, 63300, 63310, 63290, 63305],
      [2, 63305, 63308, 61780, 61810],
    ]),
  });
  assert.equal(entry.liveActivationAllowed, false);
  assert.equal(entry.journalEventDraft?.liveActivationAllowed, false);
  assert.equal(exit.liveActivationAllowed, false);
  assert.equal(exit.journalEventDraft?.liveActivationAllowed, false);
});

test("no exchange order intent generated", () => {
  const result = run();
  assert.equal(result.exchangeOrderAllowed, false);
  assert.equal(result.paperOrderIntent?.exchangeOrderAllowed, false);
});

test("summary snapshot carries edge review values without enabling live", () => {
  const result = run();
  const snapshot = summarizeTrendPaperExecutionSnapshot({
    result,
    config: CONFIG,
    openTrendPaperPosition: null,
    lastEntryAt: null,
    lastExitAt: null,
    closedTrades: [],
    edgeReview: { winRate: null, netExpectancyAfterCosts: null },
  });
  assert.equal(snapshot.enabled, true);
  assert.equal(snapshot.lastAction, "CREATE_PAPER_ENTRY");
  assert.equal(snapshot.liveActivationAllowed, false);
});
