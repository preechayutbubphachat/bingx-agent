"use client";

import { useMemo } from "react";
import dynamic from "next/dynamic";
import MarketStatusCard from "@/components/MarketStatusCard";
import { resolvePlanView } from "@/lib/resolvePlanView";
import { usePlanStatus } from "@/components/plan-status/PlanStatusProvider";

const MarketRegimeMiniChart = dynamic(() => import("@/components/MarketRegimeMiniChart"), {
  ssr: false,
});

type AnyRecord = Record<string, any>;

type Candle = { time: number; open: number; high: number; low: number; close: number };

type MapLineKind =
  | "SWING_HIGH"
  | "SWING_LOW"
  | "EQ"
  | "EQH"
  | "EQL"
  | "RANGE_TOP"
  | "RANGE_BOT"
  | "PULLBACK_HIGH"
  | "PULLBACK_LOW"
  | "ENTRY_LOW"
  | "ENTRY_HIGH"
  | "ENTRY_MID"
  | "SL"
  | "TP1"
  | "GRID_U"
  | "GRID_L";

type MapLine = {
  kind: MapLineKind;
  price: number;
  title: string;
  kinds?: MapLineKind[];
  mergedTitles?: string[];
};

type LqCluster = { level: number; count: number };

type LiquidityMap = {
  atr14?: number;
  swingHighs: number[];
  swingLows: number[];
  lastSwingHigh?: number;
  lastSwingLow?: number;
  eqh: LqCluster[];
  eql: LqCluster[];
  range?: { top: number; bot: number };
};

type SweepRisk = {
  score: number;
  label: "LOW" | "MED" | "HIGH";
  target?: { dir: "UP" | "DOWN"; name: string; price: number };
};

type PlanSupport = {
  canonicalPlan: AnyRecord | null;
  derivedPlan: AnyRecord | null;
  obEntry: AnyRecord | null;
};

const KIND_PRIORITY: Record<MapLineKind, number> = {
  SL: 100,
  TP1: 95,
  ENTRY_MID: 92,
  ENTRY_LOW: 90,
  ENTRY_HIGH: 90,
  SWING_HIGH: 82,
  SWING_LOW: 82,
  EQH: 80,
  EQL: 80,
  EQ: 75,
  GRID_U: 70,
  GRID_L: 70,
  PULLBACK_HIGH: 60,
  PULLBACK_LOW: 60,
  RANGE_TOP: 40,
  RANGE_BOT: 40,
};

const PRICE_BUCKET = 0.5;

function toMs(ts: unknown): number | undefined {
  if (typeof ts !== "number" || !Number.isFinite(ts)) return undefined;
  return ts < 1e12 ? ts * 1000 : ts;
}

function toSec(ts: unknown): number | undefined {
  const n = typeof ts === "number" ? ts : Number(ts);
  if (!Number.isFinite(n)) return undefined;
  return n >= 1e12 ? Math.floor(n / 1000) : Math.floor(n);
}

function getPath(obj: unknown, path: string): any {
  try {
    return path.split(".").reduce((acc: any, k) => (acc == null ? undefined : acc[k]), obj);
  } catch {
    return undefined;
  }
}

