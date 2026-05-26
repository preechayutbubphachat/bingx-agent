import type { PlanStatus, StepUI, StepStatus } from "../types";

function norm(s?: string) {
  return String(s ?? "").trim().toUpperCase();
}

function fmtNum(n: unknown) {
  return typeof n === "number" && Number.isFinite(n) ? n.toLocaleString() : "—";
}

function statusFromRaw(raw?: string): { status: StepStatus; badge: string } {
  const s = norm(raw);
  if (!s || s === "—") return { status: "WAITING", badge: "WAIT" };

  if (s === "PASS" || s === "DONE" || s === "CONFIRMED" || s === "READY") {
    return { status: "CONFIRMED", badge: s };
  }

  if (s.includes("WAIT") || s.includes("PENDING")) {
    return { status: "WAITING", badge: "WAIT" };
  }

  if (s.includes("FAIL") || s.includes("BLOCK") || s.includes("INVALID") || s.includes("NO")) {
    return { status: "FAILED", badge: "FAIL" };
  }

  return { status: "WAITING", badge: s };
}

function getObGate(data: PlanStatus): any {
  return data?.ob_gate ?? data?.planStatus?.ob_gate ?? data?.plan?.ob_gate ?? null;
}

function inferFromWhy(whyRaw: string, entryStatusRaw: string) {
  const why = norm(whyRaw);
  const entryStatus = norm(entryStatusRaw);

  const entryReady = entryStatus === "READY" || entryStatus === "CONFIRMED";

  let touch = { status: "WAITING" as StepStatus, badge: "WAIT" };
  let sweep = { status: "LOCKED" as StepStatus, badge: "LOCK" };
  let reclaim = { status: "LOCKED" as StepStatus, badge: "LOCK" };
  let choch = { status: "LOCKED" as StepStatus, badge: "LOCK" };
  let m5ob = { status: "LOCKED" as StepStatus, badge: "LOCK" };
  let ready = { status: "LOCKED" as StepStatus, badge: "LOCK" };

  if (entryReady) {
    const done = { status: "CONFIRMED" as StepStatus, badge: entryStatus };
    return { touch: done, sweep: done, reclaim: done, choch: done, m5ob: done, ready: done };
  }

  if (why.includes("WAIT_RECLAIM")) {
    touch = { status: "CONFIRMED", badge: "PASS" };
    sweep = { status: "CONFIRMED", badge: "PASS" };
    reclaim = { status: "WAITING", badge: "WAIT" };
    return { touch, sweep, reclaim, choch, m5ob, ready };
  }

  if (why.includes("WAIT_CHOCH")) {
    touch = { status: "CONFIRMED", badge: "PASS" };
    sweep = { status: "CONFIRMED", badge: "PASS" };
    reclaim = { status: "CONFIRMED", badge: "PASS" };
    choch = { status: "WAITING", badge: "WAIT" };
    return { touch, sweep, reclaim, choch, m5ob, ready };
  }

  if (why.includes("WAIT_5M_OB") || why.includes("WAIT_5M")) {
    touch = { status: "CONFIRMED", badge: "PASS" };
    sweep = { status: "CONFIRMED", badge: "PASS" };
    reclaim = { status: "CONFIRMED", badge: "PASS" };
    choch = { status: "CONFIRMED", badge: "PASS" };
    m5ob = { status: "WAITING", badge: "WAIT" };
    return { touch, sweep, reclaim, choch, m5ob, ready };
  }

  if (why.includes("WAIT_SWEEP")) {
    touch = { status: "CONFIRMED", badge: "PASS" };
    sweep = { status: "WAITING", badge: "WAIT" };
    return { touch, sweep, reclaim, choch, m5ob, ready };
  }

  if (why.includes("WAIT_TOUCH")) {
    touch = { status: "WAITING", badge: "WAIT" };
    return { touch, sweep, reclaim, choch, m5ob, ready };
  }

  return { touch, sweep, reclaim, choch, m5ob, ready };
}

function readBias(ob: any) {
  return ob?.bias_1h ?? ob?.bias1h ?? ob?.h1?.bias_1h ?? ob?.h1?.bias1h ?? "";
}

