import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { validateD8PointInTimeSnapshot } from "./d8-point-in-time-snapshot.ts";

type Timeframe = "5M" | "15M" | "1H";

type CandleCounts = Record<Timeframe, number>;

type JsonObject = Record<string, unknown>;

export type ReplayCliOptions = {
  inputPack: string;
  outputRoot: string;
  oneShot: boolean;
  activeRepoRoot?: string;
};

type PackManifest = {
  schemaVersion: number;
  source: string;
  createdAt: string;
  localMirrorRoot: string;
  mirrorLastSyncAt: string | null;
  timeframesIncluded: Timeframe[];
  startAt: string | null;
  endAt: string | null;
  candleCounts: CandleCounts;
  snapshotCounts: {
    latestDecision: number;
    marketSnapshot: number;
    d8Diagnostics: number;
  };
  dataQualityStatus: string;
  blockers: string[];
  nextAction: string;
  activationAllowed: false;
  paperActivationAllowed: false;
  liveActivationAllowed: false;
  reviewOnly: true;
  shadowOnly: true;
};

type DataQualityReport = {
  dataQualityStatus?: string;
  blockers?: string[];
  warnings?: string[];
  recommendedNextAction?: string;
  missingD8Snapshots?: boolean;
  d8SnapshotCount?: number;
  d8SnapshotFutureLeakCount?: number;
  d8SnapshotSchemaInvalidCount?: number;
  d8SnapshotMalformedCount?: number;
  d8SnapshotDuplicateCount?: number;
  d8SnapshotDataQualityStatus?: string;
};

type CandleAudit = {
  count: number;
  expectedMinutes: number;
  duplicateTimestampCount: number;
  nonMonotonicTimestampCount: number;
  badDeltaCount: number;
};

type ReplayInputPack = {
  inputPack: string;
  manifest: PackManifest;
  dataQualityReport: DataQualityReport;
  sourceFileInventory: JsonObject;
  candles: Record<Timeframe, JsonObject[]>;
  d8Snapshots: JsonObject[];
  audits: Record<Timeframe, CandleAudit>;
};

export type ReplayLimitations = {
  d8SnapshotsMissing: boolean;
  sampleBelow500: boolean;
  noD8_5Approval: true;
  noContinuationApproval: true;
  noActivationAllowed: true;
  profitabilityNotClaimed: true;
};

export type ReplaySummary = {
  replayStart: string | null;
  replayEnd: string | null;
  candlesConsumed: CandleCounts;
  evaluationPoints: number;
  gridEligibilityDecisions: number;
  trendReviewDecisions: number;
  noTradeReasonCounts: Record<string, number>;
  candidateEntryCount: number;
  candidateExitCount: number;
  closedCycleCount: number;
  grossPnlEstimate: number | null;
  costAdjustedPnlEstimate: number | null;
  expectancy: number | null;
  maxAdverseExcursion: number | null;
  missingEvidenceFields: string[];
  edgeStatus: "EDGE_UNPROVEN_NO_CLOSED_CYCLES" | "EDGE_REVIEW_REQUIRED";
  limitations: ReplayLimitations;
};

export type ReplayRunResult = {
  manifest: JsonObject;
  summary: ReplaySummary;
  events: JsonObject[];
  limitations: ReplayLimitations;
  safetyAudit: JsonObject;
};

const REQUIRED_PACK_FILES = [
  "manifest.json",
  "candles_5m.jsonl",
  "candles_15m.jsonl",
  "candles_1h.jsonl",
  "d8_snapshots.jsonl",
  "source_file_inventory.json",
  "data_quality_report.json",
] as const;

const OUTPUT_FILES = [
  "replay_manifest.json",
  "replay_summary.json",
  "replay_events.jsonl",
  "replay_limitations.json",
  "replay_safety_audit.json",
] as const;

const TIMEFRAME_FILES: Record<Timeframe, { fileName: string; minutes: number }> = {
  "5M": { fileName: "candles_5m.jsonl", minutes: 5 },
  "15M": { fileName: "candles_15m.jsonl", minutes: 15 },
  "1H": { fileName: "candles_1h.jsonl", minutes: 60 },
};

