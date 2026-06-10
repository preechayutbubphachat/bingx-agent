"use client";

// dashboard/components/trading-agent-hq/TradingCafeKpiCard.tsx
// Phase UI-2 — a single polished KPI summary card. Presentational only.

export type KpiTone = "neutral" | "green" | "amber" | "red" | "teal" | "info";

export type KpiItem = {
  id: string;
  label: string;
  value: string;
  sub?: string;
  tone?: KpiTone;
  icon?: string;
};

function toneAccent(tone: KpiTone): { bar: string; value: string } {
  switch (tone) {
    case "green":
      return { bar: "bg-[#4caf74]", value: "text-[#2f7a51]" };
    case "amber":
      return { bar: "bg-[#f0a737]", value: "text-[#a9701a]" };
    case "red":
      return { bar: "bg-[#e75b52]", value: "text-[#b23a33]" };
    case "teal":
      return { bar: "bg-[#1f9d92]", value: "text-[#1a766d]" };
    case "info":
      return { bar: "bg-[#3aa7d8]", value: "text-[#2980a7]" };
    default:
      return { bar: "bg-[#c9b48f]", value: "text-[#2b2118]" };
  }
}

export default function TradingCafeKpiCard({ item }: { item: KpiItem }) {
  const accent = toneAccent(item.tone ?? "neutral");
  return (
    <div className="relative overflow-hidden rounded-xl border border-[#e5d5bf] bg-[#fffaf1] p-3 shadow-sm">
      <span className={`absolute inset-y-0 left-0 w-1 ${accent.bar}`} aria-hidden="true" />
      <div className="flex items-center justify-between gap-2 pl-1.5">
        <span className="text-[10px] font-black uppercase tracking-wide text-[#7a6a59]">{item.label}</span>
        {item.icon ? <span className="text-[14px]">{item.icon}</span> : null}
      </div>
      <div className={`mt-1 truncate pl-1.5 text-[18px] font-black leading-tight ${accent.value}`} title={item.value}>
        {item.value}
      </div>
      {item.sub ? <div className="truncate pl-1.5 text-[10px] font-bold text-[#9a8a72]">{item.sub}</div> : null}
    </div>
  );
}
