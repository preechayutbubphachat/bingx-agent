import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { computeLiquidityMagnetFromCandles } from "@/lib/liquidityMagnet";
import { buildSourceInfo, readRuntimeJson, resolveRuntimeDir } from "@/lib/readLatest";
import { buildTrendZoneShadow } from "@/lib/market-regime/trendZoneBuilder";
import { safeJsonErrorResponse } from "@/lib/safeJsonResponse";
import { computeIndicatorEvidence } from "@/lib/indicators/computeIndicators";
import {
    buildCanonicalMarketRegime,
    buildMultiTimeframeIndicatorEvidence,
} from "@/lib/market-regime/canonicalMarketRegime";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GOAL (D): endpoint ส่ง has_data/reason แบบ “มาตรฐาน”
 * - ทุก field ที่เป็น series (oi/funding) จะมี: status, has_data, reason, source, integrity, now, trend_5m, trend_15m
 * - ถ้าไฟล์หาย/parse พัง/series ว่าง → ไม่ throw แต่ส่ง reason ชัด ๆ ให้ UI แสดงแบบเดียวกันทุก field
 *
 * ✅ Fixes in this version (additional)
 * - writeJsonAtomic ใช้ object จริง (ไม่ stringify ก่อน) + atomic safe
 * - เพิ่ม TREND paper-trade events: TREND_TRADE_OPEN / TREND_TP1_HIT / TREND_STOP_HIT
 *   เพื่อให้ winrate endpoint เห็น “close events” ได้จริงแบบเดียวกับ OB
 *
 * ✅ NEW (public mirror fix)
 * - mirror plan_history.jsonl → public/data/plan_history.jsonl (append realtime)
 * - ถ้า public history ว่าง แต่ root history มีค่า → copy ครั้งเดียวตอน GET (bootstrap)
 */

type Candle = {
    t: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume?: number;
};

let __writeQueue = Promise.resolve();

function queueWrite<T>(task: () => Promise<T>): Promise<T> {
    const next = __writeQueue.then(task, task);
    // กัน queue ค้างถ้า task throw
    __writeQueue = next.then(
        () => undefined,
        () => undefined
    );
    return next;
}


type Point = { t: number; v: number };

type FreshTag = "UNKNOWN" | "FRESH" | "STALE" | "OLD";
type SeriesStatus = "OK" | "NO_DATA" | "INSUFFICIENT_POINTS" | "STALE" | "ERROR";

type SeriesSource = {
    file: string | null;
    keypath: string | null;
    updated_at: number | null; // ms
    freshness: { tag: FreshTag; ageSec: number | null };
};

type SeriesIntegrity = {
    count: number;
    spanSec: number;
    maxGapSec: number | null;
    monotonic: boolean;
};

type TrendOut = {
    dir: "UP" | "DOWN" | "FLAT" | "UNKNOWN";
    pct: number;
    now: number | null;
    prev: number | null;
};

function norm(x: any) {
    return String(x ?? "").trim().toUpperCase();
}

async function ensureDir(dir: string) {
    try {
        await fs.mkdir(dir, { recursive: true });
    } catch {
        // ignore
    }
}

async function readJsonSafe<T>(p: string): Promise<{ ok: true; value: T } | { ok: false; reason: string }> {
    try {
        const raw = await fs.readFile(p, "utf8");
        return { ok: true, value: JSON.parse(raw) as T };
    } catch (e: any) {
        const msg = String(e?.message ?? e);
        if (msg.toLowerCase().includes("no such file") || msg.toLowerCase().includes("enoent")) {
            return { ok: false, reason: "file_missing" };
        }
        return { ok: false, reason: `read_or_parse_error:${msg}` };
    }
}

async function fileExists(p: string) {
    try {
        await fs.access(p);
        return true;
    } catch {
        return false;
    }
}

async function fileSize(p: string) {
    try {
        const st = await fs.stat(p);
        return st.size ?? 0;
    } catch {
        return 0;
    }
}

async function appendJsonl(p: string, obj: any) {
    return queueWrite(async () => {
        await ensureDir(path.dirname(p));
        const line = JSON.stringify(obj) + "\n";

        const MAX_TRIES = 6;
        for (let i = 0; i < MAX_TRIES; i++) {
            try {
                await fs.appendFile(p, line, "utf8");
                return;
            } catch (e: any) {
                const code = e?.code;
                if (code === "EPERM" || code === "EACCES" || code === "EBUSY") {
                    await sleep(25 * (i + 1));
                    continue;
                }
                throw e;
            }
        }

        // ultimate fallback: writeFile append แบบ manual (กัน deadlock)
        const prev = (await fs.readFile(p, "utf8").catch(() => "")) ?? "";
        await fs.writeFile(p, prev + line, "utf8");
    });
}


function safeStringify(obj: any) {
    const seen = new WeakSet();
    return JSON.stringify(
        obj,
        (_k, v) => {
            if (typeof v === "bigint") return v.toString();
            if (v && typeof v === "object") {
                if (seen.has(v)) return "[Circular]";
                seen.add(v);
            }
            return v;
        },
        2
    );
}

async function sleep(ms: number) {
    return new Promise((r) => setTimeout(r, ms));
}

/**
 * Windows-safe atomic-ish move:
 * - try rename
 * - if EPERM/EACCES/EBUSY/EEXIST: retry a few times
 * - final fallback: copyFile -> unlink(tmp)
 */
async function renameWithRetryOrCopy(tmp: string, dest: string) {
    const MAX_TRIES = 6;

    for (let i = 0; i < MAX_TRIES; i++) {
        try {
            // ✅ Windows: ถ้า dest มีอยู่ rename ทับอาจพัง → ลองลบก่อนแบบ force
            await fs.rm(dest, { force: true }).catch(() => { });
            await fs.rename(tmp, dest);
            return;
        } catch (e: any) {
            const code = e?.code;
            if (code === "EPERM" || code === "EACCES" || code === "EBUSY" || code === "EEXIST") {
                // รอให้ watcher/antivirus ปล่อยไฟล์
                await sleep(25 * (i + 1));
                continue;
            }
            // ข้าม device (ไม่น่ากรณีนี้) → ใช้ fallback copy
            if (code === "EXDEV") break;

            throw e;
        }
    }

    // ✅ fallback (ไม่ atomic 100% แต่กันระบบล่ม + ใช้งานได้จริงบน Windows)
    await fs.copyFile(tmp, dest);
    await fs.unlink(tmp).catch(() => { });
}


