// dashboard/lib/trading-agent-hq/cardUpdateSignatures.ts
// Phase UI-1 — per-card update signatures, severity and mini-panel summaries.
// SAFETY: PURE read-only derivation from the existing read-only ViewModel.
//   - No order/live/exchange action. No I/O. No secrets.
//   - Signatures & markers are lightweight status scalars safe to persist as UI state.
//   - "critical" severity NEVER means live-ready; it means "operator should look now".

import type { PaperVM, SafetyVM } from "./viewModel.ts";
import type { AgentHqCardId } from "./cardLayout.ts";

export type CardUpdateSeverity = "none" | "info" | "warning" | "success" | "critical";

export interface CollapsibleCardState {
  collapsed: boolean;
  hasUpdates: boolean;
  updateSeverity: CardUpdateSeverity;
  lastSeenSignature?: string;
}

// Lightweight, non-secret markers used both for the signature string and for
// transition-based severity. Every field is a small status scalar.
export interface CardSnapshot {
  signature: string;
  /** current-state critical (shown even with no prior baseline) */
  critical: boolean;
  /** short status token for the mini-panel (e.g. WAITING_SETUP) */
  status: string;
  /** short human summary line for the mini-panel (Thai-friendly) */
  summary: string;
  // transition markers (optional per card)
  lastRunAt?: string | null;
  lastDecision?: string | null;
  gateStatus?: string | null;
  rejectReasonsKey?: string | null;
  failedConditionsKey?: string | null;
  trendClosedTrades?: number | null;
  sampleStatus?: string | null;
  readyForNextPhase?: boolean | null;
  successSignal?: boolean;
}

const SAMPLE_RANK: Record<string, number> = {
  INSUFFICIENT_SAMPLE_BOOTSTRAP: 0,
  INSUFFICIENT_SAMPLE: 0,
  NO_DATA: 0,
  BEHAVIOR_CHECK_ONLY: 1,
  EARLY_SIGNAL_ONLY: 2,
  EARLY_SAMPLE: 2,
  FIRST_STATISTICAL_READ: 3,
  USABLE_SAMPLE: 3,
  REVIEW_SAMPLE: 4,
  USABLE_EVIDENCE: 5,
  PRODUCTION_CANDIDATE_REVIEW: 5,
  SUFFICIENT: 5,
};

const WARNING_DECISIONS = new Set([
  "WAITING_SETUP",
  "BUDGET_BLOCKED",
  "WAIT_NEXT_BAR",
  "NO_ACTION",
  "RISK_REJECTED",
]);

function sampleRank(s: string | null | undefined): number {
  if (!s) return -1;
  return SAMPLE_RANK[s] ?? -1;
}

function joinKey(arr: readonly string[] | null | undefined): string {
  return arr && arr.length ? arr.join("|") : "";
}

/** Any live/exchange escape implies critical attention regardless of card. */
function anyEscape(...flags: Array<boolean | null | undefined>): boolean {
  return flags.some((f) => f === true);
}

// ---------------------------------------------------------------------------
// Per-card snapshot builders. Each reads ONLY fields documented for that card.
// ---------------------------------------------------------------------------

