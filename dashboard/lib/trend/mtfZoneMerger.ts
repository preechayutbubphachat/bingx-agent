// dashboard/lib/trend/mtfZoneMerger.ts
// Phase T-3H-6-d3 - pure MTF exact OB/FVG zone merger.
//
// SAFETY:
//   - Pure merge/score helper only. No I/O, env, network, route, runner,
//     UI, execution, broker, threshold, order, or activation imports.
//   - Caller must provide exact detector outputs. This module does not fetch
//     candles and does not run detectors.

import type { ExactFvg } from "./exactFvgDetector.ts";
import type { ExactOrderBlock, ExactOrderBlockDirection } from "./exactOrderBlockDetector.ts";

export type MtfZoneDirection = ExactOrderBlockDirection;
export type MtfZoneBias = MtfZoneDirection | "NEUTRAL" | null;
export type MtfZoneType = "OB_FVG_CONFLUENCE" | "OB_ONLY" | "FVG_ONLY";
export type MtfZoneDataStatus = "EXACT_DETECTOR_OUTPUT";
export type MtfZoneSource = "MTF_OB_FVG_ZONE_MERGER_V1";
export type MtfZoneReadiness =
  | "NO_DATA"
  | "FVG_ONLY"
  | "OB_ONLY"
  | "OB_FVG_CONFLUENCE"
  | "MTF_ALIGNED"
  | "CONFLICTING_MTF"
  | "TARGET_TOO_CLOSE"
  | "COST_TOO_HIGH";
export type MtfZoneQualityBand = "IGNORE" | "WATCH_ONLY" | "SHADOW_CANDIDATE" | "HIGH_QUALITY_SHADOW";
export type MtfZoneConfidence = "LOW" | "MEDIUM" | "HIGH";

export interface MtfLiquidityTarget {
  price: number;
  kind: "SWING_HIGH" | "SWING_LOW";
  timeframe: string;
}

export interface MtfZoneTimeframeInput {
  timeframe: string;
  obs: readonly ExactOrderBlock[];
  fvgs: readonly ExactFvg[];
}

export interface MtfZoneMergerInput {
  htf?: {
    bias?: MtfZoneBias;
    externalLiquidityTargets?: readonly MtfLiquidityTarget[];
  };
  primary: MtfZoneTimeframeInput;
  refinement?: MtfZoneTimeframeInput;
  micro?: {
    timeframe: string;
    chochAgainstZone?: boolean | null;
    confirmsZone?: boolean | null;
  };
  context?: {
    dealerRange?: { low: number; high: number } | null;
    regime?: string | null;
    session?: string | null;
    currentPrice?: number | null;
    targetPrice?: number | null;
    requiredRR?: number | null;
    feePct?: number | null;
    slippagePct?: number | null;
  };
}

export interface MtfMergedZone {
  id: string;
  direction: MtfZoneDirection;
  htfBias: MtfZoneBias;
  primaryTimeframe: string;
  refinementTimeframe: string | null;
  zoneType: MtfZoneType;
  obId: string | null;
  fvgId: string | null;
  lower: number;
  upper: number;
  midpoint: number;
  refinedEntry: number;
  invalidationPrice: number;
  targetPrice: number | null;
  rawRR: number | null;
  netRR: number | null;
  costR: number | null;
  qualityScore: number;
  qualityBand: MtfZoneQualityBand;
  confidence: MtfZoneConfidence;
  dataStatus: MtfZoneDataStatus;
  readiness: MtfZoneReadiness;
  warnings: string[];
  paperOnly: true;
  shadowOnly: true;
  liveTradingEnabled: false;
  liveActivationAllowed: false;
  exchangeOrderAllowed: false;
  source: MtfZoneSource;
}

export interface MtfZoneMergerCounts {
  primaryOrderBlocks: number;
  primaryFvgs: number;
  acceptedOrderBlocks: number;
  acceptedFvgs: number;
  confluenceZones: number;
  obOnlyZones: number;
  fvgOnlyZones: number;
  conflictingDropped: number;
}

export interface MtfZoneMergerResult {
  zones: MtfMergedZone[];
  topCandidate: MtfMergedZone | null;
  counts: MtfZoneMergerCounts;
  readiness: MtfZoneReadiness;
  conflictingDropped: number;
  warnings: string[];
  source: MtfZoneSource;
}

interface CandidateSeed {
  zoneType: MtfZoneType;
  direction: MtfZoneDirection;
  ob: ExactOrderBlock | null;
  fvg: ExactFvg | null;
  relationRank: number;
}

