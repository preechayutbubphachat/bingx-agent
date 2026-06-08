// dashboard/lib/trend/trendPaperArmIntentBridge.test.ts
// Run: node --experimental-strip-types --test dashboard/lib/trend/trendPaperArmIntentBridge.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { deriveEffectiveTrendManualPaperArmGate } from "./trendPaperArmIntentBridge.ts";
import type { TrendManualPaperArmGate } from "./trendManualPaperArmGate.ts";
import type { TrendPaperArmSession } from "./trendPaperArmSession.ts";

const NOW = "2026-06-08T00:05:00.000Z";

function gate(status: TrendManualPaperArmGate["status"]): TrendManualPaperArmGate {
  return {
    phase: status === "OPERATOR_ARMED_PAPER_ONLY" ? "T-2_ARMED" : "T-2_READY_FOR_OPERATOR",
    status,
    requiredConditions: [],
    passedConditions: [],
    failedConditions: [],
    operatorActionRequired: true,
    setupId: "s1",
    expiryAt: null,
    paperActivationAllowed: false,
    liveActivationAllowed: false,
    notes: [],
  };
}

function sess(over: Partial<TrendPaperArmSession> = {}): TrendPaperArmSession {
  return {
    schemaVersion: "trend-paper-arm-session/1",
    sessionId: "sess-1",
    status: "ACTIVE",
    symbol: "BTC-USDT",
    direction: "SHORT",
    startedAt: "2026-06-07T23:00:00.000Z",
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
    ...over,
  };
}

test("READY + active session + intent true → effective OPERATOR_ARMED_PAPER_ONLY", () => {
  const r = deriveEffectiveTrendManualPaperArmGate({ trendManualPaperArmGate: gate("READY_FOR_OPERATOR_REVIEW"), trendPaperArmSession: sess(), now: NOW });
  assert.equal(r.effectiveStatus, "OPERATOR_ARMED_PAPER_ONLY");
  assert.equal(r.effectiveGate?.status, "OPERATOR_ARMED_PAPER_ONLY");
  assert.equal(r.source, "SESSION_ARM_INTENT");
  assert.equal(r.upgradedToArmed, true);
  assert.equal(r.paperActivationAllowed, false);
  assert.equal(r.liveActivationAllowed, false);
  assert.equal(r.effectiveGate?.paperActivationAllowed, false);
  assert.equal(r.effectiveGate?.liveActivationAllowed, false);
});

test("READY + active session + intent false → remains READY (SESSION_NO_ARM_INTENT)", () => {
  const r = deriveEffectiveTrendManualPaperArmGate({ trendManualPaperArmGate: gate("READY_FOR_OPERATOR_REVIEW"), trendPaperArmSession: sess({ paperArmIntentRequested: false }), now: NOW });
  assert.equal(r.effectiveStatus, "READY_FOR_OPERATOR_REVIEW");
  assert.equal(r.source, "SESSION_NO_ARM_INTENT");
  assert.equal(r.upgradedToArmed, false);
});

test("READY + missing session → remains READY (SESSION_MISSING)", () => {
  const r = deriveEffectiveTrendManualPaperArmGate({ trendManualPaperArmGate: gate("READY_FOR_OPERATOR_REVIEW"), trendPaperArmSession: null, now: NOW });
  assert.equal(r.effectiveStatus, "READY_FOR_OPERATOR_REVIEW");
  assert.equal(r.source, "SESSION_MISSING");
  assert.equal(r.upgradedToArmed, false);
});

test("READY + expired session → remains READY (SESSION_EXPIRED)", () => {
  const r = deriveEffectiveTrendManualPaperArmGate({ trendManualPaperArmGate: gate("READY_FOR_OPERATOR_REVIEW"), trendPaperArmSession: sess({ startedAt: "2026-06-07T22:00:00.000Z", expiresAt: "2026-06-07T23:30:00.000Z" }), now: NOW });
  assert.equal(r.effectiveStatus, "READY_FOR_OPERATOR_REVIEW");
  assert.equal(r.source, "SESSION_EXPIRED");
  assert.equal(r.upgradedToArmed, false);
});

test("READY + limit reached → remains READY (SESSION_LIMIT_REACHED)", () => {
  const r = deriveEffectiveTrendManualPaperArmGate({ trendManualPaperArmGate: gate("READY_FOR_OPERATOR_REVIEW"), trendPaperArmSession: sess({ maxEntries: 2, usedEntries: 2 }), now: NOW });
  assert.equal(r.effectiveStatus, "READY_FOR_OPERATOR_REVIEW");
  assert.equal(r.source, "SESSION_LIMIT_REACHED");
});

test("READY + INACTIVE session → remains READY (SESSION_NOT_ACTIVE)", () => {
  const r = deriveEffectiveTrendManualPaperArmGate({ trendManualPaperArmGate: gate("READY_FOR_OPERATOR_REVIEW"), trendPaperArmSession: sess({ status: "INACTIVE" }), now: NOW });
  assert.equal(r.effectiveStatus, "READY_FOR_OPERATOR_REVIEW");
  assert.equal(r.source, "SESSION_NOT_ACTIVE");
});

test("NOT_READY + active session intent true → remains NOT_READY (never upgrade)", () => {
  const r = deriveEffectiveTrendManualPaperArmGate({ trendManualPaperArmGate: gate("NOT_READY"), trendPaperArmSession: sess(), now: NOW });
  assert.equal(r.effectiveStatus, "NOT_READY");
  assert.equal(r.source, "RAW_GATE");
  assert.equal(r.upgradedToArmed, false);
});

test("BLOCKED + active session intent true → remains BLOCKED (never upgrade)", () => {
  const r = deriveEffectiveTrendManualPaperArmGate({ trendManualPaperArmGate: gate("BLOCKED"), trendPaperArmSession: sess(), now: NOW });
  assert.equal(r.effectiveStatus, "BLOCKED");
  assert.equal(r.upgradedToArmed, false);
});

test("raw OPERATOR_ARMED_PAPER_ONLY remains armed (RAW_GATE, not re-derived)", () => {
  const r = deriveEffectiveTrendManualPaperArmGate({ trendManualPaperArmGate: gate("OPERATOR_ARMED_PAPER_ONLY"), trendPaperArmSession: sess(), now: NOW });
  assert.equal(r.effectiveStatus, "OPERATOR_ARMED_PAPER_ONLY");
  assert.equal(r.source, "RAW_GATE");
  assert.equal(r.upgradedToArmed, false);
});

test("activation flags always false across all paths", () => {
  for (const st of ["NOT_READY", "READY_FOR_OPERATOR_REVIEW", "OPERATOR_ARMED_PAPER_ONLY", "BLOCKED", "EXPIRED"] as const) {
    const r = deriveEffectiveTrendManualPaperArmGate({ trendManualPaperArmGate: gate(st), trendPaperArmSession: sess(), now: NOW });
    assert.equal(r.paperActivationAllowed, false);
    assert.equal(r.liveActivationAllowed, false);
    assert.equal(r.effectiveGate?.liveActivationAllowed, false);
  }
});