function snapEvidenceRunner(p: PaperVM): CardSnapshot {
  const r = p.trendPaperEvidenceRunner;
  const reject = joinKey(r.lastRejectReasons);
  const critical = anyEscape(r.liveActivationAllowed, r.exchangeOrderAllowed) || r.evidencePhase === "SAFETY_BLOCKED" || !!r.stopReason;
  const status = r.lastDecision ?? r.evidencePhase ?? "DISABLED";
  const summary = [
    r.lastGateStatus ?? r.evidencePhase,
    r.lastRejectReasons.length ? `${r.lastRejectReasons.length} reject reasons` : null,
    `closed ${r.trendClosedTrades}/${r.targetClosedTrades}`,
  ]
    .filter(Boolean)
    .join(" · ");
  return {
    signature: `evr:${r.evidencePhase}|${r.lastRunAt ?? ""}|${r.lastDecision ?? ""}|${r.lastGateStatus ?? ""}|${reject}|${r.dailyEntryCount}|${r.openTrendPosition?.positionId ?? ""}|${r.trendClosedTrades}|${r.sampleStatus}|${r.readyForNextPhase}|${r.stopReason ?? ""}|${r.liveActivationAllowed}|${r.exchangeOrderAllowed}`,
    critical,
    status,
    summary,
    lastRunAt: r.lastRunAt,
    lastDecision: r.lastDecision,
    gateStatus: r.lastGateStatus,
    rejectReasonsKey: reject,
    trendClosedTrades: r.trendClosedTrades,
    sampleStatus: r.sampleStatus,
    readyForNextPhase: r.readyForNextPhase,
    successSignal: r.lastDecision === "PAPER_ENTRY_CREATED" || r.lastDecision === "CREATE_PAPER_ENTRY",
  };
}

function snapExecutionEngine(p: PaperVM): CardSnapshot {
  const e = p.trendPaperExecutionEngine;
  const critical = anyEscape(e.liveActivationAllowed, e.exchangeOrderAllowed);
  return {
    signature: `eng:${e.enabled}|${e.mode}|${e.lastAction}|${e.lastReason ?? ""}|${e.openTrendPaperPosition?.positionId ?? ""}|${e.openTrendPaperPosition?.status ?? ""}|${e.trendPaperClosedTrades}|${e.liveActivationAllowed}|${e.exchangeOrderAllowed}`,
    critical,
    status: e.lastAction,
    summary: [e.mode, e.openTrendPaperPosition ? `open ${e.openTrendPaperPosition.direction ?? "?"}` : "no position", `closed ${e.trendPaperClosedTrades}`]
      .filter(Boolean)
      .join(" · "),
    lastDecision: e.lastAction,
    trendClosedTrades: e.trendPaperClosedTrades,
    successSignal: e.lastAction === "CREATE_PAPER_ENTRY",
  };
}

function snapPreflight(p: PaperVM): CardSnapshot {
  const f = p.trendPaperExecutionPreflight;
  const failed = joinKey(f.failedInputs);
  const critical = anyEscape(f.liveActivationAllowed) || f.status === "BLOCKED";
  return {
    signature: `pf:${f.status}|${failed}|${joinKey(f.passedInputs)}|${f.setupId ?? ""}|${f.direction ?? ""}|${f.rewardRisk ?? ""}|${f.paperArmAllowed}|${f.liveActivationAllowed}`,
    critical,
    status: f.status,
    summary: [f.direction ?? "—", f.failedInputs.length ? `${f.failedInputs.length} failed` : "all passed", f.rewardRisk != null ? `RR ${f.rewardRisk}` : null]
      .filter(Boolean)
      .join(" · "),
    gateStatus: f.status,
    failedConditionsKey: failed,
    successSignal: f.status === "READY_FOR_PAPER_SIMULATION_REVIEW",
  };
}

function snapTransitionMonitor(p: PaperVM): CardSnapshot {
  const t = p.trendTransitionMonitor;
  const critical = anyEscape(t.liveActivationAllowed) || t.severity === "critical" || t.status === "SAFETY_BLOCK";
  return {
    signature: `tm:${t.status}|${t.severity}|${t.operatorAction ?? ""}|${t.shouldNotifyOperator}|${t.checkedAt ?? ""}|${t.watchedFields.direction ?? ""}|${t.watchedFields.riskStatus ?? ""}|${t.liveActivationAllowed}`,
    critical,
    status: t.status,
    summary: [t.watchedFields.direction ?? "—", t.operatorAction ?? t.message ?? t.severity].filter(Boolean).join(" · "),
    gateStatus: t.status,
    lastRunAt: t.checkedAt,
  };
}

