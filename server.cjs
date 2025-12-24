// server.cjs (CommonJS)
// Cleaned + deterministic sorting for ALL TF + derivatives history cache embedded into market_snapshot.json under derivatives.history
// Adds: production-safe scheduler (setInterval) for derivatives history ONLY (premiumIndex + openInterest)
// Adds: Session Context (ASIA / LONDON / OVERLAP / NY / DEAD_ZONE) embedded into market_snapshot.json under meta.session
// Adds: Derivatives signals (OI/Funding deltas + slopes + divergence hints) under derivatives.signals for AI decision rules
// ✅ NEW: Volatility Baseline Cache (ATR/BBW) + Volatility State + Execution Tuning embedded into market_snapshot.json
// NOTE: Long lookback (5m/6h, 15m/24h) fills as the server samples over time.

require("dotenv").config();

const express = require("express");
const axios = require("axios");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = 3000;

const { buildNewsContext } = require("./routes/newsContext.cjs");
app.get("/build_news_context", buildNewsContext);

// ====================== CONFIG ======================

// KLINE (v3)
const BASE_URL_KLINE_V3 = "https://open-api.bingx.com/openApi/swap/v3/quote/klines";

// swap v2 quote (public)
const BASE_V2_QUOTE = "https://open-api.bingx.com/openApi/swap/v2/quote";

// Order Book depth (public)
const ORDERBOOK_URL = "https://open-api.bingx.com/openApi/swap/v2/quote/depth";

// Local cache file for derivatives history
const DERIV_HISTORY_CACHE_FILE = path.join(__dirname, "derivatives_history_cache.json");

// ✅ Local cache file for volatility baseline (ATR/BBW)
const VOL_BASELINE_CACHE_FILE = path.join(__dirname, "volatility_baseline_cache.json");

// ✅ Volatility history scheduler (similar to derivatives)
const VOL_SCHED_ENABLED = String(process.env.VOL_SCHED_ENABLED ?? "1") === "1";
const VOL_SCHED_SYMBOLS = String(process.env.VOL_SCHED_SYMBOLS ?? "BTC-USDT")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

// sample every 5 minutes
const VOL_SCHED_INTERVAL_MS = Number(process.env.VOL_SCHED_INTERVAL_MS ?? 5 * 60 * 1000);
const VOL_SCHED_JITTER_MS = Number(process.env.VOL_SCHED_JITTER_MS ?? 10 * 1000);
const VOL_SCHED_BACKOFF_MS = Number(process.env.VOL_SCHED_BACKOFF_MS ?? 30 * 1000);

// how many 5m candles to pull per tick (small & safe)
const VOL_SCHED_KLINE_LIMIT_5M = Number(process.env.VOL_SCHED_KLINE_LIMIT_5M ?? 120); // 10 hours (120*5m)

// caps (spec you asked)
const VOL_RAW_5M_CAP = Number(process.env.VOL_RAW_5M_CAP ?? 288); // 24h of 5m points
const VOL_AGG_1H_CAP = Number(process.env.VOL_AGG_1H_CAP ?? 200); // 200 hours

// Volatility baseline tuning
const VOL_BASELINE_CAP_1H = Number(process.env.VOL_BASELINE_CAP_1H ?? 336); // ~14 days of 1H points
const VOL_BASELINE_LOOKBACK_MS_1H = Number(
  process.env.VOL_BASELINE_LOOKBACK_MS_1H ?? 14 * 24 * 60 * 60 * 1000
);

// Embed execution tuning (grid spacing/density/risk)
const EXEC_TUNING_ENABLED = String(process.env.EXEC_TUNING_ENABLED ?? "1") === "1";

// ====================== SMALL UTILS ======================
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function safeNumber(x, fallback = null) {
  const n = Number(x);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeOrderbookSide(arr) {
  if (!Array.isArray(arr)) return [];
  return arr
    .map((row) => {
      // BingX usually returns [price, qty]
      if (Array.isArray(row)) {
        return {
          price: safeNumber(row[0], NaN),
          quantity: safeNumber(row[1], NaN),
        };
      }
      return null;
    })
    .filter(
      (x) =>
        x &&
        Number.isFinite(x.price) &&
        Number.isFinite(x.quantity) &&
        x.price > 0 &&
        x.quantity >= 0
    );
}

function addDateAndSort(candles) {
  const out = (candles || [])
    .map((c) => ({
      ...c,
      date: new Date(c.time).toISOString(),
    }))
    .filter((c) => c && Number.isFinite(c.time));

  // Ensure ascending chronological order for EVERY TF
  out.sort((a, b) => a.time - b.time);
  return out;
}

function readJsonSafe(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const raw = fs.readFileSync(filePath, "utf8");
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch (e) {
    return fallback;
  }
}

function writeJsonAtomic(filePath, obj) {
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), "utf8");
  fs.renameSync(tmp, filePath);
}

function roundDownToBucket(tsMs, bucketMs) {
  if (!Number.isFinite(tsMs) || !Number.isFinite(bucketMs) || bucketMs <= 0) return tsMs;
  return Math.floor(tsMs / bucketMs) * bucketMs;
}

function pruneSeries(series, cutoffMs) {
  if (!Array.isArray(series)) return [];
  return series.filter((p) => Number.isFinite(p.t) && p.t >= cutoffMs);
}

function upsertPoint(series, point) {
  // Upsert by t (bucketed time). Keep ascending order.
  const t = point?.t;
  if (!Number.isFinite(t)) return series;

  const idx = series.findIndex((p) => p.t === t);
  if (idx >= 0) {
    series[idx] = { ...series[idx], ...point };
  } else {
    series.push(point);
  }
  series.sort((a, b) => a.t - b.t);
  return series;
}

