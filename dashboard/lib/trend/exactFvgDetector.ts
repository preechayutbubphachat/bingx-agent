// dashboard/lib/trend/exactFvgDetector.ts
// Phase T-3H-6-d1 - deterministic exact FVG detector.
//
// SAFETY:
//   - Pure OHLC helper only. No I/O, env, network, route, runner, execution,
//     broker, threshold, order, or activation imports.
//   - d1 produces exact-zone evidence only; it is not wired into strategy,
//     snapshots, Agent HQ, runner, preflight, or execution.

export interface ExactFvgCandle {
  time?: number | string;
  open: number;
  high: number;
  low: number;
  close: number;
}

export type ExactFvgDirection = "BULLISH" | "BEARISH";
export type ExactFvgMitigationStatus = "FRESH" | "PARTIALLY_MITIGATED" | "MITIGATED" | "INVALIDATED";

export interface DetectExactFvgsOptions {
  timeframe?: string;
  minGapAtrMultiple?: number;
  atrPeriod?: number;
  minGapAbs?: number;
  maxAgeBars?: number;
  includeMitigated?: boolean;
  consequentEncroachmentPct?: number;
}

export interface ExactFvg {
  id: string;
  timeframe?: string;
  direction: ExactFvgDirection;
  startIndex: number;
  middleIndex: number;
  endIndex: number;
  startTime?: number | string;
  endTime?: number | string;
  gapLow: number;
  gapHigh: number;
  lower: number;
  upper: number;
  midpoint: number;
  size: number;
  sizeAtrMultiple: number | null;
  atrAtDetection: number | null;
  atrAvailable: boolean;
  fillPct: number;
  mitigationStatus: ExactFvgMitigationStatus;
  consequentEncroachment: number;
  displacementStrength: number | null;
  ageBars: number;
  invalidationPrice: number;
  obRelation: "NOT_EVALUATED";
  source: "EXACT_FVG_DETECTOR_V1";
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

function validCandle(c: unknown): c is ExactFvgCandle {
  if (!c || typeof c !== "object") return false;
  const o = c as Record<string, unknown>;
  return fin(o.open) && fin(o.high) && fin(o.low) && fin(o.close) && o.high >= o.low;
}

function trueRange(candle: ExactFvgCandle, previous: ExactFvgCandle | null): number {
  if (!previous) return candle.high - candle.low;
  return Math.max(candle.high - candle.low, Math.abs(candle.high - previous.close), Math.abs(candle.low - previous.close));
}

function atrAt(candles: readonly ExactFvgCandle[], index: number, period: number): number | null {
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

function median(values: number[]): number | null {
  const clean = values.filter(fin).sort((a, b) => a - b);
  if (!clean.length) return null;
  const mid = Math.floor(clean.length / 2);
  return clean.length % 2 === 0 ? (clean[mid - 1]! + clean[mid]!) / 2 : clean[mid]!;
}

function medianBodyBefore(candles: readonly ExactFvgCandle[], index: number, lookback = 20): number | null {
  const start = Math.max(0, index - lookback);
  const values: number[] = [];
  for (let i = start; i < index; i += 1) {
    const c = candles[i];
    if (validCandle(c)) values.push(Math.abs(c.close - c.open));
  }
  return median(values);
}

function displacementStrength(candles: readonly ExactFvgCandle[], middleIndex: number): number | null {
  const middle = candles[middleIndex];
  if (!validCandle(middle)) return null;
  const baseline = medianBodyBefore(candles, middleIndex);
  if (!baseline || baseline <= 0) return null;
  return round4(clamp(Math.abs(middle.close - middle.open) / baseline, 0, 100));
}

function mitigation(
  candles: readonly ExactFvgCandle[],
  direction: ExactFvgDirection,
  lower: number,
  upper: number,
  midpoint: number,
  endIndex: number,
): { fillPct: number; mitigationStatus: ExactFvgMitigationStatus } {
  let maxFill = 0;
  let invalidated = false;
  for (let i = endIndex + 1; i < candles.length; i += 1) {
    const c = candles[i];
    if (!validCandle(c)) continue;
    if (direction === "BULLISH") {
      if (c.close < lower) invalidated = true;
      if (c.low < upper) {
        maxFill = Math.max(maxFill, clamp((upper - Math.max(c.low, lower)) / (upper - lower), 0, 1));
      }
    } else {
      if (c.close > upper) invalidated = true;
      if (c.high > lower) {
        maxFill = Math.max(maxFill, clamp((Math.min(c.high, upper) - lower) / (upper - lower), 0, 1));
      }
    }
  }
  if (invalidated) return { fillPct: round4(maxFill), mitigationStatus: "INVALIDATED" };
  if (maxFill >= 1) return { fillPct: 1, mitigationStatus: "MITIGATED" };
  if (maxFill > 0) return { fillPct: round4(maxFill), mitigationStatus: "PARTIALLY_MITIGATED" };
  return { fillPct: 0, mitigationStatus: "FRESH" };
}

export function detectExactFvgs(candles: readonly ExactFvgCandle[], options: DetectExactFvgsOptions = {}): ExactFvg[] {
  if (!Array.isArray(candles) || candles.length < 3) return [];
  const minGapAtrMultiple = fin(options.minGapAtrMultiple) ? Math.max(0, options.minGapAtrMultiple) : 0.25;
  const atrPeriod = wholeNumber(options.atrPeriod, 14, 1);
  const minGapAbs = fin(options.minGapAbs) && options.minGapAbs > 0 ? options.minGapAbs : null;
  const maxAgeBars = options.maxAgeBars == null ? null : wholeNumber(options.maxAgeBars, 0, 0);
  const includeMitigated = options.includeMitigated !== false;
  const consequentEncroachmentPct = fin(options.consequentEncroachmentPct) ? clamp(options.consequentEncroachmentPct, 0, 1) : 0.5;

  const out: ExactFvg[] = [];
  for (let middleIndex = 1; middleIndex < candles.length - 1; middleIndex += 1) {
    const startIndex = middleIndex - 1;
    const endIndex = middleIndex + 1;
    const a = candles[startIndex];
    const b = candles[middleIndex];
    const c = candles[endIndex];
    if (!validCandle(a) || !validCandle(b) || !validCandle(c)) continue;

    const direction: ExactFvgDirection | null = c.low > a.high ? "BULLISH" : c.high < a.low ? "BEARISH" : null;
    if (!direction) continue;

    const gapLow = direction === "BULLISH" ? a.high : c.high;
    const gapHigh = direction === "BULLISH" ? c.low : a.low;
    const lower = Math.min(gapLow, gapHigh);
    const upper = Math.max(gapLow, gapHigh);
    const size = upper - lower;
    if (size <= 0) continue;

    const atr = atrAt(candles, endIndex, atrPeriod);
    const atrThreshold = atr == null ? 0 : atr * minGapAtrMultiple;
    const threshold = Math.max(minGapAbs ?? 0, atrThreshold);
    if (size < threshold) continue;

    const midpoint = (lower + upper) / 2;
    const ageBars = candles.length - 1 - endIndex;
    if (maxAgeBars != null && ageBars > maxAgeBars) continue;

    const m = mitigation(candles, direction, lower, upper, midpoint, endIndex);
    if (!includeMitigated && (m.mitigationStatus === "MITIGATED" || m.mitigationStatus === "INVALIDATED")) continue;

    out.push({
      id: `${options.timeframe ?? "NA"}:${direction}:${startIndex}-${middleIndex}-${endIndex}:${round4(lower)}-${round4(upper)}`,
      timeframe: options.timeframe,
      direction,
      startIndex,
      middleIndex,
      endIndex,
      startTime: a.time,
      endTime: c.time,
      gapLow: round4(gapLow),
      gapHigh: round4(gapHigh),
      lower: round4(lower),
      upper: round4(upper),
      midpoint: round4(midpoint),
      size: round4(size),
      sizeAtrMultiple: atr == null || atr <= 0 ? null : round4(size / atr),
      atrAtDetection: atr,
      atrAvailable: atr != null,
      fillPct: m.fillPct,
      mitigationStatus: m.mitigationStatus,
      consequentEncroachment: round4(lower + (upper - lower) * consequentEncroachmentPct),
      displacementStrength: displacementStrength(candles, middleIndex),
      ageBars,
      invalidationPrice: direction === "BULLISH" ? round4(lower) : round4(upper),
      obRelation: "NOT_EVALUATED",
      source: "EXACT_FVG_DETECTOR_V1",
    });
  }
  return out;
}
