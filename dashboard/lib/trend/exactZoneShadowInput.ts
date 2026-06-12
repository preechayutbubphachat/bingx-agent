// dashboard/lib/trend/exactZoneShadowInput.ts
// Phase T-3H-6-d4 - exact OB/FVG zone producer for shadow snapshots.
//
// SAFETY:
//   - Pure helper only. No I/O, no env, no network, no route, no runner,
//     no execution, no broker, no threshold mutation, no order path.
//   - Output is observability-only and may only be logged in shadow snapshots.

import { detectExactFvgs, type ExactFvg } from "./exactFvgDetector.ts";
import { detectExactOrderBlocks, type ExactOrderBlock, type ExactOrderBlockDirection } from "./exactOrderBlockDetector.ts";
import { findFractalSwings, summarizeSwingStructure, type SmcCandle } from "./smcSwing.ts";
import { mergeMtfZones, type MtfMergedZone, type MtfZoneBias, type MtfZoneReadiness } from "./mtfZoneMerger.ts";
import type { PriceZone } from "./mtfObFvgRefinementShadow.ts";

export const EXACT_ZONE_SHADOW_INPUT_SOURCE = "EXACT_ZONE_SHADOW_INPUT_V1" as const;
export const MIN_EXACT_ZONE_CANDLES = 60;

export type ExactZoneDataStatus =
  | "HEURISTIC_ESTIMATE_ONLY"
  | "EXACT_FVG_ONLY"
  | "EXACT_OB_ONLY"
  | "EXACT_OB_FVG_CONFLUENCE"
  | "MTF_EXACT_ZONE_ALIGNED"
  | "EXACT_ZONE_NO_DATA"
  | "EXACT_ZONE_CONFLICT";

export type ExactZoneReadiness = MtfZoneReadiness | "NO_DATA";

