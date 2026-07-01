import { mkdir, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import {
  captureD8PointInTimeSnapshot,
  type D8PointInTimeSnapshotCaptureInput,
} from "./d8PointInTimeSnapshotCapture.ts";
import {
  validateD8PointInTimeSnapshot,
  type D8PointInTimeSnapshot,
  type D8SnapshotTimeframe,
} from "./d8PointInTimeSnapshot.ts";

type AnyObj = Record<string, unknown>;

export interface D8SnapshotDiagnosticsInputExporterInput {
  evaluatedAt?: unknown;
  source?: unknown;
  sourceTimeframe?: unknown;
  diagnostics?: unknown;
  producedAt?: unknown;
}

export interface D8SnapshotDiagnosticsSafety {
  activationAllowed: false;
  paperActivationAllowed: false;
  liveActivationAllowed: false;
  reviewOnly: true;
  shadowOnly: true;
}

export interface D8SnapshotDiagnosticsInputRow {
  schemaVersion: 1;
  source: string;
  evaluatedAt: string;
  producedAt: string;
  sourceTimeframe: D8SnapshotTimeframe;
  diagnostics: AnyObj;
  d8PointInTimeSnapshot: D8PointInTimeSnapshot;
  safety: D8SnapshotDiagnosticsSafety;
}

export interface D8SnapshotDiagnosticsInputOutputPathInput {
  outputPath: string;
  activeRepoRoot: string;
  approvedDiagnosticsInputRoot: string;
}

export interface WriteD8SnapshotDiagnosticsInputRowsInput extends D8SnapshotDiagnosticsInputOutputPathInput {
  rows: readonly D8SnapshotDiagnosticsInputRow[];
}

export interface WriteD8SnapshotDiagnosticsInputRowsResult {
  outputPath: string;
  wrote: true;
  rowCount: number;
}

export interface D8SnapshotDiagnosticsInputRowValidation {
  valid: boolean;
  errors: string[];
}

const SAFETY: D8SnapshotDiagnosticsSafety = {
  activationAllowed: false,
  paperActivationAllowed: false,
  liveActivationAllowed: false,
  reviewOnly: true,
  shadowOnly: true,
};

function obj(value: unknown): AnyObj {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as AnyObj : {};
}

function cloneObj(value: unknown): AnyObj {
  return JSON.parse(JSON.stringify(obj(value))) as AnyObj;
}

function stringField(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`missing_required_field:${field}`);
  return value.trim();
}

function timestampField(value: unknown, field: string): string {
  const parsed = stringField(value, field);
  if (!Number.isFinite(Date.parse(parsed))) throw new Error(`invalid_timestamp:${field}`);
  return parsed;
}

function timeframe(value: unknown): D8SnapshotTimeframe {
  if (value === "5M" || value === "15M" || value === "1H") return value;
  throw new Error("invalid_source_timeframe");
}

function pathKey(value: string): string {
  return resolve(value).replaceAll("\\", "/").replace(/\/+$/, "").toLowerCase();
}

function pathSegments(value: string): string[] {
  return pathKey(value).split("/").filter(Boolean);
}

