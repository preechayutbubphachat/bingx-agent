// C:\bingx-agent\run_latest_decision.cjs
// Deterministic Market Decision Engine (No LLM)
// Reads: market_snapshot.json + (optional) news_context.json
// Writes: latest_decision.json (legacy + agent-like fields in ONE file)

const fs = require("fs/promises");
const path = require("path");

const args = new Set(process.argv.slice(2));
const NO_NEWS = args.has("--no-news") || process.env.NO_NEWS === "1";

const BASE_DIR = "C:\\bingx-agent";
const SNAP_PATH =
    process.env.SNAPSHOT_PATH || path.join(BASE_DIR, "market_snapshot.json");
const NEWS_PATH =
    process.env.NEWS_PATH || path.join(BASE_DIR, "news_context.json");

const OUT_PATH =
    process.env.OUT_PATH || path.join(BASE_DIR, "latest_decision.json");

function getPath(obj, p) {
    try {
        return p.split(".").reduce((acc, k) => (acc == null ? undefined : acc[k]), obj);
    } catch {
        return undefined;
    }
}
function pick(obj, paths) {
    for (const p of paths) {
        const v = getPath(obj, p);
        if (v !== undefined && v !== null && v !== "") return v;
    }
    return undefined;
}
function num(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
}
function clamp01(x) {
    if (!Number.isFinite(x)) return 0;
    return Math.max(0, Math.min(1, x));
}
function nowIso() {
    return new Date().toISOString();
}

function normalizeCandles(raw) {
    if (!Array.isArray(raw)) return [];
    return raw
        .map((r) => ({
            time: Number(r.time ?? r.t),
            open: Number(r.open ?? r.o),
            high: Number(r.high ?? r.h),
            low: Number(r.low ?? r.l),
            close: Number(r.close ?? r.c),
            volume: Number(r.volume ?? r.v ?? 0),
        }))
        .filter(
            (x) =>
                [x.open, x.high, x.low, x.close].every((n) => Number.isFinite(n)) &&
                Number.isFinite(x.time)
        )
        .sort((a, b) => a.time - b.time);
}

function computeSwingHL(candles, lookback = 160) {
    const arr = candles.slice(-lookback);
    if (arr.length < 10) return { swingHigh: null, swingLow: null, lastClose: null };
    let hi = -Infinity;
    let lo = Infinity;
    for (const k of arr) {
        if (k.high > hi) hi = k.high;
        if (k.low < lo) lo = k.low;
    }
    const lastClose = arr[arr.length - 1].close;
    return {
        swingHigh: Number.isFinite(hi) ? hi : null,
        swingLow: Number.isFinite(lo) ? lo : null,
        lastClose: Number.isFinite(lastClose) ? lastClose : null,
    };
}

function midpoint(a, b) {
    if (a == null || b == null) return null;
    return (a + b) / 2;
}

function scoreMode({
    slopePct,
    distFromEQ,
    bbwRatio,
    sessionSweep,
    falseBreak,
    newsRisk,
    crowding,
    volState,
}) {
    let s = 0.35;
    s += Math.min(0.40, Math.abs(slopePct) * 10);
    s += Math.min(0.15, distFromEQ * 10);

    if (Number.isFinite(bbwRatio)) {
        if (bbwRatio > 1.20) s += 0.08;
        else if (bbwRatio < 0.80) s -= 0.06;
    }

    if (sessionSweep === "VERY_HIGH") s -= 0.18;
    else if (sessionSweep === "HIGH") s -= 0.12;

    if (falseBreak === "HIGH") s -= 0.08;
    if (newsRisk === "HIGH") s -= 0.12;
    if (crowding === "CROWDED_LONG" || crowding === "CROWDED_SHORT") s -= 0.08;
    if (volState === "EXTREME") s -= 0.10;

    return clamp01(s);
}

function decideDir(slopePct) {
    if (slopePct > 0.002) return "UP";
    if (slopePct < -0.002) return "DOWN";
    return null;
}

