import type { TradingCafeHqMock } from "@/lib/trading-cafe-hq/mockData";

export default function DebugModeCard({ data }: { data: TradingCafeHqMock }) {
  return (
    <section className="flex min-h-[174px] flex-col rounded-2xl border border-[#3b817a] bg-[#79b9ad] p-3 text-white shadow-sm">
      <div className="flex items-center gap-2">
        <span className="text-xl">⭐</span>
        <h2 className="text-sm font-black">Advanced</h2>
      </div>
      <div className="mt-4 flex items-center gap-3">
        <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-[#1f2933] text-3xl ring-2 ring-white/40">⌁</div>
        <div className="min-w-0">
          <div className="text-lg font-black">Debug Mode</div>
          <p className="mt-1 text-xs font-bold text-white/90">Static placeholder only. No runtime write, no order action.</p>
        </div>
      </div>
      <div className="mt-auto rounded-xl bg-white/20 p-2 text-xs font-bold">
        {data.placeholders.errorTitle}<br />
        Action: Retry / Open Debug placeholder
      </div>
    </section>
  );
}
