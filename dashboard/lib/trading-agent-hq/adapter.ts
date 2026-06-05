// dashboard/lib/trading-agent-hq/adapter.ts
// THQ-5 — map public-safe endpoint payloads → TradingAgentHQ ViewModel.
// PURE mapping (no fetch, no side effects). SAFETY: read-only; never infers live-ready.
// Sources (public-safe only): /api/public-health, /api/paper-status, /api/paper-performance.
// Missing data degrades to UNKNOWN / idle / warning — NEVER fake PASS.

import type {
  TradingAgentHQViewModel, AgentVM, AgentId, AgentStatus, LogEntry, PaperVM, SafetyVM,
} from "./viewModel";

/* loose shapes — endpoints are public-safe JSON; we read defensively */
type AnyObj = Record<string, unknown>;
const obj = (v: unknown): AnyObj => (v && typeof v === "object" ? (v as AnyObj) : {});
const num = (v: unknown, d = 0): number => (typeof v === "number" && Number.isFinite(v) ? v : d);
const numOrNull = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const bool = (v: unknown): boolean => v === true || v === "true";
const boolOrNull = (v: unknown): boolean | null => (typeof v === "boolean" ? v : v === "true" ? true : v === "false" ? false : null);
const str = (v: unknown, d = ""): string => (typeof v === "string" ? v : d);
const strOrNull = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);
const strArray = (v: unknown): string[] => Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
const scalarOrNull = (v: unknown): string | number | boolean | null =>
  typeof v === "string" || typeof v === "number" || typeof v === "boolean" ? v : null;

function ageIsStale(iso: string, maxMin = 10): boolean {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return true;
  return Date.now() - t > maxMin * 60_000;
}

function mapSafety(ph: AnyObj): SafetyVM {
  return {
    liveTradingEnabled: bool(ph.liveTradingEnabled),
    orderPlacementEnabled: bool(ph.orderPlacementEnabled),
    productionTradingReady: bool(ph.productionReady),
    exchangeManualApproval: str(ph.exchangeManualApproval, "not_approved") === "approved" ? "approved" : "not_approved",
    phase: str(ph.phase, "UNKNOWN"),
  };
}

