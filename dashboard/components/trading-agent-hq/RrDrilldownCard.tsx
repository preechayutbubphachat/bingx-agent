"use client";

// dashboard/components/trading-agent-hq/RrDrilldownCard.tsx
// Phase T-3H-6-b - read-only RR Blocker Drilldown (latest setup only).
// SAFETY: presentation only. No fetch, no write route, no threshold tuning surface,
// no order/live/exchange action. Consumes only existing VM fields + pure helper.

import type { PaperVM } from "@/lib/trading-agent-hq/viewModel";
import {
  computeRrBlockerDrilldown,
  RR_REASON_LABEL_TH,
  RR_SEVERITY_LABEL_TH,
} from "@/lib/trend/rrBlockerDrilldown";

const NA = "ไม่มีข้อมูล";

function fmtNum(v: number | null, digits = 2): string {
  return typeof v === "number" && Number.isFinite(v) ? v.toFixed(digits) : NA;
}

function Row({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "red" | "amber" | "green";
}) {
  const cls =
    tone === "red"
      ? "text-[#b23a33]"
      : tone === "amber"
        ? "text-[#a9701a]"
        : tone === "green"
          ? "text-[#2f7a51]"
          : "text-[#2b2118]";
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-[#e5d5bf] bg-[#fffaf1] px-2.5 py-1.5">
      <span className="text-[11px] font-bold text-[#7a6a59]">{label}</span>
      <span className={`text-[12px] font-black ${cls}`}>{value}</span>
    </div>
  );
}

export default function RrDrilldownCard({ paper }: { paper: PaperVM }) {
  const ts = paper.trendStrategy;
  const pf = paper.trendPaperExecutionPreflight;
  const cfg = paper.trendPaperConfigPublic;

  const r = computeRrBlockerDrilldown({
    rawRR: ts.rewardRisk ?? pf.rewardRisk,
    requiredRR: cfg.minRewardRisk,
    entry: pf.entry ?? null,
    stopLoss: pf.stopLoss ?? ts.invalidation,
    target1: pf.takeProfit1 ?? ts.target1,
    currentPrice: ts.currentPrice,
    distanceToEntryZonePct: ts.distanceToEntryZonePct,
    riskStatus: ts.riskStatus,
    feePct: cfg.feePct,
    slippagePct: cfg.slippagePct,
  });

  const sevTone =
    r.failSeverity === "PASS"
      ? "green"
      : r.failSeverity === "NEAR_MISS"
        ? "amber"
        : r.failSeverity == null
          ? "neutral"
          : "red";
  const sevBadge =
    sevTone === "green"
      ? "border-emerald-300 bg-emerald-50 text-emerald-800"
      : sevTone === "amber"
        ? "border-amber-300 bg-amber-50 text-amber-900"
        : sevTone === "red"
          ? "border-red-300 bg-red-50 text-red-800"
          : "border-[#e5d5bf] bg-[#fffaf1] text-[#7a6a59]";

  return (
    <section className="flex flex-col gap-2 rounded-xl border border-[#e5d5bf] bg-[#fffaf1] p-3 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex min-w-0 items-center gap-2 text-[13px] font-black text-[#2b2118]">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-sky-100 text-[14px]" aria-hidden="true">
            RR
          </span>
          <span className="truncate">RR Drilldown (setup ล่าสุด)</span>
        </h2>
        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-black ${sevBadge}`}>
          {r.failSeverity ? RR_SEVERITY_LABEL_TH[r.failSeverity] : "รอข้อมูล setup"}
        </span>
      </div>

      {!r.available ? (
        <p className="rounded-lg border border-[#e5d5bf] bg-white/60 px-3 py-3 text-center text-[11px] font-bold text-[#9a8a72]">
          รอข้อมูล setup - จะแสดงเมื่อ strategy ส่ง rawRR และ config ส่ง requiredRR เข้ามา
        </p>
      ) : (
        <>
          <div className="flex flex-col gap-1.5">
            <Row
              label="rawRR vs requiredRR"
              value={`${fmtNum(r.rawRR)} / ${fmtNum(r.requiredRR)}`}
              tone={r.failSeverity === "PASS" ? "green" : "red"}
            />
            <Row
              label="rrGap (required - raw)"
              value={fmtNum(r.rrGap)}
              tone={r.failSeverity === "PASS" ? "green" : r.failSeverity === "NEAR_MISS" ? "amber" : "red"}
            />
            <Row label="riskDistance (entry-stop)" value={fmtNum(r.riskDistance, 1)} />
            <Row label="rewardDistance (entry-TP1)" value={fmtNum(r.rewardDistance, 1)} />
            <Row label="cost ~= fee+slip round trip" value={r.costR != null ? `${fmtNum(r.costR)}R / net ${fmtNum(r.netRR)}` : NA} />
          </div>

          {r.reason ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5">
              <div className="text-[10px] font-black uppercase tracking-wide text-amber-900">สาเหตุหลัก (heuristic แสดงผล)</div>
              <div className="text-[12px] font-black text-[#3f2f22]">
                {r.reason} - {RR_REASON_LABEL_TH[r.reason]}
              </div>
            </div>
          ) : null}

          <p className="text-[9px] font-bold text-[#b3a285]">
            sample: setup ปัจจุบัน 1 รายการ - มิติย้อนหลังต้องรอ T-3H-6-b1 เพิ่ม rrSnapshot ใน decision log
          </p>
        </>
      )}

      <p className="text-[10px] font-bold text-[#9a8a72]">
        observe-only · ยังไม่ปรับ threshold ใด ๆ · adaptive RR เป็น shadow design เท่านั้น · paper-only
      </p>
    </section>
  );
}
