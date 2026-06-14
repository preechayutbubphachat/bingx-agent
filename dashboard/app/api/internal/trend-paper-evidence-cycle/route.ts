// dashboard/app/api/internal/trend-paper-evidence-cycle/route.ts
// Phase T-3H-4-b — Evidence Runner internal route (auth-gated). Wires real server deps into the
// T-3H-4-a pure runner. GET = read-only status. POST run_once = one runner cycle + persist state.
// NEVER live, NEVER exchange, NEVER cron, NEVER M-0B. Paper-only. No public/unauthenticated access.

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
import { readTrendPaperJournalSnapshot } from "@/lib/trend/trendPaperJournalWriter";
import { readTrendPaperArmSession } from "@/lib/trend/trendPaperArmSession";
import {
  writeTrendPaperArmSession,
  appendTrendPaperEntryAndConsumeSession,
} from "@/lib/trend/trendPaperArmSessionWriter";
import { buildDryRunSession, revokeDryRunSession } from "@/lib/trend/trendPaperDryRun";
import { buildTrendEvidenceMetrics } from "@/lib/trend/trendEvidenceMetrics";
import {
  readTrendPaperEvidenceState,
  writeTrendPaperEvidenceState,
} from "@/lib/trend/trendPaperEvidenceState";
import {
  runTrendPaperEvidenceCycle,
  type EvidenceRunnerConfig,
} from "@/lib/trend/trendPaperEvidenceRunner";
// T-3H-6-a: observability-only decision log (one-way; decision logic never reads it)
import {
  appendTrendEvidenceDecisionLog,
  buildTrendEvidenceDecisionRecord,
} from "@/lib/trend/trendEvidenceDecisionLog";
import { buildExactZoneShadowInput } from "@/lib/trend/exactZoneShadowInput";
import { computeRrBlockerDrilldown } from "@/lib/trend/rrBlockerDrilldown";
import { computeMtfObFvgRefinementShadow, type MtfDirection } from "@/lib/trend/mtfObFvgRefinementShadow";
import { buildRrSnapshot, buildSmcMtfShadowSnapshot } from "@/lib/trend/mtfObFvgShadowSnapshot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const ROUTE = "/api/internal/trend-paper-evidence-cycle";
const LOCK = { paperOnly: true as const, liveActivationAllowed: false as const, exchangeOrderAllowed: false as const };

