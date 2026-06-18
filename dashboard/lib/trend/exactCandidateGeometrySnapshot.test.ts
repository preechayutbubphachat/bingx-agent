// dashboard/lib/trend/exactCandidateGeometrySnapshot.test.ts
// Run: node --test --experimental-strip-types lib/trend/exactCandidateGeometrySnapshot.test.ts

import assert from "node:assert/strict";
import test from "node:test";

import { buildExactCandidateGeometrySnapshot } from "./exactCandidateGeometrySnapshot.ts";

const NOW = "2026-06-19T03:00:00.000Z";

function exactShadowSnapshot() {
  return {
    schemaVersion: 1,
    source: "mtf-ob-fvg-refinement-shadow",
    capturedAt: NOW,
    dataStatus: "ACTUAL_OB_FVG_AVAILABLE",
    classification: "REFINED_PASS",
    qualityScore: 72,
    currentRawRR: 1.8,
    currentNetRR: 1.55,
    refinedRawRR: 2.4,
    refinedNetRR: 2.1,
    rrImprovement: 0.6,
    netRrImprovement: 0.55,
    wouldPassStaticRR: true,
    wouldPassNetRR: true,
    requiredRR: 1.2,
    shadowOnly: true,
    usesExactObFvgZones: true,
    notes: ["exact candidate geometry available"],
    exactZone: {
      schemaVersion: 1,
      usesExactObFvgZones: true,
      exactZoneCandidateId: "mtfzone:1H:BEARISH:ob-fvg:1",
      exactZoneReadiness: "MTF_ALIGNED",
      exactZoneDataStatus: "MTF_EXACT_ZONE_ALIGNED",
      exactZoneSource: "MTF_OB_FVG_ZONE_MERGER_V1",
      exactRawRR: 2.5,
      exactNetRR: 2.15,
      exactVsHeuristicDelta: 0.6,
      wouldHaveFilledPending: true,
      warnings: [],
      fillResolutionInput: {
        schemaVersion: 1,
        direction: "SHORT",
        entry: 101,
        invalidation: 103,
        target: 96,
        timeframe: "15M",
        capturedAt: NOW,
        source: "D5_1_FILL_RESOLUTION_INPUT_V1",
      },
      setupContext: {
        schemaVersion: 1,
        source: "D5_2_SETUP_CONTEXT_V1",
        capturedAt: NOW,
        canonicalRegime: "TREND",
        canonicalDirection: "BEARISH",
        priceVsGrid: "INSIDE_GRID",
        dynamicGridStatus: "NO_TRADE",
      },
    },
  };
}

test("builds structured exact candidate geometry from exact shadow snapshot", () => {
  const result = buildExactCandidateGeometrySnapshot({
    capturedAt: NOW,
    currentPriceContext: {
      currentPrice: 100.9,
      priceSource: "market_snapshot.15m.close",
      latestCandleAt: NOW,
      freshnessStatus: "FRESH",
    },
    smcMtfShadowSnapshot: exactShadowSnapshot(),
  });

  assert.equal(result.schemaVersion, 1);
  assert.equal(result.source, "EXACT_CANDIDATE_GEOMETRY_SNAPSHOT_V1");
  assert.equal(result.currentPrice, 100.9);
  assert.equal(result.priceSource, "market_snapshot.15m.close");
  assert.equal(result.latestCandleAt, NOW);
  assert.equal(result.freshnessStatus, "FRESH");
  assert.equal(result.candidates.length, 1);
  assert.equal(result.summary.structuredGeometryCount, 1);
  assert.equal(result.summary.missingGeometryCount, 0);
  assert.equal(result.candidates[0]?.direction, "SHORT");
  assert.equal(result.candidates[0]?.entry, 101);
  assert.equal(result.candidates[0]?.invalidation, 103);
  assert.equal(result.candidates[0]?.target1, 96);
  assert.equal(result.candidates[0]?.netRR, 2.15);
  assert.equal(result.candidates[0]?.distanceToEntryPct, 0.0991);
  assert.equal(result.safety.activationAllowed, false);
  assert.equal(result.safety.paperActivationAllowed, false);
  assert.equal(result.safety.liveActivationAllowed, false);
  assert.equal(result.safety.orderAllowed, false);
});

test("aggregate-only exact summary does not create fake candidates", () => {
  const result = buildExactCandidateGeometrySnapshot({
    capturedAt: NOW,
    currentPriceContext: {
      currentPrice: 100,
      latestCandleAt: NOW,
      freshnessStatus: "FRESH",
    },
    exactZoneComparisonSummary: {
      exactSamples: 325,
      exactAvgNetRR: 5.06,
      exactReadinessCounts: { TARGET_TOO_CLOSE: 40 },
    },
  });

  assert.equal(result.candidates.length, 0);
  assert.equal(result.summary.structuredGeometryCount, 0);
  assert.equal(result.summary.missingGeometryCount, 325);
  assert.ok(result.candidates.every((candidate) => !candidate.flags.includes("MISSING_GEOMETRY_INPUT")));
  assert.ok(result.summary.missingGeometryCount > 0);
  assert.equal(result.safety.reviewOnly, true);
  assert.equal(result.safety.shadowOnly, true);
});

test("builder does not mutate input", () => {
  const input = {
    capturedAt: NOW,
    currentPriceContext: { currentPrice: 100.9, latestCandleAt: NOW, freshnessStatus: "FRESH" },
    smcMtfShadowSnapshot: exactShadowSnapshot(),
  };
  const before = JSON.stringify(input);

  buildExactCandidateGeometrySnapshot(input);

  assert.equal(JSON.stringify(input), before);
});
