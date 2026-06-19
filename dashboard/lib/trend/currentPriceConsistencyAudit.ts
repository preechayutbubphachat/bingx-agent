// dashboard/lib/trend/currentPriceConsistencyAudit.ts
// D7.5 - read-only current price consistency audit across trend diagnostics.
//
// SAFETY:
//   - Pure helper only. No I/O, no env reads, no network, no runtime writes.
//   - Diagnostics-only. Never feeds activation or order paths.

export type CurrentPriceConsistencyStatus =
  | "CONSISTENT"
  | "PRICE_MISMATCH_DETECTED"
  | "STALE_TREND_PRICE_CONSUMERS"
  | "MISSING_CURRENT_PRICE";

export type CurrentPriceConsumerStatus = "MATCH" | "MISMATCH" | "STALE" | "MISSING" | "UNKNOWN";

export type CurrentPriceTrendZoneStatus =
  | "INSIDE_ENTRY_ZONE"
  | "NEAR_ENTRY_ZONE"
  | "WAITING_PULLBACK_TO_ENTRY"
  | "PRICE_BELOW_ENTRY_ZONE"
  | "PRICE_ABOVE_ENTRY_ZONE"
  | "PAST_TARGET"
  | "INVALIDATED"
  | "NO_ACTIVE_TREND_ZONE"
  | "REGIME_NOT_TREND"
  | "MISSING_ZONE_GEOMETRY"
  | "UNKNOWN";

export type CurrentPriceMoveDirection = "UP_TO_ENTRY" | "DOWN_TO_ENTRY" | "INSIDE_ENTRY" | "NO_ZONE" | "UNKNOWN";

export type CurrentPriceConditionImpact =
  | "NO_CHANGE"
  | "PASS_TO_FAIL"
  | "FAIL_TO_PASS"
  | "NOT_EVALUABLE_NO_ZONE"
  | "UNKNOWN";

export interface CurrentPriceConsistencyAudit {
  schemaVersion: 1;
  source: "CURRENT_PRICE_CONSISTENCY_AUDIT_V1";
  status: CurrentPriceConsistencyStatus;
  canonicalCurrentPrice: {
    value: number | null;
    source: string | null;
    latestCandleAt: string | null;
    freshnessStatus: "FRESH" | "STALE" | "MISSING" | "UNKNOWN";
    ageSeconds: number | null;
  };
  detectedConsumers: Array<{
    path: string;
    value: number | null;
    source: string | null;
    priceDelta: number | null;
    priceDeltaPct: number | null;
    status: CurrentPriceConsumerStatus;
  }>;
  affectedConditions: Array<{
    condition: string;
    previousValue: boolean | null;
    currentPriceBasedValue: boolean | null;
    impact: CurrentPriceConditionImpact;
    explanation: string;
  }>;
  currentPriceReevaluation: {
    trendZoneStatus: CurrentPriceTrendZoneStatus;
    distanceToEntryZonePct: number | null;
    distanceToEntryZoneAbs: number | null;
    priceMoveRequiredDirection: CurrentPriceMoveDirection;
    explanation: string;
  };
  recommendations: string[];
  pricePropagationAudit: {
    staleConsumerCount: number;
    propagatedConsumerCount: number;
    previousAnalysisPriceCount: number;
    notes: string[];
  };
  safety: {
    reviewOnly: true;
    activationAllowed: false;
    paperActivationAllowed: false;
    liveActivationAllowed: false;
    orderAllowed: false;
  };
}

export interface CurrentPriceConsistencyAuditInput {
  mtfEntryCandidatePipeline?: unknown;
  currentPriceEligibleExactSubset?: unknown;
  marketSnapshotCurrentPriceContext?: unknown;
  trendStrategy?: unknown;
  trendTransitionMonitor?: unknown;
  trendManualPaperArmGate?: unknown;
  trendManualPaperArmGateEffective?: unknown;
  trendZoneCandidate?: unknown;
  canonicalMarketRegime?: unknown;
  regimeEvidence?: unknown;
  decisionPrice?: unknown;
  snapshotPrice?: unknown;
}

