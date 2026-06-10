// dashboard/lib/trend/trendEvidenceDecisionLog.test.ts
// Phase T-3H-6-a — coverage for the append-only rejection decision log.
// Run: node --test --experimental-strip-types lib/trend/trendEvidenceDecisionLog.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import {
  appendTrendEvidenceDecisionLog,
  buildTrendEvidenceDecisionRecord,
  emptyTrendEvidenceDecisionSummary,
  readTrendEvidenceDecisionLogSummary,
  trimTrendEvidenceDecisionLog,
  DECISION_LOG_MAX_LINES,
  TREND_EVIDENCE_DECISION_LOG_FILE_NAME,
  type TrendEvidenceDecisionRecord,
} from "./trendEvidenceDecisionLog.ts";

const NOW = Date.parse("2026-06-11T12:00:00.000Z");
const iso = (offsetMin: number) => new Date(NOW + offsetMin * 60_000).toISOString();

function mkRecord(over: Partial<TrendEvidenceDecisionRecord> = {}): TrendEvidenceDecisionRecord {
  const base = buildTrendEvidenceDecisionRecord({
    now: iso(0),
    source: "trend-paper-evidence-cycle",
    action: "run_once",
    state: {
      evidencePhase: "EVIDENCE_COLLECTION",
      enabled: true,
      lastRunAt: iso(0),
      lastDecision: "WAITING_SETUP",
      lastGateStatus: "NOT_READY",
      lastRejectReasons: ["reward_risk_min", "confirmation_required"],
      dailyEntryCount: 0,
      dailyLossR: 0,
      openTrendPosition: null,
      trendClosedTrades: 0,
      sampleStatus: "INSUFFICIENT_SAMPLE_BOOTSTRAP",
      readyForNextPhase: false,
      stopReason: null,
    },
  });
  // over applied after build so tests can vary recordedAt/reasons/decision
  return { ...base, ...over };
}

async function withTempLog(fn: (logPath: string) => Promise<void>) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "tedl-"));
  const logPath = path.join(root, "trend-paper", TREND_EVIDENCE_DECISION_LOG_FILE_NAME);
  try {
    await fn(logPath);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}

test("record builder stamps safety invariants and whitelists fields", () => {
  const r = mkRecord();
  assert.equal(r.paperOnly, true);
  assert.equal(r.liveActivationAllowed, false);
  assert.equal(r.exchangeOrderAllowed, false);
  assert.equal(r.observabilityOnly, true);
  assert.equal(r.openTrendPosition, false);
  assert.deepEqual(r.lastRejectReasons, ["reward_risk_min", "confirmation_required"]);
  const keys = Object.keys(r).join("|").toLowerCase();
  assert.doesNotMatch(keys, /token|secret|header|authorization|key/);
});

test("append one record creates a parseable JSONL line", async () => {
  await withTempLog(async (logPath) => {
    const res = await appendTrendEvidenceDecisionLog(mkRecord(), { filePath: logPath });
    assert.equal(res.ok, true);
    const raw = await fs.readFile(logPath, "utf8");
    const lines = raw.trim().split("\n");
    assert.equal(lines.length, 1);
    const parsed = JSON.parse(lines[0]!);
    assert.equal(parsed.lastDecision, "WAITING_SETUP");
  });
});

test("append multiple records preserves order", async () => {
  await withTempLog(async (logPath) => {
    for (let i = 0; i < 3; i++) {
      await appendTrendEvidenceDecisionLog(mkRecord({ recordedAt: iso(i) }), { filePath: logPath });
    }
    const raw = await fs.readFile(logPath, "utf8");
    const times = raw.trim().split("\n").map((l) => JSON.parse(l).recordedAt);
    assert.deepEqual(times, [iso(0), iso(1), iso(2)]);
  });
});

test("summary counts reject reasons / decisions / gate statuses correctly", async () => {
  await withTempLog(async (logPath) => {
    await appendTrendEvidenceDecisionLog(mkRecord({ recordedAt: iso(-30), lastRejectReasons: ["a", "b"] }), { filePath: logPath });
    await appendTrendEvidenceDecisionLog(mkRecord({ recordedAt: iso(-15), lastRejectReasons: ["a"] }), { filePath: logPath });
    await appendTrendEvidenceDecisionLog(
      mkRecord({ recordedAt: iso(0), lastRejectReasons: ["a", "c"], lastDecision: "WAIT_NEXT_BAR" }),
      { filePath: logPath },
    );
    const s = await readTrendEvidenceDecisionLogSummary({ filePath: logPath, now: NOW });
    assert.equal(s.available, true);
    assert.equal(s.totalRecords, 3);
    assert.equal(s.rejectReasonCounts.a, 3);
    assert.equal(s.rejectReasonCounts.b, 1);
    assert.equal(s.rejectReasonCounts.c, 1);
    assert.equal(s.topRejectReasons[0]!.reason, "a");
    assert.equal(s.decisionCounts.WAITING_SETUP, 2);
    assert.equal(s.decisionCounts.WAIT_NEXT_BAR, 1);
    assert.equal(s.gateStatusCounts.NOT_READY, 3);
    assert.equal(s.latestRecordedAt, iso(0));
    assert.deepEqual(s.lastRejectReasons, ["a", "c"]);
    assert.equal(s.sampleWarning, true); // 3 < 100
  });
});

