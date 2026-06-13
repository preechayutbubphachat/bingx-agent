// dashboard/lib/trend/exactZoneComparisonSummary.test.ts
// Run: node --test --experimental-strip-types lib/trend/exactZoneComparisonSummary.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  emptyExactZoneComparisonSummary,
  summarizeExactZoneComparison,
  type ExactZoneComparisonCandle,
} from "./exactZoneComparisonSummary.ts";

const baseTime = Date.parse("2026-06-12T00:00:00.000Z");
const iso = (minutes: number) => new Date(baseTime + minutes * 60_000).toISOString();

function record(overrides: Record<string, unknown> = {}) {
  return {
    smcMtfShadowSnapshot: {
      schemaVersion: 1,
      source: "mtf-ob-fvg-refinement-shadow",
      capturedAt: iso(0),
      dataStatus: "HEURISTIC_ESTIMATE_ONLY",
      classification: "REFINEMENT_IMPROVES_RR",
      qualityScore: 70,
      currentRawRR: 1.1,
      currentNetRR: 1,
      refinedRawRR: 1.35,
      refinedNetRR: 1.28,
      rrImprovement: 0.25,
      netRrImprovement: 0.28,
      wouldPassStaticRR: true,
      wouldPassNetRR: true,
      requiredRR: 1.2,
      shadowOnly: true,
      usesExactObFvgZones: false,
      notes: [],
      ...overrides,
    },
  };
}

function exactRecord(overrides: Record<string, unknown> = {}) {
  return record({
    usesExactObFvgZones: true,
    exactZone: {
      schemaVersion: 1,
      usesExactObFvgZones: true,
      exactZoneCandidateId: "mtfzone:1H:BEARISH:ob:1",
      exactZoneReadiness: "MTF_ALIGNED",
      exactZoneDataStatus: "MTF_EXACT_ZONE_ALIGNED",
      exactZoneSource: "MTF_OB_FVG_ZONE_MERGER_V1",
      exactRawRR: 1.6,
      exactNetRR: 1.42,
      exactVsHeuristicDelta: 0.14,
      wouldHaveFilledPending: true,
      warnings: [],
      ...overrides,
    },
  });
}

test("empty records => NO_DATA", () => {
  assert.deepEqual(summarizeExactZoneComparison([]), emptyExactZoneComparisonSummary());
});

test("old heuristic-only records remain valid", () => {
  const s = summarizeExactZoneComparison([record()]);
  assert.equal(s.exactSamples, 0);
  assert.equal(s.heuristicSamples, 1);
  assert.equal(s.heuristicAvgNetRR, 1.28);
  assert.equal(s.rrMetricScope, "TOP_CLEAN_CANDIDATE");
  assert.equal(s.readinessMetricScope, "AGGREGATE_WORST_OF_ALL_ZONES");
  assert.match(s.conflictLabelNote, /EXACT_ZONE_CONFLICT/);
  assert.deepEqual(s.conflictBreakdown, {
    TARGET_TOO_CLOSE: 0,
    COST_TOO_HIGH: 0,
    CONFLICTING_MTF: 0,
    other: {},
  });
  assert.equal(s.readiness, "NO_DATA");
});

test("exact records counted and averaged correctly", () => {
  const s = summarizeExactZoneComparison([
    exactRecord({ exactNetRR: 1.42, exactVsHeuristicDelta: 0.14 }),
    exactRecord({ exactZoneDataStatus: "EXACT_OB_ONLY", exactZoneReadiness: "OB_ONLY", exactNetRR: 1.32, exactVsHeuristicDelta: 0.04 }),
  ]);
  assert.equal(s.exactSamples, 2);
  assert.equal(s.heuristicSamples, 2);
  assert.equal(s.usesExactObFvgZonesCount, 2);
  assert.equal(s.exactAvgNetRR, 1.37);
  assert.equal(s.heuristicAvgNetRR, 1.28);
  assert.equal(s.avgExactVsHeuristicDelta, 0.09);
  assert.equal(s.exactPassCount, 2);
  assert.equal(s.exactPassRate, 1);
  assert.equal(s.exactDataStatusCounts.MTF_EXACT_ZONE_ALIGNED, 1);
  assert.equal(s.exactDataStatusCounts.EXACT_OB_ONLY, 1);
  assert.equal(s.exactReadinessCounts.MTF_ALIGNED, 1);
  assert.equal(s.exactReadinessCounts.OB_ONLY, 1);
});

