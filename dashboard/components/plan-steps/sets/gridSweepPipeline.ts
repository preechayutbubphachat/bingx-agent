import type { PlanStatus, StepUI, StepStatus } from "../types";

function statusFrom5mSweep(v: string | null | undefined): StepStatus {
    const s = String(v ?? "").toUpperCase();
    if (s.includes("SWEEP_UP_CONFIRMED")) return "CONFIRMED";
    if (s.includes("NO_DATA") || s.includes("ERROR")) return "FAILED";
    return "WAITING";
}

function statusFrom15mRej(v: string | null | undefined, sweepOK: boolean): StepStatus {
    const s = String(v ?? "").toUpperCase();
    if (!sweepOK) return "LOCKED";
    if (s.includes("REJECTION_15M_CONFIRMED")) return "CONFIRMED";
    if (s.includes("NO_15M_DATA")) return "WAITING";
    if (s.includes("PENDING")) return "WAITING";
    if (s.includes("ERROR")) return "FAILED";
    return "WAITING";
}

function statusFrom1hConfirm(v: string | null | undefined, rejOK: boolean): StepStatus {
    const s = String(v ?? "").toUpperCase();
    if (!rejOK) return "LOCKED";
    if (s.includes("FAKEOUT_1H_CONFIRMED")) return "CONFIRMED";
    if (s.includes("BREAKOUT_1H_CONFIRMED")) return "FAILED";
    if (s.includes("NO_1H_DATA")) return "WAITING";
    if (s.includes("UNDECIDED")) return "WAITING";
    return "WAITING";
}

export function buildGridSweepPipeline(data: PlanStatus) {
    const sweep5 = data.states?.sweep_5m ?? "";
    const rej15 = data.states?.rejection_15m ?? "";
    const conf1h = data.states?.confirm_1h ?? "";

    const s1 = statusFrom5mSweep(sweep5);
    const sweepOK = s1 === "CONFIRMED";

    const s2 = statusFrom15mRej(rej15, sweepOK);
    const rejOK = s2 === "CONFIRMED";

    const s3 = statusFrom1hConfirm(conf1h, rejOK);

    const z = data.plan?.sweep_target?.zone;
    const zoneText = Array.isArray(z) ? `${z[0]}–${z[1]}` : "—";

    const steps: StepUI[] = [
        {
            id: "SWEEP_5M",
            title: `5m Sweep โซนบน ${zoneText}`,
            status: s1,
            badge: s1 === "CONFIRMED" ? "PASS" : s1 === "FAILED" ? "FAIL" : "WAIT",
            detail: "รอให้เกิดการกวาดบน แล้วปิดกลับใต้โซน",
            why: sweep5 ? `state:${sweep5}` : undefined,
        },
        {
            id: "REJECTION_15M",
            title: "15m Rejection (ปิดกลับใต้โซน)",
            status: s2,
            badge: s2 === "CONFIRMED" ? "PASS" : s2 === "FAILED" ? "FAIL" : s2 === "LOCKED" ? "LOCK" : "WAIT",
            detail: "หลัง sweep ต้องเห็นแท่ง 15m ปฏิเสธ (wick บน + ปิดกลับใต้โซน)",
            why: rej15 ? `state:${rej15}` : undefined,
        },
        {
            id: "CONFIRM_1H",
            title: "1H Confirm (Fakeout/Breakout)",
            status: s3,
            badge: s3 === "CONFIRMED" ? "PASS" : s3 === "FAILED" ? "FAIL" : s3 === "LOCKED" ? "LOCK" : "WAIT",
            detail: "1H ต้องยืนยันว่า fakeout (กลับเข้า range) หรือ breakout (ยืนเหนือโซนบน)",
            why: conf1h ? `state:${conf1h}` : undefined,
        },
    ];

    return { title: "GRID — Sweep Pipeline", steps };
}
