export type CafeAgentId =
  | "grid_bot"
  | "trend_bot"
  | "risk_manager"
  | "news_analyst"
  | "market_regime"
  | "memory_brain";

export type CafeDataStatus = "loading" | "ready" | "stale" | "error" | "empty";
export type CafeAgentStatus = "idle" | "working" | "alert" | "happy" | "stale" | "error";
export type CafeSeverity = "neutral" | "success" | "warning" | "danger" | "info";

export type CafeMetric = {
  id: string;
  label: string;
  value: string;
  subValue?: string;
  icon: string;
  severity: CafeSeverity;
  progressValue?: number;
  dataStatus: CafeDataStatus;
};

export type CafeAgent = {
  id: CafeAgentId;
  number: number;
  name: string;
  role: string;
  subtitle: string;
  status: CafeAgentStatus;
  currentTask: string;
  moodLabel: string;
  moodScore: number;
  level: number;
  xpPercent: number;
  skillName: string;
  skillLevel: number;
  todayPnl: string;
  signalsCount: number;
  accuracyPercent: number;
  color: string;
  stationClass: string;
  sprite: string;
  fallbackIcon: string;
  lastUpdatedAt: string;
};

export type CafeMission = {
  id: string;
  title: string;
  current: number;
  target: number;
  reward: string;
  complete: boolean;
};

export type CafeAlert = {
  id: string;
  severity: Exclude<CafeSeverity, "neutral">;
  title: string;
  timestamp: string;
  sourceAgentId: CafeAgentId;
};

export type CafeTrade = {
  id: string;
  symbol: string;
  side: "BUY" | "SELL";
  pnl: string;
  status: "paper" | "watching" | "closed";
};

export type CafeDecision = {
  id: string;
  time: string;
  summary: string;
  status: "accepted" | "watching" | "blocked";
};

export type CafeReward = {
  id: string;
  icon: string;
  label: string;
  amount: string;
};

export type TradingCafeHqMock = {
  generatedAt: string;
  sourceLabel: string;
  dataStatus: CafeDataStatus;
  topMetrics: CafeMetric[];
  navItems: Array<{ id: string; label: string; icon: string; badge?: number; disabled?: boolean }>;
  agents: CafeAgent[];
  missions: CafeMission[];
  alerts: CafeAlert[];
  trades: CafeTrade[];
  decisions: CafeDecision[];
  rewards: CafeReward[];
  cafeLevel: { level: number; xp: number; target: number; reputation: string; streakDays: number };
  placeholders: {
    loading: string;
    emptyAlerts: string;
    emptyTrades: string;
    emptyDecisions: string;
    errorTitle: string;
    staleTitle: string;
  };
  safety: {
    phase: "M-0B_BLOCKED";
    liveTradingEnabled: false;
    orderPlacementEnabled: false;
    productionTradingReady: false;
    exchangeManualApproval: "not_approved";
    readOnly: true;
    closedCycles: number;
    closedCycleLabel: string;
  };
};

const sprite = (name: string) => `/assets/trading-agent-hq/sheets/${name}_sheet.png`;

