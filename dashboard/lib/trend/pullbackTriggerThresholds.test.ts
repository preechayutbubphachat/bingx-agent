// dashboard/lib/trend/pullbackTriggerThresholds.test.ts
// Run: node --test --experimental-strip-types lib/trend/pullbackTriggerThresholds.test.ts

import assert from "node:assert/strict";
import test from "node:test";

import { evaluatePullbackTriggerThresholds } from "./pullbackTriggerThresholds.ts";

function gate(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    source: "RESOLVER_DRIVEN_PULLBACK_GATE_V1",
    readiness: "REVIEW_NOT_ACTIVATION",
    status: "WAITING_PULLBACK",
    alignedDirection: "LONG",
    currentPrice: 105,
    zone: [99, 101],
    zoneTolerance: 0.5,
    priceDistanceToZonePct: 3.8,
    bestRR: 1.8,
    rrThreshold: 1.2,
    rrStatus: "PASS",
    confirmationStatus: "NOT_EVALUATED_OUTSIDE_ZONE",
    blockers: ["CURRENT_PRICE_OUTSIDE_ALIGNED_ZONE"],
    nextAction: "wait for current price to enter the aligned LONG zone",
    doNotDo: [],
    activationAllowed: false,
    paperActivationAllowed: false,
    liveActivationAllowed: false,
    reviewOnly: true,
    shadowOnly: true,
    ...overrides,
  };
}

function evaluate(overrides: Record<string, unknown> = {}) {
  return evaluatePullbackTriggerThresholds({
    resolverDrivenPullbackGate: gate(overrides),
  });
}

test("LONG above expanded zone waits for the directional trigger", () => {
  const result = evaluate({ currentPrice: 102 });

  assert.equal(result.status, "WAITING_FOR_TRIGGER_PRICE");
  assert.equal(result.triggerPrice, 101.5);
  assert.equal(result.rawZoneTriggerPrice, 101);
  assert.equal(result.expandedZoneLow, 98.5);
  assert.equal(result.expandedZoneHigh, 101.5);
  assert.equal(result.distanceToTriggerAbs, 0.5);
  assert.ok(Math.abs((result.distanceToTriggerPct ?? 0) - (0.5 / 102 * 100)) < 1e-12);
  assert.ok(result.promotionBlockedBy.includes("PRICE_NOT_AT_TRIGGER"));
  assert.match(result.nextAction, /101\.50 or lower/i);
});

test("LONG classifies expanded and raw zone boundaries inclusively", () => {
  assert.equal(evaluate({ currentPrice: 101.5 }).status, "INSIDE_EXPANDED_ZONE");
  assert.equal(evaluate({ currentPrice: 101.25 }).status, "INSIDE_EXPANDED_ZONE");
  assert.equal(evaluate({ currentPrice: 101 }).status, "INSIDE_RAW_ZONE");
  assert.equal(evaluate({ currentPrice: 100 }).status, "INSIDE_RAW_ZONE");
  assert.equal(evaluate({ currentPrice: 99 }).status, "INSIDE_RAW_ZONE");
  assert.equal(evaluate({ currentPrice: 98.5 }).status, "INSIDE_EXPANDED_ZONE");
  assert.equal(evaluate({ currentPrice: 98.25 }).status, "BEYOND_ZONE_INVALIDATION_RISK");
});

