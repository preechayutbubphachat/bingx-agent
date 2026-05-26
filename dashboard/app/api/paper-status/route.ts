/**
 * /api/paper-status
 * Phase H-2 — Paper Trading Readiness
 *
 * Read-only endpoint คืน paper trading journal summary
 *
 * Response:
 *   200 OK — เสมอ (ไม่ใช้ 4xx/5xx สำหรับ "no data" state)
 *
 * Status values:
 *   no_paper_trades        — ไม่มีข้อมูล paper trades เลย
 *   waiting_for_paper_signals — มีไฟล์ log แต่ไม่พบ PAPER mode events
 *   paper_mode_disabled    — PAPER_TRADING_ENABLED=false ใน env
 *   has_paper_data         — มีข้อมูล paper events
 *   error                  — unexpected error (จะไม่ throw, คืน ok:false + reason)
 *
 * Safety:
 * - READ ONLY — ไม่เขียนไฟล์
 * - ไม่ call BingX API
 * - ไม่ expose API key / secret / credential
 * - LIVE_TRADING_ENABLED ต้องเป็น false เสมอ
 * - source-of-truth files ไม่ถูกแตะ
 */

import { NextResponse } from "next/server";
import { readPaperJournal } from "@/lib/readPaperJournal";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PAPER_STATUS_VERSION = "1.0.0";

export async function GET() {
  const checkedAt = new Date().toISOString();

  try {
    const summary = await readPaperJournal();

    return NextResponse.json(
      {
        ok: true,
        version: PAPER_STATUS_VERSION,
        checkedAt,

        // execution mode safety (immutable — ห้ามเปลี่ยนโดยไม่มี live migration gate)
        safetyFlags: {
          liveTradingEnabled:
            (process.env.LIVE_TRADING_ENABLED ?? "false").toLowerCase() === "true",
          paperTradingEnabled: process.env.PAPER_TRADING_ENABLED ?? "not_confirmed",
          orderPlacementEnabled:
            (process.env.ENABLE_ORDER_PLACEMENT ?? "false").toLowerCase() === "true",
          productionTradingReady:
            (process.env.PRODUCTION_TRADING_READY ?? "false").toLowerCase() === "true",
        },

        // paper journal summary
        paperJournal: {
          status: summary.status,
          totalPaperEvents: summary.totalPaperEvents,
          totalOrderSimulated: summary.totalOrderSimulated,
          totalOrderFilled: summary.totalOrderFilled,
          totalOrderCanceled: summary.totalOrderCanceled,
          totalOrderRejected: summary.totalOrderRejected,
          openPaperOrders: summary.openPaperOrders,
          lastPaperEventAt: summary.lastPaperEventAt,
          lastPaperEventType: summary.lastPaperEventType,
          lastPaperMode: summary.lastPaperMode,
          paperModeDetected: summary.paperModeDetected,
          auditFilesScanned: summary.auditFilesScanned,
          warnings: summary.warnings,
          // Phase J: additive — recent events for dashboard panel
          recentEvents: summary.recentEvents ?? [],
        },

        // human-readable status
        statusMessage: buildStatusMessage(summary.status),
        isLive: false,
        isPaper: summary.paperModeDetected,
        isMonitorOnly: !summary.paperModeDetected,
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Unknown error in paper-status";

    // log server-side only — ไม่ expose stack trace ไป client
    console.error("[/api/paper-status] Unexpected error:", message);

    return NextResponse.json(
      {
        ok: false,
        version: PAPER_STATUS_VERSION,
        checkedAt,
        safetyFlags: {
          liveTradingEnabled: false,
          paperTradingEnabled: "not_confirmed",
          orderPlacementEnabled: false,
          productionTradingReady: false,
        },
        paperJournal: {
          status: "error" as const,
          totalPaperEvents: 0,
          totalOrderSimulated: 0,
          totalOrderFilled: 0,
          totalOrderCanceled: 0,
          totalOrderRejected: 0,
          openPaperOrders: 0,
          lastPaperEventAt: null,
          lastPaperEventType: null,
          lastPaperMode: null,
          paperModeDetected: false,
          auditFilesScanned: 0,
          warnings: ["Unexpected error — check server logs"],
          recentEvents: [],
        },
        statusMessage: "ไม่สามารถอ่าน paper journal ได้ — ตรวจ server logs",
        isLive: false,
        isPaper: false,
        isMonitorOnly: true,
        error: message,
      },
      { status: 200 } // ใช้ 200 เสมอ เพื่อไม่ให้ reverse proxy หยุด
    );
  }
}

function buildStatusMessage(status: string): string {
  switch (status) {
    case "has_paper_data":
      return "มีข้อมูล Paper Trading — ระบบจำลองการเทรด (ไม่ใช่ Live)";
    case "waiting_for_paper_signals":
      return "Paper Trading พร้อม — รอ signals เข้ามา";
    case "no_paper_trades":
      return "ยังไม่มี Paper Trades — เปิด Paper Trading เพื่อเริ่ม simulate";
    case "paper_mode_disabled":
      return "Paper Trading ปิดอยู่ — ตั้ง PAPER_TRADING_ENABLED=true เพื่อเปิด";
    default:
      return "ไม่สามารถระบุสถานะ Paper Trading ได้";
  }
}
