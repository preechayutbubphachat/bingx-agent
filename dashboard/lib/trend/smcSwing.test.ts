import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  findFractalSwings,
  getLatestSwingHigh,
  getLatestSwingLow,
  summarizeSwingStructure,
  type SmcCandle,
} from "./smcSwing.ts";

const c = (high: number, low: number, close = (high + low) / 2, open = close, time?: string): SmcCandle => ({ time, open, high, low, close });

describe("findFractalSwings", () => {
  it("insufficient candles returns []", () => {
    assert.deepEqual(findFractalSwings([c(1, 0), c(2, 1)]), []);
  });

  it("detects swing high with left/right 2", () => {
    const swings = findFractalSwings([c(10, 5), c(12, 6), c(20, 7, 12), c(13, 8), c(11, 7)], { confirmByClose: true });
    assert.equal(swings.length, 1);
    assert.equal(swings[0]?.type, "SWING_HIGH");
    assert.equal(swings[0]?.index, 2);
    assert.equal(swings[0]?.price, 20);
    assert.equal(swings[0]?.confirmed, true);
  });

  it("detects swing low with left/right 2", () => {
    const swings = findFractalSwings([c(20, 10), c(18, 8), c(15, 1, 6), c(17, 7), c(19, 9)], { confirmByClose: true });
    assert.equal(swings.length, 1);
    assert.equal(swings[0]?.type, "SWING_LOW");
    assert.equal(swings[0]?.index, 2);
    assert.equal(swings[0]?.price, 1);
  });

  it("ignore non-finite candles", () => {
    const swings = findFractalSwings([c(10, 5), c(12, 6), c(Number.NaN, 7), c(13, 8), c(11, 7), c(15, 9), c(10, 8)]);
    assert.deepEqual(swings, []);
  });

  it("does not mutate input", () => {
    const candles = [c(10, 5), c(12, 6), c(20, 7, 12), c(13, 8), c(11, 7)];
    const before = JSON.stringify(candles);
    findFractalSwings(candles);
    assert.equal(JSON.stringify(candles), before);
  });

  it("is deterministic across repeated calls", () => {
    const candles = [c(10, 5), c(12, 6), c(20, 7, 12), c(13, 8), c(11, 7), c(14, 4, 9), c(13, 6), c(12, 7)];
    assert.deepEqual(findFractalSwings(candles), findFractalSwings(candles));
  });

  it("maxSwings works", () => {
    const candles = [
      c(10, 5),
      c(12, 6),
      c(20, 7, 12),
      c(13, 8),
      c(11, 7),
      c(10, 4, 8),
      c(13, 7),
      c(12, 8),
      c(21, 9, 15),
      c(14, 8),
      c(13, 7),
    ];
    const swings = findFractalSwings(candles, { maxSwings: 1 });
    assert.equal(swings.length, 1);
    assert.equal(swings[0]?.index, 8);
  });

  it("helpers return latest swings and structure summary", () => {
    const swings = findFractalSwings(
      [c(10, 5), c(12, 6), c(20, 7, 12), c(13, 8), c(11, 7), c(10, 4, 8), c(13, 7), c(12, 8), c(21, 9, 15), c(14, 8), c(13, 7)],
      { confirmByClose: true },
    );
    assert.equal(getLatestSwingHigh(swings)?.index, 8);
    assert.equal(getLatestSwingLow(swings)?.index, 5);
    assert.equal(summarizeSwingStructure(swings).highTrend, "HIGHER_HIGH");
  });

  it("has no route/runner/execution imports", () => {
    const source = readFileSync(new URL("./smcSwing.ts", import.meta.url), "utf8");
    assert.doesNotMatch(source, /from\s+["'].*(?:route|runner|execution|broker|paperCycle|Journal|Writer)/i);
    assert.doesNotMatch(source, /fetch\(|process\.env|placeOrder|createOrder/i);
  });
});
