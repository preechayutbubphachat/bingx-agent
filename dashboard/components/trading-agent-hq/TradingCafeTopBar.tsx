"use client";

// dashboard/components/trading-agent-hq/TradingCafeTopBar.tsx
// Phase UI-2 — cream command-center top header with system/safety chips.
// SAFETY: the "ระบบทำงาน" chip is a UI/system heartbeat — NOT live trading.
// No live/order/exchange controls. The refresh button only re-reads public-safe data.

import { useEffect, useState } from "react";
import type { SafetyVM } from "@/lib/trading-agent-hq/viewModel";

type Props = {
  live: boolean;
  lastUpdate: string;
  safety: SafetyVM;
  onRefresh: () => void;
};

function Chip({ tone, label }: { tone: "green" | "amber" | "red" | "neutral"; label: string }) {
  const cls =
    tone === "green"
      ? "border-emerald-300 bg-emerald-50 text-emerald-800"
      : tone === "amber"
        ? "border-amber-300 bg-amber-50 text-amber-900"
        : tone === "red"
          ? "border-red-300 bg-red-50 text-red-800"
          : "border-[#e5d5bf] bg-[#fffaf1] text-[#7a6a59]";
  return <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black ${cls}`}>{label}</span>;
}

export default function TradingCafeTopBar({ live, lastUpdate, safety, onRefresh }: Props) {
  // Cafe clock: set after mount to avoid SSR/hydration mismatch.
  const [now, setNow] = useState<string>("--:--:--");
  useEffect(() => {
    const tick = () => setNow(new Date().toLocaleTimeString("th-TH", { hour12: false }));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);

  const liveDisabled = !safety.liveTradingEnabled && !safety.orderPlacementEnabled;

  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e5d5bf] bg-[#fffaf1] px-4 py-3">
      <div className="min-w-0">
        <h1 className="text-[18px] font-black leading-tight text-[#2b2118]">Trading Cafe HQ</h1>
        <p className="text-[11px] font-bold text-[#7a6a59]">ศูนย์บัญชาการเทรดอัตโนมัติ · Command Center</p>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <Chip tone="neutral" label={`Cafe Time ${now}`} />
        <Chip tone={live ? "green" : "amber"} label={live ? "ระบบทำงาน (UI heartbeat)" : "UI: ข้อมูลจำลอง"} />
        {/* UI-2.1: removed hardcoded "ระบบ/DB/API: ปกติ" chips (no data source behind them — misleading). */}
        <Chip tone="green" label="Paper-only" />
        <Chip tone={liveDisabled ? "red" : "amber"} label="Live Trading: ปิด" />
        <Chip tone={!safety.orderPlacementEnabled ? "red" : "amber"} label="Exchange: ปิด" />
        <button
          type="button"
          onClick={onRefresh}
          title="โหลดข้อมูล public-safe ใหม่ (อ่านอย่างเดียว)"
          className="rounded-full border border-[#e5d5bf] bg-[#1f9d92] px-3 py-1 text-[11px] font-black text-white hover:brightness-95"
        >
          ↻ รีเฟรช
        </button>
        <span
          className="grid h-8 w-8 place-items-center rounded-full bg-[#2a2118] text-[12px] font-black text-[#f4e9d4]"
          title="โปรไฟล์ (แสดงผลเท่านั้น)"
        >
          ☕
        </span>
      </div>

      <p className="w-full text-[10px] font-medium text-[#9a8a72]">
        อัปเดตล่าสุด: {lastUpdate} · ชิป “ระบบทำงาน” หมายถึง UI/ระบบยังทำงาน ไม่ใช่การเทรดด้วยเงินจริง
      </p>
    </header>
  );
}
