// dashboard/lib/trading-agent-hq/adapter.ts
// THQ-5 — map public-safe endpoint payloads → TradingAgentHQ ViewModel.
// PURE mapping (no fetch, no side effects). SAFETY: read-only; never infers live-ready.
// Sources (public-safe only): /api/public-health, /api/paper-status, /api/paper-performance.
// Missing data degrades to UNKNOWN / idle / warning — NEVER fake PASS.

import type {
  TradingAgentHQViewModel, AgentVM, AgentId, AgentStatus, LogEntry, PaperVM, SafetyVM,
  TrendZoneCandidateVM,
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

function mapTrendZoneCandidate(raw: unknown): TrendZoneCandidateVM | null {
  if (!raw || typeof raw !== "object") return null;
  const t = raw as AnyObj;
  const targets = obj(t.targets);
  const entry = obj(t.entry);
  const smc = obj(t.smc);
  const pull = Array.isArray(t.pullbackZone) && t.pullbackZone.length === 2
    ? ([numOrNull(t.pullbackZone[0]), numOrNull(t.pullbackZone[1])] as const)
    : null;
  const buildStatus = str(t.buildStatus, "UNKNOWN");
  const dirRaw = str(t.dir);
  const entryType = str(entry.type);
  return {
    buildStatus: (["READY", "INSUFFICIENT_DATA", "NOT_TREND", "FAILED"].includes(buildStatus)
      ? buildStatus
      : "UNKNOWN") as TrendZoneCandidateVM["buildStatus"],
    dir: dirRaw === "UP" || dirRaw === "DOWN" ? dirRaw : null,
    pullbackZone: pull && pull[0] != null && pull[1] != null ? [pull[0], pull[1]] : null,
    invalidation: numOrNull(t.invalidation),
    triggerRule: strOrNull(t.triggerRule),
    targets: { t1: numOrNull(targets.t1), t2: numOrNull(targets.t2) },
    entry: {
      type: entryType === "LIMIT" || entryType === "CONFIRM" ? entryType : null,
      hint: strOrNull(entry.hint),
    },
    smc: {
      swingHigh1h: numOrNull(smc.swingHigh1h),
      swingLow1h: numOrNull(smc.swingLow1h),
      eq1h: numOrNull(smc.eq1h),
      liquidityNote: strOrNull(smc.liquidityNote),
    },
    warnings: strArray(t.warnings),
    shadowOnly: bool(t.shadowOnly),
    paperActivationAllowed: bool(t.paperActivationAllowed),
    liveActivationAllowed: bool(t.liveActivationAllowed),
  };
}

function mapPaper(status: AnyObj, perf: AnyObj): PaperVM {
  const journal = obj(status.paperJournal);
  const edge = obj(perf.edgeDiagnostics);
  const costGate = obj(perf.costGate);
  const loop = obj(perf.paperLoopDiagnostics);
  const runtimeMonitor = obj(loop.runtimeMonitor);
  const readiness = obj(loop.regridReadiness);
  const readinessBeforeCanonicalGate = obj(loop.regridReadinessBeforeCanonicalGate);
  const readinessAfterCanonicalGateRaw = loop.regridReadinessAfterCanonicalGate;
  const readinessAfterCanonicalGate = obj(readinessAfterCanonicalGateRaw);
  const canonicalRegimeGate = obj(loop.canonicalRegimeGate);
  const canonicalRegimeGateShadowCompare = obj(loop.canonicalRegimeGateShadowCompare);
  const canonicalRegimeGateEnforcement = obj(loop.canonicalRegimeGateEnforcement);
  const trendStrategy = obj(loop.trendStrategy);
  const trendPaperEpoch = obj(loop.trendPaperEpoch);
  const epoch = obj(loop.paperEpoch);
  const indicatorGate = obj(loop.indicatorGate);
  const canonicalRegime = obj(loop.canonicalMarketRegime);
  const regimeDiagnostic = obj(loop.regimeDiagnostic);
  const volBaselineDiagnostic = obj(loop.volBaselineDiagnostic);
  const eventRiskContext = obj(loop.eventRiskContext ?? perf.newsContextSummary);
  const regimeTransitionDiagnostic = obj(loop.regimeTransitionDiagnostic);
  const canonicalFreshness = obj(canonicalRegime.sourceFreshness);
  const canonicalCompleteness = obj(canonicalRegime.evidenceCompleteness);
  const dynamicGrid = obj(loop.dynamicGrid);
  const candidate = obj(dynamicGrid.candidate);
  const regimeEvidence = obj(loop.regimeEvidence);
  const completeness = obj(regimeEvidence.evidenceCompleteness);
  const freshness = obj(regimeEvidence.sourceFreshness);
  const evidenceDecision = obj(regimeEvidence.decision);
  const indicators = obj(regimeEvidence.indicators);
  const indicatorEvidence = obj(regimeEvidence.indicatorEvidence);
  const indicatorFreshness = obj(indicatorEvidence.freshness);
  const derivatives = obj(regimeEvidence.derivatives);
  const obGate = obj(regimeEvidence.obGate);
  const totalOrderFilled = num(journal.totalOrderFilled);
  const closedCycles = num(edge.closedCycles);
  const sampleRaw = str(edge.sampleSizeStatus || perf.sampleSizeStatus, "");
  const sampleStatus: PaperVM["sampleStatus"] =
    sampleRaw === "sufficient" ? "SUFFICIENT"
    : sampleRaw === "insufficient_data" || sampleRaw === "insufficient" ? "INSUFFICIENT_SAMPLE"
    : "UNKNOWN";
  const spacingBufferRatio = costSpacingBufferRatio(costGate);
  const costGatePass = boolOrNull(costGate.pass);
  const costGateWarning = boolOrNull(costGate.warning);
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
    costGateBreakdown: {
      roundTripCostPct: numOrNull(costGate.roundTripCostPct),
      gridSpacingPct: numOrNull(costGate.gridSpacingPct),
      requiredMinSpacingPct: numOrNull(costGate.requiredMinSpacingPct),
      pass: costGatePass,
      warning: costGateWarning,
      nextAction: strOrNull(costGate.nextAction),
      feeEstimateTotal: numOrNull(perf.feeEstimateTotal),
      slippageEstimateTotal: numOrNull(perf.slippageEstimateTotal),
      fundingEstimateTotal: numOrNull(perf.fundingEstimateTotal),
      feePctConfig: numOrNull(obj(loop.trendPaperConfigPublic).feePct),
      slippagePctConfig: numOrNull(obj(loop.trendPaperConfigPublic).slippagePct),
      status: mapCostGateBreakdownStatus(costGate),
      spacingBufferRatio,
      feeGrindRisk: mapFeeGrindRisk({ pass: costGatePass, warning: costGateWarning, spacingBufferRatio }),
    },
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
    regridReadiness: mapRegridReadiness(readiness),
    regridReadinessBeforeCanonicalGate: Object.keys(readinessBeforeCanonicalGate).length
      ? mapRegridReadiness(readinessBeforeCanonicalGate)
      : mapRegridReadiness(readiness),
    regridReadinessAfterCanonicalGate: readinessAfterCanonicalGateRaw == null || !Object.keys(readinessAfterCanonicalGate).length
      ? mapRegridReadiness(readiness)
      : mapRegridReadiness(readinessAfterCanonicalGate),
    canonicalRegimeGate: {
      status: mapCanonicalRegimeGateStatus(str(canonicalRegimeGate.status, "UNKNOWN_DATA_BLOCK")),
      blocking: bool(canonicalRegimeGate.blocking),
      downgradeOnly: canonicalRegimeGate.downgradeOnly === false ? false : true,
      reasons: strArray(canonicalRegimeGate.reasons),
      warnings: strArray(canonicalRegimeGate.warnings),
      affectedModes: strArray(canonicalRegimeGate.affectedModes),
      paperActivationAllowed: bool(canonicalRegimeGate.paperActivationAllowed),
      liveActivationAllowed: bool(canonicalRegimeGate.liveActivationAllowed),
    },
    canonicalRegimeGateShadowCompare: {
      changed: bool(canonicalRegimeGateShadowCompare.changed),
      downgradeReason: strOrNull(canonicalRegimeGateShadowCompare.downgradeReason),
    },
    canonicalRegimeGateEnforcement: {
      enabled: bool(canonicalRegimeGateEnforcement.enabled),
      mode: str(canonicalRegimeGateEnforcement.mode, "UNKNOWN") === "STRICTER_ONLY" ? "STRICTER_ONLY" : "UNKNOWN",
      activeReadinessSource: str(canonicalRegimeGateEnforcement.activeReadinessSource, "UNKNOWN") === "regridReadinessAfterCanonicalGate"
        ? "regridReadinessAfterCanonicalGate"
        : "UNKNOWN",
      beforeStatus: mapRegridReadinessStatus(str(canonicalRegimeGateEnforcement.beforeStatus, str(readinessBeforeCanonicalGate.status, "UNKNOWN"))),
      afterStatus: mapRegridReadinessStatus(str(canonicalRegimeGateEnforcement.afterStatus, str(readinessAfterCanonicalGate.status ?? readiness.status, "UNKNOWN"))),
      changed: bool(canonicalRegimeGateEnforcement.changed),
      downgradeReason: strOrNull(canonicalRegimeGateEnforcement.downgradeReason ?? canonicalRegimeGateShadowCompare.downgradeReason),
      paperActivationAllowed: bool(canonicalRegimeGateEnforcement.paperActivationAllowed),
      liveActivationAllowed: bool(canonicalRegimeGateEnforcement.liveActivationAllowed),
    },
    paperEpoch: {
      currentEpochId: strOrNull(epoch.currentEpochId),
      previousEpochStatus: strOrNull(epoch.previousEpochStatus),
      previousEpochReason: strOrNull(epoch.previousEpochReason),
      nextEpochCandidateId: strOrNull(epoch.nextEpochCandidateId),
      nextEpochStatus: strOrNull(epoch.nextEpochStatus),
      oldExposurePolicy: strArray(epoch.oldExposurePolicy),
    },
    indicatorGate: {
      status: mapIndicatorGateStatus(str(indicatorGate.status, "INSUFFICIENT_DATA")),
      reasons: strArray(indicatorGate.reasons),
      passed: strArray(indicatorGate.passed),
      failed: strArray(indicatorGate.failed),
      confidence: mapIndicatorGateConfidence(str(indicatorGate.confidence, "low")),
      blocking: bool(indicatorGate.blocking),
      paperActivationAllowed: bool(indicatorGate.paperActivationAllowed),
      liveActivationAllowed: bool(indicatorGate.liveActivationAllowed),
    },
    canonicalMarketRegime: {
      regime: mapCanonicalRegime(str(canonicalRegime.regime, "UNKNOWN")),
      direction: mapCanonicalDirection(str(canonicalRegime.direction, "UNKNOWN")),
      confidence: num(canonicalRegime.confidence, 0),
      confidenceLabel: mapIndicatorGateConfidence(str(canonicalRegime.confidenceLabel, "low")),
      reasons: strArray(canonicalRegime.reasons),
      warnings: strArray(canonicalRegime.warnings),
      allowedModes: strArray(canonicalRegime.allowedModes),
      blockedModes: strArray(canonicalRegime.blockedModes),
      sourcePriority: strArray(canonicalRegime.sourcePriority),
      ignoredLegacyFields: strArray(canonicalRegime.ignoredLegacyFields),
      sourceFreshness: {
        status: mapCanonicalFreshnessStatus(str(canonicalFreshness.status, "unknown")),
        generatedAt: strOrNull(canonicalFreshness.generatedAt),
        latestCandleAtByTimeframe: mapStringRecord(canonicalFreshness.latestCandleAtByTimeframe),
        warnings: strArray(canonicalFreshness.warnings),
      },
      evidenceCompleteness: {
        status: mapCanonicalCompletenessStatus(str(canonicalCompleteness.status, "unknown")),
        scorePct: num(canonicalCompleteness.scorePct, 0),
        availableGroups: strArray(canonicalCompleteness.availableGroups),
        missingGroups: strArray(canonicalCompleteness.missingGroups),
      },
      shadowOnly: bool(canonicalRegime.shadowOnly),
      paperActivationAllowed: bool(canonicalRegime.paperActivationAllowed),
      liveActivationAllowed: bool(canonicalRegime.liveActivationAllowed),
    },
    regimeDiagnostic: {
      decisionRegime: strOrNull(regimeDiagnostic.decisionRegime),
      canonicalRegime: strOrNull(regimeDiagnostic.canonicalRegime),
      canonicalDirection: strOrNull(regimeDiagnostic.canonicalDirection),
      canonicalConfidence: numOrNull(regimeDiagnostic.canonicalConfidence),
      canonicalSource: strOrNull(regimeDiagnostic.canonicalSource),
      canonicalReasons: strArray(regimeDiagnostic.canonicalReasons),
      canonicalComputedAt: strOrNull(regimeDiagnostic.canonicalComputedAt),
      decisionRegimeMismatch: bool(regimeDiagnostic.decisionRegimeMismatch),
      regimeNullButCanonicalAvailable: bool(regimeDiagnostic.regimeNullButCanonicalAvailable),
      status: mapRegimeDiagnosticStatus(str(regimeDiagnostic.status, "UNKNOWN")),
      paperActivationAllowed: bool(regimeDiagnostic.paperActivationAllowed),
      liveActivationAllowed: bool(regimeDiagnostic.liveActivationAllowed),
    },
    volBaselineDiagnostic: {
      volState: strOrNull(volBaselineDiagnostic.volState),
      confidence: numOrNull(volBaselineDiagnostic.confidence),
      baselineSamples1h: numOrNull(volBaselineDiagnostic.baselineSamples1h),
      requiredBaselineSamples: numOrNull(volBaselineDiagnostic.requiredBaselineSamples),
      baselineProgressPct: numOrNull(volBaselineDiagnostic.baselineProgressPct),
      baselineReadiness: mapVolBaselineReadiness(str(volBaselineDiagnostic.baselineReadiness, "NO_DATA")),
      warning: strOrNull(volBaselineDiagnostic.warning),
    },
    eventRiskContext: mapEventRiskContext(eventRiskContext),
    regimeTransitionDiagnostic: mapRegimeTransitionDiagnostic(regimeTransitionDiagnostic),
    trendZoneCandidate: mapTrendZoneCandidate(loop.trendZoneCandidate),
    trendStrategy: mapTrendStrategy(trendStrategy),
    trendPaperEpoch: {
      epochId: strOrNull(trendPaperEpoch.epochId),
      source: str(trendPaperEpoch.source, "UNKNOWN") === "TREND_STRATEGY" ? "TREND_STRATEGY" : "UNKNOWN",
      phase: str(trendPaperEpoch.phase, "UNKNOWN") === "T-1_SHADOW" ? "T-1_SHADOW" : "UNKNOWN",
      status: mapTrendStrategyStatus(str(trendPaperEpoch.status, "UNKNOWN")),
      direction: mapTrendStrategyDirection(str(trendPaperEpoch.direction, "")),
      oldGridExposurePolicy: str(trendPaperEpoch.oldGridExposurePolicy, "UNKNOWN") === "QUARANTINE_OLD_GRID_EXPOSURE"
        ? "QUARANTINE_OLD_GRID_EXPOSURE"
        : "UNKNOWN",
      countTowardGridClosedCycles: bool(trendPaperEpoch.countTowardGridClosedCycles),
      countTowardTrendEvidence: bool(trendPaperEpoch.countTowardTrendEvidence),
    },
    trendTransitionMonitor: mapTrendTransitionMonitor(obj(loop.trendTransitionMonitor)),
    trendManualPaperArmGate: mapTrendManualPaperArmGate(obj(loop.trendManualPaperArmGate)),
    trendPaperExecutionPreflight: mapTrendPaperExecutionPreflight(obj(loop.trendPaperExecutionPreflight)),
    trendPaperExecutionEngine: mapTrendPaperExecutionEngine(obj(loop.trendPaperExecutionEngine)),
    trendPaperArmSession: mapTrendPaperArmSession(obj(loop.trendPaperArmSession)),
    trendPaperArmIntentBridge: mapTrendPaperArmIntentBridge(obj(loop.trendPaperArmIntentBridge)),
    trendPaperEvidenceRunner: mapTrendPaperEvidenceRunner(obj(loop.trendPaperEvidenceRunner)),
    trendEvidenceDecisionSummary: mapTrendEvidenceDecisionSummary(obj(loop.trendEvidenceDecisionSummary)),
    // T-3H-6-b: non-secret display config (read-only)
    trendPaperConfigPublic: {
      minRewardRisk: numOrNull(obj(loop.trendPaperConfigPublic).minRewardRisk),
      feePct: numOrNull(obj(loop.trendPaperConfigPublic).feePct),
      slippagePct: numOrNull(obj(loop.trendPaperConfigPublic).slippagePct),
    },
    trendEdgeReview: mapTrendEdgeReview(obj(loop.trendEdgeReview)),
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
        macdSignal: mapEvidenceValue(indicators.macdSignal),
        macdHistogram: mapEvidenceValue(indicators.macdHistogram),
        emaSlope: mapEvidenceValue(indicators.emaSlope),
      },
      indicatorEvidence: Object.keys(indicatorEvidence).length
        ? {
            source: strOrNull(indicatorEvidence.source),
            calculatedAt: strOrNull(indicatorEvidence.calculatedAt),
            candleCount: num(indicatorEvidence.candleCount, 0),
            timeframe: strOrNull(indicatorEvidence.timeframe),
            freshness: {
              latestCandleAt: strOrNull(indicatorFreshness.latestCandleAt),
              ageMs: numOrNull(indicatorFreshness.ageMs),
            },
            missingFields: strArray(indicatorEvidence.missingFields),
            notes: strArray(indicatorEvidence.notes),
          }
        : null,
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

function mapTrendStrategy(raw: AnyObj): PaperVM["trendStrategy"] {
  const zone = Array.isArray(raw.entryZone) && raw.entryZone.length === 2
    ? ([numOrNull(raw.entryZone[0]), numOrNull(raw.entryZone[1])] as const)
    : null;
  return {
    enabled: bool(raw.enabled),
    phase: str(raw.phase, "UNKNOWN") === "T-1_SHADOW" ? "T-1_SHADOW" : "UNKNOWN",
    status: mapTrendStrategyStatus(str(raw.status, "UNKNOWN")),
    direction: mapTrendStrategyDirection(str(raw.direction, "")),
    setupReason: strOrNull(raw.setupReason),
    entryZone: zone && zone[0] != null && zone[1] != null ? [zone[0], zone[1]] : null,
    currentPrice: numOrNull(raw.currentPrice),
    distanceToEntryZonePct: numOrNull(raw.distanceToEntryZonePct),
    invalidation: numOrNull(raw.invalidation),
    target1: numOrNull(raw.target1),
    target2: numOrNull(raw.target2),
    rewardRisk: numOrNull(raw.rewardRisk),
    confirmationRequired: bool(raw.confirmationRequired),
    confirmationStatus: mapTrendConfirmationStatus(str(raw.confirmationStatus, "UNKNOWN")),
    riskStatus: mapTrendRiskStatus(str(raw.riskStatus, "UNKNOWN")),
    oldExposurePolicy: str(raw.oldExposurePolicy, "UNKNOWN") === "QUARANTINE_OLD_GRID_EXPOSURE"
      ? "QUARANTINE_OLD_GRID_EXPOSURE"
      : "UNKNOWN",
    countTowardGridClosedCycles: bool(raw.countTowardGridClosedCycles),
    countTowardTrendEvidence: bool(raw.countTowardTrendEvidence),
    paperActivationAllowed: bool(raw.paperActivationAllowed),
    liveActivationAllowed: bool(raw.liveActivationAllowed),
    shadowOnly: bool(raw.shadowOnly),
    reasons: strArray(raw.reasons),
    warnings: strArray(raw.warnings),
  };
}

function mapTrendPaperExecutionPreflight(raw: AnyObj): PaperVM["trendPaperExecutionPreflight"] {
  const statusRaw = str(raw.status, "UNKNOWN");
  const validStatus = ["NOT_READY", "READY_FOR_PAPER_SIMULATION_REVIEW", "BLOCKED", "EXPIRED", "INVALIDATED"];
  const dirRaw = str(raw.direction);
  return {
    phase: str(raw.phase, "UNKNOWN") === "T-3_PREFLIGHT" ? "T-3_PREFLIGHT" : "UNKNOWN",
    status: (validStatus.includes(statusRaw) ? statusRaw : "UNKNOWN") as PaperVM["trendPaperExecutionPreflight"]["status"],
    requiredInputs: strArray(raw.requiredInputs),
    passedInputs: strArray(raw.passedInputs),
    failedInputs: strArray(raw.failedInputs),
    setupId: strOrNull(raw.setupId),
    direction: dirRaw === "LONG" || dirRaw === "SHORT" ? dirRaw : null,
    entry: numOrNull(raw.entry),
    stopLoss: numOrNull(raw.stopLoss),
    takeProfit1: numOrNull(raw.takeProfit1),
    takeProfit2: numOrNull(raw.takeProfit2),
    rewardRisk: numOrNull(raw.rewardRisk),
    paperArmAllowed: bool(raw.paperArmAllowed),
    paperActivationAllowed: bool(raw.paperActivationAllowed),
    liveActivationAllowed: bool(raw.liveActivationAllowed),
    journalWriteAllowed: bool(raw.journalWriteAllowed),
    simulatedFillAllowed: bool(raw.simulatedFillAllowed),
    notes: strArray(raw.notes),
  };
}

function mapTrendPaperEvidenceRunner(raw: AnyObj): PaperVM["trendPaperEvidenceRunner"] {
  const op = obj(raw.openTrendPosition);
  const hasOpen = raw.openTrendPosition != null && typeof raw.openTrendPosition === "object";
  return {
    evidencePhase: str(raw.evidencePhase, "DISABLED"),
    enabled: bool(raw.enabled),
    simulationEnabled: bool(raw.simulationEnabled),
    evidenceRunnerEnabled: bool(raw.evidenceRunnerEnabled),
    lastRunAt: strOrNull(raw.lastRunAt),
    lastDecision: strOrNull(raw.lastDecision),
    lastGateStatus: strOrNull(raw.lastGateStatus),
    lastRejectReasons: strArray(raw.lastRejectReasons),
    dailyEntryCount: typeof raw.dailyEntryCount === "number" ? raw.dailyEntryCount : 0,
    maxEntriesPerDay: typeof raw.maxEntriesPerDay === "number" ? raw.maxEntriesPerDay : 3,
    dailyLossR: typeof raw.dailyLossR === "number" ? raw.dailyLossR : 0,
    cooldownUntil: strOrNull(raw.cooldownUntil),
    openTrendPosition: hasOpen ? { positionId: strOrNull(op.positionId), direction: strOrNull(op.direction) } : null,
    trendClosedTrades: typeof raw.trendClosedTrades === "number" ? raw.trendClosedTrades : 0,
    targetClosedTrades: typeof raw.targetClosedTrades === "number" ? raw.targetClosedTrades : 30,
    sampleStatus: str(raw.sampleStatus, "INSUFFICIENT_SAMPLE_BOOTSTRAP"),
    winRate: numOrNull(raw.winRate),
    expectancyR: numOrNull(raw.expectancyR),
    profitFactor: numOrNull(raw.profitFactor),
    maxDrawdownR: numOrNull(raw.maxDrawdownR),
    maxConsecutiveLossesObserved: numOrNull(raw.maxConsecutiveLossesObserved),
    readyForNextPhase: bool(raw.readyForNextPhase),
    stopReason: strOrNull(raw.stopReason),
    liveActivationAllowed: bool(raw.liveActivationAllowed),
    exchangeOrderAllowed: bool(raw.exchangeOrderAllowed),
  };
}

// T-3H-6-a: read-only rejection/decision summary (observability only; whitelist mapping)
function mapTrendEvidenceDecisionSummary(raw: AnyObj): PaperVM["trendEvidenceDecisionSummary"] {
  const countMap = (v: unknown): Record<string, number> => {
    const out: Record<string, number> = {};
    if (v && typeof v === "object" && !Array.isArray(v)) {
      for (const [k, n] of Object.entries(v as Record<string, unknown>)) {
        if (typeof n === "number" && Number.isFinite(n)) out[k] = n;
      }
    }
    return out;
  };
  const top = Array.isArray(raw.topRejectReasons)
    ? (raw.topRejectReasons as unknown[])
        .map((e) => {
          const o = obj(e);
          return { reason: str(o.reason, ""), count: typeof o.count === "number" ? o.count : 0 };
        })
        .filter((e) => e.reason.length > 0)
    : [];
  const sce = obj(raw.staleCycleEstimate);
  const hasSce =
    raw.staleCycleEstimate != null &&
    typeof sce.expectedCycles === "number" &&
    typeof sce.observedCycles === "number" &&
    typeof sce.missedCycles === "number";
  const mtfRaw = obj(raw.mtfObFvgShadowSummary);
  const exactComparisonRaw = obj(raw.exactZoneComparisonSummary);
  const fillResolutionRaw = obj(exactComparisonRaw.fillResolution);
  const conflictBreakdownRaw = obj(exactComparisonRaw.conflictBreakdown);
  const latestRaw = obj(mtfRaw.latestSnapshot);
  const hasLatest = mtfRaw.latestSnapshot != null && Object.keys(latestRaw).length > 0;
  const mtfSummary: PaperVM["trendEvidenceDecisionSummary"]["mtfObFvgShadowSummary"] = {
    available: bool(mtfRaw.available),
    totalShadowSamples: typeof mtfRaw.totalShadowSamples === "number" ? mtfRaw.totalShadowSamples : 0,
    samplesWithRefinement: typeof mtfRaw.samplesWithRefinement === "number" ? mtfRaw.samplesWithRefinement : 0,
    samplesWithNoData: typeof mtfRaw.samplesWithNoData === "number" ? mtfRaw.samplesWithNoData : 0,
    averageCurrentRawRR: numOrNull(mtfRaw.averageCurrentRawRR),
    averageCurrentNetRR: numOrNull(mtfRaw.averageCurrentNetRR),
    averageRefinedRawRR: numOrNull(mtfRaw.averageRefinedRawRR),
    averageRefinedNetRR: numOrNull(mtfRaw.averageRefinedNetRR),
    averageRrImprovement: numOrNull(mtfRaw.averageRrImprovement),
    averageNetRrImprovement: numOrNull(mtfRaw.averageNetRrImprovement),
    passStaticCount: typeof mtfRaw.passStaticCount === "number" ? mtfRaw.passStaticCount : 0,
    passNetCount: typeof mtfRaw.passNetCount === "number" ? mtfRaw.passNetCount : 0,
    qualityScoreAverage: numOrNull(mtfRaw.qualityScoreAverage),
    classificationCounts: countMap(mtfRaw.classificationCounts),
    dataStatusCounts: countMap(mtfRaw.dataStatusCounts),
    exactZoneSamples: typeof mtfRaw.exactZoneSamples === "number" && Number.isFinite(mtfRaw.exactZoneSamples) ? mtfRaw.exactZoneSamples : null,
    exactZoneDataStatusCounts: countMap(mtfRaw.exactZoneDataStatusCounts),
    exactZoneReadinessCounts: countMap(mtfRaw.exactZoneReadinessCounts),
    usesExactObFvgZonesCount: typeof mtfRaw.usesExactObFvgZonesCount === "number" && Number.isFinite(mtfRaw.usesExactObFvgZonesCount) ? mtfRaw.usesExactObFvgZonesCount : null,
    exactAvgNetRR: numOrNull(mtfRaw.exactAvgNetRR),
    exactVsHeuristicAvgDelta: numOrNull(mtfRaw.exactVsHeuristicAvgDelta),
    latestSnapshot: hasLatest
      ? {
          capturedAt: strOrNull(latestRaw.capturedAt),
          dataStatus: strOrNull(latestRaw.dataStatus),
          classification: strOrNull(latestRaw.classification),
          qualityScore: numOrNull(latestRaw.qualityScore),
          currentRawRR: numOrNull(latestRaw.currentRawRR),
          currentNetRR: numOrNull(latestRaw.currentNetRR),
          refinedRawRR: numOrNull(latestRaw.refinedRawRR),
          refinedNetRR: numOrNull(latestRaw.refinedNetRR),
          rrImprovement: numOrNull(latestRaw.rrImprovement),
          netRrImprovement: numOrNull(latestRaw.netRrImprovement),
          wouldPassStaticRR: typeof latestRaw.wouldPassStaticRR === "boolean" ? latestRaw.wouldPassStaticRR : null,
          wouldPassNetRR: typeof latestRaw.wouldPassNetRR === "boolean" ? latestRaw.wouldPassNetRR : null,
          requiredRR: numOrNull(latestRaw.requiredRR),
          usesExactObFvgZones: bool(latestRaw.usesExactObFvgZones),
        }
      : null,
    sampleWarning: mtfRaw.sampleWarning !== false,
  };
  return {
    available: bool(raw.available),
    totalRecords: typeof raw.totalRecords === "number" ? raw.totalRecords : 0,
    windowStart: strOrNull(raw.windowStart),
    windowEnd: strOrNull(raw.windowEnd),
    latestRecordedAt: strOrNull(raw.latestRecordedAt),
    decisionCounts: countMap(raw.decisionCounts),
    gateStatusCounts: countMap(raw.gateStatusCounts),
    rejectReasonCounts: countMap(raw.rejectReasonCounts),
    topRejectReasons: top,
    staleCycleEstimate: hasSce
      ? { expectedCycles: sce.expectedCycles as number, observedCycles: sce.observedCycles as number, missedCycles: sce.missedCycles as number }
      : null,
    lastRejectReasons: strArray(raw.lastRejectReasons),
    sampleWarning: raw.sampleWarning !== false,
    exactZoneComparisonSummary: {
      schemaVersion: 1,
      sampleTier: str(exactComparisonRaw.sampleTier, "NO_DATA"),
      exactSamples: num(exactComparisonRaw.exactSamples, 0),
      heuristicSamples: num(exactComparisonRaw.heuristicSamples, 0),
      exactAvgNetRR: numOrNull(exactComparisonRaw.exactAvgNetRR),
      heuristicAvgNetRR: numOrNull(exactComparisonRaw.heuristicAvgNetRR),
      avgExactVsHeuristicDelta: numOrNull(exactComparisonRaw.avgExactVsHeuristicDelta),
      exactPassCount: num(exactComparisonRaw.exactPassCount, 0),
      exactPassRate: numOrNull(exactComparisonRaw.exactPassRate),
      exactDataStatusCounts: countMap(exactComparisonRaw.exactDataStatusCounts),
      exactReadinessCounts: countMap(exactComparisonRaw.exactReadinessCounts),
      usesExactObFvgZonesCount: num(exactComparisonRaw.usesExactObFvgZonesCount, 0),
      dominantExactStatus: strOrNull(exactComparisonRaw.dominantExactStatus),
      dominantExactReadiness: strOrNull(exactComparisonRaw.dominantExactReadiness),
      fillResolution: {
        status: str(fillResolutionRaw.status, "NOT_CONFIGURED"),
        totalResolvable: num(fillResolutionRaw.totalResolvable, 0),
        filled: num(fillResolutionRaw.filled, 0),
        missed: num(fillResolutionRaw.missed, 0),
        pending: num(fillResolutionRaw.pending, 0),
        invalidationFirst: num(fillResolutionRaw.invalidationFirst, 0),
        missedFillRate: numOrNull(fillResolutionRaw.missedFillRate),
      },
      warningFlags: strArray(exactComparisonRaw.warningFlags),
      rrMetricScope: str(exactComparisonRaw.rrMetricScope, "TOP_CLEAN_CANDIDATE"),
      readinessMetricScope: str(exactComparisonRaw.readinessMetricScope, "AGGREGATE_WORST_OF_ALL_ZONES"),
      conflictLabelNote: strOrNull(exactComparisonRaw.conflictLabelNote),
      conflictBreakdown: {
        TARGET_TOO_CLOSE: num(conflictBreakdownRaw.TARGET_TOO_CLOSE, 0),
        COST_TOO_HIGH: num(conflictBreakdownRaw.COST_TOO_HIGH, 0),
        CONFLICTING_MTF: num(conflictBreakdownRaw.CONFLICTING_MTF, 0),
        other: countMap(conflictBreakdownRaw.other),
      },
      readiness: str(exactComparisonRaw.readiness, "NO_DATA"),
      source: str(exactComparisonRaw.source, "EXACT_ZONE_COMPARISON_SUMMARY_V1"),
    },
    mtfObFvgShadowSummary: mtfSummary,
  };
}

function mapTrendPaperArmIntentBridge(raw: AnyObj): PaperVM["trendPaperArmIntentBridge"] {
  const sourceRaw = str(raw.source, "UNKNOWN");
  const validSource = ["RAW_GATE", "SESSION_ARM_INTENT", "SESSION_MISSING", "SESSION_EXPIRED", "SESSION_NOT_ACTIVE", "SESSION_LIMIT_REACHED", "SESSION_NO_ARM_INTENT"];
  return {
    rawStatus: strOrNull(raw.rawStatus),
    effectiveStatus: strOrNull(raw.effectiveStatus),
    source: (validSource.includes(sourceRaw) ? sourceRaw : "UNKNOWN") as PaperVM["trendPaperArmIntentBridge"]["source"],
    upgradedToArmed: bool(raw.upgradedToArmed),
    paperArmIntentRequested: bool(raw.paperArmIntentRequested),
    reasons: strArray(raw.reasons),
    paperActivationAllowed: bool(raw.paperActivationAllowed),
    liveActivationAllowed: bool(raw.liveActivationAllowed),
  };
}

function mapTrendPaperArmSession(raw: AnyObj): PaperVM["trendPaperArmSession"] {
  const statusRaw = str(raw.status, "UNKNOWN");
  const validStatus = ["INACTIVE", "ACTIVE", "EXPIRED", "REVOKED", "LIMIT_REACHED", "MISSING"];
  const dirRaw = str(raw.direction);
  const validDir = ["LONG", "SHORT", "ANY"];
  return {
    present: bool(raw.present),
    status: (validStatus.includes(statusRaw) ? statusRaw : "UNKNOWN") as PaperVM["trendPaperArmSession"]["status"],
    sessionId: strOrNull(raw.sessionId),
    direction: (validDir.includes(dirRaw) ? dirRaw : null) as PaperVM["trendPaperArmSession"]["direction"],
    symbol: strOrNull(raw.symbol),
    startedAt: strOrNull(raw.startedAt),
    expiresAt: strOrNull(raw.expiresAt),
    timeRemainingMs: numOrNull(raw.timeRemainingMs),
    maxEntries: numOrNull(raw.maxEntries),
    usedEntries: numOrNull(raw.usedEntries),
    remainingEntries: numOrNull(raw.remainingEntries),
    maxRiskPerTradePct: numOrNull(raw.maxRiskPerTradePct),
    maxSessionRiskPct: numOrNull(raw.maxSessionRiskPct),
    active: bool(raw.active),
    paperOnly: raw.paperOnly !== false,
    liveActivationAllowed: bool(raw.liveActivationAllowed),
    exchangeOrderAllowed: bool(raw.exchangeOrderAllowed),
  };
}

function mapTrendPaperExecutionEngine(raw: AnyObj): PaperVM["trendPaperExecutionEngine"] {
  const position = obj(raw.openTrendPaperPosition);
  const actionRaw = str(raw.lastAction, "UNKNOWN");
  const validActions = ["NO_ACTION", "CREATE_PAPER_ENTRY", "CREATE_PAPER_EXIT", "CREATE_PAPER_CANCEL"];
  const dirRaw = str(position.direction, "");
  const statusRaw = str(position.status, "UNKNOWN");
  return {
    enabled: bool(raw.enabled),
    mode: str(raw.mode, "UNKNOWN") === "PAPER_SIMULATION_ONLY" ? "PAPER_SIMULATION_ONLY" : "UNKNOWN",
    lastAction: (validActions.includes(actionRaw) ? actionRaw : "UNKNOWN") as PaperVM["trendPaperExecutionEngine"]["lastAction"],
    lastReason: strOrNull(raw.lastReason),
    openTrendPaperPosition: Object.keys(position).length
      ? {
          positionId: strOrNull(position.positionId),
          setupId: strOrNull(position.setupId),
          direction: dirRaw === "LONG" || dirRaw === "SHORT" ? dirRaw : null,
          status: (["OPEN", "PARTIAL_TP1", "CLOSED", "CANCELLED"].includes(statusRaw) ? statusRaw : "UNKNOWN") as NonNullable<PaperVM["trendPaperExecutionEngine"]["openTrendPaperPosition"]>["status"],
          entryPrice: numOrNull(position.entryPrice),
          stopLoss: numOrNull(position.stopLoss),
          takeProfit1: numOrNull(position.takeProfit1),
          takeProfit2: numOrNull(position.takeProfit2),
          quantityPaper: numOrNull(position.quantityPaper),
          remainingQuantityPaper: numOrNull(position.remainingQuantityPaper),
          openedAt: strOrNull(position.openedAt),
        }
      : null,
    lastEntryAt: strOrNull(raw.lastEntryAt),
    lastExitAt: strOrNull(raw.lastExitAt),
    trendPaperClosedTrades: num(raw.trendPaperClosedTrades, 0),
    winRate: numOrNull(raw.winRate),
    netExpectancyAfterCosts: numOrNull(raw.netExpectancyAfterCosts),
    paperOnly: bool(raw.paperOnly),
    liveActivationAllowed: bool(raw.liveActivationAllowed),
    exchangeOrderAllowed: bool(raw.exchangeOrderAllowed),
  };
}

function mapTrendEdgeReview(raw: AnyObj): PaperVM["trendEdgeReview"] {
  const statusRaw = str(raw.status, "UNKNOWN");
  const validStatus = ["NO_DATA", "INSUFFICIENT_DATA", "EARLY_SAMPLE", "USABLE_SAMPLE", "REVIEW_SAMPLE", "PRODUCTION_CANDIDATE_REVIEW"];
  const tierRaw = str(raw.sampleTier, "unknown");
  const validTier = ["none", "early", "usable", "review", "production_candidate"];
  const decisionRaw = str(raw.decision, "UNKNOWN");
  const validDecision = ["HOLD", "CONTINUE_PAPER", "PARAMETER_REVIEW", "PAUSE_STRATEGY", "READY_FOR_LIMITED_CANARY_REVIEW"];
  return {
    phase: str(raw.phase, "UNKNOWN") === "T-4_EDGE_REVIEW" ? "T-4_EDGE_REVIEW" : "UNKNOWN",
    status: (validStatus.includes(statusRaw) ? statusRaw : "UNKNOWN") as PaperVM["trendEdgeReview"]["status"],
    trendClosedTrades: typeof raw.trendClosedTrades === "number" && Number.isFinite(raw.trendClosedTrades) ? raw.trendClosedTrades : 0,
    sampleTier: (validTier.includes(tierRaw) ? tierRaw : "unknown") as PaperVM["trendEdgeReview"]["sampleTier"],
    winRate: numOrNull(raw.winRate),
    averageWinR: numOrNull(raw.averageWinR),
    averageLossR: numOrNull(raw.averageLossR),
    expectancyR: numOrNull(raw.expectancyR),
    netExpectancyAfterCosts: numOrNull(raw.netExpectancyAfterCosts),
    profitFactor: numOrNull(raw.profitFactor),
    maxDrawdownR: numOrNull(raw.maxDrawdownR),
    maxConsecutiveLosses: numOrNull(raw.maxConsecutiveLosses),
    riskOfRuinEstimate: numOrNull(raw.riskOfRuinEstimate),
    costDrag: numOrNull(raw.costDrag),
    slippageAttribution: numOrNull(raw.slippageAttribution),
    fundingAttribution: numOrNull(raw.fundingAttribution),
    invalidRiskModelCount: num(raw.invalidRiskModelCount, 0),
    invalidMissingStopLossCount: num(raw.invalidMissingStopLossCount, 0),
    decision: (validDecision.includes(decisionRaw) ? decisionRaw : "UNKNOWN") as PaperVM["trendEdgeReview"]["decision"],
    paperActivationAllowed: bool(raw.paperActivationAllowed),
    liveActivationAllowed: bool(raw.liveActivationAllowed),
    notes: strArray(raw.notes),
  };
}

function mapTrendManualPaperArmGate(raw: AnyObj): PaperVM["trendManualPaperArmGate"] {
  const phaseRaw = str(raw.phase, "UNKNOWN");
  const validPhase = ["T-2_DESIGN", "T-2_READY_FOR_OPERATOR", "T-2_ARMED", "T-2_REJECTED", "T-2_EXPIRED"];
  const statusRaw = str(raw.status, "UNKNOWN");
  const validStatus = ["NOT_READY", "READY_FOR_OPERATOR_REVIEW", "OPERATOR_ARMED_PAPER_ONLY", "REJECTED_BY_OPERATOR", "EXPIRED", "BLOCKED"];
  return {
    phase: (validPhase.includes(phaseRaw) ? phaseRaw : "UNKNOWN") as PaperVM["trendManualPaperArmGate"]["phase"],
    status: (validStatus.includes(statusRaw) ? statusRaw : "UNKNOWN") as PaperVM["trendManualPaperArmGate"]["status"],
    requiredConditions: strArray(raw.requiredConditions),
    passedConditions: strArray(raw.passedConditions),
    failedConditions: strArray(raw.failedConditions),
    operatorActionRequired: bool(raw.operatorActionRequired),
    setupId: strOrNull(raw.setupId),
    expiryAt: strOrNull(raw.expiryAt),
    paperActivationAllowed: bool(raw.paperActivationAllowed),
    liveActivationAllowed: bool(raw.liveActivationAllowed),
    notes: strArray(raw.notes),
  };
}

function mapTrendTransitionMonitor(raw: AnyObj): PaperVM["trendTransitionMonitor"] {
  const wf = obj(raw.watchedFields);
  const zone = Array.isArray(wf.entryZone) && wf.entryZone.length === 2
    ? ([numOrNull(wf.entryZone[0]), numOrNull(wf.entryZone[1])] as const)
    : null;
  const statusRaw = str(raw.status, "UNKNOWN");
  const validStatus = ["IDLE_NO_TRADE", "WATCHING_PULLBACK", "ENTRY_ZONE_REACHED", "AWAITING_CONFIRMATION", "RISK_REJECTED", "SETUP_INVALIDATED", "REGIME_CHANGED", "SAFETY_BLOCK"];
  const sevRaw = str(raw.severity, "info");
  const dirRaw = str(wf.direction, "");
  return {
    status: (validStatus.includes(statusRaw) ? statusRaw : "UNKNOWN") as PaperVM["trendTransitionMonitor"]["status"],
    severity: (["info", "watch", "warning", "critical"].includes(sevRaw) ? sevRaw : "info") as PaperVM["trendTransitionMonitor"]["severity"],
    message: strOrNull(raw.message),
    operatorAction: strOrNull(raw.operatorAction),
    shouldNotifyOperator: bool(raw.shouldNotifyOperator),
    checkedAt: strOrNull(raw.checkedAt),
    watchedFields: {
      trendStatus: strOrNull(wf.trendStatus),
      riskStatus: strOrNull(wf.riskStatus),
      direction: dirRaw === "LONG" || dirRaw === "SHORT" ? dirRaw : null,
      currentPrice: numOrNull(wf.currentPrice),
      entryZone: zone && zone[0] != null && zone[1] != null ? [zone[0], zone[1]] : null,
      invalidation: numOrNull(wf.invalidation),
      target1: numOrNull(wf.target1),
      rewardRisk: numOrNull(wf.rewardRisk),
    },
    paperActivationAllowed: bool(raw.paperActivationAllowed),
    liveActivationAllowed: bool(raw.liveActivationAllowed),
  };
}

function mapTrendStrategyStatus(status: string): PaperVM["trendStrategy"]["status"] {
  if (status === "NO_TRADE") return "NO_TRADE";
  if (status === "WATCHING_PULLBACK") return "WATCHING_PULLBACK";
  if (status === "SETUP_READY") return "SETUP_READY";
  if (status === "AWAITING_CONFIRMATION") return "AWAITING_CONFIRMATION";
  if (status === "RISK_REJECTED") return "RISK_REJECTED";
  if (status === "INVALIDATED") return "INVALIDATED";
  return "UNKNOWN";
}

function mapTrendStrategyDirection(direction: string): PaperVM["trendStrategy"]["direction"] {
  if (direction === "LONG") return "LONG";
  if (direction === "SHORT") return "SHORT";
  return null;
}

function mapTrendConfirmationStatus(status: string): PaperVM["trendStrategy"]["confirmationStatus"] {
  if (status === "NOT_REQUIRED") return "NOT_REQUIRED";
  if (status === "WAITING_5M_CONFIRM") return "WAITING_5M_CONFIRM";
  if (status === "CONFIRMED") return "CONFIRMED";
  if (status === "FAILED") return "FAILED";
  if (status === "INSUFFICIENT_DATA") return "INSUFFICIENT_DATA";
  return "UNKNOWN";
}

function mapTrendRiskStatus(status: string): PaperVM["trendStrategy"]["riskStatus"] {
  if (status === "PASS") return "PASS";
  if (status === "NO_TRADE_NEAR_TARGET") return "NO_TRADE_NEAR_TARGET";
  if (status === "NO_TRADE_BAD_RR") return "NO_TRADE_BAD_RR";
  if (status === "NO_TRADE_STALE_DATA") return "NO_TRADE_STALE_DATA";
  if (status === "NO_TRADE_VOLATILITY") return "NO_TRADE_VOLATILITY";
  if (status === "NO_TRADE_CONFLICTING_FLOW") return "NO_TRADE_CONFLICTING_FLOW";
  if (status === "NO_TRADE_OLD_EXPOSURE") return "NO_TRADE_OLD_EXPOSURE";
  return "UNKNOWN";
}

function mapRegridReadiness(readiness: AnyObj): PaperVM["regridReadiness"] {
  return {
    status: mapRegridReadinessStatus(str(readiness.status, "UNKNOWN")),
    score: num(readiness.score, 0),
    passedGates: strArray(readiness.passedGates),
    failedGates: strArray(readiness.failedGates),
    warnings: strArray(readiness.warnings),
    nextAction: strOrNull(readiness.nextAction),
    operatorReviewRequired: bool(readiness.operatorReviewRequired),
    paperActivationAllowed: bool(readiness.paperActivationAllowed),
    liveActivationAllowed: bool(readiness.liveActivationAllowed),
  };
}

function mapRegridReadinessStatus(status: string): PaperVM["regridReadiness"]["status"] {
  if (status === "NOT_READY") return "NOT_READY";
  if (status === "WATCH") return "WATCH";
  if (status === "READY_FOR_OPERATOR_REVIEW") return "READY_FOR_OPERATOR_REVIEW";
  return "UNKNOWN";
}

function mapIndicatorGateStatus(status: string): PaperVM["indicatorGate"]["status"] {
  if (status === "TREND_DOWN_BLOCK") return "TREND_DOWN_BLOCK";
  if (status === "VOLATILITY_BLOCK") return "VOLATILITY_BLOCK";
  if (status === "RECOVERY_WATCH") return "RECOVERY_WATCH";
  if (status === "RANGE_WATCH") return "RANGE_WATCH";
  return "INSUFFICIENT_DATA";
}

function mapCanonicalRegimeGateStatus(status: string): PaperVM["canonicalRegimeGate"]["status"] {
  if (status === "PASSIVE_SHADOW") return "PASSIVE_SHADOW";
  if (status === "BLOCK_NEUTRAL_GRID") return "BLOCK_NEUTRAL_GRID";
  if (status === "TREND_CHECK_REQUIRED") return "TREND_CHECK_REQUIRED";
  if (status === "NO_TRADE_REQUIRED") return "NO_TRADE_REQUIRED";
  if (status === "VOLATILITY_BLOCK") return "VOLATILITY_BLOCK";
  return "UNKNOWN_DATA_BLOCK";
}

function mapIndicatorGateConfidence(confidence: string): PaperVM["indicatorGate"]["confidence"] {
  if (confidence === "high") return "high";
  if (confidence === "medium") return "medium";
  return "low";
}

function mapCanonicalRegime(regime: string): PaperVM["canonicalMarketRegime"]["regime"] {
  if (regime === "RANGE") return "RANGE";
  if (regime === "UPTREND") return "UPTREND";
  if (regime === "DOWNTREND") return "DOWNTREND";
  if (regime === "VOLATILITY_EXPANSION") return "VOLATILITY_EXPANSION";
  if (regime === "VOLATILITY_COMPRESSION") return "VOLATILITY_COMPRESSION";
  if (regime === "EVENT_RISK") return "EVENT_RISK";
  if (regime === "NO_TRADE") return "NO_TRADE";
  return "UNKNOWN";
}

function mapCanonicalDirection(direction: string): PaperVM["canonicalMarketRegime"]["direction"] {
  if (direction === "BULLISH") return "BULLISH";
  if (direction === "BEARISH") return "BEARISH";
  if (direction === "NEUTRAL") return "NEUTRAL";
  return "UNKNOWN";
}

function mapCanonicalFreshnessStatus(status: string): PaperVM["canonicalMarketRegime"]["sourceFreshness"]["status"] {
  if (status === "fresh") return "fresh";
  if (status === "stale") return "stale";
  if (status === "partial") return "partial";
  return "unknown";
}

function mapCanonicalCompletenessStatus(status: string): PaperVM["canonicalMarketRegime"]["evidenceCompleteness"]["status"] {
  if (status === "complete") return "complete";
  if (status === "partial") return "partial";
  if (status === "missing") return "missing";
  return "unknown";
}

function mapRegimeDiagnosticStatus(status: string): PaperVM["regimeDiagnostic"]["status"] {
  if (status === "NO_CANONICAL_DATA") return "NO_CANONICAL_DATA";
  if (status === "MATCHED") return "MATCHED";
  if (status === "DECISION_REGIME_NULL_CANONICAL_AVAILABLE") return "DECISION_REGIME_NULL_CANONICAL_AVAILABLE";
  if (status === "MISMATCH") return "MISMATCH";
  if (status === "LOW_CONFIDENCE") return "LOW_CONFIDENCE";
  return "UNKNOWN";
}

function mapVolBaselineReadiness(status: string): PaperVM["volBaselineDiagnostic"]["baselineReadiness"] {
  if (status === "READY") return "READY";
  if (status === "INSUFFICIENT") return "INSUFFICIENT";
  if (status === "BUILDING") return "BUILDING";
  return "NO_DATA";
}

function mapEventRiskContext(raw: AnyObj): PaperVM["eventRiskContext"] {
  const statusRaw = str(raw.status || raw.risk_level || "NO_DATA").toUpperCase();
  const status: PaperVM["eventRiskContext"]["status"] =
    statusRaw === "STALE" ? "STALE"
    : statusRaw === "NORMAL" || statusRaw === "LOW" ? "NORMAL"
    : statusRaw === "WATCH" || statusRaw === "MED" || statusRaw === "MEDIUM" ? "WATCH"
    : statusRaw === "HIGH_EVENT_RISK" || statusRaw === "HIGH" || statusRaw === "CRITICAL" ? "HIGH_EVENT_RISK"
    : statusRaw === "UNKNOWN" ? "UNKNOWN"
    : "NO_DATA";
  const stale = raw.stale === true || status === "STALE";
  const hasData = Object.keys(raw).length > 0;
  return {
    status: hasData ? status : "NO_DATA",
    headlineCount: num(raw.headlineCount ?? raw.headline_count, 0),
    source: strOrNull(raw.source) ?? (hasData ? "news_context.json" : null),
    freshness: stale ? "stale" : hasData ? "fresh" : "unknown",
    updatedAt: strOrNull(raw.updatedAt ?? raw.generated_at),
    riskLabel: strOrNull(raw.riskLabel ?? raw.risk_level),
    summary: strOrNull(raw.summary),
    warning: strOrNull(raw.warning) ?? (!hasData || stale ? "News context missing/stale" : null),
    paperActivationAllowed: bool(raw.paperActivationAllowed),
    liveActivationAllowed: bool(raw.liveActivationAllowed),
  };
}

function mapRegimeTransitionDiagnostic(raw: AnyObj): PaperVM["regimeTransitionDiagnostic"] {
  return {
    status: "NOT_CONFIGURED",
    hasHistoryStore: bool(raw.hasHistoryStore),
    hysteresisActive: bool(raw.hysteresisActive),
    message: str(raw.message, "Regime transition history is not configured"),
    warning: str(raw.warning, "Design-only - no regime behavior change"),
  };
}

function mapStringRecord(value: unknown): Record<string, string | null> {
  const raw = obj(value);
  const out: Record<string, string | null> = {};
  for (const [key, item] of Object.entries(raw)) {
    out[key] = typeof item === "string" && item.length > 0 ? item : null;
  }
  return out;
}

function mapCostGateStatus(status: string): PaperVM["costGateStatus"] {
  const normalized = status.toUpperCase();
  if (normalized === "PASS") return "PASS";
  if (normalized === "WARNING" || normalized === "WARN") return "WARNING";
  if (normalized === "FAIL" || normalized === "FAILED") return "FAIL";
  return "UNKNOWN";
}

function mapCostGateBreakdownStatus(costGate: AnyObj): PaperVM["costGateBreakdown"]["status"] {
  const hasData =
    numOrNull(costGate.roundTripCostPct) != null ||
    numOrNull(costGate.gridSpacingPct) != null ||
    numOrNull(costGate.requiredMinSpacingPct) != null ||
    typeof costGate.pass === "boolean" ||
    typeof costGate.warning === "boolean";
  if (!hasData) return "NO_DATA";
  if (bool(costGate.pass)) return "PASS";
  if (bool(costGate.warning)) return "WARNING";
  if (costGate.pass === false) return "FAIL";
  return mapCostGateStatus(str(costGate.status, "UNKNOWN"));
}

function costSpacingBufferRatio(costGate: AnyObj): number | null {
  const spacing = numOrNull(costGate.gridSpacingPct);
  const roundTrip = numOrNull(costGate.roundTripCostPct);
  if (spacing == null || roundTrip == null || roundTrip <= 0) return null;
  return spacing / roundTrip;
}

function mapFeeGrindRisk(input: {
  pass: boolean | null;
  warning: boolean | null;
  spacingBufferRatio: number | null;
}): PaperVM["costGateBreakdown"]["feeGrindRisk"] {
  if (input.pass === false) return "COST_GATE_FAIL";
  if (input.spacingBufferRatio == null) return "NO_DATA";
  if (input.spacingBufferRatio < 1) return "FEE_GRIND_RISK";
  if (input.spacingBufferRatio < 1.5 || input.warning === true) return "THIN_BUFFER";
  return "HEALTHY_BUFFER";
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
