import type { AgentId, TradingAgentHQViewModel } from "./viewModel";

export type MissionCategory =
  | "Daily Safety"
  | "Paper Evidence"
  | "Data Quality"
  | "Visual QA"
  | "Operator Review";

export type MissionStatus =
  | "DONE"
  | "IN_PROGRESS"
  | "DATA_GAP"
  | "BLOCKED"
  | "NOT_APPROVED"
  | "WARNING"
  | "FAIL";

export type ProgressionMood = "calm" | "focused" | "blocked" | "warning" | "unknown";
export type ProgressionStatus = "active" | "watching" | "data_gap" | "blocked" | "unknown";
export type EvidenceQuality = "strong" | "partial" | "data_gap" | "stale" | "unknown";
export type SafetyState = "safe" | "warning" | "blocked";

export interface Mission {
  id: string;
  category: MissionCategory;
  title: string;
  detail: string;
  status: MissionStatus;
  progressPct: number;
}

export interface AgentSkill {
  name: string;
  state: "online" | "watching" | "locked" | "data_gap";
}

export interface AgentBadge {
  name: string;
  tone: "safe" | "info" | "warning" | "blocked";
  description: string;
}

export interface AgentProgression {
  agentId: AgentId;
  name: string;
  role: string;
  level: number;
  xp: number;
  xpToNextLevel: number;
  xpPct: number;
  missions: Mission[];
  skills: AgentSkill[];
  badges: AgentBadge[];
  mood: ProgressionMood;
  status: ProgressionStatus;
  evidenceQuality: EvidenceQuality;
  safetyState: SafetyState;
  blockedReasons: string[];
  lastUpdated: string;
}

const AGENT_COPY: Record<AgentId, { name: string; role: string }> = {
  grid_bot: { name: "Grid Bot", role: "Grid Evidence / Order Simulation" },
  trend_bot: { name: "Trend Bot", role: "Momentum / Opportunity Scout" },
  risk_manager: { name: "Risk Manager", role: "Safety Gatekeeper" },
  news_analyst: { name: "News Analyst", role: "Event Risk / Sentiment Watch" },
  market_regime: { name: "Market Regime Analyst", role: "Regime / Volatility Context" },
  memory_brain: { name: "Memory / Second Brain", role: "Journal / Evidence / Lessons" },
};

const ORDER: AgentId[] = ["grid_bot", "trend_bot", "risk_manager", "news_analyst", "market_regime", "memory_brain"];

function clamp(value: number, min = 0, max = 100): number {
  return Math.min(max, Math.max(min, value));
}

function levelFromXp(totalXp: number) {
  const xp = Math.max(0, Math.floor(totalXp));
  const level = Math.floor(Math.sqrt(xp / 100)) + 1;
  const currentLevelFloor = (level - 1) * (level - 1) * 100;
  const nextLevelFloor = level * level * 100;
  const xpPct = clamp(((xp - currentLevelFloor) / Math.max(1, nextLevelFloor - currentLevelFloor)) * 100);
  return {
    level,
    xp,
    xpToNextLevel: Math.max(0, nextLevelFloor - xp),
    xpPct,
  };
}

function statusProgress(status: MissionStatus): number {
  if (status === "DONE") return 100;
  if (status === "IN_PROGRESS") return 55;
  if (status === "WARNING") return 45;
  if (status === "DATA_GAP") return 25;
  if (status === "NOT_APPROVED") return 15;
  if (status === "BLOCKED") return 10;
  return 0;
}

function mission(
  id: string,
  category: MissionCategory,
  title: string,
  detail: string,
  status: MissionStatus,
  progressPct = statusProgress(status),
): Mission {
  return { id, category, title, detail, status, progressPct };
}

function badge(name: string, tone: AgentBadge["tone"], description: string): AgentBadge {
  return { name, tone, description };
}

function commonSafetyMissions(vm: TradingAgentHQViewModel): Mission[] {
  const safeFlags =
    !vm.safety.liveTradingEnabled &&
    !vm.safety.orderPlacementEnabled &&
    !vm.safety.productionTradingReady &&
    vm.safety.exchangeManualApproval === "not_approved";

  return [
    mission(
      "safety-lock",
      "Daily Safety",
      "Keep safety lock active",
      "Live OFF, orders OFF, production not ready, approval not_approved.",
      safeFlags ? "DONE" : "FAIL",
    ),
    mission(
      "m0b-block",
      "Operator Review",
      "Keep M-0B blocked until evidence passes",
      "READY_FOR_REVIEW is not approval; approval is not live trading.",
      vm.safety.phase.includes("BLOCKED") ? "BLOCKED" : "WARNING",
    ),
  ];
}

