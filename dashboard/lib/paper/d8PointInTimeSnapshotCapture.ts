import {
  D8_POINT_IN_TIME_SNAPSHOT_SOURCE,
  validateD8PointInTimeSnapshot,
  type D8PointInTimeSnapshot,
  type D8SnapshotTimeframe,
} from "./d8PointInTimeSnapshot.ts";

type AnyObj = Record<string, unknown>;

export interface D8PointInTimeSnapshotCaptureInput {
  evaluatedAt?: unknown;
  sourceTimeframe?: unknown;
  alignedContext?: unknown;
  d8_0AlignedCandidate?: unknown;
  rrReady?: unknown;
  triggerReached?: unknown;
  zoneTouched?: unknown;
  confirmationWindowActive?: unknown;
  confirmationAligned?: unknown;
  promotableReviewCandidate?: unknown;
  bottleneckStatus?: unknown;
  triggerDistanceClass?: unknown;
  sourceSafetyValid?: unknown;
  dataQualityValid?: unknown;
  entryCandidateResolution?: unknown;
  pullbackTriggerThresholds?: unknown;
  pullbackZoneTouchEvidence?: unknown;
  touchAwareConfirmationReview?: unknown;
  noReviewCandidateBottleneckResolver?: unknown;
}

function obj(value: unknown): AnyObj {
  return value && typeof value === "object" && !Array.isArray(value) ? value as AnyObj : {};
}

function bool(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function str(value: unknown, fallback = "UNKNOWN"): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function timeframe(value: unknown): D8SnapshotTimeframe {
  return value === "15M" || value === "1H" ? value : "5M";
}

function sourceSafe(value: AnyObj): boolean {
  return value.activationAllowed === false
    && value.paperActivationAllowed === false
    && value.liveActivationAllowed === false;
}

function allSourceSafe(sources: AnyObj[]): boolean {
  return sources.length > 0 && sources.every(sourceSafe);
}

function alignedCandidate(status: string): boolean {
  return status === "ALIGNED_CANDIDATE_READY"
    || status === "READY"
    || status === "RESOLVED"
    || status === "ALIGNED";
}

function confirmationAligned(status: string): boolean {
  return status === "CONFIRMED_BULLISH"
    || status === "CONFIRMED_BEARISH"
    || status === "CONFIRMATION_ALIGNED"
    || status === "PROMOTABLE_REVIEW_CANDIDATE";
}

export function captureD8PointInTimeSnapshot(input: D8PointInTimeSnapshotCaptureInput): D8PointInTimeSnapshot {
  if (!("evaluatedAt" in obj(input))) {
    throw new Error("missing_required_field:evaluatedAt");
  }

  const d8_0 = obj(input.entryCandidateResolution);
  const d8_2 = obj(input.pullbackTriggerThresholds);
  const d8_3 = obj(input.pullbackZoneTouchEvidence);
  const d8_4 = obj(input.touchAwareConfirmationReview);
  const bottleneck = obj(input.noReviewCandidateBottleneckResolver);
  const d8_0Status = str(d8_0.status);
  const d8_2Status = str(d8_2.status);
  const d8_3Status = str(d8_3.status);
  const d8_4Status = str(d8_4.status);
  const confirmationStatus = str(d8_4.confirmationStatus);
  const sources = [d8_0, d8_2, d8_3, d8_4, bottleneck].filter((source) => Object.keys(source).length > 0);
  const sourceSafetyValid = bool(input.sourceSafetyValid, allSourceSafe(sources));
  const dataQualityValid = bool(input.dataQualityValid, sourceSafetyValid && sources.length >= 4);

  const row: D8PointInTimeSnapshot = {
    schemaVersion: 1,
    source: D8_POINT_IN_TIME_SNAPSHOT_SOURCE,
    evaluatedAt: String(input.evaluatedAt ?? ""),
    sourceTimeframe: timeframe(input.sourceTimeframe),
    alignedContext: bool(input.alignedContext, alignedCandidate(d8_0Status)),
    d8_0AlignedCandidate: bool(input.d8_0AlignedCandidate, alignedCandidate(d8_0Status)),
    rrReady: bool(input.rrReady, bool(d8_2.rrReady)),
    d8_2Status,
    triggerReached: bool(input.triggerReached, bool(d8_2.triggerReached)),
    d8_3Status,
    zoneTouched: bool(input.zoneTouched, bool(d8_3.zoneTouched)),
    confirmationWindowActive: bool(
      input.confirmationWindowActive,
      bool(d8_3.shouldEvaluateConfirmation) || str(d8_3.confirmationWindowStatus) === "ACTIVE",
    ),
    d8_4Status,
    confirmationAligned: bool(input.confirmationAligned, confirmationAligned(confirmationStatus) || d8_4Status === "PROMOTABLE_REVIEW_CANDIDATE"),
    promotableReviewCandidate: bool(input.promotableReviewCandidate, bool(d8_4.shouldPromoteToReview)),
    bottleneckStatus: str(input.bottleneckStatus, str(bottleneck.status)),
    triggerDistanceClass: str(input.triggerDistanceClass, str(bottleneck.triggerDistanceClass, str(d8_2.triggerDistanceClass))),
    sourceSafetyValid,
    dataQualityValid,
    activationAllowed: false,
    paperActivationAllowed: false,
    liveActivationAllowed: false,
    reviewOnly: true,
    shadowOnly: true,
  };

  const validation = validateD8PointInTimeSnapshot(row);
  if (!validation.valid || validation.snapshot == null) {
    throw new Error(validation.errors.join(","));
  }

  return validation.snapshot;
}
