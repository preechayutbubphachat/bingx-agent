"use client";

import type { ReactNode } from "react";
import type { AgentId, LogEntry, TradingAgentHQViewModel } from "@/lib/trading-agent-hq/viewModel";
import {
  listActiveMissions,
  listAgentProgressions,
  type AgentBadge,
  type AgentProgression,
  type MissionStatus,
} from "@/lib/trading-agent-hq/progression";

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
    <section className="flex min-h-[236px] min-w-0 max-w-full flex-col overflow-hidden rounded-lg border border-[#3a2c21]/10 bg-[#fffaf1] p-3 shadow-sm">
      <h2 className="mb-2 shrink-0 truncate text-xs font-black uppercase tracking-wide text-[#5b4432]">{title}</h2>
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden pr-1">{children}</div>
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

function missionTone(status: MissionStatus) {
  if (status === "DONE") return "bg-emerald-100 text-emerald-800";
  if (status === "IN_PROGRESS") return "bg-sky-100 text-sky-800";
  if (status === "DATA_GAP" || status === "WARNING") return "bg-amber-100 text-amber-800";
  if (status === "NOT_APPROVED") return "bg-orange-100 text-orange-800";
  return "bg-red-100 text-red-800";
}

function badgeTone(tone: AgentBadge["tone"]) {
  if (tone === "safe") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (tone === "info") return "border-sky-200 bg-sky-50 text-sky-800";
  if (tone === "warning") return "border-amber-200 bg-amber-50 text-amber-900";
  return "border-red-200 bg-red-50 text-red-800";
}

function AgentProgressRow({ item, onPick }: { item: AgentProgression; onPick: (id: AgentId) => void }) {
  const reason = item.blockedReasons[0] ?? "read-only evidence tracking";
  return (
    <button
      type="button"
      onClick={() => onPick(item.agentId)}
      className="grid w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-2 rounded-md bg-white px-2 py-1.5 text-left text-xs hover:bg-[#fff3dd]"
    >
      <div className="min-w-0">
        <div className="truncate font-black text-[#2f241b]">{item.name}</div>
        <div className="truncate text-[10px] text-[#8a735d]">{reason}</div>
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[#ead6b9]">
          <div className="h-full rounded-full bg-[#7d5d3c]" style={{ width: `${item.xpPct}%` }} />
        </div>
      </div>
      <div className="text-right">
        <div className="rounded-full bg-[#2f241b] px-2 py-0.5 text-[10px] font-black text-[#f8ead3]">LV {item.level}</div>
        <div className="mt-1 text-[10px] font-bold uppercase text-[#8a735d]">{item.status}</div>
      </div>
    </button>
  );
}

export default function BottomWidgetDock({
  vm,
  progressions,
  onPick,
}: {
  vm: TradingAgentHQViewModel;
  progressions: Record<AgentId, AgentProgression>;
  onPick: (id: AgentId) => void;
}) {
  const alerts = vm.bottomLog.filter((entry) => entry.type === "ALERT");
  const fills = vm.bottomLog.filter((entry) => entry.type === "FILL_RESULT");
  const decisions = vm.bottomLog.filter((entry) => entry.type === "DECISION");
  const agentProgressions = listAgentProgressions(progressions);
  const activeMissions = listActiveMissions(progressions);
  const badges = agentProgressions.flatMap((agent) => agent.badges).filter((item, index, all) => all.findIndex((other) => other.name === item.name) === index);
  const closedCycleStatus = vm.paper.closedCycles > 0 ? "INFO" : "DATA_GAP";
  const sampleStatus = vm.paper.sampleStatus === "SUFFICIENT" ? "INFO" : "DATA_GAP";
  const costStatus = vm.paper.costGateStatus === "PASS" ? "COST_PASS" : vm.paper.costGateStatus === "UNKNOWN" ? "PENDING" : "DATA_GAP";
  const closedCycleLabel = vm.paper.closedCycles === 0 ? "DATA_GAP" : "EVIDENCE";

  return (
    <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-[repeat(auto-fit,minmax(220px,1fr))]">
      <Widget title="Agent Progress">
        <div className="space-y-2">
          {agentProgressions.map((item) => (
            <AgentProgressRow key={item.agentId} item={item} onPick={onPick} />
          ))}
        </div>
        <div className="mt-2 rounded-md bg-amber-50 px-2 py-1.5 text-[10px] font-bold text-amber-900">
          Level = evidence maturity only. XP does not control trading.
        </div>
      </Widget>

      <Widget title="Active Missions">
        <div className="space-y-2">
          {activeMissions.map((item) => (
            <div key={item.id} className="min-w-0 rounded-md bg-white px-2 py-1.5 text-xs text-[#4d3b2d]">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate font-black text-[#2f241b]">{item.title}</div>
                  <div className="mt-0.5 text-[10px] text-[#8a735d]">{item.category}</div>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black ${missionTone(item.status)}`}>{item.status}</span>
              </div>
              <div className="mt-1 text-[11px] leading-relaxed text-[#6d5745]">{item.detail}</div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#ead6b9]">
                <div className="h-full rounded-full bg-[#7d5d3c]" style={{ width: `${item.progressPct}%` }} />
              </div>
            </div>
          ))}
        </div>
      </Widget>

      <Widget title="Badges / Rewards">
        <div className="flex flex-wrap gap-1.5">
          {badges.map((item) => (
            <span key={item.name} title={item.description} className={`rounded-full border px-2 py-1 text-[10px] font-black ${badgeTone(item.tone)}`}>
              {item.name}
            </span>
          ))}
        </div>
        <div className="mt-3 space-y-1.5 text-[11px] text-[#6d5745]">
          <div className="rounded-md bg-white px-2 py-1.5">Cost PASS != edge PASS.</div>
          <div className="rounded-md bg-white px-2 py-1.5">Paper fills only / not profitability.</div>
          <div className="rounded-md bg-white px-2 py-1.5">Closed cycles required before expectancy.</div>
          <div className="rounded-md bg-white px-2 py-1.5">M-0B remains BLOCKED.</div>
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
    </div>
  );
}