export function parseReplayArgs(argv: readonly string[]): ReplayCliOptions {
  const args = new Map<string, string | true>();

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--one-shot") {
      args.set(arg, true);
      continue;
    }

    if (arg === "--input-pack" || arg === "--output-root") {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith("--")) {
        throw new Error(`${arg} requires a value`);
      }
      args.set(arg, value);
      index += 1;
      continue;
    }

    throw new Error(`Unsupported argument: ${arg}`);
  }

  const inputPack = args.get("--input-pack");
  if (typeof inputPack !== "string" || inputPack.trim() === "") {
    throw new Error("--input-pack is required");
  }

  const outputRoot = args.get("--output-root");
  if (typeof outputRoot !== "string" || outputRoot.trim() === "") {
    throw new Error("--output-root is required");
  }

  if (args.get("--one-shot") !== true) {
    throw new Error("--one-shot is required");
  }

  return {
    inputPack,
    outputRoot,
    oneShot: true,
  };
}

export function validateReplayPaths(options: ReplayCliOptions) {
  if (options.oneShot !== true) {
    throw new Error("--one-shot is required");
  }

  const activeRepoRoot = normalizePath(options.activeRepoRoot ?? process.cwd());
  const inputPack = normalizePath(options.inputPack);
  const outputRoot = normalizePath(options.outputRoot);

  if (isInsideOrSame(inputPack, activeRepoRoot)) {
    throw new Error("input pack is inside active repo");
  }

  if (isInsideOrSame(outputRoot, activeRepoRoot)) {
    throw new Error("output root is inside active repo");
  }

  if (isInsideOrSame(outputRoot, inputPack)) {
    throw new Error("output root must not be inside input pack");
  }

  const mirrorRoot = deriveMirrorRoot(inputPack);
  if (!isInsideOrSame(outputRoot, mirrorRoot)) {
    throw new Error("output root must stay under the local mirror root");
  }

  return {
    activeRepoRoot,
    inputPack,
    outputRoot,
    mirrorRoot,
  };
}

export async function runOneShotReplay(options: ReplayCliOptions): Promise<ReplayRunResult> {
  const paths = validateReplayPaths(options);
  const pack = await readReplayInputPack(paths.inputPack);
  const limitations = buildReplayLimitations(pack);
  const events = buildReplayEvents(pack, limitations);
  const summary = buildReplaySummary(pack, events, limitations);
  const result: ReplayRunResult = {
    manifest: buildReplayManifest(paths, pack, summary),
    summary,
    events,
    limitations,
    safetyAudit: buildReplaySafetyAudit(paths, pack),
  };

  await writeReplayOutputs(paths.outputRoot, result);
  return result;
}

async function readReplayInputPack(inputPack: string): Promise<ReplayInputPack> {
  for (const fileName of REQUIRED_PACK_FILES) {
    await requireFile(path.join(inputPack, fileName), fileName);
  }

  const manifest = await readJson<PackManifest>(path.join(inputPack, "manifest.json"));
  const dataQualityReport = await readJson<DataQualityReport>(path.join(inputPack, "data_quality_report.json"));
  const sourceFileInventory = await readJson<JsonObject>(path.join(inputPack, "source_file_inventory.json"));

  validateSafetyFlags(manifest);
  validateD8QualityReport(dataQualityReport);

  if ((dataQualityReport.dataQualityStatus ?? manifest.dataQualityStatus) !== "USABLE_FOR_REPLAY") {
    throw new Error("input pack data quality is not USABLE_FOR_REPLAY");
  }

  const candles = {
    "5M": await readJsonl(path.join(inputPack, TIMEFRAME_FILES["5M"].fileName)),
    "15M": await readJsonl(path.join(inputPack, TIMEFRAME_FILES["15M"].fileName)),
    "1H": await readJsonl(path.join(inputPack, TIMEFRAME_FILES["1H"].fileName)),
  } satisfies Record<Timeframe, JsonObject[]>;

  const audits = {
    "5M": auditCandleSeries(candles["5M"], TIMEFRAME_FILES["5M"].minutes),
    "15M": auditCandleSeries(candles["15M"], TIMEFRAME_FILES["15M"].minutes),
    "1H": auditCandleSeries(candles["1H"], TIMEFRAME_FILES["1H"].minutes),
  } satisfies Record<Timeframe, CandleAudit>;

  for (const timeframe of Object.keys(TIMEFRAME_FILES) as Timeframe[]) {
    if (candles[timeframe].length !== manifest.candleCounts[timeframe]) {
      throw new Error(`candle count mismatch for ${timeframe}`);
    }

    const audit = audits[timeframe];
    if (audit.badDeltaCount > 0 || audit.duplicateTimestampCount > 0 || audit.nonMonotonicTimestampCount > 0) {
      throw new Error(`contaminated candle deltas for ${timeframe}`);
    }
  }

  const latestEvaluationAt = String(candles["5M"].at(-1)?.openTime ?? "");
  const d8Snapshots = await readAndValidateD8Snapshots(
    path.join(inputPack, "d8_snapshots.jsonl"),
    latestEvaluationAt,
  );

  return {
    inputPack,
    manifest,
    dataQualityReport,
    sourceFileInventory,
    candles,
    d8Snapshots,
    audits,
  };
}

