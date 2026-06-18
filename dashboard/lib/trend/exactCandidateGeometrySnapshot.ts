// dashboard/lib/trend/exactCandidateGeometrySnapshot.ts
// D7.3 - exact candidate geometry snapshot builder.
//
// SAFETY:
//   - Pure helper only. No I/O, no env reads, no network, no runtime writes.
//   - Observability-only. Review-only/shadow-only. Never enables paper, live, or order action.

export type ExactCandidateGeometryFreshness = "FRESH" | "STALE" | "MISSING" | "UNKNOWN";
export type ExactCandidateDirection = "LONG" | "SHORT" | "UNKNOWN";
export type ExactCandidateZoneType = "EXACT_OB" | "EXACT_FVG" | "OB_FVG_OVERLAP" | "FVG_ONLY" | "HEURISTIC" | "UNKNOWN";
export type ExactCandidateDataStatus =
  | "EXACT_ZONE_AVAILABLE"
  | "EXACT_ZONE_CONFLICT"
  | "EXACT_FVG_ONLY"
  | "HEURISTIC_ESTIMATE_ONLY"
  | "INSUFFICIENT_DATA";
export type ExactCandidateReadiness =
  | "READY"
  | "TARGET_TOO_CLOSE"
  | "COST_TOO_HIGH"
  | "CONFLICTING_MTF"
  | "FVG_ONLY"
  | "NO_GEOMETRY"
  | "UNKNOWN";

export interface ExactCandidateGeometrySnapshot {
  schemaVersion: 1;
  source: "EXACT_CANDIDATE_GEOMETRY_SNAPSHOT_V1";
  capturedAt: string;
  currentPrice: number | null;
  priceSource: string | null;
  latestCandleAt: string | null;
  freshnessStatus: ExactCandidateGeometryFreshness;
  candidates: ExactCandidateGeometry[];
  summary: {
    totalCandidates: number;
    structuredGeometryCount: number;
    missingGeometryCount: number;
    exactCount: number;
    fvgOnlyCount: number;
    targetTooCloseCount: number;
    costTooHighCount: number;
    conflictCount: number;
  };
  safety: {
    reviewOnly: true;
    shadowOnly: true;
    activationAllowed: false;
    paperActivationAllowed: false;
    liveActivationAllowed: false;
    orderAllowed: false;
  };
}

export interface ExactCandidateGeometry {
  id: string;
  direction: ExactCandidateDirection;
  zoneType: ExactCandidateZoneType;
  dataStatus: ExactCandidateDataStatus;
  readiness: ExactCandidateReadiness;
  entry: number | null;
  entryLow: number | null;
  entryHigh: number | null;
  stopLoss: number | null;
  invalidation: number | null;
  target1: number | null;
  target2: number | null;
  rawRR: number | null;
  netRR: number | null;
  requiredRR: number | null;
  distanceToEntryPct: number | null;
  targetDistancePct: number | null;
  stopDistancePct: number | null;
  costPct: number | null;
  feePct: number | null;
  slippagePct: number | null;
  htfBias: "BULLISH" | "BEARISH" | "RANGE" | "NO_TRADE" | "UNKNOWN";
  timeframeSource: string[];
  evidenceSource: string[];
  flags: string[];
  notes: string[];
}

export interface ExactCandidateGeometrySnapshotInput {
  capturedAt?: unknown;
  currentPriceContext?: unknown;
  smcMtfShadowSnapshot?: unknown;
  exactZoneComparisonSummary?: unknown;
}

const SOURCE = "EXACT_CANDIDATE_GEOMETRY_SNAPSHOT_V1" as const;

function obj(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function strArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}

function firstNumber(...values: unknown[]): number | null {
  for (const value of values) {
    const n = num(value);
    if (n != null) return n;
  }
  return null;
}

function cleanIso(value: unknown): string {
  const s = str(value);
  if (!s) return new Date(0).toISOString();
  const parsed = Date.parse(s);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : new Date(0).toISOString();
}

