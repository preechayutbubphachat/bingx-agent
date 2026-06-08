// dashboard/app/api/internal/trend-paper-dry-run/route.ts
// Phase T-3G — Operator Dry Run Console (INTERNAL, auth-gated, paper-only).
// Actions: baseline_check | create_session | verify_session | one_shot_run | cleanup.
// NEVER live, NEVER exchange, NEVER cron, NEVER M-0B. Writes ONLY the canonical session file.
// Auth: identical server-secret style as trend-paper-cycle. No public route. No client secret.

import { NextRequest, NextResponse } from "next/server";
import * as fs from "fs/promises";

import { getCandlesFromSnapshot } from "@/lib/candleAdapter";
import { computeIndicatorEvidence } from "@/lib/indicators/computeIndicators";
import {
  buildCanonicalMarketRegime,
  buildMultiTimeframeIndicatorEvidence,
} from "@/lib/market-regime/canonicalMarketRegime";
import { buildTrendZoneShadow } from "@/lib/market-regime/trendZoneBuilder";
import { buildPaperLoopDiagnostics } from "@/lib/paper/paperLoopDiagnostics";
import { buildRegimeEvidence } from "@/lib/paper/regimeEvidence";
import { readRuntimeMonitorCounters } from "@/lib/paper/runtimeMonitorCounters";
import { readPaperJournal } from "@/lib/readPaperJournal";
import { readLatest } from "@/lib/readLatest";
import {
  evaluateTrendPaperExecutionEngine,
  type TrendPaperExecutionConfig,
} from "@/lib/trend/trendPaperExecutionEngine";
import { readTrendPaperJournalSnapshot } from "@/lib/trend/trendPaperJournalWriter";
import {
  readTrendPaperArmSession,
  resolveTrendPaperArmSessionPath,
} from "@/lib/trend/trendPaperArmSession";
import {
  writeTrendPaperArmSession,
  appendTrendPaperEntryAndConsumeSession,
} from "@/lib/trend/trendPaperArmSessionWriter";
import {
  buildDryRunSession,
  revokeDryRunSession,
  isTrendPaperDryRunAction,
  TREND_PAPER_DRY_RUN_ACTIONS,
} from "@/lib/trend/trendPaperDryRun";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const ROUTE = "/api/internal/trend-paper-dry-run";

function json(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status });
}

function getAuthToken(req: NextRequest) {
  const bearer = req.headers.get("authorization");
  if (bearer && bearer.toLowerCase().startsWith("bearer ")) return bearer.slice(7).trim();
  const headerKey =
    req.headers.get("x-run-cycle-key") || req.headers.get("x-internal-key") || req.headers.get("x-api-key");
  if (headerKey) return headerKey.trim();
  const urlKey = req.nextUrl.searchParams.get("key");
  if (urlKey) return urlKey.trim();
  return null;
}

function verifyAuth(req: NextRequest) {
  const expected =
    process.env.RUN_CYCLE_TRIGGER_KEY || process.env.INTERNAL_API_KEY || process.env.REFRESH_ENDPOINT_KEY || "";
  if (!expected) return { ok: false, reason: "missing server secret" };
  const received = getAuthToken(req);
  return { ok: !!received && received === expected, reason: received ? "bad key" : "missing key" };
}

