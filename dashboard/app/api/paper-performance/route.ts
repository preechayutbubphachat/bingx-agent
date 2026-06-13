/**
 * /api/paper-performance
 * Phase L+ — Attribution Depth & Edge Diagnostics (additive)
 *
 * Read-only endpoint คืน paper trading performance metrics
 * รวม attribution by mode/regime/session, costGate, edge diagnostics,
 * failure reasons, no-trade diagnostics
 *
 * Response:
 *   200 — เสมอ (ok field บอกสถานะ)
 *   healthy field ไม่มี — ใช้ ok field แทน
 *
 * Safety guarantees:
 * - READ ONLY — ไม่เขียน/แก้/ลบไฟล์ใดเลย
 * - ไม่ call BingX API
 * - ไม่มี API key / secret
 * - paper PnL ≠ live PnL
 * - default edgeStatus = "unproven"
 * - errors ไม่ bubble up — คืน safe fallback เสมอ
 *
 * ADDITIVE EXTENSION from v1.0.0:
 * - costGate (CostGate struct)
 * - edgeDiagnostics (EdgeDiagnostics struct)
 * - failureReasons (FailureEntry[])
 * - totalLossCycles, unknownFailurePct
 * - noTradeDiagnostics (NoTradeDiagnostics struct)
 * - attribution.byMode/byRegime/bySession now include grossPnl,
 *   totalCost, profitFactor, costToGrossProfitRatio per bucket
 */

import { NextResponse } from "next/server";
import { computePaperPerformance } from "@/lib/paperPerformance";
import { readPaperJournal } from "@/lib/readPaperJournal";
import { buildPaperLoopDiagnostics } from "@/lib/paper/paperLoopDiagnostics";
import { readRuntimeMonitorCounters } from "@/lib/paper/runtimeMonitorCounters";
import { readLatest } from "@/lib/readLatest";
import { buildRegimeEvidence } from "@/lib/paper/regimeEvidence";
import { getCandlesFromSnapshot } from "@/lib/candleAdapter";
import { computeIndicatorEvidence } from "@/lib/indicators/computeIndicators";
import {
  buildCanonicalMarketRegime,
  buildMultiTimeframeIndicatorEvidence,
} from "@/lib/market-regime/canonicalMarketRegime";
import { buildTrendZoneShadow } from "@/lib/market-regime/trendZoneBuilder";
import { readTrendPaperJournalSnapshot } from "@/lib/trend/trendPaperJournalWriter";
// T-3H-6-a: read-only summary of the observability decision log (never read by decision logic)
import { readTrendEvidenceDecisionLogSummary } from "@/lib/trend/trendEvidenceDecisionLog";
import { readTrendPaperEvidenceState } from "@/lib/trend/trendPaperEvidenceState";
import { buildTrendEvidenceMetrics } from "@/lib/trend/trendEvidenceMetrics";
import { readTrendPaperArmSession } from "@/lib/trend/trendPaperArmSession";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PAPER_PERFORMANCE_VERSION = "1.1.0";

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

