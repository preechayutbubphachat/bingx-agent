// dashboard/lib/trend/touchAwareConfirmationReview.test.ts
// Run: node --test --experimental-strip-types lib/trend/touchAwareConfirmationReview.test.ts

import assert from "node:assert/strict";
import test from "node:test";

import { evaluateTouchAwareConfirmationReview } from "./touchAwareConfirmationReview.ts";

function touch(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    source: "PULLBACK_ZONE_TOUCH_EVIDENCE_V1",
    status: "CONFIRMATION_WINDOW_ACTIVE",
    alignedDirection: "LONG",
    touchType: "RAW_ZONE_TOUCHED",
    confirmationWindowStatus: "ACTIVE",
    shouldEvaluateConfirmation: true,
    activationAllowed: false,
    paperActivationAllowed: false,
    liveActivationAllowed: false,
    reviewOnly: true,
    shadowOnly: true,
    ...overrides,
  };
}

function trigger(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    source: "PULLBACK_TRIGGER_THRESHOLDS_V1",
    status: "INSIDE_RAW_ZONE",
    alignedDirection: "LONG",
    currentPrice: 100,
    triggerPrice: 101.5,
    rawZoneLow: 99,
    rawZoneHigh: 101,
    expandedZoneLow: 98.5,
    expandedZoneHigh: 101.5,
    bestRR: 1.8,
    rrThreshold: 1.2,
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
    status: "CLEAN_REVIEW_CANDIDATE",
    alignedDirection: "LONG",
    activationAllowed: false,
    paperActivationAllowed: false,
    liveActivationAllowed: false,
    reviewOnly: true,
    shadowOnly: true,
    ...overrides,
  };
}

function indicator(overrides: Record<string, unknown> = {}) {
  return {
    plusDI: null,
    minusDI: null,
    macdHistogram: null,
    emaSlope: null,
    freshness: { ageMs: 60_000 },
    ...overrides,
  };
}

function evaluate(input: {
  touchOverrides?: Record<string, unknown>;
  triggerOverrides?: Record<string, unknown>;
  gateOverrides?: Record<string, unknown>;
  evidence?: unknown;
} = {}) {
  return evaluateTouchAwareConfirmationReview({
    pullbackZoneTouchEvidence: touch(input.touchOverrides),
    pullbackTriggerThresholds: trigger(input.triggerOverrides),
    resolverDrivenPullbackGate: gate(input.gateOverrides),
    multiTimeframeIndicatorEvidence: input.evidence ?? {},
  });
}

test("missing or directionally inconsistent D8.1-D8.3 context returns NO_TOUCH_CONTEXT", () => {
  const missingInputs = [
    { pullbackZoneTouchEvidence: null, pullbackTriggerThresholds: trigger(), resolverDrivenPullbackGate: gate() },
    { pullbackZoneTouchEvidence: touch(), pullbackTriggerThresholds: null, resolverDrivenPullbackGate: gate() },
    { pullbackZoneTouchEvidence: touch(), pullbackTriggerThresholds: trigger(), resolverDrivenPullbackGate: null },
    { pullbackZoneTouchEvidence: touch(), pullbackTriggerThresholds: trigger({ alignedDirection: "SHORT" }), resolverDrivenPullbackGate: gate() },
  ];

  for (const source of missingInputs) {
    const result = evaluateTouchAwareConfirmationReview({
      ...source,
      multiTimeframeIndicatorEvidence: {
        "5M": indicator({ plusDI: 24, minusDI: 14 }),
      },
    });
    assert.equal(result.status, "NO_TOUCH_CONTEXT");
    assert.equal(result.confirmationStatus, "NOT_EVALUATED");
    assert.deepEqual(result.confirmationTimeframesUsed, []);
    assert.deepEqual(result.confirmationVotes, []);
    assert.equal(result.shouldPromoteToReview, false);
  }
});

test("invalidation risk dominates review and skips indicator evaluation", () => {
  const result = evaluate({
    touchOverrides: { status: "INVALIDATION_RISK_TOUCHED", confirmationWindowStatus: "INVALIDATED" },
    triggerOverrides: { rrReady: false },
    evidence: { "5M": indicator({ plusDI: 24, minusDI: 14 }) },
  });

  assert.equal(result.status, "INVALIDATION_REVIEW_REQUIRED");
  assert.equal(result.confirmationStatus, "NOT_EVALUATED");
  assert.deepEqual(result.confirmationVotes, []);
  assert.ok(result.blockers.includes("INVALIDATION_RISK_TOUCHED"));
});

