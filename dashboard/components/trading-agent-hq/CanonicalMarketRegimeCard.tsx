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

function diagnosticStatusLabel(value: PaperVM["regimeDiagnostic"]["status"]): string {
  switch (value) {
    case "MATCHED": return "matched";
    case "MISMATCH": return "mismatch";
    case "DECISION_REGIME_NULL_CANONICAL_AVAILABLE": return "Decision regime is null/unknown but canonical regime is available";
    case "LOW_CONFIDENCE": return "low confidence";
    case "NO_CANONICAL_DATA": return "no canonical data";
    default: return "unknown";
  }
}

function volReadinessLabel(value: PaperVM["volBaselineDiagnostic"]["baselineReadiness"]): string {
  switch (value) {
    case "READY": return "ready";
    case "INSUFFICIENT": return "insufficient";
    case "BUILDING": return "building";
    default: return "no data";
  }
}

function pctLabel(value: number | null): string {
  return value == null ? "n/a" : `${value}%`;
}

function decimalLabel(value: number | null): string {
  return value == null ? "n/a" : String(value);
}

function isUnknownOrDataGap(paper: PaperVM): boolean {
  const regime = paper.canonicalMarketRegime;
  const diag = paper.regimeDiagnostic;
  return (
    regime.regime === "UNKNOWN" ||
    diag.status === "NO_CANONICAL_DATA" ||
    (!diag.decisionRegime && !diag.canonicalRegime) ||
    regime.evidenceCompleteness.status === "missing" ||
    regime.sourceFreshness.status === "stale" ||
    regime.sourceFreshness.status === "unknown"
  );
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
  const diag = paper.regimeDiagnostic;
  const vol = paper.volBaselineDiagnostic;
  const legacyPlanMode = paper.dynamicRegrid.marketMode ?? "ยังไม่มีข้อมูล";
  const latestCandles = Object.entries(regime.sourceFreshness.latestCandleAtByTimeframe)
    .map(([tf, at]) => `${tf}: ${at ?? "ยังไม่มีข้อมูล"}`);
  const unknownOrDataGap = isUnknownOrDataGap(paper);

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

      {unknownOrDataGap ? (
        <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12px] font-black leading-relaxed text-red-950">
          <div>UNKNOWN / DATA GAP - fail closed</div>
          <div className="mt-1 text-[11px]">
            No trade should be inferred from incomplete regime data. Read-only warning - does not change trading behavior.
          </div>
        </div>
      ) : null}

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

      <div className="mt-3 rounded-md border border-[#dcc7aa] bg-white/70 p-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-[11px] font-black text-[#5b4432]">Regime mismatch diagnostic</div>
            <div className="text-[10px] font-bold text-[#80644c]">Read-only diagnostic - not a trading trigger</div>
          </div>
          <span className="rounded-full bg-[#fff7e8] px-2 py-1 text-[10px] font-black text-[#6d5745]">
            {diagnosticStatusLabel(diag.status)}
          </span>
        </div>
        <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Decision regime" value={diag.decisionRegime ?? "null/unknown"} />
          <Field label="Canonical regime" value={diag.canonicalRegime ?? "n/a"} />
          <Field label="Canonical confidence" value={decimalLabel(diag.canonicalConfidence)} />
          <Field label="Regime mismatch" value={boolLabel(diag.decisionRegimeMismatch)} />
          <Field label="Canonical direction" value={diag.canonicalDirection ?? "n/a"} />
          <Field label="Canonical source" value={diag.canonicalSource ?? "n/a"} />
          <Field label="Computed at" value={diag.canonicalComputedAt ?? "n/a"} />
          <Field label="Null decision + canonical" value={boolLabel(diag.regimeNullButCanonicalAvailable)} />
        </div>
        <ListBlock title="Canonical reason summary" items={diag.canonicalReasons.slice(0, 4)} translate={false} />
      </div>

      <div className="mt-3 rounded-md border border-[#dcc7aa] bg-white/70 p-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-[11px] font-black text-[#5b4432]">Vol baseline diagnostic</div>
            <div className="text-[10px] font-bold text-[#80644c]">Uses latest.marketSnapshot.volatility only</div>
          </div>
          <span className="rounded-full bg-[#fff7e8] px-2 py-1 text-[10px] font-black text-[#6d5745]">
            {volReadinessLabel(vol.baselineReadiness)}
          </span>
        </div>
        <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Vol state" value={vol.volState ?? "n/a"} />
          <Field label="Confidence" value={decimalLabel(vol.confidence)} />
          <Field label="Baseline samples" value={vol.baselineSamples1h == null || vol.requiredBaselineSamples == null ? "n/a" : `${vol.baselineSamples1h}/${vol.requiredBaselineSamples}`} />
          <Field label="Baseline progress" value={pctLabel(vol.baselineProgressPct)} />
        </div>
        {vol.warning ? (
          <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] font-black text-amber-950">
            {vol.warning}
          </div>
        ) : null}
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
