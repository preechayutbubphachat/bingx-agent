// dashboard/lib/trend/resolverDrivenPullbackGate.test.ts
// Run: node --test --experimental-strip-types lib/trend/resolverDrivenPullbackGate.test.ts

import assert from "node:assert/strict";
import test from "node:test";

import { evaluateResolverDrivenPullbackGate } from "./resolverDrivenPullbackGate.ts";

function resolution(overrides: Record<string, unknown> = {}) {
  return {
    status: "WAITING_PULLBACK",
    alignedDirection: "LONG",
    currentPrice: 105,
    alignedEntryZone: [99, 101],
    rrThreshold: 1.2,
    bestReviewCandidate: { rr: 1.8 },
    rejectedOppositeCandidates: [],
    ...overrides,
  };
}

function gateInput(overrides: Record<string, unknown> = {}) {
  return {
    entryCandidateResolution: resolution(),
    multiTimeframeIndicatorEvidence: {},
    ...overrides,
  };
}

function indicator(overrides: Record<string, unknown> = {}) {
  return {
    plusDI: null,
    minusDI: null,
    macdHistogram: null,
    emaSlope: null,
    atr: null,
    freshness: { ageMs: 60_000 },
    ...overrides,
  };
}

test("LONG above the expanded zone stays WAITING_PULLBACK even when RR passes", () => {
  const result = evaluateResolverDrivenPullbackGate(gateInput());

  assert.equal(result.status, "WAITING_PULLBACK");
  assert.equal(result.alignedDirection, "LONG");
  assert.equal(result.rrStatus, "PASS");
  assert.equal(result.confirmationStatus, "NOT_EVALUATED_OUTSIDE_ZONE");
  assert.ok((result.priceDistanceToZonePct ?? 0) > 0);
  assert.match(result.nextAction, /enter the aligned LONG zone/i);
});

test("LONG inside zone with mixed fresh momentum remains CONFIRMATION_PENDING", () => {
  const result = evaluateResolverDrivenPullbackGate(gateInput({
    entryCandidateResolution: resolution({ currentPrice: 100 }),
    multiTimeframeIndicatorEvidence: {
      "5M": indicator({ plusDI: 24, minusDI: 14, macdHistogram: -0.5 }),
    },
  }));

  assert.equal(result.status, "CONFIRMATION_PENDING");
  assert.equal(result.confirmationStatus, "MOMENTUM_NOT_CONFIRMED");
  assert.equal(result.priceDistanceToZonePct, 0);
});

test("LONG inside zone with failing RR returns NO_TRADE_BAD_RR", () => {
  const result = evaluateResolverDrivenPullbackGate(gateInput({
    entryCandidateResolution: resolution({
      currentPrice: 100,
      bestReviewCandidate: { rr: 1.1 },
    }),
  }));

  assert.equal(result.status, "NO_TRADE_BAD_RR");
  assert.equal(result.rrStatus, "FAIL");
  assert.ok(result.blockers.includes("BEST_RR_BELOW_THRESHOLD"));
});

test("LONG inside zone with passing RR and bullish confirmation is clean review only", () => {
  const result = evaluateResolverDrivenPullbackGate(gateInput({
    entryCandidateResolution: resolution({ currentPrice: 100 }),
    multiTimeframeIndicatorEvidence: {
      "5M": indicator({ plusDI: 24, minusDI: 14, macdHistogram: 0.5, emaSlope: 1 }),
    },
  }));

  assert.equal(result.status, "CLEAN_REVIEW_CANDIDATE");
  assert.equal(result.confirmationStatus, "CONFIRMED_BULLISH");
  assert.equal(result.activationAllowed, false);
  assert.equal(result.paperActivationAllowed, false);
  assert.equal(result.liveActivationAllowed, false);
  assert.equal(result.reviewOnly, true);
  assert.equal(result.shadowOnly, true);
});

