// Run: node --test --experimental-strip-types lib/trend/exactZoneShadowInput.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  buildExactZoneShadowInput,
  mapExactZoneDataStatus,
  MIN_EXACT_ZONE_CANDLES,
  type ExactZoneCandle,
} from "./exactZoneShadowInput.ts";
import type { ExactFvg } from "./exactFvgDetector.ts";
import type { ExactOrderBlock } from "./exactOrderBlockDetector.ts";
import type { MtfMergedZone, MtfZoneMergerResult, MtfZoneReadiness, MtfZoneType } from "./mtfZoneMerger.ts";

function candles(count = MIN_EXACT_ZONE_CANDLES): ExactZoneCandle[] {
  return Array.from({ length: count }, (_, i) => {
    const base = 100 + i * 0.1;
    return { t: i, open: base, high: base + 1, low: base - 1, close: base + 0.2 };
  });
}

function ob(overrides: Partial<ExactOrderBlock> = {}): ExactOrderBlock {
  return {
    id: "ob:1",
    timeframe: "1H",
    direction: "BEARISH",
    obIndex: 10,
    obTime: "10",
    candleOpen: 105,
    candleHigh: 106,
    candleLow: 104,
    candleClose: 104.5,
    bodyLow: 104.5,
    bodyHigh: 105,
    wickLow: 104,
    wickHigh: 106,
    zoneLower: 104,
    zoneUpper: 106,
    refinedLower: 104,
    refinedUpper: 106,
    midpoint: 105,
    invalidationPrice: 106,
    displacementStartIndex: 11,
    displacementEndIndex: 12,
    bosIndex: 13,
    bosLevel: 100,
    bosClose: 99,
    displacementStrength: 70,
    ageBars: 3,
    mitigationStatus: "FRESH",
    fillPct: 0,
    fvgRelation: "OB_OVERLAP",
    obFvgRelation: "OB_OVERLAP",
    classification: "VALID_OB",
    qualityScore: 80,
    qualityBand: "HIGH_QUALITY_SHADOW",
    source: "EXACT_OB_DETECTOR_V1",
    ...overrides,
  };
}

function fvg(overrides: Partial<ExactFvg> = {}): ExactFvg {
  return {
    id: "fvg:1",
    timeframe: "1H",
    direction: "BEARISH",
    startIndex: 11,
    middleIndex: 12,
    endIndex: 13,
    startTime: "11",
    endTime: "13",
    gapLow: 104.5,
    gapHigh: 105.5,
    lower: 104.5,
    upper: 105.5,
    midpoint: 105,
    size: 1,
    sizeAtrMultiple: 1,
    atrAtDetection: 1,
    atrAvailable: true,
    fillPct: 0,
    mitigationStatus: "FRESH",
    consequentEncroachment: 105,
    displacementStrength: 2,
    ageBars: 3,
    invalidationPrice: 105.5,
    obRelation: "NOT_EVALUATED",
    source: "EXACT_FVG_DETECTOR_V1",
    ...overrides,
  };
}

function candidate(zoneType: MtfZoneType, readiness: MtfZoneReadiness, overrides: Partial<MtfMergedZone> = {}): MtfMergedZone {
  return {
    id: `mtfzone:1H:BEARISH:${zoneType}`,
    direction: "BEARISH",
    htfBias: "BEARISH",
    primaryTimeframe: "1H",
    refinementTimeframe: null,
    zoneType,
    obId: zoneType === "FVG_ONLY" ? null : "ob:1",
    fvgId: zoneType === "OB_ONLY" ? null : "fvg:1",
    lower: 104,
    upper: 106,
    midpoint: 105,
    refinedEntry: 104,
    invalidationPrice: 106,
    targetPrice: 100,
    rawRR: 2,
    netRR: 1.8,
    costR: 0.2,
    qualityScore: 80,
    qualityBand: "HIGH_QUALITY_SHADOW",
    confidence: "HIGH",
    dataStatus: "EXACT_DETECTOR_OUTPUT",
    readiness,
    warnings: [],
    paperOnly: true,
    shadowOnly: true,
    liveTradingEnabled: false,
    liveActivationAllowed: false,
    exchangeOrderAllowed: false,
    source: "MTF_OB_FVG_ZONE_MERGER_V1",
    ...overrides,
  };
}

