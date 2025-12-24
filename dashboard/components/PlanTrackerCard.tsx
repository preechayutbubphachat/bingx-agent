// dashboard/components/PlanTrackerCard.tsx
"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import MarketStatusCard from "@/components/MarketStatusCard";

import { buildSteps as buildStepsUI } from "@/components/plan-steps/buildSteps";
import type { LogItem, PlanStatus, StepSetKey, StepStatus } from "@/components/plan-steps/types";

// ✅ ใช้แค่ type ให้พอ (กัน eslint unused)
import type { DerivDir } from "@/components/plan-steps/timelineHelpers";

const POLL_MS = 10_000;

// 🔥 Event alert จะโชว์บน Market Regime card แค่ช่วงสั้น ๆ แล้วหายเอง
const IMPORTANT_EVENT_WINDOW_SEC = 120;

// กรอง noise ของ % เปลี่ยนแปลง (OI/Funding) ก่อนค่อยโชว์ใน badge
const DERIV_PCT_MIN = 0.05;

// ✅ กรอง noise ของ Price 5m dir
const PRICE_PCT_MIN = 0.02;

/** ----------------- small utils ----------------- */

function fmt(n: number | null | undefined) {
    if (n === null || n === undefined || Number.isNaN(n)) return "—";
    return n.toLocaleString();
}

function toMs(ts: number | null | undefined): number | null {
    if (!ts) return null;
    return ts < 1e12 ? ts * 1000 : ts;
}

function dirBadge(dir?: string) {
    const d = String(dir ?? "").toUpperCase();
    if (!d) return "bg-neutral-800 text-neutral-300 border-neutral-700";
    if (d === "UP") return "bg-emerald-500/15 text-emerald-200 border-emerald-500/30";
    if (d === "DOWN") return "bg-rose-500/15 text-rose-200 border-rose-500/30";
    if (d === "FLAT") return "bg-amber-500/15 text-amber-200 border-amber-500/30";
    return "bg-neutral-800 text-neutral-300 border-neutral-700";
}

function stateBadgeTone(to: string) {
    const s = (to ?? "").toUpperCase();
    if (s.includes("SWEEP")) return "bg-amber-500/15 text-amber-200 border-amber-500/30";
    if (s.includes("REJECTION")) return "bg-rose-500/15 text-rose-200 border-rose-500/30";
    if (s.includes("FAKEOUT") || s.includes("RANGE_PLAY") || s.includes("CONFIRMED"))
        return "bg-emerald-500/15 text-emerald-200 border-emerald-500/30";
    if (s.includes("BREAKOUT")) return "bg-sky-500/15 text-sky-200 border-sky-500/30";
    if (s.includes("NO_TRADE") || s.includes("LOCKED")) return "bg-neutral-500/15 text-neutral-200 border-neutral-500/30";
    return "bg-neutral-800 text-neutral-300 border-neutral-700";
}

function stepTone(status: StepStatus, isActive: boolean) {
    if (isActive) {
        return {
            wrap: "border border-emerald-500/60 ring-2 ring-emerald-500/25 bg-emerald-500/10",
            dot: "bg-emerald-400",
            badge: "bg-emerald-500/20 text-emerald-200 border border-emerald-500/40",
            title: "text-emerald-50",
        };
    }

    if (status === "CONFIRMED") {
        return {
            wrap: "border border-white/10 bg-white/5",
            dot: "bg-emerald-400",
            badge: "bg-emerald-500/10 text-emerald-200 border border-emerald-500/20",
            title: "text-white/90",
        };
    }

    if (status === "WAITING") {
        return {
            wrap: "border border-white/10 bg-white/5",
            dot: "bg-white/25",
            badge: "bg-white/5 text-white/70 border border-white/10",
            title: "text-white/90",
        };
    }

    if (status === "LOCKED" || status === "SKIPPED") {
        return {
            wrap: "border border-white/5 bg-white/3 opacity-75",
            dot: "bg-white/15",
            badge: "bg-white/3 text-white/50 border border-white/5",
            title: "text-white/70",
        };
    }

    return {
        wrap: "border border-rose-500/30 bg-rose-500/10",
        dot: "bg-rose-400",
        badge: "bg-rose-500/15 text-rose-200 border border-rose-500/30",
        title: "text-rose-50",
    };
}

/** ----------------- Timeline helpers ----------------- */

function tfProgressFromPlanState(ps: string) {
    const s = (ps ?? "").toUpperCase();
    if (s.includes("WAIT_SWEEP")) return "ครบ: —";
    if (s.includes("WAIT_15M_REJECTION")) return "ครบ: 5m";
    if (s.includes("WAIT_1H_CONFIRM")) return "ครบ: 5m + 15m";
    if (s.includes("FAKEOUT_CONFIRMED") || s.includes("RANGE_PLAY")) return "ครบ: 5m + 15m + 1H";
    if (s.includes("BREAKOUT_CONFIRMED") || s.includes("SWITCH_MODE")) return "ครบ: 5m + 15m + 1H";
    if (s.includes("NO_TRADE") || s.includes("LOCKED")) return "ครบ: —";
    return "ครบ: —";
}

function eventIcon(e: LogItem) {
    const type = String(e.type ?? "").toUpperCase();
    const to = String(e.to ?? "").toUpperCase();

    if (type.includes("MODE_SWITCH")) return "🔁";
    if (to.includes("SWEEP")) return "🧹";
    if (to.includes("REJECTION")) return "🪝";
    if (to.includes("FAKEOUT") || to.includes("RANGE_PLAY")) return "✅";
    if (to.includes("BREAKOUT")) return "🚀";
    if (to.includes("NO_DATA") || to.includes("FAILED")) return "⚠️";
    if (to.includes("LOCKED") || to.includes("NO_TRADE")) return "🔒";
    return "•";
}