function slopeToTrend(slope, eps = 0.000001) {
    const n = num(slope);
    if (n == null) return "UNKNOWN";
    if (Math.abs(n) <= eps) return "FLAT";
    return n > 0 ? "UP" : "DOWN";
}

function normalizeRisk(s) {
    const v = String(s || "UNKNOWN").toUpperCase();
    if (v === "LOW" || v === "MED" || v === "MEDIUM" || v === "HIGH") {
        return v === "MEDIUM" ? "MED" : v;
    }
    return "UNKNOWN";
}

function buildRiskOverlay(news) {
    if (NO_NEWS) {
        return {
            crypto_news_risk: "SKIPPED",
            has_hot_news: false,
            macro_risk: "UNKNOWN",
            events: [],
            headlines: [],
            notes: ["news skipped (--no-news)"],
        };
    }

    const risk = normalizeRisk(pick(news, ["risk_level", "riskOverlay.risk_level"]));
    const hasHot = Boolean(pick(news, ["has_hot_news", "riskOverlay.has_hot_news"]));
    const macro = normalizeRisk(pick(news, ["macro_risk", "riskOverlay.macro_risk"]));

    const eventsRaw = pick(news, ["events", "riskOverlay.events"]);
    const headlinesRaw = pick(news, ["headlines", "riskOverlay.headlines", "top_headlines"]);

    const events = Array.isArray(eventsRaw)
        ? eventsRaw
            .map((e) => ({
                key: String(e?.key ?? e?.id ?? "UNKNOWN"),
                window: String(e?.window ?? e?.time_window ?? "UNKNOWN"),
                title: String(e?.title ?? e?.name ?? ""),
            }))
            .filter((x) => x.title || x.key !== "UNKNOWN")
        : [];

    const headlines = Array.isArray(headlinesRaw)
        ? headlinesRaw
            .map((h) => ({
                title: String(h?.title ?? ""),
                source: String(h?.source ?? h?.publisher ?? ""),
                published_at: String(h?.published_at ?? h?.publishedAt ?? h?.time ?? nowIso()),
                sentiment: String(h?.sentiment ?? h?.tone ?? "mixed"),
                is_important: Boolean(h?.is_important ?? h?.important ?? false),
            }))
            .filter((x) => x.title)
        : [];

    const notesRaw = pick(news, ["notes", "riskOverlay.notes"]);
    const notes = Array.isArray(notesRaw) ? notesRaw.map((x) => String(x)) : [];

    return {
        crypto_news_risk: risk,
        has_hot_news: hasHot,
        macro_risk: macro,
        events,
        headlines,
        notes,
    };
}

function buildDerivativesSchema(snapshot) {
    const crowding = String(
        pick(snapshot, ["derivatives.signals.combined.crowding"]) || "UNKNOWN"
    ).toUpperCase();
    const trapped = String(
        pick(snapshot, ["derivatives.signals.combined.trapped"]) || "NONE"
    ).toUpperCase();

    const oiOk = pick(snapshot, ["derivatives.openInterest.ok"]);
    const oiReason = String(pick(snapshot, ["derivatives.openInterest.reason"]) || "");
    const oiNow = num(
        pick(snapshot, [
            "derivatives.openInterest.now",
            "derivatives.openInterest.value",
            "derivatives.openInterest.lastOpenInterest",
            "derivatives.openInterest.openInterest",
        ])
    );

    const oiSlope5 = num(pick(snapshot, ["derivatives.signals.openInterest.slope_5m"]));
    const oiSlope15 = num(pick(snapshot, ["derivatives.signals.openInterest.slope_15m"]));

    const fundingNow = num(
        pick(snapshot, [
            "derivatives.funding.lastFundingRate",
            "derivatives.funding.now",
            "derivatives.funding.value",
        ])
    );
    const fundSlope5 = num(pick(snapshot, ["derivatives.signals.funding.slope_5m"]));
    const fundSlope15 = num(pick(snapshot, ["derivatives.signals.funding.slope_15m"]));

    const oiHas = oiOk === false ? false : oiNow != null;
    const oiStatus =
        oiOk === false
            ? (oiReason.includes("NOT_SUPPORTED") ? "NOT_SUPPORTED" : "MISSING")
            : (oiHas ? "OK" : "MISSING");

    const fundHas = fundingNow != null;
    const fundStatus = fundHas ? "OK" : "MISSING";

    return {
        oi: {
            status: oiStatus,
            has_data: Boolean(oiHas),
            reason: oiOk === false ? oiReason : (oiHas ? "" : "missing oi value"),
            source: String(pick(snapshot, ["derivatives.openInterest.source"]) || "snapshot"),
            integrity: oiHas ? "GOOD" : "UNKNOWN",
            now: oiNow ?? 0,
            trend_5m: slopeToTrend(oiSlope5),
            trend_15m: slopeToTrend(oiSlope15),
            crowd: crowding || "UNKNOWN",
            trapped: trapped || "NONE",
        },
        funding: {
            status: fundStatus,
            has_data: Boolean(fundHas),
            reason: fundHas ? "" : "missing funding value",
            source: String(pick(snapshot, ["derivatives.funding.source"]) || "snapshot"),
            integrity: fundHas ? "GOOD" : "UNKNOWN",
            now: fundingNow ?? 0,
            trend_5m: slopeToTrend(fundSlope5),
            trend_15m: slopeToTrend(fundSlope15),
        },
    };
}

