import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { detectExactFvgs } from "./exactFvgDetector.ts";
import {
  detectExactOrderBlocks,
  evaluateObFvgRelation,
  type ExactOrderBlockCandle,
} from "./exactOrderBlockDetector.ts";

const c = (open: number, high: number, low: number, close: number, time?: string): ExactOrderBlockCandle => ({
  time,
  open,
  high,
  low,
  close,
});

function bullishFixture(extra: ExactOrderBlockCandle[] = []): ExactOrderBlockCandle[] {
  return [
    c(100, 101, 99, 100.4, "0"),
    c(101, 103, 100, 102.2, "1"),
    c(102, 105, 101, 104.4, "2"),
    c(104, 104.2, 101.2, 102.1, "3"),
    c(102, 103, 100.7, 101.6, "4"),
    c(101.6, 102.1, 100.1, 101.2, "5"),
    c(101.1, 101.5, 99.5, 100, "6"),
    c(100.2, 106.2, 100, 106, "7"),
    c(106.1, 107, 105, 106.6, "8"),
    ...extra,
  ];
}

function bearishFixture(extra: ExactOrderBlockCandle[] = []): ExactOrderBlockCandle[] {
  return [
    c(110, 111, 109, 109.6, "0"),
    c(109, 109.5, 106, 106.8, "1"),
    c(107, 108, 102, 103, "2"),
    c(103.2, 106.2, 103, 105.3, "3"),
    c(105.2, 106, 104, 105.5, "4"),
    c(105.4, 106, 104.2, 105.2, "5"),
    c(105.1, 106.5, 104.8, 106.2, "6"),
    c(106, 106.2, 101, 101.4, "7"),
    c(101.3, 102, 100.2, 100.8, "8"),
    ...extra,
  ];
}

function firstValid(candles: ExactOrderBlockCandle[]) {
  return detectExactOrderBlocks(candles, { timeframe: "15m", minDisplacementScore: 40 }).find(
    (ob) => ob.classification === "VALID_OB",
  );
}

