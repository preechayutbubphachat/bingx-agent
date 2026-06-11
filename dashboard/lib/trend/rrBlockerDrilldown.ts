// dashboard/lib/trend/rrBlockerDrilldown.ts
// Phase T-3H-6-b - Reward/Risk Blocker Drilldown (PURE, display/observability only).
//
// SAFETY:
//   - Pure functions, no I/O. NEVER imported by runner/strategy/gate/decision code.
//   - Computes DIAGNOSTIC views of why reward_risk_min fails for the LATEST setup.
//   - Does NOT change any threshold, does NOT decide entries, does NOT implement
//     adaptive RR (that is design-only; see docs/T-3H-6b_adaptive_rr_shadow_design.md).
//   - Reason classification uses documented display heuristics; UNKNOWN when data is missing.

export type RrFailSeverity = "PASS" | "NEAR_MISS" | "MODERATE_GAP" | "HARD_GAP";

export type RrFailReason =
  | "TARGET_TOO_CLOSE"
  | "STOP_TOO_WIDE"
  | "ENTRY_TOO_FAR"
  | "COST_TOO_HIGH"
  | "VOLATILITY_UNSUITABLE"
  | "UNKNOWN";

export const NEAR_MISS_MAX_GAP = 0.15;
export const MODERATE_MAX_GAP = 0.5;
/** display heuristic: entry considered "far" when |distance to zone| exceeds this % */
export const ENTRY_FAR_PCT = 1.0;

export interface RrDrilldownInput {
  /** raw reward:risk of the latest setup (e.g. trendStrategy.rewardRisk) */
  rawRR: number | null | undefined;
  /** configured minimum RR (e.g. trendPaperConfigPublic.minRewardRisk) */
  requiredRR: number | null | undefined;
  entry?: number | null;
  stopLoss?: number | null;
  target1?: number | null;
  currentPrice?: number | null;
  distanceToEntryZonePct?: number | null;
  /** trendStrategy.riskStatus - authoritative signals like NO_TRADE_NEAR_TARGET */
  riskStatus?: string | null;
  /** % per side (e.g. 0.05) */
  feePct?: number | null;
  /** % per side (e.g. 0.02) */
  slippagePct?: number | null;
}

export interface RrDrilldownResult {
  /** true when rawRR and requiredRR are both finite (drilldown is meaningful) */
  available: boolean;
  rawRR: number | null;
  requiredRR: number | null;
  /** requiredRR - rawRR (positive = failing by this much) */
  rrGap: number | null;
  riskDistance: number | null;
  rewardDistance: number | null;
  /** round-trip cost expressed in R units (approximation; null when inputs missing) */
  costR: number | null;
  /** rawRR - costR (display only) */
  netRR: number | null;
  failSeverity: RrFailSeverity | null;
  /** null when PASS or unavailable */
  reason: RrFailReason | null;
}

const fin = (v: number | null | undefined): v is number => typeof v === "number" && Number.isFinite(v);

function round4(v: number): number {
  return Math.round(v * 10_000) / 10_000;
}

export function computeRrBlockerDrilldown(input: RrDrilldownInput): RrDrilldownResult {
  const rawRR = fin(input.rawRR) ? input.rawRR : null;
  const requiredRR = fin(input.requiredRR) ? input.requiredRR : null;

  const entry = fin(input.entry) ? input.entry : null;
  const stop = fin(input.stopLoss) ? input.stopLoss : null;
  const target = fin(input.target1) ? input.target1 : null;

  const riskDistance = entry != null && stop != null ? round4(Math.abs(entry - stop)) : null;
  const rewardDistance = entry != null && target != null ? round4(Math.abs(target - entry)) : null;

  // Round-trip cost (entry + exit, fee + slippage per side) expressed in R units.
  let costR: number | null = null;
  if (entry != null && riskDistance != null && riskDistance > 0 && (fin(input.feePct) || fin(input.slippagePct))) {
    const perSidePct = (fin(input.feePct) ? input.feePct : 0) + (fin(input.slippagePct) ? input.slippagePct : 0);
    const roundTripAbs = ((perSidePct * 2) / 100) * entry;
    costR = round4(roundTripAbs / riskDistance);
  }
  const netRR = rawRR != null && costR != null ? round4(rawRR - costR) : null;

  if (rawRR == null || requiredRR == null) {
    return {
      available: false,
      rawRR,
      requiredRR,
      rrGap: null,
      riskDistance,
      rewardDistance,
      costR,
      netRR,
      failSeverity: null,
      reason: null,
    };
  }

  const rrGap = round4(requiredRR - rawRR);

  let failSeverity: RrFailSeverity;
  if (rrGap <= 0) failSeverity = "PASS";
  else if (rrGap <= NEAR_MISS_MAX_GAP) failSeverity = "NEAR_MISS";
  else if (rrGap <= MODERATE_MAX_GAP) failSeverity = "MODERATE_GAP";
  else failSeverity = "HARD_GAP";

  let reason: RrFailReason | null = null;
  if (failSeverity !== "PASS") {
    const rs = (input.riskStatus ?? "").toUpperCase();
    const dist = fin(input.distanceToEntryZonePct) ? Math.abs(input.distanceToEntryZonePct) : null;

    if (rs === "NO_TRADE_NEAR_TARGET") reason = "TARGET_TOO_CLOSE";
    else if (rs === "NO_TRADE_VOLATILITY") reason = "VOLATILITY_UNSUITABLE";
    else if (costR != null && netRR != null && netRR < requiredRR && costR >= Math.max(0.05, rrGap)) reason = "COST_TOO_HIGH";
    else if (dist != null && dist > ENTRY_FAR_PCT) reason = "ENTRY_TOO_FAR";
    else if (riskDistance != null && rewardDistance != null && riskDistance > 0) {
      // Display heuristic:
      //   reward leg shorter than risk leg (RR < 1)  -> TARGET_TOO_CLOSE
      //   RR >= 1 but still below requiredRR         -> STOP_TOO_WIDE
      reason = rewardDistance < riskDistance ? "TARGET_TOO_CLOSE" : "STOP_TOO_WIDE";
    } else {
      reason = "UNKNOWN";
    }
  }

  return {
    available: true,
    rawRR: round4(rawRR),
    requiredRR: round4(requiredRR),
    rrGap,
    riskDistance,
    rewardDistance,
    costR,
    netRR,
    failSeverity,
    reason,
  };
}

export const RR_REASON_LABEL_TH: Record<RrFailReason, string> = {
  TARGET_TOO_CLOSE: "เป้าใกล้เกินไป (reward สั้น)",
  STOP_TOO_WIDE: "stop กว้างเกินไป (risk ยาว)",
  ENTRY_TOO_FAR: "entry ไกลจาก zone",
  COST_TOO_HIGH: "ต้นทุน fee/slippage กิน RR",
  VOLATILITY_UNSUITABLE: "volatility ไม่เหมาะ",
  UNKNOWN: "ข้อมูลไม่พอสรุปสาเหตุ",
};

export const RR_SEVERITY_LABEL_TH: Record<RrFailSeverity, string> = {
  PASS: "ผ่านเกณฑ์ RR",
  NEAR_MISS: "เกือบผ่าน (gap <= 0.15)",
  MODERATE_GAP: "ห่างปานกลาง (gap <= 0.50)",
  HARD_GAP: "ห่างมาก (gap > 0.50)",
};
