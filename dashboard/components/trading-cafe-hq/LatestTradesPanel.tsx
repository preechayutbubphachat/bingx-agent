import type { CafeTrade } from "@/lib/trading-cafe-hq/mockData";
import PanelShell from "./PanelShell";

export default function LatestTradesPanel({ trades, emptyCopy }: { trades: CafeTrade[]; emptyCopy: string }) {
  return (
    <PanelShell title="Latest Trades" icon="↕️" actionLabel="View All Trades">
      {trades.length ? (
        <ul>
          {trades.map((trade) => (
            <li key={trade.id} className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-2 border-b border-[#ead7b8] py-2 text-xs last:border-0">
              <span className="truncate font-bold text-[#3f2f22]">{trade.symbol}</span>
              <span className={`font-black ${trade.side === "BUY" ? "text-emerald-700" : "text-red-700"}`}>{trade.side}</span>
              <span className="font-black tabular-nums text-emerald-700">{trade.pnl}</span>
            </li>
          ))}
        </ul>
      ) : (
        <div className="rounded-xl bg-[#fff1d6] p-3 text-xs font-bold text-[#7a5532]">{emptyCopy}</div>
      )}
    </PanelShell>
  );
}
