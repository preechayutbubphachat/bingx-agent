import type { TradingCafeHqMock } from "@/lib/trading-cafe-hq/mockData";

export default function SidebarNav({ data }: { data: TradingCafeHqMock }) {
  return (
    <>
      <aside className="hidden min-h-[620px] flex-col gap-2 rounded-2xl border border-[#bd8245]/70 bg-[#f8dfb8] p-2 shadow-sm md:flex xl:w-[170px]">
        {data.navItems.map((item) => (
          <button
            key={item.id}
            type="button"
            disabled={item.disabled}
            className={`relative flex min-h-[58px] items-center gap-3 rounded-xl border px-3 text-left transition focus:outline-none focus:ring-2 focus:ring-[#7c4d1d] motion-reduce:transition-none ${
              item.id === "hq"
                ? "border-[#d49145] bg-[#ffe5b9] text-[#2f241b]"
                : "border-[#e2b77d] bg-[#fff8ec] text-[#3f2f22] hover:bg-[#fff1d6]"
            } disabled:opacity-60`}
          >
            <span className="text-2xl">{item.icon}</span>
            <span className="hidden text-sm font-black xl:inline">{item.label}</span>
            {item.badge ? <span className="absolute right-2 top-2 rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-black text-white">{item.badge}</span> : null}
          </button>
        ))}

        <div className="mt-auto rounded-xl border border-[#e2b77d] bg-[#fff8ec] p-3 text-[#3f2f22]">
          <div className="flex items-center gap-2">
            <span className="rounded-lg bg-purple-100 px-2 py-1 text-lg">🔮</span>
            <div className="min-w-0">
              <div className="text-xs font-black">Cafe Level {data.cafeLevel.level}</div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[#ead7b8]">
                <div className="h-full rounded-full bg-purple-600" style={{ width: `${(data.cafeLevel.xp / data.cafeLevel.target) * 100}%` }} />
              </div>
              <div className="mt-1 text-[10px] font-bold text-[#7a5532]">{data.cafeLevel.xp.toLocaleString()} / {data.cafeLevel.target.toLocaleString()}</div>
            </div>
          </div>
          <div className="mt-3 border-t border-[#e8c99d] pt-2 text-[11px] font-bold">
            <div>❤️ Reputation: {data.cafeLevel.reputation}</div>
            <div className="mt-1">🔥 Streak: {data.cafeLevel.streakDays} days</div>
          </div>
        </div>
      </aside>

      <nav className="fixed inset-x-2 bottom-2 z-30 grid grid-cols-5 gap-1 rounded-2xl border border-[#bd8245]/70 bg-[#fff8ec]/95 p-1 shadow-lg backdrop-blur md:hidden">
        {data.navItems.slice(0, 5).map((item) => (
          <button key={item.id} type="button" className="relative rounded-xl px-1 py-2 text-center text-[10px] font-black text-[#3f2f22] focus:outline-none focus:ring-2 focus:ring-[#7c4d1d]">
            <span className="block text-xl">{item.icon}</span>
            <span>{item.label}</span>
            {item.badge ? <span className="absolute right-2 top-1 rounded-full bg-red-600 px-1 text-[9px] text-white">{item.badge}</span> : null}
          </button>
        ))}
      </nav>
    </>
  );
}
