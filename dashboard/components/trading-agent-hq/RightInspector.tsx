"use client";

import type { AgentVM, PaperVM } from "@/lib/trading-agent-hq/viewModel";
import { AGENT_PLACEMENTS } from "@/lib/trading-agent-hq/sceneConfig";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 border-b border-[#3a2c21]/10 py-1.5 text-xs">
      <span className="text-[#7a6550]">{label}</span>
      <span className="text-right font-bold text-[#2f241b]">{value}</span>
    </div>
  );
}

export default function RightInspector({
  agent,
  paper,
  onClose,
  onDebug,
}: {
  agent: AgentVM | null;
  paper: PaperVM;
  onClose: () => void;
  onDebug: () => void;
}) {
  const closedCycleLabel = paper.closedCycles === 0 ? "DATA_GAP" : "EVIDENCE";

  if (!agent) {
    return (
      <div className="flex h-full min-h-[220px] w-full flex-col items-center justify-center rounded-lg border border-[#3a2c21]/10 bg-[#fffaf1] p-4 text-center text-xs text-[#8a735d] shadow-sm">
        <span className="text-sm font-black text-[#2f241b]">Select an agent desk to inspect the read-only state.</span>
        <span className="mt-2 max-w-[280px] leading-relaxed">
          No live/order/approval controls are available here. Use the agent buttons or cafe desks to inspect status only.
        </span>
      </div>
    );
  }

  const place = AGENT_PLACEMENTS.find((p) => p.id === agent.id);

  return (
    <div className="flex h-full w-full flex-col rounded-lg border border-[#3a2c21]/10 bg-[#fffaf1] p-4 shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <div>
          <h3 className="text-base font-black text-[#2f241b]">{place?.label ?? agent.id}</h3>
          <p className="text-[11px] text-[#8a735d]">{place?.role ?? "Agent desk"}</p>
        </div>
        <button type="button" onClick={onClose} className="rounded px-2 py-0.5 text-xs text-[#8a735d] hover:bg-white">
          Close
        </button>
      </div>

      <Row label="Status" value={agent.status} />
      <Row label="Current task" value={agent.currentTask} />
      <Row label="Last action" value={agent.lastAction} />
      <Row label="Metric" value={agent.metric ?? "-"} />
      <Row label="Confidence / risk" value={agent.confidence ?? "-"} />
      <Row label="Animation" value={agent.animation} />

      <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-[11px] text-amber-900">
        <div className="font-black uppercase">Paper evidence honesty</div>
        <div className="mt-1">
          paper fills only={paper.totalOrderFilled} | closedCycles={paper.closedCycles} / {closedCycleLabel} | edge={paper.edgeStatus}
        </div>
        <div className="mt-1">cost: {paper.costGateStatus} | not edge | not ready</div>
        {paper.closedCycles === 0 ? <div className="mt-1 font-bold">DATA_GAP: closed cycle evidence is still missing.</div> : null}
      </div>

      <button
        type="button"
        onClick={onDebug}
        className="mt-3 rounded-lg bg-[#2f241b] px-3 py-2 text-xs font-bold text-[#f8ead3] hover:bg-[#473527]"
      >
        Advanced / Debug to /public
      </button>
    </div>
  );
}
