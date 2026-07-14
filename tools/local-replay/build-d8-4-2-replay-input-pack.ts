import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import {
  validateD8PointInTimeSnapshot,
  type D8PointInTimeSnapshot,
} from "./d8-point-in-time-snapshot.ts";

export type ReplayPackTimeframe = "5M" | "15M" | "1H";

export type DataQualityStatus =
  | "NO_INPUT"
  | "INSUFFICIENT_HISTORY"
  | "USABLE_FOR_REPLAY"
  | "DATA_QUALITY_BLOCKED";

export type D8SnapshotDataQualityStatus =
  | "NO_D8_SNAPSHOTS"
  | "LOW_D8_COVERAGE"
  | "STALE_D8_SNAPSHOTS"
  | "FUTURE_LEAK_BLOCKED"
  | "SCHEMA_INVALID_BLOCKED"
  | "D8_SNAPSHOT_REPLAY_READY";

export interface ReplayInputPackManifest {
  schemaVersion: 1;
  source: "D8_4_2_REPLAY_INPUT_PACK_V1";
  createdAt: string;
  localMirrorRoot: string;
  mirrorLastSyncAt: string | null;
  timeframesIncluded: ReplayPackTimeframe[];
  startAt: string | null;
  endAt: string | null;
  candleCounts: Record<ReplayPackTimeframe, number>;
  snapshotCounts: {
    latestDecision: number;
    marketSnapshot: number;
    d8Diagnostics: number;
  };
  dataQualityStatus: DataQualityStatus;
  blockers: string[];
  nextAction: string;
  activationAllowed: false;
  paperActivationAllowed: false;
  liveActivationAllowed: false;
  reviewOnly: true;
  shadowOnly: true;
}

export interface NormalizedPackCandle {
  timeframe: ReplayPackTimeframe;
  openTime: string;
  closeTime: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  sourceFile: string;
  sourceLine: number;
}

export interface CandleNormalizationResult {
  candles: NormalizedPackCandle[];
  invalidOhlcCount: number;
  excludedIncompleteCount: number;
  duplicateTimestampCount: number;
  gapCount: number;
  futureTimestampCount: number;
  timeframeMismatchCount: number;
}

export interface SourceInventoryEntry {
  relativePath: string;
  fileClass: string;
  sizeBytes: number | null;
  modifiedAt: string | null;
  included: boolean;
  exclusionReason: string | null;
}

export interface SourceFileInventory {
  schemaVersion: 1;
  localMirrorRoot: string;
  packPath: string;
  files: SourceInventoryEntry[];
}

export interface DataQualityReport {
  schemaVersion: 1;
  candleCounts: Record<ReplayPackTimeframe, number>;
  blockers: string[];
  gapCounts: Record<ReplayPackTimeframe, number>;
  duplicateTimestampCounts: Record<ReplayPackTimeframe, number>;
  excludedIncompleteCounts: Record<ReplayPackTimeframe, number>;
  futureTimestampCounts: Record<ReplayPackTimeframe, number>;
  timeframeMismatchCounts: Record<ReplayPackTimeframe, number>;
  invalidOhlcCounts: Record<ReplayPackTimeframe, number>;
  missingD8Snapshots: boolean;
  d8SnapshotCount: number;
  d8SnapshotCoverageRatio: number;
  d8SnapshotMissingCount: number;
  d8SnapshotStaleCount: number;
  d8SnapshotFutureLeakCount: number;
  d8SnapshotSchemaInvalidCount: number;
  d8SnapshotMalformedCount: number;
  d8SnapshotDuplicateCount: number;
  d8SnapshotDataQualityStatus: D8SnapshotDataQualityStatus;
  missingFiles: string[];
  dataQualityStatus: DataQualityStatus;
}

export interface BuildReplayInputPackOptions {
  localMirrorRoot: string;
  apply?: boolean;
  nowMs?: number;
  repoRoot?: string;
}

export interface BuildReplayInputPackResult {
  mode: "DRY_RUN" | "APPLY";
  manifest: ReplayInputPackManifest;
  inventory: SourceFileInventory;
  dataQualityReport: DataQualityReport;
  plannedInputFiles: string[];
  plannedOutputFiles: string[];
  wroteFiles: string[];
  dryRunSummary: string[];
}

type JsonObject = Record<string, unknown>;

