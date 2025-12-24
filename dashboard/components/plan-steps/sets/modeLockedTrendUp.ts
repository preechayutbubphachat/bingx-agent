import type { PlanStatus, StepUI } from "../types";

export function buildTrendUpStepSet(data: PlanStatus) {
    const steps: StepUI[] = [
        {
            id: "TREND_UP_LOCK",
            title: "TREND_UP mode (fallback)",
            status: "CONFIRMED",
            badge: "LOCKED",
            detail: "ใช้ step set แบบ fallback — ถ้า backend ส่ง plan_status_state.steps จะใช้ของ backend แทน",
            why: data?.plan?.market_mode ? `market_mode:${data.plan.market_mode}` : undefined,
        },
    ];

    return { title: "TREND_UP — Step Set", steps };
}
