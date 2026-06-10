"use client";

// dashboard/components/trading-agent-hq/CollapsedCardGrid.tsx
// Phase UI-1.1 — responsive grid of collapsed cards shown as compact tiles
// (replaces the old full-width collapsed rows). Sits above the expanded cards.
// SAFETY: presentation only. No fetch, no token, no run/live/exchange controls.

import CollapsedCardTile, { type CollapsedTile } from "./CollapsedCardTile";

type Props = {
  tiles: CollapsedTile[];
  onExpand: (cardId: string) => void;
};

export default function CollapsedCardGrid({ tiles, onExpand }: Props) {
  if (tiles.length === 0) return null;
  const updatedCount = tiles.filter((t) => t.severity !== "none" || t.hasUpdates).length;
  return (
    <section className="rounded-lg border border-[#3a2c21]/30 bg-[#26190f] p-2.5 shadow-sm">
      <div className="mb-2 flex flex-wrap items-center gap-2 px-0.5">
        <span className="rounded-full bg-[#3a2c20] px-2 py-1 text-[10px] font-black text-[#cbb799]">การ์ดที่ย่อ</span>
        <span className="text-[10px] font-bold text-[#9a8a72]">{tiles.length} ใบ · กด tile เพื่อขยาย</span>
        {updatedCount > 0 ? (
          <span className="ml-auto rounded-full bg-amber-200 px-2 py-0.5 text-[10px] font-black text-amber-900">
            {updatedCount} มีอัปเดต
          </span>
        ) : null}
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
        {tiles.map((tile) => (
          <CollapsedCardTile key={tile.id} tile={tile} onExpand={onExpand} />
        ))}
      </div>
    </section>
  );
}
