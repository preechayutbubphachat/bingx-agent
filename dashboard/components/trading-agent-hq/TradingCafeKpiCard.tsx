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

// UI-2.2: tone drives the icon chip tint + value color (mockup-style KPI card).
function toneAccent(tone: KpiTone): { chip: string; value: string; dot: string } {
  switch (tone) {
    case "green":
      return { chip: "bg-emerald-100 text-emerald-800", value: "text-[#2f7a51]", dot: "bg-[#4caf74]" };
    case "amber":
      return { chip: "bg-amber-100 text-amber-900", value: "text-[#a9701a]", dot: "bg-[#f0a737]" };
    case "red":
      return { chip: "bg-red-100 text-red-800", value: "text-[#b23a33]", dot: "bg-[#e75b52]" };
    case "teal":
      return { chip: "bg-teal-100 text-teal-800", value: "text-[#1a766d]", dot: "bg-[#1f9d92]" };
    case "info":
      return { chip: "bg-sky-100 text-sky-800", value: "text-[#2980a7]", dot: "bg-[#3aa7d8]" };
    default:
      return { chip: "bg-[#f3e8d6] text-[#7a6a59]", value: "text-[#2b2118]", dot: "bg-[#c9b48f]" };
  }
}

export default function TradingCafeKpiCard({ item }: { item: KpiItem }) {
  const accent = toneAccent(item.tone ?? "neutral");
  return (
    <div className="rounded-xl border border-[#e5d5bf] bg-[#fffaf1] p-3 shadow-sm transition hover:shadow">
      {/* UI-2.2 mockup-style header: icon chip + label, status dot on the right */}
      <div className="flex items-center gap-2">
        {item.icon ? (
          <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[15px] ${accent.chip}`} aria-hidden="true">
            {item.icon}
          </span>
        ) : null}
        <span className="min-w-0 truncate text-[10px] font-black uppercase tracking-wide text-[#7a6a59]">{item.label}</span>
        <span className={`ml-auto h-2 w-2 shrink-0 rounded-full ${accent.dot}`} aria-hidden="true" />
      </div>
      <div className={`mt-2 truncate text-[19px] font-black leading-tight ${accent.value}`} title={item.value}>
        {item.value}
      </div>
      {item.sub ? <div className="mt-0.5 truncate text-[10px] font-bold text-[#9a8a72]">{item.sub}</div> : null}
    </div>
  );
}
