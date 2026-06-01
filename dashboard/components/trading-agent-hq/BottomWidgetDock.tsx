"use client";

import type { ReactNode } from "react";
import type { AgentId, LogEntry, TradingAgentHQViewModel } from "@/lib/trading-agent-hq/viewModel";

const TYPE_BADGE: Record<LogEntry["type"], string> = {
  FILL_RESULT: "bg-emerald-100 text-emerald-800",
  ALERT: "bg-amber-100 text-amber-800",
  DECISION: "bg-sky-100 text-sky-800",
  SYSTEM: "bg-stone-100 text-stone-700",
};

function Widget({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="flex min-h-[220px] min-w-0 flex-col rounded-lg border border-[#3a2c21]/10 bg-[#fffaf1] p-3 shadow-sm">
      <h2 className="mb-2 shrink-0 text-xs font-black uppercase tracking-wide text-[#5b4432]">{title}</h2>
      <div className="min-h-0 flex-1 overflow-y-auto pr-1">{children}</div>
    </section>
  );
}

function MiniProgress({ label, status }: { label: string; status: "COST_PASS" | "DATA_GAP" | "BLOCKED" | "PENDING" | "INFO" }) {
  const cls =
    status === "COST_PASS"
      ? "bg-emerald-100 text-emerald-800"
      : status === "DATA_GAP"
        ? "bg-amber-100 text-amber-800"
        : status === "BLOCKED"
          ? "bg-red-100 text-red-800"
          : status === "INFO"
            ? "bg-sky-100 text-sky-800"
            : "bg-stone-100 text-stone-700";
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2 border-b border-[#3a2c21]/10 py-1.5 text-xs last:border-0">
      <span className="min-w-0 break-words text-[#6d5745]">{label}</span>
      <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-black ${cls}`}>{status}</span>
    </div>
  );
}

export default function BottomWidgetDock({
  vm,
  onPick,
}: {
  vm: TradingAgentHQViewModel;
  onPick: (id: AgentId) => void;
}) {
  const alerts = vm.bottomLog.filter((entry) => entry.type === "ALERT");
  const fills = vm.bottomLog.filter((entry) => entry.type === "FILL_RESULT");
  const decisions = vm.bottomLog.filter((entry) => entry.type === "DECISION");
  const closedCycleStatus = vm.paper.closedCycles > 0 ? "INFO" : "DATA_GAP";
  const sampleStatus = vm.paper.sampleStatus === "SUFFICIENT" ? "INFO" : "DATA_GAP";
  const costStatus = vm.paper.costGateStatus === "PASS" ? "COST_PASS" : vm.paper.costGateStatus === "UNKNOWN" ? "PENDING" : "DATA_GAP";
  const closedCycleLabel = vm.paper.closedCycles === 0 ? "DATA_GAP" : "EVIDENCE";

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-[repeat(auto-fit,minmax(230px,1fr))]">
      <Widget title="Daily Missions">
        <ol className="space-y-2 text-xs text-[#4d3b2d]">
          <li className="rounded-md bg-white px-2 py-1.5">1. Keep safety flags OFF and blocked.</li>
          <li className="rounded-md bg-white px-2 py-1.5">2. Watch paper fills without forcing fills.</li>
          <li className="rounded-md bg-white px-2 py-1.5">3. Collect closed-cycle evidence naturally.</li>
          <li className="rounded-md bg-white px-2 py-1.5">4. Escalate only after evidence review.</li>
        </ol>
      </Widget>

      <Widget title="Alerts">
        <div className="space-y-2">
          {(alerts.length ? alerts : [{ ts: "-", type: "ALERT" as const, text: "M-0B remains blocked until evidence passes." }]).map(
            (entry, index) => (
              <div key={`${entry.ts}-${index}`} className="rounded-md bg-white px-2 py-1.5 text-xs text-[#5b4432]">
                <span className={`mr-2 rounded px-1.5 py-0.5 text-[10px] font-bold ${TYPE_BADGE[entry.type]}`}>{entry.type}</span>
                {entry.text}
              </div>
            ),
          )}
        </div>
      </Widget>

      <Widget title="Latest Paper Events">
        <div className="space-y-2">
          {(fills.length ? fills : vm.bottomLog.slice(0, 3)).map((entry, index) => (
            <button
              key={`${entry.ts}-${index}`}
              type="button"
              onClick={() => entry.agentId && onPick(entry.agentId)}
              className="block w-full rounded-md bg-white px-2 py-1.5 text-left text-xs text-[#5b4432] hover:bg-[#fff3dd]"
            >
              <span className="block text-[10px] text-[#9b8269]">{entry.ts}</span>
              <span className={`mr-2 rounded px-1.5 py-0.5 text-[10px] font-bold ${TYPE_BADGE[entry.type]}`}>{entry.type}</span>
              {entry.text}
            </button>
          ))}
        </div>
      </Widget>

      <Widget title="Decision Log">
        <div className="space-y-2">
          {(decisions.length ? decisions : [{ ts: "-", type: "DECISION" as const, text: "No decision event in recent public-safe log." }]).map(
            (entry, index) => (
              <div key={`${entry.ts}-${index}`} className="rounded-md bg-white px-2 py-1.5 text-xs text-[#5b4432]">
                <span className="block text-[10px] text-[#9b8269]">{entry.ts}</span>
                {entry.text}
              </div>
            ),
          )}
        </div>
      </Widget>

      <Widget title="Evidence Progress">
        <MiniProgress label={`Paper fills: ${vm.paper.totalOrderFilled} (paper fills only / not profitability)`} status={vm.paper.totalOrderFilled > 0 ? "INFO" : "PENDING"} />
        <MiniProgress label={`Closed Cycles: ${vm.paper.closedCycles} / ${closedCycleLabel}`} status={closedCycleStatus} />
        <MiniProgress label="Sample size" status={sampleStatus} />
        <MiniProgress label={`Cost Gate: cost: ${vm.paper.costGateStatus} / not edge`} status={costStatus} />
        <MiniProgress label={`Edge status: ${vm.paper.edgeStatus === "REAL_FILLS_ACCUMULATING" ? "sample_insufficient" : vm.paper.edgeStatus}`} status="DATA_GAP" />
        <MiniProgress label="M-0B gate" status="BLOCKED" />
      </Widget>
    </div>
  );
}
