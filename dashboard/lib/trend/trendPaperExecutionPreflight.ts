// dashboard/lib/trend/trendPaperExecutionPreflight.ts
// Phase T-3 Preflight — read-only readiness check for future paper simulated execution.
// Pure: no I/O, no order, NO journal write, NO fill simulation, no live.
// ALL of: paperArmAllowed / paperActivationAllowed / liveActivationAllowed / journalWriteAllowed / simulatedFillAllowed = false.

import type { TrendStrategy } from "./trendStrategy.ts";
import type { TrendManualPaperArmGate } from "./trendManualPaperArmGate.ts";
import type { TrendZoneShadow } from "../market-regime/trendZoneBuilder.ts";
import type { CanonicalMarketRegime } from "../market-regime/canonicalMarketRegime.ts";

export type TrendPreflightStatus =
  | "NOT_READY"
  | "READY_FOR_PAPER_SIMULATION_REVIEW"
  | "BLOCKED"
  | "EXPIRED"
  | "INVALIDATED";

export interface TrendPaperExecutionPreflightInput {
  trendManualPaperArmGate: TrendManualPaperArmGate | null | undefined;
  trendStrategy: TrendStrategy | null | undefined;
  trendZoneCandidate: TrendZoneShadow | null | undefined;
  canonicalMarketRegime: CanonicalMarketRegime | null | undefined;
  currentPrice?: number | null | undefined;
  freshness?: { stale?: boolean | null } | null | undefined;
  minRewardRisk?: number;
  phase2BBlocked?: boolean;
  m0bBlocked?: boolean;
}

export interface TrendPaperExecutionPreflight {
  phase: "T-3_PREFLIGHT";
  status: TrendPreflightStatus;
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
  paperArmAllowed: false;
  paperActivationAllowed: false;
  liveActivationAllowed: false;
  journalWriteAllowed: false;
  simulatedFillAllowed: false;
  oldExposurePolicy: "QUARANTINE_OLD_GRID_EXPOSURE";
  notes: string[];
}

const DEFAULT_MIN_RR = 1.2;

