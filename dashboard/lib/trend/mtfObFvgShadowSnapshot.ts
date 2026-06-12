// dashboard/lib/trend/mtfObFvgShadowSnapshot.ts
// Phase T-3H-6-c1 - sanitized RR + MTF OB/FVG shadow snapshots.
//
// SAFETY:
//   - Pure helpers only. No I/O, no env reads, no decision-path imports.
//   - Snapshot data is observability-only and must never feed entry decisions.

import type { RrDrilldownResult } from "./rrBlockerDrilldown.ts";
import type { MtfObFvgRefinementShadowResult } from "./mtfObFvgRefinementShadow.ts";
import type { ExactZoneDataStatus, ExactZoneShadowOutput } from "./exactZoneShadowInput.ts";

export interface RrSnapshot {
  schemaVersion: 1;
  source: "rr-blocker-drilldown";
  capturedAt: string;
  currentRawRR: number;
  currentNetRR: number | null;
  requiredRR: number;
  rrGap: number | null;
  riskDistance: number | null;
  rewardDistance: number | null;
  costR: number | null;
  failSeverity: string | null;
  reason: string | null;
}

export interface SmcMtfShadowSnapshot {
  schemaVersion: 1;
  source: "mtf-ob-fvg-refinement-shadow";
  capturedAt: string;
  dataStatus: string;
  classification: string;
  qualityScore: number;
  currentRawRR: number | null;
  currentNetRR: number | null;
  refinedRawRR: number | null;
  refinedNetRR: number | null;
  rrImprovement: number | null;
  netRrImprovement: number | null;
  wouldPassStaticRR: boolean | null;
  wouldPassNetRR: boolean | null;
  requiredRR: number | null;
  shadowOnly: true;
  usesExactObFvgZones: boolean;
  notes: string[];
  exactZone?: SmcMtfExactZoneSnapshot;
}

export interface SmcMtfExactZoneSnapshot {
  schemaVersion: 1;
  usesExactObFvgZones: boolean;
  exactZoneCandidateId: string | null;
  exactZoneReadiness: string | null;
  exactZoneDataStatus: ExactZoneDataStatus;
  exactZoneSource: "MTF_OB_FVG_ZONE_MERGER_V1" | null;
  exactRawRR: number | null;
  exactNetRR: number | null;
  exactVsHeuristicDelta: number | null;
  wouldHaveFilledPending: true;
  warnings: string[];
}

export interface MtfObFvgShadowSnapshotSummary {
  available: boolean;
  totalShadowSamples: number;
  samplesWithRefinement: number;
  samplesWithNoData: number;
  averageCurrentRawRR: number | null;
  averageCurrentNetRR: number | null;
  averageRefinedRawRR: number | null;
  averageRefinedNetRR: number | null;
  averageRrImprovement: number | null;
  averageNetRrImprovement: number | null;
  passStaticCount: number;
  passNetCount: number;
  qualityScoreAverage: number | null;
  classificationCounts: Record<string, number>;
  dataStatusCounts: Record<string, number>;
  exactZoneSamples: number;
  exactZoneDataStatusCounts: Record<string, number>;
  exactZoneReadinessCounts: Record<string, number>;
  exactAvgNetRR: number | null;
  exactVsHeuristicAvgDelta: number | null;
  usesExactObFvgZonesCount: number;
  latestSnapshot: SmcMtfShadowSnapshot | null;
  sampleWarning: boolean;
}

const SUMMARY_MIN_SAMPLE = 50;

const fin = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

function round4(v: number): number {
  return Math.round(v * 10_000) / 10_000;
}

function finiteOrNull(v: unknown): number | null {
  return fin(v) ? round4(v) : null;
}

function cleanString(v: unknown, fallback: string | null = null): string | null {
  return typeof v === "string" && v.trim().length > 0 ? v.trim().slice(0, 80) : fallback;
}

function cleanIso(v: string): string {
  const t = Date.parse(v);
  return Number.isFinite(t) ? new Date(t).toISOString() : new Date(0).toISOString();
}

