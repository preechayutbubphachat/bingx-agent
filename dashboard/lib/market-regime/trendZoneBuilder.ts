// dashboard/lib/market-regime/trendZoneBuilder.ts
// Phase D — Trend Zone Builder Shadow (read-only diagnostics).
// Pure: no I/O, no side effects, no trading behaviour. NEVER used for orders.
// Always shadowOnly:true, paperActivationAllowed:false, liveActivationAllowed:false.

export interface TrendZoneCandle {
  t: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export type TrendZoneBuildStatus = "READY" | "INSUFFICIENT_DATA" | "NOT_TREND" | "FAILED";

export interface TrendZoneShadow {
  buildStatus: TrendZoneBuildStatus;
  dir: "UP" | "DOWN" | null;
  pullbackZone: [number, number] | null;
  invalidation: number | null;
  triggerRule: string | null;
  targets: { t1: number | null; t2: number | null };
  entry: { type: "LIMIT" | "CONFIRM" | null; hint: string | null };
  smc: {
    swingHigh1h: number | null;
    swingLow1h: number | null;
    eq1h: number | null;
    liquidityNote: string | null;
  };
  warnings: string[];
  shadowOnly: true;
  paperActivationAllowed: false;
  liveActivationAllowed: false;
}

export interface TrendZoneBuilderInput {
  regime: string | null;
  direction: string | null;
  candles1h: TrendZoneCandle[] | null | undefined;
  atr1h?: number | null;
  ema50_1h?: number | null;
  session?: string | null;
  sweepRisk?: string | boolean | null;
  latestPrice?: number | null;
}

const SWING_WINDOW = 60;     // ใช้ candle 1H ล่าสุดสูงสุด 60 แท่ง
const SWING_LOOKBACK = 20;   // หา swing ใน 20 แท่งล่าสุด
const MIN_CANDLES = 20;      // ต้องมีอย่างน้อย 20 แท่ง
const RECENT_CONFIRM = 5;    // ตรวจ invalidation จาก 5 แท่งล่าสุด

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function cleanCandles(candles: TrendZoneCandle[] | null | undefined): TrendZoneCandle[] {
  if (!Array.isArray(candles)) return [];
  return candles
    .filter((c) => finite(c?.t) && finite(c?.open) && finite(c?.high) && finite(c?.low) && finite(c?.close) && c.high >= c.low)
    .slice()
    .sort((a, b) => a.t - b.t);
}

function base(
  status: TrendZoneBuildStatus,
  dir: "UP" | "DOWN" | null,
  warnings: string[],
): TrendZoneShadow {
  return {
    buildStatus: status,
    dir,
    pullbackZone: null,
    invalidation: null,
    triggerRule: null,
    targets: { t1: null, t2: null },
    entry: { type: null, hint: null },
    smc: { swingHigh1h: null, swingLow1h: null, eq1h: null, liquidityNote: null },
    warnings,
    shadowOnly: true,
    paperActivationAllowed: false,
    liveActivationAllowed: false,
  };
}

function resolveTrigger(
  session: string | null | undefined,
  sweepRisk: string | boolean | null | undefined,
): { triggerRule: string; hint: string } {
  const sess = String(session ?? "").toUpperCase();
  const highSweep =
    sweepRisk === true ||
    String(sweepRisk ?? "").toUpperCase() === "HIGH";
  const isLondonNy = sess.includes("LONDON") || sess.includes("NY") || sess.includes("NEW_YORK") || sess.includes("NEWYORK");
  if (isLondonNy || highSweep) {
    return {
      triggerRule: "รอ 5m ยืนยันกลับตัวก่อนเข้า",
      hint: "รอ 5m ปิดกลับจากโซน พร้อม momentum อ่อนแรงก่อนพิจารณา",
    };
  }
  return {
    triggerRule: "แตะโซนแล้วมี rejection ค่อยพิจารณา",
    hint: "ยังเป็น Shadow เท่านั้น ไม่ใช้ส่งคำสั่ง",
  };
}

export function buildTrendZoneShadow(input: TrendZoneBuilderInput): TrendZoneShadow {
  const regime = String(input.regime ?? "").toUpperCase();
  const isDown = regime === "DOWNTREND" || regime === "TREND_DOWN";
  const isUp = regime === "UPTREND" || regime === "TREND_UP";

  // NOT a trend regime → no zone (shadow)
  if (!isDown && !isUp) {
    return base("NOT_TREND", null, ["regime_is_not_trend_no_zone_built"]);
  }

  const dir: "UP" | "DOWN" = isUp ? "UP" : "DOWN";
  const candles = cleanCandles(input.candles1h);

  if (candles.length < MIN_CANDLES) {
    return base("INSUFFICIENT_DATA", dir, ["insufficient_1h_candles_trend_zone_build_failed"]);
  }

  const window = candles.slice(-SWING_WINDOW);
  const recent = window.slice(-SWING_LOOKBACK);
  const swingHigh1h = Math.max(...recent.map((c) => c.high));
  const swingLow1h = Math.min(...recent.map((c) => c.low));
  const range = swingHigh1h - swingLow1h;

  const warnings: string[] = [];
  // invalidation check from last 5 candles (still-forming swing)
  const last5 = recent.slice(-RECENT_CONFIRM);
  const older = recent.slice(0, -RECENT_CONFIRM);
  if (older.length) {
    const olderHigh = Math.max(...older.map((c) => c.high));
    const olderLow = Math.min(...older.map((c) => c.low));
    if (Math.max(...last5.map((c) => c.high)) > olderHigh) warnings.push("swing_high_forming_in_last_5_candles");
    if (Math.min(...last5.map((c) => c.low)) < olderLow) warnings.push("swing_low_forming_in_last_5_candles");
  }

  if (!(range > 0)) {
    // degenerate swing → safe fallback policy: FAILED, document EMA50 fallback as next stage
    const w = ["trend_zone_build_failed_degenerate_swing_range"];
    if (finite(input.ema50_1h) && finite(input.atr1h)) w.push("ema50_atr_fallback_zone_deferred_to_next_stage");
    return base("FAILED", dir, w);
  }

  const eq1h = (swingHigh1h + swingLow1h) / 2;
  let zoneLow: number;
  let zoneHigh: number;
  let invalidation: number | null;
  let t1: number;

  if (dir === "DOWN") {
    // pullback ขึ้นไปเติมก่อนลงต่อ: 0.50–0.618 retrace จาก swingLow
    zoneLow = swingLow1h + 0.5 * range;
    zoneHigh = swingLow1h + 0.618 * range;
    invalidation = finite(input.atr1h) ? swingHigh1h + 0.2 * input.atr1h! : swingHigh1h;
    if (!finite(input.atr1h)) warnings.push("atr1h_missing_invalidation_uses_swing_high_no_buffer");
    t1 = swingLow1h;
  } else {
    // UPTREND pullback ลงมาเติมก่อนขึ้นต่อ
    zoneLow = swingHigh1h - 0.618 * range;
    zoneHigh = swingHigh1h - 0.5 * range;
    invalidation = finite(input.atr1h) ? swingLow1h - 0.2 * input.atr1h! : swingLow1h;
    if (!finite(input.atr1h)) warnings.push("atr1h_missing_invalidation_uses_swing_low_no_buffer");
    t1 = swingHigh1h;
  }

  const pullbackZone: [number, number] = zoneLow <= zoneHigh ? [zoneLow, zoneHigh] : [zoneHigh, zoneLow];
  const { triggerRule, hint } = resolveTrigger(input.session, input.sweepRisk);
  const liquidityNote =
    dir === "DOWN"
      ? "sell-side liquidity ใต้ swingLow · buy-side liquidity เหนือ swingHigh (pullback เติมก่อนลงต่อ)"
      : "buy-side liquidity เหนือ swingHigh · sell-side liquidity ใต้ swingLow (pullback เติมก่อนขึ้นต่อ)";

  return {
    buildStatus: "READY",
    dir,
    pullbackZone,
    invalidation,
    triggerRule,
    targets: { t1, t2: null },
    entry: { type: "CONFIRM", hint }, // CONFIRM เสมอเพื่อความปลอดภัย (ไม่ emit LIMIT)
    smc: { swingHigh1h, swingLow1h, eq1h, liquidityNote },
    warnings,
    shadowOnly: true,
    paperActivationAllowed: false,
    liveActivationAllowed: false,
  };
}