test("inactive touch window precedes RR, safety, and indicator gates", () => {
  for (const status of ["NO_TOUCH_YET", "CONFIRMATION_WINDOW_EXPIRED"]) {
    const result = evaluate({
      touchOverrides: {
        status,
        confirmationWindowStatus: status === "NO_TOUCH_YET" ? "WAITING_FOR_TOUCH" : "EXPIRED",
        shouldEvaluateConfirmation: false,
      },
      triggerOverrides: { rrReady: false },
      gateOverrides: { activationAllowed: "invalid" },
      evidence: { "5M": indicator({ plusDI: 24, minusDI: 14 }) },
    });

    assert.equal(result.status, "TOUCH_WINDOW_INACTIVE");
    assert.equal(result.confirmationStatus, "NOT_EVALUATED");
    assert.deepEqual(result.confirmationVotes, []);
  }
});

test("RR_NOT_READY remains reachable when D8.3 derived checksum is false", () => {
  const result = evaluate({
    touchOverrides: { shouldEvaluateConfirmation: false },
    triggerOverrides: { rrReady: false },
    gateOverrides: { activationAllowed: "invalid" },
    evidence: { "5M": indicator({ plusDI: 24, minusDI: 14 }) },
  });

  assert.equal(result.status, "RR_NOT_READY");
  assert.equal(result.confirmationStatus, "NOT_EVALUATED");
  assert.deepEqual(result.confirmationVotes, []);
  assert.ok(result.blockers.includes("RR_NOT_READY"));
});

test("SOURCE_SAFETY_INVALID remains reachable across D8.1-D8.3 primitives", () => {
  const cases = [
    ["touchOverrides", "activationAllowed"],
    ["touchOverrides", "paperActivationAllowed"],
    ["touchOverrides", "liveActivationAllowed"],
    ["triggerOverrides", "activationAllowed"],
    ["triggerOverrides", "paperActivationAllowed"],
    ["triggerOverrides", "liveActivationAllowed"],
    ["gateOverrides", "activationAllowed"],
    ["gateOverrides", "paperActivationAllowed"],
    ["gateOverrides", "liveActivationAllowed"],
  ] as const;

  for (const [source, field] of cases) {
    const result = evaluate({
      touchOverrides: { shouldEvaluateConfirmation: false },
      [source]: { [field]: true },
      evidence: { "5M": indicator({ plusDI: 24, minusDI: 14 }) },
    });
    assert.equal(result.status, "SOURCE_SAFETY_INVALID");
    assert.equal(result.confirmationStatus, "NOT_EVALUATED");
    assert.deepEqual(result.confirmationVotes, []);
    assert.equal(result.shouldPromoteToReview, false);
    assert.ok(result.blockers.includes("SOURCE_SAFETY_INVALID"));
  }
});

test("missing, stale, invalid-age, and unavailable-only indicators wait for fresh evidence", () => {
  const evidenceCases = [
    {},
    { "5M": indicator({ plusDI: 24, minusDI: 14, freshness: { ageMs: 15 * 60 * 1000 + 1 } }) },
    { "15M": indicator({ plusDI: 24, minusDI: 14, freshness: { ageMs: 45 * 60 * 1000 + 1 } }) },
    { "5M": indicator({ plusDI: 24, minusDI: 14, freshness: { ageMs: -1 } }) },
    { "5M": indicator({ plusDI: 24, minusDI: 14, freshness: { ageMs: Number.NaN } }) },
    { "5M": indicator() },
  ];

  for (const evidence of evidenceCases) {
    const result = evaluate({ evidence });
    assert.equal(result.status, "WAITING_FOR_FRESH_CONFIRMATION");
    assert.equal(result.confirmationStatus, "WAITING_FOR_FRESH_EVIDENCE");
    assert.deepEqual(result.confirmationTimeframesUsed, []);
    assert.deepEqual(result.confirmationVotes, []);
    assert.ok(result.blockers.includes("FRESH_CONFIRMATION_EVIDENCE_MISSING"));
  }
});

