// dashboard/lib/trend/currentPriceEligibleExactSubset.ts
// D7.2 - current-price eligible exact subset analyzer.
//
// SAFETY:
//   - Pure helper only. No I/O, no env reads, no network, no runtime writes.
//   - Diagnostics-only. Review-only/shadow-only. Never enables paper or live action.

export type CurrentPriceEligibleExactSubsetStatus =
  | "NO_DATA"
  | "STALE_REEVALUATION_REQUIRED"
  | "GEOMETRY_INPUTS_MISSING"
  | "NO_CURRENT_PRICE_ELIGIBLE_CANDIDATES"
  | "CURRENT_PRICE_ELIGIBLE_DEGRADED"
  | "CLEAN_SUBSET_FOUND_REVIEW_ONLY"
  | "CLEAN_SUBSET_REVIEW_READY_NOT_ACTIVATION";

export type CurrentPriceEligibleCandidateStatus =
  | "NEAR_ENTRY"
  | "INSIDE_ENTRY_ZONE"
  | "MISSED"
  | "INVALIDATED"
  | "TARGET_TOO_CLOSE"
  | "COST_TOO_HIGH"
  | "STALE"
  | "CLEAN_REVIEW_ONLY";

export type CurrentPriceCandidatePriceStatus =
  | "INSIDE_ENTRY_ZONE"
  | "NEAR_ENTRY"
  | "WAITING_PULLBACK_TO_ENTRY"
  | "PRICE_MOVED_AWAY_FROM_ENTRY"
  | "ALREADY_INVALIDATED"
  | "PAST_TARGET"
  | "UNKNOWN";

export type CurrentPriceCandidateQualityStatus =
  | "CLEAN"
  | "TARGET_TOO_CLOSE"
  | "COST_TOO_HIGH"
  | "CONFLICTING_MTF"
  | "FVG_ONLY"
  | "MISSING_GEOMETRY"
  | "UNKNOWN";

export type CurrentPriceCandidateMoveDirection =
  | "UP_TO_ENTRY"
  | "DOWN_TO_ENTRY"
  | "INSIDE_ENTRY"
  | "UNKNOWN";

export interface CurrentPriceEligibleExactSubset {
  schemaVersion: 1;
  source: "CURRENT_PRICE_ELIGIBLE_EXACT_SUBSET_V1";
  status: CurrentPriceEligibleExactSubsetStatus;
  readiness: "REVIEW_NOT_ACTIVATION";
  activationAllowed: false;
  paperActivationAllowed: false;
  liveActivationAllowed: false;
  reviewOnly: true;
  shadowOnly: true;
  currentPrice: {
    value: number | null;
    source: string | null;
    latestCandleAt: string | null;
    freshnessStatus: "FRESH" | "STALE" | "MISSING" | "UNKNOWN";
    ageSeconds: number | null;
  };
  sampleAccounting: {
    lifetimeExactSamples: number | null;
    windowExactSamples: number | null;
    currentPriceEligibleExactSamples: number | null;
    cleanCurrentPriceEligibleSamples: number | null;
    geometryInputSamples: number | null;
    geometryMissingSamples: number | null;
  };
  eligibilityFilters: {
    totalCandidates: number;
    freshCandidates: number;
    currentPriceInsideOrNearEntry: number;
    missedCandidates: number;
    invalidatedCandidates: number;
    targetTooCloseCandidates: number;
    costTooHighCandidates: number;
    cleanCandidates: number;
  };
  cleanSubsetGate: {
    status: "NOT_READY" | "PARTIAL" | "REVIEW_READY_NOT_ACTIVATION";
    passed: string[];
    failed: string[];
    thresholds: {
      minCleanEligibleCandidates: 10;
      maxTargetTooCloseRate: 0.4;
      maxMissedFillRate: 0.5;
      minEntryTouchRate: 0.35;
      minTargetAfterTouchRate: 0.25;
      maxInvalidationAfterTouchRate: 0.5;
      requireFreshCurrentPrice: true;
      requireStructuredGeometry: true;
    };
  };
  topCandidates: Array<{
    id: string;
    direction: "LONG" | "SHORT" | "UNKNOWN";
    zoneType?: string | null;
    readiness?: string | null;
    status: CurrentPriceEligibleCandidateStatus;
    currentPriceStatus: CurrentPriceCandidatePriceStatus;
    qualityStatus: CurrentPriceCandidateQualityStatus;
    entry: number | null;
    entryLow: number | null;
    entryHigh: number | null;
    stopLoss: number | null;
    target1: number | null;
    target2: number | null;
    netRR: number | null;
    distanceToEntryPct: number | null;
    distanceToEntryAbs: number | null;
    priceMoveRequiredDirection: CurrentPriceCandidateMoveDirection;
    occurrenceCount: number;
    flags?: string[];
    reason: string;
  }>;
  dedupSummary: {
    rawCandidates: number;
    uniqueCandidates: number;
    duplicateCandidates: number;
  };
  priceSourceAudit: {
    subsetPriceSource: string | null;
    snapshotPriceSource: string | null;
    subsetCurrentPrice: number | null;
    snapshotCurrentPrice: number | null;
    priceSourceConsistent: boolean;
    notes: string[];
  };
  requiredGeometryInputs: string[];
  warnings: string[];
  nextAction: string;
}

