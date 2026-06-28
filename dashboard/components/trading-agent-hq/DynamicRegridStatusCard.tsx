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

function pct(value: number | null): string {
  return value == null ? "—" : `${value.toFixed(4)}%`;
}

function money(value: number | null): string {
  return value == null ? "—" : value.toFixed(4);
}

function boolText(value: boolean | null): string {
  if (value == null) return "—";
  return value ? "yes" : "no";
}

function ratio(value: number | null): string {
  return value == null ? "—" : `${value.toFixed(2)}x`;
}

function feeGrindLabel(value: PaperVM["costGateBreakdown"]["feeGrindRisk"]): string {
  switch (value) {
    case "HEALTHY_BUFFER": return "healthy buffer";
    case "THIN_BUFFER": return "thin buffer";
    case "FEE_GRIND_RISK": return "fee-grind risk";
    case "COST_GATE_FAIL": return "cost gate fail";
    default: return "no data";
  }
}

function isThinSpacingBuffer(cost: PaperVM["costGateBreakdown"]): boolean {
  return (
    (cost.spacingBufferRatio != null && cost.spacingBufferRatio < 1.2) ||
    cost.feeGrindRisk === "THIN_BUFFER" ||
    cost.feeGrindRisk === "FEE_GRIND_RISK" ||
    cost.feeGrindRisk === "COST_GATE_FAIL"
  );
}

function isLowVolOrBuilding(vol: PaperVM["volBaselineDiagnostic"]): boolean {
  const volState = (vol.volState ?? "").toUpperCase();
  return (
    volState.includes("LOW") ||
    volState.includes("COMPRESS") ||
    volState.includes("SQUEEZE") ||
    vol.baselineReadiness === "BUILDING" ||
    vol.baselineReadiness === "INSUFFICIENT"
  );
}