function readH1Zone(ob: any): { low: number | null; high: number | null } {
  const z1 = ob?.h1_ob?.zone;
  if (z1 && typeof z1.low === "number" && typeof z1.high === "number") {
    return { low: z1.low, high: z1.high };
  }

  const z2 = ob?.h1ObZone;
  if (z2 && typeof z2.low === "number" && typeof z2.high === "number") {
    return { low: z2.low, high: z2.high };
  }

  const z3 = ob?.h1_ob_zone;
  if (z3 && typeof z3.low === "number" && typeof z3.high === "number") {
    return { low: z3.low, high: z3.high };
  }

  return { low: null, high: null };
}

function readH1Note(ob: any) {
  return ob?.h1_ob?.note_th ?? ob?.h1_ob?.note ?? ob?.h1ObNote ?? ob?.h1_ob_note ?? "";
}

function readGateRaw(g: any, key: string) {
  return g?.[key]?.status ?? g?.[key]?.status_th ?? "";
}

function boolGateStatus(v: unknown): { status: StepStatus; badge: string } | null {
  if (typeof v !== "boolean") return null;
  return v
    ? { status: "CONFIRMED", badge: "PASS" }
    : { status: "WAITING", badge: "WAIT" };
}

export function buildObGateStepSet(data: PlanStatus): { title: string; steps: StepUI[] } {
  const ob = getObGate(data);

  const bias = norm(readBias(ob));
  const { low: zLow, high: zHigh } = readH1Zone(ob);
  const zoneText =
    typeof zLow === "number" && typeof zHigh === "number" ? `${fmtNum(zLow)}–${fmtNum(zHigh)}` : null;

  const h1Note = String(readH1Note(ob) ?? "").trim();

  const entry = ob?.entry ?? {};
  const entryStatusRaw = entry?.status ?? entry?.status_th ?? "";
  const whyRaw = entry?.why ?? entry?.why_th ?? entry?.reason_th ?? "";

  const entryZone = entry?.entry_zone ?? null;
  const sl = entry?.sl ?? null;
  const tp1 = entry?.tp1 ?? null;

  const touchNode = ob?.gates?.touch ?? ob?.touch ?? null;
  const sweepNode = ob?.gates?.sweep ?? ob?.sweep ?? null;
  const reclaimNode = ob?.gates?.reclaim ?? ob?.reclaim ?? null;
  const chochNode = ob?.gates?.choch ?? ob?.choch ?? null;
  const m5Node = ob?.m5 ?? ob?.m5_ob_confirm ?? null;

  const touchRaw = readGateRaw(ob?.gates, "touch");
  const sweepRaw = readGateRaw(ob?.gates, "sweep");
  const reclaimRaw = readGateRaw(ob?.gates, "reclaim");
  const chochRaw = readGateRaw(ob?.gates, "choch");
  const m5Raw = m5Node?.status ?? m5Node?.status_th ?? "";

  const hasRealGates =
    !!(norm(touchRaw) || norm(sweepRaw) || norm(reclaimRaw) || norm(chochRaw)) ||
    typeof touchNode === "boolean" ||
    typeof sweepNode === "boolean" ||
    typeof reclaimNode === "boolean" ||
    typeof chochNode === "boolean";

  const inferred = inferFromWhy(whyRaw, entryStatusRaw);

  const touch =
    statusFromRaw(touchRaw).badge !== "WAIT"
      ? statusFromRaw(touchRaw)
      : boolGateStatus(typeof touchNode === "object" ? touchNode?.ok : touchNode) ?? (hasRealGates ? statusFromRaw(touchRaw) : inferred.touch);

  const sweep =
    statusFromRaw(sweepRaw).badge !== "WAIT"
      ? statusFromRaw(sweepRaw)
      : boolGateStatus(typeof sweepNode === "object" ? sweepNode?.seen ?? sweepNode?.ok : sweepNode) ?? (hasRealGates ? statusFromRaw(sweepRaw) : inferred.sweep);

  const reclaim =
    statusFromRaw(reclaimRaw).badge !== "WAIT"
      ? statusFromRaw(reclaimRaw)
      : boolGateStatus(typeof reclaimNode === "object" ? reclaimNode?.ok : reclaimNode) ?? (hasRealGates ? statusFromRaw(reclaimRaw) : inferred.reclaim);

  const choch =
    statusFromRaw(chochRaw).badge !== "WAIT"
      ? statusFromRaw(chochRaw)
      : boolGateStatus(typeof chochNode === "object" ? chochNode?.ok : chochNode) ?? (hasRealGates ? statusFromRaw(chochRaw) : inferred.choch);

  const m5ob =
    norm(String(m5Raw))
      ? statusFromRaw(String(m5Raw))
      : boolGateStatus(typeof m5Node === "object" ? m5Node?.ok : m5Node) ?? inferred.m5ob;

  const entryNorm = norm(entryStatusRaw);
  const ready =
    entryNorm === "READY" || entryNorm === "CONFIRMED"
      ? { status: "CONFIRMED" as StepStatus, badge: entryNorm }
      : inferred.ready;

  const title = `OB Gate Checklist${bias ? ` • bias=${bias}` : ""}${zoneText ? ` • zone=${zoneText}` : ""}`;

  const step1DetailParts = [
    zoneText ? `โซน 1H OB: ${zoneText}` : "แตะโซน 1H OB ให้ครบก่อน",
    h1Note ? `• ${h1Note}` : "",
  ].filter(Boolean);

  const entryDetailParts = [
    entryZone ? `EntryZone: ${JSON.stringify(entryZone)}` : "EntryZone: —",
    `SL: ${fmtNum(sl)}`,
    `TP1: ${fmtNum(tp1)}`,
  ];

  const steps: StepUI[] = [
    {
      id: "ob_touch_1h",
      title: "Touch 1H OB",
      status: touch.status,
      badge: touch.badge,
      detail: step1DetailParts.join(" "),
      why: hasRealGates ? `gate:touch=${norm(touchRaw) || "BOOL/RAW"}` : `why:${norm(whyRaw) || "—"}`,
    },
    {
      id: "ob_sweep",
      title: "Sweep ที่ OB",
      status: sweep.status,
      badge: sweep.badge,
      detail: zoneText
        ? `ต้องเห็น sweep ในโซน ${zoneText} (ล้างฝูงชนก่อน)`
        : "ต้องเห็นการกวาดสภาพคล่องในโซน (ล้างฝูงชนก่อน)",
      why: hasRealGates ? `gate:sweep=${norm(sweepRaw) || "BOOL/RAW"}` : `why:${norm(whyRaw) || "—"}`,
    },
    {
      id: "ob_reclaim_midrule",
      title: "Reclaim (mid rule)",
      status: reclaim.status,
      badge: reclaim.badge,
      detail: "กลับมายืนตามกติกา mid rule เพื่อยืนยันว่าไม่ได้แค่ไส้ยาวหลอก",
      why: hasRealGates ? `gate:reclaim=${norm(reclaimRaw) || "BOOL/RAW"}` : `why:${norm(whyRaw) || "—"}`,
    },
    {
      id: "ob_choch",
      title: "CHOCH",
      status: choch.status,
      badge: choch.badge,
      detail: "รอ CHOCH ยืนยันโครงสร้างกลับทิศ (กันโดนลากต่อ)",
      why: hasRealGates ? `gate:choch=${norm(chochRaw) || "BOOL/RAW"}` : `why:${norm(whyRaw) || "—"}`,
    },
    {
      id: "ob_5m_ob_confirm",
      title: "5m OB confirm",
      status: m5ob.status,
      badge: m5ob.badge,
      detail: "5m ต้องมี OB / trigger confirm ก่อนถึงจะอนุญาตยิง",
      why: norm(String(m5Raw)) ? `m5:${norm(String(m5Raw))}` : `why:${norm(whyRaw) || "—"}`,
    },
    {
      id: "ob_entry_ready",
      title: "Entry READY",
      status: ready.status,
      badge: ready.badge,
      detail: `ผ่านครบแล้วค่อยยิง • ${entryDetailParts.join(" | ")}`,
      why: `entry.status=${norm(entryStatusRaw) || "—"} • why=${norm(whyRaw) || "—"}`,
    },
  ];

  return { title, steps };
}