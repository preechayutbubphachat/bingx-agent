import { appendFile, mkdir, readFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import {
  validateD8PointInTimeSnapshot,
  type D8PointInTimeSnapshot,
} from "../../../tools/local-replay/d8-point-in-time-snapshot.ts";

export const D8_SNAPSHOT_JOURNAL_FILENAME = "d8_snapshots.jsonl";

export interface D8SnapshotOutputRootInput {
  activeRepoRoot: string;
  approvedLocalMirrorRoot: string;
  outputRoot: string;
}

export interface D8SnapshotJournalPathInput extends D8SnapshotOutputRootInput {
  fileName?: string;
}

export interface AppendD8PointInTimeSnapshotInput extends D8SnapshotJournalPathInput {
  row: unknown;
}

export interface AppendD8PointInTimeSnapshotResult {
  filePath: string;
  wrote: true;
}

function normalizePath(value: string): string {
  return resolve(value).replaceAll("\\", "/").replace(/\/+$/, "").toLowerCase();
}

function pathSegments(value: string): string[] {
  return normalizePath(value).split("/").filter(Boolean);
}

function isInside(parent: string, child: string): boolean {
  const rel = relative(resolve(parent), resolve(child));
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

function isForbiddenPath(value: string): boolean {
  const normalized = normalizePath(value);
  const segments = pathSegments(value);
  return normalized.startsWith("server:")
    || normalized.includes("/var/www/vhosts")
    || normalized.includes("ob-gate.com/httpdocs")
    || segments.includes("source")
    || segments.includes("staging")
    || segments.includes("server")
    || segments.includes("research-packs")
    || segments.includes("research-runs");
}

export function validateD8SnapshotOutputRoot(input: D8SnapshotOutputRootInput): string {
  if (!input.activeRepoRoot.trim()) throw new Error("active_repo_root_required");
  if (!input.approvedLocalMirrorRoot.trim()) throw new Error("approved_local_mirror_root_required");
  if (!input.outputRoot.trim()) throw new Error("output_root_required");

  const activeRepoRoot = resolve(input.activeRepoRoot);
  const approvedLocalMirrorRoot = resolve(input.approvedLocalMirrorRoot);
  const outputRoot = resolve(input.outputRoot);
  const approvedD8SnapshotRoot = resolve(
    join(approvedLocalMirrorRoot, "dashboard", "tmp", "d8-snapshots"),
  );

  if (isInside(activeRepoRoot, outputRoot)) throw new Error("output_root_inside_active_repo");
  if (isForbiddenPath(outputRoot)) throw new Error("output_root_forbidden_path");
  if (normalizePath(outputRoot) !== normalizePath(approvedD8SnapshotRoot)) {
    throw new Error("output_root_not_approved_d8_snapshot_path");
  }
  return outputRoot;
}

export function validateD8SnapshotJournalPath(input: D8SnapshotJournalPathInput): string {
  const outputRoot = validateD8SnapshotOutputRoot(input);
  const fileName = input.fileName ?? D8_SNAPSHOT_JOURNAL_FILENAME;
  if (!fileName.endsWith(".jsonl")) throw new Error("journal_filename_must_be_jsonl");

  const filePath = resolve(join(outputRoot, fileName));
  if (!isInside(outputRoot, filePath)) throw new Error("journal_path_escaped_output_root");
  if (relative(outputRoot, filePath).includes(sep)) throw new Error("journal_path_escaped_output_root");
  return filePath;
}

async function existingEvaluatedAt(filePath: string): Promise<Set<string>> {
  try {
    const text = await readFile(filePath, "utf8");
    const seen = new Set<string>();
    for (const line of text.split(/\r?\n/)) {
      if (!line.trim()) continue;
      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch {
        throw new Error("existing_journal_malformed_jsonl");
      }
      if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("existing_journal_malformed_jsonl");
      }
      const evaluatedAt = (parsed as { evaluatedAt?: unknown }).evaluatedAt;
      if (typeof evaluatedAt !== "string" || !evaluatedAt.trim()) {
        throw new Error("existing_journal_missing_evaluatedAt");
      }
      seen.add(evaluatedAt);
    }
    return seen;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return new Set<string>();
    }
    throw error;
  }
}

export async function appendD8PointInTimeSnapshot(
  input: AppendD8PointInTimeSnapshotInput,
): Promise<AppendD8PointInTimeSnapshotResult> {
  const filePath = validateD8SnapshotJournalPath(input);
  const validation = validateD8PointInTimeSnapshot(input.row);
  if (!validation.valid || validation.snapshot == null) {
    throw new Error(validation.errors.join(","));
  }

  const seen = await existingEvaluatedAt(filePath);
  if (seen.has(validation.snapshot.evaluatedAt)) throw new Error("duplicate_evaluatedAt");

  await mkdir(resolve(input.outputRoot), { recursive: true });
  const snapshot: D8PointInTimeSnapshot = validation.snapshot;
  await appendFile(filePath, `${JSON.stringify(snapshot)}\n`, "utf8");
  return { filePath, wrote: true };
}
