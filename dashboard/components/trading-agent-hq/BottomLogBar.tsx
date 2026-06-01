// dashboard/components/trading-agent-hq/BottomLogBar.tsx
"use client";

import type { LogEntry, AgentId } from "@/lib/trading-agent-hq/viewModel";

const TYPE_CLS: Record<LogEntry["type"], string> = {
  FILL_RESULT: "bg-emerald-100 text-emerald-700",
  ALERT: "bg-amber-100 text-amber-700",
  DECISION: "bg-sky-100 text-sky-700",
  SYSTEM: "bg-neutral-100 text-neutral-600",
};

export default function BottomLogBar({
  log, onPick, selected,
}: { log: LogEntry[]; onPick: (id: AgentId) => void; selected?: AgentId | null }) {
  return (
    <div className="rounded-2xl bg-white/80 px-3 py-2 ring-1 ring-black/10">
      <div className="mb-1 text-[10px] uppercase tracking-wide text-neutral-500">Activity Log</div>
      <ul className="flex flex-col gap-1">
        {log.map((e, i) => (
          <li
            key={i}
            className={`flex items-center gap-2 rounded px-1 text-xs ${
              selected && e.agentId === selected ? "bg-amber-50 ring-1 ring-amber-200" : ""
            }`}
          >
            <span className="shrink-0 text-[10px] tabular-nums text-neutral-400">{e.ts}</span>
            <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${TYPE_CLS[e.type]}`}>{e.type}</span>
            {e.agentId ? (
              <button
                type="button"
                onClick={() => onPick(e.agentId as AgentId)}
                className="truncate text-left text-neutral-700 hover:underline"
              >
                {e.text}
              </button>
            ) : (
              <span className="truncate text-neutral-700">{e.text}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
