// dashboard/lib/trading-agent-hq/cardUpdateSignatures.test.ts
// Phase UI-1 — pure coverage for collapsible layout + update severity.
// Run: node --test --experimental-strip-types lib/trading-agent-hq/cardUpdateSignatures.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import {
  AGENT_HQ_CARD_LAYOUT,
  AGENT_HQ_LAYOUT_STORAGE_KEY,
  applyCollapseAll,
  applyExpandAll,
  applyResetLayout,
  defaultCollapsedMap,
  defaultStoredLayout,
  isPinnedCard,
  mergeCollapsedWithDefaults,
} from "./cardLayout.ts";
import {
  buildCardSnapshot,
  computeUpdateSeverity,
  tileStatusCategory,
  type CardSnapshot,
} from "./cardUpdateSignatures.ts";
import type { PaperVM, SafetyVM } from "./viewModel.ts";

// --- helpers ---------------------------------------------------------------
function snap(over: Partial<CardSnapshot> = {}): CardSnapshot {
  return { signature: "base", critical: false, status: "X", summary: "", ...over };
}
// Build a PaperVM with only the fields a given card reads; cast for the test.
function paper(partial: Record<string, unknown>): PaperVM {
  return partial as unknown as PaperVM;
}
const SAFETY: SafetyVM = {
  liveTradingEnabled: false,
  orderPlacementEnabled: false,
  productionTradingReady: false,
  exchangeManualApproval: "not_approved",
  phase: "M-0B_BLOCKED",
};

// --- layout invariants -----------------------------------------------------
test("Cafe Floor is the pinned card and starts visible", () => {
  const cafe = AGENT_HQ_CARD_LAYOUT.find((c) => c.id === "cafeFloor");
  assert.ok(cafe);
  assert.equal(cafe!.pinned, true);
  assert.equal(isPinnedCard("cafeFloor"), true);
  assert.equal(defaultCollapsedMap().cafeFloor, false);
});

test("default layout expands the key cards and collapses context/debug cards", () => {
  const d = defaultCollapsedMap();
  // expanded by default
  for (const id of [
    "systemStatus",
    "trendPaperEvidenceRunner",
    "trendPaperExecutionPreflight",
    "trendTransitionMonitor",
    "cafeFloor",
  ]) {
    assert.equal(d[id], false, `${id} should be expanded by default`);
  }
  // collapsed by default
  for (const id of [
    "canonicalMarketRegime",
    "canonicalRegimeGate",
    "indicatorGate",
    "trendZoneCandidate",
    "trendPaperArmSession",
    "trendPaperArmIntentBridge",
    "trendEdgeReview",
  ]) {
    assert.equal(d[id], true, `${id} should be collapsed by default`);
  }
});

test("collapse all collapses every non-pinned card but keeps Cafe Floor visible", () => {
  const out = applyCollapseAll(defaultCollapsedMap());
  assert.equal(out.cafeFloor, false); // pinned stays visible
  for (const c of AGENT_HQ_CARD_LAYOUT) {
    if (!c.pinned) assert.equal(out[c.id], true, `${c.id} should be collapsed`);
  }
});

test("expand all expands every card including previously collapsed", () => {
  const out = applyExpandAll(applyCollapseAll(defaultCollapsedMap()));
  for (const c of AGENT_HQ_CARD_LAYOUT) assert.equal(out[c.id], false);
});

test("reset layout restores registry defaults", () => {
  assert.deepEqual(applyResetLayout(), defaultCollapsedMap());
});

test("per-card collapse/expand toggles only the target card", () => {
  const base = defaultCollapsedMap();
  const toggled: Record<string, boolean> = { ...base, trendEdgeReview: !base.trendEdgeReview };
  assert.equal(toggled.trendEdgeReview, false);
  assert.equal(toggled.canonicalMarketRegime, base.canonicalMarketRegime);
});

