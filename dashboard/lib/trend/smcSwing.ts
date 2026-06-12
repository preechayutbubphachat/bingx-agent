// dashboard/lib/trend/smcSwing.ts
// Phase T-3H-6-d1 - deterministic SMC fractal swing utility.
//
// SAFETY:
//   - Pure OHLC helper only. No I/O, env, network, route, runner, execution,
//     broker, threshold, order, or activation imports.
//   - Output is detector evidence only and must not be wired into decisions in d1.

export interface SmcCandle {
  time?: number | string;
  open: number;
  high: number;
  low: number;
  close: number;
}

export type SmcSwingType = "SWING_HIGH" | "SWING_LOW";

export interface FindFractalSwingsOptions {
  leftBars?: number;
  rightBars?: number;
  confirmByClose?: boolean;
  minSeparationBars?: number;
  maxSwings?: number;
}

export interface SmcSwing {
  index: number;
  time?: number | string;
  type: SmcSwingType;
  price: number;
  candleHigh: number;
  candleLow: number;
  close: number;
  leftBars: number;
  rightBars: number;
  confirmed: true;
}

export interface SwingStructureSummary {
  latestSwingHigh: SmcSwing | null;
  latestSwingLow: SmcSwing | null;
  previousSwingHigh: SmcSwing | null;
  previousSwingLow: SmcSwing | null;
  highTrend: "HIGHER_HIGH" | "LOWER_HIGH" | "EQUAL_HIGH" | "UNKNOWN";
  lowTrend: "HIGHER_LOW" | "LOWER_LOW" | "EQUAL_LOW" | "UNKNOWN";
  swingCount: number;
}

const fin = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

function wholeNumber(v: unknown, fallback: number, min = 0): number {
  return fin(v) ? Math.max(min, Math.floor(v)) : fallback;
}

function validCandle(c: unknown): c is SmcCandle {
  if (!c || typeof c !== "object") return false;
  const o = c as Record<string, unknown>;
  return fin(o.open) && fin(o.high) && fin(o.low) && fin(o.close) && o.high >= o.low;
}

function validWindow(candles: readonly SmcCandle[], start: number, end: number): boolean {
  for (let i = start; i <= end; i += 1) {
    if (!validCandle(candles[i])) return false;
  }
  return true;
}

function closeConfirmed(type: SmcSwingType, candidate: SmcCandle, confirmation: SmcCandle, enabled: boolean): boolean {
  if (!enabled) return true;
  // Close confirmation is intentionally minimal and deterministic:
  // the right-edge confirmation candle must close back away from the pivot extreme.
  return type === "SWING_HIGH" ? confirmation.close < candidate.high : confirmation.close > candidate.low;
}

function enforceMinSeparation(swings: SmcSwing[], minSeparationBars: number): SmcSwing[] {
  if (minSeparationBars <= 0 || swings.length <= 1) return swings;
  const accepted: SmcSwing[] = [];
  for (const swing of swings) {
    const last = accepted.at(-1);
    if (!last || swing.index - last.index >= minSeparationBars) {
      accepted.push(swing);
      continue;
    }
    if (swing.type !== last.type) {
      accepted.push(swing);
      continue;
    }
    const swingWins =
      swing.type === "SWING_HIGH"
        ? swing.price > last.price || (swing.price === last.price && swing.index > last.index)
        : swing.price < last.price || (swing.price === last.price && swing.index > last.index);
    if (swingWins) accepted[accepted.length - 1] = swing;
  }
  return accepted;
}

