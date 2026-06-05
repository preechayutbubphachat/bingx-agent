import type { PaperVM, RegridReadinessVM } from "@/lib/trading-agent-hq/viewModel";

type CanonicalRegimeGateCardProps = {
  paper: PaperVM;
};

const STATUS_LABELS: Record<PaperVM["canonicalRegimeGate"]["status"], string> = {
  PASSIVE_SHADOW: "เฝ้าดูแบบ Shadow",
  BLOCK_NEUTRAL_GRID: "บล็อก Neutral Grid",
  TREND_CHECK_REQUIRED: "ต้องตรวจเทรนด์ก่อน",
  NO_TRADE_REQUIRED: "ต้อง No-Trade",
  UNKNOWN_DATA_BLOCK: "บล็อกเพราะข้อมูลไม่พอ",
  VOLATILITY_BLOCK: "บล็อกเพราะความผันผวน",
};

const REASON_LABELS: Record<string, string> = {
  canonical_regime_downgrade_only_shadow_gate: "Gate นี้ทำให้ระบบเข้มขึ้นเท่านั้น",
  trend_regime_blocks_neutral_grid: "regime เป็นเทรนด์ จึงบล็อก Neutral Grid",
  canonical_downtrend_blocks_neutral_grid: "เทรนด์ลงบล็อก Neutral Grid",
  canonical_uptrend_blocks_neutral_grid: "เทรนด์ขึ้นบล็อก Neutral Grid",
  canonical_regime_downtrend_requires_trend_check: "เทรนด์ลง ต้องตรวจเทรนด์ก่อนเปิด Neutral Grid",
  canonical_regime_uptrend_requires_trend_check: "เทรนด์ขึ้น ต้องตรวจเทรนด์ก่อนเปิด Neutral Grid",
  canonical_regime_range_no_shadow_downgrade: "ภาวะกรอบ ไม่ downgrade ใน Shadow",
  canonical_regime_volatility_expansion_blocks_grid: "ความผันผวนขยายตัว บล็อกการเปิดกริด",
  canonical_regime_event_risk_requires_no_trade: "มี event risk ต้อง No-Trade",
  canonical_regime_no_trade_requires_no_trade: "regime ระบุว่า No-Trade",
  volatility_expansion_blocks_grid_activation: "ความผันผวนขยายตัว บล็อกการเปิดกริด",
  no_trade_regime_requires_no_trade: "regime ระบุว่าไม่ควรเทรด",
  missing_canonical_market_regime: "ยังไม่มี canonical market regime",
  unknown_canonical_regime_blocks_activation: "regime ยังไม่ชัด จึงบล็อกการเปิดกริด",
  shadow_compare_only_no_active_readiness_change: "Shadow Compare เท่านั้น ยังไม่เปลี่ยน readiness จริง",
  legacy_plan_mode_ignored_by_canonical_regime_gate: "ไม่ใช้ latest_decision.market_mode เป็นแหล่งตัดสินหลัก",
  missing_regrid_readiness_for_shadow_compare: "ยังไม่มี readiness สำหรับ Shadow Compare",
};

function boolLabel(value: boolean): string {
  return value ? "ใช่" : "ไม่";
}

function activationLabel(value: boolean): string {
  return value ? "ผิดปกติ: true" : "false";
}

function readinessLabel(readiness: RegridReadinessVM | null): string {
  if (!readiness) return "ยังไม่มีข้อมูล";
  if (readiness.status === "READY_FOR_OPERATOR_REVIEW") return `พร้อมให้ operator ตรวจ (${readiness.score})`;
  if (readiness.status === "WATCH") return `เฝ้าดู (${readiness.score})`;
  if (readiness.status === "NOT_READY") return `ยังไม่พร้อม (${readiness.score})`;
  return `ไม่ทราบ (${readiness.score})`;
}

function itemLabel(value: string): string {
  return REASON_LABELS[value] ?? value;
}

function Field({ label, value }: { label: string; value: string }) {
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
            {translate ? itemLabel(item) : item}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function CanonicalRegimeGateCard({ paper }: CanonicalRegimeGateCardProps) {
  const gate = paper.canonicalRegimeGate;
  const compare = paper.canonicalRegimeGateShadowCompare;

  return (
    <section className="rounded-lg border border-[#d1b58c] bg-[#f7eadc] p-3 text-[#3f2f22] shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-black text-[#2f241b]">Canonical Regime Gate (Stricter-only)</h2>
          <p className="mt-0.5 text-[11px] font-bold text-[#80644c]">
            Shadow Compare อ่านอย่างเดียว ยังไม่เปลี่ยน readiness จริง
          </p>
        </div>
        <span className="rounded-full bg-white px-2 py-1 text-[10px] font-black text-[#5b4432]">
          {STATUS_LABELS[gate.status]}
        </span>
      </div>

      <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] font-black leading-relaxed text-amber-950">
        Gate นี้ทำให้ระบบเข้มขึ้นเท่านั้น ไม่มีสิทธิ์ปลดล็อก · ตอนนี้เป็น Shadow Compare ยังไม่เปลี่ยน readiness จริง ·
        ถ้า regime เป็นเทรนด์ลง จะบล็อก Neutral Grid · ยังไม่เปิด Phase 2-B และยังไม่ปลดล็อก M-0B
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="สถานะ Gate" value={STATUS_LABELS[gate.status]} />
        <Field label="blocking" value={boolLabel(gate.blocking)} />
        <Field label="downgradeOnly" value={boolLabel(gate.downgradeOnly)} />
        <Field label="changed ใน Shadow" value={boolLabel(compare.changed)} />
        <Field label="readiness ก่อน Gate" value={readinessLabel(paper.regridReadinessBeforeCanonicalGate)} />
        <Field label="readiness หลัง Gate" value={readinessLabel(paper.regridReadinessAfterCanonicalGate)} />
        <Field label="downgrade reason" value={compare.downgradeReason ?? "ไม่มี"} />
        <Field label="paper/live allowed" value={`${activationLabel(gate.paperActivationAllowed)} / ${activationLabel(gate.liveActivationAllowed)}`} />
      </div>

      <div className="mt-3 grid gap-2 lg:grid-cols-3">
        <ListBlock title="เหตุผล" items={gate.reasons} />
        <ListBlock title="คำเตือน" items={gate.warnings} />
        <ListBlock title="โหมดที่ได้รับผล" items={gate.affectedModes} translate={false} />
      </div>
    </section>
  );
}
