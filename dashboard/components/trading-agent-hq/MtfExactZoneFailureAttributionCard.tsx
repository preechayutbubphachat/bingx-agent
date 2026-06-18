"use client";

// dashboard/components/trading-agent-hq/MtfExactZoneFailureAttributionCard.tsx
// D7.1 - read-only exact-zone failure attribution card.
// SAFETY: display only. No controls, no network calls, no activation or trade action.

import type { PaperVM } from "@/lib/trading-agent-hq/viewModel";

const NA = "ไม่มีข้อมูล";

function fmt(v: number | null | undefined, digits = 2): string {
  return typeof v === "number" && Number.isFinite(v) ? v.toFixed(digits) : NA;
}

function pct(v: number | null | undefined): string {
  return typeof v === "number" && Number.isFinite(v) ? `${(v * 100).toFixed(1)}%` : NA;
}

function tone(status: string): "neutral" | "green" | "amber" | "red" {
  if (status.includes("REVIEW_READY") || status === "GEOMETRY_EDGE_STRONG") return "green";
  if (status === "NOT_READY" || status.includes("WEAK") || status.includes("DOMINATES")) return "amber";
  if (status === "NO_DATA") return "neutral";
  return "neutral";
}

function Row({
  label,
  value,
  rowTone = "neutral",
}: {
  label: string;
  value: string;
  rowTone?: "neutral" | "green" | "amber" | "red";
}) {
  const cls =
    rowTone === "green"
      ? "text-[#2f7a51]"
      : rowTone === "amber"
        ? "text-[#a9701a]"
        : rowTone === "red"
          ? "text-[#b23a33]"
          : "text-[#2b2118]";
  return (
    <div className="flex min-w-0 items-center justify-between gap-2 rounded-lg border border-[#e5d5bf] bg-[#fffaf1] px-2.5 py-1.5">
      <span className="min-w-0 truncate text-[11px] font-bold text-[#7a6a59]">{label}</span>
      <span className={`shrink-0 text-right text-[12px] font-black ${cls}`}>{value}</span>
    </div>
  );
}

function Badge({ children }: { children: string }) {
  return (
    <span className="rounded-full border border-violet-300 bg-violet-50 px-2 py-0.5 text-[10px] font-black text-violet-900">
      {children}
    </span>
  );
}

export default function MtfExactZoneFailureAttributionCard({ paper }: { paper: PaperVM }) {
  const a = paper.mtfExactZoneFailureAttribution;
  const sample = a.sample;
  const edge = a.geometryEdge;
  const rates = a.failureRates;
  const gate = a.cleanSubsetGate;
  const failures = a.failureAttribution.dominantFailures;

  return (
    <section className="flex flex-col gap-2 rounded-xl border border-[#e5d5bf] bg-[#fffaf1] p-3 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <h2 className="flex min-w-0 items-center gap-2 text-[13px] font-black text-[#2b2118]">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-rose-100 text-[11px]" aria-hidden="true">
            D7.1
          </span>
          <span className="min-w-0">สาเหตุที่ Exact Zone ยังไม่พร้อม</span>
        </h2>
        <span className="shrink-0 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-black text-amber-900">
          {a.status}
        </span>
      </div>

      <div className="flex flex-wrap gap-1">
        <Badge>ยังไม่ใช่สัญญาณเข้าไม้</Badge>
        <Badge>ยังไม่ใช่ Activation</Badge>
        <Badge>ไม่เปลี่ยนกลไกเข้าไม้</Badge>
        <Badge>คัด clean candidate subset เท่านั้น</Badge>
      </div>

      <div className="rounded-lg border border-amber-200 bg-amber-50/80 p-2 text-[11px] font-bold leading-relaxed text-amber-950">
        <div className="font-black">จำนวน sample ผ่านแล้ว แต่ Execution quality ยังไม่ผ่าน</div>
        <div>RR geometry ดี != พร้อมเข้าไม้</div>
      </div>

      <div className="grid grid-cols-1 gap-1.5">
        <Row
          label="ตัวอย่างสะสม"
          value={`${sample.lifetimeExactSamples ?? 0}/${sample.reviewTargetSamples} ${sample.sampleGatePassed ? "ผ่าน" : "ยังไม่ผ่าน"}`}
          rowTone={sample.sampleGatePassed ? "green" : "amber"}
        />
        <Row label="Window ล่าสุด" value={sample.windowExactSamples != null ? String(sample.windowExactSamples) : NA} />
        <Row label="Current-price eligible" value={sample.currentPriceEligibleExactSamples != null ? String(sample.currentPriceEligibleExactSamples) : NA} rowTone={sample.currentPriceEligibleExactSamples == null ? "amber" : "green"} />
        <Row label="Geometry edge" value={`${edge.status} · exact ${fmt(edge.exactAvgNetRR)} vs heuristic ${fmt(edge.heuristicAvgNetRR)}`} rowTone={tone(edge.status)} />
        <Row label="Target-too-close" value={pct(rates.targetTooCloseRate)} rowTone={rates.targetTooCloseRate != null && rates.targetTooCloseRate > gate.thresholds.maxTargetTooCloseRate ? "amber" : "green"} />
        <Row label="Missed fill" value={pct(rates.missedFillRate)} rowTone={rates.missedFillRate != null && rates.missedFillRate > gate.thresholds.maxMissedFillRate ? "amber" : "green"} />
        <Row label="Entry touch" value={pct(rates.entryTouchRate)} rowTone={rates.entryTouchRate != null && rates.entryTouchRate >= gate.thresholds.minEntryTouchRate ? "green" : "amber"} />
        <Row label="Target after touch" value={pct(rates.targetAfterTouchRate)} rowTone={rates.targetAfterTouchRate != null && rates.targetAfterTouchRate >= gate.thresholds.minTargetAfterTouchRate ? "green" : "amber"} />
        <Row label="Clean subset gate" value={gate.status} rowTone={tone(gate.status)} />
      </div>

      <div className="rounded-lg border border-rose-200 bg-rose-50/80 p-2">
        <div className="mb-1 text-[10px] font-black uppercase tracking-wide text-rose-900">Dominant failures</div>
        <ul className="flex flex-col gap-1 text-[11px] font-bold text-rose-950">
          {failures.slice(0, 5).map((failure) => (
            <li key={`${failure.code}-${failure.interpretation}`}>• {failure.code}: {failure.interpretation}</li>
          ))}
        </ul>
      </div>

      <div className="rounded-lg border border-sky-200 bg-sky-50/70 p-2 text-[11px] font-bold leading-relaxed text-sky-950">
        <div className="font-black">Next action</div>
        <div>{a.nextAction.primary}</div>
        {a.nextAction.reviewTasks.length ? (
          <ul className="mt-1 flex flex-col gap-1">
            {a.nextAction.reviewTasks.slice(0, 3).map((task) => (
              <li key={task}>• {task}</li>
            ))}
          </ul>
        ) : null}
      </div>
    </section>
  );
}
