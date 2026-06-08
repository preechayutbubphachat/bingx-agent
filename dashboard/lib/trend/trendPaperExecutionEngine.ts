import type { TimeframeIndicatorEvidence } from "../market-regime/canonicalMarketRegime.ts";
import type { CanonicalMarketRegime } from "../market-regime/canonicalMarketRegime.ts";
import type { TrendZoneShadow } from "../market-regime/trendZoneBuilder.ts";
import type { TrendPaperJournalEvent, ValidationResult } from "./trendPaperJournalSchema.ts";
import { validateTrendPaperJournalEvent } from "./trendPaperJournalSchema.ts";
import type { TrendManualPaperArmGate } from "./trendManualPaperArmGate.ts";
import type { TrendPaperExecutionPreflight } from "./trendPaperExecutionPreflight.ts";
import type { TrendStrategy } from "./trendStrategy.ts";
import type { TrendClosedTradeInput, TrendEdgeReview } from "./trendEdgeReview.ts";

export type TrendPaperExecutionMode = "PAPER_SIMULATION_ONLY";
export type TrendPaperEngineAction =
  | "NO_ACTION"
  | "CREATE_PAPER_ENTRY"
  | "CREATE_PAPER_EXIT"
  | "CREATE_PAPER_CANCEL";

export interface TrendPaperExecutionCandle {
  t: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface TrendPaperExecutionConfig {
  enabled: boolean;
  mode: TrendPaperExecutionMode;
  maxConcurrentTrendPositions: number;
  riskPerTradePct: number;
  minRewardRisk: number;
  feePct: number;
  slippagePct: number;
  allowShort: boolean;
  allowLong: boolean;
  paperEquityBase?: number;
  nearTargetThresholdPct?: number;
  entryEdgeTolerancePct?: number;
}

export interface TrendPaperPosition {
  positionId: string;
  setupId: string;
  epochId: string;
  symbol: string;
  direction: "LONG" | "SHORT";
  entryPrice: number;
  stopLoss: number;
  takeProfit1: number;
  takeProfit2: number | null;
  quantityPaper: number;
  remainingQuantityPaper: number;
  riskAmountPaper: number;
  entryFeeEstimate: number;
  entrySlippageEstimate: number;
  openedAt: string;
  status: "OPEN" | "PARTIAL_TP1" | "CLOSED" | "CANCELLED";
}

export interface TrendPaperOrderIntent {
  intentKind: "ENTRY" | "PARTIAL_EXIT" | "EXIT" | "CANCEL";
  positionId: string;
  setupId: string;
  direction: "LONG" | "SHORT";
  entryPrice: number | null;
  exitPrice: number | null;
  stopLoss: number | null;
  takeProfit1: number | null;
  takeProfit2: number | null;
  quantityPaper: number;
  riskAmountPaper: number;
  exchangeOrderAllowed: false;
  paperOnly: true;
}

export interface TrendPaperExecutionInput {
  trendStrategy: TrendStrategy | null | undefined;
  trendManualPaperArmGate: TrendManualPaperArmGate | null | undefined;
  trendPaperExecutionPreflight: TrendPaperExecutionPreflight | null | undefined;
  trendZoneCandidate: TrendZoneShadow | null | undefined;
  canonicalMarketRegime: CanonicalMarketRegime | null | undefined;
  multiTimeframeIndicatorEvidence: Record<string, TimeframeIndicatorEvidence | undefined> | null | undefined;
  currentPrice: number | null | undefined;
  latest5mCandles: TrendPaperExecutionCandle[] | null | undefined;
  openTrendPaperPosition: TrendPaperPosition | null | undefined;
  config: TrendPaperExecutionConfig;
  now?: number | string | Date | null | undefined;
  symbol?: string | null | undefined;
}

export interface TrendPaperExecutionResult {
  action: TrendPaperEngineAction;
  reason: string;
  paperOrderIntent: TrendPaperOrderIntent | null;
  journalEventDraft: TrendPaperJournalEvent | null;
  validation: ValidationResult | null;
  paperOnly: true;
  liveActivationAllowed: false;
  exchangeOrderAllowed: false;
}

export interface TrendPaperExecutionSnapshot {
  enabled: boolean;
  mode: TrendPaperExecutionMode;
  lastAction: TrendPaperEngineAction;
  lastReason: string;
  openTrendPaperPosition: TrendPaperPosition | null;
  lastEntryAt: string | null;
  lastExitAt: string | null;
  trendPaperClosedTrades: number;
  winRate: number | null;
  netExpectancyAfterCosts: number | null;
  paperOnly: true;
  liveActivationAllowed: false;
  exchangeOrderAllowed: false;
}

const DEFAULT_PAPER_EQUITY_BASE = 1000;
const DEFAULT_NEAR_TARGET_THRESHOLD_PCT = 0.30;
const DEFAULT_ENTRY_EDGE_TOLERANCE_PCT = 0.10;

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function asIso(value: TrendPaperExecutionInput["now"]): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "number" && Number.isFinite(value)) return new Date(value).toISOString();
  if (typeof value === "string" && value.trim()) {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return new Date(parsed).toISOString();
  }
  return new Date().toISOString();
}