function result(readiness: MtfZoneReadiness, topCandidate: MtfMergedZone | null): MtfZoneMergerResult {
  return {
    zones: topCandidate ? [topCandidate] : [],
    topCandidate,
    counts: {
      primaryOrderBlocks: 1,
      primaryFvgs: 1,
      acceptedOrderBlocks: 1,
      acceptedFvgs: 1,
      confluenceZones: topCandidate?.zoneType === "OB_FVG_CONFLUENCE" ? 1 : 0,
      obOnlyZones: topCandidate?.zoneType === "OB_ONLY" ? 1 : 0,
      fvgOnlyZones: topCandidate?.zoneType === "FVG_ONLY" ? 1 : 0,
      conflictingDropped: 0,
    },
    readiness,
    conflictingDropped: 0,
    warnings: [],
    source: "MTF_OB_FVG_ZONE_MERGER_V1",
  };
}

const base = {
  candlesByTimeframe: { "4H": candles(), "1H": candles(), "15M": candles(), "5M": candles() },
  direction: "SHORT" as const,
  context: { currentTarget: 100, requiredRR: 1.2, feePct: 0.05, slippagePct: 0.02, heuristicNetRR: 1.5 },
};

test("missing candles returns EXACT_ZONE_NO_DATA", () => {
  const out = buildExactZoneShadowInput({ direction: "SHORT", candlesByTimeframe: {} });
  assert.equal(out.dataStatus, "EXACT_ZONE_NO_DATA");
  assert.equal(out.usesExactObFvgZones, false);
  assert.equal(out.optionalObZone, null);
});

test("insufficient candles does not throw", () => {
  const out = buildExactZoneShadowInput({ ...base, candlesByTimeframe: { "1H": candles(10) } });
  assert.equal(out.dataStatus, "EXACT_ZONE_NO_DATA");
  assert.ok(out.warnings.includes("insufficient_1H_candles"));
});

test("exact FVG only returns EXACT_FVG_ONLY", () => {
  const z = candidate("FVG_ONLY", "FVG_ONLY");
  const out = buildExactZoneShadowInput({
    ...base,
    detectors: {
      detectFvgs: () => [fvg()],
      detectOrderBlocks: () => [],
      mergeZones: () => result("FVG_ONLY", z),
    },
  });
  assert.equal(out.dataStatus, "EXACT_FVG_ONLY");
  assert.equal(out.optionalObZone, null);
  assert.deepEqual(out.optionalFvgZone, { low: 104.5, high: 105.5 });
});

test("exact OB only returns EXACT_OB_ONLY", () => {
  const z = candidate("OB_ONLY", "OB_ONLY");
  const out = buildExactZoneShadowInput({
    ...base,
    detectors: {
      detectFvgs: () => [],
      detectOrderBlocks: () => [ob()],
      mergeZones: () => result("OB_ONLY", z),
    },
  });
  assert.equal(out.dataStatus, "EXACT_OB_ONLY");
  assert.deepEqual(out.optionalObZone, { low: 104, high: 106 });
  assert.equal(out.optionalFvgZone, null);
});

test("exact OB/FVG confluence returns EXACT_OB_FVG_CONFLUENCE", () => {
  const z = candidate("OB_FVG_CONFLUENCE", "OB_FVG_CONFLUENCE");
  const out = buildExactZoneShadowInput({
    ...base,
    detectors: { detectFvgs: () => [fvg()], detectOrderBlocks: () => [ob()], mergeZones: () => result("OB_FVG_CONFLUENCE", z) },
  });
  assert.equal(out.dataStatus, "EXACT_OB_FVG_CONFLUENCE");
  assert.equal(out.usesExactObFvgZones, true);
});