function mapPaper(status: AnyObj, perf: AnyObj): PaperVM {
  const journal = obj(status.paperJournal);
  const edge = obj(perf.edgeDiagnostics);
  const costGate = obj(perf.costGate);
  const loop = obj(perf.paperLoopDiagnostics);
  const runtimeMonitor = obj(loop.runtimeMonitor);
  const readiness = obj(loop.regridReadiness);
  const epoch = obj(loop.paperEpoch);
  const dynamicGrid = obj(loop.dynamicGrid);
  const candidate = obj(dynamicGrid.candidate);
  const regimeEvidence = obj(loop.regimeEvidence);
  const completeness = obj(regimeEvidence.evidenceCompleteness);
  const freshness = obj(regimeEvidence.sourceFreshness);
  const evidenceDecision = obj(regimeEvidence.decision);
  const indicators = obj(regimeEvidence.indicators);
  const derivatives = obj(regimeEvidence.derivatives);
  const obGate = obj(regimeEvidence.obGate);
  const totalOrderFilled = num(journal.totalOrderFilled);
  const closedCycles = num(edge.closedCycles);
  const sampleRaw = str(edge.sampleSizeStatus || perf.sampleSizeStatus, "");
  const sampleStatus: PaperVM["sampleStatus"] =
    sampleRaw === "sufficient" ? "SUFFICIENT"
    : sampleRaw === "insufficient_data" || sampleRaw === "insufficient" ? "INSUFFICIENT_SAMPLE"
    : "UNKNOWN";
  // honest edge: 0 closed cycles can NEVER be edge PASS
  const edgeStatus: PaperVM["edgeStatus"] =
    closedCycles === 0 ? "DATA_GAP"
    : totalOrderFilled > 0 ? "REAL_FILLS_ACCUMULATING"
    : "UNKNOWN";
  return {
    totalOrderFilled,
    closedCycles,
    sampleStatus,
    paperModeDetected: bool(journal.paperModeDetected),
    edgeStatus,
    costGateStatus: mapCostGateStatus(str(costGate.status, "")),
    runtimeMonitor: {
      cumulativeBuyFillCount: num(runtimeMonitor.cumulativeBuyFillCount, 0),
      cumulativeSellFillCount: num(runtimeMonitor.cumulativeSellFillCount, 0),
      sampleBuyFillCount: num(runtimeMonitor.sampleBuyFillCount ?? loop.sampleBuyFillCount ?? loop.rawBuyFillCount, 0),
      sampleSellFillCount: num(runtimeMonitor.sampleSellFillCount ?? loop.sampleSellFillCount ?? loop.rawSellFillCount, 0),
      paperNoTradeCount: num(runtimeMonitor.paperNoTradeCount, 0),
      regridCandidateCount: num(runtimeMonitor.regridCandidateCount, 0),
      latestFillAt: strOrNull(runtimeMonitor.latestFillAt),
      latestNoTradeAt: strOrNull(runtimeMonitor.latestNoTradeAt),
      latestRegridCandidateAt: strOrNull(runtimeMonitor.latestRegridCandidateAt),
      buyCountStable: bool(runtimeMonitor.buyCountStable),
      noTradeIncreasing: bool(runtimeMonitor.noTradeIncreasing),
      regridCandidateIncreasing: bool(runtimeMonitor.regridCandidateIncreasing),
      activationAllowed: boolOrNull(runtimeMonitor.activationAllowed ?? candidate.activationAllowed),
      priceVsGrid: strOrNull(runtimeMonitor.priceVsGrid ?? loop.priceVsGrid ?? perf.priceVsGrid),
      paperLoopState: strOrNull(runtimeMonitor.paperLoopState ?? loop.paperLoopState),
      monitorStatus: str(runtimeMonitor.monitorStatus, "UNKNOWN") === "PASS"
        ? "PASS"
        : str(runtimeMonitor.monitorStatus, "UNKNOWN") === "WATCH" ? "WATCH" : "UNKNOWN",
      monitorSummary: strOrNull(runtimeMonitor.monitorSummary),
    },
    regridReadiness: {
      status: str(readiness.status, "UNKNOWN") === "NOT_READY"
        ? "NOT_READY"
        : str(readiness.status, "UNKNOWN") === "WATCH"
          ? "WATCH"
          : str(readiness.status, "UNKNOWN") === "READY_FOR_OPERATOR_REVIEW" ? "READY_FOR_OPERATOR_REVIEW" : "UNKNOWN",
      score: num(readiness.score, 0),
      passedGates: strArray(readiness.passedGates),
      failedGates: strArray(readiness.failedGates),
      warnings: strArray(readiness.warnings),
      nextAction: strOrNull(readiness.nextAction),
      operatorReviewRequired: bool(readiness.operatorReviewRequired),
      paperActivationAllowed: bool(readiness.paperActivationAllowed),
      liveActivationAllowed: bool(readiness.liveActivationAllowed),
    },
    paperEpoch: {
      currentEpochId: strOrNull(epoch.currentEpochId),
      previousEpochStatus: strOrNull(epoch.previousEpochStatus),
      previousEpochReason: strOrNull(epoch.previousEpochReason),
      nextEpochCandidateId: strOrNull(epoch.nextEpochCandidateId),
      nextEpochStatus: strOrNull(epoch.nextEpochStatus),
      oldExposurePolicy: strArray(epoch.oldExposurePolicy),
    },
    regimeEvidence: {
      evidenceCompleteness: {
        status: str(completeness.status, "unknown") === "complete"
          ? "complete"
          : str(completeness.status, "unknown") === "partial"
            ? "partial"
            : str(completeness.status, "unknown") === "missing" ? "missing" : "unknown",
        scorePct: num(completeness.scorePct, 0),
        availableCount: num(completeness.availableCount, 0),
        expectedCount: num(completeness.expectedCount, 0),
      },
      sourceFreshness: {
        latestDecisionAt: strOrNull(freshness.latestDecisionAt),
        marketSnapshotAt: strOrNull(freshness.marketSnapshotAt),
        planStatusStateAt: strOrNull(freshness.planStatusStateAt),
        warnings: strArray(freshness.warnings),
      },
      decision: {
        marketMode: strOrNull(evidenceDecision.marketMode),
        regime: strOrNull(evidenceDecision.regime),
        trendDir: strOrNull(evidenceDecision.trendDir),
        trendTriggerRule: strOrNull(evidenceDecision.trendTriggerRule),
        trendInvalidation: scalarOrNull(evidenceDecision.trendInvalidation) as string | number | null,
        smcBias: strOrNull(evidenceDecision.smcBias),
        structureState: strOrNull(evidenceDecision.structureState),
        bos: scalarOrNull(evidenceDecision.bos) as string | boolean | null,
        choch: scalarOrNull(evidenceDecision.choch) as string | boolean | null,
        mss: scalarOrNull(evidenceDecision.mss) as string | boolean | null,
        sweep: scalarOrNull(evidenceDecision.sweep) as string | boolean | null,
        obContext: strOrNull(evidenceDecision.obContext),
        fvgContext: strOrNull(evidenceDecision.fvgContext),
      },
      indicators: {
        adx: mapEvidenceValue(indicators.adx),
        plusDI: mapEvidenceValue(indicators.plusDI),
        minusDI: mapEvidenceValue(indicators.minusDI),
        rsi: mapEvidenceValue(indicators.rsi),
        atr: mapEvidenceValue(indicators.atr),
        atrPct: mapEvidenceValue(indicators.atrPct),
        bbw: mapEvidenceValue(indicators.bbw),
        macd: mapEvidenceValue(indicators.macd),
        emaSlope: mapEvidenceValue(indicators.emaSlope),
      },
      derivatives: {
        oiBias: strOrNull(derivatives.oiBias),
        oiChange: numOrNull(derivatives.oiChange),
        fundingRate: numOrNull(derivatives.fundingRate),
        fundingBias: strOrNull(derivatives.fundingBias),
        fundingRisk: strOrNull(derivatives.fundingRisk),
        openInterest: numOrNull(derivatives.openInterest),
        derivativesBias: strOrNull(derivatives.derivativesBias),
      },
      obGate: {
        status: strOrNull(obGate.status),
        reason: strOrNull(obGate.reason),
        score: numOrNull(obGate.score),
        passed: boolOrNull(obGate.passed),
        blockedReason: strOrNull(obGate.blockedReason),
      },
      missingFields: strArray(regimeEvidence.missingFields),
      availableFields: strArray(regimeEvidence.availableFields),
      notes: strArray(regimeEvidence.notes),
    },
    dynamicRegrid: {
      marketMode: strOrNull(loop.marketMode ?? loop.market_mode ?? perf.marketMode ?? perf.market_mode),
      regime: strOrNull(loop.regime ?? perf.regime),
      priceVsGrid: strOrNull(loop.priceVsGrid ?? perf.priceVsGrid),
      paperLoopState: strOrNull(loop.paperLoopState),
      lastNoTradeReason: strOrNull(loop.lastNoTradeReason),
      currentPrice: numOrNull(loop.currentPrice),
      gridLower: numOrNull(loop.gridLower),
      gridUpper: numOrNull(loop.gridUpper),
      gridMid: numOrNull(loop.gridMid),
      buyFillCount: num(loop.sampleBuyFillCount ?? loop.rawBuyFillCount ?? perf.buyFillCount, 0),
      sellFillCount: num(loop.sampleSellFillCount ?? loop.rawSellFillCount ?? perf.sellFillCount, 0),
      closedCycles,
      candidate: {
        candidateStatus: strOrNull(candidate.candidateStatus),
        candidateReason: strOrNull(candidate.candidateReason),
        cooldownRemaining: numOrNull(candidate.cooldownRemaining),
        stableCandleCount: numOrNull(candidate.stableCandleCount),
        activationAllowed: boolOrNull(candidate.activationAllowed),
      },
    },
  };
}

