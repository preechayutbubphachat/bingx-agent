import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { detectExactFvgs, type ExactFvgCandle } from "./exactFvgDetector.ts";

const c = (high: number, low: number, open = low + 1, close = high - 1, time?: string): ExactFvgCandle => ({ time, open, high, low, close });

function atrReadyPrefix(): ExactFvgCandle[] {
  return Array.from({ length: 14 }, (_, i) => c(100 + i, 90 + i, 94 + i, 96 + i, `p${i}`));
}

describe("detectExactFvgs", () => {
  it("detects bullish FVG", () => {
    const candles = [...atrReadyPrefix(), c(110, 100, 102, 106, "a"), c(118, 104, 105, 117, "b"), c(126, 116, 117, 123, "c")];
    const fvg = detectExactFvgs(candles, { timeframe: "15M" }).at(-1);
    assert.equal(fvg?.direction, "BULLISH");
    assert.equal(fvg?.gapLow, 110);
    assert.equal(fvg?.gapHigh, 116);
    assert.equal(fvg?.source, "EXACT_FVG_DETECTOR_V1");
    assert.equal(fvg?.timeframe, "15M");
  });

  it("detects bearish FVG", () => {
    const candles = [...atrReadyPrefix(), c(122, 112, 118, 114, "a"), c(116, 104, 115, 105, "b"), c(100, 90, 98, 92, "c")];
    const fvg = detectExactFvgs(candles, { timeframe: "15M" }).at(-1);
    assert.equal(fvg?.direction, "BEARISH");
    assert.equal(fvg?.gapLow, 100);
    assert.equal(fvg?.gapHigh, 112);
    assert.equal(fvg?.invalidationPrice, 112);
  });

  it("rejects gap smaller than ATR threshold", () => {
    const candles = [...atrReadyPrefix(), c(110, 100), c(113, 103), c(116, 110.5)];
    const detected = detectExactFvgs(candles, { minGapAtrMultiple: 1 });
    assert.equal(detected.some((f) => f.startIndex === 14), false);
  });

  it("computes midpoint / lower / upper correctly", () => {
    const candles = [c(110, 100, 102, 106, "a"), c(116, 104, 105, 115, "b"), c(122, 112, 113, 119, "c")];
    const fvg = detectExactFvgs(candles, { minGapAbs: 1 })[0]!;
    assert.equal(fvg.lower, 110);
    assert.equal(fvg.upper, 112);
    assert.equal(fvg.midpoint, 111);
    assert.equal(fvg.size, 2);
    assert.equal(fvg.atrAvailable, false);
    assert.equal(fvg.sizeAtrMultiple, null);
  });

  it("computes fillPct fresh / partial / mitigated", () => {
    const base = [c(110, 100), c(116, 104), c(122, 112)];
    assert.equal(detectExactFvgs(base, { minGapAbs: 1 })[0]?.mitigationStatus, "FRESH");

    const partial = detectExactFvgs([...base, c(120, 111, 113, 118)], { minGapAbs: 1 })[0]!;
    assert.equal(partial.mitigationStatus, "PARTIALLY_MITIGATED");
    assert.equal(partial.fillPct, 0.5);

    const mitigated = detectExactFvgs([...base, c(120, 109.5, 113, 118)], { minGapAbs: 1 })[0]!;
    assert.equal(mitigated.mitigationStatus, "MITIGATED");
    assert.equal(mitigated.fillPct, 1);
  });

  it("handles ATR unavailable safely", () => {
    const fvg = detectExactFvgs([c(110, 100), c(116, 104), c(122, 112)])[0]!;
    assert.equal(fvg.atrAvailable, false);
    assert.equal(fvg.atrAtDetection, null);
    assert.equal(fvg.sizeAtrMultiple, null);
  });

  it("ignores non-finite candles", () => {
    const candles = [c(110, 100), c(Number.NaN, 104), c(122, 112), c(124, 113), c(125, 115)];
    assert.deepEqual(detectExactFvgs(candles, { minGapAbs: 1 }), []);
  });

  it("does not mutate input", () => {
    const candles = [c(110, 100), c(116, 104), c(122, 112)];
    const before = JSON.stringify(candles);
    detectExactFvgs(candles, { minGapAbs: 1 });
    assert.equal(JSON.stringify(candles), before);
  });

  it("is deterministic across repeated calls", () => {
    const candles = [...atrReadyPrefix(), c(110, 100), c(116, 104), c(122, 112), c(120, 111)];
    assert.deepEqual(detectExactFvgs(candles), detectExactFvgs(candles));
  });

  it("can exclude mitigated or over-age gaps", () => {
    const candles = [c(110, 100), c(116, 104), c(122, 112), c(120, 109.5), c(121, 113)];
    assert.equal(detectExactFvgs(candles, { minGapAbs: 1, includeMitigated: false }).length, 0);
    assert.equal(detectExactFvgs(candles, { minGapAbs: 1, maxAgeBars: 0 }).length, 0);
  });

  it("has no OB/FVG execution activation or route/runner/execution imports", () => {
    const source = readFileSync(new URL("./exactFvgDetector.ts", import.meta.url), "utf8");
    assert.doesNotMatch(source, /from\s+["'].*(?:route|runner|execution|broker|paperCycle|Journal|Writer)/i);
    assert.doesNotMatch(source, /fetch\(|process\.env|placeOrder|createOrder|liveActivationAllowed\s*:\s*true|exchangeOrderAllowed\s*:\s*true/i);
  });
});
