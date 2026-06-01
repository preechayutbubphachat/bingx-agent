"use client";

import type { TradingAgentHQViewModel } from "@/lib/trading-agent-hq/viewModel";

function Stat({
  label,
  value,
  caption,
  tone = "neutral",
}: {
  label: string;
  value: string;
  caption?: string;
  tone?: "neutral" | "warn" | "danger" | "ok";
}) {
  const toneCls =
    tone === "danger"
      ? "text-red-800"
      : tone === "warn"
        ? "text-amber-800"
        : tone === "ok"
          ? "text-emerald-800"
          : "text-[#2f241b]";

  return (
    <div className="min-h-[92px] rounded-lg border border-[#3a2c21]/10 bg-[#fffaf1] p-3 shadow-sm">
      <span className="block text-[10px] font-bold uppercase tracking-wide text-[#8a735d]">{label}</span>
      <span className={`mt-1 block text-xl font-black leading-tight ${toneCls}`}>{value}</span>
      {caption && <span className="mt-1 block text-[11px] leading-snug text-[#7a6550]">{caption}</span>}
    </div>
  );
}

export default function TopHud({ vm }: { vm: TradingAgentHQViewModel }) {
  const safety = vm.safety;

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
      <Stat label="Market Mood" value={vm.topHud.marketMood} caption="Public-safe signal only" tone="warn" />
      <Stat
        label="Paper Equity"
        value={vm.topHud.simEquity == null ? "Unavailable" : String(vm.topHud.simEquity)}
        caption="No account balance exposed"
      />
      <Stat
        label="Paper PnL"
        value={vm.topHud.dailyPnl == null ? "Unavailable" : String(vm.topHud.dailyPnl)}
        caption="Not live PnL"
      />
      <Stat label="Risk Heat" value={vm.topHud.riskHeat} caption="Safety posture" tone={vm.topHud.riskHeat === "CALM" ? "ok" : "warn"} />
      <Stat label="Agents Active" value={`${vm.topHud.agentsActive}/6`} caption="Visual workers" />
      <Stat label="Paper Fills" value={`${vm.paper.totalOrderFilled}`} caption="Not profitability" tone={vm.paper.totalOrderFilled > 0 ? "ok" : "warn"} />
      <Stat
        label="Closed Cycles"
        value={`${vm.paper.closedCycles}`}
        caption={vm.paper.closedCycles === 0 ? "DATA_GAP, not edge" : "Evidence present"}
        tone={vm.paper.closedCycles === 0 ? "warn" : "ok"}
      />
      <Stat label="Gate" value={safety.phase} caption={`approval: ${safety.exchangeManualApproval}`} tone="danger" />
    </div>
  );
}
