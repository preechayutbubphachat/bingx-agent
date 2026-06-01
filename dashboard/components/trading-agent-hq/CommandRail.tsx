"use client";

import type { AgentId, TradingAgentHQViewModel } from "@/lib/trading-agent-hq/viewModel";
import { AGENT_PLACEMENTS } from "@/lib/trading-agent-hq/sceneConfig";

const NAV_ITEMS = [
  { key: "hq", label: "HQ", hint: "Read-only overview" },
  { key: "agents", label: "Agents", hint: "Desk crew" },
  { key: "paper", label: "Paper", hint: "Evidence only" },
  { key: "events", label: "Events", hint: "Recent logs" },
  { key: "memory", label: "Memory", hint: "Audit trail" },
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
    <aside className="flex flex-row gap-2 overflow-x-auto rounded-lg border border-[#3a2c21]/15 bg-[#fff8ec] p-2 shadow-sm lg:flex-col lg:overflow-visible">
      <div className="hidden border-b border-[#3a2c21]/10 pb-2 text-center lg:block">
        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-lg bg-[#2f241b] text-sm font-black text-[#f8d37b]">
          THQ
        </div>
        <div className="mt-1 text-[10px] font-bold uppercase text-[#6d5745]">Read only</div>
      </div>

      {NAV_ITEMS.map((item) => (
        <button
          key={item.key}
          type="button"
          className="min-w-[74px] rounded-lg border border-[#3a2c21]/10 bg-white px-2 py-2 text-left transition hover:border-[#b8792b]/40 hover:bg-[#fff3dd] lg:min-w-0"
          title={item.hint}
        >
          <span className="block text-xs font-bold text-[#2f241b]">{item.label}</span>
          <span className="block truncate text-[10px] text-[#8a735d]">{item.hint}</span>
        </button>
      ))}

      <div className="hidden flex-1 lg:block" />

      <div className="flex gap-1 lg:flex-col">
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
                  ? "border-[#2f241b] bg-[#2f241b] text-[#f8d37b]"
                  : "border-[#3a2c21]/10 bg-white text-[#5a4636] hover:border-[#b8792b]/40"
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

      <div className="min-w-[94px] rounded-lg bg-[#2f241b] px-2 py-2 text-[#f7ead8] lg:min-w-0">
        <div className="text-[10px] uppercase text-[#d8b66f]">Crew awake</div>
        <div className="text-lg font-black">{activeAgents}/6</div>
      </div>
    </aside>
  );
}
