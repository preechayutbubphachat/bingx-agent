// dashboard/lib/trading-agent-hq/sceneConfig.ts
// TradingAgentHQ — scene placement + z-index (from docs/TRADING_AGENT_HQ_ASSET_SPEC.md)
// Coordinate system: top-left. Sprite anchor: bottom-center. Background 1672x941.

import type { AgentId } from "./viewModel";

export const SCENE = {
  width: 1672,
  height: 941,
  /** background asset path (placeholder until THQ-2 produces the real scene) */
  background: "/assets/trading-agent-hq/background/scene_main_1672x941.png",
} as const;

export const Z = {
  background: 0,
  deskHighlight: 10,
  spriteUpper: 30,
  spriteMiddle: 40,
  spriteLower: 60,
  bubble: 100,
  selectedOutline: 110,
  rightInspector: 200,
  topHud: 300,
  modalDebug: 500,
} as const;

export interface AgentPlacement {
  id: AgentId;
  label: string;
  role: string;
  x: number;
  y: number;
  scale: number;
  zIndex: number;
  /** tailwind-ish accent for the placeholder sprite (no real asset yet) */
  accent: string;
  accentSoft: string;
}

// coordinates calibrated to the designed café background (พื้นหลัง.png, 1672×941).
// y = feet anchor (bottom-center). Each agent sits at its labeled desk.
export const AGENT_PLACEMENTS: AgentPlacement[] = [
  { id: "grid_bot", label: "Grid Bot", role: "Order-balancing", x: 400, y: 528, scale: 0.8, zIndex: Z.spriteUpper, accent: "#3aa676", accentSoft: "#d6f0e4" },
  { id: "trend_bot", label: "Trend Bot", role: "Momentum scout", x: 220, y: 718, scale: 0.82, zIndex: Z.spriteMiddle, accent: "#7c5cd6", accentSoft: "#e6dcf7" },
  { id: "risk_manager", label: "Risk Manager", role: "Capital guardian", x: 392, y: 875, scale: 0.86, zIndex: Z.spriteLower, accent: "#3b6ea5", accentSoft: "#dbe7f3" },
  { id: "news_analyst", label: "News Analyst", role: "News scout", x: 1192, y: 528, scale: 0.8, zIndex: Z.spriteUpper, accent: "#d65c93", accentSoft: "#f7dce9" },
  { id: "market_regime", label: "Market Regime", role: "Macro strategist", x: 1425, y: 723, scale: 0.82, zIndex: Z.spriteMiddle, accent: "#6a9a4a", accentSoft: "#e3f0d6" },
  { id: "memory_brain", label: "Memory / Second Brain", role: "Logs & memory", x: 1235, y: 878, scale: 0.86, zIndex: Z.spriteLower, accent: "#a9824a", accentSoft: "#f0e6d6" },
];

/** convert scene px → percentage of background box (responsive, anchor bottom-center) */
export function toPct(x: number, y: number) {
  return { leftPct: (x / SCENE.width) * 100, topPct: (y / SCENE.height) * 100 };
}
