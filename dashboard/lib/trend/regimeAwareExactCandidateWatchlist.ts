// dashboard/lib/trend/regimeAwareExactCandidateWatchlist.ts
// D7.7 - read-only regime-aware exact candidate watchlist.
//
// SAFETY:
//   - Pure helper only. No I/O, no env reads, no network, no runtime writes.
//   - Diagnostics-only. Never enables activation or order paths.

export type RegimeAwareWatchlistStatus =
  | "NO_DATA"
  | "NO_ACTIVE_TREND_ZONE"
  | "REGIME_NOT_CONFIRMED"
  | "WATCHLIST_ONLY"
  | "WAITING_PULLBACK"
  | "NO_CURRENT_PRICE_ELIGIBLE_CANDIDATES"
  | "CLEAN_REVIEW_CANDIDATE_AVAILABLE_NOT_ACTIVATION";

export type RegimeAwareWatchlistActionability =
  | "WAIT_FOR_PULLBACK"
  | "WAIT_FOR_PULLBACK_DEGRADED"
  | "WAIT_FOR_REGIME_CONFIRMATION"
  | "WAIT_FOR_5M_CONFIRMATION"
  | "QUALITY_REJECTED"
  | "MISSED"
  | "INVALIDATED"
  | "CLEAN_REVIEW_ONLY"
  | "NO_ACTION";

export type RegimeAwareWatchlistVerdictStatus =
  | "WATCH_ONLY"
  | "WAIT_FOR_REGIME_AND_PRICE"
  | "WAIT_FOR_PULLBACK_ONLY"
  | "NO_VALID_CANDIDATE"
  | "CLEAN_REVIEW_READY_NOT_ACTIVATION";

export interface RegimeAwareExactCandidateWatchlist {
  schemaVersion: 1;
  source: "REGIME_AWARE_EXACT_CANDIDATE_WATCHLIST_V1";
  status: RegimeAwareWatchlistStatus;
  readiness: "REVIEW_NOT_ACTIVATION";
  activationAllowed: false;
  paperActivationAllowed: false;
  liveActivationAllowed: false;
  reviewOnly: true;
  shadowOnly: true;
  currentMarket: {
    currentPrice: number | null;
    freshnessStatus: string;
    regime: string | null;
    direction: string | null;
    confidence: number | null;
    trendZoneStatus: string | null;
    noZoneReason: string | null;
    latestCandleAt: string | null;
    ageSeconds: number | null;
  };
  watchlistSummary: {
    totalCandidates: number;
    uniqueCandidates: number;
    watchCandidates: number;
    waitingPullbackCandidates: number;
    regimeBlockedCandidates: number;
    qualityRejectedCandidates: number;
    degradedWatchCandidates: number;
    missedCandidates: number;
    invalidatedCandidates: number;
    cleanReviewCandidates: number;
  };
  watchlistDedupSummary: {
    rawWatchCandidates: number;
    uniqueWatchCandidates: number;
    duplicateWatchCandidates: number;
    clusteringTolerance: string;
  };
  compactSummary: {
    currentPrice: number | null;
    freshnessStatus: string;
    regime: string | null;
    direction: string | null;
    watchlistStatus: RegimeAwareWatchlistStatus;
    cleanReviewCandidates: number;
    nextAction: string;
    topCandidateDisplayLimit: 3;
    detailsCollapsedByDefault: true;
  };
  topWatchCandidates: Array<{
    id: string;
    direction: "LONG" | "SHORT" | "UNKNOWN";
    actionability: RegimeAwareWatchlistActionability;
    currentPriceStatus: string;
    qualityStatus: string;
    entry: number | null;
    stopLoss: number | null;
    target1: number | null;
    netRR: number | null;
    distanceToEntryPct: number | null;
    priceMoveRequiredDirection: string;
    occurrenceCount: number;
    representativeStopLoss: number | null;
    stopLossRange: [number, number] | null;
    blockers: string[];
    watchCondition: string;
    doNotDo: string[];
  }>;
  nextTriggerChecklist: {
    regimeRequired: string[];
    priceRequired: string[];
    confirmationRequired: string[];
    qualityRequired: string[];
    dataRequired: string[];
  };
  verdict: {
    status: RegimeAwareWatchlistVerdictStatus;
    summary: string;
    nextAction: string;
  };
}

