import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GOAL (D): endpoint ส่ง has_data/reason แบบ “มาตรฐาน”
 * - ทุก field ที่เป็น series (oi/funding) จะมี: status, has_data, reason, source, integrity, now, trend_5m, trend_15m
 * - ถ้าไฟล์หาย/parse พัง/series ว่าง → ไม่ throw แต่ส่ง reason ชัด ๆ ให้ UI แสดงแบบเดียวกันทุก field
 */

type Candle = {
    t: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume?: number;
};

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

async function readJsonSafe<T>(
    p: string
): Promise<{ ok: true; value: T } | { ok: false; reason: string }> {
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

async function appendJsonl(p: string, obj: any) {
    const line = JSON.stringify(obj) + "\n";
    await fs.appendFile(p, line, "utf8");
}

/**
 * Next รันจาก /dashboard แต่ไฟล์ json อยู่ root (ข้าง server.cjs)
 * หา dir ให้เอง + รองรับ env BINGX_DATA_DIR
 */
async function resolveDataDir() {
    const envDir = process.env.BINGX_DATA_DIR?.trim();
    const candidates = [envDir, process.cwd(), path.resolve(process.cwd(), ".."), path.resolve(process.cwd(), "../..")].filter(
        Boolean
    ) as string[];

    for (const dir of candidates) {
        const probe = path.join(dir, "latest_decision.json");
        if (await fileExists(probe)) return dir;
    }
    return process.cwd();
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
    const { sweepUpSeen, rejectionConfirmed, close5m, zoneHigh, oiNow, oiAtSweep, oiTrend5, oiTrend15, fundNow, fundTrend5 } =
        params;

    let crowd: "LONGS" | "SHORTS" | "MIXED" | "UNKNOWN" = "UNKNOWN";
    if (fundNow !== null) {
        if (fundNow > 0) crowd = "LONGS";
        else if (fundNow < 0) crowd = "SHORTS";
    }

    let trapped: "LONGS_TRAPPED" | "SHORTS_TRAPPED" | "NONE" | "UNKNOWN" = "UNKNOWN";

    const oiAdded = oiTrend5.dir === "UP" || oiTrend15.dir === "UP";
    const fundSupportsLong = fundNow !== null && fundNow > 0;
    const fundSupportsShort = fundNow !== null && fundNow < 0;

    const priceFailed = close5m !== null && close5m < zoneHigh;
    const oiUnwindFromSweep =
        oiNow !== null && oiAtSweep !== null ? ((oiNow - oiAtSweep) / (Math.abs(oiAtSweep) < 1e-9 ? 1 : oiAtSweep)) * 100 : null;

    if (sweepUpSeen && rejectionConfirmed && priceFailed) {
        if (fundSupportsLong && oiAdded) trapped = "LONGS_TRAPPED";
        else if (fundSupportsShort && oiAdded) trapped = "SHORTS_TRAPPED";
        else trapped = "NONE";
    } else {
        trapped = "NONE";
    }

    const crowdTH =
        crowd === "LONGS"
            ? "ฝั่ง Long หนา"
            : crowd === "SHORTS"
                ? "ฝั่ง Short หนา"
                : crowd === "MIXED"
                    ? "คนกระจายหลายฝั่ง"
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

export async function GET() {
    const dataDir = await resolveDataDir();

    const decisionPath = path.join(dataDir, "latest_decision.json");
    const volPath = path.join(dataDir, "volatility_baseline_cache.json");
    const klinesPath = path.join(dataDir, "klines.json");

    const derivHistPath = path.join(dataDir, "derivatives_history_cache.json");
    const oiHistPath = path.join(dataDir, "oi_history_cache.json"); // fallback

    const logPath = path.join(dataDir, "plan_status_log.jsonl");
    const statePath = path.join(dataDir, "plan_status_state.json");

    // --- Decision (fatal if missing) ---
    const decisionRead = await readJsonSafe<any>(decisionPath);
    if (!decisionRead.ok) {
        return NextResponse.json({ ok: false, error: `latest_decision.json:${decisionRead.reason}`, dir: dataDir }, { status: 500 });
    }
    const decision = decisionRead.value;
    const modeLock = normalizeModeLock(decision);

    // --- load previous state ---
    let prevStateObj: any = null;
    let prevState: string | null = null;
    let prevModeLock: "NO_TRADE" | "GRID" | "TREND" | null = null;

    if (await fileExists(statePath)) {
        const stRead = await readJsonSafe<any>(statePath);
        if (stRead.ok) {
            prevStateObj = stRead.value ?? null;
            prevState = stRead.value?.plan_state ?? null;
            prevModeLock = stRead.value?.decision_mode_lock ?? null;
        }
    }
    const modeChanged = prevModeLock !== null && prevModeLock !== modeLock;

    // --- candles source ---
    const storeRead = (await fileExists(volPath)) ? await readJsonSafe<any>(volPath) : await readJsonSafe<any>(klinesPath);
    const store = storeRead.ok ? storeRead.value : null;

    const sym = "BTC-USDT";
    const raw5m: Candle[] = store?.symbols?.[sym]?.raw_5m?.series ?? [];
    const agg1h: Candle[] = store?.symbols?.[sym]?.agg_1h?.series ?? [];
    const sourceUpdatedAt = toMs(toNumber(store?.symbols?.[sym]?.raw_5m?.last_sample_time) ?? null);

    const last5m = last(raw5m);
    const last1h = last(agg1h);

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
        freshness: derivFresh,
    };

    const fundingSource: SeriesSource = {
        file: derivPrimaryFile,
        keypath: "symbols[BTC-USDT].funding/*",
        updated_at: derivUpdatedAtMs,
        freshness: derivFresh,
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

    const oiAtSweep = sweep?.event?.t
        ? nearestValueAt(derivBundle.oi5, sweep.event.t) ?? nearestValueAt(derivBundle.oi15, sweep.event.t)
        : null;

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

        const inZone = lastClose5m! >= zoneLow! && lastClose5m! <= zoneHigh!;
        steps.push({
            id: "trend_wait_zone",
            title: `รอราคาเข้าโซน ${fmt(zoneLow, 0)}–${fmt(zoneHigh, 0)}`,
            status: inZone ? "PASS" : "WAITING",
            why: inZone ? `ราคา ${fmt(lastClose5m, 0)} อยู่ในโซนแล้ว` : `ราคา ${fmt(lastClose5m, 0)} ยังไม่เข้าโซน`,
            data: { lastClose5m, zoneLow, zoneHigh },
        });

        const closeAbove = lastClose5m! > confirmLine!;
        let confirmTs = prevConfirmTs ?? null;

        // ล็อก confirm เมื่อ "เข้าโซน" และ "5m ปิดเหนือ confirm"
        if (!confirmTs && inZone && closeAbove && lastTime5m != null) {
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
        steps.push({
            id: "trend_5m_hl",
            title: "ต้องเห็น 5m ทำ Higher Low (HL)",
            status: hlOk ? "PASS" : "WAITING",
            why: hlWhy,
        });

        // OI
        let oiOk = false;
        let oiWhy = "ยังไม่เริ่ม (ต้องมี confirm ก่อน)";
        if (confirmTs != null) {
            const r = oiIncreasingAfter(oi5, confirmTs);
            oiOk = r.ok;
            oiWhy = r.why;
        }
        steps.push({
            id: "trend_oi_confirm",
            title: "เช็ก OI: หลัง confirm ต้องเริ่มเพิ่ม",
            status: oiOk ? "PASS" : "WAITING",
            why: oiWhy,
        });

        const canEnter1 = inZone && closeAbove && hlOk && oiOk;
        steps.push({
            id: "trend_entry_1",
            title: "เข้าไม้ 1 (Probe เล็ก)",
            status: entry1Done ? "DONE" : canEnter1 ? "WAITING" : "WAITING",
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
        } else if (inZone) {
            code = "TREND_IN_ZONE_WAIT_CONFIRM";
            headline = "ราคาเข้าโซนแล้ว — รอ 5m ปิดเหนือโซน";
        }

        // next_actions
        if (hardFail) {
            next_actions.push("หยุดขาดทุนตามแผน (Hard SL)");
            next_actions.push("รอ snapshot ใหม่เพื่อ re-evaluate");
        } else if (!inZone) {
            next_actions.push(`รอราคาเข้าพื้นที่ซื้อ ${fmt(zoneLow, 0)}–${fmt(zoneHigh, 0)}`);
            next_actions.push("ห้าม FOMO ไล่ราคา");
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
                trend_in_zone: inZone ? "IN_ZONE" : "OUT_ZONE",
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

        state: {
            code: string;
            headline: string;
            direction_hint: string;
            confidence: number | null;
            [k: string]: any;
        };

        signals?: {
            sweep_5m?: string;
            rejection_15m?: string;
            breakout_1h?: string;
            [k: string]: any;
        };

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
        if (s.includes("UNDECIDED")) return "WARN";
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
            return [
                "รอ 1H ปิดยืนยันว่าเป็น fakeout (กลับเข้า range) หรือ breakout (ยืนเหนือโซนบน)",
                "ถ้า 1H ยืนเหนือ → ลด/พัก grid และให้ agent สรุปใหม่",
            ];
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
    const ageSec = sourceUpdatedAt ? Math.max(0, Math.floor((Date.now() - (toMs(sourceUpdatedAt) ?? Date.now())) / 1000)) : null;

    const decisionMode = String(decision?.market_mode ?? "").toUpperCase();

    // ✅ ใช้ตัวเดียวทั้งไฟล์ ห้ามประกาศซ้ำ
    let planStatusState: PlanStatusState;

    if (decisionMode === "TREND_UP" || modeLock === "TREND") {
        planStatusState = buildTrendUpPlanStatus({
            decision,
            raw5m,
            last5m,
            last1h,
            oi5: derivBundle.oi5,
            prevStateObj,
        }) as PlanStatusState;

        planState = String(planStatusState?.state?.code ?? planState);
        explainTH = String(planStatusState?.state?.headline ?? explainTH);
    } else {
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
            modeLock === "NO_TRADE" ? "MODE_LOCKED_NO_TRADE" : planState === "BREAKOUT_CONFIRMED_SWITCH_MODE" ? "BREAKOUT_SWITCH_MODE" : "GRID_SWEEP_PIPELINE";

        planStatusState = {
            generated_at: generatedAtISO,
            age_sec: ageSec,
            price: { close_5m: last5m?.close ?? null, close_1h: last1h?.close ?? null },
            plan: {
                market_regime: decision?.market_regime ?? decision?.regime ?? "UNKNOWN",
                market_mode: decision?.market_mode ?? "UNKNOWN",
                sweep_zone_up: { low: sweepZoneLow, high: sweepZoneHigh },
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

    // ---------------- Persist + Logs ----------------
    const shouldWriteState = prevState !== planState || prevModeLock !== modeLock;

    const nextStateObj = {
        ...(prevStateObj ?? {}),
        plan_state: planState,
        decision_mode_lock: modeLock,
        t: Date.now(),
        ...(planStatusState ? { plan_status_state: planStatusState } : {}),
    };

    if (shouldWriteState) {
        await fs.writeFile(statePath, JSON.stringify(nextStateObj, null, 2), "utf8");

        if (prevModeLock !== modeLock) {
            await appendJsonl(logPath, {
                t: Date.now(),
                symbol: sym,
                type: "MODE_SWITCH",
                from: prevState,
                to: planState,
                from_mode: prevModeLock,
                to_mode: modeLock,
                to_plan_state: planState,
                price: { close_5m: last5m?.close ?? null },
                deriv: {
                    oi5_dir: oiMeta.trend_5m.dir,
                    oi5_pct: Number(oiMeta.trend_5m.pct.toFixed(3)),
                    fund5_dir: fundingMeta.trend_5m.dir,
                    fund5_pct: Number(fundingMeta.trend_5m.pct.toFixed(3)),
                    crowd: crowdTrap.crowd,
                    trapped: crowdTrap.trapped,
                },
                explain_th: `เปลี่ยนโหมด ${String(prevModeLock ?? "—")} → ${String(modeLock)}`,
            });
        }

        if (prevState !== planState) {
            await appendJsonl(logPath, {
                t: Date.now(),
                symbol: sym,
                type: "STATE_CHANGE",
                from: prevState,
                to: planState,
                mode_lock: modeLock,
                price: { close_5m: last5m?.close ?? null },
                sweep: sweep.event ?? null,
                deriv: {
                    oi5_dir: oiMeta.trend_5m.dir,
                    oi5_pct: Number(oiMeta.trend_5m.pct.toFixed(3)),
                    fund5_dir: fundingMeta.trend_5m.dir,
                    fund5_pct: Number(fundingMeta.trend_5m.pct.toFixed(3)),
                    crowd: crowdTrap.crowd,
                    trapped: crowdTrap.trapped,
                },
                explain_th: explainTH,
            });
        }
    } else {
        if (planStatusState) {
            await fs.writeFile(statePath, JSON.stringify(nextStateObj, null, 2), "utf8");
        }
    }

    // ---------------- Response ----------------
    return NextResponse.json({
        ok: true,
        data_dir: dataDir,
        symbol: sym,

        updated_at: Date.now(),
        source_updated_at: sourceUpdatedAt ?? null,

        mode_lock: { value: modeLock, changed: modeChanged },

        price: { close_5m: last5m?.close ?? null, close_1h: last1h?.close ?? null },

        plan: {
            market_regime: decision?.market_regime ?? decision?.regime ?? "UNKNOWN",
            market_mode: decision?.market_mode ?? "UNKNOWN",
            grid: { upper: gridUpper, lower: gridLower, count: decision?.parameters_for_grid_or_trend?.grid_count ?? null },
            sweep_target: { side: "UP", zone: [sweepZoneLow, sweepZoneHigh] },
            risk_warning: decision?.risk_warning ?? [],
            confidence: decision?.confidence ?? null,
        },

        derivatives: {
            updated_at: derivUpdatedAtMs,
            freshness: derivFresh,

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

            crowd: { side: crowdTrap.crowd, trapped: crowdTrap.trapped, crowd_th: crowdTrap.crowdTH, trapped_th: crowdTrap.trappedTH, note: crowdTrap.note },
        },

        states: { sweep_5m: sweep.state, rejection_15m: rej15.state, confirm_1h: conf1h.state, plan_state: planState },

        plan_status_state: planStatusState,

        debug: {
            sweep_event: sweep.event,
            rejection_score: rej15.score,
            rejection_why: rej15.why,
            confirm_why: conf1h.why,
            deriv_primary: { file: derivPrimaryFile, reason: derivPrimaryReason },
            oi_fallback: { used: oiFallbackUsed, reason: oiFallbackReason },
        },

        explain_th: explainTH,
    });
}
