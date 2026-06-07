// dashboard/lib/trend/trendManualPaperArmGate.ts
// Phase T-2 Shadow — Trend Manual Paper Arm Gate (read-only evaluator).
// Pure: no I/O, no side effects, no order/execution intent, NO arm action.
// armed (T-2) != executed (T-3). paperActivationAllowed/liveActivationAllowed ALWAYS false.

import type { TrendStrategy } from "./trendStrategy.ts";
import type { TrendZoneShadow } from "../market-regime/trendZoneBuilder.ts";
import type { CanonicalMarketRegime } from "../market-regime/canonicalMarketRegime.ts";
import type { IndicatorGate } from "../grid/indicatorGate.ts";

export type TrendArmGatePhase =
  | "T-2_DESIGN"
  | "T-2_READY_FOR_OPERATOR"
  | "T-2_ARMED"
  | "T-2_REJECTED"
  | "T-2_EXPIRED";

export type TrendArmGateStatus =
  | "NOT_READY"
  | "READY_FOR_OPERATOR_REVIEW"
  | "OPERATOR_ARMED_PAPER_ONLY"
  | "REJECTED_BY_OPERATOR"
  | "EXPIRED"
  | "BLOCKED";

export interface TrendManualPaperArmGateInput {
  trendStrategy: TrendStrategy | null | undefined;
  trendZoneCandidate: TrendZoneShadow | null | undefined;
  canonicalMarketRegime: CanonicalMarketRegime | null | undefined;
  indicatorGate?: IndicatorGate | null | undefined;
  currentPrice?: number | null | undefined;
  freshness?: { stale?: boolean | null } | null | undefined;
  phase2BBlocked?: boolean;          // default true (asserted)
  m0bBlocked?: boolean;              // default true (asserted)
  minRewardRisk?: number;
  nearTargetThresholdPct?: number;
  zoneEdgeTolerancePct?: number;
  /** ISO time when setup entered AWAITING_CONFIRMATION (for expiry); optional */
  awaitingSince?: string | null;
  expiryMs?: number;                 // default 15m
  checkedAt?: string | null;
}

export interface TrendManualPaperArmGate {
  phase: TrendArmGatePhase;
  status: TrendArmGateStatus;
  requiredConditions: string[];
  passedConditions: string[];
  failedConditions: string[];
  operatorActionRequired: boolean;
  setupId: string | null;
  expiryAt: string | null;
  paperActivationAllowed: false;
  liveActivationAllowed: false;
  notes: string[];
}

const DEFAULT_MIN_RR = 1.2;
const DEFAULT_NEAR_TARGET_PCT = 0.3;
const DEFAULT_ZONE_EDGE_TOL_PCT = 0.1;
const DEFAULT_EXPIRY_MS = 15 * 60 * 1000; // 15m

function finite(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}
function pctDist(a: number, b: number): number {
  return Math.abs(a - b) / Math.max(Math.abs(b), Number.EPSILON) * 100;
}

const REQUIRED = [
  "trend_phase_t1_shadow",
  "trend_status_awaiting_or_setup_ready",
  "risk_status_pass",
  "reward_risk_min",
  "confirmation_required",
  "confirmation_waiting_5m",
  "zone_build_ready",
  "price_inside_entry_zone_or_edge",
  "price_not_near_target",
  "regime_direction_match",
  "indicator_gate_not_conflicting",
  "data_fresh",
  "old_grid_exposure_quarantined",
  "phase_2b_blocked",
  "m0b_blocked",
];

function regimeMatches(regime: string | null | undefined, dir: "LONG" | "SHORT" | null): boolean {
  if (dir === "SHORT") return regime === "DOWNTREND";
  if (dir === "LONG") return regime === "UPTREND";
  return false;
}

function setupIdOf(ts: TrendStrategy | null, regime: string | null): string | null {
  if (!ts || !ts.entryZone) return null;
  const lo = Math.round(ts.entryZone[0] * 100) / 100;
  const hi = Math.round(ts.entryZone[1] * 100) / 100;
  return `trend-arm:${ts.direction ?? "NONE"}:${regime ?? "NONE"}:${lo}-${hi}`;
}

function base(overrides: Partial<TrendManualPaperArmGate>): TrendManualPaperArmGate {
  return {
    phase: "T-2_DESIGN",
    status: "NOT_READY",
    requiredConditions: [...REQUIRED],
    passedConditions: [],
    failedConditions: [],
    operatorActionRequired: false,
    setupId: null,
    expiryAt: null,
    paperActivationAllowed: false,
    liveActivationAllowed: false,
    notes: [],
    ...overrides,
  };
}

