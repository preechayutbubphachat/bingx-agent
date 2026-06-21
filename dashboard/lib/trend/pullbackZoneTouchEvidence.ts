// dashboard/lib/trend/pullbackZoneTouchEvidence.ts
// D8.3 - pure recent-candle pullback touch and confirmation-window diagnostics.

const FIVE_MINUTE_LOOKBACK = 12;
const FIFTEEN_MINUTE_LOOKBACK = 8;
const FIVE_MINUTE_WINDOW = 3;
const FIFTEEN_MINUTE_WINDOW = 2;

export type PullbackZoneTouchEvidenceStatus =
  | "NO_TRIGGER_CONTEXT"
  | "NO_TOUCH_YET"
  | "CONFIRMATION_WINDOW_ACTIVE"
  | "CONFIRMATION_WINDOW_EXPIRED"
  | "INVALIDATION_RISK_TOUCHED";

export type PullbackZoneTouchType =
  | "RAW_ZONE_TOUCHED"
  | "EXPANDED_ZONE_TOUCHED";

export type ConfirmationWindowStatus =
  | "NOT_AVAILABLE"
  | "WAITING_FOR_TOUCH"
  | "ACTIVE"
  | "EXPIRED"
  | "INVALIDATED";

export interface PullbackZoneTouchEvidenceInput {
  pullbackTriggerThresholds?: unknown;
  resolverDrivenPullbackGate?: unknown;
  recent5mCandles?: readonly unknown[] | null;
  recent15mCandles?: readonly unknown[] | null;
}

export interface PullbackZoneTouchEvidence {
  schemaVersion: 1;
  source: "PULLBACK_ZONE_TOUCH_EVIDENCE_V1";
  readiness: "REVIEW_NOT_ACTIVATION";
  status: PullbackZoneTouchEvidenceStatus;
  alignedDirection: "LONG" | "SHORT" | "UNKNOWN";
  currentPrice: number | null;
  rawZoneLow: number | null;
  rawZoneHigh: number | null;
  expandedZoneLow: number | null;
  expandedZoneHigh: number | null;
  triggerPrice: number | null;
  lastTouchAt: string | null;
  lastTouchTimeframe: "5M" | "15M" | null;
  candlesSinceTouch: number | null;
  touchType: PullbackZoneTouchType | null;
  deepestTouchPrice: number | null;
  touchDistancePct: number | null;
  confirmationWindowCandles: number | null;
  confirmationWindowStatus: ConfirmationWindowStatus;
  shouldEvaluateConfirmation: boolean;
  blockers: string[];
  nextAction: string;
  activationAllowed: false;
  paperActivationAllowed: false;
  liveActivationAllowed: false;
  reviewOnly: true;
  shadowOnly: true;
}

type AnyObj = Record<string, unknown>;
type AlignedDirection = "LONG" | "SHORT";
type SelectedTimeframe = "5M" | "15M";

interface NormalizedTouchCandle {
  t: number;
  high: number;
  low: number;
}

interface TriggerContext {
  direction: AlignedDirection;
  currentPrice: number;
  rawLow: number;
  rawHigh: number;
  expandedLow: number;
  expandedHigh: number;
  triggerPrice: number;
  rrReady: boolean;
  safetyValid: boolean;
}

function obj(value: unknown): AnyObj {
  return value && typeof value === "object" && !Array.isArray(value) ? value as AnyObj : {};
}