function cleanNotes(notes: unknown): string[] {
  if (!Array.isArray(notes)) return [];
  return notes.filter((n): n is string => typeof n === "string" && n.trim().length > 0).map((n) => n.trim().slice(0, 80)).slice(0, 8);
}

export function emptyMtfObFvgShadowSnapshotSummary(): MtfObFvgShadowSnapshotSummary {
  return {
    available: false,
    totalShadowSamples: 0,
    samplesWithRefinement: 0,
    samplesWithNoData: 0,
    averageCurrentRawRR: null,
    averageCurrentNetRR: null,
    averageRefinedRawRR: null,
    averageRefinedNetRR: null,
    averageRrImprovement: null,
    averageNetRrImprovement: null,
    passStaticCount: 0,
    passNetCount: 0,
    qualityScoreAverage: null,
    classificationCounts: {},
    dataStatusCounts: {},
    exactZoneSamples: 0,
    exactZoneDataStatusCounts: {},
    exactZoneReadinessCounts: {},
    exactAvgNetRR: null,
    exactVsHeuristicAvgDelta: null,
    usesExactObFvgZonesCount: 0,
    latestSnapshot: null,
    sampleWarning: true,
  };
}

export function buildRrSnapshot(result: RrDrilldownResult, capturedAt: string): RrSnapshot | null {
  if (!result.available || !fin(result.rawRR) || !fin(result.requiredRR)) return null;
  return {
    schemaVersion: 1,
    source: "rr-blocker-drilldown",
    capturedAt: cleanIso(capturedAt),
    currentRawRR: round4(result.rawRR),
    currentNetRR: finiteOrNull(result.netRR),
    requiredRR: round4(result.requiredRR),
    rrGap: finiteOrNull(result.rrGap),
    riskDistance: finiteOrNull(result.riskDistance),
    rewardDistance: finiteOrNull(result.rewardDistance),
    costR: finiteOrNull(result.costR),
    failSeverity: cleanString(result.failSeverity),
    reason: cleanString(result.reason),
  };
}

function buildExactZoneSnapshot(exactZone: ExactZoneShadowOutput | null | undefined): SmcMtfExactZoneSnapshot | undefined {
  if (!exactZone?.usesExactObFvgZones || !exactZone.mergedZoneCandidate || exactZone.mergedZoneCandidate.source !== "MTF_OB_FVG_ZONE_MERGER_V1") {
    return undefined;
  }
  return {
    schemaVersion: 1,
    usesExactObFvgZones: true,
    exactZoneCandidateId: cleanString(exactZone.mergedZoneCandidate.id),
    exactZoneReadiness: cleanString(exactZone.exactZoneReadiness),
    exactZoneDataStatus: exactZone.dataStatus,
    exactZoneSource: "MTF_OB_FVG_ZONE_MERGER_V1",
    exactRawRR: finiteOrNull(exactZone.exactRawRR),
    exactNetRR: finiteOrNull(exactZone.exactNetRR),
    exactVsHeuristicDelta: finiteOrNull(exactZone.exactVsHeuristicDelta),
    wouldHaveFilledPending: true,
    warnings: cleanNotes(exactZone.warnings),
  };
}

