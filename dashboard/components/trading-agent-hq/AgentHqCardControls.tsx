"use client";

// dashboard/components/trading-agent-hq/AgentHqCardControls.tsx
// Phase UI-1 — global collapse/expand controls for Agent HQ.
// SAFETY: layout controls only. No trading / run / live / exchange action.

import type { AgentHqViewFilter } from "@/lib/trading-agent-hq/cardLayout";

type Props = {
  filter: AgentHqViewFilter;
  updatedCount: number;
  onCollapseAll: () => void;
  onExpandAll: () => void;
  onToggleUpdatedFilter: () => void;
  onResetLayout: () => void;
};

const btn =
  "rounded-md border border-[#6d5640] bg-[#2c2017] px-3 py-1.5 text-[12px] font-black text-[#e8d8bd] hover:bg-[#3a2c20] active:translate-y-px";

export default function AgentHqCardControls({
  filter,
  updatedCount,
  onCollapseAll,
  onExpandAll,
  onToggleUpdatedFilter,
  onResetLayout,
}: Props) {
  const updatedActive = filter === "updated";
  return (
    <section className="flex flex-wrap items-center gap-2 rounded-lg border border-[#3a2c21]/30 bg-[#2c2017] p-2 shadow-sm">
      <span className="mr-1 rounded-full bg-[#3a2c20] px-2 py-1 text-[10px] font-black text-[#cbb799]">มุมมองการ์ด</span>
      <button type="button" className={btn} onClick={onCollapseAll}>
        ย่อการ์ดทั้งหมด
      </button>
      <button type="button" className={btn} onClick={onExpandAll}>
        ขยายการ์ดทั้งหมด
      </button>
      <button
        type="button"
        onClick={onToggleUpdatedFilter}
        aria-pressed={updatedActive}
        className={`rounded-md border px-3 py-1.5 text-[12px] font-black active:translate-y-px ${
          updatedActive
            ? "border-amber-400 bg-amber-200 text-amber-900"
            : "border-[#6d5640] bg-[#2c2017] text-[#e8d8bd] hover:bg-[#3a2c20]"
        }`}
      >
        เฉพาะการ์ดมีอัปเดต{updatedCount > 0 ? ` (${updatedCount})` : ""}
      </button>
      <button type="button" className={btn} onClick={onResetLayout}>
        รีเซ็ตมุมมอง
      </button>
      <span className="ml-auto text-[10px] font-bold text-[#9a8a72]">Cafe Floor ปักหมุดไว้เสมอ · เป็นเลเยอร์อ่านอย่างเดียว</span>
    </section>
  );
}
