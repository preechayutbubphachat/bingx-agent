import { NextRequest, NextResponse } from "next/server";

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
import {
  appendTrendPaperJournalEvent,
  readTrendPaperJournalSnapshot,
} from "@/lib/trend/trendPaperJournalWriter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function json(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status });
}

function maskValue(v: string | null | undefined) {
  if (!v) return null;
  if (v.length <= 8) return "********";
  return `${v.slice(0, 4)}********${v.slice(-2)}`;
}

function getAuthToken(req: NextRequest) {
  const bearer = req.headers.get("authorization");
  if (bearer && bearer.toLowerCase().startsWith("bearer ")) {
    return bearer.slice(7).trim();
  }
  const headerKey =
    req.headers.get("x-run-cycle-key") ||
    req.headers.get("x-internal-key") ||
    req.headers.get("x-api-key");
  if (headerKey) return headerKey.trim();
  const urlKey = req.nextUrl.searchParams.get("key");
  if (urlKey) return urlKey.trim();
  return null;
}

function verifyAuth(req: NextRequest) {
  const expected =
    process.env.RUN_CYCLE_TRIGGER_KEY ||
    process.env.INTERNAL_API_KEY ||
    process.env.REFRESH_ENDPOINT_KEY ||
    "";

  if (!expected) {
    return {
      ok: false,
      reason: "missing server secret: set RUN_CYCLE_TRIGGER_KEY (or INTERNAL_API_KEY / REFRESH_ENDPOINT_KEY)",
      expectedMasked: null as string | null,
      receivedMasked: null as string | null,
    };
  }

  const received = getAuthToken(req);
  return {
    ok: !!received && received === expected,
    reason: received ? "bad key" : "missing key",
    expectedMasked: maskValue(expected),
    receivedMasked: maskValue(received),
  };
}

function envBool(value: string | undefined, fallback: boolean): boolean {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
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

export async function POST(req: NextRequest) {
  const auth = verifyAuth(req);
  if (!auth.ok) {
    return json(401, {
      ok: false,
      error: "unauthorized",
      reason: auth.reason,
    });
  }

  try {
    const [summary, runtimeCounters, latest, trendPaperJournalSnapshot] = await Promise.all([
      readPaperJournal(),
      readRuntimeMonitorCounters().catch(() => null),
      readLatest(),
      readTrendPaperJournalSnapshot(),
    ]);

    const candles15m = latest?.marketSnapshot ? getCandlesFromSnapshot(latest.marketSnapshot, "15M") : [];
    const candles5m = latest?.marketSnapshot ? getCandlesFromSnapshot(latest.marketSnapshot, "5M") : [];
    const candles1h = latest?.marketSnapshot ? getCandlesFromSnapshot(latest.marketSnapshot, "1H") : [];
    const indicatorEvidence = candles15m.length
      ? computeIndicatorEvidence(candles15m, { timeframe: "15m" })
      : null;
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
    const sessionMeta = (latest?.marketSnapshot as { meta?: { session?: { current?: string; risk_overlay?: { false_breakout_risk?: string } } } } | null)?.meta?.session ?? null;
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
    const trendPaperExecutionConfig = buildTrendPaperExecutionConfig();
    const diagnostics = buildPaperLoopDiagnostics(summary, runtimeCounters, {
      regimeEvidence,
      canonicalMarketRegime,
      multiTimeframeIndicatorEvidence,
      trendZoneCandidate,
      session: sessionMeta?.current ?? null,
      latest5mCandles: candles5m,
      trendPaperJournalSnapshot,
      trendPaperExecutionConfig,
    });

    const engineResult = evaluateTrendPaperExecutionEngine({
      trendStrategy: diagnostics.trendStrategy,
      trendManualPaperArmGate: diagnostics.trendManualPaperArmGate,
      trendPaperExecutionPreflight: diagnostics.trendPaperExecutionPreflight,
      trendZoneCandidate: diagnostics.trendZoneCandidate,
      canonicalMarketRegime: diagnostics.canonicalMarketRegime,
      multiTimeframeIndicatorEvidence: diagnostics.multiTimeframeIndicatorEvidence ?? {},
      currentPrice: diagnostics.currentPrice,
      latest5mCandles: candles5m,
      openTrendPaperPosition: trendPaperJournalSnapshot.openPosition,
      config: trendPaperExecutionConfig,
      now: new Date().toISOString(),
      symbol: "BTC-USDT",
    });

    let appendResult: Awaited<ReturnType<typeof appendTrendPaperJournalEvent>> | null = null;
    let journalSnapshotAfter = trendPaperJournalSnapshot;
    if (
      trendPaperExecutionConfig.enabled &&
      engineResult.action !== "NO_ACTION" &&
      engineResult.journalEventDraft &&
      engineResult.validation?.valid
    ) {
      appendResult = await appendTrendPaperJournalEvent(engineResult.journalEventDraft);
      journalSnapshotAfter = await readTrendPaperJournalSnapshot();
    }

    return json(200, {
      ok: true,
      route: "/api/internal/trend-paper-cycle",
      paperOnly: true,
      liveActivationAllowed: false,
      exchangeOrderAllowed: false,
      config: trendPaperExecutionConfig,
      action: engineResult.action,
      reason: engineResult.reason,
      validation: engineResult.validation,
      journalAppended: !!appendResult,
      journalPath: appendResult?.path ?? trendPaperJournalSnapshot.path,
      engine: engineResult,
      diagnostics: {
        trendPaperExecutionPreflight: diagnostics.trendPaperExecutionPreflight,
        trendPaperExecutionEngine: diagnostics.trendPaperExecutionEngine,
        trendEdgeReview: diagnostics.trendEdgeReview,
      },
      journalState: {
        before: {
          exists: trendPaperJournalSnapshot.exists,
          openPosition: trendPaperJournalSnapshot.openPosition,
          closedTrades: trendPaperJournalSnapshot.closedTrades.length,
          lastEntryAt: trendPaperJournalSnapshot.lastEntryAt,
          lastExitAt: trendPaperJournalSnapshot.lastExitAt,
        },
        after: {
          exists: journalSnapshotAfter.exists,
          openPosition: journalSnapshotAfter.openPosition,
          closedTrades: journalSnapshotAfter.closedTrades.length,
          lastEntryAt: journalSnapshotAfter.lastEntryAt,
          lastExitAt: journalSnapshotAfter.lastExitAt,
        },
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "unknown trend-paper-cycle error";
    return json(500, {
      ok: false,
      route: "/api/internal/trend-paper-cycle",
      error: "trend_paper_cycle_failed",
      reason: message,
      paperOnly: true,
      liveActivationAllowed: false,
      exchangeOrderAllowed: false,
    });
  }
}

export async function GET(req: NextRequest) {
  const auth = verifyAuth(req);
  if (!auth.ok) {
    return json(401, {
      ok: false,
      error: "unauthorized",
      reason: auth.reason,
    });
  }

  return json(200, {
    ok: true,
    route: "/api/internal/trend-paper-cycle",
    runtime: "nodejs",
    paperOnly: true,
    liveActivationAllowed: false,
    exchangeOrderAllowed: false,
    config: buildTrendPaperExecutionConfig(),
    acceptedMethod: "POST",
  });
}
