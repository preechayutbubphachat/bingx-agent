import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { validateD8PointInTimeSnapshot } from "../../../tools/local-replay/d8-point-in-time-snapshot.ts";
import { captureD8PointInTimeSnapshot } from "./d8PointInTimeSnapshotCapture.ts";

const EVALUATED_AT = "2026-06-30T00:00:00.000Z";

function fullInput(overrides: Record<string, unknown> = {}) {
  return {
    evaluatedAt: EVALUATED_AT,
    sourceTimeframe: "5M",
    entryCandidateResolution: {
      status: "ALIGNED_CANDIDATE_READY",
      activationAllowed: false,
      paperActivationAllowed: false,
      liveActivationAllowed: false,
    },
    pullbackTriggerThresholds: {
      status: "WAITING_FOR_TRIGGER_PRICE",
      rrReady: true,
      triggerReached: false,
      triggerDistanceClass: "FAR",
      activationAllowed: false,
      paperActivationAllowed: false,
      liveActivationAllowed: false,
    },
    pullbackZoneTouchEvidence: {
      status: "NO_TOUCH_YET",
      zoneTouched: false,
      confirmationWindowStatus: "TOUCH_WINDOW_INACTIVE",
      shouldEvaluateConfirmation: false,
      activationAllowed: false,
      paperActivationAllowed: false,
      liveActivationAllowed: false,
    },
    touchAwareConfirmationReview: {
      status: "TOUCH_WINDOW_INACTIVE",
      confirmationStatus: "NOT_EVALUATED",
      shouldPromoteToReview: false,
      activationAllowed: false,
      paperActivationAllowed: false,
      liveActivationAllowed: false,
    },
    noReviewCandidateBottleneckResolver: {
      status: "PULLBACK_TRIGGER_NOT_REACHED",
      triggerDistanceClass: "FAR",
      activationAllowed: false,
      paperActivationAllowed: false,
      liveActivationAllowed: false,
    },
    ...overrides,
  };
}

test("capture helper rejects missing evaluatedAt", () => {
  assert.throws(
    () => captureD8PointInTimeSnapshot({ sourceTimeframe: "5M" }),
    /missing_required_field:evaluatedAt/,
  );
});

test("capture helper rejects invalid evaluatedAt", () => {
  assert.throws(
    () => captureD8PointInTimeSnapshot(fullInput({ evaluatedAt: "not-a-date" })),
    /invalid_timestamp:evaluatedAt/,
  );
});

test("capture helper forces all activation flags safe even if input is unsafe", () => {
  const snapshot = captureD8PointInTimeSnapshot(fullInput({
    activationAllowed: true,
    paperActivationAllowed: true,
    liveActivationAllowed: true,
    reviewOnly: false,
    shadowOnly: false,
  }));

  assert.equal(snapshot.activationAllowed, false);
  assert.equal(snapshot.paperActivationAllowed, false);
  assert.equal(snapshot.liveActivationAllowed, false);
  assert.equal(snapshot.reviewOnly, true);
  assert.equal(snapshot.shadowOnly, true);
});

test("capture helper fills all required D8 fields", () => {
  const snapshot = captureD8PointInTimeSnapshot(fullInput());

  for (const field of [
    "evaluatedAt",
    "sourceTimeframe",
    "alignedContext",
    "d8_0AlignedCandidate",
    "rrReady",
    "d8_2Status",
    "triggerReached",
    "d8_3Status",
    "zoneTouched",
    "confirmationWindowActive",
    "d8_4Status",
    "confirmationAligned",
    "promotableReviewCandidate",
    "bottleneckStatus",
    "triggerDistanceClass",
    "sourceSafetyValid",
    "dataQualityValid",
  ]) {
    assert.equal(Object.hasOwn(snapshot, field), true, field);
  }
});

test("missing diagnostic subfields become deterministic UNKNOWN and false values", () => {
  const snapshot = captureD8PointInTimeSnapshot({
    evaluatedAt: EVALUATED_AT,
    sourceTimeframe: "5M",
  });

  assert.equal(snapshot.alignedContext, false);
  assert.equal(snapshot.d8_0AlignedCandidate, false);
  assert.equal(snapshot.rrReady, false);
  assert.equal(snapshot.d8_2Status, "UNKNOWN");
  assert.equal(snapshot.triggerReached, false);
  assert.equal(snapshot.d8_3Status, "UNKNOWN");
  assert.equal(snapshot.zoneTouched, false);
  assert.equal(snapshot.confirmationWindowActive, false);
  assert.equal(snapshot.d8_4Status, "UNKNOWN");
  assert.equal(snapshot.confirmationAligned, false);
  assert.equal(snapshot.promotableReviewCandidate, false);
  assert.equal(snapshot.bottleneckStatus, "UNKNOWN");
  assert.equal(snapshot.triggerDistanceClass, "UNKNOWN");
  assert.equal(snapshot.sourceSafetyValid, false);
  assert.equal(snapshot.dataQualityValid, false);
});

test("capture output validates with canonical D8 snapshot validator", () => {
  const snapshot = captureD8PointInTimeSnapshot(fullInput());
  const validation = validateD8PointInTimeSnapshot(snapshot);

  assert.equal(validation.valid, true);
  assert.deepEqual(validation.errors, []);
});

test("capture helper does not import persistence or forbidden surfaces", async () => {
  const source = await readFile("dashboard/lib/paper/d8PointInTimeSnapshotCapture.ts", "utf8");

  assert.doesNotMatch(source, /node:fs|fs\/promises|writeFile|createWriteStream|appendFile/i);
  assert.doesNotMatch(source, /writer|broker|order|execution|api|process\.env|config\/db|secrets/i);
  assert.doesNotMatch(source, /D8\.5|d8-5|continuation/i);
});
