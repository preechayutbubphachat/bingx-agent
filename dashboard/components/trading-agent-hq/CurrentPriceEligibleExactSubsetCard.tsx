"use client";

// dashboard/components/trading-agent-hq/CurrentPriceEligibleExactSubsetCard.tsx
// D7.2 - read-only current-price exact subset card.
// SAFETY: display only. No controls, no network calls, no activation or trade action.

import type { PaperVM } from "@/lib/trading-agent-hq/viewModel";

const NA = "ไม่มีข้อมูล";

function fmt(v: number | null | undefined, digits = 2): string {
  return typeof v === "number" && Number.isFinite(v) ? v.toFixed(digits) : NA;
}

function count(v: number | null | undefined): string {
  return typeof v === "number" && Number.isFinite(v) ? String(v) : NA;
}

function tone(status: string): "neutral" | "green" | "amber" | "red" {
  if (status.includes("REVIEW_READY") || status === "CLEAN_SUBSET_FOUND_REVIEW_ONLY" || status === "CLEAN_REVIEW_ONLY") return "green";
  if (status.includes("MISSING") || status.includes("STALE") || status === "NOT_READY") return "amber";
  if (status.includes("INVALIDATED")) return "red";
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
    <div className="flex min-w-0 items-center justify-between gap-2 rounded-lg border border-[#e5d5bf] bg-white/75 px-2.5 py-1.5">
      <span className="min-w-0 truncate text-[11px] font-bold text-[#7a6a59]">{label}</span>
      <span className={`shrink-0 text-right text-[12px] font-black ${cls}`}>{value}</span>
    </div>
  );
}

function Badge({ children }: { children: string }) {
  return (
    <span className="rounded-full border border-sky-300 bg-sky-50 px-2 py-0.5 text-[10px] font-black text-sky-900">
      {children}
    </span>
  );
}

function flagText(flags: string[]): string {
  return flags.length ? flags.join(", ") : NA;
}