function snapEdgeReview(p: PaperVM): CardSnapshot {
  const e = p.trendEdgeReview;
  const critical = anyEscape(e.liveActivationAllowed);
  return {
    signature: `edge:${e.status}|${e.trendClosedTrades}|${e.sampleTier}|${e.winRate ?? ""}|${e.expectancyR ?? ""}|${e.profitFactor ?? ""}|${e.maxDrawdownR ?? ""}|${e.decision}|${e.liveActivationAllowed}`,
    critical,
    status: e.status,
    summary: [`closed ${e.trendClosedTrades}`, e.winRate != null ? `WR ${(e.winRate * 100).toFixed(0)}%` : null, `decision ${e.decision}`].filter(Boolean).join(" · "),
    trendClosedTrades: e.trendClosedTrades,
    sampleStatus: e.status,
    successSignal: e.decision === "READY_FOR_LIMITED_CANARY_REVIEW",
  };
}

function snapCanonicalMarketRegime(p: PaperVM): CardSnapshot {
  const c = p.canonicalMarketRegime;
  const critical = anyEscape(c.liveActivationAllowed);
  return {
    signature: `cmr:${c.regime}|${c.direction}|${c.confidenceLabel}|${c.confidence}|${c.sourceFreshness.status}|${c.evidenceCompleteness.status}|${c.liveActivationAllowed}`,
    critical,
    status: c.regime,
    summary: [c.direction, `conf ${c.confidenceLabel}`, c.sourceFreshness.status].filter(Boolean).join(" · "),
    gateStatus: c.regime,
  };
}

function snapCanonicalRegimeGate(p: PaperVM): CardSnapshot {
  const g = p.canonicalRegimeGate;
  const critical = anyEscape(g.liveActivationAllowed);
  return {
    signature: `crg:${g.status}|${g.blocking}|${g.downgradeOnly}|${joinKey(g.affectedModes)}|${g.liveActivationAllowed}`,
    critical,
    status: g.status,
    summary: [g.blocking ? "blocking" : "passive", g.affectedModes.length ? `${g.affectedModes.length} modes` : null].filter(Boolean).join(" · "),
    gateStatus: g.status,
  };
}

function snapIndicatorGate(p: PaperVM): CardSnapshot {
  const g = p.indicatorGate;
  const failed = joinKey(g.failed);
  const critical = anyEscape(g.liveActivationAllowed);
  return {
    signature: `ig:${g.status}|${g.confidence}|${g.blocking}|${failed}|${joinKey(g.passed)}|${g.liveActivationAllowed}`,
    critical,
    status: g.status,
    summary: [g.confidence, g.blocking ? "blocking" : "non-blocking", g.failed.length ? `${g.failed.length} failed` : null].filter(Boolean).join(" · "),
    gateStatus: g.status,
    failedConditionsKey: failed,
  };
}

function snapTrendZoneCandidate(p: PaperVM): CardSnapshot {
  const z = p.trendZoneCandidate;
  if (!z) {
    return { signature: "tzc:none", critical: false, status: "NONE", summary: "ยังไม่มี candidate" };
  }
  const critical = anyEscape(z.liveActivationAllowed);
  return {
    signature: `tzc:${z.buildStatus}|${z.dir ?? ""}|${z.invalidation ?? ""}|${z.triggerRule ?? ""}|${joinKey(z.warnings)}|${z.liveActivationAllowed}`,
    critical,
    status: z.buildStatus,
    summary: [z.dir ?? "—", z.triggerRule ?? "—", z.warnings.length ? `${z.warnings.length} warns` : null].filter(Boolean).join(" · "),
    gateStatus: z.buildStatus,
  };
}

