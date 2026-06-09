// dashboard/lib/trend/trendPaperExitLifecycleEvidence.test.ts
// Phase T-3H-2 — end-to-end synthetic proof that the paper exit lifecycle produces auditable closed trades.
// Run: node --experimental-strip-types --test dashboard/lib/trend/trendPaperExitLifecycleEvidence.test.ts
// NO production calls. NO exchange. NO live. Pure synthetic candles + journal snapshot.
import test from "node:test";
import assert from "node:assert/strict";
import * as os from "os";
import * as path from "path";
import * as fs from "fs/promises";
import { evaluateTrendPaperExecutionEngine, type TrendPaperPosition } from "./trendPaperExecutionEngine.ts";
import { validateTrendPaperJournalEvent } from "./trendPaperJournalSchema.ts";
import { readTrendPaperJournalSnapshot } from "./trendPaperJournalWriter.ts";
import { buildTrendEvidenceMetrics, classifyTrendEvidenceSample } from "./trendEvidenceMetrics.ts";

const CONFIG = {
  enabled: true, mode: "PAPER_SIMULATION_ONLY", maxConcurrentTrendPositions: 1,
  riskPerTradePct: 1, minRewardRisk: 1.2, feePct: 0.05, slippagePct: 0.02, allowShort: true, allowLong: true,
};

// open SHORT position: entry 63300, stop 64552 (above), tp1 61825 (below)
function openPosition(over: Partial<TrendPaperPosition> = {}): TrendPaperPosition {
  return {
    positionId: "pos-1", setupId: "setup-1", epochId: "epoch-1", symbol: "BTC-USDT", direction: "SHORT",
    entryPrice: 63300, stopLoss: 64552, takeProfit1: 61825, takeProfit2: null,
    quantityPaper: 0.01, remainingQuantityPaper: 0.01, riskAmountPaper: 12.5,
    entryFeeEstimate: 0.3, entrySlippageEstimate: 0.1,
    openedAt: "2026-06-08T00:00:00.000Z", status: "OPEN", ...over,
  };
}

function run(position: TrendPaperPosition, lastCandle: { high: number; low: number }, nowIso: string) {
  return evaluateTrendPaperExecutionEngine({
    trendStrategy: null, trendManualPaperArmGate: null, trendPaperArmSession: null,
    trendPaperExecutionPreflight: null, trendZoneCandidate: null,
    // SHORT position needs a matching DOWNTREND/BEARISH regime, else the exit lifecycle correctly
    // treats the mismatch as an invalidation exit (regime-flip protection) instead of an SL/TP exit.
    canonicalMarketRegime: { regime: "DOWNTREND", direction: "BEARISH" } as never,
    multiTimeframeIndicatorEvidence: {}, currentPrice: (lastCandle.high + lastCandle.low) / 2,
    latest5mCandles: [
      { t: 1, open: 63300, high: 63310, low: 63290, close: 63300 },
      { t: 2, open: 63300, high: lastCandle.high, low: lastCandle.low, close: (lastCandle.high + lastCandle.low) / 2 },
    ],
    openTrendPaperPosition: position, config: CONFIG, now: nowIso, symbol: "BTC-USDT",
  } as never);
}

test("1+2: open SHORT + price hits STOP → closed (INVALIDATED) trade with realizedR < 0", () => {
  const r = run(openPosition(), { high: 64600, low: 63200 }, "2026-06-08T00:30:00.000Z"); // high >= stopLoss
  assert.equal(r.action, "CREATE_PAPER_EXIT");
  const e = r.journalEventDraft!;
  assert.equal(e.eventType, "TREND_PAPER_INVALIDATED");
  assert.equal(validateTrendPaperJournalEvent(e).valid, true);
  assert.ok((e.realizedR ?? e.rMultiple)! < 0, "stop loss → realizedR negative");
  assert.equal(e.countTowardTrendEvidence, true);
});

test("3: open SHORT + price hits TP1 (tp2=null) → closed (EXIT) trade with realizedR > 0", () => {
  const r = run(openPosition({ takeProfit2: null }), { high: 63350, low: 61700 }, "2026-06-08T01:00:00.000Z"); // low <= tp1
  assert.equal(r.action, "CREATE_PAPER_EXIT");
  const e = r.journalEventDraft!;
  assert.equal(e.eventType, "TREND_PAPER_EXIT");
  assert.ok((e.realizedR ?? e.rMultiple)! > 0, "take profit → realizedR positive");
});