test("SHORT mirrors trigger, zone, and invalidation geometry", () => {
  const common = { alignedDirection: "SHORT" };
  const waiting = evaluate({ ...common, currentPrice: 98 });

  assert.equal(waiting.status, "WAITING_FOR_TRIGGER_PRICE");
  assert.equal(waiting.triggerPrice, 98.5);
  assert.equal(waiting.rawZoneTriggerPrice, 99);
  assert.equal(waiting.distanceToTriggerAbs, 0.5);
  assert.match(waiting.nextAction, /98\.50 or higher/i);
  assert.equal(evaluate({ ...common, currentPrice: 98.5 }).status, "INSIDE_EXPANDED_ZONE");
  assert.equal(evaluate({ ...common, currentPrice: 98.75 }).status, "INSIDE_EXPANDED_ZONE");
  assert.equal(evaluate({ ...common, currentPrice: 99 }).status, "INSIDE_RAW_ZONE");
  assert.equal(evaluate({ ...common, currentPrice: 100 }).status, "INSIDE_RAW_ZONE");
  assert.equal(evaluate({ ...common, currentPrice: 101 }).status, "INSIDE_RAW_ZONE");
  assert.equal(evaluate({ ...common, currentPrice: 101.5 }).status, "INSIDE_EXPANDED_ZONE");
  assert.equal(evaluate({ ...common, currentPrice: 101.75 }).status, "BEYOND_ZONE_INVALIDATION_RISK");
});

test("current runtime derives exact LONG trigger and remaining distance", () => {
  const result = evaluate({
    currentPrice: 63845.6,
    zone: [63623.198, 63763.5],
    zoneTolerance: 31.9228,
    bestRR: 4.227,
    rrThreshold: 1.2,
  });

  assert.equal(result.status, "WAITING_FOR_TRIGGER_PRICE");
  assert.equal(result.expandedZoneLow, 63591.2752);
  assert.equal(result.expandedZoneHigh, 63795.4228);
  assert.equal(result.triggerPrice, 63795.4228);
  assert.equal(result.rawZoneTriggerPrice, 63763.5);
  assert.ok(Math.abs((result.distanceToTriggerAbs ?? 0) - 50.1772) < 1e-9);
  assert.ok(Math.abs((result.distanceToTriggerPct ?? 0) - 0.078591) < 1e-5);
  assert.equal(result.rrReady, true);
  assert.equal(result.confirmationRequired, true);
  assert.deepEqual(result.promotionBlockedBy, [
    "PRICE_NOT_AT_TRIGGER",
    "CONFIRMATION_NOT_EVALUATED",
  ]);
});

test("distance remaining becomes zero after the trigger is reached", () => {
  assert.equal(evaluate({ currentPrice: 101.25 }).distanceToTriggerAbs, 0);
  assert.equal(evaluate({ alignedDirection: "SHORT", currentPrice: 98.75 }).distanceToTriggerAbs, 0);
});

test("RR pass outside the zone does not promote a candidate", () => {
  const result = evaluate({ currentPrice: 102, rrStatus: "PASS" });

  assert.equal(result.rrReady, true);
  assert.equal(result.status, "WAITING_FOR_TRIGGER_PRICE");
  assert.ok(result.promotionBlockedBy.includes("PRICE_NOT_AT_TRIGGER"));
});

test("inside-zone confirmation must be evaluated and directionally aligned", () => {
  const notEvaluated = evaluate({ currentPrice: 100 });
  const pending = evaluate({
    currentPrice: 100,
    confirmationStatus: "CONFLICTING_MOMENTUM",
  });
  const opposite = evaluate({
    currentPrice: 100,
    confirmationStatus: "CONFIRMED_BEARISH",
  });

  assert.equal(notEvaluated.status, "INSIDE_RAW_ZONE");
  assert.ok(notEvaluated.promotionBlockedBy.includes("CONFIRMATION_NOT_EVALUATED"));
  assert.equal(pending.status, "INSIDE_RAW_ZONE");
  assert.ok(pending.promotionBlockedBy.includes("CONFIRMATION_NOT_ALIGNED"));
  assert.equal(opposite.status, "INSIDE_RAW_ZONE");
  assert.ok(opposite.promotionBlockedBy.includes("CONFIRMATION_NOT_ALIGNED"));
});

