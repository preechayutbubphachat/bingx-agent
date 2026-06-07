import type { PaperVM } from "@/lib/trading-agent-hq/viewModel";

type Props = { paper: PaperVM };

const NA = "ยังไม่มีข้อมูล";

function statusLabel(status: string): string {
  switch (status) {
    case "NOT_READY": return "ยังไม่พร้อม";
    case "READY_FOR_OPERATOR_REVIEW": return "พร้อมให้ Operator ตรวจ";
    case "OPERATOR_ARMED_PAPER_ONLY": return "Operator armed (paper)";
    case "REJECTED_BY_OPERATOR": return "Operator ปฏิเสธ";
    case "EXPIRED": return "หมดอายุ";
    case "BLOCKED": return "บล็อกเพื่อความปลอดภัย";
    default: return NA;
  }
}

function statusStyle(status: string): string {
  if (status === "BLOCKED" || status === "EXPIRED") return "border-red-300 bg-red-50 text-red-900";
  if (status === "READY_FOR_OPERATOR_REVIEW") return "border-amber-300 bg-amber-50 text-amber-900";
  return "border-[#d6c2a6] bg-white/70 text-[#5b4432]";
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-[#d6c2a6] bg-white/75 px-2 py-1.5">
      <div className="text-[10px] font-black text-[#8a6a4f]">{label}</div>
      <div className="mt-0.5 break-words text-[12px] font-black text-[#2f241b]">{value}</div>
    </div>
  );
}

export default function TrendManualPaperArmGateCard({ paper }: Props) {
  const g = paper.trendManualPaperArmGate;
  const activationLabel = (v: boolean | undefined) => (v ? "ใช่" : "ไม่");

  return (
    <section className="rounded-lg border border-[#d1b58c] bg-[#f4efe7] p-3 text-[#3f2f22] shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-black text-[#2f241b]">Trend Manual Paper Arm Gate (Shadow)</h2>
          <p className="mt-0.5 text-[11px] font-bold text-[#80644c]">
            ขั้นนี้เป็นการเตรียม Manual Paper เท่านั้น ยังไม่ส่งคำสั่ง
          </p>
        </div>
        <span className={`rounded-full px-2 py-1 text-[10px] font-black ${statusStyle(g?.status ?? "UNKNOWN")}`}>
          {statusLabel(g?.status ?? "UNKNOWN")}
        </span>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Phase" value={g?.phase ?? NA} />
        <Field label="Operator action required" value={g?.operatorActionRequired ? "ใช่" : "ไม่"} />
        <Field label="Setup ID" value={g?.setupId ?? NA} />
        <Field label="Expiry" value={g?.expiryAt ?? NA} />
        <Field label="Passed" value={String(g?.passedConditions?.length ?? 0)} />
        <Field label="Failed" value={String(g?.failedConditions?.length ?? 0)} />
        <Field label="Paper activation" value={activationLabel(g?.paperActivationAllowed)} />
        <Field label="Live activation" value={activationLabel(g?.liveActivationAllowed)} />
      </div>

      {g?.failedConditions?.length ? (
        <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-bold text-amber-950">
          ยังไม่ผ่าน: {g.failedConditions.join(" · ")}
        </div>
      ) : (
        <div className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] font-bold text-emerald-950">
          เงื่อนไขครบ — รอ Operator ตรวจ (ยังไม่ arm อัตโนมัติ)
        </div>
      )}

      <div className="mt-3 rounded-md border border-[#d6c2a6] bg-white/70 px-3 py-2 text-[12px] font-black text-[#5b4432]">
        ขั้นนี้เป็นการเตรียม Manual Paper เท่านั้น ยังไม่ส่งคำสั่ง · ต้องรอ 5m confirmation · ไม่ใช้ exposure BUY เดิมของ Grid · ห้ามเงินจริง
      </div>
    </section>
  );
}
