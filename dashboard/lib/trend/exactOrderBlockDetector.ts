// dashboard/lib/trend/exactOrderBlockDetector.ts
// Phase T-3H-6-d2 - deterministic exact Order Block detector.
//
// SAFETY:
//   - Pure OHLC helper only. No I/O, env, network, route, runner, execution,
//     broker, threshold, order, or activation imports.
//   - d2 produces exact-zone evidence only; it is not wired into strategy,
//     snapshots, Agent HQ, runner, preflight, or execution.

import { findFractalSwings, type SmcCandle, type SmcSwing } from "./smcSwing.ts";
import type { ExactFvg, ExactFvgDirection } from "./exactFvgDetector.ts";

export interface ExactOrderBlockCandle {
  time?: number | string;
  open: number;
  high: number;
  low: number;
  close: number;
}

export type ExactOrderBlockDirection = "BULLISH" | "BEARISH";
export type ExactOrderBlockDirectionFilter = ExactOrderBlockDirection | "BOTH";
export type ExactOrderBlockMitigationStatus = "FRESH" | "PARTIALLY_MITIGATED" | "MITIGATED" | "INVALIDATED";
export type ExactOrderBlockFvgRelation = "OB_OVERLAP" | "OB_ADJACENT" | "FVG_AFTER_DISPLACEMENT" | "NO_FVG_CONTEXT";
export type ExactOrderBlockClassification =
  | "INSUFFICIENT_DATA"
  | "NO_STRUCTURE_CONFIRMATION"
  | "WEAK_DISPLACEMENT"
  | "INVALIDATED"
  | "TOO_OLD"
  | "ALREADY_MITIGATED"
  | "CONFLICTING_DIRECTION"
  | "TARGET_TOO_CLOSE"
  | "VALID_OB";
export type ExactOrderBlockQualityBand = "IGNORE" | "WATCH_ONLY" | "SHADOW_CANDIDATE" | "HIGH_QUALITY_SHADOW";

export interface ExactOrderBlockContext {
  htfBias?: ExactOrderBlockDirection | "NEUTRAL" | string;
  premiumDiscount?: "DISCOUNT" | "PREMIUM" | "MIDDLE" | string;
  targetDistanceR?: number;
  regime?: string;
}

export interface DetectExactOrderBlocksOptions {
  timeframe?: string;
  direction?: ExactOrderBlockDirectionFilter;
  swingLeftBars?: number;
  swingRightBars?: number;
  structureLookbackBars?: number;
  maxDisplacementBars?: number;
  atrPeriod?: number;
  medianLookback?: number;
  minDisplacementScore?: number;
  maxAgeBars?: number;
  includeMitigated?: boolean;
  exactFvgs?: readonly ExactFvg[];
  context?: ExactOrderBlockContext;
}

export interface EvaluateObFvgRelationInput {
  direction: ExactOrderBlockDirection;
  zoneLower: number;
  zoneUpper: number;
  displacementStartIndex?: number | null;
  displacementEndIndex?: number | null;
  atr?: number | null;
}

export interface ExactOrderBlock {
  id: string;
  timeframe?: string;
  direction: ExactOrderBlockDirection;
  obIndex: number;
  obTime?: number | string;
  candleOpen: number;
  candleHigh: number;
  candleLow: number;
  candleClose: number;
  bodyLow: number;
  bodyHigh: number;
  wickLow: number;
  wickHigh: number;
  zoneLower: number;
  zoneUpper: number;
  refinedLower: number;
  refinedUpper: number;
  midpoint: number;
  invalidationPrice: number;
  displacementStartIndex: number | null;
  displacementEndIndex: number | null;
  bosIndex: number | null;
  bosLevel: number | null;
  bosClose: number | null;
  displacementStrength: number | null;
  ageBars: number;
  mitigationStatus: ExactOrderBlockMitigationStatus;
  fillPct: number;
  fvgRelation: ExactOrderBlockFvgRelation;
  obFvgRelation: ExactOrderBlockFvgRelation;
  classification: ExactOrderBlockClassification;
  qualityScore: number;
  qualityBand: ExactOrderBlockQualityBand;
  source: "EXACT_OB_DETECTOR_V1";
}

const fin = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

