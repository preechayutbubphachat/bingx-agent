"use client";

// dashboard/components/trading-agent-hq/OperatorSummaryRailCard.tsx
// D7.10 - compact read-only operator summary for the right analysis rail.
// SAFETY: display only. No controls, no network calls, no activation or trade action.

import type { PaperVM } from "@/lib/trading-agent-hq/viewModel";
import type { ReactNode } from "react";

const NA = "ไม่มีข้อมูล";

function fmt(value: number | null | undefined, digits = 2): string {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(digits) : NA;
}

function count(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? String(value) : NA;
}

function Row({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "good" | "warn" | "bad";
}) {
  const valueClass =
    tone === "good"
      ? "text-emerald-200"
      : tone === "warn"
        ? "text-amber-200"
        : tone === "bad"
          ? "text-rose-200"
          : "text-cyan-50";

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-lg border border-white/10 bg-slate-950/45 px-2.5 py-1.5">
      <span className="min-w-0 truncate text-[10px] font-black text-slate-400">{label}</span>
      <span className={`max-w-[150px] truncate text-right text-[11px] font-black ${valueClass}`}>{value}</span>
    </div>
  );
}

function SafetyBadge({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full border border-emerald-300/30 bg-emerald-950/35 px-2 py-0.5 text-[10px] font-black text-emerald-100">
      {children}
    </span>
  );
}

export default function OperatorSummaryRailCard({ paper }: { paper: PaperVM }) {
  const summary = paper.operatorSummary;
  const fresh = summary.freshnessStatus === "FRESH";
  const blocked =
    summary.safety.activationAllowed === false &&
    summary.safety.paperActivationAllowed === false &&
    summary.safety.liveActivationAllowed === false &&
    summary.safety.orderAllowed === false;

  return (
    <section className="rounded-2xl border border-cyan-300/25 bg-slate-950/85 p-3 shadow-[0_14px_32px_rgba(2,8,23,0.52)]">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[10px] font-black uppercase tracking-[0.18em] text-cyan-300">Operator Summary</div>
          <h2 className="mt-0.5 text-[14px] font-black text-cyan-50">สรุปก่อน</h2>
        </div>
        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-black ${fresh ? "border-emerald-300/40 bg-emerald-950/40 text-emerald-100" : "border-amber-300/40 bg-amber-950/40 text-amber-100"}`}>
          {summary.freshnessStatus}
        </span>
      </div>

      <div className="mt-2 grid grid-cols-1 gap-1.5">
        <Row label="Current Price" value={fmt(summary.currentPrice)} tone={fresh ? "good" : "warn"} />
        <Row label="Freshness / Latest candle" value={`${summary.freshnessStatus} / ${summary.latestCandleAt ?? NA}`} tone={fresh ? "good" : "warn"} />
        <Row label="Regime / Direction / Confidence" value={`${summary.regime ?? NA} / ${summary.direction ?? NA} / ${count(summary.confidence)}`} />
        <Row label="ตัวอย่างสะสม = review progress" value={`${count(summary.reviewSamplesUsed)} / ${summary.reviewTargetSamples}`} tone={summary.reviewSampleGatePassed ? "good" : "warn"} />
        <Row label="window samples = pattern ล่าสุด" value={count(summary.windowExactSamples)} />
        <Row label="current-price eligible = ใช้กับราคาตอนนี้" value={count(summary.currentPriceEligibleExactSamples)} tone={(summary.currentPriceEligibleExactSamples ?? 0) > 0 ? "good" : "warn"} />
        <Row label="Clean candidates" value={count(summary.cleanCurrentPriceEligibleSamples)} tone={(summary.cleanCurrentPriceEligibleSamples ?? 0) > 0 ? "good" : "warn"} />
        <Row label="Watchlist status" value={summary.watchlistStatus} tone={summary.cleanReviewCandidates > 0 ? "good" : "warn"} />
      </div>

      <div className="mt-2 rounded-lg border border-amber-300/20 bg-amber-950/20 p-2 text-[11px] font-bold leading-relaxed text-amber-100">
        <div className="font-black">Main blocker</div>
        <div className="break-words">{summary.mainBlocker || NA}</div>
      </div>

      <div className="mt-2 rounded-lg border border-cyan-300/20 bg-cyan-950/20 p-2 text-[11px] font-bold leading-relaxed text-cyan-100">
        <div className="font-black">Next action</div>
        <div className="break-words">{summary.nextAction || NA}</div>
        <div className="mt-1 text-cyan-200">snapshot price = previous context · ถ้าราคาเปลี่ยน ระบบ re-evaluate ก่อน ไม่ใช้ verdict เก่า</div>
      </div>

      <div className="mt-2 flex flex-wrap gap-1">
        <SafetyBadge>ยังไม่ใช่สัญญาณเข้าไม้</SafetyBadge>
        <SafetyBadge>ไม่ส่ง Order / ไม่ Activation</SafetyBadge>
        <SafetyBadge>{blocked ? "activationAllowed=false" : "ตรวจ safety flags"}</SafetyBadge>
        <SafetyBadge>reviewOnly={summary.safety.reviewOnly ? "true" : "false"}</SafetyBadge>
        <SafetyBadge>shadowOnly={summary.safety.shadowOnly ? "true" : "false"}</SafetyBadge>
      </div>
    </section>
  );
}
