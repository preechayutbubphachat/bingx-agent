import assert from "node:assert/strict";
import test from "node:test";
import {
  D8_POINT_IN_TIME_SNAPSHOT_SOURCE,
  validateD8PointInTimeSnapshot,
  type D8PointInTimeSnapshot,
} from "./d8-point-in-time-snapshot.ts";

const BASE = Date.UTC(2026, 0, 1, 0, 0, 0);

function validSnapshot(overrides: Record<string, unknown> = {}): D8PointInTimeSnapshot {
  return {
    schemaVersion: 1,
    source: D8_POINT_IN_TIME_SNAPSHOT_SOURCE,
    evaluatedAt: new Date(BASE).toISOString(),
    sourceTimeframe: "5M",
    alignedContext: true,
    d8_0AlignedCandidate: true,
    rrReady: true,
    d8_2Status: "RR_READY",
    triggerReached: false,
    d8_3Status: "WAITING_FOR_PULLBACK_TRIGGER",
    zoneTouched: false,
    confirmationWindowActive: false,
    d8_4Status: "CONFIRMATION_NOT_READY",
    confirmationAligned: false,
    promotableReviewCandidate: false,
    bottleneckStatus: "WAITING_FOR_PULLBACK_TRIGGER",
    triggerDistanceClass: "FAR",
    sourceSafetyValid: true,
    dataQualityValid: true,
    activationAllowed: false,
    paperActivationAllowed: false,
    liveActivationAllowed: false,
    reviewOnly: true,
    shadowOnly: true,
    ...overrides,
  };
}

test("rejects D8 snapshot missing evaluatedAt", () => {
  const row = validSnapshot();
  delete (row as Partial<D8PointInTimeSnapshot>).evaluatedAt;

  const result = validateD8PointInTimeSnapshot(row);

  assert.equal(result.valid, false);
  assert.equal(result.errors.includes("missing_required_field:evaluatedAt"), true);
});

test("rejects invalid evaluatedAt", () => {
  const result = validateD8PointInTimeSnapshot(validSnapshot({ evaluatedAt: "not-a-date" }));

  assert.equal(result.valid, false);
  assert.equal(result.errors.includes("invalid_timestamp:evaluatedAt"), true);
});

test("rejects snapshot with unsafe activation flags", () => {
  const result = validateD8PointInTimeSnapshot(validSnapshot({
    activationAllowed: true,
    paperActivationAllowed: true,
    liveActivationAllowed: true,
    reviewOnly: false,
    shadowOnly: false,
  }));

  assert.equal(result.valid, false);
  assert.equal(result.errors.includes("activation_allowed_must_be_false"), true);
  assert.equal(result.errors.includes("paper_activation_allowed_must_be_false"), true);
  assert.equal(result.errors.includes("live_activation_allowed_must_be_false"), true);
  assert.equal(result.errors.includes("review_only_must_be_true"), true);
  assert.equal(result.errors.includes("shadow_only_must_be_true"), true);
});

test("rejects missing required D8 field", () => {
  const row = validSnapshot();
  delete (row as Partial<D8PointInTimeSnapshot>).d8_4Status;

  const result = validateD8PointInTimeSnapshot(row);

  assert.equal(result.valid, false);
  assert.equal(result.errors.includes("missing_required_field:d8_4Status"), true);
});

test("rejects future-leaking snapshot newer than evaluation candle", () => {
  const result = validateD8PointInTimeSnapshot(
    validSnapshot({ evaluatedAt: new Date(BASE + 5 * 60_000).toISOString() }),
    { evaluationCandleAt: new Date(BASE).toISOString() },
  );

  assert.equal(result.valid, false);
  assert.equal(result.errors.includes("future_leak:evaluatedAt_after_evaluation_candle"), true);
});

test("accepts exact canonical D8 snapshot row and preserves safety flags", () => {
  const result = validateD8PointInTimeSnapshot(validSnapshot());

  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
  assert.equal(result.snapshot?.activationAllowed, false);
  assert.equal(result.snapshot?.paperActivationAllowed, false);
  assert.equal(result.snapshot?.liveActivationAllowed, false);
  assert.equal(result.snapshot?.reviewOnly, true);
  assert.equal(result.snapshot?.shadowOnly, true);
});
