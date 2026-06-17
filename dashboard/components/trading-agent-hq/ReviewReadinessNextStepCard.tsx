import type { PaperVM } from "@/lib/trading-agent-hq/viewModel";
import { buildEvidenceWaitingRoomModel, evidenceTooltip, type EvidenceWaitingRoomTone } from "@/lib/trading-agent-hq/evidenceWaitingRoom";

function toneClasses(tone: EvidenceWaitingRoomTone): string {
  if (tone === "ready-review") return "border-emerald-200 bg-emerald-50 text-emerald-950";
  if (tone === "partial-review") return "border-cyan-200 bg-cyan-50 text-cyan-950";
  if (tone === "blocked") return "border-rose-200 bg-rose-50 text-rose-950";
  if (tone === "safety-lock") return "border-violet-200 bg-violet-50 text-violet-950";
  return "border-amber-200 bg-amber-50 text-amber-950";
}

function progressFillClass(tone: EvidenceWaitingRoomTone): string {
  if (tone === "ready-review") return "bg-emerald-500";
  if (tone === "partial-review") return "bg-cyan-500";
  return "bg-amber-500";
}

function HelpLabel({ term, children }: { term: string; children?: string }) {
  const text = evidenceTooltip(term);
  return (
    <span className="inline-flex items-center gap-1" title={text ?? undefined}>
      <span>{children ?? term}</span>
      {text ? (
        <span className="grid h-4 w-4 place-items-center rounded-full border border-current text-[9px] font-black opacity-70" aria-label={`${term} help`}>
          ?
        </span>
      ) : null}
    </span>
  );
}

function StepDot({
  index,
  label,
  status,
  activeTone,
}: {
  index: number;
  label: string;
  status: "current" | "locked" | "future";
  activeTone: EvidenceWaitingRoomTone;
}) {
  const tone =
    status === "current"
      ? toneClasses(activeTone)
      : status === "future"
        ? "border-[#dcc9ad] bg-[#fffaf1] text-[#7a6a59]"
        : "border-[#eadbc9] bg-white/65 text-[#a08d74]";

  return (
    <div className={`flex min-w-[132px] flex-1 items-start gap-2 rounded-lg border px-2.5 py-2 ${tone}`}>
      <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full border border-current text-[10px] font-black">
        {index + 1}
      </span>
      <div className="min-w-0">
        <div className="text-[10px] font-black leading-tight">{label}</div>
        <div className="mt-0.5 text-[9px] font-bold opacity-75">
          {status === "current" ? "ตอนนี้" : status === "future" ? "ผ่านเป็นข้อมูลรีวิว" : "ล็อกไว้"}
        </div>
      </div>
    </div>
  );
}