export interface CurrentPriceEligibleExactSubsetInput {
  mtfEntryCandidatePipeline?: unknown;
  mtfExactZoneFailureAttribution?: unknown;
  currentPriceContext?: unknown;
  currentCandidateReevaluation?: unknown;
  exactZoneComparisonSummary?: unknown;
  exactCandidateGeometrySnapshot?: unknown;
  mtfObFvgShadowSummary?: unknown;
  shadowOutcomeSummary?: unknown;
  exactCandidateRecords?: unknown;
  exactCandidates?: unknown;
  candidateRecords?: unknown;
}

interface CandidateGeometry {
  id: string;
  direction: "LONG" | "SHORT" | "UNKNOWN";
  entry: number | null;
  entryLow: number | null;
  entryHigh: number | null;
  stopLoss: number | null;
  target1: number | null;
  target2: number | null;
  netRR: number | null;
  capturedAt: string | null;
  zoneType: string | null;
  readiness: string | null;
  timeframeSource: string[];
  costTooHigh: boolean;
  targetTooClose: boolean;
  warnings: string[];
  flags: string[];
  occurrenceCount: number;
}

const SOURCE = "CURRENT_PRICE_ELIGIBLE_EXACT_SUBSET_V1" as const;
const REQUIRED_GEOMETRY_INPUTS = [
  "direction",
  "entryLow/entryHigh or entry",
  "stopLoss or invalidation",
  "target1 or target",
  "netRR or exactNetRR",
];
const THRESHOLDS = {
  minCleanEligibleCandidates: 10,
  maxTargetTooCloseRate: 0.4,
  maxMissedFillRate: 0.5,
  minEntryTouchRate: 0.35,
  minTargetAfterTouchRate: 0.25,
  maxInvalidationAfterTouchRate: 0.5,
  requireFreshCurrentPrice: true,
  requireStructuredGeometry: true,
} as const;
const MIN_NET_RR = 1.2;
const NEAR_ENTRY_PCT = 0.25;
const TARGET_TOO_CLOSE_PCT = 0.25;
const CANDIDATE_STALE_SECONDS = 45 * 60;