function mean(arr) {
  const xs = (arr || []).filter((x) => Number.isFinite(x));
  if (!xs.length) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

// ====================== SESSION CONTEXT ======================
// Derive session from UTC hour to keep deterministic behavior across machines/timezones.
// You can tune windows later, but keep it stable for the AI.

function getUtcHourFromMs(tsMs) {
  try {
    const d = new Date(tsMs);
    return d.getUTCHours();
  } catch {
    return null;
  }
}

function deriveSessionContext(tsMs) {
  const utcHour = getUtcHourFromMs(tsMs);
  if (!Number.isFinite(utcHour)) {
    return {
      current: "UNKNOWN",
      is_overlap: false,
      utc_hour: null,
      label: "Unknown Session",
      confidence_bias: "LOW",
      risk_overlay: {
        volatility_expectation: "UNKNOWN",
        false_breakout_risk: "UNKNOWN",
        liquidity_sweep_probability: "UNKNOWN",
      },
    };
  }

  // Windows (UTC)
  // ASIA: 00:00–07:00
  // LONDON: 07:00–12:00
  // OVERLAP (London–NY): 12:00–13:00
  // NY: 13:00–20:00
  // DEAD_ZONE: 20:00–24:00

  if (utcHour >= 0 && utcHour < 7) {
    return {
      current: "ASIA",
      is_overlap: false,
      utc_hour: utcHour,
      label: "Asia Range / Accumulation",
      confidence_bias: "LOW",
      risk_overlay: {
        volatility_expectation: "LOW",
        false_breakout_risk: "HIGH",
        liquidity_sweep_probability: "LOW",
      },
    };
  }

  if (utcHour >= 7 && utcHour < 12) {
    return {
      current: "LONDON",
      is_overlap: false,
      utc_hour: utcHour,
      label: "London Expansion",
      confidence_bias: "MEDIUM",
      risk_overlay: {
        volatility_expectation: "INCREASING",
        false_breakout_risk: "MEDIUM",
        liquidity_sweep_probability: "HIGH",
      },
    };
  }

  if (utcHour >= 12 && utcHour < 13) {
    return {
      current: "OVERLAP",
      is_overlap: true,
      utc_hour: utcHour,
      label: "London–NY Overlap (Kill Zone)",
      confidence_bias: "HIGH",
      risk_overlay: {
        volatility_expectation: "HIGH",
        false_breakout_risk: "LOW",
        liquidity_sweep_probability: "VERY_HIGH",
      },
    };
  }

  if (utcHour >= 13 && utcHour < 20) {
    return {
      current: "NY",
      is_overlap: false,
      utc_hour: utcHour,
      label: "NY Directional Move",
      confidence_bias: "HIGH",
      risk_overlay: {
        volatility_expectation: "HIGH",
        false_breakout_risk: "LOW",
        liquidity_sweep_probability: "HIGH",
      },
    };
  }

  return {
    current: "DEAD_ZONE",
    is_overlap: false,
    utc_hour: utcHour,
    label: "Low Participation",
    confidence_bias: "LOW",
    risk_overlay: {
      volatility_expectation: "LOW",
      false_breakout_risk: "HIGH",
      liquidity_sweep_probability: "LOW",
    },
  };
}

// ====================== ✅ VOLATILITY BASELINE CACHE (ATR/BBW) ======================
// Goal:
// - Compute ATR(14) + BBW(20,2) from 1H candles
// - Maintain rolling baseline cache on disk (no extra API)
// - Output volatility state + optional execution_tuning

function defaultVolBaselineCache() {
  return { version: 2, updated_at: null, symbols: {} };
}

function getVolSymbolCache(cache, symbol) {
  if (!cache.symbols) cache.symbols = {};
  if (!cache.symbols[symbol]) cache.symbols[symbol] = {};

  const s = cache.symbols[symbol];

  if (!s.raw_5m) s.raw_5m = { last_sample_time: null, series: [] };
  if (!s.agg_1h) s.agg_1h = { last_agg_time: null, series: [] };

  // baseline distribution (สำคัญ)
  if (!s.tf_1h) s.tf_1h = { last_sample_time: null, series: [] }; // [{t, atr14, bbw20}]

  return s;
}

function aggregate5mTo1H(raw5mSeries) {
  if (!Array.isArray(raw5mSeries) || raw5mSeries.length === 0) return [];

  const HOUR_MS = 60 * 60 * 1000;
  const sorted = raw5mSeries.slice().sort((a, b) => a.t - b.t);

  const buckets = new Map(); // hourBucket -> candles
  for (const c of sorted) {
    const hourT = roundDownToBucket(c.t, HOUR_MS);
    if (!buckets.has(hourT)) buckets.set(hourT, []);
    buckets.get(hourT).push(c);
  }

  const out = [];
  for (const [hourT, cs] of buckets.entries()) {
    cs.sort((a, b) => a.t - b.t);
    const open = cs[0].open;
    const close = cs[cs.length - 1].close;
    let high = -Infinity;
    let low = Infinity;
    let vol = 0;

    for (const x of cs) {
      if (Number.isFinite(x.high)) high = Math.max(high, x.high);
      if (Number.isFinite(x.low)) low = Math.min(low, x.low);
      if (Number.isFinite(x.volume)) vol += x.volume;
    }

    if (
      Number.isFinite(open) &&
      Number.isFinite(high) &&
      Number.isFinite(low) &&
      Number.isFinite(close)
    ) {
      out.push({ t: hourT, open, high, low, close, volume: vol });
    }
  }

  out.sort((a, b) => a.t - b.t);
  return out;
}
function toCandleWithTime(c) {
  return { time: c.t, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume ?? 0 };
}

async function sampleAndUpdateVolatilityHistory(symbol) {
  const nowMs = Date.now();
  const BUCKET_5M = 5 * 60 * 1000;

  const m5 = await fetchKlines(symbol, "5m", VOL_SCHED_KLINE_LIMIT_5M);

  const cache = readJsonSafe(VOL_BASELINE_CACHE_FILE, defaultVolBaselineCache());
  const sym = getVolSymbolCache(cache, symbol);

  // ✅ prune raw 5m by time (24h)
  const cutoff5m = nowMs - 24 * 60 * 60 * 1000;
  sym.raw_5m.series = pruneSeries(sym.raw_5m.series, cutoff5m);

  for (const c of m5) {
    const t = roundDownToBucket(Number(c.time), BUCKET_5M);
    upsertPoint(sym.raw_5m.series, {
      t,
      open: safeNumber(c.open, null),
      high: safeNumber(c.high, null),
      low: safeNumber(c.low, null),
      close: safeNumber(c.close, null),
      volume: safeNumber(c.volume, 0),
    });
  }

  sym.raw_5m.series = trimToMax(sym.raw_5m.series, VOL_RAW_5M_CAP);
  sym.raw_5m.last_sample_time = nowMs;

  const agg1h = aggregate5mTo1H(sym.raw_5m.series);
  sym.agg_1h.series = trimToMax(agg1h, VOL_AGG_1H_CAP);
  sym.agg_1h.last_agg_time = nowMs;

  cache.updated_at = nowMs;
  writeJsonAtomic(VOL_BASELINE_CACHE_FILE, cache);

  return sym;
}


function buildVolatilitySnapshotFromAgg(symAgg1hSeries) {
  const candles1h = (symAgg1hSeries || []).map(toCandleWithTime);

  const atr_1h = computeATR14(candles1h);
  const bbw_1h = computeBBW20(candles1h, 2);

  // baseline = mean last 50 points from cached hourly series (indicator re-computed over rolling window is expensive,
  // so we use current atr/bbw vs mean of recent atr/bbw computed per snapshot from full series).
  // (lightweight + stable)
  // For simplicity: mean of last 50 closes’ derived indicator is approximated by recomputing once on full candles
  // and using cached distributions is optional. We'll do simple: store ratio vs current mean using windowed recompute.

  // To get baseline means, compute atr/bbw on progressively shorter windows is heavy.
  // We'll approximate using distribution by recomputing ATR/BBW on rolling last 50 candles by sampling:
  const last50 = candles1h.slice(Math.max(0, candles1h.length - 50));
  const atr_mean_1h_50 = computeATR14(last50); // approx baseline (works after 50h+)
  const bbw_mean_1h_50 = computeBBW20(last50, 2);

  const atr_ratio =
    Number.isFinite(atr_1h) && Number.isFinite(atr_mean_1h_50) && atr_mean_1h_50 > 0
      ? atr_1h / atr_mean_1h_50
      : null;

  const bbw_ratio =
    Number.isFinite(bbw_1h) && Number.isFinite(bbw_mean_1h_50) && bbw_mean_1h_50 > 0
      ? bbw_1h / bbw_mean_1h_50
      : null;

  const { vol_state, confidence } = classifyVolState(atr_ratio);

  return {
    now: {
      atr_1h: Number.isFinite(atr_1h) ? atr_1h : null,
      bbw_1h: Number.isFinite(bbw_1h) ? bbw_1h : null,
    },
    baseline: {
      atr_mean_1h_50: Number.isFinite(atr_mean_1h_50) ? atr_mean_1h_50 : null,
      bbw_mean_1h_50: Number.isFinite(bbw_mean_1h_50) ? bbw_mean_1h_50 : null,
      samples_1h: candles1h.length,
      last_sample_time: Date.now(),
      required_points: {
        for_readable: 24,
        for_baseline_50: 50,
      },
    },
    relative: {
      atr_ratio: Number.isFinite(atr_ratio) ? atr_ratio : null,
      bbw_ratio: Number.isFinite(bbw_ratio) ? bbw_ratio : null,
      vol_state,
      confidence,
    },
  };
}
let _volTimer = null;
let _volRunning = false;
let _volLastErrorAt = 0;
let _volTicks = 0;

function logVol(msg, extra) {
  const ts = new Date().toISOString();
  if (extra !== undefined) console.log(`[VolHistory][${ts}] ${msg}`, extra);
  else console.log(`[VolHistory][${ts}] ${msg}`);
}

async function runVolatilityHistoryTick() {
  if (!VOL_SCHED_ENABLED) return;

  if (_volRunning) {
    logVol("skip tick (previous run still running)");
    return;
  }

  const now = Date.now();
  if (_volLastErrorAt && now - _volLastErrorAt < VOL_SCHED_BACKOFF_MS) {
    logVol("skip tick (backoff active)");
    return;
  }

  _volRunning = true;
  _volTicks += 1;
  const tickId = _volTicks;

  try {
    const jitter = Math.floor(Math.random() * Math.max(0, VOL_SCHED_JITTER_MS));
    if (jitter > 0) await sleep(jitter);

    logVol(`tick #${tickId} start (symbols=${VOL_SCHED_SYMBOLS.join(",")})`);

    for (const symbol of VOL_SCHED_SYMBOLS) {
      const before = Date.now();
      const sym = await sampleAndUpdateVolatilityHistory(symbol);
      const dur = Date.now() - before;

      const raw5 = sym?.raw_5m?.series?.length ?? 0;
      const agg1 = sym?.agg_1h?.series?.length ?? 0;

      logVol(`sampled ${symbol} in ${dur}ms (raw5m=${raw5} | agg1h=${agg1})`);
    }

    logVol(`tick #${tickId} done`);
  } catch (err) {
    _volLastErrorAt = Date.now();
    logVol(`tick #${tickId} ERROR: ${err?.message ?? err}`);
  } finally {
    _volRunning = false;
  }
}

function startVolatilityHistoryScheduler() {
  if (!VOL_SCHED_ENABLED) {
    logVol("scheduler disabled (VOL_SCHED_ENABLED != 1)");
    return;
  }
  if (_volTimer) {
    logVol("scheduler already running");
    return;
  }

  logVol(
    `scheduler enabled interval=${VOL_SCHED_INTERVAL_MS}ms jitter<=${VOL_SCHED_JITTER_MS}ms symbols=${VOL_SCHED_SYMBOLS.join(",")} limit5m=${VOL_SCHED_KLINE_LIMIT_5M}`
  );

  const initialDelay = Math.floor(Math.random() * Math.max(0, VOL_SCHED_JITTER_MS));
  setTimeout(() => runVolatilityHistoryTick().catch(() => { }), 1000 + initialDelay);

  _volTimer = setInterval(() => runVolatilityHistoryTick().catch(() => { }), VOL_SCHED_INTERVAL_MS);
  if (typeof _volTimer.unref === "function") _volTimer.unref();
}

function stopVolatilityHistoryScheduler() {
  if (_volTimer) {
    clearInterval(_volTimer);
    _volTimer = null;
    logVol("scheduler stopped");
  }
}

function defaultVolBaselineCache() {
  return {
    version: 1,
    updated_at: null,
    symbols: {},
  };
}

function getVolSymbolCache(cache, symbol) {
  if (!cache.symbols) cache.symbols = {};

  if (!cache.symbols[symbol]) {
    cache.symbols[symbol] = {};
  }

  const s = cache.symbols[symbol];

  // ✅ raw 5m (24h cap)
  if (!s.raw_5m) {
    s.raw_5m = {
      last_sample_time: null,
      series: [], // [{t, open, high, low, close, volume}]
    };
  }

  // ✅ aggregated 1h (200h cap)
  if (!s.agg_1h) {
    s.agg_1h = {
      last_agg_time: null,
      series: [], // [{t, open, high, low, close, volume}]
    };
  }

  // ✅ volatility baseline series (ATR/BBW per 1h)
  if (!s.tf_1h) {
    s.tf_1h = {
      last_sample_time: null,
      series: [], // [{t, atr14, bbw20}]
    };
  }

  return s;
}


function trimToMax(series, maxLen) {
  if (!Array.isArray(series)) return [];
  if (!Number.isFinite(maxLen) || maxLen <= 0) return series;
  if (series.length <= maxLen) return series;
  return series.slice(series.length - maxLen);
}

// ATR(14) Wilder
function computeATR14(candles) {
  if (!Array.isArray(candles) || candles.length < 15) return null;
  const cs = candles.slice().sort((a, b) => a.time - b.time);

  const TR = [];
  for (let i = 1; i < cs.length; i++) {
    const prevClose = safeNumber(cs[i - 1].close, NaN);
    const high = safeNumber(cs[i].high, NaN);
    const low = safeNumber(cs[i].low, NaN);
    if (!Number.isFinite(prevClose) || !Number.isFinite(high) || !Number.isFinite(low)) continue;

    const tr = Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low - prevClose)
    );
    TR.push(tr);
  }

  if (TR.length < 14) return null;

  let atr = TR.slice(0, 14).reduce((a, b) => a + b, 0) / 14;
  for (let i = 14; i < TR.length; i++) {
    atr = (atr * 13 + TR[i]) / 14;
  }

  return Number.isFinite(atr) ? atr : null;
}

