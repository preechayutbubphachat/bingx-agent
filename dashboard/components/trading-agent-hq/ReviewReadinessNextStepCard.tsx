import type { PaperVM, ReviewReadinessDimensionVM, ShadowEvidenceCoverageRequirementVM } from "@/lib/trading-agent-hq/viewModel";

function value(v: number | null | undefined, suffix = ""): string {
  return typeof v === "number" && Number.isFinite(v) ? `${v}${suffix}` : "—";
}

function boolText(v: boolean | null | undefined): string {
  if (v === true) return "true";
  if (v === false) return "false";
  return "unknown";
}

function statusLabel(status: string | null | undefined): string {
  if (status === "NOT_READY") return "ยังไม่พร้อม";
  if (status === "PARTIAL_REVIEW") return "พร้อมรีวิวบางส่วน";
  if (status === "READY_FOR_REVIEW") return "พร้อมให้คนรีวิว";
  if (status === "NO_DATA") return "ยังไม่มีข้อมูล";
  return status ?? "ยังไม่มีข้อมูล";
}

function scoreTypeLabel(scoreType: string | null | undefined): string {
  if (scoreType === "REVIEW_READINESS_NOT_ACTIVATION") return "ใช้เพื่อรีวิวเท่านั้น · ไม่ใช่สัญญาณเปิดเทรด";
  return scoreType ?? "ใช้เพื่อรีวิวเท่านั้น · ไม่ใช่สัญญาณเปิดเทรด";
}

function dimensionStatusLabel(status: string): string {
  if (status === "NO_REALIZED_EDGE_SAMPLE") return "ยังไม่มีรอบปิดจริง";
  if (status === "LOW_QUALITY_NOT_READY") return "ข้อมูลยังคุณภาพต่ำ";
  if (status === "NO_DATA_INVALIDATED") return "ยังไม่มีข้อมูล / แผนถูก invalidated";
  if (status === "EXPLAINED_WITH_DIAGNOSTICS_GAP") return "อธิบายเหตุผลได้แล้ว แต่ diagnostics ยังไม่ครบ";
  return status || "ยังไม่มีข้อมูล";
}

function requirementLabel(id: string): string {
  if (id === "range_subset") return "ตลาด RANGE";
  if (id === "entry_touch") return "ราคาแตะ Entry";
  if (id === "price_context_diversity") return "Price context";
  if (id === "dynamic_grid_diversity") return "Dynamic Grid context";
  if (id === "unknown_context_dilution") return "ลด UNKNOWN context";
  if (id === "context_ready_setups") return "Context-ready setups";
  if (id === "context_ready_resolved") return "Context-ready resolved";
  return id;
}

function unitLabel(unit: string): string {
  if (unit === "samples") return "samples";
  if (unit === "buckets") return "buckets";
  if (unit === "context_ready_samples") return "context-ready samples";
  return unit;
}

function milestoneTitle(id: string | null | undefined): string {
  if (id === "PRICE_CONTEXT_DIVERSITY") return "เพิ่ม Price Context ให้หลากหลายขึ้น";
  return id ?? "Milestone ถัดไปที่ระบบต้องเก็บเพิ่ม";
}

function milestoneDescription(id: string | null | undefined, fallback: string | undefined): string {
  if (id === "PRICE_CONTEXT_DIVERSITY") return "ระบบต้องเห็น setup ในบริบทของราคาที่ต่างจากเดิม";
  return fallback || "Milestone ถัดไปที่ระบบต้องเก็บเพิ่ม";
}

function blockerTitle(code: string | null | undefined): string {
  if (code === "GRID_EXPOSURE_GUARD_PAUSE") return "Grid Exposure Guard Pause";
  return code ?? "NO_BLOCKER_EXPOSED";
}

function blockerExplanation(code: string | null | undefined, fallback: string | undefined): string {
  if (code === "GRID_EXPOSURE_GUARD_PAUSE") {
    return "กริดถูกหยุด เพราะมี BUY exposure ฝั่งเดียว ยังไม่มี SELL มาปิดรอบ";
  }
  return `${fallback ?? code ?? "ไม่พบตัวบล็อกหลัก"} · ตรวจรายละเอียดใน no-trade analysis`;
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
        {dimensionStatusLabel(dim.status)}
      </div>
    </div>
  );
}

