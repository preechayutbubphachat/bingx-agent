// dashboard/components/trading-agent-hq/SceneCanvas.tsx
"use client";

import { SCENE, AGENT_PLACEMENTS } from "@/lib/trading-agent-hq/sceneConfig";
import type { TradingAgentHQViewModel, AgentId } from "@/lib/trading-agent-hq/viewModel";
import type { AnimKey } from "@/lib/trading-agent-hq/animationConfig";
import { BACKGROUND_SRC } from "@/lib/trading-agent-hq/assetManifest";
import AgentSprite from "./AgentSprite";

interface Props {
  vm: TradingAgentHQViewModel;
  animKeys: Record<AgentId, AnimKey>;
  selected: AgentId | null;
  hovered: AgentId | null;
  lowPower: boolean;
  debug: boolean;
  onHover: (id: AgentId | null) => void;
  onSelect: (id: AgentId) => void;
  onDouble: (id: AgentId) => void;
}

export default function SceneCanvas({ vm, animKeys, selected, hovered, lowPower, debug, onHover, onSelect, onDouble }: Props) {
  return (
    <div
      className="relative mx-auto w-full overflow-hidden rounded-2xl ring-1 ring-black/10"
      style={{
        aspectRatio: `${SCENE.width} / ${SCENE.height}`,
        ...(BACKGROUND_SRC
          ? {
              backgroundImage: `url(${BACKGROUND_SRC})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
            }
          : { background: "linear-gradient(160deg,#f6ecd9 0%,#efe2cf 38%,#e7d6bd 100%)" }),
        maxWidth: 1100,
      }}
    >
      {!BACKGROUND_SRC && <div className="absolute inset-x-0 bottom-0 h-1/3 bg-[#e0cdac]/40" />}
      {debug && (
        <div className="absolute left-2 top-2 z-[120] rounded bg-black/70 px-2 py-1 text-[10px] text-white">
          DEBUG · scene {SCENE.width}×{SCENE.height} · mock background
        </div>
      )}

      {AGENT_PLACEMENTS.map((p) => (
        <AgentSprite
          key={p.id}
          placement={p}
          vm={vm.agents[p.id]}
          animKey={animKeys[p.id] ?? "idle"}
          selected={selected === p.id}
          hovered={hovered === p.id}
          lowPower={lowPower}
          debug={debug}
          onHover={(id) => onHover(id as AgentId | null)}
          onSelect={(id) => onSelect(id as AgentId)}
          onDouble={(id) => onDouble(id as AgentId)}
        />
      ))}
    </div>
  );
}