// BBW(20,2) = (Upper-Lower)/Middle, Middle=SMA(20)
function computeBBW20(candles, k = 2) {
  if (!Array.isArray(candles) || candles.length < 20) return null;
  const cs = candles.slice().sort((a, b) => a.time - b.time);
  const closes = cs.map((c) => safeNumber(c.close, NaN)).filter((x) => Number.isFinite(x));
  if (closes.length < 20) return null;

  const window = closes.slice(closes.length - 20);
  const m = mean(window);
  if (!Number.isFinite(m) || m === 0) return null;

  const variance = window.reduce((acc, x) => acc + (x - m) * (x - m), 0) / window.length;
  const sd = Math.sqrt(variance);

  const upper = m + k * sd;
  const lower = m - k * sd;
  const bbw = (upper - lower) / m;

  return Number.isFinite(bbw) ? bbw : null;
}

function classifyVolState(atrRatio) {
  if (!Number.isFinite(atrRatio)) return { vol_state: "UNKNOWN", confidence: 0.2 };
  if (atrRatio < 0.8) return { vol_state: "QUIET", confidence: 0.8 };
  if (atrRatio < 1.2) return { vol_state: "NORMAL", confidence: 0.85 };
  if (atrRatio < 1.6) return { vol_state: "HOT", confidence: 0.85 };
  return { vol_state: "EXTREME", confidence: 0.9 };
}

function buildExecutionTuning(volObj, sessionContext) {
  const { vol_state, atr_ratio, bbw_ratio } = volObj || {};

  let grid_spacing_multiplier = 1.0;
  let grid_density = "MED"; // LOW|MED|HIGH
  let risk_mode = "NORMAL"; // DEFENSIVE|NORMAL|AGGRESSIVE
  let cooldown_seconds = 0;
  const notes = [];

  const sess = sessionContext?.current ?? "UNKNOWN";
  const isOverlap = !!sessionContext?.is_overlap;

  if (vol_state === "QUIET") {
    grid_spacing_multiplier = 0.8;
    grid_density = "HIGH";
    risk_mode = "NORMAL";
    notes.push("QUIET: tighten spacing, denser grid (watch fees)");
  } else if (vol_state === "NORMAL") {
    grid_spacing_multiplier = 1.0;
    grid_density = "MED";
    risk_mode = "NORMAL";
    notes.push("NORMAL: standard spacing/density");
  } else if (vol_state === "HOT") {
    grid_spacing_multiplier = 1.3;
    grid_density = "LOW";
    risk_mode = "DEFENSIVE";
    cooldown_seconds = 60;
    notes.push("HOT: widen spacing, reduce density, add cooldown");
  } else if (vol_state === "EXTREME") {
    grid_spacing_multiplier = 1.7;
    grid_density = "LOW";
    risk_mode = "DEFENSIVE";
    cooldown_seconds = 120;
    notes.push("EXTREME: very wide spacing, minimal density, strong defensive");
  } else {
    grid_spacing_multiplier = 1.2;
    grid_density = "LOW";
    risk_mode = "DEFENSIVE";
    cooldown_seconds = 60;
    notes.push("UNKNOWN vol: fallback conservative");
  }

  if (vol_state === "EXTREME" && (isOverlap || sess === "NY" || sess === "LONDON")) {
    notes.push("EXTREME + active session: consider WAIT/NO_TRADE unless strong confirmation");
  }

  if (Number.isFinite(bbw_ratio) && bbw_ratio < 0.75) {
    notes.push("BBW squeeze: expect expansion; avoid over-dense grid pre-breakout");
    if (vol_state === "QUIET") {
      risk_mode = "DEFENSIVE";
      grid_density = "MED";
      grid_spacing_multiplier = Math.max(grid_spacing_multiplier, 0.9);
    }
  }

  if (Number.isFinite(bbw_ratio) && bbw_ratio > 1.25) {
    notes.push("BBW expansion: keep spacing wider");
    if (vol_state === "HOT" || vol_state === "EXTREME") {
      grid_spacing_multiplier = Math.max(grid_spacing_multiplier, 1.4);
    }
  }

  return {
    grid_spacing_multiplier,
    grid_density,
    risk_mode,
    cooldown_seconds,
    notes,
    session: sess,
    is_overlap: isOverlap,
    inputs: {
      atr_ratio: Number.isFinite(atr_ratio) ? atr_ratio : null,
      bbw_ratio: Number.isFinite(bbw_ratio) ? bbw_ratio : null,
    },
  };
}


