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
  canonicalRegimeGate: CanonicalRegimeGateVM;
  regridReadinessBeforeCanonicalGate: RegridReadinessVM;
  regridReadinessAfterCanonicalGate: RegridReadinessVM;
  canonicalRegimeGateShadowCompare: CanonicalRegimeGateShadowCompareVM;
  canonicalRegimeGateEnforcement: CanonicalRegimeGateEnforcementVM;
  trendZoneCandidate: TrendZoneCandidateVM | null;
  trendStrategy: TrendStrategyVM;
  trendPaperEpoch: TrendPaperEpochVM;
  trendTransitionMonitor: TrendTransitionMonitorVM;
  trendManualPaperArmGate: TrendManualPaperArmGateVM;
  trendPaperExecutionPreflight: TrendPaperExecutionPreflightVM;
  trendPaperExecutionEngine: TrendPaperExecutionEngineVM;
  trendEdgeReview: TrendEdgeReviewVM;
  trendPaperArmSession: TrendPaperArmSessionVM;
  trendPaperArmIntentBridge: TrendPaperArmIntentBridgeVM;
  trendPaperEvidenceRunner: TrendPaperEvidenceRunnerVM;
}

export interface TrendPaperEvidenceRunnerVM {
  evidencePhase: string;
  enabled: boolean;
  simulationEnabled: boolean;
  evidenceRunnerEnabled: boolean;
  lastRunAt: string | null;
  lastDecision: string | null;
  lastGateStatus: string | null;
  lastRejectReasons: string[];
  dailyEntryCount: number;
  maxEntriesPerDay: number;
  dailyLossR: number;
  cooldownUntil: string | null;
  openTrendPosition: { positionId: string | null; direction: string | null } | null;
  trendClosedTrades: number;
  targetClosedTrades: number;
  sampleStatus: string;
  winRate: number | null;
  expectancyR: number | null;
  profitFactor: number | null;
  maxDrawdownR: number | null;
  maxConsecutiveLossesObserved: number | null;
  readyForNextPhase: boolean;
  stopReason: string | null;
  liveActivationAllowed: boolean;
  exchangeOrderAllowed: boolean;
}

export interface TrendPaperArmIntentBridgeVM {
  rawStatus: string | null;
  effectiveStatus: string | null;
  source: "RAW_GATE" | "SESSION_ARM_INTENT" | "SESSION_MISSING" | "SESSION_EXPIRED" | "SESSION_NOT_ACTIVE" | "SESSION_LIMIT_REACHED" | "SESSION_NO_ARM_INTENT" | "UNKNOWN";
  upgradedToArmed: boolean;
  paperArmIntentRequested: boolean;
  reasons: string[];
  paperActivationAllowed: boolean;
  liveActivationAllowed: boolean;
}

export interface TrendPaperArmSessionVM {
  present: boolean;
  status: "INACTIVE" | "ACTIVE" | "EXPIRED" | "REVOKED" | "LIMIT_REACHED" | "MISSING" | "UNKNOWN";
  sessionId: string | null;
  direction: "LONG" | "SHORT" | "ANY" | null;
  symbol: string | null;
  startedAt: string | null;
  expiresAt: string | null;
  timeRemainingMs: number | null;
  maxEntries: number | null;
  usedEntries: number | null;
  remainingEntries: number | null;
  maxRiskPerTradePct: number | null;
  maxSessionRiskPct: number | null;
  active: boolean;
  paperOnly: boolean;
  liveActivationAllowed: boolean;
  exchangeOrderAllowed: boolean;
}

