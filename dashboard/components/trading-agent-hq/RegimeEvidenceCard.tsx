import type { EvidenceValueVM, PaperVM } from "@/lib/trading-agent-hq/viewModel";

type RegimeEvidenceCardProps = {
  paper: PaperVM;
};

function completenessLabel(status: string): string {
  if (status === "complete") return "ครบ";
  if (status === "partial") return "มีบางส่วน";
  if (status === "missing") return "ยังไม่มีข้อมูล";
  return "ไม่ทราบ";
}

function valueLabel(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined || value === "") return "ยังไม่มีข้อมูลจาก source";
  if (typeof value === "boolean") return value ? "ใช่" : "ไม่ใช่";
  return String(value);
}

function indicatorLabel(value: EvidenceValueVM): string {
  if (value.value === null || value.value === undefined) return "ยังไม่มีข้อมูลจาก source";
  return `${value.value}`;
}

function sourceLabel(value: EvidenceValueVM, insufficient: boolean): string {
  if (!value.source || value.source === "missing") return insufficient ? "แท่งเทียนไม่พอ" : "source=missing";
  return value.source;
}

function freshnessLabel(ageMs: number | null | undefined): string {
  if (ageMs == null) return "ยังไม่มีข้อมูลจาก source";
  const minutes = Math.round(ageMs / 60_000);
  if (ageMs > 30 * 60_000) return `ข้อมูลไม่สด (${minutes} นาที)`;
  return `สด (${minutes} นาที)`;
}

function Field({ label, value, source }: { label: string; value: string; source?: string }) {
  return (
    <div className="rounded-md border border-[#d6c2a6] bg-white/75 px-2 py-1.5">
      <div className="text-[10px] font-black text-[#8a6a4f]">{label}</div>
      <div className="mt-0.5 break-words text-[12px] font-black text-[#2f241b]">{value}</div>
      {source ? <div className="mt-0.5 break-words text-[10px] font-bold text-[#8a6a4f]">{source}</div> : null}
    </div>
  );
}

export default function RegimeEvidenceCard({ paper }: RegimeEvidenceCardProps) {
  const evidence = paper.regimeEvidence;
  const completeness = evidence.evidenceCompleteness;
  const decision = evidence.decision;
  const indicators = evidence.indicators;
  const derivatives = evidence.derivatives;
  const obGate = evidence.obGate;
  const freshness = evidence.sourceFreshness;
  const indicatorMeta = evidence.indicatorEvidence;
  const insufficient = Boolean(indicatorMeta?.notes.includes("insufficient_candles"));

  return (
    <section className="rounded-lg border border-[#d1b58c] bg-[#f7f1e8] p-3 text-[#3f2f22] shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-black text-[#2f241b]">หลักฐาน Regime / Trend สำหรับ Regrid</h2>
          <p className="mt-0.5 text-[11px] font-bold text-[#80644c]">
            ใช้แสดงหลักฐานเท่านั้น ยังไม่ใช้เปิดกริด
          </p>
        </div>
        <span className="rounded-full bg-white px-2 py-1 text-[10px] font-black text-[#5b4432]">
          Evidence: {completenessLabel(completeness.status)} {completeness.scorePct}%
        </span>
      </div>

      <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] font-black leading-relaxed text-amber-950">
        ข้อมูลชุดนี้เป็นหลักฐานประกอบ Regrid Readiness เท่านั้น ยังไม่ใช้เปิดกริดใหม่อัตโนมัติ และไม่ปลดล็อก M-0B
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Market Mode" value={valueLabel(decision.marketMode)} />
        <Field label="Regime" value={valueLabel(decision.regime)} />
        <Field label="Trend Direction" value={valueLabel(decision.trendDir)} />
        <Field label="SMC / Structure" value={valueLabel(decision.structureState ?? decision.smcBias)} />
        <Field label="OB Gate" value={valueLabel(obGate.status)} source={obGate.reason ?? undefined} />
        <Field label="OI Bias" value={valueLabel(derivatives.oiBias)} />
        <Field label="Funding Bias" value={valueLabel(derivatives.fundingBias)} />
        <Field
          label="Evidence Completeness"
          value={`${completenessLabel(completeness.status)} (${completeness.availableCount}/${completeness.expectedCount})`}
        />
        <Field label="Timeframe" value={valueLabel(indicatorMeta?.timeframe)} />
        <Field label="Candle Count" value={valueLabel(indicatorMeta?.candleCount)} />
        <Field label="Indicator Freshness" value={freshnessLabel(indicatorMeta?.freshness.ageMs)} />
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="ADX" value={indicatorLabel(indicators.adx)} source={sourceLabel(indicators.adx, insufficient)} />
        <Field label="+DI" value={indicatorLabel(indicators.plusDI)} source={sourceLabel(indicators.plusDI, insufficient)} />
        <Field label="-DI" value={indicatorLabel(indicators.minusDI)} source={sourceLabel(indicators.minusDI, insufficient)} />
        <Field label="RSI" value={indicatorLabel(indicators.rsi)} source={sourceLabel(indicators.rsi, insufficient)} />
        <Field label="ATR" value={indicatorLabel(indicators.atr)} source={sourceLabel(indicators.atr, insufficient)} />
        <Field label="ATR%" value={indicatorLabel(indicators.atrPct)} source={sourceLabel(indicators.atrPct, insufficient)} />
        <Field label="BBW" value={indicatorLabel(indicators.bbw)} source={sourceLabel(indicators.bbw, insufficient)} />
        <Field label="MACD" value={indicatorLabel(indicators.macd)} source={sourceLabel(indicators.macd, insufficient)} />
        <Field label="MACD Signal" value={indicatorLabel(indicators.macdSignal)} source={sourceLabel(indicators.macdSignal, insufficient)} />
        <Field label="MACD Hist" value={indicatorLabel(indicators.macdHistogram)} source={sourceLabel(indicators.macdHistogram, insufficient)} />
        <Field label="EMA Slope" value={indicatorLabel(indicators.emaSlope)} source={sourceLabel(indicators.emaSlope, insufficient)} />
      </div>

      <div className="mt-3 grid gap-2 md:grid-cols-2">
        <div className="rounded-md border border-[#d6c2a6] bg-white/70 px-3 py-2 text-[11px] font-bold text-[#5b4432]">
          <div className="font-black text-[#2f241b]">ความสดของข้อมูล</div>
          <div>latest_decision: {valueLabel(freshness.latestDecisionAt)}</div>
          <div>market_snapshot: {valueLabel(freshness.marketSnapshotAt)}</div>
          <div>plan_status_state: {valueLabel(freshness.planStatusStateAt)}</div>
          <div>latest candle: {valueLabel(indicatorMeta?.freshness.latestCandleAt)}</div>
        </div>
        <div className="rounded-md border border-[#d6c2a6] bg-white/70 px-3 py-2 text-[11px] font-bold text-[#5b4432]">
          <div className="font-black text-[#2f241b]">Missing / Notes</div>
          <div>{evidence.missingFields.slice(0, 8).join(", ") || "ยังไม่มีข้อมูล"}</div>
          <div>{evidence.notes.join(", ") || "ไม่มี note เพิ่มเติม"}</div>
        </div>
      </div>
    </section>
  );
}