describe("detectExactOrderBlocks", () => {
  it("detects exact bullish OB with close-confirmed BOS", () => {
    const ob = firstValid(bullishFixture());
    assert.equal(ob?.direction, "BULLISH");
    assert.equal(ob?.obIndex, 6);
    assert.equal(ob?.bosIndex, 2);
    assert.equal(ob?.bosLevel, 105);
    assert.equal(ob?.bosClose, 106);
    assert.equal(ob?.zoneLower, 99.5);
    assert.equal(ob?.zoneUpper, 101.1);
    assert.equal(ob?.refinedLower, 99.75);
    assert.equal(ob?.refinedUpper, 101.1);
    assert.equal(ob?.invalidationPrice, 99.5);
    assert.equal(ob?.source, "EXACT_OB_DETECTOR_V1");
    assert.ok((ob?.displacementStrength ?? 0) >= 40);
  });

  it("detects exact bearish OB with mirrored zone and invalidation", () => {
    const ob = firstValid(bearishFixture());
    assert.equal(ob?.direction, "BEARISH");
    assert.equal(ob?.obIndex, 6);
    assert.equal(ob?.bosIndex, 2);
    assert.equal(ob?.bosLevel, 102);
    assert.equal(ob?.bosClose, 101.4);
    assert.equal(ob?.zoneLower, 105.1);
    assert.equal(ob?.zoneUpper, 106.5);
    assert.equal(ob?.refinedLower, 105.1);
    assert.equal(ob?.refinedUpper, 106.35);
    assert.equal(ob?.invalidationPrice, 106.5);
  });

  it("rejects candidates without prior confirmed structure", () => {
    const detected = detectExactOrderBlocks(
      [
        c(100, 101, 99, 100.4),
        c(100.2, 101, 99.8, 100.1),
        c(100.1, 100.5, 99.5, 99.8),
        c(99.8, 103, 99.7, 102.5),
        c(102.5, 103, 101.5, 102.8),
      ],
      { direction: "BULLISH" },
    );
    assert.equal(detected.some((ob) => ob.classification === "NO_STRUCTURE_CONFIRMATION"), true);
    assert.equal(detected.some((ob) => ob.classification === "VALID_OB"), false);
  });

  it("rejects wick-only BOS breaks", () => {
    const candles = bullishFixture();
    candles[7] = c(100.2, 106.2, 100, 104.8, "7");
    const detected = detectExactOrderBlocks(candles, { direction: "BULLISH" });
    assert.equal(detected.some((ob) => ob.classification === "VALID_OB"), false);
    assert.equal(detected.some((ob) => ob.obIndex === 6 && ob.displacementEndIndex === 7), false);
  });

  it("rejects weak displacement", () => {
    const candles = bullishFixture();
    candles[7] = c(100.2, 105.4, 100, 105.1, "7");
    const ob = detectExactOrderBlocks(candles, { direction: "BULLISH", minDisplacementScore: 80 }).find((candidate) => candidate.obIndex === 6);
    assert.equal(ob?.classification, "WEAK_DISPLACEMENT");
  });

  it("tracks fresh, partial, mitigated, and close-confirmed invalidated states", () => {
    assert.equal(firstValid(bullishFixture())?.mitigationStatus, "FRESH");

    const partial = detectExactOrderBlocks(bullishFixture([c(106, 106.5, 100.7, 101.3, "9")]), { direction: "BULLISH" }).find(
      (ob) => ob.obIndex === 6,
    );
    assert.equal(partial?.mitigationStatus, "PARTIALLY_MITIGATED");
    assert.equal(partial?.fillPct, 0.25);

    const mitigated = detectExactOrderBlocks(bullishFixture([c(106, 106.5, 99.4, 100.2, "9")]), { direction: "BULLISH" }).find(
      (ob) => ob.obIndex === 6,
    );
    assert.equal(mitigated?.mitigationStatus, "MITIGATED");
    assert.equal(mitigated?.classification, "ALREADY_MITIGATED");

    const wickOnly = detectExactOrderBlocks(bullishFixture([c(106, 106.5, 99, 100, "9")]), { direction: "BULLISH" }).find(
      (ob) => ob.obIndex === 6,
    );
    assert.notEqual(wickOnly?.mitigationStatus, "INVALIDATED");

    const invalidated = detectExactOrderBlocks(bullishFixture([c(106, 106.5, 99, 99.2, "9")]), { direction: "BULLISH" }).find(
      (ob) => ob.obIndex === 6,
    );
    assert.equal(invalidated?.mitigationStatus, "INVALIDATED");
    assert.equal(invalidated?.classification, "INVALIDATED");
  });

  it("marks stale zones as too old", () => {
    const ob = detectExactOrderBlocks(bullishFixture(), { direction: "BULLISH", maxAgeBars: 0 }).find((candidate) => candidate.obIndex === 6);
    assert.equal(ob?.classification, "TOO_OLD");
  });

  it("evaluates exact FVG relation and increases quality", () => {
    const baseline = detectExactOrderBlocks(bullishFixture(), { direction: "BULLISH" }).find((candidate) => candidate.obIndex === 6)!;
    const fvg = {
      ...detectExactFvgs(bullishFixture(), { minGapAbs: 1 })[0]!,
      lower: 100,
      upper: 101,
      direction: "BULLISH" as const,
      mitigationStatus: "FRESH" as const,
    };
    const withFvg = detectExactOrderBlocks(bullishFixture(), { direction: "BULLISH", exactFvgs: [fvg] }).find(
      (candidate) => candidate.obIndex === 6,
    )!;
    assert.equal(withFvg.obFvgRelation, "OB_OVERLAP");
    assert.equal(withFvg.fvgRelation, "OB_OVERLAP");
    assert.ok(withFvg.qualityScore > baseline.qualityScore);
    assert.equal(
      evaluateObFvgRelation({ direction: "BULLISH", zoneLower: 99.5, zoneUpper: 101.1 }, [fvg]),
      "OB_OVERLAP",
    );
  });

  it("applies context rejections without changing threshold or entry logic", () => {
    const conflicting = detectExactOrderBlocks(bullishFixture(), {
      direction: "BULLISH",
      context: { htfBias: "BEARISH" },
    }).find((candidate) => candidate.obIndex === 6);
    assert.equal(conflicting?.classification, "CONFLICTING_DIRECTION");

    const targetTooClose = detectExactOrderBlocks(bullishFixture(), {
      direction: "BULLISH",
      context: { targetDistanceR: 0.8 },
    }).find((candidate) => candidate.obIndex === 6);
    assert.equal(targetTooClose?.classification, "TARGET_TOO_CLOSE");
  });

  it("keeps the detector pure and unwired", () => {
    const detectorSource = readFileSync(new URL("./exactOrderBlockDetector.ts", import.meta.url), "utf8");
    assert.doesNotMatch(detectorSource, /process\.env|fetch\(|appendFile|writeFile|placeOrder|createOrder|BingX|LIVE_TRADING_ENABLED|ENABLE_ORDER_PLACEMENT/);
    assert.doesNotMatch(detectorSource, /paper-performance|trend-paper-evidence-cycle|trendPaperExecutionEngine|reward_risk_min|TREND_PAPER_MIN_REWARD_RISK/);
    assert.match(detectorSource, /from "\.\/smcSwing\.ts"/);
    assert.match(detectorSource, /from "\.\/exactFvgDetector\.ts"/);
  });
});
