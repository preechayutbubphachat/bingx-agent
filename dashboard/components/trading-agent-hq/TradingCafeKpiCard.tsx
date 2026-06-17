"use client";

// dashboard/components/trading-agent-hq/TradingCafeKpiCard.tsx
// Phase UI-2 — a single polished KPI summary card. Presentational only.

import { hudPanelClass } from "@/lib/trading-agent-hq/missionControlVisual";

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
function toneAccent(tone: KpiTone): { chip: string; value: string; dot: string; border: string } {
  switch (tone) {
    case "green":
      return { chip: "border-emerald-300/40 bg-emerald-400/10 text-emerald-200", value: "text-emerald-200", dot: "bg-emerald-300", border: "border-emerald-300/30" };
    case "amber":
      return { chip: "border-amber-300/40 bg-amber-400/10 text-amber-200", value: "text-amber-200", dot: "bg-amber-300", border: "border-amber-300/30" };
    case "red":
      return { chip: "border-rose-300/40 bg-rose-400/10 text-rose-200", value: "text-rose-200", dot: "bg-rose-300", border: "border-rose-300/30" };
    case "teal":
      return { chip: "border-cyan-300/40 bg-cyan-400/10 text-cyan-200", value: "text-cyan-200", dot: "bg-cyan-300", border: "border-cyan-300/30" };
    case "info":
      return { chip: "border-blue-300/40 bg-blue-400/10 text-blue-200", value: "text-blue-200", dot: "bg-blue-300", border: "border-blue-300/30" };
    default:
      return { chip: "border-slate-500/40 bg-slate-800/80 text-slate-300", value: "text-slate-100", dot: "bg-slate-400", border: "border-slate-600/50" };
  }
}

function barTone(tone: KpiTone): string {
  if (tone === "red") return "from-rose-400 to-fuchsia-400";
  if (tone === "amber") return "from-amber-400 to-orange-300";
  if (tone === "green") return "from-emerald-400 to-cyan-300";
  if (tone === "teal") return "from-cyan-400 to-teal-300";
  if (tone === "info") return "from-blue-400 to-cyan-300";
  return "from-slate-500 to-slate-400";
}

export default function TradingCafeKpiCard({ item }: { item: KpiItem }) {
  const accent = toneAccent(item.tone ?? "neutral");
  const tone = item.tone ?? "neutral";
  return (
    <div className={`${hudPanelClass(tone === "red" ? "rose" : tone === "amber" ? "amber" : tone === "green" ? "emerald" : tone === "teal" ? "cyan" : tone === "info" ? "violet" : "slate")} flex min-h-[132px] flex-col p-3 transition hover:-translate-y-0.5 hover:shadow-[0_0_40px_rgba(34,211,238,0.18)] ${accent.border}`}>
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/60 to-transparent" />
      <div className="pointer-events-none absolute -right-10 -top-10 h-24 w-24 rounded-full bg-cyan-400/10 blur-2xl" />
      {/* UI-2.2 mockup-style header: icon chip + label, status dot on the right */}
      <div className="flex items-center gap-2">
        {item.icon ? (
          <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl border text-[15px] shadow-[0_0_18px_rgba(34,211,238,0.12)] ${accent.chip}`} aria-hidden="true">
            {item.icon}
          </span>
        ) : null}
        <span className="min-w-0 truncate text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">{item.label}</span>
        <span className={`ml-auto h-2 w-2 shrink-0 rounded-full ${accent.dot} shadow-[0_0_12px_currentColor]`} aria-hidden="true" />
      </div>
      <div className={`mt-2 truncate text-[19px] font-black leading-tight ${accent.value}`} title={item.value}>
        {item.value}
      </div>
      {item.sub ? <div className="mt-0.5 truncate text-[10px] font-bold text-slate-500">{item.sub}</div> : null}
      <div className="mt-auto h-1.5 overflow-hidden rounded-full bg-slate-800/90">
        <div className={`h-full w-2/3 rounded-full bg-gradient-to-r ${barTone(tone)} shadow-[0_0_14px_currentColor]`} />
      </div>
    </div>
  );
}
