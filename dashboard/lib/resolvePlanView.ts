import type { PlanStatusRoutePayload, RouteFailSafeMode } from "@/lib/planStatusContract";

export type ResolvedPlanView = {
  market_regime: string;
  market_mode: string;
  confidence?: number;
  risk_warning: string[];
  sweep_target?: {
    zone?: [number, number];
    side?: "UP" | "DOWN";
    note_th?: string;
    note?: string;
    status?: string;
  };
  source:
    | "plan"
    | "fallback_top_level"
    | "fallback_plan_status_state"
    | "fallback_legacy";
  payload_kind?: string;
  resolved_plan_source?: string;
  fail_safe_mode?: RouteFailSafeMode;
  fail_safe_reasons: string[];
  canonical_root_plan_present: boolean;
  state_plan_present: boolean;
  uses_canonical_plan: boolean;
  uses_state_plan: boolean;
  proof_marker_match?: boolean;
  proof_route_version?: string;
  truth_note?: string;
};

type FallbackSource = Exclude<ResolvedPlanView["source"], "plan">;

type PickedPlan =
  | { plan: any; source: "plan" }
  | { plan: Record<string, never>; source: FallbackSource };

function normUpper(x: unknown) {
  return String(x ?? "").trim().toUpperCase();
}

function isBadUnknown(x: unknown) {
  const v = normUpper(x);
  return !v || v === "UNKNOWN" || v === "N/A" || v === "NULL" || v === "UNDEFINED";
}

function isPlainObject(x: unknown): x is Record<string, any> {
  return !!x && typeof x === "object" && !Array.isArray(x);
}

function asFiniteNumber(x: unknown): number | undefined {
  if (x === null || x === undefined || x === "") return undefined;
  const n = typeof x === "number" ? x : Number(x);
  return Number.isFinite(n) ? n : undefined;
}

function asCleanString(x: unknown): string | undefined {
  const s = String(x ?? "").trim();
  return s ? s : undefined;
}

function asStringArray(x: unknown): string[] {
  if (!Array.isArray(x)) return [];
  return x.map((v) => String(v ?? "").trim()).filter(Boolean);
}

function normalizeFailSafeMode(x: unknown): ResolvedPlanView["fail_safe_mode"] {
  const v = normUpper(x);
  if (v === "NORMAL" || v === "DEGRADED" || v === "HARD_STOP") return v;
  return "UNKNOWN";
}

function normalizeRegime(regime: unknown, marketMode: unknown) {
  const r = normUpper(regime);
  const m = normUpper(marketMode);
  const key = `${r} ${m}`;

  if (!isBadUnknown(r)) return r;

  if (key.includes("NO_TRADE") || key.includes("HOLD")) return "NO_TRADE";
  if (key.includes("TREND_DOWN") || key.includes("SHORT")) return "TREND_DOWN";
  if (key.includes("TREND_UP") || key.includes("LONG")) return "TREND_UP";
  if (key.includes("RANGE") || key.includes("GRID") || key.includes("CHOP")) return "RANGE";
  if (key.includes("TREND")) return "TREND";

  return "UNKNOWN";
}

function normalizeMode(marketMode: unknown) {
  const m = normUpper(marketMode);
  return m || "UNKNOWN";
}

function normalizeRiskWarnings(v: unknown): string[] {
  if (!v) return [];

  if (Array.isArray(v)) {
    return v
      .map((x) => String(x ?? "").trim())
      .filter((s) => s.length > 0);
  }

  if (typeof v === "string") {
    const s = v.trim();
    return s ? [s] : [];
  }

  return [];
}

function normalizeZone(z: unknown): [number, number] | undefined {
  if (!z) return undefined;

  if (Array.isArray(z) && z.length >= 2) {
    const a = asFiniteNumber(z[0]);
    const b = asFiniteNumber(z[1]);
    if (a !== undefined && b !== undefined) {
      return a <= b ? [a, b] : [b, a];
    }
  }

  if (typeof z === "object" && z !== null) {
    const obj = z as Record<string, unknown>;
    const lo = asFiniteNumber(obj.low ?? obj.l ?? obj.min);
    const hi = asFiniteNumber(obj.high ?? obj.h ?? obj.max);
    if (lo !== undefined && hi !== undefined) {
      return lo <= hi ? [lo, hi] : [hi, lo];
    }
  }

  return undefined;
}

function normalizeSweepTarget(st: unknown): ResolvedPlanView["sweep_target"] {
  if (!st || typeof st !== "object") return undefined;

  const obj = st as Record<string, unknown>;
  const sideRaw = normUpper(obj.side);
  const side: "UP" | "DOWN" | undefined =
    sideRaw === "UP" ? "UP" : sideRaw === "DOWN" ? "DOWN" : undefined;

  const zone = normalizeZone(obj.zone ?? obj.entry_zone ?? obj.target_zone);
  const note_th = asCleanString(obj.note_th);
  const note = asCleanString(obj.note);
  const status = asCleanString(obj.status);

  if (!zone && !side && !note_th && !note && !status) return undefined;

  return { zone, side, note_th, note, status };
}

