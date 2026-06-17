"use client";

// D6.0 mission-control sidebar. Display-only navigation chrome.

type NavItem = { id: string; label: string; sub: string; icon: string };

const NAV_GROUPS: { heading: string; items: NavItem[] }[] = [
  {
    heading: "Overview",
    items: [
      { id: "dashboard", label: "ศูนย์บัญชาการ", sub: "Command Center", icon: "⌂" },
      { id: "overview", label: "ภาพรวม", sub: "Overview", icon: "◈" },
    ],
  },
  {
    heading: "Operations",
    items: [
      { id: "missions", label: "ภารกิจ Agent", sub: "Agent Missions", icon: "✦" },
      { id: "signals", label: "สัญญาณตลาด", sub: "Market Signals", icon: "⌁" },
      { id: "system", label: "ระบบ", sub: "System Status", icon: "◎" },
      { id: "evidence", label: "คลังหลักฐาน", sub: "Evidence Vault", icon: "▣" },
      { id: "audit", label: "Log & Audit", sub: "Read-only trail", icon: "☷" },
    ],
  },
  {
    heading: "Intelligence",
    items: [
      { id: "risk", label: "Risk Manager", sub: "Risk rail", icon: "◇" },
      { id: "rejection", label: "Rejection Analysis", sub: "Weak spots", icon: "△" },
      { id: "shadow", label: "Shadow Analysis", sub: "Counterfactual", icon: "◌" },
      { id: "reports", label: "รายงาน", sub: "Reports", icon: "▤" },
    ],
  },
  {
    heading: "System",
    items: [
      { id: "integrations", label: "Integrations", sub: "Display only", icon: "⌬" },
      { id: "settings", label: "Settings", sub: "Locked", icon: "⚙" },
      { id: "access", label: "Access Control", sub: "Review gate", icon: "◍" },
    ],
  },
];

export default function TradingCafeSidebar({ activeId = "dashboard" }: { activeId?: string }) {
  return (
    <aside className="hidden w-[264px] shrink-0 flex-col border-r border-cyan-400/20 bg-[#030914]/95 px-3 py-4 text-slate-200 shadow-[8px_0_40px_rgba(0,255,255,0.08)] lg:flex">
      <div className="mb-4 rounded-2xl border border-fuchsia-400/30 bg-slate-950/70 p-3 shadow-[0_0_30px_rgba(217,70,239,0.14)]">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-xl border border-cyan-300/50 bg-cyan-400/10 text-cyan-200 shadow-[0_0_22px_rgba(34,211,238,0.32)]">⬢</span>
          <div className="min-w-0">
            <div className="truncate text-[15px] font-black text-white">TradingAgentHQ</div>
            <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-cyan-300">Command Center</div>
          </div>
        </div>
        <div className="mt-3 rounded-lg border border-emerald-300/30 bg-emerald-400/10 px-2.5 py-2">
          <div className="text-[9px] font-black uppercase tracking-[0.22em] text-emerald-200">Safety Mode</div>
          <div className="mt-0.5 text-[12px] font-black text-emerald-100">Paper-only · Live OFF</div>
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-4 overflow-y-auto pr-1">
        {NAV_GROUPS.map((group) => (
          <div key={group.heading}>
            <div className="px-2 pb-1 text-[9px] font-black uppercase tracking-[0.24em] text-fuchsia-300/80">{group.heading}</div>
            <ul className="flex flex-col gap-1">
              {group.items.map((item) => {
                const active = item.id === activeId;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      aria-current={active ? "page" : undefined}
                      title={`${item.label} / ${item.sub}`}
                      className={`group flex w-full items-center gap-2.5 rounded-xl border px-2.5 py-2 text-left transition ${
                        active
                          ? "border-cyan-300/70 bg-cyan-400/15 text-cyan-50 shadow-[0_0_22px_rgba(34,211,238,0.24)]"
                          : "border-transparent text-slate-400 hover:border-cyan-400/30 hover:bg-cyan-400/5 hover:text-slate-100"
                      }`}
                    >
                      <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg border text-[13px] ${active ? "border-cyan-200/70 bg-cyan-200/10 text-cyan-100" : "border-slate-700 bg-slate-900 text-slate-400 group-hover:border-cyan-400/40"}`}>{item.icon}</span>
                      <span className="min-w-0">
                        <span className="block truncate text-[12px] font-black">{item.label}</span>
                        <span className="block truncate text-[9px] font-bold uppercase tracking-wide opacity-65">{item.sub}</span>
                      </span>
                      {active ? <span className="ml-auto h-1.5 w-1.5 rounded-full bg-cyan-300 shadow-[0_0_10px_rgba(125,249,255,0.9)]" /> : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="mt-4 rounded-xl border border-cyan-400/20 bg-slate-950/70 p-3">
        <div className="text-[10px] font-black uppercase tracking-[0.18em] text-cyan-300">System Health</div>
        <div className="mt-1 text-[20px] font-black text-cyan-100">Review</div>
        <p className="mt-1 text-[10px] font-bold leading-relaxed text-slate-400">Dashboard เพื่อการรีวิวเท่านั้น · ไม่ส่งคำสั่งเทรด</p>
      </div>
    </aside>
  );
}