test("scope metadata is additive and does not change D5 math", () => {
  const s = summarizeExactZoneComparison([
    exactRecord({ exactNetRR: 1.42, exactVsHeuristicDelta: 0.14 }),
    exactRecord({ exactZoneDataStatus: "EXACT_OB_ONLY", exactZoneReadiness: "OB_ONLY", exactNetRR: 1.32, exactVsHeuristicDelta: 0.04 }),
  ]);
  assert.equal(s.exactAvgNetRR, 1.37);
  assert.equal(s.exactPassRate, 1);
  assert.deepEqual([...s.warningFlags].sort(), ["LOW_EXACT_SAMPLE_SIZE", "REVIEW_NOT_ACTIVATION"].sort());
  assert.equal(s.rrMetricScope, "TOP_CLEAN_CANDIDATE");
  assert.equal(s.readinessMetricScope, "AGGREGATE_WORST_OF_ALL_ZONES");
  assert.match(s.conflictLabelNote, /target-too-close/);
});

test("conflictBreakdown mirrors exactReadinessCounts without relabeling math", () => {
  const s = summarizeExactZoneComparison([
    exactRecord({ exactZoneReadiness: "TARGET_TOO_CLOSE" }),
    exactRecord({ exactZoneReadiness: "COST_TOO_HIGH" }),
    exactRecord({ exactZoneReadiness: "CONFLICTING_MTF" }),
    exactRecord({ exactZoneReadiness: "OB_ONLY" }),
    exactRecord({ exactZoneReadiness: "MTF_ALIGNED" }),
  ]);
  assert.equal(s.exactReadinessCounts.TARGET_TOO_CLOSE, 1);
  assert.equal(s.exactReadinessCounts.COST_TOO_HIGH, 1);
  assert.equal(s.exactReadinessCounts.CONFLICTING_MTF, 1);
  assert.equal(s.exactReadinessCounts.OB_ONLY, 1);
  assert.equal(s.exactReadinessCounts.MTF_ALIGNED, 1);
  assert.deepEqual(s.conflictBreakdown, {
    TARGET_TOO_CLOSE: 1,
    COST_TOO_HIGH: 1,
    CONFLICTING_MTF: 1,
    other: {
      OB_ONLY: 1,
      MTF_ALIGNED: 1,
    },
  });
});

test("sample tiers use <50 / 50-99 / >=100", () => {
  const recs49 = Array.from({ length: 49 }, () => exactRecord());
  const recs50 = Array.from({ length: 50 }, () => exactRecord());
  const recs100 = Array.from({ length: 100 }, () => exactRecord());
  assert.equal(summarizeExactZoneComparison(recs49).sampleTier, "INFORMATIONAL_LT_50");
  assert.equal(summarizeExactZoneComparison(recs50).sampleTier, "EARLY_PATTERN_50_TO_99");
  assert.equal(summarizeExactZoneComparison(recs100).sampleTier, "REVIEW_ELIGIBLE_100_PLUS");
  assert.equal(summarizeExactZoneComparison(recs100).readiness, "REVIEW_ELIGIBLE");
});

