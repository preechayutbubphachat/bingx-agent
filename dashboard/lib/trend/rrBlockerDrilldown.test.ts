// dashboard/lib/trend/rrBlockerDrilldown.test.ts
// Phase T-3H-6-b - pure coverage for the RR blocker drilldown.
// Run: node --test --experimental-strip-types lib/trend/rrBlockerDrilldown.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import {
  computeRrBlockerDrilldown,
  RR_REASON_LABEL_TH,
  RR_SEVERITY_LABEL_TH,
} from "./rrBlockerDrilldown.ts";

const BASE = {
  rawRR: 1.0,
  requiredRR: 1.2,
  entry: 100_000,
  stopLoss: 99_000, // risk 1000
  target1: 101_000, // reward 1000
  currentPrice: 100_100,
  distanceToEntryZonePct: 0.1,
  riskStatus: "PASS",
  feePct: 0.05,
  slippagePct: 0.02,
};

test("missing rawRR/requiredRR -> available=false, no severity", () => {
  const r = computeRrBlockerDrilldown({ rawRR: null, requiredRR: 1.2 });
  assert.equal(r.available, false);
  assert.equal(r.failSeverity, null);
  assert.equal(r.reason, null);
});

test("distances and rrGap computed correctly", () => {
  const r = computeRrBlockerDrilldown(BASE);
  assert.equal(r.riskDistance, 1000);
  assert.equal(r.rewardDistance, 1000);
  assert.equal(r.rrGap, 0.2);
});

test("severity bands: PASS / NEAR_MISS / MODERATE_GAP / HARD_GAP", () => {
  assert.equal(computeRrBlockerDrilldown({ ...BASE, rawRR: 1.3 }).failSeverity, "PASS");
  assert.equal(computeRrBlockerDrilldown({ ...BASE, rawRR: 1.2 }).failSeverity, "PASS");
  assert.equal(computeRrBlockerDrilldown({ ...BASE, rawRR: 1.1 }).failSeverity, "NEAR_MISS");
  assert.equal(computeRrBlockerDrilldown({ ...BASE, rawRR: 0.8 }).failSeverity, "MODERATE_GAP");
  assert.equal(computeRrBlockerDrilldown({ ...BASE, rawRR: 0.5 }).failSeverity, "HARD_GAP");
});

test("PASS -> reason null", () => {
  const r = computeRrBlockerDrilldown({ ...BASE, rawRR: 1.5 });
  assert.equal(r.reason, null);
});

test("riskStatus NO_TRADE_NEAR_TARGET wins -> TARGET_TOO_CLOSE", () => {
  const r = computeRrBlockerDrilldown({ ...BASE, riskStatus: "NO_TRADE_NEAR_TARGET", distanceToEntryZonePct: 5, feePct: 1 });
  assert.equal(r.reason, "TARGET_TOO_CLOSE");
});

test("riskStatus NO_TRADE_VOLATILITY wins -> VOLATILITY_UNSUITABLE", () => {
  const r = computeRrBlockerDrilldown({ ...BASE, riskStatus: "NO_TRADE_VOLATILITY", distanceToEntryZonePct: 5, feePct: 1 });
  assert.equal(r.reason, "VOLATILITY_UNSUITABLE");
});

test("classification priority: cost beats entry-far and geometry after riskStatus", () => {
  const r = computeRrBlockerDrilldown({
    ...BASE,
    rawRR: 1.18,
    requiredRR: 1.2,
    distanceToEntryZonePct: 2.5,
    feePct: 0.3,
    slippagePct: 0.1,
  });
  assert.equal(r.failSeverity, "NEAR_MISS");
  assert.ok(r.costR != null && r.costR >= 0.05);
  assert.equal(r.reason, "COST_TOO_HIGH");
});

test("entry far from zone -> ENTRY_TOO_FAR when riskStatus/cost do not explain it", () => {
  const r = computeRrBlockerDrilldown({ ...BASE, distanceToEntryZonePct: 2.5, feePct: 0, slippagePct: 0 });
  assert.equal(r.reason, "ENTRY_TOO_FAR");
});

test("geometry: reward leg shorter than risk leg (RR<1) -> TARGET_TOO_CLOSE", () => {
  const r = computeRrBlockerDrilldown({ ...BASE, target1: 100_500, rawRR: 0.5, feePct: 0, slippagePct: 0 });
  assert.equal(r.reason, "TARGET_TOO_CLOSE");
  const r2 = computeRrBlockerDrilldown({ ...BASE, stopLoss: 98_000, rawRR: 0.5, feePct: 0, slippagePct: 0 });
  assert.equal(r2.reason, "TARGET_TOO_CLOSE");
});

test("geometry: RR >= 1 but below required -> STOP_TOO_WIDE", () => {
  const r = computeRrBlockerDrilldown({ ...BASE, target1: 101_300, rawRR: 1.3, requiredRR: 1.5, feePct: 0, slippagePct: 0 });
  assert.equal(r.failSeverity, "MODERATE_GAP");
  assert.equal(r.reason, "STOP_TOO_WIDE");
});

test("failing with no price data -> UNKNOWN", () => {
  const r = computeRrBlockerDrilldown({ rawRR: 1.0, requiredRR: 1.2 });
  assert.equal(r.available, true);
  assert.equal(r.reason, "UNKNOWN");
});

test("costR approximation computed from fee+slippage round trip", () => {
  const r = computeRrBlockerDrilldown(BASE);
  // (0.05 + 0.02) * 2 / 100 * 100000 = 140 abs -> /1000 = 0.14R
  assert.equal(r.costR, 0.14);
  assert.equal(r.netRR, 0.86);
});

test("labels exist for all severities/reasons", () => {
  for (const k of ["PASS", "NEAR_MISS", "MODERATE_GAP", "HARD_GAP"] as const) assert.ok(RR_SEVERITY_LABEL_TH[k]);
  for (const k of ["TARGET_TOO_CLOSE", "STOP_TOO_WIDE", "ENTRY_TOO_FAR", "COST_TOO_HIGH", "VOLATILITY_UNSUITABLE", "UNKNOWN"] as const) {
    assert.ok(RR_REASON_LABEL_TH[k]);
  }
});

test("decision-path isolation: strategy/gate/preflight/runner never import the drilldown", async () => {
  const fs = await import("fs/promises");
  const path = await import("path");
  for (const f of [
    "lib/trend/trendStrategy.ts",
    "lib/trend/trendManualPaperArmGate.ts",
    "lib/trend/trendPaperExecutionPreflight.ts",
    "lib/trend/trendPaperEvidenceRunner.ts",
  ]) {
    const src = await fs.readFile(path.join(process.cwd(), f), "utf8");
    assert.doesNotMatch(src, /rrBlockerDrilldown/, f);
  }
});
