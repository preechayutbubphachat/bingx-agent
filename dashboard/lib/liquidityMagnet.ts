// dashboard/lib/liquidityMagnet.ts
/*

Liquidity Magnet Engine (TypeScript re-implementation)
Inspired by TradingView indicator concept:
"Dynamic Liquidity HeatMap Profile [BigBeluga]" (MPL 2.0 concept lineage)

This is NOT a line-by-line port. It's a clean-room implementation of the idea:
- Detect swing pivots
- Keep pivots until swept
- Build liquidity profile (bins) from pivot "strength"
- Extract POC and nearest strong liquidity magnets above/below price
- Compute bias + target

*/

export type Candle = {
    t: number; // ms or seconds (we normalize to ms if needed)
    o: number;
    h: number;
    l: number;
    c: number;
    v: number;
};

export type MagnetSide = "ABOVE" | "BELOW";
export type MagnetBias = "UP" | "DOWN" | "NEUTRAL";

export type MagnetLevel = {
    price: number;
    side: MagnetSide;
    score: number; // strength normalized (bigger = stronger)
    distance: number; // abs(price - lastClose)
};

export type LiquidityMagnetResult = {
    tf: string; // "5m" | "1h" etc.
    lastClose: number | null;
    poc: number | null;

    bias: MagnetBias;
    target: number | null;

    magnetsAbove: MagnetLevel[];
    magnetsBelow: MagnetLevel[];

    // For plan comparison (optional)
    planDir?: "UP" | "DOWN" | "RANGE" | null;
    alignment?: "ALIGNED" | "DIVERGENCE" | "UNKNOWN";
    note?: string;

    // One-liners for UI
    twoLiner: [string, string];

    // Debug (keep small)
    debug?: {
        pivotCount: number;
        activePivotCount: number;
        bins: number;
        lookBack: number;
    };
};

type Pivot = {
    kind: "HIGH" | "LOW";
    t: number;
    origin: number; // pivot high/low (sweep trigger)
    level: number; // extended level (ATR * nVol)
    strength: number; // nVol-ish
    swept: boolean;
};

export type LiquidityMagnetOptions = {
    lookBack?: number; // bars
    bins?: number; // profile resolution
    leftRight?: number; // pivot window (left=right)
    atrLen?: number;
    volNormLen?: number;
    topK?: number; // magnets above/below
    minCandles?: number;
};

const DEFAULTS: Required<LiquidityMagnetOptions> = {
    lookBack: 300,
    bins: 50,
    leftRight: 2,
    atrLen: 5,
    volNormLen: 50,
    topK: 3,
    minCandles: 50,
};

function clamp(n: number, a: number, b: number) {
    return Math.max(a, Math.min(b, n));
}

function safeNum(x: any): number | null {
    const n = Number(x);
    return Number.isFinite(n) ? n : null;
}

function normalizeTime(t: number): number {
    // if seconds (10 digits), convert to ms
    if (t > 0 && t < 2e10) return t * 1000;
    return t;
}

// --- Candle parsing (handles common snapshot shapes)
export function parseCandlesAny(input: any): Candle[] {
    if (!input) return [];

    // If already Candle[]
    if (Array.isArray(input) && input.length && typeof input[0] === "object" && input[0] !== null) {
        const maybe = input[0];
        if ("h" in maybe && "l" in maybe && "c" in maybe) {
            return input
                .map((x: any) => {
                    const t = safeNum(x.t ?? x.time ?? x.ts);
                    const o = safeNum(x.o ?? x.open);
                    const h = safeNum(x.h ?? x.high);
                    const l = safeNum(x.l ?? x.low);
                    const c = safeNum(x.c ?? x.close);
                    const v = safeNum(x.v ?? x.vol ?? x.volume);
                    if ([t, o, h, l, c, v].some((z) => z === null)) return null;
                    return { t: normalizeTime(t!), o: o!, h: h!, l: l!, c: c!, v: v! } as Candle;
                })
                .filter(Boolean) as Candle[];
        }
    }

    // If array format [[t,o,h,l,c,v], ...]
    if (Array.isArray(input) && input.length && Array.isArray(input[0])) {
        return input
            .map((a: any[]) => {
                const t = safeNum(a[0]);
                const o = safeNum(a[1]);
                const h = safeNum(a[2]);
                const l = safeNum(a[3]);
                const c = safeNum(a[4]);
                const v = safeNum(a[5]);
                if ([t, o, h, l, c, v].some((z) => z === null)) return null;
                return { t: normalizeTime(t!), o: o!, h: h!, l: l!, c: c!, v: v! } as Candle;
            })
            .filter(Boolean) as Candle[];
    }

    return [];
}

