"use client";

// dashboard/components/trading-agent-hq/TradingCafeSidebar.tsx
// Phase UI-2 — dark command-center left navigation. VISUAL-ONLY (no routing, no
// dangerous actions). Highlights the current section. SAFETY: presentation only.

type NavItem = { id: string; label: string; icon: string };

const NAV_GROUPS: { heading: string; items: NavItem[] }[] = [
  {
    heading: "ภาพรวม",
    items: [
      { id: "dashboard", label: "Dashboard", icon: "🏠" },
      { id: "agents", label: "Agent Overview", icon: "🤖" },
      { id: "regime", label: "Market Regime", icon: "🌤️" },
      { id: "session", label: "Session Status", icon: "🕒" },
      { id: "paper", label: "Paper Readiness", icon: "📝" },
      { id: "alerts", label: "Alerts Center", icon: "🔔" },
      { id: "logs", label: "Logs & Audit", icon: "📜" },
    ],
  },
  {
    heading: "บอท & ทีม",
    items: [
      { id: "grid", label: "Grid Bot", icon: "▦" },
      { id: "trend", label: "Trend Bot", icon: "📈" },
      { id: "risk", label: "Risk Manager", icon: "🛡️" },
      { id: "news", label: "News Analyst", icon: "📰" },
      { id: "memory", label: "Memory / Knowledge", icon: "🧠" },
    ],
  },
  {
    heading: "ระบบ",
    items: [
      { id: "settings", label: "Settings", icon: "⚙️" },
      { id: "health", label: "System Health", icon: "❤️" },
    ],
  },
];

export default function TradingCafeSidebar({ activeId = "dashboard" }: { activeId?: string }) {
  return (
    <aside className="hidden w-[240px] shrink-0 flex-col gap-4 bg-gradient-to-b from-[#211a12] to-[#171009] px-3 py-4 text-[#e7d8bd] lg:flex">
      <div className="px-1">
        <div className="flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#3a2c1c] text-lg">☕</span>
          <div className="leading-tight">
            <div className="text-[13px] font-black text-[#f4e9d4]">TradingAgentHQ</div>
            <div className="text-[10px] font-bold text-[#a78d6c]">Trading Cafe HQ</div>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-[#4caf74]/30 bg-[#1c2a20] px-2.5 py-1.5">
        <div className="text-[9px] font-black uppercase tracking-wide text-[#8fcfa8]">โหมดความปลอดภัย</div>
        <div className="text-[11px] font-black text-[#bfe6cc]">Paper-only · Live ปิด</div>
      </div>

      <nav className="flex flex-1 flex-col gap-3 overflow-y-auto">
        {NAV_GROUPS.map((group) => (
          <div key={group.heading}>
            <div className="px-2 pb-1 text-[9px] font-black uppercase tracking-wider text-[#7a6347]">{group.heading}</div>
            <ul className="flex flex-col gap-0.5">
              {group.items.map((item) => {
                const active = item.id === activeId;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      aria-current={active ? "page" : undefined}
                      title={active ? item.label : `${item.label} (มุมมองตัวอย่าง)`}
                      className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[12px] font-bold transition ${
                        active
                          ? "bg-[#3a2c1c] text-[#ffd9a0] shadow-inner"
                          : "text-[#bda988] hover:bg-[#2a2015] hover:text-[#e7d8bd]"
                      }`}
                    >
                      <span className="w-4 shrink-0 text-center text-[13px]">{item.icon}</span>
                      <span className="truncate">{item.label}</span>
                      {active ? <span className="ml-auto h-1.5 w-1.5 rounded-full bg-[#f0a737]" /> : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="rounded-lg bg-[#241a10] px-2.5 py-2 text-[10px] font-bold text-[#a78d6c]">
        <p>เลเยอร์แสดงผลอ่านอย่างเดียว · ไม่ส่งคำสั่งเทรด</p>
      </div>
    </aside>
  );
}
