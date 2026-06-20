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
  costGateBreakdown: CostGateBreakdownVM;
  dynamicRegrid: DynamicRegridVM;
  runtimeMonitor: RuntimeMonitorVM;
  regridReadiness: RegridReadinessVM;
  paperEpoch: PaperEpochVM;
  regimeEvidence: RegimeEvidenceVM;
  indicatorGate: IndicatorGateVM;
  canonicalMarketRegime: CanonicalMarketRegimeVM;
  regimeDiagnostic: RegimeDiagnosticVM;
  volBaselineDiagnostic: VolBaselineDiagnosticVM;
  eventRiskContext: EventRiskContextVM;
  regimeTransitionDiagnostic: RegimeTransitionDiagnosticVM;
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
  reviewReadinessScore: ReviewReadinessScoreVM;
  operatorSummary: OperatorSummaryVM;
  mtfEntryCandidatePipeline: MtfEntryCandidatePipelineVM;
  mtfExactZoneFailureAttribution: MtfExactZoneFailureAttributionVM;
  currentPriceEligibleExactSubset: CurrentPriceEligibleExactSubsetVM;
  currentPriceConsistencyAudit: CurrentPriceConsistencyAuditVM;
  regimeAwareExactCandidateWatchlist: RegimeAwareExactCandidateWatchlistVM;
  entryCandidateResolution: EntryCandidateResolutionVM;
  resolverDrivenPullbackGate: ResolverDrivenPullbackGateVM;
  pullbackTriggerThresholds: PullbackTriggerThresholdsVM;
  shadowEvidenceCoverage: ShadowEvidenceCoverageVM | null;
  noTradeReasonAnalysis: NoTradeReasonAnalysisVM | null;
  // T-3H-6-a: read-only rejection/decision frequency summary (observability only)
  trendEvidenceDecisionSummary: TrendEvidenceDecisionSummaryVM;
  // T-3H-6-b: non-secret display config for RR drilldown (read-only exposure; env is still the source)
  trendPaperConfigPublic: TrendPaperConfigPublicVM;
}

// T-3H-6-b — display-only copy of non-secret strategy params (never editable from UI).
export interface TrendPaperConfigPublicVM {
  minRewardRisk: number | null;
  feePct: number | null;
  slippagePct: number | null;
}

export interface OperatorSummaryVM {
  currentPrice: number | null;
  freshnessStatus: string;
  latestCandleAt: string | null;
  regime: string | null;
  direction: string | null;
  confidence: number | null;
  reviewSamplesUsed: number | null;
  reviewTargetSamples: number;
  reviewSampleGatePassed: boolean;
  lifetimeExactSamples: number | null;
  windowExactSamples: number | null;
  currentPriceEligibleExactSamples: number | null;
  cleanCurrentPriceEligibleSamples: number | null;
  watchlistStatus: string;
  cleanReviewCandidates: number;
  trendSetupDirection: string | null;
  trendSetupStatus: string | null;
  trendRiskStatus: string | null;
  trendEntryZone: [number, number] | null;
  trendPriceMoveRequiredDirection: string | null;
  nearCandidateDirection: string | null;
  nearCandidateDirectionAlignment: string | null;
  nearCandidateQualityStatus: string | null;
  candidateInterpretation: string;
  mainBlocker: string;
  nextAction: string;
  pullbackGate: {
    pullbackGateStatus: string;
    alignedDirection: string;
    priceDistanceToZonePct: number | null;
    bestRR: number | null;
    rrThreshold: number | null;
    confirmationStatus: string;
    nextAction: string;
  };
  pullbackTrigger: {
    status: string;
    triggerPrice: number | null;
    rawZoneTriggerPrice: number | null;
    distanceToTriggerAbs: number | null;
    distanceToTriggerPct: number | null;
    rrReady: boolean;
    promotionBlockedBy: string[];
    nextAction: string;
  };
  safety: {
    reviewOnly: boolean;
    activationAllowed: boolean;
    paperActivationAllowed: boolean;
    liveActivationAllowed: boolean;
    orderAllowed: boolean;
    shadowOnly: boolean;
  };
}

