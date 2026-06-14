// dashboard/lib/trend/mtfObFvgShadowSnapshot.test.ts
// Run: node --test --experimental-strip-types lib/trend/mtfObFvgShadowSnapshot.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildRrSnapshot } from "./mtfObFvgShadowSnapshot.ts";
import {
  buildSmcMtfShadowSnapshot,
  emptyMtfObFvgShadowSnapshotSummary,
  summarizeMtfObFvgShadowSnapshots,
} from "./mtfObFvgShadowSnapshot.ts";
import type { MtfObFvgRefinementShadowResult } from "./mtfObFvgRefinementShadow.ts";
import type { ExactZoneShadowOutput } from "./exactZoneShadowInput.ts";

const NOW = "2026-06-11T12:00:00.000Z";

const MTF_RESULT: MtfObFvgRefinementShadowResult = {
  available: true,
  dataStatus: "HEURISTIC_ESTIMATE_ONLY",
  classification: "REFINEMENT_IMPROVES_RR",
  reason: "refined entry estimate improves reward/risk geometry",
  direction: "SHORT",
  currentRawRR: 1.15,
  currentNetRR: 1.06,
  requiredRR: 1.2,
  refinedEntryEstimate: 63_250,
  refinedStopEstimate: 63_500,
  refinedTargetEstimate: 62_636,
  refinedRawRR: 1.45,
  refinedNetRR: 1.34,
  rrImprovement: 0.3,
  netRrImprovement: 0.28,
  currentRiskDistance: 400,
  currentRewardDistance: 460,
  refinedRiskDistance: 250,
  refinedRewardDistance: 364,
  currentCostR: 0.09,
  refinedCostR: 0.11,
  wouldPassStaticRR: true,
  wouldPassNetRR: true,
  confidence: "medium",
  qualityScore: 65,
  missingFields: [],
  notes: ["entry-zone-edge-used-as-heuristic"],
  shadowOnly: true,
  paperActivationAllowed: false,
  liveActivationAllowed: false,
  exchangeOrderAllowed: false,
};

const EXACT_ZONE: ExactZoneShadowOutput = {
  dataStatus: "MTF_EXACT_ZONE_ALIGNED",
  exactZoneReadiness: "MTF_ALIGNED",
  usesExactObFvgZones: true,
  optionalObZone: { low: 104, high: 106 },
  optionalFvgZone: { low: 104.5, high: 105.5 },
  mergedZoneCandidate: {
    id: "mtfzone:1H:BEARISH:ob:1",
    direction: "BEARISH",
    htfBias: "BEARISH",
    primaryTimeframe: "1H",
    refinementTimeframe: null,
    zoneType: "OB_FVG_CONFLUENCE",
    obId: "ob:1",
    fvgId: "fvg:1",
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
    readiness: "MTF_ALIGNED",
    warnings: [],
    paperOnly: true,
    shadowOnly: true,
    liveTradingEnabled: false,
    liveActivationAllowed: false,
    exchangeOrderAllowed: false,
    source: "MTF_OB_FVG_ZONE_MERGER_V1",
  },
  exactRawRR: 2,
  exactNetRR: 1.8,
  exactVsHeuristicDelta: 0.46,
  wouldHaveFilledPending: true,
  warnings: ["shadow-only-exact-zone"],
  source: "EXACT_ZONE_SHADOW_INPUT_V1",
};

test("RR snapshot rejects unavailable or non-finite required values", () => {
  assert.equal(buildRrSnapshot({ available: false } as never, NOW), null);
  assert.equal(buildRrSnapshot({ available: true, rawRR: Number.NaN, requiredRR: 1.2 } as never, NOW), null);
});

test("RR snapshot sanitizes finite fields only", () => {
  const s = buildRrSnapshot(
    {
      available: true,
      rawRR: 1.15555,
      requiredRR: 1.2,
      rrGap: 0.04444,
      riskDistance: 400,
      rewardDistance: 462.22,
      costR: 0.09111,
      netRR: 1.06444,
      failSeverity: "NEAR_MISS",
      reason: "STOP_TOO_WIDE",
    },
    NOW,
  );
  assert.equal(s?.schemaVersion, 1);
  assert.equal(s?.currentRawRR, 1.1556);
  assert.equal(s?.currentNetRR, 1.0644);
  assert.equal(s?.source, "rr-blocker-drilldown");
});

