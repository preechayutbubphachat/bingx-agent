import type { PlanStatus, StepUI } from "../types";

export function buildModeLockedTrend(_data: PlanStatus) {
    const steps: StepUI[] = [
        {
            id: "LOCK_TREND",
            title: "TREND mode locked",
            status: "CONFIRMED",
            badge: "LOCKED",
            detail: "พักแผนกริด แล้วรอแผนเทรนด์จาก decision/steps",
        },
    ];

    return { title: "TREND — Grid Disabled", steps };
}