/**
 * LEGACY output (ต้องคงเดิม 100% สำหรับ UI เดิม)
 */
function buildLegacyOutput(snapshot, news) {
    const risk_warning = [];
    const reason = {
        indicator: "",
        derivatives: "",
        session: "",
        news: "",
        smc: "",
        momentum: "",
        price_action: "",
        orderbook: "",
    };

    const h1CandlesRaw =
        snapshot?.market_data?.klines?.["1H"]?.candles ||
        snapshot?.market_data?.klines?.["1h"]?.candles ||
        [];

    const h1 = normalizeCandles(h1CandlesRaw);
    const { swingHigh, swingLow, lastClose } = computeSwingHL(h1, 160);
    const eq = midpoint(swingHigh, swingLow);

    let slopePct = 0;
    if (h1.length >= 30) {
        const a = h1[h1.length - 25]?.close;
        const b = h1[h1.length - 1]?.close;
        if (Number.isFinite(a) && Number.isFinite(b) && a !== 0) slopePct = (b - a) / a;
    }

    const distFromEQ =
        lastClose != null && eq != null ? Math.abs(lastClose - eq) / Math.max(1, eq) : 0;

    const atr1h = num(pick(snapshot, ["volatility.now.atr_1h"]));
    const bbw1h = num(pick(snapshot, ["volatility.now.bbw_1h"]));
    const bbwRatio = num(pick(snapshot, ["volatility.relative.bbw_ratio"]));
    const volState = String(pick(snapshot, ["volatility.relative.vol_state"]) || "UNKNOWN").toUpperCase();

    const sessionSweep = String(
        pick(snapshot, ["meta.session.risk_overlay.liquidity_sweep_probability"]) || "UNKNOWN"
    ).toUpperCase();
    const falseBreak = String(
        pick(snapshot, ["meta.session.risk_overlay.false_breakout_risk"]) || "UNKNOWN"
    ).toUpperCase();

    const obImb = num(pick(snapshot, ["market_data.orderbook.imbalance"]));

    const funding = num(pick(snapshot, ["derivatives.funding.lastFundingRate"]));
    const oiOk = pick(snapshot, ["derivatives.openInterest.ok"]);
    const oiReason = pick(snapshot, ["derivatives.openInterest.reason"]) || "";
    const missingOI = oiOk === false;

    const crowding = String(pick(snapshot, ["derivatives.signals.combined.crowding"]) || "NEUTRAL").toUpperCase();
    const oiSlope15 = num(pick(snapshot, ["derivatives.signals.openInterest.slope_15m"]));
    const fundSlope15 = num(pick(snapshot, ["derivatives.signals.funding.slope_15m"]));

    const newsRisk = String(pick(news, ["risk_level", "riskOverlay.risk_level"]) || "UNKNOWN").toUpperCase();
    const hasHot = Boolean(pick(news, ["has_hot_news", "riskOverlay.has_hot_news"]));

    reason.indicator = `1H slope≈${(slopePct * 100).toFixed(2)}%, ATR_1H=${atr1h ?? "NA"}, BBW_1H=${bbw1h ?? "NA"}, vol_state=${volState}`;
    reason.session = `Session: sweep=${sessionSweep}, false_breakout=${falseBreak} → เน้นกติกา CONFIRM กันไส้หลอก`;
    reason.news = NO_NEWS
        ? `News skipped (--no-news)`
        : `News risk=${newsRisk}${hasHot ? " (มีข่าวร้อน)" : ""}`;

    if (funding == null) {
        reason.derivatives = `Funding: ไม่มีตัวเลข funding snapshot`;
        risk_warning.push("missing funding snapshot numbers");
    } else {
        reason.derivatives = `Funding last=${funding}; crowding=${crowding}; oiSlope15=${oiSlope15 ?? "NA"} fundSlope15=${fundSlope15 ?? "NA"}`;
    }

    if (missingOI) {
        reason.derivatives += `; OI=NOT_SUPPORTED (${oiReason || "no OI"})`;
        risk_warning.push("missing open interest snapshot numbers (NOT_SUPPORTED)");
    }

    if (obImb == null) {
        reason.orderbook = `Orderbook: missing imbalance`;
        risk_warning.push("missing orderbook imbalance");
    } else {
        reason.orderbook = `Orderbook imbalance=${obImb.toFixed(3)}`;
    }

    if (swingHigh == null || swingLow == null || lastClose == null) {
        risk_warning.push("missing/insufficient 1H candles for swing detection");
        reason.smc = `SMC: 1H candles ไม่พอ → swing null`;
    } else {
        reason.smc = `SMC: swing_low≈${Math.round(swingLow)}, swing_high≈${Math.round(swingHigh)}, EQ≈${Math.round(eq)}`;
        reason.price_action = `Price: last_close≈${Math.round(lastClose)} (${lastClose >= eq ? "เหนือ" : "ใต้"} EQ)`;
    }

    const dir = decideDir(slopePct);
    const trendScore = scoreMode({
        slopePct,
        distFromEQ,
        bbwRatio,
        sessionSweep,
        falseBreak,
        newsRisk: (!NO_NEWS && newsRisk === "HIGH") ? "HIGH" : "LOW",
        crowding,
        volState,
    });

    let market_mode = "GRID_NEUTRAL";
    if (dir && trendScore >= 0.58) market_mode = dir === "UP" ? "TREND_UP" : "TREND_DOWN";

    let confidence = 0.30 + trendScore * 0.55;
    if (!NO_NEWS && newsRisk === "HIGH") confidence -= 0.06;
    if (sessionSweep === "VERY_HIGH") confidence -= 0.07;
    if (sessionSweep === "HIGH") confidence -= 0.04;
    if (crowding.startsWith("CROWDED")) confidence -= 0.04;
    if (!NO_NEWS && hasHot) confidence -= 0.03;
    confidence = clamp01(confidence);

    const levels = {
        trend: {
            dir: dir,
            pullback_zone: null,
            invalidation: null,
            trigger_rule: "",
            targets: { t1: null, t2: null },
            entry: { type: "CONFIRM", hint: "" },
        },
        smc: {
            swing_high_1h: swingHigh,
            swing_low_1h: swingLow,
            eq_1h: eq,
            liquidity_note: "",
        },
    };

    const params = {
        grid_upper: null,
        grid_lower: null,
        grid_count: null,
        trend_entry: null,
        trend_sl: null,
        trend_tp: null,
    };

    if (swingHigh != null && swingLow != null && eq != null) {
        levels.smc.liquidity_note =
            `สนามหลัก ${Math.round(swingLow)}–${Math.round(swingHigh)}; EQ≈${Math.round(eq)} คือจุดปะทะ; ` +
            `ระวัง sweep ใต้/เหนือกรอบก่อนเลือกทาง`;
    } else {
        levels.smc.liquidity_note = "ข้อมูลไม่พอสำหรับสรุปสภาพคล่อง";
    }

    const atr =
        atr1h != null
            ? atr1h
            : (swingHigh != null && swingLow != null ? (swingHigh - swingLow) * 0.02 : 500);

    if (market_mode === "TREND_UP" && swingLow != null && swingHigh != null && eq != null) {
        const zl = Math.max(swingLow, eq - atr * 2);
        const zh = Math.min(swingHigh, eq + atr * 2);
        levels.trend.pullback_zone = [Math.round(zl), Math.round(zh)];
        levels.trend.invalidation = Math.round(swingLow - atr * 1.5);
        levels.trend.targets.t1 = Math.round(swingHigh);
        levels.trend.targets.t2 = null;
        levels.trend.trigger_rule =
            "รอราคาย่อเข้าโซนแล้วให้ 5m ยืนยันกลับขึ้น (ปิดเหนือโซน/ทำ HL) ก่อนเข้า";
        levels.trend.entry.hint =
            `เน้น CONFIRM; crowding=${crowding}. ` +
            `${funding != null && funding > 0 ? "ถ้า funding ฝั่ง long ร้อน → ห้าม FOMO" : "รอแท่งยืนยันกัน sweep"}`;

        params.trend_entry = Math.round(eq);
        params.trend_sl = levels.trend.invalidation;
        params.trend_tp = levels.trend.targets.t1;
    } else if (market_mode === "TREND_DOWN" && swingLow != null && swingHigh != null && eq != null) {
        const zl = Math.max(swingLow, eq - atr * 2);
        const zh = Math.min(swingHigh, eq + atr * 2);
        levels.trend.pullback_zone = [Math.round(zl), Math.round(zh)];
        levels.trend.invalidation = Math.round(swingHigh + atr * 1.5);
        levels.trend.targets.t1 = Math.round(swingLow);
        levels.trend.targets.t2 = null;
        levels.trend.trigger_rule =
            "รอราคาย่อเข้าโซนแล้วให้ 5m ยืนยันกลับลง (ปิดต่ำกว่าโซน/ทำ LH) ก่อนเข้า";
        levels.trend.entry.hint =
            `เน้น CONFIRM; crowding=${crowding}. ` +
            `${funding != null && funding < 0 ? "ถ้า funding ฝั่ง short ร้อน → ห้าม FOMO" : "รอแท่งยืนยันกัน sweep"}`;

        params.trend_entry = Math.round(eq);
        params.trend_sl = levels.trend.invalidation;
        params.trend_tp = levels.trend.targets.t1;
    } else {
        levels.trend.dir = null;
        levels.trend.pullback_zone = null;
        levels.trend.invalidation = null;
        levels.trend.targets = { t1: null, t2: null };
        levels.trend.trigger_rule =
            "ตอนนี้ยังไม่เข้าเงื่อนไข TREND_UP/TREND_DOWN ชัดเจน → เล่นกรอบ/รอ sweep-then-confirm แทน";
        levels.trend.entry = {
            type: "CONFIRM",
            hint: "โหมดกรอบ: รอแตะขอบกรอบแล้วให้ 5m ยืนยันกลับเข้ากรอบก่อนเข้า",
        };

        if (swingHigh != null && swingLow != null) {
            params.grid_upper = Math.round(swingHigh);
            params.grid_lower = Math.round(swingLow);

            const density = String(pick(snapshot, ["execution_tuning.grid_density"]) || "MED").toUpperCase();
            const baseCount = density === "HIGH" ? 16 : density === "LOW" ? 8 : 12;
            params.grid_count = baseCount;
        } else {
            risk_warning.push("grid bounds unavailable (missing swings)");
        }
    }

    if (sessionSweep === "VERY_HIGH") risk_warning.push("liquidity sweep probability VERY_HIGH");
    else if (sessionSweep === "HIGH") risk_warning.push("liquidity sweep probability high");
    if (falseBreak === "HIGH") risk_warning.push("false breakout risk high");
    if (!NO_NEWS && newsRisk === "HIGH") risk_warning.push("news risk high");
    if (crowding.startsWith("CROWDED")) risk_warning.push(`crowding=${crowding}`);

    reason.momentum = `trendScore≈${trendScore.toFixed(2)} dir=${dir ?? "RANGE"} crowding=${crowding}`;

    const summary_for_bot =
        `• ภาพรวม: โหมด ${market_mode} (confidence≈${confidence.toFixed(2)})\n` +
        `• โครงสร้างราคา: swing ${swingLow ? Math.round(swingLow) : "NA"}–${swingHigh ? Math.round(swingHigh) : "NA"}; EQ≈${eq ? Math.round(eq) : "NA"}\n` +
        `• กติกาเข้า: ${levels.trend.entry.type} — ${levels.trend.trigger_rule}\n` +
        `• Risk: sweep=${sessionSweep}, false_break=${falseBreak}, news=${NO_NEWS ? "SKIPPED" : newsRisk}, crowding=${crowding}`;

    return {
        market_mode,
        confidence: Number(confidence.toFixed(2)),
        levels,
        parameters_for_grid_or_trend: params,
        reason,
        risk_warning,
        summary_for_bot,
    };
}