export interface ExactZoneCandle {
  t?: number | string;
  time?: number | string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface ExactZoneShadowInputContext {
  regime?: string | null;
  session?: string | null;
  currentPrice?: number | null;
  currentEntry?: number | null;
  currentStop?: number | null;
  currentTarget?: number | null;
  requiredRR?: number | null;
  feePct?: number | null;
  slippagePct?: number | null;
  heuristicNetRR?: number | null;
}

export interface ExactZoneShadowInputParams {
  candlesByTimeframe?: Partial<Record<"4H" | "1H" | "15M" | "5M", readonly ExactZoneCandle[] | null>>;
  direction?: "LONG" | "SHORT" | "BULLISH" | "BEARISH" | null;
  htfBias?: MtfZoneBias;
  context?: ExactZoneShadowInputContext;
  detectors?: Partial<{
    detectFvgs: typeof detectExactFvgs;
    detectOrderBlocks: typeof detectExactOrderBlocks;
    mergeZones: typeof mergeMtfZones;
  }>;
}

export interface ExactZoneShadowOutput {
  dataStatus: ExactZoneDataStatus;
  exactZoneReadiness: ExactZoneReadiness;
  usesExactObFvgZones: boolean;
  optionalObZone: PriceZone | null;
  optionalFvgZone: PriceZone | null;
  mergedZoneCandidate: MtfMergedZone | null;
  exactRawRR: number | null;
  exactNetRR: number | null;
  exactVsHeuristicDelta: number | null;
  wouldHaveFilledPending: boolean;
  warnings: string[];
  source: typeof EXACT_ZONE_SHADOW_INPUT_SOURCE;
}

const fin = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

function round4(v: number): number {
  return Math.round(v * 10_000) / 10_000;
}

function normalizeCandle(c: unknown): ExactZoneCandle | null {
  if (!c || typeof c !== "object") return null;
  const o = c as Record<string, unknown>;
  const time = o.time ?? o.t;
  const open = o.open;
  const high = o.high;
  const low = o.low;
  const close = o.close;
  if (!fin(open) || !fin(high) || !fin(low) || !fin(close) || high < low) return null;
  return { time: typeof time === "string" || fin(time) ? time : undefined, open, high, low, close };
}

function normalizeCandles(candles: readonly ExactZoneCandle[] | null | undefined): ExactZoneCandle[] {
  if (!Array.isArray(candles)) return [];
  return candles.map(normalizeCandle).filter((c): c is ExactZoneCandle => c != null);
}

function trendDirection(direction: ExactZoneShadowInputParams["direction"]): ExactOrderBlockDirection | null {
  if (direction === "LONG" || direction === "BULLISH") return "BULLISH";
  if (direction === "SHORT" || direction === "BEARISH") return "BEARISH";
  return null;
}

function deriveBias(candles4h: readonly ExactZoneCandle[], explicit: MtfZoneBias | undefined): MtfZoneBias {
  if (explicit === "BULLISH" || explicit === "BEARISH" || explicit === "NEUTRAL" || explicit === null) return explicit;
  const swings = findFractalSwings(candles4h as readonly SmcCandle[], { leftBars: 2, rightBars: 2, confirmByClose: true });
  const summary = summarizeSwingStructure(swings);
  if (summary.highTrend === "HIGHER_HIGH" && summary.lowTrend === "HIGHER_LOW") return "BULLISH";
  if (summary.highTrend === "LOWER_HIGH" && summary.lowTrend === "LOWER_LOW") return "BEARISH";
  return "NEUTRAL";
}

function liquidityTargets(candles4h: readonly ExactZoneCandle[]) {
  const swings = findFractalSwings(candles4h as readonly SmcCandle[], { leftBars: 2, rightBars: 2, confirmByClose: true, maxSwings: 12 });
  return swings.map((s) => ({ price: s.price, kind: s.type, timeframe: "4H" as const }));
}

function zoneFromOb(ob: ExactOrderBlock | null | undefined): PriceZone | null {
  if (!ob || !fin(ob.zoneLower) || !fin(ob.zoneUpper)) return null;
  return { low: Math.min(ob.zoneLower, ob.zoneUpper), high: Math.max(ob.zoneLower, ob.zoneUpper) };
}

function zoneFromFvg(fvg: ExactFvg | null | undefined): PriceZone | null {
  if (!fvg || !fin(fvg.lower) || !fin(fvg.upper)) return null;
  return { low: Math.min(fvg.lower, fvg.upper), high: Math.max(fvg.lower, fvg.upper) };
}

export function mapExactZoneDataStatus(readiness: ExactZoneReadiness, candidate: MtfMergedZone | null): ExactZoneDataStatus {
  if (readiness === "NO_DATA") return "EXACT_ZONE_NO_DATA";
  if (readiness === "CONFLICTING_MTF" || readiness === "TARGET_TOO_CLOSE" || readiness === "COST_TOO_HIGH") return "EXACT_ZONE_CONFLICT";
  if (!candidate) return "EXACT_ZONE_NO_DATA";
  if (readiness === "MTF_ALIGNED") return "MTF_EXACT_ZONE_ALIGNED";
  if (candidate.zoneType === "OB_FVG_CONFLUENCE") return "EXACT_OB_FVG_CONFLUENCE";
  if (candidate.zoneType === "OB_ONLY") return "EXACT_OB_ONLY";
  if (candidate.zoneType === "FVG_ONLY") return "EXACT_FVG_ONLY";
  return "EXACT_ZONE_NO_DATA";
}

function blank(dataStatus: ExactZoneDataStatus, readiness: ExactZoneReadiness, warnings: string[] = []): ExactZoneShadowOutput {
  return {
    dataStatus,
    exactZoneReadiness: readiness,
    usesExactObFvgZones: false,
    optionalObZone: null,
    optionalFvgZone: null,
    mergedZoneCandidate: null,
    exactRawRR: null,
    exactNetRR: null,
    exactVsHeuristicDelta: null,
    wouldHaveFilledPending: false,
    warnings,
    source: EXACT_ZONE_SHADOW_INPUT_SOURCE,
  };
}

export function buildExactZoneShadowInput(params: ExactZoneShadowInputParams): ExactZoneShadowOutput {
  try {
    const warnings: string[] = [];
    const direction = trendDirection(params.direction);
    if (!direction) return blank("EXACT_ZONE_NO_DATA", "NO_DATA", ["missing_direction"]);

    const candles4h = normalizeCandles(params.candlesByTimeframe?.["4H"]);
    const candles1h = normalizeCandles(params.candlesByTimeframe?.["1H"]);
    const candles15m = normalizeCandles(params.candlesByTimeframe?.["15M"]);
    const candles5m = normalizeCandles(params.candlesByTimeframe?.["5M"]);

    for (const [tf, candles] of [
      ["4H", candles4h],
      ["1H", candles1h],
      ["15M", candles15m],
      ["5M", candles5m],
    ] as const) {
      if (candles.length === 0) warnings.push(`missing_${tf}_candles`);
      else if (candles.length < MIN_EXACT_ZONE_CANDLES) warnings.push(`insufficient_${tf}_candles`);
    }

    if (candles1h.length < MIN_EXACT_ZONE_CANDLES) return blank("EXACT_ZONE_NO_DATA", "NO_DATA", warnings);

    const detectFvgs = params.detectors?.detectFvgs ?? detectExactFvgs;
    const detectOrderBlocks = params.detectors?.detectOrderBlocks ?? detectExactOrderBlocks;
    const mergeZones = params.detectors?.mergeZones ?? mergeMtfZones;

    const primaryFvgs = detectFvgs(candles1h, { timeframe: "1H", includeMitigated: false });
    const primaryObs = detectOrderBlocks(candles1h, {
      timeframe: "1H",
      direction,
      includeMitigated: false,
      exactFvgs: primaryFvgs,
      context: { htfBias: params.htfBias ?? undefined, regime: params.context?.regime ?? undefined },
    });
    const refinementFvgs = candles15m.length >= MIN_EXACT_ZONE_CANDLES ? detectFvgs(candles15m, { timeframe: "15M", includeMitigated: false }) : [];
    const refinementObs =
      candles15m.length >= MIN_EXACT_ZONE_CANDLES
        ? detectOrderBlocks(candles15m, { timeframe: "15M", direction, includeMitigated: false, exactFvgs: refinementFvgs })
        : [];
    const htfBias = deriveBias(candles4h, params.htfBias);
    const merged = mergeZones({
      htf: { bias: htfBias, externalLiquidityTargets: liquidityTargets(candles4h) },
      primary: { timeframe: "1H", obs: primaryObs, fvgs: primaryFvgs },
      refinement: { timeframe: "15M", obs: refinementObs, fvgs: refinementFvgs },
      micro: { timeframe: "5M", confirmsZone: candles5m.length >= MIN_EXACT_ZONE_CANDLES ? null : null },
      context: {
        regime: params.context?.regime ?? null,
        session: params.context?.session ?? null,
        currentPrice: params.context?.currentPrice ?? null,
        targetPrice: params.context?.currentTarget ?? null,
        requiredRR: params.context?.requiredRR ?? null,
        feePct: params.context?.feePct ?? null,
        slippagePct: params.context?.slippagePct ?? null,
      },
    });
    const candidate = merged.topCandidate;
    const dataStatus = mapExactZoneDataStatus(merged.readiness, candidate);
    if (!candidate || candidate.dataStatus !== "EXACT_DETECTOR_OUTPUT") {
      return blank(dataStatus, merged.readiness, [...warnings, ...merged.warnings]);
    }

    const ob = candidate.obId ? primaryObs.find((z) => z.id === candidate.obId) ?? refinementObs.find((z) => z.id === candidate.obId) ?? null : null;
    const fvg = candidate.fvgId ? primaryFvgs.find((z) => z.id === candidate.fvgId) ?? refinementFvgs.find((z) => z.id === candidate.fvgId) ?? null : null;
    const exactNetRR = fin(candidate.netRR) ? round4(candidate.netRR) : null;
    const heuristicNetRR = params.context?.heuristicNetRR;
    return {
      dataStatus,
      exactZoneReadiness: merged.readiness,
      usesExactObFvgZones: true,
      optionalObZone: zoneFromOb(ob),
      optionalFvgZone: zoneFromFvg(fvg),
      mergedZoneCandidate: candidate,
      exactRawRR: fin(candidate.rawRR) ? round4(candidate.rawRR) : null,
      exactNetRR,
      exactVsHeuristicDelta: exactNetRR != null && fin(heuristicNetRR) ? round4(exactNetRR - heuristicNetRR) : null,
      wouldHaveFilledPending: true,
      warnings: [...warnings, ...merged.warnings, ...candidate.warnings].slice(0, 20),
      source: EXACT_ZONE_SHADOW_INPUT_SOURCE,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "unknown";
    return blank("HEURISTIC_ESTIMATE_ONLY", "NO_DATA", [`exact_zone_builder_failed:${message.slice(0, 80)}`]);
  }
}