function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function pctDistance(from: number | null, to: number | null): number | null {
  if (from == null || to == null || from <= 0) return null;
  return round4(Math.abs(to - from) / from * 100);
}

function distanceToEntry(currentPrice: number | null, entry: number | null, entryLow: number | null, entryHigh: number | null): number | null {
  if (currentPrice == null || currentPrice <= 0) return null;
  const low = entryLow ?? entry;
  const high = entryHigh ?? entry;
  if (low == null || high == null) return null;
  if (currentPrice >= low && currentPrice <= high) return 0;
  const nearest = currentPrice < low ? low : high;
  return pctDistance(currentPrice, nearest);
}

function freshness(value: unknown): ExactCandidateGeometryFreshness {
  return value === "FRESH" || value === "STALE" || value === "MISSING" || value === "UNKNOWN" ? value : "UNKNOWN";
}

function direction(value: unknown): ExactCandidateDirection {
  const s = str(value)?.toUpperCase();
  return s === "LONG" || s === "SHORT" ? s : "UNKNOWN";
}

function htfBias(value: unknown): ExactCandidateGeometry["htfBias"] {
  if (value === "BULLISH" || value === "BEARISH") return value;
  if (value === "NEUTRAL" || value === "RANGE") return "RANGE";
  if (value === "NO_TRADE") return "NO_TRADE";
  return "UNKNOWN";
}

function zoneType(dataStatus: unknown): ExactCandidateZoneType {
  if (dataStatus === "EXACT_OB_ONLY") return "EXACT_OB";
  if (dataStatus === "EXACT_FVG_ONLY") return "EXACT_FVG";
  if (dataStatus === "EXACT_OB_FVG_CONFLUENCE" || dataStatus === "MTF_EXACT_ZONE_ALIGNED") return "OB_FVG_OVERLAP";
  if (dataStatus === "HEURISTIC_ESTIMATE_ONLY") return "HEURISTIC";
  return "UNKNOWN";
}

function dataStatus(value: unknown): ExactCandidateDataStatus {
  if (value === "EXACT_ZONE_CONFLICT") return "EXACT_ZONE_CONFLICT";
  if (value === "EXACT_FVG_ONLY") return "EXACT_FVG_ONLY";
  if (value === "HEURISTIC_ESTIMATE_ONLY") return "HEURISTIC_ESTIMATE_ONLY";
  if (value === "EXACT_ZONE_NO_DATA" || value == null) return "INSUFFICIENT_DATA";
  if (value === "EXACT_OB_ONLY" || value === "EXACT_OB_FVG_CONFLUENCE" || value === "MTF_EXACT_ZONE_ALIGNED") return "EXACT_ZONE_AVAILABLE";
  return "INSUFFICIENT_DATA";
}

function readiness(value: unknown): ExactCandidateReadiness {
  if (value === "TARGET_TOO_CLOSE" || value === "COST_TOO_HIGH" || value === "CONFLICTING_MTF") return value;
  if (value === "FVG_ONLY") return "FVG_ONLY";
  if (value === "NO_DATA" || value === "NO_GEOMETRY") return "NO_GEOMETRY";
  if (value === "MTF_ALIGNED" || value === "READY") return "READY";
  return "UNKNOWN";
}

function emptySnapshot(input: ExactCandidateGeometrySnapshotInput, missingGeometryCount = 0): ExactCandidateGeometrySnapshot {
  const context = obj(input.currentPriceContext);
  return {
    schemaVersion: 1,
    source: SOURCE,
    capturedAt: cleanIso(input.capturedAt),
    currentPrice: firstNumber(context.currentPrice, context.value),
    priceSource: str(context.priceSource ?? context.source) ?? "not_available_at_snapshot_build",
    latestCandleAt: str(context.latestCandleAt),
    freshnessStatus: freshness(context.freshnessStatus),
    candidates: [],
    summary: {
      totalCandidates: 0,
      structuredGeometryCount: 0,
      missingGeometryCount,
      exactCount: 0,
      fvgOnlyCount: 0,
      targetTooCloseCount: 0,
      costTooHighCount: 0,
      conflictCount: 0,
    },
    safety: {
      reviewOnly: true,
      shadowOnly: true,
      activationAllowed: false,
      paperActivationAllowed: false,
      liveActivationAllowed: false,
      orderAllowed: false,
    },
  };
}