export function findFractalSwings(candles: readonly SmcCandle[], options: FindFractalSwingsOptions = {}): SmcSwing[] {
  if (!Array.isArray(candles)) return [];
  const leftBars = wholeNumber(options.leftBars, 2, 1);
  const rightBars = wholeNumber(options.rightBars, 2, 1);
  const confirmByClose = options.confirmByClose !== false;
  const minSeparationBars = wholeNumber(options.minSeparationBars, 0, 0);
  const maxSwings = options.maxSwings == null ? null : wholeNumber(options.maxSwings, 0, 0);
  if (candles.length < leftBars + rightBars + 1 || maxSwings === 0) return [];

  const swings: SmcSwing[] = [];
  for (let index = leftBars; index <= candles.length - rightBars - 1; index += 1) {
    const candidate = candles[index];
    if (!validCandle(candidate) || !validWindow(candles, index - leftBars, index + rightBars)) continue;
    const left = candles.slice(index - leftBars, index);
    const right = candles.slice(index + 1, index + rightBars + 1);
    const confirmation = candles[index + rightBars]!;

    const isSwingHigh = left.every((c) => candidate.high > c.high) && right.every((c) => candidate.high > c.high);
    if (isSwingHigh && closeConfirmed("SWING_HIGH", candidate, confirmation, confirmByClose)) {
      swings.push({
        index,
        time: candidate.time,
        type: "SWING_HIGH",
        price: candidate.high,
        candleHigh: candidate.high,
        candleLow: candidate.low,
        close: candidate.close,
        leftBars,
        rightBars,
        confirmed: true,
      });
    }

    const isSwingLow = left.every((c) => candidate.low < c.low) && right.every((c) => candidate.low < c.low);
    if (isSwingLow && closeConfirmed("SWING_LOW", candidate, confirmation, confirmByClose)) {
      swings.push({
        index,
        time: candidate.time,
        type: "SWING_LOW",
        price: candidate.low,
        candleHigh: candidate.high,
        candleLow: candidate.low,
        close: candidate.close,
        leftBars,
        rightBars,
        confirmed: true,
      });
    }
  }

  const separated = enforceMinSeparation(swings.sort((a, b) => a.index - b.index || a.type.localeCompare(b.type)), minSeparationBars);
  return maxSwings == null ? separated : separated.slice(-maxSwings);
}

export function getLatestSwingHigh(swings: readonly SmcSwing[]): SmcSwing | null {
  for (let i = swings.length - 1; i >= 0; i -= 1) {
    if (swings[i]?.type === "SWING_HIGH") return swings[i]!;
  }
  return null;
}

export function getLatestSwingLow(swings: readonly SmcSwing[]): SmcSwing | null {
  for (let i = swings.length - 1; i >= 0; i -= 1) {
    if (swings[i]?.type === "SWING_LOW") return swings[i]!;
  }
  return null;
}

function previousOfType(swings: readonly SmcSwing[], type: SmcSwingType, latest: SmcSwing | null): SmcSwing | null {
  if (!latest) return null;
  for (let i = swings.length - 1; i >= 0; i -= 1) {
    const s = swings[i];
    if (s && s.type === type && s.index < latest.index) return s;
  }
  return null;
}

export function summarizeSwingStructure(swings: readonly SmcSwing[]): SwingStructureSummary {
  const ordered = [...swings].sort((a, b) => a.index - b.index || a.type.localeCompare(b.type));
  const latestSwingHigh = getLatestSwingHigh(ordered);
  const latestSwingLow = getLatestSwingLow(ordered);
  const previousSwingHigh = previousOfType(ordered, "SWING_HIGH", latestSwingHigh);
  const previousSwingLow = previousOfType(ordered, "SWING_LOW", latestSwingLow);
  const highTrend =
    latestSwingHigh && previousSwingHigh
      ? latestSwingHigh.price > previousSwingHigh.price
        ? "HIGHER_HIGH"
        : latestSwingHigh.price < previousSwingHigh.price
          ? "LOWER_HIGH"
          : "EQUAL_HIGH"
      : "UNKNOWN";
  const lowTrend =
    latestSwingLow && previousSwingLow
      ? latestSwingLow.price > previousSwingLow.price
        ? "HIGHER_LOW"
        : latestSwingLow.price < previousSwingLow.price
          ? "LOWER_LOW"
          : "EQUAL_LOW"
      : "UNKNOWN";
  return {
    latestSwingHigh,
    latestSwingLow,
    previousSwingHigh,
    previousSwingLow,
    highTrend,
    lowTrend,
    swingCount: ordered.length,
  };
}
