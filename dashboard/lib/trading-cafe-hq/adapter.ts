// Trading Caffee HQ data adapter.
// Maps existing public-safe/auth-safe endpoint payloads into the static cafe UI shape.
// SAFETY: pure mapping only. No fetch, no writes, no trading/order/approval mutation.

import type {
  CafeAgent,
  CafeAgentId,
  CafeAlert,
  CafeDecision,
  CafeMetric,
  CafeTrade,
  TradingCafeHqMock,
} from "./mockData";
import { TRADING_CAFE_HQ_MOCK } from "./mockData";

type AnyObj = Record<string, unknown>;

const asObj = (value: unknown): AnyObj => (value && typeof value === "object" ? (value as AnyObj) : {});
const asString = (value: unknown, fallback = ""): string => (typeof value === "string" ? value : fallback);
const asNumber = (value: unknown, fallback = 0): number =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;
const asBool = (value: unknown): boolean => value === true || value === "true";
const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

function endpointAvailable(payload: unknown): boolean {
  return Boolean(payload && typeof payload === "object");
}

function normalizeStatus(value: unknown): string {
  return asString(value, "UNKNOWN").toUpperCase();
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

function extractCheckedAt(...payloads: unknown[]): string {
  for (const payload of payloads) {
    const root = asObj(payload);
    const checkedAt = asString(root.checkedAt || root.generatedAt || root.updatedAt || root.timestamp, "");
    if (checkedAt) return checkedAt;
  }
  return new Date().toISOString();
}

function ageIsStale(iso: string, maxMinutes = 15): boolean {
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return true;
  return Date.now() - time > maxMinutes * 60_000;
}

function withMetric(metrics: CafeMetric[], id: string, patch: Partial<CafeMetric>): CafeMetric[] {
  return metrics.map((metric) => (metric.id === id ? { ...metric, ...patch } : metric));
}

function withAgent(agents: CafeAgent[], id: CafeAgentId, patch: Partial<CafeAgent>): CafeAgent[] {
  return agents.map((agent) => (agent.id === id ? { ...agent, ...patch } : agent));
}

function extractPaperSummary(paperPerformance: unknown) {
  const perf = asObj(paperPerformance);
  const edge = asObj(perf.edgeDiagnostics);
  const quality = asObj(perf.paperDataQuality);
  const costGate = asObj(perf.costGate);
  const gridSpacing = asObj(perf.gridSpacingCheck);

  return {
    status: normalizeStatus(perf.status || perf.ok),
    totalEvents: asNumber(perf.totalEvents),
    totalPaperOrders: asNumber(perf.totalPaperOrders),
    totalPaperFills: asNumber(perf.totalPaperFills || perf.totalOrderFilled),
    sampleSizeStatus: normalizeStatus(perf.sampleSizeStatus || edge.sampleSizeStatus),
    edgeStatus: normalizeStatus(perf.edgeStatus || edge.status),
    closedCycles: asNumber(edge.closedCycles),
    hasAverageFillPrice: asBool(quality.hasAverageFillPrice),
    hasClosedTrades: asBool(quality.hasClosedTrades),
    qualityStatus: normalizeStatus(quality.qualityStatus),
    costGateStatus: normalizeStatus(costGate.status),
    gridSpacingPct: asNumber(costGate.gridSpacingPct ?? gridSpacing.spacingPct, NaN),
  };
}

function extractPlanSummary(planStatus: unknown) {
  const plan = asObj(planStatus);
  const obGate = asObj(plan.ob_gate || plan.obGate);
  const decision = asObj(plan.latestDecision || plan.latest_decision || plan.decision);
  const market = asObj(plan.market || plan.marketSnapshot || plan.market_snapshot);
  const regime = asString(obGate.regime || market.regime || decision.regime || decision.marketRegime, "UNKNOWN");
  const side = asString(decision.side || decision.action || decision.intent, "");
  const symbol = asString(decision.symbol || plan.symbol || market.symbol, "BTCUSDT");

  return {
    ok: asBool(plan.ok) || endpointAvailable(planStatus),
    symbol,
    regime,
    side,
    riskHeat: asNumber(obGate.riskHeat ?? plan.riskHeat, NaN),
    noTradeReason: asString(decision.noTradeReason || plan.noTradeReason, ""),
  };
}

function extractRuntimeSummary(publicHealth: unknown) {
  const health = asObj(publicHealth);
  const files = asObj(health.runtimeCoreFiles);
  const rawLive = asBool(health.liveTradingEnabled);
  const rawOrders = asBool(health.orderPlacementEnabled);
  const rawProduction = asBool(health.productionReady);
  const rawApproval = asString(health.exchangeManualApproval, "not_approved");

  return {
    ok: asBool(health.ok) || endpointAvailable(publicHealth),
    phase: asString(health.phase, "M-0B_BLOCKED"),
    rawLive,
    rawOrders,
    rawProduction,
    rawApproval,
    latestDecisionExists: asString(files.latestDecision) === "exists",
    marketSnapshotExists: asString(files.marketSnapshot) === "exists",
  };
}

function buildTrades(paperPerformance: unknown, fallback: CafeTrade[]): CafeTrade[] {
  const perf = asObj(paperPerformance);
  const events = asArray(perf.recentEvents || asObj(perf.paperDataQuality).recentEvents);
  const trades = events
    .slice(0, 4)
    .map((raw, index): CafeTrade | null => {
      const event = asObj(raw);
      const payload = asObj(event.payload);
      const side = asString(event.side || payload.side, "").toUpperCase();
      if (side !== "BUY" && side !== "SELL") return null;
      const symbol = asString(event.symbol || payload.symbol, "BTCUSDT");
      const price = asNumber(event.averageFillPrice ?? payload.averageFillPrice, NaN);
      return {
        id: `paper-${index}`,
        symbol,
        side,
        pnl: Number.isFinite(price) ? `paper @ ${formatNumber(price)}` : "paper fill",
        status: "paper",
      };
    })
    .filter((trade): trade is CafeTrade => Boolean(trade));

  return trades.length > 0 ? trades : fallback;
}

function buildDecisions(planStatus: unknown, paperPerformance: unknown, fallback: CafeDecision[]): CafeDecision[] {
  const plan = extractPlanSummary(planStatus);
  const paper = extractPaperSummary(paperPerformance);
  const decisions: CafeDecision[] = [];

  if (plan.ok) {
    decisions.push({
      id: "plan-status",
      time: "live",
      summary: plan.noTradeReason || `${plan.symbol} ${plan.side || "status"} / ${plan.regime}`,
      status: plan.noTradeReason ? "blocked" : "watching",
    });
  }

  if (endpointAvailable(paperPerformance)) {
    decisions.push({
      id: "paper-performance",
      time: "paper",
      summary: `fills=${paper.totalPaperFills}, closedCycles=${paper.closedCycles}, quality=${paper.qualityStatus}`,
      status: paper.closedCycles > 0 ? "watching" : "blocked",
    });
  }

  return decisions.length > 0 ? decisions : fallback;
}

function buildAlerts(publicHealth: unknown, planStatus: unknown, paperPerformance: unknown, fallback: CafeAlert[]): CafeAlert[] {
  const runtime = extractRuntimeSummary(publicHealth);
  const plan = extractPlanSummary(planStatus);
  const paper = extractPaperSummary(paperPerformance);
  const alerts: CafeAlert[] = [];

  if (!runtime.ok) {
    alerts.push({ id: "runtime-unavailable", severity: "warning", title: "Public health endpoint unavailable", timestamp: "now", sourceAgentId: "risk_manager" });
  }
  if (runtime.rawLive || runtime.rawOrders || runtime.rawProduction || runtime.rawApproval === "approved") {
    alerts.push({ id: "safety-flag-mismatch", severity: "danger", title: "Safety flag mismatch detected; UI remains read-only", timestamp: "now", sourceAgentId: "risk_manager" });
  }
  if (!runtime.latestDecisionExists || !runtime.marketSnapshotExists) {
    alerts.push({ id: "runtime-core-missing", severity: "warning", title: "Runtime core file evidence incomplete", timestamp: "now", sourceAgentId: "memory_brain" });
  }
  if (plan.noTradeReason) {
    alerts.push({ id: "no-trade-reason", severity: "info", title: plan.noTradeReason, timestamp: "plan", sourceAgentId: "market_regime" });
  }
  if (endpointAvailable(paperPerformance) && paper.closedCycles === 0) {
    alerts.push({ id: "closed-cycle-gap", severity: "warning", title: "Paper fills exist but closed cycles are still data gap", timestamp: "paper", sourceAgentId: "grid_bot" });
  }

  return alerts.length > 0 ? alerts.slice(0, 4) : fallback;
}

export function mapEndpointsToTradingCafeHq(
  publicHealth: unknown,
  planStatus: unknown,
  paperPerformance: unknown,
  base: TradingCafeHqMock = TRADING_CAFE_HQ_MOCK,
): TradingCafeHqMock {
  const runtime = extractRuntimeSummary(publicHealth);
  const plan = extractPlanSummary(planStatus);
  const paper = extractPaperSummary(paperPerformance);
  const checkedAt = extractCheckedAt(paperPerformance, planStatus, publicHealth);
  const hasAnyEndpoint = endpointAvailable(publicHealth) || endpointAvailable(planStatus) || endpointAvailable(paperPerformance);
  const stale = ageIsStale(checkedAt);
  const safetyWarning = runtime.rawLive || runtime.rawOrders || runtime.rawProduction || runtime.rawApproval === "approved";
  const closedCycleLabel = paper.closedCycles > 0 ? "closed cycles accumulating" : base.safety.closedCycleLabel;

  let topMetrics = base.topMetrics;
  topMetrics = withMetric(topMetrics, "market", {
    value: plan.regime === "UNKNOWN" ? "UNKNOWN" : plan.regime.toUpperCase(),
    subValue: plan.symbol,
    severity: plan.regime === "UNKNOWN" ? "warning" : "info",
    dataStatus: endpointAvailable(planStatus) ? "ready" : "empty",
  });
  topMetrics = withMetric(topMetrics, "equity", {
    value: `${formatNumber(paper.totalPaperFills)} fills`,
    subValue: `${paper.closedCycles} closed cycles`,
    severity: paper.totalPaperFills > 0 ? "success" : "warning",
    progressValue: Math.min(100, paper.totalPaperFills),
    dataStatus: endpointAvailable(paperPerformance) ? "ready" : "empty",
  });
  topMetrics = withMetric(topMetrics, "profit", {
    value: paper.qualityStatus === "UNKNOWN" ? "DATA GAP" : paper.qualityStatus,
    subValue: paper.hasAverageFillPrice ? "avg fill price present" : "avg fill price missing",
    severity: paper.hasAverageFillPrice ? "success" : "warning",
    progressValue: paper.hasAverageFillPrice ? 70 : 20,
    dataStatus: endpointAvailable(paperPerformance) ? "ready" : "empty",
  });
  topMetrics = withMetric(topMetrics, "risk", {
    value: safetyWarning ? "ALERT" : "BLOCKED",
    subValue: "M-0B locked",
    severity: safetyWarning ? "danger" : "warning",
    progressValue: safetyWarning ? 95 : 42,
    dataStatus: runtime.ok ? "ready" : "empty",
  });
  topMetrics = withMetric(topMetrics, "energy", {
    value: stale ? "STALE" : "FRESH",
    subValue: checkedAt,
    severity: stale ? "warning" : "info",
    progressValue: stale ? 30 : 88,
    dataStatus: stale ? "stale" : "ready",
  });

  let agents = base.agents;
  agents = withAgent(agents, "grid_bot", {
    status: paper.totalPaperFills > 0 ? "working" : "idle",
    currentTask: paper.totalPaperFills > 0
      ? `Reading ${paper.totalPaperFills} paper fills; closed cycles=${paper.closedCycles}.`
      : "Waiting for real paper fills from the paper loop.",
    todayPnl: `${paper.totalPaperFills} fills`,
    signalsCount: paper.totalPaperOrders,
    accuracyPercent: paper.hasAverageFillPrice ? 80 : 40,
    lastUpdatedAt: checkedAt,
  });
  agents = withAgent(agents, "risk_manager", {
    status: safetyWarning ? "alert" : "working",
    currentTask: "Keeping M-0B blocked, live trading OFF, and order placement OFF.",
    todayPnl: "safe",
    signalsCount: runtime.ok ? 4 : 1,
    accuracyPercent: safetyWarning ? 50 : 100,
    lastUpdatedAt: checkedAt,
  });
  agents = withAgent(agents, "market_regime", {
    status: endpointAvailable(planStatus) ? "working" : "stale",
    currentTask: plan.noTradeReason || `Reading ${plan.symbol} regime: ${plan.regime}.`,
    todayPnl: plan.side || "watch",
    signalsCount: plan.ok ? 1 : 0,
    lastUpdatedAt: checkedAt,
  });
  agents = withAgent(agents, "memory_brain", {
    status: stale ? "stale" : "working",
    currentTask: `Paper data quality=${paper.qualityStatus}; cost gate=${paper.costGateStatus}.`,
    todayPnl: paper.sampleSizeStatus,
    signalsCount: paper.totalEvents,
    accuracyPercent: paper.hasClosedTrades ? 75 : 35,
    lastUpdatedAt: checkedAt,
  });

  return {
    ...base,
    generatedAt: checkedAt,
    sourceLabel: hasAnyEndpoint
      ? "Read-only adapter: /api/public-health + /api/plan-status + /api/paper-performance"
      : "Mock fallback: endpoints unavailable or auth required",
    dataStatus: hasAnyEndpoint ? (stale ? "stale" : "ready") : "error",
    topMetrics,
    agents,
    alerts: buildAlerts(publicHealth, planStatus, paperPerformance, base.alerts),
    trades: buildTrades(paperPerformance, base.trades),
    decisions: buildDecisions(planStatus, paperPerformance, base.decisions),
    cafeLevel: {
      ...base.cafeLevel,
      xp: Math.min(base.cafeLevel.target, base.cafeLevel.xp + Math.min(250, paper.totalPaperFills * 5)),
      reputation: safetyWarning ? "Review required" : base.cafeLevel.reputation,
    },
    placeholders: {
      ...base.placeholders,
      staleTitle: stale ? "Endpoint data may be stale or protected by auth." : "Endpoint data loaded read-only.",
      errorTitle: "Could not load read-only endpoint data; showing mock fallback.",
    },
    safety: {
      phase: "M-0B_BLOCKED",
      liveTradingEnabled: false,
      orderPlacementEnabled: false,
      productionTradingReady: false,
      exchangeManualApproval: "not_approved",
      readOnly: true,
      closedCycles: paper.closedCycles,
      closedCycleLabel,
    },
  };
}
