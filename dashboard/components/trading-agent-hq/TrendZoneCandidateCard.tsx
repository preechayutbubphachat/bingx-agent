import type { PaperVM } from "@/lib/trading-agent-hq/viewModel";

type TrendZoneCandidateCardProps = {
  paper: PaperVM;
};

const NA = "ยังไม่มีข้อมูล";

function fmt(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return NA;
  return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function buildStatusLabel(status: string): string {
  switch (status) {
    case "READY": return "พร้อม (Shadow)";
    case "INSUFFICIENT_DATA": return "ข้อมูลไม่พอ";
    case "NOT_TREND": return "ไม่ใช่เทรนด์ — ไม่สร้างโซน";
    case "FAILED": return "สร้างโซนไม่สำเร็จ";
    default: return NA;
  }
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-[#d6c2a6] bg-white/75 px-2 py-1.5">
      <div className="text-[10px] font-black text-[#8a6a4f]">{label}</div>
      <div className="mt-0.5 break-words text-[12px] font-black text-[#2f241b]">{value}</div>
    </div>
  );
}

export default function TrendZoneCandidateCard({ paper }: TrendZoneCandidateCardProps) {
  const tz = paper.trendZoneCandidate;
  const dirLabel = tz?.dir === "DOWN" ? "ขาลง (DOWN)" : tz?.dir === "UP" ? "ขาขึ้น (UP)" : NA;
  const zone = tz?.pullbackZone ? `${fmt(tz.pullbackZone[0])} – ${fmt(tz.pullbackZone[1])}` : NA;

  return (
    <section className="rounded-lg border border-[#d1b58c] bg-[#f4efe7] p-3 text-[#3f2f22] shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-black text-[#2f241b]">Trend Zone Candidate (Shadow)</h2>
          <p className="mt-0.5 text-[11px] font-bold text-[#80644c]">
            อ่านจาก API เท่านั้น — ระดับเทรนด์เชิงวิเคราะห์ ไม่ใช้ส่งคำสั่ง
          </p>
        </div>
        <span className="rounded-full bg-white px-2 py-1 text-[10px] font-black text-[#5b4432]">
          {buildStatusLabel(tz?.buildStatus ?? "UNKNOWN")}
        </span>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Direction" value={dirLabel} />
        <Field label="Pullback Zone" value={zone} />
        <Field label="Invalidation" value={fmt(tz?.invalidation)} />
        <Field label="Trigger Rule" value={tz?.triggerRule ?? NA} />
        <Field label="Entry Hint" value={tz?.entry.hint ?? NA} />
        <Field label="Target 1" value={fmt(tz?.targets.t1)} />
        <Field label="Target 2" value={fmt(tz?.targets.t2)} />
        <Field label="Build Status" value={buildStatusLabel(tz?.buildStatus ?? "UNKNOWN")} />
        <Field label="Swing High 1H" value={fmt(tz?.smc.swingHigh1h)} />
        <Field label="Swing Low 1H" value={fmt(tz?.smc.swingLow1h)} />
        <Field label="EQ 1H" value={fmt(tz?.smc.eq1h)} />
        <Field label="Liquidity Note" value={tz?.smc.liquidityNote ?? NA} />
      </div>

      {tz?.warnings?.length ? (
        <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-bold text-amber-950">
          {tz.warnings.join(" · ")}
        </div>
      ) : null}

      <div className="mt-3 rounded-md border border-[#d6c2a6] bg-white/70 px-3 py-2 text-[12px] font-black text-[#5b4432]">
        Trend Zone เป็น Shadow diagnostics เท่านั้น ยังไม่ใช้ส่งคำสั่ง และยังไม่ปลดล็อก M-0B
      </div>
    </section>
  );
}