const SOURCE: MtfZoneSource = "MTF_OB_FVG_ZONE_MERGER_V1";

const fin = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

function round4(v: number): number {
  return Math.round(v * 10_000) / 10_000;
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function overlapAmount(aLower: number, aUpper: number, bLower: number, bUpper: number): number {
  return Math.max(0, Math.min(aUpper, bUpper) - Math.max(aLower, bLower));
}

function fvgQuality(fvg: ExactFvg): number {
  let score = 50;
  if (fvg.mitigationStatus === "FRESH") score += 15;
  if (fvg.mitigationStatus === "PARTIALLY_MITIGATED") score -= 10;
  if (fin(fvg.displacementStrength)) score += fvg.displacementStrength >= 2 ? 10 : fvg.displacementStrength >= 1.5 ? 5 : 0;
  if (fin(fvg.sizeAtrMultiple)) score += fvg.sizeAtrMultiple >= 1 ? 10 : fvg.sizeAtrMultiple >= 0.5 ? 5 : 0;
  if (fvg.ageBars <= 12) score += 5;
  return Math.round(clamp(score, 0, 100));
}

function zoneBand(score: number): MtfZoneQualityBand {
  if (score >= 75) return "HIGH_QUALITY_SHADOW";
  if (score >= 65) return "SHADOW_CANDIDATE";
  if (score >= 50) return "WATCH_ONLY";
  return "IGNORE";
}

function confidence(score: number): MtfZoneConfidence {
  if (score >= 75) return "HIGH";
  if (score >= 60) return "MEDIUM";
  return "LOW";
}

function validOb(ob: ExactOrderBlock): boolean {
  return ob.source === "EXACT_OB_DETECTOR_V1" && ob.classification === "VALID_OB";
}

function validFvg(fvg: ExactFvg): boolean {
  return fvg.source === "EXACT_FVG_DETECTOR_V1" && fvg.mitigationStatus !== "MITIGATED" && fvg.mitigationStatus !== "INVALIDATED";
}

function htfConflict(direction: MtfZoneDirection, bias: MtfZoneBias): boolean {
  return (bias === "BULLISH" || bias === "BEARISH") && bias !== direction;
}

function relationRank(ob: ExactOrderBlock, fvg: ExactFvg): number {
  if (ob.direction !== fvg.direction) return 0;
  const fvgSize = Math.max(0, fvg.upper - fvg.lower);
  if (fvgSize > 0 && overlapAmount(ob.zoneLower, ob.zoneUpper, fvg.lower, fvg.upper) >= fvgSize * 0.3) return 4;
  if (
    fin(ob.displacementStartIndex) &&
    fin(ob.displacementEndIndex) &&
    fvg.startIndex >= ob.displacementStartIndex - 1 &&
    fvg.startIndex <= ob.displacementEndIndex + 1
  ) {
    return 3;
  }
  const obHeight = Math.max(0, ob.zoneUpper - ob.zoneLower);
  const fvgHeight = Math.max(0, fvg.upper - fvg.lower);
  const adjacencyThreshold = Math.max(obHeight, fvgHeight) * 0.5;
  const gap = Math.max(0, Math.max(fvg.lower - ob.zoneUpper, ob.zoneLower - fvg.upper));
  return adjacencyThreshold > 0 && gap <= adjacencyThreshold ? 2 : 0;
}

function midpoint(lower: number, upper: number): number {
  return round4((lower + upper) / 2);
}

function conservativeEntry(direction: MtfZoneDirection, lower: number, upper: number): number {
  return direction === "BULLISH" ? round4(upper) : round4(lower);
}

function zoneContains(parentLower: number, parentUpper: number, childLower: number, childUpper: number): boolean {
  return childLower >= parentLower && childUpper <= parentUpper;
}

function chooseRefinement(seed: CandidateSeed, input: MtfZoneMergerInput): { lower: number; upper: number; timeframe: string | null } | null {
  const refinement = input.refinement;
  if (!refinement) return null;
  const parent = zoneBounds(seed);
  const exactObs = refinement.obs.filter((ob) => validOb(ob) && ob.direction === seed.direction);
  const exactFvgs = refinement.fvgs.filter((fvg) => validFvg(fvg) && fvg.direction === seed.direction);
  const zones = [
    ...exactObs.map((ob) => ({ lower: ob.zoneLower, upper: ob.zoneUpper, quality: ob.qualityScore })),
    ...exactFvgs.map((fvg) => ({ lower: fvg.lower, upper: fvg.upper, quality: fvgQuality(fvg) })),
  ].filter((z) => zoneContains(parent.lower, parent.upper, z.lower, z.upper));
  zones.sort((a, b) => b.quality - a.quality || a.upper - a.lower - (b.upper - b.lower));
  const best = zones[0];
  return best ? { lower: best.lower, upper: best.upper, timeframe: refinement.timeframe } : null;
}

function zoneBounds(seed: CandidateSeed): { lower: number; upper: number } {
  if (seed.ob && seed.fvg) return { lower: Math.min(seed.ob.zoneLower, seed.fvg.lower), upper: Math.max(seed.ob.zoneUpper, seed.fvg.upper) };
  if (seed.ob) return { lower: seed.ob.zoneLower, upper: seed.ob.zoneUpper };
  if (seed.fvg) return { lower: seed.fvg.lower, upper: seed.fvg.upper };
  return { lower: 0, upper: 0 };
}

function invalidation(seed: CandidateSeed): number {
  if (seed.ob) return seed.ob.invalidationPrice;
  return seed.fvg?.invalidationPrice ?? 0;
}

function nearestTarget(direction: MtfZoneDirection, entry: number, input: MtfZoneMergerInput): number | null {
  const targets = input.htf?.externalLiquidityTargets?.map((t) => t.price).filter(fin) ?? [];
  const directional = direction === "BULLISH" ? targets.filter((p) => p > entry).sort((a, b) => a - b) : targets.filter((p) => p < entry).sort((a, b) => b - a);
  if (directional[0] != null) return directional[0];
  const fallback = input.context?.targetPrice;
  if (!fin(fallback)) return null;
  if (direction === "BULLISH" && fallback <= entry) return null;
  if (direction === "BEARISH" && fallback >= entry) return null;
  return fallback;
}

function rr(entry: number, invalidationPrice: number, targetPrice: number | null, input: MtfZoneMergerInput): {
  rawRR: number | null;
  netRR: number | null;
  costR: number | null;
  warning: string | null;
} {
  const riskDistance = Math.abs(entry - invalidationPrice);
  if (!fin(targetPrice) || riskDistance <= 0) return { rawRR: null, netRR: null, costR: null, warning: "RR_DATA_MISSING" };
  const rewardDistance = Math.abs(targetPrice - entry);
  const rawRR = round4(rewardDistance / riskDistance);
  let costR: number | null = null;
  if (fin(input.context?.feePct) || fin(input.context?.slippagePct)) {
    const perSidePct = (fin(input.context?.feePct) ? input.context.feePct : 0) + (fin(input.context?.slippagePct) ? input.context.slippagePct : 0);
    costR = round4((((perSidePct * 2) / 100) * entry) / riskDistance);
  }
  return { rawRR, netRR: costR == null ? null : round4(rawRR - costR), costR, warning: null };
}

function readinessFor(seed: CandidateSeed, rawRR: number | null, netRR: number | null, input: MtfZoneMergerInput): MtfZoneReadiness {
  const requiredRR = input.context?.requiredRR;
  if (input.micro?.chochAgainstZone === true) return "CONFLICTING_MTF";
  if (fin(requiredRR) && fin(rawRR) && rawRR < requiredRR) return "TARGET_TOO_CLOSE";
  if (fin(requiredRR) && fin(rawRR) && rawRR >= requiredRR && fin(netRR) && netRR < requiredRR) return "COST_TOO_HIGH";
  if (seed.zoneType === "OB_FVG_CONFLUENCE") {
    return input.htf?.bias === seed.direction ? "MTF_ALIGNED" : "OB_FVG_CONFLUENCE";
  }
  return seed.zoneType === "OB_ONLY" ? "OB_ONLY" : "FVG_ONLY";
}

function quality(seed: CandidateSeed, readiness: MtfZoneReadiness, refinementUsed: boolean, input: MtfZoneMergerInput): number {
  let score =
    seed.zoneType === "OB_FVG_CONFLUENCE"
      ? (seed.ob?.qualityScore ?? 0) * 0.5 + (seed.fvg ? fvgQuality(seed.fvg) : 0) * 0.3 + 20
      : seed.zoneType === "OB_ONLY"
        ? (seed.ob?.qualityScore ?? 0) * 0.7 + 10
        : (seed.fvg ? fvgQuality(seed.fvg) : 0) * 0.6;
  if (input.htf?.bias === seed.direction) score += 10;
  if ((seed.ob?.mitigationStatus === "FRESH" || !seed.ob) && (seed.fvg?.mitigationStatus === "FRESH" || !seed.fvg)) score += 5;
  if (refinementUsed) score += 5;
  if (seed.ob?.mitigationStatus === "PARTIALLY_MITIGATED" || seed.fvg?.mitigationStatus === "PARTIALLY_MITIGATED") score -= 10;
  const regime = input.context?.regime?.toUpperCase() ?? "";
  if ((seed.direction === "BULLISH" && regime.includes("DOWNTREND")) || (seed.direction === "BEARISH" && regime.includes("UPTREND")) || regime.includes("RANGE")) {
    score -= 10;
  }
  const session = input.context?.session?.toUpperCase() ?? "";
  if (session.includes("LOW") || session.includes("ILLIQUID")) score -= 5;
  if (readiness === "TARGET_TOO_CLOSE") score -= 15;
  if (readiness === "COST_TOO_HIGH") score -= 15;
  if (input.micro?.chochAgainstZone === true) score -= 10;
  if (input.micro?.confirmsZone === true) score += 5;
  return Math.round(clamp(score, 0, 100));
}

function buildSeeds(input: MtfZoneMergerInput, counts: MtfZoneMergerCounts): CandidateSeed[] {
  const obs = input.primary.obs.filter((ob) => {
    const ok = validOb(ob);
    if (ok) counts.acceptedOrderBlocks += 1;
    return ok;
  });
  const fvgs = input.primary.fvgs.filter((fvg) => {
    const ok = validFvg(fvg);
    if (ok) counts.acceptedFvgs += 1;
    return ok;
  });
  const seeds: CandidateSeed[] = [];
  const usedFvgs = new Set<string>();

  for (const ob of obs) {
    let best: { fvg: ExactFvg; rank: number } | null = null;
    for (const fvg of fvgs) {
      const rank = relationRank(ob, fvg);
      if (rank > 0 && (!best || rank > best.rank || fvgQuality(fvg) > fvgQuality(best.fvg))) best = { fvg, rank };
    }
    if (best) {
      usedFvgs.add(best.fvg.id);
      seeds.push({ zoneType: "OB_FVG_CONFLUENCE", direction: ob.direction, ob, fvg: best.fvg, relationRank: best.rank });
    } else {
      seeds.push({ zoneType: "OB_ONLY", direction: ob.direction, ob, fvg: null, relationRank: 1 });
    }
  }

  for (const fvg of fvgs) {
    if (!usedFvgs.has(fvg.id)) seeds.push({ zoneType: "FVG_ONLY", direction: fvg.direction, ob: null, fvg, relationRank: 0 });
  }

  return seeds;
}

function buildZone(seed: CandidateSeed, input: MtfZoneMergerInput): MtfMergedZone {
  const bounds = zoneBounds(seed);
  const preliminaryQuality = quality(seed, seed.zoneType === "OB_FVG_CONFLUENCE" ? "OB_FVG_CONFLUENCE" : seed.zoneType, false, input);
  const refinement = chooseRefinement(seed, input);
  const entryBounds = refinement ?? bounds;
  const refinedEntry =
    preliminaryQuality >= 75 ? midpoint(entryBounds.lower, entryBounds.upper) : conservativeEntry(seed.direction, entryBounds.lower, entryBounds.upper);
  const invalidationPrice = round4(invalidation(seed));
  const targetPrice = nearestTarget(seed.direction, refinedEntry, input);
  const rrResult = rr(refinedEntry, invalidationPrice, targetPrice, input);
  const readiness = readinessFor(seed, rrResult.rawRR, rrResult.netRR, input);
  const qualityScore = quality(seed, readiness, refinement != null, input);
  const warnings: string[] = [];
  if (rrResult.warning) warnings.push(rrResult.warning);
  if (input.micro?.chochAgainstZone === true) warnings.push("MICRO_CHOCH_AGAINST_ZONE");
  if (readiness === "TARGET_TOO_CLOSE") warnings.push("TARGET_TOO_CLOSE");
  if (readiness === "COST_TOO_HIGH") warnings.push("COST_TOO_HIGH");
  if (refinement == null && input.refinement) warnings.push("NO_REFINEMENT_INSIDE_PRIMARY_ZONE");
  return {
    id: `mtfzone:${input.primary.timeframe}:${seed.direction}:${seed.ob?.id ?? seed.fvg?.id ?? "unknown"}`,
    direction: seed.direction,
    htfBias: input.htf?.bias ?? null,
    primaryTimeframe: input.primary.timeframe,
    refinementTimeframe: refinement?.timeframe ?? null,
    zoneType: seed.zoneType,
    obId: seed.ob?.id ?? null,
    fvgId: seed.fvg?.id ?? null,
    lower: round4(bounds.lower),
    upper: round4(bounds.upper),
    midpoint: midpoint(bounds.lower, bounds.upper),
    refinedEntry,
    invalidationPrice,
    targetPrice: targetPrice == null ? null : round4(targetPrice),
    rawRR: rrResult.rawRR,
    netRR: rrResult.netRR,
    costR: rrResult.costR,
    qualityScore,
    qualityBand: zoneBand(qualityScore),
    confidence: confidence(qualityScore),
    dataStatus: "EXACT_DETECTOR_OUTPUT",
    readiness,
    warnings,
    paperOnly: true,
    shadowOnly: true,
    liveTradingEnabled: false,
    liveActivationAllowed: false,
    exchangeOrderAllowed: false,
    source: SOURCE,
  };
}

function rank(zone: MtfMergedZone, currentPrice: number | null): number[] {
  const typeRank = zone.zoneType === "OB_FVG_CONFLUENCE" ? 3 : zone.zoneType === "OB_ONLY" ? 2 : 1;
  const freshRank = zone.warnings.includes("TARGET_TOO_CLOSE") || zone.warnings.includes("COST_TOO_HIGH") ? 0 : 1;
  const distance = fin(currentPrice) ? Math.abs(zone.midpoint - currentPrice) : Number.MAX_SAFE_INTEGER;
  return [typeRank, freshRank, zone.qualityScore, -distance, zone.obId ? Number(zone.obId.match(/:(\d+):/)?.[1] ?? 0) : 0];
}

function compareZones(a: MtfMergedZone, b: MtfMergedZone, currentPrice: number | null): number {
  const ar = rank(a, currentPrice);
  const br = rank(b, currentPrice);
  for (let i = 0; i < ar.length; i += 1) {
    if (ar[i] !== br[i]) return br[i]! - ar[i]!;
  }
  return a.id.localeCompare(b.id);
}

function summarizeReadiness(zones: readonly MtfMergedZone[]): MtfZoneReadiness {
  if (!zones.length) return "NO_DATA";
  const has = (r: MtfZoneReadiness) => zones.some((zone) => zone.readiness === r);
  if (has("CONFLICTING_MTF")) return "CONFLICTING_MTF";
  if (has("TARGET_TOO_CLOSE")) return "TARGET_TOO_CLOSE";
  if (has("COST_TOO_HIGH")) return "COST_TOO_HIGH";
  if (has("MTF_ALIGNED")) return "MTF_ALIGNED";
  if (has("OB_FVG_CONFLUENCE")) return "OB_FVG_CONFLUENCE";
  if (has("OB_ONLY")) return "OB_ONLY";
  return "FVG_ONLY";
}

export function mergeMtfZones(input: MtfZoneMergerInput): MtfZoneMergerResult {
  const counts: MtfZoneMergerCounts = {
    primaryOrderBlocks: input.primary.obs.length,
    primaryFvgs: input.primary.fvgs.length,
    acceptedOrderBlocks: 0,
    acceptedFvgs: 0,
    confluenceZones: 0,
    obOnlyZones: 0,
    fvgOnlyZones: 0,
    conflictingDropped: 0,
  };
  const warnings: string[] = [];
  const seeds = buildSeeds(input, counts).filter((seed) => {
    if (htfConflict(seed.direction, input.htf?.bias ?? null)) {
      counts.conflictingDropped += 1;
      return false;
    }
    return true;
  });
  const zones = seeds.map((seed) => buildZone(seed, input));
  zones.sort((a, b) => compareZones(a, b, input.context?.currentPrice ?? null));
  counts.confluenceZones = zones.filter((zone) => zone.zoneType === "OB_FVG_CONFLUENCE").length;
  counts.obOnlyZones = zones.filter((zone) => zone.zoneType === "OB_ONLY").length;
  counts.fvgOnlyZones = zones.filter((zone) => zone.zoneType === "FVG_ONLY").length;
  if (!zones.length) warnings.push("NO_EXACT_ZONE_CANDIDATES");
  const topCandidate = zones.find((zone) => !["CONFLICTING_MTF", "TARGET_TOO_CLOSE", "COST_TOO_HIGH"].includes(zone.readiness)) ?? null;
  return {
    zones,
    topCandidate,
    counts,
    readiness: summarizeReadiness(zones),
    conflictingDropped: counts.conflictingDropped,
    warnings,
    source: SOURCE,
  };
}
