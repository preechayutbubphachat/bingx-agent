// dashboard/lib/trend/mtfObFvgRefinementShadow.ts
// Phase T-3H-6-c - MTF OB/FVG entry refinement shadow diagnostics.
//
// SAFETY:
//   - Pure display helper. No I/O, no env reads, no decision or execution imports.
//   - Estimates whether moving the hypothetical entry closer to invalidation could
//     improve reward/risk. It never changes the real entry, stop, target, or threshold.
//   - When exact OB/FVG zones are unavailable, the result is explicitly heuristic.

export type MtfDirection = "LONG" | "SHORT";

export type MtfObFvgDataStatus = "ACTUAL_OB_FVG_AVAILABLE" | "HEURISTIC_ESTIMATE_ONLY" | "INSUFFICIENT_DATA";

export type MtfObFvgClassification =
  | "NO_DATA"
  | "NO_REFINEMENT_AVAILABLE"
  | "REFINEMENT_IMPROVES_RR"
  | "REFINEMENT_STILL_FAILS_COST"
  | "TARGET_TOO_CLOSE"
  | "STOP_TOO_WIDE"
  | "ENTRY_GEOMETRY_NEAR_MISS"
  | "COST_DRAG_DOMINANT"
  | "SHADOW_ONLY";

export interface PriceZone {
  low: number;
  high: number;
}

export interface MtfObFvgRefinementShadowInput {
  direction?: MtfDirection | null;
  currentEntry?: number | null;
  currentStop?: number | null;
  currentTarget?: number | null;
  currentRawRR?: number | null;
  requiredRR?: number | null;
  feePct?: number | null;
  slippagePct?: number | null;
  regime?: string | null;
  adx?: number | null;
  atr?: number | null;
  atrPct?: number | null;
  bbw?: number | null;
  currentPrice?: number | null;
  distanceToEntryZonePct?: number | null;
  entryZone?: [number, number] | null;
  optionalObZone?: PriceZone | null;
  optionalFvgZone?: PriceZone | null;
  optionalLiquidityTarget?: number | null;
  optionalInvalidation?: number | null;
}

export interface MtfObFvgRefinementShadowResult {
  available: boolean;
  dataStatus: MtfObFvgDataStatus;
  classification: MtfObFvgClassification;
  reason: string;
  direction: MtfDirection | null;
  currentRawRR: number | null;
  currentNetRR: number | null;
  requiredRR: number | null;
  refinedEntryEstimate: number | null;
  refinedStopEstimate: number | null;
  refinedTargetEstimate: number | null;
  refinedRawRR: number | null;
  refinedNetRR: number | null;
  rrImprovement: number | null;
  netRrImprovement: number | null;
  currentRiskDistance: number | null;
  currentRewardDistance: number | null;
  refinedRiskDistance: number | null;
  refinedRewardDistance: number | null;
  currentCostR: number | null;
  refinedCostR: number | null;
  wouldPassStaticRR: boolean | null;
  wouldPassNetRR: boolean | null;
  confidence: "low" | "medium" | "high";
  qualityScore: number;
  missingFields: string[];
  notes: string[];
  shadowOnly: true;
  paperActivationAllowed: false;
  liveActivationAllowed: false;
  exchangeOrderAllowed: false;
}

const fin = (v: number | null | undefined): v is number => typeof v === "number" && Number.isFinite(v);

