// dashboard/components/trading-agent-hq/AgentSprite.tsx
"use client";

import type { AgentPlacement } from "@/lib/trading-agent-hq/sceneConfig";
import { toPct } from "@/lib/trading-agent-hq/sceneConfig";
import type { AgentVM } from "@/lib/trading-agent-hq/viewModel";
import type { AnimKey } from "@/lib/trading-agent-hq/animationConfig";
import { VISUAL_BEHAVIOR, FRAME } from "@/lib/trading-agent-hq/animationConfig";
import { SHEET_SRC, SHEET, framePositionX, framePositionY } from "@/lib/trading-agent-hq/assetManifest";
import AgentBubble from "./AgentBubble";

interface Props {
  placement: AgentPlacement;
  vm: AgentVM;
  animKey: AnimKey;
  selected: boolean;
  hovered: boolean;
  lowPower: boolean;
  debug: boolean;
  onHover: (id: string | null) => void;
  onSelect: (id: string) => void;
  onDouble: (id: string) => void;
}

const TONE_RING: Record<string, string> = {
  neutral: "transparent",
  ok: "#3aa67688",
  warn: "#e0a02088",
  danger: "#d6453a88",
};

const CYCLE_DURATION: Record<AnimKey, string> = {
  idle: "7.2s",
  working: "5.2s",
  scanning: "5.6s",
  guarding: "8s",
  logging: "6s",
  alert: "1.2s",
  error: "1.2s",
  paused: "4.8s",
};

const CYCLE_DELAY: Record<string, string> = {
  grid_bot: "-0.2s",
  trend_bot: "-1.1s",
  risk_manager: "-2.0s",
  news_analyst: "-0.7s",
  market_regime: "-1.6s",
  memory_brain: "-2.6s",
};