/**
 * Try best-effort to find candles from typical market_snapshot.json structures.
 * You can pass keys like ["5M","5m"] or ["1H","60M","1h"]
 */
export function findCandlesInSnapshot(snapshot: any, tfKeys: string[]): Candle[] {
    if (!snapshot || typeof snapshot !== "object") return [];

    const candidates: any[] = [];

    // common nests
    // snapshot.market_data.klines["5M"].candles
    const md = (snapshot as any).market_data ?? (snapshot as any).marketData ?? snapshot;
    const klines =
        (md as any).klines ??
        (md as any).kline ??
        (md as any).candles ??
        (snapshot as any).klines ??
        (snapshot as any).kline ??
        null;

    if (klines && typeof klines === "object") {
        for (const k of tfKeys) {
            const node = (klines as any)[k];
            if (!node) continue;
            candidates.push(node);
            candidates.push((node as any).candles);
            candidates.push((node as any).data);
            candidates.push((node as any).items);
        }
    }

    // sometimes directly on snapshot: snapshot["5M"]
    for (const k of tfKeys) {
        candidates.push((snapshot as any)[k]);
        candidates.push((md as any)?.[k]);
    }

    for (const c of candidates) {
        const out = parseCandlesAny(c);
        if (out.length) return out;
    }

    return [];
}

// --- Indicators
function sma(values: number[], len: number): (number | null)[] {
    const out: (number | null)[] = new Array(values.length).fill(null);
    let sum = 0;
    for (let i = 0; i < values.length; i++) {
        sum += values[i];
        if (i >= len) sum -= values[i - len];
        if (i >= len - 1) out[i] = sum / len;
    }
    return out;
}

function atr(c: Candle[], len: number): (number | null)[] {
    const tr: number[] = [];
    for (let i = 0; i < c.length; i++) {
        const prevClose = i > 0 ? c[i - 1].c : c[i].c;
        const range1 = c[i].h - c[i].l;
        const range2 = Math.abs(c[i].h - prevClose);
        const range3 = Math.abs(c[i].l - prevClose);
        tr.push(Math.max(range1, range2, range3));
    }
    return sma(tr, len);
}

// pivot detection: local max/min within window (leftRight)
function detectPivots(candles: Candle[], opt: Required<LiquidityMagnetOptions>): Pivot[] {
    const n = candles.length;
    const L = opt.leftRight;
    const lookBack = clamp(opt.lookBack, 10, n);

    const start = Math.max(0, n - lookBack);
    const slice = candles.slice(start);

    const atrArr = atr(slice, opt.atrLen);
    const volArr = slice.map((x) => x.v);
    const volSma = sma(volArr, opt.volNormLen);

    const pivots: Pivot[] = [];

    for (let i = L; i < slice.length - L; i++) {
        const hi = slice[i].h;
        const lo = slice[i].l;

        let isHigh = true;
        let isLow = true;

        for (let k = i - L; k <= i + L; k++) {
            if (k === i) continue;
            if (slice[k].h > hi) isHigh = false;
            if (slice[k].l < lo) isLow = false;
            if (!isHigh && !isLow) break;
        }

        const a = atrArr[i];
        const vs = volSma[i];
        if (a === null || vs === null || vs <= 0) continue;

        // nVol-ish (cap to avoid insane spikes)
        const nVol = clamp(volArr[i] / vs, 0.25, 6);

        // extend level by ATR * nVol (similar spirit)
        if (isHigh) {
            pivots.push({
                kind: "HIGH",
                t: slice[i].t,
                origin: hi,
                level: hi + a * nVol,
                strength: nVol,
                swept: false,
            });
        }
        if (isLow) {
            pivots.push({
                kind: "LOW",
                t: slice[i].t,
                origin: lo,
                level: lo - a * nVol,
                strength: nVol,
                swept: false,
            });
        }
    }

    return pivots;
}

