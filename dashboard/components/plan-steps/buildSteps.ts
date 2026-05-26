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

import { buildObGateStepSet } from "./sets/obGateStepSet";
import { buildGridSweepPipeline } from "./sets/gridSweepPipeline";
import { buildBreakoutSwitchMode } from "./sets/breakoutSwitchMode";
import { buildModeLockedNoTrade } from "./sets/modeLockedNoTrade";
import { buildModeLockedTrend } from "./sets/modeLockedTrend";
import { buildTrendUpStepSet } from "./sets/modeLockedTrendUp";
import { buildTrendDownStepSet } from "./sets/trendDownStepSet";

function mapEngineToUIStatus(s: EngineStepStatus | string | undefined | null): StepStatus {
  const v = String(s ?? "").trim().toUpperCase();

  if (v === "PASS" || v === "DONE") return "CONFIRMED";
  if (v === "WAITING" || v === "WARN") return "WAITING";
  if (v === "FAIL") return "FAILED";

  return "FAILED";
}

function badgeFromEngine(s: EngineStepStatus | string | undefined | null) {
  const v = String(s ?? "").trim().toUpperCase();

  if (v === "PASS") return "PASS";
  if (v === "DONE") return "DONE";
  if (v === "WARN") return "WARN";
  if (v === "FAIL") return "FAIL";

  return "WAIT";
}

function activeStepFromEngine(
  steps: Array<{ id?: string; status?: EngineStepStatus | string | null | undefined }>
): string | null {
  const waiting = steps.find((x) => {
    const s = String(x?.status ?? "").trim().toUpperCase();
    return s === "WAITING" || s === "WARN";
  });
  if (waiting?.id) return String(waiting.id);

  const failed = steps.find((x) => String(x?.status ?? "").trim().toUpperCase() === "FAIL");
  if (failed?.id) return String(failed.id);

  const confirmedTail = [...steps]
    .reverse()
    .find((x) => {
      const s = String(x?.status ?? "").trim().toUpperCase();
      return (s === "PASS" || s === "DONE") && x?.id;
    });
  if (confirmedTail?.id) return String(confirmedTail.id);

  return null;
}

function activeStepIdFrom(steps: StepUI[]): string | null {
  return (
    steps.find((s) => s.status === "WAITING" || s.status === "FAILED")?.id ??
    [...steps].reverse().find((s) => s.status === "CONFIRMED" || s.status === "DONE")?.id ??
    null
  );
}

function isPlainObject(v: unknown): v is Record<string, any> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function hasUsableEngineSteps(ps: PlanStatusState | null | undefined): ps is PlanStatusState {
  return !!ps && Array.isArray(ps.steps) && ps.steps.length > 0;
}

function normalizeStepSetKey(raw: unknown, fallback: StepSetKey): StepSetKey {
  const v = String(raw ?? "").trim().toUpperCase();

  switch (v) {
    case "TREND_DOWN_STEPSET":
      return "TREND_DOWN_STEPSET";
    case "TREND_UP_STEPSET":
      return "TREND_UP_STEPSET";
    case "OB_GATE_STEPSET":
      return "OB_GATE_STEPSET";
    case "BREAKOUT_SWITCH_MODE":
      return "BREAKOUT_SWITCH_MODE";
    case "MODE_LOCKED_NO_TRADE":
      return "MODE_LOCKED_NO_TRADE";
    case "MODE_LOCKED_TREND":
      return "MODE_LOCKED_TREND";
    case "GRID_SWEEP_PIPELINE":
      return "GRID_SWEEP_PIPELINE";
    default:
      return fallback;
  }
}

function readPayloadKind(data: PlanStatus): string {
  return String((data as any)?.payload_kind ?? "UNKNOWN").trim().toUpperCase();
}

function readFailSafeMode(data: PlanStatus): string {
  return String((data as any)?.fail_safe?.mode ?? "UNKNOWN").trim().toUpperCase();
}

function shouldTrustRouteStateSteps(data: PlanStatus, ps: PlanStatusState): boolean {
  if (!hasUsableEngineSteps(ps)) return false;

  const payloadKind = readPayloadKind(data);
  const failSafeMode = readFailSafeMode(data);

  if (payloadKind === "ROUTE_RESPONSE") return true;
  if (failSafeMode === "NORMAL" || failSafeMode === "DEGRADED") return true;

  const generatedAt = ps?.generated_at;
  const stateCode = ps?.state?.code;
  return isNonEmptyString(generatedAt) && isNonEmptyString(stateCode);
}

