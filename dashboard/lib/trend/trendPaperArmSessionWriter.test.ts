import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";

import type { TrendPaperArmSession } from "./trendPaperArmSession.ts";
import type { TrendPaperJournalEvent, ValidationResult } from "./trendPaperJournalSchema.ts";
import {
  appendTrendPaperEntryAndConsumeSession,
  consumeTrendPaperArmSessionEntryPersisted,
  writeTrendPaperArmSession,
} from "./trendPaperArmSessionWriter.ts";
import { TREND_PAPER_JOURNAL_SCHEMA_VERSION } from "./trendPaperJournalSchema.ts";

function session(overrides: Partial<TrendPaperArmSession> = {}): TrendPaperArmSession {
  return {
    schemaVersion: "trend-paper-arm-session/1",
    sessionId: "sess-1",
    status: "ACTIVE",
    symbol: "BTC-USDT",
    direction: "SHORT",
    startedAt: "2026-06-08T00:00:00.000Z",
    expiresAt: "2026-06-08T01:00:00.000Z",
    maxEntries: 3,
    usedEntries: 0,
    maxRiskPerTradePct: 1,
    maxSessionRiskPct: 3,
    approvedBy: "OPERATOR",
    paperArmIntentRequested: true,
    paperOnly: true,
    liveActivationAllowed: false,
    exchangeOrderAllowed: false,
    oldExposurePolicy: "QUARANTINE_OLD_GRID_EXPOSURE",
    notes: [],
    ...overrides,
  };
}

function entryEvent(overrides: Partial<TrendPaperJournalEvent> = {}): TrendPaperJournalEvent {
  return {
    schemaVersion: TREND_PAPER_JOURNAL_SCHEMA_VERSION,
    ts: "2026-06-08T00:05:00.000Z",
    eventType: "TREND_PAPER_ENTRY",
    epochId: "epoch-1",
    setupId: "setup-1",
    symbol: "BTC-USDT",
    direction: "SHORT",
    entry: 63297.5,
    stopLoss: 64552,
    takeProfit1: 61825,
    takeProfit2: 61050,
    fillPricePaper: 63280,
    quantityPaper: 0.01,
    riskAmountPaper: 12.5,
    rMultiple: 0,
    grossPnlPaper: 0,
    feeEstimate: 0.4,
    slippageEstimate: 0.2,
    netPnlPaper: -0.6,
    exitReason: null,
    oldExposurePolicy: "QUARANTINE_OLD_GRID_EXPOSURE",
    countTowardGridClosedCycles: false,
    countTowardTrendEvidence: false,
    liveActivationAllowed: false,
    positionId: "pos-1",
    statusAfter: "OPEN",
    ...overrides,
  } as unknown as TrendPaperJournalEvent;
}

function validation(valid = true): ValidationResult {
  return { valid, errors: valid ? [] : ["bad"], warnings: [] };
}

async function withTempDir(fn: (ctx: { root: string; sessionPath: string; journalPath: string }) => Promise<void>) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "trend-paper-session-"));
  const sessionPath = path.join(root, "trend-paper", "trend_paper_arm_session.json");
  const journalPath = path.join(root, "trend-paper", "trend_paper_journal.jsonl");
  try {
    await fn({ root, sessionPath, journalPath });
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}

test("valid ACTIVE session consumes usedEntries 0->1", async () => {
  await withTempDir(async ({ sessionPath }) => {
    await writeTrendPaperArmSession(session(), { sessionPath });
    const result = await consumeTrendPaperArmSessionEntryPersisted(session(), {
      sessionPath,
      expectedSessionId: "sess-1",
      now: Date.parse("2026-06-08T00:05:00.000Z"),
    });
    assert.equal(result.ok, true);
    assert.equal(result.consumed, true);
    assert.equal(result.reason, "CONSUMED");
    assert.equal(result.before?.usedEntries, 0);
    assert.equal(result.after?.usedEntries, 1);
    assert.equal(result.after?.status, "ACTIVE");
  });
});

