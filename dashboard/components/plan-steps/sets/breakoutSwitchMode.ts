import type { PlanStatus, StepUI } from "../types";

export function buildBreakoutSwitchMode(data: PlanStatus) {
    const ps = String(data.states?.plan_state ?? "").toUpperCase();
    const isBreakout = ps.includes("BREAKOUT") || ps.includes("SWITCH_MODE");

    const steps: StepUI[] = [
        {
            id: "BREAKOUT_CONFIRMED",
            title: "Breakout confirmed",
            status: isBreakout ? "CONFIRMED" : "WAITING",
            badge: isBreakout ? "DONE" : "WAIT",
            detail: "เกมกรอบจบแล้ว — ต้องหยุดกริด/ปรับแผน",
            why: data.states?.plan_state ? `plan_state:${data.states.plan_state}` : undefined,
        },
        {
            id: "ACTION_SNAPSHOT",
            title: "กด Snapshot + ให้ Agent วิเคราะห์ใหม่",
            status: "WAITING",
            badge: "TODO",
            detail: "รีเฟรชข้อมูล แล้วให้ระบบเลือกโหมดใหม่ (TREND / NO_TRADE / GRID)",
        },
    ];

    return { title: "Breakout — Switch Mode", steps };
}
