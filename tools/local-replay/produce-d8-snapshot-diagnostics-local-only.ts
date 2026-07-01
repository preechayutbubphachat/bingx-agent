import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  captureD8PointInTimeSnapshot,
  type D8PointInTimeSnapshotCaptureInput,
} from "../../dashboard/lib/paper/d8PointInTimeSnapshotCapture.ts";
import {
  validateD8PointInTimeSnapshot,
  type D8PointInTimeSnapshot,
} from "./d8-point-in-time-snapshot.ts";

export interface ProduceD8SnapshotDiagnosticsInput {
  inputPath: string;
  outputPath: string;
  activeRepoRoot: string;
  approvedLocalMirrorRoot: string;
  apply?: boolean;
  inputText?: string;
}

export interface D8SnapshotDiagnosticsOutputPathInput {
  outputPath: string;
  activeRepoRoot: string;
  approvedLocalMirrorRoot: string;
}

export interface ProducedD8SnapshotDiagnosticsRow {
  producedAt: string;
  source: {
    kind: "D8_SNAPSHOT_DIAGNOSTICS_LOCAL_ONLY";
    inputPath: string;
    inputRowNumber: number;
    rowReference: string | null;
  };
  d8PointInTimeSnapshot: D8PointInTimeSnapshot;
}

export interface ProduceD8SnapshotDiagnosticsReport {
  mode: "DRY_RUN" | "APPLY";
  inputRows: number;
  diagnosticsRowsAccepted: number;
  snapshotsProduced: number;
  invalidRows: number;
  skippedRows: number;
  duplicateEvaluatedAt: number;
  outputPath: string;
  wroteFiles: string[];
  warnings: string[];
  blockers: string[];
}

interface LoadedRows {
  rows: unknown[];
  warnings: string[];
  missing: boolean;
}

function obj(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    const parsed = nonEmptyString(value);
    if (parsed !== null) return parsed;
  }
  return null;
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

function hasForbiddenPathSegment(path: string): boolean {
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

export function validateD8SnapshotDiagnosticsOutputPath(input: D8SnapshotDiagnosticsOutputPathInput): string {
  if (!input.outputPath.trim()) throw new Error("output_path_required");
  if (!input.activeRepoRoot.trim()) throw new Error("active_repo_root_required");
  if (!input.approvedLocalMirrorRoot.trim()) throw new Error("approved_local_mirror_root_required");

  const outputPath = resolve(input.outputPath);
  const activeRepoRoot = resolve(input.activeRepoRoot);
  const approvedLocalMirrorRoot = resolve(input.approvedLocalMirrorRoot);
  const approvedDiagnosticsRoot = resolve(approvedLocalMirrorRoot, "dashboard", "tmp", "d8-snapshot-diagnostics");
  const finalSnapshotRoot = resolve(approvedLocalMirrorRoot, "dashboard", "tmp", "d8-snapshots");

  if (isInside(activeRepoRoot, outputPath)) throw new Error("output_path_inside_active_repo");
  if (isInside(finalSnapshotRoot, outputPath)) throw new Error("output_path_final_snapshot_path_forbidden");
  if (hasForbiddenPathSegment(outputPath)) throw new Error("output_path_forbidden_path");
  if (!isInside(approvedDiagnosticsRoot, outputPath)) {
    throw new Error("output_path_not_approved_d8_snapshot_diagnostics_path");
  }
  if (!outputPath.endsWith(".jsonl")) throw new Error("output_path_must_be_jsonl");
  return outputPath;
}

function argValue(argv: readonly string[], name: string): string {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] ?? "" : "";
}

export function parseProduceD8SnapshotDiagnosticsArgs(argv: readonly string[]): ProduceD8SnapshotDiagnosticsInput {
  const inputPath = argValue(argv, "--input");
  const outputPath = argValue(argv, "--output");
  const activeRepoRoot = argValue(argv, "--active-repo-root");
  const approvedLocalMirrorRoot = argValue(argv, "--approved-local-mirror-root");

  if (!inputPath) throw new Error("input_required");
  if (!outputPath) throw new Error("output_required");
  if (!activeRepoRoot) throw new Error("active_repo_root_required");
  if (!approvedLocalMirrorRoot) throw new Error("approved_local_mirror_root_required");

  return {
    inputPath,
    outputPath,
    activeRepoRoot,
    approvedLocalMirrorRoot,
    apply: argv.includes("--apply"),
  };
}

