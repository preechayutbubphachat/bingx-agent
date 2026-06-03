import { test } from "node:test";
import assert from "node:assert/strict";
import { getLatestCloseFromMarketSnapshot } from "./marketSnapshot";

test("oldest→newest candle array (no ts) → last close", () => {
  const snap = { candles: [{ close: 94221.2 }, { close: 80000 }, { close: 66800.1 }] };
  assert.equal(getLatestCloseFromMarketSnapshot(snap), 66800.1);
});

test("newest→oldest array detectable by timestamp → max-ts close", () => {
  const snap = { candles: [
    { t: 3000, close: 66800.1 }, // newest
    { t: 2000, close: 80000 },
    { t: 1000, close: 94221.2 }, // oldest first
  ] };
  assert.equal(getLatestCloseFromMarketSnapshot(snap), 66800.1);
});

test("fallback: last close when no timestamps", () => {
  const snap = { ohlc: [{ close: 70000 }, { close: 71000 }, { close: 72000 }] };
  assert.equal(getLatestCloseFromMarketSnapshot(snap), 72000);
});

test("plain numeric closes array → last element", () => {
  const snap = { closes: [94221.2, 80000, 66800.1] };
  assert.equal(getLatestCloseFromMarketSnapshot(snap), 66800.1);
});

test("explicit latest scalar wins over array", () => {
  const snap = { lastClose: 66800.1, candles: [{ close: 94221.2 }] };
  assert.equal(getLatestCloseFromMarketSnapshot(snap), 66800.1);
});

test("missing close → null", () => {
  assert.equal(getLatestCloseFromMarketSnapshot({}), null);
  assert.equal(getLatestCloseFromMarketSnapshot({ candles: [{}] }), null);
  assert.equal(getLatestCloseFromMarketSnapshot(null), null);
});

test("real scenario: head 94221 / tail 66800 → 66800 (BELOW grid 72480)", () => {
  const snap = { candles: [{ close: 94221.2 }, { close: 75000 }, { close: 66800.1 }] };
  const close = getLatestCloseFromMarketSnapshot(snap);
  assert.equal(close, 66800.1);
  assert.ok(close != null && close < 72480, "below grid_lower");
});