async function computeAndAttachVolatility({ symbol, h1Candles, sessionContext }) {
  const nowMs = Date.now();

  let atr_1h = computeATR14(h1Candles);
  let bbw_1h = computeBBW20(h1Candles, 2);


  // Use latest 1H candle time as t (stable)
  const BUCKET_1H = 60 * 60 * 1000;
  const t = roundDownToBucket(nowMs, BUCKET_1H);


  // Load cache
  const cache = readJsonSafe(VOL_BASELINE_CACHE_FILE, defaultVolBaselineCache());
  const sym = getVolSymbolCache(cache, symbol);

  // Prune by time
  const cutoff = nowMs - VOL_BASELINE_LOOKBACK_MS_1H;
  sym.tf_1h.series = pruneSeries(sym.tf_1h.series, cutoff);

  // Upsert point
  upsertPoint(sym.tf_1h.series, {
    t,
    atr14: Number.isFinite(atr_1h) ? atr_1h : null,
    bbw20: Number.isFinite(bbw_1h) ? bbw_1h : null,
  });

  // Cap
  sym.tf_1h.series = trimToMax(sym.tf_1h.series, VOL_BASELINE_CAP_1H);
  sym.tf_1h.last_sample_time = nowMs;

  cache.updated_at = nowMs;
  writeJsonAtomic(VOL_BASELINE_CACHE_FILE, cache);

  // Baselines (last 50 samples)
  const atrArr = sym.tf_1h.series.map((p) => p.atr14).filter((x) => Number.isFinite(x));
  const bbwArr = sym.tf_1h.series.map((p) => p.bbw20).filter((x) => Number.isFinite(x));

  const atr_mean_1h_50 = mean(atrArr.slice(Math.max(0, atrArr.length - 50)));
  const bbw_mean_1h_50 = mean(bbwArr.slice(Math.max(0, bbwArr.length - 50)));

  // Percentile rank (against full cached distribution)
  const atr_pctl_1h = (Number.isFinite(atr_1h) && atrArr.length)
    ? atrArr.filter((x) => x <= atr_1h).length / atrArr.length
    : null;

  const bbw_pctl_1h = (Number.isFinite(bbw_1h) && bbwArr.length)
    ? bbwArr.filter((x) => x <= bbw_1h).length / bbwArr.length
    : null;

  const atr_ratio = (Number.isFinite(atr_1h) && Number.isFinite(atr_mean_1h_50) && atr_mean_1h_50 > 0)
    ? atr_1h / atr_mean_1h_50
    : null;

  const bbw_ratio = (Number.isFinite(bbw_1h) && Number.isFinite(bbw_mean_1h_50) && bbw_mean_1h_50 > 0)
    ? bbw_1h / bbw_mean_1h_50
    : null;

  // ---- fallback: if compute returns null, use last cached point ----
  if (!Number.isFinite(atr_1h) || !Number.isFinite(bbw_1h)) {
    const last = sym?.tf_1h?.series?.[sym.tf_1h.series.length - 1] || null;

    if (!Number.isFinite(atr_1h) && Number.isFinite(last?.atr14)) {
      atr_1h = last.atr14;
    }
    if (!Number.isFinite(bbw_1h) && Number.isFinite(last?.bbw20)) {
      bbw_1h = last.bbw20;
    }
  }


  const { vol_state, confidence } = classifyVolState(atr_ratio);

  const volatility = {
    now: {
      atr_1h: Number.isFinite(atr_1h) ? atr_1h : null,
      bbw_1h: Number.isFinite(bbw_1h) ? bbw_1h : null,
    },
    baseline: {
      atr_mean_1h_50: Number.isFinite(atr_mean_1h_50) ? atr_mean_1h_50 : null,
      atr_pctl_1h: Number.isFinite(atr_pctl_1h) ? atr_pctl_1h : null,
      bbw_mean_1h_50: Number.isFinite(bbw_mean_1h_50) ? bbw_mean_1h_50 : null,
      bbw_pctl_1h: Number.isFinite(bbw_pctl_1h) ? bbw_pctl_1h : null,
      samples_1h: sym.tf_1h.series.length,
      last_sample_time: sym.tf_1h.last_sample_time,
    },
    relative: {
      atr_ratio: Number.isFinite(atr_ratio) ? atr_ratio : null,
      bbw_ratio: Number.isFinite(bbw_ratio) ? bbw_ratio : null,
      vol_state,
      confidence,
    },
  };

  const execution_tuning = EXEC_TUNING_ENABLED
    ? buildExecutionTuning({ vol_state, atr_ratio, bbw_ratio }, sessionContext)
    : null;

  return { volatility, execution_tuning };
}

// function defaultVolHistoryCache() {
//   return {
//     version: 1,
//     updated_at: null,
//     symbols: {},
//   };
// }

// function getVolHistorySymbolCache(cache, symbol) {
//   if (!cache.symbols) cache.symbols = {};
//   if (!cache.symbols[symbol]) cache.symbols[symbol] = {};

//   const s = cache.symbols[symbol];

//   // ✅ raw 5m (24h)
//   if (!s.tf_5m) {
//     s.tf_5m = {
//       last_sample_time: null,
//       series: [], // [{t, atr14, bbw20, close? ...}]
//     };
//   }
//   if (!Array.isArray(s.tf_5m.series)) s.tf_5m.series = [];

//   // ✅ hourly agg (200h or your cap)
//   if (!s.tf_1h) {
//     s.tf_1h = {
//       last_sample_time: null,
//       series: [], // [{t, atr14, bbw20}]
//     };
//   }
//   if (!Array.isArray(s.tf_1h.series)) s.tf_1h.series = [];

//   return s;
// }


// ====================== DERIVATIVES SIGNALS (for decision rules) ======================
// We compute lightweight, deterministic features from cached history:
// - last / prev delta, pct
// - slope estimate (simple linear regression on last N points)
// - price-vs-OI divergence hint
// These become "derivatives.signals" in market_snapshot.json

function lastN(series, n) {
  if (!Array.isArray(series) || series.length === 0) return [];
  if (!Number.isFinite(n) || n <= 0) return series;
  return series.slice(Math.max(0, series.length - n));
}

function safePctChange(a, b) {
  // pct from b -> a
  if (!Number.isFinite(a) || !Number.isFinite(b) || b === 0) return null;
  return (a - b) / Math.abs(b);
}

function linearSlope(series, getY) {
  // slope per point index (not per time). Stable & cheap.
  // Returns null if not enough points.
  const pts = (series || [])
    .map((p, i) => ({ x: i, y: safeNumber(getY(p), null) }))
    .filter((p) => Number.isFinite(p.y));
  const n = pts.length;
  if (n < 3) return null;

  let sumX = 0,
    sumY = 0,
    sumXY = 0,
    sumXX = 0;
  for (const p of pts) {
    sumX += p.x;
    sumY += p.y;
    sumXY += p.x * p.y;
    sumXX += p.x * p.x;
  }
  const denom = n * sumXX - sumX * sumX;
  if (denom === 0) return null;
  return (n * sumXY - sumX * sumY) / denom;
}

function buildDerivativesSignals(derivHistory, latestPrice) {
  // latestPrice: use 1H last close as an anchor for divergence heuristic.
  const out = {
    computed_at: Date.now(),
    inputs: {
      latest_price_1h_close: Number.isFinite(latestPrice) ? latestPrice : null,
    },
    funding: {},
    openInterest: {},
    combined: {},
  };

  const f5 = derivHistory?.funding?.series_5m_6h || [];
  const f15 = derivHistory?.funding?.series_15m_24h || [];
  const oi5 = derivHistory?.openInterest?.series_5m_6h || [];
  const oi15 = derivHistory?.openInterest?.series_15m_24h || [];

  // Funding (use lastFundingRate)
  const f5_last = f5[f5.length - 1]?.lastFundingRate;
  const f5_prev = f5[f5.length - 2]?.lastFundingRate;
  const f15_last = f15[f15.length - 1]?.lastFundingRate;
  const f15_prev = f15[f15.length - 2]?.lastFundingRate;

  out.funding = {
    last_5m: safeNumber(f5_last, null),
    prev_5m: safeNumber(f5_prev, null),
    delta_5m:
      Number.isFinite(f5_last) && Number.isFinite(f5_prev) ? f5_last - f5_prev : null,
    pct_5m: safePctChange(f5_last, f5_prev),

    last_15m: safeNumber(f15_last, null),
    prev_15m: safeNumber(f15_prev, null),
    delta_15m:
      Number.isFinite(f15_last) && Number.isFinite(f15_prev) ? f15_last - f15_prev : null,
    pct_15m: safePctChange(f15_last, f15_prev),

    slope_5m: linearSlope(lastN(f5, 24), (p) => p.lastFundingRate), // ~2h
    slope_15m: linearSlope(lastN(f15, 32), (p) => p.lastFundingRate), // ~8h
  };

  // OI
  const oi5_last = oi5[oi5.length - 1]?.openInterest;
  const oi5_prev = oi5[oi5.length - 2]?.openInterest;
  const oi15_last = oi15[oi15.length - 1]?.openInterest;
  const oi15_prev = oi15[oi15.length - 2]?.openInterest;

  out.openInterest = {
    last_5m: safeNumber(oi5_last, null),
    prev_5m: safeNumber(oi5_prev, null),
    delta_5m:
      Number.isFinite(oi5_last) && Number.isFinite(oi5_prev) ? oi5_last - oi5_prev : null,
    pct_5m: safePctChange(oi5_last, oi5_prev),

    last_15m: safeNumber(oi15_last, null),
    prev_15m: safeNumber(oi15_prev, null),
    delta_15m:
      Number.isFinite(oi15_last) && Number.isFinite(oi15_prev) ? oi15_last - oi15_prev : null,
    pct_15m: safePctChange(oi15_last, oi15_prev),

    slope_5m: linearSlope(lastN(oi5, 24), (p) => p.openInterest),
    slope_15m: linearSlope(lastN(oi15, 32), (p) => p.openInterest),
  };

  const oiSlope = out.openInterest.slope_15m;
  const fSlope = out.funding.slope_15m;
  const oiUp = Number.isFinite(oiSlope) && oiSlope > 0;
  const oiDn = Number.isFinite(oiSlope) && oiSlope < 0;
  const fUp = Number.isFinite(fSlope) && fSlope > 0;
  const fDn = Number.isFinite(fSlope) && fSlope < 0;

  let crowding = "NEUTRAL";
  if (oiUp && fUp) crowding = "CROWDED_LONG";
  else if (oiUp && fDn) crowding = "CROWDED_SHORT";
  else if (oiDn && fUp) crowding = "LONG_UNWIND";
  else if (oiDn && fDn) crowding = "SHORT_UNWIND";

  const divergence_note = oiUp && Number.isFinite(latestPrice)
    ? "If price stalls while OI builds, watch for squeeze/trap at liquidity zones"
    : null;

  out.combined = {
    crowding,
    risk_note: divergence_note,
  };

  return out;
}

