// dashboard/components/plan-steps/pickStepSet.ts
import type { PlanStatus, StepSetKey } from "./types";

function getOb(data: PlanStatus) {
    return (data as any)?.ob_gate ?? (data as any)?.planStatus?.ob_gate ?? (data as any)?.plan?.ob_gate ?? null;
}

function hasObGateSignal(ob: any) {
    if (!ob) return false;

    const entryStatus = String(ob?.entry?.status ?? ob?.entry?.status_th ?? "").trim();
    const bias1 = String(
        ob?.bias_1h ??
        ob?.bias1h ??
        ob?.h1?.bias_1h ??
        ob?.h1?.bias1h ??
        ""
    ).trim();

    const hasZone =
        (typeof ob?.h1_ob?.zone?.low === "number" && typeof ob?.h1_ob?.zone?.high === "number") ||
        (typeof ob?.h1ObZone?.low === "number" && typeof ob?.h1ObZone?.high === "number");


    const hasGates =
        !!(ob?.gates?.touch || ob?.gates?.sweep || ob?.gates?.reclaim || ob?.gates?.choch) ||
        !!(ob?.touch || ob?.sweep || ob?.reclaim || ob?.choch);

    // ✅ ต้องมีโซนจริงก่อน ไม่งั้นอย่าโผล่
    if (!hasZone) return false;

    // ✅ แล้วค่อยดูว่าโซนนี้มีสัญญาณอะไรประกอบ
    return !!entryStatus || !!bias1 || hasGates;

}

function obIsReady(ob: any) {
    const s = String(ob?.entry?.status ?? "").trim().toUpperCase();
    return s === "READY" || s === "CONFIRMED";
}

export function pickStepSet(data: PlanStatus): StepSetKey {
    const modeLock = String(data?.mode_lock?.value ?? "GRID").toUpperCase();
    const ps = String(data?.states?.plan_state ?? "").toUpperCase();
    const ob = getOb(data);

    // 0) BREAKOUT มาก่อนเสมอ
    if (ps.includes("BREAKOUT")) return "BREAKOUT_SWITCH_MODE";

    const hasOb = hasObGateSignal(ob);
    const ready = obIsReady(ob);

    // 1) TREND cases: ให้ TREND step set เป็นหลัก
    //    แต่ถ้า OB READY/CONFIRMED -> ให้ OB checklist ชนะ (เพราะเป็น entry checklist)
    if (ps.includes("TREND_UP")) {
        return ready ? "OB_GATE_STEPSET" : "TREND_UP_STEPSET";
    }
    if (ps.includes("TREND_DOWN")) {
        return ready ? "OB_GATE_STEPSET" : "TREND_DOWN_STEPSET";
    }

    // 2) locked modes: โดยปกติล็อก
    //    แต่ถ้ามี OB signal (โดยเฉพาะ READY) ให้โชว์ OB checklist ได้
    if (modeLock === "NO_TRADE") {
        if (hasOb) return "OB_GATE_STEPSET";
        return "MODE_LOCKED_NO_TRADE";
    }
    if (modeLock === "TREND") {
        if (ready) return "OB_GATE_STEPSET";
        return "MODE_LOCKED_TREND";
    }

    // 3) GRID / default: ถ้ามี OB ก็โชว์ OB checklist (ตอบคำถาม "1H ให้โซน — 5m ต้องทำอะไร")
    if (hasOb) return "OB_GATE_STEPSET";

    return "GRID_SWEEP_PIPELINE";
}
