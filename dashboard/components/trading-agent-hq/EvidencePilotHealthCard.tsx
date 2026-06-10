"use client";

// dashboard/components/trading-agent-hq/EvidencePilotHealthCard.tsx
// Phase UI-2.1 / Task C — read-only Evidence Pilot Health indicator.
// SAFETY: presentation only. No fetch, no write route, no order/live/exchange action,
// no token. Consumes ONLY existing TrendPaperEvidenceRunnerVM fields.
// "now" is sampled after mount (SSR-safe) and refreshed every 30s for the age display.

import { useEffect, useState } from "react";
import type { PaperVM } from "@/lib/trading-agent-hq/viewModel";
import { computeRunnerHealth, EXPECTED_INTERVAL_MINUTES } from "@/lib/trading-agent-hq/evidencePilotHealth";

const NA = "ไม่มีข้อมูล";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-[#e5d5bf] bg-[#fffaf1] px-2.5 py-1.5">
      <span className="text-[11px] font-bold text-[#7a6a59]">{label}</span>
      <span className="text-[12px] font-black text-[#2b2118]">{value}</span>
    </div>
  );
}

export default function EvidencePilotHealthCard({ paper }: { paper: PaperVM }) {
  const r = paper.trendPaperEvidenceRunner;

  // Clock set after mount to avoid SSR/hydration mismatch (same pattern as TradingCafeTopBar).
  const [nowMs, setNowMs] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNowMs(Date.now());
    tick();
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, []);

  const health = nowMs == null ? null : computeRunnerHealth(r.lastRunAt, nowMs);
  const badge =
    health == null || health.status === "unknown"
      ? "border-[#e5d5bf] bg-[#fffaf1] text-[#7a6a59]"
      : health.status === "healthy"
        ? "border-emerald-300 bg-emerald-50 text-emerald-800"
        : health.status === "warning"
          ? "border-amber-300 bg-amber-50 text-amber-900"
          : "border-red-300 bg-red-50 text-red-800";

  return (
    <section className="flex flex-col gap-2 rounded-xl border border-[#e5d5bf] bg-[#fffaf1] p-3 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-[13px] font-black text-[#2b2118]">🩺 Evidence Pilot Health</h2>
        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-black ${badge}`}>
          {health ? health.labelTh : "กำลังคำนวณ…"}
        </span>
      </div>

      <div className="flex flex-col gap-1.5">
        <Row label="รันล่าสุด (lastRunAt)" value={r.lastRunAt ?? NA} />
        <Row
          label="ผ่านมาแล้ว"
          value={
            health?.minutesSinceLastRun != null
              ? `${health.minutesSinceLastRun} นาที (รอบคาดหวัง ${EXPECTED_INTERVAL_MINUTES} นาที)`
              : NA
          }
        />
        <Row label="Entries วันนี้" value={String(r.dailyEntryCount ?? 0)} />
        <Row label="Closed Trades" value={`${r.trendClosedTrades}/${r.targetClosedTrades}`} />
        <Row label="Sample" value={r.sampleStatus || NA} />
        <Row label="Phase" value={`${r.evidencePhase} · ${r.enabled ? "enabled" : "disabled"}`} />
      </div>

      <p className="text-[10px] font-bold text-[#9a8a72]">
        อ่านอย่างเดียว · paper-only · ไม่ใช่สถานะการเทรดเงินจริง — Live/Exchange ปิดเสมอในเฟสนี้
      </p>
    </section>
  );
}