export interface EntryCandidateResolutionVM {
  schemaVersion: number;
  source: string;
  entryResolutionStatus: string;
  alignedDirection: string;
  priceLocation: string;
  currentPrice: number | null;
  alignedEntryZone: [number, number] | null;
  rrBest: number | null;
  rrThreshold: number | null;
  rrThresholdSource: string;
  rejectedOppositeCount: number;
  nextAction: string;
  blockers: string[];
  doNotDo: string[];
  detailsCollapsedByDefault: true;
  rrScenarios: Array<{
    name: string;
    available: boolean;
    direction: string;
    entry: number | null;
    stopLoss: number | null;
    target: number | null;
    riskDistance: number | null;
    rewardDistance: number | null;
    rr: number | null;
    meetsThreshold: boolean;
    sources: string[];
    notes: string[];
  }>;
  rejectedOppositeCandidates: Array<{
    id: string;
    direction: string;
    entry: number | null;
    stopLoss: number | null;
    target1: number | null;
    currentPriceStatus: string;
    qualityStatus: string;
    actionability: string;
    blockers: string[];
    doNotUseAsEntry: boolean;
  }>;
  activationAllowed: boolean;
  paperActivationAllowed: boolean;
  liveActivationAllowed: boolean;
  reviewOnly: boolean;
  shadowOnly: boolean;
}

export interface ResolverDrivenPullbackGateVM {
  schemaVersion: number;
  source: string;
  readiness: string;
  status: string;
  alignedDirection: string;
  currentPrice: number | null;
  zone: [number, number] | null;
  zoneTolerance: number | null;
  priceDistanceToZonePct: number | null;
  bestRR: number | null;
  rrThreshold: number | null;
  rrStatus: string;
  confirmationStatus: string;
  blockers: string[];
  nextAction: string;
  doNotDo: string[];
  detailsCollapsedByDefault: true;
  activationAllowed: boolean;
  paperActivationAllowed: boolean;
  liveActivationAllowed: boolean;
  reviewOnly: boolean;
  shadowOnly: boolean;
}

export interface PullbackTriggerThresholdsVM {
  schemaVersion: number;
  source: string;
  readiness: string;
  status: string;
  alignedDirection: string;
  currentPrice: number | null;
  rawZoneLow: number | null;
  rawZoneHigh: number | null;
  expandedZoneLow: number | null;
  expandedZoneHigh: number | null;
  triggerPrice: number | null;
  rawZoneTriggerPrice: number | null;
  distanceToTriggerAbs: number | null;
  distanceToTriggerPct: number | null;
  bestRR: number | null;
  rrThreshold: number | null;
  rrReady: boolean;
  confirmationRequired: boolean;
  promotionBlockedBy: string[];
  nextAction: string;
  activationAllowed: boolean;
  paperActivationAllowed: boolean;
  liveActivationAllowed: boolean;
  reviewOnly: boolean;
  shadowOnly: boolean;
}

export interface CostGateBreakdownVM {
  roundTripCostPct: number | null;
  gridSpacingPct: number | null;
  gridSpacingSource: string | null;
  requiredMinSpacingPct: number | null;
  pass: boolean | null;
  warning: boolean | null;
  nextAction: string | null;
  feeEstimateTotal: number | null;
  slippageEstimateTotal: number | null;
  fundingEstimateTotal: number | null;
  feePctConfig: number | null;
  slippagePctConfig: number | null;
  status: "NO_DATA" | "PASS" | "WARNING" | "FAIL" | "UNKNOWN";
  spacingBufferRatio: number | null;
  feeGrindRisk: "NO_DATA" | "HEALTHY_BUFFER" | "THIN_BUFFER" | "FEE_GRIND_RISK" | "COST_GATE_FAIL";
}

export interface ReviewReadinessDimensionVM {
  status: string;
  score: number;
  weight: number;
  weightedScore: number;
  drivers: string[];
}

export interface ShadowEvidenceCoverageRequirementVM {
  id: string;
  met: boolean;
  current: number;
  target: number;
  remaining: number;
  unit: string;
  note: string;
}

export interface ShadowEvidenceCoverageVM {
  status: string;
  coverageScore: number;
  requirementsMet: number;
  requirementsTotal: number;
  requirements: ShadowEvidenceCoverageRequirementVM[];
  nextEvidenceMilestone: {
    id: string;
    remaining: number;
    unit: string;
    description: string;
  } | null;
}

export interface NoTradeReasonAnalysisVM {
  status: string;
  activationAllowed: boolean;
  reviewOnly: boolean;
  activationBlocked: boolean;
  gridBlocked: boolean;
  trendBlocked: boolean;
  diagnosticsGap: boolean;
  primaryReason: { code: string; category: string; label: string } | null;
  tag: string | null;
}

