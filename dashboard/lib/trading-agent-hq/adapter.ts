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
