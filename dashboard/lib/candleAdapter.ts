// candleAdapter.ts
export type Candle = {
    t: number; // ms epoch recommended
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
};

function toNum(x: any): number {
    if (x == null) return NaN;
    if (typeof x === "number") return x;
    if (typeof x === "string") return Number(x);
    return Number(x);
}

function pick(obj: any, keys: string[]): any {
    for (const k of keys) {
        if (obj && Object.prototype.hasOwnProperty.call(obj, k)) return obj[k];
    }
    return undefined;
}

export function normalizeCandle(raw: any): Candle | null {
    // Format A: [t,o,h,l,c,v]
    if (Array.isArray(raw)) {
        const t = toNum(raw[0]);
        const open = toNum(raw[1]);
        const high = toNum(raw[2]);
        const low = toNum(raw[3]);
        const close = toNum(raw[4]);
        const volume = toNum(raw[5] ?? 0);
        if (![t, open, high, low, close].every(Number.isFinite)) return null;
        return { t, open, high, low, close, volume: Number.isFinite(volume) ? volume : 0 };
    }

    // Format B: {t/open/high/low/close/volume} with variants
    if (raw && typeof raw === "object") {
        const t = toNum(pick(raw, ["t", "time", "timestamp", "ts", "openTime", "startTime"]));
        const open = toNum(pick(raw, ["open", "o"]));
        const high = toNum(pick(raw, ["high", "h"]));
        const low = toNum(pick(raw, ["low", "l"]));
        const close = toNum(pick(raw, ["close", "c"]));
        const volume = toNum(pick(raw, ["volume", "vol", "v", "baseVolume", "qty"]));
        if (![t, open, high, low, close].every(Number.isFinite)) return null;
        return { t, open, high, low, close, volume: Number.isFinite(volume) ? volume : 0 };
    }

    return null;
}

export function normalizeCandles(rawCandles: any[]): Candle[] {
    if (!Array.isArray(rawCandles)) return [];
    const out: Candle[] = [];
    for (const r of rawCandles) {
        const c = normalizeCandle(r);
        if (c) out.push(c);
    }
    // sort by time just in case
    out.sort((a, b) => a.t - b.t);
    return out;
}

/**
 * Safe getter for market_snapshot klines.
 * Supports keys like "5M" / "5m" / "1H" / "60m" etc if caller passes the correct tfKey.
 */
export function getCandlesFromSnapshot(snapshot: any, tfKey: string): Candle[] {
    const raw =
        snapshot?.market_data?.klines?.[tfKey]?.candles ??
        snapshot?.market_data?.klines?.[tfKey]?.data ??
        snapshot?.market_data?.klines?.[tfKey] ??
        null;

    if (!raw) return [];
    // raw could be object with candles
    const rawCandles = Array.isArray(raw) ? raw : raw?.candles;
    return normalizeCandles(rawCandles ?? []);
}
