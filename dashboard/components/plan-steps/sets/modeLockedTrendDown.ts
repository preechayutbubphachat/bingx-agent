import type { PlanStatus, StepUI } from "../types";

export function buildTrendDownStepSet(_data: PlanStatus) {
    const steps: StepUI[] = [
        {
            id: "LOCK_TREND_DOWN",
            title: "TREND_DOWN plan (short) active",
            status: "CONFIRMED",
            badge: "TREND",
            detail: "ใช้แผนขาลง: รอ pullback → 5m close ต่ำกว่า confirm → LH → OI ลด → เข้า",
        },
    ];

    return { title: "TREND_DOWN — Short Plan", steps };
}