test("MTF aligned candidate returns MTF_EXACT_ZONE_ALIGNED", () => {
  const z = candidate("OB_FVG_CONFLUENCE", "MTF_ALIGNED");
  const out = buildExactZoneShadowInput({
    ...base,
    htfBias: "BEARISH",
    detectors: { detectFvgs: () => [fvg()], detectOrderBlocks: () => [ob()], mergeZones: () => result("MTF_ALIGNED", z) },
  });
  assert.equal(out.dataStatus, "MTF_EXACT_ZONE_ALIGNED");
  assert.equal(out.exactVsHeuristicDelta, 0.3);
});

test("conflicting MTF returns EXACT_ZONE_CONFLICT and does not use exact zones", () => {
  const out = buildExactZoneShadowInput({
    ...base,
    detectors: { detectFvgs: () => [fvg()], detectOrderBlocks: () => [ob()], mergeZones: () => result("CONFLICTING_MTF", null) },
  });
  assert.equal(out.dataStatus, "EXACT_ZONE_CONFLICT");
  assert.equal(out.usesExactObFvgZones, false);
});

test("usesExactObFvgZones is true only for exact detector output", () => {
  const z = candidate("OB_ONLY", "OB_ONLY", { dataStatus: "EXACT_DETECTOR_OUTPUT" });
  const out = buildExactZoneShadowInput({
    ...base,
    detectors: { detectFvgs: () => [], detectOrderBlocks: () => [ob()], mergeZones: () => result("OB_ONLY", z) },
  });
  assert.equal(out.usesExactObFvgZones, true);
  assert.equal(out.mergedZoneCandidate?.dataStatus, "EXACT_DETECTOR_OUTPUT");
});

test("producer failure falls back without throwing", () => {
  const out = buildExactZoneShadowInput({
    ...base,
    detectors: {
      detectFvgs: () => {
        throw new Error("boom");
      },
    },
  });
  assert.equal(out.dataStatus, "HEURISTIC_ESTIMATE_ONLY");
  assert.match(out.warnings.join(","), /exact_zone_builder_failed/);
});

test("optional zones are not heuristic when exact flag is true", () => {
  const z = candidate("OB_FVG_CONFLUENCE", "MTF_ALIGNED");
  const out = buildExactZoneShadowInput({
    ...base,
    detectors: { detectFvgs: () => [fvg()], detectOrderBlocks: () => [ob()], mergeZones: () => result("MTF_ALIGNED", z) },
  });
  assert.equal(out.usesExactObFvgZones, true);
  assert.equal(out.optionalObZone?.low, ob().zoneLower);
  assert.equal(out.optionalFvgZone?.low, fvg().lower);
  assert.equal(out.source, "EXACT_ZONE_SHADOW_INPUT_V1");
});

test("data status mapping covers conflict and no data", () => {
  assert.equal(mapExactZoneDataStatus("NO_DATA", null), "EXACT_ZONE_NO_DATA");
  assert.equal(mapExactZoneDataStatus("COST_TOO_HIGH", null), "EXACT_ZONE_CONFLICT");
});

test("pure producer has no route, runner, execution, network, or I/O imports", () => {
  const src = readFileSync(new URL("./exactZoneShadowInput.ts", import.meta.url), "utf8");
  assert.doesNotMatch(src, /process\.env|fetch\(|appendFile|writeFile|readFile|placeOrder|createOrder|BingX|LIVE_TRADING_ENABLED|ENABLE_ORDER_PLACEMENT/);
  assert.doesNotMatch(src, /trend-paper-evidence-cycle|paper-performance|trendPaperEvidenceRunner|trendPaperExecutionEngine|trendPaperJournalWriter|TradingAgentHQ/);
});
