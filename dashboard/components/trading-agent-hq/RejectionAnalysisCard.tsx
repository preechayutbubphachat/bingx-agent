"use client";

// dashboard/components/trading-agent-hq/RejectionAnalysisCard.tsx
// Phase T-3H-6-a — read-only Rejection Analysis (observability only).
// SAFETY: presentation only. No fetch, no write route, no settings/action buttons,
// no order/live/exchange surface. Consumes ONLY vm.paper.trendEvidenceDecisionSummary.
// แสดงข้อมูลเพื่อสังเกตเท่านั้น — ไม่ใช่คำแนะนำให้ปรับ gate

import type { PaperVM } from "@/lib/trading-agent-hq/viewModel";
// T-3H-6-a1: pure display-only taxonomy (never imported by decision logic)
import { groupRejectReasonCounts } from "@/lib/trend/rejectReasonTaxonomy";

const NA = "ไม่มีข้อมูล";

function fmtTime(iso: string | null): string {
  if (!iso) return NA;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return NA;
  return new Date(t).toLocaleString("th-TH", { hour12: false });
}

function CountBar({ label, count, max, barClass = "bg-[#f0a737]" }: { label: string; count: number; max: number; barClass?: string }) {
  const pct = max > 0 ? Math.max(6, Math.round((count / max) * 100)) : 0;
  return (
    <li className="rounded-lg border border-[#e5d5bf] bg-[#fffaf1] px-2.5 py-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-[11px] font-bold text-[#5b4432]" title={label}>{label}</span>
        <span className="shrink-0 text-[12px] font-black text-[#2b2118]">{count}</span>
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-[#efe2cd]">
        <div className={`h-full rounded-full ${barClass}`} style={{ width: `${pct}%` }} />
      </div>
    </li>
  );
}

function DistChips({ title, counts }: { title: string; counts: Record<string, number> }) {
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);
  if (!entries.length) return null;
  return (
    <div>
      <div className="mb-1 text-[11px] font-black text-[#2b2118]">{title}</div>
      <div className="flex flex-wrap gap-1.5">
        {entries.map(([k, v]) => (
          <span key={k} className="rounded-full border border-[#e5d5bf] bg-[#fffaf1] px-2 py-0.5 text-[10px] font-bold text-[#7a6a59]">
            {k} · {v}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function RejectionAnalysisCard({ paper }: { paper: PaperVM }) {
  const s = paper.trendEvidenceDecisionSummary;
  const missed = s.staleCycleEstimate?.missedCycles ?? 0;
  // T-3H-6-a1: group raw counts by taxonomy — display-only, raw counts preserved in the VM.
  const g = groupRejectReasonCounts(s.rejectReasonCounts);
  const maxHard = g.hardBlockers.length ? g.hardBlockers[0]!.count : 0;
  const maxSoft = g.softWaits.length ? g.softWaits[0]!.count : 0;

  return (
    <section className="flex flex-col gap-2.5 rounded-xl border border-[#e5d5bf] bg-[#fffaf1] p-3 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex min-w-0 items-center gap-2 text-[13px] font-black text-[#2b2118]">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-amber-100 text-[14px]" aria-hidden="true">📊</span>
          <span className="truncate">Rejection Analysis</span>
        </h2>
        <span className="flex shrink-0 items-center gap-1.5">
          <span className={`h-2 w-2 rounded-full ${s.available ? "bg-[#4caf74]" : "bg-[#c9b48f]"}`} aria-hidden="true" />
          <span className="rounded-full border border-[#e5d5bf] bg-[#fffaf1] px-2 py-0.5 text-[10px] font-black text-[#7a6a59]">
            observe only
          </span>
        </span>
      </div>

      {!s.available ? (
        <p className="rounded-lg border border-[#e5d5bf] bg-white/60 px-3 py-3 text-center text-[11px] font-bold text-[#9a8a72]">
          ยังไม่มีข้อมูล decision log — จะเริ่มสะสมหลัง evidence cycle รอบถัดไป
        </p>
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5 text-[10px] font-bold text-[#7a6a59]">
            <span className="rounded-full bg-[#f3e8d6] px-2 py-0.5">Sample: {s.totalRecords} cycles</span>
            <span className="rounded-full bg-[#f3e8d6] px-2 py-0.5">ล่าสุด: {fmtTime(s.latestRecordedAt)}</span>
            {s.windowStart ? (
              <span className="rounded-full bg-[#f3e8d6] px-2 py-0.5">window: 48 ชม.</span>
            ) : null}
            {missed > 0 ? (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-900">รอบหายโดยประมาณ: {missed}</span>
            ) : (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-800">รอบครบตาม cadence</span>
            )}
          </div>

          {/* T-3H-6-a1: taxonomy grouping — hard blockers first, pass/context clearly separated */}
          <div>
            <div className="mb-1 flex items-center gap-1.5 text-[11px] font-black text-[#2b2118]">
              <span aria-hidden="true">🚫</span> Top hard blockers
              <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[9px] font-black text-red-800">{g.hardBlockerCount}</span>
            </div>
            {g.hardBlockers.length ? (
              <ul className="flex flex-col gap-1">
                {g.hardBlockers.slice(0, 5).map((r) => (
                  <CountBar key={r.reason} label={r.reason} count={r.count} max={maxHard} barClass="bg-[#e75b52]" />
                ))}
              </ul>
            ) : (
              <p className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-800">
                ไม่มี hard blocker ใน window นี้
              </p>
            )}
          </div>

          {g.softWaits.length ? (
            <div>
              <div className="mb-1 flex items-center gap-1.5 text-[11px] font-black text-[#2b2118]">
                <span aria-hidden="true">⏳</span> Soft waits
              </div>
              <ul className="flex flex-col gap-1">
                {g.softWaits.slice(0, 4).map((r) => (
                  <CountBar key={r.reason} label={r.reason} count={r.count} max={maxSoft} barClass="bg-[#f0a737]" />
                ))}
              </ul>
            </div>
          ) : null}

          {g.passContext.length || g.info.length ? (
            <div>
              <div className="mb-1 flex items-center gap-1.5 text-[11px] font-black text-[#2b2118]">
                <span aria-hidden="true">✅</span> Pass/context signals
              </div>
              <div className="flex flex-wrap gap-1.5">
                {g.passContext.slice(0, 6).map((r) => (
                  <span key={r.reason} className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                    {r.reason} · {r.count}
                  </span>
                ))}
                {g.info.slice(0, 4).map((r) => (
                  <span key={r.reason} className="rounded-full border border-[#e5d5bf] bg-[#fffaf1] px-2 py-0.5 text-[10px] font-bold text-[#7a6a59]">
                    {r.reason} · {r.count}
                  </span>
                ))}
              </div>
              <p className="mt-1 text-[9px] font-bold text-[#9a8a72]">
                Pass/context signals are not blockers — เป็นเงื่อนไขที่ “ผ่านแล้ว” ที่ runner log ไว้เป็นบริบทเท่านั้น
              </p>
            </div>
          ) : null}

          <p className="text-[9px] font-bold text-[#b3a285]">
            raw reasons ทั้งหมดใน window: {g.totalReasonCount} ครั้ง (จาก {s.totalRecords} cycles)
          </p>

          <DistChips title="Decision distribution" counts={s.decisionCounts} />
          <DistChips title="Gate status distribution" counts={s.gateStatusCounts} />

          {s.sampleWarning ? (
            <p className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] font-bold text-amber-950">
              ตัวอย่างยังน้อย — ยังไม่มีคำแนะนำจูน (no tuning recommendation yet)
            </p>
          ) : null}
        </>
      )}

      <p className="text-[10px] font-bold text-[#9a8a72]">
        ยังไม่ใช่คำแนะนำให้ปรับ gate — เก็บข้อมูลก่อน · Action: observe only · paper-only · อ่านอย่างเดียว
      </p>
    </section>
  );
}
