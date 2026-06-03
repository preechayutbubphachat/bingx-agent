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
