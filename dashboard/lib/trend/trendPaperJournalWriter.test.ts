import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";

import {
  appendTrendPaperJournalEvent,
  readTrendPaperJournalSnapshot,
  resolveTrendPaperJournalPath,
} from "./trendPaperJournalWriter.ts";
import {
  TREND_PAPER_JOURNAL_SCHEMA_VERSION,
  type TrendPaperJournalEvent,
} from "./trendPaperJournalSchema.ts";

function entry(overrides: Record<string, unknown> = {}): TrendPaperJournalEvent {
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
  } as TrendPaperJournalEvent;
}

function exit(overrides: Record<string, unknown> = {}): TrendPaperJournalEvent {
  return {
    ...entry(),
    ts: "2026-06-08T00:10:00.000Z",
    eventType: "TREND_PAPER_EXIT",
    fillPricePaper: 61825,
    grossPnlPaper: 14.55,
    feeEstimate: 0.8,
    slippageEstimate: 0.4,
    netPnlPaper: 13.35,
    rMultiple: 1.068,
    exitReason: "take_profit_1_hit",
    countTowardTrendEvidence: true,
    statusAfter: "CLOSED",
    ...overrides,
  } as TrendPaperJournalEvent;
}

async function withTempFile(fn: (filePath: string) => Promise<void>) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "trend-paper-journal-"));
  const filePath = resolveTrendPaperJournalPath(dir);
  try {
    await fn(filePath);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

test("invalid event rejected by writer", async () => {
  await withTempFile(async (filePath) => {
    await assert.rejects(
      appendTrendPaperJournalEvent(entry({ liveActivationAllowed: true }), { filePath }),
      /trend_paper_journal_validation_failed/,
    );
  });
});

test("entry event appends and snapshot shows open position", async () => {
  await withTempFile(async (filePath) => {
    await appendTrendPaperJournalEvent(entry(), { filePath });
    const snapshot = await readTrendPaperJournalSnapshot({ filePath });
    assert.equal(snapshot.exists, true);
    assert.equal(snapshot.events.length, 1);
    assert.equal(snapshot.openPosition?.status, "OPEN");
    assert.equal(snapshot.lastEntryAt, "2026-06-08T00:05:00.000Z");
    assert.equal(snapshot.lastExitAt, null);
  });
});

test("closing event produces closed trade and clears open position", async () => {
  await withTempFile(async (filePath) => {
    await appendTrendPaperJournalEvent(entry(), { filePath });
    await appendTrendPaperJournalEvent(exit(), { filePath });
    const snapshot = await readTrendPaperJournalSnapshot({ filePath });
    assert.equal(snapshot.openPosition, null);
    assert.equal(snapshot.closedTrades.length, 1);
    assert.equal(snapshot.lastExitAt, "2026-06-08T00:10:00.000Z");
  });
});

test("legacy closing event with missing stop loss is excluded from closed-trade evidence", async () => {
  await withTempFile(async (filePath) => {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, `${JSON.stringify(exit({ stopLoss: null }))}\n`, "utf8");
    const snapshot = await readTrendPaperJournalSnapshot({ filePath });
    assert.equal(snapshot.closedTrades.length, 0);
    assert.equal(snapshot.invalidMissingStopLossCount, 1);
    assert.equal(snapshot.invalidRiskModelCount, 1);
  });
});

test("legacy closing event with finite stop loss remains valid evidence", async () => {
  await withTempFile(async (filePath) => {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, `${JSON.stringify(exit({ stopLoss: 64552 }))}\n`, "utf8");
    const snapshot = await readTrendPaperJournalSnapshot({ filePath });
    assert.equal(snapshot.closedTrades.length, 1);
    assert.equal(snapshot.closedTrades[0].stopLoss, 64552);
    assert.equal(snapshot.invalidMissingStopLossCount, 0);
  });
});

test("trend closed trades remain separate from grid closed cycles", async () => {
  await withTempFile(async (filePath) => {
    await appendTrendPaperJournalEvent(entry(), { filePath });
    await appendTrendPaperJournalEvent(exit({ countTowardGridClosedCycles: false }), { filePath });
    const snapshot = await readTrendPaperJournalSnapshot({ filePath });
    assert.equal(snapshot.events[1].countTowardGridClosedCycles, false);
    assert.equal(snapshot.closedTrades.length, 1);
  });
});