function hasUsablePlanLike(plan: unknown): boolean {
  if (!isPlainObject(plan)) return false;

  return Boolean(
    plan.market_mode !== undefined ||
      plan.market_regime !== undefined ||
      plan.confidence !== undefined ||
      plan.risk_warning !== undefined ||
      plan.riskWarnings !== undefined ||
      plan.sweep_target !== undefined ||
      plan.sweepTarget !== undefined ||
      plan.plan_id !== undefined ||
      plan.plan_version !== undefined
  );
}

/**
 * Root plan ต้องเป็น object ที่ “ใช้งานได้จริง”
 * ไม่ใช่แค่ {} หรือ object เปล่า ๆ
 */
function hasUsableRootPlan(data: PlanStatusRoutePayload | null | undefined): boolean {
  return hasUsablePlanLike(data?.plan);
}

function hasTopLevelFallbackSignals(data: PlanStatusRoutePayload | null | undefined): boolean {
  return Boolean(
    data?.market_mode !== undefined ||
      data?.market_regime !== undefined ||
      data?.confidence !== undefined ||
      data?.risk_warning !== undefined ||
      data?.riskWarnings !== undefined ||
      data?.sweep_target !== undefined ||
      data?.sweepTarget !== undefined
  );
}

function hasPlanStatusStatePlan(data: PlanStatusRoutePayload | null | undefined): boolean {
  return hasUsablePlanLike(data?.plan_status_state?.plan);
}

function hasLegacyPlan(data: PlanStatusRoutePayload | null | undefined): boolean {
  return (
    hasUsablePlanLike(data?.planStatus?.plan) ||
    hasUsablePlanLike(data?.plan_status?.plan) ||
    hasUsablePlanLike(data?.planStatusState?.plan)
  );
}

/**
 * Truth order:
 * 1) root plan
 * 2) plan_status_state.plan
 * 3) top-level fallback
 * 4) legacy fallback
 *
 * สำคัญ:
 * - plan_status_state.plan ต้องมาก่อน top-level
 *   เพราะ top-level บาง field เป็น compat / summary surface
 *   ไม่ควรแซง derived state plan
 */
function pickPlan(data: PlanStatusRoutePayload | null | undefined): PickedPlan {
  const safeData = data ?? undefined;

  if (hasUsableRootPlan(safeData)) {
    return { plan: safeData?.plan ?? {}, source: "plan" };
  }

  if (hasPlanStatusStatePlan(safeData)) {
    return { plan: {}, source: "fallback_plan_status_state" };
  }

  if (hasTopLevelFallbackSignals(safeData)) {
    return { plan: {}, source: "fallback_top_level" };
  }

  if (hasLegacyPlan(safeData)) {
    return { plan: {}, source: "fallback_legacy" };
  }

  return { plan: {}, source: "fallback_legacy" };
}

function resolveFallbackPlan(data: PlanStatusRoutePayload | null | undefined, source: FallbackSource) {
  const safeData = data ?? undefined;

  if (source === "fallback_plan_status_state") {
    return {
      market_mode: safeData?.plan_status_state?.plan?.market_mode,
      market_regime: safeData?.plan_status_state?.plan?.market_regime,
      confidence: safeData?.plan_status_state?.plan?.confidence,
      risk_warning:
        safeData?.plan_status_state?.plan?.risk_warning ??
        safeData?.plan_status_state?.plan?.riskWarnings,
      sweep_target:
        safeData?.plan_status_state?.plan?.sweep_target ??
        safeData?.plan_status_state?.plan?.sweepTarget,
    };
  }

  if (source === "fallback_top_level") {
    return {
      market_mode: safeData?.market_mode ?? (safeData as any)?.mode ?? (safeData as any)?.regime_mode,
      market_regime: safeData?.market_regime ?? (safeData as any)?.regime,
      confidence: safeData?.confidence,
      risk_warning: safeData?.risk_warning ?? safeData?.riskWarnings,
      sweep_target: safeData?.sweep_target ?? safeData?.sweepTarget,
    };
  }

  return {
    market_mode:
      safeData?.planStatus?.plan?.market_mode ??
      safeData?.plan_status?.plan?.market_mode ??
      safeData?.planStatusState?.plan?.market_mode,
    market_regime:
      safeData?.planStatus?.plan?.market_regime ??
      safeData?.plan_status?.plan?.market_regime ??
      safeData?.planStatusState?.plan?.market_regime,
    confidence:
      safeData?.planStatus?.plan?.confidence ??
      safeData?.plan_status?.plan?.confidence ??
      safeData?.planStatusState?.plan?.confidence,
    risk_warning:
      safeData?.planStatus?.plan?.risk_warning ??
      safeData?.planStatus?.plan?.riskWarnings ??
      safeData?.plan_status?.plan?.risk_warning ??
      safeData?.plan_status?.plan?.riskWarnings ??
      safeData?.planStatusState?.plan?.risk_warning ??
      safeData?.planStatusState?.plan?.riskWarnings,
    sweep_target:
      safeData?.planStatus?.plan?.sweep_target ??
      safeData?.planStatus?.plan?.sweepTarget ??
      safeData?.plan_status?.plan?.sweep_target ??
      safeData?.plan_status?.plan?.sweepTarget ??
      safeData?.planStatusState?.plan?.sweep_target ??
      safeData?.planStatusState?.plan?.sweepTarget,
  };
}