function oneLineSummary(e: LogItem) {
    if (e.explain_th && e.explain_th.trim().length) return e.explain_th.trim();

    const to = String(e.to ?? "").toUpperCase();
    if (to.includes("WAIT_SWEEP")) return "ยังไม่เข้าจังหวะ — รอให้กวาดบนก่อน";
    if (to.includes("WAIT_15M_REJECTION")) return "กวาดบนแล้ว — รอ 15m ปิดยืนยัน rejection";
    if (to.includes("WAIT_1H_CONFIRM")) return "15m ผ่านแล้ว — รอ 1H ยืนยัน fakeout/breakout";
    if (to.includes("FAKEOUT_CONFIRMED") || to.includes("RANGE_PLAY")) return "ยืนยัน fakeout — กลับไปเล่นในกรอบ";
    if (to.includes("BREAKOUT_CONFIRMED") || to.includes("SWITCH_MODE")) return "ยืนยัน breakout — ต้องเปลี่ยนโหมด (หยุดกริด/ปรับแผน)";
    if (to.includes("NO_TRADE")) return "ล็อก NO_TRADE — งดเทรดตามบทวิเคราะห์";
    if (to.includes("TREND")) return "ล็อก TREND — พักกริด รอแผนเทรนด์";
    return `สถานะเปลี่ยน → ${e.to}`;
}

function isModeSwitch(e: LogItem) {
    return String(e.type ?? "").toUpperCase().includes("MODE_SWITCH");
}

function normalizeTrapped(v: unknown) {
    return String(v ?? "").trim().toUpperCase();
}

// ✅ SMART: แสดง badge เฉพาะ “มีความหมายจริง”
function shouldShowSmartBadges(e: LogItem) {
    const trapped = normalizeTrapped(e.deriv?.trapped);
    return isModeSwitch(e) || (!!trapped && trapped !== "NONE");
}

// ✅ แปล trapped → ไทยสั้น ๆ
function trappedReasonTH(trappedRaw?: string) {
    const t = String(trappedRaw ?? "").trim().toUpperCase();
    if (!t || t === "NONE") return null;

    if (t.includes("LONG")) return "ฝั่ง Long เริ่มโดนบีบ";
    if (t.includes("SHORT")) return "ฝั่ง Short เริ่มโดนบีบ";
    if (t.includes("BOTH")) return "สองฝั่งเริ่มโดนบีบ";
    if (t.includes("SQUEEZE")) return "เริ่มมีแรงบีบ (squeeze)";

    return "เริ่มมีคนติดอยู่";
}

function reasonChipFromEvent(e: LogItem) {
    const trapped = trappedReasonTH(e.deriv?.trapped);
    const isSwitch = isModeSwitch(e);

    if (!trapped && !isSwitch) return null;

    if (trapped) {
        return {
            icon: "⚠️",
            tone: "border-amber-500/30 bg-amber-500/10 text-amber-200",
            label: trapped,
        };
    }

    return {
        icon: "🔁",
        tone: "border-sky-500/30 bg-sky-500/10 text-sky-200",
        label: "ระบบกำลังเปลี่ยนโหมด",
    };
}

function isImportantEvent(e: LogItem) {
    const to = String(e.to ?? "").toUpperCase();
    const trapped = normalizeTrapped(e.deriv?.trapped);
    return isModeSwitch(e) || (trapped && trapped !== "NONE") || to.includes("BREAKOUT") || to.includes("NO_TRADE") || to.includes("LOCKED");
}

function findLatestImportantEvent(items: LogItem[]) {
    const sorted = [...items].sort((a, b) => b.t - a.t);
    return sorted.find((x) => isImportantEvent(x)) ?? null;
}

// ✅ NEW: ให้ alert มีข้อความสั้นอ่านง่าย
function alertTextFromEventShort(e: LogItem) {
    const type = String(e.type ?? "").toUpperCase();
    const to = String(e.to ?? e.to_plan_state ?? "").toUpperCase();

    if (type.includes("MODE_SWITCH")) {
        const fromMode = e.from_mode ?? "—";
        const toMode = e.to_mode ?? "—";
        const ps = e.to_plan_state ?? e.to ?? "";
        return `ระบบเปลี่ยนโหมด: ${fromMode} → ${toMode}${ps ? ` • plan_state=${ps}` : ""}`;
    }

    if (to.includes("BREAKOUT")) return "ยืนยัน Breakout — หยุดเกมกรอบ/เตรียมเปลี่ยนโหมด";
    if (to.includes("NO_TRADE")) return "ล็อก NO_TRADE — งดเทรดตามบทวิเคราะห์";
    if (to.includes("LOCKED")) return "ระบบล็อกสถานะ — รอ context ใหม่";

    return oneLineSummary(e);
}

function dayLabelTH(ts: number) {
    return new Date(ts).toLocaleDateString("th-TH", { year: "numeric", month: "short", day: "numeric" });
}

function timeTH(ts: number) {
    return new Date(ts).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
}