test("RR must be a finite consistent pass before promotion", () => {
  const failed = evaluate({
    currentPrice: 100,
    rrStatus: "FAIL",
    bestRR: 1.1,
    confirmationStatus: "CONFIRMED_BULLISH",
  });
  const inconsistent = evaluate({
    currentPrice: 100,
    rrStatus: "PASS",
    bestRR: 1.1,
    confirmationStatus: "CONFIRMED_BULLISH",
  });

  assert.equal(failed.rrReady, false);
  assert.ok(failed.promotionBlockedBy.includes("RR_NOT_READY"));
  assert.equal(inconsistent.rrReady, false);
  assert.ok(inconsistent.promotionBlockedBy.includes("RR_NOT_READY"));
});

test("aligned confirmation promotes LONG and SHORT locations to review only", () => {
  const longRaw = evaluate({
    currentPrice: 100,
    status: "CLEAN_REVIEW_CANDIDATE",
    confirmationStatus: "CONFIRMED_BULLISH",
  });
  const longExpanded = evaluate({
    currentPrice: 101.25,
    status: "CLEAN_REVIEW_CANDIDATE",
    confirmationStatus: "CONFIRMED_BULLISH",
  });
  const shortRaw = evaluate({
    alignedDirection: "SHORT",
    currentPrice: 100,
    status: "CLEAN_REVIEW_CANDIDATE",
    confirmationStatus: "CONFIRMED_BEARISH",
  });

  for (const result of [longRaw, longExpanded, shortRaw]) {
    assert.equal(result.status, "READY_FOR_CONFIRMATION_REVIEW");
    assert.deepEqual(result.promotionBlockedBy, []);
    assert.equal(result.activationAllowed, false);
    assert.equal(result.paperActivationAllowed, false);
    assert.equal(result.liveActivationAllowed, false);
    assert.equal(result.reviewOnly, true);
    assert.equal(result.shadowOnly, true);
  }
});

test("invalid or missing D8.1 gate returns NO_GATE without fallback", () => {
  const missing = evaluatePullbackTriggerThresholds({});
  const noResolution = evaluate({ status: "NO_ALIGNED_RESOLUTION" });
  const badTolerance = evaluate({ zoneTolerance: -1 });

  for (const result of [missing, noResolution, badTolerance]) {
    assert.equal(result.status, "NO_GATE");
    assert.equal(result.triggerPrice, null);
    assert.equal(result.rrReady, false);
    assert.equal(result.confirmationRequired, false);
    assert.deepEqual(result.promotionBlockedBy, ["NO_VALID_PULLBACK_GATE"]);
  }
});

test("invalid source safety blocks promotion while output safety stays false", () => {
  for (const unsafeField of [
    "activationAllowed",
    "paperActivationAllowed",
    "liveActivationAllowed",
  ]) {
    const result = evaluate({
      currentPrice: 100,
      confirmationStatus: "CONFIRMED_BULLISH",
      [unsafeField]: true,
    });

    assert.equal(result.status, "INSIDE_RAW_ZONE");
    assert.ok(result.promotionBlockedBy.includes("SOURCE_SAFETY_FLAGS_INVALID"));
    assert.equal(result.activationAllowed, false);
    assert.equal(result.paperActivationAllowed, false);
    assert.equal(result.liveActivationAllowed, false);
  }
});

test("invalidation risk remains visible with additive RR and confirmation blockers", () => {
  const result = evaluate({
    currentPrice: 98.25,
    rrStatus: "FAIL",
    bestRR: 1,
  });

  assert.equal(result.status, "BEYOND_ZONE_INVALIDATION_RISK");
  assert.deepEqual(result.promotionBlockedBy, [
    "PRICE_BEYOND_EXPANDED_ZONE",
    "RR_NOT_READY",
    "CONFIRMATION_NOT_EVALUATED",
  ]);
});

test("helper does not mutate the D8.1 gate input", () => {
  const input = {
    resolverDrivenPullbackGate: gate({
      currentPrice: 100,
      status: "CLEAN_REVIEW_CANDIDATE",
      confirmationStatus: "CONFIRMED_BULLISH",
    }),
  };
  const before = structuredClone(input);

  evaluatePullbackTriggerThresholds(input);

  assert.deepEqual(input, before);
});
