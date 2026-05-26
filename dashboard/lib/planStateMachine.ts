export type PlanMachineState =
  | "HOLD"
  | "NO_TRADE_LOCKED"
  | "WAIT_PULLBACK"
  | "WAIT_CONFIRM"
  | "READY"
  | "IN_POSITION"
  | "REDUCE"
  | "EXIT"
  | "FAIL_SAFE";

export type PlanMachineEventType =
  | "ANALYSIS_REFRESHED"
  | "MODE_LOCK_CHANGED"
  | "NO_TRADE_SIGNAL"
  | "PULLBACK_DETECTED"
  | "CONFIRMATION_DETECTED"
  | "SETUP_INVALIDATED"
  | "BREAKOUT_CONFIRMED"
  | "RANGE_RECOVERED"
  | "FAIL_SAFE_TRIGGERED"
  | "FAIL_SAFE_RECOVERED"
  | "RISK_FREEZE_TRIGGERED"
  | "RISK_REDUCE_TRIGGERED"
  | "STALE_DATA_TRIGGERED"
  | "CANONICAL_MISMATCH_TRIGGERED"
  | "MARKER_MISMATCH_TRIGGERED"
  | "ENTRY_ACCEPTED"
  | "ENTRY_FILLED"
  | "PARTIAL_EXIT_FILLED"
  | "FULL_EXIT_FILLED"
  | "STOP_HIT"
  | "TAKE_PROFIT_HIT"
  | "MANUAL_EXIT_REQUESTED"
  | "RECONCILE_POSITION_MISMATCH"
  | "RESET_TO_HOLD"
  | "RECOVER_TO_HOLD"
  | "RECOVER_TO_NO_TRADE";

export type FailSafeMode = "NORMAL" | "DEGRADED" | "HARD_STOP" | "UNKNOWN";
export type ModeLock = "NO_TRADE" | "GRID" | "TREND" | "UNKNOWN";
export type PositionState = "FLAT" | "OPEN" | "REDUCING" | "EXITING" | "UNKNOWN";
export type GuardSeverity = "info" | "warn" | "block";
export type TransitionDominantLayer = "fail_safe" | "risk" | "position" | "strategy" | "default";

export type PlanMachineEvent = {
  type: PlanMachineEventType;
  reason?: string | null;
  eventKey?: string | null;
  closeTs5m?: number | null;
  payload?: Record<string, unknown> | null;
};

export type PlanMachineContext = {
  modeLock?: ModeLock | null;
  failSafeMode?: FailSafeMode | null;
  canonicalPlanPresent?: boolean | null;
  canonicalConsistent?: boolean | null;
  markerProofConsistent?: boolean | null;
  sourceFresh?: boolean | null;
  derivativesFresh?: boolean | null;
  riskFrozen?: boolean | null;
  shouldReduceRisk?: boolean | null;
  shouldExit?: boolean | null;
  hasOpenPosition?: boolean | null;
  positionState?: PositionState | null;
  pendingReanalyze?: boolean | null;
};

type NormalizedPlanMachineContext = {
  modeLock: ModeLock;
  failSafeMode: FailSafeMode;
  canonicalPlanPresent: boolean;
  canonicalConsistent: boolean;
  markerProofConsistent: boolean;
  sourceFresh: boolean;
  derivativesFresh: boolean;
  riskFrozen: boolean;
  shouldReduceRisk: boolean;
  shouldExit: boolean;
  hasOpenPosition: boolean;
  positionState: PositionState;
  pendingReanalyze: boolean;
};

export type GuardResult = {
  name: string;
  ok: boolean;
  severity: GuardSeverity;
  message: string;
};

export type TransitionResult = {
  previousState: PlanMachineState;
  nextState: PlanMachineState;
  changed: boolean;
  dominantLayer: TransitionDominantLayer;
  guards: GuardResult[];
  reasons: string[];
};

function asBool(v: unknown, fallback = false) {
  return typeof v === "boolean" ? v : fallback;
}

function normalizeModeLock(v: unknown): ModeLock {
  const raw = String(v ?? "").trim().toUpperCase();
  if (raw === "NO_TRADE") return "NO_TRADE";
  if (raw === "GRID") return "GRID";
  if (raw === "TREND") return "TREND";
  return "UNKNOWN";
}

function normalizeFailSafeMode(v: unknown): FailSafeMode {
  const raw = String(v ?? "").trim().toUpperCase();
  if (raw === "NORMAL") return "NORMAL";
  if (raw === "DEGRADED") return "DEGRADED";
  if (raw === "HARD_STOP") return "HARD_STOP";
  return "UNKNOWN";
}

function normalizePositionState(v: unknown): PositionState {
  const raw = String(v ?? "").trim().toUpperCase();
  if (raw === "FLAT") return "FLAT";
  if (raw === "OPEN") return "OPEN";
  if (raw === "REDUCING") return "REDUCING";
  if (raw === "EXITING") return "EXITING";
  return "UNKNOWN";
}