function pctDistance(a: number, b: number): number {
  return Math.abs(a - b) / Math.max(Math.abs(b), Number.EPSILON) * 100;
}

function midpoint(zone: [number, number] | null | undefined): number | null {
  return Array.isArray(zone) && zone.length === 2 && finite(zone[0]) && finite(zone[1])
    ? (zone[0] + zone[1]) / 2
    : null;
}

function noAction(reason: string): TrendPaperExecutionResult {
  return {
    action: "NO_ACTION",
    reason,
    paperOrderIntent: null,
    journalEventDraft: null,
    validation: null,
    paperOnly: true,
    liveActivationAllowed: false,
    exchangeOrderAllowed: false,
  };
}

function acceptedDirection(
  direction: TrendStrategy["direction"],
  config: TrendPaperExecutionConfig,
): boolean {
  if (direction === "SHORT") return config.allowShort === true;
  if (direction === "LONG") return config.allowLong === true;
  return false;
}

function regimeMatches(
  regime: CanonicalMarketRegime | null | undefined,
  direction: TrendStrategy["direction"],
): boolean {
  if (direction === "SHORT") return regime?.regime === "DOWNTREND" && regime.direction === "BEARISH";
  if (direction === "LONG") return regime?.regime === "UPTREND" && regime.direction === "BULLISH";
  return false;
}

function priceInsideOrEdge(
  price: number,
  zone: [number, number] | null | undefined,
  tolerancePct: number,
): boolean {
  if (!zone || !finite(zone[0]) || !finite(zone[1])) return false;
  if (price >= zone[0] && price <= zone[1]) return true;
  const edge = price < zone[0] ? zone[0] : zone[1];
  return pctDistance(price, edge) <= tolerancePct;
}

function isNearTarget(
  direction: "LONG" | "SHORT",
  price: number,
  target1: number,
  thresholdPct: number,
): boolean {
  if (!finite(price) || !finite(target1)) return false;
  const near = pctDistance(price, target1) <= thresholdPct;
  if (!near) return false;
  return direction === "SHORT" ? price <= target1 || price > target1 : price >= target1 || price < target1;
}

function normalizeCandles(candles: TrendPaperExecutionCandle[] | null | undefined): TrendPaperExecutionCandle[] {
  return Array.isArray(candles)
    ? candles
        .filter((c) => finite(c?.t) && finite(c?.open) && finite(c?.high) && finite(c?.low) && finite(c?.close))
        .slice()
        .sort((a, b) => a.t - b.t)
    : [];
}

