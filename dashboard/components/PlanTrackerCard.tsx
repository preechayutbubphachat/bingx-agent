"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import MarketStatusCard from "@/components/MarketStatusCard";
import { usePlanStatusOptional } from "@/components/plan-status/PlanStatusProvider";
import { buildSteps as buildStepsUI } from "@/components/plan-steps/buildSteps";
import type { DerivDir } from "@/components/plan-steps/timelineHelpers";
import { buildDecisionTwoLiner } from "@/components/plan-steps/timelineHelpers";
import type { LogItem, PlanStatus, StepSetKey, StepStatus } from "@/components/plan-steps/types";
import { apiUrl } from "@/lib/apiBase";
import { resolvePlanView } from "@/lib/resolvePlanView";

const POLL_MS = 10_000;
const IMPORTANT_EVENT_WINDOW_SEC = 120;
const DERIV_PCT_MIN = 0.05;
const PRICE_PCT_MIN = 0.02;

function fmt(n: number | null | undefined) {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return n.toLocaleString();
}

function fmt1(n: number | null | undefined) {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(n);
}

function normalizeZoneLike(input: unknown): [number, number] | null {
  if (Array.isArray(input) && input.length >= 2) {
    const a = typeof input[0] === "number" && Number.isFinite(input[0]) ? input[0] : null;
    const b = typeof input[1] === "number" && Number.isFinite(input[1]) ? input[1] : null;
    if (a !== null && b !== null) return [Math.min(a, b), Math.max(a, b)];
  }

  if (input && typeof input === "object") {
    const obj = input as Record<string, unknown>;
    const low = typeof obj.low === "number" && Number.isFinite(obj.low) ? obj.low : null;
    const high = typeof obj.high === "number" && Number.isFinite(obj.high) ? obj.high : null;
    if (low !== null && high !== null) return [Math.min(low, high), Math.max(low, high)];
  }

  return null;
}

function fmtZone(z?: [number, number] | null) {
  if (!z || typeof z[0] !== "number" || typeof z[1] !== "number") return "—";
  const lo = Math.min(z[0], z[1]);
  const hi = Math.max(z[0], z[1]);
  return `${fmt1(lo)}–${fmt1(hi)}`;
}

function toMs(ts: number | null | undefined): number | null {
  if (!ts) return null;
  return ts < 1e12 ? ts * 1000 : ts;
}

function pickRouteUpdatedAt(data: any): number | undefined {
  const a = toMs(typeof data?.updated_at === "number" ? data.updated_at : null);
  if (a) return a;
  const b = toMs(typeof data?.source_updated_at === "number" ? data.source_updated_at : null);
  return b ?? undefined;
}

async function fetchWithFallback(path: string) {
  const url = apiUrl(path);
  try {
    return await fetch(url, { cache: "no-store" });
  } catch (error) {
    if (url !== path) return await fetch(path, { cache: "no-store" });
    throw error;
  }
}

function eventTimeMs(e: any): number | null {
  const a = toMs(typeof e?.ts === "number" ? e.ts : null);
  if (a) return a;

  const b = toMs(typeof e?.t === "number" ? e.t : null);
  if (b) return b;

  const c = toMs(typeof e?.close_ts_5m === "number" ? e.close_ts_5m : null);
  if (c) return c;

  return null;
}

function timeAgoTH(fromMs: number, nowMs: number) {
  const sec = Math.max(0, Math.floor((nowMs - fromMs) / 1000));
  if (sec < 60) return `${sec}s ago`;

  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;

  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;

  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d ago`;

  const mo = Math.floor(day / 30);
  if (mo < 12) return `${mo}mo ago`;

  const yr = Math.floor(mo / 12);
  return `${yr}y ago`;
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function fullTime(ts: number) {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = pad2(d.getMonth() + 1);
  const da = pad2(d.getDate());
  const hh = pad2(d.getHours());
  const mm = pad2(d.getMinutes());
  const ss = pad2(d.getSeconds());
  return `${y}-${m}-${da} ${hh}:${mm}:${ss}`;
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
  if (s.includes("FAKEOUT") || s.includes("RANGE_PLAY") || s.includes("CONFIRMED")) {
    return "bg-emerald-500/15 text-emerald-200 border-emerald-500/30";
  }
  if (s.includes("BREAKOUT")) return "bg-sky-500/15 text-sky-200 border-sky-500/30";
  if (s.includes("NO_TRADE") || s.includes("LOCKED")) {
    return "bg-neutral-500/15 text-neutral-200 border-neutral-500/30";
  }
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

  if (status === "CONFIRMED" || status === "DONE") {
    return {
      wrap: "border border-white/10 bg-white/5",
      dot: "bg-emerald-400",
      badge: "bg-emerald-500/10 text-emerald-200 border border-emerald-500/20",
      title: "text-white/90",
    };
  }

  if (status === "WAITING" || status === "WARN") {
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
  const type = String((e as any).type ?? "").toUpperCase();
  const to = String((e as any).to ?? "").toUpperCase();

  if (type.includes("PLAN_UPDATED")) return "🧾";
  if (type.includes("OB_") && type.includes("OPEN")) return "🟢";
  if (type.includes("TP")) return "🏁";
  if (type.includes("STOP")) return "🛑";
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
  const explain = (e as any).explain_th;
  if (typeof explain === "string" && explain.trim().length) return explain.trim();

  const type = String((e as any).type ?? "").toUpperCase();
  if (type === "PLAN_UPDATED") {
    const reason = (e as any).reason ?? "—";
    const target = (e as any)?.raw?.target_mode ?? (e as any)?.target_mode ?? "—";
    return `PLAN_UPDATED • reason=${reason} • target=${target}`;
  }

  const to = String((e as any).to ?? "").toUpperCase();
  if (to.includes("WAIT_SWEEP")) return "ยังไม่เข้าจังหวะ — รอให้กวาดบนก่อน";
  if (to.includes("WAIT_15M_REJECTION")) return "กวาดบนแล้ว — รอ 15m ปิดยืนยัน rejection";
  if (to.includes("WAIT_1H_CONFIRM")) return "15m ผ่านแล้ว — รอ 1H ยืนยัน fakeout/breakout";
  if (to.includes("FAKEOUT_CONFIRMED") || to.includes("RANGE_PLAY")) return "ยืนยัน fakeout — กลับไปเล่นในกรอบ";
  if (to.includes("BREAKOUT_CONFIRMED") || to.includes("SWITCH_MODE")) {
    return "ยืนยัน breakout — ต้องเปลี่ยนโหมด (หยุดกริด/ปรับแผน)";
  }
  if (to.includes("NO_TRADE")) return "ล็อก NO_TRADE — งดเทรดตามบทวิเคราะห์";
  if (to.includes("TREND")) return "ล็อก TREND — พักกริด รอแผนเทรนด์";

  return `สถานะเปลี่ยน → ${(e as any).to ?? "—"}`;
}

function isModeSwitch(e: LogItem) {
  return String((e as any).type ?? "").toUpperCase().includes("MODE_SWITCH");
}

function normalizeTrapped(v: unknown) {
  return String(v ?? "").trim().toUpperCase();
}

function shouldShowSmartBadges(e: LogItem) {
  const trapped = normalizeTrapped((e as any).deriv?.trapped);
  return isModeSwitch(e) || (!!trapped && trapped !== "NONE");
}

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
  const trapped = trappedReasonTH((e as any).deriv?.trapped);
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
  const to = String((e as any).to ?? "").toUpperCase();
  const trapped = normalizeTrapped((e as any).deriv?.trapped);
  const type = String((e as any).type ?? "").toUpperCase();

  return (
    isModeSwitch(e) ||
    type.includes("PLAN_UPDATED") ||
    type.includes("STOP_HIT") ||
    type.includes("TP") ||
    (trapped && trapped !== "NONE") ||
    to.includes("BREAKOUT") ||
    to.includes("NO_TRADE") ||
    to.includes("LOCKED")
  );
}

function findLatestImportantEvent(items: LogItem[]) {
  const sorted = [...items].sort((a, b) => {
    const ta = eventTimeMs(a) ?? 0;
    const tb = eventTimeMs(b) ?? 0;
    return tb - ta;
  });
  return sorted.find((x) => isImportantEvent(x)) ?? null;
}

function alertTextFromEventShort(e: LogItem) {
  const type = String((e as any).type ?? "").toUpperCase();
  const to = String((e as any).to ?? (e as any).to_plan_state ?? "").toUpperCase();

  if (type.includes("PLAN_UPDATED")) {
    const reason = (e as any).reason ?? "—";
    const target = (e as any)?.raw?.target_mode ?? (e as any)?.target_mode ?? "—";
    return `PLAN_UPDATED: ${reason} • target=${target}`;
  }

  if (type.includes("MODE_SWITCH")) {
    const fromMode = (e as any).from_mode ?? "—";
    const toMode = (e as any).to_mode ?? "—";
    const ps = (e as any).to_plan_state ?? (e as any).to ?? "";
    return `ระบบเปลี่ยนโหมด: ${fromMode} → ${toMode}${ps ? ` • plan_state=${ps}` : ""}`;
  }

  if (to.includes("BREAKOUT")) return "ยืนยัน Breakout — หยุดเกมกรอบ/เตรียมเปลี่ยนโหมด";
  if (to.includes("NO_TRADE")) return "ล็อก NO_TRADE — งดเทรดตามบทวิเคราะห์";
  if (to.includes("LOCKED")) return "ระบบล็อกสถานะ — รอ context ใหม่";

  return oneLineSummary(e);
}

function dayLabelTH(ts: number) {
  return new Date(ts).toLocaleDateString("th-TH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function timeTH(ts: number) {
  return new Date(ts).toLocaleTimeString("th-TH", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ymd(ts: number) {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${da}`;
}