test("warning flags cover low sample, OB-only dominance, negative delta, and low pass rate", () => {
  const low = summarizeExactZoneComparison([exactRecord()]);
  assert.ok(low.warningFlags.includes("LOW_EXACT_SAMPLE_SIZE"));
  assert.ok(low.warningFlags.includes("REVIEW_NOT_ACTIVATION"));

  const obOnly = summarizeExactZoneComparison(
    Array.from({ length: 30 }, () => exactRecord({ exactZoneDataStatus: "EXACT_OB_ONLY", exactZoneReadiness: "OB_ONLY" })),
  );
  assert.ok(obOnly.warningFlags.includes("OB_ONLY_DOMINANT"));
  assert.ok(obOnly.warningFlags.includes("NO_FVG_CONFLUENCE"));

  const negative = summarizeExactZoneComparison([exactRecord({ exactNetRR: 1.1, exactVsHeuristicDelta: -0.2 })]);
  assert.ok(negative.warningFlags.includes("NEGATIVE_EXACT_DELTA"));

  const lowPass = summarizeExactZoneComparison(
    Array.from({ length: 50 }, () => exactRecord({ exactNetRR: 1, exactVsHeuristicDelta: -0.1 })),
  );
  assert.ok(lowPass.warningFlags.includes("LOW_EXACT_PASS_RATE"));
  assert.equal(lowPass.readiness, "WARNING_DEGRADED");
});

test("fillResolution returns NOT_CONFIGURED when no candles", () => {
  const s = summarizeExactZoneComparison([exactRecord()]);
  assert.equal(s.fillResolution.status, "NOT_CONFIGURED");
});

test("fillResolution handles filled before invalidation", () => {
  const candles: ExactZoneComparisonCandle[] = [
    { t: iso(15), high: 105, low: 103 },
    { t: iso(30), high: 107, low: 106.5 },
  ];
  const s = summarizeExactZoneComparison(
    [exactRecord({ direction: "SHORT", refinedEntry: 104, invalidationPrice: 106 })],
    { candlesByTimeframe: { "15m": candles }, settings: { fillLookaheadBars: 2 } },
  );
  assert.equal(s.fillResolution.status, "RESOLVED");
  assert.equal(s.fillResolution.filled, 1);
  assert.equal(s.fillResolution.missed, 0);
});

test("fillResolution handles invalidation before fill", () => {
  const candles: ExactZoneComparisonCandle[] = [
    { t: iso(15), high: 106.5, low: 105.5 },
    { t: iso(30), high: 104.5, low: 103.5 },
  ];
  const s = summarizeExactZoneComparison(
    [exactRecord({ direction: "SHORT", refinedEntry: 104, invalidationPrice: 106 })],
    { candlesByTimeframe: { "15m": candles }, settings: { fillLookaheadBars: 2 } },
  );
  assert.equal(s.fillResolution.status, "RESOLVED");
  assert.equal(s.fillResolution.invalidationFirst, 1);
  assert.equal(s.fillResolution.missed, 1);
  assert.equal(s.fillResolution.missedFillRate, 1);
  assert.ok(s.warningFlags.includes("HIGH_MISSED_FILL_RATE"));
});

test("fillResolution handles pending when fields or future candles are insufficient", () => {
  const s = summarizeExactZoneComparison(
    [exactRecord({ direction: "SHORT", refinedEntry: 104, invalidationPrice: 106 })],
    { candlesByTimeframe: { "15m": [{ t: iso(15), high: 105, low: 104.5 }] }, settings: { fillLookaheadBars: 2 } },
  );
  assert.equal(s.fillResolution.status, "PENDING");
  assert.equal(s.fillResolution.pending, 1);
});

test("helper is deterministic and does not mutate input", () => {
  const records = [exactRecord({ exactNetRR: 1.5 })];
  const before = JSON.stringify(records);
  const a = summarizeExactZoneComparison(records);
  const b = summarizeExactZoneComparison(records);
  assert.deepEqual(a, b);
  assert.equal(JSON.stringify(records), before);
});

test("helper has no route, runner, execution, I/O, or env imports", async () => {
  const src = await readFile("lib/trend/exactZoneComparisonSummary.ts", "utf8");
  const importLines = src.split("\n").filter((line) => /^\s*import\s/.test(line)).join("\n");
  assert.doesNotMatch(importLines, /route|trendPaperEvidenceRunner|trendPaperExecutionEngine|trendPaperJournalWriter|broker|execution/);
  assert.doesNotMatch(src, /process\.env|appendFile|writeFile|readFile|fetch\(/);
});