function evaluateFiveMinuteConfirmation(input: {
  direction: "LONG" | "SHORT";
  entryZone: [number, number];
  invalidation: number;
  target1: number;
  candles: TrendPaperExecutionCandle[];
  indicator5m: TimeframeIndicatorEvidence | undefined;
  currentPrice: number;
  nearTargetThresholdPct: number;
}): { pass: boolean; reason: string } {
  const candles = normalizeCandles(input.candles);
  if (candles.length < 2) return { pass: false, reason: "INSUFFICIENT_5M_CONFIRMATION" };

  const latest = candles[candles.length - 1];
  const previous = candles[candles.length - 2];
  const zoneMid = midpoint(input.entryZone);
  if (!finite(zoneMid)) return { pass: false, reason: "INVALID_ENTRY_ZONE" };

  if (isNearTarget(input.direction, input.currentPrice, input.target1, input.nearTargetThresholdPct)) {
    return { pass: false, reason: "NO_CHASE_NEAR_TARGET" };
  }

  if (input.direction === "SHORT") {
    if (latest.close > input.invalidation) return { pass: false, reason: "5M_CONFIRMATION_CLOSED_ABOVE_INVALIDATION" };
    if (!(latest.close <= zoneMid || latest.close < previous.close)) {
      return { pass: false, reason: "5M_CONFIRMATION_NOT_BEARISH_ENOUGH" };
    }
    if (finite(input.indicator5m?.macdHistogram) && input.indicator5m!.macdHistogram > 0) {
      return { pass: false, reason: "5M_MACD_RECOVERY_AGAINST_SHORT" };
    }
    return { pass: true, reason: "5M_CONFIRMATION_PASSED_SHORT" };
  }

  if (latest.close < input.invalidation) return { pass: false, reason: "5M_CONFIRMATION_CLOSED_BELOW_INVALIDATION" };
  if (!(latest.close >= zoneMid || latest.close > previous.close)) {
    return { pass: false, reason: "5M_CONFIRMATION_NOT_BULLISH_ENOUGH" };
  }
  if (finite(input.indicator5m?.macdHistogram) && input.indicator5m!.macdHistogram < 0) {
    return { pass: false, reason: "5M_MACD_WEAK_AGAINST_LONG" };
  }
  return { pass: true, reason: "5M_CONFIRMATION_PASSED_LONG" };
}

function riskAmount(config: TrendPaperExecutionConfig): number {
  const equityBase = finite(config.paperEquityBase) && config.paperEquityBase! > 0
    ? config.paperEquityBase!
    : DEFAULT_PAPER_EQUITY_BASE;
  const pct = finite(config.riskPerTradePct) ? config.riskPerTradePct : 0;
  return equityBase * Math.max(0, pct) / 100;
}

function estimateEntryCosts(fillPrice: number, quantityPaper: number, config: TrendPaperExecutionConfig) {
  const notional = fillPrice * quantityPaper;
  const feeEstimate = notional * Math.max(0, config.feePct) / 100;
  const slippageEstimate = notional * Math.max(0, config.slippagePct) / 100;
  return { feeEstimate, slippageEstimate };
}

function buildPositionId(setupId: string, epochId: string, openedAt: string): string {
  const stamp = openedAt.replace(/[-:.TZ]/g, "").slice(0, 14);
  return `${setupId}:${epochId}:${stamp}`;
}

