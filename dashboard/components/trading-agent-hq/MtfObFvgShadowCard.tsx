"use client";

// dashboard/components/trading-agent-hq/MtfObFvgShadowCard.tsx
// Phase T-3H-6-c - read-only MTF OB/FVG refinement shadow.
// SAFETY: no buttons, no fetch, no token handling, no entry/threshold change.

import type { PaperVM } from "@/lib/trading-agent-hq/viewModel";
import {
  computeMtfObFvgRefinementShadow,
  type MtfDirection,
} from "@/lib/trend/mtfObFvgRefinementShadow";
import { reviewMtfObFvgShadowSummary } from "@/lib/trend/mtfObFvgShadowReview";

const NA = "ไม่มีข้อมูล";

function num(v: number | string | boolean | null | undefined): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function fmt(v: number | null | undefined, digits = 2): string {
  return typeof v === "number" && Number.isFinite(v) ? v.toFixed(digits) : NA;
}

function mid(zone: [number, number] | null | undefined): number | null {
  return zone ? (zone[0] + zone[1]) / 2 : null;
}

function mapDataStatus(s: string): string {
  if (s === "ACTUAL_OB_FVG_AVAILABLE") return "actual OB/FVG zones available";
  if (s === "HEURISTIC_ESTIMATE_ONLY") return "heuristic estimate only";
  return "insufficient data";
}

function mapClassification(s: string): string {
  const m: Record<string, string> = {
    NO_DATA: "ข้อมูลไม่พอ",
    NO_REFINEMENT_AVAILABLE: "ยังไม่มี zone สำหรับ refine",
    REFINEMENT_IMPROVES_RR: "refined entry อาจช่วย RR",
    REFINEMENT_STILL_FAILS_COST: "raw RR ดีขึ้น แต่ netRR ยังแพ้ต้นทุน",
    TARGET_TOO_CLOSE: "target ใกล้เกินไป",
    STOP_TOO_WIDE: "stop กว้างเกินไป",
    ENTRY_GEOMETRY_NEAR_MISS: "near-miss จาก entry geometry",
    COST_DRAG_DOMINANT: "ต้นทุน fee/slippage เป็นตัวกดหลัก",
    SHADOW_ONLY: "shadow-only",
  };
  return m[s] ?? s;
}

function mapSampleTier(s: string): string {
  if (s === "REVIEW_READY_100_PLUS") return "review-ready shadow sample";
  if (s === "EARLY_PATTERN_50_TO_99") return "early pattern";
  return "insufficient sample";
}

function mapEvidenceGrade(s: string): string {
  const m: Record<string, string> = {
    NO_DATA: "no data",
    WEAK: "weak",
    PROMISING: "promising shadow",
    STRONG_SHADOW: "strong shadow",
    NEEDS_EXACT_ZONE_DATA: "needs exact zone data",
  };
  return m[s] ?? s;
}

function mapReadiness(s: string): string {
  const m: Record<string, string> = {
    OBSERVE_ONLY: "observe only",
    CONTINUE_LOGGING: "continue logging",
    EXACT_ZONE_DETECTOR_RECOMMENDED: "exact-zone detector recommended",
    ELIGIBLE_FOR_REVIEW_AFTER_100: "eligible for review after 100+",
  };
  return m[s] ?? s;
}

function mapExactZoneReadiness(s: string): string {
  const m: Record<string, string> = {
    EXACT_ZONE_READY: "exact zones ready",
    PARTIAL_DATA_ONLY: "partial structured data",
    HEURISTIC_ONLY: "heuristic only",
    MISSING_REQUIRED_DATA: "missing required data",
  };
  return m[s] ?? s;
}

function mapD5SampleTier(s: string): string {
  const m: Record<string, string> = {
    NO_DATA: "no data",
    INFORMATIONAL_LT_50: "informational (<50)",
    EARLY_PATTERN_50_TO_99: "early pattern (50-99)",
    REVIEW_ELIGIBLE_100_PLUS: "review eligible (100+)",
  };
  return m[s] ?? s;
}

function warningFlagsLabel(flags: string[]): string {
  if (!flags.length) return NA;
  return flags.slice(0, 3).join(", ");
}

function pct(v: number | null | undefined): string {
  return typeof v === "number" && Number.isFinite(v) ? `${(v * 100).toFixed(0)}%` : NA;
}