// Placeholder sprite (no real sprite sheet yet — THQ-2). Honest visual: colored chibi block.
export default function AgentSprite({
  placement, vm, animKey, selected, hovered, lowPower, debug, onHover, onSelect, onDouble,
}: Props) {
  const { leftPct, topPct } = toPct(placement.x, placement.y);
  const size = 96 * placement.scale;
  const behavior = VISUAL_BEHAVIOR[animKey];
  // Low Power: no continuous animation loop; transient (alert/error) still allowed to flash once.
  const animClass = lowPower && !behavior.transient ? "" : behavior.cssClass;
  const toneRing = TONE_RING[behavior.tone] ?? "transparent";
  const sheetSrc = SHEET_SRC[placement.id];
  const frame = FRAME[animKey];
  const cell = size * 1.8; // square sprite cell display size
  const cycling = !!frame.cycle && !lowPower;
  const cycleDuration = CYCLE_DURATION[animKey];
  const cycleDelay = CYCLE_DELAY[placement.id] ?? "0s";

  const statusDot =
    vm.status === "running" || vm.status === "scanning" || vm.status === "logging" || vm.status === "guarding"
      ? "#3aa676"
      : vm.status === "alert"
      ? "#e0a020"
      : vm.status === "error"
      ? "#d6453a"
      : vm.status === "paused"
      ? "#8a8a8a"
      : "#b0b0b0"; // unknown

  return (
    <div
      className="absolute"
      style={{
        left: `${leftPct}%`,
        top: `${topPct}%`,
        transform: "translate(-50%, -100%)",
        zIndex: selected ? placement.zIndex + 80 : placement.zIndex,
      }}
      onMouseEnter={() => onHover(placement.id)}
      onMouseLeave={() => onHover(null)}
    >
      {(hovered || selected) && <AgentBubble text={vm.bubble} />}

      <button
        type="button"
        aria-label={`${placement.label} — ${vm.status}. คลิกเพื่อดูรายละเอียด, ดับเบิลคลิกเพื่อไป Classic Dashboard`}
        title={`${placement.label} · ${vm.status} → ${animKey}`}
        onClick={() => onSelect(placement.id)}
        onDoubleClick={() => onDouble(placement.id)}
        className={`group relative block cursor-pointer rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ${
          selected && !lowPower ? "thq-ring-select" : ""
        }`}
        style={{
          // mobile hitbox larger than sprite (padding)
          padding: 12,
          marginLeft: -12,
          marginTop: -12,
        }}
      >
        {/* desk highlight / glow — only on hover/select (café bg already styled) */}
        <span
          className="absolute inset-2 rounded-full transition-opacity"
          style={{
            background: placement.accentSoft,
            opacity: hovered || selected ? 0.35 : 0,
            boxShadow: !lowPower && (hovered || selected) ? `0 0 16px ${placement.accent}66` : "none",
          }}
        />
        {/* character body — sprite-sheet frame (THQ-2) with colored-block fallback */}
        {sheetSrc ? (
          <span
            className={`thq-character-motion relative block ${animClass}`}
            style={{
              width: cell,
              height: cell,
              filter: behavior.tone !== "neutral" ? `drop-shadow(0 0 5px ${toneRing})` : "none",
              outline: selected ? `3px solid ${placement.accent}` : "none",
              outlineOffset: 2,
              borderRadius: 12,
            }}
            aria-hidden
          >
            <span
              className={`block h-full w-full ${cycling ? "thq-cycle" : ""}`}
              style={{
                backgroundImage: `url(${sheetSrc})`,
                backgroundSize: SHEET.bgSize,
                backgroundPositionX: cycling ? "0%" : framePositionX(frame.col),
                backgroundPositionY: framePositionY(frame.row),
                backgroundRepeat: "no-repeat",
                animationDuration: cycling ? cycleDuration : undefined,
                animationDelay: cycling ? cycleDelay : undefined,
                imageRendering: "auto",
              }}
            />
            <span
              className="absolute right-2 top-2 h-2 w-2 rounded-full opacity-80 ring-1 ring-white/80"
              style={{ background: statusDot }}
            />
          </span>
        ) : (
          <span
            className={`thq-character-motion relative flex items-center justify-center rounded-2xl font-semibold text-white ${animClass}`}
            style={{
              width: size,
              height: size,
              background: placement.accent,
              outline: selected ? `3px solid ${placement.accent}` : "none",
              outlineOffset: 3,
              boxShadow: behavior.tone !== "neutral" ? `0 0 0 3px ${toneRing}` : "none",
            }}
          >
            {placement.label.slice(0, 1)}
            <span
              className="absolute right-2 top-2 h-2 w-2 rounded-full opacity-80 ring-1 ring-white/80"
              style={{ background: statusDot }}
            />
          </span>
        )}
        {/* name tag — only on hover/select (café bg already labels each desk) */}
        {(hovered || selected) && (
          <span className="absolute inset-x-0 -bottom-5 mx-auto block w-max max-w-[140px] rounded-full bg-white/90 px-2 py-0.5 text-center text-[10px] font-medium text-neutral-700 shadow ring-1 ring-black/5">
            {placement.label}
          </span>
        )}

        {(hovered || selected) && (
          <span
            className={`absolute -right-1 top-1 rounded-full bg-white/95 px-2 py-0.5 text-[9px] font-black uppercase text-[#2f241b] shadow ring-1 ring-black/5 ${
              selected && !lowPower ? "thq-mood-pulse" : ""
            }`}
          >
            {vm.status}
          </span>
        )}

        {/* debug hitbox + raw state */}
        {debug && (
          <span className="pointer-events-none absolute inset-0 rounded-2xl border-2 border-dashed border-fuchsia-500/70">
            <span className="absolute -bottom-4 left-0 whitespace-nowrap rounded bg-fuchsia-600 px-1 text-[9px] text-white">
              {vm.status} → {animKey} · z{placement.zIndex}
            </span>
          </span>
        )}
      </button>
    </div>
  );
}
