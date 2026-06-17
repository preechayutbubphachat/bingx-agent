"use client";

import type { TradingAgentHQViewModel } from "@/lib/trading-agent-hq/viewModel";
import { hudPanelClass, reviewOnlySafetyCopy } from "@/lib/trading-agent-hq/missionControlVisual";

function Pill({ label, value, tone }: { label: string; value: string; tone: "safe" | "block" | "warn" }) {
  const cls =
    tone === "safe"
      ? "border-emerald-300/40 bg-emerald-400/10 text-emerald-200"
      : tone === "block"
        ? "border-violet-300/40 bg-violet-400/10 text-violet-100"
        : "border-amber-300/40 bg-amber-400/10 text-amber-200";

  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-bold ${cls}`}>
      <span className="text-[10px] uppercase opacity-70">{label}</span>
      {value}
    </span>
  );
}

export default function SafetyStatusStrip({
  vm,
  state,
  error,
  live,
  onRefresh,
}: {
  vm: TradingAgentHQViewModel;
  state: string;
  error: string | null;
  live: boolean;
  onRefresh: () => void;
}) {
  const safety = vm.safety;
  // display-only Thai mapping (ไม่เปลี่ยนค่า field จริง)
  const phaseTh = safety.phase === "M-0B_BLOCKED" ? "M-0B: ถูกบล็อก" : safety.phase;
  const approvalTh = safety.exchangeManualApproval === "approved" ? "อนุมัติแล้ว" : "ยังไม่อนุมัติ";

  return (
    <section className={`${hudPanelClass("violet")} px-3 py-3 text-violet-50`}>
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-violet-300/70 to-transparent" />
      <div className="pointer-events-none absolute -left-12 -top-16 h-28 w-28 rounded-full bg-violet-400/20 blur-3xl" />
      <div className="flex flex-wrap items-center gap-2">
        <div className="w-full min-w-0 sm:mr-auto sm:w-auto sm:min-w-[220px]">
          {/* UI-2.1: demoted to h2 (page h1 lives in TradingCafeTopBar) + fixed "Caffe" typo. */}
          <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-violet-200">Safety Lock / ตัวล็อกความปลอดภัย</div>
          <h2 className="text-lg font-black leading-tight text-white sm:text-xl">Review-only Mission Guard</h2>
          <p className="mt-0.5 text-[11px] font-bold text-violet-100/80">{reviewOnlySafetyCopy()}</p>
        </div>
        <Pill label="เฟส" value={phaseTh} tone="block" />
        <Pill label="เงินจริง" value={safety.liveTradingEnabled ? "เปิด" : "ปิด"} tone={safety.liveTradingEnabled ? "block" : "safe"} />
        <Pill
          label="คำสั่งจริง"
          value={safety.orderPlacementEnabled ? "เปิด" : "ปิด"}
          tone={safety.orderPlacementEnabled ? "block" : "safe"}
        />
        <Pill label="การอนุมัติ" value={approvalTh} tone="warn" />
        <button
          type="button"
          onClick={onRefresh}
          className="rounded-xl border border-cyan-300/40 bg-cyan-400/10 px-3 py-2 text-xs font-bold text-cyan-100 hover:bg-cyan-400/20"
        >
          {state === "loading" ? "กำลังรีเฟรช" : "รีเฟรช"}
        </button>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-violet-100/80">
        <span>แหล่งข้อมูล: {vm.meta.source}</span>
        <span>อัปเดต: {vm.meta.lastUpdate}</span>
        <span>{live ? "เชื่อม endpoint ปลอดภัย (อ่านอย่างเดียว)" : "กำลังแสดงข้อมูลจำลอง (mock/fallback)"}</span>
        {vm.meta.isStale && <span className="font-bold text-amber-300">ข้อมูลเก่า</span>}
        {error && <span className="font-bold text-rose-300">ข้อผิดพลาด endpoint: {error}</span>}
      </div>
    </section>
  );
}
