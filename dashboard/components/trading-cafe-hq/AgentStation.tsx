"use client";

import type { CafeAgent, CafeAgentId } from "@/lib/trading-cafe-hq/mockData";

const statusLabel: Record<CafeAgent["status"], string> = {
  idle: "Idle",
  working: "Working",
  alert: "Alert",
  happy: "Happy",
  stale: "Stale",
  error: "Error",
};

export default function AgentStation({
  agent,
  selected,
  compact = false,
  onSelect,
}: {
  agent: CafeAgent;
  selected: boolean;
  compact?: boolean;
  onSelect: (id: CafeAgentId) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(agent.id)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect(agent.id);
        }
      }}
      className={`${compact ? "relative w-full" : `absolute ${agent.stationClass} w-[164px]`} group z-10 rounded-xl border bg-[#fff8ec]/95 p-2 text-left shadow-md transition hover:-translate-y-1 focus:outline-none focus:ring-2 focus:ring-[#2f241b] motion-reduce:transition-none ${
        selected ? "border-[#7c3aed] ring-4 ring-[#7c3aed]/25" : agent.status === "alert" ? "border-orange-500" : "border-[#d4a86f]"
      }`}
      aria-pressed={selected}
      aria-label={`Select ${agent.name}, ${agent.subtitle}`}
    >
      <div className="flex items-start gap-2">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-sm font-black text-white" style={{ backgroundColor: agent.color }}>
          {agent.number}
        </span>
        <div className="min-w-0">
          <div className="truncate text-sm font-black text-[#2f241b]">{agent.name}</div>
          <div className="truncate text-[10px] font-bold text-[#6d5745]">{agent.subtitle}</div>
        </div>
      </div>
      <div className="mt-2 flex items-end gap-2">
        <div
          className={`${compact ? "h-20 w-20" : "h-14 w-14"} shrink-0 bg-contain bg-center bg-no-repeat`}
          style={{ backgroundImage: `url(${agent.sprite})` }}
          aria-hidden="true"
        >
          <span className="sr-only">{agent.fallbackIcon}</span>
        </div>
        <div className="min-w-0 flex-1">
          <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-black ${
            agent.status === "alert"
              ? "bg-orange-100 text-orange-800"
              : agent.status === "working"
                ? "bg-blue-100 text-blue-800"
                : agent.status === "happy"
                  ? "bg-emerald-100 text-emerald-800"
                  : agent.status === "stale"
                    ? "bg-stone-200 text-stone-700"
                    : "bg-[#ead7b8] text-[#5f4935]"
          }`}>
            {statusLabel[agent.status]}
          </span>
          <div className={`${compact ? "line-clamp-2" : "line-clamp-1"} mt-1 text-[10px] leading-snug text-[#6d5745]`}>{agent.currentTask}</div>
        </div>
      </div>
    </button>
  );
}
