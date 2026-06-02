import type { CafeAgentId, TradingCafeHqMock } from "@/lib/trading-cafe-hq/mockData";
import AgentStation from "./AgentStation";

const BACKGROUND_SRC = "/assets/trading-agent-hq/background/cafe_scene.png";

export default function MainCafeCanvas({
  data,
  selectedAgentId,
  onSelectAgent,
  onClearSelection,
}: {
  data: TradingCafeHqMock;
  selectedAgentId: CafeAgentId | null;
  onSelectAgent: (id: CafeAgentId) => void;
  onClearSelection: () => void;
}) {
  return (
    <>
      <section className="hidden min-h-[620px] min-w-0 overflow-hidden rounded-2xl border border-[#bd8245]/70 bg-[#7b4b24] p-2 shadow-sm md:block">
        <div
          onClick={onClearSelection}
          className="relative h-full min-h-[596px] overflow-hidden rounded-xl bg-cover bg-center"
          style={{ backgroundImage: `linear-gradient(rgba(64,35,15,0.08), rgba(64,35,15,0.16)), url(${BACKGROUND_SRC})` }}
        >
          <div className="absolute left-1/2 top-[8%] -translate-x-1/2 rounded-xl border border-[#d4a86f]/70 bg-[#fff8ec]/90 px-6 py-3 text-center shadow">
            <div className="text-xl font-black tracking-tight text-[#2f241b]">TRADING CAFFEE HQ</div>
            <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#7a5532]">AI Agent Command Center</div>
          </div>

          {data.agents.map((agent) => (
            <AgentStation key={agent.id} agent={agent} selected={selectedAgentId === agent.id} onSelect={onSelectAgent} />
          ))}

          <div className="absolute bottom-[7%] left-1/2 hidden -translate-x-1/2 rounded-full border border-[#d4a86f]/70 bg-[#fff8ec]/80 px-8 py-5 text-center shadow md:block">
            <div className="text-lg font-black text-[#2f241b]">COFFEE TRADING CAFFEE HQ</div>
            <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#7a5532]">Read-only static UI</div>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-2 md:hidden">
        <div className="rounded-2xl border border-[#bd8245]/70 bg-[#fff8ec] p-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-black text-[#2f241b]">Agents</h2>
              <p className="text-xs font-bold text-[#7a5532]">6 / 6 Active - read-only</p>
            </div>
            <span className="rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-black text-emerald-800">READ ONLY</span>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2">
          {data.agents.map((agent) => (
            <AgentStation key={agent.id} agent={agent} selected={selectedAgentId === agent.id} compact onSelect={onSelectAgent} />
          ))}
        </div>
      </section>
    </>
  );
}