// remove pivots when swept (price breaks origin high/low after pivot)
function markSwept(pivots: Pivot[], candles: Candle[]): Pivot[] {
    if (!pivots.length) return pivots;

    // build index by time for faster scan (simple linear is ok for <= 300 bars)
    const sorted = [...candles].sort((a, b) => a.t - b.t);

    return pivots.map((p) => {
        // find candles after pivot time
        for (let i = 0; i < sorted.length; i++) {
            if (sorted[i].t <= p.t) continue;
            if (p.kind === "HIGH" && sorted[i].h > p.origin) {
                return { ...p, swept: true };
            }
            if (p.kind === "LOW" && sorted[i].l < p.origin) {
                return { ...p, swept: true };
            }
        }
        return p;
    });
}

type Bin = {
    price: number; // mid
    liq: number; // accumulated strength
};

function buildProfile(active: Pivot[], bins: number): { bins: Bin[]; poc: number | null } {
    if (!active.length) return { bins: [], poc: null };

    const prices = active.map((p) => p.level);
    let minP = Math.min(...prices);
    let maxP = Math.max(...prices);

    if (minP === maxP) {
        const single: Bin[] = [{ price: minP, liq: active.reduce((s, p) => s + p.strength, 0) }];
        return { bins: single, poc: minP };
    }

    // pad range slightly
    const pad = (maxP - minP) * 0.02;
    minP -= pad;
    maxP += pad;

    const step = (maxP - minP) / bins;

    const out: Bin[] = Array.from({ length: bins }, (_, i) => ({
        price: minP + (i + 0.5) * step,
        liq: 0,
    }));

    for (const p of active) {
        const idx = clamp(Math.floor((p.level - minP) / step), 0, bins - 1);
        // weight: strength (nVol-ish)
        out[idx].liq += p.strength;
    }

    // POC = highest liq bin
    let pocIdx = 0;
    for (let i = 1; i < out.length; i++) if (out[i].liq > out[pocIdx].liq) pocIdx = i;

    return { bins: out, poc: out[pocIdx]?.price ?? null };
}

function pickMagnets(profile: Bin[], lastClose: number, topK: number) {
    const above = profile
        .filter((b) => b.price > lastClose)
        .map((b) => ({ price: b.price, liq: b.liq, dist: b.price - lastClose }))
        .sort((a, b) => b.liq / Math.max(a.dist, 1e-9) - a.liq / Math.max(b.dist, 1e-9)); // strength per distance

    const below = profile
        .filter((b) => b.price < lastClose)
        .map((b) => ({ price: b.price, liq: b.liq, dist: lastClose - b.price }))
        .sort((a, b) => b.liq / Math.max(a.dist, 1e-9) - a.liq / Math.max(b.dist, 1e-9));

    const topAbove = above.slice(0, topK);
    const topBelow = below.slice(0, topK);

    const toLevel = (x: { price: number; liq: number; dist: number }, side: MagnetSide): MagnetLevel => ({
        price: x.price,
        side,
        score: x.liq,
        distance: x.dist,
    });

    return {
        magnetsAbove: topAbove.map((x) => toLevel(x, "ABOVE")),
        magnetsBelow: topBelow.map((x) => toLevel(x, "BELOW")),
    };
}

