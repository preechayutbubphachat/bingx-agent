import type { CafeReward, TradingCafeHqMock } from "@/lib/trading-cafe-hq/mockData";
import PanelShell from "./PanelShell";

export default function RewardsXPPanel({
  level,
  rewards,
}: {
  level: TradingCafeHqMock["cafeLevel"];
  rewards: CafeReward[];
}) {
  const pct = Math.min(100, (level.xp / Math.max(1, level.target)) * 100);

  return (
    <PanelShell title="Rewards / XP" icon="🎁">
      <div className="flex items-center gap-3">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-purple-100 text-lg font-black text-purple-800 ring-1 ring-purple-300">
          Lv. {level.level}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex justify-between text-xs font-black text-[#5f4935]">
            <span>XP</span>
            <span>{level.xp.toLocaleString()} / {level.target.toLocaleString()}</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#ead7b8]">
            <div className="h-full rounded-full bg-purple-600" style={{ width: `${pct}%` }} />
          </div>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {rewards.map((reward) => (
          <div key={reward.id} className="rounded-xl border border-[#e2b77d] bg-white p-2 text-center">
            <div className="text-2xl">{reward.icon}</div>
            <div className="mt-1 text-sm font-black text-[#2f241b]">{reward.amount}</div>
            <div className="text-[10px] font-bold text-[#7a5532]">{reward.label}</div>
          </div>
        ))}
      </div>
    </PanelShell>
  );
}