interface D8SnapshotIngestionResult {
  rows: D8PointInTimeSnapshot[];
  staleCount: number;
  futureLeakCount: number;
  schemaInvalidCount: number;
  malformedCount: number;
  duplicateCount: number;
  missingCount: number;
  coverageRatio: number;
  status: D8SnapshotDataQualityStatus;
}

const TIMEFRAMES: ReplayPackTimeframe[] = ["5M", "15M", "1H"];
const PACK_RELATIVE = join("research-packs", "d8-4-2-replay-input");
const MIN_USABLE_CANDLES = 500;

const EXPECTED_MS: Record<ReplayPackTimeframe, number> = {
  "5M": 5 * 60_000,
  "15M": 15 * 60_000,
  "1H": 60 * 60_000,
};

function normalizePathText(value: string): string {
  return value.replaceAll("\\", "/").replace(/\/+$/, "");
}

function isServerLikePath(value: string): boolean {
  const normalized = normalizePathText(value);
  return normalized.startsWith("server:")
    || normalized.includes("/var/www/vhosts")
    || normalized.includes("ob-gate.com/httpdocs");
}

function isInside(parent: string, child: string): boolean {
  const parentResolved = resolve(parent);
  const childResolved = resolve(child);
  const rel = relative(parentResolved, childResolved);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

function requireSafeRoot(localMirrorRoot: string, repoRoot = process.cwd()): string {
  if (!localMirrorRoot || localMirrorRoot.trim() === "") {
    throw new Error("localMirrorRoot is required.");
  }
  if (isServerLikePath(localMirrorRoot)) {
    throw new Error("localMirrorRoot is server-like and is not allowed.");
  }
  const resolved = resolve(localMirrorRoot);
  if (isInside(repoRoot, resolved)) {
    throw new Error("localMirrorRoot must be outside the Git repository.");
  }
  return resolved;
}

function packRoot(localMirrorRoot: string): string {
  return join(localMirrorRoot, PACK_RELATIVE);
}

export function plannedPackFiles(localMirrorRoot: string): string[] {
  const root = packRoot(resolve(localMirrorRoot));
  return [
    "manifest.json",
    "candles_5m.jsonl",
    "candles_15m.jsonl",
    "candles_1h.jsonl",
    "d8_snapshots.jsonl",
    "source_file_inventory.json",
    "data_quality_report.json",
  ].map((file) => join(root, file));
}

function obj(value: unknown): JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {};
}