function validateD8QualityReport(report: DataQualityReport): void {
  const blockers = new Set(report.blockers ?? []);
  if (report.missingD8Snapshots === true || report.d8SnapshotCount === 0 || blockers.has("NO_D8_SNAPSHOTS")) {
    throw new Error("NO_D8_SNAPSHOTS");
  }
  if (
    (report.d8SnapshotFutureLeakCount ?? 0) > 0
    || report.d8SnapshotDataQualityStatus === "FUTURE_LEAK_BLOCKED"
    || blockers.has("FUTURE_LEAK_BLOCKED")
  ) {
    throw new Error("FUTURE_LEAK_BLOCKED");
  }
  if (
    (report.d8SnapshotSchemaInvalidCount ?? 0) > 0
    || (report.d8SnapshotMalformedCount ?? 0) > 0
    || report.d8SnapshotDataQualityStatus === "SCHEMA_INVALID_BLOCKED"
    || blockers.has("SCHEMA_INVALID_BLOCKED")
  ) {
    throw new Error("SCHEMA_INVALID_BLOCKED");
  }
  if ((report.d8SnapshotDuplicateCount ?? 0) > 0 || blockers.has("DUPLICATE_D8_SNAPSHOTS")) {
    throw new Error("DUPLICATE_D8_SNAPSHOTS");
  }
}

async function readAndValidateD8Snapshots(filePath: string, evaluationCandleAt: string): Promise<JsonObject[]> {
  const contents = await readFile(filePath, "utf8");
  const lines = contents.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0) throw new Error("NO_D8_SNAPSHOTS");

  const rows: JsonObject[] = [];
  const evaluatedAt = new Set<string>();
  for (const line of lines) {
    let row: JsonObject;
    try {
      row = JSON.parse(line) as JsonObject;
    } catch {
      throw new Error("SCHEMA_INVALID_BLOCKED");
    }
    const validation = validateD8PointInTimeSnapshot(row, { evaluationCandleAt });
    if (!validation.valid || !validation.snapshot) {
      if (validation.errors.includes("future_leak:evaluatedAt_after_evaluation_candle")) {
        throw new Error("FUTURE_LEAK_BLOCKED");
      }
      throw new Error("SCHEMA_INVALID_BLOCKED");
    }
    if (evaluatedAt.has(validation.snapshot.evaluatedAt)) throw new Error("DUPLICATE_D8_SNAPSHOTS");
    evaluatedAt.add(validation.snapshot.evaluatedAt);
    rows.push(validation.snapshot as unknown as JsonObject);
  }
  return rows;
}

function auditCandleSeries(rows: readonly JsonObject[], expectedMinutes: number): CandleAudit {
  const timestamps = rows.map((row, index) => {
    const value = row.openTime ?? row.timestamp ?? row.time ?? row.t;
    const timestamp = typeof value === "number" ? value : Date.parse(String(value));

    if (!Number.isFinite(timestamp)) {
      throw new Error(`invalid timestamp at candle index ${index}`);
    }

    for (const field of ["open", "high", "low", "close"]) {
      const numeric = Number(row[field]);
      if (!Number.isFinite(numeric)) {
        throw new Error(`invalid ${field} at candle index ${index}`);
      }
    }

    return timestamp;
  });

  let duplicateTimestampCount = 0;
  let nonMonotonicTimestampCount = 0;
  let badDeltaCount = 0;
  const seen = new Set<number>();
  const expectedDeltaMs = expectedMinutes * 60_000;

  for (let index = 0; index < timestamps.length; index += 1) {
    const timestamp = timestamps[index];
    if (seen.has(timestamp)) {
      duplicateTimestampCount += 1;
    }
    seen.add(timestamp);

    if (index > 0) {
      const delta = timestamp - timestamps[index - 1];
      if (delta <= 0) {
        nonMonotonicTimestampCount += 1;
      }
      if (delta !== expectedDeltaMs) {
        badDeltaCount += 1;
      }
    }
  }

  return {
    count: rows.length,
    expectedMinutes,
    duplicateTimestampCount,
    nonMonotonicTimestampCount,
    badDeltaCount,
  };
}

