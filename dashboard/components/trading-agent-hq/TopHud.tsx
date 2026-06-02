"use client";

import type { TradingAgentHQViewModel } from "@/lib/trading-agent-hq/viewModel";

function Stat({
  label,
  value,
  caption,
  tone = "neutral",
}: {
  label: string;
  value: string;
  caption?: string;
  tone?: "neutral" | "warn" | "danger" | "ok";
}) {
  const toneCls =
    tone === "danger"
      ? "text-red-800"
      : tone === "warn"
        ? "text-amber-800"
        : tone === "ok"
          ? "text-emerald-800"
          : "text-[#2f241b]";

  return (
    <div className="min-h-[92px] rounded-lg border border-[#3a2c21]/10 bg-[#fffaf1] p-3 shadow-sm">
      <span className="block text-[10px] font-bold uppercase tracking-wide text-[#8a735d]">{label}</span>
      <span className={`mt-1 block text-xl font-black leading-tight ${toneCls}`}>{value}</span>
      {caption && <span className="mt-1 block text-[11px] leading-snug text-[#7a6550]">{caption}</span>}
    </div>
  );
}

// display-only Thai mapping (ไม่เปลี่ยนค่า field จริง)
const MOOD_TH: Record<string, string> = { UNKNOWN: "ไม่ทราบ", CALM: "สงบ", WATCH: "เฝ้าระวัง", ALERT: "เตือนภัย" };
const HEAT_TH: Record<string, string> = { CALM: "ปกติ", WATCH: "เฝ้าระวัง", ALERT: "เตือนภัย", UNKNOWN: "ไม่ทราบ" };
const th = (map: Record<string, string>, v: string) => map[v] ?? v;

export default function TopHud({ vm }: { vm: TradingAgentHQViewModel }) {
  const safety = vm.safety;
  const approvalTh = safety.exchangeManualApproval === "approved" ? "อนุมัติแล้ว" : "ยังไม่อนุมัติ";
  const phaseTh = safety.phase === "M-0B_BLOCKED" ? "M-0B: ถูกบล็อก" : safety.phase;

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
      <Stat label="อารมณ์ตลาด" value={th(MOOD_TH, vm.topHud.marketMood)} caption="สัญญาณ public-safe เท่านั้น" tone="warn" />
      <Stat
        label="ทุน Paper"
        value={vm.topHud.simEquity == null ? "ไม่เปิดเผย" : String(vm.topHud.simEquity)}
        caption="ไม่เปิดเผยยอดบัญชี"
      />
      <Stat
        label="กำไร/ขาดทุน Paper"
        value={vm.topHud.dailyPnl == null ? "ไม่เปิดเผย" : String(vm.topHud.dailyPnl)}
        caption="ไม่ใช่กำไรเงินจริง"
      />
      <Stat label="ระดับความเสี่ยง" value={th(HEAT_TH, vm.topHud.riskHeat)} caption="สถานะความปลอดภัย" tone={vm.topHud.riskHeat === "CALM" ? "ok" : "warn"} />
      <Stat label="Agent ทำงาน" value={`${vm.topHud.agentsActive}/6`} caption="ตัวละครที่ทำงาน" />
      <Stat
        label="จำนวน Paper Fills"
        value={`${vm.paper.totalOrderFilled}`}
        caption="นับ fills เท่านั้น ไม่ใช่กำไร"
        tone={vm.paper.totalOrderFilled > 0 ? "ok" : "warn"}
      />
      <Stat
        label="รอบที่ปิดครบ"
        value={`${vm.paper.closedCycles} / ${vm.paper.closedCycles === 0 ? "ยังไม่มีข้อมูลรอบปิด" : "มีหลักฐาน"}`}
        caption={vm.paper.closedCycles === 0 ? "ตัวอย่างยังไม่พอ ยังสรุป edge ไม่ได้" : "เริ่มมีหลักฐานรอบปิด"}
        tone={vm.paper.closedCycles === 0 ? "warn" : "ok"}
      />
      <Stat
        label="เกตต้นทุน"
        value={vm.paper.costGateStatus === "PASS" ? "ผ่าน (ต้นทุน)" : `cost: ${vm.paper.costGateStatus}`}
        caption={`${phaseTh}; ไม่ใช่ edge; อนุมัติ: ${approvalTh}`}
        tone={safety.phase === "M-0B_BLOCKED" ? "danger" : "warn"}
      />
    </div>
  );
}