// ====================== PIPELINE ======================
async function runFullSnapshotOnce(options = {}) {
  const { symbol = "BTC-USDT", klineLimit = 200, depthLimit = 50 } = options;

  console.log("==============================");
  console.log("[Pipeline] Starting full snapshot");
  console.log("symbol:", symbol, "klineLimit:", klineLimit, "depthLimit:", depthLimit);
  console.log("==============================");

  try {
    // 1) klines.json
    await collectKlinesInternal(symbol, klineLimit);

    // 2) funding_snapshot.json
    await collectFundingInternal(symbol);

    // 3) open_interest_snapshot.json
    await collectOpenInterestInternal(symbol);

    // 4) orderbook_snapshot.json
    await collectOrderbookInternal(symbol, depthLimit);

    // 5) market_snapshot.json (master)
    await collectMarketSnapshotInternal(symbol, klineLimit, depthLimit);

    console.log("[Pipeline] ✅ Done: full snapshot created");
  } catch (err) {
    console.error("[Pipeline] ❌ Error in full snapshot pipeline:", err);
    throw err;
  }
}

// ====================== FETCHERS (single source of truth) ======================

// ---------- KLINE V3 ----------
async function fetchKlines(symbol, interval, limit = 200) {
  const params = { symbol, interval, limit };

  let lastError = null;

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await axios.get(BASE_URL_KLINE_V3, { params, timeout: 8000 });
      const data = res.data;

      if (!data || data.code !== 0 || !Array.isArray(data.data)) {
        throw new Error("Unexpected response: " + JSON.stringify(data));
      }

      const candles = data.data
        .map((row) => {
          if (Array.isArray(row)) {
            return {
              time: Number(row[0]),
              open: Number(row[1]),
              high: Number(row[2]),
              low: Number(row[3]),
              close: Number(row[4]),
              volume: Number(row[5]),
            };
          }

          if (row && typeof row === "object") {
            return {
              time: Number(row.time ?? row.openTime ?? row.startTime ?? row.t ?? 0),
              open: Number(row.open ?? row.o),
              high: Number(row.high ?? row.h),
              low: Number(row.low ?? row.l),
              close: Number(row.close ?? row.c),
              volume: Number(row.volume ?? row.v ?? 0),
            };
          }

          return null;
        })
        .filter(
          (c) =>
            c &&
            !Number.isNaN(c.open) &&
            !Number.isNaN(c.high) &&
            !Number.isNaN(c.low) &&
            !Number.isNaN(c.close) &&
            Number.isFinite(c.time)
        );

      candles.sort((a, b) => a.time - b.time);
      return candles;
    } catch (err) {
      lastError = err;
      console.warn(
        `[fetchKlines] attempt ${attempt} failed for ${symbol} ${interval}:`,
        err.message
      );
      await sleep(300 * attempt);
    }
  }

  throw new Error(`Failed to fetch klines for ${symbol} ${interval}: ${lastError?.message}`);
}

// ---------- Funding / PremiumIndex (public) ----------
async function fetchPremiumIndex(symbol) {
  const url = `${BASE_V2_QUOTE}/premiumIndex`;

  const res = await axios.get(url, { params: { symbol }, timeout: 8000 });
  const data = res.data;

  if (!data || data.code !== 0 || !data.data) {
    throw new Error("Unexpected response (premiumIndex): " + JSON.stringify(data));
  }

  const d = data.data;

  return {
    symbol: d.symbol ?? symbol,
    markPrice: safeNumber(d.markPrice, 0),
    indexPrice: safeNumber(d.indexPrice, 0),
    lastFundingRate: safeNumber(d.lastFundingRate, 0),
    nextFundingTime: safeNumber(d.nextFundingTime ?? d.nextFundingTimestamp, 0),
    raw: d,
  };
}

// ---------- Funding History (public) ----------
async function fetchFundingHistory(symbol, limit = 20) {
  const url = `${BASE_V2_QUOTE}/fundingRate`;
  const params = { symbol, limit };

  const res = await axios.get(url, { params, timeout: 8000 });
  const data = res.data;

  if (!data || data.code !== 0 || !Array.isArray(data.data)) {
    throw new Error("Unexpected response (fundingRate): " + JSON.stringify(data));
  }

  return data.data
    .map((row) => ({
      symbol: row.symbol ?? symbol,
      fundingRate: safeNumber(row.fundingRate, 0),
      fundingTime: safeNumber(row.fundingTime ?? row.time ?? row.t, 0),
      raw: row,
    }))
    .filter((x) => Number.isFinite(x.fundingTime));
}

// ---------- Open Interest (public) ----------
async function fetchOpenInterest(symbol) {
  const url = `${BASE_V2_QUOTE}/openInterest`;

  const res = await axios.get(url, { params: { symbol }, timeout: 8000 });
  const data = res.data;

  // ✅ เคส: BingX บอกว่าไม่มี OI สำหรับตลาด/สัญญานี้
  if (data?.code === 109400 && data?.msg === "OpenInterestNotExist") {
    return {
      ok: false,
      reason: "NOT_SUPPORTED",
      symbol,
      openInterest: null,
      time: null,
      raw: data,
    };
  }

  // ✅ เคส error อื่น
  if (!data || data.code !== 0 || !data.data) {
    throw new Error("Unexpected response (openInterest): " + JSON.stringify(data));
  }

  const d = data.data;
  return {
    ok: true,
    symbol: d.symbol ?? symbol,
    openInterest: safeNumber(d.openInterest, null),
    time: safeNumber(d.time ?? d.timestamp ?? d.t, null),
    raw: d,
  };
}

// ---------- Orderbook (public) ----------
async function fetchOrderbookDepth(symbol, limit = 50) {
  const res = await axios.get(ORDERBOOK_URL, {
    params: { symbol, limit },
    timeout: 8000,
  });

  const data = res.data;

  if (!data || data.code !== 0 || !data.data) {
    throw new Error("Unexpected response (orderBook): " + JSON.stringify(data));
  }

  const ob = data.data;

  const bids = normalizeOrderbookSide(ob.bids || []);
  const asks = normalizeOrderbookSide(ob.asks || []);

  return {
    symbol,
    lastUpdateId: ob.lastUpdateId ?? ob.u ?? null,
    bids,
    asks,
    raw: ob,
  };
}

// ====================== DERIVATIVES HISTORY CACHE ======================
function defaultDerivHistoryCache() {
  return {
    version: 1,
    updated_at: null,
    symbols: {},
  };
}

