"use client";

import { useState } from "react";
import type { AgentVM, PaperVM } from "@/lib/trading-agent-hq/viewModel";
import type { AgentProgression, AgentBadge, AgentSkill, Mission, MissionStatus } from "@/lib/trading-agent-hq/progression";
import { AGENT_PLACEMENTS } from "@/lib/trading-agent-hq/sceneConfig";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 border-b border-[#3a2c21]/10 py-1.5 text-xs">
      <span className="text-[#7a6550]">{label}</span>
      <span className="text-right font-bold text-[#2f241b]">{value}</span>
    </div>
  );
}

function statusTone(status: MissionStatus) {
  if (status === "DONE") return "bg-emerald-100 text-emerald-800";
  if (status === "IN_PROGRESS") return "bg-sky-100 text-sky-800";
  if (status === "DATA_GAP" || status === "WARNING") return "bg-amber-100 text-amber-800";
  if (status === "NOT_APPROVED") return "bg-orange-100 text-orange-800";
  return "bg-red-100 text-red-800";
}

function skillTone(state: AgentSkill["state"]) {
  if (state === "online") return "bg-emerald-100 text-emerald-800";
  if (state === "watching") return "bg-sky-100 text-sky-800";
  if (state === "data_gap") return "bg-amber-100 text-amber-800";
  return "bg-stone-200 text-stone-700";
}

function badgeTone(tone: AgentBadge["tone"]) {
  if (tone === "safe") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (tone === "info") return "border-sky-200 bg-sky-50 text-sky-800";
  if (tone === "warning") return "border-amber-200 bg-amber-50 text-amber-900";
  return "border-red-200 bg-red-50 text-red-800";
}

