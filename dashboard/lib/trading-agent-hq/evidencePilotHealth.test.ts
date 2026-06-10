// dashboard/lib/trading-agent-hq/evidencePilotHealth.test.ts
// Phase UI-2.1 / Task C — pure coverage for runner heartbeat health derivation.
// Run: node --test --experimental-strip-types lib/trading-agent-hq/evidencePilotHealth.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import {
  computeRunnerHealth,
  EXPECTED_INTERVAL_MINUTES,
  HEALTHY_MAX_AGE_MINUTES,
  WARNING_MAX_AGE_MINUTES,
} from "./evidencePilotHealth.ts";

const NOW = Date.parse("2026-06-11T10:00:00.000Z");
const minAgo = (m: number) => new Date(NOW - m * 60_000).toISOString();

test("constants match T-3H spec (15m interval, 25/45 thresholds)", () => {
  assert.equal(EXPECTED_INTERVAL_MINUTES, 15);
  assert.equal(HEALTHY_MAX_AGE_MINUTES, 25);
  assert.equal(WARNING_MAX_AGE_MINUTES, 45);
});

test("null/undefined/invalid lastRunAt → unknown", () => {
  assert.equal(computeRunnerHealth(null, NOW).status, "unknown");
  assert.equal(computeRunnerHealth(undefined, NOW).status, "unknown");
  assert.equal(computeRunnerHealth("not-a-date", NOW).status, "unknown");
  assert.equal(computeRunnerHealth("", NOW).minutesSinceLastRun, null);
});

test("age <= 25 min → healthy", () => {
  assert.equal(computeRunnerHealth(minAgo(0), NOW).status, "healthy");
  assert.equal(computeRunnerHealth(minAgo(14), NOW).status, "healthy");
  const edge = computeRunnerHealth(minAgo(25), NOW);
  assert.equal(edge.status, "healthy");
  assert.equal(edge.minutesSinceLastRun, 25);
});

test("25 < age <= 45 min → warning", () => {
  assert.equal(computeRunnerHealth(minAgo(26), NOW).status, "warning");
  assert.equal(computeRunnerHealth(minAgo(45), NOW).status, "warning");
});

test("age > 45 min → stale", () => {
  assert.equal(computeRunnerHealth(minAgo(46), NOW).status, "stale");
  assert.equal(computeRunnerHealth(minAgo(600), NOW).status, "stale");
});

test("future timestamp clamps to 0 minutes (clock skew safe)", () => {
  const r = computeRunnerHealth(minAgo(-5), NOW);
  assert.equal(r.status, "healthy");
  assert.equal(r.minutesSinceLastRun, 0);
});

test("labelTh is always a non-empty string", () => {
  for (const v of [null, minAgo(1), minAgo(30), minAgo(60)]) {
    assert.ok(computeRunnerHealth(v, NOW).labelTh.length > 0);
  }
});