function groupTimeline(items: LogItem[]) {
  const sorted = [...items].sort((a, b) => {
    const ta = eventTimeMs(a) ?? 0;
    const tb = eventTimeMs(b) ?? 0;
    return tb - ta;
  });

  const groups: { key: string; label: string; items: LogItem[] }[] = [];

  for (const item of sorted) {
    const t = eventTimeMs(item);
    if (!t) continue;

    const key = ymd(t);
    const label = dayLabelTH(t);
    const existing = groups.find((x) => x.key === key);

    if (existing) existing.items.push(item);
    else groups.push({ key, label, items: [item] });
  }

  return groups;
}

function pickTodayGroup(groups: { key: string; label: string; items: LogItem[] }[]) {
  const todayKey = ymd(Date.now());
  return groups.find((g) => g.key === todayKey) ?? null;
}

function findLatestStateChange(items: LogItem[]) {
  const sorted = [...items].sort((a, b) => {
    const ta = eventTimeMs(a) ?? 0;
    const tb = eventTimeMs(b) ?? 0;
    return tb - ta;
  });
  return sorted.find((x) => String((x as any).type ?? "").toUpperCase().includes("STATE_CHANGE")) ?? null;
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
  if (p === "UP" && oi === "UP") return "🚀";
  if (p === "UP" && oi === "DOWN") return "🪝";
  if (p === "DOWN" && oi === "UP") return "🧨";
  if (p === "DOWN" && oi === "DOWN") return "🧹";
  if (p === "FLAT" && oi === "UP") return "🫧";
  if (p === "FLAT" && oi === "DOWN") return "🧊";
  return "•";
}

