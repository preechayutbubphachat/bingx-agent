// dashboard/lib/trend/mtfObFvgRefinementShadow.test.ts
// Run: node --test --experimental-strip-types lib/trend/mtfObFvgRefinementShadow.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { computeMtfObFvgRefinementShadow, type MtfObFvgRefinementShadowInput } from "./mtfObFvgRefinementShadow.ts";

const BASE: MtfObFvgRefinementShadowInput = {
  direction: "SHORT",
  currentEntry: 63_100,
  currentStop: 63_500,
  currentTarget: 62_636,
  currentRawRR: 1.16,
  requiredRR: 1.2,
  feePct: 0.05,
  slippagePct: 0.02,
  regime: "DOWNTREND",
  adx: 35,
  atrPct: 0.75,
  bbw: 0.03,
  currentPrice: 63_120,
  distanceToEntryZonePct: 0.2,
  entryZone: [63_050, 63_250],
};

test("missing data returns NO_DATA", () => {
  const r = computeMtfObFvgRefinementShadow({ requiredRR: 1.2 });
  assert.equal(r.available, false);
  assert.equal(r.classification, "NO_DATA");
  assert.equal(r.dataStatus, "INSUFFICIENT_DATA");
  assert.equal(r.paperActivationAllowed, false);
  assert.equal(r.liveActivationAllowed, false);
  assert.equal(r.exchangeOrderAllowed, false);
});

test("near-miss current RR can classify ENTRY_GEOMETRY_NEAR_MISS", () => {
  const r = computeMtfObFvgRefinementShadow(BASE);
  assert.equal(r.classification, "ENTRY_GEOMETRY_NEAR_MISS");
  assert.equal(r.dataStatus, "HEURISTIC_ESTIMATE_ONLY");
  assert.ok((r.rrImprovement ?? 0) > 0);
  assert.equal(r.shadowOnly, true);
});

test("cost drag dominant remains visible when net RR still fails", () => {
  const r = computeMtfObFvgRefinementShadow({
    ...BASE,
    currentRawRR: 1.18,
    currentTarget: 62_628,
    feePct: 0.3,
    slippagePct: 0.2,
  });
  assert.ok(["COST_DRAG_DOMINANT", "REFINEMENT_STILL_FAILS_COST"].includes(r.classification));
  assert.ok((r.currentCostR ?? 0) > 0.05);
  assert.equal(r.wouldPassNetRR, false);
});

test("exact OB zone can improve RR while remaining shadow-only", () => {
  const r = computeMtfObFvgRefinementShadow({
    ...BASE,
    optionalObZone: { low: 63_250, high: 63_360 },
    entryZone: null,
  });
  assert.equal(r.dataStatus, "ACTUAL_OB_FVG_AVAILABLE");
  assert.ok((r.refinedRawRR ?? 0) > (r.currentRawRR ?? 0));
  assert.equal(r.shadowOnly, true);
  assert.equal(r.paperActivationAllowed, false);
});

test("refined raw RR can pass while net RR still fails after high costs", () => {
  const r = computeMtfObFvgRefinementShadow({
    ...BASE,
    currentRawRR: 1.0,
    currentTarget: 62_700,
    feePct: 0.4,
    slippagePct: 0.25,
    optionalFvgZone: { low: 63_220, high: 63_360 },
  });
  assert.equal(r.classification, "REFINEMENT_STILL_FAILS_COST");
  assert.equal(r.wouldPassStaticRR, true);
  assert.equal(r.wouldPassNetRR, false);
});

test("target too close is classified from geometry", () => {
  const r = computeMtfObFvgRefinementShadow({
    ...BASE,
    currentTarget: 62_900,
    currentRawRR: 0.5,
    feePct: 0,
    slippagePct: 0,
  });
  assert.equal(r.classification, "TARGET_TOO_CLOSE");
});

test("no usable zone context returns NO_REFINEMENT_AVAILABLE", () => {
  const r = computeMtfObFvgRefinementShadow({
    ...BASE,
    currentPrice: null,
    distanceToEntryZonePct: null,
    entryZone: null,
    optionalObZone: null,
    optionalFvgZone: null,
  });
  assert.equal(r.available, false);
  assert.equal(r.classification, "NO_REFINEMENT_AVAILABLE");
});

test("quality score is bounded 0-100", () => {
  const r = computeMtfObFvgRefinementShadow(BASE);
  assert.ok(r.qualityScore >= 0);
  assert.ok(r.qualityScore <= 100);
});

test("helper is deterministic", () => {
  const a = computeMtfObFvgRefinementShadow(BASE);
  const b = computeMtfObFvgRefinementShadow(BASE);
  assert.deepEqual(a, b);
});

test("helper does not mutate input", () => {
  const input: MtfObFvgRefinementShadowInput = structuredClone(BASE);
  const before = structuredClone(input);
  Object.freeze(input);
  computeMtfObFvgRefinementShadow(input);
  assert.deepEqual(input, before);
});

test("helper has no env/read-write/runner/route/execution imports", async () => {
  const src = await readFile("lib/trend/mtfObFvgRefinementShadow.ts", "utf8");
  assert.doesNotMatch(src, /process\.env/);
  assert.doesNotMatch(src, /trendPaperEvidenceRunner|trendPaperExecutionEngine|trendPaperJournalWriter|route/);
  assert.doesNotMatch(src, /appendFile|writeFile|fetch\(|placeOrder|createOrder|BingX/i);
});