function getSymbolCache(cache, symbol) {
  if (!cache.symbols[symbol]) {
    cache.symbols[symbol] = {
      funding: {
        source: "local-cache (sampled from /openApi/swap/v2/quote/premiumIndex)",
        last_sample_time: null,
        series_5m_6h: [],
        series_15m_24h: [],
      },
      openInterest: {
        source: "local-cache (sampled from /openApi/swap/v2/quote/openInterest)",
        last_sample_time: null,
        series_5m_6h: [],
        series_15m_24h: [],
      },
    };
  }
  return cache.symbols[symbol];
}

const HISTORY_CAP_5M_6H = 72; // 6h / 5m
const HISTORY_CAP_15M_24H = 96; // 24h / 15m

async function sampleAndUpdateDerivativesHistory(symbol) {
  const cache = readJsonSafe(DERIV_HISTORY_CACHE_FILE, defaultDerivHistoryCache());
  const sym = getSymbolCache(cache, symbol);

  const [f, oi] = await Promise.all([
    fetchPremiumIndex(symbol),
    fetchOpenInterest(symbol),
  ]);

  const nowMs = Date.now();
  const oiTime = Number.isFinite(oi?.time) && oi.time > 0 ? oi.time : nowMs;
  const fTime = nowMs;

  const BUCKET_5M = 5 * 60 * 1000;
  const BUCKET_15M = 15 * 60 * 1000;

  const cutoff5m = nowMs - 6 * 60 * 60 * 1000;
  const cutoff15m = nowMs - 24 * 60 * 60 * 1000;

  // ---------- funding ----------
  const fPoint5m = {
    t: roundDownToBucket(fTime, BUCKET_5M),
    markPrice: f.markPrice,
    indexPrice: f.indexPrice,
    lastFundingRate: f.lastFundingRate,
    nextFundingTime: f.nextFundingTime,
  };
  const fPoint15m = { ...fPoint5m, t: roundDownToBucket(fTime, BUCKET_15M) };

  sym.funding.series_5m_6h = pruneSeries(sym.funding.series_5m_6h, cutoff5m);
  sym.funding.series_15m_24h = pruneSeries(sym.funding.series_15m_24h, cutoff15m);
  upsertPoint(sym.funding.series_5m_6h, fPoint5m);
  upsertPoint(sym.funding.series_15m_24h, fPoint15m);
  sym.funding.series_5m_6h = trimToMax(sym.funding.series_5m_6h, HISTORY_CAP_5M_6H);
  sym.funding.series_15m_24h = trimToMax(sym.funding.series_15m_24h, HISTORY_CAP_15M_24H);
  sym.funding.last_sample_time = nowMs;

  // ---------- open interest (optional) ----------
  if (oi?.ok && Number.isFinite(oi.openInterest)) {
    const oiPoint5m = {
      t: roundDownToBucket(oiTime, BUCKET_5M),
      openInterest: oi.openInterest,
    };
    const oiPoint15m = { ...oiPoint5m, t: roundDownToBucket(oiTime, BUCKET_15M) };

    sym.openInterest.series_5m_6h = pruneSeries(sym.openInterest.series_5m_6h, cutoff5m);
    sym.openInterest.series_15m_24h = pruneSeries(sym.openInterest.series_15m_24h, cutoff15m);
    upsertPoint(sym.openInterest.series_5m_6h, oiPoint5m);
    upsertPoint(sym.openInterest.series_15m_24h, oiPoint15m);
    sym.openInterest.series_5m_6h = trimToMax(sym.openInterest.series_5m_6h, HISTORY_CAP_5M_6H);
    sym.openInterest.series_15m_24h = trimToMax(sym.openInterest.series_15m_24h, HISTORY_CAP_15M_24H);
    sym.openInterest.last_sample_time = nowMs;
  } else {
    // พยายามแล้ว แต่ไม่มี/ไม่รองรับ
    sym.openInterest.last_sample_time = nowMs;
  }

  cache.updated_at = nowMs;
  writeJsonAtomic(DERIV_HISTORY_CACHE_FILE, cache);

  return sym;
}


// ====================== HISTORY SCHEDULER (production-safe) ======================
const HISTORY_SCHED_ENABLED = String(process.env.DERIV_HISTORY_SCHED_ENABLED ?? "1") === "1";
const HISTORY_SCHED_SYMBOLS = String(process.env.DERIV_HISTORY_SYMBOLS ?? "BTC-USDT")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const HISTORY_SCHED_INTERVAL_MS = Number(
  process.env.DERIV_HISTORY_SCHED_INTERVAL_MS ?? 5 * 60 * 1000
);

const HISTORY_SCHED_JITTER_MS = Number(process.env.DERIV_HISTORY_SCHED_JITTER_MS ?? 10 * 1000);
const HISTORY_SCHED_BACKOFF_MS = Number(process.env.DERIV_HISTORY_SCHED_BACKOFF_MS ?? 30 * 1000);

let _historyTimer = null;
let _historyRunning = false;
let _historyLastErrorAt = 0;
let _historyTicks = 0;

function logHistory(msg, extra) {
  const ts = new Date().toISOString();
  if (extra !== undefined) console.log(`[DerivHistory][${ts}] ${msg}`, extra);
  else console.log(`[DerivHistory][${ts}] ${msg}`);
}

async function runDerivativesHistoryTick() {
  if (!HISTORY_SCHED_ENABLED) return;
  if (_historyRunning) {
    logHistory("skip tick (previous run still running)");
    return;
  }
  const now = Date.now();
  if (_historyLastErrorAt && now - _historyLastErrorAt < HISTORY_SCHED_BACKOFF_MS) {
    logHistory("skip tick (backoff active)");
    return;
  }

  _historyRunning = true;
  _historyTicks += 1;
  const tickId = _historyTicks;

  try {
    const jitter = Math.floor(Math.random() * Math.max(0, HISTORY_SCHED_JITTER_MS));
    if (jitter > 0) await sleep(jitter);

    logHistory(`tick #${tickId} start (symbols=${HISTORY_SCHED_SYMBOLS.join(",")})`);

    for (const symbol of HISTORY_SCHED_SYMBOLS) {
      const before = Date.now();
      const sym = await sampleAndUpdateDerivativesHistory(symbol);
      const dur = Date.now() - before;

      const f5 = sym?.funding?.series_5m_6h?.length ?? 0;
      const f15 = sym?.funding?.series_15m_24h?.length ?? 0;
      const oi5 = sym?.openInterest?.series_5m_6h?.length ?? 0;
      const oi15 = sym?.openInterest?.series_15m_24h?.length ?? 0;

      logHistory(
        `sampled ${symbol} in ${dur}ms (funding:5m=${f5},15m=${f15} | oi:5m=${oi5},15m=${oi15})`
      );
    }

    logHistory(`tick #${tickId} done`);
  } catch (err) {
    _historyLastErrorAt = Date.now();
    logHistory(`tick #${tickId} ERROR: ${err?.message ?? err}`);
  } finally {
    _historyRunning = false;
  }
}

function startDerivativesHistoryScheduler() {
  if (!HISTORY_SCHED_ENABLED) {
    logHistory("scheduler disabled (DERIV_HISTORY_SCHED_ENABLED != 1)");
    return;
  }
  if (_historyTimer) {
    logHistory("scheduler already running");
    return;
  }

  logHistory(
    `scheduler enabled interval=${HISTORY_SCHED_INTERVAL_MS}ms jitter<=${HISTORY_SCHED_JITTER_MS}ms symbols=${HISTORY_SCHED_SYMBOLS.join(",")}`
  );

  const initialDelay = Math.floor(Math.random() * Math.max(0, HISTORY_SCHED_JITTER_MS));
  setTimeout(() => {
    runDerivativesHistoryTick().catch(() => { });
  }, 1000 + initialDelay);

  _historyTimer = setInterval(() => {
    runDerivativesHistoryTick().catch(() => { });
  }, HISTORY_SCHED_INTERVAL_MS);

  if (typeof _historyTimer.unref === "function") _historyTimer.unref();
}

function stopDerivativesHistoryScheduler() {
  if (_historyTimer) {
    clearInterval(_historyTimer);
    _historyTimer = null;
    logHistory("scheduler stopped");
  }
}

// ====================== COLLECTORS (files) ======================

