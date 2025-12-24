import type {
    BuildStepsResult,
    PlanStatus,
    StepUI,
    StepSetKey,
    StepStatus,
    EngineStepStatus,
    PlanStatusState,
} from "./types";

import { pickStepSet } from "./pickStepSet";

import { buildGridSweepPipeline } from "./sets/gridSweepPipeline";
import { buildBreakoutSwitchMode } from "./sets/breakoutSwitchMode";
import { buildModeLockedNoTrade } from "./sets/modeLockedNoTrade";
import { buildModeLockedTrend } from "./sets/modeLockedTrend";
import { buildTrendUpStepSet } from "./sets/modeLockedTrendUp";


/** map status จาก backend -> UI */
function mapEngineToUIStatus(s: EngineStepStatus): StepStatus {
  if (s === "PASS" || s === "DONE") return "CONFIRMED";
  if (s === "WAITING" || s === "WARN") return "WAITING";
  return "FAILED";
}


function badgeFromEngine(s: EngineStepStatus) {
    if (s === "PASS") return "PASS";
    if (s === "DONE") return "DONE";
    if (s === "WARN") return "WARN";
    if (s === "FAIL") return "FAIL";
    return "WAIT";
}

function activeStepFromEngine(steps: Array<{ id: string; status: EngineStepStatus }>): string | null {
    const w = steps.find((x) => x.status === "WAITING" || x.status === "WARN");
    if (w) return w.id;
    const f = steps.find((x) => x.status === "FAIL");
    return f ? f.id : null;
}

function activeStepIdFrom(steps: StepUI[]): string | null {
    return steps.find((s) => s.status === "WAITING" || s.status === "FAILED")?.id ?? null;
}

function buildFromPlanStatusState(data: PlanStatus, ps: PlanStatusState): BuildStepsResult {
    const steps: StepUI[] = (ps.steps ?? []).map((x) => ({
        id: x.id,
        title: x.title,
        status: mapEngineToUIStatus(x.status),
        badge: badgeFromEngine(x.status),
        detail: x.why ?? "",
        why: x.status ? `engine:${x.status}` : undefined,
    }));

    const activeStepId = activeStepFromEngine(ps.steps ?? []);
    const key = (ps.state?.step_set as StepSetKey | undefined) ?? pickStepSet(data);

    return {
        key,
        title: ps.state?.headline ?? "Plan Steps",
        activeStepId,
        steps,
    };
}

export function buildSteps(data: PlanStatus): BuildStepsResult {
    // 1) backend-first
    const ps = data?.plan_status_state ?? null;
    if (ps?.steps?.length) return buildFromPlanStatusState(data, ps);

    // 2) fallback sets
    const key = pickStepSet(data);

    if (key === "BREAKOUT_SWITCH_MODE") {
        const { title, steps } = buildBreakoutSwitchMode(data);
        return { key, title, steps, activeStepId: activeStepIdFrom(steps) };
    }

    if (key === "MODE_LOCKED_NO_TRADE") {
        const { title, steps } = buildModeLockedNoTrade(data);
        return { key, title, steps, activeStepId: activeStepIdFrom(steps) };
    }

    if (key === "MODE_LOCKED_TREND") {
        const { title, steps } = buildModeLockedTrend(data);
        return { key, title, steps, activeStepId: activeStepIdFrom(steps) };
    }

    if (key === "TREND_UP_STEPSET") {
        const { title, steps } = buildTrendUpStepSet(data);
        return { key, title, steps, activeStepId: activeStepIdFrom(steps) };
    }


    // default GRID
    const { title, steps } = buildGridSweepPipeline(data);
    return { key, title, steps, activeStepId: activeStepIdFrom(steps) };
}