test("stored collapsed flags merge onto defaults; pinned can never be stored-collapsed", () => {
  const merged = mergeCollapsedWithDefaults({ cafeFloor: true, indicatorGate: false, unknownCard: true });
  assert.equal(merged.cafeFloor, false, "pinned card forced visible");
  assert.equal(merged.indicatorGate, false, "stored expand respected");
  assert.equal(merged.trendEdgeReview, true, "untouched card keeps default");
});

test("stored layout shape only carries lightweight UI keys (no secret fields)", () => {
  const s = defaultStoredLayout();
  assert.deepEqual(Object.keys(s).sort(), ["collapsed", "filter", "lastSeenSignatures", "version"]);
  assert.equal(AGENT_HQ_LAYOUT_STORAGE_KEY, "agent-hq-card-layout:v1");
});

// --- UI-2 status category (filter chips) -----------------------------------
test("tileStatusCategory: critical → notready regardless of status text", () => {
  assert.equal(tileStatusCategory(snap({ critical: true, status: "EVIDENCE_COLLECTION" })), "notready");
});

test("tileStatusCategory: blocked/disabled/safety words → notready", () => {
  for (const status of ["NOT_READY", "BLOCKED", "DISABLED", "SAFETY_BLOCK", "REJECTED_BY_OPERATOR", "ERROR_LOCKDOWN"]) {
    assert.equal(tileStatusCategory(snap({ status })), "notready", status);
  }
});

test("tileStatusCategory: waiting words → waiting", () => {
  for (const status of ["WAITING_SETUP", "INSUFFICIENT_DATA", "DATA_GAP", "UNKNOWN", "IDLE_NO_TRADE", "NONE"]) {
    assert.equal(tileStatusCategory(snap({ status })), "waiting", status);
  }
});

test("tileStatusCategory: active/ready/read-only → working", () => {
  for (const status of ["EVIDENCE_COLLECTION", "READY_FOR_OPERATOR_REVIEW", "READ_ONLY", "RANGE", "ACTIVE"]) {
    assert.equal(tileStatusCategory(snap({ status })), "working", status);
  }
});

// --- severity transitions --------------------------------------------------
test("no baseline → none unless current is critical", () => {
  assert.equal(computeUpdateSeverity(snap()), "none");
  assert.equal(computeUpdateSeverity(snap({ critical: true })), "critical");
});

test("identical signature → none", () => {
  assert.equal(computeUpdateSeverity(snap({ signature: "a" }), snap({ signature: "a" })), "none");
});

test("current critical always wins over prior state", () => {
  assert.equal(
    computeUpdateSeverity(snap({ signature: "b", critical: true }), snap({ signature: "a" })),
    "critical",
  );
});

test("trendClosedTrades increase → success", () => {
  const prev = snap({ signature: "p", trendClosedTrades: 3 });
  const cur = snap({ signature: "c", trendClosedTrades: 4 });
  assert.equal(computeUpdateSeverity(cur, prev), "success");
});

test("readyForNextPhase false→true → success", () => {
  const prev = snap({ signature: "p", readyForNextPhase: false });
  const cur = snap({ signature: "c", readyForNextPhase: true });
  assert.equal(computeUpdateSeverity(cur, prev), "success");
});

test("reject reasons change → warning", () => {
  const prev = snap({ signature: "p", rejectReasonsKey: "A" });
  const cur = snap({ signature: "c", rejectReasonsKey: "A|B" });
  assert.equal(computeUpdateSeverity(cur, prev), "warning");
});

test("gate status change → warning", () => {
  const prev = snap({ signature: "p", gateStatus: "WATCHING_PULLBACK" });
  const cur = snap({ signature: "c", gateStatus: "ENTRY_ZONE_REACHED" });
  assert.equal(computeUpdateSeverity(cur, prev), "warning");
});

test("only lastRunAt changed → info", () => {
  const prev = snap({ signature: "p", lastRunAt: "t1", gateStatus: "G", rejectReasonsKey: "R" });
  const cur = snap({ signature: "c", lastRunAt: "t2", gateStatus: "G", rejectReasonsKey: "R" });
  assert.equal(computeUpdateSeverity(cur, prev), "info");
});

