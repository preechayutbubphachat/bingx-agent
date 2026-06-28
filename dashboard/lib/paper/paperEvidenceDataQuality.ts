export const NORMALIZED_NO_TRADE_REASON_BUCKETS = [
  "data_missing",
  "regime_unclear",
  "spread_too_high",
  "slippage_too_high",
  "funding_risk",
  "news_risk",
  "volatility_extreme",
  "runtime_audit_critical",
  "cost_exceeds_edge",
  "price_below_grid_lower",
  "price_above_grid_upper",
  "paper_edge_unproven",
  "grid_epoch_audit_only",
  "current_grid_data_quality_blocked",
  "trend_no_aligned_setup",
] as const;

export type NormalizedNoTradeReasonBucket = typeof NORMALIZED_NO_TRADE_REASON_BUCKETS[number];

export type PaperEvidenceQualityState = "NO_DATA" | "INSUFFICIENT" | "PARTIAL" | "REVIEW_READY";

export type PaperEvidenceFreshness = "FRESH" | "STALE" | "UNKNOWN" | "NO_LATEST_DECISION";

export type PaperEvidenceEvent = {
  type?: string | null;
  side?: string | null;
  averageFillPrice?: number | null;
  gridSpacingPct?: number | null;
  mode?: string | null;
  strategyMode?: string | null;
  regime?: string | null;
  session?: string | null;
  noTradeReason?: string | null;
};

export type PaperEvidenceInput = {
  events?: readonly PaperEvidenceEvent[] | null;
  buyFillCount?: number | null;
  sellFillCount?: number | null;
  closedCycles?: number | null;
  latestDecisionFreshness?: PaperEvidenceFreshness | string | null;
  oldEpochStatus?: string | null;
};

export type PaperEvidenceDataQuality = {
  schemaVersion: 1;
  source: "PAPER_EVIDENCE_DATA_QUALITY_V1";
  readiness: "REVIEW_NOT_ACTIVATION";
  qualityState: PaperEvidenceQualityState;
  hasFillEvents: boolean;
  hasAverageFillPrice: boolean;
  hasClosedCycleVisibility: boolean;
  hasGridSpacingPct: boolean;
  hasModeTags: boolean;
  hasRegimeTags: boolean;
  hasSessionTags: boolean;
  hasNoTradeReasonCoverage: boolean;
  missingFields: string[];
  blockers: string[];
  warnings: string[];
  nextAction: string;
  activationAllowed: false;
  paperActivationAllowed: false;
  liveActivationAllowed: false;
  reviewOnly: true;
  shadowOnly: true;
};

const FILL_TYPES = new Set(["ORDER_FILLED", "FILL_RESULT", "ORDER_PARTIALLY_FILLED"]);
const OLD_EPOCH_AUDIT_STATUSES = new Set(["QUARANTINED", "OBSOLETE_MARKET_CHANGED", "OLD_EPOCH_AUDIT_ONLY"]);

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function positiveCount(value: number | null | undefined): number {
  return finite(value) && value > 0 ? value : 0;
}

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function sideOf(event: PaperEvidenceEvent): string {
  return text(event.side).toUpperCase();
}

function eventTypeOf(event: PaperEvidenceEvent): string {
  return text(event.type).toUpperCase();
}

function isFillEvent(event: PaperEvidenceEvent): boolean {
  return FILL_TYPES.has(eventTypeOf(event)) || sideOf(event) === "BUY" || sideOf(event) === "SELL";
}

