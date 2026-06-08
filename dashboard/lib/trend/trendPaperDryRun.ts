// dashboard/lib/trend/trendPaperDryRun.ts
// Phase T-3G — Operator Dry Run Console: pure helpers for the controlled paper-only dry-run actions.
// Pure (no I/O). The route layer adds auth + real I/O. ALL session-shaping invariants are forced here.
// NEVER live, NEVER exchange, NEVER M-0B. maxEntries forced to 1, expiry capped to 30 minutes.

import type { TrendPaperArmSession, TrendPaperArmSessionDirection } from "./trendPaperArmSession.ts";

export const TREND_PAPER_DRY_RUN_MAX_EXPIRY_MINUTES = 30;
export const TREND_PAPER_DRY_RUN_DEFAULT_EXPIRY_MINUTES = 20;

export type TrendPaperDryRunAction =
  | "baseline_check"
  | "create_session"
  | "verify_session"
  | "one_shot_run"
  | "cleanup";

export const TREND_PAPER_DRY_RUN_ACTIONS: readonly TrendPaperDryRunAction[] = [
  "baseline_check",
  "create_session",
  "verify_session",
  "one_shot_run",
  "cleanup",
];

export function isTrendPaperDryRunAction(value: unknown): value is TrendPaperDryRunAction {
  return typeof value === "string" && (TREND_PAPER_DRY_RUN_ACTIONS as readonly string[]).includes(value);
}

function clampExpiryMinutes(raw: unknown): number {
  const n = typeof raw === "number" && Number.isFinite(raw) ? raw : TREND_PAPER_DRY_RUN_DEFAULT_EXPIRY_MINUTES;
  // floor at 1 minute, hard cap at 30 minutes
  return Math.max(1, Math.min(TREND_PAPER_DRY_RUN_MAX_EXPIRY_MINUTES, Math.floor(n)));
}

function normalizeDirection(raw: unknown): TrendPaperArmSessionDirection {
  return raw === "LONG" || raw === "SHORT" || raw === "ANY" ? raw : "SHORT";
}

function toMs(now: number | string | Date): number {
  if (now instanceof Date) return now.getTime();
  if (typeof now === "number" && Number.isFinite(now)) return now;
  const p = Date.parse(String(now));
  return Number.isFinite(p) ? p : Date.now();
}

export interface BuildDryRunSessionInput {
  direction?: unknown;
  expiryMinutes?: unknown;
  now: number | string | Date;
  sessionId?: string;
  maxRiskPerTradePct?: number;
  maxSessionRiskPct?: number;
}

/**
 * Build a fully-forced paper-only dry-run session.
 * Hard-forced (caller input cannot override): maxEntries=1, usedEntries=0, paperArmIntentRequested=true,
 * paperOnly=true, liveActivationAllowed=false, exchangeOrderAllowed=false, oldExposurePolicy=QUARANTINE,
 * approvedBy=OPERATOR, status=ACTIVE, symbol=BTC-USDT, expiry capped to 30 minutes.
 */
export function buildDryRunSession(input: BuildDryRunSessionInput): TrendPaperArmSession {
  const startedMs = toMs(input.now);
  const expiryMinutes = clampExpiryMinutes(input.expiryMinutes);
  const expiresMs = startedMs + expiryMinutes * 60_000;
  const startedAt = new Date(startedMs).toISOString();
  const sessionId =
    typeof input.sessionId === "string" && input.sessionId.trim()
      ? input.sessionId.trim()
      : `dryrun-${startedAt.replace(/[-:.TZ]/g, "").slice(0, 12)}`;

  const maxRiskPerTradePct =
    typeof input.maxRiskPerTradePct === "number" && Number.isFinite(input.maxRiskPerTradePct) && input.maxRiskPerTradePct > 0
      ? Math.min(5, input.maxRiskPerTradePct)
      : 1;
  const maxSessionRiskPct =
    typeof input.maxSessionRiskPct === "number" && Number.isFinite(input.maxSessionRiskPct) && input.maxSessionRiskPct > 0
      ? Math.min(20, input.maxSessionRiskPct)
      : 1;

  return {
    schemaVersion: "trend-paper-arm-session/1",
    sessionId,
    status: "ACTIVE",
    symbol: "BTC-USDT",
    direction: normalizeDirection(input.direction),
    startedAt,
    expiresAt: new Date(expiresMs).toISOString(),
    maxEntries: 1, // forced
    usedEntries: 0, // forced
    maxRiskPerTradePct,
    maxSessionRiskPct,
    approvedBy: "OPERATOR",
    paperArmIntentRequested: true, // forced for create_session
    paperOnly: true, // forced
    liveActivationAllowed: false, // forced
    exchangeOrderAllowed: false, // forced
    oldExposurePolicy: "QUARANTINE_OLD_GRID_EXPOSURE", // forced
    notes: [`T-3G operator dry-run console (expiry ${expiryMinutes}m)`],
  };
}

/** Revoke (soft) — returns a NEW session with status REVOKED, never mutates input. Flags stay locked. */
export function revokeDryRunSession(session: TrendPaperArmSession): TrendPaperArmSession {
  return {
    ...session,
    status: "REVOKED",
    paperOnly: true,
    liveActivationAllowed: false,
    exchangeOrderAllowed: false,
    oldExposurePolicy: "QUARANTINE_OLD_GRID_EXPOSURE",
  };
}