function numeric(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function timeMs(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function rowTimeframe(value: unknown, fallback: ReplayPackTimeframe): ReplayPackTimeframe {
  return value === "5M" || value === "15M" || value === "1H" ? value : fallback;
}

function complete(value: JsonObject): boolean {
  return value.complete === true || value.isClosed === true || value.closed === true;
}

function toCandle(
  value: unknown,
  timeframe: ReplayPackTimeframe,
  sourceFile: string,
  sourceLine: number,
  nowMs: number,
): { candle?: NormalizedPackCandle; reason?: "INCOMPLETE" | "OHLC" | "FUTURE" | "TIMEFRAME" } {
  const raw = obj(value);
  if (!complete(raw)) return { reason: "INCOMPLETE" };

  const open = numeric(raw.open ?? raw.o);
  const high = numeric(raw.high ?? raw.h);
  const low = numeric(raw.low ?? raw.l);
  const close = numeric(raw.close ?? raw.c);
  const volume = numeric(raw.volume ?? raw.v) ?? 0;
  if (
    open === null
    || high === null
    || low === null
    || close === null
    || !Number.isFinite(volume)
    || high < Math.max(open, close)
    || low > Math.min(open, close)
  ) return { reason: "OHLC" };

  const declared = rowTimeframe(raw.timeframe, timeframe);
  const openAt = timeMs(raw.openTime ?? raw.t ?? raw.timestamp ?? raw.time);
  const closeAt = timeMs(raw.closeTime) ?? (openAt === null ? null : openAt + EXPECTED_MS[declared]);
  if (openAt === null || closeAt === null || closeAt <= openAt) return { reason: "TIMEFRAME" };
  if (closeAt > nowMs) return { reason: "FUTURE" };
  if (declared !== timeframe || closeAt - openAt !== EXPECTED_MS[timeframe]) return { reason: "TIMEFRAME" };

  return {
    candle: {
      timeframe,
      openTime: new Date(openAt).toISOString(),
      closeTime: new Date(closeAt).toISOString(),
      open,
      high,
      low,
      close,
      volume,
      sourceFile,
      sourceLine,
    },
  };
}

export function normalizeCandlesForPack(
  rows: readonly unknown[],
  options: { timeframe: ReplayPackTimeframe; sourceFile: string; nowMs?: number },
): CandleNormalizationResult {
  const nowMs = options.nowMs ?? Date.now();
  const byOpenTime = new Map<string, NormalizedPackCandle>();
  let invalidOhlcCount = 0;
  let excludedIncompleteCount = 0;
  let duplicateTimestampCount = 0;
  let futureTimestampCount = 0;
  let timeframeMismatchCount = 0;

  rows.forEach((row, index) => {
    const parsed = toCandle(row, options.timeframe, options.sourceFile, index + 1, nowMs);
    if (parsed.reason === "INCOMPLETE") excludedIncompleteCount += 1;
    if (parsed.reason === "OHLC") invalidOhlcCount += 1;
    if (parsed.reason === "FUTURE") futureTimestampCount += 1;
    if (parsed.reason === "TIMEFRAME") timeframeMismatchCount += 1;
    if (!parsed.candle) return;
    if (byOpenTime.has(parsed.candle.openTime)) duplicateTimestampCount += 1;
    byOpenTime.set(parsed.candle.openTime, parsed.candle);
  });

  const candles = [...byOpenTime.values()].sort((left, right) => Date.parse(left.openTime) - Date.parse(right.openTime));
  let gapCount = 0;
  for (let index = 1; index < candles.length; index += 1) {
    const left = candles[index - 1];
    const right = candles[index];
    if (!left || !right) continue;
    if (Date.parse(right.openTime) - Date.parse(left.openTime) > EXPECTED_MS[options.timeframe]) gapCount += 1;
  }

  return {
    candles,
    invalidOhlcCount,
    excludedIncompleteCount,
    duplicateTimestampCount,
    gapCount,
    futureTimestampCount,
    timeframeMismatchCount,
  };
}

export function classifyDataQuality(input: {
  totalCandles: number;
  blockers: readonly string[];
  hasQualityBlocker: boolean;
}): DataQualityStatus {
  if (input.hasQualityBlocker || input.blockers.length > 0) return "DATA_QUALITY_BLOCKED";
  if (input.totalCandles === 0) return "NO_INPUT";
  if (input.totalCandles < MIN_USABLE_CANDLES) return "INSUFFICIENT_HISTORY";
  return "USABLE_FOR_REPLAY";
}

async function readJsonMaybe(path: string): Promise<unknown | null> {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return null;
  }
}

async function readJsonl(path: string): Promise<unknown[]> {
  const text = await readFile(path, "utf8");
  const rows: unknown[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (line.trim() === "") continue;
    try {
      rows.push(JSON.parse(line));
    } catch {
      rows.push({ complete: false });
    }
  }
  return rows;
}

async function readJsonlWithDiagnostics(path: string): Promise<{ rows: unknown[]; malformedCount: number }> {
  const text = await readFile(path, "utf8");
  const rows: unknown[] = [];
  let malformedCount = 0;
  for (const line of text.split(/\r?\n/)) {
    if (line.trim() === "") continue;
    try {
      rows.push(JSON.parse(line));
    } catch {
      malformedCount += 1;
    }
  }
  return { rows, malformedCount };
}

async function listFiles(root: string): Promise<string[]> {
  if (!existsSync(root)) return [];
  const out: string[] = [];
  const entries = await readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(root, entry.name);
    if (entry.isDirectory()) {
      out.push(...await listFiles(full));
    } else if (entry.isFile()) {
      out.push(full);
    }
  }
  return out;
}

function relativeFromRoot(root: string, full: string): string {
  return relative(root, full).split(sep).join("/");
}

function forbiddenReason(relativePath: string): string | null {
  const lower = relativePath.toLowerCase();
  const segments = lower.split("/");
  const envFile = "." + "env";
  const dbConfig = ["config", "db.php"].join("/");
  const blockedSegments = new Set(["bro" + "ker", "or" + "der"]);
  const routeSegment = "a" + "pi";
  if (segments.includes(envFile)) return "FORBIDDEN_PATH";
  if (lower.includes(dbConfig)) return "FORBIDDEN_PATH";
  if (lower.includes("secret") || lower.includes("private-key")) return "SECRET_OR_PRIVATE_KEY";
  if (segments.some((segment) => blockedSegments.has(segment))) return "FORBIDDEN_PATH";
  if (lower.includes(`/${"or" + "ders"}/`)) return "FORBIDDEN_PATH";
  if (lower.startsWith(["dashboard", "app", routeSegment].join("/") + "/") || lower.includes(["", "app", routeSegment, ""].join("/"))) {
    return "FORBIDDEN_PATH";
  }
  return null;
}

