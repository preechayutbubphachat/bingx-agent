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
const bool = (v: unknown): boolean => v === true || v === "true";
const str = (v: unknown, d = ""): string => (typeof v === "string" ? v : d);

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
  };
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
    bubble: paper.totalOrderFilled > 0 ? `Filled ${paper.totalOrderFilled} (paper)` : "Idle",
    currentTask: "Paper grid cycle",
    lastAction: str(journal.lastPaperEventType, "—"),
    metric: `fills: ${paper.totalOrderFilled}`,
    confidence: paper.closedCycles === 0 ? "DATA_GAP (no closed cycle)" : "paper",
  };
  const risk: AgentVM = {
    id: "risk_manager",
    status: safety.liveTradingEnabled || safety.orderPlacementEnabled ? "alert" : "guarding",
    visualStates: ["calm"],
    animation: "idle",
    bubble: safety.liveTradingEnabled ? "LIVE FLAG ON?!" : "Guarding (live OFF)",
    currentTask: "Risk / safety watch",
    lastAction: `phase ${safety.phase}`,
    metric: `live:${safety.liveTradingEnabled ? "ON" : "OFF"} order:${safety.orderPlacementEnabled ? "ON" : "OFF"}`,
    confidence: "safe-mode",
  };
  const regime: AgentVM = {
    id: "market_regime",
    status: decisionExists ? "scanning" : "unknown",
    visualStates: decisionExists ? ["thinking"] : ["idle"],
    animation: "idle",
    bubble: decisionExists ? "Reading regime…" : "No decision file",
    currentTask: "Regime classify",
    lastAction: decisionExists ? "latest_decision present" : "—",
    metric: null,
    confidence: null,
  };
  const memory: AgentVM = {
    id: "memory_brain",
    status: num(journal.totalPaperEvents) > 0 ? "logging" : "unknown",
    visualStates: ["idle"],
    animation: "idle",
    bubble: num(journal.totalPaperEvents) > 0 ? "Writing journal" : "No events",
    currentTask: "Audit log",
    lastAction: str(journal.lastPaperEventAt, "—"),
    metric: `events: ${num(journal.totalPaperEvents)}`,
    confidence: null,
  };
  const idleAgent = (id: AgentId, task: string): AgentVM => ({
    id, status: "unknown", visualStates: ["idle"], animation: "idle",
    bubble: "No signal", currentTask: task, lastAction: "—", metric: null, confidence: null,
  });

  const agents: Record<AgentId, AgentVM> = {
    grid_bot: grid,
    trend_bot: idleAgent("trend_bot", "Momentum scan"),
    risk_manager: risk,
    news_analyst: idleAgent("news_analyst", "Headline scan"),
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
