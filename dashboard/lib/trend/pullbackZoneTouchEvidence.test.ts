// dashboard/lib/trend/pullbackZoneTouchEvidence.test.ts
// Run: node --test --experimental-strip-types lib/trend/pullbackZoneTouchEvidence.test.ts

import assert from "node:assert/strict";
import test from "node:test";

import { evaluatePullbackZoneTouchEvidence } from "./pullbackZoneTouchEvidence.ts";

const BASE_TIME = Date.parse("2026-06-21T00:00:00.000Z");

function trigger(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    source: "PULLBACK_TRIGGER_THRESHOLDS_V1",
    readiness: "REVIEW_NOT_ACTIVATION",
    status: "WAITING_FOR_TRIGGER_PRICE",
    alignedDirection: "LONG",
    currentPrice: 102,
    rawZoneLow: 99,
    rawZoneHigh: 101,
    expandedZoneLow: 98.5,
    expandedZoneHigh: 101.5,
    triggerPrice: 101.5,
    rrReady: true,
    activationAllowed: false,
    paperActivationAllowed: false,
    liveActivationAllowed: false,
    reviewOnly: true,
    shadowOnly: true,
    ...overrides,
  };
}

function gate(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    source: "RESOLVER_DRIVEN_PULLBACK_GATE_V1",
    readiness: "REVIEW_NOT_ACTIVATION",
    rrStatus: "PASS",
    activationAllowed: false,
    paperActivationAllowed: false,
    liveActivationAllowed: false,
    reviewOnly: true,
    shadowOnly: true,
    ...overrides,
  };
}

function candle(index: number, low: number, high: number, timeframeMinutes = 5) {
  return {
    t: BASE_TIME + index * timeframeMinutes * 60_000,
    low,
    high,
  };
}

function evaluate(input: {
  triggerOverrides?: Record<string, unknown>;
  gateOverrides?: Record<string, unknown>;
  recent5mCandles?: readonly unknown[] | null;
  recent15mCandles?: readonly unknown[] | null;
} = {}) {
  return evaluatePullbackZoneTouchEvidence({
    pullbackTriggerThresholds: trigger(input.triggerOverrides),
    resolverDrivenPullbackGate: gate(input.gateOverrides),
    recent5mCandles: input.recent5mCandles ?? [],
    recent15mCandles: input.recent15mCandles ?? [],
  });
}

test("missing D8.2 trigger context returns NO_TRIGGER_CONTEXT", () => {
  const result = evaluatePullbackZoneTouchEvidence({
    pullbackTriggerThresholds: null,
    resolverDrivenPullbackGate: gate(),
    recent5mCandles: [candle(0, 100, 102)],
    recent15mCandles: [],
  });

  assert.equal(result.status, "NO_TRIGGER_CONTEXT");
  assert.equal(result.alignedDirection, "UNKNOWN");
  assert.equal(result.confirmationWindowStatus, "NOT_AVAILABLE");
  assert.equal(result.shouldEvaluateConfirmation, false);
  assert.deepEqual(result.blockers, ["NO_TRIGGER_CONTEXT"]);
});

test("no valid candles reports unavailable evidence without a touch claim", () => {
  const result = evaluate({
    recent5mCandles: [
      { t: 0, low: 100, high: 101 },
      { t: BASE_TIME, low: 102, high: 101 },
      { t: BASE_TIME + 1, low: Number.NaN, high: 101 },
    ],
    recent15mCandles: [{ t: -1, low: 100, high: 101 }],
  });

  assert.equal(result.status, "NO_TOUCH_YET");
  assert.equal(result.confirmationWindowStatus, "NOT_AVAILABLE");
  assert.equal(result.lastTouchAt, null);
  assert.equal(result.lastTouchTimeframe, null);
  assert.equal(result.touchType, null);
  assert.equal(result.shouldEvaluateConfirmation, false);
  assert.ok(result.blockers.includes("NO_VALID_CANDLES"));
});

test("valid candles without a zone touch wait for touch", () => {
  const result = evaluate({
    recent5mCandles: [candle(0, 102, 103), candle(1, 102.5, 103.5)],
  });

  assert.equal(result.status, "NO_TOUCH_YET");
  assert.equal(result.confirmationWindowStatus, "WAITING_FOR_TOUCH");
  assert.equal(result.confirmationWindowCandles, 3);
  assert.equal(result.lastTouchAt, null);
  assert.equal(result.touchType, null);
  assert.ok(result.blockers.includes("PULLBACK_ZONE_NOT_TOUCHED"));
  assert.match(result.nextAction, /touch the expanded LONG zone/i);
});

