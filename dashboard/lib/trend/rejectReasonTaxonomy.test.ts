// dashboard/lib/trend/rejectReasonTaxonomy.test.ts
// Phase T-3H-6-a1 — pure coverage for reject-reason taxonomy grouping.
// Run: node --test --experimental-strip-types lib/trend/rejectReasonTaxonomy.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyRejectReason,
  groupRejectReasonCounts,
  CATEGORY_LABEL_TH,
} from "./rejectReasonTaxonomy.ts";

test("known HARD_BLOCKER reasons classify correctly", () => {
  for (const r of [
    "reward_risk_min",
    "confirmation_required",
    "confirmation_waiting_5m",
    "price_not_near_target",
    "regime_direction_mismatch",
    "zone_not_ready",
    "risk_rejected",
  ]) {
    assert.equal(classifyRejectReason(r), "HARD_BLOCKER", r);
  }
});

test("known SOFT_WAIT reasons classify correctly", () => {
  for (const r of [
    "trend_status_awaiting_or_setup_ready",
    "price_inside_entry_zone_or_edge",
    "zone_build_ready",
    "waiting_5m_confirm",
  ]) {
    assert.equal(classifyRejectReason(r), "SOFT_WAIT", r);
  }
});

test("known PASS_CONTEXT reasons classify correctly", () => {
  for (const r of ["risk_status_pass", "indicator_gate_not_conflicting", "regime_direction_match"]) {
    assert.equal(classifyRejectReason(r), "PASS_CONTEXT", r);
  }
});

test("unknown/neutral reasons return INFO", () => {
  for (const r of ["foo_bar_xyz", "some_new_reason", "", "   "]) {
    assert.equal(classifyRejectReason(r), "INFO", JSON.stringify(r));
  }
});

test("exact table wins over keyword fallback (confirmation_waiting_5m is HARD even though it contains 'waiting')", () => {
  assert.equal(classifyRejectReason("confirmation_waiting_5m"), "HARD_BLOCKER");
});

test("conservative fallback handles naming drift", () => {
  assert.equal(classifyRejectReason("spread_check_pass"), "PASS_CONTEXT");
  assert.equal(classifyRejectReason("session_direction_match"), "PASS_CONTEXT");
  assert.equal(classifyRejectReason("volume_awaiting_data"), "SOFT_WAIT");
  assert.equal(classifyRejectReason("liquidity_rejected"), "HARD_BLOCKER");
  assert.equal(classifyRejectReason("atr_required"), "HARD_BLOCKER");
});

test("classification is case/whitespace tolerant", () => {
  assert.equal(classifyRejectReason("  Reward_Risk_Min "), "HARD_BLOCKER");
});

test("grouping counts and sorts correctly", () => {
  const g = groupRejectReasonCounts({
    reward_risk_min: 18,
    confirmation_required: 15,
    price_inside_entry_zone_or_edge: 12,
    risk_status_pass: 12,
    indicator_gate_not_conflicting: 9,
    mystery_reason: 2,
    zero_count_ignored: 0,
  });
  assert.deepEqual(g.hardBlockers, [
    { reason: "reward_risk_min", count: 18 },
    { reason: "confirmation_required", count: 15 },
  ]);
  assert.deepEqual(g.softWaits, [{ reason: "price_inside_entry_zone_or_edge", count: 12 }]);
  assert.deepEqual(g.passContext, [
    { reason: "risk_status_pass", count: 12 },
    { reason: "indicator_gate_not_conflicting", count: 9 },
  ]);
  assert.deepEqual(g.info, [{ reason: "mystery_reason", count: 2 }]);
  assert.equal(g.totalReasonCount, 18 + 15 + 12 + 12 + 9 + 2);
  assert.equal(g.hardBlockerCount, 33);
});

test("empty/null input → empty groups, no throw", () => {
  for (const v of [null, undefined, {}]) {
    const g = groupRejectReasonCounts(v as Record<string, number> | null | undefined);
    assert.equal(g.totalReasonCount, 0);
    assert.deepEqual(g.hardBlockers, []);
  }
});

test("Thai labels exist for every category", () => {
  for (const k of ["HARD_BLOCKER", "SOFT_WAIT", "PASS_CONTEXT", "INFO"] as const) {
    assert.ok(CATEGORY_LABEL_TH[k].length > 0);
  }
});

test("decision-path isolation: runner never imports the taxonomy", async () => {
  const fs = await import("fs/promises");
  const path = await import("path");
  const runnerSrc = await fs.readFile(path.join(process.cwd(), "lib/trend/trendPaperEvidenceRunner.ts"), "utf8");
  assert.doesNotMatch(runnerSrc, /rejectReasonTaxonomy/);
});