test("MTF snapshot is sanitized, shadow-only, and deterministic", () => {
  const a = buildSmcMtfShadowSnapshot(MTF_RESULT, NOW);
  const b = buildSmcMtfShadowSnapshot(MTF_RESULT, NOW);
  assert.deepEqual(a, b);
  assert.equal(a.shadowOnly, true);
  assert.equal(a.usesExactObFvgZones, false);
  assert.equal(a.qualityScore, 65);
  assert.ok(a.notes.includes("heuristic geometry estimate only"));
});

test("MTF snapshot stores optional exact-zone block only for real exact detector output", () => {
  const input = {
    direction: "SHORT" as const,
    entry: 104,
    invalidation: 106,
    target: 100,
    timeframe: "15M",
  };
  const s = buildSmcMtfShadowSnapshot(MTF_RESULT, NOW, EXACT_ZONE, {
    ...input,
  });
  assert.equal(s.usesExactObFvgZones, true);
  assert.equal(s.exactZone?.schemaVersion, 1);
  assert.equal(s.exactZone?.exactZoneCandidateId, "mtfzone:1H:BEARISH:ob:1");
  assert.equal(s.exactZone?.exactZoneDataStatus, "MTF_EXACT_ZONE_ALIGNED");
  assert.equal(s.exactZone?.exactNetRR, 1.8);
  assert.equal(s.exactZone?.wouldHaveFilledPending, true);
  assert.deepEqual(s.exactZone?.fillResolutionInput, {
    schemaVersion: 1,
    ...input,
    capturedAt: NOW,
    source: "D5_1_FILL_RESOLUTION_INPUT_V1",
  });
  assert.equal(s.exactZone?.warnings.includes("fill_resolution_input_missing"), false);

  const noExact = buildSmcMtfShadowSnapshot(MTF_RESULT, NOW, { ...EXACT_ZONE, usesExactObFvgZones: false });
  assert.equal(noExact.usesExactObFvgZones, false);
  assert.equal(noExact.exactZone, undefined);
});

test("MTF exact-zone snapshot captures read-only setup context without duplicating geometry", () => {
  const s = buildSmcMtfShadowSnapshot(
    MTF_RESULT,
    NOW,
    EXACT_ZONE,
    {
      direction: "SHORT",
      entry: 104,
      invalidation: 106,
      target: 100,
      timeframe: "15M",
    },
    {
      canonicalRegime: "DOWNTREND",
      canonicalDirection: "BEARISH",
      priceVsGrid: "BELOW_GRID",
      dynamicGridStatus: "PAUSE_EXPOSURE_LIMIT",
    },
  );

  assert.deepEqual(s.exactZone?.setupContext, {
    schemaVersion: 1,
    source: "D5_2_SETUP_CONTEXT_V1",
    capturedAt: NOW,
    canonicalRegime: "DOWNTREND",
    canonicalDirection: "BEARISH",
    priceVsGrid: "BELOW_GRID",
    dynamicGridStatus: "PAUSE_EXPOSURE_LIMIT",
  });
  assert.deepEqual(s.exactZone?.fillResolutionInput, {
    schemaVersion: 1,
    direction: "SHORT",
    entry: 104,
    invalidation: 106,
    target: 100,
    timeframe: "15M",
    capturedAt: NOW,
    source: "D5_1_FILL_RESOLUTION_INPUT_V1",
  });
});

test("MTF exact-zone setup context preserves missing context as nulls", () => {
  const s = buildSmcMtfShadowSnapshot(MTF_RESULT, NOW, EXACT_ZONE, null, {
    canonicalRegime: null,
    canonicalDirection: null,
    priceVsGrid: null,
    dynamicGridStatus: null,
  });

  assert.deepEqual(s.exactZone?.setupContext, {
    schemaVersion: 1,
    source: "D5_2_SETUP_CONTEXT_V1",
    capturedAt: NOW,
    canonicalRegime: null,
    canonicalDirection: null,
    priceVsGrid: null,
    dynamicGridStatus: null,
  });
});