export function buildSmcMtfShadowSnapshot(
  result: MtfObFvgRefinementShadowResult,
  capturedAt: string,
  exactZone?: ExactZoneShadowOutput | null,
): SmcMtfShadowSnapshot {
  const dataStatus = cleanString(result.dataStatus, "INSUFFICIENT_DATA") ?? "INSUFFICIENT_DATA";
  const classification = cleanString(result.classification, "NO_DATA") ?? "NO_DATA";
  const notes = cleanNotes(result.notes);
  const exactZoneSnapshot = buildExactZoneSnapshot(exactZone);
  if (dataStatus === "HEURISTIC_ESTIMATE_ONLY" && !notes.includes("heuristic geometry estimate only")) {
    notes.push("heuristic geometry estimate only");
  }
  return {
    schemaVersion: 1,
    source: "mtf-ob-fvg-refinement-shadow",
    capturedAt: cleanIso(capturedAt),
    dataStatus,
    classification,
    qualityScore: fin(result.qualityScore) ? Math.max(0, Math.min(100, Math.round(result.qualityScore))) : 0,
    currentRawRR: finiteOrNull(result.currentRawRR),
    currentNetRR: finiteOrNull(result.currentNetRR),
    refinedRawRR: finiteOrNull(result.refinedRawRR),
    refinedNetRR: finiteOrNull(result.refinedNetRR),
    rrImprovement: finiteOrNull(result.rrImprovement),
    netRrImprovement: finiteOrNull(result.netRrImprovement),
    wouldPassStaticRR: typeof result.wouldPassStaticRR === "boolean" ? result.wouldPassStaticRR : null,
    wouldPassNetRR: typeof result.wouldPassNetRR === "boolean" ? result.wouldPassNetRR : null,
    requiredRR: finiteOrNull(result.requiredRR),
    shadowOnly: true,
    usesExactObFvgZones: exactZoneSnapshot?.usesExactObFvgZones === true || dataStatus === "ACTUAL_OB_FVG_AVAILABLE",
    notes,
    ...(exactZoneSnapshot ? { exactZone: exactZoneSnapshot } : {}),
  };
}

function validExactZoneDataStatus(v: unknown): v is ExactZoneDataStatus {
  return (
    v === "HEURISTIC_ESTIMATE_ONLY" ||
    v === "EXACT_FVG_ONLY" ||
    v === "EXACT_OB_ONLY" ||
    v === "EXACT_OB_FVG_CONFLUENCE" ||
    v === "MTF_EXACT_ZONE_ALIGNED" ||
    v === "EXACT_ZONE_NO_DATA" ||
    v === "EXACT_ZONE_CONFLICT"
  );
}

function parseExactZoneSnapshot(raw: unknown): SmcMtfExactZoneSnapshot | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  if (o.schemaVersion !== 1 || o.usesExactObFvgZones !== true || !validExactZoneDataStatus(o.exactZoneDataStatus)) return undefined;
  return {
    schemaVersion: 1,
    usesExactObFvgZones: true,
    exactZoneCandidateId: cleanString(o.exactZoneCandidateId),
    exactZoneReadiness: cleanString(o.exactZoneReadiness),
    exactZoneDataStatus: o.exactZoneDataStatus,
    exactZoneSource: o.exactZoneSource === "MTF_OB_FVG_ZONE_MERGER_V1" ? "MTF_OB_FVG_ZONE_MERGER_V1" : null,
    exactRawRR: finiteOrNull(o.exactRawRR),
    exactNetRR: finiteOrNull(o.exactNetRR),
    exactVsHeuristicDelta: finiteOrNull(o.exactVsHeuristicDelta),
    wouldHaveFilledPending: true,
    warnings: cleanNotes(o.warnings),
  };
}

function parseSmcMtfShadowSnapshot(raw: unknown): SmcMtfShadowSnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (o.source !== "mtf-ob-fvg-refinement-shadow" || o.schemaVersion !== 1) return null;
  const capturedAt = cleanString(o.capturedAt);
  const dataStatus = cleanString(o.dataStatus);
  const classification = cleanString(o.classification);
  if (!capturedAt || !dataStatus || !classification) return null;
  const exactZone = parseExactZoneSnapshot(o.exactZone);
  return {
    schemaVersion: 1,
    source: "mtf-ob-fvg-refinement-shadow",
    capturedAt: cleanIso(capturedAt),
    dataStatus,
    classification,
    qualityScore: fin(o.qualityScore) ? Math.max(0, Math.min(100, Math.round(o.qualityScore))) : 0,
    currentRawRR: finiteOrNull(o.currentRawRR),
    currentNetRR: finiteOrNull(o.currentNetRR),
    refinedRawRR: finiteOrNull(o.refinedRawRR),
    refinedNetRR: finiteOrNull(o.refinedNetRR),
    rrImprovement: finiteOrNull(o.rrImprovement),
    netRrImprovement: finiteOrNull(o.netRrImprovement),
    wouldPassStaticRR: typeof o.wouldPassStaticRR === "boolean" ? o.wouldPassStaticRR : null,
    wouldPassNetRR: typeof o.wouldPassNetRR === "boolean" ? o.wouldPassNetRR : null,
    requiredRR: finiteOrNull(o.requiredRR),
    shadowOnly: true,
    usesExactObFvgZones: o.usesExactObFvgZones === true || exactZone?.usesExactObFvgZones === true,
    notes: cleanNotes(o.notes),
    ...(exactZone ? { exactZone } : {}),
  };
}