function pick(obj: unknown, paths: string[]) {
  for (const p of paths) {
    const v = getPath(obj, p);
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return undefined;
}

function pickFirst(...values: any[]) {
  for (const v of values) {
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return undefined;
}

function toNum(x: unknown): number | null {
  const n = typeof x === "number" ? x : Number(x);
  return Number.isFinite(n) ? n : null;
}

function normalizeCandles(raw: unknown): Candle[] {
  if (!Array.isArray(raw)) return [];

  const mapped: Candle[] = raw
    .map((c: any) => {
      const time = toSec(c?.time ?? c?.t);
      const open = toNum(c?.open ?? c?.o);
      const high = toNum(c?.high ?? c?.h);
      const low = toNum(c?.low ?? c?.l);
      const close = toNum(c?.close ?? c?.c);

      if (time == null || open == null || high == null || low == null || close == null) return null;
      return { time, open, high, low, close };
    })
    .filter((x): x is Candle => !!x);

  mapped.sort((a, b) => a.time - b.time);

  const out: Candle[] = [];
  for (const c of mapped) {
    const prev = out[out.length - 1];
    if (prev && prev.time === c.time) out[out.length - 1] = c;
    else out.push(c);
  }

  return out;
}

function normalizeZone(z: unknown): [number, number] | null {
  if (!z) return null;

  if (Array.isArray(z)) {
    const a = Number(z[0]);
    const b = Number(z[1]);
    if (Number.isFinite(a) && Number.isFinite(b)) return [Math.min(a, b), Math.max(a, b)];
  }

  if (typeof z === "object" && z !== null) {
    const obj = z as AnyRecord;
    const lo = Number(obj.low ?? obj.l ?? obj.min);
    const hi = Number(obj.high ?? obj.h ?? obj.max);
    if (Number.isFinite(lo) && Number.isFinite(hi)) return [Math.min(lo, hi), Math.max(lo, hi)];
  }

  return null;
}

function failSafeTone(mode: string | undefined) {
  const m = String(mode ?? "UNKNOWN").toUpperCase();
  if (m === "HARD_STOP") return "bg-rose-500/15 text-rose-200 border-rose-500/30";
  if (m === "DEGRADED") return "bg-amber-500/15 text-amber-200 border-amber-500/30";
  if (m === "NORMAL") return "bg-emerald-500/15 text-emerald-200 border-emerald-500/30";
  return "bg-neutral-500/15 text-neutral-200 border-neutral-500/30";
}

/**
 * Canonical plan only = top-level root plan
 */
function getCanonicalPlan(data: unknown) {
  return (data as AnyRecord | null)?.plan ?? null;
}

/**
 * Derived plan only = plan_status_state.plan
 */
function getDerivedPlan(data: unknown) {
  const obj = data as AnyRecord | null;
  return obj?.plan_status_state?.plan ?? null;
}

function bucketKey(price: number) {
  const b = Math.round(price / PRICE_BUCKET) * PRICE_BUCKET;
  return b.toFixed(2);
}

function mergeTitle(a: string, b: string) {
  const set = new Set<string>();
  for (const x of [a, b]) {
    String(x)
      .split("|")
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((t) => set.add(t));
  }
  return Array.from(set).join(" | ");
}

function pickHigherPriority(a: MapLine, b: MapLine): MapLine {
  return (KIND_PRIORITY[a.kind] ?? 0) >= (KIND_PRIORITY[b.kind] ?? 0) ? a : b;
}

function atr14(c: Candle[]): number | null {
  if (c.length < 15) return null;

  const trs: number[] = [];
  for (let i = 1; i < c.length; i++) {
    const hi = c[i].high;
    const lo = c[i].low;
    const pc = c[i - 1].close;
    const tr = Math.max(hi - lo, Math.abs(hi - pc), Math.abs(lo - pc));
    trs.push(tr);
  }

  const last14 = trs.slice(-14);
  const avg = last14.reduce((a, b) => a + b, 0) / last14.length;
  return Number.isFinite(avg) ? avg : null;
}

function fractalSwings(c: Candle[], left = 2, right = 2) {
  const highs: number[] = [];
  const lows: number[] = [];

  for (let i = left; i < c.length - right; i++) {
    const h = c[i].high;
    const l = c[i].low;

    let isH = true;
    let isL = true;

    for (let k = 1; k <= left; k++) {
      if (!(h > c[i - k].high)) isH = false;
      if (!(l < c[i - k].low)) isL = false;
    }
    for (let k = 1; k <= right; k++) {
      if (!(h >= c[i + k].high)) isH = false;
      if (!(l <= c[i + k].low)) isL = false;
    }

    if (isH) highs.push(h);
    if (isL) lows.push(l);
  }

  return { highs, lows };
}

function clusterLevels(levels: number[], tol: number, maxOut = 3): LqCluster[] {
  if (levels.length < 2) return [];

  const arr = [...levels].filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  const out: LqCluster[] = [];

  let group: number[] = [arr[0]];
  for (let i = 1; i < arr.length; i++) {
    const v = arr[i];
    const prev = group[group.length - 1];
    if (Math.abs(v - prev) <= tol) {
      group.push(v);
    } else {
      if (group.length >= 2) {
        const avg = group.reduce((a, b) => a + b, 0) / group.length;
        out.push({ level: avg, count: group.length });
      }
      group = [v];
    }
  }

  if (group.length >= 2) {
    const avg = group.reduce((a, b) => a + b, 0) / group.length;
    out.push({ level: avg, count: group.length });
  }

  out.sort((a, b) => b.count - a.count);
  return out.slice(0, maxOut);
}

function buildLiquidityMap1h(c: Candle[]): LiquidityMap {
  const atr = atr14(c) ?? undefined;
  const lastClose = c.at(-1)?.close ?? 0;
  const tol = Math.max((atr ?? 0) * 0.15, lastClose * 0.0007);

  const swings = fractalSwings(c, 2, 2);
  const swingHighs = swings.highs.slice(-20);
  const swingLows = swings.lows.slice(-20);

  const eqh = clusterLevels(swingHighs, tol, 3);
  const eql = clusterLevels(swingLows, tol, 3);

  const lastSwingHigh = swingHighs.at(-1);
  const lastSwingLow = swingLows.at(-1);

  const top = swingHighs.slice(-3).reduce((m, v) => Math.max(m, v), -Infinity);
  const bot = swingLows.slice(-3).reduce((m, v) => Math.min(m, v), Infinity);
  const range = Number.isFinite(top) && Number.isFinite(bot) && top > bot ? { top, bot } : undefined;

  return {
    atr14: atr,
    swingHighs,
    swingLows,
    lastSwingHigh,
    lastSwingLow,
    eqh,
    eql,
    range,
  };
}

function sweepTone(label: SweepRisk["label"]) {
  if (label === "HIGH") return "bg-rose-500/15 text-rose-200 border-rose-500/30";
  if (label === "MED") return "bg-amber-500/15 text-amber-200 border-amber-500/30";
  return "bg-emerald-500/15 text-emerald-200 border-emerald-500/30";
}

function sweepRisk(c: Candle[], liq: LiquidityMap, extraPools: { name: string; price: number }[] = []): SweepRisk {
  const last = c.at(-1);
  const atr = liq.atr14;

  if (!last || !atr || !Number.isFinite(last.close)) return { score: 0, label: "LOW" };

  const px = last.close;
  const pools: { name: string; price: number }[] = [];

  if (liq.lastSwingHigh) pools.push({ name: "SWING HIGH", price: liq.lastSwingHigh });
  if (liq.lastSwingLow) pools.push({ name: "SWING LOW", price: liq.lastSwingLow });

  for (const x of liq.eqh) pools.push({ name: "EQH", price: x.level });
  for (const x of liq.eql) pools.push({ name: "EQL", price: x.level });

  if (liq.range?.top) pools.push({ name: "RANGE TOP", price: liq.range.top });
  if (liq.range?.bot) pools.push({ name: "RANGE BOT", price: liq.range.bot });

  for (const p of extraPools) {
    if (Number.isFinite(p.price)) pools.push(p);
  }

  let up: { name: string; price: number; d: number } | null = null;
  let dn: { name: string; price: number; d: number } | null = null;

  for (const p of pools) {
    if (p.price > px) {
      const d = p.price - px;
      if (!up || d < up.d) up = { ...p, d };
    } else if (p.price < px) {
      const d = px - p.price;
      if (!dn || d < dn.d) dn = { ...p, d };
    }
  }

  const chosen =
    up && dn
      ? up.d < dn.d
        ? { dir: "UP" as const, ...up }
        : { dir: "DOWN" as const, ...dn }
      : up
        ? { dir: "UP" as const, ...up }
        : dn
          ? { dir: "DOWN" as const, ...dn }
          : null;

  if (!chosen) return { score: 0, label: "LOW" };

  let score = 0;

  if (chosen.d < 0.6 * atr) score++;
  if (chosen.d < 1.0 * atr) score++;

  const last3 = c.slice(-3).map((x) => x.close);
  if (last3.length === 3) {
    if (chosen.dir === "UP" && last3[0] < last3[1] && last3[1] < last3[2]) score++;
    if (chosen.dir === "DOWN" && last3[0] > last3[1] && last3[1] > last3[2]) score++;
  }

  const tol = Math.max(atr * 0.15, px * 0.0007);
  const taps = c
    .slice(-50)
    .filter((x) => Math.abs(x.high - chosen.price) <= tol || Math.abs(x.low - chosen.price) <= tol).length;
  if (taps >= 3) score++;

  const r5 = c.slice(-5).reduce((a, x) => a + (x.high - x.low), 0) / Math.max(1, Math.min(5, c.length));
  const mid = c.slice(-25, -5);
  const r20 = mid.length ? mid.reduce((a, x) => a + (x.high - x.low), 0) / mid.length : 0;
  if (r20 > 0 && r5 < 0.6 * r20) score++;

  if (chosen.name === "EQH" || chosen.name === "EQL") score++;

  score = Math.max(0, Math.min(5, score));
  const label: SweepRisk["label"] = score >= 4 ? "HIGH" : score >= 2 ? "MED" : "LOW";
  return { score, label, target: { dir: chosen.dir, name: chosen.name, price: chosen.price } };
}

/**
 * Boundary:
 * - canonicalPlan = root plan only
 * - derivedPlan = plan_status_state.plan only
 * - obEntry = route live/derived execution context
 */
function getPlanSupport(data: unknown): PlanSupport {
  const obj = data as AnyRecord | null;
  return {
    canonicalPlan: getCanonicalPlan(data),
    derivedPlan: getDerivedPlan(data),
    obEntry: obj?.ob_gate?.entry ?? null,
  };
}

function pickFromPlan(plan: AnyRecord | null, paths: string[]) {
  return pick(plan, paths);
}

/**
 * Prefer canonical root first, then derived state plan.
 * rawFallbacks should only be compat reads, not truth owners.
 */
function pickPlanValue(
  planSupport: PlanSupport,
  canonicalPaths: string[],
  derivedPaths: string[],
  rawFallbacks: any[] = []
) {
  const fromCanonical = pickFromPlan(planSupport.canonicalPlan, canonicalPaths);
  if (fromCanonical !== undefined && fromCanonical !== null && fromCanonical !== "") return fromCanonical;

  const fromDerived = pickFromPlan(planSupport.derivedPlan, derivedPaths);
  if (fromDerived !== undefined && fromDerived !== null && fromDerived !== "") return fromDerived;

  return pickFirst(...rawFallbacks);
}

/**
 * updated_at truth for this row = route top-level updated_at/source_updated_at
 */
function pickRouteUpdatedAt(data: AnyRecord | null): number | undefined {
  return toMs(data?.updated_at) ?? toMs(data?.source_updated_at);
}

/**
 * Candles truth for this row = route market_data only
 */
function pickRouteCandles(data: AnyRecord | null, tf: "1h" | "any"): Candle[] {
  const oneHourCandidates = [
    "market_data.klines.1h.candles",
    "market_data.klines.1H.candles",
    "market_data.klines.H1.candles",
    "market_data.klines.60m.candles",
    "market_data.klines.1h",
    "market_data.klines.1H",
    "market_data.klines.H1",
    "market_data.klines.60m",
  ];

  const anyCandidates = [
    ...oneHourCandidates,
    "market_data.klines.15m.candles",
    "market_data.klines.15M.candles",
    "market_data.klines.5m.candles",
    "market_data.klines.5M.candles",
    "market_data.klines.1d.candles",
    "market_data.klines.1D.candles",
    "market_data.klines.15m",
    "market_data.klines.15M",
    "market_data.klines.5m",
    "market_data.klines.5M",
    "market_data.klines.1d",
    "market_data.klines.1D",
  ];

  const candidates = tf === "1h" ? oneHourCandidates : anyCandidates;

  for (const p of candidates) {
    const raw = pick(data, [p]);
    const arr = normalizeCandles(raw);
    if (arr.length > 0) return arr.slice(-200);
  }

  return [];
}

export default function MarketRegimeRow() {
  const { data, error } = usePlanStatus();

  const raw = data as AnyRecord | null;
  const planView = useMemo(() => (data ? resolvePlanView(data) : null), [data]);
  const planSupport = useMemo(() => getPlanSupport(data), [data]);

  const updatedAtView = useMemo(() => pickRouteUpdatedAt(raw), [raw]);

  const candles1h = useMemo(() => pickRouteCandles(raw, "1h"), [raw]);
  const candlesAny = useMemo(() => pickRouteCandles(raw, "any"), [raw]);

  const chartCandles = candles1h.length ? candles1h : candlesAny;
  const liqBaseCandles = candles1h.length ? candles1h : chartCandles;

  const liq = useMemo(() => buildLiquidityMap1h(liqBaseCandles), [liqBaseCandles]);

  const lines = useMemo((): MapLine[] => {
    const eq = toNum(
      pickPlanValue(
        planSupport,
        ["trend.eq_1h", "eq_1h"],
        ["trend.eq_1h", "eq_1h"],
        [
          pick(planSupport.canonicalPlan, ["levels.smc.eq_1h"]),
          pick(planSupport.derivedPlan, ["levels.smc.eq_1h"]),
        ]
      )
    );

    const swingHigh = toNum(
      pickPlanValue(
        planSupport,
        ["trend.swing_high_1h", "swing_high_1h"],
        ["trend.swing_high_1h", "swing_high_1h"],
        [
          pick(planSupport.canonicalPlan, ["levels.smc.swing_high_1h"]),
          pick(planSupport.derivedPlan, ["levels.smc.swing_high_1h"]),
        ]
      )
    );

    const swingLow = toNum(
      pickPlanValue(
        planSupport,
        ["trend.swing_low_1h", "swing_low_1h"],
        ["trend.swing_low_1h", "swing_low_1h"],
        [
          pick(planSupport.canonicalPlan, ["levels.smc.swing_low_1h"]),
          pick(planSupport.derivedPlan, ["levels.smc.swing_low_1h"]),
        ]
      )
    );

    const gridUpper = toNum(
      pickPlanValue(
        planSupport,
        ["grid.upper", "parameters_for_grid_or_trend.grid_upper"],
        ["grid.upper", "parameters_for_grid_or_trend.grid_upper"]
      )
    );

    const gridLower = toNum(
      pickPlanValue(
        planSupport,
        ["grid.lower", "parameters_for_grid_or_trend.grid_lower"],
        ["grid.lower", "parameters_for_grid_or_trend.grid_lower"]
      )
    );

    const rangeTop = gridUpper ?? swingHigh;
    const rangeBot = gridLower ?? swingLow;

    const pullbackRaw = pickFirst(
      pick(planSupport.canonicalPlan, ["trend.pullback_zone", "trend.pullbackZone"]),
      pick(planSupport.derivedPlan, ["trend.pullback_zone", "trend.pullbackZone"])
    );

    const pullbackZone = normalizeZone(pullbackRaw);

    const entryRaw = planSupport.obEntry ?? null;
    const entryZoneRaw = pick(entryRaw, ["entry_zone", "zone", "entryZone", "price_zone"]);
    const entryZone = normalizeZone(entryZoneRaw);

    const entrySL =
      toNum(pick(entryRaw, ["sl", "stop", "stop_loss"])) ??
      toNum(
        pickFirst(
          pick(planSupport.canonicalPlan, ["trend.invalidation"]),
          pick(planSupport.derivedPlan, ["trend.invalidation"])
        )
      );

    const entryTP1 =
      toNum(pick(entryRaw, ["tp1", "target1", "t1"])) ??
      toNum(
        pickFirst(
          pick(planSupport.canonicalPlan, ["trend.tp1", "trend.targets.t1"]),
          pick(planSupport.derivedPlan, ["trend.tp1", "trend.targets.t1"])
        )
      );

    const entryMid =
      entryZone ? (Math.min(entryZone[0], entryZone[1]) + Math.max(entryZone[0], entryZone[1])) / 2 : null;

    const out: MapLine[] = [];

    if (swingHigh != null) out.push({ kind: "SWING_HIGH", price: swingHigh, title: "SWING HIGH (1H)" });
    if (swingLow != null) out.push({ kind: "SWING_LOW", price: swingLow, title: "SWING LOW (1H)" });
    if (eq != null) out.push({ kind: "EQ", price: eq, title: "EQ" });

    if (gridUpper != null) out.push({ kind: "GRID_U", price: gridUpper, title: "GRID U" });
    if (gridLower != null) out.push({ kind: "GRID_L", price: gridLower, title: "GRID L" });

    if (rangeTop != null && rangeTop !== gridUpper) {
      out.push({ kind: "RANGE_TOP", price: rangeTop, title: "RANGE TOP" });
    }
    if (rangeBot != null && rangeBot !== gridLower) {
      out.push({ kind: "RANGE_BOT", price: rangeBot, title: "RANGE BOT" });
    }

    if (pullbackZone) {
      const lo = Math.min(pullbackZone[0], pullbackZone[1]);
      const hi = Math.max(pullbackZone[0], pullbackZone[1]);
      if (Number.isFinite(lo)) out.push({ kind: "PULLBACK_LOW", price: lo, title: "PULLBACK L" });
      if (Number.isFinite(hi)) out.push({ kind: "PULLBACK_HIGH", price: hi, title: "PULLBACK H" });
    }

    if (entryZone) {
      const lo = Math.min(entryZone[0], entryZone[1]);
      const hi = Math.max(entryZone[0], entryZone[1]);
      if (Number.isFinite(lo)) out.push({ kind: "ENTRY_LOW", price: lo, title: "ENTRY L" });
      if (Number.isFinite(hi)) out.push({ kind: "ENTRY_HIGH", price: hi, title: "ENTRY H" });
    }

    if (entryMid != null && Number.isFinite(entryMid)) {
      out.push({ kind: "ENTRY_MID", price: entryMid, title: "ENTRY MID" });
    }
    if (entrySL != null) out.push({ kind: "SL", price: entrySL, title: "SL" });
    if (entryTP1 != null) out.push({ kind: "TP1", price: entryTP1, title: "TP1" });

    if (liq.lastSwingHigh != null) {
      out.push({ kind: "SWING_HIGH", price: liq.lastSwingHigh, title: "SWING HIGH (MAP)" });
    }
    if (liq.lastSwingLow != null) {
      out.push({ kind: "SWING_LOW", price: liq.lastSwingLow, title: "SWING LOW (MAP)" });
    }

    liq.eqh.forEach((x, i) => out.push({ kind: "EQH", price: x.level, title: `EQH${i + 1} (${x.count})` }));
    liq.eql.forEach((x, i) => out.push({ kind: "EQL", price: x.level, title: `EQL${i + 1} (${x.count})` }));

    if (liq.range?.top != null) {
      out.push({ kind: "RANGE_TOP", price: liq.range.top, title: "RANGE TOP (MAP)" });
    }
    if (liq.range?.bot != null) {
      out.push({ kind: "RANGE_BOT", price: liq.range.bot, title: "RANGE BOT (MAP)" });
    }

    const finite = out.filter((x) => typeof x.price === "number" && Number.isFinite(x.price));

    const merged = new Map<string, MapLine>();
    for (const ln of finite) {
      const key = bucketKey(ln.price);
      const prev = merged.get(key);

      if (!prev) {
        merged.set(key, { ...ln, kinds: [ln.kind], mergedTitles: [ln.title] });
        continue;
      }

      const rep = pickHigherPriority(prev, ln);

      merged.set(key, {
        ...rep,
        price: rep.price,
        title: mergeTitle(prev.title, ln.title),
        kinds: Array.from(new Set([...(prev.kinds ?? [prev.kind]), ln.kind])),
        mergedTitles: Array.from(new Set([...(prev.mergedTitles ?? [prev.title]), ln.title])),
      });
    }

    let arr = Array.from(merged.values()).sort((a, b) => a.price - b.price);

    const MAX_LINES = 14;
    if (arr.length > MAX_LINES) {
      arr = arr
        .slice()
        .sort((a, b) => (KIND_PRIORITY[b.kind] ?? 0) - (KIND_PRIORITY[a.kind] ?? 0))
        .slice(0, MAX_LINES)
        .sort((a, b) => a.price - b.price);
    }

    return arr;
  }, [planSupport, liq]);

  const sweep = useMemo(() => {
    const gridUpper = toNum(
      pickFirst(
        pick(planSupport.canonicalPlan, ["grid.upper", "parameters_for_grid_or_trend.grid_upper"]),
        pick(planSupport.derivedPlan, ["grid.upper", "parameters_for_grid_or_trend.grid_upper"])
      )
    );

    const gridLower = toNum(
      pickFirst(
        pick(planSupport.canonicalPlan, ["grid.lower", "parameters_for_grid_or_trend.grid_lower"]),
        pick(planSupport.derivedPlan, ["grid.lower", "parameters_for_grid_or_trend.grid_lower"])
      )
    );

    const eq = toNum(
      pickFirst(
        pick(planSupport.canonicalPlan, ["trend.eq_1h", "eq_1h"]),
        pick(planSupport.derivedPlan, ["trend.eq_1h", "eq_1h"])
      )
    );

    const extra: { name: string; price: number }[] = [];
    if (gridUpper != null) extra.push({ name: "GRID U", price: gridUpper });
    if (gridLower != null) extra.push({ name: "GRID L", price: gridLower });
    if (eq != null) extra.push({ name: "EQ", price: eq });

    const base = candles1h.length ? candles1h : liqBaseCandles;
    return sweepRisk(base, liq, extra);
  }, [candles1h, liq, liqBaseCandles, planSupport]);

  const truthBoundary = raw?.debug?.truth_boundary ?? null;
  const stateGuard = raw?.plan_status_state?.__state_guard ?? null;
  const canonicalInfo = raw?.canonical ?? raw?.canonical_status_meta ?? null;
  const failSafe = raw?.fail_safe ?? null;

  if (error) {
    return (
      <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-5 text-rose-200">
        โหลด Market Regime ไม่ได้: {error}
      </div>
    );
  }

  if (!data || !planView) {
    return (
      <div className="rounded-2xl border border-neutral-700 bg-neutral-900 p-5 text-neutral-300">
        กำลังโหลด Market Regime…
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full border px-3 py-1 text-xs ${sweepTone(sweep.label)}`}>
          Sweep Risk: {sweep.label} ({sweep.score}/5)
          {sweep.target
            ? ` · ${sweep.target.dir === "UP" ? "↑" : "↓"} ${sweep.target.name} @ ${Math.round(sweep.target.price)}`
            : ""}
        </span>

        <span className={`rounded-full border px-3 py-1 text-xs ${failSafeTone(planView.fail_safe_mode)}`}>
          fail-safe: {planView.fail_safe_mode ?? "UNKNOWN"}
        </span>

        <span className="text-xs text-neutral-500">
          Chart = 1H ({candles1h.length || chartCandles.length || 0}/200) · Liquidity map = 1H (
          {liqBaseCandles.length || 0}/200)
        </span>

        <span className="text-xs text-emerald-300/80">source: provider</span>

        <span className="text-xs text-neutral-500">
          resolver: {planView.source} • route: {planView.resolved_plan_source ?? raw?.resolved_plan_source ?? "—"}
        </span>

        <span className="text-xs text-neutral-500">payload: {planView.payload_kind ?? raw?.payload_kind ?? "—"}</span>

        <span className="text-xs text-neutral-500">
          canonical root: {planView.canonical_root_plan_present ? "yes" : "no"} • state plan: {planView.state_plan_present ? "yes" : "no"}
        </span>

        <span className="text-xs text-neutral-500">
          state owner: {truthBoundary?.regenerated_state_owner ?? stateGuard?.regeneration_mode ?? "route_fresh_derived_snapshot"}
        </span>
      </div>

      {(planView.truth_note || planView.fail_safe_reasons.length > 0 || failSafe?.source_marker || failSafe?.build_marker) && (
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4 text-xs text-neutral-300">
          {planView.truth_note ? <div>{planView.truth_note}</div> : null}

          <div className="mt-2 flex flex-wrap items-center gap-3 text-neutral-500">
            <span>uses canonical: {planView.uses_canonical_plan ? "yes" : "no"}</span>
            <span>uses state: {planView.uses_state_plan ? "yes" : "no"}</span>
            <span>canonical root present: {canonicalInfo?.root_plan_present ?? canonicalInfo?.has_plan ? "yes" : "no"}</span>
          </div>

          {(failSafe?.source_marker || failSafe?.build_marker) && (
            <div className="mt-2 text-neutral-500">
              route markers: source={failSafe?.source_marker ?? raw?.route_source_marker ?? "—"} · build={failSafe?.build_marker ?? raw?.route_build_marker ?? "—"}
            </div>
          )}

          {planView.fail_safe_reasons.length > 0 && (
            <div className="mt-2">
              <div className="mb-1 text-neutral-500">fail-safe reasons</div>
              <ul className="space-y-1">
                {planView.fail_safe_reasons.map((reason: string, index: number) => (
                  <li key={`${reason}-${index}`}>• {reason}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <MarketRegimeMiniChart candles={chartCandles} lines={lines as any} height={360} visibleCount={200} labelTf="1h" />

      <MarketStatusCard
        regime={planView.market_regime}
        marketMode={planView.market_mode}
        confidence={planView.confidence}
        updatedAt={updatedAtView}
        riskWarnings={planView.risk_warning}
      />
    </div>
  );
}
