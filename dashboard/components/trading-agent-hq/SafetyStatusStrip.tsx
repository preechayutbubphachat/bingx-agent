"use client";

import type { TradingAgentHQViewModel } from "@/lib/trading-agent-hq/viewModel";

function Pill({ label, value, tone }: { label: string; value: string; tone: "safe" | "block" | "warn" }) {
  const cls =
    tone === "safe"
      ? "border-emerald-300 bg-emerald-50 text-emerald-800"
      : tone === "block"
        ? "border-red-300 bg-red-50 text-red-800"
        : "border-amber-300 bg-amber-50 text-amber-800";

  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-bold ${cls}`}>
      <span className="text-[10px] uppercase opacity-70">{label}</span>
      {value}
    </span>
  );
}

export default function SafetyStatusStrip({
  vm,
  state,
  error,
  live,
  onRefresh,
}: {
  vm: TradingAgentHQViewModel;
  state: string;
  error: string | null;
  live: boolean;
  onRefresh: () => void;
}) {
  const safety = vm.safety;

  return (
    <section className="rounded-lg border border-[#4a3525]/20 bg-[#2b2118] px-3 py-3 text-[#f8ead3] shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <div className="mr-auto min-w-[220px]">
          <div className="text-[11px] font-bold uppercase tracking-wide text-[#d8b66f]">Trading Caffe Command Center</div>
          <h1 className="text-xl font-black leading-tight sm:text-2xl">Agent HQ</h1>
        </div>
        <Pill label="Phase" value={safety.phase} tone="block" />
        <Pill label="Live" value={safety.liveTradingEnabled ? "ON" : "OFF"} tone={safety.liveTradingEnabled ? "block" : "safe"} />
        <Pill
          label="Orders"
          value={safety.orderPlacementEnabled ? "ON" : "OFF"}
          tone={safety.orderPlacementEnabled ? "block" : "safe"}
        />
        <Pill label="Approval" value={safety.exchangeManualApproval} tone="warn" />
        <button
          type="button"
          onClick={onRefresh}
          className="rounded-lg border border-[#d8b66f]/40 bg-[#3a2b20] px-3 py-2 text-xs font-bold text-[#f8ead3] hover:bg-[#473527]"
        >
          {state === "loading" ? "Refreshing" : "Refresh"}
        </button>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-[#d8c8b4]">
        <span>source: {vm.meta.source}</span>
        <span>updated: {vm.meta.lastUpdate}</span>
        <span>{live ? "public-safe endpoints active" : "mock/fallback display"}</span>
        {vm.meta.isStale && <span className="font-bold text-amber-300">stale</span>}
        {error && <span className="font-bold text-red-300">endpoint: {error}</span>}
      </div>
    </section>
  );
}