test("confirmationVotes expose exact vote schema in deterministic timeframe order", () => {
  const result = evaluate({
    evidence: {
      "15M": indicator({
        plusDI: 20,
        minusDI: 20,
        macdHistogram: null,
        emaSlope: 1,
        freshness: { ageMs: 120_000 },
      }),
      "5M": indicator({
        plusDI: 24,
        minusDI: 14,
        macdHistogram: -0.5,
        emaSlope: 0,
        freshness: { ageMs: 60_000 },
      }),
    },
  });

  assert.deepEqual(result.confirmationTimeframesUsed, ["5M", "15M"]);
  assert.deepEqual(result.confirmationVotes, [
    {
      timeframe: "5M",
      ageMs: 60_000,
      diVote: "BULLISH",
      macdHistogramVote: "BEARISH",
      emaSlopeVote: "NEUTRAL",
      classification: "MIXED_NEUTRAL",
    },
    {
      timeframe: "15M",
      ageMs: 120_000,
      diVote: "NEUTRAL",
      macdHistogramVote: "UNAVAILABLE",
      emaSlopeVote: "BULLISH",
      classification: "BULLISH_SUPPORT",
    },
  ]);
  assert.equal(result.status, "PROMOTABLE_REVIEW_CANDIDATE");
});

test("LONG bullish support promotes a human review-only candidate", () => {
  const result = evaluate({
    evidence: {
      "5M": indicator({ plusDI: 24, minusDI: 14, macdHistogram: 0.5, emaSlope: 1 }),
    },
  });

  assert.equal(result.status, "PROMOTABLE_REVIEW_CANDIDATE");
  assert.equal(result.confirmationStatus, "CONFIRMED_BULLISH");
  assert.equal(result.shouldPromoteToReview, true);
  assert.deepEqual(result.blockers, []);
  assert.match(result.nextAction, /manual review.*no activation.*order/i);
});

test("LONG conflicts when any fresh timeframe has bearish support", () => {
  const result = evaluate({
    evidence: {
      "5M": indicator({ plusDI: 24, minusDI: 14, macdHistogram: 0.5 }),
      "15M": indicator({ plusDI: 12, minusDI: 25, macdHistogram: -0.5, emaSlope: -1 }),
    },
  });

  assert.equal(result.status, "CONFIRMATION_CONFLICTING");
  assert.equal(result.confirmationStatus, "CONFLICTING_MOMENTUM");
  assert.equal(result.shouldPromoteToReview, false);
  assert.ok(result.blockers.includes("MOMENTUM_CONFLICT"));
});

test("LONG fresh mixed or neutral evidence is not cleanly aligned", () => {
  const result = evaluate({
    evidence: {
      "5M": indicator({ plusDI: 24, minusDI: 14, macdHistogram: -0.5 }),
      "15M": indicator({ plusDI: 20, minusDI: 20, macdHistogram: 0, emaSlope: 0 }),
    },
  });

  assert.equal(result.status, "CONFIRMATION_NOT_ALIGNED");
  assert.equal(result.confirmationStatus, "MOMENTUM_NOT_CONFIRMED");
  assert.ok(result.blockers.includes("MOMENTUM_NOT_CONFIRMED"));
});

test("an aligned timeframe plus a mixed timeframe remains confirmed", () => {
  const result = evaluate({
    evidence: {
      "5M": indicator({ plusDI: 24, minusDI: 14, macdHistogram: 0.5 }),
      "15M": indicator({ plusDI: 24, minusDI: 14, macdHistogram: -0.5 }),
    },
  });

  assert.equal(result.confirmationVotes[0]?.classification, "BULLISH_SUPPORT");
  assert.equal(result.confirmationVotes[1]?.classification, "MIXED_NEUTRAL");
  assert.equal(result.status, "PROMOTABLE_REVIEW_CANDIDATE");
  assert.equal(result.confirmationStatus, "CONFIRMED_BULLISH");
});

test("stale conflicting timeframe is ignored when fresh aligned evidence remains", () => {
  const result = evaluate({
    evidence: {
      "5M": indicator({
        plusDI: 12,
        minusDI: 25,
        freshness: { ageMs: 15 * 60 * 1000 + 1 },
      }),
      "15M": indicator({ plusDI: 24, minusDI: 14, freshness: { ageMs: 60_000 } }),
    },
  });

  assert.deepEqual(result.confirmationTimeframesUsed, ["15M"]);
  assert.equal(result.status, "PROMOTABLE_REVIEW_CANDIDATE");
});