function mapEvidenceValue(value: unknown): PaperVM["regimeEvidence"]["indicators"]["adx"] {
  const wrapped = obj(value);
  return {
    value: scalarOrNull(wrapped.value),
    source: strOrNull(wrapped.source),
  };
}

function mapCostGateStatus(status: string): PaperVM["costGateStatus"] {
  const normalized = status.toUpperCase();
  if (normalized === "PASS") return "PASS";
  if (normalized === "WARNING" || normalized === "WARN") return "WARNING";
  if (normalized === "FAIL" || normalized === "FAILED") return "FAIL";
  return "UNKNOWN";
}

function mapLog(status: AnyObj): LogEntry[] {
  const journal = obj(status.paperJournal);
  const events = Array.isArray(journal.recentEvents) ? journal.recentEvents : [];
  const out: LogEntry[] = events.slice(0, 8).map((raw): LogEntry => {
    const e = obj(raw);
    const t = str(e.type || e.eventType, "SYSTEM").toUpperCase();
    const type: LogEntry["type"] =
      t.includes("FILL") ? "FILL_RESULT"
      : t.includes("ALERT") || t.includes("RISK") ? "ALERT"
      : t.includes("DECISION") || t.includes("PLAN") ? "DECISION"
      : "SYSTEM";
    const price = num(e.averageFillPrice ?? obj(e.payload).averageFillPrice, NaN);
    const text = Number.isFinite(price) ? `${t} @ ${price}` : t;
    return { ts: str(e.ts || e.timestamp || e.at, "—"), type, text };
  });
  if (out.length === 0) out.push({ ts: "—", type: "SYSTEM", text: "no recent paper events" });
  return out;
}

