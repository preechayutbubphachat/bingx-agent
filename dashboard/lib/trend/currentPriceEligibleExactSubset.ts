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
    entry: number | null;
    entryLow: number | null;
    entryHigh: number | null;
    stopLoss: number | null;
    target1: number | null;
    target2: number | null;
    netRR: number | null;
    distanceToEntryPct: number | null;
    flags?: string[];
    reason: string;
  }>;
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
  costTooHigh: boolean;
  targetTooClose: boolean;
  warnings: string[];
  flags: string[];
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

function pctDistance(price: number, low: number | null, high: number | null, entry: number | null): number | null {
  const anchorLow = low ?? entry;
  const anchorHigh = high ?? entry;
  if (anchorLow == null || anchorHigh == null || price <= 0) return null;
  if (price >= anchorLow && price <= anchorHigh) return 0;
  const nearest = price < anchorLow ? anchorLow : anchorHigh;
  return round4(Math.abs(price - nearest) / price * 100);
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
    costTooHigh: bool(raw.costTooHigh) || flags.includes("COST_TOO_HIGH") || text(raw.readiness ?? raw.exactZoneReadiness ?? exactZone.exactZoneReadiness) === "COST_TOO_HIGH",
    targetTooClose: bool(raw.targetTooClose) || flags.includes("TARGET_TOO_CLOSE") || text(raw.readiness ?? raw.exactZoneReadiness ?? exactZone.exactZoneReadiness) === "TARGET_TOO_CLOSE",
    warnings,
    flags,
  };
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
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const key = `${candidate.id}:${candidate.direction}:${candidate.entry ?? ""}:${candidate.stopLoss ?? ""}:${candidate.target1 ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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

function statusForCandidate(
  candidate: CandidateGeometry,
  currentPrice: number,
  latestCandleAt: string | null,
): CurrentPriceEligibleExactSubset["topCandidates"][number] {
  const distanceToEntryPct = pctDistance(currentPrice, candidate.entryLow, candidate.entryHigh, candidate.entry);
  const inside = distanceToEntryPct === 0;
  const near = distanceToEntryPct != null && distanceToEntryPct <= NEAR_ENTRY_PCT;
  const stale = isCandidateStale(candidate, latestCandleAt);
  const invalidated =
    candidate.direction === "LONG" && candidate.stopLoss != null && currentPrice <= candidate.stopLoss ||
    candidate.direction === "SHORT" && candidate.stopLoss != null && currentPrice >= candidate.stopLoss;
  const pastTarget =
    candidate.direction === "LONG" && candidate.target1 != null && currentPrice >= candidate.target1 ||
    candidate.direction === "SHORT" && candidate.target1 != null && currentPrice <= candidate.target1;
  const tooClose = targetTooClose(candidate, currentPrice);
  const costHigh = candidate.costTooHigh;
  const missed =
    pastTarget ||
    candidate.direction === "LONG" && distanceToEntryPct != null && !near && currentPrice > (candidate.entryHigh ?? candidate.entry ?? currentPrice) ||
    candidate.direction === "SHORT" && distanceToEntryPct != null && !near && currentPrice < (candidate.entryLow ?? candidate.entry ?? currentPrice);

  let status: CurrentPriceEligibleCandidateStatus;
  let reason: string;
  if (stale) {
    status = "STALE";
    reason = "Candidate snapshot is older than the latest candle threshold.";
  } else if (invalidated) {
    status = "INVALIDATED";
    reason = "Current price has crossed stop/invalidation.";
  } else if (tooClose) {
    status = "TARGET_TOO_CLOSE";
    reason = "Target distance is too close for a clean review candidate.";
  } else if (costHigh) {
    status = "COST_TOO_HIGH";
    reason = "Candidate is flagged as cost too high.";
  } else if (missed) {
    status = "MISSED";
    reason = "Current price has moved away from the entry area.";
  } else if ((inside || near) && candidate.direction !== "UNKNOWN" && candidate.stopLoss != null && candidate.target1 != null && (candidate.netRR ?? 0) >= MIN_NET_RR) {
    status = "CLEAN_REVIEW_ONLY";
    reason = "Current price is near/inside entry and clean criteria pass for review only.";
  } else if (inside) {
    status = "INSIDE_ENTRY_ZONE";
    reason = "Current price is inside the exact entry area.";
  } else if (near) {
    status = "NEAR_ENTRY";
    reason = "Current price is near the exact entry area.";
  } else {
    status = "MISSED";
    reason = "Current price is not near the exact entry area.";
  }

  return {
    id: candidate.id,
    direction: candidate.direction,
    status,
    entry: candidate.entry,
    entryLow: candidate.entryLow,
    entryHigh: candidate.entryHigh,
    stopLoss: candidate.stopLoss,
    target1: candidate.target1,
    target2: candidate.target2,
    netRR: candidate.netRR,
    distanceToEntryPct,
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

  const topCandidates = structured.map((candidate) => statusForCandidate(candidate, price.value!, price.latestCandleAt));
  const cleanCandidates = topCandidates.filter((candidate) => candidate.status === "CLEAN_REVIEW_ONLY").length;
  const insideOrNear = topCandidates.filter((candidate) => (
    candidate.status === "CLEAN_REVIEW_ONLY" ||
    candidate.status === "INSIDE_ENTRY_ZONE" ||
    candidate.status === "NEAR_ENTRY"
  )).length;
  const freshCandidates = topCandidates.filter((candidate) => candidate.status !== "STALE").length;
  const targetTooCloseCandidates = topCandidates.filter((candidate) => candidate.status === "TARGET_TOO_CLOSE").length;
  const missedCandidates = topCandidates.filter((candidate) => candidate.status === "MISSED").length;
  const invalidatedCandidates = topCandidates.filter((candidate) => candidate.status === "INVALIDATED").length;
  const costTooHighCandidates = topCandidates.filter((candidate) => candidate.status === "COST_TOO_HIGH").length;
  const rates = failureRates(input);
  const targetTooCloseRate = rates.targetTooCloseRate ?? rate(targetTooCloseCandidates, structured.length);
  const missedFillRate = rates.missedFillRate ?? rate(missedCandidates, structured.length);
  const invalidationAfterTouchRate = rates.invalidationAfterTouchRate ?? rate(invalidatedCandidates, structured.length);

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
      totalCandidates: candidates.length,
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
