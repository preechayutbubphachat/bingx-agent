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
  regridReadiness: RegridReadinessVM;
  paperEpoch: PaperEpochVM;
  regimeEvidence: RegimeEvidenceVM;
  indicatorGate: IndicatorGateVM;
  canonicalMarketRegime: CanonicalMarketRegimeVM;
  trendZoneCandidate: TrendZoneCandidateVM | null;
}

export interface TrendZoneCandidateVM {
  buildStatus: "READY" | "INSUFFICIENT_DATA" | "NOT_TREND" | "FAILED" | "UNKNOWN";
  dir: "UP" | "DOWN" | null;
  pullbackZone: [number, number] | null;
  invalidation: number | null;
  triggerRule: string | null;
  targets: { t1: number | null; t2: number | null };
  entry: { type: "LIMIT" | "CONFIRM" | null; hint: string | null };
  smc: { swingHigh1h: number | null; swingLow1h: number | null; eq1h: number | null; liquidityNote: string | null };
  warnings: string[];
  shadowOnly: boolean;
  paperActivationAllowed: boolean;
  liveActivationAllowed: boolean;
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

export interface RegridReadinessVM {
  status: "NOT_READY" | "WATCH" | "READY_FOR_OPERATOR_REVIEW" | "UNKNOWN";
  score: number;
  passedGates: string[];
  failedGates: string[];
  warnings: string[];
  nextAction: string | null;
  operatorReviewRequired: boolean;
  paperActivationAllowed: boolean;
  liveActivationAllowed: boolean;
}

export interface PaperEpochVM {
  currentEpochId: string | null;
  previousEpochStatus: string | null;
  previousEpochReason: string | null;
  nextEpochCandidateId: string | null;
  nextEpochStatus: string | null;
  oldExposurePolicy: string[];
}

export interface IndicatorGateVM {
  status: "INSUFFICIENT_DATA" | "TREND_DOWN_BLOCK" | "VOLATILITY_BLOCK" | "RECOVERY_WATCH" | "RANGE_WATCH";
  reasons: string[];
  passed: string[];
  failed: string[];
  confidence: "low" | "medium" | "high";
  blocking: boolean;
  paperActivationAllowed: boolean;
  liveActivationAllowed: boolean;
}

export interface CanonicalMarketRegimeVM {
  regime: "RANGE" | "UPTREND" | "DOWNTREND" | "VOLATILITY_EXPANSION" | "VOLATILITY_COMPRESSION" | "EVENT_RISK" | "NO_TRADE" | "UNKNOWN";
  direction: "BULLISH" | "BEARISH" | "NEUTRAL" | "UNKNOWN";
  confidence: number;
  confidenceLabel: "low" | "medium" | "high";
  reasons: string[];
  warnings: string[];
  allowedModes: string[];
  blockedModes: string[];
  sourcePriority: string[];
  ignoredLegacyFields: string[];
  sourceFreshness: {
    status: "fresh" | "stale" | "partial" | "unknown";
    generatedAt: string | null;
    latestCandleAtByTimeframe: Record<string, string | null>;
    warnings: string[];
  };
  evidenceCompleteness: {
    status: "complete" | "partial" | "missing" | "unknown";
    scorePct: number;
    availableGroups: string[];
    missingGroups: string[];
  };
  shadowOnly: boolean;
  paperActivationAllowed: boolean;
  liveActivationAllowed: boolean;
}

export interface EvidenceValueVM {
  value: string | number | boolean | null;
  source: string | null;
}

export interface RegimeEvidenceVM {
  evidenceCompleteness: {
    status: "complete" | "partial" | "missing" | "unknown";
    scorePct: number;
    availableCount: number;
    expectedCount: number;
  };
  sourceFreshness: {
    latestDecisionAt: string | null;
    marketSnapshotAt: string | null;
    planStatusStateAt: string | null;
    warnings: string[];
  };
  decision: {
    marketMode: string | null;
    regime: string | null;
    trendDir: string | null;
    trendTriggerRule: string | null;
    trendInvalidation: string | number | null;
    smcBias: string | null;
    structureState: string | null;
    bos: string | boolean | null;
    choch: string | boolean | null;
    mss: string | boolean | null;
    sweep: string | boolean | null;
    obContext: string | null;
    fvgContext: string | null;
  };
  indicators: {
    adx: EvidenceValueVM;
    plusDI: EvidenceValueVM;
    minusDI: EvidenceValueVM;
    rsi: EvidenceValueVM;
    atr: EvidenceValueVM;
    atrPct: EvidenceValueVM;
    bbw: EvidenceValueVM;
    macd: EvidenceValueVM;
    macdSignal: EvidenceValueVM;
    macdHistogram: EvidenceValueVM;
    emaSlope: EvidenceValueVM;
  };
  indicatorEvidence: {
    source: string | null;
    calculatedAt: string | null;
    candleCount: number;
    timeframe: string | null;
    freshness: {
      latestCandleAt: string | null;
      ageMs: number | null;
    };
    missingFields: string[];
    notes: string[];
  } | null;
  derivatives: {
    oiBias: string | null;
    oiChange: number | null;
    fundingRate: number | null;
    fundingBias: string | null;
    fundingRisk: string | null;
    openInterest: number | null;
    derivativesBias: string | null;
  };
  obGate: {
    status: string | null;
    reason: string | null;
    score: number | null;
    passed: boolean | null;
    blockedReason: string | null;
  };
  missingFields: string[];
  availableFields: string[];
  notes: string[];
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