function normalizeContext(context?: PlanMachineContext): NormalizedPlanMachineContext {
  return {
    modeLock: normalizeModeLock(context?.modeLock),
    failSafeMode: normalizeFailSafeMode(context?.failSafeMode),
    canonicalPlanPresent: asBool(context?.canonicalPlanPresent),
    canonicalConsistent: asBool(context?.canonicalConsistent),
    markerProofConsistent: asBool(context?.markerProofConsistent),
    sourceFresh: asBool(context?.sourceFresh),
    derivativesFresh: asBool(context?.derivativesFresh),
    riskFrozen: asBool(context?.riskFrozen),
    shouldReduceRisk: asBool(context?.shouldReduceRisk),
    shouldExit: asBool(context?.shouldExit),
    hasOpenPosition: asBool(context?.hasOpenPosition),
    positionState: normalizePositionState(context?.positionState),
    pendingReanalyze: asBool(context?.pendingReanalyze),
  };
}

function buildGuards(context: NormalizedPlanMachineContext): GuardResult[] {
  return [
    {
      name: "canonical_plan_present",
      ok: context.canonicalPlanPresent,
      severity: "warn",
      message: context.canonicalPlanPresent
        ? "canonical plan present"
        : "canonical plan missing; conservative fallback required",
    },
    {
      name: "canonical_consistent",
      ok: context.canonicalConsistent,
      severity: "block",
      message: context.canonicalConsistent
        ? "canonical state consistent"
        : "canonical mismatch detected",
    },
    {
      name: "marker_proof_consistent",
      ok: context.markerProofConsistent,
      severity: "block",
      message: context.markerProofConsistent
        ? "marker proof consistent"
        : "marker mismatch detected",
    },
    {
      name: "source_fresh",
      ok: context.sourceFresh,
      severity: "warn",
      message: context.sourceFresh ? "source freshness acceptable" : "source data stale or unknown",
    },
    {
      name: "derivatives_fresh",
      ok: context.derivativesFresh,
      severity: "warn",
      message: context.derivativesFresh
        ? "derivatives freshness acceptable"
        : "derivatives data stale or unknown",
    },
    {
      name: "risk_not_frozen",
      ok: !context.riskFrozen,
      severity: "block",
      message: context.riskFrozen ? "risk freeze active" : "risk engine allows evaluation",
    },
  ];
}

function hasBlockingTruthFailure(context: NormalizedPlanMachineContext) {
  return (
    context.failSafeMode === "HARD_STOP" ||
    !context.markerProofConsistent ||
    !context.canonicalConsistent ||
    context.riskFrozen
  );
}

function shouldHoldConservatively(context: NormalizedPlanMachineContext) {
  return !context.sourceFresh || !context.derivativesFresh || !context.canonicalPlanPresent;
}

function result(
  previousState: PlanMachineState,
  nextState: PlanMachineState,
  dominantLayer: TransitionDominantLayer,
  guards: GuardResult[],
  reasons: string[]
): TransitionResult {
  return {
    previousState,
    nextState,
    changed: previousState !== nextState,
    dominantLayer,
    guards,
    reasons,
  };
}

