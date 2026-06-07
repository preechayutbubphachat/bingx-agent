import type { PaperVM } from "@/lib/trading-agent-hq/viewModel";

type Props = { paper: PaperVM };

const NA = "ยังไม่มีข้อมูล";

function fmt(v: number | null | undefined, digits = 2): string {
  if (typeof v !== "number" || !Number.isFinite(v)) return NA;
  return v.toLocaleString("en-US", { maximumFractionDigits: digits });
}

function fmtR(v: number | null | undefined): string {
  if (typeof v !== "number" || !Number.isFinite(v)) return NA;
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}R`;
}

function fmtPct(v: number | null | undefined): string {
  if (typeof v !== "number" || !Number.isFinite(v)) return NA;
  return `${(v * 100).toFixed(1)}%`;
}

function statusLabel(s: string): string {
  switch (s) {
    case "NO_DATA": return "ยังไม่มี journal";
    case "INSUFFICIENT_DATA": return "ยังไม่มี closed trade";
    case "EARLY_SAMPLE": return "sample เริ่มต้น (<10)";
    case "USABLE_SAMPLE": return "sample พอใช้ (10–19)";
    case "REVIEW_SAMPLE": return "sample ระดับ review (20–29)";
    case "PRODUCTION_CANDIDATE_REVIEW": return "sample พอประเมิน (≥30)";
    default: return NA;
  }
}

function decisionLabel(s: string): string {
  switch (s) {
    case "HOLD": return "HOLD (คงไว้)";
    case "CONTINUE_PAPER": return "เก็บ paper ต่อ";
    case "PARAMETER_REVIEW": return "ทบทวน parameter";
    case "PAUSE_STRATEGY": return "หยุด strategy";
    case "READY_FOR_LIMITED_CANARY_REVIEW": return "เสนอ operator review";
    default: return NA;
  }
}

function decisionStyle(s: string): string {
  if (s === "PAUSE_STRATEGY") return "border-red-300 bg-red-50 text-red-900";
  if (s === "READY_FOR_LIMITED_CANARY_REVIEW") return "border-emerald-300 bg-emerald-50 text-emerald-900";
  if (s === "PARAMETER_REVIEW" || s === "CONTINUE_PAPER") return "border-amber-300 bg-amber-50 text-amber-900";
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

export default function TrendEdgeReviewCard({ paper }: Props) {
  const p = paper.trendEdgeReview;
  const yn = (v: boolean | undefined) => (v ? "ใช่" : "ไม่");

  return (
    <section className="rounded-lg border border-[#d1b58c] bg-[#f4efe7] p-3 text-[#3f2f22] shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-black text-[#2f241b]">Trend Edge Review (Shadow)</h2>
          <p className="mt-0.5 text-[11px] font-bold text-[#80644c]">
            ประเมิน trend paper edge อ่านอย่างเดียว — netExpectancyAfterCosts คือตัวตัดสินหลัก · ยังไม่มี execution/journal จริง
          </p>
        </div>
        <span className={`rounded-full px-2 py-1 text-[10px] font-black ${decisionStyle(p?.decision ?? "UNKNOWN")}`}>
          {decisionLabel(p?.decision ?? "UNKNOWN")}
        </span>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Status" value={statusLabel(p?.status ?? "UNKNOWN")} />
        <Field label="Closed Trades" value={String(p?.trendClosedTrades ?? 0)} />
        <Field label="Sample Tier" value={p?.sampleTier ?? NA} />
        <Field label="Win Rate" value={fmtPct(p?.winRate)} />
        <Field label="Expectancy (gross)" value={fmtR(p?.expectancyR)} />
        <Field label="Net Expectancy (after costs)" value={fmtR(p?.netExpectancyAfterCosts)} strong />
        <Field label="Profit Factor" value={fmt(p?.profitFactor)} />
        <Field label="Max Drawdown" value={fmtR(p?.maxDrawdownR)} />
        <Field label="Max Consec. Losses" value={p?.maxConsecutiveLosses != null ? String(p.maxConsecutiveLosses) : NA} />
        <Field label="Risk of Ruin" value={fmtPct(p?.riskOfRuinEstimate)} />
        <Field label="Cost Drag" value={fmtR(p?.costDrag)} />
        <Field label="paper/live" value={`${yn(p?.paperActivationAllowed)}/${yn(p?.liveActivationAllowed)}`} />
      </div>

      {p?.notes?.length ? (
        <div className="mt-3 rounded-md border border-[#d6c2a6] bg-white/70 px-3 py-2 text-[11px] font-bold text-[#5b4432]">
          {p.notes.map((n, i) => <div key={i}>· {n}</div>)}
        </div>
      ) : null}

      <div className="mt-3 rounded-md border border-[#d6c2a6] bg-white/70 px-3 py-2 text-[12px] font-black text-[#5b4432]">
        ประเมินผล paper เท่านั้น · ยังไม่ใช่สัญญาณเทรดจริง — trend edge ไม่ปลดล็อก grid · grid ไม่ปลดล็อก trend · old grid exposure quarantined · ห้ามเงินจริง
      </div>
    </section>
  );
}
