// dashboard/components/trading-agent-hq/RightInspector.tsx
"use client";

import type { AgentVM, PaperVM } from "@/lib/trading-agent-hq/viewModel";
import { AGENT_PLACEMENTS } from "@/lib/trading-agent-hq/sceneConfig";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 border-b border-neutral-100 py-1.5 text-xs">
      <span className="text-neutral-500">{label}</span>
      <span className="text-right font-medium text-neutral-800">{value}</span>
    </div>
  );
}

export default function RightInspector({
  agent, paper, onClose, onDebug,
}: {
  agent: AgentVM | null;
  paper: PaperVM;
  onClose: () => void;
  onDebug: () => void;
}) {
  if (!agent) {
    return (
      <div className="hidden h-full w-full flex-col items-center justify-center rounded-2xl bg-white/70 p-4 text-center text-xs text-neutral-400 ring-1 ring-black/10 lg:flex">
        คลิก agent เพื่อดูรายละเอียด
      </div>
    );
  }
  const place = AGENT_PLACEMENTS.find((p) => p.id === agent.id);
  return (
    <div className="flex h-full w-full flex-col rounded-2xl bg-white/90 p-4 ring-1 ring-black/10">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-neutral-800">{place?.label ?? agent.id}</h3>
        <button type="button" onClick={onClose} className="rounded px-2 py-0.5 text-xs text-neutral-500 hover:bg-neutral-100">✕</button>
      </div>
      <Row label="Status" value={agent.status} />
      <Row label="Current task" value={agent.currentTask} />
      <Row label="Last action" value={agent.lastAction} />
      <Row label="Metric" value={agent.metric ?? "—"} />
      <Row label="Confidence / risk" value={agent.confidence ?? "—"} />
      <Row label="Animation" value={agent.animation} />

      {/* honest paper note — never edge PASS while closedCycles=0 */}
      <div className="mt-3 rounded-lg bg-amber-50 p-2 text-[11px] text-amber-800 ring-1 ring-amber-200">
        Paper: fills={paper.totalOrderFilled} · closedCycles={paper.closedCycles}
        {paper.closedCycles === 0 ? " → DATA_GAP (ยังไม่พิสูจน์ edge)" : ""}
      </div>

      <button
        type="button"
        onClick={onDebug}
        className="mt-3 rounded-lg bg-neutral-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-700"
      >
        Advanced / Debug → /public
      </button>
    </div>
  );
}
