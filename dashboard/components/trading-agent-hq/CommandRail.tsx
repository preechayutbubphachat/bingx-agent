"use client";

import type { AgentId, TradingAgentHQViewModel } from "@/lib/trading-agent-hq/viewModel";
import { AGENT_PLACEMENTS } from "@/lib/trading-agent-hq/sceneConfig";

const NAV_ITEMS = [
  { key: "hq", label: "ภาพรวม", hint: "อ่านอย่างเดียว", icon: "🏠" },
  { key: "agents", label: "ทีม Agent", hint: "ทีมประจำโต๊ะ", icon: "👥" },
  { key: "paper", label: "หลักฐาน Paper", hint: "หลักฐานเท่านั้น", icon: "📄" },
  { key: "events", label: "เหตุการณ์", hint: "บันทึกล่าสุด", icon: "🔔" },
  { key: "memory", label: "ความจำ", hint: "บันทึกตรวจสอบ", icon: "🧠" },
] as const;

export default function CommandRail({
  vm,
  selected,
  onSelect,
}: {
  vm: TradingAgentHQViewModel;
  selected: AgentId | null;
  onSelect: (id: AgentId) => void;
}) {
  const activeAgents = Object.values(vm.agents).filter((agent) =>
    ["running", "scanning", "guarding", "logging"].includes(agent.status),
  ).length;

  return (
    <aside className="flex flex-row gap-2 overflow-x-auto rounded-2xl border border-cyan-400/20 bg-slate-950/75 p-2 shadow-[0_0_26px_rgba(34,211,238,0.06)] xl:flex-col xl:overflow-visible">
      <div className="hidden border-b border-cyan-400/10 pb-2 text-center xl:block">
        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl border border-fuchsia-300/40 bg-fuchsia-400/10 text-sm font-black text-fuchsia-100">
          THQ
        </div>
        <div className="mt-1 text-[10px] font-bold uppercase text-slate-500">อ่านอย่างเดียว</div>
      </div>

      {NAV_ITEMS.map((item) => (
        <button
          key={item.key}
          type="button"
          className="min-w-[74px] rounded-xl border border-cyan-400/20 bg-slate-900/80 px-2 py-2 text-left transition hover:border-cyan-300/40 hover:bg-cyan-400/10 xl:min-w-0"
          title={item.hint}
        >
          <span className="flex items-center gap-1.5 text-xs font-bold text-slate-100">
            <span className="text-sm" aria-hidden>{item.icon}</span>
            <span className="truncate">{item.label}</span>
          </span>
          <span className="block truncate text-[10px] text-slate-500">{item.hint}</span>
        </button>
      ))}

      <div className="hidden flex-1 xl:block" />

      <div className="flex gap-1 xl:flex-col">
        {AGENT_PLACEMENTS.map((placement) => {
          const isSelected = selected === placement.id;
          const agent = vm.agents[placement.id];
          return (
            <button
              key={placement.id}
              type="button"
              onClick={() => onSelect(placement.id)}
              className={`h-9 w-9 shrink-0 rounded-lg border text-[10px] font-black transition ${
                isSelected
                  ? "border-cyan-300/70 bg-cyan-400/20 text-cyan-100 shadow-[0_0_14px_rgba(34,211,238,0.18)]"
                  : "border-cyan-400/20 bg-slate-900/80 text-slate-300 hover:border-cyan-300/40 hover:bg-cyan-400/10"
              }`}
              title={`${placement.label}: ${agent.status}`}
            >
              {placement.label
                .split(" ")
                .map((word) => word[0])
                .join("")
                .slice(0, 2)}
            </button>
          );
        })}
      </div>

      <div className="min-w-[94px] rounded-xl border border-emerald-300/40 bg-emerald-400/10 px-2 py-2 text-emerald-100 xl:min-w-0">
        <div className="text-[10px] uppercase text-emerald-300">ทีมที่ตื่น</div>
        <div className="text-lg font-black">{activeAgents}/6</div>
      </div>
    </aside>
  );
}