test("LONG expanded-only latest touch activates the 5M confirmation window", () => {
  const result = evaluate({
    recent5mCandles: [candle(0, 102, 103), candle(1, 101.25, 102)],
  });

  assert.equal(result.status, "CONFIRMATION_WINDOW_ACTIVE");
  assert.equal(result.touchType, "EXPANDED_ZONE_TOUCHED");
  assert.equal(result.lastTouchAt, new Date(candle(1, 0, 0).t).toISOString());
  assert.equal(result.lastTouchTimeframe, "5M");
  assert.equal(result.candlesSinceTouch, 0);
  assert.equal(result.deepestTouchPrice, 101.25);
  assert.ok(Math.abs((result.touchDistancePct ?? 0) - ((101.5 - 101.25) / 101.5 * 100)) < 1e-12);
  assert.equal(result.confirmationWindowCandles, 3);
  assert.equal(result.confirmationWindowStatus, "ACTIVE");
  assert.equal(result.shouldEvaluateConfirmation, true);
  assert.deepEqual(result.blockers, []);
});

test("LONG raw latest touch activates the window and uses deepest touching low", () => {
  const result = evaluate({
    recent5mCandles: [
      candle(0, 100.5, 102),
      candle(1, 99.75, 102),
      candle(2, 100, 102),
    ],
  });

  assert.equal(result.status, "CONFIRMATION_WINDOW_ACTIVE");
  assert.equal(result.touchType, "RAW_ZONE_TOUCHED");
  assert.equal(result.candlesSinceTouch, 0);
  assert.equal(result.deepestTouchPrice, 99.75);
  assert.equal(result.shouldEvaluateConfirmation, true);
});

test("LONG touch at three candles ago has an expired 5M window", () => {
  const result = evaluate({
    recent5mCandles: [
      candle(0, 100, 102),
      candle(1, 102, 103),
      candle(2, 102, 103),
      candle(3, 102, 103),
    ],
  });

  assert.equal(result.status, "CONFIRMATION_WINDOW_EXPIRED");
  assert.equal(result.touchType, "RAW_ZONE_TOUCHED");
  assert.equal(result.candlesSinceTouch, 3);
  assert.equal(result.confirmationWindowStatus, "EXPIRED");
  assert.equal(result.shouldEvaluateConfirmation, false);
  assert.ok(result.blockers.includes("CONFIRMATION_WINDOW_EXPIRED"));
});

test("LONG invalidation dominates and uses latest invalidation event plus deepest invalidation low", () => {
  const candles = [
    candle(0, 100, 102),
    candle(1, 98.4, 102),
    candle(2, 102, 103),
    candle(3, 98.2, 98.4),
    candle(4, 102, 103),
  ];
  const result = evaluate({ recent5mCandles: candles });

  assert.equal(result.status, "INVALIDATION_RISK_TOUCHED");
  assert.equal(result.lastTouchAt, new Date(candles[3]!.t).toISOString());
  assert.equal(result.lastTouchTimeframe, "5M");
  assert.equal(result.candlesSinceTouch, 1);
  assert.equal(result.deepestTouchPrice, 98.2);
  assert.equal(result.touchType, null);
  assert.equal(result.confirmationWindowStatus, "INVALIDATED");
  assert.equal(result.shouldEvaluateConfirmation, false);
  assert.ok(result.blockers.includes("INVALIDATION_RISK_TOUCHED"));
  assert.match(result.nextAction, /re-evaluate resolver.*zone/i);
});

test("LONG invalidation touch type comes from the latest invalidation candle only", () => {
  const raw = evaluate({ recent5mCandles: [candle(0, 98.4, 100)] });
  const expanded = evaluate({ recent5mCandles: [candle(0, 98.4, 98.75)] });
  const neither = evaluate({ recent5mCandles: [candle(0, 97.5, 98)] });

  assert.equal(raw.touchType, "RAW_ZONE_TOUCHED");
  assert.equal(expanded.touchType, "EXPANDED_ZONE_TOUCHED");
  assert.equal(neither.touchType, null);
});

