import type { PlanStatus, StepSetKey } from "./types";

export function pickStepSet(data: PlanStatus): StepSetKey {
    const modeLock = String(data?.mode_lock?.value ?? "GRID").toUpperCase();
    const planState = String(data?.states?.plan_state ?? "").toUpperCase();
    const marketMode = String(data?.plan?.market_mode ?? "").toUpperCase();

    if (modeLock.includes("NO_TRADE") || planState.includes("NO_TRADE")) {
        return "MODE_LOCKED_NO_TRADE";
    }

    // TREND_UP explicit (robust)
    if (marketMode.includes("TREND_UP")) {
        return "TREND_UP_STEPSET";
    }

    // breakout
    if (planState.includes("BREAKOUT") || planState.includes("SWITCH_MODE")) {
        return "BREAKOUT_SWITCH_MODE";
    }

    // trend lock
    if (modeLock.includes("TREND") || planState.includes("TREND")) {
        return "MODE_LOCKED_TREND";
    }

    return "GRID_SWEEP_PIPELINE";
}
