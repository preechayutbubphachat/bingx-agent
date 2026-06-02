// dashboard/lib/trading-agent-hq/assetManifest.ts
// THQ-2 — character sprite-sheet manifest.
// Source: TradingAgentHQ/*/​*_sprite.png (6 cols × 4 rows × 256px = 24 frames),
// checkerboard background color-keyed to transparent → public/assets/.../sheets/.
// Row layout: 0 = idle/standing · 1 = working (desk) · 2 = tablet/pointing · 3 = happy/cheer.

import type { AgentId } from "./viewModel";

export const SHEET = {
  cols: 18,
  rows: 4,
  frame: 256,
  /** css background-size to fit one cell at element size */
  bgSize: "1800% 400%",
} as const;

export const SHEET_SRC: Record<AgentId, string | null> = {
  grid_bot: "/assets/trading-agent-hq/sheets/grid_bot_sheet_anim.webp",
  trend_bot: "/assets/trading-agent-hq/sheets/trend_bot_sheet_anim.webp",
  risk_manager: "/assets/trading-agent-hq/sheets/risk_manager_sheet_anim.webp",
  news_analyst: "/assets/trading-agent-hq/sheets/news_analyst_sheet_anim.webp",
  market_regime: "/assets/trading-agent-hq/sheets/market_regime_sheet_anim.webp",
  memory_brain: "/assets/trading-agent-hq/sheets/memory_brain_sheet_anim.webp",
};

/** cozy café scene background (procedural art) */
export const BACKGROUND_SRC: string | null =
  "/assets/trading-agent-hq/background/cafe_scene.png";

/** css background-position-x (%) for the configured sheet width. */
export function framePositionX(col: number): string {
  return `${col * (100 / (SHEET.cols - 1))}%`;
}
/** css background-position-y (%) for a row when bgSize height = 400% */
export function framePositionY(row: number): string {
  return `${row * (100 / (SHEET.rows - 1))}%`; // 0,33.3,66.6,100
}
/** css background-position (%) to show cell (row,col) */
export function framePosition(row: number, col: number): string {
  return `${framePositionX(col)} ${framePositionY(row)}`;
}