function dominantCountLabel(counts: Record<string, number>): string {
  const entries = Object.entries(counts).filter(([, count]) => Number.isFinite(count) && count > 0);
  if (!entries.length) return NA;
  entries.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return `${entries[0]![0]} (${entries[0]![1]})`;
}

function exactRuntimeState(history: PaperVM["trendEvidenceDecisionSummary"]["mtfObFvgShadowSummary"]): {
  label: string;
  tone: "neutral" | "green" | "amber" | "red";
} {
  if (history.exactZoneSamples == null) return { label: "not exposed", tone: "neutral" };
  if (history.exactZoneSamples === 0) return { label: "no exact samples yet", tone: "neutral" };
  if ((history.usesExactObFvgZonesCount ?? 0) === 0) return { label: "producer ran, no valid exact candidate yet", tone: "amber" };
  return { label: "exact candidates observed", tone: "green" };
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
    <div className="flex items-center justify-between gap-2 rounded-lg border border-[#e5d5bf] bg-[#fffaf1] px-2.5 py-1.5">
      <span className="text-[11px] font-bold text-[#7a6a59]">{label}</span>
      <span className={`text-right text-[12px] font-black ${cls}`}>{value}</span>
    </div>
  );
}

export default function MtfObFvgShadowCard({ paper }: { paper: PaperVM }) {
  const ts = paper.trendStrategy;
  const pf = paper.trendPaperExecutionPreflight;
  const cfg = paper.trendPaperConfigPublic;
  const zone = ts.entryZone ?? paper.trendZoneCandidate?.pullbackZone ?? null;
  const direction = (pf.direction ?? ts.direction) as MtfDirection | null;
  const history = paper.trendEvidenceDecisionSummary.mtfObFvgShadowSummary;
  const d5 = paper.trendEvidenceDecisionSummary.exactZoneComparisonSummary;
  const review = reviewMtfObFvgShadowSummary(history);
  const exactState = exactRuntimeState(history);

  const r = computeMtfObFvgRefinementShadow({
    direction,
    currentEntry: pf.entry ?? mid(zone),
    currentStop: pf.stopLoss ?? ts.invalidation ?? paper.trendZoneCandidate?.invalidation,
    currentTarget: pf.takeProfit1 ?? ts.target1 ?? paper.trendZoneCandidate?.targets.t1,
    currentRawRR: ts.rewardRisk ?? pf.rewardRisk,
    requiredRR: cfg.minRewardRisk,
    feePct: cfg.feePct,
    slippagePct: cfg.slippagePct,
    regime: paper.canonicalMarketRegime.regime ?? paper.regimeEvidence.decision.regime,
    adx: num(paper.regimeEvidence.indicators.adx.value),
    atr: num(paper.regimeEvidence.indicators.atr.value),
    atrPct: num(paper.regimeEvidence.indicators.atrPct.value),
    bbw: num(paper.regimeEvidence.indicators.bbw.value),
    currentPrice: ts.currentPrice,
    distanceToEntryZonePct: ts.distanceToEntryZonePct,
    entryZone: zone,
    optionalObZone: null,
    optionalFvgZone: null,
    optionalLiquidityTarget: paper.trendZoneCandidate?.targets.t1 ?? ts.target1,
    optionalInvalidation: paper.trendZoneCandidate?.invalidation ?? ts.invalidation,
  });

  const badge =
    r.classification === "REFINEMENT_IMPROVES_RR" || r.classification === "ENTRY_GEOMETRY_NEAR_MISS"
      ? "border-emerald-300 bg-emerald-50 text-emerald-800"
      : r.classification === "COST_DRAG_DOMINANT" || r.classification === "REFINEMENT_STILL_FAILS_COST"
        ? "border-amber-300 bg-amber-50 text-amber-900"
        : r.classification === "NO_DATA" || r.classification === "NO_REFINEMENT_AVAILABLE"
          ? "border-[#e5d5bf] bg-[#fffaf1] text-[#7a6a59]"
          : "border-sky-300 bg-sky-50 text-sky-900";

  return (
    <section className="flex flex-col gap-2 rounded-xl border border-[#e5d5bf] bg-[#fffaf1] p-3 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex min-w-0 items-center gap-2 text-[13px] font-black text-[#2b2118]">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-violet-100 text-[12px]" aria-hidden="true">
            MTF
          </span>
          <span className="truncate">MTF OB/FVG Shadow</span>
        </h2>
        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-black ${badge}`}>
          {mapClassification(r.classification)}
        </span>
      </div>

      <div className="rounded-lg border border-[#e5d5bf] bg-white/70 px-2.5 py-1.5 text-[11px] font-bold text-[#6e5b49]">
        {mapDataStatus(r.dataStatus)} · confidence {r.confidence} · quality {r.qualityScore}/100
      </div>

      <div className="grid grid-cols-1 gap-1.5">
        <Row label="current rawRR / netRR" value={`${fmt(r.currentRawRR)} / ${fmt(r.currentNetRR)}`} />
        <Row
          label="refined rawRR / netRR"
          value={`${fmt(r.refinedRawRR)} / ${fmt(r.refinedNetRR)}`}
          tone={r.rrImprovement != null && r.rrImprovement > 0 ? "green" : "neutral"}
        />
        <Row label="RR improvement" value={fmt(r.rrImprovement)} tone={r.rrImprovement != null && r.rrImprovement > 0 ? "green" : "neutral"} />
        <Row
          label="netRR improvement"
          value={fmt(r.netRrImprovement)}
          tone={r.netRrImprovement != null && r.netRrImprovement > 0 ? "green" : "neutral"}
        />
        <Row label="requiredRR" value={fmt(r.requiredRR)} />
        <Row label="refined entry estimate" value={fmt(r.refinedEntryEstimate, 1)} />
      </div>

      <div className="rounded-lg border border-[#e5d5bf] bg-white/70 p-2">
        <div className="mb-1 text-[10px] font-black uppercase tracking-wide text-[#7a6a59]">shadow history</div>
        <div className="grid grid-cols-1 gap-1.5">
          <Row label="samples" value={String(history.totalShadowSamples)} tone={history.totalShadowSamples >= 50 ? "green" : "amber"} />
          <Row label="avg current netRR" value={fmt(history.averageCurrentNetRR)} />
          <Row
            label="avg refined netRR"
            value={fmt(history.averageRefinedNetRR)}
            tone={history.averageRefinedNetRR != null && history.averageCurrentNetRR != null && history.averageRefinedNetRR > history.averageCurrentNetRR ? "green" : "neutral"}
          />
          <Row
            label="avg netRR improvement"
            value={fmt(history.averageNetRrImprovement)}
            tone={history.averageNetRrImprovement != null && history.averageNetRrImprovement > 0 ? "green" : "neutral"}
          />
          <Row label="pass net / samples" value={`${history.passNetCount}/${history.totalShadowSamples}`} />
          <Row label="quality avg" value={fmt(history.qualityScoreAverage, 0)} />
        </div>
        {history.sampleWarning ? (
          <p className="mt-1.5 text-[10px] font-bold text-amber-900">
            Need 50-100 samples before using this for decisions.
          </p>
        ) : null}
      </div>

      <div className="rounded-lg border border-violet-200 bg-violet-50/70 p-2">
        <div className="mb-1 text-[10px] font-black uppercase tracking-wide text-violet-900">shadow review</div>
        <div className="grid grid-cols-1 gap-1.5">
          <Row
            label="sample tier"
            value={mapSampleTier(review.sampleTier)}
            tone={review.sampleCount >= 100 ? "green" : review.sampleCount >= 50 ? "amber" : "neutral"}
          />
          <Row
            label="evidence grade"
            value={mapEvidenceGrade(review.evidenceGrade)}
            tone={review.evidenceGrade === "STRONG_SHADOW" || review.evidenceGrade === "PROMISING" ? "green" : review.evidenceGrade === "WEAK" ? "amber" : "neutral"}
          />
          <Row label="readiness" value={mapReadiness(review.readiness)} />
          <Row
            label="exact zone readiness"
            value={mapExactZoneReadiness(review.exactZoneReadiness)}
            tone={review.exactZoneReadiness === "EXACT_ZONE_READY" ? "green" : review.exactZoneReadiness === "HEURISTIC_ONLY" ? "amber" : "neutral"}
          />
          <Row label="pass net rate" value={pct(review.passNetRate)} />
          <Row label="dominant status" value={review.dataStatusDominant ?? NA} />
        </div>
        <p className="mt-1.5 text-[10px] font-black text-violet-950">
          Shadow review only — ไม่ใช่สัญญาณเข้าไม้
        </p>
        <p className="mt-1 text-[10px] font-bold text-violet-900">
          Exact OB/FVG zones required before activation · No entry logic changed
        </p>
        <p className="mt-1 text-[10px] font-bold text-[#6e5b49]">{review.recommendedNextStep}</p>
        {review.warnings.slice(0, 2).map((warning) => (
          <p key={warning} className="mt-1 text-[10px] font-bold text-amber-900">
            {warning}
          </p>
        ))}
      </div>

      <div className="rounded-lg border border-sky-200 bg-sky-50/70 p-2">
        <div className="mb-1 text-[10px] font-black uppercase tracking-wide text-sky-900">Exact Zone Runtime</div>
        <div className="grid grid-cols-1 gap-1.5">
          <Row label="state" value={exactState.label} tone={exactState.tone} />
          <Row label="exact samples" value={history.exactZoneSamples == null ? "not exposed" : String(history.exactZoneSamples)} />
          <Row
            label="uses exact OB/FVG zones"
            value={history.usesExactObFvgZonesCount == null ? "not exposed" : String(history.usesExactObFvgZonesCount)}
            tone={(history.usesExactObFvgZonesCount ?? 0) > 0 ? "green" : "neutral"}
          />
          <Row label="dominant exact status" value={dominantCountLabel(history.exactZoneDataStatusCounts)} />
          <Row label="dominant exact readiness" value={dominantCountLabel(history.exactZoneReadinessCounts)} />
          <Row label="exact avg netRR" value={fmt(history.exactAvgNetRR)} />
          <Row
            label="exact vs heuristic delta"
            value={fmt(history.exactVsHeuristicAvgDelta)}
            tone={history.exactVsHeuristicAvgDelta != null && history.exactVsHeuristicAvgDelta > 0 ? "green" : "neutral"}
          />
        </div>
        <p className="mt-1.5 text-[10px] font-bold text-sky-900">
          Read-only runtime evidence Â· no entry logic change Â· no OB/FVG execution
        </p>
      </div>

      <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 p-2">
        <div className="mb-1 text-[10px] font-black uppercase tracking-wide text-emerald-900">D5 Exact vs Heuristic</div>
        <div className="grid grid-cols-1 gap-1.5">
          <Row label="sample tier" value={mapD5SampleTier(d5.sampleTier)} tone={d5.exactSamples >= 100 ? "green" : d5.exactSamples >= 50 ? "amber" : "neutral"} />
          <Row label="exact samples" value={String(d5.exactSamples)} />
          <Row label="heuristic samples" value={String(d5.heuristicSamples)} />
          <Row label="exact avg netRR" value={fmt(d5.exactAvgNetRR)} />
          <Row label="heuristic avg netRR" value={fmt(d5.heuristicAvgNetRR)} />
          <Row
            label="exact vs heuristic delta"
            value={fmt(d5.avgExactVsHeuristicDelta)}
            tone={d5.avgExactVsHeuristicDelta != null && d5.avgExactVsHeuristicDelta > 0 ? "green" : d5.avgExactVsHeuristicDelta != null && d5.avgExactVsHeuristicDelta < 0 ? "red" : "neutral"}
          />
          <Row label="exact pass rate" value={pct(d5.exactPassRate)} />
          <Row label="uses exact OB/FVG zones" value={String(d5.usesExactObFvgZonesCount)} />
          <Row label="dominant exact status" value={d5.dominantExactStatus ?? dominantCountLabel(d5.exactDataStatusCounts)} />
          <Row label="dominant exact readiness" value={d5.dominantExactReadiness ?? dominantCountLabel(d5.exactReadinessCounts)} />
          <Row label="fill status" value={d5.fillResolution.status} />
          <Row label="warning flags" value={warningFlagsLabel(d5.warningFlags)} tone={d5.warningFlags.length > 1 ? "amber" : "neutral"} />
        </div>
        <p className="mt-1.5 text-[10px] font-black text-emerald-950">
          Comparison only — ไม่ใช่สัญญาณเข้าไม้
        </p>
        <p className="mt-1 text-[10px] font-bold text-emerald-900">
          Need &gt;=100 exact samples for review eligibility
        </p>
        <p className="mt-1 text-[10px] font-bold text-[#6e5b49]">
          No activation from this card
        </p>
      </div>

      <div className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] font-bold text-amber-900">
        Shadow only - ไม่เปลี่ยน entry จริง · ยังไม่ใช่คำแนะนำให้ลด RR หรือเปิด execution
      </div>
      <p className="text-[10px] font-bold text-[#9a8a72]">
        {r.reason} · no threshold change · no runner decision change · paper-only
      </p>
    </section>
  );
}
