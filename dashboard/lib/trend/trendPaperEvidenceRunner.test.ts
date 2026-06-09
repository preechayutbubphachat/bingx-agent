// dashboard/lib/trend/trendPaperEvidenceRunner.test.ts
// Run: node --experimental-strip-types --test dashboard/lib/trend/trendPaperEvidenceRunner.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { runTrendPaperEvidenceCycle, type EvidenceRunnerInput } from "./trendPaperEvidenceRunner.ts";
import { defaultTrendPaperEvidenceState } from "./trendPaperEvidenceState.ts";
import { buildTrendEvidenceMetrics } from "./trendEvidenceMetrics.ts";

const NOW = "2026-06-08T12:00:00.000Z";

function metrics(closed = 0, over: { maxConsecutiveLosses?: number } = {}) {
  const trades = Array.from({ length: closed }, (_, i) => ({ rMultiple: i % 2 ? -1 : 2, netRMultiple: i % 2 ? -1 : 2 }));
  const m = buildTrendEvidenceMetrics(trades);
  if (over.maxConsecutiveLosses != null) (m as { maxConsecutiveLosses: number }).maxConsecutiveLosses = over.maxConsecutiveLosses;
  return m;
}

function baseConfig(over: Partial<EvidenceRunnerInput["config"]> = {}): EvidenceRunnerInput["config"] {
  return {
    simulationEnabled: true, runnerEnabled: true, allowedSymbol: "BTC-USDT",
    maxOpenPositions: 1, maxEntriesPerDay: 3, dailyLossCapR: 3, maxConsecutiveLosses: 3,
    cooldownMinutes: 60, targetClosedTrades: 30,
    globalSafety: { liveTradingEnabled: false, orderPlacementEnabled: false, productionTradingReady: false, exchangeApproved: false },
    ...over,
  };
}

const calls = { createSession: 0, runOneShot: 0, cleanupSession: 0, driveExit: 0 };
function resetCalls() { calls.createSession = 0; calls.runOneShot = 0; calls.cleanupSession = 0; calls.driveExit = 0; }

function input(over: Partial<EvidenceRunnerInput> = {}): EvidenceRunnerInput {
  resetCalls();
  return {
    now: NOW, symbol: "BTC-USDT", currentBarId: "bar-2026-06-08T12",
    config: baseConfig(), state: { ...defaultTrendPaperEvidenceState(), dailyDate: "2026-06-08" },
    gate: { rawStatus: "READY_FOR_OPERATOR_REVIEW", effectiveStatus: "READY_FOR_OPERATOR_REVIEW", armable: true, direction: "SHORT", failedConditions: [] },
    metrics: metrics(0), openTrendPosition: null,
    createSession: async () => { calls.createSession++; return { ok: true }; },
    runOneShot: async () => { calls.runOneShot++; return { action: "CREATE_PAPER_ENTRY", reason: "ENTRY_CONDITIONS_MET", journalAppended: true, sessionConsumed: true }; },
    cleanupSession: async () => { calls.cleanupSession++; return { ok: true }; },
    driveExitLifecycle: async () => { calls.driveExit++; return { closed: true, reason: "take_profit_1_hit" }; },
    ...over,
  };
}

test("1: disabled env blocks (no session, no entry)", async () => {
  const r = await runTrendPaperEvidenceCycle(input({ config: baseConfig({ runnerEnabled: false }) }));
  assert.equal(r.decision, "DISABLED");
  assert.equal(r.blocked, true);
  assert.equal(calls.createSession, 0);
  assert.equal(calls.runOneShot, 0);
});

test("2: live/order flag blocks → SAFETY_BLOCKED + stopReason", async () => {
  const r = await runTrendPaperEvidenceCycle(input({ config: baseConfig({ globalSafety: { liveTradingEnabled: true, orderPlacementEnabled: false, productionTradingReady: false, exchangeApproved: false } }) }));
  assert.equal(r.decision, "SAFETY_BLOCKED");
  assert.equal(r.nextState.stopReason, "LIVE_TRADING_ENABLED_true");
  assert.equal(calls.createSession, 0);
});

test("symbol != BTC-USDT blocks", async () => {
  const r = await runTrendPaperEvidenceCycle(input({ symbol: "ETH-USDT" }));
  assert.equal(r.decision, "SAFETY_BLOCKED");
  assert.ok(r.reasons.some((x) => x.startsWith("symbol_not_allowed")));
});

test("3: open position drives exit and does NOT arm session", async () => {
  const r = await runTrendPaperEvidenceCycle(input({ openTrendPosition: { positionId: "p1", direction: "SHORT", entryPrice: 63000, openedAt: NOW } }));
  assert.equal(r.decision, "EXIT_DRIVE");
  assert.equal(calls.driveExit, 1);
  assert.equal(calls.createSession, 0);
  assert.equal(calls.runOneShot, 0);
});

test("4: target closed trades reached → REVIEW_READY + readyForNextPhase", async () => {
  const r = await runTrendPaperEvidenceCycle(input({ metrics: metrics(30) }));
  assert.equal(r.decision, "REVIEW_READY");
  assert.equal(r.evidencePhase, "REVIEW_READY");
  assert.equal(r.nextState.readyForNextPhase, true);
  assert.equal(calls.createSession, 0);
});

