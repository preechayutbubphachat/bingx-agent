import type { PaperVM } from "@/lib/trading-agent-hq/viewModel";

type Props = { paper: PaperVM };

const NA = "ยังไม่มีข้อมูล";

// Read-only console. Buttons are DISABLED by design:
// the internal dry-run route requires a server secret token and there is no confirmed
// dashboard admin-auth/session layer, so calling it from the browser would leak the token.
// Until a safe admin-auth pattern is confirmed, operators use the T-3F shell pack instead.
const ACTIONS = [
  "Baseline Check",
  "Create 20-min Session",
  "Verify Session",
  "One-shot Dry Run",
  "Cleanup",
];

function yn(v: boolean | undefined) {
  return v ? "ใช่" : "ไม่";
}

function Field({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`rounded-md border px-2 py-1.5 ${strong ? "border-[#b08a5e] bg-[#fbf4e8]" : "border-[#d6c2a6] bg-white/75"}`}>
      <div className="text-[10px] font-black text-[#8a6a4f]">{label}</div>
      <div className="mt-0.5 break-words text-[12px] font-black text-[#2f241b]">{value}</div>
    </div>
  );
}

export default function TrendPaperDryRunConsoleCard({ paper }: Props) {
  const eng = paper.trendPaperExecutionEngine;
  const bridge = paper.trendPaperArmIntentBridge;
  const sess = paper.trendPaperArmSession;

  return (
    <section className="rounded-lg border border-[#d1b58c] bg-[#f4efe7] p-3 text-[#3f2f22] shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-black text-[#2f241b]">Trend Paper Dry Run Console (Read-only)</h2>
          <p className="mt-0.5 text-[11px] font-bold text-[#80644c]">
            Paper-only dry run เท่านั้น · ไม่ใช่เงินจริง · ไม่ส่งคำสั่ง BingX · ไม่ปลดล็อก M-0B · ไม่กระทบ Grid closedCycles
          </p>
        </div>
        <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-1 text-[10px] font-black text-amber-900">
          ปุ่มปิดไว้ (security)
        </span>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Config Enabled" value={yn(eng?.enabled)} strong />
        <Field label="Session Status" value={sess?.status ?? NA} />
        <Field label="Bridge Source" value={bridge?.source ?? NA} />
        <Field label="Upgraded To Armed" value={yn(bridge?.upgradedToArmed)} />
        <Field label="Effective Gate" value={bridge?.effectiveStatus ?? NA} />
        <Field label="Last Action" value={eng?.lastAction ?? NA} />
        <Field label="Last Reason" value={eng?.lastReason ?? NA} />
        <Field label="Open Trend Position" value={eng?.openTrendPaperPosition ? "มี" : "ไม่มี"} />
        <Field label="Trend Closed Trades" value={String(eng?.trendPaperClosedTrades ?? 0)} />
        <Field label="paperOnly" value={yn(eng?.paperOnly)} />
        <Field label="liveActivationAllowed" value={yn(eng?.liveActivationAllowed)} />
        <Field label="exchangeOrderAllowed" value={yn(eng?.exchangeOrderAllowed)} />
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {ACTIONS.map((label) => (
          <button
            key={label}
            type="button"
            disabled
            aria-disabled="true"
            title="ปิดไว้: ต้องยืนยัน admin-auth ก่อน (กันไม่ให้ token หลุดไป browser)"
            className="cursor-not-allowed rounded-md border border-[#d6c2a6] bg-[#efe6d6] px-3 py-1.5 text-[12px] font-black text-[#9a8a72] opacity-60"
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-bold text-amber-950">
        ปุ่มถูกปิดเพื่อความปลอดภัย — internal dry-run route ต้องใช้ server token และยังไม่มี admin-auth layer ที่ยืนยันแล้ว
        การเรียกจาก browser อาจทำให้ token หลุด · ระหว่างนี้ operator ใช้ T-3F shell pack (`docs/TREND_STRATEGY_T3F_OPERATOR_SHELL_PACK.md`) แทน
      </div>

      <div className="mt-2 rounded-md border border-[#d6c2a6] bg-white/70 px-3 py-2 text-[12px] font-black text-[#5b4432]">
        ไม่มีปุ่ม live · ไม่มีปุ่ม exchange · ไม่มีปุ่ม cron · ไม่มีปุ่ม M-0B · ไม่มีปุ่ม grid activation
      </div>
    </section>
  );
}
