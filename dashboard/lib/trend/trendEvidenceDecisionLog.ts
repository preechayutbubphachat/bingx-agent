// dashboard/lib/trend/trendEvidenceDecisionLog.ts
// Phase T-3H-6-a — Rejection Decision Log (append-only JSONL, OBSERVABILITY ONLY).
// Design doc: docs/T-3H-6a_rejection_frequency_design.md
//
// SAFETY (hard rules):
//   - ONE-WAY: route writes after the decision is made; UI reads the summary.
//     Decision logic MUST NEVER import or read this log.
//   - Best-effort: append/trim failure must NEVER fail the evidence cycle.
//     append returns { ok: false } instead of throwing.
//   - Path-locked under <root>/trend-paper/ (same pattern as trendPaperEvidenceState).
//   - Paper-only invariants stamped on every record. No secrets, headers, or tokens.
//   - NO BingX, NO order, NO live/exchange logic.

import * as fs from "fs/promises";
import * as path from "path";
import {
  emptyExactZoneComparisonSummary,
  summarizeExactZoneComparison,
  type ExactZoneComparisonCandle,
  type ExactZoneComparisonSummary,
} from "./exactZoneComparisonSummary.ts";
import {
  emptyMtfObFvgShadowSnapshotSummary,
  summarizeMtfObFvgShadowSnapshots,
  type MtfObFvgShadowSnapshotSummary,
  type RrSnapshot,
  type SmcMtfShadowSnapshot,
} from "./mtfObFvgShadowSnapshot.ts";
import {
  emptyShadowOutcomeSummary,
  summarizeShadowOutcomes,
  type ShadowOutcomeSummary,
} from "./shadowOutcomeResolver.ts";
import {
  emptyShadowOutcomeQualityGate,
  evaluateShadowOutcomeQualityGate,
  type ShadowOutcomeQualityGate,
} from "./shadowOutcomeQualityGate.ts";
import {
  emptyShadowEvidenceCoverageTracker,
  evaluateShadowEvidenceCoverage,
  type ShadowEvidenceCoverageTracker,
} from "./shadowEvidenceCoverageTracker.ts";
import {
  buildExactCandidateGeometrySnapshot,
  summarizeExactCandidateGeometrySnapshots,
  type ExactCandidateGeometrySnapshot,
} from "./exactCandidateGeometrySnapshot.ts";

export const TREND_EVIDENCE_DECISION_LOG_SCHEMA_VERSION = 1;
export const TREND_EVIDENCE_DECISION_LOG_FILE_NAME = "trend_paper_evidence_decisions.jsonl";
const LOG_DIR = "trend-paper";
const LOG_PATH_SUFFIX = `/${LOG_DIR}/${TREND_EVIDENCE_DECISION_LOG_FILE_NAME}`;

export const DECISION_LOG_MAX_LINES = 2000;
export const DECISION_LOG_MAX_AGE_DAYS = 14;
/** runner cadence (minutes) used only for the stale-cycle estimate */
export const DECISION_LOG_EXPECTED_INTERVAL_MINUTES = 15;
/** below this many records the summary carries a sampleWarning */
export const DECISION_LOG_MIN_SAMPLE = 100;

export interface TrendEvidenceDecisionRecord {
  schemaVersion: number;
  recordedAt: string;
  source: string; // e.g. "trend-paper-evidence-cycle"
  action: string; // e.g. "run_once"
  paperOnly: true;
  liveActivationAllowed: false;
  exchangeOrderAllowed: false;
  observabilityOnly: true;
  evidencePhase: string;
  enabled: boolean;
  lastRunAt: string | null;
  lastDecision: string | null;
  lastGateStatus: string | null;
  lastRejectReasons: string[];
  dailyEntryCount: number;
  dailyLossR: number;
  openTrendPosition: boolean;
  trendClosedTrades: number;
  sampleStatus: string;
  readyForNextPhase: boolean;
  stopReason: string | null;
  /** T-3H-6-c1 optional RR geometry snapshot; observability only. */
  rrSnapshot?: RrSnapshot;
  /** T-3H-6-c1 optional MTF OB/FVG refinement shadow snapshot; observability only. */
  smcMtfShadowSnapshot?: SmcMtfShadowSnapshot;
  /** D7.3 optional exact candidate geometry snapshot; observability only. */
  exactCandidateGeometrySnapshot?: ExactCandidateGeometrySnapshot;
}

