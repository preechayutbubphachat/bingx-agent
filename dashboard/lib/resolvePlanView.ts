// dashboard/lib/resolvePlanView.ts

export type ResolvedPlanView = {
    market_regime: string;
    market_mode: string;
    confidence?: number;
    risk_warning: string[];
    sweep_target?: {
        zone?: [number, number];
        note_th?: string;
        note?: string;
        status?: string;
    };
    source:
    | "plan_status_state.plan"
    | "planStatusState.plan"
    | "plan_status.plan"
    | "planStatus.plan"
    | "plan"
    | "fallback";
};


function normUpper(x: unknown) {
    return String(x ?? "").trim().toUpperCase();
}

function isBadUnknown(x: string) {
    const v = normUpper(x);
    return !v || v === "UNKNOWN" || v === "N/A" || v === "NULL" || v === "UNDEFINED";
}

function normalizeRegime(regime: unknown, marketMode: unknown) {
    const r = normUpper(regime);
    const m = normUpper(marketMode);
    const key = `${r} ${m}`;

    // ถ้ามี regime จริง ไม่ใช่ UNKNOWN-ish ก็ใช้เลย
    if (!isBadUnknown(r)) return r;

    // fallback จาก market_mode / key
    if (key.includes("NO_TRADE")) return "NO_TRADE";
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
function normalizeZone(z: any): [number, number] | undefined {
    if (!z) return undefined;

    if (Array.isArray(z) && typeof z[0] === "number" && typeof z[1] === "number") {
        return [z[0], z[1]];
    }

    if (typeof z === "object") {
        const lo = z.low ?? z.l ?? z.min;
        const hi = z.high ?? z.h ?? z.max;
        if (typeof lo === "number" && typeof hi === "number") return [lo, hi];
    }

    return undefined;
}

function pickSweepTarget(pickedPlan: any, root: any) {
    const st =
        pickedPlan?.sweep_target ??
        pickedPlan?.sweepTarget ??
        root?.sweep_target ??
        root?.sweepTarget ??
        undefined;

    if (!st || typeof st !== "object") return undefined;

    return {
        zone: normalizeZone(st.zone ?? st.entry_zone ?? st.target_zone),
        note_th: st.note_th,
        note: st.note,
        status: st.status,
    };
}

function pickPlan(data: any):
    | { plan: any; source: ResolvedPlanView["source"] }
    | { plan: {}; source: "fallback" } {
    const pssPlan = data?.plan_status_state?.plan;
    if (pssPlan && typeof pssPlan === "object") return { plan: pssPlan, source: "plan_status_state.plan" };

    const planStatusStatePlan = data?.planStatusState?.plan;
    if (planStatusStatePlan && typeof planStatusStatePlan === "object")
        return { plan: planStatusStatePlan, source: "planStatusState.plan" };

    const planStatusPlan = data?.plan_status?.plan;
    if (planStatusPlan && typeof planStatusPlan === "object") return { plan: planStatusPlan, source: "plan_status.plan" };

    const planStatusPlan2 = data?.planStatus?.plan;
    if (planStatusPlan2 && typeof planStatusPlan2 === "object") return { plan: planStatusPlan2, source: "planStatus.plan" };

    const plan = data?.plan;
    if (plan && typeof plan === "object") return { plan, source: "plan" };

    return { plan: {}, source: "fallback" };
}

export function resolvePlanView(data: any): ResolvedPlanView {
    const picked = pickPlan(data);

    const market_mode = normalizeMode(picked.plan?.market_mode);
    const market_regime = normalizeRegime(picked.plan?.market_regime, market_mode);

    const confidence =
        typeof picked.plan?.confidence === "number" && Number.isFinite(picked.plan.confidence)
            ? picked.plan.confidence
            : undefined;

    const risk_warning = normalizeRiskWarnings(picked.plan?.risk_warning ?? picked.plan?.riskWarnings);

    const sweep_target = pickSweepTarget(picked.plan, data);

    return {
        market_regime,
        market_mode,
        confidence,
        risk_warning,
        sweep_target,
        source: picked.source,
    };
}
