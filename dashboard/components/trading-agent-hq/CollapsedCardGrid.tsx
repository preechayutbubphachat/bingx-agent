"use client";

// Compatibility wrapper for the old collapsed-card entrypoint.
// D6.4 routes Status Wall rendering through the stable normal-flow component.

import AgentStatusWallStable from "./AgentStatusWallStable";
import type { CollapsedTile } from "./CollapsedCardTile";

type Props = {
  tiles: CollapsedTile[];
  onExpand: (cardId: string) => void;
};

export default function CollapsedCardGrid({ tiles, onExpand }: Props) {
  return <AgentStatusWallStable tiles={tiles} onExpand={onExpand} />;
}
