import type { PlanStatus, StepUI } from "../types";

function asNum(x: unknown): number | null {
  const n = typeof x === "number" ? x : Number(x);
  return Number.isFinite(n) ? n : null;
}

function getTrend(data: PlanStatus) {
  return (
    data?.plan_status_state?.plan?.trend ??
    data?.plan?.trend ??
    (data as any)?.levels?.trend ??
    (data as any)?.plan?.levels?.trend ??
    (data as any)?.decision?.levels?.trend ??
    null
  );
}

function getClose5m(data: PlanStatus): number | null {
  const v = data?.price?.close_5m ?? data?.plan_status_state?.price?.close_5m;
  return typeof v === "number" ? v : null;
}

export function buildTrendDownStepSet(data: PlanStatus) {
  const trend = getTrend(data) ?? {};

  const pull = Array.isArray(trend?.pullback_zone)
    ? trend.pullback_zone
    : trend?.pullback_zone?.low != null && trend?.pullback_zone?.high != null
      ? [trend.pullback_zone.low, trend.pullback_zone.high]
      : null;

  const invalidation = asNum(trend?.invalidation);
  const tp1 = asNum(trend?.tp1 ?? trend?.targets?.t1);
  const confirmLine = asNum(trend?.confirm_line);

  const lo = pull ? Math.min(pull[0], pull[1]) : null;
  const hi = pull ? Math.max(pull[0], pull[1]) : null;

  const close5m = getClose5m(data);

  const inZone =
    typeof close5m === "number" && typeof lo === "number" && typeof hi === "number"
      ? close5m >= lo && close5m <= hi
      : false;

  const belowZone =
    typeof close5m === "number" && typeof lo === "number"
      ? close5m < lo
      : false;

  const belowConfirm =
    typeof close5m === "number" && typeof confirmLine === "number"
      ? close5m < confirmLine
      : false;

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
          : "ยังไม่มี pullback_zone จาก backend",
      why: "trend.pullback_zone",
    },
    {
      id: "M5_REJECT",
      title: "5m Rejection (ปิดกลับลงจากโซน)",
      status: invalidated ? "SKIPPED" : belowZone || belowConfirm ? "CONFIRMED" : "WAITING",
      badge: belowZone || belowConfirm ? "OK" : "WAIT",
      detail:
        typeof confirmLine === "number"
          ? `รอ 5m ปิดต่ำกว่า ${confirmLine.toFixed(2)} หรือหลุดโซนลงมา`
          : "รอ 5m ปิดกลับลงจากโซน / ไส้บนชัด",
      why: "trend.confirm_line",
    },
    {
      id: "M5_LH",
      title: "5m Confirm (LH / breakdown)",
      status: invalidated ? "SKIPPED" : belowZone || belowConfirm ? "CONFIRMED" : "WAITING",
      badge: belowZone || belowConfirm ? "OK" : "WAIT",
      detail: "ต้องยืนยันกลับตัวลงจริงก่อนเข้า (กันโดนเด้งตบหน้า)",
      why: "trigger_rule",
    },
    {
      id: "READY",
      title: "READY → Entry (CONFIRM)",
      status: invalidated ? "LOCKED" : belowZone || belowConfirm ? "CONFIRMED" : "WAITING",
      badge: invalidated ? "LOCKED" : belowZone || belowConfirm ? "READY" : "WAIT",
      detail: "เข้าเมื่อ 5m confirm แล้วเท่านั้น (ไม่ไล่แดง)",
      why: "entry.type=CONFIRM",
    },
    {
      id: "RISK",
      title: "Risk: SL = invalidation",
      status: typeof invalidation === "number" ? "CONFIRMED" : "WAITING",
      badge: typeof invalidation === "number" ? "SET" : "WAIT",
      detail:
        typeof invalidation === "number"
          ? `SL: ${invalidation.toFixed(2)}`
          : "ยังไม่มี invalidation",
      why: "trend.invalidation",
    },
    {
      id: "TP1",
      title: "Target: TP1",
      status: typeof tp1 === "number" ? "CONFIRMED" : "WAITING",
      badge: typeof tp1 === "number" ? "SET" : "WAIT",
      detail:
        typeof tp1 === "number"
          ? `TP1: ${tp1.toFixed(2)}`
          : "ยังไม่มี TP1",
      why: "trend.tp1",
    },
  ];

  return {
    title: "TREND_DOWN — Pullback → 5m Confirm → Short",
    steps,
  };
}