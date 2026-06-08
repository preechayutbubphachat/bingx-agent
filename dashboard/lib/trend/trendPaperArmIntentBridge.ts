// dashboard/lib/trend/trendPaperArmIntentBridge.ts
// Phase T-3C — Manual Paper Arm Intent Bridge (pure, read-only).
// Safely derives an EFFECTIVE arm gate from a raw gate + a manual operator-approved paper arm session.
// UPGRADE-ONLY and NARROW: the ONLY upgrade is READY_FOR_OPERATOR_REVIEW → OPERATOR_ARMED_PAPER_ONLY,
// and ONLY when the session is valid+ACTIVE+not-expired+entries-remaining+paperArmIntentRequested===true.
// Never downgrades a real OPERATOR_ARMED_PAPER_ONLY. Never upgrades NOT_READY/BLOCKED/EXPIRED/REJECTED.
// Hard invariants on every path: paperActivationAllowed=false, liveActivationAllowed=false. NO I/O, NO writes.

import type { TrendManualPaperArmGate } from "./trendManualPaperArmGate.ts";
import {
  isTrendPaperArmSessionActive,
  deriveTrendPaperArmSessionStatus,
  validateTrendPaperArmSession,
  type TrendPaperArmSession,
} from "./trendPaperArmSession.ts";

export type TrendPaperArmIntentSource =
  | "RAW_GATE"
  | "SESSION_ARM_INTENT"
  | "SESSION_MISSING"
  | "SESSION_EXPIRED"
  | "SESSION_NOT_ACTIVE"
  | "SESSION_LIMIT_REACHED"
  | "SESSION_NO_ARM_INTENT";

export interface TrendPaperArmIntentBridgeInput {
  trendManualPaperArmGate: TrendManualPaperArmGate | null | undefined;
  trendPaperArmSession?: TrendPaperArmSession | null | undefined;
  now: number | string | Date;
}

export interface TrendPaperArmIntentBridgeResult {
  effectiveGate: TrendManualPaperArmGate | null;
  rawStatus: TrendManualPaperArmGate["status"] | null;
  effectiveStatus: TrendManualPaperArmGate["status"] | null;
  source: TrendPaperArmIntentSource;
  upgradedToArmed: boolean;
  paperArmIntentRequested: boolean;
  reasons: string[];
  paperActivationAllowed: false;
  liveActivationAllowed: false;
}

/**
 * Pure derivation. Returns the effective gate the engine should consume.
 * The engine still only acts on OPERATOR_ARMED_PAPER_ONLY — this bridge is the ONLY sanctioned
 * way to reach that status from READY_FOR_OPERATOR_REVIEW, and only via a valid ACTIVE session intent.
 */
export function deriveEffectiveTrendManualPaperArmGate(
  input: TrendPaperArmIntentBridgeInput,
): TrendPaperArmIntentBridgeResult {
  const gate = input.trendManualPaperArmGate ?? null;
  const session = input.trendPaperArmSession ?? null;
  const now = input.now;
  const rawStatus = gate?.status ?? null;
  const paperArmIntentRequested = session?.paperArmIntentRequested === true;

  const base = { paperActivationAllowed: false as const, liveActivationAllowed: false as const };

  // No gate → nothing to derive.
  if (!gate) {
    return {
      effectiveGate: null, rawStatus, effectiveStatus: null, source: "RAW_GATE",
      upgradedToArmed: false, paperArmIntentRequested, reasons: ["no raw arm gate"], ...base,
    };
  }

  // Already armed → keep as-is (never re-derive / never downgrade).
  if (gate.status === "OPERATOR_ARMED_PAPER_ONLY") {
    return {
      effectiveGate: gate, rawStatus, effectiveStatus: gate.status, source: "RAW_GATE",
      upgradedToArmed: false, paperArmIntentRequested, reasons: ["raw gate already OPERATOR_ARMED_PAPER_ONLY"], ...base,
    };
  }

  // Only READY_FOR_OPERATOR_REVIEW is eligible for upgrade. Everything else is kept verbatim.
  if (gate.status !== "READY_FOR_OPERATOR_REVIEW") {
    return {
      effectiveGate: gate, rawStatus, effectiveStatus: gate.status, source: "RAW_GATE",
      upgradedToArmed: false, paperArmIntentRequested,
      reasons: [`raw gate ${gate.status} not eligible for session arm-intent upgrade`], ...base,
    };
  }

  // READY_FOR_OPERATOR_REVIEW path — inspect the session.
  const keepReady = (source: TrendPaperArmIntentSource, reason: string): TrendPaperArmIntentBridgeResult => ({
    effectiveGate: gate, rawStatus, effectiveStatus: gate.status, source,
    upgradedToArmed: false, paperArmIntentRequested, reasons: [reason], ...base,
  });

  if (!session) return keepReady("SESSION_MISSING", "no paper arm session — stay READY_FOR_OPERATOR_REVIEW");
  if (!validateTrendPaperArmSession(session).valid) {
    return keepReady("SESSION_NOT_ACTIVE", "session invalid — stay READY_FOR_OPERATOR_REVIEW");
  }

  const sessionStatus = deriveTrendPaperArmSessionStatus(session, now);
  if (sessionStatus === "EXPIRED") return keepReady("SESSION_EXPIRED", "session expired — stay READY");
  if (sessionStatus === "LIMIT_REACHED") return keepReady("SESSION_LIMIT_REACHED", "session entry limit reached — stay READY");
  if (sessionStatus !== "ACTIVE" || !isTrendPaperArmSessionActive(session, now)) {
    return keepReady("SESSION_NOT_ACTIVE", "session not ACTIVE — stay READY");
  }
  if (!paperArmIntentRequested) {
    return keepReady("SESSION_NO_ARM_INTENT", "session ACTIVE but paperArmIntentRequested!=true — monitor-only, stay READY");
  }

  // All conditions satisfied → upgrade to OPERATOR_ARMED_PAPER_ONLY (paper-only, activation flags stay false).
  const effectiveGate: TrendManualPaperArmGate = {
    ...gate,
    status: "OPERATOR_ARMED_PAPER_ONLY",
    paperActivationAllowed: false,
    liveActivationAllowed: false,
    notes: [
      ...gate.notes,
      "effective arm via session paper-arm intent (paper-only) — not live, not exchange, not M-0B",
    ],
  };
  return {
    effectiveGate, rawStatus, effectiveStatus: "OPERATOR_ARMED_PAPER_ONLY", source: "SESSION_ARM_INTENT",
    upgradedToArmed: true, paperArmIntentRequested: true,
    reasons: ["READY + ACTIVE session + paperArmIntentRequested=true → effective OPERATOR_ARMED_PAPER_ONLY (paper-only)"],
    ...base,
  };
}