function snapTrendStrategyShadow(p: PaperVM): CardSnapshot {
  const s = p.trendStrategy;
  const critical = anyEscape(s.liveActivationAllowed);
  return {
    signature: `tss:${s.status}|${s.direction ?? ""}|${s.confirmationStatus}|${s.riskStatus}|${s.rewardRisk ?? ""}|${s.liveActivationAllowed}`,
    critical,
    status: s.status,
    summary: [s.direction ?? "—", s.riskStatus, s.confirmationStatus].filter(Boolean).join(" · "),
    gateStatus: s.status,
  };
}

function snapTrendRegimeConfirmation(p: PaperVM): CardSnapshot {
  // Confirmation card surfaces trend strategy confirmation state.
  const s = p.trendStrategy;
  return {
    signature: `trc:${s.confirmationRequired}|${s.confirmationStatus}|${s.direction ?? ""}|${s.status}`,
    critical: false,
    status: s.confirmationStatus,
    summary: [s.confirmationRequired ? "confirm required" : "no confirm", s.direction ?? "—"].filter(Boolean).join(" · "),
    gateStatus: s.confirmationStatus,
  };
}

function snapManualArmGate(p: PaperVM): CardSnapshot {
  const g = p.trendManualPaperArmGate;
  const failed = joinKey(g.failedConditions);
  const critical = anyEscape(g.liveActivationAllowed);
  return {
    signature: `mag:${g.phase}|${g.status}|${failed}|${g.operatorActionRequired}|${g.setupId ?? ""}|${g.liveActivationAllowed}`,
    critical,
    status: g.status,
    summary: [g.operatorActionRequired ? "operator action" : "no action", g.failedConditions.length ? `${g.failedConditions.length} failed` : null].filter(Boolean).join(" · "),
    gateStatus: g.status,
    failedConditionsKey: failed,
    successSignal: g.status === "READY_FOR_OPERATOR_REVIEW" || g.status === "OPERATOR_ARMED_PAPER_ONLY",
  };
}

function snapArmSession(p: PaperVM): CardSnapshot {
  const s = p.trendPaperArmSession;
  const critical = anyEscape(s.liveActivationAllowed, s.exchangeOrderAllowed);
  return {
    signature: `aps:${s.present}|${s.status}|${s.sessionId ?? ""}|${s.direction ?? ""}|${s.remainingEntries ?? ""}|${s.active}|${s.liveActivationAllowed}|${s.exchangeOrderAllowed}`,
    critical,
    status: s.status,
    summary: [s.active ? "active" : "inactive", s.direction ?? "—", s.remainingEntries != null ? `${s.remainingEntries} left` : null].filter(Boolean).join(" · "),
    gateStatus: s.status,
  };
}

function snapArmIntentBridge(p: PaperVM): CardSnapshot {
  const b = p.trendPaperArmIntentBridge;
  const critical = anyEscape(b.liveActivationAllowed);
  return {
    signature: `aib:${b.rawStatus ?? ""}|${b.effectiveStatus ?? ""}|${b.source}|${b.upgradedToArmed}|${b.paperArmIntentRequested}|${b.liveActivationAllowed}`,
    critical,
    status: b.effectiveStatus ?? b.source,
    summary: [b.source, b.upgradedToArmed ? "upgraded" : "raw"].filter(Boolean).join(" · "),
    gateStatus: b.effectiveStatus,
  };
}

function snapDynamicRegrid(p: PaperVM): CardSnapshot {
  const d = p.dynamicRegrid;
  return {
    signature: `dr:${d.marketMode ?? ""}|${d.regime ?? ""}|${d.priceVsGrid ?? ""}|${d.paperLoopState ?? ""}|${d.lastNoTradeReason ?? ""}|${d.buyFillCount}|${d.sellFillCount}|${d.closedCycles}|${d.candidate.candidateStatus ?? ""}`,
    critical: false,
    status: d.priceVsGrid ?? "UNKNOWN",
    summary: [d.regime ?? "—", d.paperLoopState ?? "—", `cycles ${d.closedCycles}`].filter(Boolean).join(" · "),
    gateStatus: d.priceVsGrid,
  };
}

