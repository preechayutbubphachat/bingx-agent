"use client";

// dashboard/components/trading-agent-hq/TradingCafeBottomPanels.tsx
// Phase UI-2 — bottom information panels mapped from the existing read-only VM.
// SAFETY: presentation only. No new network calls, no invented trading metrics.

import type { ReactNode } from "react";
import type { TradingAgentHQViewModel, AgentId } from "@/lib/trading-agent-hq/viewModel";

const NA = "ไม่มีข้อมูล";

// UI-2.2: mockup-style panel header — icon chip + title, divider below, read-only hint.
function Panel({ title, icon, children }: { title: string; icon: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-[#e5d5bf] bg-[#fffaf1] p-3 shadow-sm">
      <h3 className="flex items-center gap-2 text-[12px] font-black text-[#2b2118]">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-[#f3e8d6] text-[13px]" aria-hidden="true">
          {icon}
        </span>
        <span className="min-w-0 truncate">{title}</span>
        <span className="ml-auto shrink-0 text-[9px] font-bold text-[#b3a285]">อ่านอย่างเดียว</span>
      </h3>
      <div className="mb-2 mt-2 border-t border-[#efe2cd]" aria-hidden="true" />
      {children}
    </section>
  );
}

function statusDot(status: string): string {
  if (["error", "alert"].includes(status)) return "bg-[#e75b52]";
  if (["paused", "unknown"].includes(status)) return "bg-[#c9b48f]";
  return "bg-[#4caf74]";
}

const AGENT_LABEL: Record<string, string> = {
  grid_bot: "Grid Bot",
  trend_bot: "Trend Bot",
  risk_manager: "Risk Manager",
  news_analyst: "News Analyst",
  market_regime: "Market Regime",
  memory_brain: "Memory / Knowledge",
};

export default function TradingCafeBottomPanels({ vm }: { vm: TradingAgentHQViewModel }) {
  const agents = Object.values(vm.agents);
  const dr = vm.paper.dynamicRegrid;
  const cmr = vm.paper.canonicalMarketRegime;
  const r = vm.paper.trendPaperEvidenceRunner;
  const logs = vm.bottomLog.slice(0, 6);

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
      <Panel title="Agent Overview" icon="🤖">
        <ul className="flex flex-col gap-1">
          {agents.map((a) => (
            <li key={a.id} className="flex items-center gap-2 text-[11px]">
              <span className={`h-2 w-2 shrink-0 rounded-full ${statusDot(a.status)}`} />
              <span className="font-bold text-[#2b2118]">{AGENT_LABEL[a.id as AgentId] ?? a.id}</span>
              <span className="ml-auto truncate text-[10px] font-medium text-[#9a8a72]">{a.status}</span>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel title="Paper Readiness" icon="📝">
        <dl className="grid grid-cols-2 gap-1.5 text-[11px]">
          <div className="rounded-md border border-[#e5d5bf] bg-white/70 px-2 py-1">
            <dt className="text-[9px] font-black text-[#7a6a59]">Closed Cycles</dt>
            <dd className="font-black text-[#2b2118]">{vm.paper.closedCycles}</dd>
          </div>
          <div className="rounded-md border border-[#e5d5bf] bg-white/70 px-2 py-1">
            <dt className="text-[9px] font-black text-[#7a6a59]">Trend Trades</dt>
            <dd className="font-black text-[#2b2118]">{r.trendClosedTrades}/{r.targetClosedTrades}</dd>
          </div>
          <div className="rounded-md border border-[#e5d5bf] bg-white/70 px-2 py-1">
            <dt className="text-[9px] font-black text-[#7a6a59]">Sample</dt>
            <dd className="truncate font-black text-[#2b2118]">{r.sampleStatus ?? NA}</dd>
          </div>
          <div className="rounded-md border border-[#e5d5bf] bg-white/70 px-2 py-1">
            <dt className="text-[9px] font-black text-[#7a6a59]">Cost Gate</dt>
            <dd className="font-black text-[#2b2118]">{vm.paper.costGateStatus}</dd>
          </div>
        </dl>
      </Panel>

      <Panel title="Recent Logs" icon="📜">
        {logs.length ? (
          <ul className="flex flex-col gap-1">
            {logs.map((e, i) => (
              <li key={i} className="truncate text-[10px] text-[#5b4432]">
                <span className="font-bold text-[#7a6a59]">{e.ts}</span> · <span className="font-bold">{e.type}</span> · {e.text}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[10px] text-[#9a8a72]">{NA}</p>
        )}
      </Panel>

      <Panel title="Market Snapshot" icon="🌤️">
        <dl className="grid grid-cols-2 gap-1.5 text-[11px]">
          <div className="rounded-md border border-[#e5d5bf] bg-white/70 px-2 py-1">
            <dt className="text-[9px] font-black text-[#7a6a59]">Regime</dt>
            <dd className="truncate font-black text-[#2b2118]">{cmr.regime ?? NA}</dd>
          </div>
          <div className="rounded-md border border-[#e5d5bf] bg-white/70 px-2 py-1">
            <dt className="text-[9px] font-black text-[#7a6a59]">Direction</dt>
            <dd className="truncate font-black text-[#2b2118]">{cmr.direction ?? NA}</dd>
          </div>
          <div className="rounded-md border border-[#e5d5bf] bg-white/70 px-2 py-1">
            <dt className="text-[9px] font-black text-[#7a6a59]">Price vs Grid</dt>
            <dd className="truncate font-black text-[#2b2118]">{dr.priceVsGrid ?? NA}</dd>
          </div>
          <div className="rounded-md border border-[#e5d5bf] bg-white/70 px-2 py-1">
            <dt className="text-[9px] font-black text-[#7a6a59]">Loop State</dt>
            <dd className="truncate font-black text-[#2b2118]">{dr.paperLoopState ?? NA}</dd>
          </div>
        </dl>
      </Panel>

      <Panel title="Notes & Plan" icon="🗒️">
        <ul className="flex flex-col gap-1 text-[11px] text-[#5b4432]">
          <li>• ปล่อย paper loop + evidence runner รันต่อ (ทุก 15 นาที, paper-only)</li>
          <li>• เป้าหมายถัดไป: closed trades ครบ {r.targetClosedTrades} เพื่อรีวิว edge</li>
          <li>• เงินจริง/คำสั่ง exchange ปิดอยู่จนกว่าจะอนุมัติด้วยมือ</li>
        </ul>
      </Panel>

      <Panel title="System Health" icon="❤️">
        <div className="flex flex-col gap-1.5 text-[11px]">
          <div className="flex items-center justify-between">
            <span className="font-bold text-[#7a6a59]">Phase</span>
            <span className="font-black text-[#2b2118]">{vm.safety.phase}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="font-bold text-[#7a6a59]">Data Source</span>
            <span className="font-black text-[#2b2118]">{vm.meta.source}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="font-bold text-[#7a6a59]">Stale</span>
            <span className="font-black text-[#2b2118]">{vm.meta.isStale ? "ใช่" : "ไม่"}</span>
          </div>
        </div>
      </Panel>
    </div>
  );
}
