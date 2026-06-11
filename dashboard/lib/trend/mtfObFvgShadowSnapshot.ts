// dashboard/lib/trend/mtfObFvgShadowSnapshot.ts
// Phase T-3H-6-c1 - sanitized RR + MTF OB/FVG shadow snapshots.
//
// SAFETY:
//   - Pure helpers only. No I/O, no env reads, no decision-path imports.
//   - Snapshot data is observability-only and must never feed entry decisions.

import type { RrDrilldownResult } from "./rrBlockerDrilldown.ts";
import type { MtfObFvgRefinementShadowResult } from "./mtfObFvgRefinementShadow.ts";

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

export function buildSmcMtfShadowSnapshot(result: MtfObFvgRefinementShadowResult, capturedAt: string): SmcMtfShadowSnapshot {
  const dataStatus = cleanString(result.dataStatus, "INSUFFICIENT_DATA") ?? "INSUFFICIENT_DATA";
  const classification = cleanString(result.classification, "NO_DATA") ?? "NO_DATA";
  const notes = cleanNotes(result.notes);
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
    usesExactObFvgZones: dataStatus === "ACTUAL_OB_FVG_AVAILABLE",
    notes,
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
    usesExactObFvgZones: o.usesExactObFvgZones === true,
    notes: cleanNotes(o.notes),
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
  let latestSnapshot = snapshots[0]!;
  for (const s of snapshots) {
    classificationCounts[s.classification] = (classificationCounts[s.classification] ?? 0) + 1;
    dataStatusCounts[s.dataStatus] = (dataStatusCounts[s.dataStatus] ?? 0) + 1;
    if (Date.parse(s.capturedAt) >= Date.parse(latestSnapshot.capturedAt)) latestSnapshot = s;
  }

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
    latestSnapshot,
    sampleWarning: snapshots.length < SUMMARY_MIN_SAMPLE,
  };
}
