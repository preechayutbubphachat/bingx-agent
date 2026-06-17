"use client";

// D6.0 mission-control top header. Refresh only re-reads public-safe data.

import { useEffect, useState } from "react";
import type { SafetyVM } from "@/lib/trading-agent-hq/viewModel";

type Props = {
  live: boolean;
  lastUpdate: string;
  safety: SafetyVM;
  onRefresh: () => void;
};

function Chip({ tone, label }: { tone: "green" | "amber" | "red" | "neutral" | "cyan"; label: string }) {
  const cls =
    tone === "green"
      ? "border-emerald-300/50 bg-emerald-400/10 text-emerald-200"
      : tone === "amber"
        ? "border-amber-300/50 bg-amber-400/10 text-amber-200"
        : tone === "red"
          ? "border-rose-300/50 bg-rose-400/10 text-rose-200"
          : tone === "cyan"
            ? "border-cyan-300/50 bg-cyan-400/10 text-cyan-100"
            : "border-slate-600 bg-slate-900/80 text-slate-300";
  return <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black ${cls}`}>{label}</span>;
}

export default function TradingCafeTopBar({ live, lastUpdate, safety, onRefresh }: Props) {
  const [now, setNow] = useState<string>("--:--:--");
  useEffect(() => {
    const tick = () => setNow(new Date().toLocaleTimeString("th-TH", { hour12: false }));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);

  const liveDisabled = !safety.liveTradingEnabled && !safety.orderPlacementEnabled;

  return (
    <header className="border-b border-cyan-400/20 bg-[#030914]/95 px-4 py-3 text-slate-100 shadow-[0_10px_40px_rgba(0,0,0,0.35)] backdrop-blur">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10px] font-black uppercase tracking-[0.28em] text-fuchsia-300">Mission Control & Trading Operations Dashboard</div>
          <h1 className="text-[20px] font-black leading-tight text-white sm:text-[24px]">ศูนย์ควบคุม Agent</h1>
        </div>

        <div className="hidden min-w-[260px] max-w-[360px] flex-1 items-center rounded-xl border border-cyan-400/20 bg-slate-950/70 px-3 py-2 text-[11px] font-bold text-slate-500 xl:flex">
          <span className="mr-2 text-cyan-300">⌕</span>
          Search agents, missions, docs...
          <span className="ml-auto rounded border border-slate-700 px-1.5 py-0.5 text-[9px] text-slate-400">CTRL K</span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <Chip tone="green" label="ENV PAPER REVIEW" />
          <Chip tone="cyan" label="REGION Thailand (BKK)" />
          <Chip tone="cyan" label={`SYSTEM TIME ${now}`} />
          <Chip tone={live ? "green" : "amber"} label={live ? "Public-safe endpoint" : "Mock/Fallback"} />
          <Chip tone="green" label="Paper-only" />
          <Chip tone={liveDisabled ? "red" : "amber"} label="Live OFF" />
          <Chip tone={!safety.orderPlacementEnabled ? "red" : "amber"} label="Order OFF" />
          <button
            type="button"
            onClick={onRefresh}
            title="โหลดข้อมูล public-safe ใหม่ (อ่านอย่างเดียว)"
            className="rounded-xl border border-cyan-300/40 bg-cyan-400/10 px-3 py-1.5 text-[11px] font-black text-cyan-100 shadow-[0_0_18px_rgba(34,211,238,0.18)] hover:bg-cyan-400/20"
          >
            Refresh Data
          </button>
          <span
            className="grid h-9 w-9 place-items-center rounded-xl border border-fuchsia-300/40 bg-fuchsia-400/10 text-[12px] font-black text-fuchsia-100"
            title="Operator profile (display only)"
          >
            Ops
          </span>
        </div>
      </div>
      <p className="mt-2 text-[10px] font-medium text-slate-500">
        อัปเดตล่าสุด: {lastUpdate} · dashboard นี้เป็น review-only ไม่ใช่ Activation, Live หรือ Order placement
      </p>
    </header>
  );
}
