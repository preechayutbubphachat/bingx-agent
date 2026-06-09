// dashboard/lib/trend/trendPaperEvidenceRunner.ts
// Phase T-3H-4-a — Evidence runner CORE (orchestration only, deterministic, fail-closed).
// One evidence cycle: global-safety → exit-drive → target → budget → bar → gate → arm → one-shot.
// Reuses T-3G/T-3H-2 via INJECTED deps (no network, no engine import, no browser token). Paper-only.
// NEVER live, NEVER exchange, NEVER cron. EXIT never consumes session. Grid closedCycles never touched.

import {
  applyDailyReset,
  type EvidenceDecision,
  type EvidenceOpenPosition,
  type EvidencePhase,
  type TrendPaperEvidenceState,
} from "./trendPaperEvidenceState.ts";
import { classifyTrendEvidenceSample, type TrendEvidenceMetrics } from "./trendEvidenceMetrics.ts";

export interface EvidenceRunnerConfig {
  simulationEnabled: boolean; // TREND_PAPER_SIMULATION_ENABLED
  runnerEnabled: boolean; // TREND_PAPER_EVIDENCE_RUNNER_ENABLED
  allowedSymbol: string; // "BTC-USDT"
  maxOpenPositions: number; // 1
  maxEntriesPerDay: number; // 3
  dailyLossCapR: number; // 3
  maxConsecutiveLosses: number; // 3
  cooldownMinutes: number; // 60
  targetClosedTrades: number; // 30
  globalSafety: {
    liveTradingEnabled: boolean;
    orderPlacementEnabled: boolean;
    productionTradingReady: boolean;
    exchangeApproved: boolean;
  };
}

export interface EvidenceGateSnapshot {
  rawStatus: string | null;
  effectiveStatus: string | null;
  armable: boolean; // setup ready to arm (raw gate READY_FOR_OPERATOR_REVIEW or already armed)
  direction: "LONG" | "SHORT" | "ANY" | null;
  failedConditions: string[];
}

export interface EvidenceOneShotResult {
  action: "NO_ACTION" | "CREATE_PAPER_ENTRY" | "CREATE_PAPER_EXIT" | "CREATE_PAPER_CANCEL" | string;
  reason: string;
  journalAppended: boolean;
  sessionConsumed: boolean;
}

export interface EvidenceRunnerInput {
  now: number | string | Date;
  symbol: string;
  currentBarId: string | null; // 1H candle close id/ts
  config: EvidenceRunnerConfig;
  state: TrendPaperEvidenceState;
  gate: EvidenceGateSnapshot;
  metrics: TrendEvidenceMetrics;
  openTrendPosition: EvidenceOpenPosition | null;
  // injected actions (no real network in tests)
  createSession: (direction: "LONG" | "SHORT" | "ANY", expiryMinutes: number) => Promise<{ ok: boolean }>;
  runOneShot: () => Promise<EvidenceOneShotResult>;
  cleanupSession: () => Promise<{ ok: boolean }>;
  driveExitLifecycle: () => Promise<{ closed: boolean; reason: string }>;
}

export interface EvidenceRunnerResult {
  decision: EvidenceDecision;
  evidencePhase: EvidencePhase;
  blocked: boolean;
  reasons: string[];
  nextState: TrendPaperEvidenceState;
  paperOnly: true;
  liveActivationAllowed: false;
  exchangeOrderAllowed: false;
}

const ARM_EXPIRY_MINUTES = 20;
const LOCK = { paperOnly: true as const, liveActivationAllowed: false as const, exchangeOrderAllowed: false as const };

function toIso(now: number | string | Date): string {
  return now instanceof Date ? now.toISOString() : new Date(now).toISOString();
}
function toMs(now: number | string | Date): number {
  return now instanceof Date ? now.getTime() : new Date(now).getTime();
}

/** Refresh evidence metrics fields into state from the (journal-derived) metrics — single source of truth. */
function withMetrics(state: TrendPaperEvidenceState, m: TrendEvidenceMetrics): TrendPaperEvidenceState {
  return {
    ...state,
    trendClosedTrades: m.trendClosedTrades,
    sampleStatus: classifyTrendEvidenceSample(m.trendClosedTrades),
    winRate: m.winRate,
    expectancyR: m.expectancyR,
    profitFactor: m.profitFactor,
    maxDrawdownR: m.maxDrawdownR,
    maxConsecutiveLossesObserved: m.maxConsecutiveLosses,
    readyForNextPhase: m.trendClosedTrades >= 30,
  };
}

function result(
  decision: EvidenceDecision,
  evidencePhase: EvidencePhase,
  blocked: boolean,
  reasons: string[],
  nextState: TrendPaperEvidenceState,
): EvidenceRunnerResult {
  return {
    decision,
    evidencePhase,
    blocked,
    reasons,
    nextState: { ...nextState, evidencePhase, lastDecision: decision, lastRejectReasons: reasons, ...LOCK },
    ...LOCK,
  };
}

/**
 * One deterministic evidence cycle. Caller persists `result.nextState` via writeTrendPaperEvidenceState.
 * Pure orchestration — all side effects go through injected deps.
 */