export interface RejectReasonCount {
  reason: string;
  count: number;
}

export interface TrendEvidenceDecisionSummary {
  available: boolean;
  totalRecords: number;
  windowStart: string | null;
  windowEnd: string | null;
  latestRecordedAt: string | null;
  decisionCounts: Record<string, number>;
  gateStatusCounts: Record<string, number>;
  rejectReasonCounts: Record<string, number>;
  topRejectReasons: RejectReasonCount[];
  /** expected vs observed cycles in the window @15min cadence (rough scheduler-gap estimate) */
  staleCycleEstimate: { expectedCycles: number; observedCycles: number; missedCycles: number } | null;
  lastRejectReasons: string[];
  sampleWarning: boolean;
  /** lines skipped because they were malformed (observability of the log itself) */
  malformedLines: number;
  /** T-3H-6-c1 read-only shadow history summary. Never read by runner/decision logic. */
  mtfObFvgShadowSummary: MtfObFvgShadowSnapshotSummary;
  /** T-3H-6-d5 read-only exact-zone vs heuristic comparison. Never read by runner/decision logic. */
  exactZoneComparisonSummary: ExactZoneComparisonSummary;
  /** D7.0-d read-only sample accounting. Lifetime uses all available retained records, window uses this summary window. */
  sampleAccounting: {
    lifetimeExactSamples: number | null;
    windowExactSamples: number | null;
    currentPriceEligibleExactSamples: number | null;
  };
  /** D7.3 read-only exact candidate geometry snapshot summary. Never read by decision logic. */
  exactCandidateGeometrySnapshot: ExactCandidateGeometrySnapshot;
  /** D5.2-b read-only counterfactual reachability evidence. Never read by runner/decision logic. */
  shadowOutcomeSummary: ShadowOutcomeSummary;
  /** D5.2-d read-only sample/context quality gate. Never read by runner/decision logic. */
  shadowOutcomeQualityGate: ShadowOutcomeQualityGate;
  /** D5.3 read-only evidence coverage tracker. Never read by runner/decision logic. */
  shadowEvidenceCoverage: ShadowEvidenceCoverageTracker;
}

export function emptyTrendEvidenceDecisionSummary(): TrendEvidenceDecisionSummary {
  return {
    available: false,
    totalRecords: 0,
    windowStart: null,
    windowEnd: null,
    latestRecordedAt: null,
    decisionCounts: {},
    gateStatusCounts: {},
    rejectReasonCounts: {},
    topRejectReasons: [],
    staleCycleEstimate: null,
    lastRejectReasons: [],
    sampleWarning: true,
    malformedLines: 0,
    mtfObFvgShadowSummary: emptyMtfObFvgShadowSnapshotSummary(),
    exactZoneComparisonSummary: emptyExactZoneComparisonSummary(),
    sampleAccounting: {
      lifetimeExactSamples: null,
      windowExactSamples: null,
      currentPriceEligibleExactSamples: null,
    },
    exactCandidateGeometrySnapshot: summarizeExactCandidateGeometrySnapshots([]),
    shadowOutcomeSummary: emptyShadowOutcomeSummary(),
    shadowOutcomeQualityGate: emptyShadowOutcomeQualityGate(),
    shadowEvidenceCoverage: emptyShadowEvidenceCoverageTracker(),
  };
}

// ---- path lock (identical pattern to trendPaperEvidenceState) ----

export function resolveTrendEvidenceDecisionLogPath(rootDir?: string | null): string {
  const baseDir = rootDir ? path.resolve(rootDir) : path.resolve(process.cwd(), "tmp");
  return path.resolve(baseDir, LOG_DIR, TREND_EVIDENCE_DECISION_LOG_FILE_NAME);
}

