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

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PAPER_PERFORMANCE_VERSION = "1.1.0";

export async function GET() {
  try {
    const report = await computePaperPerformance();

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