export function evaluateTrendManualPaperArmGate(input: TrendManualPaperArmGateInput): TrendManualPaperArmGate {
  const ts = input.trendStrategy ?? null;
  const regime = input.canonicalMarketRegime?.regime ?? null;
  const zone = input.trendZoneCandidate ?? null;
  const setupId = setupIdOf(ts, regime);
  const notes: string[] = [];

  // SAFETY: missing strategy or activation flags unexpectedly true → BLOCKED
  const actState = ts as { paperActivationAllowed?: unknown; liveActivationAllowed?: unknown } | null;
  if (!ts || actState?.paperActivationAllowed === true || actState?.liveActivationAllowed === true) {
    return base({
      status: "BLOCKED",
      setupId,
      operatorActionRequired: false,
      failedConditions: ["safety_block_missing_strategy_or_activation_flag"],
      notes: ["arm gate blocked for safety — no arm, no order"],
    });
  }

  const minRR = input.minRewardRisk ?? DEFAULT_MIN_RR;
  const nearTargetPct = input.nearTargetThresholdPct ?? DEFAULT_NEAR_TARGET_PCT;
  const edgeTol = input.zoneEdgeTolerancePct ?? DEFAULT_ZONE_EDGE_TOL_PCT;
  const price = finite(input.currentPrice) ? input.currentPrice : ts.currentPrice;
  const ez = ts.entryZone;
  const t1 = ts.target1;
  const phase2BBlocked = input.phase2BBlocked ?? true;
  const m0bBlocked = input.m0bBlocked ?? true;

  const insideOrEdge = (() => {
    if (!finite(price) || !ez) return false;
    if (price >= ez[0] && price <= ez[1]) return true;
    const edge = price < ez[0] ? ez[0] : ez[1];
    return pctDist(price, edge) <= edgeTol;
  })();
  const notNearTarget = ts.riskStatus !== "NO_TRADE_NEAR_TARGET" && (!finite(price) || !finite(t1) ? true : pctDist(price, t1) > nearTargetPct);
  const igStatus = input.indicatorGate?.status ?? null;
  // conflicting if indicator data insufficient or recovery-against-short bias
  const indicatorNotConflicting = igStatus != null && igStatus !== "INSUFFICIENT_DATA" &&
    !(ts.direction === "SHORT" && igStatus === "RECOVERY_WATCH");

  const checks: Record<string, boolean> = {
    trend_phase_t1_shadow: ts.phase === "T-1_SHADOW",
    trend_status_awaiting_or_setup_ready: ts.status === "AWAITING_CONFIRMATION" || ts.status === "SETUP_READY",
    risk_status_pass: ts.riskStatus === "PASS",
    reward_risk_min: finite(ts.rewardRisk) && ts.rewardRisk >= minRR,
    confirmation_required: ts.confirmationRequired === true,
    confirmation_waiting_5m: ts.confirmationStatus === "WAITING_5M_CONFIRM",
    zone_build_ready: zone?.buildStatus === "READY",
    price_inside_entry_zone_or_edge: insideOrEdge,
    price_not_near_target: notNearTarget,
    regime_direction_match: regimeMatches(regime, ts.direction),
    indicator_gate_not_conflicting: indicatorNotConflicting,
    data_fresh: input.freshness?.stale !== true,
    old_grid_exposure_quarantined: ts.oldExposurePolicy === "QUARANTINE_OLD_GRID_EXPOSURE",
    phase_2b_blocked: phase2BBlocked === true,
    m0b_blocked: m0bBlocked === true,
  };

  const passedConditions = REQUIRED.filter((k) => checks[k]);
  const failedConditions = REQUIRED.filter((k) => !checks[k]);

  // expiry (only meaningful once setup is in the AWAITING window)
  let expiryAt: string | null = null;
  if (input.awaitingSince) {
    const startMs = Date.parse(input.awaitingSince);
    if (Number.isFinite(startMs)) {
      const expMs = startMs + (input.expiryMs ?? DEFAULT_EXPIRY_MS);
      expiryAt = new Date(expMs).toISOString();
      const nowMs = input.checkedAt ? Date.parse(input.checkedAt) : Date.now();
      if (Number.isFinite(nowMs) && nowMs >= expMs) {
        return base({
          phase: "T-2_EXPIRED",
          status: "EXPIRED",
          setupId,
          expiryAt,
          passedConditions,
          failedConditions: [...failedConditions, "arm_window_expired"],
          operatorActionRequired: false,
          notes: ["arm window expired — re-review required, no arm"],
        });
      }
    }
  }

  const allPass = failedConditions.length === 0;
  if (allPass) {
    return base({
      phase: "T-2_READY_FOR_OPERATOR",
      status: "READY_FOR_OPERATOR_REVIEW",
      setupId,
      expiryAt,
      passedConditions,
      failedConditions,
      operatorActionRequired: true,
      notes: [
        "READY for operator review (paper-only) — manual arm required; no auto arm, no order",
        ...notes,
      ],
    });
  }

  return base({
    phase: "T-2_DESIGN",
    status: "NOT_READY",
    setupId,
    expiryAt,
    passedConditions,
    failedConditions,
    operatorActionRequired: false,
    notes: ["not ready — conditions incomplete; stay shadow (no arm)"],
  });
}