function obj(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function arr(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function bool(value: unknown): boolean {
  return value === true;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function textArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}

function firstNumber(...values: unknown[]): number | null {
  for (const value of values) {
    const n = num(value);
    if (n != null) return n;
  }
  return null;
}

function firstText(...values: unknown[]): string | null {
  for (const value of values) {
    const s = text(value);
    if (s) return s;
  }
  return null;
}

function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function roundKey(value: number | null): string {
  return value == null ? "" : String(Math.round(value * 100) / 100);
}

function pctDistance(price: number, low: number | null, high: number | null, entry: number | null): number | null {
  const anchorLow = low ?? entry;
  const anchorHigh = high ?? entry;
  if (anchorLow == null || anchorHigh == null || price <= 0) return null;
  if (price >= anchorLow && price <= anchorHigh) return 0;
  const nearest = price < anchorLow ? anchorLow : anchorHigh;
  return round4(Math.abs(price - nearest) / price * 100);
}

function absDistance(price: number, low: number | null, high: number | null, entry: number | null): number | null {
  const anchorLow = low ?? entry;
  const anchorHigh = high ?? entry;
  if (anchorLow == null || anchorHigh == null || price <= 0) return null;
  if (price >= anchorLow && price <= anchorHigh) return 0;
  const nearest = price < anchorLow ? anchorLow : anchorHigh;
  return round2(Math.abs(price - nearest));
}

function rate(count: number, total: number): number | null {
  return total > 0 ? round4(count / total) : null;
}

function normalizeDirection(value: unknown): "LONG" | "SHORT" | "UNKNOWN" {
  const s = text(value)?.toUpperCase();
  return s === "LONG" || s === "SHORT" ? s : "UNKNOWN";
}

function freshnessStatus(value: unknown): CurrentPriceEligibleExactSubset["currentPrice"]["freshnessStatus"] {
  return value === "FRESH" || value === "STALE" || value === "MISSING" || value === "UNKNOWN" ? value : "UNKNOWN";
}

function candidateFromRaw(rawValue: unknown, fallbackId: string): CandidateGeometry | null {
  const raw = obj(rawValue);
  if (!Object.keys(raw).length) return null;
  const exactZone = obj(raw.exactZone);
  const fill = obj(exactZone.fillResolutionInput ?? raw.fillResolutionInput);
  const setup = obj(raw.setupContext);
  const warnings = [
    ...textArray(raw.warnings),
    ...textArray(exactZone.warnings),
  ];
  const flags = [
    ...textArray(raw.flags),
    ...warnings,
  ];
  const direction = normalizeDirection(fill.direction ?? raw.direction ?? exactZone.direction ?? setup.direction);
  const entryLow = firstNumber(raw.entryLow, raw.exactZoneLow, raw.obLow, raw.fvgLow, exactZone.entryLow, exactZone.exactZoneLow, exactZone.obLow, exactZone.fvgLow);
  const entryHigh = firstNumber(raw.entryHigh, raw.exactZoneHigh, raw.obHigh, raw.fvgHigh, exactZone.entryHigh, exactZone.exactZoneHigh, exactZone.obHigh, exactZone.fvgHigh);
  const entry = firstNumber(fill.entry, raw.entry, raw.refinedEntry, raw.entryPrice, exactZone.entry, exactZone.refinedEntry, exactZone.entryPrice);
  const stopLoss = firstNumber(fill.invalidation, raw.stopLoss, raw.invalidation, raw.invalidationPrice, raw.refinedStop, exactZone.stopLoss, exactZone.invalidation, exactZone.invalidationPrice, exactZone.refinedStop);
  const target1 = firstNumber(fill.target, raw.target1, raw.target, raw.targetPrice, raw.refinedTarget, exactZone.target1, exactZone.target, exactZone.targetPrice, exactZone.refinedTarget, exactZone.takeProfit1);
  const target2 = firstNumber(raw.target2, exactZone.target2, exactZone.takeProfit2);
  const netRR = firstNumber(raw.netRR, raw.exactNetRR, raw.currentNetRR, raw.refinedNetRR, exactZone.exactNetRR, exactZone.netRR);
  const id = firstText(raw.id, raw.candidateId, raw.exactZoneCandidateId, exactZone.id, exactZone.candidateId, exactZone.exactZoneCandidateId) ?? fallbackId;
  return {
    id,
    direction,
    entry,
    entryLow,
    entryHigh,
    stopLoss,
    target1,
    target2,
    netRR,
    capturedAt: firstText(raw.capturedAt, fill.capturedAt, exactZone.capturedAt),
    zoneType: firstText(raw.zoneType, exactZone.zoneType),
    readiness: firstText(raw.readiness, raw.exactZoneReadiness, exactZone.readiness, exactZone.exactZoneReadiness),
    timeframeSource: [
      ...textArray(raw.timeframeSource),
      ...textArray(exactZone.timeframeSource),
      ...[firstText(raw.timeframe, fill.timeframe, exactZone.timeframe)].filter((item): item is string => item != null),
    ],
    costTooHigh: bool(raw.costTooHigh) || flags.includes("COST_TOO_HIGH") || text(raw.readiness ?? raw.exactZoneReadiness ?? exactZone.exactZoneReadiness) === "COST_TOO_HIGH",
    targetTooClose: bool(raw.targetTooClose) || flags.includes("TARGET_TOO_CLOSE") || text(raw.readiness ?? raw.exactZoneReadiness ?? exactZone.exactZoneReadiness) === "TARGET_TOO_CLOSE",
    warnings,
    flags,
    occurrenceCount: 1,
  };
}

function candidateDedupKey(candidate: CandidateGeometry): string {
  const timeframe = candidate.timeframeSource.length ? candidate.timeframeSource.join("+") : "UNKNOWN_TF";
  const entryKey = roundKey(candidate.entry ?? candidate.entryLow ?? candidate.entryHigh);
  return [
    candidate.direction,
    timeframe,
    candidate.zoneType ?? "UNKNOWN_ZONE",
    entryKey,
    roundKey(candidate.stopLoss),
    roundKey(candidate.target1),
    candidate.readiness ?? "UNKNOWN_READINESS",
  ].join("|");
}

function collectCandidateRecords(input: CurrentPriceEligibleExactSubsetInput): CandidateGeometry[] {
  const exact = obj(input.exactZoneComparisonSummary);
  const geometrySnapshot = obj(input.exactCandidateGeometrySnapshot);
  const mtf = obj(input.mtfObFvgShadowSummary);
  const latest = obj(mtf.latestSnapshot);
  const rawCandidates = [
    ...arr(geometrySnapshot.candidates),
    ...arr(input.exactCandidateRecords),
    ...arr(input.exactCandidates),
    ...arr(input.candidateRecords),
    ...arr(exact.exactCandidateRecords),
    ...arr(exact.exactCandidates),
    ...arr(exact.candidateRecords),
  ];
  const objectCandidates = [
    exact.topCleanCandidate,
    exact.exactCandidate,
    mtf.topCleanCandidate,
    mtf.exactCandidate,
    Object.keys(latest).length ? latest : null,
  ];
  const candidates = [...rawCandidates, ...objectCandidates]
    .map((item, index) => candidateFromRaw(item, `exact-candidate-${index + 1}`))
    .filter((item): item is CandidateGeometry => item != null);
  return candidates;
}

function dedupeCandidates(candidates: CandidateGeometry[]): CandidateGeometry[] {
  const unique = new Map<string, CandidateGeometry>();
  for (const candidate of candidates) {
    const key = candidateDedupKey(candidate);
    const existing = unique.get(key);
    if (existing) {
      existing.occurrenceCount += 1;
      continue;
    }
    unique.set(key, { ...candidate, flags: [...candidate.flags], warnings: [...candidate.warnings], timeframeSource: [...candidate.timeframeSource], occurrenceCount: 1 });
  }
  return [...unique.values()];
}

function hasStructuredGeometry(candidate: CandidateGeometry): boolean {
  return (
    candidate.direction !== "UNKNOWN" &&
    (candidate.entry != null || candidate.entryLow != null || candidate.entryHigh != null) &&
    candidate.stopLoss != null &&
    candidate.target1 != null
  );
}

function isCandidateStale(candidate: CandidateGeometry, latestCandleAt: string | null): boolean {
  if (!candidate.capturedAt || !latestCandleAt) return false;
  const candidateMs = Date.parse(candidate.capturedAt);
  const latestMs = Date.parse(latestCandleAt);
  if (!Number.isFinite(candidateMs) || !Number.isFinite(latestMs)) return false;
  return latestMs - candidateMs > CANDIDATE_STALE_SECONDS * 1000;
}

function targetTooClose(candidate: CandidateGeometry, currentPrice: number): boolean {
  if (candidate.targetTooClose) return true;
  const anchor = candidate.entry ?? candidate.entryLow ?? candidate.entryHigh ?? currentPrice;
  if (candidate.target1 == null || anchor <= 0) return false;
  return Math.abs(candidate.target1 - anchor) / anchor * 100 <= TARGET_TOO_CLOSE_PCT;
}

function qualityStatus(candidate: CandidateGeometry, currentPrice: number): CurrentPriceCandidateQualityStatus {
  if (!hasStructuredGeometry(candidate)) return "MISSING_GEOMETRY";
  if (targetTooClose(candidate, currentPrice)) return "TARGET_TOO_CLOSE";
  if (candidate.costTooHigh) return "COST_TOO_HIGH";
  if (candidate.flags.includes("CONFLICTING_MTF") || candidate.readiness === "CONFLICTING_MTF") return "CONFLICTING_MTF";
  if (candidate.flags.includes("FVG_ONLY") || candidate.readiness === "FVG_ONLY" || candidate.zoneType === "FVG_ONLY") return "FVG_ONLY";
  if ((candidate.netRR ?? 0) >= MIN_NET_RR) return "CLEAN";
  return "UNKNOWN";
}

function moveDirection(
  currentPriceStatus: CurrentPriceCandidatePriceStatus,
  currentPrice: number,
  low: number | null,
  high: number | null,
  entry: number | null,
): CurrentPriceCandidateMoveDirection {
  if (currentPriceStatus === "INSIDE_ENTRY_ZONE" || currentPriceStatus === "NEAR_ENTRY") return "INSIDE_ENTRY";
  const anchorLow = low ?? entry;
  const anchorHigh = high ?? entry;
  if (anchorLow == null || anchorHigh == null) return "UNKNOWN";
  if (currentPrice < anchorLow) return "UP_TO_ENTRY";
  if (currentPrice > anchorHigh) return "DOWN_TO_ENTRY";
  return "INSIDE_ENTRY";
}

function priceStatus(
  candidate: CandidateGeometry,
  currentPrice: number,
  inside: boolean,
  near: boolean,
): CurrentPriceCandidatePriceStatus {
  const low = candidate.entryLow ?? candidate.entry;
  const high = candidate.entryHigh ?? candidate.entry;
  if (low == null || high == null) return "UNKNOWN";
  if (candidate.direction === "LONG" && candidate.stopLoss != null && currentPrice <= candidate.stopLoss) return "ALREADY_INVALIDATED";
  if (candidate.direction === "SHORT" && candidate.stopLoss != null && currentPrice >= candidate.stopLoss) return "ALREADY_INVALIDATED";
  if (candidate.direction === "LONG" && candidate.target1 != null && currentPrice >= candidate.target1) return "PAST_TARGET";
  if (candidate.direction === "SHORT" && candidate.target1 != null && currentPrice <= candidate.target1) return "PAST_TARGET";
  if (inside) return "INSIDE_ENTRY_ZONE";
  if (near) return "NEAR_ENTRY";
  if (candidate.direction === "LONG" && currentPrice > high) return "WAITING_PULLBACK_TO_ENTRY";
  if (candidate.direction === "SHORT" && currentPrice < low) return "WAITING_PULLBACK_TO_ENTRY";
  if (candidate.direction === "LONG" && currentPrice < low) return "PRICE_MOVED_AWAY_FROM_ENTRY";
  if (candidate.direction === "SHORT" && currentPrice > high) return "PRICE_MOVED_AWAY_FROM_ENTRY";
  return "UNKNOWN";
}

function candidateReason(
  candidate: CandidateGeometry,
  currentPriceStatus: CurrentPriceCandidatePriceStatus,
  candidateQualityStatus: CurrentPriceCandidateQualityStatus,
): string {
  if (currentPriceStatus === "WAITING_PULLBACK_TO_ENTRY" && candidate.direction === "SHORT") {
    return candidateQualityStatus === "CLEAN"
      ? "ราคาอยู่ต่ำกว่าโซน entry ของ SHORT ต้องรอ pullback เข้าหาโซนก่อนจึงจะ eligible"
      : `ราคาอยู่ต่ำกว่าโซน entry ของ SHORT ต้องรอ pullback; และ candidate ยังติด ${candidateQualityStatus}`;
  }
  if (currentPriceStatus === "WAITING_PULLBACK_TO_ENTRY" && candidate.direction === "LONG") {
    return candidateQualityStatus === "CLEAN"
      ? "ราคาอยู่สูงกว่าโซน entry ของ LONG ต้องรอ pullback ลงมาหาโซนก่อนจึงจะ eligible"
      : `ราคาอยู่สูงกว่าโซน entry ของ LONG ต้องรอ pullback; และ candidate ยังติด ${candidateQualityStatus}`;
  }
  if (currentPriceStatus === "ALREADY_INVALIDATED") return "Current price has crossed stop/invalidation.";
  if (currentPriceStatus === "PAST_TARGET") return "Current price is already past target; candidate is late for review.";
  if (candidateQualityStatus !== "CLEAN") return `Current price state is ${currentPriceStatus}; quality blocker is ${candidateQualityStatus}.`;
  if (currentPriceStatus === "INSIDE_ENTRY_ZONE") return "Current price is inside entry zone and clean criteria pass for review only.";
  if (currentPriceStatus === "NEAR_ENTRY") return "Current price is near entry and clean criteria pass for review only.";
  return `Current price state is ${currentPriceStatus}.`;
}

function statusForCandidate(
  candidate: CandidateGeometry,
  currentPrice: number,
  latestCandleAt: string | null,
): CurrentPriceEligibleExactSubset["topCandidates"][number] {
  const distanceToEntryPct = pctDistance(currentPrice, candidate.entryLow, candidate.entryHigh, candidate.entry);
  const distanceToEntryAbs = absDistance(currentPrice, candidate.entryLow, candidate.entryHigh, candidate.entry);
  const inside = distanceToEntryPct === 0;
  const near = distanceToEntryPct != null && distanceToEntryPct <= NEAR_ENTRY_PCT;
  const stale = isCandidateStale(candidate, latestCandleAt);
  const currentPriceStatus = stale ? "UNKNOWN" : priceStatus(candidate, currentPrice, inside, near);
  const candidateQualityStatus = qualityStatus(candidate, currentPrice);
  const requiredMove = moveDirection(currentPriceStatus, currentPrice, candidate.entryLow, candidate.entryHigh, candidate.entry);

  let status: CurrentPriceEligibleCandidateStatus;
  if (stale) {
    status = "STALE";
  } else if (currentPriceStatus === "ALREADY_INVALIDATED") {
    status = "INVALIDATED";
  } else if (currentPriceStatus === "PAST_TARGET") {
    status = "MISSED";
  } else if ((inside || near) && candidateQualityStatus === "CLEAN") {
    status = "CLEAN_REVIEW_ONLY";
  } else if (candidateQualityStatus === "TARGET_TOO_CLOSE") {
    status = "TARGET_TOO_CLOSE";
  } else if (candidateQualityStatus === "COST_TOO_HIGH") {
    status = "COST_TOO_HIGH";
  } else if (inside) {
    status = "INSIDE_ENTRY_ZONE";
  } else if (near) {
    status = "NEAR_ENTRY";
  } else {
    status = "MISSED";
  }
  const reason = stale
    ? "Candidate snapshot is older than the latest candle threshold."
    : candidateReason(candidate, currentPriceStatus, candidateQualityStatus);

  return {
    id: candidate.id,
    direction: candidate.direction,
    status,
    currentPriceStatus,
    qualityStatus: candidateQualityStatus,
    entry: candidate.entry,
    entryLow: candidate.entryLow,
    entryHigh: candidate.entryHigh,
    stopLoss: candidate.stopLoss,
    target1: candidate.target1,
    target2: candidate.target2,
    netRR: candidate.netRR,
    distanceToEntryPct,
    distanceToEntryAbs,
    priceMoveRequiredDirection: requiredMove,
    occurrenceCount: candidate.occurrenceCount,
    zoneType: candidate.zoneType,
    readiness: candidate.readiness,
    flags: candidate.flags,
    reason,
  };
}

function failureRates(input: CurrentPriceEligibleExactSubsetInput): Record<string, number | null> {
  const attribution = obj(input.mtfExactZoneFailureAttribution);
  const rates = obj(attribution.failureRates);
  const shadow = obj(obj(input.shadowOutcomeSummary).shadowOutcomes);
  return {
    targetTooCloseRate: num(rates.targetTooCloseRate),
    missedFillRate: num(rates.missedFillRate),
    entryTouchRate: num(rates.entryTouchRate ?? shadow.entryTouchRate),
    targetAfterTouchRate: num(rates.targetAfterTouchRate ?? shadow.targetAfterEntryTouchRate),
    invalidationAfterTouchRate: num(rates.invalidationAfterTouchRate ?? shadow.invalidationAfterEntryTouchRate),
  };
}

function sampleAccounting(input: CurrentPriceEligibleExactSubsetInput) {
  const pipeline = obj(input.mtfEntryCandidatePipeline);
  const accounting = obj(pipeline.sampleAccounting);
  const exact = obj(input.exactZoneComparisonSummary);
  return {
    lifetimeExactSamples: firstNumber(accounting.lifetimeExactSamples),
    windowExactSamples: firstNumber(accounting.windowExactSamples, exact.exactSamples),
  };
}

function baseResult(
  status: CurrentPriceEligibleExactSubsetStatus,
  currentPrice: CurrentPriceEligibleExactSubset["currentPrice"],
): CurrentPriceEligibleExactSubset {
  return {
    schemaVersion: 1,
    source: SOURCE,
    status,
    readiness: "REVIEW_NOT_ACTIVATION",
    activationAllowed: false,
    paperActivationAllowed: false,
    liveActivationAllowed: false,
    reviewOnly: true,
    shadowOnly: true,
    currentPrice,
    sampleAccounting: {
      lifetimeExactSamples: null,
      windowExactSamples: null,
      currentPriceEligibleExactSamples: null,
      cleanCurrentPriceEligibleSamples: null,
      geometryInputSamples: null,
      geometryMissingSamples: null,
    },
    eligibilityFilters: {
      totalCandidates: 0,
      freshCandidates: 0,
      currentPriceInsideOrNearEntry: 0,
      missedCandidates: 0,
      invalidatedCandidates: 0,
      targetTooCloseCandidates: 0,
      costTooHighCandidates: 0,
      cleanCandidates: 0,
    },
    cleanSubsetGate: {
      status: "NOT_READY",
      passed: [],
      failed: [],
      thresholds: THRESHOLDS,
    },
    topCandidates: [],
    dedupSummary: {
      rawCandidates: 0,
      uniqueCandidates: 0,
      duplicateCandidates: 0,
    },
    priceSourceAudit: {
      subsetPriceSource: currentPrice.source,
      snapshotPriceSource: null,
      subsetCurrentPrice: currentPrice.value,
      snapshotCurrentPrice: null,
      priceSourceConsistent: false,
      notes: ["No exact candidate geometry snapshot price source is available."],
    },
    requiredGeometryInputs: [],
    warnings: [],
    nextAction: "continue collecting exact-zone diagnostics without activation",
  };
}

function currentPriceContext(input: CurrentPriceEligibleExactSubsetInput): CurrentPriceEligibleExactSubset["currentPrice"] {
  const pipeline = obj(input.mtfEntryCandidatePipeline);
  const pipelineContext = obj(pipeline.currentPriceContext);
  const raw = obj(input.currentPriceContext);
  const selected = Object.keys(raw).length ? raw : pipelineContext;
  return {
    value: firstNumber(selected.currentPrice, selected.value),
    source: firstText(selected.priceSource, selected.source),
    latestCandleAt: firstText(selected.latestCandleAt),
    freshnessStatus: freshnessStatus(selected.freshnessStatus),
    ageSeconds: firstNumber(selected.ageSeconds),
  };
}

function priceSourceAudit(
  input: CurrentPriceEligibleExactSubsetInput,
  price: CurrentPriceEligibleExactSubset["currentPrice"],
): CurrentPriceEligibleExactSubset["priceSourceAudit"] {
  const snapshot = obj(input.exactCandidateGeometrySnapshot);
  const snapshotCurrentPrice = firstNumber(snapshot.currentPrice);
  const snapshotPriceSource = firstText(snapshot.priceSource, snapshot.source === "EXACT_CANDIDATE_GEOMETRY_SNAPSHOT_V1" ? null : snapshot.source) ?? "not_available_at_snapshot_build";
  const priceSourceConsistent =
    price.value != null &&
    snapshotCurrentPrice != null &&
    price.value === snapshotCurrentPrice &&
    price.source != null &&
    snapshotPriceSource === price.source;
  const notes: string[] = [];
  if (!Object.keys(snapshot).length) {
    notes.push("No exactCandidateGeometrySnapshot is available; subset uses currentPriceContext.");
  } else if (snapshotCurrentPrice == null) {
    notes.push("Snapshot currentPrice is missing; subset uses currentPriceContext as source of truth.");
  } else if (!priceSourceConsistent) {
    notes.push("Snapshot price context differs from subset currentPriceContext; subset uses currentPriceContext for eligibility.");
  } else {
    notes.push("Snapshot price context matches subset currentPriceContext.");
  }
  return {
    subsetPriceSource: price.source,
    snapshotPriceSource,
    subsetCurrentPrice: price.value,
    snapshotCurrentPrice,
    priceSourceConsistent,
    notes,
  };
}

function hasAggregateExactData(input: CurrentPriceEligibleExactSubsetInput): boolean {
  const exact = obj(input.exactZoneComparisonSummary);
  const geometrySnapshot = obj(input.exactCandidateGeometrySnapshot);
  const geometrySummary = obj(geometrySnapshot.summary);
  const mtf = obj(input.mtfObFvgShadowSummary);
  const pipeline = obj(input.mtfEntryCandidatePipeline);
  const accounting = obj(pipeline.sampleAccounting);
  return (
    firstNumber(geometrySummary.totalCandidates, geometrySummary.structuredGeometryCount, geometrySummary.missingGeometryCount) != null ||
    firstNumber(exact.exactSamples, mtf.exactZoneSamples, accounting.lifetimeExactSamples, accounting.windowExactSamples) != null ||
    Object.keys(obj(mtf.latestSnapshot)).length > 0
  );
}

export function evaluateCurrentPriceEligibleExactSubset(
  input: CurrentPriceEligibleExactSubsetInput = {},
): CurrentPriceEligibleExactSubset {
  const price = currentPriceContext(input);
  const samples = sampleAccounting(input);
  const result = baseResult("NO_DATA", price);
  result.priceSourceAudit = priceSourceAudit(input, price);
  result.sampleAccounting.lifetimeExactSamples = samples.lifetimeExactSamples;
  result.sampleAccounting.windowExactSamples = samples.windowExactSamples;

  if (price.value == null || price.freshnessStatus === "STALE" || price.freshnessStatus === "MISSING") {
    result.status = "STALE_REEVALUATION_REQUIRED";
    result.sampleAccounting.currentPriceEligibleExactSamples = 0;
    result.sampleAccounting.cleanCurrentPriceEligibleSamples = 0;
    result.sampleAccounting.geometryInputSamples = 0;
    result.sampleAccounting.geometryMissingSamples = 0;
    result.cleanSubsetGate.failed = ["fresh current price required"];
    result.warnings = ["Current price is missing or stale; do not reuse old candidate verdicts."];
    result.nextAction = "refresh market snapshot / wait for latest runtime cycle";
    return result;
  }

  const candidates = collectCandidateRecords(input);
  result.dedupSummary.rawCandidates = candidates.length;
  if (!candidates.length) {
    if (!hasAggregateExactData(input)) {
      result.status = "NO_DATA";
      result.cleanSubsetGate.failed = ["no exact-zone candidate data"];
      result.nextAction = "continue collecting exact-zone diagnostics without activation";
      return result;
    }
    result.status = "GEOMETRY_INPUTS_MISSING";
    result.requiredGeometryInputs = [...REQUIRED_GEOMETRY_INPUTS];
    result.cleanSubsetGate.failed = ["structured exact candidate geometry missing"];
    result.warnings = ["Exact-zone evidence is aggregate-only; current-price eligibility cannot be computed without per-candidate geometry."];
    result.nextAction = "add exact candidate geometry snapshot fields to observability log";
    return result;
  }

  const structured = candidates.filter(hasStructuredGeometry);
  const uniqueStructured = dedupeCandidates(structured);
  result.dedupSummary = {
    rawCandidates: candidates.length,
    uniqueCandidates: uniqueStructured.length,
    duplicateCandidates: Math.max(0, candidates.length - uniqueStructured.length),
  };
  const missingCount = candidates.length - structured.length;
  if (!structured.length) {
    result.status = "GEOMETRY_INPUTS_MISSING";
    result.sampleAccounting.geometryInputSamples = 0;
    result.sampleAccounting.geometryMissingSamples = candidates.length;
    result.requiredGeometryInputs = [...REQUIRED_GEOMETRY_INPUTS];
    result.cleanSubsetGate.failed = ["structured exact candidate geometry missing"];
    result.warnings = ["Candidate records exist but required geometry fields are incomplete."];
    result.nextAction = "add exact candidate geometry snapshot fields to observability log";
    return result;
  }

  const topCandidates = uniqueStructured.map((candidate) => statusForCandidate(candidate, price.value!, price.latestCandleAt));
  const cleanCandidates = topCandidates.filter((candidate) => candidate.status === "CLEAN_REVIEW_ONLY").length;
  const insideOrNear = topCandidates.filter((candidate) => (
    candidate.currentPriceStatus === "INSIDE_ENTRY_ZONE" ||
    candidate.currentPriceStatus === "NEAR_ENTRY"
  )).length;
  const freshCandidates = topCandidates.filter((candidate) => candidate.status !== "STALE").length;
  const targetTooCloseCandidates = topCandidates.filter((candidate) => candidate.qualityStatus === "TARGET_TOO_CLOSE").length;
  const missedCandidates = topCandidates.filter((candidate) => candidate.currentPriceStatus === "WAITING_PULLBACK_TO_ENTRY" || candidate.currentPriceStatus === "PRICE_MOVED_AWAY_FROM_ENTRY" || candidate.currentPriceStatus === "PAST_TARGET").length;
  const invalidatedCandidates = topCandidates.filter((candidate) => candidate.currentPriceStatus === "ALREADY_INVALIDATED").length;
  const costTooHighCandidates = topCandidates.filter((candidate) => candidate.qualityStatus === "COST_TOO_HIGH").length;
  const rates = failureRates(input);
  const targetTooCloseRate = rates.targetTooCloseRate ?? rate(targetTooCloseCandidates, uniqueStructured.length);
  const missedFillRate = rates.missedFillRate ?? rate(missedCandidates, uniqueStructured.length);
  const invalidationAfterTouchRate = rates.invalidationAfterTouchRate ?? rate(invalidatedCandidates, uniqueStructured.length);

  const passed: string[] = ["fresh current price", "structured geometry present"];
  const failed: string[] = [];
  if (cleanCandidates >= THRESHOLDS.minCleanEligibleCandidates) passed.push("clean eligible candidates >= 10");
  else failed.push("clean eligible candidates < 10");
  if (targetTooCloseRate != null && targetTooCloseRate <= THRESHOLDS.maxTargetTooCloseRate) passed.push("targetTooCloseRate <= 0.4");
  else failed.push("targetTooCloseRate > 0.4 or unavailable");
  if (missedFillRate != null && missedFillRate <= THRESHOLDS.maxMissedFillRate) passed.push("missedFillRate <= 0.5");
  else failed.push("missedFillRate > 0.5 or unavailable");
  if (rates.entryTouchRate != null && rates.entryTouchRate >= THRESHOLDS.minEntryTouchRate) passed.push("entryTouchRate >= 0.35");
  else failed.push("entryTouchRate < 0.35 or unavailable");
  if (rates.targetAfterTouchRate != null && rates.targetAfterTouchRate >= THRESHOLDS.minTargetAfterTouchRate) passed.push("targetAfterTouchRate >= 0.25");
  else failed.push("targetAfterTouchRate < 0.25 or unavailable");
  if (invalidationAfterTouchRate != null && invalidationAfterTouchRate <= THRESHOLDS.maxInvalidationAfterTouchRate) passed.push("invalidationAfterTouchRate <= 0.5");
  else failed.push("invalidationAfterTouchRate > 0.5 or unavailable");

  const gateStatus: CurrentPriceEligibleExactSubset["cleanSubsetGate"]["status"] =
    cleanCandidates >= THRESHOLDS.minCleanEligibleCandidates && failed.length === 0
      ? "REVIEW_READY_NOT_ACTIVATION"
      : cleanCandidates > 0
        ? "PARTIAL"
        : "NOT_READY";
  const status: CurrentPriceEligibleExactSubsetStatus =
    gateStatus === "REVIEW_READY_NOT_ACTIVATION"
      ? "CLEAN_SUBSET_REVIEW_READY_NOT_ACTIVATION"
      : cleanCandidates > 0
        ? "CLEAN_SUBSET_FOUND_REVIEW_ONLY"
        : insideOrNear > 0
          ? "CURRENT_PRICE_ELIGIBLE_DEGRADED"
          : "NO_CURRENT_PRICE_ELIGIBLE_CANDIDATES";

  return {
    ...result,
    status,
    sampleAccounting: {
      lifetimeExactSamples: samples.lifetimeExactSamples,
      windowExactSamples: samples.windowExactSamples,
      currentPriceEligibleExactSamples: insideOrNear,
      cleanCurrentPriceEligibleSamples: cleanCandidates,
      geometryInputSamples: structured.length,
      geometryMissingSamples: missingCount,
    },
    eligibilityFilters: {
      totalCandidates: uniqueStructured.length,
      freshCandidates,
      currentPriceInsideOrNearEntry: insideOrNear,
      missedCandidates,
      invalidatedCandidates,
      targetTooCloseCandidates,
      costTooHighCandidates,
      cleanCandidates,
    },
    cleanSubsetGate: {
      status: gateStatus,
      passed,
      failed,
      thresholds: THRESHOLDS,
    },
    topCandidates: topCandidates
      .sort((a, b) => (a.distanceToEntryPct ?? Number.POSITIVE_INFINITY) - (b.distanceToEntryPct ?? Number.POSITIVE_INFINITY))
      .slice(0, 10),
    requiredGeometryInputs: missingCount > 0 ? [...REQUIRED_GEOMETRY_INPUTS] : [],
    warnings: missingCount > 0 ? [`${missingCount} candidate(s) were excluded because structured geometry is incomplete.`] : [],
    nextAction: gateStatus === "REVIEW_READY_NOT_ACTIVATION"
      ? "operator review clean current-price eligible exact subset; activation remains blocked"
      : cleanCandidates > 0
        ? "review partial clean subset and keep collecting current-price eligible exact samples"
        : insideOrNear > 0
          ? "investigate degraded current-price eligible exact candidates before review"
          : "wait for current price to return near a structured exact entry area",
  };
}
