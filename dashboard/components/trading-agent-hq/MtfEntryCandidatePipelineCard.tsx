"use client";

// dashboard/components/trading-agent-hq/MtfEntryCandidatePipelineCard.tsx
// D7.0 - read-only MTF Entry Candidate analysis card.
// SAFETY: display only. No controls, no network calls, no activation/order/live action.

import type { PaperVM } from "@/lib/trading-agent-hq/viewModel";

const NA = "ไม่มีข้อมูล";

function fmt(v: number | null | undefined, digits = 2): string {
  return typeof v === "number" && Number.isFinite(v) ? v.toFixed(digits) : NA;
}

function pct(v: number | null | undefined): string {
  return typeof v === "number" && Number.isFinite(v) ? `${(v * 100).toFixed(1)}%` : NA;
}

function statusText(status: string): string {
  const labels: Record<string, string> = {
    NO_CANDIDATE: "ยังไม่มี candidate",
    ZONE_BUILDING: "กำลังสร้าง zone",
    ZONE_READY: "zone พร้อมรีวิว",
    WAITING_TRIGGER: "รอ LTF trigger",
    ENTRY_TOUCHED_REVIEW: "entry touched - ต้องรีวิว",
    WARNING_DEGRADED: "มี warning - ยังไม่พร้อม",
    REVIEW_READY: "พร้อม manual review เท่านั้น",
    NOT_READY: "ยังไม่พร้อม",
  };
  return labels[status] ?? status;
}

function verdictText(status: string): string {
  const labels: Record<string, string> = {
    PROMISING_GEOMETRY_BUT_EXECUTION_NOT_READY: "Exact Zone มี RR geometry ดีกว่า heuristic แต่ execution outcome ยังไม่พร้อม",
    INSUFFICIENT_EXACT_SAMPLES: "exact samples ยังไม่พอ",
    TARGET_TOO_CLOSE_DOMINATES: "TARGET_TOO_CLOSE สูง",
    INVALIDATION_DOMINATES_AFTER_TOUCH: "หลัง entry touch invalidation ยังชนะ target",
    WAIT_MORE_EVIDENCE: "รอ evidence เพิ่ม",
    REVIEW_READY_NOT_ACTIVATION: "พร้อมรีวิว แต่ไม่ใช่ Activation",
    NO_CANDIDATE: "ยังไม่มี candidate",
  };
  return labels[status] ?? status;
}

function toneFor(status: string): "neutral" | "green" | "amber" | "red" {
  if (status === "REVIEW_READY" || status === "REVIEW_READY_NOT_ACTIVATION") return "green";
  if (status === "WARNING_DEGRADED" || status === "STALE" || status === "STALE_REEVALUATION_REQUIRED" || status.includes("DOMINATES") || status.includes("TOO_CLOSE")) return "amber";
  if (status === "NO_CANDIDATE" || status === "NO_EXACT_ZONE") return "neutral";
  if (status === "NOT_READY") return "red";
  return "neutral";
}

function Row({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "green" | "amber" | "red";
}) {
  const cls =
    tone === "green"
      ? "text-[#2f7a51]"
      : tone === "amber"
        ? "text-[#a9701a]"
        : tone === "red"
          ? "text-[#b23a33]"
          : "text-[#2b2118]";
  return (
    <div className="flex min-w-0 items-center justify-between gap-2 rounded-lg border border-[#e5d5bf] bg-[#fffaf1] px-2.5 py-1.5">
      <span className="min-w-0 truncate text-[11px] font-bold text-[#7a6a59]">{label}</span>
      <span className={`shrink-0 text-right text-[12px] font-black ${cls}`}>{value}</span>
    </div>
  );
}

function SafetyBadge({ children }: { children: string }) {
  return (
    <span className="rounded-full border border-violet-300 bg-violet-50 px-2 py-0.5 text-[10px] font-black text-violet-900">
      {children}
    </span>
  );
}