function json(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status });
}
function getAuthToken(req: NextRequest) {
  const bearer = req.headers.get("authorization");
  if (bearer && bearer.toLowerCase().startsWith("bearer ")) return bearer.slice(7).trim();
  const headerKey = req.headers.get("x-run-cycle-key") || req.headers.get("x-internal-key") || req.headers.get("x-api-key");
  if (headerKey) return headerKey.trim();
  const urlKey = req.nextUrl.searchParams.get("key");
  if (urlKey) return urlKey.trim();
  return null;
}
function verifyAuth(req: NextRequest) {
  const expected = process.env.RUN_CYCLE_TRIGGER_KEY || process.env.INTERNAL_API_KEY || process.env.REFRESH_ENDPOINT_KEY || "";
  if (!expected) return { ok: false, reason: "missing server secret" };
  const received = getAuthToken(req);
  return { ok: !!received && received === expected, reason: received ? "bad key" : "missing key" };
}
function envBool(value: string | undefined, fallback: boolean): boolean {
  if (typeof value !== "string") return fallback;
  const n = value.trim().toLowerCase();
  if (["1", "true", "yes", "on", "approved"].includes(n)) return true;
  if (["0", "false", "no", "off"].includes(n)) return false;
  return fallback;
}
function envNumber(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function mid(zone: unknown): number | null {
  return Array.isArray(zone) && typeof zone[0] === "number" && typeof zone[1] === "number" ? (zone[0] + zone[1]) / 2 : null;
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

function buildEvidenceRunnerConfig(): EvidenceRunnerConfig {
  return {
    simulationEnabled: envBool(process.env.TREND_PAPER_SIMULATION_ENABLED, false),
    runnerEnabled: envBool(process.env.TREND_PAPER_EVIDENCE_RUNNER_ENABLED, false),
    allowedSymbol: process.env.EVIDENCE_RUNNER_ALLOWED_SYMBOL || "BTC-USDT",
    maxOpenPositions: envNumber(process.env.EVIDENCE_RUNNER_MAX_OPEN_POSITIONS, 1),
    maxEntriesPerDay: envNumber(process.env.EVIDENCE_RUNNER_MAX_ENTRIES_PER_DAY, 3),
    dailyLossCapR: envNumber(process.env.EVIDENCE_RUNNER_DAILY_LOSS_CAP_R, 3),
    maxConsecutiveLosses: envNumber(process.env.EVIDENCE_RUNNER_MAX_CONSECUTIVE_LOSSES, 3),
    cooldownMinutes: envNumber(process.env.EVIDENCE_RUNNER_COOLDOWN_MINUTES, 60),
    targetClosedTrades: envNumber(process.env.EVIDENCE_RUNNER_MAX_CLOSED_TRADES_TARGET, 30),
    globalSafety: {
      liveTradingEnabled: envBool(process.env.LIVE_TRADING_ENABLED, false),
      orderPlacementEnabled: envBool(process.env.ENABLE_ORDER_PLACEMENT, false),
      productionTradingReady: envBool(process.env.PRODUCTION_TRADING_READY, false),
      exchangeApproved: envBool(process.env.EXCHANGE_MANUAL_APPROVAL, false),
    },
  };
}

// Shared read-only diagnostics pipeline (identical to trend-paper-cycle/dry-run; mutates nothing).
async function buildDiagnostics() {
  const [summary, runtimeCounters, latest, trendPaperJournalSnapshot, sessionSnapshot] = await Promise.all([
    readPaperJournal(),
    readRuntimeMonitorCounters().catch(() => null),
    readLatest(),
    readTrendPaperJournalSnapshot(),
    readTrendPaperArmSession().catch(() => null),
  ]);
  const trendPaperArmSession = sessionSnapshot?.session ?? null;
  const candles4h = latest?.marketSnapshot ? getCandlesFromSnapshot(latest.marketSnapshot, "4H") : [];
  const candles15m = latest?.marketSnapshot ? getCandlesFromSnapshot(latest.marketSnapshot, "15M") : [];
  const candles5m = latest?.marketSnapshot ? getCandlesFromSnapshot(latest.marketSnapshot, "5M") : [];
  const candles1h = latest?.marketSnapshot ? getCandlesFromSnapshot(latest.marketSnapshot, "1H") : [];
  const indicatorEvidence = candles15m.length ? computeIndicatorEvidence(candles15m, { timeframe: "15m" }) : null;
  const multiTimeframeIndicatorEvidence = latest?.marketSnapshot ? buildMultiTimeframeIndicatorEvidence(latest.marketSnapshot) : {};
  const regimeEvidence = buildRegimeEvidence({
    decision: latest?.decision ?? null, marketSnapshot: latest?.marketSnapshot ?? null,
    planStatusState: latest?.planStatusState ?? null, sourceInfo: latest?.sourceInfo ?? null, indicatorEvidence,
  });
  const canonicalMarketRegime = buildCanonicalMarketRegime({
    marketSnapshot: latest?.marketSnapshot ?? null, indicatorEvidenceByTimeframe: multiTimeframeIndicatorEvidence,
    obGate: regimeEvidence.obGate, derivatives: regimeEvidence.derivatives,
    legacyPlanMode: typeof latest?.decision?.market_mode === "string" ? latest.decision.market_mode : null,
  });
  const tf1h = multiTimeframeIndicatorEvidence["1H"];
  const sessionMeta = (latest?.marketSnapshot as { meta?: { session?: { current?: string; risk_overlay?: { false_breakout_risk?: string } } } } | null)?.meta?.session ?? null;
  const trendZoneCandidate = buildTrendZoneShadow({
    regime: canonicalMarketRegime.regime, direction: canonicalMarketRegime.direction, candles1h,
    atr1h: tf1h?.atr ?? null, ema50_1h: tf1h?.ema50 ?? null, session: sessionMeta?.current ?? null,
    sweepRisk: sessionMeta?.risk_overlay?.false_breakout_risk ?? null,
    latestPrice: candles1h.length ? candles1h[candles1h.length - 1]?.close ?? null : null,
  });
  const config = buildTrendPaperExecutionConfig();
  const diagnostics = buildPaperLoopDiagnostics(summary, runtimeCounters, {
    regimeEvidence, canonicalMarketRegime, multiTimeframeIndicatorEvidence, trendZoneCandidate,
    session: sessionMeta?.current ?? null, latest5mCandles: candles5m, trendPaperJournalSnapshot,
    trendPaperExecutionConfig: config, trendPaperArmSession,
  });
  const currentBarId = candles1h.length ? String(candles1h[candles1h.length - 1]?.t ?? "") : null;
  return { diagnostics, config, candles4h, candles15m, candles5m, candles1h, trendPaperArmSession, trendPaperJournalSnapshot, currentBarId };
}

function statusBody(action: string, state: Record<string, unknown>, cfg: EvidenceRunnerConfig, extra: Record<string, unknown> = {}) {
  return {
    ok: true, route: ROUTE, action, ...LOCK,
    config: { simulationEnabled: cfg.simulationEnabled, evidenceRunnerEnabled: cfg.runnerEnabled },
    evidencePhase: state.evidencePhase, enabled: state.enabled,
    lastRunAt: state.lastRunAt, lastDecision: state.lastDecision, lastGateStatus: state.lastGateStatus,
    lastRejectReasons: state.lastRejectReasons, dailyEntryCount: state.dailyEntryCount, dailyLossR: state.dailyLossR,
    cooldownUntil: state.cooldownUntil, openTrendPosition: state.openTrendPosition,
    trendClosedTrades: state.trendClosedTrades, targetClosedTrades: state.targetClosedTrades,
    sampleStatus: state.sampleStatus, winRate: state.winRate, expectancyR: state.expectancyR,
    profitFactor: state.profitFactor, maxDrawdownR: state.maxDrawdownR,
    maxConsecutiveLossesObserved: state.maxConsecutiveLossesObserved,
    readyForNextPhase: state.readyForNextPhase, stopReason: state.stopReason,
    ...extra,
  };
}

function buildDecisionLogSnapshots(diagnostics: Awaited<ReturnType<typeof buildDiagnostics>>, capturedAt: string) {
  const d = diagnostics.diagnostics as unknown as Record<string, unknown>;
  const trendStrategy = (d.trendStrategy ?? {}) as Record<string, unknown>;
  const preflight = (d.trendPaperExecutionPreflight ?? {}) as Record<string, unknown>;
  const trendZone = (d.trendZoneCandidate ?? {}) as Record<string, unknown>;
  const trendZoneTargets = (trendZone.targets ?? {}) as Record<string, unknown>;
  const regimeEvidence = (d.regimeEvidence ?? {}) as Record<string, unknown>;
  const regimeDecision = (regimeEvidence.decision ?? {}) as Record<string, unknown>;
  const indicators = (regimeEvidence.indicators ?? {}) as Record<string, unknown>;
  const indicatorValue = (name: string) => num(((indicators[name] as Record<string, unknown> | undefined) ?? {}).value);
  const canonicalMarketRegime = (d.canonicalMarketRegime ?? {}) as Record<string, unknown>;
  const dynamicGrid = (d.dynamicGrid ?? {}) as Record<string, unknown>;
  const entryZone = (trendStrategy.entryZone ?? trendZone.pullbackZone ?? null) as [number, number] | null;
  const direction = (preflight.direction ?? trendStrategy.direction ?? null) as MtfDirection | null;
  const entry = num(preflight.entry) ?? mid(entryZone);
  const stop = num(preflight.stopLoss) ?? num(trendStrategy.invalidation) ?? num(trendZone.invalidation);
  const target = num(preflight.takeProfit1) ?? num(trendStrategy.target1) ?? num(trendZoneTargets.t1);
  const rawRR = num(trendStrategy.rewardRisk) ?? num(preflight.rewardRisk);

  const rr = computeRrBlockerDrilldown({
    rawRR,
    requiredRR: diagnostics.config.minRewardRisk,
    entry,
    stopLoss: stop,
    target1: target,
    currentPrice: num(trendStrategy.currentPrice) ?? num(d.currentPrice),
    distanceToEntryZonePct: num(trendStrategy.distanceToEntryZonePct),
    riskStatus: typeof trendStrategy.riskStatus === "string" ? trendStrategy.riskStatus : null,
    feePct: diagnostics.config.feePct,
    slippagePct: diagnostics.config.slippagePct,
  });
  const mtfBaseInput = {
    direction,
    currentEntry: entry,
    currentStop: stop,
    currentTarget: target,
    currentRawRR: rawRR,
    requiredRR: diagnostics.config.minRewardRisk,
    feePct: diagnostics.config.feePct,
    slippagePct: diagnostics.config.slippagePct,
    regime: typeof canonicalMarketRegime.regime === "string" ? canonicalMarketRegime.regime : typeof regimeDecision.regime === "string" ? regimeDecision.regime : null,
    adx: indicatorValue("adx"),
    atr: indicatorValue("atr"),
    atrPct: indicatorValue("atrPct"),
    bbw: indicatorValue("bbw"),
    currentPrice: num(trendStrategy.currentPrice) ?? num(d.currentPrice),
    distanceToEntryZonePct: num(trendStrategy.distanceToEntryZonePct),
    entryZone,
    optionalObZone: null,
    optionalFvgZone: null,
    optionalLiquidityTarget: num(trendZoneTargets.t1) ?? num(trendStrategy.target1),
    optionalInvalidation: num(trendZone.invalidation) ?? num(trendStrategy.invalidation),
  };
  const heuristicMtf = computeMtfObFvgRefinementShadow(mtfBaseInput);
  const exactZone = buildExactZoneShadowInput({
    candlesByTimeframe: {
      "4H": diagnostics.candles4h,
      "1H": diagnostics.candles1h,
      "15M": diagnostics.candles15m,
      "5M": diagnostics.candles5m,
    },
    direction,
    htfBias:
      canonicalMarketRegime.direction === "BULLISH" || canonicalMarketRegime.direction === "BEARISH"
        ? canonicalMarketRegime.direction
        : canonicalMarketRegime.direction === "NEUTRAL"
          ? "NEUTRAL"
          : undefined,
    context: {
      regime: typeof canonicalMarketRegime.regime === "string" ? canonicalMarketRegime.regime : typeof regimeDecision.regime === "string" ? regimeDecision.regime : null,
      session: typeof d.session === "string" ? d.session : null,
      currentPrice: num(trendStrategy.currentPrice) ?? num(d.currentPrice),
      currentEntry: entry,
      currentStop: stop,
      currentTarget: target,
      requiredRR: diagnostics.config.minRewardRisk,
      feePct: diagnostics.config.feePct,
      slippagePct: diagnostics.config.slippagePct,
      heuristicNetRR: heuristicMtf.refinedNetRR,
    },
  });
  const mtf = exactZone.usesExactObFvgZones
    ? computeMtfObFvgRefinementShadow({
        ...mtfBaseInput,
        optionalObZone: exactZone.optionalObZone,
        optionalFvgZone: exactZone.optionalFvgZone,
      })
    : heuristicMtf;

  return {
    rrSnapshot: buildRrSnapshot(rr, capturedAt),
    smcMtfShadowSnapshot: buildSmcMtfShadowSnapshot(mtf, capturedAt, exactZone.usesExactObFvgZones ? exactZone : null, {
      direction,
      entry,
      invalidation: stop,
      target,
      timeframe: "15M",
    }, {
      canonicalRegime: typeof canonicalMarketRegime.regime === "string" ? canonicalMarketRegime.regime : null,
      canonicalDirection: typeof canonicalMarketRegime.direction === "string" ? canonicalMarketRegime.direction : null,
      priceVsGrid: typeof d.priceVsGrid === "string" ? d.priceVsGrid : null,
      dynamicGridStatus: typeof dynamicGrid.status === "string" ? dynamicGrid.status : null,
    }),
  };
}

// ---- GET: read-only status (no runner, no write) ----
export async function GET(req: NextRequest) {
  const auth = verifyAuth(req);
  if (!auth.ok) return json(401, { ok: false, error: "unauthorized", reason: auth.reason });
  const cfg = buildEvidenceRunnerConfig();
  const [{ trendPaperJournalSnapshot }, stateSnap] = await Promise.all([buildDiagnostics(), readTrendPaperEvidenceState()]);
  const metrics = buildTrendEvidenceMetrics(trendPaperJournalSnapshot.closedTrades);
  const state = {
    ...stateSnap.state,
    trendClosedTrades: metrics.trendClosedTrades, winRate: metrics.winRate, expectancyR: metrics.expectancyR,
    profitFactor: metrics.profitFactor, maxDrawdownR: metrics.maxDrawdownR,
    maxConsecutiveLossesObserved: metrics.maxConsecutiveLosses, sampleStatus: metrics.sampleStatus,
  };
  return json(200, statusBody("status", state, cfg, { runnerResult: null }));
}

// ---- POST run_once: one runner cycle + persist state ----
export async function POST(req: NextRequest) {
  const auth = verifyAuth(req);
  if (!auth.ok) return json(401, { ok: false, error: "unauthorized", reason: auth.reason });

  let body: { action?: unknown } = {};
  try { body = (await req.json()) ?? {}; } catch { body = {}; }
  if (body.action !== "run_once") {
    return json(400, { ok: false, route: ROUTE, error: "invalid_action", allowed: ["run_once"], ...LOCK });
  }

  try {
    const cfg = buildEvidenceRunnerConfig();
    const stateSnap = await readTrendPaperEvidenceState();
    const init = await buildDiagnostics();
    const metrics = buildTrendEvidenceMetrics(init.trendPaperJournalSnapshot.closedTrades);

    const rawGate = init.diagnostics.trendManualPaperArmGateRaw;
    const strategy = init.diagnostics.trendStrategy;
    const openPos = init.trendPaperJournalSnapshot.openPosition;
    const openTrendPosition = openPos
      ? { positionId: openPos.positionId, direction: openPos.direction, entryPrice: openPos.entryPrice, openedAt: openPos.openedAt }
      : null;

    const result = await runTrendPaperEvidenceCycle({
      now: new Date().toISOString(),
      symbol: "BTC-USDT",
      currentBarId: init.currentBarId,
      config: cfg,
      state: stateSnap.state,
      gate: {
        rawStatus: rawGate?.status ?? null,
        effectiveStatus: init.diagnostics.trendManualPaperArmGateEffective?.status ?? null,
        armable: rawGate?.status === "READY_FOR_OPERATOR_REVIEW" || rawGate?.status === "OPERATOR_ARMED_PAPER_ONLY",
        direction: strategy?.direction ?? null,
        failedConditions: rawGate?.failedConditions ?? [],
      },
      metrics,
      openTrendPosition,
      // ---- real injected deps (paper-only, reuse verified pieces) ----
      createSession: async (direction, expiryMinutes) => {
        const session = buildDryRunSession({ now: Date.now(), direction, expiryMinutes });
        await writeTrendPaperArmSession(session);
        return { ok: true };
      },
      runOneShot: async () => {
        // re-read with the freshly-armed session so the bridge can upgrade the effective gate
        const d = await buildDiagnostics();
        const engineResult = evaluateTrendPaperExecutionEngine({
          trendStrategy: d.diagnostics.trendStrategy,
          trendManualPaperArmGate: d.diagnostics.trendManualPaperArmGateEffective,
          trendPaperArmSession: d.trendPaperArmSession,
          trendPaperExecutionPreflight: d.diagnostics.trendPaperExecutionPreflight,
          trendZoneCandidate: d.diagnostics.trendZoneCandidate,
          canonicalMarketRegime: d.diagnostics.canonicalMarketRegime,
          multiTimeframeIndicatorEvidence: d.diagnostics.multiTimeframeIndicatorEvidence ?? {},
          currentPrice: d.diagnostics.currentPrice,
          latest5mCandles: d.candles5m,
          openTrendPaperPosition: d.trendPaperJournalSnapshot.openPosition,
          config: d.config,
          now: new Date().toISOString(),
          symbol: "BTC-USDT",
        });
        const persistence = await appendTrendPaperEntryAndConsumeSession({
          action: engineResult.action,
          journalEventDraft: engineResult.journalEventDraft,
          validation: engineResult.validation,
          trendPaperArmSession: d.trendPaperArmSession,
          writerOptions: { expectedSessionId: d.trendPaperArmSession?.sessionId, now: Date.now() },
        });
        return { action: engineResult.action, reason: engineResult.reason, journalAppended: persistence.journalAppended, sessionConsumed: persistence.sessionConsumed };
      },
      cleanupSession: async () => {
        const snap = await readTrendPaperArmSession();
        if (snap.exists && snap.session) await writeTrendPaperArmSession(revokeDryRunSession(snap.session));
        return { ok: true };
      },
      driveExitLifecycle: async () => {
        const engineResult = evaluateTrendPaperExecutionEngine({
          trendStrategy: init.diagnostics.trendStrategy,
          trendManualPaperArmGate: init.diagnostics.trendManualPaperArmGateEffective,
          trendPaperArmSession: init.trendPaperArmSession,
          trendPaperExecutionPreflight: init.diagnostics.trendPaperExecutionPreflight,
          trendZoneCandidate: init.diagnostics.trendZoneCandidate,
          canonicalMarketRegime: init.diagnostics.canonicalMarketRegime,
          multiTimeframeIndicatorEvidence: init.diagnostics.multiTimeframeIndicatorEvidence ?? {},
          currentPrice: init.diagnostics.currentPrice,
          latest5mCandles: init.candles5m,
          openTrendPaperPosition: openPos,
          config: init.config,
          now: new Date().toISOString(),
          symbol: "BTC-USDT",
        });
        if (engineResult.action === "CREATE_PAPER_EXIT") {
          // exit append — NOT_AN_ENTRY_EVENT, never consumes session (T-3H-2)
          await appendTrendPaperEntryAndConsumeSession({
            action: engineResult.action, journalEventDraft: engineResult.journalEventDraft,
            validation: engineResult.validation, trendPaperArmSession: init.trendPaperArmSession,
            writerOptions: { now: Date.now() },
          });
          return { closed: true, reason: engineResult.reason };
        }
        return { closed: false, reason: engineResult.reason };
      },
    });

    await writeTrendPaperEvidenceState(result.nextState);

    // T-3H-6-a hook: append observability record AFTER state write succeeds.
    // Best-effort only — append failure must never fail the cycle (helper never throws).
    // ONE-WAY: nothing in the decision path reads this log.
    const snapshotCapturedAt = new Date().toISOString();
    const snapshots = buildDecisionLogSnapshots(init, snapshotCapturedAt);
    const decisionLogResult = await appendTrendEvidenceDecisionLog(
      buildTrendEvidenceDecisionRecord({
        now: snapshotCapturedAt,
        source: "trend-paper-evidence-cycle",
        action: "run_once",
        state: result.nextState as unknown as Record<string, unknown>,
        rrSnapshot: snapshots.rrSnapshot,
        smcMtfShadowSnapshot: snapshots.smcMtfShadowSnapshot,
      }),
    ).catch((e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : "append_failed" }));

    return json(200, statusBody("run_once", result.nextState as unknown as Record<string, unknown>, cfg, {
      runnerResult: { decision: result.decision, blocked: result.blocked, reasons: result.reasons },
      decisionLog: decisionLogResult.ok ? { appended: true } : { appended: false, warning: decisionLogResult.error },
    }));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "unknown evidence-cycle error";
    return json(500, { ok: false, route: ROUTE, action: "run_once", error: "evidence_cycle_failed", reason: message, ...LOCK });
  }
}