function buildTruthNote(args: {
  source: ResolvedPlanView["source"];
  failSafeMode: ResolvedPlanView["fail_safe_mode"];
  canonicalRootPlanPresent: boolean;
  statePlanPresent: boolean;
  resolvedPlanSource?: string;
  proofMarkerMatch?: boolean;
}) {
  const {
    source,
    failSafeMode,
    canonicalRootPlanPresent,
    statePlanPresent,
    resolvedPlanSource,
    proofMarkerMatch,
  } = args;

  if (proofMarkerMatch === false) {
    return "resolver found runtime proof mismatch; source/build/runtime markers are not aligned in this payload";
  }

  if (failSafeMode === "HARD_STOP") {
    return "resolver อยู่ในภาวะ HARD_STOP — widget ต้องอ่านด้วยความระวัง และไม่ตีความเหมือนสภาวะปกติ";
  }

  if (failSafeMode === "DEGRADED") {
    return "resolver อยู่ในภาวะ DEGRADED — canonical/derived truth ยังต้องแยกชัด และห้ามให้ summary surface กลายเป็น owner";
  }

  if (source === "plan" && canonicalRootPlanPresent) {
    return resolvedPlanSource === "canonical_plan"
      ? "resolver ใช้ root canonical plan เป็น truth หลัก"
      : "resolver ใช้ root plan เป็น truth หลัก แต่ route ไม่ได้ประกาศ canonical_plan ชัด";
  }

  if (source === "fallback_plan_status_state" && statePlanPresent) {
    return "resolver fallback ไปที่ plan_status_state.plan ซึ่งเป็น derived/state plan ไม่ใช่ canonical root plan";
  }

  if (source === "fallback_top_level") {
    return "resolver fallback ไป top-level compat surface — ใช้ได้เฉพาะเมื่อ root/state plan ไม่มี usable truth";
  }

  return "resolver อยู่ใน legacy fallback — ควรถือว่าเป็น compatibility path มากกว่าความจริงหลัก";
}

export function resolvePlanView(data: PlanStatusRoutePayload | null | undefined): ResolvedPlanView {
  const picked = pickPlan(data);

  const base =
    picked.source === "plan"
      ? {
          market_mode: picked.plan?.market_mode,
          market_regime: picked.plan?.market_regime,
          confidence: picked.plan?.confidence,
          risk_warning: picked.plan?.risk_warning ?? picked.plan?.riskWarnings,
          sweep_target: picked.plan?.sweep_target ?? picked.plan?.sweepTarget,
        }
      : resolveFallbackPlan(data, picked.source);

  const market_mode = normalizeMode(base.market_mode);
  const market_regime = normalizeRegime(base.market_regime, market_mode);
  const confidence = asFiniteNumber(base.confidence);
  const risk_warning = normalizeRiskWarnings(base.risk_warning);
  const sweep_target = normalizeSweepTarget(base.sweep_target);

  const fail_safe_mode = normalizeFailSafeMode(data?.fail_safe?.mode);
  const fail_safe_reasons = asStringArray(data?.fail_safe?.reasons);
  const payload_kind = asCleanString(data?.payload_kind);
  const resolved_plan_source = asCleanString(data?.resolved_plan_source);
  const canonical_root_plan_present = hasUsableRootPlan(data);
  const state_plan_present = hasPlanStatusStatePlan(data);
  const uses_canonical_plan = picked.source === "plan";
  const uses_state_plan = picked.source === "fallback_plan_status_state";
  const proof_marker_match =
    typeof data?.proof?.marker_match === "boolean" ? data.proof.marker_match : undefined;
  const proof_route_version = asCleanString(data?.proof?.route_version);

  return {
    market_regime,
    market_mode,
    confidence,
    risk_warning,
    sweep_target,
    source: picked.source,
    payload_kind,
    resolved_plan_source,
    fail_safe_mode,
    fail_safe_reasons,
    canonical_root_plan_present,
    state_plan_present,
    uses_canonical_plan,
    uses_state_plan,
    proof_marker_match,
    proof_route_version,
    truth_note: buildTruthNote({
      source: picked.source,
      failSafeMode: fail_safe_mode,
      canonicalRootPlanPresent: canonical_root_plan_present,
      statePlanPresent: state_plan_present,
      resolvedPlanSource: resolved_plan_source,
      proofMarkerMatch: proof_marker_match,
    }),
  };
}