function computeBiasAndTarget(lastClose: number, above: MagnetLevel[], below: MagnetLevel[]): { bias: MagnetBias; target: number | null } {
    const bestAbove = above[0];
    const bestBelow = below[0];

    const scoreAbove = bestAbove ? bestAbove.score / Math.max(bestAbove.distance, 1) : 0;
    const scoreBelow = bestBelow ? bestBelow.score / Math.max(bestBelow.distance, 1) : 0;

    if (scoreAbove === 0 && scoreBelow === 0) return { bias: "NEUTRAL", target: null };

    // require a bit of dominance to call direction
    const dom = 1.15;
    if (scoreAbove > scoreBelow * dom) return { bias: "UP", target: bestAbove?.price ?? null };
    if (scoreBelow > scoreAbove * dom) return { bias: "DOWN", target: bestBelow?.price ?? null };
    return { bias: "NEUTRAL", target: null };
}

function fmt(n: number | null) {
    if (n === null || !Number.isFinite(n)) return "—";
    // BTC typically
    return n.toFixed(1);
}

function dirText(bias: MagnetBias) {
    if (bias === "UP") return "UP ↑";
    if (bias === "DOWN") return "DOWN ↓";
    return "NEUTRAL ↔";
}

export function computeLiquidityMagnetFromCandles(
    tf: string,
    candlesRaw: any,
    planDir?: "UP" | "DOWN" | "RANGE" | null,
    options?: LiquidityMagnetOptions
): LiquidityMagnetResult {
    const opt = { ...DEFAULTS, ...(options ?? {}) };

    const candles = parseCandlesAny(candlesRaw);

    if (candles.length < opt.minCandles) {
        return {
            tf,
            lastClose: candles.at(-1)?.c ?? null,
            poc: null,
            bias: "NEUTRAL",
            target: null,
            magnetsAbove: [],
            magnetsBelow: [],
            planDir: planDir ?? null,
            alignment: "UNKNOWN",
            note: `not enough candles (${candles.length}/${opt.minCandles})`,
            twoLiner: [
                `Flow(${tf}): bias=NEUTRAL | target=— | POC=—`,
                `Plan: ${planDir ?? "—"} | Alignment: UNKNOWN`,
            ],
            debug: { pivotCount: 0, activePivotCount: 0, bins: opt.bins, lookBack: opt.lookBack },
        };
    }

    const lastClose = candles[candles.length - 1].c;

    const pivots = detectPivots(candles, opt);
    const pivotsWithSweep = markSwept(pivots, candles);
    const active = pivotsWithSweep.filter((p) => !p.swept);

    const { bins, poc } = buildProfile(active, opt.bins);
    const { magnetsAbove, magnetsBelow } = pickMagnets(bins, lastClose, opt.topK);
    const { bias, target } = computeBiasAndTarget(lastClose, magnetsAbove, magnetsBelow);

    // plan alignment
    let alignment: LiquidityMagnetResult["alignment"] = "UNKNOWN";
    if (planDir === "UP" || planDir === "DOWN") {
        if ((planDir === "UP" && bias === "UP") || (planDir === "DOWN" && bias === "DOWN")) alignment = "ALIGNED";
        else if (bias === "NEUTRAL") alignment = "UNKNOWN";
        else alignment = "DIVERGENCE";
    }

    const line1 = `Flow(${tf}): bias=${dirText(bias)} | target=${fmt(target)} | POC=${fmt(poc)}`;
    const line2 = `Plan: ${planDir ?? "—"} | Alignment: ${alignment}`;

    return {
        tf,
        lastClose,
        poc,
        bias,
        target,
        magnetsAbove,
        magnetsBelow,
        planDir: planDir ?? null,
        alignment,
        twoLiner: [line1, line2],
        debug: {
            pivotCount: pivots.length,
            activePivotCount: active.length,
            bins: opt.bins,
            lookBack: opt.lookBack,
        },
    };
}

export function computeLiquidityMagnetFromSnapshot(
    snapshot: any,
    tf: string,
    tfKeys: string[],
    planDir?: "UP" | "DOWN" | "RANGE" | null,
    options?: LiquidityMagnetOptions
): LiquidityMagnetResult {
    const candles = findCandlesInSnapshot(snapshot, tfKeys);
    return computeLiquidityMagnetFromCandles(tf, candles, planDir, options);
}