export function transitionState(
  currentState: PlanMachineState,
  event: PlanMachineEvent,
  context?: PlanMachineContext
): TransitionResult {
  const ctx = normalizeContext(context);
  const guards = buildGuards(ctx);
  const reasons: string[] = [];

  if (hasBlockingTruthFailure(ctx) || event.type === "FAIL_SAFE_TRIGGERED") {
    reasons.push(event.reason || "fail-safe dominant transition");
    return result(currentState, "FAIL_SAFE", "fail_safe", guards, reasons);
  }

  if (currentState === "FAIL_SAFE") {
    if (
      event.type === "FAIL_SAFE_RECOVERED" ||
      event.type === "RECOVER_TO_HOLD" ||
      event.type === "RECOVER_TO_NO_TRADE"
    ) {
      if (ctx.hasOpenPosition || ctx.positionState === "OPEN" || ctx.positionState === "REDUCING") {
        reasons.push("cannot leave FAIL_SAFE while open exposure remains");
        return result(currentState, "FAIL_SAFE", "fail_safe", guards, reasons);
      }

      if (ctx.modeLock === "NO_TRADE" || event.type === "RECOVER_TO_NO_TRADE") {
        reasons.push("recovered from fail-safe into explicit no-trade lock");
        return result(currentState, "NO_TRADE_LOCKED", "fail_safe", guards, reasons);
      }

      reasons.push("recovered from fail-safe into conservative hold");
      return result(currentState, "HOLD", "fail_safe", guards, reasons);
    }

    reasons.push("fail-safe remains active");
    return result(currentState, "FAIL_SAFE", "fail_safe", guards, reasons);
  }

  if (ctx.modeLock === "NO_TRADE" || event.type === "NO_TRADE_SIGNAL") {
    reasons.push(event.reason || "mode lock requires no-trade");
    return result(currentState, "NO_TRADE_LOCKED", "risk", guards, reasons);
  }

  if (ctx.shouldExit || event.type === "STOP_HIT" || event.type === "MANUAL_EXIT_REQUESTED") {
    reasons.push(event.reason || "exit requested");
    return result(currentState, "EXIT", "position", guards, reasons);
  }

  if (ctx.shouldReduceRisk || event.type === "RISK_REDUCE_TRIGGERED") {
    if (ctx.hasOpenPosition || currentState === "IN_POSITION") {
      reasons.push(event.reason || "risk reduction requested");
      return result(currentState, "REDUCE", "risk", guards, reasons);
    }
  }

  if (event.type === "ENTRY_FILLED") {
    reasons.push(event.reason || "position opened");
    return result(currentState, "IN_POSITION", "position", guards, reasons);
  }

  if (event.type === "PARTIAL_EXIT_FILLED") {
    if (ctx.hasOpenPosition) {
      reasons.push(event.reason || "partial exit filled; exposure remains");
      return result(currentState, "IN_POSITION", "position", guards, reasons);
    }

    reasons.push(event.reason || "partial exit event closed final exposure");
    return result(currentState, "EXIT", "position", guards, reasons);
  }

  if (event.type === "FULL_EXIT_FILLED") {
    reasons.push(event.reason || "position fully closed");
    return result(currentState, "HOLD", "position", guards, reasons);
  }

  if (shouldHoldConservatively(ctx)) {
    reasons.push("conservative hold due to incomplete truth or stale inputs");
    return result(currentState, "HOLD", "default", guards, reasons);
  }

  switch (event.type) {
    case "RESET_TO_HOLD":
    case "RECOVER_TO_HOLD":
    case "ANALYSIS_REFRESHED":
      reasons.push(event.reason || "analysis refreshed");
      return result(currentState, "HOLD", "default", guards, reasons);

    case "PULLBACK_DETECTED":
      reasons.push(event.reason || "pullback setup detected");
      return result(currentState, "WAIT_PULLBACK", "strategy", guards, reasons);

    case "CONFIRMATION_DETECTED":
      if (currentState === "WAIT_CONFIRM") {
        reasons.push(event.reason || "confirmation completed; setup ready");
        return result(currentState, "READY", "strategy", guards, reasons);
      }

      reasons.push(event.reason || "confirmation evidence seen; waiting final readiness");
      return result(currentState, "WAIT_CONFIRM", "strategy", guards, reasons);

    case "SETUP_INVALIDATED":
    case "BREAKOUT_CONFIRMED":
    case "RANGE_RECOVERED":
      reasons.push(event.reason || "setup invalidated or reset to neutral");
      return result(currentState, "HOLD", "strategy", guards, reasons);

    case "ENTRY_ACCEPTED":
      reasons.push(event.reason || "entry accepted but not filled");
      return result(currentState, "READY", "strategy", guards, reasons);

    case "TAKE_PROFIT_HIT":
      if (ctx.hasOpenPosition) {
        reasons.push(event.reason || "take profit hit while still exposed");
        return result(currentState, "REDUCE", "position", guards, reasons);
      }

      reasons.push(event.reason || "take profit closed exposure");
      return result(currentState, "HOLD", "position", guards, reasons);

    case "RECONCILE_POSITION_MISMATCH":
    case "STALE_DATA_TRIGGERED":
    case "CANONICAL_MISMATCH_TRIGGERED":
    case "MARKER_MISMATCH_TRIGGERED":
      reasons.push(event.reason || "safety mismatch requires fail-safe");
      return result(currentState, "FAIL_SAFE", "fail_safe", guards, reasons);

    case "MODE_LOCK_CHANGED":
      reasons.push(event.reason || "mode changed; reset to hold");
      return result(currentState, "HOLD", "strategy", guards, reasons);

    case "RECOVER_TO_NO_TRADE":
      reasons.push(event.reason || "recover conservatively into no-trade");
      return result(currentState, "NO_TRADE_LOCKED", "risk", guards, reasons);

    default:
      reasons.push(event.reason || "unsupported or no-op event; preserve state");
      return result(currentState, currentState, "default", guards, reasons);
  }
}

export function normalizeLegacyPlanState(input: unknown): PlanMachineState {
  const raw = String(input ?? "").trim().toUpperCase();

  if (!raw) return "HOLD";
  if (raw.includes("FAIL_SAFE")) return "FAIL_SAFE";
  if (raw.includes("NO_TRADE")) return "NO_TRADE_LOCKED";
  if (raw.includes("IN_POSITION")) return "IN_POSITION";
  if (raw.includes("REDUCE")) return "REDUCE";
  if (raw.includes("EXIT")) return "EXIT";
  if (raw.includes("FAKEOUT_CONFIRMED") || raw.includes("RANGE_PLAY")) return "READY";
  if (raw.includes("TREND_READY")) return "READY";
  if (raw.includes("READY")) return "READY";
  if (raw.includes("WAIT_1H_CONFIRM") || raw.includes("WAIT_CONFIRM")) return "WAIT_CONFIRM";
  if (raw.includes("WAIT_15M_REJECTION") || raw.includes("WAIT_PULLBACK")) return "WAIT_PULLBACK";
  if (raw.includes("WAIT_SWEEP") || raw.includes("LOCKED")) return "HOLD";
  return "HOLD";
}
