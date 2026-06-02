"use client";

import { useEffect, useMemo, useState } from "react";
import type { CafeAgentId, TradingCafeHqMock } from "@/lib/trading-cafe-hq/mockData";
import { TRADING_CAFE_HQ_MOCK } from "@/lib/trading-cafe-hq/mockData";
import { useTradingCafeHQ } from "@/lib/trading-cafe-hq/useTradingCafeHQ";
import TopStatusBar from "./TopStatusBar";
import SidebarNav from "./SidebarNav";
import MainCafeCanvas from "./MainCafeCanvas";
import SelectedAgentPanel from "./SelectedAgentPanel";
import DailyMissionsPanel from "./DailyMissionsPanel";
import AlertsPanel from "./AlertsPanel";
import LatestTradesPanel from "./LatestTradesPanel";
import DecisionLogPanel from "./DecisionLogPanel";
import RewardsXPPanel from "./RewardsXPPanel";
import DebugModeCard from "./DebugModeCard";

const DEFAULT_AGENT_ID: CafeAgentId = "trend_bot";

export default function TradingCafeHQPage({ data: initialData = TRADING_CAFE_HQ_MOCK }: { data?: TradingCafeHqMock }) {
  const { data, state, error, refresh } = useTradingCafeHQ(initialData);
  const [selectedAgentId, setSelectedAgentId] = useState<CafeAgentId>(DEFAULT_AGENT_ID);
  const selectedAgent = useMemo(
    () => data.agents.find((agent) => agent.id === selectedAgentId) ?? data.agents[0],
    [data.agents, selectedAgentId],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedAgentId(DEFAULT_AGENT_ID);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <main className="min-h-screen bg-[#edf3f8] px-2 pb-24 pt-2 text-[#2f241b] md:px-4 md:pb-4">
      <div className="mx-auto flex max-w-[1680px] flex-col gap-3">
        <TopStatusBar data={data} />

        <section className="grid grid-cols-1 gap-3 xl:grid-cols-[170px_minmax(0,1fr)_330px]">
          <SidebarNav data={data} />

          <div className="grid min-w-0 gap-3">
            <div className="rounded-2xl border border-[#bd8245]/70 bg-[#fff8ec] p-2 text-xs font-bold text-[#6d5745] shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>Source: {data.sourceLabel}</span>
                <span className={`rounded-full px-2 py-0.5 font-black ${
                  state === "error"
                    ? "bg-red-100 text-red-800"
                    : state === "loading"
                      ? "bg-blue-100 text-blue-800"
                      : "bg-emerald-100 text-emerald-800"
                }`}>
                  adapter={state}
                </span>
                <span className="rounded-full bg-red-100 px-2 py-0.5 font-black text-red-800">{data.safety.phase}</span>
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-black text-emerald-800">readOnly={String(data.safety.readOnly)}</span>
                <span className="rounded-full bg-amber-100 px-2 py-0.5 font-black text-amber-800">{data.placeholders.staleTitle}</span>
                <button
                  type="button"
                  onClick={refresh}
                  className="rounded-full border border-[#d4a86f] bg-white px-2 py-0.5 font-black text-[#5f4935] hover:bg-[#f3dfbd] focus:outline-none focus:ring-2 focus:ring-[#2f241b]"
                >
                  Refresh read-only data
                </button>
              </div>
              {error ? <div className="mt-2 rounded-lg bg-red-50 px-2 py-1 text-red-800">Endpoint note: {error}</div> : null}
            </div>

            <MainCafeCanvas data={data} selectedAgentId={selectedAgent.id} onSelectAgent={setSelectedAgentId} />
          </div>

          <div className="min-w-0">
            <SelectedAgentPanel agent={selectedAgent} />
          </div>
        </section>

        <section className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_1fr_1fr_150px]">
          <DailyMissionsPanel missions={data.missions} resetLabel="08:34:12" />
          <AlertsPanel alerts={data.alerts} emptyCopy={data.placeholders.emptyAlerts} />
          <LatestTradesPanel trades={data.trades} emptyCopy={data.placeholders.emptyTrades} />
          <DecisionLogPanel decisions={data.decisions} emptyCopy={data.placeholders.emptyDecisions} />
          <RewardsXPPanel level={data.cafeLevel} rewards={data.rewards} />
          <DebugModeCard data={data} />
        </section>

        <section className="rounded-2xl border border-[#bd8245]/70 bg-[#fff8ec] p-3 text-xs font-bold leading-relaxed text-[#6d5745]">
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full bg-red-100 px-2 py-1 text-red-800">Live trading: OFF</span>
            <span className="rounded-full bg-red-100 px-2 py-1 text-red-800">Orders: OFF</span>
            <span className="rounded-full bg-orange-100 px-2 py-1 text-orange-800">Approval: not_approved</span>
            <span className="rounded-full bg-amber-100 px-2 py-1 text-amber-900">closedCycles={data.safety.closedCycles} / {data.safety.closedCycleLabel}</span>
          </div>
          <p className="mt-2">
            Static UI shell only. Mock data is isolated in <code className="rounded bg-[#f3dfbd] px-1">dashboard/lib/trading-cafe-hq/mockData.ts</code>.
            This page does not call trading APIs, does not write runtime files, and does not unlock M-0B.
          </p>
        </section>
      </div>
    </main>
  );
}