function InfoChip({ label, value, strong = false, helpTerm }: { label: string; value: string; strong?: boolean; helpTerm?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-black ${
        strong ? "border-[#8a5b18] bg-[#fff1cf] text-[#4d3211]" : "border-[#eadbc9] bg-white/75 text-[#6d5745]"
      }`}
    >
      <span className="text-[#9a8a72]">{helpTerm ? <HelpLabel term={helpTerm}>{label}</HelpLabel> : label}:</span>
      <span>{value}</span>
    </span>
  );
}

function requirementHelpTerm(id: string): string | null {
  const normalized = id.toLowerCase();
  if (normalized === "range_subset") return "RANGE";
  if (normalized === "entry_touch") return "Entry-touch";
  if (normalized === "price_context_diversity") return "Price context";
  if (normalized === "dynamic_grid_diversity") return "Dynamic Grid context";
  if (normalized === "unknown_context_dilution") return "UNKNOWN context";
  return null;
}

export default function ReviewReadinessNextStepCard({ paper }: { paper: PaperVM }) {
  const model = buildEvidenceWaitingRoomModel(paper);

  return (
    <section className="rounded-xl border border-[#d8c2a5] bg-[#fff7ea] p-3 text-[#2b2118] shadow-sm">
      <div className={`mb-3 rounded-lg border px-3 py-2 text-[12px] font-black leading-relaxed ${toneClasses(model.tone)}`}>
        {model.compactSummary}
      </div>
      <div className="grid grid-cols-1 gap-3 2xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]">
        <div className="min-w-0 space-y-3">
          <div className="rounded-lg border border-[#d8c2a5] bg-[#fffdf8] p-3">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-[15px] font-black text-[#2b2118]">โหมดรอข้อมูลตลาด / Evidence Waiting Room</h2>
                  <span className="rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-black text-rose-900">
                    ไม่ใช่สัญญาณเปิดเทรด
                  </span>
                </div>
                <p className="mt-1 text-[12px] font-bold leading-relaxed text-[#6d5745]">
                  ระบบกำลังเก็บหลักฐานเพื่อให้มนุษย์รีวิว ไม่ใช่สัญญาณเปิดเทรด
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5 xl:justify-end">
                <InfoChip label="Review Score" value={model.scoreText} strong helpTerm="Review Readiness" />
                <InfoChip label="Status" value={model.statusText} />
                <InfoChip label="Stage" value={model.stage.label} />
                <InfoChip label="Safety" value="ไม่ใช่ Activation" helpTerm="Activation" />
                <InfoChip label="Live" value="ปิดอยู่" helpTerm="Live" />
                <InfoChip label="Order" value="ปิดอยู่" helpTerm="Order" />
              </div>
            </div>
            <div className="mt-3 rounded-lg border border-[#eadbc9] bg-white/80 p-2.5">
              <div className="flex items-center justify-between gap-3 text-[11px] font-black text-[#6d5745]">
                <span>{model.progress.label}</span>
                <span>{model.progress.percent}% · Review only</span>
              </div>
              <div className="mt-2 h-2 rounded-full bg-[#eadbc9]">
                <div className={`h-2 rounded-full ${progressFillClass(model.tone)}`} style={{ width: `${model.progress.percent}%` }} />
              </div>
              <p className="mt-1 text-[10px] font-bold text-[#8a6f55]">คะแนนนี้ไม่ใช่สัญญาณเปิดเทรด</p>
            </div>
            <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] font-bold leading-relaxed text-amber-950">
              ตอนนี้ยังไม่ต้องทำอะไรกับตลาด ให้รอข้อมูลผ่านเงื่อนไขด้านล่างก่อน
            </p>
          </div>

          <div className="rounded-lg border border-[#e5d5bf] bg-[#fffdf8] p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-[13px] font-black text-[#2b2118]">Project Progress Ladder</h3>
              <span className="text-[11px] font-black text-[#8a5b18]">{model.stage.resultLine}</span>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
              {model.progressSteps.map((step, index) => (
                <StepDot key={step.label} index={index} label={step.label} status={step.status} activeTone={model.tone} />
              ))}
            </div>
            <div className="mt-2 grid grid-cols-1 gap-1.5 text-[11px] font-bold text-[#7a6a59] md:grid-cols-3">
              <div className="rounded-lg border border-[#eadbc9] bg-white/70 px-2.5 py-2">ผ่านขั้นนี้ไม่ได้แปลว่าเปิดเทรด</div>
              <div className="rounded-lg border border-[#eadbc9] bg-white/70 px-2.5 py-2">ทุกขั้นหลังจากนี้ต้องมี operator review</div>
              <div className="rounded-lg border border-[#eadbc9] bg-white/70 px-2.5 py-2">Live trading ต้องมี manual approval แยกต่างหาก</div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 xl:grid-cols-[1.2fr_0.8fr]">
            <div className="rounded-lg border border-[#e5d5bf] bg-[#fffdf8] p-3">
              <h3 className="text-[13px] font-black text-[#2b2118]">
                <HelpLabel term="Entry-touch">ต้องรออะไรอีก</HelpLabel>
              </h3>
              <p className="mt-1 text-[11px] font-bold text-[#7a6a59]">
                เมื่อรายการนี้ลดลง คะแนน Review Readiness จะค่อย ๆ ดีขึ้น
              </p>
              <div className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {model.missingRequirements.length > 0 ? (
                  model.missingRequirements.slice(0, 6).map((req) => (
                    <div key={req.id} className="rounded-lg border border-[#eadbc9] bg-white/75 px-2.5 py-2 text-[11px] font-black text-[#6d5745]" title={evidenceTooltip(requirementHelpTerm(req.id) ?? "") ?? undefined}>
                      {req.text}
                    </div>
                  ))
                ) : (
                  <div className="rounded-lg border border-[#eadbc9] bg-white/75 px-2.5 py-2 text-[11px] font-bold text-[#9a8a72] sm:col-span-2">
                    {model.missingRequirementsFallback ?? "รายการหลักที่ขาดลดลงแล้ว ให้ดู milestone ถัดไป"}
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-lg border border-[#e5d5bf] bg-[#fffdf8] p-3">
              <h3 className="text-[13px] font-black text-[#2b2118]">คะแนนย่อย</h3>
              <div className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2 xl:grid-cols-1">
                {model.dimensionChips.map((dim) => (
                  <div key={dim.label} className="flex items-center justify-between gap-2 rounded-lg border border-[#eadbc9] bg-white/75 px-2.5 py-2">
                    <span className="text-[11px] font-black text-[#2b2118]">
                      <HelpLabel term={dim.label}>{dim.label}</HelpLabel>: {dim.score}
                    </span>
                    <span className="min-w-0 truncate text-right text-[10px] font-bold text-[#7a6a59]" title={dim.status}>
                      {dim.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="min-w-0 space-y-3">
          <div className="rounded-lg border border-[#e5d5bf] bg-[#fffdf8] p-3">
            <h3 className="text-[13px] font-black text-[#2b2118]">
              <HelpLabel term="Grid Exposure Guard">ตัวบล็อกหลักตอนนี้</HelpLabel>
            </h3>
            <div className="mt-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2">
              <div className="text-[13px] font-black text-amber-950">{model.blocker.title}</div>
              <p className="mt-1 text-[11px] font-bold leading-relaxed text-rose-900">{model.blocker.explanation}</p>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-1.5">
              <InfoChip label="ราคา" value={model.blocker.details.priceVsGrid} helpTerm="Price context" />
              <InfoChip label="Dynamic Grid" value={model.blocker.details.dynamicGridStatus} helpTerm="Dynamic Grid context" />
              <InfoChip label="Regrid" value={model.blocker.details.regridReadinessStatus} />
              <InfoChip label="Trend" value={model.blocker.details.trendStrategyStatus} helpTerm="Trend" />
            </div>
          </div>

          <div className="rounded-lg border border-[#e5d5bf] bg-[#fffdf8] p-3">
            <h3 className="text-[13px] font-black text-[#2b2118]">เกณฑ์ไปขั้นถัดไป</h3>
            <div className="mt-2 space-y-1.5 text-[11px] font-bold text-[#6d5745]">
              <div className="rounded-lg border border-[#eadbc9] bg-white/75 px-2.5 py-2">เริ่ม review เบื้องต้น: Review Score &gt;= 40</div>
              <div className="rounded-lg border border-[#eadbc9] bg-white/75 px-2.5 py-2">พร้อมให้มนุษย์ review จริง: Review Score &gt;= 70 และ Grid/Shadow ต้องมีคะแนนมากกว่า 0</div>
              <div className="rounded-lg border border-[#eadbc9] bg-white/75 px-2.5 py-2">เปิด Paper Activation / Phase 2-B: ต้องมี approval แยกต่างหาก</div>
              <div className="rounded-lg border border-[#eadbc9] bg-white/75 px-2.5 py-2">เปิดเงินจริง: ยังไม่เกี่ยวกับการ์ดนี้ ต้องผ่าน M-0B + Live Approval แยก</div>
            </div>
            <div className="mt-2 rounded-lg border border-[#d8c2a5] bg-[#fff1cf] px-2.5 py-2 text-[11px] font-black text-[#4d3211]">
              Next milestone: {model.nextMilestone}
            </div>
          </div>

          <div className="rounded-lg border border-violet-200 bg-violet-50 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-[13px] font-black text-violet-950">Safety Lock</h3>
              <span className="rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-black text-violet-900">ไม่ใช่ Live / ไม่ใช่ Order</span>
            </div>
            <p className="mt-1 text-[11px] font-bold leading-relaxed text-violet-900">
              ระบบนี้เป็น dashboard เพื่อการรีวิว ไม่ใช่ระบบส่งคำสั่ง
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {model.safetyLocks.map((lock) => (
                <span key={lock} className="rounded-full border border-violet-200 bg-white px-2 py-0.5 text-[10px] font-black text-violet-900" title={evidenceTooltip(lock.split(" ")[0]) ?? undefined}>
                  {lock}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
