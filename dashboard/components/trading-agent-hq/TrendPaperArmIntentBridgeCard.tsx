import type { PaperVM } from "@/lib/trading-agent-hq/viewModel";

type Props = { paper: PaperVM };

const NA = "ยังไม่มีข้อมูล";

function gateLabel(s: string | null): string {
  switch (s) {
    case "OPERATOR_ARMED_PAPER_ONLY": return "ARMED (paper)";
    case "READY_FOR_OPERATOR_REVIEW": return "รอ operator review";
    case "NOT_READY": return "ยังไม่พร้อม";
    case "BLOCKED": return "บล็อก";
    case "EXPIRED": return "หมดอายุ";
    case "REJECTED_BY_OPERATOR": return "ถูกปฏิเสธ";
    default: return NA;
  }
}

function sourceLabel(s: string): string {
  switch (s) {
    case "RAW_GATE": return "ใช้ gate ดิบ";
    case "SESSION_ARM_INTENT": return "อัปเกรดจาก session intent";
    case "SESSION_MISSING": return "ไม่มี session";
    case "SESSION_EXPIRED": return "session หมดอายุ";
    case "SESSION_NOT_ACTIVE": return "session ไม่ active";
    case "SESSION_LIMIT_REACHED": return "session ครบจำนวน";
    case "SESSION_NO_ARM_INTENT": return "session ไม่มี arm intent";
    default: return NA;
  }
}

function Field({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`rounded-md border px-2 py-1.5 ${strong ? "border-[#b08a5e] bg-[#fbf4e8]" : "border-[#d6c2a6] bg-white/75"}`}>
      <div className="text-[10px] font-black text-[#8a6a4f]">{label}</div>
      <div className="mt-0.5 break-words text-[12px] font-black text-[#2f241b]">{value}</div>
    </div>
  );
}

export default function TrendPaperArmIntentBridgeCard({ paper }: Props) {
  const b = paper.trendPaperArmIntentBridge;
  const s = paper.trendPaperArmSession;
  const yn = (v: boolean | undefined) => (v ? "ใช่" : "ไม่");
  const upgraded = b?.upgradedToArmed === true;

  return (
    <section className="rounded-lg border border-[#d1b58c] bg-[#f4efe7] p-3 text-[#3f2f22] shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-black text-[#2f241b]">Trend Paper Arm Intent Bridge (Shadow)</h2>
          <p className="mt-0.5 text-[11px] font-bold text-[#80644c]">
            นี่คือ paper-only arm intent ไม่ใช่เงินจริง — ระบบจะแปลงเป็น OPERATOR_ARMED_PAPER_ONLY เฉพาะเมื่อ session active และยังไม่หมดอายุ
          </p>
        </div>
        <span className={`rounded-full px-2 py-1 text-[10px] font-black ${upgraded ? "border-emerald-300 bg-emerald-50 text-emerald-900" : "border-[#d6c2a6] bg-white/70 text-[#5b4432]"}`}>
          {upgraded ? "อัปเกรดเป็น ARMED" : "ยังไม่อัปเกรด"}
        </span>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Raw Gate" value={gateLabel(b?.rawStatus ?? null)} />
        <Field label="Effective Gate" value={gateLabel(b?.effectiveStatus ?? null)} strong />
        <Field label="Source" value={sourceLabel(b?.source ?? "UNKNOWN")} />
        <Field label="upgradedToArmed" value={yn(b?.upgradedToArmed)} />
        <Field label="paperArmIntentRequested" value={yn(b?.paperArmIntentRequested)} />
        <Field label="Session Status" value={s?.status ?? NA} />
        <Field label="Expires At" value={s?.expiresAt ?? NA} />
        <Field label="Entries (used/max)" value={`${s?.usedEntries ?? 0}/${s?.maxEntries ?? NA}`} />
        <Field label="paperActivationAllowed" value={yn(b?.paperActivationAllowed)} />
        <Field label="liveActivationAllowed" value={yn(b?.liveActivationAllowed)} />
      </div>

      {b?.reasons?.length ? (
        <div className="mt-3 rounded-md border border-[#d6c2a6] bg-white/70 px-3 py-2 text-[11px] font-bold text-[#5b4432]">
          {b.reasons.map((r, i) => <div key={i}>· {r}</div>)}
        </div>
      ) : null}

      <div className="mt-3 rounded-md border border-[#d6c2a6] bg-white/70 px-3 py-2 text-[12px] font-black text-[#5b4432]">
        ไม่มีผลต่อ Grid / M-0B / Live · ไม่มีปุ่ม ไม่ arm จากที่นี่ · session สร้างนอกระบบ (manual) เท่านั้น · ไม่ใช่เงินจริง
      </div>
    </section>
  );
}