async function readJsonSafe(filePath) {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw);
}

async function writeJsonAtomic(filePath, obj) {
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
    const tmp = filePath + ".tmp";
    await fs.writeFile(tmp, JSON.stringify(obj, null, 2), "utf8");
    await fs.rename(tmp, filePath);
}

async function main() {
    let snapshot = {};
    let news = {};

    try { snapshot = await readJsonSafe(SNAP_PATH); } catch { snapshot = {}; }

    if (!NO_NEWS) {
        try { news = await readJsonSafe(NEWS_PATH); } catch { news = {}; }
    }

    // 1) legacy output (UI-safe)
    const legacyOut = buildLegacyOutput(snapshot, news);

    // 2) agent-like additions (do NOT overwrite legacy.reason)
    const generated_at = nowIso();
    const symbol = String(pick(snapshot, ["meta.symbol"]) || "BTC-USDT");
    const regime =
        pick(snapshot, ["market_regime.status"]) ||
        pick(snapshot, ["market_regime"]) ||
        null;

    const risk_overlay = buildRiskOverlay(news);
    const derivatives = buildDerivativesSchema(snapshot);

    const reason_agent = {
        one_liner:
            `${legacyOut.market_mode} | conf=${Number(legacyOut.confidence).toFixed(2)} | ` +
            `${legacyOut?.reason?.price_action || "price=NA"} | ` +
            `${NO_NEWS ? "news=SKIPPED" : `news=${risk_overlay.crypto_news_risk}`}`,
        bullets: [
            legacyOut?.reason?.indicator || "no indicators",
            legacyOut?.reason?.smc || "no smc",
            legacyOut?.levels?.trend?.trigger_rule || "no rule",
            (legacyOut?.risk_warning || []).slice(0, 3).join(" | ") || "no warnings",
        ].filter(Boolean),
    };

    // add warnings about missing files
    const mergedWarnings = new Set([...(legacyOut.risk_warning || [])]);
    if (!Object.keys(snapshot || {}).length) mergedWarnings.add("market_snapshot.json missing or unreadable");
    if (NO_NEWS) mergedWarnings.add("news skipped (--no-news)");
    if (!NO_NEWS && !Object.keys(news || {}).length) mergedWarnings.add("news_context.json missing or unreadable");
    legacyOut.risk_warning = Array.from(mergedWarnings);

    // 3) merge into ONE file (keep legacy keys intact)
    const merged = {
        ...legacyOut,

        // agent-like (additional top-level fields)
        schema_version: "agent_like_v1",
        generated_at,
        symbol,
        regime,
        risk_overlay,
        derivatives,
        reason_agent,

        extras: {},
    };

    await writeJsonAtomic(OUT_PATH, merged);
    console.log(`[OK] wrote ${OUT_PATH} | mode=${merged.market_mode} conf=${merged.confidence}`);
}

main().catch((err) => {
    console.error("[FATAL]", err);
    process.exit(1);
});
