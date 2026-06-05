export interface IndicatorCandle {
  t: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface IndicatorEvidence {
  adx: number | null;
  plusDI: number | null;
  minusDI: number | null;
  rsi: number | null;
  atr: number | null;
  atrPct: number | null;
  bbw: number | null;
  macd: number | null;
  macdSignal: number | null;
  macdHistogram: number | null;
  emaSlope: number | null;
  source: "market_snapshot";
  calculatedAt: string;
  candleCount: number;
  timeframe: string;
  freshness: {
    latestCandleAt: string | null;
    ageMs: number | null;
  };
  missingFields: string[];
  notes: string[];
}

export interface ComputeIndicatorOptions {
  timeframe?: string;
  nowMs?: number;
}

const ADX_PERIOD = 14;
const RSI_PERIOD = 14;
const ATR_PERIOD = 14;
const BBW_PERIOD = 20;
const BBW_STDDEV = 2;
const MACD_FAST = 12;
const MACD_SLOW = 26;
const MACD_SIGNAL = 9;
const EMA_SLOPE_PERIOD = 20;

function validNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function cleanCandles(candles: IndicatorCandle[]): IndicatorCandle[] {
  if (!Array.isArray(candles)) return [];
  return candles
    .filter((c) =>
      validNumber(c?.t) &&
      validNumber(c?.open) &&
      validNumber(c?.high) &&
      validNumber(c?.low) &&
      validNumber(c?.close) &&
      c.high >= c.low
    )
    .slice()
    .sort((a, b) => a.t - b.t);
}

function avg(values: number[]): number | null {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function emaSeries(values: number[], period: number): number[] {
  if (values.length < period) return [];
  const out: number[] = [];
  const first = avg(values.slice(0, period));
  if (first == null) return [];
  const k = 2 / (period + 1);
  let previous = first;
  out.push(previous);
  for (let i = period; i < values.length; i++) {
    previous = values[i] * k + previous * (1 - k);
    out.push(previous);
  }
  return out;
}

function trueRanges(candles: IndicatorCandle[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const prevClose = candles[i - 1].close;
    out.push(Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - prevClose),
      Math.abs(candles[i].low - prevClose)
    ));
  }
  return out;
}

function latestAtr(candles: IndicatorCandle[], period = ATR_PERIOD): number | null {
  const ranges = trueRanges(candles);
  if (ranges.length < period) return null;
  return avg(ranges.slice(-period));
}

