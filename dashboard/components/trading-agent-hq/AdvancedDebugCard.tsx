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
    <section className="rounded-lg border border-[#3a2c21]/10 bg-[#fffaf1] p-3 text-xs shadow-sm">
      <h2 className="text-xs font-black uppercase tracking-wide text-[#5b4432]">ดีบักขั้นสูง</h2>
      <div className="mt-2 space-y-1.5 text-[#5b4432]">
        <div className="flex justify-between gap-3 border-b border-[#3a2c21]/10 pb-1">
          <span>แหล่งข้อมูล</span>
          <span className="font-bold">{vm.meta.source}</span>
        </div>
        <div className="flex justify-between gap-3 border-b border-[#3a2c21]/10 pb-1">
          <span>ความสดข้อมูล</span>
          <span className="font-bold">{vm.meta.isStale ? "เก่า" : "ล่าสุด"}</span>
        </div>
        <div className="flex justify-between gap-3 border-b border-[#3a2c21]/10 pb-1">
          <span>ประหยัดพลังงาน</span>
          <span className="font-bold">{lowPower ? "เปิด" : "ปิด"}</span>
        </div>
        <div className="flex justify-between gap-3 border-b border-[#3a2c21]/10 pb-1">
          <span>ดีบักโอเวอร์เลย์</span>
          <span className="font-bold">{debug ? "เปิด" : "ปิด"}</span>
        </div>
        <div className="flex justify-between gap-3 border-b border-[#3a2c21]/10 pb-1">
          <span>โหมดอ่านอย่างเดียว</span>
          <span className="font-bold">ใช่</span>
        </div>
      </div>
      <Link
        href="/public"
        className="mt-3 block rounded-lg bg-[#2f241b] px-3 py-2 text-center text-xs font-bold text-[#f8ead3] hover:bg-[#473527]"
      >
        แดชบอร์ดคลาสสิก
      </Link>
    </section>
  );
}