function snapRuntimeMonitor(p: PaperVM): CardSnapshot {
  const m = p.runtimeMonitor;
  return {
    signature: `rm:${m.monitorStatus}|${m.cumulativeBuyFillCount}|${m.cumulativeSellFillCount}|${m.paperNoTradeCount}|${m.regridCandidateCount}|${m.latestFillAt ?? ""}|${m.priceVsGrid ?? ""}`,
    critical: false,
    status: m.monitorStatus,
    summary: [m.monitorSummary ?? `${m.cumulativeBuyFillCount} buys`, m.priceVsGrid ?? "—"].filter(Boolean).join(" · "),
    lastRunAt: m.latestFillAt,
    gateStatus: m.monitorStatus,
  };
}

function snapRegridPhase2A(p: PaperVM): CardSnapshot {
  const r = p.regridReadinessAfterCanonicalGate ?? p.regridReadiness;
  const critical = anyEscape(r.liveActivationAllowed);
  return {
    signature: `r2a:${r.status}|${r.score}|${joinKey(r.failedGates)}|${r.operatorReviewRequired}|${r.liveActivationAllowed}`,
    critical,
    status: r.status,
    summary: [`score ${r.score}`, r.failedGates.length ? `${r.failedGates.length} failed` : "all gates ok"].filter(Boolean).join(" · "),
    gateStatus: r.status,
    failedConditionsKey: joinKey(r.failedGates),
    successSignal: r.status === "READY_FOR_OPERATOR_REVIEW",
  };
}

function snapRegimeEvidence(p: PaperVM): CardSnapshot {
  const e = p.regimeEvidence;
  return {
    signature: `re:${e.evidenceCompleteness.status}|${e.evidenceCompleteness.scorePct}|${e.decision.marketMode ?? ""}|${e.decision.regime ?? ""}|${joinKey(e.missingFields)}`,
    critical: false,
    status: e.evidenceCompleteness.status,
    summary: [`evidence ${e.evidenceCompleteness.scorePct}%`, e.decision.regime ?? "—"].filter(Boolean).join(" · "),
    gateStatus: e.evidenceCompleteness.status,
  };
}

function snapSystemStatus(p: PaperVM, safety: SafetyVM): CardSnapshot {
  const critical = anyEscape(safety.liveTradingEnabled, safety.orderPlacementEnabled, safety.productionTradingReady) || safety.exchangeManualApproval === "approved";
  return {
    signature: `sys:${p.closedCycles}|${p.totalOrderFilled}|${p.edgeStatus}|${p.costGateStatus}|${safety.phase}|${safety.liveTradingEnabled}|${safety.orderPlacementEnabled}|${safety.productionTradingReady}|${safety.exchangeManualApproval}`,
    critical,
    status: safety.phase,
    summary: [`fills ${p.totalOrderFilled}`, `cycles ${p.closedCycles}`, `cost ${p.costGateStatus}`].filter(Boolean).join(" · "),
    gateStatus: safety.phase,
  };
}

