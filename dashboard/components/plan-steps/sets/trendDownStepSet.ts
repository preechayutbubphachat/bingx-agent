import type { PlanStatus, StepUI } from "../types";

function up(s: unknown) {
    return String(s ?? "").trim().toUpperCase();
}

function getTrend(data: any) {
    return (
        data?.levels?.trend ??
        data?.plan?.levels?.trend ??
        data?.decision?.levels?.trend ??
        null
    );
}

function getClose5m(data: any): number | null {
    const v = data?.price?.close_5m ?? data?.plan_status_state?.price?.close_5m;
    return typeof v === "number" ? v : null;
}

export function buildTrendDownStepSet(data: PlanStatus) {
    const t = getTrend(data as any) ?? {};
    const pull = Array.isArray(t?.pullback_zone) ? t.pullback_zone : null;
    const invalidation = typeof t?.invalidation === "number" ? t.invalidation : null;
    const tp1 = typeof t?.targets?.t1 === "number" ? t.targets.t1 : null;

    const lo = pull ? Math.min(pull[0], pull[1]) : null;
    const hi = pull ? Math.max(pull[0], pull[1]) : null;

    const close5m = getClose5m(data as any);

    const inZone =
        typeof close5m === "number" && typeof lo === "number" && typeof hi === "number"
            ? close5m >= lo && close5m <= hi
            : false;

    const belowZone =
        typeof close5m === "number" && typeof lo === "number" ? close5m < lo : false;

    const invalidated =
        typeof close5m === "number" && typeof invalidation === "number"
            ? close5m > invalidation
            : false;

    const steps: StepUI[] = [
        {
            id: "PB_ZONE",
            title: "Pullback เข้าโซน (รอเด้งขึ้นก่อน)",
            status: invalidated ? "FAILED" : inZone ? "CONFIRMED" : "WAITING",
            badge: invalidated ? "INVALID" : inZone ? "IN ZONE" : "WAIT",
            detail:
                typeof lo === "number" && typeof hi === "number"
                    ? `pullback_zone: ${lo.toFixed(2)}–${hi.toFixed(2)}`
                    : "ยังไม่มี pullback_zone จาก agent",
            why: "trend.pullback_zone",
        },
        {
            id: "M5_REJECT",
            title: "5m Rejection (ปิดกลับลงจากโซน)",
            status: invalidated ? "SKIPPED" : belowZone ? "CONFIRMED" : "WAITING",
            badge: belowZone ? "OK" : "WAIT",
            detail: "รอ 5m ปิดกลับลงจากโซน / ไส้บนชัด แล้วค่อยคิดเข้า",
            why: "trigger: close below zone",
        },
        {
            id: "M5_LH",
            title: "5m Confirm (LH / breakdown)",
            status: invalidated ? "SKIPPED" : belowZone ? "CONFIRMED" : "WAITING",
            badge: belowZone ? "OK" : "WAIT",
            detail: "ต้องยืนยันกลับตัวลงจริงก่อนเข้า (กันโดนเด้งตบหน้า)",
            why: "trigger_rule",
        },
        {
            id: "READY",
            title: "READY → Entry (CONFIRM)",
            status: invalidated ? "LOCKED" : belowZone ? "CONFIRMED" : "WAITING",
            badge: invalidated ? "LOCKED" : belowZone ? "READY" : "WAIT",
            detail: "เข้าเมื่อ 5m confirm แล้วเท่านั้น (ไม่ไล่แดง)",
            why: "entry.type=CONFIRM",
        },
        {
            id: "RISK",
            title: "Risk: SL = invalidation",
            status: typeof invalidation === "number" ? "CONFIRMED" : "WAITING",
            badge: typeof invalidation === "number" ? "SET" : "WAIT",
            detail: typeof invalidation === "number" ? `SL: ${invalidation.toFixed(2)}` : "ยังไม่มี invalidation",
            why: "trend.invalidation",
        },
        {
            id: "TP1",
            title: "Target: TP1",
            status: typeof tp1 === "number" ? "CONFIRMED" : "WAITING",
            badge: typeof tp1 === "number" ? "SET" : "WAIT",
            detail: typeof tp1 === "number" ? `TP1: ${tp1.toFixed(2)}` : "ยังไม่มี TP1",
            why: "trend.targets.t1",
        },
    ];

    const title = "TREND_DOWN — Pullback → 5m Confirm → Short";
    const activeStepId =
        steps.find((s) => s.status === "WAITING")?.id ??
        steps.find((s) => s.status === "CONFIRMED")?.id ??
        steps[0]?.id;

    return { title, steps, activeStepId };
}