function avg(values: Array<number | null>): number | null {
  const nums = values.filter((v): v is number => fin(v));
  if (!nums.length) return null;
  return round4(nums.reduce((sum, v) => sum + v, 0) / nums.length);
}

export function summarizeMtfObFvgShadowSnapshots(records: Array<{ smcMtfShadowSnapshot?: unknown }>): MtfObFvgShadowSnapshotSummary {
  const snapshots = records.map((r) => parseSmcMtfShadowSnapshot(r.smcMtfShadowSnapshot)).filter((s): s is SmcMtfShadowSnapshot => s != null);
  if (!snapshots.length) return emptyMtfObFvgShadowSnapshotSummary();

  const classificationCounts: Record<string, number> = {};
  const dataStatusCounts: Record<string, number> = {};
  const exactZoneDataStatusCounts: Record<string, number> = {};
  const exactZoneReadinessCounts: Record<string, number> = {};
  let latestSnapshot = snapshots[0]!;
  for (const s of snapshots) {
    classificationCounts[s.classification] = (classificationCounts[s.classification] ?? 0) + 1;
    dataStatusCounts[s.dataStatus] = (dataStatusCounts[s.dataStatus] ?? 0) + 1;
    if (s.exactZone) {
      exactZoneDataStatusCounts[s.exactZone.exactZoneDataStatus] = (exactZoneDataStatusCounts[s.exactZone.exactZoneDataStatus] ?? 0) + 1;
      const readiness = s.exactZone.exactZoneReadiness ?? "UNKNOWN";
      exactZoneReadinessCounts[readiness] = (exactZoneReadinessCounts[readiness] ?? 0) + 1;
    }
    if (Date.parse(s.capturedAt) >= Date.parse(latestSnapshot.capturedAt)) latestSnapshot = s;
  }
  const exactSnapshots = snapshots.filter((s) => s.exactZone != null);

  return {
    available: true,
    totalShadowSamples: snapshots.length,
    samplesWithRefinement: snapshots.filter((s) => fin(s.rrImprovement) && s.rrImprovement > 0).length,
    samplesWithNoData: snapshots.filter((s) => s.classification === "NO_DATA" || s.dataStatus === "INSUFFICIENT_DATA").length,
    averageCurrentRawRR: avg(snapshots.map((s) => s.currentRawRR)),
    averageCurrentNetRR: avg(snapshots.map((s) => s.currentNetRR)),
    averageRefinedRawRR: avg(snapshots.map((s) => s.refinedRawRR)),
    averageRefinedNetRR: avg(snapshots.map((s) => s.refinedNetRR)),
    averageRrImprovement: avg(snapshots.map((s) => s.rrImprovement)),
    averageNetRrImprovement: avg(snapshots.map((s) => s.netRrImprovement)),
    passStaticCount: snapshots.filter((s) => s.wouldPassStaticRR === true).length,
    passNetCount: snapshots.filter((s) => s.wouldPassNetRR === true).length,
    qualityScoreAverage: avg(snapshots.map((s) => s.qualityScore)),
    classificationCounts,
    dataStatusCounts,
    exactZoneSamples: exactSnapshots.length,
    exactZoneDataStatusCounts,
    exactZoneReadinessCounts,
    exactAvgNetRR: avg(exactSnapshots.map((s) => s.exactZone?.exactNetRR ?? null)),
    exactVsHeuristicAvgDelta: avg(exactSnapshots.map((s) => s.exactZone?.exactVsHeuristicDelta ?? null)),
    usesExactObFvgZonesCount: snapshots.filter((s) => s.usesExactObFvgZones === true).length,
    latestSnapshot,
    sampleWarning: snapshots.length < SUMMARY_MIN_SAMPLE,
  };
}
