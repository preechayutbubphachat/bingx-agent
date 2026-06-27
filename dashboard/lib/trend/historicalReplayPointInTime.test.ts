import assert from "node:assert/strict";
import test from "node:test";
import type { HistoricalReplayPoint } from "./historicalReplayCandidateScarcityReview.ts";
import {
  buildHistoricalReplayPoints,
  type HistoricalReplayEvaluationContext,
} from "./historicalReplayPointInTime.ts";

const BASE = Date.UTC(2026, 0, 1);

function candle(index: number, overrides: Record<string, unknown> = {}) {
  const close = 100 + index;
  return {
    t: BASE + index * 5 * 60_000,
    open: close - 1,
    high: close + 2,
    low: close - 2,
    close,
    complete: true,
    ...overrides,
  };
}

function replayPoint(context: HistoricalReplayEvaluationContext): HistoricalReplayPoint {
  return {
    evaluatedAt: context.evaluatedAt,
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

test("normalizes supplied history and exposes only point-in-time evidence", () => {
  const candles = [
    candle(3),
    candle(1, { close: 101.25 }),
    candle(2),
    candle(1, { close: 101.75 }),
    candle(4, { complete: false }),
    candle(5, { high: 90, low: 110 }),
  ];
  const snapshots = [
    { evaluatedAt: new Date(BASE + 3 * 5 * 60_000).toISOString(), value: { id: "third" } },
    { evaluatedAt: new Date(BASE + 1 * 5 * 60_000).toISOString(), value: { id: "first-old" } },
    { evaluatedAt: new Date(BASE + 1 * 5 * 60_000).toISOString(), value: { id: "first-latest" } },
    { evaluatedAt: new Date(BASE + 10 * 5 * 60_000).toISOString(), value: { id: "future" } },
  ];
  const beforeCandles = structuredClone(candles);
  const beforeSnapshots = structuredClone(snapshots);
  const seen: Array<{ evaluatedAt: number; maxCandleAt: number; snapshotId: string | null; closeAtOne: number }> = [];

  const result = buildHistoricalReplayPoints({
    timeframe: "5M",
    candles,
    snapshots,
    warmupCandles: 2,
    evaluatePoint(context) {
      const evaluatedAt = Date.parse(context.evaluatedAt);
      const maxCandleAt = Math.max(...context.candles.map((item) => item.t));
      const snapshotId = (context.snapshot as { id?: string } | null)?.id ?? null;
      seen.push({
        evaluatedAt,
        maxCandleAt,
        snapshotId,
        closeAtOne: context.candles.find((item) => item.t === BASE + 5 * 60_000)?.close ?? 0,
      });
      return replayPoint(context);
    },
  });

  assert.equal(result.length, 2);
  assert.deepEqual(result.map((item) => item.evaluatedAt), [
    new Date(BASE + 2 * 5 * 60_000).toISOString(),
    new Date(BASE + 3 * 5 * 60_000).toISOString(),
  ]);
  assert.ok(seen.every((item) => item.maxCandleAt <= item.evaluatedAt));
  assert.deepEqual(seen.map((item) => item.snapshotId), ["first-latest", "third"]);
  assert.ok(seen.every((item) => item.closeAtOne === 101.75));
  assert.deepEqual(candles, beforeCandles);
  assert.deepEqual(snapshots, beforeSnapshots);
});

test("isolates evaluator failures into deterministic invalid replay points", () => {
  const result = buildHistoricalReplayPoints({
    timeframe: "15M",
    candles: [candle(1), candle(2)],
    warmupCandles: 1,
    evaluatePoint(context) {
      if (Date.parse(context.evaluatedAt) === BASE + 2 * 5 * 60_000) {
        throw new Error("offline evaluation failed");
      }
      return replayPoint(context);
    },
  });

  assert.equal(result.length, 2);
  assert.equal(result[0]?.dataQualityValid, true);
  assert.equal(result[1]?.dataQualityValid, false);
  assert.equal(result[1]?.sourceSafetyValid, false);
  assert.equal(result[1]?.bottleneckStatus, "NO_CONTEXT");
  assert.equal(result[1]?.promotableReviewCandidate, false);
});

test("invalid top-level input produces no replay points without mutation", () => {
  const candles = [candle(1)];
  const before = structuredClone(candles);

  const result = buildHistoricalReplayPoints({
    timeframe: "5M",
    candles,
    warmupCandles: 0,
    evaluatePoint: replayPoint,
  });

  assert.deepEqual(result, []);
  assert.deepEqual(candles, before);
});
