/**
 * /api/runtime-audit
 * Phase I — Reconcile & Runtime State Audit
 *
 * Read-only endpoint คืน runtime state audit report
 *
 * Response:
 *   200 OK — เสมอ (ไม่ใช้ 4xx/5xx สำหรับ "unhealthy" state)
 *
 * Severity values:
 *   ok       — ไฟล์ทั้งหมด fresh + valid
 *   warning  — มีไฟล์ stale หรือ optional missing
 *   critical — มีไฟล์ missing หรือ invalid ที่สำคัญ
 *
 * Safety:
 * - READ ONLY — ไม่เขียน/แก้/ลบไฟล์ใดเลย
 * - ไม่ call BingX API
 * - ไม่ expose API key / secret / credential
 * - LIVE_TRADING_ENABLED ต้องเป็น false เสมอ
 * - source-of-truth files ไม่ถูกแตะ
 */

import { NextResponse } from "next/server";
import { runRuntimeAudit } from "@/lib/runtimeAudit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const RUNTIME_AUDIT_VERSION = "1.0.0";

/** Sanitize full path — แสดงแค่ 3 ส่วนท้าย เพื่อไม่ expose home dir */
function sanitizePath(p: string): string {
  const parts = p.replace(/\\/g, "/").split("/");
  return parts.slice(-3).join("/");
}

export async function GET() {
  const checkedAt = new Date().toISOString();

  try {
    const report = await runRuntimeAudit();

    // Sanitize file paths ก่อนส่งไป client
    const sanitizedFiles = report.files.map((f) => ({
      ...f,
      expectedPath: sanitizePath(f.expectedPath),
    }));

    return NextResponse.json(
      {
        ok: report.ok,
        version: RUNTIME_AUDIT_VERSION,
        checkedAt: report.checkedAt,
        severity: report.severity,
        readOnly: report.readOnly,

        // Root dir info — sanitized
        rootDir: sanitizePath(report.rootDir),
        rootDirSource: report.rootDirSource,

        // Summary counts
        summary: report.summary,

        // Per-file results (paths sanitized)
        files: sanitizedFiles,

        // Warnings + next actions
        warnings: report.warnings,
        nextActions: report.nextActions,

        // Safety guarantee — always false
        safetyFlags: {
          liveTradingEnabled:
            (process.env.LIVE_TRADING_ENABLED ?? "false").toLowerCase() === "true",
          orderPlacementEnabled:
            (process.env.ENABLE_ORDER_PLACEMENT ?? "false").toLowerCase() === "true",
        },
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Unknown error in runtime-audit";

    // log server-side only — ไม่ expose stack trace ไป client
    console.error("[/api/runtime-audit] Unexpected error:", message);

    return NextResponse.json(
      {
        ok: false,
        version: RUNTIME_AUDIT_VERSION,
        checkedAt,
        severity: "critical" as const,
        readOnly: true,
        rootDir: null,
        rootDirSource: "fallback" as const,
        summary: {
          total: 0,
          ok: 0,
          warning: 0,
          critical: 0,
          missing: 0,
          invalid: 0,
          stale: 0,
        },
        files: [],
        warnings: ["Unexpected error — check server logs"],
        nextActions: ["ตรวจ server logs สำหรับ error details"],
        safetyFlags: {
          liveTradingEnabled: false,
          orderPlacementEnabled: false,
        },
        error: message,
      },
      { status: 200 } // ใช้ 200 เสมอ เพื่อไม่ให้ reverse proxy หยุด
    );
  }
}