function isInside(parent: string, child: string): boolean {
  const rel = relative(resolve(parent), resolve(child));
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

function hasBlockedPathSegment(path: string): boolean {
  const normalized = pathKey(path);
  const segments = pathSegments(path);
  return normalized.startsWith("server:")
    || normalized.includes("/var/www/vhosts")
    || normalized.includes("ob-gate.com/httpdocs")
    || segments.includes("source")
    || segments.includes("staging")
    || segments.includes("server")
    || segments.includes("research-packs")
    || segments.includes("research-runs");
}

function existingSnapshot(diagnostics: AnyObj): D8PointInTimeSnapshot | null {
  if (!("d8PointInTimeSnapshot" in diagnostics)) return null;
  const validation = validateD8PointInTimeSnapshot(diagnostics.d8PointInTimeSnapshot);
  if (!validation.valid || validation.snapshot === null) {
    throw new Error(validation.errors.join(","));
  }
  return validation.snapshot;
}

function captureInput(
  evaluatedAt: string,
  sourceTimeframe: D8SnapshotTimeframe,
  diagnostics: AnyObj,
): D8PointInTimeSnapshotCaptureInput {
  return {
    evaluatedAt,
    sourceTimeframe,
    alignedContext: diagnostics.alignedContext,
    d8_0AlignedCandidate: diagnostics.d8_0AlignedCandidate,
    rrReady: diagnostics.rrReady,
    triggerReached: diagnostics.triggerReached,
    zoneTouched: diagnostics.zoneTouched,
    confirmationWindowActive: diagnostics.confirmationWindowActive,
    confirmationAligned: diagnostics.confirmationAligned,
    promotableReviewCandidate: diagnostics.promotableReviewCandidate,
    bottleneckStatus: diagnostics.bottleneckStatus,
    triggerDistanceClass: diagnostics.triggerDistanceClass,
    sourceSafetyValid: diagnostics.sourceSafetyValid,
    dataQualityValid: diagnostics.dataQualityValid,
    entryCandidateResolution: diagnostics.entryCandidateResolution,
    pullbackTriggerThresholds: diagnostics.pullbackTriggerThresholds,
    pullbackZoneTouchEvidence: diagnostics.pullbackZoneTouchEvidence,
    touchAwareConfirmationReview: diagnostics.touchAwareConfirmationReview,
    noReviewCandidateBottleneckResolver: diagnostics.noReviewCandidateBottleneckResolver,
  };
}

export function createD8SnapshotDiagnosticsInputRow(
  input: D8SnapshotDiagnosticsInputExporterInput,
): D8SnapshotDiagnosticsInputRow {
  const evaluatedAt = timestampField(input.evaluatedAt, "evaluatedAt");
  const source = stringField(input.source, "source");
  const sourceTimeframe = timeframe(input.sourceTimeframe);
  const diagnostics = cloneObj(input.diagnostics);
  const producedAt = input.producedAt == null
    ? new Date().toISOString()
    : timestampField(input.producedAt, "producedAt");
  const snapshot = existingSnapshot(diagnostics)
    ?? captureD8PointInTimeSnapshot(captureInput(evaluatedAt, sourceTimeframe, diagnostics));

  return {
    schemaVersion: 1,
    source,
    evaluatedAt,
    producedAt,
    sourceTimeframe,
    diagnostics,
    d8PointInTimeSnapshot: snapshot,
    safety: { ...SAFETY },
  };
}

export function validateD8SnapshotDiagnosticsInputRowShape(
  value: unknown,
): D8SnapshotDiagnosticsInputRowValidation {
  const errors: string[] = [];
  const row = obj(value);

  if (row.schemaVersion !== 1) errors.push("invalid_schemaVersion");
  if (typeof row.source !== "string" || !row.source.trim()) errors.push("missing_source");
  if (typeof row.evaluatedAt !== "string" || !Number.isFinite(Date.parse(row.evaluatedAt))) {
    errors.push("invalid_evaluatedAt");
  }
  if (typeof row.producedAt !== "string" || !Number.isFinite(Date.parse(row.producedAt))) {
    errors.push("invalid_producedAt");
  }
  if (row.sourceTimeframe !== "5M" && row.sourceTimeframe !== "15M" && row.sourceTimeframe !== "1H") {
    errors.push("invalid_sourceTimeframe");
  }
  if (Object.keys(obj(row.diagnostics)).length === 0) errors.push("missing_diagnostics");

  const snapshotValidation = validateD8PointInTimeSnapshot(row.d8PointInTimeSnapshot);
  if (!snapshotValidation.valid) {
    errors.push(...snapshotValidation.errors.map((error) => `d8PointInTimeSnapshot:${error}`));
  }

  const safety = obj(row.safety);
  if (safety.activationAllowed !== false) errors.push("unsafe_activationAllowed");
  if (safety.paperActivationAllowed !== false) errors.push("unsafe_paperActivationAllowed");
  if (safety.liveActivationAllowed !== false) errors.push("unsafe_liveActivationAllowed");
  if (safety.reviewOnly !== true) errors.push("unsafe_reviewOnly");
  if (safety.shadowOnly !== true) errors.push("unsafe_shadowOnly");

  return { valid: errors.length === 0, errors };
}

export function validateD8SnapshotDiagnosticsInputOutputPath(
  input: D8SnapshotDiagnosticsInputOutputPathInput,
): string {
  if (!input.outputPath.trim()) throw new Error("output_path_required");
  if (!input.activeRepoRoot.trim()) throw new Error("active_repo_root_required");
  if (!input.approvedDiagnosticsInputRoot.trim()) throw new Error("approved_output_root_required");

  const outputPath = resolve(input.outputPath);
  const activeRepoRoot = resolve(input.activeRepoRoot);
  const approvedRoot = resolve(input.approvedDiagnosticsInputRoot);
  const finalSnapshotPathKey = pathKey(resolve(approvedRoot, "..", "d8-snapshots"));

  if (isInside(activeRepoRoot, outputPath)) throw new Error("output_path_inside_active_repo");
  if (pathKey(outputPath).startsWith(finalSnapshotPathKey)) throw new Error("output_path_final_snapshot_path_forbidden");
  if (hasBlockedPathSegment(outputPath)) throw new Error("output_path_forbidden_path");
  if (!isInside(approvedRoot, outputPath)) throw new Error("output_path_not_approved_diagnostics_input_path");
  if (!pathKey(approvedRoot).endsWith("/dashboard/tmp/d8-diagnostics-input")) {
    throw new Error("approved_output_root_not_d8_diagnostics_input");
  }
  if (!outputPath.endsWith(".jsonl")) throw new Error("output_path_must_be_jsonl");
  return outputPath;
}

export async function writeD8SnapshotDiagnosticsInputRows(
  input: WriteD8SnapshotDiagnosticsInputRowsInput,
): Promise<WriteD8SnapshotDiagnosticsInputRowsResult> {
  const outputPath = validateD8SnapshotDiagnosticsInputOutputPath(input);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${input.rows.map((row) => JSON.stringify(row)).join("\n")}\n`, "utf8");
  return { outputPath, wrote: true, rowCount: input.rows.length };
}
