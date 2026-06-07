import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validateTrendPaperJournalEvent,
  TREND_PAPER_JOURNAL_SCHEMA_VERSION,
} from "./trendPaperJournalSchema.ts";

function entry(p: any = {}) {
  return {
    schemaVersion: TREND_PAPER_JOURNAL_SCHEMA_VERSION,
    ts: 1780640100000, eventType: "TREND_PAPER_ENTRY",
    epochId: "trend-epoch:1", setupId: "trend-arm:SHORT:DOWNTREND:63142-63453",
    symbol: "BTC-USDT", direction: "SHORT",
    entry: 63300, stopLoss: 64552, takeProfit1: 61825, takeProfit2: null,
    fillPricePaper: 63290, quantityPaper: 0.01, riskAmountPaper: 12.5,
    rMultiple: null, grossPnlPaper: null, feeEstimate: 0.4, slippageEstimate: 0.2, netPnlPaper: null,
    exitReason: null, oldExposurePolicy: "QUARANTINE_OLD_GRID_EXPOSURE",
    countTowardGridClosedCycles: false, countTowardTrendEvidence: false, liveActivationAllowed: false,
    ...p,
  };
}
function exit(p: any = {}) {
  return {
    ...entry(),
    eventType: "TREND_PAPER_EXIT",
    fillPricePaper: 61830, quantityPaper: 0.01, riskAmountPaper: 12.5,
    rMultiple: 1.18, grossPnlPaper: 14.7, feeEstimate: 0.4, slippageEstimate: 0.2, netPnlPaper: 14.1,
    exitReason: "tp1_hit", countTowardTrendEvidence: true,
    ...p,
  };
}

test("valid entry event => valid", () => {
  const r = validateTrendPaperJournalEvent(entry());
  assert.equal(r.valid, true, JSON.stringify(r.errors));
});

test("valid exit event => valid (closing, trend evidence true allowed)", () => {
  const r = validateTrendPaperJournalEvent(exit());
  assert.equal(r.valid, true, JSON.stringify(r.errors));
});

test("missing required fields rejected", () => {
  const r = validateTrendPaperJournalEvent(entry({ setupId: undefined, symbol: undefined }));
  assert.equal(r.valid, false);
  assert.ok(r.errors.some((e) => e.includes("setupId")));
  assert.ok(r.errors.some((e) => e.includes("symbol")));
});

test("grid cycle flag must be false", () => {
  const r = validateTrendPaperJournalEvent(entry({ countTowardGridClosedCycles: true }));
  assert.equal(r.valid, false);
  assert.ok(r.errors.includes("count_toward_grid_closed_cycles_must_be_false"));
});

test("liveActivationAllowed must be false", () => {
  const r = validateTrendPaperJournalEvent(entry({ liveActivationAllowed: true }));
  assert.equal(r.valid, false);
  assert.ok(r.errors.includes("live_activation_allowed_must_be_false"));
});

test("oldExposurePolicy must be QUARANTINE_OLD_GRID_EXPOSURE", () => {
  const r = validateTrendPaperJournalEvent(entry({ oldExposurePolicy: "SOMETHING_ELSE" }));
  assert.equal(r.valid, false);
  assert.ok(r.errors.includes("old_exposure_policy_must_be_quarantine_old_grid_exposure"));
});

test("trend evidence true on non-closing (entry) rejected", () => {
  const r = validateTrendPaperJournalEvent(entry({ countTowardTrendEvidence: true }));
  assert.equal(r.valid, false);
  assert.ok(r.errors.includes("count_toward_trend_evidence_true_only_after_closed_trade"));
});

test("invalid PnL/R fields on exit rejected", () => {
  const r = validateTrendPaperJournalEvent(exit({ rMultiple: "NaN", netPnlPaper: null }));
  assert.equal(r.valid, false);
  assert.ok(r.errors.some((e) => e.includes("rMultiple") || e.includes("netPnlPaper")));
});

test("negative fee rejected", () => {
  const r = validateTrendPaperJournalEvent(exit({ feeEstimate: -1 }));
  assert.equal(r.valid, false);
  assert.ok(r.errors.includes("fee_estimate_negative"));
});

test("cancel event must not count trend evidence", () => {
  const r = validateTrendPaperJournalEvent(entry({ eventType: "TREND_PAPER_CANCEL", countTowardTrendEvidence: true, exitReason: "cancelled" }));
  assert.equal(r.valid, false);
  assert.ok(r.errors.includes("count_toward_trend_evidence_true_only_after_closed_trade") || r.errors.includes("cancel_must_not_count_trend_evidence"));
});

test("invalidated event with result fields => valid closing", () => {
  const r = validateTrendPaperJournalEvent(exit({ eventType: "TREND_PAPER_INVALIDATED", exitReason: "regime_flip" }));
  assert.equal(r.valid, true, JSON.stringify(r.errors));
});

test("rMultiple/netPnl sign mismatch => warning not error", () => {
  const r = validateTrendPaperJournalEvent(exit({ rMultiple: 1.2, netPnlPaper: -5 }));
  assert.equal(r.valid, true);
  assert.ok(r.warnings.includes("rmultiple_netpnl_sign_mismatch"));
});

test("invalid event type rejected", () => {
  const r = validateTrendPaperJournalEvent(entry({ eventType: "GRID_FILL" }));
  assert.equal(r.valid, false);
  assert.ok(r.errors.some((e) => e.includes("invalid_event_type")));
});