test("maxEntries=1 becomes LIMIT_REACHED after consume", async () => {
  await withTempDir(async ({ sessionPath }) => {
    const s = session({ maxEntries: 1, usedEntries: 0 });
    await writeTrendPaperArmSession(s, { sessionPath });
    const result = await consumeTrendPaperArmSessionEntryPersisted(s, { sessionPath, now: Date.parse("2026-06-08T00:05:00.000Z") });
    assert.equal(result.after?.usedEntries, 1);
    assert.equal(result.after?.status, "LIMIT_REACHED");
  });
});

test("maxEntries=3 usedEntries 1->2 remains ACTIVE", async () => {
  await withTempDir(async ({ sessionPath }) => {
    const s = session({ maxEntries: 3, usedEntries: 1 });
    await writeTrendPaperArmSession(s, { sessionPath });
    const result = await consumeTrendPaperArmSessionEntryPersisted(s, { sessionPath, now: Date.parse("2026-06-08T00:05:00.000Z") });
    assert.equal(result.after?.usedEntries, 2);
    assert.equal(result.after?.status, "ACTIVE");
  });
});

test("expired session rejected", async () => {
  await withTempDir(async ({ sessionPath }) => {
    const s = session({ startedAt: "2026-06-07T22:00:00.000Z", expiresAt: "2026-06-07T23:00:00.000Z" });
    await writeTrendPaperArmSession(s, { sessionPath });
    const result = await consumeTrendPaperArmSessionEntryPersisted(s, { sessionPath, now: Date.parse("2026-06-08T00:05:00.000Z") });
    assert.equal(result.reason, "SESSION_EXPIRED");
    assert.equal(result.consumed, false);
  });
});

test("INACTIVE session rejected", async () => {
  await withTempDir(async ({ sessionPath }) => {
    const s = session({ status: "INACTIVE" });
    await writeTrendPaperArmSession(s, { sessionPath });
    const result = await consumeTrendPaperArmSessionEntryPersisted(s, { sessionPath, now: Date.parse("2026-06-08T00:05:00.000Z") });
    assert.equal(result.reason, "SESSION_NOT_ACTIVE");
  });
});

test("REVOKED session rejected", async () => {
  await withTempDir(async ({ sessionPath }) => {
    const s = session({ status: "REVOKED" });
    await writeTrendPaperArmSession(s, { sessionPath });
    const result = await consumeTrendPaperArmSessionEntryPersisted(s, { sessionPath, now: Date.parse("2026-06-08T00:05:00.000Z") });
    assert.equal(result.reason, "SESSION_NOT_ACTIVE");
  });
});

test("usedEntries >= maxEntries rejected", async () => {
  await withTempDir(async ({ sessionPath }) => {
    const s = session({ maxEntries: 2, usedEntries: 2, status: "LIMIT_REACHED" });
    await writeTrendPaperArmSession(s, { sessionPath });
    const result = await consumeTrendPaperArmSessionEntryPersisted(s, { sessionPath, now: Date.parse("2026-06-08T00:05:00.000Z") });
    assert.equal(result.reason, "SESSION_LIMIT_REACHED");
  });
});

test("expectedSessionId mismatch rejected", async () => {
  await withTempDir(async ({ sessionPath }) => {
    const s = session();
    await writeTrendPaperArmSession(s, { sessionPath });
    const result = await consumeTrendPaperArmSessionEntryPersisted(s, { sessionPath, expectedSessionId: "other", now: Date.parse("2026-06-08T00:05:00.000Z") });
    assert.equal(result.reason, "SESSION_ID_MISMATCH");
  });
});

test("invalid path rejected", async () => {
  const invalidPath = path.join(os.tmpdir(), "trend_paper_arm_session.json");
  await assert.rejects(writeTrendPaperArmSession(session(), { sessionPath: invalidPath }), /trend_paper_arm_session_path_not_allowed/);
});

test("liveActivationAllowed=true rejected", async () => {
  await withTempDir(async ({ sessionPath }) => {
    await assert.rejects(
      writeTrendPaperArmSession(session({ liveActivationAllowed: true as unknown as false }), { sessionPath }),
      /trend_paper_arm_session_validation_failed/
    );
  });
});

test("exchangeOrderAllowed=true rejected", async () => {
  await withTempDir(async ({ sessionPath }) => {
    await assert.rejects(
      writeTrendPaperArmSession(session({ exchangeOrderAllowed: true as unknown as false }), { sessionPath }),
      /trend_paper_arm_session_validation_failed/
    );
  });
});