async function collectKlinesInternal(symbol, limit) {
  console.log(`[collectKlinesInternal] ${symbol}, limit=${limit}`);

  const [d1, h4, h1, m15, m5] = await Promise.all([
    fetchKlines(symbol, "1d", limit),
    fetchKlines(symbol, "4h", limit),
    fetchKlines(symbol, "1h", limit),
    fetchKlines(symbol, "15m", limit),
    fetchKlines(symbol, "5m", limit),
  ]);

  const payload = {
    market_data: {
      klines: {
        "1D": { symbol, interval: "1d", candles: addDateAndSort(d1) },
        "4H": { symbol, interval: "4h", candles: addDateAndSort(h4) },
        "1H": { symbol, interval: "1h", candles: addDateAndSort(h1) },
        "15M": { symbol, interval: "15m", candles: addDateAndSort(m15) },
        "5M": { symbol, interval: "5m", candles: addDateAndSort(m5) },
      },
    },
    meta: {
      symbol,
      limit,
      generated_at: Date.now(),
    },
  };

  const filePath = path.join(__dirname, "klines.json");
  writeJsonAtomic(filePath, payload);

  return {
    file: filePath,
    preview: {
      d1_candles: d1.length,
      h4_candles: h4.length,
      h1_candles: h1.length,
      m15_candles: m15.length,
      m5_candles: m5.length,
    },
  };
}

async function collectFundingInternal(symbol) {
  console.log(`[collectFundingInternal] ${symbol}`);
  const info = await fetchPremiumIndex(symbol);
  const filePath = path.join(__dirname, "funding_snapshot.json");
  writeJsonAtomic(filePath, info);
  return info;
}

async function collectOpenInterestInternal(symbol) {
  console.log(`[collectOpenInterestInternal] ${symbol}`);
  const info = await fetchOpenInterest(symbol);

  const filePath = path.join(__dirname, "open_interest_snapshot.json");
  writeJsonAtomic(filePath, info);
  return info;
}


async function collectOrderbookInternal(symbol, depthLimit) {
  console.log(`[collectOrderbookInternal] ${symbol}, depthLimit=${depthLimit}`);

  const depth = await fetchOrderbookDepth(symbol, depthLimit);

  const bids = depth.bids;
  const asks = depth.asks;

  const bestBid = bids[0]?.price ?? null;
  const bestAsk = asks[0]?.price ?? null;
  const mid = bestBid !== null && bestAsk !== null ? (bestBid + bestAsk) / 2 : null;

  let bidNotional = 0;
  let askNotional = 0;

  if (mid) {
    const boundLow = mid * 0.995;
    const boundHigh = mid * 1.005;

    for (const b of bids) {
      if (b.price >= boundLow) bidNotional += b.price * b.quantity;
    }
    for (const a of asks) {
      if (a.price <= boundHigh) askNotional += a.price * a.quantity;
    }
  }

  const imbalance =
    bidNotional + askNotional > 0
      ? (bidNotional - askNotional) / (bidNotional + askNotional)
      : 0;

  const result = {
    symbol,
    bestBid,
    bestAsk,
    midPrice: mid,
    bidNotional,
    askNotional,
    imbalance,
    bids,
    asks,
    raw: depth.raw,
  };

  const filePath = path.join(__dirname, "orderbook_snapshot.json");
  writeJsonAtomic(filePath, result);

  return result;
}

// 5) market_snapshot.json (master)
async function collectMarketSnapshotInternal(symbol, klineLimit, depthLimit) {
  console.log(
    `[collectMarketSnapshotInternal] ${symbol}, klineLimit=${klineLimit}, depthLimit=${depthLimit}`
  );

  const warnings = [];

  // 0) Sample derivatives history
  let derivativesHistory = null;
  try {
    derivativesHistory = await sampleAndUpdateDerivativesHistory(symbol);
  } catch (err) {
    warnings.push("derivatives history sampling failed: " + err.message);
    const cache = readJsonSafe(DERIV_HISTORY_CACHE_FILE, defaultDerivHistoryCache());
    derivativesHistory = getSymbolCache(cache, symbol);
  }

  // 1) klines
  const [d1, h4, h1, m15, m5] = await Promise.all([
    fetchKlines(symbol, "1d", klineLimit),
    fetchKlines(symbol, "4h", klineLimit),
    fetchKlines(symbol, "1h", klineLimit),
    fetchKlines(symbol, "15m", klineLimit),
    fetchKlines(symbol, "5m", klineLimit),
  ]);

  if (!d1.length) warnings.push("ไม่มีแท่ง 1D จาก BingX");
  if (!h4.length) warnings.push("ไม่มีแท่ง 4H จาก BingX");
  if (!h1.length) warnings.push("ไม่มีแท่ง 1H จาก BingX");
  if (!m15.length) warnings.push("ไม่มีแท่ง 15M จาก BingX");
  if (!m5.length) warnings.push("ไม่มีแท่ง 5M จาก BingX");

  // latest close (1H)
  const latest1H = h1[h1.length - 1] || null;
  const latest1HClose = latest1H ? latest1H.close : null;

  // 1.5) session context
  const generatedAt = Date.now();
  const sessionContext = deriveSessionContext(generatedAt);

  // ✅ 1.6) volatility baseline + execution tuning
  let volatility = null;
  let execution_tuning = null;
  try {
    const cache = readJsonSafe(VOL_BASELINE_CACHE_FILE, defaultVolBaselineCache());
    const sym = getVolSymbolCache(cache, symbol);

    volatility = buildVolatilitySnapshotFromAgg(sym?.agg_1h?.series || []);
    execution_tuning = EXEC_TUNING_ENABLED
      ? buildExecutionTuning(
        {
          vol_state: volatility?.relative?.vol_state,
          atr_ratio: volatility?.relative?.atr_ratio,
          bbw_ratio: volatility?.relative?.bbw_ratio,
        },
        sessionContext
      )
      : null;
  } catch (err) {
    warnings.push("volatility cache read failed: " + err.message);
  }

  // 2) orderbook summary
  let orderbookPart = null;
  try {
    const depth = await fetchOrderbookDepth(symbol, depthLimit);
    const bids = depth.bids;
    const asks = depth.asks;

    const bestBid = bids[0]?.price ?? null;
    const bestAsk = asks[0]?.price ?? null;
    const mid = bestBid !== null && bestAsk !== null ? (bestBid + bestAsk) / 2 : null;

    let bidNotional = 0;
    let askNotional = 0;
    let imbalance = 0;

    if (mid) {
      const boundLow = mid * 0.995;
      const boundHigh = mid * 1.005;

      for (const b of bids) {
        if (b.price >= boundLow) bidNotional += b.price * b.quantity;
      }
      for (const a of asks) {
        if (a.price <= boundHigh) askNotional += a.price * a.quantity;
      }

      if (bidNotional + askNotional > 0) {
        imbalance = (bidNotional - askNotional) / (bidNotional + askNotional);
      }
    }

    orderbookPart = {
      symbol,
      bestBid,
      bestAsk,
      midPrice: mid,
      bidNotional,
      askNotional,
      imbalance,
    };
  } catch (err) {
    warnings.push("ดึง orderbook จาก BingX ไม่สำเร็จ: " + err.message);
  }

  // 3) derivatives snapshots
  let fundingPart = null;
  let openInterestPart = null;

  try {
    const f = await fetchPremiumIndex(symbol);
    fundingPart = {
      symbol,
      markPrice: f.markPrice,
      indexPrice: f.indexPrice,
      lastFundingRate: f.lastFundingRate,
      nextFundingTime: f.nextFundingTime,
    };
  } catch (err) {
    warnings.push("ดึง funding/premiumIndex ไม่สำเร็จ: " + err.message);
  }

  try {
    const oi = await fetchOpenInterest(symbol);
    openInterestPart = {
      symbol,
      openInterest: oi?.ok ? oi.openInterest : null,
      time: oi?.ok ? oi.time : null,
      ok: !!oi?.ok,
      reason: oi?.ok ? null : (oi?.reason ?? "UNKNOWN"),
    };
  } catch (err) {
    warnings.push("ดึง openInterest ไม่สำเร็จ: " + err.message);
  }


  // 4) derivatives signals
  let derivativesSignals = null;
  try {
    derivativesSignals = buildDerivativesSignals(derivativesHistory, safeNumber(latest1HClose, null));
  } catch (err) {
    warnings.push("derivatives signals compute failed: " + err.message);
    derivativesSignals = {
      computed_at: Date.now(),
      error: err.message,
    };
  }

  const snapshot = {
    market_data: {
      klines: {
        "1D": { symbol, interval: "1d", candles: addDateAndSort(d1) },
        "4H": { symbol, interval: "4h", candles: addDateAndSort(h4) },
        "1H": { symbol, interval: "1h", candles: addDateAndSort(h1) },
        "15M": { symbol, interval: "15m", candles: addDateAndSort(m15) },
        "5M": { symbol, interval: "5m", candles: addDateAndSort(m5) },
      },
      orderbook: orderbookPart,
    },
    derivatives: {
      funding: fundingPart,
      openInterest: openInterestPart,
      history: derivativesHistory,
      signals: derivativesSignals,
    },
    // ✅ NEW
    volatility,
    execution_tuning,
    meta: {
      symbol,
      kline_limit: klineLimit,
      depth_limit: depthLimit,
      generated_at: generatedAt,
      session: sessionContext,
      warnings,
    },
  };

  const filePath = path.join(__dirname, "market_snapshot.json");
  writeJsonAtomic(filePath, snapshot);

  return {
    file: filePath,
    preview: {
      latest_1h_close: latest1H ? latest1H.close : null,
      orderbook_mid: orderbookPart ? orderbookPart.midPrice : null,
      imbalance: orderbookPart ? orderbookPart.imbalance : null,
      session: sessionContext?.current ?? null,
      vol_state: snapshot?.volatility?.relative?.vol_state ?? null,
      atr_ratio: snapshot?.volatility?.relative?.atr_ratio ?? null,
      warnings,
    },
  };
}