export default function CurrentPriceEligibleExactSubsetCard({ paper }: { paper: PaperVM }) {
  const s = paper.currentPriceEligibleExactSubset;
  const price = s.currentPrice;
  const sample = s.sampleAccounting;
  const filters = s.eligibilityFilters;
  const gate = s.cleanSubsetGate;
  const firstCandidate = s.topCandidates[0] ?? null;
  const geometryMissing = s.status === "GEOMETRY_INPUTS_MISSING";

  return (
    <section className="flex flex-col gap-2 rounded-xl border border-[#d7e4df] bg-[#f7fbf8] p-3 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <h2 className="flex min-w-0 items-center gap-2 text-[13px] font-black text-[#1f2c26]">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-sky-100 text-[11px]" aria-hidden="true">
            D7.2
          </span>
          <span className="min-w-0">Exact Zone ที่ยังใช้ได้กับราคาปัจจุบัน</span>
        </h2>
        <span className="shrink-0 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-black text-amber-900">
          {s.status}
        </span>
      </div>

      <div className="flex flex-wrap gap-1">
        <Badge>ยึดราคาปัจจุบันก่อน</Badge>
        <Badge>ไม่ใช้ verdict เก่าโดยไม่ re-evaluate</Badge>
        <Badge>ใช้เพื่อรีวิวเท่านั้น</Badge>
        <Badge>ไม่ใช่สัญญาณเข้าไม้</Badge>
        <Badge>ไม่ใช่ Activation</Badge>
        <Badge>ไม่ส่ง Order</Badge>
      </div>

      <div className="rounded-lg border border-amber-200 bg-amber-50/80 p-2 text-[11px] font-bold leading-relaxed text-amber-950">
        ระบบจะไม่เดา geometry · ต้องมี entry / stop / target ต่อ candidate
      </div>

      {geometryMissing ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50/80 p-2 text-[11px] font-bold leading-relaxed text-rose-950">
          <div>ยังไม่มี per-candidate geometry snapshot</div>
          <div>มี aggregate exact evidence แล้ว แต่ยังคำนวณ current-price eligible ไม่ได้</div>
          <div>ขั้นถัดไป: เพิ่ม exactCandidateGeometrySnapshot ใน evidence log</div>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-1.5">
        <Row label="Current Price" value={fmt(price.value)} rowTone={price.freshnessStatus === "FRESH" ? "green" : "amber"} />
        <Row label="Freshness" value={price.freshnessStatus} rowTone={price.freshnessStatus === "FRESH" ? "green" : "amber"} />
        <Row label="Latest candle" value={price.latestCandleAt ?? NA} />
        <Row label="Lifetime exact samples" value={count(sample.lifetimeExactSamples)} />
        <Row label="Window exact samples" value={count(sample.windowExactSamples)} />
        <Row label="Current-price eligible" value={count(sample.currentPriceEligibleExactSamples)} rowTone={sample.currentPriceEligibleExactSamples == null ? "amber" : "green"} />
        <Row label="Clean eligible" value={count(sample.cleanCurrentPriceEligibleSamples)} rowTone={(sample.cleanCurrentPriceEligibleSamples ?? 0) > 0 ? "green" : "amber"} />
        <Row label="Geometry inputs" value={`${count(sample.geometryInputSamples)} present / ${count(sample.geometryMissingSamples)} missing`} rowTone={(sample.geometryInputSamples ?? 0) > 0 ? "green" : "amber"} />
        <Row label="Clean subset gate" value={gate.status} rowTone={tone(gate.status)} />
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        <Row label="Near/inside" value={String(filters.currentPriceInsideOrNearEntry)} rowTone={filters.currentPriceInsideOrNearEntry > 0 ? "green" : "amber"} />
        <Row label="Clean" value={String(filters.cleanCandidates)} rowTone={filters.cleanCandidates > 0 ? "green" : "amber"} />
        <Row label="Missed" value={String(filters.missedCandidates)} rowTone={filters.missedCandidates > 0 ? "amber" : "neutral"} />
        <Row label="Invalidated" value={String(filters.invalidatedCandidates)} rowTone={filters.invalidatedCandidates > 0 ? "red" : "neutral"} />
      </div>

      {firstCandidate ? (
        <div className="space-y-1.5">
          {s.topCandidates.slice(0, 3).map((candidate) => (
            <div key={candidate.id} className="rounded-lg border border-sky-200 bg-sky-50/70 p-2 text-[11px] font-bold leading-relaxed text-sky-950">
              <div className="mb-1 font-black">Top candidate: {candidate.id} · {candidate.status}</div>
              <div>{candidate.direction} · {candidate.zoneType ?? "UNKNOWN_ZONE"} · readiness {candidate.readiness ?? NA}</div>
              <div>entry {fmt(candidate.entry)} · zone {fmt(candidate.entryLow)}-{fmt(candidate.entryHigh)} · stop {fmt(candidate.stopLoss)} · target {fmt(candidate.target1)} · RR {fmt(candidate.netRR)}</div>
              <div>distance {fmt(candidate.distanceToEntryPct)}% · flags {flagText(candidate.flags)}</div>
              <div>{candidate.reason}</div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-amber-200 bg-white/80 p-2 text-[11px] font-bold leading-relaxed text-amber-950">
          ยังไม่มี top candidate ที่มี structured geometry เพียงพอสำหรับเทียบกับราคาปัจจุบัน
        </div>
      )}

      {s.requiredGeometryInputs.length ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50/80 p-2 text-[11px] font-bold leading-relaxed text-rose-950">
          <div className="mb-1 font-black">Geometry inputs ที่ต้องมี</div>
          <div>{s.requiredGeometryInputs.join(", ")}</div>
        </div>
      ) : null}

      <div className="rounded-lg border border-[#d7e4df] bg-white/80 p-2 text-[11px] font-bold leading-relaxed text-[#26352d]">
        <div className="font-black">Next action</div>
        <div>{s.nextAction}</div>
      </div>
    </section>
  );
}