export async function runTrendPaperEvidenceCycle(input: EvidenceRunnerInput): Promise<EvidenceRunnerResult> {
  const nowIso = toIso(input.now);
  const cfg = input.config;
  // base: stamp run time, refresh metrics, apply daily reset, sync config caps into state
  let state = applyDailyReset(input.state, input.now);
  state = {
    ...withMetrics(state, input.metrics),
    lastRunAt: nowIso,
    lastGateStatus: input.gate.effectiveStatus,
    enabled: cfg.runnerEnabled && cfg.simulationEnabled,
    maxEntriesPerDay: cfg.maxEntriesPerDay,
    maxOpenPositions: cfg.maxOpenPositions,
    maxDailyLossR: cfg.dailyLossCapR,
    maxConsecutiveLosses: cfg.maxConsecutiveLosses,
    cooldownMinutes: cfg.cooldownMinutes,
    targetClosedTrades: cfg.targetClosedTrades,
    openTrendPosition: input.openTrendPosition,
    stopReason: null,
  };

  // ---- A) GLOBAL_SAFETY (fail-closed) ----
  const safety = cfg.globalSafety;
  const safetyViolations: string[] = [];
  if (safety.liveTradingEnabled) safetyViolations.push("LIVE_TRADING_ENABLED_true");
  if (safety.orderPlacementEnabled) safetyViolations.push("ENABLE_ORDER_PLACEMENT_true");
  if (safety.productionTradingReady) safetyViolations.push("PRODUCTION_TRADING_READY_true");
  if (safety.exchangeApproved) safetyViolations.push("EXCHANGE_MANUAL_APPROVAL_approved");
  if (input.symbol !== cfg.allowedSymbol) safetyViolations.push(`symbol_not_allowed:${input.symbol}`);
  if (safetyViolations.length > 0) {
    return result("SAFETY_BLOCKED", "SAFETY_BLOCKED", true, safetyViolations, { ...state, stopReason: safetyViolations[0] });
  }

  // runner / simulation disabled → blocked, no action
  if (!cfg.runnerEnabled || !cfg.simulationEnabled) {
    const reasons = [
      ...(!cfg.runnerEnabled ? ["TREND_PAPER_EVIDENCE_RUNNER_ENABLED_false"] : []),
      ...(!cfg.simulationEnabled ? ["TREND_PAPER_SIMULATION_ENABLED_false"] : []),
    ];
    return result("DISABLED", "DISABLED", true, reasons, { ...state, enabled: false });
  }

  // ---- B) EXIT_DRIVE (open position → drive exit; NEVER arm/consume a session) ----
  if (input.openTrendPosition) {
    const exit = await input.driveExitLifecycle();
    let next = state;
    if (exit.closed) {
      // metrics refresh happens next cycle from the journal; clear the open position locally
      next = { ...next, openTrendPosition: null };
    }
    return result("EXIT_DRIVE", "EVIDENCE_COLLECTION", false, [exit.reason], next);
  }

  // ---- C) SAMPLE_TARGET_GATE ----
  if (state.trendClosedTrades >= cfg.targetClosedTrades) {
    return result("REVIEW_READY", "REVIEW_READY", true, ["closed_trades_target_reached"], { ...state, readyForNextPhase: true });
  }

  // ---- D) BUDGET_GATE ----
  const budgetReasons: string[] = [];
  if (state.dailyEntryCount >= cfg.maxEntriesPerDay) budgetReasons.push("daily_entry_cap_reached");
  if (state.dailyLossR <= -cfg.dailyLossCapR) budgetReasons.push("daily_loss_cap_reached");
  if ((input.metrics.maxConsecutiveLosses ?? 0) >= cfg.maxConsecutiveLosses) budgetReasons.push("max_consecutive_losses_reached");
  if (state.cooldownUntil && toMs(state.cooldownUntil) > toMs(input.now)) budgetReasons.push("cooldown_active");
  if (budgetReasons.length > 0) {
    return result("BUDGET_BLOCKED", "EVIDENCE_COLLECTION", true, budgetReasons, state);
  }

  // ---- E) BAR_GATE (one entry attempt per new 1H bar) ----
  if (input.currentBarId != null && input.currentBarId === state.lastCheckedBar) {
    return result("WAIT_NEXT_BAR", "EVIDENCE_COLLECTION", false, ["same_1h_bar"], state);
  }

  // ---- F) GATE_EVAL ----
  if (!input.gate.armable) {
    return result("WAITING_SETUP", "EVIDENCE_COLLECTION", false, input.gate.failedConditions.length ? input.gate.failedConditions : ["gate_not_ready"], state);
  }

  // ---- G) ARM (one-entry rolling session) ----
  const direction = input.gate.direction ?? "ANY";
  await input.createSession(direction, ARM_EXPIRY_MINUTES);
  // mark the bar consumed regardless of outcome (no re-arm same bar)
  const barMarked = { ...state, lastCheckedBar: input.currentBarId };

  // ---- H) ONE_SHOT (run once; never retry this tick) ----
  const shot = await input.runOneShot();
  if (shot.action === "CREATE_PAPER_ENTRY") {
    const cooldownUntil = new Date(toMs(input.now) + cfg.cooldownMinutes * 60_000).toISOString();
    const next: TrendPaperEvidenceState = {
      ...barMarked,
      dailyEntryCount: barMarked.dailyEntryCount + 1,
      cooldownUntil,
    };
    return result("PAPER_ENTRY_CREATED", "EVIDENCE_COLLECTION", false, [shot.reason], next);
  }

  // NO_ACTION after arm → revoke/cleanup session
  await input.cleanupSession();
  return result("NO_ACTION_AFTER_ARM", "EVIDENCE_COLLECTION", false, [shot.reason], barMarked);
}
