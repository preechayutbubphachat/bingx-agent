import type { TradingCafeHqMock } from "@/lib/trading-cafe-hq/mockData";
import MetricCard from "./MetricCard";

export default function TopStatusBar({ data }: { data: TradingCafeHqMock }) {
  return (
    <header className="grid gap-2 rounded-2xl border border-[#bd8245]/70 bg-[#f5d7a9] p-2 shadow-[0_4px_0_rgba(92,54,18,0.18)] xl:grid-cols-[260px_minmax(0,1fr)]">
      <div className="flex min-h-[82px] items-center gap-3 rounded-xl border border-[#d4a86f]/70 bg-[#fff8ec] p-3 shadow-sm">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-[#f4c070] text-4xl ring-2 ring-[#7c4d1d]/25">🏠</div>
        <div className="min-w-0">
          <h1 className="truncate text-xl font-black tracking-tight text-[#2f241b]">TRADING CAFFEE HQ</h1>
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#7a5532]">AI Agent Command Center</p>
          <p className="mt-1 text-[10px] font-bold text-emerald-800">Read-only data adapter</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
        {data.topMetrics.map((metric) => (
          <MetricCard key={metric.id} metric={metric} />
        ))}
      </div>
    </header>
  );
}