function round4(v: number): number {
  return Math.round(v * 10_000) / 10_000;
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function wholeNumber(v: unknown, fallback: number, min = 1): number {
  return fin(v) ? Math.max(min, Math.floor(v)) : fallback;
}

function validCandle(c: unknown): c is ExactOrderBlockCandle {
  if (!c || typeof c !== "object") return false;
  const o = c as Record<string, unknown>;
  return fin(o.open) && fin(o.high) && fin(o.low) && fin(o.close) && o.high >= o.low;
}

function bodyLow(c: ExactOrderBlockCandle): number {
  return Math.min(c.open, c.close);
}

function bodyHigh(c: ExactOrderBlockCandle): number {
  return Math.max(c.open, c.close);
}

function median(values: number[]): number | null {
  const clean = values.filter((v) => fin(v) && v > 0).sort((a, b) => a - b);
  if (!clean.length) return null;
  const mid = Math.floor(clean.length / 2);
  return clean.length % 2 === 0 ? (clean[mid - 1]! + clean[mid]!) / 2 : clean[mid]!;
}

function trueRange(candle: ExactOrderBlockCandle, previous: ExactOrderBlockCandle | null): number {
  if (!previous) return candle.high - candle.low;
  return Math.max(candle.high - candle.low, Math.abs(candle.high - previous.close), Math.abs(candle.low - previous.close));
}

function atrAt(candles: readonly ExactOrderBlockCandle[], index: number, period: number): number | null {
  const start = index - period + 1;
  if (start < 0) return null;
  const values: number[] = [];
  for (let i = start; i <= index; i += 1) {
    const candle = candles[i];
    const previous = i > 0 ? candles[i - 1] : null;
    if (!validCandle(candle) || (previous != null && !validCandle(previous))) return null;
    values.push(trueRange(candle, previous));
  }
  return round4(values.reduce((sum, v) => sum + v, 0) / values.length);
}

function medianBefore(
  candles: readonly ExactOrderBlockCandle[],
  index: number,
  lookback: number,
  value: (c: ExactOrderBlockCandle) => number,
): number | null {
  const start = Math.max(0, index - lookback);
  const values: number[] = [];
  for (let i = start; i < index; i += 1) {
    const c = candles[i];
    if (validCandle(c)) values.push(value(c));
  }
  return median(values);
}

function latestConfirmedSwingBefore(
  swings: readonly SmcSwing[],
  type: "SWING_HIGH" | "SWING_LOW",
  obIndex: number,
  rightBars: number,
  lookbackBars: number,
): SmcSwing | null {
  for (let i = swings.length - 1; i >= 0; i -= 1) {
    const swing = swings[i];
    if (!swing || swing.type !== type) continue;
    if (swing.index + rightBars > obIndex) continue;
    if (obIndex - swing.index > lookbackBars) continue;
    return swing;
  }
  return null;
}

function hasCloserOriginCandle(
  candles: readonly ExactOrderBlockCandle[],
  startExclusive: number,
  endExclusive: number,
  direction: ExactOrderBlockDirection,
): boolean {
  for (let i = startExclusive; i < endExclusive; i += 1) {
    const c = candles[i];
    if (!validCandle(c)) continue;
    if (direction === "BULLISH" && c.close < c.open) return true;
    if (direction === "BEARISH" && c.close > c.open) return true;
  }
  return false;
}

function displacementScore(
  candles: readonly ExactOrderBlockCandle[],
  displacementIndex: number,
  bosLevel: number,
  atrPeriod: number,
  medianLookback: number,
  hasFvgBoost: boolean,
): { score: number; atr: number | null } {
  const candle = candles[displacementIndex];
  if (!validCandle(candle)) return { score: 0, atr: null };
  const atr = atrAt(candles, displacementIndex, atrPeriod);
  const medianBody = medianBefore(candles, displacementIndex, medianLookback, (c) => Math.abs(c.close - c.open));
  const medianRange = medianBefore(candles, displacementIndex, medianLookback, (c) => c.high - c.low);
  const body = Math.abs(candle.close - candle.open);
  const range = candle.high - candle.low;
  const bodyMultiple = medianBody && medianBody > 0 ? body / medianBody : 0;
  const rangeDenominator = atr && atr > 0 ? atr : medianRange && medianRange > 0 ? medianRange : null;
  const rangeMultiple = rangeDenominator ? range / rangeDenominator : 0;
  const closeBreakDenominator = atr && atr > 0 ? atr : medianRange && medianRange > 0 ? medianRange : medianBody && medianBody > 0 ? medianBody : null;
  const closeBreakMultiple = closeBreakDenominator ? Math.abs(candle.close - bosLevel) / closeBreakDenominator : 0;
  const fvgBoost = hasFvgBoost ? 1 : 0;
  const score =
    25 * Math.min(bodyMultiple / 2, 1) +
    25 * Math.min(rangeMultiple / 2, 1) +
    30 * Math.min(closeBreakMultiple, 1) +
    20 * fvgBoost;
  return { score: Math.round(clamp(score, 0, 100)), atr };
}

function sameDirectionFvgs(exactFvgs: readonly ExactFvg[], direction: ExactOrderBlockDirection): ExactFvg[] {
  return exactFvgs.filter((fvg) => fvg.direction === direction && fvg.mitigationStatus !== "INVALIDATED");
}

function overlapAmount(aLower: number, aUpper: number, bLower: number, bUpper: number): number {
  return Math.max(0, Math.min(aUpper, bUpper) - Math.max(aLower, bLower));
}

export function evaluateObFvgRelation(
  obZone: EvaluateObFvgRelationInput,
  exactFvgs: readonly ExactFvg[] = [],
): ExactOrderBlockFvgRelation {
  const relevant = sameDirectionFvgs(exactFvgs, obZone.direction);
  if (!relevant.length) return "NO_FVG_CONTEXT";
  for (const fvg of relevant) {
    const size = Math.max(0, fvg.upper - fvg.lower);
    if (size > 0 && overlapAmount(obZone.zoneLower, obZone.zoneUpper, fvg.lower, fvg.upper) >= size * 0.3) {
      return "OB_OVERLAP";
    }
  }
  if (fin(obZone.displacementStartIndex) && fin(obZone.displacementEndIndex)) {
    for (const fvg of relevant) {
      if (fvg.startIndex >= obZone.displacementStartIndex - 1 && fvg.startIndex <= obZone.displacementEndIndex + 1) {
        return "FVG_AFTER_DISPLACEMENT";
      }
    }
  }
  const adjacentThreshold = fin(obZone.atr) && obZone.atr > 0 ? obZone.atr * 0.5 : 0;
  if (adjacentThreshold > 0) {
    for (const fvg of relevant) {
      const gap = Math.max(0, Math.max(fvg.lower - obZone.zoneUpper, obZone.zoneLower - fvg.upper));
      if (gap <= adjacentThreshold) return "OB_ADJACENT";
    }
  }
  return "NO_FVG_CONTEXT";
}

function mitigation(
  candles: readonly ExactOrderBlockCandle[],
  direction: ExactOrderBlockDirection,
  zoneLower: number,
  zoneUpper: number,
  invalidationPrice: number,
  displacementEndIndex: number | null,
): { fillPct: number; mitigationStatus: ExactOrderBlockMitigationStatus } {
  if (!fin(displacementEndIndex)) return { fillPct: 0, mitigationStatus: "FRESH" };
  const zoneHeight = zoneUpper - zoneLower;
  if (zoneHeight <= 0) return { fillPct: 0, mitigationStatus: "FRESH" };
  let maxFill = 0;
  let invalidated = false;
  for (let i = displacementEndIndex + 1; i < candles.length; i += 1) {
    const c = candles[i];
    if (!validCandle(c)) continue;
    if (direction === "BULLISH") {
      if (c.close < invalidationPrice) invalidated = true;
      if (c.low < zoneUpper) {
        maxFill = Math.max(maxFill, clamp((zoneUpper - Math.max(c.low, zoneLower)) / zoneHeight, 0, 1));
      }
    } else {
      if (c.close > invalidationPrice) invalidated = true;
      if (c.high > zoneLower) {
        maxFill = Math.max(maxFill, clamp((Math.min(c.high, zoneUpper) - zoneLower) / zoneHeight, 0, 1));
      }
    }
  }
  if (invalidated) return { fillPct: round4(maxFill), mitigationStatus: "INVALIDATED" };
  if (maxFill >= 1) return { fillPct: 1, mitigationStatus: "MITIGATED" };
  if (maxFill > 0) return { fillPct: round4(maxFill), mitigationStatus: "PARTIALLY_MITIGATED" };
  return { fillPct: 0, mitigationStatus: "FRESH" };
}

function conflictsWithContext(direction: ExactOrderBlockDirection, context?: ExactOrderBlockContext): boolean {
  const htfBias = typeof context?.htfBias === "string" ? context.htfBias.toUpperCase() : null;
  if (htfBias === "BULLISH" || htfBias === "BEARISH") return htfBias !== direction;
  const regime = typeof context?.regime === "string" ? context.regime.toUpperCase() : "";
  return (direction === "BULLISH" && regime.includes("DOWNTREND")) || (direction === "BEARISH" && regime.includes("UPTREND"));
}

function targetTooClose(context?: ExactOrderBlockContext): boolean {
  return fin(context?.targetDistanceR) && context.targetDistanceR < 1;
}

function classify(params: {
  insufficient: boolean;
  hasStructure: boolean;
  displacementStrength: number | null;
  minDisplacementScore: number;
  mitigationStatus: ExactOrderBlockMitigationStatus;
  ageBars: number;
  maxAgeBars: number | null;
  context?: ExactOrderBlockContext;
  direction: ExactOrderBlockDirection;
}): ExactOrderBlockClassification {
  if (params.insufficient) return "INSUFFICIENT_DATA";
  if (!params.hasStructure) return "NO_STRUCTURE_CONFIRMATION";
  if (!fin(params.displacementStrength) || params.displacementStrength < params.minDisplacementScore) return "WEAK_DISPLACEMENT";
  if (params.mitigationStatus === "INVALIDATED") return "INVALIDATED";
  if (params.maxAgeBars != null && params.ageBars > params.maxAgeBars) return "TOO_OLD";
  if (params.mitigationStatus === "MITIGATED") return "ALREADY_MITIGATED";
  if (conflictsWithContext(params.direction, params.context)) return "CONFLICTING_DIRECTION";
  if (targetTooClose(params.context)) return "TARGET_TOO_CLOSE";
  return "VALID_OB";
}

function qualityBand(score: number): ExactOrderBlockQualityBand {
  if (score >= 80) return "HIGH_QUALITY_SHADOW";
  if (score >= 60) return "SHADOW_CANDIDATE";
  if (score >= 40) return "WATCH_ONLY";
  return "IGNORE";
}

function qualityScore(params: {
  classification: ExactOrderBlockClassification;
  direction: ExactOrderBlockDirection;
  displacementStrength: number | null;
  mitigationStatus: ExactOrderBlockMitigationStatus;
  fvgRelation: ExactOrderBlockFvgRelation;
  context?: ExactOrderBlockContext;
  atr: number | null;
  zoneHeight: number;
  ageBars: number;
  maxAgeBars: number | null;
}): number {
  let score = params.classification === "VALID_OB" ? 20 : 0;
  if (fin(params.displacementStrength)) score += params.displacementStrength >= 60 ? 15 : params.displacementStrength >= 40 ? 8 : 0;
  if (params.mitigationStatus === "FRESH") score += 15;
  if (params.fvgRelation === "OB_OVERLAP" || params.fvgRelation === "FVG_AFTER_DISPLACEMENT") score += 10;
  if (params.fvgRelation === "OB_ADJACENT") score += 5;
  if (params.context?.htfBias === params.direction) score += 10;
  if (
    (params.direction === "BULLISH" && params.context?.premiumDiscount === "DISCOUNT") ||
    (params.direction === "BEARISH" && params.context?.premiumDiscount === "PREMIUM")
  ) {
    score += 10;
  }
  if (params.atr != null && params.atr > 0 && params.zoneHeight <= params.atr * 1.2) score += 10;
  if (params.maxAgeBars != null && params.ageBars <= Math.max(1, params.maxAgeBars * 0.25)) score += 5;
  if (fin(params.context?.targetDistanceR) && params.context.targetDistanceR >= 1.5) score += 5;
  if (params.mitigationStatus === "MITIGATED") score -= 20;
  if (params.mitigationStatus === "INVALIDATED") score -= 25;
  if (params.context?.premiumDiscount === "MIDDLE") score -= 20;
  if (params.classification === "WEAK_DISPLACEMENT") score -= 15;
  if (params.classification === "CONFLICTING_DIRECTION") score -= 15;
  if (params.classification === "TARGET_TOO_CLOSE") score -= 15;
  if (params.classification === "TOO_OLD") score -= 10;
  return Math.round(clamp(score, 0, 100));
}

function buildBase(
  candles: readonly ExactOrderBlockCandle[],
  obIndex: number,
  direction: ExactOrderBlockDirection,
  timeframe?: string,
): Omit<
  ExactOrderBlock,
  | "id"
  | "displacementStartIndex"
  | "displacementEndIndex"
  | "bosIndex"
  | "bosLevel"
  | "bosClose"
  | "displacementStrength"
  | "ageBars"
  | "mitigationStatus"
  | "fillPct"
  | "fvgRelation"
  | "obFvgRelation"
  | "classification"
  | "qualityScore"
  | "qualityBand"
> {
  const c = candles[obIndex]!;
  const bLow = bodyLow(c);
  const bHigh = bodyHigh(c);
  const zoneLower = direction === "BULLISH" ? c.low : bLow;
  const zoneUpper = direction === "BULLISH" ? bHigh : c.high;
  const refinedLower = direction === "BULLISH" ? bLow - (bLow - c.low) * 0.5 : bLow;
  const refinedUpper = direction === "BULLISH" ? bHigh : bHigh + (c.high - bHigh) * 0.5;
  return {
    timeframe,
    direction,
    obIndex,
    obTime: c.time,
    candleOpen: round4(c.open),
    candleHigh: round4(c.high),
    candleLow: round4(c.low),
    candleClose: round4(c.close),
    bodyLow: round4(bLow),
    bodyHigh: round4(bHigh),
    wickLow: round4(c.low),
    wickHigh: round4(c.high),
    zoneLower: round4(zoneLower),
    zoneUpper: round4(zoneUpper),
    refinedLower: round4(refinedLower),
    refinedUpper: round4(refinedUpper),
    midpoint: round4((zoneLower + zoneUpper) / 2),
    invalidationPrice: round4(direction === "BULLISH" ? c.low : c.high),
    source: "EXACT_OB_DETECTOR_V1",
  };
}

function finalize(
  base: Omit<
    ExactOrderBlock,
    | "id"
    | "displacementStartIndex"
    | "displacementEndIndex"
    | "bosIndex"
    | "bosLevel"
    | "bosClose"
    | "displacementStrength"
    | "ageBars"
    | "mitigationStatus"
    | "fillPct"
    | "fvgRelation"
    | "obFvgRelation"
    | "classification"
    | "qualityScore"
    | "qualityBand"
  >,
  fields: Omit<
    ExactOrderBlock,
    | keyof Omit<
        ExactOrderBlock,
        | "id"
        | "displacementStartIndex"
        | "displacementEndIndex"
        | "bosIndex"
        | "bosLevel"
        | "bosClose"
        | "displacementStrength"
        | "ageBars"
        | "mitigationStatus"
        | "fillPct"
        | "fvgRelation"
        | "obFvgRelation"
        | "classification"
        | "qualityScore"
        | "qualityBand"
      >
    | "id"
    | "qualityBand"
  >,
): ExactOrderBlock {
  const id = `${base.timeframe ?? "NA"}:${base.direction}:${base.obIndex}:${fields.displacementEndIndex ?? "NO_BOS"}:${base.zoneLower}-${base.zoneUpper}`;
  return {
    ...base,
    ...fields,
    id,
    qualityBand: qualityBand(fields.qualityScore),
  };
}

export function detectExactOrderBlocks(
  candles: readonly ExactOrderBlockCandle[],
  options: DetectExactOrderBlocksOptions = {},
): ExactOrderBlock[] {
  if (!Array.isArray(candles) || candles.length < 5) return [];
  const directionFilter = options.direction ?? "BOTH";
  const swingLeftBars = wholeNumber(options.swingLeftBars, 2, 1);
  const swingRightBars = wholeNumber(options.swingRightBars, 2, 1);
  const structureLookbackBars = wholeNumber(options.structureLookbackBars, 30, 1);
  const maxDisplacementBars = wholeNumber(options.maxDisplacementBars, 3, 1);
  const atrPeriod = wholeNumber(options.atrPeriod, 14, 1);
  const medianLookback = wholeNumber(options.medianLookback, 20, 1);
  const minDisplacementScore = fin(options.minDisplacementScore) ? clamp(options.minDisplacementScore, 0, 100) : 40;
  const maxAgeBars = options.maxAgeBars == null ? null : wholeNumber(options.maxAgeBars, 0, 0);
  const includeMitigated = options.includeMitigated !== false;
  const exactFvgs = options.exactFvgs ?? [];
  const swings = findFractalSwings(candles as readonly SmcCandle[], {
    leftBars: swingLeftBars,
    rightBars: swingRightBars,
    confirmByClose: true,
  });
  const out: ExactOrderBlock[] = [];

  for (let obIndex = 0; obIndex < candles.length - 1; obIndex += 1) {
    const c = candles[obIndex];
    if (!validCandle(c) || c.close === c.open) continue;
    const direction: ExactOrderBlockDirection = c.close < c.open ? "BULLISH" : "BEARISH";
    if (directionFilter !== "BOTH" && directionFilter !== direction) continue;

    const base = buildBase(candles, obIndex, direction, options.timeframe);
    const swingType = direction === "BULLISH" ? "SWING_HIGH" : "SWING_LOW";
    const swing = latestConfirmedSwingBefore(swings, swingType, obIndex, swingRightBars, structureLookbackBars);
    const fallbackAgeBars = candles.length - 1 - obIndex;
    if (!swing) {
      const relation = evaluateObFvgRelation({ direction, zoneLower: base.zoneLower, zoneUpper: base.zoneUpper }, exactFvgs);
      const classification = classify({
        insufficient: false,
        hasStructure: false,
        displacementStrength: null,
        minDisplacementScore,
        mitigationStatus: "FRESH",
        ageBars: fallbackAgeBars,
        maxAgeBars,
        context: options.context,
        direction,
      });
      const score = qualityScore({
        classification,
        direction,
        displacementStrength: null,
        mitigationStatus: "FRESH",
        fvgRelation: relation,
        context: options.context,
        atr: null,
        zoneHeight: base.zoneUpper - base.zoneLower,
        ageBars: fallbackAgeBars,
        maxAgeBars,
      });
      out.push(
        finalize(base, {
          displacementStartIndex: null,
          displacementEndIndex: null,
          bosIndex: null,
          bosLevel: null,
          bosClose: null,
          displacementStrength: null,
          ageBars: fallbackAgeBars,
          mitigationStatus: "FRESH",
          fillPct: 0,
          fvgRelation: relation,
          obFvgRelation: relation,
          classification,
          qualityScore: score,
        }),
      );
      continue;
    }

    let displacementEndIndex: number | null = null;
    for (let j = obIndex + 1; j <= Math.min(candles.length - 1, obIndex + maxDisplacementBars); j += 1) {
      const d = candles[j];
      if (!validCandle(d)) continue;
      const closesBeyondBos = direction === "BULLISH" ? d.close > swing.price : d.close < swing.price;
      if (closesBeyondBos && !hasCloserOriginCandle(candles, obIndex + 1, j, direction)) {
        displacementEndIndex = j;
        break;
      }
    }

    const hasStructure = displacementEndIndex != null;
    const hasFvgBoost =
      hasStructure &&
      sameDirectionFvgs(exactFvgs, direction).some(
        (fvg) => fvg.startIndex >= obIndex && fvg.startIndex <= (displacementEndIndex as number) + 1,
      );
    const scoreResult = hasStructure
      ? displacementScore(candles, displacementEndIndex as number, swing.price, atrPeriod, medianLookback, Boolean(hasFvgBoost))
      : { score: null, atr: null };
    const m = mitigation(candles, direction, base.zoneLower, base.zoneUpper, base.invalidationPrice, displacementEndIndex);
    const ageBars = hasStructure ? candles.length - 1 - (displacementEndIndex as number) : fallbackAgeBars;
    const relation = evaluateObFvgRelation(
      {
        direction,
        zoneLower: base.zoneLower,
        zoneUpper: base.zoneUpper,
        displacementStartIndex: obIndex,
        displacementEndIndex,
        atr: scoreResult.atr,
      },
      exactFvgs,
    );
    const classification = classify({
      insufficient: false,
      hasStructure,
      displacementStrength: scoreResult.score,
      minDisplacementScore,
      mitigationStatus: m.mitigationStatus,
      ageBars,
      maxAgeBars,
      context: options.context,
      direction,
    });
    if (!includeMitigated && (classification === "INVALIDATED" || classification === "ALREADY_MITIGATED")) continue;
    const score = qualityScore({
      classification,
      direction,
      displacementStrength: scoreResult.score,
      mitigationStatus: m.mitigationStatus,
      fvgRelation: relation,
      context: options.context,
      atr: scoreResult.atr,
      zoneHeight: base.zoneUpper - base.zoneLower,
      ageBars,
      maxAgeBars,
    });
    out.push(
      finalize(base, {
        displacementStartIndex: hasStructure ? obIndex : null,
        displacementEndIndex,
        bosIndex: hasStructure ? swing.index : null,
        bosLevel: hasStructure ? round4(swing.price) : null,
        bosClose: hasStructure ? round4(candles[displacementEndIndex as number]!.close) : null,
        displacementStrength: scoreResult.score,
        ageBars,
        mitigationStatus: m.mitigationStatus,
        fillPct: m.fillPct,
        fvgRelation: relation,
        obFvgRelation: relation,
        classification,
        qualityScore: score,
      }),
    );
  }

  return out.sort((a, b) => b.qualityScore - a.qualityScore || b.obIndex - a.obIndex);
}
