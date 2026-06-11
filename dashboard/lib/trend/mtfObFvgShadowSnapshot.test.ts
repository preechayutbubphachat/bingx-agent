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

test("summary computes averages and counts", () => {
  const one = buildSmcMtfShadowSnapshot(MTF_RESULT, "2026-06-11T12:00:00.000Z");
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
  assert.equal(s.latestSnapshot?.classification, "COST_DRAG_DOMINANT");
  assert.equal(s.sampleWarning, true);
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
