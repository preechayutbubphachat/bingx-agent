// dashboard/lib/trend/noReviewCandidateBottleneckResolver.test.ts
// Run: node --test --experimental-strip-types lib/trend/noReviewCandidateBottleneckResolver.test.ts

import assert from "node:assert/strict";
import test from "node:test";

import { evaluateNoReviewCandidateBottleneckResolver } from "./noReviewCandidateBottleneckResolver.ts";

const safe = {
  activationAllowed: false,
  paperActivationAllowed: false,
  liveActivationAllowed: false,
  reviewOnly: true,
  shadowOnly: true,
} as const;

function d8_0(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    source: "ENTRY_CANDIDATE_RESOLVER_V1",
    status: "WAITING_PULLBACK",
    alignedDirection: "LONG",
    ...safe,
    ...overrides,
  };
}

function d8_1(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    source: "RESOLVER_DRIVEN_PULLBACK_GATE_V1",
    status: "WAITING_PULLBACK",
    alignedDirection: "LONG",
    bestRR: 6.208,
    rrThreshold: 1.2,
    ...safe,
    ...overrides,
  };
}

function d8_2(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    source: "PULLBACK_TRIGGER_THRESHOLDS_V1",
    status: "WAITING_FOR_TRIGGER_PRICE",
    alignedDirection: "LONG",
    currentPrice: 64_435.4,
    triggerPrice: 63_834.4677,
    distanceToTriggerAbs: 600.9323,
    distanceToTriggerPct: 600.9323 / 64_435.4 * 100,
    bestRR: 6.208,
    rrThreshold: 1.2,
    rrReady: true,
    ...safe,
    ...overrides,
  };
}

function d8_3(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    source: "PULLBACK_ZONE_TOUCH_EVIDENCE_V1",
    status: "NO_TOUCH_YET",
    alignedDirection: "LONG",
    confirmationWindowStatus: "WAITING_FOR_TOUCH",
    ...safe,
    ...overrides,
  };
}

function d8_4(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    source: "TOUCH_AWARE_CONFIRMATION_REVIEW_V1",
    status: "TOUCH_WINDOW_INACTIVE",
    alignedDirection: "LONG",
    confirmationStatus: "NOT_EVALUATED",
    shouldPromoteToReview: false,
    ...safe,
    ...overrides,
  };
}

function evaluate(overrides: Record<string, unknown> = {}) {
  return evaluateNoReviewCandidateBottleneckResolver({
    entryCandidateResolution: d8_0(),
    resolverDrivenPullbackGate: d8_1(),
    pullbackTriggerThresholds: d8_2(),
    pullbackZoneTouchEvidence: d8_3(),
    touchAwareConfirmationReview: d8_4(),
    multiTimeframeIndicatorEvidence: null,
    ...overrides,
  });
}

function triggerAtDistance(
  distancePct: number,
  direction: "LONG" | "SHORT" = "LONG",
  overrides: Record<string, unknown> = {},
) {
  const currentPrice = 100;
  const distanceToTriggerAbs = currentPrice * distancePct / 100;
  const triggerPrice = direction === "LONG"
    ? currentPrice - distanceToTriggerAbs
    : currentPrice + distanceToTriggerAbs;
  return d8_2({
    alignedDirection: direction,
    currentPrice,
    triggerPrice,
    distanceToTriggerAbs,
    distanceToTriggerPct: distancePct,
    ...overrides,
  });
}

const strongLong = {
  "5M": {
    adx: 30,
    plusDI: 28,
    minusDI: 14,
    macdHistogram: 2,
    emaSlope: 0.5,
    freshness: { ageMs: 60_000 },
  },
};

test("missing or inconsistent D8.0-D8.4 context returns NO_CONTEXT", () => {
  const sources = [
    "entryCandidateResolution",
    "resolverDrivenPullbackGate",
    "pullbackTriggerThresholds",
    "pullbackZoneTouchEvidence",
    "touchAwareConfirmationReview",
  ];
  for (const source of sources) {
    const result = evaluate({ [source]: null });
    assert.equal(result.status, "NO_CONTEXT", source);
    assert.equal(result.primaryBlocker, "MISSING_CONTEXT", source);
    assert.equal(result.nextAlgorithmBranch, "NO_ACTION", source);
  }

  const inconsistent = evaluate({
    resolverDrivenPullbackGate: d8_1({ alignedDirection: "SHORT" }),
  });
  assert.equal(inconsistent.status, "NO_CONTEXT");
});

