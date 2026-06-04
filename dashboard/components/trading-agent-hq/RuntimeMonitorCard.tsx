import type { PaperVM, SafetyVM } from "@/lib/trading-agent-hq/viewModel";

type RuntimeMonitorCardProps = {
  paper: PaperVM;
  safety: SafetyVM;
  pollMessages: string[];
};

function fmt(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? value.toLocaleString("th-TH") : "-";
}

function fmtTime(value: string | null): string {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("th-TH", { hour12: false });
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-[#d9c3a6] bg-white/75 px-2 py-1.5">
      <div className="text-[10px] font-black text-[#8a6a4f]">{label}</div>
      <div className="mt-0.5 break-words text-[12px] font-black text-[#2f241b]">{value}</div>
    </div>
  );
}

function SafetyPill({ label, value }: { label: string; value: string }) {
  return (
    <span className="rounded-full border border-[#d8b98d] bg-[#fffaf0] px-2 py-1 text-[10px] font-black text-[#5b4432]">
      {label}: <span className="text-[#2f241b]">{value}</span>
    </span>
  );
}

export default function RuntimeMonitorCard({ paper, safety, pollMessages }: RuntimeMonitorCardProps) {
  const monitor = paper.runtimeMonitor;
  const activationText = monitor.activationAllowed === false
    ? "ยังไม่อนุญาตให้เปิดกริดใหม่"
    : monitor.activationAllowed === true ? "อนุญาตแล้ว" : "ไม่ทราบ";
  const monitorStatusText = monitor.monitorStatus === "PASS"
    ? "หลังบ้านทำงานถูกต้อง"
    : monitor.monitorStatus === "WATCH" ? "ต้องเฝ้าระวัง" : "ไม่ทราบ";

  return (
    <section className="rounded-lg border border-[#d1b58c] bg-[#f8efe1] p-3 text-[#3f2f22] shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-black text-[#2f241b]">ตัวตรวจสอบหลังบ้าน</h2>
          <p className="mt-0.5 text-[11px] font-bold text-[#80644c]">
            อ่านจาก /api/paper-performance เท่านั้น ไม่ส่งคำสั่ง ไม่เปิดกริด ไม่แก้ runtime
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <SafetyPill label="เงินจริง" value={safety.liveTradingEnabled ? "เปิด" : "ปิด"} />
          <SafetyPill label="คำสั่งจริง" value={safety.orderPlacementEnabled ? "เปิด" : "ปิด"} />
          <SafetyPill label="การอนุมัติ" value={safety.exchangeManualApproval === "approved" ? "อนุมัติแล้ว" : "ยังไม่อนุมัติ"} />
          <SafetyPill label="M-0B" value={safety.phase === "M-0B_BLOCKED" ? "ยังถูกบล็อก" : safety.phase} />
        </div>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        <Field label="จำนวน BUY สะสม" value={fmt(monitor.cumulativeBuyFillCount)} />
        <Field label="จำนวน SELL สะสม" value={fmt(monitor.cumulativeSellFillCount)} />
        <Field label="จำนวน No-Trade" value={fmt(monitor.paperNoTradeCount)} />
        <Field label="จำนวน Regrid Candidate" value={fmt(monitor.regridCandidateCount)} />
        <Field label="BUY sample/window" value={fmt(monitor.sampleBuyFillCount)} />
        <Field label="SELL sample/window" value={fmt(monitor.sampleSellFillCount)} />
        <Field label="อนุญาตเปิดกริดใหม่" value={`${activationText} (activationAllowed=${String(monitor.activationAllowed)})`} />
        <Field label="สถานะ monitor" value={monitorStatusText} />
        <Field label="เวลาล่าสุดของ no-trade" value={fmtTime(monitor.latestNoTradeAt)} />
        <Field label="เวลาล่าสุดของ regrid candidate" value={fmtTime(monitor.latestRegridCandidateAt)} />
      </div>

      <div className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12px] font-black leading-relaxed text-emerald-900">
        BUY ไม่เพิ่ม / No-Trade เพิ่ม / Regrid Candidate เพิ่ม / activationAllowed=false = ระบบอยู่ในโหมดปลอดภัย
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] font-black">
        {(pollMessages.length ? pollMessages : [monitorStatusText]).map((message) => (
          <span
            key={message}
            className={`rounded-full px-2 py-1 ${
              message.startsWith("ผิดปกติ") ? "bg-red-100 text-red-800" : "bg-white/80 text-[#5b4432]"
            }`}
          >
            {message}
          </span>
        ))}
      </div>
    </section>
  );
}
