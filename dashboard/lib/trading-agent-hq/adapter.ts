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
  const dynamicGrid = obj(loop.dynamicGrid);
  const candidate = obj(dynamicGrid.candidate);
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
    dynamicRegrid: {
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