function modeNoticeFrom(stepSet: StepSetKey, stateCode: string) {
  const sc = String(stateCode ?? "").toUpperCase();

  if (stepSet === "TREND_DOWN_STEPSET") {
    return {
      show: true as const,
      icon: "📉",
      tone: "border-rose-500/30 bg-rose-500/10 text-rose-50",
      title: "TREND_DOWN plan steps",
      detail: "รอ pullback → 5m confirm → LH/breakdown → แล้วค่อย Short (ไม่ไล่แดง)",
    };
  }

  if (stepSet === "TREND_UP_STEPSET") {
    return {
      show: true as const,
      icon: "📈",
      tone: "border-emerald-500/30 bg-emerald-500/10 text-emerald-50",
      title: "TREND_UP plan steps",
      detail: "ใช้ step set จาก decision: รอ pullback → 5m confirm → HL → OI → entry",
    };
  }

  if (stepSet === "BREAKOUT_SWITCH_MODE" || sc.includes("BREAKOUT")) {
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

function failSafeTone(mode: string | undefined) {
  const m = String(mode ?? "UNKNOWN").toUpperCase();
  if (m === "HARD_STOP") return "border-rose-500/30 bg-rose-500/10 text-rose-100";
  if (m === "DEGRADED") return "border-amber-500/30 bg-amber-500/10 text-amber-100";
  if (m === "NORMAL") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-100";
  return "border-neutral-500/30 bg-neutral-500/10 text-neutral-100";
}

function payloadTone(kind: string | undefined) {
  const k = String(kind ?? "UNKNOWN").toUpperCase();
  if (k.includes("RESPONSE")) return "border-sky-500/30 bg-sky-500/10 text-sky-100";
  if (k.includes("DISK")) return "border-amber-500/30 bg-amber-500/10 text-amber-100";
  return "border-neutral-500/30 bg-neutral-500/10 text-neutral-100";
}

function JsonBlock({ obj }: { obj: any }) {
  const text = useMemo(() => {
    try {
      return JSON.stringify(obj, null, 2);
    } catch {
      return String(obj);
    }
  }, [obj]);

  return (
    <pre className="mt-2 max-h-[50vh] overflow-auto rounded-xl border border-white/10 bg-neutral-950/60 p-3 text-[11px] leading-relaxed text-white/70">
      {text}
    </pre>
  );
}

function TradeDetailDrawer({
  open,
  onClose,
  e,
  nowMs,
}: {
  open: boolean;
  onClose: () => void;
  e: LogItem | null;
  nowMs: number;
}) {
  if (!open || !e) return null;

  const t = eventTimeMs(e);
  const type = String((e as any).type ?? "—");
  const symbol = String((e as any).symbol ?? "—");
  const tradeId = (e as any).trade_id ?? (e as any).id ?? null;
  const entry = (e as any).entry_price ?? (e as any).entry ?? null;
  const exit = (e as any).exit_price ?? (e as any).exit ?? null;
  const sl = (e as any).sl ?? null;
  const tp1 = (e as any).tp1 ?? null;
  const tp2 = (e as any).tp2 ?? null;
  const result = (e as any).result ?? null;
  const r = (e as any).r_multiple ?? (e as any).r ?? null;
  const reason = (e as any).reason ?? null;
  const status = (e as any).status ?? null;
  const close5m = (e as any).close_ts_5m ?? null;

  return (
    <div className="fixed inset-0 z-[100]">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        role="button"
        tabIndex={0}
        aria-label="Close"
      />

      <div className="absolute right-0 top-0 h-full w-[min(560px,92vw)] overflow-auto border-l border-white/10 bg-neutral-950 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs text-white/50">Trade / Event Detail</div>
            <div className="mt-1 break-words text-base font-semibold text-white/90">
              {type} <span className="text-white/40">•</span> {symbol}
            </div>
            {tradeId && <div className="mt-1 break-words text-xs text-white/50">id: {String(tradeId)}</div>}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/70 hover:bg-white/10"
          >
            ✕ ปิด
          </button>
        </div>

        <div className="mt-3 rounded-xl border border-white/10 bg-white/5 p-3">
          <div className="flex flex-wrap items-center gap-2 text-xs text-white/70">
            <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5">
              {t ? timeAgoTH(t, nowMs) : "—"}
            </span>
            {t && <span className="text-white/40">•</span>}
            {t && <span className="text-white/60">{fullTime(t)}</span>}
            {close5m && (
              <>
                <span className="text-white/40">•</span>
                <span className="text-white/60">close_ts_5m: {String(close5m)}</span>
              </>
            )}
          </div>

          {(reason || status) && (
            <div className="mt-2 flex flex-wrap gap-2 text-xs">
              {reason && (
                <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-amber-200">
                  reason: {String(reason)}
                </span>
              )}
              {status && (
                <span className="rounded-full border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-sky-200">
                  status: {String(status)}
                </span>
              )}
            </div>
          )}
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="rounded-xl border border-white/10 bg-white/5 p-3">
            <div className="text-[11px] text-white/50">entry</div>
            <div className="mt-0.5 text-sm text-white/90">{entry == null ? "—" : fmt(entry)}</div>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-3">
            <div className="text-[11px] text-white/50">exit</div>
            <div className="mt-0.5 text-sm text-white/90">{exit == null ? "—" : fmt(exit)}</div>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/5 p-3">
            <div className="text-[11px] text-white/50">SL</div>
            <div className="mt-0.5 text-sm text-white/90">{sl == null ? "—" : fmt(sl)}</div>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-3">
            <div className="text-[11px] text-white/50">TP1 / TP2</div>
            <div className="mt-0.5 text-sm text-white/90">
              {tp1 == null ? "—" : fmt(tp1)}
              <span className="text-white/30"> • </span>
              {tp2 == null ? "—" : fmt(tp2)}
            </div>
          </div>

          <div className="col-span-2 rounded-xl border border-white/10 bg-white/5 p-3">
            <div className="text-[11px] text-white/50">result</div>
            <div className="mt-0.5 text-sm text-white/90">
              {result ?? "—"}
              <span className="text-white/30"> • </span>R: {r == null ? "—" : String(r)}
            </div>
          </div>
        </div>

        <div className="mt-3">
          <div className="text-xs font-semibold text-white/80">Raw payload</div>
          <JsonBlock obj={e} />
        </div>

        <div className="mt-3 text-[11px] text-white/40">
          ทิป: ถ้าเห็น event “ซ้ำถี่” แปลว่า upstream ยังยิง OPEN ซ้อน — ไปคุม dedupe ที่ฝั่ง append history
        </div>
      </div>
    </div>
  );
}

function TimelineRow({
  x,
  showCrowd,
  nowMs,
  onClick,
}: {
  x: LogItem;
  showCrowd?: boolean;
  nowMs: number;
  onClick?: (ev: LogItem) => void;
}) {
  const icon = eventIcon(x);
  const summary = oneLineSummary(x);
  const progress = tfProgressFromPlanState(String((x as any).to ?? ""));
  const showSmart = shouldShowSmartBadges(x);
  const reasonChip = reasonChipFromEvent(x);

  const oiDir = (x as any).deriv?.oi5_dir;
  const oiPct = (x as any).deriv?.oi5_pct;
  const fundDir = (x as any).deriv?.fund5_dir;
  const fundPct = (x as any).deriv?.fund5_pct;

  const showOi = !!oiDir && (isModeSwitch(x) || significantPct(oiPct));
  const showFund = !!fundDir && (isModeSwitch(x) || significantPct(fundPct));

  const t = eventTimeMs(x);
  const clickable = typeof onClick === "function";

  return (
    <button
      type="button"
      onClick={() => onClick?.(x)}
      className={`w-full text-left ${clickable ? "-m-2 rounded-xl p-2 transition hover:bg-white/5" : ""}`}
      disabled={!clickable}
      title={clickable ? "คลิกเพื่อดูรายละเอียด" : undefined}
    >
      <div className="flex gap-3">
        <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 text-sm">
          {icon}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-400">
            <span>{t ? timeTH(t) : "—"}</span>

            {t && (
              <span className="rounded-full border border-neutral-700 px-2 py-0.5 text-neutral-300">
                {timeAgoTH(t, nowMs)}
              </span>
            )}

            <span className="text-neutral-600">•</span>

            {String((x as any).from ?? "").length || String((x as any).to ?? "").length ? (
              <span className={`rounded-full border px-2 py-0.5 ${stateBadgeTone(String((x as any).to ?? ""))}`}>
                {(x as any).from ?? "—"} → <b className="text-neutral-100">{(x as any).to ?? "—"}</b>
              </span>
            ) : (
              <span className="rounded-full border border-neutral-700 bg-white/5 px-2 py-0.5 text-neutral-200">
                {String((x as any).type ?? "EVENT")}
              </span>
            )}

            <span className="rounded-full border border-neutral-700 px-2 py-0.5 text-neutral-300">{progress}</span>

            {(x as any).price?.close_5m !== undefined && (
              <span className="rounded-full border border-neutral-700 px-2 py-0.5 text-neutral-300">
                close5m: {fmt((x as any).price.close_5m)}
              </span>
            )}

            {showSmart && (
              <>
                {reasonChip && (
                  <span className={`rounded-full border px-2 py-0.5 ${reasonChip.tone}`}>
                    {reasonChip.icon} {reasonChip.label}
                  </span>
                )}

                {isModeSwitch(x) && (
                  <span className="rounded-full border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-sky-200">
                    mode: {(x as any).from_mode ?? "—"} → {(x as any).to_mode ?? "—"}
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

                {showCrowd && (x as any).deriv?.crowd && (
                  <span className="rounded-full border border-neutral-700 px-2 py-0.5 text-neutral-300">
                    crowd: {(x as any).deriv.crowd}
                  </span>
                )}
              </>
            )}
          </div>

          <div className="mt-1 break-words text-sm text-neutral-200">{summary}</div>
        </div>
      </div>
    </button>
  );
}

function TimelineList({
  items,
  maxH,
  nowMs,
  onRowClick,
  showCrowd,
}: {
  items: LogItem[];
  maxH: string;
  nowMs: number;
  onRowClick?: (e: LogItem) => void;
  showCrowd?: boolean;
}) {
  return (
    <div className={`${maxH} space-y-3 overflow-auto pr-1`}>
      {items.map((x, i) => (
        <TimelineRow
          key={`${eventTimeMs(x) ?? i}-${i}`}
          x={x}
          nowMs={nowMs}
          onClick={onRowClick}
          showCrowd={showCrowd}
        />
      ))}
    </div>
  );
}

function InfoButton({
  title,
  children,
  label = "คำอธิบาย",
}: {
  title: string;
  children: ReactNode;
  label?: string;
}) {
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

          <div className="mt-2 space-y-2 text-xs leading-relaxed text-white/75">{children}</div>

          <div className="mt-2 text-[11px] text-white/40">ทิป: อ่านเฉพาะตอนสงสัยก็พอ — ที่เหลือให้ตาพัก 😮‍💨</div>
        </div>
      )}
    </div>
  );
}

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

function buildPlanStatusSignature(json: PlanStatus) {
  const src = (json as any)?.source_updated_at ?? null;
  const upd = (json as any)?.updated_at ?? null;
  const planState = (json as any)?.plan_state ?? null;
  const stateCode = (json as any)?.plan_status_state?.state?.code ?? null;
  const stateHeadline = (json as any)?.plan_status_state?.state?.headline ?? null;
  const close5m = (json as any)?.price?.close_5m ?? null;
  const close1h = (json as any)?.price?.close_1h ?? null;
  const modeLock = (json as any)?.mode_lock?.value ?? null;
  const resolvedPlanId = (json as any)?.resolved_plan_identity?.plan_id ?? null;
  const resolvedPlanVersion = (json as any)?.resolved_plan_identity?.plan_version ?? null;
  const resolvedPlanSource = (json as any)?.resolved_plan_source ?? null;
  const obEntryStatus = (json as any)?.ob_gate?.entry?.status ?? null;
  const failSafeMode = (json as any)?.fail_safe?.mode ?? null;
  const payloadKind = (json as any)?.payload_kind ?? null;
  const canonicalRootPlanPresent = (json as any)?.canonical?.root_plan_present ?? null;
  const statePlanPresent = !!(json as any)?.plan_status_state?.plan;

  return JSON.stringify({
    src,
    upd,
    planState,
    stateCode,
    stateHeadline,
    close5m,
    close1h,
    modeLock,
    resolvedPlanId,
    resolvedPlanVersion,
    resolvedPlanSource,
    obEntryStatus,
    failSafeMode,
    payloadKind,
    canonicalRootPlanPresent,
    statePlanPresent,
  });
}

function buildLogsSignature(items: LogItem[]) {
  const head = items.slice(0, 10).map((x) => ({
    t: eventTimeMs(x),
    type: (x as any)?.type ?? null,
    to: (x as any)?.to ?? null,
    id: (x as any)?.trade_id ?? (x as any)?.id ?? null,
  }));
  return JSON.stringify({
    len: items.length,
    head,
  });
}

function readStateCode(data: PlanStatus | null): string {
  return String((data as any)?.plan_status_state?.state?.code ?? "").trim();
}

function readHeadline(data: PlanStatus | null): string {
  return String((data as any)?.plan_status_state?.state?.headline ?? (data as any)?.explain_th ?? "").trim();
}

function readDirectionHint(data: PlanStatus | null): string {
  return String((data as any)?.plan_status_state?.state?.direction_hint ?? "").trim();
}

function useStandalonePlanStatusFallback(enabled: boolean) {
  const [data, setData] = useState<PlanStatus | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);

  const mountedRef = useRef(false);
  const inflightRef = useRef(false);
  const requestSeqRef = useRef(0);
  const planSigRef = useRef<string>("");

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!enabled) return;

    async function load() {
      if (inflightRef.current) return;

      inflightRef.current = true;
      const reqId = ++requestSeqRef.current;

      try {
        const res = await fetchWithFallback("/api/plan-status");
        if (!res.ok) throw new Error(`plan-status http ${res.status}`);

        const json = (await res.json()) as PlanStatus;
        if (!json?.ok) throw new Error("plan-status not ok");

        if (!mountedRef.current || reqId !== requestSeqRef.current) return;

        const nextSig = buildPlanStatusSignature(json);
        if (planSigRef.current !== nextSig) {
          planSigRef.current = nextSig;
          setData(json);
        }

        setFetchedAt(Date.now());
        setErr(null);
      } catch (error: any) {
        if (!mountedRef.current || reqId !== requestSeqRef.current) return;
        setErr(error?.message ?? "failed to load");
      } finally {
        if (reqId === requestSeqRef.current) {
          inflightRef.current = false;
        }
      }
    }

    void load();

    const id = setInterval(() => {
      void load();
    }, POLL_MS);

    return () => clearInterval(id);
  }, [enabled]);

  return { data, err, fetchedAt };
}