test("MTF exact-zone setup context round-trips through summary parser", () => {
  const snapshot = buildSmcMtfShadowSnapshot(MTF_RESULT, NOW, EXACT_ZONE, null, {
    canonicalRegime: "RANGE",
    canonicalDirection: "NEUTRAL",
    priceVsGrid: "INSIDE_GRID",
    dynamicGridStatus: "ACTIVE",
  });
  const s = summarizeMtfObFvgShadowSnapshots([{ smcMtfShadowSnapshot: snapshot }]);

  assert.deepEqual(s.latestSnapshot?.exactZone?.setupContext, {
    schemaVersion: 1,
    source: "D5_2_SETUP_CONTEXT_V1",
    capturedAt: NOW,
    canonicalRegime: "RANGE",
    canonicalDirection: "NEUTRAL",
    priceVsGrid: "INSIDE_GRID",
    dynamicGridStatus: "ACTIVE",
  });
});

test("MTF exact-zone setup context rejects wrong source or schema without throwing", () => {
  const wrongSource = buildSmcMtfShadowSnapshot(MTF_RESULT, NOW, EXACT_ZONE, null, {
    canonicalRegime: "RANGE",
    canonicalDirection: "NEUTRAL",
    priceVsGrid: "INSIDE_GRID",
    dynamicGridStatus: "ACTIVE",
  });
  const wrongSchema = JSON.parse(JSON.stringify(wrongSource));
  wrongSource.exactZone!.setupContext = { ...wrongSource.exactZone!.setupContext!, source: "wrong" as never };
  wrongSchema.exactZone.setupContext.schemaVersion = 2;

  const s = summarizeMtfObFvgShadowSnapshots([{ smcMtfShadowSnapshot: wrongSource }, { smcMtfShadowSnapshot: wrongSchema }]);

  assert.equal(s.totalShadowSamples, 2);
  assert.equal(s.latestSnapshot?.exactZone?.setupContext, undefined);
});

test("old exact-zone records without setup context still parse", () => {
  const oldRecord = buildSmcMtfShadowSnapshot(MTF_RESULT, NOW, EXACT_ZONE, {
    direction: "SHORT",
    entry: 104,
    invalidation: 106,
    target: 100,
    timeframe: "15M",
  });
  const s = summarizeMtfObFvgShadowSnapshots([{ smcMtfShadowSnapshot: oldRecord }]);

  assert.equal(s.latestSnapshot?.exactZone?.setupContext, undefined);
  assert.equal(s.latestSnapshot?.exactZone?.fillResolutionInput?.entry, 104);
});

test("MTF snapshot omits fill-resolution input and records warning when geometry is missing", () => {
  const s = buildSmcMtfShadowSnapshot(MTF_RESULT, NOW, EXACT_ZONE);
  assert.equal(s.exactZone?.fillResolutionInput, undefined);
  assert.equal(s.exactZone?.warnings.includes("fill_resolution_input_missing"), true);
});

test("MTF snapshot rejects non-finite fill-resolution geometry", () => {
  const s = buildSmcMtfShadowSnapshot(MTF_RESULT, NOW, EXACT_ZONE, {
    direction: "SHORT",
    entry: Number.NaN,
    invalidation: 106,
    target: 100,
    timeframe: "15M",
  });
  assert.equal(s.exactZone?.fillResolutionInput, undefined);
  assert.equal(s.exactZone?.warnings.includes("fill_resolution_input_missing"), true);
});

