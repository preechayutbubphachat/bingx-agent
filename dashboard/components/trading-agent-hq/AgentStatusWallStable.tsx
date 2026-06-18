"use client";

import { statusWallStableGridClass } from "@/lib/trading-agent-hq/missionControlVisual";
import AgentStatusWallStableCard from "./AgentStatusWallStableCard";
import type { CollapsedTile } from "./CollapsedCardTile";

type Props = {
  tiles: CollapsedTile[];
  onExpand: (cardId: string) => void;
};

export default function AgentStatusWallStable({ tiles, onExpand }: Props) {
  const updatedCount = tiles.filter((tile) => tile.severity !== "none" || tile.hasUpdates).length;

  if (tiles.length === 0) {
    return (
      <div className="status-wall-stable-empty rounded-xl border border-slate-700 bg-slate-900/70 px-3 py-3 text-center text-[11px] font-bold text-slate-400">
        No collapsed status cards in this view.
      </div>
    );
  }

  return (
    <section className="status-wall-stable-section rounded-2xl border border-cyan-400/20 bg-slate-950/70 p-2.5 shadow-[0_0_22px_rgba(34,211,238,0.06)]">
      <header className="mb-2 flex flex-wrap items-center gap-2 px-0.5">
        <span className="rounded-full border border-cyan-300/30 bg-cyan-400/10 px-2 py-1 text-[10px] font-black text-cyan-100">
          Normal-flow status grid
        </span>
        <span className="text-[10px] font-bold text-slate-500">{tiles.length} cards · click to expand</span>
        {updatedCount > 0 ? (
          <span className="ml-auto rounded-full border border-amber-300/40 bg-amber-400/10 px-2 py-0.5 text-[10px] font-black text-amber-100">
            {updatedCount} updated
          </span>
        ) : null}
      </header>

      <div className={statusWallStableGridClass()}>
        {tiles.map((tile) => (
          <AgentStatusWallStableCard key={tile.id} tile={tile} onExpand={onExpand} />
        ))}
      </div>
    </section>
  );
}