function stateTruthMeta(data: PlanStatus, ps: PlanStatusState | null | undefined) {
  return {
    payload_kind: (data as any)?.payload_kind ?? null,
    fail_safe_mode: (data as any)?.fail_safe?.mode ?? null,
    selected_state_source:
      (data as any)?.canonical_state_guard?.selectedStateSource ??
      (ps as any)?.__state_guard?.selected_state_source ??
      null,
    regeneration_mode: (ps as any)?.__state_guard?.regeneration_mode ?? null,
  };
}

/**
 * Ownership boundary:
 * - ถ้า route ส่ง plan_status_state.steps มาแล้ว ให้เชื่อ engine steps ก่อน
 * - buildSteps() ไม่ควร re-interpret state ใหม่เอง เมื่อ engine steps มีอยู่แล้ว
 * - fallback builders ใช้เฉพาะตอน route ยังไม่มี engine steps เท่านั้น
 * - buildSteps() ต้องไม่ให้ legacy / timeline / fallback builder rewrite step narrative
 *   ถ้า route state มาครบแล้ว
 */
function buildFromPlanStatusState(data: PlanStatus, ps: PlanStatusState): BuildStepsResult {
  const fallbackKey = pickStepSet(data);
  const truthMeta = stateTruthMeta(data, ps);

  const steps: StepUI[] = (ps.steps ?? []).map((x, idx) => {
    const rawId = String(x?.id ?? "").trim();
    const rawTitle = String(x?.title ?? "").trim();
    const rawWhy = String(x?.why ?? "").trim();
    const rawStatus = x?.status;

    return {
      id: rawId || `STEP_${idx + 1}`,
      title: rawTitle || rawId || `STEP ${idx + 1}`,
      status: mapEngineToUIStatus(rawStatus),
      badge: badgeFromEngine(rawStatus),
      detail: rawWhy,
      why: rawStatus ? `engine:${String(rawStatus).trim().toUpperCase()}` : undefined,
      data: isPlainObject((x as any)?.data)
        ? {
            ...(x as any).data,
            __step_truth: {
              owner: "route.plan_status_state.steps",
              ...truthMeta,
            },
          }
        : {
            __step_truth: {
              owner: "route.plan_status_state.steps",
              ...truthMeta,
            },
          },
    } as StepUI;
  });

  const key = normalizeStepSetKey(ps?.state?.step_set, fallbackKey);

  return {
    key,
    title: String(ps?.state?.headline ?? "").trim() || "Plan Steps",
    activeStepId: activeStepFromEngine(ps.steps ?? []),
    steps,
  };
}

function withFallbackTruthTag(
  result: { title: string; steps: StepUI[] },
  key: StepSetKey,
  data: PlanStatus
): BuildStepsResult {
  const truthMeta = stateTruthMeta(data, data?.plan_status_state ?? null);

  const taggedSteps = (result.steps ?? []).map((step) => ({
    ...step,
    data: {
      ...(isPlainObject((step as any)?.data) ? (step as any).data : {}),
      __step_truth: {
        owner: "ui_fallback_builder",
        builder_key: key,
        ...truthMeta,
      },
    },
  }));

  return {
    key,
    title: result.title,
    steps: taggedSteps,
    activeStepId: activeStepIdFrom(taggedSteps),
  };
}

export function buildSteps(data: PlanStatus): BuildStepsResult {
  const ps = data?.plan_status_state ?? null;

  if (ps && shouldTrustRouteStateSteps(data, ps)) {
    return buildFromPlanStatusState(data, ps);
  }

  const key = pickStepSet(data);

  switch (key) {
    case "TREND_DOWN_STEPSET": {
      return withFallbackTruthTag(buildTrendDownStepSet(data), key, data);
    }

    case "TREND_UP_STEPSET": {
      return withFallbackTruthTag(buildTrendUpStepSet(data), key, data);
    }

    case "OB_GATE_STEPSET": {
      return withFallbackTruthTag(buildObGateStepSet(data), key, data);
    }

    case "BREAKOUT_SWITCH_MODE": {
      return withFallbackTruthTag(buildBreakoutSwitchMode(data), key, data);
    }

    case "MODE_LOCKED_NO_TRADE": {
      return withFallbackTruthTag(buildModeLockedNoTrade(data), key, data);
    }

    case "MODE_LOCKED_TREND": {
      return withFallbackTruthTag(buildModeLockedTrend(data), key, data);
    }

    case "GRID_SWEEP_PIPELINE":
    default: {
      return withFallbackTruthTag(buildGridSweepPipeline(data), "GRID_SWEEP_PIPELINE", data);
    }
  }
}