async function readJsonlRows(input: ProduceD8SnapshotDiagnosticsInput): Promise<LoadedRows> {
  let text = input.inputText;
  if (text == null) {
    try {
      text = await readFile(input.inputPath, "utf8");
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
        return { rows: [], warnings: [], missing: true };
      }
      throw error;
    }
  }

  const rows: unknown[] = [];
  const warnings: string[] = [];
  text.split(/\r?\n/).forEach((line, index) => {
    if (!line.trim()) return;
    try {
      rows.push(JSON.parse(line));
    } catch {
      warnings.push(`invalid_jsonl:${index + 1}`);
      rows.push(null);
    }
  });
  return { rows, warnings, missing: false };
}

function extractExistingSnapshot(row: unknown): unknown | null {
  const root = obj(row);
  if ("d8PointInTimeSnapshot" in root) return root.d8PointInTimeSnapshot;
  const diagnostics = obj(root.diagnostics);
  if ("d8PointInTimeSnapshot" in diagnostics) return diagnostics.d8PointInTimeSnapshot;
  return null;
}

function hasDiagnostics(row: unknown): boolean {
  const root = obj(row);
  const diagnostics = obj(root.diagnostics);
  const source = Object.keys(diagnostics).length > 0 ? diagnostics : root;
  return [
    "evaluatedAt",
    "timestamp",
    "checkedAt",
    "sourceTimeframe",
    "alignedContext",
    "d8_0AlignedCandidate",
    "rrReady",
    "triggerReached",
    "zoneTouched",
    "confirmationWindowActive",
    "confirmationAligned",
    "promotableReviewCandidate",
    "bottleneckStatus",
    "triggerDistanceClass",
    "sourceSafetyValid",
    "dataQualityValid",
    "entryCandidateResolution",
    "pullbackTriggerThresholds",
    "pullbackZoneTouchEvidence",
    "touchAwareConfirmationReview",
    "noReviewCandidateBottleneckResolver",
  ].some((key) => key in source || key in root);
}

function captureInputFromRow(row: unknown): D8PointInTimeSnapshotCaptureInput {
  const root = obj(row);
  const diagnostics = obj(root.diagnostics);
  const source = Object.keys(diagnostics).length > 0 ? diagnostics : root;

  return {
    evaluatedAt: firstString(
      root.evaluatedAt,
      root.timestamp,
      root.checkedAt,
      source.evaluatedAt,
      source.timestamp,
      source.checkedAt,
    ) ?? undefined,
    sourceTimeframe: root.sourceTimeframe ?? source.sourceTimeframe,
    alignedContext: root.alignedContext ?? source.alignedContext,
    d8_0AlignedCandidate: root.d8_0AlignedCandidate ?? source.d8_0AlignedCandidate,
    rrReady: root.rrReady ?? source.rrReady,
    triggerReached: root.triggerReached ?? source.triggerReached,
    zoneTouched: root.zoneTouched ?? source.zoneTouched,
    confirmationWindowActive: root.confirmationWindowActive ?? source.confirmationWindowActive,
    confirmationAligned: root.confirmationAligned ?? source.confirmationAligned,
    promotableReviewCandidate: root.promotableReviewCandidate ?? source.promotableReviewCandidate,
    bottleneckStatus: root.bottleneckStatus ?? source.bottleneckStatus,
    triggerDistanceClass: root.triggerDistanceClass ?? source.triggerDistanceClass,
    sourceSafetyValid: root.sourceSafetyValid ?? source.sourceSafetyValid,
    dataQualityValid: root.dataQualityValid ?? source.dataQualityValid,
    entryCandidateResolution: source.entryCandidateResolution,
    pullbackTriggerThresholds: source.pullbackTriggerThresholds,
    pullbackZoneTouchEvidence: source.pullbackZoneTouchEvidence,
    touchAwareConfirmationReview: source.touchAwareConfirmationReview,
    noReviewCandidateBottleneckResolver: source.noReviewCandidateBottleneckResolver,
  };
}

