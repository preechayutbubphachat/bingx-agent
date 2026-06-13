import test from "node:test";
import assert from "node:assert/strict";

import { buildLatestCanonicalMarketRegimeDiagnostic } from "./readLatest.ts";
import type { IndicatorCandle } from "./indicators/computeIndicators.ts";

function makeCandles(count: number, timeframeMinutes: number): IndicatorCandle[] {
  const start = Date.parse("2026-06-01T00:00:00.000Z");
  return Array.from({ length: count }, (_, index) => {
    const lateAcceleration = Math.max(0, index - Math.floor(count * 0.6));
    const close = 10_000 - index * 8 - lateAcceleration * lateAcceleration * 0.08 + Math.sin(index / 3);
    const open = close + 4;
    return {
      t: start + index * timeframeMinutes * 60_000,
      open,
      high: Math.max(open, close) + 8,
      low: Math.min(open, close) - 8,
      close,
      volume: 100 + index,
    };
  });
}

function snapshot() {
  return {
    meta: { generated_at: "2026-06-02T00:00:00.000Z" },
    market_data: {
      klines: {
        "15M": { candles: makeCandles(120, 15) },
        "1H": { candles: makeCandles(120, 60) },
        "4H": { candles: makeCandles(220, 240) },
      },
    },
  };
}

test("canonical DOWNTREND diagnostic is surfaced when latest decision regime is null", () => {
  const diagnostic = buildLatestCanonicalMarketRegimeDiagnostic({
    decision: { regime: null, market_mode: "GRID_NEUTRAL" },
    marketSnapshot: snapshot(),
    computedAt: "2026-06-02T00:00:00.000Z",
  });

  assert.ok(diagnostic);
  assert.equal(diagnostic.regime, "DOWNTREND");
  assert.equal(diagnostic.direction, "BEARISH");
  assert.equal(diagnostic.decisionRegime, null);
  assert.equal(diagnostic.decisionRegimeMismatch, false);
  assert.equal(diagnostic.source, "canonicalMarketRegime");
  assert.equal(diagnostic.paperActivationAllowed, false);
  assert.equal(diagnostic.liveActivationAllowed, false);
  assert.ok(diagnostic.reasons.includes("ignored_legacy_plan_mode_for_canonical_regime"));
});

test("canonical diagnostic does not erase existing decision regime and can flag mismatch", () => {
  const diagnostic = buildLatestCanonicalMarketRegimeDiagnostic({
    decision: { regime: "RANGE", market_mode: "GRID_NEUTRAL" },
    marketSnapshot: snapshot(),
    computedAt: "2026-06-02T00:00:00.000Z",
  });

  assert.ok(diagnostic);
  assert.equal(diagnostic.regime, "DOWNTREND");
  assert.equal(diagnostic.decisionRegime, "RANGE");
  assert.equal(diagnostic.decisionRegimeMismatch, true);
});

test("missing market snapshot returns null diagnostic", () => {
  const diagnostic = buildLatestCanonicalMarketRegimeDiagnostic({
    decision: { regime: null },
    marketSnapshot: null,
  });
  assert.equal(diagnostic, null);
});
