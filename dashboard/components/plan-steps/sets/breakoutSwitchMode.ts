import type { PlanStatus, StepUI } from "../types";

function up(x: unknown) {
  return String(x ?? "").trim().toUpperCase();
}

export function buildBreakoutSwitchMode(data: PlanStatus) {
  const planState = up(data?.states?.plan_state);
  const code = up(data?.plan_status_state?.state?.code);
  const headline = String(data?.plan_status_state?.state?.headline ?? "").trim();

  const isBreakout =
    planState.includes("BREAKOUT") ||
    planState.includes("SWITCH_MODE") ||
    code.includes("BREAKOUT") ||
    code.includes("SWITCH_MODE");

  const steps: StepUI[] = [
    {
      id: "BREAKOUT_CONFIRMED",
      title: "Breakout confirmed",
      status: isBreakout ? "CONFIRMED" : "WAITING",
      badge: isBreakout ? "DONE" : "WAIT",
      detail: headline || "เกมกรอบจบแล้ว — ต้องหยุดกริด/ปรับแผน",
      why:
        data?.states?.plan_state || data?.plan_status_state?.state?.code
          ? `plan_state:${data?.states?.plan_state ?? "—"} | code:${data?.plan_status_state?.state?.code ?? "—"}`
          : undefined,
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