export interface TrendPaperExecutionEngineVM {
  enabled: boolean;
  mode: "PAPER_SIMULATION_ONLY" | "UNKNOWN";
  lastAction: "NO_ACTION" | "CREATE_PAPER_ENTRY" | "CREATE_PAPER_EXIT" | "CREATE_PAPER_CANCEL" | "UNKNOWN";
  lastReason: string | null;
  openTrendPaperPosition: {
    positionId: string | null;
    setupId: string | null;
    direction: "LONG" | "SHORT" | null;
    status: "OPEN" | "PARTIAL_TP1" | "CLOSED" | "CANCELLED" | "UNKNOWN";
    entryPrice: number | null;
    stopLoss: number | null;
    takeProfit1: number | null;
    takeProfit2: number | null;
    quantityPaper: number | null;
    remainingQuantityPaper: number | null;
    openedAt: string | null;
  } | null;
  lastEntryAt: string | null;
  lastExitAt: string | null;
  trendPaperClosedTrades: number;
  winRate: number | null;
  netExpectancyAfterCosts: number | null;
  paperOnly: boolean;
  liveActivationAllowed: boolean;
  exchangeOrderAllowed: boolean;
}

export interface TrendEdgeReviewVM {
  phase: "T-4_EDGE_REVIEW" | "UNKNOWN";
  status: "NO_DATA" | "INSUFFICIENT_DATA" | "EARLY_SAMPLE" | "USABLE_SAMPLE" | "REVIEW_SAMPLE" | "PRODUCTION_CANDIDATE_REVIEW" | "UNKNOWN";
  trendClosedTrades: number;
  sampleTier: "none" | "early" | "usable" | "review" | "production_candidate" | "unknown";
  winRate: number | null;
  averageWinR: number | null;
  averageLossR: number | null;
  expectancyR: number | null;
  netExpectancyAfterCosts: number | null;
  profitFactor: number | null;
  maxDrawdownR: number | null;
  maxConsecutiveLosses: number | null;
  riskOfRuinEstimate: number | null;
  costDrag: number | null;
  slippageAttribution: number | null;
  fundingAttribution: number | null;
  decision: "HOLD" | "CONTINUE_PAPER" | "PARAMETER_REVIEW" | "PAUSE_STRATEGY" | "READY_FOR_LIMITED_CANARY_REVIEW" | "UNKNOWN";
  paperActivationAllowed: boolean;
  liveActivationAllowed: boolean;
  notes: string[];
}

export interface TrendPaperExecutionPreflightVM {
  phase: "T-3_PREFLIGHT" | "UNKNOWN";
  status: "NOT_READY" | "READY_FOR_PAPER_SIMULATION_REVIEW" | "BLOCKED" | "EXPIRED" | "INVALIDATED" | "UNKNOWN";
  requiredInputs: string[];
  passedInputs: string[];
  failedInputs: string[];
  setupId: string | null;
  direction: "LONG" | "SHORT" | null;
  entry: number | null;
  stopLoss: number | null;
  takeProfit1: number | null;
  takeProfit2: number | null;
  rewardRisk: number | null;
  paperArmAllowed: boolean;
  paperActivationAllowed: boolean;
  liveActivationAllowed: boolean;
  journalWriteAllowed: boolean;
  simulatedFillAllowed: boolean;
  notes: string[];
}

export interface TrendManualPaperArmGateVM {
  phase: "T-2_DESIGN" | "T-2_READY_FOR_OPERATOR" | "T-2_ARMED" | "T-2_REJECTED" | "T-2_EXPIRED" | "UNKNOWN";
  status: "NOT_READY" | "READY_FOR_OPERATOR_REVIEW" | "OPERATOR_ARMED_PAPER_ONLY" | "REJECTED_BY_OPERATOR" | "EXPIRED" | "BLOCKED" | "UNKNOWN";
  requiredConditions: string[];
  passedConditions: string[];
  failedConditions: string[];
  operatorActionRequired: boolean;
  setupId: string | null;
  expiryAt: string | null;
  paperActivationAllowed: boolean;
  liveActivationAllowed: boolean;
  notes: string[];
}