function ymd(ts: number) {
    const d = new Date(ts);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const da = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${da}`;
}

function groupTimeline(items: LogItem[]) {
    const sorted = [...items].sort((a, b) => b.t - a.t);
    const groups: { key: string; label: string; items: LogItem[] }[] = [];

    for (const it of sorted) {
        const key = ymd(it.t);
        const label = dayLabelTH(it.t);
        const g = groups.find((x) => x.key === key);
        if (g) g.items.push(it);
        else groups.push({ key, label, items: [it] });
    }

    return groups;
}

function pickTodayGroup(groups: { key: string; label: string; items: LogItem[] }[]) {
    const todayKey = ymd(Date.now());
    return groups.find((g) => g.key === todayKey) ?? null;
}

function findLatestStateChange(items: LogItem[]) {
    const sorted = [...items].sort((a, b) => b.t - a.t);
    return sorted.find((x) => String(x.type ?? "").toUpperCase().includes("STATE_CHANGE")) ?? null;
}

function significantPct(pct: unknown) {
    if (typeof pct !== "number" || Number.isNaN(pct)) return false;
    return Math.abs(pct) >= DERIV_PCT_MIN;
}
function pctDir(pct: number | null, deadzone = 0.05): DerivDir {
    if (typeof pct !== "number" || Number.isNaN(pct)) return "UNKNOWN";
    if (pct > deadzone) return "UP";
    if (pct < -deadzone) return "DOWN";
    return "FLAT";
}

function emojiForCombo(p: DerivDir, oi: DerivDir) {
    // quick vibe
    if (p === "UP" && oi === "UP") return "🚀";
    if (p === "UP" && oi === "DOWN") return "🪝";
    if (p === "DOWN" && oi === "UP") return "🧨";
    if (p === "DOWN" && oi === "DOWN") return "🧹";
    if (p === "FLAT" && oi === "UP") return "🫧";
    if (p === "FLAT" && oi === "DOWN") return "🧊";
    return "•";
}

function buildPriceVsOiTwoLiner(args: {
    pricePct: number | null;
    oiPct: number | null;
    fundingPct: number | null;

    priceDir: DerivDir;
    oiDir: DerivDir;
    fundingDir: DerivDir;

    // optional: ใช้ทำคำพูดให้คมขึ้น
    planState?: string;
}) {
    const { pricePct, oiPct, fundingPct, priceDir, oiDir, fundingDir, planState } = args;

    const dirTH = (d: DerivDir) =>
        d === "UP" ? "ขึ้น" : d === "DOWN" ? "ลง" : d === "FLAT" ? "ทรงตัว" : "ยังไม่ชัด";

    const pctTH = (p: number | null) =>
        typeof p === "number" ? `${p >= 0 ? "+" : ""}${p.toFixed(2)}%` : "—";

    const emo = emojiForCombo(priceDir, oiDir);

    // line 1 = facts
    const line1 = `${emo} Price(5m): ${dirTH(priceDir)} ${pctTH(pricePct)}  |  OI(5m): ${dirTH(oiDir)} ${pctTH(
        oiPct
    )}`;

    // line 2 = meaning (SMC-ish, crowd/positioning)
    let meaning = "สัญญาณยังไม่แน่น — รอแท่งยืนยันอีกนิด";

    // 1) ราคา↑ + OI↑ = impulse continuation (แต่ระวังแออัด)
    if (priceDir === "UP" && oiDir === "UP") {
        if (fundingDir === "UP") meaning = "แรงขึ้น + คนเติมสัญญา → ไปต่อได้ แต่ Funding เอียง = ระวัง “แออัดแล้วโดนบีบ”";
        else if (fundingDir === "DOWN") meaning = "แรงขึ้นแต่ Funding เอียงลง → อาจเป็น squeeze ฝั่ง Short (ขึ้นไว ระวังไส้ไหล)";
        else meaning = "แรงขึ้น + คนเติมสัญญา → โมเมนตัมจริง (รอจังหวะย่อค่อยตาม)";
    }

    // 2) ราคา↑ + OI↓ = short covering / unwind (ขึ้นแต่คนปิดโพสิชัน)
    if (priceDir === "UP" && oiDir === "DOWN") {
        meaning = "ราคาขึ้นแต่ OI ลด → มักเป็น “ปิดช็อต/ถอนของ” มากกว่าเติมแรงใหม่ (ระวังขึ้นแล้วหมดแรง)";
    }

    // 3) ราคา↓ + OI↑ = aggressive positioning (ถ้า funding + = longs trapped, funding - = shorts in control)
    if (priceDir === "DOWN" && oiDir === "UP") {
        if (fundingDir === "UP") meaning = "ลงแต่คนเติมสัญญา + Funding บวก → เสี่ยง “Long ติดบน/โดนไล่ลง”";
        else if (fundingDir === "DOWN") meaning = "ลง + คนเติมสัญญา + Funding ลบ → ฝั่ง Short คุมเกม (ระวังไหลต่อ)";
        else meaning = "ลงแต่ OI เพิ่ม → มีคนกำลังกดโพสิชันเพิ่ม (ระวังโดนลากต่อหรือเกิด squeeze กลับ)";
    }

    // 4) ราคา↓ + OI↓ = liquidation / unwind (มักเกิดช่วงล้างของ)
    if (priceDir === "DOWN" && oiDir === "DOWN") {
        meaning = "ลงพร้อม OI ลด → ตลาดกำลัง “ล้างของ/ปิดโพสิชัน” (บางทีใกล้จบแรงขาย แต่ต้องรอ confirm)";
    }

    // 5) ราคาแบน แต่ OI↑/↓
    if (priceDir === "FLAT" && oiDir === "UP") meaning = "ราคาไม่ไปแต่ OI เพิ่ม → คนแอบสะสมโพสิชัน (ระวังโดนลากหลอกทั้งสองฝั่ง)";
    if (priceDir === "FLAT" && oiDir === "DOWN") meaning = "ราคาไม่ไปแต่ OI ลด → ตลาดเริ่มเบาบาง/ถอนตัว รอสัญญาณใหม่";

    // เติม hint ตาม planState เล็กน้อย (ไม่เยิ่นเย้อ)
    const ps = String(planState ?? "").toUpperCase();
    if (ps.includes("WAIT") && (priceDir === "UP" && oiDir === "UP")) {
        meaning += " • แต่ถ้ายังอยู่โหมดรอ ให้รอเข้าโซน/แท่งยืนยันก่อนค่อยทำ";
    }
    if (ps.includes("INVALID") || ps.includes("STOP")) {
        meaning = "แผนพัง/ใกล้พัง — อย่าฝืน อ่านรอบใหม่จาก snapshot";
    }

    const line2 = `อ่านว่า: ${meaning}`;

    return { line1, line2 };
}

/** ----------------- Notice row ----------------- */

function modeNoticeFrom(stepSet: StepSetKey, planState: string) {
    const ps = String(planState ?? "").toUpperCase();

    if (stepSet === "TREND_UP_STEPSET") {
        return {
            show: true as const,
            icon: "📈",
            tone: "border-emerald-500/30 bg-emerald-500/10 text-emerald-50",
            title: "TREND_UP plan steps",
            detail: "ใช้ step set จาก decision: รอ pullback → 5m confirm → HL → OI → entry",
        };
    }

    if (stepSet === "BREAKOUT_SWITCH_MODE" || ps.includes("BREAKOUT")) {
        return {
            show: true as const,
            icon: "🚀",
            tone: "border-sky-500/30 bg-sky-500/10 text-sky-100",
            title: "Breakout confirmed — ต้องเปลี่ยนโหมด",
            detail: "เกมกรอบจบแล้ว: หยุดกริด/ปรับแผน → ไปให้ agent วิเคราะห์ใหม่",
        };
    }

    if (stepSet === "MODE_LOCKED_NO_TRADE") {
        return {
            show: true as const,
            icon: "🔒",
            tone: "border-neutral-500/30 bg-neutral-500/10 text-neutral-100",
            title: "NO_TRADE locked",
            detail: "งดเทรดก่อน รอ context ใหม่แล้วค่อย re-evaluate",
        };
    }

    if (stepSet === "MODE_LOCKED_TREND") {
        return {
            show: true as const,
            icon: "📈",
            tone: "border-emerald-500/30 bg-emerald-500/10 text-emerald-50",
            title: "TREND mode — Grid disabled",
            detail: "พักแผนกริด แล้วรอสัญญาณเทรนด์ตาม decision",
        };
    }

    return { show: false as const };
}

/** ----------------- Timeline UI helpers (DRY) ----------------- */

function TimelineRow({ x, showCrowd }: { x: LogItem; showCrowd?: boolean }) {
    const icon = eventIcon(x);
    const summary = oneLineSummary(x);
    const progress = tfProgressFromPlanState(String(x.to ?? ""));
    const showSmart = shouldShowSmartBadges(x);
    const reasonChip = reasonChipFromEvent(x);

    const oiDir = x.deriv?.oi5_dir;
    const oiPct = x.deriv?.oi5_pct;
    const fundDir = x.deriv?.fund5_dir;
    const fundPct = x.deriv?.fund5_pct;

    const showOi = !!oiDir && (isModeSwitch(x) || significantPct(oiPct));
    const showFund = !!fundDir && (isModeSwitch(x) || significantPct(fundPct));

    return (
        <div className="flex gap-3">
            <div className="mt-1 h-7 w-7 shrink-0 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-sm">{icon}</div>

            <div className="flex-1">
                <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-400">
                    <span>{timeTH(x.t)}</span>
                    <span className="text-neutral-600">•</span>

                    <span className={`rounded-full border px-2 py-0.5 ${stateBadgeTone(String(x.to ?? ""))}`}>
                        {x.from ?? "—"} → <b className="text-neutral-100">{x.to}</b>
                    </span>

                    <span className="rounded-full border border-neutral-700 px-2 py-0.5 text-neutral-300">{progress}</span>

                    {x.price?.close_5m !== undefined && (
                        <span className="rounded-full border border-neutral-700 px-2 py-0.5 text-neutral-300">
                            close5m: {fmt(x.price.close_5m)}
                        </span>
                    )}

                    {showSmart && (
                        <>
                            {reasonChip && <span className={`rounded-full border px-2 py-0.5 ${reasonChip.tone}`}>{reasonChip.icon} {reasonChip.label}</span>}

                            {isModeSwitch(x) && (
                                <span className="rounded-full border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-sky-200">
                                    mode: {x.from_mode ?? "—"} → {x.to_mode ?? "—"}
                                </span>
                            )}

                            {showOi && (
                                <span className={`rounded-full border px-2 py-0.5 ${dirBadge(oiDir)}`}>
                                    OI5: {oiDir}
                                    {typeof oiPct === "number" ? ` (${oiPct.toFixed(2)}%)` : ""}
                                </span>
                            )}

                            {showFund && (
                                <span className={`rounded-full border px-2 py-0.5 ${dirBadge(fundDir)}`}>
                                    F5: {fundDir}
                                    {typeof fundPct === "number" ? ` (${fundPct.toFixed(2)}%)` : ""}
                                </span>
                            )}

                            {showCrowd && x.deriv?.crowd && (
                                <span className="rounded-full border border-neutral-700 px-2 py-0.5 text-neutral-300">
                                    crowd: {x.deriv.crowd}
                                </span>
                            )}
                        </>
                    )}
                </div>

                <div className="mt-1 text-sm text-neutral-200">{summary}</div>
            </div>
        </div>
    );
}

function TimelineList({ items, maxH, showCrowd }: { items: LogItem[]; maxH: string; showCrowd?: boolean }) {
    return (
        <div className={`${maxH} overflow-auto pr-1 space-y-3`}>
            {items.map((x, i) => (
                <TimelineRow key={`${x.t}-${i}`} x={x} showCrowd={showCrowd} />
            ))}
        </div>
    );
}

function InfoButton({ title, children, label = "คำอธิบาย" }: { title: string; children: ReactNode; label?: string }) {
    const [open, setOpen] = useState(false);

    return (
        <div className="absolute bottom-3 right-3 z-20">
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-white/70 hover:bg-white/10 hover:text-white/90"
                title="กดเพื่อดูคำอธิบายของบล็อคนี้"
            >
                ℹ️ {label}
            </button>

            {open && (
                <div className="absolute bottom-9 right-0 z-50 w-[min(420px,90vw)] rounded-xl border border-white/10 bg-neutral-950/95 p-3 shadow-xl backdrop-blur">
                    <div className="flex items-start justify-between gap-3">
                        <div className="text-xs font-semibold text-white/90">{title}</div>
                        <button
                            type="button"
                            onClick={() => setOpen(false)}
                            className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] text-white/70 hover:bg-white/10"
                            aria-label="Close"
                        >
                            ✕
                        </button>
                    </div>

                    <div className="mt-2 text-xs leading-relaxed text-white/75 space-y-2">{children}</div>

                    <div className="mt-2 text-[11px] text-white/40">ทิป: อ่านเฉพาะตอนสงสัยก็พอ — ที่เหลือให้ตาพัก 😮‍💨</div>
                </div>
            )}
        </div>
    );
}

/** ----------------- Component ----------------- */

function asDerivDir(x: unknown): DerivDir {
    const d = String(x ?? "").trim().toUpperCase();
    if (d === "UP" || d === "DOWN" || d === "FLAT") return d as DerivDir;
    return "UNKNOWN";
}

function priceDirFromPct(pct: number | null): DerivDir {
    if (pct === null || !Number.isFinite(pct)) return "UNKNOWN";
    if (pct > PRICE_PCT_MIN) return "UP";
    if (pct < -PRICE_PCT_MIN) return "DOWN";
    return "FLAT";
}

export default function PlanTrackerCard() {
    const [data, setData] = useState<PlanStatus | null>(null);
    const [logs, setLogs] = useState<LogItem[]>([]);
    const [err, setErr] = useState<string | null>(null);

    const [now, setNow] = useState(() => Date.now());
    const [pageFetchedAt, setPageFetchedAt] = useState<number | null>(null);

    const prevSourceUpdatedAtRef = useRef<number | null>(null);
    const [candleIntervalSec, setCandleIntervalSec] = useState<number | null>(null);

    // ✅ track price direction (5m) จาก poll รอบก่อน
    const prevClose5mRef = useRef<number | null>(null);
    const [price5mDir, setPrice5mDir] = useState<DerivDir>("UNKNOWN");
    const [price5mPct, setPrice5mPct] = useState<number | null>(null);

    // tick for realtime ages
    useEffect(() => {
        const id = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(id);
    }, []);

    async function load() {
        const res = await fetch("/api/plan-status", { cache: "no-store" });
        if (!res.ok) throw new Error(`plan-status http ${res.status}`);

        const j = (await res.json()) as PlanStatus;
        if (!j.ok) throw new Error("plan-status not ok");

        setPageFetchedAt(Date.now());

        // candle interval sec
        const nextCandleAt = toMs(j.source_updated_at) ?? null;
        const prevCandleAt = prevSourceUpdatedAtRef.current;
        if (nextCandleAt && prevCandleAt && nextCandleAt !== prevCandleAt) {
            setCandleIntervalSec(Math.max(0, Math.floor((nextCandleAt - prevCandleAt) / 1000)));
        }
        prevSourceUpdatedAtRef.current = nextCandleAt;

        // ✅ price 5m dir (compare prev close)
        const close5m = typeof j.price?.close_5m === "number" ? j.price.close_5m : null;
        const prev = prevClose5mRef.current;

        if (close5m !== null && prev !== null) {
            const base = Math.abs(prev) < 1e-9 ? 1 : prev;
            const pct = ((close5m - prev) / base) * 100;
            setPrice5mPct(pct);
            setPrice5mDir(priceDirFromPct(pct));
        } else {
            setPrice5mPct(null);
            setPrice5mDir("UNKNOWN");
        }
        prevClose5mRef.current = close5m;
        // ✅ NEW: compute Price(5m) direction vs previous poll
        const closeNow = typeof j?.price?.close_5m === "number" ? j.price.close_5m : null;
        const closePrev = prevClose5mRef.current;

        if (closeNow !== null) {
            if (typeof closePrev === "number" && closePrev !== 0) {
                const pct = ((closeNow - closePrev) / closePrev) * 100;
                setPrice5mPct(pct);
                setPrice5mDir(pctDir(pct)); // ใช้ deadzone กันแกว่ง
            } else {
                setPrice5mPct(null);
                setPrice5mDir("UNKNOWN");
            }
            prevClose5mRef.current = closeNow;
        }

        setData(j);
    }

    async function loadLogs() {
        const res = await fetch("/api/plan-log?limit=80", { cache: "no-store" });
        if (!res.ok) return;

        const j = await res.json();
        if (!j?.ok) return;

        setLogs((j.items ?? []) as LogItem[]);
    }

    // initial + poll
    useEffect(() => {
        (async () => {
            try {
                setErr(null);
                await load();
                await loadLogs();
            } catch (e: any) {
                setErr(e?.message ?? "failed to load");
            }
        })();

        const id = setInterval(async () => {
            try {
                await load();
                await loadLogs();
            } catch {
                // ignore poll errors
            }
        }, POLL_MS);

        return () => clearInterval(id);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const latestImportant = useMemo(() => findLatestImportantEvent(logs), [logs]);

    const importantAgeSec = useMemo(() => {
        if (!latestImportant?.t) return null;
        return Math.max(0, Math.floor((now - latestImportant.t) / 1000));
    }, [now, latestImportant?.t]);

    const showRegimeAlert = useMemo(() => {
        if (!latestImportant || importantAgeSec === null) return false;
        return importantAgeSec <= IMPORTANT_EVENT_WINDOW_SEC;
    }, [latestImportant, importantAgeSec]);

    const candleAgeSec = useMemo(() => {
        const t = toMs(data?.source_updated_at ?? null);
        if (!t) return null;
        return Math.max(0, Math.floor((now - t) / 1000));
    }, [now, data?.source_updated_at]);

    const pageAgeSec = useMemo(() => {
        if (!pageFetchedAt) return null;
        return Math.max(0, Math.floor((now - pageFetchedAt) / 1000));
    }, [now, pageFetchedAt]);

    const nextPollInSec = useMemo(() => {
        if (pageAgeSec === null) return null;
        const every = Math.max(1, Math.floor(POLL_MS / 1000));
        const mod = pageAgeSec % every;
        return Math.max(0, every - mod);
    }, [pageAgeSec]);

    const timelineGroups = useMemo(() => groupTimeline(logs), [logs]);
    const todayGroup = useMemo(() => pickTodayGroup(timelineGroups), [timelineGroups]);
    const latestChange = useMemo(() => findLatestStateChange(logs), [logs]);

    const nonTodayGroups = useMemo(() => {
        const todayKey = ymd(Date.now());
        return timelineGroups.filter((g) => g.key !== todayKey).slice(0, 14);
    }, [timelineGroups]);

    const modeLock = useMemo(() => {
        return data?.mode_lock?.value ?? "GRID";
    }, [data?.mode_lock?.value]);

    // ✅ build steps from single source of truth
    const built = useMemo(() => {
        return data ? buildStepsUI(data) : null;
    }, [data]);

    const stepSet = (built?.key ?? "GRID_SWEEP_PIPELINE") as StepSetKey;

    const notice = useMemo(() => {
        return modeNoticeFrom(stepSet, data?.states?.plan_state ?? "");
    }, [stepSet, data?.states?.plan_state]);

    if (err) {
        return <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-5 text-rose-200">โหลด Plan Tracker ไม่ได้: {err}</div>;
    }

    if (!data || !built) {
        return <div className="rounded-2xl border border-neutral-700 bg-neutral-900 p-5 text-neutral-300">กำลังโหลด Plan Tracker…</div>;
    }

    const d = data.derivatives;
    const [zLow, zHigh] = data.plan.sweep_target.zone;
    const zoneText = `${zLow}–${zHigh}`;

    // ✅ Quick read (ภาษาไทยอ่านง่าย)
    const priceVsOi = (() => {
        const oiPct = typeof d?.oi?.trend_5m?.pct === "number" ? d.oi.trend_5m.pct : null;
        const fPct = typeof d?.funding?.trend_5m?.pct === "number" ? d.funding.trend_5m.pct : null;

        const oiDir = asDerivDir(d?.oi?.trend_5m?.dir ?? pctDir(oiPct));
        const fDir = asDerivDir(d?.funding?.trend_5m?.dir ?? pctDir(fPct));

        const hasAny =
            price5mDir !== "UNKNOWN" || oiDir !== "UNKNOWN" || typeof oiPct === "number" || typeof price5mPct === "number";
        if (!hasAny) return null;

        return buildPriceVsOiTwoLiner({
            pricePct: price5mPct,
            oiPct,
            fundingPct: fPct,
            priceDir: price5mDir,
            oiDir,
            fundingDir: fDir,
            planState: data?.states?.plan_state,
        });
    })();

    return (
        <div className="space-y-3">
            {/* Top: Market card */}
            <div className="relative">
                <MarketStatusCard
                    regime={data.plan.market_regime}
                    marketMode={data.plan.market_mode}
                    confidence={data.plan.confidence ?? undefined}
                    updatedAt={data.updated_at}
                    riskWarnings={data.plan.risk_warning ?? []}
                />

                {showRegimeAlert && latestImportant && (
                    <div className="absolute left-4 right-4 top-4 z-30">
                        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-amber-100">
                            <div className="flex items-start justify-between gap-2">
                                <div className="text-xs font-semibold">⚡ {alertTextFromEventShort(latestImportant)}</div>
                                {importantAgeSec !== null && <div className="text-[11px] text-amber-200/70">{importantAgeSec}s ago</div>}
                            </div>
                        </div>
                    </div>
                )}

                <InfoButton title="Market Regime แสดงอะไร?">
                    <div>บล็อคนี้คือ “ป้ายหน้าด่าน” ของตลาด ณ ตอนนี้</div>
                    <ul className="list-disc pl-4 space-y-1">
                        <li>
                            <b>Market Regime</b> = ตลาดอยู่โหมดไหน (RANGE / TREND / ฯลฯ)
                        </li>
                        <li>
                            <b>Strategy</b> = กลยุทธ์หลักที่ระบบแนะนำ (เช่น GRID_NEUTRAL)
                        </li>
                        <li>
                            <b>FRESH</b> = สถานะความสดของสรุป (ช่วยกันหลงเวลา)
                        </li>
                    </ul>
                    <div>ถ้ามีเหตุการณ์แรง ๆ ระบบจะขึ้นเตือนซ้อนบริเวณนี้เพื่อให้เห็นทันที</div>
                </InfoButton>
            </div>

            <div className="rounded-2xl bg-neutral-900 p-5">
                {/* Header row */}
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="text-sm text-neutral-300">
                        <div className="text-neutral-400 text-xs">BTC ล่าสุด</div>
                        <div className="mt-1 font-semibold">
                            Close(5m): <span className="text-neutral-100">{fmt(data.price.close_5m)}</span> <span className="text-neutral-500">|</span> Close(1H):{" "}
                            <span className="text-neutral-100">{fmt(data.price.close_1h)}</span>
                        </div>

                        <div className="mt-1 text-xs text-neutral-500">
                            Mode lock: {modeLock}
                            {price5mDir !== "UNKNOWN" && (
                                <>
                                    <span className="text-neutral-700"> • </span>
                                    Price(5m): {price5mDir}
                                    {typeof price5mPct === "number" ? ` (${price5mPct.toFixed(2)}%)` : ""}
                                </>
                            )}
                        </div>
                    </div>

                    {/* Freshness */}
                    <div className="text-xs text-neutral-400 text-right">
                        <div>
                            Page Fresh: <span className="text-neutral-200">{pageAgeSec === null ? "—" : `${pageAgeSec}s`}</span>
                            {nextPollInSec !== null && <span className="text-neutral-500"> (อัปเดตครั้งใน {nextPollInSec}s)</span>}
                        </div>

                        <div className="mt-0.5">
                            <span className="text-neutral-400" title="อิงจาก source_updated_at (collector) = เวลาที่ชุดแท่ง/ข้อมูลตลาดถูกเก็บล่าสุด">
                                Candle Fresh:
                            </span>{" "}
                            <span className="text-neutral-200">{candleAgeSec === null ? "—" : `${candleAgeSec}s`}</span>
                            {candleIntervalSec !== null && <span className="text-neutral-500"> (อัปเดตครั้งก่อน: {candleIntervalSec}s)</span>}
                        </div>
                    </div>
                </div>

                {/* ✅ Mode Notice Row */}
                {notice.show && (
                    <div className={`mt-3 rounded-xl border px-4 py-3 ${notice.tone}`}>
                        <div className="flex items-start gap-3">
                            <div className="mt-0.5 h-7 w-7 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">{notice.icon}</div>
                            <div className="min-w-0">
                                <div className="text-sm font-semibold">{notice.title}</div>
                                <div className="mt-0.5 text-xs text-white/75">{notice.detail}</div>
                                {latestChange?.t && <div className="mt-1 text-[11px] text-white/55">อัปเดตล่าสุด: {timeTH(latestChange.t)}</div>}
                            </div>
                            <div className="ml-auto text-xs text-white/60">{stepSet}</div>
                        </div>
                    </div>
                )}

                {/* Steps */}
                <div className="mt-4 rounded-xl bg-neutral-950/60 p-4 relative">
                    <div className="flex items-center justify-between gap-3">
                        <div className="text-sm text-neutral-200 font-semibold">{built.title}</div>
                        <div className="text-xs text-neutral-500">state: {data.states.plan_state}</div>
                    </div>

                    <div className="mt-3 grid gap-2 grid-cols-1 sm:grid-cols-3">
                        {built.steps.map((s) => {
                            const isActive = built.activeStepId === s.id;
                            const t = stepTone(s.status, isActive);

                            return (
                                <div key={s.id} className={`rounded-xl border p-3 ${t.wrap}`}>
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="flex items-start gap-3">
                                            <div className={`mt-1 h-3 w-3 rounded-full ${t.dot}`} />
                                            <div className="min-w-0">
                                                <div className={`text-sm font-semibold ${t.title}`}>{s.title}</div>
                                                <div className="mt-0.5 text-xs text-neutral-400">{s.detail}</div>
                                                {s.why && <div className="mt-1 text-[11px] text-neutral-500">state: {s.why}</div>}
                                            </div>
                                        </div>
                                        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-xs ${t.badge}`}>{s.badge}</span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    <div className="mt-3 text-sm text-neutral-300">
                        <div className="text-neutral-400 text-xs">Explain</div>
                        <div className="mt-1">{data.explain_th}</div>
                        {stepSet === "GRID_SWEEP_PIPELINE" && <div className="mt-1 text-xs text-neutral-500">Sweep target: {zoneText}</div>}
                    </div>

                    <InfoButton title="Plan Steps คืออะไร?">
                        <div>บล็อคนี้คือ “ด่านตรวจ 3 ชั้น” ก่อนระบบอนุญาตให้เล่นแผนกริดแบบปลอดภัย</div>
                        <ul className="list-disc pl-4 space-y-1">
                            <li>
                                <b>5m Sweep</b> = รอให้เกิดการกวาด (liquidity sweep) ในโซนเป้าหมาย
                            </li>
                            <li>
                                <b>15m Rejection</b> = หลัง sweep ต้องเห็น 15m ปิดแบบ “ปฏิเสธ” (กลับเข้าโซน/กลับใต้โซน)
                            </li>
                            <li>
                                <b>1H Confirm</b> = 1H ต้องยืนยันว่า “fakeout” หรือ “breakout” จริง
                            </li>
                        </ul>
                        <div>สถานะจะเป็น <b>LOCKED → WAITING → CONFIRMED</b> แบบ gated เพื่อกัน “ย้อนแย้ง”</div>
                    </InfoButton>
                </div>

                {/* Derivatives */}
                <div className="mt-4 rounded-xl bg-neutral-950/60 p-4 relative">
                    <div className="flex items-center justify-between">
                        <div className="text-sm text-neutral-200 font-semibold">Derivatives (OI / Funding)</div>
                        <div className="text-xs text-neutral-500">
                            {d?.freshness?.tag
                                ? `Freshness: ${d.freshness.tag}${d.freshness.ageSec != null ? ` (${Math.floor(d.freshness.ageSec)}s)` : ""}`
                                : ""}
                        </div>
                    </div>

                    {d?.oi?.has_data === false && (
                        <div className="mt-1 text-xs text-amber-200">
                            OI: ยังไม่มีข้อมูลใน cache — ถ้าอยากให้ “ใครติดอยู่” คมขึ้น ต้องให้ collector เก็บ OI
                        </div>
                    )}

                    <div className="mt-2 flex flex-wrap gap-2 text-xs">
                        <span className={`rounded-full border px-3 py-1 ${dirBadge(d?.oi?.trend_5m?.dir)}`}>
                            OI 5m: {d?.oi?.trend_5m?.dir ?? "—"} ({(d?.oi?.trend_5m?.pct ?? 0).toFixed(2)}%)
                        </span>
                        <span className={`rounded-full border px-3 py-1 ${dirBadge(d?.oi?.trend_15m?.dir)}`}>
                            OI 15m: {d?.oi?.trend_15m?.dir ?? "—"} ({(d?.oi?.trend_15m?.pct ?? 0).toFixed(2)}%)
                        </span>
                        <span className={`rounded-full border px-3 py-1 ${dirBadge(d?.funding?.trend_5m?.dir)}`}>
                            Funding 5m: {d?.funding?.trend_5m?.dir ?? "—"} ({(d?.funding?.trend_5m?.pct ?? 0).toFixed(2)}%)
                        </span>
                        <span className={`rounded-full border px-3 py-1 ${dirBadge(d?.funding?.trend_15m?.dir)}`}>
                            Funding 15m: {d?.funding?.trend_15m?.dir ?? "—"} ({(d?.funding?.trend_15m?.pct ?? 0).toFixed(2)}%)
                        </span>
                    </div>

                    <div className="mt-3 grid gap-2 text-sm text-neutral-300">
                        <div>
                            <span className="text-neutral-400">Crowd:</span>{" "}
                            <span className="text-neutral-100 font-semibold">{d?.crowd?.crowd_th ?? "—"}</span>
                        </div>
                        <div>
                            <span className="text-neutral-400">ใครติดอยู่:</span>{" "}
                            <span className="text-neutral-100 font-semibold">{d?.crowd?.trapped_th ?? "—"}</span>
                        </div>
                        <div className="text-xs text-neutral-500">{d?.crowd?.note ?? ""}</div>

                        <div className="mt-1 text-xs text-neutral-400">
                            OI now: <span className="text-neutral-200">{fmt(d?.oi?.now ?? null)}</span>
                            <span className="text-neutral-600"> • </span>
                            OI at sweep: <span className="text-neutral-200">{fmt(d?.oi?.at_sweep ?? null)}</span>
                        </div>
                    </div>

                    {priceVsOi && (
                        <div className="mt-3 rounded-xl border border-white/10 bg-white/5 p-3">
                            <div className="text-xs text-neutral-400">สรุปเร็ว</div>
                            <div className="mt-1 text-sm text-neutral-100">{priceVsOi.line1}</div>
                            <div className="mt-1 text-sm text-neutral-100">{priceVsOi.line2}</div>
                            {/* <div className="mt-1 text-xs text-neutral-400">{priceVsOi.meaning}</div> */}
                        </div>
                    )}

                    <InfoButton title="Derivatives (OI / Funding) แปลว่าอะไร?">
                        <div>บล็อคนี้คือ “เครื่องจับชีพจรของฝูงชน” ว่าคนกำลังแห่เข้า/ออกตลาด และเริ่มมีฝั่งไหนกำลังโดนบีบหรือยัง</div>
                        <ul className="list-disc pl-4 space-y-1">
                            <li>
                                <b>OI (Open Interest)</b> = จำนวนสัญญาที่ค้างอยู่ในตลาด
                            </li>
                            <li>
                                <b>Funding</b> = ค่าเอนเอียงของฝั่งตลาด
                            </li>
                            <li>
                                <b>Trend 5m / 15m</b> = ทิศทางล่าสุดแบบสั้น/กลาง
                            </li>
                            <li>
                                <b>Crowd</b> = สรุปว่าฝูงชนหนาไปทางไหน
                            </li>
                            <li>
                                <b>ใครติดอยู่ (Trapped)</b> = สัญญาณว่าฝั่งไหน “เริ่มติดดอย/ติดช็อต”
                            </li>
                            <li>
                                <b>OI now / OI at sweep</b> = เทียบ OI ปัจจุบันกับตอนเกิด sweep
                            </li>
                            <li>
                                <b>Freshness</b> = ความสดของข้อมูลอนุพันธ์
                            </li>
                        </ul>
                    </InfoButton>
                </div>

                {/* Timeline */}
                <div className="mt-4 rounded-xl bg-neutral-950/60 p-4 relative">
                    <div className="flex items-center justify-between">
                        <div className="text-sm text-neutral-200 font-semibold">Timeline</div>
                        <div className="text-xs text-neutral-500">{logs?.length ? `${logs.length} events` : "no events"}</div>
                    </div>

                    {/* TODAY */}
                    <div className="mt-3">
                        <div className="flex items-center justify-between">
                            <div className="text-xs text-neutral-400">Today</div>
                            <div className="text-xs text-neutral-500">{todayGroup?.items?.length ? `${todayGroup.items.length} events` : "no events"}</div>
                        </div>

                        {!todayGroup || todayGroup.items.length === 0 ? (
                            <div className="mt-2 text-sm text-neutral-400">วันนี้ยังไม่มีเหตุการณ์เปลี่ยนสถานะ</div>
                        ) : (
                            <>
                                <div className="mt-3">
                                    <TimelineList items={todayGroup.items} maxH="max-h-72" showCrowd />
                                </div>

                                <details className="mt-2">
                                    <summary className="cursor-pointer text-xs text-neutral-400 hover:text-neutral-200">ดูรายละเอียด (debug)</summary>
                                    <div className="mt-2 flex flex-wrap gap-2 text-xs">
                                        <span className="rounded-full border border-neutral-700 px-3 py-1 text-neutral-300">5m: {data.states.sweep_5m}</span>
                                        <span className="rounded-full border border-neutral-700 px-3 py-1 text-neutral-300">15m: {data.states.rejection_15m}</span>
                                        <span className="rounded-full border border-neutral-700 px-3 py-1 text-neutral-300">1h: {data.states.confirm_1h}</span>
                                    </div>
                                </details>
                            </>
                        )}
                    </div>

                    {/* HISTORY */}
                    <div className="mt-4 border-t border-white/10 pt-4">
                        <div className="text-xs text-neutral-400">History (tap to expand)</div>

                        <div className="mt-2 max-h-64 overflow-auto pr-1 space-y-3">
                            {nonTodayGroups.map((g) => (
                                <details key={g.key} className="rounded-xl border border-white/10 bg-white/5 p-3">
                                    <summary className="cursor-pointer select-none text-sm text-neutral-200 flex items-center justify-between">
                                        <span className="font-semibold">{g.label}</span>
                                        <span className="text-xs text-neutral-500">{g.items.length} events</span>
                                    </summary>

                                    <div className="mt-3">
                                        <TimelineList items={g.items} maxH="max-h-72" />
                                    </div>
                                </details>
                            ))}

                            {nonTodayGroups.length === 0 && <div className="text-sm text-neutral-400">ยังไม่มีประวัติวันก่อนหน้า</div>}
                        </div>
                    </div>

                    <div className="mt-4 text-[11px] text-neutral-500">
                        ทิป: badge จะโผล่เฉพาะ “ตอนมันมีความหมายจริง ๆ” (ติดดอย/ติดช็อต หรือเปลี่ยนโหมด) — ที่เหลือปล่อยให้ตาได้หายใจ 😮‍💨
                    </div>

                    <InfoButton title="Timeline บอกอะไร?">
                        <div>บล็อคนี้คือ “บันทึกเหตุการณ์ของระบบ” ว่า state เปลี่ยนจากอะไรไปอะไร ตามเวลา</div>
                        <ul className="list-disc pl-4 space-y-1">
                            <li>
                                <b>Today</b> = เหตุการณ์วันนี้แบบไลฟ์
                            </li>
                            <li>
                                <b>History</b> = ย้อนหลังแยกเป็นรายวัน (กดขยาย)
                            </li>
                            <li>
                                <b>Smart badges</b> = โชว์เฉพาะตอนสำคัญ (เช่น trapped ≠ NONE หรือมี mode switch)
                            </li>
                            <li>
                                <b>Reason chip</b> = สรุปเหตุผลสั้น ๆ เป็นภาษาไทย
                            </li>
                        </ul>
                        <div>Timeline ช่วยตอบคำถามว่า “ทำไมระบบถึงคิดแบบนี้” แบบดูย้อนหลังได้</div>
                    </InfoButton>
                </div>
            </div>
        </div>
    );
}
