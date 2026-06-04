import type { PaperVM } from "@/lib/trading-agent-hq/viewModel";
import { formatRegridNumber, noTradeReasonLabel, regridStatusLabel } from "@/lib/trading-agent-hq/regridDisplay";

type TrendRegimeConfirmationCardProps = {
  paper: PaperVM;
};

function Field({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border border-[#d6c2a6] bg-white/75 px-2 py-1.5">
      <div className="text-[10px] font-black text-[#8a6a4f]">{label}</div>
      <div className="mt-0.5 break-words text-[12px] font-black text-[#2f241b]">{value}</div>
    </div>
  );
}

function IndicatorPlaceholder({ label }: { label: string }) {
  return (
    <div className="rounded-md border border-dashed border-[#c8b395] bg-[#fffaf2] px-2 py-1.5">
      <div className="text-[10px] font-black text-[#8a6a4f]">{label}</div>
      <div className="mt-0.5 text-[12px] font-black text-[#7a6550]">ยังไม่มีข้อมูล</div>
    </div>
  );
}

function classifyTrend(paper: PaperVM): string {
  const regrid = paper.dynamicRegrid;
  const mode = (regrid.marketMode ?? "").toUpperCase();
  const regime = (regrid.regime ?? "").toUpperCase();
  const combined = `${mode} ${regime}`;
  const confirmedDowntrend = combined.includes("DOWNTREND_CONFIRMED") || combined.includes("DOWN_TREND_CONFIRMED");
  const suspectedDowntrend = combined.includes("DOWNTREND") || combined.includes("TREND_DOWN") || combined.includes("DOWN_TREND");
  const rangeLike = combined.includes("GRID") || combined.includes("RANGE") || combined.includes("NEUTRAL");

  if (confirmedDowntrend) return "Downtrend confirmed";
  if (suspectedDowntrend) return "Downtrend suspected";
  if (regrid.priceVsGrid === "INSIDE_GRID" && rangeLike) return "Active Grid / Range-like";
  if (regrid.priceVsGrid === "BELOW_GRID" || regrid.priceVsGrid === "ABOVE_GRID") return "Out-of-Grid";
  if (rangeLike) return "Range-like";
  return "Unknown / No trade";
}

function interpretation(paper: PaperVM): string[] {
  const regrid = paper.dynamicRegrid;
  const mode = (regrid.marketMode ?? "").toUpperCase();
  const regime = (regrid.regime ?? "").toUpperCase();
  const combined = `${mode} ${regime}`;
  const hasConfirmedTrend = combined.includes("CONFIRMED") && (combined.includes("DOWN") || combined.includes("UP"));

  if (regrid.priceVsGrid === "BELOW_GRID" && !hasConfirmedTrend) {
    return ["หลุดกรอบล่าง — ต้องตรวจแนวโน้ม", "ยังไม่ยืนยัน Downtrend เต็มระบบ"];
  }
  if (regrid.priceVsGrid === "ABOVE_GRID" && !hasConfirmedTrend) {
    return ["หลุดกรอบบน — ต้องตรวจแนวโน้ม"];
  }
  if (regrid.priceVsGrid === "INSIDE_GRID") {
    return ["ราคาอยู่ในกรอบ — ประเมินโหมดกริดได้"];
  }
  return ["ยังไม่มีข้อมูลยืนยันแนวโน้มเพียงพอ"];
}

export default function TrendRegimeConfirmationCard({ paper }: TrendRegimeConfirmationCardProps) {
  const regrid = paper.dynamicRegrid;
  const candidate = regrid.candidate;
  const lines = interpretation(paper);

  return (
    <section className="rounded-lg border border-[#d1b58c] bg-[#f4efe7] p-3 text-[#3f2f22] shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-black text-[#2f241b]">Trend / Regime Confirmation</h2>
          <p className="mt-0.5 text-[11px] font-bold text-[#80644c]">
            อ่านสถานะจาก API เท่านั้น ไม่คำนวณ indicator ใหม่ และไม่สร้างคำตัดสินเทรด
          </p>
        </div>
        <span className="rounded-full bg-white px-2 py-1 text-[10px] font-black text-[#5b4432]">
          {classifyTrend(paper)}
        </span>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Market mode" value={regrid.marketMode ?? "ยังไม่มีข้อมูล"} />
        <Field label="Regime" value={regrid.regime ?? "ยังไม่มีข้อมูล"} />
        <Field label="priceVsGrid" value={regridStatusLabel(regrid.priceVsGrid)} />
        <Field label="paperLoopState" value={regridStatusLabel(regrid.paperLoopState)} />
        <Field label="currentPrice" value={formatRegridNumber(regrid.currentPrice)} />
        <Field label="gridLower" value={formatRegridNumber(regrid.gridLower)} />
        <Field label="gridUpper" value={formatRegridNumber(regrid.gridUpper)} />
        <Field label="gridMid" value={formatRegridNumber(regrid.gridMid)} />
        <Field label="lastNoTradeReason" value={noTradeReasonLabel(regrid.lastNoTradeReason)} />
        <Field label="candidateStatus" value={regridStatusLabel(candidate.candidateStatus)} />
        <Field label="candidateReason" value={candidate.candidateReason ?? "ยังไม่มีข้อมูล"} />
      </div>

      <div className="mt-3 grid gap-2 md:grid-cols-2">
        {lines.map((line) => (
          <div key={line} className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] font-black text-amber-950">
            {line}
          </div>
        ))}
        <div className="rounded-md border border-[#d6c2a6] bg-white/70 px-3 py-2 text-[12px] font-black text-[#5b4432]">
          ยังไม่มีข้อมูลยืนยัน ADX/DI/RSI/Structure ใน API นี้
        </div>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <IndicatorPlaceholder label="ADX" />
        <IndicatorPlaceholder label="+DI" />
        <IndicatorPlaceholder label="-DI" />
        <IndicatorPlaceholder label="RSI" />
        <IndicatorPlaceholder label="ATR" />
        <IndicatorPlaceholder label="Market Structure" />
        <IndicatorPlaceholder label="Trend Status" />
      </div>
    </section>
  );
}
