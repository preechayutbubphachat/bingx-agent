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
    (data as any)?.decision?.levels?.trend ??
    null
  );
}

function getClose5m(data: PlanStatus): number | null {
  const v = data?.price?.close_5m ?? data?.plan_status_state?.price?.close_5m;
  return typeof v === "number" ? v : null;
}

export function buildTrendUpStepSet(data: PlanStatus) {
  const trend = getTrend(data) ?? {};

  const pull = Array.isArray(trend?.pullback_zone)
    ? trend.pullback_zone
    : trend?.pullback_zone?.low != null && trend?.pullback_zone?.high != null
      ? [trend.pullback_zone.low, trend.pullback_zone.high]
      : null;

  const invalidation = asNum(trend?.invalidation);
  const tp1 = asNum(trend?.tp1 ?? trend?.targets?.t1);
  const confirmLine = asNum(trend?.confirm_line);

  const close5m = getClose5m(data);

  const lo = pull ? Math.min(pull[0], pull[1]) : null;
  const hi = pull ? Math.max(pull[0], pull[1]) : null;

  const inZone =
    typeof close5m === "number" && typeof lo === "number" && typeof hi === "number"
      ? close5m >= lo && close5m <= hi
      : false;

  const aboveConfirm =
    typeof close5m === "number" && typeof confirmLine === "number"
      ? close5m > confirmLine
      : false;

  const invalidated =
    typeof close5m === "number" && typeof invalidation === "number"
      ? close5m < invalidation
      : false;

  const steps: StepUI[] = [
    {
      id: "PB_ZONE",
      title: "Pullback เข้าโซน",
      status: invalidated ? "FAILED" : inZone ? "CONFIRMED" : "WAITING",
      badge: invalidated ? "INVALID" : inZone ? "IN ZONE" : "WAIT",
      detail:
        typeof lo === "number" && typeof hi === "number"
          ? `pullback_zone: ${lo.toFixed(2)}–${hi.toFixed(2)}`
          : "ยังไม่มี pullback_zone จาก backend",
      why: "trend.pullback_zone",
    },
    {
      id: "M5_CONFIRM",
      title: "5m Confirm (ปิดเหนือ confirm line)",
      status: invalidated ? "SKIPPED" : aboveConfirm ? "CONFIRMED" : "WAITING",
      badge: aboveConfirm ? "OK" : "WAIT",
      detail:
        typeof confirmLine === "number"
          ? `รอ 5m ปิดเหนือ ${confirmLine.toFixed(2)}`
          : "ยังไม่มี confirm_line",
      why: "trend.confirm_line",
    },
    {
      id: "READY",
      title: "READY → Entry (CONFIRM)",
      status: invalidated ? "LOCKED" : inZone && aboveConfirm ? "CONFIRMED" : "WAITING",
      badge: invalidated ? "LOCKED" : inZone && aboveConfirm ? "READY" : "WAIT",
      detail: "เข้าเมื่อ pullback เข้าโซนและ 5m ยืนยันแล้วเท่านั้น",
      why: "trend entry fallback",
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
    title: "TREND_UP — Pullback → 5m Confirm → Long",
    steps,
  };
}