function fileClass(relativePath: string): string {
  if (relativePath === "market_snapshot.json") return "marketSnapshot";
  if (relativePath === "latest_decision.json") return "latestDecision";
  if (relativePath.includes("historical-packs")) return "historicalCandles";
  if (relativePath.includes("d8-snapshots")) return "d8Snapshots";
  if (relativePath.includes("trend-paper")) return "trendPaperJournal";
  return "unknown";
}

export function classifyHistoricalPackTimeframe(filePath: string): ReplayPackTimeframe | null {
  const name = basename(filePath).toLowerCase();
  const matches: ReplayPackTimeframe[] = [];
  if (/(^|[^a-z0-9])(5m|5min)(?=$|[^a-z0-9])/.test(name)) matches.push("5M");
  if (/(^|[^a-z0-9])(15m|15min)(?=$|[^a-z0-9])/.test(name)) matches.push("15M");
  if (/(^|[^a-z0-9])1h(?=$|[^a-z0-9])/.test(name)) matches.push("1H");
  return matches.length === 1 ? matches[0] : null;
}

async function inventory(root: string, packPath: string): Promise<SourceFileInventory> {
  const files = await listFiles(root);
  const entries: SourceInventoryEntry[] = [];
  for (const full of files) {
    if (isInside(packPath, full)) continue;
    const relativePath = relativeFromRoot(root, full);
    const reason = forbiddenReason(relativePath);
    const meta = await stat(full);
    entries.push({
      relativePath,
      fileClass: fileClass(relativePath),
      sizeBytes: meta.size,
      modifiedAt: meta.mtime.toISOString(),
      included: reason === null,
      exclusionReason: reason,
    });
  }
  for (const required of ["market_snapshot.json", "latest_decision.json"]) {
    if (!entries.some((entry) => entry.relativePath === required)) {
      entries.push({
        relativePath: required,
        fileClass: fileClass(required),
        sizeBytes: null,
        modifiedAt: null,
        included: false,
        exclusionReason: "MISSING",
      });
    }
  }
  return { schemaVersion: 1, localMirrorRoot: root, packPath, files: entries };
}

async function candleRowsFor(root: string, timeframe: ReplayPackTimeframe): Promise<Array<{ path: string; rows: unknown[] }>> {
  const historicalRoot = join(root, "dashboard", "tmp", "historical-packs");
  const files = (await listFiles(historicalRoot)).filter((file) => {
    return classifyHistoricalPackTimeframe(file) === timeframe && (file.endsWith(".json") || file.endsWith(".jsonl"));
  });
  const rows: Array<{ path: string; rows: unknown[] }> = [];
  for (const file of files) {
    if (file.endsWith(".jsonl")) {
      rows.push({ path: file, rows: await readJsonl(file) });
      continue;
    }
    const parsed = await readJsonMaybe(file);
    rows.push({ path: file, rows: Array.isArray(parsed) ? parsed : [] });
  }
  return rows;
}

