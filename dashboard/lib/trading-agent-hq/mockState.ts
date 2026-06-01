// dashboard/lib/trading-agent-hq/mockState.ts
// TradingAgentHQ — THQ-4 static mock ViewModel.
// HONEST mock: reflects real M-0Z-6 posture (paper LIVE, closedCycles=0 DATA_GAP, M-0B BLOCKED).
// NO real data binding here — THQ-5 replaces this with a public-safe adapter.

import type { TradingAgentHQViewModel } from "./viewModel";

export const MOCK_VIEW_MODEL: TradingAgentHQViewModel = {
  mode: "trading_agent_hq",
  meta: {
    lastUpdate: "—",
    source: "mock",
    isStale: true, // mock is never live truth
  },
  safety: {
    liveTradingEnabled: false,
    orderPlacementEnabled: false,
    productionTradingReady: false,
    exchangeManualApproval: "not_approved",
    phase: "M-0B_BLOCKED",
  },
  paper: {
    totalOrderFilled: 30,
    closedCycles: 0,
    sampleStatus: "INSUFFICIENT_SAMPLE",
    paperModeDetected: true,
    edgeStatus: "DATA_GAP", // closedCycles===0 → never edge PASS
  },
  topHud: {
    marketMood: "UNKNOWN",
    simEquity: null,
    dailyPnl: null,
    riskHeat: "UNKNOWN",
    agentsActive: 2,
  },
  bottomLog: [
    { ts: "—", type: "SYSTEM", text: "TradingAgentHQ static prototype (mock data — not live)" },
    { ts: "—", type: "FILL_RESULT", text: "paper MARKET fill recorded (mock)", agentId: "grid_bot" },
    { ts: "—", type: "DECISION", text: "regime evaluation pending (mock)", agentId: "market_regime" },
    { ts: "—", type: "ALERT", text: "closed cycles = 0 → DATA_GAP (honest)", agentId: "risk_manager" },
  ],
  agents: {
    grid_bot: {
      id: "grid_bot", status: "running", visualStates: ["running", "balancing_orders"],
      animation: "grid_working", bubble: "Balancing orders… (mock)",
      currentTask: "Paper grid cycle", lastAction: "paper MARKET fill (mock)",
      metric: "fills: 30", confidence: "n/a (paper)",
    },
    trend_bot: {
      id: "trend_bot", status: "unknown", visualStates: ["idle"],
      animation: "idle", bubble: "Waiting for data (mock)",
      currentTask: "Momentum scan", lastAction: "—", metric: null, confidence: null,
    },
    risk_manager: {
      id: "risk_manager", status: "guarding", visualStates: ["calm"],
      animation: "idle", bubble: "Guarding capital (mock)",
      currentTask: "Risk watch", lastAction: "flag check", metric: "live: OFF", confidence: "safe-mode",
    },
    news_analyst: {
      id: "news_analyst", status: "unknown", visualStates: ["idle"],
      animation: "idle", bubble: "No news feed (mock)",
      currentTask: "Headline scan", lastAction: "—", metric: null, confidence: null,
    },
    market_regime: {
      id: "market_regime", status: "scanning", visualStates: ["thinking"],
      animation: "idle", bubble: "Reading regime… (mock)",
      currentTask: "Regime classify", lastAction: "decision pending", metric: "mode: UNKNOWN", confidence: null,
    },
    memory_brain: {
      id: "memory_brain", status: "logging", visualStates: ["idle"],
      animation: "idle", bubble: "Writing journal (mock)",
      currentTask: "Audit log", lastAction: "append event", metric: null, confidence: null,
    },
  },
};
