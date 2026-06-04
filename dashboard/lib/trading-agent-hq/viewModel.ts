// dashboard/lib/trading-agent-hq/viewModel.ts
// TradingAgentHQ — ViewModel types (read-only presentation layer)
// SAFETY: presentation only. No source-of-truth. No order/approval/live flags.
// THQ-4 uses mock data (mockState.ts). THQ-5 will populate from public-safe endpoints.

export type AgentId =
  | "grid_bot"
  | "trend_bot"
  | "risk_manager"
  | "news_analyst"
  | "market_regime"
  | "memory_brain";

export type AgentStatus =
  | "running"
  | "scanning"
  | "guarding"
  | "logging"
  | "alert"
  | "paused"
  | "error"
  | "unknown";

export interface AgentVM {
  id: AgentId;
  /** raw status from bot state (mock in THQ-4) */
  status: AgentStatus;
  /** normalized visual states (priority-resolved) */
  visualStates: string[];
  /** animation key (THQ-6 resolver; static label in THQ-4) */
  animation: string;
  /** short bubble text */
  bubble: string;
  /** inspector fields */
  currentTask: string;
  lastAction: string;
  metric: string | null;
  /** confidence/risk label, never a live-ready claim */
  confidence: string | null;
}

export interface SafetyVM {
  liveTradingEnabled: boolean;
  orderPlacementEnabled: boolean;
  productionTradingReady: boolean;
  exchangeManualApproval: "not_approved" | "approved";
  phase: string; // e.g. "M-0B_BLOCKED"
}

export interface PaperVM {
  totalOrderFilled: number;
  closedCycles: number;
  /** honest sample status — never fake PASS */
  sampleStatus: "INSUFFICIENT_SAMPLE" | "SUFFICIENT" | "UNKNOWN";
  paperModeDetected: boolean;
  /** DATA_GAP when closedCycles === 0 */
  edgeStatus: "DATA_GAP" | "REAL_FILLS_ACCUMULATING" | "UNKNOWN";
  /** cost gate status from public-safe performance payload; never means edge/live-ready */
  costGateStatus: "PASS" | "WARNING" | "FAIL" | "UNKNOWN";
  dynamicRegrid: DynamicRegridVM;
  runtimeMonitor: RuntimeMonitorVM;
}

export interface DynamicRegridCandidateVM {
  candidateStatus: string | null;
  candidateReason: string | null;
  cooldownRemaining: number | null;
  stableCandleCount: number | null;
  activationAllowed: boolean | null;
}

export interface DynamicRegridVM {
  marketMode: string | null;
  regime: string | null;
  priceVsGrid: string | null;
  paperLoopState: string | null;
  lastNoTradeReason: string | null;
  currentPrice: number | null;
  gridLower: number | null;
  gridUpper: number | null;
  gridMid: number | null;
  buyFillCount: number;
  sellFillCount: number;
  closedCycles: number;
  candidate: DynamicRegridCandidateVM;
}

export interface RuntimeMonitorVM {
  cumulativeBuyFillCount: number;
  cumulativeSellFillCount: number;
  sampleBuyFillCount: number;
  sampleSellFillCount: number;
  paperNoTradeCount: number;
  regridCandidateCount: number;
  latestFillAt: string | null;
  latestNoTradeAt: string | null;
  latestRegridCandidateAt: string | null;
  buyCountStable: boolean;
  noTradeIncreasing: boolean;
  regridCandidateIncreasing: boolean;
  activationAllowed: boolean | null;
  priceVsGrid: string | null;
  paperLoopState: string | null;
  monitorStatus: "PASS" | "WATCH" | "UNKNOWN";
  monitorSummary: string | null;
}

export interface TopHudVM {
  marketMood: string; // "UNKNOWN" allowed
  simEquity: number | null;
  dailyPnl: number | null;
  riskHeat: string; // "UNKNOWN" allowed
  agentsActive: number;
}

export interface LogEntry {
  ts: string;
  type: "FILL_RESULT" | "ALERT" | "DECISION" | "SYSTEM";
  text: string;
  agentId?: AgentId;
}

export interface MetaVM {
  lastUpdate: string;
  source: "public-safe-api" | "mock";
  isStale: boolean;
}

export interface TradingAgentHQViewModel {
  mode: "trading_agent_hq";
  meta: MetaVM;
  safety: SafetyVM;
  paper: PaperVM;
  topHud: TopHudVM;
  bottomLog: LogEntry[];
  agents: Record<AgentId, AgentVM>;
}