function round4(v: number): number {
  return Math.round(v * 10_000) / 10_000;
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function zoneFromTuple(z: [number, number] | null | undefined): PriceZone | null {
  if (!z || !fin(z[0]) || !fin(z[1])) return null;
  return { low: Math.min(z[0], z[1]), high: Math.max(z[0], z[1]) };
}

function normalizeZone(z: PriceZone | null | undefined): PriceZone | null {
  if (!z || !fin(z.low) || !fin(z.high)) return null;
  return { low: Math.min(z.low, z.high), high: Math.max(z.low, z.high) };
}

function rrFor(direction: MtfDirection, entry: number, stop: number, target: number): { risk: number; reward: number; rawRR: number } | null {
  const risk = direction === "LONG" ? entry - stop : stop - entry;
  const reward = direction === "LONG" ? target - entry : entry - target;
  if (risk <= 0 || reward <= 0) return null;
  return { risk: round4(risk), reward: round4(reward), rawRR: round4(reward / risk) };
}

function costR(entry: number, riskDistance: number, feePct?: number | null, slippagePct?: number | null): number | null {
  if (riskDistance <= 0) return null;
  const perSidePct = (fin(feePct) ? feePct : 0) + (fin(slippagePct) ? slippagePct : 0);
  if (perSidePct <= 0) return 0;
  return round4((((perSidePct * 2) / 100) * entry) / riskDistance);
}

function conservativeRefinedEntry(direction: MtfDirection, entry: number, stop: number, desired: number): number | null {
  const risk = Math.abs(entry - stop);
  if (risk <= 0) return null;

  // Never assume a refinement can remove more than half the original risk.
  const maxMove = risk * 0.5;
  const desiredMove = Math.abs(desired - entry);
  const move = Math.min(maxMove, desiredMove);
  if (move <= 0) return null;

  return direction === "LONG" ? round4(entry - move) : round4(entry + move);
}

function chooseZoneCandidate(direction: MtfDirection, entry: number, stop: number, zones: PriceZone[]): number | null {
  const min = Math.min(entry, stop);
  const max = Math.max(entry, stop);
  const candidates = zones
    .flatMap((z) => [z.low, z.high])
    .filter((v) => v > min && v < max);
  if (candidates.length === 0) return null;
  return direction === "LONG" ? Math.min(...candidates) : Math.max(...candidates);
}

function scoreQuality(input: MtfObFvgRefinementShadowInput, classification: MtfObFvgClassification, hasExactZone: boolean): number {
  let score = 0;
  const dir = input.direction;
  const regime = (input.regime ?? "").toUpperCase();
  if ((dir === "SHORT" && (regime.includes("DOWN") || regime.includes("SHORT"))) || (dir === "LONG" && (regime.includes("UP") || regime.includes("LONG")))) {
    score += 20;
  }
  if (fin(input.adx) && input.adx >= 25) score += 15;
  else if (fin(input.adx) && input.adx >= 20) score += 10;

  if (fin(input.currentRawRR) && fin(input.requiredRR)) {
    const gap = input.requiredRR - input.currentRawRR;
    if (gap > 0 && gap <= 0.15) score += 15;
  }

  if (fin(input.distanceToEntryZonePct) && Math.abs(input.distanceToEntryZonePct) <= 1) score += 10;
  if (fin(input.feePct) || fin(input.slippagePct)) score += 5;
  if (fin(input.atrPct) && input.atrPct > 0 && input.atrPct <= 2) score += 5;
  if (fin(input.bbw) && input.bbw > 0 && input.bbw <= 0.08) score += 5;
  if (hasExactZone) score += 20;

  if (classification === "COST_DRAG_DOMINANT" || classification === "REFINEMENT_STILL_FAILS_COST") score -= 15;
  if (classification === "TARGET_TOO_CLOSE" || classification === "STOP_TOO_WIDE") score -= 10;

  return clamp(Math.round(score), 0, 100);
}

function blank(
  classification: MtfObFvgClassification,
  reason: string,
  missingFields: string[] = [],
  dataStatus: MtfObFvgDataStatus = "INSUFFICIENT_DATA",
): MtfObFvgRefinementShadowResult {
  return {
    available: false,
    dataStatus,
    classification,
    reason,
    direction: null,
    currentRawRR: null,
    currentNetRR: null,
    requiredRR: null,
    refinedEntryEstimate: null,
    refinedStopEstimate: null,
    refinedTargetEstimate: null,
    refinedRawRR: null,
    refinedNetRR: null,
    rrImprovement: null,
    netRrImprovement: null,
    currentRiskDistance: null,
    currentRewardDistance: null,
    refinedRiskDistance: null,
    refinedRewardDistance: null,
    currentCostR: null,
    refinedCostR: null,
    wouldPassStaticRR: null,
    wouldPassNetRR: null,
    confidence: "low",
    qualityScore: 0,
    missingFields,
    notes: ["shadow-only", "no-entry-change", "no-threshold-change"],
    shadowOnly: true,
    paperActivationAllowed: false,
    liveActivationAllowed: false,
    exchangeOrderAllowed: false,
  };
}

export function computeMtfObFvgRefinementShadow(input: MtfObFvgRefinementShadowInput): MtfObFvgRefinementShadowResult {
  const missingFields: string[] = [];
  const direction = input.direction === "LONG" || input.direction === "SHORT" ? input.direction : null;
  if (!direction) missingFields.push("direction");
  if (!fin(input.currentEntry)) missingFields.push("currentEntry");
  if (!fin(input.currentStop)) missingFields.push("currentStop");
  if (!fin(input.currentTarget)) missingFields.push("currentTarget");
  if (!fin(input.requiredRR)) missingFields.push("requiredRR");

  if (missingFields.length > 0 || !direction || !fin(input.currentEntry) || !fin(input.currentStop) || !fin(input.currentTarget) || !fin(input.requiredRR)) {
    return blank("NO_DATA", "missing required geometry inputs", missingFields);
  }

  const current = rrFor(direction, input.currentEntry, input.currentStop, input.currentTarget);
  if (!current) {
    return blank("NO_DATA", "entry/stop/target geometry is invalid for direction", ["validGeometry"]);
  }

  const currentRawRR = fin(input.currentRawRR) && input.currentRawRR > 0 ? round4(input.currentRawRR) : current.rawRR;
  const currentCostR = costR(input.currentEntry, current.risk, input.feePct, input.slippagePct);
  const currentNetRR = currentCostR == null ? null : round4(currentRawRR - currentCostR);

  const zones = [normalizeZone(input.optionalObZone), normalizeZone(input.optionalFvgZone)].filter((z): z is PriceZone => z != null);
  const hasExactZone = zones.length > 0;
  const zoneCandidate = chooseZoneCandidate(direction, input.currentEntry, input.currentStop, zones);
  const entryZone = zoneFromTuple(input.entryZone);
  const entryZoneCandidate = entryZone ? chooseZoneCandidate(direction, input.currentEntry, input.currentStop, [entryZone]) : null;

  let dataStatus: MtfObFvgDataStatus = "INSUFFICIENT_DATA";
  let desiredEntry: number | null = null;
  const notes = ["shadow-only", "no-entry-change", "no-threshold-change"];

  if (zoneCandidate != null) {
    desiredEntry = zoneCandidate;
    dataStatus = "ACTUAL_OB_FVG_AVAILABLE";
    notes.push("exact-ob-fvg-zone-used-for-shadow");
  } else if (entryZoneCandidate != null) {
    desiredEntry = entryZoneCandidate;
    dataStatus = "HEURISTIC_ESTIMATE_ONLY";
    notes.push("entry-zone-edge-used-as-heuristic");
  } else if (fin(input.distanceToEntryZonePct) || fin(input.currentPrice)) {
    const risk = Math.abs(input.currentEntry - input.currentStop);
    desiredEntry = direction === "LONG" ? input.currentEntry - risk * 0.25 : input.currentEntry + risk * 0.25;
    dataStatus = "HEURISTIC_ESTIMATE_ONLY";
    notes.push("geometry-refinement-estimate-only");
  }

  if (desiredEntry == null) {
    return {
      ...blank("NO_REFINEMENT_AVAILABLE", "no exact OB/FVG zone or usable entry-zone context", ["optionalObZone", "optionalFvgZone", "entryZone"], "INSUFFICIENT_DATA"),
      direction,
      currentRawRR,
      currentNetRR,
      requiredRR: round4(input.requiredRR),
      currentRiskDistance: current.risk,
      currentRewardDistance: current.reward,
      currentCostR,
    };
  }

  const refinedEntry = conservativeRefinedEntry(direction, input.currentEntry, input.currentStop, desiredEntry);
  const refinedStop = fin(input.optionalInvalidation) ? input.optionalInvalidation : input.currentStop;
  const refinedTarget = fin(input.optionalLiquidityTarget) ? input.optionalLiquidityTarget : input.currentTarget;
  const refined = refinedEntry == null ? null : rrFor(direction, refinedEntry, refinedStop, refinedTarget);

  if (!refinedEntry || !refined) {
    return {
      ...blank("NO_REFINEMENT_AVAILABLE", "refined estimate would create invalid geometry", ["refinedGeometry"], dataStatus),
      direction,
      currentRawRR,
      currentNetRR,
      requiredRR: round4(input.requiredRR),
      currentRiskDistance: current.risk,
      currentRewardDistance: current.reward,
      currentCostR,
    };
  }

  const refinedCostR = costR(refinedEntry, refined.risk, input.feePct, input.slippagePct);
  const refinedNetRR = refinedCostR == null ? null : round4(refined.rawRR - refinedCostR);
  const rrImprovement = round4(refined.rawRR - currentRawRR);
  const netRrImprovement = currentNetRR != null && refinedNetRR != null ? round4(refinedNetRR - currentNetRR) : null;
  const wouldPassStaticRR = refined.rawRR >= input.requiredRR;
  const wouldPassNetRR = refinedNetRR == null ? null : refinedNetRR >= input.requiredRR;
  const currentGap = input.requiredRR - currentRawRR;
  const currentCostGap = currentNetRR == null ? null : currentRawRR - currentNetRR;

  let classification: MtfObFvgClassification = "SHADOW_ONLY";
  let reason = "shadow diagnostic only; no trading behavior changes";
  if (current.reward < current.risk) {
    classification = "TARGET_TOO_CLOSE";
    reason = "reward leg is shorter than risk leg";
  } else if (rrImprovement > 0 && wouldPassStaticRR && wouldPassNetRR === false) {
    classification = "REFINEMENT_STILL_FAILS_COST";
    reason = "refined raw RR passes but net RR still fails after costs";
  } else if (currentCostGap != null && currentCostGap >= Math.max(0.05, currentGap) && refinedNetRR != null && refinedNetRR < input.requiredRR) {
    classification = "COST_DRAG_DOMINANT";
    reason = "round-trip fee/slippage still dominates net RR";
  } else if (currentGap > 0 && currentGap <= 0.15 && rrImprovement > 0) {
    classification = "ENTRY_GEOMETRY_NEAR_MISS";
    reason = "current RR is a near miss and refined geometry improves raw RR";
  } else if (rrImprovement > 0 && (wouldPassStaticRR || refined.rawRR > currentRawRR)) {
    classification = "REFINEMENT_IMPROVES_RR";
    reason = "refined entry estimate improves reward/risk geometry";
  } else if (current.rawRR >= 1 && current.rawRR < input.requiredRR) {
    classification = "STOP_TOO_WIDE";
    reason = "risk distance remains too wide for required RR";
  }

  const qualityScore = scoreQuality(input, classification, hasExactZone);
  const confidence = dataStatus === "ACTUAL_OB_FVG_AVAILABLE" && qualityScore >= 70 ? "high" : qualityScore >= 45 ? "medium" : "low";

  return {
    available: true,
    dataStatus,
    classification,
    reason,
    direction,
    currentRawRR,
    currentNetRR,
    requiredRR: round4(input.requiredRR),
    refinedEntryEstimate: refinedEntry,
    refinedStopEstimate: round4(refinedStop),
    refinedTargetEstimate: round4(refinedTarget),
    refinedRawRR: refined.rawRR,
    refinedNetRR,
    rrImprovement,
    netRrImprovement,
    currentRiskDistance: current.risk,
    currentRewardDistance: current.reward,
    refinedRiskDistance: refined.risk,
    refinedRewardDistance: refined.reward,
    currentCostR,
    refinedCostR,
    wouldPassStaticRR,
    wouldPassNetRR,
    confidence,
    qualityScore,
    missingFields,
    notes,
    shadowOnly: true,
    paperActivationAllowed: false,
    liveActivationAllowed: false,
    exchangeOrderAllowed: false,
  };
}
