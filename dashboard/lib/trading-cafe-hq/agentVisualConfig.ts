import type { CafeAgentId } from "./mockData";

export type AgentVisualConfig = {
  spriteSrc: string;
  portraitSrc: string;
  sceneClass: string;
  scaleClass: string;
  zIndexClass: string;
};

export const AGENT_VISUAL_CONFIG: Record<CafeAgentId, AgentVisualConfig> = {
  grid_bot: {
    spriteSrc: "/assets/trading-agent-hq/sheets/grid_bot_sheet.png",
    portraitSrc: "/assets/trading-agent-hq/portraits/grid_bot_portrait.png",
    sceneClass: "left-[17%] top-[24%]",
    scaleClass: "h-28 w-28",
    zIndexClass: "z-20",
  },
  trend_bot: {
    spriteSrc: "/assets/trading-agent-hq/sheets/trend_bot_sheet.png",
    portraitSrc: "/assets/trading-agent-hq/portraits/trend_bot_portrait.png",
    sceneClass: "left-[34%] top-[55%]",
    scaleClass: "h-28 w-28",
    zIndexClass: "z-30",
  },
  risk_manager: {
    spriteSrc: "/assets/trading-agent-hq/sheets/risk_manager_sheet.png",
    portraitSrc: "/assets/trading-agent-hq/portraits/risk_manager_portrait.png",
    sceneClass: "left-[22%] top-[69%]",
    scaleClass: "h-28 w-28",
    zIndexClass: "z-40",
  },
  news_analyst: {
    spriteSrc: "/assets/trading-agent-hq/sheets/news_analyst_sheet.png",
    portraitSrc: "/assets/trading-agent-hq/portraits/news_analyst_portrait.png",
    sceneClass: "right-[18%] top-[24%]",
    scaleClass: "h-28 w-28",
    zIndexClass: "z-20",
  },
  market_regime: {
    spriteSrc: "/assets/trading-agent-hq/sheets/market_regime_sheet.png",
    portraitSrc: "/assets/trading-agent-hq/portraits/market_regime_portrait.png",
    sceneClass: "right-[20%] top-[56%]",
    scaleClass: "h-28 w-28",
    zIndexClass: "z-30",
  },
  memory_brain: {
    spriteSrc: "/assets/trading-agent-hq/sheets/memory_brain_sheet.png",
    portraitSrc: "/assets/trading-agent-hq/portraits/memory_brain_portrait.png",
    sceneClass: "right-[14%] top-[72%]",
    scaleClass: "h-28 w-28",
    zIndexClass: "z-40",
  },
};

export function getAgentVisualConfig(id: CafeAgentId): AgentVisualConfig {
  return AGENT_VISUAL_CONFIG[id];
}
