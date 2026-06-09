import type { PaperVM } from "@/lib/trading-agent-hq/viewModel";

type Props = { paper: PaperVM };

const NA = "ยังไม่มีข้อมูล";

// Read-only status card. Buttons DISABLED by design (same token-exposure reasoning as T-3G):
// the internal evidence-cycle route needs a server secret, so calling it from the browser is unsafe.
const ACTIONS = ["Run Once", "Refresh"];

function fmt(v: number | null | undefined, digits = 2): string {
  if (typeof v !== "number" || !Number.isFinite(v)) return NA;
  return v.toLocaleString("en-US", { maximumFractionDigits: digits });
}
function fmtR(v: number | null | undefined): string {
  if (typeof v !== "number" || !Number.isFinite(v)) return NA;
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}R`;
}
function phaseStyle(s: string): string {
  if (s === "SAFETY_BLOCKED") return "border-red-300 bg-red-50 text-red-900";
  if (s === "REVIEW_READY") return "border-emerald-300 bg-emerald-50 text-emerald-900";
  if (s === "EVIDENCE_COLLECTION") return "border-amber-300 bg-amber-50 text-amber-900";
  return "border-[#d6c2a6] bg-white/70 text-[#5b4432]";
}
function Field({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`rounded-md border px-2 py-1.5 ${strong ? "border-[#b08a5e] bg-[#fbf4e8]" : "border-[#d6c2a6] bg-white/75"}`}>
      <div className="text-[10px] font-black text-[#8a6a4f]">{label}</div>
      <div className="mt-0.5 break-words text-[12px] font-black text-[#2f241b]">{value}</div>
    </div>
  );
}

export default function TrendPaperEvidenceRunnerCard({ paper }: Props) {
  const r = paper.trendPaperEvidenceRunner;
  const yn = (v: boolean | undefined) => (v ? "ใช่" : "ไม่");

  return (
    <section className="rounded-lg border border-[#d1b58c] bg-[#f4efe7] p-3 text-[#3f2f22] shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-black text-[#2f241b]">Trend Paper Evidence Runner (Read-only)</h2>
          <p className="mt-0.5 text-[11px] font-bold text-[#80644c]">
            Evidence Runner เป็น paper-only · ยังไม่ติด cron · ไม่ส่งคำสั่ง BingX · ไม่ใช่เงินจริง · ไม่ปลดล็อก M-0B
          </p>
        </div>
        <span className={`rounded-full px-2 py-1 text-[10px] font-black ${phaseStyle(r?.evidencePhase ?? "DISABLED")}`}>
          {r?.evidencePhase ?? "DISABLED"}
        </span>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Enabled" value={yn(r?.enabled)} />
        <Field label="simulationEnabled" value={yn(r?.simulationEnabled)} />
        <Field label="evidenceRunnerEnabled" value={yn(r?.evidenceRunnerEnabled)} />
        <Field label="Last Decision" value={r?.lastDecision ?? NA} />
        <Field label="Last Gate" value={r?.lastGateStatus ?? NA} />
        <Field label="Last Run At" value={r?.lastRunAt ?? NA} />
        <Field label="Entries (today/max)" value={`${r?.dailyEntryCount ?? 0}/${r?.maxEntriesPerDay ?? NA}`} />
        <Field label="Daily Loss" value={fmtR(r?.dailyLossR)} />
        <Field label="Cooldown Until" value={r?.cooldownUntil ?? "—"} />
        <Field label="Open Position" value={r?.openTrendPosition ? `${r.openTrendPosition.direction ?? "?"} ${r.openTrendPosition.positionId ?? ""}` : "ไม่มี"} />
        <Field label="Closed Trades (n/target)" value={`${r?.trendClosedTrades ?? 0}/${r?.targetClosedTrades ?? 30}`} strong />
        <Field label="Sample Status" value={r?.sampleStatus ?? NA} strong />
        <Field label="Win Rate" value={r?.winRate != null ? `${(r.winRate * 100).toFixed(1)}%` : NA} />
        <Field label="Expectancy R" value={fmtR(r?.expectancyR)} strong />
        <Field label="Profit Factor" value={fmt(r?.profitFactor)} />
        <Field label="Max Drawdown" value={fmtR(r?.maxDrawdownR)} />
        <Field label="Max Consec Losses" value={r?.maxConsecutiveLossesObserved != null ? String(r.maxConsecutiveLossesObserved) : NA} />
        <Field label="Ready For Next Phase" value={yn(r?.readyForNextPhase)} />
        <Field label="liveActivationAllowed" value={yn(r?.liveActivationAllowed)} />
        <Field label="exchangeOrderAllowed" value={yn(r?.exchangeOrderAllowed)} />
      </div>

      {r?.lastRejectReasons?.length ? (
        <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-bold text-amber-950">
          เหตุผลที่ยังไม่เข้า: {r.lastRejectReasons.join(" · ")}
        </div>
      ) : null}
      {r?.stopReason ? (
        <div className="mt-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[11px] font-black text-red-950">
          STOP: {r.stopReason}
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        {ACTIONS.map((label) => (
          <button
            key={label}
            type="button"
            disabled
            aria-disabled="true"
            title="ปิดไว้: ต้องยืนยัน admin-auth ก่อน (กัน token หลุดไป browser) — operator ใช้ internal route ผ่าน server"
            className="cursor-not-allowed rounded-md border border-[#d6c2a6] bg-[#efe6d6] px-3 py-1.5 text-[12px] font-black text-[#9a8a72] opacity-60"
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mt-3 rounded-md border border-[#d6c2a6] bg-white/70 px-3 py-2 text-[12px] font-black text-[#5b4432]">
        แสดงสถานะอย่างเดียว — ไม่มีปุ่ม run/live/exchange/cron/M-0B · runner สั่งผ่าน internal route ที่ auth-gated เท่านั้น (ไม่ผ่าน browser)
      </div>
    </section>
  );
}