function buildReplayLimitations(pack: ReplayInputPack): ReplayLimitations {
  const totalSample = pack.candles["5M"].length;

  return {
    d8SnapshotsMissing: pack.d8Snapshots.length === 0,
    sampleBelow500: totalSample < 500,
    noD8_5Approval: true,
    noContinuationApproval: true,
    noActivationAllowed: true,
    profitabilityNotClaimed: true,
  };
}

function buildReplayEvents(pack: ReplayInputPack, limitations: ReplayLimitations): JsonObject[] {
  return pack.candles["5M"].map((row, index) => ({
    schemaVersion: 1,
    source: "L7_ONE_SHOT_LOCAL_REPLAY_EVENT_V1",
    sequence: index + 1,
    candleOpenTime: row.openTime ?? row.timestamp ?? row.time ?? row.t,
    gridEligibilityDecision: "NOT_EVALUATED_NO_POINT_IN_TIME_GRID_CONTEXT",
    trendReviewDecision: limitations.d8SnapshotsMissing ? "NOT_AVAILABLE_NO_D8_SNAPSHOTS" : "REVIEW_REQUIRED",
    noTradeReason: limitations.d8SnapshotsMissing ? "NO_D8_SNAPSHOTS" : "NO_REVIEW_CANDIDATE",
    candidateEntry: false,
    candidateExit: false,
    closedCycle: false,
    activationAllowed: false,
    paperActivationAllowed: false,
    liveActivationAllowed: false,
    reviewOnly: true,
    shadowOnly: true,
  }));
}

function buildReplaySummary(pack: ReplayInputPack, events: readonly JsonObject[], limitations: ReplayLimitations): ReplaySummary {
  const noTradeReasonCounts = countBy(events, "noTradeReason");
  const closedCycleCount = 0;
  const missingEvidenceFields = limitations.d8SnapshotsMissing ? ["d8_snapshots"] : [];

  return {
    replayStart: pack.manifest.startAt ?? firstTimestamp(pack.candles["5M"]),
    replayEnd: pack.manifest.endAt ?? lastTimestamp(pack.candles["5M"]),
    candlesConsumed: {
      "5M": pack.candles["5M"].length,
      "15M": pack.candles["15M"].length,
      "1H": pack.candles["1H"].length,
    },
    evaluationPoints: events.length,
    gridEligibilityDecisions: 0,
    trendReviewDecisions: 0,
    noTradeReasonCounts,
    candidateEntryCount: 0,
    candidateExitCount: 0,
    closedCycleCount,
    grossPnlEstimate: null,
    costAdjustedPnlEstimate: null,
    expectancy: closedCycleCount === 0 ? null : 0,
    maxAdverseExcursion: null,
    missingEvidenceFields,
    edgeStatus: closedCycleCount === 0 ? "EDGE_UNPROVEN_NO_CLOSED_CYCLES" : "EDGE_REVIEW_REQUIRED",
    limitations,
  };
}

function buildReplayManifest(paths: ReturnType<typeof validateReplayPaths>, pack: ReplayInputPack, summary: ReplaySummary): JsonObject {
  return {
    schemaVersion: 1,
    source: "L7_ONE_SHOT_LOCAL_REPLAY_V1",
    inputPack: paths.inputPack,
    outputRoot: paths.outputRoot,
    localMirrorRoot: pack.manifest.localMirrorRoot,
    inputPackCreatedAt: pack.manifest.createdAt,
    replayStart: summary.replayStart,
    replayEnd: summary.replayEnd,
    candleCounts: summary.candlesConsumed,
    d8SnapshotCount: pack.d8Snapshots.length,
    outputFiles: [...OUTPUT_FILES],
    activationAllowed: false,
    paperActivationAllowed: false,
    liveActivationAllowed: false,
    reviewOnly: true,
    shadowOnly: true,
  };
}

