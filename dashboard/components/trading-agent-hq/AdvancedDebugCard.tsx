"use client";

import Link from "next/link";
import type { TradingAgentHQViewModel } from "@/lib/trading-agent-hq/viewModel";

export default function AdvancedDebugCard({
  vm,
  lowPower,
  debug,
}: {
  vm: TradingAgentHQViewModel;
  lowPower: boolean;
  debug: boolean;
}) {
  return (
    <section className="rounded-2xl border border-cyan-400/20 bg-slate-950/75 p-3 text-xs shadow-[0_0_26px_rgba(34,211,238,0.06)]">
      <h2 className="text-xs font-black uppercase tracking-[0.14em] text-cyan-100">ดีบักขั้นสูง</h2>
      <div className="mt-2 space-y-1.5 text-slate-300">
        <div className="flex justify-between gap-3 border-b border-cyan-400/10 pb-1">
          <span>แหล่งข้อมูล</span>
          <span className="font-bold text-slate-100">{vm.meta.source}</span>
        </div>
        <div className="flex justify-between gap-3 border-b border-cyan-400/10 pb-1">
          <span>ความสดข้อมูล</span>
          <span className="font-bold text-slate-100">{vm.meta.isStale ? "เก่า" : "ล่าสุด"}</span>
        </div>
        <div className="flex justify-between gap-3 border-b border-cyan-400/10 pb-1">
          <span>ประหยัดพลังงาน</span>
          <span className="font-bold text-slate-100">{lowPower ? "เปิด" : "ปิด"}</span>
        </div>
        <div className="flex justify-between gap-3 border-b border-cyan-400/10 pb-1">
          <span>ดีบักโอเวอร์เลย์</span>
          <span className="font-bold text-slate-100">{debug ? "เปิด" : "ปิด"}</span>
        </div>
        <div className="flex justify-between gap-3 border-b border-cyan-400/10 pb-1">
          <span>โหมดอ่านอย่างเดียว</span>
          <span className="font-bold text-emerald-200">ใช่</span>
        </div>
      </div>
      <Link
        href="/public"
        className="mt-3 block rounded-lg border border-cyan-300/40 bg-cyan-400/10 px-3 py-2 text-center text-xs font-bold text-cyan-100 hover:bg-cyan-400/20"
      >
        แดชบอร์ดคลาสสิก
      </Link>
    </section>
  );
}