const SOURCE = "CURRENT_PRICE_CONSISTENCY_AUDIT_V1" as const;
const PRICE_TOLERANCE = 0.000001;
const NEAR_ENTRY_PCT = 0.25;
const EDGE_TOLERANCE_PCT = 0.1;

function obj(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function arr(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function strArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function freshness(value: unknown): CurrentPriceConsistencyAudit["canonicalCurrentPrice"]["freshnessStatus"] {
  return value === "FRESH" || value === "STALE" || value === "MISSING" || value === "UNKNOWN" ? value : "UNKNOWN";
}

function contextPrice(context: Record<string, unknown>): number | null {
  return num(context.currentPrice ?? context.value);
}

function isFreshContext(context: Record<string, unknown>): boolean {
  return contextPrice(context) != null && freshness(context.freshnessStatus) === "FRESH";
}

function fromContext(context: Record<string, unknown>): CurrentPriceConsistencyAudit["canonicalCurrentPrice"] {
  const value = contextPrice(context);
  return {
    value,
    source: str(context.priceSource ?? context.source),
    latestCandleAt: str(context.latestCandleAt),
    freshnessStatus: value == null ? "MISSING" : freshness(context.freshnessStatus),
    ageSeconds: num(context.ageSeconds),
  };
}

function selectCanonical(input: CurrentPriceConsistencyAuditInput): CurrentPriceConsistencyAudit["canonicalCurrentPrice"] {
  const mtfContext = obj(obj(input.mtfEntryCandidatePipeline).currentPriceContext);
  const marketContext = obj(input.marketSnapshotCurrentPriceContext);
  const subsetContext = obj(obj(input.currentPriceEligibleExactSubset).currentPrice);
  if (isFreshContext(mtfContext)) return fromContext(mtfContext);
  if (isFreshContext(marketContext)) return fromContext(marketContext);
  if (contextPrice(subsetContext) != null) return fromContext(subsetContext);
  return {
    value: null,
    source: null,
    latestCandleAt: null,
    freshnessStatus: "MISSING",
    ageSeconds: null,
  };
}

function consumer(
  canonicalPrice: number | null,
  path: string,
  value: unknown,
  source: string | null,
): CurrentPriceConsistencyAudit["detectedConsumers"][number] {
  const n = num(value);
  if (canonicalPrice == null) {
    return { path, value: n, source, priceDelta: null, priceDeltaPct: null, status: n == null ? "MISSING" : "UNKNOWN" };
  }
  if (n == null) return { path, value: null, source, priceDelta: null, priceDeltaPct: null, status: "MISSING" };
  const delta = round2(n - canonicalPrice);
  const deltaPct = round4(Math.abs(n - canonicalPrice) / Math.max(Math.abs(canonicalPrice), Number.EPSILON) * 100);
  return {
    path,
    value: n,
    source,
    priceDelta: delta,
    priceDeltaPct: deltaPct,
    status: Math.abs(n - canonicalPrice) <= PRICE_TOLERANCE ? "MATCH" : "MISMATCH",
  };
}

function entryZoneFrom(input: CurrentPriceConsistencyAuditInput): [number, number] | null {
  const trend = obj(input.trendStrategy);
  const trendZone = obj(input.trendZoneCandidate);
  const canonical = obj(input.canonicalMarketRegime);
  const canonicalZone = obj(canonical.trendZoneCandidate);
  const zone = arr(trend.entryZone).length === 2
    ? arr(trend.entryZone)
    : arr(trendZone.pullbackZone).length === 2
      ? arr(trendZone.pullbackZone)
      : arr(canonicalZone.pullbackZone).length === 2
        ? arr(canonicalZone.pullbackZone)
        : [];
  const a = num(zone[0]);
  const b = num(zone[1]);
  if (a == null || b == null) return null;
  return a <= b ? [a, b] : [b, a];
}

function trendDirection(input: CurrentPriceConsistencyAuditInput): "LONG" | "SHORT" | "UNKNOWN" {
  const trend = obj(input.trendStrategy);
  const zone = obj(input.trendZoneCandidate);
  const raw = str(trend.direction) ?? (str(zone.dir) === "DOWN" ? "SHORT" : str(zone.dir) === "UP" ? "LONG" : null);
  return raw === "LONG" || raw === "SHORT" ? raw : "UNKNOWN";
}

function distanceToZone(price: number | null, zone: [number, number] | null): { pct: number | null; abs: number | null; inside: boolean; near: boolean; move: CurrentPriceMoveDirection } {
  if (price == null || !zone || price <= 0) return { pct: null, abs: null, inside: false, near: false, move: "UNKNOWN" };
  if (price >= zone[0] && price <= zone[1]) return { pct: 0, abs: 0, inside: true, near: true, move: "INSIDE_ENTRY" };
  const edge = price < zone[0] ? zone[0] : zone[1];
  const abs = round2(Math.abs(edge - price));
  const pct = round4(abs / price * 100);
  return {
    pct,
    abs,
    inside: false,
    near: pct <= NEAR_ENTRY_PCT,
    move: price < zone[0] ? "UP_TO_ENTRY" : "DOWN_TO_ENTRY",
  };
}

function regimeDescription(input: CurrentPriceConsistencyAuditInput): { regime: string | null; direction: string | null; notTrend: boolean } {
  const regime = obj(input.canonicalMarketRegime);
  const regimeName = str(regime.regime);
  const direction = str(regime.direction);
  const trendRegime = regimeName === "UPTREND" || regimeName === "DOWNTREND";
  const trendDirection = direction === "BULLISH" || direction === "BEARISH";
  return {
    regime: regimeName,
    direction,
    notTrend: Boolean(regimeName) && (!trendRegime || !trendDirection),
  };
}

function noZoneStatus(input: CurrentPriceConsistencyAuditInput, zone: [number, number] | null): CurrentPriceTrendZoneStatus | null {
  const regime = regimeDescription(input);
  if (regime.notTrend) return "REGIME_NOT_TREND";
  if (zone) return null;
  const trendZone = obj(input.trendZoneCandidate);
  const canonicalZone = obj(obj(input.canonicalMarketRegime).trendZoneCandidate);
  const hasZoneCandidate = Object.keys(trendZone).length > 0 || Object.keys(canonicalZone).length > 0;
  if (!hasZoneCandidate) return "NO_ACTIVE_TREND_ZONE";
  return "MISSING_ZONE_GEOMETRY";
}

function noZoneExplanation(input: CurrentPriceConsistencyAuditInput, status: CurrentPriceTrendZoneStatus): string {
  const regime = regimeDescription(input);
  const regimeText = `${regime.regime ?? "UNKNOWN"} / ${regime.direction ?? "UNKNOWN"}`;
  if (status === "REGIME_NOT_TREND") {
    return `Canonical regime is ${regimeText}; no trend entry zone is built, so price_inside_entry_zone_or_edge cannot be evaluated as a current trend setup.`;
  }
  if (status === "NO_ACTIVE_TREND_ZONE") {
    return `No active trend zone exists under the current regime ${regimeText}, so there is no entry zone to re-evaluate against current price.`;
  }
  if (status === "MISSING_ZONE_GEOMETRY") {
    return `Trend context exists but entry-zone geometry is missing under ${regimeText}, so current price cannot be compared to a trend entry zone.`;
  }
  return "Current price cannot confirm entry zone status.";
}

function reevaluateTrendZone(input: CurrentPriceConsistencyAuditInput, canonicalPrice: number | null): CurrentPriceConsistencyAudit["currentPriceReevaluation"] {
  const trend = obj(input.trendStrategy);
  const trendZone = obj(input.trendZoneCandidate);
  const trendZoneTargets = obj(trendZone.targets);
  const direction = trendDirection(input);
  const zone = entryZoneFrom(input);
  const target1 = num(trend.target1 ?? trendZoneTargets.t1);
  const invalidation = num(trend.invalidation ?? trendZone.invalidation);
  const distance = distanceToZone(canonicalPrice, zone);
  let status: CurrentPriceTrendZoneStatus = "UNKNOWN";
  const explicitNoZone = canonicalPrice != null ? noZoneStatus(input, zone) : null;
  if (explicitNoZone) {
    status = explicitNoZone;
  } else if (canonicalPrice == null || !zone) {
    status = "UNKNOWN";
  } else if (direction === "LONG" && invalidation != null && canonicalPrice <= invalidation) {
    status = "INVALIDATED";
  } else if (direction === "SHORT" && invalidation != null && canonicalPrice >= invalidation) {
    status = "INVALIDATED";
  } else if (direction === "LONG" && target1 != null && canonicalPrice >= target1) {
    status = "PAST_TARGET";
  } else if (direction === "SHORT" && target1 != null && canonicalPrice <= target1) {
    status = "PAST_TARGET";
  } else if (distance.inside) {
    status = "INSIDE_ENTRY_ZONE";
  } else if (distance.near) {
    status = "NEAR_ENTRY_ZONE";
  } else if (direction === "SHORT" && canonicalPrice < zone[0]) {
    status = "WAITING_PULLBACK_TO_ENTRY";
  } else if (direction === "LONG" && canonicalPrice > zone[1]) {
    status = "WAITING_PULLBACK_TO_ENTRY";
  } else if (canonicalPrice < zone[0]) {
    status = "PRICE_BELOW_ENTRY_ZONE";
  } else if (canonicalPrice > zone[1]) {
    status = "PRICE_ABOVE_ENTRY_ZONE";
  }
  const explanation = status === "WAITING_PULLBACK_TO_ENTRY" && direction === "SHORT"
    ? "Current price is below the SHORT entry zone; wait for pullback to entry before treating the zone as current."
    : status === "WAITING_PULLBACK_TO_ENTRY" && direction === "LONG"
      ? "Current price is above the LONG entry zone; wait for pullback to entry before treating the zone as current."
      : status === "INSIDE_ENTRY_ZONE"
        ? "Current price is inside the entry zone."
        : status === "NEAR_ENTRY_ZONE"
        ? "Current price is near the entry zone."
          : noZoneExplanation(input, status);
  return {
    trendZoneStatus: status,
    distanceToEntryZonePct: distance.pct,
    distanceToEntryZoneAbs: distance.abs,
    priceMoveRequiredDirection: status === "REGIME_NOT_TREND" || status === "NO_ACTIVE_TREND_ZONE" || status === "MISSING_ZONE_GEOMETRY"
      ? "NO_ZONE"
      : distance.move,
    explanation,
  };
}

function currentPriceInsideOrEdge(price: number | null, zone: [number, number] | null): boolean | null {
  if (price == null || !zone || price <= 0) return null;
  if (price >= zone[0] && price <= zone[1]) return true;
  const edge = price < zone[0] ? zone[0] : zone[1];
  return Math.abs(edge - price) / Math.max(Math.abs(price), Number.EPSILON) * 100 <= EDGE_TOLERANCE_PCT;
}

function impact(previous: boolean | null, current: boolean | null): CurrentPriceConditionImpact {
  if (previous == null || current == null) return "UNKNOWN";
  if (previous === current) return "NO_CHANGE";
  return previous && !current ? "PASS_TO_FAIL" : "FAIL_TO_PASS";
}

function affectedConditions(input: CurrentPriceConsistencyAuditInput, canonicalPrice: number | null): CurrentPriceConsistencyAudit["affectedConditions"] {
  const rawGate = obj(input.trendManualPaperArmGate);
  const effectiveGate = obj(input.trendManualPaperArmGateEffective);
  const passed = [...strArray(rawGate.passedConditions), ...strArray(effectiveGate.passedConditions)];
  const failed = [...strArray(rawGate.failedConditions), ...strArray(effectiveGate.failedConditions)];
  const condition = "price_inside_entry_zone_or_edge";
  const previousValue = passed.includes(condition) ? true : failed.includes(condition) ? false : null;
  const zone = entryZoneFrom(input);
  const explicitNoZone = canonicalPrice != null ? noZoneStatus(input, zone) : null;
  const currentPriceBasedValue = explicitNoZone ? false : currentPriceInsideOrEdge(canonicalPrice, zone);
  const currentImpact = impact(previousValue, currentPriceBasedValue);
  return [{
    condition,
    previousValue,
    currentPriceBasedValue,
    impact: currentImpact,
    explanation: explicitNoZone
      ? `${noZoneExplanation(input, explicitNoZone)} No active trend zone exists, so this condition cannot pass.`
      : currentImpact === "PASS_TO_FAIL"
      ? "A previous in-zone state is not current truth after re-evaluation with canonical current price."
      : "Current price re-evaluation does not downgrade this condition.",
  }];
}

function pricePropagationAudit(
  status: CurrentPriceConsistencyStatus,
  consumers: CurrentPriceConsistencyAudit["detectedConsumers"],
): CurrentPriceConsistencyAudit["pricePropagationAudit"] {
  const staleConsumerCount = consumers.filter((item) => item.status === "MISMATCH" || item.status === "STALE").length;
  const propagatedConsumerCount = consumers.filter((item) => item.status === "MATCH").length;
  const previousAnalysisPriceCount = consumers.filter((item) => item.status === "MISMATCH" && item.value != null).length;
  const notes = staleConsumerCount > 0
    ? [
        "Some diagnostics still contain a price different from the canonical current price.",
        "Treat mismatched values as previous analysis or snapshot context, not current price.",
      ]
    : ["All available current-price consumers match the canonical current price."];
  if (status === "STALE_TREND_PRICE_CONSUMERS") {
    notes.push("Canonical current price source is stale; refresh market snapshot before interpreting readiness.");
  }
  return {
    staleConsumerCount,
    propagatedConsumerCount,
    previousAnalysisPriceCount,
    notes,
  };
}

function safety(): CurrentPriceConsistencyAudit["safety"] {
  return {
    reviewOnly: true,
    activationAllowed: false,
    paperActivationAllowed: false,
    liveActivationAllowed: false,
    orderAllowed: false,
  };
}

export function buildCurrentPriceConsistencyAudit(input: CurrentPriceConsistencyAuditInput = {}): CurrentPriceConsistencyAudit {
  const canonical = selectCanonical(input);
  const canonicalPrice = canonical.value;
  const trend = obj(input.trendStrategy);
  const transition = obj(obj(input.trendTransitionMonitor).watchedFields);
  const subset = obj(obj(input.currentPriceEligibleExactSubset).currentPrice);
  const mtfContext = obj(obj(input.mtfEntryCandidatePipeline).currentPriceContext);
  const consumers = [
    consumer(canonicalPrice, "mtfEntryCandidatePipeline.currentPriceContext.currentPrice", mtfContext.currentPrice, "mtfEntryCandidatePipeline.currentPriceContext"),
    consumer(canonicalPrice, "currentPriceEligibleExactSubset.currentPrice.value", subset.value, str(subset.source)),
    consumer(canonicalPrice, "trendStrategy.currentPrice", trend.currentPrice, "trendStrategy.currentPrice"),
    consumer(canonicalPrice, "trendTransitionMonitor.watchedFields.currentPrice", transition.currentPrice, "trendTransitionMonitor.watchedFields.currentPrice"),
    consumer(canonicalPrice, "snapshotPrice", input.snapshotPrice, "paperLoopDiagnostics.snapshotPrice"),
    consumer(canonicalPrice, "decisionPrice", input.decisionPrice, "paperLoopDiagnostics.decisionPrice"),
  ];
  const mismatches = consumers.filter((item) => item.status === "MISMATCH");
  const status: CurrentPriceConsistencyStatus = canonicalPrice == null || canonical.freshnessStatus === "MISSING"
    ? "MISSING_CURRENT_PRICE"
    : canonical.freshnessStatus === "STALE"
      ? "STALE_TREND_PRICE_CONSUMERS"
      : mismatches.length > 0
        ? "PRICE_MISMATCH_DETECTED"
        : "CONSISTENT";
  const recommendations = status === "CONSISTENT"
    ? ["Continue using canonical current price for trend gate diagnostics."]
    : ["Use canonical current price for all trend gate diagnostics before interpreting readiness."];
  return {
    schemaVersion: 1,
    source: SOURCE,
    status,
    canonicalCurrentPrice: canonical,
    detectedConsumers: consumers,
    affectedConditions: affectedConditions(input, canonicalPrice),
    currentPriceReevaluation: reevaluateTrendZone(input, canonicalPrice),
    recommendations,
    pricePropagationAudit: pricePropagationAudit(status, consumers),
    safety: safety(),
  };
}
