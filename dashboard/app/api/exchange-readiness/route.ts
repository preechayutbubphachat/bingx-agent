/**
 * /api/exchange-readiness
 * Phase M-0 — Shadow Live / Read-only Exchange Sync Readiness
 *
 * Read-only endpoint คืน exchange readiness report
 *
 * Hard Rules:
 * - ไม่มี network calls ไป BingX หรือ exchange ใดๆ
 * - ไม่มี API key / secret ใน response
 * - ไม่มี order placement / cancel / modify
 * - readOnly: true เสมอ
 * - error ต้องเป็น structured response — ห้าม expose stack trace
 * - backward compatible — เพิ่ม field ได้ แต่ห้ามลบ
 */

import { NextResponse } from "next/server";
import { evaluateExchangeReadiness } from "@/lib/exchangeReadiness";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const report = evaluateExchangeReadiness();

    // Safety: ยืนยันว่า response ไม่มี secret value
    // hasReadonlyApiKey / hasReadonlySecret เป็น boolean เท่านั้น — ไม่ใช่ value จริง
    return NextResponse.json({
      ok: report.ok,
      readOnly: report.readOnly,
      status: report.status,
      shadowLiveEnabled: report.shadowLiveEnabled,
      exchangeReadOnlySyncEnabled: report.exchangeReadOnlySyncEnabled,
      manualApprovalRequired: report.manualApprovalRequired,
      manualApprovalStatus: report.manualApprovalStatus,
      hasReadonlyApiKey: report.hasReadonlyApiKey,
      hasReadonlySecret: report.hasReadonlySecret,
      permissionChecklist: report.permissionChecklist,
      blockers: report.blockers,
      warnings: report.warnings,
      nextActions: report.nextActions,
      checkedAt: report.checkedAt,
      // Explicit safety fields
      noExchangeApiCalls: true,
      noOrderPlacement: true,
      phase: "M-0",
    });
  } catch (err) {
    // Structured error — ห้าม expose stack trace หรือ secret
    const message =
      err instanceof Error ? err.message : "Unknown error in exchange-readiness";
    console.error("[/api/exchange-readiness] Unexpected error:", message);

    return NextResponse.json(
      {
        ok: false,
        readOnly: true,
        status: "BLOCKED",
        shadowLiveEnabled: false,
        exchangeReadOnlySyncEnabled: false,
        manualApprovalRequired: true,
        manualApprovalStatus: "not_approved",
        hasReadonlyApiKey: false,
        hasReadonlySecret: false,
        permissionChecklist: [],
        blockers: ["Exchange readiness check failed — ดู server logs"],
        warnings: [],
        nextActions: ["ตรวจ server logs สำหรับ error details"],
        checkedAt: new Date().toISOString(),
        noExchangeApiCalls: true,
        noOrderPlacement: true,
        phase: "M-0",
        error: "EXCHANGE_READINESS_FAILED",
        message: "Exchange readiness check encountered an unexpected error",
      },
      { status: 200 } // 200 เสมอ — ok field บอกสถานะ
    );
  }
}