test("SHORT mirror confirms only bearish non-conflicting momentum", () => {
  const result = evaluateResolverDrivenPullbackGate(gateInput({
    entryCandidateResolution: resolution({
      alignedDirection: "SHORT",
      currentPrice: 100,
      alignedEntryZone: [99, 101],
    }),
    multiTimeframeIndicatorEvidence: {
      "5M": indicator({ plusDI: 12, minusDI: 25, macdHistogram: -0.5, emaSlope: -1 }),
    },
  }));

  assert.equal(result.status, "CLEAN_REVIEW_CANDIDATE");
  assert.equal(result.alignedDirection, "SHORT");
  assert.equal(result.confirmationStatus, "CONFIRMED_BEARISH");
});

test("bullish 5M and bearish 15M are conflicting instead of confirmed", () => {
  const result = evaluateResolverDrivenPullbackGate(gateInput({
    entryCandidateResolution: resolution({ currentPrice: 100 }),
    multiTimeframeIndicatorEvidence: {
      "5M": indicator({ plusDI: 24, minusDI: 14, macdHistogram: 0.5, emaSlope: 1 }),
      "15M": indicator({ plusDI: 12, minusDI: 25, macdHistogram: -0.5, emaSlope: -1 }),
    },
  }));

  assert.equal(result.status, "CONFIRMATION_PENDING");
  assert.equal(result.confirmationStatus, "CONFLICTING_MOMENTUM");
  assert.ok(result.blockers.includes("MOMENTUM_CONFLICT"));
});

test("passing RR in zone waits for a fresh indicator cycle when evidence is absent or stale", () => {
  const absent = evaluateResolverDrivenPullbackGate(gateInput({
    entryCandidateResolution: resolution({ currentPrice: 100 }),
  }));
  const stale = evaluateResolverDrivenPullbackGate(gateInput({
    entryCandidateResolution: resolution({ currentPrice: 100 }),
    multiTimeframeIndicatorEvidence: {
      "5M": indicator({
        plusDI: 24,
        minusDI: 14,
        freshness: { ageMs: 15 * 60 * 1000 + 1 },
      }),
    },
  }));

  assert.equal(absent.status, "RR_READY_WAITING_CONFIRMATION");
  assert.equal(absent.confirmationStatus, "WAITING_FOR_FRESH_EVIDENCE");
  assert.equal(stale.status, "RR_READY_WAITING_CONFIRMATION");
  assert.equal(stale.confirmationStatus, "WAITING_FOR_FRESH_EVIDENCE");
});

test("missing RR inside the aligned zone reports PRICE_IN_ALIGNED_ZONE", () => {
  const result = evaluateResolverDrivenPullbackGate(gateInput({
    entryCandidateResolution: resolution({
      currentPrice: 100,
      bestReviewCandidate: null,
    }),
  }));

  assert.equal(result.status, "PRICE_IN_ALIGNED_ZONE");
  assert.equal(result.rrStatus, "UNKNOWN");
  assert.ok(result.blockers.includes("RR_EVIDENCE_MISSING"));
});

test("fresh 15M ATR expands tolerance while stale ATR uses the price fallback", () => {
  const fresh = evaluateResolverDrivenPullbackGate(gateInput({
    entryCandidateResolution: resolution({ currentPrice: 100 }),
    multiTimeframeIndicatorEvidence: {
      "15M": indicator({ atr: 2, freshness: { ageMs: 60_000 } }),
    },
  }));
  const stale = evaluateResolverDrivenPullbackGate(gateInput({
    entryCandidateResolution: resolution({ currentPrice: 100 }),
    multiTimeframeIndicatorEvidence: {
      "15M": indicator({ atr: 2, freshness: { ageMs: 45 * 60 * 1000 + 1 } }),
    },
  }));

  assert.equal(fresh.zoneTolerance, 0.2);
  assert.equal(stale.zoneTolerance, 0.05);
});

test("tolerance accepts price just outside the raw zone and preserves positive raw-zone distance", () => {
  const result = evaluateResolverDrivenPullbackGate(gateInput({
    entryCandidateResolution: resolution({ currentPrice: 101.04 }),
    multiTimeframeIndicatorEvidence: {
      "5M": indicator({ plusDI: 24, minusDI: 14 }),
    },
  }));

  assert.equal(result.status, "CLEAN_REVIEW_CANDIDATE");
  assert.ok((result.priceDistanceToZonePct ?? 0) > 0);
  assert.equal(result.zoneTolerance, 101.04 * 0.0005);
});

