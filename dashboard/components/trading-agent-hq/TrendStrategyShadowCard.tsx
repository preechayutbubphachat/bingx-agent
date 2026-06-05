import type { PaperVM } from "@/lib/trading-agent-hq/viewModel";

type TrendStrategyShadowCardProps = {
  paper: PaperVM;
};

const NA = "ยังไม่มีข้อมูล";

const STATUS_LABELS: Record<PaperVM["trendStrategy"]["status"], string> = {
  NO_TRADE: "ไม่เข้าเทรด",
  WATCHING_PULLBACK: "รอราคาย่อกลับเข้าโซน",
  SETUP_READY: "แผนพร้อม",
  AWAITING_CONFIRMATION: "รอ 5m confirm",
  RISK_REJECTED: "ปฏิเสธเพราะความเสี่ยง",
  INVALIDATED: "แผนถูก invalidated",
  UNKNOWN: "ไม่ทราบ",
};

const CONFIRM_LABELS: Record<PaperVM["trendStrategy"]["confirmationStatus"], string> = {
  NOT_REQUIRED: "ยังไม่ต้องยืนยัน",
  WAITING_5M_CONFIRM: "รอ 5m confirm",
  CONFIRMED: "ยืนยันแล้ว",
  FAILED: "ยืนยันไม่ผ่าน",
  INSUFFICIENT_DATA: "ข้อมูลไม่พอ",
  UNKNOWN: "ไม่ทราบ",
};

const RISK_LABELS: Record<PaperVM["trendStrategy"]["riskStatus"], string> = {
  PASS: "ผ่าน",
  NO_TRADE_NEAR_TARGET: "ราคาใกล้เป้าแล้ว ห้ามไล่ราคา",
  NO_TRADE_BAD_RR: "Reward/Risk ไม่พอ",
  NO_TRADE_STALE_DATA: "ข้อมูลไม่สด",
  NO_TRADE_VOLATILITY: "ความผันผวนไม่เหมาะ",
  NO_TRADE_CONFLICTING_FLOW: "flow ขัดแย้ง",
  NO_TRADE_OLD_EXPOSURE: "มี exposure เก่า ต้องแยกกัก",
  UNKNOWN: "ไม่ทราบ",
};

function fmt(value: number | null | undefined, suffix = ""): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return NA;
  return `${value.toLocaleString("en-US", { maximumFractionDigits: 4 })}${suffix}`;
}

function boolLabel(value: boolean): string {
  return value ? "ใช่" : "ไม่";
}

function activationLabel(value: boolean): string {
  return value ? "ผิดปกติ: true" : "ไม่";
}

function zoneLabel(zone: [number, number] | null): string {
  return zone ? `${fmt(zone[0])} - ${fmt(zone[1])}` : NA;
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-[#d6c2a6] bg-white/75 px-2 py-1.5">
      <div className="text-[10px] font-black text-[#8a6a4f]">{label}</div>
      <div className="mt-0.5 break-words text-[12px] font-black text-[#2f241b]">{value}</div>
    </div>
  );
}

export default function TrendStrategyShadowCard({ paper }: TrendStrategyShadowCardProps) {
  const strategy = paper.trendStrategy;
  const epoch = paper.trendPaperEpoch;

  return (
    <section className="rounded-lg border border-[#d1b58c] bg-[#f5eee5] p-3 text-[#3f2f22] shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-black text-[#2f241b]">Trend Strategy Paper Plan (Shadow)</h2>
          <p className="mt-0.5 text-[11px] font-bold text-[#80644c]">
            แผน Trend นี้เป็น Shadow / Paper-only design ยังไม่ส่งคำสั่ง
          </p>
        </div>
        <span className="rounded-full bg-white px-2 py-1 text-[10px] font-black text-[#5b4432]">
          {STATUS_LABELS[strategy.status]}
        </span>
      </div>

      <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] font-black leading-relaxed text-amber-950">
        ไม่ใช้ exposure BUY เดิมของ Grid มาปิดเป็น Trend trade · ต้องรอราคาเข้าโซน + 5m confirm ก่อน · ห้ามเงินจริง
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Direction" value={strategy.direction ?? NA} />
        <Field label="Setup status" value={STATUS_LABELS[strategy.status]} />
        <Field label="Entry zone" value={zoneLabel(strategy.entryZone)} />
        <Field label="Current price" value={fmt(strategy.currentPrice)} />
        <Field label="Distance to entry zone" value={fmt(strategy.distanceToEntryZonePct, "%")} />
        <Field label="Invalidation" value={fmt(strategy.invalidation)} />
        <Field label="Target 1 / Target 2" value={`${fmt(strategy.target1)} / ${fmt(strategy.target2)}`} />
        <Field label="Reward/Risk" value={fmt(strategy.rewardRisk)} />
        <Field label="Confirmation required" value={boolLabel(strategy.confirmationRequired)} />
        <Field label="Confirmation status" value={CONFIRM_LABELS[strategy.confirmationStatus]} />
        <Field label="Risk status" value={RISK_LABELS[strategy.riskStatus]} />
        <Field label="Old exposure policy" value={strategy.oldExposurePolicy} />
        <Field label="Paper activation allowed" value={activationLabel(strategy.paperActivationAllowed)} />
        <Field label="Live activation allowed" value={activationLabel(strategy.liveActivationAllowed)} />
        <Field label="Grid closed-cycle count" value={boolLabel(strategy.countTowardGridClosedCycles)} />
        <Field label="Trend evidence count" value={boolLabel(strategy.countTowardTrendEvidence)} />
      </div>

      <div className="mt-3 rounded-md border border-[#d6c2a6] bg-white/70 px-3 py-2 text-[11px] font-bold text-[#5b4432]">
        epoch={epoch.epochId ?? NA} · source={epoch.source} · phase={epoch.phase} · old exposure ถูกกักแยกจาก grid evidence
      </div>
    </section>
  );
}