/** Build a card snapshot from the read-only ViewModel. */
export function buildCardSnapshot(
  cardId: AgentHqCardId,
  paper: PaperVM,
  safety: SafetyVM,
): CardSnapshot {
  switch (cardId) {
    case "systemStatus":
      return snapSystemStatus(paper, safety);
    case "dynamicRegridStatus":
      return snapDynamicRegrid(paper);
    case "runtimeMonitor":
      return snapRuntimeMonitor(paper);
    case "regridPhase2AReadiness":
      return snapRegridPhase2A(paper);
    case "canonicalMarketRegime":
      return snapCanonicalMarketRegime(paper);
    case "canonicalRegimeGate":
      return snapCanonicalRegimeGate(paper);
    case "regimeEvidence":
      return snapRegimeEvidence(paper);
    case "indicatorGate":
      return snapIndicatorGate(paper);
    case "trendRegimeConfirmation":
      return snapTrendRegimeConfirmation(paper);
    case "trendZoneCandidate":
      return snapTrendZoneCandidate(paper);
    case "trendStrategyShadow":
      return snapTrendStrategyShadow(paper);
    case "trendTransitionMonitor":
      return snapTransitionMonitor(paper);
    case "trendManualPaperArmGate":
      return snapManualArmGate(paper);
    case "trendPaperArmSession":
      return snapArmSession(paper);
    case "trendPaperArmIntentBridge":
      return snapArmIntentBridge(paper);
    case "trendPaperEvidenceRunner":
      return snapEvidenceRunner(paper);
    case "trendPaperExecutionPreflight":
      return snapPreflight(paper);
    case "trendPaperExecutionEngine":
      return snapExecutionEngine(paper);
    case "trendEdgeReview":
      return snapEdgeReview(paper);
    case "trendPaperDryRunConsole":
      // Dry run console is read-only and has no live mutation surface here.
      return { signature: "dry:static", critical: false, status: "READ_ONLY", summary: "console อ่านอย่างเดียว" };
    case "cafeFloor":
      return { signature: "cafe:pinned", critical: false, status: "VISIBLE", summary: "" };
    default:
      return { signature: `${cardId}:unknown`, critical: false, status: "UNKNOWN", summary: "" };
  }
}

export function buildCardSignature(cardId: AgentHqCardId, paper: PaperVM, safety: SafetyVM): string {
  return buildCardSnapshot(cardId, paper, safety).signature;
}

/**
 * Transition-based severity. `current` is always present; `previous` is the last-seen
 * snapshot (may be undefined on first load). Current-state critical always wins.
 */
export function computeUpdateSeverity(current: CardSnapshot, previous?: CardSnapshot): CardUpdateSeverity {
  // 1) Current-state critical — surfaced even without a baseline.
  if (current.critical) return "critical";

  // No baseline → nothing to diff; report no update.
  if (!previous) return "none";

  // No change at all.
  if (previous.signature === current.signature) return "none";

  // 2) Success transitions.
  if (current.successSignal && !previous.successSignal) return "success";
  if (
    typeof current.trendClosedTrades === "number" &&
    typeof previous.trendClosedTrades === "number" &&
    current.trendClosedTrades > previous.trendClosedTrades
  ) {
    return "success";
  }
  if (current.readyForNextPhase === true && previous.readyForNextPhase !== true) return "success";
  if (sampleRank(current.sampleStatus) > sampleRank(previous.sampleStatus)) return "success";
  if (previous.gateStatus === "NOT_READY" && current.gateStatus === "READY_FOR_OPERATOR_REVIEW") return "success";

  // 3) Warning transitions.
  if ((current.gateStatus ?? "") !== (previous.gateStatus ?? "")) return "warning";
  if ((current.rejectReasonsKey ?? "") !== (previous.rejectReasonsKey ?? "")) return "warning";
  if ((current.failedConditionsKey ?? "") !== (previous.failedConditionsKey ?? "")) return "warning";
  if (
    (current.lastDecision ?? "") !== (previous.lastDecision ?? "") &&
    current.lastDecision != null &&
    WARNING_DECISIONS.has(current.lastDecision)
  ) {
    return "warning";
  }

  // 4) Info — a benign refresh (e.g. lastRunAt advanced) but nothing actionable.
  if ((current.lastRunAt ?? "") !== (previous.lastRunAt ?? "")) return "info";

  // Signature changed in some non-classified way → treat as info.
  return "info";
}

export const SEVERITY_LABEL_TH: Record<CardUpdateSeverity, string> = {
  none: "ปกติ",
  info: "อัปเดต",
  warning: "ควรดู",
  success: "คืบหน้า",
  critical: "สำคัญ",
};