test("SHORT mirrors bearish confirmation, bullish conflict, and mixed non-alignment", () => {
  const shortSources = {
    touchOverrides: { alignedDirection: "SHORT" },
    triggerOverrides: { alignedDirection: "SHORT", currentPrice: 100, triggerPrice: 98.5 },
    gateOverrides: { alignedDirection: "SHORT" },
  };
  const confirmed = evaluate({
    ...shortSources,
    evidence: { "5M": indicator({ plusDI: 12, minusDI: 25, macdHistogram: -0.5, emaSlope: -1 }) },
  });
  const conflicting = evaluate({
    ...shortSources,
    evidence: { "5M": indicator({ plusDI: 24, minusDI: 14, macdHistogram: 0.5 }) },
  });
  const mixed = evaluate({
    ...shortSources,
    evidence: { "5M": indicator({ plusDI: 24, minusDI: 14, macdHistogram: -0.5 }) },
  });

  assert.equal(confirmed.status, "PROMOTABLE_REVIEW_CANDIDATE");
  assert.equal(confirmed.confirmationStatus, "CONFIRMED_BEARISH");
  assert.equal(confirmed.shouldPromoteToReview, true);
  assert.equal(conflicting.status, "CONFIRMATION_CONFLICTING");
  assert.equal(conflicting.confirmationStatus, "CONFLICTING_MOMENTUM");
  assert.equal(mixed.status, "CONFIRMATION_NOT_ALIGNED");
});

test("all statuses keep output permissions disabled and promotion is clean-branch only", () => {
  const results = [
    evaluateTouchAwareConfirmationReview({}),
    evaluate({ touchOverrides: { status: "INVALIDATION_RISK_TOUCHED" } }),
    evaluate({ touchOverrides: { status: "NO_TOUCH_YET" } }),
    evaluate({ triggerOverrides: { rrReady: false }, touchOverrides: { shouldEvaluateConfirmation: false } }),
    evaluate({ gateOverrides: { activationAllowed: "invalid" }, touchOverrides: { shouldEvaluateConfirmation: false } }),
    evaluate(),
    evaluate({ evidence: { "5M": indicator({ plusDI: 12, minusDI: 25 }) } }),
    evaluate({ evidence: { "5M": indicator({ plusDI: 24, minusDI: 14, macdHistogram: -0.5 }) } }),
    evaluate({ evidence: { "5M": indicator({ plusDI: 24, minusDI: 14 }) } }),
  ];

  assert.deepEqual(new Set(results.map((result) => result.status)), new Set([
    "NO_TOUCH_CONTEXT",
    "INVALIDATION_REVIEW_REQUIRED",
    "TOUCH_WINDOW_INACTIVE",
    "RR_NOT_READY",
    "SOURCE_SAFETY_INVALID",
    "WAITING_FOR_FRESH_CONFIRMATION",
    "CONFIRMATION_CONFLICTING",
    "CONFIRMATION_NOT_ALIGNED",
    "PROMOTABLE_REVIEW_CANDIDATE",
  ]));
  for (const result of results) {
    assert.equal(result.shouldPromoteToReview, result.status === "PROMOTABLE_REVIEW_CANDIDATE");
    assert.equal(result.activationAllowed, false);
    assert.equal(result.paperActivationAllowed, false);
    assert.equal(result.liveActivationAllowed, false);
    assert.equal(result.reviewOnly, true);
    assert.equal(result.shadowOnly, true);
  }
});

test("helper does not mutate D8.1-D8.3 or indicator evidence", () => {
  const input = {
    pullbackZoneTouchEvidence: touch(),
    pullbackTriggerThresholds: trigger(),
    resolverDrivenPullbackGate: gate(),
    multiTimeframeIndicatorEvidence: {
      "5M": indicator({ plusDI: 24, minusDI: 14 }),
      "15M": indicator({ plusDI: 20, minusDI: 20, emaSlope: 1 }),
    },
  };
  const before = structuredClone(input);

  evaluateTouchAwareConfirmationReview(input);

  assert.deepEqual(input, before);
});