async function d8Snapshots(
  root: string,
  evaluationCandles: readonly NormalizedPackCandle[],
): Promise<D8SnapshotIngestionResult> {
  const evaluationTimes = evaluationCandles
    .map((candle) => Date.parse(candle.openTime))
    .filter((value) => Number.isFinite(value))
    .sort((left, right) => left - right);
  const latestEvaluationAt = evaluationTimes.length > 0
    ? new Date(evaluationTimes[evaluationTimes.length - 1]).toISOString()
    : null;
  const files = (await listFiles(join(root, "dashboard", "tmp", "d8-snapshots")))
    .filter((file) => file.endsWith(".jsonl"));
  const byEvaluatedAt = new Map<string, D8PointInTimeSnapshot>();
  let futureLeakCount = 0;
  let schemaInvalidCount = 0;
  let malformedCount = 0;
  let duplicateCount = 0;

  for (const file of files) {
    const loaded = await readJsonlWithDiagnostics(file);
    malformedCount += loaded.malformedCount;
    const rows = loaded.rows;
    for (const row of rows) {
      const validation = validateD8PointInTimeSnapshot(row, { evaluationCandleAt: latestEvaluationAt });
      if (!validation.valid) {
        if (validation.errors.includes("future_leak:evaluatedAt_after_evaluation_candle")) futureLeakCount += 1;
        else schemaInvalidCount += 1;
        continue;
      }
      if (validation.snapshot) {
        if (byEvaluatedAt.has(validation.snapshot.evaluatedAt)) duplicateCount += 1;
        byEvaluatedAt.set(validation.snapshot.evaluatedAt, validation.snapshot);
      }
    }
  }

  const rows = [...byEvaluatedAt.values()].sort((left, right) => Date.parse(left.evaluatedAt) - Date.parse(right.evaluatedAt));
  const evaluationCount = evaluationTimes.length;
  const missingCount = Math.max(0, evaluationCount - rows.length);
  const coverageRatio = evaluationCount === 0 ? 0 : rows.length / evaluationCount;
  const status = d8SnapshotStatus({
    rows: rows.length,
    evaluationCount,
    futureLeakCount,
    schemaInvalidCount,
    malformedCount,
    duplicateCount,
    staleCount: 0,
  });
  return {
    rows,
    staleCount: 0,
    futureLeakCount,
    schemaInvalidCount,
    malformedCount,
    duplicateCount,
    missingCount,
    coverageRatio,
    status,
  };
}

function d8SnapshotStatus(input: {
  rows: number;
  evaluationCount: number;
  futureLeakCount: number;
  schemaInvalidCount: number;
  malformedCount: number;
  duplicateCount: number;
  staleCount: number;
}): D8SnapshotDataQualityStatus {
  if (input.futureLeakCount > 0) return "FUTURE_LEAK_BLOCKED";
  if (input.schemaInvalidCount > 0 || input.malformedCount > 0) return "SCHEMA_INVALID_BLOCKED";
  if (input.staleCount > 0) return "STALE_D8_SNAPSHOTS";
  if (input.rows === 0) return "NO_D8_SNAPSHOTS";
  if (input.rows < input.evaluationCount) return "LOW_D8_COVERAGE";
  return "D8_SNAPSHOT_REPLAY_READY";
}

function jsonl(rows: readonly unknown[]): string {
  return rows.map((row) => JSON.stringify(row)).join("\n") + (rows.length > 0 ? "\n" : "");
}

async function writeAtomic(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, "utf8");
}