export interface ReviewReadinessScoreVM {
  available: boolean;
  overallScore: number | null;
  overallStatus: string | null;
  scoreType: string | null;
  tag: string | null;
  activationAllowed: boolean | null;
  reviewOnly: boolean | null;
  disclaimer: string | null;
  dimensions: Record<"grid" | "shadow" | "trend" | "noTradeExplanation", ReviewReadinessDimensionVM>;
}

export interface MtfEntryCandidatePipelineVM {
  schemaVersion: number;
  source: string;
  status: string;
  readiness: string;
  activationAllowed: boolean;
  paperActivationAllowed: boolean;
  liveActivationAllowed: boolean;
  reviewOnly: boolean;
  shadowOnly: boolean;
  htfBias: {
    status: string;
    confidence: number | null;
    source: string;
    reasons: string[];
    warnings: string[];
  };
  zoneCandidate: {
    status: string;
    exactSamples: number;
    windowExactSamples: number | null;
    lifetimeExactSamples: number | null;
    reviewSamplesUsed: number | null;
    requiredExactSamples: number;
    samplesRemaining: number;
    sampleCountMeaning: string;
    reviewSampleGatePassed: boolean;
    exactAvgNetRR: number | null;
    heuristicAvgNetRR: number | null;
    exactVsHeuristicDelta: number | null;
    usesExactObFvgZonesCount: number;
    dominantExactStatus: string | null;
    dominantExactReadiness: string | null;
    warningFlags: string[];
  };
  triggerReview: {
    status: string;
    entryTouched: number;
    entryTouchRate: number | null;
    entryNotReached: number;
    entryNotReachedRate: number | null;
    targetAfterEntryTouchRate: number | null;
    invalidationAfterEntryTouchRate: number | null;
    pending: number;
  };
  geometry: {
    status: string;
    geometryReady: number;
    noGeometry: number;
    fillResolutionStatus: string | null;
    missedFillRate: number | null;
    pending: number;
    notes: string[];
  };
  currentPriceContext: {
    currentPrice: number | null;
    priceSource: string | null;
    latestCandleAt: string | null;
    snapshotGeneratedAt: string | null;
    freshnessStatus: string;
    ageSeconds: number | null;
    reevaluationRequired: boolean;
    notes: string[];
  };
  currentCandidateReevaluation: {
    status: string;
    previousAnalysisPrice: number | null;
    currentPrice: number | null;
    priceMovePct: number | null;
    reason: string;
  };
  sampleAccounting: {
    lifetimeExactSamples: number | null;
    windowExactSamples: number | null;
    currentPriceEligibleExactSamples: number | null;
    reviewTargetSamples: number;
    reviewSamplesUsed: number | null;
    reviewSamplesRemaining: number | null;
    sampleSource: string;
    isMonotonicExpected: boolean;
    canDecrease: boolean;
    explanation: string;
    warnings: string[];
  };
  verdict: {
    status: string;
    summary: string;
    blockers: string[];
    nextAction: string;
  };
}

// T-3H-6-a — aggregated view of the append-only decision log. Pure display data.
export interface MtfExactZoneFailureAttributionVM {
  schemaVersion: number;
  source: string;
  status: string;
  readiness: string;
  activationAllowed: boolean;
  paperActivationAllowed: boolean;
  liveActivationAllowed: boolean;
  reviewOnly: boolean;
  shadowOnly: boolean;
  sample: {
    lifetimeExactSamples: number | null;
    windowExactSamples: number | null;
    currentPriceEligibleExactSamples: number | null;
    reviewTargetSamples: number;
    sampleGatePassed: boolean;
    sampleInterpretation: string;
  };
  geometryEdge: {
    exactAvgNetRR: number | null;
    heuristicAvgNetRR: number | null;
    delta: number | null;
    ratio: number | null;
    status: string;
  };
  failureRates: {
    targetTooCloseRate: number | null;
    missedFillRate: number | null;
    entryTouchRate: number | null;
    targetAfterTouchRate: number | null;
    invalidationAfterTouchRate: number | null;
  };
  failureAttribution: {
    dominantFailures: Array<{
      code: string;
      severity: string;
      evidence: string[];
      interpretation: string;
    }>;
  };
  cleanSubsetGate: {
    status: string;
    passed: string[];
    failed: string[];
    thresholds: {
      minLifetimeExactSamples: number;
      maxTargetTooCloseRate: number;
      maxMissedFillRate: number;
      minEntryTouchRate: number;
      minTargetAfterTouchRate: number;
      maxInvalidationAfterTouchRate: number;
      currentPriceEligibleRequired: boolean;
    };
  };
  nextAction: {
    primary: string;
    reviewTasks: string[];
    doNotDo: string[];
  };
}