export interface TrendTransitionMonitorVM {
  status: "IDLE_NO_TRADE" | "WATCHING_PULLBACK" | "ENTRY_ZONE_REACHED" | "AWAITING_CONFIRMATION" | "RISK_REJECTED" | "SETUP_INVALIDATED" | "REGIME_CHANGED" | "SAFETY_BLOCK" | "UNKNOWN";
  severity: "info" | "watch" | "warning" | "critical";
  message: string | null;
  operatorAction: string | null;
  shouldNotifyOperator: boolean;
  checkedAt: string | null;
  watchedFields: {
    trendStatus: string | null;
    riskStatus: string | null;
    direction: "LONG" | "SHORT" | null;
    currentPrice: number | null;
    entryZone: [number, number] | null;
    invalidation: number | null;
    target1: number | null;
    rewardRisk: number | null;
  };
  paperActivationAllowed: boolean;
  liveActivationAllowed: boolean;
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

export interface TrendStrategyVM {
  enabled: boolean;
  phase: "T-1_SHADOW" | "UNKNOWN";
  status: "NO_TRADE" | "WATCHING_PULLBACK" | "SETUP_READY" | "AWAITING_CONFIRMATION" | "RISK_REJECTED" | "INVALIDATED" | "UNKNOWN";
  direction: "LONG" | "SHORT" | null;
  setupReason: string | null;
  entryZone: [number, number] | null;
  currentPrice: number | null;
  distanceToEntryZonePct: number | null;
  invalidation: number | null;
  target1: number | null;
  target2: number | null;
  rewardRisk: number | null;
  confirmationRequired: boolean;
  confirmationStatus: "NOT_REQUIRED" | "WAITING_5M_CONFIRM" | "CONFIRMED" | "FAILED" | "INSUFFICIENT_DATA" | "UNKNOWN";
  riskStatus: "PASS" | "NO_TRADE_NEAR_TARGET" | "NO_TRADE_BAD_RR" | "NO_TRADE_STALE_DATA" | "NO_TRADE_VOLATILITY" | "NO_TRADE_CONFLICTING_FLOW" | "NO_TRADE_OLD_EXPOSURE" | "UNKNOWN";
  oldExposurePolicy: "QUARANTINE_OLD_GRID_EXPOSURE" | "UNKNOWN";
  countTowardGridClosedCycles: boolean;
  countTowardTrendEvidence: boolean;
  paperActivationAllowed: boolean;
  liveActivationAllowed: boolean;
  shadowOnly: boolean;
  reasons: string[];
  warnings: string[];
}

export interface TrendPaperEpochVM {
  epochId: string | null;
  source: "TREND_STRATEGY" | "UNKNOWN";
  phase: "T-1_SHADOW" | "UNKNOWN";
  status: TrendStrategyVM["status"];
  direction: TrendStrategyVM["direction"];
  oldGridExposurePolicy: "QUARANTINE_OLD_GRID_EXPOSURE" | "UNKNOWN";
  countTowardGridClosedCycles: boolean;
  countTowardTrendEvidence: boolean;
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

export interface CanonicalRegimeGateVM {
  status: "PASSIVE_SHADOW" | "BLOCK_NEUTRAL_GRID" | "TREND_CHECK_REQUIRED" | "NO_TRADE_REQUIRED" | "UNKNOWN_DATA_BLOCK" | "VOLATILITY_BLOCK";
  blocking: boolean;
  downgradeOnly: boolean;
  reasons: string[];
  warnings: string[];
  affectedModes: string[];
  paperActivationAllowed: boolean;
  liveActivationAllowed: boolean;
}

export interface CanonicalRegimeGateShadowCompareVM {
  changed: boolean;
  downgradeReason: string | null;
}

export interface CanonicalRegimeGateEnforcementVM {
  enabled: boolean;
  mode: "STRICTER_ONLY" | "UNKNOWN";
  activeReadinessSource: "regridReadinessAfterCanonicalGate" | "UNKNOWN";
  beforeStatus: RegridReadinessVM["status"];
  afterStatus: RegridReadinessVM["status"];
  changed: boolean;
  downgradeReason: string | null;
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
