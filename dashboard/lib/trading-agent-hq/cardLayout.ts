// dashboard/lib/trading-agent-hq/cardLayout.ts
// Phase UI-1 — Agent HQ collapsible card layout registry + SSR-safe persistence.
// SAFETY: UI layout state ONLY. Never stores secrets, tokens, or sensitive payloads.
// Stores: per-card collapsed flags, lightweight lastSeen signatures, optional filter.

export type AgentHqCardId =
  | "systemStatus"
  | "dynamicRegridStatus"
  | "runtimeMonitor"
  | "regridPhase2AReadiness"
  | "canonicalMarketRegime"
  | "canonicalRegimeGate"
  | "regimeEvidence"
  | "indicatorGate"
  | "trendRegimeConfirmation"
  | "trendZoneCandidate"
  | "trendStrategyShadow"
  | "trendTransitionMonitor"
  | "trendManualPaperArmGate"
  | "trendPaperArmSession"
  | "trendPaperArmIntentBridge"
  | "trendPaperDryRunConsole"
  | "trendPaperEvidenceRunner"
  | "trendPaperExecutionPreflight"
  | "trendPaperExecutionEngine"
  | "trendEdgeReview"
  | "cafeFloor";

export interface AgentHqCardLayoutEntry {
  id: AgentHqCardId;
  title: string;
  /** default collapsed state on first load (ignored for pinned cards) */
  defaultCollapsed: boolean;
  /** pinned cards are ALWAYS visible and can never be collapsed (Cafe Floor) */
  pinned: boolean;
  /** UI-2.2: display icon (existing project icon set; presentation only) */
  icon?: string;
}

// Order here is documentation only; the page controls actual render order.
// Expanded-by-default = key/decision cards. Collapsed-by-default = context/debug/audit cards.
export const AGENT_HQ_CARD_LAYOUT: AgentHqCardLayoutEntry[] = [
  { id: "systemStatus", title: "สถานะระบบ (อ่านง่าย)", defaultCollapsed: false, pinned: false, icon: "🖥️" },
  { id: "dynamicRegridStatus", title: "Dynamic Regrid Status", defaultCollapsed: false, pinned: false, icon: "▦" },
  { id: "runtimeMonitor", title: "Runtime Monitor", defaultCollapsed: false, pinned: false, icon: "📡" },
  { id: "regridPhase2AReadiness", title: "Regrid Phase 2-A Readiness", defaultCollapsed: true, pinned: false, icon: "🎚️" },
  { id: "canonicalMarketRegime", title: "Market Regime (Canonical)", defaultCollapsed: true, pinned: false, icon: "🌤️" },
  { id: "canonicalRegimeGate", title: "Canonical Regime Gate", defaultCollapsed: true, pinned: false, icon: "🚦" },
  { id: "regimeEvidence", title: "Regime Evidence", defaultCollapsed: true, pinned: false, icon: "🔍" },
  { id: "indicatorGate", title: "Indicator Gate", defaultCollapsed: true, pinned: false, icon: "📐" },
  { id: "trendRegimeConfirmation", title: "Trend Regime Confirmation", defaultCollapsed: true, pinned: false, icon: "🧭" },
  { id: "trendZoneCandidate", title: "Trend Zone Candidate", defaultCollapsed: true, pinned: false, icon: "📍" },
  { id: "trendStrategyShadow", title: "Trend Strategy (Shadow)", defaultCollapsed: true, pinned: false, icon: "📈" },
  { id: "trendTransitionMonitor", title: "Trend Transition Monitor", defaultCollapsed: false, pinned: false, icon: "🔄" },
  { id: "trendManualPaperArmGate", title: "Trend Manual Paper Arm Gate", defaultCollapsed: true, pinned: false, icon: "🔐" },
  { id: "trendPaperArmSession", title: "Trend Paper Arm Session", defaultCollapsed: true, pinned: false, icon: "🕒" },
  { id: "trendPaperArmIntentBridge", title: "Trend Paper Arm Intent Bridge", defaultCollapsed: true, pinned: false, icon: "🌉" },
  { id: "trendPaperDryRunConsole", title: "Trend Paper Dry Run Console", defaultCollapsed: true, pinned: false, icon: "🧪" },
  { id: "trendPaperEvidenceRunner", title: "Trend Paper Evidence Runner", defaultCollapsed: false, pinned: false, icon: "🏃" },
  { id: "trendPaperExecutionPreflight", title: "Trend Paper Execution Preflight", defaultCollapsed: false, pinned: false, icon: "🛫" },
  { id: "trendPaperExecutionEngine", title: "Trend Paper Execution Engine", defaultCollapsed: true, pinned: false, icon: "⚙️" },
  { id: "trendEdgeReview", title: "Trend Edge Review", defaultCollapsed: true, pinned: false, icon: "🧾" },
  { id: "cafeFloor", title: "ห้องคาเฟ่ (Cafe Floor)", defaultCollapsed: false, pinned: true, icon: "☕" },
];