test("summary computes averages and counts", () => {
  const one = buildSmcMtfShadowSnapshot(MTF_RESULT, "2026-06-11T12:00:00.000Z", EXACT_ZONE, {
    direction: "SHORT",
    entry: 104,
    invalidation: 106,
    target: 100,
    timeframe: "15M",
  });
  const two = buildSmcMtfShadowSnapshot(
    { ...MTF_RESULT, classification: "COST_DRAG_DOMINANT", currentRawRR: 1, currentNetRR: 0.8, refinedRawRR: 1.1, refinedNetRR: 0.9, rrImprovement: 0.1, netRrImprovement: 0.1, wouldPassStaticRR: false, wouldPassNetRR: false, qualityScore: 40 },
    "2026-06-11T12:15:00.000Z",
  );
  const s = summarizeMtfObFvgShadowSnapshots([{ smcMtfShadowSnapshot: one }, { smcMtfShadowSnapshot: two }]);
  assert.equal(s.available, true);
  assert.equal(s.totalShadowSamples, 2);
  assert.equal(s.samplesWithRefinement, 2);
  assert.equal(s.averageCurrentRawRR, 1.075);
  assert.equal(s.averageRefinedNetRR, 1.12);
  assert.equal(s.averageNetRrImprovement, 0.19);
  assert.equal(s.passStaticCount, 1);
  assert.equal(s.passNetCount, 1);
  assert.equal(s.classificationCounts.REFINEMENT_IMPROVES_RR, 1);
  assert.equal(s.classificationCounts.COST_DRAG_DOMINANT, 1);
  assert.equal(s.dataStatusCounts.HEURISTIC_ESTIMATE_ONLY, 2);
  assert.equal(s.exactZoneSamples, 1);
  assert.equal(s.exactZoneDataStatusCounts.MTF_EXACT_ZONE_ALIGNED, 1);
  assert.equal(s.exactZoneReadinessCounts.MTF_ALIGNED, 1);
  assert.equal(s.exactAvgNetRR, 1.8);
  assert.equal(s.exactVsHeuristicAvgDelta, 0.46);
  assert.equal(s.usesExactObFvgZonesCount, 1);
  assert.equal(s.fillResolutionInputSamples, 1);
  assert.equal(s.fillResolutionInputMissing, 0);
  assert.equal(s.fillResolutionGeometryReadyCount, 1);
  assert.equal(s.latestSnapshot?.classification, "COST_DRAG_DOMINANT");
  assert.equal(s.sampleWarning, true);
});

test("summary counts missing fill-resolution input without rejecting exact snapshots", () => {
  const withInput = buildSmcMtfShadowSnapshot(MTF_RESULT, "2026-06-11T12:00:00.000Z", EXACT_ZONE, {
    direction: "SHORT",
    entry: 104,
    invalidation: 106,
    target: 100,
    timeframe: "15M",
  });
  const withoutInput = buildSmcMtfShadowSnapshot(MTF_RESULT, "2026-06-11T12:15:00.000Z", EXACT_ZONE);
  const s = summarizeMtfObFvgShadowSnapshots([{ smcMtfShadowSnapshot: withInput }, { smcMtfShadowSnapshot: withoutInput }]);
  assert.equal(s.exactZoneSamples, 2);
  assert.equal(s.fillResolutionInputSamples, 1);
  assert.equal(s.fillResolutionInputMissing, 1);
  assert.equal(s.fillResolutionGeometryReadyCount, 1);
});

test("old snapshot records without exactZone still parse", () => {
  const oldRecord = buildSmcMtfShadowSnapshot(MTF_RESULT, NOW);
  const s = summarizeMtfObFvgShadowSnapshots([{ smcMtfShadowSnapshot: oldRecord }]);
  assert.equal(s.available, true);
  assert.equal(s.exactZoneSamples, 0);
  assert.equal(s.usesExactObFvgZonesCount, 0);
});

test("summary skips malformed exactZone safely", () => {
  const record = { ...buildSmcMtfShadowSnapshot(MTF_RESULT, NOW), exactZone: { token: "secret", usesExactObFvgZones: true } };
  const s = summarizeMtfObFvgShadowSnapshots([{ smcMtfShadowSnapshot: record }]);
  assert.equal(s.available, true);
  assert.equal(s.exactZoneSamples, 0);
  assert.equal(s.usesExactObFvgZonesCount, 0);
});

test("malformed snapshots are skipped", () => {
  const s = summarizeMtfObFvgShadowSnapshots([
    { smcMtfShadowSnapshot: { source: "wrong", token: "secret", currentRawRR: 999 } },
    { smcMtfShadowSnapshot: null },
  ]);
  assert.deepEqual(s, emptyMtfObFvgShadowSnapshotSummary());
});

test("summary contains no secret-shaped fields", () => {
  const s = summarizeMtfObFvgShadowSnapshots([{ smcMtfShadowSnapshot: buildSmcMtfShadowSnapshot(MTF_RESULT, NOW) }]);
  const keys = JSON.stringify(s).toLowerCase();
  assert.doesNotMatch(keys, /token|secret|authorization|bearer|header/);
});

test("pure helper has no I/O or decision imports", async () => {
  const src = await readFile("lib/trend/mtfObFvgShadowSnapshot.ts", "utf8");
  assert.doesNotMatch(src, /process\.env|appendFile|writeFile|readFile|fetch\(/);
  assert.doesNotMatch(src, /trendPaperEvidenceRunner|trendPaperExecutionEngine|trendPaperJournalWriter|route/);
});
