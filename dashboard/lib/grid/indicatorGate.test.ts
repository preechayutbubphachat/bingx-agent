import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateIndicatorGate, type IndicatorGateInput } from "./indicatorGate.ts";

const BASE: IndicatorGateInput = {
  adx: 35.44,
  plusDI: 14.7,
  minusDI: 29.43,
  rsi: 40.51,
  atrPct: 0.75,
  bbw: 0.03,
  macdHistogram: -92.09,
  emaSlope: -104.55,
  freshness: { latestCandleAt: "2026-06-05T00:00:00.000Z", ageMs: 60_000 },
};

test("current runtime evidence classifies as TREND_DOWN_BLOCK", () => {
  const gate = evaluateIndicatorGate(BASE);

  assert.equal(gate.status, "TREND_DOWN_BLOCK");
  assert.equal(gate.blocking, true);
  assert.equal(gate.confidence, "high");
  assert.equal(gate.paperActivationAllowed, false);
  assert.equal(gate.liveActivationAllowed, false);
  assert.ok(gate.reasons.includes("trend_down_confirmed"));
});

test("ADX exactly 25 does not trigger strict trend-down block", () => {
  const gate = evaluateIndicatorGate({ ...BASE, adx: 25 });

  assert.notEqual(gate.status, "TREND_DOWN_BLOCK");
  assert.ok(gate.failed.includes("adx_gt_25"));
});

test("minusDI exactly plusDI * 1.2 does not trigger strict dominance block", () => {
  const gate = evaluateIndicatorGate({ ...BASE, plusDI: 10, minusDI: 12 });

  assert.notEqual(gate.status, "TREND_DOWN_BLOCK");
  assert.ok(gate.failed.includes("minus_di_gt_plus_di_x_1_2"));
});

test("missing ADX returns INSUFFICIENT_DATA", () => {
  const gate = evaluateIndicatorGate({ ...BASE, adx: null });

  assert.equal(gate.status, "INSUFFICIENT_DATA");
  assert.equal(gate.blocking, true);
  assert.ok(gate.reasons.includes("missing_adx"));
});

test("missing MACD histogram returns INSUFFICIENT_DATA", () => {
  const gate = evaluateIndicatorGate({ ...BASE, macdHistogram: null });

  assert.equal(gate.status, "INSUFFICIENT_DATA");
  assert.equal(gate.blocking, true);
  assert.ok(gate.reasons.includes("missing_macd_histogram"));
});

test("RANGE_WATCH remains shadow-only and never allows activation", () => {
  const gate = evaluateIndicatorGate({
    ...BASE,
    adx: 18,
    plusDI: 15,
    minusDI: 16,
    rsi: 50,
    macdHistogram: 2,
    emaSlope: 0.1,
  });

  assert.equal(gate.status, "RANGE_WATCH");
  assert.equal(gate.blocking, false);
  assert.equal(gate.paperActivationAllowed, false);
  assert.equal(gate.liveActivationAllowed, false);
  assert.ok(gate.reasons.includes("shadow_only_no_activation_state"));
});

test("stale evidence returns INSUFFICIENT_DATA", () => {
  const gate = evaluateIndicatorGate({
    ...BASE,
    freshness: { latestCandleAt: "2026-06-05T00:00:00.000Z", ageMs: 31 * 60_000 },
  });

  assert.equal(gate.status, "INSUFFICIENT_DATA");
  assert.ok(gate.reasons.includes("stale_indicator_evidence"));
});
