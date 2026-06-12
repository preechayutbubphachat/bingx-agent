import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import type { ExactFvg } from "./exactFvgDetector.ts";
import type { ExactOrderBlock } from "./exactOrderBlockDetector.ts";
import { mergeMtfZones, type MtfZoneMergerInput } from "./mtfZoneMerger.ts";

function ob(overrides: Partial<ExactOrderBlock> = {}): ExactOrderBlock {
  const direction = overrides.direction ?? "BULLISH";
  const zoneLower = overrides.zoneLower ?? (direction === "BULLISH" ? 99.5 : 105);
  const zoneUpper = overrides.zoneUpper ?? (direction === "BULLISH" ? 101 : 106.5);
  return {
    id: overrides.id ?? `1H:${direction}:6:7:${zoneLower}-${zoneUpper}`,
    timeframe: "1H",
    direction,
    obIndex: 6,
    obTime: "6",
    candleOpen: direction === "BULLISH" ? 101 : 105,
    candleHigh: zoneUpper,
    candleLow: zoneLower,
    candleClose: direction === "BULLISH" ? 100 : 106,
    bodyLow: direction === "BULLISH" ? 100 : zoneLower,
    bodyHigh: direction === "BULLISH" ? zoneUpper : 106,
    wickLow: zoneLower,
    wickHigh: zoneUpper,
    zoneLower,
    zoneUpper,
    refinedLower: zoneLower,
    refinedUpper: zoneUpper,
    midpoint: (zoneLower + zoneUpper) / 2,
    invalidationPrice: overrides.invalidationPrice ?? (direction === "BULLISH" ? zoneLower : zoneUpper),
    displacementStartIndex: 6,
    displacementEndIndex: 7,
    bosIndex: 2,
    bosLevel: direction === "BULLISH" ? 105 : 102,
    bosClose: direction === "BULLISH" ? 106 : 101,
    displacementStrength: 70,
    ageBars: 2,
    mitigationStatus: "FRESH",
    fillPct: 0,
    fvgRelation: "NO_FVG_CONTEXT",
    obFvgRelation: "NO_FVG_CONTEXT",
    classification: "VALID_OB",
    qualityScore: 70,
    qualityBand: "SHADOW_CANDIDATE",
    source: "EXACT_OB_DETECTOR_V1",
    ...overrides,
  };
}

function fvg(overrides: Partial<ExactFvg> = {}): ExactFvg {
  const direction = overrides.direction ?? "BULLISH";
  const lower = overrides.lower ?? (direction === "BULLISH" ? 100.2 : 105.8);
  const upper = overrides.upper ?? (direction === "BULLISH" ? 101.2 : 106.8);
  return {
    id: overrides.id ?? `1H:${direction}:6-7-8:${lower}-${upper}`,
    timeframe: "1H",
    direction,
    startIndex: 6,
    middleIndex: 7,
    endIndex: 8,
    startTime: "6",
    endTime: "8",
    gapLow: lower,
    gapHigh: upper,
    lower,
    upper,
    midpoint: (lower + upper) / 2,
    size: upper - lower,
    sizeAtrMultiple: 1,
    atrAtDetection: 1,
    atrAvailable: true,
    fillPct: 0,
    mitigationStatus: "FRESH",
    consequentEncroachment: (lower + upper) / 2,
    displacementStrength: 2,
    ageBars: 2,
    invalidationPrice: direction === "BULLISH" ? lower : upper,
    obRelation: "NOT_EVALUATED",
    source: "EXACT_FVG_DETECTOR_V1",
    ...overrides,
  };
}

const baseInput = (partial: Partial<MtfZoneMergerInput> = {}): MtfZoneMergerInput => ({
  htf: { bias: "BULLISH", externalLiquidityTargets: [{ price: 104, kind: "SWING_HIGH", timeframe: "4H" }] },
  primary: { timeframe: "1H", obs: [], fvgs: [] },
  context: { requiredRR: 1.5, feePct: 0.05, slippagePct: 0.02, currentPrice: 101 },
  ...partial,
});

