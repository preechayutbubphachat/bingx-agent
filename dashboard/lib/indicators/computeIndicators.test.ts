import { test } from "node:test";
import assert from "node:assert/strict";
import { computeIndicatorEvidence, type IndicatorCandle } from "./computeIndicators.ts";

function makeCandles(count: number, direction: "up" | "down" | "flat" = "up"): IndicatorCandle[] {
  const start = Date.parse("2026-06-01T00:00:00.000Z");
  return Array.from({ length: count }, (_, index) => {
    const drift = direction === "up" ? index * 2 : direction === "down" ? -index * 2 : Math.sin(index / 3) * 2;
    const close = 100 + drift + Math.sin(index / 2);
    const open = close - (direction === "down" ? -0.8 : 0.8);
    return {
      t: start + index * 15 * 60_000,
      open,
      high: Math.max(open, close) + 2,
      low: Math.min(open, close) - 2,
      close,
      volume: 100 + index,
    };
  });
}

test("RSI stays within 0-100 when enough candles are available", () => {
  const evidence = computeIndicatorEvidence(makeCandles(80));

  assert.equal(evidence.timeframe, "15m");
  assert.equal(evidence.source, "market_snapshot");
  assert.equal(evidence.candleCount, 80);
  assert.equal(typeof evidence.rsi, "number");
  assert.ok(evidence.rsi! >= 0);
  assert.ok(evidence.rsi! <= 100);
});

test("ADX and DI produce numeric values with enough candles", () => {
  const evidence = computeIndicatorEvidence(makeCandles(80));

  assert.equal(typeof evidence.adx, "number");
  assert.equal(typeof evidence.plusDI, "number");
  assert.equal(typeof evidence.minusDI, "number");
  assert.ok(evidence.adx! >= 0);
  assert.ok(evidence.plusDI! >= 0);
  assert.ok(evidence.minusDI! >= 0);
});

test("insufficient candles return null indicators and missing fields", () => {
  const evidence = computeIndicatorEvidence(makeCandles(10));

  assert.equal(evidence.rsi, null);
  assert.equal(evidence.adx, null);
  assert.equal(evidence.macd, null);
  assert.ok(evidence.missingFields.includes("rsi"));
  assert.ok(evidence.missingFields.includes("adx"));
  assert.ok(evidence.notes.includes("insufficient_candles"));
});

test("ATR percent is ATR divided by latest close times 100", () => {
  const evidence = computeIndicatorEvidence(makeCandles(80));
  const expected = evidence.atr! / makeCandles(80).at(-1)!.close * 100;

  assert.equal(typeof evidence.atr, "number");
  assert.equal(typeof evidence.atrPct, "number");
  assert.ok(Math.abs(evidence.atrPct! - expected) < 1e-9);
});

test("MACD returns macd, signal, and histogram", () => {
  const evidence = computeIndicatorEvidence(makeCandles(80));

  assert.equal(typeof evidence.macd, "number");
  assert.equal(typeof evidence.macdSignal, "number");
  assert.equal(typeof evidence.macdHistogram, "number");
  assert.ok(Math.abs(evidence.macd! - evidence.macdSignal! - evidence.macdHistogram!) < 1e-9);
});

test("EMA slope sign follows obvious trend direction", () => {
  const up = computeIndicatorEvidence(makeCandles(80, "up"));
  const down = computeIndicatorEvidence(makeCandles(80, "down"));

  assert.ok(up.emaSlope! > 0);
  assert.ok(down.emaSlope! < 0);
});

test("BBW is numeric with enough candles", () => {
  const evidence = computeIndicatorEvidence(makeCandles(80, "flat"));

  assert.equal(typeof evidence.bbw, "number");
  assert.ok(evidence.bbw! >= 0);
});

test("malformed candles degrade gracefully", () => {
  const evidence = computeIndicatorEvidence([{ t: 1, open: NaN, high: 1, low: 1, close: 1 }]);

  assert.equal(evidence.candleCount, 0);
  assert.equal(evidence.rsi, null);
  assert.equal(evidence.adx, null);
  assert.ok(evidence.notes.includes("no_valid_candles"));
});

test("freshness uses latest candle timestamp", () => {
  const candles = makeCandles(80);
  const evidence = computeIndicatorEvidence(candles, { nowMs: candles.at(-1)!.t + 60_000 });

  assert.equal(evidence.freshness.latestCandleAt, new Date(candles.at(-1)!.t).toISOString());
  assert.equal(evidence.freshness.ageMs, 60_000);
});