export interface CurrentPriceEligibleExactSubsetVM {
  schemaVersion: number;
  source: string;
  status: string;
  readiness: string;
  activationAllowed: boolean;
  paperActivationAllowed: boolean;
  liveActivationAllowed: boolean;
  reviewOnly: boolean;
  shadowOnly: boolean;
  currentPrice: {
    value: number | null;
    source: string | null;
    latestCandleAt: string | null;
    freshnessStatus: string;
    ageSeconds: number | null;
  };
  sampleAccounting: {
    lifetimeExactSamples: number | null;
    windowExactSamples: number | null;
    currentPriceEligibleExactSamples: number | null;
    cleanCurrentPriceEligibleSamples: number | null;
    geometryInputSamples: number | null;
    geometryMissingSamples: number | null;
  };
  eligibilityFilters: {
    totalCandidates: number;
    freshCandidates: number;
    currentPriceInsideOrNearEntry: number;
    missedCandidates: number;
    invalidatedCandidates: number;
    targetTooCloseCandidates: number;
    costTooHighCandidates: number;
    cleanCandidates: number;
  };
  cleanSubsetGate: {
    status: string;
    passed: string[];
    failed: string[];
    thresholds: {
      minCleanEligibleCandidates: number;
      maxTargetTooCloseRate: number;
      maxMissedFillRate: number;
      minEntryTouchRate: number;
      minTargetAfterTouchRate: number;
      maxInvalidationAfterTouchRate: number;
      requireFreshCurrentPrice: boolean;
      requireStructuredGeometry: boolean;
    };
  };
  topCandidates: Array<{
    id: string;
    direction: string;
    zoneType: string | null;
    readiness: string | null;
    status: string;
    currentPriceStatus: string;
    qualityStatus: string;
    entry: number | null;
    entryLow: number | null;
    entryHigh: number | null;
    stopLoss: number | null;
    target1: number | null;
    target2: number | null;
    netRR: number | null;
    distanceToEntryPct: number | null;
    distanceToEntryAbs: number | null;
    priceMoveRequiredDirection: string;
    occurrenceCount: number;
    representativeStopLoss: number | null;
    stopLossRange: [number, number] | null;
    duplicateGroupSize: number;
    flags: string[];
    reason: string;
  }>;
  compactTopCandidates: CurrentPriceEligibleExactSubsetVM["topCandidates"];
  dedupSummary: {
    rawCandidates: number;
    uniqueCandidates: number;
    duplicateCandidates: number;
  };
  priceSourceAudit: {
    subsetPriceSource: string | null;
    snapshotPriceSource: string | null;
    subsetCurrentPrice: number | null;
    snapshotCurrentPrice: number | null;
    previousAnalysisPriceSource: string | null;
    previousAnalysisPrice: number | null;
    previousAnalysisDriftPct: number | null;
    priceSourceConsistent: boolean;
    notes: string[];
  };
  requiredGeometryInputs: string[];
  warnings: string[];
  nextAction: string;
}

export interface CurrentPriceConsistencyAuditVM {
  schemaVersion: number;
  source: string;
  status: string;
  canonicalCurrentPrice: {
    value: number | null;
    source: string | null;
    latestCandleAt: string | null;
    freshnessStatus: string;
    ageSeconds: number | null;
  };
  detectedConsumers: Array<{
    path: string;
    value: number | null;
    source: string | null;
    priceDelta: number | null;
    priceDeltaPct: number | null;
    status: string;
  }>;
  affectedConditions: Array<{
    condition: string;
    previousValue: boolean | null;
    currentPriceBasedValue: boolean | null;
    impact: string;
    explanation: string;
  }>;
  currentPriceReevaluation: {
    trendZoneStatus: string;
    distanceToEntryZonePct: number | null;
    distanceToEntryZoneAbs: number | null;
    priceMoveRequiredDirection: string;
    explanation: string;
  };
  recommendations: string[];
  pricePropagationAudit: {
    staleConsumerCount: number;
    propagatedConsumerCount: number;
    previousAnalysisPriceCount: number;
    notes: string[];
  };
  safety: {
    reviewOnly: boolean;
    activationAllowed: boolean;
    paperActivationAllowed: boolean;
    liveActivationAllowed: boolean;
    orderAllowed: boolean;
  };
}

