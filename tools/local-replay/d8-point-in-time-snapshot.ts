export const D8_POINT_IN_TIME_SNAPSHOT_SOURCE = "D8_POINT_IN_TIME_SNAPSHOT_V1";

export type D8SnapshotTimeframe = "5M" | "15M" | "1H";

export interface D8PointInTimeSnapshot {
  schemaVersion: 1;
  source: typeof D8_POINT_IN_TIME_SNAPSHOT_SOURCE;
  evaluatedAt: string;
  sourceTimeframe: D8SnapshotTimeframe;
  alignedContext: boolean;
  d8_0AlignedCandidate: boolean;
  rrReady: boolean;
  d8_2Status: string;
  triggerReached: boolean;
  d8_3Status: string;
  zoneTouched: boolean;
  confirmationWindowActive: boolean;
  d8_4Status: string;
  confirmationAligned: boolean;
  promotableReviewCandidate: boolean;
  bottleneckStatus: string;
  triggerDistanceClass: string;
  sourceSafetyValid: boolean;
  dataQualityValid: boolean;
  activationAllowed: false;
  paperActivationAllowed: false;
  liveActivationAllowed: false;
  reviewOnly: true;
  shadowOnly: true;
}

export interface D8PointInTimeSnapshotValidation {
  valid: boolean;
  errors: string[];
  snapshot: D8PointInTimeSnapshot | null;
}

const BOOLEAN_FIELDS = [
  "alignedContext",
  "d8_0AlignedCandidate",
  "rrReady",
  "triggerReached",
  "zoneTouched",
  "confirmationWindowActive",
  "confirmationAligned",
  "promotableReviewCandidate",
  "sourceSafetyValid",
  "dataQualityValid",
] as const;

const STRING_FIELDS = [
  "evaluatedAt",
  "source",
  "sourceTimeframe",
  "d8_2Status",
  "d8_3Status",
  "d8_4Status",
  "bottleneckStatus",
  "triggerDistanceClass",
] as const;

const REQUIRED_FIELDS = [
  "schemaVersion",
  ...STRING_FIELDS,
  ...BOOLEAN_FIELDS,
  "activationAllowed",
  "paperActivationAllowed",
  "liveActivationAllowed",
  "reviewOnly",
  "shadowOnly",
] as const;

function obj(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function timestampMs(value: unknown): number | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function validateD8PointInTimeSnapshot(
  value: unknown,
  options: { evaluationCandleAt?: string | null } = {},
): D8PointInTimeSnapshotValidation {
  const row = obj(value);
  const errors: string[] = [];

  for (const field of REQUIRED_FIELDS) {
    if (!(field in row)) errors.push(`missing_required_field:${field}`);
  }

  if ("schemaVersion" in row && row.schemaVersion !== 1) errors.push("schema_version_must_be_1");
  if ("source" in row && row.source !== D8_POINT_IN_TIME_SNAPSHOT_SOURCE) errors.push("invalid_source");
  if ("sourceTimeframe" in row && row.sourceTimeframe !== "5M" && row.sourceTimeframe !== "15M" && row.sourceTimeframe !== "1H") {
    errors.push("invalid_source_timeframe");
  }

  for (const field of STRING_FIELDS) {
    if (field in row && (typeof row[field] !== "string" || String(row[field]).trim() === "")) {
      errors.push(`invalid_string:${field}`);
    }
  }
  for (const field of BOOLEAN_FIELDS) {
    if (field in row && typeof row[field] !== "boolean") errors.push(`invalid_boolean:${field}`);
  }

  const evaluatedAtMs = timestampMs(row.evaluatedAt);
  if ("evaluatedAt" in row && evaluatedAtMs === null) errors.push("invalid_timestamp:evaluatedAt");

  const evaluationCandleAtMs = timestampMs(options.evaluationCandleAt);
  if (evaluatedAtMs !== null && evaluationCandleAtMs !== null && evaluatedAtMs > evaluationCandleAtMs) {
    errors.push("future_leak:evaluatedAt_after_evaluation_candle");
  }

  if ("activationAllowed" in row && row.activationAllowed !== false) errors.push("activation_allowed_must_be_false");
  if ("paperActivationAllowed" in row && row.paperActivationAllowed !== false) errors.push("paper_activation_allowed_must_be_false");
  if ("liveActivationAllowed" in row && row.liveActivationAllowed !== false) errors.push("live_activation_allowed_must_be_false");
  if ("reviewOnly" in row && row.reviewOnly !== true) errors.push("review_only_must_be_true");
  if ("shadowOnly" in row && row.shadowOnly !== true) errors.push("shadow_only_must_be_true");

  if (errors.length > 0) return { valid: false, errors, snapshot: null };
  return { valid: true, errors, snapshot: row as unknown as D8PointInTimeSnapshot };
}
