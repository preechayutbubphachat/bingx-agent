"use client";

import type { LogEntry, AgentId } from "@/lib/trading-agent-hq/viewModel";

const TYPE_CLS: Record<LogEntry["type"], string> = {
  FILL_RESULT: "border border-emerald-300/40 bg-emerald-400/10 text-emerald-200",
  ALERT: "border border-amber-300/40 bg-amber-400/10 text-amber-200",
  DECISION: "border border-cyan-300/40 bg-cyan-400/10 text-cyan-200",
  SYSTEM: "border border-slate-600 bg-slate-800 text-slate-300",
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
    <div className="rounded-2xl border border-cyan-400/20 bg-slate-950/75 px-3 py-2 shadow-[0_0_26px_rgba(34,211,238,0.06)]">
      <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-cyan-100">บันทึกกิจกรรม</div>
      <ul className="scrollbar-thin flex max-h-[220px] flex-col gap-1 overflow-y-auto pr-1">
        {log.map((entry, index) => (
          <li
            key={`${entry.ts}-${index}`}
            className={`flex items-center gap-2 rounded px-1 text-xs ${
              selected && entry.agentId === selected ? "bg-cyan-400/10 ring-1 ring-cyan-300/30" : ""
            }`}
          >
            <span className="shrink-0 text-[10px] tabular-nums text-slate-500">{entry.ts}</span>
            <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${TYPE_CLS[entry.type]}`}>{entry.type}</span>
            {entry.agentId ? (
              <button type="button" onClick={() => onPick(entry.agentId as AgentId)} className="truncate text-left text-slate-300 hover:text-cyan-100 hover:underline">
                {entry.text}
              </button>
            ) : (
              <span className="truncate text-slate-300">{entry.text}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
