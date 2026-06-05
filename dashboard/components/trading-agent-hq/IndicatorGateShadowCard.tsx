import type { PaperVM } from "@/lib/trading-agent-hq/viewModel";

type IndicatorGateShadowCardProps = {
  paper: PaperVM;
};

const STATUS_LABELS: Record<PaperVM["indicatorGate"]["status"], string> = {
  TREND_DOWN_BLOCK: "บล็อกเพราะเทรนด์ลงแรง",
  VOLATILITY_BLOCK: "บล็อกเพราะความผันผวนสูง",
  RECOVERY_WATCH: "เฝ้าดูการฟื้นตัว",
  RANGE_WATCH: "เฝ้าดูภาวะกรอบ",
  INSUFFICIENT_DATA: "ข้อมูลไม่พอ",
};

const REASON_LABELS: Record<string, string> = {
  trend_down_confirmed: "ADX แรง, -DI เด่นกว่า +DI, MACD histogram ลบ, EMA slope ลง",
  stale_indicator_evidence: "ข้อมูล indicator ไม่สด",
  missing_indicator_evidence: "ยังไม่มี indicator evidence",
  missing_adx: "ไม่มี ADX",
  missing_plus_di: "ไม่มี +DI",
  missing_minus_di: "ไม่มี -DI",
  missing_macd_histogram: "ไม่มี MACD histogram",
  missing_ema_slope: "ไม่มี EMA slope",
  missing_atr_pct: "ไม่มี ATR%",
  range_watch_no_activation_state: "เริ่มเห็นภาวะกรอบ แต่ยังไม่ใช่การอนุญาต",
  recovery_watch_no_activation_state: "เริ่มเห็นการฟื้นตัว แต่ยังไม่ใช่การอนุญาต",
  shadow_only_no_activation_state: "โหมดเงา ยังไม่ใช้ตัดสินใจเปิดกริด",
};

function boolLabel(value: boolean): string {
  return value ? "ใช่" : "ไม่";
}

function activationLabel(value: boolean): string {
  return value ? "ผิดปกติ: มีค่าเป็น true" : "ไม่";
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

function ListBlock({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-md border border-[#dcc7aa] bg-white/70 p-2">
      <div className="text-[11px] font-black text-[#5b4432]">{title}</div>
      <div className="mt-1 flex flex-wrap gap-1.5">
        {(items.length ? items : ["ยังไม่มีข้อมูล"]).map((item) => (
          <span key={item} className="rounded-full bg-[#fff7e8] px-2 py-1 text-[10px] font-bold text-[#6d5745]">
            {itemLabel(item)}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function IndicatorGateShadowCard({ paper }: IndicatorGateShadowCardProps) {
  const gate = paper.indicatorGate;

  return (
    <section className="rounded-lg border border-[#d1b58c] bg-[#f8efe3] p-3 text-[#3f2f22] shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-black text-[#2f241b]">Indicator Gate (Shadow)</h2>
          <p className="mt-0.5 text-[11px] font-bold text-[#80644c]">
            โหมดเงา ยังไม่ใช้ตัดสินใจเปิดกริด
          </p>
        </div>
        <span className="rounded-full bg-white px-2 py-1 text-[10px] font-black text-[#5b4432]">
          {STATUS_LABELS[gate.status]}
        </span>
      </div>

      <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] font-black leading-relaxed text-amber-950">
        Indicator Gate ตอนนี้เป็น Shadow diagnostics เท่านั้น ยังไม่เปลี่ยน readiness decision และยังไม่อนุญาตให้เปิดกริด
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="สถานะ Indicator Gate" value={STATUS_LABELS[gate.status]} />
        <Field label="ความมั่นใจ" value={gate.confidence} />
        <Field label="blocking" value={boolLabel(gate.blocking)} />
        <Field label="paperActivationAllowed" value={activationLabel(gate.paperActivationAllowed)} />
        <Field label="liveActivationAllowed" value={activationLabel(gate.liveActivationAllowed)} />
      </div>

      <div className="mt-3 grid gap-2 lg:grid-cols-3">
        <ListBlock title="เหตุผล" items={gate.reasons} />
        <ListBlock title="เงื่อนไขที่ผ่าน" items={gate.passed} />
        <ListBlock title="เงื่อนไขที่ไม่ผ่าน" items={gate.failed} />
      </div>
    </section>
  );
}