async function writeTextAtomic(p: string, payload: string, encoding: BufferEncoding = "utf8") {
    return queueWrite(async () => {
        await ensureDir(path.dirname(p));

        // temp ต้องอยู่ directory เดียวกัน
        const tmp = `${p}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;

        try {
            // 1) เขียนลง temp ก่อน
            await fs.writeFile(tmp, payload, encoding);

            // 2) replace แบบ Windows-safe (มี retry + fallback)
            await renameWithRetryOrCopy(tmp, p);

            return;
        } catch (e: any) {
            // 3) ultimate fallback: เขียนทับไฟล์ปลายทางตรง ๆ (ไม่ atomic แต่กันล่ม)
            const code = e?.code;
            if (code === "EPERM" || code === "EACCES" || code === "EBUSY") {
                await fs.writeFile(p, payload, encoding);
                return;
            }
            throw e;
        } finally {
            // กัน tmp ค้าง
            try {
                await fs.rm(tmp, { force: true });
            } catch {
                // ignore
            }
        }
    });
}

async function writeJsonAtomic(p: string, obj: any) {
    const payload = safeStringify(obj);
    await writeTextAtomic(p, payload, "utf8");
}

/**
 * Next รันจาก /dashboard แต่ไฟล์ json อยู่ root (ข้าง server.cjs)
 * หา dir ให้เอง + รองรับ env BINGX_DATA_DIR
 */
async function resolveDataDir() {
    return (await resolveRuntimeDir()).dir;
}

function last<T>(arr: T[]) {
    return arr.length ? arr[arr.length - 1] : null;
}

function toNumber(x: any): number | null {
    const n = typeof x === "number" ? x : typeof x === "string" ? Number(x) : NaN;
    return Number.isFinite(n) ? n : null;
}

function toMs(ts: number | null): number | null {
    if (ts === null) return null;
    // 10 digits ~ seconds → ms
    return ts < 1e12 ? ts * 1000 : ts;
}

function freshnessFrom(updatedAtMs: number | null): { tag: FreshTag; ageSec: number | null } {
    if (!updatedAtMs) return { tag: "UNKNOWN", ageSec: null };
    const ageSec = Math.max(0, Math.floor((Date.now() - updatedAtMs) / 1000));
    // ปรับตามรอบ snapshot ของคุณได้
    if (ageSec <= 180) return { tag: "FRESH", ageSec };
    if (ageSec <= 1800) return { tag: "STALE", ageSec };
    return { tag: "OLD", ageSec };
}

function cloneFresh(f: { tag: FreshTag; ageSec: number | null }) {
    return { tag: f.tag, ageSec: f.ageSec };
}

function seriesIntegrity(series: Point[]): SeriesIntegrity {
    const n = series?.length ?? 0;
    if (!n) return { count: 0, spanSec: 0, maxGapSec: null, monotonic: true };

    // ✅ ตรวจ monotonic จากลำดับจริงของข้อมูล (ไม่ sort)
    let mono = true;
    for (let i = 1; i < series.length; i++) {
        const prev = toMs(series[i - 1].t) ?? series[i - 1].t;
        const cur = toMs(series[i].t) ?? series[i].t;
        if (cur < prev) {
            mono = false;
            break;
        }
    }

    // ✅ คำนวณ gap/span ใช้แบบ sort (ถูกต้องสำหรับสถิติ)
    const xs = [...series].sort((a, b) => a.t - b.t);

    let maxGap = 0;
    for (let i = 1; i < xs.length; i++) {
        const a = toMs(xs[i - 1].t) ?? xs[i - 1].t;
        const b = toMs(xs[i].t) ?? xs[i].t;
        const gap = Math.abs(b - a) / 1000;
        if (gap > maxGap) maxGap = gap;
    }

    const firstT = toMs(xs[0].t) ?? xs[0].t;
    const lastT = toMs(xs[n - 1].t) ?? xs[n - 1].t;
    const spanSec = Math.abs(lastT - firstT) / 1000;

    return { count: n, spanSec, maxGapSec: maxGap, monotonic: mono };
}

function lastPointMs(series: Point[]): number | null {
    if (!series?.length) return null;
    const p = series[series.length - 1];
    return toMs(p.t) ?? p.t;
}

function trend(series: Point[], lookbackN: number): TrendOut {
    if (!series?.length) return { dir: "UNKNOWN", pct: 0, now: null, prev: null };

    const tail = series.slice(-lookbackN);
    if (tail.length < 2) {
        const now = tail.length ? tail[tail.length - 1].v : null;
        return { dir: "UNKNOWN", pct: 0, now, prev: null };
    }

    const first = tail[0].v;
    const lastv = tail[tail.length - 1].v;

    const base = Math.abs(first) < 1e-9 ? 1 : first;
    const pct = ((lastv - first) / base) * 100;

    const dir: TrendOut["dir"] = pct > 0.05 ? "UP" : pct < -0.05 ? "DOWN" : "FLAT";
    return { dir, pct, now: lastv, prev: first };
}

function nearestValueAt(series: Point[], t: number, toleranceMs = 10 * 60 * 1000): number | null {
    if (!series?.length) return null;
    const target = toMs(t) ?? t;

    let best: { dt: number; v: number } | null = null;
    for (const p of series) {
        const pt = toMs(p.t) ?? p.t;
        const dt = Math.abs(pt - target);
        if (best === null || dt < best.dt) best = { dt, v: p.v };
    }
    if (!best) return null;
    return best.dt <= toleranceMs ? best.v : null;
}

function normalizeFundingSeries(series: any[]): Point[] {
    const out: Point[] = [];
    for (const p of series ?? []) {
        const t = toNumber(p?.t ?? p?.time ?? p?.ts);
        const v =
            toNumber(p?.lastFundingRate) ??
            toNumber(p?.fundingRate) ??
            toNumber(p?.rate) ??
            toNumber(p?.v) ??
            toNumber(p?.value) ??
            null;

        if (t !== null && v !== null) out.push({ t, v });
    }
    return out.sort((a, b) => a.t - b.t);
}

function normalizeOISeries(series: any[]): Point[] {
    const out: Point[] = [];
    for (const p of series ?? []) {
        const t = toNumber(p?.t ?? p?.time ?? p?.ts);
        const v =
            toNumber(p?.openInterest) ??
            toNumber(p?.open_interest) ??
            toNumber(p?.oi) ??
            toNumber(p?.value) ??
            toNumber(p?.v) ??
            null;

        if (t !== null && v !== null) out.push({ t, v });
    }
    return out.sort((a, b) => a.t - b.t);
}

function aggregate15mFrom5mPoints(points5: Point[], mode: "avg" | "last"): Point[] {
    if (!points5?.length) return [];
    const out: Point[] = [];
    for (let i = 0; i < points5.length; i += 3) {
        const chunk = points5.slice(i, i + 3);
        if (chunk.length < 3) continue;

        const t = chunk[0].t;
        const v = mode === "avg" ? (chunk[0].v + chunk[1].v + chunk[2].v) / 3 : chunk[2].v;
        out.push({ t, v });
    }
    return out;
}

function agg15mFrom5m(last3: Candle[]) {
    if (last3.length < 3) return null;
    const open = last3[0].open;
    const close = last3[2].close;
    const high = Math.max(...last3.map((x) => x.high));
    const low = Math.min(...last3.map((x) => x.low));
    const t = last3[0].t;
    const volume = last3.reduce((s, x) => s + (x.volume ?? 0), 0);
    return { t, open, high, low, close, volume };
}

function normalizeSnapshotCandles(items: any[] | undefined): Candle[] {
    if (!Array.isArray(items)) return [];
    return items
        .map((x) => {
            const t = toNumber(x?.t ?? x?.time ?? x?.ts);
            const open = toNumber(x?.open ?? x?.o);
            const high = toNumber(x?.high ?? x?.h);
            const low = toNumber(x?.low ?? x?.l);
            const close = toNumber(x?.close ?? x?.c);
            const volume = toNumber(x?.volume ?? x?.v);
            if (t === null || open === null || high === null || low === null || close === null) return null;
            return { t, open, high, low, close, volume: volume ?? undefined };
        })
        .filter(Boolean) as Candle[];
}

function fallbackDecision() {
    return {
        market_mode: "UNKNOWN",
        confidence: null,
        levels: {},
        parameters_for_grid_or_trend: {},
        risk_warning: ["runtime data is unavailable or invalid"],
        regime: "UNKNOWN",
        symbol: "BTC-USDT",
    };
}

function analyzeSweepUp(candles5m: Candle[], zoneLow: number, zoneHigh: number) {
    const lookback = candles5m.slice(-12); // ~60m
    const hit = lookback.find((c) => c.high > zoneHigh && c.close < zoneHigh);
    if (!hit) return { state: "WAIT_SWEEP_UP" as const, event: null as any };

    const strong = hit.close < zoneLow;
    return {
        state: strong ? ("SWEEP_UP_CONFIRMED_STRONG" as const) : ("SWEEP_UP_CONFIRMED" as const),
        event: { t: hit.t, high: hit.high, close: hit.close },
    };
}

function analyzeRejection15m(c15: Candle | null, zoneLow: number, zoneHigh: number) {
    if (!c15) return { state: "NO_15M_DATA" as const, score: 0, why: "ข้อมูล 5m ไม่พอรวมเป็น 15m" };

    const body = Math.abs(c15.close - c15.open);
    const upperWick = c15.high - Math.max(c15.open, c15.close);
    const range = Math.max(1e-9, c15.high - c15.low);

    const swept = c15.high > zoneHigh;
    const closedBackIn = c15.close < zoneHigh;
    const closedBelowLow = c15.close <= zoneLow;
    const bearishClose = c15.close < c15.open;
    const wickDominant = upperWick / range >= 0.45 && upperWick >= body * 1.2;

    let score = 0;
    if (swept) score += 1;
    if (closedBackIn) score += 1;
    if (closedBelowLow) score += 1;
    if (bearishClose) score += 1;
    if (wickDominant) score += 1;

    const ok = swept && closedBackIn && wickDominant;

    return {
        state: ok ? ("REJECTION_15M_CONFIRMED" as const) : ("REJECTION_15M_PENDING" as const),
        score,
        why: `swept=${swept}, closedBackIn=${closedBackIn}, closedBelowLow=${closedBelowLow}, bearishClose=${bearishClose}, wickDominant=${wickDominant}`,
    };
}

function analyze1HConfirm(c1h: Candle | null, zoneLow: number, zoneHigh: number) {
    if (!c1h) return { state: "NO_1H_DATA" as const, why: "ไม่มี agg_1h.series" };

    if (c1h.close > zoneHigh) return { state: "BREAKOUT_1H_CONFIRMED" as const, why: "1H close ยืนเหนือโซนบน" };
    if (c1h.close < zoneLow) return { state: "FAKEOUT_1H_CONFIRMED" as const, why: "1H close กลับเข้าในกรอบชัดเจน" };

    return { state: "1H_UNDECIDED" as const, why: "1H close อยู่ในพื้นที่รอยต่อ" };
}

/** ---------- Hybrid mode lock (Decision → Mode) ---------- */

function normalizeModeLock(decision: any): "NO_TRADE" | "GRID" | "TREND" {
    const raw = String(decision?.market_mode ?? decision?.mode ?? "").toUpperCase();
    if (raw.includes("NO_TRADE")) return "NO_TRADE";
    if (raw.includes("GRID")) return "GRID";
    if (raw.includes("TREND") || raw.includes("LONG") || raw.includes("SHORT")) return "TREND";
    return "GRID";
}

function initialPlanStateForMode(mode: "NO_TRADE" | "GRID" | "TREND") {
    if (mode === "NO_TRADE") return "NO_TRADE_LOCKED";
    if (mode === "TREND") return "TREND_MODE_LOCKED";
    return "WAIT_SWEEP_UP";
}

function explainForPlanState(planState: string, zLow: number, zHigh: number) {
    if (planState === "WAIT_SWEEP_UP") return `รอให้ราคาไปกวาดบนแถว ${zLow}-${zHigh} ก่อน`;
    if (planState === "WAIT_15M_REJECTION") return `เกิด sweep บนแล้ว → รอ 15m ยืนยัน rejection (ปิดกลับใต้โซนบน)`;
    if (planState === "WAIT_1H_CONFIRM_FAKEOUT") return `15m rejection ผ่านแล้ว → รอ 1H ยืนยันว่าไม่ใช่ breakout จริง`;
    if (planState === "FAKEOUT_CONFIRMED_RANGE_PLAY") return `1H ยืนยันกลับเข้า range → โหมดเล่นในกรอบมีน้ำหนัก`;
    if (planState === "BREAKOUT_CONFIRMED_SWITCH_MODE") return `1H ยืนเหนือโซนบน → เสี่ยง breakout จริง ต้องปรับโหมด`;
    if (planState === "NO_TRADE_LOCKED") return `🔒 ล็อก NO_TRADE ตามบทวิเคราะห์ → งดเทรด`;
    if (planState === "TREND_MODE_LOCKED") return `🔒 ล็อก TREND ตามบทวิเคราะห์ → พักแผนกริด`;
    return `สถานะแผน: ${planState}`;
}

/** ---------- Derivatives parse (robust + standardized flags) ---------- */

type DerivBundle = {
    funding5: Point[];
    funding15: Point[];
    oi5: Point[];
    oi15: Point[];
    updatedAt: number | null; // raw (sec/ms) from file
};

function readDerivHistoryShape(obj: any, sym: string): DerivBundle | null {
    const s = obj?.symbols?.[sym] ?? null;
    if (!s) return null;

    const funding5 = normalizeFundingSeries(
        s?.funding?.series_5m_6h ??
        s?.funding?.series5m ??
        s?.funding?.["5m"]?.series ??
        s?.funding?.m5?.series ??
        []
    );

    const funding15_raw = normalizeFundingSeries(
        s?.funding?.series_15m_24h ??
        s?.funding?.series_15m ??
        s?.funding?.["15m"]?.series ??
        s?.funding?.m15?.series ??
        []
    );
    const funding15 = funding15_raw.length > 0 ? funding15_raw : aggregate15mFrom5mPoints(funding5, "avg");

    const oi5 = normalizeOISeries(
        s?.openInterest?.series_5m_6h ??
        s?.openInterest?.series5m ??
        s?.openInterest?.["5m"]?.series ??
        s?.openInterest?.m5?.series ??
        s?.open_interest?.series_5m_6h ??
        s?.open_interest?.series5m ??
        s?.open_interest?.["5m"]?.series ??
        s?.open_interest?.m5?.series ??
        s?.oi?.series_5m_6h ??
        s?.oi?.series5m ??
        s?.oi?.["5m"]?.series ??
        s?.oi?.m5?.series ??
        []
    );

    const oi15_raw = normalizeOISeries(
        s?.openInterest?.series_15m_24h ??
        s?.openInterest?.series_15m ??
        s?.openInterest?.["15m"]?.series ??
        s?.openInterest?.m15?.series ??
        s?.open_interest?.series_15m_24h ??
        s?.open_interest?.series_15m ??
        s?.open_interest?.["15m"]?.series ??
        s?.open_interest?.m15?.series ??
        s?.oi?.series_15m_24h ??
        s?.oi?.series_15m ??
        s?.oi?.["15m"]?.series ??
        s?.oi?.m15?.series ??
        []
    );
    const oi15 = oi15_raw.length > 0 ? oi15_raw : aggregate15mFrom5mPoints(oi5, "last");

    const updatedAt = toNumber(obj?.updated_at) ?? null;
    return { funding5, funding15, oi5, oi15, updatedAt };
}

function mergeOiFallback(base: DerivBundle, oi5: Point[], oi15: Point[], updatedAt: number | null): DerivBundle {
    return {
        ...base,
        oi5,
        oi15,
        updatedAt: base.updatedAt ?? updatedAt,
    };
}

function buildSeriesMeta(args: {
    series5: Point[];
    series15: Point[];
    updatedAtMs: number | null;
    source: SeriesSource;
    minPointsForOK?: number; // default 3
}): {
    status: SeriesStatus;
    has_data: boolean;
    reason: string | null;
    now: number | null;
    trend_5m: TrendOut;
    trend_15m: TrendOut;
    integrity: { s5: SeriesIntegrity; s15: SeriesIntegrity };
    source: SeriesSource;
} {
    const minPts = args.minPointsForOK ?? 3;
    const s5Int = seriesIntegrity(args.series5);
    const s15Int = seriesIntegrity(args.series15);

    const total = s5Int.count + s15Int.count;
    const hasData = total > 0;

    const tr5 = trend(args.series5, 12);
    const tr15 = trend(args.series15, 8);

    const now = args.series5.length ? last(args.series5)!.v : args.series15.length ? last(args.series15)!.v : null;

    // reason ladder (standard)
    let reason: string | null = null;
    let status: SeriesStatus = "OK";

    if (!hasData) {
        status = "NO_DATA";
        reason = "series_empty";
    } else if (!s5Int.monotonic || !s15Int.monotonic) {
        status = "ERROR";
        reason = "timestamp_not_monotonic";
    } else {
        // insufficient points = trend ยังไม่น่าเชื่อ
        const enoughPoints = total >= minPts;
        if (!enoughPoints) {
            status = "INSUFFICIENT_POINTS";
            reason = `insufficient_points:<${minPts}`;
        }

        // freshness gate
        const f = args.source.freshness.tag;
        if (f === "OLD" || f === "STALE") {
            if (status === "OK") {
                status = "STALE";
                reason = `stale:${f}`;
            }
        }
    }

    return {
        status,
        has_data: hasData,
        reason,
        now,
        trend_5m: tr5,
        trend_15m: tr15,
        integrity: { s5: s5Int, s15: s15Int },
        source: args.source,
    };
}

function inferCrowdAndTrap(params: {
    sweepUpSeen: boolean;
    rejectionConfirmed: boolean;
    close5m: number | null;
    zoneHigh: number;
    oiNow: number | null;
    oiAtSweep: number | null;
    oiTrend5: { dir: string; pct: number };
    oiTrend15: { dir: string; pct: number };
    fundNow: number | null;
    fundTrend5: { dir: string; pct: number };
    fundTrend15: { dir: string; pct: number };
}) {
    const {
        sweepUpSeen,
        rejectionConfirmed,
        close5m,
        zoneHigh,
        oiNow,
        oiAtSweep,
        oiTrend5,
        oiTrend15,
        fundNow,
        fundTrend5,
    } = params;

    type CrowdSide = "LONGS" | "SHORTS" | "MIXED" | "UNKNOWN";

    let crowd: CrowdSide = "UNKNOWN";

    if (fundNow !== null) {
        if (fundNow > 0) crowd = "LONGS";
        else if (fundNow < 0) crowd = "SHORTS";
        else crowd = "MIXED";
    } else crowd = "UNKNOWN";

    let trapped: "LONGS_TRAPPED" | "SHORTS_TRAPPED" | "NONE" | "UNKNOWN" = "UNKNOWN";

    const oiAdded = oiTrend5.dir === "UP" || oiTrend15.dir === "UP";
    const fundSupportsLong = fundNow !== null && fundNow > 0;
    const fundSupportsShort = fundNow !== null && fundNow < 0;

    const priceFailed = close5m !== null && close5m < zoneHigh;
    const oiUnwindFromSweep =
        oiNow !== null && oiAtSweep !== null
            ? ((oiNow - oiAtSweep) / (Math.abs(oiAtSweep) < 1e-9 ? 1 : oiAtSweep)) * 100
            : null;

    if (sweepUpSeen && rejectionConfirmed && priceFailed) {
        if (fundSupportsLong && oiAdded) trapped = "LONGS_TRAPPED";
        else if (fundSupportsShort && oiAdded) trapped = "SHORTS_TRAPPED";
        else trapped = "NONE";
    } else {
        trapped = "NONE";
    }

    const crowdTH =
        crowd === "LONGS" ? "ฝั่ง Long หนา"
            : crowd === "SHORTS" ? "ฝั่ง Short หนา"
                : "ยังบอกฝั่งหนาไม่ได้";



    let trappedTH = "ยังไม่เห็นสัญญาณคนติดชัด";
    if (trapped === "LONGS_TRAPPED") trappedTH = "มีโอกาส “Long ติดบน” (เติม OI + funding บวก แล้วโดนตบกลับในโซนบน)";
    if (trapped === "SHORTS_TRAPPED") trappedTH = "มีโอกาส “Short ติด” (โครงสร้างบีบสวนฝั่งที่เติม)";

    const noteBits: string[] = [];
    if (fundNow !== null) noteBits.push(`Funding(now)=${fundNow.toFixed(6)}`);
    noteBits.push(`OI 5m=${oiTrend5.dir} (${oiTrend5.pct.toFixed(2)}%)`);
    noteBits.push(`Funding 5m=${fundTrend5.dir} (${fundTrend5.pct.toFixed(2)}%)`);
    if (oiUnwindFromSweep !== null) noteBits.push(`OI vs sweep=${oiUnwindFromSweep.toFixed(2)}%`);

    return { crowd, trapped, crowdTH, trappedTH, note: noteBits.join(" | ") };

}

type OBTrade = {
    active: boolean;

    trade_id: string | null;
    symbol: string | null;

    bias: "LONG" | "SHORT" | null;

    opened_t: number | null; // ms
    closed_t: number | null; // ms

    entry_price: number | null; // Mode A: ใช้ close ตอน READY
    entry_zone: { low: number; high: number } | null;

    sl: number | null;
    tp1: number | null;

    // outcome
    result: "WIN" | "LOSS" | null;
    exit_price: number | null;
    r_multiple: number | null;

    // debug
    open_reason?: string | null;
    close_reason?: string | null;
};

type TrendTrade = {
    active: boolean;

    trade_id: string | null;
    symbol: string | null;

    side: "LONG" | "SHORT" | null;

    opened_t: number | null;
    closed_t: number | null;

    entry_price: number | null;
    sl: number | null;
    tp1: number | null;

    result: "WIN" | "LOSS" | null;
    exit_price: number | null;
    r_multiple: number | null;

    open_reason?: string | null;
    close_reason?: string | null;
};

function makeTradeId(prefix = "OB") {
    const rnd = Math.random().toString(16).slice(2, 8).toUpperCase();
    return `${prefix}_${Date.now()}_${rnd}`;
}

function midZone(z: { low: number; high: number } | null) {
    if (!z) return null;
    return (z.low + z.high) / 2;
}

function rMultiple(params: { bias: "LONG" | "SHORT"; entry: number | null; sl: number | null; exit: number | null }) {
    const { bias, entry, sl, exit } = params;
    if (entry == null || sl == null || exit == null) return null;

    // R = ระยะเสี่ยง
    const R = bias === "LONG" ? entry - sl : sl - entry;
    if (!(R > 0)) return null;

    const P = bias === "LONG" ? exit - entry : entry - exit;
    return Number((P / R).toFixed(3));
}

function resolveTpSlHit(params: {
    bias: "LONG" | "SHORT";
    candle: Candle;
    tp1: number | null;
    sl: number | null;
    prefer: "SL_FIRST" | "TP_FIRST";
}) {
    const { bias, candle, tp1, sl, prefer } = params;

    const tpHit = tp1 != null ? (bias === "LONG" ? candle.high >= tp1 : candle.low <= tp1) : false;

    const slHit = sl != null ? (bias === "LONG" ? candle.low <= sl : candle.high >= sl) : false;

    if (!tpHit && !slHit) return { hit: null as null, exit: null as number | null };

    // ถ้าชนทั้งคู่ในแท่งเดียวกัน → เลือกตาม policy
    if (tpHit && slHit) {
        if (prefer === "SL_FIRST") return { hit: "SL" as const, exit: sl! };
        return { hit: "TP1" as const, exit: tp1! };
    }

    if (slHit) return { hit: "SL" as const, exit: sl! };
    return { hit: "TP1" as const, exit: tp1! };
}

/** =======================
 *  OB Gate (1H -> 5m) Helpers
 * ======================= */

type Side = "BULL" | "BEAR";
type Bias = "LONG" | "SHORT" | "RANGE" | "UNKNOWN";

type OrderBlock = {
    tf: "1h" | "5m";
    side: Side;
    zone: { low: number; high: number };
    origin: { t: number; index: number };
    strength: {
        displacement_pct: number;
        bos: boolean;
        retest_count: number;
    };
    note: string;
};

type OBGate = {
    bias_1h: Bias;

    h1_ob: OrderBlock | null;
    m5_ob_confirm: OrderBlock | null;

    touch: { ok: boolean; why: string };
    sweep: { seen: boolean; side: "UP" | "DOWN" | null; t: number | null; price: number | null; idx: number | null };
    reclaim: { ok: boolean; rule: string; t: number | null; idx: number | null };
    choch: { ok: boolean; dir: "UP" | "DOWN" | null; t: number | null; idx: number | null };

    entry: {
        status: "WAIT" | "READY" | "INVALID";
        entry_zone: { low: number; high: number } | null;
        sl: number | null;
        tp1: number | null;
        why: string;
    };
};

function bodyHigh(c: Candle) {
    return Math.max(c.open, c.close);
}
function bodyLow(c: Candle) {
    return Math.min(c.open, c.close);
}
function isBull(c: Candle) {
    return c.close >= c.open;
}
function isBear(c: Candle) {
    return c.close < c.open;
}
function pctMove(from: number, to: number) {
    const base = Math.abs(from) < 1e-9 ? 1 : from;
    return ((to - from) / base) * 100;
}
function inZone(price: number, z: { low: number; high: number }) {
    return price >= z.low && price <= z.high;
}
function clampZone(z: { low: number; high: number }) {
    const low = Math.min(z.low, z.high);
    const high = Math.max(z.low, z.high);
    return { low, high };
}
function midOf(z: { low: number; high: number }) {
    return (z.low + z.high) / 2;
}

function countRetests(candles: Candle[], zone: { low: number; high: number }, lookback = 60) {
    const tail = candles.slice(-lookback);
    let n = 0;
    for (const c of tail) {
        const touched = c.low <= zone.high && c.high >= zone.low;
        if (touched) n++;
    }
    return n;
}

/**
 * Find latest 1H OB:
 * - Bull OB: last bearish candle before bullish displacement that breaks recent highs (BOS heuristic)
 * - Bear OB: last bullish candle before bearish displacement that breaks recent lows (BOS heuristic)
 */
function findOrderBlock1H(agg1h: Candle[], side: Side): OrderBlock | null {
    if (!agg1h?.length || agg1h.length < 20) return null;

    const DISP_PCT = 0.35; // heuristic
    const LOOK_FWD = 4;
    const BOS_LOOKBACK = 12;

    for (let i = agg1h.length - 6; i >= 12; i--) {
        const base = agg1h[i];

        const okBase = side === "BULL" ? isBear(base) : isBull(base);
        if (!okBase) continue;

        const pre = agg1h.slice(Math.max(0, i - BOS_LOOKBACK), i);
        const preHigh = Math.max(...pre.map((c) => c.high));
        const preLow = Math.min(...pre.map((c) => c.low));

        // check forward displacement
        let bestClose = base.close;
        let bestIdx = -1;
        for (let j = i + 1; j <= Math.min(agg1h.length - 1, i + LOOK_FWD); j++) {
            if (side === "BULL") {
                if (agg1h[j].close > bestClose) {
                    bestClose = agg1h[j].close;
                    bestIdx = j;
                }
            } else {
                if (agg1h[j].close < bestClose) {
                    bestClose = agg1h[j].close;
                    bestIdx = j;
                }
            }
        }
        if (bestIdx < 0) continue;

        const disp = Math.abs(pctMove(base.close, bestClose));
        if (disp < DISP_PCT) continue;

        const bos = side === "BULL" ? bestClose > preHigh : bestClose < preLow;

        // wick-based zone + body edge (tighter than full candle)
        const zone =
            side === "BULL"
                ? clampZone({ low: base.low, high: bodyHigh(base) })
                : clampZone({ low: bodyLow(base), high: base.high });

        return {
            tf: "1h",
            side,
            zone,
            origin: { t: base.t, index: i },
            strength: {
                displacement_pct: Number(disp.toFixed(3)),
                bos,
                retest_count: countRetests(agg1h, zone, 80),
            },
            note:
                side === "BULL"
                    ? "1H Bullish OB (last red candle before bullish displacement)"
                    : "1H Bearish OB (last green candle before bearish displacement)",
        };
    }
    return null;
}

/** Touch OB on 5m (price overlaps zone) */
function touchedZone5m(raw5m: Candle[], zone: { low: number; high: number }, lookback = 120) {
    const tail = raw5m.slice(-lookback);
    for (let k = tail.length - 1; k >= 0; k--) {
        const c = tail[k];
        const overlap = c.low <= zone.high && c.high >= zone.low;
        if (overlap) return { ok: true, idx: raw5m.length - lookback + k, t: c.t };
    }
    return { ok: false, idx: null as any, t: null as any };
}

/**
 * Sweep relative to OB
 * - Bull setup: sweep DOWN through zone.low then close back >= zone.low (or inside)
 * - Bear setup: sweep UP through zone.high then close back <= zone.high (or inside)
 */
function findSweepAtOB(raw5m: Candle[], zone: { low: number; high: number }, side: Side, lookback = 60) {
    const tail = raw5m.slice(-lookback);
    for (let k = tail.length - 1; k >= 0; k--) {
        const c = tail[k];
        if (side === "BULL") {
            const swept = c.low < zone.low;
            const closedBack = c.close >= zone.low;
            if (swept && closedBack) {
                const idx = raw5m.length - lookback + k;
                return { seen: true, idx, t: c.t, price: c.low, side: "DOWN" as const };
            }
        } else {
            const swept = c.high > zone.high;
            const closedBack = c.close <= zone.high;
            if (swept && closedBack) {
                const idx = raw5m.length - lookback + k;
                return { seen: true, idx, t: c.t, price: c.high, side: "UP" as const };
            }
        }
    }
    return { seen: false, idx: null as any, t: null as any, price: null as any, side: null as any };
}

/** Reclaim rule (default): close back in zone AND close beyond mid */
function checkReclaim(c: Candle, zone: { low: number; high: number }, side: Side) {
    const mid = midOf(zone);
    const inZ = inZone(c.close, zone);
    if (side === "BULL") return inZ && c.close > mid;
    return inZ && c.close < mid;
}

/**
 * CHOCH heuristic (simple & production-safe):
 * - After sweep idx:
 *   - define "structure" = max high (bull) / min low (bear) of N candles before sweep
 *   - CHOCH occurs when close breaks above/below that structure
 */
function findChoch(raw5m: Candle[], sweepIdx: number, side: Side, preN = 10, postN = 36) {
    if (sweepIdx == null || sweepIdx < 5)
        return { ok: false, idx: null as any, t: null as any, dir: null as any, level: null as any };

    const pre = raw5m.slice(Math.max(0, sweepIdx - preN), sweepIdx);
    if (!pre.length)
        return { ok: false, idx: null as any, t: null as any, dir: null as any, level: null as any };

    const level = side === "BULL" ? Math.max(...pre.map((c) => c.high)) : Math.min(...pre.map((c) => c.low));

    const post = raw5m.slice(sweepIdx + 1, Math.min(raw5m.length, sweepIdx + 1 + postN));
    for (let i = 0; i < post.length; i++) {
        const c = post[i];
        const broke = side === "BULL" ? c.close > level : c.close < level;

        if (broke) {
            const idx = sweepIdx + 1 + i;
            return {
                ok: true,
                idx,
                t: c.t,
                dir: side === "BULL" ? ("UP" as const) : ("DOWN" as const),
                level,
            };
        }
    }

    return { ok: false, idx: null as any, t: null as any, dir: null as any, level };
}

/**
 * Build 5m OB after CHOCH:
 * - Bull: last bearish candle before the choch impulse candle
 * - Bear: last bullish candle before the choch impulse candle
 */
function buildM5ObAfterChoch(raw5m: Candle[], chochIdx: number, side: Side): OrderBlock | null {
    if (chochIdx == null || chochIdx < 3) return null;

    const impulse = raw5m[chochIdx];
    // search back a few candles for the "last opposite candle"
    const back = raw5m.slice(Math.max(0, chochIdx - 8), chochIdx);
    for (let i = back.length - 1; i >= 0; i--) {
        const c = back[i];
        if (side === "BULL" ? isBear(c) : isBull(c)) {
            const idx = Math.max(0, chochIdx - 8) + i;

            const zone =
                side === "BULL"
                    ? clampZone({ low: c.low, high: bodyHigh(c) })
                    : clampZone({ low: bodyLow(c), high: c.high });

            const disp = Math.abs(pctMove(c.close, impulse.close));
            return {
                tf: "5m",
                side,
                zone,
                origin: { t: c.t, index: idx },
                strength: {
                    displacement_pct: Number(disp.toFixed(3)),
                    bos: true,
                    retest_count: countRetests(raw5m, zone, 120),
                },
                note: side === "BULL" ? "5m Bullish OB (post-CHOCH confirm block)" : "5m Bearish OB (post-CHOCH confirm block)",
            };
        }
    }
    return null;
}

/** Map decision -> bias */
function biasFromDecision(decision: any): Bias {
    const d = String(decision?.levels?.trend?.dir ?? "").toUpperCase();
    const mm = String(decision?.market_mode ?? "").toUpperCase();
    if (d === "UP" || mm.includes("TREND_UP") || mm.includes("LONG")) return "LONG";
    if (d === "DOWN" || mm.includes("TREND_DOWN") || mm.includes("SHORT")) return "SHORT";
    if (mm.includes("GRID") || mm.includes("RANGE")) return "RANGE";
    return "UNKNOWN";
}

/** Main builder */
function buildObGate(params: {
    decision: any;
    raw5m: Candle[];
    agg1h: Candle[];
    last5m: Candle | null;
    last1h: Candle | null;
}): OBGate {
    const { decision, raw5m, agg1h, last5m } = params;

    const bias_1h = biasFromDecision(decision);
    const side: Side = bias_1h === "LONG" ? "BULL" : bias_1h === "SHORT" ? "BEAR" : "BULL";

    const h1_ob = findOrderBlock1H(agg1h, side);
    if (!h1_ob || !last5m) {
        return {
            bias_1h,
            h1_ob: h1_ob ?? null,
            m5_ob_confirm: null,
            touch: { ok: false, why: !h1_ob ? "no_1h_ob_found" : "no_last5m" },
            sweep: { seen: false, side: null, t: null, price: null, idx: null },
            reclaim: { ok: false, rule: "close back in zone & beyond mid", t: null, idx: null },
            choch: { ok: false, dir: null, t: null, idx: null },
            entry: { status: "WAIT", entry_zone: null, sl: null, tp1: null, why: "waiting_for_h1_ob_or_price" },
        };
    }

    const touch = touchedZone5m(raw5m, h1_ob.zone, 160);
    const sweep = findSweepAtOB(raw5m, h1_ob.zone, side, 80);

    // reclaim: search after sweep (or last candles if sweep not found)
    let reclaimOk = false;
    let reclaimIdx: number | null = null;
    let reclaimT: number | null = null;

    const reclaimRule = "close back in zone AND beyond mid";
    if (sweep.seen && sweep.idx != null) {
        const after = raw5m.slice(sweep.idx, Math.min(raw5m.length, sweep.idx + 24));
        for (let i = 0; i < after.length; i++) {
            if (checkReclaim(after[i], h1_ob.zone, side)) {
                reclaimOk = true;
                reclaimIdx = sweep.idx + i;
                reclaimT = after[i].t;
                break;
            }
        }
    } else {
        // if no sweep yet: allow reclaim only if already in zone strongly (mid rule)
        reclaimOk = checkReclaim(last5m, h1_ob.zone, side);
        reclaimIdx = reclaimOk ? raw5m.length - 1 : null;
        reclaimT = reclaimOk ? last5m.t : null;
    }

    // choch requires sweep
    const choch =
        sweep.seen && sweep.idx != null
            ? findChoch(raw5m, sweep.idx, side, 10, 48)
            : { ok: false, idx: null as any, t: null as any, dir: null as any, level: null as any };

    const m5_ob_confirm = choch.ok && choch.idx != null ? buildM5ObAfterChoch(raw5m, choch.idx, side) : null;

    // SL / TP1
    const z = m5_ob_confirm?.zone ?? null;
    const sweepExtreme = sweep.price ?? null;

    const zoneSpan = z ? Math.max(1, z.high - z.low) : 1;
    const slBuffer = Math.max(5, zoneSpan * 0.25);

    let sl: number | null = null;
    if (bias_1h === "LONG") {
        sl = sweepExtreme != null ? sweepExtreme - slBuffer : z ? z.low - slBuffer : null;
    } else if (bias_1h === "SHORT") {
        sl = sweepExtreme != null ? sweepExtreme + slBuffer : z ? z.high + slBuffer : null;
    }

    const tp1 =
        (typeof decision?.levels?.trend?.targets?.t1 === "number" ? decision.levels.trend.targets.t1 : null) ??
        (typeof decision?.levels?.smc?.swing_high_1h === "number" ? decision.levels.smc.swing_high_1h : null) ??
        (typeof decision?.levels?.smc?.swing_low_1h === "number" ? decision.levels.smc.swing_low_1h : null) ??
        null;

    // READY conditions
    const ready = touch.ok && sweep.seen && reclaimOk && choch.ok && !!m5_ob_confirm?.zone;

    const invalid =
        bias_1h === "LONG"
            ? decision?.levels?.trend?.invalidation != null && last5m.close < decision.levels.trend.invalidation
            : bias_1h === "SHORT"
                ? decision?.levels?.trend?.invalidation != null && last5m.close > decision.levels.trend.invalidation
                : false;

    const entryStatus: OBGate["entry"]["status"] = invalid ? "INVALID" : ready ? "READY" : "WAIT";

    const why = invalid
        ? "invalidated_by_trend_invalidation"
        : ready
            ? "touch+sweep+reclaim+choch+5m_ob_ready"
            : [
                !touch.ok ? "wait_touch_1h_ob" : null,
                !sweep.seen ? "wait_sweep_at_ob" : null,
                !reclaimOk ? "wait_reclaim_midrule" : null,
                !choch.ok ? "wait_choch" : null,
                !m5_ob_confirm ? "wait_5m_ob" : null,
            ]
                .filter(Boolean)
                .join(" | ");

    return {
        bias_1h,
        h1_ob,
        m5_ob_confirm,

        touch: { ok: touch.ok, why: touch.ok ? "price_overlaps_1h_ob" : "not_touched_recently" },
        sweep: { seen: sweep.seen, side: sweep.side ?? null, t: sweep.t ?? null, price: sweep.price ?? null, idx: sweep.idx ?? null },
        reclaim: { ok: reclaimOk, rule: reclaimRule, t: reclaimT, idx: reclaimIdx },
        choch: { ok: choch.ok, dir: choch.dir ?? null, t: choch.t ?? null, idx: choch.idx ?? null },

        entry: {
            status: entryStatus,
            entry_zone: z ? { low: z.low, high: z.high } : null,
            sl,
            tp1,
            why,
        },
    };
}

/** ===================================================================== */

export async function GET() {
    try {
    const runtime = await resolveRuntimeDir();
    const dataDir = runtime.dir;

    // ✅ เลือกที่เก็บ log หลัก (root dataDir)
    const LOG_DIR = dataDir;

    // ✅ ใช้ public ที่ root ของ Next project
    const PUBLIC_DATA_DIR = runtime.mirrorDir;
    const MIRROR_PLAN_STATUS_TO_PUBLIC = true;
    const MIRROR_LOGS_TO_PUBLIC = true; // ✅ mirror .jsonl ไป public ด้วย
    const MIRROR_PLAN_HISTORY_TO_PUBLIC = true;

    await ensureDir(LOG_DIR);
    await ensureDir(PUBLIC_DATA_DIR);

    const PATHS = {
        state: path.join(LOG_DIR, "plan_status_state.json"),
        log: path.join(LOG_DIR, "plan_status_log.jsonl"),
        history: path.join(LOG_DIR, "plan_history.jsonl"),
        status: path.join(LOG_DIR, "plan_status.json"),

        statusPublic: path.join(PUBLIC_DATA_DIR, "plan_status.json"),

        // ✅ ใช้ชื่อมาตรฐาน: logPublic / historyPublic (อย่าใช้ planLogPublic ให้คนงง)
        logPublic: path.join(PUBLIC_DATA_DIR, "plan_status_log.jsonl"),
        historyPublic: path.join(PUBLIC_DATA_DIR, "plan_history.jsonl"),
    };

    async function mirrorFileIfMissingOrEmpty(src?: string, dst?: string) {
        // ✅ guard กัน undefined (กันพังแบบที่คุณเจอ)
        if (!src || !dst) return;

        const srcSz = await fileSize(src);
        if (!srcSz || srcSz <= 0) return;

        const dstSz = await fileSize(dst);
        if (dstSz && dstSz > 0) return;

        await ensureDir(path.dirname(dst));
        try {
            await fs.copyFile(src, dst);
        } catch {
            // ignore lock/race
        }
    }

    async function touchFile(p: string) {
        try {
            await ensureDir(path.dirname(p));
            if (!(await fileExists(p))) await fs.writeFile(p, "", "utf8");
        } catch {
            // ignore
        }
    }

    await touchFile(PATHS.log);
    await touchFile(PATHS.history);
    await touchFile(PATHS.logPublic);
    await touchFile(PATHS.historyPublic);

    // ✅ bootstrap: ถ้า public ว่าง แต่ root มีข้อมูล → copy 1 ครั้ง
    if (MIRROR_LOGS_TO_PUBLIC) {
        await mirrorFileIfMissingOrEmpty(PATHS.log, PATHS.logPublic);
        await mirrorFileIfMissingOrEmpty(PATHS.history, PATHS.historyPublic);
    }

    const volPath = path.join(dataDir, "volatility_baseline_cache.json");
    const klinesPath = path.join(dataDir, "klines.json");

    const derivHistPath = path.join(dataDir, "derivatives_history_cache.json");
    const oiHistPath = path.join(dataDir, "oi_history_cache.json"); // fallback

    const marketSnapshotRead = await readRuntimeJson<any>("market_snapshot.json", dataDir, PUBLIC_DATA_DIR);
    const decisionRead = await readRuntimeJson<any>("latest_decision.json", dataDir, PUBLIC_DATA_DIR);
    const sourceInfo = buildSourceInfo(dataDir, PUBLIC_DATA_DIR, [marketSnapshotRead, decisionRead]);

    const decision = decisionRead.ok ? decisionRead.value : fallbackDecision();
    const modeLock = normalizeModeLock(decision);

    // ✅ declare once
    const sym = "BTC-USDT";

    // --- candles source (READ ONCE — ห้ามประกาศซ้ำ) ---
    const storeRead = marketSnapshotRead.ok
        ? { ok: true as const, value: marketSnapshotRead.value }
        : (await fileExists(volPath)) ? await readJsonSafe<any>(volPath) : await readJsonSafe<any>(klinesPath);
    const store = storeRead.ok ? storeRead.value : null;

    const snapshot5m = normalizeSnapshotCandles(store?.market_data?.klines?.["5M"]?.candles);
    const snapshot15m = normalizeSnapshotCandles(store?.market_data?.klines?.["15M"]?.candles);
    const snapshot1h = normalizeSnapshotCandles(store?.market_data?.klines?.["1H"]?.candles);
    const raw5m: Candle[] = snapshot5m.length ? snapshot5m : store?.symbols?.[sym]?.raw_5m?.series ?? [];
    const agg1h: Candle[] = snapshot1h.length ? snapshot1h : store?.symbols?.[sym]?.agg_1h?.series ?? [];
    const indicatorEvidence = computeIndicatorEvidence(snapshot15m, { timeframe: "15m" });
    const multiTimeframeIndicatorEvidence = buildMultiTimeframeIndicatorEvidence(store ?? {});

    const sourceUpdatedAt =
        toMs(toNumber(store?.meta?.generated_at) ?? null) ??
        toMs(toNumber(store?.symbols?.[sym]?.raw_5m?.last_sample_time) ?? null);

    const last5m = last(raw5m);
    const last1h = last(agg1h);

    // ---------------- Liquidity Magnet (from candles we already have) ----------------
    const planDir =
        decision?.levels?.trend?.dir === "UP"
            ? "UP"
            : decision?.levels?.trend?.dir === "DOWN"
                ? "DOWN"
                : String(decision?.market_mode ?? "").toUpperCase().includes("RANGE")
                    ? "RANGE"
                    : null;

    const magnet5m = computeLiquidityMagnetFromCandles("5m", raw5m, planDir, { lookBack: 300, bins: 50 });
    const magnet1h = computeLiquidityMagnetFromCandles("1h", agg1h, planDir, { lookBack: 300, bins: 50 });

    const magnetSummaryTH =
        magnet5m.alignment === "DIVERGENCE" || magnet1h.alignment === "DIVERGENCE"
            ? "⚠️ แม่เหล็กราคา ‘สวนแผน’ อย่างน้อย 1 TF → แนะนำ WAIT/ยืนยันก่อน"
            : magnet5m.alignment === "ALIGNED" || magnet1h.alignment === "ALIGNED"
                ? "✅ แม่เหล็กราคา ‘ไปทางเดียวกับแผน’ อย่างน้อย 1 TF"
                : "⏸️ แม่เหล็กยังไม่ชัด → รอคอนเฟิร์ม / อย่าพึ่งเดา";

    // --- load previous state ---
    let prevStateObj: any = null;
    let prevState: string | null = null;
    let prevModeLock: "NO_TRADE" | "GRID" | "TREND" | null = null;

    if (await fileExists(PATHS.state)) {
        const stRead = await readJsonSafe<any>(PATHS.state);
        if (stRead.ok) {
            prevStateObj = stRead.value ?? null;
            prevState = stRead.value?.plan_state ?? null;
            prevModeLock = stRead.value?.decision_mode_lock ?? null;
        }
    }
    const modeChanged = prevModeLock !== null && prevModeLock !== modeLock;

    // -------- GRID sweep pipeline base --------
    const gridUpper = decision?.parameters_for_grid_or_trend?.grid_upper ?? 88380;
    const gridLower = decision?.parameters_for_grid_or_trend?.grid_lower ?? 86800;

    const sweepZoneLow = Math.min(88350, gridUpper);
    const sweepZoneHigh = Math.max(88380, gridUpper);

    const sweep = analyzeSweepUp(raw5m, sweepZoneLow, sweepZoneHigh);
    const c15 = agg15mFrom5m(raw5m.slice(-3));
    const rej15 = analyzeRejection15m(c15, sweepZoneLow, sweepZoneHigh);
    const conf1h = analyze1HConfirm(last1h, sweepZoneLow, sweepZoneHigh);

    // --- state machine core (GRID) ---
    let planState = "WAIT_SWEEP_UP";
    if (sweep.state.startsWith("SWEEP_UP")) planState = "WAIT_15M_REJECTION";
    if (rej15.state === "REJECTION_15M_CONFIRMED") planState = "WAIT_1H_CONFIRM_FAKEOUT";
    if (conf1h.state === "FAKEOUT_1H_CONFIRMED") planState = "FAKEOUT_CONFIRMED_RANGE_PLAY";
    if (conf1h.state === "BREAKOUT_1H_CONFIRMED") planState = "BREAKOUT_CONFIRMED_SWITCH_MODE";

    // --- Hybrid override ---
    let forcedPlanState: string | null = null;
    if (modeLock === "NO_TRADE") forcedPlanState = "NO_TRADE_LOCKED";
    else if (modeChanged) forcedPlanState = initialPlanStateForMode(modeLock);

    if (forcedPlanState) planState = forcedPlanState;
    else if (modeLock === "TREND") planState = "TREND_MODE_LOCKED";

    let explainTH = explainForPlanState(planState, sweepZoneLow, sweepZoneHigh);

    // ---------------- Derivatives (robust) ----------------
    let derivBundle: DerivBundle = { funding5: [], funding15: [], oi5: [], oi15: [], updatedAt: null };
    let derivPrimaryFile: string | null = null;
    let derivPrimaryReason: string | null = null;
    let oiFallbackUsed = false;
    let oiFallbackReason: string | null = null;

    // 1) primary derivatives_history_cache.json
    const derivRead = await readJsonSafe<any>(derivHistPath);
    if (derivRead.ok) {
        const parsed = readDerivHistoryShape(derivRead.value, sym);
        if (parsed) {
            derivBundle = parsed;
            derivPrimaryFile = "derivatives_history_cache.json";
        } else {
            derivPrimaryFile = "derivatives_history_cache.json";
            derivPrimaryReason = "symbol_missing_or_shape_unknown";
        }
    } else {
        derivPrimaryFile = "derivatives_history_cache.json";
        derivPrimaryReason = derivRead.reason;
    }

    // 2) fallback OI (optional)
    const oiHasDataNow = !!(derivBundle.oi5.length || derivBundle.oi15.length);
    if (!oiHasDataNow) {
        const oiRead = await readJsonSafe<any>(oiHistPath);
        if (oiRead.ok) {
            const s = oiRead.value?.symbols?.[sym] ?? oiRead.value?.[sym] ?? oiRead.value ?? null;
            const oi5 = normalizeOISeries(
                s?.series_5m_6h ??
                s?.oi?.series_5m_6h ??
                s?.open_interest?.series_5m_6h ??
                s?.m5?.series ??
                s?.["5m"]?.series ??
                s?.series ??
                s?.samples ??
                []
            );

            const oi15_raw = normalizeOISeries(
                s?.series_15m_24h ??
                s?.series_15m ??
                s?.oi?.series_15m_24h ??
                s?.open_interest?.series_15m_24h ??
                s?.m15?.series ??
                s?.["15m"]?.series ??
                []
            );
            const oi15 = oi15_raw.length > 0 ? oi15_raw : aggregate15mFrom5mPoints(oi5, "last");

            derivBundle = mergeOiFallback(derivBundle, oi5, oi15, toNumber(oiRead.value?.updated_at) ?? null);
            oiFallbackUsed = true;
        } else {
            oiFallbackUsed = true;
            oiFallbackReason = oiRead.reason;
        }
    }

    const fileUpdatedMs = toMs(derivBundle.updatedAt);

    const ptsLastMs = [lastPointMs(derivBundle.funding5), lastPointMs(derivBundle.funding15), lastPointMs(derivBundle.oi5), lastPointMs(derivBundle.oi15)].filter(
        (x): x is number => typeof x === "number"
    );

    const seriesUpdatedMs = ptsLastMs.length ? Math.max(...ptsLastMs) : null;

    // ✅ ใช้ fileUpdatedMs ก่อน ถ้าไม่มีค่อยใช้ seriesUpdatedMs
    const derivUpdatedAtMs = fileUpdatedMs ?? seriesUpdatedMs;
    const derivFresh = freshnessFrom(derivUpdatedAtMs);

    const oiSource: SeriesSource = {
        file: oiFallbackUsed ? "oi_history_cache.json" : derivPrimaryFile,
        keypath: oiFallbackUsed ? "symbols[BTC-USDT].samples/*" : "symbols[BTC-USDT].openInterest/*",
        updated_at: derivUpdatedAtMs,
        freshness: cloneFresh(derivFresh), // ✅ clone
    };

    const fundingSource: SeriesSource = {
        file: derivPrimaryFile,
        keypath: "symbols[BTC-USDT].funding/*",
        updated_at: derivUpdatedAtMs,
        freshness: cloneFresh(derivFresh), // ✅ clone
    };

    const oiMeta = buildSeriesMeta({
        series5: derivBundle.oi5,
        series15: derivBundle.oi15,
        updatedAtMs: derivUpdatedAtMs,
        source: oiSource,
        minPointsForOK: 3,
    });

    const fundingMeta = buildSeriesMeta({
        series5: derivBundle.funding5,
        series15: derivBundle.funding15,
        updatedAtMs: derivUpdatedAtMs,
        source: fundingSource,
        minPointsForOK: 3,
    });

    const oiAtSweep = sweep?.event?.t ? nearestValueAt(derivBundle.oi5, sweep.event.t) ?? nearestValueAt(derivBundle.oi15, sweep.event.t) : null;

    // reason override แบบ “มาตรฐาน” เพิ่มเติม (ถ้าอ่านไฟล์พัง)
    const oiReasonExtra = !oiMeta.reason ? (oiFallbackUsed && oiFallbackReason ? `fallback_file:${oiFallbackReason}` : null) : null;
    const fundingReasonExtra = !fundingMeta.reason && derivPrimaryReason ? `primary_file:${derivPrimaryReason}` : null;

    const crowdTrap = inferCrowdAndTrap({
        sweepUpSeen: sweep.state.startsWith("SWEEP_UP"),
        rejectionConfirmed: rej15.state === "REJECTION_15M_CONFIRMED",
        close5m: last5m?.close ?? null,
        zoneHigh: sweepZoneHigh,
        oiNow: oiMeta.now,
        oiAtSweep,
        oiTrend5: { dir: oiMeta.trend_5m.dir, pct: oiMeta.trend_5m.pct },
        oiTrend15: { dir: oiMeta.trend_15m.dir, pct: oiMeta.trend_15m.pct },
        fundNow: fundingMeta.now,
        fundTrend5: { dir: fundingMeta.trend_5m.dir, pct: fundingMeta.trend_5m.pct },
        fundTrend15: { dir: fundingMeta.trend_15m.dir, pct: fundingMeta.trend_15m.pct },
    });

    /** ---------- TREND_UP Step Set (add-on, keep old logic) ---------- */

    type StepStatus = "WAITING" | "PASS" | "WARN" | "FAIL" | "DONE";
    type PlanStep = { id: string; title: string; status: StepStatus; why?: string; data?: any };

    function clampNum(n: any): number | null {
        const x = Number(n);
        return Number.isFinite(x) ? x : null;
    }
    function fmt(n: number | null, dp = 0) {
        if (n === null) return "—";
        return n.toFixed(dp);
    }

    function minLow(candles: Candle[]) {
        let m = Number.POSITIVE_INFINITY;
        for (const c of candles) m = Math.min(m, c.low);
        return Number.isFinite(m) ? m : null;
    }

    function makeHLHeuristic(afterConfirm: Candle[]) {
        if (afterConfirm.length < 12) return { ok: false, why: "แท่งหลัง confirm ยังไม่พอ (ต้อง ≥ 12 แท่ง 5m)" };
        const prev6 = afterConfirm.slice(-12, -6);
        const recent6 = afterConfirm.slice(-6);

        const a = minLow(prev6);
        const b = minLow(recent6);
        if (a == null || b == null) return { ok: false, why: "คำนวณ HL ไม่ได้" };

        if (b > a) return { ok: true, why: `HL confirmed: low ใหม่ (${fmt(b, 0)}) > low เดิม (${fmt(a, 0)})` };
        return { ok: false, why: `ยังไม่เป็น HL: low ใหม่ (${fmt(b, 0)}) ≤ low เดิม (${fmt(a, 0)})` };
    }

    function oiIncreasingAfter(oi5: Point[], t0ms: number) {
        const pts = oi5.filter((x) => (toMs(x.t) ?? x.t) >= t0ms).slice(-3);
        if (pts.length < 3) return { ok: false, why: "OI หลัง confirm ยังไม่พอ (ต้อง ≥ 3 จุด)" };
        const a = pts[0].v,
            b = pts[1].v,
            c = pts[2].v;
        if (b > a && c > b) return { ok: true, why: `OI เพิ่ม 2 จุดติด: ${fmt(a, 0)} → ${fmt(b, 0)} → ${fmt(c, 0)}` };
        return { ok: false, why: `OI ยังไม่เพิ่มต่อเนื่อง: ${fmt(a, 0)} → ${fmt(b, 0)} → ${fmt(c, 0)}` };
    }
    // ---------------- NEW: buildTrendDownPlanStatus ----------------
    function buildTrendDownPlanStatus(params: {
        decision: any;
        raw5m: Candle[];
        last5m: Candle | null;
        last1h: Candle | null;
        oi5: Point[];
        prevStateObj: any;
    }) {
        const { decision, raw5m, last5m, last1h, oi5, prevStateObj } = params;

        // --- read previous TREND state (mirror UP) ---
        const prevConfirmTs =
            clampNum(prevStateObj?.plan_status_state?.state?.confirm_ts) ??
            clampNum(prevStateObj?.state?.confirm_ts);

        const entry1Done = Boolean(
            prevStateObj?.plan_status_state?.state?.entry_1_done ?? prevStateObj?.state?.entry_1_done
        );
        const entry2Done = Boolean(
            prevStateObj?.plan_status_state?.state?.entry_2_done ?? prevStateObj?.state?.entry_2_done
        );

        // ---------- helpers ----------
        // const clampNum = (x: any): number | null => (typeof x === "number" && Number.isFinite(x) ? x : null);

        function pivotHighs(c: Candle[], left = 2, right = 2) {
            const out: { idx: number; high: number }[] = [];
            for (let i = left; i < c.length - right; i++) {
                const h = c[i]?.high;
                if (typeof h !== "number") continue;
                let ok = true;
                for (let j = i - left; j <= i + right; j++) {
                    if (j === i) continue;
                    const hj = c[j]?.high;
                    if (typeof hj === "number" && hj >= h) {
                        ok = false;
                        break;
                    }
                }
                if (ok) out.push({ idx: i, high: h });
            }
            return out;
        }

        // ---------- decision parsing (mirror UP but inverted) ----------
        const pb = decision?.levels?.trend?.pullback_zone;
        const pbLo = Array.isArray(pb) ? clampNum(pb[0]) : null;
        const pbHi = Array.isArray(pb) ? clampNum(pb[1]) : null;

        const zoneLow = pbLo !== null && pbHi !== null ? Math.min(pbLo, pbHi) : null;
        const zoneHigh = pbLo !== null && pbHi !== null ? Math.max(pbLo, pbHi) : null;

        const confirmLine =
            clampNum(decision?.parameters_for_grid_or_trend?.trend_entry) ??
            clampNum(decision?.levels?.trend?.confirm_line) ??
            (zoneLow !== null && zoneHigh !== null ? (zoneLow + zoneHigh) / 2 : null);

        const invalidation = clampNum(decision?.levels?.trend?.invalidation) ?? clampNum(decision?.parameters_for_grid_or_trend?.trend_sl);
        const tp1 = clampNum(decision?.levels?.trend?.targets?.t1) ?? clampNum(decision?.parameters_for_grid_or_trend?.trend_tp);

        const lastClose5m = last5m?.close ?? null;
        const lastHigh5m = last5m?.high ?? null;
        const lastLow5m = last5m?.low ?? null;

        const inZone =
            typeof lastClose5m === "number" &&
            typeof zoneLow === "number" &&
            typeof zoneHigh === "number" &&
            lastClose5m >= zoneLow &&
            lastClose5m <= zoneHigh;

        const outZone =
            !inZone && typeof lastClose5m === "number" && typeof zoneLow === "number" && typeof zoneHigh === "number";

        // ✅ DOWN confirm = 5m close BELOW confirmLine
        const confirm5m =
            typeof lastClose5m === "number" && typeof confirmLine === "number" ? lastClose5m < confirmLine : false;
        // --- latch confirm_ts once (first time) ---
        let confirmTs = prevConfirmTs ?? null;
        if (!confirmTs && inZone && confirm5m && last5m?.t != null) {
            confirmTs = last5m.t;
        }

        // ✅ LH confirm (simple pivot): last pivot high < prev pivot high
        // ✅ LH must be evaluated AFTER confirm_ts
        const afterConfirm5m =
            confirmTs != null
                ? raw5m.filter((c) => (toMs(c.t) ?? c.t) >= confirmTs!)
                : [];

        const pivH = pivotHighs(afterConfirm5m.length ? afterConfirm5m : raw5m, 2, 2);
        const last2 = pivH.length >= 2 ? pivH.slice(-2) : null;
        const lhOk = !!last2 && last2[1].high < last2[0].high;

        // ✅ OI rule (mirror UP): ต้อง “เริ่มลด” หลัง confirm
        // ✅ OI must decrease AFTER confirm_ts (need ≥ 3 points)
        const oiAfter =
            confirmTs != null
                ? (oi5 ?? []).filter((p) => (toMs(p.t) ?? p.t) >= confirmTs!).slice(-3)
                : [];

        const oiOk =
            oiAfter.length >= 3
                ? oiAfter[2].v < oiAfter[1].v && oiAfter[1].v < oiAfter[0].v
                : false;

        // ✅ invalidation for DOWN: price > invalidation = แผนพัง
        const invalidated =
            typeof lastClose5m === "number" && typeof invalidation === "number" ? lastClose5m > invalidation : false;

        // ✅ TP1 hit for DOWN: low <= tp1
        const tp1Hit =
            typeof tp1 === "number" && typeof lastLow5m === "number" ? lastLow5m <= tp1 : false;

        // ---------- state machine (keep naming style close to UP) ----------
        let code = "TREND_DOWN_WAIT_ZONE";
        let headline = "📉 TREND_DOWN — รอราคาเด้งเข้าโซนก่อนค่อย Short";
        let directionHint = "PULLBACK_THEN_CONFIRM";

        if (invalidated) {
            code = "TREND_DOWN_INVALIDATED";
            headline = "🛑 TREND_DOWN invalidated — ห้ามฝืน Short";
        } else if (!inZone) {
            code = "TREND_DOWN_WAIT_ZONE";
            headline = `📉 รอเด้งเข้าโซน ${zoneLow?.toFixed(2) ?? "—"}–${zoneHigh?.toFixed(2) ?? "—"} (ห้ามไล่)`;
        } else if (!confirm5m) {
            code = "TREND_DOWN_WAIT_5M_CONFIRM";
            headline = `📉 เข้าโซนแล้ว — รอ 5m ปิดต่ำกว่า ${confirmLine?.toFixed(2) ?? "—"}`;
        } else if (!lhOk) {
            code = "TREND_DOWN_WAIT_LH";
            headline = "📉 5m confirm แล้ว — รอทำ Lower High (LH) ให้ชัดก่อนเข้า";
        } else if (!oiOk) {
            code = "TREND_DOWN_WAIT_OI";
            headline = "📉 ผ่าน LH แล้ว — รอ OI เริ่มลด (กันโดน squeeze)";
        } else if (tp1Hit) {
            code = "TREND_DOWN_TP1_HIT";
            headline = "🎯 แตะ TP1 แล้ว — ทยอยปิด + เลื่อน SL";
        } else {
            code = "TREND_DOWN_READY";
            headline = "✅ พร้อม Short (CONFIRM) — เข้าแบบไม่ไล่";
        }

        // ---------- steps (formatเดียวกับ UP ของคุณ) ----------
        type StepStatus = "WAITING" | "PASS" | "WARN" | "FAIL" | "DONE";

        const steps: any[] = [];

        steps.push({
            id: "trend_wait_zone",
            title: `รอราคาเข้าโซน ${zoneLow?.toFixed(2) ?? "—"}–${zoneHigh?.toFixed(2) ?? "—"}`,
            status: inZone ? "PASS" : "WAITING",
            why: inZone ? "เข้าโซนแล้ว" : `ราคา ${lastClose5m ?? "—"} ยังไม่เข้าโซน`,
            data: { lastClose5m, zoneLow, zoneHigh },
        });

        steps.push({
            id: "trend_5m_confirm_close",
            title: `รอ 5m ปิดต่ำกว่า ${confirmLine?.toFixed(2) ?? "—"}`,
            status: confirm5m ? "PASS" : inZone ? "WAITING" : "WAITING",
            why: confirm5m ? `5m close=${lastClose5m} < ${confirmLine}` : `รอ close ต่ำกว่า confirm_line`,
            data: { confirmLine },
        });

        steps.push({
            id: "trend_5m_lh",
            title: "ต้องเห็น 5m ทำ Lower High (LH)",
            status: confirm5m ? (lhOk ? "PASS" : "WAITING") : "WAITING",
            why: lhOk ? "LH confirmed: pivot high ล่าสุดต่ำกว่าก่อนหน้า" : "รอ LH",
        });

        steps.push({
            id: "trend_oi_confirm",
            title: "เช็ก OI: หลัง confirm ต้องเริ่มลด",
            status: confirm5m ? (oiOk ? "PASS" : "WAITING") : "WAITING",
            why: oiOk ? "OI ลดต่อเนื่อง 2 จุด" : "OI ยังไม่ลดต่อเนื่อง",
        });

        steps.push({
            id: "trend_entry_1",
            title: "เข้าไม้ 1 (Probe เล็ก)",
            status: entry1Done
                ? "DONE"
                : code === "TREND_DOWN_READY" || code === "TREND_DOWN_TP1_HIT"
                    ? "PASS"
                    : "WAITING",
            why: entry1Done
                ? "ทำเครื่องหมายว่าเข้าไม้ 1 แล้ว"
                : code === "TREND_DOWN_READY"
                    ? "เงื่อนไขพร้อม — เข้าไม้ 1 ได้"
                    : "ยังไม่ครบเงื่อนไข",
            data: { entry1Done, canEnter1: code === "TREND_DOWN_READY" },
        });


        steps.push({
            id: "trend_hard_sl",
            title: `Hard SL: สูงกว่า ${invalidation?.toFixed(2) ?? "—"} = แผนพัง`,
            status: invalidated ? "FAIL" : "PASS",
            why: invalidated ? "ทะลุ invalidation" : "ยังไม่ถึงจุดแผนพัง",
        });

        steps.push({
            id: "trend_tp1",
            title: `TP1 = ${tp1?.toFixed(2) ?? "—"} (แตะแล้วทยอยปิด + เลื่อน SL)`,
            status: tp1Hit ? "PASS" : "WAITING",
            why: tp1Hit ? `แตะ TP1 แล้ว (5m low=${lastLow5m})` : "ยังไม่แตะ TP1",
        });

        return {
            generated_at: new Date().toISOString(),
            age_sec: 0,
            price: { close_5m: lastClose5m ?? null, close_1h: last1h?.close ?? null },
            plan: {
                market_regime: decision?.market_regime ?? decision?.regime ?? "TREND",
                market_mode: decision?.market_mode ?? "TREND_DOWN",
                trend: {
                    pullback_zone: zoneLow !== null && zoneHigh !== null ? { low: zoneLow, high: zoneHigh } : null,
                    confirm_line: confirmLine,
                    invalidation,
                    tp1,
                    swing_high_1h: clampNum(decision?.levels?.smc?.swing_high_1h),
                    swing_low_1h: clampNum(decision?.levels?.smc?.swing_low_1h),
                    eq_1h: clampNum(decision?.levels?.smc?.eq_1h),
                    liquidity_note: decision?.levels?.smc?.liquidity_note ?? null,
                },
                risk_warning: decision?.risk_warning ?? [],
                confidence: clampNum(decision?.confidence) ?? null,
            },
            state: {
                code,
                headline,
                direction_hint: directionHint,
                confidence: clampNum(decision?.confidence) ?? null,
                step_set: "TREND_DOWN_STEPSET",
                confirm_ts: confirmTs,
                entry_1_done: entry1Done,
                entry_2_done: entry2Done,
            },

            signals: {
                trend_in_zone: inZone ? "IN_ZONE" : outZone ? "OUT_ZONE" : "UNKNOWN",
                trend_confirm_5m: confirm5m ? "CONFIRMED" : "WAIT",
                trend_lh_5m: lhOk ? "LH_OK" : "WAIT",
                trend_oi: oiOk ? "OK" : "WAIT",
                trend_tp1: tp1Hit ? "HIT" : "WAIT",
                trend_invalidation: invalidated ? "INVALID" : "OK",
            },
            next_actions: [
                !inZone ? "รอราคาเด้งเข้าโซนก่อน (ห้ามไล่)" : "เข้าโซนแล้ว → รอ 5m ปิดต่ำกว่า confirm_line แล้วค่อยเข้า",
            ],
            steps,
            event_log: [],
        };
    }


    function buildTrendUpPlanStatus(params: { decision: any; raw5m: Candle[]; last5m: Candle | null; last1h: Candle | null; oi5: Point[]; prevStateObj: any }) {
        const { decision, raw5m, last5m, last1h, oi5, prevStateObj } = params;

        const trendL = decision?.levels?.trend ?? {};
        const smcL = decision?.levels?.smc ?? {};

        const zoneLow = clampNum(trendL?.pullback_zone?.[0]);
        const zoneHigh = clampNum(trendL?.pullback_zone?.[1]);
        const confirmLine = clampNum(decision?.parameters_for_grid_or_trend?.trend_entry) ?? clampNum(zoneHigh);

        const invalidation = clampNum(trendL?.invalidation) ?? clampNum(decision?.parameters_for_grid_or_trend?.trend_sl);
        const tp1 = clampNum(trendL?.targets?.t1) ?? clampNum(decision?.parameters_for_grid_or_trend?.trend_tp);

        const lastClose5m = last5m?.close ?? null;
        const lastHigh5m = last5m?.high ?? null;
        const lastTime5m = last5m?.t ?? null;

        const prevConfirmTs = clampNum(prevStateObj?.plan_status_state?.state?.confirm_ts) ?? clampNum(prevStateObj?.state?.confirm_ts);
        const entry1Done = Boolean(prevStateObj?.plan_status_state?.state?.entry_1_done ?? prevStateObj?.state?.entry_1_done);
        const entry2Done = Boolean(prevStateObj?.plan_status_state?.state?.entry_2_done ?? prevStateObj?.state?.entry_2_done);

        const steps: PlanStep[] = [];
        const next_actions: string[] = [];

        const missing: string[] = [];
        if (zoneLow == null || zoneHigh == null) missing.push("levels.trend.pullback_zone");
        if (confirmLine == null) missing.push("trend_entry/zoneHigh");
        if (invalidation == null) missing.push("invalidation/trend_sl");
        if (tp1 == null) missing.push("tp1/trend_tp");
        if (!raw5m?.length) missing.push("raw_5m.series");
        if (lastClose5m == null) missing.push("last5m.close");

        if (missing.length) {
            steps.push({
                id: "trend_guard",
                title: "ข้อมูลไม่พอสำหรับ TREND_UP step set",
                status: "FAIL",
                why: `Missing: ${missing.join(", ")}`,
            });

            return {
                generated_at: new Date().toISOString(),
                age_sec: 0,
                price: { close_5m: lastClose5m, close_1h: last1h?.close ?? null },
                plan: {
                    market_regime: decision?.market_regime ?? decision?.regime ?? "TREND",
                    market_mode: decision?.market_mode ?? "TREND_UP",
                    trend: {
                        pullback_zone: { low: zoneLow, high: zoneHigh },
                        confirm_line: confirmLine,
                        invalidation,
                        tp1,
                        swing_high_1h: clampNum(smcL?.swing_high_1h),
                        swing_low_1h: clampNum(smcL?.swing_low_1h),
                        eq_1h: clampNum(smcL?.eq_1h),
                        liquidity_note: smcL?.liquidity_note ?? "",
                    },
                },
                state: {
                    code: "TREND_DATA_MISSING",
                    headline: "ข้อมูลไม่พอ — งดเทรด/รอ snapshot ใหม่",
                    direction_hint: "PULLBACK_THEN_CONFIRM",
                    confidence: clampNum(decision?.confidence) ?? null,
                },
                signals: {},
                steps,
                next_actions: ["กด Snapshot ใหม่", "ตรวจว่า latest_decision มี pullback_zone/invalidation/tp1", "ตรวจว่า raw_5m มีข้อมูล"],
                event_log: prevStateObj?.plan_status_state?.event_log ?? prevStateObj?.event_log ?? [],
            };
        }

        const inZoneNow = lastClose5m! >= zoneLow! && lastClose5m! <= zoneHigh!;
        steps.push({
            id: "trend_wait_zone",
            title: `รอราคาเข้าโซน ${fmt(zoneLow, 0)}–${fmt(zoneHigh, 0)}`,
            status: inZoneNow ? "PASS" : "WAITING",
            why: inZoneNow ? `ราคา ${fmt(lastClose5m, 0)} อยู่ในโซนแล้ว` : `ราคา ${fmt(lastClose5m, 0)} ยังไม่เข้าโซน`,
            data: { lastClose5m, zoneLow, zoneHigh },
        });

        const closeAbove = lastClose5m! > confirmLine!;
        let confirmTs = prevConfirmTs ?? null;

        // ล็อก confirm เมื่อ "เข้าโซน" และ "5m ปิดเหนือ confirm"
        if (!confirmTs && inZoneNow && closeAbove && lastTime5m != null) {
            confirmTs = lastTime5m;
        }

        steps.push({
            id: "trend_5m_confirm_close",
            title: `รอ 5m ปิดเหนือ ${fmt(confirmLine, 0)}`,
            status: closeAbove ? "PASS" : "WAITING",
            why: closeAbove ? `5m close=${fmt(lastClose5m, 0)} > ${fmt(confirmLine, 0)}` : `5m close=${fmt(lastClose5m, 0)} ยังไม่ผ่าน`,
            data: { confirm_ts: confirmTs },
        });

        // HL
        let hlOk = false;
        let hlWhy = "ยังไม่เริ่ม (ต้องมี confirm ก่อน)";
        if (confirmTs != null) {
            const after = raw5m.filter((c) => (toMs(c.t) ?? c.t) >= confirmTs!);
            const hl = makeHLHeuristic(after);
            hlOk = hl.ok;
            hlWhy = hl.why;
        }
        steps.push({ id: "trend_5m_hl", title: "ต้องเห็น 5m ทำ Higher Low (HL)", status: hlOk ? "PASS" : "WAITING", why: hlWhy });

        // OI
        let oiOk = false;
        let oiWhy = "ยังไม่เริ่ม (ต้องมี confirm ก่อน)";
        if (confirmTs != null) {
            const r = oiIncreasingAfter(oi5, confirmTs);
            oiOk = r.ok;
            oiWhy = r.why;
        }
        steps.push({ id: "trend_oi_confirm", title: "เช็ก OI: หลัง confirm ต้องเริ่มเพิ่ม", status: oiOk ? "PASS" : "WAITING", why: oiWhy });

        const canEnter1 = inZoneNow && closeAbove && hlOk && oiOk;
        steps.push({
            id: "trend_entry_1",
            title: "เข้าไม้ 1 (Probe เล็ก)",
            status: entry1Done ? "DONE" : canEnter1 ? "PASS" : "WAITING",
            why: entry1Done ? "ทำเครื่องหมายว่าเข้าไม้ 1 แล้ว" : canEnter1 ? "เงื่อนไขพร้อม — ให้เข้าไม้ 1" : "ยังไม่ครบเงื่อนไข",
            data: { entry1Done, canEnter1 },
        });

        const hardFail = lastClose5m! < invalidation!;
        steps.push({
            id: "trend_hard_sl",
            title: `Hard SL: ต่ำกว่า ${fmt(invalidation, 0)} = แผนพัง`,
            status: hardFail ? "FAIL" : "PASS",
            why: hardFail ? `STOP: 5m close=${fmt(lastClose5m, 0)} < ${fmt(invalidation, 0)}` : "ยังไม่ถึงจุดแผนพัง",
        });

        const tpHit = (lastHigh5m ?? 0) >= tp1!;
        steps.push({
            id: "trend_tp1",
            title: `TP1 = ${fmt(tp1, 0)} (ทยอยปิด + เลื่อน SL)`,
            status: tpHit ? "PASS" : "WAITING",
            why: tpHit ? `แตะ TP1 แล้ว (5m high=${fmt(lastHigh5m, 0)})` : `ยังไม่ถึง TP1`,
        });

        // state headline/code
        let code = "TREND_WAIT_ZONE";
        let headline = `รอ pullback เข้าโซน ${fmt(zoneLow, 0)}–${fmt(zoneHigh, 0)}`;

        if (hardFail) {
            code = "TREND_INVALIDATED";
            headline = `แผนพัง: หลุด ${fmt(invalidation, 0)} (STOP)`;
        } else if (tpHit) {
            code = "TREND_TP1_HIT";
            headline = `แตะ TP1 แล้ว — ทยอยปิด + เลื่อน SL`;
        } else if (entry2Done) {
            code = "TREND_IN_TRADE_ADD_DONE";
            headline = "ถือเทรนด์ (เข้าไม้ 2 แล้ว) — โฟกัส TP1/Trailing";
        } else if (entry1Done) {
            code = "TREND_IN_TRADE_PROBE_DONE";
            headline = "เข้าไม้ 1 แล้ว — รอจังหวะเติม (ไม้ 2) / ระวังโดนแกว่ง";
        } else if (canEnter1) {
            code = "TREND_READY_TO_ENTER";
            headline = "เงื่อนไขครบ — พร้อมเข้าไม้ 1 (เล็ก)";
        } else if (confirmTs != null && closeAbove) {
            code = "TREND_CONFIRMED_WAIT_HL_OI";
            headline = "ผ่าน 5m confirm แล้ว — รอ HL + OI";
        } else if (inZoneNow) {
            code = "TREND_IN_ZONE_WAIT_CONFIRM";
            headline = "ราคาเข้าโซนแล้ว — รอ 5m ปิดเหนือโซน";
        }

        // next_actions
        if (hardFail) {
            next_actions.push("หยุดขาดทุนตามแผน (Hard SL)", "รอ snapshot ใหม่เพื่อ re-evaluate");
        } else if (!inZoneNow) {
            next_actions.push(`รอราคาเข้าพื้นที่ซื้อ ${fmt(zoneLow, 0)}–${fmt(zoneHigh, 0)}`, "ห้าม FOMO ไล่ราคา");
        } else if (!closeAbove) {
            next_actions.push(`รอ 5m ปิดเหนือ ${fmt(confirmLine, 0)} ก่อน`);
        } else if (!hlOk) {
            next_actions.push("รอให้ 5m ทำ HL ให้ชัด");
        } else if (!oiOk) {
            next_actions.push("รอ OI เริ่มเพิ่มหลัง confirm");
        } else if (!entry1Done) {
            next_actions.push("เข้าไม้ 1 เล็ก (probe) แล้วค่อยดู retest");
        } else if (!tpHit) {
            next_actions.push(`รอ TP1 ${fmt(tp1, 0)} แล้วทยอยปิด`);
        } else {
            next_actions.push("ทยอยปิด + เลื่อน SL ตามแผน");
        }

        const event_log = prevStateObj?.plan_status_state?.event_log ?? prevStateObj?.event_log ?? [];

        return {
            generated_at: new Date().toISOString(),
            age_sec: 0,
            price: { close_5m: lastClose5m, close_1h: last1h?.close ?? null },
            plan: {
                market_regime: decision?.market_regime ?? decision?.regime ?? "TREND",
                market_mode: decision?.market_mode ?? "TREND_UP",
                trend: {
                    pullback_zone: { low: zoneLow, high: zoneHigh },
                    confirm_line: confirmLine,
                    invalidation,
                    tp1,
                    swing_high_1h: clampNum(smcL?.swing_high_1h),
                    swing_low_1h: clampNum(smcL?.swing_low_1h),
                    eq_1h: clampNum(smcL?.eq_1h),
                    liquidity_note: smcL?.liquidity_note ?? "",
                },
                risk_warning: decision?.risk_warning ?? [],
                confidence: clampNum(decision?.confidence) ?? null,
            },
            state: {
                code,
                headline,
                direction_hint: "PULLBACK_THEN_CONFIRM",
                confidence: clampNum(decision?.confidence) ?? null,
                step_set: "TREND_UP_STEPSET",
                confirm_ts: confirmTs,
                entry_1_done: entry1Done,
                entry_2_done: entry2Done,
            },
            signals: {
                trend_in_zone: inZoneNow ? "IN_ZONE" : "OUT_ZONE",
                trend_confirm_5m: closeAbove ? "CONFIRMED" : "WAIT",
                trend_hl_5m: hlOk ? "HL_OK" : "WAIT",
                trend_oi: oiOk ? "OK" : "WAIT",
                trend_tp1: tpHit ? "HIT" : "WAIT",
                trend_invalidation: hardFail ? "FAIL" : "OK",
            },
            next_actions,
            steps,
            event_log,
        };
    }

    // ---------------- plan_status_state (engine steps) ----------------
    type EngineStepStatus = "WAITING" | "PASS" | "WARN" | "FAIL" | "DONE";

    type PlanStatusState = {
        generated_at: string;
        age_sec: number | null;
        price: { close_5m: number | null; close_1h: number | null };
        plan: {
            market_regime: string;
            market_mode: string;
            sweep_zone_up?: { low: number; high: number };
            grid?: { lower: number; upper: number; count: number | null };
            [k: string]: any;
        };
        state: { code: string; headline: string; direction_hint: string; confidence: number | null;[k: string]: any };
        signals?: { sweep_5m?: string; rejection_15m?: string; breakout_1h?: string;[k: string]: any };
        next_actions: string[];
        steps: Array<{ id: string; title: string; status: EngineStepStatus; why?: string; data?: any }>;
        [k: string]: any;
    };

    function engineStatusSweep(sweepState: string): EngineStepStatus {
        const s = (sweepState ?? "").toUpperCase();
        if (s.includes("SWEEP_UP_CONFIRMED")) return "PASS";
        if (s.includes("WAIT")) return "WAITING";
        return "WARN";
    }

    function engineStatusRejection(rejState: string): EngineStepStatus {
        const s = (rejState ?? "").toUpperCase();
        if (s.includes("REJECTION_15M_CONFIRMED")) return "PASS";
        if (s.includes("NO_15M_DATA")) return "WAITING";
        if (s.includes("PENDING")) return "WAITING";
        return "WARN";
    }

    function engineStatus1H(confState: string): EngineStepStatus {
        const s = (confState ?? "").toUpperCase();
        if (s.includes("FAKEOUT_1H_CONFIRMED")) return "PASS";
        if (s.includes("BREAKOUT_1H_CONFIRMED")) return "FAIL";
        if (s.includes("NO_1H_DATA")) return "WAITING";
        return "WARN";
    }

    function directionHintFromPlanState(ps: string) {
        const s = (ps ?? "").toUpperCase();
        if (s.includes("WAIT_SWEEP")) return "UPPER_SWEEP_THEN_REJECT";
        if (s.includes("WAIT_15M_REJECTION")) return "WAIT_15M_REJECTION";
        if (s.includes("WAIT_1H_CONFIRM")) return "WAIT_1H_CONFIRM";
        if (s.includes("FAKEOUT_CONFIRMED") || s.includes("RANGE_PLAY")) return "RANGE_PLAY";
        if (s.includes("BREAKOUT_CONFIRMED") || s.includes("SWITCH_MODE")) return "BREAKOUT_SWITCH_MODE";
        if (s.includes("NO_TRADE")) return "NO_TRADE";
        if (s.includes("TREND")) return "TREND_PULLBACK_CONFIRM";
        return "UNKNOWN";
    }

    function nextActionsFrom(planState: string, zLow: number, zHigh: number) {
        const s = (planState ?? "").toUpperCase();

        if (s.includes("WAIT_SWEEP")) {
            return [
                `รอให้ราคา sweep เหนือ ${zLow}–${zHigh} แล้ว “ปิดกลับใต้โซน”`,
                "ยังไม่ต้องรีบเข้า — รอแท่งยืนยัน",
                "ถ้าเริ่มยืนเหนือโซนบนต่อเนื่อง → ระวัง breakout",
            ];
        }

        if (s.includes("WAIT_15M_REJECTION")) {
            return ["รอ 15m ปิดยืนยัน rejection (wick บน + ปิดกลับใต้โซนบน)", "ถ้า OI/Funding บวกและราคาปิดกลับลง → ระวัง Long ติดบน"];
        }

        if (s.includes("WAIT_1H_CONFIRM")) {
            return ["รอ 1H ปิดยืนยันว่าเป็น fakeout (กลับเข้า range) หรือ breakout (ยืนเหนือโซนบน)", "ถ้า 1H ยืนเหนือ → ลด/พัก grid และให้ agent สรุปใหม่"];
        }

        if (s.includes("BREAKOUT_CONFIRMED") || s.includes("SWITCH_MODE")) {
            return ["ยืนยัน breakout แล้ว → หยุดเกมกรอบ/พัก grid", "เรียก snapshot + agent วิเคราะห์ใหม่เพื่อเลือกโหมด (TREND/NO_TRADE)"];
        }

        if (s.includes("NO_TRADE")) {
            return ["งดเทรดตามบทวิเคราะห์", "รอ snapshot ใหม่แล้วค่อย re-evaluate"];
        }

        if (s.includes("TREND")) {
            return ["พักแผนกริด แล้วรอจังหวะเทรนด์ตาม decision", "โฟกัส pullback + 5m confirm (ปิดเหนือโซน/ทำ HL) ก่อนเข้า"];
        }

        return ["รอข้อมูลยืนยันเพิ่มเติม"];
    }

    const generatedAtISO = new Date().toISOString();
    const ageSec =
        sourceUpdatedAt != null
            ? Math.max(0, Math.floor((Date.now() - (toMs(sourceUpdatedAt) ?? Date.now())) / 1000))
            : null;

    const decisionMode = String(decision?.market_mode ?? decision?.regime ?? "").toUpperCase();

    // ✅ ใช้ตัวเดียวทั้งไฟล์ ห้ามประกาศซ้ำ
    let planStatusState: PlanStatusState;

    // ✅ TREND step set: เลือก UP/DOWN ตาม decision จริง (ไม่ใช่ตาม mode_lock อย่างเดียว)
    const trendDir = String(decision?.levels?.trend?.dir ?? "").toUpperCase();
    const mm = String(decision?.market_mode ?? "").toUpperCase();

    const isTrendDecision = mm.includes("TREND");
    const isDown = trendDir === "DOWN" || mm.includes("TREND_DOWN") || mm.includes("SHORT");
    const isUp = trendDir === "UP" || mm.includes("TREND_UP") || mm.includes("LONG");

    if (modeLock === "TREND" || isTrendDecision) {
        planStatusState = isDown
            ? buildTrendDownPlanStatus({ decision, raw5m, last5m, last1h, oi5: derivBundle.oi5, prevStateObj })
            : buildTrendUpPlanStatus({ decision, raw5m, last5m, last1h, oi5: derivBundle.oi5, prevStateObj });
    }


    else {
        let planSteps: PlanStatusState["steps"] = [];

        if (modeLock === "NO_TRADE") {
            planSteps = [{ id: "LOCK", title: "NO_TRADE locked", status: "DONE", why: "decision mode_lock = NO_TRADE" }];
        } else {
            planSteps = [
                {
                    id: "SWEEP_5M",
                    title: `5m Sweep โซนบน ${sweepZoneLow}–${sweepZoneHigh}`,
                    status: engineStatusSweep(sweep.state),
                    why: sweep.event ? `hit@${new Date(sweep.event.t).toISOString()}` : sweep.state,
                },
                { id: "REJECTION_15M", title: "15m Rejection (ปิดกลับใต้โซน)", status: engineStatusRejection(rej15.state), why: rej15.why },
                { id: "CONFIRM_1H", title: "1H Confirm (Fakeout/Breakout)", status: engineStatus1H(conf1h.state), why: conf1h.why },
            ];
        }

        const stepSetForGrid =
            modeLock === "NO_TRADE"
                ? "MODE_LOCKED_NO_TRADE"
                : planState === "BREAKOUT_CONFIRMED_SWITCH_MODE"
                    ? "BREAKOUT_SWITCH_MODE"
                    : "GRID_SWEEP_PIPELINE";

        planStatusState = {
            generated_at: generatedAtISO,
            age_sec: ageSec,
            price: { close_5m: last5m?.close ?? null, close_1h: last1h?.close ?? null },
            plan: {
                market_regime: decision?.market_regime ?? decision?.regime ?? "UNKNOWN",
                market_mode: decision?.market_mode ?? decision?.market_mode ?? "UNKNOWN",
                sweep_zone_up: { low: sweepZoneLow, high: sweepZoneHigh },
                sweep_target: { side: "UP", zone: [sweepZoneLow, sweepZoneHigh] },
                grid: { lower: gridLower, upper: gridUpper, count: decision?.parameters_for_grid_or_trend?.grid_count ?? null },
            },
            state: {
                code: planState,
                headline: explainTH,
                direction_hint: directionHintFromPlanState(planState),
                confidence: decision?.confidence ?? null,
                step_set: stepSetForGrid,
            },
            signals: { sweep_5m: sweep.state, rejection_15m: rej15.state, breakout_1h: conf1h.state },
            next_actions: nextActionsFrom(planState, sweepZoneLow, sweepZoneHigh),
            steps: planSteps,
        };
    }

    // ---------------- OB Gate (1H -> 5m) + OB Trade (Mode A) ----------------

    // ✅ helper: append plan log (PATHS.log) + mirror to public (optional)
    async function appendPlanLog(obj: any) {
        await appendJsonl(PATHS.log, obj);
        if (MIRROR_LOGS_TO_PUBLIC) await appendJsonl(PATHS.logPublic, obj);
    }

    async function appendHistory(obj: any) {
        await appendJsonl(PATHS.history, obj);
        if (MIRROR_PLAN_HISTORY_TO_PUBLIC) await appendJsonl(PATHS.historyPublic, obj);
    }

    async function appendBothLogs(obj: any) {
        await appendHistory(obj);
        await appendPlanLog(obj);
    }

    // type-guard กัน state เก่า (legacy) ที่ shape ไม่ตรง OBTrade
    function isOBTrade(x: any): x is OBTrade {
        return !!x && typeof x === "object" && typeof x.active === "boolean" && "trade_id" in x;
    }
    function isTrendTrade(x: any): x is TrendTrade {
        return !!x && typeof x === "object" && typeof x.active === "boolean" && "trade_id" in x && "side" in x;
    }

    const prevObTrade: OBTrade | null = isOBTrade(prevStateObj?.ob_trade) ? (prevStateObj.ob_trade as OBTrade) : null;
    const prevTrendTrade: TrendTrade | null = isTrendTrade(prevStateObj?.trend_trade) ? (prevStateObj.trend_trade as TrendTrade) : null;

    // ✅ ประกาศ ob_trade แค่ครั้งเดียว
    let ob_trade: OBTrade =
        prevObTrade ?? {
            active: false,
            trade_id: null,
            symbol: sym,
            bias: null,
            opened_t: null,
            closed_t: null,
            entry_price: null,
            entry_zone: null,
            sl: null,
            tp1: null,
            result: null,
            exit_price: null,
            r_multiple: null,
            open_reason: null,
            close_reason: null,
        };

    // ✅ trend_trade (paper trade) for winrate
    let trend_trade: TrendTrade =
        prevTrendTrade ?? {
            active: false,
            trade_id: null,
            symbol: sym,
            side: null,
            opened_t: null,
            closed_t: null,
            entry_price: null,
            sl: null,
            tp1: null,
            result: null,
            exit_price: null,
            r_multiple: null,
            open_reason: null,
            close_reason: null,
        };

    const ob_gate = buildObGate({ decision, raw5m, agg1h, last5m, last1h });
    const canonicalMarketRegime = buildCanonicalMarketRegime({
        marketSnapshot: store ?? null,
        indicatorEvidenceByTimeframe: multiTimeframeIndicatorEvidence,
        obGate: ob_gate,
        derivatives: { oi: oiMeta, funding: fundingMeta },
        legacyPlanMode: typeof decision?.market_mode === "string" ? decision.market_mode : null,
    });

    const prevEntryStatus = norm(prevStateObj?.ob_gate?.entry?.status);
    const curEntryStatus = norm(ob_gate?.entry?.status);

    // Edge detect: เปลี่ยนเป็น READY ในรอบนี้เท่านั้น
    const becameReady = prevEntryStatus !== "READY" && curEntryStatus === "READY";

    // --- OPEN trade when OB becomes READY (Mode A) ---
    if (becameReady) {
        const entry = ob_gate?.entry ?? null;

        // กันการเปิดซ้ำ
        if (!ob_trade.active) {
            const bias = ob_gate?.bias_1h === "LONG" ? "LONG" : ob_gate?.bias_1h === "SHORT" ? "SHORT" : null;
            const stopLoss = toNumber(entry?.sl);

            // Mode A: entry_price ใช้ close ตอน READY (ถ้าไม่มี fallback เป็น mid zone)
            if (stopLoss === null) {
                await appendBothLogs({
                    t: Date.now(),
                    type: "OB_TRADE_BLOCKED_MISSING_STOP_LOSS",
                    symbol: sym,
                    bias,
                    reason: "MISSING_STOP_LOSS",
                    risk_model_status: "INVALID_RISK_MODEL",
                    source_updated_at: sourceUpdatedAt ?? null,
                    plan_state: planState,
                    mode_lock: modeLock,
                    explain_th: "บล็อก paper OB trade เพราะไม่มี stop loss",
                });
            } else {
            const entryZone = entry?.entry_zone ?? null;
            const entryPrice = last5m?.close ?? midZone(entryZone);

            ob_trade = {
                ...ob_trade,
                active: true,
                trade_id: makeTradeId("OB"),
                symbol: sym,
                bias,
                opened_t: Date.now(),
                closed_t: null,
                entry_price: entryPrice ?? null,
                entry_zone: entryZone,
                sl: stopLoss,
                tp1: entry?.tp1 ?? null,
                result: null,
                exit_price: null,
                r_multiple: null,
                open_reason: "MODE_A_OPEN_ON_READY",
                close_reason: null,
            };

            await appendBothLogs({
                t: Date.now(),
                type: "OB_TRADE_OPEN",
                symbol: sym,
                trade_id: ob_trade.trade_id,
                bias: ob_trade.bias,
                entry_price: ob_trade.entry_price,
                entry_zone: ob_trade.entry_zone,
                sl: ob_trade.sl,
                tp1: ob_trade.tp1,
                source_updated_at: sourceUpdatedAt ?? null,
                price: { close_5m: last5m?.close ?? null, close_1h: last1h?.close ?? null },
                plan_state: planState,
                mode_lock: modeLock,
                explain_th: `🟢 เปิดเทรด (Mode A) เพราะ OB Gate READY • ${ob_trade.bias ?? "UNKNOWN"}`,
            });
            }
        }
    }

    // --- CLOSE trade when TP/SL hit (poll-safe) ---
    if (ob_trade.active && ob_trade.bias && last5m) {
        const hit = resolveTpSlHit({
            bias: ob_trade.bias,
            candle: last5m,
            tp1: ob_trade.tp1,
            sl: ob_trade.sl,
            prefer: "SL_FIRST", // conservative
        });

        if (hit.hit && hit.exit != null) {
            const result = hit.hit === "TP1" ? "WIN" : "LOSS";
            const rm = rMultiple({ bias: ob_trade.bias, entry: ob_trade.entry_price, sl: ob_trade.sl, exit: hit.exit });

            ob_trade = {
                ...ob_trade,
                active: false,
                closed_t: Date.now(),
                exit_price: hit.exit,
                result,
                r_multiple: rm,
                close_reason: hit.hit === "TP1" ? "TP1_HIT" : "STOP_HIT",
            };

            await appendBothLogs({
                t: Date.now(),
                type: hit.hit === "TP1" ? "OB_TP1_HIT" : "OB_STOP_HIT",
                symbol: sym,
                trade_id: ob_trade.trade_id,
                bias: ob_trade.bias,
                entry_price: ob_trade.entry_price,
                exit_price: ob_trade.exit_price,
                sl: ob_trade.sl,
                tp1: ob_trade.tp1,
                result: ob_trade.result,
                r_multiple: ob_trade.r_multiple,
                candle: { t: last5m.t, o: last5m.open, h: last5m.high, l: last5m.low, c: last5m.close },
                source_updated_at: sourceUpdatedAt ?? null,
                plan_state: planState,
                mode_lock: modeLock,
                explain_th: hit.hit === "TP1" ? `🏁 TP1 hit → WIN • R=${ob_trade.r_multiple ?? "—"}` : `🛑 SL hit → LOSS • R=${ob_trade.r_multiple ?? "—"}`,
            });
        }
    }

    // ---------------- TREND paper-trade events ----------------
    // const mm = String(decision?.market_mode ?? "").toUpperCase();
    const isTrendModeNow = mm.includes("TREND") || modeLock === "TREND";

    // ✅ hard-close if we LEAVE trend mode (so it won't get stuck active forever)
    if (!isTrendModeNow && trend_trade.active && last5m) {
        trend_trade = {
            ...trend_trade,
            active: false,
            closed_t: Date.now(),
            exit_price: last5m.close,
            close_reason: "MODE_SWITCH",
        };

        await appendBothLogs({
            t: Date.now(),
            type: "TREND_FORCE_CLOSE_MODE_SWITCH",
            symbol: sym,
            trade_id: trend_trade.trade_id,
            side: trend_trade.side,
            entry_price: trend_trade.entry_price,
            exit_price: trend_trade.exit_price,
            source_updated_at: sourceUpdatedAt ?? null,
            price: { close_5m: last5m?.close ?? null, close_1h: last1h?.close ?? null },
            plan_state: planState,
            mode_lock: modeLock,
            explain_th: `🧯 ปิด TREND paper-trade เพราะออกจากโหมด TREND (MODE_SWITCH)`,
        });
    }


    if (isTrendModeNow && last5m) {
        const code = String(planStatusState?.state?.code ?? "");
        const trendPlan = (planStatusState as any)?.plan?.trend ?? {};
        const trendSl = typeof trendPlan?.invalidation === "number" ? trendPlan.invalidation : null;
        const trendTp1 = typeof trendPlan?.tp1 === "number" ? trendPlan.tp1 : null;

        const planMarketMode = String((planStatusState as any)?.plan?.market_mode ?? mm).toUpperCase();

        const isDownNow =
            planMarketMode.includes("TREND_DOWN") ||
            planMarketMode.includes("SHORT") ||
            String(decision?.levels?.trend?.dir ?? "").toUpperCase() === "DOWN";

        const openOnReady =
            code === "TREND_READY_TO_ENTER" || // UP
            code === "TREND_DOWN_READY";       // DOWN

        // OPEN on READY (paper trade)
        if (openOnReady && !trend_trade.active) {
            trend_trade = {
                ...trend_trade,
                active: true,
                trade_id: makeTradeId("TREND"),
                symbol: sym,
                side: isDownNow ? "SHORT" : "LONG",
                opened_t: Date.now(),
                closed_t: null,
                entry_price: last5m.close,
                sl: trendSl,
                tp1: trendTp1,
                result: null,
                exit_price: null,
                r_multiple: null,
                open_reason: isDownNow ? "OPEN_ON_TREND_DOWN_READY" : "OPEN_ON_TREND_READY",
                close_reason: null,
            };

            await appendBothLogs({
                t: Date.now(),
                type: "TREND_TRADE_OPEN",
                symbol: sym,
                trade_id: trend_trade.trade_id,
                side: trend_trade.side,
                entry_price: trend_trade.entry_price,
                sl: trend_trade.sl,
                tp1: trend_trade.tp1,
                source_updated_at: sourceUpdatedAt ?? null,
                price: { close_5m: last5m?.close ?? null, close_1h: last1h?.close ?? null },
                plan_state: planState,
                mode_lock: modeLock,
                explain_th: `🟦 เปิด TREND paper-trade เพราะ state=${code} (${isDownNow ? "SHORT" : "LONG"})`,

            });
        }

        // CLOSE on TP/SL (poll-safe)
        if (trend_trade.active && trend_trade.side && (trend_trade.sl != null || trend_trade.tp1 != null)) {
            const hit = resolveTpSlHit({
                bias: trend_trade.side,
                candle: last5m,
                tp1: trend_trade.tp1,
                sl: trend_trade.sl,
                prefer: "SL_FIRST",
            });

            if (hit.hit && hit.exit != null) {
                const result = hit.hit === "TP1" ? "WIN" : "LOSS";
                const rm = rMultiple({ bias: trend_trade.side, entry: trend_trade.entry_price, sl: trend_trade.sl, exit: hit.exit });

                trend_trade = {
                    ...trend_trade,
                    active: false,
                    closed_t: Date.now(),
                    exit_price: hit.exit,
                    result,
                    r_multiple: rm,
                    close_reason: hit.hit === "TP1" ? "TP1_HIT" : "STOP_HIT",
                };

                await appendBothLogs({
                    t: Date.now(),
                    type: hit.hit === "TP1" ? "TREND_TP1_HIT" : "TREND_STOP_HIT",
                    symbol: sym,
                    trade_id: trend_trade.trade_id,
                    side: trend_trade.side,
                    entry_price: trend_trade.entry_price,
                    exit_price: trend_trade.exit_price,
                    sl: trend_trade.sl,
                    tp1: trend_trade.tp1,
                    result: trend_trade.result,
                    r_multiple: trend_trade.r_multiple,
                    candle: { t: last5m.t, o: last5m.open, h: last5m.high, l: last5m.low, c: last5m.close },
                    source_updated_at: sourceUpdatedAt ?? null,
                    plan_state: planState,
                    mode_lock: modeLock,
                    explain_th: hit.hit === "TP1" ? `🏁 TREND TP1 hit → WIN • R=${trend_trade.r_multiple ?? "—"}` : `🛑 TREND SL hit → LOSS • R=${trend_trade.r_multiple ?? "—"}`,
                });
            }

            // hard-close if mode lock leaves trend (optional safe)
            const mm2 = String(decision?.market_mode ?? "").toUpperCase();
            const stillTrend = mm2.includes("TREND") || modeLock === "TREND";
            if (!stillTrend && trend_trade.active) {
                trend_trade = { ...trend_trade, active: false, closed_t: Date.now(), close_reason: "MODE_SWITCH" };
            }

        }
    }

    // ✅ unify timestamps
    const now = Date.now();

    // ✅ safe pct formatter (กัน null/NaN)
    const pct3 = (v: any) =>
        typeof v === "number" && Number.isFinite(v) ? Number(v.toFixed(3)) : null;

    // ---------------- Persist + Logs (one-pass, ordered) ----------------

    // ✅ change detectors (ใช้ prevObTrade/prevTrendTrade ตัวเดิมที่ประกาศไว้แล้วด้านบน)
    const obChanged =
        !prevObTrade ||
        prevObTrade.active !== ob_trade.active ||
        prevObTrade.trade_id !== ob_trade.trade_id ||
        prevObTrade.result !== ob_trade.result ||
        prevObTrade.closed_t !== ob_trade.closed_t ||
        prevObTrade.entry_price !== ob_trade.entry_price ||
        prevObTrade.exit_price !== ob_trade.exit_price;

    const trendChanged =
        !prevTrendTrade ||
        prevTrendTrade.active !== trend_trade.active ||
        prevTrendTrade.trade_id !== trend_trade.trade_id ||
        prevTrendTrade.result !== trend_trade.result ||
        prevTrendTrade.closed_t !== trend_trade.closed_t ||
        prevTrendTrade.entry_price !== trend_trade.entry_price ||
        prevTrendTrade.exit_price !== trend_trade.exit_price;

    const gateChanged =
        norm(prevStateObj?.ob_gate?.entry?.status) !== norm(ob_gate?.entry?.status);

    const shouldLog =
        prevState !== planState ||
        prevModeLock !== modeLock ||
        obChanged ||
        trendChanged ||
        gateChanged;


    // ✅ use now everywhere
    const nextStateObj = {
        t: now,
        updated_at: now,
        source_updated_at: sourceUpdatedAt ?? null,
        symbol: sym,
        data_dir: dataDir,
        decision_mode_lock: modeLock,
        plan_state: planState,
        state: (planStatusState as any)?.state ?? null,
        plan_status_state: planStatusState,
        ob_gate,
        ob_trade,
        trend_trade,
        price: { close_5m: last5m?.close ?? null, close_1h: last1h?.close ?? null },
    };

    const planStatusForDisk = {
        ok: true,
        t: now,
        updated_at: now,
        source_updated_at: sourceUpdatedAt ?? null,
        data_dir: dataDir,
        sourceInfo,
        symbol: sym,
        mode_lock: { value: modeLock, changed: modeChanged },
        plan_state: planState,
        price: { close_5m: last5m?.close ?? null, close_1h: last1h?.close ?? null },
        ob_gate,
        ob_trade,
        trend_trade,

        // ... liquidity_magnet เหมือนเดิม แต่ถ้าอยากชัวร์ให้ใส่ ?. ด้วยก็ได้ ...

        derivatives: {
            updated_at: derivUpdatedAtMs,
            freshness: cloneFresh(derivFresh),
            oi: {
                status: oiMeta.status,
                has_data: oiMeta.has_data,
                reason: oiMeta.reason ?? oiReasonExtra,
                source: oiMeta.source,
                integrity: { s5: oiMeta.integrity.s5, s15: oiMeta.integrity.s15 },
                now: oiMeta.now,
                at_sweep: oiAtSweep,
                trend_5m: { dir: oiMeta.trend_5m.dir, pct: oiMeta.trend_5m.pct },
                trend_15m: { dir: oiMeta.trend_15m.dir, pct: oiMeta.trend_15m.pct },
            },
            funding: {
                status: fundingMeta.status,
                has_data: fundingMeta.has_data,
                reason: fundingMeta.reason ?? fundingReasonExtra,
                source: fundingMeta.source,
                integrity: { s5: fundingMeta.integrity.s5, s15: fundingMeta.integrity.s15 },
                now: fundingMeta.now,
                trend_5m: { dir: fundingMeta.trend_5m.dir, pct: fundingMeta.trend_5m.pct },
                trend_15m: { dir: fundingMeta.trend_15m.dir, pct: fundingMeta.trend_15m.pct },
            },
            crowd: {
                side: crowdTrap.crowd,
                trapped: crowdTrap.trapped,
                crowd_th: crowdTrap.crowdTH,
                trapped_th: crowdTrap.trappedTH,
                note: crowdTrap.note,
            },
        },

        plan_status_state: planStatusState,

        debug: {
            sweep_event: sweep.event,
            rejection_score: rej15.score,
            rejection_why: rej15.why,
            confirm_why: conf1h.why,
            deriv_primary: { file: derivPrimaryFile, reason: derivPrimaryReason },
            oi_fallback: { used: oiFallbackUsed, reason: oiFallbackReason },
            // 👇 จะเติม persist_error ทีหลังถ้าเกิด
        },

        explain_th: explainTH,
    };

    // ✅ persist เฉพาะตอนมี snapshot ใหม่ หรือมีอะไรเปลี่ยนจริง + first run
    const prevSrc = prevStateObj?.source_updated_at ?? null;
    const curSrc = sourceUpdatedAt ?? null;
    const shouldPersist = !prevStateObj || prevSrc !== curSrc || shouldLog;

    let persistError: string | null = null;

    if (shouldPersist) {
        try {
            await writeJsonAtomic(PATHS.state, nextStateObj);
            await writeJsonAtomic(PATHS.status, planStatusForDisk);
            if (MIRROR_PLAN_STATUS_TO_PUBLIC) {
                await writeJsonAtomic(PATHS.statusPublic, planStatusForDisk);
            }
        } catch (e: any) {
            persistError = String(e?.message ?? e);
        }
    }

    // ✅ append logs best-effort
    if (shouldLog) {
        try {
            if (prevModeLock !== modeLock) {
                await appendPlanLog({
                    t: now,
                    symbol: sym,
                    type: "MODE_SWITCH",
                    from_mode: prevModeLock,
                    to_mode: modeLock,
                    to_plan_state: planState,
                    price: { close_5m: last5m?.close ?? null },
                    explain_th: `เปลี่ยนโหมด ${String(prevModeLock ?? "—")} → ${String(modeLock)}`,
                });
            }

            if (prevState !== planState) {
                await appendPlanLog({
                    t: now,
                    symbol: sym,
                    type: "STATE_CHANGE",
                    from: prevState,
                    to: planState,
                    mode_lock: modeLock,
                    price: { close_5m: last5m?.close ?? null },
                    sweep: sweep.event ?? null,
                    deriv: {
                        oi5_dir: oiMeta.trend_5m.dir,
                        oi5_pct: pct3(oiMeta.trend_5m.pct),
                        fund5_dir: fundingMeta.trend_5m.dir,
                        fund5_pct: pct3(fundingMeta.trend_5m.pct),
                        crowd: crowdTrap.crowd,
                        trapped: crowdTrap.trapped,
                    },
                    explain_th: explainTH,
                });
            }

            if (becameReady) {
                await appendPlanLog({
                    t: now,
                    symbol: sym,
                    type: "OB_GATE_READY",
                    entry: ob_gate?.entry ?? null,
                    price: { close_5m: last5m?.close ?? null },
                });
            }
        } catch (e) {
            // swallow (best-effort)
        }
    }

    // ✅ if persist failed, surface in debug (optional)
    if (persistError) {
        (planStatusForDisk as any).debug.persist_error = persistError;
    }


    // ---------------- Response ----------------
    // Phase D — Trend Zone Builder Shadow (read-only diagnostics, additive; never used for orders)
    // reuse canonicalMarketRegime + multiTimeframeIndicatorEvidence already computed above
    let trendZoneCandidate = null;
    try {
        const sess1 = (store as { meta?: { session?: { current?: string; risk_overlay?: { false_breakout_risk?: string } } } } | null)?.meta?.session ?? null;
        trendZoneCandidate = buildTrendZoneShadow({
            regime: canonicalMarketRegime.regime,
            direction: canonicalMarketRegime.direction,
            candles1h: agg1h,
            atr1h: multiTimeframeIndicatorEvidence["1H"]?.atr ?? null,
            ema50_1h: multiTimeframeIndicatorEvidence["1H"]?.ema50 ?? null,
            session: sess1?.current ?? null,
            sweepRisk: sess1?.risk_overlay?.false_breakout_risk ?? null,
            latestPrice: last1h?.close ?? null,
        });
    } catch {
        trendZoneCandidate = null;
    }

    return NextResponse.json({
        ok: true,
        data_dir: dataDir,
        symbol: sym,
        sourceInfo,
        trendZoneCandidate,

        updated_at: Date.now(),
        source_updated_at: sourceUpdatedAt ?? null,

        mode_lock: { value: modeLock, changed: modeChanged },
        price: { close_5m: last5m?.close ?? null, close_1h: last1h?.close ?? null },

        ob_gate,
        ob_trade,
        trend_trade,

        liquidity_magnet: {
            m5: magnet5m,
            h1: magnet1h,
            two_liner: [magnet5m.twoLiner[0], magnet5m.twoLiner[1], magnet1h.twoLiner[0], magnet1h.twoLiner[1]],
            summary_th: magnetSummaryTH,
        },

        plan: {
            market_regime: decision?.market_regime ?? decision?.regime ?? "UNKNOWN",
            market_mode: decision?.market_mode ?? "UNKNOWN",
            grid: { upper: gridUpper, lower: gridLower, count: decision?.parameters_for_grid_or_trend?.grid_count ?? null },
            sweep_target: { side: "UP", zone: [sweepZoneLow, sweepZoneHigh] },
            risk_warning: decision?.risk_warning ?? [],
            confidence: decision?.confidence ?? null,
        },

        indicatorEvidence,
        multiTimeframeIndicatorEvidence,
        canonicalMarketRegime,

        derivatives: {
            updated_at: derivUpdatedAtMs,
            freshness: cloneFresh(derivFresh),

            oi: {
                status: oiMeta.status,
                has_data: oiMeta.has_data,
                reason: oiMeta.reason ?? oiReasonExtra,
                source: oiMeta.source,
                integrity: { s5: oiMeta.integrity.s5, s15: oiMeta.integrity.s15 },
                now: oiMeta.now,
                at_sweep: oiAtSweep,
                trend_5m: { dir: oiMeta.trend_5m.dir, pct: oiMeta.trend_5m.pct },
                trend_15m: { dir: oiMeta.trend_15m.dir, pct: oiMeta.trend_15m.pct },
            },

            funding: {
                status: fundingMeta.status,
                has_data: fundingMeta.has_data,
                reason: fundingMeta.reason ?? fundingReasonExtra,
                source: fundingMeta.source,
                integrity: { s5: fundingMeta.integrity.s5, s15: fundingMeta.integrity.s15 },
                now: fundingMeta.now,
                trend_5m: { dir: fundingMeta.trend_5m.dir, pct: fundingMeta.trend_5m.pct },
                trend_15m: { dir: fundingMeta.trend_15m.dir, pct: fundingMeta.trend_15m.pct },
            },

            crowd: {
                side: crowdTrap.crowd,
                trapped: crowdTrap.trapped,
                crowd_th: crowdTrap.crowdTH,
                trapped_th: crowdTrap.trappedTH,
                note: crowdTrap.note,
            },
        },

        states: {
            sweep_5m: sweep.state,
            rejection_15m: rej15.state,
            confirm_1h: conf1h.state,
            plan_state: planState,
        },

        plan_status_state: planStatusState,

        debug: {
            persisted: { state: PATHS.state, plan_status: PATHS.status, mirror_public: MIRROR_PLAN_STATUS_TO_PUBLIC ? PATHS.statusPublic : null },
            mirror_history: MIRROR_PLAN_HISTORY_TO_PUBLIC ? PATHS.historyPublic : null,
        },

        explain_th: explainTH,
    });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Unknown error in plan-status";
        console.error("[/api/plan-status] Unexpected error:", message);

        return safeJsonErrorResponse(
            err,
            {
                code: "PLAN_STATUS_FAILED",
                fallbackMessage: "Unable to build plan status from runtime source-of-truth",
                status: "ERROR",
                severity: "critical",
                warnings: ["Plan status route returned a safe fallback payload"],
                nextActions: [
                    "Check BINGX_AGENT_DIR points to project runtime root",
                    "Verify latest_decision.json and market_snapshot.json",
                    "Run /api/runtime-audit",
                ],
                extra: {
                    noExchangeApiCalls: true,
                    noOrderPlacement: true,
                    phase: "M-0I",
                },
            },
            200
        );
    }
}