function agentsActive(agents: Record<AgentId, AgentVM>): number {
  const active: AgentStatus[] = ["running", "scanning", "guarding", "logging"];
  return Object.values(agents).filter((a) => active.includes(a.status)).length;
}

export function mapToViewModel(
  publicHealth: unknown,
  paperStatus: unknown,
  paperPerformance: unknown,
): TradingAgentHQViewModel {
  const ph = obj(publicHealth);
  const ps = obj(paperStatus);
  const perf = obj(paperPerformance);

  const safety = mapSafety(ph);
  const paper = mapPaper(ps, perf);
  const journal = obj(ps.paperJournal);
  const runtime = obj(ph.runtimeCoreFiles);
  const decisionExists = str(runtime.latestDecision) === "exists";
  const lastUpdate = str(ph.generatedAt || ps.checkedAt, "—");

  // honest per-agent derivation from available public-safe signals
  const grid: AgentVM = {
    id: "grid_bot",
    status: paper.paperModeDetected && paper.totalOrderFilled > 0 ? "running" : "unknown",
    visualStates: paper.totalOrderFilled > 0 ? ["running", "balancing_orders"] : ["idle"],
    animation: paper.totalOrderFilled > 0 ? "grid_working" : "idle",
    bubble: paper.totalOrderFilled > 0 ? `เติม ${paper.totalOrderFilled} ครั้ง (paper)` : "ว่าง",
    currentTask: "รอบ Paper grid",
    lastAction: str(journal.lastPaperEventType, "—"),
    metric: `fills: ${paper.totalOrderFilled}`,
    confidence: paper.closedCycles === 0 ? "ยังไม่มีรอบปิด" : "paper",
  };
  const risk: AgentVM = {
    id: "risk_manager",
    status: safety.liveTradingEnabled || safety.orderPlacementEnabled ? "alert" : "guarding",
    visualStates: ["calm"],
    animation: "idle",
    bubble: safety.liveTradingEnabled ? "พบ LIVE FLAG เปิด!?" : "เฝ้าระวัง (เงินจริงปิด)",
    currentTask: "เฝ้าความเสี่ยง / ความปลอดภัย",
    lastAction: `เฟส ${safety.phase}`,
    metric: `live:${safety.liveTradingEnabled ? "ON" : "OFF"} order:${safety.orderPlacementEnabled ? "ON" : "OFF"}`,
    confidence: "safe-mode",
  };
  const regime: AgentVM = {
    id: "market_regime",
    status: decisionExists ? "scanning" : "unknown",
    visualStates: decisionExists ? ["thinking"] : ["idle"],
    animation: "idle",
    bubble: decisionExists ? "กำลังอ่าน regime…" : "ไม่มีไฟล์ decision",
    currentTask: "จำแนก regime",
    lastAction: decisionExists ? "มี latest_decision" : "—",
    metric: null,
    confidence: null,
  };
  const memory: AgentVM = {
    id: "memory_brain",
    status: num(journal.totalPaperEvents) > 0 ? "logging" : "unknown",
    visualStates: ["idle"],
    animation: "idle",
    bubble: num(journal.totalPaperEvents) > 0 ? "กำลังบันทึก journal" : "ไม่มีเหตุการณ์",
    currentTask: "บันทึกตรวจสอบ (audit log)",
    lastAction: str(journal.lastPaperEventAt, "—"),
    metric: `events: ${num(journal.totalPaperEvents)}`,
    confidence: null,
  };
  const idleAgent = (id: AgentId, task: string): AgentVM => ({
    id, status: "unknown", visualStates: ["idle"], animation: "idle",
    bubble: "ไม่มีสัญญาณ", currentTask: task, lastAction: "—", metric: null, confidence: null,
  });

  const agents: Record<AgentId, AgentVM> = {
    grid_bot: grid,
    trend_bot: idleAgent("trend_bot", "สแกนโมเมนตัม"),
    risk_manager: risk,
    news_analyst: idleAgent("news_analyst", "สแกนข่าว"),
    market_regime: regime,
    memory_brain: memory,
  };

  const riskHeat = safety.liveTradingEnabled || safety.orderPlacementEnabled ? "ALERT"
    : Array.isArray(ph.warnings) && ph.warnings.length > 0 ? "WATCH" : "CALM";

  return {
    mode: "trading_agent_hq",
    meta: { lastUpdate, source: "public-safe-api", isStale: ageIsStale(lastUpdate) },
    safety,
    paper,
    topHud: {
      marketMood: "UNKNOWN", // regime label not exposed by public-safe endpoints yet
      simEquity: null,
      dailyPnl: null,
      riskHeat,
      agentsActive: agentsActive(agents),
    },
    bottomLog: mapLog(ps),
    agents,
  };
}