function resolveLockedPath(filePath?: string | null): string {
  const p = filePath ? path.resolve(filePath) : resolveTrendEvidenceDecisionLogPath();
  if (!p.replace(/\\/g, "/").endsWith(LOG_PATH_SUFFIX)) {
    throw new Error("trend_evidence_decision_log_path_not_allowed");
  }
  return p;
}

// ---- record construction (pure) ----

/**
 * Build a compact observability record from an evidence-state-like object.
 * Whitelist-only: copies ONLY the documented fields — never headers, tokens, or raw payloads.
 * Safety invariants are stamped as constants regardless of input.
 */
export function buildTrendEvidenceDecisionRecord(input: {
  now: string;
  source: string;
  action: string;
  state: {
    evidencePhase?: unknown;
    enabled?: unknown;
    lastRunAt?: unknown;
    lastDecision?: unknown;
    lastGateStatus?: unknown;
    lastRejectReasons?: unknown;
    dailyEntryCount?: unknown;
    dailyLossR?: unknown;
    openTrendPosition?: unknown;
    trendClosedTrades?: unknown;
    sampleStatus?: unknown;
    readyForNextPhase?: unknown;
    stopReason?: unknown;
  };
  rrSnapshot?: RrSnapshot | null;
  smcMtfShadowSnapshot?: SmcMtfShadowSnapshot | null;
  exactCandidateGeometrySnapshot?: ExactCandidateGeometrySnapshot | null;
}): TrendEvidenceDecisionRecord {
  const s = input.state;
  const strOrNull = (v: unknown): string | null => (typeof v === "string" && v.length ? v : null);
  const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  const reasons = Array.isArray(s.lastRejectReasons)
    ? s.lastRejectReasons.filter((r): r is string => typeof r === "string").slice(0, 16)
    : [];
  const record: TrendEvidenceDecisionRecord = {
    schemaVersion: TREND_EVIDENCE_DECISION_LOG_SCHEMA_VERSION,
    recordedAt: input.now,
    source: input.source,
    action: input.action,
    paperOnly: true,
    liveActivationAllowed: false,
    exchangeOrderAllowed: false,
    observabilityOnly: true,
    evidencePhase: typeof s.evidencePhase === "string" ? s.evidencePhase : "UNKNOWN",
    enabled: s.enabled === true,
    lastRunAt: strOrNull(s.lastRunAt),
    lastDecision: strOrNull(s.lastDecision),
    lastGateStatus: strOrNull(s.lastGateStatus),
    lastRejectReasons: reasons,
    dailyEntryCount: num(s.dailyEntryCount),
    dailyLossR: num(s.dailyLossR),
    openTrendPosition: s.openTrendPosition != null && typeof s.openTrendPosition === "object",
    trendClosedTrades: num(s.trendClosedTrades),
    sampleStatus: typeof s.sampleStatus === "string" ? s.sampleStatus : "UNKNOWN",
    readyForNextPhase: s.readyForNextPhase === true,
    stopReason: strOrNull(s.stopReason),
  };
  if (input.rrSnapshot) record.rrSnapshot = input.rrSnapshot;
  if (input.smcMtfShadowSnapshot) record.smcMtfShadowSnapshot = input.smcMtfShadowSnapshot;
  if (input.exactCandidateGeometrySnapshot) {
    record.exactCandidateGeometrySnapshot = input.exactCandidateGeometrySnapshot;
  } else if (input.smcMtfShadowSnapshot) {
    record.exactCandidateGeometrySnapshot = buildExactCandidateGeometrySnapshot({
      capturedAt: input.now,
      smcMtfShadowSnapshot: input.smcMtfShadowSnapshot,
    });
  }
  return record;
}

// ---- append (best-effort, never throws) ----