describe("mergeMtfZones", () => {
  it("returns NO_DATA for empty exact detector output", () => {
    const result = mergeMtfZones(baseInput());
    assert.equal(result.readiness, "NO_DATA");
    assert.equal(result.topCandidate, null);
    assert.equal(result.zones.length, 0);
    assert.equal(result.warnings.includes("NO_EXACT_ZONE_CANDIDATES"), true);
    assert.equal(result.source, "MTF_OB_FVG_ZONE_MERGER_V1");
  });

  it("creates an OB-only candidate from VALID_OB output", () => {
    const result = mergeMtfZones(baseInput({ primary: { timeframe: "1H", obs: [ob()], fvgs: [] } }));
    assert.equal(result.zones[0]?.zoneType, "OB_ONLY");
    assert.equal(result.zones[0]?.readiness, "OB_ONLY");
    assert.equal(result.zones[0]?.dataStatus, "EXACT_DETECTOR_OUTPUT");
    assert.equal(result.zones[0]?.paperOnly, true);
    assert.equal(result.zones[0]?.shadowOnly, true);
    assert.equal(result.zones[0]?.liveTradingEnabled, false);
    assert.equal(result.zones[0]?.liveActivationAllowed, false);
    assert.equal(result.zones[0]?.exchangeOrderAllowed, false);
    assert.equal(result.topCandidate?.id, result.zones[0]?.id);
  });

  it("creates an FVG-only candidate from exact FVG output", () => {
    const result = mergeMtfZones(baseInput({ primary: { timeframe: "1H", obs: [], fvgs: [fvg()] } }));
    assert.equal(result.zones[0]?.zoneType, "FVG_ONLY");
    assert.equal(result.zones[0]?.readiness, "FVG_ONLY");
    assert.equal(result.zones[0]?.obId, null);
    assert.equal(result.zones[0]?.fvgId, fvg().id);
  });

  it("ranks OB/FVG confluence above single-zone candidates", () => {
    const single = ob({
      id: "1H:BULLISH:20:21:97-98",
      zoneLower: 97,
      zoneUpper: 98,
      qualityScore: 95,
      displacementStartIndex: null,
      displacementEndIndex: null,
    });
    const result = mergeMtfZones(
      baseInput({
        primary: {
          timeframe: "1H",
          obs: [single, ob()],
          fvgs: [fvg()],
        },
      }),
    );
    assert.equal(result.zones[0]?.zoneType, "OB_FVG_CONFLUENCE");
    assert.equal(result.zones[0]?.readiness, "MTF_ALIGNED");
    assert.equal(result.counts.confluenceZones, 1);
  });

  it("drops candidates that conflict with HTF bias", () => {
    const result = mergeMtfZones(
      baseInput({
        htf: { bias: "BULLISH" },
        primary: { timeframe: "1H", obs: [ob({ direction: "BEARISH" })], fvgs: [fvg({ direction: "BEARISH" })] },
      }),
    );
    assert.equal(result.zones.length, 0);
    assert.equal(result.conflictingDropped, 1);
  });

  it("marks 5M conflict as CONFLICTING_MTF and prevents top candidate", () => {
    const result = mergeMtfZones(
      baseInput({
        primary: { timeframe: "1H", obs: [ob()], fvgs: [fvg()] },
        micro: { timeframe: "5M", chochAgainstZone: true },
      }),
    );
    assert.equal(result.readiness, "CONFLICTING_MTF");
    assert.equal(result.zones[0]?.readiness, "CONFLICTING_MTF");
    assert.equal(result.topCandidate, null);
  });

  it("ranks fresh zones above partially mitigated zones", () => {
    const fresh = ob({ id: "fresh", zoneLower: 100, zoneUpper: 101, qualityScore: 65, mitigationStatus: "FRESH" });
    const partial = ob({ id: "partial", zoneLower: 98, zoneUpper: 99, qualityScore: 65, mitigationStatus: "PARTIALLY_MITIGATED", fillPct: 0.5 });
    const result = mergeMtfZones(
      baseInput({
        primary: { timeframe: "1H", obs: [partial, fresh], fvgs: [] },
        context: { currentPrice: 100.5, requiredRR: null },
      }),
    );
    assert.equal(result.zones[0]?.obId, "fresh");
  });

  it("returns TARGET_TOO_CLOSE when raw RR is below required RR", () => {
    const result = mergeMtfZones(
      baseInput({
        primary: { timeframe: "1H", obs: [ob()], fvgs: [] },
        htf: { bias: "BULLISH", externalLiquidityTargets: [{ price: 101.5, kind: "SWING_HIGH", timeframe: "4H" }] },
        context: { requiredRR: 2, feePct: 0, slippagePct: 0 },
      }),
    );
    assert.equal(result.zones[0]?.readiness, "TARGET_TOO_CLOSE");
    assert.equal(result.topCandidate, null);
  });

  it("returns COST_TOO_HIGH when costs drag passing raw RR below required RR", () => {
    const result = mergeMtfZones(
      baseInput({
        primary: { timeframe: "1H", obs: [ob()], fvgs: [] },
        htf: { bias: "BULLISH", externalLiquidityTargets: [{ price: 104, kind: "SWING_HIGH", timeframe: "4H" }] },
        context: { requiredRR: 1.5, feePct: 1, slippagePct: 0 },
      }),
    );
    assert.equal(result.zones[0]?.rawRR !== null && result.zones[0]!.rawRR >= 1.5, true);
    assert.equal(result.zones[0]?.readiness, "COST_TOO_HIGH");
    assert.equal(result.topCandidate, null);
  });

  it("bounds quality score and maps quality bands", () => {
    const result = mergeMtfZones(
      baseInput({
        primary: {
          timeframe: "1H",
          obs: [
            ob({ id: "low", qualityScore: 10, zoneLower: 90, zoneUpper: 91 }),
            ob({ id: "watch", qualityScore: 60, zoneLower: 92, zoneUpper: 93 }),
            ob({ id: "shadow", qualityScore: 78, zoneLower: 94, zoneUpper: 95 }),
            ob({ id: "high", qualityScore: 100, zoneLower: 100, zoneUpper: 101 }),
          ],
          fvgs: [],
        },
        htf: { bias: "NEUTRAL" },
        context: { requiredRR: null },
      }),
    );
    assert.equal(result.zones.every((zone) => zone.qualityScore >= 0 && zone.qualityScore <= 100), true);
    assert.ok(result.zones.some((zone) => zone.qualityBand === "IGNORE"));
    assert.ok(result.zones.some((zone) => zone.qualityBand === "WATCH_ONLY"));
    assert.ok(result.zones.some((zone) => zone.qualityBand === "SHADOW_CANDIDATE"));
    assert.ok(result.zones.some((zone) => zone.qualityBand === "HIGH_QUALITY_SHADOW"));
  });

  it("computes rawRR and netRR when data is available", () => {
    const result = mergeMtfZones(
      baseInput({
        primary: { timeframe: "1H", obs: [ob({ zoneLower: 100, zoneUpper: 101, invalidationPrice: 100 })], fvgs: [] },
        htf: { bias: "BULLISH", externalLiquidityTargets: [{ price: 103, kind: "SWING_HIGH", timeframe: "4H" }] },
        context: { requiredRR: 1, feePct: 0.1, slippagePct: 0 },
      }),
    );
    assert.equal(result.zones[0]?.refinedEntry, 101);
    assert.equal(result.zones[0]?.rawRR, 2);
    assert.equal(result.zones[0]?.costR, 0.202);
    assert.equal(result.zones[0]?.netRR, 1.798);
  });

  it("does not throw when RR data is missing", () => {
    const result = mergeMtfZones(baseInput({ primary: { timeframe: "1H", obs: [ob()], fvgs: [] }, htf: { bias: "BULLISH" } }));
    assert.equal(result.zones[0]?.rawRR, null);
    assert.equal(result.zones[0]?.netRR, null);
    assert.equal(result.zones[0]?.warnings.includes("RR_DATA_MISSING"), true);
  });

  it("uses 15M refinement inside the 1H zone and ignores outside refinement", () => {
    const inside = ob({ id: "inside", timeframe: "15M", zoneLower: 100.1, zoneUpper: 100.4, qualityScore: 80 });
    const outside = ob({ id: "outside", timeframe: "15M", zoneLower: 101.2, zoneUpper: 101.5, qualityScore: 100 });
    const result = mergeMtfZones(
      baseInput({
        primary: { timeframe: "1H", obs: [ob({ zoneLower: 100, zoneUpper: 101, qualityScore: 80 })], fvgs: [] },
        refinement: { timeframe: "15M", obs: [outside, inside], fvgs: [] },
        context: { requiredRR: null },
      }),
    );
    assert.equal(result.zones[0]?.refinementTimeframe, "15M");
    assert.equal(result.zones[0]?.refinedEntry, 100.25);
  });

  it("is deterministic and does not mutate input", () => {
    const input = baseInput({ primary: { timeframe: "1H", obs: [ob()], fvgs: [fvg()] } });
    const before = JSON.stringify(input);
    const first = mergeMtfZones(input);
    const second = mergeMtfZones(input);
    assert.deepEqual(second, first);
    assert.equal(JSON.stringify(input), before);
  });

  it("keeps d3 isolated from route, runner, UI, snapshot, and decision paths", () => {
    const source = readFileSync(new URL("./mtfZoneMerger.ts", import.meta.url), "utf8");
    assert.doesNotMatch(source, /process\.env|fetch\(|appendFile|writeFile|placeOrder|createOrder|BingX|LIVE_TRADING_ENABLED|ENABLE_ORDER_PLACEMENT/);
    assert.doesNotMatch(source, /paper-performance|trend-paper-evidence-cycle|TradingAgentHQ|snapshot|reward_risk_min|TREND_PAPER_MIN_REWARD_RISK/);
    assert.match(source, /from "\.\/exactFvgDetector\.ts"/);
    assert.match(source, /from "\.\/exactOrderBlockDetector\.ts"/);
  });
});