test("SHORT mirrors expanded, raw, expired, and invalidation evidence", () => {
  const short = {
    alignedDirection: "SHORT",
    currentPrice: 98,
    triggerPrice: 98.5,
  };
  const expanded = evaluate({
    triggerOverrides: short,
    recent5mCandles: [candle(0, 98, 98.75)],
  });
  const raw = evaluate({
    triggerOverrides: short,
    recent5mCandles: [candle(0, 98, 100)],
  });
  const expired = evaluate({
    triggerOverrides: short,
    recent5mCandles: [
      candle(0, 98, 100),
      candle(1, 97, 98),
      candle(2, 97, 98),
      candle(3, 97, 98),
    ],
  });
  const invalidated = evaluate({
    triggerOverrides: short,
    recent5mCandles: [candle(0, 100, 101.75)],
  });

  assert.equal(expanded.status, "CONFIRMATION_WINDOW_ACTIVE");
  assert.equal(expanded.touchType, "EXPANDED_ZONE_TOUCHED");
  assert.equal(expanded.deepestTouchPrice, 98.75);
  assert.ok(Math.abs((expanded.touchDistancePct ?? 0) - ((98.75 - 98.5) / 98.5 * 100)) < 1e-12);
  assert.equal(raw.touchType, "RAW_ZONE_TOUCHED");
  assert.equal(raw.deepestTouchPrice, 100);
  assert.equal(expired.status, "CONFIRMATION_WINDOW_EXPIRED");
  assert.equal(expired.candlesSinceTouch, 3);
  assert.equal(invalidated.status, "INVALIDATION_RISK_TOUCHED");
  assert.equal(invalidated.deepestTouchPrice, 101.75);
  assert.equal(invalidated.shouldEvaluateConfirmation, false);
});

test("valid 5M evidence has priority over touching 15M evidence", () => {
  const result = evaluate({
    recent5mCandles: [candle(0, 102, 103)],
    recent15mCandles: [candle(0, 100, 102, 15)],
  });

  assert.equal(result.status, "NO_TOUCH_YET");
  assert.equal(result.lastTouchTimeframe, null);
  assert.equal(result.confirmationWindowCandles, 3);
});

test("invalid 5M evidence falls back to 15M and uses a two-candle window", () => {
  const candles15m = [
    candle(0, 100, 102, 15),
    candle(1, 102, 103, 15),
  ];
  const active = evaluate({
    recent5mCandles: [{ t: 0, low: 100, high: 102 }],
    recent15mCandles: candles15m,
  });
  const expired = evaluate({
    recent5mCandles: [{ t: 0, low: 100, high: 102 }],
    recent15mCandles: [...candles15m, candle(2, 102, 103, 15)],
  });

  assert.equal(active.status, "CONFIRMATION_WINDOW_ACTIVE");
  assert.equal(active.lastTouchTimeframe, "15M");
  assert.equal(active.candlesSinceTouch, 1);
  assert.equal(active.confirmationWindowCandles, 2);
  assert.equal(expired.status, "CONFIRMATION_WINDOW_EXPIRED");
  assert.equal(expired.candlesSinceTouch, 2);
});

test("5M lookback ignores old touch and invalidation outside the latest 12 valid candles", () => {
  const oldRisk = candle(0, 97, 102);
  const recentNoTouch = Array.from({ length: 12 }, (_, index) => candle(index + 1, 102, 103));
  const result = evaluate({ recent5mCandles: [oldRisk, ...recentNoTouch] });

  assert.equal(result.status, "NO_TOUCH_YET");
  assert.equal(result.confirmationWindowStatus, "WAITING_FOR_TOUCH");
  assert.ok(result.blockers.includes("PULLBACK_ZONE_NOT_TOUCHED"));
  assert.ok(!result.blockers.includes("INVALIDATION_RISK_TOUCHED"));
});

test("15M fallback lookback ignores old touch and invalidation outside the latest 8 valid candles", () => {
  const oldRisk = candle(0, 97, 102, 15);
  const recentNoTouch = Array.from({ length: 8 }, (_, index) => candle(index + 1, 102, 103, 15));
  const result = evaluate({
    recent5mCandles: [],
    recent15mCandles: [oldRisk, ...recentNoTouch],
  });

  assert.equal(result.status, "NO_TOUCH_YET");
  assert.equal(result.confirmationWindowCandles, 2);
  assert.ok(!result.blockers.includes("INVALIDATION_RISK_TOUCHED"));
});

