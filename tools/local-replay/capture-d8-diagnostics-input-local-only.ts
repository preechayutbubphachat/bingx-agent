import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  validateD8SnapshotDiagnosticsInputRowShape,
  type D8SnapshotDiagnosticsInputRow,
} from "../../dashboard/lib/paper/d8SnapshotDiagnosticsInputExporter.ts";

export interface CaptureD8DiagnosticsInput {
  inputPath: string;
  outputPath: string;
  activeRepoRoot: string;
  approvedLocalMirrorRoot: string;
  apply?: boolean;
  inputText?: string;
}

export interface D8DiagnosticsInputCaptureOutputPathInput {
  outputPath: string;
  activeRepoRoot: string;
  approvedLocalMirrorRoot: string;
}

export interface CaptureD8DiagnosticsInputReport {
  mode: "DRY_RUN" | "APPLY";
  inputRows: number;
  candidateRows: number;
  validRows: number;
  writtenRows: number;
  invalidRows: number;
  skippedRows: number;
  duplicateEvaluatedAt: number;
  missingEvaluatedAt: number;
  invalidEvaluatedAt: number;
  missingSourceTimeframe: number;
  outputPath: string;
  wroteFiles: string[];
  warnings: string[];
  blockers: string[];
  rows: D8SnapshotDiagnosticsInputRow[];
}

interface LoadedRows {
  rows: unknown[];
  warnings: string[];
  missing: boolean;
}

function obj(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
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

export function validateD8DiagnosticsInputCaptureOutputPath(
  input: D8DiagnosticsInputCaptureOutputPathInput,
): string {
  if (!input.outputPath.trim()) throw new Error("output_path_required");
  if (!input.activeRepoRoot.trim()) throw new Error("active_repo_root_required");
  if (!input.approvedLocalMirrorRoot.trim()) throw new Error("approved_local_mirror_root_required");

  const outputPath = resolve(input.outputPath);
  const activeRepoRoot = resolve(input.activeRepoRoot);
  const approvedRoot = resolve(input.approvedLocalMirrorRoot, "dashboard", "tmp", "d8-diagnostics-input");
  const finalSnapshotRoot = resolve(input.approvedLocalMirrorRoot, "dashboard", "tmp", "d8-snapshots");
  const producerRoot = resolve(input.approvedLocalMirrorRoot, "dashboard", "tmp", "d8-snapshot-diagnostics");

  if (isInside(activeRepoRoot, outputPath)) throw new Error("output_path_inside_active_repo");
  if (isInside(finalSnapshotRoot, outputPath)) throw new Error("output_path_final_snapshot_path_forbidden");
  if (isInside(producerRoot, outputPath)) throw new Error("output_path_producer_diagnostics_path_forbidden");
  if (hasBlockedPathSegment(outputPath)) throw new Error("output_path_forbidden_path");
  if (!isInside(approvedRoot, outputPath)) throw new Error("output_path_not_approved_d8_diagnostics_input_path");
  if (!outputPath.endsWith(".jsonl")) throw new Error("output_path_must_be_jsonl");
  return outputPath;
}

function argValue(argv: readonly string[], name: string): string {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] ?? "" : "";
}

export function parseCaptureD8DiagnosticsInputArgs(argv: readonly string[]): CaptureD8DiagnosticsInput {
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

async function readJsonlRows(input: CaptureD8DiagnosticsInput): Promise<LoadedRows> {
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

function emptyReport(input: CaptureD8DiagnosticsInput, outputPath: string, blockers: string[]): CaptureD8DiagnosticsInputReport {
  return {
    mode: input.apply ? "APPLY" : "DRY_RUN",
    inputRows: 0,
    candidateRows: 0,
    validRows: 0,
    writtenRows: 0,
    invalidRows: 0,
    skippedRows: 0,
    duplicateEvaluatedAt: 0,
    missingEvaluatedAt: 0,
    invalidEvaluatedAt: 0,
    missingSourceTimeframe: 0,
    outputPath,
    wroteFiles: [],
    warnings: [],
    blockers,
    rows: [],
  };
}

function candidateFromRow(row: unknown): unknown | null {
  const root = obj(row);
  if ("d8SnapshotDiagnosticsInput" in root) return root.d8SnapshotDiagnosticsInput;
  const diagnostics = obj(root.diagnostics);
  if ("d8SnapshotDiagnosticsInput" in diagnostics) return diagnostics.d8SnapshotDiagnosticsInput;
  return null;
}

function classifyInvalid(candidate: unknown, errors: readonly string[], report: CaptureD8DiagnosticsInputReport): void {
  const row = obj(candidate);
  if (!("evaluatedAt" in row) || row.evaluatedAt == null || row.evaluatedAt === "") report.missingEvaluatedAt += 1;
  else if (typeof row.evaluatedAt !== "string" || !Number.isFinite(Date.parse(row.evaluatedAt))) report.invalidEvaluatedAt += 1;
  if (!("sourceTimeframe" in row) || row.sourceTimeframe == null || row.sourceTimeframe === "") {
    report.missingSourceTimeframe += 1;
  }
  report.warnings.push(`invalid_row:${errors.join(",")}`);
}

export async function captureD8DiagnosticsInputLocalOnly(
  input: CaptureD8DiagnosticsInput,
): Promise<CaptureD8DiagnosticsInputReport> {
  let outputPath = resolve(input.outputPath);
  const blockers: string[] = [];
  try {
    outputPath = validateD8DiagnosticsInputCaptureOutputPath(input);
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

  for (const row of loaded.rows) {
    if (row === null) continue;
    const candidate = candidateFromRow(row);
    if (candidate === null) {
      report.skippedRows += 1;
      continue;
    }

    report.candidateRows += 1;
    const validation = validateD8SnapshotDiagnosticsInputRowShape(candidate);
    if (!validation.valid) {
      report.invalidRows += 1;
      classifyInvalid(candidate, validation.errors, report);
      continue;
    }

    const parsed = candidate as D8SnapshotDiagnosticsInputRow;
    if (seen.has(parsed.evaluatedAt)) {
      report.duplicateEvaluatedAt += 1;
      report.invalidRows += 1;
      report.warnings.push(`duplicate_evaluatedAt:${parsed.evaluatedAt}`);
      continue;
    }

    seen.add(parsed.evaluatedAt);
    report.rows.push(parsed);
    report.validRows += 1;
  }

  if (!input.apply || report.rows.length === 0) return report;

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${report.rows.map((row) => JSON.stringify(row)).join("\n")}\n`, "utf8");
  report.wroteFiles.push(outputPath);
  report.writtenRows = report.rows.length;
  return report;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  captureD8DiagnosticsInputLocalOnly(parseCaptureD8DiagnosticsInputArgs(process.argv.slice(2))).then((report) => {
    console.log(JSON.stringify(report, null, 2));
    if (report.blockers.length > 0) process.exitCode = 1;
  }).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
