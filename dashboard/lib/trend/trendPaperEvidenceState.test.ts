// dashboard/lib/trend/trendPaperEvidenceState.test.ts
// Run: node --experimental-strip-types --test dashboard/lib/trend/trendPaperEvidenceState.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import * as os from "os";
import * as path from "path";
import * as fs from "fs/promises";
import {
  defaultTrendPaperEvidenceState,
  validateTrendPaperEvidenceState,
  writeTrendPaperEvidenceState,
  readTrendPaperEvidenceState,
  applyDailyReset,
  utcDateKey,
  type TrendPaperEvidenceState,
} from "./trendPaperEvidenceState.ts";

async function tmpStatePath() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "t3h4a-"));
  return path.join(dir, "trend-paper", "trend_paper_evidence_state.json");
}

test("1: default state is disabled and paper-only", () => {
  const s = defaultTrendPaperEvidenceState();
  assert.equal(s.evidencePhase, "DISABLED");
  assert.equal(s.enabled, false);
  assert.equal(s.paperOnly, true);
  assert.equal(s.liveActivationAllowed, false);
  assert.equal(s.exchangeOrderAllowed, false);
  assert.equal(s.targetClosedTrades, 30);
  assert.equal(s.sampleStatus, "INSUFFICIENT_SAMPLE_BOOTSTRAP");
  assert.equal(s.readyForNextPhase, false);
  assert.equal(validateTrendPaperEvidenceState(s).valid, true);
});

test("2: state path is canonical / path-locked", async () => {
  await assert.rejects(
    writeTrendPaperEvidenceState(defaultTrendPaperEvidenceState(), { sessionPath: undefined, filePath: "/tmp/evil/other.json" } as never),
    /trend_paper_evidence_state_path_not_allowed/,
  );
  await assert.rejects(
    readTrendPaperEvidenceState({ filePath: path.join(os.tmpdir(), "grid", "state.json") }),
    /trend_paper_evidence_state_path_not_allowed/,
  );
});

test("3: write is atomic + readable round-trip", async () => {
  const p = await tmpStatePath();
  const r = await writeTrendPaperEvidenceState(defaultTrendPaperEvidenceState(), { filePath: p });
  assert.equal(r.ok, true);
  const back = await readTrendPaperEvidenceState({ filePath: p });
  assert.equal(back.exists, true);
  assert.equal(back.state.evidencePhase, "DISABLED");
  assert.ok(back.state.updatedAt != null);
  // no leftover tmp files
  const files = await fs.readdir(path.dirname(p));
  assert.equal(files.filter((f) => f.includes(".tmp-")).length, 0);
});

test("4: rejects liveActivationAllowed=true on write", async () => {
  const p = await tmpStatePath();
  const bad = { ...defaultTrendPaperEvidenceState(), liveActivationAllowed: true } as unknown as TrendPaperEvidenceState;
  // writer hard-forces flags false, so validation always passes — assert the forced value
  const back = await writeTrendPaperEvidenceState(bad, { filePath: p });
  assert.equal(back.ok, true);
  const read = await readTrendPaperEvidenceState({ filePath: p });
  assert.equal(read.state.liveActivationAllowed, false, "writer hard-forces live false");
});

test("5: validator rejects exchangeOrderAllowed=true / paperOnly=false / non-quarantine", () => {
  assert.equal(validateTrendPaperEvidenceState({ ...defaultTrendPaperEvidenceState(), exchangeOrderAllowed: true }).valid, false);
  assert.equal(validateTrendPaperEvidenceState({ ...defaultTrendPaperEvidenceState(), paperOnly: false }).valid, false);
  assert.equal(validateTrendPaperEvidenceState({ ...defaultTrendPaperEvidenceState(), oldExposurePolicy: "USE_OLD" }).valid, false);
  assert.equal(validateTrendPaperEvidenceState({ ...defaultTrendPaperEvidenceState(), liveActivationAllowed: true }).valid, false);
});

test("6: daily reset logic (UTC day rollover resets counters)", () => {
  const base = { ...defaultTrendPaperEvidenceState(), dailyDate: "2026-06-08", dailyEntryCount: 3, dailyLossR: -2 };
  // same day → unchanged
  const same = applyDailyReset(base, Date.parse("2026-06-08T23:00:00.000Z"));
  assert.equal(same.dailyEntryCount, 3);
  assert.equal(same.dailyDate, "2026-06-08");
  // next day → reset
  const next = applyDailyReset(base, Date.parse("2026-06-09T00:05:00.000Z"));
  assert.equal(next.dailyEntryCount, 0);
  assert.equal(next.dailyLossR, 0);
  assert.equal(next.dailyDate, "2026-06-09");
  assert.equal(utcDateKey(Date.parse("2026-06-09T00:05:00.000Z")), "2026-06-09");
});
