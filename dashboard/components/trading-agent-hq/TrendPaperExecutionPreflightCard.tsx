import type { PaperVM } from "@/lib/trading-agent-hq/viewModel";

type Props = { paper: PaperVM };

const NA = "ยังไม่มีข้อมูล";

function fmt(v: number | null | undefined): string {
  if (typeof v !== "number" || !Number.isFinite(v)) return NA;
  return v.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function statusLabel(s: string): string {
  switch (s) {
    case "NOT_READY": return "ยังไม่พร้อม";
    case "READY_FOR_PAPER_SIMULATION_REVIEW": return "พร้อมให้ตรวจ (paper review)";
    case "BLOCKED": return "บล็อกเพื่อความปลอดภัย";
    case "EXPIRED": return "หมดอายุ";
    case "INVALIDATED": return "Setup invalidated";
    default: return NA;
  }
}

function statusStyle(s: string): string {
  if (s === "BLOCKED" || s === "EXPIRED" || s === "INVALIDATED") return "border-red-300 bg-red-50 text-red-900";
  if (s === "READY_FOR_PAPER_SIMULATION_REVIEW") return "border-amber-300 bg-amber-50 text-amber-900";
  return "border-[#d6c2a6] bg-white/70 text-[#5b4432]";
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-[#d6c2a6] bg-white/75 px-2 py-1.5">
      <div className="text-[10px] font-black text-[#8a6a4f]">{label}</div>
      <div className="mt-0.5 break-words text-[12px] font-black text-[#2f241b]">{value}</div>
    </div>
  );
}

export default function TrendPaperExecutionPreflightCard({ paper }: Props) {
  const p = paper.trendPaperExecutionPreflight;
  const yn = (v: boolean | undefined) => (v ? "ใช่" : "ไม่");

  return (
    <section className="rounded-lg border border-[#d1b58c] bg-[#f4efe7] p-3 text-[#3f2f22] shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-black text-[#2f241b]">Trend Paper Execution Preflight (Shadow)</h2>
          <p className="mt-0.5 text-[11px] font-bold text-[#80644c]">
            ตรวจความพร้อม input อ่านอย่างเดียว ยังไม่ส่งคำสั่ง ไม่จำลอง fill ไม่เขียน journal
          </p>
        </div>
        <span className={`rounded-full px-2 py-1 text-[10px] font-black ${statusStyle(p?.status ?? "UNKNOWN")}`}>
          {statusLabel(p?.status ?? "UNKNOWN")}
        </span>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Direction" value={p?.direction ?? NA} />
        <Field label="Entry" value={fmt(p?.entry)} />
        <Field label="Stop Loss" value={fmt(p?.stopLoss)} />
        <Field label="Target 1" value={fmt(p?.takeProfit1)} />
        <Field label="Reward/Risk" value={fmt(p?.rewardRisk)} />
        <Field label="Setup ID" value={p?.setupId ?? NA} />
        <Field label="Passed" value={String(p?.passedInputs?.length ?? 0)} />
        <Field label="Failed" value={String(p?.failedInputs?.length ?? 0)} />
        <Field label="journalWriteAllowed" value={yn(p?.journalWriteAllowed)} />
        <Field label="simulatedFillAllowed" value={yn(p?.simulatedFillAllowed)} />
        <Field label="paper/arm/live" value={`${yn(p?.paperActivationAllowed)}/${yn(p?.paperArmAllowed)}/${yn(p?.liveActivationAllowed)}`} />
      </div>

      {p?.failedInputs?.length ? (
        <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-bold text-amber-950">
          input ยังไม่ครบ: {p.failedInputs.join(" · ")}
        </div>
      ) : null}

      <div className="mt-3 rounded-md border border-[#d6c2a6] bg-white/70 px-3 py-2 text-[12px] font-black text-[#5b4432]">
        Preflight อ่านอย่างเดียว — ไม่ส่งคำสั่ง ไม่จำลอง fill ไม่เขียน trend journal · ไม่ใช้ exposure BUY เดิมของ Grid · ห้ามเงินจริง
      </div>
    </section>
  );
}