test("paperOnly=false rejected", async () => {
  await withTempDir(async ({ sessionPath }) => {
    await assert.rejects(
      writeTrendPaperArmSession(session({ paperOnly: false as unknown as true }), { sessionPath }),
      /trend_paper_arm_session_validation_failed/
    );
  });
});

test("oldExposurePolicy not quarantine rejected", async () => {
  await withTempDir(async ({ sessionPath }) => {
    await assert.rejects(
      writeTrendPaperArmSession(session({ oldExposurePolicy: "USE_OLD_GRID" as unknown as "QUARANTINE_OLD_GRID_EXPOSURE" }), { sessionPath }),
      /trend_paper_arm_session_validation_failed/
    );
  });
});

test("writer never writes journal path", async () => {
  await withTempDir(async ({ journalPath }) => {
    await assert.rejects(writeTrendPaperArmSession(session(), { sessionPath: journalPath }), /trend_paper_arm_session_path_not_allowed/);
  });
});

test("writer never writes grid/execution-runner path", async () => {
  const badGridPath = path.join(os.tmpdir(), "grid", "paper", "trend_paper_arm_session.json");
  const badExecPath = path.join(os.tmpdir(), "execution-runner", "trend_paper_arm_session.json");
  await assert.rejects(writeTrendPaperArmSession(session(), { sessionPath: badGridPath }), /trend_paper_arm_session_path_not_allowed/);
  await assert.rejects(writeTrendPaperArmSession(session(), { sessionPath: badExecPath }), /trend_paper_arm_session_path_not_allowed/);
});

test("route logic: consumes only after journal append success", async () => {
  const calls: string[] = [];
  const result = await appendTrendPaperEntryAndConsumeSession({
    action: "CREATE_PAPER_ENTRY",
    journalEventDraft: entryEvent(),
    validation: validation(true),
    trendPaperArmSession: session(),
    appendJournalEvent: async () => {
      calls.push("append");
      return { ok: true, path: "/tmp/trend-paper/trend_paper_journal.jsonl", validation: validation(true) };
    },
    consumeSession: async () => {
      calls.push("consume");
      return {
        ok: true, consumed: true, reason: "CONSUMED",
        before: session(), after: session({ usedEntries: 1 }), path: "/tmp/trend-paper/trend_paper_arm_session.json",
        liveActivationAllowed: false, exchangeOrderAllowed: false,
      };
    },
  });
  assert.deepEqual(calls, ["append", "consume"]);
  assert.equal(result.journalAppended, true);
  assert.equal(result.sessionConsumed, true);
});

test("route logic: does not consume when action=NO_ACTION", async () => {
  let consumed = false;
  const result = await appendTrendPaperEntryAndConsumeSession({
    action: "NO_ACTION",
    journalEventDraft: null,
    validation: null,
    trendPaperArmSession: session(),
    consumeSession: async () => {
      consumed = true;
      throw new Error("should not run");
    },
  });
  assert.equal(result.journalAppended, false);
  assert.equal(result.sessionConsumed, false);
  assert.equal(consumed, false);
});

test("route logic: does not consume when journal append fails", async () => {
  let consumed = false;
  const result = await appendTrendPaperEntryAndConsumeSession({
    action: "CREATE_PAPER_ENTRY",
    journalEventDraft: entryEvent(),
    validation: validation(true),
    trendPaperArmSession: session(),
    appendJournalEvent: async () => {
      throw new Error("append failed");
    },
    consumeSession: async () => {
      consumed = true;
      throw new Error("should not run");
    },
  });
  assert.equal(result.journalAppended, false);
  assert.equal(result.sessionConsumed, false);
  assert.equal(consumed, false);
});

test("route logic: does not consume when journal validation fails", async () => {
  let consumed = false;
  const result = await appendTrendPaperEntryAndConsumeSession({
    action: "CREATE_PAPER_ENTRY",
    journalEventDraft: entryEvent(),
    validation: validation(false),
    trendPaperArmSession: session(),
    consumeSession: async () => {
      consumed = true;
      throw new Error("should not run");
    },
  });
  assert.equal(result.journalAppended, false);
  assert.equal(result.sessionConsumed, false);
  assert.equal(consumed, false);
});