function finitePositive(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function baseOutput(overrides: Partial<PullbackZoneTouchEvidence> = {}): PullbackZoneTouchEvidence {
  return {
    schemaVersion: 1,
    source: "PULLBACK_ZONE_TOUCH_EVIDENCE_V1",
    readiness: "REVIEW_NOT_ACTIVATION",
    status: "NO_TRIGGER_CONTEXT",
    alignedDirection: "UNKNOWN",
    currentPrice: null,
    rawZoneLow: null,
    rawZoneHigh: null,
    expandedZoneLow: null,
    expandedZoneHigh: null,
    triggerPrice: null,
    lastTouchAt: null,
    lastTouchTimeframe: null,
    candlesSinceTouch: null,
    touchType: null,
    deepestTouchPrice: null,
    touchDistancePct: null,
    confirmationWindowCandles: null,
    confirmationWindowStatus: "NOT_AVAILABLE",
    shouldEvaluateConfirmation: false,
    blockers: ["NO_TRIGGER_CONTEXT"],
    nextAction: "wait for valid D8.2 pullback trigger geometry",
    activationAllowed: false,
    paperActivationAllowed: false,
    liveActivationAllowed: false,
    reviewOnly: true,
    shadowOnly: true,
    ...overrides,
  };
}

function readTriggerContext(triggerInput: unknown, gateInput: unknown): TriggerContext | null {
  const trigger = obj(triggerInput);
  const gate = obj(gateInput);
  const direction = trigger.alignedDirection === "LONG" || trigger.alignedDirection === "SHORT"
    ? trigger.alignedDirection
    : null;
  const currentPrice = finitePositive(trigger.currentPrice) ? trigger.currentPrice : null;
  const rawLow = finitePositive(trigger.rawZoneLow) ? trigger.rawZoneLow : null;
  const rawHigh = finitePositive(trigger.rawZoneHigh) ? trigger.rawZoneHigh : null;
  const expandedLow = finitePositive(trigger.expandedZoneLow) ? trigger.expandedZoneLow : null;
  const expandedHigh = finitePositive(trigger.expandedZoneHigh) ? trigger.expandedZoneHigh : null;
  const triggerPrice = finitePositive(trigger.triggerPrice) ? trigger.triggerPrice : null;

  if (
    !direction || currentPrice == null || rawLow == null || rawHigh == null
    || expandedLow == null || expandedHigh == null || triggerPrice == null
    || rawLow > rawHigh || expandedLow > expandedHigh || trigger.status === "NO_GATE"
  ) {
    return null;
  }

  return {
    direction,
    currentPrice,
    rawLow,
    rawHigh,
    expandedLow,
    expandedHigh,
    triggerPrice,
    rrReady: trigger.rrReady === true,
    safetyValid:
      trigger.activationAllowed === false
      && trigger.paperActivationAllowed === false
      && trigger.liveActivationAllowed === false
      && gate.activationAllowed === false
      && gate.paperActivationAllowed === false
      && gate.liveActivationAllowed === false,
  };
}

function normalizeCandles(input: readonly unknown[] | null | undefined): NormalizedTouchCandle[] {
  if (!Array.isArray(input)) return [];
  const byTimestamp = new Map<number, NormalizedTouchCandle>();
  for (const value of input) {
    const candle = obj(value);
    if (!finitePositive(candle.t) || !finitePositive(candle.high) || !finitePositive(candle.low)) continue;
    if (candle.high < candle.low) continue;
    byTimestamp.set(candle.t, { t: candle.t, high: candle.high, low: candle.low });
  }
  return [...byTimestamp.values()].sort((left, right) => left.t - right.t);
}

function intersects(candle: NormalizedTouchCandle, low: number, high: number): boolean {
  return candle.low <= high && candle.high >= low;
}

function touchType(candle: NormalizedTouchCandle, context: TriggerContext): PullbackZoneTouchType | null {
  if (intersects(candle, context.rawLow, context.rawHigh)) return "RAW_ZONE_TOUCHED";
  if (intersects(candle, context.expandedLow, context.expandedHigh)) return "EXPANDED_ZONE_TOUCHED";
  return null;
}

function touchDistancePct(context: TriggerContext, deepestTouchPrice: number): number {
  if (context.direction === "LONG") {
    return Math.max(0, (context.triggerPrice - deepestTouchPrice) / context.triggerPrice * 100);
  }
  return Math.max(0, (deepestTouchPrice - context.triggerPrice) / context.triggerPrice * 100);
}

function nextAction(input: {
  status: PullbackZoneTouchEvidenceStatus;
  direction: AlignedDirection;
  noValidCandles: boolean;
  shouldEvaluate: boolean;
  rrReady: boolean;
  safetyValid: boolean;
}): string {
  if (input.status === "INVALIDATION_RISK_TOUCHED") {
    return "re-evaluate resolver and zone geometry before review";
  }
  if (input.status === "CONFIRMATION_WINDOW_EXPIRED") {
    return `wait for a new touch of the expanded ${input.direction} zone`;
  }
  if (input.status === "CONFIRMATION_WINDOW_ACTIVE") {
    if (input.shouldEvaluate) return `evaluate fresh 5M/15M confirmation for aligned ${input.direction}`;
    if (!input.rrReady) return "retain touch evidence and wait for resolver RR readiness";
    if (!input.safetyValid) return "retain touch evidence in review-only mode until source safety is valid";
  }
  if (input.noValidCandles) return "wait for valid recent 5M or 15M candle evidence";
  return `wait for price to touch the expanded ${input.direction} zone`;
}

export function evaluatePullbackZoneTouchEvidence(
  input: PullbackZoneTouchEvidenceInput,
): PullbackZoneTouchEvidence {
  const context = readTriggerContext(input.pullbackTriggerThresholds, input.resolverDrivenPullbackGate);
  if (!context) return baseOutput();

  const normalized5m = normalizeCandles(input.recent5mCandles);
  const normalized15m = normalizeCandles(input.recent15mCandles);
  const timeframe: SelectedTimeframe | null = normalized5m.length ? "5M" : normalized15m.length ? "15M" : null;
  const lookbackLimit = timeframe === "5M" ? FIVE_MINUTE_LOOKBACK : FIFTEEN_MINUTE_LOOKBACK;
  const confirmationWindow = timeframe === "5M" ? FIVE_MINUTE_WINDOW : timeframe === "15M" ? FIFTEEN_MINUTE_WINDOW : null;
  const selected = timeframe === "5M" ? normalized5m : timeframe === "15M" ? normalized15m : [];
  const candles = selected.slice(-lookbackLimit);
  const geometry = {
    alignedDirection: context.direction,
    currentPrice: context.currentPrice,
    rawZoneLow: context.rawLow,
    rawZoneHigh: context.rawHigh,
    expandedZoneLow: context.expandedLow,
    expandedZoneHigh: context.expandedHigh,
    triggerPrice: context.triggerPrice,
  } as const;

  if (!timeframe || !candles.length || confirmationWindow == null) {
    const blockers = ["NO_VALID_CANDLES"];
    if (!context.rrReady) blockers.push("RR_NOT_READY");
    if (!context.safetyValid) blockers.push("SOURCE_SAFETY_FLAGS_INVALID");
    return baseOutput({
      ...geometry,
      status: "NO_TOUCH_YET",
      blockers,
      nextAction: nextAction({
        status: "NO_TOUCH_YET",
        direction: context.direction,
        noValidCandles: true,
        shouldEvaluate: false,
        rrReady: context.rrReady,
        safetyValid: context.safetyValid,
      }),
    });
  }

  const invalidationEntries = candles
    .map((candle, index) => ({ candle, index }))
    .filter(({ candle }) => context.direction === "LONG"
      ? candle.low < context.expandedLow
      : candle.high > context.expandedHigh);
  const zoneTouchEntries = candles
    .map((candle, index) => ({ candle, index }))
    .filter(({ candle }) => intersects(candle, context.expandedLow, context.expandedHigh));
  const blockers: string[] = [];
  let status: PullbackZoneTouchEvidenceStatus;
  let windowStatus: ConfirmationWindowStatus;
  let eventEntry: { candle: NormalizedTouchCandle; index: number } | null = null;
  let deepestTouchPrice: number | null = null;

  if (invalidationEntries.length) {
    status = "INVALIDATION_RISK_TOUCHED";
    windowStatus = "INVALIDATED";
    eventEntry = invalidationEntries[invalidationEntries.length - 1] ?? null;
    deepestTouchPrice = context.direction === "LONG"
      ? Math.min(...invalidationEntries.map(({ candle }) => candle.low))
      : Math.max(...invalidationEntries.map(({ candle }) => candle.high));
    blockers.push("INVALIDATION_RISK_TOUCHED");
  } else if (zoneTouchEntries.length) {
    eventEntry = zoneTouchEntries[zoneTouchEntries.length - 1] ?? null;
    deepestTouchPrice = context.direction === "LONG"
      ? Math.min(...zoneTouchEntries.map(({ candle }) => candle.low))
      : Math.max(...zoneTouchEntries.map(({ candle }) => candle.high));
    const candlesSinceTouch = eventEntry ? candles.length - 1 - eventEntry.index : null;
    if (candlesSinceTouch != null && candlesSinceTouch < confirmationWindow) {
      status = "CONFIRMATION_WINDOW_ACTIVE";
      windowStatus = "ACTIVE";
    } else {
      status = "CONFIRMATION_WINDOW_EXPIRED";
      windowStatus = "EXPIRED";
      blockers.push("CONFIRMATION_WINDOW_EXPIRED");
    }
  } else {
    status = "NO_TOUCH_YET";
    windowStatus = "WAITING_FOR_TOUCH";
    blockers.push("PULLBACK_ZONE_NOT_TOUCHED");
  }

  if (!context.rrReady) blockers.push("RR_NOT_READY");
  if (!context.safetyValid) blockers.push("SOURCE_SAFETY_FLAGS_INVALID");

  const shouldEvaluate = status === "CONFIRMATION_WINDOW_ACTIVE"
    && context.rrReady
    && context.safetyValid;
  const eventCandle = eventEntry?.candle ?? null;
  const eventType = eventCandle ? touchType(eventCandle, context) : null;
  const candlesSinceTouch = eventEntry ? candles.length - 1 - eventEntry.index : null;

  return baseOutput({
    ...geometry,
    status,
    lastTouchAt: eventCandle ? new Date(eventCandle.t).toISOString() : null,
    lastTouchTimeframe: eventCandle ? timeframe : null,
    candlesSinceTouch,
    touchType: eventType,
    deepestTouchPrice,
    touchDistancePct: deepestTouchPrice == null ? null : touchDistancePct(context, deepestTouchPrice),
    confirmationWindowCandles: confirmationWindow,
    confirmationWindowStatus: windowStatus,
    shouldEvaluateConfirmation: shouldEvaluate,
    blockers,
    nextAction: nextAction({
      status,
      direction: context.direction,
      noValidCandles: false,
      shouldEvaluate,
      rrReady: context.rrReady,
      safetyValid: context.safetyValid,
    }),
  });
}