function buildEntryEvent(input: {
  nowIso: string;
  symbol: string;
  strategy: TrendStrategy;
  preflight: TrendPaperExecutionPreflight;
  currentPrice: number;
  config: TrendPaperExecutionConfig;
}): { result: TrendPaperExecutionResult; position: TrendPaperPosition } {
  const zone = input.strategy.entryZone as [number, number];
  const direction = input.strategy.direction as "LONG" | "SHORT";
  const stopLoss = input.preflight.stopLoss as number;
  const takeProfit1 = input.preflight.takeProfit1 as number;
  const takeProfit2 = input.preflight.takeProfit2 ?? null;
  const entryPrice = input.currentPrice;
  const riskAbs = Math.abs(entryPrice - stopLoss);
  const riskAmountPaper = riskAmount(input.config);
  const quantityPaper = riskAbs > 0 ? riskAmountPaper / riskAbs : 0;
  const costs = estimateEntryCosts(entryPrice, quantityPaper, input.config);
  const epochId = input.preflight.setupId ?? `trend-epoch:${input.nowIso}`;
  const setupId = input.preflight.setupId ?? `trend-setup:${direction}:${Math.round(zone[0])}-${Math.round(zone[1])}`;
  const positionId = buildPositionId(setupId, epochId, input.nowIso);
  const position: TrendPaperPosition = {
    positionId,
    setupId,
    epochId,
    symbol: input.symbol,
    direction,
    entryPrice,
    stopLoss,
    takeProfit1,
    takeProfit2,
    quantityPaper,
    remainingQuantityPaper: quantityPaper,
    riskAmountPaper,
    entryFeeEstimate: costs.feeEstimate,
    entrySlippageEstimate: costs.slippageEstimate,
    openedAt: input.nowIso,
    status: "OPEN",
  };

  const event: TrendPaperJournalEvent = {
    schemaVersion: "trend-paper-journal/1",
    eventType: "TREND_PAPER_ENTRY",
    ts: input.nowIso,
    epochId,
    setupId,
    symbol: input.symbol,
    direction,
    entry: midpoint(zone),
    stopLoss,
    takeProfit1,
    takeProfit2,
    fillPricePaper: entryPrice,
    quantityPaper,
    riskAmountPaper,
    rMultiple: 0,
    grossPnlPaper: 0,
    feeEstimate: costs.feeEstimate,
    slippageEstimate: costs.slippageEstimate,
    netPnlPaper: -(costs.feeEstimate + costs.slippageEstimate),
    exitReason: null,
    oldExposurePolicy: "QUARANTINE_OLD_GRID_EXPOSURE",
    countTowardGridClosedCycles: false,
    countTowardTrendEvidence: false,
    liveActivationAllowed: false,
    positionId,
    statusAfter: "OPEN",
  } as TrendPaperJournalEvent;
  const validation = validateTrendPaperJournalEvent(event);
  return {
    position,
    result: {
      action: "CREATE_PAPER_ENTRY",
      reason: "ENTRY_CONDITIONS_MET",
      paperOrderIntent: {
        intentKind: "ENTRY",
        positionId,
        setupId,
        direction,
        entryPrice,
        exitPrice: null,
        stopLoss,
        takeProfit1,
        takeProfit2,
        quantityPaper,
        riskAmountPaper,
        exchangeOrderAllowed: false,
        paperOnly: true,
      },
      journalEventDraft: event,
      validation,
      paperOnly: true,
      liveActivationAllowed: false,
      exchangeOrderAllowed: false,
    },
  };
}

function directionSign(direction: "LONG" | "SHORT"): 1 | -1 {
  return direction === "LONG" ? 1 : -1;
}

