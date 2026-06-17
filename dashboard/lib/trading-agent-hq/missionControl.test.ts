// dashboard/lib/trading-agent-hq/missionControl.test.ts
// Run: node --test --experimental-strip-types lib/trading-agent-hq/missionControl.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { MOCK_VIEW_MODEL } from "./mockState.ts";
import { buildMissionControlSummary, missionStatusTone } from "./missionControl.ts";

test("mission summary is display-only and keeps safety posture explicit", () => {
  const summary = buildMissionControlSummary(MOCK_VIEW_MODEL, "12:34:56");
  assert.equal(summary.environment, "PAPER REVIEW");
  assert.equal(summary.region, "Thailand (BKK)");
  assert.equal(summary.systemTime, "12:34:56");
  assert.equal(summary.safetyLine, "Review-only · ไม่ใช่ Activation · Live OFF · Order OFF");
  assert.ok(summary.kpis.some((item) => item.id === "paperMode" && item.value === "Paper-only"));
});

test("mission status tone avoids ready-to-trade language", () => {
  assert.equal(missionStatusTone("READY_FOR_REVIEW"), "review");
  assert.equal(missionStatusTone("PARTIAL_REVIEW"), "info");
  assert.equal(missionStatusTone("NOT_READY"), "waiting");
  assert.equal(missionStatusTone(null), "waiting");
});