function commonBlockedReasons(vm: TradingAgentHQViewModel): string[] {
  const reasons: string[] = [];
  if (vm.paper.closedCycles === 0) reasons.push("closedCycles=0: DATA_GAP, no edge XP");
  if (vm.paper.sampleStatus !== "SUFFICIENT") reasons.push("sample size insufficient for expectancy");
  if (vm.safety.exchangeManualApproval !== "approved") reasons.push("EXCHANGE_MANUAL_APPROVAL not approved");
  if (vm.safety.phase.includes("BLOCKED")) reasons.push("Phase M-0B remains BLOCKED");
  if (vm.meta.isStale) reasons.push("source/freshness is stale");
  return reasons;
}

function dataQualityMissions(vm: TradingAgentHQViewModel): Mission[] {
  const hasPublicSafeSource = vm.meta.source === "public-safe-api";
  const hasFills = vm.paper.totalOrderFilled > 0;
  return [
    mission(
      "source-freshness",
      "Data Quality",
      "Use public-safe API source",
      "Progression reads the frontend ViewModel only; runtime JSON remains authoritative outside the UI.",
      hasPublicSafeSource && !vm.meta.isStale ? "DONE" : hasPublicSafeSource ? "WARNING" : "DATA_GAP",
      hasPublicSafeSource ? (vm.meta.isStale ? 60 : 100) : 20,
    ),
    mission(
      "fill-evidence",
      "Paper Evidence",
      "Collect paper fills with averageFillPrice",
      "Fill evidence XP is not profit XP and does not imply edge.",
      hasFills ? "DONE" : "DATA_GAP",
      hasFills ? 100 : 20,
    ),
    mission(
      "closed-cycle",
      "Paper Evidence",
      "Collect first closed cycle",
      "Closed cycles are required before expectancy or edge review.",
      vm.paper.closedCycles > 0 ? "DONE" : "DATA_GAP",
      vm.paper.closedCycles > 0 ? 100 : 10,
    ),
  ];
}

function safetyXp(vm: TradingAgentHQViewModel): number {
  if (vm.safety.liveTradingEnabled || vm.safety.orderPlacementEnabled || vm.safety.productionTradingReady) return 0;
  return vm.safety.exchangeManualApproval === "not_approved" ? 120 : 70;
}

function evidenceQuality(vm: TradingAgentHQViewModel): EvidenceQuality {
  if (vm.meta.isStale) return "stale";
  if (vm.paper.closedCycles === 0) return vm.paper.totalOrderFilled > 0 ? "partial" : "data_gap";
  if (vm.paper.sampleStatus === "SUFFICIENT") return "strong";
  return "partial";
}

function moodFor(vm: TradingAgentHQViewModel, agentId: AgentId): ProgressionMood {
  if (vm.meta.isStale) return "warning";
  if (agentId === "risk_manager") return "calm";
  if (vm.paper.closedCycles === 0) return "blocked";
  if (vm.paper.totalOrderFilled > 0) return "focused";
  return "unknown";
}

function makeProgression(
  vm: TradingAgentHQViewModel,
  agentId: AgentId,
  baseXp: number,
  missions: Mission[],
  skills: AgentSkill[],
  badges: AgentBadge[],
): AgentProgression {
  const blockedReasons = commonBlockedReasons(vm);
  const safetyState: SafetyState =
    vm.safety.liveTradingEnabled || vm.safety.orderPlacementEnabled || vm.safety.productionTradingReady ? "warning"
    : vm.safety.phase.includes("BLOCKED") ? "blocked"
    : "safe";
  const levels = levelFromXp(baseXp);
  const quality = evidenceQuality(vm);

  return {
    agentId,
    ...AGENT_COPY[agentId],
    ...levels,
    missions,
    skills,
    badges,
    mood: moodFor(vm, agentId),
    status: vm.safety.phase.includes("BLOCKED")
      ? vm.paper.closedCycles === 0 ? "data_gap" : "blocked"
      : vm.paper.totalOrderFilled > 0 ? "active" : "watching",
    evidenceQuality: quality,
    safetyState,
    blockedReasons,
    lastUpdated: vm.meta.lastUpdate,
  };
}

