import type { PaperVM, SafetyVM } from "@/lib/trading-agent-hq/viewModel";
import {
  activationAllowedLabel,
  formatRegridNumber,
  noTradeReasonLabel,
  regridExposureLabel,
  regridStatusLabel,
} from "@/lib/trading-agent-hq/regridDisplay";

type DynamicRegridStatusCardProps = {
  paper: PaperVM;
  safety: SafetyVM;
};

function SafetyPill({ label, value }: { label: string; value: string }) {
  return (
    <span className="rounded-full border border-[#d8b98d] bg-[#fffaf0] px-2 py-1 text-[10px] font-black text-[#5b4432]">
      {label}: <span className="text-[#2f241b]">{value}</span>
    </span>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border border-[#e4cba8] bg-white/70 px-2 py-1">
      <div className="text-[10px] font-black uppercase tracking-wide text-[#8a6a4f]">{label}</div>
      <div className="mt-0.5 text-[12px] font-black text-[#2f241b]">{value}</div>
    </div>
  );
}

export default function DynamicRegridStatusCard({ paper, safety }: DynamicRegridStatusCardProps) {
  const regrid = paper.dynamicRegrid;
  const candidate = regrid.candidate;
  const activationLabel = activationAllowedLabel(candidate.activationAllowed);
  const cooldownText =
    typeof candidate.cooldownRemaining === "number"
      ? `รอแท่งนิ่งอีก ${candidate.cooldownRemaining}`
      : "รอข้อมูล cooldown";

  return (
    <section className="rounded-lg border border-[#d7b175] bg-[#fff8e7] p-3 text-[#3f2f22] shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-black text-[#2f241b]">สถานะ Dynamic Regrid</h2>
          <p className="mt-0.5 text-[11px] font-bold text-[#80644c]">
            อ่านอย่างเดียวจาก /api/paper-performance · ไม่เปิดกริดใหม่อัตโนมัติ
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <SafetyPill label="เงินจริง" value={safety.liveTradingEnabled ? "เปิด" : "ปิด"} />
          <SafetyPill label="คำสั่งจริง" value={safety.orderPlacementEnabled ? "เปิด" : "ปิด"} />
          <SafetyPill label="การอนุมัติ" value={safety.exchangeManualApproval === "approved" ? "อนุมัติแล้ว" : "ยังไม่อนุมัติ"} />
          <SafetyPill label="M-0B" value={safety.phase === "M-0B_BLOCKED" ? "ยังถูกบล็อก" : safety.phase} />
        </div>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-[1.2fr_1fr]">
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-[12px] leading-relaxed">
          <p className="font-black text-[#2f241b]">
            ระบบหยุดเปิด BUY เพิ่มแล้ว เพราะราคาอยู่นอกกรอบล่าง
          </p>
          <p className="mt-1">
            ตอนนี้อยู่ในโหมดประเมินกริดใหม่แบบอ่านอย่างเดียว ยังไม่เปิดกริดใหม่อัตโนมัติ
            ต้องรอ cooldown / stable candles / regime confirmation
          </p>
          <p className="mt-1 font-black text-red-800">
            M-0B ยังบล็อกเพราะ closedCycles = {paper.closedCycles}
          </p>
        </div>

        <div className="rounded-md border border-[#e4cba8] bg-white/65 p-3 text-[12px]">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Metric label="priceVsGrid" value={regridStatusLabel(regrid.priceVsGrid)} />
            <Metric label="paperLoopState" value={regridStatusLabel(regrid.paperLoopState)} />
            <Metric label="lastNoTradeReason" value={noTradeReasonLabel(regrid.lastNoTradeReason)} />
            <Metric label="candidateStatus" value={regridStatusLabel(candidate.candidateStatus)} />
            <Metric label="activationAllowed" value={activationLabel} />
            <Metric label="cooldownRemaining" value={cooldownText} />
          </div>
        </div>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="currentPrice" value={formatRegridNumber(regrid.currentPrice)} />
        <Metric label="gridLower" value={formatRegridNumber(regrid.gridLower)} />
        <Metric label="gridUpper" value={formatRegridNumber(regrid.gridUpper)} />
        <Metric label="gridMid" value={formatRegridNumber(regrid.gridMid)} />
        <Metric label="buyFillCount" value={regrid.buyFillCount} />
        <Metric label="sellFillCount" value={regrid.sellFillCount} />
        <Metric label="closedCycles" value={regrid.closedCycles} />
        <Metric
          label="stableCandleCount"
          value={typeof candidate.stableCandleCount === "number" ? candidate.stableCandleCount : "—"}
        />
      </div>

      <div className="mt-3 rounded-md border border-[#e4cba8] bg-white/60 p-2 text-[11px] leading-relaxed text-[#6d5745]">
        <span className="font-black text-[#2f241b]">Exposure: </span>
        {regridExposureLabel(regrid)}
        <span className="mx-2 text-[#b08a5a]">·</span>
        <span className="font-black text-[#2f241b]">candidateReason: </span>
        {candidate.candidateReason ?? "ยังไม่มีข้อมูล candidate reason"}
      </div>
    </section>
  );
}