test("counter-regime candidates in D8 evidence are ignored by the gate", () => {
  const common = {
    entryCandidateResolution: resolution({ currentPrice: 100 }),
    multiTimeframeIndicatorEvidence: {
      "5M": indicator({ plusDI: 24, minusDI: 14 }),
    },
  };
  const withoutCounter = evaluateResolverDrivenPullbackGate(gateInput(common));
  const withCounter = evaluateResolverDrivenPullbackGate(gateInput({
    ...common,
    entryCandidateResolution: resolution({
      currentPrice: 100,
      rejectedOppositeCandidates: [{
        id: "short-near",
        direction: "SHORT",
        qualityStatus: "TARGET_TOO_CLOSE",
      }],
    }),
  }));

  assert.deepEqual(withCounter, withoutCounter);
});

test("missing or counter-only D8 resolution returns NO_ALIGNED_RESOLUTION", () => {
  const missing = evaluateResolverDrivenPullbackGate(gateInput({
    entryCandidateResolution: null,
  }));
  const counterOnly = evaluateResolverDrivenPullbackGate(gateInput({
    entryCandidateResolution: resolution({ status: "COUNTER_REGIME_ONLY" }),
  }));

  assert.equal(missing.status, "NO_ALIGNED_RESOLUTION");
  assert.equal(counterOnly.status, "NO_ALIGNED_RESOLUTION");
  assert.equal(missing.activationAllowed, false);
  assert.equal(counterOnly.liveActivationAllowed, false);
});

test("all representative branches keep activation disabled", () => {
  const branches = [
    evaluateResolverDrivenPullbackGate(gateInput({ entryCandidateResolution: null })),
    evaluateResolverDrivenPullbackGate(gateInput()),
    evaluateResolverDrivenPullbackGate(gateInput({ entryCandidateResolution: resolution({ currentPrice: 100, bestReviewCandidate: null }) })),
    evaluateResolverDrivenPullbackGate(gateInput({ entryCandidateResolution: resolution({ currentPrice: 100, bestReviewCandidate: { rr: 1 } }) })),
    evaluateResolverDrivenPullbackGate(gateInput({ entryCandidateResolution: resolution({ currentPrice: 100 }) })),
    evaluateResolverDrivenPullbackGate(gateInput({
      entryCandidateResolution: resolution({ currentPrice: 100 }),
      multiTimeframeIndicatorEvidence: { "5M": indicator({ plusDI: 24, minusDI: 14, macdHistogram: -0.5 }) },
    })),
    evaluateResolverDrivenPullbackGate(gateInput({
      entryCandidateResolution: resolution({ currentPrice: 100 }),
      multiTimeframeIndicatorEvidence: { "5M": indicator({ plusDI: 24, minusDI: 14 }) },
    })),
  ];

  assert.deepEqual(new Set(branches.map((branch) => branch.status)), new Set([
    "NO_ALIGNED_RESOLUTION",
    "WAITING_PULLBACK",
    "PRICE_IN_ALIGNED_ZONE",
    "NO_TRADE_BAD_RR",
    "RR_READY_WAITING_CONFIRMATION",
    "CONFIRMATION_PENDING",
    "CLEAN_REVIEW_CANDIDATE",
  ]));

  for (const branch of branches) {
    assert.equal(branch.activationAllowed, false);
    assert.equal(branch.paperActivationAllowed, false);
    assert.equal(branch.liveActivationAllowed, false);
    assert.equal(branch.reviewOnly, true);
    assert.equal(branch.shadowOnly, true);
  }
});

test("does not mutate resolver or indicator inputs", () => {
  const input = gateInput({
    entryCandidateResolution: resolution({ currentPrice: 100 }),
    multiTimeframeIndicatorEvidence: {
      "5M": indicator({ plusDI: 24, minusDI: 14 }),
      "15M": indicator({ atr: 2 }),
    },
  });
  const before = structuredClone(input);

  evaluateResolverDrivenPullbackGate(input);

  assert.deepEqual(input, before);
});