export default function DynamicRegridStatusCard({ paper, safety }: DynamicRegridStatusCardProps) {
  const regrid = paper.dynamicRegrid;
  const candidate = regrid.candidate;
  const cost = paper.costGateBreakdown;
  const vol = paper.volBaselineDiagnostic;
  const inventory = paper.runtimeMonitor;
  const gridEpoch = paper.gridEpochContext ?? {
    oldEpochStatus: "NONE",
    oldEpochPolicy: [],
    currentGridEligibility: "NOT_EVALUATED",
    currentRegime: "UNKNOWN",
    proposedNextResearch: "NO_ACTION",
    freshGridCandidateReview: {
      status: "NO_CANDIDATE",
      candidateGridLower: null,
      candidateGridUpper: null,
      candidateGridMid: null,
      candidateGridWidthPct: null,
      candidateSpacingPct: null,
      gridCount: null,
      costGatePass: null,
      blockers: [],
    },
    blockers: [],
    nextAction: "no_action",
    activationAllowed: false,
    paperActivationAllowed: false,
    liveActivationAllowed: false,
    reviewOnly: true,
    shadowOnly: true,
  };
  const freshCandidate = gridEpoch.freshGridCandidateReview;
  const oldExposurePolicy = paper.paperEpoch.oldExposurePolicy;
  const oneSided = inventory.cumulativeBuyFillCount > 0 && inventory.cumulativeSellFillCount === 0;
  const quarantined = oldExposurePolicy.some((item) => item.toUpperCase().includes("QUARANTINE"));
  const lowVolFeeGrindSqueezeRisk = isThinSpacingBuffer(cost) && isLowVolOrBuilding(vol);
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

      <div className="mt-3 rounded-md border border-[#e4cba8] bg-white/60 p-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-[11px] font-black text-[#5b4432]">Grid Epoch / Fresh Candidate Review</div>
            <div className="text-[10px] font-bold text-[#80644c]">Old exposure is audit-only. Current grid eligibility uses current market only.</div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <span className="rounded-full bg-[#fff7e8] px-2 py-1 text-[10px] font-black text-[#6d5745]">
              review-only
            </span>
            <span className="rounded-full bg-[#fff7e8] px-2 py-1 text-[10px] font-black text-[#6d5745]">
              activation: blocked
            </span>
          </div>
        </div>
        <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="Old epoch status" value={gridEpoch.oldEpochStatus} />
          <Metric label="Grid eligibility" value={gridEpoch.currentGridEligibility} />
          <Metric label="Current regime" value={gridEpoch.currentRegime} />
          <Metric label="Candidate status" value={freshCandidate.status} />
          <Metric label="Candidate spacing" value={pct(freshCandidate.candidateSpacingPct)} />
          <Metric label="Cost gate" value={boolText(freshCandidate.costGatePass)} />
          <Metric label="Grid count" value={freshCandidate.gridCount ?? "-"} />
          <Metric label="Next action" value={gridEpoch.nextAction ?? "no_action"} />
        </div>
        <div className="mt-2 rounded-md border border-[#dcc7aa] bg-[#fffaf0] px-2 py-1.5 text-[11px] font-black text-[#5b4432]">
          Old epoch policy: {gridEpoch.oldEpochPolicy.length ? gridEpoch.oldEpochPolicy.join(" / ") : "audit-only policy missing"}
        </div>
      </div>

      <div className="mt-3 rounded-md border border-[#e4cba8] bg-white/60 p-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-[11px] font-black text-[#5b4432]">Cost Gate Breakdown</div>
            <div className="text-[10px] font-bold text-[#80644c]">Read-only diagnostic - does not change grid behavior</div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <span className="rounded-full bg-[#fff7e8] px-2 py-1 text-[10px] font-black text-[#6d5745]">
              {cost.status}
            </span>
            <span className="rounded-full bg-amber-100 px-2 py-1 text-[10px] font-black text-amber-900">
              {feeGrindLabel(cost.feeGrindRisk)}
            </span>
          </div>
        </div>
        <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="Round-trip cost" value={pct(cost.roundTripCostPct)} />
          <Metric label="Grid spacing" value={pct(cost.gridSpacingPct)} />
          <Metric label="Grid spacing source" value={cost.gridSpacingSource ?? "not exposed"} />
          <Metric label="Required min spacing" value={pct(cost.requiredMinSpacingPct)} />
          <Metric label="Spacing buffer" value={ratio(cost.spacingBufferRatio)} />
          <Metric label="Cost gate pass" value={boolText(cost.pass)} />
          <Metric label="Fee estimate" value={money(cost.feeEstimateTotal)} />
          <Metric label="Slippage estimate" value={money(cost.slippageEstimateTotal)} />
          <Metric label="Funding estimate" value={money(cost.fundingEstimateTotal)} />
          <Metric label="Fee / slippage config" value={`${pct(cost.feePctConfig)} / ${pct(cost.slippagePctConfig)}`} />
        </div>
        {cost.feeGrindRisk === "FEE_GRIND_RISK" || cost.feeGrindRisk === "THIN_BUFFER" || cost.feeGrindRisk === "COST_GATE_FAIL" ? (
          <div className="mt-2 rounded-md border border-red-200 bg-red-50 px-2 py-1.5 text-[11px] font-black text-red-950">
            Fee-grind risk: spacing may not sufficiently exceed round-trip costs. Cost diagnostic only - does not change grid parameters.
          </div>
        ) : null}
        {lowVolFeeGrindSqueezeRisk ? (
          <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] font-black text-amber-950">
            Low-vol fee-grind squeeze risk: Spacing buffer is thin while volatility is compressed/building. Read-only warning - does not change grid behavior.
          </div>
        ) : null}
        {cost.warning || cost.nextAction ? (
          <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] font-black text-amber-950">
            {cost.warning ? "Cost gate warning. " : ""}{cost.nextAction ?? "Review cost gate details."}
          </div>
        ) : null}
      </div>

      <div className="mt-3 rounded-md border border-[#e4cba8] bg-white/60 p-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-[11px] font-black text-[#5b4432]">Inventory / One-sided Exposure</div>
            <div className="text-[10px] font-bold text-[#80644c]">Quarantined exposure is not edge evidence</div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {oneSided ? <span className="rounded-full bg-amber-100 px-2 py-1 text-[10px] font-black text-amber-900">one-sided</span> : null}
            {quarantined ? <span className="rounded-full bg-[#fff7e8] px-2 py-1 text-[10px] font-black text-[#6d5745]">quarantined</span> : null}
          </div>
        </div>
        <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="Buy:Sell fill ratio" value={`${inventory.cumulativeBuyFillCount}:${inventory.cumulativeSellFillCount}`} />
          <Metric label="Sell fill count" value={regrid.sellFillCount} />
          <Metric label="Closed cycles" value={paper.closedCycles} />
          <Metric label="priceVsGrid" value={regridStatusLabel(regrid.priceVsGrid)} />
        </div>
        <div className="mt-2 rounded-md border border-[#dcc7aa] bg-[#fffaf0] px-2 py-1.5 text-[11px] font-black text-[#5b4432]">
          One-sided exposure detected: {oneSided ? "yes" : "no"} - Old exposure is {quarantined ? "quarantined" : "not marked quarantined"} - No close action / no fake closed cycles
        </div>
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