function buildCandidate(input: ExactCandidateGeometrySnapshotInput, index: number): ExactCandidateGeometry | null {
  const snapshot = obj(input.smcMtfShadowSnapshot);
  const exactZone = obj(snapshot.exactZone);
  if (!Object.keys(snapshot).length || !Object.keys(exactZone).length) return null;
  const fill = obj(exactZone.fillResolutionInput);
  const setup = obj(exactZone.setupContext);
  const context = obj(input.currentPriceContext);
  const currentPrice = firstNumber(context.currentPrice, context.value);
  const candidateDirection = direction(fill.direction);
  const entry = firstNumber(fill.entry);
  const invalidation = firstNumber(fill.invalidation);
  const target = firstNumber(fill.target);
  const flags = [
    ...strArray(exactZone.warnings),
  ];
  if (candidateDirection === "UNKNOWN" || entry == null || invalidation == null || target == null) {
    flags.push("MISSING_GEOMETRY_INPUT");
  }
  const zType = zoneType(exactZone.exactZoneDataStatus);
  const ready = readiness(exactZone.exactZoneReadiness);
  const feePct = firstNumber(context.feePct, exactZone.feePct);
  const slippagePct = firstNumber(context.slippagePct, exactZone.slippagePct);
  const costPct = firstNumber(context.costPct, exactZone.costPct) ?? (feePct != null || slippagePct != null ? round4((feePct ?? 0) + (slippagePct ?? 0)) : null);
  const id = str(exactZone.exactZoneCandidateId) ?? `exact:${candidateDirection}:${zType}:${cleanIso(input.capturedAt)}:${index}`;
  return {
    id,
    direction: candidateDirection,
    zoneType: zType,
    dataStatus: dataStatus(exactZone.exactZoneDataStatus),
    readiness: ready,
    entry,
    entryLow: null,
    entryHigh: null,
    stopLoss: invalidation,
    invalidation,
    target1: target,
    target2: null,
    rawRR: firstNumber(exactZone.exactRawRR),
    netRR: firstNumber(exactZone.exactNetRR),
    requiredRR: firstNumber(snapshot.requiredRR),
    distanceToEntryPct: distanceToEntry(currentPrice, entry, null, null),
    targetDistancePct: pctDistance(currentPrice, target),
    stopDistancePct: pctDistance(currentPrice, invalidation),
    costPct,
    feePct,
    slippagePct,
    htfBias: htfBias(setup.canonicalDirection),
    timeframeSource: str(fill.timeframe) ? [str(fill.timeframe)!] : [],
    evidenceSource: ["smcMtfShadowSnapshot.exactZone.fillResolutionInput"],
    flags,
    notes: strArray(snapshot.notes),
  };
}

function aggregateMissingCount(input: ExactCandidateGeometrySnapshotInput): number {
  const exact = obj(input.exactZoneComparisonSummary);
  const exactSamples = num(exact.exactSamples);
  return exactSamples != null && exactSamples > 0 ? Math.floor(exactSamples) : 0;
}

