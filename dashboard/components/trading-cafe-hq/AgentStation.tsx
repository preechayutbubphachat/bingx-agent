"use client";

import type { CafeAgent, CafeAgentId } from "@/lib/trading-cafe-hq/mockData";
import { getAgentVisualConfig } from "@/lib/trading-cafe-hq/agentVisualConfig";
import AgentSprite from "./AgentSprite";

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
  const visual = getAgentVisualConfig(agent.id);

  if (!compact) {
    return (
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onSelect(agent.id);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onSelect(agent.id);
          }
        }}
        className={`absolute ${visual.sceneClass} ${visual.zIndexClass} -translate-x-1/2 -translate-y-1/2 rounded-2xl p-1 text-left transition focus:outline-none focus:ring-4 focus:ring-[#7c3aed]/40 motion-reduce:transition-none ${
          selected ? "bg-[#fff8ec]/70 shadow-[0_0_0_5px_rgba(124,58,237,0.22)]" : "bg-transparent hover:bg-[#fff8ec]/45"
        }`}
        aria-pressed={selected}
        aria-label={`Select ${agent.name}, ${agent.subtitle}`}
      >
        <AgentSprite agent={agent} />
        <span className="pointer-events-none absolute left-1/2 top-full mt-1 min-w-[112px] -translate-x-1/2 rounded-lg border border-[#d4a86f] bg-[#fff8ec]/95 px-2 py-1 text-center shadow">
          <span className="block truncate text-xs font-black text-[#2f241b]">{agent.name}</span>
          <span className="block truncate text-[10px] font-bold text-[#6d5745]">{agent.subtitle}</span>
        </span>
      </button>
    );
  }

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
      className={`relative w-full group z-10 rounded-xl border bg-[#fff8ec]/95 p-2 text-left shadow-md transition hover:-translate-y-1 focus:outline-none focus:ring-2 focus:ring-[#2f241b] motion-reduce:transition-none ${
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
        <AgentSprite agent={agent} size={compact ? "compact" : "station"} />
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