/**
 * Ownership boundary for this card:
 * - provider/fallback fetch layer only supplies raw route truth
 * - regime/mode/risk display comes from resolvePlanView(data)
 * - steps come from buildStepsUI(data)
 * - plan_status_state is the primary state truth for headline/code/step narrative
 * - top-level price is the primary live price truth
 * - logs/timeline are additive diagnostics only, never override route truth
 * - ob gate UI reads route ob_gate only, not legacy mirrors
 * - fail_safe/payload_kind/ownership boundary come from top-level route metadata only
 */
export default function PlanTrackerCard({ variant = "FULL" }: { variant?: "FULL" | "CORE" }) {
  const planStatusCtx = usePlanStatusOptional();

  const providerData = (planStatusCtx?.data ?? null) as PlanStatus | null;
  const providerError = planStatusCtx?.error ?? null;
  const providerFetchedAt = planStatusCtx?.fetchedAt ?? null;
  const providerIsRefreshing = planStatusCtx?.isRefreshing ?? false;
  const providerReload = planStatusCtx?.reload;

  const fallback = useStandalonePlanStatusFallback(!planStatusCtx);

  const [logs, setLogs] = useState<LogItem[]>([]);
  const [logErr, setLogErr] = useState<string | null>(null);
  const [logsRefreshing, setLogsRefreshing] = useState(false);

  const [now, setNow] = useState(() => Date.now());
  const [selected, setSelected] = useState<LogItem | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const prevSourceUpdatedAtRef = useRef<number | null>(null);
  const [candleIntervalSec, setCandleIntervalSec] = useState<number | null>(null);

  const prevClose5mRef = useRef<number | null>(null);
  const [price5mDir, setPrice5mDir] = useState<DerivDir>("UNKNOWN");
  const [price5mPct, setPrice5mPct] = useState<number | null>(null);

  const prevObReadyRef = useRef<boolean>(false);
  const [obReadyAt, setObReadyAt] = useState<number | null>(null);

  const mountedRef = useRef(false);
  const logInflightRef = useRef(false);
  const logRequestSeqRef = useRef(0);
  const logSigRef = useRef<string>("");

  const data = providerData ?? fallback.data;
  const err = providerError ?? fallback.err ?? logErr ?? null;
  const pageFetchedAt = providerFetchedAt ?? fallback.fetchedAt ?? null;
  const refreshing = planStatusCtx ? providerIsRefreshing || logsRefreshing : logsRefreshing;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  async function loadPlanLogs() {
    const res = await fetchWithFallback("/api/plan-log?limit=120");
    if (!res.ok) return [] as LogItem[];

    const json = await res.json();
    if (!json?.ok) return [] as LogItem[];

    const items = (json.items ?? []) as any[];
    return items.map((x) => {
      const t = eventTimeMs(x);
      return t ? { ...x, t } : x;
    }) as LogItem[];
  }

  function applyPlanStatus(json: PlanStatus | null) {
    if (!json) return;

    const nextCandleAt = toMs((json as any)?.source_updated_at) ?? null;
    const prevCandleAt = prevSourceUpdatedAtRef.current;
    if (nextCandleAt && prevCandleAt && nextCandleAt !== prevCandleAt) {
      setCandleIntervalSec(Math.max(0, Math.floor((nextCandleAt - prevCandleAt) / 1000)));
    }
    prevSourceUpdatedAtRef.current = nextCandleAt;

    const close5m = typeof (json as any)?.price?.close_5m === "number" ? (json as any).price.close_5m : null;
    const prev = prevClose5mRef.current;

    if (close5m !== null && typeof prev === "number" && prev !== 0) {
      const pct = ((close5m - prev) / prev) * 100;
      setPrice5mPct(pct);
      setPrice5mDir(priceDirFromPct(pct));
    } else {
      setPrice5mPct(null);
      setPrice5mDir("UNKNOWN");
    }
    prevClose5mRef.current = close5m;

    setLogErr(null);
  }

  function applyLogs(nextLogs: LogItem[]) {
    const nextSig = buildLogsSignature(nextLogs);
    if (logSigRef.current !== nextSig) {
      logSigRef.current = nextSig;
      setLogs(nextLogs);
    }
  }

  useEffect(() => {
    applyPlanStatus(data);
  }, [data]);

  async function refreshLogs() {
    if (variant !== "FULL") return;
    if (logInflightRef.current) return;

    logInflightRef.current = true;
    const reqId = ++logRequestSeqRef.current;

    try {
      if (mountedRef.current) {
        setLogsRefreshing(true);
        setLogErr(null);
      }

      const nextLogs = await loadPlanLogs();

      if (!mountedRef.current || reqId !== logRequestSeqRef.current) return;
      applyLogs(nextLogs);
    } catch (error: any) {
      if (!mountedRef.current || reqId !== logRequestSeqRef.current) return;
      setLogErr(error?.message ?? "failed to load logs");
    } finally {
      if (mountedRef.current && reqId === logRequestSeqRef.current) {
        setLogsRefreshing(false);
      }
      logInflightRef.current = false;
    }
  }

  async function refreshAll() {
    if (planStatusCtx && providerReload) {
      await Promise.all([providerReload(), variant === "FULL" ? refreshLogs() : Promise.resolve()]);
      return;
    }

    if (variant === "FULL") {
      await refreshLogs();
    }
  }

  useEffect(() => {
    if (variant !== "FULL") return;

    void refreshLogs();

    const id = setInterval(() => {
      void refreshLogs();
    }, POLL_MS);

    return () => clearInterval(id);
  }, [variant]);

  const latestImportant = useMemo(() => findLatestImportantEvent(logs), [logs]);

  const importantAgeSec = useMemo(() => {
    const t = latestImportant ? eventTimeMs(latestImportant) : null;
    if (!t) return null;
    return Math.max(0, Math.floor((now - t) / 1000));
  }, [now, latestImportant]);

  const showRegimeAlert = useMemo(() => {
    if (!latestImportant || importantAgeSec === null) return false;
    return importantAgeSec <= IMPORTANT_EVENT_WINDOW_SEC;
  }, [latestImportant, importantAgeSec]);

  const candleAgeSec = useMemo(() => {
    const t = toMs((data as any)?.source_updated_at ?? null);
    if (!t) return null;
    return Math.max(0, Math.floor((now - t) / 1000));
  }, [now, data]);

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
    return String((data as any)?.mode_lock?.value ?? "GRID");
  }, [data]);

  const built = useMemo(() => {
    return data ? buildStepsUI(data) : null;
  }, [data]);

  const stepSet = ((built?.key ?? "GRID_SWEEP_PIPELINE") as StepSetKey) ?? "GRID_SWEEP_PIPELINE";

  const stateCode = useMemo(() => readStateCode(data), [data]);
  const stateHeadline = useMemo(() => readHeadline(data), [data]);
  const directionHint = useMemo(() => readDirectionHint(data), [data]);

  const notice = useMemo(() => {
    return modeNoticeFrom(stepSet, stateCode);
  }, [stepSet, stateCode]);

  const obGateMeta = useMemo(() => {
    const entry = (data as any)?.ob_gate?.entry ?? null;
    const statusRaw = String(entry?.status ?? "").trim().toUpperCase();
    const isReady = statusRaw === "READY" || statusRaw === "CONFIRMED";
    const label = String(entry?.label_th ?? "").trim() || (isReady ? "พร้อมยิง" : "");
    const entryZone = normalizeZoneLike(entry?.entry_zone);
    const sl = typeof entry?.sl === "number" ? (entry.sl as number) : null;
    const tp1 = typeof entry?.tp1 === "number" ? (entry.tp1 as number) : null;
    const why = typeof entry?.why === "string" ? (entry.why as string) : "";

    return {
      hasOb: !!entry,
      statusRaw,
      isReady,
      label,
      entryZone,
      sl,
      tp1,
      why,
    };
  }, [data]);

  const obRaw = useMemo(() => {
    return (data as any)?.ob_gate ?? null;
  }, [data]);

  useEffect(() => {
    const prev = prevObReadyRef.current;
    const nowReady = obGateMeta.isReady;

    if (nowReady && !prev) setObReadyAt(Date.now());
    if (!nowReady && prev) setObReadyAt(null);

    prevObReadyRef.current = nowReady;
  }, [obGateMeta.isReady]);

  const obReadyAgeSec = useMemo(() => {
    if (!obReadyAt) return null;
    return Math.max(0, Math.floor((now - obReadyAt) / 1000));
  }, [now, obReadyAt]);

  const showObReadyAlert = useMemo(() => {
    if (!obGateMeta.isReady || obReadyAgeSec === null) return false;
    return obReadyAgeSec <= IMPORTANT_EVENT_WINDOW_SEC;
  }, [obGateMeta.isReady, obReadyAgeSec]);

  const planView = useMemo(() => resolvePlanView(data), [data]);

  const d = (data as any)?.derivatives;
  const sweepZone = normalizeZoneLike(planView?.sweep_target?.zone);
  const zoneText = sweepZone ? `${sweepZone[0]}–${sweepZone[1]}` : "—";
  const statusUpdatedAt = useMemo(() => pickRouteUpdatedAt(data), [data]);

  const priceVsOi = useMemo(() => {
    const oiPct = typeof d?.oi?.trend_5m?.pct === "number" ? d.oi.trend_5m.pct : null;
    const fPct = typeof d?.funding?.trend_5m?.pct === "number" ? d.funding.trend_5m.pct : null;

    const oiDir = asDerivDir(d?.oi?.trend_5m?.dir ?? pctDir(oiPct));
    const fDir = asDerivDir(d?.funding?.trend_5m?.dir ?? pctDir(fPct));

    const hasAny = price5mDir !== "UNKNOWN" || oiDir !== "UNKNOWN" || fDir !== "UNKNOWN";
    if (!hasAny) return null;

    const crowdingRaw =
      (d as any)?.crowd?.side ?? (d as any)?.crowd?.crowd ?? (d as any)?.crowd?.crowding ?? undefined;
    const crowding = crowdingRaw ? String(crowdingRaw).toUpperCase() : undefined;

    return buildDecisionTwoLiner({
      price5mDir,
      oi5mDir: oiDir,
      funding5mDir: fDir,
      crowding,
      freshnessAgeSec: d?.freshness?.ageSec ?? null,
      obGate: obRaw,
      modeLock,
    });
  }, [d, obRaw, modeLock, price5mDir]);

  const selectedStateSource = useMemo(() => {
    return (
      (data as any)?.canonical_state_guard?.selectedStateSource ??
      (data as any)?.plan_status_state?.__state_guard?.selected_state_source ??
      "derived_state"
    );
  }, [data]);

  const resolvedPlanSource = useMemo(() => {
    return String((data as any)?.resolved_plan_source ?? "decision_fallback");
  }, [data]);

  const payloadKind = useMemo(() => {
    return String(planView?.payload_kind ?? (data as any)?.payload_kind ?? "UNKNOWN");
  }, [data, planView]);

  const failSafeMode = useMemo(() => {
    return String(planView?.fail_safe_mode ?? (data as any)?.fail_safe?.mode ?? "UNKNOWN");
  }, [data, planView]);

  const failSafeReasons = useMemo((): string[] => {
    return Array.isArray(planView?.fail_safe_reasons)
      ? planView.fail_safe_reasons
      : Array.isArray((data as any)?.fail_safe?.reasons)
        ? ((data as any).fail_safe.reasons as string[])
        : [];
  }, [data, planView]);

  const truthBoundary = useMemo(() => {
    return (data as any)?.debug?.truth_boundary ?? null;
  }, [data]);

  const ownershipBoundary = useMemo(() => {
    return (data as any)?.field_ownership_boundary ?? null;
  }, [data]);

  function onRowClick(e: LogItem) {
    setSelected(e);
    setDrawerOpen(true);
  }

  if (err && !data) {
    return (
      <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-5 text-rose-200">
        โหลด Plan Tracker ไม่ได้: {err}
      </div>
    );
  }

  if (!data || !built) {
    return (
      <div className="rounded-2xl border border-neutral-700 bg-neutral-900 p-5 text-neutral-300">
        กำลังโหลด Plan Tracker…
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <TradeDetailDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} e={selected} nowMs={now} />

      {variant === "FULL" && (
        <div className="relative">
          <MarketStatusCard
            regime={planView.market_regime}
            marketMode={planView.market_mode}
            confidence={planView.confidence}
            updatedAt={statusUpdatedAt}
            riskWarnings={planView.risk_warning}
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
            <ul className="list-disc space-y-1 pl-4">
              <li>
                <b>Market Regime</b> = ตลาดอยู่โหมดไหน (RANGE / TREND / ฯลฯ)
              </li>
              <li>
                <b>Strategy</b> = กลยุทธ์หลักที่ระบบแนะนำ
              </li>
              <li>
                <b>FRESH</b> = สถานะความสดของสรุป
              </li>
              <li>
                <b>fail-safe</b> = route กำลังเสิร์ฟสถานะปกติ, degraded, หรือ hard-stop
              </li>
            </ul>
            <div>บล็อคนี้อ่านจาก resolved route truth แล้ว ไม่ให้ timeline มายึดอำนาจแทน</div>
          </InfoButton>
        </div>
      )}

      <div className="min-w-0 overflow-hidden rounded-2xl bg-neutral-900 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-neutral-300">
            <div className="text-xs text-neutral-400">BTC ล่าสุด</div>
            <div className="mt-1 font-semibold">
              Close(5m): <span className="text-neutral-100">{fmt((data as any)?.price?.close_5m)}</span>{" "}
              <span className="text-neutral-500">|</span> Close(1H):{" "}
              <span className="text-neutral-100">{fmt((data as any)?.price?.close_1h)}</span>
            </div>

            <div className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-xs text-neutral-500">
              <span>Mode lock: {modeLock}</span>
              {price5mDir !== "UNKNOWN" && (
                <span>
                  • Price(5m): {price5mDir}
                  {typeof price5mPct === "number" ? ` (${price5mPct.toFixed(2)}%)` : ""}
                </span>
              )}
              <span>• Plan source: {resolvedPlanSource}</span>
              <span>• Resolver source: {planView.source}</span>
              <span>• State source: {selectedStateSource}</span>
              <span>• Payload: {payloadKind}</span>
            </div>
          </div>

          <div className="text-right text-xs text-neutral-400">
            <div>
              Page Fresh: <span className="text-neutral-200">{pageAgeSec === null ? "—" : `${pageAgeSec}s`}</span>
              {nextPollInSec !== null && <span className="text-neutral-500"> (อัปเดตครั้งใน {nextPollInSec}s)</span>}
            </div>

            <div className="mt-0.5">
              <span
                className="text-neutral-400"
                title="อิงจาก source_updated_at (collector) = เวลาที่ชุดแท่ง/ข้อมูลตลาดถูกเก็บล่าสุด"
              >
                Candle Fresh:
              </span>{" "}
              <span className="text-neutral-200">{candleAgeSec === null ? "—" : `${candleAgeSec}s`}</span>
              {candleIntervalSec !== null && (
                <span className="text-neutral-500"> (อัปเดตครั้งก่อน: {candleIntervalSec}s)</span>
              )}
            </div>

            <div className="mt-2">
              <button
                type="button"
                onClick={() => void refreshAll()}
                disabled={refreshing}
                className="rounded-md border border-white/10 px-2 py-1 text-neutral-200 hover:bg-white/5 disabled:opacity-50"
              >
                {refreshing ? "Refreshing…" : "Refresh"}
              </button>
            </div>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <span className={`rounded-full border px-3 py-1 ${failSafeTone(failSafeMode)}`}>
            fail-safe: {failSafeMode}
          </span>
          <span className={`rounded-full border px-3 py-1 ${payloadTone(payloadKind)}`}>
            payload: {payloadKind}
          </span>
          <span className="rounded-full border border-neutral-700 bg-white/5 px-3 py-1 text-neutral-200">
            canonical root: {planView.canonical_root_plan_present ? "yes" : "no"}
          </span>
          <span className="rounded-full border border-neutral-700 bg-white/5 px-3 py-1 text-neutral-200">
            state plan: {planView.state_plan_present ? "yes" : "no"}
          </span>
          <span className="rounded-full border border-neutral-700 bg-white/5 px-3 py-1 text-neutral-200">
            uses canonical: {planView.uses_canonical_plan ? "yes" : "no"}
          </span>
          <span className="rounded-full border border-neutral-700 bg-white/5 px-3 py-1 text-neutral-200">
            uses state: {planView.uses_state_plan ? "yes" : "no"}
          </span>
        </div>

        {(planView.truth_note || failSafeReasons.length > 0) && (
          <div className="mt-3 rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-neutral-300">
            {planView.truth_note ? <div>{planView.truth_note}</div> : null}
            {failSafeReasons.length > 0 && (
              <ul className="mt-2 space-y-1 text-neutral-400">
                {failSafeReasons.map((reason: string, idx: number) => (
                  <li key={`${reason}-${idx}`}>• {reason}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {notice.show && (
          <div className={`mt-3 rounded-xl border px-4 py-3 ${notice.tone}`}>
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-white/5">
                {notice.icon}
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold">{notice.title}</div>
                <div className="mt-0.5 text-xs text-white/75">{notice.detail}</div>
                {(latestChange as any)?.t && (
                  <div className="mt-1 text-[11px] text-white/55">
                    อัปเดตล่าสุด: {timeTH(eventTimeMs(latestChange as any) ?? (latestChange as any).t)}
                  </div>
                )}
              </div>
              <div className="ml-auto text-xs text-white/60">{stepSet}</div>
            </div>
          </div>
        )}

        <div className="relative mt-4 min-w-0 overflow-hidden rounded-xl bg-neutral-950/60 p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <div className="max-w-[min(520px,70vw)] truncate text-sm font-semibold text-neutral-200">
                {built.title || stateHeadline || "Plan Steps"}
              </div>

              {obGateMeta.isReady && (
                <span className="shrink-0 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-200">
                  🔥 {obGateMeta.label || "พร้อมยิง"}
                </span>
              )}
            </div>

            {showObReadyAlert && (
              <div className="mt-2 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-emerald-50">
                <div className="flex items-start justify-between gap-2">
                  <div className="text-xs font-semibold">✅ OB Gate READY — {obGateMeta.label || "พร้อมยิง"}</div>
                  {typeof obReadyAgeSec === "number" && (
                    <div className="text-[11px] text-emerald-200/70">{obReadyAgeSec}s ago</div>
                  )}
                </div>

                <div className="mt-1 text-xs text-emerald-100/90">
                  Entry: {fmtZone(obGateMeta.entryZone)} · SL: {fmt1(obGateMeta.sl ?? undefined)} · TP1:{" "}
                  {fmt1(obGateMeta.tp1 ?? undefined)}
                </div>

                {obGateMeta.why ? <div className="mt-1 text-[11px] text-emerald-100/70">{obGateMeta.why}</div> : null}
              </div>
            )}

            <div className="max-w-full truncate text-xs text-neutral-500 sm:max-w-[360px] sm:text-right">
              state_code: {stateCode || "—"}
              {directionHint ? <span className="text-neutral-600"> • hint: {directionHint}</span> : null}
            </div>
          </div>

          <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-2">
            {built.steps.map((s) => {
              const isActive = built.activeStepId === s.id;
              const tone = stepTone(s.status, isActive);

              return (
                <div key={s.id} className={`rounded-xl border p-3 ${tone.wrap}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className={`mt-1 h-3 w-3 rounded-full ${tone.dot}`} />
                      <div className="min-w-0">
                        <div className={`text-sm font-semibold ${tone.title}`}>{s.title}</div>
                        <div className="mt-0.5 break-words whitespace-pre-wrap text-xs text-neutral-400">{s.detail}</div>
                        {s.why && <div className="mt-1 text-[11px] text-neutral-500">state: {s.why}</div>}
                      </div>
                    </div>
                    <span className={`shrink-0 rounded-full border px-2 py-0.5 text-xs ${tone.badge}`}>{s.badge}</span>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-3 text-sm text-neutral-300">
            <div className="text-xs text-neutral-400">Explain</div>
            <div className="mt-1 break-words whitespace-pre-wrap">{stateHeadline || (data as any)?.explain_th}</div>

            {stepSet === "GRID_SWEEP_PIPELINE" && (
              <div className="mt-1 text-xs text-neutral-500">Sweep target: {zoneText}</div>
            )}
          </div>

          <InfoButton title="Plan Steps คืออะไร?">
            <div>บล็อคนี้คือ state machine ฝั่ง UI ที่อ่านจาก route truth เป็นหลัก</div>
            <ul className="list-disc space-y-1 pl-4">
              <li>
                <b>state truth</b> = <code>plan_status_state</code>
              </li>
              <li>
                <b>plan truth</b> = resolved plan จาก route / resolver
              </li>
              <li>
                <b>logs/timeline</b> = ใช้ประกอบ ไม่ได้มีสิทธิ์เปลี่ยน step narrative
              </li>
              <li>
                <b>fail-safe</b> = route metadata ที่ใช้ตัดสินว่าจะ freeze action หรือ serve public-only หรือไม่
              </li>
            </ul>
            <div>สั้น ๆ คือ “timeline เล่าเรื่องย้อนหลัง แต่ route เป็นคนตัดสินปัจจุบัน”</div>
          </InfoButton>
        </div>

        <div className="relative mt-4 rounded-xl bg-neutral-950/60 p-4">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-neutral-200">Derivatives (OI / Funding)</div>
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
              <span className="font-semibold text-neutral-100">{d?.crowd?.crowd_th ?? "—"}</span>
            </div>
            <div>
              <span className="text-neutral-400">ใครติดอยู่:</span>{" "}
              <span className="font-semibold text-neutral-100">{d?.crowd?.trapped_th ?? "—"}</span>
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
              <div className="text-xs text-neutral-400">คำตัดสิน</div>

              <div className="mt-1 flex items-center gap-2 text-sm text-neutral-100">
                <span className="text-lg">{emojiForCombo(price5mDir, asDerivDir(d?.oi?.trend_5m?.dir))}</span>
                <span>{priceVsOi.line1}</span>
              </div>

              {priceVsOi.line2 && <div className="mt-1 text-sm text-neutral-100">{priceVsOi.line2}</div>}
            </div>
          )}

          <InfoButton title="Derivatives (OI / Funding) แปลว่าอะไร?">
            <div>บล็อคนี้คือเครื่องจับชีพจรของ crowd และ leverage</div>
            <ul className="list-disc space-y-1 pl-4">
              <li>
                <b>OI</b> = จำนวนสัญญาค้าง
              </li>
              <li>
                <b>Funding</b> = ค่าเอนเอียงฝั่งตลาด
              </li>
              <li>
                <b>Crowd / Trapped</b> = ฝูงชนหนาไปทางไหน และเริ่มติดอยู่หรือยัง
              </li>
              <li>
                <b>คำตัดสิน</b> = summary สั้นจาก price + OI + funding + OB gate
              </li>
            </ul>
          </InfoButton>
        </div>

        {variant === "FULL" && (
          <div className="relative mt-4 rounded-xl bg-neutral-950/60 p-4">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-neutral-200">Timeline</div>
              <div className="text-xs text-neutral-500">{logs?.length ? `${logs.length} events` : "no events"}</div>
            </div>

            <div className="mt-2 text-[11px] text-neutral-500">
              คลิกแต่ละแถวเพื่อเปิดรายละเอียด (entry/sl/tp/result/raw)
            </div>

            <div className="mt-3">
              <div className="flex items-center justify-between">
                <div className="text-xs text-neutral-400">Today</div>
                <div className="text-xs text-neutral-500">
                  {todayGroup?.items?.length ? `${todayGroup.items.length} events` : "no events"}
                </div>
              </div>

              {!todayGroup || todayGroup.items.length === 0 ? (
                <div className="mt-2 text-sm text-neutral-400">วันนี้ยังไม่มีเหตุการณ์เปลี่ยนสถานะ</div>
              ) : (
                <>
                  <div className="mt-3">
                    <TimelineList
                      items={todayGroup.items}
                      maxH="max-h-72"
                      showCrowd
                      nowMs={now}
                      onRowClick={onRowClick}
                    />
                  </div>

                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs text-neutral-400 hover:text-neutral-200">
                      ดูรายละเอียด (debug)
                    </summary>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs">
                      <span className="rounded-full border border-neutral-700 px-3 py-1 text-neutral-300">
                        5m: {(data as any)?.states?.sweep_5m ?? "—"}
                      </span>
                      <span className="rounded-full border border-neutral-700 px-3 py-1 text-neutral-300">
                        15m: {(data as any)?.states?.rejection_15m ?? "—"}
                      </span>
                      <span className="rounded-full border border-neutral-700 px-3 py-1 text-neutral-300">
                        1h: {(data as any)?.states?.confirm_1h ?? "—"}
                      </span>
                    </div>
                  </details>
                </>
              )}
            </div>

            <div className="mt-4 border-t border-white/10 pt-4">
              <div className="text-xs text-neutral-400">History (tap to expand)</div>

              <div className="mt-2 max-h-64 space-y-3 overflow-auto pr-1">
                {nonTodayGroups.map((g) => (
                  <details key={g.key} className="rounded-xl border border-white/10 bg-white/5 p-3">
                    <summary className="flex cursor-pointer select-none items-center justify-between text-sm text-neutral-200">
                      <span className="font-semibold">{g.label}</span>
                      <span className="text-xs text-neutral-500">{g.items.length} events</span>
                    </summary>

                    <div className="mt-3">
                      <TimelineList items={g.items} maxH="max-h-72" nowMs={now} onRowClick={onRowClick} />
                    </div>
                  </details>
                ))}

                {nonTodayGroups.length === 0 && (
                  <div className="text-sm text-neutral-400">ยังไม่มีประวัติวันก่อนหน้า</div>
                )}
              </div>
            </div>

            <div className="mt-4 text-[11px] text-neutral-500">
              timeline ใช้ตอบว่า “เกิดอะไรมาแล้ว” แต่ไม่ใช้ตัดสินว่า “ตอนนี้จริง ๆ อยู่ state ไหน”
            </div>

            <InfoButton title="Timeline บอกอะไร?">
              <div>บล็อคนี้คือบันทึกเหตุการณ์ย้อนหลัง ไม่ใช่ source of truth ของหน้าปัจจุบัน</div>
              <ul className="list-disc space-y-1 pl-4">
                <li>
                  <b>Today</b> = เหตุการณ์วันนี้แบบไลฟ์
                </li>
                <li>
                  <b>History</b> = ย้อนหลังแยกเป็นรายวัน
                </li>
                <li>
                  <b>Smart badges</b> = แสดงเมื่อมี trapped / mode switch / signal สำคัญ
                </li>
              </ul>
              <div>เอาไว้ดู narrative ย้อนหลัง ไม่เอาไว้ rewrite route truth</div>
            </InfoButton>
          </div>
        )}

        {ownershipBoundary && (
          <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-4">
            <div className="text-sm font-semibold text-neutral-200">Field ownership</div>
            <div className="mt-2 grid gap-3 md:grid-cols-2">
              <div>
                <div className="text-xs text-neutral-400">canonical_owned</div>
                <div className="mt-1 text-xs text-neutral-300">
                  {Array.isArray(ownershipBoundary.canonical_owned) && ownershipBoundary.canonical_owned.length > 0
                    ? ownershipBoundary.canonical_owned.join(", ")
                    : "—"}
                </div>
              </div>
              <div>
                <div className="text-xs text-neutral-400">route_live_owned</div>
                <div className="mt-1 text-xs text-neutral-300">
                  {Array.isArray(ownershipBoundary.route_live_owned) && ownershipBoundary.route_live_owned.length > 0
                    ? ownershipBoundary.route_live_owned.join(", ")
                    : "—"}
                </div>
              </div>
              <div>
                <div className="text-xs text-neutral-400">route_regenerated_owned</div>
                <div className="mt-1 text-xs text-neutral-300">
                  {Array.isArray(ownershipBoundary.route_regenerated_owned) && ownershipBoundary.route_regenerated_owned.length > 0
                    ? ownershipBoundary.route_regenerated_owned.join(", ")
                    : "—"}
                </div>
              </div>
              <div>
                <div className="text-xs text-neutral-400">route_persisted_outputs</div>
                <div className="mt-1 text-xs text-neutral-300">
                  {Array.isArray(ownershipBoundary.route_persisted_outputs) && ownershipBoundary.route_persisted_outputs.length > 0
                    ? ownershipBoundary.route_persisted_outputs.join(", ")
                    : "—"}
                </div>
              </div>
            </div>
          </div>
        )}

        {truthBoundary && (
          <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-4 text-xs text-neutral-300">
            <div className="text-sm font-semibold text-neutral-200">Truth boundary</div>
            <div className="mt-2 grid gap-2 md:grid-cols-2">
              <div>
                <span className="text-neutral-400">live_price_owner:</span>{" "}
                <span>{truthBoundary.live_price_owner ?? "—"}</span>
              </div>
              <div>
                <span className="text-neutral-400">regenerated_state_owner:</span>{" "}
                <span>{truthBoundary.regenerated_state_owner ?? "—"}</span>
              </div>
              <div>
                <span className="text-neutral-400">resolved_plan_source:</span>{" "}
                <span>{truthBoundary.resolved_plan_source ?? resolvedPlanSource}</span>
              </div>
              <div>
                <span className="text-neutral-400">selected_state_source:</span>{" "}
                <span>{truthBoundary.selected_state_source ?? selectedStateSource}</span>
              </div>
              <div>
                <span className="text-neutral-400">route_writer_policy:</span>{" "}
                <span>{truthBoundary.route_writer_policy ?? "—"}</span>
              </div>
            </div>
          </div>
        )}

        {err && data && (
          <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-100">
            รีเฟรชล่าสุดมีปัญหา: {err}
          </div>
        )}
      </div>
    </div>
  );
}
