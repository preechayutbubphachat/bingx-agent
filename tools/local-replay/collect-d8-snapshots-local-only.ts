import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  validateD8PointInTimeSnapshot,
  type D8PointInTimeSnapshot,
} from "./d8-point-in-time-snapshot.ts";
import {
  appendD8PointInTimeSnapshot,
  D8_SNAPSHOT_JOURNAL_FILENAME,
  validateD8SnapshotJournalPath,
} from "../../dashboard/lib/paper/d8PointInTimeSnapshotJournalWriter.ts";

export interface CollectD8SnapshotsInput {
  inputPath: string;
  outputRoot: string;
  activeRepoRoot: string;
  approvedLocalMirrorRoot: string;
  apply?: boolean;
}

export interface CollectD8SnapshotsReport {
  mode: "DRY_RUN" | "APPLY";
  inputRows: number;
  snapshotsFound: number;
  validSnapshots: number;
  writtenSnapshots: number;
  invalidSnapshots: number;
  duplicateSnapshots: number;
  skippedRows: number;
  outputPath: string;
  wroteFiles: string[];
  warnings: string[];
  blockers: string[];
}

function obj(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function argValue(argv: readonly string[], name: string): string {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] ?? "" : "";
}

export function parseCollectD8SnapshotArgs(argv: readonly string[]): CollectD8SnapshotsInput {
  const inputPath = argValue(argv, "--input");
  const outputRoot = argValue(argv, "--output-root");
  const activeRepoRoot = argValue(argv, "--active-repo-root");
  const approvedLocalMirrorRoot = argValue(argv, "--approved-local-mirror-root");

  if (!inputPath) throw new Error("input_required");
  if (!outputRoot) throw new Error("output_root_required");
  if (!activeRepoRoot) throw new Error("active_repo_root_required");
  if (!approvedLocalMirrorRoot) throw new Error("approved_local_mirror_root_required");

  return {
    inputPath,
    outputRoot,
    activeRepoRoot,
    approvedLocalMirrorRoot,
    apply: argv.includes("--apply"),
  };
}

function extractSnapshot(row: unknown): unknown | null {
  const root = obj(row);
  if ("d8PointInTimeSnapshot" in root) return root.d8PointInTimeSnapshot;
  const diagnostics = obj(root.diagnostics);
  if ("d8PointInTimeSnapshot" in diagnostics) return diagnostics.d8PointInTimeSnapshot;
  return null;
}

async function readJsonlRows(path: string): Promise<{ rows: unknown[]; warnings: string[]; missing: boolean }> {
  let text = "";
  try {
    text = await readFile(path, "utf8");
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return { rows: [], warnings: [], missing: true };
    }
    throw error;
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

function emptyReport(input: CollectD8SnapshotsInput, outputPath: string, blockers: string[], warnings: string[] = []): CollectD8SnapshotsReport {
  return {
    mode: input.apply ? "APPLY" : "DRY_RUN",
    inputRows: 0,
    snapshotsFound: 0,
    validSnapshots: 0,
    writtenSnapshots: 0,
    invalidSnapshots: 0,
    duplicateSnapshots: 0,
    skippedRows: 0,
    outputPath,
    wroteFiles: [],
    warnings,
    blockers,
  };
}

export async function collectD8SnapshotsLocalOnly(input: CollectD8SnapshotsInput): Promise<CollectD8SnapshotsReport> {
  const mode = input.apply ? "APPLY" : "DRY_RUN";
  let outputPath = resolve(join(input.outputRoot, D8_SNAPSHOT_JOURNAL_FILENAME));
  const blockers: string[] = [];
  try {
    outputPath = validateD8SnapshotJournalPath(input);
  } catch (error) {
    blockers.push(error instanceof Error ? error.message : String(error));
  }

  const loaded = await readJsonlRows(input.inputPath);
  const report = emptyReport(input, outputPath, blockers, loaded.warnings);
  if (loaded.missing) report.blockers.push("input_file_missing");
  if (report.blockers.length > 0) return report;

  report.inputRows = loaded.rows.length;
  const seen = new Set<string>();
  const candidates: D8PointInTimeSnapshot[] = [];

  for (const [index, row] of loaded.rows.entries()) {
    const snapshot = extractSnapshot(row);
    if (snapshot == null) {
      report.skippedRows += 1;
      continue;
    }

    report.snapshotsFound += 1;
    const validation = validateD8PointInTimeSnapshot(snapshot);
    if (!validation.valid || validation.snapshot == null) {
      report.invalidSnapshots += 1;
      report.warnings.push(`invalid_snapshot:${index + 1}:${validation.errors.join(",")}`);
      continue;
    }

    if (seen.has(validation.snapshot.evaluatedAt)) {
      report.duplicateSnapshots += 1;
      report.warnings.push(`duplicate_evaluatedAt:${validation.snapshot.evaluatedAt}`);
      continue;
    }

    seen.add(validation.snapshot.evaluatedAt);
    candidates.push(validation.snapshot);
    report.validSnapshots += 1;
  }

  if (mode === "DRY_RUN") return report;

  for (const snapshot of candidates) {
    try {
      const result = await appendD8PointInTimeSnapshot({ ...input, row: snapshot });
      report.writtenSnapshots += 1;
      if (!report.wroteFiles.includes(result.filePath)) report.wroteFiles.push(result.filePath);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("duplicate_evaluatedAt")) {
        report.duplicateSnapshots += 1;
        report.validSnapshots -= 1;
        report.warnings.push(message);
        continue;
      }
      report.blockers.push(message);
      break;
    }
  }

  return report;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  collectD8SnapshotsLocalOnly(parseCollectD8SnapshotArgs(process.argv.slice(2))).then((report) => {
    console.log(JSON.stringify(report, null, 2));
    if (report.blockers.length > 0) process.exitCode = 1;
  }).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