function DetailList({ label, items }: { label: string; items: string[] }) {
  return (
    <div>
      <div className="text-[10px] font-black uppercase text-[#8a735d]">{label}</div>
      {items.length ? (
        <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[11px] text-[#5b4432]">
          {items.map((item) => <li key={item}>{item}</li>)}
        </ul>
      ) : (
        <div className="mt-1 text-[11px] text-[#8a735d]">No gap currently recorded.</div>
      )}
    </div>
  );
}

function MissionDetailPanel({ mission }: { mission: Mission }) {
  return (
    <div className="mt-2 rounded-lg border border-[#3a2c21]/10 bg-[#fffaf1] p-3 text-[11px]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="font-black text-[#2f241b]">{mission.title}</div>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${statusTone(mission.status)}`}>{mission.status}</span>
      </div>
      <div className="mt-1 text-[#6d5745]">{mission.category}</div>
      <div className="mt-3 grid gap-2">
        <DetailList label="Complete evidence" items={mission.completeEvidence} />
        <DetailList label="Missing evidence" items={mission.missingEvidence} />
        <div><span className="font-black text-[#2f241b]">Why it matters: </span>{mission.whyItMatters}</div>
        <div><span className="font-black text-[#2f241b]">Next safe action: </span>{mission.nextSafeAction}</div>
        <div className="rounded-md bg-amber-50 px-2 py-1.5 font-bold text-amber-900">{mission.safetyNote}</div>
      </div>
    </div>
  );
}

function BadgeDetailPanel({ badge }: { badge: AgentBadge }) {
  return (
    <div className={`mt-2 rounded-lg border p-3 text-[11px] ${badgeTone(badge.tone)}`}>
      <div className="font-black">{badge.name}</div>
      <div className="mt-1">{badge.description}</div>
      <div className="mt-2"><span className="font-black">Evidence source: </span>{badge.evidenceSource}</div>
      <div className="mt-1"><span className="font-black">Does NOT mean: </span>{badge.doesNotMean}</div>
    </div>
  );
}

export default function RightInspector({
  agent,
  progression,
  paper,
  onClose,
  onDebug,
}: {
  agent: AgentVM | null;
  progression: AgentProgression | null;
  paper: PaperVM;
  onClose: () => void;
  onDebug: () => void;
}) {
  const [selectedMissionId, setSelectedMissionId] = useState<string | null>(null);
  const [selectedBadgeName, setSelectedBadgeName] = useState<string | null>(null);
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
  const activeMission = progression?.missions.find((item) => item.status !== "DONE") ?? progression?.missions[0];
  const inspectedMission = progression?.missions.find((item) => item.id === selectedMissionId) ?? activeMission;
  const inspectedBadge = progression?.badges.find((item) => item.name === selectedBadgeName) ?? progression?.badges[0];

  return (
    <div className="flex h-full max-h-[calc(100vh-220px)] min-h-[360px] w-full min-w-0 flex-col overflow-hidden rounded-lg border border-[#3a2c21]/10 bg-[#fffaf1] p-4 shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <div className="min-w-0">
          <h3 className="truncate text-base font-black text-[#2f241b]">{progression?.name ?? place?.label ?? agent.id}</h3>
          <p className="text-[11px] text-[#8a735d]">{progression?.role ?? place?.role ?? "Agent desk"}</p>
        </div>
        <button type="button" onClick={onClose} className="rounded px-2 py-0.5 text-xs text-[#8a735d] hover:bg-white">
          Reset
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        {progression ? (
          <div className="mb-3 rounded-lg border border-[#3a2c21]/10 bg-white p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="rounded-full bg-[#2f241b] px-2 py-1 text-[10px] font-black text-[#f8ead3]">LV {progression.level}</span>
              <span className="text-[10px] font-black uppercase text-[#8a735d]">{progression.mood} / {progression.status}</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#ead6b9]">
              <div className="h-full rounded-full bg-[#7d5d3c]" style={{ width: `${progression.xpPct}%` }} />
            </div>
            <div className="mt-1 flex justify-between text-[10px] font-bold text-[#6d5745]">
              <span>{progression.xp} XP</span>
              <span>{progression.xpToNextLevel} XP to next</span>
            </div>
            <details className="mt-2 rounded-md bg-amber-50 px-2 py-1.5 text-[11px] text-amber-900">
              <summary className="cursor-pointer font-black">XP help</summary>
              <div className="mt-1 space-y-0.5 font-bold">
                <div>XP = evidence maturity only.</div>
                <div>XP does not control trading.</div>
                <div>Levels do not unlock live trading.</div>
                <div>Closed cycles are required before expectancy.</div>
                <div>Cost PASS is not edge PASS.</div>
              </div>
            </details>
          </div>
        ) : null}

        {activeMission ? (
          <div className="mb-3 rounded-lg border border-[#3a2c21]/10 bg-white p-3">
            <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
              <span className="text-[10px] font-black uppercase text-[#8a735d]">Current mission</span>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${statusTone(activeMission.status)}`}>{activeMission.status}</span>
            </div>
            <button
              type="button"
              onClick={() => setSelectedMissionId(activeMission.id)}
              className="block w-full rounded-md text-left hover:bg-[#fff4df]"
            >
              <div className="text-xs font-black text-[#2f241b]">{activeMission.title}</div>
              <div className="mt-1 text-[11px] leading-relaxed text-[#6d5745]">{activeMission.detail}</div>
            </button>
            {inspectedMission ? <MissionDetailPanel mission={inspectedMission} /> : null}
          </div>
        ) : null}

        <Row label="Status" value={agent.status} />
        <Row label="Current task" value={agent.currentTask} />
        <Row label="Last action" value={agent.lastAction} />
        <Row label="Metric" value={agent.metric ?? "-"} />
        <Row label="Confidence / risk" value={agent.confidence ?? "-"} />
        <Row label="Animation" value={agent.animation} />

        {progression ? (
          <>
            <div className="mt-3">
              <div className="mb-1 text-[10px] font-black uppercase text-[#8a735d]">Skills</div>
              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 xl:grid-cols-1">
                {progression.skills.map((skill) => (
                  <div key={skill.name} className="min-w-0 rounded-md bg-white px-2 py-1.5 text-[11px]">
                    <div className="truncate font-bold text-[#2f241b]">{skill.name}</div>
                    <span className={`mt-1 inline-block rounded-full px-1.5 py-0.5 text-[9px] font-black uppercase ${skillTone(skill.state)}`}>{skill.state}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-3">
              <div className="mb-1 text-[10px] font-black uppercase text-[#8a735d]">Badges / rewards</div>
              <div className="flex flex-wrap gap-1.5">
                {progression.badges.map((item) => (
                  <button
                    key={item.name}
                    type="button"
                    title={item.description}
                    onClick={() => setSelectedBadgeName(item.name)}
                    className={`rounded-full border px-2 py-1 text-[10px] font-black transition hover:scale-[1.02] ${badgeTone(item.tone)}`}
                  >
                    {item.name}
                  </button>
                ))}
              </div>
              {inspectedBadge ? <BadgeDetailPanel badge={inspectedBadge} /> : null}
            </div>

            <div className="mt-3 rounded-lg border border-[#3a2c21]/10 bg-white p-3 text-[11px] text-[#6d5745]">
              <div className="font-black uppercase text-[#2f241b]">Evidence quality</div>
              <div className="mt-1">quality={progression.evidenceQuality} | safety={progression.safetyState} | updated={progression.lastUpdated}</div>
              <ul className="mt-2 list-disc space-y-1 pl-4">
                {progression.blockedReasons.slice(0, 4).map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            </div>
          </>
        ) : null}

        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-[11px] text-amber-900">
          <div className="font-black uppercase">Paper evidence honesty</div>
          <div className="mt-1">
            paper fills only={paper.totalOrderFilled} | closedCycles={paper.closedCycles} / {closedCycleLabel} | edge={paper.edgeStatus}
          </div>
          <div className="mt-1">cost: {paper.costGateStatus} | Cost PASS != edge PASS | paper fills only / not profitability</div>
          {paper.closedCycles === 0 ? <div className="mt-1 font-bold">DATA_GAP: closed cycle evidence is still missing.</div> : null}
          <div className="mt-1 font-bold">M-0B remains BLOCKED.</div>
        </div>

        <button
          type="button"
          onClick={onDebug}
          className="mt-3 w-full rounded-lg bg-[#2f241b] px-3 py-2 text-xs font-bold text-[#f8ead3] hover:bg-[#473527]"
        >
          Advanced / Debug to /public
        </button>
      </div>
    </div>
  );
}