function isNoTradeEvent(event: PaperEvidenceEvent): boolean {
  return eventTypeOf(event) === "NO_TRADE_DECISION" || text(event.noTradeReason) !== "";
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function hasKnownNoTradeReason(reason: string | null | undefined): boolean {
  const normalized = text(reason).toLowerCase();
  return NORMALIZED_NO_TRADE_REASON_BUCKETS.includes(normalized as NormalizedNoTradeReasonBucket);
}

function nextActionFor(qualityState: PaperEvidenceQualityState): string {
  switch (qualityState) {
    case "NO_DATA":
      return "collect paper or no-trade evidence before algorithm review";
    case "INSUFFICIENT":
      return "repair missing evidence fields before review readiness can improve";
    case "PARTIAL":
      return "continue collecting paired fills and complete diagnostic tags";
    case "REVIEW_READY":
      return "use paper evidence as review input only";
  }
}

export function evaluatePaperEvidenceDataQuality(input: PaperEvidenceInput | null | undefined): PaperEvidenceDataQuality {
  const events = Array.isArray(input?.events) ? [...input.events] : [];
  const buyFillCount = positiveCount(input?.buyFillCount);
  const sellFillCount = positiveCount(input?.sellFillCount);
  const closedCycles = positiveCount(input?.closedCycles);
  const fillEvents = events.filter(isFillEvent);
  const noTradeEvents = events.filter(isNoTradeEvent);
  const hasFillEvents = fillEvents.length > 0 || buyFillCount + sellFillCount > 0;
  const hasAnyEvidence = events.length > 0 || hasFillEvents || noTradeEvents.length > 0;

  const fillPriceMissing = fillEvents.some((event) => !finite(event.averageFillPrice));
  const hasAverageFillPrice = hasFillEvents && fillEvents.length > 0 && !fillPriceMissing;
  const hasClosedCycleVisibility = closedCycles > 0 && buyFillCount > 0 && sellFillCount > 0;
  const hasGridSpacingPct = events.length > 0 && events.every((event) => finite(event.gridSpacingPct));
  const hasModeTags = events.length > 0 && events.every((event) => text(event.mode) !== "" || text(event.strategyMode) !== "");
  const hasRegimeTags = events.length > 0 && events.every((event) => text(event.regime) !== "");
  const hasSessionTags = events.length > 0 && events.every((event) => text(event.session) !== "");
  const hasNoTradeReasonCoverage =
    noTradeEvents.length === 0 || noTradeEvents.every((event) => hasKnownNoTradeReason(event.noTradeReason));

  const missingFields: string[] = [];
  const blockers: string[] = [];
  const warnings: string[] = [];

  if (hasFillEvents && !hasAverageFillPrice) {
    missingFields.push("averageFillPrice");
    blockers.push("average_fill_price_missing");
  }

  if (buyFillCount > 0 && sellFillCount === 0) {
    blockers.push("open_buy_without_sell_cycle");
  } else if (buyFillCount > 0 && sellFillCount > 0 && !hasClosedCycleVisibility) {
    blockers.push("closed_cycle_pairing_not_visible");
  }

  if (events.length > 0 && !hasGridSpacingPct) {
    missingFields.push("gridSpacingPct");
    blockers.push("cost_gate_not_measurable");
  }

  if (!hasModeTags) missingFields.push("mode");
  if (!hasRegimeTags) missingFields.push("regime");
  if (!hasSessionTags) missingFields.push("session");
  if (events.length > 0 && (!hasModeTags || !hasRegimeTags || !hasSessionTags)) {
    blockers.push("segmentation_tags_missing");
  }

  if (!hasNoTradeReasonCoverage) {
    missingFields.push("noTradeReason");
    blockers.push("no_trade_reason_coverage_missing");
  }

  if (text(input?.latestDecisionFreshness).toUpperCase() === "STALE") {
    warnings.push("latest_decision_stale");
  }

  if (OLD_EPOCH_AUDIT_STATUSES.has(text(input?.oldEpochStatus).toUpperCase())) {
    warnings.push("old_epoch_audit_only");
  }

  let qualityState: PaperEvidenceQualityState;
  if (!hasAnyEvidence) {
    qualityState = "NO_DATA";
  } else if (hasFillEvents && (!hasAverageFillPrice || (buyFillCount > 0 && sellFillCount > 0 && !hasClosedCycleVisibility))) {
    qualityState = "INSUFFICIENT";
  } else if (blockers.length > 0 || !hasClosedCycleVisibility) {
    qualityState = "PARTIAL";
  } else {
    qualityState = "REVIEW_READY";
  }

  return {
    schemaVersion: 1,
    source: "PAPER_EVIDENCE_DATA_QUALITY_V1",
    readiness: "REVIEW_NOT_ACTIVATION",
    qualityState,
    hasFillEvents,
    hasAverageFillPrice,
    hasClosedCycleVisibility,
    hasGridSpacingPct,
    hasModeTags,
    hasRegimeTags,
    hasSessionTags,
    hasNoTradeReasonCoverage,
    missingFields: unique(missingFields),
    blockers: unique(blockers),
    warnings: unique(warnings),
    nextAction: nextActionFor(qualityState),
    activationAllowed: false,
    paperActivationAllowed: false,
    liveActivationAllowed: false,
    reviewOnly: true,
    shadowOnly: true,
  };
}