test("a promotable D8.4 candidate stops bottleneck analysis", () => {
  const result = evaluate({
    touchAwareConfirmationReview: d8_4({
      status: "PROMOTABLE_REVIEW_CANDIDATE",
      confirmationStatus: "CONFIRMED_BULLISH",
      shouldPromoteToReview: true,
    }),
  });
  assert.equal(result.status, "PROMOTABLE_REVIEW_EXISTS");
  assert.equal(result.primaryBlocker, "NONE");
  assert.equal(result.nextAlgorithmBranch, "NO_ACTION");
});

test("RR failure precedes pullback and touch blockers", () => {
  const result = evaluate({
    resolverDrivenPullbackGate: d8_1({ bestRR: 1, rrThreshold: 1.2 }),
    pullbackTriggerThresholds: d8_2({ bestRR: 1, rrThreshold: 1.2, rrReady: false }),
  });
  assert.equal(result.status, "RR_NOT_READY");
  assert.equal(result.primaryBlocker, "RR_BELOW_THRESHOLD");
  assert.equal(result.nextAlgorithmBranch, "REPAIR_RR");
});

test("contradictory canonical RR and distance fields return NO_CONTEXT", () => {
  const rrMismatch = evaluate({
    pullbackTriggerThresholds: d8_2({ bestRR: 1, rrThreshold: 1.2, rrReady: true }),
  });
  assert.equal(rrMismatch.status, "NO_CONTEXT");

  const distanceMismatch = evaluate({
    pullbackTriggerThresholds: d8_2({ distanceToTriggerAbs: 10 }),
  });
  assert.equal(distanceMismatch.status, "NO_CONTEXT");
});

test("current LONG runtime is FAR above trigger and recommends replay without trend evidence", () => {
  const result = evaluate();
  assert.equal(result.status, "WAITING_FOR_PULLBACK_TRIGGER");
  assert.equal(result.primaryBlocker, "PRICE_ABOVE_LONG_TRIGGER");
  assert.equal(result.triggerDistanceClass, "FAR");
  assert.equal(result.nextAlgorithmBranch, "RUN_HISTORICAL_REPLAY_REVIEW");
  assert.equal(result.rrReady, true);
});

test("SHORT waiting below trigger mirrors the directional blocker", () => {
  const result = evaluate({
    entryCandidateResolution: d8_0({ alignedDirection: "SHORT" }),
    resolverDrivenPullbackGate: d8_1({ alignedDirection: "SHORT" }),
    pullbackTriggerThresholds: triggerAtDistance(1, "SHORT"),
    pullbackZoneTouchEvidence: d8_3({ alignedDirection: "SHORT" }),
    touchAwareConfirmationReview: d8_4({ alignedDirection: "SHORT" }),
  });
  assert.equal(result.status, "WAITING_FOR_PULLBACK_TRIGGER");
  assert.equal(result.primaryBlocker, "PRICE_BELOW_SHORT_TRIGGER");
});

test("waiting status with the wrong directional price relation is invalid context", () => {
  const result = evaluate({
    pullbackTriggerThresholds: d8_2({
      currentPrice: 100,
      triggerPrice: 101,
      distanceToTriggerAbs: 1,
      distanceToTriggerPct: 1,
    }),
  });
  assert.equal(result.status, "NO_CONTEXT");
});

test("no touch remains distinct after trigger-wait state clears", () => {
  const result = evaluate({
    pullbackTriggerThresholds: triggerAtDistance(0.03, "LONG", { status: "INSIDE_EXPANDED_ZONE" }),
  });
  assert.equal(result.status, "NO_TOUCH_EVIDENCE");
  assert.equal(result.primaryBlocker, "PULLBACK_ZONE_NOT_TOUCHED");
  assert.equal(result.nextAlgorithmBranch, "WAIT_FOR_PULLBACK");
});