export async function appendTrendEvidenceDecisionLog(
  record: TrendEvidenceDecisionRecord,
  options: { filePath?: string | null; skipTrim?: boolean } = {},
): Promise<{ ok: true; path: string } | { ok: false; error: string }> {
  let filePath: string;
  try {
    filePath = resolveLockedPath(options.filePath);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "path_resolve_failed" };
  }
  try {
    // hard invariants — refuse to write a record claiming live/exchange
    if (
      record.paperOnly !== true ||
      record.liveActivationAllowed !== false ||
      record.exchangeOrderAllowed !== false ||
      record.observabilityOnly !== true
    ) {
      return { ok: false, error: "record_safety_invariants_violated" };
    }
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.appendFile(filePath, `${JSON.stringify(record)}\n`, "utf8");
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "append_failed" };
  }
  if (!options.skipTrim) {
    // best-effort trim; its failure never affects the append result
    await trimTrendEvidenceDecisionLog({ filePath }).catch(() => undefined);
  }
  return { ok: true, path: filePath };
}

// ---- read (malformed-line tolerant) ----

async function readRecords(filePath: string): Promise<{ records: TrendEvidenceDecisionRecord[]; malformed: number }> {
  let raw = "";
  try {
    raw = await fs.readFile(filePath, "utf8");
  } catch {
    return { records: [], malformed: 0 };
  }
  const records: TrendEvidenceDecisionRecord[] = [];
  let malformed = 0;
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed) as TrendEvidenceDecisionRecord;
      if (parsed && typeof parsed === "object" && typeof parsed.recordedAt === "string") {
        records.push(parsed);
      } else {
        malformed += 1;
      }
    } catch {
      malformed += 1;
    }
  }
  return { records, malformed };
}

