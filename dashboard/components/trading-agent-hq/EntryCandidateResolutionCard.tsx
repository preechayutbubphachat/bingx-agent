"use client";

// D8.0/D8.1 - compact read-only resolver and pullback-gate summary.

import type { PaperVM } from "@/lib/trading-agent-hq/viewModel";

const NA = "ไม่มีข้อมูล";

function fmt(value: number | null | undefined, digits = 2): string {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(digits) : NA;
}

function pct(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? `${value.toFixed(3)}%` : NA;
}

function tone(status: string): string {
  if (status === "CLEAN_REVIEW_CANDIDATE" || status === "RR_REPAIRED_REVIEW_ONLY") {
    return "border-emerald-300/35 bg-emerald-950/35 text-emerald-100";
  }
  if (status === "NO_TRADE_BAD_RR" || status === "COUNTER_REGIME_ONLY") {
    return "border-rose-300/35 bg-rose-950/35 text-rose-100";
  }
  return "border-amber-300/35 bg-amber-950/35 text-amber-100";
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] items-start gap-2 border-b border-white/5 py-1.5 last:border-b-0">
      <span className="text-[10px] font-bold text-slate-400">{label}</span>
      <span className="break-words text-right text-[11px] font-black text-cyan-50">{value}</span>
    </div>
  );
}

export default function EntryCandidateResolutionCard({ paper }: { paper: PaperVM }) {
  const resolution = paper.entryCandidateResolution;
  const gate = paper.operatorSummary.pullbackGate;
  const gateRaw = paper.resolverDrivenPullbackGate;

  return (
    <section className="rounded-lg border border-cyan-300/20 bg-slate-950/85 p-3 shadow-[0_12px_28px_rgba(2,8,23,0.44)]">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[10px] font-black uppercase text-cyan-300">Entry Candidate Resolution</div>
          <h2 className="mt-0.5 text-[13px] font-black text-cyan-50">สรุปจุดเข้าและ RR</h2>
        </div>
        <span className={`max-w-[160px] break-words rounded-md border px-2 py-1 text-right text-[9px] font-black ${tone(resolution.entryResolutionStatus)}`}>
          {resolution.entryResolutionStatus}
        </span>
      </div>

      <div className="mt-2 rounded-md border border-white/10 bg-slate-950/45 px-2.5">
        <Row label="Aligned direction" value={resolution.alignedDirection} />
        <Row label="Current-price location" value={resolution.priceLocation} />
        <Row label="Best RR / Threshold" value={`${fmt(resolution.rrBest)} / ${fmt(resolution.rrThreshold)}`} />
        <Row label="Counter-regime rejected" value={String(resolution.rejectedOppositeCount)} />
      </div>

      <div className="mt-2 rounded-md border border-cyan-300/20 bg-cyan-950/20 p-2 text-[11px] font-bold leading-relaxed text-cyan-100">
        <div className="font-black">Next action</div>
        <div className="break-words">{resolution.nextAction || NA}</div>
      </div>

      <div className="mt-2 rounded-md border border-amber-300/20 bg-amber-950/15 p-2">
        <div className="flex items-start justify-between gap-2">
          <div className="text-[10px] font-black uppercase text-amber-200">Pullback &amp; Confirmation Gate</div>
          <span className={`max-w-[150px] break-words rounded-md border px-1.5 py-0.5 text-right text-[9px] font-black ${tone(gate.pullbackGateStatus)}`}>
            {gate.pullbackGateStatus}
          </span>
        </div>
        <div className="mt-1.5 border-t border-white/5 pt-1">
          <Row label="Aligned / Distance" value={`${gate.alignedDirection} / ${pct(gate.priceDistanceToZonePct)}`} />
          <Row label="Best RR / Threshold" value={`${fmt(gate.bestRR)} / ${fmt(gate.rrThreshold)}`} />
          <Row label="Confirmation" value={gate.confirmationStatus} />
        </div>
        <div className="mt-1.5 break-words text-[10px] font-bold leading-relaxed text-amber-100">
          Next action: {gate.nextAction || NA}
        </div>
      </div>

      <div className="mt-2 flex flex-wrap gap-1 text-[9px] font-black text-emerald-100">
        <span className="rounded-md border border-emerald-300/25 bg-emerald-950/35 px-1.5 py-0.5">review-only</span>
        <span className="rounded-md border border-emerald-300/25 bg-emerald-950/35 px-1.5 py-0.5">no activation</span>
        <span className="rounded-md border border-emerald-300/25 bg-emerald-950/35 px-1.5 py-0.5">no order</span>
      </div>

      <details className="mt-2 rounded-md border border-white/10 bg-slate-950/45 p-2 text-[10px] text-slate-300">
        <summary className="cursor-pointer font-black text-slate-200">Raw RR, pullback gate and rejected candidates</summary>
        <div className="mt-2 space-y-1.5">
          <div className="rounded-md border border-amber-300/15 bg-amber-950/15 p-1.5">
            <div className="font-black text-amber-100">{gateRaw.status} / {gateRaw.confirmationStatus}</div>
            <div className="break-words text-amber-200">Blockers: {gateRaw.blockers.join(", ") || NA}</div>
            <div className="break-words text-slate-400">Do not: {gateRaw.doNotDo.join("; ") || NA}</div>
          </div>
          {resolution.rrScenarios.map((scenario) => (
            <div key={scenario.name} className="rounded-md border border-white/5 bg-black/15 p-1.5">
              <div className="font-black text-cyan-100">{scenario.name}</div>
              <div>{scenario.available ? `RR ${fmt(scenario.rr)} · ${scenario.meetsThreshold ? "threshold pass" : "threshold fail"}` : "unavailable"}</div>
              {scenario.notes.length ? <div className="break-words text-slate-400">{scenario.notes.join("; ")}</div> : null}
            </div>
          ))}
          {resolution.rejectedOppositeCandidates.map((candidate) => (
            <div key={candidate.id} className="rounded-md border border-rose-300/15 bg-rose-950/15 p-1.5">
              <div className="font-black text-rose-100">{candidate.direction} · {candidate.qualityStatus}</div>
              <div className="break-words text-rose-200">{candidate.blockers.join(", ") || NA}</div>
            </div>
          ))}
        </div>
      </details>
    </section>
  );
}
