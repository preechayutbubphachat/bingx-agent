import type { PlanStatus, StepUI } from "../types";

export function buildModeLockedNoTrade(data: PlanStatus) {
  const headline = String(data?.plan_status_state?.state?.headline ?? "").trim();
  const explain = String(data?.explain_th ?? "").trim();

  const detail =
    headline ||
    explain ||
    "งดเทรดตามบทวิเคราะห์ — รอ snapshot ใหม่แล้วค่อย re-evaluate";

  const steps: StepUI[] = [
    {
      id: "LOCK_NO_TRADE",
      title: "NO_TRADE locked",
      status: "CONFIRMED",
      badge: "LOCKED",
      detail,
      why: data?.mode_lock?.value ? `mode_lock:${String(data.mode_lock.value)}` : undefined,
    },
  ];

  return { title: "NO_TRADE — Locked", steps };
}