export function buildAgentProgressions(vm: TradingAgentHQViewModel): Record<AgentId, AgentProgression> {
  const safeXp = safetyXp(vm);
  const costXp = vm.paper.costGateStatus === "PASS" ? 80 : vm.paper.costGateStatus === "UNKNOWN" ? 0 : 20;
  const fillXp = vm.paper.totalOrderFilled > 0 ? 70 : 0;
  const closedCycleXp = vm.paper.closedCycles > 0 ? Math.min(220, vm.paper.closedCycles * 24) : 0;
  const sourceXp = vm.meta.source === "public-safe-api" && !vm.meta.isStale ? 50 : 10;
  const safetyMissions = commonSafetyMissions(vm);
  const dataMissions = dataQualityMissions(vm);
  const commonBadges = [
    ...(safeXp > 0 ? [badge("Safety Lock Active", "safe", "Live/order/production flags remain OFF.")] : []),
    ...(vm.paper.closedCycles === 0 ? [badge("Data Gap Watcher", "warning", "Closed-cycle evidence is not available yet.")] : []),
  ];

  const gridMissions = [
    mission(
      "cost-discipline",
      "Paper Evidence",
      "Maintain cost gate discipline",
      "Cost PASS is cost discipline only; Cost PASS does not mean edge PASS.",
      vm.paper.costGateStatus === "PASS" ? "DONE" : vm.paper.costGateStatus === "UNKNOWN" ? "DATA_GAP" : "WARNING",
    ),
    ...dataMissions,
  ];

  const progressions: Record<AgentId, AgentProgression> = {
    grid_bot: makeProgression(
      vm,
      "grid_bot",
      100 + costXp + fillXp + closedCycleXp + sourceXp,
      gridMissions,
      [
        { name: "Grid Spacing Awareness", state: vm.paper.costGateStatus === "PASS" ? "online" : "watching" },
        { name: "Fill Quality Tracking", state: vm.paper.totalOrderFilled > 0 ? "online" : "data_gap" },
        { name: "Closed Cycle Pairing", state: vm.paper.closedCycles > 0 ? "online" : "data_gap" },
        { name: "Cost Gate Discipline", state: vm.paper.costGateStatus === "PASS" ? "online" : "watching" },
      ],
      [
        ...(vm.paper.costGateStatus === "PASS" ? [badge("Cost Gate Keeper", "safe", "Cost discipline is passing; this is not edge evidence.")] : []),
        ...(vm.paper.totalOrderFilled > 0 ? [badge("Fill Evidence Started", "info", "Paper fills are accumulating with fill evidence.")] : []),
        ...commonBadges,
      ],
    ),
    trend_bot: makeProgression(
      vm,
      "trend_bot",
      80 + sourceXp + (vm.paper.closedCycles > 0 ? 30 : 0),
      [
        mission("trend-patience", "Data Quality", "Wait for validated opportunity context", "Trend context is read-only and cannot trigger orders here.", "IN_PROGRESS"),
        mission("no-false-edge", "Visual QA", "Avoid false edge claims", "Closed cycles and sample size gate must pass before expectancy claims.", vm.paper.closedCycles === 0 ? "DATA_GAP" : "IN_PROGRESS"),
        ...safetyMissions,
      ],
      [
        { name: "Momentum Scan", state: "watching" },
        { name: "Regime Confirmation", state: "watching" },
        { name: "Signal Patience", state: "online" },
        { name: "False Breakout Awareness", state: "watching" },
      ],
      [badge("Signal Patience", "info", "No trading action is unlocked by visual momentum state."), ...commonBadges],
    ),
    risk_manager: makeProgression(
      vm,
      "risk_manager",
      160 + safeXp + sourceXp,
      [
        ...safetyMissions,
        mission("operator-approval", "Operator Review", "Keep approval manual", "Approval stays not_approved until all gates pass and operator approves.", "NOT_APPROVED"),
        mission("visual-safety-copy", "Visual QA", "Keep safety copy visible", "XP does not control trading; M-0B remains BLOCKED.", "DONE"),
      ],
      [
        { name: "Kill Switch Awareness", state: "online" },
        { name: "Approval Discipline", state: "online" },
        { name: "Drawdown Guard", state: "watching" },
        { name: "Safety Gate Integrity", state: "online" },
      ],
      [badge("Safety Steward", "safe", "Safety flags remain locked down."), badge("No False Ready Claim", "safe", "UI does not claim live or production readiness."), ...commonBadges],
    ),
    news_analyst: makeProgression(
      vm,
      "news_analyst",
      70 + sourceXp,
      [
        mission("event-risk", "Data Quality", "Track event-risk context", "News/event context is displayed only when public-safe evidence exposes it.", "IN_PROGRESS"),
        mission("no-trade-reason", "Data Quality", "Preserve no-trade reasons", "Missing context remains DATA_GAP instead of fake healthy PASS.", "DATA_GAP"),
        ...safetyMissions,
      ],
      [
        { name: "Event Risk Detection", state: "watching" },
        { name: "News Context Coverage", state: "data_gap" },
        { name: "No-Trade Reason Logging", state: "watching" },
        { name: "Sentiment Awareness", state: "watching" },
      ],
      [badge("No False News Claim", "info", "Missing news context is not treated as healthy PASS."), ...commonBadges],
    ),
    market_regime: makeProgression(
      vm,
      "market_regime",
      90 + sourceXp + (vm.paper.costGateStatus === "PASS" ? 20 : 0),
      [
        mission("regime-context", "Data Quality", "Read regime context safely", "Regime visualization is read-only and never sends orders.", "IN_PROGRESS"),
        mission("session-tags", "Data Quality", "Collect mode/regime/session tags", "Tags increase data-quality maturity only when present in safe evidence.", "DATA_GAP"),
        ...safetyMissions,
      ],
      [
        { name: "Range Detection", state: "watching" },
        { name: "Trend Detection", state: "watching" },
        { name: "Volatility State", state: "watching" },
        { name: "Session Context", state: "data_gap" },
      ],
      [badge("Grid Context Online", "info", "Cost and grid context are visible, not authoritative trading approval."), ...commonBadges],
    ),
    memory_brain: makeProgression(
      vm,
      "memory_brain",
      110 + fillXp + sourceXp + (vm.paper.closedCycles > 0 ? 60 : 0),
      [
        mission("journal-evidence", "Paper Evidence", "Keep journal evidence readable", "Paper events are evidence, not live PnL.", vm.paper.totalOrderFilled > 0 ? "DONE" : "DATA_GAP"),
        mission("closed-cycle-memory", "Paper Evidence", "Record closed-cycle evidence", "closedCycles=0 remains DATA_GAP until a real cycle exists.", vm.paper.closedCycles > 0 ? "DONE" : "DATA_GAP"),
        ...safetyMissions,
      ],
      [
        { name: "Journal Completeness", state: vm.paper.totalOrderFilled > 0 ? "online" : "data_gap" },
        { name: "Evidence Recall", state: "watching" },
        { name: "Lessons Learned", state: vm.paper.closedCycles > 0 ? "online" : "locked" },
        { name: "Attribution Coverage", state: "watching" },
      ],
      [
        ...(vm.paper.totalOrderFilled > 0 ? [badge("Evidence Ledger Online", "info", "Recent paper evidence is visible to the UI.")] : []),
        ...commonBadges,
      ],
    ),
  };

  return progressions;
}

export function listAgentProgressions(progressions: Record<AgentId, AgentProgression>): AgentProgression[] {
  return ORDER.map((id) => progressions[id]);
}

export function listActiveMissions(progressions: Record<AgentId, AgentProgression>): Mission[] {
  const byId = new Map<string, Mission>();
  listAgentProgressions(progressions).forEach((progression) => {
    progression.missions.forEach((item) => {
      if (!byId.has(item.id)) byId.set(item.id, item);
    });
  });
  const priority: Record<MissionStatus, number> = {
    FAIL: 0,
    BLOCKED: 1,
    NOT_APPROVED: 2,
    DATA_GAP: 3,
    WARNING: 4,
    IN_PROGRESS: 5,
    DONE: 6,
  };
  return [...byId.values()].sort((a, b) => priority[a.status] - priority[b.status]).slice(0, 5);
}
