import type { PlanStatus, StepSetKey } from "./types";

function up(x: unknown) {
  return String(x ?? "").trim().toUpperCase();
}

function isFiniteNumber(x: unknown): x is number {
  return typeof x === "number" && Number.isFinite(x);
}

function getOb(data: PlanStatus) {
  return data?.ob_gate ?? null;
}

function hasObGateSignal(ob: any) {
  if (!ob || typeof ob !== "object") return false;

  const entryStatus = up(ob?.entry?.status ?? ob?.entry?.status_th);

  const bias1 = up(
    ob?.bias_1h ??
      ob?.bias1h ??
      ob?.h1?.bias_1h ??
      ob?.h1?.bias1h
  );

  const hasZone =
    (isFiniteNumber(ob?.h1_ob?.zone?.low) && isFiniteNumber(ob?.h1_ob?.zone?.high)) ||
    (isFiniteNumber(ob?.h1ObZone?.low) && isFiniteNumber(ob?.h1ObZone?.high)) ||
    (Array.isArray(ob?.entry?.entry_zone) &&
      ob.entry.entry_zone.length >= 2 &&
      isFiniteNumber(ob.entry.entry_zone[0]) &&
      isFiniteNumber(ob.entry.entry_zone[1]));

  const hasGates =
    !!(ob?.gates?.touch || ob?.gates?.sweep || ob?.gates?.reclaim || ob?.gates?.choch) ||
    !!(ob?.touch || ob?.sweep || ob?.reclaim || ob?.choch);

  if (!hasZone) return false;

  return !!entryStatus || !!bias1 || hasGates;
}

function obIsReady(ob: any) {
  const s = up(ob?.entry?.status);
  return s === "READY" || s === "CONFIRMED";
}

function explicitBackendStepSet(data: PlanStatus): StepSetKey | null {
  const stepSet = up(data?.plan_status_state?.state?.step_set);

  switch (stepSet) {
    case "GRID_SWEEP_PIPELINE":
    case "BREAKOUT_SWITCH_MODE":
    case "MODE_LOCKED_NO_TRADE":
    case "MODE_LOCKED_TREND":
    case "OB_GATE_STEPSET":
    case "TREND_UP_STEPSET":
    case "TREND_DOWN_STEPSET":
      return stepSet;
    default:
      return null;
  }
}

function isBreakoutLike(planState: string, stateCode: string, marketMode: string) {
  return (
    planState.includes("BREAKOUT") ||
    stateCode.includes("BREAKOUT") ||
    marketMode.includes("BREAKOUT")
  );
}

function isTrendUpLike(
  planState: string,
  stateCode: string,
  marketMode: string,
  marketRegime: string
) {
  return (
    stateCode.includes("TREND_UP") ||
    planState.includes("TREND_UP") ||
    marketMode.includes("TREND_UP") ||
    marketMode.includes("LONG") ||
    marketRegime.includes("TREND_UP")
  );
}

function isTrendDownLike(
  planState: string,
  stateCode: string,
  marketMode: string,
  marketRegime: string
) {
  return (
    stateCode.includes("TREND_DOWN") ||
    planState.includes("TREND_DOWN") ||
    marketMode.includes("TREND_DOWN") ||
    marketMode.includes("SHORT") ||
    marketRegime.includes("TREND_DOWN")
  );
}

function routeStateLooksAuthoritative(data: PlanStatus): boolean {
  const pss = data?.plan_status_state;
  const stateCode = up(pss?.state?.code);
  const stepSet = up(pss?.state?.step_set);
  const hasSteps = Array.isArray(pss?.steps) && pss.steps.length > 0;
  const headline = String(pss?.state?.headline ?? "").trim();

  return Boolean(stateCode || stepSet || hasSteps || headline);
}

