// dashboard/lib/trend/entryCandidateResolver.ts
// D8.0 - pure, diagnostics-only entry candidate resolver.

export const ENTRY_RR_THRESHOLD = 1.2;
export const ENTRY_RR_THRESHOLD_SOURCE = "trendStrategy.DEFAULT_MIN_RR" as const;

const NEAR_ZONE_TOLERANCE_PCT = 0.25;
const FIVE_MINUTE_FRESH_MS = 15 * 60 * 1000;

export type EntryCandidateResolutionStatus =
  | "NO_ALIGNED_SETUP"
  | "WAITING_PULLBACK"
  | "RR_REPAIR_REQUIRED"
  | "RR_REPAIRED_REVIEW_ONLY"
  | "COUNTER_REGIME_ONLY"
  | "CLEAN_REVIEW_CANDIDATE"
  | "NO_TRADE_BAD_RR";

export type EntryCandidateDirection = "LONG" | "SHORT" | "UNKNOWN";

export type EntryPriceLocation =
  | "INSIDE_LONG_ZONE"
  | "NEAR_LONG_ZONE"
  | "ABOVE_LONG_ZONE"
  | "BELOW_LONG_ZONE"
  | "INSIDE_SHORT_ZONE"
  | "NEAR_SHORT_ZONE"
  | "ABOVE_SHORT_ZONE"
  | "BELOW_SHORT_ZONE"
  | "NO_ZONE"
  | "UNKNOWN";

export type EntryRrScenarioName =
  | "ZONE_LOW_ENTRY"
  | "ZONE_MID_ENTRY"
  | "ZONE_HIGH_ENTRY"
  | "CONFIRMATION_ENTRY"
  | "TIGHT_STOP_ENTRY"
  | "EXTENDED_TARGET_ENTRY";

export interface EntryRrScenario {
  name: EntryRrScenarioName;
  available: boolean;
  direction: EntryCandidateDirection;
  entry: number | null;
  stopLoss: number | null;
  target: number | null;
  riskDistance: number | null;
  rewardDistance: number | null;
  rr: number | null;
  meetsThreshold: boolean;
  sources: string[];
  notes: string[];
}

export interface RejectedOppositeCandidate {
  id: string;
  direction: EntryCandidateDirection;
  entry: number | null;
  stopLoss: number | null;
  target1: number | null;
  currentPriceStatus: string;
  qualityStatus: string;
  actionability: string;
  blockers: string[];
  doNotUseAsEntry: true;
}

export interface EntryCandidateResolutionInput {
  canonicalMarketRegime?: unknown;
  trendStrategy?: unknown;
  currentPriceConsistencyAudit?: unknown;
  currentPriceEligibleExactSubset?: unknown;
  regimeAwareExactCandidateWatchlist?: unknown;
  mtfEntryCandidatePipeline?: unknown;
  mtfExactZoneFailureAttribution?: unknown;
  multiTimeframeIndicatorEvidence?: unknown;
}

export interface EntryCandidateResolution {
  schemaVersion: 1;
  source: "ENTRY_CANDIDATE_RESOLVER_V1";
  status: EntryCandidateResolutionStatus;
  alignedDirection: EntryCandidateDirection;
  priceLocation: EntryPriceLocation;
  currentPrice: number | null;
  alignedEntryZone: [number, number] | null;
  rrThreshold: number;
  rrThresholdSource: typeof ENTRY_RR_THRESHOLD_SOURCE;
  rrScenarios: EntryRrScenario[];
  bestReviewCandidate: EntryRrScenario | null;
  rejectedOppositeCandidates: RejectedOppositeCandidate[];
  blockers: string[];
  nextAction: string;
  doNotDo: string[];
  activationAllowed: false;
  paperActivationAllowed: false;
  liveActivationAllowed: false;
  reviewOnly: true;
  shadowOnly: true;
}

type AnyObj = Record<string, unknown>;

function obj(value: unknown): AnyObj {
  return value && typeof value === "object" && !Array.isArray(value) ? value as AnyObj : {};
}

