"use client";

import type { TradingAgentHQViewModel } from "@/lib/trading-agent-hq/viewModel";

function Pill({ label, value, tone }: { label: string; value: string; tone: "safe" | "block" | "warn" }) {
  const cls =
    tone === "safe"
      ? "border-emerald-300 bg-emerald-50 text-emerald-800"
      : tone === "block"
        ? "border-red-300 bg-red-50 text-red-800"
        : "border-amber-300 bg-amber-50 text-amber-800";

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
    <section className="rounded-lg border border-[#4a3525]/20 bg-[#2b2118] px-3 py-3 text-[#f8ead3] shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <div className="w-full min-w-0 sm:mr-auto sm:w-auto sm:min-w-[220px]">
          {/* UI-2.1: demoted to h2 (page h1 lives in TradingCafeTopBar) + fixed "Caffe" typo. */}
          <div className="text-[11px] font-bold uppercase tracking-wide text-[#d8b66f]">ศูนย์ควบคุม Trading Cafe</div>
          <h2 className="text-xl font-black leading-tight sm:text-2xl">ศูนย์ควบคุม Agent</h2>
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
          className="rounded-lg border border-[#d8b66f]/40 bg-[#3a2b20] px-3 py-2 text-xs font-bold text-[#f8ead3] hover:bg-[#473527]"
        >
          {state === "loading" ? "กำลังรีเฟรช" : "รีเฟรช"}
        </button>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-[#d8c8b4]">
        <span>แหล่งข้อมูล: {vm.meta.source}</span>
        <span>อัปเดต: {vm.meta.lastUpdate}</span>
        <span>{live ? "เชื่อม endpoint ปลอดภัย (อ่านอย่างเดียว)" : "กำลังแสดงข้อมูลจำลอง (mock/fallback)"}</span>
        {vm.meta.isStale && <span className="font-bold text-amber-300">ข้อมูลเก่า</span>}
        {error && <span className="font-bold text-red-300">ข้อผิดพลาด endpoint: {error}</span>}
      </div>
    </section>
  );
}