function rowReference(row: unknown): string | null {
  const root = obj(row);
  const diagnostics = obj(root.diagnostics);
  return firstString(root.rowReference, root.id, root.sequence, diagnostics.rowReference, diagnostics.id, diagnostics.sequence);
}

function emptyReport(input: ProduceD8SnapshotDiagnosticsInput, outputPath: string, blockers: string[]): ProduceD8SnapshotDiagnosticsReport {
  return {
    mode: input.apply ? "APPLY" : "DRY_RUN",
    inputRows: 0,
    diagnosticsRowsAccepted: 0,
    snapshotsProduced: 0,
    invalidRows: 0,
    skippedRows: 0,
    duplicateEvaluatedAt: 0,
    outputPath,
    wroteFiles: [],
    warnings: [],
    blockers,
  };
}

function snapshotFromRow(row: unknown): { snapshot: D8PointInTimeSnapshot | null; errors: string[]; skipped: boolean } {
  const existing = extractExistingSnapshot(row);
  if (existing !== null) {
    const validation = validateD8PointInTimeSnapshot(existing);
    return {
      snapshot: validation.snapshot,
      errors: validation.valid && validation.snapshot !== null ? [] : validation.errors,
      skipped: false,
    };
  }

  if (!hasDiagnostics(row)) return { snapshot: null, errors: [], skipped: true };

  try {
    const captured = captureD8PointInTimeSnapshot(captureInputFromRow(row));
    const validation = validateD8PointInTimeSnapshot(captured);
    return {
      snapshot: validation.snapshot,
      errors: validation.valid && validation.snapshot !== null ? [] : validation.errors,
      skipped: false,
    };
  } catch (error) {
    return { snapshot: null, errors: [error instanceof Error ? error.message : String(error)], skipped: false };
  }
}

export async function produceD8SnapshotDiagnosticsLocalOnly(
  input: ProduceD8SnapshotDiagnosticsInput,
): Promise<ProduceD8SnapshotDiagnosticsReport> {
  let outputPath = resolve(input.outputPath);
  const blockers: string[] = [];
  try {
    outputPath = validateD8SnapshotDiagnosticsOutputPath(input);
  } catch (error) {
    blockers.push(error instanceof Error ? error.message : String(error));
  }

  const loaded = await readJsonlRows(input);
  const report = emptyReport(input, outputPath, blockers);
  report.warnings.push(...loaded.warnings);
  report.invalidRows = loaded.warnings.length;
  if (loaded.missing) report.blockers.push("input_file_missing");
  if (report.blockers.length > 0) return report;

  report.inputRows = loaded.rows.length;
  const seen = new Set<string>();
  const producedAt = new Date().toISOString();
  const outputRows: ProducedD8SnapshotDiagnosticsRow[] = [];

  for (const [index, row] of loaded.rows.entries()) {
    if (row === null) continue;
    const result = snapshotFromRow(row);
    if (result.skipped) {
      report.skippedRows += 1;
      continue;
    }
    if (result.snapshot === null) {
      report.invalidRows += 1;
      report.warnings.push(`invalid_row:${index + 1}:${result.errors.join(",")}`);
      continue;
    }
    if (seen.has(result.snapshot.evaluatedAt)) {
      report.duplicateEvaluatedAt += 1;
      report.warnings.push(`duplicate_evaluatedAt:${result.snapshot.evaluatedAt}`);
      continue;
    }

    seen.add(result.snapshot.evaluatedAt);
    outputRows.push({
      producedAt,
      source: {
        kind: "D8_SNAPSHOT_DIAGNOSTICS_LOCAL_ONLY",
        inputPath: input.inputPath,
        inputRowNumber: index + 1,
        rowReference: rowReference(row),
      },
      d8PointInTimeSnapshot: result.snapshot,
    });
    report.diagnosticsRowsAccepted += 1;
    report.snapshotsProduced += 1;
  }

  if (!input.apply || outputRows.length === 0) return report;

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${outputRows.map((row) => JSON.stringify(row)).join("\n")}\n`, "utf8");
  report.wroteFiles.push(outputPath);
  return report;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  produceD8SnapshotDiagnosticsLocalOnly(parseProduceD8SnapshotDiagnosticsArgs(process.argv.slice(2))).then((report) => {
    console.log(JSON.stringify(report, null, 2));
    if (report.blockers.length > 0) process.exitCode = 1;
  }).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