test("6: realizedR computed correctly (netPnl / risk)", () => {
  const r = run(openPosition(), { high: 64600, low: 63200 }, "2026-06-08T00:30:00.000Z");
  const e = r.journalEventDraft!;
  const expected = e.netPnlPaper! / 12.5;
  assert.ok(Math.abs((e.realizedR ?? e.rMultiple)! - expected) < 1e-9);
});

test("7: holdTimeMs / holdTimeMinutes computed from openedAt→closedAt", () => {
  const r = run(openPosition(), { high: 64600, low: 63200 }, "2026-06-08T00:30:00.000Z"); // 30 min
  const e = r.journalEventDraft!;
  assert.equal(e.holdTimeMinutes, 30);
  assert.equal(e.holdTimeMs, 30 * 60_000);
  assert.equal(e.openedAt, "2026-06-08T00:00:00.000Z");
  assert.equal(e.closedAt, "2026-06-08T00:30:00.000Z");
});

test("8-11: safety invariants on closed events", () => {
  for (const candle of [{ high: 64600, low: 63200 }, { high: 63350, low: 61700 }]) {
    const e = run(openPosition(), candle, "2026-06-08T00:30:00.000Z").journalEventDraft!;
    assert.equal(e.liveActivationAllowed, false);
    assert.equal((e as { exchangeOrderAllowed?: unknown }).exchangeOrderAllowed, false);
    assert.equal(e.oldExposurePolicy, "QUARANTINE_OLD_GRID_EXPOSURE");
    assert.equal(e.countTowardGridClosedCycles, false);
    assert.equal((e as { paperOnly?: unknown }).paperOnly, true);
    assert.equal((e as { maeR?: unknown }).maeR, null); // gap field present + null (not faked)
    assert.equal((e as { mfeR?: unknown }).mfeR, null);
  }
});

test("4+5: closed trades increment trendClosedTrades via journal snapshot; grid closedCycles untouched (structural)", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "t3h2-"));
  const file = path.join(dir, "trend-paper", "trend_paper_journal.jsonl");
  await fs.mkdir(path.dirname(file), { recursive: true });
  const loss = run(openPosition(), { high: 64600, low: 63200 }, "2026-06-08T00:30:00.000Z").journalEventDraft!;
  const win = run(openPosition({ positionId: "pos-2", openedAt: "2026-06-08T02:00:00.000Z" }), { high: 63350, low: 61700 }, "2026-06-08T02:45:00.000Z").journalEventDraft!;
  await fs.writeFile(file, `${JSON.stringify(loss)}\n${JSON.stringify(win)}\n`, "utf8");

  const snap = await readTrendPaperJournalSnapshot({ filePath: file });
  assert.equal(snap.closedTrades.length, 2, "trendClosedTrades = 2");
  // every event structurally cannot count toward grid cycles
  for (const ev of snap.events) assert.equal(ev.countTowardGridClosedCycles, false);

  const m = buildTrendEvidenceMetrics(snap.closedTrades);
  assert.equal(m.trendClosedTrades, 2);
  assert.equal(m.wins, 1);
  assert.equal(m.losses, 1);
  assert.equal(m.winRate, 0.5);
  assert.equal(m.paperOnly, true);
  assert.equal(m.liveActivationAllowed, false);
  assert.equal(m.exchangeOrderAllowed, false);
  assert.ok(m.averageHoldTimeMinutes != null && m.averageHoldTimeMinutes > 0, "hold time aggregated");
  assert.equal(m.sampleStatus, "INSUFFICIENT_SAMPLE_BOOTSTRAP");
});

test("sample-status tiers", () => {
  assert.equal(classifyTrendEvidenceSample(0), "INSUFFICIENT_SAMPLE_BOOTSTRAP");
  assert.equal(classifyTrendEvidenceSample(4), "INSUFFICIENT_SAMPLE_BOOTSTRAP");
  assert.equal(classifyTrendEvidenceSample(5), "BEHAVIOR_CHECK_ONLY");
  assert.equal(classifyTrendEvidenceSample(10), "EARLY_SIGNAL_ONLY");
  assert.equal(classifyTrendEvidenceSample(30), "FIRST_STATISTICAL_READ");
  assert.equal(classifyTrendEvidenceSample(100), "USABLE_EVIDENCE");
});

test("expectancyR formula on a 60/40 fixture", () => {
  const trades = Array.from({ length: 10 }, (_, i) => (i < 6 ? { rMultiple: 2, netRMultiple: 2 } : { rMultiple: -1, netRMultiple: -1 }));
  const m = buildTrendEvidenceMetrics(trades);
  // expectancy = 0.6*2 - 0.4*1 = 0.8
  assert.ok(Math.abs((m.expectancyR ?? 0) - 0.8) < 1e-9);
  assert.equal(m.maxConsecutiveLosses, 4);
});