export interface RegimeAwareExactCandidateWatchlistVM {
  schemaVersion: number;
  source: string;
  status: string;
  readiness: string;
  activationAllowed: boolean;
  paperActivationAllowed: boolean;
  liveActivationAllowed: boolean;
  reviewOnly: boolean;
  shadowOnly: boolean;
  currentMarket: {
    currentPrice: number | null;
    freshnessStatus: string;
    regime: string | null;
    direction: string | null;
    confidence: number | null;
    trendZoneStatus: string | null;
    noZoneReason: string | null;
    latestCandleAt: string | null;
    ageSeconds: number | null;
  };
  watchlistSummary: {
    totalCandidates: number;
    uniqueCandidates: number;
    watchCandidates: number;
    waitingPullbackCandidates: number;
    regimeBlockedCandidates: number;
    qualityRejectedCandidates: number;
    degradedWatchCandidates: number;
    missedCandidates: number;
    invalidatedCandidates: number;
    cleanReviewCandidates: number;
  };
  watchlistDedupSummary: {
    rawWatchCandidates: number;
    uniqueWatchCandidates: number;
    duplicateWatchCandidates: number;
    clusteringTolerance: string;
  };
  compactSummary: {
    currentPrice: number | null;
    freshnessStatus: string;
    regime: string | null;
    direction: string | null;
    watchlistStatus: string;
    cleanReviewCandidates: number;
    nextAction: string;
    topCandidateDisplayLimit: number;
    detailsCollapsedByDefault: boolean;
  };
  topWatchCandidates: Array<{
    id: string;
    direction: string;
    directionAlignment: string;
    actionability: string;
    clean: boolean;
    currentPriceStatus: string;
    qualityStatus: string;
    entry: number | null;
    stopLoss: number | null;
    target1: number | null;
    netRR: number | null;
    distanceToEntryPct: number | null;
    priceMoveRequiredDirection: string;
    occurrenceCount: number;
    representativeStopLoss: number | null;
    stopLossRange: [number, number] | null;
    blockers: string[];
    watchCondition: string;
    doNotDo: string[];
  }>;
  nextTriggerChecklist: {
    regimeRequired: string[];
    priceRequired: string[];
    confirmationRequired: string[];
    qualityRequired: string[];
    dataRequired: string[];
  };
  verdict: {
    status: string;
    summary: string;
    nextAction: string;
  };
}

export interface EventRiskContextVM {
  status: "NO_DATA" | "STALE" | "NORMAL" | "WATCH" | "HIGH_EVENT_RISK" | "UNKNOWN";
  headlineCount: number;
  source: string | null;
  freshness: "fresh" | "stale" | "unknown";
  updatedAt: string | null;
  riskLabel: string | null;
  summary: string | null;
  warning: string | null;
  paperActivationAllowed: boolean;
  liveActivationAllowed: boolean;
}

export interface RegimeTransitionDiagnosticVM {
  status: "NOT_CONFIGURED";
  hasHistoryStore: boolean;
  hysteresisActive: boolean;
  message: string;
  warning: string;
}

// D5.2-c: read-only shadow outcome (counterfactual reachability) evidence — not real trades.
export interface ShadowOutcomeBucketVM {
  totalSetups: number;
  geometryReady: number;
  noGeometry: number;
  pending: number;
  insufficientFutureCandles: number;
  entryNotReached: number;
  invalidationFirst: number;
  entryTouched: number;
  entryTouchRate: number | null;
  entryNotReachedRate: number | null;
  invalidationFirstRate: number | null;
  targetAfterEntryTouchRate: number | null;
  invalidationAfterEntryTouchRate: number | null;
  timeoutAfterEntryTouchRate: number | null;
}
export interface ShadowOutcomeSummaryVM {
  shadowOutcomes: ShadowOutcomeBucketVM;
  splitByCanonicalRegime: Record<string, ShadowOutcomeBucketVM>;
  splitByPriceVsGrid: Record<string, ShadowOutcomeBucketVM>;
  splitByDynamicGridStatus: Record<string, ShadowOutcomeBucketVM>;
  settings: { entryLookahead: number; exitLookahead: number };
}