function stateDrivenFallbackStepSet(data: PlanStatus): StepSetKey | null {
  const stateCode = up(data?.plan_status_state?.state?.code);
  const planState = up(data?.states?.plan_state ?? data?.plan_state);
  const marketMode = up(
    data?.plan_status_state?.plan?.market_mode ??
      data?.plan?.market_mode
  );
  const marketRegime = up(
    data?.plan_status_state?.plan?.market_regime ??
      data?.plan?.market_regime
  );
  const modeLock = up(data?.mode_lock?.value ?? "");

  if (
    stateCode.includes("BREAKOUT") ||
    planState.includes("BREAKOUT") ||
    marketMode.includes("BREAKOUT")
  ) {
    return "BREAKOUT_SWITCH_MODE";
  }

  if (modeLock === "NO_TRADE" || stateCode.includes("NO_TRADE") || planState.includes("NO_TRADE")) {
    return "MODE_LOCKED_NO_TRADE";
  }

  if (
    stateCode.includes("TREND_UP") ||
    planState.includes("TREND_UP") ||
    marketMode.includes("TREND_UP") ||
    marketMode.includes("LONG") ||
    marketRegime.includes("TREND_UP")
  ) {
    return "TREND_UP_STEPSET";
  }

  if (
    stateCode.includes("TREND_DOWN") ||
    planState.includes("TREND_DOWN") ||
    marketMode.includes("TREND_DOWN") ||
    marketMode.includes("SHORT") ||
    marketRegime.includes("TREND_DOWN")
  ) {
    return "TREND_DOWN_STEPSET";
  }

  if (modeLock === "TREND" || stateCode.includes("TREND")) {
    return "MODE_LOCKED_TREND";
  }

  if (
    stateCode.includes("OB") ||
    stateCode.includes("ENTRY") ||
    stateCode.includes("READY")
  ) {
    return "OB_GATE_STEPSET";
  }

  if (
    stateCode.includes("SWEEP") ||
    stateCode.includes("REJECTION") ||
    stateCode.includes("FAKEOUT") ||
    planState.includes("WAIT_SWEEP") ||
    planState.includes("WAIT_15M_REJECTION") ||
    planState.includes("WAIT_1H_CONFIRM") ||
    planState.includes("RANGE_PLAY")
  ) {
    return "GRID_SWEEP_PIPELINE";
  }

  return null;
}

function legacyFallbackStepSet(data: PlanStatus): StepSetKey | null {
  const modeLock = up(data?.mode_lock?.value ?? "GRID");
  const planState = up(data?.states?.plan_state ?? data?.plan_state);
  const stateCode = up(data?.plan_status_state?.state?.code);

  const marketMode = up(
    data?.plan?.market_mode ??
      data?.plan_status_state?.plan?.market_mode
  );

  const marketRegime = up(
    data?.plan?.market_regime ??
      data?.plan_status_state?.plan?.market_regime
  );

  const ob = getOb(data);
  const hasOb = hasObGateSignal(ob);
  const ready = obIsReady(ob);

  const breakout = isBreakoutLike(planState, stateCode, marketMode);
  const trendUp = isTrendUpLike(planState, stateCode, marketMode, marketRegime);
  const trendDown = isTrendDownLike(planState, stateCode, marketMode, marketRegime);

  if (breakout) {
    return "BREAKOUT_SWITCH_MODE";
  }

  if (modeLock === "NO_TRADE") {
    return "MODE_LOCKED_NO_TRADE";
  }

  if (trendUp) {
    return ready ? "OB_GATE_STEPSET" : "TREND_UP_STEPSET";
  }

  if (trendDown) {
    return ready ? "OB_GATE_STEPSET" : "TREND_DOWN_STEPSET";
  }

  if (modeLock === "TREND") {
    return ready ? "OB_GATE_STEPSET" : "MODE_LOCKED_TREND";
  }

  if (hasOb) return "OB_GATE_STEPSET";

  if (
    planState.includes("WAIT_SWEEP") ||
    planState.includes("WAIT_15M_REJECTION") ||
    planState.includes("WAIT_1H_CONFIRM") ||
    planState.includes("RANGE_PLAY") ||
    stateCode.includes("SWEEP") ||
    stateCode.includes("REJECTION") ||
    stateCode.includes("FAKEOUT")
  ) {
    return "GRID_SWEEP_PIPELINE";
  }

  return null;
}

/**
 * Ownership boundary:
 * - ถ้า backend ส่ง plan_status_state.state.step_set มาแล้ว ให้เชื่ออันนั้นก่อน
 * - ถ้า route state ดู authoritative ให้ derive จาก route state ก่อน
 * - root plan / mode_lock / top-level ob_gate คือแหล่ง truth หลักของ fallback
 * - lock states ต้องชนะ OB hint เสมอ
 * - ห้ามคืน null ออกจาก public picker เพราะ UI builders ต้องได้ StepSetKey เสมอ
 */
export function pickStepSet(data: PlanStatus): StepSetKey {
  const explicit = explicitBackendStepSet(data);
  if (explicit) return explicit;

  if (routeStateLooksAuthoritative(data)) {
    return stateDrivenFallbackStepSet(data) ?? "GRID_SWEEP_PIPELINE";
  }

  const legacy = legacyFallbackStepSet(data);
  if (legacy) return legacy;

  return "GRID_SWEEP_PIPELINE";
}