// D8.4.2 - offline-only point-in-time evidence slicing over supplied history.

import type {
  HistoricalReplayPoint,
  HistoricalReplayTimeframe,
} from "./historicalReplayCandidateScarcityReview.ts";

export interface NormalizedHistoricalCandle {
  t: number;
  open: number;
  high: number;
  low: number;
  close: number;
  complete: true;
}

export interface HistoricalReplaySnapshot {
  evaluatedAt: string;
  value: unknown;
}

export interface HistoricalReplayEvaluationContext {
  timeframe: HistoricalReplayTimeframe;
  evaluatedAt: string;
  candles: readonly NormalizedHistoricalCandle[];
  snapshot: unknown | null;
}

export interface BuildHistoricalReplayPointsInput {
  timeframe: HistoricalReplayTimeframe;
  candles: readonly unknown[];
  snapshots?: readonly HistoricalReplaySnapshot[];
  warmupCandles?: number;
  evaluatePoint: (context: HistoricalReplayEvaluationContext) => HistoricalReplayPoint;
}

type AnyObj = Record<string, unknown>;

function obj(value: unknown): AnyObj {
  return value && typeof value === "object" && !Array.isArray(value) ? value as AnyObj : {};
}

function finitePositive(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function timeframe(value: unknown): value is HistoricalReplayTimeframe {
  return value === "5M" || value === "15M" || value === "1H";
}

function normalizeCandle(value: unknown): NormalizedHistoricalCandle | null {
  const raw = obj(value);
  if (
    !finitePositive(raw.t)
    || !finitePositive(raw.open)
    || !finitePositive(raw.high)
    || !finitePositive(raw.low)
    || !finitePositive(raw.close)
    || raw.complete !== true
  ) return null;
  if (raw.high < Math.max(raw.open, raw.close, raw.low)) return null;
  if (raw.low > Math.min(raw.open, raw.close, raw.high)) return null;
  return {
    t: raw.t,
    open: raw.open,
    high: raw.high,
    low: raw.low,
    close: raw.close,
    complete: true,
  };
}

function normalizeCandles(values: readonly unknown[]): NormalizedHistoricalCandle[] {
  const byTimestamp = new Map<number, NormalizedHistoricalCandle>();
  for (const value of values) {
    const normalized = normalizeCandle(value);
    if (normalized) byTimestamp.set(normalized.t, normalized);
  }
  return [...byTimestamp.values()].sort((left, right) => left.t - right.t);
}

function cloneUnknown<T>(value: T): T {
  return structuredClone(value);
}

function normalizeSnapshots(values: readonly HistoricalReplaySnapshot[]): Array<{ at: number; value: unknown }> {
  const byTimestamp = new Map<number, unknown>();
  for (const snapshot of values) {
    const at = Date.parse(snapshot?.evaluatedAt);
    if (Number.isFinite(at)) byTimestamp.set(at, cloneUnknown(snapshot.value));
  }
  return [...byTimestamp.entries()]
    .map(([at, value]) => ({ at, value }))
    .sort((left, right) => left.at - right.at);
}

function latestSnapshotAt(
  snapshots: readonly { at: number; value: unknown }[],
  evaluatedAt: number,
): unknown | null {
  let latest: unknown | null = null;
  for (const snapshot of snapshots) {
    if (snapshot.at > evaluatedAt) break;
    latest = snapshot.value;
  }
  return latest == null ? null : cloneUnknown(latest);
}

function replayPointShape(value: unknown, evaluatedAt: string): value is HistoricalReplayPoint {
  const raw = obj(value);
  return raw.evaluatedAt === evaluatedAt
    && typeof raw.alignedContext === "boolean"
    && typeof raw.d8_0AlignedCandidate === "boolean"
    && typeof raw.rrReady === "boolean"
    && typeof raw.d8_2Status === "string"
    && typeof raw.triggerReached === "boolean"
    && typeof raw.d8_3Status === "string"
    && typeof raw.zoneTouched === "boolean"
    && typeof raw.confirmationWindowActive === "boolean"
    && typeof raw.d8_4Status === "string"
    && typeof raw.confirmationAligned === "boolean"
    && typeof raw.promotableReviewCandidate === "boolean"
    && typeof raw.bottleneckStatus === "string"
    && typeof raw.triggerDistanceClass === "string"
    && typeof raw.sourceSafetyValid === "boolean"
    && typeof raw.dataQualityValid === "boolean";
}

function invalidPoint(evaluatedAt: string): HistoricalReplayPoint {
  return {
    evaluatedAt,
    alignedContext: false,
    d8_0AlignedCandidate: false,
    rrReady: false,
    d8_2Status: "UNKNOWN",
    triggerReached: false,
    d8_3Status: "UNKNOWN",
    zoneTouched: false,
    confirmationWindowActive: false,
    d8_4Status: "UNKNOWN",
    confirmationAligned: false,
    promotableReviewCandidate: false,
    bottleneckStatus: "NO_CONTEXT",
    triggerDistanceClass: "UNKNOWN",
    sourceSafetyValid: false,
    dataQualityValid: false,
  };
}

export function buildHistoricalReplayPoints(
  input: BuildHistoricalReplayPointsInput,
): HistoricalReplayPoint[] {
  if (
    !input
    || !timeframe(input.timeframe)
    || !Array.isArray(input.candles)
    || typeof input.evaluatePoint !== "function"
  ) return [];

  const warmupCandles = input.warmupCandles ?? 1;
  if (!Number.isInteger(warmupCandles) || warmupCandles < 1) return [];

  const candles = normalizeCandles(input.candles);
  if (candles.length < warmupCandles) return [];
  const snapshots = normalizeSnapshots(Array.isArray(input.snapshots) ? input.snapshots : []);
  const points: HistoricalReplayPoint[] = [];

  for (let index = warmupCandles - 1; index < candles.length; index += 1) {
    const current = candles[index];
    if (!current) continue;
    const evaluatedAt = new Date(current.t).toISOString();
    const prefix = candles.slice(0, index + 1).map((candle) => ({ ...candle }));
    const context: HistoricalReplayEvaluationContext = {
      timeframe: input.timeframe,
      evaluatedAt,
      candles: prefix,
      snapshot: latestSnapshotAt(snapshots, current.t),
    };
    try {
      const evaluated = input.evaluatePoint(context);
      points.push(replayPointShape(evaluated, evaluatedAt) ? evaluated : invalidPoint(evaluatedAt));
    } catch {
      points.push(invalidPoint(evaluatedAt));
    }
  }

  return points;
}
