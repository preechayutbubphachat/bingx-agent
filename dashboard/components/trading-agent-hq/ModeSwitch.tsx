"use client";

import Link from "next/link";

export default function ModeSwitch({
  lowPower,
  debug,
  onToggleLowPower,
  onToggleDebug,
}: {
  lowPower: boolean;
  debug: boolean;
  onToggleLowPower: () => void;
  onToggleDebug: () => void;
}) {
  const base = "rounded-lg px-3 py-2 text-xs font-bold ring-1 transition";

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[#3a2c21]/10 bg-[#fff8ec] p-2 shadow-sm">
      <span className="text-sm font-black text-[#2f241b]">TradingAgentHQ</span>
      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-black text-emerald-800">อ่านอย่างเดียว</span>

      <div className="ml-auto flex items-center gap-2">
        <button
          type="button"
          onClick={onToggleLowPower}
          aria-pressed={lowPower}
          className={`${base} ${lowPower ? "bg-emerald-700 text-white ring-emerald-700" : "bg-white text-[#5b4432] ring-[#3a2c21]/15"}`}
        >
          ประหยัดพลังงาน: {lowPower ? "เปิด" : "ปิด"}
        </button>
        <button
          type="button"
          onClick={onToggleDebug}
          aria-pressed={debug}
          className={`${base} ${debug ? "bg-[#b8792b] text-white ring-[#b8792b]" : "bg-white text-[#5b4432] ring-[#3a2c21]/15"}`}
        >
          ดีบัก: {debug ? "เปิด" : "ปิด"}
        </button>
        <Link href="/public" className={`${base} bg-[#2f241b] text-[#f8ead3] ring-[#2f241b] hover:bg-[#473527]`}>
          แดชบอร์ดคลาสสิก
        </Link>
      </div>
    </div>
  );
}
