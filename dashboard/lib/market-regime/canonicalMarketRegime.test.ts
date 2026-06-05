import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildCanonicalMarketRegime,
  buildMultiTimeframeIndicatorEvidence,
  type MultiTimeframeIndicatorEvidence,
} from "./canonicalMarketRegime.ts";
import type { IndicatorCandle } from "../indicators/computeIndicators.ts";

function evidence(overrides: Partial<MultiTimeframeIndicatorEvidence[string]> = {}): MultiTimeframeIndicatorEvidence[string] {
  return {
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
    timeframe: "15M",
    freshness: { latestCandleAt: "2026-06-05T00:00:00.000Z", ageMs: 60_000 },
    missingFields: [],
    notes: [],
    ema50: null,
    ema200: null,
    ...overrides,
  };
}

function candles(count: number, start = Date.parse("2026-06-04T00:00:00.000Z")): IndicatorCandle[] {
  return Array.from({ length: count }, (_, index) => {
    const close = 1000 - index * 2;
    return {
      t: start + index * 60_000,
      open: close + 1,
      high: close + 5,
      low: close - 5,
      close,
      volume: 1,
    };
  });
}

test("current runtime example classifies as DOWNTREND / BEARISH and blocks neutral grid", () => {
  const regime = buildCanonicalMarketRegime({
    marketSnapshot: { meta: { generated_at: "2026-06-05T00:00:00.000Z" } },
    indicatorEvidenceByTimeframe: {
      "15M": evidence(),
      "1H": evidence({ timeframe: "1H" }),
      "4H": evidence({ timeframe: "4H", adx: 22, macdHistogram: -20, emaSlope: -10 }),
    },
    priceVsGrid: "BELOW_GRID",
    dynamicGridState: "REGRID_REQUIRED",
    legacyPlanMode: "GRID_NEUTRAL",
  });

  assert.equal(regime.regime, "DOWNTREND");
  assert.equal(regime.direction, "BEARISH");
  assert.ok(regime.allowedModes.includes("NO_TRADE"));
  assert.ok(regime.allowedModes.includes("TREND_CHECK"));
  assert.ok(regime.blockedModes.includes("NEUTRAL_GRID"));
  assert.ok(regime.blockedModes.includes("DYNAMIC_NEUTRAL_GRID"));
  assert.ok(regime.blockedModes.includes("PHASE_2B_ACTIVATION"));
  assert.deepEqual(regime.ignoredLegacyFields, ["latest_decision.market_mode"]);
  assert.equal(regime.shadowOnly, true);
  assert.equal(regime.paperActivationAllowed, false);
  assert.equal(regime.liveActivationAllowed, false);
});

test("legacy GRID_NEUTRAL plan mode is ignored for canonical regime classification", () => {
  const regime = buildCanonicalMarketRegime({
    marketSnapshot: {},
    indicatorEvidenceByTimeframe: {
      "15M": evidence(),
      "1H": evidence({ timeframe: "1H" }),
      "4H": evidence({ timeframe: "4H" }),
    },
    legacyPlanMode: "GRID_NEUTRAL",
  });

  assert.equal(regime.regime, "DOWNTREND");
  assert.ok(regime.reasons.includes("ignored_legacy_plan_mode_for_canonical_regime"));
  assert.ok(regime.ignoredLegacyFields.includes("latest_decision.market_mode"));
});

test("ADX high with plusDI dominance, positive MACD histogram, positive EMA slope classifies UPTREND", () => {
  const regime = buildCanonicalMarketRegime({
    marketSnapshot: {},
    indicatorEvidenceByTimeframe: {
      "15M": evidence({ adx: 31, plusDI: 30, minusDI: 12, rsi: 62, macdHistogram: 12, emaSlope: 8 }),
      "1H": evidence({ timeframe: "1H", adx: 28, plusDI: 24, minusDI: 11, rsi: 58, macdHistogram: 7, emaSlope: 5 }),
      "4H": evidence({ timeframe: "4H", adx: 21, plusDI: 20, minusDI: 14, rsi: 55, macdHistogram: 2, emaSlope: 2 }),
    },
  });

  assert.equal(regime.regime, "UPTREND");
  assert.equal(regime.direction, "BULLISH");
});

test("low ADX with neutral RSI and low volatility classifies RANGE", () => {
  const regime = buildCanonicalMarketRegime({
    marketSnapshot: {},
    indicatorEvidenceByTimeframe: {
      "15M": evidence({ adx: 17, plusDI: 16, minusDI: 15, rsi: 50, atrPct: 0.5, bbw: 0.02, macdHistogram: 0.5, emaSlope: 0.1 }),
      "1H": evidence({ timeframe: "1H", adx: 18, plusDI: 15, minusDI: 14, rsi: 52, atrPct: 0.6, bbw: 0.02, macdHistogram: -0.2, emaSlope: -0.1 }),
      "4H": evidence({ timeframe: "4H", adx: 19, plusDI: 14, minusDI: 14, rsi: 48, atrPct: 0.6, bbw: 0.02, macdHistogram: 0, emaSlope: 0 }),
    },
  });

  assert.equal(regime.regime, "RANGE");
  assert.equal(regime.direction, "NEUTRAL");
});

test("missing 4H or 1H biases to NO_TRADE with warning", () => {
  const regime = buildCanonicalMarketRegime({
    marketSnapshot: {},
    indicatorEvidenceByTimeframe: { "15M": evidence() },
  });

  assert.equal(regime.regime, "NO_TRADE");
  assert.ok(regime.warnings.includes("missing_required_timeframe_1H"));
  assert.ok(regime.warnings.includes("missing_required_timeframe_4H"));
});

test("stale source reduces confidence and surfaces warning", () => {
  const regime = buildCanonicalMarketRegime({
    marketSnapshot: { meta: { generated_at: "2026-06-05T00:00:00.000Z" } },
    indicatorEvidenceByTimeframe: {
      "15M": evidence({ freshness: { latestCandleAt: "2026-06-04T00:00:00.000Z", ageMs: 24 * 60 * 60_000 } }),
      "1H": evidence({ timeframe: "1H" }),
      "4H": evidence({ timeframe: "4H" }),
    },
  });

  assert.ok(regime.confidence < 70);
  assert.ok(regime.sourceFreshness.warnings.includes("stale_candle_15M"));
});

test("multi-timeframe indicators map 1H/4H/15M and insufficient candles return null fields", () => {
  const mtf = buildMultiTimeframeIndicatorEvidence({
    market_data: {
      klines: {
        "15M": { candles: candles(80) },
        "1H": { candles: candles(80) },
        "4H": { candles: candles(220) },
        "1D": { candles: candles(10) },
      },
    },
    meta: { generated_at: "2026-06-05T00:00:00.000Z" },
  }, { nowMs: Date.parse("2026-06-05T00:00:00.000Z") });

  assert.equal(mtf["15M"]?.timeframe, "15M");
  assert.equal(mtf["1H"]?.timeframe, "1H");
  assert.equal(mtf["4H"]?.timeframe, "4H");
  assert.equal(typeof mtf["4H"]?.ema200, "number");
  assert.equal(typeof mtf["1H"]?.ema50, "number");
  assert.equal(mtf["1D"]?.adx, null);
  assert.ok(mtf["1D"]?.missingFields.includes("adx"));
});