export interface RegimeAwareExactCandidateWatchlistInput {
  currentPriceEligibleExactSubset?: unknown;
  currentPriceConsistencyAudit?: unknown;
  mtfEntryCandidatePipeline?: unknown;
  mtfExactZoneFailureAttribution?: unknown;
  canonicalMarketRegime?: unknown;
  multiTimeframeIndicatorEvidence?: unknown;
  indicatorGate?: unknown;
  trendZoneCandidate?: unknown;
  trendStrategy?: unknown;
}

const SOURCE = "REGIME_AWARE_EXACT_CANDIDATE_WATCHLIST_V1" as const;
const QUALITY_REJECTED = new Set(["TARGET_TOO_CLOSE", "COST_TOO_HIGH", "CONFLICTING_MTF"]);
const NEAR_PRICE_STATUSES = new Set(["INSIDE_ENTRY_ZONE", "NEAR_ENTRY"]);
const WAITING_PRICE_STATUSES = new Set(["WAITING_PULLBACK_TO_ENTRY", "PRICE_MOVED_AWAY_FROM_ENTRY"]);

function obj(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function arr(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
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

function bool(value: unknown): boolean {
  return value === true;
}

function asDirection(value: unknown): "LONG" | "SHORT" | "UNKNOWN" {
  return value === "LONG" || value === "SHORT" ? value : "UNKNOWN";
}

function cleanNumber(value: number | null): string {
  return value == null ? "unknown" : value.toFixed(2);
}

function round1(value: number | null): string {
  return value == null ? "unknown" : String(Math.round(value * 10) / 10);
}

function roundStopBucket(value: number | null): string {
  return value == null ? "unknown" : String(Math.round(value));
}

function firstFreshness(...values: unknown[]): string {
  const valid = new Set(["FRESH", "STALE", "MISSING", "UNKNOWN"]);
  for (const value of values) {
    const s = str(value);
    if (s && valid.has(s) && s !== "UNKNOWN" && s !== "MISSING") return s;
  }
  if (values.some((value) => str(value) === "MISSING")) return "MISSING";
  return "UNKNOWN";
}

function isRegimeConfirmed(regime: string | null, direction: string | null): boolean {
  if (regime === "DOWNTREND") return direction === "BEARISH";
  if (regime === "UPTREND") return direction === "BULLISH";
  return false;
}

function isNoActiveZoneStatus(status: string | null): boolean {
  return status === "NO_ACTIVE_TREND_ZONE" || status === "REGIME_NOT_TREND" || status === "MISSING_ZONE_GEOMETRY";
}

function classifyCandidate(candidate: Record<string, unknown>, regimeConfirmed: boolean): RegimeAwareWatchlistActionability {
  const status = str(candidate.status) ?? "UNKNOWN";
  const currentPriceStatus = str(candidate.currentPriceStatus) ?? "UNKNOWN";
  const qualityStatus = str(candidate.qualityStatus) ?? "UNKNOWN";
  const distance = num(candidate.distanceToEntryPct);
  const qualityRejected = QUALITY_REJECTED.has(qualityStatus) || QUALITY_REJECTED.has(status);
  if (status === "INVALIDATED" || currentPriceStatus === "ALREADY_INVALIDATED") return "INVALIDATED";
  if (status === "MISSED" || currentPriceStatus === "PAST_TARGET") return "MISSED";
  if (!regimeConfirmed) return "WAIT_FOR_REGIME_CONFIRMATION";
  if (WAITING_PRICE_STATUSES.has(currentPriceStatus) || (distance != null && distance > 0.25 && !NEAR_PRICE_STATUSES.has(currentPriceStatus))) {
    return qualityRejected ? "WAIT_FOR_PULLBACK_DEGRADED" : "WAIT_FOR_PULLBACK";
  }
  if (qualityRejected) return "QUALITY_REJECTED";
  if (status === "CLEAN_REVIEW_ONLY" || (qualityStatus === "CLEAN" && NEAR_PRICE_STATUSES.has(currentPriceStatus))) {
    return "CLEAN_REVIEW_ONLY";
  }
  if (NEAR_PRICE_STATUSES.has(currentPriceStatus)) return "WAIT_FOR_5M_CONFIRMATION";
  return "NO_ACTION";
}

function blockersForCandidate(candidate: Record<string, unknown>, actionability: RegimeAwareWatchlistActionability, regimeConfirmed: boolean): string[] {
  const blockers: string[] = [];
  const currentPriceStatus = str(candidate.currentPriceStatus) ?? "UNKNOWN";
  const qualityStatus = str(candidate.qualityStatus) ?? "UNKNOWN";
  const status = str(candidate.status) ?? "UNKNOWN";
  if (actionability === "INVALIDATED") blockers.push("candidate invalidated");
  if (actionability === "MISSED") blockers.push("candidate missed or current price already past target");
  if (!regimeConfirmed) blockers.push("regime not confirmed");
  if (WAITING_PRICE_STATUSES.has(currentPriceStatus)) blockers.push("price not near entry");
  if (QUALITY_REJECTED.has(qualityStatus) || QUALITY_REJECTED.has(status)) blockers.push(qualityStatus);
  if (strArray(candidate.flags).length) blockers.push(...strArray(candidate.flags));
  return Array.from(new Set(blockers));
}

function watchCondition(candidate: Record<string, unknown>, actionability: RegimeAwareWatchlistActionability): string {
  const direction = asDirection(candidate.direction);
  const entry = num(candidate.entry);
  if (actionability === "INVALIDATED") return "ไม่ต้องเฝ้าต่อ candidate นี้ invalidated แล้ว";
  if (actionability === "MISSED") return "ไม่ต้องไล่ราคา candidate นี้เลยจุดที่ควร review แล้ว";
  if (actionability === "WAIT_FOR_REGIME_CONFIRMATION") {
    return `รอราคาเข้าใกล้ ${cleanNumber(entry)} และต้องเห็น regime/trend confirmation ใหม่ก่อน review`;
  }
  if (actionability === "WAIT_FOR_PULLBACK" || actionability === "WAIT_FOR_PULLBACK_DEGRADED") {
    return `รอราคา${direction === "SHORT" ? "ดีดขึ้น" : direction === "LONG" ? "ย่อลง" : "กลับ"}เข้าใกล้ ${cleanNumber(entry)} ก่อน review`;
  }
  if (actionability === "QUALITY_REJECTED") return "รอคุณภาพ candidate ดีขึ้นก่อน ยังติด quality blocker";
  if (actionability === "CLEAN_REVIEW_ONLY") return "ใช้เพื่อ review เท่านั้น ต้องไม่ถือเป็นสัญญาณเข้าไม้";
  return "ใช้เฝ้าดูเท่านั้น ยังไม่ actionable";
}

function doNotDo(): string[] {
  return ["do not treat as entry signal", "do not activate paper/live", "do not place order"];
}

function mapCandidate(candidateInput: unknown, regimeConfirmed: boolean): RegimeAwareExactCandidateWatchlist["topWatchCandidates"][number] {
  const candidate = obj(candidateInput);
  const actionability = classifyCandidate(candidate, regimeConfirmed);
  return {
    id: str(candidate.id) ?? "unknown",
    direction: asDirection(candidate.direction),
    actionability,
    currentPriceStatus: str(candidate.currentPriceStatus) ?? "UNKNOWN",
    qualityStatus: str(candidate.qualityStatus) ?? "UNKNOWN",
    entry: num(candidate.entry),
    stopLoss: num(candidate.stopLoss),
    target1: num(candidate.target1),
    netRR: num(candidate.netRR),
    distanceToEntryPct: num(candidate.distanceToEntryPct),
    priceMoveRequiredDirection: str(candidate.priceMoveRequiredDirection) ?? "UNKNOWN",
    occurrenceCount: 1,
    representativeStopLoss: num(candidate.stopLoss),
    stopLossRange: null,
    blockers: blockersForCandidate(candidate, actionability, regimeConfirmed),
    watchCondition: watchCondition(candidate, actionability),
    doNotDo: doNotDo(),
  };
}

function watchCandidateDedupKey(candidate: RegimeAwareExactCandidateWatchlist["topWatchCandidates"][number]): string {
  return [
    candidate.direction,
    "UNKNOWN_TF",
    round1(candidate.entry),
    round1(candidate.target1),
    roundStopBucket(candidate.stopLoss),
    candidate.qualityStatus,
    candidate.currentPriceStatus,
  ].join("|");
}

function dedupeWatchCandidates(
  candidates: RegimeAwareExactCandidateWatchlist["topWatchCandidates"],
): {
  candidates: RegimeAwareExactCandidateWatchlist["topWatchCandidates"];
  summary: RegimeAwareExactCandidateWatchlist["watchlistDedupSummary"];
} {
  const groups = new Map<string, RegimeAwareExactCandidateWatchlist["topWatchCandidates"]>();
  for (const candidate of candidates) {
    const key = watchCandidateDedupKey(candidate);
    groups.set(key, [...(groups.get(key) ?? []), candidate]);
  }
  const unique = [...groups.values()].map((items) => {
    const representative = items[0]!;
    const stops = items.map((item) => item.stopLoss).filter((item): item is number => item != null);
    const minStop = stops.length ? Math.min(...stops) : null;
    const maxStop = stops.length ? Math.max(...stops) : null;
    return {
      ...representative,
      occurrenceCount: items.length,
      representativeStopLoss: representative.stopLoss,
      stopLossRange: minStop != null && maxStop != null && minStop !== maxStop ? [minStop, maxStop] as [number, number] : null,
      blockers: Array.from(new Set(items.flatMap((item) => item.blockers))),
    };
  });
  return {
    candidates: unique,
    summary: {
      rawWatchCandidates: candidates.length,
      uniqueWatchCandidates: unique.length,
      duplicateWatchCandidates: Math.max(0, candidates.length - unique.length),
      clusteringTolerance: "entry/target rounded to 0.1 USDT; stop grouped within 1 USDT",
    },
  };
}

function summaryFromCandidates(
  subset: Record<string, unknown>,
  candidates: RegimeAwareExactCandidateWatchlist["topWatchCandidates"],
): RegimeAwareExactCandidateWatchlist["watchlistSummary"] {
  const filters = obj(subset.eligibilityFilters);
  const dedup = obj(subset.dedupSummary);
  const cleanSamples = num(obj(subset.sampleAccounting).cleanCurrentPriceEligibleSamples);
  return {
    totalCandidates: num(filters.totalCandidates) ?? num(dedup.rawCandidates) ?? candidates.length,
    uniqueCandidates: num(dedup.uniqueCandidates) ?? candidates.length,
    watchCandidates: candidates.filter((item) => item.actionability !== "INVALIDATED" && item.actionability !== "MISSED").length,
    waitingPullbackCandidates: candidates.filter((item) => item.actionability === "WAIT_FOR_PULLBACK" || item.actionability === "WAIT_FOR_PULLBACK_DEGRADED").length,
    regimeBlockedCandidates: candidates.filter((item) => item.actionability === "WAIT_FOR_REGIME_CONFIRMATION").length,
    qualityRejectedCandidates: candidates.filter((item) => item.actionability === "QUALITY_REJECTED" || QUALITY_REJECTED.has(item.qualityStatus)).length,
    degradedWatchCandidates: candidates.filter((item) => item.actionability === "WAIT_FOR_PULLBACK_DEGRADED").length,
    missedCandidates: num(filters.missedCandidates) ?? candidates.filter((item) => item.actionability === "MISSED").length,
    invalidatedCandidates: num(filters.invalidatedCandidates) ?? candidates.filter((item) => item.actionability === "INVALIDATED").length,
    cleanReviewCandidates: cleanSamples ?? num(filters.cleanCandidates) ?? candidates.filter((item) => item.actionability === "CLEAN_REVIEW_ONLY").length,
  };
}

function checklist(
  regimeConfirmed: boolean,
  candidates: RegimeAwareExactCandidateWatchlist["topWatchCandidates"],
  cleanGateFailed: string[],
): RegimeAwareExactCandidateWatchlist["nextTriggerChecklist"] {
  return {
    regimeRequired: regimeConfirmed ? [] : ["confirm UPTREND/BULLISH or DOWNTREND/BEARISH regime before review"],
    priceRequired: candidates.some((item) => item.actionability === "WAIT_FOR_PULLBACK" || item.actionability === "WAIT_FOR_PULLBACK_DEGRADED" || item.actionability === "WAIT_FOR_REGIME_CONFIRMATION")
      ? ["wait for price to move near or inside the candidate entry zone"]
      : [],
    confirmationRequired: ["wait for fresh 5m confirmation after price reaches the candidate zone"],
    qualityRequired: cleanGateFailed.length ? cleanGateFailed : candidates.some((item) => item.actionability === "QUALITY_REJECTED" || item.actionability === "WAIT_FOR_PULLBACK_DEGRADED")
      ? ["clear target-too-close, cost-too-high, and conflicting-MTF blockers"]
      : [],
    dataRequired: candidates.length ? [] : ["collect structured exact candidate geometry"],
  };
}

function verdict(
  status: RegimeAwareWatchlistStatus,
  summary: RegimeAwareExactCandidateWatchlist["watchlistSummary"],
): RegimeAwareExactCandidateWatchlist["verdict"] {
  if (status === "CLEAN_REVIEW_CANDIDATE_AVAILABLE_NOT_ACTIVATION") {
    return {
      status: "CLEAN_REVIEW_READY_NOT_ACTIVATION",
      summary: "Clean exact candidate is available for review only. This is not activation.",
      nextAction: "review candidate evidence and keep activation blocked",
    };
  }
  if (status === "REGIME_NOT_CONFIRMED" || status === "NO_ACTIVE_TREND_ZONE") {
    return {
      status: "WAIT_FOR_REGIME_AND_PRICE",
      summary: "Exact candidates are watchlist-only until regime and price confirm.",
      nextAction: "wait for trend regime confirmation and price pullback before review",
    };
  }
  if (status === "WAITING_PULLBACK") {
    return {
      status: "WAIT_FOR_PULLBACK_ONLY",
      summary: summary.degradedWatchCandidates > 0
        ? "Regime context is acceptable but price is not near entry and candidate quality is degraded."
        : "Regime context is acceptable but price is not near the candidate entry zone.",
      nextAction: summary.degradedWatchCandidates > 0
        ? "wait for pullback and require quality improvement before clean subset review"
        : "wait for price to reach candidate entry zone",
    };
  }
  if (summary.watchCandidates === 0) {
    return {
      status: "NO_VALID_CANDIDATE",
      summary: "No valid candidate should distract the operator.",
      nextAction: "ignore invalidated or missed candidates and keep collecting evidence",
    };
  }
  return {
    status: "WATCH_ONLY",
    summary: "Exact candidates are available for watchlist monitoring only.",
    nextAction: "monitor regime, price, confirmation, and quality blockers",
  };
}

function statusFor(
  regimeConfirmed: boolean,
  trendZoneStatus: string | null,
  candidates: RegimeAwareExactCandidateWatchlist["topWatchCandidates"],
  summary: RegimeAwareExactCandidateWatchlist["watchlistSummary"],
): RegimeAwareWatchlistStatus {
  if (summary.totalCandidates === 0 && candidates.length === 0) return "NO_DATA";
  if (summary.cleanReviewCandidates > 0 && candidates.some((item) => item.actionability === "CLEAN_REVIEW_ONLY")) {
    return "CLEAN_REVIEW_CANDIDATE_AVAILABLE_NOT_ACTIVATION";
  }
  if (!regimeConfirmed) return "REGIME_NOT_CONFIRMED";
  if (isNoActiveZoneStatus(trendZoneStatus)) return "NO_ACTIVE_TREND_ZONE";
  if (summary.waitingPullbackCandidates > 0) return "WAITING_PULLBACK";
  if (summary.cleanReviewCandidates === 0) return "NO_CURRENT_PRICE_ELIGIBLE_CANDIDATES";
  return "WATCHLIST_ONLY";
}

export function evaluateRegimeAwareExactCandidateWatchlist(
  input: RegimeAwareExactCandidateWatchlistInput = {},
): RegimeAwareExactCandidateWatchlist {
  const subset = obj(input.currentPriceEligibleExactSubset);
  const consistency = obj(input.currentPriceConsistencyAudit);
  const canonical = obj(consistency.canonicalCurrentPrice);
  const pipelineCurrentPriceContext = obj(obj(input.mtfEntryCandidatePipeline).currentPriceContext);
  const subsetCurrentPrice = obj(subset.currentPrice);
  const reevaluation = obj(consistency.currentPriceReevaluation);
  const regime = obj(input.canonicalMarketRegime);
  const currentPrice = num(pipelineCurrentPriceContext.currentPrice) ?? num(pipelineCurrentPriceContext.value) ?? num(canonical.value) ?? num(subsetCurrentPrice.value);
  const freshnessStatus = firstFreshness(pipelineCurrentPriceContext.freshnessStatus, canonical.freshnessStatus, subsetCurrentPrice.freshnessStatus);
  const latestCandleAt = str(pipelineCurrentPriceContext.latestCandleAt) ?? str(canonical.latestCandleAt) ?? str(subsetCurrentPrice.latestCandleAt);
  const ageSeconds = num(pipelineCurrentPriceContext.ageSeconds) ?? num(canonical.ageSeconds) ?? num(subsetCurrentPrice.ageSeconds);
  const regimeName = str(regime.regime);
  const direction = str(regime.direction);
  const confidence = num(regime.confidence);
  const trendZoneStatus = str(reevaluation.trendZoneStatus);
  const noZoneReason = isNoActiveZoneStatus(trendZoneStatus) ? str(reevaluation.explanation) : null;
  const regimeConfirmed = isRegimeConfirmed(regimeName, direction);
  const rawCandidates = arr(subset.topCandidates).slice(0, 10).map((candidate) => mapCandidate(candidate, regimeConfirmed));
  const deduped = dedupeWatchCandidates(rawCandidates);
  const candidates = deduped.candidates;
  const watchlistSummary = summaryFromCandidates(subset, candidates);
  const cleanGate = obj(subset.cleanSubsetGate);
  const status = statusFor(regimeConfirmed, trendZoneStatus, candidates, watchlistSummary);
  const verdictResult = verdict(status, watchlistSummary);
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
    currentMarket: {
      currentPrice,
      freshnessStatus,
      regime: regimeName,
      direction,
      confidence,
      trendZoneStatus,
      noZoneReason,
      latestCandleAt,
      ageSeconds,
    },
    watchlistSummary,
    watchlistDedupSummary: deduped.summary,
    compactSummary: {
      currentPrice,
      freshnessStatus,
      regime: regimeName,
      direction,
      watchlistStatus: status,
      cleanReviewCandidates: watchlistSummary.cleanReviewCandidates,
      nextAction: verdictResult.nextAction,
      topCandidateDisplayLimit: 3,
      detailsCollapsedByDefault: true,
    },
    topWatchCandidates: candidates.slice(0, 3),
    nextTriggerChecklist: checklist(regimeConfirmed, candidates, strArray(cleanGate.failed)),
    verdict: verdictResult,
  };
}
