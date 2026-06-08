import type { PaperVM } from "@/lib/trading-agent-hq/viewModel";

type Props = { paper: PaperVM };

const NA = "ยังไม่มีข้อมูล";

function fmt(v: number | null | undefined): string {
  if (typeof v !== "number" || !Number.isFinite(v)) return NA;
  return v.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function fmtRemaining(ms: number | null | undefined): string {
  if (typeof ms !== "number" || !Number.isFinite(ms) || ms <= 0) return "—";
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h}ชม ${m}น` : `${m}น`;
}

function statusLabel(s: string): string {
  switch (s) {
    case "ACTIVE": return "กำลังใช้งาน (paper)";
    case "INACTIVE": return "ปิดอยู่";
    case "EXPIRED": return "หมดเวลา";
    case "REVOKED": return "ถูกยกเลิก";
    case "LIMIT_REACHED": return "ครบจำนวนแล้ว";
    case "MISSING": return "ไม่มี session";
    default: return NA;
  }
}

function statusStyle(s: string): string {
  if (s === "ACTIVE") return "border-emerald-300 bg-emerald-50 text-emerald-900";
  if (s === "EXPIRED" || s === "REVOKED" || s === "LIMIT_REACHED") return "border-amber-300 bg-amber-50 text-amber-900";
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

export default function TrendPaperArmSessionCard({ paper }: Props) {
  const p = paper.trendPaperArmSession;
  const yn = (v: boolean | undefined) => (v ? "ใช่" : "ไม่");

  return (
    <section className="rounded-lg border border-[#d1b58c] bg-[#f4efe7] p-3 text-[#3f2f22] shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-black text-[#2f241b]">Trend Paper Arm Session (Shadow)</h2>
          <p className="mt-0.5 text-[11px] font-bold text-[#80644c]">
            หน้าต่างอนุมัติ paper แบบจำกัดเวลา/จำนวน อ่านอย่างเดียว — ไม่มีปุ่ม ไม่ arm จากที่นี่ ไม่ใช่เงินจริง
          </p>
        </div>
        <span className={`rounded-full px-2 py-1 text-[10px] font-black ${statusStyle(p?.status ?? "MISSING")}`}>
          {statusLabel(p?.status ?? "MISSING")}
        </span>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Session ID" value={p?.sessionId ?? NA} />
        <Field label="Direction" value={p?.direction ?? NA} />
        <Field label="Expires At" value={p?.expiresAt ?? NA} />
        <Field label="Time Remaining" value={fmtRemaining(p?.timeRemainingMs)} />
        <Field label="Entries (used/max)" value={`${p?.usedEntries ?? 0}/${p?.maxEntries ?? NA}`} />
        <Field label="Remaining Entries" value={p?.remainingEntries != null ? String(p.remainingEntries) : NA} />
        <Field label="Max Risk/Trade %" value={fmt(p?.maxRiskPerTradePct)} />
        <Field label="Max Session Risk %" value={fmt(p?.maxSessionRiskPct)} />
        <Field label="Active" value={yn(p?.active)} />
        <Field label="paperOnly" value={yn(p?.paperOnly)} />
        <Field label="live/exchange" value={`${yn(p?.liveActivationAllowed)}/${yn(p?.exchangeOrderAllowed)}`} />
      </div>

      <div className="mt-3 rounded-md border border-[#d6c2a6] bg-white/70 px-3 py-2 text-[12px] font-black text-[#5b4432]">
        Session อ่านอย่างเดียว — สร้าง/ยกเลิกทำนอกระบบ (manual) เท่านั้น · ไม่ live · ไม่ส่งคำสั่ง exchange · old grid exposure quarantined
      </div>
    </section>
  );
}