function finite(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function regimeMatches(regime: string | null | undefined, dir: "LONG" | "SHORT" | null): boolean {
  if (dir === "SHORT") return regime === "DOWNTREND";
  if (dir === "LONG") return regime === "UPTREND";
  return false;
}

const REQUIRED = [
  "arm_gate_armed_or_ready",
  "trend_status_awaiting_or_setup_ready",
  "risk_status_pass",
  "confirmation_waiting_or_confirmed",
  "zone_build_ready",
  "entry_available",
  "stop_loss_available",
  "take_profit1_available",
  "reward_risk_min",
  "regime_direction_match",
  "data_fresh",
  "old_grid_exposure_quarantined",
  "phase_2b_blocked",
  "m0b_blocked",
  "live_activation_false",
];

function lockedFields(
  status: TrendPreflightStatus,
  over: Partial<TrendPaperExecutionPreflight>,
): TrendPaperExecutionPreflight {
  return {
    phase: "T-3_PREFLIGHT",
    status,
    requiredInputs: [...REQUIRED],
    passedInputs: [],
    failedInputs: [],
    setupId: null,
    direction: null,
    entry: null,
    stopLoss: null,
    takeProfit1: null,
    takeProfit2: null,
    rewardRisk: null,
    paperArmAllowed: false,
    paperActivationAllowed: false,
    liveActivationAllowed: false,
    journalWriteAllowed: false,
    simulatedFillAllowed: false,
    oldExposurePolicy: "QUARANTINE_OLD_GRID_EXPOSURE",
    notes: [],
    ...over,
  };
}

export function evaluateTrendPaperExecutionPreflight(
  input: TrendPaperExecutionPreflightInput,
): TrendPaperExecutionPreflight {
  const ts = input.trendStrategy ?? null;
  const armGate = input.trendManualPaperArmGate ?? null;
  const zone = input.trendZoneCandidate ?? null;
  const regime = input.canonicalMarketRegime?.regime ?? null;
  const minRR = input.minRewardRisk ?? DEFAULT_MIN_RR;
  const phase2BBlocked = input.phase2BBlocked ?? true;
  const m0bBlocked = input.m0bBlocked ?? true;

  const direction = ts?.direction ?? null;
  const ez = ts?.entryZone ?? null;
  const entry = ez ? (ez[0] + ez[1]) / 2 : null;
  const stopLoss = finite(ts?.invalidation) ? ts!.invalidation : null;
  const tp1 = finite(ts?.target1) ? ts!.target1 : null;
  const tp2 = finite(ts?.target2) ? ts!.target2 : null;
  const rewardRisk = finite(ts?.rewardRisk) ? ts!.rewardRisk : null;
  const setupId = armGate?.setupId ?? null;

  const common = { setupId, direction, entry, stopLoss, takeProfit1: tp1, takeProfit2: tp2, rewardRisk };

  // SAFETY: missing inputs or activation flags unexpectedly true → BLOCKED
  const tsAct = ts as { paperActivationAllowed?: unknown; liveActivationAllowed?: unknown } | null;
  if (!ts || !armGate || tsAct?.paperActivationAllowed === true || tsAct?.liveActivationAllowed === true) {
    return lockedFields("BLOCKED", {
      ...common,
      failedInputs: ["safety_block_missing_inputs_or_activation_flag"],
      notes: ["preflight blocked for safety — no order, no journal, no fill"],
    });
  }

  // EXPIRED / INVALIDATED routed from arm gate / trend strategy
  if (armGate.status === "EXPIRED") {
    return lockedFields("EXPIRED", { ...common, notes: ["arm gate expired — re-review required"] });
  }
  if (armGate.status === "REJECTED_BY_OPERATOR" || ts.status === "INVALIDATED") {
    return lockedFields("INVALIDATED", { ...common, notes: ["setup invalidated or rejected — no preflight pass"] });
  }

  const confirmOk = ts.confirmationStatus === "WAITING_5M_CONFIRM" || ts.confirmationStatus === "CONFIRMED";
  const checks: Record<string, boolean> = {
    arm_gate_armed_or_ready: armGate.status === "OPERATOR_ARMED_PAPER_ONLY" || armGate.status === "READY_FOR_OPERATOR_REVIEW",
    trend_status_awaiting_or_setup_ready: ts.status === "AWAITING_CONFIRMATION" || ts.status === "SETUP_READY",
    risk_status_pass: ts.riskStatus === "PASS",
    confirmation_waiting_or_confirmed: confirmOk,
    zone_build_ready: zone?.buildStatus === "READY",
    entry_available: finite(entry),
    stop_loss_available: finite(stopLoss),
    take_profit1_available: finite(tp1),
    reward_risk_min: finite(rewardRisk) && rewardRisk >= minRR,
    regime_direction_match: regimeMatches(regime, direction),
    data_fresh: input.freshness?.stale !== true,
    old_grid_exposure_quarantined: ts.oldExposurePolicy === "QUARANTINE_OLD_GRID_EXPOSURE",
    phase_2b_blocked: phase2BBlocked === true,
    m0b_blocked: m0bBlocked === true,
    live_activation_false: true, // hard invariant — preflight never permits live
  };

  const passedInputs = REQUIRED.filter((k) => checks[k]);
  const failedInputs = REQUIRED.filter((k) => !checks[k]);

  if (failedInputs.length === 0) {
    return lockedFields("READY_FOR_PAPER_SIMULATION_REVIEW", {
      ...common,
      passedInputs,
      failedInputs,
      notes: [
        "all inputs present — READY for paper-simulation REVIEW only (no order, no journal, no fill)",
        "operator review + explicit paperArm required before any T-3 implementation",
      ],
    });
  }

  return lockedFields("NOT_READY", {
    ...common,
    passedInputs,
    failedInputs,
    notes: ["inputs incomplete — preflight not ready; stay shadow (no order, no fill)"],
  });
}
