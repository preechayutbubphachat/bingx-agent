import type { PlanStatus, StepUI } from "../types";

export function buildModeLockedNoTrade(_data: PlanStatus) {
    const steps: StepUI[] = [
        {
            id: "LOCK_NO_TRADE",
            title: "NO_TRADE locked",
            status: "CONFIRMED",
            badge: "LOCKED",
            detail: "งดเทรดตามบทวิเคราะห์ — รอ snapshot ใหม่แล้วค่อย re-evaluate",
        },
    ];

    return { title: "NO_TRADE — Locked", steps };
}