export default function MtfEntryCandidatePipelineCard({ paper }: { paper: PaperVM }) {
  const p = paper.mtfEntryCandidatePipeline;
  const z = p.zoneCandidate;
  const t = p.triggerReview;
  const g = p.geometry;
  const c = p.currentPriceContext;
  const r = p.currentCandidateReevaluation;
  const priceFreshnessTone = c.freshnessStatus === "FRESH"
    ? "green"
    : c.freshnessStatus === "MISSING" || c.freshnessStatus === "UNKNOWN"
      ? "red"
      : "amber";
  const targetTooCloseCount = paper.trendEvidenceDecisionSummary.exactZoneComparisonSummary.conflictBreakdown.TARGET_TOO_CLOSE;
  const targetTooCloseRate = z.exactSamples > 0 ? targetTooCloseCount / z.exactSamples : null;
  const targetTooCloseDisplay = z.exactSamples > 0 ? `${targetTooCloseCount}/${z.exactSamples} (${pct(targetTooCloseRate)})` : NA;

  return (
    <section className="flex flex-col gap-2 rounded-xl border border-[#e5d5bf] bg-[#fffaf1] p-3 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <h2 className="flex min-w-0 items-center gap-2 text-[13px] font-black text-[#2b2118]">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-sky-100 text-[11px]" aria-hidden="true">
            MTF
          </span>
          <span className="min-w-0">
            MTF Entry Candidate / วิเคราะห์จุดเข้าแบบ Multi Timeframe
          </span>
        </h2>
        <span className="shrink-0 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-black text-amber-900">
          {statusText(p.status)}
        </span>
      </div>

      <div className="flex flex-wrap gap-1">
        <SafetyBadge>ใช้เพื่อรีวิวเท่านั้น</SafetyBadge>
        <SafetyBadge>ไม่ใช่สัญญาณเข้าไม้</SafetyBadge>
        <SafetyBadge>ไม่ใช่ Activation</SafetyBadge>
        <SafetyBadge>ไม่ใช่ Live</SafetyBadge>
        <SafetyBadge>ไม่ส่ง Order</SafetyBadge>
      </div>

      <div className="rounded-lg border border-[#e5d5bf] bg-white/70 p-2 text-[11px] font-bold leading-relaxed text-[#6e5b49]">
        <div className="font-black text-[#2b2118]">{verdictText(p.verdict.status)}</div>
        <div>ยังไม่เปลี่ยน entry logic จริง · score/verdict ไม่ feed runner/gate/order path</div>
      </div>

      <div className="grid grid-cols-1 gap-1.5 rounded-lg border border-sky-200 bg-sky-50/70 p-2">
        <Row label="อิงราคาปัจจุบัน" value={c.freshnessStatus} tone={priceFreshnessTone} />
        <Row label="Current Price" value={fmt(c.currentPrice)} />
        <Row label="Latest candle" value={c.latestCandleAt ?? NA} tone={c.reevaluationRequired ? "amber" : "neutral"} />
        <Row label="Current re-evaluation" value={r.status} tone={toneFor(r.status)} />
        {c.reevaluationRequired ? (
          <div className="rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-[11px] font-black text-amber-950">
            ข้อมูลราคาปัจจุบันไม่สดพอ — ต้อง refresh ก่อนสรุป candidate
          </div>
        ) : null}
        <div className="text-[11px] font-bold leading-relaxed text-sky-950">
          ถ้าราคาเปลี่ยนจากรอบวิเคราะห์เดิม ระบบจะ re-evaluate ก่อน ไม่ใช้ verdict เก่า
        </div>
      </div>

      <div className="grid grid-cols-1 gap-1.5">
        <Row label="สถานะ candidate" value={statusText(p.status)} tone={toneFor(p.status)} />
        <Row label="HTF Bias" value={`${p.htfBias.status}${p.htfBias.confidence != null ? ` · ${p.htfBias.confidence}` : ""}`} />
        <Row label="Exact Zone quality" value={z.status} tone={toneFor(z.status)} />
        <Row label="Samples" value={`${z.exactSamples} / ${z.requiredExactSamples}`} tone={z.samplesRemaining > 0 ? "amber" : "green"} />
        <Row label="Samples remaining" value={z.samplesRemaining > 0 ? `ขาด exact samples อีก ${z.samplesRemaining}` : "ครบ sample ขั้นต่ำ"} tone={z.samplesRemaining > 0 ? "amber" : "green"} />
        <Row label="Exact avg netRR" value={fmt(z.exactAvgNetRR)} tone={z.exactAvgNetRR != null && z.heuristicAvgNetRR != null && z.exactAvgNetRR > z.heuristicAvgNetRR ? "green" : "neutral"} />
        <Row label="Heuristic avg netRR" value={fmt(z.heuristicAvgNetRR)} />
        <Row label="Exact vs heuristic delta" value={fmt(z.exactVsHeuristicDelta)} tone={z.exactVsHeuristicDelta != null && z.exactVsHeuristicDelta > 0 ? "green" : "neutral"} />
        <Row label="Target-too-close rate" value={targetTooCloseDisplay} tone={targetTooCloseCount > 0 ? "amber" : "neutral"} />
        <Row label="Missed fill rate" value={pct(g.missedFillRate)} tone={g.missedFillRate != null && g.missedFillRate > 0.3 ? "amber" : "neutral"} />
        <Row label="Entry touched" value={String(t.entryTouched)} tone={t.entryTouched >= 20 ? "green" : "amber"} />
        <Row label="Target after touch" value={pct(t.targetAfterEntryTouchRate)} tone={t.targetAfterEntryTouchRate === 0 ? "amber" : "neutral"} />
        <Row label="Invalidation after touch" value={pct(t.invalidationAfterEntryTouchRate)} tone={t.invalidationAfterEntryTouchRate != null && t.targetAfterEntryTouchRate != null && t.invalidationAfterEntryTouchRate > t.targetAfterEntryTouchRate ? "amber" : "neutral"} />
        <Row label="Geometry" value={`${g.status} · ready ${g.geometryReady}`} tone={toneFor(g.status)} />
      </div>

      <div className="rounded-lg border border-amber-200 bg-amber-50/80 p-2">
        <div className="mb-1 text-[10px] font-black uppercase tracking-wide text-amber-900">Blockers</div>
        {p.verdict.blockers.length ? (
          <ul className="flex flex-col gap-1 text-[11px] font-bold text-amber-950">
            {p.verdict.blockers.slice(0, 5).map((blocker) => (
              <li key={blocker}>• {blocker}</li>
            ))}
          </ul>
        ) : (
          <div className="text-[11px] font-bold text-[#6e5b49]">ยังไม่มี blocker หลักจาก pipeline นี้</div>
        )}
      </div>

      <div className="rounded-lg border border-sky-200 bg-sky-50/70 p-2 text-[11px] font-bold leading-relaxed text-sky-950">
        <div className="font-black">Next action</div>
        <div>{p.verdict.nextAction}</div>
      </div>
    </section>
  );
}