function buildExitEvent(input: {
  nowIso: string;
  symbol: string;
  eventType: "TREND_PAPER_PARTIAL" | "TREND_PAPER_EXIT" | "TREND_PAPER_INVALIDATED" | "TREND_PAPER_CANCEL";
  exitReason: string;
  exitPrice: number;
  quantityPaper: number;
  position: TrendPaperPosition;
  config: TrendPaperExecutionConfig;
}): TrendPaperExecutionResult {
  const sign = directionSign(input.position.direction);
  const grossPnlPaper = (input.exitPrice - input.position.entryPrice) * sign * input.quantityPaper;
  const exitNotional = input.exitPrice * input.quantityPaper;
  const exitFeeEstimate = exitNotional * Math.max(0, input.config.feePct) / 100;
  const exitSlippageEstimate = exitNotional * Math.max(0, input.config.slippagePct) / 100;
  const feeEstimate = input.position.entryFeeEstimate + exitFeeEstimate;
  const slippageEstimate = input.position.entrySlippageEstimate + exitSlippageEstimate;
  const netPnlPaper = grossPnlPaper - feeEstimate - slippageEstimate;
  const rMultiple = input.position.riskAmountPaper > 0 ? netPnlPaper / input.position.riskAmountPaper : 0;

  const event: TrendPaperJournalEvent = {
    schemaVersion: "trend-paper-journal/1",
    eventType: input.eventType,
    ts: input.nowIso,
    epochId: input.position.epochId,
    setupId: input.position.setupId,
    symbol: input.symbol,
    direction: input.position.direction,
    entry: input.position.entryPrice,
    stopLoss: input.position.stopLoss,
    takeProfit1: input.position.takeProfit1,
    takeProfit2: input.position.takeProfit2,
    fillPricePaper: input.exitPrice,
    quantityPaper: input.quantityPaper,
    riskAmountPaper: input.position.riskAmountPaper,
    rMultiple,
    grossPnlPaper,
    feeEstimate,
    slippageEstimate,
    netPnlPaper,
    exitReason: input.exitReason,
    oldExposurePolicy: "QUARANTINE_OLD_GRID_EXPOSURE",
    countTowardGridClosedCycles: false,
    countTowardTrendEvidence: input.eventType === "TREND_PAPER_EXIT" || input.eventType === "TREND_PAPER_INVALIDATED",
    liveActivationAllowed: false,
    positionId: input.position.positionId,
    statusAfter:
      input.eventType === "TREND_PAPER_PARTIAL"
        ? "PARTIAL_TP1"
        : input.eventType === "TREND_PAPER_CANCEL"
          ? "CANCELLED"
          : "CLOSED",
  } as TrendPaperJournalEvent;
  const validation = validateTrendPaperJournalEvent(event);

  return {
    action: input.eventType === "TREND_PAPER_CANCEL" ? "CREATE_PAPER_CANCEL" : "CREATE_PAPER_EXIT",
    reason: input.exitReason,
    paperOrderIntent: {
      intentKind:
        input.eventType === "TREND_PAPER_PARTIAL"
          ? "PARTIAL_EXIT"
          : input.eventType === "TREND_PAPER_CANCEL"
            ? "CANCEL"
            : "EXIT",
      positionId: input.position.positionId,
      setupId: input.position.setupId,
      direction: input.position.direction,
      entryPrice: input.position.entryPrice,
      exitPrice: input.exitPrice,
      stopLoss: input.position.stopLoss,
      takeProfit1: input.position.takeProfit1,
      takeProfit2: input.position.takeProfit2,
      quantityPaper: input.quantityPaper,
      riskAmountPaper: input.position.riskAmountPaper,
      exchangeOrderAllowed: false,
      paperOnly: true,
    },
    journalEventDraft: event,
    validation,
    paperOnly: true,
    liveActivationAllowed: false,
    exchangeOrderAllowed: false,
  };
}

function evaluateExitLifecycle(input: {
  position: TrendPaperPosition;
  strategy: TrendStrategy | null | undefined;
  canonicalMarketRegime: CanonicalMarketRegime | null | undefined;
  candles: TrendPaperExecutionCandle[];
  currentPrice: number;
  config: TrendPaperExecutionConfig;
  nowIso: string;
  symbol: string;
}): TrendPaperExecutionResult {
  const candles = normalizeCandles(input.candles);
  const latest = candles[candles.length - 1];
  if (!latest) return noAction("INSUFFICIENT_5M_CONFIRMATION");

  const direction = input.position.direction;
  const stopHit = direction === "SHORT" ? latest.high >= input.position.stopLoss : latest.low <= input.position.stopLoss;
  const tp1Hit = direction === "SHORT" ? latest.low <= input.position.takeProfit1 : latest.high >= input.position.takeProfit1;
  const tp2Hit =
    finite(input.position.takeProfit2) &&
    (direction === "SHORT" ? latest.low <= input.position.takeProfit2 : latest.high >= input.position.takeProfit2);
  const regimeConflict = !regimeMatches(input.canonicalMarketRegime, input.position.direction);

  if (stopHit && (tp1Hit || tp2Hit)) {
    return buildExitEvent({
      nowIso: input.nowIso,
      symbol: input.symbol,
      eventType: "TREND_PAPER_INVALIDATED",
      exitReason: "stop_loss_hit_before_take_profit_same_candle",
      exitPrice: input.position.stopLoss,
      quantityPaper: input.position.remainingQuantityPaper,
      position: input.position,
      config: input.config,
    });
  }

  if (stopHit) {
    return buildExitEvent({
      nowIso: input.nowIso,
      symbol: input.symbol,
      eventType: "TREND_PAPER_INVALIDATED",
      exitReason: "stop_loss_hit",
      exitPrice: input.position.stopLoss,
      quantityPaper: input.position.remainingQuantityPaper,
      position: input.position,
      config: input.config,
    });
  }

  if (regimeConflict || input.strategy?.status === "INVALIDATED") {
    return buildExitEvent({
      nowIso: input.nowIso,
      symbol: input.symbol,
      eventType: "TREND_PAPER_INVALIDATED",
      exitReason: regimeConflict ? "regime_direction_conflict" : "trend_strategy_invalidated",
      exitPrice: input.currentPrice,
      quantityPaper: input.position.remainingQuantityPaper,
      position: input.position,
      config: input.config,
    });
  }

  if (input.position.status === "OPEN" && tp1Hit && finite(input.position.takeProfit2) && !tp2Hit) {
    return buildExitEvent({
      nowIso: input.nowIso,
      symbol: input.symbol,
      eventType: "TREND_PAPER_PARTIAL",
      exitReason: "take_profit_1_partial",
      exitPrice: input.position.takeProfit1,
      quantityPaper: input.position.remainingQuantityPaper / 2,
      position: input.position,
      config: input.config,
    });
  }

  if (tp2Hit && finite(input.position.takeProfit2)) {
    return buildExitEvent({
      nowIso: input.nowIso,
      symbol: input.symbol,
      eventType: "TREND_PAPER_EXIT",
      exitReason: "take_profit_2_hit",
      exitPrice: input.position.takeProfit2!,
      quantityPaper: input.position.remainingQuantityPaper,
      position: input.position,
      config: input.config,
    });
  }

  if (tp1Hit) {
    return buildExitEvent({
      nowIso: input.nowIso,
      symbol: input.symbol,
      eventType: "TREND_PAPER_EXIT",
      exitReason: "take_profit_1_hit",
      exitPrice: input.position.takeProfit1,
      quantityPaper: input.position.remainingQuantityPaper,
      position: input.position,
      config: input.config,
    });
  }

  return noAction("OPEN_POSITION_WAITING");
}

