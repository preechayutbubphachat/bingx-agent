// dashboard/lib/trend/trendPaperEvidenceState.ts
// Phase T-3H-4-a — Evidence runner STATE (schema + validator + path-locked atomic read/write + daily reset).
// Paper-only. NEVER live, NEVER exchange. Runtime file under dashboard/tmp/trend-paper (gitignored, never committed).

import * as fs from "fs/promises";
import * as path from "path";
import type { TrendEvidenceSampleStatus } from "./trendEvidenceMetrics.ts";

export const TREND_PAPER_EVIDENCE_STATE_SCHEMA_VERSION = "trend-paper-evidence-state/1";
export const TREND_PAPER_EVIDENCE_STATE_FILE_NAME = "trend_paper_evidence_state.json";
const EVIDENCE_DIR = "trend-paper";
const STATE_PATH_SUFFIX = `/${EVIDENCE_DIR}/${TREND_PAPER_EVIDENCE_STATE_FILE_NAME}`;

export type EvidencePhase =
  | "DISABLED"
  | "SAFETY_BLOCKED"
  | "EVIDENCE_COLLECTION"
  | "REVIEW_READY";

export type EvidenceDecision =
  | "DISABLED"
  | "SAFETY_BLOCKED"
  | "EXIT_DRIVE"
  | "REVIEW_READY"
  | "BUDGET_BLOCKED"
  | "WAIT_NEXT_BAR"
  | "WAITING_SETUP"
  | "NO_ACTION_AFTER_ARM"
  | "PAPER_ENTRY_CREATED"
  | null;

export interface EvidenceOpenPosition {
  positionId: string;
  direction: "LONG" | "SHORT";
  entryPrice: number;
  openedAt: string;
}

