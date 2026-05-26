/**
 * /api/operator-evidence
 * Phase M-0D — Operator Evidence Intake & Approval Status Tracker
 *
 * Returns the operator evidence status report — read-only, no network, no secrets.
 *
 * Safety guarantees:
 * - NO exchange API calls — ไม่เรียก BingX หรือ exchange ใดๆ
 * - READ ONLY — ไม่เขียน / ไม่แก้ / ไม่ลบ ไฟล์ใดเลย
 * - ไม่มี API key / secret ถูกส่งออก — ตรวจ presence เท่านั้น
 * - ok: false เสมอ — readOnly: true เสมอ
 * - default: BLOCKED until all operator evidence is confirmed
 * - ไม่ break /api/health, /api/plan-status, /api/paper-performance
 *
 * Response:
 *   200 OK — always (status field บอก approval state)
 *   500    — only on unexpected exception (safe fallback included)
 */

import { NextResponse } from "next/server";
import {
  evaluateOperatorEvidence,
  type OperatorEvidenceReport,
} from "@/lib/operatorEvidence";
import { computePaperPerformance } from "@/lib/paperPerformance";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const OPERATOR_EVIDENCE_VERSION = "1.0.0";

export async function GET() {
  try {
    // Try to get paper quality — same pattern as health/route.ts
    // Failure here must NOT break the endpoint
    let paperDataQuality: {
      hasAverageFillPrice?: boolean | null;
      hasClosedTrades?: boolean | null;
      qualityStatus?: string | null;
    } | null = null;

    try {
      const perf = await computePaperPerformance();
      paperDataQuality = {
        hasAverageFillPrice: perf.paperDataQuality?.hasAverageFillPrice ?? null,
        hasClosedTrades: perf.paperDataQuality?.hasClosedTrades ?? null,
        qualityStatus: perf.paperDataQuality?.qualityStatus ?? null,
      };
    } catch {
      // paper performance failure must NOT break operator-evidence endpoint
      paperDataQuality = null;
    }

    // Evaluate operator evidence — pure function, no network, no secret values
    const report: OperatorEvidenceReport = evaluateOperatorEvidence({
      paperDataQuality,
    });

    // Build safe response — no secret values, no stack traces
    const body = {
      // Meta
      version: OPERATOR_EVIDENCE_VERSION,
      checkedAt: report.checkedAt,

      // Core status — always ok: false, readOnly: true
      ok: report.ok,
      readOnly: report.readOnly,
      status: report.status,
      phase: report.phase,

      // Evidence items — pass/pending/fail per item (no secret values)
      evidence: report.evidence.map((item) => ({
        id: item.id,
        label: item.label,
        status: item.status,
        required: item.required,
        passed: item.passed,
        source: item.source,
        evidenceRef: item.evidenceRef,
        message: item.message,
        nextAction: item.nextAction,
      })),

      // Summary counts
      summary: report.summary,

      // Operator guidance
      blockers: report.blockers,
      warnings: report.warnings,
      nextActions: report.nextActions,

      // Paper quality used for evidence evaluation (no raw PnL values)
      paperQualityUsed: paperDataQuality
        ? {
            hasAverageFillPrice: paperDataQuality.hasAverageFillPrice,
            hasClosedTrades: paperDataQuality.hasClosedTrades,
            qualityStatus: paperDataQuality.qualityStatus,
          }
        : null,

      // Safety notice — explicit in response
      _notice:
        "Evidence tracker only — no exchange API calls — Phase M-0B remains BLOCKED until all evidence confirmed",
    };

    return NextResponse.json(body, { status: 200 });
  } catch (err: unknown) {
    // Unexpected exception — safe fallback, no stack trace exposed
    const message =
      err instanceof Error
        ? err.message
        : "Unknown error in operator-evidence";

    // Server-side log only
    console.error("[/api/operator-evidence] Unexpected error:", message);

    return NextResponse.json(
      {
        version: OPERATOR_EVIDENCE_VERSION,
        checkedAt: new Date().toISOString(),
        ok: false,
        readOnly: true,
        status: "BLOCKED",
        phase: "M-0D",
        evidence: [],
        summary: {
          total: 0,
          passed: 0,
          pending: 0,
          failed: 0,
          unknown: 0,
          requiredTotal: 0,
          requiredPassed: 0,
        },
        blockers: ["Evidence evaluation failed — ดู server logs"],
        warnings: [],
        nextActions: ["ตรวจ server logs สำหรับ error details"],
        paperQualityUsed: null,
        _notice:
          "Evidence tracker only — no exchange API calls — Phase M-0B remains BLOCKED until all evidence confirmed",
        _error:
          "Evidence evaluation encountered an unexpected error — check server logs",
      },
      { status: 200 }
    );
  }
}