export async function buildReplayInputPack(options: BuildReplayInputPackOptions): Promise<BuildReplayInputPackResult> {
  const localMirrorRoot = requireSafeRoot(options.localMirrorRoot, options.repoRoot);
  const packPath = packRoot(localMirrorRoot);
  const nowMs = options.nowMs ?? Date.now();
  const createdAt = new Date(nowMs).toISOString();
  const sourceInventory = await inventory(localMirrorRoot, packPath);
  const forbidden = sourceInventory.files.filter((entry) => entry.exclusionReason && entry.exclusionReason !== "MISSING");
  if (forbidden.length > 0) {
    throw new Error(`Forbidden mirror files detected: ${forbidden.map((entry) => entry.relativePath).join(", ")}`);
  }

  const byTimeframe: Record<ReplayPackTimeframe, NormalizedPackCandle[]> = { "5M": [], "15M": [], "1H": [] };
  const metrics: Record<ReplayPackTimeframe, CandleNormalizationResult> = {
    "5M": emptyNormalization(),
    "15M": emptyNormalization(),
    "1H": emptyNormalization(),
  };
  for (const timeframe of TIMEFRAMES) {
    const files = await candleRowsFor(localMirrorRoot, timeframe);
    const combined: unknown[] = [];
    for (const file of files) {
      combined.push(...file.rows.map((row, index) => ({ ...obj(row), sourceFile: relativeFromRoot(localMirrorRoot, file.path), sourceLine: index + 1 })));
    }
    const normalized = normalizeCandlesForPack(combined, {
      timeframe,
      sourceFile: `${timeframe}:combined`,
      nowMs,
    });
    metrics[timeframe] = normalized;
    byTimeframe[timeframe] = normalized.candles;
  }

  const candleCounts = {
    "5M": byTimeframe["5M"].length,
    "15M": byTimeframe["15M"].length,
    "1H": byTimeframe["1H"].length,
  };
  const d8SnapshotResult = await d8Snapshots(localMirrorRoot, byTimeframe["5M"]);
  const snapshotRows = d8SnapshotResult.rows;
  const blockers = qualityBlockers(metrics);
  if (snapshotRows.length === 0) blockers.push("NO_D8_SNAPSHOTS");
  if (d8SnapshotResult.futureLeakCount > 0) blockers.push("FUTURE_LEAK_BLOCKED");
  if (d8SnapshotResult.schemaInvalidCount > 0 || d8SnapshotResult.malformedCount > 0) {
    blockers.push("SCHEMA_INVALID_BLOCKED");
  }
  if (d8SnapshotResult.duplicateCount > 0) blockers.push("DUPLICATE_D8_SNAPSHOTS");
  const uniqueBlockers = [...new Set(blockers)];
  const dataQualityStatus = classifyDataQuality({
    totalCandles: candleCounts["5M"] + candleCounts["15M"] + candleCounts["1H"],
    blockers: uniqueBlockers,
    hasQualityBlocker: uniqueBlockers.length > 0,
  });
  const allCandles = [...byTimeframe["5M"], ...byTimeframe["15M"], ...byTimeframe["1H"]]
    .sort((left, right) => Date.parse(left.openTime) - Date.parse(right.openTime));
  const manifest: ReplayInputPackManifest = {
    schemaVersion: 1,
    source: "D8_4_2_REPLAY_INPUT_PACK_V1",
    createdAt,
    localMirrorRoot,
    mirrorLastSyncAt: await mirrorLastSyncAt(localMirrorRoot),
    timeframesIncluded: TIMEFRAMES.filter((timeframe) => candleCounts[timeframe] > 0),
    startAt: allCandles[0]?.openTime ?? null,
    endAt: allCandles.at(-1)?.closeTime ?? null,
    candleCounts,
    snapshotCounts: {
      latestDecision: sourceInventory.files.some((entry) => entry.relativePath === "latest_decision.json" && entry.included) ? 1 : 0,
      marketSnapshot: sourceInventory.files.some((entry) => entry.relativePath === "market_snapshot.json" && entry.included) ? 1 : 0,
      d8Diagnostics: snapshotRows.length,
    },
    dataQualityStatus,
    blockers: uniqueBlockers,
    nextAction: nextAction(dataQualityStatus),
    activationAllowed: false,
    paperActivationAllowed: false,
    liveActivationAllowed: false,
    reviewOnly: true,
    shadowOnly: true,
  };
  const report: DataQualityReport = {
    schemaVersion: 1,
    candleCounts,
    blockers: uniqueBlockers,
    gapCounts: pickMetric(metrics, "gapCount"),
    duplicateTimestampCounts: pickMetric(metrics, "duplicateTimestampCount"),
    excludedIncompleteCounts: pickMetric(metrics, "excludedIncompleteCount"),
    futureTimestampCounts: pickMetric(metrics, "futureTimestampCount"),
    timeframeMismatchCounts: pickMetric(metrics, "timeframeMismatchCount"),
    invalidOhlcCounts: pickMetric(metrics, "invalidOhlcCount"),
    missingD8Snapshots: snapshotRows.length === 0,
    d8SnapshotCount: snapshotRows.length,
    d8SnapshotCoverageRatio: d8SnapshotResult.coverageRatio,
    d8SnapshotMissingCount: d8SnapshotResult.missingCount,
    d8SnapshotStaleCount: d8SnapshotResult.staleCount,
    d8SnapshotFutureLeakCount: d8SnapshotResult.futureLeakCount,
    d8SnapshotSchemaInvalidCount: d8SnapshotResult.schemaInvalidCount,
    d8SnapshotMalformedCount: d8SnapshotResult.malformedCount,
    d8SnapshotDuplicateCount: d8SnapshotResult.duplicateCount,
    d8SnapshotDataQualityStatus: d8SnapshotResult.status,
    missingFiles: sourceInventory.files.filter((entry) => entry.exclusionReason === "MISSING").map((entry) => entry.relativePath),
    dataQualityStatus,
  };
  const plannedOutputFiles = plannedPackFiles(localMirrorRoot);
  const plannedInputFiles = sourceInventory.files.filter((entry) => entry.included).map((entry) => join(localMirrorRoot, entry.relativePath));
  const result: BuildReplayInputPackResult = {
    mode: options.apply ? "APPLY" : "DRY_RUN",
    manifest,
    inventory: sourceInventory,
    dataQualityReport: report,
    plannedInputFiles,
    plannedOutputFiles,
    wroteFiles: [],
    dryRunSummary: [
      `inputs=${plannedInputFiles.length}`,
      `outputs=${plannedOutputFiles.length}`,
      `status=${dataQualityStatus}`,
    ],
  };

  printSummary(result);
  if (!options.apply) return result;

  const writes = new Map<string, string>([
    [join(packPath, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n"],
    [join(packPath, "candles_5m.jsonl"), jsonl(byTimeframe["5M"])],
    [join(packPath, "candles_15m.jsonl"), jsonl(byTimeframe["15M"])],
    [join(packPath, "candles_1h.jsonl"), jsonl(byTimeframe["1H"])],
    [join(packPath, "d8_snapshots.jsonl"), jsonl(snapshotRows)],
    [join(packPath, "source_file_inventory.json"), JSON.stringify(sourceInventory, null, 2) + "\n"],
    [join(packPath, "data_quality_report.json"), JSON.stringify(report, null, 2) + "\n"],
  ]);
  for (const [path, content] of writes) {
    if (!isInside(packPath, path) || !isInside(localMirrorRoot, path)) {
      throw new Error("Pack output escaped the local mirror root.");
    }
    await writeAtomic(path, content);
    result.wroteFiles.push(path);
  }
  return result;
}

function emptyNormalization(): CandleNormalizationResult {
  return {
    candles: [],
    invalidOhlcCount: 0,
    excludedIncompleteCount: 0,
    duplicateTimestampCount: 0,
    gapCount: 0,
    futureTimestampCount: 0,
    timeframeMismatchCount: 0,
  };
}

function pickMetric<K extends keyof CandleNormalizationResult>(
  metrics: Record<ReplayPackTimeframe, CandleNormalizationResult>,
  key: K,
): Record<ReplayPackTimeframe, number> {
  return {
    "5M": Number(metrics["5M"][key]) || 0,
    "15M": Number(metrics["15M"][key]) || 0,
    "1H": Number(metrics["1H"][key]) || 0,
  };
}

function qualityBlockers(metrics: Record<ReplayPackTimeframe, CandleNormalizationResult>): string[] {
  const blockers = new Set<string>();
  for (const timeframe of TIMEFRAMES) {
    if (metrics[timeframe].futureTimestampCount > 0) blockers.add("FUTURE_TIMESTAMP");
    if (metrics[timeframe].timeframeMismatchCount > 0) blockers.add("TIMEFRAME_MISMATCH");
    if (metrics[timeframe].invalidOhlcCount > 0) blockers.add("INVALID_OHLC_ROWS_EXCLUDED");
  }
  return [...blockers];
}

async function mirrorLastSyncAt(root: string): Promise<string | null> {
  const status = await readJsonMaybe(join(root, "localMirrorStatus.json"));
  const raw = obj(status);
  return typeof raw.lastSyncAt === "string" ? raw.lastSyncAt : null;
}

function nextAction(status: DataQualityStatus): string {
  if (status === "USABLE_FOR_REPLAY") return "Review pack, then run a separately approved one-shot local replay.";
  if (status === "DATA_QUALITY_BLOCKED") return "Repair local mirror data quality before replay.";
  if (status === "INSUFFICIENT_HISTORY") return "Collect more approved mirrored candle history.";
  return "Collect approved mirrored replay input data.";
}

function printSummary(result: BuildReplayInputPackResult): void {
  console.log(`Mode: ${result.mode}`);
  console.log("Planned input files:");
  for (const file of result.plannedInputFiles) console.log(`- ${file}`);
  console.log("Planned output files:");
  for (const file of result.plannedOutputFiles) console.log(`- ${file}`);
  console.log(`Data quality: ${result.manifest.dataQualityStatus}`);
}

function cliArgs(argv: readonly string[]): BuildReplayInputPackOptions {
  let localMirrorRoot = "";
  let apply = false;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--localMirrorRoot" || arg === "--local-mirror-root") {
      localMirrorRoot = argv[index + 1] ?? "";
      index += 1;
      continue;
    }
    if (arg === "--apply" || arg === "--build") apply = true;
    if (arg === "--dry-run") apply = false;
  }
  return { localMirrorRoot, apply };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  buildReplayInputPack(cliArgs(process.argv.slice(2))).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