function arr(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function str(value: unknown, fallback = "UNKNOWN"): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function normalizeZone(value: unknown): [number, number] | null {
  if (!Array.isArray(value) || value.length !== 2 || !finite(value[0]) || !finite(value[1])) return null;
  return value[0] <= value[1] ? [value[0], value[1]] : [value[1], value[0]];
}

function alignedDirection(regimeInput: unknown): EntryCandidateDirection {
  const regime = obj(regimeInput);
  const canonicalDirection = str(regime.direction);
  const canonicalRegime = str(regime.regime);

  if (canonicalDirection === "BULLISH" || canonicalRegime === "UPTREND") return "LONG";
  if (canonicalDirection === "BEARISH" || canonicalRegime === "DOWNTREND") return "SHORT";
  return "UNKNOWN";
}

function canonicalCurrentPrice(auditInput: unknown, strategyInput: unknown): number | null {
  const audit = obj(auditInput);
  const canonical = obj(audit.canonicalCurrentPrice);
  const strategy = obj(strategyInput);
  if (finite(canonical.value)) return canonical.value;
  return finite(strategy.currentPrice) ? strategy.currentPrice : null;
}

function priceLocation(
  direction: EntryCandidateDirection,
  currentPrice: number | null,
  zone: [number, number] | null,
): EntryPriceLocation {
  if (!zone) return "NO_ZONE";
  if (!finite(currentPrice) || direction === "UNKNOWN") return "UNKNOWN";
  const [low, high] = zone;
  const suffix = direction === "LONG" ? "LONG_ZONE" : "SHORT_ZONE";
  if (currentPrice >= low && currentPrice <= high) return `INSIDE_${suffix}` as EntryPriceLocation;

  const edge = currentPrice < low ? low : high;
  const distancePct = Math.abs(currentPrice - edge) / Math.max(Math.abs(currentPrice), Number.EPSILON) * 100;
  if (distancePct <= NEAR_ZONE_TOLERANCE_PCT) return `NEAR_${suffix}` as EntryPriceLocation;
  return `${currentPrice > high ? "ABOVE" : "BELOW"}_${suffix}` as EntryPriceLocation;
}

function rrGeometry(
  direction: EntryCandidateDirection,
  entry: number | null,
  stopLoss: number | null,
  target: number | null,
): { riskDistance: number; rewardDistance: number; rr: number } | null {
  if (direction === "UNKNOWN" || !finite(entry) || !finite(stopLoss) || !finite(target)) return null;
  const riskDistance = direction === "LONG" ? entry - stopLoss : stopLoss - entry;
  const rewardDistance = direction === "LONG" ? target - entry : entry - target;
  if (riskDistance <= 0 || rewardDistance <= 0) return null;
  return { riskDistance, rewardDistance, rr: rewardDistance / riskDistance };
}

function scenario(
  name: EntryRrScenarioName,
  direction: EntryCandidateDirection,
  entry: number | null,
  stopLoss: number | null,
  target: number | null,
  sources: string[],
  unavailableNote: string,
): EntryRrScenario {
  const geometry = rrGeometry(direction, entry, stopLoss, target);
  return {
    name,
    available: geometry != null,
    direction,
    entry: geometry ? entry : null,
    stopLoss: geometry ? stopLoss : null,
    target: geometry ? target : null,
    riskDistance: geometry?.riskDistance ?? null,
    rewardDistance: geometry?.rewardDistance ?? null,
    rr: geometry?.rr ?? null,
    meetsThreshold: geometry != null && geometry.rr >= ENTRY_RR_THRESHOLD,
    sources,
    notes: geometry ? [] : [unavailableNote],
  };
}

function buildScenarios(
  direction: EntryCandidateDirection,
  strategyInput: unknown,
  evidenceInput: unknown,
  currentPrice: number | null,
  zone: [number, number] | null,
): EntryRrScenario[] {
  const strategy = obj(strategyInput);
  const invalidation = finite(strategy.invalidation) ? strategy.invalidation : null;
  const target1 = finite(strategy.target1) ? strategy.target1 : null;
  const target2 = finite(strategy.target2) ? strategy.target2 : null;
  const zoneLow = zone?.[0] ?? null;
  const zoneHigh = zone?.[1] ?? null;
  const zoneMid = zone ? (zone[0] + zone[1]) / 2 : null;
  const confirmationStatus = str(strategy.confirmationStatus);
  const explicitConfirmationEntry = finite(strategy.confirmationEntry) ? strategy.confirmationEntry : null;
  const currentInsideZone = zone != null && finite(currentPrice) && currentPrice >= zone[0] && currentPrice <= zone[1];
  const confirmationEntry = explicitConfirmationEntry ?? (
    confirmationStatus === "CONFIRMED" && currentInsideZone ? currentPrice : null
  );
  const evidence5m = obj(obj(evidenceInput)["5M"]);
  const freshness5m = obj(evidence5m.freshness);
  const atr = finite(evidence5m.atr) && evidence5m.atr > 0 ? evidence5m.atr : null;
  const atrAgeMs = finite(freshness5m.ageMs) ? freshness5m.ageMs : null;
  const freshAtr = atr != null && atrAgeMs != null && atrAgeMs >= 0 && atrAgeMs <= FIVE_MINUTE_FRESH_MS;
  const tightStop = freshAtr && zone
    ? direction === "LONG"
      ? zone[0] - atr
      : direction === "SHORT"
        ? zone[1] + atr
        : null
    : null;

  return [
    scenario("ZONE_LOW_ENTRY", direction, zoneLow, invalidation, target1, ["trendStrategy.entryZone[0]", "trendStrategy.invalidation", "trendStrategy.target1"], "aligned zone low, invalidation, or target1 is unavailable or invalid"),
    scenario("ZONE_MID_ENTRY", direction, zoneMid, invalidation, target1, ["trendStrategy.entryZone.mid", "trendStrategy.invalidation", "trendStrategy.target1"], "aligned zone midpoint, invalidation, or target1 is unavailable or invalid"),
    scenario("ZONE_HIGH_ENTRY", direction, zoneHigh, invalidation, target1, ["trendStrategy.entryZone[1]", "trendStrategy.invalidation", "trendStrategy.target1"], "aligned zone high, invalidation, or target1 is unavailable or invalid"),
    scenario("CONFIRMATION_ENTRY", direction, confirmationEntry, invalidation, target1, ["trendStrategy.confirmationStatus", "currentPriceConsistencyAudit.canonicalCurrentPrice"], "confirmed entry evidence is unavailable"),
    scenario("TIGHT_STOP_ENTRY", direction, zoneMid, tightStop, target1, ["multiTimeframeIndicatorEvidence.5M.atr", "trendStrategy.entryZone.mid", "trendStrategy.target1"], "fresh finite 5M ATR or aligned zone geometry is unavailable"),
    scenario("EXTENDED_TARGET_ENTRY", direction, zoneMid, invalidation, target2, ["trendStrategy.entryZone.mid", "trendStrategy.invalidation", "trendStrategy.target2"], "target2 or valid extended-target geometry is unavailable"),
  ];
}

function watchCandidates(input: EntryCandidateResolutionInput): AnyObj[] {
  const watchlist = obj(input.regimeAwareExactCandidateWatchlist);
  const watched = arr(watchlist.topWatchCandidates).map(obj);
  if (watched.length) return watched;
  const subset = obj(input.currentPriceEligibleExactSubset);
  return arr(subset.topCandidates).map(obj);
}

function rejectOppositeCandidates(
  candidates: AnyObj[],
  direction: EntryCandidateDirection,
): RejectedOppositeCandidate[] {
  if (direction === "UNKNOWN") return [];
  const opposite = direction === "LONG" ? "SHORT" : "LONG";
  return candidates
    .filter((candidate) => str(candidate.direction) === opposite)
    .map((candidate, index) => {
      const qualityStatus = str(candidate.qualityStatus);
      const sourceBlockers = arr(candidate.blockers).filter((item): item is string => typeof item === "string");
      const blockers = unique([
        "REGIME_DIRECTION_CONFLICT",
        ...sourceBlockers,
        ...(qualityStatus !== "UNKNOWN" && qualityStatus !== "CLEAN" ? [qualityStatus] : []),
      ]);
      return {
        id: str(candidate.id, `opposite-${index + 1}`),
        direction: opposite,
        entry: finite(candidate.entry) ? candidate.entry : null,
        stopLoss: finite(candidate.stopLoss) ? candidate.stopLoss : null,
        target1: finite(candidate.target1) ? candidate.target1 : null,
        currentPriceStatus: str(candidate.currentPriceStatus),
        qualityStatus,
        actionability: str(candidate.actionability, "COUNTER_REGIME_REJECTED"),
        blockers,
        doNotUseAsEntry: true,
      };
    });
}

function hasCleanAlignedCandidate(candidates: AnyObj[], direction: EntryCandidateDirection): boolean {
  return candidates.some((candidate) =>
    str(candidate.direction) === direction &&
    str(candidate.directionAlignment) === "ALIGNED" &&
    (candidate.clean === true || (
      str(candidate.qualityStatus) === "CLEAN" && str(candidate.actionability) === "CLEAN_REVIEW_ONLY"
    )),
  );
}

function alignedCandidateBlockers(candidates: AnyObj[], direction: EntryCandidateDirection): string[] {
  return unique(candidates
    .filter((candidate) => str(candidate.direction) === direction)
    .flatMap((candidate) => {
      const qualityStatus = str(candidate.qualityStatus);
      return [
        ...arr(candidate.blockers).filter((item): item is string => typeof item === "string"),
        ...(qualityStatus !== "UNKNOWN" && qualityStatus !== "CLEAN" ? [qualityStatus] : []),
      ];
    }));
}

function statusFor(input: {
  direction: EntryCandidateDirection;
  zone: [number, number] | null;
  location: EntryPriceLocation;
  rejectedCount: number;
  baseRr: number | null;
  cleanAlignedCandidate: boolean;
  scenarios: EntryRrScenario[];
}): EntryCandidateResolutionStatus {
  if (input.direction === "UNKNOWN") return "NO_ALIGNED_SETUP";
  if (!input.zone && input.rejectedCount > 0) return "COUNTER_REGIME_ONLY";
  if (!input.zone || input.location === "UNKNOWN") return "NO_ALIGNED_SETUP";
  if (!input.location.startsWith("INSIDE_")) return "WAITING_PULLBACK";

  const basePasses = finite(input.baseRr) && input.baseRr >= ENTRY_RR_THRESHOLD;
  if (basePasses && input.cleanAlignedCandidate) return "CLEAN_REVIEW_CANDIDATE";
  if (basePasses) return "NO_ALIGNED_SETUP";

  const repairNames = new Set<EntryRrScenarioName>([
    "ZONE_LOW_ENTRY",
    "ZONE_HIGH_ENTRY",
    "CONFIRMATION_ENTRY",
    "TIGHT_STOP_ENTRY",
    "EXTENDED_TARGET_ENTRY",
  ]);
  const repairs = input.scenarios.filter((item) => repairNames.has(item.name));
  if (repairs.some((item) => item.available && item.meetsThreshold)) return "RR_REPAIRED_REVIEW_ONLY";

  const evidenceBackedRepairAvailable = repairs.some((item) =>
    item.available && ["CONFIRMATION_ENTRY", "TIGHT_STOP_ENTRY", "EXTENDED_TARGET_ENTRY"].includes(item.name),
  );
  return evidenceBackedRepairAvailable ? "NO_TRADE_BAD_RR" : "RR_REPAIR_REQUIRED";
}

function statusDetails(
  status: EntryCandidateResolutionStatus,
  direction: EntryCandidateDirection,
): { blockers: string[]; nextAction: string } {
  switch (status) {
    case "WAITING_PULLBACK":
      return { blockers: ["CURRENT_PRICE_OUTSIDE_ALIGNED_ENTRY_ZONE"], nextAction: `wait for current price to enter the aligned ${direction} pullback zone` };
    case "RR_REPAIR_REQUIRED":
      return { blockers: ["BASE_RR_BELOW_THRESHOLD", "RR_REPAIR_EVIDENCE_MISSING"], nextAction: "wait for fresh confirmation, ATR, or extended-target evidence before review" };
    case "RR_REPAIRED_REVIEW_ONLY":
      return { blockers: ["BASE_RR_BELOW_THRESHOLD", "REVIEW_ONLY_REPAIRED_GEOMETRY"], nextAction: "review the repaired RR scenario; do not treat it as an entry signal" };
    case "COUNTER_REGIME_ONLY":
      return { blockers: ["NO_ALIGNED_ENTRY_ZONE", "REGIME_DIRECTION_CONFLICT"], nextAction: `wait for an aligned ${direction} setup or a canonical regime change` };
    case "CLEAN_REVIEW_CANDIDATE":
      return { blockers: [], nextAction: "review aligned geometry and confirmation; no activation or order action" };
    case "NO_TRADE_BAD_RR":
      return { blockers: ["BASE_RR_BELOW_THRESHOLD", "RR_REPAIR_BELOW_THRESHOLD"], nextAction: "reject the current geometry and wait for better entry, stop, or target evidence" };
    default:
      return { blockers: ["NO_ALIGNED_SETUP"], nextAction: "wait for a confirmed canonical trend and aligned entry-zone evidence" };
  }
}

export function resolveEntryCandidate(input: EntryCandidateResolutionInput): EntryCandidateResolution {
  const strategy = obj(input.trendStrategy);
  const direction = alignedDirection(input.canonicalMarketRegime);
  const strategyDirection = str(strategy.direction);
  const zone = strategyDirection === direction ? normalizeZone(strategy.entryZone) : null;
  const currentPrice = canonicalCurrentPrice(input.currentPriceConsistencyAudit, strategy);
  const location = priceLocation(direction, currentPrice, zone);
  const candidates = watchCandidates(input);
  const rejectedOppositeCandidates = rejectOppositeCandidates(candidates, direction);
  const alignedBlockers = alignedCandidateBlockers(candidates, direction);
  const rrScenarios = buildScenarios(
    direction,
    strategy,
    input.multiTimeframeIndicatorEvidence,
    currentPrice,
    zone,
  );
  const bestReviewCandidate = rrScenarios.reduce<EntryRrScenario | null>((best, candidate) => {
    if (!candidate.available || !finite(candidate.rr)) return best;
    if (!best || !finite(best.rr) || candidate.rr > best.rr) return candidate;
    return best;
  }, null);
  const baseRr = finite(strategy.rewardRisk) ? strategy.rewardRisk : null;
  const status = statusFor({
    direction,
    zone,
    location,
    rejectedCount: rejectedOppositeCandidates.length,
    baseRr,
    cleanAlignedCandidate: hasCleanAlignedCandidate(candidates, direction),
    scenarios: rrScenarios,
  });
  const details = statusDetails(status, direction);

  return {
    schemaVersion: 1,
    source: "ENTRY_CANDIDATE_RESOLVER_V1",
    status,
    alignedDirection: direction,
    priceLocation: location,
    currentPrice,
    alignedEntryZone: zone,
    rrThreshold: ENTRY_RR_THRESHOLD,
    rrThresholdSource: ENTRY_RR_THRESHOLD_SOURCE,
    rrScenarios,
    bestReviewCandidate,
    rejectedOppositeCandidates,
    blockers: unique([
      ...details.blockers,
      ...alignedBlockers,
      ...rejectedOppositeCandidates.flatMap((candidate) => candidate.blockers),
    ]),
    nextAction: details.nextAction,
    doNotDo: [
      "do not treat diagnostics as an entry signal",
      "do not activate paper or live trading",
      "do not place or cancel orders",
    ],
    activationAllowed: false,
    paperActivationAllowed: false,
    liveActivationAllowed: false,
    reviewOnly: true,
    shadowOnly: true,
  };
}