export interface TrendPaperEvidenceState {
  schemaVersion: string;
  evidencePhase: EvidencePhase;
  enabled: boolean;
  paperOnly: true;
  liveActivationAllowed: false;
  exchangeOrderAllowed: false;
  oldExposurePolicy: "QUARANTINE_OLD_GRID_EXPOSURE";
  lastRunAt: string | null;
  lastCheckedBar: string | null;
  lastGateStatus: string | null;
  lastDecision: EvidenceDecision;
  lastRejectReasons: string[];
  dailyDate: string | null; // YYYY-MM-DD (UTC) for daily reset
  dailyEntryCount: number;
  dailyLossR: number;
  maxEntriesPerDay: number;
  maxOpenPositions: number;
  maxDailyLossR: number;
  maxConsecutiveLosses: number;
  cooldownMinutes: number;
  cooldownUntil: string | null;
  openTrendPosition: EvidenceOpenPosition | null;
  trendClosedTrades: number;
  targetClosedTrades: number;
  sampleStatus: TrendEvidenceSampleStatus;
  winRate: number | null;
  expectancyR: number | null;
  profitFactor: number | null;
  maxDrawdownR: number | null;
  maxConsecutiveLossesObserved: number | null;
  readyForNextPhase: boolean;
  stopReason: string | null;
  updatedAt: string | null;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export function defaultTrendPaperEvidenceState(): TrendPaperEvidenceState {
  return {
    schemaVersion: TREND_PAPER_EVIDENCE_STATE_SCHEMA_VERSION,
    evidencePhase: "DISABLED",
    enabled: false,
    paperOnly: true,
    liveActivationAllowed: false,
    exchangeOrderAllowed: false,
    oldExposurePolicy: "QUARANTINE_OLD_GRID_EXPOSURE",
    lastRunAt: null,
    lastCheckedBar: null,
    lastGateStatus: null,
    lastDecision: null,
    lastRejectReasons: [],
    dailyDate: null,
    dailyEntryCount: 0,
    dailyLossR: 0,
    maxEntriesPerDay: 3,
    maxOpenPositions: 1,
    maxDailyLossR: 3,
    maxConsecutiveLosses: 3,
    cooldownMinutes: 60,
    cooldownUntil: null,
    openTrendPosition: null,
    trendClosedTrades: 0,
    targetClosedTrades: 30,
    sampleStatus: "INSUFFICIENT_SAMPLE_BOOTSTRAP",
    winRate: null,
    expectancyR: null,
    profitFactor: null,
    maxDrawdownR: null,
    maxConsecutiveLossesObserved: null,
    readyForNextPhase: false,
    stopReason: null,
    updatedAt: null,
  };
}

function finite(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/** Pure validation — hard safety invariants must hold; never write a state that fails this. */
export function validateTrendPaperEvidenceState(state: unknown): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const s = (state && typeof state === "object" ? state : {}) as Partial<TrendPaperEvidenceState>;

  if (s.schemaVersion !== TREND_PAPER_EVIDENCE_STATE_SCHEMA_VERSION) {
    warnings.push(`schema_version_mismatch:${String(s.schemaVersion)}`);
  }
  // hard invariants
  if (s.paperOnly !== true) errors.push("paper_only_must_be_true");
  if (s.liveActivationAllowed !== false) errors.push("live_activation_allowed_must_be_false");
  if (s.exchangeOrderAllowed !== false) errors.push("exchange_order_allowed_must_be_false");
  if (s.oldExposurePolicy !== "QUARANTINE_OLD_GRID_EXPOSURE") errors.push("old_exposure_policy_must_be_quarantine");
  // numeric sanity
  if (!finite(s.maxEntriesPerDay) || s.maxEntriesPerDay < 0) errors.push("invalid_maxEntriesPerDay");
  if (!finite(s.maxOpenPositions) || s.maxOpenPositions < 0) errors.push("invalid_maxOpenPositions");
  if (!finite(s.targetClosedTrades) || s.targetClosedTrades < 1) errors.push("invalid_targetClosedTrades");
  if (!finite(s.dailyEntryCount) || s.dailyEntryCount < 0) errors.push("invalid_dailyEntryCount");

  return { valid: errors.length === 0, errors, warnings };
}

/** UTC YYYY-MM-DD for daily-reset bucketing. */
export function utcDateKey(now: number | string | Date): string {
  const d = now instanceof Date ? now : new Date(now);
  return d.toISOString().slice(0, 10);
}

/** Reset per-day counters when the UTC day rolls over. Returns a NEW state (no mutation). */
export function applyDailyReset(state: TrendPaperEvidenceState, now: number | string | Date): TrendPaperEvidenceState {
  const today = utcDateKey(now);
  if (state.dailyDate === today) return state;
  return { ...state, dailyDate: today, dailyEntryCount: 0, dailyLossR: 0 };
}

// ---- path-locked atomic read/write ----

export function resolveTrendPaperEvidenceStatePath(rootDir?: string | null): string {
  const baseDir = rootDir ? path.resolve(rootDir) : path.resolve(process.cwd(), "tmp");
  return path.resolve(baseDir, EVIDENCE_DIR, TREND_PAPER_EVIDENCE_STATE_FILE_NAME);
}

function resolveLockedPath(filePath?: string | null): string {
  const p = filePath ? path.resolve(filePath) : resolveTrendPaperEvidenceStatePath();
  if (!p.replace(/\\/g, "/").endsWith(STATE_PATH_SUFFIX)) {
    throw new Error("trend_paper_evidence_state_path_not_allowed");
  }
  return p;
}

export async function readTrendPaperEvidenceState(
  options: { filePath?: string | null } = {},
): Promise<{ path: string; exists: boolean; state: TrendPaperEvidenceState; validation: ValidationResult | null }> {
  const filePath = resolveLockedPath(options.filePath);
  let raw = "";
  try {
    raw = await fs.readFile(filePath, "utf8");
  } catch {
    return { path: filePath, exists: false, state: defaultTrendPaperEvidenceState(), validation: null };
  }
  try {
    const parsed = JSON.parse(raw) as TrendPaperEvidenceState;
    return { path: filePath, exists: true, state: parsed, validation: validateTrendPaperEvidenceState(parsed) };
  } catch {
    return { path: filePath, exists: true, state: defaultTrendPaperEvidenceState(), validation: { valid: false, errors: ["invalid json"], warnings: [] } };
  }
}

/** Validate-before-write + atomic (tmp + rename). Path-locked. Never writes outside /trend-paper. */
export async function writeTrendPaperEvidenceState(
  state: TrendPaperEvidenceState,
  options: { filePath?: string | null; now?: number } = {},
): Promise<{ ok: true; path: string; validation: ValidationResult }> {
  const filePath = resolveLockedPath(options.filePath);
  const stamped: TrendPaperEvidenceState = {
    ...state,
    paperOnly: true,
    liveActivationAllowed: false,
    exchangeOrderAllowed: false,
    oldExposurePolicy: "QUARANTINE_OLD_GRID_EXPOSURE",
    updatedAt: new Date(typeof options.now === "number" ? options.now : Date.now()).toISOString(),
  };
  const validation = validateTrendPaperEvidenceState(stamped);
  if (!validation.valid) {
    throw new Error(`trend_paper_evidence_state_validation_failed:${validation.errors.join(",")}`);
  }
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  await fs.writeFile(tmp, `${JSON.stringify(stamped, null, 2)}\n`, "utf8");
  await fs.rename(tmp, filePath);
  return { ok: true, path: filePath, validation };
}