export const TRADING_CAFE_HQ_MOCK: TradingCafeHqMock = {
  generatedAt: "mock-2026-06-02T00:00:00+07:00",
  sourceLabel: "Static mock data / read-only prototype",
  dataStatus: "stale",
  topMetrics: [
    { id: "market", label: "Market Mood", value: "BULLISH", subValue: "72%", icon: "🌳", severity: "success", progressValue: 72, dataStatus: "ready" },
    { id: "equity", label: "Café Equity", value: "$128,450", subValue: "+2.35%", icon: "🪙", severity: "success", progressValue: 68, dataStatus: "ready" },
    { id: "profit", label: "Daily Profit", value: "+$2,840", subValue: "+1.89%", icon: "☕", severity: "success", progressValue: 61, dataStatus: "ready" },
    { id: "risk", label: "Risk Heat", value: "MEDIUM", subValue: "42 / 100", icon: "🔥", severity: "warning", progressValue: 42, dataStatus: "ready" },
    { id: "agents", label: "Agents Active", value: "6 / 6", subValue: "all stations", icon: "👨‍👩‍👧‍👦", severity: "info", progressValue: 100, dataStatus: "ready" },
    { id: "energy", label: "Energy / Focus", value: "88 / 100", subValue: "stable", icon: "💧", severity: "info", progressValue: 88, dataStatus: "stale" },
  ],
  navItems: [
    { id: "hq", label: "HQ", icon: "🏠" },
    { id: "agents", label: "Agents", icon: "👨‍👩‍👧‍👦" },
    { id: "tasks", label: "Tasks", icon: "📋", badge: 3 },
    { id: "portfolio", label: "Portfolio", icon: "🥧" },
    { id: "trades", label: "Trades", icon: "↕️" },
    { id: "memory", label: "Memory", icon: "🧠" },
    { id: "upgrade", label: "Upgrade", icon: "🌿", disabled: true },
  ],
  agents: [
    {
      id: "grid_bot",
      number: 1,
      name: "Grid Bot",
      role: "Order & Execution",
      subtitle: "Balancing Orders",
      status: "working",
      currentTask: "Balancing grid orders with paper-only evidence.",
      moodLabel: "Focused",
      moodScore: 76,
      level: 21,
      xpPercent: 58,
      skillName: "Grid Spacing",
      skillLevel: 4,
      todayPnl: "+$640",
      signalsCount: 8,
      accuracyPercent: 71,
      color: "#3b82f6",
      stationClass: "left-[12%] top-[16%]",
      sprite: sprite("grid_bot"),
      fallbackIcon: "🤓",
      lastUpdatedAt: "mock: 09:12",
    },
    {
      id: "trend_bot",
      number: 2,
      name: "Trend Bot",
      role: "Momentum Scout",
      subtitle: "Scanning Momentum",
      status: "happy",
      currentTask: "Scanning momentum across major pairs.",
      moodLabel: "Happy",
      moodScore: 82,
      level: 24,
      xpPercent: 64,
      skillName: "Momentum Analysis",
      skillLevel: 4,
      todayPnl: "+$1,230",
      signalsCount: 12,
      accuracyPercent: 78,
      color: "#7c3aed",
      stationClass: "left-[28%] top-[52%]",
      sprite: sprite("trend_bot"),
      fallbackIcon: "🎧",
      lastUpdatedAt: "mock: 09:14",
    },
    {
      id: "risk_manager",
      number: 3,
      name: "Risk Manager",
      role: "Protection & Control",
      subtitle: "Protecting Capital",
      status: "alert",
      currentTask: "Keeping live trading and order placement locked.",
      moodLabel: "Guarding",
      moodScore: 69,
      level: 18,
      xpPercent: 52,
      skillName: "Safety Gate",
      skillLevel: 5,
      todayPnl: "$0",
      signalsCount: 4,
      accuracyPercent: 100,
      color: "#8b5cf6",
      stationClass: "left-[18%] top-[69%]",
      sprite: sprite("risk_manager"),
      fallbackIcon: "🛡️",
      lastUpdatedAt: "mock: 09:15",
    },
    {
      id: "news_analyst",
      number: 4,
      name: "News Analyst",
      role: "News & Sentiment",
      subtitle: "Checking Market News",
      status: "idle",
      currentTask: "Waiting for public-safe news context.",
      moodLabel: "Calm",
      moodScore: 57,
      level: 17,
      xpPercent: 46,
      skillName: "Sentiment Filter",
      skillLevel: 3,
      todayPnl: "$0",
      signalsCount: 3,
      accuracyPercent: 66,
      color: "#db2777",
      stationClass: "right-[12%] top-[18%]",
      sprite: sprite("news_analyst"),
      fallbackIcon: "📰",
      lastUpdatedAt: "mock: stale",
    },
    {
      id: "market_regime",
      number: 5,
      name: "Market Regime",
      role: "Macro & Regime Detection",
      subtitle: "Reading Market Mood",
      status: "working",
      currentTask: "Classifying bullish / range / bear context.",
      moodLabel: "Watching",
      moodScore: 73,
      level: 20,
      xpPercent: 59,
      skillName: "Regime Detection",
      skillLevel: 4,
      todayPnl: "+$950",
      signalsCount: 6,
      accuracyPercent: 74,
      color: "#0ea5e9",
      stationClass: "right-[20%] top-[55%]",
      sprite: sprite("market_regime"),
      fallbackIcon: "🌐",
      lastUpdatedAt: "mock: 09:11",
    },
    {
      id: "memory_brain",
      number: 6,
      name: "Memory / Second Brain",
      role: "Knowledge & Context",
      subtitle: "Remembering Lessons",
      status: "stale",
      currentTask: "Summarizing journal context and decision history.",
      moodLabel: "Reflecting",
      moodScore: 63,
      level: 18,
      xpPercent: 48,
      skillName: "Audit Memory",
      skillLevel: 3,
      todayPnl: "$0",
      signalsCount: 9,
      accuracyPercent: 70,
      color: "#92400e",
      stationClass: "right-[12%] top-[73%]",
      sprite: sprite("memory_brain"),
      fallbackIcon: "🧠",
      lastUpdatedAt: "mock: 09:10",
    },
  ],
  missions: [
    { id: "m1", title: "Complete 10 paper trades", current: 7, target: 10, reward: "🎁", complete: false },
    { id: "m2", title: "Keep profit over $2,000", current: 2840, target: 2000, reward: "🪙", complete: true },
    { id: "m3", title: "Scan 5 market regimes", current: 4, target: 5, reward: "🌿", complete: false },
  ],
  alerts: [
    { id: "a1", severity: "warning", title: "Volatility rising in ETH", timestamp: "2m ago", sourceAgentId: "market_regime" },
    { id: "a2", severity: "danger", title: "Risk heat is medium; review before action", timestamp: "7m ago", sourceAgentId: "risk_manager" },
    { id: "a3", severity: "info", title: "Major support detected", timestamp: "18m ago", sourceAgentId: "trend_bot" },
  ],
  trades: [
    { id: "t1", symbol: "EUR / USD", side: "BUY", pnl: "+$640", status: "paper" },
    { id: "t2", symbol: "GOLD", side: "SELL", pnl: "+$310", status: "paper" },
    { id: "t3", symbol: "BTC / USD", side: "BUY", pnl: "+$950", status: "watching" },
  ],
  decisions: [
    { id: "d1", time: "09:12", summary: "Increased BTC paper position", status: "accepted" },
    { id: "d2", time: "08:47", summary: "Took profit on GOLD paper trade", status: "accepted" },
    { id: "d3", time: "08:15", summary: "Hedged exposure in simulation", status: "watching" },
  ],
  rewards: [
    { id: "r1", icon: "💎", label: "Gems", amount: "50" },
    { id: "r2", icon: "🪙", label: "Coins", amount: "2,000" },
    { id: "r3", icon: "🐑", label: "Cafe pet", amount: "1" },
  ],
  cafeLevel: { level: 18, xp: 1250, target: 2000, reputation: "Excellent", streakDays: 12 },
  placeholders: {
    loading: "Preparing the cafe command center...",
    emptyAlerts: "No alerts right now. The cafe is calm.",
    emptyTrades: "No trades recorded today.",
    emptyDecisions: "No decisions have been logged yet.",
    errorTitle: "Could not load mock source preview.",
    staleTitle: "Data may be outdated. Last update is mock-only.",
  },
  safety: {
    phase: "M-0B_BLOCKED",
    liveTradingEnabled: false,
    orderPlacementEnabled: false,
    productionTradingReady: false,
    exchangeManualApproval: "not_approved",
    readOnly: true,
    closedCycles: 0,
    closedCycleLabel: "ยังไม่มีข้อมูลรอบปิด",
  },
};
