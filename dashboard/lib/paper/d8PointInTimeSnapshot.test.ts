import assert from "node:assert/strict";
import { test } from "node:test";
import {
  D8_POINT_IN_TIME_SNAPSHOT_SCHEMA_VERSION,
  D8_POINT_IN_TIME_SNAPSHOT_SOURCE,
  validateD8PointInTimeSnapshot,
} from "./d8PointInTimeSnapshot.ts";

function canonicalSnapshot(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: D8_POINT_IN_TIME_SNAPSHOT_SCHEMA_VERSION,
    source: D8_POINT_IN_TIME_SNAPSHOT_SOURCE,
    evaluatedAt: "2026-06-30T00:00:00.000Z",
    sourceTimeframe: "5M",
    alignedContext: false,
    d8_0AlignedCandidate: false,
    rrReady: false,
    d8_2Status: "UNKNOWN",
    triggerReached: false,
    d8_3Status: "UNKNOWN",
    zoneTouched: false,
    confirmationWindowActive: false,
    d8_4Status: "UNKNOWN",
    confirmationAligned: false,
    promotableReviewCandidate: false,
    bottleneckStatus: "UNKNOWN",
    triggerDistanceClass: "UNKNOWN",
    sourceSafetyValid: false,
    dataQualityValid: false,
    activationAllowed: false,
    paperActivationAllowed: false,
    liveActivationAllowed: false,
    reviewOnly: true,
    shadowOnly: true,
    ...overrides,
  };
}

test("validates canonical D8 point-in-time snapshot rows from dashboard-safe module", () => {
  const validation = validateD8PointInTimeSnapshot(canonicalSnapshot());

  assert.equal(D8_POINT_IN_TIME_SNAPSHOT_SCHEMA_VERSION, 1);
  assert.equal(validation.valid, true);
  assert.equal(validation.snapshot?.activationAllowed, false);
  assert.equal(validation.snapshot?.paperActivationAllowed, false);
  assert.equal(validation.snapshot?.liveActivationAllowed, false);
  assert.equal(validation.snapshot?.reviewOnly, true);
  assert.equal(validation.snapshot?.shadowOnly, true);
});

test("rejects invalid timestamp and future-leaking snapshots", () => {
  assert.deepEqual(
    validateD8PointInTimeSnapshot(canonicalSnapshot({ evaluatedAt: "invalid" })).errors,
    ["invalid_timestamp:evaluatedAt"],
  );
  assert.deepEqual(
    validateD8PointInTimeSnapshot(
      canonicalSnapshot({ evaluatedAt: "2026-06-30T00:05:00.000Z" }),
      { evaluationCandleAt: "2026-06-30T00:00:00.000Z" },
    ).errors,
    ["future_leak:evaluatedAt_after_evaluation_candle"],
  );
});

test("rejects unsafe activation flags", () => {
  const validation = validateD8PointInTimeSnapshot(canonicalSnapshot({
    activationAllowed: true,
    paperActivationAllowed: true,
    liveActivationAllowed: true,
    reviewOnly: false,
    shadowOnly: false,
  }));

  assert.equal(validation.valid, false);
  assert.deepEqual(validation.errors, [
    "activation_allowed_must_be_false",
    "paper_activation_allowed_must_be_false",
    "live_activation_allowed_must_be_false",
    "review_only_must_be_true",
    "shadow_only_must_be_true",
  ]);
});
