import type { CafeAgent } from "@/lib/trading-cafe-hq/mockData";

export default function SelectedAgentPanel({ agent }: { agent: CafeAgent }) {
  return (
    <aside className="rounded-2xl border border-[#bd8245]/70 bg-[#fff8ec] p-3 shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-xs font-black uppercase tracking-wide text-[#5f4935]">⭐ Selected Agent</h2>
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-black text-amber-800">read-only</span>
      </div>
      <div className="grid grid-cols-[96px_minmax(0,1fr)] gap-3 xl:grid-cols-1">
        <div className="flex h-28 w-24 items-center justify-center rounded-xl bg-[#f3dfbd] ring-1 ring-[#d4a86f] xl:mx-auto xl:h-36 xl:w-36">
          <div className="h-28 w-28 bg-contain bg-center bg-no-repeat" style={{ backgroundImage: `url(${agent.sprite})` }} aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <h3 className="truncate text-xl font-black text-[#2f241b]">{agent.name}</h3>
          <p className="text-xs font-bold text-[#7a5532]">{agent.role}</p>
          <div className="mt-3 flex items-center gap-2">
            <span className="text-xs font-black text-[#5f4935]">Lv. {agent.level}</span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-[#ead7b8]">
              <div className="h-full rounded-full bg-purple-600" style={{ width: `${agent.xpPercent}%` }} />
            </div>
            <span className="text-xs font-black tabular-nums text-[#5f4935]">{agent.xpPercent}%</span>
          </div>
        </div>
      </div>

      <div className="mt-3 grid gap-2">
        <div className="rounded-xl border border-[#e2b77d] bg-white p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black text-[#5f4935]">Mood</span>
            <span className="text-xs font-bold text-emerald-700">{agent.moodLabel}</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#ead7b8]">
            <div className="h-full rounded-full bg-emerald-500" style={{ width: `${agent.moodScore}%` }} />
          </div>
        </div>

        <div className="rounded-xl border border-[#e2b77d] bg-white p-3">
          <div className="text-xs font-black text-[#5f4935]">Current Task</div>
          <div className="mt-1 text-sm font-bold text-[#2f241b]">{agent.subtitle}</div>
          <p className="mt-1 text-xs leading-relaxed text-[#6d5745]">{agent.currentTask}</p>
        </div>

        <div className="rounded-xl border border-[#e2b77d] bg-white p-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs font-black text-[#5f4935]">Skill</div>
              <div className="text-sm font-bold text-[#2f241b]">{agent.skillName}</div>
            </div>
            <span className="rounded-full bg-purple-100 px-2 py-1 text-xs font-black text-purple-800">Lv. {agent.skillLevel}</span>
          </div>
        </div>

        <div className="rounded-xl border border-[#e2b77d] bg-white p-3">
          <div className="flex items-center justify-between text-sm">
            <span className="font-black text-[#5f4935]">Today Result</span>
            <span className="font-black text-emerald-700">{agent.todayPnl}</span>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2 text-xs font-bold text-[#6d5745]">
            <span>Signals: {agent.signalsCount}</span>
            <span>Accuracy: {agent.accuracyPercent}%</span>
          </div>
        </div>

        <button type="button" className="min-h-11 rounded-xl bg-purple-700 px-3 py-2 text-sm font-black text-white shadow hover:bg-purple-800 focus:outline-none focus:ring-2 focus:ring-purple-900">
          View Agent Profile
        </button>
      </div>
    </aside>
  );
}