function envBool(value: string | undefined, fallback: boolean): boolean {
  if (typeof value !== "string") return fallback;
  const n = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(n)) return true;
  if (["0", "false", "no", "off"].includes(n)) return false;
  return fallback;
}
function envNumber(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
function buildTrendPaperExecutionConfig(): TrendPaperExecutionConfig {
  return {
    enabled: envBool(process.env.TREND_PAPER_SIMULATION_ENABLED, false),
    mode: "PAPER_SIMULATION_ONLY",
    maxConcurrentTrendPositions: envNumber(process.env.TREND_PAPER_MAX_CONCURRENT_POSITIONS, 1),
    riskPerTradePct: envNumber(process.env.TREND_PAPER_RISK_PER_TRADE_PCT, 1),
    minRewardRisk: envNumber(process.env.TREND_PAPER_MIN_REWARD_RISK, 1.2),
    feePct: envNumber(process.env.TREND_PAPER_FEE_PCT, 0.05),
    slippagePct: envNumber(process.env.TREND_PAPER_SLIPPAGE_PCT, 0.02),
    allowShort: envBool(process.env.TREND_PAPER_ALLOW_SHORT, true),
    allowLong: envBool(process.env.TREND_PAPER_ALLOW_LONG, true),
  };
}

const LOCK = { paperOnly: true as const, liveActivationAllowed: false as const, exchangeOrderAllowed: false as const };

// Shared read-only pipeline (identical to trend-paper-cycle) — builds diagnostics without mutating anything.
async function buildDryRunDiagnostics() {
  const [summary, runtimeCounters, latest, trendPaperJournalSnapshot, sessionSnapshot] = await Promise.all([
    readPaperJournal(),
    readRuntimeMonitorCounters().catch(() => null),
    readLatest(),
    readTrendPaperJournalSnapshot(),
    readTrendPaperArmSession().catch(() => null),
  ]);
  const trendPaperArmSession = sessionSnapshot?.session ?? null;
  const candles15m = latest?.marketSnapshot ? getCandlesFromSnapshot(latest.marketSnapshot, "15M") : [];
  const candles5m = latest?.marketSnapshot ? getCandlesFromSnapshot(latest.marketSnapshot, "5M") : [];
  const candles1h = latest?.marketSnapshot ? getCandlesFromSnapshot(latest.marketSnapshot, "1H") : [];
  const indicatorEvidence = candles15m.length ? computeIndicatorEvidence(candles15m, { timeframe: "15m" }) : null;
  const multiTimeframeIndicatorEvidence = latest?.marketSnapshot
    ? buildMultiTimeframeIndicatorEvidence(latest.marketSnapshot)
    : {};
  const regimeEvidence = buildRegimeEvidence({
    decision: latest?.decision ?? null,
    marketSnapshot: latest?.marketSnapshot ?? null,
    planStatusState: latest?.planStatusState ?? null,
    sourceInfo: latest?.sourceInfo ?? null,
    indicatorEvidence,
  });
  const canonicalMarketRegime = buildCanonicalMarketRegime({
    marketSnapshot: latest?.marketSnapshot ?? null,
    indicatorEvidenceByTimeframe: multiTimeframeIndicatorEvidence,
    obGate: regimeEvidence.obGate,
    derivatives: regimeEvidence.derivatives,
    legacyPlanMode: typeof latest?.decision?.market_mode === "string" ? latest.decision.market_mode : null,
  });
  const tf1h = multiTimeframeIndicatorEvidence["1H"];
  const sessionMeta =
    (latest?.marketSnapshot as { meta?: { session?: { current?: string; risk_overlay?: { false_breakout_risk?: string } } } } | null)
      ?.meta?.session ?? null;
  const trendZoneCandidate = buildTrendZoneShadow({
    regime: canonicalMarketRegime.regime,
    direction: canonicalMarketRegime.direction,
    candles1h,
    atr1h: tf1h?.atr ?? null,
    ema50_1h: tf1h?.ema50 ?? null,
    session: sessionMeta?.current ?? null,
    sweepRisk: sessionMeta?.risk_overlay?.false_breakout_risk ?? null,
    latestPrice: candles1h.length ? candles1h[candles1h.length - 1]?.close ?? null : null,
  });
  const config = buildTrendPaperExecutionConfig();
  const diagnostics = buildPaperLoopDiagnostics(summary, runtimeCounters, {
    regimeEvidence,
    canonicalMarketRegime,
    multiTimeframeIndicatorEvidence,
    trendZoneCandidate,
    session: sessionMeta?.current ?? null,
    latest5mCandles: candles5m,
    trendPaperJournalSnapshot,
    trendPaperExecutionConfig: config,
    trendPaperArmSession,
  });
  return { diagnostics, config, candles5m, trendPaperArmSession, trendPaperJournalSnapshot };
}

export async function POST(req: NextRequest) {
  const auth = verifyAuth(req);
  if (!auth.ok) return json(401, { ok: false, error: "unauthorized", reason: auth.reason });

  let body: { action?: unknown; direction?: unknown; expiryMinutes?: unknown; mode?: unknown } = {};
  try {
    body = (await req.json()) ?? {};
  } catch {
    body = {};
  }
  const action = body.action;
  if (!isTrendPaperDryRunAction(action)) {
    return json(400, { ok: false, route: ROUTE, error: "invalid_action", allowed: TREND_PAPER_DRY_RUN_ACTIONS, ...LOCK });
  }

  try {
    // ---- A) baseline_check — read-only, writes nothing ----
    if (action === "baseline_check") {
      const { diagnostics, config, trendPaperJournalSnapshot } = await buildDryRunDiagnostics();
      return json(200, {
        ok: true, route: ROUTE, action, ...LOCK,
        configEnabled: config.enabled,
        sessionStatus: diagnostics.trendPaperArmSession?.status ?? "MISSING",
        journalExists: trendPaperJournalSnapshot.exists,
        openTrendPosition: trendPaperJournalSnapshot.openPosition,
        trendClosedTrades: trendPaperJournalSnapshot.closedTrades.length,
        bridge: diagnostics.trendPaperArmIntentBridge,
      });
    }

    // ---- B) create_session — writes ONLY the canonical session file ----
    if (action === "create_session") {
      const session = buildDryRunSession({ now: Date.now(), direction: body.direction, expiryMinutes: body.expiryMinutes });
      const write = await writeTrendPaperArmSession(session); // validates + path-locks internally
      return json(200, {
        ok: true, route: ROUTE, action, ...LOCK,
        sessionPath: write.path,
        session: {
          sessionId: session.sessionId, status: session.status, direction: session.direction,
          startedAt: session.startedAt, expiresAt: session.expiresAt,
          maxEntries: session.maxEntries, usedEntries: session.usedEntries,
          paperArmIntentRequested: session.paperArmIntentRequested,
        },
        validation: write.validation,
      });
    }

    // ---- C) verify_session — read-only, no engine, no write, no consume ----
    if (action === "verify_session") {
      const { diagnostics } = await buildDryRunDiagnostics();
      const sess = diagnostics.trendPaperArmSession;
      return json(200, {
        ok: true, route: ROUTE, action, ...LOCK,
        rawGateStatus: diagnostics.trendManualPaperArmGateRaw?.status ?? null,
        effectiveGateStatus: diagnostics.trendManualPaperArmGateEffective?.status ?? null,
        bridgeSource: diagnostics.trendPaperArmIntentBridge?.source ?? null,
        upgradedToArmed: diagnostics.trendPaperArmIntentBridge?.upgradedToArmed ?? false,
        sessionStatus: sess?.status ?? "MISSING",
        expiresAt: sess?.expiresAt ?? null,
        usedEntries: sess?.usedEntries ?? null,
        maxEntries: sess?.maxEntries ?? null,
      });
    }

    // ---- D) one_shot_run — requires config.enabled; append-then-consume exactly once ----
    if (action === "one_shot_run") {
      const { diagnostics, config, candles5m, trendPaperArmSession, trendPaperJournalSnapshot } =
        await buildDryRunDiagnostics();
      if (!config.enabled) {
        return json(200, {
          ok: true, route: ROUTE, action, ...LOCK,
          blocked: true, reason: "CONFIG_DISABLED",
          message: "TREND_PAPER_SIMULATION_ENABLED=false — operator ต้องเปิด env ก่อน (paper-only)",
          configEnabled: false, journalAppended: false, sessionConsumed: false,
        });
      }
      const engineResult = evaluateTrendPaperExecutionEngine({
        trendStrategy: diagnostics.trendStrategy,
        trendManualPaperArmGate: diagnostics.trendManualPaperArmGateEffective,
        trendPaperArmSession,
        trendPaperExecutionPreflight: diagnostics.trendPaperExecutionPreflight,
        trendZoneCandidate: diagnostics.trendZoneCandidate,
        canonicalMarketRegime: diagnostics.canonicalMarketRegime,
        multiTimeframeIndicatorEvidence: diagnostics.multiTimeframeIndicatorEvidence ?? {},
        currentPrice: diagnostics.currentPrice,
        latest5mCandles: candles5m,
        openTrendPaperPosition: trendPaperJournalSnapshot.openPosition,
        config,
        now: new Date().toISOString(),
        symbol: "BTC-USDT",
      });
      // append journal FIRST, consume session AFTER (single attempt, no retry)
      const persistence = await appendTrendPaperEntryAndConsumeSession({
        action: engineResult.action,
        journalEventDraft: engineResult.journalEventDraft,
        validation: engineResult.validation,
        trendPaperArmSession,
        writerOptions: { expectedSessionId: trendPaperArmSession?.sessionId, now: Date.now() },
      });
      return json(200, {
        ok: true, route: ROUTE, action, ...LOCK,
        configEnabled: true,
        engineAction: engineResult.action,
        reason: engineResult.reason,
        journalAppended: persistence.journalAppended,
        journalPath: persistence.journalPath,
        sessionConsumed: persistence.sessionConsumed,
        sessionConsumeReason: persistence.sessionConsumeReason,
        sessionAfter: persistence.sessionAfter
          ? { usedEntries: persistence.sessionAfter.usedEntries, maxEntries: persistence.sessionAfter.maxEntries, status: persistence.sessionAfter.status }
          : null,
        operatorAction: persistence.operatorAction,
      });
    }

    // ---- E) cleanup — revoke (default) or delete the session file ONLY ----
    if (action === "cleanup") {
      const filePath = resolveTrendPaperArmSessionPath();
      const snapshot = await readTrendPaperArmSession();
      const mode = body.mode === "delete" ? "delete" : "revoke";
      if (!snapshot.exists) {
        return json(200, { ok: true, route: ROUTE, action, ...LOCK, mode, sessionStatus: "MISSING", changed: false });
      }
      if (mode === "delete") {
        await fs.rm(filePath, { force: true });
        return json(200, { ok: true, route: ROUTE, action, ...LOCK, mode, sessionStatus: "DELETED", changed: true });
      }
      // revoke (safer default): write status=REVOKED via validated writer
      if (snapshot.session) {
        const revoked = revokeDryRunSession(snapshot.session);
        await writeTrendPaperArmSession(revoked);
        return json(200, { ok: true, route: ROUTE, action, ...LOCK, mode, sessionStatus: "REVOKED", changed: true });
      }
      // invalid session content → delete to clean up
      await fs.rm(filePath, { force: true });
      return json(200, { ok: true, route: ROUTE, action, ...LOCK, mode: "delete", sessionStatus: "DELETED_INVALID", changed: true });
    }

    return json(400, { ok: false, route: ROUTE, error: "unhandled_action", ...LOCK });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "unknown dry-run error";
    return json(500, { ok: false, route: ROUTE, action, error: "dry_run_failed", reason: message, ...LOCK });
  }
}

// Read-only GET — config + accepted actions (no secret echo, no state change).
export async function GET(req: NextRequest) {
  const auth = verifyAuth(req);
  if (!auth.ok) return json(401, { ok: false, error: "unauthorized", reason: auth.reason });
  return json(200, {
    ok: true, route: ROUTE, runtime: "nodejs", ...LOCK,
    config: buildTrendPaperExecutionConfig(),
    acceptedMethod: "POST",
    actions: TREND_PAPER_DRY_RUN_ACTIONS,
  });
}
