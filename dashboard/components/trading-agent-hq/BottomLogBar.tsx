"use client";

import type { LogEntry, AgentId } from "@/lib/trading-agent-hq/viewModel";

const TYPE_CLS: Record<LogEntry["type"], string> = {
  FILL_RESULT: "bg-emerald-100 text-emerald-700",
  ALERT: "bg-amber-100 text-amber-700",
  DECISION: "bg-sky-100 text-sky-700",
  SYSTEM: "bg-stone-100 text-stone-700",
};

export default function BottomLogBar({
  log,
  onPick,
  selected,
}: {
  log: LogEntry[];
  onPick: (id: AgentId) => void;
  selected?: AgentId | null;
}) {
  return (
    <div className="rounded-lg border border-[#3a2c21]/10 bg-[#fff8ec] px-3 py-2 shadow-sm">
      <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-[#6d5745]">Activity Log</div>
      <ul className="flex flex-col gap-1">
        {log.map((entry, index) => (
          <li
            key={`${entry.ts}-${index}`}
            className={`flex items-center gap-2 rounded px-1 text-xs ${
              selected && entry.agentId === selected ? "bg-amber-50 ring-1 ring-amber-200" : ""
            }`}
          >
            <span className="shrink-0 text-[10px] tabular-nums text-[#9b8269]">{entry.ts}</span>
            <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${TYPE_CLS[entry.type]}`}>{entry.type}</span>
            {entry.agentId ? (
              <button type="button" onClick={() => onPick(entry.agentId as AgentId)} className="truncate text-left text-[#4d3b2d] hover:underline">
                {entry.text}
              </button>
            ) : (
              <span className="truncate text-[#4d3b2d]">{entry.text}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