export const AGENT_HQ_LAYOUT_STORAGE_KEY = "agent-hq-card-layout:v1";

export type AgentHqViewFilter = "all" | "updated";

export interface AgentHqStoredLayout {
  version: 1;
  /** cardId -> collapsed flag */
  collapsed: Record<string, boolean>;
  /** cardId -> last seen signature (lightweight string, no secrets) */
  lastSeenSignatures: Record<string, string>;
  filter: AgentHqViewFilter;
}

const PINNED_IDS: Set<string> = new Set(
  AGENT_HQ_CARD_LAYOUT.filter((c) => c.pinned).map((c) => c.id),
);

export function isPinnedCard(id: string): boolean {
  return PINNED_IDS.has(id);
}

/** Default collapsed map derived from the registry. Pinned cards are never collapsed. */
export function defaultCollapsedMap(): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const c of AGENT_HQ_CARD_LAYOUT) {
    out[c.id] = c.pinned ? false : c.defaultCollapsed;
  }
  return out;
}

export function defaultStoredLayout(): AgentHqStoredLayout {
  return {
    version: 1,
    collapsed: defaultCollapsedMap(),
    lastSeenSignatures: {},
    filter: "all",
  };
}

/** Collapse all NON-pinned cards. Pinned cards stay visible (false). */
export function applyCollapseAll(collapsed: Record<string, boolean>): Record<string, boolean> {
  const out: Record<string, boolean> = { ...collapsed };
  for (const c of AGENT_HQ_CARD_LAYOUT) {
    out[c.id] = c.pinned ? false : true;
  }
  return out;
}

/** Expand all cards. */
export function applyExpandAll(collapsed: Record<string, boolean>): Record<string, boolean> {
  const out: Record<string, boolean> = { ...collapsed };
  for (const c of AGENT_HQ_CARD_LAYOUT) out[c.id] = false;
  return out;
}

/** Restore the registry defaults. */
export function applyResetLayout(): Record<string, boolean> {
  return defaultCollapsedMap();
}

/** Merge stored collapsed flags onto defaults so newly added cards still get a sane default. */
export function mergeCollapsedWithDefaults(
  stored: Record<string, boolean> | undefined | null,
): Record<string, boolean> {
  const base = defaultCollapsedMap();
  if (!stored) return base;
  for (const c of AGENT_HQ_CARD_LAYOUT) {
    if (c.pinned) {
      base[c.id] = false; // pinned can never be collapsed regardless of stored value
    } else if (typeof stored[c.id] === "boolean") {
      base[c.id] = stored[c.id];
    }
  }
  return base;
}

function sanitizeStored(raw: unknown): AgentHqStoredLayout {
  const fallback = defaultStoredLayout();
  if (!raw || typeof raw !== "object") return fallback;
  const obj = raw as Record<string, unknown>;
  const collapsed =
    obj.collapsed && typeof obj.collapsed === "object"
      ? (obj.collapsed as Record<string, boolean>)
      : {};
  const signatures =
    obj.lastSeenSignatures && typeof obj.lastSeenSignatures === "object"
      ? (obj.lastSeenSignatures as Record<string, string>)
      : {};
  const filter: AgentHqViewFilter = obj.filter === "updated" ? "updated" : "all";
  // Only keep string signature values (drop anything unexpected).
  const cleanSignatures: Record<string, string> = {};
  for (const [k, v] of Object.entries(signatures)) {
    if (typeof v === "string") cleanSignatures[k] = v;
  }
  return {
    version: 1,
    collapsed: mergeCollapsedWithDefaults(collapsed),
    lastSeenSignatures: cleanSignatures,
    filter,
  };
}

/** SSR-safe read. Returns null when no window / no stored state / parse failure. */
export function loadStoredLayout(): AgentHqStoredLayout | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(AGENT_HQ_LAYOUT_STORAGE_KEY);
    if (!raw) return null;
    return sanitizeStored(JSON.parse(raw));
  } catch {
    return null;
  }
}

/** SSR-safe write. No-op on server or when storage throws (quota / disabled). */
export function saveStoredLayout(state: AgentHqStoredLayout): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(AGENT_HQ_LAYOUT_STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore persistence failures — layout is non-critical UI state */
  }
}
