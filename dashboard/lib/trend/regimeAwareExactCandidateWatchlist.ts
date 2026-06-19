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
  };
  watchlistSummary: {
    totalCandidates: number;
    uniqueCandidates: number;
    watchCandidates: number;
    waitingPullbackCandidates: number;
    regimeBlockedCandidates: number;
    qualityRejectedCandidates: number;
    missedCandidates: number;
    invalidatedCandidates: number;
    cleanReviewCandidates: number;
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
  if (status === "INVALIDATED" || currentPriceStatus === "ALREADY_INVALIDATED") return "INVALIDATED";
  if (status === "MISSED" || currentPriceStatus === "PAST_TARGET") return "MISSED";
  if (!regimeConfirmed) return "WAIT_FOR_REGIME_CONFIRMATION";
  if (WAITING_PRICE_STATUSES.has(currentPriceStatus) || (distance != null && distance > 0.25 && !NEAR_PRICE_STATUSES.has(currentPriceStatus))) {
    return "WAIT_FOR_PULLBACK";
  }
  if (QUALITY_REJECTED.has(qualityStatus) || QUALITY_REJECTED.has(status)) return "QUALITY_REJECTED";
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
  if (actionability === "WAIT_FOR_PULLBACK") {
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
    blockers: blockersForCandidate(candidate, actionability, regimeConfirmed),
    watchCondition: watchCondition(candidate, actionability),
    doNotDo: doNotDo(),
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
    waitingPullbackCandidates: candidates.filter((item) => item.actionability === "WAIT_FOR_PULLBACK").length,
    regimeBlockedCandidates: candidates.filter((item) => item.actionability === "WAIT_FOR_REGIME_CONFIRMATION").length,
    qualityRejectedCandidates: candidates.filter((item) => item.actionability === "QUALITY_REJECTED").length,
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
    priceRequired: candidates.some((item) => item.actionability === "WAIT_FOR_PULLBACK" || item.actionability === "WAIT_FOR_REGIME_CONFIRMATION")
      ? ["wait for price to move near or inside the candidate entry zone"]
      : [],
    confirmationRequired: ["wait for fresh 5m confirmation after price reaches the candidate zone"],
    qualityRequired: cleanGateFailed.length ? cleanGateFailed : candidates.some((item) => item.actionability === "QUALITY_REJECTED")
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
      summary: "Regime context is acceptable but price is not near the candidate entry zone.",
      nextAction: "wait for price to reach candidate entry zone",
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
  const reevaluation = obj(consistency.currentPriceReevaluation);
  const regime = obj(input.canonicalMarketRegime);
  const currentPrice = num(obj(subset.currentPrice).value) ?? num(canonical.value);
  const freshnessStatus = str(obj(subset.currentPrice).freshnessStatus) ?? str(canonical.freshnessStatus) ?? "UNKNOWN";
  const regimeName = str(regime.regime);
  const direction = str(regime.direction);
  const confidence = num(regime.confidence);
  const trendZoneStatus = str(reevaluation.trendZoneStatus);
  const noZoneReason = isNoActiveZoneStatus(trendZoneStatus) ? str(reevaluation.explanation) : null;
  const regimeConfirmed = isRegimeConfirmed(regimeName, direction);
  const candidates = arr(subset.topCandidates).slice(0, 6).map((candidate) => mapCandidate(candidate, regimeConfirmed));
  const watchlistSummary = summaryFromCandidates(subset, candidates);
  const cleanGate = obj(subset.cleanSubsetGate);
  const status = statusFor(regimeConfirmed, trendZoneStatus, candidates, watchlistSummary);
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
    },
    watchlistSummary,
    topWatchCandidates: candidates.slice(0, 3),
    nextTriggerChecklist: checklist(regimeConfirmed, candidates, strArray(cleanGate.failed)),
    verdict: verdict(status, watchlistSummary),
  };
}
