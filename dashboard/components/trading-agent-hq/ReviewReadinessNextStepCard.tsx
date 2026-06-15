import type { PaperVM, ReviewReadinessDimensionVM, ShadowEvidenceCoverageRequirementVM } from "@/lib/trading-agent-hq/viewModel";

function value(v: number | null | undefined, suffix = ""): string {
  return typeof v === "number" && Number.isFinite(v) ? `${v}${suffix}` : "—";
}

function boolText(v: boolean | null | undefined): string {
  if (v === true) return "true";
  if (v === false) return "false";
  return "unknown";
}

function statusTone(status: string | null | undefined): string {
  if (status === "READY_FOR_REVIEW") return "border-emerald-300 bg-emerald-50 text-emerald-900";
  if (status === "PARTIAL_REVIEW") return "border-amber-300 bg-amber-50 text-amber-900";
  if (status === "NOT_READY") return "border-rose-300 bg-rose-50 text-rose-900";
  return "border-[#e5d5bf] bg-[#fffaf1] text-[#7a6a59]";
}

function DimChip({ label, dim }: { label: string; dim: ReviewReadinessDimensionVM }) {
  return (
    <div className="min-w-[132px] flex-1 rounded-lg border border-[#e5d5bf] bg-[#fffdf8] px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-black text-[#7a6a59]">{label}</span>
        <span className="text-[13px] font-black text-[#2b2118]">{value(dim.score)}</span>
      </div>
      <div className="mt-1 truncate text-[10px] font-bold text-[#9a8a72]" title={dim.status}>
        {dim.status || "NO_DATA"}
      </div>
    </div>
  );
}

function RequirementRow({ req }: { req: ShadowEvidenceCoverageRequirementVM }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-[#eadbc9] bg-white/75 px-2.5 py-1.5 text-[11px]">
      <span className="min-w-0 flex-1 truncate font-bold text-[#2b2118]" title={req.note || req.id}>
        {req.id}
      </span>
      <span className="shrink-0 font-black text-[#8a5b18]">
        {req.remaining} {req.unit}
      </span>
    </div>
  );
}

export default function ReviewReadinessNextStepCard({ paper }: { paper: PaperVM }) {
  const score = paper.reviewReadinessScore;
  const coverage = paper.shadowEvidenceCoverage;
  const noTrade = paper.noTradeReasonAnalysis;

  if (!score.available) {
    return (
      <section className="rounded-xl border border-[#e5d5bf] bg-[#fffaf1] p-3 shadow-sm">
        <div className="flex flex-col gap-1">
          <h2 className="text-[14px] font-black text-[#2b2118]">Review Readiness / Next Step</h2>
          <p className="text-[12px] font-bold text-[#7a6a59]">Review readiness data not available yet</p>
          <p className="text-[11px] text-[#9a8a72]">Review readiness only - not activation, not live, not order placement</p>
        </div>
      </section>
    );
  }

  const missing = (coverage?.requirements ?? []).filter((req) => !req.met);
  const milestone = coverage?.nextEvidenceMilestone ?? null;
  const primary = noTrade?.primaryReason ?? null;

  return (
    <section className="rounded-xl border border-[#e5d5bf] bg-[#fffaf1] p-3 shadow-sm">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-stretch">
        <div className="flex min-w-[220px] flex-col justify-between gap-3 rounded-lg border border-[#e5d5bf] bg-[#fffdf8] p-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-[14px] font-black text-[#2b2118]">Review Readiness / Next Step</h2>
              <span className={`rounded-full border px-2 py-0.5 text-[10px] font-black ${statusTone(score.overallStatus)}`}>
                {score.overallStatus ?? "NO_DATA"}
              </span>
            </div>
            <div className="mt-2 text-[32px] font-black leading-none text-[#2b2118]">{value(score.overallScore)} / 100</div>
            <div className="mt-1 text-[10px] font-black tracking-wide text-[#7a6a59]">{score.scoreType ?? "REVIEW_READINESS_NOT_ACTIVATION"}</div>
          </div>
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-[11px] font-bold leading-relaxed text-amber-900">
            {score.disclaimer ?? "Review readiness only - not activation, not live, not order placement"}
          </div>
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
            <DimChip label="Grid" dim={score.dimensions.grid} />
            <DimChip label="Shadow" dim={score.dimensions.shadow} />
            <DimChip label="Trend" dim={score.dimensions.trend} />
            <DimChip label="No-trade explanation" dim={score.dimensions.noTradeExplanation} />
          </div>

          <div className="grid grid-cols-1 gap-2 xl:grid-cols-[1.4fr_1fr_0.9fr]">
            <div className="rounded-lg border border-[#e5d5bf] bg-[#fffdf8] p-2">
              <div className="mb-1 text-[11px] font-black text-[#7a6a59]">What is still missing</div>
              {missing.length === 0 ? (
                <div className="rounded-lg border border-[#eadbc9] bg-white/75 px-2.5 py-2 text-[11px] font-bold text-[#7a6a59]">
                  No remaining evidence requirement is exposed yet.
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                  {missing.slice(0, 6).map((req) => (
                    <RequirementRow key={req.id} req={req} />
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-lg border border-[#e5d5bf] bg-[#fffdf8] p-2">
              <div className="mb-1 text-[11px] font-black text-[#7a6a59]">Next milestone</div>
              <div className="text-[13px] font-black text-[#2b2118]">{milestone?.id ?? "NO_MILESTONE"}</div>
              <div className="mt-1 text-[11px] font-bold text-[#7a6a59]">
                {milestone ? `${milestone.remaining} ${milestone.unit}` : "No milestone exposed yet"}
              </div>
              {milestone?.description ? <div className="mt-1 text-[10px] leading-relaxed text-[#9a8a72]">{milestone.description}</div> : null}
            </div>

            <div className="rounded-lg border border-[#e5d5bf] bg-[#fffdf8] p-2">
              <div className="mb-1 text-[11px] font-black text-[#7a6a59]">Current blocker</div>
              <div className="text-[12px] font-black text-[#2b2118]">{primary?.code ?? "NO_BLOCKER_EXPOSED"}</div>
              <div className="mt-1 text-[10px] leading-relaxed text-[#7a6a59]">{primary?.label ?? "No no-trade primary reason is available yet."}</div>
              <div className="mt-2 flex flex-wrap gap-1">
                <span className="rounded-full border border-[#e5d5bf] bg-white px-2 py-0.5 text-[10px] font-black text-[#7a6a59]">
                  activationAllowed={boolText(score.activationAllowed)}
                </span>
                <span className="rounded-full border border-[#e5d5bf] bg-white px-2 py-0.5 text-[10px] font-black text-[#7a6a59]">
                  reviewOnly={boolText(score.reviewOnly)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