// --- snapshot critical wiring ---------------------------------------------
test("evidence runner snapshot is critical when liveActivationAllowed=true", () => {
  const s = buildCardSnapshot(
    "trendPaperEvidenceRunner",
    paper({
      trendPaperEvidenceRunner: {
        evidencePhase: "EVIDENCE_COLLECTION",
        lastRunAt: null,
        lastDecision: "WAITING_SETUP",
        lastGateStatus: "NOT_READY",
        lastRejectReasons: [],
        dailyEntryCount: 0,
        openTrendPosition: null,
        trendClosedTrades: 0,
        targetClosedTrades: 30,
        sampleStatus: "INSUFFICIENT_SAMPLE_BOOTSTRAP",
        readyForNextPhase: false,
        stopReason: null,
        liveActivationAllowed: true,
        exchangeOrderAllowed: false,
      },
    }),
    SAFETY,
  );
  assert.equal(s.critical, true);
});

test("evidence runner snapshot is critical when exchangeOrderAllowed=true", () => {
  const s = buildCardSnapshot(
    "trendPaperEvidenceRunner",
    paper({
      trendPaperEvidenceRunner: {
        evidencePhase: "EVIDENCE_COLLECTION",
        lastRunAt: null,
        lastDecision: "WAITING_SETUP",
        lastGateStatus: "NOT_READY",
        lastRejectReasons: ["a", "b"],
        dailyEntryCount: 0,
        openTrendPosition: null,
        trendClosedTrades: 0,
        targetClosedTrades: 30,
        sampleStatus: "INSUFFICIENT_SAMPLE_BOOTSTRAP",
        readyForNextPhase: false,
        stopReason: null,
        liveActivationAllowed: false,
        exchangeOrderAllowed: true,
      },
    }),
    SAFETY,
  );
  assert.equal(s.critical, true);
});

test("evidence runner snapshot stays non-critical in safe paper-only state, summary mentions reject count", () => {
  const s = buildCardSnapshot(
    "trendPaperEvidenceRunner",
    paper({
      trendPaperEvidenceRunner: {
        evidencePhase: "DISABLED",
        lastRunAt: "2026-06-10T00:00:00Z",
        lastDecision: "WAITING_SETUP",
        lastGateStatus: "NOT_READY",
        lastRejectReasons: ["x", "y", "z", "w"],
        dailyEntryCount: 0,
        openTrendPosition: null,
        trendClosedTrades: 0,
        targetClosedTrades: 30,
        sampleStatus: "INSUFFICIENT_SAMPLE_BOOTSTRAP",
        readyForNextPhase: false,
        stopReason: null,
        liveActivationAllowed: false,
        exchangeOrderAllowed: false,
      },
    }),
    SAFETY,
  );
  assert.equal(s.critical, false);
  assert.match(s.summary, /4 reject reasons/);
});

test("system status snapshot turns critical if a global safety escape flips on", () => {
  const safe = buildCardSnapshot("systemStatus", paper({ closedCycles: 0, totalOrderFilled: 5, edgeStatus: "DATA_GAP", costGateStatus: "PASS" }), SAFETY);
  assert.equal(safe.critical, false);
  const danger = buildCardSnapshot(
    "systemStatus",
    paper({ closedCycles: 0, totalOrderFilled: 5, edgeStatus: "DATA_GAP", costGateStatus: "PASS" }),
    { ...SAFETY, liveTradingEnabled: true },
  );
  assert.equal(danger.critical, true);
});

test("signatures never embed token-like material (lightweight status only)", () => {
  const s = buildCardSnapshot("systemStatus", paper({ closedCycles: 1, totalOrderFilled: 2, edgeStatus: "UNKNOWN", costGateStatus: "PASS" }), SAFETY);
  assert.doesNotMatch(s.signature.toLowerCase(), /token|secret|bearer|authorization|apikey|api_key/);
});