export function buildExactCandidateGeometrySnapshot(input: ExactCandidateGeometrySnapshotInput = {}): ExactCandidateGeometrySnapshot {
  const candidate = buildCandidate(input, 1);
  if (!candidate) return emptySnapshot(input, aggregateMissingCount(input));
  const structured = !candidate.flags.includes("MISSING_GEOMETRY_INPUT");
  const base = emptySnapshot(input, structured ? 0 : 1);
  const candidates = structured ? [candidate] : [candidate];
  return {
    ...base,
    candidates,
    summary: {
      totalCandidates: candidates.length,
      structuredGeometryCount: structured ? 1 : 0,
      missingGeometryCount: structured ? 0 : 1,
      exactCount: candidate.dataStatus === "EXACT_ZONE_AVAILABLE" || candidate.dataStatus === "EXACT_ZONE_CONFLICT" || candidate.dataStatus === "EXACT_FVG_ONLY" ? 1 : 0,
      fvgOnlyCount: candidate.zoneType === "EXACT_FVG" || candidate.zoneType === "FVG_ONLY" ? 1 : 0,
      targetTooCloseCount: candidate.readiness === "TARGET_TOO_CLOSE" ? 1 : 0,
      costTooHighCount: candidate.readiness === "COST_TOO_HIGH" ? 1 : 0,
      conflictCount: candidate.readiness === "CONFLICTING_MTF" || candidate.dataStatus === "EXACT_ZONE_CONFLICT" ? 1 : 0,
    },
  };
}

export function summarizeExactCandidateGeometrySnapshots(records: Array<{ exactCandidateGeometrySnapshot?: unknown; smcMtfShadowSnapshot?: unknown }>): ExactCandidateGeometrySnapshot {
  const candidates: ExactCandidateGeometry[] = [];
  let latestCapturedAt = new Date(0).toISOString();
  let latestSnapshot: ExactCandidateGeometrySnapshot | null = null;
  let missingGeometryCount = 0;
  for (const record of records) {
    const rawSnapshot = obj(record.exactCandidateGeometrySnapshot);
    const snapshot = Object.keys(rawSnapshot).length
      ? rawSnapshot as unknown as ExactCandidateGeometrySnapshot
      : buildExactCandidateGeometrySnapshot({ capturedAt: obj(record.smcMtfShadowSnapshot).capturedAt, smcMtfShadowSnapshot: record.smcMtfShadowSnapshot });
    const capturedAt = str(obj(snapshot).capturedAt) ?? new Date(0).toISOString();
    if (Date.parse(capturedAt) >= Date.parse(latestCapturedAt)) {
      latestCapturedAt = capturedAt;
      latestSnapshot = snapshot;
    }
    const snapshotCandidates = Array.isArray(obj(snapshot).candidates) ? obj(snapshot).candidates as ExactCandidateGeometry[] : [];
    candidates.push(...snapshotCandidates);
    const summary = obj(obj(snapshot).summary);
    const missing = num(summary.missingGeometryCount);
    if (missing != null) missingGeometryCount += missing;
  }
  if (!latestSnapshot && !candidates.length) return emptySnapshot({ capturedAt: new Date(0).toISOString() });
  const latest = latestSnapshot ?? emptySnapshot({ capturedAt: latestCapturedAt });
  return {
    ...latest,
    candidates,
    summary: {
      totalCandidates: candidates.length,
      structuredGeometryCount: candidates.filter((candidate) => !candidate.flags.includes("MISSING_GEOMETRY_INPUT")).length,
      missingGeometryCount,
      exactCount: candidates.filter((candidate) => candidate.dataStatus === "EXACT_ZONE_AVAILABLE" || candidate.dataStatus === "EXACT_ZONE_CONFLICT" || candidate.dataStatus === "EXACT_FVG_ONLY").length,
      fvgOnlyCount: candidates.filter((candidate) => candidate.zoneType === "EXACT_FVG" || candidate.zoneType === "FVG_ONLY").length,
      targetTooCloseCount: candidates.filter((candidate) => candidate.readiness === "TARGET_TOO_CLOSE").length,
      costTooHighCount: candidates.filter((candidate) => candidate.readiness === "COST_TOO_HIGH").length,
      conflictCount: candidates.filter((candidate) => candidate.readiness === "CONFLICTING_MTF" || candidate.dataStatus === "EXACT_ZONE_CONFLICT").length,
    },
  };
}