function buildReplaySafetyAudit(paths: ReturnType<typeof validateReplayPaths>, pack: ReplayInputPack): JsonObject {
  return {
    schemaVersion: 1,
    source: "L7_ONE_SHOT_LOCAL_REPLAY_SAFETY_AUDIT_V1",
    inputPackOutsideActiveRepo: !isInsideOrSame(paths.inputPack, paths.activeRepoRoot),
    outputRootOutsideActiveRepo: !isInsideOrSame(paths.outputRoot, paths.activeRepoRoot),
    outputRootUnderLocalMirror: isInsideOrSame(paths.outputRoot, paths.mirrorRoot),
    inputPackUnchangedByDesign: true,
    dataQualityStatus: pack.dataQualityReport.dataQualityStatus ?? pack.manifest.dataQualityStatus,
    candleAudits: pack.audits,
    activationAllowed: false,
    paperActivationAllowed: false,
    liveActivationAllowed: false,
    reviewOnly: true,
    shadowOnly: true,
  };
}

async function writeReplayOutputs(outputRoot: string, result: ReplayRunResult): Promise<void> {
  const normalizedOutputRoot = normalizePath(outputRoot);

  await assertPathMissing(normalizedOutputRoot);
  await mkdir(path.dirname(normalizedOutputRoot), { recursive: true });
  await mkdir(normalizedOutputRoot);

  await writeJson(path.join(normalizedOutputRoot, "replay_manifest.json"), result.manifest);
  await writeJson(path.join(normalizedOutputRoot, "replay_summary.json"), result.summary);
  await writeJsonl(path.join(normalizedOutputRoot, "replay_events.jsonl"), result.events);
  await writeJson(path.join(normalizedOutputRoot, "replay_limitations.json"), result.limitations);
  await writeJson(path.join(normalizedOutputRoot, "replay_safety_audit.json"), result.safetyAudit);
}

async function requireFile(filePath: string, label: string) {
  try {
    const stats = await stat(filePath);
    if (!stats.isFile()) {
      throw new Error();
    }
  } catch {
    throw new Error(`missing required pack file: ${label}`);
  }
}

async function assertPathMissing(filePath: string) {
  try {
    await stat(filePath);
  } catch {
    return;
  }

  throw new Error(`output root already exists: ${filePath}`);
}

async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, "utf8")) as T;
}

async function readJsonl(filePath: string): Promise<JsonObject[]> {
  const contents = await readFile(filePath, "utf8");
  const lines = contents.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
  return lines.map((line) => JSON.parse(line) as JsonObject);
}

async function writeJson(filePath: string, value: unknown) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function writeJsonl(filePath: string, rows: readonly unknown[]) {
  await writeFile(filePath, `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`, "utf8");
}

function validateSafetyFlags(manifest: PackManifest) {
  if (
    manifest.activationAllowed !== false ||
    manifest.paperActivationAllowed !== false ||
    manifest.liveActivationAllowed !== false ||
    manifest.reviewOnly !== true ||
    manifest.shadowOnly !== true
  ) {
    throw new Error("unsafe activation flag in input pack manifest");
  }
}

function countBy(rows: readonly JsonObject[], field: string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const row of rows) {
    const key = String(row[field] ?? "UNKNOWN");
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

function firstTimestamp(rows: readonly JsonObject[]) {
  const first = rows[0];
  return first === undefined ? null : String(first.openTime ?? first.timestamp ?? first.time ?? first.t);
}

function lastTimestamp(rows: readonly JsonObject[]) {
  const last = rows.at(-1);
  return last === undefined ? null : String(last.openTime ?? last.timestamp ?? last.time ?? last.t);
}

function deriveMirrorRoot(inputPack: string) {
  const normalized = normalizePath(inputPack);
  const parts = normalized.split(path.sep);
  const index = parts.findIndex((part) => part.toLowerCase() === "research-packs");

  if (index <= 0) {
    throw new Error("input pack path must be under a research-packs directory");
  }

  return parts.slice(0, index).join(path.sep);
}

function normalizePath(value: string) {
  return path.resolve(value).replace(/[\\/]$/u, "");
}

function isInsideOrSame(candidate: string, parent: string) {
  const normalizedCandidate = normalizePath(candidate).toLowerCase();
  const normalizedParent = normalizePath(parent).toLowerCase();

  return normalizedCandidate === normalizedParent || normalizedCandidate.startsWith(`${normalizedParent.toLowerCase()}${path.sep}`);
}

async function main() {
  const options = parseReplayArgs(process.argv.slice(2));
  const result = await runOneShotReplay(options);
  console.log(JSON.stringify(result.summary, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
