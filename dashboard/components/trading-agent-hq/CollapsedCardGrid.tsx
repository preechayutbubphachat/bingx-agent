"use client";

// dashboard/components/trading-agent-hq/CollapsedCardGrid.tsx
// Phase UI-1.1 — responsive grid of collapsed cards shown as compact tiles
// (replaces the old full-width collapsed rows). Sits above the expanded cards.
// SAFETY: presentation only. No runtime side effects or control surfaces.

import CollapsedCardTile, { type CollapsedTile } from "./CollapsedCardTile";

type Props = {
  tiles: CollapsedTile[];
  onExpand: (cardId: string) => void;
};

export default function CollapsedCardGrid({ tiles, onExpand }: Props) {
  if (tiles.length === 0) return null;
  const updatedCount = tiles.filter((t) => t.severity !== "none" || t.hasUpdates).length;
  return (
    <section className="rounded-2xl border border-cyan-400/20 bg-slate-950/70 p-2.5 shadow-[0_0_30px_rgba(34,211,238,0.08)]">
      <div className="mb-2 flex flex-wrap items-center gap-2 px-0.5">
        <span className="rounded-full border border-cyan-300/30 bg-cyan-400/10 px-2 py-1 text-[10px] font-black text-cyan-100">การ์ดที่ย่อ</span>
        <span className="text-[10px] font-bold text-slate-500">{tiles.length} ใบ · กด tile เพื่อขยาย</span>
        {updatedCount > 0 ? (
          <span className="ml-auto rounded-full border border-amber-300/40 bg-amber-400/10 px-2 py-0.5 text-[10px] font-black text-amber-100">
            {updatedCount} มีอัปเดต
          </span>
        ) : null}
      </div>
      <div className="agent-hq-collapsed-grid grid max-h-[248px] grid-cols-1 gap-2 overflow-y-auto overflow-x-hidden overscroll-contain pr-1 [contain:layout_paint] sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:max-h-[268px] scrollbar-thin">
        {tiles.map((tile) => (
          <CollapsedCardTile key={tile.id} tile={tile} onExpand={onExpand} />
        ))}
      </div>
    </section>
  );
}
