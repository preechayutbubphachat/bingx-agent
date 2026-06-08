// dashboard/lib/trend/trendPaperArmSession.ts
// Phase T-3B — Paper Arm Session: time-boxed, entry-capped operator approval for trend paper execution.
// Pure model + validator + read-only loader. NO live, NO exchange, NO real order, NO grid order.
// Hard invariants on every path: paperOnly=true, liveActivationAllowed=false, exchangeOrderAllowed=false,
// oldExposurePolicy=QUARANTINE_OLD_GRID_EXPOSURE. Session creation/persistence is manual/future (not here).

import * as fs from "fs/promises";
import * as path from "path";

export const TREND_PAPER_ARM_SESSION_SCHEMA_VERSION = "trend-paper-arm-session/1";
export const TREND_PAPER_ARM_SESSION_FILE_NAME = "trend_paper_arm_session.json";

export type TrendPaperArmSessionStatus =
  | "INACTIVE"
  | "ACTIVE"
  | "EXPIRED"
  | "REVOKED"
  | "LIMIT_REACHED";

export type TrendPaperArmSessionDirection = "LONG" | "SHORT" | "ANY";

export interface TrendPaperArmSession {
  schemaVersion: string;
  sessionId: string;
  status: TrendPaperArmSessionStatus;
  symbol: string;
  direction: TrendPaperArmSessionDirection;
  startedAt: string;
  expiresAt: string;
  maxEntries: number;
  usedEntries: number;
  maxRiskPerTradePct: number;
  maxSessionRiskPct: number;
  approvedBy: "OPERATOR";
  /** T-3C: true = operator manually approved paper-only arm for THIS session. NOT live, NOT exchange, NOT M-0B. */
  paperArmIntentRequested?: boolean;
  paperOnly: true;
  liveActivationAllowed: false;
  exchangeOrderAllowed: false;
  oldExposurePolicy: "QUARANTINE_OLD_GRID_EXPOSURE";
  notes?: string[];
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

const MAX_SANE_RISK_PER_TRADE_PCT = 5;
const MAX_SANE_SESSION_RISK_PCT = 20;
const MAX_SANE_ENTRIES = 50;

function finite(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function parseTs(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim()) {
    const p = Date.parse(v);
    return Number.isFinite(p) ? p : null;
  }
  return null;
}

/** Pure structural + safety-invariant validation. Does not consult the clock. */
export function validateTrendPaperArmSession(session: unknown): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const s = (session && typeof session === "object" ? session : {}) as Partial<TrendPaperArmSession>;

  if (s.schemaVersion !== TREND_PAPER_ARM_SESSION_SCHEMA_VERSION) {
    warnings.push(`schemaVersion mismatch (expected ${TREND_PAPER_ARM_SESSION_SCHEMA_VERSION})`);
  }
  if (typeof s.sessionId !== "string" || !s.sessionId.trim()) errors.push("sessionId missing");

  const validStatus: TrendPaperArmSessionStatus[] = ["INACTIVE", "ACTIVE", "EXPIRED", "REVOKED", "LIMIT_REACHED"];
  if (!validStatus.includes(s.status as TrendPaperArmSessionStatus)) errors.push("invalid status");

  const validDir: TrendPaperArmSessionDirection[] = ["LONG", "SHORT", "ANY"];
  if (!validDir.includes(s.direction as TrendPaperArmSessionDirection)) errors.push("invalid direction");

  const started = parseTs(s.startedAt);
  const expires = parseTs(s.expiresAt);
  if (started == null) errors.push("invalid startedAt");
  if (expires == null) errors.push("invalid expiresAt");
  if (started != null && expires != null && !(expires > started)) errors.push("expiresAt must be after startedAt");

  if (!finite(s.maxEntries) || s.maxEntries < 1) errors.push("maxEntries must be >= 1");
  else if (s.maxEntries > MAX_SANE_ENTRIES) warnings.push("maxEntries unusually high");
  if (!finite(s.usedEntries) || s.usedEntries < 0) errors.push("usedEntries must be >= 0");
  if (finite(s.maxEntries) && finite(s.usedEntries) && s.usedEntries > s.maxEntries) {
    errors.push("usedEntries must be <= maxEntries");
  }