test("5: daily entry cap blocks", async () => {
  const r = await runTrendPaperEvidenceCycle(input({ state: { ...defaultTrendPaperEvidenceState(), dailyDate: "2026-06-08", dailyEntryCount: 3 } }));
  assert.equal(r.decision, "BUDGET_BLOCKED");
  assert.ok(r.reasons.includes("daily_entry_cap_reached"));
  assert.equal(calls.createSession, 0);
});

test("6: daily loss cap blocks", async () => {
  const r = await runTrendPaperEvidenceCycle(input({ state: { ...defaultTrendPaperEvidenceState(), dailyDate: "2026-06-08", dailyLossR: -3 } }));
  assert.equal(r.decision, "BUDGET_BLOCKED");
  assert.ok(r.reasons.includes("daily_loss_cap_reached"));
});

test("7: consecutive loss cap blocks", async () => {
  const r = await runTrendPaperEvidenceCycle(input({ metrics: metrics(10, { maxConsecutiveLosses: 3 }) }));
  assert.equal(r.decision, "BUDGET_BLOCKED");
  assert.ok(r.reasons.includes("max_consecutive_losses_reached"));
});

test("8: cooldown blocks", async () => {
  const r = await runTrendPaperEvidenceCycle(input({ state: { ...defaultTrendPaperEvidenceState(), dailyDate: "2026-06-08", cooldownUntil: "2026-06-08T12:30:00.000Z" } }));
  assert.equal(r.decision, "BUDGET_BLOCKED");
  assert.ok(r.reasons.includes("cooldown_active"));
});

test("9: same 1H bar blocks duplicate entry", async () => {
  const r = await runTrendPaperEvidenceCycle(input({ state: { ...defaultTrendPaperEvidenceState(), dailyDate: "2026-06-08", lastCheckedBar: "bar-2026-06-08T12" } }));
  assert.equal(r.decision, "WAIT_NEXT_BAR");
  assert.equal(calls.createSession, 0);
});

test("10: NOT_READY gate records rejection only (no session)", async () => {
  const r = await runTrendPaperEvidenceCycle(input({ gate: { rawStatus: "NOT_READY", effectiveStatus: "NOT_READY", armable: false, direction: null, failedConditions: ["risk_status_pass"] } }));
  assert.equal(r.decision, "WAITING_SETUP");
  assert.deepEqual(r.reasons, ["risk_status_pass"]);
  assert.equal(calls.createSession, 0);
  assert.equal(calls.runOneShot, 0);
});

test("11+13+14: READY gate arms one-entry session, ONE_SHOT entry increments dailyEntryCount + cooldown", async () => {
  const r = await runTrendPaperEvidenceCycle(input());
  assert.equal(r.decision, "PAPER_ENTRY_CREATED");
  assert.equal(calls.createSession, 1);
  assert.equal(calls.runOneShot, 1);
  assert.equal(r.nextState.dailyEntryCount, 1);
  assert.ok(r.nextState.cooldownUntil != null);
  assert.equal(r.nextState.lastCheckedBar, "bar-2026-06-08T12");
});

test("12: NO_ACTION after arm revokes session", async () => {
  const r = await runTrendPaperEvidenceCycle(input({ runOneShot: async () => { calls.runOneShot++; return { action: "NO_ACTION", reason: "PRICE_NOT_IN_ENTRY_ZONE_OR_EDGE", journalAppended: false, sessionConsumed: false }; } }));
  assert.equal(r.decision, "NO_ACTION_AFTER_ARM");
  assert.equal(calls.createSession, 1);
  assert.equal(calls.cleanupSession, 1);
  assert.equal(r.nextState.dailyEntryCount, 0);
});

test("15+16: liveActivationAllowed / exchangeOrderAllowed remain false on every path", async () => {
  for (const r of [
    await runTrendPaperEvidenceCycle(input()),
    await runTrendPaperEvidenceCycle(input({ config: baseConfig({ runnerEnabled: false }) })),
    await runTrendPaperEvidenceCycle(input({ openTrendPosition: { positionId: "p", direction: "SHORT", entryPrice: 1, openedAt: NOW } })),
    await runTrendPaperEvidenceCycle(input({ metrics: metrics(30) })),
  ]) {
    assert.equal(r.liveActivationAllowed, false);
    assert.equal(r.exchangeOrderAllowed, false);
    assert.equal(r.nextState.liveActivationAllowed, false);
    assert.equal(r.nextState.exchangeOrderAllowed, false);
    assert.equal(r.nextState.paperOnly, true);
    assert.equal(r.nextState.oldExposurePolicy, "QUARANTINE_OLD_GRID_EXPOSURE");
  }
});

test("metrics roll-up: sampleStatus / readyForNextPhase reflect closed trades", async () => {
  assert.equal((await runTrendPaperEvidenceCycle(input({ metrics: metrics(4) }))).nextState.sampleStatus, "INSUFFICIENT_SAMPLE_BOOTSTRAP");
  assert.equal((await runTrendPaperEvidenceCycle(input({ metrics: metrics(12) }))).nextState.sampleStatus, "EARLY_SIGNAL_ONLY");
  assert.equal((await runTrendPaperEvidenceCycle(input({ metrics: metrics(12) }))).nextState.readyForNextPhase, false);
});