export function evaluateTrendPaperExecutionEngine(
  input: TrendPaperExecutionInput,
): TrendPaperExecutionResult {
  const config = input.config;
  if (!config.enabled) return noAction("CONFIG_DISABLED");
  if (config.mode !== "PAPER_SIMULATION_ONLY") return noAction("MODE_NOT_PAPER_SIMULATION_ONLY");
  if ((config.maxConcurrentTrendPositions ?? 1) < 1) return noAction("MAX_CONCURRENT_TREND_POSITIONS_ZERO");

  const currentPrice = finite(input.currentPrice) ? input.currentPrice : null;
  if (!finite(currentPrice)) return noAction("MISSING_CURRENT_PRICE");

  const nowIso = asIso(input.now);
  const symbol = String(input.symbol ?? "BTC-USDT").trim() || "BTC-USDT";

  if (input.openTrendPaperPosition && input.openTrendPaperPosition.status !== "CLOSED" && input.openTrendPaperPosition.status !== "CANCELLED") {
    return evaluateExitLifecycle({
      position: input.openTrendPaperPosition,
      strategy: input.trendStrategy,
      canonicalMarketRegime: input.canonicalMarketRegime,
      candles: input.latest5mCandles ?? [],
      currentPrice,
      config,
      nowIso,
      symbol,
    });
  }

  const strategy = input.trendStrategy ?? null;
  const armGate = input.trendManualPaperArmGate ?? null;
  const preflight = input.trendPaperExecutionPreflight ?? null;
  const zone = input.trendZoneCandidate ?? null;

  if (!strategy) return noAction("MISSING_TREND_STRATEGY");
  if (!armGate) return noAction("MISSING_TREND_ARM_GATE");
  if (!preflight) return noAction("MISSING_TREND_PREFLIGHT");
  if (!zone) return noAction("MISSING_TREND_ZONE_CANDIDATE");
  if (!acceptedDirection(strategy.direction, config)) return noAction("DIRECTION_NOT_ALLOWED");
  if (strategy.oldExposurePolicy !== "QUARANTINE_OLD_GRID_EXPOSURE") return noAction("OLD_GRID_EXPOSURE_NOT_QUARANTINED");
  if (!(strategy.status === "AWAITING_CONFIRMATION" || strategy.status === "SETUP_READY")) return noAction("TREND_STRATEGY_NOT_ENTRY_READY");
  if (strategy.riskStatus !== "PASS") return noAction("TREND_STRATEGY_RISK_NOT_PASS");
  // Hardening (T-3A patch): only an explicit operator arm may trigger a paper entry.
  // READY_FOR_OPERATOR_REVIEW is notify/review-only — it must NOT auto-enter.
  if (armGate.status === "READY_FOR_OPERATOR_REVIEW") return noAction("OPERATOR_ARM_REQUIRED");
  if (armGate.status !== "OPERATOR_ARMED_PAPER_ONLY") return noAction("ARM_GATE_NOT_READY");
  if (preflight.status !== "READY_FOR_PAPER_SIMULATION_REVIEW") return noAction("PREFLIGHT_NOT_READY");
  if (zone.buildStatus !== "READY") return noAction("TREND_ZONE_NOT_READY");
  if (!regimeMatches(input.canonicalMarketRegime, strategy.direction)) return noAction("REGIME_DIRECTION_MISMATCH");
  if (!finite(strategy.rewardRisk) || strategy.rewardRisk < config.minRewardRisk) return noAction("REWARD_RISK_BELOW_MINIMUM");

  const entryZone = strategy.entryZone;
  if (!entryZone || !finite(entryZone[0]) || !finite(entryZone[1])) return noAction("ENTRY_ZONE_MISSING");
  if (!finite(preflight.stopLoss) || !finite(preflight.takeProfit1)) return noAction("PRELOAD_PRICE_LEVELS_MISSING");

  const tolerancePct = finite(config.entryEdgeTolerancePct) ? config.entryEdgeTolerancePct! : DEFAULT_ENTRY_EDGE_TOLERANCE_PCT;
  if (!priceInsideOrEdge(currentPrice, entryZone, tolerancePct)) return noAction("PRICE_NOT_IN_ENTRY_ZONE_OR_EDGE");

  const confirmation = evaluateFiveMinuteConfirmation({
    direction: strategy.direction as "LONG" | "SHORT",
    entryZone,
    invalidation: preflight.stopLoss as number,
    target1: preflight.takeProfit1 as number,
    candles: input.latest5mCandles ?? [],
    indicator5m: input.multiTimeframeIndicatorEvidence?.["5M"],
    currentPrice,
    nearTargetThresholdPct: finite(config.nearTargetThresholdPct)
      ? config.nearTargetThresholdPct!
      : DEFAULT_NEAR_TARGET_THRESHOLD_PCT,
  });
  if (!confirmation.pass) return noAction(confirmation.reason);

  const built = buildEntryEvent({
    nowIso,
    symbol,
    strategy,
    preflight,
    currentPrice,
    config,
  });
  return built.result;
}

