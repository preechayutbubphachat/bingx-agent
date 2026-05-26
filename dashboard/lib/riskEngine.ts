import type {
  RiskApprovalStatus,
  RiskCaps,
  RiskContext,
  RiskFreshness,
  RiskOverlay,
  RiskReason,
  RiskTruthStatus,
} from "./riskTypes";

const DEFAULT_CAPS: RiskCaps = {
  maxRiskPerTradePct: 1,
  maxDailyLossPct: 3,
  maxConcurrentExposure: 1,
  staleDataWarnSec: 180,
  staleDataFreezeSec: 1800,
  derivativesStaleWarnSec: 300,
  derivativesStaleFreezeSec: 1800,
  cooldownMs: 15 * 60 * 1000,
};

export function getDefaultRiskCaps(): RiskCaps {
  return { ...DEFAULT_CAPS };
}

function toFiniteNumber(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function toBool(v: unknown): boolean {
  return v === true;
}

function normalizeText(v: unknown): string {
  return String(v ?? "").trim();
}

function normalizeUpper(v: unknown): string {
  return normalizeText(v).toUpperCase();
}

function normalizeCaps(input?: Partial<RiskCaps> | null): RiskCaps {
  return {
    maxRiskPerTradePct: toFiniteNumber(input?.maxRiskPerTradePct) ?? DEFAULT_CAPS.maxRiskPerTradePct,
    maxDailyLossPct: toFiniteNumber(input?.maxDailyLossPct) ?? DEFAULT_CAPS.maxDailyLossPct,
    maxConcurrentExposure:
      toFiniteNumber(input?.maxConcurrentExposure) ?? DEFAULT_CAPS.maxConcurrentExposure,
    staleDataWarnSec: toFiniteNumber(input?.staleDataWarnSec) ?? DEFAULT_CAPS.staleDataWarnSec,
    staleDataFreezeSec:
      toFiniteNumber(input?.staleDataFreezeSec) ?? DEFAULT_CAPS.staleDataFreezeSec,
    derivativesStaleWarnSec:
      toFiniteNumber(input?.derivativesStaleWarnSec) ?? DEFAULT_CAPS.derivativesStaleWarnSec,
    derivativesStaleFreezeSec:
      toFiniteNumber(input?.derivativesStaleFreezeSec) ?? DEFAULT_CAPS.derivativesStaleFreezeSec,
    cooldownMs: toFiniteNumber(input?.cooldownMs) ?? DEFAULT_CAPS.cooldownMs,
  };
}

function reason(code: string, severity: RiskReason["severity"], message: string): RiskReason {
  return { code, severity, message };
}

function freshnessAgeSec(freshness?: RiskFreshness | null): number | null {
  return toFiniteNumber(freshness?.ageSec);
}

function freshnessTag(freshness?: RiskFreshness | null): string {
  return normalizeUpper(freshness?.tag);
}

function isFreshEnough(freshness: RiskFreshness | null | undefined, freezeSec: number | null): boolean {
  const tag = freshnessTag(freshness);
  const ageSec = freshnessAgeSec(freshness);

  if (tag === "FRESH") return true;
  if (freezeSec !== null && ageSec !== null) return ageSec < freezeSec;
  return false;
}

function isWarnFreshness(
  freshness: RiskFreshness | null | undefined,
  warnSec: number | null,
  freezeSec: number | null
): boolean {
  const ageSec = freshnessAgeSec(freshness);
  if (ageSec === null || warnSec === null || freezeSec === null) return false;
  return ageSec >= warnSec && ageSec < freezeSec;
}

function projectedTradeRiskPct(ctx: RiskContext): number | null {
  const entry = toFiniteNumber(ctx.trade?.entryPrice);
  const stop = toFiniteNumber(ctx.trade?.stopPrice);
  const qty = toFiniteNumber(ctx.trade?.quantity);
  const notional = toFiniteNumber(ctx.trade?.notional);
  const equity = toFiniteNumber(ctx.trade?.equity);

  if (entry === null || stop === null) return null;

  const distance = Math.abs(entry - stop);
  if (!(distance > 0)) return null;

  if (qty !== null && equity !== null && equity > 0) {
    const riskValue = distance * qty;
    return (riskValue / equity) * 100;
  }

  if (notional !== null && entry > 0) {
    const impliedQty = notional / entry;
    if (equity !== null && equity > 0) {
      const riskValue = distance * impliedQty;
      return (riskValue / equity) * 100;
    }
  }

  return null;
}

function hasMarkerMismatch(ctx: RiskContext): boolean {
  if (ctx.markerProof?.all_match === false) return true;
  return Array.isArray(ctx.markerProof?.mismatches) && ctx.markerProof!.mismatches!.length > 0;
}

function failSafeMode(ctx: RiskContext): string {
  return normalizeUpper(ctx.failSafe?.mode || "UNKNOWN");
}

function buildBaseOverlay(ctx: RiskContext): RiskOverlay {
  const caps = normalizeCaps(ctx.caps);
  const activePositions = Math.max(0, toFiniteNumber(ctx.exposure?.activePositions) ?? 0);
  const pendingEntryIntents = Math.max(0, toFiniteNumber(ctx.exposure?.pendingEntryIntents) ?? 0);
  const sameSymbolOpen = toBool(ctx.exposure?.sameSymbolOpen);
  const hasProtection = ctx.exposure?.hasProtection !== false;
  const positionState = normalizeUpper(ctx.exposure?.positionState || "UNKNOWN") as RiskOverlay["exposureSummary"]["positionState"];
  const projectedRisk = projectedTradeRiskPct(ctx);
  const dailyRealizedPnl = toFiniteNumber(ctx.pnl?.dailyRealizedPnl);
  const dailyRealizedPnlPct = toFiniteNumber(ctx.pnl?.dailyRealizedPnlPct);

  return {
    status: "APPROVED",
    truthStatus: "HEALTHY",
    canOpenNewTrade: true,
    shouldFreezeTrading: false,
    shouldReduceRisk: false,
    shouldForceExit: false,
    reasons: [],
    hardStopReasons: [],
    warnings: [],
    caps,
    truthIntegrity: {
      canonicalPlanPresent: toBool(ctx.canonicalPlanPresent),
      canonicalConsistent: toBool(ctx.canonicalConsistent),
      markerProofConsistent: !hasMarkerMismatch(ctx),
      sourceFresh: isFreshEnough(ctx.sourceFreshness, caps.staleDataFreezeSec),
      derivativesFresh: isFreshEnough(ctx.derivativesFreshness, caps.derivativesStaleFreezeSec),
      executionConsistent: ctx.executionConsistent !== false,
      persistHealthy: !normalizeText(ctx.persistError),
    },
    exposureSummary: {
      activePositions,
      sameSymbolOpen,
      pendingEntryIntents,
      hasProtection,
      positionState,
    },
    tradeRisk: {
      projectedRiskPct: projectedRisk,
      projectedRiskAllowed:
        projectedRisk !== null && caps.maxRiskPerTradePct !== null
          ? projectedRisk <= caps.maxRiskPerTradePct
          : false,
    },
    dailyLoss: {
      dailyRealizedPnl,
      dailyRealizedPnlPct,
      dailyLossLimitHit:
        dailyRealizedPnlPct !== null && caps.maxDailyLossPct !== null
          ? dailyRealizedPnlPct <= -Math.abs(caps.maxDailyLossPct)
          : false,
    },
    cooldown: {
      active: toBool(ctx.cooldownActive),
      reason: normalizeText(ctx.cooldownReason) || null,
      untilTs: toFiniteNumber(ctx.cooldownUntilTs),
    },
  };
}

function pushReason(target: RiskOverlay, item: RiskReason) {
  target.reasons.push(item);
  if (item.severity === "hard_stop") target.hardStopReasons.push(item);
  if (item.severity === "warn") target.warnings.push(item);
}

function escalateStatus(current: RiskApprovalStatus, next: RiskApprovalStatus): RiskApprovalStatus {
  const rank: Record<RiskApprovalStatus, number> = {
    APPROVED: 0,
    BLOCKED: 1,
    FROZEN: 2,
    HARD_STOP: 3,
  };
  return rank[next] > rank[current] ? next : current;
}

export function computeRiskOverlay(context: RiskContext): RiskOverlay {
  const overlay = buildBaseOverlay(context);
  const mode = failSafeMode(context);

  if (mode === "HARD_STOP") {
    pushReason(overlay, reason("fail_safe_hard_stop", "hard_stop", "fail-safe mode is HARD_STOP"));
    overlay.status = "HARD_STOP";
    overlay.truthStatus = "BROKEN";
    overlay.canOpenNewTrade = false;
    overlay.shouldFreezeTrading = true;
  } else if (mode === "DEGRADED") {
    pushReason(overlay, reason("fail_safe_degraded", "block", "fail-safe mode is DEGRADED"));
    overlay.status = escalateStatus(overlay.status, "FROZEN");
    overlay.truthStatus = "DEGRADED";
    overlay.canOpenNewTrade = false;
    overlay.shouldFreezeTrading = true;
  }

  if (toBool(context.failSafe?.should_freeze_trade_actions)) {
    pushReason(overlay, reason("fail_safe_freeze", "hard_stop", "fail-safe requested trade freeze"));
    overlay.status = "HARD_STOP";
    overlay.truthStatus = "BROKEN";
    overlay.canOpenNewTrade = false;
    overlay.shouldFreezeTrading = true;
  }

  if (hasMarkerMismatch(context)) {
    pushReason(overlay, reason("marker_mismatch", "hard_stop", "marker proof mismatch detected"));
    overlay.status = "HARD_STOP";
    overlay.truthStatus = "BROKEN";
    overlay.canOpenNewTrade = false;
    overlay.shouldFreezeTrading = true;
  }

  if (!overlay.truthIntegrity.canonicalConsistent) {
    pushReason(
      overlay,
      reason("canonical_mismatch", "hard_stop", "canonical consistency check failed")
    );
    overlay.status = "HARD_STOP";
    overlay.truthStatus = "BROKEN";
    overlay.canOpenNewTrade = false;
    overlay.shouldFreezeTrading = true;
  }

  if (!overlay.truthIntegrity.canonicalPlanPresent) {
    pushReason(
      overlay,
      reason("canonical_plan_missing", "block", "canonical plan missing; deny new entries")
    );
    overlay.status = escalateStatus(overlay.status, "FROZEN");
    overlay.truthStatus = overlay.truthStatus === "BROKEN" ? "BROKEN" : "DEGRADED";
    overlay.canOpenNewTrade = false;
    overlay.shouldFreezeTrading = true;
  }

  if (!overlay.truthIntegrity.persistHealthy) {
    pushReason(overlay, reason("persist_error", "hard_stop", "persist error detected"));
    overlay.status = "HARD_STOP";
    overlay.truthStatus = "BROKEN";
    overlay.canOpenNewTrade = false;
    overlay.shouldFreezeTrading = true;
  }

  if (!overlay.truthIntegrity.executionConsistent) {
    pushReason(
      overlay,
      reason("execution_mismatch", "hard_stop", "execution consistency check failed")
    );
    overlay.status = "HARD_STOP";
    overlay.truthStatus = "BROKEN";
    overlay.canOpenNewTrade = false;
    overlay.shouldFreezeTrading = true;
  }

  if (!overlay.truthIntegrity.sourceFresh) {
    pushReason(
      overlay,
      reason("source_data_stale", "hard_stop", "source data freshness exceeded freeze threshold")
    );
    overlay.status = "HARD_STOP";
    overlay.truthStatus = "BROKEN";
    overlay.canOpenNewTrade = false;
    overlay.shouldFreezeTrading = true;
  } else if (
    isWarnFreshness(
      context.sourceFreshness,
      overlay.caps.staleDataWarnSec,
      overlay.caps.staleDataFreezeSec
    )
  ) {
    pushReason(
      overlay,
      reason("source_data_warn", "warn", "source data freshness exceeded warning threshold")
    );
    overlay.truthStatus = overlay.truthStatus === "HEALTHY" ? "DEGRADED" : overlay.truthStatus;
  }

  if (!overlay.truthIntegrity.derivativesFresh) {
    pushReason(
      overlay,
      reason(
        "derivatives_data_stale",
        "block",
        "derivatives freshness exceeded freeze threshold"
      )
    );
    overlay.status = escalateStatus(overlay.status, "FROZEN");
    overlay.truthStatus = overlay.truthStatus === "BROKEN" ? "BROKEN" : "DEGRADED";
    overlay.canOpenNewTrade = false;
    overlay.shouldFreezeTrading = true;
  } else if (
    isWarnFreshness(
      context.derivativesFreshness,
      overlay.caps.derivativesStaleWarnSec,
      overlay.caps.derivativesStaleFreezeSec
    )
  ) {
    pushReason(
      overlay,
      reason(
        "derivatives_data_warn",
        "warn",
        "derivatives freshness exceeded warning threshold"
      )
    );
    overlay.truthStatus = overlay.truthStatus === "HEALTHY" ? "DEGRADED" : overlay.truthStatus;
  }

  if (overlay.cooldown.active) {
    pushReason(
      overlay,
      reason(
        "cooldown_active",
        "block",
        overlay.cooldown.reason ?? "cooldown is active; deny new entries"
      )
    );
    overlay.status = escalateStatus(overlay.status, "BLOCKED");
    overlay.canOpenNewTrade = false;
  }

  if (toBool(context.killSwitchActive)) {
    pushReason(overlay, reason("kill_switch", "hard_stop", "operator kill switch active"));
    overlay.status = "HARD_STOP";
    overlay.truthStatus = "BROKEN";
    overlay.canOpenNewTrade = false;
    overlay.shouldFreezeTrading = true;
    overlay.shouldForceExit = overlay.exposureSummary.activePositions > 0;
  }

  if (overlay.dailyLoss.dailyLossLimitHit) {
    pushReason(
      overlay,
      reason("daily_loss_limit_hit", "hard_stop", "daily loss limit has been breached")
    );
    overlay.status = "HARD_STOP";
    overlay.canOpenNewTrade = false;
    overlay.shouldFreezeTrading = true;
    if (overlay.exposureSummary.activePositions > 0) {
      overlay.shouldReduceRisk = true;
    }
  }

  if (
    overlay.exposureSummary.sameSymbolOpen ||
    overlay.exposureSummary.activePositions >= (overlay.caps.maxConcurrentExposure ?? 1)
  ) {
    pushReason(
      overlay,
      reason(
        "max_concurrent_exposure",
        "block",
        "concurrent exposure limit reached or symbol already open"
      )
    );
    overlay.status = escalateStatus(overlay.status, "BLOCKED");
    overlay.canOpenNewTrade = false;
  }

  if (overlay.exposureSummary.pendingEntryIntents > 0) {
    pushReason(
      overlay,
      reason("pending_entry_intent", "block", "pending entry intent exists; deny duplicate open")
    );
    overlay.status = escalateStatus(overlay.status, "BLOCKED");
    overlay.canOpenNewTrade = false;
  }

  if (!overlay.tradeRisk.projectedRiskAllowed) {
    pushReason(
      overlay,
      reason(
        "trade_risk_exceeds_cap",
        "block",
        overlay.tradeRisk.projectedRiskPct === null
          ? "projected trade risk could not be computed safely"
          : "projected trade risk exceeds configured cap"
      )
    );
    overlay.status = escalateStatus(overlay.status, "BLOCKED");
    overlay.canOpenNewTrade = false;
  }

  if (overlay.exposureSummary.activePositions > 0 && !overlay.exposureSummary.hasProtection) {
    pushReason(
      overlay,
      reason(
        "missing_protection",
        "hard_stop",
        "open exposure lacks protection; freeze and consider force exit"
      )
    );
    overlay.status = "HARD_STOP";
    overlay.canOpenNewTrade = false;
    overlay.shouldFreezeTrading = true;
    overlay.shouldReduceRisk = true;
    overlay.shouldForceExit = true;
  }

  if (normalizeUpper(context.machineState).includes("READY") && !overlay.canOpenNewTrade) {
    pushReason(
      overlay,
      reason(
        "strategy_ready_but_risk_denied",
        "info",
        "strategy is ready but risk layer denied entry"
      )
    );
  }

  return overlay;
}

export function shouldFreezeTrading(context: RiskContext): boolean {
  return computeRiskOverlay(context).shouldFreezeTrading;
}

export function shouldReduceRisk(context: RiskContext): boolean {
  return computeRiskOverlay(context).shouldReduceRisk;
}

export function shouldForceExit(context: RiskContext): boolean {
  return computeRiskOverlay(context).shouldForceExit;
}

export function canOpenNewTrade(context: RiskContext): boolean {
  return computeRiskOverlay(context).canOpenNewTrade;
}