function latestRsi(candles: IndicatorCandle[], period = RSI_PERIOD): number | null {
  if (candles.length <= period) return null;
  let gains = 0;
  let losses = 0;
  const start = candles.length - period;
  for (let i = start; i < candles.length; i++) {
    const change = candles[i].close - candles[i - 1].close;
    if (change >= 0) gains += change;
    else losses += Math.abs(change);
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

function latestBbw(candles: IndicatorCandle[], period = BBW_PERIOD, multiplier = BBW_STDDEV): number | null {
  if (candles.length < period) return null;
  const closes = candles.slice(-period).map((c) => c.close);
  const middle = avg(closes);
  if (middle == null || middle === 0) return null;
  const variance = avg(closes.map((close) => (close - middle) ** 2));
  if (variance == null) return null;
  const std = Math.sqrt(variance);
  return ((middle + multiplier * std) - (middle - multiplier * std)) / middle;
}

function latestMacd(candles: IndicatorCandle[]): Pick<IndicatorEvidence, "macd" | "macdSignal" | "macdHistogram"> {
  const closes = candles.map((c) => c.close);
  const fast = emaSeries(closes, MACD_FAST);
  const slow = emaSeries(closes, MACD_SLOW);
  if (!fast.length || !slow.length) return { macd: null, macdSignal: null, macdHistogram: null };
  const offset = fast.length - slow.length;
  const macdSeries = slow.map((slowValue, i) => fast[i + offset] - slowValue);
  const signal = emaSeries(macdSeries, MACD_SIGNAL);
  if (!signal.length) return { macd: null, macdSignal: null, macdHistogram: null };
  const macd = macdSeries.at(-1)!;
  const macdSignal = signal.at(-1)!;
  return { macd, macdSignal, macdHistogram: macd - macdSignal };
}

function latestEmaSlope(candles: IndicatorCandle[], period = EMA_SLOPE_PERIOD): number | null {
  const ema = emaSeries(candles.map((c) => c.close), period);
  if (ema.length < 2) return null;
  return ema.at(-1)! - ema.at(-2)!;
}

function latestAdx(candles: IndicatorCandle[], period = ADX_PERIOD): { adx: number | null; plusDI: number | null; minusDI: number | null } {
  if (candles.length <= period * 2) return { adx: null, plusDI: null, minusDI: null };
  const plusDm: number[] = [];
  const minusDm: number[] = [];
  const tr = trueRanges(candles);
  for (let i = 1; i < candles.length; i++) {
    const upMove = candles[i].high - candles[i - 1].high;
    const downMove = candles[i - 1].low - candles[i].low;
    plusDm.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDm.push(downMove > upMove && downMove > 0 ? downMove : 0);
  }
  const dxValues: number[] = [];
  for (let i = period - 1; i < tr.length; i++) {
    const trSum = tr.slice(i - period + 1, i + 1).reduce((sum, value) => sum + value, 0);
    if (trSum === 0) {
      dxValues.push(0);
      continue;
    }
    const plus = plusDm.slice(i - period + 1, i + 1).reduce((sum, value) => sum + value, 0);
    const minus = minusDm.slice(i - period + 1, i + 1).reduce((sum, value) => sum + value, 0);
    const plusDI = (plus / trSum) * 100;
    const minusDI = (minus / trSum) * 100;
    const denominator = plusDI + minusDI;
    dxValues.push(denominator === 0 ? 0 : (Math.abs(plusDI - minusDI) / denominator) * 100);
  }
  if (dxValues.length < period) return { adx: null, plusDI: null, minusDI: null };
  const latestIndex = tr.length - 1;
  const trSum = tr.slice(latestIndex - period + 1, latestIndex + 1).reduce((sum, value) => sum + value, 0);
  if (trSum === 0) return { adx: avg(dxValues.slice(-period)), plusDI: 0, minusDI: 0 };
  const plus = plusDm.slice(latestIndex - period + 1, latestIndex + 1).reduce((sum, value) => sum + value, 0);
  const minus = minusDm.slice(latestIndex - period + 1, latestIndex + 1).reduce((sum, value) => sum + value, 0);
  return {
    adx: avg(dxValues.slice(-period)),
    plusDI: (plus / trSum) * 100,
    minusDI: (minus / trSum) * 100,
  };
}

export function computeIndicatorEvidence(
  inputCandles: IndicatorCandle[],
  options: ComputeIndicatorOptions = {}
): IndicatorEvidence {
  const candles = cleanCandles(inputCandles);
  const nowMs = options.nowMs ?? Date.now();
  const latest = candles.at(-1) ?? null;
  const missingFields: string[] = [];
  const notes: string[] = [];
  const base = {
    source: "market_snapshot" as const,
    calculatedAt: new Date(nowMs).toISOString(),
    candleCount: candles.length,
    timeframe: options.timeframe ?? "15m",
    freshness: {
      latestCandleAt: latest ? new Date(latest.t).toISOString() : null,
      ageMs: latest ? Math.max(0, nowMs - latest.t) : null,
    },
    missingFields,
    notes,
  };

  if (!candles.length) {
    notes.push("no_valid_candles");
  }

  const atr = latestAtr(candles);
  const rsi = latestRsi(candles);
  const bbw = latestBbw(candles);
  const macd = latestMacd(candles);
  const adx = latestAdx(candles);
  const emaSlope = latestEmaSlope(candles);
  const atrPct = atr != null && latest?.close ? (atr / latest.close) * 100 : null;

  const values = {
    adx: adx.adx,
    plusDI: adx.plusDI,
    minusDI: adx.minusDI,
    rsi,
    atr,
    atrPct,
    bbw,
    macd: macd.macd,
    macdSignal: macd.macdSignal,
    macdHistogram: macd.macdHistogram,
    emaSlope,
  };

  for (const [field, value] of Object.entries(values)) {
    if (value == null) missingFields.push(field);
  }
  if (missingFields.length && candles.length) {
    notes.push("insufficient_candles");
  }

  return {
    ...values,
    ...base,
  };
}
