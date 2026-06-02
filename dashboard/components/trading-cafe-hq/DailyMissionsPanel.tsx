import type { CafeMission } from "@/lib/trading-cafe-hq/mockData";
import PanelShell from "./PanelShell";

function MissionRow({ mission }: { mission: CafeMission }) {
  const pct = Math.min(100, (mission.current / Math.max(1, mission.target)) * 100);
  return (
    <li className="border-b border-[#ead7b8] py-2 last:border-0">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="font-bold text-[#3f2f22]">{mission.title}</span>
        <span className="shrink-0 font-black tabular-nums text-[#5f4935]">{mission.current.toLocaleString()} / {mission.target.toLocaleString()}</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[#ead7b8]">
        <div className={`h-full rounded-full ${mission.complete ? "bg-emerald-500" : "bg-purple-500"}`} style={{ width: `${pct}%` }} />
      </div>
    </li>
  );
}

export default function DailyMissionsPanel({ missions, resetLabel }: { missions: CafeMission[]; resetLabel: string }) {
  return (
    <PanelShell title="Daily Missions" icon="📋">
      {missions.length ? (
        <>
          <ul>
            {missions.map((mission) => <MissionRow key={mission.id} mission={mission} />)}
          </ul>
          <div className="mt-2 flex items-center justify-between rounded-xl bg-[#fff1d6] px-2 py-1.5 text-xs font-bold text-[#6d5745]">
            <span>🕘 Resets in {resetLabel}</span>
            <span>🎁</span>
          </div>
        </>
      ) : (
        <div className="rounded-xl bg-[#fff1d6] p-3 text-xs font-bold text-[#7a5532]">No active task. This agent is waiting for the next signal.</div>
      )}
    </PanelShell>
  );
}