// ====================== ENDPOINTS ======================

app.get("/get_bingx_kline", async (req, res) => {
  const symbol = req.query.symbol || "BTC-USDT";
  const interval = req.query.interval || "1h";
  const limit = Number(req.query.limit || 200);

  try {
    const candles = await fetchKlines(symbol, interval, limit);
    res.json({ symbol, interval, limit, candles });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: true, message: err.message });
  }
});

app.get("/collect_klines", async (req, res) => {
  const { symbol = "BTC-USDT", limit = 200 } = req.query;
  try {
    const result = await collectKlinesInternal(symbol, Number(limit));
    res.json({ ok: true, message: "Collected klines and saved to klines.json", ...result });
  } catch (err) {
    console.error("collect_klines error:", err);
    res.status(500).json({ ok: false, message: err.message });
  }
});

app.get("/bingx/mark_funding", async (req, res) => {
  const symbol = req.query.symbol || "BTC-USDT";
  try {
    const info = await collectFundingInternal(symbol);
    res.json({
      ok: true,
      symbol,
      markPrice: info.markPrice,
      indexPrice: info.indexPrice,
      lastFundingRate: info.lastFundingRate,
      nextFundingTime: info.nextFundingTime,
      raw: info.raw,
    });
  } catch (err) {
    console.error("bingx/mark_funding error:", err);
    res.status(500).json({ ok: false, message: err.message });
  }
});

app.get("/bingx/open_interest", async (req, res) => {
  const symbol = req.query.symbol || "BTC-USDT";
  try {
    const info = await collectOpenInterestInternal(symbol);
    res.json({ ok: true, symbol, openInterest: info.openInterest, time: info.time, raw: info.raw });
  } catch (err) {
    console.error("bingx/open_interest error:", err);
    res.status(500).json({ ok: false, message: err.message });
  }
});

app.get("/bingx/funding_history", async (req, res) => {
  const symbol = req.query.symbol || "BTC-USDT";
  const limit = Number(req.query.limit || 20);

  try {
    const history = await fetchFundingHistory(symbol, limit);
    res.json({ ok: true, symbol, limit, count: history.length, items: history });
  } catch (err) {
    console.error("bingx/funding_history error:", err);
    res.status(500).json({ ok: false, message: err.message });
  }
});

app.get("/bingx/orderbook", async (req, res) => {
  const symbol = req.query.symbol || "BTC-USDT";
  const limit = Number(req.query.limit || 50);

  try {
    const result = await collectOrderbookInternal(symbol, limit);
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error("bingx/orderbook error:", err);
    res.status(500).json({ ok: false, message: err.message });
  }
});

// NEW: collect volatility history only (5m raw + 1h agg)
app.get("/collect_volatility_history", async (req, res) => {
  const symbol = String(req.query.symbol || "BTC-USDT");
  try {
    const sym = await sampleAndUpdateVolatilityHistory(symbol); // ✅ ต้องเรียกจริง

    const volatility = buildVolatilitySnapshotFromAgg(sym?.agg_1h?.series || []);

    res.json({
      ok: true,
      symbol,
      message: "Volatility history sampled and cached",
      raw_5m_count: sym?.raw_5m?.series?.length ?? 0,
      agg_1h_count: sym?.agg_1h?.series?.length ?? 0,
      volatility,
    });
  } catch (err) {
    console.error("collect_volatility_history error:", err);
    res.status(500).json({ ok: false, message: err.message });
  }
});



app.get("/collect_derivatives_history", async (req, res) => {
  const symbol = String(req.query.symbol || "BTC-USDT");
  try {
    const sym = await sampleAndUpdateDerivativesHistory(symbol);
    res.json({
      ok: true,
      symbol,
      message: "Derivatives history sampled and cached",
      funding: {
        last_sample_time: sym.funding.last_sample_time,
        series_5m_6h_count: sym.funding.series_5m_6h.length,
        series_15m_24h_count: sym.funding.series_15m_24h.length,
      },
      openInterest: {
        last_sample_time: sym.openInterest.last_sample_time,
        series_5m_6h_count: sym.openInterest.series_5m_6h.length,
        series_15m_24h_count: sym.openInterest.series_15m_24h.length,
      },
    });
  } catch (err) {
    console.error("collect_derivatives_history error:", err);
    res.status(500).json({ ok: false, message: err.message });
  }
});

app.get("/collect_market_snapshot", async (req, res) => {
  const { symbol = "BTC-USDT", klineLimit = 200, depthLimit = 50 } = req.query;

  try {
    const result = await collectMarketSnapshotInternal(symbol, Number(klineLimit), Number(depthLimit));
    res.json({
      ok: true,
      message: "Collected klines + derivatives + orderbook and saved to market_snapshot.json",
      ...result,
    });
  } catch (err) {
    console.error("collect_market_snapshot error:", err);
    res.status(500).json({ ok: false, message: err.message });
  }
});

app.get("/run_full_snapshot", async (req, res) => {
  const symbol = String(req.query.symbol || "BTC-USDT");
  const klineLimitNum = Number(req.query.klineLimit || 200);
  const depthLimitNum = Number(req.query.depthLimit || 50);

  try {
    await runFullSnapshotOnce({
      symbol,
      klineLimit: klineLimitNum,
      depthLimit: depthLimitNum,
    });

    let newsWarning = null;

    try {
      const dummyRes = { status: () => dummyRes, json: () => { } };
      await buildNewsContext({ query: { symbol } }, dummyRes);
    } catch (e) {
      newsWarning = `news_context failed: ${e.message}`;
    }

    res.json({
      ok: true,
      message: "Full snapshot + news completed",
      symbol,
      klineLimit: klineLimitNum,
      depthLimit: depthLimitNum,
      warnings: newsWarning ? [newsWarning] : [],
    });
  } catch (err) {
    console.error("[run_full_snapshot] error:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ====================== START SERVER ======================
app.listen(PORT, () => {
  console.log(`bingx-agent server listening on http://localhost:${PORT}`);
  console.log(`GET http://localhost:${PORT}/collect_klines?symbol=BTC-USDT&limit=200`);
  console.log(`GET http://localhost:${PORT}/bingx/mark_funding?symbol=BTC-USDT`);
  console.log(`GET http://localhost:${PORT}/bingx/open_interest?symbol=BTC-USDT`);
  console.log(`GET http://localhost:${PORT}/bingx/orderbook?symbol=BTC-USDT&limit=50`);
  console.log(`GET http://localhost:${PORT}/bingx/funding_history?symbol=BTC-USDT&limit=20`);
  console.log(`GET http://localhost:${PORT}/collect_derivatives_history?symbol=BTC-USDT`);
  console.log(
    `GET http://localhost:${PORT}/collect_market_snapshot?symbol=BTC-USDT&klineLimit=200&depthLimit=50`
  );
  console.log(
    `GET http://localhost:${PORT}/run_full_snapshot?symbol=BTC-USDT&klineLimit=200&depthLimit=50`
  );

  // Start derivatives history scheduler
  startDerivativesHistoryScheduler();

  startVolatilityHistoryScheduler();

  console.log(`GET http://localhost:${PORT}/collect_volatility_history?symbol=BTC-USDT`);


  // Optional: run snapshot on startup
  (async () => {
    try {
      await runFullSnapshotOnce({ symbol: "BTC-USDT", klineLimit: 200, depthLimit: 50 });
    } catch (err) {
      console.error("[Startup] Failed to run full snapshot:", err);
    }
  })();
});