export async function readTrendEvidenceDecisionLogSummary(
  options: {
    filePath?: string | null;
    now?: number;
    windowHours?: number;
    topN?: number;
    candlesByTimeframe?: Record<string, readonly ExactZoneComparisonCandle[]> | null;
  } = {},
): Promise<TrendEvidenceDecisionSummary> {
  let filePath: string;
  try {
    filePath = resolveLockedPath(options.filePath);
  } catch {
    return emptyTrendEvidenceDecisionSummary();
  }
  const nowMs = typeof options.now === "number" ? options.now : Date.now();
  const windowHours = typeof options.windowHours === "number" && options.windowHours > 0 ? options.windowHours : 48;
  const topN = typeof options.topN === "number" && options.topN > 0 ? options.topN : 8;

  const { records: all, malformed } = await readRecords(filePath);
  const cutoff = nowMs - windowHours * 3_600_000;
  const records = all.filter((r) => {
    const t = Date.parse(r.recordedAt);
    return Number.isFinite(t) && t >= cutoff && t <= nowMs + 5 * 60_000; // small clock-skew allowance
  });

  if (!records.length) {
    return { ...emptyTrendEvidenceDecisionSummary(), malformedLines: malformed };
  }

  const decisionCounts: Record<string, number> = {};
  const gateStatusCounts: Record<string, number> = {};
  const rejectReasonCounts: Record<string, number> = {};
  let earliest = Number.POSITIVE_INFINITY;
  let latest = Number.NEGATIVE_INFINITY;
  let latestRecord: TrendEvidenceDecisionRecord = records[0]!;

  for (const r of records) {
    const t = Date.parse(r.recordedAt);
    if (t < earliest) earliest = t;
    if (t > latest) {
      latest = t;
      latestRecord = r;
    }
    const decision = r.lastDecision ?? "NULL";
    decisionCounts[decision] = (decisionCounts[decision] ?? 0) + 1;
    const gate = r.lastGateStatus ?? "NULL";
    gateStatusCounts[gate] = (gateStatusCounts[gate] ?? 0) + 1;
    if (Array.isArray(r.lastRejectReasons)) {
      for (const reason of r.lastRejectReasons) {
        if (typeof reason === "string" && reason) {
          rejectReasonCounts[reason] = (rejectReasonCounts[reason] ?? 0) + 1;
        }
      }
    }
  }

  const topRejectReasons = Object.entries(rejectReasonCounts)
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason))
    .slice(0, topN);

  const windowMinutes = (latest - earliest) / 60_000;
  const expectedCycles = windowMinutes > 0 ? Math.floor(windowMinutes / DECISION_LOG_EXPECTED_INTERVAL_MINUTES) + 1 : 1;
  const observedCycles = records.length;
  const staleCycleEstimate = {
    expectedCycles,
    observedCycles,
    missedCycles: Math.max(0, expectedCycles - observedCycles),
  };

  const shadowOutcomeSummary = summarizeShadowOutcomes(records, {
    candlesByTimeframe: options.candlesByTimeframe,
  });
  const shadowOutcomeQualityGate = evaluateShadowOutcomeQualityGate(shadowOutcomeSummary);
  const windowExactZoneComparisonSummary = summarizeExactZoneComparison(records, {
    candlesByTimeframe: options.candlesByTimeframe,
  });
  const allAvailableRecords = all.filter((r) => {
    const t = Date.parse(r.recordedAt);
    return Number.isFinite(t) && t <= nowMs + 5 * 60_000;
  });
  const lifetimeExactZoneComparisonSummary = summarizeExactZoneComparison(allAvailableRecords);

  return {
    available: true,
    totalRecords: records.length,
    windowStart: new Date(earliest).toISOString(),
    windowEnd: new Date(latest).toISOString(),
    latestRecordedAt: latestRecord.recordedAt,
    decisionCounts,
    gateStatusCounts,
    rejectReasonCounts,
    topRejectReasons,
    staleCycleEstimate,
    lastRejectReasons: Array.isArray(latestRecord.lastRejectReasons) ? latestRecord.lastRejectReasons : [],
    sampleWarning: records.length < DECISION_LOG_MIN_SAMPLE,
    malformedLines: malformed,
    mtfObFvgShadowSummary: summarizeMtfObFvgShadowSnapshots(records),
    exactZoneComparisonSummary: windowExactZoneComparisonSummary,
    sampleAccounting: {
      lifetimeExactSamples: lifetimeExactZoneComparisonSummary.exactSamples,
      windowExactSamples: windowExactZoneComparisonSummary.exactSamples,
      currentPriceEligibleExactSamples: null,
    },
    exactCandidateGeometrySnapshot: summarizeExactCandidateGeometrySnapshots(records),
    shadowOutcomeSummary,
    shadowOutcomeQualityGate,
    shadowEvidenceCoverage: evaluateShadowEvidenceCoverage(shadowOutcomeQualityGate),
  };
}

// ---- trim (best-effort retention; atomic rewrite) ----

export async function trimTrendEvidenceDecisionLog(
  options: { filePath?: string | null; now?: number; maxLines?: number; maxAgeDays?: number } = {},
): Promise<void> {
  const filePath = resolveLockedPath(options.filePath);
  const nowMs = typeof options.now === "number" ? options.now : Date.now();
  const maxLines = typeof options.maxLines === "number" && options.maxLines > 0 ? options.maxLines : DECISION_LOG_MAX_LINES;
  const maxAgeDays = typeof options.maxAgeDays === "number" && options.maxAgeDays > 0 ? options.maxAgeDays : DECISION_LOG_MAX_AGE_DAYS;

  const { records } = await readRecords(filePath);
  if (!records.length) return;

  const ageCutoff = nowMs - maxAgeDays * 86_400_000;
  let kept = records.filter((r) => {
    const t = Date.parse(r.recordedAt);
    return Number.isFinite(t) && t >= ageCutoff;
  });
  if (kept.length > maxLines) kept = kept.slice(kept.length - maxLines);

  // nothing to do (also avoids rewrite churn when only malformed lines were dropped within limits)
  if (kept.length === records.length) return;

  const tmp = `${filePath}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const content = kept.map((r) => JSON.stringify(r)).join("\n");
  await fs.writeFile(tmp, content.length ? `${content}\n` : "", "utf8");
  await fs.rename(tmp, filePath);
}