export function summarizeTrendPaperExecutionSnapshot(args: {
  result: TrendPaperExecutionResult;
  config: TrendPaperExecutionConfig;
  openTrendPaperPosition: TrendPaperPosition | null | undefined;
  lastEntryAt: string | null | undefined;
  lastExitAt: string | null | undefined;
  closedTrades: TrendClosedTradeInput[] | null | undefined;
  edgeReview: Pick<TrendEdgeReview, "winRate" | "netExpectancyAfterCosts"> | null | undefined;
}): TrendPaperExecutionSnapshot {
  const closedTrades = Array.isArray(args.closedTrades) ? args.closedTrades : [];
  return {
    enabled: args.config.enabled,
    mode: args.config.mode,
    lastAction: args.result.action,
    lastReason: args.result.reason,
    openTrendPaperPosition: args.openTrendPaperPosition ?? null,
    lastEntryAt: args.lastEntryAt ?? null,
    lastExitAt: args.lastExitAt ?? null,
    trendPaperClosedTrades: closedTrades.length,
    winRate: args.edgeReview?.winRate ?? null,
    netExpectancyAfterCosts: args.edgeReview?.netExpectancyAfterCosts ?? null,
    paperOnly: true,
    liveActivationAllowed: false,
    exchangeOrderAllowed: false,
  };
}
