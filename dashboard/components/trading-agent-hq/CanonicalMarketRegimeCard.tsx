import type { PaperVM } from "@/lib/trading-agent-hq/viewModel";

type CanonicalMarketRegimeCardProps = {
  paper: PaperVM;
};

const REGIME_LABELS: Record<PaperVM["canonicalMarketRegime"]["regime"], string> = {
  DOWNTREND: "เทรนด์ลง",
  UPTREND: "เทรนด์ขึ้น",
  RANGE: "ตลาดกรอบ",
  NO_TRADE: "ไม่ควรเทรด",
  UNKNOWN: "ข้อมูลไม่พอ",
  VOLATILITY_EXPANSION: "ความผันผวนขยายตัว",
  VOLATILITY_COMPRESSION: "ความผันผวนบีบตัว",
  EVENT_RISK: "ความเสี่ยงจากเหตุการณ์",
};

const DIRECTION_LABELS: Record<PaperVM["canonicalMarketRegime"]["direction"], string> = {
  BULLISH: "ขาขึ้น",
  BEARISH: "ขาลง",
  NEUTRAL: "เป็นกลาง",
  UNKNOWN: "ไม่ทราบ",
};

const REASON_LABELS: Record<string, string> = {
  trend_down_confirmed_by_indicators: "ยืนยันแรงกดเทรนด์ลงจาก ADX/DI/MACD/EMA slope",
  trend_up_confirmed_by_indicators: "ยืนยันเทรนด์ขึ้นจาก ADX/DI/MACD/EMA slope",
  rsi_supports_bearish_bias: "RSI สนับสนุน bias ฝั่งลง",
  range_like_multi_timeframe_indicators: "หลาย TF มีลักษณะตลาดกรอบ",
  missing_important_timeframe_bias_to_no_trade: "ขาด TF สำคัญ จึง bias ไปที่ไม่เทรด",
  ignored_legacy_plan_mode_for_canonical_regime: "ไม่ใช้ latest_decision.market_mode เป็น regime หลัก",
  price_outside_grid_without_confirmed_regrid_regime: "ราคาอยู่นอกกรอบโดยยังไม่มี regime สำหรับ regrid",
  volatility_expansion_detected: "พบความผันผวนขยายตัว",
};

function labelReason(value: string): string {
  return REASON_LABELS[value] ?? value;
}

function boolLabel(value: boolean): string {
  return value ? "ใช่" : "ไม่";
}

function Field({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border border-[#dcc7aa] bg-white/75 px-2 py-1.5">
      <div className="text-[10px] font-black text-[#8a6a4f]">{label}</div>
      <div className="mt-0.5 break-words text-[12px] font-black text-[#2f241b]">{value}</div>
    </div>
  );
}

function ListBlock({ title, items, translate = true }: { title: string; items: string[]; translate?: boolean }) {
  return (
    <div className="rounded-md border border-[#dcc7aa] bg-white/70 p-2">
      <div className="text-[11px] font-black text-[#5b4432]">{title}</div>
      <div className="mt-1 flex flex-wrap gap-1.5">
        {(items.length ? items : ["ยังไม่มีข้อมูล"]).map((item) => (
          <span key={item} className="rounded-full bg-[#fff7e8] px-2 py-1 text-[10px] font-bold text-[#6d5745]">
            {translate ? labelReason(item) : item}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function CanonicalMarketRegimeCard({ paper }: CanonicalMarketRegimeCardProps) {
  const regime = paper.canonicalMarketRegime;
  const legacyPlanMode = paper.dynamicRegrid.marketMode ?? "ยังไม่มีข้อมูล";
  const latestCandles = Object.entries(regime.sourceFreshness.latestCandleAtByTimeframe)
    .map(([tf, at]) => `${tf}: ${at ?? "ยังไม่มีข้อมูล"}`);

  return (
    <section className="rounded-lg border border-[#d1b58c] bg-[#f3eadf] p-3 text-[#3f2f22] shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-black text-[#2f241b]">Market Regime หลัก (Shadow)</h2>
          <p className="mt-0.5 text-[11px] font-bold text-[#80644c]">
            โหมดเงา ยังไม่ใช้เปิดกริด
          </p>
        </div>
        <span className="rounded-full bg-white px-2 py-1 text-[10px] font-black text-[#5b4432]">
          {REGIME_LABELS[regime.regime]}
        </span>
      </div>

      <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] font-black leading-relaxed text-amber-950">
        Market Regime หลักตอนนี้เป็น Shadow diagnostics เท่านั้น ยังไม่เปลี่ยนคำสั่งเทรด และยังไม่ปลดล็อก M-0B
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Regime หลัก" value={REGIME_LABELS[regime.regime]} />
        <Field label="Direction" value={DIRECTION_LABELS[regime.direction]} />
        <Field label="Confidence" value={`${regime.confidence} (${regime.confidenceLabel})`} />
        <Field label="Source Freshness" value={regime.sourceFreshness.status} />
        <Field label="Evidence Completeness" value={`${regime.evidenceCompleteness.status} ${regime.evidenceCompleteness.scorePct}%`} />
        <Field label="Legacy Plan Mode" value={`${legacyPlanMode} / โหมดจากแผนเดิม ไม่ใช่ regime หลัก`} />
        <Field label="Shadow" value={boolLabel(regime.shadowOnly)} />
        <Field label="paper/live activation" value={`${boolLabel(regime.paperActivationAllowed)} / ${boolLabel(regime.liveActivationAllowed)}`} />
      </div>

      <div className="mt-3 grid gap-2 lg:grid-cols-2">
        <ListBlock title="เหตุผล" items={regime.reasons} />
        <ListBlock title="คำเตือน" items={[...regime.warnings, ...regime.sourceFreshness.warnings]} />
        <ListBlock title="Allowed Modes" items={regime.allowedModes} translate={false} />
        <ListBlock title="Blocked Modes" items={regime.blockedModes} translate={false} />
        <ListBlock title="Latest Candle by TF" items={latestCandles} translate={false} />
        <ListBlock title="Ignored Legacy Fields" items={regime.ignoredLegacyFields} translate={false} />
      </div>
    </section>
  );
}