test("dedupe keeps the latest input record and sorting drives candlesSinceTouch", () => {
  const first = { t: BASE_TIME, low: 102, high: 103 };
  const newer = { t: BASE_TIME + 300_000, low: 102, high: 103 };
  const duplicateReplacement = { t: BASE_TIME, low: 100, high: 102 };
  const input = [first, newer, duplicateReplacement];
  const before = structuredClone(input);
  const result = evaluate({ recent5mCandles: input });

  assert.equal(result.status, "CONFIRMATION_WINDOW_ACTIVE");
  assert.equal(result.touchType, "RAW_ZONE_TOUCHED");
  assert.equal(result.lastTouchAt, new Date(BASE_TIME).toISOString());
  assert.equal(result.candlesSinceTouch, 1);
  assert.deepEqual(input, before);
});

test("active touch requires canonical D8.2 RR readiness", () => {
  const result = evaluate({
    triggerOverrides: { rrReady: false },
    recent5mCandles: [candle(0, 100, 102)],
  });

  assert.equal(result.status, "CONFIRMATION_WINDOW_ACTIVE");
  assert.equal(result.shouldEvaluateConfirmation, false);
  assert.ok(result.blockers.includes("RR_NOT_READY"));
});

test("any D8.2 or D8.1 activation mismatch blocks confirmation and output remains safe", () => {
  const cases = [
    ["triggerOverrides", "activationAllowed"],
    ["triggerOverrides", "paperActivationAllowed"],
    ["triggerOverrides", "liveActivationAllowed"],
    ["gateOverrides", "activationAllowed"],
    ["gateOverrides", "paperActivationAllowed"],
    ["gateOverrides", "liveActivationAllowed"],
  ] as const;

  for (const [source, field] of cases) {
    const result = evaluate({
      [source]: { [field]: true },
      recent5mCandles: [candle(0, 100, 102)],
    });
    assert.equal(result.status, "CONFIRMATION_WINDOW_ACTIVE");
    assert.equal(result.shouldEvaluateConfirmation, false);
    assert.ok(result.blockers.includes("SOURCE_SAFETY_FLAGS_INVALID"));
    assert.equal(result.activationAllowed, false);
    assert.equal(result.paperActivationAllowed, false);
    assert.equal(result.liveActivationAllowed, false);
    assert.equal(result.reviewOnly, true);
    assert.equal(result.shadowOnly, true);
  }
});

test("all representative branches force safe output literals", () => {
  const results = [
    evaluatePullbackZoneTouchEvidence({}),
    evaluate(),
    evaluate({ recent5mCandles: [candle(0, 102, 103)] }),
    evaluate({ recent5mCandles: [candle(0, 100, 102)] }),
    evaluate({ recent5mCandles: [candle(0, 100, 102), candle(1, 102, 103), candle(2, 102, 103), candle(3, 102, 103)] }),
    evaluate({ recent5mCandles: [candle(0, 98, 102)] }),
  ];

  assert.deepEqual(new Set(results.map((result) => result.status)), new Set([
    "NO_TRIGGER_CONTEXT",
    "NO_TOUCH_YET",
    "CONFIRMATION_WINDOW_ACTIVE",
    "CONFIRMATION_WINDOW_EXPIRED",
    "INVALIDATION_RISK_TOUCHED",
  ]));
  for (const result of results) {
    assert.equal(result.activationAllowed, false);
    assert.equal(result.paperActivationAllowed, false);
    assert.equal(result.liveActivationAllowed, false);
    assert.equal(result.reviewOnly, true);
    assert.equal(result.shadowOnly, true);
  }
});

test("helper does not mutate trigger, gate, or candle inputs", () => {
  const input = {
    pullbackTriggerThresholds: trigger(),
    resolverDrivenPullbackGate: gate(),
    recent5mCandles: [candle(1, 102, 103), candle(0, 100, 102)],
    recent15mCandles: [candle(0, 100, 102, 15)],
  };
  const before = structuredClone(input);

  evaluatePullbackZoneTouchEvidence(input);

  assert.deepEqual(input, before);
});
