// Unit tests for paper-loop diagnostics (Part F observability builder).
// Runner-agnostic: node:test + node:assert.

import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPaperLoopDiagnostics } from "./paperLoopDiagnostics";
import type { PaperJournalSummary, PaperEventSummary } from "@/lib/readPaperJournal";

function ev(p: Partial<PaperEventSummary>): PaperEventSummary {
  return {
    ts: 0, type: "NO_TRADE_DECISION", symbol: "BTC-USDT", mode: "PAPER",
    strategyMode: null, regime: null, session: null, gridSpacingPct: null,
    gridLower: null, gridUpper: null, gridMid: null, currentPrice: null,
    eventTs: null, paperModeDetected: true, noTradeReason: null, schemaVersion: null,
    eventKey: null, orderId: null, orderStatus: null, filledQuantity: null,
    averageFillPrice: null, side: null, quantity: null, kind: null,
    liveOrder: false, source: "paper_audit_log", ...p,
  };
}

function summary(p: Partial<PaperJournalSummary>): PaperJournalSummary {
  return {
    status: "has_data" as PaperJournalSummary["status"], totalPaperEvents: 0,
    totalOrderSimulated: 0, totalOrderFilled: 0, buyFillCount: 0, sellFillCount: 0,
    totalOrderCanceled: 0, totalOrderRejected: 0, openPaperOrders: 0,
    lastPaperEventAt: null, lastPaperEventType: null, lastPaperMode: null,
    paperModeDetected: true, auditFilesScanned: 1, auditRootDir: "/tmp", warnings: [],
    checkedAt: "now", recentEvents: [], ...p,
  };
}

test("below-grid no-trade → priceVsGrid BELOW_GRID + state REGRID_REQUIRED", () => {
  const d = buildPaperLoopDiagnostics(summary({
    buyFillCount: 1316, sellFillCount: 0, lastPaperEventAt: "t1",
    recentEvents: [
      ev({ gridLower: 72480, gridUpper: 78053, gridMid: 75266, currentPrice: 66849, noTradeReason: "price_below_grid_lower", strategyMode: "GRID_NEUTRAL" }),
      ev({ noTradeReason: "price_below_grid_lower" }),
    ],
  }));
  assert.equal(d.rawBuyFillCount, 1316);
  assert.equal(d.rawSellFillCount, 0);
  assert.equal(d.priceVsGrid, "BELOW_GRID");
  assert.equal(d.paperLoopState, "REGRID_REQUIRED");
  assert.equal(d.lastNoTradeReason, "price_below_grid_lower");
  assert.equal(d.noTradeReasonCounts["price_below_grid_lower"], 2);
  assert.equal(d.dynamicGrid.enabled, true);
  // Phase 1 read-only candidate: forms when out of grid, but never activates
  assert.notEqual(d.dynamicGrid.candidate.candidateStatus, "INACTIVE");
  assert.equal(d.dynamicGrid.candidate.activationAllowed, false);
});

test("stale reason → paperLoopState STALE_DATA", () => {
  const d = buildPaperLoopDiagnostics(summary({
    recentEvents: [ev({ currentPrice: 66849, gridLower: 72480, gridUpper: 78053, noTradeReason: "stale_decision_or_price_mismatch" })],
  }));
  assert.equal(d.paperLoopState, "STALE_DATA");
  assert.equal(d.lastNoTradeReason, "stale_decision_or_price_mismatch");
});

test("exposure reason → PAUSE_EXPOSURE_LIMIT", () => {
  const d = buildPaperLoopDiagnostics(summary({
    buyFillCount: 9, sellFillCount: 0,
    recentEvents: [ev({ currentPrice: 74000, gridLower: 72480, gridUpper: 78053, noTradeReason: "one_sided_buy_limit" })],
  }));
  assert.equal(d.paperLoopState, "PAUSE_EXPOSURE_LIMIT");
});

test("empty journal → safe defaults, no throw", () => {
  const d = buildPaperLoopDiagnostics(summary({ recentEvents: [] }));
  assert.equal(d.priceVsGrid, "UNKNOWN");
  assert.equal(d.lastNoTradeReason, null);
  assert.equal(d.dynamicGrid.enabled, false);
});

test("runtime monitor PASS when activation is blocked and safety journals advance after fills", () => {
  const d = buildPaperLoopDiagnostics(
    summary({
      buyFillCount: 14, sellFillCount: 0, lastPaperEventAt: "2026-06-04T01:00:00.000Z",
      recentEvents: [
        ev({ gridLower: 72480, gridUpper: 78053, gridMid: 75266, currentPrice: 66849, noTradeReason: "price_below_grid_lower" }),
      ],
    }),
    {
      cumulativeBuyFillCount: 1460,
      cumulativeSellFillCount: 0,
      paperNoTradeCount: 122,
      regridCandidateCount: 75,
      latestFillAt: "2026-06-04T00:50:00.000Z",
      latestNoTradeAt: "2026-06-04T01:00:00.000Z",
      latestRegridCandidateAt: "2026-06-04T01:01:00.000Z",
    }
  );

  assert.equal(d.runtimeMonitor.cumulativeBuyFillCount, 1460);
  assert.equal(d.runtimeMonitor.cumulativeSellFillCount, 0);
  assert.equal(d.runtimeMonitor.sampleBuyFillCount, 14);
  assert.equal(d.runtimeMonitor.sampleSellFillCount, 0);
  assert.equal(d.runtimeMonitor.paperNoTradeCount, 122);
  assert.equal(d.runtimeMonitor.regridCandidateCount, 75);
  assert.equal(d.runtimeMonitor.activationAllowed, false);
  assert.equal(d.runtimeMonitor.buyCountStable, true);
  assert.equal(d.runtimeMonitor.noTradeIncreasing, true);
  assert.equal(d.runtimeMonitor.regridCandidateIncreasing, true);
  assert.equal(d.runtimeMonitor.monitorStatus, "PASS");
  assert.equal(d.runtimeMonitor.priceVsGrid, "BELOW_GRID");
  assert.equal(d.runtimeMonitor.paperLoopState, "REGRID_REQUIRED");
  assert.equal(d.runtimeMonitor.monitorSummary, "STABLE_RUNTIME_PASS");
});

test("runtime monitor WATCH when a fill is newer than no-trade while out of grid", () => {
  const d = buildPaperLoopDiagnostics(
    summary({
      buyFillCount: 1, sellFillCount: 0,
      recentEvents: [
        ev({ gridLower: 72480, gridUpper: 78053, currentPrice: 66849, noTradeReason: "price_below_grid_lower" }),
      ],
    }),
    {
      cumulativeBuyFillCount: 1461,
      cumulativeSellFillCount: 0,
      paperNoTradeCount: 122,
      regridCandidateCount: 75,
      latestFillAt: "2026-06-04T01:05:00.000Z",
      latestNoTradeAt: "2026-06-04T01:00:00.000Z",
      latestRegridCandidateAt: "2026-06-04T01:01:00.000Z",
    }
  );

  assert.equal(d.runtimeMonitor.buyCountStable, false);
  assert.equal(d.runtimeMonitor.monitorStatus, "WATCH");
});