test("expired touch window precedes generic confirmation status", () => {
  const result = evaluate({
    pullbackTriggerThresholds: triggerAtDistance(0.03, "LONG", { status: "INSIDE_EXPANDED_ZONE" }),
    pullbackZoneTouchEvidence: d8_3({
      status: "CONFIRMATION_WINDOW_EXPIRED",
      confirmationWindowStatus: "EXPIRED",
    }),
  });
  assert.equal(result.status, "TOUCH_WINDOW_EXPIRED");
  assert.equal(result.primaryBlocker, "TOUCH_WINDOW_INACTIVE");
});

test("confirmation conflict and non-alignment remain distinct", () => {
  const activeTouch = d8_3({
    status: "CONFIRMATION_WINDOW_ACTIVE",
    confirmationWindowStatus: "ACTIVE",
  });
  const readyTrigger = triggerAtDistance(0.03, "LONG", { status: "READY_FOR_CONFIRMATION_REVIEW" });

  const conflict = evaluate({
    pullbackTriggerThresholds: readyTrigger,
    pullbackZoneTouchEvidence: activeTouch,
    touchAwareConfirmationReview: d8_4({ status: "CONFIRMATION_CONFLICTING" }),
  });
  assert.equal(conflict.status, "CONFIRMATION_CONFLICTING");
  assert.equal(conflict.primaryBlocker, "MOMENTUM_CONFLICT");
  assert.equal(conflict.nextAlgorithmBranch, "REPAIR_CONFIRMATION");

  for (const status of ["WAITING_FOR_FRESH_CONFIRMATION", "CONFIRMATION_NOT_ALIGNED"]) {
    const pending = evaluate({
      pullbackTriggerThresholds: readyTrigger,
      pullbackZoneTouchEvidence: activeTouch,
      touchAwareConfirmationReview: d8_4({ status }),
    });
    assert.equal(pending.status, "CONFIRMATION_NOT_READY");
    assert.equal(pending.primaryBlocker, "MOMENTUM_NOT_CONFIRMED");
  }
});

test("any D8.0-D8.4 source safety mismatch blocks all recommendations", () => {
  const sourceFactories = [d8_0, d8_1, d8_2, d8_3, d8_4];
  const inputKeys = [
    "entryCandidateResolution",
    "resolverDrivenPullbackGate",
    "pullbackTriggerThresholds",
    "pullbackZoneTouchEvidence",
    "touchAwareConfirmationReview",
  ];
  const fields = ["activationAllowed", "paperActivationAllowed", "liveActivationAllowed"];

  for (let index = 0; index < sourceFactories.length; index += 1) {
    for (const field of fields) {
      const mismatched = { ...sourceFactories[index](), [field]: Boolean(1) };
      const result = evaluate({ [inputKeys[index]]: mismatched });
      assert.equal(result.status, "SAFETY_BLOCKED", `${inputKeys[index]}.${field}`);
      assert.equal(result.primaryBlocker, "SOURCE_SAFETY_INVALID");
      assert.equal(result.nextAlgorithmBranch, "NO_ACTION");
    }
  }
});

test("distance class boundaries are inclusive and deterministic", () => {
  const cases = [
    [0.05, "AT_TRIGGER"],
    [0.25, "NEAR"],
    [0.5, "MID_RANGE"],
    [0.75, "FAR"],
  ] as const;
  for (const [distance, expected] of cases) {
    const result = evaluate({ pullbackTriggerThresholds: triggerAtDistance(distance) });
    assert.equal(result.triggerDistanceClass, expected, String(distance));
  }
});