test("malformed JSONL lines are skipped and counted, never thrown", async () => {
  await withTempLog(async (logPath) => {
    await appendTrendEvidenceDecisionLog(mkRecord({ recordedAt: iso(-5) }), { filePath: logPath });
    await fs.appendFile(logPath, "{not json}\n\n42\n", "utf8");
    await appendTrendEvidenceDecisionLog(mkRecord({ recordedAt: iso(0) }), { filePath: logPath, skipTrim: true });
    const s = await readTrendEvidenceDecisionLogSummary({ filePath: logPath, now: NOW });
    assert.equal(s.totalRecords, 2);
    assert.equal(s.malformedLines, 2);
  });
});

test("window filter excludes records older than windowHours", async () => {
  await withTempLog(async (logPath) => {
    await appendTrendEvidenceDecisionLog(mkRecord({ recordedAt: iso(-60 * 72) }), { filePath: logPath, skipTrim: true });
    await appendTrendEvidenceDecisionLog(mkRecord({ recordedAt: iso(-30) }), { filePath: logPath, skipTrim: true });
    const s = await readTrendEvidenceDecisionLogSummary({ filePath: logPath, now: NOW, windowHours: 48 });
    assert.equal(s.totalRecords, 1);
  });
});

test("trim enforces maxLines (keeps newest)", async () => {
  await withTempLog(async (logPath) => {
    for (let i = 0; i < 10; i++) {
      await appendTrendEvidenceDecisionLog(mkRecord({ recordedAt: iso(i) }), { filePath: logPath, skipTrim: true });
    }
    await trimTrendEvidenceDecisionLog({ filePath: logPath, now: NOW + 600_000, maxLines: 4 });
    const raw = await fs.readFile(logPath, "utf8");
    const times = raw.trim().split("\n").map((l) => JSON.parse(l).recordedAt);
    assert.deepEqual(times, [iso(6), iso(7), iso(8), iso(9)]);
  });
});

test("trim drops records older than maxAgeDays", async () => {
  await withTempLog(async (logPath) => {
    await appendTrendEvidenceDecisionLog(mkRecord({ recordedAt: iso(-60 * 24 * 20) }), { filePath: logPath, skipTrim: true });
    await appendTrendEvidenceDecisionLog(mkRecord({ recordedAt: iso(0) }), { filePath: logPath, skipTrim: true });
    await trimTrendEvidenceDecisionLog({ filePath: logPath, now: NOW, maxAgeDays: 14 });
    const raw = await fs.readFile(logPath, "utf8");
    const lines = raw.trim().split("\n");
    assert.equal(lines.length, 1);
    assert.equal(JSON.parse(lines[0]!).recordedAt, iso(0));
  });
});

test("path lock rejects any path not ending in /trend-paper/<file>", async () => {
  const res = await appendTrendEvidenceDecisionLog(mkRecord(), { filePath: "/tmp/evil/other.jsonl" });
  assert.equal(res.ok, false);
  await assert.rejects(() => trimTrendEvidenceDecisionLog({ filePath: "/tmp/evil/other.jsonl" }));
  const s = await readTrendEvidenceDecisionLogSummary({ filePath: "/tmp/evil/../traversal.jsonl" });
  assert.equal(s.available, false);
});

test("missing file returns empty summary (no throw)", async () => {
  await withTempLog(async (logPath) => {
    const s = await readTrendEvidenceDecisionLogSummary({ filePath: logPath, now: NOW });
    assert.deepEqual(s, emptyTrendEvidenceDecisionSummary());
  });
});

test("write failure surfaces as ok:false without throwing", async () => {
  // a directory at the file path makes appendFile fail
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "tedl-fail-"));
  const logPath = path.join(root, "trend-paper", TREND_EVIDENCE_DECISION_LOG_FILE_NAME);
  await fs.mkdir(logPath, { recursive: true });
  try {
    const res = await appendTrendEvidenceDecisionLog(mkRecord(), { filePath: logPath });
    assert.equal(res.ok, false);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("append refuses records violating safety invariants", async () => {
  await withTempLog(async (logPath) => {
    const bad = { ...mkRecord(), liveActivationAllowed: true } as unknown as TrendEvidenceDecisionRecord;
    const res = await appendTrendEvidenceDecisionLog(bad, { filePath: logPath });
    assert.equal(res.ok, false);
    if (!res.ok) assert.equal(res.error, "record_safety_invariants_violated");
  });
});

test("staleCycleEstimate detects missing cycles at 15m cadence", async () => {
  await withTempLog(async (logPath) => {
    // 0, 15, 60 → expected floor(60/15)+1 = 5, observed 3, missed 2
    for (const m of [-60, -45, 0]) {
      await appendTrendEvidenceDecisionLog(mkRecord({ recordedAt: iso(m) }), { filePath: logPath, skipTrim: true });
    }
    const s = await readTrendEvidenceDecisionLogSummary({ filePath: logPath, now: NOW });
    assert.ok(s.staleCycleEstimate);
    assert.equal(s.staleCycleEstimate!.expectedCycles, 5);
    assert.equal(s.staleCycleEstimate!.observedCycles, 3);
    assert.equal(s.staleCycleEstimate!.missedCycles, 2);
  });
});

test("decision-path isolation: runner module never imports the decision log", async () => {
  const runnerSrc = await fs.readFile(path.join(process.cwd(), "lib/trend/trendPaperEvidenceRunner.ts"), "utf8");
  assert.doesNotMatch(runnerSrc, /trendEvidenceDecisionLog/);
  const stateSrc = await fs.readFile(path.join(process.cwd(), "lib/trend/trendPaperEvidenceState.ts"), "utf8");
  assert.doesNotMatch(stateSrc, /trendEvidenceDecisionLog/);
});

test("constants match design doc retention", () => {
  assert.equal(DECISION_LOG_MAX_LINES, 2000);
});