  if (!finite(s.maxRiskPerTradePct) || s.maxRiskPerTradePct <= 0 || s.maxRiskPerTradePct > MAX_SANE_RISK_PER_TRADE_PCT) {
    errors.push(`maxRiskPerTradePct out of sane range (0, ${MAX_SANE_RISK_PER_TRADE_PCT}]`);
  }
  if (!finite(s.maxSessionRiskPct) || s.maxSessionRiskPct <= 0 || s.maxSessionRiskPct > MAX_SANE_SESSION_RISK_PCT) {
    errors.push(`maxSessionRiskPct out of sane range (0, ${MAX_SANE_SESSION_RISK_PCT}]`);
  }
  if (
    finite(s.maxRiskPerTradePct) && finite(s.maxSessionRiskPct) &&
    s.maxRiskPerTradePct > s.maxSessionRiskPct
  ) {
    warnings.push("maxRiskPerTradePct exceeds maxSessionRiskPct");
  }

  if (s.approvedBy !== "OPERATOR") errors.push("approvedBy must be OPERATOR");
  if (s.paperArmIntentRequested !== undefined && typeof s.paperArmIntentRequested !== "boolean") {
    errors.push("paperArmIntentRequested must be boolean when present");
  }

  // Hard safety invariants — must be exactly these values
  if (s.paperOnly !== true) errors.push("paperOnly must be true");
  if (s.liveActivationAllowed !== false) errors.push("liveActivationAllowed must be false");
  if (s.exchangeOrderAllowed !== false) errors.push("exchangeOrderAllowed must be false");
  if (s.oldExposurePolicy !== "QUARANTINE_OLD_GRID_EXPOSURE") errors.push("oldExposurePolicy must be QUARANTINE_OLD_GRID_EXPOSURE");

  return { valid: errors.length === 0, errors, warnings };
}

/** Pure liveness check at a given instant. ACTIVE only: valid + status ACTIVE + not expired + entries remaining. */
export function isTrendPaperArmSessionActive(
  session: TrendPaperArmSession | null | undefined,
  now: number | string | Date,
): boolean {
  if (!session) return false;
  if (!validateTrendPaperArmSession(session).valid) return false;
  if (session.status !== "ACTIVE") return false;
  const nowMs = parseTs(now instanceof Date ? now.toISOString() : now);
  const expires = parseTs(session.expiresAt);
  if (nowMs == null || expires == null) return false;
  if (nowMs >= expires) return false;
  if (session.usedEntries >= session.maxEntries) return false;
  return true;
}

/** Effective status given the clock — derives EXPIRED / LIMIT_REACHED without mutating input. */
export function deriveTrendPaperArmSessionStatus(
  session: TrendPaperArmSession | null | undefined,
  now: number | string | Date,
): TrendPaperArmSessionStatus | "MISSING" {
  if (!session) return "MISSING";
  if (session.status === "REVOKED") return "REVOKED";
  if (session.status === "INACTIVE") return "INACTIVE";
  const nowMs = parseTs(now instanceof Date ? now.toISOString() : now);
  const expires = parseTs(session.expiresAt);
  if (nowMs != null && expires != null && nowMs >= expires) return "EXPIRED";
  if (finite(session.usedEntries) && finite(session.maxEntries) && session.usedEntries >= session.maxEntries) {
    return "LIMIT_REACHED";
  }
  return session.status;
}

/** Pure entry consumption — returns a NEW session with usedEntries+1, flipping to LIMIT_REACHED when exhausted. */
export function consumeTrendPaperArmSessionEntry(session: TrendPaperArmSession): TrendPaperArmSession {
  const usedEntries = Math.min(session.maxEntries, (finite(session.usedEntries) ? session.usedEntries : 0) + 1);
  const status: TrendPaperArmSessionStatus = usedEntries >= session.maxEntries ? "LIMIT_REACHED" : session.status;
  return { ...session, usedEntries, status };
}