test("fresh aligned, conflicting, weak, and stale MTF evidence classify exactly", () => {
  const aligned = evaluate({ multiTimeframeIndicatorEvidence: strongLong });
  assert.equal(aligned.continuationEvidence.status, "STRONG_ALIGNED");
  assert.deepEqual(aligned.continuationEvidence.timeframesUsed, ["5M"]);

  const conflict = evaluate({
    multiTimeframeIndicatorEvidence: {
      "5M": {
        adx: 30,
        plusDI: 10,
        minusDI: 25,
        macdHistogram: -1,
        emaSlope: -0.5,
        freshness: { ageMs: 60_000 },
      },
    },
  });
  assert.equal(conflict.continuationEvidence.status, "CONFLICTING");

  const weak = evaluate({
    multiTimeframeIndicatorEvidence: {
      "5M": { adx: 20, plusDI: 28, minusDI: 14, macdHistogram: 1, freshness: { ageMs: 60_000 } },
    },
  });
  assert.equal(weak.continuationEvidence.status, "WEAK_OR_MIXED");

  const stale = evaluate({
    multiTimeframeIndicatorEvidence: {
      "5M": { ...strongLong["5M"], freshness: { ageMs: 15 * 60_000 + 1 } },
      "15M": { ...strongLong["5M"], freshness: { ageMs: 45 * 60_000 + 1 } },
    },
  });
  assert.equal(stale.continuationEvidence.status, "INSUFFICIENT");
  assert.deepEqual(stale.continuationEvidence.timeframesUsed, []);
});

test("FAR pullback-only state plus strong aligned evidence exposes strategy branch gap", () => {
  const result = evaluate({ multiTimeframeIndicatorEvidence: strongLong });
  assert.equal(result.status, "STRATEGY_BRANCH_GAP");
  assert.equal(result.primaryBlocker, "PRICE_ABOVE_LONG_TRIGGER");
  assert.deepEqual(result.contributingBlockers, [
    "PRICE_ABOVE_LONG_TRIGGER",
    "PULLBACK_ZONE_NOT_TOUCHED",
    "PULLBACK_ONLY_STRATEGY_GAP",
  ]);
  assert.equal(result.nextAlgorithmBranch, "DESIGN_CONTINUATION_REVIEW_BRANCH");
});

test("strong evidence does not recommend continuation near the existing trigger", () => {
  for (const distance of [0.2, 0.5]) {
    const result = evaluate({
      pullbackTriggerThresholds: triggerAtDistance(distance),
      multiTimeframeIndicatorEvidence: strongLong,
    });
    assert.equal(result.status, "WAITING_FOR_PULLBACK_TRIGGER");
    assert.equal(result.nextAlgorithmBranch, "WAIT_FOR_PULLBACK");
  }
});

test("SHORT strong bearish evidence mirrors strategy branch gap", () => {
  const result = evaluate({
    entryCandidateResolution: d8_0({ alignedDirection: "SHORT" }),
    resolverDrivenPullbackGate: d8_1({ alignedDirection: "SHORT" }),
    pullbackTriggerThresholds: triggerAtDistance(1, "SHORT"),
    pullbackZoneTouchEvidence: d8_3({ alignedDirection: "SHORT" }),
    touchAwareConfirmationReview: d8_4({ alignedDirection: "SHORT" }),
    multiTimeframeIndicatorEvidence: {
      "15M": {
        adx: 32,
        plusDI: 12,
        minusDI: 29,
        macdHistogram: -2,
        emaSlope: -0.8,
        freshness: { ageMs: 120_000 },
      },
    },
  });
  assert.equal(result.status, "STRATEGY_BRANCH_GAP");
  assert.equal(result.primaryBlocker, "PRICE_BELOW_SHORT_TRIGGER");
});

test("helper does not mutate inputs and all representative branches remain safe", () => {
  const input = {
    entryCandidateResolution: d8_0(),
    resolverDrivenPullbackGate: d8_1(),
    pullbackTriggerThresholds: d8_2(),
    pullbackZoneTouchEvidence: d8_3(),
    touchAwareConfirmationReview: d8_4(),
    multiTimeframeIndicatorEvidence: strongLong,
  };
  const before = structuredClone(input);
  const branchGap = evaluateNoReviewCandidateBottleneckResolver(input);
  assert.deepEqual(input, before);

  const results = [
    branchGap,
    evaluate(),
    evaluate({ pullbackTriggerThresholds: null }),
    evaluate({ pullbackTriggerThresholds: d8_2({ bestRR: 1, rrReady: false }) }),
  ];
  for (const result of results) {
    assert.equal(result.activationAllowed, false);
    assert.equal(result.paperActivationAllowed, false);
    assert.equal(result.liveActivationAllowed, false);
    assert.equal(result.reviewOnly, true);
    assert.equal(result.shadowOnly, true);
    assert.ok(result.doNotDo.length > 0);
  }
});