function RequirementRow({ req }: { req: ShadowEvidenceCoverageRequirementVM }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-[#eadbc9] bg-white/75 px-2.5 py-1.5 text-[11px]">
      <span className="min-w-0 flex-1 truncate font-bold text-[#2b2118]" title={req.note || req.id}>
        {requirementLabel(req.id)}
      </span>
      <span className="shrink-0 font-black text-[#8a5b18]">
        ขาด {req.remaining} {unitLabel(req.unit)}
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
          <h2 className="text-[14px] font-black text-[#2b2118]">ความพร้อมสำหรับรีวิว / ขั้นตอนถัดไป</h2>
          <p className="text-[12px] font-bold text-[#7a6a59]">Review readiness data not available yet</p>
          <p className="text-[11px] text-[#9a8a72]">คะแนนนี้ใช้บอกความพร้อมสำหรับการรีวิวเท่านั้น ไม่ใช่สัญญาณเปิดเทรด ไม่ใช่ Live และไม่ใช่การส่ง Order</p>
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
              <h2 className="text-[14px] font-black text-[#2b2118]">ความพร้อมสำหรับรีวิว / ขั้นตอนถัดไป</h2>
              <span className={`rounded-full border px-2 py-0.5 text-[10px] font-black ${statusTone(score.overallStatus)}`}>
                {statusLabel(score.overallStatus)}
              </span>
            </div>
            <div className="mt-2 text-[32px] font-black leading-none text-[#2b2118]">{value(score.overallScore)} / 100</div>
            <div className="mt-1 text-[10px] font-black tracking-wide text-[#7a6a59]">{scoreTypeLabel(score.scoreType)}</div>
            <div className="mt-1 text-[10px] leading-relaxed text-[#9a8a72]">
              ยิ่งคะแนนสูง ยิ่งพร้อมให้มนุษย์รีวิว แต่ไม่ใช่การอนุญาตให้เทรด
            </div>
          </div>
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-[11px] font-bold leading-relaxed text-amber-900">
            คะแนนนี้ใช้บอกความพร้อมสำหรับการรีวิวเท่านั้น ไม่ใช่สัญญาณเปิดเทรด ไม่ใช่ Live และไม่ใช่การส่ง Order
          </div>
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
            <DimChip label="Grid / กริด" dim={score.dimensions.grid} />
            <DimChip label="Shadow / ข้อมูลเงา" dim={score.dimensions.shadow} />
            <DimChip label="Trend / เทรนด์" dim={score.dimensions.trend} />
            <DimChip label="No-trade / เหตุผลไม่เปิดไม้" dim={score.dimensions.noTradeExplanation} />
          </div>

          <div className="grid grid-cols-1 gap-2 xl:grid-cols-[1.4fr_1fr_0.9fr]">
            <div className="rounded-lg border border-[#e5d5bf] bg-[#fffdf8] p-2">
              <div className="mb-1 text-[11px] font-black text-[#7a6a59]">ยังขาดอะไรถึงไปขั้นถัดไป</div>
              {missing.length === 0 ? (
                <div className="rounded-lg border border-[#eadbc9] bg-white/75 px-2.5 py-2 text-[11px] font-bold text-[#7a6a59]">
                  ยังไม่มีรายการหลักฐานที่ระบบเปิดเผยเพิ่มเติม
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
              <div className="mb-1 text-[11px] font-black text-[#7a6a59]">Milestone ถัดไป</div>
              <div className="text-[13px] font-black text-[#2b2118]">{milestoneTitle(milestone?.id)}</div>
              <div className="mt-1 text-[11px] font-bold text-[#7a6a59]">
                {milestone ? `ขาด ${milestone.remaining} ${unitLabel(milestone.unit)}` : "ยังไม่มี milestone เพิ่มเติม"}
              </div>
              <div className="mt-1 text-[10px] leading-relaxed text-[#9a8a72]">
                {milestoneDescription(milestone?.id, milestone?.description)}
              </div>
            </div>

            <div className="rounded-lg border border-[#e5d5bf] bg-[#fffdf8] p-2">
              <div className="mb-1 text-[11px] font-black text-[#7a6a59]">ตัวบล็อกหลักตอนนี้</div>
              <div className="text-[12px] font-black text-[#2b2118]">{blockerTitle(primary?.code)}</div>
              <div className="mt-1 text-[10px] leading-relaxed text-[#7a6a59]">{blockerExplanation(primary?.code, primary?.label)}</div>
              <div className="mt-2 flex flex-wrap gap-1">
                <span className="rounded-full border border-[#e5d5bf] bg-white px-2 py-0.5 text-[10px] font-black text-[#7a6a59]">
                  {score.activationAllowed === false ? "ยังไม่อนุญาตให้ Activate" : `activationAllowed=${boolText(score.activationAllowed)}`}
                </span>
                <span className="rounded-full border border-[#e5d5bf] bg-white px-2 py-0.5 text-[10px] font-black text-[#7a6a59]">
                  {score.reviewOnly === true ? "ใช้เพื่อรีวิวเท่านั้น" : `reviewOnly=${boolText(score.reviewOnly)}`}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