export interface TrendEvidenceDecisionSummaryVM {
  available: boolean;
  totalRecords: number;
  windowStart: string | null;
  windowEnd: string | null;
  latestRecordedAt: string | null;
  decisionCounts: Record<string, number>;
  gateStatusCounts: Record<string, number>;
  rejectReasonCounts: Record<string, number>;
  topRejectReasons: { reason: string; count: number }[];
  staleCycleEstimate: { expectedCycles: number; observedCycles: number; missedCycles: number } | null;
  lastRejectReasons: string[];
  sampleWarning: boolean;
  exactZoneComparisonSummary: {
    schemaVersion: 1;
    sampleTier: string;
    exactSamples: number;
    heuristicSamples: number;
    exactAvgNetRR: number | null;
    heuristicAvgNetRR: number | null;
    avgExactVsHeuristicDelta: number | null;
    exactPassCount: number;
    exactPassRate: number | null;
    exactDataStatusCounts: Record<string, number>;
    exactReadinessCounts: Record<string, number>;
    usesExactObFvgZonesCount: number;
    fillResolutionInputSamples: number;
    fillResolutionInputMissing: number;
    fillResolutionGeometryReadyCount: number;
    dominantExactStatus: string | null;
    dominantExactReadiness: string | null;
    fillResolution: {
      status: string;
      totalResolvable: number;
      filled: number;
      missed: number;
      pending: number;
      invalidationFirst: number;
      missedFillRate: number | null;
    };
    warningFlags: string[];
    rrMetricScope: string;
    readinessMetricScope: string;
    conflictLabelNote: string | null;
    conflictBreakdown: {
      TARGET_TOO_CLOSE: number;
      COST_TOO_HIGH: number;
      CONFLICTING_MTF: number;
      other: Record<string, number>;
    };
    readiness: string;
    source: string;
  };
  // D5.2-c: read-only shadow outcome evidence (null until resolver summary present)
  shadowOutcomeSummary: ShadowOutcomeSummaryVM | null;
  mtfObFvgShadowSummary: {
    available: boolean;
    totalShadowSamples: number;
    samplesWithRefinement: number;
    samplesWithNoData: number;
    averageCurrentRawRR: number | null;
    averageCurrentNetRR: number | null;
    averageRefinedRawRR: number | null;
    averageRefinedNetRR: number | null;
    averageRrImprovement: number | null;
    averageNetRrImprovement: number | null;
    passStaticCount: number;
    passNetCount: number;
    qualityScoreAverage: number | null;
    classificationCounts: Record<string, number>;
    dataStatusCounts: Record<string, number>;
    exactZoneSamples: number | null;
    exactZoneDataStatusCounts: Record<string, number>;
    exactZoneReadinessCounts: Record<string, number>;
    usesExactObFvgZonesCount: number | null;
    exactAvgNetRR: number | null;
    exactVsHeuristicAvgDelta: number | null;
    latestSnapshot: {
      capturedAt: string | null;
      dataStatus: string | null;
      classification: string | null;
      qualityScore: number | null;
      currentRawRR: number | null;
      currentNetRR: number | null;
      refinedRawRR: number | null;
      refinedNetRR: number | null;
      rrImprovement: number | null;
      netRrImprovement: number | null;
      wouldPassStaticRR: boolean | null;
      wouldPassNetRR: boolean | null;
      requiredRR: number | null;
      usesExactObFvgZones: boolean;
    } | null;
    sampleWarning: boolean;
  };
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
  invalidRiskModelCount: number;
  invalidMissingStopLossCount: number;
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

export interface RegimeDiagnosticVM {
  decisionRegime: string | null;
  canonicalRegime: string | null;
  canonicalDirection: string | null;
  canonicalConfidence: number | null;
  canonicalSource: string | null;
  canonicalReasons: string[];
  canonicalComputedAt: string | null;
  decisionRegimeMismatch: boolean;
  regimeNullButCanonicalAvailable: boolean;
  status: "NO_CANONICAL_DATA" | "MATCHED" | "DECISION_REGIME_NULL_CANONICAL_AVAILABLE" | "MISMATCH" | "LOW_CONFIDENCE" | "UNKNOWN";
  paperActivationAllowed: boolean;
  liveActivationAllowed: boolean;
}

export interface VolBaselineDiagnosticVM {
  volState: string | null;
  confidence: number | null;
  baselineSamples1h: number | null;
  requiredBaselineSamples: number | null;
  baselineProgressPct: number | null;
  baselineReadiness: "NO_DATA" | "INSUFFICIENT" | "BUILDING" | "READY";
  warning: string | null;
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