export async function GET() {
  try {
    const report = await computePaperPerformance();

    // Part F — additive paper-loop diagnostics (never throws the endpoint)
    let paperLoopDiagnostics = null;
    try {
      const summary = await readPaperJournal();
      const runtimeCounters = await readRuntimeMonitorCounters().catch(() => null);
      const latest = await readLatest().catch(() => null);
      const candles15m = latest?.marketSnapshot
        ? getCandlesFromSnapshot(latest.marketSnapshot, "15M")
        : [];
      const candles5m = latest?.marketSnapshot
        ? getCandlesFromSnapshot(latest.marketSnapshot, "5M")
        : [];
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
      // Phase D — Trend Zone Builder Shadow (read-only diagnostics, never used for orders)
      const candles1h = latest?.marketSnapshot ? getCandlesFromSnapshot(latest.marketSnapshot, "1H") : [];
      const tf1h = multiTimeframeIndicatorEvidence["1H"];
      const sessionMeta = (latest?.marketSnapshot as { meta?: { session?: { current?: string; risk_overlay?: { false_breakout_risk?: string } } } } | null)?.meta?.session ?? null;
      const latest1hClose = candles1h.length ? candles1h[candles1h.length - 1]?.close ?? null : null;
      const trendPaperJournalSnapshot = await readTrendPaperJournalSnapshot().catch(() => null);
      const trendPaperArmSessionSnapshot = await readTrendPaperArmSession().catch(() => null);
      const trendPaperExecutionConfig = {
        enabled: envBool(process.env.TREND_PAPER_SIMULATION_ENABLED, false),
        mode: "PAPER_SIMULATION_ONLY" as const,
        maxConcurrentTrendPositions: envNumber(process.env.TREND_PAPER_MAX_CONCURRENT_POSITIONS, 1),
        riskPerTradePct: envNumber(process.env.TREND_PAPER_RISK_PER_TRADE_PCT, 1),
        minRewardRisk: envNumber(process.env.TREND_PAPER_MIN_REWARD_RISK, 1.2),
        feePct: envNumber(process.env.TREND_PAPER_FEE_PCT, 0.05),
        slippagePct: envNumber(process.env.TREND_PAPER_SLIPPAGE_PCT, 0.02),
        allowShort: envBool(process.env.TREND_PAPER_ALLOW_SHORT, true),
        allowLong: envBool(process.env.TREND_PAPER_ALLOW_LONG, true),
      };
      const trendZoneCandidate = buildTrendZoneShadow({
        regime: canonicalMarketRegime.regime,
        direction: canonicalMarketRegime.direction,
        candles1h,
        atr1h: tf1h?.atr ?? null,
        ema50_1h: tf1h?.ema50 ?? null,
        session: sessionMeta?.current ?? null,
        sweepRisk: sessionMeta?.risk_overlay?.false_breakout_risk ?? null,
        latestPrice: latest1hClose ?? (candles15m.length ? candles15m[candles15m.length - 1]?.close ?? null : null),
      });
      paperLoopDiagnostics = buildPaperLoopDiagnostics(summary, runtimeCounters, {
        closedCycles: report.edgeDiagnostics?.closedCycles ?? 0,
        costGate: {
          pass: report.costGate?.pass ?? null,
          requiredMinSpacingPct: report.costGate?.requiredMinSpacingPct ?? null,
        },
        regimeEvidence,
        canonicalMarketRegime,
        latestCanonicalMarketRegimeDiagnostic: latest?.decision?.diagnostics?.canonicalMarketRegime ?? null,
        marketSnapshot: latest?.marketSnapshot ?? null,
        multiTimeframeIndicatorEvidence,
        trendZoneCandidate,
        session: sessionMeta?.current ?? null,
        latest5mCandles: candles5m,
        trendPaperJournalSnapshot,
        trendPaperExecutionConfig,
        trendPaperArmSession: trendPaperArmSessionSnapshot?.session ?? null,
      });
      // T-3H-4-b: attach read-only evidence-runner state (read-only display; no runner is invoked here)
      const evidenceSnap = await readTrendPaperEvidenceState().catch(() => null);
      const evidenceMetrics = buildTrendEvidenceMetrics(trendPaperJournalSnapshot?.closedTrades ?? []);
      const es = evidenceSnap?.state ?? null;
      (paperLoopDiagnostics as unknown as Record<string, unknown>).trendPaperEvidenceRunner = {
        evidencePhase: es?.evidencePhase ?? "DISABLED",
        enabled: es?.enabled ?? false,
        simulationEnabled: envBool(process.env.TREND_PAPER_SIMULATION_ENABLED, false),
        evidenceRunnerEnabled: envBool(process.env.TREND_PAPER_EVIDENCE_RUNNER_ENABLED, false),
        lastRunAt: es?.lastRunAt ?? null,
        lastDecision: es?.lastDecision ?? null,
        lastGateStatus: es?.lastGateStatus ?? null,
        lastRejectReasons: es?.lastRejectReasons ?? [],
        dailyEntryCount: es?.dailyEntryCount ?? 0,
        maxEntriesPerDay: es?.maxEntriesPerDay ?? 3,
        dailyLossR: es?.dailyLossR ?? 0,
        cooldownUntil: es?.cooldownUntil ?? null,
        openTrendPosition: es?.openTrendPosition ?? null,
        trendClosedTrades: evidenceMetrics.trendClosedTrades,
        targetClosedTrades: es?.targetClosedTrades ?? 30,
        sampleStatus: evidenceMetrics.sampleStatus,
        winRate: evidenceMetrics.winRate,
        expectancyR: evidenceMetrics.expectancyR,
        profitFactor: evidenceMetrics.profitFactor,
        maxDrawdownR: evidenceMetrics.maxDrawdownR,
        maxConsecutiveLossesObserved: evidenceMetrics.maxConsecutiveLosses,
        readyForNextPhase: evidenceMetrics.trendClosedTrades >= 30,
        stopReason: es?.stopReason ?? null,
        paperOnly: true,
        liveActivationAllowed: false,
        exchangeOrderAllowed: false,
      };
      // T-3H-6-a: attach read-only rejection/decision summary (48h window; safe fallback)
      const decisionSummary = await readTrendEvidenceDecisionLogSummary({ windowHours: 48 }).catch(() => null);
      (paperLoopDiagnostics as unknown as Record<string, unknown>).trendEvidenceDecisionSummary = decisionSummary ?? {
        available: false,
        totalRecords: 0,
        sampleWarning: true,
      };
      // T-3H-6-b: expose non-secret display config (RR threshold + cost params) for the RR drilldown.
      // READ-ONLY exposure of existing values — changing the threshold still happens only via env, not UI.
      (paperLoopDiagnostics as unknown as Record<string, unknown>).trendPaperConfigPublic = {
        minRewardRisk: envNumber(process.env.TREND_PAPER_MIN_REWARD_RISK, 1.2),
        feePct: envNumber(process.env.TREND_PAPER_FEE_PCT, 0.05),
        slippagePct: envNumber(process.env.TREND_PAPER_SLIPPAGE_PCT, 0.02),
      };
    } catch {
      paperLoopDiagnostics = null;
    }

    return NextResponse.json(
      {
        version: PAPER_PERFORMANCE_VERSION,
        ...report,
        // legacy field — derived from costGate so UI ที่ยังอ่าน gridSpacingCheck ไม่พัง
        gridSpacingCheck: {
          spacingPct: report.costGate?.gridSpacingPct ?? null,
          roundTripCostPct: report.costGate?.roundTripCostPct ?? null,
          passes: report.costGate?.pass ?? null,
          note: report.costGate?.nextAction ?? "",
        },
        // Part F — additive observability (backward-compatible)
        paperLoopDiagnostics,
        paperDataQuality: {
          ...report.paperDataQuality,
          hasNoTradeLogs: !!paperLoopDiagnostics && paperLoopDiagnostics.lastNoTradeReason != null,
          hasDynamicGridDiagnostics: !!paperLoopDiagnostics?.dynamicGrid?.enabled,
        },
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Unknown error in paper-performance";

    console.error("[/api/paper-performance] Unexpected error:", message);

    return NextResponse.json(
      {
        version: PAPER_PERFORMANCE_VERSION,
        ok: false,
        readOnly: true,
        status: "no_data",
        edgeStatus: "unproven",
        totalEvents: 0,
        totalPaperOrders: 0,
        totalPaperFills: 0,
        buyFillCount: 0,
        sellFillCount: 0,
        latestJournalAt: null,
        priceVsGrid: "UNKNOWN",
        sampleSizeStatus: "insufficient_data",
        grossPaperPnl: null,
        feeEstimateTotal: null,
        slippageEstimateTotal: null,
        fundingEstimateTotal: null,
        netPaperPnl: null,
        winRate: null,
        lossRate: null,
        averageWin: null,
        averageLoss: null,
        payoffRatio: null,
        expectancy: null,
        profitFactor: null,
        maxDrawdown: null,
        averageHoldingTime: null,
        costToGrossProfitRatio: null,
        costDragStatus: "ok",
        // L+ additive: costGate
        costGate: {
          status: "unknown",
          roundTripCostPct: 0,
          gridSpacingPct: null,
          requiredMinSpacingPct: 0,
          pass: null,
          warning: null,
          nextAction: "ไม่สามารถคำนวณ cost gate — ดู server logs",
        },
        // L+ additive: edgeDiagnostics
        edgeDiagnostics: {
          status: "unproven",
          closedCycles: 0,
          sampleSizeStatus: "insufficient_data",
          expectancy: null,
          netPnl: null,
          maxDrawdown: null,
          costToGrossProfitRatio: null,
          dominantMode: null,
          dominantRegime: null,
          positiveRegimes: [],
          negativeRegimes: [],
          summary: "Error — ดู server logs",
        },
        // L+ additive: failureReasons
        failureReasons: [],
        totalLossCycles: 0,
        unknownFailurePct: null,
        // L+ additive: noTradeDiagnostics
        paperDataQuality: {
          hasAverageFillPrice: false,
          hasClosedTrades: false,
          hasModeTags: false,
          hasRegimeTags: false,
          hasSessionTags: false,
          hasGridSpacing: false,
          hasCostEstimates: false,
          hasNoTradeReasons: false,
          missingFields: ["averageFillPrice", "closed_trades", "mode_tags", "regime_tags", "gridSpacingPct", "no_trade_reasons"],
          qualityStatus: "insufficient",
          nextActions: ["ไม่สามารถตรวจ paper data quality — ดู server logs"],
        },
        // L+ additive: noTradeDiagnostics
        noTradeDiagnostics: {
          hasNoTradeLogs: false,
          noTradeReasonCoverage: [],
          missingReasons: [
            "data_missing",
            "regime_unclear",
            "cost_too_high",
            "spread_too_high",
            "slippage_too_high",
            "volatility_extreme",
            "funding_risk",
            "news_risk",
            "runtime_audit_critical",
            "cost_exceeds_edge",
            "price_below_grid_lower",
            "price_above_grid_upper",
          ],
          recommendedReasons: [],
          status: "missing",
          nextAction: "ไม่สามารถตรวจ no-trade diagnostics — ดู server logs",
        },
        gridSpacingCheck: {
          spacingPct: null,
          roundTripCostPct: null,
          passes: null,
          note: "Error — ดู server logs",
        },
        noTradeReasons: ["data_missing"],
        noTradeReadiness: "unknown",
        attribution: { byMode: [], byRegime: [], bySession: [] },
        dataAvailableForPnl: false,
        pnlSource: "none",
        warnings: ["paper-performance endpoint error — ดู server logs"],
        nextActions: ["ตรวจ server logs สำหรับ error details"],
        checkedAt: new Date().toISOString(),
      },
      { status: 200 }
    );
  }
}
