import type { PaperVM } from "@/lib/trading-agent-hq/viewModel";

type TrendTransitionMonitorCardProps = {
  paper: PaperVM;
};

const NA = "ยังไม่มีข้อมูล";

function fmt(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return NA;
  return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function statusLabel(status: string): string {
  switch (status) {
    case "IDLE_NO_TRADE": return "ว่าง — ยังไม่มี setup";
    case "WATCHING_PULLBACK": return "เฝ้าดู pullback";
    case "ENTRY_ZONE_REACHED": return "ถึงโซนเข้า";
    case "AWAITING_CONFIRMATION": return "รอ 5m confirmation";
    case "RISK_REJECTED": return "ถูก reject ด้วย risk gate";
    case "SETUP_INVALIDATED": return "Setup invalidated";
    case "REGIME_CHANGED": return "Regime เปลี่ยน";
    case "SAFETY_BLOCK": return "บล็อกเพื่อความปลอดภัย";
    default: return NA;
  }
}

function severityStyle(severity: string): string {
  switch (severity) {
    case "critical": return "border-red-300 bg-red-50 text-red-900";
    case "warning": return "border-amber-300 bg-amber-50 text-amber-900";
    case "watch": return "border-sky-300 bg-sky-50 text-sky-900";
    default: return "border-[#d6c2a6] bg-white/70 text-[#5b4432]";
  }
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-[#d6c2a6] bg-white/75 px-2 py-1.5">
      <div className="text-[10px] font-black text-[#8a6a4f]">{label}</div>
      <div className="mt-0.5 break-words text-[12px] font-black text-[#2f241b]">{value}</div>
    </div>
  );
}

export default function TrendTransitionMonitorCard({ paper }: TrendTransitionMonitorCardProps) {
  const m = paper.trendTransitionMonitor;
  const wf = m?.watchedFields;
  const zone = wf?.entryZone ? `${fmt(wf.entryZone[0])} – ${fmt(wf.entryZone[1])}` : NA;
  const activationLabel = (v: boolean | undefined) => (v ? "ใช่" : "ไม่");

  return (
    <section className="rounded-lg border border-[#d1b58c] bg-[#f4efe7] p-3 text-[#3f2f22] shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-black text-[#2f241b]">Trend Transition Monitor</h2>
          <p className="mt-0.5 text-[11px] font-bold text-[#80644c]">
            ระบบนี้เฝ้าดูการเปลี่ยนสถานะเท่านั้น ยังไม่ส่งคำสั่ง
          </p>
        </div>
        {m?.shouldNotifyOperator ? (
          <span className={`rounded-full px-2 py-1 text-[10px] font-black ${severityStyle(m.severity)}`}>
            ⚠ แจ้งเตือน · {m.severity.toUpperCase()}
          </span>
        ) : (
          <span className="rounded-full bg-white px-2 py-1 text-[10px] font-black text-[#5b4432]">
            {statusLabel(m?.status ?? "UNKNOWN")}
          </span>
        )}
      </div>

      <div className={`mt-3 rounded-md border px-3 py-2 text-[12px] font-black ${severityStyle(m?.severity ?? "info")}`}>
        {statusLabel(m?.status ?? "UNKNOWN")} — {m?.message ?? NA}
        <div className="mt-1 text-[11px] font-bold">Operator: {m?.operatorAction ?? NA}</div>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Severity" value={(m?.severity ?? NA).toUpperCase()} />
        <Field label="Direction" value={wf?.direction ?? NA} />
        <Field label="Current price" value={fmt(wf?.currentPrice)} />
        <Field label="Entry zone" value={zone} />
        <Field label="Invalidation" value={fmt(wf?.invalidation)} />
        <Field label="Target 1" value={fmt(wf?.target1)} />
        <Field label="Reward/Risk" value={fmt(wf?.rewardRisk)} />
        <Field label="Trend status" value={wf?.trendStatus ?? NA} />
        <Field label="Paper activation" value={activationLabel(m?.paperActivationAllowed)} />
        <Field label="Live activation" value={activationLabel(m?.liveActivationAllowed)} />
      </div>

      <div className="mt-3 rounded-md border border-[#d6c2a6] bg-white/70 px-3 py-2 text-[12px] font-black text-[#5b4432]">
        ระบบนี้เฝ้าดูการเปลี่ยนสถานะเท่านั้น ยังไม่ส่งคำสั่ง · ถ้าเข้าโซน ต้องรอ 5m confirmation · ห้ามใช้ exposure BUY เดิมของ Grid · ห้ามเงินจริง
      </div>
    </section>
  );
}
