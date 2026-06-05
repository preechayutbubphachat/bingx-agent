import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTrendZoneShadow, type TrendZoneCandle } from "./trendZoneBuilder.ts";

// helper: สร้าง candle 1H ลาดลง (downtrend) จำนวน n แท่ง
function downtrendCandles(n: number): TrendZoneCandle[] {
  const out: TrendZoneCandle[] = [];
  let price = 70000;
  for (let i = 0; i < n; i++) {
    const open = price;
    const close = price - 120;
    out.push({ t: 1_780_000_000_000 + i * 3_600_000, open, high: open + 60, low: close - 60, close, volume: 100 });
    price = close;
  }
  return out;
}

function uptrendCandles(n: number): TrendZoneCandle[] {
  const out: TrendZoneCandle[] = [];
  let price = 60000;
  for (let i = 0; i < n; i++) {
    const open = price;
    const close = price + 120;
    out.push({ t: 1_780_000_000_000 + i * 3_600_000, open, high: close + 60, low: open - 60, close, volume: 100 });
    price = close;
  }
  return out;
}

test("1. DOWNTREND creates 0.50–0.618 pullback zone", () => {
  const c = downtrendCandles(40);
  const z = buildTrendZoneShadow({ regime: "DOWNTREND", direction: "BEARISH", candles1h: c, atr1h: 200, session: "ASIA" });
  assert.equal(z.buildStatus, "READY");
  assert.equal(z.dir, "DOWN");
  assert.ok(z.pullbackZone);
  const recent = c.slice(-20);
  const sh = Math.max(...recent.map((x) => x.high));
  const sl = Math.min(...recent.map((x) => x.low));
  const range = sh - sl;
  assert.ok(Math.abs(z.pullbackZone![0] - (sl + 0.5 * range)) < 1e-6, "zoneLow = 0.50");
  assert.ok(Math.abs(z.pullbackZone![1] - (sl + 0.618 * range)) < 1e-6, "zoneHigh = 0.618");
});

test("2. UPTREND creates reverse pullback zone", () => {
  const c = uptrendCandles(40);
  const z = buildTrendZoneShadow({ regime: "UPTREND", direction: "BULLISH", candles1h: c, atr1h: 200, session: "ASIA" });
  assert.equal(z.buildStatus, "READY");
  assert.equal(z.dir, "UP");
  const recent = c.slice(-20);
  const sh = Math.max(...recent.map((x) => x.high));
  const sl = Math.min(...recent.map((x) => x.low));
  const range = sh - sl;
  assert.ok(Math.abs(z.pullbackZone![0] - (sh - 0.618 * range)) < 1e-6, "zoneLow = swingHigh - 0.618");
  assert.ok(Math.abs(z.pullbackZone![1] - (sh - 0.5 * range)) < 1e-6, "zoneHigh = swingHigh - 0.50");
});

test("3. invalidation uses ATR buffer", () => {
  const c = downtrendCandles(40);
  const z = buildTrendZoneShadow({ regime: "DOWNTREND", direction: "BEARISH", candles1h: c, atr1h: 200, session: "ASIA" });
  const sh = Math.max(...c.slice(-20).map((x) => x.high));
  assert.ok(Math.abs(z.invalidation! - (sh + 0.2 * 200)) < 1e-6, "invalidation = swingHigh + 0.2*ATR");
});

test("4. t1 uses swing target", () => {
  const c = downtrendCandles(40);
  const z = buildTrendZoneShadow({ regime: "DOWNTREND", direction: "BEARISH", candles1h: c, atr1h: 200 });
  const sl = Math.min(...c.slice(-20).map((x) => x.low));
  assert.equal(z.targets.t1, sl);
  assert.equal(z.targets.t2, null);
});

test("5. insufficient 1H candles => INSUFFICIENT_DATA", () => {
  const c = downtrendCandles(10);
  const z = buildTrendZoneShadow({ regime: "DOWNTREND", direction: "BEARISH", candles1h: c, atr1h: 200 });
  assert.equal(z.buildStatus, "INSUFFICIENT_DATA");
  assert.equal(z.pullbackZone, null);
  assert.ok(z.warnings.length > 0);
});

test("6. NOT_TREND => no zone", () => {
  const c = downtrendCandles(40);
  const z = buildTrendZoneShadow({ regime: "RANGE", direction: "NEUTRAL", candles1h: c, atr1h: 200 });
  assert.equal(z.buildStatus, "NOT_TREND");
  assert.equal(z.dir, null);
  assert.equal(z.pullbackZone, null);
});

test("7. latest candles are used (window slices most recent)", () => {
  // old flat candles + recent downtrend leg; swing must reflect recent window
  const old: TrendZoneCandle[] = Array.from({ length: 100 }, (_, i) => ({
    t: 1_770_000_000_000 + i * 3_600_000, open: 90000, high: 90050, low: 89950, close: 90000,
  }));
  const recent = downtrendCandles(30).map((x, i) => ({ ...x, t: 1_780_000_000_000 + i * 3_600_000 }));
  const z = buildTrendZoneShadow({ regime: "DOWNTREND", direction: "BEARISH", candles1h: [...old, ...recent], atr1h: 200 });
  assert.equal(z.buildStatus, "READY");
  // swingHigh must come from recent leg (~70000s), not old 90000 flat
  assert.ok(z.smc.swingHigh1h! < 80000, "uses latest window not old candles");
});

test("8. shadowOnly true", () => {
  const z = buildTrendZoneShadow({ regime: "DOWNTREND", direction: "BEARISH", candles1h: downtrendCandles(40), atr1h: 200 });
  assert.equal(z.shadowOnly, true);
});

test("9. paperActivationAllowed false", () => {
  const z = buildTrendZoneShadow({ regime: "DOWNTREND", direction: "BEARISH", candles1h: downtrendCandles(40), atr1h: 200 });
  assert.equal(z.paperActivationAllowed, false);
});

test("10. liveActivationAllowed false", () => {
  const z = buildTrendZoneShadow({ regime: "DOWNTREND", direction: "BEARISH", candles1h: downtrendCandles(40), atr1h: 200 });
  assert.equal(z.liveActivationAllowed, false);
  // also eq1h = (H+L)/2
  const recent = downtrendCandles(40).slice(-20);
  const sh = Math.max(...recent.map((x) => x.high));
  const sl = Math.min(...recent.map((x) => x.low));
  assert.ok(Math.abs(z.smc.eq1h! - (sh + sl) / 2) < 1e-6);
});

test("11. CONFIRM trigger for LONDON/NY or high sweep risk", () => {
  const c = downtrendCandles(40);
  const ny = buildTrendZoneShadow({ regime: "DOWNTREND", direction: "BEARISH", candles1h: c, atr1h: 200, session: "LONDON" });
  assert.equal(ny.entry.type, "CONFIRM");
  assert.match(ny.triggerRule!, /รอ 5m ยืนยัน/);
  const sweep = buildTrendZoneShadow({ regime: "DOWNTREND", direction: "BEARISH", candles1h: c, atr1h: 200, session: "ASIA", sweepRisk: "HIGH" });
  assert.match(sweep.triggerRule!, /รอ 5m ยืนยัน/);
});