// ---- read-only loader (no writer; session creation/persistence is manual/future) ----

export function resolveTrendPaperArmSessionPath(rootDir?: string | null): string {
  const baseDir = rootDir ? path.resolve(rootDir) : path.resolve(process.cwd(), "tmp");
  return path.resolve(baseDir, "trend-paper", TREND_PAPER_ARM_SESSION_FILE_NAME);
}

export interface TrendPaperArmSessionSnapshot {
  path: string;
  exists: boolean;
  session: TrendPaperArmSession | null;
  validation: ValidationResult | null;
}

export interface TrendPaperArmSessionView {
  present: boolean;
  status: TrendPaperArmSessionStatus | "MISSING";
  sessionId: string | null;
  direction: TrendPaperArmSessionDirection | null;
  symbol: string | null;
  startedAt: string | null;
  expiresAt: string | null;
  timeRemainingMs: number | null;
  maxEntries: number | null;
  usedEntries: number | null;
  remainingEntries: number | null;
  maxRiskPerTradePct: number | null;
  maxSessionRiskPct: number | null;
  active: boolean;
  paperOnly: true;
  liveActivationAllowed: false;
  exchangeOrderAllowed: false;
}

/** Read-only UI view of the session at a given instant. Never mutates; flags hard-locked. */
export function summarizeTrendPaperArmSession(
  session: TrendPaperArmSession | null | undefined,
  now: number | string | Date,
): TrendPaperArmSessionView {
  const base = {
    paperOnly: true as const,
    liveActivationAllowed: false as const,
    exchangeOrderAllowed: false as const,
  };
  if (!session) {
    return {
      present: false, status: "MISSING", sessionId: null, direction: null, symbol: null,
      startedAt: null, expiresAt: null, timeRemainingMs: null, maxEntries: null, usedEntries: null,
      remainingEntries: null, maxRiskPerTradePct: null, maxSessionRiskPct: null, active: false, ...base,
    };
  }
  const nowMs = parseTs(now instanceof Date ? now.toISOString() : now);
  const expires = parseTs(session.expiresAt);
  const timeRemainingMs = nowMs != null && expires != null ? Math.max(0, expires - nowMs) : null;
  const remainingEntries = finite(session.maxEntries) && finite(session.usedEntries)
    ? Math.max(0, session.maxEntries - session.usedEntries) : null;
  return {
    present: true,
    status: deriveTrendPaperArmSessionStatus(session, now),
    sessionId: session.sessionId ?? null,
    direction: session.direction ?? null,
    symbol: session.symbol ?? null,
    startedAt: session.startedAt ?? null,
    expiresAt: session.expiresAt ?? null,
    timeRemainingMs,
    maxEntries: finite(session.maxEntries) ? session.maxEntries : null,
    usedEntries: finite(session.usedEntries) ? session.usedEntries : null,
    remainingEntries,
    maxRiskPerTradePct: finite(session.maxRiskPerTradePct) ? session.maxRiskPerTradePct : null,
    maxSessionRiskPct: finite(session.maxSessionRiskPct) ? session.maxSessionRiskPct : null,
    active: isTrendPaperArmSessionActive(session, now),
    ...base,
  };
}

/** Read-only load of the session file. Returns null session when missing/invalid JSON. NEVER writes. */
export async function readTrendPaperArmSession(
  options: { filePath?: string | null } = {},
): Promise<TrendPaperArmSessionSnapshot> {
  const filePath = options.filePath ? path.resolve(options.filePath) : resolveTrendPaperArmSessionPath();
  let raw = "";
  try {
    raw = await fs.readFile(filePath, "utf8");
  } catch {
    return { path: filePath, exists: false, session: null, validation: null };
  }
  try {
    const parsed = JSON.parse(raw) as TrendPaperArmSession;
    return { path: filePath, exists: true, session: parsed, validation: validateTrendPaperArmSession(parsed) };
  } catch {
    return { path: filePath, exists: true, session: null, validation: { valid: false, errors: ["invalid json"], warnings: [] } };
  }
}