test("route logic: returns warning if consume fails after append", async () => {
  const result = await appendTrendPaperEntryAndConsumeSession({
    action: "CREATE_PAPER_ENTRY",
    journalEventDraft: entryEvent(),
    validation: validation(true),
    trendPaperArmSession: session(),
    appendJournalEvent: async () => ({ ok: true, path: "/tmp/trend-paper/trend_paper_journal.jsonl", validation: validation(true) }),
    consumeSession: async () => ({
      ok: false, consumed: false, reason: "WRITE_FAILED",
      before: session(), after: null, path: "/tmp/trend-paper/trend_paper_arm_session.json",
      liveActivationAllowed: false, exchangeOrderAllowed: false,
    }),
  });
  assert.equal(result.journalAppended, true);
  assert.equal(result.sessionConsumed, false);
  assert.equal(result.sessionConsumeReason, "WRITE_FAILED");
  assert.equal(result.operatorAction, "inspect session manually");
});

// ---- T-3H-2 consume-rule: session consumed ONLY on entry; exit/invalidation append but never consume ----
test("T-3H-2: EXIT event appends journal but does NOT consume session (no false warning)", async () => {
  let consumeCalled = false;
  const result = await appendTrendPaperEntryAndConsumeSession({
    action: "CREATE_PAPER_EXIT",
    journalEventDraft: entryEvent({ eventType: "TREND_PAPER_EXIT" }),
    validation: validation(true),
    trendPaperArmSession: session({ usedEntries: 1, status: "LIMIT_REACHED" }),
    appendJournalEvent: async () => ({ ok: true, path: "/tmp/trend-paper/trend_paper_journal.jsonl", validation: validation(true) }),
    consumeSession: async () => { consumeCalled = true; throw new Error("consume must not run on exit"); },
  });
  assert.equal(result.journalAppended, true);
  assert.equal(consumeCalled, false, "consume must NOT be attempted on exit");
  assert.equal(result.sessionConsumed, false);
  assert.equal(result.sessionConsumeReason, "NOT_AN_ENTRY_EVENT");
  assert.equal(result.operatorAction, null, "no false inspect-session warning on normal exit");
});

test("T-3H-2: INVALIDATION event appends journal but does NOT consume session", async () => {
  let consumeCalled = false;
  const result = await appendTrendPaperEntryAndConsumeSession({
    action: "CREATE_PAPER_EXIT",
    journalEventDraft: entryEvent({ eventType: "TREND_PAPER_INVALIDATED" }),
    validation: validation(true),
    trendPaperArmSession: session({ usedEntries: 1, status: "LIMIT_REACHED" }),
    appendJournalEvent: async () => ({ ok: true, path: "/tmp/trend-paper/trend_paper_journal.jsonl", validation: validation(true) }),
    consumeSession: async () => { consumeCalled = true; throw new Error("consume must not run on invalidation"); },
  });
  assert.equal(result.journalAppended, true);
  assert.equal(consumeCalled, false);
  assert.equal(result.sessionConsumed, false);
  assert.equal(result.sessionConsumeReason, "NOT_AN_ENTRY_EVENT");
  assert.equal(result.operatorAction, null);
});

test("T-3H-2: ENTRY event still appends then consumes (append-first-consume-after intact)", async () => {
  const order: string[] = [];
  const result = await appendTrendPaperEntryAndConsumeSession({
    action: "CREATE_PAPER_ENTRY",
    journalEventDraft: entryEvent({ eventType: "TREND_PAPER_ENTRY" }),
    validation: validation(true),
    trendPaperArmSession: session(),
    appendJournalEvent: async () => { order.push("append"); return { ok: true, path: "/tmp/trend-paper/trend_paper_journal.jsonl", validation: validation(true) }; },
    consumeSession: async () => { order.push("consume"); return { ok: true, consumed: true, reason: "CONSUMED", before: session(), after: session({ usedEntries: 1, status: "LIMIT_REACHED" }), path: "/tmp/trend-paper/trend_paper_arm_session.json", liveActivationAllowed: false, exchangeOrderAllowed: false }; },
  });
  assert.deepEqual(order, ["append", "consume"]);
  assert.equal(result.sessionConsumed, true);
  assert.equal(result.sessionConsumeReason, "CONSUMED");
});
