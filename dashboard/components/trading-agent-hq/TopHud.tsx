// dashboard/components/trading-agent-hq/TopHud.tsx
"use client";

import type { TradingAgentHQViewModel } from "@/lib/trading-agent-hq/viewModel";

function Stat({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "neutral" | "warn" | "danger" | "ok" }) {
  const toneCls =
    tone === "danger" ? "text-red-700" : tone === "warn" ? "text-amber-700" : tone === "ok" ? "text-emerald-700" : "text-neutral-800";
  return (
    <div className="flex min-w-[88px] flex-col">
      <span className="text-[10px] uppercase tracking-wide text-neutral-500">{label}</span>
      <span className={`text-sm font-semibold ${toneCls}`}>{value}</span>
    </div>
  );
}

export default function TopHud({ vm }: { vm: TradingAgentHQViewModel }) {
  const s = vm.safety;
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-2xl bg-white/80 px-4 py-3 ring-1 ring-black/10">
      <Stat label="Market Mood" value={vm.topHud.marketMood} tone="warn" />
      <Stat label="Sim Equity" value={vm.topHud.simEquity == null ? "—" : String(vm.topHud.simEquity)} />
      <Stat label="Daily PnL" value={vm.topHud.dailyPnl == null ? "—" : String(vm.topHud.dailyPnl)} />
      <Stat label="Risk Heat" value={vm.topHud.riskHeat} tone="warn" />
      <Stat label="Agents Active" value={`${vm.topHud.agentsActive}/6`} />
      <Stat label="Last Update" value={vm.meta.lastUpdate} />

      {/* truthfulness badges — always honest, never live-ready */}
      <div className="ml-auto flex flex-wrap items-center gap-1.5">
        <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700">{s.phase}</span>
        <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-medium text-neutral-600">
          live: {s.liveTradingEnabled ? "ON" : "OFF"}
        </span>
        <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-medium text-neutral-600">
          orders: {s.orderPlacementEnabled ? "ON" : "OFF"}
        </span>
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">
          approval: {s.exchangeManualApproval}
        </span>
        {vm.meta.source === "mock" && (
          <span className="rounded-full bg-fuchsia-100 px-2 py-0.5 text-[10px] font-semibold text-fuchsia-700">MOCK DATA</span>
        )}
      </div>
    </div>
  );
}
